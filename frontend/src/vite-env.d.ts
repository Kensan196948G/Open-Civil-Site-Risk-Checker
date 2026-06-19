/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** ダミー（サンプル）案件を表示するか（'true' / 'false'）。未指定時は dev=表示 / 本番=非表示。 */
  readonly VITE_SHOW_DUMMY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
