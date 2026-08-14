// 案件台帳 API クライアントのテスト（Issue #111）。
// fetch をモックし、サーバー案件のマッピングとAPI呼び出しの契約を検証する。

import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  isCaseStoreEnabled,
  listCases,
  createCase,
  approveCase,
  deleteCase,
  listAudit,
  serverCaseToRecord,
  type ServerCase,
} from './cases';

const serverCase: ServerCase = {
  id: 3,
  code: 'OCSRC-2026-101',
  name: '架空 候補地A',
  address: '東京都千代田区霞が関2丁目（架空）',
  lat: 35.6745,
  lon: 139.7524,
  radius_m: 500,
  status: 'submitted',
  counts: { A: 1, B: 2, C: 3, D: 0 },
  findings: [
    {
      id: 'f1',
      category: 'rivers',
      priority: 'B',
      title: '河川接近（架空）',
      summary: 'テスト用の架空所見',
      status: 'found',
      distance_m: 320.0,
      caution: 'ダミーデータ',
      evidence: [],
    },
  ],
  created_by: 'demo-editor@example.com',
  created_at: '2026-08-14T00:00:00+09:00',
  updated_by: null,
  updated_at: null,
  approved_by: null,
  approved_at: null,
};

function mockFetch(ok: boolean, data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => data,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isCaseStoreEnabled', () => {
  it('一覧 GET が 200 なら有効', async () => {
    vi.stubGlobal('fetch', mockFetch(true, { status: 'ok', items: [] }));
    await expect(isCaseStoreEnabled()).resolves.toBe(true);
  });

  it('503 なら無効', async () => {
    vi.stubGlobal('fetch', mockFetch(false, { detail: 'not enabled' }, 503));
    await expect(isCaseStoreEnabled()).resolves.toBe(false);
  });
});

describe('listCases / createCase / transitions', () => {
  it('listCases は items を返す', async () => {
    vi.stubGlobal('fetch', mockFetch(true, { status: 'ok', items: [serverCase] }));
    const items = await listCases();
    expect(items).toHaveLength(1);
    expect(items[0].code).toBe('OCSRC-2026-101');
  });

  it('createCase は POST で作成し case を返す', async () => {
    const fetchMock = mockFetch(true, { status: 'ok', case: serverCase }, 201);
    vi.stubGlobal('fetch', fetchMock);
    const created = await createCase({
      code: serverCase.code,
      name: serverCase.name,
      address: serverCase.address,
      lat: serverCase.lat,
      lon: serverCase.lon,
      radius_m: serverCase.radius_m,
      counts: serverCase.counts,
      findings: serverCase.findings,
    });
    expect(created.id).toBe(3);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body)).code).toBe('OCSRC-2026-101');
  });

  it('submitCase / approveCase は専用エンドポイントへ POST', async () => {
    vi.stubGlobal('fetch', mockFetch(true, { status: 'ok', case: { ...serverCase, status: 'approved' } }));
    const approved = await approveCase(3);
    expect(approved.status).toBe('approved');
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/v1/cases/3/approve');
  });

  it('deleteCase は DELETE を送る', async () => {
    const fetchMock = mockFetch(true, { status: 'ok', deleted: true });
    vi.stubGlobal('fetch', fetchMock);
    await deleteCase(3);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe('DELETE');
  });

  it('listAudit は entity フィルタ付きで取得する', async () => {
    const fetchMock = mockFetch(true, { status: 'ok', items: [] });
    vi.stubGlobal('fetch', fetchMock);
    await listAudit('case', '3');
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/audit?entity=case&entity_id=3');
  });
});

describe('serverCaseToRecord', () => {
  it('サーバー案件を CaseRecord 表示形へマップする', () => {
    const rec = serverCaseToRecord(serverCase);
    expect(rec).not.toBeNull();
    expect(rec!.id).toBe('server-3');
    expect(rec!.isDummy).toBe(false);
    expect(rec!.status).toBe('review'); // submitted → review
    expect(rec!.counts.A).toBe(1);
    expect(rec!.findings).toHaveLength(1);
  });

  it('lat/lon 欠損は null を返す', () => {
    const rec = serverCaseToRecord({ ...serverCase, lat: 0, lon: 0 });
    expect(rec).toBeNull();
  });

  it('approved は done にマップされる', () => {
    const rec = serverCaseToRecord({ ...serverCase, status: 'approved' });
    expect(rec!.status).toBe('done');
  });
});
