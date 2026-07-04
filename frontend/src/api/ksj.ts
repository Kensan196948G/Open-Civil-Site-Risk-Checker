import { fetchJson, nowHMS, nowStamp } from './http';
import { loadBackendUrlOverride } from '../settings/appSettings';
import type { AdapterResult, AnalysisInput } from './types';
import type { Evidence, Finding } from '../types';

// 国土数値情報（KSJ）アダプタ（要件 §18 Phase 2 / NFR-401）。
// 自前バックエンド（FastAPI + PostGIS）の空間検索 API を呼び出し、
// 取込済みローカル DB の河川・施設を確認項目化する。
// バックエンド URL は SCR-008 の実行時設定（localStorage）を優先し、
// 未設定時はビルド時の VITE_OCSRC_BACKEND_URL にフォールバックする。
// どちらも未設定なら従来どおり「未連携」扱い。

export interface KsjItem {
  dataset: 'river' | 'facility';
  name: string;
  distance_m: number;
  attrs: Record<string, unknown>;
  source: string;
  source_updated_at: string;
  retrieved_at: string;
}

interface KsjNearbyResponse {
  status: string;
  count: number;
  items: KsjItem[];
}

/** バックエンド base URL（末尾スラッシュ除去済み）。未設定なら undefined。
 *  優先順位: SCR-008 の実行時設定（localStorage） > ビルド時の VITE_OCSRC_BACKEND_URL。 */
export function ksjBaseUrl(): string | undefined {
  const override = loadBackendUrlOverride();
  if (override) return override;
  const v = (import.meta as { env?: Record<string, string | undefined> }).env
    ?.VITE_OCSRC_BACKEND_URL;
  return v ? v.replace(/\/+$/, '') : undefined;
}

export const isKsjConfigured = (): boolean => ksjBaseUrl() !== undefined;

function ksjEvidence(item: KsjItem, fetchedAt: string): Evidence {
  return {
    source_key: 'ksj',
    layer_name: item.dataset === 'river' ? '河川・水路（KSJ）' : '公共施設（KSJ）',
    attribution: item.source,
    fetched_at: fetchedAt,
    source_updated_at: item.source_updated_at || '整備年度不明',
    quality_note: '取込済みローカルDB（PostGIS）の検索結果。データ整備年度と現況の差に注意',
    props: { name: item.name, distance_m: `${Math.round(item.distance_m)}m` },
  };
}

/** API 応答 → 確認項目。DB 到達済みで 0 件のときは「該当なし」を明示する（FR-304）。 */
export function mapKsjItems(items: KsjItem[], fetchedAt: string): Finding[] {
  const findings: Finding[] = [];
  const rivers = items.filter((i) => i.dataset === 'river').sort((a, b) => a.distance_m - b.distance_m);
  const facilities = items
    .filter((i) => i.dataset === 'facility')
    .sort((a, b) => a.distance_m - b.distance_m);

  if (rivers.length) {
    const nearest = rivers[0];
    findings.push({
      id: 'ksj-river-1',
      category: 'rivers',
      priority: 'B',
      title: '国土数値情報の河川・水路が検索半径内に存在',
      summary: `取込済みの国土数値情報に河川・水路が${rivers.length}件あります（最寄り：${nearest.name}、約${Math.round(nearest.distance_m)}m）。河川管理者資料・河川区域・占用条件の確認を推奨します。`,
      status: 'found',
      distance_m: nearest.distance_m,
      caution: 'KSJ の整備年度時点のデータです。改修・付け替え等で現況と異なる場合があります。',
      evidence: rivers.slice(0, 3).map((i) => ksjEvidence(i, fetchedAt)),
    });
  } else {
    findings.push({
      id: 'ksj-river-1',
      category: 'rivers',
      priority: 'D',
      title: '国土数値情報の河川・水路：検索半径内に該当なし',
      summary: '取込済みの国土数値情報（河川）には、検索半径内の該当がありませんでした。',
      status: 'not_found',
      distance_m: null,
      caution: '「該当なし」は取込済みデータの範囲内での結果です。小水路・暗渠は含まれない場合があります。',
      evidence: [],
    });
  }

  if (facilities.length) {
    const nearest = facilities[0];
    findings.push({
      id: 'ksj-fac-1',
      category: 'facilities',
      priority: 'B',
      title: '国土数値情報の公共施設が近接',
      summary: `取込済みの国土数値情報に公共施設が${facilities.length}件あります（最寄り：${nearest.name}、約${Math.round(nearest.distance_m)}m）。周辺環境への配慮事項の確認を推奨します。`,
      status: 'found',
      distance_m: nearest.distance_m,
      caution: '施設の用途・運用状況は KSJ 整備年度時点の情報です。現地確認を推奨します。',
      evidence: facilities.slice(0, 3).map((i) => ksjEvidence(i, fetchedAt)),
    });
  } else {
    findings.push({
      id: 'ksj-fac-1',
      category: 'facilities',
      priority: 'D',
      title: '国土数値情報の公共施設：検索半径内に該当なし',
      summary: '取込済みの国土数値情報（公共施設）には、検索半径内の該当がありませんでした。',
      status: 'not_found',
      distance_m: null,
      caution: '「該当なし」は取込済みデータの範囲内での結果です。',
      evidence: [],
    });
  }

  return findings;
}

export async function fetchKsj(input: AnalysisInput): Promise<AdapterResult> {
  const base = ksjBaseUrl();
  const endpoint = `/api/v1/nearby?lat=${input.lat}&lon=${input.lon}&radius_m=${input.radius}`;
  const out = await fetchJson<KsjNearbyResponse>(`${base}${endpoint}`, { timeout: 10000 });
  const log = {
    time: nowHMS(),
    source: 'ksj',
    endpoint: `GET ${endpoint}`,
    code: out.code,
    status: (out.ok ? 'success' : 'failed') as 'success' | 'failed',
    ms: String(out.ms),
    error: out.error,
  };

  // 503（DB 未整備）やネットワーク断は「取得失敗」として誠実に表示（NFR-504）。
  if (!out.ok || !out.data) {
    return { findings: [], log, stepStatus: 'failed' };
  }

  return { findings: mapKsjItems(out.data.items ?? [], nowStamp()), log, stepStatus: 'success' };
}
