// RBAC 権限マトリクス（Issue #111・案件台帳のロール定義を可視化する）。
// backend（app/cases.py）の ROLE_PRIORITY / role_has / 承認WF と整合させる。
// 表示専用（ロール割当はサーバー側 OCSRC_CASE_*_USERS 環境変数で行う）。

export type CaseRole = 'viewer' | 'auditor' | 'editor' | 'approver' | 'admin';

// backend の ROLE_PRIORITY と同一（上位は下位の権限を含む）。
export const ROLE_PRIORITY: Record<CaseRole, number> = {
  viewer: 0,
  auditor: 1,
  editor: 2,
  approver: 3,
  admin: 4,
};

export const ROLE_LABEL: Record<CaseRole, string> = {
  viewer: '閲覧者',
  auditor: '監査者',
  editor: '編集者',
  approver: '承認者',
  admin: '管理者',
};

export const ROLE_DESC: Record<CaseRole, string> = {
  viewer: '案件一覧・詳細の閲覧のみ',
  auditor: '閲覧 + 監査ログ閲覧',
  editor: '閲覧 + 案件作成・更新・承認申請',
  approver: '編集 + 案件承認',
  admin: '全操作（削除・approved 更新含む）',
};

/** 案件台帳の操作（権限マトリクスの行）。 */
export type CaseAction =
  | 'view_case'
  | 'create_case'
  | 'update_case'
  | 'delete_case'
  | 'submit_case'
  | 'approve_case'
  | 'view_audit';

export const ACTION_LABEL: Record<CaseAction, string> = {
  view_case: '案件閲覧',
  create_case: '案件作成',
  update_case: '案件更新',
  delete_case: '案件削除',
  submit_case: '承認申請（draft→submitted）',
  approve_case: '承認（submitted→approved）',
  view_audit: '監査ログ閲覧',
};

// 各操作に必要な最低ロール（backend の _require と整合）。
const ACTION_REQUIRED: Record<CaseAction, CaseRole> = {
  view_case: 'viewer',
  create_case: 'editor',
  update_case: 'editor',
  delete_case: 'admin',
  submit_case: 'editor',
  approve_case: 'approver',
  view_audit: 'auditor',
};

/** ロールが操作を実行できるか（backend の role_has と同一ロジック）。 */
export function can(role: CaseRole, action: CaseAction): boolean {
  const required = ACTION_REQUIRED[action];
  return ROLE_PRIORITY[role] >= ROLE_PRIORITY[required];
}

export const ALL_ACTIONS: CaseAction[] = [
  'view_case',
  'create_case',
  'update_case',
  'submit_case',
  'approve_case',
  'delete_case',
  'view_audit',
];

export const ALL_ROLES: CaseRole[] = ['viewer', 'auditor', 'editor', 'approver', 'admin'];

/** 権限マトリクス（行=操作・列=ロール・セル=可否）を返す。 */
export function buildMatrix(): Record<CaseAction, Record<CaseRole, boolean>> {
  const matrix = {} as Record<CaseAction, Record<CaseRole, boolean>>;
  for (const action of ALL_ACTIONS) {
    matrix[action] = {} as Record<CaseRole, boolean>;
    for (const role of ALL_ROLES) {
      matrix[action][role] = can(role, action);
    }
  }
  return matrix;
}

/** ダミー用のロール割当例（デモ表示・実在情報を含まない）。 */
export const DEMO_ROLE_ASSIGNMENTS: { role: CaseRole; users: string[] }[] = [
  { role: 'admin', users: ['admin@example.com'] },
  { role: 'approver', users: ['approver@example.com'] },
  { role: 'editor', users: ['editor@example.com'] },
  { role: 'auditor', users: ['auditor@example.com'] },
  { role: 'viewer', users: ['（未割当ユーザーはすべて viewer）'] },
];
