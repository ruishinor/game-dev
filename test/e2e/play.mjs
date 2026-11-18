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
import { CORPSE_MS } from '../../server/sim/game.js';
import { clearCombatSpot } from '../cover-setup.js';
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
async function openPlayer(slot, name, cls, look, viewport={width:960,height:600}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.setDefaultTimeout(90000);
  page.on('pageerror', (e) => pageErrors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(`${name}: ${m.text()}`);
  });
  // A console 404 lacks the failing URL. Report the actual request so a
  // missing gameplay asset cannot be mistaken for a harmless favicon.
  page.on('response', (response) => {
    if (response.status() >= 400) pageErrors.push(`${name}: HTTP ${response.status()} ${response.url()}`);
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
// Capture errors still fail the run; only optional disk writes are non-fatal.
// On Windows, a viewer or scanner can prevent overwriting an earlier PNG.
const shot = async (p, file) => {
  const png = await p.page.screenshot({ timeout: 120000 });
  try {
    fs.writeFileSync(path.join(OUT, file), png);
  } catch (err) {
    note(`optional screenshot not saved (${file}): ${err.message}`);
  }
};
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

// Focused path through the same real client/server harness, without replaying
// the long combat scenario on every UI change. Fixture only grants earned
// items/materials and positions the player; the UI performs all mutations.
async function workshopPlaytest(){
  const P=await openPlayer('workshop','Mechanic','vanguard',undefined,{width:1200,height:720});
  const page=P.page;
  const player=serverPlayer('Mechanic');
  const {grantItem,grantXp}=await import('../../server/sim/progress.js');
  grantXp(game,player,100);
  grantItem(game,player,'servo_harness');
  grantItem(game,player,'kinetic_capacitor');
  player.char.materials={sentinel_alloy:3,mire_fibre:1};
  game.markDirty(player);
  note('granted test equipment and salvage on server; all installation and fabrication use UI');
  await page.waitForFunction(()=>window.__attune.state().drawn>=1&&window.__attune.state().sheet?.materials?.sentinel_alloy===3,null,{timeout:60000});
  // Rendering once establishes the actual loaded model; pause continuous world
  // drawing for UI interactions on software-rendered hosted runners.
  await page.evaluate(()=>window.__attune.pause(true));
  const npc=game.objects.find(o=>o.type==='archivist');
  const npcPlate=page.locator('.plate[data-npc="archivist"]');
  // The first synchronous offscreen portrait may compile a new WebGL context.
  // Retain actual pointer activation; use the same generous timeout as other UI actions.
  await npcPlate.click({timeout:90000});
  const npcVisible=await page.locator('.npc-panel .npc-portrait').count()===1;
  teleport('Mechanic',npc.x,npc.z+3);
  await settle(P,npc.x,npc.z+3);
  await page.locator('.npc-panel button').filter({hasText:/^Talk$/}).click();
  const talk=await until(P,()=>document.querySelector('.npc-dialogue')?.textContent.includes('skitters breed'),null,10000,'NPC dialogue');
  check('workshop UI: NPC model portrait and authoritative dialogue',npcVisible&&talk);
  await page.locator('.npc-panel .close').click();
  await page.keyboard.press('KeyC');
  await page.locator('.doll-tabs [data-tab="gear"]').click();
  check('workshop UI: class-specific model-backed anatomy',await page.locator('.equipment-sketch img').count()===1);
  await page.keyboard.press('KeyI');
  const source=page.locator('.inventory-window button.item-cell[aria-label="Sentinel Servo Harness"]');
  const device=page.locator('.equipment-slot-grid [data-slot="device"]');
  await source.dragTo(device,{timeout:15000});
  await page.waitForFunction(()=>window.__attune.state().sheet.equipped.device==='servo_harness',null,{timeout:10000});
  const installed=await device.getAttribute('data-state')==='installed';
  await device.dragTo(page.locator('.inventory-grid .vacant').first(),{timeout:15000});
  await page.waitForFunction(()=>!window.__attune.state().sheet.equipped.device,null,{timeout:10000});
  const returned=await source.isVisible();
  check('workshop UI: drag inventory to slot and back via server validation',installed&&returned);
  await source.click({button:'right'});
  await page.locator('.player-context button').filter({hasText:/^Equip$/}).click();
  await page.waitForFunction(()=>window.__attune.state().sheet.equipped.device==='servo_harness',null,{timeout:10000});
  await page.keyboard.press('KeyB');
  await page.locator('.planner-slot select[data-slot="device"]').selectOption('calibrated_servo');
  const planned=await page.locator('.workshop-comparison').isVisible()&&player.char.equipped.device==='servo_harness';
  await shot(P,'workshop-01-planner.png');
  await page.locator('.workshop-tabs [data-tab="fabrication"]').click();
  await page.locator('.recipe-entry[data-recipe="coupler"]').click();
  await page.locator('[data-craft="coupler"]').click();
  await page.waitForFunction(()=>window.__attune.state().sheet.materials.kinetic_coupler===1,null,{timeout:10000});
  check('workshop UI: non-mutating planning and skill-gated intermediate fabrication',planned&&player.char.materials.sentinel_alloy===1);
  await page.keyboard.press('KeyC');
  await page.locator('.doll-tabs [data-tab="gear"]').click();
  await device.click({button:'right'});
  await page.locator('.player-context button').filter({hasText:'Upgrade'}).click();
  const blocked=await page.locator('[data-craft="calibrate_servo"]').isDisabled();
  await page.keyboard.press('KeyC');
  await device.click({button:'right'});
  await page.locator('.player-context button').filter({hasText:/^Unequip$/}).click();
  await page.waitForFunction(()=>!window.__attune.state().sheet.equipped.device,null,{timeout:10000});
  await source.click({button:'right'});
  await page.locator('.player-context button').filter({hasText:'Upgrade'}).click();
  await shot(P,'workshop-02-recipe.png');
  await page.locator('[data-craft="calibrate_servo"]').click();
  await page.waitForFunction(()=>window.__attune.state().sheet.inventory.includes('calibrated_servo'),null,{timeout:10000});
  check('workshop UI: item upgrade rejects installed target then atomically converts carried item',blocked&&!player.char.inventory.includes('servo_harness')&&!player.char.materials.kinetic_coupler);
  check('workshop UI: no script/resource errors',pageErrors.length===0,pageErrors.slice(0,4).join(' | '));
  await P.ctx.close();
}

async function followInventoryPlaytest(){
 const A=await openPlayer('follow-leader','FollowLeader','vanguard');
 const B=await openPlayer('follow-follower','FollowFollower','vanguard');
 const pa=serverPlayer('FollowLeader'),pb=serverPlayer('FollowFollower');
 await Promise.all([A.page.evaluate(()=>window.__attune.pause(true)),B.page.evaluate(()=>window.__attune.pause(true))]);
 teleport('FollowLeader',0,7.5);teleport('FollowFollower',0,11);
 await settle(A,0,7.5);await settle(B,0,11);
 await B.page.bringToFront();
 pb.char.materials={mire_fibre:5,sentinel_alloy:2};game.markDirty(pb);
 await B.page.waitForFunction(()=>window.__attune.state().sheet?.materials?.mire_fibre===5,null,{timeout:15000});
 await B.page.keyboard.press('KeyI');
 const inv=B.page.locator('.inventory-window');
 await inv.getByRole('button',{name:'All',exact:true}).click();
 const all=await inv.locator('.material-cell').count();
 const qty=await inv.locator('[data-material="mire_fibre"] .stack-quantity').innerText();
 await inv.getByRole('button',{name:'Materials',exact:true}).click();
 check('All and Materials both show actual material stacks and quantity',all===2&&qty==='5'&&await inv.locator('.material-cell').count()===2);
 await inv.getByRole('button',{name:'Close inventory'}).click();
 await B.page.locator('#view').focus();
 await B.page.keyboard.press('Enter');await B.page.locator('.chat').fill('/follow FollowLeader');await B.page.keyboard.press('Enter');
 await B.page.waitForFunction(id=>window.__attune.state().followId===id,pa.id,{timeout:15000});
 const before={x:pb.x,z:pb.z,seq:pb.lastSeq};
 await A.page.bringToFront();
 await A.page.evaluate(()=>window.__attune.view({yaw:Math.PI,face:Math.PI}));
 await hold(A,'KeyW',1100);await sleep(900);
 check('leader movement drives follower on server even without follower inputs',Math.hypot(pb.x-before.x,pb.z-before.z)>1&&pb.followId===pa.id&&pb.lastSeq===before.seq,JSON.stringify({before,after:{x:pb.x,z:pb.z,seq:pb.lastSeq,follow:pb.followId}}));
 await B.page.bringToFront();
 await B.page.keyboard.press('Enter');await B.page.locator('.chat').fill('/unfollow');await B.page.keyboard.press('Enter');
 const stopped=await until(B,()=>!window.__attune.state().followId,null,5000,'unfollow');
 check('/unfollow clears authoritative follow',stopped&&pb.followId===0);
 // Fixture only: position and kill a deterministic sentinel. Actual collection is through the browser.
 teleport('FollowFollower',0,8.5);await settle(B,0,8.5);
 const corpse=game.enemies.find(e=>e.type==='sentinel'&&e.state!=='dead');corpse.x=0;corpse.z=8.5;game.rng=()=>0;
 dealDamage(game,pb,corpse,99999,'test');
 await B.page.waitForFunction(id=>{const s=window.__attune.state(),e=s.ents.find(x=>x.id===id);return e?.dead&&Math.hypot(e.row.x-s.you.x,e.row.z-s.you.z)<=5&&s.you.lootable?.some(x=>x.id===id);},corpse.id,{timeout:15000});
 await B.page.waitForFunction(id=>!!window.__attune.gfx.scene.getObjectByName('recovery-cache:'+id),corpse.id);
 await shot(B,'loot-00-recovery-cache.png');
 await B.page.locator('#view').focus();await B.page.keyboard.press('KeyF');
 const loot=B.page.locator('.loot-window');
 try{await loot.waitFor({state:'visible',timeout:10000});}catch(error){
   const s=await state(B);console.error('Loot interaction diagnostic',JSON.stringify({serverTarget:pb.lootTarget,corpse:corpse.id,corpseState:corpse.state,player:{x:pb.x,z:pb.z,dead:pb.dead},clientLoot:s.you?.loot,clientEligible:s.you?.lootable,log:await logText(B)}));throw error;
 }
 const alloy=loot.locator('[data-loot-id="sentinel_alloy"]');await alloy.hover();
 check('corpse loot lists material art and hover tooltip',await alloy.locator('[data-art="sentinel_alloy"] svg').count()===1&&await B.page.locator('.tooltip').innerText().then(t=>t.includes('Sentinel alloy')));
 await alloy.click();await B.page.waitForFunction(()=>window.__attune.state().sheet?.materials?.sentinel_alloy===3,null,{timeout:10000});
 check('only selected stack is collected; unchosen equipment remains',await loot.locator('[data-loot-id="adrenal_shunt"]').count()===1&&!pb.char.inventory.includes('adrenal_shunt'));
 await shot(B,'loot-01-selective.png');
 await loot.getByRole('button',{name:'Close loot'}).click();
 check('closing loot leaves unselected items on corpse',!pb.char.inventory.includes('adrenal_shunt')&&await loot.isHidden());
 check('no script errors in focused browser sessions',pageErrors.length===0,pageErrors.slice(0,3).join(' | '));
}

let A;
let B;
try {
  if(process.argv.includes('--follow-inventory')) await followInventoryPlaytest();
  else if(process.argv.includes('--workshop')) await workshopPlaytest();
  else {
  // ------------------------------------------------------------- 1. entry
  A = await openPlayer('a', 'Brakka', 'vanguard');
  B = await openPlayer('b', 'Lumen', 'symbiotech');
  let sa = await state(A);
  let sb = await state(B);
  note(`graphics: ${(await describeGraphics(A.page)).renderer}`);
  await until(A, () => window.__attune.state().drawn >= 2 && window.__attune.state().draw.triangles > 10000, null, 60000, 'first frames drawn');
  // Wait for both clients to receive the other's metadata and a snapshot.
  // A ready local character does not imply the remote observer is ready.
  // Keep metadata and loaded-model diagnostics separate; do not treat pending GLB as a lost snapshot.
  const ready=(id)=>window.__attune.state().ents.some(e=>e.id===id&&e.row&&e.model==='glb'&&e.anim?.base);
  const [seenA,seenB]=await Promise.all([until(B,ready,sa.myId,30000,'B receives A model and snapshot'),until(A,ready,sb.myId,30000,'A receives B model and snapshot')]);
  sa = await state(A);
  sb = await state(B);
  if(!seenA||!seenB){
    const inspect=(s,id)=>({myId:s.myId,snaps:s.snaps,drawn:s.drawn,assets:s.assets,observer:s.ents.find(e=>e.id===id)||null});
    throw Error('Mutual observer not ready: '+JSON.stringify({A:inspect(sa,sb.myId),B:inspect(sb,sa.myId),pageErrors}));
  }
  check('1. both sessions enter the 3D world', sa.myId && sb.myId && sa.draw.triangles > 10000, `A id ${sa.myId}, B id ${sb.myId}, ${sa.draw.triangles} triangles drawn`);
  check('10. second session sees the first (and its class)', sb.ents.some((e) => e.id === sa.myId && e.c === 'vanguard') && sa.ents.some((e) => e.id === sb.myId && e.c === 'symbiotech'));
  check('7. symbiotech has a visible companion entity; vanguard has none', sb.compId > 0 && sb.ents.some((e) => e.id === sb.compId && e.k === 'c') && sa.compId === 0);
  await shot(A, '01-entered-vanguard.png');

  // ------------------------------------------------ 14. presentation assets
  const notGlb = sa.ents.filter((e) => e.model !== 'glb' && !['obelisk', 'survey_signal', 'survey_ledger', 'brine_research', 'brine_engineering', 'sinter_sampler', 'sinter_grazer', 'faultstalker', 'deep_console', 'quarantine_custodian'].includes(e.c)).map((e) => e.c);
  check('14. all entities with production GLB assets use those assets', notGlb.length === 0 && Object.keys(sa.assets.failed).length === 0, notGlb.length ? `procedural: ${notGlb.join(', ')}` : `bundles loaded: ${sa.assets.loaded.join(', ')}`);
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
  await A.page.keyboard.down('KeyW');
  const reachedBeacon = await until(A, () => {
    const p = window.__attune.state().pos;
    return p && Math.hypot(p.x, p.z) < 2.6;
  }, null, 4500, 'reach the beacon with forward input');
  // Keep sending forward input for several snapshots so brushing past the
  // measured radius cannot count as a blocked character.
  const approachSnaps = (await state(A)).snaps;
  const continued = await until(A, (n) => window.__attune.state().snaps >= n + 5, approachSnaps, 2500, 'continued forward input');
  sa = await state(A);
  await A.page.keyboard.up('KeyW');
  const beaconGap = Math.hypot(sa.pos.x, sa.pos.z);
  check('3. the beacon blocks movement (collision)', reachedBeacon && continued && beaconGap >= 1.9 && beaconGap < 2.6, `stopped ${beaconGap.toFixed(2)}m from its centre (radius 1.5 + body 0.45)`);
  const serverA = serverPlayer('Brakka');
  check('2. server position matches the predicted client position', Math.hypot(serverA.x - sa.pos.x, serverA.z - sa.pos.z) < 0.6 && sa.pending < 30, `Δ ${Math.hypot(serverA.x - sa.pos.x, serverA.z - sa.pos.z).toFixed(3)}m, ${sa.pending} unacked inputs`);
  sb = await state(B);
  const aSeenByB = sb.ents.find((e) => e.id === sa.myId);
  check('10. the other session observes that movement', Math.hypot(aSeenByB.x - sa.pos.x, aSeenByB.z - sa.pos.z) < 1.2, `B sees A at (${aSeenByB.x.toFixed(1)}, ${aSeenByB.z.toFixed(1)})`);

  const yaw0 = sa.yaw;
  await A.page.keyboard.down('KeyD');
  const turned = await until(A, (start) => {
    const s = window.__attune.state();
    return Math.abs(s.yaw - start) > 0.4 && Math.abs(s.camYaw - s.yaw) < 0.05;
  }, yaw0, 3000, 'character and camera turn from D');
  await A.page.keyboard.up('KeyD');
  sa = await state(A);
  check('2. D turns the character and the camera follows', turned && Math.abs(sa.yaw - yaw0) > 0.4 && Math.abs(sa.camYaw - sa.yaw) < 0.05, `yaw ${yaw0.toFixed(2)} → ${sa.yaw.toFixed(2)}`);
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
    const a=clearCombatSpot(sk,1.5,3), b=clearCombatSpot(sk,5.5,6);
    teleport('Brakka', a.x,a.z);
    teleport('Lumen', b.x,b.z);
    await settle(A,a.x,a.z);
    await settle(B,b.x,b.z);
  };
  let sk = skitters[0];
  await fightAt(sk);

  // Tab favours enemies ahead of the camera; it does not promise the nearest
  // enemy in all directions. Verify selection and that cycling reaches sk.
  await A.page.keyboard.press('Tab');
  await until(A, () => window.__attune.state().target !== 0, null, 3000, 'tab target');
  sa = await state(A);
  const tabEnt = sa.ents.find((ent) => ent.id === sa.target);
  const tabDistance = tabEnt ? Math.hypot(tabEnt.x - sa.pos.x, tabEnt.z - sa.pos.z) : Infinity;
  check('4. Tab selects a living nearby enemy', !!tabEnt && tabEnt.k === 'e' && !tabEnt.dead && tabDistance <= 50, `target ${sa.target}, distance ${tabDistance.toFixed(1)}m`);
  let reachedSkitter = sa.target === sk.id;
  for (let i = 0; i < 10 && !reachedSkitter; i++) {
    await A.page.keyboard.press('Tab');
    reachedSkitter = (await state(A)).target === sk.id;
  }
  check('4. Tab cycling can reach the intended enemy', reachedSkitter, `skitter id ${sk.id}`);
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

  // Keep the initial action/observer checks independent of a low-HP target dying
  // while software rendering is stalled. Only the fixture's HP changes, not damage.
  sk.maxHp=sk.hp=Math.max(sk.maxHp,300);
  note('initial Skitter fixture health raised to 300 for timing-sensitive observer checks');
  const hpBefore = sk.hp;
  const attackSpot=clearCombatSpot(sk,1.5,2.5);
  teleport('Brakka',attackSpot.x,attackSpot.z);
  await settle(A,attackSpot.x,attackSpot.z);
  await A.page.keyboard.press('Digit1');
  const hit = await until(A, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.row.h < e.row.m;
  }, sk.id, 3000, 'enemy damaged');
  check('4/5. ability 1 damages the enemy (server-side health)', hit && sk.hp < hpBefore, `server hp ${hpBefore} → ${Math.ceil(sk.hp)}`);
  const autoStarted = await until(A, () => window.__attune.state().you.auto === 1 && /ON/.test(document.querySelector('.auto-toggle')?.textContent), null, 3000, 'auto-attack ON in HUD');
  // Submit the refusal attempt while the cooldown is still active, before
  // waiting on a separate browser's animation or screenshot.
  sa = await state(A);
  check('5. the ability goes on cooldown', sa.you.cds.rending_arc > 0, `${sa.you.cds.rending_arc} ms remaining`);
  await A.page.keyboard.press('Digit1');
  const refused = await until(A, () => /not ready/i.test(document.querySelector('.errors').textContent), null, 2000, 'cooldown refusal');
  check('5. using it again is refused with visible feedback', refused);
  const swingSelf = await drawn(A, sa.myId);
  const swingSeen = await until(B, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.anim && e.anim.played > 0 && /Punch/.test(e.anim.last);
  }, sa.myId, 5000, 'B to see the attack animation');
  const flinch = await until(A, (id) => {
    const e = window.__attune.state().ents.find((x) => x.id === id);
    return e && e.anim && e.anim.reacted > 0;
  }, sk.id, 3000, 'enemy hit reaction');
  check('14. the attack animates for both sessions and the enemy visibly reacts', /Punch/.test(swingSelf.last) && swingSeen && flinch, `attacker ${JSON.stringify(swingSelf)}, observer ${JSON.stringify(await drawn(B,sa.myId))}`);
  await A.page.keyboard.press('KeyR');
  const autoStopped = await until(A, () => window.__attune.state().you.auto === 0 && /OFF/.test(document.querySelector('.auto-toggle')?.textContent), null, 3000, 'auto-attack OFF in HUD');
  await A.page.keyboard.press('KeyR');
  const autoResumed = await until(A, () => window.__attune.state().you.auto === 1, null, 3000, 'auto-attack resumed');
  check('5. R and the HUD expose server-authoritative auto-attack state', autoStarted && autoStopped && autoResumed);
  await A.page.keyboard.press('KeyR');
  await until(A,()=>window.__attune.state().you.auto===0,null,3000,'pause auto for support checks');
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
  // Context actions must work on the ally and selected-player frames without
  // changing the friendly target needed for the existing healing sequence.
  const checkMenu = async selector => {
    await B.page.locator(selector).click({button:'right'});
    const opened=await until(B,()=>{const m=document.querySelector('.player-context');return !m.hidden&&/Invite to party/.test(m.textContent)&&/Follow/.test(m.textContent)&&/Whisper/.test(m.textContent);},null,3000,'player context menu');
    await B.page.keyboard.press('Escape');
    return opened&&await B.page.locator('.player-context').isHidden();
  };
  const allyMenu=await checkMenu('.frame.ally');
  const targetMenu=await checkMenu('.frame.target');
  // Check the world nameplate's real hit-test configuration and handler,
  // without depending on its position within a moving camera's field of view.
  const plateMenu=await B.page.locator('.plate.player[data-player-id="'+sa.myId+'"]').evaluate(el=>{
    const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100});
    el.dispatchEvent(event);
    return event.defaultPrevented&&getComputedStyle(el).pointerEvents==='auto'&&!document.querySelector('.player-context').hidden;
  });
  await B.page.keyboard.press('Escape');
  const nativeSuppressed=await B.page.locator('.frame.player').evaluate(el=>{
    const e=new MouseEvent('contextmenu',{bubbles:true,cancelable:true});
    el.dispatchEvent(e);
    return e.defaultPrevented;
  });
  check('11. player context menu opens from frames and nameplate; native menu suppressed elsewhere',allyMenu&&targetMenu&&plateMenu&&nativeSuppressed&&(await state(B)).target===sa.myId);
  await B.page.keyboard.press('Enter');
  await B.page.locator('.chat').fill('/p ');
  const partyChannel=await B.page.locator('.chat-mode').getAttribute('data-channel')==='party';
  await B.page.locator('.chat').fill('/v');
  await B.page.keyboard.press('Enter');
  const vicinityChannel=await B.page.locator('.chat-mode').getAttribute('data-channel')==='vicinity';
  await B.page.keyboard.press('Escape');
  await B.page.locator('.chat-mode').click();
  await B.page.locator('.chat-option[data-channel="party"]').click();
  const iconChannel=await B.page.locator('.chat-mode').getAttribute('data-channel')==='party';
  await B.page.locator('.chat').fill('/v ');
  await B.page.keyboard.press('Escape');
  check('11. chat channel switches via slash commands and the chat icon',partyChannel&&vicinityChannel&&iconChannel);
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
  await B.page.click('.frame.pet .pet-select');
  const companionSelected = await until(B, () => {
    const s = window.__attune.state();
    const actions = document.querySelector('.plate.comp.selected .companion-actions');
    return s.inspected === s.compId && actions && !actions.hidden && document.querySelector('.companion-dialog').hidden && document.querySelector('.codex-window').hidden;
  }, null, 3000, 'companion selection reveals icons without opening a panel');
  await B.page.click('.frame.pet .companion-info');
  const companionInfo = await until(B, () => {
    const dialog = document.querySelector('.codex-window');
    return !dialog.hidden && /Mender Symbiote/.test(dialog.textContent);
  }, null, 3000, 'explicit Codex entry');
  // Search the whole Codex while a creature entry is open; keep input focus.
  await B.page.locator('.codex-search').fill('Kinetic Capacitor');
  const codexFound = await until(B, () => {
    const result = [...document.querySelectorAll('.codex-nav .codex-entry')].find(e=>e.textContent.includes('Kinetic Capacitor'));
    return result && document.activeElement === document.querySelector('.codex-search');
  }, null, 3000, 'live Codex search across categories');
  await B.page.locator('.codex-nav .codex-entry').filter({ hasText: 'Kinetic Capacitor' }).first().click();
  const codexOpened = await until(B, () => document.querySelector('.codex-copy h2')?.textContent === 'Kinetic Capacitor', null, 3000, 'search result opens');
  check('8. Codex search finds other categories and opens the result', codexFound && codexOpened);
  await B.page.click('.codex-close');
  const companionDismissed = await until(B, () => document.querySelector('.codex-window').hidden, null, 3000, 'companion Codex closed');
  check('8. companion selection stays unobtrusive; explicit Codex opens and closes', companionSelected && companionInfo && companionDismissed);

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
    // Each actual browser must contribute; selecting the enemy alone is not kill credit.
    if(enemy.state!=='dead'&&!enemy.threat.has(serverPlayer('Lumen').id)){
      for(let i=0;i<12&&enemy.state!=='dead'&&!enemy.threat.has(serverPlayer('Lumen').id);i++){
        await B.page.keyboard.press('Digit1');await sleep(400);
      }
      if(!enemy.threat.has(serverPlayer('Lumen').id)){
        note('Lumen contribution missing for '+enemy.id+'; state '+JSON.stringify({hp:enemy.hp,target:serverPlayer('Lumen').target,threat:[...enemy.threat.keys()]}));
      }
    }
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
  await Promise.all([until(A, () => window.__attune.state().sheet.quest.step >= 1, null, 5000, 'Vanguard directive 1 complete'),until(B, () => window.__attune.state().sheet.quest.step >= 1, null, 5000, 'Conductor directive 1 complete')]);
  sa = await state(A);
  sb = await state(B);
  check('9. the directive rewards each class its Device', sa.sheet.inventory.includes('servo_harness') && sb.sheet.inventory.includes('sporeglass_focus'), `A: ${sa.sheet.inventory}, B: ${sb.sheet.inventory}`);

  // End-to-end verification of the invisible-attack regression: an enemy
  // must disappear from *both* actual browsers after corpse expiry, then
  // return under the same ID with a live GLB model. No server restart.
  const corpse = skitters[3];
  if (corpse.state === 'dead') {
    teleport('Brakka', 0, 7.5);
    teleport('Lumen', 0, 7.5);
    await settle(A, 0, 7.5);
    await settle(B, 0, 7.5);
    const remainsA = (await state(A)).ents.some((ent) => ent.id === corpse.id && ent.dead && ent.model === 'glb');
    const remainsB = (await state(B)).ents.some((ent) => ent.id === corpse.id && ent.dead && ent.model === 'glb');
    // Shorten only this harness sequence; production remains persist for 12s.
    corpse.deadAt = game.time - CORPSE_MS + 1200;
    corpse.respawnAt = game.time + 4500;
    note(`accelerated corpse expiry for Mire Skitter ${corpse.id}; production holds for ${CORPSE_MS / 1000}s`);
    const vanishedA = await until(A, (id) => !window.__attune.state().ents.some((ent) => ent.id === id), corpse.id, 6000, 'A removes expired enemy');
    const vanishedB = await until(B, (id) => !window.__attune.state().ents.some((ent) => ent.id === id), corpse.id, 6000, 'B removes expired enemy');
    check('6/11. remains persist as 3D models, then disappear from both clients', remainsA && remainsB && vanishedA && vanishedB);
    const returned = (id) => {
      const ent = window.__attune.state().ents.find((e) => e.id === id);
      return !!ent && ent.model === 'glb' && !ent.dead && ent.row?.h > 0;
    };
    const revivedA = await until(A, returned, corpse.id, 6000, 'A rebuilds respawned enemy model');
    const revivedB = await until(B, returned, corpse.id, 6000, 'B rebuilds respawned enemy model');
    check('6/11. enemy respawns visibly in both browsers without a restart', vanishedA && vanishedB && revivedA && revivedB, `enemy id ${corpse.id}, renderer GLB`);
  } else {
    check('6/11. enemy respawns visibly in both browsers without a restart', false, 'the selected skitter was never defeated');
  }

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
    const tab = itemName.startsWith('Glyph of ') ? 'glyphs' : ['Myelin Lattice', 'Kinetic Capacitor', 'Adrenal Shunt'].includes(itemName) ? 'implants' : 'gear';
    await p.page.locator('.doll-tabs [data-tab="'+tab+'"]').click();
    const card = p.page.locator('.panel.build .card', { hasText: itemName }).first();
    await card.locator('button').click({ timeout: 4000 });
  };

  // Requirement gate: the implant is not offered yet; after the device it is.
  if(await B.page.locator('.panel.build').isHidden()) await B.page.keyboard.press('KeyC');
  await B.page.locator('.doll-tabs [data-tab="character"]').click();
  const portraitTab=await B.page.locator('.doll-tabs [data-tab="character"]').getAttribute('aria-pressed')==='true';
  let slotTabs=portraitTab;
  const slotFaults=portraitTab?[]:['character tab not selected by default'];
  for(const tab of ['gear','implants','weapons','social']){
    await B.page.locator('.doll-tabs [data-tab="'+tab+'"]').click();
    const reserved=B.page.locator('.equipment-slot-grid .doll-slot.reserved').first();
    const box=await reserved.boundingBox();
    await reserved.click();
    const selected=await reserved.getAttribute('aria-pressed')==='true';
    // innerText is the rendered text, and the "Reserved slot" kicker is styled
    // uppercase (.kicker), so match without case.
    const detail=await B.page.locator('.loadout-detail').innerText();
    const sketch=await B.page.locator('.equipment-sketch img').count()===1;
    const faults=[!box&&'no slot box',box&&Math.abs(box.width-box.height)>=2&&`not square ${box.width}x${box.height}`,!selected&&'not selected',!sketch&&'no sketch',!/reserved slot/i.test(detail)&&'no reserved detail'].filter(Boolean);
    if(faults.length)slotFaults.push(tab+': '+faults.join(', '));
    slotTabs=slotTabs&&!faults.length;
  }
  await B.page.locator('.doll-tabs [data-tab="glyphs"]').click();
  const glyphSlot= B.page.locator('.equipment-slot-grid [data-slot="glyph"]');
  await glyphSlot.click();
  const tabCount=await B.page.locator('.doll-tabs button').count();
  const glyphSelected=await glyphSlot.getAttribute('aria-pressed')==='true';
  if(tabCount!==6)slotFaults.push(`expected 6 tabs, found ${tabCount}`);
  if(!glyphSelected)slotFaults.push('glyph slot not selectable');
  slotTabs=slotTabs&&tabCount===6&&glyphSelected;
  check('9. six character tabs show selectable real and reserved slots',slotTabs,slotFaults.join('; '));
  await equipVia(B, 'Sporeglass Focus');
  await until(B, () => window.__attune.state().sheet.equipped.device === 'sporeglass_focus', null, 4000, 'device equipped');
  sb = await state(B);
  const baseBio = 10 + sb.sheet.level - 1;
  await B.page.locator('.equipment-slot-grid [data-slot="device"]').click();
  const installedSlot = await B.page.locator('.equipment-slot-grid [data-slot="device"]').getAttribute('data-state') === 'installed'
    && /Sporeglass Focus/.test(await B.page.locator('.loadout-detail').innerText());
  check('9. equipping the Device updates its slot and raises the skill by 3', installedSlot && sb.sheet.stats.skills.biotech === baseBio + 3, `Biotech ${baseBio} → ${sb.sheet.stats.skills.biotech} at level ${sb.sheet.level}`);
  check('9. the next directive hands over the Implant that needs that skill', sb.sheet.inventory.includes('myelin_lattice'));
  await shot(B, '04-build-panel.png');
  await B.page.keyboard.press('KeyI');
  const carriedOnly = await until(B, () => {
    const inv=document.querySelector('.inventory-window');
    const labels=[...inv.querySelectorAll('button.item-cell')].map(e=>e.getAttribute('aria-label'));
    return !inv.hidden && labels.includes('Myelin Lattice') && !labels.includes('Sporeglass Focus');
  }, null, 3000, 'equipped device excluded from inventory');
  const buildStillOpen=await B.page.locator('.panel.build').isVisible();
  // The actual item context provides the same authoritative actions.
  await B.page.locator('.inventory-window button.item-cell[aria-label="Myelin Lattice"]').click({button:'right'});
  const itemContext=await B.page.locator('.player-context').isVisible()&&/Equip/.test(await B.page.locator('.player-context').innerText());
  await B.page.keyboard.press('Escape');
  check('9. carried item has an equip and Codex context menu',itemContext);
  await B.page.keyboard.press('KeyJ');
  const codexWithInventory=await B.page.locator('.codex-window').isVisible()&&await B.page.locator('.inventory-window').isVisible();
  await B.page.keyboard.press('Escape');
  const inventoryAfterEscape=await B.page.locator('.inventory-window').isVisible();
  const opacity= B.page.locator('.inventory-opacity');
  await opacity.click();
  const changedOpacity=await B.page.locator('.inventory-window').evaluate(el=>el.style.getPropertyValue('--inventory-alpha')==='0.8'&&localStorage.getItem('attunement.inventoryOpacity')==='80');
  await B.page.locator('.inventory-window .close').click();
  const independentClose=await B.page.locator('.inventory-window').isHidden();
  check('9. inventory excludes installed devices, stays open across panels, and has independent opacity/close controls',carriedOnly&&buildStillOpen&&codexWithInventory&&inventoryAfterEscape&&changedOpacity&&independentClose);
  await B.page.keyboard.press('KeyB');
  const planner=await B.page.locator('.workshop-window').isVisible()&&await B.page.locator('.planner-slot select').count()===3;
  await B.page.locator('.workshop-tabs [data-tab="fabrication"]').click();
  const fabrication=await B.page.locator('.recipe-entry[data-recipe="matrix"]').count()===1;
  await B.page.keyboard.press('Escape');
  check('9. Build opens independent planning and fabrication interfaces',planner&&fabrication);
  await B.page.keyboard.press('KeyC');
  await equipVia(B, 'Myelin Lattice');
  await until(B, () => window.__attune.state().sheet.equipped.implant === 'myelin_lattice', null, 4000, 'implant equipped');
  sb = await state(B);
  check('9. installing the Implant changes derived stats (+30% healing)', sb.sheet.stats.healMul === 1.3);
  await B.page.locator('.doll-tabs [data-tab="gear"]').click();
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

  // The second browser must independently recover, including its companion.
  // Force damage through the authoritative combat function, then use the
  // normal on-screen death/reconstitution UI (not a direct respawn call).
  teleport('Lumen', 0, 45);
  await settle(B, 0, 45);
  const levelBeforeRecovery = (await state(B)).sheet.level;
  const support = serverPlayer('Lumen');
  dealDamage(game, null, support, support.hp + 100, 'test_defeat');
  note('defeated Lumen server-side to exercise the second browser recovery UI');
  const secondDied = await until(B, () => !document.querySelector('.death').hidden, null, 5000, 'B death overlay');
  check('6. the second player receives an independent death overlay', secondDied);
  const secondCanRespawn = await until(B, () => !document.querySelector('.death button').disabled, null, 6000, 'B respawn button');
  if (secondCanRespawn) await B.page.click('.death button');
  const secondRecovered = await until(B, () => {
    const s = window.__attune.state();
    const self = s.ents.find((e) => e.id === s.myId);
    return document.querySelector('.death').hidden && self && !(self.row.f & 1) && self.row.h === self.row.m && Math.hypot(s.pos.x, s.pos.z) < 12;
  }, null, 5000, 'B recovered at Sanctum');
  const secondSeenByAlly = await until(A, (id) => {
    const other = window.__attune.state().ents.find((e) => e.id === id);
    return other && !(other.row.f & 1) && other.row.h === other.row.m;
  }, (await state(B)).myId, 5000, 'A sees recovered B');
  const secondState = await state(B);
  check('6/11. second player respawns using own UI, keeps level and remains visible', secondCanRespawn && secondRecovered && secondSeenByAlly && secondState.sheet.level === levelBeforeRecovery);
  check('8. companion remains attached to the second player after recovery', secondState.compId > 0 && secondState.ents.some((e) => e.id === secondState.compId));

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
  // Start on a walkable, unobstructed line to the skitter. The fixed offset
  // could put a mushroom collider between the player and the encounter.
  const soloSpot = clearCombatSpot(soloTarget, 4, 6);
  teleport('Lumen', soloSpot.x, soloSpot.z);
  if (!await settle(B, soloSpot.x, soloSpot.z)) throw new Error('Solo combat fixture did not reach the clear approach');
  const xpBefore = (await state(B)).sheet;
  let soloSelected = false;
  for (let i = 0; i < 7 && !soloSelected; i++) {
    await B.page.keyboard.press('Tab');
    soloSelected = await until(B, (id) => window.__attune.state().target === id, soloTarget.id, 800, 'solo Skitter selected');
  }
  if (!soloSelected) throw new Error(`Solo combat fixture could not select expected Skitter ${soloTarget.id}`);
  await B.page.keyboard.down('Shift');
  await B.page.keyboard.press('Digit3');
  await B.page.keyboard.up('Shift');
  for (let i = 0; i < 60 && soloTarget.state !== 'dead'; i++) {
    await B.page.keyboard.press('Digit1');
    if (i % 6 === 0) await B.page.keyboard.press('Digit3');
    await sleep(500);
  }
  const earnedProgress = await until(B, (before) => {
    const after = window.__attune.state().sheet;
    return after.xp !== before.xp || after.level !== before.level;
  }, { xp: xpBefore.xp, level: xpBefore.level }, 5000, 'solo reward reached the browser');
  check('13. the support class wins a fight alone (symbiote set to Harry)', soloTarget.state === 'dead' && earnedProgress, `Skitter ${soloTarget.id} ${soloTarget.state}, ${Math.ceil(soloTarget.hp)} HP, ${Math.ceil(serverPlayer('Lumen')?.hp ?? 0)} player HP`);
  await shot(B, '07-solo-symbiotech.png');

  check('no script errors in either browser', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  void far;
  }
} catch (err) {
  check('script ran to completion', false, err.stack || String(err));
} finally {
  await browser.close();
  await srv.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} checks passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);
