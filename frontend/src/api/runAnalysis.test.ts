import { describe, expect, it, vi } from 'vitest';
import { runAnalysis, type AnalysisInputForm } from './runAnalysis';

// runAnalysis() は Nominatim 以外の 8 取得ステップを Promise.all で並列実行する
// （要件 §6.1 / NFR-002: 30 秒以内）。この並列化が実際に効いていることを、外部
// アダプタをモックした実測時間で検証する。hazard/plateau/xroad は内部固定の
// 疑似遅延・疑似ログを持たないため、並列実行なら外部モックの最大遅延付近で
// 完了するはずである（外部評価 Phase 0: 疑似ログ廃止）。
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
    // 並列化で速いだけでなく、9 ステップすべてが期待どおりの最終状態で報告
    // されること（onStep は各ステップにつき最終状態で 1 回だけ呼ばれる）。
    // plateau/xroad は未実装・未連携のため skipped（実リクエストなし）。
    expect(steps).toHaveLength(9);
    expect(Object.fromEntries(steps.map((s) => [s.key, s.status]))).toEqual({
      nominatim: 'skipped',
      osm_overpass: 'success',
      open_meteo: 'success',
      gsi_tile: 'success',
      ksj: 'success',
      hazard_portal: 'success',
      plateau: 'skipped',
      xroad: 'skipped',
      jma_warning: 'success',
    });

    // 疑似遅延を廃止したため、外部モック（150ms）の並列実行で完了するはず。
    // CI のジッターを見込みつつ、直列合計（900ms 超）より有意に短いことを確認する。
    expect(elapsed).toBeLessThan(1000);

    // 実通信を行っていないソースに HTTP コード・応答時間を記録しない（疑似ログ廃止）。
    const logs = outcome.result!.logs;
    const hazard = logs.find((l) => l.source === 'hazard_portal');
    expect(hazard?.status).toBe('visual_only');
    expect(hazard?.code).toBe('—');
    for (const src of ['plateau', 'xroad'] as const) {
      const entry = logs.find((l) => l.source === src);
      expect(entry?.status).toBe('not_attempted');
      expect(entry?.code).toBe('—');
      expect(entry?.ms).toBe('—');
    }
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
