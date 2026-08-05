import { geocode } from './nominatim';
import { fetchWeather } from './openMeteo';
import { fetchOverpass } from './overpass';
import { fetchElevation } from './elevation';
import { fetchKsj } from './ksj';
import { fetchJmaWarning } from './jmaWarning';
import { nowHMS, nowStamp } from './http';
import { radiusLabel } from '../data/constants';
import { FALLBACK_FINDINGS } from '../data/fixtures';
import type {
  Category,
  Finding,
  LogEntry,
  MapFeatures,
  SiteLocation,
  SourceKey,
} from '../types';

// 地点確認のオーケストレーション（要件 §6.1 / NFR-003 部分結果表示）。
// 実 API（Nominatim / Overpass / Open-Meteo / 地理院標高 / KSJ バックエンド）を並行実行し、
// 取得できないソース（KSJ バックエンド停止・DB未整備 / PLATEAU 未実装 / xROAD 規約未同意）は
// 誠実に skipped / not_attempted として表示する。
// 実通信を行っていない項目に HTTP コードや応答時間を記録しない（外部評価 Phase 0: 疑似ログ廃止）。

export interface AnalysisInputForm {
  type: 'address' | 'coord';
  address: string;
  lat: number;
  lon: number;
  radius: number;
  categories: Record<Exclude<Category, 'data_quality'>, boolean>;
}

export interface AnalysisResult {
  location: SiteLocation;
  findings: Finding[];
  logs: LogEntry[];
  features: MapFeatures;
}

export type StepStatus = 'pending' | 'success' | 'failed' | 'skipped';
export interface StepDef {
  key: SourceKey;
  name: string;
}

/** ローディング表示に出す取得ステップ（順序はデザイン準拠で固定）。 */
export const STEP_DEFS: StepDef[] = [
  { key: 'nominatim', name: '住所ジオコーディング（Nominatim）' },
  { key: 'osm_overpass', name: '周辺道路・施設・水域（Overpass）' },
  { key: 'open_meteo', name: '気象予報（Open-Meteo）' },
  { key: 'ksj', name: '国土数値情報（河川・施設）' },
  { key: 'hazard_portal', name: 'ハザードマップ重ね合わせ' },
  { key: 'jma_warning', name: '気象庁 警報・注意報' },
  { key: 'gsi_tile', name: '地理院タイル（標高・地形）' },
  { key: 'plateau', name: 'PLATEAU（3D都市モデル）' },
  { key: 'xroad', name: 'xROAD（道路交通量）' },
];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface RunOpts {
  /** 取得ステップの状態が変わるたびに呼ばれる（部分結果表示用）。 */
  onStep?: (key: SourceKey, status: StepStatus) => void;
}

export interface RunOutcome {
  result?: AnalysisResult;
  /** ジオコーディング失敗など、続行不能なエラー。 */
  error?: string;
}

export async function runAnalysis(form: AnalysisInputForm, opts: RunOpts = {}): Promise<RunOutcome> {
  const onStep = opts.onStep ?? (() => {});
  const logs: LogEntry[] = [];
  const findings: Finding[] = [];
  const features: MapFeatures = { roads: [], water: [], facilities: [] };

  // ---- 1) 地点確定（ジオコーディング） ----
  let lat = form.lat;
  let lon = form.lon;
  // 初期値を代入しても両分岐で必ず上書きされるため、宣言のみ（ESLint no-useless-assignment 対応）。
  let address: string;

  if (form.type === 'address') {
    const geo = await geocode(form.address);
    logs.push(geo.log);
    if (!geo.ok) {
      onStep('nominatim', 'failed');
      return { error: `住所のジオコーディングに失敗しました：${geo.error}` };
    }
    lat = geo.lat;
    lon = geo.lon;
    address = geo.displayName || form.address;
    if (geo.approximated) {
      address += '（入力住所の号・番地までは特定できず、より広い範囲の代表地点です）';
    }
    onStep('nominatim', 'success');
  } else {
    address = `緯度経度入力 ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    logs.push({ time: nowHMS(), source: 'nominatim', endpoint: '（座標直接入力）', code: '—', status: 'skipped', ms: '—', error: 'ジオコーディング不要' });
    onStep('nominatim', 'skipped');
  }

  const location: SiteLocation = {
    address,
    lat,
    lon,
    radius: form.radius,
    coordLabel: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    radiusLabel: radiusLabel(form.radius),
  };
  const input = { lat, lon, radius: form.radius };
  const cat = form.categories;

  // ---- 2) 実 API を並行実行 ----
  const needOverpass = cat.roads || cat.rivers || cat.facilities;

  const overpassP = needOverpass
    ? fetchOverpass(input).then((r) => {
        logs.push(r.log);
        // 選択カテゴリのみ採用（要件 FR-004）。
        r.findings.forEach((f) => {
          if (cat[f.category as Exclude<Category, 'data_quality'>]) findings.push(f);
        });
        if (r.features?.roads && cat.roads) features.roads = r.features.roads;
        if (r.features?.water && cat.rivers) features.water = r.features.water;
        if (r.features?.facilities && cat.facilities) features.facilities = r.features.facilities;
        onStep('osm_overpass', r.stepStatus);
      })
    : Promise.resolve().then(() => onStep('osm_overpass', 'skipped'));

  const weatherP = cat.weather
    ? fetchWeather(input).then((r) => {
        logs.push(r.log);
        findings.push(...r.findings);
        onStep('open_meteo', r.stepStatus);
      })
    : Promise.resolve().then(() => onStep('open_meteo', 'skipped'));

  const elevP = cat.terrain
    ? fetchElevation(input).then((r) => {
        logs.push(r.log);
        findings.push(...r.findings);
        onStep('gsi_tile', r.stepStatus);
      })
    : Promise.resolve().then(() => onStep('gsi_tile', 'skipped'));

  // ---- 3) KSJ ローカルDB（Phase 2） ----
  // 既定で same-origin /api プロキシ経由の実連携（Issue #57）。バックエンド停止・DB 未整備は
  // fetchKsj 側が failed として誠実に表示する（NFR-504）。
  const needKsj = cat.rivers || cat.facilities;
  const ksjP = needKsj
    ? fetchKsj(input).then((r) => {
        logs.push(r.log);
        r.findings.forEach((f) => {
          if (cat[f.category as Exclude<Category, 'data_quality'>]) findings.push(f);
        });
        onStep('ksj', r.stepStatus);
      })
    : delay(300).then(() => {
        logs.push({ time: nowHMS(), source: 'ksj', endpoint: 'PostGIS ST_DWithin', code: '—', status: 'skipped', ms: '—', error: '対象カテゴリ未選択のためスキップ' });
        onStep('ksj', 'skipped');
      });

  // ハザードマップ: タイルレイヤは表示可能（重ね合わせは利用者が目視確認）。
  // 実タイルリクエストの成否を検証していないため、HTTP 200 等の疑似ログは記録しない。
  const hazardP = Promise.resolve().then(() => {
    if (cat.hazard) {
      findings.push(hazardVisualFinding());
      logs.push({
        time: nowHMS(),
        source: 'hazard_portal',
        endpoint: '（タイルレイヤ表示のみ・実リクエストなし）',
        code: '—',
        status: 'visual_only',
        ms: '—',
        error: '重ね合わせ表示は可能。区域判定は目視確認が必要で、実タイル取得の成否は検証していない',
      });
      onStep('hazard_portal', 'success');
    } else {
      onStep('hazard_portal', 'skipped');
    }
  });

  // PLATEAU: 未実装（実リクエストなし）。固定タイムアウトを疑似記録しない。
  const plateauP = Promise.resolve().then(() => {
    findings.push(dataQualityFinding('plateau'));
    logs.push({
      time: nowHMS(),
      source: 'plateau',
      endpoint: '（未実装・実リクエストなし）',
      code: '—',
      status: 'not_attempted',
      ms: '—',
      error: 'PLATEAU アダプタ未実装。実通信による取得・失敗判定は行っていない',
    });
    onStep('plateau', 'skipped');
  });

  // xROAD: 利用規約未同意のため未連携（実リクエストなし）。固定 401 を疑似記録しない。
  const xroadP = Promise.resolve().then(() => {
    findings.push(dataQualityFinding('xroad'));
    logs.push({
      time: nowHMS(),
      source: 'xroad',
      endpoint: '（未連携・実リクエストなし）',
      code: '—',
      status: 'not_attempted',
      ms: '—',
      error: 'xROAD は利用規約未同意のため未連携。実 HTTP リクエストなし',
    });
    onStep('xroad', 'skipped');
  });

  // 気象庁 警報・注意報（Phase 3 / Issue #22）: 認証不要・CORS開放のため直接取得する。
  const jmaP = cat.hazard
    ? fetchJmaWarning(input).then((r) => {
        logs.push(r.log);
        findings.push(...r.findings);
        onStep('jma_warning', r.stepStatus);
      })
    : Promise.resolve().then(() => onStep('jma_warning', 'skipped'));

  await Promise.all([overpassP, weatherP, elevP, ksjP, hazardP, plateauP, xroadP, jmaP]);

  // Overpass が失敗し roads/rivers/facilities が空なら、フォールバック項目で補う（要件 AC-009）。
  ensureFallback(findings, cat);

  // 確認優先度順 → カテゴリ順で安定ソート。
  const order: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
  findings.sort((a, b) => order[a.priority] - order[b.priority]);

  // ログを時刻順に。
  logs.sort((a, b) => a.time.localeCompare(b.time));

  return { result: { location, findings, logs, features } };
}

function hazardVisualFinding(): Finding {
  return {
    id: 'haz-1',
    category: 'hazard',
    priority: 'B',
    title: '洪水浸水想定区域レイヤを重ね合わせ可能（視覚確認要）',
    summary:
      'ハザードマップポータルの洪水浸水想定（想定最大規模）タイルを地図に重ね合わせできます。地点との重なりは目視確認が必要で、厳密な判定には自治体公表資料の確認を優先してください。',
    status: 'found',
    distance_m: null,
    caution:
      'タイル表示は視覚確認向けです。重なりの有無はクライアント側で自動判定していません。自治体公表の浸水想定区域図を確認してください。',
    evidence: [
      {
        source_key: 'hazard_portal',
        layer_name: '洪水浸水想定区域（L2）',
        attribution: 'ハザードマップポータルサイト',
        fetched_at: nowStamp(),
        source_updated_at: '配信タイル（年度版）',
        quality_note: 'タイル重ね合わせによる視覚判定。元データ確認が必要',
        props: { scenario: '想定最大規模', judge: '自動判定なし' },
      },
    ],
  };
}

function dataQualityFinding(key: 'plateau' | 'xroad'): Finding {
  const base = FALLBACK_FINDINGS.find((f) => f.evidence[0]?.source_key === key);
  // フォールバック定義をそのまま使う（取得失敗・未連携の誠実な明示）。
  return base ? { ...base } : FALLBACK_FINDINGS[FALLBACK_FINDINGS.length - 1];
}

/** 選択カテゴリで実データが得られなかった場合に、フォールバック項目で空白を防ぐ。 */
function ensureFallback(findings: Finding[], cat: Record<string, boolean>) {
  const has = (c: Category) => findings.some((f) => f.category === c);
  for (const c of ['roads', 'rivers', 'facilities'] as Category[]) {
    if (cat[c] && !has(c)) {
      const fb = FALLBACK_FINDINGS.find((f) => f.category === c);
      if (fb) findings.push({ ...fb, status: 'no_data', priority: 'D', title: `${fb.title}（実取得なし・参考）`, caution: `実APIから取得できなかったため参考表示です。${fb.caution}` });
    }
  }
}
