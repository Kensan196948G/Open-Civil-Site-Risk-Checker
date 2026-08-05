import { describe, it, expect } from 'vitest';
import { buildReportMd, type ReportContext } from './markdown';
import { makeFinding, makeLocation, makeSource } from '../__testkit__/factories';

function ctx(over: Partial<ReportContext> = {}): ReportContext {
  return {
    location: makeLocation(),
    findings: [makeFinding({ priority: 'A' }), makeFinding({ id: 'F-002', priority: 'C' })],
    sources: [makeSource()],
    visibility: 'internal',
    fetchedAt: '2026-06-19 09:00:00',
    ...over,
  };
}

describe('buildReportMd', () => {
  it('規定の7セクション見出しを全て含む', () => {
    const md = buildReportMd(ctx());
    [
      '## 1. 調査条件',
      '## 2. 確認優先度サマリー',
      '## 3. カテゴリ別確認結果',
      '## 4. AI調査メモ',
      '## 5. 取得できなかった情報',
      '## 6. 参照データ・出典',
      '## 7. 注意事項',
    ].forEach((h) => expect(md).toContain(h));
  });

  it('免責文を必ず含む（断定回避コンプライアンス）', () => {
    const md = buildReportMd(ctx());
    expect(md).toContain('断定するものではありません');
    expect(md).toContain('法令適合性');
  });

  it('参考用途限定ラベルを含む（外部評価 Phase 0）', () => {
    const md = buildReportMd(ctx());
    expect(md).toContain('参考情報');
    expect(md).toContain('承認資料・発注者提出資料としては使用できません');
    expect(md).toContain('初期調査の入口');
  });

  it('公開区分ラベルを visibility で切り替える', () => {
    expect(buildReportMd(ctx({ visibility: 'internal' }))).toContain('社外秘 / 社内限定');
    expect(buildReportMd(ctx({ visibility: 'public' }))).toContain('社外可');
  });

  it('優先度サマリー表に件数を反映する', () => {
    const md = buildReportMd(
      ctx({ findings: [makeFinding({ priority: 'A' }), makeFinding({ id: 'F-2', priority: 'A' })] }),
    );
    expect(md).toContain('| A：専門確認優先 | 2 |');
  });

  it('参照データ・出典にソース台帳を列挙する', () => {
    const md = buildReportMd(ctx({ sources: [makeSource({ name: 'Open-Meteo', provider: 'Open-Meteo' })] }));
    expect(md).toContain('Open-Meteo');
  });
});
