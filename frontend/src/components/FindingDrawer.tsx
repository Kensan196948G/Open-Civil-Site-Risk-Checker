import { useState } from 'react';
import { useApp } from '../store';
import { decorate } from '../decorate';

// SCR-003 リスク詳細ドロワー。根拠データ・出典・距離・注意事項を表示（要件 FR-303 / NFR-301）。
// 右からスライドインし、背景クリックで閉じる。
export function FindingDrawer() {
  const { state, closeFinding } = useApp();
  const [comment, setComment] = useState('');
  const raw = state.selectedFinding ? state.findings.find((f) => f.id === state.selectedFinding) : null;
  if (!raw) return null;
  const f = decorate(raw, state.theme);

  return (
    <>
      <div onClick={closeFinding} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,34,.32)', zIndex: 900, animation: 'ocsrc-fade .15s ease' }} />
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: 440,
          background: 'var(--surface)',
          zIndex: 901,
          boxShadow: '-6px 0 24px rgba(15,23,34,.18)',
          overflow: 'auto',
          animation: 'ocsrc-slide .22s cubic-bezier(.2,.7,.3,1)',
        }}
      >
        <div style={{ position: 'sticky', top: 0, background: 'var(--surface)', padding: '18px 22px 12px', borderBottom: '1px solid var(--border-2)', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: 'var(--text-3)', letterSpacing: '1px' }}>SCR-003 / {f.categoryLabel}</div>
            <div style={{ flex: 1 }} />
            <button onClick={closeFinding} style={{ width: 28, height: 28, border: 'none', background: 'var(--surface-4)', borderRadius: 7, fontSize: 16, color: 'var(--text-3)', cursor: 'pointer', lineHeight: 1 }}>
              ✕
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginTop: 10 }}>
            <div style={{ width: 42, height: 42, borderRadius: 9, background: f.bg, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", flex: 'none' }}>
              {f.priority}
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.4 }}>{f.title}</h2>
              <div style={{ fontSize: 11, color: f.color, fontWeight: 600 }}>{f.priorityName}</div>
            </div>
          </div>
        </div>

        <div style={{ padding: '18px 22px 40px' }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 12, background: f.statusBg, color: f.statusColor }}>{f.statusLabel}</span>
            {f.distanceLabel && <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 11px', borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)', fontFamily: "'JetBrains Mono', monospace" }}>地点から {f.distanceLabel}</span>}
          </div>

          <div style={miniLabel}>概要</div>
          <p style={{ margin: '0 0 18px', fontSize: 13, lineHeight: 1.8, color: 'var(--text-2)' }}>{f.summary}</p>

          <div style={miniLabel}>根拠データ</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 18 }}>
            {f.evidence.map((ev, i) => (
              <div key={i} style={{ border: '1px solid var(--border-2)', borderRadius: 9, padding: '13px 14px', background: 'var(--surface-2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-strong)' }}>{ev.layer_name}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--text-4)', background: 'var(--surface-4)', padding: '1px 6px', borderRadius: 4 }}>{ev.source_key}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '5px 12px', fontSize: 11 }}>
                  <span style={{ color: 'var(--text-3)' }}>出典</span>
                  <span style={{ color: 'var(--text-2)' }}>{ev.attribution}</span>
                  <span style={{ color: 'var(--text-3)' }}>取得日時</span>
                  <span style={{ color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5 }}>{ev.fetched_at}</span>
                  <span style={{ color: 'var(--text-3)' }}>データ更新日</span>
                  <span style={{ color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5 }}>{ev.source_updated_at}</span>
                  <span style={{ color: 'var(--text-3)' }}>属性</span>
                  <span style={{ color: 'var(--text-2)', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, lineHeight: 1.6 }}>{ev.propsLabel}</span>
                </div>
                {ev.quality_note && (
                  <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--warn-text)', background: 'var(--warn-bg)', padding: '6px 9px', borderRadius: 5 }}>品質メモ：{ev.quality_note}</div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 14px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 8, marginBottom: 18 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--warn-text)', marginBottom: 5 }}>⚠ 注意事項</div>
            <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: 'var(--warn-text-2)' }}>{f.caution}</p>
          </div>

          <div style={miniLabel}>ユーザーコメント</div>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="確認結果へのコメントを記入...（現時点では下書きのみ・保存は今後対応）"
            style={{ width: '100%', height: 80, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontFamily: "'Noto Sans JP', sans-serif", fontSize: 12, resize: 'vertical', outline: 'none', background: 'var(--surface-2)', color: 'var(--text)' }}
          />
          {/* コメント永続化は未実装。誤操作を避けるためボタンは無効化し、状態を明示する。 */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button disabled title="この機能は今後のフェーズで対応予定です" style={{ flex: 1, padding: 9, background: 'var(--surface-4)', color: 'var(--text-3)', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'not-allowed', opacity: 0.7 }}>確認済みとして登録</button>
            <button disabled title="この機能は今後のフェーズで対応予定です" style={{ padding: '9px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 12, fontWeight: 600, color: 'var(--text-3)', cursor: 'not-allowed', opacity: 0.7 }}>コメント保存</button>
          </div>
          <p style={{ margin: '8px 2px 0', fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.6 }}>※ コメントの保存・確認登録は今後のフェーズで対応予定です。</p>
        </div>
      </div>
    </>
  );
}

const miniLabel: React.CSSProperties = { fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', fontWeight: 700, marginBottom: 6 };
