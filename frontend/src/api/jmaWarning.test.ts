import { describe, expect, it } from 'vitest';
import {
  PREFECTURE_TO_JMA_CODE,
  REPRESENTATIVE_PREFECTURES,
  describeWarningCode,
  extractActiveWarnings,
  mapJmaFindings,
  resolveJmaCode,
  type JmaWarningResponse,
} from './jmaWarning';

// fetchJmaWarning / resolvePrefecture は Nominatim / 気象庁への実 fetch に依存するため、
// このプロジェクトの vitest 環境（environment: 'node', jsdom 非依存）ではユニットテスト
// 対象外とする（ksj.ts の fetchKsj と同じ既定方針）。手動 / 視覚確認で検証済み。

const FETCHED = '2026-07-04 12:00:00';

describe('resolveJmaCode', () => {
  it('47都道府県すべてにコードが存在する', () => {
    expect(Object.keys(PREFECTURE_TO_JMA_CODE)).toHaveLength(47);
    expect(resolveJmaCode('東京都')).toBe('130000');
    expect(resolveJmaCode('大阪府')).toBe('270000');
  });

  it('未対応の名称は undefined', () => {
    expect(resolveJmaCode('存在しない県')).toBeUndefined();
  });

  it('北海道・鹿児島県・沖縄県は代表地域コード扱いとして明示されている', () => {
    expect(REPRESENTATIVE_PREFECTURES.has('北海道')).toBe(true);
    expect(REPRESENTATIVE_PREFECTURES.has('鹿児島県')).toBe(true);
    expect(REPRESENTATIVE_PREFECTURES.has('沖縄県')).toBe(true);
    expect(REPRESENTATIVE_PREFECTURES.has('東京都')).toBe(false);
    expect(resolveJmaCode('北海道')).toBe('016000');
    expect(resolveJmaCode('鹿児島県')).toBe('460100');
    expect(resolveJmaCode('沖縄県')).toBe('471000');
  });
});

describe('describeWarningCode', () => {
  it('確認済みコードは正しい名称を返す', () => {
    expect(describeWarningCode('04')).toBe('洪水警報');
    expect(describeWarningCode('03')).toBe('大雨警報');
    expect(describeWarningCode('09')).toBe('土砂災害警戒情報');
  });

  it('未知のコードは名称を捏造せず「その他」で明示する', () => {
    expect(describeWarningCode('99')).toBe('その他の警報・注意報（コード: 99）');
  });
});

describe('extractActiveWarnings', () => {
  it('発表・継続のみを抽出し、解除・なし は除外する', () => {
    const doc: JmaWarningResponse = {
      areaTypes: [
        {
          areas: [
            { code: '130010', warnings: [{ status: '発表警報・注意報はなし' }] },
            {
              code: '130020',
              warnings: [
                { code: '14', status: '継続' },
                { code: '20', status: '継続' },
              ],
            },
            { code: '130040', warnings: [{ code: '20', status: '解除' }] },
            { code: '130050', warnings: [{ code: '04', status: '発表' }] },
          ],
        },
      ],
    };
    const active = extractActiveWarnings(doc);
    expect(active).toHaveLength(3);
    expect(active.map((a) => a.code).sort()).toEqual(['04', '14', '20']);
  });

  it('areaTypes が無い場合は空配列', () => {
    expect(extractActiveWarnings({})).toEqual([]);
  });
});

describe('mapJmaFindings', () => {
  it('発表中の警報が無ければ not_found、headlineText があればそれを summary に採用する', () => {
    const doc: JmaWarningResponse = {
      reportDatetime: '2026-07-04T10:00:00+09:00',
      headlineText: '',
      areaTypes: [{ areas: [{ code: '130010', warnings: [{ status: '発表警報・注意報はなし' }] }] }],
    };
    const findings = mapJmaFindings({ prefecture: '東京都', isRepresentative: false, doc, fetchedAt: FETCHED });
    expect(findings).toHaveLength(1);
    expect(findings[0].status).toBe('not_found');
    expect(findings[0].category).toBe('hazard');
    expect(findings[0].summary).toContain('東京都');
  });

  it('発表中の警報があれば found・優先度A、headlineText を summary に採用する', () => {
    const doc: JmaWarningResponse = {
      reportDatetime: '2026-07-04T10:00:00+09:00',
      headlineText: '伊豆諸島南部では、強風や高波に注意してください。',
      areaTypes: [
        {
          areas: [
            {
              code: '130030',
              warnings: [
                { code: '14', status: '継続' },
                { code: '16', status: '継続' },
              ],
            },
          ],
        },
      ],
    };
    const findings = mapJmaFindings({ prefecture: '東京都', isRepresentative: false, doc, fetchedAt: FETCHED });
    expect(findings[0].status).toBe('found');
    expect(findings[0].priority).toBe('A');
    expect(findings[0].summary).toBe('伊豆諸島南部では、強風や高波に注意してください。');
    expect(findings[0].evidence[0].props.warnings).toContain('雷注意報');
    expect(findings[0].evidence[0].props.warnings).toContain('波浪注意報');
  });

  it('代表地域（北海道・鹿児島県・沖縄県）は caution にその旨を明記する', () => {
    const doc: JmaWarningResponse = { areaTypes: [{ areas: [] }] };
    const findings = mapJmaFindings({ prefecture: '北海道', isRepresentative: true, doc, fetchedAt: FETCHED });
    expect(findings[0].caution).toContain('代表地域');
  });

  it('断定表現（安全/危険/リスクなし 等）を出力しない（要件 §3.2）', () => {
    const activeDoc: JmaWarningResponse = {
      areaTypes: [{ areas: [{ code: '130030', warnings: [{ code: '04', status: '発表' }] }] }],
    };
    const emptyDoc: JmaWarningResponse = { areaTypes: [{ areas: [] }] };
    const all = [
      ...mapJmaFindings({ prefecture: '東京都', isRepresentative: false, doc: activeDoc, fetchedAt: FETCHED }),
      ...mapJmaFindings({ prefecture: '東京都', isRepresentative: false, doc: emptyDoc, fetchedAt: FETCHED }),
    ];
    const text = all.map((f) => `${f.title}${f.summary}${f.caution}`).join('');
    for (const banned of ['安全', '危険', 'リスクなし', '施工可', '問題なし']) {
      expect(text).not.toContain(banned);
    }
  });
});
