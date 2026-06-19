import { useApp } from '../store';
import { getPrio } from '../data/constants';

// SCR-006 データソース管理。接続状態・利用条件を管理し、接続テストを実行する（要件 FR-601〜604）。
const COLS = '2fr 1.2fr 0.8fr 1fr 0.7fr 1.1fr 1fr 0.9fr';

export function SourcesScreen() {
  const { state, testSource } = useApp();
  const { sources, theme } = state;
  const PRIO = getPrio(theme);

  const statColor = (stat: string) => (stat === 'success' ? '#3fb27f' : stat === 'failed' ? '#c0392b' : '#9aa2ae');
  const statLabel = (stat: string) => (stat === 'success' ? '接続成功' : stat === 'failed' ? '接続失敗' : '未連携/無効');

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-006</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>データソース管理</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--text-2)' }}>
        API・公開GISデータの接続状態と利用条件を管理します。出典不明データはリスク判定に使用しません。
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '11px 16px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.3px' }}>
          <span>データソース</span>
          <span>提供元</span>
          <span>種別</span>
          <span>ライセンス</span>
          <span>信頼度</span>
          <span>接続状態</span>
          <span>最終取得</span>
          <span style={{ textAlign: 'right' }}>操作</span>
        </div>
        {sources.map((s) => {
          const sc = s._testing ? '#bf7d1c' : statColor(s.stat);
          const sl = s._testing ? 'テスト中…' : statLabel(s.stat);
          const rankColor = PRIO[s.rank]?.color ?? 'var(--text-2)';
          return (
            <div key={s.key} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '12px 16px', borderBottom: '1px solid var(--border-2)', alignItems: 'center', fontSize: 12, opacity: s.enabled ? 1 : 0.55 }}>
              <div>
                <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{s.name}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--text-4)' }}>{s.key}</div>
              </div>
              <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{s.provider}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{s.type}</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{s.license}</span>
              <span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: rankColor }}>{s.rank}</span>
              </span>
              <span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: sc }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc }} />
                  {sl}
                </span>
              </span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{s.last}</span>
              <span style={{ textAlign: 'right' }}>
                <button
                  onClick={() => testSource(s.key)}
                  disabled={s._testing}
                  style={{ padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--accent)', cursor: s._testing ? 'default' : 'pointer' }}
                >
                  {s._testing ? '…' : '接続テスト'}
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
