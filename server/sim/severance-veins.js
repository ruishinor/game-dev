// Resonant shard veins in the Severance Expanse: gatherable resource nodes.
//
// Server authority: eligibility (alive, out of combat, not attacking, in range
// with line of sight, inside the Expanse), a short channelled extraction that
// breaks on movement, combat or death, inventory capacity, the yield and the
// per-character, per-vein replenishment (persisted; clients only receive their
// own remaining times). Nothing here is client-settable.
import { dist, hasLineOfSight, travelRegionAt } from '../../shared/world.js';
import { SEVERANCE_VEINS } from '../../shared/severance-gate.js';
import { MATERIALS, MATERIAL_CAP, sanitizeMaterials } from '../../shared/crafting.js';

const CHANNEL_MS = 3000;
const REPLENISH_MS = 8 * 60 * 1000;
const RANGE = 3.6;
const DRIFT = 0.75;                       // metres the gatherer may shift during the channel
const YIELD = Object.freeze({ id: 'resonance_fragment', count: 1 });
const KEYS = new Set(SEVERANCE_VEINS.map((v) => v.key));
const deny = (reason) => ({ ok: false, reason });

/** Persisted map key -> wall-clock ready time; unknown keys, expired or out-of-range values drop. */
export function sanitizeVeinReady(raw, now = Date.now()) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw)) {
    const v = raw[k];
    if (KEYS.has(k) && Number.isSafeInteger(v) && v > now) out[k] = Math.min(v, now + REPLENISH_MS);
  }
  return out;
}

/** The player's own replenishment state: [{id, ms}] for depleted veins only. */
export function veinState(game, p) {
  const now = game.wallNow(), ready = sanitizeVeinReady(p.char.veinReadyAt, now);
  const out = [];
  for (const [k, at] of Object.entries(ready)) {
    const o = game.objects.find((x) => x.key === k);
    if (o) out.push({ id: o.id, ms: at - now });
  }
  const g = p.veinChannel;
  return { depleted: out, channel: g ? { id: g.obj.id, ms: Math.max(0, Math.round(g.until - game.time)), total: CHANNEL_MS } : null };
}

function blocked(game, p, obj) {
  if (p.dead) return 'You cannot do that while defeated.';
  if (game.time < p.combatUntil || p.autoOn) return 'Disengage before working the vein.';
  if (travelRegionAt(p.x, p.z) !== 'severance_expanse') return 'The vein is out of reach.';
  if (dist(p, obj) > RANGE || !hasLineOfSight(p, obj)) return 'Move closer to the vein along clear ground.';
  return null;
}

export function startVeinHarvest(game, p, obj) {
  if (!p || game.players.get(p.id) !== p || !obj || obj.type !== 'resonant_vein' || game.ents.get(obj.id) !== obj || !KEYS.has(obj.key)) return deny('No vein is available.');
  if (p.veinChannel) return deny('You are already extracting.');
  const why = blocked(game, p, obj);
  if (why) return deny(why);
  const now = game.wallNow(), ready = sanitizeVeinReady(p.char.veinReadyAt, now);
  if (ready[obj.key]) return deny('The vein is still regrowing its resonance.');
  const held = sanitizeMaterials(p.char.materials)[YIELD.id] || 0;
  if (held + YIELD.count > MATERIAL_CAP) return deny(MATERIALS[YIELD.id].name + ' storage is full.');
  p.veinChannel = { obj, x: p.x, z: p.z, until: game.time + CHANNEL_MS };
  game.emitWorldEvent({ e: 'fx', k: 'vein_extract', s: p.id, o: obj.id, ms: CHANNEL_MS });
  return { ok: true };
}

function cancel(game, p, reason) {
  const g = p.veinChannel;
  p.veinChannel = null;
  game.emitWorldEvent({ e: 'fx', k: 'vein_break', s: p.id, o: g.obj.id });
  if (reason) game.message(p, 'info', reason);
}

/** Per-player tick: complete or break an extraction. */
export function tickVein(game, p) {
  const g = p.veinChannel;
  if (!g) return;
  if (game.ents.get(g.obj.id) !== g.obj) return cancel(game, p, null);
  const why = blocked(game, p, g.obj);
  if (why) return cancel(game, p, 'Extraction interrupted. ' + why);
  if (Math.hypot(p.x - g.x, p.z - g.z) > DRIFT) return cancel(game, p, 'Extraction interrupted: hold still while the vein releases.');
  if (game.time < g.until) return;
  p.veinChannel = null;
  const m = sanitizeMaterials(p.char.materials);
  if ((m[YIELD.id] || 0) + YIELD.count > MATERIAL_CAP) return game.message(p, 'info', MATERIALS[YIELD.id].name + ' storage is full.');
  m[YIELD.id] = (m[YIELD.id] || 0) + YIELD.count;
  p.char.materials = m;
  const now = game.wallNow();
  p.char.veinReadyAt = { ...sanitizeVeinReady(p.char.veinReadyAt, now), [g.obj.key]: now + REPLENISH_MS };
  game.economy?.observe('materials_granted',p,YIELD.count,YIELD.id);
  game.markDirty(p);
  game.message(p, 'gain', 'Extracted: ' + MATERIALS[YIELD.id].name + '.');
  game.emitWorldEvent({ e: 'fx', k: 'vein_harvest', s: p.id, o: g.obj.id });
}

/** Drop a channel when the player leaves, dies or travels (no completion). */
export function clearVein(p) { p.veinChannel = null; }
