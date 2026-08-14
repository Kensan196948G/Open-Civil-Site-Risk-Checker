// 監査ログフィルタ（SCR-009・Issue #111）のテスト。
// actor / action / entity / キーワードによる絞り込みと、AND 結合・大小文字無視を検証する。

import { describe, expect, it } from 'vitest';
import { ACTION_OPTIONS, EMPTY_FILTER, filterAudit, isFilterActive } from './auditFilter';
import { DUMMY_AUDIT } from '../screens/auditConstants';

describe('filterAudit', () => {
  it('フィルタ未指定は全件を返す', () => {
    expect(filterAudit(DUMMY_AUDIT, EMPTY_FILTER)).toHaveLength(DUMMY_AUDIT.length);
  });

  it('actor で部分一致（大小文字無視）', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, actor: 'DEMO-APPROVER' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.actor.toLowerCase().includes('demo-approver'))).toBe(true);
  });

  it('action で正確一致', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, action: 'case_approved' });
    expect(r.length).toBe(1);
    expect(r[0].action).toBe('case_approved');
  });

  it('entity で部分一致（case#3）', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, entity: 'case#3' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => `${e.entity}#${e.entity_id}` === 'case#3')).toBe(true);
  });

  it('keyword は detail の JSON にも一致する', () => {
    // detail に OCSRC-DEMO-2026-103 を含むエントリを検索
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, keyword: 'OCSRC-DEMO-2026-103' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => JSON.stringify(e.detail).includes('OCSRC-DEMO-2026-103'))).toBe(true);
  });

  it('複数条件は AND で結合される', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, actor: 'demo-editor', action: 'case_created' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.actor.includes('demo-editor') && e.action === 'case_created')).toBe(true);
  });

  it('一致しない条件は空配列を返す', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, actor: 'nonexistent@example.com' });
    expect(r).toEqual([]);
  });
});

describe('isFilterActive / ACTION_OPTIONS', () => {
  it('未指定フィルタは非アクティブ', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
  });

  it('いずれか指定があればアクティブ', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, actor: 'a' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, action: 'case_created' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, keyword: 'k' })).toBe(true);
  });

  it('ACTION_OPTIONS は全件表示を含む', () => {
    expect(ACTION_OPTIONS[0]).toEqual({ value: 'all', label: 'すべての操作' });
    expect(ACTION_OPTIONS.some((o) => o.value === 'case_approved')).toBe(true);
  });
});
