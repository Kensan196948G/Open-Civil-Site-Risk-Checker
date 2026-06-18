import type { Evidence, Finding, Theme } from './types';
import { CATEGORY_LABEL, SOURCE_SHORT, distanceLabel, getPrio, getStatus } from './data/constants';

// 確認項目に表示用のラベル・色を付与する（デザインモックの decorate() 相当）。
// 表示専用の派生値をここに集約し、ドメイン型 Finding を純粋なデータに保つ。

export interface DecoratedEvidence extends Evidence {
  source_name: string;
  propsLabel: string;
}

export interface DecoratedFinding extends Finding {
  color: string;
  bg: string;
  priorityName: string;
  statusLabel: string;
  statusColor: string;
  statusBg: string;
  categoryLabel: string;
  distanceLabel: string | null;
  evidence: DecoratedEvidence[];
}

export function decorate(f: Finding, theme: Theme = 'light'): DecoratedFinding {
  const p = getPrio(theme)[f.priority];
  const s = getStatus(theme)[f.status];
  return {
    ...f,
    color: p.color,
    bg: p.bg,
    priorityName: p.name,
    statusLabel: s.label,
    statusColor: s.color,
    statusBg: s.bg,
    categoryLabel: CATEGORY_LABEL[f.category],
    distanceLabel: distanceLabel(f.distance_m, f.intersects),
    evidence: f.evidence.map((ev) => ({
      ...ev,
      source_name: SOURCE_SHORT[ev.source_key],
      propsLabel: Object.entries(ev.props || {}).map(([k, v]) => `${k}: ${v}`).join(' / ') || '—',
    })),
  };
}
