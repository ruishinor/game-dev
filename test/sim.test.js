import test from 'node:test';
import assert from 'node:assert/strict';
import { makeChar, makeGame, run, place, enemyOf, isolate } from './helpers.js';
import { useAbility, startAttack, dealDamage, applyHeal, getBuff } from '../server/sim/combat.js';
import { petCommand } from '../server/sim/companion.js';
import { equipItem, unequipSlot, interact, grantItem, grantXp } from '../server/sim/progress.js';
import { ABILITIES, ENEMIES, CLASSES, DIRECTIVES } from '../shared/content.js';
import { stepMove, resolveCollisions, COLLIDERS, WORLD, ZONES, RUN_SPEED, MOVE_DT, PLAYER_RADIUS } from '../shared/world.js';
import { deriveStats, tryEquip, tryUnequip } from '../shared/build.js';
import { CORPSE_MS } from '../server/sim/game.js';

// ---------------------------------------------------------------- movement

test('movement: forward step moves at run speed along facing', () => {
  const s = { x: 0, z: 30, jy: 0, vy: 0 };
  stepMove(s, { f: 1, s: 0, yaw: 0, j: 0 }, 1);
  assert.ok(Math.abs(s.z - (30 + RUN_SPEED * MOVE_DT)) < 1e-9);
  assert.equal(s.x, 0);
});

test('movement: diagonal input is not faster than straight', () => {
  const s = { x: 0, z: 30, jy: 0, vy: 0 };
  stepMove(s, { f: 1, s: 1, yaw: 0, j: 0 }, 1);
  assert.ok(Math.hypot(s.x, s.z - 30) <= RUN_SPEED * MOVE_DT + 1e-9);
});

test('movement: walking into any collider never passes through it; the world edge holds', () => {
  for (const c of COLLIDERS) {
    const reach = (c.r ?? Math.max(c.hw, c.hd)) + 4;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const s = { x: c.x + Math.sin(a) * reach, z: c.z + Math.cos(a) * reach, jy: 0, vy: 0 };
      const yaw = a + Math.PI; // face the centre
      for (let i = 0; i < 120; i++) {
        stepMove(s, { f: 1, s: 0, yaw, j: 0 }, 1);
        if (c.r !== undefined) assert.ok(Math.hypot(s.x - c.x, s.z - c.z) > c.r * 0.6, `tunnelled into ${c.type}`);
        else assert.ok(Math.abs(s.x - c.x) > c.hw - 0.05 || Math.abs(s.z - c.z) > c.hd - 0.05, `tunnelled into ${c.type}`);
      }
    }
  }
  const edge = resolveCollisions({ x: 500, z: 0 }, PLAYER_RADIUS);
  assert.ok(Math.hypot(edge.x, edge.z) <= WORLD.radius);
});

test('movement: jump rises and lands; dead players cannot move', () => {
  const s = { x: 0, z: 30, jy: 0, vy: 0 };
  stepMove(s, { f: 0, s: 0, yaw: 0, j: 1 }, 1);
  assert.ok(s.jy > 0);
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    stepMove(s, { f: 0, s: 0, yaw: 0, j: 0 }, 1);
    peak = Math.max(peak, s.jy);
  }
  assert.ok(peak > 1 && peak < 2.5);
  assert.equal(s.jy, 0);
  stepMove(s, { f: 1, s: 0, yaw: 0, j: 1 }, 0);
  assert.equal(s.z, 30);
  assert.equal(s.jy, 0);
});

test('server movement: input budget bounds speed regardless of how many inputs arrive', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard'));
  place(p, 0, 30);
  const start = p.z;
  // A cheating client sends 10x the inputs real time allows for 2 seconds.
  let seq = 0;
  for (let tick = 0; tick < 40; tick++) {
    const inputs = [];
    for (let i = 0; i < 30; i++) inputs.push({ seq: ++seq, f: 1, s: 0, yaw: 0, j: 0 });
    game.handleInputs(p, inputs);
    run(game, 50);
  }
  const travelled = p.z - start;
  const honestMax = RUN_SPEED * 2 + RUN_SPEED * 0.5 + 0.5; // 2s plus the banked burst
  assert.ok(travelled <= honestMax, `travelled ${travelled} > ${honestMax}`);
  assert.equal(p.lastSeq, seq, 'all inputs are acknowledged so the client reconciles');
});

test('server movement: stale or replayed sequence numbers are ignored', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard'));
  place(p, 0, 30);
  game.handleInputs(p, [{ seq: 5, f: 1, s: 0, yaw: 0, j: 0 }]);
  const z = p.z;
  game.handleInputs(p, [{ seq: 5, f: 1, s: 0, yaw: 0, j: 0 }, { seq: 3, f: 1, s: 0, yaw: 0, j: 0 }]);
  assert.equal(p.z, z);
});

// ------------------------------------------------------------------ combat

function duel(cls = 'vanguard', type = 'skitter') {
  const game = makeGame();
  const p = game.addPlayer(makeChar(cls));
  const e = enemyOf(game, type);
  isolate(game, e);
  place(p, e.x, e.z + 2.5);
  game.setTarget(p, e.id);
  return { game, p, e };
}

test('combat: ability needs a target, range, cooldown and the global cooldown', () => {
  const { game, p, e } = duel();
  game.setTarget(p, 0);
  assert.equal(useAbility(game, p, 'rending_arc').reason, 'You need an enemy target.');
  game.setTarget(p, e.id);
  place(p, e.x, e.z + 20);
  assert.equal(useAbility(game, p, 'rending_arc').reason, 'Out of range.');
  place(p, e.x, e.z + 2.5);
  const hp = e.hp;
  assert.ok(useAbility(game, p, 'rending_arc').ok);
  assert.equal(e.hp, hp - ABILITIES.rending_arc.dmg);
  assert.equal(useAbility(game, p, 'rending_arc').reason, 'That ability is not ready.');
  assert.equal(useAbility(game, p, 'graviton_tether').reason, 'Not ready yet.', 'global cooldown');
  run(game, 1000);
  assert.ok(useAbility(game, p, 'graviton_tether').ok);
  run(game, ABILITIES.rending_arc.cd);
  assert.ok(useAbility(game, p, 'rending_arc').ok);
});

test('combat: abilities of another class and unknown abilities are refused', () => {
  const { game, p } = duel('vanguard');
  assert.equal(useAbility(game, p, 'mending_graft').ok, false);
  assert.equal(useAbility(game, p, '__proto__').ok, false);
  assert.equal(useAbility(game, p, 42).ok, false);
});

test('combat: resource costs are enforced and spent', () => {
  const { game, p } = duel('symbiotech');
  p.res = 10;
  assert.match(useAbility(game, p, 'mending_graft').reason, /Not enough/);
  p.res = 100;
  p.hp = 50;
  assert.ok(useAbility(game, p, 'mending_graft').ok);
  assert.equal(p.res, 100 - ABILITIES.mending_graft.cost);
  const v = duel('vanguard');
  assert.match(useAbility(v.game, v.p, 'discharge').reason, /at least 30/);
});

test('combat: enemy fights back, auto-attack runs, kill grants xp and enemy respawns', () => {
  const { game, p, e } = duel();
  const ev = [];
  assert.ok(startAttack(game, p).ok);
  run(game, 3000, ev);
  assert.equal(e.state, 'combat');
  assert.ok(p.hp < p.maxHp, 'enemy dealt damage');
  assert.ok(ev.some((x) => x.e === 'dmg' && x.s === p.id && x.ab === 'auto'));
  let guard = 0;
  while (e.state !== 'dead' && guard++ < 60) {
    useAbility(game, p, 'rending_arc');
    run(game, 500, ev);
  }
  assert.equal(e.state, 'dead');
  assert.ok(ev.some((x) => x.e === 'die' && x.id === e.id));
  assert.ok(ev.some((x) => x.e === 'xp' && x.to === p.id && x.a === ENEMIES.skitter.xp));
  assert.equal(p.char.quest.progress, 1, 'directive kill counted');
  place(p, 0, 0);
  run(game, CORPSE_MS - 100, ev);
  assert.ok(game.buildRows().some((row) => row.i === e.id), 'remains stay visible until corpse expiry');
  run(game, 300, ev);
  assert.ok(!game.buildRows().some((row) => row.i === e.id), 'expired corpse leaves world snapshots');
  run(game, ENEMIES.skitter.respawn - CORPSE_MS + 200, ev);
  assert.equal(e.state, 'idle');
  assert.equal(e.hp, e.maxHp);
});

test('combat: player defeat, respawn delay and recovery at the Sanctum', () => {
  const { game, p, e } = duel();
  p.hp = 3;
  run(game, 2500);
  assert.equal(p.dead, true);
  assert.equal(e.state === 'evade' || e.state === 'idle', true, 'enemy resets when its only target dies');
  assert.equal(useAbility(game, p, 'kinetic_ward').reason, 'You are defeated.');
  const z = p.z;
  game.handleInputs(p, [{ seq: 1, f: 1, s: 0, yaw: 0, j: 0 }]);
  assert.equal(p.z, z, 'the dead do not walk');
  assert.equal(game.respawn(p), false, 'respawn is not instant');
  run(game, 3000);
  assert.equal(game.respawn(p), true);
  assert.equal(p.dead, false);
  assert.equal(p.hp, p.maxHp);
  assert.ok(Math.hypot(p.x - WORLD.spawn.x, p.z - WORLD.spawn.z) < 0.01);
});

test('combat: Sanctum rejects damage and enemies disengage on entry', () => {
  const { game, p, e } = duel();
  // Verify that a direct/late damage event cannot bypass the safe-zone rule.
  place(p, WORLD.spawn.x, WORLD.spawn.z);
  const hp = p.hp;
  const charge = p.res;
  assert.equal(dealDamage(game, e, p, 9999, 'late_area_damage'), 0);
  assert.equal(p.hp, hp);
  assert.equal(p.res, charge);
  assert.ok(!game.events.some((ev) => ev.e === 'dmg' && ev.d === p.id));

  // Enemy threat and any pending casts must drop when a fighting player
  // crosses the boundary; the player must not take another hit inside.
  place(p, e.x, e.z + 3);
  dealDamage(game, p, e, 1, 'test_engage');
  run(game, 100);
  assert.equal(e.state, 'combat');
  place(p, WORLD.spawn.x, WORLD.spawn.z);
  const safeHp = p.hp;
  run(game, 1000);
  assert.equal(e.threat.has(p.id), false);
  assert.equal(e.state === 'evade' || e.state === 'idle', true);
  assert.ok(p.hp >= safeHp, 'Sanctum may heal but must not damage the player');
});

test('combat: enemies leash, evade and heal to full', () => {
  const { game, p, e } = duel();
  place(p, e.x, e.z + 14);
  dealDamage(game, p, e, 20, 'test');
  run(game, 1500);
  assert.equal(e.state, 'combat');
  assert.ok(Math.hypot(e.x - e.home.x, e.z - e.home.z) > 2, 'enemy chased the player');
  place(p, 0, 0); // flee into the Sanctum
  run(game, 100);
  assert.equal(e.state, 'evade');
  assert.equal(dealDamage(game, p, e, 20, 'test'), 0, 'evading enemies cannot be damaged');
  run(game, 8000);
  assert.equal(e.state, 'idle');
  assert.equal(e.hp, e.maxHp);
});

test('combat: sentinel telegraphs Arc Pulse and it can be dodged', () => {
  const { game, p, e } = duel('vanguard', 'sentinel');
  p.hp = p.maxHp = 5000;
  dealDamage(game, p, e, 1, 'test');
  const ev = [];
  let tele = null;
  for (let i = 0; i < 200 && !tele; i++) {
    run(game, 50, ev);
    tele = ev.find((x) => x.e === 'tele');
  }
  assert.ok(tele, 'a telegraph event was sent');
  assert.equal(tele.k, 'arc_pulse');
  // Step out of the marked area before it resolves.
  place(p, tele.x + tele.r + 3, tele.z);
  ev.length = 0;
  run(game, tele.ms + 100, ev);
  assert.ok(!ev.some((x) => x.e === 'dmg' && x.ab === 'arc_pulse'), 'dodged');
});

test('vanguard: taking damage builds Charge; Kinetic Ward prevents damage and converts it', () => {
  const { game, p, e } = duel();
  dealDamage(game, e, p, 20, 'test');
  assert.equal(p.hp, p.maxHp - 20);
  assert.equal(p.res, 10);
  assert.ok(useAbility(game, p, 'kinetic_ward').ok);
  const hp = p.hp;
  dealDamage(game, e, p, 20, 'test');
  assert.equal(hp - p.hp, 12, '40% prevented');
  assert.equal(p.res, 10 + 8 + 6);
});

test('vanguard: Graviton Tether pulls the enemy in and forces it to attack the vanguard', () => {
  const game = makeGame();
  const tank = game.addPlayer(makeChar('vanguard'));
  const healer = game.addPlayer(makeChar('symbiotech'));
  const e = enemyOf(game, 'skitter');
  isolate(game, e);
  place(tank, e.x, e.z + 18);
  place(healer, e.x + 18, e.z);
  game.setTarget(healer, e.id);
  game.setTarget(tank, e.id);
  useAbility(game, healer, 'neural_lash');
  run(game, 300);
  assert.equal(e.target, healer.id);
  assert.ok(useAbility(game, tank, 'graviton_tether').ok);
  assert.ok(Math.hypot(e.x - tank.x, e.z - tank.z) < 4, 'pulled to the vanguard');
  run(game, 300);
  assert.equal(e.target, tank.id);
});

test('vanguard: Discharge spends all Charge and damage scales with it', () => {
  const a = duel();
  a.p.res = 30;
  const hpA = a.e.hp;
  assert.ok(useAbility(a.game, a.p, 'discharge').ok);
  const low = hpA - a.e.hp;
  assert.equal(a.p.res, 0);
  const b = duel();
  b.p.res = 100;
  const hpB = b.e.hp;
  useAbility(b.game, b.p, 'discharge');
  assert.ok(hpB - b.e.hp > low * 1.8);
});

// ----------------------------------------------------------------- healing

test('symbiotech: Mending Graft heals an ally now and over time, and is not a damage spell', () => {
  const game = makeGame();
  const healer = game.addPlayer(makeChar('symbiotech'));
  const ally = game.addPlayer(makeChar('vanguard'));
  healer.companion.mode = 'assist'; // keep the symbiote out of this measurement
  place(healer, 0, 40);
  place(ally, 5, 40);
  ally.hp = 100;
  ally.combatUntil = game.time + 60000; // suppress natural regeneration
  game.setTarget(healer, ally.id);
  assert.ok(useAbility(game, healer, 'mending_graft').ok);
  assert.equal(ally.hp, 100 + ABILITIES.mending_graft.heal);
  assert.ok(getBuff(ally, 'hot'));
  run(game, 6500);
  assert.equal(ally.hp, 100 + ABILITIES.mending_graft.heal + ABILITIES.mending_graft.hot.total);
  place(ally, 60, 40);
  run(game, 3000);
  assert.equal(useAbility(game, healer, 'mending_graft').reason, 'Out of range.');
});

test('symbiotech: healing never exceeds max health and never revives the dead', () => {
  const game = makeGame();
  const healer = game.addPlayer(makeChar('symbiotech'));
  place(healer, 0, 40);
  healer.hp = healer.maxHp - 3;
  assert.equal(applyHeal(game, healer, healer, 50, 'test'), 3);
  assert.equal(healer.hp, healer.maxHp);
  healer.dead = true;
  healer.hp = 0;
  assert.equal(applyHeal(game, healer, healer, 50, 'test'), 0);
  assert.equal(healer.hp, 0);
});

test('symbiotech: Neural Lash saps enemy damage; Spore Snare roots (but not elites)', () => {
  const { game, p, e } = duel('symbiotech');
  place(p, e.x, e.z + 15);
  p.companion.mode = 'assist';
  useAbility(game, p, 'neural_lash');
  assert.ok(getBuff(e, 'sap'));
  const hp = p.hp;
  dealDamage(game, e, p, 10, 'test');
  assert.equal(hp - p.hp, 8);
  run(game, 1000);
  const before = { x: e.x, z: e.z };
  assert.ok(useAbility(game, p, 'spore_snare').ok);
  run(game, 2000);
  assert.deepEqual({ x: e.x, z: e.z }, before, 'rooted enemy does not move');
  run(game, 3000);
  assert.ok(Math.hypot(e.x - before.x, e.z - before.z) > 1, 'root expires');
  const w = duel('symbiotech', 'warden');
  place(w.p, w.e.x, w.e.z + 12);
  assert.match(useAbility(w.game, w.p, 'spore_snare').reason, /too massive/);
});

// --------------------------------------------------------------- companion

function trio() {
  const game = makeGame();
  const healer = game.addPlayer(makeChar('symbiotech'));
  const ally = game.addPlayer(makeChar('vanguard'));
  for (const e of game.enemies) isolate(game, null);
  place(healer, 0, 40);
  place(ally, 6, 40);
  return { game, healer, ally, comp: healer.companion };
}

test('companion: exists only for the symbiotech, follows its owner and leashes', () => {
  const { game, healer, ally, comp } = trio();
  assert.ok(comp);
  assert.equal(ally.companion, null);
  assert.equal(comp.owner, healer.id);
  place(healer, 20, 60);
  run(game, 4000);
  assert.ok(Math.hypot(comp.x - healer.x, comp.z - healer.z) < 4, 'caught up with owner');
  place(healer, -60, -20);
  run(game, 100);
  assert.ok(Math.hypot(comp.x - healer.x, comp.z - healer.z) < 4, 'teleports when left far behind');
});

test('companion triage: autonomously heals the most injured ally near its owner', () => {
  const { game, healer, ally, comp } = trio();
  ally.hp = 100;
  ally.combatUntil = game.time + 60000;
  healer.combatUntil = game.time + 60000;
  const ev = [];
  run(game, 5000, ev);
  const heals = ev.filter((x) => x.e === 'heal' && x.s === comp.id && x.d === ally.id && x.ab === 'triage');
  assert.ok(heals.length >= 2, `expected triage heals, saw ${heals.length}`);
  assert.equal(heals[0].a, 9);
  assert.equal(comp.act, 'mending');
  assert.equal(comp.actTarget, ally.id);
  ally.hp = ally.maxHp;
  run(game, 500);
  assert.equal(comp.act, 'idle');
});

test('companion bond: protects the chosen ally, and releases when the host dies', () => {
  const { game, healer, ally, comp } = trio();
  game.setTarget(healer, ally.id);
  assert.ok(petCommand(game, healer, 'guard').ok);
  assert.equal(comp.host, ally.id);
  run(game, 2000);
  assert.equal(comp.act, 'bonded');
  const bond = getBuff(ally, 'bond');
  assert.ok(bond);
  const hp = ally.hp;
  dealDamage(game, null, ally, 50, 'test');
  assert.equal(hp - ally.hp, 40, '20% less damage while bonded');
  ally.combatUntil = game.time + 60000;
  const ev = [];
  run(game, 3000, ev);
  assert.ok(ev.some((x) => x.e === 'heal' && x.ab === 'bond' && x.d === ally.id), 'bond regenerates the host');
  // Triage is the trade-off: while bonded elsewhere the owner is not mended.
  healer.hp = 50;
  healer.combatUntil = game.time + 60000;
  ev.length = 0;
  run(game, 3000, ev);
  assert.ok(!ev.some((x) => x.e === 'heal' && x.d === healer.id));
  dealDamage(game, null, ally, 9999, 'test');
  assert.equal(ally.dead, true);
  run(game, 200);
  assert.equal(comp.mode, 'triage');
  assert.equal(comp.host, 0);
});

test('companion harry: attacks the owner target and corrodes it', () => {
  const { game, p, e } = duel('symbiotech');
  place(p, e.x, e.z + 14);
  assert.ok(petCommand(game, p, 'assist').ok);
  const ev = [];
  run(game, 4000, ev);
  assert.ok(ev.some((x) => x.e === 'dmg' && x.s === p.companion.id && x.d === e.id));
  assert.ok(getBuff(e, 'corrode'));
  assert.ok(e.threat.has(p.id), 'companion damage is credited to its owner');
  game.setTarget(p, 0);
  run(game, 300);
  assert.equal(p.companion.act, 'idle');
});

test('companion: commands are validated — no companion, bad command, dead owner', () => {
  const { game, healer, ally, comp } = trio();
  assert.equal(petCommand(game, ally, 'assist').ok, false, 'vanguard has no companion to command');
  assert.equal(petCommand(game, healer, 'explode').ok, false);
  assert.equal(petCommand(game, healer, 'constructor').ok, false);
  healer.dead = true;
  assert.equal(petCommand(game, healer, 'assist').ok, false);
  healer.dead = false;
  place(ally, 80, 0);
  game.setTarget(healer, ally.id);
  assert.match(petCommand(game, healer, 'guard').reason, /too far/);
  assert.equal(comp.mode, 'triage');
});

test('companion: goes dormant when its owner is defeated and stops healing', () => {
  const { game, healer, ally, comp } = trio();
  ally.hp = 50;
  ally.combatUntil = game.time + 60000;
  dealDamage(game, null, healer, 9999, 'test');
  const ev = [];
  run(game, 4000, ev);
  assert.equal(comp.act, 'dormant');
  assert.ok(!ev.some((x) => x.e === 'heal' && x.s === comp.id));
});

// ---------------------------------------------------------- build / glyphs

test('build: implant requires skill that only the device supplies', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('symbiotech', { inventory: ['sporeglass_focus', 'myelin_lattice'] }));
  place(p, 0, 40);
  assert.equal(p.stats.skills.biotech, 10);
  const r = equipItem(game, p, 'myelin_lattice');
  assert.equal(r.ok, false);
  assert.match(r.reason, /requires Biotech 13/);
  assert.ok(equipItem(game, p, 'sporeglass_focus').ok);
  assert.equal(p.stats.skills.biotech, 13);
  assert.ok(equipItem(game, p, 'myelin_lattice').ok);
  assert.equal(p.stats.healMul, 1.3);
  const u = unequipSlot(game, p, 'device');
  assert.equal(u.ok, false, 'cannot remove the device the implant depends on');
  assert.match(u.reason, /Myelin Lattice/);
  assert.ok(unequipSlot(game, p, 'implant').ok);
  assert.ok(unequipSlot(game, p, 'device').ok);
  assert.equal(p.stats.healMul, 1);
});

test('build: invalid equipment changes are refused', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard', { inventory: ['servo_harness', 'glyph_shared_pulse', 'glyph_resonant_aegis'] }));
  place(p, 0, 40);
  assert.equal(equipItem(game, p, 'kinetic_capacitor').reason, 'You do not own that item.');
  assert.equal(equipItem(game, p, 'nonexistent').ok, false);
  assert.equal(equipItem(game, p, 'toString').ok, false);
  assert.match(equipItem(game, p, 'glyph_shared_pulse').reason, /cannot be used by your class/);
  assert.match(equipItem(game, p, 'glyph_resonant_aegis').reason, /Attunement: Resonance/);
  assert.equal(unequipSlot(game, p, 'glyph').ok, false);
  assert.equal(unequipSlot(game, p, 'head').ok, false);
  assert.ok(equipItem(game, p, 'servo_harness').ok);
  assert.equal(equipItem(game, p, 'servo_harness').reason, 'That is already equipped.');
  p.combatUntil = game.time + 5000;
  assert.match(unequipSlot(game, p, 'device').reason, /in combat/);
  assert.deepEqual(p.char.equipped, { device: 'servo_harness', implant: null, glyph: null });
});

test('build: augmentation changes ability AND companion effectiveness', () => {
  const { game, healer, ally, comp } = trio();
  healer.char.inventory.push('sporeglass_focus', 'myelin_lattice');
  ally.hp = 60;
  ally.combatUntil = game.time + 1e6;
  healer.combatUntil = 0;
  equipItem(game, healer, 'sporeglass_focus');
  equipItem(game, healer, 'myelin_lattice');
  // power 1.06 (Biotech 13) x 1.3 implant
  game.setTarget(healer, ally.id);
  const hp = ally.hp;
  useAbility(game, healer, 'mending_graft');
  assert.equal(ally.hp - hp, Math.round(ABILITIES.mending_graft.heal * 1.06 * 1.3));
  const ev = [];
  run(game, 2500, ev);
  const triage = ev.find((x) => x.e === 'heal' && x.ab === 'triage');
  assert.equal(triage.a, Math.round(9 * 1.06 * 1.3), 'symbiote heals scale with the owner build');
  assert.equal(triage.s, comp.id);
});

test('glyph: Shared Pulse makes triage splash to nearby allies (needs attunement)', () => {
  const { game, healer, ally } = trio();
  const third = game.addPlayer(makeChar('vanguard'));
  place(third, 8, 42);
  for (const p of [ally, third, healer]) p.combatUntil = game.time + 1e6;
  ally.hp = 60;
  third.hp = third.maxHp - 40;
  const ev = [];
  run(game, 2500, ev);
  assert.ok(!ev.some((x) => x.ab === 'shared_pulse'), 'no splash without the glyph');
  healer.char.inventory.push('glyph_shared_pulse');
  healer.combatUntil = 0;
  assert.equal(equipItem(game, healer, 'glyph_shared_pulse').ok, false, 'inert without attunement');
  healer.char.attunements.push('resonance');
  assert.ok(equipItem(game, healer, 'glyph_shared_pulse').ok);
  ev.length = 0;
  run(game, 2500, ev);
  const splash = ev.find((x) => x.e === 'heal' && x.ab === 'shared_pulse' && x.d === third.id);
  assert.ok(splash, 'second ally healed by the pulse');
  assert.equal(splash.a, Math.round(9 * 0.6));
});

test('glyph: Carapace turns the bond from regeneration into protection + reflection', () => {
  const { game, healer, ally } = trio();
  healer.char.inventory.push('glyph_carapace');
  assert.ok(equipItem(game, healer, 'glyph_carapace').ok);
  game.setTarget(healer, ally.id);
  petCommand(game, healer, 'guard');
  run(game, 2000);
  const e = enemyOf(game, 'skitter');
  e.state = 'idle';
  e.hp = e.maxHp;
  place(e, ally.x + 1, ally.z);
  ally.hp = 150;
  const ev = [];
  dealDamage(game, e, ally, 20, 'auto', { melee: true });
  ev.push(...game.events);
  assert.equal(150 - ally.hp, 11, '45% less damage');
  assert.ok(ev.some((x) => x.e === 'dmg' && x.ab === 'carapace' && x.d === e.id && x.a === 6), 'attacker is stung');
  ally.combatUntil = game.time + 1e6;
  ev.length = 0;
  run(game, 3000, ev);
  assert.ok(!ev.some((x) => x.e === 'heal' && x.ab === 'bond'), 'no regeneration with Carapace');
});

test('glyph: Resonant Aegis converts Discharge into shields for nearby allies', () => {
  const game = makeGame();
  const tank = game.addPlayer(makeChar('vanguard', { inventory: ['glyph_resonant_aegis'], attunements: ['resonance'] }));
  const ally = game.addPlayer(makeChar('symbiotech'));
  const e = enemyOf(game, 'skitter');
  isolate(game, e);
  e.hp = e.maxHp = 1000;
  place(tank, e.x, e.z + 3);
  place(ally, e.x + 2, e.z + 5);
  ally.companion.mode = 'assist';
  // Baseline without the glyph.
  tank.res = 100;
  const hp0 = e.hp;
  useAbility(game, tank, 'discharge');
  const plain = hp0 - e.hp;
  assert.equal(getBuff(ally, 'shield'), null);
  // Leave combat, inscribe the glyph, repeat.
  e.threat.clear();
  e.hp = e.maxHp;
  tank.combatUntil = 0;
  assert.ok(equipItem(game, tank, 'glyph_resonant_aegis').ok);
  run(game, 6000);
  tank.res = 100;
  const hp1 = e.hp;
  assert.ok(useAbility(game, tank, 'discharge').ok);
  assert.equal(hp1 - e.hp, Math.round(plain * 0.6), 'less damage');
  const shield = getBuff(ally, 'shield');
  assert.ok(shield && shield.v === 60, 'ally shielded for 60% of charge');
  const hp = ally.hp;
  dealDamage(game, e, ally, 25, 'test');
  assert.equal(ally.hp, hp, 'shield absorbs the hit');
  assert.equal(getBuff(ally, 'shield').v, 35);
});

test('glyph: Rending Echo cleaves other nearby enemies', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('vanguard', { inventory: ['glyph_rending_echo'] }));
  const [a, b] = game.enemies.filter((e) => e.type === 'skitter');
  for (const e of game.enemies) if (e !== a && e !== b) { e.state = 'dead'; e.respawnAt = Infinity; }
  place(a, -40, 30);
  place(b, -38, 30);
  place(p, -39, 32);
  game.setTarget(p, a.id);
  useAbility(game, p, 'rending_arc');
  assert.equal(b.hp, b.maxHp, 'no cleave without the glyph');
  run(game, 100);
  p.combatUntil = 0;
  assert.ok(equipItem(game, p, 'glyph_rending_echo').ok);
  run(game, 4000);
  const hp = b.hp;
  useAbility(game, p, 'rending_arc');
  assert.equal(hp - b.hp, Math.round(22 * 0.7));
});

// ------------------------------------------------------------- progression

test('progression: levels raise primary skill, health and power', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('symbiotech'));
  const hp = p.maxHp;
  grantXp(game, p, 90);
  assert.equal(p.char.level, 2);
  assert.equal(p.stats.skills.biotech, 11);
  assert.ok(p.maxHp > hp);
  assert.ok(p.stats.power > 1);
  grantXp(game, p, 1e6);
  assert.equal(p.char.level, 5, 'level cap');
});

test('progression: the directive chain hands out the build pieces in order', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('symbiotech'));
  place(p, 0, 40);
  const skitters = game.enemies.filter((e) => e.type === 'skitter');
  for (let i = 0; i < 3; i++) dealDamage(game, p, skitters[i], 9999, 'test');
  assert.equal(p.char.quest.step, 1);
  assert.ok(p.char.inventory.includes('sporeglass_focus'));
  p.combatUntil = 0;
  equipItem(game, p, 'sporeglass_focus');
  assert.equal(p.char.quest.step, 2);
  assert.ok(p.char.inventory.includes('myelin_lattice'));
  equipItem(game, p, 'myelin_lattice');
  assert.equal(p.char.quest.step, 3);
  const sentinels = game.enemies.filter((e) => e.type === 'sentinel');
  for (let i = 0; i < 2; i++) dealDamage(game, p, sentinels[i], 9999, 'test');
  assert.equal(p.char.quest.step, 4);
  assert.ok(p.char.inventory.includes('glyph_shared_pulse'));
  p.combatUntil = 0;
  assert.equal(equipItem(game, p, 'glyph_shared_pulse').ok, false, 'glyph is inert until attuned');
  const obelisk = game.objects.find((o) => o.type === 'obelisk');
  assert.equal(interact(game, p, obelisk.id).reason, 'Move closer.');
  place(p, obelisk.x + 2, obelisk.z);
  assert.ok(interact(game, p, obelisk.id).ok);
  assert.deepEqual(p.char.attunements, ['resonance']);
  assert.equal(p.char.quest.step, 5);
  assert.ok(interact(game, p, obelisk.id).ok);
  assert.deepEqual(p.char.attunements, ['resonance'], 'attuning twice does nothing');
  assert.ok(equipItem(game, p, 'glyph_shared_pulse').ok);
  assert.equal(p.char.quest.step, 6);
  dealDamage(game, p, enemyOf(game, 'warden'), 9999, 'test');
  assert.equal(p.char.quest.step, DIRECTIVES.length);
  assert.ok(p.char.inventory.includes('glyph_carapace'));
  assert.ok(p.char.inventory.includes('wardstone_shard'));
});

test('progression: both players who fought get full credit; items are never duplicated', () => {
  const game = makeGame();
  const a = game.addPlayer(makeChar('vanguard'));
  const b = game.addPlayer(makeChar('symbiotech'));
  const e = enemyOf(game, 'skitter');
  place(a, e.x, e.z + 2);
  place(b, e.x, e.z + 10);
  dealDamage(game, b, e, 5, 'test');
  dealDamage(game, a, e, 9999, 'test');
  assert.equal(a.char.xp, ENEMIES.skitter.xp);
  assert.equal(b.char.xp, ENEMIES.skitter.xp);
  assert.equal(grantItem(game, a, 'servo_harness'), true);
  assert.equal(grantItem(game, a, 'servo_harness'), false);
  assert.equal(a.char.inventory.filter((i) => i === 'servo_harness').length, 1);
});

test('threat: the vanguard holds an enemy against a healer; healing draws threat', () => {
  const game = makeGame();
  const tank = game.addPlayer(makeChar('vanguard'));
  const healer = game.addPlayer(makeChar('symbiotech'));
  const e = enemyOf(game, 'sentinel');
  isolate(game, e);
  e.hp = e.maxHp = 100000;
  place(tank, e.x, e.z + 3);
  place(healer, e.x, e.z + 12);
  game.setTarget(tank, e.id);
  game.setTarget(healer, tank.id);
  startAttack(game, tank);
  for (let i = 0; i < 20; i++) {
    useAbility(game, tank, 'rending_arc');
    tank.hp = Math.min(tank.hp, tank.maxHp - 60);
    useAbility(game, healer, 'mending_graft');
    run(game, 1000);
  }
  assert.ok(e.threat.get(healer.id) > 0, 'healing generated threat');
  assert.ok(e.threat.get(tank.id) > e.threat.get(healer.id));
  assert.equal(e.target, tank.id);
});

// ------------------------------------------------- balance sanity (bots)

function botFight(setup, maxMs = 240000) {
  const game = makeGame(11);
  const ctx = setup(game);
  let t = 0;
  while (t < maxMs && ctx.enemy.state !== 'dead' && ctx.players.some((p) => !p.dead)) {
    ctx.step(game);
    run(game, 250);
    t += 250;
  }
  return { won: ctx.enemy.state === 'dead', ms: t, players: ctx.players };
}

test('balance: each class can solo a skitter with health to spare', () => {
  for (const cls of ['vanguard', 'symbiotech']) {
    const res = botFight((game) => {
      const p = game.addPlayer(makeChar(cls));
      const e = enemyOf(game, 'skitter');
      isolate(game, e);
      place(p, e.x, e.z + 3);
      game.setTarget(p, e.id);
      const kit = CLASSES[cls].abilities;
      return { enemy: e, players: [p], step: (g) => { for (const a of kit) if (ABILITIES[a].type === 'hostile' || a === 'discharge') useAbility(g, p, a); } };
    });
    assert.ok(res.won, `${cls} should win`);
    assert.ok(res.players[0].hp / res.players[0].maxHp > 0.5, `${cls} hp left ${res.players[0].hp}`);
  }
});

const GEAR = {
  vanguard: { inventory: ['servo_harness', 'kinetic_capacitor', 'glyph_resonant_aegis'], equipped: { device: 'servo_harness', implant: 'kinetic_capacitor', glyph: null } },
  symbiotech: { inventory: ['sporeglass_focus', 'myelin_lattice'], equipped: { device: 'sporeglass_focus', implant: 'myelin_lattice', glyph: null } },
};

function wardenFight({ tankGlyph = null, withHealer = true, healerHeals = true, soloHealer = false }) {
  return botFight((game) => {
    const e = enemyOf(game, 'warden');
    isolate(game, e);
    const players = [];
    let tank = null;
    let healer = null;
    if (!soloHealer) {
      tank = game.addPlayer(makeChar('vanguard', { level: 4, attunements: ['resonance'], ...GEAR.vanguard, equipped: { ...GEAR.vanguard.equipped, glyph: tankGlyph } }));
      place(tank, e.x, e.z + 4);
      game.setTarget(tank, e.id);
      players.push(tank);
    }
    if (withHealer || soloHealer) {
      healer = game.addPlayer(makeChar('symbiotech', { level: 4, ...GEAR.symbiotech }));
      place(healer, e.x, e.z + (soloHealer ? 4 : 14));
      if (!healerHeals) petCommand(game, healer, 'assist');
      players.push(healer);
    }
    const front = tank || healer;
    return {
      enemy: e,
      players,
      step: (g) => {
        // Whoever is in melee steps out of Seismic Slam, then returns.
        if (!front.dead) {
          if (e.cast && e.cast.sp.id === 'seismic_slam') place(front, e.x, e.z + 11);
          else place(front, e.x, e.z + 4);
        }
        if (tank) for (const a of ['graviton_tether', 'kinetic_ward', 'rending_arc', 'discharge']) useAbility(g, tank, a);
        if (healer && !healer.dead) {
          const hurt = players.filter((p) => !p.dead).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
          if (healerHeals && hurt.hp / hurt.maxHp < 0.7) {
            g.setTarget(healer, hurt.id);
            if (hurt.hp / hurt.maxHp < 0.45) useAbility(g, healer, 'overgrowth_surge');
            useAbility(g, healer, 'mending_graft');
          }
          g.setTarget(healer, e.id);
          useAbility(g, healer, 'neural_lash');
        }
      },
    };
  });
}

const fmt = (r) => `won=${r.won} in ${r.ms / 1000}s; ` + r.players.map((p) => `${p.cls} ${p.dead ? 'DEAD' : Math.round(p.hp) + '/' + p.maxHp}`).join(', ');

test('balance: Vault Warden — duo needs its healer; solo needs the right build', () => {
  const duo = wardenFight({});
  const noHeals = wardenFight({ healerHeals: false });
  const soloPlain = wardenFight({ withHealer: false });
  const soloAegis = wardenFight({ withHealer: false, tankGlyph: 'glyph_resonant_aegis' });
  const soloHealer = wardenFight({ soloHealer: true });
  console.log(`      duo, healer healing:        ${fmt(duo)}`);
  console.log(`      duo, healer only attacking: ${fmt(noHeals)}`);
  console.log(`      solo vanguard, no glyph:    ${fmt(soloPlain)}`);
  console.log(`      solo vanguard, Aegis glyph: ${fmt(soloAegis)}`);
  console.log(`      solo symbiotech:            ${fmt(soloHealer)}`);
  assert.ok(duo.won && duo.players.every((p) => !p.dead), 'duo with healing wins cleanly');
  assert.ok(noHeals.players[0].dead, 'without healing the vanguard falls');
  assert.ok(!soloPlain.won, 'an unprepared solo vanguard loses');
  assert.ok(soloAegis.won, 'the Aegis build makes the solo kill possible');
  assert.ok(soloHealer.won, 'a symbiotech can grind it down alone');
});

test('encounter scaling: the Warden grows when a second player joins and resets after', () => {
  const game = makeGame();
  const a = game.addPlayer(makeChar('vanguard'));
  const b = game.addPlayer(makeChar('symbiotech'));
  const e = enemyOf(game, 'warden');
  isolate(game, e);
  a.hp = a.maxHp = b.hp = b.maxHp = 1e6;
  place(a, e.x, e.z + 4);
  place(b, e.x + 60, e.z + 40);
  dealDamage(game, a, e, 90, 'test');
  run(game, 200);
  assert.equal(e.maxHp, ENEMIES.warden.hp);
  place(b, e.x, e.z + 12);
  dealDamage(game, b, e, 1, 'test');
  run(game, 200);
  assert.equal(e.maxHp, Math.round(ENEMIES.warden.hp * 1.65));
  assert.ok(Math.abs(e.hp / e.maxHp - 0.9) < 0.01, 'health ratio is preserved');
  place(a, 0, 0);
  place(b, 0, 0);
  run(game, 9000);
  assert.equal(e.state, 'idle');
  assert.equal(e.maxHp, ENEMIES.warden.hp);
});

test('stats: deriveStats reflects equipment and the loadout validators agree with the server', () => {
  const c = makeChar('vanguard', { inventory: ['servo_harness', 'kinetic_capacitor', 'adrenal_shunt'] });
  assert.equal(tryEquip(c, 'kinetic_capacitor').ok, false);
  c.equipped = tryEquip(c, 'servo_harness').equipped;
  c.equipped = tryEquip(c, 'kinetic_capacitor').equipped;
  let s = deriveStats(c);
  assert.equal(s.chargeMul, 1.5);
  assert.equal(s.dischargeRadius, 2);
  assert.equal(tryUnequip(c, 'device').ok, false);
  c.equipped = tryEquip(c, 'adrenal_shunt').equipped; // swap implants
  s = deriveStats(c);
  assert.equal(s.dmgMul, 1.2);
  assert.equal(s.maxHp, Math.round(CLASSES.vanguard.baseHp * 0.85));
  assert.ok(tryUnequip(c, 'device').ok, 'nothing depends on the device any more');
});

test('world: spawn point, interactables and enemy homes are not inside colliders', () => {
  const free = (x, z, r) => {
    const p = resolveCollisions({ x, z }, r);
    return Math.hypot(p.x - x, p.z - z) < 1e-6;
  };
  assert.ok(free(WORLD.spawn.x, WORLD.spawn.z, PLAYER_RADIUS));
  const game = makeGame();
  for (const e of game.enemies) assert.ok(free(e.home.x, e.home.z, e.radius), `${e.type} home blocked`);
  // The obelisk hollow has an entrance: walk in from outside along the gap.
  const ob = ZONES.obelisk;
  const a = (2 / 9) * Math.PI * 2;
  for (let d = 12; d > 2.5; d -= 0.5) assert.ok(free(ob.x + Math.sin(a) * d, ob.z + Math.cos(a) * d, PLAYER_RADIUS), `gap blocked at ${d}`);
});
