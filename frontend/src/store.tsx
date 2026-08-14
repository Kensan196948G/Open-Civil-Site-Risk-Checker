/* eslint-disable react-refresh/only-export-components -- 状態管理モジュール。Provider と
   フック・型を同居させる意図的な構成（HMR の完全な fast-refresh は効かないが実害なし）。 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type {
  BaseLayer,
  CaseRecord,
  Category,
  FetchStep,
  Finding,
  InputType,
  LogEntry,
  MapFeatures,
  OverlayKey,
  Screen,
  SiteLocation,
  SourceKey,
  SourceLedgerEntry,
  Theme,
} from './types';
import type { MapCaptureResult } from './map/capture';
import { SAMPLE } from './data/constants';
import type { SurveyTemplate } from './data/templates';
import { cloneLedger } from './data/sources';
import { rememberAddress } from './settings/recentAddresses';
import { loadAnalysisDefaults } from './settings/appSettings';
import { addLiveCase, buildCaseFromAnalysis, deleteLiveCase, exportLiveCases, importLiveCases, loadLiveCases } from './data/caseStore';
import { buildMemoText } from './risk/memo';
import { runAnalysis, STEP_DEFS, type AnalysisInputForm } from './api/runAnalysis';
import { nowStamp } from './api/http';
import { createCase } from './api/cases';
import { pingSource } from './api/ping';

// アプリ全体の状態管理。デザインモックの DCLogic.state を React の状態に移植。
// 非同期の地点確認（実 API 呼び出し）はここで集約し、画面側は宣言的に表示する。

type FormCategories = Record<Exclude<Category, 'data_quality'>, boolean>;

interface FormState {
  type: InputType;
  address: string;
  lat: string;
  lon: string;
  radius: number;
  categories: FormCategories;
}

const THEME_KEY = 'ocsrc-theme';

/** 初期テーマを localStorage → 既定 'light' の順で解決する。 */
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* localStorage 不可環境は既定にフォールバック */
  }
  return 'light';
}

export interface AppState {
  screen: Screen;
  theme: Theme;
  form: FormState;
  formError: string;
  running: boolean;
  ranOnce: boolean;
  location: SiteLocation | null;
  baseLayer: BaseLayer;
  overlays: Record<OverlayKey, boolean>;
  categoryFilter: string;
  selectedFinding: string | null;
  memoEditing: boolean;
  memoText: string;
  reportFormat: 'md' | 'csv';
  reportVisibility: 'internal' | 'public';
  fetchSteps: FetchStep[];
  findings: Finding[];
  logs: LogEntry[];
  sources: SourceLedgerEntry[];
  features: MapFeatures;
  fetchedAt: string;
  /** 実取得（本番）データの保存済み案件（localStorage 永続）。 */
  liveCases: CaseRecord[];
  /** 現在の確認結果がダッシュボードに保存済みか。 */
  currentSaved: boolean;
  /** 案件保存先（Issue #111）。server=案件台帳 API / local=localStorage フォールバック。 */
  caseSaveState: { kind: 'server' | 'local'; code?: string; id?: string } | null;
  /** 地図キャプチャ結果（Issue #274）。分析画面で取得し、調査パックへ同梱する。 */
  mapCapture: MapCaptureResult | null;
  /** ハザードタイルをキャプチャ画像へ含めるか（ライセンス考慮・既定 false）。 */
  captureHazardLayers: boolean;
}

function initialState(): AppState {
  // SCR-008 で保存された既定値（検索半径・確認カテゴリ）があれば使う（未保存時は組み込みの既定値）。
  const defaults = loadAnalysisDefaults();
  return {
    screen: 'dashboard',
    theme: initialTheme(),
    form: {
      type: 'address',
      address: '',
      lat: '',
      lon: '',
      radius: defaults.radius,
      categories: defaults.categories,
    },
    formError: '',
    running: false,
    ranOnce: false,
    location: null,
    baseLayer: 'pale',
    overlays: { range: true, roads: true, water: true, flood: false, sediment: false, hillshade: false, facilities: true },
    categoryFilter: 'all',
    selectedFinding: null,
    memoEditing: false,
    memoText: '',
    reportFormat: 'md',
    reportVisibility: 'internal',
    fetchSteps: [],
    findings: [],
    logs: [],
    sources: cloneLedger(),
    features: { roads: [], water: [], facilities: [] },
    fetchedAt: '—',
    liveCases: loadLiveCases(),
    currentSaved: false,
    caseSaveState: null,
    mapCapture: null,
    captureHazardLayers: false,
  };
}

export interface AppController {
  state: AppState;
  // theme
  toggleTheme: () => void;
  // navigation
  go: (s: Screen) => void;
  // dashboard / cases（本番データ）
  openCase: (c: CaseRecord) => void;
  saveCurrentAsCase: () => void;
  deleteCase: (id: string) => void;
  importCases: (json: string) => { imported: number };
  exportCases: () => string;
  // input
  setType: (t: InputType) => void;
  onAddress: (v: string) => void;
  onLat: (v: string) => void;
  onLon: (v: string) => void;
  setRadius: (r: number) => void;
  toggleCat: (k: keyof FormCategories) => void;
  /** 調査テンプレート（評価書 #21）を適用し、検索半径・カテゴリの初期値をまとめて設定する。 */
  applyTemplate: (t: SurveyTemplate) => void;
  runAnalysisAction: () => void;
  runSample: () => void;
  clearResult: () => void;
  // analysis
  setBase: (b: BaseLayer) => void;
  toggleOverlay: (k: OverlayKey) => void;
  setCategoryFilter: (k: string) => void;
  // detail
  openFinding: (id: string) => void;
  closeFinding: () => void;
  // memo
  toggleMemoEdit: () => void;
  onMemoInput: (v: string) => void;
  regenMemo: () => void;
  memoTextOrDefault: () => string;
  // report
  setFmt: (f: 'md' | 'csv') => void;
  setVis: (v: 'internal' | 'public') => void;
  // map capture (Issue #274)
  setMapCapture: (c: MapCaptureResult | null) => void;
  setCaptureHazardLayers: (v: boolean) => void;
  // sources
  testSource: (key: SourceKey) => void;
}

function validate(form: FormState): string {
  if (form.type === 'address') {
    if (!form.address.trim()) return '住所を入力してください（または緯度経度入力に切替）。';
  } else {
    const la = parseFloat(form.lat);
    const lo = parseFloat(form.lon);
    if (Number.isNaN(la) || Number.isNaN(lo)) return '緯度・経度を数値で入力してください。';
    if (la < -90 || la > 90) return '緯度は -90〜90 の範囲で入力してください。';
    if (lo < -180 || lo > 180) return '経度は -180〜180 の範囲で入力してください。';
  }
  if (!Object.values(form.categories).some((v) => v)) return '確認カテゴリを1つ以上選択してください。';
  return '';
}

export function useAppController(): AppController {
  const [state, setState] = useState<AppState>(initialState);
  // setState の関数形を多用するため、最新フォームを参照する ref を保持。
  // 描画中の ref 書き込みは react-hooks/refs で禁止されるため、コミット後の effect 内で同期する
  // （読み出しは全てユーザー操作起点の useCallback 内のみで、同一描画中の同期読みは無い）。
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const patch = useCallback((p: Partial<AppState>) => setState((s) => ({ ...s, ...p })), []);

  const go = useCallback((s: Screen) => setState((st) => ({ ...st, screen: s, selectedFinding: null })), []);

  const setType = useCallback((t: InputType) => setState((s) => ({ ...s, form: { ...s.form, type: t }, formError: '' })), []);
  const onAddress = useCallback((v: string) => setState((s) => ({ ...s, form: { ...s.form, address: v }, formError: '' })), []);
  const onLat = useCallback((v: string) => setState((s) => ({ ...s, form: { ...s.form, lat: v }, formError: '' })), []);
  const onLon = useCallback((v: string) => setState((s) => ({ ...s, form: { ...s.form, lon: v }, formError: '' })), []);
  const setRadius = useCallback((r: number) => setState((s) => ({ ...s, form: { ...s.form, radius: r } })), []);
  const toggleCat = useCallback(
    (k: keyof FormCategories) =>
      setState((s) => ({ ...s, form: { ...s.form, categories: { ...s.form.categories, [k]: !s.form.categories[k] } } })),
    [],
  );

  const applyTemplate = useCallback((t: SurveyTemplate) => {
    // テンプレートのカテゴリ初期値をフォームへ反映（data_quality は含まない・個別調整可能）。
    setState((s) => ({
      ...s,
      form: { ...s.form, radius: t.radius, categories: { ...t.categories } },
      formError: '',
    }));
  }, []);

  const doRun = useCallback(async (form: FormState, opts: { addressOverride?: string } = {}) => {
    const lat = form.type === 'coord' ? parseFloat(form.lat) : SAMPLE.lat; // address 型は geocode 結果で上書き
    const lon = form.type === 'coord' ? parseFloat(form.lon) : SAMPLE.lon;
    const payload: AnalysisInputForm = {
      type: form.type,
      address: form.address.trim(),
      lat,
      lon,
      radius: form.radius,
      categories: form.categories,
    };

    // 取得ステップを pending で初期化（部分結果表示）。新規実行は未保存にリセット。
    // 地図キャプチャ（Issue #274）も前回地点の古い画像が混入しないようリセットする。
    const steps: FetchStep[] = STEP_DEFS.map((d) => ({ key: d.key, name: d.name, status: 'pending' }));
    setState((s) => ({ ...s, running: true, formError: '', fetchSteps: steps, features: { roads: [], water: [], facilities: [] }, currentSaved: false, mapCapture: null, captureHazardLayers: false }));

    const onStep = (key: SourceKey, status: FetchStep['status']) => {
      setState((s) => ({ ...s, fetchSteps: s.fetchSteps.map((x) => (x.key === key ? { ...x, status } : x)) }));
    };

    let outcome: Awaited<ReturnType<typeof runAnalysis>>;
    try {
      outcome = await runAnalysis(payload, { onStep });
    } catch {
      // runAnalysis が outcome.error ではなく例外を投げた場合も running を解除し UI を復帰させる。
      setState((s) => ({ ...s, running: false, formError: '予期しないエラーが発生しました。', screen: 'input' }));
      return;
    }

    if (outcome.error || !outcome.result) {
      setState((s) => ({ ...s, running: false, formError: outcome.error || '取得に失敗しました。', screen: 'input' }));
      return;
    }

    const { location, findings, logs, features } = outcome.result;
    // 案件起点の実行では案件名・所在地を地点ラベルに使う。
    const finalLocation = opts.addressOverride ? { ...location, address: opts.addressOverride } : location;
    // 住所入力で実行した場合は、入力住所を履歴（最近の住所）へ記録する（評価書 #11）。
    if (form.type === 'address') rememberAddress(form.address);
    setState((s) => ({
      ...s,
      running: false,
      ranOnce: true,
      screen: 'analysis',
      location: finalLocation,
      findings,
      logs,
      features,
      fetchedAt: nowStamp(),
      memoText: '', // 新規メモは再生成
      categoryFilter: 'all',
    }));
  }, []);

  const toggleTheme = useCallback(() => {
    setState((s) => {
      const theme: Theme = s.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        /* 保存不可でも UI 上の切替は継続 */
      }
      return { ...s, theme };
    });
  }, []);

  const openCase = useCallback(
    (c: CaseRecord) => {
      // 本番データ案件で結果スナップショットを持つ場合は、再取得せず復元表示する。
      if (c.findings && c.location) {
        setState((s) => ({
          ...s,
          ranOnce: true,
          screen: 'analysis',
          selectedFinding: null,
          location: c.location!,
          findings: c.findings!,
          logs: c.logs ?? [],
          features: { roads: [], water: [], facilities: [] },
          fetchedAt: c.fetchedAt ?? s.fetchedAt,
          categoryFilter: 'all',
          memoText: '',
          currentSaved: true,
          mapCapture: null, // 復元案件は地図が再構築されるため、前回のキャプチャは破棄（#274）
        }));
        return;
      }
      // ダミー案件（スナップショット無し）は座標で実データ取得する。
      const form: FormState = {
        type: 'coord',
        address: '',
        lat: String(c.lat),
        lon: String(c.lon),
        radius: c.radius,
        categories: { roads: true, rivers: true, hazard: true, terrain: true, weather: true, facilities: true },
      };
      setState((s) => ({ ...s, form }));
      void doRun(form, { addressOverride: `${c.address}（${c.name}）` });
    },
    [doRun],
  );

  // 現在の確認結果を案件として保存。サーバー案件台帳（Issue #111）が有効なら
  // サーバーへ、無効・未到達・権限不足なら既存の localStorage へフォールバックする。
  // 結果は `caseSaveState` に反映される（'server' | 'local' | 'error'）。
  const saveCurrentAsCase = useCallback(() => {
    const s = stateRef.current;
    if (!s.location || !s.ranOnce) return;
    const record = buildCaseFromAnalysis(s.location, s.findings, s.logs, s.fetchedAt);
    void (async () => {
      try {
        const created = await createCase({
          code: record.code,
          name: record.name,
          address: record.address,
          lat: record.lat,
          lon: record.lon,
          radius_m: record.radius,
          counts: record.counts,
          findings: record.findings ?? [],
        });
        patch({ currentSaved: true, caseSaveState: { kind: 'server', code: created.code, id: String(created.id) } });
      } catch {
        // サーバー未有効・オフライン・権限不足 → localStorage へフォールバック。
        const next = addLiveCase(record);
        setState((st) => ({ ...st, liveCases: next, currentSaved: true, caseSaveState: { kind: 'local' } }));
      }
    })();
  }, [patch]);

  const deleteCase = useCallback((id: string) => {
    const next = deleteLiveCase(id);
    setState((s) => ({ ...s, liveCases: next }));
  }, []);

  const importCases = useCallback((json: string): { imported: number } => {
    const { cases, imported } = importLiveCases(json); // 失敗時は throw（呼び出し側で捕捉）
    setState((s) => ({ ...s, liveCases: cases }));
    return { imported };
  }, []);

  const exportCases = useCallback((): string => exportLiveCases(), []);

  const runAnalysisAction = useCallback(() => {
    const form = stateRef.current.form;
    const err = validate(form);
    if (err) {
      patch({ formError: err });
      return;
    }
    void doRun(form);
  }, [doRun, patch]);

  const runSample = useCallback(() => {
    const sampleForm: FormState = { ...stateRef.current.form, type: 'address', address: SAMPLE.address };
    setState((s) => ({ ...s, form: sampleForm }));
    void doRun(sampleForm);
  }, [doRun]);

  // 現在の確認結果（地図・カテゴリ別一覧・AI調査メモ）を破棄し、地点入力からやり直す。
  // liveCases・theme は initialState() 内で localStorage から再読込されるため保持される。
  const clearResult = useCallback(() => {
    setState(() => ({ ...initialState(), screen: 'input' }));
  }, []);

  const setBase = useCallback((b: BaseLayer) => patch({ baseLayer: b }), [patch]);
  const toggleOverlay = useCallback(
    (k: OverlayKey) => setState((s) => ({ ...s, overlays: { ...s.overlays, [k]: !s.overlays[k] } })),
    [],
  );
  const setCategoryFilter = useCallback((k: string) => patch({ categoryFilter: k }), [patch]);

  const openFinding = useCallback((id: string) => patch({ selectedFinding: id }), [patch]);
  const closeFinding = useCallback(() => patch({ selectedFinding: null }), [patch]);

  // MemoScreen から描画中に同期呼び出しされるため（イベントハンドラ経由ではない）、
  // stateRef ではなく state を直接参照する（ref はコミット後の effect でしか
  // 更新されず、描画中に読むと 1 render 分古い値になるため使用不可）。
  const memoTextOrDefault = useCallback(() => {
    if (state.memoText) return state.memoText;
    if (!state.location) return '';
    return buildMemoText(state.location, state.findings);
  }, [state]);

  const toggleMemoEdit = useCallback(() => {
    setState((s) => ({
      ...s,
      memoEditing: !s.memoEditing,
      memoText: s.memoText || (s.location ? buildMemoText(s.location, s.findings) : ''),
    }));
  }, []);
  const onMemoInput = useCallback((v: string) => patch({ memoText: v }), [patch]);
  const regenMemo = useCallback(() => {
    setState((s) => ({ ...s, memoText: s.location ? buildMemoText(s.location, s.findings) : '', memoEditing: false }));
  }, []);

  const setFmt = useCallback((f: 'md' | 'csv') => patch({ reportFormat: f }), [patch]);
  const setVis = useCallback((v: 'internal' | 'public') => patch({ reportVisibility: v }), [patch]);

  const setMapCapture = useCallback((c: MapCaptureResult | null) => patch({ mapCapture: c }), [patch]);
  const setCaptureHazardLayers = useCallback((v: boolean) => patch({ captureHazardLayers: v }), [patch]);

  const testSource = useCallback((key: SourceKey) => {
    setState((s) => ({ ...s, sources: s.sources.map((x) => (x.key === key ? { ...x, _testing: true } : x)) }));
    void pingSource(key).then((res) => {
      setState((s) => ({
        ...s,
        sources: s.sources.map((x) => (x.key === key ? { ...x, _testing: false, stat: res.stat, last: res.last } : x)),
      }));
    });
  }, []);

  return useMemo(
    () => ({
      state,
      toggleTheme,
      openCase,
      saveCurrentAsCase,
      deleteCase,
      importCases,
      exportCases,
      go,
      setType,
      onAddress,
      onLat,
      onLon,
      setRadius,
      toggleCat,
      applyTemplate,
      runAnalysisAction,
      runSample,
      clearResult,
      setBase,
      toggleOverlay,
      setCategoryFilter,
      openFinding,
      closeFinding,
      toggleMemoEdit,
      onMemoInput,
      regenMemo,
      memoTextOrDefault,
      setFmt,
      setVis,
      setMapCapture,
      setCaptureHazardLayers,
      testSource,
    }),
    [
      state,
      toggleTheme,
      openCase,
      saveCurrentAsCase,
      deleteCase,
      importCases,
      exportCases,
      go,
      setType,
      onAddress,
      onLat,
      onLon,
      setRadius,
      toggleCat,
      applyTemplate,
      runAnalysisAction,
      runSample,
      clearResult,
      setBase,
      toggleOverlay,
      setCategoryFilter,
      openFinding,
      closeFinding,
      toggleMemoEdit,
      onMemoInput,
      regenMemo,
      memoTextOrDefault,
      setFmt,
      setVis,
      setMapCapture,
      setCaptureHazardLayers,
      testSource,
    ],
  );
}

const AppContext = createContext<AppController | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const controller = useAppController();
  return <AppContext.Provider value={controller}>{children}</AppContext.Provider>;
}

export function useApp(): AppController {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
