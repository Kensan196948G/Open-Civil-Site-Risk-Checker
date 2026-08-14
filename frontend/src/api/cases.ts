// 案件台帳 API クライアント（Issue #111）。
// サーバー側は feature flag（OCSRC_CASE_STORE_ENABLED）が有効な場合のみ応答する。
// フロントは検出時にサーバー保存へ昇格し、無効・未到達時は既存の localStorage
// （caseStore.ts）へフォールバックする（オフライン/未ログインの下書きとして維持）。

import { fetchJson } from './http';
import type { CaseRecord, Finding, Priority } from '../types';

export interface ServerCase {
  id: number;
  code: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  radius_m: number;
  status: 'draft' | 'submitted' | 'approved';
  counts: Record<Priority, number>;
  findings: Finding[];
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
}

export interface AuditEntry {
  id: number;
  entity: string;
  entity_id: string;
  action: string;
  actor: string;
  detail: Record<string, unknown>;
  ts: string;
}

/** 案件台帳 API が有効か（一覧 GET が 200 を返せば有効とみなす）。 */
export async function isCaseStoreEnabled(): Promise<boolean> {
  const out = await fetchJson<{ status: string }>('/api/v1/cases', { timeout: 5000 });
  return out.ok;
}

/** 案件一覧を取得する。 */
export async function listCases(): Promise<ServerCase[]> {
  const out = await fetchJson<{ status: string; items: ServerCase[] }>('/api/v1/cases');
  if (!out.ok || !out.data) throw new Error(out.error || '案件一覧の取得に失敗しました');
  return out.data.items;
}

export interface NewCaseInput {
  code: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  radius_m: number;
  counts: Record<Priority, number>;
  findings: Finding[];
}

/** 案件を作成する（editor 以上）。 */
export async function createCase(input: NewCaseInput): Promise<ServerCase> {
  const out = await fetchJson<{ status: string; case: ServerCase }>('/api/v1/cases', {
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  });
  if (!out.ok || !out.data) throw new Error(out.error || '案件の作成に失敗しました');
  return out.data.case;
}

/** 案件を承認申請へ遷移する（draft → submitted）。 */
export async function submitCase(id: number): Promise<ServerCase> {
  const out = await fetchJson<{ status: string; case: ServerCase }>(
    `/api/v1/cases/${id}/submit`,
    { init: { method: 'POST' } },
  );
  if (!out.ok || !out.data) throw new Error(out.error || '承認申請に失敗しました');
  return out.data.case;
}

/** 案件を承認する（submitted → approved、approver 以上）。 */
export async function approveCase(id: number): Promise<ServerCase> {
  const out = await fetchJson<{ status: string; case: ServerCase }>(
    `/api/v1/cases/${id}/approve`,
    { init: { method: 'POST' } },
  );
  if (!out.ok || !out.data) throw new Error(out.error || '承認に失敗しました');
  return out.data.case;
}

/** 案件を削除する（admin のみ）。 */
export async function deleteCase(id: number): Promise<void> {
  const out = await fetchJson<{ status: string }>(`/api/v1/cases/${id}`, {
    init: { method: 'DELETE' },
  });
  if (!out.ok) throw new Error(out.error || '案件の削除に失敗しました');
}

/** 監査ログを取得する（auditor 以上）。 */
export async function listAudit(entity?: string, entityId?: string): Promise<AuditEntry[]> {
  const params = new URLSearchParams();
  if (entity) params.set('entity', entity);
  if (entityId) params.set('entity_id', entityId);
  const qs = params.toString();
  const out = await fetchJson<{ status: string; items: AuditEntry[] }>(
    `/api/v1/audit${qs ? `?${qs}` : ''}`,
  );
  if (!out.ok || !out.data) throw new Error(out.error || '監査ログの取得に失敗しました');
  return out.data.items;
}

/** サーバー案件を既存の CaseRecord 表示形へマップする（findings 保持時のみ復元可能）。 */
export function serverCaseToRecord(c: ServerCase): CaseRecord | null {
  if (!c.lat || !c.lon || !Array.isArray(c.findings)) return null;
  const counts: Record<Priority, number> = { A: 0, B: 0, C: 0, D: 0 };
  (['A', 'B', 'C', 'D'] as Priority[]).forEach((g) => {
    const n = Number(c.counts[g]);
    counts[g] = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  });
  return {
    id: `server-${c.id}`,
    name: c.name,
    code: c.code,
    address: c.address || c.name,
    lat: c.lat,
    lon: c.lon,
    radius: c.radius_m,
    date: c.created_at.slice(0, 10),
    status: c.status === 'approved' ? 'done' : c.status === 'submitted' ? 'review' : 'draft',
    counts,
    isDummy: false,
    findings: c.findings,
    location: {
      address: c.address || c.name,
      lat: c.lat,
      lon: c.lon,
      radius: c.radius_m,
      coordLabel: `${c.lat.toFixed(5)}, ${c.lon.toFixed(5)}`,
      radiusLabel: `${c.radius_m}m`,
    },
    logs: [],
    fetchedAt: c.created_at,
  };
}
