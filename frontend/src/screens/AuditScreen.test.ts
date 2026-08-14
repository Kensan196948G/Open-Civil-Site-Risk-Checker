// 監査ログ閲覧画面（SCR-009・Issue #111）の純粋ロジックテスト。
// ダミーデータの妥当性・action ラベル・時刻フォーマットを検証する。

import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, DUMMY_AUDIT, fmtTs } from './auditConstants';

describe('DUMMY_AUDIT（ダミー監査ログ）', () => {
  it('実在情報を含まず、必須フィールドを満たす', () => {
    expect(DUMMY_AUDIT.length).toBeGreaterThan(0);
    for (const e of DUMMY_AUDIT) {
      expect(e.id).toBeGreaterThan(0);
      expect(e.entity).toBe('case');
      expect(/^\d+$/.test(e.entity_id)).toBe(true);
      expect(ACTION_LABEL[e.action]).toBeTruthy();
      expect(e.actor).toContain('example.com'); // 実在メールを含まない
      expect(/^\d{4}-\d{2}-\d{2}T/.test(e.ts)).toBe(true);
    }
  });

  it('承認WF（draft→submitted→approved）の履歴を含む', () => {
    const actions = DUMMY_AUDIT.map((e) => e.action);
    expect(actions).toContain('case_created');
    expect(actions).toContain('case_submitted');
    expect(actions).toContain('case_approved');
  });
});

describe('ACTION_LABEL', () => {
  it('既知の action に日本語ラベルがある', () => {
    expect(ACTION_LABEL.case_created).toBe('案件作成');
    expect(ACTION_LABEL.case_submitted).toBe('承認申請');
    expect(ACTION_LABEL.case_approved).toBe('承認');
    expect(ACTION_LABEL.case_deleted).toBe('案件削除');
  });
});

describe('fmtTs', () => {
  it('ISO 時刻を表示形式（YYYY-MM-DD HH:MM:SS）へ変換する', () => {
    expect(fmtTs('2026-08-14T11:30:00+09:00')).toBe('2026-08-14 11:30:00');
  });

  it('短い文字列はそのまま返す', () => {
    expect(fmtTs('2026-08-14')).toBe('2026-08-14');
  });
});
