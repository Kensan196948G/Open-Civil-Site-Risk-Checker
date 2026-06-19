import { describe, it, expect } from 'vitest';
import {
  countsOf,
  buildMemoText,
  memoSectionsFromText,
  memoPreview,
} from './memo';
import { makeFinding, makeLocation, makeEvidence } from '../__testkit__/factories';

describe('countsOf', () => {
  it('優先度ごとに件数を集計する', () => {
    const findings = [
      makeFinding({ priority: 'A' }),
      makeFinding({ priority: 'A' }),
      makeFinding({ priority: 'B' }),
      makeFinding({ priority: 'D' }),
    ];
    expect(countsOf(findings)).toEqual({ A: 2, B: 1, C: 0, D: 1 });
  });
  it('空配列でも全優先度 0 を返す', () => {
    expect(countsOf([])).toEqual({ A: 0, B: 0, C: 0, D: 0 });
  });
});

describe('buildMemoText（断定回避コンプライアンス）', () => {
  const location = makeLocation();

  it('免責文を必ず含む（施工可否・法的適合性・安全性を断定しない）', () => {
    const text = buildMemoText(location, [makeFinding()]);
    expect(text).toContain('断定するものではありません');
    expect(text).toContain('施工可否');
  });

  it('規定の8セクション見出しを全て含む', () => {
    const text = buildMemoText(location, [makeFinding()]);
    [
      '## 1. 調査地点',
      '## 2. 確認優先度サマリー',
      '## 3. 要確認事項',
      '## 4. 追加調査候補',
      '## 5. 現地確認候補',
      '## 6. 取得できなかった情報',
      '## 7. 参照データ',
      '## 8. 注意事項',
    ].forEach((h) => expect(text).toContain(h));
  });

  it('要確認事項(A/B)には根拠データID を紐付ける（NFR-301）', () => {
    const text = buildMemoText(location, [
      makeFinding({ id: 'F-AAA', priority: 'A', title: '浸水想定の重なり' }),
    ]);
    expect(text).toContain('根拠：F-AAA');
    expect(text).toContain('浸水想定の重なり');
  });

  it('A/B が無い場合は「優先確認項目なし（データ不足の可能性含む）」を明記', () => {
    const text = buildMemoText(location, [makeFinding({ priority: 'C' })]);
    expect(text).toContain('優先確認すべき項目は検出されませんでした');
    expect(text).toContain('データ不足の可能性');
  });

  it('取得失敗・データ品質の項目を「取得できなかった情報」に列挙する', () => {
    const text = buildMemoText(location, [
      makeFinding({
        id: 'F-FAIL',
        category: 'data_quality',
        status: 'failed',
        title: 'PLATEAU 取得失敗',
        evidence: [makeEvidence({ attribution: 'PLATEAU（国土交通省）' })],
      }),
    ]);
    expect(text).toContain('PLATEAU 取得失敗');
    expect(text).toContain('PLATEAU（国土交通省）');
  });
});

describe('memoSectionsFromText', () => {
  it('Markdown を見出し単位のセクションへ分解する', () => {
    const text = buildMemoText(makeLocation(), [makeFinding({ priority: 'A' })]);
    const sections = memoSectionsFromText(text);
    expect(sections).toHaveLength(8);
    expect(sections[0].heading).toBe('1. 調査地点');
    // 箇条書き行は • プレフィックスが付与される
    const bulletLines = sections.flatMap((s) => s.lines).filter((l) => l.bullet);
    expect(bulletLines.length).toBeGreaterThan(0);
    bulletLines.forEach((l) => expect(l.text.startsWith('• ')).toBe(true));
  });
});

describe('memoPreview', () => {
  it('A/B があれば【優先度】タイトル形式で並べる', () => {
    const preview = memoPreview([
      makeFinding({ priority: 'A', title: '急傾斜地' }),
      makeFinding({ priority: 'B', title: '幅員狭小' }),
    ]);
    expect(preview).toContain('【A】急傾斜地');
    expect(preview).toContain('【B】幅員狭小');
    expect(preview).toContain('根拠データ');
  });
  it('A/B が無ければ未検出メッセージを返す', () => {
    const preview = memoPreview([makeFinding({ priority: 'C' })]);
    expect(preview).toContain('優先確認項目は検出されていません');
  });
});
