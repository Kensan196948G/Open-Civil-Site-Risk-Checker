import { useMemo } from 'react';
import { useApp } from '../store';
import { SiteMap } from '../map/SiteMap';
import { decorate } from '../decorate';
import { countsOf, memoPreview } from '../risk/memo';
import { SOURCE_SHORT, getPrio } from '../data/constants';
import { cssToStyle } from '../cssToStyle';
import type { BaseLayer, OverlayKey, Priority } from '../types';

const BASE_DEFS: [BaseLayer, string][] = [
  ['pale', '淡色'],
  ['std', '標準'],
  ['photo', '写真'],
];

const OV_DEFS: [OverlayKey, string, string, string, string][] = [
  ['range', '検索範囲', '#15616d', 'rgba(21,97,109,.15)', 'GSI'],
  ['roads', '道路', '#d98324', 'rgba(217,131,36,.25)', 'OSM'],
  ['water', '水路・河川', '#2f6fb0', 'rgba(47,111,176,.25)', 'OSM/KSJ'],
  ['flood', '洪水浸水想定', '#3a76c4', 'rgba(58,118,196,.25)', 'ハザード'],
  ['sediment', '土砂災害', '#b06a2a', 'rgba(176,106,42,.25)', 'ハザード'],
  ['hillshade', '陰影起伏', '#777', 'rgba(120,120,120,.25)', 'GSI'],
  ['facilities', '周辺施設', '#7b8494', 'rgba(123,132,148,.2)', 'OSM'],
];

const CHIP_DEFS: [string, string][] = [
  ['all', 'すべて'],
  ['hazard', '災害'],
  ['rivers', '河川・水域'],
  ['roads', '道路'],
  ['terrain', '地形'],
  ['weather', '気象'],
  ['facilities', '施設'],
  ['data_quality', 'データ品質'],
];

const GRADES: Priority[] = ['A', 'B', 'C', 'D'];

export function AnalysisScreen() {
  const { state, go, setBase, toggleOverlay, setCategoryFilter, openFinding, saveCurrentAsCase } = useApp();
  const { ranOnce, location, baseLayer, overlays, categoryFilter, findings, sources, theme, currentSaved } = state;

  const allDec = useMemo(() => findings.map((f) => decorate(f, theme)), [findings, theme]);
  const counts = useMemo(() => countsOf(findings), [findings]);
  const catCounts = useMemo(() => {
    const m: Record<string, number> = {};
    allDec.forEach((f) => (m[f.category] = (m[f.category] || 0) + 1));
    return m;
  }, [allDec]);

  if (!ranOnce || !location) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text-3)' }}>
        <div style={{ fontSize: 14 }}>まだ地点確認が実行されていません。</div>
        <button onClick={() => go('input')} style={primaryBtn}>地点入力へ →</button>
      </div>
    );
  }

  const PRIO = getPrio(theme);
  const shown = categoryFilter === 'all' ? allDec : allDec.filter((f) => f.category === categoryFilter);
  const hasMissing = findings.some((f) => f.category === 'data_quality' || f.status === 'failed' || f.status === 'no_data');
  const dataQualityNote = hasMissing
    ? '一部データソースで取得失敗・未連携があります（PLATEAU / xROAD 等）。優先度Dの項目は判断材料が不足しています。'
    : '主要データソースの取得に成功しました。各結果の取得日時・出典・更新日をご確認ください。';

  const summaryCards = GRADES.map((g) => ({
    grade: g,
    count: counts[g],
    label: PRIO[g].name,
    color: PRIO[g].color,
    bg: PRIO[g].bg,
    border: `${PRIO[g].color}44`,
  }));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
      <div>
        <div style={{ display: 'flex', height: 524, borderBottom: '1px solid var(--border)' }}>
          {/* 条件パネル */}
          <div style={{ width: 286, flex: 'none', background: 'var(--surface)', borderRight: '1px solid var(--border)', overflow: 'auto' }}>
            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-2)' }}>
              <div style={sectionLabel}>調査地点</div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, marginBottom: 6 }}>{location.address}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: 'var(--text-2)', marginBottom: 4 }}>{location.coordLabel}</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-2)' }}>
                <span>検索半径</span>
                <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{location.radiusLabel}</span>
              </div>
              <div style={{ marginTop: 8, padding: '7px 9px', background: 'var(--surface-3)', borderRadius: 6, fontSize: 10.5, color: 'var(--text-3)', lineHeight: 1.55 }}>
                住所候補のため、地図上で位置をご確認ください。
              </div>
            </div>

            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-2)' }}>
              <div style={{ ...sectionLabel, marginBottom: 9 }}>ベースマップ</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {BASE_DEFS.map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setBase(k)}
                    style={cssToStyle(
                      'flex:1;padding:7px;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;border:1.5px solid ' +
                        (baseLayer === k ? 'var(--accent);background:var(--accent-soft);color:var(--accent)' : 'var(--border-3);background:var(--surface);color:var(--text-2)'),
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-2)' }}>
              <div style={{ ...sectionLabel, marginBottom: 9 }}>表示レイヤ</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {OV_DEFS.map(([k, label, dot, fill, src]) => {
                  const on = overlays[k];
                  return (
                    <button
                      key={k}
                      onClick={() => toggleOverlay(k)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '6px 8px',
                        border: 'none',
                        background: on ? 'var(--accent-soft)' : 'transparent',
                        borderRadius: 6,
                        fontSize: 11.5,
                        fontWeight: 500,
                        color: on ? 'var(--text)' : 'var(--text-3)',
                        cursor: 'pointer',
                        width: '100%',
                      }}
                    >
                      <span style={{ width: 13, height: 13, borderRadius: 3, border: `1.5px solid ${on ? dot : 'var(--border)'}`, background: on ? fill : 'var(--surface)', flex: 'none' }} />
                      <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
                      <span style={{ fontSize: 9.5, color: 'var(--text-4)' }}>{src}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div style={{ padding: '14px 16px' }}>
              <div style={{ ...sectionLabel, marginBottom: 9 }}>データソース接続</div>
              {sources.map((s) => {
                const col = s.stat === 'success' ? '#3fb27f' : s.stat === 'failed' ? '#c0392b' : '#9aa2ae';
                const lab = s.stat === 'success' ? '接続' : s.stat === 'failed' ? '失敗' : '未連携';
                return (
                  <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flex: 'none' }} />
                    <span style={{ flex: 1, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{SOURCE_SHORT[s.key]}</span>
                    <span style={{ fontSize: 9.5, color: col, fontWeight: 600 }}>{lab}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 地図 */}
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <SiteMap />
            <div style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 500, display: 'flex', flexDirection: 'column', gap: 5, pointerEvents: 'none' }}>
              {[
                { color: '#c0392b', label: '調査地点' },
                { color: '#d98324', label: '主要道路' },
                { color: '#2f6fb0', label: '水路・河川' },
              ].map((lg) => (
                <div key={lg.label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--map-legend)', padding: '3px 8px', borderRadius: 4, fontSize: 10.5, boxShadow: '0 1px 3px rgba(0,0,0,.15)' }}>
                  <span style={{ width: 14, height: 3, background: lg.color, borderRadius: 2 }} />
                  <span style={{ color: 'var(--text-2)' }}>{lg.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* サマリー */}
          <div style={{ width: 296, flex: 'none', background: 'var(--surface)', borderLeft: '1px solid var(--border)', overflow: 'auto' }}>
            <div style={{ padding: '15px 16px 10px' }}>
              <div style={sectionLabel}>確認優先度サマリー</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 14px' }}>
              {summaryCards.map((sc) => (
                <div key={sc.grade} style={{ padding: '11px 12px', borderRadius: 9, background: sc.bg, border: `1px solid ${sc.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 26, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: sc.color, lineHeight: 1 }}>{sc.count}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: sc.color }}>{sc.grade}</span>
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 3 }}>{sc.label}</div>
                </div>
              ))}
            </div>
            <div style={{ margin: '0 16px 14px', padding: '11px 12px', background: 'var(--warn-bg)', border: '1px solid var(--warn-border)', borderRadius: 7 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--warn-text)', marginBottom: 4 }}>データ品質メモ</div>
              <p style={{ margin: 0, fontSize: 11, lineHeight: 1.6, color: 'var(--warn-text-2)' }}>{dataQualityNote}</p>
            </div>
            <div style={{ margin: '0 16px 14px' }}>
              <button
                onClick={saveCurrentAsCase}
                disabled={currentSaved}
                title="この確認結果を本番データ案件としてダッシュボードに保存"
                style={{
                  width: '100%',
                  padding: 10,
                  background: currentSaved ? 'var(--ok-bg)' : 'var(--accent)',
                  color: currentSaved ? 'var(--ok-text)' : '#fff',
                  border: 'none',
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: currentSaved ? 'default' : 'pointer',
                  marginBottom: 7,
                }}
              >
                {currentSaved ? '✓ ダッシュボードに保存済み' : '＋ ダッシュボードに保存（本番データ）'}
              </button>
              <button onClick={() => go('report')} style={{ width: '100%', padding: 10, background: 'var(--surface)', color: 'var(--accent)', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', marginBottom: 7 }}>
                レポートを出力
              </button>
              <button onClick={() => go('aimemo')} style={{ width: '100%', padding: 10, background: 'var(--surface)', color: 'var(--accent)', border: '1.5px solid var(--border)', borderRadius: 7, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                AI調査メモを見る
              </button>
            </div>
            <div style={{ margin: '0 16px 18px', padding: '10px 12px', background: 'var(--surface-3)', borderRadius: 7 }}>
              <p style={{ margin: 0, fontSize: 10, lineHeight: 1.6, color: 'var(--text-3)' }}>
                本サマリーは公開データに基づく初期確認です。優先度Dは「リスクが低い」ではなく「判断材料が不足」を意味します。
              </p>
            </div>
          </div>
        </div>

        {/* カテゴリ別リスク一覧 */}
        <div style={{ padding: '18px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>カテゴリ別確認結果</h2>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>
              {shown.length} / {allDec.length} 件
            </span>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 16 }}>
            {CHIP_DEFS.filter(([k]) => k === 'all' || catCounts[k]).map(([k, label]) => {
              const on = categoryFilter === k;
              const count = k === 'all' ? allDec.length : catCounts[k] || 0;
              return (
                <button
                  key={k}
                  onClick={() => setCategoryFilter(k)}
                  style={cssToStyle(
                    'padding:6px 13px;border-radius:18px;font-size:12px;font-weight:600;cursor:pointer;border:1.5px solid ' +
                      (on ? 'var(--accent);background:var(--accent);color:#fff' : 'var(--border);background:var(--surface);color:var(--text-2)'),
                  )}
                >
                  {label} <span style={{ opacity: 0.6, fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{count}</span>
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {shown.map((f) => (
              <div
                key={f.id}
                onClick={() => openFinding(f.id)}
                style={{
                  display: 'flex',
                  gap: 14,
                  padding: '14px 16px',
                  background: 'var(--surface)',
                  border: '1px solid var(--border-3)',
                  borderLeft: `4px solid ${f.color}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  boxShadow: '0 1px 2px var(--shadow)',
                }}
              >
                <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, width: 54 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: f.bg, color: f.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
                    {f.priority}
                  </div>
                  <span style={{ fontSize: 9, color: 'var(--text-4)', textAlign: 'center', lineHeight: 1.2 }}>{f.categoryLabel}</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>{f.title}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 11, background: f.statusBg, color: f.statusColor, flex: 'none' }}>{f.statusLabel}</span>
                    {f.distanceLabel && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>{f.distanceLabel}</span>}
                  </div>
                  <p style={{ margin: '0 0 7px', fontSize: 12, lineHeight: 1.6, color: 'var(--text-2)' }}>{f.summary}</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {f.evidence.map((ev, i) => (
                      <span key={i} style={{ fontSize: 9.5, color: 'var(--text-3)', background: 'var(--surface-4)', border: '1px solid var(--border-3)', padding: '2px 7px', borderRadius: 4, fontFamily: "'JetBrains Mono', monospace" }}>
                        {ev.source_name}
                      </span>
                    ))}
                  </div>
                </div>
                <div style={{ flex: 'none', display: 'flex', alignItems: 'center', color: 'var(--text-4)', fontSize: 18 }}>›</div>
              </div>
            ))}
          </div>
        </div>

        {/* AIメモプレビュー */}
        <div style={{ padding: '0 22px 28px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border-3)', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>AI調査メモ</h2>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 9px', borderRadius: 11, background: 'var(--ok-bg)', color: 'var(--ok-text)' }}>✓ 断定表現チェック済</span>
              <div style={{ flex: 1 }} />
              <button onClick={() => go('aimemo')} style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>
                全文を開く →
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.8, color: 'var(--text-2)' }}>{memoPreview(findings)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

const sectionLabel: React.CSSProperties = { fontSize: 10, letterSpacing: '1px', color: 'var(--text-3)', fontWeight: 700, marginBottom: 8 };
const primaryBtn: React.CSSProperties = { padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
