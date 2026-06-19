import { describe, it, expect } from 'vitest';
import { haversine, bbox } from './geo';

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
