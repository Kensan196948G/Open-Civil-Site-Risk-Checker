import type { SourceLedgerEntry } from '../types';

// データソース台帳（SCR-006）。要件 §8.2「APIをアプリ内部に直接ハードコードしない」に従い、
// 接続先・利用条件・信頼度を1か所のレジストリに集約する。将来的に Global Civil API Catalog
// と連携する際は、この配列を外部台帳から読み込む形に差し替えられる。
//
// 注意: ここでの stat / last は「接続テストの最終結果（疎通）」であり、
// 個々の地点確認の取得結果は LogEntry（取得ログ）側で別管理する。
//
// Issue #174（データ鮮度・ライセンス台帳）: sourceUpdatedAt（元データ更新日）・
// usageNote（利用条件メモ）・refreshHistory（再取込履歴）は「デモ用の架空値」で、
// 実データの再取込・ライセンス確認が完了した時点で更新する。実在情報を含まない。

export const SOURCE_LEDGER: SourceLedgerEntry[] = [
  { key: 'nominatim', name: 'OpenStreetMap / Nominatim', provider: 'OSMF', type: 'api', license: 'ODbL', rank: 'A', stat: 'success', last: '—', enabled: true, sourceUpdatedAt: '日次更新', usageNote: '出典表示義務（© OpenStreetMap contributors）。1 req/sec を遵守。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: ジオコーダ利用（実データ取得なし）' }] },
  { key: 'osm_overpass', name: 'OpenStreetMap / Overpass', provider: 'OSMF', type: 'api', license: 'ODbL', rank: 'B', stat: 'success', last: '—', enabled: true, sourceUpdatedAt: '日次更新', usageNote: '出典表示義務（© OpenStreetMap contributors）。Overpass API の利用ポリシー遵守。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: 周辺道路・水域の取得（実データ取得なし）' }] },
  { key: 'open_meteo', name: 'Open-Meteo Forecast', provider: 'Open-Meteo', type: 'api', license: 'CC BY 4.0', rank: 'A', stat: 'success', last: '—', enabled: true, sourceUpdatedAt: '15分毎', usageNote: '出典表示義務（CC BY 4.0）。商用利用可。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: 7日予報取得（実データ取得なし）' }] },
  // KSJ は既定で same-origin /api プロキシ経由の実連携（Issue #57）。stat は接続テストで更新される。
  { key: 'ksj', name: '国土数値情報', provider: '国土交通省', type: 'db', license: 'KSJ規約', rank: 'A', stat: 'skipped', last: '—', enabled: true, sourceUpdatedAt: 'W05: 2021年度（合成）', usageNote: '国土数値情報の利用規約・出典表記に従う。データセットごとに商用/非商用が異なる。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: 荒川水系 2,937 件の取込検証（実データ投入なし）' }] },
  { key: 'hazard_portal', name: 'ハザードマップポータル', provider: '国土地理院', type: 'tile', license: '出典明示', rank: 'A', stat: 'success', last: '—', enabled: true, sourceUpdatedAt: '年度版', usageNote: '出典明示。タイルは視覚確認向け。区域内判定は #112 の合成サンプルで検証。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: 区域判定ポリゴン（合成サンプル3件）' }] },
  { key: 'gsi_tile', name: '地理院タイル', provider: '国土地理院', type: 'tile', license: '地理院条件', rank: 'A', stat: 'success', last: '—', enabled: true, sourceUpdatedAt: '随時更新', usageNote: '国土地理院の利用規約（出典明示・加工物の明記等）に従う。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: 背景タイル表示（実データ取得なし）' }] },
  { key: 'plateau', name: 'PLATEAU', provider: '国土交通省', type: 'api', license: 'CC BY 4.0', rank: 'B', stat: 'skipped', last: '—', enabled: true, sourceUpdatedAt: '—', usageNote: 'CC BY 4.0。試験運用・SLA 無しのため見送り中（Issue #22）。', refreshHistory: [] },
  { key: 'xroad', name: 'xROAD', provider: '国土交通省', type: 'api', license: '規約同意要', rank: 'C', stat: 'skipped', last: '—', enabled: false, sourceUpdatedAt: '—', usageNote: '匿名アクセス 403 のため未連携（利用規約上の理由）。', refreshHistory: [] },
  { key: 'jma_warning', name: '気象庁 警報・注意報', provider: '気象庁', type: 'api', license: '出典明示', rank: 'A', stat: 'success', last: '—', enabled: true, sourceUpdatedAt: '随時更新', usageNote: '気象庁の出典明示（「気象庁発表」等）。', refreshHistory: [{ at: '2026-08-12', note: 'デモ: 警報・注意報の取得（実データ取得なし）' }] },
];

/** 台帳のクローンを返す（state 初期化用。元配列を破壊しない）。 */
export function cloneLedger(): SourceLedgerEntry[] {
  return SOURCE_LEDGER.map((s) => ({ ...s }));
}
