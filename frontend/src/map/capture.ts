// 地図キャプチャの純粋ロジック（Issue #274・DOM/Leaflet 非依存・単体テスト対象）。
// Web メルカトル（EPSG:3857・Leaflet と同一）の投影・タイル範囲計算・帰属/ライセンス文の
// 組み立てを提供する。実際の canvas 描画は captureMap.ts（captureMap(map, layers, opts)）が
// 行い、本モジュールの関数を利用する。
//
// ライセンス方針（docs/data-license-ledger.md 準拠）:
//  - ベースタイル（地理院タイル）・陰影起伏は出典明示の上でキャプチャに含める。
//  - ハザードタイル（ハザードマップポータル）は「画像の保存・再配布はレイヤごとに個別確認」
//    のため、デフォルトでは画像に含めず、利用者が明示的にオプトインした場合のみ含める。

import type { BaseLayer } from '../types';

export const TILE_SIZE = 256;

/** キャプチャ対象のタイルレイヤ記述（SiteMap と共通化した単一の出所）。 */
export interface CaptureTileLayer {
  key: string;
  /** 表示名（画像キャプション・調査パックにそのまま出る）。 */
  label: string;
  /** タイル URL テンプレート（{z}/{x}/{y} プレースホルダ）。 */
  urlTemplate: string;
  /** 出典表記。 */
  attribution: string;
}

/** キャプチャオプション。 */
export interface CaptureOptions {
  /** 出力倍率（印刷用 2x 推奨）。既定 2。 */
  scale?: number;
  /** ハザードタイル（洪水浸水想定・土砂災害）を画像に含めるか。既定 false（ライセンス考慮）。 */
  includeHazardLayers?: boolean;
}

/** キャプチャ結果（調査パックへ同梱するメタデータ付き）。 */
export interface MapCaptureResult {
  /** data:image/png;base64,... */
  dataUrl: string;
  /** 論理幅 [px]（scale 適用前の地図コンテナサイズ）。 */
  width: number;
  /** 論理高さ [px]。 */
  height: number;
  center: { lat: number; lon: number };
  zoom: number;
  baseLayerLabel: string;
  /** 実際に画像へ描画されたレイヤのラベル（帰属明示の対象）。 */
  includedLayers: string[];
  /** 表示中だが画像から除外されたレイヤ（理由付き・ライセンス考慮の可視化）。 */
  excludedLayers: { label: string; reason: string }[];
  /** キャプチャ日時（ISO 8601）。 */
  capturedAt: string;
  /** 画像キャプション・調査パック用の帰属/ライセンス文。 */
  attribution: string;
  /** 補足注記（タイル取得失敗・ハザードオプトイン等・正直な記録）。 */
  notes: string[];
}

/** ベースマップ（地理院タイル）。SiteMap と共用し URL を二重管理しない。 */
export const BASE_TILE_LAYERS: Record<BaseLayer, CaptureTileLayer> = {
  pale: { key: 'base', label: '地理院タイル（淡色）', urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png', attribution: '地理院タイル' },
  std: { key: 'base', label: '地理院タイル（標準）', urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', attribution: '地理院タイル' },
  photo: { key: 'base', label: '地理院タイル（空中写真）', urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', attribution: '地理院タイル(シームレス空中写真)' },
};

/** 陰影起伏（地理院タイル・ベースと同系統の利用条件）。 */
export const HILLSHADE_TILE_LAYER: CaptureTileLayer = {
  key: 'hillshade',
  label: '陰影起伏',
  urlTemplate: 'https://cyberjapandata.gsi.go.jp/xyz/hillshademap/{z}/{x}/{y}.png',
  attribution: '地理院タイル(陰影起伏図)',
};

/** ハザードタイル（ハザードマップポータル・保存/再配布はレイヤごとに個別確認）。 */
export const HAZARD_TILE_LAYERS: CaptureTileLayer[] = [
  { key: 'flood', label: '洪水浸水想定', urlTemplate: 'https://disaportaldata.gsi.go.jp/raster/01_flood_l2_shinsuishin_data/{z}/{x}/{y}.png', attribution: 'ハザードマップポータルサイト' },
  { key: 'sediment', label: '土砂災害', urlTemplate: 'https://disaportaldata.gsi.go.jp/raster/05_dosekiryukeikaikuiki/{z}/{x}/{y}.png', attribution: 'ハザードマップポータルサイト' },
];

/** ハザードレイヤ除外理由（data-license-ledger 由来・画像に含めない場合の明示）。 */
export const HAZARD_EXCLUSION_REASON =
  '保存・再配布の利用条件がレイヤごとに異なるため画像には含めません（docs/data-license-ledger.md）';

/** ハザードレイヤを含めた場合の注意文。 */
export const HAZARD_INCLUSION_NOTE =
  'ハザードレイヤはハザードマップポータルのタイルをキャプチャしたものです。保存・再配布の可否はレイヤごとの利用条件に依存するため、外部共有前に docs/data-license-ledger.md で個別確認してください。';

/** ベースタイル（地理院）の保存・加工に関する注意文（国土地理院コンテンツ利用規約）。 */
export const GSI_CAPTURE_NOTE =
  'ベース地図は地理院タイルを出典明示の上でキャプチャしたものです。複製・加工・外部提供の可否は国土地理院コンテンツ利用規約（測量法上の申請要否を含む）をご確認ください。';

/** Web メルカトルで lat/lon → タイルピクセル座標（zoom 基準・タイル原点=左上）。 */
export function projectLatLng(lat: number, lon: number, zoom: number, tileSize = TILE_SIZE): { x: number; y: number } {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n * tileSize;
  const latRad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * tileSize;
  return { x, y };
}

/** 中心座標と表示ピクセルサイズから、表示に必要なタイル範囲（zoom 固定・地球範囲でクランプ）を返す。 */
export function visibleTileRange(
  center: { lat: number; lon: number },
  zoom: number,
  pxWidth: number,
  pxHeight: number,
  tileSize = TILE_SIZE,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const c = projectLatLng(center.lat, center.lon, zoom, tileSize);
  const n = 2 ** zoom;
  return {
    minX: Math.max(0, Math.floor((c.x - pxWidth / 2) / tileSize)),
    maxX: Math.min(n - 1, Math.floor((c.x + pxWidth / 2) / tileSize)),
    minY: Math.max(0, Math.floor((c.y - pxHeight / 2) / tileSize)),
    maxY: Math.min(n - 1, Math.floor((c.y + pxHeight / 2) / tileSize)),
  };
}

/** タイル URL テンプレートから実 URL を組み立てる。 */
export function tileUrl(template: string, z: number, x: number, y: number): string {
  return template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
}

/** 緯度における 1 ピクセルあたりのメートル数（zoom・tileSize 基準）。 */
export function metersPerPixel(lat: number, zoom: number, tileSize = TILE_SIZE): number {
  const latRad = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return (40075016.686 * Math.cos(latRad)) / (2 ** zoom * tileSize);
}

/** キャプチャの帰属キャプション文を組み立てる（画像下部・調査パック両用・短い表記）。 */
export function buildCaptureCaption(opts: {
  baseLabel: string;
  included: string[];
  excludedLabels: string[];
  capturedAt: string;
}): string {
  const parts = [`地図: ${opts.baseLabel}`, ...opts.included, `取得: ${opts.capturedAt}`];
  const excludedTxt = opts.excludedLabels.length > 0 ? ` / 除外: ${opts.excludedLabels.join(' / ')}（利用条件確認が必要）` : '';
  return parts.join(' / ') + excludedTxt;
}

/** ISO 8601 日時をローカル時刻 'YYYY-MM-DD HH:MM:SS' に整形する（表示用・JST 等の環境時刻）。 */
export function formatLocalStamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
