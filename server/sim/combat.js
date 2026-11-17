// Combat rules: damage, healing, threat, buffs and player abilities.
// Every outcome a client sees originates here.

import { ABILITIES, CLASSES, ENEMIES, GCD_MS, GLYPH, SURVEYOR } from '../../shared/content.js';
import { dist, inSanctum, resolveCollisions } from '../../shared/world.js';
import { COMBAT_LINGER_MS } from './game.js';
import { onEnemyKilled, checkDirective } from './progress.js';

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
  ent.buffs = ent.buffs.filter((b) => b.until > game.time && !(b.k === 'shield' && b.v <= 0));
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
  if (dst.kind === 'player' && inSanctum(dst)) return 0;

  let amt = base;
  const actor = actorPlayer(game, src);
  if (actor && !opts.flat) amt *= actor.stats.power * actor.stats.dmgMul;
  if (src && src.kind === 'enemy') {
    const sap = getBuff(src, 'sap');
    if (sap) amt *= sap.mul;
  }

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
    if (bond) {
      amt *= 1 - bond.dr;
      if (bond.reflect && opts.melee && src && src.kind === 'enemy') {
        const comp = game.ents.get(bond.src);
        if (comp) dealDamage(game, comp, src, bond.reflect, 'carapace', { flat: true });
      }
    }
    const shield = getBuff(dst, 'shield');
    if (shield && shield.v > 0) {
      absorbed = Math.min(shield.v, amt);
      shield.v -= absorbed;
      amt -= absorbed;
    }
  }

  amt = Math.round(amt);
  absorbed = Math.round(absorbed);
  if (amt < 1 && absorbed < 1) amt = 1;
  dst.hp -= amt;

  const ev = { e: 'dmg', s: src ? src.id : 0, d: dst.id, a: amt, ab: ability };
  if (absorbed > 0) ev.sh = absorbed;
  if (opts.kind) ev.k = opts.kind;
  game.events.push(ev);

  if (dst.kind === 'enemy') {
    if (actor) {
      addThreat(dst, actor.id, Math.max(1, amt) * CLASSES[actor.cls].threatMul);
      actor.combatUntil = game.time + COMBAT_LINGER_MS;
    }
    if (dst.hp <= 0) killEnemy(game, dst);
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
  let amt = base;
  if (healer) amt *= healer.stats.power * healer.stats.healMul;
  amt = Math.round(amt);
  const actual = Math.max(0, Math.min(amt, Math.ceil(dst.maxHp - dst.hp)));
  dst.hp = Math.min(dst.maxHp, dst.hp + amt);
  if (actual > 0) {
    game.events.push({ e: 'heal', s: srcId || (healer ? healer.id : 0), d: dst.id, a: actual, ab: ability });
    if (healer) {
      // Healing draws the attention of everything fighting the patient.
      const engaged = game.enemies.filter((e) => e.state === 'combat' && e.threat.has(dst.id));
      for (const e of engaged) addThreat(e, healer.id, (actual * 0.5) / engaged.length);
      if (engaged.length) healer.combatUntil = game.time + COMBAT_LINGER_MS;
    }
  }
  return actual;
}

function killEnemy(game, e) {
  e.hp = 0;
  e.state = 'dead';
  e.deadAt = game.time;
  e.respawnAt = game.time + ENEMIES[e.type].respawn;
  e.cast = null;
  e.target = 0;
  e.buffs = [];
  game.events.push({ e: 'die', id: e.id });
  const credited = [...e.threat.keys()];
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
  p.jy = 0;
  p.vy = 0;
  clearThreatFor(game, p.id);
  game.events.push({ e: 'die', id: p.id });
  game.message(p, 'info', 'You have been defeated.');
}

// --- per-tick player upkeep --------------------------------------------------

export function tickPlayerCombat(game, p, dt) {
  if (p.dead) return;
  const cdef = CLASSES[p.cls];
  const res = cdef.resource;
  const inCombat = game.time < p.combatUntil;

  // Heal-over-time grafts.
  const hot = getBuff(p, 'hot');
  if (hot && game.time >= hot.next) {
    hot.next += 1000;
    const healer = game.players.get(hot.src) || null;
    // Power was captured when the graft was applied.
    const actual = Math.max(0, Math.min(hot.per, Math.ceil(p.maxHp - p.hp)));
    p.hp = Math.min(p.maxHp, p.hp + hot.per);
    if (actual > 0) game.events.push({ e: 'heal', s: healer ? healer.id : 0, d: p.id, a: actual, ab: 'mending_graft' });
  }

  if (p.cls === 'surveyor' && p.surveyKit) {
    const kit = p.surveyKit;
    if (kit.mark && (kit.mark.until <= game.time || !game.ents.get(kit.mark.id) || ['dead', 'evade'].includes(game.ents.get(kit.mark.id).state))) kit.mark = null;
    if (kit.rig && kit.rig.until <= game.time) kit.rig = null;
    if (kit.rig && dist(p, kit.rig) <= SURVEYOR.rechargeRadius) p.res = Math.min(res.max, p.res + SURVEYOR.rechargePerSecond * dt);
  }
  if (res.regen) p.res = Math.min(res.max, p.res + res.regen * dt);
  if (res.decay && !inCombat) p.res = Math.max(0, p.res - res.decay * dt);

  if (inSanctum(p)) {
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
    } else if (t.state !== 'evade' && game.time >= p.nextAuto && dist(p, t) - t.radius <= cdef.auto.range) {
      p.nextAuto = game.time + cdef.auto.interval;
      dealDamage(game, p, t, cdef.auto.dmg, 'auto', { kind: cdef.auto.kind });
      gainCharge(p, 5);
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
    if (ab.root && ENEMIES[target.type].elite) return fail(`${target.name} is too massive to root.`);
  } else if (ab.type === 'friendly') {
    const t = game.ents.get(p.target);
    target = t && t.kind === 'player' && !t.dead ? t : p;
    if (target !== p && dist(p, target) > ab.range) return fail('Out of range.');
  }
  if (abilityId === 'overgrowth_surge' && !p.companion) return fail('You have no symbiote.');

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

  // Commit.
  p.cds[abilityId] = game.time + ab.cd;
  if (!ab.offGcd) p.gcdUntil = game.time + GCD_MS;
  if (ab.cost) p.res -= ab.cost;
  game.events.push({ e: 'cast', s: p.id, d: target ? target.id : 0, ab: abilityId });

  switch (abilityId) {
    case 'fault_scan': {
      p.surveyKit.mark = { id: target.id, until: game.time + (p.stats.glyph === 'glyph_wideband' ? SURVEYOR.extendedMarkMs : SURVEYOR.markMs) };
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
      const radius = p.stats.glyph === 'glyph_faultline' ? SURVEYOR.faultlineRadius : SURVEYOR.blastRadius;
      game.events.push({ e: 'fx', k: 'survey_blast', s: p.id, x: rig.x, z: rig.z, r: radius });
      for (const enemy of game.enemies) {
        if (enemy.state !== 'dead' && enemy.state !== 'evade' && dist(rig, enemy) - enemy.radius <= radius) dealDamage(game, p, enemy, ab.dmg, abilityId);
      }
      break;
    }
    case 'rending_arc': {
      const echo = p.stats.glyph === 'glyph_rending_echo';
      const others = echo
        ? game.enemies.filter((e) => e !== target && e.state !== 'dead' && e.state !== 'evade' && dist(p, e) - e.radius <= GLYPH.echo.radius)
        : [];
      dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'melee' });
      for (const e of others) dealDamage(game, p, e, ab.dmg * GLYPH.echo.pct, 'rending_echo', { kind: 'melee' });
      gainCharge(p, ab.gain);
      p.autoOn = true;
      break;
    }
    case 'graviton_tether': {
      if (!ENEMIES[target.type].elite) {
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
      game.events.push({ e: 'fx', k: aegis ? 'aegis' : 'discharge', s: p.id, r: radius });
      for (const e of [...game.enemies]) {
        if (e.state === 'dead' || e.state === 'evade') continue;
        if (dist(p, e) - e.radius <= radius) dealDamage(game, p, e, dmg, abilityId);
      }
      if (aegis) {
        const shield = Math.round(charge * GLYPH.aegis.shieldPct * p.stats.power);
        for (const ally of game.players.values()) {
          if (ally.dead || dist(p, ally) > radius) continue;
          addBuff(ally, { k: 'shield', until: game.time + GLYPH.aegis.dur, v: shield, src: p.id });
          game.events.push({ e: 'shield', s: p.id, d: ally.id, a: shield });
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
      addBuff(target, { k: 'hot', until: game.time + ab.hot.dur + 50, next: game.time + 1000, per, src: p.id });
      break;
    }
    case 'spore_snare':
      dealDamage(game, p, target, ab.dmg, abilityId, { kind: 'bolt' });
      if (target.state !== 'dead') addBuff(target, { k: 'root', until: game.time + ab.root });
      p.autoOn = true;
      break;
    case 'overgrowth_surge': {
      const c = p.companion;
      game.events.push({ e: 'fx', k: 'surge', s: c.id, r: ab.radius });
      for (const ally of game.players.values()) {
        if (!ally.dead && dist(c, ally) <= ab.radius) applyHeal(game, p, ally, ab.heal, abilityId, c.id);
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
