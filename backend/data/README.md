# KSJ データディレクトリ

| パス | 内容 | Git 管理 |
|---|---|---|
| `sample/` | テスト・開発用の**合成サンプル**（実 KSJ データではない） | ✅ 管理する |
| `raw/` | 国土数値情報からダウンロードした元データ（zip/GML/GeoJSON） | ❌ 管理しない（.gitignore） |
| `processed/` | 変換済み GeoJSON（取込に使う） | ❌ 管理しない（.gitignore） |

## 実データの取込手順

1. [国土数値情報ダウンロードサイト](https://nlftp.mlit.go.jp/ksj/) から対象データを取得
   - 河川: W05（河川名は属性 `W05_004`）
   - 公共施設: P02 等
   - **各データの利用約款を必ず確認**し、出典表記を `--source` に正確に渡すこと
2. GML → GeoJSON へ変換（例: `ogr2ogr -f GeoJSON -t_srs EPSG:4326 out.geojson in.xml`）し `processed/` へ配置
3. 取込（同一 dataset + source の再実行は洗い替えで冪等）:

```bash
cd backend
OCSRC_DATABASE_URL=postgresql://app:***@127.0.0.1:5432/site_risk_checker \
  python -m app.ingest data/processed/w05-rivers.geojson \
  --dataset river --source "国土数値情報 河川データ（W05）" --source-updated "2021年度" --name-key W05_004
```

> 座標は WGS84（EPSG:4326）必須。範囲外の feature は取込時に reject され、理由が表示されます（NFR-501/505）。
