import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { makeGame, makeChar, place } from './helpers.js';
import { ITEMS, MAX_LEVEL, SKILL_NAMES } from '../shared/content.js';
import { deriveStats, tryEquip, describeRequirements } from '../shared/build.js';
import { buildPreviewOptions, persistentBuildRecord } from '../server/gm-build.js';
import { equipItem, unequipSlot, tickInscription } from '../server/sim/progress.js';
import { MATERIALS, MATERIAL_CAP } from '../shared/crafting.js';
import { CREDIT_CAP } from '../server/sim/wallet.js';
import { WORLD, RIFT_ANNEX, travelRegionAt, inSafeZone } from '../shared/world.js';
import { gmIds, gmAuthorized, executeGm, GM_HELP } from '../server/gm.js';
import { CharacterStore } from '../server/store.js';
import { startServer } from '../server/index.js';
import { dealDamage, useAbility } from '../server/sim/combat.js';

test('GM allowlist defaults off and accepts only account UUIDs', () => {
  const id = '2ad75896-3e75-46a7-9f4c-20b467d2ae71';
  assert.equal(gmIds().size, 0);
  assert.equal(gmIds('admin,guest,not-a-uuid').size, 0);
  assert.deepEqual([...gmIds(' ' + id.toUpperCase() + ',' + id + ' ')], [id]);
  assert.equal(gmAuthorized({}, gmIds(id), null, null, null), false);
});

test('GM level and unlock respect the current server cap and are replay-safe', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard')), other = g.addPlayer(makeChar('vanguard'));
  assert.ok(GM_HELP.includes('1–' + MAX_LEVEL));
  assert.equal(executeGm(g, p, 'level ' + MAX_LEVEL).ok, true);
  assert.equal(p.char.level, MAX_LEVEL);
  assert.equal(p.char.xp, 0);
  assert.equal(p.hp, p.maxHp);
  assert.equal(other.char.level, 1);
  for (const invalid of ['level 0', 'level -1', 'level 01', 'level 0x2', 'level 2.5',
    'level ' + (MAX_LEVEL + 1), 'level NaN', 'level Infinity', 'teleport reach',
    'unknown', 'unlock extra', 'god always', 'tp foundry', 'tp expanse', 'tp 10,20']) {
    assert.equal(executeGm(g, p, invalid).ok, false, invalid);
  }
  assert.equal(executeGm(g, p, 'unlock').ok, true);
  assert.equal(executeGm(g, p, 'unlock').ok, true);
  assert.equal(p.char.riftCalibration, 'completed');
  assert.deepEqual(p.char.attunements.filter(a => a === 'resonance'), ['resonance']);
  assert.equal(other.char.attunements.length, 0);
  assert.equal(executeGm(g, p, 'status').ok, true);
});

test('teleport resolves within real regions without opening shared world encounters', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('keeper'));
  const before = { expanse: g.expanseOpened, annex: g.annexOpened, foundry: g.foundryOpened };
  assert.equal(executeGm(g, p, 'tp reach').ok, true);
  assert.equal(travelRegionAt(p.x, p.z), 'reach');
  assert.ok(Math.hypot(p.x - WORLD.spawn.x, p.z - WORLD.spawn.z) < 2);
  assert.equal(executeGm(g, p, 'tp annex').ok, true);
  assert.equal(travelRegionAt(p.x, p.z), 'phase_annex');
  assert.ok(Math.hypot(p.x - RIFT_ANNEX.x, p.z - RIFT_ANNEX.arrivalZ) < 8);
  assert.deepEqual({ expanse: g.expanseOpened, annex: g.annexOpened, foundry: g.foundryOpened }, before);
  assert.deepEqual(p.char.pos, WORLD.spawn, 'disconnected encounter location must not be persisted');
  assert.equal(executeGm(g, p, 'tp reach').ok, true);
  assert.equal(executeGm(g, p, 'tp scar').ok, true);
  assert.equal(travelRegionAt(p.x, p.z), 'reach');
});

test('real outside-safe-zone damage baseline proves session-only invulnerability', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard'));
  place(p, -42, 26);
  assert.equal(inSafeZone(p), false, 'damage baseline must not be in a safe zone');
  const start = p.hp;
  assert.ok(dealDamage(g, null, p, 20, 'gm_probe') > 0);
  assert.ok(p.hp < start);
  assert.equal(executeGm(g, p, 'heal').ok, true);
  assert.equal(executeGm(g, p, 'god on').ok, true);
  assert.equal(dealDamage(g, null, p, 50, 'gm_probe'), 0);
  assert.equal(p.hp, p.maxHp);
  assert.equal(p.char.gmInvulnerable, undefined);
  assert.equal(executeGm(g, p, 'god off').ok, true);
  assert.ok(dealDamage(g, null, p, 10, 'gm_probe') > 0);
});


test('GM kill defeats only the selected living enemy through normal death handling without rewards', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard')), bystander = g.addPlayer(makeChar('keeper'));
  const enemy = g.enemies.find(e => e.state !== 'dead' && e.state !== 'evade');
  assert.ok(enemy);
  const baseline = { xp:p.char.xp, step:p.char.quest.step, progress:p.char.quest.progress,
    otherXp:bystander.char.xp, otherProgress:bystander.char.quest.progress };
  assert.match(GM_HELP,/\/gm kill/);
  assert.equal(executeGm(g,p,'kill').ok,false,'nothing selected');
  assert.equal(executeGm(g,p,'kill 123').ok,false,'cannot supply target id by chat');
  assert.equal(executeGm(g,p,'kill all').ok,false,'cannot mass-kill');
  assert.equal(executeGm(g,p,'kill extra').ok,false,'no ignored trailing arguments');
  assert.equal(enemy.state !== 'dead',true);
  g.setTarget(p,bystander.id);
  assert.equal(executeGm(g,p,'kill').ok,false,'other players protected');
  assert.equal(bystander.dead,false);
  g.setTarget(p,enemy.id);
  // Another combatant's existing threat never turns a GM test command into
  // a reward/quest farming mechanism.
  enemy.threat.set(p.id,10);enemy.threat.set(bystander.id,20);
  const beforeEvents=g.events.length;
  const result=executeGm(g,p,'kill');
  assert.deepEqual(result,{ok:true,action:'kill',target:String(enemy.id)});
  assert.equal(enemy.hp,0);
  assert.equal(enemy.state,'dead');
  assert.equal(enemy.deadAt,g.time);
  assert.ok(enemy.respawnAt>g.time);
  assert.equal(enemy.threat.size,0);
  assert.equal(enemy.lootByPlayer.size,0);
  assert.ok(g.events.slice(beforeEvents).some(e=>e.e==='die'&&e.id===enemy.id));
  assert.deepEqual({ xp:p.char.xp, step:p.char.quest.step, progress:p.char.quest.progress,
    otherXp:bystander.char.xp, otherProgress:bystander.char.quest.progress },baseline);
  const deaths=g.events.filter(e=>e.e==='die'&&e.id===enemy.id).length;
  assert.equal(executeGm(g,p,'kill').ok,false,'already dead');
  assert.equal(g.events.filter(e=>e.e==='die'&&e.id===enemy.id).length,deaths,'no repeated kill');
  enemy.state='evade';
  assert.equal(executeGm(g,p,'kill').ok,false,'evading enemy cannot be killed');
  // Re-establish a live enemy, but invalidate its location after selection.
  enemy.state='idle';enemy.hp=enemy.maxHp;enemy.x=RIFT_ANNEX.x;enemy.z=RIFT_ANNEX.arrivalZ;
  assert.equal(executeGm(g,p,'kill').ok,false,'cross-region selection rejected at execution time');
  assert.equal(enemy.state,'idle');
  // The command does not target the GM character even when god mode is enabled.
  g.setTarget(p,p.id);assert.equal(executeGm(g,p,'god on').ok,true);
  assert.equal(executeGm(g,p,'kill').ok,false);
  assert.equal(p.dead,false);
});

test('GM catalogue grants each existing item once, marks inventory and preserves the other player', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard')), other = g.addPlayer(makeChar('keeper'));
  const categories = [
    ['glyphs', ['glyph']], ['device', ['device']], ['implants', ['implant']],
    ['gear', ['chest', 'gloves', 'greaves', 'boots']], ['weapons', ['weapon']],
    ['social clothing', ['social_torso']],
  ];
  for (const [command, slots] of categories) {
    const expected = Object.keys(ITEMS).filter(id => slots.includes(ITEMS[id].slot));
    const previousRev = p.inventoryRev;
    assert.equal(executeGm(g, p, command).ok, true, command);
    assert.ok(expected.length > 0, command);
    assert.ok(expected.every(id => p.char.inventory.includes(id)), command);
    assert.ok(expected.every(id => p.char.unseenItems.includes(id)), 'new items marked unseen');
    assert.ok(p.inventoryRev > previousRev, 'inventory revision advanced');
    const count = p.char.inventory.length;
    assert.equal(executeGm(g, p, command).ok, true, 'repeated grants succeed without duplicates');
    assert.equal(p.char.inventory.length, count);
  }
  assert.equal(p.char.inventory.length, Object.keys(ITEMS)
    .filter(id => ['glyph', 'device', 'implant', 'chest', 'gloves', 'greaves', 'boots', 'weapon', 'social_torso'].includes(ITEMS[id].slot)).length);
  assert.equal(other.char.inventory.length, 0);
  assert.deepEqual(p.char.equipped, { device: null, implant: null, glyph: null });
});

test('GM credits and materials are additive, validated and capped', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('surveyor', { credits: 0 }));
  assert.equal(executeGm(g, p, 'credits 999').ok, true);
  assert.equal(p.char.credits, 999);
  assert.equal(executeGm(g, p, 'credits 1').ok, true);
  assert.equal(p.char.credits, 1000);
  for (const invalid of ['credits 0', 'credits -1', 'credits 1.5', 'credits 0x1', 'credits 1000001',
    'credits NaN', 'credits 01', 'mats 0', 'mats -2', 'mats 100', 'mats 1.5', 'mats NaN']) {
    assert.equal(executeGm(g, p, invalid).ok, false, invalid);
  }
  assert.equal(executeGm(g, p, 'mats 10').ok, true);
  for (const id of Object.keys(MATERIALS)) assert.equal(p.char.materials[id], 10, id);
  assert.equal(executeGm(g, p, 'mats 10').ok, true);
  for (const id of Object.keys(MATERIALS)) assert.equal(p.char.materials[id], 20, id);
  assert.equal(executeGm(g, p, 'mats 99').ok, true);
  assert.equal(executeGm(g, p, 'mats 99').ok, true);
  for (const id of Object.keys(MATERIALS)) assert.equal(p.char.materials[id], MATERIAL_CAP, id);
  p.char.credits = CREDIT_CAP;
  assert.equal(executeGm(g, p, 'credits 1').ok, false, 'wallet overflow rejected');
  assert.equal(p.char.credits, CREDIT_CAP);
});

test('GM speed 200 means +200% (3x), session only, with server movement authority', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('keeper')), other = g.addPlayer(makeChar('keeper'));
  assert.equal(executeGm(g, p, 'speed 200').ok, true);
  assert.equal(g.moveSpeedMul(p), 3);
  assert.equal(g.moveSpeedMul(other), 1);
  assert.equal(p.char.gmSpeedBonus, undefined, 'bonus never written to character save');
  for (const invalid of ['speed -1', 'speed 301', 'speed 1.5', 'speed NaN', 'speed 020']) {
    assert.equal(executeGm(g, p, invalid).ok, false, invalid);
  }
  assert.equal(g.moveSpeedMul(p), 3);
  assert.equal(executeGm(g, p, 'speed 0').ok, true);
  assert.equal(g.moveSpeedMul(p), 1);
  assert.equal(executeGm(g, p, 'speed 200').ok, true);
  const char = p.char;
  g.removePlayer(p.id);
  const resumed = g.addPlayer(char);
  assert.equal(g.moveSpeedMul(resumed), 1, 'reconnect clears GM speed');
});

test('GM stats bonus applies to every base skill, replaces rather than stacks, and resets', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard')), other = g.addPlayer(makeChar('keeper'));
  const baseline = structuredClone(p.stats), otherBaseline = structuredClone(other.stats);
  assert.equal(executeGm(g,p,'stats 20').ok,true);
  for (const key of Object.keys(SKILL_NAMES)) assert.equal(p.stats.skills[key],baseline.skills[key]+20);
  assert.ok(Math.abs(p.stats.power-baseline.power-.4)<1e-9);
  assert.equal(p.maxHp,baseline.maxHp,'health is derived from level and gear, not base skills');
  assert.equal(g.sheet(p).buildPreview.attributeBonus,20);
  assert.equal(g.sheet(other).buildPreview,undefined);
  assert.deepEqual(other.stats,otherBaseline);
  assert.equal(p.char.gmAttributeBonus,undefined);
  assert.equal(executeGm(g,p,'stats 20').ok,true);
  assert.equal(p.stats.skills.kinetics,baseline.skills.kinetics+20);
  for(const invalid of ['stats -1','stats 101','stats 1.5','stats NaN','stats 01','stats 1e2','stats 10 extra'])assert.equal(executeGm(g,p,invalid).ok,false,invalid);
  assert.equal(executeGm(g,p,'stats 5').ok,true);
  g.refreshStats(p);
  assert.equal(p.stats.skills.kinetics,baseline.skills.kinetics+5);
  assert.equal(executeGm(g,p,'status').ok,true);
  assert.ok(p.outbox.some(e=>e.m?.includes('base attributes +5')));
  assert.equal(executeGm(g,p,'stats reset').ok,true);
  assert.deepEqual(p.stats,baseline);
  assert.equal(g.sheet(p).buildPreview,undefined);
});

test('GM class override covers weapon, armour, device, implant, glyph; preserves class and normal requirements', () => {
  const g=makeGame();
  const ids=['electrical_combat_rod','vanguard_field_set_chest','keeper_prism','keeper_resonator','glyph_hinge','field_emitter'];
  const p=g.addPlayer(makeChar('symbiotech',{inventory:ids}));
  const normal=structuredClone(p.stats);
  assert.equal(equipItem(g,p,ids[0]).ok,false);
  assert.equal(executeGm(g,p,'class unlock').ok,true);
  assert.equal(equipItem(g,p,ids[3]).ok,false,'skill requirement remains');
  assert.equal(equipItem(g,p,ids[4]).ok,false,'attunement remains');
  assert.equal(equipItem(g,p,'vanguard_field_set_gloves').ok,false,'ownership remains');
  assert.equal(executeGm(g,p,'stats 20').ok,true);
  assert.equal(executeGm(g,p,'unlock').ok,true);
  for(const id of ids.slice(0,5)){
    assert.equal(tryEquip(g.sheet(p),id,g.sheet(p).buildPreview).ok,true,id);
    assert.equal(equipItem(g,p,id).ok,true,id);
    if(ITEMS[id].slot==='glyph'){g.time=p.inscription.until;tickInscription(g,p);}
    assert.equal(p.char.equipped[ITEMS[id].slot],id);
  }
  assert.equal(p.stats.maxHp,normal.maxHp+18,'foreign armour piece modifies normal derived stats');
  assert.equal(p.cls,'symbiotech');assert.equal(p.char.cls,'symbiotech');
  assert.equal(p.stats.glyph,'glyph_hinge');
  assert.equal(useAbility(g,p,'rending_arc').ok,false,'foreign ability remains unavailable');
  assert.equal(describeRequirements(g.sheet(p),ids[0],buildPreviewOptions(p))[0].met,true);
  assert.equal(executeGm(g,p,'class lock').ok,true);
  for(const id of ids.slice(0,5)){
    assert.notEqual(p.char.equipped[ITEMS[id].slot],id);
    assert.ok(p.char.inventory.includes(id));
  }
  assert.equal(p.stats.maxHp,normal.maxHp);
  assert.equal(p.stats.power,deriveStats(p.char,{attributeBonus:20}).power);
  assert.equal(equipItem(g,p,ids[0]).ok,false);
  assert.equal(equipItem(g,p,'field_emitter').ok,true);
  assert.equal(unequipSlot(g,p,'weapon').ok,true);
});

test('GM dependent gear is removed on stats reset or reconnect; saves exclude preview gear even while active', () => {
  const g=makeGame(), p=g.addPlayer(makeChar('vanguard',{inventory:['keeper_prism','keeper_resonator','longpoint_emitter','field_chest','glyph_hinge'],attunements:['resonance']}));
  assert.equal(executeGm(g,p,'stats 30').ok,true);
  assert.equal(equipItem(g,p,'longpoint_emitter').ok,true);
  assert.equal(equipItem(g,p,'field_chest').ok,true);
  assert.equal(executeGm(g,p,'class unlock').ok,true);
  assert.equal(equipItem(g,p,'keeper_prism').ok,true);
  assert.equal(equipItem(g,p,'keeper_resonator').ok,true);
  assert.equal(equipItem(g,p,'glyph_hinge').ok,true);
  // Changing mode interrupts an in-flight inscription.
  assert.equal(executeGm(g,p,'stats reset').ok,true);
  assert.equal(p.inscription,null);
  assert.notEqual(p.char.equipped.weapon,'longpoint_emitter');
  assert.notEqual(p.char.equipped.implant,'keeper_resonator');
  assert.equal(p.char.equipped.device,'keeper_prism','class override remains active');
  assert.equal(p.char.equipped.chest,'field_chest');
  const disk=persistentBuildRecord(p.char);
  assert.notEqual(disk.equipped.device,'keeper_prism');assert.equal(disk.equipped.chest,'field_chest');
  assert.ok(disk.inventory.includes('keeper_prism'));assert.equal(disk.gmClassUnlocked,undefined);
  const record=p.char;g.removePlayer(p.id);
  const resumed=g.addPlayer(record);
  assert.equal(g.sheet(resumed).buildPreview,undefined);
  assert.deepEqual(resumed.stats,deriveStats(record));
  assert.notEqual(record.equipped.device,'keeper_prism');
  assert.equal(record.equipped.chest,'field_chest');
});

async function connect(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  const msgs = [];
  ws.on('message', chunk => msgs.push(JSON.parse(chunk.toString())));
  ws.on('error', () => {});
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return { ws, msgs, send: msg => ws.send(JSON.stringify(msg)) };
}
async function until(check, detail) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error('Timed out: ' + detail);
}
const messages = (conn, expression) => conn.msgs.find(expression);

test('real WebSocket: signed-in owner, guest, wrong owner, revoked session and reconnect isolation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attune-gm-'));
  const file = path.join(dir, 'characters.json');
  const password = 'Example-GmOnly-Password-2026!';
  const seed = new CharacterStore(file);
  const owner = await seed.registerAccount('PreviewOwner', password);
  const outsider = await seed.registerAccount('PreviewOther', password);
  const ownChar = seed.createForAccount(owner.account, 'OwnerPreview', 'vanguard').char;
  const otherChar = seed.createForAccount(outsider.account, 'OtherPreview', 'keeper').char;
  seed.flush();
  const prior = process.env.ATTUNEMENT_GM_ACCOUNT_IDS;
  process.env.ATTUNEMENT_GM_ACCOUNT_IDS = owner.account.id;
  let srv;
  try {
    srv = await startServer({ port: 0, dataFile: file });
  } finally {
    if (prior === undefined) delete process.env.ATTUNEMENT_GM_ACCOUNT_IDS;
    else process.env.ATTUNEMENT_GM_ACCOUNT_IDS = prior;
  }
  const clients = [];
  try {
    const a = await connect(srv.port); clients.push(a);
    a.send({ t: 'account_login', handle: 'PreviewOwner', password });
    const ready = await until(() => messages(a, m => m.t === 'account_ready'), 'owner login');
    assert.ok(ready.token);
    a.send({ t: 'account_select', id: ownChar.id });
    await until(() => messages(a, m => m.t === 'welcome'), 'owner select');
    const ownerConn = [...srv.net.conns].find(c => c.char?.id === ownChar.id);
    assert.ok(gmAuthorized(ownerConn, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game));
    assert.equal(gmAuthorized({ ...ownerConn, char: { ...ownerConn.char } }, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
    assert.equal(gmAuthorized({ ...ownerConn, player: { ...ownerConn.player } }, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
    assert.equal(gmAuthorized({ ...ownerConn, accountToken: 'f'.repeat(64) }, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
    a.send({ t: 'gm', line: 'level ' + MAX_LEVEL });
    await until(() => srv.store.chars.get(ownChar.id)?.level === MAX_LEVEL, 'owner level');
    a.send({ t: 'gm', line: 'unlock' });
    await until(() => srv.store.chars.get(ownChar.id)?.riftCalibration === 'completed', 'owner unlock');
    a.send({ t: 'gm', line: 'tp annex' });
    await until(() => travelRegionAt(ownerConn.player.x, ownerConn.player.z) === 'phase_annex', 'owner annex transfer');
    assert.ok(!srv.game.annexOpened, 'GM teleport cannot spawn a shared encounter');
    a.send({ t: 'gm', line: 'god on' });
    await until(() => ownerConn.player.gmInvulnerable === true, 'owner god on');
    a.send({ t: 'gm', line: 'level ' + (MAX_LEVEL + 1) });
    await until(() => ownerConn.player.outbox.some(e => /Level must be/.test(e.m)) || 
      a.msgs.some(m => m.t === 's' && m.pv?.some(e => /Level must be/.test(e.m))), 'out of range denied');
    assert.equal(ownerConn.char.level, MAX_LEVEL);

    const b = await connect(srv.port); clients.push(b);
    b.send({ t: 'account_login', handle: 'PreviewOther', password });
    await until(() => messages(b, m => m.t === 'account_ready'), 'other login');
    b.send({ t: 'account_select', id: ownChar.id });
    await until(() => messages(b, m => m.t === 'account_fail' && /does not belong/.test(m.reason)), 'forged character rejected');
    b.send({ t: 'account_select', id: otherChar.id });
    await until(() => messages(b, m => m.t === 'welcome'), 'other select');
    b.send({ t: 'gm', line: 'level ' + MAX_LEVEL });
    await until(() => messages(b, m => m.t === 's' && m.pv?.some(e => /GM access denied/.test(e.m))), 'other GM denial');
    assert.equal(srv.store.chars.get(otherChar.id).level, 1);

    const guest = await connect(srv.port); clients.push(guest);
    guest.send({ t: 'create', name: 'PlainVisitor', cls: 'vanguard' });
    await until(() => messages(guest, m => m.t === 'welcome'), 'guest create');
    guest.send({ t: 'gm', line: 'level ' + MAX_LEVEL });
    await until(() => messages(guest, m => m.t === 's' && m.pv?.some(e => /GM access denied/.test(e.m))), 'guest GM denial');
    assert.equal(srv.store.byName.get('plainvisitor').level, 1);

    // Real protocol authorization, not only helper calls.
    a.send({t:'gm',line:'stats 25'});
    await until(()=>ownerConn.player.gmAttributeBonus===25,'owner stats');
    a.send({t:'gm',line:'class unlock'});
    await until(()=>ownerConn.player.gmClassUnlocked===true,'owner class override');
    a.send({t:'gm',line:'device'});
    await until(()=>ownerConn.char.inventory.includes('keeper_prism'),'owner device grant');
    a.send({t:'equip',item:'keeper_prism'});
    await until(()=>ownerConn.char.equipped.device==='keeper_prism','owner cross-class equip');
    srv.store.flush();
    const activeSave=JSON.parse(fs.readFileSync(file,'utf8')).characters.find(c=>c.id===ownChar.id);
    assert.notEqual(activeSave.equipped.device,'keeper_prism');
    assert.equal(activeSave.gmAttributeBonus,undefined);
    const otherConn=[...srv.net.conns].find(c=>c.char?.id===otherChar.id);
    const guestConn=[...srv.net.conns].find(c=>c.char?.name==='PlainVisitor');
    for(const [client,connection] of [[b,otherConn],[guest,guestConn]]){
      for(const line of ['stats 25','class unlock']){
        const before=client.msgs.length;
        client.send({t:'gm',line});
        await until(()=>client.msgs.slice(before).some(m=>m.t==='s'&&m.pv?.some(e=>/GM access denied/.test(e.m))),'unauthorized '+line);
      }
      assert.equal(connection.player.gmAttributeBonus,undefined);
      assert.equal(connection.player.gmClassUnlocked,undefined);
    }

    // Real socket: the server's selected target is authoritative and the same
    // entity cannot be defeated by a guest or another registered account.
    const enemy = srv.game.enemies.find(e => e.state !== 'dead' && e.state !== 'evade' &&
      travelRegionAt(e.x,e.z) === 'reach');
    assert.ok(enemy,'live enemy available for owner command');
    const originalHp=enemy.hp;
    for(const [client,connection] of [[b,otherConn],[guest,guestConn]]){
      client.send({t:'tgt',id:enemy.id});
      await until(()=>connection.player.target===enemy.id,'non-owner target selection');
      const before=client.msgs.length;
      client.send({t:'gm',line:'kill'});
      await until(()=>client.msgs.slice(before).some(m=>m.t==='s'&&m.pv?.some(e=>/GM access denied/.test(e.m))),
        'unauthorized kill rejected at socket boundary');
      assert.equal(enemy.hp,originalHp,'unauthorized request leaves selected enemy unchanged');
    }
    a.send({t:'gm',line:'tp reach'});
    await until(()=>travelRegionAt(ownerConn.player.x,ownerConn.player.z)==='reach','owner returns to reach');
    a.send({t:'tgt',id:enemy.id});
    await until(()=>ownerConn.player.target===enemy.id,'owner selects enemy via socket');
    a.send({t:'gm',line:'kill'});
    await until(()=>enemy.state==='dead','owner kill via authenticated socket');
    assert.equal(enemy.hp,0);
    assert.equal(enemy.lootByPlayer.size,0,'GM kill never generates loot for combatants');

    const priorPlayer = ownerConn.player;
    a.send({ t: 'account_leave' });
    await until(() => a.msgs.filter(m => m.t === 'account_ready').length > 1, 'owner leaves character');
    a.send({ t: 'account_select', id: ownChar.id });
    await until(() => a.msgs.filter(m => m.t === 'welcome').length > 1, 'owner reconnects character');
    const resumed = [...srv.net.conns].find(c => c.char?.id === ownChar.id);
    assert.notEqual(resumed.player, priorPlayer, 'fresh entity on character reselection');
    assert.notEqual(resumed.player.gmInvulnerable, true, 'god mode cannot leak across sessions');
    assert.equal(resumed.char.level, MAX_LEVEL);
    assert.equal(srv.game.sheet(resumed.player).buildPreview,undefined);
    assert.notEqual(resumed.char.equipped.device,'keeper_prism');
    assert.ok(resumed.char.inventory.includes('keeper_prism'));
    assert.equal(travelRegionAt(resumed.player.x, resumed.player.z), 'reach', 'annex does not persist on reconnect');

    srv.store.revokeAccountSession(resumed.account, ready.token);
    a.send({ t: 'gm', line: 'god on' });
    await until(() => a.msgs.some(m => m.t === 'account_fail'), 'revocation enforced');
    assert.equal(gmAuthorized(resumed, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
  } finally {
    for (const c of clients) c.ws.terminate();
    await srv.close();
  }
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const persisted = record.characters.find(c => c.id === ownChar.id);
  assert.equal(persisted.level, MAX_LEVEL);
  assert.equal(persisted.riftCalibration, 'completed');
  assert.equal(persisted.gmInvulnerable, undefined);
  assert.equal(record.characters.find(c => c.id === otherChar.id).level, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
