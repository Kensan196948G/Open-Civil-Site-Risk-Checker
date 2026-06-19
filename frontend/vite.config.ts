import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 単一ページの地点リスク確認 SPA。外部公開 API（Nominatim / Open-Meteo / Overpass）は
// ブラウザから直接呼び出すため、開発サーバ側のプロキシは不要。
export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    // 本番ビルド（command==='build'）はソースマップを出さない（ソース情報の露出回避）。
    // 開発（serve）では有効にしてデバッグ性を確保する。
    sourcemap: command !== 'build',
  },
}));
