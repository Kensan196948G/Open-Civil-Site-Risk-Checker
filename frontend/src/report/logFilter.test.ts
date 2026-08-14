// 取得ログのフィルタ・検索（SCR-007）のテスト。
// ソース / 状態 / エンドポイント / キーワードの AND 絞り込みと非アクティブ判定を検証する。

import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../types';
import {
  EMPTY_LOG_FILTER,
  LOG_STATUS_OPTIONS,
  filterLogs,
  isLogFilterActive,
  type LogFilter,
} from './logFilter';

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

const LOGS: LogEntry[] = [
  log(),
  log({ source: 'open_meteo', endpoint: 'GET /v1/forecast', status: 'success' }),
  log({ source: 'hazard_portal', endpoint: 'GET /api/v1/hazard-assess', code: '503', status: 'failed', error: 'database unavailable' }),
  log({ source: 'plateau', endpoint: 'GET /api/v1/plateau', code: '—', status: 'not_attempted', error: '実リクエストなし' }),
];

describe('filterLogs', () => {
  it('空フィルタ（全件）はすべて返す', () => {
    expect(filterLogs(LOGS, EMPTY_LOG_FILTER)).toHaveLength(4);
  });

  it('ソースの部分一致（キー・表示名の両方）で絞り込む', () => {
    // キー部分一致
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, source: 'overpass' })).toHaveLength(1);
    // 表示名（SOURCE_SHORT）部分一致
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, source: 'Open-Meteo' })).toHaveLength(1);
    // 大文字小文字を無視
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, source: 'OVER' })).toHaveLength(1);
  });

  it('状態の正確一致で絞り込む', () => {
    const failed = filterLogs(LOGS, { ...EMPTY_LOG_FILTER, status: 'failed' });
    expect(failed).toHaveLength(1);
    expect(failed[0].source).toBe('hazard_portal');
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, status: 'not_attempted' })).toHaveLength(1);
  });

  it('エンドポイントの部分一致で絞り込む', () => {
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, endpoint: '/api/v1' })).toHaveLength(2);
  });

  it('キーワード（エラー・コード）で絞り込む', () => {
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, keyword: 'unavailable' })).toHaveLength(1);
    expect(filterLogs(LOGS, { ...EMPTY_LOG_FILTER, keyword: '503' })).toHaveLength(1);
  });

  it('複数条件は AND で適用される', () => {
    const f: LogFilter = { source: 'hazard', status: 'failed', endpoint: '/api/v1', keyword: 'unavailable' };
    expect(filterLogs(LOGS, f)).toHaveLength(1);
    // 条件を 1 つ外すと該当なし
    expect(filterLogs(LOGS, { ...f, keyword: 'zzz' })).toHaveLength(0);
  });

  it('0 件でも空配列を返す（クラッシュしない）', () => {
    expect(filterLogs([], { ...EMPTY_LOG_FILTER, source: 'x' })).toEqual([]);
  });
});

describe('isLogFilterActive / LOG_STATUS_OPTIONS', () => {
  it('空フィルタは非アクティブ・条件ありはアクティブ', () => {
    expect(isLogFilterActive(EMPTY_LOG_FILTER)).toBe(false);
    expect(isLogFilterActive({ ...EMPTY_LOG_FILTER, status: 'failed' })).toBe(true);
    expect(isLogFilterActive({ ...EMPTY_LOG_FILTER, source: ' ' })).toBe(false);
  });

  it('状態選択肢に取得ログの全状態を含む', () => {
    const values = LOG_STATUS_OPTIONS.map((o) => o.value);
    for (const s of ['success', 'timeout', 'failed', 'skipped', 'not_attempted', 'visual_only']) {
      expect(values).toContain(s);
    }
    expect(values[0]).toBe('all');
  });
});
