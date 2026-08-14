// ハザード区域判定アダプタ（Issue #112）。
// 自前バックエンド（FastAPI + PostGIS）の /api/v1/hazard-assess を呼び出し、
// 浸水想定（A31）・土砂災害警戒（A33）相当のポリゴンに対して区域内判定と
// 最寄り区域までの距離を取得する。タイル目視から公式区域内判定へ昇格する。
// バックエンド base の解決は ksj.ts と同じ（SCR-008 実行時設定 > ビルド時 env > ''）。

import { fetchJson, nowHMS } from './http';
import { resolveBackendBase } from './ksj';
import { loadBackendUrlOverride } from '../settings/appSettings';
import type { Evidence, Finding } from '../types';

export interface HazardItem {
  dataset: string;
  name: string;
  hazard_type: 'flood' | 'landslide' | 'unknown';
  distance_m: number;
  attrs: Record<string, unknown>;
  source: string;
  source_updated_at: string;
  retrieved_at: string;
}

interface HazardAssessResponse {
  status: string;
  inside: HazardItem[];
  nearby: HazardItem[];
  meta?: { lat: number; lon: number; radius_m: number };
}

/** /api/v1/hazard-assess を呼び出し、区域内・最寄り区域を返す。 */
export async function fetchHazardAssessment(
  lat: number,
  lon: number,
  radius_m = 5000,
): Promise<HazardAssessResponse> {
  const base = resolveBackendBase(loadBackendUrlOverride(), import.meta.env.VITE_OCSRC_BACKEND_URL as string | undefined);
  const qs = `lat=${lat}&lon=${lon}&radius_m=${radius_m}`;
  const out = await fetchJson<HazardAssessResponse>(`${base}/api/v1/hazard-assess?${qs}`);
  if (!out.ok || !out.data) {
    throw new Error(out.error || 'ハザード区域判定の取得に失敗しました');
  }
  return out.data;
}

/** 判定結果を Finding（確認項目）へ変換する（Issue #112・断定表現なし）。 */
export function hazardAssessmentFinding(
  inside: HazardItem[],
  nearby: HazardItem[],
  fetchedAt: string,
): Finding {
  const flood = inside.filter((i) => i.hazard_type === 'flood');
  const landslide = inside.filter((i) => i.hazard_type === 'landslide');
  const nearest = [...inside, ...nearby].sort((a, b) => a.distance_m - b.distance_m)[0];

  if (inside.length === 0) {
    // 区域内なし: 最寄り区域までの距離を根拠に「区域内ではない（データ未整備の可能性も）」。
    return {
      id: 'haz-auto-none',
      category: 'hazard',
      priority: 'C',
      title: 'ハザード区域内判定（区域内の対象なし）',
      summary: nearest
        ? `取得したハザード区域ポリゴン（浸水想定・土砂災害警戒）に地点は含まれませんでした。最寄りの区域は「${nearest.name}」まで約 ${Math.round(nearest.distance_m)}m です。`
        : '取得したハザード区域ポリゴンに地点は含まれませんでした（対象データが未整備の可能性があります）。',
      status: nearest ? 'not_found' : 'no_data',
      distance_m: nearest ? Math.round(nearest.distance_m) : null,
      caution:
        '区域内判定は取り込んだハザード区域ポリゴン（出典データの基準年）に基づきます。データ未整備地域・最新の自治体公表資料は別途確認してください。',
      evidence: hazardEvidence(inside.length ? inside : nearby, fetchedAt),
    };
  }

  // 区域内あり: 種別ごとに要確認度を付す（安全/危険は断定しない）。
  const priority = landslide.length > 0 ? 'A' : 'B';
  const parts: string[] = [];
  if (flood.length) parts.push(`浸水想定区域 ${flood.length} 件`);
  if (landslide.length) parts.push(`土砂災害警戒区域 ${landslide.length} 件`);
  return {
    id: 'haz-auto-inside',
    category: 'hazard',
    priority,
    title: 'ハザード区域内判定（区域内に対象あり）',
    summary: `地点は取得したハザード区域ポリゴンに含まれます（${parts.join('・')}）。`,
    status: 'found',
    distance_m: 0,
    caution:
      '区域内判定は取り込んだハザード区域ポリゴン（出典データの基準年）に基づく初期確認です。安全・危険の断定ではなく、自治体公表の最新資料と専門確認を優先してください。',
    evidence: hazardEvidence(inside, fetchedAt),
  };
}

function hazardEvidence(items: HazardItem[], fetchedAt: string): Evidence[] {
  return items.map((i) => ({
    source_key: 'hazard_portal',
    layer_name: i.name,
    attribution: i.source || 'ハザード区域ポリゴン（合成サンプル）',
    fetched_at: fetchedAt,
    source_updated_at: i.source_updated_at,
    quality_note: `区域内自動判定（ST_Contains）。最寄り距離 ${Math.round(i.distance_m)}m・種別 ${i.hazard_type}`,
    props: {
      hazard_type: i.hazard_type,
      distance_m: String(Math.round(i.distance_m)),
      scenario: String(i.attrs?.scenario ?? ''),
    },
  }));
}

/** ハザードアダプタの実行ログ行（fetch 成否・応答時間を取得ログへ記録する）。 */
export function hazardLogLine(
  ok: boolean,
  code: string,
  ms: string,
  error: string,
): { time: string; source: string; endpoint: string; code: string; status: 'success' | 'failed' | 'skipped'; ms: string; error: string } {
  return {
    time: nowHMS(),
    source: 'hazard_portal',
    endpoint: '/api/v1/hazard-assess',
    code,
    status: ok ? 'success' : 'failed',
    ms,
    error,
  };
}
