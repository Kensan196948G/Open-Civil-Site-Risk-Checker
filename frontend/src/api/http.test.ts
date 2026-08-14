// fetchJson / postForm の限定リトライ（評価書 #14）のテスト。
// vi による fetch モックで、5xx/ネットワークエラーの再試行・4xx の非再試行・
// ミューテーション（maxRetries 未指定）の非再試行・ログの誠実性（リトライ後表記）を検証する。
// ※ vi 使用のため smoke shim ではスキップされ、CI の本物 vitest が実行する。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchJson, postForm } from './http';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchJson の限定リトライ（maxRetries）', () => {
  it('2xx 成功時は再試行せず1回の呼び出しで完了する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { value: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJson<{ value: number }>('https://example.test/x', { maxRetries: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(true);
    expect(out.error).toBe('—');
    expect(out.data?.value).toBe(1);
  });

  it('5xx から回復した場合は再試行して成功し、リトライ後成功と記録する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, {}))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJson<{ ok: boolean }>('https://example.test/x', { maxRetries: 1, retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(true);
    expect(out.code).toBe('200');
    expect(out.error).toBe('1回リトライ後成功');
  });

  it('5xx が続く場合は失敗し、エラーにリトライ後であることを明記する', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJson('https://example.test/x', { maxRetries: 1, retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(false);
    expect(out.status).toBe(503);
    expect(out.error).toContain('HTTP 503');
    expect(out.error).toContain('（1回リトライ後）');
  });

  it('ネットワークエラー（fetch 拒否）から回復した場合は再試行して成功する', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJson<{ ok: boolean }>('https://example.test/x', { maxRetries: 1, retryDelayMs: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(true);
    expect(out.error).toBe('1回リトライ後成功');
  });

  it('4xx（クライアントエラー）は再試行しない', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404, {}));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJson('https://example.test/x', { maxRetries: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    expect(out.status).toBe(404);
    expect(out.error).not.toContain('リトライ');
  });

  it('maxRetries 未指定（既定 0）は 5xx でも再試行しない（ミューテーション保護）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(503, {}));
    vi.stubGlobal('fetch', fetchMock);
    const out = await fetchJson('https://example.test/x');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(out.ok).toBe(false);
    expect(out.error).toBe('HTTP 503');
  });
});

describe('postForm のリトライ連携', () => {
  it('maxRetries を指定すると 5xx で再試行する（Overpass 等の読み取り専用 POST）', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(200, { elements: [] }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await postForm<{ elements: unknown[] }>('https://example.test/interpreter', '[out:json];', {
      maxRetries: 1,
      retryDelayMs: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.ok).toBe(true);
    expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  });
});
