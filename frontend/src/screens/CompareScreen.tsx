import { useEffect, useMemo, useState } from 'react';
import { useApp } from '../store';
import { DUMMY_CASES_VISIBLE } from '../data/cases';
import { COMPARE_DEMO_ROWS } from '../data/fixtures';
import { isCaseStoreEnabled, listCases, serverCaseToRecord } from '../api/cases';
import {
  COMPARE_CATEGORIES,
  buildCompareCsv,
  buildCompareHtml,
  buildCompareMd,
  cellDetail,
  cellMeta,
  summarizeCategory,
  toCompareRow,
  type CompareRow,
} from '../report/compare';
import { openPackForPrint } from '../report/pack';
import { CATEGORY_LABEL } from '../data/constants';
import type { CaseRecord } from '../types';

// SCR-010 候補地比較（Issue #175）。保存済み案件（実データ + サーバー台帳 + ダミー）から
// 2〜4 地点を選択し、主要リスク要素を横並び比較する。
// 「データ未取得」と「リスク低」を区別し、安全/危険は断定しない。
// サーバー案件台帳（#111・feature flag 有効時のみ）が使える場合はサーバー案件も候補に加える。

export function CompareScreen() {
  const { state, go } = useApp();
  // サーバー案件台帳（Issue #175 の残課題: サーバー保存済み案件の比較対応）。
  // API 有効時のみ読み込む（無効・未到達は従来どおりローカル案件のみ）。
  const [serverCases, setServerCases] = useState<CaseRecord[]>([]);
  const [serverEnabled, setServerEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const ok = await isCaseStoreEnabled();
        if (cancelled) return;
        setServerEnabled(ok);
        if (ok) {
          const items = await listCases();
          if (cancelled) return;
          setServerCases(items.map(serverCaseToRecord).filter((x): x is CaseRecord => x !== null));
        }
      } catch {
        if (cancelled) return;
        setServerEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 比較候補: 実データ案件 + サーバー台帳案件（有効時）+ ダミー案件（表示設定時のみ）。
  // findings を持たない案件は「データ未取得」として比較可能（未取得と低リスクを区別する設計）。
  const candidates: CaseRecord[] = useMemo(
    () => [...state.liveCases, ...serverCases, ...DUMMY_CASES_VISIBLE],
    [state.liveCases, serverCases],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 4) {
          setMsg('比較できるのは最大4地点までです。');
          return prev;
        }
        next.add(id);
      }
      return next;
    });
  };

  const rows: CompareRow[] = useMemo(() => {
    const chosen = candidates.filter((c) => selected.has(c.id));
    if (chosen.length === 0) return [];
    // 選択した実データ案件を比較行へ。選択が無い場合はデモ行を表示（空画面を残さない）。
    return chosen.map(toCompareRow);
  }, [candidates, selected]);

  const onExport = (fmt: 'md' | 'csv') => {
    const target = rows.length ? rows : COMPARE_DEMO_ROWS;
    const content = fmt === 'md' ? buildCompareMd(target) : buildCompareCsv(target);
    const blob = new Blob(
      fmt === 'csv' ? ['\uFEFF' + content] : [content],
      { type: fmt === 'csv' ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocsrc-compare_${new Date().toISOString().slice(0, 10)}.${fmt}`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
    setMsg(`${fmt === 'md' ? 'Markdown' : 'CSV'} をダウンロードしました。`);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-010</div>
      <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>候補地比較</h1>
      <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--text-2)' }}>
        複数地点（2〜4件）の主要リスク要素を横並びで比較します。データ未取得と低リスクは区別し、安全・危険は断定しません。
      </p>

      {/* 候補選択 */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <b style={{ fontSize: 13 }}>比較対象を選択（{selected.size}/4）</b>
          <span style={{ flex: 1 }} />
          <button onClick={() => setSelected(new Set())} style={miniBtn}>クリア</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {candidates.map((c) => (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              aria-pressed={selected.has(c.id)}
              style={{
                ...miniBtn,
                background: selected.has(c.id) ? 'var(--accent)' : 'var(--surface)',
                color: selected.has(c.id) ? '#fff' : 'var(--text-2)',
                borderColor: selected.has(c.id) ? 'var(--accent)' : 'var(--border-3)',
              }}
            >
              {c.isDummy ? '【ダミー】' : c.id.startsWith('server-') ? '【サーバー】' : ''}{c.name}
            </button>
          ))}
          {candidates.length === 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              保存済み案件がありません。「地点入力（SCR-001）」で確認し、ダッシュボードに保存すると比較できます。
            </span>
          )}
        </div>
      </div>

      {msg && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, fontSize: 11.5, background: 'var(--surface-4)', color: 'var(--text-2)', border: '1px solid var(--border-3)' }}>
          {msg}
        </div>
      )}

      {/* 比較表 */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '1px solid var(--border-2)' }}>
          <b style={{ fontSize: 13 }}>リスク要素比較表</b>
          <span style={{ flex: 1 }} />
          <button onClick={() => onExport('md')} style={miniBtn} title="Markdown でエクスポート">↓ Markdown</button>
          <button onClick={() => onExport('csv')} style={miniBtn} title="CSV でエクスポート（UTF-8 BOM 付き）">↓ CSV</button>
          <button
            onClick={() => {
              const target = rows.length ? rows : COMPARE_DEMO_ROWS;
              openPackForPrint(buildCompareHtml(target, new Date().toISOString().slice(0, 19).replace('T', ' ')));
            }}
            style={miniBtn}
            title="比較表を A4 で印刷 / PDF 化（#175）"
          >
            🖨 印刷 / PDF
          </button>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '26px 18px', textAlign: 'center', fontSize: 12.5, color: 'var(--text-3)', lineHeight: 1.8 }}>
            比較対象が選択されていません。上の候補から 2〜4 地点を選ぶと、ここに比較表が表示されます。
            <br />
            <span style={{ fontSize: 11, color: 'var(--text-4)' }}>
              （デモ: ダミー案件を含む候補を選択すると、架空データで比較できます）
            </span>
          </div>
        ) : (
          <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="候補地比較表">
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5 }}>
              <thead>
                <tr style={{ background: 'var(--surface-3)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border-2)' }}>項目</th>
                  {rows.map((r) => (
                    <th key={r.caseId} style={{ textAlign: 'left', padding: '10px 14px', borderBottom: '1px solid var(--border-2)', minWidth: 180 }}>
                      <div style={{ fontWeight: 700 }}>{r.name}</div>
                      <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 9.5, fontWeight: 400, color: 'var(--text-4)' }}>{r.code} / {r.date}</div>
                      <div style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-3)' }}>{r.addressLabel()}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_CATEGORIES.map((cat) => (
                  <tr key={cat}>
                    <td style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-3)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {CATEGORY_LABEL[cat]}
                    </td>
                    {rows.map((r) => {
                      const fs = r.byCategory[cat];
                      const meta = cellMeta(summarizeCategory(fs));
                      const details = cellDetail(fs);
                      return (
                        <td key={r.caseId} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-3)', verticalAlign: 'top' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: meta.color }}>{meta.label}</div>
                          {details.map((d, i) => (
                            <div key={i} style={{ fontSize: 10.5, color: 'var(--text-2)', marginTop: 3, lineHeight: 1.5 }}>{d}</div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr>
                  <td style={{ padding: '10px 14px', fontWeight: 600, whiteSpace: 'nowrap' }}>優先度 A 合計</td>
                  {rows.map((r) => (
                    <td key={r.caseId} style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--err-text)', fontWeight: 700 }}>{r.counts.A ?? 0}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p style={{ margin: '12px 2px 0', fontSize: 11, color: 'var(--text-3)', lineHeight: 1.6 }}>
        比較表は保存済み案件の確認結果を横並びにした参考情報です。データ未取得（no_data）は「リスクが低い」ではなく判断材料の不足を意味します。出典・取得日時は各案件の詳細を参照してください。
        {serverEnabled === true && serverCases.length > 0 && ' サーバー案件台帳（#111）の保存済み案件を含みます。'}
        {serverEnabled === false && ' サーバー案件台帳が未設定のため、比較対象はこの端末の案件のみです。'}
      </p>
      <p style={{ margin: '8px 2px 0', fontSize: 11, color: 'var(--text-3)' }}>
        <button onClick={() => go('input')} style={{ ...miniBtn, padding: '4px 10px', fontSize: 10.5 }}>＋ 地点入力へ（新規確認）</button>
      </p>
    </div>
  );
}

const miniBtn: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--surface)',
  border: '1px solid var(--border-3)',
  borderRadius: 6,
  fontSize: 11.5,
  fontWeight: 600,
  color: 'var(--text-2)',
  cursor: 'pointer',
};
