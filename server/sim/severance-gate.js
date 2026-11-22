// Severance Gate: server-owned resonance state and travel through the passage.
//
// Replicated: the gate's phase only ('dormant' | 'resonating' | 'active'). The
// client derives every cosmetic layer (vortex, column, rings, fragments, rune
// sequence) from that phase locally. Traversal emits one world cue; the full
// response is throttled so a party walking through does not replay it per player.
// Timings, presence radius and travel validation stay here.
import { dist, hasLineOfSight } from '../../shared/world.js';
import { openFoundry, foundryArrival } from './silent-foundry.js';
import { regionEntryDenial } from './enemy-levels.js';
import { inSeverancePocket, SEVERANCE_POCKET, GATE_THRESHOLD, GATE_FRONT, SEVERANCE_GATE } from '../../shared/severance-gate.js';

export const GATE_TIMING = Object.freeze({ resonateMs: 6500, idleMs: 40000, fullTraverseMs: 8000, presence: 120 });
const deny = (reason) => ({ ok: false, reason });

export function createSeveranceGate(game) {
  const gate = game.objects.find((o) => o.type === 'severance_gate');
  const beacon = game.objects.find((o) => o.type === 'severance_return');
  if (!gate || !beacon) return null;
  return { gate, beacon, phase: 'dormant', until: 0, lastPresence: -Infinity, lastFull: -Infinity, traversals: 0 };
}

function present(game) {
  for (const p of game.players.values()) {
    if (!p.dead && inSeverancePocket(p.x, p.z) && Math.hypot(p.x - SEVERANCE_GATE.x, p.z - SEVERANCE_GATE.z) <= GATE_TIMING.presence) return true;
  }
  return false;
}

export function tickSeveranceGate(game) {
  const s = game.severance;
  if (!s || s.hold) return; // hold: server-side test/capture fixture only, never client reachable
  const now = game.time;
  if (present(game)) s.lastPresence = now;
  const occupied = now - s.lastPresence < GATE_TIMING.idleMs;
  if (s.phase === 'dormant' && occupied) {
    s.phase = 'resonating';
    s.until = now + GATE_TIMING.resonateMs;
  } else if (s.phase === 'resonating' && now >= s.until) {
    s.phase = occupied ? 'active' : 'dormant';
  } else if (s.phase === 'active' && !occupied) {
    s.phase = 'dormant';
  }
}

export function severanceRow(game, obj) {
  const s = game.severance;
  return s && obj === s.gate ? { gp: s.phase } : {};
}

/** Foundry (and legacy Annex) return destination: the foot of the gate's stairs. */
export function gateFront() {
  return { x: GATE_FRONT.x, z: GATE_FRONT.z };
}

export function pocketArrival() {
  return { x: SEVERANCE_POCKET.arrival.x, z: SEVERANCE_POCKET.arrival.z };
}

/** Interaction with the gate threshold or the pocket's return beacon. */
export function travelSeverance(game, p, obj) {
  const s = game.severance;
  if (!s || (obj !== s.gate && obj !== s.beacon)) return deny('Unknown passage.');
  if (p.dead) return deny('You are defeated.');
  if (!inSeverancePocket(p.x, p.z)) return deny('The passage is in the Severance Expanse.');
  if (p.autoOn || game.time < p.combatUntil || p.buffs.some((b) => b.k === 'root' && b.until > game.time)) return deny('Disengage before travel.');
  if (obj === s.beacon) {
    if (dist(p, obj) > 5 || !hasLineOfSight(p, obj)) return deny('Approach the return beacon.');
    const scar = game.rift?.entry;
    game.transferPlayer(p, scar ? { x: scar.x, z: scar.z - 3.6 } : { x: 0, z: 7.5 });
    game.message(p, 'info', 'You returned to the Reach.');
    return { ok: true };
  }
  // The threshold is only reachable through the physical passage: range and a
  // clear line from inside it, at the portal plane.
  if (dist(p, obj) > GATE_THRESHOLD.range || !hasLineOfSight(p, obj)) return deny('Walk through the passage to the portal.');
  if (s.phase !== 'active') return deny('The Severance Gate is still resonating. Wait for the portal to stabilize.');
  if (p.char.level < 3 || !p.char.attunements.includes('resonance') || p.char.riftCalibration !== 'completed') return deny('The portal does not answer an uncalibrated traveller.');
  const levelDenial = regionEntryDenial('silent_foundry', p.char);
  if (levelDenial) return deny(levelDenial);
  openFoundry(game);
  const full = game.time - s.lastFull >= GATE_TIMING.fullTraverseMs;
  if (full) s.lastFull = game.time;
  s.traversals++;
  game.emitWorldEvent({ e: 'fx', k: 'severance_traverse', s: s.gate.id, x: s.gate.x, z: s.gate.z, r: 2.4, m: full ? 0 : 1 });
  game.transferPlayer(p, foundryArrival());
  game.message(p, 'info', 'Through the Severance Gate: the Silent Foundry. Fight from the Fabrication Hall through the Cultivation Vault and the Harmonic Chamber to the Excavation Depths. The portal behind you returns to the Severance Gate.');
  return { ok: true };
}

