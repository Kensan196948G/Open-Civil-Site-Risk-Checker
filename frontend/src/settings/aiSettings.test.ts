import { describe, expect, it } from 'vitest';
import { emptyAiServerStatus, parseAiServerStatus } from './aiSettings';

// API キーはブラウザに保存しない（外部評価 Phase 0）。
// fetch 依存の fetchAiServerStatus はユニットテスト対象外（ksj.ts と同方針）。

describe('parseAiServerStatus', () => {
  it('正常な応答を復元する', () => {
    expect(parseAiServerStatus({ configured: true, model: 'claude-sonnet-5' })).toEqual({
      configured: true,
      model: 'claude-sonnet-5',
    });
  });

  it('壊れた値・未設定は既定へフォールバックする', () => {
    expect(parseAiServerStatus(null)).toEqual(emptyAiServerStatus());
    expect(parseAiServerStatus('not an object')).toEqual(emptyAiServerStatus());
    expect(parseAiServerStatus({ configured: 'yes' })).toEqual({ configured: false, model: '' });
  });

  it('キーを含む応答でもキーは型上・出力上に現れない', () => {
    const parsed = parseAiServerStatus({ configured: true, model: 'm', apiKey: 'sk-ant-secret' });
    expect(JSON.stringify(parsed)).not.toContain('sk-ant');
  });
});
