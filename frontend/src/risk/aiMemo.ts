import { fetchJson } from '../api/http';
import { buildMemoText } from './memo';
import type { Finding, SiteLocation } from '../types';
import type { AiSettings } from '../settings/aiSettings';

// AI調査メモの実 AI 生成（要件 FR-401〜405 / §3.2 / 詳細仕様 Sprint 4）。
// プロバイダは Anthropic（Claude）のみ（運用方針）。
// テンプレート版メモ（根拠つき）を土台に LLM で肉付けし、
// 生成結果は禁止表現チェック + 免責文の必須化を通してから画面に渡す。
// 検出した禁止表現は黙って改変せず、警告として利用者に提示する（誠実な表示）。

/** 断定を示す禁止表現（要件 §3.2）。部分一致で検出し、警告表示に使う。 */
export const FORBIDDEN_EXPRESSIONS = [
  '安全です',
  '安全である',
  '危険です',
  '危険である',
  'リスクなし',
  'リスクはありません',
  'リスクはない',
  '施工可能',
  '施工できます',
  '施工不可',
  '問題ありません',
  '問題なし',
  '問題はない',
  '支障ありません',
  '支障なし',
] as const;

/** 生成文に含まれる禁止表現を列挙する（重複なし）。 */
export function findForbiddenExpressions(text: string): string[] {
  return FORBIDDEN_EXPRESSIONS.filter((w) => text.includes(w));
}

const DISCLAIMER =
  '本メモは公開データに基づく初期調査支援であり、施工可否、法的適合性、安全性を断定するものではありません。各要確認事項には根拠データIDを紐付けています。';

/** 免責文が欠けている場合は末尾に必ず付加する（FR-402 免責文必須化）。 */
export function ensureDisclaimer(text: string): string {
  if (text.includes('断定するものではありません')) return text;
  return `${text.trimEnd()}\n\n## 注意事項\n${DISCLAIMER}\n`;
}

/** LLM へのプロンプト。テンプレート版メモを唯一の事実源として渡す。 */
export function buildAiMemoPrompt(location: SiteLocation, findings: Finding[]): string {
  const template = buildMemoText(location, findings);
  return [
    'あなたは土木工事の候補地初期調査を支援するアシスタントです。',
    '以下の「テンプレート版メモ」を土台に、内容を専門的に肉付けした調査メモを Markdown で出力してください。',
    '',
    '厳守する制約:',
    '1. 見出し構成はテンプレートと同じ 8 セクション（## 1.〜## 8.）を維持する。',
    '2. 断定表現（「安全」「危険」「施工可否」「リスクなし」「問題なし」等の断定）を使わない。「要確認」「追加確認推奨」「参考情報」「データ不足」で表現する。',
    '3. テンプレートに含まれないデータ・数値・地名を創作しない。肉付けは一般的な確認観点の具体化に限る。',
    '4. 各要確認事項の根拠データID・出典表記（（根拠：…）の部分）を必ず残す。',
    '5. 「## 8. 注意事項」の免責文を必ず含める。',
    '6. 日本語で、前置きや説明なしにメモ本文のみを出力する。',
    '',
    '--- テンプレート版メモ ---',
    template,
  ].join('\n');
}

export interface GenerateRequest {
  url: string;
  init: RequestInit;
}

/** Anthropic Messages API の生成リクエストを組み立てる（pure）。 */
export function buildGenerateRequest(settings: AiSettings, prompt: string): GenerateRequest {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    init: {
      method: 'POST',
      headers: {
        'x-api-key': settings.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: 3000,
        messages: [{ role: 'user', content: prompt }],
      }),
    },
  };
}

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

/** Anthropic 応答からテキストを取り出す（pure）。解析不能は null。 */
export function extractResponseText(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as AnthropicResponse;
  const text = d.content
    ?.filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('');
  return text && text.trim() ? text.trim() : null;
}

export interface AiMemoResult {
  ok: boolean;
  /** 免責文を保証済みの生成テキスト（成功時のみ）。 */
  text?: string;
  /** 検出された禁止表現（成功時、0件が理想）。 */
  warnings: string[];
  message: string;
}

/** AI でメモを生成する（キーの送信先は Anthropic のみ）。 */
export async function generateAiMemo(
  settings: AiSettings,
  location: SiteLocation,
  findings: Finding[],
): Promise<AiMemoResult> {
  const req = buildGenerateRequest(settings, buildAiMemoPrompt(location, findings));
  const out = await fetchJson<AnthropicResponse>(req.url, { timeout: 90000, init: req.init });

  if (!out.ok || !out.data) {
    if (out.status === 401 || out.status === 403) {
      return { ok: false, warnings: [], message: `認証失敗（HTTP ${out.status}）。システム設定で API キーを確認してください。` };
    }
    if (out.status === 429) {
      return { ok: false, warnings: [], message: 'レート制限（HTTP 429）。時間をおいて再試行してください。' };
    }
    return { ok: false, warnings: [], message: `生成に失敗しました（${out.status ? `HTTP ${out.status}: ` : ''}${out.error}）` };
  }

  const raw = extractResponseText(out.data);
  if (!raw) {
    return { ok: false, warnings: [], message: '応答の解析に失敗しました（モデル名が正しいか確認してください）。' };
  }

  const text = ensureDisclaimer(raw);
  const warnings = findForbiddenExpressions(text);
  return {
    ok: true,
    text,
    warnings,
    message: `AI 生成が完了しました（Claude / ${settings.model}）。内容を確認のうえ必要に応じて編集してください。`,
  };
}
