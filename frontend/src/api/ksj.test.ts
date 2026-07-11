import { describe, expect, it } from 'vitest';
import { ksjBaseUrl, ksjNearbyUrl, mapKsjItems, resolveBackendBase, type KsjItem } from './ksj';

const FETCHED = '2026-07-04 12:00:00';

// base 解決の優先順位は pure な resolveBackendBase で検証する。localStorage を
// 実際に読む経路（loadBackendUrlOverride）はこのプロジェクトの vitest 環境
// （environment: 'node', jsdom 非依存）ではテスト対象外（aiSettings.ts と同方針）。
// なお node 環境は localStorage も VITE_OCSRC_BACKEND_URL も無い＝出荷時の既定
// 状態なので、ksjBaseUrl() の既定値（same-origin = ''）はそのまま検証できる。

const river = (over: Partial<KsjItem> = {}): KsjItem => ({
  dataset: 'river',
  name: 'サンプル川',
  distance_m: 152.3,
  attrs: {},
  source: '国土数値情報 河川データ（W05）',
  source_updated_at: '2021年度',
  retrieved_at: '2026-07-04T12:00:00+09:00',
  ...over,
});

const facility = (over: Partial<KsjItem> = {}): KsjItem => ({
  dataset: 'facility',
  name: 'サンプル庁舎',
  distance_m: 320.9,
  attrs: {},
  source: '国土数値情報 公共施設データ',
  source_updated_at: '2020年度',
  retrieved_at: '2026-07-04T12:00:00+09:00',
  ...over,
});

describe('resolveBackendBase / ksjBaseUrl（Issue #57: same-origin 既定）', () => {
  it('未設定（保存なし・ビルド時 env なし）は ""＝same-origin 既定', () => {
    expect(resolveBackendBase('', undefined)).toBe('');
    expect(resolveBackendBase(undefined, '')).toBe('');
  });

  it('この単体テスト環境（保存も env も無い＝出荷時の既定状態）で ksjBaseUrl() は ""', () => {
    expect(ksjBaseUrl()).toBe('');
  });

  it('保存済みカスタム URL が最優先（後方互換: 既存ユーザー設定を尊重）', () => {
    expect(resolveBackendBase('http://192.168.0.10:8000', 'http://build.example:8000')).toBe('http://192.168.0.10:8000');
  });

  it('保存なしならビルド時 VITE_OCSRC_BACKEND_URL（後方互換）', () => {
    expect(resolveBackendBase('', 'http://127.0.0.1:8000/')).toBe('http://127.0.0.1:8000');
  });

  it('空白・末尾スラッシュは除去し、空白のみの値は未設定として扱う', () => {
    expect(resolveBackendBase(' http://x:8000/// ', '')).toBe('http://x:8000');
    expect(resolveBackendBase('   ', ' /')).toBe('');
  });
});

describe('ksjNearbyUrl（相対/絶対の組み立て）', () => {
  const input = { lat: 35.6, lon: 139.7, radius: 500 };

  it('base=""（same-origin 既定）は相対パス＝配信オリジンの /api プロキシ経由', () => {
    expect(ksjNearbyUrl('', input)).toBe('/api/v1/nearby?lat=35.6&lon=139.7&radius_m=500');
  });

  it('カスタム URL（直結）設定時は絶対 URL', () => {
    expect(ksjNearbyUrl('http://127.0.0.1:8000', input)).toBe(
      'http://127.0.0.1:8000/api/v1/nearby?lat=35.6&lon=139.7&radius_m=500',
    );
  });
});

describe('mapKsjItems', () => {
  it('河川ありなら found / 優先度B / 最寄り距離と出典を保持する', () => {
    const findings = mapKsjItems([river({ distance_m: 400 }), river({ name: '近い川', distance_m: 90 })], FETCHED);
    const f = findings.find((x) => x.category === 'rivers')!;
    expect(f.status).toBe('found');
    expect(f.priority).toBe('B');
    expect(f.distance_m).toBe(90);
    expect(f.summary).toContain('近い川');
    expect(f.summary).toContain('2件');
    expect(f.evidence[0].source_key).toBe('ksj');
    expect(f.evidence[0].attribution).toBe('国土数値情報 河川データ（W05）');
    expect(f.evidence[0].source_updated_at).toBe('2021年度');
  });

  it('0件なら not_found（該当なし≠リスクなし を明示、FR-304）', () => {
    const findings = mapKsjItems([], FETCHED);
    expect(findings).toHaveLength(2);
    for (const f of findings) {
      expect(f.status).toBe('not_found');
      expect(f.priority).toBe('D');
      expect(f.distance_m).toBeNull();
      expect(f.caution).toContain('取込済みデータの範囲内');
    }
  });

  it('施設は facilities カテゴリに割り当てる', () => {
    const findings = mapKsjItems([facility()], FETCHED);
    const f = findings.find((x) => x.category === 'facilities')!;
    expect(f.status).toBe('found');
    expect(f.summary).toContain('サンプル庁舎');
    const riverF = findings.find((x) => x.category === 'rivers')!;
    expect(riverF.status).toBe('not_found');
  });

  it('断定表現（安全/危険/リスクなし 等）を出力しない（要件 §3.2）', () => {
    const all = [...mapKsjItems([river(), facility()], FETCHED), ...mapKsjItems([], FETCHED)];
    const text = all.map((f) => `${f.title}${f.summary}${f.caution}`).join('');
    for (const banned of ['安全', '危険', 'リスクなし', '施工可', '問題なし']) {
      expect(text).not.toContain(banned);
    }
  });
});
