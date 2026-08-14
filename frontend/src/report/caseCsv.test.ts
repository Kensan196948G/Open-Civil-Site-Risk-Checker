// ダッシュボード案件一覧 CSV（SCR-000）のテスト。
// ヘッダ・値の列挙・種別ラベル・RFC 4180 エスケープを検証する。

import { describe, expect, it } from 'vitest';
import type { CaseRecord } from '../types';
import { buildCasesCsv, caseKindLabel } from './caseCsv';

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

describe('caseKindLabel', () => {
  it('isDummy に応じて実データ/ダミーを返す', () => {
    expect(caseKindLabel(rec())).toBe('ダミー');
    expect(caseKindLabel(rec({ isDummy: false }))).toBe('実データ');
  });
});

describe('buildCasesCsv', () => {
  it('ヘッダと各案件の値（優先度内訳・種別）を列挙する', () => {
    const csv = buildCasesCsv([rec(), rec({ id: 'c2', name: '豊洲6丁目 埠頭再整備', code: 'OCSRC-2026-015', status: 'done', isDummy: false })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('name,code,address,date,status,kind,countA,countB,countC,countD');
    expect(lines[1]).toContain('霞が関2丁目 候補地A（架空）');
    expect(lines[1]).toContain('OCSRC-2026-018');
    expect(lines[1]).toContain('progress,ダミー,1,3,4,2');
    expect(lines[2]).toContain('豊洲6丁目 埠頭再整備');
    expect(lines[2]).toContain('done,実データ');
  });

  it('値中のカンマ・引用符を RFC 4180 でエスケープする', () => {
    const csv = buildCasesCsv([rec({ name: '候補地 "A", 拡張' })]);
    expect(csv).toContain('"候補地 ""A"", 拡張"');
  });

  it('0 件でもヘッダのみを返す', () => {
    expect(buildCasesCsv([])).toBe('name,code,address,date,status,kind,countA,countB,countC,countD');
  });
});
