import { useApp } from '../store';
import type { FetchStep } from '../types';

// 取得中オーバーレイ。各データソースの取得状況を段階表示する（要件 NFR-003 部分結果）。
const META: Record<FetchStep['status'], { icon: string; label: string; color: string; bg: string }> = {
  pending: { icon: '', label: '取得中…', color: 'var(--text-3)', bg: 'var(--surface-4)' },
  success: { icon: '✓', label: '成功', color: '#3fb27f', bg: '#e3f0e8' },
  failed: { icon: '✕', label: '失敗', color: '#c0392b', bg: '#f7e7e4' },
  skipped: { icon: '–', label: 'スキップ', color: '#9aa2ae', bg: '#eef0f3' },
};

export function LoadingOverlay() {
  const { state } = useApp();
  const { fetchSteps } = state;

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(22,32,46,.55)', zIndex: 950, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(2px)', animation: 'ocsrc-fade .2s ease' }}>
      <div style={{ width: 420, background: 'var(--surface)', borderRadius: 14, padding: '26px 28px', boxShadow: '0 16px 48px rgba(15,23,34,.35)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <div style={{ width: 18, height: 18, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'ocsrc-spin .8s linear infinite' }} />
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>地点確認を実行中</h2>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 11.5, color: 'var(--text-3)', lineHeight: 1.6 }}>外部APIの取得状況により、部分結果から表示します。</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {fetchSteps.map((st) => {
            const m = META[st.status];
            return (
              <div key={st.key} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: m.bg, color: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flex: 'none' }}>
                  {m.icon}
                </span>
                <span style={{ flex: 1, color: 'var(--text-2)' }}>{st.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: m.color }}>{m.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
