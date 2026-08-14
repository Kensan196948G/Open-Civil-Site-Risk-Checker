import { fetchJson, nowHMS, nowStamp } from './http';
import type { AdapterResult, AnalysisInput } from './types';
import type { Finding } from '../types';

// 標高・地形アダプタ（要件 カテゴリ terrain）。
// まず地理院標高API（getelevation）を試し、ブラウザから接続できない場合（CORS等）は
// Open-Meteo の標高APIにフォールバックする。フォールバック時は出典を正しく付け替える
// （要件 NFR-505: 出典の明示 / §3.2: 断定しない）。

const GSI = 'https://cyberjapandata2.gsi.go.jp/general/dem/scripts/getelevation.php';
const METEO_ELEV = 'https://api.open-meteo.com/v1/elevation';

interface GsiResp {
  elevation: number | string;
  hsrc: string;
}
interface MeteoElevResp {
  elevation: number[];
}

export async function fetchElevation(input: AnalysisInput): Promise<AdapterResult> {
  const { lat, lon } = input;
  const fetchedAt = nowStamp();

  // 1) 地理院標高API
  const gsiUrl = `${GSI}?lon=${lon}&lat=${lat}&outtype=JSON`;
  const gsi = await fetchJson<GsiResp>(gsiUrl, { timeout: 8000, maxRetries: 1 });
  if (gsi.ok && gsi.data && typeof gsi.data.elevation === 'number') {
    return elevationResult({
      elevation: gsi.data.elevation,
      source: 'gsi_tile',
      layer: `標高（${gsi.data.hsrc || 'DEM'}）`,
      attribution: '国土地理院',
      fetchedAt,
      code: gsi.code,
      ms: gsi.ms,
      qualityNote: 'タイル補間値。比高・傾斜・微地形は現地確認が必要',
    });
  }

  // 2) Open-Meteo 標高API（フォールバック）
  const meteo = await fetchJson<MeteoElevResp>(`${METEO_ELEV}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}`, { timeout: 8000, maxRetries: 1 });
  if (meteo.ok && meteo.data?.elevation?.length) {
    return elevationResult({
      elevation: meteo.data.elevation[0],
      source: 'open_meteo',
      layer: 'elevation (model grid)',
      attribution: 'Open-Meteo (CC BY 4.0)',
      fetchedAt,
      code: meteo.code,
      ms: meteo.ms,
      qualityNote: '地理院標高APIへ接続できなかったためモデル格子標高で代替。粗い参考値',
    });
  }

  // どちらも失敗 → データ未取得を誠実に表示
  const finding: Finding = {
    id: 'terr-1',
    category: 'terrain',
    priority: 'D',
    title: '参考標高：取得失敗',
    summary: '標高データをブラウザから取得できませんでした（地理院標高API・Open-Meteo標高ともに失敗）。地形の判断材料が不足しています。',
    status: 'failed',
    distance_m: null,
    caution: '再実行するか、地理院地図・地質資料で標高・地形を確認してください。Dは判断材料不足を意味します。',
    evidence: [
      {
        source_key: 'gsi_tile',
        layer_name: '標高（DEM）',
        attribution: '国土地理院',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: gsi.error,
        props: { error: gsi.error },
      },
    ],
  };
  return {
    findings: [finding],
    log: { time: nowHMS(), source: 'gsi_tile', endpoint: 'GET getelevation', code: gsi.code, status: 'failed', ms: String(gsi.ms), error: gsi.error },
    stepStatus: 'failed',
  };
}

function elevationResult(p: {
  elevation: number;
  source: 'gsi_tile' | 'open_meteo';
  layer: string;
  attribution: string;
  fetchedAt: string;
  code: string;
  ms: number;
  qualityNote: string;
}): AdapterResult {
  const finding: Finding = {
    id: 'terr-1',
    category: 'terrain',
    priority: 'C',
    title: `参考標高 約${p.elevation.toFixed(1)}m`,
    summary: `参考標高は約${p.elevation.toFixed(1)}mです。周辺との比高・傾斜・微地形は現地確認が必要です。`,
    status: 'found',
    distance_m: null,
    caution: '標高は参考値です。盛土・切土履歴や地盤条件は地質資料・ボーリングデータで確認してください。',
    evidence: [
      {
        source_key: p.source,
        layer_name: p.layer,
        attribution: p.attribution,
        fetched_at: p.fetchedAt,
        source_updated_at: '随時更新',
        quality_note: p.qualityNote,
        props: { elevation: `約${p.elevation.toFixed(1)}m` },
      },
    ],
  };
  return {
    findings: [finding],
    log: { time: nowHMS(), source: p.source, endpoint: 'GET elevation', code: p.code, status: 'success', ms: String(p.ms), error: '—' },
    stepStatus: 'success',
  };
}
