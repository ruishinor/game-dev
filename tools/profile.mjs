// Frame-time profile of representative scenes at each quality tier.
//
//   npm run profile                      software WebGL (the default here): good for
//                                        spotting regressions, NOT a performance result
//   ATTUNEMENT_GPU=1 ATTUNEMENT_HEADED=1 npm run profile
//                                        the machine's real GPU: this is the number that counts
//
// For each scene and tier it reports
//   * frame interval (what the player sees): median, 95th percentile, worst
//   * CPU: time spent in the game's frame function (update + draw submission)
//   * GPU-synced render: one render forced to completion with readPixels,
//     i.e. CPU submission + rasterisation. Under software WebGL this is the
//     rasteriser; on a real GPU it approximates GPU cost for one frame.
//   * draw calls, triangles, geometries and textures alive, entities drawn.
// The report is printed and written to docs/evidence/profile-<software|gpu>.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { ZONES, SEVERANCE_EXPANSE as EX, SILENT_FOUNDRY as SF } from '../shared/world.js';
import { gateToWorld } from '../shared/severance-gate.js';
import { launchBrowser, describeGraphics, SOFTWARE_GL, activeBrowserPlayer } from './browser.mjs';
import { withDeadline } from './profile-deadline.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tiers = (process.argv[2] || '2,1,0').split(',').map(Number);
const WIDTH = Number(process.env.ATTUNEMENT_WIDTH) || 1280;
const HEIGHT = Number(process.env.ATTUNEMENT_HEIGHT) || 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STEP_MS = Number(process.env.ATTUNEMENT_PROFILE_STEP_TIMEOUT_MS) || 45000;
const FRAME_COUNT = Number(process.env.ATTUNEMENT_PROFILE_FRAMES) || (SOFTWARE_GL ? 6 : 90);
const SHADER_WARMUP = process.env.ATTUNEMENT_PROFILE_WARMUP === '1';
// Synchronized readPixels is opt-in on real GPUs because it can amplify stalls.
const SYNC_BENCH = (process.env.ATTUNEMENT_PROFILE_SYNC ?? (SOFTWARE_GL ? '1' : '0')) === '1';
const bounded = (label, operation, ms = STEP_MS) => withDeadline(label, operation, ms);
const sf = ZONES.sporefield;

const SCENES = [
  { name: 'sanctum', x: 0, z: 11.5, face: Math.PI, view: { pitch: 0.36, dist: 14 } },
  { name: 'sporefield', x: sf.x + 13, z: sf.z - 8, face: Math.atan2(-13, 8), view: { pitch: 0.3, dist: 11 } },
  // Severance track (server-side transfer into each disconnected region)
  { name: 'exp-arrival', transfer: true, x: EX.arrival.x, z: EX.arrival.z, face: 0, view: { pitch: 0.14, dist: 7 } },
  { name: 'exp-flats', transfer: true, x: EX.x + 34, z: EX.z + 14, face: 0.6, view: { pitch: 0.14, dist: 7 } },
  { name: 'exp-gate', transfer: true, ...gateToWorld(0, -70), face: 0, view: { pitch: 0.16, dist: 9 } },
  { name: 'exp-outpost', transfer: true, x: EX.outpost.x - 22, z: EX.outpost.z - 6, face: Math.PI / 2 + 0.25, view: { pitch: 0.18, dist: 8 } },
  { name: 'foundry-vault', transfer: true, x: SF.x, z: SF.z + 50, face: Math.PI, view: { pitch: 0.14, dist: 7 } },
  { name: 'foundry-harmonic', transfer: true, x: SF.x, z: SF.z - 4, face: Math.PI, view: { pitch: 0.2, dist: 8 } },
];
const only = (process.env.ATTUNEMENT_SCENES || '').split(',').filter(Boolean);
const scenes = only.length ? SCENES.filter((s) => only.some((o) => s.name.startsWith(o))) : SCENES;

const srv = await startServer({ port: 0, dataFile: null });
let browser;
try {
  browser = await bounded('launch browser', () => launchBrowser());
} catch (error) {
  console.error('[profile] browser launch failed; closing in-memory game server:', String(error));
  try { await bounded('close server after failed launch', () => srv.close(), 5000); }
  catch (cleanupError) { console.error('[profile] server cleanup failed:', String(cleanupError)); }
  throw error;
}
const report = { when: new Date().toISOString(), softwareRendering: SOFTWARE_GL, shaderWarmup: SHADER_WARMUP, viewport: `${WIDTH}x${HEIGHT}`, graphics: null, results: [], failures: [] };
let failed = false;
let timedOut = false;
const output = path.join(ROOT, 'docs', 'evidence', `profile-${SOFTWARE_GL ? 'software' : 'gpu'}.json`);
const saveReport = () => { fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, JSON.stringify(report, null, 1) + '\n'); };
const MAX_MS = Number(process.env.ATTUNEMENT_PROFILE_MAX_MS) || Math.max(150000, tiers.length * scenes.length * STEP_MS);
const watchdog = setTimeout(() => {
  report.error = 'Overall profiling deadline exceeded after ' + MAX_MS + 'ms';
  console.error('[profile] ' + report.error + '; saving partial results and terminating browser');
  try { saveReport(); } catch (error) { console.error('[profile] save failed:', error); }
  // Playwright Browser does not have process(). The independent Windows
  // process watchdog handles any browser that ignores graceful shutdown.
  void browser.close().catch(() => {});
  process.exit(124);
}, MAX_MS);
console.log(`[profile] ${tiers.length} tiers, ${scenes.length} scenes, ${FRAME_COUNT} frames per capture; forced GPU-sync: ${SYNC_BENCH ? 'on' : 'off'}`);

try {
  for (const tier of tiers) {
    console.log(`[profile] starting quality q${tier}`);
    let ctx, page;
    const errors = [], consoleMessages = [], failedRequests = [], pending = new Set();
    const assetPath = (request) => {
      try { const u = new URL(request.url()); return u.hostname === '127.0.0.1' ? u.pathname.slice(0, 160) : null; }
      catch { return null; }
    };
    try {
    ctx = await bounded(`q${tier}: context`, () => browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 }));
    page = await bounded(`q${tier}: page`, () => ctx.newPage());
    page.setDefaultTimeout(STEP_MS);
    page.setDefaultNavigationTimeout(STEP_MS);
    page.on('pageerror', (e) => { if (errors.length < 12) errors.push(String(e.message).slice(0, 320)); });
    page.on('console', (msg) => {
      if (['error', 'warning'].includes(msg.type()) && consoleMessages.length < 12) consoleMessages.push(`${msg.type()}: ${msg.text().slice(0, 240)}`);
    });
    page.on('request', (request) => { if (assetPath(request)) pending.add(request); });
    page.on('requestfinished', (request) => pending.delete(request));
    page.on('requestfailed', (request) => {
      pending.delete(request);
      if (failedRequests.length < 12) failedRequests.push({ path: assetPath(request), reason: String(request.failure()?.errorText || 'network error').slice(0, 90) });
    });
    page.on('response', (response) => {
      if (response.status() >= 400 && failedRequests.length < 12) failedRequests.push({ path: assetPath(response.request()), status: response.status() });
    });
    if (!report.graphics) {
      report.graphics = await bounded(`q${tier}: inspect renderer before game load`, () => describeGraphics(page), 6000);
      const label = `${report.graphics?.vendor || ''} ${report.graphics?.renderer || ''}`;
      console.log('[profile] browser GPU:', label || 'unavailable');
      saveReport();
      if (!SOFTWARE_GL && (!label.trim() || /swiftshader|llvmpipe|software rasterizer|microsoft basic render/i.test(label))) {
        throw new Error('Hardware GPU not confirmed; browser reported: ' + (label || 'unavailable'));
      }
    }
    const t0 = Date.now();
    await bounded(`q${tier}: navigate`, () => page.goto(`http://127.0.0.1:${srv.port}/?nolock=1&qlock=1&q=${tier}&slot=p${tier}&renderdiag=1&shaderwarmup=${SHADER_WARMUP ? '1' : '0'}`));
    // The cinematic account gate intentionally hides the guest form until
    // the user selects "Play as a guest". Never wait for hidden #enter here.
    await bounded(`q${tier}: login UI ready`, () => page.waitForSelector('#account-register:not([disabled])'));
    const loadMs = Date.now() - t0;
    const name = `Prof${'abc'[tier]}x`;
    await bounded(`q${tier}: open guest creation`, () => page.click('#gate-guest-link'));
    await bounded(`q${tier}: guest form ready`, () => page.waitForSelector('#enter:not([disabled])'));
    await page.fill('#name', name);
    await page.click('.classcard[data-cls="vanguard"]');
    await page.click('#enter');
    await bounded(`q${tier}: enter world`, () => page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().pos));
    for (const scene of scenes) {
      console.log(`[profile] q${tier}: scene ${scene.name}`);
      const player = await bounded(`q${tier}/${scene.name}: player`, () => activeBrowserPlayer(page, srv, name));
      if (scene.transfer) { player.char.level = Math.max(3, player.char.level); srv.game.transferPlayer(player, { x: scene.x, z: scene.z }); }
      player.x = scene.x;
      player.z = scene.z;
      player.hp = player.maxHp;
      await bounded(`q${tier}/${scene.name}: position`, () => page.waitForFunction(([x, z]) => {
        const s = window.__attune.state();
        return s.pos && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.5;
      }, [scene.x, scene.z]));
      await bounded(`q${tier}/${scene.name}: camera`, () => page.evaluate((v) => window.__attune.view(v), { ...scene.view, yaw: scene.face, face: scene.face }));
      await sleep(scene.transfer ? (SOFTWARE_GL ? 6000 : 4000) : SOFTWARE_GL ? 500 : 1500);
      const m = await bounded(`q${tier}/${scene.name}: frame sample`, () => page.evaluate(async ({ software, frameCount, syncBench }) => {
        const A = window.__attune;
        // Frame intervals as the browser delivers them.
        const want = frameCount;
        const stamps = [];
        await new Promise((resolve) => {
          const tick = (t) => {
            stamps.push(t);
            if (stamps.length > want) resolve();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        const gaps = stamps.slice(1).map((t, i) => t - stamps[i]).sort((a, b) => a - b);
        const pick = (q) => gaps[Math.min(gaps.length - 1, Math.floor(gaps.length * q))];
        const s = A.state();
        let synced = null;
        if (syncBench) {
          const { renderer, scene, camera } = A.gfx;
          const gl = renderer.getContext();
          const px = new Uint8Array(4);
          const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
          A.pause(true);
          try {
            renderer.render(scene, camera); sync();
            const n = software ? 2 : 20;
            const t0 = performance.now();
            for (let i = 0; i < n; i++) { renderer.render(scene, camera); sync(); }
            synced = (performance.now() - t0) / n;
          } finally { A.pause(false); }
        }
        return {
          frames: gaps.length,
          intervalMs: { median: pick(0.5), p95: pick(0.95), worst: gaps[gaps.length - 1] },
          fps: 1000 / pick(0.5),
          cpuFrameMs: s.frameMs,
          syncedRenderMs: synced,
          quality: s.quality,
          draw: s.draw,
          assets: s.assets,
          entities: { total: s.ents.length, inView: s.ents.filter((e) => e.inView).length, animated: s.ents.filter((e) => e.anim).length },
          world: s.world,
          // Captures live game-frame stalls, not the intrusive readPixels test below.
          shaderWarmup: s.shaderWarmup,
          renderProbe: s.renderDiagnostics?.enabled ? {
            stats: s.renderDiagnostics.stats,
            context: s.renderDiagnostics.context,
            events: s.renderDiagnostics.events.slice(-25),
          } : null,
        };
      }, { software: SOFTWARE_GL, frameCount: FRAME_COUNT, syncBench: SYNC_BENCH }));
      const row = { scene: scene.name, tier, loadMs, ...m };
      report.results.push(row);
      saveReport();
      const r = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
      console.log(`${scene.name.padEnd(11)} q${tier}  interval ${r(m.intervalMs.median)} ms median / ${r(m.intervalMs.p95)} p95 / ${r(m.intervalMs.worst)} worst (${r(m.fps)} fps)  cpu ${m.cpuFrameMs} ms  synced render ${m.syncedRenderMs === null ? 'off' : r(m.syncedRenderMs) + ' ms'}  calls ${m.draw.calls}  tris ${m.draw.triangles}  drawn ${m.entities.inView}/${m.entities.total}  worst live render ${r(m.renderProbe?.stats?.maxRenderMs ?? 0)} ms`);
    }
    if (errors.length) {
      failed = true;
      console.log(`script errors at q${tier}: ${errors.slice(0, 3).join(' | ')}`);
    }
    } catch (error) {
      failed = true;
      const evidence = {
        tier, error: String(error?.message || error).slice(0, 360),
        pageErrors: errors.slice(-12), consoleMessages: consoleMessages.slice(-12), requestFailures: failedRequests.slice(-12),
        pendingAssetPaths: [...pending].map(assetPath).filter(Boolean).slice(-20),
      };
      if (page) {
        try {
          evidence.page = await bounded(`q${tier}: inspect failed loading state`, () => page.evaluate(() => {
            const enter = document.getElementById('enter');
            return {
              readyState: document.readyState,
              enterDisabled: enter?.disabled ?? null,
              enterLabel: enter?.textContent?.trim().slice(0, 100) ?? null,
              gameHookPresent: !!window.__attune,
              visibility: document.visibilityState,
            };
          }), 2500);
        } catch (inspectionError) { evidence.inspectionError = String(inspectionError).slice(0, 200); }
      }
      report.failures.push(evidence);
      console.error('[profile] q' + tier + ' failed; attempting remaining tiers:', evidence.error);
      console.error('[profile] failure evidence:', JSON.stringify(evidence));
    } finally {
      saveReport();
      if (ctx) {
        try { await bounded(`q${tier}: close context`, () => ctx.close(), 3000); }
        catch (error) { console.warn('[profile] context cleanup incomplete:', String(error)); }
      }
    }
  }
} catch (err) {
  failed = true;
  timedOut = /deadline exceeded|timed out/i.test(String(err));
  report.error = String(err?.message || err);
  console.log(`FAIL: ${err.stack || err}`);
} finally {
  clearTimeout(watchdog);
  try { await bounded(timedOut ? 'close browser after timeout' : 'close browser', () => browser.close(), 4000); }
  catch (error) { console.warn('[profile] browser close incomplete:', String(error)); }
  // No unsupported Browser.process() call. Exit status is preserved.
  try { await bounded('close in-memory server', () => srv.close(), 5000); }
  catch (error) { console.warn('[profile] server close failed:', String(error)); }
}

console.log(`graphics: ${report.graphics ? `${report.graphics.renderer}` : 'unknown'}`);
console.log(SOFTWARE_GL ? 'SOFTWARE RENDERING: these timings say nothing about a real GPU.' : 'Hardware rendering requested: check the renderer line above names your GPU, not SwiftShader/llvmpipe.');
saveReport();
console.log(`wrote ${path.relative(ROOT, output)}`);
process.exit(failed ? 1 : 0);
