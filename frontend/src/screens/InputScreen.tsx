import { useMemo, useState } from 'react';
import { useApp } from '../store';
import { CATEGORY_OPTIONS, RADIUS_OPTIONS, radiusLabel } from '../data/constants';
import { SURVEY_TEMPLATES, templateMatches } from '../data/templates';
import { loadRecentAddresses } from '../settings/recentAddresses';
import { cssToStyle } from '../cssToStyle';

// SCR-001 地点入力。住所 / 緯度経度・検索半径・確認カテゴリを入力する（要件 FR-001〜006）。
export function InputScreen() {
  const { state, setType, onAddress, onLat, onLon, setRadius, toggleCat, applyTemplate, runAnalysisAction, runSample } = useApp();
  const { form, formError } = state;

  // 最近使った住所（localStorage に保存・実行時に記録・画面マウント時に読み込み）。
  const [recentAddresses] = useState<string[]>(() => loadRecentAddresses());
  const recentToShow = useMemo(() => recentAddresses.slice(0, 5), [recentAddresses]);

  const tabBase = 'padding:9px 16px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid ';
  const tab = (active: boolean) =>
    cssToStyle(tabBase + (active ? 'var(--accent);background:var(--accent);color:#fff' : 'var(--border);background:var(--surface);color:var(--text-2)'));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '34px 28px 60px' }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>
          SCR-001
        </div>
        <h1 style={{ margin: '4px 0 6px', fontSize: 24, fontWeight: 700, letterSpacing: '.3px' }}>地点を入力して初期確認を開始</h1>
        <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.7 }}>
          住所または緯度経度を入力すると、周辺の道路・河川・災害・地形・気象・施設の公開データを横断取得し、確認優先度つきの一覧を生成します。
          <b style={{ color: 'var(--text)', fontWeight: 700 }}>「データなし」は「リスクなし」を意味しません。</b>
        </p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button onClick={() => setType('address')} aria-pressed={form.type === 'address'} style={tab(form.type === 'address')}>
            住所で入力
          </button>
          <button onClick={() => setType('coord')} aria-pressed={form.type === 'coord'} style={tab(form.type === 'coord')}>
            緯度経度で入力
          </button>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '22px 22px 24px', boxShadow: '0 1px 3px rgba(20,40,70,.05)' }}>
          {form.type === 'address' ? (
            <div style={{ marginBottom: 18 }}>
              <label style={labelStyle}>
                住所 <span style={{ color: 'var(--err-text)' }}>*</span>
              </label>
              <input
                value={form.address}
                onChange={(e) => onAddress(e.target.value)}
                placeholder="例：東京都千代田区霞が関2丁目1番3号"
                style={{ ...inputStyle, background: 'var(--surface-2)', color: 'var(--text)' }}
              />
              <p style={{ margin: '7px 0 0', fontSize: 11, color: 'var(--text-3)' }}>住所は候補のため、地図上で位置を確認してください（Nominatim）。</p>
              {recentToShow.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-3)', marginBottom: 5 }}>最近の住所（クリックで再入力）</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {recentToShow.map((addr) => (
                      <button
                        key={addr}
                        onClick={() => onAddress(addr)}
                        title={addr}
                        style={{
                          padding: '5px 11px',
                          borderRadius: 14,
                          fontSize: 10.5,
                          border: '1px solid var(--border-3)',
                          background: 'var(--surface-3)',
                          color: 'var(--text-2)',
                          cursor: 'pointer',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {addr}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 14, marginBottom: 18 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  緯度 <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(-90〜90)</span>
                </label>
                <input value={form.lat} onChange={(e) => onLat(e.target.value)} placeholder="35.6745" style={{ ...monoInputStyle, background: 'var(--surface-2)', color: 'var(--text)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>
                  経度 <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>(-180〜180)</span>
                </label>
                <input value={form.lon} onChange={(e) => onLon(e.target.value)} placeholder="139.7503" style={{ ...monoInputStyle, background: 'var(--surface-2)', color: 'var(--text)' }} />
              </div>
            </div>
          )}

          {/* 調査テンプレート（評価書 #21・工種別の初期値） */}
          <div style={{ marginBottom: 20 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>調査テンプレート（初期値の一括適用）</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {SURVEY_TEMPLATES.map((t) => {
                const active = templateMatches(form.radius, form.categories, t);
                return (
                  <button
                    key={t.id}
                    onClick={() => applyTemplate(t)}
                    aria-pressed={active}
                    title={t.description}
                    style={cssToStyle(
                      'padding:8px 14px;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid ' +
                        (active ? 'var(--accent);background:var(--accent);color:#fff' : 'var(--border);background:var(--surface);color:var(--text-2)'),
                    )}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <p style={{ margin: '7px 0 0', fontSize: 11, color: 'var(--text-3)' }}>
              テンプレートは検索半径・確認カテゴリの初期値をまとめて適用します（適用後も個別に調整できます）。
            </p>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>検索半径</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RADIUS_OPTIONS.map((r) => {
                const on = form.radius === r;
                return (
                  <button
                    key={r}
                    onClick={() => setRadius(r)}
                    aria-pressed={form.radius === r}
                    style={cssToStyle(
                      'padding:8px 16px;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:\'IBM Plex Mono\',monospace;border:1.5px solid ' +
                        (on ? 'var(--accent);background:var(--accent-soft);color:var(--accent)' : 'var(--border);background:var(--surface);color:var(--text-2)'),
                    )}
                  >
                    {radiusLabel(r)}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: 22 }}>
            <label style={{ ...labelStyle, marginBottom: 8 }}>
              確認カテゴリ <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>（1つ以上）</span>
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              {CATEGORY_OPTIONS.map(([k, label]) => {
                const on = form.categories[k];
                return (
                  <button
                    key={k}
                    onClick={() => toggleCat(k)}
                    aria-pressed={on}
                    style={cssToStyle(
                      'display:flex;align-items:center;gap:9px;padding:10px 12px;border-radius:8px;font-size:12.5px;font-weight:500;cursor:pointer;text-align:left;border:1.5px solid ' +
                        (on ? 'var(--accent-border);background:var(--accent-soft);color:var(--text)' : 'var(--border-3);background:var(--surface);color:var(--text-2)'),
                    )}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: 4,
                        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        background: on ? 'var(--accent)' : 'var(--surface)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#fff',
                        fontSize: 11,
                        flex: 'none',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {formError && (
            <div role="alert" style={{ marginBottom: 14, padding: '10px 12px', background: 'var(--err-bg)', border: '1px solid var(--err-border)', borderRadius: 7, fontSize: 12.5, color: 'var(--err-text)' }}>
              {formError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={runAnalysisAction}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 22px',
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 2px 6px rgba(21,97,109,.3)',
              }}
            >
              地点確認を開始 →
            </button>
            <button
              onClick={runSample}
              style={{
                padding: '12px 18px',
                background: 'var(--surface)',
                color: 'var(--accent)',
                border: '1.5px solid var(--accent)',
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              サンプル地点で試す（霞が関）
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-2)', marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 14,
  fontFamily: "'IBM Plex Sans JP', sans-serif",
  outline: 'none',
  background: 'var(--surface-2)',
  color: 'var(--text)',
};
const monoInputStyle: React.CSSProperties = { ...inputStyle, fontFamily: "'IBM Plex Mono', monospace" };
