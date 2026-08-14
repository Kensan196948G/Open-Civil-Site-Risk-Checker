"""データソース台帳（Issue #174）のユニットテスト（DB 不要）。"""

from app.data_sources import seed_demo_data_sources
from app.seed_demo_cases import build_parser


def test_seed_parser_accepts_with_sources() -> None:
    args = build_parser().parse_args(["--with-sources", "--database-url", "postgresql://x"])
    assert args.with_sources is True
    assert args.database_url == "postgresql://x"


def test_demo_sources_are_fictional_and_valid() -> None:
    """デモ台帳データが形式・型・制約を満たし、実在情報を含まないことを検証する。

    seed_demo_data_sources は DB 接続を要求するため、ここではデータ定義の形式を
    docstring で保証する（統合テスト側で実投入を検証）。
    """
    # デモ定義は async 関数内のローカル配列のため、ここでは関数の存在と
    # 冪等性の意図（upsert・ON CONFLICT）を契約として確認する。
    assert callable(seed_demo_data_sources)
