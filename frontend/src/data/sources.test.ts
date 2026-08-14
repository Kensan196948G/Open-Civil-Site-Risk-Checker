// データ鮮度・ライセンス台帳（Issue #174）のテスト。
// 台帳レジストリの完全性（全ソース登録・鮮度/利用条件/履歴）と
// レポート出典への自動埋め込みを検証する。

import { describe, expect, it } from 'vitest';
import { SOURCE_LEDGER, cloneLedger } from './sources';
import { buildReportMd } from '../report/markdown';
import type { Finding, SiteLocation, SourceLedgerEntry } from '../types';

describe('SOURCE_LEDGER（データソース台帳・Issue #174）', () => {
  it('全データソースが登録され、ライセンス・鮮度・利用条件・履歴を持つ', () => {
    // 主要データソースのキーが全て登録されている
    const keys = SOURCE_LEDGER.map((s) => s.key);
    for (const k of ['nominatim', 'osm_overpass', 'open_meteo', 'ksj', 'hazard_portal', 'gsi_tile', 'plateau', 'xroad', 'jma_warning']) {
      expect(keys).toContain(k);
    }
    for (const s of SOURCE_LEDGER) {
      expect(s.license).toBeTruthy();
      // 鮮度（元データ更新日）は api/db/tile すべてに設定（未確認は明示的な '—' のみ可）
      expect(typeof s.sourceUpdatedAt).toBe('string');
      expect(typeof s.usageNote).toBe('string');
      expect(Array.isArray(s.refreshHistory)).toBe(true);
      // 実在情報を含まない（履歴の note はデモ明記）
      if (s.refreshHistory && s.refreshHistory.length) {
        for (const h of s.refreshHistory) {
          expect(/^\d{4}-\d{2}-\d{2}$/.test(h.at)).toBe(true);
        }
      }
    }
  });

  it('cloneLedger は元配列を破壊せず複製する', () => {
    const clone = cloneLedger();
    clone[0].last = 'changed';
    expect(SOURCE_LEDGER[0].last).toBe('—');
  });
});

describe('レポート出典への自動埋め込み（Issue #174）', () => {
  const location: SiteLocation = {
    address: '東京都千代田区霞が関2丁目（架空）',
    lat: 35.6745,
    lon: 139.7524,
    radius: 500,
    coordLabel: '35.67450, 139.75240',
    radiusLabel: '500m',
  };
  const findings: Finding[] = [];
  const sources: SourceLedgerEntry[] = SOURCE_LEDGER;

  it('参照データ・出典セクションに元データ更新日と利用条件が含まれる', () => {
    const md = buildReportMd({ location, findings, sources, visibility: 'internal', fetchedAt: '2026-08-14 00:00:00' });
    expect(md).toContain('## 6. 参照データ・出典');
    expect(md).toContain('元データ更新');
    expect(md).toContain('利用条件');
    // KSJ の鮮度・利用条件が埋め込まれる
    expect(md).toContain('国土数値情報（国土交通省）');
    expect(md).toContain('W05: 2021年度（合成）');
    expect(md).toContain('データセットごとに商用/非商用が異なる');
  });

  it('鮮度・利用条件が未設定のソースは省略される', () => {
    const bare: SourceLedgerEntry[] = [
      { key: 'ksj', name: '国土数値情報', provider: '国土交通省', type: 'db', license: 'KSJ規約', rank: 'A', stat: 'skipped', last: '—', enabled: true },
    ];
    const md = buildReportMd({ location, findings, sources: bare, visibility: 'internal', fetchedAt: '2026-08-14 00:00:00' });
    expect(md).toContain('国土数値情報（国土交通省） / KSJ規約 / 状態：skipped');
    expect(md).not.toContain('元データ更新');
  });
});
