// 候補地比較ビュー（Issue #175）の純粋ロジックテスト。
// 比較行の正規化・カテゴリ集約（未取得と低リスクの区別）・Markdown/CSV 生成を検証する。

import { describe, expect, it } from 'vitest';
import type { CaseRecord, Finding } from '../types';
import {
  COMPARE_CATEGORIES,
  buildCompareCsv,
  buildCompareHtml,
  buildCompareMd,
  cellMeta,
  summarizeCategory,
  toCompareRow,
} from './compare';

function finding(category: Finding['category'], status: Finding['status'], priority: Finding['priority'] = 'B'): Finding {
  return {
    id: `${category}-${status}-${priority}`,
    category,
    priority,
    title: `${category} の確認（デモ）`,
    summary: 'デモ所見',
    status,
    distance_m: status === 'found' ? 100 : null,
    caution: 'デモ',
    evidence: [
      {
        source_key: 'ksj',
        layer_name: 'デモ',
        attribution: 'デモサンプル（架空）',
        fetched_at: '2026-08-14 00:00:00',
        source_updated_at: '2026（合成）',
        quality_note: 'デモ',
        props: {},
      },
    ],
  };
}

function caseRecord(id: string, findings: Finding[]): CaseRecord {
  return {
    id,
    name: `候補地${id}`,
    code: `OCSRC-TEST-${id}`,
    address: `東京都${id}丁目（架空）`,
    lat: 35.6,
    lon: 139.7,
    radius: 500,
    date: '2026-08-14',
    status: 'done',
    counts: { A: 0, B: 0, C: 0, D: 0 },
    isDummy: true,
    findings,
  };
}

describe('toCompareRow', () => {
  it('案件を比較行へ正規化し、カテゴリ別に finding を振り分ける', () => {
    const row = toCompareRow(caseRecord('1', [finding('rivers', 'found'), finding('hazard', 'no_data')]));
    expect(row.byCategory.rivers).toHaveLength(1);
    expect(row.byCategory.hazard).toHaveLength(1);
    expect(row.byCategory.terrain).toHaveLength(0);
    expect(row.addressLabel()).toContain('（架空）');
  });

  it('findings を持たない案件は全カテゴリ空（データ未取得として扱う）', () => {
    const row = toCompareRow(caseRecord('2', []));
    COMPARE_CATEGORIES.forEach((cat) => {
      expect(row.byCategory[cat]).toHaveLength(0);
    });
  });
});

describe('summarizeCategory', () => {
  it('未取得（空）と該当なし・該当ありを区別する', () => {
    expect(summarizeCategory([])).toBe('no_data'); // データなし（低リスクとは断定しない）
    expect(summarizeCategory([finding('rivers', 'not_found')])).toBe('not_found');
    expect(summarizeCategory([finding('rivers', 'found')])).toBe('found');
  });

  it('該当あり/なし混在は mixed', () => {
    expect(summarizeCategory([finding('rivers', 'found'), finding('rivers', 'not_found')])).toBe('mixed');
  });

  it('cellMeta はラベルと色を持つ', () => {
    expect(cellMeta('no_data').label).toBe('データ未取得');
    expect(cellMeta('found').label).toBe('該当あり');
    expect(cellMeta('found').color).toBeTruthy();
  });
});

describe('buildCompareMd / buildCompareCsv', () => {
  const rows = [
    toCompareRow(caseRecord('1', [finding('rivers', 'found')])),
    toCompareRow(caseRecord('2', [finding('rivers', 'no_data')])),
  ];

  it('Markdown はカテゴリ行と地点ヘッダを含む', () => {
    const md = buildCompareMd(rows);
    expect(md).toContain('リスク要素比較');
    expect(md).toContain('河川・水域');
    expect(md).toContain('データ未取得');
    expect(md).toContain('該当あり');
    // 免責文（安全・危険の断定をしない旨）は含まれるが、finding の要約は断定しない
    expect(md).toContain('安全・危険の断定ではなく');
    expect(md).not.toContain('河川・水域の確認（デモ）は危険');
  });

  it('CSV は RFC 4180 形式でカテゴリ行を含む', () => {
    const csv = buildCompareCsv(rows);
    expect(csv).toContain('category');
    expect(csv).toContain('河川・水域');
    expect(csv.split('\n').length).toBeGreaterThan(3);
  });
});

describe('buildCompareHtml（A4 印刷・#175）', () => {
  const rows = [
    toCompareRow(caseRecord('1', [finding('rivers', 'found')])),
    toCompareRow(caseRecord('2', [finding('rivers', 'no_data')])),
  ];

  it('A4 横向き印刷向けの自己完結 HTML を生成する', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00');
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@page { size: A4 landscape');
    expect(html).toContain('リスク要素比較表');
    expect(html).toContain('河川・水域');
    expect(html).toContain('データ未取得');
    expect(html).toContain('該当あり');
    expect(html).toContain('優先度 A 合計');
  });

  it('免責文と出典注意を含む（断定表現なしの方針）', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00');
    expect(html).toContain('免責・注意事項');
    expect(html).toContain('データ未取得（no_data）は「リスクが低い」ではなく');
    expect(html).toContain('出典・取得日時は各案件の詳細を参照');
  });

  it('XSS エスケープが機能する', () => {
    const html = buildCompareHtml(
      [toCompareRow(caseRecord('1', []))].map((r) => ({ ...r, name: '<script>alert(1)</script>' })),
      '2026-08-15 00:00:00',
    );
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('地図キャプチャ未取得の場合は案内文を表示する（#274 方式）', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00');
    expect(html).toContain('位置関係マップの画像は未取得です');
    expect(html).toContain('地図画像を取得');
  });

  it('地図キャプチャ取得済みの場合は PNG を同梱し、出典・注記を明示する（#274 方式）', () => {
    const capture = {
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      width: 800,
      height: 600,
      center: { lat: 35.6745, lon: 139.7524 },
      zoom: 12,
      baseLayerLabel: '地理院タイル（淡色）',
      includedLayers: ['地理院タイル', '比較候補地'],
      excludedLayers: [],
      capturedAt: '2026-08-15T10:00:00.000Z',
      attribution: '地図: 地理院タイル（淡色） / 比較候補地 / 取得: 2026-08-15 19:00:00',
      notes: ['ベース地図は地理院タイルを出典明示の上でキャプチャしたものです（国土地理院コンテンツ利用規約の確認対象）。'],
    };
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00', capture);
    expect(html).toContain('候補地の位置関係（地図キャプチャ）');
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('比較候補地');
    expect(html).toContain('国土地理院コンテンツ利用規約の確認対象');
  });

  it('地図キャプチャの画像 URL も HTML エスケープされる（XSS 対策）', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00', {
      dataUrl: 'data:image/png;base64,<script>alert(1)</script>',
      width: 1,
      height: 1,
      center: { lat: 0, lon: 0 },
      zoom: 10,
      baseLayerLabel: 'x',
      includedLayers: [],
      excludedLayers: [],
      capturedAt: '2026-08-15T10:00:00.000Z',
      attribution: 'x',
      notes: [],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('気象警報が未チェックの場合は案内文を表示する（評価書 #18）', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00', null, {});
    expect(html).toContain('気象警報は未チェックです');
    expect(html).toContain('気象警報（現在）をチェック');
  });

  it('気象警報チェック済みの場合は候補地別に表示する（評価書 #18）', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00', null, {
      [rows[0].caseId]: { level: 'alert', label: '発表中（大雨警報）' },
      [rows[1].caseId]: { level: 'none', label: '発表なし' },
    });
    expect(html).toContain('気象警報（現在）');
    expect(html).toContain('発表中（大雨警報）');
    expect(html).toContain('発表なし');
    expect(html).toContain('都道府県（気象庁発表単位）');
  });

  it('気象警報のラベルも HTML エスケープされる（XSS 対策）', () => {
    const html = buildCompareHtml(rows, '2026-08-15 00:00:00', null, {
      [rows[0].caseId]: { level: 'alert', label: '発表中（<script>alert(1)</script>）' },
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
