import { useEffect } from 'react';
import { useApp } from './store';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Footer } from './components/Footer';
import { LoadingOverlay } from './components/LoadingOverlay';
import { FindingDrawer } from './components/FindingDrawer';
import { DashboardScreen } from './screens/DashboardScreen';
import { InputScreen } from './screens/InputScreen';
import { AnalysisScreen } from './screens/AnalysisScreen';
import { MemoScreen } from './screens/MemoScreen';
import { ReportScreen } from './screens/ReportScreen';
import { SourcesScreen } from './screens/SourcesScreen';
import { LogsScreen } from './screens/LogsScreen';

// 全体レイアウト（デザインモック v2 の最上位 div 構造を移植）。
// ヘッダー / 左ナビ / メイン（画面切替）/ フッター + 詳細ドロワー + ローディング。
// テーマは <html data-ocsrc-theme> 属性に反映する。

export function App() {
  const { state } = useApp();
  const { screen, theme } = state;

  // テーマ状態を documentElement の属性へ同期（CSS 変数の切替トリガ）。
  useEffect(() => {
    document.documentElement.setAttribute('data-ocsrc-theme', theme);
  }, [theme]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        width: '100vw',
        fontFamily: "'Noto Sans JP', sans-serif",
        background: 'var(--bg)',
        color: 'var(--text)',
        overflow: 'hidden',
      }}
    >
      <Header />
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <main style={{ flex: 1, position: 'relative', minWidth: 0, background: 'var(--bg)' }}>
          {screen === 'dashboard' && <DashboardScreen />}
          {screen === 'input' && <InputScreen />}
          {screen === 'analysis' && <AnalysisScreen />}
          {screen === 'aimemo' && <MemoScreen />}
          {screen === 'report' && <ReportScreen />}
          {screen === 'sources' && <SourcesScreen />}
          {screen === 'logs' && <LogsScreen />}
          <FindingDrawer />
          {state.running && <LoadingOverlay />}
        </main>
      </div>
      <Footer />
    </div>
  );
}
