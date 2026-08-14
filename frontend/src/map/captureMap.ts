// 地図キャプチャ実処理（Issue #274・DOM/Leaflet 依存）。
// Leaflet 地図の表示範囲を canvas に描画して PNG（data URL）化する。依存追加なしの
// 自前実装（leaflet-image / html2canvas は未採用: ライセンス・保守性・外部タイルの
// CORS 制約を考慮）。純粋ロジック（投影・タイル範囲・帰属文）は capture.ts を参照。
//
// 正直な失敗処理: タイル読込に失敗したタイルはプレースホルダ描画し、成功したタイルのみ
// 描画する（疑似成功を記録しない・失敗は notes に明記）。canvas が taint された場合
// （外部タイルが CORS 非対応）は toDataURL の SecurityError を捕捉してエラーを返す。

import L from 'leaflet';
import {
  TILE_SIZE,
  buildCaptureCaption,
  metersPerPixel,
  projectLatLng,
  tileUrl,
  visibleTileRange,
  type CaptureOptions,
  type CaptureTileLayer,
  type MapCaptureResult,
} from './capture';

/** キャプチャ対象レイヤ一式（呼び出し側が現在の表示状態から組み立てる）。 */
export interface CaptureLayerSet {
  /** 現在のベースマップ。 */
  base: CaptureTileLayer;
  /** ベースと同系統のタイル（例: 陰影起伏）。表示中のみ指定。 */
  extraTiles?: CaptureTileLayer[];
  /** 画像に含めるハザードタイル（オプトイン時のみ・表示中の flood/sediment）。 */
  hazard?: CaptureTileLayer[];
  /** 表示中のベクタ（道路・水路）ポリライン。 */
  polylines?: { label: string; lines: [number, number][][]; color: string; weight: number; opacity: number }[];
  /** 表示中の検索範囲円。 */
  range?: { lat: number; lon: number; radiusM: number; color: string; weight: number };
  /** 表示中の施設マーカー。 */
  markers?: { lat: number; lon: number; label: string }[];
  /** 表示中だが画像から除外されたレイヤ（理由付き・呼び出し側がライセンス判断して指定）。 */
  excluded?: { label: string; reason: string }[];
  /** 調査地点ピン（常に描画）。 */
  site: { lat: number; lon: number };
}

const TILE_TIMEOUT_MS = 4000;

/** 単一タイルを読込む。失敗・タイムアウト時は null（呼び出し側でプレースホルダ描画）。 */
function loadTileImage(url: string, timeoutMs = TILE_TIMEOUT_MS): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // CORS 非対応サーバーはエラー扱いになる（taint を防ぎ toDataURL を安全に保つ）。
    img.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    img.src = url;
  });
}

/** キャンバスへタイルを描画する。origin は表示領域左上のタイルピクセル座標。 */
function drawTileGrid(
  ctx: CanvasRenderingContext2D,
  layer: CaptureTileLayer,
  zoom: number,
  origin: { x: number; y: number },
  range: { minX: number; maxX: number; minY: number; maxY: number },
  scale: number,
  opacity: number,
  failed: string[],
): void {
  ctx.globalAlpha = opacity;
  for (let ty = range.minY; ty <= range.maxY; ty += 1) {
    for (let tx = range.minX; tx <= range.maxX; tx += 1) {
      const url = tileUrl(layer.urlTemplate, zoom, tx, ty);
      // 同期描画のため読込は await 済み前提（captureMap で事前に並列読込）。
      const img = loadedCache.get(url);
      if (img) {
        const dx = (tx * TILE_SIZE - origin.x) * scale;
        const dy = (ty * TILE_SIZE - origin.y) * scale;
        ctx.drawImage(img, dx, dy, TILE_SIZE * scale, TILE_SIZE * scale);
      } else {
        failed.push(layer.label);
      }
    }
  }
  ctx.globalAlpha = 1;
}

/** 事前読込済みタイルのキャッシュ（drawTileGrid から参照）。 */
const loadedCache = new Map<string, HTMLImageElement>();

/** タイル読込の実行と描画を 1 回のキャプチャ単位で扱うためのコンテキスト。 */
interface CaptureDrawCtx {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  origin: { x: number; y: number };
  scale: number;
}

function pointFor(ctx0: CaptureDrawCtx, lat: number, lon: number): { x: number; y: number } {
  const p = projectLatLng(lat, lon, ctx0.zoom, TILE_SIZE);
  return { x: (p.x - ctx0.origin.x) * ctx0.scale, y: (p.y - ctx0.origin.y) * ctx0.scale };
}

/** Leaflet 地図の表示範囲を PNG 化する。 */
export async function captureMap(
  map: L.Map,
  layers: CaptureLayerSet,
  opts: CaptureOptions = {},
): Promise<MapCaptureResult> {
  const scale = opts.scale ?? 2;
  const container = map.getContainer();
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  const center = map.getCenter();
  const centerLL = { lat: center.lat, lon: center.lng };
  const zoom = Math.round(map.getZoom());

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D コンテキストを取得できません（ブラウザ非対応）');

  // 背景（ベースタイル未読込部分の埋め草）。
  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const origin = projectLatLng(centerLL.lat, centerLL.lon, zoom, TILE_SIZE);
  origin.x -= width / 2;
  origin.y -= height / 2;
  const range = visibleTileRange(centerLL, zoom, width, height, TILE_SIZE);

  // ---- タイル並列読込（ベース・追加・ハザード） ----
  const tileLayers = [layers.base, ...(layers.extraTiles ?? []), ...(layers.hazard ?? [])];
  const tileUrls: string[] = [];
  for (const layer of tileLayers) {
    for (let ty = range.minY; ty <= range.maxY; ty += 1) {
      for (let tx = range.minX; tx <= range.maxX; tx += 1) {
        tileUrls.push(tileUrl(layer.urlTemplate, zoom, tx, ty));
      }
    }
  }
  loadedCache.clear();
  const loaded = await Promise.all(tileUrls.map((u) => loadTileImage(u)));
  tileUrls.forEach((u, i) => {
    if (loaded[i]) loadedCache.set(u, loaded[i] as HTMLImageElement);
  });

  const failedLabels: string[] = [];
  const drawCtx: CaptureDrawCtx = { ctx, zoom, origin, scale };
  drawTileGrid(ctx, layers.base, zoom, origin, range, scale, 1, failedLabels);
  for (const extra of layers.extraTiles ?? []) {
    drawTileGrid(ctx, extra, zoom, origin, range, scale, 0.5, failedLabels);
  }
  for (const hazard of layers.hazard ?? []) {
    drawTileGrid(ctx, hazard, zoom, origin, range, scale, 0.6, failedLabels);
  }

  // ---- ベクタ（道路・水路） ----
  for (const pl of layers.polylines ?? []) {
    ctx.strokeStyle = pl.color;
    ctx.lineWidth = pl.weight * scale;
    ctx.globalAlpha = pl.opacity;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    pl.lines.forEach((line, i) => {
      line.forEach(([lat, lon], j) => {
        const p = pointFor(drawCtx, lat, lon);
        if (i === 0 && j === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
    });
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- 検索範囲円 ----
  if (layers.range) {
    const c = pointFor(drawCtx, layers.range.lat, layers.range.lon);
    const mpp = metersPerPixel(layers.range.lat, zoom, TILE_SIZE);
    const rPx = Math.max(2, layers.range.radiusM / mpp) * scale;
    ctx.strokeStyle = layers.range.color;
    ctx.lineWidth = layers.range.weight * scale;
    ctx.setLineDash([8 * scale, 8 * scale]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ---- 施設マーカー（白ラベル） ----
  for (const m of layers.markers ?? []) {
    const p = pointFor(drawCtx, m.lat, m.lon);
    const label = m.label.length > 18 ? `${m.label.slice(0, 17)}…` : m.label;
    ctx.font = `600 ${10 * scale}px 'IBM Plex Sans JP', sans-serif`;
    const tw = ctx.measureText(label).width;
    const pad = 5 * scale;
    const w = tw + pad * 2;
    const h = 16 * scale;
    ctx.fillStyle = 'rgba(255,255,255,.94)';
    ctx.strokeStyle = '#b5bcc6';
    ctx.lineWidth = 1;
    roundedRectPath(ctx, p.x + 8 * scale, p.y - h / 2, w, h, 4 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#4a5563';
    ctx.fillText(label, p.x + 8 * scale + pad, p.y + 4 * scale);
  }

  // ---- 調査地点ピン ----
  {
    const p = pointFor(drawCtx, layers.site.lat, layers.site.lon);
    const r = 9 * scale;
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r + 2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c5392f';
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // ---- キャプション（出典・取得日時・除外理由） ----
  const included = [
    layers.base.attribution,
    ...(layers.extraTiles ?? []).map((t) => t.attribution),
    ...(layers.hazard ?? []).map((t) => t.attribution),
    ...(layers.polylines ?? []).map((p) => p.label),
    ...(layers.markers ?? []).map(() => 'OSM施設'),
  ];
  const excluded = layers.excluded ?? [];
  const capturedAt = new Date().toISOString();
  const caption = buildCaptureCaption({
    baseLabel: layers.base.label,
    included: [...new Set(included)],
    excludedLabels: excluded.map((e) => e.label),
    capturedAt,
  });

  drawCaption(ctx, caption, canvas.width, scale);

  const notes: string[] = [];
  const failedUnique = [...new Set(failedLabels)];
  if (failedUnique.length > 0) {
    notes.push(`一部タイルを取得できませんでした（${failedUnique.join(' / ')}）。画像は取得済みタイルのみで構成しています。`);
  }
  if ((layers.hazard ?? []).length > 0) {
    notes.push(
      'ハザードレイヤはハザードマップポータルのタイルをキャプチャしたものです。保存・再配布の可否はレイヤごとの利用条件に依存するため、外部共有前に docs/data-license-ledger.md で個別確認してください。',
    );
  }
  for (const ex of excluded) {
    notes.push(`画像除外: ${ex.label}（${ex.reason}）`);
  }
  notes.push('ベース地図は地理院タイルを出典明示の上でキャプチャしたものです（国土地理院コンテンツ利用規約の確認対象）。');

  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL('image/png');
  } catch {
    throw new Error('地図画像を生成できませんでした（外部タイルの CORS 制約によりキャンバスが保護されています）');
  }

  return {
    dataUrl,
    width,
    height,
    center: centerLL,
    zoom,
    baseLayerLabel: layers.base.label,
    includedLayers: [...new Set(included)],
    excludedLayers: excluded,
    capturedAt,
    attribution: caption,
    notes,
  };
}

/** 角丸矩形パス（roundRect はブラウザ互換性のため自前実装）。 */
function roundedRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 画像下部に帰属キャプションを半透明バーで描画する（PNG 単体でも出典が残る）。 */
function drawCaption(ctx: CanvasRenderingContext2D, caption: string, canvasWidth: number, scale: number): void {
  const font = `10px 'IBM Plex Sans JP', sans-serif`;
  ctx.font = font;
  const pad = 8 * scale;
  const lineH = 13 * scale;
  // 折返し計算（近似: 文字数ベースで width に収まるよう分割）。
  const maxWidth = canvasWidth - pad * 2;
  const words = caption.split(' / ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} / ${w}` : w;
    if (ctx.measureText(trial).width <= maxWidth || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);

  const barH = lines.length * lineH + pad * 2;
  ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillRect(0, ctx.canvas.height - barH, ctx.canvas.width, barH);
  ctx.fillStyle = '#4a5563';
  ctx.font = font;
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, ctx.canvas.height - barH + pad + lineH * (i + 0.8));
  });
}
