const ROOT = process.argv[2];
const { startServer } = await import(ROOT + '/server/index.js');
const { launchBrowser } = await import(ROOT + '/tools/browser.mjs');
const { liveFixturePlayer } = await import(ROOT + '/test/e2e/live-fixture.mjs');
const { RIFT_SITE } = await import(ROOT + '/shared/world.js');
const server = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Fps'); await page.click('.classcard[data-cls="keeper"]'); await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  const p = await liveFixturePlayer(page, server, 'Fps');
  const yaw = 0.9; p.x = RIFT_SITE.x + Math.sin(yaw) * 6; p.z = RIFT_SITE.z + Math.cos(yaw) * 6;
  server.game.rift.phase = 'unstable'; server.game.rift.until = Infinity;
  await page.waitForFunction(([x, z]) => { const s = window.__attune.state(); return Math.hypot(s.pos.x - x, s.pos.z - z) < 1; }, [p.x, p.z], { polling: 250, timeout: 60000 });
  await page.evaluate((f) => window.__attune.view({ face: f, yaw: f, pitch: .1, dist: 5 }), yaw + Math.PI);
  await page.waitForTimeout(15000);
  const frameMs = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { if (++n >= 6) res(Math.round((performance.now() - t0) / 6)); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  const setRift = (mode) => page.evaluate((mode) => { const r = window.__attune.gfx.scene.getObjectByName('rift:phase-scar'); if (!r) return 'none';
    r.visible = mode !== 'hidden';
    const m = r.getObjectByName('rift:interference-membrane'); if (m) { m.userData.keep ??= m.onBeforeRender; m.onBeforeRender = mode === 'norefract' ? (() => { m.material.uniforms.uSceneOn.value = 0; }) : m.userData.keep; }
    return mode; }, mode);
  for (const mode of ['visible', 'norefract', 'hidden', 'visible']) { await setRift(mode); await frameMs(); console.log(mode, 'ms/frame', await frameMs()); }
} finally { await browser.close(); await server.close(); }
