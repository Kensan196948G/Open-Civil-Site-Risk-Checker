// データソース台帳 API クライアント（Issue #174）のテスト。
// サーバー台帳の有効性検出・取得・表示形へのマッピングを検証する。

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  isDataSourceStoreEnabled,
  fetchDataSources,
  serverDataSourceToLedger,
  type ServerDataSource,
} from './dataSources';

const serverSource: ServerDataSource = {
  id: 1,
  source_id: 'ksj',
  name: '国土数値情報',
  provider: '国土交通省',
  license: 'KSJ規約',
  type: 'db',
  rank: 'A',
  source_updated_at: 'W05: 2021年度（合成）',
  usage_note: '国土数値情報の利用規約・出典表記に従う。',
  fetched_at: '2026-08-12',
  enabled: true,
};

function mockFetch(ok: boolean, data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => data,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isDataSourceStoreEnabled', () => {
  it('一覧 GET が 200 なら有効', async () => {
    vi.stubGlobal('fetch', mockFetch(true, { status: 'ok', items: [] }));
    await expect(isDataSourceStoreEnabled()).resolves.toBe(true);
  });

  it('503 なら無効', async () => {
    vi.stubGlobal('fetch', mockFetch(false, { detail: 'not enabled' }, 503));
    await expect(isDataSourceStoreEnabled()).resolves.toBe(false);
  });
});

describe('fetchDataSources', () => {
  it('台帳と再取込履歴を返す', async () => {
    const data = {
      status: 'ok',
      count: 1,
      items: [serverSource],
      refreshes: { ksj: [{ id: 1, source_id: 'ksj', note: 'デモ: 初回登録', at: '2026-08-12T00:00:00+09:00' }] },
    };
    vi.stubGlobal('fetch', mockFetch(true, data));
    const res = await fetchDataSources();
    expect(res.items).toHaveLength(1);
    expect(res.refreshes.ksj).toHaveLength(1);
    expect(res.refreshes.ksj[0].note).toContain('初回登録');
  });

  it('失敗時は throw する', async () => {
    vi.stubGlobal('fetch', mockFetch(false, { detail: 'db unavailable' }, 503));
    await expect(fetchDataSources()).rejects.toThrow();
  });
});

describe('serverDataSourceToLedger', () => {
  it('サーバー台帳を SourceLedgerEntry 表示形へマップする', () => {
    const entry = serverDataSourceToLedger(serverSource);
    expect(entry.key).toBe('ksj');
    expect(entry.license).toBe('KSJ規約');
    expect(entry.sourceUpdatedAt).toContain('2021年度');
    expect(entry.usageNote).toBeTruthy();
    expect(entry.enabled).toBe(true);
  });
});
