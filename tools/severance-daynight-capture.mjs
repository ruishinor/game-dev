// Severance Gate time-of-day review captures (local review material; never commit
// the output). Real server, real client, real gate GLB; the Expanse presentation
// clock is frozen and advanced in exact steps, so every run produces the same
// frames apart from character idle motion.
//
//   node tools/severance-daynight-capture.mjs [outDir=tmp/severance-daynight] [clipSeconds=28] [fps=15]
//
// Writes:
//   doorway-day.png / doorway-night.png (+ dusk, dawn)     identical framing, gate active
//   doorway-{day,night}-portal-light-off.png                same frame without the portal light (control)
//   wide-day.png / wide-night.png                           clip framing
//   dormant-night-doorway.png / dormant-night-wide.png      dormant gate at night
//   after-return-night.png                                  after Expanse -> Annex -> Expanse
//   severance-daynight-loop.mp4                             day -> dusk -> night -> dawn -> day, fixed camera
//   review.json                                             probes, lighting states, checks
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startServer } from '../server/index.js';
import { launchBrowser, SOFTWARE_GL } from './browser.mjs';
import { gateToWorld, SEVERANCE_POCKET, GATE_FRAME } from '../shared/severance-gate.js';
import { liveFixturePlayer } from '../test/e2e/live-fixture.mjs';

const out = path.resolve(process.argv[2] || 'tmp/severance-daynight');
const clipSeconds = Number(process.argv[3] || 28);
const fps = Number(process.argv[4] || 15);
const frames = path.join(out, 'frames');
fs.mkdirSync(frames, { recursive: true });
const poll = { polling: 250, timeout: 240000 };
const north = 0;
const server = await startServer({ port: 0, dataFile: null });
let browser;
const review = { software: SOFTWARE_GL, stills: {}, lighting: {}, checks: {} };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
try {
  browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: 1024, height: 576 } });
  page.setDefaultTimeout(240000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Gate Surveyor');
  await page.click('.classcard[data-cls="keeper"]');
  await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, poll);
  const p = await liveFixturePlayer(page, server, 'Gate Surveyor');
  const game = server.game;
  // Frames show only the world: hide HUD, nameplates and prompts.
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view { visibility: visible !important; }' });
  const lighting = () => page.evaluate(() => {
    const { scene } = window.__attune.gfx;
    let hemi, sun, sky, stars, portal;
    scene.traverse((o) => {
      if (o.isHemisphereLight) hemi = o;
      if (o.isDirectionalLight && o.castShadow !== undefined && !sun) sun = o;
      if (o.material?.uniforms?.top && o.material?.uniforms?.low) sky = o;
      if (o.name === 'severance-gate:portal-light') portal = o;
    });
    stars = sky.parent.children.find((c) => c.isPoints);
    const hex = (c) => c.getHexString();
    return { fog: [hex(scene.fog.color), scene.fog.near, scene.fog.far], hemi: [hex(hemi.color), hex(hemi.groundColor), +hemi.intensity.toFixed(4)],
      sun: [hex(sun.color), +sun.intensity.toFixed(4)], sky: [hex(sky.material.uniforms.top.value), hex(sky.material.uniforms.low.value), sky.parent.position.x], stars: +stars.material.opacity.toFixed(4),
      portal: portal ? +portal.intensity.toFixed(3) : null };
  });
  review.lighting.reach = await lighting();

  for (const e of game.enemies) { e.state = 'dead'; e.deadAt = -1e9; e.respawnAt = Infinity; }
  p.char.level = 3; p.char.attunements = ['resonance']; p.char.riftCalibration = 'completed';
  game.refreshStats(p); game.markDirty(p);
  game.severance.hold = true;
  game.severance.phase = 'active';
  game.transferPlayer(p, { ...SEVERANCE_POCKET.arrival });
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, poll);
  await page.waitForFunction(() => window.__attune.state().world.severance?.status === 'ready', null, poll);
  await page.waitForFunction(() => { const g = window.__attune.state().world.severance; return g.phase === 'active' && g.level > 0.97; }, null, poll);
  review.lighting.expanseDefault = await lighting();
  log('gate ready and active');

  async function frame(at, cam) {
    p.x = at.x; p.z = at.z; p.yaw = north;
    await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.4; }, [at.x, at.z], poll);
    await page.evaluate((c) => window.__attune.view({ face: 0, ...c }), cam);
    await page.waitForTimeout(2500); // camera settles (the frame loop keeps running while drawing is paused)
  }
  // Screen positions of named gate points, for the review probes.
  const probes = () => page.evaluate((pts) => {
    const { camera, renderer } = window.__attune.gfx;
    camera.updateMatrixWorld();
    const v = camera.matrixWorldInverse.elements, pr = camera.projectionMatrix.elements;
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const outp = {};
    for (const [name, [x, y, z]] of Object.entries(pts)) {
      const cx = v[0] * x + v[4] * y + v[8] * z + v[12], cy = v[1] * x + v[5] * y + v[9] * z + v[13], cz = v[2] * x + v[6] * y + v[10] * z + v[14];
      const px = pr[0] * cx + pr[4] * cy + pr[8] * cz + pr[12], py = pr[1] * cx + pr[5] * cy + pr[9] * cz + pr[13], pw = pr[3] * cx + pr[7] * cy + pr[11] * cz + pr[15];
      outp[name] = [Math.round((px / pw * 0.5 + 0.5) * w), Math.round((1 - (py / pw * 0.5 + 0.5)) * h)];
    }
    return outp;
  }, POINTS);
  const F = GATE_FRAME;
  const P3 = (bx, by, y) => { const w = gateToWorld(bx, by); return [w.x, y, w.z]; };
  const POINTS = {
    archLeftRib: P3(-1.95, -4.5, 8.5), archRightRib: P3(1.95, -4.5, 8.5), passageFloor: P3(-0.9, -3.5, F.floor + 0.02), passageFloorNear: P3(-1.0, -6.2, F.floor + 0.02),
    upperSteps: P3(-1.5, -9.0, F.floor - 0.25), midSteps: P3(-1.5, -12.5, 2.35), lowerSteps: P3(-1.5, -15.6, 0.7),
    archFace: P3(-3.6, -7.0, 10.5), runePanelLower: P3(-4.15, -6.0, 13.2), crown: P3(0, -2.5, 27), skyAbove: P3(0, -2.5, 60), ridge: P3(30, 30, 25), ruin: P3(-7.5, -63, 2),
  };
  const shoot = async (name, steps = [0]) => {
    await page.evaluate((st) => { for (const s of st) window.__attune.severanceStep(s); }, steps);
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    review.stills[name] = { file, probes: await probes(), tod: await page.evaluate(() => window.__attune.timeOfDay()), lighting: await lighting() };
    log('still', name);
    return file;
  };
  const control = async (name) => {
    // identical frame, portal light switched off for this render only
    await page.evaluate(() => {
      const { scene, renderer, camera } = window.__attune.gfx;
      const l = scene.getObjectByName('severance-gate:portal-light');
      const k = l.intensity; l.intensity = 0; renderer.render(scene, camera); l.intensity = k;
    });
    const file = path.join(out, name + '.png');
    await page.screenshot({ path: file });
    review.stills[name] = { file, probes: await probes(), control: true };
    log('still', name);
  };

  // Camera 1 m behind the character's head: the game hides the character below
  // 1.3 m, so the frames show only the gate, sky and ground at standing height.
  const DOOR = { at: gateToWorld(0, -33), cam: { yaw: north, pitch: -0.14, dist: 1.0 } };
  const WIDE = { at: gateToWorld(0, -53), cam: { yaw: north, pitch: -0.07, dist: 1.0 } };
  await page.evaluate(() => { window.__attune.severanceClock(true); window.__attune.pause(true); });

  await frame(DOOR.at, DOOR.cam);
  for (const key of ['day', 'dusk', 'night', 'dawn']) {
    await page.evaluate((k) => window.__attune.timeOfDay({ key: k }), key);
    await shoot('doorway-' + key);
    if (key === 'day' || key === 'night') await control(`doorway-${key}-portal-light-off`);
  }
  await frame(WIDE.at, WIDE.cam);
  for (const key of ['day', 'night']) {
    await page.evaluate((k) => window.__attune.timeOfDay({ key: k }), key);
    await shoot('wide-' + key);
  }

  // The review clip: one full loop, fixed camera, gate held active.
  await page.evaluate((period) => window.__attune.timeOfDay({ mode: 'loop', t: 0, period }), clipSeconds);
  const total = Math.round(clipSeconds * fps);
  review.clip = { seconds: clipSeconds, fps, frames: total, keys: [] };
  for (let i = 0; i < total; i++) {
    await page.evaluate((dt) => window.__attune.severanceStep(dt), i === 0 ? 0 : 1 / fps);
    await page.screenshot({ path: path.join(frames, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 90 });
    if (i % fps === 0) {
      const st = await page.evaluate(() => window.__attune.timeOfDay());
      review.clip.keys.push({ second: i / fps, t: +st.t.toFixed(4), key: st.key });
      log(`clip ${i}/${total}`, st.key);
    }
  }
  const mp4 = path.join(out, 'severance-daynight-loop.mp4');
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-framerate', String(fps), '-i', path.join(frames, 'f%04d.jpg'), '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', mp4]);
  review.clip.file = mp4;
  log('clip encoded');

  // A dormant gate at night (same framings): the presentation settles in exact steps.
  game.severance.phase = 'dormant';
  await page.waitForFunction(() => window.__attune.state().world.severance?.phase === 'dormant', null, poll);
  await page.evaluate(() => { window.__attune.timeOfDay({ key: 'night' }); for (let i = 0; i < 120; i++) window.__attune.severanceStep(0.1, false); });
  await shoot('dormant-night-wide');
  await frame(DOOR.at, DOOR.cam);
  await shoot('dormant-night-doorway');
  review.checks.dormantLevel = await page.evaluate(() => window.__attune.state().world.severance.level);

  // Through the gate and back at night: the Annex sees the normal lighting, the
  // Expanse gets the preview back on return.
  await page.evaluate(() => { window.__attune.severanceClock(false); window.__attune.pause(false); });
  game.severance.phase = 'active';
  await page.waitForFunction(() => window.__attune.state().world.severance?.phase === 'active', null, poll);
  review.lighting.expanseNight = await lighting();
  const stand = gateToWorld(0, 0.5);
  p.x = stand.x; p.z = stand.z;
  await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [stand.x, stand.z], poll);
  await page.addStyleTag({ content: 'body * { visibility: visible !important; }' });
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'phase_annex', null, poll);
  await page.waitForTimeout(1500);
  review.lighting.annex = await lighting();
  const exit = game.rift.exit;
  p.x = exit.x; p.z = exit.z - 1.7;
  await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [p.x, p.z], poll);
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'severance_expanse', null, poll);
  await page.waitForTimeout(1500);
  review.lighting.expanseNightAfterReturn = await lighting();
  await page.addStyleTag({ content: 'body * { visibility: hidden !important; } #view { visibility: visible !important; }' });
  await page.evaluate(() => { window.__attune.severanceClock(true); window.__attune.pause(true); });
  await frame(DOOR.at, DOOR.cam);
  await shoot('after-return-night');
  await page.evaluate(() => { window.__attune.severanceClock(false); window.__attune.pause(false); });
  const beacon = game.severance.beacon;
  p.x = beacon.x; p.z = beacon.z + 1.6;
  await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 0.6; }, [p.x, p.z], poll);
  await page.addStyleTag({ content: 'body * { visibility: visible !important; }' });
  await page.locator('#view').focus();
  await page.keyboard.press('KeyF');
  await page.waitForFunction(() => window.__attune.state().you?.region === 'reach', null, poll);
  await page.waitForTimeout(1500);
  review.lighting.reachAfterReturn = await lighting();
  const same = (a, b) => JSON.stringify({ ...a, portal: 0 }) === JSON.stringify({ ...b, portal: 0 });
  review.checks.annexHasNormalLighting = same(review.lighting.annex, review.lighting.reach);
  review.checks.reachRestored = same(review.lighting.reachAfterReturn, review.lighting.reach);
  review.checks.expanseNightRestoredOnReturn = same(review.lighting.expanseNightAfterReturn, review.lighting.expanseNight);
  review.errors = errors;
  fs.writeFileSync(path.join(out, 'review.json'), JSON.stringify(review, null, 1));
  log('checks', JSON.stringify(review.checks), 'errors', errors.length);
} finally {
  await browser?.close();
  await server.close();
}
