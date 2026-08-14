// 取得ログ CSV エクスポート（SCR-007・実行履歴の証跡）のテスト。
// ヘッダ・値の列挙・RFC 4180 エスケープ（" , 改行）を検証する。

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../types';
import { buildLogsCsv } from './logCsv';

function log(overrides: Partial<LogEntry> = {}): LogEntry {
  return {
    time: '10:00:00',
    source: 'osm_overpass',
    endpoint: 'POST /api/interpreter',
    code: '200',
    status: 'success',
    ms: '123',
    error: '—',
    ...overrides,
  };
}

describe('buildLogsCsv', () => {
  it('ヘッダと各ログの値を列挙する', () => {
    const csv = buildLogsCsv([log(), log({ source: 'open_meteo', status: 'failed', error: 'HTTP 503' })]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('time,source,endpoint,code,status,ms,error');
    expect(lines[1]).toContain('10:00:00,osm_overpass,POST /api/interpreter,200,success,123,—');
    expect(lines[2]).toContain('open_meteo');
    expect(lines[2]).toContain('HTTP 503');
  });

  it('値中のカンマ・引用符・改行を RFC 4180 でクォート/エスケープする', () => {
    const csv = buildLogsCsv([log({ error: 'timeout, retry\nfailed "quoted"' })]);
    expect(csv).toContain('"timeout, retry\nfailed ""quoted"""');
    // 生の改行がフィールド区切りとして現れない（クォート内に含まれる）
    expect(csv.split('\n').length).toBe(3); // ヘッダ + 1 行（値内改行はクォート内）
  });

  it('0 件でもヘッダのみを返す', () => {
    expect(buildLogsCsv([])).toBe('time,source,endpoint,code,status,ms,error');
  });
});
