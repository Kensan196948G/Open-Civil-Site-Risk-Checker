import { useApp } from '../store';

// 上部ヘッダー。地点確認後は調査地点・取得日時を表示し、テーマ切替ボタンを備える。
export function Header() {
  const { state, toggleTheme } = useApp();
  const { ranOnce, location, fetchedAt, theme } = state;
  const dark = theme === 'dark';

  return (
    <header
      className="ocsrc-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 56,
        background: 'var(--chrome)',
        color: 'var(--chrome-text)',
        flex: 'none',
        borderBottom: '1px solid var(--chrome-border)',
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 30,
          height: 30,
          background: 'var(--accent)',
          borderRadius: 5,
          fontWeight: 700,
          fontSize: 15,
          letterSpacing: '-.5px',
          color: '#fff',
        }}
      >
        ○
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
        <span style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '.2px' }}>Open Civil Site Risk Checker</span>
        <span className="ocsrc-header-subtitle" style={{ fontSize: 11, color: 'var(--chrome-text-3)', fontWeight: 400 }}>工事候補地リスクチェッカー</span>
      </div>
      <div style={{ flex: 1 }} />
      {ranOnce && location && (
        <div
          className="ocsrc-header-site"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            background: 'var(--chrome-3)',
            border: '1px solid var(--chrome-border)',
            borderRadius: 6,
          }}
        >
          <span style={{ fontSize: 11, color: '#15a3b8', fontWeight: 700 }}>地点</span>
          <span style={{ fontSize: 12, color: 'var(--chrome-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {location.address}
          </span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--chrome-text-3)' }}>{location.coordLabel}</span>
        </div>
      )}
      <div className="ocsrc-header-time" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
        <span style={{ fontSize: 9.5, color: 'var(--chrome-text-4)', letterSpacing: '.3px' }}>取得日時</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--chrome-text-2)' }}>{fetchedAt}</span>
      </div>
      <button
        onClick={toggleTheme}
        title="テーマ切替"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 12px',
          background: 'var(--chrome-3)',
          border: '1px solid var(--chrome-border)',
          borderRadius: 7,
          color: 'var(--chrome-text-2)',
          cursor: 'pointer',
          fontFamily: "'Noto Sans JP', sans-serif",
          fontSize: 11.5,
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{dark ? '☾' : '☀'}</span>
        <span className="ocsrc-header-theme-label">{dark ? 'ダーク' : 'ライト'}</span>
      </button>
      <div
        className="ocsrc-header-editor"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '5px 10px',
          background: 'var(--chrome-3)',
          borderRadius: 20,
          border: '1px solid var(--chrome-border)',
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3fb27f' }} />
        <span style={{ fontSize: 11, color: 'var(--chrome-text)' }}>editor</span>
      </div>
    </header>
  );
}
