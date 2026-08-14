// 候補地比較ビュー（Issue #175）の純粋ロジック。
// 複数地点（保存済み案件）の主要リスク要素を表形式で横並び比較し、
// Markdown / CSV エクスポートを生成する。
// 「データ未取得」と「リスク低」を明確に区別する既存設計思想を維持し、
// 安全/危険の断定表現は使わない。

import type { CaseRecord, Category, Finding, Priority } from '../types';
import type { MapCaptureResult } from '../map/capture';
import { CATEGORY_LABEL, STATUS } from '../data/constants';

// 比較表に出すカテゴリ（データ品質は含めない・主要リスク要素のみ）。
export const COMPARE_CATEGORIES: Exclude<Category, 'data_quality'>[] = [
  'hazard',
  'rivers',
  'terrain',
  'weather',
  'roads',
  'facilities',
];

/** 比較対象1地点の正規化データ。findings を持たない案件は空配列で扱う。 */
export interface CompareRow {
  caseId: string;
  name: string;
  code: string;
  date: string;
  address: string;
  lat: number;
  lon: number;
  radius: number;
  /** カテゴリごとの finding 一覧（見つかったもの・未取得を区別して保持）。 */
  byCategory: Record<Category, Finding[]>;
  counts: Record<Priority, number>;

  /** 表示用の住所ラベル（未設定時は緯度経度）。 */
  addressLabel(): string;
}

/** 案件を比較行へ正規化する。findings が無い場合は counts のみ（全カテゴリ空）。 */
export function toCompareRow(c: CaseRecord): CompareRow {
  const byCategory = {} as Record<Category, Finding[]>;
  (['hazard', 'rivers', 'terrain', 'weather', 'roads', 'facilities', 'data_quality'] as Category[]).forEach(
    (cat) => {
      byCategory[cat] = (c.findings ?? []).filter((f) => f.category === cat);
    },
  );
  const addressLabel = () =>
    c.address && c.address !== c.name ? c.address : `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`;
  return {
    caseId: c.id,
    name: c.name,
    code: c.code,
    date: c.date,
    address: c.address,
    lat: c.lat,
    lon: c.lon,
    radius: c.radius,
    byCategory,
    counts: c.counts,
    addressLabel,
  };
}

export type CellStatus = 'found' | 'not_found' | 'no_data' | 'mixed';

/** カテゴリのセル状態を集約する（断定しない・未取得と低リスクを区別）。 */
export function summarizeCategory(findings: Finding[]): CellStatus {
  if (findings.length === 0) return 'no_data'; // データなし（低リスクとは断定しない）
  const found = findings.some((f) => f.status === 'found');
  const notFound = findings.some((f) => f.status === 'not_found');
  if (found && notFound) return 'mixed';
  if (found) return 'found';
  return 'not_found';
}

const CELL_LABEL: Record<CellStatus, string> = {
  found: '該当あり',
  not_found: '該当なし',
  no_data: 'データ未取得',
  mixed: '該当あり/なし混在',
};

const CELL_COLOR: Record<CellStatus, string> = {
  found: 'var(--err-text)',
  not_found: 'var(--text-2)',
  no_data: 'var(--text-3)',
  mixed: 'var(--warn-text, #b5701a)',
};

export function cellMeta(status: CellStatus): { label: string; color: string } {
  return { label: CELL_LABEL[status], color: CELL_COLOR[status] };
}

/** セル内の詳細行（カテゴリ内の各 finding の要約）。 */
export function cellDetail(findings: Finding[]): string[] {
  return findings.map((f) => {
    const st = STATUS[f.status].label;
    const dist = f.distance_m != null ? ` / 約${Math.round(f.distance_m)}m` : '';
    return `[${f.priority}] ${f.title}（${st}${dist}）`;
  });
}

// ---------------------------------------------------------------------------
// エクスポート生成
// ---------------------------------------------------------------------------

/** 比較表の Markdown 生成（受入条件: 出典・取得日時 or 未取得の区別を保持）。 */
export function buildCompareMd(rows: CompareRow[]): string {
  const L: string[] = [];
  L.push('# 工事候補地 リスク要素比較（デモ用・参考情報）', '');
  L.push('> 本表は保存済み案件の確認結果を横並びにした**参考情報**です。安全・危険の断定ではなく、自治体公表資料と現地確認による再確認が必要です。', '');
  L.push('| 項目 | ' + rows.map((r) => r.name).join(' | ') + ' |');
  L.push('| --- | ' + rows.map(() => '---').join(' | ') + ' |');
  rows.forEach((r) => {
    L.push(`| 地点 | ${r.addressLabel()} |`);
    L.push(`| 番号/日付 | ${r.code} / ${r.date} |`);
  });
  L.push('');
  L.push('## カテゴリ別比較', '');
  L.push('| カテゴリ | ' + rows.map((r) => r.name).join(' | ') + ' |');
  L.push('| --- | ' + rows.map(() => '---').join(' | ') + ' |');
  COMPARE_CATEGORIES.forEach((cat) => {
    const cells = rows.map((r) => {
      const fs = r.byCategory[cat];
      const meta = cellMeta(summarizeCategory(fs));
      const details = cellDetail(fs);
      return details.length ? `${meta.label}（${details.join(' / ')}）` : meta.label;
    });
    L.push(`| ${CATEGORY_LABEL[cat]} | ${cells.join(' | ')} |`);
  });
  L.push('');
  L.push('## 優先度集計', '');
  L.push('| 優先度 | ' + rows.map((r) => r.name).join(' | ') + ' |');
  L.push('| --- | ' + rows.map(() => '---').join(' | ') + ' |');
  (['A', 'B', 'C', 'D'] as Priority[]).forEach((g) => {
    L.push(`| ${g} | ${rows.map((r) => String(r.counts[g] ?? 0)).join(' | ')} |`);
  });
  L.push('');
  L.push('> 出典: 各案件の確認結果（取得日時・出典は案件詳細を参照）。データ未取得と低リスクは区別しています。', '');
  return L.join('\n');
}

/** 比較表の CSV 生成（RFC 4180・UTF-8 BOM は download 側で付与）。 */
export function buildCompareCsv(rows: CompareRow[]): string {
  const out: string[][] = [];
  out.push(['category', ...rows.map((r) => r.name)]);
  COMPARE_CATEGORIES.forEach((cat) => {
    const cells = rows.map((r) => {
      const fs = r.byCategory[cat];
      const meta = cellMeta(summarizeCategory(fs));
      const details = cellDetail(fs);
      return details.length ? `${meta.label}: ${details.join(' / ')}` : meta.label;
    });
    out.push([CATEGORY_LABEL[cat], ...cells]);
  });
  out.push(['data_notice', '出典・取得日時は各案件詳細を参照。データ未取得と低リスクは区別。']);
  return out
    .map((row) => row.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}

/** HTML をエスケープする（XSS 対策・比較表の文言エスケープ）。 */
function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 比較表の A4 印刷向け自己完結 HTML を生成する（#113 調査パックと同方式）。 */
export function buildCompareHtml(
  rows: CompareRow[],
  generatedAt: string,
  mapCapture?: MapCaptureResult | null,
): string {
  const headerCells = rows
    .map(
      (r) =>
        `<th><div class="name">${escHtml(r.name)}</div>` +
        `<div class="meta">${escHtml(r.code)} / ${escHtml(r.date)}</div>` +
        `<div class="meta">${escHtml(r.addressLabel())}</div></th>`,
    )
    .join('\n');

  const bodyRows = COMPARE_CATEGORIES.map((cat) => {
    const cells = rows
      .map((r) => {
        const fs = r.byCategory[cat];
        const meta = cellMeta(summarizeCategory(fs));
        const details = cellDetail(fs);
        const color = meta.label === '該当あり' || meta.label.includes('混在') ? '#c5392f' : '#5a6678';
        const detailHtml = details
          .map((d) => `<div class="detail">${escHtml(d)}</div>`)
          .join('');
        return `<td><span class="status" style="color:${color};font-weight:700">${escHtml(meta.label)}</span>${detailHtml}</td>`;
      })
      .join('\n');
    return `<tr><th class="cat">${escHtml(CATEGORY_LABEL[cat])}</th>${cells}</tr>`;
  }).join('\n');

  const prioCells = rows
    .map((r) => `<td style="text-align:center">${r.counts.A ?? 0}</td>`)
    .join('\n');

  // 地図キャプチャセクション（#274 方式・SCR-010 の位置関係を画像で残す）。
  const mapCaptureHtml = mapCapture
    ? `<figure>
        <img src="${escHtml(mapCapture.dataUrl)}" alt="候補地の位置関係（地図キャプチャ・出典: ${escHtml(mapCapture.baseLayerLabel)}）" style="width:100%;max-width:270mm;border:1px solid #ccd4de;border-radius:4px;"/>
        <figcaption class="meta">${escHtml(mapCapture.attribution)}</figcaption>
        ${mapCapture.notes.map((n) => `<p class="meta">※ ${escHtml(n)}</p>`).join('\n')}
      </figure>`
    : `<p class="meta">位置関係マップの画像は未取得です（比較画面の「地図画像を取得」から取得すると印刷/PDF に同梱されます）。</p>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>候補地比較表</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif; color: #1c2733; font-size: 10pt; line-height: 1.6; margin: 0; }
  h1 { font-size: 15pt; margin: 0 0 2pt; }
  .meta { color: #5a6678; font-size: 8.5pt; }
  table { width: 100%; border-collapse: collapse; margin: 8pt 0; }
  th, td { border: 1px solid #ccd4de; padding: 6pt 8pt; text-align: left; vertical-align: top; font-size: 9pt; }
  th { background: #eef2f8; }
  th.cat { width: 14%; white-space: nowrap; }
  th .name { font-size: 9.5pt; font-weight: 700; }
  .detail { color: #3c4a5c; font-size: 8.5pt; margin-top: 2pt; }
  .status { white-space: nowrap; }
  .notice { background: #fdf6e3; border: 1px solid #e8d9a0; padding: 7pt 9pt; font-size: 8.5pt; margin: 6pt 0; }
  figure { margin: 10pt 0; }
  figcaption { margin-top: 3pt; }
  .footer { margin-top: 10pt; font-size: 8pt; color: #5a6678; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:10px;padding:8px 18px;font-size:12px;cursor:pointer;">🖨 このページを PDF として印刷</button>
  <h1>工事候補地 リスク要素比較表</h1>
  <p class="meta">作成: ${escHtml(generatedAt)} / 比較対象 ${rows.length} 地点</p>

  <table>
    <thead><tr><th class="cat">カテゴリ</th>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
    <tfoot>
      <tr><th class="cat">優先度 A 合計</th>${prioCells}</tr>
    </tfoot>
  </table>

  <h2 style="font-size:11pt;margin:10pt 0 4pt;border-bottom:1px solid #ccd4de;padding-bottom:2pt;">候補地の位置関係（地図キャプチャ）</h2>
  ${mapCaptureHtml}

  <div class="notice">
    <b>免責・注意事項</b>：本表は保存済み案件の確認結果を横並びにした<strong>参考情報</strong>です。
    データ未取得（no_data）は「リスクが低い」ではなく判断材料の不足を意味します。安全・危険を断定するものではなく、
    自治体公表資料と現地確認による再確認が必要です。出典・取得日時は各案件の詳細を参照してください。
  </div>
  <p class="footer">本表は「工事候補地リスクチェッカー」で生成された参考情報です（デモ用サンプルを含む場合があります）。</p>
</body>
</html>`;
}
