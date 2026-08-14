// 取得ログ（SCR-007・要件 FR-503/FR-604）のフィルタ・検索ロジック（純粋・DOM 非依存）。
// ソース / 状態 / エンドポイント / キーワード（endpoint・error・code）で絞り込む。
// 監査ログ（SCR-009・auditFilter.ts）と同じ AND 結合・部分一致方式。

import type { LogEntry, SourceKey } from '../types';
import { SOURCE_SHORT } from '../data/constants';

export interface LogFilter {
  /** ソース（表示名/キーの部分一致）。空文字は無視。 */
  source: string;
  /** 状態の正確一致（'all' は無指定）。 */
  status: string;
  /** エンドポイントの部分一致。空文字は無視。 */
  endpoint: string;
  /** キーワード（endpoint・error・code に部分一致）。空文字は無視。 */
  keyword: string;
}

export const EMPTY_LOG_FILTER: LogFilter = { source: '', status: 'all', endpoint: '', keyword: '' };

/** 状態の選択肢（全件 + ログの状態一覧）。 */
export const LOG_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべての状態' },
  { value: 'success', label: '成功' },
  { value: 'timeout', label: 'タイムアウト' },
  { value: 'failed', label: '失敗' },
  { value: 'skipped', label: 'スキップ' },
  { value: 'not_attempted', label: '未実施' },
  { value: 'visual_only', label: '目視のみ' },
];

/** 取得ログをフィルタで絞り込む（すべての条件を AND で適用・大小文字は無視）。 */
export function filterLogs(logs: LogEntry[], filter: LogFilter): LogEntry[] {
  const source = filter.source.trim().toLowerCase();
  const status = filter.status;
  const endpoint = filter.endpoint.trim().toLowerCase();
  const keyword = filter.keyword.trim().toLowerCase();

  return logs.filter((l) => {
    if (source) {
      const label = SOURCE_SHORT[l.source as SourceKey] ?? l.source;
      const hay = `${l.source} ${label}`.toLowerCase();
      if (!hay.includes(source)) return false;
    }
    if (status !== 'all' && l.status !== status) return false;
    if (endpoint && !l.endpoint.toLowerCase().includes(endpoint)) return false;
    if (keyword) {
      const hay = `${l.endpoint} ${l.error} ${l.code}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
}

/** フィルタが非アクティブ（全件表示）か。 */
export function isLogFilterActive(filter: LogFilter): boolean {
  return (
    filter.source.trim() !== '' ||
    filter.status !== 'all' ||
    filter.endpoint.trim() !== '' ||
    filter.keyword.trim() !== ''
  );
}
