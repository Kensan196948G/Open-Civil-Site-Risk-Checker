// 監査ログ CSV エクスポート（Issue #111 の監査証跡）のテスト。
// RFC 4180 形式・ヘッダ・クォート・日本語 action ラベルを検証する。

import { describe, expect, it } from 'vitest';
import { buildAuditCsv } from './auditCsv';
import type { AuditEntry } from '../api/cases';

const entries: AuditEntry[] = [
  {
    id: 1,
    entity: 'case',
    entity_id: '3',
    action: 'case_approved',
    actor: 'demo-approver@example.com',
    detail: { code: 'OCSRC-DEMO-2026-103', from: 'submitted', to: 'approved' },
    ts: '2026-08-14T11:30:00+09:00',
  },
  {
    id: 2,
    entity: 'case',
    entity_id: '3',
    action: 'case_submitted',
    actor: 'demo-editor@example.com',
    detail: { code: 'OCSRC-DEMO-2026-103', from: 'draft', to: 'submitted' },
    ts: '2026-08-14T10:15:00+09:00',
  },
];

describe('buildAuditCsv', () => {
  it('ヘッダ行と各エントリの行を含む', () => {
    const csv = buildAuditCsv(entries);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('ts,actor,action,action_label,entity,entity_id,detail');
    expect(lines).toHaveLength(3); // header + 2 entries
    expect(lines[1]).toContain('case_approved');
    expect(lines[1]).toContain('承認'); // action_label は日本語
    expect(lines[1]).toContain('demo-approver@example.com');
  });

  it('detail は JSON 文字列として出力される（RFC 4180 で引用符を "" にエスケープ）', () => {
    const csv = buildAuditCsv(entries);
    expect(csv).toContain('"{""code"":""OCSRC-DEMO-2026-103""');
  });

  it('空配列はヘッダ行のみ返す', () => {
    expect(buildAuditCsv([])).toBe('ts,actor,action,action_label,entity,entity_id,detail');
  });

  it('値中のカンマ・引用符を RFC 4180 に従いクォートする', () => {
    const tricky: AuditEntry[] = [
      {
        id: 9,
        entity: 'case',
        entity_id: '1',
        action: 'case_updated',
        actor: 'someone,"quoted"@example.com',
        detail: { note: 'カンマ, と 引用符" を含む' },
        ts: '2026-08-14T00:00:00+09:00',
      },
    ];
    const csv = buildAuditCsv(tricky);
    // actor は引用符で囲まれ、内部の " は "" にエスケープされる
    expect(csv).toContain('"someone,""quoted""@example.com"');
  });
});
