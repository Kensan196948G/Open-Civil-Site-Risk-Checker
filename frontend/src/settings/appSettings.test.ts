import { describe, expect, it } from 'vitest';
import {
  ALL_LOCAL_STORAGE_KEYS,
  BACKEND_URL_KEY,
  FALLBACK_DEFAULTS,
  backendReadyUrl,
  canSaveAnalysisDefaults,
  interpretBackendTest,
  isValidBackendUrl,
  parseAnalysisDefaults,
} from './appSettings';

// このプロジェクトの vitest は environment: 'node'（jsdom 非依存）で実行するため、
// localStorage に直接触れる薄いラッパー（loadXxx/saveXxx/clearXxx/resetAllLocalData）は
// aiSettings.ts と同様にユニットテスト対象外とし、pure なパース・判定関数のみを検証する。

describe('isValidBackendUrl', () => {
  it('http/https は許可、それ以外・不正な文字列は拒否', () => {
    expect(isValidBackendUrl('http://127.0.0.1:8000')).toBe(true);
    expect(isValidBackendUrl('https://api.example.com')).toBe(true);
    expect(isValidBackendUrl('ftp://example.com')).toBe(false);
    expect(isValidBackendUrl('not a url')).toBe(false);
    expect(isValidBackendUrl('')).toBe(false);
  });
});

describe('backendReadyUrl（接続テストの分岐、Issue #57 / 外部評価 Phase 0）', () => {
  it('base 空（same-origin 既定）はプロキシ特例 /api/readyz を叩く', () => {
    expect(backendReadyUrl('')).toBe('/api/readyz');
    expect(backendReadyUrl('   ')).toBe('/api/readyz');
  });

  it('カスタム URL（直結）は従来どおり ${base}/readyz（末尾スラッシュ除去）', () => {
    expect(backendReadyUrl('http://127.0.0.1:8000')).toBe('http://127.0.0.1:8000/readyz');
    expect(backendReadyUrl('http://127.0.0.1:8000///')).toBe('http://127.0.0.1:8000/readyz');
  });

  it('配信オリジン自身を指定した場合もプロキシ特例へ寄せる（静的サーバの text /healthz 誤判定防止）', () => {
    expect(backendReadyUrl('http://192.168.0.5:8700', 'http://192.168.0.5:8700')).toBe('/api/readyz');
    expect(backendReadyUrl('http://192.168.0.5:8700/', 'http://192.168.0.5:8700')).toBe('/api/readyz');
  });

  it('配信オリジンと異なる直結 URL は ${base}/readyz のまま', () => {
    expect(backendReadyUrl('http://192.168.0.5:8000', 'http://192.168.0.5:8700')).toBe('http://192.168.0.5:8000/readyz');
  });

  it('URL として解釈できない base は例外にせず直結扱い', () => {
    expect(backendReadyUrl('not a url', 'http://x:8700')).toBe('not a url/readyz');
  });
});

describe('interpretBackendTest', () => {
  it('db=ok は成功、not_configured は接続成功だが警告つき', () => {
    expect(interpretBackendTest({ ok: true, data: { db: 'ok', version: '0.2.0' }, error: '—' }).ok).toBe(true);
    const nc = interpretBackendTest({ ok: true, data: { db: 'not_configured' }, error: '—' });
    expect(nc.ok).toBe(true);
    expect(nc.message).toContain('DB 未設定');
  });

  it('db=error/unavailable は失敗、応答なしも失敗', () => {
    expect(interpretBackendTest({ ok: true, data: { db: 'error' }, error: '—' }).ok).toBe(false);
    expect(interpretBackendTest({ ok: false, data: null, error: 'ネットワークエラー' }).ok).toBe(false);
  });
});

describe('parseAnalysisDefaults', () => {
  it('null・壊れた JSON はフォールバック既定値', () => {
    expect(parseAnalysisDefaults(null)).toEqual(FALLBACK_DEFAULTS);
    expect(parseAnalysisDefaults('not json')).toEqual(FALLBACK_DEFAULTS);
  });

  it('正常な値はそのまま復元する', () => {
    const d = { radius: 1000, categories: { ...FALLBACK_DEFAULTS.categories, weather: false } };
    expect(parseAnalysisDefaults(JSON.stringify(d))).toEqual(d);
  });

  it('半径が選択肢外、カテゴリが全て false の場合はフォールバックへ縮退する', () => {
    const loaded = parseAnalysisDefaults(
      JSON.stringify({ radius: 999, categories: { roads: false, rivers: false, hazard: false, terrain: false, weather: false, facilities: false } }),
    );
    expect(loaded.radius).toBe(FALLBACK_DEFAULTS.radius);
    expect(loaded.categories).toEqual(FALLBACK_DEFAULTS.categories);
  });
});

describe('canSaveAnalysisDefaults', () => {
  it('半径が選択肢内 + カテゴリ1つ以上で true', () => {
    expect(canSaveAnalysisDefaults({ radius: 500, categories: { ...FALLBACK_DEFAULTS.categories } })).toBe(true);
  });

  it('カテゴリ0件・半径が選択肢外は false', () => {
    expect(
      canSaveAnalysisDefaults({
        radius: 500,
        categories: { roads: false, rivers: false, hazard: false, terrain: false, weather: false, facilities: false },
      }),
    ).toBe(false);
    expect(canSaveAnalysisDefaults({ radius: 999, categories: FALLBACK_DEFAULTS.categories })).toBe(false);
  });
});

describe('ALL_LOCAL_STORAGE_KEYS', () => {
  it('バックエンド URL キーを含む（リセット漏れ防止の回帰確認）', () => {
    expect(ALL_LOCAL_STORAGE_KEYS).toContain(BACKEND_URL_KEY);
  });
});
