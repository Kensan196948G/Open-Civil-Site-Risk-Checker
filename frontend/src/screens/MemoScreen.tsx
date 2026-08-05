import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { memoSectionsFromText } from '../risk/memo';
import { generateAiMemo } from '../risk/aiMemo';
import { fetchAiServerStatus, type AiServerStatus } from '../settings/aiSettings';

// SCR-004 AI調査メモ。閲覧 / 編集を切り替え、テンプレート再生成と
// AI 生成（サーバー側ブローカー経由・ブラウザにキーを保持しない）ができる（要件 FR-401〜405）。
export function MemoScreen() {
  const { state, go, toggleMemoEdit, onMemoInput, regenMemo, memoTextOrDefault } = useApp();
  const { ranOnce, memoEditing } = state;

  const [generating, setGenerating] = useState(false);
  const [aiNotice, setAiNotice] = useState<{ ok: boolean; message: string } | null>(null);
  // null: まだ AI 生成を実行していない（"チェック済" と区別する）。[]: 実行済みで禁止表現ゼロ件。
  const [aiWarnings, setAiWarnings] = useState<string[] | null>(null);
  const [aiStatus, setAiStatus] = useState<AiServerStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchAiServerStatus().then((s) => {
      if (alive) setAiStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const aiConfigured = aiStatus?.configured === true;

  const onAiGenerate = () => {
    if (!aiConfigured || generating || !state.location) return;
    setGenerating(true);
    setAiNotice(null);
    void generateAiMemo(state.location, state.findings).then((res) => {
      if (res.ok && res.text) {
        onMemoInput(res.text);
        setAiWarnings(res.warnings);
      }
      setAiNotice({ ok: res.ok, message: res.message });
      setGenerating(false);
    });
  };

  const memoText = memoTextOrDefault();
  const sections = useMemo(() => memoSectionsFromText(memoText), [memoText]);

  if (!ranOnce) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: 'var(--surface-4)' }}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text-3)' }}>
          <div style={{ fontSize: 14 }}>地点確認の実行後に生成されます。</div>
          <button onClick={() => go('input')} style={primaryBtn}>地点入力へ →</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'var(--surface-4)' }}>
      <div style={{ maxWidth: 840, margin: '0 auto', padding: '26px 28px 70px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-004</div>
            <h1 style={{ margin: '2px 0 0', fontSize: 21, fontWeight: 700 }}>AI調査メモ</h1>
          </div>
          <div style={{ flex: 1 }} />
          {aiWarnings === null ? (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 13, background: 'var(--surface-3)', color: 'var(--text-3)' }}>未チェック（AI生成前）</span>
          ) : aiWarnings.length ? (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 13, background: 'var(--warn-bg)', color: 'var(--warn-text-2)' }}>
              ⚠ 断定表現の可能性 {aiWarnings.length} 件
            </span>
          ) : (
            <span style={{ fontSize: 10.5, fontWeight: 600, padding: '4px 10px', borderRadius: 13, background: 'var(--ok-bg)', color: 'var(--ok-text)' }}>✓ 断定表現チェック済</span>
          )}
          <button onClick={toggleMemoEdit} style={editBtn}>{memoEditing ? 'プレビュー' : '編集'}</button>
          <button onClick={regenMemo} style={editBtn}>
            テンプレート再生成
          </button>
          {aiConfigured ? (
            <button
              onClick={onAiGenerate}
              disabled={generating}
              style={{ padding: '8px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: generating ? 'default' : 'pointer', opacity: generating ? 0.6 : 1 }}
            >
              {generating ? 'AI 生成中…' : '🤖 AI生成（Claude）'}
            </button>
          ) : (
            <button onClick={() => go('settings')} style={editBtn} title="AI はサーバー側で設定します（ブラウザにキーを保存しません）">
              AI設定へ
            </button>
          )}
        </div>

        {aiNotice && (
          <div
            style={{
              marginBottom: 12,
              padding: '9px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: aiNotice.ok ? 'var(--ok-bg)' : 'var(--err-bg)',
              color: aiNotice.ok ? 'var(--ok-text)' : 'var(--err-text)',
              border: `1px solid ${aiNotice.ok ? 'var(--ok-border)' : 'var(--err-border)'}`,
            }}
          >
            {aiNotice.ok ? '✓ ' : '✗ '}
            {aiNotice.message}
          </div>
        )}
        {aiWarnings && aiWarnings.length > 0 && (
          <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 6, fontSize: 11.5, background: 'var(--warn-bg)', color: 'var(--warn-text-2)', border: '1px solid var(--warn-border)', lineHeight: 1.7 }}>
            ⚠ 生成文に断定の可能性がある表現が含まれます：{aiWarnings.map((w) => `「${w}」`).join('、')}。
            「編集」から表現を「要確認」「追加確認推奨」等へ修正してください（本ツールは断定表現を出力しない方針です）。
          </div>
        )}

        {memoEditing ? (
          <textarea
            value={memoText}
            onChange={(e) => onMemoInput(e.target.value)}
            style={{ width: '100%', height: 560, padding: 20, border: '1px solid var(--border)', borderRadius: 10, fontFamily: "'IBM Plex Mono', monospace", fontSize: 12.5, lineHeight: 1.7, resize: 'vertical', outline: 'none', background: 'var(--surface)', color: 'var(--text)' }}
          />
        ) : (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-3)', borderRadius: 12, padding: '34px 40px', boxShadow: '0 1px 4px rgba(20,40,70,.06)' }}>
            {sections.map((ms, i) => (
              <div key={i} style={{ marginBottom: 22 }}>
                <h3 style={{ margin: '0 0 9px', fontSize: 14.5, fontWeight: 700, color: 'var(--text)', paddingBottom: 7, borderBottom: '1px solid var(--border-2)' }}>{ms.heading}</h3>
                {ms.lines.map((ln, j) => (
                  <div key={j} style={{ fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-2)', paddingLeft: ln.bullet ? 6 : 0 }}>
                    {ln.text}
                  </div>
                ))}
              </div>
            ))}
            <div style={{ marginTop: 8, padding: '13px 15px', background: 'var(--surface-3)', borderRadius: 8, borderLeft: '3px solid var(--text-4)' }}>
              <p style={{ margin: 0, fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
                本メモは公開データに基づく初期調査支援であり、施工可否・法的適合性・安全性を断定するものではありません。各要確認事項には根拠データIDを紐付けています。
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = { padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
const editBtn: React.CSSProperties = { padding: '8px 14px', background: 'var(--surface)', color: 'var(--accent)', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer' };
