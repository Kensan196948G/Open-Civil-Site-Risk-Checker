"""ハザード区域判定のユニットテスト（Issue #112・DB 不要）。"""

from app.ksj import HAZARD_TYPES, _hazard_type_of


def test_hazard_types_defined() -> None:
    assert HAZARD_TYPES == ("flood", "landslide")


def test_hazard_type_of_classification() -> None:
    # 浸水・洪水・内水 → flood
    assert _hazard_type_of("洪水浸水想定区域", "{}") == "flood"
    assert _hazard_type_of("内水浸水想定区域", "{}") == "flood"
    assert _hazard_type_of("浸水想定区域", "{}") == "flood"
    # 土砂・急傾斜・地すべり → landslide
    assert _hazard_type_of("土砂災害警戒区域", "{}") == "landslide"
    assert _hazard_type_of("急傾斜地崩壊危険区域", "{}") == "landslide"
    assert _hazard_type_of("地すべり防止区域", "{}") == "landslide"
    # 属性側の文字列からも判定する
    assert _hazard_type_of("（名称不明）", '{"scenario": "土砂災害（デモ）"}') == "landslide"
    # 不明
    assert _hazard_type_of("河川", "{}") == "unknown"
