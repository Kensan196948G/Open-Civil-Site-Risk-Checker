import { useState } from 'react';
import { useApp } from '../store';
import { ksjBaseUrl } from '../api/ksj';
import {
  clearAiSettings,
  DEFAULT_MODELS,
  PROVIDER_LABEL,
  canSave,
  loadAiSettings,
  maskApiKey,
  saveAiSettings,
  testAiConnection,
  type AiProvider,
  type AiSettings,
  type TestVerdict,
} from '../settings/aiSettings';

// SCR-008 システム設定。AI調査メモで利用する AI 設定（プロバイダ / API キー）と
// アプリ情報を表示する。API キーはこのブラウザの localStorage のみに保存し、
// 送信先は接続テスト・生成時の AI 提供元のみ（自社サーバへは送信しない）。

const PROVIDERS: AiProvider[] = ['anthropic', 'openai', 'gemini'];

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12.5,
  color: 'var(--text)',
  fontFamily: "'JetBrains Mono', monospace",
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--text-3)',
  marginBottom: 5,
  letterSpacing: '.3px',
};

function btnStyle(kind: 'primary' | 'ghost' | 'danger', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '7px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: "'Noto Sans JP', sans-serif",
  };
  if (kind === 'primary') return { ...base, background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' };
  if (kind === 'danger') return { ...base, background: 'transparent', color: '#c0392b', border: '1px solid #c0392b55' };
  return { ...base, background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' };
}

export function SettingsScreen() {
  const { state } = useApp();
  const [saved, setSaved] = useState<AiSettings>(() => loadAiSettings());
  const [provider, setProvider] = useState<AiProvider>(saved.provider);
  const [apiKey, setApiKey] = useState<string>(saved.apiKey);
  const [model, setModel] = useState<string>(saved.model);
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verdict, setVerdict] = useState<TestVerdict | null>(null);
  const [notice, setNotice] = useState('');

  const savable = canSave(provider, apiKey);

  const onTest = () => {
    if (!savable || testing) return;
    setTesting(true);
    setVerdict(null);
    void testAiConnection(provider, apiKey.trim()).then((v) => {
      setVerdict(v);
      setTesting(false);
    });
  };

  const onSave = () => {
    if (!savable) return;
    const stamped = saveAiSettings({ provider, apiKey, model: model.trim() || DEFAULT_MODELS[provider] });
    if (stamped) {
      setSaved(stamped);
      setModel(stamped.model);
      setNotice(`保存しました（${stamped.savedAt}）`);
    } else {
      setNotice('保存できませんでした（この環境では localStorage が利用できません）。');
    }
  };

  const onClearInput = () => {
    setApiKey('');
    setModel('');
    setVerdict(null);
    setNotice('入力をクリアしました（保存済み設定は保持されています）。');
  };

  const onDeleteSaved = () => {
    clearAiSettings();
    setSaved({ provider: 'anthropic', apiKey: '', model: '', savedAt: '' });
    setApiKey('');
    setModel('');
    setVerdict(null);
    setNotice('保存済みの AI 設定を削除しました。');
  };

  const backend = ksjBaseUrl();

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-008</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>システム設定</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--text-2)' }}>
        AI調査メモで利用する AI 接続と、アプリの動作環境を管理します。
      </p>

      {/* ---- AI 設定 ---- */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', maxWidth: 720 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>AI 設定（AI調査メモ）</h2>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          API キーは<strong>このブラウザの localStorage のみ</strong>に保存され、送信先は接続テスト・メモ生成時の AI 提供元だけです（本アプリのサーバへは送信しません）。共有端末では保存後の取り扱いに注意してください。
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>AI プロバイダ</label>
            <select
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value as AiProvider);
                setVerdict(null);
              }}
              style={{ ...inputStyle, fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABEL[p]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>モデル（空欄で既定: {DEFAULT_MODELS[provider]}）</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODELS[provider]} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>API キー</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setVerdict(null);
              }}
              placeholder={provider === 'anthropic' ? 'sk-ant-…' : provider === 'openai' ? 'sk-…' : 'AIza…'}
              autoComplete="off"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={() => setShowKey((v) => !v)} style={btnStyle('ghost')} title={showKey ? '隠す' : '表示する'}>
              {showKey ? '隠す' : '表示'}
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onTest} disabled={!savable || testing} style={btnStyle('ghost', !savable || testing)}>
            {testing ? 'テスト中…' : '接続テスト'}
          </button>
          <button onClick={onClearInput} style={btnStyle('ghost')}>
            入力クリア
          </button>
          <button onClick={onSave} disabled={!savable} style={btnStyle('primary', !savable)}>
            設定を保存
          </button>
        </div>

        {verdict && (
          <div
            style={{
              marginTop: 12,
              padding: '9px 12px',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: 600,
              background: verdict.ok ? '#3fb27f18' : '#c0392b14',
              color: verdict.ok ? '#2e8f66' : '#c0392b',
              border: `1px solid ${verdict.ok ? '#3fb27f44' : '#c0392b44'}`,
            }}
          >
            {verdict.ok ? '✓ ' : '✗ '}
            {verdict.message}
          </div>
        )}
        {notice && (
          <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>{notice}</div>
        )}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
          {saved.savedAt ? (
            <>
              <span style={{ color: 'var(--text-2)' }}>
                保存済み: {PROVIDER_LABEL[saved.provider]} / <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{maskApiKey(saved.apiKey)}</span> / {saved.model}
                <span style={{ color: 'var(--text-4)' }}>（{saved.savedAt}）</span>
              </span>
              <button onClick={onDeleteSaved} style={btnStyle('danger')}>
                保存済み設定を削除
              </button>
            </>
          ) : (
            <span style={{ color: 'var(--text-4)' }}>保存済みの AI 設定はありません。</span>
          )}
        </div>
      </section>

      {/* ---- アプリ情報 ---- */}
      <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '18px 20px', maxWidth: 720, marginTop: 16 }}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>アプリ情報</h2>
        {(
          [
            ['アプリ', 'Open Civil Site Risk Checker（工事候補地リスクチェッカー）'],
            ['フェーズ', 'MVP（Phase 1）+ Phase 2（KSJ ローカルDB / 空間検索）'],
            ['バックエンド連携', backend ? `${backend}（KSJ 実連携）` : '未設定（KSJ は未連携表示）'],
            ['テーマ', state.theme === 'dark' ? 'ダーク' : 'ライト'],
            ['ローカル保存データ', 'ocsrc-cases（調査案件）/ ocsrc-theme（テーマ）/ ocsrc-ai-settings（AI設定）'],
          ] as const
        ).map(([k, v]) => (
          <div key={k} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border-2)', fontSize: 12 }}>
            <span style={{ color: 'var(--text-3)', fontWeight: 700 }}>{k}</span>
            <span style={{ color: 'var(--text-2)' }}>{v}</span>
          </div>
        ))}
        <p style={{ margin: '10px 0 0', fontSize: 10.5, lineHeight: 1.6, color: 'var(--text-4)' }}>
          本ツールは公開データに基づく初期調査支援であり、施工可否・安全性・法的適合性を断定しません。
        </p>
      </section>
    </div>
  );
}
