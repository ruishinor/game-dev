// Render contact sheets of built assets through the real game loader.
//
//   npm run assets:preview                     default sheets -> docs/evidence/assets/
//   npm run assets:preview -- out.png item...  one sheet of the given items
//
// Items use the syntax documented in client/src/preview.js.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server/index.js';
import { launchBrowser } from '../browser.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'client', 'assets', 'manifest.json'), 'utf8')).assets;
const pieces = (id) => Object.keys(manifest[id].pieces).map((p) => `piece:${id}:${p}`);

const DEFAULT_SHEETS = {
  'characters.png': { cols: 4, cell: 360, items: ['look:vanguard_plate', 'look:red_rucker', 'look:conductor', 'look:archivist', 'mender', 'skitter', 'sentinel', 'warden'] },
  'red-rucker.png': { cols: 4, cell: 360, items: ['look:red_rucker@Idle_Loop@0.3', 'look:red_rucker@Sprint_Loop@0.3', 'look:red_rucker@Punch_Cross@0.45', 'look:red_rucker@Sword_Block@0.5'], yaw: 0.5 },
  'red-rucker-back.png': { cols: 4, cell: 360, items: ['look:red_rucker@Idle_Loop@0.3', 'look:red_rucker@Jog_Fwd_Loop@0.3', 'look:red_rucker@Idle_Shield_Break@0.5', 'look:red_rucker@Death01@0.98'], yaw: 2.6 },
  'combat-poses.png': {
    cols: 5,
    cell: 300,
    items: ['look:vanguard_plate@Punch_Jab@0.4', 'look:vanguard_plate@Punch_Cross@0.45', 'look:vanguard_plate@Sword_Block@0.5', 'look:vanguard_plate@Hit_Chest@0.4', 'look:vanguard_plate@Death01@0.98', 'look:conductor@Spell_Simple_Shoot@0.4', 'look:conductor@Spell_Simple_Enter@0.95', 'look:conductor@OverhandThrow@0.6', 'look:conductor@Sprint_Loop@0.3', 'look:conductor@Hit_Chest@0.4', 'skitter@Run@0.3', 'skitter@Attack@0.45', 'skitter@Hit@0.5', 'skitter@TurnOff@0.98', 'mender@Charging@0.5'],
  },
  'kit-sanctum.png': { cols: 8, cell: 220, items: pieces('sanctum') },
  'kit-nature.png': { cols: 7, cell: 240, items: pieces('nature') },
};

const args = process.argv.slice(2);
const sheets = args.length ? { [args[0]]: { cols: Math.min(6, args.length - 1), cell: 320, items: args.slice(1) } } : DEFAULT_SHEETS;
const outDir = args.length ? process.cwd() : path.join(ROOT, 'docs', 'evidence', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const srv = await startServer({ port: 0, dataFile: null });
const browser = await launchBrowser();
let failed = false;
try {
  for (const [file, sheet] of Object.entries(sheets)) {
    const rows = Math.ceil(sheet.items.length / sheet.cols);
    const page = await browser.newPage({ viewport: { width: sheet.cols * sheet.cell, height: rows * sheet.cell } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const params = new URLSearchParams({ items: sheet.items.join(','), cols: sheet.cols, cell: sheet.cell });
    if (sheet.yaw !== undefined) params.set('yaw', sheet.yaw);
    await page.goto(`http://127.0.0.1:${srv.port}/client/preview.html?${params}`);
    await page.waitForFunction(() => window.__preview && window.__preview.done, null, { timeout: 120000 }).catch(() => errors.push('preview did not finish'));
    const out = path.resolve(outDir, file);
    await page.screenshot({ path: out });
    const result = await page.evaluate(() => window.__preview || null);
    // A sheet only passes if every requested item rendered as asked: a model
    // that is missing, a clip that does not exist, or a silent fall back to
    // the procedural stand-in are all failures, not cosmetic differences.
    const problems = [...errors.map((e) => `script error: ${e}`)];
    if (!result) problems.push('preview produced no result');
    else {
      for (const i of result.info) if (i.problem) problems.push(`${i.item}: ${i.problem}`);
      if (result.info.length !== sheet.items.length) problems.push(`rendered ${result.info.length} of ${sheet.items.length} items`);
      for (const [id, why] of Object.entries(result.assets.failed)) problems.push(`asset ${id}: ${why}`);
    }
    if (problems.length) failed = true;
    console.log(`${problems.length ? 'FAIL' : 'ok  '} ${path.relative(ROOT, out)} (${sheet.items.length} items)${problems.map((p) => `\n     ${p}`).join('')}`);
    await page.close();
  }
} finally {
  await browser.close();
  await srv.close();
}
process.exit(failed ? 1 : 0);
