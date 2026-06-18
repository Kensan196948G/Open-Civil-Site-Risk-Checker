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
