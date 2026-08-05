// 依存ゼロの本番用静的配信サーバ。Vite ビルド成果物（dist/）を 0.0.0.0 で配信し、
// /api/* を同一オリジンでバックエンド（FastAPI）へ中継する。
// systemd / Docker から `node server.mjs` で起動する想定。
//
//   PORT                   待ち受けポート（既定 8700）
//   HOST                   バインドアドレス（既定 0.0.0.0 = 自動割当 IP を含む全 IF で到達可能）
//   DIST                   配信ディレクトリ（既定 ./dist）
//   OCSRC_BACKEND_ORIGIN   /api/* の中継先バックエンド（既定 http://127.0.0.1:8000）
//   OCSRC_PROXY_TIMEOUT_MS 中継のアイドルタイムアウト ms（既定 10000）
//   OCSRC_ACCESS_TEAM_DOMAIN / OCSRC_ACCESS_AUD
//                          Cloudflare Access（Zero Trust）による認証。前者はチーム
//                          ドメイン（例 yourteam.cloudflareaccess.com）、後者は Access
//                          アプリの AUD タグ。両方設定で有効。未設定のまま Tunnel 経由で
//                          到達すると 503（Issue #70）。共有パスワードは持たない。
//   OCSRC_ACCESS_CERTS_URL （任意）JWKS 取得先の上書き。既定はチームドメインの標準
//                          エンドポイント。テスト用のローカルモック差し替えに使う。

import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
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

// ---- セキュリティヘッダ（全レスポンスへ付与。静的・プロキシ・エラー応答を含む） ----
// CSP 許可リストは src/ と index.html が実際に参照する外部オリジンの列挙に基づく
// （`grep -rhoE "https?://[a-zA-Z0-9._-]+" src index.html | sort -u` で棚卸し）。
// 外部 API・タイルを追加したら必ずここも更新すること。
const CSP = [
  "default-src 'self'",
  // Vite バンドル JS のみ。inline script は index.html に存在しない。
  "script-src 'self'",
  // React の style prop / Leaflet の動的 style（unsafe-inline）+ Google Fonts CSS（index.html <link>）。
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  // Google Fonts ウェブフォント（Noto Sans JP / JetBrains Mono）。
  "font-src 'self' https://fonts.gstatic.com",
  // 地理院タイル（pale/std/seamlessphoto/hillshade）+ ハザードマップタイル
  // （SiteMap.tsx の L.tileLayer / ping.ts の imageProbe）。data: は Vite の小画像インライン化用。
  "img-src 'self' data: https://cyberjapandata.gsi.go.jp https://disaportaldata.gsi.go.jp",
  // fetch 先: 'self'（/api 同一オリジンプロキシ）/ 127.0.0.1:8000（同一マシンでのバックエンド直結既定値）/
  // Nominatim（ジオコーディング）/ Open-Meteo（降水・標高）/ GSI 標高 API / Overpass（OSM）/
  // 気象庁（警報・注意報）。Anthropic はサーバー側ブローカー経由のためブラウザ直結は不要（外部評価 Phase 0）。
  "connect-src 'self' http://127.0.0.1:8000 https://nominatim.openstreetmap.org https://api.open-meteo.com https://cyberjapandata2.gsi.go.jp https://overpass-api.de https://www.jma.go.jp",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

// ---- Cloudflare Access（Zero Trust）による認証（Issue #70・要件 §11.3.1） ----
// Tunnel 判定は cf-connecting-ip ヘッダの有無。cloudflared は必ず付与する一方、
// LAN 内クライアントが偽装付与しても「認証が余計に要求される」方向にしか働かず、
// 認証バイパスには使えない（fail-secure）。LAN 直アクセスの挙動は従来どおり。
//
// 認証は共有パスワードを持たず、Cloudflare Access がエッジで発行する JWT
// （Cf-Access-Jwt-Assertion）を検証する。誰を許可するかは Access アプリのポリシー
// （メール / OTP / IdP）で管理する。エッジで未認証は弾かれるため通常 origin には
// 有効 JWT 付きリクエストしか届かないが、多層防御として origin でも JWT を検証する。
const ACCESS_TEAM_DOMAIN = (process.env.OCSRC_ACCESS_TEAM_DOMAIN || '')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');
const ACCESS_AUD = process.env.OCSRC_ACCESS_AUD || '';
const ACCESS_ENABLED = ACCESS_TEAM_DOMAIN !== '' && ACCESS_AUD !== '';
const ACCESS_ISSUER = ACCESS_TEAM_DOMAIN ? `https://${ACCESS_TEAM_DOMAIN}` : '';
// JWKS（署名検証用の公開鍵集合）取得先。既定はチームドメインの標準エンドポイント。
// テスト用にローカルモックへ差し替えられるよう env で上書き可能（値は運用者が設定）。
const ACCESS_CERTS_URL =
  process.env.OCSRC_ACCESS_CERTS_URL ||
  (ACCESS_TEAM_DOMAIN ? `https://${ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs` : '');

// 認証失敗レート制限: IP 別の固定窓カウンタ。窓内で上限回失敗すると 429 を返す。
// Map は上限件数で頭打ちにし、溢れたら最古の窓を追い出す（メモリ無限成長の防止）。
const AUTH_FAIL_WINDOW_MS = 60_000;
const AUTH_FAIL_LIMIT = 10;
const AUTH_FAIL_MAX_ENTRIES = 1000;
const authFailures = new Map();

function authRateLimited(ip) {
  const entry = authFailures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > AUTH_FAIL_WINDOW_MS) {
    authFailures.delete(ip);
    return false;
  }
  return entry.count >= AUTH_FAIL_LIMIT;
}

function recordAuthFailure(ip) {
  const now = Date.now();
  const entry = authFailures.get(ip);
  if (entry && now - entry.windowStart <= AUTH_FAIL_WINDOW_MS) {
    entry.count += 1;
    return;
  }
  if (!authFailures.has(ip) && authFailures.size >= AUTH_FAIL_MAX_ENTRIES) {
    let oldestKey;
    let oldestStart = Infinity;
    for (const [key, value] of authFailures) {
      if (value.windowStart < oldestStart) {
        oldestStart = value.windowStart;
        oldestKey = key;
      }
    }
    if (oldestKey !== undefined) authFailures.delete(oldestKey);
  }
  authFailures.set(ip, { count: 1, windowStart: now });
}

// JWKS（Access の署名公開鍵）キャッシュ。TTL 内は再取得しない。kid 不明時は
// 鍵ローテーション対応で再取得するが、不正 kid の連打による再取得洪水を防ぐため
// 最小再取得間隔を設ける。
let jwks = { keys: new Map(), fetchedAt: 0 };
let jwksRefetchAt = 0;
const JWKS_TTL_MS = 3_600_000; // 1h
const JWKS_MIN_REFETCH_MS = 60_000;

/** URL から JSON を GET する（JWKS 取得用・タイムアウト付き）。 */
function fetchJson(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const mod = u.protocol === 'https:' ? https : http;
    const rq = mod.get(u, { timeout: timeoutMs }, (rs) => {
      if (rs.statusCode !== 200) {
        rs.resume();
        reject(new Error(`certs endpoint returned ${rs.statusCode}`));
        return;
      }
      const chunks = [];
      rs.on('data', (c) => chunks.push(c));
      rs.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch (e) {
          reject(e);
        }
      });
    });
    rq.on('timeout', () => rq.destroy(new Error('certs fetch timeout')));
    rq.on('error', reject);
  });
}

/** kid に対応する署名検証用の公開鍵を返す（無ければ null）。 */
async function getSigningKey(kid) {
  const now = Date.now();
  const fresh = now - jwks.fetchedAt < JWKS_TTL_MS;
  if (jwks.keys.has(kid) && fresh) return jwks.keys.get(kid);
  // 再取得が必要。ただし直近に取得済みなら最小間隔まで待つ（連打対策）。
  if (jwks.fetchedAt !== 0 && now - jwksRefetchAt < JWKS_MIN_REFETCH_MS) {
    return jwks.keys.get(kid) || null;
  }
  jwksRefetchAt = now;
  const body = await fetchJson(ACCESS_CERTS_URL);
  const keys = new Map();
  for (const jwk of body.keys || []) {
    try {
      keys.set(jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' }));
    } catch {
      /* 不正な JWK はスキップ */
    }
  }
  jwks = { keys, fetchedAt: now };
  return keys.get(kid) || null;
}

/** Cloudflare Access JWT を検証する（署名・aud・iss・exp）。
 *  戻り値は 'valid'（有効）/ 'invalid'（確定的に無効）/ 'unavailable'（JWKS 取得失敗で
 *  検証不能・一時的）の 3 値。いずれも「拒否」は同じだが、呼び出し側で 403（無効・失敗記録）
 *  と 503（一時障害・Retry-After・失敗記録なし）を区別するために分ける。 */
async function verifyAccessJwt(token) {
  if (typeof token !== 'string' || token === '') return 'invalid';
  const parts = token.split('.');
  if (parts.length !== 3) return 'invalid';
  let header, payload;
  try {
    header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return 'invalid';
  }
  if (header.alg !== 'RS256' || typeof header.kid !== 'string') return 'invalid';
  // aud はアプリ固有の AUD タグ（文字列 or 配列）。当該アプリ向けのみ受理する。
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(ACCESS_AUD)) return 'invalid';
  // iss はチームドメイン。別テナントのトークンを弾く。
  if (payload.iss !== ACCESS_ISSUER) return 'invalid';
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp <= now) return 'invalid';
  // iat/nbf は軽微なクロックスキュー（60s）を許容する。
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return 'invalid';
  if (typeof payload.iat === 'number' && payload.iat > now + 60) return 'invalid';
  let key;
  try {
    key = await getSigningKey(header.kid);
  } catch {
    // JWKS 取得失敗は「検証不能（一時的）」。有効トークンのユーザを 403 で締め出さない。
    return 'unavailable';
  }
  // kid が取得済み JWKS に無い場合は確定的に無効（攻撃者 kid・非対応鍵）。
  if (!key) return 'invalid';
  const signed = Buffer.from(`${parts[0]}.${parts[1]}`);
  let sig;
  try {
    sig = Buffer.from(parts[2], 'base64url');
  } catch {
    return 'invalid';
  }
  try {
    return crypto.verify('RSA-SHA256', signed, key, sig) ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
}

/** Tunnel 経由リクエストの認証ゲート。true = 続行可、false = 応答送出済み。
 *  /healthz のみ除外（秘匿情報を含まず、公開経路の死活監視に使うため）。 */
async function checkTunnelAuth(req, res) {
  const connectingIp = req.headers['cf-connecting-ip'];
  if (connectingIp === undefined) return true; // LAN 直アクセス
  // healthz 除外は実ハンドラ（req.url === '/healthz' の完全一致）と条件を揃える。
  // query を剥がして判定すると /healthz?x が「除外されるが healthz ハンドラには
  // 一致せず SPA fallback へ流れる」経路になり、未認証で index.html が漏れる。
  if (req.url === '/healthz') return true;

  const deny = (status, headers, message) => {
    res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
    res.end(message);
    return false;
  };
  if (!ACCESS_ENABLED) {
    // Access 未設定のまま公開経路から到達した場合は塞ぐ（設定漏れ事故の防止）。
    return deny(503, { 'Content-Type': 'text/plain; charset=utf-8' }, 'access control is not configured');
  }
  const ip = String(connectingIp);
  if (authRateLimited(ip)) {
    return deny(429, { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '60' }, 'too many failed authorization attempts');
  }
  // Cloudflare Access がエッジで付与する JWT を検証する。通常は未認証がエッジで
  // 弾かれるため有効 JWT が届くが、多層防御として origin でも必須にする。
  const result = await verifyAccessJwt(req.headers['cf-access-jwt-assertion']);
  if (result === 'valid') return true;
  if (result === 'unavailable') {
    // JWKS 取得失敗（一時障害）。有効トークンかもしれないので失敗記録せず 503 で再試行を促す。
    return deny(
      503,
      { 'Content-Type': 'text/plain; charset=utf-8', 'Retry-After': '30' },
      'access verification temporarily unavailable',
    );
  }
  // 確定的に無効なトークン（署名・claim 不正・欠如）は失敗記録のうえ 403。
  recordAuthFailure(ip);
  return deny(
    403,
    { 'Content-Type': 'text/plain; charset=utf-8' },
    'forbidden: a valid Cloudflare Access session is required',
  );
}

// ---- /api リバースプロキシ（same-origin 化。SSRF 防止のため転送先は env 固定オリジンのみ） ----
const BACKEND_ORIGIN = new URL(process.env.OCSRC_BACKEND_ORIGIN || 'http://127.0.0.1:8000');
if (BACKEND_ORIGIN.protocol !== 'http:' && BACKEND_ORIGIN.protocol !== 'https:') {
  throw new Error(`OCSRC_BACKEND_ORIGIN must be http(s), got: ${BACKEND_ORIGIN.href}`);
}
const PROXY_TIMEOUT_MS = Number(process.env.OCSRC_PROXY_TIMEOUT_MS) || 10_000;
// hop-by-hop ヘッダ（RFC 9110 §7.6.1）+ host。中継せず接続ごとに付け直す。
const DROP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
]);
// リクエスト方向の追加除去: GET/HEAD のみ中継し body を転送しないため、エンティティ
// ヘッダを落とす。クライアントが送った過大な Content-Length を残すとバックエンドが
// 到着しない body を待ってソケットを PROXY_TIMEOUT_MS まで保持し得る（軽微な slowloris 増幅）。
// authorization / cf-access-jwt-assertion / cookie は web 層（Access 認証）で消費する
// 資格情報のためバックエンドへ渡さない（backend は検証も cookie 利用もしない・秘匿情報の
// 最小伝播）。cookie には Access セッション（CF_Authorization）が載るため必ず落とす。
const DROP_REQUEST_HEADERS = new Set([
  ...DROP_HEADERS,
  'content-length',
  'content-type',
  'authorization',
  'cf-access-jwt-assertion',
  'cookie',
]);
// レスポンス方向の追加除去: web 層が全応答へ付与するセキュリティヘッダは上流の値で
// 上書きさせない（writeHead はマージ時に自身の引数を優先するため、上流が同名ヘッダを
// 返すと setHeader 済みの値が負ける）。将来 backend が独自ヘッダを返しても web 層が優先。
const SECURITY_HEADER_NAMES = new Set(Object.keys(SECURITY_HEADERS).map((h) => h.toLowerCase()));
const DROP_RESPONSE_HEADERS = new Set([...DROP_HEADERS, ...SECURITY_HEADER_NAMES]);

/** drop 集合に含まれないヘッダだけをコピーして返す（リクエスト・レスポンス両方向で使用）。 */
function pickHeaders(raw, drop) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v !== undefined && !drop.has(k.toLowerCase())) out[k] = v;
  }
  return out;
}

/** プロキシ系エラーを JSON で返す（ヘッダ送出済みなら接続破棄のみ）。 */
function sendProxyError(res, status, error, detail) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ error, detail }));
}

/** /api/* をバックエンドへ中継する（GET/HEAD を基本とし、/api/v1/ai/* のみ POST 可）。
 *  運用特例: /api/healthz → /healthz、/api/livez → /livez、/api/readyz → /readyz へ
 *  書き換え、プロキシ越しに API の健全性（DB 到達性含む）を確認できるようにする。 */
function proxyApi(req, res) {
  let target;
  try {
    // req.url は origin-form（'/'始まり）なので、結合結果のオリジンは常に BACKEND_ORIGIN。
    target = new URL(req.url, BACKEND_ORIGIN);
  } catch {
    sendProxyError(res, 400, 'bad_request', 'invalid request url');
    return;
  }
  // URL 正規化（../ 解決）後も /api 配下に留まることを再検証し、
  // %2e%2e 等の遅延デコードによる配下脱出も拒否する（defense-in-depth）。
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(target.pathname);
  } catch {
    sendProxyError(res, 400, 'bad_request', 'malformed percent-encoding in path');
    return;
  }
  const inApi = decodedPath === '/api' || decodedPath.startsWith('/api/');
  if (!inApi || decodedPath.split('/').includes('..')) {
    sendProxyError(res, 400, 'bad_request', 'proxy path must stay under /api/');
    return;
  }
  const healthRewrite = {
    '/api/healthz': '/healthz',
    '/api/livez': '/livez',
    '/api/readyz': '/readyz',
  };
  if (healthRewrite[target.pathname]) target.pathname = healthRewrite[target.pathname];

  // AI ブローカー（POST /api/v1/ai/*）のみボディ付きリクエストを許容する。
  const isAiPost = req.method === 'POST' && (decodedPath === '/api/v1/ai' || decodedPath.startsWith('/api/v1/ai/'));
  if (req.method === 'POST' && !isAiPost) {
    sendProxyError(res, 405, 'method_not_allowed', 'POST is only allowed for /api/v1/ai/*');
    return;
  }

  const mod = target.protocol === 'https:' ? https : http;
  const doForward = (headers) => {
    const upstream = mod.request(
      target,
      { method: req.method, headers, timeout: PROXY_TIMEOUT_MS },
      (up) => {
        res.writeHead(up.statusCode || 502, pickHeaders(up.headers, DROP_RESPONSE_HEADERS));
        up.pipe(res);
      },
    );
    // アイドルタイムアウトは destroy でエラー経路（502）へ集約する。
    upstream.on('timeout', () => upstream.destroy(new Error(`backend timeout (${PROXY_TIMEOUT_MS}ms)`)));
    upstream.on('error', (err) => {
      console.error('[ocsrc-web] proxy error:', err.message);
      sendProxyError(res, 502, 'bad_gateway', `backend unreachable (${BACKEND_ORIGIN.origin})`);
    });
    // クライアント切断時は上流リクエストも打ち切る。
    res.on('close', () => upstream.destroy());
    return upstream;
  };

  if (req.method === 'POST') {
    // ボディは 64KB 上限（AI プロンプト用途の最小限）。content-type のみ保持し、
    // 資格情報系ヘッダは従来どおり除去する。
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 65536) {
        req.destroy();
        if (!res.headersSent) sendProxyError(res, 413, 'payload_too_large', 'request body exceeds 64KB');
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const headers = pickHeaders(req.headers, DROP_REQUEST_HEADERS);
      const contentType = req.headers['content-type'];
      if (typeof contentType === 'string') headers['content-type'] = contentType;
      headers['content-length'] = String(body.length);
      doForward(headers).end(body);
    });
    req.on('error', () => {
      if (!res.headersSent) sendProxyError(res, 400, 'bad_request', 'failed to read request body');
    });
    return;
  }

  doForward(pickHeaders(req.headers, DROP_REQUEST_HEADERS)).end(); // GET/HEAD
}

/** SPA フォールバック（index.html）を stat 付きで返す。 */
async function fallback() {
  return { file: INDEX, stat: await fs.stat(INDEX) };
}

/** リクエストパスを dist 内の実ファイルへ安全に解決する（パストラバーサル防止）。
 *  stat 結果を同梱して返し、ハンドラ側での重複 stat（hot path）を避ける。 */
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  const rel = path.normalize(decoded).replace(/^(\.\.[/\\])+/, '');
  let target = path.join(DIST, rel);
  // 範囲外アクセス（セパレータ境界で判定）は index へ。
  if (target !== DIST && !target.startsWith(DIST_PREFIX)) return fallback();
  try {
    let st = await fs.stat(target);
    if (st.isDirectory()) {
      target = path.join(target, 'index.html');
      st = await fs.stat(target);
    }
    // シンボリックリンク経由の dist 外脱出を realpath で遮断（defense-in-depth）。
    const real = await fs.realpath(target);
    if (real !== DIST_REAL && !real.startsWith(ROOT_PREFIX)) return fallback();
    return { file: target, stat: st };
  } catch {
    // 見つからない場合は SPA フォールバックとして index.html を返す。
    return fallback();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    // 全応答（静的・プロキシ・405/500 等のエラー）に共通のセキュリティヘッダを付与する。
    // writeHead で同名ヘッダを渡さない限り、ここで set した値がそのまま送出される。
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    // 公開経路（Cloudflare Tunnel）の認証ゲート。メソッド判定より先に評価し、
    // 未認証クライアントには許可メソッド等の情報も返さない。
    if (!(await checkTunnelAuth(req, res))) return;
    // AI ブローカー（/api/v1/ai/* の POST）のみボディ付きリクエストを許容する。
    const rawPath = (req.url || '/').split('?')[0];
    const isAiPost = req.method === 'POST' && (rawPath === '/api/v1/ai' || rawPath.startsWith('/api/v1/ai/'));
    if (req.method !== 'GET' && req.method !== 'HEAD' && !isAiPost) {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }
    // /api 名前空間はバックエンドへ中継し、静的解決（SPA fallback）には流さない。
    if (rawPath === '/api' || rawPath.startsWith('/api/')) {
      proxyApi(req, res);
      return;
    }
    if (req.url === '/healthz') {
      // 死活監視の盲点対策: プロセス生存だけでなく「SPA を配信できる状態か」を反映する。
      // dist/index.html が欠落（プロビジョニングでビルド成果物が消える等）していると
      // 全ページが 500 になるが、固定 200 だと監視が正常と誤認する。欠落時は 503 を返す。
      try {
        await fs.stat(INDEX);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
      } catch {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('unavailable: build missing');
      }
      return;
    }
    const { file, stat } = await resolveFile(req.url || '/');
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    // ハッシュ付きアセットは長期キャッシュ、HTML は都度検証。
    const cache = /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache';
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
  console.log(`[ocsrc-web] proxying /api/* -> ${BACKEND_ORIGIN.origin}`);
  console.log(`[ocsrc-web] listening on http://${HOST}:${PORT}/`);
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[ocsrc-web] received ${sig}, shutting down`);
    server.close(() => process.exit(0));
  });
}
