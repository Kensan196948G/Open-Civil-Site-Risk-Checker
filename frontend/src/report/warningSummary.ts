// 気象警報（現在）チェックの表示用サマリー（評価書 #18 の MVP・安全管理）。
// JMA 警報 finding（jmaWarning.ts の mapJmaFindings 出力）を「発表中 / 発表なし /
// 取得失敗 / 未チェック」の 4 段階へ要約する純粋ロジック（DOM 非依存・断定しない）。

import type { Finding } from '../types';

export type WarningLevel = 'alert' | 'none' | 'failed' | 'unknown';

export interface WarningSummary {
  level: WarningLevel;
  label: string;
}

/** JMA 警報 finding を現在の警報サマリーへ変換する（純粋・安全/危険は断定しない）。 */
export function summarizeJmaFinding(f: Finding | null | undefined): WarningSummary {
  if (!f) return { level: 'unknown', label: '未チェック' };
  if (f.status === 'found') {
    const names = f.evidence[0]?.props?.warnings;
    return { level: 'alert', label: names ? `発表中（${names}）` : '発表中' };
  }
  if (f.status === 'not_found') return { level: 'none', label: '発表なし' };
  return { level: 'failed', label: '取得失敗' };
}

/** レベル別の表示色（テーマ CSS 変数）。 */
export function warningColor(level: WarningLevel): string {
  switch (level) {
    case 'alert':
      return 'var(--err-text)';
    case 'none':
      return 'var(--ok-text)';
    case 'failed':
      return 'var(--warn-text)';
    default:
      return 'var(--text-3)';
  }
}
