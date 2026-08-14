// 取得時間計測・タイムアウト付きの fetch ラッパ。
// すべてのアダプタはこれを通すことで、応答時間(ms)・HTTPコード・エラー理由を
// 一貫した形で取得ログ（要件 FR-503）に記録できる。

export interface FetchOutcome<T> {
  ok: boolean;
  status: number;
  /** HTTP コード文字列。ネットワークエラー等は '—'。 */
  code: string;
  ms: number;
  data: T | null;
  error: string;
}

export interface FetchOpts {
  /** タイムアウト[ms]。既定 15 秒。 */
  timeout?: number;
  init?: RequestInit;
  /** 非 2xx 応答の JSON ボディも data として保持する（readiness の detail 展開などに使う）。 */
  errorBody?: boolean;
  /**
   * 一時的失敗（ネットワークエラー・タイムアウト・5xx）時の再試行回数（既定 0）。
   * 読み取り専用アダプタのみで有効にする（評価書 #14）。ミューテーション（AI 生成・案件
   * 作成/承認等）には指定しないこと（二重実行・二重課金を防ぐ）。
   */
  maxRetries?: number;
  /** 再試行までの待機[ms]。既定 300。テストでは 0 を指定できる。 */
  retryDelayMs?: number;
}

/** 現在時刻を HH:MM:SS（JST 表示前提のローカル時刻）で返す。 */
export function nowHMS(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 取得日時を 'YYYY-MM-DD HH:MM:SS' で返す。 */
export function nowStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export async function fetchJson<T = unknown>(url: string, opts: FetchOpts = {}): Promise<FetchOutcome<T>> {
  const maxRetries = opts.maxRetries ?? 0;
  const retryDelayMs = opts.retryDelayMs ?? 300;
  const startedAt = performance.now();

  /** 1回の取得試行。失敗条件（ネットワーク/タイムアウト/5xx）は再試行対象になる。 */
  async function attempt(): Promise<FetchOutcome<T> & { retryable: boolean }> {
    const timeout = opts.timeout ?? 15000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const attemptStart = performance.now();
    try {
      const res = await fetch(url, { ...opts.init, signal: controller.signal });
      const ms = Math.round(performance.now() - attemptStart);
      const retryable = res.status >= 500;
      if (!res.ok) {
        let data: T | null = null;
        if (opts.errorBody) {
          try {
            data = (await res.json()) as T;
          } catch {
            data = null;
          }
        }
        return { ok: false, status: res.status, code: String(res.status), ms, data, error: `HTTP ${res.status}`, retryable };
      }
      const data = (await res.json()) as T;
      return { ok: true, status: res.status, code: String(res.status), ms, data, error: '—', retryable: false };
    } catch (e) {
      const ms = Math.round(performance.now() - attemptStart);
      const err = e instanceof Error ? e : undefined;
      const aborted = err?.name === 'AbortError';
      return {
        ok: false,
        status: 0,
        code: '—',
        ms,
        data: null,
        error: aborted ? `Read timed out after ${Math.round(timeout / 1000)}s` : (err?.message || 'ネットワークエラー'),
        // タイムアウト・ネットワークエラーは再試行対象（ミューテーションでは maxRetries を指定しない）。
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  let outcome = await attempt();
  let retried = false;
  for (let i = 0; i < maxRetries && !outcome.ok && outcome.retryable; i += 1) {
    retried = true;
    if (retryDelayMs > 0) await new Promise((r) => setTimeout(r, retryDelayMs));
    outcome = await attempt();
  }

  if (!retried) return outcome;
  // 取得ログの誠実性: リトライしたことを error フィールドへ明記する（成功時も含む）。
  const ms = Math.round(performance.now() - startedAt);
  const note = outcome.ok ? '1回リトライ後成功' : '（1回リトライ後）';
  return { ...outcome, ms, error: outcome.ok ? note : `${outcome.error}${note}` };
}

/** POST（Overpass 用、bodyは text/plain）。 */
export async function postForm<T = unknown>(url: string, body: string, opts: FetchOpts = {}): Promise<FetchOutcome<T>> {
  return fetchJson<T>(url, {
    ...opts,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body,
      ...opts.init,
    },
  });
}
