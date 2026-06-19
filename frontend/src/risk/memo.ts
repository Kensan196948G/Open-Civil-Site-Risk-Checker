import type { Finding, Priority, SiteLocation } from '../types';
import { CATEGORY_LABEL, PRIO, radiusLabel } from '../data/constants';

// AI調査メモ生成（要件 FR-401〜405 / §14.2）。
// 断定表現を避け、「要確認事項」「追加調査候補」「現地確認候補」「参照データ」
// 「取得できなかった情報」「免責」を含める。各要確認事項には根拠データを紐付ける。

export function countsOf(findings: Finding[]): Record<Priority, number> {
  const c: Record<Priority, number> = { A: 0, B: 0, C: 0, D: 0 };
  findings.forEach((f) => (c[f.priority] += 1));
  return c;
}

export function buildMemoText(location: SiteLocation, findings: Finding[]): string {
  const counts = countsOf(findings);
  const lines: string[] = [];
  lines.push('# AI調査メモ', '');

  lines.push('## 1. 調査地点');
  lines.push(`- 住所：${location.address || '—'}`);
  lines.push(`- 緯度経度：${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`);
  lines.push(`- 検索半径：${radiusLabel(location.radius || 500)}`, '');

  lines.push('## 2. 確認優先度サマリー');
  lines.push(`- 専門確認優先（A）：${counts.A}件`);
  lines.push(`- 追加確認推奨（B）：${counts.B}件`);
  lines.push(`- 参考情報（C）：${counts.C}件`);
  lines.push(`- データ不足（D）：${counts.D}件`, '');

  lines.push('## 3. 要確認事項');
  const top = findings.filter((f) => f.priority === 'A' || f.priority === 'B');
  if (top.length) {
    top.forEach((f) => lines.push(`- [${f.priority}] ${f.title}：${f.summary}（根拠：${f.id} / ${f.evidence.map((e) => e.layer_name).join(', ')}）`));
  } else {
    lines.push('- 公開データ上、優先確認すべき項目は検出されませんでした（データ不足の可能性を含みます）。');
  }
  lines.push('');

  lines.push('## 4. 追加調査候補');
  lines.push('- 河川・水路管理者資料による護岸・暗渠区間の確認');
  lines.push('- 自治体公表の浸水想定区域図および避難情報の確認');
  lines.push('- 地質資料・既往ボーリングデータによる地盤条件の確認', '');

  lines.push('## 5. 現地確認候補');
  lines.push('- 搬入経路の幅員・交通規制・占用条件');
  lines.push('- 周辺施設（官公庁・学校・駅）の運用時間と動線', '');

  lines.push('## 6. 取得できなかった情報');
  const missing = findings.filter((f) => f.category === 'data_quality' || f.status === 'failed' || f.status === 'no_data');
  if (missing.length) {
    missing.forEach((f) => lines.push(`- ${f.title}（${f.evidence.map((e) => e.attribution).join(' / ')}）`));
  } else {
    lines.push('- 特になし（主要データソースの取得に成功）');
  }
  lines.push('');

  lines.push('## 7. 参照データ');
  const refs = new Set<string>();
  findings.forEach((f) => f.evidence.forEach((e) => refs.add(e.attribution)));
  Array.from(refs).forEach((r) => lines.push(`- ${r}`));
  lines.push('');

  lines.push('## 8. 注意事項');
  lines.push('本メモは公開データに基づく初期調査支援であり、施工可否、法的適合性、安全性を断定するものではありません。各要確認事項には根拠データIDを紐付けています。');

  return lines.join('\n');
}

export interface MemoLine {
  text: string;
  bullet: boolean;
}
export interface MemoSection {
  heading: string;
  lines: MemoLine[];
}

/** メモ本文（Markdown）を見出し単位のセクションに分解（閲覧表示用）。 */
export function memoSectionsFromText(text: string): MemoSection[] {
  const sections: MemoSection[] = [];
  text.split(/\n## /).forEach((blk, i) => {
    const raw = i === 0 ? blk.replace(/^# .*\n*/, '') : `## ${blk}`;
    const arr = raw.split('\n').filter((x) => x.trim());
    if (!arr.length) return;
    const heading = arr[0].replace(/^#+\s*/, '');
    const body: MemoLine[] = arr.slice(1).map((l) => {
      const bullet = /^-\s/.test(l);
      return { text: bullet ? `• ${l.replace(/^-\s*/, '')}` : l, bullet };
    });
    sections.push({ heading, lines: body });
  });
  return sections;
}

/** カード/プレビュー用の1行サマリー。 */
export function memoPreview(findings: Finding[]): string {
  const top = findings.filter((f) => f.priority === 'A' || f.priority === 'B');
  const head = top.length
    ? top.map((f) => `【${f.priority}】${f.title}`).join('　/　')
    : '優先確認項目は検出されていません';
  return `${head} — 詳細は全文をご確認ください。各要確認事項には根拠データを紐付けています。`;
}

export { PRIO, CATEGORY_LABEL };
