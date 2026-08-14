import { useState } from 'react';
import { useApp } from '../store';
import { getPrio } from '../data/constants';
import type { SourceLedgerEntry } from '../types';

// SCR-006 データソース管理。接続状態・利用条件を管理し、接続テストを実行する（要件 FR-601〜604）。
// Issue #174（データ鮮度・ライセンス台帳）: 行クリックで元データ更新日・利用条件メモ・
// 再取込履歴を表示する。鮮度（取得日・更新日）と利用条件（ライセンス・出典義務）を一元管理する。
const COLS = '2fr 1.2fr 0.8fr 1fr 0.7fr 1.1fr 1fr 0.9fr';

export function SourcesScreen() {
  const { state, testSource } = useApp();
  const { sources, theme } = state;
  const PRIO = getPrio(theme);
  const [openKey, setOpenKey] = useState<SourceLedgerEntry['key'] | null>(null);

  const statColor = (stat: string) => (stat === 'success' ? 'var(--ok-text)' : stat === 'failed' ? 'var(--err-text)' : 'var(--text-3)');
  const statLabel = (stat: string) => (stat === 'success' ? '接続成功' : stat === 'failed' ? '接続失敗' : '未連携/無効');

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-006</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>データソース管理</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--text-2)' }}>
        API・公開GISデータの接続状態と利用条件を管理します。出典不明データはリスク判定に使用しません。
      </p>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="データソース一覧">
        <div className="ocsrc-grid-sources" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '11px 16px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.3px' }}>
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
          const sc = s._testing ? 'var(--warn-text)' : statColor(s.stat);
          const sl = s._testing ? 'テスト中…' : statLabel(s.stat);
          const rankColor = PRIO[s.rank]?.color ?? 'var(--text-2)';
          const open = openKey === s.key;
          return (
            <div key={s.key}>
              <div
                className="ocsrc-grid-sources"
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '12px 16px', borderBottom: '1px solid var(--border-2)', alignItems: 'center', fontSize: 12, opacity: s.enabled ? 1 : 0.55, cursor: 'pointer', background: open ? 'var(--surface-3)' : undefined }}
                onClick={() => setOpenKey(open ? null : s.key)}
                role="button"
                tabIndex={0}
                aria-expanded={open}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpenKey(open ? null : s.key);
                  }
                }}
                title="クリックで鮮度・ライセンス詳細を表示"
              >
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{s.name}</div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: 'var(--text-4)' }}>{s.key}</div>
                </div>
                <span style={{ color: 'var(--text-2)', fontSize: 11 }}>{s.provider}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{s.type}</span>
                <span style={{ fontSize: 10.5, color: 'var(--text-2)' }}>{s.license}</span>
                <span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, fontWeight: 700, color: rankColor }}>{s.rank}</span>
                </span>
                <span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: sc }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sc }} />
                    {sl}
                  </span>
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, color: 'var(--text-3)' }}>{s.last}</span>
                <span style={{ textAlign: 'right' }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      testSource(s.key);
                    }}
                    disabled={s._testing}
                    style={{ padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 10.5, fontWeight: 600, color: 'var(--accent)', cursor: s._testing ? 'default' : 'pointer' }}
                  >
                    {s._testing ? '…' : '接続テスト'}
                  </button>
                </span>
              </div>
              {open && (
                <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface-3)', fontSize: 11.5, color: 'var(--text-2)' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', maxWidth: 760 }}>
                    <span style={{ fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>元データ更新日</span>
                    <span>{s.sourceUpdatedAt || '—（未確認）'}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>利用条件</span>
                    <span>{s.usageNote || '—（未記載）'}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-3)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>再取込履歴</span>
                    <span>
                      {s.refreshHistory && s.refreshHistory.length > 0 ? (
                        s.refreshHistory.map((h, i) => (
                          <div key={i} style={{ lineHeight: 1.7 }}>
                            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: 'var(--text-3)' }}>{h.at}</span>
                            {' — '}{h.note}
                          </div>
                        ))
                      ) : (
                        '—（再取込なし・デモデータ）'
                      )}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--text-4)' }}>
                    鮮度・利用条件はデモ用の架空値です（Issue #174）。実データの再取込・ライセンス確認後に更新します。
                  </div>
                </div>
              )}
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
