// 地理計算ヘルパ。WGS84 を標準とする（要件 NFR-501）。

const R = 6371000; // 地球半径[m]

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** 2点間の大円距離[m]（Haversine）。 */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 中心点と半径[m]から Overpass の bbox 文字列 (south,west,north,east) を作る。 */
export function bbox(lat: number, lon: number, radius: number): string {
  const dLat = (radius / R) * (180 / Math.PI);
  const dLon = (radius / (R * Math.cos(toRad(lat)))) * (180 / Math.PI);
  const s = lat - dLat;
  const n = lat + dLat;
  const w = lon - dLon;
  const e = lon + dLon;
  return `${s},${w},${n},${e}`;
}

/** 2点間の初期方位角[度]（0=北・時計回り・0〜360）。WGS84 楕円体の近似（球面）で十分。 */
export function initialBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

/** 16方位の日本語ラベル（北を 0 として時計回り）。 */
export const BEARING_16 = [
  '北',
  '北北東',
  '北東',
  '東北東',
  '東',
  '東南東',
  '南東',
  '南南東',
  '南',
  '南南西',
  '南西',
  '西南西',
  '西',
  '西北西',
  '北西',
  '北北西',
] as const;

/** 方位角[度]を16方位の日本語ラベルへ変換する（境界は各22.5°・丸め）。 */
export function bearingLabel16(deg: number): string {
  const normalized = ((deg % 360) + 360) % 360;
  const idx = Math.round(normalized / 22.5) % 16;
  return BEARING_16[idx];
}
