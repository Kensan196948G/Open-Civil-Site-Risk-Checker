// 監査ログの表示用定数（SCR-009・Issue #111）。
// コンポーネントとテストの両方から参照するため、画面コンポーネントとは別ファイルに置く
// （react-refresh の fast refresh を維持するため）。

import type { AuditEntry } from '../api/cases';

// 架空のダミー監査ログ（実在情報を含まない・デモ用）。空画面を残さないためのフォールバック。
export const DUMMY_AUDIT: AuditEntry[] = [
  { id: 9001, entity: 'case', entity_id: '3', action: 'case_created', actor: 'demo-editor@example.com', detail: { code: 'OCSRC-DEMO-2026-103', status: 'draft' }, ts: '2026-08-14T09:00:00+09:00' },
  { id: 9002, entity: 'case', entity_id: '3', action: 'case_submitted', actor: 'demo-editor@example.com', detail: { code: 'OCSRC-DEMO-2026-103', from: 'draft', to: 'submitted' }, ts: '2026-08-14T10:15:00+09:00' },
  { id: 9003, entity: 'case', entity_id: '3', action: 'case_approved', actor: 'demo-approver@example.com', detail: { code: 'OCSRC-DEMO-2026-103', from: 'submitted', to: 'approved' }, ts: '2026-08-14T11:30:00+09:00' },
  { id: 9004, entity: 'case', entity_id: '2', action: 'case_created', actor: 'demo-editor@example.com', detail: { code: 'OCSRC-DEMO-2026-102', status: 'draft' }, ts: '2026-08-13T14:00:00+09:00' },
  { id: 9005, entity: 'case', entity_id: '2', action: 'case_submitted', actor: 'demo-editor@example.com', detail: { code: 'OCSRC-DEMO-2026-102', from: 'draft', to: 'submitted' }, ts: '2026-08-13T15:45:00+09:00' },
  { id: 9006, entity: 'case', entity_id: '1', action: 'case_created', actor: 'demo-editor@example.com', detail: { code: 'OCSRC-DEMO-2026-101', status: 'draft' }, ts: '2026-08-12T09:30:00+09:00' },
];

export const ACTION_LABEL: Record<string, string> = {
  case_created: '案件作成',
  case_updated: '案件更新',
  case_submitted: '承認申請',
  case_approved: '承認',
  case_deleted: '案件削除',
  analysis_run: '地点確認',
  report_exported: 'レポート出力',
  memo_generated: 'AIメモ生成',
};

/** ISO 時刻を表示形式（YYYY-MM-DD HH:MM:SS）へ変換する。 */
export function fmtTs(ts: string): string {
  return ts.length >= 19 ? ts.slice(0, 19).replace('T', ' ') : ts;
}
