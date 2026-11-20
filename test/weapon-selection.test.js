// Vanguard main/ranged weapon slots, server-owned active weapon selection and
// Electrical Combat Rod configuration retention.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeGame, makeChar, place, enemyOf, isolate } from './helpers.js';
import { CLASSES } from '../shared/content.js';
import { equipItem, unequipSlot, setElectricalRodMode, selectWeapon } from '../server/sim/progress.js';
import { tickPlayerCombat, useAbility, dealDamage } from '../server/sim/combat.js';
import { weaponBonus, weaponReach, conditionOf } from '../shared/condition.js';
import { WEAPON_SWITCH, activeWeaponSlot, autoProfile, canSwitchWeapons, migrateWeaponSlots } from '../shared/weapons.js';
import { CharacterStore } from '../server/store.js';
import { startServer } from '../server/index.js';
import WebSocket from 'ws';

const ROD = 'electrical_combat_rod', EMITTER = 'field_emitter';
const armed = (over = {}) => makeChar('vanguard', { inventory: [ROD, EMITTER], ...over });
const rowOf = (g, p) => g.buildRows().find(r => r.i === p.id);
const snapshot = p => JSON.stringify({ inventory: p.char.inventory, equipped: p.char.equipped, condition: p.char.condition ?? {} });

test('rod and emitter occupy independent slots; equipping either preserves the other', () => {
  const g = makeGame(), p = g.addPlayer(armed());
  assert.ok(equipItem(g, p, ROD).ok);
  assert.ok(equipItem(g, p, EMITTER).ok);
  assert.equal(p.char.equipped.weapon, ROD);
  assert.equal(p.char.equipped.ranged, EMITTER);
  // The weapon already in use stays active when the other slot is filled.
  assert.equal(activeWeaponSlot(p.char), 'weapon');
  assert.equal(g.sheet(p).activeWeapon, 'weapon');
  assert.ok(unequipSlot(g, p, 'weapon').ok);
  assert.equal(p.char.equipped.ranged, EMITTER, 'removing the rod keeps the emitter');
  assert.equal(activeWeaponSlot(p.char), 'ranged');
  assert.ok(equipItem(g, p, ROD).ok);
  assert.equal(p.char.equipped.ranged, EMITTER, 're-equipping the rod keeps the emitter');
  assert.equal(activeWeaponSlot(p.char), 'ranged', 'equipping the rod does not hijack the active ranged weapon');
  assert.deepEqual([...p.char.inventory].sort(), [EMITTER, ROD].sort(), 'no duplicated or lost items');
});

test('selection switches attack profile, reach, bonus, presentation and keeps inventory intact', () => {
  const g = makeGame(), p = g.addPlayer(armed());
  equipItem(g, p, ROD); equipItem(g, p, EMITTER);
  const before = snapshot(p);
  assert.equal(rowOf(g, p).er, 1);
  assert.equal(autoProfile(p.char).kind, 'melee');
  assert.equal(weaponBonus(p.char), 3);
  assert.ok(selectWeapon(g, p, 'ranged').ok);
  assert.equal(snapshot(p), before, 'switching never edits inventory or equipped slots');
  assert.equal(autoProfile(p.char), CLASSES.vanguard.rangedAuto);
  assert.equal(weaponReach(p.char), CLASSES.vanguard.rangedAuto.range);
  assert.equal(weaponBonus(p.char), 2);
  assert.equal(rowOf(g, p).er, 3, 'the rod is reported stowed, not in hand');
  assert.equal(g.events.filter(e => e.k === 'weapon_switch' && e.s === p.id).length, 1);
  // Ranged attack lands from beyond melee reach and is a bolt.
  const e = enemyOf(g, 'skitter'); isolate(g, e);
  place(p, e.x + 10, e.z); p.target = e.id; p.autoOn = true; p.nextAuto = 0;
  const hp = e.hp; tickPlayerCombat(g, p, 0);
  assert.equal(hp - e.hp, Math.round((CLASSES.vanguard.rangedAuto.dmg + 2) * p.stats.power * p.stats.dmgMul));
  assert.equal(g.events.filter(x => x.e === 'dmg' && x.s === p.id).at(-1).k, 'bolt');
  // Back on the rod, the same distance is out of melee reach.
  g.time += WEAPON_SWITCH.cooldownMs;
  assert.ok(selectWeapon(g, p, 'weapon').ok);
  assert.equal(rowOf(g, p).er, 1);
  g.time += 5000; const hp2 = e.hp; tickPlayerCombat(g, p, 0);
  assert.equal(e.hp, hp2, 'melee cannot hit at ranged distance');
  place(p, e.x + 1, e.z); tickPlayerCombat(g, p, 0);
  assert.equal(hp2 - e.hp, Math.round((CLASSES.vanguard.auto.dmg + 3) * p.stats.power * p.stats.dmgMul));
  assert.equal(g.events.filter(x => x.e === 'dmg' && x.s === p.id).at(-1).k, 'melee');
});

test('switching works in combat but cannot bypass auto-attack, ability or switch cooldowns', () => {
  const g = makeGame(), p = g.addPlayer(armed());
  equipItem(g, p, ROD); equipItem(g, p, EMITTER);
  p.combatUntil = g.time + 10000;
  p.nextAuto = g.time + 1800; p.gcdUntil = g.time + 600; p.cds = { rending_arc: g.time + 4000 };
  const cds = JSON.stringify(p.cds), gcd = p.gcdUntil;
  assert.ok(selectWeapon(g, p, 'ranged').ok, 'allowed during combat');
  assert.equal(p.nextAuto, g.time + 1800, 'a pending swing is never advanced');
  assert.equal(JSON.stringify(p.cds), cds); assert.equal(p.gcdUntil, gcd);
  assert.equal(selectWeapon(g, p, 'weapon').ok, false, 'switch recovery applies');
  g.time += WEAPON_SWITCH.cooldownMs - 1;
  assert.equal(selectWeapon(g, p, 'weapon').ok, false);
  g.time += 1;
  // A ready swing is delayed by the draw time, not reset to ready.
  p.nextAuto = 0;
  assert.ok(selectWeapon(g, p, 'weapon').ok);
  assert.equal(p.nextAuto, g.time + WEAPON_SWITCH.autoDelayMs);
  // Re-selecting the active weapon is a harmless no-op that does not arm recovery.
  const ready = p.weaponSwitchReady;
  g.time += WEAPON_SWITCH.cooldownMs;
  assert.ok(selectWeapon(g, p, 'weapon').ok);
  assert.equal(p.weaponSwitchReady, ready);
  // Abilities keep their own cooldowns across a switch.
  const e = enemyOf(g, 'skitter'); isolate(g, e); place(p, e.x + 1, e.z); p.target = e.id;
  p.gcdUntil = 0; p.cds = {};
  assert.ok(useAbility(g, p, 'rending_arc').ok);
  g.time += 1000;
  assert.ok(selectWeapon(g, p, 'ranged').ok);
  g.time += 1000;
  assert.equal(useAbility(g, p, 'rending_arc').ok, false, 'switching does not reset ability cooldowns');
});

test('invalid selections, forged slots, empty slots and restricted states are rejected without mutation', () => {
  const g = makeGame(), p = g.addPlayer(armed());
  equipItem(g, p, ROD);
  const before = snapshot(p);
  for (const bad of ['main', 'device', '__proto__', '', null, 1, 'constructor']) assert.equal(selectWeapon(g, p, bad).ok, false, String(bad));
  assert.equal(selectWeapon(g, p, 'ranged').ok, false, 'empty ranged slot');
  assert.equal(canSwitchWeapons(p.char), false);
  equipItem(g, p, EMITTER);
  p.dead = true; assert.equal(selectWeapon(g, p, 'ranged').ok, false); p.dead = false;
  p.production = { id: 'x' }; assert.equal(selectWeapon(g, p, 'ranged').ok, false); p.production = null;
  p.inscription = { itemId: 'x' }; assert.equal(selectWeapon(g, p, 'ranged').ok, false); p.inscription = null;
  assert.equal(activeWeaponSlot(p.char), 'weapon');
  assert.deepEqual(p.char.inventory, JSON.parse(before).inventory, 'rejected selections never touch inventory');
  // A ranged item can never be forced into the main slot, nor the rod into ranged.
  const forged = { ...p.char, equipped: { ...p.char.equipped, weapon: EMITTER, ranged: ROD } };
  assert.equal(activeWeaponSlot(forged), null, 'mis-slotted items are ignored');
  // Unowned items do not count.
  const unowned = { ...p.char, inventory: [] };
  assert.equal(activeWeaponSlot(unowned), null);
  assert.equal(weaponBonus(unowned), 0);
});

test('other classes keep their emitter as their only, active weapon', () => {
  for (const cls of ['symbiotech', 'keeper', 'surveyor']) {
    const g = makeGame(), p = g.addPlayer(makeChar(cls, { inventory: [EMITTER, ROD] }));
    assert.ok(equipItem(g, p, EMITTER).ok);
    assert.equal(equipItem(g, p, ROD).ok, false, 'the rod remains Vanguard-only');
    assert.equal(activeWeaponSlot(p.char), 'ranged');
    assert.equal(autoProfile(p.char), CLASSES[cls].auto, 'class attack unchanged');
    assert.equal(weaponBonus(p.char), 2);
    assert.equal(selectWeapon(g, p, 'weapon').ok, false);
    assert.equal(rowOf(g, p).er, undefined);
  }
});

test('rod configuration requires the rod to be active and is retained across ranged selection', () => {
  const g = makeGame(), p = g.addPlayer(armed());
  equipItem(g, p, ROD); equipItem(g, p, EMITTER);
  assert.ok(setElectricalRodMode(g, p, 'dual').ok);
  assert.equal(rowOf(g, p).er, 2);
  assert.ok(selectWeapon(g, p, 'ranged').ok);
  assert.equal(setElectricalRodMode(g, p, 'rod').ok, false, 'a stowed rod cannot be reconfigured');
  assert.equal(p.char.electricalRodMode, 'dual');
  assert.equal(g.sheet(p).electricalRodMode, 'dual', 'the sheet still reports the retained configuration');
  g.time += WEAPON_SWITCH.cooldownMs;
  assert.ok(selectWeapon(g, p, 'weapon').ok);
  assert.equal(rowOf(g, p).er, 2, 'dual configuration is restored on return');
  // Existing restrictions still apply to configuration changes.
  p.combatUntil = g.time + 1000; assert.equal(setElectricalRodMode(g, p, 'rod').ok, false);
  p.combatUntil = g.time; p.autoOn = true; assert.equal(setElectricalRodMode(g, p, 'rod').ok, false);
  p.autoOn = false; assert.ok(setElectricalRodMode(g, p, 'rod').ok); assert.equal(rowOf(g, p).er, 1);
});

test('only the active weapon wears on defeat', () => {
  const g = makeGame(), p = g.addPlayer(armed());
  equipItem(g, p, ROD); equipItem(g, p, EMITTER); selectWeapon(g, p, 'ranged');
  const e = enemyOf(g, 'skitter'); isolate(g, e); place(p, e.x + 1, e.z);
  dealDamage(g, e, p, 99999, 'test');
  assert.ok(p.dead);
  assert.equal(conditionOf(p.char, EMITTER), 90);
  assert.equal(conditionOf(p.char, ROD), 100);
});

test('legacy single-slot saves migrate deterministically; selection and configuration persist', () => {
  assert.deepEqual(migrateWeaponSlots({ weapon: EMITTER }), { weapon: null, ranged: EMITTER });
  assert.deepEqual(migrateWeaponSlots({ weapon: ROD }), { weapon: ROD });
  assert.deepEqual(migrateWeaponSlots(migrateWeaponSlots({ weapon: EMITTER })), { weapon: null, ranged: EMITTER }, 'idempotent');
  assert.deepEqual(migrateWeaponSlots({ weapon: EMITTER, ranged: 'tuned_emitter' }), { weapon: null, ranged: 'tuned_emitter' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attune-wsel-')), file = path.join(dir, 'characters.json');
  try {
    const store = new CharacterStore(file);
    const legacy = store.create('Legacy Vanguard', 'vanguard');
    legacy.char.inventory = [ROD, EMITTER]; legacy.char.equipped.weapon = EMITTER; legacy.char.electricalRodMode = 'dual';
    const current = store.create('Current Vanguard', 'vanguard');
    current.char.inventory = [ROD, EMITTER]; Object.assign(current.char.equipped, { weapon: ROD, ranged: EMITTER });
    current.char.activeWeapon = 'ranged'; current.char.electricalRodMode = 'dual';
    const forged = store.create('Forged Vanguard', 'vanguard');
    forged.char.inventory = [ROD]; forged.char.equipped.weapon = ROD; forged.char.activeWeapon = 'ranged';
    store.markDirty(); store.flush();
    const reloaded = new CharacterStore(file);
    const a = reloaded.authenticate(legacy.token);
    assert.equal(a.equipped.ranged, EMITTER); assert.equal(a.equipped.weapon, undefined);
    assert.equal(a.electricalRodMode, 'dual');
    const b = reloaded.authenticate(current.token);
    assert.equal(b.equipped.weapon, ROD); assert.equal(b.equipped.ranged, EMITTER);
    assert.equal(b.activeWeapon, 'ranged'); assert.equal(b.electricalRodMode, 'dual');
    const c = reloaded.authenticate(forged.token);
    assert.equal(c.activeWeapon, undefined, 'a selection of an empty slot is dropped');
    assert.equal(activeWeaponSlot(c), 'weapon');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the real socket path validates weapon_select and replicates only the stowed/active rod bit', async () => {
  const server = await startServer({ port: 0, dataFile: null });
  const sockets = [];
  const until = async (fn, what) => { const end = Date.now() + 3000; while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 10)); } throw new Error('timed out: ' + what); };
  const connect = () => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`), msgs = [], rows = new Map(), meta = new Map();
    ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.t === 's') { for (const r of m.ents) rows.set(r.i, r); for (const x of m.meta || []) meta.set(x.i, x); } else msgs.push(m); });
    ws.on('error', () => {});
    sockets.push(ws);
    return { ws, msgs, rows, meta, send: o => ws.send(JSON.stringify(o)) };
  };
  try {
    const owner = connect(), observer = connect();
    await until(() => owner.ws.readyState === 1 && observer.ws.readyState === 1, 'open');
    owner.send({ t: 'create', name: 'Switch One', cls: 'vanguard' });
    observer.send({ t: 'create', name: 'Switch Two', cls: 'keeper' });
    const w = await until(() => owner.msgs.find(m => m.t === 'welcome'), 'welcome');
    await until(() => observer.msgs.find(m => m.t === 'welcome'), 'observer welcome');
    const p = server.game.players.get(w.id);
    p.char.inventory.push(ROD, EMITTER); server.game.markDirty(p);
    owner.send({ t: 'equip', item: ROD }); owner.send({ t: 'equip', item: EMITTER });
    await until(() => observer.rows.get(p.id)?.er === 1 && p.char.equipped.ranged === EMITTER, 'rod in hand for observers');
    owner.send({ t: 'weapon_select', slot: 'device' });
    owner.send({ t: 'weapon_select', slot: { toString: 'ranged' } });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(activeWeaponSlot(p.char), 'weapon', 'malformed selections are refused');
    owner.send({ t: 'weapon_select', slot: 'ranged' });
    await until(() => observer.rows.get(p.id)?.er === 3, 'observers see the rod stowed');
    const seen = observer.meta.get(p.id);
    assert.equal(seen.inventory, undefined); assert.equal(seen.equipped, undefined); assert.equal(seen.activeWeapon, undefined);
    assert.equal(observer.rows.get(p.id).activeWeapon, undefined);
  } finally { for (const ws of sockets) ws.close(); await server.close(); }
});
