import { fetchJson, nowHMS } from './http';
import type { LogEntry } from '../types';

// OpenStreetMap / Nominatim ジオコーディングアダプタ。
// 利用ポリシー（https://operations.osmfoundation.org/policies/nominatim/）に従い、
// 1リクエスト/秒の節度・キャッシュ・適切な Referer を前提とする。ブラウザからの
// 直接呼び出しは User-Agent をブラウザが付与し、Referer も自動付与される。

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const RATE_LIMIT_INTERVAL_MS = 1100;

export interface GeocodeResult {
  lat: number;
  lon: number;
  displayName: string;
  log: LogEntry;
  ok: boolean;
  error: string;
  /** true: 入力住所そのものでは候補が無く、丁目・番などへ短縮した近似地点を採用した。 */
  approximated: boolean;
}

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * 「…2丁目1番3号」のような号（個別建物）単位の住所は OSM に未整備なことが多く、
 * そのままでは 0 件になりやすい（実地検証済み: 千代田区霞が関の例で号を含めると 0 件）。
 * 号→番地→丁目の順に末尾を削り、より粗いが検索可能な候補列を作る（先頭は元の住所）。
 */
export function shrinkAddressCandidates(address: string): string[] {
  const trials = [address];
  let current = address;
  const trailingPatterns = [/[0-9０-９]+号\s*$/, /[0-9０-９]+番地?\s*$/, /[0-9０-９]+丁目\s*$/];
  for (const pattern of trailingPatterns) {
    const next = current.replace(pattern, '').trim();
    if (next && next !== current) {
      trials.push(next);
      current = next;
    }
  }
  return trials;
}

async function searchOnce(query: string): Promise<{ item: NominatimItem | null; log: LogEntry; networkError: boolean }> {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '1',
    'accept-language': 'ja',
    countrycodes: 'jp',
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const out = await fetchJson<NominatimItem[]>(url, { timeout: 8000 });
  const found = out.ok && !!out.data && out.data.length > 0;
  const log: LogEntry = {
    time: nowHMS(),
    source: 'nominatim',
    endpoint: `GET /search?q=${query.slice(0, 16)}`,
    code: out.code,
    status: found ? 'success' : 'failed',
    ms: String(out.ms),
    error: found ? '—' : out.ok ? '住所候補が見つかりませんでした' : out.error,
  };
  return { item: found ? out.data![0] : null, log, networkError: !out.ok };
}

export async function geocode(address: string): Promise<GeocodeResult> {
  const candidates = shrinkAddressCandidates(address);
  let lastLog: LogEntry | null = null;

  for (let i = 0; i < candidates.length; i++) {
    if (i > 0) await sleep(RATE_LIMIT_INTERVAL_MS); // Nominatim 利用ポリシー: 1 req/秒の節度を守る
    const { item, log, networkError } = await searchOnce(candidates[i]);
    lastLog = log;

    if (item) {
      return {
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        displayName: item.display_name,
        log,
        ok: true,
        error: '—',
        approximated: i > 0,
      };
    }
    if (networkError) break; // ネットワーク/HTTPエラーは住所を短縮しても解決しないため打ち切る
  }

  return {
    lat: 0,
    lon: 0,
    displayName: '',
    log: lastLog!,
    ok: false,
    error:
      candidates.length > 1
        ? '住所候補が見つかりませんでした（号・番地レベルまで短縮しても該当なし）。丁目までの住所や地図上の緯度経度入力もお試しください'
        : lastLog!.error,
    approximated: false,
  };
}
