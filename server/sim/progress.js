import { killXp } from './enemy-levels.js';
import {appearanceString} from '../../shared/appearance.js';
// Character progression: experience, loot, directives, loadout changes and
// world interactions. All mutations of persistent character state go
// through here.

import { CLASSES, ENEMIES, ITEMS, DIRECTIVES, directiveFor, XP_TO_NEXT, MAX_LEVEL, SLOTS, ARCHIVIST_LINES, ATTUNEMENT_NAMES } from '../../shared/content.js';
import { tryEquip, tryUnequip } from '../../shared/build.js';
import { buildPreviewOptions } from '../gm-build.js';
import { dist, inSanctum, hasLineOfSight, COLLIDERS, sameTravelRegion } from '../../shared/world.js';
import { travelSeverance, gateFront } from './severance-gate.js';
import { travelLumenfen } from './lumenfen.js';
import { recordFoundryKill, claimFoundryCache, leaveFoundry, enterNullBreach } from './silent-foundry.js';
import { MATERIALS, MATERIAL_CAP, RECIPES, sanitizeMaterials, previewRecipe, canFabricateAt } from '../../shared/crafting.js';
import { SURVEY, surveyState, BRINE_TRIAL, BRINE_ROUTES, BRINE_REWARD_XP, brineStage, FIELD_RECORDS, workshopSite } from '../../shared/survey.js';

import { directiveDialogueId, getRadioDialogue } from '../../shared/dialogue.js';
import { distributeCorpseLoot } from './loot.js';
import { openVendor } from './vendor.js';
import { interactRift } from './rift.js';
import {traceTalk,traceRead} from './field-quests.js';
import { sanitizeCondition } from '../../shared/condition.js';
import { WEAPON_SWITCH, activeWeaponSlot, equippedWeapon, electricalRodActive } from '../../shared/weapons.js';
import { equipmentAttributes, attributeChanges } from '../../shared/attributes.js';
import { GOODS, sanitizeGoods } from '../../shared/goods.js';
import {recoverField} from './recovery.js';
import {sanitizeDirectiveReceipts} from '../../shared/directive-receipts.js';
import {recordFieldReceipt} from './field-receipts.js';
import {creditDiscipline} from './crafting-disciplines.js';
import {containmentAlarm} from './kestrel-alarm.js';
import {startVeinHarvest} from './severance-veins.js';

const INTERACT_RANGE = 5;
const CREDIT_RANGE = 70;
const INSCRIPTION_MS = 1800;

export function grantXp(game, p, amount, source = 'other') {
  const c = p.char;
  // All rewards originate on the server. Invalid awards or corrupted live
  // records cannot introduce fractional XP, NaN, or an unearned level.
  if (!Number.isSafeInteger(amount) || amount <= 0 ||
      !Number.isInteger(c.level) || c.level < 1 || c.level >= MAX_LEVEL ||
      !Number.isSafeInteger(c.xp) || c.xp < 0 || c.xp >= XP_TO_NEXT[c.level]) return 0;
  // Credit only what fits before the actual cap, including a partial final award.
  const remaining = XP_TO_NEXT.slice(c.level, MAX_LEVEL).reduce((sum, need) => sum + need, 0) - c.xp;
  const credited = Math.min(amount, remaining);
  if (credited <= 0) return 0;
  game.economy?.observe('xp_awarded', p, credited, ['enemy','directive','quest'].includes(source) ? source : 'other');
  c.xp += credited;
  p.outbox.push({ e: 'xp', a: credited });
  while (c.level < MAX_LEVEL && c.xp >= XP_TO_NEXT[c.level]) {
    c.xp -= XP_TO_NEXT[c.level];
    c.level += 1;
    game.refreshStats(p);
    p.hp = p.maxHp;
    p.metaVer += 1;
    game.emitWorldEvent({ e: 'lvl', id: p.id, l: c.level });
    game.message(p, 'gain', `You reached level ${c.level}. Your skills sharpen.`);
  }
  if (c.level >= MAX_LEVEL) c.xp = 0;
  game.markDirty(p);
  return credited;
}

export function grantItem(game, p, itemId) {
  const c = p.char;
  if (!ITEMS[itemId] || c.inventory.includes(itemId)) return false;
  c.inventory.push(itemId);
  game.economy?.observe('items_granted', p, 1, itemId);
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

// Private, server-authored transmission. Keep the existing log and gain toast;
// radio is an additional presentation event, never a chat channel.
export function transmit(game,p,source,kind,message,dialogueId) {
  game.message(p,kind,message);
  p.outbox.push({e:'radio',source,m:message,...(dialogueId ? {dialogueId} : {})});
}
function transmitAuthored(game,p,id) {
  const d=getRadioDialogue(id);
  if (!d) throw new Error('Unknown authored radio dialogue: '+id);
  transmit(game,p,d.source,d.kind,d.transcript,d.id);
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
    const itemId=d.reward.classItem?.[c.cls];
    const item=itemId&&grantItem(game,p,itemId)?itemId:null;
    const xp=d.reward.xp?grantXp(game,p,d.reward.xp,'directive'):0;
    // Completion, rewards and receipt are one synchronous server transition.
    // Earlier completions without recorded receipts are not reconstructed.
    c.directiveReceipts=[...sanitizeDirectiveReceipts(c.directiveReceipts,c.cls,c.quest.step-1),{id:d.id,xp,item}];
  }
  if (advanced) {
    game.markDirty(p);
    transmitAuthored(game,p,directiveDialogueId(c.cls,c.quest.step));
  }
}

/** Reward everyone who fought the enemy. Small groups are never split. */
export function onEnemyKilled(game, enemy, creditedIds) {
  // Corpse generation changes only once per death, even when a reward
  // delivery is retried. Share that existing guard with XP and directives.
  const generation = enemy.lootGeneration || 0;
  distributeCorpseLoot(game,enemy,creditedIds);
  // In production the death transition owns this callback. Existing simulation
  // fixtures may call it directly without a dead corpse to record quest credit.
  if (enemy.state === 'dead' && enemy.lootGeneration === generation) return;
  for (const id of new Set(creditedIds)) {
    const p = game.players.get(id);
    if (!p || !sameTravelRegion(p, enemy) || dist(p, enemy) > CREDIT_RANGE) continue;
    game.economy?.observe('kills', p, 1, enemy.type);
    grantXp(game, p, killXp(enemy, p.char.level), 'enemy');
    if(recordFoundryKill(game,p,enemy))continue; // Foundry archetypes do not complete Reach directives
    if(enemy.annexEncounter){
      const prior=p.char.annexProgress||0,bit=enemy.type==='warden'?2:1;
      p.char.annexProgress=prior|bit;
      if(prior!==p.char.annexProgress){game.markDirty(p);game.message(p,'info',p.char.annexProgress===3?'Null Chamber cache authorized. Claim your recovery at the far end.':'Annex encounter recorded.');}
      continue; // The recycled archetypes must not complete Reach directives remotely.
    }
    const d = directiveFor(p.cls, p.char.quest.step);
    if (d && d.goal.kill === enemy.type) {
      p.char.quest.progress += 1;
      game.markDirty(p);
    }
    checkDirective(game, p);
  }
}

export function grantSalvage(game,p,id,count=1) {
  if(!Object.hasOwn(MATERIALS,id)||!Number.isSafeInteger(count)||count<1)return false;
  const m=sanitizeMaterials(p.char.materials);
  if((m[id]||0)+count>MATERIAL_CAP)return false;
  m[id]=(m[id]||0)+count;
  p.char.materials=m;
  game.economy?.observe('materials_granted',p,count,id);
  game.message(p,'gain','Salvaged: '+MATERIALS[id].name+(count>1?' × '+count:'')+'.');
  game.markDirty(p);return true;
}

export function craftRecipe(game,p,id,rev,{ quiet = false } = {}) {
  if(p.dead)return {ok:false,reason:'You are defeated.'};
  if(inCombat(game,p))return {ok:false,reason:'Fabrication is locked during combat.'};
  if(!Object.hasOwn(RECIPES,id))return {ok:false,reason:'Unknown recipe.'};
  if(!canFabricateAt(RECIPES[id],workshopSite(p)))return {ok:false,reason:'Use the appropriate Workshop: Lattice Sanctum or commissioned Brineworks station.'};
  if(RECIPES[id].output.goods&&(!Number.isSafeInteger(rev)||rev!==p.utilityRev))return {ok:false,reason:'Utility fabrication request expired. Refresh the Workshop.'};
  const result=previewRecipe(p.char,id);
  if(!result.ok)return result;
  // One synchronous transaction, after every requirement has passed.
  p.char.inventory=result.inventory;
  p.char.materials=result.materials;
  if(result.goods){p.char.goods=result.goods;p.utilityRev++;}
  p.char.condition=sanitizeCondition(p.char.condition,p.char.inventory);
  const out=RECIPES[id].output;
  creditDiscipline(game,p,RECIPES[id]);
  if(out.item==='survey_strider_link'){
    p.char.striderLearned=true;
    if(!p.companion)p.char.companionDismissed=true;
    if(!p.char.defaultCompanion)p.char.defaultCompanion='survey_strider';
    p.char.inventory=p.char.inventory.filter(key=>key!==out.item);
    game.message(p,'gain','Learned: Survey Strider deployment. Summon from your hotbar or Companion Sheet.');
  }
  if (!quiet) {
    if(out.item&&out.item!=='survey_strider_link')p.outbox.push({e:'loot',item:out.item});
    game.message(p,'gain','Fabricated: '+(out.item?ITEMS[out.item].name:out.goods?GOODS[out.goods].name+' × '+out.count:MATERIALS[out.material].name)+'.');
  }
  // Count only committed fabrication, never previews, failed cycles, or
  // free restoration loops as resource creation.
  game.economy?.observe('craft_cycles', p, 1, id);
  for (const [material, quantity] of Object.entries(RECIPES[id].inputs)) {
    game.economy?.observe('materials_spent', p, quantity, material);
  }
  const donors=RECIPES[id].targets || (RECIPES[id].target ? [RECIPES[id].target] : []);
  for (const donor of donors) game.economy?.observe('items_consumed', p, 1, donor);
  if (out.material) game.economy?.observe('materials_crafted', p, out.count, out.material);
  if (out.goods) game.economy?.observe('goods_crafted', p, out.count, out.goods);
  if (out.item && out.item!=='survey_strider_link') game.economy?.observe('items_crafted', p, 1, out.item);
  game.markDirty(p);
  return {ok:true};
}

function inCombat(game, p) {
  return game.time < p.combatUntil;
}

// Explicit configuration intent, not a toggle: replaying the same request is harmless.
export function setElectricalRodMode(game,p,mode) {
  if(mode!=='rod'&&mode!=='dual')return {ok:false,reason:'Unknown electrical rod configuration.'};
  if(p.char.equipped.weapon!=='electrical_combat_rod'||!p.char.inventory.includes('electrical_combat_rod'))return {ok:false,reason:'Equip your Electrical Combat Rod first.'};
  // A stowed rod cannot be reconfigured; its saved configuration is retained.
  if(!electricalRodActive(p.char))return {ok:false,reason:'Select your Electrical Combat Rod as the active weapon first.'};
  if(p.dead||inCombat(game,p)||p.autoOn||p.inscription||p.production||p.jy>.05)return {ok:false,reason:'Disengage and finish your current action before changing configuration.'};
  if((p.char.electricalRodMode||'rod')===mode)return {ok:true};
  p.char.electricalRodMode=mode;
  game.markDirty(p);
  return {ok:true};
}

// Explicit desired weapon mode ('weapon' melee or 'ranged'), not a toggle.
// Every class has both modes; an empty slot uses the class's innate attack.
// Allowed in combat; has its own recovery and can only delay the next
// auto-attack, never advance it. Ability cooldowns and the GCD are untouched.
export function selectWeapon(game,p,slot) {
  if(slot!=='weapon'&&slot!=='ranged')return {ok:false,reason:'Unknown weapon slot.'};
  if(p.dead)return {ok:false,reason:'You are defeated.'};
  if(p.inscription)return {ok:false,reason:'Finish or cancel the current inscription.'};
  if(p.production)return {ok:false,reason:'Finish or cancel production before switching weapons.'};
  if(activeWeaponSlot(p.char)===slot){
    // An explicit selection of the currently inferred mode still needs to
    // survive later equipment changes and a save/reconnect.
    if(p.char.activeWeapon!==slot){p.char.activeWeapon=slot;game.markDirty(p);}
    return {ok:true};
  }
  if(game.time<(p.weaponSwitchReady||0))return {ok:false,reason:'Weapon switch not ready yet.'};
  p.char.activeWeapon=slot;
  p.weaponSwitchReady=game.time+WEAPON_SWITCH.cooldownMs;
  p.nextAuto=Math.max(p.nextAuto||0,game.time+WEAPON_SWITCH.autoDelayMs);
  game.refreshPresentation(p);
  game.emitWorldEvent({e:'fx',k:'weapon_switch',s:p.id});
  game.markDirty(p);
  return {ok:true};
}

export function equipItem(game, p, itemId) {
  if (typeof itemId !== 'string' || !Object.hasOwn(ITEMS, itemId)) return { ok: false, reason: 'Unknown item.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (inCombat(game, p)) return { ok: false, reason: 'You cannot modify your build in combat.' };
  if (p.inscription) return { ok: false, reason: 'Finish or cancel the current inscription.' };
  if (p.production) return { ok: false, reason: 'Finish or cancel production before changing equipment.' };
  if (p.char.equipped[ITEMS[itemId].slot] === itemId) return { ok: false, reason: 'That is already equipped.' };
  const res = tryEquip(p.char, itemId, buildPreviewOptions(p));
  if (!res.ok) return res;
  if (ITEMS[itemId].slot === 'glyph') {
    if (p.followId || p.jy > 0.05 || p.autoOn) return { ok: false, reason: 'Stand still and disengage before inscribing a glyph.' };
    p.inscription = { itemId, x: p.x, z: p.z, until: game.time + INSCRIPTION_MS, traced: false };
    game.emitWorldEvent({ e: 'ritual', s: p.id, phase: 'begin' });
    return { ok: true };
  }
  applyLoadout(game, p, res.equipped, ITEMS[itemId].name);
  game.message(p, 'info', `${ITEMS[itemId].name} equipped.`);
  return { ok: true };
}

export function unequipSlot(game, p, slot) {
  if (typeof slot !== 'string' || !SLOTS.includes(slot)) return { ok: false, reason: 'Unknown slot.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (inCombat(game, p)) return { ok: false, reason: 'You cannot modify your build in combat.' };
  if (p.inscription) return { ok: false, reason: 'Finish or cancel the current inscription.' };
  if (p.production) return { ok: false, reason: 'Finish or cancel production before changing equipment.' };
  const res = tryUnequip(p.char, slot, buildPreviewOptions(p));
  if (!res.ok) return res;
  const name = ITEMS[p.char.equipped[slot]].name;
  applyLoadout(game, p, res.equipped, name);
  game.message(p, 'info', `${name} removed.`);
  if (res.alsoRemoved.length) {
    const names = res.alsoRemoved.map(id => ITEMS[id].name).join(', ');
    game.message(p, 'info', `Returned to inventory because requirements changed: ${names}.`);
  }
  return { ok: true };
}

function applyLoadout(game, p, equipped, itemName, playEquip = true) {
  // Stat-neutral clothing must not clear active shields or change combat stats.
  // A cascade removing real gear still follows the full loadout path.
  if (SLOTS.every(slot=>slot==='social_torso'||(p.char.equipped[slot]??null)===(equipped[slot]??null))) {
    p.char.equipped=equipped;
    game.refreshPresentation(p);
    game.markDirty(p);
    return;
  }
  const before = equipmentAttributes(p.char, p.stats);
  const wasActive = activeWeaponSlot(p.char);
  const beforeMelee = equippedWeapon(p.char, 'weapon');
  const beforeRanged = equippedWeapon(p.char, 'ranged');
  p.char.equipped = equipped;
  const afterMelee = equippedWeapon(p.char, 'weapon');
  const afterRanged = equippedWeapon(p.char, 'ranged');
  // Keep the selected mode when its weapon stays equipped or when a new
  // weapon fills the selected innate slot. An unrelated gear change must not
  // reset an explicitly chosen innate mode. Only a weapon-slot change that
  // leaves the selected slot empty releases selection for legacy fallback.
  if (equippedWeapon(p.char, wasActive)) p.char.activeWeapon = wasActive;
  else if (beforeMelee !== afterMelee || beforeRanged !== afterRanged) delete p.char.activeWeapon;
  game.refreshStats(p);
  const changes = attributeChanges(before, equipmentAttributes(p.char, p.stats));
  if (changes.length) p.outbox.push({ e: 'attributes', item: itemName, changes });
  p.buffs = p.buffs.filter((b) => b.k !== 'shield');
  if (playEquip) game.emitWorldEvent({ e: 'fx', k: 'equip', s: p.id });
  game.markDirty(p);
  checkDirective(game, p);
}

export function inscriptionState(game, p) {
  const ritual = p.inscription;
  return ritual ? { name: ITEMS[ritual.itemId].name, ms: Math.max(0, ritual.until - game.time), total: INSCRIPTION_MS } : null;
}

export function cancelInscription(game, p, reason = 'Inscription cancelled.') {
  if (!p.inscription) return;
  p.inscription = null;
  game.emitWorldEvent({ e: 'ritual', s: p.id, phase: 'cancel' });
  game.message(p, 'info', reason);
}

export function tickInscription(game, p) {
  const ritual = p.inscription;
  if (!ritual) return;
  if (p.dead || inCombat(game, p) || p.autoOn) return cancelInscription(game, p, 'Inscription interrupted by combat.');
  if (p.followId || p.jy > 0.05 || dist(p, ritual) > 0.1) return cancelInscription(game, p, 'Inscription interrupted by movement.');
  const ms = ritual.until - game.time;
  if (ms > 0) {
    if (!ritual.traced && ms <= INSCRIPTION_MS / 2) {
      ritual.traced = true;
      game.emitWorldEvent({ e: 'ritual', s: p.id, phase: 'trace' });
    }
    return;
  }
  const result = tryEquip(p.char, ritual.itemId, buildPreviewOptions(p));
  if (!result.ok) return cancelInscription(game, p, 'Inscription failed. ' + result.reason);
  p.inscription = null;
  const name = ITEMS[ritual.itemId].name;
  applyLoadout(game, p, result.equipped, name, false);
  game.emitWorldEvent({ e: 'ritual', s: p.id, phase: 'complete' });
  game.message(p, 'info', `${name} inscribed.`);
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
    game.emitWorldEvent({e:'fx',k:'brine_service',s:p.id});
    return ok;
  }
  if (stage===0) {
    if (type!==route.first) return denied('Start at '+route.firstName+'.');
    p.char.brineStage=1;game.markDirty(p);
    transmitAuthored(game,p,route.second==='brine_engineering'?'brine.prepare.engineering':'brine.prepare.research');
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
  const item=grantItem(game,p,route.reward)?route.reward:null;
  const xp=grantXp(game,p,BRINE_REWARD_XP.commissioning);
  recordFieldReceipt(p.char,'commissioning',{xp,item});game.markDirty(p);
  transmitAuthored(game,p,'brine.commissioned');
  game.emitWorldEvent({e:'fx',k:'brine_service',s:p.id});
  return ok;
}
// In-world customization is cosmetic-only, and gated by the same actual
// physical terminal as orientation. A stale client panel cannot edit remotely.
export function changeInitiationAppearance(game,p,appearance,persist=()=>{}){
 const terminal=game.objects.find(o=>o.type==='initiation_terminal');
 if(!terminal||p.dead||!inSanctum(p)||dist(p,terminal)>INTERACT_RANGE||!hasLineOfSight(p,terminal,COLLIDERS.filter(c=>c.type!=='arrival_terminal'))||inCombat(game,p)||p.autoOn||p.production||p.inscription)
   return {ok:false,reason:'Stand near the initiation terminal, alive and disengaged.'};
 if(typeof appearance!=='string'||appearance.length>48||appearanceString(appearance,p.char.look)!==appearance)
   return {ok:false,reason:'Invalid appearance selection.'};
 if(game.time<(p.appearanceReadyAt||0))return {ok:false,reason:'Wait briefly before changing your appearance again.'};
 if(p.char.appearance!==appearance){
   const previous=p.char.appearance;
   p.char.appearance=appearance;
   try{persist();}catch{
     p.char.appearance=previous;
     return {ok:false,reason:'Appearance could not be saved. Try applying it again.'};
   }
   p.metaVer++;
   game.markDirty(p);
 }
 p.appearanceReadyAt=game.time+600;
 p.outbox.push({e:'appearance_applied',appearance});
 return {ok:true};
}
export function interact(game, p, objectId) {
  const obj = game.ents.get(objectId);
  if (!obj || obj.kind !== 'object') return { ok: false, reason: 'Nothing to interact with.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (dist(p, obj) > INTERACT_RANGE) return { ok: false, reason: 'Move closer.' };
  if(Object.hasOwn(FIELD_RECORDS,obj.type))p.outbox.push({e:'field_record',key:obj.type});
  if(obj.type==='initiation_terminal'){
    if(!inSanctum(p))return {ok:false,reason:'Return to the arrival hall.'};
    if(p.char.initiationSeen!==true){p.char.initiationSeen=true;game.markDirty(p);}
    return {ok:true};
  }
  if(obj.type==='sanctum_fabricator') {
    if(workshopSite(p)!=='sanctum')return {ok:false,reason:'Approach the Precision Fabricator.'};
    p.outbox.push({e:'workshop_open'});return {ok:true};
  }
  if (obj.type === 'quartermaster' || obj.type === 'expedition_quartermaster') return openVendor(game,p,obj.id);
  if (obj.type === 'outpost_crew') {
    const lines = obj.key === 'outpost_surveyor'
      ? ['Three ways to the Gate: the Causeway under the old ring, the Severed Pass, or the Amber Flats. The sentinels keep to the causeway.', 'The crystals out east burn brighter after dark. Lovely to look at, and something always nests near them.', 'Drones hold the ceremonial approach. Come back here to patch up before you try the stairs.']
      : ['The mast keeps us talking to the Reach. If the beacon blinks twice, someone is on the way in.', 'Our quartermaster stocks restoratives. Carry more than you think you need.', 'Nothing hostile crosses the lamp line. Whatever it is, it does not like the light.'];
    game.message(p, 'info', obj.name + ': ' + lines[Math.floor(game.time / 7000) % lines.length]);
    return { ok: true };
  }
  // Existing server range/death checks apply; neutral Wardens never offer combat or inventory actions.
  if (obj.type === 'sanctum_guard') {
    game.message(p,'info','The Sanctum Warden watches the approach without speaking.');
    return {ok:true};
  }
  if(obj.type==='sinter_recovery')return recoverField(game,p,obj);
  if(obj.type==='resonant_vein')return startVeinHarvest(game,p,obj);
  if(['lumenfen_entry','lumenfen_return','lumenfen_spring','lumenfen_crown'].includes(obj.type))return travelLumenfen(game,p,obj);
   if(obj.type==='rift_return')return game.travelRift(p,obj);
  if(obj.type==='severance_gate'||obj.type==='severance_return')return travelSeverance(game,p,obj);
  if(obj.type==='foundry_return')return leaveFoundry(game,p,obj,gateFront);
  if(obj.type==='null_breach')return enterNullBreach(game,p,obj);
  if(obj.type==='foundry_cache')return claimFoundryCache(game,p,obj,{grantSalvage,inCombat});
  if(obj.type==='annex_cache'){
    if(!hasLineOfSight(p,obj)||inCombat(game,p)||p.autoOn)return {ok:false,reason:'Disengage and approach the recovery cache.'};
    if(p.char.annexProgress!==3)return {ok:false,reason:'Participate in an Annex encounter and defeat the Null Chamber Warden first.'};
    // Existing saves may have claimed the fragment cache before this blueprint
    // existed. Give them the one-time knowledge on revisit, never fragments.
    if(p.char.annexClaimed===true){
      const oldGoods=sanitizeGoods(p.char.goods);
      if(oldGoods.blueprint_relay_arc_carbine===1)return {ok:false,reason:'You have already recovered this expedition cache.'};
      oldGoods.blueprint_relay_arc_carbine=1;
      p.char.goods=oldGoods;game.economy?.observe('goods_granted',p,1,'blueprint_relay_arc_carbine');game.markDirty(p);
      game.message(p,'gain','Recovered: Relay Arc Carbine blueprint (previous expedition claim).');
      return {ok:true};
    }
    // The level 13-15 Null Annex (behind the Null Breach) yields a larger cache.
    const count=game.severance?6:3,words=count===6?'six':'three';
    // Claim one unique blueprint as expedition knowledge, not a random corpse
    // award. Both grants are validated first, then committed atomically.
    const materials=sanitizeMaterials(p.char.materials);
    if((materials.resonance_fragment||0)+count>MATERIAL_CAP)return {ok:false,reason:`Clear space for ${words} Resonance fragments.`};
    const goods=sanitizeGoods(p.char.goods);
    const newKnowledge=goods.blueprint_relay_arc_carbine!==1;
    materials.resonance_fragment=(materials.resonance_fragment||0)+count;
    if(newKnowledge)goods.blueprint_relay_arc_carbine=1;
    p.char.materials=materials;p.char.goods=goods;p.char.annexClaimed=true;
    game.economy?.observe('materials_granted',p,count,'resonance_fragment');
    if(newKnowledge)game.economy?.observe('goods_granted',p,1,'blueprint_relay_arc_carbine');
    game.markDirty(p);
    game.message(p,'gain',`Null Chamber recovery cache claimed: ${count} Resonance fragments${newKnowledge?' and Relay Arc Carbine blueprint':''}.`);
    return {ok:true};
  }
  if(['phase_scar','rift_indexer','rift_regulator'].includes(obj.type))return interactRift(game,p,obj,{grantSalvage});
  if (obj.type === 'obelisk') {
    if (p.char.attunements.includes('resonance')) {
      game.message(p, 'info', 'The stone hums in recognition. You are already attuned.');
      return { ok: true };
    }
    p.char.attunements.push('resonance');
    game.emitWorldEvent({ e: 'fx', k: 'attune', s: p.id, o: obj.id });
    p.outbox.push({ e: 'attune', a: 'resonance' });
    game.message(p, 'gain', `The stone answers. You gain Attunement: ${ATTUNEMENT_NAMES.resonance}.`);
    game.markDirty(p);
    checkDirective(game, p);
    return { ok: true };
  }
  if (obj.type.startsWith('brine_') || (obj.type.startsWith('survey_') && surveyState(p.char.survey)?.endsWith('_done'))) return operateBrine(game,p,obj);
  if (obj.type === 'deep_console') {
    if (!hasLineOfSight(p,obj)) return { ok: false, reason: 'Approach through the open laboratory entrance.' };
    if (containmentAlarm(game)) return {ok:false,reason:'Containment alarm active. Defeat or disengage the Custodian before using the recorder.'};
    if (inCombat(game,p)) return {ok:false,reason:'Disengage from combat before operating the recorder.'};
    traceRead(game,p,obj,'recorder',transmit);
    if (p.char.inventory.includes('phase_damper')) {
      transmitAuthored(game,p,'kestrel.implant.present');
      return { ok: true };
    }
    if (!p.char.attunements.includes('resonance') || !p.char.inventory.includes('sinter_laminate')) {
      transmitAuthored(game,p,'kestrel.log17');
      return { ok: true };
    }
    if (grantItem(game,p,'phase_damper')) {
      transmitAuthored(game,p,'kestrel.implant.unlocked');
      game.emitWorldEvent({e:'fx',k:'deep_record',s:p.id,o:obj.id});
    }
    return { ok: true };
  }
  if (obj.type === 'sinter_sampler') {
    // Alternative source of the existing unique item; no repeatable XP or new save state.
    if (p.char.inventory.includes('sinter_laminate')) {
      traceRead(game,p,obj,'strata',transmit);
      transmitAuthored(game,p,'sinter.sample.present');
      return { ok: true };
    }
    if (!p.char.attunements.includes('resonance')) {
      transmitAuthored(game,p,'sinter.maintenance');
      return { ok: true };
    }
    if (inCombat(game, p)) return { ok: false, reason: 'The interferometer cannot resolve a sample while you are in combat.' };
    let mode;
    if (p.cls === 'vanguard') {
      if (p.stats.glyph === 'glyph_resonant_aegis' && p.buffs.some(b => b.k === 'ward' && b.until > game.time)) mode = 'kinetic';
      else transmitAuthored(game,p,'sinter.instruction.vanguard');
    } else if (p.cls === 'symbiotech') {
      if (p.stats.glyph === 'glyph_shared_pulse' && p.companion?.mode === 'triage' && dist(p.companion, obj) <= 5 &&
          p.buffs.some(b => b.k === 'hot' && b.src === p.id && b.until > game.time)) mode = 'symbiotic';
      else transmitAuthored(game,p,'sinter.instruction.symbiotech');
    } else if (p.cls === 'surveyor') {
      const rig=p.surveyKit?.rig;
      if(p.stats.glyph==='glyph_faultline' && rig && rig.until>game.time && dist(rig,obj)<=4)mode='survey';
      else transmitAuthored(game,p,'sinter.instruction.surveyor');
    } else if (p.cls === 'keeper') {
      if(p.stats.glyph==='glyph_hinge' && p.buffs.some(b=>b.k==='shield'&&b.keeper&&b.src===p.id&&b.v>0&&b.until>game.time))mode='hinge';
      else transmitAuthored(game,p,'sinter.instruction.keeper');
    }
    if (!mode) return { ok: true };
    if (grantItem(game, p, 'sinter_laminate')) {
      game.emitWorldEvent({ e: 'fx', k: 'sinter_sample', s: p.id, o: obj.id, mode });
      transmitAuthored(game,p,'sinter.sample.recovered');
      traceRead(game,p,obj,'strata',transmit);
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
    game.message(p,'info',SURVEY[branch].field);
    game.message(p,'info','Return to Archivist Venn to report your findings.');
    const d=getRadioDialogue('brine.evidence.'+branch);
    p.outbox.push({e:'radio',source:d.source,m:d.transcript,dialogueId:d.id});
    game.markDirty(p);
    return { ok: true };
  }
  if (obj.type === 'archivist') {
    const current = surveyState(p.char.survey);
    if (current && !current.endsWith('_done')) {
      p.char.survey = current + '_done'; // mark complete before granting XP
      p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: SURVEY[current].report });
      game.message(p, 'gain', 'Evidence reported: ' + SURVEY[current].title + '. Return to Brineworks to commission the site.');
      const xp=grantXp(game, p, BRINE_REWARD_XP.investigation);
      recordFieldReceipt(p.char,'investigation',{xp});game.markDirty(p);
      return { ok: true };
    }
    if (p.cls === 'surveyor' && p.char.quest.step === 0) {
      p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: 'Do not waste a charge on a blind shot. Map the fault, bore into it, and rig the ground before you commit.' });
      return { ok: true };
    }
    if(traceTalk(game,p,obj,{grantSalvage,grantXp}))return {ok:true};
    const line = ARCHIVIST_LINES[Math.min(p.char.quest.step, ARCHIVIST_LINES.length - 1)];
    p.outbox.push({ e: 'say', id: obj.id, n: obj.name, m: line });
    return { ok: true };
  }
  return { ok: false, reason: 'Nothing happens.' };
}
