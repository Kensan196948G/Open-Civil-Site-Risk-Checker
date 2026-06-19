// 依存ゼロの本番用静的配信サーバ。Vite ビルド成果物（dist/）を 0.0.0.0 で配信する。
// systemd / Docker から `node server.mjs` で起動する想定。
//
//   PORT  待ち受けポート（既定 8700）
//   HOST  バインドアドレス（既定 0.0.0.0 = 自動割当 IP を含む全 IF で到達可能）
//   DIST  配信ディレクトリ（既定 ./dist）

import http from 'node:http';
import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8700;
const HOST = process.env.HOST || '0.0.0.0';
const DIST = path.resolve(process.env.DIST || path.join(__dirname, 'dist'));
// 範囲判定はセパレータ境界で行い、兄弟ディレクトリ（例: dist-secret）への前方一致誤検知を防ぐ。
const DIST_PREFIX = DIST.endsWith(path.sep) ? DIST : DIST + path.sep;
// 配信ルートの実体パス（シンボリックリンク解決済み）。realpath 検証の基準にする。
const DIST_REAL = await fs.realpath(DIST).catch(() => DIST);
const ROOT_PREFIX = DIST_REAL.endsWith(path.sep) ? DIST_REAL : DIST_REAL + path.sep;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
};

const INDEX = path.join(DIST, 'index.html');

/** リクエストパスを dist 内の実ファイルへ安全に解決する（パストラバーサル防止）。 */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let target = path.join(DIST, rel);
  // 範囲外アクセス（セパレータ境界で判定）は index へ。
  if (target !== DIST && !target.startsWith(DIST_PREFIX)) return INDEX;
  try {
    const st = await fs.stat(target);
    if (st.isDirectory()) target = path.join(target, 'index.html');
    await fs.access(target);
    // シンボリックリンク経由の dist 外脱出を realpath で遮断（defense-in-depth）。
    const real = await fs.realpath(target);
    if (real !== DIST_REAL && !real.startsWith(ROOT_PREFIX)) return INDEX;
    return target;
  } catch {
    // 見つからない場合は SPA フォールバックとして index.html を返す。
    return INDEX;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    if (req.url === '/healthz') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    const file = await resolveFile(req.url || '/');
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // ハッシュ付きアセットは長期キャッシュ、HTML は都度検証。
    const cache = /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
    const stat = await fs.stat(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache, 'Content-Length': stat.size });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Internal Server Error');
    console.error('[ocsrc-web] request error:', err);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[ocsrc-web] serving ${DIST}`);
  console.log(`[ocsrc-web] listening on http://${HOST}:${PORT}/`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[ocsrc-web] received ${sig}, shutting down`);
    server.close(() => process.exit(0));
  });
}
