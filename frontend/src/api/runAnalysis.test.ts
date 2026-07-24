import { describe, expect, it, vi } from 'vitest';
import { runAnalysis, type AnalysisInputForm } from './runAnalysis';

// runAnalysis() は Nominatim 以外の 8 取得ステップを Promise.all で並列実行する
// （要件 §6.1 / NFR-002: 30 秒以内）。この並列化が実際に効いていることを、外部
// アダプタをモックした実測時間で検証する。hazard/plateau/xroad の 3 ステップは
// runAnalysis.ts 内部で setTimeout を直書きしており、モジュール外からは遅延を
// 差し替えられない（500ms/700ms/800ms 固定）。この内部固定分はテストでも
// 所与として受け入れ、外部アダプタのモック遅延をそれより短く設定することで
// 「並列実行なら内部固定の最大値(800ms)付近、直列なら合計 2700ms 超」という
// 有意な差でアサーションする。
const { DELAY_MS, delay, mockAdapterResult } = vi.hoisted(() => {
  const DELAY_MS = 150;
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const mockAdapterResult = (source: string) => ({
    findings: [],
    log: {
      time: '00:00:00',
      source,
      endpoint: 'mock',
      code: '200',
      status: 'success' as const,
      ms: String(DELAY_MS),
      error: '—',
    },
    stepStatus: 'success' as const,
  });
  return { DELAY_MS, delay, mockAdapterResult };
});

vi.mock('./overpass', () => ({
  fetchOverpass: vi.fn(async () => {
    await delay(DELAY_MS);
    return mockAdapterResult('osm_overpass');
  }),
}));
vi.mock('./openMeteo', () => ({
  fetchWeather: vi.fn(async () => {
    await delay(DELAY_MS);
    return mockAdapterResult('open_meteo');
  }),
}));
vi.mock('./elevation', () => ({
  fetchElevation: vi.fn(async () => {
    await delay(DELAY_MS);
    return mockAdapterResult('gsi_tile');
  }),
}));
vi.mock('./ksj', () => ({
  fetchKsj: vi.fn(async () => {
    await delay(DELAY_MS);
    return mockAdapterResult('ksj');
  }),
}));
vi.mock('./jmaWarning', () => ({
  fetchJmaWarning: vi.fn(async () => {
    await delay(DELAY_MS);
    return mockAdapterResult('jma_warning');
  }),
}));

describe('runAnalysis の並列実行性能特性（NFR-002: 30秒以内の設計的裏付け）', () => {
  it('8取得ステップを並列実行し、直列合計より大幅に短い時間で完了する', async () => {
    const form: AnalysisInputForm = {
      type: 'coord',
      address: '',
      lat: 35.6745,
      lon: 139.7524,
      radius: 500,
      categories: {
        roads: true,
        rivers: true,
        hazard: true,
        terrain: true,
        weather: true,
        facilities: true,
      },
    };
    const steps: Array<{ key: string; status: string }> = [];

    const start = performance.now();
    const outcome = await runAnalysis(form, { onStep: (key, status) => steps.push({ key, status }) });
    const elapsed = performance.now() - start;

    expect(outcome.error).toBeUndefined();
    expect(outcome.result).toBeDefined();
    // モックした 5 ステップ + 内部固定の hazard_portal が success で完了して
    // いること（並列化で速いだけでなく、中身も正しく揃っていることの確認）。
    expect(steps.filter((s) => s.status === 'success')).toHaveLength(6);

    // 直列実行なら 150ms×5（外部モック） + 500+700+800ms（内部固定） ≒ 2750ms。
    // Promise.all による並列実行なら内部固定の最大値（800ms）付近で完了する
    // はず。CI のジッターを見込み、直列合計の半分を大きく下回ることを確認する。
    expect(elapsed).toBeLessThan(1800);
  });

  it('座標入力ではジオコーディング（nominatim）をスキップし、直列部分を持たない', async () => {
    const form: AnalysisInputForm = {
      type: 'coord',
      address: '',
      lat: 35.6745,
      lon: 139.7524,
      radius: 500,
      categories: {
        roads: false,
        rivers: false,
        hazard: false,
        terrain: false,
        weather: false,
        facilities: false,
      },
    };
    const steps: Array<{ key: string; status: string }> = [];

    const outcome = await runAnalysis(form, { onStep: (key, status) => steps.push({ key, status }) });

    expect(outcome.result).toBeDefined();
    expect(steps.find((s) => s.key === 'nominatim')?.status).toBe('skipped');
  });
});
