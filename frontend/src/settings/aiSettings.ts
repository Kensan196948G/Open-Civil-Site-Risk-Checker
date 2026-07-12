import { fetchJson, nowStamp, type FetchOutcome } from '../api/http';

// AI 設定（SCR-008 システム設定 / AI調査メモ向け）。
// プロバイダは Anthropic（Claude）のみをサポートする（運用方針）。
// API キーは「このブラウザの localStorage のみ」に保存し、自社サーバへは送信しない。
// 接続テストは Anthropic のモデル一覧 GET（トークン消費なし）で行う。

export interface AiSettings {
  apiKey: string;
  model: string;
  /** 保存日時（'YYYY-MM-DD HH:MM:SS'）。未保存は ''。 */
  savedAt: string;
}

export const AI_SETTINGS_KEY = 'ocsrc-ai-settings';
export const PROVIDER_NAME = 'Anthropic（Claude）';
export const DEFAULT_MODEL = 'claude-sonnet-5';

export function emptyAiSettings(): AiSettings {
  return { apiKey: '', model: '', savedAt: '' };
}

/** JSON 文字列 → AiSettings。壊れた値・旧形式の他社プロバイダ設定は null（既定へ）。 */
export function parseAiSettings(json: string | null): AiSettings | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as Partial<AiSettings> & { provider?: string };
    if (!v || typeof v !== 'object') return null;
    // 旧形式（provider つき）は anthropic のみ引き継ぐ。他社設定は破棄する。
    if (v.provider !== undefined && v.provider !== 'anthropic') return null;
    if (typeof v.apiKey !== 'string' || !v.apiKey) return null;
    return {
      apiKey: v.apiKey,
      model: typeof v.model === 'string' ? v.model : '',
      savedAt: typeof v.savedAt === 'string' ? v.savedAt : '',
    };
  } catch {
    return null;
  }
}

// コピペ時に混入しやすい不可視文字のコード一覧（ゼロ幅スペース×3種 U+200B-200D・BOM U+FEFF・全角スペース U+3000）。
// ソース中に生の不可視文字を書くと編集時に消失/破損しうるため、コードポイントから都度組み立てる。
const INVISIBLE_CHAR_CODES = [0x200b, 0x200c, 0x200d, 0xfeff, 0x3000];
const INVISIBLE_CHARS_RE = new RegExp(`[${INVISIBLE_CHAR_CODES.map((c) => String.fromCharCode(c)).join('')}]`, 'g');

/** コピペ時に混入しやすい不可視文字（ゼロ幅スペース・BOM）と全角スペースを除去する。 */
export function sanitizeApiKeyInput(raw: string): string {
  return raw.replace(INVISIBLE_CHARS_RE, '');
}

/** Anthropic キーの一般的なプレフィックス。一致しない場合は誤ったキー種別の可能性を示すヒントに使う。 */
export const API_KEY_PREFIX = 'sk-ant-';

/** 表示用マスク（先頭4+末尾4のみ、8文字以下は全マスク）。生キーを画面に出さない。 */
export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '＊'.repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** 保存可能か（キーが最低限の長さ）。 */
export function canSave(apiKey: string): boolean {
  return apiKey.trim().length >= 8;
}

// ---- localStorage 永続化 ----

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
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify({ provider: 'anthropic', ...stamped }));
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

// ---- 接続テスト（Anthropic モデル一覧 GET）----

export interface TestRequest {
  url: string;
  init: RequestInit;
}

/** 軽量テストリクエスト（モデル一覧 GET）を組み立てる（pure）。 */
export function buildTestRequest(apiKey: string): TestRequest {
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
}

export interface TestVerdict {
  ok: boolean;
  message: string;
}

interface ModelsResponse {
  data?: unknown[];
}

/** HTTP 結果 → 判定メッセージ（pure）。認証失敗と他の失敗理由を区別する。 */
export function interpretTestOutcome(
  out: Pick<FetchOutcome<ModelsResponse>, 'ok' | 'status' | 'data' | 'error'>,
): TestVerdict {
  if (out.ok && out.data) {
    const n = (out.data.data ?? []).length;
    return { ok: true, message: `接続成功（利用可能モデル ${n} 件を確認）` };
  }
  if (out.status === 401 || out.status === 403) {
    return { ok: false, message: `認証失敗（HTTP ${out.status}）。API キーを確認してください。` };
  }
  if (out.status === 429) {
    return { ok: false, message: 'レート制限（HTTP 429）。時間をおいて再試行してください。' };
  }
  if (out.status === 0) {
    return { ok: false, message: `接続できませんでした（${out.error}）。ネットワーク接続を確認してください。` };
  }
  return { ok: false, message: `接続失敗（HTTP ${out.status}: ${out.error}）` };
}

/** 接続テストを実行する（キーの送信先は Anthropic のみ）。 */
export async function testAiConnection(apiKey: string): Promise<TestVerdict> {
  const req = buildTestRequest(apiKey);
  const out = await fetchJson<ModelsResponse>(req.url, { timeout: 10000, init: req.init });
  return interpretTestOutcome(out);
}
