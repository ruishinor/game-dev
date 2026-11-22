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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tiers = (process.argv[2] || '2,1,0').split(',').map(Number);
const WIDTH = Number(process.env.ATTUNEMENT_WIDTH) || 1280;
const HEIGHT = Number(process.env.ATTUNEMENT_HEIGHT) || 800;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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
const browser = await launchBrowser();
const report = { when: new Date().toISOString(), softwareRendering: SOFTWARE_GL, viewport: `${WIDTH}x${HEIGHT}`, graphics: null, results: [] };
let failed = false;

try {
  for (const tier of tiers) {
    const ctx = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.setDefaultTimeout(240000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(`http://127.0.0.1:${srv.port}/?nolock=1&qlock=1&q=${tier}&slot=p${tier}&renderdiag=1`);
    await page.waitForSelector('#enter:not([disabled])');
    const loadMs = Date.now() - t0;
    if (!report.graphics) report.graphics = await describeGraphics(page);
    const name = `Prof${'abc'[tier]}x`;
    await page.click('#gate-guest-link');
    await page.fill('#name', name);
    await page.click('.classcard[data-cls="vanguard"]');
    await page.click('#enter');
    await page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().pos);
    for (const scene of scenes) {
      const player = await activeBrowserPlayer(page, srv, name);
      if (scene.transfer) { player.char.level = Math.max(3, player.char.level); srv.game.transferPlayer(player, { x: scene.x, z: scene.z }); }
      player.x = scene.x;
      player.z = scene.z;
      player.hp = player.maxHp;
      await page.waitForFunction(([x, z]) => {
        const s = window.__attune.state();
        return s.pos && Math.hypot(s.pos.x - x, s.pos.z - z) < 1.5;
      }, [scene.x, scene.z]);
      await page.evaluate((v) => window.__attune.view(v), { ...scene.view, yaw: scene.face, face: scene.face });
      await sleep(scene.transfer ? (SOFTWARE_GL ? 6000 : 4000) : SOFTWARE_GL ? 500 : 1500);
      const m = await page.evaluate(async (software) => {
        const A = window.__attune;
        // Frame intervals as the browser delivers them.
        const want = software ? 6 : 240;
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
        // One render forced to completion.
        const { renderer, scene, camera } = A.gfx;
        const gl = renderer.getContext();
        const px = new Uint8Array(4);
        const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        A.pause(true);
        renderer.render(scene, camera);
        sync();
        const n = software ? 2 : 20;
        const t0 = performance.now();
        for (let i = 0; i < n; i++) {
          renderer.render(scene, camera);
          sync();
        }
        const synced = (performance.now() - t0) / n;
        A.pause(false);
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
          renderProbe: s.renderDiagnostics?.enabled ? {
            stats: s.renderDiagnostics.stats,
            context: s.renderDiagnostics.context,
            events: s.renderDiagnostics.events.slice(-25),
          } : null,
        };
      }, SOFTWARE_GL);
      const row = { scene: scene.name, tier, loadMs, ...m };
      report.results.push(row);
      const r = (v) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
      console.log(`${scene.name.padEnd(11)} q${tier}  interval ${r(m.intervalMs.median)} ms median / ${r(m.intervalMs.p95)} p95 / ${r(m.intervalMs.worst)} worst (${r(m.fps)} fps)  cpu ${m.cpuFrameMs} ms  synced render ${r(m.syncedRenderMs)} ms  calls ${m.draw.calls}  tris ${m.draw.triangles}  drawn ${m.entities.inView}/${m.entities.total}  worst live render ${r(m.renderProbe?.stats?.maxRenderMs ?? 0)} ms`);
    }
    if (errors.length) {
      failed = true;
      console.log(`script errors at q${tier}: ${errors.slice(0, 3).join(' | ')}`);
    }
    await ctx.close();
  }
} catch (err) {
  failed = true;
  console.log(`FAIL: ${err.stack || err}`);
} finally {
  await browser.close();
  await srv.close();
}

console.log(`graphics: ${report.graphics ? `${report.graphics.renderer}` : 'unknown'}`);
console.log(SOFTWARE_GL ? 'SOFTWARE RENDERING: these timings say nothing about a real GPU.' : 'Hardware rendering requested: check the renderer line above names your GPU, not SwiftShader/llvmpipe.');
const out = path.join(ROOT, 'docs', 'evidence', `profile-${SOFTWARE_GL ? 'software' : 'gpu'}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 1)}\n`);
console.log(`wrote ${path.relative(ROOT, out)}`);
process.exit(failed ? 1 : 0);
