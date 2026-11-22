// Snapshot-driven Aegis presentation. Only the server grants/removes shields.
import { createArtEffect } from './artfx/common.js';
import { aegisSampler } from './artfx/aegis.js';
import { shieldEnvelope } from './vfx/engine.js';
export function shieldVisible(row) {
  return !!row && !(row.f & 1) && Array.isArray(row.b) && row.b.includes('shield');
}
export class LiveAegis {
  constructor(THREE) {
    this.THREE = THREE;
    this.fields = new Map();
  }
  sync(ent, reducedMotion, time) {
    const active = ent.meta.k === 'p' && !ent.dead && ent.inView && shieldVisible(ent.row);
    let field = this.fields.get(ent.id);
    if (!active || (field && (field.reducedMotion !== reducedMotion || field.parent !== ent.holder))) {
      this.remove(ent.id);
      field = undefined;
    }
    if (!active) return;
    if (!field) {
      // Visual envelope, not attack range. Stay inside the sampler's opaque time window.
      const radius = shieldEnvelope(ent.model.height);
      const sample = aegisSampler({ variant: 'base', radius, duration: 120, reducedMotion });
      const effect = createArtEffect(this.THREE, t => sample(t).map(o => ({...o, opacity: o.opacity * (o.id === 'dome' ? 0.28 : 0.46)})));
      effect.group.name = 'live-aegis:' + ent.id;
      ent.holder.add(effect.group);
      field = { effect, reducedMotion, parent: ent.holder };
      this.fields.set(ent.id, field);
      effect.update(12);
    }
    if (!reducedMotion) field.effect.update(12 + (Math.max(0, time) % 30));
  }
  remove(id) {
    const field = this.fields.get(id);
    if (!field) return;
    field.effect.dispose();
    this.fields.delete(id);
  }
  clear() {
    for (const id of this.fields.keys()) this.remove(id);
  }
}
