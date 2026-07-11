// server.mjs の HTTP 統合テスト（依存ゼロ・node 標準 lib のみ）。
// smoke-test.mjs（vitest 互換テストのバンドル実行）とは別系統で、実プロセスを起動して
// セキュリティヘッダ・/api リバースプロキシ・既存静的配信の回帰を実測検証する。
//
//   node scripts/server-test.mjs   （npm run test:server）
//
// 構成:
//   - mini-backend（echo サーバ）を起動し、パス・クエリ保持 / healthz 書き換えを検証
//   - server.mjs を 2 インスタンス起動:
//       webUp   … OCSRC_BACKEND_ORIGIN = mini-backend（正常中継・タイムアウト検証）
//       webDown … OCSRC_BACKEND_ORIGIN = 未 listen ポート（502 検証）

import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, '..', 'server.mjs');

let pass = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** 生の path をそのまま送る HTTP リクエスト（fetch は URL 正規化するため使わない）。
 *  headers/body を渡すと中継ヘッダ精製（Content-Length/Content-Type 除去）を検証できる。 */
function request(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((res, rej) => {
    const req = http.request({ host: '127.0.0.1', port, path, method, headers }, (r) => {
      const chunks = [];
      r.on('data', (c) => chunks.push(c));
      r.on('end', () => res({ status: r.statusCode, headers: r.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', rej);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/** OS に空きポートを割り当てさせて返す。 */
function getPort() {
  return new Promise((res, rej) => {
    const s = net.createServer();
    s.once('error', rej);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => res(port));
    });
  });
}

/** server.mjs を起動し、listen ログを待って child を返す。 */
function startWeb(env) {
  return new Promise((res, rej) => {
    const child = spawn(process.execPath, [serverPath], {
      env: { ...process.env, HOST: '127.0.0.1', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => rej(new Error('server start timeout')), 8000);
    child.stdout.on('data', (d) => {
      if (String(d).includes('listening on')) {
        clearTimeout(timer);
        res(child);
      }
    });
    child.stderr.on('data', (d) => process.stderr.write(`[server:${env.PORT}] ${d}`));
    child.on('exit', (code) => {
      clearTimeout(timer);
      rej(new Error(`server exited early (code=${code})`));
    });
  });
}

function assertSecurityHeaders(label, headers) {
  const csp = headers['content-security-policy'] || '';
  check(`${label}: CSP present`, csp.includes("default-src 'self'"), `got: ${csp.slice(0, 60) || '(none)'}`);
  check(`${label}: CSP connect-src covers external APIs`, csp.includes('https://nominatim.openstreetmap.org') && csp.includes('https://www.jma.go.jp'));
  check(`${label}: X-Content-Type-Options`, headers['x-content-type-options'] === 'nosniff');
  check(`${label}: X-Frame-Options`, headers['x-frame-options'] === 'DENY');
  check(`${label}: Referrer-Policy`, headers['referrer-policy'] === 'strict-origin-when-cross-origin');
}

// ---- fixtures ----

const distTmp = await fs.mkdtemp(join(tmpdir(), 'ocsrc-server-test-'));
await fs.mkdir(join(distTmp, 'assets'), { recursive: true });
await fs.writeFile(join(distTmp, 'index.html'), '<!doctype html><title>ocsrc-test</title>ok');
await fs.writeFile(join(distTmp, 'assets', 'app.js'), 'console.log("asset")');

// mini-backend: 受信内容を echo し、/healthz は JSON、/api/slow は無応答（タイムアウト誘発）。
const backend = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', db: 'ok', version: 'test', seenPath: req.url }));
    return;
  }
  if (req.url.startsWith('/api/slow')) return; // never respond
  // あえて web 層と衝突するセキュリティヘッダを返し、上流優先にならない（item 6）ことを検証する。
  // 受信ヘッダを echo し、bodyless 中継で Content-Length/Content-Type が剥がれる（item 7）ことを検証する。
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'X-Upstream': 'mini-backend',
    'X-Frame-Options': 'SAMEORIGIN',
    'Content-Security-Policy': "default-src 'none'",
  });
  res.end(JSON.stringify({ echo: { method: req.method, url: req.url, host: req.headers.host, headers: req.headers } }));
});
const backendPort = await getPort();
await new Promise((res) => backend.listen(backendPort, '127.0.0.1', res));

const webUpPort = await getPort();
const webDownPort = await getPort();
const deadPort = await getPort(); // 取得後 listen しない = backend 停止相当

let webUp, webDown;
try {
  webUp = await startWeb({
    PORT: String(webUpPort),
    DIST: distTmp,
    OCSRC_BACKEND_ORIGIN: `http://127.0.0.1:${backendPort}`,
    OCSRC_PROXY_TIMEOUT_MS: '800',
  });
  webDown = await startWeb({
    PORT: String(webDownPort),
    DIST: distTmp,
    OCSRC_BACKEND_ORIGIN: `http://127.0.0.1:${deadPort}`,
  });

  // ---- 1. セキュリティヘッダ（静的・healthz・405・SPA fallback） ----
  console.log('▶ security headers');
  const rootRes = await request(webUpPort, '/');
  check('GET / is 200 text/html', rootRes.status === 200 && (rootRes.headers['content-type'] || '').includes('text/html'));
  assertSecurityHeaders('GET /', rootRes.headers);

  const hz = await request(webUpPort, '/healthz');
  check('GET /healthz is 200 ok', hz.status === 200 && hz.body === 'ok');
  assertSecurityHeaders('GET /healthz', hz.headers);

  const post = await request(webUpPort, '/', { method: 'POST' });
  check('POST / is 405 with Allow', post.status === 405 && post.headers.allow === 'GET, HEAD');
  assertSecurityHeaders('POST / (405)', post.headers);

  const spa = await request(webUpPort, '/no/such/route');
  check('SPA fallback stays 200 index.html', spa.status === 200 && spa.body.includes('ocsrc-test'));

  const asset = await request(webUpPort, '/assets/app.js');
  check('asset keeps immutable cache', asset.status === 200 && (asset.headers['cache-control'] || '').includes('immutable'));
  assertSecurityHeaders('GET /assets/app.js', asset.headers);

  // ---- 2. /api プロキシ（正常系） ----
  console.log('▶ /api proxy (backend up)');
  const ping = await request(webUpPort, '/api/v1/ping');
  check('GET /api/v1/ping relays 200', ping.status === 200, `status=${ping.status}`);
  check('upstream header passes through', ping.headers['x-upstream'] === 'mini-backend');
  assertSecurityHeaders('GET /api/v1/ping', ping.headers);
  const pingBody = JSON.parse(ping.body);
  check('path preserved', pingBody.echo?.url === '/api/v1/ping', `url=${pingBody.echo?.url}`);
  check('host rewritten to backend', pingBody.echo?.host === `127.0.0.1:${backendPort}`, `host=${pingBody.echo?.host}`);

  const nearby = await request(webUpPort, '/api/v1/nearby?lat=35.6&lon=139.7&radius_m=500');
  const nearbyBody = JSON.parse(nearby.body);
  check('query string preserved', nearbyBody.echo?.url === '/api/v1/nearby?lat=35.6&lon=139.7&radius_m=500', `url=${nearbyBody.echo?.url}`);

  const apiHz = await request(webUpPort, '/api/healthz');
  const apiHzBody = JSON.parse(apiHz.body);
  check('/api/healthz rewritten to backend /healthz', apiHz.status === 200 && apiHzBody.seenPath === '/healthz', `body=${apiHz.body.slice(0, 80)}`);

  const postApi = await request(webUpPort, '/api/v1/ping', { method: 'POST' });
  check('POST /api/* is 405', postApi.status === 405);

  // ---- 2b. /api プロキシ（ヘッダ精製: Issue #43 items 6/7） ----
  console.log('▶ /api proxy (header hygiene)');
  // item 6: 上流が返すセキュリティヘッダは web 層の値で上書きされない（web が常に優先）。
  const hdr = await request(webUpPort, '/api/v1/ping');
  check('item6: web X-Frame-Options DENY wins over upstream SAMEORIGIN', hdr.headers['x-frame-options'] === 'DENY', `got=${hdr.headers['x-frame-options']}`);
  check(
    'item6: web CSP wins over upstream CSP',
    (hdr.headers['content-security-policy'] || '').includes("default-src 'self'") &&
      !(hdr.headers['content-security-policy'] || '').includes("default-src 'none'"),
    `got=${(hdr.headers['content-security-policy'] || '').slice(0, 40)}`,
  );
  check('item6: non-security upstream header still passes through', hdr.headers['x-upstream'] === 'mini-backend');
  // item 7: bodyless 中継では Content-Length / Content-Type を上流へ渡さない。
  // 実アプリの GET/HEAD は本来 body を持たないため、ここも未読 body を作らない well-formed
  // リクエスト（Content-Length: 0 + body なし）で検証する。剥がしは値に依らず効くため、
  // ヘッダが上流へ届かない（echo に現れない）ことを見れば slowloris 増幅も塞げている。
  const entity = await request(webUpPort, '/api/v1/ping', {
    headers: { 'Content-Type': 'application/json', 'Content-Length': '0' },
  });
  check('item7: entity request still relays 200', entity.status === 200, `status=${entity.status}`);
  const seen = JSON.parse(entity.body).echo?.headers || {};
  check('item7: content-length not forwarded to backend', seen['content-length'] === undefined, `got=${seen['content-length']}`);
  check('item7: content-type not forwarded to backend', seen['content-type'] === undefined, `got=${seen['content-type']}`);

  // ---- 3. /api プロキシ（防御系） ----
  console.log('▶ /api proxy (guards)');
  const escape1 = await request(webUpPort, '/api/../healthz');
  check('dot-dot escape is 400', escape1.status === 400, `status=${escape1.status}`);
  const escape2 = await request(webUpPort, '/api/%2e%2e/healthz');
  check('encoded dot-dot escape is 400', escape2.status === 400, `status=${escape2.status}`);

  const slow = await request(webUpPort, '/api/slow');
  check('backend timeout yields 502 JSON', slow.status === 502 && JSON.parse(slow.body).error === 'bad_gateway', `status=${slow.status}`);
  assertSecurityHeaders('GET /api/slow (502)', slow.headers);

  // ---- 4. /api プロキシ（backend 停止時） ----
  console.log('▶ /api proxy (backend down)');
  const down = await request(webDownPort, '/api/v1/ping');
  check('backend down yields 502', down.status === 502, `status=${down.status}`);
  const downBody = JSON.parse(down.body);
  check('502 body is JSON error', downBody.error === 'bad_gateway' && typeof downBody.detail === 'string');
  assertSecurityHeaders('GET /api/v1/ping (down, 502)', down.headers);

  const downStatic = await request(webDownPort, '/');
  check('static serving unaffected by backend down', downStatic.status === 200 && downStatic.body.includes('ocsrc-test'));
} finally {
  webUp?.kill('SIGTERM');
  webDown?.kill('SIGTERM');
  backend.closeAllConnections?.();
  await new Promise((res) => backend.close(res));
  await fs.rm(distTmp, { recursive: true, force: true });
}

console.log(`\nserver-test: ${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.error('failed checks:', failures.join(' / '));
  process.exitCode = 1;
}
