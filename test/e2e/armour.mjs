// Live server and browser: worn 3D chest armour and rendered inventory icons.
// The fixture only grants the items; equipping is the player's real inventory
// action (validated by the server), and an observer sees the worn piece via
// replicated presentation metadata. Writes screenshots to armour-evidence/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { launchBrowser, SOFTWARE_GL } from '../../tools/browser.mjs';
import { liveFixturePlayer } from './live-fixture.mjs';
import { ARMOUR_VISUALS, ARMOUR_ASSETS, ARMOUR_SLOTS } from '../../shared/armour-visual.js';
import { ITEMS } from '../../shared/content.js';

const OUT = 'armour-evidence';
fs.mkdirSync(OUT, { recursive: true });
const server = await startServer({ port: 0, dataFile: null });
let browser;
const report = { items: {}, pageErrors: [], consoleErrors: [] };
try {
  browser = await launchBrowser();
  async function join(name, cls) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.setDefaultTimeout(90000);
    page.on('pageerror', (e) => report.pageErrors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /\[assets\]|\[armour\]/.test(m.text()))) report.consoleErrors.push(m.text()); });
    await page.bringToFront();
    await page.goto(`http://127.0.0.1:${server.port}/?q=1&qlock=1&nolock=1${SOFTWARE_GL ? '&rfps=1' : ''}`);
    await page.click('#gate-guest-link');await page.fill('#name', name);
    // A second WebGL page under software GL can starve layout and rAF long
    // enough that Playwright never sees the class card as visible/stable; the
    // join only needs the DOM clicks, so dispatch them directly.
    await page.waitForFunction((c) => !!document.querySelector(`.classcard[data-cls="${c}"]`), cls);
    await page.evaluate((c) => document.querySelector(`.classcard[data-cls="${c}"]`).click(), cls);
    await page.waitForFunction((c) => document.querySelector(`.classcard[data-cls="${c}"]`)?.getAttribute('aria-pressed') === 'true', cls);
    await page.evaluate(() => document.querySelector('#enter').click());
    await page.waitForFunction((c) => { const s = window.__attune?.state(); return s?.myId && s.sheet?.cls === c && s.drawn >= 2; }, cls, { polling: 100 });
    if (SOFTWARE_GL) await page.evaluate(() => window.__attune.pause(true));
    return page;
  }
  // Match the Longpoint gate: only one software-rendered client draws at a
  // time. Simulation, networking and real player input remain live.
  async function capture(page, path) {
    await page.bringToFront();
    if (SOFTWARE_GL) {
      const before = await page.evaluate(() => {
        const n = window.__attune.state().drawn;
        window.__attune.pause(false);
        return n;
      });
      try {
        await page.waitForFunction(n => window.__attune.state().drawn > n + 3, before, { polling: 100 });
      } finally {
        await page.evaluate(() => window.__attune.pause(true));
      }
    } else {
      const before = await page.evaluate(() => window.__attune.state().drawn);
      await page.waitForFunction(n => window.__attune.state().drawn > n + 3, before);
    }
    await page.screenshot({ path });
  }
  const page = await join('Armour Wearer', 'vanguard');
  const p = await liveFixturePlayer(page, server, 'Armour Wearer');
  p.char.inventory.push(...ARMOUR_VISUALS);
  p.char.attunements = [...new Set([...(p.char.attunements || []), 'resonance'])]; // the resonant vest requires Resonance
  server.game.refreshStats(p);
  server.game.markDirty(p);
  await page.waitForFunction((ids) => ids.every((id) => window.__attune.state().sheet.inventory.includes(id)), ARMOUR_VISUALS);

  // rendered icons replace the vector art in the inventory
  await page.locator('#view').focus();
  await page.keyboard.press('KeyI');
  await page.locator('.inventory-window').waitFor({ state: 'visible' });
  const icons = await page.evaluate((ids) => ids.map((id) => {
    const el = document.querySelector(`.inventory-window .item-art[data-art="${id}"] img.item-render`);
    return { id, present: !!el, loaded: !!el && el.complete && el.naturalWidth > 0, src: el?.getAttribute('src') || null };
  }), ARMOUR_VISUALS);
  await page.waitForFunction((ids) => ids.every((id) => { const el = document.querySelector(`.inventory-window .item-art[data-art="${id}"] img.item-render`); return el && el.complete && el.naturalWidth > 0; }), ARMOUR_VISUALS, { timeout: 15000 });
  await page.locator('.inventory-window').screenshot({ path: `${OUT}/inventory.png` });
  report.icons = icons;

  // an observer in the same region
  const watcher = await join('Armour Watcher', 'keeper');
  const wearerId = p.id;
  const observer = await liveFixturePlayer(watcher, server, 'Armour Watcher');
  assert.notEqual(observer.id, wearerId);
  await watcher.waitForFunction((id) => window.__attune.state().ents.some((e) => e.id === id), wearerId);
  await page.bringToFront();

  // equip with the inventory's own context action, validated by the server
  async function equip(id) {
    const cell = page.locator(`.inventory-window button.item-cell[aria-label="${ITEMS[id].name}"]`);
    await cell.click({ button: 'right' });
    await page.getByRole('button', { name: /^(Equip|Swap in)$/ }).first().click();
    await page.waitForFunction(([it, slot]) => window.__attune.state().sheet.equipped[slot] === it, [id, ITEMS[id].slot], { timeout: 15000 });
  }
  // wearer and observer both build the worn piece in every slot of `want`
  async function wornBoth(want) {
    const worn = await (await page.waitForFunction((w) => {
      const s = window.__attune.state();
      const e = s.ents.find((x) => x.id === s.myId);
      return e && Object.entries(w).every(([slot, it]) => e.armourVisual?.[slot] === it && e.armourWornAll?.[slot] === it) ? e : null;
    }, want, { timeout: 30000 })).jsonValue();
    // background tabs pause requestAnimationFrame: let the observer run
    await watcher.bringToFront();
    const seen = await (await watcher.waitForFunction(([wid, w]) => {
      const e = window.__attune.state().ents.find((x) => x.id === wid);
      return e && Object.entries(w).every(([slot, it]) => e.armourVisual?.[slot] === it && e.armourWornAll?.[slot] === it) ? e : null;
    }, [wearerId, want], { timeout: 30000, polling: 100 })).jsonValue();
    return { worn, seen };
  }
  const chests = ARMOUR_VISUALS.filter((id) => ARMOUR_ASSETS[id] === 'armour_chest');
  const cinder = ARMOUR_VISUALS.filter((id) => ARMOUR_ASSETS[id] === 'armour_vanguard_set');
  for (const id of chests) {
    await equip(id);
    const { worn, seen } = await wornBoth({ chest: id });
    await page.bringToFront();
    await page.locator('#view').focus();
    if (await page.locator('.inventory-window').isVisible()) await page.keyboard.press('KeyI');
    await page.evaluate(() => window.__attune.view({ yaw: Math.PI, pitch: 0.12, dist: 3.2, face: Math.PI }));
    await capture(page, `${OUT}/${id}-worn.png`);
    if(id===ARMOUR_VISUALS[0])await capture(watcher, `${OUT}/${id}-observer.png`);
    await page.bringToFront();
    report.items[id] = { worn: worn.armourWorn, observerSees: seen.armourWorn, anim: worn.anim };
    await page.locator('#view').focus();
    if (await page.locator('.inventory-window').isHidden()) await page.keyboard.press('KeyI');
    await page.locator('.inventory-window').waitFor({ state: 'visible' });
  }
  // the four-piece Cinderlock Regalia set: every slot is built for the wearer
  // and the observer, with its emissive channel FX
  const want = {};
  for (const id of cinder) {
    await equip(id);
    want[ITEMS[id].slot] = id;
  }
  const full = await wornBoth(want);
  await page.bringToFront();
  const fx = full.worn.armourFx;
  for (const slot of ARMOUR_SLOTS) assert.equal(fx?.[slot]?.fx, true, `${slot}: emissive channel FX running`);
  await page.locator('#view').focus();
  if (await page.locator('.inventory-window').isVisible()) await page.keyboard.press('KeyI');
  await page.evaluate(() => window.__attune.view({ yaw: Math.PI, pitch: 0.12, dist: 3.4, face: Math.PI }));
  await capture(page, `${OUT}/cinderlock-worn.png`);
  report.cinderlock = { worn: full.worn.armourWornAll, observerSees: full.seen.armourWornAll, fx };
  assert.deepEqual(Object.keys(full.seen.armourWornAll).sort(), [...ARMOUR_SLOTS].sort());
  // removal (the server's own unequip, as the slot's Remove action does)
  // clears the piece for the wearer and the observer
  const { unequipSlot } = await import('../../server/sim/progress.js');
  for (const slot of ARMOUR_SLOTS) assert.equal(unequipSlot(server.game, p, slot).ok, true);
  server.game.markDirty(p);
  await page.bringToFront();
  await page.waitForFunction(() => { const s = window.__attune.state(); const e = s.ents.find((x) => x.id === s.myId); return e && !e.armourVisual && !e.armourWorn && !Object.keys(e.armourWornAll || {}).length; }, null, { timeout: 30000 });
  await watcher.bringToFront();
  await watcher.waitForFunction((wid) => { const e = window.__attune.state().ents.find((x) => x.id === wid); return e && !e.armourVisual && !e.armourWorn && !Object.keys(e.armourWornAll || {}).length; }, wearerId, { timeout: 30000 });
  assert.ok((await liveFixturePlayer(page, server, 'Armour Wearer')) === p, 'wearer remained on the original authenticated session');
  assert.ok((await liveFixturePlayer(watcher, server, 'Armour Watcher')) === observer, 'observer remained on the original authenticated session');
  report.removal = true;
  assert.deepEqual(report.pageErrors, [], 'no page errors');
  assert.deepEqual(report.consoleErrors.filter((t) => /armour|\[models\]/.test(t)), [], 'no armour console errors');
  report.ok = true;
} catch (err) {
  report.error = String(err.stack || err);
  console.error(err);
  // diagnostics in the CI log: the wearer as the client sees it
  try {
    const pages = browser ? browser.contexts().flatMap((c) => c.pages()) : [];
    for (const pg of pages) {
      const st = await pg.evaluate(() => { const s = window.__attune?.state(); const me = s?.ents.find((e) => e.id === s.myId);
        return { myId: s?.myId, me: me && { model: me.model, armourVisual: me.armourVisual, armourWorn: me.armourWorn }, players: s?.ents.filter(e=>e.k==='p').map(e=>({id:e.id,x:e.x,z:e.z,model:e.model,armourVisual:e.armourVisual,armourWorn:e.armourWorn,inView:e.inView})), assets: { loaded: s?.assets?.loaded, failed: s?.assets?.failed } }; }).catch((e) => String(e));
      console.error('[armour-e2e] page state', JSON.stringify(st));
    }
  } catch (e) { console.error('[armour-e2e] diagnostics failed', e); }
  console.error('[armour-e2e] console errors', JSON.stringify(report.consoleErrors.slice(0, 20)));
  console.error('[armour-e2e] page errors', JSON.stringify(report.pageErrors.slice(0, 20)));
} finally {
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  await browser?.close();
  await server.close?.();
  process.exit(report.ok ? 0 : 1);
}
