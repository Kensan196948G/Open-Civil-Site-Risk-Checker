import { describe, expect, it } from 'vitest';
import { mapKsjItems, type KsjItem } from './ksj';

const FETCHED = '2026-07-04 12:00:00';

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
