// 取得ログ CSV エクスポート生成（SCR-007・実行履歴の証跡）。
// 取得ログ（時刻・ソース・エンドポイント・コード・状態・応答時間・エラー）を
// RFC 4180 形式の CSV へ変換する。UTF-8 BOM は download 側で付与（Excel の文字化け防止）。
// 監査ログ（auditCsv.ts）と同じエスケープ方式。

import type { LogEntry } from '../types';

/** 取得ログを CSV 文字列へ変換する（RFC 4180・値中の " , 改行 はクォート）。 */
export function buildLogsCsv(logs: LogEntry[]): string {
  const rows: string[][] = [
    ['time', 'source', 'endpoint', 'code', 'status', 'ms', 'error'],
  ];
  for (const l of logs) {
    rows.push([l.time, l.source, l.endpoint, l.code, l.status, l.ms, l.error]);
  }
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}
