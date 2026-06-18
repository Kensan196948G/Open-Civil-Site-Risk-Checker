import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 単一ページの地点リスク確認 SPA。外部公開 API（Nominatim / Open-Meteo / Overpass）は
// ブラウザから直接呼び出すため、開発サーバ側のプロキシは不要。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
