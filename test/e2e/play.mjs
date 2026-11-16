// End-to-end gameplay check: a real server and two real browser sessions
// playing together. Run with `npm run e2e` (needs Playwright + Chromium).
//
// Player input goes through the real page (keyboard, mouse, buttons). The
// script also holds a handle on the server process it started and uses it
// for *setup only* — moving characters across the map, wounding them, and
// fast-forwarding the two sentinel kills. Every such step is logged as
// [harness] so it is never mistaken for something a player did.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../../server/index.js';
import { dealDamage } from '../../server/sim/combat.js';
import { launchBrowser, describeGraphics, SOFTWARE_GL } from '../../tools/browser.mjs';


const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out');
fs.mkdirSync(OUT, { recursive: true });
const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'attune-e2e-')), 'characters.json');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const note = (text) => console.log(`[harness] ${text}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const srv = await startServer({ port: 0, dataFile });
const game = srv.game;
const base = `http://127.0.0.1:${srv.port}`;
const browser = await launchBrowser();

// Under software WebGL one frame of this scene takes hundreds of milliseconds,
// and two clients drawing flat out starve each other (and their own game
// logic) of CPU. So in that case each client draws at most once a second
// while its logic keeps running every animation frame; with a real GPU
// (ATTUNEMENT_GPU=1) nothing is capped. Everything still goes through the
// real renderer, and script errors from drawing still fail the run.
const QUERY = `q=0&nolock=1${SOFTWARE_GL ? '&rfps=1' : ''}`;
note(SOFTWARE_GL ? 'software WebGL: each client draws at most 1 frame per second (logic uncapped)' : 'hardware WebGL requested: no draw cap');
const pageErrors = [];
async function openPlayer(slot, name, cls, look) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${name}: ${m.text()}`);
  });
  await page.goto(`${base}/?${QUERY}&slot=${slot}`);
  await page.fill('#name', name);
  await page.click(`.classcard[data-cls="${cls}"]`);
  if (look) await page.click(`.lookcard[data-look="${look}"]`);
  await page.click('#enter');
  await page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().sheet && window.__attune.state().pos, null, { timeout: 20000 });
  return { ctx, page, name };
}

const state = (p) => p.page.evaluate(() => window.__attune.state());
const me = async (p) => {
  const s = await state(p);
  return { s, row: s.ents.find((e) => e.id === s.myId).row };
};
async function until(p, fn, arg, ms, label) {
  try {
    await p.page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
    return true;
  } catch {
    console.log(`      (timed out waiting for: ${label})`);
    return false;
  }
}
const hold = async (p, key, ms) => {
  await p.page.keyboard.down(key);
  await sleep(ms);
  await p.page.keyboard.up(key);
};
const shot = (p, file) => p.page.screenshot({ path: path.join(OUT, file), timeout: 120000 });
/** How one session is currently drawing an entity: model kind and animation state. */
const drawn = (p, id) => p.page.evaluate((i) => {
  const e = window.__attune.state().ents.find((x) => x.id === i);
  return e ? { model: e.model, look: e.a, ...(e.anim || {}) } : null;
}, id);
const LOCOMOTION = ['Walk_Loop', 'Jog_Fwd_Loop', 'Sprint_Loop'];
const logText = (p) => p.page.evaluate(() => document.querySelector('.log').innerText);
const serverPlayer = (name) => [...game.players.values()].find((x) => x.name === name);
function teleport(name, x, z) {
  const p = serverPlayer(name);
  p.x = x;
  p.z = z;
  if (p.companion) {
    p.companion.x = x + 1.5;
    p.companion.z = z - 1.5;
  }
  note(`moved ${name} to (${x.toFixed(0)}, ${z.toFixed(0)})`);
}
const settle = async (p, x, z) =>
  until(p, ([tx, tz]) => {
    const s = window.__attune.state();
    return s.pos && Math.hypot(s.pos.x - tx, s.pos.z - tz) < 1.5;
  }, [x, z], 6000, 'client to accept teleport');

let A;
let B;
try {
  // ------------------------------------------------------------- 1. entry
  A = await openPlayer('a', 'Brakka', 'vanguard');
  B = await openPlayer('b', 'Lumen', 'symbiotech');
  let sa = await state(A);
  let sb = await state(B);
  note(`graphics: ${(await describeGraphics(A.page)).renderer}`);
  await until(A, () => window.__attune.state().drawn >= 2 && window.__attune.state().draw.triangles > 10000, null, 60000, 'first frames drawn');
  sa = await state(A);
  check('1. both sessions enter the 3D world', sa.myId && sb.myId && sa.draw.triangles > 10000, `A id ${sa.myId}, B id ${sb.myId}, ${sa.draw.triangles} triangles drawn`);
  check('10. second session sees the first (and its class)', sb.ents.some((e) => e.id === sa.myId && e.c === 'vanguard') && sa.ents.some((e) => e.id === sb.myId && e.c === 'symbiotech'));
  check('7. symbiotech has a visible companion entity; vanguard has none', sb.compId > 0 && sb.ents.some((e) => e.id === sb.compId && e.k === 'c') && sa.compId === 0);
  await shot(A, '01-entered-vanguard.png');

  // ------------------------------------------------ 14. presentation assets
  const notGlb = sa.ents.filter((e) => e.model !== 'glb' && e.c !== 'obelisk').map((e) => e.c);
  check('14. every character, companion and enemy is drawn from the GLB assets', notGlb.length === 0 && Object.keys(sa.assets.failed).length === 0, notGlb.length ? `procedural: ${notGlb.join(', ')}` : `bundles loaded: ${sa.assets.loaded.join(', ')}`);
  check('14. the world is built from the kits with no missing pieces', sa.world.kits === true && sa.world.fallbacks === 0, JSON.stringify(sa.world));
  const aByB = await drawn(B, sa.myId);
  const bByA = await drawn(A, sb.myId);
  check('14. each session draws the other with its own look, standing idle', aByB.look === 'vanguard_plate' && bByA.look === 'conductor' && aByB.base === 'Idle_Loop' && bByA.base === 'Idle_Loop', `A as seen by B: ${JSON.stringify(aByB)}`);

  // ---------------------------------------------------- 2/3. movement etc.
  const z0 = sa.pos.z;
  await A.page.keyboard.down('KeyW');
  await sleep(900);
  const runSelf = await drawn(A, sa.myId);
  const runSeen = await until(B, ([id, clips]) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.anim && clips.includes(e.anim.base);
  }, [sa.myId, LOCOMOTION], 3000, 'B to see A running');
  await sleep(500);
  await A.page.keyboard.up('KeyW');
  check('14. moving plays a locomotion clip, in the mover\'s session and in the observer\'s', LOCOMOTION.includes(runSelf.base) && runSeen, `own session: ${runSelf.base}`);
  await sleep(300);
  sa = await state(A);
  check('2. W moves the character forward', sa.pos.z < z0 - 1.5, `z ${z0.toFixed(2)} → ${sa.pos.z.toFixed(2)}`);
  await hold(A, 'KeyW', 1600);
  await sleep(300);
  sa = await state(A);
  const beaconGap = Math.hypot(sa.pos.x, sa.pos.z);
  check('3. the beacon blocks movement (collision)', beaconGap >= 1.9 && beaconGap < 2.6, `stopped ${beaconGap.toFixed(2)}m from its centre (radius 1.5 + body 0.45)`);
  const serverA = serverPlayer('Brakka');
  check('2. server position matches the predicted client position', Math.hypot(serverA.x - sa.pos.x, serverA.z - sa.pos.z) < 0.6 && sa.pending < 30, `Δ ${Math.hypot(serverA.x - sa.pos.x, serverA.z - sa.pos.z).toFixed(3)}m, ${sa.pending} unacked inputs`);
  sb = await state(B);
  const aSeenByB = sb.ents.find((e) => e.id === sa.myId);
  check('10. the other session observes that movement', Math.hypot(aSeenByB.x - sa.pos.x, aSeenByB.z - sa.pos.z) < 1.2, `B sees A at (${aSeenByB.x.toFixed(1)}, ${aSeenByB.z.toFixed(1)})`);

  const yaw0 = sa.yaw;
  await hold(A, 'KeyD', 500);
  sa = await state(A);
  check('2. D turns the character and the camera follows', Math.abs(sa.yaw - yaw0) > 0.4 && Math.abs(sa.camYaw - sa.yaw) < 0.05, `yaw ${yaw0.toFixed(2)} → ${sa.yaw.toFixed(2)}`);
  const before = sa.pos;
  await hold(A, 'KeyS', 700);
  await hold(A, 'KeyE', 600);
  sa = await state(A);
  check('2. backpedal and strafe move the character', Math.hypot(sa.pos.x - before.x, sa.pos.z - before.z) > 1.5);

  await A.page.keyboard.down('Space');
  const jumped = await until(A, () => window.__attune.state().you.jy > 0.25, null, 2500, 'jump height');
  await A.page.keyboard.up('Space');
  check('2. Space jumps (server-simulated)', jumped);

  // Mouse: right-drag steers, left-drag orbits only, wheel zooms.
  await sleep(600);
  sa = await state(A);
  await A.page.mouse.move(480, 300);
  await A.page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 8; i++) await A.page.mouse.move(480 + i * 20, 300, { steps: 2 });
  await sleep(200);
  const steer = await state(A);
  await A.page.mouse.up({ button: 'right' });
  check('2. right-drag steers camera and character together', Math.abs(steer.camYaw - sa.camYaw) > 0.3 && Math.abs(steer.yaw - steer.camYaw) < 0.02, `camera yaw ${sa.camYaw.toFixed(2)} → ${steer.camYaw.toFixed(2)}`);
  await A.page.mouse.down({ button: 'left' });
  for (let i = 1; i <= 8; i++) await A.page.mouse.move(640 - i * 20, 300 + i * 4, { steps: 2 });
  await sleep(200);
  const orbit = await state(A);
  await A.page.mouse.up({ button: 'left' });
  check('2. left-drag orbits the camera without turning the character', Math.abs(orbit.camYaw - steer.camYaw) > 0.3 && Math.abs(orbit.yaw - steer.yaw) < 0.02, `camera yaw ${steer.camYaw.toFixed(2)} → ${orbit.camYaw.toFixed(2)}, character yaw ${steer.yaw.toFixed(2)} → ${orbit.yaw.toFixed(2)}`);
  for (let i = 0; i < 5; i++) await A.page.mouse.wheel(0, -120);
  await sleep(900);
  const zoomed = await state(A);
  check('2. mouse wheel zooms the camera', zoomed.camWant < orbit.camWant - 3 && zoomed.camDist <= zoomed.camWant + 0.01, `wanted distance ${orbit.camWant.toFixed(1)} → ${zoomed.camWant.toFixed(1)}`);
  // Put the camera back behind the character for the rest of the run.
  await A.page.keyboard.press('KeyV');

  // Focus loss must not leave keys stuck.
  await A.page.keyboard.down('KeyW');
  await sleep(200);
  await A.page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await sleep(500);
  const p1 = (await state(A)).pos;
  await sleep(600);
  const p2 = (await state(A)).pos;
  await A.page.keyboard.up('KeyW');
  check('2. losing window focus stops movement (no stuck keys)', Math.hypot(p1.x - p2.x, p1.z - p2.z) < 0.05);

  // --------------------------------------------- 4/5/6. targeting + combat
  const skitters = game.enemies.filter((e) => e.type === 'skitter');
  const fightAt = async (sk) => {
    teleport('Brakka', sk.x + 1.5, sk.z + 3);
    teleport('Lumen', sk.x + 7, sk.z + 9);
    await settle(A, sk.x + 1.5, sk.z + 3);
    await settle(B, sk.x + 7, sk.z + 9);
  };
  let sk = skitters[0];
  await fightAt(sk);

  // Click-to-target on the enemy's on-screen position.
  await A.page.keyboard.press('Tab');
  await until(A, (id) => window.__attune.state().target === id, sk.id, 3000, 'tab target');
  sa = await state(A);
  check('4. Tab selects the nearest enemy', sa.target === sk.id);
  await A.page.keyboard.press('Escape');
  await sleep(200);
  // Face the enemy so it is on screen, then click it.
  await hold(A, 'KeyS', 500);
  const spot = await A.page.evaluate((id) => window.__attune.screenOf(id), sk.id);
  if (spot) await A.page.mouse.click(spot.x, spot.y);
  const clicked = await until(A, (id) => window.__attune.state().target === id, sk.id, 2500, 'click target');
  check('4. clicking an enemy selects it', clicked, spot ? `clicked at (${Math.round(spot.x)}, ${Math.round(spot.y)})` : 'enemy was off screen');
  if (!clicked) await A.page.keyboard.press('Tab');
  const plateSelected = await until(A, () => !!document.querySelector('.plate.selected') && !document.querySelector('.frame.target').hidden && /Mire Skitter/.test(document.querySelector('.frame.target .name').textContent), null, 3000, 'target frame');
  check('4. target frame and selected nameplate are shown', plateSelected);

  const hpBefore = sk.hp;
  teleport('Brakka', sk.x + 1.5, sk.z + 2.5);
  await settle(A, sk.x + 1.5, sk.z + 2.5);
  await A.page.keyboard.press('Digit1');
  const hit = await until(A, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.row.h < e.row.m;
  }, sk.id, 3000, 'enemy damaged');
  check('4/5. ability 1 damages the enemy (server-side health)', hit && sk.hp < hpBefore, `server hp ${hpBefore} → ${Math.ceil(sk.hp)}`);
  sa = await state(A);
  check('5. the ability goes on cooldown', sa.you.cds.rending_arc > 0, `${sa.you.cds.rending_arc} ms remaining`);
  const swingSelf = await drawn(A, sa.myId);
  const swingSeen = await until(B, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.anim && e.anim.played > 0 && /Punch/.test(e.anim.last);
  }, sa.myId, 3000, 'B to see the attack animation');
  const flinch = await until(A, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.anim && e.anim.reacted > 0;
  }, sk.id, 3000, 'enemy hit reaction');
  check('14. the attack animates for both sessions and the enemy visibly reacts', /Punch/.test(swingSelf.last) && swingSeen && flinch, `attacker played ${swingSelf.last}`);
  await A.page.keyboard.press('Digit1');
  const refused = await until(A, () => /not ready/i.test(document.querySelector('.errors').textContent), null, 2000, 'cooldown refusal');
  check('5. using it again is refused with visible feedback', refused);
  const floats = await A.page.evaluate(() => document.querySelectorAll('.float').length + document.querySelectorAll('.log .line.out').length);
  check('5. combat feedback: floating numbers and combat log', floats > 0);
  // Exact agreement, not a threshold: at a moment when the server's value is
  // not changing, both sessions must hold precisely that value. (The fight
  // goes on, so sample until a read is bracketed by an unchanged server value.)
  const serverHp = () => Math.max(0, Math.ceil(sk.hp));
  const clientHp = (p) => p.page.evaluate((id) => window.__attune.state().ents.find((x) => x.id === id)?.row.h, sk.id);
  let agreed = false;
  let seen = null;
  for (let i = 0; i < 80 && !agreed; i++) {
    const before = serverHp();
    const [ha, hb] = await Promise.all([clientHp(A), clientHp(B)]);
    seen = { server: serverHp(), a: ha, b: hb };
    agreed = seen.server === before && ha === before && hb === before;
    if (!agreed) await sleep(100);
  }
  check('11. both sessions hold exactly the server\'s enemy health', agreed && seen.server < sk.maxHp && seen.server > 0, `server ${seen.server}, A ${seen.a}, B ${seen.b} of ${sk.maxHp}`);

  // Range check: ability from far away is refused.
  const far = skitters[5];
  await A.page.keyboard.press('Escape');
  await sleep(1200);

  const hurt = await until(A, () => {
    const s = window.__attune.state();
    const r = s.ents.find((e) => e.id === s.myId).row;
    return r.h < r.m;
  }, null, 6000, 'enemy to hit back');
  check('6. the enemy reacts and attacks', hurt && sk.state === 'combat');
  await shot(A, '02-combat-vanguard.png');

  // --------------------------------------- 7/8/11. support + companion
  await B.page.click('.frame.ally');
  sb = await state(B);
  check('11. healer targets the ally from the party frame', sb.target === sa.myId);
  const pA = serverPlayer('Brakka');
  pA.hp = Math.min(pA.hp, 120);
  note('set Brakka to 120 health so healing is measurable');
  await B.page.keyboard.press('Digit2');
  const grafted = await until(A, () => /Mending Graft heals you for \d+/.test(document.querySelector('.log').innerText), null, 4000, 'graft heal seen by ally');
  check('11. Mending Graft from one player heals the other', grafted);
  const baseHeal = Number((/Your Mending Graft heals Brakka for (\d+)/.exec(await logText(B)) || [])[1]);
  const triaged = await until(A, () => /symbiote's mend heals you for \d+/.test(document.querySelector('.log').innerText), null, 6000, 'triage heal seen by ally');
  check("8. the symbiote autonomously mends the injured ally (triage)", triaged);
  const petText = await B.page.evaluate(() => document.querySelector('.frame.pet').innerText);
  check('8. companion frame says what it is doing', /Triage/.test(petText), petText.replace(/\n/g, ' / '));

  await B.page.keyboard.down('Shift');
  await B.page.keyboard.press('Digit2');
  await B.page.keyboard.up('Shift');
  const bonded = await until(A, () => {
    const s = window.__attune.state();
    return s.ents.find((e) => e.id === s.myId).row.b.includes('bond');
  }, null, 5000, 'bond buff on ally');
  check('8. commanding Bond attaches the symbiote to the ally (damage reduction buff)', bonded);
  await shot(B, '03-symbiote-bonded.png');
  await shot(A, '03b-bonded-as-seen-by-ally.png');

  // Kill three skitters together.
  const killCurrent = async (enemy) => {
    for (let i = 0; i < 40 && enemy.state !== 'dead'; i++) {
      await A.page.keyboard.press('Digit1');
      await A.page.keyboard.press('Digit4');
      await B.page.keyboard.press('Digit1');
      await sleep(500);
    }
    return enemy.state === 'dead';
  };
  for (const p of [A, B]) {
    for (let i = 0; i < 8 && (await state(p)).target !== sk.id; i++) {
      await p.page.keyboard.press('Tab');
      await sleep(150);
    }
  }
  let killed = await killCurrent(sk);
  check('6/11. the two players defeat the enemy together', killed);
  let xpA = (await state(A)).sheet.xp;
  let xpB = (await state(B)).sheet.xp;
  check('11. both players are credited for the shared kill', xpA > 0 && xpB > 0, `A ${xpA} xp, B ${xpB} xp`);

  for (const next of [skitters[2], skitters[3]]) {
    await fightAt(next);
    await A.page.keyboard.press('Escape');
    await B.page.keyboard.press('Escape');
    await sleep(300);
    await A.page.keyboard.press('Tab');
    await B.page.keyboard.press('Tab');
    await sleep(300);
    // Tab picks the nearest; make sure both are on the intended enemy.
    for (const p of [A, B]) {
      for (let i = 0; i < 6 && (await state(p)).target !== next.id; i++) {
        await p.page.keyboard.press('Tab');
        await sleep(150);
      }
    }
    killed = await killCurrent(next);
    if (!killed) break;
  }
  await until(A, () => window.__attune.state().sheet.quest.step >= 1, null, 5000, 'directive 1 complete');
  sa = await state(A);
  sb = await state(B);
  check('9. the directive rewards each class its Device', sa.sheet.inventory.includes('servo_harness') && sb.sheet.inventory.includes('sporeglass_focus'), `A: ${sa.sheet.inventory}, B: ${sb.sheet.inventory}`);

  // ------------------------------------------------ 9. build modification
  teleport('Brakka', 3, 9);
  teleport('Lumen', -3, 9);
  await settle(A, 3, 9);
  await settle(B, -3, 9);
  const outOfCombat = (p) => until(p, () => {
    const s = window.__attune.state();
    return !(s.ents.find((e) => e.id === s.myId).row.f & 8);
  }, null, 12000, 'leaving combat');
  await outOfCombat(A);
  await outOfCombat(B);

  const equipVia = async (p, itemName) => {
    const open = await p.page.evaluate(() => !document.querySelector('.panel.build').hidden);
    if (!open) await p.page.keyboard.press('KeyC');
    const card = p.page.locator('.panel.build .card', { hasText: itemName }).first();
    await card.locator('button').click({ timeout: 4000 });
  };

  // Requirement gate: the implant is not offered yet; after the device it is.
  await B.page.keyboard.press('KeyC');
  await equipVia(B, 'Sporeglass Focus');
  await until(B, () => window.__attune.state().sheet.equipped.device === 'sporeglass_focus', null, 4000, 'device equipped');
  sb = await state(B);
  const baseBio = 10 + sb.sheet.level - 1;
  check('9. equipping the Device raises the skill by 3', sb.sheet.stats.skills.biotech === baseBio + 3, `Biotech ${baseBio} → ${sb.sheet.stats.skills.biotech} at level ${sb.sheet.level}`);
  check('9. the next directive hands over the Implant that needs that skill', sb.sheet.inventory.includes('myelin_lattice'));
  await shot(B, '04-build-panel.png');
  await equipVia(B, 'Myelin Lattice');
  await until(B, () => window.__attune.state().sheet.equipped.implant === 'myelin_lattice', null, 4000, 'implant equipped');
  sb = await state(B);
  check('9. installing the Implant changes derived stats (+30% healing)', sb.sheet.stats.healMul === 1.3);
  const removeDisabled = await B.page.locator('.panel.build .slotcard', { hasText: 'Sporeglass Focus' }).locator('button').isDisabled();
  check('9. the Device cannot be removed while the Implant depends on it (UI explains why)', removeDisabled);
  await B.page.keyboard.press('Escape');

  await equipVia(A, 'Sentinel Servo Harness');
  await until(A, () => window.__attune.state().sheet.equipped.device === 'servo_harness', null, 4000, 'A device');
  await equipVia(A, 'Kinetic Capacitor');
  await until(A, () => window.__attune.state().sheet.equipped.implant === 'kinetic_capacitor', null, 4000, 'A implant');
  sa = await state(A);
  check('9. the vanguard build changes too (Charge generation +50%)', sa.sheet.stats.chargeMul === 1.5);
  await A.page.keyboard.press('Escape');

  // The changed capability, experienced: the same heal is now bigger.
  teleport('Brakka', 20, 30);
  teleport('Lumen', 24, 30);
  await settle(A, 20, 30);
  await settle(B, 24, 30);
  await B.page.keyboard.down('Shift');
  await B.page.keyboard.press('Digit3'); // Harry: keep triage out of this measurement
  await B.page.keyboard.up('Shift');
  await sleep(400);
  pA.hp = 100;
  pA.combatUntil = game.time + 4000;
  note('set Brakka to 100 health');
  await B.page.click('.frame.ally');
  await B.page.evaluate(() => (document.querySelector('.log').innerHTML = ''));
  await B.page.keyboard.press('Digit2');
  await until(B, () => /Your Mending Graft heals Brakka for \d+/.test(document.querySelector('.log').innerText), null, 4000, 'second graft');
  const newHeal = Number((/Your Mending Graft heals Brakka for (\d+)/.exec(await logText(B)) || [])[1]);
  check('9. the modification is felt in play: the same heal lands harder', newHeal > baseHeal, `Mending Graft ${baseHeal} → ${newHeal}`);

  // ---------------------------------------------- glyph + attunement
  const sentinels = game.enemies.filter((e) => e.type === 'sentinel');
  const pB = serverPlayer('Lumen');
  for (const s of sentinels.slice(0, 2)) {
    dealDamage(game, pB, s, 99999, 'harness');
    dealDamage(game, pA, s, 1, 'harness');
  }
  note('destroyed two sentinels on Lumen\'s behalf (the fight itself is covered by unit tests)');
  await until(B, () => window.__attune.state().sheet.inventory.includes('glyph_shared_pulse'), null, 4000, 'glyph reward');
  pB.combatUntil = 0;
  await B.page.keyboard.press('KeyC');
  const inert = await B.page.locator('.panel.build .card', { hasText: 'Glyph of Shared Pulse' }).first().innerText();
  check('9. an un-attuned character sees the glyph as inert, with the reason', /Attunement: Resonance/.test(inert) && /✗/.test(inert));
  await B.page.keyboard.press('Escape');
  const ob = game.objects.find((o) => o.type === 'obelisk');
  teleport('Lumen', ob.x + 2.5, ob.z + 1);
  teleport('Brakka', ob.x + 3.5, ob.z + 3);
  await settle(B, ob.x + 2.5, ob.z + 1);
  await settle(A, ob.x + 3.5, ob.z + 3);
  const prompt = await until(B, () => !document.querySelector('.interact').hidden, null, 3000, 'interact prompt');
  await B.page.keyboard.press('KeyF');
  await until(B, () => window.__attune.state().sheet.attunements.includes('resonance'), null, 4000, 'attunement');
  sb = await state(B);
  check('9. discovering the Listening Stone grants an Attunement', prompt && sb.sheet.attunements.includes('resonance'));
  await shot(B, '05-listening-stone.png');
  await equipVia(B, 'Glyph of Shared Pulse');
  await until(B, () => window.__attune.state().sheet.equipped.glyph === 'glyph_shared_pulse', null, 4000, 'glyph equipped');
  await B.page.keyboard.press('Escape');
  const pip = await B.page.evaluate(() => [...document.querySelectorAll('.petbar .slot')].map((b) => !b.querySelector('.pip').hidden));
  check('9. the glyph marks the companion command it rewrites', pip[0] === true && pip[1] === false);
  await B.page.keyboard.down('Shift');
  await B.page.keyboard.press('Digit1');
  await B.page.keyboard.up('Shift');
  await B.page.evaluate(() => (document.querySelector('.log').innerHTML = ''));
  pA.hp = 90;
  pB.hp = pB.maxHp - 40;
  pA.combatUntil = pB.combatUntil = game.time + 8000;
  note('wounded both players near each other');
  const pulsed = await until(B, () => /Shared Pulse heals/.test(document.querySelector('.log').innerText), null, 7000, 'shared pulse heal');
  check('9. with the glyph, the symbiote\'s triage now also heals a second ally', pulsed);

  // --------------------------------------------------------- 12. reconnect
  const beforeReload = await state(B);
  await sleep(4500); // let the periodic save run
  await B.page.reload();
  await B.page.waitForFunction(() => window.__attune && window.__attune.state().myId && window.__attune.state().sheet && window.__attune.state().pos, null, { timeout: 20000 });
  sb = await state(B);
  check(
    '12. reloading the page resumes the same character with its state',
    sb.sheet.name === 'Lumen' && sb.sheet.level === beforeReload.sheet.level && sb.sheet.equipped.glyph === 'glyph_shared_pulse' && sb.sheet.equipped.implant === 'myelin_lattice' && sb.sheet.attunements.includes('resonance') && Math.hypot(sb.pos.x - beforeReload.pos.x, sb.pos.z - beforeReload.pos.z) < 3,
    `level ${sb.sheet.level}, glyph ${sb.sheet.equipped.glyph}, at (${sb.pos.x.toFixed(0)}, ${sb.pos.z.toFixed(0)})`
  );
  check('12. no duplicate character after reconnecting', game.players.size === 2 && game.companions.length === 1);
  const onDisk = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  check('12. state is persisted on the server, not in the browser', onDisk.characters.some((c) => c.name === 'Lumen' && c.equipped.glyph === 'glyph_shared_pulse'));

  // ------------------------------------------------ defeat and recovery
  const sk2 = skitters[1];
  if (sk2.state === 'dead') {
    sk2.respawnAt = 0;
    note('respawned a skitter early');
    await sleep(300);
  }
  teleport('Brakka', sk2.x + 1, sk2.z + 2);
  await settle(A, sk2.x + 1, sk2.z + 2);
  serverPlayer('Brakka').hp = 1;
  note('set Brakka to 1 health next to an enemy');
  const died = await until(A, () => !document.querySelector('.death').hidden, null, 8000, 'death overlay');
  check('6. the player can be defeated (death screen shown)', died);
  const fallen = await until(A, () => {
    const s = window.__attune.state();
    const e = s.ents.find((x) => x.id === s.myId);
    return e && e.anim && e.anim.action === 'Death01';
  }, null, 3000, 'death animation');
  check('14. defeat plays the death animation and holds it', fallen);
  await shot(A, '06-defeated.png');
  await until(A, () => !document.querySelector('.death button').disabled, null, 6000, 'respawn button');
  await A.page.click('.death button');
  await until(A, () => {
    const s = window.__attune.state();
    return document.querySelector('.death').hidden && Math.hypot(s.pos.x, s.pos.z) < 12;
  }, null, 5000, 'respawn at sanctum');
  const ra = await me(A);
  check('6. recovery: respawn at the Sanctum at full health', ra.row.h === ra.row.m && Math.hypot(ra.s.pos.x, ra.s.pos.z) < 12);
  const risen = await until(A, () => {
    const s = window.__attune.state();
    const e = s.ents.find((x) => x.id === s.myId);
    return e && e.anim && e.anim.action === null;
  }, null, 3000, 'death pose released');
  check('14. respawning releases the death pose', risen);

  // --------------------------------------------- 15. appearance independent of class
  const C = await openPlayer('c', 'Rucker', 'vanguard', 'red_rucker');
  const sc = await state(C);
  const cByB = await until(B, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.a === 'red_rucker' && e.model === 'glb';
  }, sc.myId, 6000, 'B to see the Red Rucker look');
  check('15. a second Vanguard can wear the Red Rucker look and other sessions see it', cByB && sc.sheet.cls === 'vanguard' && sc.sheet.look === 'red_rucker' && serverPlayer('Rucker').cls === 'vanguard', `class ${sc.sheet.cls}, look ${sc.sheet.look}`);
  await shot(C, '08-red-rucker.png');
  await C.ctx.close();
  await sleep(300);

  // -------------------------------------------------------- 13. solo play
  await A.ctx.close();
  A = null;
  await sleep(500);
  check('13. the world carries on when the other player leaves', game.players.size === 1);
  const soloTarget = skitters.find((s) => s.state !== 'dead') || skitters[0];
  if (soloTarget.state === 'dead') soloTarget.respawnAt = 0;
  await sleep(300);
  teleport('Lumen', soloTarget.x + 4, soloTarget.z + 12);
  await settle(B, soloTarget.x + 4, soloTarget.z + 12);
  const xpBefore = (await state(B)).sheet;
  await B.page.keyboard.press('Tab');
  for (let i = 0; i < 6 && (await state(B)).target !== soloTarget.id; i++) await B.page.keyboard.press('Tab');
  await B.page.keyboard.down('Shift');
  await B.page.keyboard.press('Digit3');
  await B.page.keyboard.up('Shift');
  for (let i = 0; i < 60 && soloTarget.state !== 'dead'; i++) {
    await B.page.keyboard.press('Digit1');
    if (i % 6 === 0) await B.page.keyboard.press('Digit3');
    await sleep(500);
  }
  const after = (await state(B)).sheet;
  check('13. the support class wins a fight alone (symbiote set to Harry)', soloTarget.state === 'dead' && (after.xp !== xpBefore.xp || after.level !== xpBefore.level), `${serverPlayer('Lumen') ? Math.ceil(serverPlayer('Lumen').hp) : '?'} health left`);
  await shot(B, '07-solo-symbiotech.png');

  check('no script errors in either browser', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  void far;
} catch (err) {
  check('script ran to completion', false, err.stack || String(err));
} finally {
  await browser.close();
  await srv.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
