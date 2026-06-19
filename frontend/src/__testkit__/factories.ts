// テスト専用のドメインオブジェクト生成ヘルパ（本番バンドルには含まれない）。
// 各テストは検証したい差分だけを `over` で上書きし、残りは妥当な既定値で埋める。
import type {
  Evidence,
  Finding,
  SiteLocation,
  SourceLedgerEntry,
} from '../types';

export function makeEvidence(over: Partial<Evidence> = {}): Evidence {
  return {
    source_key: 'osm_overpass',
    layer_name: '道路',
    attribution: '© OpenStreetMap contributors',
    fetched_at: '2026-06-19T09:00:00+09:00',
    source_updated_at: '2026-06-01',
    quality_note: '',
    props: {},
    ...over,
  };
}

export function makeFinding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'F-001',
    category: 'roads',
    priority: 'C',
    title: '幹線道路',
    summary: '半径内に幹線道路を確認',
    status: 'found',
    distance_m: 123.4,
    caution: '精度に留意してください',
    evidence: [makeEvidence()],
    ...over,
  };
}

export function makeLocation(over: Partial<SiteLocation> = {}): SiteLocation {
  return {
    address: '東京都千代田区霞が関2丁目1番3号',
    lat: 35.6745,
    lon: 139.7503,
    radius: 500,
    coordLabel: '35.67450, 139.75030',
    radiusLabel: '500m',
    ...over,
  };
}

export function makeSource(over: Partial<SourceLedgerEntry> = {}): SourceLedgerEntry {
  return {
    key: 'osm_overpass',
    name: 'OpenStreetMap / Overpass',
    provider: 'OpenStreetMap Foundation',
    type: 'api',
    license: 'ODbL',
    rank: 'A',
    stat: 'success',
    last: '09:00:00',
    enabled: true,
    ...over,
  };
}
