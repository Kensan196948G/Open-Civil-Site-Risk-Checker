import type { CaseRecord, Finding, LogEntry } from '../types';
import { toCompareRow, type CompareRow } from '../report/compare';

// デザインモック由来のフォールバック確認結果。
// 用途:
//  1) 個別アダプタの取得失敗時に、該当カテゴリの代替表示として使う（要件 AC-009）。
//  2) data_quality（PLATEAU 未実装 / xROAD 未連携）の固定項目を供給する。
//     実通信を行っていないため HTTP コード・応答時間は記録しない（外部評価 Phase 0: 疑似ログ廃止）。
//
// 注意: これらは霞が関サンプルを前提とした参考データであり、実 API 取得値が
// 得られた場合は runAnalysis 側で実データに置き換えられる。

export const FALLBACK_FINDINGS: Finding[] = [
  {
    id: 'haz-1',
    category: 'hazard',
    priority: 'B',
    title: '洪水浸水想定区域レイヤを重ね合わせ可能（視覚確認要）',
    summary:
      'ハザードマップポータルの洪水浸水想定（想定最大規模）タイルを地図に重ね合わせできます。地点との重なりは目視確認が必要で、厳密な判定には自治体公表資料の確認を優先してください。',
    status: 'found',
    distance_m: null,
    intersects: undefined,
    caution:
      'タイル表示は視覚確認向けです。重なりの有無はクライアント側で自動判定していません。自治体公表の浸水想定区域図を確認してください。',
    evidence: [
      {
        source_key: 'hazard_portal',
        layer_name: '洪水浸水想定区域（L2）',
        attribution: 'ハザードマップポータルサイト',
        fetched_at: '—',
        source_updated_at: '2023年度版',
        quality_note: 'タイル重ね合わせによる視覚判定。元データ確認が必要',
        props: { depth: '0.5〜3.0m', scenario: '想定最大規模' },
      },
    ],
  },
  {
    id: 'river-1',
    category: 'rivers',
    priority: 'B',
    title: '水路・濠が検索半径内に存在',
    summary:
      '検索半径内に水面（外濠・桜田濠等）があります。現地条件と河川・水路管理者資料の確認を推奨します。',
    status: 'found',
    distance_m: 182,
    caution:
      '公開データの整備時点と現況が異なる可能性があります。護岸・暗渠区間の有無を確認してください。',
    evidence: [
      {
        source_key: 'osm_overpass',
        layer_name: 'waterway',
        attribution: '© OpenStreetMap contributors',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '',
        props: { waterway: 'moat' },
      },
    ],
  },
  {
    id: 'wx-1',
    category: 'weather',
    priority: 'B',
    title: '7日予報に強雨予測あり',
    summary:
      'Open-Meteoの予報で、時間雨量の大きい降水が見込まれます。搬入・養生・排水計画で留意してください。',
    status: 'found',
    distance_m: null,
    caution: '予報は取得時刻により変化します。再確認を推奨します。',
    evidence: [
      {
        source_key: 'open_meteo',
        layer_name: 'hourly precipitation / wind',
        attribution: 'Open-Meteo (CC BY 4.0)',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '予報値のため変動',
        props: { max_precip: '—', max_gust: '—' },
      },
    ],
  },
  {
    id: 'fac-1',
    category: 'facilities',
    priority: 'B',
    title: '官公庁・学校等が近接',
    summary:
      '検索半径内に官公庁施設および学校が含まれます。騒音・振動・通学路・警備動線への配慮確認を推奨します。',
    status: 'found',
    distance_m: 230,
    caution: '施設種別はOSM属性に基づく参考情報です。用途・運用時間は現地確認が必要です。',
    evidence: [
      {
        source_key: 'osm_overpass',
        layer_name: 'amenity (school / government)',
        attribution: '© OpenStreetMap contributors',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '網羅性に地域差あり',
        props: { amenity: 'school, government' },
      },
    ],
  },
  {
    id: 'road-1',
    category: 'roads',
    priority: 'C',
    title: '主要道路が近接',
    summary:
      '検索半径内に幹線道路があります。搬入経路・交通規制・占用許可の確認を推奨します。',
    status: 'found',
    distance_m: 90,
    caution:
      'OSMの道路属性は地域差があります。幅員・規制は道路管理者資料で確認してください。',
    evidence: [
      {
        source_key: 'osm_overpass',
        layer_name: 'highway=primary',
        attribution: '© OpenStreetMap contributors',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '',
        props: { highway: 'primary' },
      },
    ],
  },
  {
    id: 'terr-1',
    category: 'terrain',
    priority: 'C',
    title: '参考標高（地理院標高API）',
    summary:
      '地理院標高による参考標高です。周辺との比高・傾斜・微地形は現地確認が必要です。',
    status: 'found',
    distance_m: null,
    caution:
      '標高は参考値です。盛土・切土履歴や地盤条件は地質資料・ボーリングデータで確認してください。',
    evidence: [
      {
        source_key: 'gsi_tile',
        layer_name: '標高（DEM）',
        attribution: '国土地理院',
        fetched_at: '—',
        source_updated_at: '随時更新',
        quality_note: 'タイル補間値',
        props: { elevation: '—' },
      },
    ],
  },
  // ---- data_quality（常時表示してよい、取得失敗・未連携の誠実な明示）----
  {
    id: 'dq-1',
    category: 'data_quality',
    priority: 'D',
    title: 'PLATEAUデータ：未実装（取得試行なし）',
    summary:
      'PLATEAUアダプタは未実装のため実リクエストを行っていません。3D都市モデルによる建物・周辺密度確認は未取得です。判断材料が不足しています。',
    status: 'no_data',
    distance_m: null,
    caution:
      '実通信による取得失敗ではなく未実装です（タイムアウト等の固定値を記録していません）。Dは判断材料不足を意味します。',
    evidence: [
      {
        source_key: 'plateau',
        layer_name: '3D都市モデル(bldg)',
        attribution: 'PLATEAU / 国土交通省',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '未実装・実リクエストなし',
        props: { status: 'not_attempted' },
      },
    ],
  },
  {
    id: 'dq-2',
    category: 'data_quality',
    priority: 'D',
    title: 'xROAD連携：未連携（実リクエストなし）',
    summary:
      'xROAD APIは利用規約同意が必要なため未連携です。実 HTTP リクエストは行っておらず、道路交通量・旅行速度・道路施設情報は未取得です。',
    status: 'no_data',
    distance_m: null,
    caution:
      'API利用規約への同意後に連携できます。401 等の固定疑似ログは記録しません。対象道路範囲（直轄国道等）に注意してください。',
    evidence: [
      {
        source_key: 'xroad',
        layer_name: '交通量API（候補）',
        attribution: 'xROAD / 国土交通省',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '利用規約未同意・実リクエストなし',
        props: { status: 'not_attempted' },
      },
    ],
  },
];

/** 取得ログのフォールバック（実 API 実行前の空状態などで参照）。 */
export const FALLBACK_LOGS: LogEntry[] = [
  { time: '—', source: 'hazard_portal', endpoint: '（タイルレイヤ表示のみ）', code: '—', status: 'visual_only', ms: '—', error: '実タイルリクエストなし・目視確認要' },
  { time: '—', source: 'plateau', endpoint: '（未実装）', code: '—', status: 'not_attempted', ms: '—', error: '実リクエストなし' },
  { time: '—', source: 'xroad', endpoint: '（未連携）', code: '—', status: 'not_attempted', ms: '—', error: '利用規約未同意・実リクエストなし' },
];

// 候補地比較ビュー（SCR-010・Issue #175）のデモ用データ。
// 架空の3地点（霞が関周辺・豊洲・八王子のデモ候補地）を findings 付きで定義する。
// 実在情報を含まない（住所は「（架空）」明記・出典は合成サンプル）。
// 用途: 比較対象が未選択のときの「デモ表示」と、ダミー案件（findings 無し）では
// 確認できない正常系（該当あり/なし/未取得の区別）を確認するためのデータ。

function demoFinding(
  id: string,
  category: Finding['category'],
  priority: Finding['priority'],
  title: string,
  status: Finding['status'],
  distance_m: number | null,
  source: Finding['evidence'][number]['source_key'],
): Finding {
  return {
    id,
    category,
    priority,
    title,
    summary: `${title}（架空のデモ所見）`,
    status,
    distance_m,
    caution: 'デモデータ（実測値ではありません）',
    evidence: [
      {
        source_key: source,
        layer_name: title,
        attribution: 'デモ用サンプル（架空）',
        fetched_at: '2026-08-14 00:00:00',
        source_updated_at: '2026（合成）',
        quality_note: 'デモ用の架空値',
        props: {},
      },
    ],
  };
}

export const COMPARE_DEMO_CASES: Array<{
  id: string;
  name: string;
  code: string;
  address: string;
  lat: number;
  lon: number;
  radius: number;
  date: string;
  counts: Record<'A' | 'B' | 'C' | 'D', number>;
  isDummy: true;
  findings: Finding[];
}> = [
  {
    id: 'demo-compare-1',
    name: '千代田区 架空候補地A',
    code: 'OCSRC-COMP-001',
    address: '東京都千代田区霞が関2丁目（架空）',
    lat: 35.6745,
    lon: 139.7524,
    radius: 500,
    date: '2026-08-14',
    counts: { A: 1, B: 2, C: 1, D: 0 },
    isDummy: true,
    findings: [
      demoFinding('dc1-h1', 'hazard', 'A', '土砂災害警戒区域（架空）', 'found', 0, 'hazard_portal'),
      demoFinding('dc1-r1', 'rivers', 'B', '河川接近（架空）', 'found', 320, 'ksj'),
      demoFinding('dc1-w1', 'weather', 'C', '強雨予報（架空）', 'found', null, 'open_meteo'),
      demoFinding('dc1-t1', 'terrain', 'B', '低平地（架空）', 'not_found', null, 'gsi_tile'),
    ],
  },
  {
    id: 'demo-compare-2',
    name: '江東区 架空候補地B',
    code: 'OCSRC-COMP-002',
    address: '東京都江東区豊洲6丁目（架空）',
    lat: 35.6553,
    lon: 139.7967,
    radius: 1000,
    date: '2026-08-14',
    counts: { A: 2, B: 1, C: 0, D: 1 },
    isDummy: true,
    findings: [
      demoFinding('dc2-h1', 'hazard', 'A', '洪水浸水想定区域（架空）', 'found', 0, 'hazard_portal'),
      demoFinding('dc2-r1', 'rivers', 'B', '運河接近（架空）', 'found', 150, 'ksj'),
      demoFinding('dc2-f1', 'facilities', 'C', '周辺施設（架空）', 'not_found', null, 'osm_overpass'),
    ],
  },
  {
    id: 'demo-compare-3',
    name: '八王子市 架空候補地C',
    code: 'OCSRC-COMP-003',
    address: '東京都八王子市子安町（架空）',
    lat: 35.6557,
    lon: 139.3389,
    radius: 250,
    date: '2026-08-14',
    counts: { A: 0, B: 1, C: 2, D: 1 },
    isDummy: true,
    findings: [
      demoFinding('dc3-h1', 'hazard', 'C', 'ハザード区域（架空）', 'no_data', null, 'hazard_portal'),
      demoFinding('dc3-r1', 'rivers', 'B', '河川接近（架空）', 'found', 800, 'ksj'),
      demoFinding('dc3-w1', 'weather', 'C', '強風予報（架空）', 'found', null, 'open_meteo'),
    ],
  },
];

/** 比較ビューのデモ行（findings 付き・架空）。 */
export const COMPARE_DEMO_ROWS: CompareRow[] = COMPARE_DEMO_CASES.map((c) =>
  toCompareRow({
    id: c.id,
    name: c.name,
    code: c.code,
    address: c.address,
    lat: c.lat,
    lon: c.lon,
    radius: c.radius,
    date: c.date,
    status: 'done',
    counts: { A: c.counts.A, B: c.counts.B, C: c.counts.C, D: c.counts.D },
    isDummy: true,
    findings: c.findings,
  } as CaseRecord),
);
