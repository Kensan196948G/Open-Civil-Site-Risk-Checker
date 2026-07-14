import { useState } from 'react';
import { useApp } from '../store';
import { buildTimeBackendUrl } from '../api/ksj';
import { CATEGORY_OPTIONS, RADIUS_OPTIONS, radiusLabel } from '../data/constants';
import {
  API_KEY_PREFIX,
  clearAiSettings,
  DEFAULT_MODEL,
  PROVIDER_NAME,
  canSave,
  loadAiSettings,
  maskApiKey,
  sanitizeApiKeyInput,
  saveAiSettings,
  testAiConnection,
  type AiSettings,
  type TestVerdict,
} from '../settings/aiSettings';
import {
  canSaveAnalysisDefaults,
  clearAnalysisDefaults,
  clearBackendUrlOverride,
  isValidBackendUrl,
  loadAnalysisDefaults,
  loadBackendUrlOverride,
  resetAllLocalData,
  saveAnalysisDefaults,
  saveBackendUrlOverride,
  testBackendConnection,
  type AnalysisDefaults,
  type BackendTestVerdict,
} from '../settings/appSettings';

// SCR-008 システム設定。AI調査メモで利用する AI 設定（Anthropic / Claude 専用）、
// バックエンド接続（KSJ 連携）、地点確認の既定値、ローカルデータ管理、アプリ情報を表示する。
// いずれも localStorage のみに保存し、送信先は接続テスト・生成時の対象サービスのみ。

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12.5,
  color: 'var(--text)',
  fontFamily: "'IBM Plex Mono', monospace",
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

const sectionStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: '18px 20px',
  maxWidth: 720,
  marginTop: 16,
};

function btnStyle(kind: 'primary' | 'ghost' | 'danger', disabled = false): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '7px 14px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    fontFamily: "'IBM Plex Sans JP', sans-serif",
  };
  if (kind === 'primary') return { ...base, background: 'var(--accent)', color: '#fff', border: '1px solid var(--accent)' };
  if (kind === 'danger') return { ...base, background: 'transparent', color: 'var(--err-text)', border: '1px solid var(--err-border)' };
  return { ...base, background: 'var(--surface)', color: 'var(--text-2)', border: '1px solid var(--border)' };
}

function VerdictBanner({ verdict }: { verdict: TestVerdict | BackendTestVerdict | null }) {
  if (!verdict) return null;
  return (
    <div
      style={{
        marginTop: 12,
        padding: '9px 12px',
        borderRadius: 6,
        fontSize: 12,
        fontWeight: 600,
        background: verdict.ok ? 'var(--ok-bg)' : 'var(--err-bg)',
        color: verdict.ok ? 'var(--ok-text)' : 'var(--err-text)',
        border: `1px solid ${verdict.ok ? 'var(--ok-border)' : 'var(--err-border)'}`,
      }}
    >
      {verdict.ok ? '✓ ' : '✗ '}
      {verdict.message}
    </div>
  );
}

export function SettingsScreen() {
  const { state } = useApp();

  // ---- AI 設定 ----
  const [savedAi, setSavedAi] = useState<AiSettings>(() => loadAiSettings());
  const [apiKey, setApiKey] = useState<string>(savedAi.apiKey);
  const [model, setModel] = useState<string>(savedAi.model);
  const [showKey, setShowKey] = useState(false);
  const [testingAi, setTestingAi] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<TestVerdict | null>(null);
  const [aiNotice, setAiNotice] = useState('');

  const aiSavable = canSave(apiKey);

  const onTestAi = () => {
    if (!aiSavable || testingAi) return;
    setTestingAi(true);
    setAiVerdict(null);
    void testAiConnection(apiKey.trim()).then((v) => {
      setAiVerdict(v);
      setTestingAi(false);
    });
  };

  const onSaveAi = () => {
    if (!aiSavable) return;
    const stamped = saveAiSettings({ apiKey, model: model.trim() || DEFAULT_MODEL });
    if (stamped) {
      setSavedAi(stamped);
      setModel(stamped.model);
      setAiNotice(`保存しました（${stamped.savedAt}）`);
    } else {
      setAiNotice('保存できませんでした（この環境では localStorage が利用できません）。');
    }
  };

  const onClearAiInput = () => {
    setApiKey('');
    setModel('');
    setAiVerdict(null);
    setAiNotice('入力をクリアしました（保存済み設定は保持されています）。');
  };

  const onDeleteSavedAi = () => {
    clearAiSettings();
    setSavedAi({ apiKey: '', model: '', savedAt: '' });
    setApiKey('');
    setModel('');
    setAiVerdict(null);
    setAiNotice('保存済みの AI 設定を削除しました。');
  };

  // ---- バックエンド接続（KSJ 連携） ----
  // 既定は same-origin（このサイト経由の /api プロキシ、Issue #57）。カスタム URL は直結したい場合のみ。
  const [backendUrl, setBackendUrl] = useState<string>(() => loadBackendUrlOverride());
  const [savedBackendUrl, setSavedBackendUrl] = useState<string>(() => loadBackendUrlOverride());
  const [testingBackend, setTestingBackend] = useState(false);
  const [backendVerdict, setBackendVerdict] = useState<BackendTestVerdict | null>(null);
  const [backendNotice, setBackendNotice] = useState('');

  const backendUrlValid = isValidBackendUrl(backendUrl);
  const backendInputEmpty = backendUrl.trim() === '';
  const buildTimeBase = buildTimeBackendUrl();
  // 保存済みの実効接続先ラベル（カスタム URL > ビルド時設定 > same-origin 既定）。
  const backendEffectiveLabel = savedBackendUrl
    ? `カスタム URL（${savedBackendUrl}）`
    : buildTimeBase
      ? `ビルド時設定（${buildTimeBase}）`
      : 'このサイト経由（/api プロキシ・既定）';

  const onTestBackend = () => {
    if ((!backendInputEmpty && !backendUrlValid) || testingBackend) return;
    setTestingBackend(true);
    setBackendVerdict(null);
    // 空欄 = 既定をテスト（ビルド時設定があればそれ、なければこのサイト経由 /api/healthz）。
    void testBackendConnection(backendInputEmpty ? buildTimeBase : backendUrl).then((v) => {
      setBackendVerdict(v);
      setTestingBackend(false);
    });
  };

  const onSaveBackend = () => {
    if (!backendUrlValid) return;
    if (saveBackendUrlOverride(backendUrl)) {
      setSavedBackendUrl(loadBackendUrlOverride());
      setBackendNotice('カスタム URL を保存しました。次回の地点確認から反映されます。');
    } else {
      setBackendNotice('保存できませんでした（この環境では localStorage が利用できません）。');
    }
  };

  const onClearBackend = () => {
    clearBackendUrlOverride();
    setBackendUrl('');
    setSavedBackendUrl('');
    setBackendVerdict(null);
    setBackendNotice(
      buildTimeBase
        ? `カスタム URL を解除しました（ビルド時設定 ${buildTimeBase} で接続します）。`
        : 'カスタム URL を解除しました（既定: このサイト経由で接続します）。',
    );
  };

  // ---- 地点確認の既定値 ----
  const [defaults, setDefaults] = useState<AnalysisDefaults>(() => loadAnalysisDefaults());
  const [defaultsNotice, setDefaultsNotice] = useState('');
  const defaultsSavable = canSaveAnalysisDefaults(defaults);

  const toggleDefaultCat = (k: keyof AnalysisDefaults['categories']) =>
    setDefaults((d) => ({ ...d, categories: { ...d.categories, [k]: !d.categories[k] } }));

  const onSaveDefaults = () => {
    if (!defaultsSavable) return;
    if (saveAnalysisDefaults(defaults)) {
      setDefaultsNotice('既定値を保存しました。次回の地点入力画面から反映されます。');
    } else {
      setDefaultsNotice('保存できませんでした（この環境では localStorage が利用できません）。');
    }
  };

  const onResetDefaults = () => {
    clearAnalysisDefaults();
    setDefaults(loadAnalysisDefaults());
    setDefaultsNotice('組み込みの既定値（500m・全カテゴリ）に戻しました。');
  };

  // ---- ローカルデータ管理 ----
  const [confirmingReset, setConfirmingReset] = useState(false);

  const onExecuteReset = () => {
    resetAllLocalData();
    window.location.reload();
  };

  const backendUrlKind = backendInputEmpty ? undefined : backendUrlValid ? 'ok' : 'invalid';

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-008</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>システム設定</h1>
      <p style={{ margin: '0 0 18px', fontSize: 12.5, color: 'var(--text-2)' }}>
        AI 接続・バックエンド連携・地点確認の既定値・ローカルデータを管理します。
      </p>

      {/* ---- AI 設定 ---- */}
      <section style={{ ...sectionStyle, marginTop: 0 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>AI 設定（AI調査メモ）</h2>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          API キーは<strong>このブラウザの localStorage のみ</strong>に保存され、送信先は接続テスト・メモ生成時の Anthropic API だけです（本アプリのサーバへは送信しません）。共有端末では保存後の取り扱いに注意してください。
        </p>

        <div className="ocsrc-grid-2col" style={{ display: 'grid', gap: 14, marginBottom: 14 }}>
          <div>
            <label style={labelStyle}>AI プロバイダ</label>
            <div style={{ ...inputStyle, fontFamily: "'IBM Plex Sans JP', sans-serif", background: 'var(--surface-3)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {PROVIDER_NAME}
              <span style={{ fontSize: 10, color: 'var(--text-4)' }}>（本アプリは Anthropic のみ対応）</span>
            </div>
          </div>
          <div>
            <label style={labelStyle}>モデル（空欄で既定: {DEFAULT_MODEL}）</label>
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_MODEL} style={inputStyle} />
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>API キー</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(sanitizeApiKeyInput(e.target.value));
                setAiVerdict(null);
              }}
              placeholder="sk-ant-…"
              autoComplete="off"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button onClick={() => setShowKey((v) => !v)} style={btnStyle('ghost')} title={showKey ? '隠す' : '表示する'}>
              {showKey ? '隠す' : '表示'}
            </button>
          </div>
          {apiKey.length > 0 && !apiKey.startsWith(API_KEY_PREFIX) && (
            <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginTop: 4 }}>
              Anthropic の API キーは通常 "{API_KEY_PREFIX}" から始まります。認証失敗（HTTP 401）が出る場合は、キーの種類や貼り付け内容をご確認ください。
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onTestAi} disabled={!aiSavable || testingAi} style={btnStyle('ghost', !aiSavable || testingAi)}>
            {testingAi ? 'テスト中…' : '接続テスト'}
          </button>
          <button onClick={onClearAiInput} style={btnStyle('ghost')}>
            入力クリア
          </button>
          <button onClick={onSaveAi} disabled={!aiSavable} style={btnStyle('primary', !aiSavable)}>
            設定を保存
          </button>
        </div>

        <VerdictBanner verdict={aiVerdict} />
        {aiNotice && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>{aiNotice}</div>}

        <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--border-2)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 11.5 }}>
          {savedAi.savedAt ? (
            <>
              <span style={{ color: 'var(--text-2)' }}>
                保存済み: {PROVIDER_NAME} / <span style={{ fontFamily: "'IBM Plex Mono', monospace" }}>{maskApiKey(savedAi.apiKey)}</span> / {savedAi.model}
                <span style={{ color: 'var(--text-4)' }}>（{savedAi.savedAt}）</span>
              </span>
              <button onClick={onDeleteSavedAi} style={btnStyle('danger')}>
                保存済み設定を削除
              </button>
            </>
          ) : (
            <span style={{ color: 'var(--text-4)' }}>保存済みの AI 設定はありません。</span>
          )}
        </div>
      </section>

      {/* ---- バックエンド接続（KSJ 連携） ---- */}
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>バックエンド接続（KSJ 連携）</h2>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          国土数値情報（河川・施設）の空間検索 API（FastAPI + PostGIS）の接続先です。既定は
          <strong>このサイト経由（同一オリジンの /api プロキシ・推奨）</strong>
          で、LAN 上の他の端末のブラウザからもそのまま動作します。カスタム URL は、同一マシンで動くバックエンドへ直接接続する場合（開発用途など）のみ設定してください。別ホストの URL を指定するには、本番配信側のセキュリティ設定（CSP の connect-src）とバックエンド側の CORS 許可の追加設定が必要です。
        </p>
        <div style={{ marginBottom: 12, fontSize: 11.5, color: 'var(--text-2)' }}>
          現在の接続先: <strong>{backendEffectiveLabel}</strong>
        </div>

        <label style={labelStyle}>カスタム URL（空欄 = 既定: このサイト経由）</label>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input
            value={backendUrl}
            onChange={(e) => {
              setBackendUrl(e.target.value);
              setBackendVerdict(null);
            }}
            placeholder="例: http://127.0.0.1:8000（空欄で既定のまま）"
            style={{
              ...inputStyle,
              flex: 1,
              borderColor: backendUrlKind === 'invalid' ? 'var(--err-text)' : 'var(--border)',
            }}
          />
        </div>
        {backendUrlKind === 'invalid' && (
          <div style={{ marginBottom: 10, fontSize: 11, color: 'var(--err-text)' }}>http:// または https:// で始まる URL を入力してください。</div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={onTestBackend}
            disabled={(!backendInputEmpty && !backendUrlValid) || testingBackend}
            style={btnStyle('ghost', (!backendInputEmpty && !backendUrlValid) || testingBackend)}
            title={backendInputEmpty ? '既定の接続先（このサイト経由）をテストします' : '入力したカスタム URL をテストします'}
          >
            {testingBackend ? 'テスト中…' : backendInputEmpty ? '接続テスト（既定）' : '接続テスト'}
          </button>
          <button onClick={onClearBackend} style={btnStyle('ghost')}>
            既定に戻す
          </button>
          <button onClick={onSaveBackend} disabled={!backendUrlValid} style={btnStyle('primary', !backendUrlValid)}>
            カスタム URL を保存
          </button>
        </div>

        <VerdictBanner verdict={backendVerdict} />
        {backendNotice && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>{backendNotice}</div>}
      </section>

      {/* ---- 地点確認の既定値 ---- */}
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>地点確認の既定値</h2>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          地点入力画面（SCR-001）を開いたときの検索半径・確認カテゴリの初期選択を変更します。個々の地点確認では、この画面とは別にその場で変更できます。
        </p>

        <label style={{ ...labelStyle, marginBottom: 8 }}>既定の検索半径</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {RADIUS_OPTIONS.map((r) => {
            const on = defaults.radius === r;
            return (
              <button
                key={r}
                onClick={() => setDefaults((d) => ({ ...d, radius: r }))}
                style={{
                  padding: '7px 14px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  fontFamily: "'IBM Plex Mono', monospace",
                  cursor: 'pointer',
                  border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                  background: on ? 'var(--accent-soft)' : 'var(--surface)',
                  color: on ? 'var(--accent)' : 'var(--text-2)',
                }}
              >
                {radiusLabel(r)}
              </button>
            );
          })}
        </div>

        <label style={{ ...labelStyle, marginBottom: 8 }}>既定の確認カテゴリ（1つ以上）</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
          {CATEGORY_OPTIONS.map(([k, label]) => {
            const on = defaults.categories[k];
            return (
              <button
                key={k}
                onClick={() => toggleDefaultCat(k)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  cursor: 'pointer',
                  textAlign: 'left',
                  border: `1.5px solid ${on ? 'var(--accent-border)' : 'var(--border-3)'}`,
                  background: on ? 'var(--accent-soft)' : 'var(--surface)',
                  color: 'var(--text)',
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent)' : 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, flex: 'none' }}>
                  {on ? '✓' : ''}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onResetDefaults} style={btnStyle('ghost')}>
            組み込みの既定値に戻す
          </button>
          <button onClick={onSaveDefaults} disabled={!defaultsSavable} style={btnStyle('primary', !defaultsSavable)}>
            既定値を保存
          </button>
        </div>
        {defaultsNotice && <div style={{ marginTop: 10, fontSize: 11.5, color: 'var(--text-3)' }}>{defaultsNotice}</div>}
      </section>

      {/* ---- ローカルデータ管理 ---- */}
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>ローカルデータ管理</h2>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          本アプリのデータ（調査案件・テーマ・AI設定・バックエンド設定・既定値）はすべてこのブラウザの localStorage に保存されています。サーバ側には保存されません。
        </p>

        {!confirmingReset ? (
          <button onClick={() => setConfirmingReset(true)} style={btnStyle('danger')}>
            ローカルデータを全て削除…
          </button>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--err-bg)', border: '1px solid var(--err-border)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.7, color: 'var(--text)' }}>
              <strong>本当にすべてのローカルデータを削除しますか？</strong> 調査案件（実データ）・AI設定・バックエンド設定・既定値がすべて削除され、元に戻せません。ダッシュボードの「↓ エクスポート」で事前にバックアップを取ることを推奨します。
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirmingReset(false)} style={btnStyle('ghost')}>
                キャンセル
              </button>
              <button onClick={onExecuteReset} style={{ ...btnStyle('danger'), background: 'var(--err-text)', color: '#fff' }}>
                完全に削除する
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ---- アプリ情報 ---- */}
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>アプリ情報</h2>
        {(
          [
            ['アプリ', 'Open Civil Site Risk Checker（工事候補地リスクチェッカー）'],
            ['フェーズ', 'MVP（Phase 1）+ Phase 2（KSJ ローカルDB / 空間検索）'],
            ['AI 連携', `${PROVIDER_NAME} のみ対応（AI調査メモ生成）`],
            ['バックエンド連携', `${backendEffectiveLabel}（KSJ 空間検索）`],
            ['テーマ', state.theme === 'dark' ? 'ダーク' : 'ライト'],
            ['ローカル保存データ', 'ocsrc-cases / ocsrc-theme / ocsrc-ai-settings / ocsrc-backend-url / ocsrc-default-analysis'],
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
