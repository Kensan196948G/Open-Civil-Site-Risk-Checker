// ダッシュボード案件一覧（SCR-000）の検索・絞り込みロジックのテスト。
// キーワード（案件名・コード・所在地）と状態の AND 絞り込み・非アクティブ判定を検証する。

import { describe, expect, it } from 'vitest';
import type { CaseRecord } from '../types';
import {
  CASE_STATUS_OPTIONS,
  EMPTY_CASE_FILTER,
  caseStatusLabel,
  filterCases,
  isCaseFilterActive,
  type CaseFilter,
} from './caseFilter';

function rec(overrides: Partial<CaseRecord> = {}): CaseRecord {
  return {
    id: 'c1',
    name: '霞が関2丁目 候補地A（架空）',
    code: 'OCSRC-2026-018',
    address: '千代田区霞が関2丁目',
    lat: 35.6745,
    lon: 139.7503,
    radius: 500,
    date: '2026-06-18',
    status: 'progress',
    counts: { A: 1, B: 3, C: 4, D: 2 },
    isDummy: true,
    ...overrides,
  };
}

const CASES: CaseRecord[] = [
  rec(),
  rec({ id: 'c2', name: '豊洲6丁目 埠頭再整備', code: 'OCSRC-2026-015', address: '江東区豊洲6丁目', status: 'done' }),
  rec({ id: 'c3', name: '多摩川緑地 橋梁補修', code: 'OCSRC-2026-012', address: '大田区下丸子', status: 'review' }),
];

describe('filterCases', () => {
  it('空フィルタ（全件）はすべて返す', () => {
    expect(filterCases(CASES, EMPTY_CASE_FILTER)).toHaveLength(3);
  });

  it('キーワードは案件名・コード・所在地に部分一致（大小無視）', () => {
    expect(filterCases(CASES, { ...EMPTY_CASE_FILTER, keyword: '霞が関' })).toHaveLength(1);
    expect(filterCases(CASES, { ...EMPTY_CASE_FILTER, keyword: 'ocsrc-2026-012' })).toHaveLength(1);
    expect(filterCases(CASES, { ...EMPTY_CASE_FILTER, keyword: '大田区' })).toHaveLength(1);
    expect(filterCases(CASES, { ...EMPTY_CASE_FILTER, keyword: '多摩川' })).toHaveLength(1);
    // 該当なし
    expect(filterCases(CASES, { ...EMPTY_CASE_FILTER, keyword: '存在しない' })).toHaveLength(0);
  });

  it('状態の正確一致で絞り込む', () => {
    const done = filterCases(CASES, { ...EMPTY_CASE_FILTER, status: 'done' });
    expect(done).toHaveLength(1);
    expect(done[0].id).toBe('c2');
    expect(filterCases(CASES, { ...EMPTY_CASE_FILTER, status: 'progress' })).toHaveLength(1);
  });

  it('キーワードと状態は AND で適用される', () => {
    const f: CaseFilter = { keyword: '豊洲', status: 'done' };
    expect(filterCases(CASES, f)).toHaveLength(1);
    expect(filterCases(CASES, { ...f, status: 'draft' })).toHaveLength(0);
  });

  it('0 件でも空配列を返す（クラッシュしない）', () => {
    expect(filterCases([], { ...EMPTY_CASE_FILTER, keyword: 'x' })).toEqual([]);
  });
});

describe('isCaseFilterActive / caseStatusLabel / CASE_STATUS_OPTIONS', () => {
  it('空フィルタは非アクティブ・条件ありはアクティブ', () => {
    expect(isCaseFilterActive(EMPTY_CASE_FILTER)).toBe(false);
    expect(isCaseFilterActive({ ...EMPTY_CASE_FILTER, status: 'done' })).toBe(true);
    expect(isCaseFilterActive({ ...EMPTY_CASE_FILTER, keyword: ' ' })).toBe(false);
  });

  it('状態選択肢に案件状態を全て含み、ラベル変換が機能する', () => {
    const values = CASE_STATUS_OPTIONS.map((o) => o.value);
    for (const s of ['done', 'progress', 'review', 'draft']) {
      expect(values).toContain(s);
    }
    expect(values[0]).toBe('all');
    expect(caseStatusLabel('done')).toBe('確認済み');
    expect(caseStatusLabel('progress')).toBe('確認中');
  });
});
