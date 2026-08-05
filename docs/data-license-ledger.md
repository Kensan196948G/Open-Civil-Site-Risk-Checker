# データソース・ライセンス台帳（暫定・P0）

> 外部評価（2026-08-05）Phase 0 の暫定版。各提供元の公式利用条件は変更されるため、
> 実データの取込・再配布の前に必ず公式ページで最新版を確認すること。
> 本台帳は Git 管理し、更新日時と確認者を追記する。

最終更新: 2026-08-05（JST）

| ソース | 提供元 | 種別 | 利用条件（概要） | 公式 URL | 基準日・更新 | 実装状態 | 注意事項 |
|---|---|---|---|---|---|---|---|
| Nominatim | OpenStreetMap Foundation | ジオコーディング API | Usage Policy 準拠（1 req/s・識別可能 UA・大量利用は自前運用） | https://operations.osmfoundation.org/policies/nominatim/ | 随時 | 実連携（バックエンドプロキシ経由） | 組織利用は自前/契約サービスを検討 |
| Overpass API | OpenStreetMap コミュニティ | OSM 地物検索 API | 公開 Overpass に SLA なし。クエリ節度・利用ポリシー確認 | https://overpass-api.de/ | 随時 | 実連携（ブラウザ直結） | 地域差・誤記・更新者依存あり |
| Open-Meteo | Open-Meteo.com | 気象予報 API | CC BY 4.0（出典明示） | https://open-meteo.com/ | モデル更新あり | 実連携 | 公的発表ではない。施工判断には不適切な場面あり |
| 地理院標高 API / 地理院タイル | 国土地理院 | 標高・地図タイル | 国土地理院コンテンツ利用規約・測量法 | https://maps.gsi.go.jp/development/ichiran.html | 随時 | 実連携 | タイル利用規約の遵守、取得失敗時は Open-Meteo へ代替 |
| ハザードマップポータル（タイル） | 国土地理院 | 災害リスクタイル | レイヤごとにオープンデータ可否・出典が異なる | https://disaportal.gsi.go.jp/ | 年度版 | 目視レイヤのみ（実タイル取得ログなし） | 区域判定は未実装（PostGIS 判定は Issue #112） |
| 気象庁 警報・注意報 | 気象庁 | 防災情報 API | 気象庁コンテンツ利用案内（公共データ利用規約） | https://www.jma.go.jp/jma/kishou/info/coment.html | 発表時点 | 実連携 | 官署/区域の正確な地点対応が必要 |
| 国土数値情報（KSJ） | 国土交通省 | ベクタデータ（PostGIS 取込） | データセット別の利用条件（第三者頒布・編集条件を確認） | https://nlftp.mlit.go.jp/ksj/ | 年度・データ別 | 実連携（river 2,937 件のみ） | 全国カバレッジはデータ種別ごとに要確認 |
| PLATEAU | 国土交通省 | 3D 都市モデル API | CC BY 4.0 等（データ・年度別） | https://www.mlit.go.jp/plateau/ | データ別 | 未実装（実リクエストなし） | 疑似タイムアウトを記録しない方針へ変更済み |
| xROAD | 国土交通省 | 道路交通情報 API | 利用規約同意が必要 | https://www.mlit.go.jp/road/xroad/ | データ別 | 未連携（実リクエストなし） | 疑似 401 を記録しない方針へ変更済み |

## 現在の出典表記（画面・レポート）

- フッター: 国土地理院 / OpenStreetMap / Open-Meteo / ハザードマップポータル
- 各 Finding の Evidence: `attribution` に出典、`fetched_at` に取得日時、`source_updated_at` に元データ更新表記
- Markdown レポート §6: 参照データ・出典をソース台帳から列挙

## ライセンスに関する既知の論点

1. MIT LICENSE はコードのみを対象とし、取得データ・タイル・レポート出力物の再利用条件を包含しない。
2. ハザードマップポータルのタイルはレイヤごとにオープンデータ可否が異なる。画像の再配布・保存は個別確認が必要。
3. OSM データの帰属表示（© OpenStreetMap contributors）は Evidence に保持している。
4. 本台帳を「提供元の許諾」と誤認しないこと。正式連携・再配布の前に各公式規約を確認する。

## 未実施（Phase 1 以降）

- 原本ファイルの SHA-256・配布 URL・取得 HTTP ヘッダ・ライセンス版の保存
- データセット別の更新スケジュール・鮮度 KPI・更新失敗通知
- 都道府県別カバレッジ率・欠損率の品質ダッシュボード
