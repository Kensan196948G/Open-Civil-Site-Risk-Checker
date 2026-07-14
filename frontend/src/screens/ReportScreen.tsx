import { useMemo } from 'react';
import { useApp } from '../store';
import { buildReportMd } from '../report/markdown';
import { buildReportCsv } from '../report/csv';
import { cssToStyle } from '../cssToStyle';

// SCR-005 レポート出力。Markdown / CSV を選び、公開区分を設定して出力（要件 FR-306 / §14）。
const REPORT_SECTIONS = ['調査条件', '確認優先度サマリー', 'カテゴリ別確認結果', 'AI調査メモ', '取得できなかった情報', '参照データ・出典', '注意事項'];

export function ReportScreen() {
  const { state, go, setFmt, setVis } = useApp();
  const { ranOnce, location, findings, sources, reportFormat, reportVisibility, fetchedAt } = state;

  const preview = useMemo(() => {
    if (!location) return '';
    return reportFormat === 'md'
      ? buildReportMd({ location, findings, sources, visibility: reportVisibility, fetchedAt })
      : buildReportCsv(findings);
  }, [location, findings, sources, reportFormat, reportVisibility, fetchedAt]);

  const filename = useMemo(() => {
    const stamp = fetchedAt.replace(/[^0-9]/g, '').slice(0, 12) || '00000000';
    return `site-risk-check_${stamp}.${reportFormat}`;
  }, [fetchedAt, reportFormat]);

  if (!ranOnce || !location) {
    return (
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, color: 'var(--text-3)' }}>
        <div style={{ fontSize: 14 }}>地点確認の実行後に出力できます。</div>
        <button onClick={() => go('input')} style={primaryBtn}>地点入力へ →</button>
      </div>
    );
  }

  const download = () => {
    const isCsv = reportFormat === 'csv';
    // CSV は Excel の文字化け防止のため UTF-8 BOM を付与。
    const parts = isCsv ? ['﻿', preview] : [preview];
    const blob = new Blob(parts, { type: isCsv ? 'text/csv;charset=utf-8' : 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
  };

  const fmtBase = 'padding:8px 16px;border-radius:7px;font-size:12.5px;font-weight:700;cursor:pointer;border:1.5px solid ';
  const visBase = 'display:flex;flex-direction:column;gap:2px;padding:11px 13px;border-radius:8px;cursor:pointer;text-align:left;font-size:12.5px;color:var(--text);border:1.5px solid ';

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
      <div className="ocsrc-report-columns" style={{ display: 'flex', minHeight: 0 }}>
        <div className="ocsrc-report-left" style={{ flex: 'none', background: 'var(--surface)', overflow: 'auto', padding: '22px 20px' }}>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-005</div>
          <h1 style={{ margin: '3px 0 18px', fontSize: 20, fontWeight: 700 }}>レポート出力</h1>

          <div style={fieldLabel}>出力形式</div>
          <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
            <button onClick={() => setFmt('md')} style={cssToStyle(fmtBase + (reportFormat === 'md' ? 'var(--accent);background:var(--accent);color:#fff' : 'var(--border);background:var(--surface);color:var(--text-2)'))}>Markdown</button>
            <button onClick={() => setFmt('csv')} style={cssToStyle(fmtBase + (reportFormat === 'csv' ? 'var(--accent);background:var(--accent);color:#fff' : 'var(--border);background:var(--surface);color:var(--text-2)'))}>CSV</button>
          </div>

          <div style={fieldLabel}>公開区分</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20 }}>
            <button onClick={() => setVis('internal')} style={cssToStyle(visBase + (reportVisibility === 'internal' ? 'var(--accent);background:var(--accent-soft)' : 'var(--border-3);background:var(--surface)'))}>
              <span style={{ fontWeight: 700 }}>社外秘 / 社内限定</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>未公開案件・候補地として扱う</span>
            </button>
            <button onClick={() => setVis('public')} style={cssToStyle(visBase + (reportVisibility === 'public' ? 'var(--accent);background:var(--accent-soft)' : 'var(--border-3);background:var(--surface)'))}>
              <span style={{ fontWeight: 700 }}>社外可</span>
              <span style={{ fontSize: 10.5, color: 'var(--text-3)' }}>公開可能な情報のみで構成</span>
            </button>
          </div>

          <div style={fieldLabel}>含める項目</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 22 }}>
            {REPORT_SECTIONS.map((rs) => (
              <div key={rs} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: 12, color: 'var(--text-2)' }}>
                <span style={{ width: 14, height: 14, borderRadius: 4, background: 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>✓</span>
                {rs}
              </div>
            ))}
          </div>

          <div style={{ padding: '11px 12px', background: 'var(--surface-3)', borderRadius: 7, marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 3 }}>ファイル名</div>
            <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10.5, color: 'var(--text-2)', wordBreak: 'break-all' }}>{filename}</div>
          </div>
          <button onClick={download} style={{ width: '100%', padding: 12, background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(21,97,109,.3)' }}>
            ↓ {reportFormat === 'md' ? 'Markdown' : 'CSV'} をダウンロード
          </button>
        </div>

        <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '24px 26px', background: 'var(--surface-4)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, fontWeight: 600 }}>プレビュー</div>
          <pre style={{ margin: 0, background: 'var(--surface)', border: '1px solid var(--border-3)', borderRadius: 10, padding: '24px 26px', fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, lineHeight: 1.75, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-word', boxShadow: '0 1px 4px rgba(20,40,70,.05)' }}>
            {preview}
          </pre>
        </div>
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--text-2)', marginBottom: 8 };
const primaryBtn: React.CSSProperties = { padding: '10px 20px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer' };
