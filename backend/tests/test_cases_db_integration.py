"""案件台帳 API（Issue #111）の DB 統合テスト。

OCSRC_TEST_DATABASE_URL が設定されている場合のみ実行される（CI の PostGIS
サービス or ローカル PostGIS）。RBAC 境界の異常系は test_cases_api.py で、
実データ CRUD・承認WF・監査ログの実動作をここで検証する。
"""

import asyncio
import os

import pytest
from fastapi.testclient import TestClient

from app.cases import ensure_case_schema
from app.main import create_app
from app.settings import Settings, get_settings

TEST_DSN = os.environ.get("OCSRC_TEST_DATABASE_URL")

pytestmark = pytest.mark.skipif(
    not TEST_DSN, reason="OCSRC_TEST_DATABASE_URL not set (needs a PostGIS instance)"
)

USER = {
    "admin": {"X-OCSRC-User": "admin@example.com"},
    "approver": {"X-OCSRC-User": "approver@example.com"},
    "editor": {"X-OCSRC-User": "editor@example.com"},
    "auditor": {"X-OCSRC-User": "auditor@example.com"},
    "viewer": {"X-OCSRC-User": "viewer@example.com"},
}


def make_client(**overrides) -> TestClient:
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        case_store_enabled=True,
        case_admin_users="admin@example.com",
        case_approver_users="approver@example.com",
        case_editor_users="editor@example.com",
        case_auditor_users="auditor@example.com",
        database_url=TEST_DSN,
        **overrides,
    )
    return TestClient(app)


def case_payload(code: str = "OCSRC-TEST-001", **overrides) -> dict:
    payload = {
        "code": code,
        "name": "テスト用 架空候補地",
        "address": "東京都千代田区霞が関2丁目（架空）",
        "lat": 35.6745,
        "lon": 139.7524,
        "radius_m": 500,
        "counts": {"A": 1, "B": 2, "C": 3, "D": 0},
        "findings": [
            {
                "id": "f1",
                "category": "rivers",
                "priority": "B",
                "title": "河川接近（架空サンプル）",
                "summary": "テスト用の架空所見",
                "status": "found",
                "distance_m": 320.0,
                "caution": "ダミーデータ",
                "evidence": [],
            }
        ],
    }
    payload.update(overrides)
    return payload


@pytest.fixture(scope="module")
def client():
    """統合テスト用クライアント。スキーマを冪等作成し、後始末でテスト案件を削除する。

    ``with`` で lifespan を実行する（`TestClient(app)` を直接使うとリクエストごとに
    イベントループが切り替わり、asyncpg プールが古いループにバインドされたまま
    再利用されて `Event loop is closed` になるため）。
    """

    async def _ensure() -> None:
        import asyncpg

        conn = await asyncpg.connect(dsn=TEST_DSN)
        try:
            await ensure_case_schema(conn)
        finally:
            await conn.close()

    asyncio.run(_ensure())
    with make_client() as c:
        yield c
        # 後始末: テストで作成した案件を削除する（他テストの残留データに非干渉）。
        items = c.get("/api/v1/cases", headers=USER["admin"]).json()["items"]
        for case in items:
            if case["code"].startswith("OCSRC-TEST"):
                c.delete(f"/api/v1/cases/{case['id']}", headers=USER["admin"])


def _first_code(client, code: str) -> dict:
    items = client.get("/api/v1/cases", headers=USER["viewer"]).json()["items"]
    for c in items:
        if c["code"] == code:
            return c
    res = client.post("/api/v1/cases", json=case_payload(code=code), headers=USER["editor"])
    assert res.status_code == 201, res.text
    return res.json()["case"]


def test_create_and_get_case(client) -> None:
    res = client.post(
        "/api/v1/cases", json=case_payload(code="OCSRC-TEST-CREATE"), headers=USER["editor"]
    )
    assert res.status_code == 201, res.text
    case = res.json()["case"]
    assert case["status"] == "draft"
    assert case["created_by"] == "editor@example.com"
    assert case["counts"]["A"] == 1
    assert case["findings"][0]["priority"] == "B"

    detail = client.get(f"/api/v1/cases/{case['id']}", headers=USER["viewer"])
    assert detail.status_code == 200
    assert detail.json()["case"]["code"] == "OCSRC-TEST-CREATE"


def test_list_cases_returns_created(client) -> None:
    _first_code(client, "OCSRC-TEST-LIST")
    res = client.get("/api/v1/cases", headers=USER["viewer"])
    assert res.status_code == 200
    codes = [c["code"] for c in res.json()["items"]]
    assert "OCSRC-TEST-LIST" in codes


def test_update_case_as_editor(client) -> None:
    case = _first_code(client, "OCSRC-TEST-UPDATE")
    res = client.patch(
        f"/api/v1/cases/{case['id']}",
        json={"name": "更新後 架空候補地", "radius_m": 800},
        headers=USER["editor"],
    )
    assert res.status_code == 200
    updated = res.json()["case"]
    assert updated["name"] == "更新後 架空候補地"
    assert updated["radius_m"] == 800
    assert updated["updated_by"] == "editor@example.com"


def test_approval_workflow(client) -> None:
    case = _first_code(client, "OCSRC-TEST-WF")
    assert case["status"] == "draft"
    sub = client.post(f"/api/v1/cases/{case['id']}/submit", headers=USER["editor"])
    assert sub.status_code == 200
    assert sub.json()["case"]["status"] == "submitted"
    appr = client.post(f"/api/v1/cases/{case['id']}/approve", headers=USER["approver"])
    assert appr.status_code == 200
    approved = appr.json()["case"]
    assert approved["status"] == "approved"
    assert approved["approved_by"] == "approver@example.com"
    assert approved["approved_at"]


def test_approve_invalid_transition_conflict(client) -> None:
    case = _first_code(client, "OCSRC-TEST-CONFLICT")
    # draft から直接 approved は 409（draft → submitted → approved のみ）。
    appr = client.post(f"/api/v1/cases/{case['id']}/approve", headers=USER["approver"])
    assert appr.status_code == 409


def test_editor_cannot_approve(client) -> None:
    case = _first_code(client, "OCSRC-TEST-NOAPPROVE")
    res = client.post(f"/api/v1/cases/{case['id']}/approve", headers=USER["editor"])
    assert res.status_code == 403


def test_editor_cannot_update_approved(client) -> None:
    case = _first_code(client, "OCSRC-TEST-APPR")
    client.post(f"/api/v1/cases/{case['id']}/submit", headers=USER["editor"])
    client.post(f"/api/v1/cases/{case['id']}/approve", headers=USER["approver"])
    res = client.patch(
        f"/api/v1/cases/{case['id']}", json={"name": "不正更新"}, headers=USER["editor"]
    )
    assert res.status_code == 403


def test_viewer_cannot_delete(client) -> None:
    case = _first_code(client, "OCSRC-TEST-NODELETE")
    res = client.delete(f"/api/v1/cases/{case['id']}", headers=USER["viewer"])
    assert res.status_code == 403


def test_audit_log_records_actions(client) -> None:
    res = client.get("/api/v1/audit", headers=USER["auditor"])
    assert res.status_code == 200
    actions = [e["action"] for e in res.json()["items"]]
    assert "case_created" in actions
    assert "case_submitted" in actions
    assert "case_approved" in actions


def test_audit_log_entity_filter(client) -> None:
    case = _first_code(client, "OCSRC-TEST-AUDIT")
    res = client.get(
        f"/api/v1/audit?entity=case&entity_id={case['id']}", headers=USER["auditor"]
    )
    assert res.status_code == 200
    entries = res.json()["items"]
    assert entries, "案件に対応する監査エントリが存在すること"
    assert all(e["entity_id"] == str(case["id"]) for e in entries)


def test_admin_can_delete_case(client) -> None:
    case = _first_code(client, "OCSRC-TEST-DELETE")
    deleted = client.delete(f"/api/v1/cases/{case['id']}", headers=USER["admin"])
    assert deleted.status_code == 200
    assert deleted.json()["deleted"] is True
    assert client.get(f"/api/v1/cases/{case['id']}").status_code == 404


def test_admin_can_update_approved(client) -> None:
    case = _first_code(client, "OCSRC-TEST-ADMINUPD")
    client.post(f"/api/v1/cases/{case['id']}/submit", headers=USER["editor"])
    client.post(f"/api/v1/cases/{case['id']}/approve", headers=USER["approver"])
    res = client.patch(
        f"/api/v1/cases/{case['id']}", json={"name": "admin 修正"}, headers=USER["admin"]
    )
    assert res.status_code == 200
    assert res.json()["case"]["name"] == "admin 修正"
