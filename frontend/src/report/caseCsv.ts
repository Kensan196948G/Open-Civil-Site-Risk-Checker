// ダッシュボード案件一覧 CSV エクスポート生成（SCR-000・調査案件の帳票）。
// 案件（名称・コード・所在地・実行日・状態・優先度内訳・種別）を RFC 4180 形式の
// CSV へ変換する。UTF-8 BOM は download 側で付与（Excel の文字化け防止）。
// 監査/取得ログの CSV（auditCsv.ts / logCsv.ts）と同じエスケープ方式。

import type { CaseRecord } from '../types';

/** 案件の種別ラベル（実データ / ダミー）。 */
export function caseKindLabel(c: CaseRecord): string {
  return c.isDummy ? 'ダミー' : '実データ';
}

/** 案件一覧を CSV 文字列へ変換する（RFC 4180・値中の " , 改行 はクォート）。 */
export function buildCasesCsv(cases: CaseRecord[]): string {
  const rows: string[][] = [
    ['name', 'code', 'address', 'date', 'status', 'kind', 'countA', 'countB', 'countC', 'countD'],
  ];
  for (const c of cases) {
    rows.push([
      c.name,
      c.code,
      c.address,
      c.date,
      c.status,
      caseKindLabel(c),
      String(c.counts.A ?? 0),
      String(c.counts.B ?? 0),
      String(c.counts.C ?? 0),
      String(c.counts.D ?? 0),
    ]);
  }
  return rows
    .map((r) => r.map((cell) => (/[",\n]/.test(String(cell)) ? `"${String(cell).replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
}
