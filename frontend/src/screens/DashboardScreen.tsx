import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { DUMMY_CASES_VISIBLE, THIS_WEEK_SINCE } from '../data/cases';
import { getCaseStatus, getPrio } from '../data/constants';
import { approveCase, isCaseStoreEnabled, listAudit, listCases, serverCaseToRecord, submitCase, type AuditEntry, type ServerCase } from '../api/cases';
import { CASE_STATUS_OPTIONS, EMPTY_CASE_FILTER, filterCases, isCaseFilterActive } from '../report/caseFilter';
import { buildCasesCsv } from '../report/caseCsv';
import type { CaseRecord, Priority } from '../types';

// SCR-000 ダッシュボード。実取得（本番）データ案件 + ダミー（サンプル）案件を表示する。
// 既定の起動画面。実データは localStorage に保存され、ダミーは「ダミーデータ」と明記する。
// サーバー案件台帳（Issue #111）が有効な場合は、承認ワークフローを備えた台帳セクションを表示する。
const GRADES: Priority[] = ['A', 'B', 'C', 'D'];
const AGG_NAMES: Record<Priority, string> = { A: '専門確認優先', B: '追加確認推奨', C: '参考情報あり', D: 'データ不足' };

const SERVER_STATUS_LABEL: Record<ServerCase['status'], string> = {
  draft: '下書き',
  submitted: '承認申請中',
  approved: '承認済み',
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  case_created: '案件作成',
  case_updated: '案件更新',
  case_submitted: '承認申請',
  case_approved: '承認',
  case_deleted: '案件削除',
};

export function DashboardScreen() {
  const { state, go, openCase, deleteCase, importCases, exportCases } = useApp();
  const PRIO = getPrio(state.theme);
  const CASE_STATUS = getCaseStatus(state.theme);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  // サーバー案件台帳（Issue #111）。API が有効な場合のみ読み込む。
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);
  const [serverCases, setServerCases] = useState<ServerCase[]>([]);
  const [serverMsg, setServerMsg] = useState<string | null>(null);
  // 監査履歴（Issue #111）。案件行の「履歴」で開く。
  const [auditFor, setAuditFor] = useState<{ id: number; code: string } | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[] | null>(null);
  const [auditMsg, setAuditMsg] = useState<string | null>(null);

  const reloadServerCases = useCallback(async () => {
    try {
      const items = await listCases();
      setServerCases(items);
      setServerMsg(null);
    } catch (err) {
      setServerMsg(err instanceof Error ? err.message : '案件台帳の取得に失敗しました');
    }
  }, []);

  const openAudit = useCallback(async (id: number, code: string) => {
    setAuditFor({ id, code });
    setAuditEntries(null);
    setAuditMsg(null);
    try {
      const items = await listAudit('case', String(id));
      setAuditEntries(items);
    } catch (err) {
      setAuditMsg(err instanceof Error ? err.message : '監査履歴の取得に失敗しました');
      setAuditEntries([]);
    }
  }, []);

  // 案件台帳 API の有効性を起動時に検出（無効・未到達ならセクション非表示）。
  useEffect(() => {
    let cancelled = false;
    void isCaseStoreEnabled().then((ok) => {
      if (cancelled) return;
      setServerEnabled(ok);
      if (ok) void reloadServerCases();
    });
    return () => {
      cancelled = true;
    };
  }, [reloadServerCases]);

  const onServerSubmit = useCallback(
    async (id: number) => {
      try {
        await submitCase(id);
        await reloadServerCases();
      } catch (err) {
        setServerMsg(err instanceof Error ? err.message : '承認申請に失敗しました');
      }
    },
    [reloadServerCases],
  );

  const onServerApprove = useCallback(
    async (id: number) => {
      try {
        await approveCase(id);
        await reloadServerCases();
      } catch (err) {
        setServerMsg(err instanceof Error ? err.message : '承認に失敗しました');
      }
    },
    [reloadServerCases],
  );

  // 実データ（新しい順）を先頭に、続いてダミー（表示設定時のみ）を並べる。
  const cases: CaseRecord[] = useMemo(() => [...state.liveCases, ...DUMMY_CASES_VISIBLE], [state.liveCases]);
  const liveCount = state.liveCases.length;
  const dummyCount = DUMMY_CASES_VISIBLE.length;

  // 案件一覧の検索・絞り込み（キーワード + 状態。KPI は全件ベースのまま）。
  const [caseFilter, setCaseFilter] = useState(EMPTY_CASE_FILTER);
  const visibleCases = useMemo(() => filterCases(cases, caseFilter), [cases, caseFilter]);

  // 絞り込み後の案件一覧を CSV でダウンロード（UTF-8 BOM 付き・Excel の文字化け防止）。
  const onExportCasesCsv = () => {
    const blob = new Blob(['\uFEFF' + buildCasesCsv(visibleCases)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocsrc-cases_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
  };

  const { agg, aggTotal, kpiCards } = useMemo(() => {
    const a: Record<Priority, number> = { A: 0, B: 0, C: 0, D: 0 };
    cases.forEach((c) => GRADES.forEach((g) => (a[g] += c.counts[g])));
    const total = a.A + a.B + a.C + a.D;
    const aCount = cases.reduce((s, c) => s + c.counts.A, 0);
    const needAction = cases.filter((c) => c.counts.A > 0).length;
    const thisWeek = cases.filter((c) => c.date >= THIS_WEEK_SINCE).length;
    const cards = [
      { label: '総案件数', value: String(cases.length), unit: '件', sub: dummyCount ? `実データ ${liveCount} / ダミー ${dummyCount}` : `実データ ${liveCount}`, color: 'var(--accent)' },
      { label: '専門確認優先（A）合計', value: String(aCount), unit: '件', sub: '全案件のA項目の合計', color: PRIO.A.color },
      { label: '要対応案件', value: String(needAction), unit: '件', sub: 'A項目を含む案件', color: PRIO.B.color },
      { label: '今週実行', value: String(thisWeek), unit: '件', sub: `${THIS_WEEK_SINCE} 以降に実行`, color: PRIO.C.color },
    ];
    return { agg: a, aggTotal: total, kpiCards: cards };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cases, liveCount, state.theme]);

  const onPickFile = () => fileRef.current?.click();
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 同じファイルを再選択できるようリセット
    if (!file) return;
    try {
      const text = await file.text();
      const { imported } = importCases(text);
      setMsg({ kind: 'ok', text: `${imported} 件の本番データを取り込みました。` });
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : '取り込みに失敗しました。' });
    }
  };

  const onExport = () => {
    if (!liveCount) {
      setMsg({ kind: 'err', text: 'エクスポートできる実データがありません（ダミーは対象外）。' });
      return;
    }
    const blob = new Blob([exportCases()], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocsrc-cases_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
    setMsg({ kind: 'ok', text: `${liveCount} 件の本番データをエクスポートしました。` });
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', background: 'var(--bg)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 30px 56px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-000</div>
            <h1 style={{ margin: '3px 0 4px', fontSize: 23, fontWeight: 700 }}>ダッシュボード</h1>
            <p style={{ margin: 0, fontSize: 12.5, color: 'var(--text-2)' }}>調査案件の一覧と確認優先度の集計。各案件は公開データに基づく初期確認結果です。</p>
          </div>
          <div style={{ flex: 1 }} />
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
          <button onClick={onPickFile} style={ghostBtn} title="JSON から本番データを一括取込">↑ 本番データ取込</button>
          <button onClick={onExport} style={ghostBtn} title="保存済みの本番データを JSON 出力">↓ エクスポート</button>
          <button
            onClick={() => go('input')}
            style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px var(--shadow)' }}
          >
            ＋ 新規調査
          </button>
        </div>

        {msg && (
          <div
            style={{
              marginBottom: 14,
              padding: '9px 13px',
              borderRadius: 8,
              fontSize: 12,
              background: msg.kind === 'ok' ? 'var(--ok-bg)' : 'var(--err-bg)',
              color: msg.kind === 'ok' ? 'var(--ok-text)' : 'var(--err-text)',
              border: `1px solid ${msg.kind === 'ok' ? 'var(--ok-border)' : 'var(--err-border)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ flex: 1 }}>{msg.text}</span>
            <button onClick={() => setMsg(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14 }}>✕</button>
          </div>
        )}

        {/* KPI カード */}
        <div className="ocsrc-grid-kpi" style={{ display: 'grid', gap: 13, marginBottom: 16 }}>
          {kpiCards.map((k) => (
            <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 17px', boxShadow: '0 1px 3px var(--shadow)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500, marginBottom: 9 }}>{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 30, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace", color: k.color, lineHeight: 1 }}>{k.value}</span>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{k.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-2)', marginTop: 7 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* 優先度分布 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '18px 20px', marginBottom: 16, boxShadow: '0 1px 3px var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>全案件の確認優先度分布</h2>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>合計 {aggTotal} 件の確認項目</span>
          </div>
          <div style={{ display: 'flex', height: 30, borderRadius: 7, overflow: 'hidden', marginBottom: 14, background: 'var(--surface-4)' }}>
            {GRADES.map((g) => {
              const pct = aggTotal ? (agg[g] / aggTotal) * 100 : 0;
              if (pct === 0) return null;
              return (
                <div key={g} style={{ width: `${pct}%`, background: PRIO[g].color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', minWidth: 0 }}>
                  {`${g} ${agg[g]}`}
                </div>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap' }}>
            {GRADES.map((g) => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 11, height: 11, borderRadius: 3, background: PRIO[g].color }} />
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
                  <b style={{ color: 'var(--text)', fontWeight: 700 }}>{g}</b> {AGG_NAMES[g]}
                </span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 12, fontWeight: 700, color: PRIO[g].color }}>{agg[g]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* サーバー案件台帳（Issue #111）: API 有効時のみ表示 */}
        {serverEnabled && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--accent-border)', borderRadius: 11, overflow: 'hidden', marginBottom: 16, boxShadow: '0 1px 3px var(--shadow)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--border-2)', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>案件台帳（サーバー保存）</h2>
              <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>
                {serverCases.length} 件
              </span>
              <span style={{ flex: 1 }} />
              {/* 状態サマリー: 承認待ち（submitted）を強調表示（Issue #111 承認WF） */}
              {serverCases.length > 0 && (
                <span style={{ display: 'inline-flex', gap: 6, fontSize: 10.5, fontWeight: 700 }}>
                  <span style={{ color: 'var(--text-3)' }}>draft {serverCases.filter((c) => c.status === 'draft').length}</span>
                  <span style={{ color: 'var(--warn-text, #b5701a)' }}>承認待ち {serverCases.filter((c) => c.status === 'submitted').length}</span>
                  <span style={{ color: 'var(--ok-text)' }}>approved {serverCases.filter((c) => c.status === 'approved').length}</span>
                </span>
              )}
              <span style={{ fontSize: 10.5, color: 'var(--text-3)', background: 'var(--surface-4)', padding: '2px 9px', borderRadius: 10, border: '1px solid var(--border-3)' }}>
                承認WF: draft → submitted → approved
              </span>
            </div>
            {serverMsg && (
              <div style={{ padding: '9px 20px', fontSize: 11.5, color: 'var(--err-text)', background: 'var(--err-bg)', borderBottom: '1px solid var(--err-border)' }}>
                {serverMsg}
              </div>
            )}
            <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="サーバー案件台帳">
              <div className="ocsrc-grid-cases" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.2fr 1fr', gap: 0, padding: '10px 20px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.3px' }}>
                <span>案件名 / 番号</span>
                <span>所在地</span>
                <span>作成日</span>
                <span>状態</span>
                <span style={{ textAlign: 'right' }}>操作</span>
              </div>
              {serverCases.map((sc) => (
                <div key={sc.id} className="ocsrc-grid-cases" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.2fr 1fr', gap: 0, padding: '13px 20px', borderBottom: '1px solid var(--border-2)', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 200 }}>{sc.name}</div>
                    <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: 'var(--text-4)' }}>{sc.code} · #{sc.id}</div>
                  </div>
                  <span style={{ fontSize: 11.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.address || sc.name}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: 'var(--text-3)' }}>{sc.created_at.slice(0, 10)}</span>
                  <span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 11, background: 'var(--surface-4)', color: 'var(--text-2)', border: '1px solid var(--border-3)' }}>
                      {SERVER_STATUS_LABEL[sc.status]}
                    </span>
                  </span>
                  <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                    <button onClick={() => void openAudit(sc.id, sc.code)} style={miniBtn} title="この案件の監査履歴を表示">履歴</button>
                    {sc.status === 'draft' && (
                      <button onClick={() => void onServerSubmit(sc.id)} style={miniBtn} title="承認申請へ提出（draft → submitted）">申請</button>
                    )}
                    {sc.status === 'submitted' && (
                      <button onClick={() => void onServerApprove(sc.id)} style={approveBtn} title="承認（submitted → approved）">承認</button>
                    )}
                    {sc.status === 'approved' && (
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{sc.approved_by ? `承認者: ${sc.approved_by}` : ''}</span>
                    )}
                    {/* サーバー案件の確認結果を復元表示（findings を持つ場合のみ・Issue #111） */}
                    {(() => {
                      const rec = serverCaseToRecord(sc);
                      return rec ? (
                        <button onClick={() => openCase(rec)} style={miniBtn} title="保存済みの確認結果を表示">開く</button>
                      ) : null;
                    })()}
                  </span>
                </div>
              ))}
              {auditFor && (
                <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-2)', background: 'var(--surface-3)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <b style={{ fontSize: 12 }}>監査履歴: {auditFor.code}</b>
                    <span style={{ flex: 1 }} />
                    <button onClick={() => setAuditFor(null)} style={miniBtn} title="閉じる">✕</button>
                  </div>
                  {auditMsg && <div style={{ fontSize: 11.5, color: 'var(--err-text)', marginBottom: 8 }}>{auditMsg}</div>}
                  {auditEntries === null ? (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>読み込み中…</div>
                  ) : auditEntries.length === 0 ? (
                    <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>監査エントリはありません。</div>
                  ) : (
                    <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label={`${auditFor.code} の監査履歴`}>
                      {auditEntries.map((e) => (
                        <div key={e.id} style={{ display: 'flex', gap: 14, padding: '6px 0', borderBottom: '1px solid var(--border-3)', fontSize: 11, alignItems: 'baseline' }}>
                          <span style={{ fontFamily: "'IBM Plex Mono', monospace", color: 'var(--text-3)', width: 150, flex: 'none' }}>{e.ts.slice(0, 19).replace('T', ' ')}</span>
                          <span style={{ color: 'var(--accent)', fontWeight: 700, width: 90, flex: 'none' }}>{AUDIT_ACTION_LABEL[e.action] ?? e.action}</span>
                          <span style={{ color: 'var(--text-2)', width: 200, flex: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.actor}</span>
                          <span style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{JSON.stringify(e.detail)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {serverCases.length === 0 && (
                <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
                  サーバー案件はまだありません。地点確認の結果を「ダッシュボードに保存」すると、サーバー案件台帳へ登録されます。
                </div>
              )}
            </div>
          </div>
        )}

        {/* 案件一覧 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', boxShadow: '0 1px 3px var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--border-2)', flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>調査案件一覧</h2>
            <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>
              {visibleCases.length} / {cases.length} 件（実データ {liveCount}{dummyCount ? ` / ダミー ${dummyCount}` : ''}）
            </span>
            <span style={{ flex: 1 }} />
            <input
              value={caseFilter.keyword}
              onChange={(e) => setCaseFilter((f) => ({ ...f, keyword: e.target.value }))}
              placeholder="案件名・コード・所在地で検索"
              aria-label="案件をキーワードで検索"
              style={{
                padding: '7px 11px',
                background: 'var(--surface-3)',
                border: '1px solid var(--border-3)',
                borderRadius: 7,
                fontSize: 11.5,
                color: 'var(--text)',
                width: 220,
              }}
            />
            <select
              value={caseFilter.status}
              onChange={(e) => setCaseFilter((f) => ({ ...f, status: e.target.value }))}
              aria-label="状態で絞り込み"
              style={{
                padding: '7px 11px',
                background: 'var(--surface-3)',
                border: '1px solid var(--border-3)',
                borderRadius: 7,
                fontSize: 11.5,
                color: 'var(--text)',
              }}
            >
              {CASE_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              onClick={onExportCasesCsv}
              title="絞り込み結果を CSV でダウンロード（UTF-8 BOM 付き）"
              style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11.5, border: '1px solid var(--accent-border)', background: 'var(--surface)', color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
            >
              ↓ CSV
            </button>
            {isCaseFilterActive(caseFilter) && (
              <button
                onClick={() => setCaseFilter(EMPTY_CASE_FILTER)}
                style={{ padding: '6px 12px', borderRadius: 7, fontSize: 11.5, border: '1px solid var(--border-3)', background: 'var(--surface)', color: 'var(--text-2)', cursor: 'pointer' }}
              >
                クリア
              </button>
            )}
          </div>
          <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="調査案件一覧">
          <div className="ocsrc-grid-cases" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.8fr 1fr 1fr', gap: 0, padding: '10px 20px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.3px' }}>
            <span>案件名 / 種別</span>
            <span>所在地</span>
            <span>実行日</span>
            <span>確認優先度内訳</span>
            <span>状態</span>
            <span style={{ textAlign: 'right' }}>操作</span>
          </div>
          {visibleCases.length === 0 && cases.length > 0 ? (
            <div style={{ padding: '26px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
              条件に一致する案件がありません。フィルタを変更してください。
            </div>
          ) : (
          visibleCases.map((c) => {
            const sp = CASE_STATUS[c.status];
            return (
              <div key={c.id} className="ocsrc-grid-cases" style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.8fr 1fr 1fr', gap: 0, padding: '13px 20px', borderBottom: '1px solid var(--border-2)', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>{c.name}</span>
                    {c.isDummy ? (
                      <span style={dummyTag}>ダミーデータ</span>
                    ) : (
                      <span style={liveTag}>実データ</span>
                    )}
                  </div>
                  <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, color: 'var(--text-4)' }}>{c.code}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.address}</span>
                <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: 'var(--text-3)' }}>{c.date}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {GRADES.map((g) => (
                    <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, background: PRIO[g].bg, fontSize: 10.5, fontWeight: 700, opacity: c.counts[g] > 0 ? 1 : 0.4 }}>
                      <span style={{ color: PRIO[g].color, fontFamily: "'IBM Plex Mono', monospace" }}>{g}</span>
                      <span style={{ color: PRIO[g].color }}>{c.counts[g]}</span>
                    </span>
                  ))}
                </div>
                <span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 11, background: sp.bg, color: sp.color }}>{sp.label}</span>
                </span>
                <span style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                  <button onClick={() => openCase(c)} style={{ padding: '6px 13px', background: 'var(--surface)', border: '1px solid var(--accent-border)', borderRadius: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--accent)', cursor: 'pointer' }}>
                    開く
                  </button>
                  {!c.isDummy && (
                    <button
                      onClick={() => deleteCase(c.id)}
                      title="この本番データ案件を削除"
                      style={{ width: 28, padding: '6px 0', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12, fontWeight: 700, color: 'var(--err-text)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </div>
            );
          })
          )}
          </div>
          {cases.length === 0 && (
            <div style={{ padding: '32px 20px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.7 }}>
              まだ調査案件がありません。<br />
              「地点入力（SCR-001）」で地点確認を実行し、結果を「ダッシュボードに保存（本番データ）」すると一覧に追加されます。
            </div>
          )}
        </div>
        <p style={{ margin: '14px 2px 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {dummyCount > 0 ? (
            <>「<b style={{ color: 'var(--text-2)' }}>ダミーデータ</b>」タグの{dummyCount}件はサンプルで、件数はデモ値です（「開く」で座標の実取得を実行）。実データは地点確認の結果を SCR-002 の「ダッシュボードに保存」で追加できます。確認優先度Dは判断材料の不足を意味します。</>
          ) : (
            <>実データは地点確認の結果を SCR-002 の「ダッシュボードに保存」で追加できます。確認優先度Dは「リスクが低い」ではなく判断材料の不足を意味します。</>
          )}
        </p>
        {state.caseSaveState && (
          <p style={{ margin: '8px 2px 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
            {state.caseSaveState.kind === 'server' ? (
              <>最新の保存先: <b style={{ color: 'var(--ok-text)' }}>サーバー案件台帳</b>（{state.caseSaveState.code}）— 承認ワークフローで管理されます。</>
            ) : (
              <>最新の保存先: <b style={{ color: 'var(--text-2)' }}>この端末（localStorage）</b> — サーバー案件台帳が未設定のため、下書きとして端末内に保存しました。</>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

const ghostBtn: React.CSSProperties = {
  padding: '10px 14px',
  background: 'var(--surface)',
  color: 'var(--accent)',
  border: '1.5px solid var(--accent-border)',
  borderRadius: 8,
  fontSize: 12.5,
  fontWeight: 700,
  cursor: 'pointer',
};
const miniBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--accent-border)',
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 700,
  color: 'var(--accent)',
  cursor: 'pointer',
};
const approveBtn: React.CSSProperties = {
  ...miniBtn,
  background: 'var(--ok-bg)',
  color: 'var(--ok-text)',
  borderColor: 'var(--ok-border)',
};
const dummyTag: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  padding: '1px 7px',
  borderRadius: 4,
  background: 'var(--surface-4)',
  color: 'var(--text-3)',
  border: '1px solid var(--border-3)',
  flex: 'none',
};
const liveTag: React.CSSProperties = {
  fontSize: 9.5,
  fontWeight: 700,
  padding: '1px 7px',
  borderRadius: 4,
  background: 'var(--ok-bg)',
  color: 'var(--ok-text)',
  flex: 'none',
};
