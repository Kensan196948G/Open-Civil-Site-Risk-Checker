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

  it('開始日（dateFrom）でその日以降に絞り込む（ISO/J-SOX の監査期間）', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, dateFrom: '2026-08-14' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.ts.slice(0, 10) >= '2026-08-14')).toBe(true);
  });

  it('終了日（dateTo）でその日以前に絞り込む', () => {
    const r = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, dateTo: '2026-08-12' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.ts.slice(0, 10) <= '2026-08-12')).toBe(true);
  });

  it('開始日〜終了日で期間を特定し、他の条件と AND で適用される', () => {
    const ranged = filterAudit(DUMMY_AUDIT, { ...EMPTY_FILTER, dateFrom: '2026-08-13', dateTo: '2026-08-14', action: 'case_submitted' });
    expect(ranged.length).toBeGreaterThan(0);
    expect(ranged.every((e) => e.action === 'case_submitted' && e.ts.slice(0, 10) >= '2026-08-13' && e.ts.slice(0, 10) <= '2026-08-14')).toBe(true);
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
    expect(isFilterActive({ ...EMPTY_FILTER, dateFrom: '2026-08-01' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_FILTER, dateTo: '2026-08-31' })).toBe(true);
  });

  it('ACTION_OPTIONS は全件表示を含む', () => {
    expect(ACTION_OPTIONS[0]).toEqual({ value: 'all', label: 'すべての操作' });
    expect(ACTION_OPTIONS.some((o) => o.value === 'case_approved')).toBe(true);
  });
});
