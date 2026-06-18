import type { CSSProperties } from 'react';

// 「prop:val;prop:val」形式のCSS文字列を React の style オブジェクトに変換する。
// デザインモックの動的スタイル文字列（条件で色を切替える等）をそのまま移植するためのヘルパ。
export function cssToStyle(css: string): CSSProperties {
  const obj: Record<string, string> = {};
  css.split(';').forEach((decl) => {
    const idx = decl.indexOf(':');
    if (idx === -1) return;
    const key = decl.slice(0, idx).trim();
    const val = decl.slice(idx + 1).trim();
    if (!key) return;
    const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    obj[camel] = val;
  });
  return obj as CSSProperties;
}
