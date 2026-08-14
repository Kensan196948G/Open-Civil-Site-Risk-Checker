// AI 利用状況（評価書 #20）の表示整形ヘルパのテスト。
// 純粋ロジック（合計文・円換算・日別絞り込み・空判定）を検証する。

import { describe, expect, it } from 'vitest';
import {
  JPY_PER_USD,
  estimateYen,
  isEmptyUsage,
  recentDaily,
  usageTotalsText,
  type AiUsageSummary,
} from './aiUsage';

function summary(overrides: Partial<AiUsageSummary> = {}): AiUsageSummary {
  return {
    status: 'ok',
    days: 30,
    total: {
      calls: 3,
      ok_calls: 2,
      error_calls: 1,
      prompt_chars: 2400,
      completion_chars: 500,
      duration_ms: 2700,
      warnings: 1,
      estimated_cost_usd: 0.0068,
    },
    daily: [
      { date: '2026-08-15', calls: 2, ok_calls: 1, error_calls: 1, prompt_chars: 1600, completion_chars: 300 },
      { date: '2026-08-14', calls: 1, ok_calls: 1, error_calls: 0, prompt_chars: 800, completion_chars: 200 },
    ],
    users: [{ user: 'taro@example.com', calls: 3, ok_calls: 2, prompt_chars: 2400, completion_chars: 500 }],
    note: 'サーバー側 DB に記録された実績のみ。',
    ...overrides,
  };
}

describe('estimateYen（概算円換算）', () => {
  it('1 USD = 150 円の固定近似で換算する', () => {
    expect(JPY_PER_USD).toBe(150);
    expect(estimateYen(0.0068)).toBe(1); // 0.0068 * 150 = 1.02 → round 1
    expect(estimateYen(0.1)).toBe(15);
    expect(estimateYen(0)).toBe(0);
  });
});

describe('usageTotalsText（合計要約文）', () => {
  it('呼び出し数・成功/失敗・文字数・概算費用を組み立てる', () => {
    const text = usageTotalsText(summary().total);
    expect(text).toContain('呼び出し 3 回（成功 2 / 失敗 1）');
    expect(text).toContain('入力 2400 文字');
    expect(text).toContain('出力 500 文字');
    expect(text).toContain('概算費用 約1 円');
  });

  it('0 件でも壊れない', () => {
    const zero = {
      calls: 0,
      ok_calls: 0,
      error_calls: 0,
      prompt_chars: 0,
      completion_chars: 0,
      duration_ms: 0,
      warnings: 0,
      estimated_cost_usd: 0,
    };
    expect(usageTotalsText(zero)).toContain('呼び出し 0 回');
    expect(usageTotalsText(zero)).toContain('概算費用 約0 円');
  });
});

describe('recentDaily / isEmptyUsage', () => {
  it('日別は最大 limit 件に絞り込む', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      date: `2026-08-${String(15 - i).padStart(2, '0')}`,
      calls: 1,
      ok_calls: 1,
      error_calls: 0,
      prompt_chars: 10,
      completion_chars: 10,
    }));
    expect(recentDaily(many, 7)).toHaveLength(7);
    expect(recentDaily([], 7)).toHaveLength(0);
  });

  it('呼び出し 0 件を空と判定する', () => {
    expect(isEmptyUsage(summary({ total: { ...summary().total, calls: 0 } }))).toBe(true);
    expect(isEmptyUsage(summary())).toBe(false);
  });
});
