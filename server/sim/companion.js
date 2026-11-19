// Companion behaviour for the Symbiotech's Mender Symbiote.
// Three owner-selected modes with genuinely different tactical value:
//   triage — autonomously mends the most injured ally near its owner
//   guard  — bonds to one ally: regeneration + damage reduction
//   assist — harries the owner's target and makes it take more damage

import { CLASSES, COMPANIONS, GLYPH, ENEMIES, validCompanionName } from '../../shared/content.js';
import { STRIDER_LINK } from '../../shared/gadgets.js';
import { dist, hasLineOfSight } from '../../shared/world.js';
import { addBuff, applyHeal, dealDamage, repairAegis } from './combat.js';
import { syncSurveyStrider, wantsSurveyStrider, tickSurveyStrider } from './survey-strider.js';
import { companionCanSupport } from './party.js';

export function ownedCompanionType(char) {
  return CLASSES[char.cls].companion || (char.cls === 'surveyor' && (char.striderLearned===true || char.inventory.includes(STRIDER_LINK)) ? 'survey_strider' : null);
}

export function companionRoster(game, p) {
  const type = ownedCompanionType(p.char);
  if (!type) return [];
  const eligible = !p.dead && (type !== 'survey_strider' || wantsSurveyStrider(p));
  return [{
    type,
    name: p.char.petName && !(type === 'survey_strider' && p.char.petName === COMPANIONS.mender.name)
      ? p.char.petName : COMPANIONS[type].name,
    isDefault: (p.char.defaultCompanion || type) === type,
    active: p.companion?.type === type,
    available: eligible && game.time >= p.combatUntil,
    needsLink: false,
  }];
}

export function spawnMender(game, p) {
  if (p.dead || p.companion || p.char.companionDismissed || CLASSES[p.cls].companion !== 'mender') return;
  const def = COMPANIONS.mender;
  const mode = p.char.petMode !== 'guard' && Object.hasOwn(def.modes, p.char.petMode) ? p.char.petMode : 'triage';
  const c = {
    id: game.nextId++, kind: 'companion', type: 'mender', owner: p.id,
    name: p.char.petName || def.name, x: p.x + 1.5, z: p.z - 1.5, yaw: 0,
    mode, host: 0, act: 'idle', actTarget: 0, nextPulse: 0, nextRegen: 0, metaVer: 1,
  };
  p.companion = c;
  game.companions.push(c);
  game.ents.set(c.id, c);
}

export function manageCompanion(game, p, action, type) {
  const owned = ownedCompanionType(p.char);
  if (action === 'default') {
    if (!owned || owned !== type) return { ok: false, reason: 'That companion is unavailable.' };
    if (p.char.defaultCompanion !== owned) {
      p.char.defaultCompanion = owned;
      game.markDirty(p);
    }
    return { ok: true };
  }
  if (p.dead || game.time < p.combatUntil) return { ok: false, reason: 'Manage active companions outside combat while alive.' };
  if (action === 'dismiss') {
    const c = p.companion;
    if (!c) return { ok: false, reason: 'You have no active companion.' };
    if (c.mode === 'guard') release(game, c, p);
    if (p.surveyKit?.mark?.source === c.id) p.surveyKit.mark = null;
    p.char.companionDismissed = true;
    game.ents.delete(c.id);
    game.companions = game.companions.filter(active => active !== c);
    p.companion = null;
    game.markDirty(p);
    return { ok: true };
  }
  if (action !== 'summon') return { ok: false, reason: 'Unknown companion action.' };
  if (p.companion) return { ok: false, reason: 'A companion is already active.' };
  if (!owned || (p.char.defaultCompanion && p.char.defaultCompanion !== owned)) return { ok: false, reason: 'Choose an acquired companion first.' };
  if (owned === 'survey_strider' && !wantsSurveyStrider(p)) return { ok: false, reason: 'Learn Survey Strider deployment at a commissioned workshop first.' };
  p.char.companionDismissed = false;
  if (owned === 'mender') spawnMender(game, p);
  else syncSurveyStrider(game, p);
  if (!p.companion) {
    p.char.companionDismissed = true;
    return { ok: false, reason: 'Move to open ground and try summoning again.' };
  }
  game.markDirty(p);
  return { ok: true };
}

function flyToward(c, tx, tz, step) {
  const dx = tx - c.x;
  const dz = tz - c.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return;
  const s = Math.min(step, d);
  c.x += (dx / d) * s;
  c.z += (dz / d) * s;
  if (d > 0.3) c.yaw = Math.atan2(dx, dz);
}

/** Hover at a point `gap` metres from `ent`, approaching from our side. */
function hoverNear(c, ent, gap, step) {
  const dx = c.x - ent.x;
  const dz = c.z - ent.z;
  const d = Math.hypot(dx, dz) || 1;
  flyToward(c, ent.x + (dx / d) * gap, ent.z + (dz / d) * gap, step);
}

function followOwner(c, owner, def, step) {
  // Trail behind the owner's right shoulder.
  const bx = owner.x - Math.sin(owner.yaw) * 1.6 - Math.cos(owner.yaw) * def.followDist * 0.7;
  const bz = owner.z - Math.cos(owner.yaw) * 1.6 + Math.sin(owner.yaw) * def.followDist * 0.7;
  if (Math.hypot(bx - c.x, bz - c.z) > 0.4) flyToward(c, bx, bz, step);
}

function release(game, c, owner, reason) {
  const previous = game.players.get(c.host);
  if (previous) previous.buffs = previous.buffs.filter(b => b.k !== 'bond' || b.src !== c.id);
  c.mode = 'triage';
  c.host = 0;
  c.act = 'idle';
  c.actTarget = 0;
  if (owner && reason) game.message(owner, 'info', reason);
}

export function tickCompanion(game, c, dt) {
  if(c.type==='survey_strider')return tickSurveyStrider(game,c,dt);
  const def = COMPANIONS[c.type];
  const owner = game.players.get(c.owner);
  if (!owner) return;
  const step = def.speed * dt;

  if (dist(c, owner) > def.leash && c.mode !== 'guard') {
    if (c.mode === 'stay') {
      c.mode = 'follow';
      owner.char.petMode = 'follow';
      game.onCharChanged(owner.char);
      game.message(owner, 'info', 'Your symbiote returns: its tether limit was reached.');
    }
    c.x = owner.x + 1.2;
    c.z = owner.z - 1.2;
  }

  if (owner.dead) {
    if (c.mode === 'guard') release(game, c, null, null);
    c.act = 'dormant';
    c.actTarget = 0;
    hoverNear(c, owner, 1.2, step);
    return;
  }

  if (c.mode === 'guard') {
    const host = game.players.get(c.host);
    if (!host || host.dead) {
      release(game, c, owner, 'Your symbiote releases its bond: the host is gone.');
      return;
    }
    if (!companionCanSupport(game, owner, host)) {
      release(game, c, owner, 'Your symbiote releases its bond: the host left your party.');
      return;
    }
    if (dist(host, owner) > def.guard.range) {
      release(game, c, owner, 'Your symbiote releases its bond: the host is too far away.');
      return;
    }
    c.actTarget = host.id;
    if (dist(c, host) > 1.2) {
      c.act = 'bonding';
      flyToward(c, host.x, host.z, step * 1.4);
      c.nextRegen = game.time + 1000;
      return;
    }
    c.x = host.x;
    c.z = host.z;
    c.yaw = host.yaw;
    c.act = 'bonded';
    const carapace = owner.stats.glyph === 'glyph_carapace';
    addBuff(host, {
      k: 'bond',
      until: game.time + 300,
      src: c.id,
      dr: carapace ? GLYPH.carapace.dr : def.guard.dr,
      reflect: carapace ? GLYPH.carapace.reflect : 0,
    });
    if (!carapace && game.time >= c.nextRegen) {
      c.nextRegen = game.time + 1000;
      applyHeal(game, owner, host, def.guard.regen, 'bond', c.id);
    }
    return;
  }

  if (c.mode === 'stay') {
    c.act = 'idle';
    c.actTarget = 0;
    return;
  }

  if (c.mode === 'follow') {
    c.act = 'idle';
    c.actTarget = 0;
    followOwner(c, owner, def, step);
    return;
  }

  if (c.mode === 'assist') {
    const t = game.ents.get(owner.target);
    if (!t || t.kind !== 'enemy' || t.state === 'dead' || t.state === 'evade' || (ENEMIES[t.type].neutral && !t.threat.has(owner.id)) || dist(t, owner) > def.leash) {
      c.act = 'idle';
      c.actTarget = 0;
      followOwner(c, owner, def, step);
      return;
    }
    c.actTarget = t.id;
    c.act = 'harrying';
    const d = dist(c, t) - t.radius;
    if (d > def.assist.range * 0.6 || !hasLineOfSight(c,t)) hoverNear(c, t, t.radius + def.assist.range * 0.5, step);
    c.yaw = Math.atan2(t.x - c.x, t.z - c.z);
    if (d <= def.assist.range && game.time >= c.nextPulse && hasLineOfSight(c,t)) {
      c.nextPulse = game.time + def.assist.interval;
      dealDamage(game, c, t, def.assist.dmg, 'sting', { kind: 'bolt' });
      if (t.state !== 'dead') addBuff(t, { k: 'corrode', until: game.time + def.assist.corrode.dur, mul: def.assist.corrode.mul });
    }
    return;
  }

  // Triage: find the most injured ally near the owner.
  let patient = null;
  let worst = def.triage.threshold;
  for (const p of game.players.values()) {
    if (!companionCanSupport(game, owner, p) || dist(p, owner) > def.triage.seek) continue;
    const ratio = p.hp / p.maxHp;
    if (ratio < worst) {
      worst = ratio;
      patient = p;
    }
  }
  if (!patient) {
    c.act = 'idle';
    c.actTarget = 0;
    followOwner(c, owner, def, step);
    return;
  }
  c.actTarget = patient.id;
  c.act = 'mending';
  const d = dist(c, patient);
  if (d > def.triage.range * 0.45) hoverNear(c, patient, 2.2, step);
  c.yaw = Math.atan2(patient.x - c.x, patient.z - c.z);
  if (d <= def.triage.range && game.time >= c.nextPulse) {
    c.nextPulse = game.time + def.triage.interval;
    applyHeal(game, owner, patient, def.triage.heal, 'triage', c.id);
    game.events.push({ e: 'beam', s: c.id, d: patient.id });
    if (owner.stats.glyph === 'glyph_shared_pulse') {
      for (const p of game.players.values()) {
        if (p === patient || !companionCanSupport(game, owner, p) || dist(p, patient) > GLYPH.sharedPulse.radius) continue;
        const budget = def.triage.heal * GLYPH.sharedPulse.pct;
        const repaired = repairAegis(game, owner, p, budget, c.id);
        if (repaired > 0) {
          game.events.push({ e: 'beam', k: 'aegis_relay', s: patient.id, d: p.id });
        } else {
          const healed = applyHeal(game, owner, p, budget, 'shared_pulse', c.id);
          if (healed > 0) game.events.push({ e: 'beam', s: patient.id, d: p.id });
        }
      }
    }
  }
}

/**
 * Change the companion's mode at its owner's request. `guard` bonds to the
 * owner's friendly target when valid, otherwise to the owner.
 */
/** Rename only the owner's companion. Metadata propagates to every client. */
export function renameCompanion(game, p, name) {
  if (!p.companion) return { ok: false, reason: 'You have no companion.' };
  if (!validCompanionName(name)) return { ok: false, reason: 'Companion names must be 3–18 letters with internal spaces or hyphens.' };
  if (p.dead || game.time < p.combatUntil) return { ok: false, reason: 'Rename your companion outside combat.' };
  if (p.companion.name === name) return { ok: true };
  p.companion.name = name;
  p.companion.metaVer += 1;
  p.char.petName = name;
  game.markDirty(p);
  return { ok: true };
}

export function petCommand(game, p, cmd) {
  const c = p.companion;
  if (!c) return { ok: false, reason: 'You have no companion.' };
  const def = COMPANIONS[c.type];
  if (typeof cmd !== 'string' || !Object.hasOwn(def.modes, cmd)) return { ok: false, reason: 'Unknown command.' };
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  let host = 0;
  if (cmd === 'guard') {
    const t = game.ents.get(p.target);
    const target = t && t.kind === 'player' && !t.dead ? t : p;
    if (!companionCanSupport(game, p, target)) return { ok: false, reason: 'Bond requires you or an eligible party member.' };
    if (dist(target, p) > def.guard.range) return { ok: false, reason: 'That ally is too far away to bond with.' };
    host = target.id;
  }
  if (c.mode === 'guard' && (cmd !== 'guard' || c.host !== host)) release(game, c, null, null);
  c.mode = cmd;
  c.host = host;
  c.act = cmd === 'guard' ? 'bonding' : 'idle';
  c.actTarget = host;
  c.nextPulse = Math.max(c.nextPulse, game.time + 400);
  if(c.type==='survey_strider')c.nav={};
  p.char.petMode = cmd;
  game.onCharChanged(p.char);
  return { ok: true };
}
