import { fetchJson, type FetchOutcome } from '../api/http';
import { RADIUS_OPTIONS } from '../data/constants';
import type { Category } from '../types';

// システム設定（SCR-008）: バックエンド接続（KSJ 連携）/ 地点確認の既定値 / ローカルデータ管理。
// いずれも localStorage のみに保存し、外部送信は接続テスト時のみ（送信先はユーザー自身が設定したバックエンド URL）。

export const BACKEND_URL_KEY = 'ocsrc-backend-url';
export const ANALYSIS_DEFAULTS_KEY = 'ocsrc-default-analysis';

export type AnalysisCategories = Record<Exclude<Category, 'data_quality'>, boolean>;

export interface AnalysisDefaults {
  radius: number;
  categories: AnalysisCategories;
}

export const FALLBACK_DEFAULTS: AnalysisDefaults = {
  radius: 500,
  categories: { roads: true, rivers: true, hazard: true, terrain: true, weather: true, facilities: true },
};

// ---- バックエンド接続 URL（KSJ 連携） ----
// 既定は same-origin（'' = 相対パスで配信サーバの /api プロキシ経由、Issue #57）。
// この localStorage 値はカスタム URL（直結）を指定したい場合のみ保存する。
// ビルド時の VITE_OCSRC_BACKEND_URL とあわせて優先順位は ksj.ts の resolveBackendBase を参照。

/** 保存済みの上書き URL（末尾スラッシュ除去済み）。未設定は ''。 */
export function loadBackendUrlOverride(): string {
  try {
    const v = localStorage.getItem(BACKEND_URL_KEY);
    return v ? v.replace(/\/+$/, '') : '';
  } catch {
    return '';
  }
}

export function saveBackendUrlOverride(url: string): boolean {
  const trimmed = url.trim().replace(/\/+$/, '');
  try {
    if (trimmed) localStorage.setItem(BACKEND_URL_KEY, trimmed);
    else localStorage.removeItem(BACKEND_URL_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearBackendUrlOverride(): void {
  try {
    localStorage.removeItem(BACKEND_URL_KEY);
  } catch {
    /* 保存領域が無い環境では何もしない */
  }
}

/** URL の簡易妥当性チェック（http/https のみ許可）。 */
export function isValidBackendUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export interface BackendTestVerdict {
  ok: boolean;
  message: string;
}

interface BackendHealthResponse {
  status?: string;
  db?: string;
  version?: string;
}

/** healthz 応答 → 判定メッセージ（pure）。DB 未設定は「接続はできた」扱いで区別する。 */
export function interpretBackendTest(
  out: Pick<FetchOutcome<BackendHealthResponse>, 'ok' | 'data' | 'error'>,
): BackendTestVerdict {
  if (!out.ok || !out.data) {
    return { ok: false, message: `接続できませんでした（${out.error}）。URL とバックエンドの起動状態を確認してください。` };
  }
  const db = out.data.db;
  if (db === 'ok') return { ok: true, message: `接続成功（DB到達性: ok、version ${out.data.version ?? '—'}）` };
  if (db === 'not_configured') {
    return { ok: true, message: 'バックエンドに接続できました（DB 未設定のため KSJ 検索は利用できません）。' };
  }
  return { ok: false, message: `バックエンドには接続できましたが、DB に問題があります（db=${db ?? '不明'}）。` };
}

/** 接続テスト用の readiness URL（pure）。DB 異常時は 503 を返す /readyz を使う。
 *  - base 空（same-origin 既定）: 配信サーバのプロキシ特例 `/api/readyz` を叩く。
 *    静的サーバ自身の text 応答 `/healthz` に当たって誤判定するのを防ぐ。
 *  - base が配信オリジン自身: 同上（プロキシ経由でバックエンドの健全性を見る）。
 *  - それ以外（直結 URL）: 従来どおり `${base}/readyz`。 */
export function backendReadyUrl(base: string, pageOrigin?: string): string {
  const trimmed = base.trim().replace(/\/+$/, '');
  if (!trimmed) return '/api/readyz';
  try {
    if (pageOrigin && new URL(trimmed).origin === pageOrigin) return '/api/readyz';
  } catch {
    /* URL として解釈できない base は直結扱いのまま（fetch 側でエラーになる） */
  }
  return `${trimmed}/readyz`;
}

/** バックエンドの readiness を確認する（DB到達性まで報告）。url='' は same-origin 既定。 */
export async function testBackendConnection(url: string): Promise<BackendTestVerdict> {
  const pageOrigin = typeof location !== 'undefined' ? location.origin : undefined;
  const out = await fetchJson<BackendHealthResponse>(backendReadyUrl(url, pageOrigin), { timeout: 10000 });
  return interpretBackendTest(out);
}

// ---- 地点確認の既定値（検索半径・確認カテゴリ） ----

/** JSON 文字列 → AnalysisDefaults（pure）。壊れた値・選択肢外の半径・全カテゴリ false は
 *  組み込みの既定値へ縮退する。localStorage に依存しないため単体テスト可能。 */
export function parseAnalysisDefaults(json: string | null): AnalysisDefaults {
  if (!json) return FALLBACK_DEFAULTS;
  try {
    const v = JSON.parse(json) as Partial<AnalysisDefaults>;
    if (!v || typeof v !== 'object') return FALLBACK_DEFAULTS;
    const radiusOk = RADIUS_OPTIONS.includes(v.radius as (typeof RADIUS_OPTIONS)[number]);
    const radius = radiusOk ? (v.radius as number) : FALLBACK_DEFAULTS.radius;
    const hasCategory = !!v.categories && typeof v.categories === 'object' && Object.values(v.categories).some(Boolean);
    const categories = hasCategory ? { ...FALLBACK_DEFAULTS.categories, ...v.categories } : FALLBACK_DEFAULTS.categories;
    return { radius, categories };
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

export function loadAnalysisDefaults(): AnalysisDefaults {
  try {
    return parseAnalysisDefaults(localStorage.getItem(ANALYSIS_DEFAULTS_KEY));
  } catch {
    return FALLBACK_DEFAULTS;
  }
}

/** 保存可能か（半径が選択肢内 + カテゴリが1つ以上）。 */
export function canSaveAnalysisDefaults(d: AnalysisDefaults): boolean {
  return RADIUS_OPTIONS.includes(d.radius as (typeof RADIUS_OPTIONS)[number]) && Object.values(d.categories).some(Boolean);
}

export function saveAnalysisDefaults(d: AnalysisDefaults): boolean {
  try {
    localStorage.setItem(ANALYSIS_DEFAULTS_KEY, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}

export function clearAnalysisDefaults(): void {
  try {
    localStorage.removeItem(ANALYSIS_DEFAULTS_KEY);
  } catch {
    /* 保存領域が無い環境では何もしない */
  }
}

// ---- ローカルデータの全リセット ----

/** アプリがブラウザに保存する localStorage キーの一覧（README にも記載）。 */
export const ALL_LOCAL_STORAGE_KEYS = [
  'ocsrc-cases',
  'ocsrc-theme',
  'ocsrc-ai-settings', // 旧形式の残骸（削除対象として保持）
  BACKEND_URL_KEY,
  ANALYSIS_DEFAULTS_KEY,
] as const;

/** アプリのローカルデータを全削除する（案件・テーマ・旧AI設定・バックエンド設定・既定値）。 */
export function resetAllLocalData(): boolean {
  try {
    ALL_LOCAL_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
    return true;
  } catch {
    return false;
  }
}
