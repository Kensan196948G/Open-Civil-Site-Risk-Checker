// 候補地比較の地図データ変換（SCR-010・Issue #175）のテスト。
// CompareRow → 地図地点リストの変換（選択順保持・番号付与・ラベル）を検証する。

import { describe, expect, it } from 'vitest';
import type { CompareRow } from '../report/compare';
import { comparePointLabel, toCompareMapPoints } from './compareMapPoints';

function row(overrides: Partial<CompareRow> = {}): CompareRow {
  return {
    caseId: 'c1',
    name: '候補地A（架空）',
    code: 'OCSRC-DEMO-001',
    date: '2026-08-01',
    address: '東京都千代田区（架空）',
    lat: 35.6745,
    lon: 139.7524,
    radius: 500,
    byCategory: {} as CompareRow['byCategory'],
    counts: { A: 1, B: 2, C: 3, D: 0 },
    addressLabel: () => '東京都千代田区（架空）',
    ...overrides,
  };
}

describe('toCompareMapPoints', () => {
  it('選択順（入力順）に rank を 1 始まりで付与する', () => {
    const points = toCompareMapPoints([row(), row({ caseId: 'c2', name: '候補地B（架空）' })]);
    expect(points).toHaveLength(2);
    expect(points[0].rank).toBe(1);
    expect(points[1].rank).toBe(2);
    expect(points[0].id).toBe('c1');
    expect(points[1].lat).toBe(35.6745);
  });

  it('空の比較行は空リストを返す', () => {
    expect(toCompareMapPoints([])).toEqual([]);
  });

  it('radius を保持する（範囲円表示用）', () => {
    const points = toCompareMapPoints([row({ radius: 1200 })]);
    expect(points[0].radius).toBe(1200);
  });
});

describe('comparePointLabel', () => {
  it('番号と案件名を組み合わせる', () => {
    expect(comparePointLabel({ id: 'c1', name: '候補地A（架空）', lat: 0, lon: 0, radius: 500, rank: 1 })).toBe(
      '1. 候補地A（架空）',
    );
  });

  it('名前が空でも番号だけで壊れない', () => {
    expect(comparePointLabel({ id: 'c2', name: '', lat: 0, lon: 0, radius: 500, rank: 2 })).toBe('2. 地点2');
  });
});
