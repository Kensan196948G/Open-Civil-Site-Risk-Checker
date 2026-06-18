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

export async function fetchJson<T = any>(url: string, opts: FetchOpts = {}): Promise<FetchOutcome<T>> {
  const timeout = opts.timeout ?? 15000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const start = performance.now();
  try {
    const res = await fetch(url, { ...opts.init, signal: controller.signal });
    const ms = Math.round(performance.now() - start);
    if (!res.ok) {
      return { ok: false, status: res.status, code: String(res.status), ms, data: null, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, code: String(res.status), ms, data, error: '—' };
  } catch (e: any) {
    const ms = Math.round(performance.now() - start);
    const aborted = e?.name === 'AbortError';
    return {
      ok: false,
      status: 0,
      code: '—',
      ms,
      data: null,
      error: aborted ? `Read timed out after ${Math.round(timeout / 1000)}s` : (e?.message || 'ネットワークエラー'),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** POST（Overpass 用、bodyは text/plain）。 */
export async function postForm<T = any>(url: string, body: string, opts: FetchOpts = {}): Promise<FetchOutcome<T>> {
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
