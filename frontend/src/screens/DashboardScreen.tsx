import { useMemo, useRef, useState } from 'react';
import { useApp } from '../store';
import { DUMMY_CASES, THIS_WEEK_SINCE } from '../data/cases';
import { getCaseStatus, getPrio } from '../data/constants';
import type { CaseRecord, Priority } from '../types';

// SCR-000 ダッシュボード。実取得（本番）データ案件 + ダミー（サンプル）案件を表示する。
// 既定の起動画面。実データは localStorage に保存され、ダミーは「ダミーデータ」と明記する。
const GRADES: Priority[] = ['A', 'B', 'C', 'D'];
const AGG_NAMES: Record<Priority, string> = { A: '専門確認優先', B: '追加確認推奨', C: '参考情報あり', D: 'データ不足' };

export function DashboardScreen() {
  const { state, go, openCase, deleteCase, importCases, exportCases } = useApp();
  const PRIO = getPrio(state.theme);
  const CASE_STATUS = getCaseStatus(state.theme);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // 実データ（新しい順）を先頭に、続いてダミーを並べる。
  const cases: CaseRecord[] = useMemo(() => [...state.liveCases, ...DUMMY_CASES], [state.liveCases]);
  const liveCount = state.liveCases.length;

  const { agg, aggTotal, kpiCards } = useMemo(() => {
    const a: Record<Priority, number> = { A: 0, B: 0, C: 0, D: 0 };
    cases.forEach((c) => GRADES.forEach((g) => (a[g] += c.counts[g])));
    const total = a.A + a.B + a.C + a.D;
    const aCount = cases.reduce((s, c) => s + c.counts.A, 0);
    const needAction = cases.filter((c) => c.counts.A > 0).length;
    const thisWeek = cases.filter((c) => c.date >= THIS_WEEK_SINCE).length;
    const cards = [
      { label: '総案件数', value: String(cases.length), unit: '件', sub: `実データ ${liveCount} / ダミー ${DUMMY_CASES.length}`, color: 'var(--accent)' },
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
    } catch (err: any) {
      setMsg({ kind: 'err', text: err?.message || '取り込みに失敗しました。' });
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
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-000</div>
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
              border: `1px solid ${msg.kind === 'ok' ? 'var(--ok-text)' : 'var(--err-border)'}`,
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 13, marginBottom: 16 }}>
          {kpiCards.map((k) => (
            <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '16px 17px', boxShadow: '0 1px 3px var(--shadow)' }}>
              <div style={{ fontSize: 11.5, color: 'var(--text-3)', fontWeight: 500, marginBottom: 9 }}>{k.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                <span style={{ fontSize: 30, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", color: k.color, lineHeight: 1 }}>{k.value}</span>
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
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>合計 {aggTotal} 件の確認項目</span>
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
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, fontWeight: 700, color: PRIO[g].color }}>{agg[g]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 案件一覧 */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 11, overflow: 'hidden', boxShadow: '0 1px 3px var(--shadow)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderBottom: '1px solid var(--border-2)' }}>
            <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>調査案件一覧</h2>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'var(--text-3)' }}>
              {cases.length} 件（実データ {liveCount} / ダミー {DUMMY_CASES.length}）
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.8fr 1fr 1fr', gap: 0, padding: '10px 20px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, fontWeight: 700, color: 'var(--text-3)', letterSpacing: '.3px' }}>
            <span>案件名 / 種別</span>
            <span>所在地</span>
            <span>実行日</span>
            <span>確認優先度内訳</span>
            <span>状態</span>
            <span style={{ textAlign: 'right' }}>操作</span>
          </div>
          {cases.map((c) => {
            const sp = CASE_STATUS[c.status];
            return (
              <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2.2fr 1.6fr 1fr 1.8fr 1fr 1fr', gap: 0, padding: '13px 20px', borderBottom: '1px solid var(--border-2)', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 170 }}>{c.name}</span>
                    {c.isDummy ? (
                      <span style={dummyTag}>ダミーデータ</span>
                    ) : (
                      <span style={liveTag}>実データ</span>
                    )}
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: 'var(--text-4)' }}>{c.code}</div>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.address}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: 'var(--text-3)' }}>{c.date}</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {GRADES.map((g) => (
                    <span key={g} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 5, background: PRIO[g].bg, fontSize: 10.5, fontWeight: 700, opacity: c.counts[g] > 0 ? 1 : 0.4 }}>
                      <span style={{ color: PRIO[g].color, fontFamily: "'JetBrains Mono', monospace" }}>{g}</span>
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
          })}
        </div>
        <p style={{ margin: '14px 2px 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
          「<b style={{ color: 'var(--text-2)' }}>ダミーデータ</b>」タグの6件はサンプルで、件数はデモ値です（「開く」で座標の実取得を実行）。実データは地点確認の結果を SCR-002 の「ダッシュボードに保存」で追加できます。確認優先度Dは判断材料の不足を意味します。
        </p>
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
