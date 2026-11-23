// Rare class armour: blueprints (personal, non-consumed), fabrication (class,
// discipline skill 13, materials) and the server-only 3% blueprint rolls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRecipe, RECIPES, MATERIALS } from '../shared/crafting.js';
import { GOODS } from '../shared/goods.js';
import { ITEMS, ENEMIES } from '../shared/content.js';
import { ARMOR_SET_SLOTS } from '../shared/armor-set-bonuses.js';
import { CLASS_ARMOUR_SOURCES, CLASS_ARMOUR_ARCHIVES, PENDING_SOURCES, classArmourItem, classArmourBlueprint } from '../shared/class-armour.js';
import { classArmourBlueprintDrop, CLASS_ARMOUR_DROPS, CLASS_ARMOUR_BLUEPRINT_CHANCE } from '../server/sim/loot-tables.js';
import { distributeCorpseLoot, lootState, openLoot } from '../server/sim/loot.js';
import { craftRecipe, equipItem, interact } from '../server/sim/progress.js';
import { claimClassArmourArchive } from '../server/sim/class-armour-sources.js';
import { OBJECTS } from '../shared/world.js';
import { dealDamage } from '../server/sim/combat.js';
import { makeChar, makeGame, place, enemyOf, isolate } from './helpers.js';

const CLASSES = ['vanguard', 'symbiotech', 'keeper', 'surveyor'];
const SKILL = { vanguard: 'kinetics', symbiotech: 'biotech', keeper: 'instrumentation', surveyor: 'instrumentation' };

test('every piece has its own blueprint and recipe that makes exactly that piece', () => {
  for (const cls of CLASSES) for (const slot of ARMOR_SET_SLOTS) {
    const item = classArmourItem(cls, slot), bp = classArmourBlueprint(cls, slot);
    const r = RECIPES['fabricate_' + item];
    assert.ok(GOODS[bp] && GOODS[bp].category === 'blueprint' && GOODS[bp].cap === 1, bp);
    assert.equal(GOODS[bp].item, item);
    assert.ok(GOODS[bp].name.includes(ITEMS[item].name));
    assert.deepEqual(r.output, { item });
    assert.equal(r.blueprint, bp);
    assert.equal(r.cls, cls);
    assert.equal(r.discipline, cls === 'symbiotech' ? 'Research' : 'Engineering');
    assert.deepEqual(r.requires, { [SKILL[cls]]: 13 });
    for (const m of Object.keys(r.inputs)) assert.ok(MATERIALS[m], m);
  }
});

test('fabrication enforces blueprint, class, skill 13 and materials, and never duplicates a piece', () => {
  const item = 'keeper_field_set_chest', id = 'fabricate_' + item, bp = classArmourBlueprint('keeper', 'chest');
  const rich = { sentinel_alloy: 20, mire_fibre: 20, resonance_fragment: 5 };
  const lvl = { level: 4 }; // instrumentation 10 + 3 = 13
  assert.match(previewRecipe(makeChar('keeper', { ...lvl, materials: rich }), id).reason, /blueprint/);
  assert.match(previewRecipe(makeChar('keeper', { level: 3, materials: rich, goods: { [bp]: 1 } }), id).reason, /Instrumentation 13/);
  assert.match(previewRecipe(makeChar('surveyor', { ...lvl, materials: rich, goods: { [bp]: 1 } }), id).reason, /profession/);
  assert.match(previewRecipe(makeChar('keeper', { ...lvl, materials: { sentinel_alloy: 1 }, goods: { [bp]: 1 } }), id).reason, /Needs/);
  const game = makeGame();
  const p = game.addPlayer(makeChar('keeper', { ...lvl, materials: { ...rich }, goods: { [bp]: 1 } }));
  const station = game.objects.find((o) => o.type === 'sanctum_fabricator');
  place(p, station.x, station.z + 2);
  assert.ok(craftRecipe(game, p, id).ok);
  assert.ok(p.char.inventory.includes(item));
  assert.equal(p.char.goods[bp], 1, 'blueprint knowledge is retained');
  assert.equal(p.char.materials.sentinel_alloy, 16);
  assert.equal(craftRecipe(game, p, id).ok, false, 'unique piece');
  const hp = p.maxHp;
  assert.ok(equipItem(game, p, item).ok);
  assert.equal(p.maxHp, hp + 14);
});

test('blueprint sources exist in the world or are recorded as pending; drops follow the source map', () => {
  assert.deepEqual(PENDING_SOURCES, [], 'no unimplemented blueprint sources remain');
  const names = Object.fromEntries(Object.entries(ENEMIES).map(([k, e]) => [e.name, k]));
  for (const cls of CLASSES) for (const slot of ARMOR_SET_SLOTS) {
    const src = CLASS_ARMOUR_SOURCES[cls][slot];
    const type = names[src];
    if (!type) {
      const archive = CLASS_ARMOUR_ARCHIVES[src];
      assert.ok(archive, `${src} must have an obtainable, named archive source`);
      assert.deepEqual([archive.cls, archive.slot], [cls, slot]);
      assert.ok(OBJECTS.some((obj) => obj.type === archive.objectType), src + ': source must be interactable');
      assert.equal(GOODS[classArmourBlueprint(cls, slot)].pending, false);
      continue;
    }
    assert.equal(CLASS_ARMOUR_DROPS[type][cls], slot, `${type} drops the ${cls} ${slot} blueprint`);
  }
  // nothing drops that the source map does not name
  for (const [type, byCls] of Object.entries(CLASS_ARMOUR_DROPS)) for (const [cls, slot] of Object.entries(byCls)) assert.equal(names[CLASS_ARMOUR_SOURCES[cls][slot]], type);
});

test('rolls are 3%, class-specific, one per recipient, and stop once the blueprint is known', () => {
  const v = makeChar('vanguard');
  assert.equal(classArmourBlueprintDrop('warden', v, () => CLASS_ARMOUR_BLUEPRINT_CHANCE - 1e-9), 'blueprint_vanguard_field_set_chest');
  assert.equal(classArmourBlueprintDrop('warden', v, () => CLASS_ARMOUR_BLUEPRINT_CHANCE), null);
  assert.equal(classArmourBlueprintDrop('warden', makeChar('surveyor'), () => 0), null, 'no surveyor piece from the Warden');
  assert.equal(classArmourBlueprintDrop('warden', { ...v, goods: { blueprint_vanguard_field_set_chest: 1 } }, () => 0), null);
  for (const bad of [() => NaN, () => -1, () => 1]) assert.equal(classArmourBlueprintDrop('warden', v, bad), null);
  let calls = 0;
  classArmourBlueprintDrop('skitter', v, () => { calls++; return 0; });
  assert.equal(calls, 0, 'no roll is spent where nothing could drop');

  const game = makeGame(), e = enemyOf(game, 'sentinel'); isolate(game, e);
  const p = game.addPlayer(makeChar('vanguard')), k = game.addPlayer(makeChar('keeper'));
  place(p, e.x, e.z); place(k, e.x, e.z);
  game.rng = () => 0.999; game.classArmourRng = () => 0;
  dealDamage(game, p, e, 99999, 'test');
  dealDamage(game, k, e, 0, 'test');
  const gen = e.lootGeneration;
  assert.ok(openLoot(game, p, e.id, gen).ok);
  const entries = lootState(game, p).loot.entries;
  assert.ok(entries.some((x) => x.id === 'blueprint_vanguard_field_set_gloves'));
  assert.ok(!entries.some((x) => x.kind === 'item' && x.id.includes('field_set')), 'never a finished piece');
  distributeCorpseLoot(game, e, [p.id]); // replays add nothing
  assert.equal(lootState(game, p).loot.entries.filter((x) => x.id === 'blueprint_vanguard_field_set_gloves').length, 1);
});


test('four named archives reward earned class knowledge via actual in-world interaction, never a finished item', () => {
  for (const [source, archive] of Object.entries(CLASS_ARMOUR_ARCHIVES)) {
    const game = makeGame();
    const char = makeChar(archive.cls, {
      level: 8, survey: 'signal_done', brineStage: 3,
      attunements: ['resonance'], riftCalibration: 'completed',
    });
    const p = game.addPlayer(char);
    const obj = game.objects.find((o) => o.type === archive.objectType);
    assert.ok(obj, source);
    place(p, obj.x, obj.z + 1.5);
    const result = interact(game, p, obj.id);
    assert.ok(result.ok, source + ': ' + result.reason);
    const bp = classArmourBlueprint(archive.cls, archive.slot);
    const item = classArmourItem(archive.cls, archive.slot);
    assert.equal(p.char.goods[bp], 1, source);
    assert.ok(!p.char.inventory.includes(item), source + ': award is knowledge, not an item');
    assert.equal(claimClassArmourArchive(game, p, obj), null, 'claim once even if the same object is reused');
    assert.equal(p.char.goods[bp], 1);
    // Actual fabrication consumes appropriate resources, retains the single blueprint.
    const recipe = RECIPES['fabricate_' + item];
    p.char.materials = { ...recipe.inputs };
    const bench = game.objects.find((o) => o.type === 'sanctum_fabricator');
    place(p, bench.x, bench.z + 1);
    const crafted = craftRecipe(game, p, 'fabricate_' + item);
    assert.ok(crafted.ok, source + ': ' + crafted.reason);
    assert.ok(p.char.inventory.includes(item));
    assert.equal(p.char.goods[bp], 1, 'recipe never consumes knowledge');
    assert.equal(craftRecipe(game, p, 'fabricate_' + item).ok, false, 'no duplicate craft');
  }
});

test('archives do not bypass class, level, attunement, commissioning, calibration or world ownership', () => {
  for (const [source, archive] of Object.entries(CLASS_ARMOUR_ARCHIVES)) {
    const game = makeGame();
    const p = game.addPlayer(makeChar(archive.cls, { level: 8, attunements: ['resonance'],
      survey: 'signal_done', brineStage: 3, riftCalibration: 'completed' }));
    const obj = game.objects.find((o) => o.type === archive.objectType);
    place(p, obj.x, obj.z + 1.5);
    const bp = classArmourBlueprint(archive.cls, archive.slot);
    const deny = () => {
      assert.equal(claimClassArmourArchive(game, p, obj), null, source);
      assert.equal(p.char.goods?.[bp] || 0, 0, source);
    };
    p.char.level = 7; deny(); p.char.level = 8;
    p.char.attunements = []; deny(); p.char.attunements = ['resonance'];
    p.combatUntil = game.time + 1000; deny(); p.combatUntil = 0;
    p.autoOn = true; deny(); p.autoOn = false;
    if (obj.type.startsWith('brine_')) {
      p.char.brineStage = 2; deny(); p.char.brineStage = 3;
      p.char.survey = null; deny(); p.char.survey = 'signal_done';
    }
    if (obj.type === 'rift_regulator') {
      p.char.riftCalibration = 'recorded'; deny(); p.char.riftCalibration = 'completed';
    }
    assert.equal(claimClassArmourArchive(game, p, { ...obj }), null, 'forged object identity rejected');
    place(p, obj.x + 8, obj.z); deny();
    place(p, obj.x, obj.z + 1.5);
    assert.ok(interact(game, p, obj.id).ok);
    assert.equal(p.char.goods[bp], 1);
  }
});

test('unattuned keeper can still attune at the Stone, then obtain the separate Echo at level 8', () => {
  const game = makeGame();
  const stone = game.objects.find((o) => o.type === 'obelisk');
  const p = game.addPlayer(makeChar('keeper', { level: 8 }));
  place(p, stone.x, stone.z + 1.5);
  assert.ok(interact(game, p, stone.id).ok);
  assert.ok(p.char.attunements.includes('resonance'));
  assert.equal(p.char.goods?.blueprint_keeper_field_set_greaves, undefined);
  assert.ok(interact(game, p, stone.id).ok);
  assert.equal(p.char.goods.blueprint_keeper_field_set_greaves, 1);
});
