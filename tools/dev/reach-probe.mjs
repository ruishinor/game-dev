import { startServer } from '../../server/index.js';
import { launchBrowser } from '../../tools/browser.mjs';
const server = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
  await page.goto(`http://127.0.0.1:${server.port}/?q=2&qlock=1&nolock=1`);
  await page.fill('#name', 'Probe'); await page.click('.classcard[data-cls="vanguard"]'); await page.click('#enter');
  await page.waitForFunction(() => { const s = window.__attune?.state(); return s?.myId && s.sheet && s.drawn >= 2; }, null, { polling: 250 });
  await page.waitForTimeout(8000);
  const r = await page.evaluate(() => { const s = window.__attune.state(); let veins = 0, vis = 0; window.__attune.gfx.scene.traverse(o => { if (o.name === 'vein:resonant') { veins++; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) v = false; if (v) vis++; } });
    return { ents: s.ents.length, veinEnts: s.ents.filter(e => e.c === 'resonant_vein').length, veins, vis, draw: s.draw }; });
  console.log(JSON.stringify(r));
} finally { await browser.close(); await server.close(); }
