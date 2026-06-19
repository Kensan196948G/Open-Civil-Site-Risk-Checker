import type { CaseRecord, CaseStatus, Finding, LogEntry, Priority, SiteLocation } from '../types';

// 実取得（本番）データの調査案件リポジトリ。localStorage に永続化する。
// ダミー（サンプル）データ（DUMMY_CASES）とは別管理で、すべて isDummy:false。
//
// 本番データ投入の経路:
//   1) 実 API による地点確認の結果を buildCaseFromAnalysis() で案件化し addLiveCase() で保存。
//   2) JSON を importLiveCases() で一括投入（他環境からの移行・バックアップ復元）。

const KEY = 'ocsrc-cases';

const GRADES: Priority[] = ['A', 'B', 'C', 'D'];

function countsOfFindings(findings: Finding[]): Record<Priority, number> {
  const c: Record<Priority, number> = { A: 0, B: 0, C: 0, D: 0 };
  findings.forEach((f) => {
    if (c[f.priority] != null) c[f.priority] += 1;
  });
  return c;
}

function todayStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function uid(): string {
  return `live-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function statusFromCounts(counts: Record<Priority, number>): CaseStatus {
  return counts.A > 0 ? 'review' : 'done';
}

/** 確認結果スナップショットから本番データ案件を生成する。 */
export function buildCaseFromAnalysis(
  location: SiteLocation,
  findings: Finding[],
  logs: LogEntry[],
  fetchedAt: string,
): CaseRecord {
  const counts = countsOfFindings(findings);
  const stamp = todayStamp();
  return {
    id: uid(),
    name: location.address || `緯度経度 ${location.coordLabel}`,
    code: `OCSRC-LIVE-${stamp.replace(/-/g, '')}-${new Date().getHours()}${String(new Date().getMinutes()).padStart(2, '0')}`,
    address: location.coordLabel,
    lat: location.lat,
    lon: location.lon,
    radius: location.radius,
    date: stamp,
    status: statusFromCounts(counts),
    counts,
    isDummy: false,
    findings,
    location,
    logs,
    fetchedAt,
  };
}

/** 保存済みの本番データ案件を読み込む（新しい順）。 */
export function loadLiveCases(): CaseRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(coerce).filter((x): x is CaseRecord => x !== null);
  } catch {
    return [];
  }
}

function persist(cases: CaseRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cases));
  } catch {
    /* 保存不可（容量超過・プライベートモード等）でも UI 上の一覧は維持 */
  }
}

export function addLiveCase(record: CaseRecord): CaseRecord[] {
  const next = [record, ...loadLiveCases()];
  persist(next);
  return next;
}

export function deleteLiveCase(id: string): CaseRecord[] {
  const next = loadLiveCases().filter((c) => c.id !== id);
  persist(next);
  return next;
}

export function clearLiveCases(): CaseRecord[] {
  persist([]);
  return [];
}

/** 本番データを JSON 文字列にエクスポート（バックアップ・移行用）。 */
export function exportLiveCases(): string {
  return JSON.stringify(loadLiveCases(), null, 2);
}

/**
 * 外部 JSON（配列）を本番データとして取り込む。既存に追記マージする。
 * 取り込みデータは信頼境界外として扱い、型を厳格に検証・正規化する（要件 NFR-501/505）。
 * @returns { cases, imported } 取り込み後の全件と、取り込めた件数。
 */
export function importLiveCases(json: string): { cases: CaseRecord[]; imported: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('JSON の解析に失敗しました。配列形式の JSON を貼り付けてください。');
  }
  const arr = Array.isArray(parsed) ? parsed : [parsed];
  const valid = arr.map(coerce).filter((x): x is CaseRecord => x !== null);
  if (valid.length === 0) throw new Error('取り込める案件が見つかりませんでした（name / lat / lon が必要です）。');
  const next = [...valid, ...loadLiveCases()];
  persist(next);
  return { cases: next, imported: valid.length };
}

/** 任意オブジェクトを CaseRecord に正規化。必須（name, lat, lon）を欠く場合は null。
 *  信頼境界外として unknown 受けし、フィールドごとに型を検証する。 */
function coerce(o: unknown): CaseRecord | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, unknown>;
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  const name = typeof r.name === 'string' ? r.name : '';
  if (!name || Number.isNaN(lat) || Number.isNaN(lon)) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const counts: Record<Priority, number> = { A: 0, B: 0, C: 0, D: 0 };
  if (r.counts && typeof r.counts === 'object') {
    const cs = r.counts as Record<string, unknown>;
    GRADES.forEach((g) => {
      const n = Number(cs[g]);
      counts[g] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
    });
  }
  const allowedStatus: CaseStatus[] = ['done', 'progress', 'review', 'draft'];
  const status: CaseStatus = allowedStatus.includes(r.status as CaseStatus)
    ? (r.status as CaseStatus)
    : statusFromCounts(counts);

  return {
    id: typeof r.id === 'string' && r.id ? r.id : uid(),
    name,
    code: typeof r.code === 'string' && r.code ? r.code : `OCSRC-IMPORT-${uid().slice(5, 13)}`,
    address: typeof r.address === 'string' ? r.address : `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    lat,
    lon,
    radius: Number.isFinite(Number(r.radius)) ? Number(r.radius) : 500,
    date: typeof r.date === 'string' && r.date ? r.date : todayStamp(),
    status,
    counts,
    isDummy: false, // 取り込みデータは本番データ扱い
    findings: Array.isArray(r.findings) ? (r.findings as Finding[]) : undefined,
    location: r.location && typeof r.location === 'object' ? (r.location as SiteLocation) : undefined,
    logs: Array.isArray(r.logs) ? (r.logs as LogEntry[]) : undefined,
    fetchedAt: typeof r.fetchedAt === 'string' ? r.fetchedAt : undefined,
  };
}
