import { postForm, nowHMS, nowStamp } from './http';
import { haversine, initialBearing, bearingLabel16 } from './geo';
import type { AdapterResult, AnalysisInput } from './types';
import type { Finding, Evidence, MapFeatures } from '../types';

// OpenStreetMap / Overpass アダプタ（要件 FR-201）。
// 周辺の道路・水域・鉄道駅・主要施設を1クエリで取得し、地点からの最寄り距離を実測する。
// 取得失敗時は呼び出し側でフォールバック（要件 AC-009）。

const ENDPOINT = 'https://overpass-api.de/api/interpreter';

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}
interface OverpassResponse {
  elements: OverpassElement[];
}

const AMENITY_LABEL: Record<string, string> = {
  school: '学校',
  university: '大学',
  college: '大学',
  kindergarten: '幼稚園・保育',
  hospital: '病院',
  clinic: '診療所',
  police: '警察',
  fire_station: '消防',
  townhall: '役所',
};

function buildQuery({ lat, lon, radius }: AnalysisInput): string {
  const a = `(around:${radius},${lat},${lon})`;
  return `[out:json][timeout:25];
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary)$"]${a};
  way["waterway"]${a};
  way["natural"="water"]${a};
  node["railway"="station"]${a};
  node["amenity"~"^(school|university|college|kindergarten|hospital|clinic|police|fire_station|townhall)$"]${a};
  way["amenity"~"^(school|university|college|kindergarten|hospital)$"]${a};
  node["office"="government"]${a};
  way["office"="government"]${a};
);
out tags geom;`;
}

/** 要素の中心点までの最寄り地点 { d, lat, lon } を返す（ノード/中心/ジオメトリ最寄頂点）。 */
export function nearestPointOf(el: OverpassElement, lat: number, lon: number): { d: number; lat: number; lon: number } | null {
  const pts: { lat: number; lon: number }[] = [];
  if (el.geometry && el.geometry.length) pts.push(...el.geometry);
  if (el.center) pts.push(el.center);
  if (el.lat != null && el.lon != null) pts.push({ lat: el.lat, lon: el.lon });
  if (!pts.length) return null;
  let best: { lat: number; lon: number } | null = null;
  let bestD = Infinity;
  for (const p of pts) {
    const d = haversine(lat, lon, p.lat, p.lon);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? { d: bestD, lat: best.lat, lon: best.lon } : null;
}

function pointOf(el: OverpassElement): { lat: number; lon: number } | null {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lon: el.lon };
  if (el.center) return el.center;
  if (el.geometry && el.geometry.length) return el.geometry[0];
  return null;
}

export async function fetchOverpass(input: AnalysisInput): Promise<AdapterResult> {
  const { lat, lon } = input;
  const out = await postForm<OverpassResponse>(ENDPOINT, buildQuery(input), { timeout: 25000, maxRetries: 1 });
  const fetchedAt = nowStamp();
  const log = {
    time: nowHMS(),
    source: 'osm_overpass',
    endpoint: 'POST /api/interpreter',
    code: out.code,
    status: (out.ok ? 'success' : 'failed') as 'success' | 'failed',
    ms: String(out.ms),
    error: out.error,
  };

  if (!out.ok || !out.data) {
    return { findings: [], log: { ...log, status: 'failed' }, stepStatus: 'failed' };
  }

  const els = out.data.elements ?? [];
  const roads: OverpassElement[] = [];
  const waters: OverpassElement[] = [];
  const stations: OverpassElement[] = [];
  const amenities: OverpassElement[] = [];

  for (const el of els) {
    const t = el.tags ?? {};
    if (t.highway) roads.push(el);
    else if (t.waterway || t.natural === 'water') waters.push(el);
    else if (t.railway === 'station') stations.push(el);
    else if (t.amenity || t.office === 'government') amenities.push(el);
  }

  // 地図用ジオメトリ（描画負荷を抑えるため本数を制限）。
  const features: Partial<MapFeatures> = {
    roads: roads
      .filter((r) => r.geometry)
      .slice(0, 60)
      .map((r) => r.geometry!.map((g) => [g.lat, g.lon] as [number, number])),
    water: waters
      .filter((w) => w.geometry)
      .slice(0, 40)
      .map((w) => w.geometry!.map((g) => [g.lat, g.lon] as [number, number])),
    facilities: [...stations, ...amenities]
      .map((el) => {
        const p = pointOf(el);
        if (!p) return null;
        const t = el.tags ?? {};
        const label =
          t.railway === 'station'
            ? t.name || '駅'
            : AMENITY_LABEL[t.amenity ?? ''] || (t.office === 'government' ? '官公庁' : t.name || '施設');
        return { lat: p.lat, lon: p.lon, label };
      })
      .filter((x): x is { lat: number; lon: number; label: string } => x !== null)
      .slice(0, 40),
  };

/** 地点→最寄り地点の16方位ラベル（根拠の具体化・評価書 #10）。 */
function bearingText(fromLat: number, fromLon: number, to: { lat: number; lon: number }): string {
  return bearingLabel16(initialBearing(fromLat, fromLon, to.lat, to.lon));
}

  const findings: Finding[] = [];

  // ---- 道路（要件 FR-301 / カテゴリ roads）----
  if (roads.length) {
    const nearest = roads
      .map((r) => ({ el: r, ...(nearestPointOf(r, lat, lon) ?? { d: Infinity, lat, lon }) }))
      .sort((a, b) => a.d - b.d)[0];
    const nm = nearest.el.tags?.name || nearest.el.tags?.ref || '幹線道路';
    const hw = nearest.el.tags?.highway || 'road';
    findings.push({
      id: 'road-1',
      category: 'roads',
      priority: 'C',
      title: '主要道路が近接',
      summary: `検索半径内に幹線道路が${roads.length}本あります（最寄り：${nm}、${bearingText(lat, lon, nearest)} 約${Math.round(nearest.d)}m）。搬入経路・交通規制・占用許可の確認を推奨します。`,
      status: 'found',
      distance_m: nearest.d,
      caution: 'OSMの道路属性は地域差があります。幅員・規制は道路管理者資料で確認してください。',
      evidence: [
        roadEvidence(`highway=${hw}`, fetchedAt, { name: String(nm), highway: hw, count: String(roads.length) }),
      ],
    });
  } else {
    findings.push({
      id: 'road-1',
      category: 'roads',
      priority: 'D',
      title: '周辺道路：該当データ未取得',
      summary: '検索半径内で OSM の主要道路データが確認されませんでした。OSM の整備状況に依存します。',
      status: 'no_data',
      distance_m: null,
      caution: '「該当なし」はデータ整備範囲内での結果であり、道路がないことを意味しません。',
      evidence: [roadEvidence('highway', fetchedAt, { result: '該当way なし' })],
    });
  }

  // ---- 水域（要件 カテゴリ rivers）----
  if (waters.length) {
    const nearest = waters
      .map((w) => ({ el: w, ...(nearestPointOf(w, lat, lon) ?? { d: Infinity, lat, lon }) }))
      .sort((a, b) => a.d - b.d)[0];
    const wtype = nearest.el.tags?.waterway || (nearest.el.tags?.natural === 'water' ? 'water' : '水域');
    const nm = nearest.el.tags?.name || '';
    findings.push({
      id: 'river-1',
      category: 'rivers',
      priority: 'B',
      title: '水路・河川・水域が検索半径内に存在',
      summary: `検索半径内に水域が${waters.length}件あります（最寄り：${nm || wtype}、${bearingText(lat, lon, nearest)} 約${Math.round(nearest.d)}m）。現地条件と河川・水路管理者資料の確認を推奨します。`,
      status: 'found',
      distance_m: nearest.d,
      caution: '公開データの整備時点と現況が異なる可能性があります。護岸・暗渠区間の有無を確認してください。',
      evidence: [waterEvidence(`waterway=${wtype}`, fetchedAt, { type: String(nm || wtype), count: String(waters.length) })],
    });
  }

  // ---- 周辺施設（要件 カテゴリ facilities）----
  const protectedKeys = ['school', 'university', 'college', 'kindergarten', 'hospital', 'clinic', 'townhall', 'police', 'fire_station'];
  const sensitive = amenities.filter((a) => {
    const t = a.tags ?? {};
    return protectedKeys.includes(t.amenity ?? '') || t.office === 'government';
  });
  if (sensitive.length) {
    const nearest = sensitive
      .map((a) => ({ el: a, ...(nearestPointOf(a, lat, lon) ?? { d: Infinity, lat, lon }) }))
      .sort((x, y) => x.d - y.d)[0];
    const kinds = Array.from(
      new Set(
        sensitive.map((a) => {
          const t = a.tags ?? {};
          return AMENITY_LABEL[t.amenity ?? ''] || (t.office === 'government' ? '官公庁' : 'その他');
        }),
      ),
    ).join('・');
    findings.push({
      id: 'fac-1',
      category: 'facilities',
      priority: 'B',
      title: '官公庁・学校・病院等が近接',
      summary: `検索半径内に配慮対象施設が${sensitive.length}件あります（${kinds}／最寄り ${bearingText(lat, lon, nearest)} 約${Math.round(nearest.d)}m）。騒音・振動・通学路・警備動線への配慮確認を推奨します。`,
      status: 'found',
      distance_m: nearest.d,
      caution: '施設種別はOSM属性に基づく参考情報です。用途・運用時間は現地確認が必要です。',
      evidence: [facilityEvidence('amenity', fetchedAt, { kinds, count: String(sensitive.length) })],
    });
  }
  if (stations.length) {
    const nearest = stations
      .map((s) => ({ el: s, ...(nearestPointOf(s, lat, lon) ?? { d: Infinity, lat, lon }) }))
      .sort((x, y) => x.d - y.d)[0];
    const nm = nearest.el.tags?.name || '駅';
    findings.push({
      id: 'fac-2',
      category: 'facilities',
      priority: 'C',
      title: '鉄道駅が近接',
      summary: `鉄道駅（${nm}）が${bearingText(lat, lon, nearest)} 約${Math.round(nearest.d)}mにあります。資材搬入時間帯・歩行者動線・地下構造物の確認を推奨します。`,
      status: 'found',
      distance_m: nearest.d,
      caution: '地下構造物の位置・深さは公開データに含まれません。施設管理者への確認が必要です。',
      evidence: [facilityEvidence('railway=station', fetchedAt, { station: String(nm) })],
    });
  }

  return { findings, log, stepStatus: 'success', features };
}

function baseEvidence(layer: string, fetchedAt: string, props: Record<string, string>): Evidence {
  return {
    source_key: 'osm_overpass',
    layer_name: layer,
    attribution: '© OpenStreetMap contributors',
    fetched_at: fetchedAt,
    source_updated_at: '随時更新（OSM）',
    quality_note: '網羅性・属性に地域差あり',
    props,
  };
}
const roadEvidence = baseEvidence;
const waterEvidence = baseEvidence;
const facilityEvidence = baseEvidence;
