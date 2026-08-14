import { describe, it, expect } from 'vitest';
import { haversine, bbox, initialBearing, bearingLabel16 } from './geo';

describe('haversine', () => {
  it('同一地点の距離は 0', () => {
    expect(haversine(35.6745, 139.7503, 35.6745, 139.7503)).toBe(0);
  });

  it('緯度1度の差は約111.2km（許容±0.5km）', () => {
    const d = haversine(0, 0, 1, 0);
    expect(d).toBeGreaterThan(110_700);
    expect(d).toBeLessThan(111_700);
  });

  it('距離は対称（A→B と B→A が一致）', () => {
    const ab = haversine(35.0, 139.0, 36.0, 140.0);
    const ba = haversine(36.0, 140.0, 35.0, 139.0);
    expect(ab).toBeCloseTo(ba, 6);
  });

  it('近接2点（約100m）を妥当な範囲で算出', () => {
    // 緯度方向 0.0009度 ≈ 100m
    const d = haversine(35.6745, 139.7503, 35.6745 + 0.0009, 139.7503);
    expect(d).toBeGreaterThan(90);
    expect(d).toBeLessThan(110);
  });
});

describe('bbox', () => {
  it('south,west,north,east の4要素を返し中心を内包する', () => {
    const lat = 35.6745;
    const lon = 139.7503;
    const parts = bbox(lat, lon, 500).split(',').map(Number);
    expect(parts).toHaveLength(4);
    const [s, w, n, e] = parts;
    expect(s).toBeLessThan(lat);
    expect(n).toBeGreaterThan(lat);
    expect(w).toBeLessThan(lon);
    expect(e).toBeGreaterThan(lon);
  });

  it('半径が大きいほど bbox は広くなる', () => {
    const small = bbox(35.6745, 139.7503, 250).split(',').map(Number);
    const large = bbox(35.6745, 139.7503, 1000).split(',').map(Number);
    const smallSpan = small[2] - small[0];
    const largeSpan = large[2] - large[0];
    expect(largeSpan).toBeGreaterThan(smallSpan);
  });
});

describe('initialBearing（初期方位角）', () => {
  it('真北（同経度・北方向）は 0 度', () => {
    expect(initialBearing(35.0, 139.0, 36.0, 139.0)).toBeCloseTo(0, 4);
  });

  it('真東（同緯度・東方向）は約 90 度（緯線収束のため ±1 度で許容）', () => {
    const b = initialBearing(35.0, 139.0, 35.0, 140.0);
    expect(b).toBeGreaterThan(89);
    expect(b).toBeLessThan(91);
  });

  it('真南は 180 度・真西は約 270 度（±1 度で許容）', () => {
    expect(initialBearing(35.0, 139.0, 34.0, 139.0)).toBeCloseTo(180, 4);
    const w = initialBearing(35.0, 139.0, 35.0, 138.0);
    expect(w).toBeGreaterThan(269);
    expect(w).toBeLessThan(271);
  });

  it('0〜360 の範囲に正規化される（負値・360以上も可）', () => {
    const b = initialBearing(35.0, 139.0, 35.5, 139.1);
    expect(b).toBeGreaterThanOrEqual(0);
    expect(b).toBeLessThan(360);
  });

  it('東京から北東方向（仙台付近）は 0〜45 度の範囲', () => {
    const b = initialBearing(35.68, 139.77, 38.27, 140.87);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(45);
  });
});

describe('bearingLabel16（16方位）', () => {
  it('主方位の境界を正しくラベル化する', () => {
    expect(bearingLabel16(0)).toBe('北');
    expect(bearingLabel16(90)).toBe('東');
    expect(bearingLabel16(180)).toBe('南');
    expect(bearingLabel16(270)).toBe('西');
  });

  it('中間方位も16方位で表現される', () => {
    expect(bearingLabel16(22.5)).toBe('北北東');
    expect(bearingLabel16(45)).toBe('北東');
    expect(bearingLabel16(135)).toBe('南東');
    expect(bearingLabel16(315)).toBe('北西');
  });

  it('負値・360度以上も正規化してラベル化する', () => {
    expect(bearingLabel16(-90)).toBe('西');
    expect(bearingLabel16(360)).toBe('北');
    expect(bearingLabel16(405)).toBe('北東');
  });
});
