import { fetchJson, nowHMS } from './http';
import type { LogEntry } from '../types';

// OpenStreetMap / Nominatim ジオコーディングアダプタ。
// 利用ポリシー（https://operations.osmfoundation.org/policies/nominatim/）に従い、
// 1リクエスト/秒の節度・キャッシュ・適切な Referer を前提とする。ブラウザからの
// 直接呼び出しは User-Agent をブラウザが付与し、Referer も自動付与される。

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  log: LogEntry;
  ok: boolean;
  error: string;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
}

export async function geocode(address: string): Promise<GeocodeResult> {
  const params = new URLSearchParams({
    q: address,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'ja',
    countrycodes: 'jp',
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const out = await fetchJson<NominatimItem[]>(url, { timeout: 8000 });
  const time = nowHMS();
  const log: LogEntry = {
    time,
    source: 'nominatim',
    endpoint: `GET /search?q=${address.slice(0, 16)}`,
    code: out.code,
    status: out.ok ? 'success' : 'failed',
    ms: String(out.ms),
    error: out.error,
  };

  if (!out.ok || !out.data || out.data.length === 0) {
    return {
      lat: 0,
      lon: 0,
      displayName: '',
      log: { ...log, status: out.ok ? 'failed' : log.status, error: out.ok ? '住所候補が見つかりませんでした' : out.error },
      ok: false,
      error: out.ok ? '住所候補が見つかりませんでした' : out.error,
    };
  }

  const item = out.data[0];
  return {
    lat: parseFloat(item.lat),
    lon: parseFloat(item.lon),
    displayName: item.display_name,
    log,
    ok: true,
    error: '—',
  };
}
