import { useEffect, useState } from 'react';
import { useApp } from '../store';
import { buildTimeBackendUrl } from '../api/ksj';
import { CATEGORY_OPTIONS, RADIUS_OPTIONS, radiusLabel } from '../data/constants';
import { ACTION_LABEL, ALL_ROLES, ROLE_DESC, ROLE_LABEL, buildMatrix, type CaseRole } from '../report/rbac';
import {
  PROVIDER_NAME,
  fetchAiServerStatus,
  testAiServerConnection,
  type AiServerStatus,
  type AiTestVerdict,
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

function VerdictBanner({ verdict }: { verdict: AiTestVerdict | BackendTestVerdict | null }) {
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
  const [aiStatus, setAiStatus] = useState<AiServerStatus | null>(null);
  const [testingAi, setTestingAi] = useState(false);
  const [aiVerdict, setAiVerdict] = useState<AiTestVerdict | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchAiServerStatus().then((s) => {
      if (alive) setAiStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  const onTestAi = () => {
    if (testingAi) return;
    setTestingAi(true);
    setAiVerdict(null);
    void testAiServerConnection().then((v) => {
      setAiVerdict(v);
      setTestingAi(false);
    });
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
    // 空欄 = 既定をテスト（ビルド時設定があればそれ、なければこのサイト経由 /api/readyz）。
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
          API キーは<strong>サーバー側（OCSRC_ANTHROPIC_API_KEY）のみ</strong>で管理し、ブラウザには保存・送信しません（外部評価 Phase 0 対応）。AI メモ生成は自社サーバーのブローカー（/api/v1/ai/memo）を経由します。
        </p>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>AI プロバイダ</label>
          <div style={{ ...inputStyle, fontFamily: "'IBM Plex Sans JP', sans-serif", background: 'var(--surface-3)', color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {PROVIDER_NAME}
            <span style={{ fontSize: 10, color: 'var(--text-4)' }}>（本アプリは Anthropic のみ対応）</span>
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle}>サーバー側設定状態</label>
          <div style={{ fontSize: 12.5, lineHeight: 1.7, color: 'var(--text-2)' }}>
            {aiStatus === null
              ? '確認中…'
              : aiStatus.configured
                ? `設定済み（モデル: ${aiStatus.model}）`
                : '未設定（サーバーの環境変数 OCSRC_ANTHROPIC_API_KEY を設定してください。ブラウザ側での入力欄はありません）'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={onTestAi} disabled={testingAi} style={btnStyle('ghost', testingAi)}>
            {testingAi ? 'テスト中…' : '接続テスト'}
          </button>
        </div>

        <VerdictBanner verdict={aiVerdict} />
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

      {/* ---- アクセス権限（RBAC・Issue #111） ---- */}
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>アクセス権限（RBAC）</h2>
        <p style={{ margin: '0 0 12px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          案件台帳（サーバー保存）のロールと権限マトリクスです（Issue #111・viewer / auditor / editor / approver / admin）。
          ロール割当はサーバー側の環境変数（<code style={{ fontSize: 10.5 }}>OCSRC_CASE_*_USERS</code>）で行います。本番では案件台帳が未設定（feature flag off）のため、この表示は参考情報です。
        </p>
        <div style={{ marginBottom: 12 }}>
          {ALL_ROLES.map((r: CaseRole) => (
            <div key={r} style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border-3)', fontSize: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>{ROLE_LABEL[r]}</span>
              <span style={{ color: 'var(--text-2)' }}>{ROLE_DESC[r]}</span>
            </div>
          ))}
        </div>
        <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="RBAC 権限マトリクス">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface-3)' }}>
                <th style={{ textAlign: 'left', padding: '7px 10px', border: '1px solid var(--border-2)' }}>操作</th>
                {ALL_ROLES.map((r: CaseRole) => (
                  <th key={r} style={{ textAlign: 'center', padding: '7px 6px', border: '1px solid var(--border-2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const m = buildMatrix();
                return (Object.keys(m) as Array<keyof typeof m>).map((action) => (
                  <tr key={action}>
                    <td style={{ padding: '6px 10px', border: '1px solid var(--border-3)', color: 'var(--text-2)' }}>{ACTION_LABEL[action]}</td>
                    {ALL_ROLES.map((r: CaseRole) => (
                      <td key={r} style={{ textAlign: 'center', padding: '6px', border: '1px solid var(--border-3)' }}>
                        {m[action][r] ? (
                          <span style={{ color: 'var(--ok-text)', fontWeight: 700 }}>✓</span>
                        ) : (
                          <span style={{ color: 'var(--text-4)' }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 10.5, lineHeight: 1.6, color: 'var(--text-4)' }}>
          承認ワークフローは draft → submitted → approved の逐次遷移のみ許可されます（approved 案件の更新は admin のみ）。
        </p>
      </section>

      {/* ---- ローカルデータ管理 ---- */}
      <section style={sectionStyle}>
        <h2 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>ローカルデータ管理</h2>
        <p style={{ margin: '0 0 14px', fontSize: 11.5, lineHeight: 1.7, color: 'var(--text-3)' }}>
          本アプリのデータ（調査案件・テーマ・バックエンド設定・既定値）はこのブラウザの localStorage に保存されています。AI API キーは保存しません（サーバー側管理・外部評価 Phase 0）。
        </p>

        {!confirmingReset ? (
          <button onClick={() => setConfirmingReset(true)} style={btnStyle('danger')}>
            ローカルデータを全て削除…
          </button>
        ) : (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--err-bg)', border: '1px solid var(--err-border)' }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.7, color: 'var(--text)' }}>
              <strong>本当にすべてのローカルデータを削除しますか？</strong> 調査案件（実データ）・バックエンド設定・既定値・旧 AI 設定キーがすべて削除され、元に戻せません。ダッシュボードの「↓ エクスポート」で事前にバックアップを取ることを推奨します。
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
            ['AI 連携', `${PROVIDER_NAME}（サーバー側ブローカー / キーはブラウザ非保持）`],
            ['バックエンド連携', `${backendEffectiveLabel}（KSJ 空間検索）`],
            ['テーマ', state.theme === 'dark' ? 'ダーク' : 'ライト'],
            ['ローカル保存データ', 'ocsrc-cases / ocsrc-theme / ocsrc-backend-url / ocsrc-default-analysis（旧 ocsrc-ai-settings は削除対象）'],
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
