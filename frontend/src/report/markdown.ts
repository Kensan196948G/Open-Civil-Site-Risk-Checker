import type { Finding, SiteLocation, SourceLedgerEntry } from '../types';
import { CATEGORY_LABEL, SOURCE_SHORT, STATUS, radiusLabel, distanceLabel } from '../data/constants';
import { buildMemoText, countsOf } from '../risk/memo';

// Markdown レポート生成（要件 FR-306 / §14）。
// 調査条件・サマリー・カテゴリ別結果・AIメモ・取得できなかった情報・出典・免責を含める。

export interface ReportContext {
  location: SiteLocation;
  findings: Finding[];
  sources: SourceLedgerEntry[];
  visibility: 'internal' | 'public';
  fetchedAt: string;
}

export function buildReportMd(ctx: ReportContext): string {
  const { location, findings, sources, visibility, fetchedAt } = ctx;
  const counts = countsOf(findings);
  const L: string[] = [];

  L.push('# 工事候補地リスク確認メモ', '');

  L.push('## 1. 調査条件', '');
  L.push('| 項目 | 内容 |');
  L.push('|---|---|');
  L.push(`| 入力地点 | ${location.address || '—'} |`);
  L.push(`| 緯度経度 | ${location.lat.toFixed(5)}, ${location.lon.toFixed(5)} |`);
  L.push(`| 検索半径 | ${radiusLabel(location.radius || 500)} |`);
  L.push(`| 実行日時 | ${fetchedAt} |`);
  L.push(`| 公開区分 | ${visibility === 'internal' ? '社外秘 / 社内限定' : '社外可'} |`, '');

  L.push('## 2. 確認優先度サマリー', '');
  L.push('| 優先度 | 件数 |');
  L.push('|---|---:|');
  L.push(`| A：専門確認優先 | ${counts.A} |`);
  L.push(`| B：追加確認推奨 | ${counts.B} |`);
  L.push(`| C：参考情報あり | ${counts.C} |`);
  L.push(`| D：データ不足 | ${counts.D} |`, '');

  L.push('## 3. カテゴリ別確認結果', '');
  findings.forEach((f) => {
    L.push(`### [${f.priority}] ${f.title}（${CATEGORY_LABEL[f.category]}）`);
    const dl = distanceLabel(f.distance_m, f.intersects);
    L.push(`- 状態：${STATUS[f.status].label}${dl ? ` / 距離：${dl}` : ''}`);
    L.push(`- 概要：${f.summary}`);
    L.push(`- 出典：${f.evidence.map((e) => SOURCE_SHORT[e.source_key]).join(', ')}（取得：${f.evidence[0]?.fetched_at ?? '—'}）`);
    L.push(`- 注意：${f.caution}`, '');
  });

  L.push('## 4. AI調査メモ', '', buildMemoText(location, findings).replace(/^# AI調査メモ\n+/, ''), '');

  L.push('## 5. 取得できなかった情報', '');
  const missing = findings.filter((f) => f.category === 'data_quality' || f.status === 'failed' || f.status === 'no_data');
  if (missing.length) {
    missing.forEach((f) => L.push(`- ${f.title}（${f.evidence.map((e) => e.attribution).join(' / ')}）`));
  } else {
    L.push('- 特になし');
  }
  L.push('');

  L.push('## 6. 参照データ・出典', '');
  sources.forEach((s) => L.push(`- ${s.name}（${s.provider}） / ${s.license} / 状態：${s.stat}`));
  L.push('');

  L.push('## 7. 注意事項', '');
  L.push('本資料は公開データに基づく初期調査支援資料であり、施工可否、設計判断、法令適合性、安全性を断定するものではありません。');

  return L.join('\n');
}
