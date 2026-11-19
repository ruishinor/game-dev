// Live server and browser: worn 3D chest armour and rendered inventory icons.
// The fixture only grants the items; equipping is the player's real inventory
// action (validated by the server), and an observer sees the worn piece via
// replicated presentation metadata. Writes screenshots to armour-evidence/.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { startServer } from '../../server/index.js';
import { launchBrowser, SOFTWARE_GL } from '../../tools/browser.mjs';
import { liveFixturePlayer } from './live-fixture.mjs';
import { ARMOUR_VISUALS } from '../../shared/armour-visual.js';
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
    await page.fill('#name', name);
    await page.click(`.classcard[data-cls="${cls}"]`);
    await page.click('#enter');
    await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.drawn >= 2; });
    return page;
  }
  const page = await join('Armour Wearer', 'vanguard');
  const p = await liveFixturePlayer(page, server, 'Armour Wearer');
  p.char.inventory.push(...ARMOUR_VISUALS);
  p.char.attune = 'resonance'; // the resonant vest requires Resonance
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
  await page.bringToFront();
  const wearerId = p.id;
  await watcher.waitForFunction((id) => window.__attune.state().ents.some((e) => e.id === id), wearerId);

  for (const id of ARMOUR_VISUALS) {
    const name = ITEMS[id].name;
    // equip with the inventory's own context action, validated by the server
    const cell = page.locator(`.inventory-window button.item-cell[aria-label="${name}"]`);
    await cell.click({ button: 'right' });
    await page.getByRole('button', { name: /^(Equip|Swap in)$/ }).first().click();
    await page.waitForFunction((it) => window.__attune.state().sheet.equipped.chest === it, id, { timeout: 15000 });
    const worn = await (await page.waitForFunction((it) => {
      const s = window.__attune.state();
      const me = s.ents.find((e) => e.id === s.myId);
      return me && me.armourVisual === it && me.armourWorn === it ? me : null;
    }, id, { timeout: 30000 })).jsonValue();
    const seen = await (await watcher.waitForFunction(([wid, it]) => {
      const e = window.__attune.state().ents.find((x) => x.id === wid);
      return e && e.armourVisual === it && e.armourWorn === it ? e : null;
    }, [wearerId, id], { timeout: 30000 })).jsonValue();
    await page.locator('#view').focus();
    if (await page.locator('.inventory-window').isVisible()) await page.keyboard.press('KeyI');
    await page.evaluate(() => window.__attune.view({ yaw: Math.PI, pitch: 0.12, dist: 3.2, face: Math.PI }));
    const d0 = await page.evaluate(() => window.__attune.state().drawn);
    await page.waitForFunction((n) => window.__attune.state().drawn > n + 3, d0);
    await page.screenshot({ path: `${OUT}/${id}-worn.png` });
    report.items[id] = { worn: worn.armourWorn, observerSees: seen.armourWorn, anim: worn.anim };
    await page.locator('#view').focus();
    if (await page.locator('.inventory-window').isHidden()) await page.keyboard.press('KeyI');
    await page.locator('.inventory-window').waitFor({ state: 'visible' });
  }
  // removal (the server's own unequip, as the slot's Remove action does)
  // clears the piece for the wearer and the observer
  const res = (await import('../../server/sim/progress.js')).unequipSlot(server.game, p, 'chest');
  assert.equal(res.ok, true);
  server.game.markDirty(p);
  await page.waitForFunction(() => { const s = window.__attune.state(); const me = s.ents.find((e) => e.id === s.myId); return me && !me.armourWorn; }, null, { timeout: 30000 });
  await watcher.waitForFunction((wid) => { const e = window.__attune.state().ents.find((x) => x.id === wid); return e && !e.armourVisual && !e.armourWorn; }, wearerId, { timeout: 30000 });
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
        return { myId: s?.myId, me: me && { model: me.model, armourVisual: me.armourVisual, armourWorn: me.armourWorn }, equipped: s?.sheet?.equipped, assets: { loaded: s?.assets?.loaded, failed: s?.assets?.failed } }; }).catch((e) => String(e));
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
