// 調査パック生成（Issue #113・評価 P1-8）。
// Markdown/CSV に加えて、A4 印刷向け HTML（出典一覧・確認チェックリスト・免責文・
// 承認欄）を一括生成する。ブラウザ印刷 CSS（@media print）+ window.print() で
// PDF 化する軽量方式（leaflet-image 等の依存追加は評価後に判断）。
// 断定表現なし（安全/危険を言わない）方針をテンプレート文言でも維持する。

import type { Finding, SiteLocation, SourceLedgerEntry } from '../types';
import type { MapCaptureResult } from '../map/capture';
import { CATEGORY_LABEL, SOURCE_SHORT, STATUS, distanceLabel } from '../data/constants';
import { countsOf } from '../risk/memo';

export interface PackContext {
  location: SiteLocation;
  findings: Finding[];
  sources: SourceLedgerEntry[];
  visibility: 'internal' | 'public';
  fetchedAt: string;
  caseCode?: string;
  /** 地図キャプチャ（Issue #274）。分析画面で取得した PNG を同梱する。 */
  mapCapture?: MapCaptureResult | null;
}

/** 現地確認チェックリスト項目（架空のデモ用・断定しない）。 */
export const PACK_CHECKLIST = [
  { id: 'c1', label: '現地の周辺道路・進入経路を目視確認する（搬入可否は現地判断）' },
  { id: 'c2', label: '近接する河川・水域の護岸状態と水位標を確認する' },
  { id: 'c3', label: 'ハザード区域の最新版（自治体公表）と本資料の判定を突き合わせる' },
  { id: 'c4', label: '地形・地盤（軟弱地盤・盛土等）は現地踏査と専門調査で確認する' },
  { id: 'c5', label: '周辺施設（学校・病院等）の影響と工事時期を調整する' },
  { id: 'c6', label: '気象リスク（強雨・強風）は工事期間の予報と重ねて再確認する' },
] as const;

/** HTML をエスケープする（XSS 対策・レポート文言のエスケープ）。 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A4 印刷向けの自己完結 HTML 調査パックを生成する。 */
export function buildPackHtml(ctx: PackContext): string {
  const { location, findings, sources, visibility, fetchedAt, caseCode, mapCapture } = ctx;
  const counts = countsOf(findings);
  const visLabel = visibility === 'internal' ? '社外秘 / 社内限定' : '社外可';

  const findingRows = findings
    .map((f) => {
      const dl = distanceLabel(f.distance_m, f.intersects);
      const sourcesTxt = f.evidence.map((e) => SOURCE_SHORT[e.source_key]).join(', ');
      const fetched = f.evidence[0]?.fetched_at ?? '—';
      return `<tr>
        <td>[${esc(f.priority)}] ${esc(f.title)}（${esc(CATEGORY_LABEL[f.category])}）</td>
        <td>${esc(STATUS[f.status].label)}${dl ? ` / ${esc(dl)}` : ''}</td>
        <td>${esc(sourcesTxt)}<br/><span class="muted">取得: ${esc(fetched)}</span></td>
        <td>${esc(f.caution)}</td>
      </tr>`;
    })
    .join('\n');

  const sourceRows = sources
    .map((s) => {
      const freshness = s.sourceUpdatedAt ? ` / 更新: ${esc(s.sourceUpdatedAt)}` : '';
      const usage = s.usageNote ? ` / 条件: ${esc(s.usageNote)}` : '';
      return `<tr><td>${esc(s.name)}（${esc(s.provider)}）</td><td>${esc(s.license)}</td><td>${esc(s.stat)}${freshness}${usage}</td></tr>`;
    })
    .join('\n');

  const checklistRows = PACK_CHECKLIST.map(
    (c) => `<tr><td class="check">□</td><td>${esc(c.label)}</td><td class="check">□</td><td></td></tr>`,
  ).join('\n');

  // 地図キャプチャセクション（Issue #274）。画像・出典キャプション・ライセンス注記を同梱する。
  const mapCaptureHtml = mapCapture
    ? `<figure>
        <img src="${esc(mapCapture.dataUrl)}" alt="候補地周辺の地図キャプチャ（出典: ${esc(mapCapture.baseLayerLabel)}・${esc(mapCapture.center.lat.toFixed(5))}, ${esc(mapCapture.center.lon.toFixed(5))}）" style="width:100%;max-width:185mm;border:1px solid #ccd4de;border-radius:4px;"/>
        <figcaption class="muted">${esc(mapCapture.attribution)}</figcaption>
        ${mapCapture.notes.map((n) => `<p class="muted">※ ${esc(n)}</p>`).join('\n')}
      </figure>`
    : `<p class="muted">地図画像は未取得です。分析画面の「地図画像を取得」から取得すると、ここに表示されます。</p>`;

  return `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8"/>
<title>調査パック ${esc(location.address || '')}</title>
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Hiragino Kaku Gothic ProN", "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif; color: #1c2733; font-size: 10.5pt; line-height: 1.6; margin: 0; }
  h1 { font-size: 16pt; margin: 0 0 4pt; }
  h2 { font-size: 12pt; border-bottom: 2px solid #2e5aac; padding-bottom: 2pt; margin: 16pt 0 8pt; }
  .meta { color: #5a6678; font-size: 9.5pt; margin: 2pt 0; }
  .muted { color: #5a6678; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin: 6pt 0; }
  th, td { border: 1px solid #ccd4de; padding: 5pt 7pt; text-align: left; vertical-align: top; font-size: 9.5pt; }
  th { background: #eef2f8; }
  .check { text-align: center; width: 22pt; }
  figure { margin: 8pt 0; }
  figcaption { margin-top: 4pt; }
  .notice { background: #fdf6e3; border: 1px solid #e8d9a0; padding: 8pt 10pt; font-size: 9.5pt; margin: 8pt 0; }
  .approval td { height: 34pt; }
  .footer { margin-top: 18pt; font-size: 8.5pt; color: #5a6678; text-align: center; }
  @media print { .no-print { display: none; } body { font-size: 10pt; } }
</style>
</head>
<body>
  <button class="no-print" onclick="window.print()" style="margin-bottom:12px;padding:8px 18px;font-size:12px;cursor:pointer;">🖨 このページを PDF として印刷</button>
  <h1>工事候補地 調査パック</h1>
  <p class="meta">${esc(visLabel)} / 作成: ${esc(fetchedAt)}${caseCode ? ` / 対象案件: ${esc(caseCode)}` : ''}</p>

  <h2>1. 調査条件</h2>
  <table>
    <tr><th style="width:24%">入力地点</th><td>${esc(location.address || '—')}</td></tr>
    <tr><th>緯度経度</th><td>${esc(location.lat.toFixed(5))}, ${esc(location.lon.toFixed(5))}</td></tr>
    <tr><th>検索半径</th><td>${esc(location.radiusLabel || `${location.radius}m`)}</td></tr>
    <tr><th>公開区分</th><td>${esc(visLabel)}</td></tr>
  </table>

  <h2>2. 位置関係・ハザード重ね合わせ図（地図キャプチャ）</h2>
  ${mapCaptureHtml}

  <h2>3. 確認優先度サマリー</h2>
  <table>
    <tr><th>A: 専門確認優先</th><th>B: 追加確認推奨</th><th>C: 参考情報あり</th><th>D: データ不足</th></tr>
    <tr><td>${counts.A}</td><td>${counts.B}</td><td>${counts.C}</td><td>${counts.D}</td></tr>
  </table>

  <h2>4. カテゴリ別確認結果</h2>
  <table>
    <tr><th style="width:34%">項目</th><th style="width:16%">状態</th><th style="width:20%">出典</th><th>注意</th></tr>
    ${findingRows || '<tr><td colspan="4" class="muted">確認結果なし（データ未取得）</td></tr>'}
  </table>

  <h2>5. 参照データ・出典一覧</h2>
  <table>
    <tr><th>データソース</th><th>ライセンス</th><th>状態 / 鮮度 / 利用条件</th></tr>
    ${sourceRows}
  </table>

  <h2>6. 現地確認チェックリスト</h2>
  <table>
    <tr><th style="width:22pt">確認</th><th>項目</th><th style="width:22pt">確認</th><th>メモ</th></tr>
    ${checklistRows}
  </table>

  <div class="notice">
    <b>免責・注意事項</b>：本資料は公開データに基づく<strong>初期調査支援資料</strong>です。施工可否、設計判断、
    法令適合性、安全性を断定するものではなく、承認・稟議・発注者説明の根拠資料としては使用できません。
    公的資料（自治体公表のハザード区域図等）と現地確認による再確認が必要です。
  </div>

  <h2>7. 承認欄</h2>
  <table class="approval">
    <tr><th style="width:16%">作成者</th><td></td><th style="width:16%">確認者</th><td></td><th style="width:16%">承認者</th><td></td></tr>
    <tr><th>日付</th><td></td><th>日付</th><td></td><th>日付</th><td></td></tr>
  </table>

  <p class="footer">本資料は「工事候補地リスクチェッカー」で生成された参考情報です（デモ用サンプルを含む場合があります）。</p>
</body>
</html>`;
}

/** 調査パックを新しいウィンドウで開き、印刷ダイアログを表示する。 */
export function openPackForPrint(html: string): void {
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
  // 描画完了後に印刷ダイアログ（A4 PDF 保存を含む）を出す。
  win.onload = () => {
    setTimeout(() => win.print(), 250);
  };
}
