// Combat rules: damage, healing, threat, buffs and player abilities.
// Every outcome a client sees originates here.

import { levelDmgMul } from './enemy-levels.js';
import { ABILITIES, CLASSES, ENEMIES, GCD_MS, GLYPH, SURVEYOR, AUTO_REFERENCE_MS } from '../../shared/content.js';
import { dist, inSanctum, inSafeZone, resolveCollisions, hasLineOfSight, deepLineClear, sameTravelRegion } from '../../shared/world.js';
import { COMBAT_LINGER_MS } from './game.js';
import { onEnemyKilled, checkDirective } from './progress.js';
import { effectiveAuto, weaponReach } from '../../shared/condition.js';
import { publicWeaponVisual } from '../../shared/weapon-visual.js';
import { BLOOM_RELAY } from '../../shared/gadgets.js';
import { wearEquippedWeapon } from './condition.js';
import { tickMelee,mitigateMelee } from './melee.js';
import { companionCanSupport } from './party.js';

// --- buffs -----------------------------------------------------------------

export function getBuff(ent, key) {
  for (const b of ent.buffs) if (b.k === key) return b;
  return null;
}

/** Add or refresh a buff. One instance per key per entity. */
export function addBuff(ent, buff) {
  const i = ent.buffs.findIndex((b) => b.k === buff.k);
  if (i >= 0) ent.buffs[i] = buff;
  else ent.buffs.push(buff);
}

export function expireBuffs(game, ent) {
  if (ent.buffs.length === 0) return;
  ent.buffs = ent.buffs.filter((b) => b.until > game.time &&
    !(b.k === 'shield' && b.v <= 0) && (b.k !== 'bond' || activeBondSource(game, ent, b)));
}

function activeBondSource(game, recipient, bond) {
  const comp = game.ents.get(bond.src);
  return bond.until > game.time && comp?.kind === 'companion' && comp.mode === 'guard' &&
    comp.host === recipient.id && companionCanSupport(game, game.players.get(comp.owner), recipient)
    ? comp : null;
}

// --- threat ----------------------------------------------------------------

export function addThreat(enemy, playerId, amount) {
  if (enemy.state === 'dead' || enemy.state === 'evade') return;
  enemy.threat.set(playerId, (enemy.threat.get(playerId) || 0) + amount);
}

export function clearThreatFor(game, playerId) {
  for (const e of game.enemies) {
    e.threat.delete(playerId);
    if (e.fixate && e.fixate.id === playerId) e.fixate = null;
  }
}

/** The player responsible for an entity's actions (itself, or its owner). */
function actorPlayer(game, src) {
  if (!src) return null;
  if (src.kind === 'player') return src;
  if (src.kind === 'companion') return game.players.get(src.owner) || null;
  return null;
}

function gainCharge(p, amount) {
  const res = CLASSES[p.cls].resource;
  if (res.id !== 'charge') return;
  p.res = Math.min(res.max, p.res + amount * p.stats.chargeMul);
}

// --- damage / healing ------------------------------------------------------

/**
 * Apply damage from `src` to `dst`. `base` is the unmodified amount; all
 * modifiers (power, implants, debuffs, wards, shields) are applied here.
 * Returns the damage that actually landed on health.
 */
export function dealDamage(game, src, dst, base, ability, opts = {}) {
  if (!dst || dst.kind === 'object' || dst.kind === 'companion') return 0;
  if (dst.kind === 'enemy' && (dst.state === 'dead' || dst.state === 'evade')) return 0;
  if (dst.kind === 'player' && dst.dead) return 0;
  // Last line of defence for the safe zone, including late telegraphed AoE.
  // Threat cleanup alone is not a damage-authorisation boundary.
  if (dst.kind === 'player' && (inSafeZone(dst) || dst.gmInvulnerable === true)) return 0;
  if (src && (!sameTravelRegion(src, dst) || !deepLineClear(opts.origin || src,dst))) return 0;

  let amt = base;
  const actor = actorPlayer(game, src);
  if (actor && !opts.flat) amt *= actor.stats.power * actor.stats.dmgMul;
  if (src && src.kind === 'enemy') {
    if (src.elite?.dmg) amt *= src.elite.dmg;
    amt *= levelDmgMul(src);
    const sap = getBuff(src, 'sap');
    if (sap) amt *= sap.mul;
  }

  amt=mitigateMelee(game,src,dst,amt,opts);
  let absorbed = 0;
  if (dst.kind === 'enemy') {
    const cor = getBuff(dst, 'corrode');
    if (cor) amt *= cor.mul;
  } else {
    const ward = getBuff(dst, 'ward');
    if (ward) {
      const prevented = amt * ward.absorb;
      amt -= prevented;
      gainCharge(dst, prevented);
    }
    const bond = getBuff(dst, 'bond');
    const source = bond && activeBondSource(game, dst, bond);
    if (source) {
      amt *= 1 - bond.dr;
      if (bond.reflect && opts.melee && src && src.kind === 'enemy') {
        const landed = dealDamage(game, source, src, bond.reflect, 'carapace', { flat: true });
        if (landed > 0 && src.state !== 'dead' && src.state !== 'evade') {
          addBuff(src, { k: 'carapace_imprint', until: game.time + GLYPH.carapace.imprintMs, src: source.id });
          game.emitWorldEvent({ e: 'fx', k: 'carapace_imprint', s: src.id });
        }
      }
    }
    // Round incoming health damage once, before consuming finite barrier points.
    // A live barrier can absorb the entire hit, including sub-point modifiers.
    amt = Math.max(1, Math.round(amt));
    const shield = getBuff(dst, 'shield');
    if (shield && shield.until > game.time && shield.v > 0) {
      absorbed = Math.min(shield.v, amt);
      shield.v -= absorbed;
      amt -= absorbed;
      if (shield.v <= 0) dst.buffs = dst.buffs.filter(b=>b!==shield);
    }
  }

  amt = Math.round(amt);
  absorbed = Math.round(absorbed);
  if (amt < 1 && absorbed < 1) amt = 1;
  const beforeHp=dst.hp;
  dst.hp -= amt;
  if(dst.kind==='player' && dst.char.equipped.implant==='brine_rescue_lattice' && !dst.rescueSpent && beforeHp>dst.maxHp*.35 && dst.hp>0 && dst.hp<=dst.maxHp*.35){
    dst.rescueSpent=true;
    const old=getBuff(dst,'shield');
    if(!old||old.until<=game.time||old.v<20){addBuff(dst,{k:'shield',v:20,until:game.time+8000,src:dst.id});game.emitWorldEvent({e:'shield',s:dst.id,d:dst.id,a:20});}
    game.emitWorldEvent({e:'fx',k:'rescue_lattice',s:dst.id});
    game.message(dst,'info','Shelter Rescue Lattice: emergency barrier deployed. Rearms after combat.');
  }

  const ev = { e: 'dmg', s: src ? src.id : 0, d: dst.id, a: amt, ab: ability };
  if (absorbed > 0) ev.sh = absorbed;
  if (opts.kind) ev.k = opts.kind;
  // Only public, server-authored contact variants: the VFX engine and browser
  // tests must match the actual resolved strike, never infer a random arc.
  if(['melee_light','melee_heavy'].includes(ability) && ['1','2','3','heavy','counter'].includes(opts.variant))ev.mv=opts.variant;
  if(ability==='auto'&&opts.kind==='bolt'&&src?.kind==='player'){
    const visual=publicWeaponVisual(src.char);if(visual)ev.wv=visual;
  }
  game.emitWorldEvent(ev);

  if (dst.kind === 'enemy') {
    if (actor) {
      addThreat(dst, actor.id, Math.max(1, amt) * CLASSES[actor.cls].threatMul);
      actor.combatUntil = game.time + COMBAT_LINGER_MS;
      // A damaged grazer calls locally. Only the mature shieldback defends;
      // other unengaged herd members flee. No XP/loot/aggro on observation.
      if(dst.form && amt>0 && !actor.dead && !inSanctum(actor)){
        if(dst.callUntil<=game.time){
          dst.callUntil=game.time+4500;
          game.emitWorldEvent({e:'fx',k:'sinter_alarm',s:dst.id});
        }
        for(const o of game.enemies){
          if(o===dst||!o.form||o.state==='dead'||o.state==='evade'||dist(o,dst)>5.5||dist(o,actor)>8)continue;
          if(o.form==='shieldback'){
            if(!o.threat.has(actor.id)){
              addThreat(o,actor.id,1);
              game.emitWorldEvent({e:'fx',k:'sinter_guard',s:o.id});
            }
          }else if(o.threat.size===0){
            o.alarmUntil=game.time+4500;
            o.alarmFrom={x:actor.x,z:actor.z};
            o.alarmKind='player';
          }
        }
      }
    }
    // Allied outpost security owns its final blow. Even a player who tagged
    // the target earlier receives no XP, corpse rewards or quest credit.
    if (dst.hp <= 0) killEnemy(game, dst, src?.outpostDefender===true ? [] : undefined);
  } else {
    dst.combatUntil = game.time + COMBAT_LINGER_MS;
    gainCharge(dst, amt * 0.5);
    if (dst.hp <= 0) killPlayer(game, dst);
  }
  return amt;
}

/**
 * Heal `dst`. `healer` is the player whose power scales the heal (may be
 * null for environmental effects). Returns effective healing.
 */
export function applyHeal(game, healer, dst, base, ability, srcId) {
  if (!dst || dst.kind !== 'player' || dst.dead) return 0;
  const source = game.ents.get(srcId);
  if ((healer && !sameTravelRegion(healer, dst)) || (source && !sameTravelRegion(source, dst))) return 0;
  if (source?.kind === 'companion' && (source.owner !== healer?.id || !companionCanSupport(game, healer, dst))) return 0;
  let amt = base;
  if (healer) amt *= healer.stats.power * healer.stats.healMul;
  amt = Math.round(amt);
  const actual = Math.max(0, Math.min(amt, Math.ceil(dst.maxHp - dst.hp)));
  dst.hp = Math.min(dst.maxHp, dst.hp + amt);
  if (actual > 0) {
    game.emitWorldEvent({ e: 'heal', s: srcId || (healer ? healer.id : 0), d: dst.id, a: actual, ab: ability });
    // Hinge + Lattice Resonator and another profession's Shared Pulse:
    // real healing restores at most the original finite barrier capacity.
    const shield=getBuff(dst,'shield');
    if (ability==='shared_pulse' && healer?.stats.glyph==='glyph_shared_pulse' &&
        shield?.harmonic && shield.until>game.time && shield.v>0 && shield.v<shield.cap) {
      const gain=Math.min(shield.cap-shield.v,Math.ceil(actual*.5));
      shield.v+=gain;
      game.emitWorldEvent({e:'shield',s:healer.id,d:dst.id,a:gain});
      game.emitWorldEvent({e:'fx',k:'harmonic_restore',s:dst.id,r:1.4});
    }
    if (healer) {
      supportThreat(game, healer, dst, actual);
    }
  }
  return actual;
}

// Both restorative pathways generate threat proportional to actual support.
function supportThreat(game, healer, dst, actual) {
  const engaged = game.enemies.filter(e => e.state === 'combat' && e.threat.has(dst.id));
  for (const e of engaged) addThreat(e, healer.id, (actual * 0.5) / engaged.length);
  if (engaged.length) healer.combatUntil = game.time + COMBAT_LINGER_MS;
}

/** Shared Pulse may repair an active Aegis instead of applying splash healing.
 * Never recreate depleted fields, exceed the initial capacity or renew time.
 * A valid living glyph source is required; the originating field owns its cap.
 */
export function repairAegis(game, healer, dst, base, sourceId) {
  if (!companionCanSupport(game, healer, dst) || healer.stats.glyph !== 'glyph_shared_pulse' ||
      !healer.companion || healer.companion.id !== sourceId) return 0;
  const field = getBuff(dst, 'shield');
  if (!field || field.until <= game.time || !Number.isFinite(field.v) ||
      !Number.isFinite(field.cap) || field.v <= 0 || field.v >= field.cap) return 0;
  const origin = game.players.get(field.src);
  if (!origin || origin.dead || origin.stats.glyph !== 'glyph_resonant_aegis') return 0;
  const budget = Math.round(base * healer.stats.power * healer.stats.healMul);
  const amount = Math.min(budget, Math.floor(field.cap - field.v));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  field.v = Math.min(field.cap, field.v + amount);
  supportThreat(game, healer, dst, amount);
  game.emitWorldEvent({ e: 'shield', s: sourceId, d: dst.id, a: amount, k: 'relay' });
  return amount;
}

// GM-only preview transition. The WebSocket dispatcher must authorize the
// requesting account before invoking this. Ignore a stale/forged entity and
// preserve ordinary corpse/death rendering without XP, loot or quest credit.
export function gmDefeatEnemy(game, enemy) {
  if (!enemy || enemy.kind !== 'enemy' || game?.ents?.get(enemy.id) !== enemy ||
      enemy.state === 'dead' || enemy.state === 'evade') return false;
  killEnemy(game, enemy, []);
  return true;
}

function killEnemy(game, e, creditedIds = [...e.threat.keys()]) {
  e.hp = 0;
  e.state = 'dead';
  e.deadAt = game.time;
  e.respawnAt = game.time + ENEMIES[e.type].respawn;
  e.cast = null;
  e.target = 0;
  e.buffs = [];
  game.emitWorldEvent({ e: 'die', id: e.id });
  const credited = creditedIds;
  e.threat.clear();
  e.fixate = null;
  onEnemyKilled(game, e, credited);
}

function killPlayer(game, p) {
  p.hp = 0;
  p.dead = true;
  p.surveyKit = null;
  p.deadAt = game.time;
  p.buffs = [];
  p.autoOn = false;
  p.meleeState=null;
  p.jy = 0;
  p.vy = 0;
  clearThreatFor(game, p.id);
  game.emitWorldEvent({ e: 'die', id: p.id });
  game.message(p, 'info', 'You have been defeated.');
  wearEquippedWeapon(game,p);
}

/** Controlled Blast radius from the loadout (Faultline glyph, Strataweave set). */
export const blastRadiusFor = (p) => (p.stats.glyph === 'glyph_faultline' ? SURVEYOR.faultlineRadius : SURVEYOR.blastRadius) + (p.stats.blastRadius || 0);

// --- per-tick player upkeep --------------------------------------------------

export function tickPlayerCombat(game, p, dt) {
  if (p.dead) return;
  tickMelee(game,p,dealDamage,amount=>gainCharge(p,amount));
  const cdef = CLASSES[p.cls];
  const res = cdef.resource;
  const inCombat = game.time < p.combatUntil;
  if(!inCombat)p.rescueSpent=false;

  // Heal-over-time grafts.
  const hot = getBuff(p, 'hot');
  if (hot && game.time >= hot.next) {
    hot.next += 1000;
    const healer = game.players.get(hot.src) || null;
    // Power was captured when the graft was applied.
    const actual = Math.max(0, Math.min(hot.per, Math.ceil(p.maxHp - p.hp)));
    p.hp = Math.min(p.maxHp, p.hp + hot.per);
    if (actual > 0) game.emitWorldEvent({ e: 'heal', s: healer ? healer.id : 0, d: p.id, a: actual, ab: 'mending_graft' });
  }

  // Field Restorative (server/sim/utility.js): a fixed-size heal over time.
  const rest = getBuff(p, 'restorative');
  if (rest && game.time >= rest.next && rest.next <= rest.until && !p.dead) {
    rest.next += 1000;
    const actual = Math.max(0, Math.min(rest.per, Math.ceil(p.maxHp - p.hp)));
    p.hp = Math.min(p.maxHp, p.hp + rest.per);
    if (actual > 0) game.emitWorldEvent({ e: 'heal', s: p.id, d: p.id, a: actual, ab: 'field_restorative' });
  }

  if (p.cls === 'surveyor' && p.surveyKit) {
    const kit = p.surveyKit;
    if (kit.mark && (kit.mark.until <= game.time || !game.ents.get(kit.mark.id) || ['dead', 'evade'].includes(game.ents.get(kit.mark.id).state))) kit.mark = null;
    if (kit.rig && kit.rig.until <= game.time) kit.rig = null;
    if (kit.rig && dist(p, kit.rig) <= SURVEYOR.rechargeRadius) p.res = Math.min(res.max, p.res + SURVEYOR.rechargePerSecond * dt);
  }
  if (res.regen) p.res = Math.min(res.max, p.res + res.regen * dt);
  if (res.decay && !inCombat) p.res = Math.max(0, p.res - res.decay * dt);

  if (inSafeZone(p)) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.15 * dt);
    if (res.regen) p.res = Math.min(res.max, p.res + res.max * 0.2 * dt);
  } else if (!inCombat) {
    p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.03 * dt);
  }

  // Auto-attack: a weapon swing/bolt on a timer while engaged and in range.
  if (p.autoOn) {
    const t = game.ents.get(p.target);
    if (!t || t.kind !== 'enemy' || t.state === 'dead') {
      p.autoOn = false;
    } else if (t.state !== 'evade' && game.time >= p.nextAuto && dist(p, t) - t.radius <= weaponReach(p.char) && hasLineOfSight(p,t)) {
      // The active weapon defines the auto-attack (same for every class); an
      // empty slot uses the class's innate attack for the mode.
      const auto = effectiveAuto(p.char);
      p.nextAuto = game.time + auto.interval;
      // Charge per hit scales with the cadence (same per second).
      const pace = auto.interval / AUTO_REFERENCE_MS;
      dealDamage(game, p, t, auto.dmg, 'auto', { kind: auto.kind });
      gainCharge(p, 5 * pace);
    }
  }
}

// --- abilities -------------------------------------------------------------

const fail = (reason) => ({ ok: false, reason });

/**
 * Validate and execute an ability for player `p` against its current
 * server-side target. Nothing about the outcome is taken from the client.
 */
export function useAbility(game, p, abilityId) {
  const cdef = CLASSES[p.cls];
  if (typeof abilityId !== 'string' || !cdef.abilities.includes(abilityId)) return fail('You do not know that ability.');
  const ab = ABILITIES[abilityId];
  if (p.dead) return fail('You are defeated.');
  if (game.time < (p.cds[abilityId] || 0)) return fail('That ability is not ready.');
  if (!ab.offGcd && game.time < p.gcdUntil) return fail('Not ready yet.');
  if (ab.cost && p.res < ab.cost) return fail(`Not enough ${cdef.resource.name}.`);
  if (ab.minRes && p.res < ab.minRes) return fail(`Needs at least ${ab.minRes} ${cdef.resource.name}.`);

  let target = null;
  if (ab.type === 'hostile') {
    target = game.ents.get(p.target);
    if (!target || target.kind !== 'enemy' || target.state === 'dead') return fail('You need an enemy target.');
    if (target.state === 'evade') return fail('Your target is retreating.');
    if (dist(p, target) - target.radius > ab.range) return fail('Out of range.');
    if (!hasLineOfSight(p,target)) return fail('Line of sight blocked.');
    if (ab.root && (ENEMIES[target.type].elite || target.elite)) return fail(`${target.name} is too massive to root.`);
  } else if (ab.type === 'friendly') {
    const t = game.ents.get(p.target);
    target = t && t.kind === 'player' && !t.dead ? t : p;
    if (target !== p && dist(p, target) > ab.range) return fail('Out of range.');
  }
  if (abilityId === 'overgrowth_surge' && p.companion?.type !== 'mender') return fail('You have no symbiote.');

  if (p.cls === 'surveyor') {
    if (inSanctum(p)) return fail('Field instruments cannot operate in the Sanctum.');
    const kit = p.surveyKit;
    if (abilityId === 'core_bore' && (!kit?.mark || kit.mark.id !== target.id || kit.mark.until <= game.time)) return fail('Analyze this target with Fault Scan first.');
    if (abilityId === 'field_rig' && kit?.rig && kit.rig.until > game.time) return fail('Your field rig is already deployed.');
    if (abilityId === 'controlled_blast') {
      if (!kit?.rig || kit.rig.until <= game.time) return fail('Deploy a field rig first.');
      if (dist(p, kit.rig) > SURVEYOR.remoteRange) return fail('Field rig is out of remote range.');
    }
  }

  if (p.cls==='keeper') {
    if (abilityId==='hinge_field' && target!==p && !hasLineOfSight(p,target)) return fail('Line of sight blocked.');
    if (abilityId==='phase_transposition') {
      if (!p.char.attunements.includes('resonance')) return fail('Requires Resonance attunement.');
      if (target===p) return fail('Select another living ally.');
      if (!hasLineOfSight(p,target) || !deepLineClear(p,target)) return fail('Line of sight blocked.');
      const shield=getBuff(p,'shield'),old=getBuff(target,'shield');
      if (!shield || shield.src!==p.id || !shield.keeper || !Number.isFinite(shield.v) || !Number.isFinite(shield.cap) || !Number.isFinite(shield.until) || shield.v<=0 || shield.v>shield.cap || shield.until<=game.time) return fail('Project your own active barrier first.');
      if (old && old.until>game.time && old.v>0) return fail('That ally already has an active barrier.');
    }
    if (abilityId==='resonant_reversal') {
      const shield=getBuff(p,'shield');
      if (!shield || shield.src!==p.id || !shield.keeper || shield.v<=0 || shield.until<=game.time) return fail('Project your own active barrier first.');
    }
  }

  // Commit.
  p.cds[abilityId] = game.time + ab.cd;
  if (!ab.offGcd) p.gcdUntil = game.time + GCD_MS;
  if (ab.cost) p.res -= ab.cost;
  game.emitWorldEvent({ e: 'cast', s: p.id, d: target ? target.id : 0, ab: abilityId });

  const project=(ally,amount,dur)=>{
    const value=Math.round(amount*p.stats.power*(p.stats.barrierMul??1));
    const old=getBuff(ally,'shield');
    if (old && old.until>game.time && old.v>=value) return;
    addBuff(ally,{k:'shield',until:game.time+dur,v:value,cap:value,src:p.id,keeper:true,
      harmonic:p.stats.glyph==='glyph_hinge'&&p.char.equipped.implant==='keeper_resonator'});
    game.emitWorldEvent({e:'shield',s:p.id,d:ally.id,a:value});
  };
  switch (abilityId) {
    case 'phase_needle': {
      const hit=dealDamage(game,p,target,ab.dmg,abilityId,{kind:'bolt'});
      p.res=Math.min(cdef.resource.max,p.res+12);
      if (hit>0 && p.char.quest.step===0) {p.char.quest.progress++;game.markDirty(p);checkDirective(game,p);}
      p.autoOn=true;break;
    }
    case 'hinge_field':
      project(target,40,ab.dur);break;
    case 'resonant_reversal': {
      const shield=getBuff(p,'shield'),capacity=shield.v;
      if (p.stats.glyph==='glyph_reversal') shield.v=Math.floor(capacity*.25);
      else p.buffs=p.buffs.filter(b=>b!==shield);
      dealDamage(game,p,target,12+(capacity-shield.v*(p.stats.glyph==='glyph_reversal'?1:0))*.65,abilityId,{kind:'bolt'});
      p.autoOn=true;break;
    }
    case 'lattice_relay':
    {
      const radius=ab.radius+(p.stats.relayRadius||0);
      for(const ally of game.players.values())if(!ally.dead&&dist(p,ally)<=radius&&hasLineOfSight(p,ally))project(ally,24,ab.dur);
      game.emitWorldEvent({e:'fx',k:'lattice_relay',s:p.id,r:radius});break;
    }
    case 'phase_transposition': {
      const shield=getBuff(p,'shield');
      p.buffs=p.buffs.filter(b=>b!==shield);
      addBuff(target,{...shield});
      game.emitWorldEvent({e:'shield',s:p.id,d:target.id,a:shield.v});break;
    }
    case 'fault_scan': {
      p.surveyKit.mark = { id: target.id, until: game.time + (p.stats.glyph === 'glyph_wideband' ? SURVEYOR.extendedMarkMs : SURVEYOR.markMs) + (p.stats.scanMs || 0) };
      p.res = Math.min(cdef.resource.max, p.res + 30);
      break;
    }
    case 'core_bore': {
      p.surveyKit.mark = null;
      const hit = dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'bolt' });
      if (hit > 0 && p.char.quest.step === 0) {
        p.char.quest.progress += 1;
        game.markDirty(p);
        checkDirective(game, p);
      }
      p.autoOn = true;
      break;
    }
    case 'field_rig':
      p.surveyKit.rig = { x: p.x, z: p.z, until: game.time + SURVEYOR.rigMs };
      break;
    case 'controlled_blast': {
      const rig = p.surveyKit.rig;
      p.surveyKit.rig = null;
      const radius = blastRadiusFor(p);
      game.emitWorldEvent({ e: 'fx', k: 'survey_blast', s: p.id, x: rig.x, z: rig.z, r: radius });
      for (const enemy of game.enemies) {
        if (enemy.state !== 'dead' && enemy.state !== 'evade' && dist(rig, enemy) - enemy.radius <= radius && hasLineOfSight(rig,enemy)) dealDamage(game, p, enemy, ab.dmg, abilityId,{origin:rig});
      }
      break;
    }
    case 'rending_arc': {
      const echo = p.stats.glyph === 'glyph_rending_echo';
      const imprint = echo ? getBuff(target, 'carapace_imprint') : null;
      const redirected = !!(imprint && imprint.until > game.time && target.state !== 'evade');
      const center = redirected ? target : p;
      const others = echo
        ? game.enemies.filter((e) => e !== target && e.state !== 'dead' && e.state !== 'evade' && dist(center, e) - e.radius <= GLYPH.echo.radius && hasLineOfSight(center,e))
        : [];
      if (redirected) {
        target.buffs = target.buffs.filter(b => b !== imprint);
        game.emitWorldEvent({ e: 'fx', k: 'carapace_echo', s: p.id, d: target.id, x: target.x, z: target.z, r: GLYPH.echo.radius });
      }
      dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'melee' });
      for (const e of others) dealDamage(game, p, e, ab.dmg * GLYPH.echo.pct, 'rending_echo', { kind: 'melee',origin:center });
      gainCharge(p, ab.gain);
      p.autoOn = true;
      break;
    }
    case 'graviton_tether': {
      if (!ENEMIES[target.type].elite && !target.elite) {
        const d = dist(p, target);
        const want = ab.pullTo + target.radius;
        if (d > want) {
          const k = want / d;
          target.x = p.x + (target.x - p.x) * k;
          target.z = p.z + (target.z - p.z) * k;
          resolveCollisions(target, target.radius);
        }
      }
      dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'bolt' });
      if (target.state !== 'dead') {
        let top = 0;
        for (const v of target.threat.values()) top = Math.max(top, v);
        target.threat.set(p.id, Math.max(target.threat.get(p.id) || 0, top * 1.2 + 10));
        target.fixate = { id: p.id, until: game.time + ab.taunt };
      }
      gainCharge(p, ab.gain);
      p.autoOn = true;
      break;
    }
    case 'kinetic_ward':
      addBuff(p, { k: 'ward', until: game.time + ab.dur, absorb: ab.absorb });
      break;
    case 'discharge': {
      const charge = p.res;
      p.res = 0;
      const aegis = p.stats.glyph === 'glyph_resonant_aegis';
      const radius = ab.radius + p.stats.dischargeRadius;
      const dmg = (ab.base + charge * ab.perCharge) * (aegis ? GLYPH.aegis.dmgMul : 1);
      game.emitWorldEvent({ e: 'fx', k: aegis ? 'aegis' : 'discharge', s: p.id, r: radius });
      for (const e of [...game.enemies]) {
        if (e.state === 'dead' || e.state === 'evade') continue;
        if (dist(p, e) - e.radius <= radius && hasLineOfSight(p,e)) dealDamage(game, p, e, dmg, abilityId);
      }
      if (aegis) {
        const shield = Math.round(charge * GLYPH.aegis.shieldPct * p.stats.power * p.stats.shieldMul);
        for (const ally of game.players.values()) {
          if (ally.dead || dist(p, ally) > radius) continue;
          addBuff(ally, { k: 'shield', until: game.time + GLYPH.aegis.dur, v: shield, cap: shield, src: p.id });
          game.emitWorldEvent({ e: 'shield', s: p.id, d: ally.id, a: shield });
        }
      }
      break;
    }
    case 'neural_lash':
      dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'bolt' });
      if (target.state !== 'dead') addBuff(target, { k: 'sap', until: game.time + ab.sap.dur, mul: ab.sap.mul });
      p.autoOn = true;
      break;
    case 'mending_graft': {
      applyHeal(game, p, target, ab.heal, abilityId);
      const ticks = ab.hot.dur / 1000;
      const per = Math.round((ab.hot.total / ticks) * p.stats.power * p.stats.healMul);
      // Sustained Graft (Mycelial Accord, 4 pieces): extra ticks at the same amount
      const extra = Math.max(0, Math.floor(p.stats.graftTicks || 0)) * 1000;
      addBuff(target, { k: 'hot', until: game.time + ab.hot.dur + extra + 50, next: game.time + 1000, per, src: p.id });
      break;
    }
    case 'spore_snare':
      dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'bolt' });
      if (target.state !== 'dead') addBuff(target, { k: 'root', until: game.time + ab.root });
      p.autoOn = true;
      break;
    case 'overgrowth_surge': {
      const relayed = p.char.equipped.device === BLOOM_RELAY.device;
      const origin = relayed ? p : p.companion;
      const radius = relayed ? BLOOM_RELAY.radius : ab.radius;
      game.emitWorldEvent({ e: 'fx', k: 'surge', s: origin.id, r: radius });
      for (const ally of game.players.values()) {
        if (companionCanSupport(game, p, ally) && dist(origin, ally) <= radius) applyHeal(game, p, ally, ab.heal, abilityId, origin.id);
      }
      break;
    }
    default:
      break;
  }
  return { ok: true };
}

/** Engage auto-attack on the current hostile target; explicit disengage is handled by the network command. */
export function startAttack(game, p) {
  if (p.dead) return fail('You are defeated.');
  const t = game.ents.get(p.target);
  if (!t || t.kind !== 'enemy' || t.state === 'dead') return fail('You need an enemy target.');
  p.autoOn = true;
  return { ok: true };
}
