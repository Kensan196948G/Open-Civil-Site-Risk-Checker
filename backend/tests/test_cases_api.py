"""案件台帳 API（Issue #111）の RBAC 境界・feature flag テスト（DB 不要）。

DB 統合テスト（CRUD・承認WF・監査ログの実動作）は test_cases_db_integration.py に
分離し、OCSRC_TEST_DATABASE_URL 設定時のみ実行される。
"""

from fastapi.testclient import TestClient

from app.cases import can_transition, resolve_role, role_has
from app.main import create_app
from app.settings import Settings, get_settings

# X-OCSRC-User は web 層（server.mjs）が Access JWT 検証後に付与する内部ヘッダ。
USER_HEADER = {"X-OCSRC-User": "demo-admin@example.com"}


def make_client(*, enabled: bool = True, **overrides) -> TestClient:
    """案件ストア有効化済みのクライアントを生成する。"""
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        _env_file=None,
        case_store_enabled=enabled,
        **overrides,
    )
    return TestClient(app)


def case_payload(**overrides) -> dict:
    payload = {
        "code": "OCSRC-TEST-001",
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


# ---------------------------------------------------------------------------
# feature flag（DB 不要・常時実行）
# ---------------------------------------------------------------------------


def test_case_api_disabled_returns_503() -> None:
    client = make_client(enabled=False, database_url=None)
    res = client.get("/api/v1/cases")
    assert res.status_code == 503
    assert "not enabled" in res.json()["detail"]


def test_case_api_disabled_on_post_and_delete() -> None:
    client = make_client(enabled=False, database_url=None)
    assert client.post("/api/v1/cases", json=case_payload()).status_code == 503
    assert client.delete("/api/v1/cases/1").status_code == 503
    assert client.get("/api/v1/audit").status_code == 503


def test_viewer_cannot_create_case() -> None:
    # database_url 無しでも RBAC 境界（403）は DB 到達前に判定される。
    client = make_client(database_url=None)
    res = client.post("/api/v1/cases", json=case_payload(), headers=USER_HEADER)
    assert res.status_code == 403
    assert "editor" in res.json()["detail"]


def test_unauthenticated_is_viewer() -> None:
    # X-OCSRC-User 無し = anonymous（viewer）。作成は拒否、一覧も DB 未設定なら 503。
    client = make_client(database_url=None)
    res = client.post("/api/v1/cases", json=case_payload())
    assert res.status_code == 403


def test_viewer_cannot_read_audit() -> None:
    client = make_client(database_url=None)
    res = client.get("/api/v1/audit", headers=USER_HEADER)
    assert res.status_code == 403


def test_viewer_cannot_approve() -> None:
    client = make_client(database_url=None)
    res = client.post("/api/v1/cases/1/approve", headers=USER_HEADER)
    assert res.status_code == 403


# ---------------------------------------------------------------------------
# RBAC ロール解決（純粋関数・DB 不要）
# ---------------------------------------------------------------------------


def test_resolve_role_priority() -> None:
    admin = ["admin@example.com"]
    approver = ["approver@example.com"]
    editor = ["editor@example.com"]
    auditor = ["auditor@example.com"]
    assert resolve_role("admin@example.com", admin_users=admin, approver_users=approver,
                        editor_users=editor, auditor_users=auditor) == "admin"
    assert resolve_role("approver@example.com", admin_users=admin, approver_users=approver,
                        editor_users=editor, auditor_users=auditor) == "approver"
    assert resolve_role("editor@example.com", admin_users=admin, approver_users=approver,
                        editor_users=editor, auditor_users=auditor) == "editor"
    assert resolve_role("auditor@example.com", admin_users=admin, approver_users=approver,
                        editor_users=editor, auditor_users=auditor) == "auditor"
    assert resolve_role("anyone@example.com", admin_users=admin, approver_users=approver,
                        editor_users=editor, auditor_users=auditor) == "viewer"


def test_resolve_role_admin_wins_when_in_multiple_lists() -> None:
    role = resolve_role(
        "boss@example.com",
        admin_users=["boss@example.com"],
        approver_users=["boss@example.com"],
        editor_users=["boss@example.com"],
        auditor_users=[],
    )
    assert role == "admin"


def test_role_hierarchy() -> None:
    assert role_has("admin", "approver")
    assert role_has("admin", "editor")
    assert role_has("admin", "auditor")
    assert role_has("approver", "editor")
    assert role_has("editor", "viewer")
    assert role_has("auditor", "viewer")
    assert not role_has("viewer", "editor")
    assert not role_has("editor", "approver")
    assert not role_has("approver", "admin")


def test_transition_rules() -> None:
    assert can_transition("draft", "submitted")
    assert can_transition("submitted", "approved")
    assert not can_transition("draft", "approved")
    assert not can_transition("approved", "draft")
    assert not can_transition("approved", "submitted")
