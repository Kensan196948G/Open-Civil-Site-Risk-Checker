import { fetchJson } from '../api/http';
import { ksjBaseUrl } from '../api/ksj';
import { buildMemoText } from './memo';
import type { Finding, SiteLocation } from '../types';

// AI調査メモの生成（要件 FR-401〜405 / §3.2 / 詳細仕様 Sprint 4）。
// 外部評価 Phase 0: ブラウザは Anthropic API を直接呼ばず、自社バックエンドの
// AI ブローカー（POST /api/v1/ai/memo）を経由する。API キーはサーバー側のみ。
// 生成結果は禁止表現チェック + 免責文の必須化を通してから画面に渡す。

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

interface AiMemoResponse {
  ok?: boolean;
  text?: string;
  error?: string;
  model?: string;
  /** サーバー側（防御層）が検出した断定表現（直接 API 呼び出しにも効く）。 */
  warnings?: string[];
}

export interface AiMemoResult {
  ok: boolean;
  /** 免責文を保証済みの生成テキスト（成功時のみ）。 */
  text?: string;
  /** 検出された禁止表現（成功時、0件が理想）。 */
  warnings: string[];
  message: string;
}

/** サーバー側 AI ブローカーでメモを生成する（キーはブラウザに存在しない）。 */
export async function generateAiMemo(
  location: SiteLocation,
  findings: Finding[],
): Promise<AiMemoResult> {
  const prompt = buildAiMemoPrompt(location, findings);
  const out = await fetchJson<AiMemoResponse>(`${ksjBaseUrl()}/api/v1/ai/memo`, {
    timeout: 90000,
    init: {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    },
  });

  if (!out.ok || !out.data?.ok || typeof out.data.text !== 'string') {
    const detail = out.data?.error || out.error || '不明なエラー';
    if (out.status === 401 || out.status === 403) {
      return { ok: false, warnings: [], message: `認証失敗（HTTP ${out.status}）。サーバー側 API キーを確認してください。` };
    }
    if (out.status === 429) {
      return { ok: false, warnings: [], message: 'レート制限（HTTP 429）。時間をおいて再試行してください。' };
    }
    if (out.status === 503) {
      return { ok: false, warnings: [], message: `AI はサーバー側で利用できません（${detail}）` };
    }
    return { ok: false, warnings: [], message: `生成に失敗しました（${out.status ? `HTTP ${out.status}: ` : ''}${detail}）` };
  }

  const raw = out.data.text;
  const text = ensureDisclaimer(raw);
  const serverWarnings = Array.isArray(out.data.warnings)
    ? out.data.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  const warnings = [...new Set([...findForbiddenExpressions(text), ...serverWarnings])];
  return {
    ok: true,
    text,
    warnings,
    message: `AI 生成が完了しました（Claude / ${out.data.model || '—'}）。内容を確認のうえ必要に応じて編集してください。`,
  };
}
