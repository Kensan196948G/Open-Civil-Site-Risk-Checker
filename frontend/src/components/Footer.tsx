// 下部フッター。出典・免責・バージョンを常時表示する（要件 §13.2-6 / NFR-304）。
export function Footer() {
  return (
    <footer
      style={{
        flex: 'none',
        height: 26,
        background: 'var(--chrome)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 14,
        borderTop: '1px solid var(--chrome-border)',
      }}
    >
      <span style={{ fontSize: 10, color: 'var(--chrome-text-4)', fontFamily: "'JetBrains Mono', monospace" }}>OCSRC v1.0</span>
      <span style={{ fontSize: 10, color: 'var(--chrome-text-4)' }}>公開データに基づく初期調査支援 — 施工可否・安全性を断定しません</span>
      <div style={{ flex: 1 }} />
      <span className="ocsrc-footer-attr" style={{ fontSize: 10, color: 'var(--chrome-text-4)' }}>
        出典：国土地理院 / OpenStreetMap / Open-Meteo / ハザードマップポータル
      </span>
    </footer>
  );
}
