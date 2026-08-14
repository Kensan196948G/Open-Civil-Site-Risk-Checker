// ============================================================================
//  ドメイン型定義
//  デザインモック（Site Risk Checker.dc.html）の DCLogic 内データ構造を
//  TypeScript の型として正規化したもの。要件定義 §9 / §14 に対応する。
// ============================================================================

/** 確認優先度。リスクレベルではなく「確認すべき度合い」を表す（要件 §9.2）。
 *  D は「リスクが低い」ではなく「判断材料が不足」を意味する。 */
export type Priority = 'A' | 'B' | 'C' | 'D';

/** 確認カテゴリ（要件 §9.1）。data_quality は取得失敗・未連携を扱う。 */
export type Category =
  | 'roads'
  | 'rivers'
  | 'hazard'
  | 'terrain'
  | 'weather'
  | 'facilities'
  | 'data_quality';

/** 確認項目の状態。「該当なし」と「データ未取得」を必ず区別する（要件 FR-304 / NFR-504）。 */
export type FindingStatus = 'found' | 'not_found' | 'no_data' | 'failed';

/** データソースの識別キー。 */
export type SourceKey =
  | 'nominatim'
  | 'osm_overpass'
  | 'open_meteo'
  | 'ksj'
  | 'hazard_portal'
  | 'gsi_tile'
  | 'plateau'
  | 'xroad'
  | 'jma_warning';

/** 根拠データ1件（要件 §14.1 / NFR-301）。出典・取得日時・更新日・属性を保持。 */
export interface Evidence {
  source_key: SourceKey;
  layer_name: string;
  attribution: string;
  fetched_at: string;
  source_updated_at: string;
  /** 精度・時点差などのデータ品質メモ（要件 NFR-505）。空文字なら表示しない。 */
  quality_note: string;
  /** レイヤ固有の属性（key: value）。 */
  props: Record<string, string>;
}

/** カテゴリ別の確認結果1件（要件 §14.1）。 */
export interface Finding {
  id: string;
  category: Category;
  priority: Priority;
  title: string;
  summary: string;
  status: FindingStatus;
  /** 地点からの距離[m]。距離概念がない項目は null。 */
  distance_m: number | null;
  /** ポリゴンとの重なりが確認された場合 true（距離ではなく重なりで表現）。 */
  intersects?: boolean;
  /** 注意事項（精度・更新日・解釈上の留意点）。 */
  caution: string;
  evidence: Evidence[];
}

/** 入力地点（正規化済み）。WGS84 を標準とする（要件 NFR-501）。 */
export interface SiteLocation {
  address: string;
  lat: number;
  lon: number;
  radius: number;
  coordLabel: string;
  radiusLabel: string;
}

/** API 接続状態（要件 FR-501）。 */
export type SourceStatus = 'success' | 'failed' | 'skipped';

/** データソース台帳の1件（要件 §8.2 / SCR-006）。 */
export interface SourceLedgerEntry {
  key: SourceKey;
  name: string;
  provider: string;
  type: 'api' | 'db' | 'tile';
  license: string;
  /** 信頼度ランク（A〜C）。 */
  rank: Priority;
  stat: SourceStatus;
  /** 最終取得時刻（HH:MM:SS）。未取得は '—'。 */
  last: string;
  enabled: boolean;
  /** 接続テスト実行中フラグ（UI 用）。 */
  _testing?: boolean;
}

/** API 実行ログ1件（要件 FR-503 / SCR-007）。 */
export interface LogEntry {
  time: string;
  source: string;
  endpoint: string;
  /** HTTP コード。コードを持たない処理は '—'。 */
  code: string;
  /** 実通信の結果を表す。not_attempted/visual_only は「実リクエストなし」の誠実な区別（外部評価 Phase 0）。 */
  status: 'success' | 'timeout' | 'failed' | 'skipped' | 'not_attempted' | 'visual_only';
  /** 応答時間[ms]。 */
  ms: string;
  error: string;
}

/** 取得ステップの進捗（ローディングオーバーレイ用、要件 NFR-003 部分結果表示）。 */
export interface FetchStep {
  key: SourceKey;
  name: string;
  status: 'pending' | 'success' | 'failed' | 'skipped';
}

/** 地図に重ねる実データ（Overpass から得たジオメトリ）。 */
export interface MapFeatures {
  roads: [number, number][][];
  water: [number, number][][];
  facilities: { lat: number; lon: number; label: string }[];
}

export type Screen = 'dashboard' | 'input' | 'analysis' | 'aimemo' | 'report' | 'compare' | 'sources' | 'logs' | 'audit' | 'settings';
export type InputType = 'address' | 'coord';

/** 表示テーマ。'auto' は OS 設定に追従し、解決後は light/dark のいずれかになる。 */
export type Theme = 'light' | 'dark';
export type ThemePref = 'light' | 'dark' | 'auto';

/** 調査案件の進捗状態（ダッシュボード SCR-000）。 */
export type CaseStatus = 'done' | 'progress' | 'review' | 'draft';

/** ダッシュボードに並ぶ調査案件1件。counts は確認優先度 A〜D の件数。 */
export interface CaseRecord {
  id: string;
  name: string;
  code: string;
  address: string;
  lat: number;
  lon: number;
  radius: number;
  date: string;
  status: CaseStatus;
  counts: Record<Priority, number>;
  /** true=ダミー（サンプル）データ、false=実取得（本番）データ。出所を必ず区別する。 */
  isDummy: boolean;
  /** 実データ案件のみ保持する確認結果スナップショット（保存時点の記録）。 */
  findings?: Finding[];
  location?: SiteLocation;
  logs?: LogEntry[];
  fetchedAt?: string;
}
export type BaseLayer = 'pale' | 'std' | 'photo';
export type OverlayKey =
  | 'range'
  | 'roads'
  | 'water'
  | 'flood'
  | 'sediment'
  | 'hillshade'
  | 'facilities';
