import type { Finding, LogEntry, MapFeatures } from '../types';

// アダプタ層の共通契約（要件 NFR-401「アダプタ方式」）。
// 各アダプタは「取得 → 正規化 → 確認項目(Finding)化」を担い、
// 同時に実行ログ(LogEntry)と地図用ジオメトリ(MapFeatures断片)を返す。

export interface AnalysisInput {
  lat: number;
  lon: number;
  radius: number;
}

export interface AdapterResult {
  /** この取得で得られた確認項目（0件のこともある）。 */
  findings: Finding[];
  /** 取得ログ1件（SCR-007 表示用）。 */
  log: LogEntry;
  /** 取得ステップの最終状態（ローディング表示用）。 */
  stepStatus: 'success' | 'failed' | 'skipped';
  /** 地図に重ねるジオメトリ断片（任意）。 */
  features?: Partial<MapFeatures>;
}
