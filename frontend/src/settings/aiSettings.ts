import { fetchJson, nowStamp, type FetchOutcome } from '../api/http';

// AI 設定（SCR-008 システム設定 / AI調査メモ向け）。
// API キーは「このブラウザの localStorage のみ」に保存し、自社サーバへは送信しない。
// 接続テストは各 AI 提供元の軽量エンドポイント（モデル一覧）を直接呼び出す。

export type AiProvider = 'anthropic' | 'openai' | 'gemini';

export interface AiSettings {
  provider: AiProvider;
  apiKey: string;
  model: string;
  /** 保存日時（'YYYY-MM-DD HH:MM:SS'）。未保存は ''。 */
  savedAt: string;
}

export const AI_SETTINGS_KEY = 'ocsrc-ai-settings';

export const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: 'Anthropic（Claude）',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
};

/** 既定モデル（空欄保存時に使用）。 */
export const DEFAULT_MODELS: Record<AiProvider, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
};

export function emptyAiSettings(): AiSettings {
  return { provider: 'anthropic', apiKey: '', model: '', savedAt: '' };
}

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

/** JSON 文字列 → AiSettings。壊れた値・未知 provider は null（既定にフォールバック）。 */
export function parseAiSettings(json: string | null): AiSettings | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<AiSettings>;
    if (!v || typeof v !== 'object') return null;
    if (!PROVIDERS.includes(v.provider as AiProvider)) return null;
    if (typeof v.apiKey !== 'string' || !v.apiKey) return null;
    return {
      provider: v.provider as AiProvider,
      apiKey: v.apiKey,
      model: typeof v.model === 'string' ? v.model : '',
      savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
    };
  } catch {
    return null;
  }
}

/** 表示用マスク（先頭4+末尾4のみ、8文字以下は全マスク）。生キーを画面に出さない。 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '＊'.repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** 保存可能か（provider 選択済み + キーが最低限の長さ）。 */
export function canSave(provider: AiProvider | '', apiKey: string): boolean {
  return PROVIDERS.includes(provider as AiProvider) && apiKey.trim().length >= 8;
}

// ---- localStorage 永続化（不可環境では黙って無効化しない — 呼び出し側へ false を返す）----

export function loadAiSettings(): AiSettings {
  try {
    return parseAiSettings(localStorage.getItem(AI_SETTINGS_KEY)) ?? emptyAiSettings();
  } catch {
    return emptyAiSettings();
  }
}

export function saveAiSettings(s: Omit<AiSettings, 'savedAt'>): AiSettings | null {
  const stamped: AiSettings = { ...s, apiKey: s.apiKey.trim(), savedAt: nowStamp() };
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(stamped));
    return stamped;
  } catch {
    return null;
  }
}

export function clearAiSettings(): void {
  try {
    localStorage.removeItem(AI_SETTINGS_KEY);
  } catch {
    /* 保存領域が無い環境では何もしない */
  }
}

// ---- 接続テスト ----

export interface TestRequest {
  url: string;
  init: RequestInit;
}

/** provider ごとの軽量テストリクエスト（モデル一覧 GET）を組み立てる（pure）。 */
export function buildTestRequest(provider: AiProvider, apiKey: string): TestRequest {
  switch (provider) {
    case 'anthropic':
      return {
        url: 'https://api.anthropic.com/v1/models',
        init: {
          method: 'GET',
          headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            // ブラウザ直接呼び出しの明示オプトイン（Anthropic 公式 CORS サポート）。
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        },
      };
    case 'openai':
      return {
        url: 'https://api.openai.com/v1/models',
        init: { method: 'GET', headers: { Authorization: `Bearer ${apiKey}` } },
      };
    case 'gemini':
      return {
        // Gemini はクエリキー方式。ログ等に URL を出す場合はマスクすること。
        url: `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
        init: { method: 'GET' },
      };
  }
}

export interface TestVerdict {
  ok: boolean;
  message: string;
}

interface ModelsResponse {
  data?: unknown[]; // anthropic / openai
  models?: unknown[]; // gemini
}

/** HTTP 結果 → 判定メッセージ（pure）。認証失敗と網羅的な失敗理由を区別する。 */
export function interpretTestOutcome(
  provider: AiProvider,
  out: Pick<FetchOutcome<ModelsResponse>, 'ok' | 'status' | 'data' | 'error'>,
): TestVerdict {
  if (out.ok && out.data) {
    const n = (out.data.data ?? out.data.models ?? []).length;
    return { ok: true, message: `接続成功（利用可能モデル ${n} 件を確認）` };
  }
  if (out.status === 401 || out.status === 403) {
    return { ok: false, message: `認証失敗（HTTP ${out.status}）。API キーを確認してください。` };
  }
  if (out.status === 429) {
    return { ok: false, message: 'レート制限（HTTP 429）。時間をおいて再試行してください。' };
  }
  if (out.status === 0) {
    const corsHint =
      provider === 'openai'
        ? ' OpenAI はブラウザからの直接呼び出しを許可していない場合があります（CORS）。キー自体は有効な可能性があります。'
        : '';
    return { ok: false, message: `接続できませんでした（${out.error}）。${corsHint}`.trim() };
  }
  return { ok: false, message: `接続失敗（HTTP ${out.status}: ${out.error}）` };
}

/** 接続テストを実行する（ブラウザ → AI 提供元へ直接。キーは提供元以外へ送信しない）。 */
export async function testAiConnection(provider: AiProvider, apiKey: string): Promise<TestVerdict> {
  const req = buildTestRequest(provider, apiKey);
  const out = await fetchJson<ModelsResponse>(req.url, { timeout: 10000, init: req.init });
  return interpretTestOutcome(provider, out);
}
