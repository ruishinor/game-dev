// Server-owned, deliberately non-rewarding weapon calibration at the Expanse outpost.
// The client only requests an interaction with a real world object; it never
// supplies hits, scores, session state, items, or shot results.
import { inExpeditionOutpost, EXPEDITION_OUTPOST as OP, OUTPOST_TRAINING as R } from '../../shared/severance-gate.js';
import { activeWeaponSlot } from '../../shared/weapons.js';
import { COLLIDERS, hasLineOfSight, sameTravelRegion } from '../../shared/world.js';

export const RANGE_SHOTS = 5;
export const RANGE_COOLDOWN_MS = 650;
const fail = (reason) => ({ ok: false, reason });
// The cabinet is itself a collision obstacle. Do not mistake its physical
// backing board for occlusion of the front-mounted interaction anchor.
const ARMORY_VIEW = COLLIDERS.filter(c => c.type !== 'outpost_armory_rack');

export function interactOutpostTraining(game, p, obj) {
  if (!['outpost_range_console', 'outpost_range_target', 'outpost_armory'].includes(obj?.type)) {
    return fail('Unknown training station.');
  }
  if (p.dead || !inExpeditionOutpost(p) || !sameTravelRegion(p, obj)) return fail('Return to the Expedition Outpost.');
  if (game.time < (p.combatUntil || 0) || p.autoOn || p.inscription || p.production || p.jy > .05) {
    return fail('Disengage and stand still before operating the range.');
  }
  if (obj.type === 'outpost_armory') {
    if (p.z >= R.armory.z - .45 || !hasLineOfSight(p, obj, ARMORY_VIEW)) {
      return fail('Inspect the armory from the front aisle, not through the shelter wall.');
    }
    game.message(p, 'info', 'Field armory: inspect the Longpoint, field, tuned and dense training patterns. Exhibition equipment is secured; no weapons or ammunition are issued here. Equip your own ranged weapon for calibration.');
    return { ok: true };
  }
  if (obj.type === 'outpost_range_console') {
    if (!hasLineOfSight(p, obj)) return fail('Approach the range console through the shelter entrance.');
    if (p.outpostTraining?.active) {
      const { shots, hits, score } = p.outpostTraining;
      p.outpostTraining = null;
      game.message(p, 'info', `Calibration ended: ${hits}/${shots} targets struck · ${score} points. Start again at the console.`);
    } else {
      p.outpostTraining = { active: true, shots: 0, hits: 0, score: 0, readyAt: 0 };
      game.message(p, 'info', 'Calibration active: select ranged (Z), stand behind the amber floor line and interact with a target (F or right-click). Five simulated shots; no ammunition, XP, currency or equipment changes.');
    }
    return { ok: true };
  }
  const state = p.outpostTraining;
  if (!state?.active || state.shots >= RANGE_SHOTS) return fail('Start a five-shot calibration at the firing-line console.');
  if (activeWeaponSlot(p.char) !== 'ranged') return fail('Select your ranged weapon first (Z).');
  // Keep the operator on the sheltered firing line, never beyond the targets.
  const S = OP.shelter;
  if (p.x < S.x + 1.0 || p.x > S.x + 3.4 ||
      p.z < S.z - 2.5 || p.z > S.z + 1.4) return fail('Stand behind the amber firing line.');
  if (!hasLineOfSight(p, obj)) return fail('The training target is obstructed.');
  if (game.time < state.readyAt) return fail('Let the simulator cycle before your next shot.');

  // A deterministic hit/quality presentation is computed only here. This is
  // training feedback, NOT weapon damage and not an economy/progression action.
  const targetOffset = Math.abs(p.z - obj.z);
  const accuracy = Math.max(0.2, 0.93 - Math.max(0, targetOffset - .7) * .16);
  const roll = Math.min(0.999999, Math.max(0, Number(game.rng()) || 0));
  const hit = roll < accuracy;
  const score = hit ? (roll < accuracy * .35 ? 10 : roll < accuracy * .75 ? 7 : 4) : 0;
  state.shots += 1;
  state.hits += Number(hit);
  state.score += score;
  state.readyAt = game.time + RANGE_COOLDOWN_MS;
  p.outbox.push({ e: 'range_shot', d: obj.id, lane: obj.key, hit: hit ? 1 : 0, score, shots: state.shots, total: RANGE_SHOTS });
  if (state.shots === RANGE_SHOTS) {
    state.active = false;
    game.message(p, 'info', `Calibration complete: ${state.hits}/${RANGE_SHOTS} strikes · ${state.score} points. Use the console to reset.`);
  }
  return { ok: true };
}
