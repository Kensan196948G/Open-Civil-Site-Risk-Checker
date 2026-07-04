# KSJ データディレクトリ

| パス | 内容 | Git 管理 |
|---|---|---|
| `sample/` | テスト・開発用の**合成サンプル**（実 KSJ データではない） | ✅ 管理する |
| `raw/` | 国土数値情報からダウンロードした元データ（zip/GML/GeoJSON） | ❌ 管理しない（.gitignore） |
| `processed/` | 変換済み GeoJSON（取込に使う） | ❌ 管理しない（.gitignore） |

## 実データの取込手順（推奨: NII Geoshape 経由）

公式 KSJ ダウンロードサイトはブラウザの選択フォーム（JS 操作）を経由し、配布形式も Shapefile/GML のため変換が必要です。
**国立情報学研究所（NII）の Geoshape リポジトリ**が KSJ 河川データを GeoJSON（CC BY 4.0、加工済み・EPSG:4326）で再配布しており、単純な HTTP GET だけで取得できます（2026-07-04 動作確認済み: 荒川水系 830304、2937 features を取込・`/api/v1/nearby` で日本橋川・隅田川等を実取得）。

1. 水系一覧から対象水系のコードを確認: <https://geoshape.ex.nii.ac.jp/river/resource/>（例: 荒川水系 = `830304`、多摩川水系 = `830305`、利根川水系 = `830303`）
2. 該当水系の GeoJSON を取得:

```bash
curl -fsS "https://geoshape.ex.nii.ac.jp/river/resource/830304/stream.json" \
  -o data/raw/arakawa-stream.json
```

3. 取込（同一 dataset + source の再実行は洗い替えで冪等。属性キーは公式 KSJ と同じ `W05_004`=河川名）:

```bash
cd backend
OCSRC_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker \
  python -m app.ingest data/raw/arakawa-stream.json \
  --dataset river \
  --source "国土数値情報河川データセット（NII作成）「国土数値情報（河川データ）」（国土交通省）を加工、CC BY 4.0" \
  --source-updated "国土数値情報 W05（NII Geoshape 経由取得）" \
  --name-key W05_004
```

> **ライセンス**: NII Geoshape の河川データセットは CC BY 4.0（商用利用可、出典表示必須）。上記 `--source` の表記をそのまま使ってください。
> **座標系**: GeoJSON で配布済みのため WGS84（EPSG:4326）への変換は不要です。

## 代替: 公式 KSJ ダウンロードサイトから直接取得

生データ（Shapefile/GML）そのものが必要な場合、または河川以外のデータセット（公共施設 P02 等）は公式サイトから取得します。

1. [国土数値情報ダウンロードサイト](https://nlftp.mlit.go.jp/ksj/) から対象データを取得
   - 河川データ（W05）は都道府県・年度ごとの zip 直リンクが存在します（例: `https://nlftp.mlit.go.jp/ksj/gml/data/W05/W05-07/W05-07_03_GML.zip`）が、正しい年度コードの特定にはデータ一覧ページの確認が必要です
   - **利用規約を必ず確認**してください。データセット・年度ごとに商用/非商用が個別指定されます（例: W05 の平成18〜21年度版は非商用）。出典表記例: 「出典：国土数値情報（○○データ）（国土交通省）」
   - 属性の文字コードは未公表（Shift-JIS の可能性が高いが未確認）。変換時に文字化けする場合は `ogr2ogr` の `-lco ENCODING=SHIFT-JIS` 等を試してください
2. GML → GeoJSON へ変換（例: `ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson in.xml`）し `processed/` へ配置
3. 取込コマンドは上記と同様（`--name-key` は河川データなら `W05_004`、施設データはデータセットごとに異なるため実ファイルの属性を確認してください）

> 座標は WGS84（EPSG:4326）必須。範囲外の feature は取込時に reject され、理由が表示されます（NFR-501/505）。
