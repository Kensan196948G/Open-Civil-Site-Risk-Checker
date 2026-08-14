// 調査テンプレート（評価書 #21・現場業務の標準化）。
// 工種に応じた検索半径・確認カテゴリの初期値をまとめて適用する（個別調整は可能）。
// 純粋ロジック（DOM 非依存・単体テスト対象）。すべて架空のデモ用初期値。

import type { Category } from '../types';

/** 入力フォームのカテゴリ（data_quality を除く 6 種）。 */
export type TemplateCategories = Record<Exclude<Category, 'data_quality'>, boolean>;

export interface SurveyTemplate {
  id: string;
  label: string;
  /** ツールチップ等に出す説明（このテンプレートが想定する調査観点）。 */
  description: string;
  radius: number;
  categories: TemplateCategories;
}

const ALL_ON: TemplateCategories = { roads: true, rivers: true, hazard: true, terrain: true, weather: true, facilities: true };

/** 調査テンプレート一覧（工種別の初期値・デモ用）。 */
export const SURVEY_TEMPLATES: SurveyTemplate[] = [
  {
    id: 'general',
    label: '標準調査',
    description: '全カテゴリを既定半径 500m で確認',
    radius: 500,
    categories: { ...ALL_ON },
  },
  {
    id: 'road',
    label: '道路工事',
    description: '搬入路・交通規制・河川近接・施設配慮を重視（半径 500m）',
    radius: 500,
    categories: { ...ALL_ON, weather: false },
  },
  {
    id: 'river',
    label: '河川・護岸工事',
    description: '河川・水域・ハザード・気象を重視（半径 1000m）',
    radius: 1000,
    categories: { roads: false, rivers: true, hazard: true, terrain: true, weather: true, facilities: false },
  },
  {
    id: 'building',
    label: '建築・造成工事',
    description: 'ハザード・地形・道路・施設のバランス（半径 250m）',
    radius: 250,
    categories: { roads: true, rivers: false, hazard: true, terrain: true, weather: false, facilities: true },
  },
];

/** 現在のフォーム値とテンプレートの一致判定（テンプレート選択状態の表示用）。 */
export function templateMatches(
  radius: number,
  categories: TemplateCategories,
  t: SurveyTemplate,
): boolean {
  if (radius !== t.radius) return false;
  return (Object.keys(t.categories) as (keyof TemplateCategories)[]).every((k) => categories[k] === t.categories[k]);
}
