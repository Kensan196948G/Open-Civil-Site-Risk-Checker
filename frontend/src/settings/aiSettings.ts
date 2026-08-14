import { fetchJson } from '../api/http';
import { ksjBaseUrl } from '../api/ksj';
import type { AiUsageSummary } from './aiUsage';

// AI 設定（SCR-008 システム設定 / AI調査メモ向け）。
// 外部評価 Phase 0 以降: API キーはブラウザ（localStorage）に保存せず、
// サーバー側の OCSRC_ANTHROPIC_API_KEY のみで管理する。ブラウザは
// /api/v1/ai/status と /api/v1/ai/memo（サーバーブローカー）を介して利用する。

export const PROVIDER_NAME = 'Anthropic（Claude）';

export interface AiServerStatus {
  configured: boolean;
  model: string;
}

export function emptyAiServerStatus(): AiServerStatus {
  return { configured: false, model: '' };
}

/** サーバー応答 → 状態（pure）。キーは返ってこない前提の型でパースする。 */
export function parseAiServerStatus(data: unknown): AiServerStatus {
  if (!data || typeof data !== 'object') return emptyAiServerStatus();
  const d = data as Partial<AiServerStatus>;
  return {
    configured: d.configured === true,
    model: typeof d.model === 'string' ? d.model : '',
  };
}

/** サーバー側 AI 設定状態を取得する（API キーは返らない）。 */
export async function fetchAiServerStatus(): Promise<AiServerStatus> {
  const out = await fetchJson<AiServerStatus>(`${ksjBaseUrl()}/api/v1/ai/status`, { timeout: 8000 });
  return out.ok ? parseAiServerStatus(out.data) : emptyAiServerStatus();
}

export interface AiTestVerdict {
  ok: boolean;
  message: string;
}

/** 接続テスト（サーバー側設定の疎通確認のみ。ブラウザから Anthropic へは送信しない）。 */
export async function testAiServerConnection(): Promise<AiTestVerdict> {
  const status = await fetchAiServerStatus();
  if (status.configured) {
    return { ok: true, message: `サーバー側 AI 設定が有効です（${PROVIDER_NAME} / ${status.model}）` };
  }
  return { ok: false, message: 'サーバー側 AI 設定が未設定です（OCSRC_ANTHROPIC_API_KEY）。運用者に確認してください。' };
}

/** AI 利用実績の集計（評価書 #20）。DB 未設定・未到達は 503 を返すため ok=false になる。 */
export async function fetchAiUsage(days = 30): Promise<{ ok: boolean; usage?: AiUsageSummary; error?: string }> {
  const out = await fetchJson<AiUsageSummary>(`${ksjBaseUrl()}/api/v1/ai/usage?days=${days}`, {
    timeout: 10000,
    maxRetries: 1, // 読み取り専用・DB コールドスタート等の一時 503 に限定リトライ
  });
  if (out.ok && out.data) return { ok: true, usage: out.data };
  return { ok: false, error: out.error };
}
