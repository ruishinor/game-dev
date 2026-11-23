// Attunement server: static file host + WebSocket game server in one process.

import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './sim/game.js';
import { EconomyMetrics } from './sim/economy-metrics.js';
import { ensureWardenRifleGLB } from '../tools/assets/warden-rifle-source.mjs';
import { CharacterStore } from './store.js';
import { NetServer } from './net.js';
import { ensureDepthsCacheGLB } from '../tools/assets/extract-depths-cache.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The owner-only Electron build serves staged GLBs rather than source archives.
const DESKTOP_RUNTIME_MODELS = process.env.ATTUNEMENT_DESKTOP_RUNTIME_DIR || null;
const DESKTOP_PIPELINE_EXPORTS = new Set([
  'stillpoint.glb', 'severance_gate.glb', 'severance_kit.glb', 'outpost_shelter.glb',
  'salvage_camp.glb', 'resonant_vein.glb', 'sanctum_arch.glb', 'phase_scar.glb',
  'foundry_kit.glb',
]);
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
  '.woff2': 'font/woff2',
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

// Generated models are produced before the HTTP/WebSocket listener exists.
// Never hash or inflate the ~94 MB source ZIP during a player's asset request.
const GENERATED_MODELS = new Map([
  ['/client/assets/depths-recovery-cache.glb', () => ensureDepthsCacheGLB()],
  ['/client/assets/sanctum-warden-carbine.glb', () => ensureWardenRifleGLB('carbine')],
  ['/client/assets/sanctum-warden-marksman.glb', () => ensureWardenRifleGLB('marksman')],
]);
const readyGeneratedModels = new Map();
let generatedModelsPrepared = false;
function prepareGeneratedModels() {
  if (generatedModelsPrepared) return;
  if (DESKTOP_RUNTIME_MODELS) {
    for (const name of DESKTOP_PIPELINE_EXPORTS) {
      const file = path.join(DESKTOP_RUNTIME_MODELS, name);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile())
        throw new Error('Missing packaged runtime model: ' + name);
    }
    for (const url of GENERATED_MODELS.keys()) {
      const file = path.join(DESKTOP_RUNTIME_MODELS, path.posix.basename(url));
      if (!fs.existsSync(file) || !fs.statSync(file).isFile())
        throw new Error('Missing packaged runtime model: ' + path.basename(file));
      readyGeneratedModels.set(url, file);
    }
    generatedModelsPrepared = true;
    return;
  }
  // A failure is an explicit missing-asset fallback for this process; it must
  // not trigger a synchronous ZIP rebuild on a later HTTP request.
  for (const [url, build] of GENERATED_MODELS) {
    try {
      const file = build();
      if (!fs.statSync(file).isFile()) throw new Error('Generated asset is not a file');
      readyGeneratedModels.set(url, file);
    } catch (error) {
      console.warn('[assets] startup model unavailable:', url, error.message || error);
    }
  }
  generatedModelsPrepared = true;
}

function resolveStatic(urlPath) {
  if (DESKTOP_RUNTIME_MODELS && urlPath.startsWith('/client/assets/') &&
      DESKTOP_PIPELINE_EXPORTS.has(path.posix.basename(urlPath)) &&
      urlPath === '/client/assets/' + path.posix.basename(urlPath))
    return path.join(DESKTOP_RUNTIME_MODELS, path.posix.basename(urlPath));
  if (urlPath === '/' || urlPath === '/index.html') return path.join(ROOT, 'client', 'index.html');
  // Owner-approved runtime export only; never mount pipeline sources or reports.
  if (urlPath === '/client/assets/stillpoint.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'stillpoint', 'outputs', 'stillpoint.glb');
  if (urlPath === '/client/assets/severance_gate.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'severance_gate', 'outputs', 'severance_gate.glb');
  if (urlPath === '/client/assets/severance_kit.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'severance_kit', 'outputs', 'severance_kit.glb');
  if (urlPath === '/client/assets/outpost_shelter.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'outpost_shelter', 'outputs', 'outpost_shelter.glb');
  if (urlPath === '/client/assets/salvage_camp.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'salvage_camp', 'outputs', 'salvage_camp.glb');
  if (urlPath === '/client/assets/resonant_vein.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'resonant_vein', 'outputs', 'resonant_vein.glb');
  if (urlPath === '/client/assets/sanctum_arch.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'sanctum_arch', 'outputs', 'sanctum_arch.glb');
  if (urlPath === '/client/assets/phase_scar.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'phase_scar', 'outputs', 'phase_scar.glb');
  if (urlPath === '/client/assets/foundry_kit.glb') return path.join(ROOT, 'tools', 'asset-pipeline', 'assets', 'foundry_kit', 'outputs', 'foundry_kit.glb');
  // Only prevalidated generated files are eligible for these exact URLs.
  // Unavailable models return 404; no extraction happens in the request path.
  if (GENERATED_MODELS.has(urlPath)) return readyGeneratedModels.get(urlPath) || null;
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
    const headers={...SECURITY_HEADERS,'Content-Type':type,'Content-Length':buf.length,'Cache-Control':versioned?'public, max-age=31536000, immutable':'no-cache'};
    // Chromium media loaders may require byte-range seeking even for short clips.
    if(type==='audio/mpeg'){
      headers['Accept-Ranges']='bytes';
      if(req.headers.range){
        const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        let start,end;
        if(m&&(m[1]||m[2])){
          start=m[1]?Number(m[1]):Math.max(0,buf.length-Number(m[2]));
          end=m[1]&&m[2]?Math.min(Number(m[2]),buf.length-1):buf.length-1;
        }
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=buf.length||end<start){
          res.writeHead(416,{...headers,'Content-Length':0,'Content-Range':'bytes */'+buf.length}).end();return;
        }
        const part=buf.subarray(start,end+1);
        res.writeHead(206,{...headers,'Content-Length':part.length,'Content-Range':'bytes '+start+'-'+end+'/'+buf.length});
        res.end(req.method==='HEAD'?undefined:part);return;
      }
    }
    res.writeHead(200,headers);
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

  // May perform synchronous ZIP validation/extraction once, before any player
  // can connect. The request handler itself now performs only file I/O.
  prepareGeneratedModels();

  const store = new CharacterStore(dataFile);
  const game = new Game({ rng: opts.rng });
  // Explicit opt-in: no economic observation files are written by default.
  const metricsFile = Object.hasOwn(opts, 'economyMetricsFile') ? opts.economyMetricsFile : process.env.ATTUNEMENT_ECONOMY_METRICS_FILE;
  if (metricsFile) {
    const target = path.resolve(metricsFile);
    // JSON files under these static mounts are publicly retrievable by HTTP.
    for (const exposed of [path.join(ROOT, 'client'), path.join(ROOT, 'shared')]) {
      if (target === exposed || target.startsWith(exposed + path.sep))
        throw new Error('Economy telemetry file must be outside HTTP-served client/shared directories.');
    }
    game.economy = new EconomyMetrics(target);
  }
  if (typeof opts.productionRoll === 'function') game.productionRoll = opts.productionRoll;
  const localRequest = (req) => req.headers.host === `127.0.0.1:${server.address()?.port}`;
  const server = http.createServer((req, res) => {
    if (opts.desktopLocal === true && !localRequest(req)) {
      res.writeHead(403, SECURITY_HEADERS).end('Forbidden');
      return;
    }
    handleHttp(req, res);
  });
  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 4096,
    ...(opts.desktopLocal === true ? { verifyClient: (info) =>
      localRequest(info.req) && info.origin === `http://127.0.0.1:${server.address()?.port}` } : {}),
  });
  const net = new NetServer(wss, game, store);

  let last = performance.now();
  let lastSlowTickNotice = -Infinity;
  const loop = setInterval(() => {
    const now = performance.now();
    const schedulerGapMs = now - last;
    // Clamp so a stalled process cannot produce one enormous step.
    const dt = Math.min(250, schedulerGapMs);
    last = now;
    game.tick(dt);
    const simMs = performance.now() - now;
    net.broadcast();
    const workMs = performance.now() - now;
    if ((schedulerGapMs > 250 || workMs > 100) && now - lastSlowTickNotice > 10000) {
      lastSlowTickNotice = now;
      console.warn('[perf] slow-server-tick', JSON.stringify({
        schedulerGapMs: Math.round(schedulerGapMs), simulationMs: Math.round(simMs),
        broadcastMs: Math.round(workMs - simMs), connections: net.conns.size,
      }));
    }
  }, TICK_MS);
  const saver = setInterval(() => {
    net.syncAll();
    const saveStart = performance.now();
    try {
      store.flush();
    } catch (err) {
      console.error('[store] save failed', err);
    }
    game.economy?.flush();
    const saveMs = performance.now() - saveStart;
    if (saveMs > 100) console.warn('[perf] slow-save', JSON.stringify({ saveMs: Math.round(saveMs) }));
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
      game.economy?.flush();
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
