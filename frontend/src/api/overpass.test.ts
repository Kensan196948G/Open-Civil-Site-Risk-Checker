// Overpass アダプタの最寄り地点計算（評価書 #10・方位表示の根拠）のテスト。
// node（lat/lon）・center・geometry（way）の各形状で最寄り地点 { d, lat, lon } を
// 正しく返すこと、座標を持たない要素は null を返すことを検証する。

import { describe, expect, it } from 'vitest';
import { nearestPointOf } from './overpass';

const BASE = { lat: 35.6745, lon: 139.7503 };

describe('nearestPointOf', () => {
  it('node（lat/lon 直持ち）の場合は自身を最寄り地点として返す', () => {
    const el = { type: 'node' as const, id: 1, lat: 35.6745, lon: 139.7503, tags: { amenity: 'school' } };
    const n = nearestPointOf(el, BASE.lat, BASE.lon);
    expect(n).not.toBeNull();
    expect(n!.d).toBeCloseTo(0, 6);
    expect(n!.lat).toBeCloseTo(35.6745, 6);
  });

  it('way（geometry）の場合は最寄り頂点を選ぶ', () => {
    const far = { lat: 35.70, lon: 139.75 };
    const near = { lat: 35.6745 + 0.001, lon: 139.7503 };
    const el = {
      type: 'way' as const,
      id: 2,
      geometry: [far, near],
      tags: { highway: 'primary' },
    };
    const n = nearestPointOf(el, BASE.lat, BASE.lon);
    expect(n).not.toBeNull();
    // 近い頂点（緯度 +0.001 ≈ 111m）が選ばれる
    expect(n!.d).toBeGreaterThan(90);
    expect(n!.d).toBeLessThan(130);
    expect(n!.lat).toBeCloseTo(near.lat, 6);
  });

  it('center のみの要素は center を最寄り地点として返す', () => {
    const el = { type: 'relation' as const, id: 3, center: { lat: 35.6746, lon: 139.7504 } };
    const n = nearestPointOf(el, BASE.lat, BASE.lon);
    expect(n).not.toBeNull();
    expect(n!.d).toBeLessThan(50);
  });

  it('座標情報のない要素は null を返す', () => {
    const el = { type: 'way' as const, id: 4 };
    expect(nearestPointOf(el, BASE.lat, BASE.lon)).toBeNull();
  });

  it('geometry と center の両方がある場合は最寄りの方を選ぶ', () => {
    const el = {
      type: 'way' as const,
      id: 5,
      geometry: [{ lat: 35.68, lon: 139.75 }],
      center: { lat: 35.6745, lon: 139.7503 },
      tags: { waterway: 'river' },
    };
    const n = nearestPointOf(el, BASE.lat, BASE.lon);
    expect(n).not.toBeNull();
    expect(n!.d).toBeCloseTo(0, 6);
    expect(n!.lat).toBeCloseTo(35.6745, 6);
  });
});
