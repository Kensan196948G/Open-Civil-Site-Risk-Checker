// ダッシュボード案件一覧（SCR-000）の検索・絞り込みロジック（純粋・DOM 非依存）。
// キーワード（案件名・コード・所在地）と状態で絞り込む。監査ログ/取得ログの
// フィルタと同じ AND 結合・部分一致方式。

import type { CaseRecord, CaseStatus } from '../types';

export interface CaseFilter {
  /** キーワード（案件名・コード・所在地の部分一致）。空文字は無視。 */
  keyword: string;
  /** 状態の正確一致（'all' は無指定）。 */
  status: string;
}

export const EMPTY_CASE_FILTER: CaseFilter = { keyword: '', status: 'all' };

/** 状態の選択肢（全件 + 案件状態）。 */
export const CASE_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべての状態' },
  { value: 'done', label: '確認済み' },
  { value: 'progress', label: '確認中' },
  { value: 'review', label: 'レビュー待ち' },
  { value: 'draft', label: '下書き' },
];

/** 案件一覧をフィルタで絞り込む（すべての条件を AND で適用・大小文字は無視）。 */
export function filterCases(cases: CaseRecord[], filter: CaseFilter): CaseRecord[] {
  const keyword = filter.keyword.trim().toLowerCase();
  const status = filter.status;

  return cases.filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (keyword) {
      const hay = `${c.name} ${c.code} ${c.address}`.toLowerCase();
      if (!hay.includes(keyword)) return false;
    }
    return true;
  });
}

/** フィルタが非アクティブ（全件表示）か。 */
export function isCaseFilterActive(filter: CaseFilter): boolean {
  return filter.keyword.trim() !== '' || filter.status !== 'all';
}

/** 状態ラベル（表示用）。 */
export function caseStatusLabel(status: CaseStatus): string {
  return CASE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}
