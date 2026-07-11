import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 単一ページの地点リスク確認 SPA。外部公開 API（Nominatim / Open-Meteo / Overpass）は
// ブラウザから直接呼び出す。自前バックエンド（FastAPI + PostGIS）だけは、本番配信
// （server.mjs）と同じく same-origin の /api リバースプロキシ経由を既定とするため、
// dev / preview でも同仕様のプロキシを立てる（Issue #57）。中継先は server.mjs の
// OCSRC_BACKEND_ORIGIN 既定値と同じローカルバックエンド固定（別ホストへ直結したい
// 場合は SCR-008 のカスタム URL か VITE_OCSRC_BACKEND_URL を使う）。
const backendOrigin = 'http://127.0.0.1:8000';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      // 運用特例: /api/healthz はバックエンドの /healthz へ書き換える（server.mjs と同一仕様）。
      '/api/healthz': {
        target: backendOrigin,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/healthz/, '/healthz'),
      },
      '/api': {
        target: backendOrigin,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    // 本番ビルド（command==='build'）はソースマップを出さない（ソース情報の露出回避）。
    // 開発（serve）では有効にしてデバッグ性を確保する。
    sourcemap: command !== 'build',
  },
}));
