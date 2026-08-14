import { useApp } from '../store';
import { DUMMY_CASES_VISIBLE } from '../data/cases';
import type { Screen } from '../types';

// 左ナビゲーション。調査ワークフロー（SCR-000〜005）と管理（SCR-006〜008）を切り替える。
type NavItem = { key: Screen; label: string; code: string };

const WORKFLOW_NAV: NavItem[] = [
  { key: 'dashboard', label: 'ダッシュボード', code: 'SCR-000' },
  { key: 'input', label: '地点入力', code: 'SCR-001' },
  { key: 'analysis', label: 'リスク判定', code: 'SCR-002' },
  { key: 'aimemo', label: 'AI調査メモ', code: 'SCR-004' },
  { key: 'report', label: 'レポート出力', code: 'SCR-005' },
];

const ADMIN_NAV: NavItem[] = [
  { key: 'sources', label: 'データソース管理', code: 'SCR-006' },
  { key: 'logs', label: '取得ログ', code: 'SCR-007' },
  { key: 'audit', label: '監査ログ', code: 'SCR-009' },
  { key: 'settings', label: 'システム設定', code: 'SCR-008' },
];

export function Sidebar() {
  const { state, go } = useApp();
  const { screen, ranOnce, findings, sources } = state;

  const badgeFor = (key: Screen): string | null => {
    if (key === 'dashboard') return String(state.liveCases.length + DUMMY_CASES_VISIBLE.length);
    if (key === 'analysis' && ranOnce) return String(findings.length);
    if (key === 'sources') return String(sources.length);
    return null;
  };

  const renderNavButton = (n: NavItem) => {
    const active = screen === n.key;
    const badge = badgeFor(n.key);
    return (
      <button
        key={n.key}
        onClick={() => go(n.key)}
        aria-current={active ? 'page' : undefined}
        className="ocsrc-nav-btn"
        data-active={active ? 'true' : undefined}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: active ? '8px 11px 8px 8px' : '8px 11px',
          borderRadius: 7,
          background: active ? 'var(--accent-soft)' : 'transparent',
          color: active ? 'var(--text)' : 'var(--chrome-text-2)',
          fontSize: 13,
          fontWeight: active ? 600 : 500,
          cursor: 'pointer',
          textAlign: 'left',
          whiteSpace: 'nowrap',
          fontFamily: "'IBM Plex Sans JP', sans-serif",
        }}
      >
        <span className="ocsrc-nav-code" style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, opacity: 0.65, width: 44, textAlign: 'left', flex: 'none' }}>
          {n.code}
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>{n.label}</span>
        {badge && (
          <span
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 10.5,
              padding: '1px 6px',
              borderRadius: 9,
              fontWeight: active ? 700 : 400,
              background: active ? 'var(--accent)' : 'var(--surface-3)',
              color: active ? '#fff' : 'var(--chrome-text-3)',
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <aside
      className="ocsrc-sidebar"
      style={{
        flex: 'none',
        background: 'var(--chrome-2)',
        display: 'flex',
      }}
    >
      <div
        className="ocsrc-sidebar-brand"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 11,
          padding: '18px 18px 16px',
          borderBottom: '1px solid var(--chrome-border)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            flex: 'none',
            background: 'var(--accent)',
            borderRadius: 8,
            color: '#fff',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 21h18" />
            <path d="M5 21V7l8-4v18" />
            <path d="M19 21V11l-6-4" />
          </svg>
        </div>
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ color: 'var(--chrome-text)', fontWeight: 600, fontSize: 14.5, letterSpacing: '.2px' }}>
            Open Civil Site
            <br />
            Risk Checker
          </div>
          <div style={{ fontSize: 11, color: 'var(--chrome-text-3)' }}>工事候補地リスクチェッカー</div>
        </div>
      </div>

      <nav className="ocsrc-sidebar-nav" aria-label="メインナビゲーション">
        <div className="ocsrc-nav-heading" style={{ padding: '13px 8px 6px', fontSize: 10, letterSpacing: '1px', color: 'var(--chrome-text-4)', fontWeight: 700 }}>
          調査
        </div>
        {WORKFLOW_NAV.map((n) => renderNavButton(n))}
        <div className="ocsrc-nav-heading" style={{ padding: '13px 8px 6px', fontSize: 10, letterSpacing: '1px', color: 'var(--chrome-text-4)', fontWeight: 700 }}>
          管理
        </div>
        {ADMIN_NAV.map((n) => renderNavButton(n))}
      </nav>

      <div className="ocsrc-sidebar-note" style={{ margin: 14, padding: '11px 12px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ color: 'var(--warn-text)', fontSize: 13 }}>⚠</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--warn-text-2)' }}>判定は断定しません</span>
        </div>
        <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: 'var(--warn-text-2)' }}>
          本ツールは公開データに基づく初期調査支援です。施工可否・安全性・法的適合性を断定するものではありません。
        </p>
      </div>
    </aside>
  );
}
