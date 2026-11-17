// Ability and event recipes for the effect engine. Each recipe is a fixed
// composition started from an authoritative server event: it reads only the
// event's own position/radius and the entities' current presentation
// transforms, never decides hits, and expires on its own.
//
// Discipline vocabulary (shape first, colour second):
//   kinetic      amber; segmented capacitor sigil, crescents, sparks, shock walls
//   graviton     violet; jittering tether, inward-drawn particles
//   resonance    violet/cyan; runic sigils, hex shells, rune particles
//   restorative  green/teal; cell-colony sigils, rising crosses and spores, soft domes
//   survey       cyan; measurement sigils, scan bubbles, drilling beams, demolition
//   hostile      red/orange; hazard sigils, scorch, dust, debris
import { CELL } from './textures.js';
import { hot } from './engine.js';

export const PALETTE = {
  kinetic: 0xff9a3c, kineticHot: 0xffd08a,
  graviton: 0xa673ff,
  resonance: 0xb08cff, aegis: 0x6fcfff,
  restore: 0x52f0a0, teal: 0x5fd8cc, spore: 0xb6f06a,
  survey: 0x5fd0ff, bore: 0xffb070,
  hostile: 0xff5030, hostileHot: 0xffb070,
  gold: 0xffd27a,
};

const CLASS_COLOUR = { vanguard: PALETTE.kinetic, symbiotech: PALETTE.restore, keeper: PALETTE.resonance, surveyor: PALETTE.survey, mender: 0xffc46b };

export class CombatVfx {
  constructor(vfx) {
    this.v = vfx;
  }

  // --- entity helpers (presentation transforms only) ---------------------------
  feet(ent) {
    return () => [ent.pos.x, ent.pos.y - (ent.model?.hover || 0), ent.pos.z];
  }
  chest(ent) {
    return () => ent.chest;
  }
  colour(ent) {
    if (!ent) return 0xffffff;
    if (ent.meta?.k === 'e') return PALETTE.hostile;
    return CLASS_COLOUR[ent.meta?.c] ?? PALETTE.restore;
  }
  yawTo(s, d) {
    return Math.atan2(d.pos.x - s.pos.x, d.pos.z - s.pos.z);
  }
  radiusOf(ent) {
    return Math.max(0.6, Math.min(2.5, ent?.model?.radius || 0.8));
  }

  // --- building blocks ---------------------------------------------------------
  sparks(at, color, power = 1, dir = null) {
    const v = this.v;
    v.burst({ at, count: 1, exact: true, cell: CELL.flare, color: hot(color, 0.7), color2: color, size: 0.9 * power, sizeEnd: 0.3, life: 0.16, speed: 0 });
    v.burst({ at, count: 4, cell: CELL.glow, color: hot(color, 0.4), color2: color, size: [0.25, 0.45], sizeEnd: 0.05, life: [0.15, 0.3], speed: [0.2, 0.8] });
    v.burst({ at, dir, spread: dir ? 1.1 : Math.PI, count: Math.round(14 * power), cell: CELL.streak, color: hot(color, 0.6), color2: color, size: [0.05, 0.09], life: [0.22, 0.5], speed: [3, 8 * power], stretch: 0.05, gravity: 7, drag: 2.5 });
  }

  dust(at, radius, count = 10, color = 0x8a7a6a) {
    this.v.burst({ at, shape: 'ring', radius, ground: true, radial: true, up: 0.25, count, blend: 'alpha', cell: [CELL.smoke, CELL.dust], color, color2: 0x5a5048, size: [0.6, 1.1], sizeEnd: [1.6, 2.4], life: [0.9, 1.5], speed: [0.6, 1.6], drag: 1.5, alpha: 0.45, spin: [-0.6, 0.6] });
  }

  rising(at, radius, cell, color, count = 12, height = 1.8) {
    this.v.burst({ at, shape: 'disc', radius, ground: true, lift: 0.15, count, cell, color: hot(color, 0.5), color2: color, size: [0.1, 0.2], sizeEnd: 0.03, life: [0.8, 1.4], speed: [height * 0.6, height], dir: [0, 1, 0], spread: 0.25, drag: 0.8, swirl: 1.4 });
  }

  // --- event recipes -----------------------------------------------------------

  /** Any damage event (auto-attacks and abilities); `kind` from the server. */
  hit(d, s, e) {
    // Projectiles land when they arrive; everything else lands now.
    if (e.k === 'bolt' && s?.placed && s !== d) {
      this.bolt(s, d, () => this.impact(d, s, e));
      return;
    }
    this.impact(d, s, e);
  }

  impact(d, s, e) {
    const at = d.chest.clone();
    const hostile = s?.meta?.k === 'e';
    const c = e.sh ? PALETTE.aegis : hostile ? PALETTE.hostile : this.colour(s);
    const dir = s ? [d.pos.x - s.pos.x, 0.4, d.pos.z - s.pos.z] : null;
    const heavy = ['rending_arc', 'discharge', 'core_bore', 'resonant_reversal', 'seismic_slam', 'survey_blast', 'controlled_blast'].includes(e.ab);
    this.sparks(at, c, heavy ? 1.4 : e.k === 'bolt' ? 0.7 : 1, dir);
    if (e.sh) this.v.burst({ at, count: 8, cell: CELL.hex, color: hot(PALETTE.aegis, 0.4), color2: PALETTE.aegis, size: [0.18, 0.3], sizeEnd: 0.05, life: [0.3, 0.5], speed: [1, 2.5], spin: [-3, 3], drag: 3 });
    if (e.k === 'melee' && s && !hostile && e.ab !== 'rending_arc') {
      this.v.arc({ at: s.chest, yaw: this.yawTo(s, d), radius: 1.6, color: hot(c, 0.2), sweep: 2.0, tilt: (this.v.rand() - 0.5) * 0.9, life: 0.24, alpha: 0.75, reverse: this.v.rand() < 0.5 });
    } else if (e.k === 'melee' && hostile) {
      this.v.arc({ at: s.chest, yaw: this.yawTo(s, d), radius: Math.max(1.2, this.radiusOf(s) * 1.3), color: PALETTE.hostile, sweep: 1.8, tilt: 0.6, life: 0.26, alpha: 0.65 });
    }
    if (heavy) this.v.flash({ at, color: c, intensity: 10, life: 0.22 });
  }

  /** A projectile from s to d; class decides its form. */
  bolt(s, d, onArrive) {
    const v = this.v;
    const a = s.chest.clone();
    const len = a.distanceTo(d.chest);
    const life = Math.min(0.42, Math.max(0.12, len / 45));
    const c = s.meta.k === 'e' ? PALETTE.hostile : this.colour(s);
    const cls = s.meta.k === 'e' ? 'hostile' : s.meta.c;
    const head = cls === 'symbiotech' ? CELL.spore : cls === 'keeper' ? CELL.diamond : CELL.glow;
    const at = [0, 0, 0];
    const prev = [a.x, a.y, a.z];
    v.burst({ at: a, count: 3, cell: CELL.glow, color: hot(c, 0.5), color2: c, size: [0.25, 0.4], sizeEnd: 0.05, life: 0.18, speed: [0.3, 1] });
    v.emitter({
      life,
      tick: (k) => {
        const b = d.chest;
        at[0] = a.x + (b.x - a.x) * k;
        at[1] = a.y + (b.y - a.y) * k + Math.sin(k * Math.PI) * (cls === 'symbiotech' ? 0.6 : 0.15);
        at[2] = a.z + (b.z - a.z) * k;
        const vel = [(at[0] - prev[0]) * 20, (at[1] - prev[1]) * 20, (at[2] - prev[2]) * 20];
        v.burst({ at, count: 1, exact: true, cell: head, color: hot(c, 0.6), size: cls === 'surveyor' ? 0.32 : 0.45, life: 0.05, speed: 0 });
        if (cls === 'keeper' || cls === 'surveyor' || cls === 'hostile') v.burst({ at, count: 1, exact: true, cell: CELL.streak, color: hot(c, 0.3), size: 0.18, life: 0.07, speed: 0, dir: vel });
        v.burst({ at, count: 3, cell: cls === 'symbiotech' ? CELL.spore : cls === 'keeper' ? [CELL.runeA, CELL.runeB, CELL.ember] : CELL.ember, color: hot(c, 0.3), color2: c, size: [0.05, 0.12], sizeEnd: 0.01, life: [0.2, 0.45], speed: [0.1, 0.6], drag: 2, gravity: cls === 'symbiotech' ? -0.5 : 0.5 });
        if (k >= 1 && onArrive) {
          const f = onArrive;
          onArrive = null;
          f();
        }
        prev[0] = at[0];
        prev[1] = at[1];
        prev[2] = at[2];
      },
    });
  }

  /** Ability-specific layers on top of the hit for named damage abilities. */
  abilityHit(ab, s, d) {
    const v = this.v;
    if (ab === 'rending_arc' || ab === 'rending_echo') {
      const yaw = this.yawTo(s, d);
      v.arc({ at: s.chest, yaw, radius: 2.3, color: PALETTE.kinetic, sweep: 2.8, tilt: 0.25, life: 0.34, trail: 0.7 });
      v.arc({ at: () => [s.chest.x, s.chest.y + 0.12, s.chest.z], yaw, radius: 1.8, color: PALETTE.kineticHot, sweep: 2.4, tilt: 0.25, life: 0.28, trail: 0.4, alpha: 0.7 });
      v.shock({ at: this.feet(d), radius: 1.8, color: PALETTE.kinetic, life: 0.4, width: 0.08 });
      this.dust(this.feet(d)(), 0.6, 4);
    } else if (ab === 'core_bore') {
      v.beam({ from: s.chest, to: d.chest, color: PALETTE.bore, width: 0.16, life: 0.55, jitter: 0.04, grow: 0.25, flow: 6 });
      v.beam({ from: s.chest, to: d.chest, color: 0xffffff, width: 0.05, life: 0.4, grow: 0.25, flow: 9 });
      v.burst({ at: s.chest, shape: 'line', to: d.chest, count: 26, cell: CELL.ember, color: hot(PALETTE.bore, 0.5), color2: PALETTE.bore, size: [0.05, 0.1], life: [0.25, 0.5], speed: [0.3, 1.2], swirl: 6, drag: 1 });
      v.scorch({ at: this.feet(d), radius: 1.1, color: PALETTE.bore, life: 2.5 });
      v.flash({ at: d.chest, color: PALETTE.bore, intensity: 14, life: 0.3 });
    } else if (ab === 'phase_needle') {
      v.beam({ from: s.chest, to: d.chest, color: PALETTE.resonance, width: 0.07, life: 0.24, grow: 0.35, flow: 8, taper: 1 });
      v.burst({ at: d.chest, count: 8, cell: [CELL.runeA, CELL.runeB, CELL.runeC], color: hot(PALETTE.resonance, 0.4), color2: PALETTE.resonance, size: [0.18, 0.28], sizeEnd: 0.05, life: [0.4, 0.7], speed: [0.6, 1.6], drag: 2.5, spin: [-2, 2] });
      v.sigil({ at: this.feet(d), radius: 1.1, style: 'resonance', color: PALETTE.resonance, life: 0.7, spin: 2 });
    } else if (ab === 'resonant_reversal') {
      v.burst({ at: s.chest, shape: 'sphere', radius: 1.1, count: 22, cell: CELL.hex, color: hot(PALETTE.aegis, 0.4), color2: PALETTE.resonance, size: [0.18, 0.3], sizeEnd: 0.06, life: [0.35, 0.55], speed: [0.5, 1.5], attract: d.chest, pull: 22, spin: [-4, 4] });
      v.beam({ from: s.chest, to: d.chest, color: PALETTE.aegis, width: 0.2, life: 0.45, jitter: 0.12, grow: 0.3, flow: 5 });
      v.shock({ at: this.feet(d), radius: 2.2, color: PALETTE.resonance, life: 0.5, width: 0.1 });
      v.shell({ at: d.chest, radius: 1.1, color: PALETTE.aegis, kind: 'sphere', hex: 0.8, life: 0.45, from: 1.4, to: 0.6 });
    } else if (ab === 'neural_lash') {
      v.beam({ from: s.chest, to: d.chest, color: PALETTE.spore, width: 0.09, life: 0.35, jitter: 0.22, grow: 0.3, flow: 5, bend: [0, 0.6, 0] });
      v.burst({ at: d.chest, count: 10, cell: CELL.spore, color: hot(PALETTE.spore, 0.3), color2: PALETTE.restore, size: [0.1, 0.2], sizeEnd: 0.04, life: [0.5, 0.9], speed: [0.4, 1.4], drag: 2, gravity: -0.4 });
    } else if (ab === 'graviton_tether') {
      v.sigil({ at: this.feet(d), radius: 1.4, style: 'resonance', color: PALETTE.graviton, life: 0.8, spin: -3 });
    } else if (ab === 'sting') {
      v.burst({ at: d.chest, count: 5, cell: CELL.ember, color: 0xffe0a0, color2: 0xffa040, size: 0.08, life: 0.3, speed: [1, 2.5], drag: 2 });
    }
  }

  cast(ab, s, d) {
    const v = this.v;
    if (ab === 'graviton_tether' && d) {
      v.beam({ from: s.chest, to: d.chest, color: PALETTE.graviton, width: 0.17, life: 0.7, jitter: 0.28, grow: 0.2, flow: -4 });
      v.beam({ from: s.chest, to: d.chest, color: 0xe6d8ff, width: 0.05, life: 0.5, jitter: 0.1, grow: 0.2 });
      v.burst({ at: d.chest, shape: 'sphere', radius: 1.6, count: 30, cell: [CELL.glow, CELL.ember], color: hot(PALETTE.graviton, 0.4), color2: PALETTE.graviton, size: [0.08, 0.18], sizeEnd: 0.02, life: [0.4, 0.7], speed: 0.2, attract: s.chest, pull: 6, stretch: 0.03 });
      v.flash({ at: d.chest, color: PALETTE.graviton, intensity: 9, life: 0.4 });
    } else if (ab === 'kinetic_ward') {
      v.shell({ at: s.chest, radius: 1.25, color: PALETTE.kinetic, kind: 'sphere', hex: 1, life: 1.2, holdUntil: 0.55, alpha: 0.38 });
      v.sigil({ at: this.feet(s), radius: 2.2, style: 'kinetic', color: PALETTE.kinetic, life: 1.4, spin: 1.2 });
      v.burst({ at: s.chest, shape: 'sphere', radius: 1.2, count: 24, cell: CELL.ember, color: PALETTE.kineticHot, color2: PALETTE.kinetic, size: [0.05, 0.1], life: [0.5, 1], speed: 0.4, swirl: 5, attract: s.chest, pull: 1.5 });
      v.flash({ at: s.chest, color: PALETTE.kinetic, intensity: 8, life: 0.5 });
    } else if (ab === 'mending_graft' && d) {
      if (d !== s) {
        v.beam({ from: s.chest, to: d.chest, color: PALETTE.restore, width: 0.13, life: 0.75, grow: 0.25, flow: -3, bend: [0, 0.5, 0] });
        v.burst({ at: s.chest, shape: 'line', to: d.chest, count: 14, cell: CELL.glow, color: hot(PALETTE.restore, 0.4), color2: PALETTE.teal, size: [0.06, 0.12], life: [0.4, 0.7], speed: 0.2, attract: d.chest, pull: 5 });
      }
      v.sigil({ at: this.feet(d), radius: 1.5, style: 'restorative', color: PALETTE.restore, life: 1.6, spin: 0.7 });
      v.shell({ at: d.chest, radius: 0.95, color: PALETTE.teal, kind: 'sphere', life: 1, alpha: 0.4, streak: 1 });
      this.rising(this.feet(d)(), 0.7, [CELL.cross, CELL.glow, CELL.glow], PALETTE.restore, 16, 1.6);
    } else if (ab === 'spore_snare' && d) {
      const f = this.feet(d)();
      v.sigil({ at: f, radius: 2, style: 'restorative', color: PALETTE.spore, life: 1.4, spin: -0.8, alpha: 0.75 });
      v.burst({ at: [f[0], f[1] + 0.4, f[2]], shape: 'disc', radius: 1.4, count: 10, blend: 'alpha', cell: CELL.smoke, color: 0x9ccc60, color2: 0x50703a, size: [0.6, 1], sizeEnd: [1.4, 2], life: [1, 1.6], speed: [0.1, 0.4], alpha: 0.4, spin: [-0.4, 0.4] });
      v.burst({ at: [f[0], f[1] + 0.3, f[2]], shape: 'disc', radius: 1.6, count: 24, cell: CELL.spore, color: hot(PALETTE.spore, 0.3), color2: PALETTE.spore, size: [0.06, 0.14], life: [1, 1.8], speed: [0.1, 0.5], dir: [0, 1, 0], spread: 1.2, drag: 0.6, swirl: 1 });
    } else if (ab === 'hinge_field' && d) {
      v.shell({ at: this.feet(d), radius: 1.7, color: PALETTE.aegis, kind: 'dome', hex: 1, life: 1.1, holdUntil: 0.5, alpha: 0.6 });
      v.sigil({ at: this.feet(d), radius: 1.9, style: 'resonance', color: PALETTE.aegis, life: 1.3, spin: 0.9 });
      this.rising(this.feet(d)(), 1.4, [CELL.runeA, CELL.runeB, CELL.runeC], PALETTE.aegis, 10, 2);
      if (d !== s) v.beam({ from: s.chest, to: d.chest, color: PALETTE.aegis, width: 0.08, life: 0.45, grow: 0.3 });
    } else if (ab === 'fault_scan' && d) {
      v.beam({ from: s.chest, to: d.chest, color: PALETTE.survey, width: 0.05, life: 0.9, grow: 0.3, flow: 4, hold: true });
      v.shell({ at: d.chest, radius: this.radiusOf(d) + 0.6, color: PALETTE.survey, kind: 'sphere', hex: 1, streak: 1.2, flow: 2, life: 1, holdUntil: 0.7, alpha: 0.5, from: 0.2 });
      v.sigil({ at: this.feet(d), radius: 1.9, style: 'survey', color: PALETTE.survey, life: 1.3, spin: 1.5 });
      v.burst({ at: d.chest, shape: 'sphere', radius: this.radiusOf(d) + 0.4, count: 14, cell: CELL.diamond, color: 0xd8f6ff, color2: PALETTE.survey, size: [0.05, 0.1], life: [0.6, 1], speed: 0.1 });
    } else if (ab === 'field_rig') {
      const f = this.feet(s)();
      v.sigil({ at: f, radius: 4, style: 'survey', color: PALETTE.survey, life: 1.8, spin: 0.5, alpha: 0.8 });
      v.shell({ at: f, radius: 0.55, height: 3.2, color: PALETTE.survey, kind: 'pillar', life: 1, streak: 1.4, flow: 2.5 });
      v.shock({ at: f, radius: 4, color: PALETTE.survey, life: 0.7 });
      this.rising(f, 0.5, CELL.ember, PALETTE.survey, 14, 3);
    }
  }

  /** Server 'fx' events with a radius or a world point. */
  area(e, s) {
    const v = this.v;
    if (e.k === 'survey_blast') {
      const f = [e.x, e.y, e.z];
      const up = [e.x, e.y + 0.8, e.z];
      v.flash({ at: up, color: 0xffb060, intensity: 30, life: 0.5, distance: e.r * 3 });
      v.burst({ at: up, count: 1, exact: true, cell: CELL.flare, color: 0xffffff, color2: 0xffb060, size: e.r * 1.4, sizeEnd: e.r * 0.4, life: 0.25, speed: 0 });
      v.burst({ at: up, shape: 'sphere', radius: 0.6, count: 26, cell: CELL.glow, color: 0xfff0c0, color2: 0xff6a20, size: [0.6, 1.1], sizeEnd: [0.1, 0.2], life: [0.3, 0.6], speed: [1.5, e.r * 1.1], drag: 3 });
      v.burst({ at: up, shape: 'sphere', radius: 0.8, count: 16, blend: 'alpha', cell: CELL.smoke, color: 0x4a3c34, color2: 0x2a2624, size: [0.9, 1.4], sizeEnd: [2.4, 3.2], life: [1.4, 2.2], speed: [0.6, 2], dir: [0, 1, 0], spread: 1.2, drag: 1.2, gravity: -0.6, alpha: 0.55, spin: [-0.5, 0.5] });
      v.burst({ at: up, count: 22, cell: CELL.shard, color: 0xffd090, color2: 0xa06030, size: [0.12, 0.22], life: [0.6, 1.1], speed: [4, 9], dir: [0, 1, 0], spread: 1.1, gravity: 14, spin: [-8, 8] });
      v.shock({ at: f, radius: e.r, color: 0xffa050, life: 0.6, width: 0.07 });
      v.shell({ at: f, radius: e.r * 0.95, height: 1.5, color: 0xffa050, kind: 'wall', life: 0.55, from: 0.2, growPart: 0.5 });
      v.scorch({ at: f, radius: e.r * 0.75, color: 0xff7a2a, life: 4 });
      this.dust(f, e.r * 0.5, 12);
      return;
    }
    if (e.k === 'arc_pulse') {
      const f = [e.x, e.y, e.z];
      v.shock({ at: f, radius: e.r, color: PALETTE.hostile, life: 0.5 });
      for (let i = 0; i < 5; i++) {
        const a = v.rand() * Math.PI * 2;
        const rr = e.r * (0.5 + v.rand() * 0.5);
        v.beam({ from: [e.x, e.y + 1.4, e.z], to: [e.x + Math.cos(a) * rr, e.y + 0.1, e.z + Math.sin(a) * rr], color: 0xff8a60, width: 0.06, life: 0.3, jitter: 0.35, taper: 1 });
      }
      v.flash({ at: [e.x, e.y + 1, e.z], color: PALETTE.hostile, intensity: 14, life: 0.3 });
      return;
    }
    if (e.k === 'seismic_slam') {
      const f = [e.x, e.y, e.z];
      v.shock({ at: f, radius: e.r, color: PALETTE.hostileHot, life: 0.6, width: 0.09 });
      v.shell({ at: f, radius: e.r, height: 1.2, color: PALETTE.hostile, kind: 'wall', life: 0.5, from: 0.15, growPart: 0.6 });
      v.scorch({ at: f, radius: Math.min(e.r * 0.7, 6), color: PALETTE.hostile, life: 3.5 });
      this.dust(f, e.r * 0.6, 18);
      v.burst({ at: [e.x, e.y + 0.2, e.z], shape: 'disc', radius: e.r * 0.6, count: 20, cell: CELL.shard, color: 0xc8a888, color2: 0x6a5a4a, blend: 'alpha', size: [0.12, 0.25], life: [0.6, 1], speed: [3, 6], dir: [0, 1, 0], spread: 0.6, gravity: 14, spin: [-6, 6] });
      v.flash({ at: [e.x, e.y + 1, e.z], color: PALETTE.hostileHot, intensity: 16, life: 0.4, distance: 12 });
      return;
    }
    if (!s) return;
    const f = this.feet(s)();
    if (e.k === 'discharge') {
      v.flash({ at: s.chest, color: PALETTE.kinetic, intensity: 22, life: 0.45, distance: e.r * 2.5 });
      v.sigil({ at: f, radius: e.r, style: 'kinetic', color: PALETTE.kinetic, life: 1.3, spin: 1.4, grow: 0.12 });
      v.shock({ at: f, radius: e.r, color: PALETTE.kineticHot, life: 0.5, width: 0.07 });
      v.shell({ at: f, radius: e.r, height: 1.6, color: PALETTE.kinetic, kind: 'wall', life: 0.5, from: 0.12, growPart: 0.45 });
      v.shell({ at: s.chest, radius: 1.4, color: PALETTE.kineticHot, kind: 'sphere', life: 0.35, from: 0.3, to: 1.4, alpha: 0.35 });
      v.scorch({ at: f, radius: Math.min(e.r * 0.5, 3), color: PALETTE.kinetic, life: 3 });
      v.burst({ at: s.chest, shape: 'sphere', radius: 0.4, count: 40, cell: CELL.streak, color: PALETTE.kineticHot, color2: PALETTE.kinetic, size: [0.07, 0.12], life: [0.3, 0.6], speed: [5, 11], dir: [0, 0.3, 0], spread: Math.PI, stretch: 0.05, drag: 2.5, gravity: 4 });
      this.dust(f, e.r * 0.45, 14);
    } else if (e.k === 'aegis') {
      v.shell({ at: f, radius: 1.8, color: PALETTE.aegis, kind: 'dome', hex: 1, life: 1.2, holdUntil: 0.5 });
      v.sigil({ at: f, radius: e.r, style: 'resonance', color: PALETTE.aegis, life: 1.3, spin: 0.8 });
      v.shock({ at: f, radius: e.r, color: PALETTE.aegis, life: 0.6 });
    } else if (e.k === 'lattice_relay') {
      v.sigil({ at: f, radius: e.r, style: 'resonance', color: PALETTE.aegis, life: 1.4, spin: 0.6 });
      v.shock({ at: f, radius: e.r, color: PALETTE.resonance, life: 0.7 });
      v.burst({ at: f, shape: 'ring', radius: e.r, ground: true, lift: 0.3, count: 26, cell: [CELL.runeA, CELL.runeB, CELL.runeC], color: hot(PALETTE.aegis, 0.3), color2: PALETTE.resonance, size: [0.2, 0.3], sizeEnd: 0.08, life: [0.8, 1.2], speed: [0.6, 1.2], dir: [0, 1, 0], spread: 0.2 });
    } else if (['harmonic_restore', 'rescue_lattice', 'brine_service'].includes(e.k)) {
      v.sigil({ at: f, radius: 1.5, style: 'restorative', color: PALETTE.teal, life: 1.4 });
      this.rising(f, 0.8, [CELL.cross, CELL.glow], PALETTE.teal, 10);
    } else if (e.k === 'surge') {
      v.flash({ at: s.chest, color: PALETTE.restore, intensity: 16, life: 0.6, distance: e.r * 2 });
      v.sigil({ at: f, radius: e.r, style: 'restorative', color: PALETTE.restore, life: 1.7, spin: 0.6, grow: 0.15 });
      v.shock({ at: f, radius: e.r, color: PALETTE.teal, life: 0.8 });
      v.shell({ at: f, radius: Math.min(e.r, 6), color: PALETTE.restore, kind: 'dome', life: 1, alpha: 0.35, streak: 1.2 });
      v.burst({ at: f, shape: 'disc', radius: e.r * 0.8, ground: true, lift: 0.2, count: 46, cell: [CELL.petal, CELL.spore, CELL.cross], color: hot(PALETTE.restore, 0.4), color2: PALETTE.teal, size: [0.1, 0.22], sizeEnd: 0.03, life: [1, 1.8], speed: [0.8, 2], dir: [0, 1, 0], spread: 0.5, drag: 0.8, swirl: 1.2, spin: [-2, 2] });
    } else if (e.k === 'resonance_burst') {
      v.shock({ at: f, radius: Math.min(e.r, 24), color: PALETTE.graviton, life: 0.9, width: 0.04 });
      v.sigil({ at: f, radius: 5, style: 'hazard', color: PALETTE.graviton, life: 1.1, spin: 2 });
      v.shell({ at: s.chest, radius: 3, color: PALETTE.graviton, kind: 'sphere', life: 0.6, from: 0.2, to: 1.6, alpha: 0.5 });
      v.flash({ at: s.chest, color: PALETTE.graviton, intensity: 20, life: 0.5, distance: 16 });
    } else if (e.k === 'respawn') {
      v.shell({ at: f, radius: 0.9, height: 6, color: PALETTE.aegis, kind: 'pillar', life: 1.2, streak: 1.4, flow: 2 });
      v.sigil({ at: f, radius: 1.7, style: 'resonance', color: PALETTE.aegis, life: 1.6 });
      this.rising(f, 0.6, CELL.ember, PALETTE.aegis, 20, 4);
    } else if (e.k === 'spawn') {
      v.shock({ at: f, radius: 1.6, color: 0xff70d0, life: 0.6 });
      this.dust(f, 0.6, 6, 0x6a5a6a);
    } else if (e.k === 'equip') {
      v.sigil({ at: f, radius: 1.4, style: 'kinetic', color: PALETTE.gold, life: 1.2, spin: 1.5 });
      this.rising(f, 0.5, [CELL.flare, CELL.ember], PALETTE.gold, 14, 2);
    } else if (e.k === 'attune') {
      v.shell({ at: f, radius: 1, height: 8, color: PALETTE.aegis, kind: 'pillar', life: 1.6, streak: 1.4, flow: 2 });
      v.sigil({ at: f, radius: 5, style: 'resonance', color: PALETTE.aegis, life: 2, spin: 0.5, grow: 0.3 });
      this.rising(f, 1.2, [CELL.runeA, CELL.runeB, CELL.runeC], PALETTE.aegis, 24, 3);
    }
  }

  /** Line from an attuning object's head to the player (stone resonance). */
  attuneLink(o, s) {
    this.v.beam({ from: () => o.head, to: s.chest, color: PALETTE.aegis, width: 0.22, life: 1.4, jitter: 0.15, grow: 0.2, flow: -3, hold: true });
    this.v.burst({ at: () => o.head, shape: 'line', to: s.chest, count: 24, cell: [CELL.runeA, CELL.runeB, CELL.runeC], color: hot(PALETTE.aegis, 0.3), color2: PALETTE.aegis, size: [0.14, 0.24], life: [0.8, 1.2], speed: 0.3, attract: s.chest, pull: 3 });
  }

  level(ent) {
    const f = this.feet(ent)();
    this.v.shell({ at: f, radius: 1.1, height: 7, color: PALETTE.gold, kind: 'pillar', life: 1.5, streak: 1.4, flow: 2.2 });
    this.v.sigil({ at: f, radius: 3.5, style: 'kinetic', color: PALETTE.gold, life: 1.8, spin: 0.8 });
    this.rising(f, 1, [CELL.flare, CELL.ember, CELL.diamond], PALETTE.gold, 30, 4);
    this.v.flash({ at: ent.chest, color: PALETTE.gold, intensity: 14, life: 0.8 });
  }

  heal(d, s) {
    const c = s?.meta?.c === 'keeper' ? PALETTE.teal : PALETTE.restore;
    this.v.burst({ at: d.chest, shape: 'sphere', radius: 0.5, count: 6, cell: [CELL.cross, CELL.glow], color: hot(c, 0.4), color2: c, size: [0.1, 0.18], sizeEnd: 0.03, life: [0.6, 1], speed: [0.5, 1], dir: [0, 1, 0], spread: 0.4, drag: 1 });
  }

  /** Mender life-transfer beam (companion heal pulse). */
  transfer(s, d) {
    this.v.beam({ from: s.chest, to: d.chest, color: PALETTE.restore, width: 0.09, life: 0.55, grow: 0.3, flow: -4, bend: [0, 0.35, 0] });
    this.v.burst({ at: s.chest, shape: 'line', to: d.chest, count: 8, cell: CELL.glow, color: hot(PALETTE.restore, 0.4), color2: PALETTE.teal, size: [0.05, 0.1], life: [0.3, 0.5], speed: 0.2, attract: d.chest, pull: 6 });
  }

  telegraph(x, y, z, r, ms) {
    this.v.telegraph({ at: [x, y, z], radius: r, ms });
  }

  die(ent) {
    if (ent.meta?.k !== 'e') return;
    const at = ent.chest.clone();
    this.v.burst({ at, shape: 'sphere', radius: 0.4, count: 12, blend: 'alpha', cell: CELL.smoke, color: 0x4a4048, color2: 0x2a2428, size: [0.5, 0.8], sizeEnd: [1.2, 1.8], life: [0.9, 1.4], speed: [0.3, 1], dir: [0, 1, 0], spread: 1.2, alpha: 0.5, drag: 1 });
    this.v.burst({ at, count: 16, cell: CELL.shard, color: 0xffb080, color2: 0x804030, size: [0.08, 0.16], life: [0.5, 0.9], speed: [2, 5], dir: [0, 1, 0], spread: 1.3, gravity: 12, spin: [-8, 8] });
    this.sparks(at, PALETTE.hostile, 1.1);
  }
}
