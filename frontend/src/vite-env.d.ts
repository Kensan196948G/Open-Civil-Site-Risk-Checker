/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ダミー（サンプル）案件を表示するか（'true' / 'false'）。未指定時は dev=表示 / 本番=非表示。 */
  readonly VITE_SHOW_DUMMY?: string;
  /** Phase 2 バックエンド（FastAPI + PostGIS）の base URL。未設定時は KSJ 未連携扱い。 */
  readonly VITE_OCSRC_BACKEND_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
