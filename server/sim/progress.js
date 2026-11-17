// Character progression: experience, loot, directives, loadout changes and
// world interactions. All mutations of persistent character state go
// through here.

import { ENEMIES, ITEMS, DIRECTIVES, XP_TO_NEXT, MAX_LEVEL, SLOTS, ARCHIVIST_LINES, ATTUNEMENT_NAMES } from '../../shared/content.js';
import { tryEquip, tryUnequip } from '../../shared/build.js';
import { dist } from '../../shared/world.js';
import { SURVEY, surveyState } from '../../shared/survey.js';

const INTERACT_RANGE = 5;
const CREDIT_RANGE = 70;

export function grantXp(game, p, amount) {
  const c = p.char;
  if (amount <= 0) return;
  if (c.level >= MAX_LEVEL) return;
  c.xp += amount;
  p.outbox.push({ e: 'xp', a: amount });
  while (c.level < MAX_LEVEL && c.xp >= XP_TO_NEXT[c.level]) {
    c.xp -= XP_TO_NEXT[c.level];
    c.level += 1;
    game.refreshStats(p);
    p.hp = p.maxHp;
    p.metaVer += 1;
    game.events.push({ e: 'lvl', id: p.id, l: c.level });
    game.message(p, 'gain', `You reached level ${c.level}. Your skills sharpen.`);
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  game.markDirty(p);
}

export function grantItem(game, p, itemId) {
  const c = p.char;
  if (!ITEMS[itemId] || c.inventory.includes(itemId)) return false;
  c.inventory.push(itemId);
  p.outbox.push({ e: 'loot', item: itemId });
  game.message(p, 'gain', `You receive: ${ITEMS[itemId].name}.`);
  game.markDirty(p);
  return true;
}

function goalMet(p, goal) {
  const c = p.char;
  if (goal.kill) return c.quest.progress >= goal.count;
  if (goal.equip) return !!c.equipped[goal.equip];
  if (goal.attune) return c.attunements.includes(goal.attune);
  return false;
}

/** Advance the directive chain as far as current state allows. */
export function checkDirective(game, p) {
  const c = p.char;
  let advanced = false;
  while (c.quest.step < DIRECTIVES.length && goalMet(p, DIRECTIVES[c.quest.step].goal)) {
    const d = DIRECTIVES[c.quest.step];
    c.quest.step += 1;
    c.quest.progress = 0;
    advanced = true;
    game.message(p, 'gain', `Directive complete: ${d.title}.`);
    p.outbox.push({ e: 'directive', title: d.title });
    if (d.reward.classItem) grantItem(game, p, d.reward.classItem[c.cls]);
    if (d.reward.xp) grantXp(game, p, d.reward.xp);
  }
  if (advanced) game.markDirty(p);
}

/** Reward everyone who fought the enemy. Small groups are never split. */
export function onEnemyKilled(game, enemy, creditedIds) {
  const def = ENEMIES[enemy.type];
  for (const id of creditedIds) {
    const p = game.players.get(id);
    if (!p || dist(p, enemy) > CREDIT_RANGE) continue;
    grantXp(game, p, def.xp);
    for (const drop of def.loot) {
      if (!p.char.inventory.includes(drop.item) && game.rng() < drop.chance) grantItem(game, p, drop.item);
    }
    const d = DIRECTIVES[p.char.quest.step];
    if (d && d.goal.kill === enemy.type) {
      p.char.quest.progress += 1;
      game.markDirty(p);
    }
    checkDirective(game, p);
  }
}

function inCombat(game, p) {
  return game.time < p.combatUntil;
}

export function equipItem(game, p, itemId) {
  if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) return { ok: false, reason: 'Unknown item.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (inCombat(game, p)) return { ok: false, reason: 'You cannot modify your build in combat.' };
  if (p.char.equipped[ITEMS[itemId].slot] === itemId) return { ok: false, reason: 'That is already equipped.' };
  const res = tryEquip(p.char, itemId);
  if (!res.ok) return res;
  applyLoadout(game, p, res.equipped);
  game.message(p, 'info', `${ITEMS[itemId].name} equipped.`);
  return { ok: true };
}

export function unequipSlot(game, p, slot) {
  if (typeof slot !== 'string' || !SLOTS.includes(slot)) return { ok: false, reason: 'Unknown slot.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (inCombat(game, p)) return { ok: false, reason: 'You cannot modify your build in combat.' };
  const res = tryUnequip(p.char, slot);
  if (!res.ok) return res;
  const name = ITEMS[p.char.equipped[slot]].name;
  applyLoadout(game, p, res.equipped);
  game.message(p, 'info', `${name} removed.`);
  return { ok: true };
}

function applyLoadout(game, p, equipped) {
  p.char.equipped = equipped;
  game.refreshStats(p);
  p.buffs = p.buffs.filter((b) => b.k !== 'shield');
  game.events.push({ e: 'fx', k: 'equip', s: p.id });
  game.markDirty(p);
  checkDirective(game, p);
}

export function interact(game, p, objectId) {
  const obj = game.ents.get(objectId);
  if (!obj || obj.kind !== 'object') return { ok: false, reason: 'Nothing to interact with.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (dist(p, obj) > INTERACT_RANGE) return { ok: false, reason: 'Move closer.' };
  if (obj.type === 'obelisk') {
    if (p.char.attunements.includes('resonance')) {
      game.message(p, 'info', 'The stone hums in recognition. You are already attuned.');
      return { ok: true };
    }
    p.char.attunements.push('resonance');
    game.events.push({ e: 'fx', k: 'attune', s: p.id, o: obj.id });
    p.outbox.push({ e: 'attune', a: 'resonance' });
    game.message(p, 'gain', `The stone answers. You gain Attunement: ${ATTUNEMENT_NAMES.resonance}.`);
    game.markDirty(p);
    checkDirective(game, p);
    return { ok: true };
  }
  if (obj.type === 'sinter_sampler') {
    // Alternative source of the existing unique item; no repeatable XP or new save state.
    if (p.char.inventory.includes('sinter_laminate')) {
      game.message(p, 'info', 'The interferometer identifies the same mineral-biological composite already in your inventory.');
      return { ok: true };
    }
    if (!p.char.attunements.includes('resonance')) {
      game.message(p, 'info', 'A maintenance note identifies the pale strata as living filters. The interference pattern requires Resonance attunement.');
      return { ok: true };
    }
    if (inCombat(game, p)) return { ok: false, reason: 'The interferometer cannot resolve a sample while you are in combat.' };
    let mode;
    if (p.cls === 'vanguard') {
      if (p.stats.glyph === 'glyph_resonant_aegis' && p.buffs.some(b => b.k === 'ward' && b.until > game.time)) mode = 'kinetic';
      else game.message(p, 'info', 'Inscribe Resonant Aegis, activate Kinetic Ward beside the probe, then inspect it again. The ward isolates the mineral pattern.');
    } else if (p.cls === 'symbiotech') {
      if (p.stats.glyph === 'glyph_shared_pulse' && p.companion?.mode === 'triage' && dist(p.companion, obj) <= 5 &&
          p.buffs.some(b => b.k === 'hot' && b.src === p.id && b.until > game.time)) mode = 'symbiotic';
      else game.message(p, 'info', 'Inscribe Shared Pulse, bring your Mender in Triage, cast Mending Graft on yourself, then inspect the probe again. Its culture traces the pattern.');
    }
    if (!mode) return { ok: true };
    if (grantItem(game, p, 'sinter_laminate')) {
      game.events.push({ e: 'fx', k: 'sinter_sample', s: p.id, o: obj.id, mode });
      game.message(p, 'info', 'A stable interference trace separates a loose laminate from the collector. The grazers and their predators incorporate the same mineral layers.');
    }
    return { ok: true };
  }
  const branch = Object.keys(SURVEY).find(key => SURVEY[key].type === obj.type);
  if (branch) {
    const current = surveyState(p.char.survey);
    if (current) {
      game.message(p, 'info', current.endsWith('_done') ? 'Your investigation has already been reported.' : 'You have chosen your evidence. Report to Venn.');
      return { ok: true };
    }
    p.char.survey = branch;
    game.message(p, 'info', SURVEY[branch].field);
    game.message(p, 'info', 'Return to Archivist Venn to report your findings.');
    game.markDirty(p);
    return { ok: true };
  }
  if (obj.type === 'archivist') {
    const current = surveyState(p.char.survey);
    if (current && !current.endsWith('_done')) {
      p.char.survey = current + '_done'; // mark complete before granting XP
      p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: SURVEY[current].report });
      game.message(p, 'gain', 'Investigation complete: ' + SURVEY[current].title + '.');
      grantXp(game, p, 35);
      game.markDirty(p);
      return { ok: true };
    }
    const line = ARCHIVIST_LINES[Math.min(p.char.quest.step, ARCHIVIST_LINES.length - 1)];
    p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: line });
    return { ok: true };
  }
  return { ok: false, reason: 'Nothing happens.' };
}
