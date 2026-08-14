// 調査テンプレート（評価書 #21）のテスト。
// テンプレート定義の妥当性（半径・カテゴリ網羅・少なくとも1カテゴリ有効）と
// フォーム値との一致判定を検証する。

import { describe, expect, it } from 'vitest';
import { RADIUS_OPTIONS } from './constants';
import { SURVEY_TEMPLATES, templateMatches, type TemplateCategories } from './templates';

const ALL_KEYS: (keyof TemplateCategories)[] = ['roads', 'rivers', 'hazard', 'terrain', 'weather', 'facilities'];

describe('SURVEY_TEMPLATES（定義の妥当性）', () => {
  it('id は一意・ラベル・説明を持つ', () => {
    const ids = SURVEY_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of SURVEY_TEMPLATES) {
      expect(t.label.length).toBeGreaterThan(0);
      expect(t.description.length).toBeGreaterThan(0);
    }
  });

  it('radius は RADIUS_OPTIONS のいずれか', () => {
    for (const t of SURVEY_TEMPLATES) {
      expect(RADIUS_OPTIONS).toContain(t.radius);
    }
  });

  it('categories は 6 カテゴリを網羅し、少なくとも 1 つは有効（入力検証を満たす）', () => {
    for (const t of SURVEY_TEMPLATES) {
      for (const k of ALL_KEYS) {
        expect(typeof t.categories[k], `${t.id}.${k}`).toBe('boolean');
      }
      expect(Object.values(t.categories).some(Boolean)).toBe(true);
    }
  });
});

describe('templateMatches', () => {
  const cats: TemplateCategories = { roads: true, rivers: true, hazard: true, terrain: true, weather: false, facilities: true };

  it('radius と全カテゴリが一致すれば true', () => {
    expect(templateMatches(500, cats, { id: 'x', label: 'x', description: '', radius: 500, categories: cats })).toBe(true);
  });

  it('radius が違えば false', () => {
    expect(templateMatches(1000, cats, { id: 'x', label: 'x', description: '', radius: 500, categories: cats })).toBe(false);
  });

  it('カテゴリが 1 つでも違えば false', () => {
    const diff = { ...cats, weather: true };
    expect(templateMatches(500, diff, { id: 'x', label: 'x', description: '', radius: 500, categories: cats })).toBe(false);
  });
});
