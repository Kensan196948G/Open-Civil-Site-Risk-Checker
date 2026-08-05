import type { SourceLedgerEntry } from '../types';

// データソース台帳（SCR-006）。要件 §8.2「APIをアプリ内部に直接ハードコードしない」に従い、
// 接続先・利用条件・信頼度を1か所のレジストリに集約する。将来的に Global Civil API Catalog
// と連携する際は、この配列を外部台帳から読み込む形に差し替えられる。
//
// 注意: ここでの stat / last は「接続テストの最終結果（疎通）」であり、
// 個々の地点確認の取得結果は LogEntry（取得ログ）側で別管理する。

export const SOURCE_LEDGER: SourceLedgerEntry[] = [
  { key: 'nominatim', name: 'OpenStreetMap / Nominatim', provider: 'OSMF', type: 'api', license: 'ODbL', rank: 'A', stat: 'success', last: '—', enabled: true },
  { key: 'osm_overpass', name: 'OpenStreetMap / Overpass', provider: 'OSMF', type: 'api', license: 'ODbL', rank: 'B', stat: 'success', last: '—', enabled: true },
  { key: 'open_meteo', name: 'Open-Meteo Forecast', provider: 'Open-Meteo', type: 'api', license: 'CC BY 4.0', rank: 'A', stat: 'success', last: '—', enabled: true },
  // KSJ は既定で same-origin /api プロキシ経由の実連携（Issue #57）。stat は接続テストで更新される。
  { key: 'ksj', name: '国土数値情報', provider: '国土交通省', type: 'db', license: 'KSJ規約', rank: 'A', stat: 'skipped', last: '—', enabled: true },
  { key: 'hazard_portal', name: 'ハザードマップポータル', provider: '国土地理院', type: 'tile', license: '出典明示', rank: 'A', stat: 'success', last: '—', enabled: true },
  { key: 'gsi_tile', name: '地理院タイル', provider: '国土地理院', type: 'tile', license: '地理院条件', rank: 'A', stat: 'success', last: '—', enabled: true },
  { key: 'plateau', name: 'PLATEAU', provider: '国土交通省', type: 'api', license: 'CC BY 4.0', rank: 'B', stat: 'skipped', last: '—', enabled: true },
  { key: 'xroad', name: 'xROAD', provider: '国土交通省', type: 'api', license: '規約同意要', rank: 'C', stat: 'skipped', last: '—', enabled: false },
  { key: 'jma_warning', name: '気象庁 警報・注意報', provider: '気象庁', type: 'api', license: '出典明示', rank: 'A', stat: 'success', last: '—', enabled: true },
];

/** 台帳のクローンを返す（state 初期化用。元配列を破壊しない）。 */
export function cloneLedger(): SourceLedgerEntry[] {
  return SOURCE_LEDGER.map((s) => ({ ...s }));
}
