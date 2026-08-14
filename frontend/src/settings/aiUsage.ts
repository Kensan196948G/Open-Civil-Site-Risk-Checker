// AI 利用状況（評価書 #20・費用管理）の表示整形ヘルパ。
// サーバー側 DB（ai_usage テーブル）の集計 API レスポンスを表示用に整形する純粋ロジック。
// DOM 非依存（node 環境の単体テスト対象）。

export interface AiUsageTotals {
  calls: number;
  ok_calls: number;
  error_calls: number;
  prompt_chars: number;
  completion_chars: number;
  duration_ms: number;
  warnings: number;
  estimated_cost_usd: number;
}

export interface AiUsageDaily {
  date: string;
  calls: number;
  ok_calls: number;
  error_calls: number;
  prompt_chars: number;
  completion_chars: number;
}

export interface AiUsageUser {
  user: string;
  calls: number;
  ok_calls: number;
  prompt_chars: number;
  completion_chars: number;
}

export interface AiUsageSummary {
  status: string;
  days: number;
  total: AiUsageTotals;
  daily: AiUsageDaily[];
  users: AiUsageUser[];
  note: string;
}

/** 概算費用の USD → 円換算（1 USD = 150 円の固定近似・概算である旨は表示側で明記）。 */
export const JPY_PER_USD = 150;

/** 概算費用（円）。 */
export function estimateYen(usd: number): number {
  return Math.round(usd * JPY_PER_USD);
}

/** 合計の要約文（例: 呼び出し 3 回（成功 2 / 失敗 1）・入力 2400 文字・出力 500 文字）。 */
export function usageTotalsText(t: AiUsageTotals): string {
  const yen = estimateYen(t.estimated_cost_usd);
  return `呼び出し ${t.calls} 回（成功 ${t.ok_calls} / 失敗 ${t.error_calls}）・入力 ${t.prompt_chars} 文字・出力 ${t.completion_chars} 文字・概算費用 約${yen} 円`;
}

/** 日別データから表示用に最大 limit 件（新しい順のまま）を返す。 */
export function recentDaily(daily: AiUsageDaily[], limit = 7): AiUsageDaily[] {
  return daily.slice(0, limit);
}

/** 利用実績が空（1 件も記録なし）かどうか。 */
export function isEmptyUsage(u: AiUsageSummary): boolean {
  return u.total.calls === 0;
}
