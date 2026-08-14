// 調査パック生成（Issue #113）のテスト。
// A4 印刷向け HTML に、出典一覧・確認チェックリスト・免責文・承認欄が含まれ、
// 断定表現なしの方針が維持されることを検証する。

import { describe, expect, it } from 'vitest';
import { PACK_CHECKLIST, buildPackHtml } from './pack';
import { SOURCE_LEDGER } from '../data/sources';
import type { MapCaptureResult } from '../map/capture';
import type { Finding, SiteLocation, SourceLedgerEntry } from '../types';

/** 地図キャプチャのテスト用フィクスチャ（Issue #274）。 */
function captureFixture(): MapCaptureResult {
  return {
    dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    width: 800,
    height: 600,
    center: { lat: 35.6745, lon: 139.7524 },
    zoom: 16,
    baseLayerLabel: '地理院タイル（淡色）',
    includedLayers: ['地理院タイル', 'OSM道路', 'OSM施設'],
    excludedLayers: [{ label: '洪水浸水想定', reason: '利用条件確認が必要' }],
    capturedAt: '2026-08-15T10:00:00.000Z',
    attribution: '地図: 地理院タイル（淡色） / 地理院タイル / 取得: 2026-08-15T10:00:00.000Z / 除外: 洪水浸水想定（利用条件確認が必要）',
    notes: ['画像除外: 洪水浸水想定（利用条件確認が必要）', 'ベース地図は地理院タイルを出典明示の上でキャプチャしたものです（国土地理院コンテンツ利用規約の確認対象）。'],
  };
}

const location: SiteLocation = {
  address: '東京都千代田区霞が関2丁目（架空）',
  lat: 35.6745,
  lon: 139.7524,
  radius: 500,
  coordLabel: '35.67450, 139.75240',
  radiusLabel: '500m',
};

const findings: Finding[] = [
  {
    id: 'f1',
    category: 'hazard',
    priority: 'A',
    title: '土砂災害警戒区域（架空）',
    summary: 'デモ所見',
    status: 'found',
    distance_m: 0,
    caution: 'デモデータ',
    evidence: [
      {
        source_key: 'hazard_portal',
        layer_name: '土砂災害警戒区域',
        attribution: 'デモサンプル（架空）',
        fetched_at: '2026-08-14 00:00:00',
        source_updated_at: '2026（合成）',
        quality_note: 'デモ',
        props: {},
      },
    ],
  },
];

function ctx(overrides: Partial<Parameters<typeof buildPackHtml>[0]> = {}) {
  return {
    location,
    findings,
    sources: SOURCE_LEDGER as SourceLedgerEntry[],
    visibility: 'internal' as const,
    fetchedAt: '2026-08-14 00:00:00',
    ...overrides,
  };
}

describe('buildPackHtml（調査パック・Issue #113 / 地図キャプチャ #274）', () => {
  it('A4 印刷向け HTML を生成し、主要セクションを含む', () => {
    const html = buildPackHtml(ctx());
    expect(html).toContain('<!doctype html>');
    expect(html).toContain('@page { size: A4');
    expect(html).toContain('1. 調査条件');
    expect(html).toContain('2. 位置関係・ハザード重ね合わせ図（地図キャプチャ）');
    expect(html).toContain('3. 確認優先度サマリー');
    expect(html).toContain('4. カテゴリ別確認結果');
    expect(html).toContain('5. 参照データ・出典一覧');
    expect(html).toContain('6. 現地確認チェックリスト');
    expect(html).toContain('7. 承認欄');
  });

  it('地図キャプチャ未取得の場合は案内文を表示する（#274）', () => {
    const html = buildPackHtml(ctx());
    expect(html).toContain('地図画像は未取得です。分析画面の「地図画像を取得」から取得すると、ここに表示されます。');
  });

  it('地図キャプチャ取得済みの場合は PNG を同梱し、出典・取得日時・注記を明示する（#274）', () => {
    const capture = captureFixture();
    const html = buildPackHtml(ctx({ mapCapture: capture }));
    expect(html).toContain('data:image/png;base64,');
    expect(html).toContain('地理院タイル（淡色）');
    expect(html).toContain('2026-08-15T10:00:00.000Z');
    expect(html).toContain('洪水浸水想定（利用条件確認が必要）');
    expect(html).toContain('国土地理院コンテンツ利用規約の確認対象');
  });

  it('地図キャプチャの画像 URL も HTML エスケープされる（XSS 対策）', () => {
    const html = buildPackHtml(ctx({ mapCapture: { ...captureFixture(), dataUrl: 'data:image/png;base64,<script>alert(1)</script>' } }));
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('出典一覧にライセンス・鮮度・利用条件が含まれる（#174 連携）', () => {
    const html = buildPackHtml(ctx());
    expect(html).toContain('国土数値情報（国土交通省）');
    expect(html).toContain('KSJ規約');
    expect(html).toContain('W05: 2021年度（合成）');
    expect(html).toContain('データセットごとに商用/非商用が異なる');
  });

  it('免責文と承認欄を含む', () => {
    const html = buildPackHtml(ctx());
    expect(html).toContain('免責・注意事項');
    expect(html).toContain('初期調査支援資料');
    expect(html).toContain('作成者');
    expect(html).toContain('承認者');
  });

  it('断定表現なし（安全/危険の断定・保証文言を言わない）', () => {
    const html = buildPackHtml(ctx());
    // 免責文で「安全性を断定するものではありません」は含むが、findings の要約に断定は無い
    expect(html).toContain('安全性を断定するものでは');
    expect(html).not.toContain('この場所は安全です');
    expect(html).not.toContain('この場所は危険です');
    expect(html).not.toContain('必ず安全');
  });

  it('HTML エスケープが機能する（XSS 対策）', () => {
    const html = buildPackHtml(ctx({ location: { ...location, address: '<script>alert(1)</script>' } }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('caseCode が指定されると meta 行に含まれる', () => {
    const html = buildPackHtml(ctx({ caseCode: 'OCSRC-DEMO-2026-101' }));
    expect(html).toContain('OCSRC-DEMO-2026-101');
  });
});

describe('PACK_CHECKLIST（確認チェックリスト）', () => {
  it('現地確認推奨項目が含まれ、断定しない', () => {
    expect(PACK_CHECKLIST.length).toBeGreaterThanOrEqual(5);
    for (const c of PACK_CHECKLIST) {
      expect(c.id).toBeTruthy();
      expect(c.label).toBeTruthy();
      // 断定表現（必ず・絶対・安全・危険）を含まない
      expect(c.label.includes('必ず')).toBe(false);
      expect(c.label.includes('絶対')).toBe(false);
      expect(c.label.includes('安全')).toBe(false);
      expect(c.label.includes('危険')).toBe(false);
    }
  });
});
