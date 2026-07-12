import { fetchJson, nowHMS, nowStamp } from './http';
import { ksjBaseUrl } from './ksj';
import type { AdapterResult, AnalysisInput } from './types';
import type { Evidence, Finding } from '../types';

// 気象庁 警報・注意報 連携アダプタ（Phase 3, Issue #22）。
// 認証不要・CORS開放（Access-Control-Allow-Origin: * を実機で確認済み）のため、
// 気象庁 API 自体はバックエンドを介さずブラウザから直接取得する。
//
// 地点の都道府県は Nominatim の逆ジオコーディングで特定し、都道府県名を気象庁の
// 発表官署コードへ変換して警報・注意報 JSON を取得する。表示文はコードから自前で
// 組み立てず、気象庁自身が作成した headlineText をそのまま採用する（誤訳・断定表現の
// 混入を避けるため）。コードは「発表の有無」の判定と補足情報にのみ用いる。
// Nominatim 逆ジオコーディングは自社バックエンド（/api/v1/reverse-geocode）経由
// （Issue #84・ブラウザ直接呼び出しの CORS 事故については nominatim.ts 参照）。

/** 都道府県名 → 気象庁 発表官署コード（area.json で実在確認済み）。
 *  北海道・鹿児島県・沖縄県は地域ごとに官署が分かれ単一コードを持たないため、
 *  人口の多い代表地域のコードを採用する（誠実表示のため REPRESENTATIVE_PREFECTURES で明示）。 */
export const PREFECTURE_TO_JMA_CODE: Record<string, string> = {
  北海道: '016000',
  青森県: '020000',
  岩手県: '030000',
  宮城県: '040000',
  秋田県: '050000',
  山形県: '060000',
  福島県: '070000',
  茨城県: '080000',
  栃木県: '090000',
  群馬県: '100000',
  埼玉県: '110000',
  千葉県: '120000',
  東京都: '130000',
  神奈川県: '140000',
  新潟県: '150000',
  富山県: '160000',
  石川県: '170000',
  福井県: '180000',
  山梨県: '190000',
  長野県: '200000',
  岐阜県: '210000',
  静岡県: '220000',
  愛知県: '230000',
  三重県: '240000',
  滋賀県: '250000',
  京都府: '260000',
  大阪府: '270000',
  兵庫県: '280000',
  奈良県: '290000',
  和歌山県: '300000',
  鳥取県: '310000',
  島根県: '320000',
  岡山県: '330000',
  広島県: '340000',
  山口県: '350000',
  徳島県: '360000',
  香川県: '370000',
  愛媛県: '380000',
  高知県: '390000',
  福岡県: '400000',
  佐賀県: '410000',
  長崎県: '420000',
  熊本県: '430000',
  大分県: '440000',
  宮崎県: '450000',
  鹿児島県: '460100',
  沖縄県: '471000',
};

/** 単一の代表地域コードで簡略化している都道府県（caution に明記するため）。 */
export const REPRESENTATIVE_PREFECTURES = new Set(['北海道', '鹿児島県', '沖縄県']);

/** 都道府県名 → 気象庁コード（pure）。未対応の名称は undefined。 */
export function resolveJmaCode(prefecture: string): string | undefined {
  return PREFECTURE_TO_JMA_CODE[prefecture];
}

/** 警報・注意報コード → 名称。気象庁の公表資料・実観測で確認できた範囲のみ。
 *  未知のコードは名称を捏造せず「その他」として明示する（要件 §3.2）。 */
export const WARNING_CODE_NAMES: Record<string, string> = {
  '02': '暴風雪警報',
  '03': '大雨警報',
  '04': '洪水警報',
  '05': '暴風警報',
  '06': '大雪警報',
  '07': '波浪警報',
  '08': '高潮警報',
  '09': '土砂災害警戒情報',
  '10': '大雨注意報',
  '14': '雷注意報',
  '15': '強風注意報',
  '16': '波浪注意報',
  '18': '洪水注意報',
  '19': '高潮注意報',
  '20': '濃霧注意報',
  '33': '大雨特別警報',
};

/** 警報コード → 表示名（pure）。未知コードは「その他の警報・注意報（コード: XX）」。 */
export function describeWarningCode(code: string): string {
  return WARNING_CODE_NAMES[code] ?? `その他の警報・注意報（コード: ${code}）`;
}

interface JmaAreaWarning {
  code?: string;
  status: string;
}
interface JmaArea {
  code: string;
  warnings?: JmaAreaWarning[];
}
interface JmaAreaTypeGroup {
  areas: JmaArea[];
}
export interface JmaWarningResponse {
  reportDatetime?: string;
  headlineText?: string;
  areaTypes?: JmaAreaTypeGroup[];
}

/** 「発表」「継続」のみを発表中として扱う（「解除」「発表警報・注意報はなし」は除外）。 */
const ACTIVE_STATUSES = new Set(['発表', '継続']);

export interface ActiveWarning {
  areaCode: string;
  code: string;
  status: string;
}

/** レスポンスから発表中の警報・注意報のみ抽出する（pure）。
 *  areaTypes[0]（府県予報区内の一次細分区域単位）を対象とする。 */
export function extractActiveWarnings(doc: JmaWarningResponse): ActiveWarning[] {
  const group = doc.areaTypes?.[0];
  if (!group) return [];
  const out: ActiveWarning[] = [];
  for (const area of group.areas ?? []) {
    for (const w of area.warnings ?? []) {
      if (w.code && ACTIVE_STATUSES.has(w.status)) {
        out.push({ areaCode: area.code, code: w.code, status: w.status });
      }
    }
  }
  return out;
}

export interface MapJmaFindingsInput {
  prefecture: string;
  isRepresentative: boolean;
  doc: JmaWarningResponse;
  fetchedAt: string;
}

/** 警報・注意報レスポンス → 確認項目（hazardカテゴリ、pure）。
 *  表示文は気象庁自身の headlineText を優先採用し、コードからの自前生成は補足に留める。 */
export function mapJmaFindings(params: MapJmaFindingsInput): Finding[] {
  const { prefecture, isRepresentative, doc, fetchedAt } = params;
  const active = extractActiveWarnings(doc);
  const headline = (doc.headlineText ?? '').trim();
  const repNote = isRepresentative
    ? `${prefecture}は地域により気象台の発表単位が分かれるため、人口の多い代表地域の発表状況を表示しています。`
    : '';
  const scopeNote = '都道府県（気象庁発表単位）内の地域単位の発表状況であり、地点そのものが対象地域と一致するとは限りません。';

  const evidenceBase = {
    source_key: 'jma_warning' as const,
    layer_name: '気象警報・注意報',
    attribution: '気象庁',
    fetched_at: fetchedAt,
    source_updated_at: doc.reportDatetime ?? '不明',
    quality_note: repNote,
  };

  if (active.length === 0) {
    return [
      {
        id: 'jma-warning-1',
        category: 'hazard',
        priority: 'C',
        title: `気象庁 警報・注意報：${prefecture}に現在の発表なし`,
        summary: headline || `${prefecture}（気象庁発表単位）で現在発表中の警報・注意報はありません。`,
        status: 'not_found',
        distance_m: null,
        caution: `${scopeNote}${repNote ? ` ${repNote}` : ''}`,
        evidence: [],
      },
    ];
  }

  const codes = Array.from(new Set(active.map((a) => a.code)));
  const names = codes.map(describeWarningCode);
  const areaCount = new Set(active.map((a) => a.areaCode)).size;
  const evidence: Evidence[] = [
    {
      ...evidenceBase,
      props: { warnings: names.join('、'), area_count: `${areaCount}地域` },
    },
  ];

  return [
    {
      id: 'jma-warning-1',
      category: 'hazard',
      priority: 'A',
      title: `気象庁 警報・注意報：${prefecture}内で発表中`,
      summary: headline || `${prefecture}（気象庁発表単位）で ${names.join('・')} が発表中です。`,
      status: 'found',
      distance_m: null,
      caution: `${scopeNote} 最新情報は気象庁の発表を直接ご確認ください。${repNote}`,
      evidence,
    },
  ];
}

interface NominatimReverseResponse {
  // Nominatim は日本の都道府県レベルを addresstype="province" として返す
  // （state ではない。実機の reverse API 応答で確認済み）。将来的な表記揺れに
  // 備え、state も一応フォールバックとして見る。
  address?: { province?: string; state?: string };
}

interface ResolvePrefectureResult {
  prefecture?: string;
  error?: string;
}

/** 地点の都道府県を Nominatim reverse geocode で特定する（要 addressdetails=1、zoom=5で都道府県単位）。 */
async function resolvePrefecture(lat: number, lon: number): Promise<ResolvePrefectureResult> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const out = await fetchJson<NominatimReverseResponse>(
    `${ksjBaseUrl()}/api/v1/reverse-geocode?${params.toString()}`,
    { timeout: 8000 },
  );
  const prefecture = out.data?.address?.province ?? out.data?.address?.state;
  if (!out.ok || !prefecture) {
    return { error: out.ok ? '都道府県情報が取得できませんでした' : out.error };
  }
  return { prefecture };
}

export async function fetchJmaWarning(input: AnalysisInput): Promise<AdapterResult> {
  const rev = await resolvePrefecture(input.lat, input.lon);
  if (!rev.prefecture) {
    return {
      findings: [],
      log: {
        time: nowHMS(),
        source: 'jma_warning',
        endpoint: 'GET /api/v1/reverse-geocode（都道府県特定）',
        code: '—',
        status: 'failed',
        ms: '—',
        error: rev.error ?? '都道府県の特定に失敗しました',
      },
      stepStatus: 'failed',
    };
  }

  const jmaCode = resolveJmaCode(rev.prefecture);
  if (!jmaCode) {
    return {
      findings: [],
      log: {
        time: nowHMS(),
        source: 'jma_warning',
        endpoint: `都道府県コード未対応: ${rev.prefecture}`,
        code: '—',
        status: 'failed',
        ms: '—',
        error: '未対応の都道府県名です',
      },
      stepStatus: 'failed',
    };
  }

  const endpoint = `/bosai/warning/data/warning/${jmaCode}.json`;
  const out = await fetchJson<JmaWarningResponse>(`https://www.jma.go.jp${endpoint}`, { timeout: 10000 });
  const log = {
    time: nowHMS(),
    source: 'jma_warning',
    endpoint: `GET ${endpoint}`,
    code: out.code,
    status: (out.ok ? 'success' : 'failed') as 'success' | 'failed',
    ms: String(out.ms),
    error: out.error,
  };

  if (!out.ok || !out.data) {
    return { findings: [], log, stepStatus: 'failed' };
  }

  const findings = mapJmaFindings({
    prefecture: rev.prefecture,
    isRepresentative: REPRESENTATIVE_PREFECTURES.has(rev.prefecture),
    doc: out.data,
    fetchedAt: nowStamp(),
  });
  return { findings, log, stepStatus: 'success' };
}
