import { COMPANIONS, ITEMS } from '../../shared/content.js';
import { conditionOf } from '../../shared/condition.js';
import { dist } from '../../shared/world.js';
import { SPINDLE_TUNING } from '../../shared/spindle.js';
import { advanceGroundCompanion, groundSegmentClear } from './ground-navigation.js';

// Gameplay dimensions, in metres. The swept circle includes the stowed tool.
const { radius: RADIUS, followSpeed: SPEED, inspectSpeed: INSPECT_SPEED } = SPINDLE_TUNING;
const FOLLOW_GAP = 2.4, STAY_LEASH = 24;
// The owner has not been scaled. Keep a small clearance allowance around their feet.
const INSPECT_GAP = .85, INSPECT_MIN = .7, INSPECT_REACH = .95, INSPECT_MS = 1800;
const CALIPER_OFFSET = .41 * SPINDLE_TUNING.scale;
const TURN_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4].map(n => n * Math.PI / 4);

function servicePoint(game, owner, angle, gap) {
  for (const offset of TURN_OFFSETS) {
    const point = { x: owner.x + Math.sin(angle + offset) * gap, z: owner.z + Math.cos(angle + offset) * gap };
    if (game.companions.some(c => c.owner !== owner.id && c.type !== 'mender' && dist(point, c) < 1.65)) continue;
    if (groundSegmentClear(point, point, RADIUS) && groundSegmentClear(owner, point, .15)) return point;
  }
  return null;
}

export function spindleSpawnPoint(game, owner) {
  return servicePoint(game, owner, owner.yaw + Math.PI - .3, FOLLOW_GAP);
}

export function spawnSpindle(game, p, spot) {
  const profile = p.char.spindle;
  if (!profile || !spot || p.dead || p.companion || p.char.companionDismissed) return;
  const c = {
    id: game.nextId++, kind: 'companion', type: 'spindle', name: profile.name, owner: p.id,
    ...spot, yaw: p.yaw, mode: profile.mode, act: 'idle', actTarget: 0, host: 0, metaVer: 1,
    nav: {}, serviceEnd: 0, approachEnd: 0,
  };
  p.companion = c;
  game.companions.push(c);
  game.ents.set(c.id, c);
  game.markDirty(p);
}

function finishInspection(c, p) {
  c.mode = 'follow';
  p.char.spindle.mode = 'follow';
  c.serviceEnd = 0;
  c.act = 'idle';
  c.actTarget = 0;
  c.nav = {};
}

// Only the authenticated owner's loadout enters this read-only diagnostic.
// The ordinary character message channel keeps its result private.
function conditionReport(char) {
  const id = char.equipped.weapon;
  const condition = conditionOf(char, id);
  if (condition === null) return 'No serviceable weapon fitted. Equip a pulse emitter to gauge its condition.';
  const item = ITEMS[id];
  const service = condition === 100 ? 'No maintenance needed.' : 'The Sanctum quartermaster can restore it. A Field Maintenance Kit can restore up to 25 points.';
  return item.name + ' at ' + condition + '% condition. ' + service;
}

export function commandSpindle(game, p, c, cmd) {
  if (cmd === 'inspect') {
    if (game.time < p.combatUntil) return { ok: false, reason: 'Inspect your equipment outside combat.' };
    if (c.mode === 'inspect') return { ok: true };
    if (dist(c, p) > STAY_LEASH) return { ok: false, reason: 'Move closer to your Spindle to request an inspection.' };
    c.approachEnd = game.time + 12000;
  }
  c.mode = cmd;
  c.act = cmd === 'inspect' ? 'approaching' : 'idle';
  c.actTarget = cmd === 'inspect' ? p.id : 0;
  c.serviceEnd = 0;
  c.nav = {};
  // An unfinished one-shot inspection is never restored across sessions.
  p.char.spindle.mode = cmd === 'stay' ? 'stay' : 'follow';
  game.onCharChanged(p.char);
  return { ok: true };
}

export function tickSpindle(game, c, dt) {
  const p = game.players.get(c.owner);
  if (!p || p.companion !== c) return;
  if (p.dead || (c.mode === 'inspect' && game.time < p.combatUntil)) {
    if (c.mode === 'inspect') {
      finishInspection(c, p);
      game.message(p, 'info', c.name + ' stopped its equipment inspection.');
    }
    if (p.dead) { c.act = 'dormant'; c.actTarget = 0; return; }
  }
  const gap = dist(c, p);
  if (c.mode === 'stay' && gap > STAY_LEASH) commandSpindle(game, p, c, 'follow');
  if (c.mode === 'inspect' && (gap > STAY_LEASH || game.time >= c.approachEnd)) {
    finishInspection(c, p);
    game.message(p, 'info', c.name + ' could not finish the inspection. Stand on clear ground and try again.');
  }
  c.actTarget = 0;
  c.act = 'idle';
  if (c.mode === 'stay') return;
  const advance = (goal, maxSpeed = SPEED) => {
    if (goal && dist(c, goal) > .04) {
      // Ease into the final metre instead of rushing every small reposition.
      const speed = Math.min(maxSpeed, 3 + 4.5 * dist(c, goal));
      return advanceGroundCompanion(c, c.nav, goal, { now: game.time, dt, speed, radius: RADIUS });
    }
    return 0;
  };
  if (c.mode === 'inspect') {
    c.actTarget = p.id;
    if (gap < INSPECT_MIN || gap > INSPECT_REACH || p.jy > .35 || !groundSegmentClear(c, p, .15)) {
      c.act = 'approaching';
      c.serviceEnd = 0;
      advance(servicePoint(game, p, Math.atan2(c.x - p.x, c.z - p.z), INSPECT_GAP), INSPECT_SPEED);
      return;
    }
    c.act = 'inspecting';
    c.yaw = Math.atan2(p.x - c.x, p.z - c.z) - Math.asin(CALIPER_OFFSET / gap);
    if (!c.serviceEnd) c.serviceEnd = game.time + INSPECT_MS;
    if (game.time >= c.serviceEnd) {
      game.message(p, 'info', c.name + ' inspection: ' + conditionReport(p.char));
      finishInspection(c, p);
    }
    return;
  }
  // Hold if the owner has left the local navigator's range. Returning or
  // explicitly redeploying recovers the unit without crossing blocked terrain.
  if (gap > 32) { c.act = 'stranded'; return; }
  const goal = spindleSpawnPoint(game, p);
  if (goal && dist(c, goal) > .4) advance(goal);
}

export function newSpindleProfile() {
  return { commissioned: true, name: COMPANIONS.spindle.name, mode: 'follow' };
}
