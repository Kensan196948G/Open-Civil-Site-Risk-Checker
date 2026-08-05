import { useApp } from '../store';
import { FALLBACK_LOGS } from '../data/fixtures';
import type { LogEntry } from '../types';

// SCR-007 取得ログ。レート制限・認証エラー・タイムアウトを区別して記録（要件 FR-503 / FR-604）。
const COLS = '1.2fr 1.3fr 2.4fr 0.7fr 0.9fr 0.8fr 2fr';

const codeColor = (code: string) => (code === '200' ? 'var(--ok-text)' : code === '—' ? 'var(--text-3)' : 'var(--warn-text)');
const statColor = (status: string) =>
  ({ success: 'var(--ok-text)', timeout: 'var(--warn-text)', failed: 'var(--err-text)', skipped: 'var(--text-3)', not_attempted: 'var(--text-3)', visual_only: 'var(--warn-text)' }[status] || 'var(--text-3)');

export function LogsScreen() {
  const { state } = useApp();
  const logs: LogEntry[] = state.logs.length ? state.logs : FALLBACK_LOGS;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-007</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>取得ログ</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--text-2)' }}>
        API実行履歴です。レート制限・認証エラー・タイムアウトを区別して記録します。実通信を行っていない項目は「not_attempted / visual_only」と明示します。
        {!state.logs.length && '（まだ実行されていないため、参考のサンプルを表示しています。）'}
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: "'IBM Plex Mono', monospace" }}>
        <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="取得ログ">
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
