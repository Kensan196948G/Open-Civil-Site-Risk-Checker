// データソース台帳 API クライアント（Issue #174・サーバ側永続化）。
// feature flag（OCSRC_DATA_SOURCE_STORE_ENABLED）が有効な場合のみ応答する。
// フロントは有効時にサーバー台帳を表示し、無効・未到達時は既存の静的台帳
// （data/sources.ts の SOURCE_LEDGER）へフォールバックする。

import { fetchJson } from './http';
import type { SourceLedgerEntry } from '../types';

export interface ServerDataSource {
  id: number;
  source_id: string;
  name: string;
  provider: string;
  license: string;
  type: 'api' | 'db' | 'tile';
  rank: 'A' | 'B' | 'C';
  source_updated_at: string;
  usage_note: string;
  fetched_at: string;
  enabled: boolean;
}

export interface DataSourceRefresh {
  id: number;
  source_id: string;
  note: string;
  at: string;
}

interface DataSourcesResponse {
  status: string;
  count: number;
  items: ServerDataSource[];
  refreshes: Record<string, DataSourceRefresh[]>;
}

/** データソース台帳 API が有効か（一覧 GET が 200 を返せば有効とみなす）。 */
export async function isDataSourceStoreEnabled(): Promise<boolean> {
  const out = await fetchJson<{ status: string }>('/api/v1/data-sources', { timeout: 5000 });
  return out.ok;
}

/** サーバー台帳 + 再取込履歴を取得する。 */
export async function fetchDataSources(): Promise<DataSourcesResponse> {
  const out = await fetchJson<DataSourcesResponse>('/api/v1/data-sources');
  if (!out.ok || !out.data) throw new Error(out.error || 'データソース台帳の取得に失敗しました');
  return out.data;
}

/** サーバー台帳を既存の SourceLedgerEntry 表示形へマップする。 */
export function serverDataSourceToLedger(s: ServerDataSource, last = '—'): SourceLedgerEntry {
  return {
    key: s.source_id as SourceLedgerEntry['key'],
    name: s.name,
    provider: s.provider,
    type: s.type,
    license: s.license,
    rank: s.rank,
    stat: s.enabled ? 'success' : 'skipped',
    last,
    enabled: s.enabled,
    sourceUpdatedAt: s.source_updated_at || undefined,
    usageNote: s.usage_note || undefined,
  };
}
