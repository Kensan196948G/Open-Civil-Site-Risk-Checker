// 地図キャプチャの純粋ロジック（Issue #274）のテスト。
// DOM/Leaflet 非依存の投影・タイル範囲・帰属文・定数（ライセンス方針）を検証する。

import { describe, expect, it } from 'vitest';
import {
  BASE_TILE_LAYERS,
  GSI_CAPTURE_NOTE,
  HAZARD_EXCLUSION_REASON,
  HAZARD_INCLUSION_NOTE,
  HAZARD_TILE_LAYERS,
  HILLSHADE_TILE_LAYER,
  TILE_SIZE,
  buildCaptureCaption,
  formatLocalStamp,
  metersPerPixel,
  projectLatLng,
  tileUrl,
  visibleTileRange,
} from './capture';

describe('projectLatLng（Web メルカトル投影）', () => {
  it('zoom 0 では緯度 0/経度 0 がタイル中心（128,128）になる', () => {
    const p = projectLatLng(0, 0, 0, TILE_SIZE);
    expect(p.x).toBeCloseTo(128, 6);
    expect(p.y).toBeCloseTo(128, 6);
  });

  it('zoom 1 では経度 0 が x=256、東経 90 が x=384 になる', () => {
    const p = projectLatLng(0, 0, 1, TILE_SIZE);
    expect(p.x).toBeCloseTo(256, 6);
    const east = projectLatLng(0, 90, 1, TILE_SIZE);
    expect(east.x).toBeCloseTo(384, 6);
  });

  it('緯度 ±85.05112878 でクランプされ、北端で y=0 / 南端で y=512（zoom1）になる', () => {
    const north = projectLatLng(90, 0, 1, TILE_SIZE);
    expect(north.y).toBeCloseTo(0, 4);
    const south = projectLatLng(-90, 0, 1, TILE_SIZE);
    expect(south.y).toBeCloseTo(512, 4);
  });

  it('東京付近の座標が zoom 16 で正のタイルピクセル座標になる', () => {
    const p = projectLatLng(35.6745, 139.7524, 16, TILE_SIZE);
    expect(p.x).toBeGreaterThan(0);
    expect(p.y).toBeGreaterThan(0);
    // x は経度 0 の 2^16 * 128 より東（大きい）
    expect(p.x).toBeGreaterThan(2 ** 16 * 128);
  });
});

describe('visibleTileRange（表示タイル範囲）', () => {
  it('中心タイルを含み、画面サイズから必要な範囲を返す', () => {
    const center = { lat: 35.6745, lon: 139.7524 };
    const zoom = 16;
    const r = visibleTileRange(center, zoom, 800, 600, TILE_SIZE);
    const c = projectLatLng(center.lat, center.lon, zoom, TILE_SIZE);
    const centerTileX = Math.floor(c.x / TILE_SIZE);
    const centerTileY = Math.floor(c.y / TILE_SIZE);
    expect(r.minX).toBeLessThanOrEqual(centerTileX);
    expect(r.maxX).toBeGreaterThanOrEqual(centerTileX);
    expect(r.minY).toBeLessThanOrEqual(centerTileY);
    expect(r.maxY).toBeGreaterThanOrEqual(centerTileY);
    // 800px 幅 → 約 3〜4 タイル、600px 高 → 約 2〜3 タイル
    expect(r.maxX - r.minX).toBeGreaterThanOrEqual(2);
    expect(r.maxY - r.minY).toBeGreaterThanOrEqual(2);
  });

  it('地球範囲（0〜2^zoom-1）でクランプされる', () => {
    const r = visibleTileRange({ lat: 0, lon: 179.9999 }, 2, 2000, 2000, TILE_SIZE);
    expect(r.maxX).toBeLessThanOrEqual(2 ** 2 - 1);
    const r2 = visibleTileRange({ lat: 0, lon: -179.9999 }, 2, 2000, 2000, TILE_SIZE);
    expect(r2.minX).toBeGreaterThanOrEqual(0);
  });
});

describe('tileUrl', () => {
  it('{z}/{x}/{y} プレースホルダを実座標へ置換する', () => {
    expect(tileUrl('https://example/{z}/{x}/{y}.png', 16, 30000, 20000)).toBe('https://example/16/30000/20000.png');
  });
});

describe('metersPerPixel', () => {
  it('zoom が上がると 1 ピクセルあたりの距離が小さくなる', () => {
    const z15 = metersPerPixel(35, 15, TILE_SIZE);
    const z16 = metersPerPixel(35, 16, TILE_SIZE);
    expect(z16).toBeCloseTo(z15 / 2, 6);
    expect(z15).toBeGreaterThan(z16);
  });
});

describe('buildCaptureCaption（帰属キャプション）', () => {
  it('ベース・含むレイヤ・取得日時を列挙する', () => {
    const cap = buildCaptureCaption({
      baseLabel: '地理院タイル（淡色）',
      included: ['地理院タイル', 'OSM道路'],
      excludedLabels: [],
      capturedAt: '2026-08-15T10:00:00.000Z',
    });
    expect(cap).toContain('地図: 地理院タイル（淡色）');
    expect(cap).toContain('OSM道路');
    expect(cap).toContain('取得: 2026-08-15T10:00:00.000Z');
    expect(cap).not.toContain('除外');
  });

  it('除外レイヤがある場合は短い注記を付ける', () => {
    const cap = buildCaptureCaption({
      baseLabel: '地理院タイル（淡色）',
      included: ['地理院タイル'],
      excludedLabels: ['洪水浸水想定', '土砂災害'],
      capturedAt: '2026-08-15T10:00:00.000Z',
    });
    expect(cap).toContain('除外: 洪水浸水想定 / 土砂災害（利用条件確認が必要）');
  });
});

describe('formatLocalStamp（取得日時のローカル表記）', () => {
  it('ISO 日時を YYYY-MM-DD HH:MM:SS 形式に整形する', () => {
    const s = formatLocalStamp('2026-08-15T04:00:00.000Z');
    // smoke shim 互換のため toMatch は使わず、長さと区切り位置で検証する。
    expect(s).toHaveLength(19);
    expect(s[4]).toBe('-');
    expect(s[7]).toBe('-');
    expect(s[10]).toBe(' ');
    expect(s[13]).toBe(':');
    expect(s[16]).toBe(':');
  });

  it('無効な日時は入力値をそのまま返す', () => {
    expect(formatLocalStamp('not-a-date')).toBe('not-a-date');
  });
});

describe('ライセンス方針の定数（docs/data-license-ledger.md 準拠）', () => {
  it('ハザードレイヤはデフォルト画像除外の対象である（個別確認が必要）', () => {
    expect(HAZARD_EXCLUSION_REASON).toContain('レイヤごとに異なる');
    expect(HAZARD_EXCLUSION_REASON).toContain('docs/data-license-ledger.md');
  });

  it('ハザードを含める場合の注意文が定義されている', () => {
    expect(HAZARD_INCLUSION_NOTE).toContain('保存・再配布の可否はレイヤごとの利用条件に依存');
  });

  it('ベースタイル（地理院）の保存・加工に関する注意文が定義されている', () => {
    expect(GSI_CAPTURE_NOTE).toContain('国土地理院コンテンツ利用規約');
  });

  it('タイル定義が SiteMap と共用できる一意のキー・URL・出典を持つ', () => {
    // ベース3種は同一キー 'base'（BaseLayer 型で識別）のため、ハザード/陰影のキー一意性を検証する。
    const hazardKeys = HAZARD_TILE_LAYERS.map((t) => t.key);
    expect(new Set(hazardKeys).size).toBe(hazardKeys.length);
    const all = [...Object.values(BASE_TILE_LAYERS), HILLSHADE_TILE_LAYER, ...HAZARD_TILE_LAYERS];
    for (const t of all) {
      expect(t.urlTemplate).toContain('{z}');
      expect(t.urlTemplate).toContain('{x}');
      expect(t.urlTemplate).toContain('{y}');
      expect(t.attribution.length).toBeGreaterThan(0);
    }
    expect(Object.keys(BASE_TILE_LAYERS)).toEqual(['pale', 'std', 'photo']);
  });
});
