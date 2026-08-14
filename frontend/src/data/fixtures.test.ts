// ダミーデータ（fixture）の整合性テスト。
// objective の「有効な架空ダミーデータ投入・保持・UI/API/DB 整合」を機械的に担保する。
// 形式・型・制約（緯度経度範囲・半径・counts キー・ステータス・コード形式）と
// 参照整合（比較デモ行のカテゴリ網羅・ソース台帳キーの一意/網羅）を検証する。
// 実在の個人情報・会社実データを含まないこと（デモ用明示）も確認する。

import { describe, expect, it } from 'vitest';
import { DUMMY_CASES } from './cases';
import { COMPARE_DEMO_CASES, COMPARE_DEMO_ROWS } from './fixtures';
import { SOURCE_LEDGER } from './sources';
import { RADIUS_OPTIONS } from './constants';
import type { CaseStatus, SourceKey } from '../types';
import { COMPARE_CATEGORIES } from '../report/compare';

const VALID_STATUSES: CaseStatus[] = ['done', 'progress', 'review', 'draft'];

describe('DUMMY_CASES（ダッシュボードのダミー案件 6 件）', () => {
  it('id は一意・全て isDummy=true（実データと区別）', () => {
    const ids = DUMMY_CASES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of DUMMY_CASES) {
      expect(c.isDummy).toBe(true);
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.address.length).toBeGreaterThan(0);
    }
  });

  it('緯度経度・半径・counts・ステータス・コード形式が有効', () => {
    for (const c of DUMMY_CASES) {
      expect(c.lat).toBeGreaterThanOrEqual(-90);
      expect(c.lat).toBeLessThanOrEqual(90);
      expect(c.lon).toBeGreaterThanOrEqual(-180);
      expect(c.lon).toBeLessThanOrEqual(180);
      expect(RADIUS_OPTIONS).toContain(c.radius);
      expect(VALID_STATUSES).toContain(c.status);
      expect(c.code).toMatch(/^OCSRC-\d{4}-\d{3}$/);
      // counts は A〜D を数値で持つ（集計表示が壊れない）。
      for (const k of ['A', 'B', 'C', 'D'] as const) {
        expect(typeof c.counts[k], `${c.id}.counts.${k}`).toBe('number');
      }
    }
  });

  it('デモ用の明示があり、実在の個人情報らしき表記を含まない', () => {
    for (const c of DUMMY_CASES) {
      // 候補地ラベルに個人名・電話・メール等の実在情報を含まない。
      expect(c.name).not.toMatch(/[0-9]{3}-[0-9]{4}/); // 電話番号形式
      expect(c.name).not.toMatch(/@/); // メール形式
    }
  });
});

describe('COMPARE_DEMO_ROWS（候補地比較のデモ行・空画面を残さない）', () => {
  it('緯度経度・半径が有効で、比較カテゴリを全て網羅する', () => {
    expect(COMPARE_DEMO_ROWS.length).toBeGreaterThanOrEqual(2);
    expect(COMPARE_DEMO_ROWS.length).toBeLessThanOrEqual(4);
    for (const r of COMPARE_DEMO_ROWS) {
      expect(r.lat).toBeGreaterThanOrEqual(-90);
      expect(r.lat).toBeLessThanOrEqual(90);
      expect(r.lon).toBeGreaterThanOrEqual(-180);
      expect(r.lon).toBeLessThanOrEqual(180);
      expect(RADIUS_OPTIONS).toContain(r.radius);
      for (const cat of COMPARE_CATEGORIES) {
        expect(Array.isArray(r.byCategory[cat]), `${r.caseId}.byCategory.${cat}`).toBe(true);
      }
    }
  });

  it('デモ用の明示（isDummy=true・架空）がある', () => {
    for (const c of COMPARE_DEMO_CASES) {
      expect(c.isDummy).toBe(true);
      expect(c.name).toContain('架空');
    }
  });
});

describe('SOURCE_LEDGER（データソース台帳）', () => {
  const EXPECTED_KEYS: SourceKey[] = [
    'nominatim',
    'osm_overpass',
    'open_meteo',
    'ksj',
    'hazard_portal',
    'gsi_tile',
    'plateau',
    'xroad',
    'jma_warning',
  ];

  it('キーは一意で、SourceKey の全種を網羅する（UI 表示が欠落しない）', () => {
    const keys = SOURCE_LEDGER.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...EXPECTED_KEYS].sort());
  });

  it('ライセンス・プロバイダ・種別が有効（台帳表示が壊れない）', () => {
    for (const s of SOURCE_LEDGER) {
      expect(s.license.length).toBeGreaterThan(0);
      expect(s.provider.length).toBeGreaterThan(0);
      expect(['api', 'db', 'tile']).toContain(s.type);
      expect(['A', 'B', 'C']).toContain(s.rank);
    }
  });
});
