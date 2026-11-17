// Character progression: experience, loot, directives, loadout changes and
// world interactions. All mutations of persistent character state go
// through here.

import { CLASSES, ENEMIES, ITEMS, DIRECTIVES, directiveFor, XP_TO_NEXT, MAX_LEVEL, SLOTS, ARCHIVIST_LINES, ATTUNEMENT_NAMES } from '../../shared/content.js';
import { tryEquip, tryUnequip } from '../../shared/build.js';
import { dist, inSanctum } from '../../shared/world.js';
import { MATERIALS, MATERIAL_CAP, SALVAGE, RECIPES, sanitizeMaterials, previewRecipe } from '../../shared/crafting.js';
import { SURVEY, surveyState, BRINE_TRIAL, BRINE_ROUTES, brineStage } from '../../shared/survey.js';

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
  if (goal.ability) return c.quest.progress >= goal.count;
  if (goal.kill) return c.quest.progress >= goal.count;
  if (goal.equip) return !!c.equipped[goal.equip];
  if (goal.attune) return c.attunements.includes(goal.attune);
  return false;
}

/** Advance the directive chain as far as current state allows. */
export function checkDirective(game, p) {
  const c = p.char;
  let advanced = false;
  while (c.quest.step < DIRECTIVES.length && goalMet(p, directiveFor(c.cls, c.quest.step).goal)) {
    const d = directiveFor(c.cls, c.quest.step);
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
    grantSalvage(game,p,SALVAGE[enemy.type]);
    for (const drop of def.loot) {
      if (!p.char.inventory.includes(drop.item) && game.rng() < drop.chance) grantItem(game, p, drop.item);
    }
    const d = directiveFor(p.cls, p.char.quest.step);
    if (d && d.goal.kill === enemy.type) {
      p.char.quest.progress += 1;
      game.markDirty(p);
    }
    checkDirective(game, p);
  }
}

function grantSalvage(game,p,id) {
  if(!Object.hasOwn(MATERIALS,id))return;
  const m=sanitizeMaterials(p.char.materials);
  if((m[id]||0)>=MATERIAL_CAP)return;
  m[id]=(m[id]||0)+1;
  p.char.materials=m;
  game.message(p,'gain','Salvaged: '+MATERIALS[id].name+'.');
  game.markDirty(p);
}

export function craftRecipe(game,p,id) {
  if(p.dead)return {ok:false,reason:'You are defeated.'};
  if(inCombat(game,p))return {ok:false,reason:'Fabrication is locked during combat.'};
  if(!inSanctum(p))return {ok:false,reason:'Return to the Lattice Sanctum workshop.'};
  const result=previewRecipe(p.char,id);
  if(!result.ok)return result;
  // One synchronous transaction, after every requirement has passed.
  p.char.inventory=result.inventory;
  p.char.materials=result.materials;
  const out=RECIPES[id].output;
  if(out.item)p.outbox.push({e:'loot',item:out.item});
  game.message(p,'gain','Fabricated: '+(out.item?ITEMS[out.item].name:MATERIALS[out.material].name)+'.');
  game.markDirty(p);
  return {ok:true};
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

const denied = reason => ({ok:false, reason});
const ok = {ok:true};
function abortTrial(game,p,reason) {
  p.brineTrial = null;
  game.message(p,'info',reason+' Re-arm at the second station.');
}
export function tickBrineTrial(game,p) {
  if (!p.brineTrial) return;
  if (p.dead) abortTrial(game,p,'Field test interrupted.');
  else if (game.time >= p.brineTrial.until) abortTrial(game,p,'Field test timed out.');
  else if (dist(p,BRINE_TRIAL.exclusion) < BRINE_TRIAL.exclusion.r) abortTrial(game,p,'Pressure exclusion breached. Readings invalidated.');
}
function operateBrine(game,p,obj) {
  const state=surveyState(p.char.survey);
  if (!state?.endsWith('_done')) return denied('Report your evidence to Venn first.');
  const route=BRINE_ROUTES[state.slice(0,-5)], stage=brineStage(p.char.brineStage);
  const type=obj.type, station=type.startsWith('brine_');
  if (inCombat(game,p)) return denied('Disengage before handling exposed equipment.');
  tickBrineTrial(game,p);
  if (stage===3) {
    if (!station) {game.message(p,'info','The verified field record is archived.');return ok;}
    if (game.time < p.brineServiceUntil) return denied('Facility cooling down: '+Math.ceil((p.brineServiceUntil-game.time)/1000)+'s.');
    if (type==='brine_research') {
      if (p.res>=CLASSES[p.cls].resource.max) return denied('Resource already full.');
      p.res=Math.min(CLASSES[p.cls].resource.max,p.res+35);
      game.message(p,'gain','Field supply: 35 resource restored.');
    } else {
      if (p.hp>=p.maxHp) return denied('Health already full.');
      p.hp=Math.min(p.maxHp,p.hp+Math.ceil(p.maxHp*0.3));
      game.message(p,'gain','Field repair: up to 30% maximum health restored.');
    }
    p.brineServiceUntil=game.time+BRINE_TRIAL.serviceMs;
    return ok;
  }
  if (stage===0) {
    if (type!==route.first) return denied('Start at '+route.firstName+'.');
    p.char.brineStage=1;game.markDirty(p);
    game.message(p,'info','Preparation recorded. Continue to '+route.secondName+'.');
    return ok;
  }
  if (stage===1 || (stage===2 && !p.brineTrial)) {
    if (type!==route.second) return denied('Arm the live test at '+route.secondName+'.');
    if (dist(p,BRINE_TRIAL.exclusion)<BRINE_TRIAL.exclusion.r) return denied('Stand outside the pressure exclusion zone.');
    p.char.brineStage=2;p.brineTrial={until:game.time+BRINE_TRIAL.ms,read:0};game.markDirty(p);
    game.message(p,'info','Live test armed: '+route.readNames.join(' then ')+'. Avoid the pressure exclusion zone.');
    return ok;
  }
  if (!p.brineTrial) return denied('Re-arm the live test.');
  if (type!==route.read[p.brineTrial.read]) return denied('Next reading: '+route.readNames[p.brineTrial.read]+'.');
  if (++p.brineTrial.read<route.read.length) {
    game.message(p,'info','Reading recorded. Continue to '+route.readNames[p.brineTrial.read]+'.');
    return ok;
  }
  p.brineTrial=null;p.char.brineStage=3;
  grantItem(game,p,route.reward);grantXp(game,p,55);game.markDirty(p);
  game.message(p,'gain','Brineworks commissioned. Field services unlocked.');
  return ok;
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
  if (obj.type.startsWith('brine_') || (obj.type.startsWith('survey_') && surveyState(p.char.survey)?.endsWith('_done'))) return operateBrine(game,p,obj);
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
      game.message(p, 'gain', 'Evidence reported: ' + SURVEY[current].title + '. Return to Brineworks to commission the site.');
      grantXp(game, p, 35);
      game.markDirty(p);
      return { ok: true };
    }
    if (p.cls === 'surveyor' && p.char.quest.step === 0) {
      p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: 'Do not waste a charge on a blind shot. Map the fault, bore into it, and rig the ground before you commit.' });
      return { ok: true };
    }
    const line = ARCHIVIST_LINES[Math.min(p.char.quest.step, ARCHIVIST_LINES.length - 1)];
    p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: line });
    return { ok: true };
  }
  return { ok: false, reason: 'Nothing happens.' };
}
