// 監査ログのフィルタ・検索（SCR-009・Issue #111 の監査証跡）。
// actor / action / entity / キーワード（detail 含む）で絞り込む純粋ロジック。
// 監査人が特定の操作・利用者を素早く特定するための実務機能。

import type { AuditEntry } from '../api/cases';
import { ACTION_LABEL } from '../screens/auditConstants';

export interface AuditFilter {
  /** actor（メール等）の部分一致。空文字は無視。 */
  actor: string;
  /** action の正確一致（'all' は無指定）。 */
  action: string;
  /** 対象 entity の部分一致（例: 'case#3'）。空文字は無視。 */
  entity: string;
  /** キーワード（detail の JSON 文字列と actor/action に部分一致）。空文字は無視。 */
  keyword: string;
}

export const EMPTY_FILTER: AuditFilter = { actor: '', action: 'all', entity: '', keyword: '' };

/** action の選択肢（全件 + ラベル順）。 */
export const ACTION_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'すべての操作' },
  ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label })),
];

/** 監査ログをフィルタで絞り込む（すべての条件を AND で適用・大小文字は無視）。 */
export function filterAudit(entries: AuditEntry[], filter: AuditFilter): AuditEntry[] {
  const actor = filter.actor.trim().toLowerCase();
  const action = filter.action;
  const entity = filter.entity.trim().toLowerCase();
  const keyword = filter.keyword.trim().toLowerCase();

  return entries.filter((e) => {
    if (actor && !e.actor.toLowerCase().includes(actor)) return false;
    if (action !== 'all' && e.action !== action) return false;
    const entityTarget = `${e.entity}#${e.entity_id}`.toLowerCase();
    if (entity && !entityTarget.includes(entity)) return false;
    if (keyword) {
      const haystack = [
        e.actor,
        e.action,
        ACTION_LABEL[e.action] ?? e.action,
        `${e.entity}#${e.entity_id}`,
        JSON.stringify(e.detail),
      ]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

/** フィルタが非アクティブ（全件表示）か。 */
export function isFilterActive(filter: AuditFilter): boolean {
  return filter.actor.trim() !== '' || filter.action !== 'all' || filter.entity.trim() !== '' || filter.keyword.trim() !== '';
}
