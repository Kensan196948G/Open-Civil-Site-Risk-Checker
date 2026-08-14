// 候補地比較（SCR-010・Issue #175）の地図表示用データ変換（純粋ロジック・DOM 非依存）。
// CompareRow（比較行）から CompareMap に渡す地点リストを組み立てる。

import type { CompareRow } from '../report/compare';

export interface CompareMapPoint {
  /** 案件 ID。 */
  id: string;
  /** 表示名（比較表の名前）。 */
  name: string;
  lat: number;
  lon: number;
  /** 検索半径[m]（地図上の範囲円に使う）。 */
  radius: number;
  /** 選択順（1 始まり）。マーカー番号に使う。 */
  rank: number;
}

/** 比較行 → 地図地点リスト（選択順を保持・住所ラベルは使わない）。 */
export function toCompareMapPoints(rows: CompareRow[]): CompareMapPoint[] {
  return rows.map((r, i) => ({
    id: r.caseId,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    radius: r.radius,
    rank: i + 1,
  }));
}

/** 地点の表示ラベル（例: 「1. 候補地A（霞が関2丁目）」）。名前が無い場合は番号のみ。 */
export function comparePointLabel(p: CompareMapPoint): string {
  return p.name ? `${p.rank}. ${p.name}` : `${p.rank}. 地点${p.rank}`;
}
