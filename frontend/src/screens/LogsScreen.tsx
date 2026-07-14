import { useApp } from '../store';
import { FALLBACK_LOGS } from '../data/fixtures';
import type { LogEntry } from '../types';

// SCR-007 取得ログ。レート制限・認証エラー・タイムアウトを区別して記録（要件 FR-503 / FR-604）。
const COLS = '1.2fr 1.3fr 2.4fr 0.7fr 0.9fr 0.8fr 2fr';

const codeColor = (code: string) => (code === '200' ? '#3fb27f' : code === '—' ? '#6f7c8e' : '#d98324');
const statColor = (status: string) =>
  ({ success: '#3fb27f', timeout: '#d98324', failed: '#c0392b', skipped: '#9aa2ae' }[status] || '#8b97a8');

export function LogsScreen() {
  const { state } = useApp();
  const logs: LogEntry[] = state.logs.length ? state.logs : FALLBACK_LOGS;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#15616d', letterSpacing: '1px', fontWeight: 600 }}>SCR-007</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>取得ログ</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: '#5b6573' }}>
        API実行履歴です。レート制限・認証エラー・タイムアウトを区別して記録します。
        {!state.logs.length && '（まだ実行されていないため、参考のサンプルを表示しています。）'}
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: "'JetBrains Mono', monospace" }}>
        <div className="ocsrc-table-scroll">
        <div className="ocsrc-grid-logs" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '10px 16px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.3px' }}>
          <span>fetched_at</span>
          <span>source_key</span>
          <span>endpoint</span>
          <span>code</span>
          <span>status</span>
          <span>ms</span>
          <span>error</span>
        </div>
        {logs.map((l, i) => (
          <div key={i} className="ocsrc-grid-logs" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '9px 16px', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, alignItems: 'center' }}>
            <span style={{ color: 'var(--text-3)' }}>{l.time}</span>
            <span style={{ color: 'var(--text)' }}>{l.source}</span>
            <span style={{ color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.endpoint}</span>
            <span style={{ color: codeColor(l.code) }}>{l.code}</span>
            <span style={{ color: statColor(l.status), fontWeight: 600 }}>{l.status}</span>
            <span style={{ color: 'var(--text-3)' }}>{l.ms}</span>
            <span style={{ color: 'var(--err-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.error}</span>
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
