import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterStore } from '../server/store.js';
import { manageCompanion, petCommand, renameCompanion } from '../server/sim/companion.js';
import { useAbility } from '../server/sim/combat.js';
import { equipItem, unequipSlot } from '../server/sim/progress.js';
import { groundSegmentClear } from '../server/sim/ground-navigation.js';
import { tickSpindle } from '../server/sim/spindle.js';
import { WORLD, dist, RUN_SPEED } from '../shared/world.js';
import { CLASSES } from '../shared/content.js';
import { SPINDLE_TUNING } from '../shared/spindle.js';
import { makeChar, makeGame } from './helpers.js';

function commission(game, p) { assert.ok(manageCompanion(game, p, 'commission', 'spindle').ok); }
function deploy(game, p, type = 'spindle') {
  assert.ok(manageCompanion(game, p, 'summon', type).ok);
  return type === 'spindle' ? p.spindleCompanion : p.companion;
}
function tickMachine(game, c, ms) {
  for (let t = 0; t < ms; t += 50) { game.time += 50; tickSpindle(game, c, .05); }
}

test('Spindle commissions and summons for every registered class without equipment', () => {
  for (const cls of Object.keys(CLASSES)) {
    const game = makeGame(), p = game.addPlayer(makeChar(cls));
    const before = {...p.char.equipped};
    assert.equal(game.privateState(p).canCommissionSpindle, true, cls);
    commission(game, p);
    const c = deploy(game, p);
    assert.equal(c.type, 'spindle', cls);
    assert.deepEqual(p.char.equipped, before, cls);
    assert.equal(game.companions.filter(unit => unit.owner === p.id).length,
      p.companion && p.companion !== c ? 2 : 1, cls);
    assert.equal(game.privateState(p).spindleId, c.id);
  }
});

test('Field light is an independent, opt-in, server-replicated Spindle utility', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('vanguard'));
  assert.equal(petCommand(game, p, 'light').ok, false, 'unowned/unsummoned light is unavailable');
  commission(game, p);
  const c = deploy(game, p);
  const row = () => game.buildRows().find(entry => entry.i === c.id);
  assert.equal(c.lightOn, false, 'a fresh summon must not provide a free light');
  assert.equal(row().li, 0);
  assert.equal(petCommand(game, p, 'light').ok, true);
  assert.equal(c.mode, 'follow', 'lighting cannot replace movement mode');
  assert.equal(row().li, 1, 'lighting state reaches nearby clients through the ordinary snapshot');
  assert.equal(petCommand(game, p, 'stay').ok, true);
  assert.equal(c.mode, 'stay');
  assert.equal(row().li, 1);
  assert.equal(petCommand(game, p, 'inspect').ok, true);
  assert.equal(c.mode, 'inspect');
  assert.equal(row().li, 1, 'inspection does not disable lighting');
  assert.equal(petCommand(game, p, 'light').ok, true);
  assert.equal(c.mode, 'inspect', 'turning the lamp off cannot cancel inspection');
  assert.equal(row().li, 0);
  const other = game.addPlayer(makeChar('vanguard'));
  assert.equal(petCommand(game, other, 'light').ok, false, 'another player cannot toggle this unit');
  assert.equal(petCommand(game, p, 'not-a-command').ok, false);
  assert.equal(petCommand(game, p, 'light').ok, true);
  p.dead = true;
  assert.equal(petCommand(game, p, 'light').ok, false, 'defeated owner cannot toggle');
  tickSpindle(game, c, .05);
  assert.equal(row().li, 0, 'defeat switches the lamp off');
  p.dead = false;
  assert.equal(manageCompanion(game, p, 'dismiss').ok, true);
  const resummoned = deploy(game, p);
  assert.equal(resummoned.lightOn, false, 'dismissal does not create an automatic lantern');
});

test('Spindle tune preserves player catch-up and reduces size and movement caps', () => {
  assert.equal(SPINDLE_TUNING.scale, .75);
  assert.equal(SPINDLE_TUNING.radius, .54);
  assert.equal(SPINDLE_TUNING.followSpeed, 7.5);
  assert.ok(SPINDLE_TUNING.followSpeed > RUN_SPEED);
  assert.equal(SPINDLE_TUNING.inspectSpeed, 5.5);
});

test('Spindle occupies a utility slot without replacing the class companion', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('symbiotech')), mender = p.companion;
  assert.equal(manageCompanion(game, p, 'summon', 'spindle').ok, false);
  assert.equal(manageCompanion(game, p, 'default', 'spindle').ok, false);
  p.x = 25;
  assert.equal(manageCompanion(game, p, 'commission', 'spindle').ok, false);
  Object.assign(p, WORLD.spawn);
  p.combatUntil = 100;
  assert.equal(manageCompanion(game, p, 'commission', 'spindle').ok, false);
  game.time = 100;
  assert.equal(manageCompanion(game, p, 'commission', 'mender').ok, false);
  commission(game, p);
  assert.equal(manageCompanion(game, p, 'commission', 'spindle').ok, false);
  assert.equal(p.companion, mender);
  assert.ok(renameCompanion(game, p, 'Tender').ok);
  p.x = WORLD.radius + 1;
  assert.equal(manageCompanion(game, p, 'summon', 'spindle').ok, false);
  assert.equal(p.companion, mender, 'failed spawn preserves the current unit');
  Object.assign(p, WORLD.spawn);
  const machine = deploy(game, p);
  assert.equal(p.companion, mender, 'the combat companion remains selected and active');
  assert.equal(p.spindleCompanion, machine);
  assert.equal(game.ents.has(mender.id), true);
  assert.equal(game.ents.get(machine.id), machine);
  assert.deepEqual(game.privateState(p).companions.map(c => [c.name, c.isDefault, c.active]),
    [['Tender', true, true], ['Spindle', false, true]]);
  assert.equal(game.privateState(p).comp, mender.id);
  assert.equal(game.privateState(p).spindleId, machine.id);
  assert.equal(petCommand(game, p, 'guard').ok, true, 'Mender can still bond');
  assert.equal(mender.mode, 'guard');
  assert.equal(petCommand(game, p, 'light').ok, false, 'untargeted light must not command Mender');
  assert.equal(petCommand(game, p, 'light', 'spindle').ok, true);
  assert.equal(machine.lightOn, true);
  assert.equal(petCommand(game, p, 'stay', 'spindle').ok, true);
  assert.equal(machine.mode, 'stay');
  assert.equal(mender.mode, 'guard');
  assert.equal(petCommand(game, p, 'guard', 'spindle').ok, false, 'Spindle cannot impersonate Mender');
  assert.equal(petCommand(game, p, 'light', 'mender').ok, false, 'Mender cannot impersonate Spindle');
  p.res = 100;
  assert.doesNotMatch(useAbility(game, p, 'overgrowth_surge').reason ?? '', /no symbiote/);
  assert.equal(manageCompanion(game, p, 'summon', 'spindle').ok, false);
  assert.equal(game.companions.length, 2);
  assert.equal(manageCompanion(game, p, 'dismiss', 'spindle').ok, true);
  assert.equal(p.companion, mender);
  assert.equal(game.ents.has(machine.id), false);
  assert.equal(game.ents.has(mender.id), true);
  assert.equal(manageCompanion(game, p, 'summon', 'spindle').ok, true);
  assert.equal(game.companions.length, 2);
  assert.equal(manageCompanion(game, p, 'dismiss', 'mender').ok, true);
  assert.equal(p.companion, p.spindleCompanion, 'standalone Spindle retains the legacy controls');
  assert.equal(game.ents.has(mender.id), false);
  assert.equal(game.companions.length, 1);
  assert.equal(manageCompanion(game, p, 'summon', 'mender').ok, true);
  assert.equal(game.companions.length, 2);
  assert.equal(p.companion.type, 'mender');
});

test('Spindle coexists with Survey Strider, preserving its scan mark and saved mode', () => {
  const game = makeGame(), link = 'survey_strider_link';
  const p = game.addPlayer(makeChar('surveyor', { level: 4, attunements: ['resonance'], inventory: [link] }));
  assert.ok(manageCompanion(game,p,'summon','survey_strider').ok);
  const first = p.companion;
  assert.ok(renameCompanion(game, p, 'Mapper').ok);
  assert.ok(petCommand(game, p, 'stay').ok);
  p.surveyKit.mark = { id: 7, source: first.id, until: game.time + 6000 };
  commission(game, p);
  const machine = deploy(game, p);
  assert.deepEqual(p.surveyKit.mark, { id: 7, source: first.id, until: game.time + 6000 });
  assert.equal(p.char.equipped.device,null);
  assert.equal(equipItem(game,p,link).ok,false);
  assert.equal(p.companion,first);
  assert.equal(p.spindleCompanion,machine);
  assert.equal(first.name, 'Mapper');
  assert.equal(first.mode, 'stay');
  assert.equal(p.char.striderLearned,true);
  assert.equal(game.companions.length, 2);
  assert.equal(petCommand(game, p, 'light', 'spindle').ok, true);
  assert.equal(first.mode, 'stay');
  assert.equal(manageCompanion(game, p, 'dismiss', 'spindle').ok, true);
  assert.equal(p.companion, first);
  assert.equal(p.surveyKit.mark.source, first.id);
  assert.equal(game.companions.length, 1);
});

test('inspection requires uninterrupted proximity and gives one private, read-only loadout report', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('vanguard', {
    inventory: ['field_emitter'], condition: { field_emitter: 45 }, equipped: { ranged: 'field_emitter' },
  }));
  const other = game.addPlayer(makeChar('keeper'));
  commission(game, p);
  const c = deploy(game, p);
  assert.ok(petCommand(game, p, 'inspect').ok);
  tickMachine(game, c, 500);
  assert.equal(c.act, 'inspecting');
  assert.equal(c.actTarget, p.id);
  const end = c.serviceEnd;
  assert.ok(petCommand(game, p, 'inspect').ok);
  assert.equal(c.serviceEnd, end);
  p.jy = 1;
  tickMachine(game, c, 1500);
  assert.equal(c.act, 'approaching');
  p.jy = 0;
  tickMachine(game, c, 500);
  p.combatUntil = game.time + 2000;
  tickMachine(game, c, 50);
  assert.equal(c.mode, 'follow');
  assert.equal(petCommand(game, p, 'inspect').ok, false);
  assert.equal(p.outbox.some(e => /45% condition/.test(e.m)), false);
  game.time = p.combatUntil;
  assert.ok(petCommand(game, p, 'inspect').ok);
  tickMachine(game, c, 3000);
  assert.equal(c.mode, 'follow');
  assert.equal(p.outbox.filter(e => /Field Pulse Emitter at 45% condition/.test(e.m)).length, 1);
  assert.equal(other.outbox.some(e => /45%/.test(e.m)), false);
  assert.deepEqual(p.char.condition, { field_emitter: 45 });
  assert.equal(game.events.some(e => e.s === c.id), false);
});

test('a ground unit navigates around the quartermaster, remains parked, and can recover from owner separation', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('keeper'));
  commission(game, p);
  const c = deploy(game, p);
  assert.ok(groundSegmentClear(c, c, SPINDLE_TUNING.radius));
  Object.assign(c, { x: -8, z: -1.8 });
  Object.assign(p, { x: -.8, z: -1.8, yaw: -Math.PI / 2 + .3 });
  assert.equal(groundSegmentClear(c, p, SPINDLE_TUNING.radius), false);
  for (let i = 0; i < 120; i++) {
    const before = { x: c.x, z: c.z };
    tickMachine(game, c, 50);
    assert.ok(dist(before, c) <= SPINDLE_TUNING.followSpeed * .05 + .001);
    assert.ok(groundSegmentClear(before, c, SPINDLE_TUNING.radius));
  }
  assert.ok(c.x > -3.5, 'cleared the quartermaster footprint');
  assert.ok(petCommand(game, p, 'stay').ok);
  const parked = { x: c.x, z: c.z };
  p.x += 5;
  tickMachine(game, c, 500);
  assert.equal(dist(parked, c), 0);
  p.x = 45;
  tickMachine(game, c, 50);
  assert.equal(c.mode, 'follow');
  assert.equal(c.act, 'stranded');
  assert.equal(dist(parked, c), 0);
  p.x = 0;
  tickMachine(game, c, 1000);
  assert.equal(c.act, 'idle');
  p.dead = true;
  tickMachine(game, c, 100);
  assert.equal(c.act, 'dormant');
  assert.equal(petCommand(game, p, 'inspect').ok, false);
  game.time += 3000;
  assert.ok(game.respawn(p));
  // Transit rule (owner, 2026-11-19): respawn dismisses the active companion
  // instead of redeploying it; ownership and profile persist for re-summoning.
  assert.equal(game.ents.has(c.id), false);
  assert.equal(p.companion, null);
  assert.equal(p.char.companionDismissed, true);
  assert.ok(p.char.spindle, 'the Spindle profile is kept');
  assert.ok(manageCompanion(game, p, 'summon', 'spindle').ok);
  assert.ok(groundSegmentClear(p.companion, p.companion, SPINDLE_TUNING.radius));
});

test('on disk, selection, active type and individual names survive reload independently', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spindle-store-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'characters.json');
  const store = new CharacterStore(file), game = makeGame();
  const { char, token } = store.create('Ratchet', 'symbiotech');
  const p = game.addPlayer(char);
  assert.ok(renameCompanion(game, p, 'Caretaker').ok);
  commission(game, p);
  assert.ok(manageCompanion(game, p, 'default', 'mender').ok);
  deploy(game, p);
  assert.ok(renameCompanion(game, p, 'Machinist', 'spindle').ok);
  assert.ok(petCommand(game, p, 'stay', 'spindle').ok);
  game.removePlayer(p.id);
  store.flush();
  const loaded = new CharacterStore(file);
  const restored = game.addPlayer(loaded.authenticate(token));
  assert.deepEqual([restored.companion?.name, restored.spindleCompanion?.name,
    restored.spindleCompanion?.mode, restored.char.defaultCompanion],
    ['Caretaker', 'Machinist', 'stay', 'mender']);
  assert.equal(manageCompanion(game, restored, 'dismiss', 'spindle').ok, true);
  assert.equal(restored.companion?.name, 'Caretaker');
  game.removePlayer(restored.id);
  loaded.markDirty(); loaded.flush();
  const dismissed = game.addPlayer(new CharacterStore(file).authenticate(token));
  assert.equal(dismissed.spindleCompanion, null);
  assert.equal(dismissed.companion?.name, 'Caretaker');
  assert.ok(manageCompanion(game, dismissed, 'summon', 'spindle').ok);
  assert.equal(dismissed.spindleCompanion?.name, 'Machinist');
});

test('transit dismisses both companions without losing acquisition or shared buff records', () => {
  const game = makeGame(), p = game.addPlayer(makeChar('symbiotech'));
  commission(game, p);
  const spindle = deploy(game, p), mender = p.companion;
  assert.equal(petCommand(game, p, 'light', 'spindle').ok, true);
  assert.equal(petCommand(game, p, 'guard').ok, true);
  const buffs = p.buffs.map(b => ({ ...b }));
  game.transit(p, WORLD.spawn.x, WORLD.spawn.z, 'trial transit');
  assert.equal(p.companion, null);
  assert.equal(p.spindleCompanion, null);
  assert.equal(game.ents.has(spindle.id), false);
  assert.equal(game.ents.has(mender.id), false);
  assert.deepEqual(p.buffs, buffs, 'transit preserves buff records');
  assert.equal(p.char.companionDismissed, true);
  assert.equal(p.char.spindleDismissed, true);
  assert.equal(p.char.spindle.name, 'Spindle');
  assert.equal(manageCompanion(game, p, 'summon', 'mender').ok, true);
  assert.equal(manageCompanion(game, p, 'summon', 'spindle').ok, true);
  assert.equal(p.companion.type, 'mender');
  assert.equal(p.spindleCompanion.type, 'spindle');
  assert.equal(p.spindleCompanion.lightOn, false);
});
