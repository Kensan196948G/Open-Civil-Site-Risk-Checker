// vitest 互換の極小テストハーネス（esbuild スモーク用）。
// この環境は仮想メモリ ulimit（20GB）制約により Vite ベースの vitest が WASM 確保で
// 起動できないため、同一のテストファイル（import { describe, it, expect } from 'vitest'）を
// esbuild でバンドルし、本 shim を 'vitest' に alias して node 上で逐次実行する。
// CI（GitHub Actions・ulimit 制約なし）では本物の vitest が同じテストを実行する。

const suites = [];
let current = null;

export function describe(name, fn) {
  const prev = current;
  current = { name, tests: [] };
  suites.push(current);
  const result = fn();
  // 本 shim は同期 describe のみ対応。async コールバックは it 登録が current 復元後に
  // ずれて誤ったスイートへ入るため、早期に検知して失敗させる。
  if (result && typeof result.then === 'function') {
    throw new Error(`describe('${name}') callback must be synchronous (smoke shim limitation)`);
  }
  current = prev;
}

export function it(name, fn) {
  if (!current) {
    current = { name: '(root)', tests: [] };
    suites.push(current);
  }
  current.tests.push({ name, fn });
}
export const test = it;

function fmt(v) {
  if (typeof v === 'string') return JSON.stringify(v);
  if (v === null) return 'null';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

function deepEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual(a[k], b[k]));
}

function makeMatchers(received, negate) {
  const check = (pass, msg) => {
    const ok = negate ? !pass : pass;
    if (!ok) throw new Error(`expect(${fmt(received)})${negate ? '.not' : ''} ${msg}`);
  };
  return {
    toBe: (exp) => check(Object.is(received, exp), `toBe(${fmt(exp)})`),
    toEqual: (exp) => check(deepEqual(received, exp), `toEqual(${fmt(exp)})`),
    toBeTruthy: () => check(!!received, 'toBeTruthy()'),
    toBeFalsy: () => check(!received, 'toBeFalsy()'),
    toBeNull: () => check(received === null, 'toBeNull()'),
    toBeUndefined: () => check(received === undefined, 'toBeUndefined()'),
    toBeGreaterThan: (n) => check(received > n, `toBeGreaterThan(${fmt(n)})`),
    toBeGreaterThanOrEqual: (n) => check(received >= n, `toBeGreaterThanOrEqual(${fmt(n)})`),
    toBeLessThan: (n) => check(received < n, `toBeLessThan(${fmt(n)})`),
    toBeLessThanOrEqual: (n) => check(received <= n, `toBeLessThanOrEqual(${fmt(n)})`),
    toBeCloseTo: (n, digits = 2) =>
      check(Math.abs(received - n) < 0.5 * 10 ** -digits, `toBeCloseTo(${fmt(n)}, ${digits})`),
    toContain: (sub) => {
      const pass =
        typeof received === 'string' ? received.includes(sub) : Array.isArray(received) && received.includes(sub);
      check(pass, `toContain(${fmt(sub)})`);
    },
    toMatch: (re) => {
      const pass = typeof received === 'string' && re.test(received);
      check(pass, `toMatch(${fmt(String(re))})`);
    },
    toHaveLength: (n) => check(received != null && received.length === n, `toHaveLength(${fmt(n)})`),
  };
}

export function expect(received) {
  const m = makeMatchers(received, false);
  m.not = makeMatchers(received, true);
  return m;
}

export async function runAll() {
  let pass = 0;
  let fail = 0;
  const failures = [];
  for (const suite of suites) {
    for (const t of suite.tests) {
      try {
        await t.fn();
        pass += 1;
      } catch (err) {
        fail += 1;
        failures.push(`✘ ${suite.name} › ${t.name}\n    ${err.message}`);
      }
    }
  }
  const total = pass + fail;
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error('');
  }
  console.log(`${fail ? '✘' : '✔'} smoke tests: ${pass}/${total} passed${fail ? `, ${fail} failed` : ''}`);
  return { pass, fail, total };
}
