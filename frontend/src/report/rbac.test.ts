// RBAC 権限マトリクス（Issue #111）のテスト。
// backend（app/cases.py）の role_has と整合する権限判定・マトリクス生成を検証する。

import { describe, expect, it } from 'vitest';
import { ACTION_LABEL, ALL_ROLES, buildMatrix, can, ROLE_LABEL, ROLE_PRIORITY } from './rbac';

describe('ROLE_PRIORITY / ROLE_LABEL', () => {
  it('5ロールが定義され、優先度が昇順', () => {
    expect(ALL_ROLES).toEqual(['viewer', 'auditor', 'editor', 'approver', 'admin']);
    expect(ROLE_PRIORITY.viewer).toBeLessThan(ROLE_PRIORITY.auditor);
    expect(ROLE_PRIORITY.auditor).toBeLessThan(ROLE_PRIORITY.editor);
    expect(ROLE_PRIORITY.editor).toBeLessThan(ROLE_PRIORITY.approver);
    expect(ROLE_PRIORITY.approver).toBeLessThan(ROLE_PRIORITY.admin);
  });

  it('全ロールに日本語ラベルがある', () => {
    for (const r of ALL_ROLES) {
      expect(ROLE_LABEL[r]).toBeTruthy();
    }
  });
});

describe('can（権限判定・backend の role_has と整合）', () => {
  it('viewer は閲覧のみ・作成不可', () => {
    expect(can('viewer', 'view_case')).toBe(true);
    expect(can('viewer', 'create_case')).toBe(false);
    expect(can('viewer', 'approve_case')).toBe(false);
    expect(can('viewer', 'view_audit')).toBe(false);
  });

  it('editor は作成・更新・申請可・承認不可', () => {
    expect(can('editor', 'create_case')).toBe(true);
    expect(can('editor', 'update_case')).toBe(true);
    expect(can('editor', 'submit_case')).toBe(true);
    expect(can('editor', 'approve_case')).toBe(false);
    expect(can('editor', 'delete_case')).toBe(false);
  });

  it('approver は承認可・削除不可', () => {
    expect(can('approver', 'approve_case')).toBe(true);
    expect(can('approver', 'delete_case')).toBe(false);
  });

  it('admin は全操作可', () => {
    for (const action of Object.keys(ACTION_LABEL) as Array<keyof typeof ACTION_LABEL>) {
      expect(can('admin', action)).toBe(true);
    }
  });

  it('auditor は監査ログ閲覧可・編集不可', () => {
    expect(can('auditor', 'view_audit')).toBe(true);
    expect(can('auditor', 'create_case')).toBe(false);
  });
});

describe('buildMatrix', () => {
  it('全操作×全ロールのマトリクスを生成する', () => {
    const m = buildMatrix();
    expect(Object.keys(m)).toHaveLength(Object.keys(ACTION_LABEL).length);
    for (const action of Object.keys(m) as Array<keyof typeof m>) {
      expect(Object.keys(m[action])).toHaveLength(ALL_ROLES.length);
    }
    // admin 列は全て true・viewer 列は閲覧のみ true
    for (const action of Object.keys(m) as Array<keyof typeof m>) {
      expect(m[action].admin).toBe(true);
    }
    expect(m.view_case.viewer).toBe(true);
    expect(m.create_case.viewer).toBe(false);
  });
});
