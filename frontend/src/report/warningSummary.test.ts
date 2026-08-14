// 気象警報（現在）チェック（評価書 #18 MVP）のサマリー変換テスト。
// JMA 警報 finding → 4 段階（発表中/発表なし/取得失敗/未チェック）の要約を検証する。

import { describe, expect, it } from 'vitest';
import type { Finding } from '../types';
import { summarizeJmaFinding, warningColor } from './warningSummary';

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'jma-warning-1',
    category: 'hazard',
    priority: 'A',
    title: '気象庁 警報・注意報：東京都内で発表中',
    summary: '東京都で 大雨警報・洪水警報 が発表中です。',
    status: 'found',
    distance_m: null,
    caution: '都道府県発表単位',
    evidence: [
      {
        source_key: 'jma_warning',
        layer_name: '気象警報・注意報',
        attribution: '気象庁',
        fetched_at: '2026-08-15 10:00:00',
        source_updated_at: '2026-08-15 09:00:00',
        quality_note: '',
        props: { warnings: '大雨警報・洪水警報', area_count: '3地域' },
      },
    ],
    ...overrides,
  };
}

describe('summarizeJmaFinding', () => {
  it('発表中（found）は警報名つきで alert と要約する', () => {
    const s = summarizeJmaFinding(finding());
    expect(s.level).toBe('alert');
    expect(s.label).toBe('発表中（大雨警報・洪水警報）');
  });

  it('発表なし（not_found）は none と要約する', () => {
    const s = summarizeJmaFinding(finding({ status: 'not_found', title: '発表なし', evidence: [] }));
    expect(s.level).toBe('none');
    expect(s.label).toBe('発表なし');
  });

  it('取得失敗（failed）は failed と要約する', () => {
    const s = summarizeJmaFinding(finding({ status: 'failed', evidence: [] }));
    expect(s.level).toBe('failed');
    expect(s.label).toBe('取得失敗');
  });

  it('finding がない場合は未チェック（unknown）', () => {
    const s = summarizeJmaFinding(null);
    expect(s.level).toBe('unknown');
    expect(s.label).toBe('未チェック');
  });

  it('警報名が無い発表中でも壊れない', () => {
    const s = summarizeJmaFinding(finding({ evidence: [] }));
    expect(s.level).toBe('alert');
    expect(s.label).toBe('発表中');
  });
});

describe('warningColor', () => {
  it('レベルごとに表示色を返す（テーマ CSS 変数）', () => {
    expect(warningColor('alert')).toBe('var(--err-text)');
    expect(warningColor('none')).toBe('var(--ok-text)');
    expect(warningColor('failed')).toBe('var(--warn-text)');
    expect(warningColor('unknown')).toBe('var(--text-3)');
  });
});
