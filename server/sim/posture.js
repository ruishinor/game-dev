import { meleeBusy } from './melee.js';

// Sit / stand emote. Session-only presentation state owned by the server; the
// client sends the desired posture, never a pose. Any action that implies
// standing (moving, jumping, attacking, abilities, combat, switching weapons,
// following, crafting) stands the character up on the next tick.
const MOVE_EPSILON = 0.05;
const combat = (game, p) => game.time < (p.combatUntil || 0);

export function setPosture(game, p, sit) {
  if (typeof sit !== 'boolean') return { ok: false, reason: 'Unknown posture.' };
  if (!sit) { p.sitting = null; return { ok: true }; }
  if (p.dead) return { ok: false, reason: 'You are defeated.' };
  if (combat(game, p)) return { ok: false, reason: "You can't sit down in combat." };
  if (meleeBusy(game,p)) return { ok: false, reason: 'Finish your current melee action before sitting.' };
  if (p.jy > MOVE_EPSILON) return { ok: false, reason: 'Land before sitting down.' };
  if (p.inscription || p.production) return { ok: false, reason: 'Finish your current work first.' };
  if (p.followId) return { ok: false, reason: 'Stop following first.' };
  p.autoOn = false;
  p.sitting = { x: p.x, z: p.z };
  return { ok: true };
}

/** Stand up when the character does anything a seated character cannot. */
export function tickPosture(game, p) {
  const s = p.sitting;
  if (!s) return;
  if (p.dead || combat(game, p) || p.autoOn || p.jy > MOVE_EPSILON || p.followId || p.inscription || p.production ||
    Math.hypot(p.x - s.x, p.z - s.z) > MOVE_EPSILON) p.sitting = null;
}

export const isSitting = p => !!p.sitting;
