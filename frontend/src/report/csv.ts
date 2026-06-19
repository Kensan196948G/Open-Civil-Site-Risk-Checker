import type { Finding } from '../types';
import { CATEGORY_LABEL, SOURCE_SHORT, STATUS } from '../data/constants';

// CSV レポート生成（要件 FR-306）。Excel での文字化けを避けるため UTF-8 BOM 付与は
// download 側で行う。値中の " , 改行 は RFC 4180 に従いクォートする。

export function buildReportCsv(findings: Finding[]): string {
  const rows: string[][] = [
    ['category', 'item', 'priority', 'summary', 'distance_m', 'status', 'fetched_at', 'source'],
  ];
  findings.forEach((f) => {
    rows.push([
      CATEGORY_LABEL[f.category],
      f.title,
      f.priority,
      f.summary,
      f.distance_m != null ? String(Math.round(f.distance_m)) : '',
      STATUS[f.status].label,
      f.evidence[0]?.fetched_at ?? '—',
      f.evidence.map((e) => SOURCE_SHORT[e.source_key]).join('; '),
    ]);
  });
  return rows
    .map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','))
    .join('\n');
}
