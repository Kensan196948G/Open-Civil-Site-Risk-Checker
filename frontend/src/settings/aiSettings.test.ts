import { describe, expect, it } from 'vitest';
import {
  buildTestRequest,
  canSave,
  interpretTestOutcome,
  maskApiKey,
  parseAiSettings,
} from './aiSettings';

describe('parseAiSettings', () => {
  it('正常な JSON を復元する（旧形式の provider:anthropic も可）', () => {
    const s = parseAiSettings(
      JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-test-1234', model: 'claude-sonnet-5', savedAt: '2026-07-04 12:00:00' }),
    );
    expect(s).not.toBeNull();
    expect(s!.model).toBe('claude-sonnet-5');
    // provider 無しの新形式も可
    expect(parseAiSettings(JSON.stringify({ apiKey: 'sk-ant-xxxxxx', model: '' }))).not.toBeNull();
  });

  it('壊れた値・他社プロバイダの旧設定・空キーは null（既定へフォールバック）', () => {
    expect(parseAiSettings(null)).toBeNull();
    expect(parseAiSettings('not json')).toBeNull();
    // Anthropic のみサポート: 旧 openai/gemini 設定は引き継がない
    expect(parseAiSettings(JSON.stringify({ provider: 'openai', apiKey: 'x'.repeat(20) }))).toBeNull();
    expect(parseAiSettings(JSON.stringify({ provider: 'gemini', apiKey: 'x'.repeat(20) }))).toBeNull();
    expect(parseAiSettings(JSON.stringify({ provider: 'anthropic', apiKey: '' }))).toBeNull();
  });
});

describe('maskApiKey', () => {
  it('先頭4+末尾4のみ表示し、生キーを含まない', () => {
    const key = 'sk-ant-api03-abcdefghijklmnop';
    const masked = maskApiKey(key);
    expect(masked).toBe('sk-a…mnop');
    expect(masked).not.toContain('abcdefgh');
  });

  it('短いキーは全マスク、空は空', () => {
    expect(maskApiKey('short')).toBe('＊＊＊＊＊');
    expect(maskApiKey('')).toBe('');
  });
});

describe('canSave', () => {
  it('8文字以上で保存可', () => {
    expect(canSave('sk-ant-12345')).toBe(true);
    expect(canSave('  short ')).toBe(false);
  });
});

describe('buildTestRequest', () => {
  it('Anthropic モデル一覧 GET + ブラウザ直接呼び出しヘッダ', () => {
    const req = buildTestRequest('KEY');
    expect(req.url).toBe('https://api.anthropic.com/v1/models');
    const h = req.init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('KEY');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
  });
});

describe('interpretTestOutcome', () => {
  it('成功時はモデル件数を報告する', () => {
    const v = interpretTestOutcome({ ok: true, status: 200, data: { data: [1, 2, 3] }, error: '—' });
    expect(v.ok).toBe(true);
    expect(v.message).toContain('3 件');
  });

  it('401/403 は認証失敗、429 はレート制限、0 はネットワークとして区別する', () => {
    expect(interpretTestOutcome({ ok: false, status: 401, data: null, error: 'HTTP 401' }).message).toContain('認証失敗');
    expect(interpretTestOutcome({ ok: false, status: 429, data: null, error: 'HTTP 429' }).message).toContain('レート制限');
    expect(interpretTestOutcome({ ok: false, status: 0, data: null, error: 'ネットワークエラー' }).message).toContain('接続できませんでした');
  });
});
