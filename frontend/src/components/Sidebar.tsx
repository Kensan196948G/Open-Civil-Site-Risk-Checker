import { useApp } from '../store';
import { DUMMY_CASES_VISIBLE } from '../data/cases';
import type { Screen } from '../types';

// 左ナビゲーション。ワークフロー（SCR-000〜007）とシステム（SCR-008）を切り替える。
type NavItem = { key: Screen; label: string; code: string };

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'ダッシュボード', code: 'SCR-000' },
  { key: 'input', label: '地点入力', code: 'SCR-001' },
  { key: 'analysis', label: 'リスク判定', code: 'SCR-002' },
  { key: 'aimemo', label: 'AI調査メモ', code: 'SCR-004' },
  { key: 'report', label: 'レポート出力', code: 'SCR-005' },
  { key: 'sources', label: 'データソース管理', code: 'SCR-006' },
  { key: 'logs', label: '取得ログ', code: 'SCR-007' },
];

const SYSTEM_NAV: NavItem[] = [{ key: 'settings', label: 'システム設定', code: 'SCR-008' }];

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
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          width: '100%',
          padding: '9px 16px',
          border: 'none',
          background: active ? 'var(--accent)' : 'transparent',
          color: active ? '#fff' : 'var(--chrome-text-2)',
          fontSize: 13,
          fontWeight: active ? 700 : 500,
          cursor: 'pointer',
          textAlign: 'left',
          fontFamily: "'Noto Sans JP', sans-serif",
          borderLeft: `3px solid ${active ? '#3fd0e0' : 'transparent'}`,
        }}
      >
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, opacity: 0.7, width: 46, textAlign: 'left', flex: 'none' }}>
          {n.code}
        </span>
        <span style={{ flex: 1, textAlign: 'left' }}>{n.label}</span>
        {badge && (
          <span
            style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 10,
              background: 'var(--accent)',
              color: '#cdeef2',
              padding: '1px 6px',
              borderRadius: 9,
              minWidth: 20,
              textAlign: 'center',
            }}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <nav
      aria-label="メインナビゲーション"
      style={{
        width: 222,
        flex: 'none',
        background: 'var(--chrome-2)',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid var(--chrome-border)',
      }}
    >
      <div style={{ padding: '14px 16px 8px', fontSize: 10, letterSpacing: '1.5px', color: 'var(--chrome-text-4)', fontWeight: 700 }}>
        ワークフロー
      </div>
      {NAV.map((n) => renderNavButton(n))}
      <div style={{ flex: 1 }} />
      <div style={{ padding: '10px 16px 6px', fontSize: 10, letterSpacing: '1.5px', color: 'var(--chrome-text-4)', fontWeight: 700 }}>
        システム
      </div>
      {SYSTEM_NAV.map((n) => renderNavButton(n))}
      <div style={{ margin: 14, padding: '11px 12px', background: 'var(--chrome-3)', border: '1px solid var(--chrome-border)', borderRadius: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ color: '#d98324', fontSize: 13 }}>⚠</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--chrome-text-2)' }}>判定は断定しません</span>
        </div>
        <p style={{ margin: 0, fontSize: 10.5, lineHeight: 1.6, color: 'var(--chrome-text-3)' }}>
          本ツールは公開データに基づく初期調査支援です。施工可否・安全性・法的適合性を断定するものではありません。
        </p>
      </div>
    </nav>
  );
}
