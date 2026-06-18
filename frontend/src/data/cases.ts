import type { CaseRecord } from '../types';

// ダッシュボード（SCR-000）に表示する調査案件の「ダミー（サンプル）データ」。
// すべて isDummy:true。UI 上は「ダミーデータ」と明記して表示する。実取得（本番）データは
// caseStore（localStorage）側に保存され、isDummy:false で区別される。
// 「開く」で案件の座標・半径を使って実 API による地点確認（SCR-002）を実行する。
//
// 注意: counts はデモ値であり、優先度 D は「リスクが低い」ではなく「判断材料の不足」を意味する。

export const DUMMY_CASES: CaseRecord[] = [
  { id: 'c1', name: '霞が関2丁目 候補地A', code: 'OCSRC-2026-018', address: '千代田区霞が関2丁目', lat: 35.6745, lon: 139.7503, radius: 500, date: '2026-06-18', status: 'progress', counts: { A: 1, B: 3, C: 4, D: 2 }, isDummy: true },
  { id: 'c2', name: '豊洲6丁目 埠頭再整備', code: 'OCSRC-2026-015', address: '江東区豊洲6丁目', lat: 35.6553, lon: 139.7967, radius: 1000, date: '2026-06-15', status: 'done', counts: { A: 2, B: 2, C: 3, D: 1 }, isDummy: true },
  { id: 'c3', name: '多摩川緑地 橋梁補修', code: 'OCSRC-2026-012', address: '大田区下丸子', lat: 35.5739, lon: 139.689, radius: 500, date: '2026-06-12', status: 'review', counts: { A: 3, B: 4, C: 2, D: 0 }, isDummy: true },
  { id: 'c4', name: '八王子南口 道路拡幅', code: 'OCSRC-2026-010', address: '八王子市子安町', lat: 35.6557, lon: 139.3389, radius: 250, date: '2026-06-10', status: 'done', counts: { A: 0, B: 2, C: 5, D: 1 }, isDummy: true },
  { id: 'c5', name: '浦安日の出 護岸補強', code: 'OCSRC-2026-008', address: '浦安市日の出', lat: 35.636, lon: 139.917, radius: 1000, date: '2026-06-08', status: 'draft', counts: { A: 1, B: 1, C: 2, D: 3 }, isDummy: true },
  { id: 'c6', name: '横浜本牧 物流倉庫', code: 'OCSRC-2026-005', address: '横浜市中区本牧', lat: 35.429, lon: 139.666, radius: 3000, date: '2026-06-05', status: 'done', counts: { A: 0, B: 3, C: 4, D: 1 }, isDummy: true },
];

/** @deprecated 後方互換エイリアス。新コードは DUMMY_CASES を使う。 */
export const CASES = DUMMY_CASES;

/** 「今週実行」の基準日（KPI 集計用）。 */
export const THIS_WEEK_SINCE = '2026-06-15';
