import type { CaseStatus, Category, FindingStatus, Priority, SourceKey, Theme } from '../types';

// デザインモックの PRIO / STATUS / カテゴリラベル等を定数として集約。
// 色や文言を1か所に集めることで、断定表現の禁止（要件 §3.2）を一元管理できる。
// 意味色（優先度・状態）はテーマ別パレットを持ち、getPrio(theme) 等で解決する。

export interface PrioMeta {
  name: string;
  color: string;
  bg: string;
}

const PRIO_LIGHT: Record<Priority, PrioMeta> = {
  A: { name: '専門確認優先', color: '#c0392b', bg: '#f7e7e4' },
  B: { name: '追加確認推奨', color: '#bf7d1c', bg: '#f8efdc' },
  C: { name: '参考情報あり', color: '#2563a8', bg: '#e6eef9' },
  D: { name: 'データ不足', color: '#7b8494', bg: '#eef0f3' },
};
const PRIO_DARK: Record<Priority, PrioMeta> = {
  A: { name: '専門確認優先', color: '#ef8c7d', bg: '#3a201c' },
  B: { name: '追加確認推奨', color: '#e0ab55', bg: '#372c14' },
  C: { name: '参考情報あり', color: '#6fa8e0', bg: '#1a2a3f' },
  D: { name: 'データ不足', color: '#9aa6b5', bg: '#222e3c' },
};

/** 確認優先度パレット（要件 §9.2）。テーマで色が変わる。 */
export function getPrio(theme: Theme): Record<Priority, PrioMeta> {
  return theme === 'dark' ? PRIO_DARK : PRIO_LIGHT;
}

/** 後方互換用のライト既定パレット（テーマ非依存な集計表示などで使用）。 */
export const PRIO = PRIO_LIGHT;

export interface StatusMeta {
  label: string;
  color: string;
  bg: string;
}

const STATUS_LIGHT: Record<FindingStatus, StatusMeta> = {
  found: { label: '該当あり', color: '#2f6f4f', bg: '#e3f0e8' },
  not_found: { label: '該当なし', color: '#5a6472', bg: '#eef0f3' },
  no_data: { label: 'データ未取得', color: '#8a6d1f', bg: '#f6efd9' },
  failed: { label: '取得失敗', color: '#b23b3b', bg: '#f7e6e6' },
};
const STATUS_DARK: Record<FindingStatus, StatusMeta> = {
  found: { label: '該当あり', color: '#5fc08c', bg: '#16301f' },
  not_found: { label: '該当なし', color: '#9aa6b5', bg: '#222e3c' },
  no_data: { label: 'データ未取得', color: '#d6b15a', bg: '#2e2613' },
  failed: { label: '取得失敗', color: '#e8897e', bg: '#331a1a' },
};

/** 確認項目の状態パレット。「該当なし」と「データ未取得」を別ラベルで明示（要件 FR-304）。 */
export function getStatus(theme: Theme): Record<FindingStatus, StatusMeta> {
  return theme === 'dark' ? STATUS_DARK : STATUS_LIGHT;
}
export const STATUS = STATUS_LIGHT;

const CASE_STATUS_LIGHT: Record<CaseStatus, StatusMeta> = {
  done: { label: '完了', color: '#2f6f4f', bg: '#e3f0e8' },
  progress: { label: '確認中', color: '#15616d', bg: '#e6f0f1' },
  review: { label: '要確認', color: '#bf7d1c', bg: '#f8efdc' },
  draft: { label: '下書き', color: '#7b8494', bg: '#eef0f3' },
};
const CASE_STATUS_DARK: Record<CaseStatus, StatusMeta> = {
  done: { label: '完了', color: '#5fc08c', bg: '#16301f' },
  progress: { label: '確認中', color: '#4fc3d4', bg: '#12303a' },
  review: { label: '要確認', color: '#e0ab55', bg: '#372c14' },
  draft: { label: '下書き', color: '#9aa6b5', bg: '#222e3c' },
};

/** 案件状態パレット（ダッシュボード SCR-000）。 */
export function getCaseStatus(theme: Theme): Record<CaseStatus, StatusMeta> {
  return theme === 'dark' ? CASE_STATUS_DARK : CASE_STATUS_LIGHT;
}

/** カテゴリ → 日本語ラベル。 */
export const CATEGORY_LABEL: Record<Category, string> = {
  roads: '周辺道路',
  rivers: '河川・水域',
  hazard: '災害関連',
  terrain: '地形',
  weather: '気象',
  facilities: '周辺施設',
  data_quality: 'データ品質',
};

/** データソースキー → 短縮名（チップ・出典表示用）。 */
export const SOURCE_SHORT: Record<SourceKey, string> = {
  nominatim: 'Nominatim',
  osm_overpass: 'Overpass',
  open_meteo: 'Open-Meteo',
  ksj: '国土数値情報',
  hazard_portal: 'ハザードマップ',
  gsi_tile: '地理院タイル',
  plateau: 'PLATEAU',
  xroad: 'xROAD',
};

export const RADIUS_OPTIONS = [100, 250, 500, 1000, 3000] as const;

/** 入力画面のカテゴリ選択肢（表示順はデザイン準拠）。 */
export const CATEGORY_OPTIONS: [Exclude<Category, 'data_quality'>, string][] = [
  ['hazard', '災害関連'],
  ['rivers', '河川・水域'],
  ['roads', '周辺道路'],
  ['terrain', '地形'],
  ['weather', '気象'],
  ['facilities', '周辺施設'],
];

/** サンプル地点（霞が関）。要件 §16.2 のサンプル地点に対応。 */
export const SAMPLE = {
  address: '東京都千代田区霞が関2丁目1番3号',
  lat: 35.6745,
  lon: 139.7503,
} as const;

export function radiusLabel(r: number): string {
  return r >= 1000 ? `${r / 1000}km` : `${r}m`;
}

export function distanceLabel(distance_m: number | null, intersects?: boolean): string | null {
  if (distance_m != null) return `約${Math.round(distance_m)}m`;
  if (intersects) return '重なりあり';
  return null;
}
