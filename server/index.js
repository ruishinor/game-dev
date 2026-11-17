// Attunement server: static file host + WebSocket game server in one process.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './sim/game.js';
import { CharacterStore } from './store.js';
import { NetServer } from './net.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TICK_MS = 50;
const SAVE_INTERVAL_MS = 4000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
};

// URL prefix -> directory. Nothing outside these is ever served.
const MOUNTS = [
  ['/client/', path.join(ROOT, 'client')],
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three', 'build')],
  ['/vendor/three-addons/', path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm')],
];
// Vendor mounts serve only the exact files the client imports.
const VENDOR_ALLOW = {
  '/vendor/three/': new Set(['three.module.js', 'three.core.js']),
  '/vendor/three-addons/': new Set(['loaders/GLTFLoader.js', 'utils/BufferGeometryUtils.js', 'utils/SkeletonUtils.js', 'libs/meshopt_decoder.module.js']),
};

// The page maps the bare "three" specifier used by the three.js loader modules
// with an inline import map. Inline scripts are otherwise forbidden, so exactly
// that map is allowed by its hash.
function importMapHashes() {
  const hashes = new Set();
  const dir = path.join(ROOT, 'client');
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.html')) continue;
    const html = fs.readFileSync(path.join(dir, name), 'utf8');
    for (const m of html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)) hashes.add(`'sha256-${crypto.createHash('sha256').update(m[1]).digest('base64')}'`);
  }
  return [...hashes].join(' ');
}

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // 'wasm-unsafe-eval' lets the Meshopt geometry decoder compile its WebAssembly
  // (it does not permit eval of script text). blob: covers textures embedded in
  // GLB files, which the loader decodes through object URLs.
  'Content-Security-Policy': `default-src 'self'; script-src 'self' 'wasm-unsafe-eval' ${importMapHashes()}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob: ws: wss:; object-src 'none'; base-uri 'none'`,
};

const ASSET_PREFIX = '/client/assets/';

function resolveStatic(urlPath) {
  if (urlPath === '/' || urlPath === '/index.html') return path.join(ROOT, 'client', 'index.html');
  for (const [prefix, dir] of MOUNTS) {
    if (!urlPath.startsWith(prefix)) continue;
    const rel = urlPath.slice(prefix.length);
    if (VENDOR_ALLOW[prefix] && !VENDOR_ALLOW[prefix].has(rel)) return null;
    const file = path.resolve(dir, rel);
    if (file !== dir && !file.startsWith(dir + path.sep)) return null;
    return file;
  }
  return null;
}

function handleHttp(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let urlPath;
  let versioned = false;
  try {
    const url = new URL(req.url, 'http://localhost');
    urlPath = decodeURIComponent(url.pathname);
    // Built assets are requested as file?v=<content hash> (see the manifest), so
    // a given URL never changes and the browser may keep it indefinitely.
    versioned = urlPath.startsWith(ASSET_PREFIX) && /^[0-9a-f]{8,64}$/.test(url.searchParams.get('v') || '');
  } catch {
    res.writeHead(400).end();
    return;
  }
  const file = urlPath.includes('\0') ? null : resolveStatic(urlPath);
  const type = file ? MIME[path.extname(file)] : null;
  if (!file || !type) {
    res.writeHead(404, SECURITY_HEADERS).end('Not found');
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, SECURITY_HEADERS).end('Not found');
      return;
    }
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': type, 'Content-Length': buf.length, 'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : buf);
  });
}

/**
 * Start the game server. Resolves once listening.
 * @param {{port?: number, host?: string, dataFile?: string|null, rng?: () => number}} opts
 */
export function startServer(opts = {}) {
  const port = opts.port ?? 8080;
  const host = opts.host ?? '127.0.0.1';
  const dataFile = opts.dataFile === undefined ? path.join(ROOT, 'data', 'characters.json') : opts.dataFile;

  const store = new CharacterStore(dataFile);
  const game = new Game({ rng: opts.rng });
  const server = http.createServer(handleHttp);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
  const net = new NetServer(wss, game, store);

  let last = performance.now();
  const loop = setInterval(() => {
    const now = performance.now();
    // Clamp so a stalled process cannot produce one enormous step.
    const dt = Math.min(250, now - last);
    last = now;
    game.tick(dt);
    net.broadcast();
  }, TICK_MS);
  const saver = setInterval(() => {
    net.syncAll();
    try {
      store.flush();
    } catch (err) {
      console.error('[store] save failed', err);
    }
  }, SAVE_INTERVAL_MS);
  const heart = setInterval(() => net.heartbeat(), 15000);

  const close = () =>
    new Promise((resolve) => {
      clearInterval(loop);
      clearInterval(saver);
      clearInterval(heart);
      net.syncAll();
      for (const conn of [...net.conns]) {
        net.detach(conn);
        conn.ws.terminate();
      }
      try {
        store.flush();
      } catch (err) {
        console.error('[store] save failed', err);
      }
      wss.close();
      server.close(() => resolve());
      server.closeAllConnections?.();
    });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({ port: server.address().port, host, game, store, net, close });
    });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 8080;
  const host = process.env.HOST || '127.0.0.1';
  const dataFile = process.env.DATA_FILE || undefined;
  startServer({ port, host, dataFile }).then(
    (srv) => {
      console.log(`Attunement is running: http://${host === '0.0.0.0' ? 'localhost' : host}:${srv.port}/`);
      console.log('Open that address in two browser windows (or one normal + one private window) for two players.');
      const shutdown = () => {
        console.log('\nSaving and shutting down…');
        srv.close().then(() => process.exit(0));
        setTimeout(() => process.exit(0), 1500).unref();
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
    },
    (err) => {
      console.error('Failed to start:', err.message);
      process.exit(1);
    }
  );
}
