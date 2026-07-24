// esbuild スモークテストランナー。
// src/**/*.test.ts を集め、'vitest' を scripts/smoke/shim.mjs に alias して esbuild で
// 単一 ESM バンドルへ束ね、node 上で逐次実行する。Vite/WASM を介さないため、仮想メモリ
// ulimit 制約のある環境でもテストロジックを実際に検証できる（CI では本物の vitest を使用）。
//
//   node scripts/smoke-test.mjs
//
import { build } from 'esbuild';
import { readdir, readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join, resolve, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const srcDir = join(root, 'src');
const shimPath = join(__dirname, 'smoke', 'shim.mjs');

// shim.mjs が実装する 'vitest' 互換 export 一覧（vi 等のモック API は未実装）。
// 全テストを 1 バンドルにまとめる都合上、1 ファイルでも shim 非対応の named import が
// あるとバンドル全体がビルドエラーで止まり、他の全テストのローカル検証を道連れにする。
// そのため事前に検出してスキップする（CI では本物の vitest がこれらも実行する）。
const SHIM_EXPORTS = new Set(['describe', 'it', 'test', 'expect']);

/** src 配下の *.test.ts を再帰列挙する。 */
async function findTests(dir) {
  const out = [];
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...(await findTests(p)));
    else if (ent.name.endsWith('.test.ts')) out.push(p);
  }
  return out;
}

/** `import { a, b as c } from 'vitest'` から named import 名一覧を抽出する。
 * import 宣言が複数行に分かれていても全宣言を走査する。 */
function vitestImportNames(src) {
  return [...src.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]vitest['"]/g)]
    .flatMap((m) => m[1].split(','))
    .map((s) => s.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

const allTests = (await findTests(srcDir)).sort();
if (!allTests.length) {
  console.error('no *.test.ts found under src/');
  process.exit(1);
}

const tests = [];
const skipped = [];
for (const file of allTests) {
  const src = await readFile(file, 'utf8');
  const unsupported = vitestImportNames(src).filter((n) => !SHIM_EXPORTS.has(n));
  if (unsupported.length) skipped.push({ file, unsupported });
  else tests.push(file);
}

if (skipped.length) {
  console.log(`⚠ smoke: skipping ${skipped.length} file(s) using shim-unsupported vitest API (CI runs these via real vitest):`);
  for (const s of skipped) console.log(`  • ${relative(root, s.file)}: ${s.unsupported.join(', ')}`);
}
if (!tests.length) {
  console.error('no smoke-runnable *.test.ts left after skipping shim-unsupported files');
  process.exit(1);
}

// 全テストを import してから runAll() を呼ぶエントリを生成。
const imports = tests.map((t, i) => `import * as t${i} from ${JSON.stringify(t)};`).join('\n');
const entry = `${imports}
import { runAll } from ${JSON.stringify(shimPath)};
const r = await runAll();
if (r.fail > 0) process.exitCode = 1;
`;

const tmp = await mkdtemp(join(tmpdir(), 'ocsrc-smoke-'));
const entryFile = join(tmp, 'entry.mjs');
const outFile = join(tmp, 'bundle.mjs');
await writeFile(entryFile, entry, 'utf8');

try {
  await build({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'esm',
    // CI（actions: node 22）/ Dockerfile（node:22-alpine）の実行環境に揃える。
    target: 'node22',
    sourcemap: 'inline',
    logLevel: 'warning',
    // テストファイルの `from 'vitest'` を極小 shim へ差し替える。
    alias: { vitest: shimPath },
  });
  console.log(`▶ smoke: bundled ${tests.length} test file(s)`);
  for (const t of tests) console.log(`  • ${relative(root, t)}`);
  await import(pathToFileURL(outFile).href);
} finally {
  await rm(tmp, { recursive: true, force: true });
}
