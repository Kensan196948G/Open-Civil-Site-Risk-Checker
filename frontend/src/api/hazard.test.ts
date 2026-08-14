// ハザード区域判定アダプタ（Issue #112）のテスト。
// 区域内判定結果の Finding 変換（断定表現なし・種別/距離/出典の根拠保持）を検証する。

import { describe, expect, it } from 'vitest';
import { hazardAssessmentFinding, hazardLogLine, type HazardItem } from './hazard';

const floodInside: HazardItem = {
  dataset: 'hazard',
  name: '浸水想定区域（架空デモA）',
  hazard_type: 'flood',
  distance_m: 0,
  attrs: { scenario: '想定最大規模（デモ）' },
  source: 'テスト取込（hazard・合成）',
  source_updated_at: 'テスト',
  retrieved_at: '2026-08-14T00:00:00+09:00',
};

const landslideInside: HazardItem = {
  dataset: 'hazard',
  name: '土砂災害警戒区域（架空デモB）',
  hazard_type: 'landslide',
  distance_m: 0,
  attrs: { scenario: '土砂災害警戒区域（デモ）' },
  source: 'テスト取込（hazard・合成）',
  source_updated_at: 'テスト',
  retrieved_at: '2026-08-14T00:00:00+09:00',
};

const nearbyOnly: HazardItem = {
  dataset: 'hazard',
  name: '浸水想定区域（架空デモC・遠方）',
  hazard_type: 'flood',
  distance_m: 35200,
  attrs: { scenario: '想定最大規模（デモ）' },
  source: 'テスト取込（hazard・合成）',
  source_updated_at: 'テスト',
  retrieved_at: '2026-08-14T00:00:00+09:00',
};

describe('hazardAssessmentFinding', () => {
  it('区域内に土砂災害がある場合は優先度 A・区域内文言・根拠つき', () => {
    const f = hazardAssessmentFinding([floodInside, landslideInside], [], '2026-08-14 10:00:00');
    expect(f.category).toBe('hazard');
    expect(f.priority).toBe('A');
    expect(f.status).toBe('found');
    expect(f.summary).toContain('含まれます');
    expect(f.summary).toContain('浸水想定区域 1 件');
    expect(f.summary).toContain('土砂災害警戒区域 1 件');
    expect(f.evidence.length).toBe(2);
    expect(f.evidence[0].source_key).toBe('hazard_portal');
    expect(f.evidence[0].props.hazard_type).toBe('flood');
    // 断定表現（安全/危険）を含まない
    expect(f.summary.includes('安全')).toBe(false);
    expect(f.summary.includes('危険')).toBe(false);
    expect(f.summary.includes('必ず')).toBe(false);
    expect(f.summary.includes('絶対')).toBe(false);
  });

  it('区域内が浸水のみなら優先度 B', () => {
    const f = hazardAssessmentFinding([floodInside], [], '2026-08-14 10:00:00');
    expect(f.priority).toBe('B');
    expect(f.distance_m).toBe(0);
  });

  it('区域内なし・最寄りありは not_found と距離つき', () => {
    const f = hazardAssessmentFinding([], [nearbyOnly], '2026-08-14 10:00:00');
    expect(f.status).toBe('not_found');
    expect(f.priority).toBe('C');
    expect(f.distance_m).toBe(35200);
    expect(f.summary).toContain('含まれませんでした');
    expect(f.summary).toContain('約 35200m');
  });

  it('データ欠落（区域内も最寄りもなし）は no_data（取得失敗と区別）', () => {
    const f = hazardAssessmentFinding([], [], '2026-08-14 10:00:00');
    expect(f.status).toBe('no_data');
    expect(f.distance_m).toBeNull();
    expect(f.summary).toContain('未整備の可能性');
  });
});

describe('hazardLogLine', () => {
  it('成功・失敗のログ行を返す（疑似成功にしない）', () => {
    const ok = hazardLogLine(true, '200', '12', '');
    expect(ok.status).toBe('success');
    expect(ok.code).toBe('200');
    const failed = hazardLogLine(false, '503', '45', 'APIに到達できません');
    expect(failed.status).toBe('failed');
    expect(failed.code).toBe('503');
    expect(failed.error).toContain('APIに到達できません');
  });
});
