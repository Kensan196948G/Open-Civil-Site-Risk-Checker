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
import { SettingsScreen } from './screens/SettingsScreen';

// 全体レイアウト（Redesign版の最上位 div 構造を移植）。
// サイドバー（全高）/ 右カラム（ヘッダー / メイン（画面切替）/ フッター）+ 詳細ドロワー + ローディング。
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
      className="ocsrc-body"
      style={{
        display: 'flex',
        height: '100vh',
        width: '100vw',
        fontFamily: "'IBM Plex Sans JP', sans-serif",
        background: 'var(--bg)',
        color: 'var(--text)',
        overflow: 'hidden',
      }}
    >
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header />
        <main style={{ flex: 1, position: 'relative', minWidth: 0, background: 'var(--bg)', overflow: 'hidden' }}>
          {screen === 'dashboard' && <DashboardScreen />}
          {screen === 'input' && <InputScreen />}
          {screen === 'analysis' && <AnalysisScreen />}
          {screen === 'aimemo' && <MemoScreen />}
          {screen === 'report' && <ReportScreen />}
          {screen === 'sources' && <SourcesScreen />}
          {screen === 'logs' && <LogsScreen />}
          {screen === 'settings' && <SettingsScreen />}
          <FindingDrawer />
          {state.running && <LoadingOverlay />}
        </main>
        <Footer />
      </div>
    </div>
  );
}
