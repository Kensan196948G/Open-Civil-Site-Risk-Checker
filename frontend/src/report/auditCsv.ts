// 監査ログ CSV エクスポート生成（Issue #111 の監査証跡・ISO/J-SOX 対応）。
// 監査ログ（actor・時刻・対象・action・detail）を RFC 4180 形式の CSV へ変換する。
// UTF-8 BOM は download 側で付与（Excel の文字化け防止）。本文・秘密情報は含めない。

import type { AuditEntry } from '../api/cases';
import { ACTION_LABEL } from '../screens/auditConstants';

/** 監査ログを CSV 文字列へ変換する（RFC 4180・値中の " , 改行 はクォート）。 */
export function buildAuditCsv(entries: AuditEntry[]): string {
  const rows: string[][] = [
    ['ts', 'actor', 'action', 'action_label', 'entity', 'entity_id', 'detail'],
  ];
  for (const e of entries) {
    rows.push([
      e.ts,
      e.actor,
      e.action,
      ACTION_LABEL[e.action] ?? e.action,
      e.entity,
      e.entity_id,
      JSON.stringify(e.detail),
    ]);
  }
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}
