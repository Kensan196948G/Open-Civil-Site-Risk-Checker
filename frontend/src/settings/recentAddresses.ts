// 住所履歴（評価書 #11 の一部・最近使った住所のクイック選択）。
// 直近の住所入力を localStorage に保存し、入力画面でワンクリック再入力できるようにする。
// パース・追加・丸めは純粋関数（単体テスト対象）。localStorage は取得/保存時に try/catch。

const KEY = 'ocsrc-recent-addresses';
export const MAX_RECENT_ADDRESSES = 5;

/** 履歴をパースする（純粋・不正 JSON・非文字列・空文字は除外）。 */
export function parseRecentAddresses(json: string | null): string[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
      .slice(0, MAX_RECENT_ADDRESSES);
  } catch {
    return [];
  }
}

/** 新しい住所を先頭に追加し、重複を除いて最大件数に丸める（純粋）。 */
export function pushRecentAddress(list: string[], address: string): string[] {
  const trimmed = address.trim();
  if (!trimmed) return list;
  return [trimmed, ...list.filter((a) => a !== trimmed)].slice(0, MAX_RECENT_ADDRESSES);
}

/** 保存済みの履歴を読み込む（localStorage 不可環境は空リスト）。 */
export function loadRecentAddresses(): string[] {
  try {
    return parseRecentAddresses(localStorage.getItem(KEY));
  } catch {
    return [];
  }
}

/** 履歴を保存する（localStorage 不可環境は無視）。 */
export function saveRecentAddresses(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_RECENT_ADDRESSES)));
  } catch {
    /* localStorage 不可環境は保存しない */
  }
}

/** 住所入力を履歴へ記録する（ユーザーが入力した住所のみ・空は無視）。 */
export function rememberAddress(address: string): void {
  if (!address.trim()) return;
  saveRecentAddresses(pushRecentAddress(loadRecentAddresses(), address));
}
