// Persistent status visuals, driven every frame by the server's buff list for
// each entity (snapshot row.b). Presentation only: a status is drawn while
// the server says it is active and removed the moment it is not.
//
// Each status has its own shape, not just a colour:
//   ward     amber hex shell with orbiting charge embers (Kinetic Ward)
//   hot      rising restorative crosses (regeneration)
//   bond     teal chitin shell and motes (Mender carapace bond)
//   corrode  dripping acid and sizzle (Mender assist debuff)
//   sap      low drifting spores (Spore Snare debuff)
//   root     restorative ground sigil and spores (with the existing vines)
// 'shield' is drawn by live-aegis.js and is not repeated here.
import { CELL } from './textures.js';
import { hot } from './engine.js';

export const STATUS_KINDS = ['ward', 'hot', 'bond', 'corrode', 'sap', 'root'];

const LOOK = {
  ward: { aura: { radius: 1.05, color: 0xff9a3c, hex: 1, alpha: 0.2, streak: 0.4 }, every: 0.3 },
  hot: { every: 0.45 },
  bond: { aura: { radius: 0.95, color: 0x5fd8cc, hex: 1, alpha: 0.16, streak: 0.8, pulse: 1.6 }, every: 0.5 },
  corrode: { every: 0.22 },
  sap: { every: 0.3 },
  root: { area: { style: 'restorative', color: 0x6fcf6a }, every: 0.55 },
};

export class StatusVfx {
  constructor(cvfx) {
    this.c = cvfx;
    this.v = cvfx.v;
    this.ents = new Map();
  }

  /** Reconcile one entity's drawn statuses with its active buff keys. */
  sync(ent, buffs, dt) {
    const keys = new Set((Array.isArray(buffs) ? buffs : []).filter((k) => STATUS_KINDS.includes(k)));
    let st = this.ents.get(ent.id);
    if (!keys.size) {
      if (st) this.remove(ent.id);
      return;
    }
    if (!st) {
      st = { handles: new Map(), timers: new Map() };
      this.ents.set(ent.id, st);
    }
    // drop statuses that ended
    for (const [k, h] of st.handles) {
      if (!keys.has(k)) {
        for (const x of h) x?.dispose();
        st.handles.delete(k);
        st.timers.delete(k);
      }
    }
    const feet = () => [ent.pos.x, ent.pos.y - (ent.model?.hover || 0), ent.pos.z];
    const r = Math.max(0.6, Math.min(2.4, ent.model?.radius || 0.6));
    for (const k of keys) {
      const look = LOOK[k];
      if (!st.handles.has(k)) {
        const hs = [];
        if (look.aura) hs.push(this.v.aura({ at: () => ent.chest, ...look.aura, radius: look.aura.radius * Math.max(1, r / 0.8) }));
        if (look.area) hs.push(this.v.area({ at: feet(), radius: r * 1.7, style: look.area.style, color: look.area.color, alpha: 0.4, spin: 0.15 }));
        st.handles.set(k, hs);
      }
      // keep a ground sigil under its (normally stationary) owner
      if (look.area && !look.aura) for (const h of st.handles.get(k)) h?.set(feet(), r * 1.7);
      const t = (st.timers.get(k) ?? look.every) + (Number.isFinite(dt) ? dt : 0);
      if (t >= look.every) {
        st.timers.set(k, 0);
        this.emit(k, ent, feet(), r);
      } else st.timers.set(k, t);
    }
  }

  emit(k, ent, f, r) {
    const v = this.v;
    const chest = ent.chest;
    if (k === 'ward') {
      v.burst({ at: chest, shape: 'sphere', radius: 0.9 * Math.max(1, r / 0.8), count: 3, cell: CELL.ember, color: 0xffd08a, color2: 0xff9a3c, size: [0.05, 0.09], life: [0.5, 0.8], speed: 0.2, swirl: 5, attract: chest, pull: 0.8 });
    } else if (k === 'hot') {
      v.burst({ at: f, shape: 'disc', radius: r * 0.8, ground: true, lift: 0.2, count: 2, cell: [CELL.cross, CELL.glow], color: hot(0x52f0a0, 0.4), color2: 0x52f0a0, size: [0.08, 0.14], sizeEnd: 0.03, life: [0.9, 1.3], speed: [0.7, 1.1], dir: [0, 1, 0], spread: 0.2, drag: 0.6 });
    } else if (k === 'bond') {
      v.burst({ at: chest, shape: 'sphere', radius: 0.7, count: 2, cell: [CELL.hex, CELL.glow], color: hot(0x5fd8cc, 0.3), color2: 0x5fd8cc, size: [0.07, 0.12], life: [0.6, 0.9], speed: 0.2, swirl: 2, spin: [-2, 2] });
    } else if (k === 'corrode') {
      v.burst({ at: [chest.x, chest.y + 0.2, chest.z], shape: 'sphere', radius: r * 0.7, count: 3, cell: CELL.spore, color: 0xd6f05a, color2: 0x7a9a20, size: [0.05, 0.09], life: [0.5, 0.8], speed: 0.1, gravity: 6, stretch: 0.04 });
      v.burst({ at: chest, shape: 'sphere', radius: r * 0.6, count: 1, blend: 'alpha', cell: CELL.smoke, color: 0x9aa860, color2: 0x4a5030, size: [0.3, 0.45], sizeEnd: 0.8, life: [0.8, 1.1], speed: 0.3, dir: [0, 1, 0], spread: 0.6, alpha: 0.35 });
    } else if (k === 'sap') {
      v.burst({ at: [f[0], f[1] + 0.25, f[2]], shape: 'disc', radius: r * 1.1, count: 3, cell: CELL.spore, color: 0xc0a8f0, color2: 0x8fbf6a, size: [0.06, 0.1], life: [1, 1.5], speed: [0.05, 0.2], dir: [0, 1, 0], spread: 1, swirl: 1.2, drag: 0.5 });
    } else if (k === 'root') {
      v.burst({ at: [f[0], f[1] + 0.1, f[2]], shape: 'disc', radius: r, count: 2, cell: CELL.spore, color: 0xb6f06a, color2: 0x6fcf6a, size: [0.06, 0.1], life: [1, 1.6], speed: [0.2, 0.5], dir: [0, 1, 0], spread: 0.6, drag: 0.6 });
    }
  }

  remove(id) {
    const st = this.ents.get(id);
    if (!st) return;
    for (const hs of st.handles.values()) for (const h of hs) h?.dispose();
    this.ents.delete(id);
  }

  clear() {
    for (const id of [...this.ents.keys()]) this.remove(id);
  }

  get tracked() {
    return this.ents.size;
  }
}
