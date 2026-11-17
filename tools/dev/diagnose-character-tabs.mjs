// Per-tab diagnosis of e2e check 9 (character slot tabs): square boxes,
// selection, sketch image, reserved text (rendered vs raw). Found the uppercase
// .kicker root cause. node tools/dev/diagnose-character-tabs.mjs [width] [height]
import { startServer } from '../../server/index.js';
import { launchBrowser } from '../browser.mjs';
const srv = await startServer({ port: 0, dataFile: null });
const b = await launchBrowser();
const page = await b.newPage({ viewport: { width: Number(process.argv[2]||1280), height: Number(process.argv[3]||720) } });
page.setDefaultTimeout(120000);
const errs=[]; page.on('pageerror',e=>errs.push(e.message)); page.on('console',m=>m.type()==='error'&&errs.push(m.text()));
await page.goto(`http://127.0.0.1:${srv.port}/?q=1&qlock=1&nolock=1`);
await page.fill('#name','Tabby'); await page.click('.classcard[data-cls="symbiotech"]'); await page.click('#enter');
await page.waitForFunction(() => window.__attune?.state().myId && window.__attune.state().drawn > 2);
await page.keyboard.press('KeyC');
console.log('character tab pressed:', await page.locator('.doll-tabs [data-tab="character"]').getAttribute('aria-pressed'));
for (const tab of ['gear','implants','weapons','social']) {
  await page.locator('.doll-tabs [data-tab="'+tab+'"]').click();
  const r = page.locator('.equipment-slot-grid .doll-slot.reserved').first();
  const n = await page.locator('.equipment-slot-grid .doll-slot.reserved').count();
  const box = n ? await r.boundingBox() : null;
  if (n) await r.click();
  const sel = n ? await r.getAttribute('aria-pressed') : null;
  const detail = await page.locator('.loadout-detail').innerText(); const raw = await page.locator('.loadout-detail').textContent(); console.log('innerText:', JSON.stringify(detail.slice(0,40)), 'textContent:', JSON.stringify(raw.slice(0,40)));
  const imgs = await page.locator('.equipment-sketch img').count();
  const svgs = await page.locator('.equipment-sketch svg').count();
  console.log(JSON.stringify({ tab, reserved:n, box: box && [Math.round(box.width*10)/10, Math.round(box.height*10)/10], sel, reservedText: /Reserved slot/.test(detail), imgs, svgs }));
}
(await import('node:fs')).mkdirSync('tools/dev/out', { recursive: true });
await page.screenshot({ path: 'tools/dev/out/tabs.png' });
console.log('errors', errs);
await b.close(); srv.close?.(); process.exit(0);
