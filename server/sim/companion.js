// Companion behaviour for the Symbiotech's Mender Symbiote.
// Three owner-selected modes with genuinely different tactical value:
//   triage — autonomously mends the most injured ally near its owner
//   guard  — bonds to one ally: regeneration + damage reduction
//   assist — harries the owner's target and makes it take more damage

import { COMPANIONS, GLYPH, ENEMIES } from '../../shared/content.js';
import { dist } from '../../shared/world.js';
import { addBuff, applyHeal, dealDamage } from './combat.js';

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
  c.mode = 'triage';
  c.host = 0;
  c.act = 'idle';
  c.actTarget = 0;
  if (owner && reason) game.message(owner, 'info', reason);
}

export function tickCompanion(game, c, dt) {
  const def = COMPANIONS[c.type];
  const owner = game.players.get(c.owner);
  if (!owner) return;
  const step = def.speed * dt;

  if (dist(c, owner) > def.leash && c.mode !== 'guard') {
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
    if (d > def.assist.range * 0.6) hoverNear(c, t, t.radius + def.assist.range * 0.5, step);
    c.yaw = Math.atan2(t.x - c.x, t.z - c.z);
    if (d <= def.assist.range && game.time >= c.nextPulse) {
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
    if (p.dead || dist(p, owner) > def.triage.seek) continue;
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
        if (p === patient || p.dead || dist(p, patient) > GLYPH.sharedPulse.radius) continue;
        const healed = applyHeal(game, owner, p, def.triage.heal * GLYPH.sharedPulse.pct, 'shared_pulse', c.id);
        if (healed > 0) game.events.push({ e: 'beam', s: patient.id, d: p.id });
      }
    }
  }
}

/**
 * Change the companion's mode at its owner's request. `guard` bonds to the
 * owner's friendly target when valid, otherwise to the owner.
 */
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
    if (dist(target, p) > def.guard.range) return { ok: false, reason: 'That ally is too far away to bond with.' };
    host = target.id;
  }
  c.mode = cmd;
  c.host = host;
  c.act = cmd === 'guard' ? 'bonding' : 'idle';
  c.actTarget = host;
  c.nextPulse = Math.max(c.nextPulse, game.time + 400);
  p.char.petMode = cmd;
  game.onCharChanged(p.char);
  return { ok: true };
}
