import { fetchJson, nowHMS, nowStamp } from './http';
import type { AdapterResult, AnalysisInput } from './types';
import type { Finding } from '../types';

// Open-Meteo 気象予報アダプタ（要件 FR-202）。CORS 対応・APIキー不要。
// 7日間の時間降水量・突風から「留意すべき気象要素」を抽出する。
// 予報値は時間で変化するため、取得時刻を必ず注意事項に明記する（要件 §19-4）。

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';

interface MeteoResponse {
  hourly?: {
    time: string[];
    precipitation?: number[];
    wind_gusts_10m?: number[];
  };
}

export async function fetchWeather(input: AnalysisInput): Promise<AdapterResult> {
  const params = new URLSearchParams({
    latitude: input.lat.toFixed(4),
    longitude: input.lon.toFixed(4),
    hourly: 'precipitation,wind_gusts_10m',
    forecast_days: '7',
    timezone: 'Asia/Tokyo',
  });
  const url = `${ENDPOINT}?${params.toString()}`;
  const out = await fetchJson<MeteoResponse>(url, { timeout: 10000, maxRetries: 1 });
  const fetchedAt = nowStamp();
  const log = {
    time: nowHMS(),
    source: 'open_meteo',
    endpoint: 'GET /v1/forecast',
    code: out.code,
    status: (out.ok ? 'success' : 'failed') as 'success' | 'failed',
    ms: String(out.ms),
    error: out.error,
  };

  if (!out.ok || !out.data?.hourly?.precipitation) {
    return { findings: [], log: { ...log, status: 'failed' }, stepStatus: 'failed' };
  }

  const precip = out.data.hourly.precipitation ?? [];
  const gusts = out.data.hourly.wind_gusts_10m ?? [];
  const times = out.data.hourly.time ?? [];

  let maxP = 0;
  let maxPIdx = 0;
  precip.forEach((v, i) => {
    if (v > maxP) {
      maxP = v;
      maxPIdx = i;
    }
  });
  const maxGust = gusts.reduce((m, v) => (v > m ? v : m), 0);

  // 確認優先度: 強雨(>=8mm/h)または強風(>=15m/s)で B、それ以外は C（断定しない）。
  const elevated = maxP >= 8 || maxGust >= 15;
  const whenLabel = times[maxPIdx] ? times[maxPIdx].replace('T', ' ') : '—';

  const finding: Finding = {
    id: 'wx-1',
    category: 'weather',
    priority: elevated ? 'B' : 'C',
    title: elevated ? '7日予報に強雨・強風予測あり' : '7日予報を取得（顕著な強雨予測なし）',
    summary: elevated
      ? `予報期間内で最大時間雨量 約${maxP.toFixed(1)}mm/h（${whenLabel}頃）、最大突風 約${maxGust.toFixed(0)}m/s が見込まれます。搬入・養生・排水計画で留意してください。`
      : `予報期間内の最大時間雨量は約${maxP.toFixed(1)}mm/h、最大突風は約${maxGust.toFixed(0)}m/s です。現時点で顕著な強雨予測は確認されませんでした（リスクなしを意味しません）。`,
    status: 'found',
    distance_m: null,
    caution: `予報は取得時刻により変化します。取得日時：${fetchedAt}。施工時期が近づいたら再確認を推奨します。`,
    evidence: [
      {
        source_key: 'open_meteo',
        layer_name: 'hourly precipitation / wind_gusts_10m',
        attribution: 'Open-Meteo (CC BY 4.0)',
        fetched_at: fetchedAt,
        source_updated_at: '予報モデル更新値',
        quality_note: '予報値のため変動',
        props: {
          max_precip: `${maxP.toFixed(1)}mm/h`,
          max_gust: `${maxGust.toFixed(0)}m/s`,
        },
      },
    ],
  };

  return { findings: [finding], log, stepStatus: 'success' };
}
