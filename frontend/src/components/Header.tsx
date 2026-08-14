import { useApp } from '../store';
import type { Screen } from '../types';

// 画面タイトル/サブタイトルのマッピング（Redesign版 screenMeta を移植）。
// アプリ名・ロゴは Sidebar 側に集約したため、ヘッダーは「今どの画面か」を示す役割に専念する。
const SCREEN_META: Record<Screen, [string, string]> = {
  dashboard: ['ダッシュボード', '調査案件の一覧と確認優先度の集計'],
  input: ['地点入力', '住所または緯度経度から初期確認を開始'],
  analysis: ['リスク判定', '地図と確認優先度サマリー'],
  aimemo: ['AI調査メモ', '断定表現を避けた初期調査メモ'],
  report: ['レポート出力', 'Markdown / CSV 出力'],
  sources: ['データソース管理', '接続状態・利用条件の台帳'],
  logs: ['取得ログ', 'API実行履歴'],
  audit: ['監査ログ', '案件台帳の操作履歴（actor・時刻・action）'],
  settings: ['システム設定', 'AI・バックエンド・既定値・ローカルデータ'],
};

// 上部ヘッダー。画面タイトルと、地点確認後の調査地点・取得日時を表示し、テーマ切替ボタンを備える。
export function Header() {
  const { state, toggleTheme } = useApp();
  const { screen, ranOnce, location, fetchedAt, theme } = state;
  const dark = theme === 'dark';
  const [title, sub] = SCREEN_META[screen];

  return (
    <header
      className="ocsrc-header"
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 62,
        background: 'var(--chrome)',
        color: 'var(--chrome-text)',
        flex: 'none',
        borderBottom: '1px solid var(--chrome-border)',
        padding: '0 22px',
        gap: 16,
        zIndex: 50,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          {title}
          <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 8, background: 'var(--warn-bg)', color: 'var(--warn-text-2)', border: '1px solid var(--warn-border)' }}>参考用途のみ</span>
        </span>
        <span className="ocsrc-header-subtitle" style={{ fontSize: 11, color: 'var(--chrome-text-3)', fontWeight: 400 }}>{sub}</span>
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
          <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>地点</span>
          <span style={{ fontSize: 12, color: 'var(--chrome-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {location.address}
          </span>
          <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: 'var(--chrome-text-3)' }}>{location.coordLabel}</span>
        </div>
      )}
      <div className="ocsrc-header-time" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.3 }}>
        <span style={{ fontSize: 9.5, color: 'var(--chrome-text-4)', letterSpacing: '.3px' }}>取得日時</span>
        <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--chrome-text-2)' }}>{fetchedAt}</span>
      </div>
      <button
        onClick={toggleTheme}
        title="テーマ切替"
        aria-label={`テーマを${dark ? 'ライト' : 'ダーク'}へ切替`}
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
          fontFamily: "'IBM Plex Sans JP', sans-serif",
          fontSize: 11.5,
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: 13, lineHeight: 1 }}>{dark ? '☾' : '☀'}</span>
        <span className="ocsrc-header-theme-label">{dark ? 'ダーク' : 'ライト'}</span>
      </button>
    </header>
  );
}
