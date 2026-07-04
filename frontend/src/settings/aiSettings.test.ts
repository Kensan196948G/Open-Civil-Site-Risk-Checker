import { describe, expect, it } from 'vitest';
import {
  buildTestRequest,
  canSave,
  interpretTestOutcome,
  maskApiKey,
  parseAiSettings,
} from './aiSettings';

describe('parseAiSettings', () => {
  it('正常な JSON を復元する', () => {
    const s = parseAiSettings(
      JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-test-1234', model: 'claude-sonnet-5', savedAt: '2026-07-04 12:00:00' }),
    );
    expect(s).not.toBeNull();
    expect(s!.provider).toBe('anthropic');
    expect(s!.model).toBe('claude-sonnet-5');
  });

  it('壊れた値・未知 provider・空キーは null（既定へフォールバック）', () => {
    expect(parseAiSettings(null)).toBeNull();
    expect(parseAiSettings('not json')).toBeNull();
    expect(parseAiSettings(JSON.stringify({ provider: 'unknown', apiKey: 'x'.repeat(20) }))).toBeNull();
    expect(parseAiSettings(JSON.stringify({ provider: 'openai', apiKey: '' }))).toBeNull();
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
  it('provider 選択済み + 8文字以上で保存可', () => {
    expect(canSave('anthropic', 'sk-ant-12345')).toBe(true);
    expect(canSave('anthropic', '  short ')).toBe(false);
    expect(canSave('', 'sk-ant-12345')).toBe(false);
  });
});

describe('buildTestRequest', () => {
  it('anthropic はブラウザ直接呼び出しヘッダを付ける', () => {
    const req = buildTestRequest('anthropic', 'KEY');
    expect(req.url).toBe('https://api.anthropic.com/v1/models');
    const h = req.init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('KEY');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
  });

  it('openai は Bearer、gemini はクエリキー（URL エンコード済み）', () => {
    const o = buildTestRequest('openai', 'KEY');
    expect((o.init.headers as Record<string, string>).Authorization).toBe('Bearer KEY');
    const g = buildTestRequest('gemini', 'K+E Y');
    expect(g.url).toContain('key=K%2BE%20Y');
  });
});

describe('interpretTestOutcome', () => {
  it('成功時はモデル件数を報告する（anthropic/openai=data, gemini=models）', () => {
    expect(interpretTestOutcome('anthropic', { ok: true, status: 200, data: { data: [1, 2, 3] }, error: '—' }).message).toContain('3 件');
    expect(interpretTestOutcome('gemini', { ok: true, status: 200, data: { models: [1] }, error: '—' }).ok).toBe(true);
  });

  it('401/403 は認証失敗として区別する', () => {
    const v = interpretTestOutcome('anthropic', { ok: false, status: 401, data: null, error: 'HTTP 401' });
    expect(v.ok).toBe(false);
    expect(v.message).toContain('認証失敗');
  });

  it('ネットワーク断（status 0）で OpenAI のときは CORS の可能性を案内する', () => {
    const v = interpretTestOutcome('openai', { ok: false, status: 0, data: null, error: 'ネットワークエラー' });
    expect(v.message).toContain('CORS');
    const v2 = interpretTestOutcome('anthropic', { ok: false, status: 0, data: null, error: 'ネットワークエラー' });
    expect(v2.message).not.toContain('CORS');
  });
});
