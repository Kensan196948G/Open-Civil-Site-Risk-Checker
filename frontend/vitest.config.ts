import { defineConfig } from 'vitest/config';

// 純粋ロジック（レポート生成・メモ生成・地理計算・定数ヘルパ）のユニットテスト設定。
// 対象は DOM 非依存のため node 環境で実行し、jsdom 等の追加依存を持たない。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/risk/**', 'src/report/**', 'src/api/geo.ts', 'src/data/constants.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
