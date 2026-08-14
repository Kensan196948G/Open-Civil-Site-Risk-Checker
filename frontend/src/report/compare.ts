// 候補地比較ビュー（Issue #175）の純粋ロジック。
// 複数地点（保存済み案件）の主要リスク要素を表形式で横並び比較し、
// Markdown / CSV エクスポートを生成する。
// 「データ未取得」と「リスク低」を明確に区別する既存設計思想を維持し、
// 安全/危険の断定表現は使わない。

import type { CaseRecord, Category, Finding, Priority } from '../types';
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
