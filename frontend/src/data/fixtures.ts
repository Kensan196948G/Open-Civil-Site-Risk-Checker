import type { Finding, LogEntry } from '../types';

// デザインモック由来のフォールバック確認結果。
// 用途:
//  1) 個別アダプタの取得失敗時に、該当カテゴリの代替表示として使う（要件 AC-009）。
//  2) data_quality（PLATEAU タイムアウト / xROAD 未連携）の固定項目を供給する。
//     これらは「取得失敗・未連携」を誠実に表すための項目であり、常に表示してよい。
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
    title: 'PLATEAUデータ：取得失敗',
    summary:
      'PLATEAUアダプタでタイムアウトが発生しました。3D都市モデルによる建物・周辺密度確認は未取得です。判断材料が不足しています。',
    status: 'failed',
    distance_m: null,
    caution:
      '再実行するか、対象地域のデータ整備状況を確認してください。Dは判断材料不足を意味します。',
    evidence: [
      {
        source_key: 'plateau',
        layer_name: '3D都市モデル(bldg)',
        attribution: 'PLATEAU / 国土交通省',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: 'Read timeout (20s)',
        props: { error: 'timeout' },
      },
    ],
  },
  {
    id: 'dq-2',
    category: 'data_quality',
    priority: 'D',
    title: 'xROAD連携：未連携',
    summary:
      'xROAD APIは利用規約同意が必要なため未連携です。道路交通量・旅行速度・道路施設情報は未取得です。',
    status: 'no_data',
    distance_m: null,
    caution:
      'API利用規約への同意後に連携できます。対象道路範囲（直轄国道等）に注意してください。',
    evidence: [
      {
        source_key: 'xroad',
        layer_name: '交通量API（候補）',
        attribution: 'xROAD / 国土交通省',
        fetched_at: '—',
        source_updated_at: '—',
        quality_note: '利用規約未同意',
        props: { status: 'skipped' },
      },
    ],
  },
];

/** 取得ログのフォールバック（実 API 実行前の空状態などで参照）。 */
export const FALLBACK_LOGS: LogEntry[] = [
  { time: '—', source: 'plateau', endpoint: 'GET /api/v1/datasets?bbox=...', code: '—', status: 'timeout', ms: '20000', error: 'Read timed out after 20s' },
  { time: '—', source: 'xroad', endpoint: 'GET /api/traffic', code: '401', status: 'skipped', ms: '—', error: '利用規約未同意のためスキップ' },
];
