import { useEffect, useMemo, useRef, useState } from 'react';
import { listAudit, type AuditEntry } from '../api/cases';
import { ACTION_LABEL, DUMMY_AUDIT, fmtTs } from './auditConstants';
import { buildAuditCsv } from '../report/auditCsv';

// SCR-009 監査ログ（Issue #111・auditor ロール）。
// サーバー案件台帳（OCSRC_CASE_STORE_ENABLED）が有効な場合は /api/v1/audit から
// 実データを、無効・未到達時は架空のダミー監査ログを表示する（空画面を残さない）。
// 監査ログは actor・時刻・対象・action のみを保持し、本文・秘密情報は含まない。

const COLS = '0.9fr 1.1fr 1fr 1.4fr 2.2fr';

export function AuditScreen() {
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const loadedRef = useRef(false);

  // 初回のみサーバー監査ログを取得する（未設定・未到達・権限不足はダミー表示）。
  // ref で「一度だけ実行」を管理し、effect 内の同期 setState を避ける。
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    let cancelled = false;
    void (async () => {
      try {
        const items = await listAudit();
        if (cancelled) return;
        setEntries(items);
        setEnabled(true);
        setMsg(null);
      } catch {
        if (cancelled) return;
        setEntries(DUMMY_AUDIT);
        setEnabled(false);
        setMsg('サーバー案件台帳が未設定（または auditor 権限なし）のため、架空のダミー監査ログを表示しています。');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => entries ?? DUMMY_AUDIT, [entries]);

  // 監査証跡の CSV エクスポート（ISO/J-SOX 対応・UTF-8 BOM 付き）。
  const exportCsv = () => {
    const csv = buildAuditCsv(rows);
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocsrc-audit_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 200);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: '26px 28px 50px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 14, marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: 'var(--accent)', letterSpacing: '1px', fontWeight: 600 }}>SCR-009</div>
          <h1 style={{ margin: '3px 0 4px', fontSize: 21, fontWeight: 700 }}>監査ログ</h1>
        </div>
        <div style={{ flex: 1 }} />
        <button
          onClick={exportCsv}
          disabled={rows.length === 0}
          style={{ padding: '8px 14px', background: 'var(--surface)', color: 'var(--accent)', border: '1.5px solid var(--accent-border)', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: rows.length ? 'pointer' : 'default', opacity: rows.length ? 1 : 0.5 }}
          title="表示中の監査ログを CSV でエクスポート（監査証跡）"
        >
          ↓ CSV エクスポート
        </button>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--text-2)' }}>
        案件台帳の操作履歴です（Issue #111）。actor・時刻・対象・action を記録し、本文や秘密情報は含みません。
        {enabled === null && '読み込み中…'}
        {enabled === true && 'サーバー案件台帳の実データを表示しています。'}
        {enabled === false && '（ダミー表示）'}
      </p>
      {msg && (
        <div style={{ marginBottom: 12, padding: '9px 13px', borderRadius: 8, fontSize: 11.5, background: 'var(--warn-bg, var(--surface-4))', color: 'var(--text-2)', border: '1px solid var(--border-3)' }}>
          {msg}
        </div>
      )}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', fontFamily: "'IBM Plex Mono', monospace" }}>
        <div className="ocsrc-table-scroll" tabIndex={0} role="region" aria-label="監査ログ">
          <div className="ocsrc-grid-logs" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '10px 16px', background: 'var(--surface-3)', borderBottom: '1px solid var(--border-2)', fontSize: 10, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.3px' }}>
            <span>時刻</span>
            <span>actor</span>
            <span>action</span>
            <span>対象</span>
            <span>詳細</span>
          </div>
          {rows.map((e) => (
            <div key={e.id} className="ocsrc-grid-logs" style={{ display: 'grid', gridTemplateColumns: COLS, gap: 0, padding: '9px 16px', borderBottom: '1px solid var(--border-2)', fontSize: 10.5, alignItems: 'center' }}>
              <span style={{ color: 'var(--text-3)' }}>{fmtTs(e.ts)}</span>
              <span style={{ color: 'var(--text)' }}>{e.actor}</span>
              <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{ACTION_LABEL[e.action] ?? e.action}</span>
              <span style={{ color: 'var(--text-2)' }}>{e.entity}#{e.entity_id}</span>
              <span style={{ color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{JSON.stringify(e.detail)}</span>
            </div>
          ))}
        </div>
        {rows.length === 0 && (
          <div style={{ padding: '28px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-3)' }}>
            監査ログはまだありません。
          </div>
        )}
      </div>
    </div>
  );
}
