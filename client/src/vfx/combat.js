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
import { hot, shieldEnvelope } from './engine.js';
import { LONGPOINT_TRACE } from '../longpoint.js';
import { finiteVector, projectileStyle } from '../projectile-presentation.js';

export const PALETTE = {
  kinetic: 0xff9a3c, kineticHot: 0xffd08a,
  graviton: 0xa673ff,
  resonance: 0xb08cff, aegis: 0x6fcfff,
  restore: 0x52f0a0, teal: 0x5fd8cc, spore: 0xb6f06a,
  survey: 0x5fd0ff, bore: 0xffb070,
  hostile: 0xff5030, hostileHot: 0xffb070,
  gold: 0xffd27a,
};

export const AREA_KINDS = new Set([
  'survey_blast', 'arc_pulse', 'turret_drone_barrage', 'seismic_slam', 'fault_shear', 'containment_sweep', 'carapace_echo', 'deep_record', 'sinter_sample', 'carapace_imprint',
  // Sinter ecology (feat/attunement-asset-production): dormant until that line lands here.
  'sinter_alarm', 'sinter_guard', 'sinter_molt', 'sinter_repel', 'sinter_pounce',
  'rift_open','rift_pulse','rift_stabilize','rift_collapse','vein_extract','vein_harvest','vein_break','severance_traverse','field_maintenance','field_restorative','overseer_press_slam','overseer_slag_wave','overseer_resonant_overload','field_recovery',
  'discharge', 'aegis', 'lattice_relay', 'harmonic_restore', 'rescue_lattice', 'brine_service', 'surge', 'resonance_burst', 'respawn', 'spawn', 'equip', 'attune',
]);
/** Ground height for an event: prefer its own world point, else its source's feet. */
const groundHeightOr = (e, s) => (Number.isFinite(e.y) ? e.y : s ? s.pos.y - (s.model?.hover || 0) : 0);

const CLASS_COLOUR = { vanguard: PALETTE.kinetic, symbiotech: PALETTE.restore, keeper: PALETTE.resonance, surveyor: PALETTE.survey, mender: 0xffc46b };

const DISCHARGE = [
  { at: 0, emit({ v, core }) {
    v.flash({ at: core, color: 0xffc47e, intensity: 11, life: 0.22, distance: 5 });
    v.burst({ at: core, count: 1, exact: true, cell: CELL.flare, color: 0xffe5bc, color2: 0xf39846, size: 1.18, sizeEnd: 0.48, life: 0.18, speed: 0, alpha: 0.65 });
    v.burst({ at: core, shape: 'ring', radius: 0.22, radial: true, up: 0.12, count: 23, cell: CELL.streak, color: 0xffd697, color2: 0xe66e2e, size: [0.045, 0.1], sizeEnd: 0.018, life: [0.25, 0.48], speed: [6, 11], stretch: 0.06, drag: 2, gravity: 5 });
  } },
  { at: 0.045, emit({ v, core, feet, radius }) {
    // Capacitor discharge earths itself: short forked arcs from the core to the ground ring.
    const f = typeof feet === 'function' ? feet() : feet;
    const c = typeof core === 'function' ? core() : core;
    if (f && c) for (let i = 0; i < 4; i++) {
      // Short, close arcs: they earth beside the body, not across the whole radius.
      const a = v.rand() * Math.PI * 2;
      const r = Math.min(radius * 0.4, 1.8) * (0.55 + v.rand() * 0.45);
      const cx = c.x ?? c[0], cy = c.y ?? c[1], cz = c.z ?? c[2];
      v.lightning({ from: [cx, cy, cz], to: [f[0] + Math.cos(a) * r, f[1] + 0.05, f[2] + Math.sin(a) * r], color: 0xfff0d0, color2: 0xff9a3c, width: 0.04, life: 0.16 + i * 0.04, jag: 0.22, rate: 0.045, branches: 1 });
    }
    v.shock({ at: feet, radius, color: 0xffaa54, life: 0.53, width: 0.055, filaments: true, alpha: 0.88 });
    v.shell({ at: feet, radius, height: 0.83, color: 0xd87839, kind: 'wall', life: 0.42, from: 0.13, growPart: 0.72, streak: 0.8, alpha: 0.38 });
  } },
  { at: 0.28, emit({ v, feet, radius, combat }) {
    if (!v.reducedMotion) combat.dust(feet, radius * 0.72, 11, 0x8e7662);
    v.sigil({ at: feet, radius: radius * 0.47, color: 0xca864d, alpha: 0.44, life: 1.0, spin: 0, hot: 0.3 });
    v.scorch({ at: feet, radius: Math.min(radius * 0.4, 2.3), color: 0xe67b3d, alpha: 0.55, life: 2.5 });
  } },
];

const AEGIS = [
  { at: 0, emit({ v, feet, radius }) {
    v.sigil({ at: feet, radius, style: 'resonance', color: 0x77c4e2, alpha: 0.66, life: 1.14, spin: 0, grow: 0.22, hot: 0.55 });
  } },
  { at: 0.11, emit({ v, follow }) {
    v.shell({ at: follow, radius: 1.23, color: 0x82cbe8, kind: 'dome', hex: 1.3, life: 0.68, from: 0.45, growPart: 0.56, streak: 0.18, holdUntil: 0.56, alpha: 0.59 });
  } },
  { at: 0.23, emit({ v, feet, radius }) {
    v.burst({ at: feet, shape: 'ring', radius: Math.min(radius, 1.22), lift: 0.08, count: 12, cell: CELL.hex, color: 0xc5edff, color2: 0x629ec6, size: [0.075, 0.13], sizeEnd: 0.045, life: [0.44, 0.72], speed: [1.0, 1.65], spread: 0.22, spin: [-0.5, 0.5], drag: 0.45, alpha: 0.6 });
  } },
];

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
    this.v.burst({ at, shape: 'ring', radius, ground: true, radial: true, up: 0.25, count, blend: 'alpha', cell: [CELL.smoke, CELL.dust], color, color2: 0x5a5048, size: [0.6, 1.1], sizeEnd: [1.6, 2.4], life: [0.9, 1.5], speed: [0.6, 1.6], drag: 1.5, alpha: 0.45, spin: [-0.6, 0.6], turb: 0.45, turbScale: 0.9, soft: 0.5 });
  }

  rising(at, radius, cell, color, count = 12, height = 1.8) {
    this.v.burst({ at, shape: 'disc', radius, ground: true, lift: 0.15, count, cell, color: hot(color, 0.5), color2: color, size: [0.1, 0.2], sizeEnd: 0.03, life: [0.8, 1.4], speed: [height * 0.6, height], dir: [0, 1, 0], spread: 0.25, drag: 0.8, swirl: 1.4, turb: 0.6, turbScale: 2.2 });
  }

  // --- event recipes -----------------------------------------------------------

  /** Any damage event (auto-attacks and abilities); `kind` from the server. */
  hit(d, s, e) {
    // Confirmed Longpoint hits use the real fitted muzzle and a narrow trace.
    // Other ranged families use directional trails; preserve this fitted trace.
    const muzzle=e.ab==='auto'&&e.k==='bolt'&&e.wv==='longpoint'&&s?.placed&&s!==d?s.model?.weaponEffectOrigin?.():null;
    if(muzzle?.isVector3&&[muzzle.x,muzzle.y,muzzle.z].every(Number.isFinite)){
      const from=muzzle.clone(),to=d.chest.clone();
      this.v.beam({from,to,...LONGPOINT_TRACE,grow:.08,taper:1});
      this.v.burst({at:from,count:3,cell:CELL.streak,color:LONGPOINT_TRACE.color,size:[.045,.095],life:[.07,.13],speed:[.4,1.2],dir:to.clone().sub(from).normalize()});
      this.impact(d,s,e);return;
    }
    // Projectiles land when they arrive; everything else lands now.
    if (e.k === 'bolt' && s?.placed && s !== d) {
      this.bolt(s, d, () => this.impact(d, s, e), e.ab === 'auto' ? s.model?.weaponEffectOrigin?.() : null);
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
    if (!e.sh || e.a > 0) this.sparks(at, e.sh && hostile ? PALETTE.hostile : c, heavy ? 1.4 : e.k === 'bolt' ? 0.7 : 1, dir);
    if (e.sh) {
      const outward = s ? s.chest.clone().sub(at) : at.clone().set(0, 1, 0);
      outward.y = Math.max(0.8, outward.y + 0.85);
      outward.normalize();
      const feet = this.feet(d);
      const radius = shieldEnvelope(d.model?.height);
      this.v.shell({ at: feet, radius: radius + 0.015, kind: 'dome', impactDirection: outward, color: 0x69b5de,
        from: 1, life: 0.36, holdUntil: 0.15, alpha: 0.86 });
      this.v.burst({ at: outward.clone().multiplyScalar(radius).add(at.clone().fromArray(feet())), dir: outward, spread: 0.67,
        count: 8, cell: CELL.hex, color: 0xc2e7ff, color2: 0x6eb7dc, size: [0.085, 0.16], sizeEnd: 0.04,
        life: [0.23, 0.42], speed: [0.6, 1.7], spin: [-1, 1], drag: 3, alpha: 0.72 });
    }
    if (e.k === 'melee' && s && !hostile && e.ab !== 'rending_arc') {
      this.v.arc({ at: s.chest, yaw: this.yawTo(s, d), radius: 1.6, color: hot(c, 0.2), sweep: 2.0, tilt: (this.v.rand() - 0.5) * 0.9, life: 0.24, alpha: 0.75, reverse: this.v.rand() < 0.5 });
    } else if (e.k === 'melee' && hostile) {
      this.v.arc({ at: s.chest, yaw: this.yawTo(s, d), radius: Math.max(1, this.radiusOf(s) * 1.1), color: PALETTE.hostile, sweep: 1.5, tilt: 0.6, life: 0.22, alpha: 0.4 });
    }
    if (heavy) this.v.flash({ at, color: c, intensity: 10, life: 0.22 });
  }

  /** A projectile from s to d; class decides its form. */
  bolt(s, d, onArrive, weaponOrigin = null) {
    const v = this.v;
    const origin=weaponOrigin?.isVector3&&finiteVector(weaponOrigin)?weaponOrigin:s.chest;
    if(!finiteVector(origin)||!finiteVector(d.chest)){onArrive?.();return;}
    const a=origin.clone(),end=d.chest.clone();
    const len = a.distanceTo(end);
    const life = Math.min(0.42, Math.max(0.12, len / 45));
    const c = s.meta.k === 'e' ? PALETTE.hostile : this.colour(s);
    const cls = s.meta.k === 'e' ? 'hostile' : s.meta.c;
    const visual=projectileStyle(cls);
    // trail() samples follow() synchronously: seed at the actual emitter.
    const at = [a.x, a.y, a.z];
    const prev = [a.x, a.y, a.z];
    v.burst({ at: a, count: 2, cell: CELL.streak, color: hot(c, .18), color2: c, size: [.065,.10], sizeEnd: .025, life: .11, speed: [.4,.8], alpha: .7 });
    // A continuous trail gives each discipline a readable path shape:
    // kinetic/hostile slugs leave hot streaks, symbiote spores a beaded
    // organic filament, resonance a double ribbon, survey a thin trace.
    const follow = () => at;
    const style = cls === 'symbiotech' ? 2 : 0;
    v.trail({ follow, life, length: cls === 'symbiotech' ? 0.22 : 0.12, fade: 0.14, width:visual.width, color: hot(c, .18), color2: c, style, alpha: .82 });
    if (cls === 'keeper') v.trail({ follow: () => [at[0], at[1] + Math.sin(at[0] * 9 + at[2] * 9) * 0.06, at[2]], life, length: 0.18, fade: 0.18, width: 0.03, color: 0xd8ecff, color2: PALETTE.resonance, style: 0, alpha: 0.6 });
    v.emitter({
      life,
      tick: (k) => {
        if(finiteVector(d.chest))end.copy(d.chest);
        at[0] = a.x + (end.x - a.x) * k;
        at[1] = a.y + (end.y - a.y) * k + Math.sin(k * Math.PI) * (cls === 'symbiotech' ? 0.6 : 0.15);
        at[2] = a.z + (end.z - a.z) * k;
        const vel = [at[0]-prev[0],at[1]-prev[1],at[2]-prev[2]];
        // No luminous spherical head. A narrow, velocity-aligned streak and the
        // existing class trail provide a bounded and saturated flight silhouette.
        if(Math.hypot(...vel)>1e-6)v.burst({at,count:1,exact:true,cell:CELL.streak,color:hot(c,.18),color2:c,size:visual.head,sizeEnd:.03,life:.05,speed:.8,dir:vel,spread:0,stretch:visual.stretch,alpha:.8});
        v.burst({ at, count: 2, cell: cls === 'symbiotech' ? CELL.spore : cls === 'keeper' ? [CELL.runeA, CELL.runeB, CELL.ember] : CELL.ember, color: hot(c, 0.3), color2: c, size: [0.05, 0.12], sizeEnd: 0.01, life: [0.2, 0.45], speed: [0.1, 0.6], drag: 2, gravity: cls === 'symbiotech' ? -0.5 : 0.5, turb: cls === 'symbiotech' ? 0.8 : 0.3, turbScale: 3 });
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
      // The tether crackles: forked discharge along the pull, re-struck rapidly.
      v.lightning({ from: () => s.chest, to: () => d.chest, color: 0xe2d4ff, color2: PALETTE.graviton, width: 0.05, life: 0.55, jag: 0.1, rate: 0.06, branches: 2 });
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

  /**
   * Server 'fx' events with a radius or a world point. Returns true when this
   * kind has an engine recipe (the caller then mutes the legacy effect).
   */
  area(e, s, o = null, d = null) {
    if (!AREA_KINDS.has(e.k)) return false;
    return this.areaRecipe(e, s, o, d) !== false;
  }

  areaRecipe(e, s, o, d) {
    const v = this.v;
    if(['rift_open','rift_pulse','rift_stabilize','rift_collapse'].includes(e.k)){
      if(!Number.isFinite(e.x)||!Number.isFinite(e.z)||!Number.isFinite(e.r))return;
      const f=[e.x,groundHeightOr(e,s),e.z],pulse=e.k==='rift_pulse',closing=e.k==='rift_stabilize'||e.k==='rift_collapse';
      const colour=pulse?0xd98e75:closing?0x8fc5b8:0xada7d3;
      // The rift model flares its own membrane; the engine adds the spatial
      // response: a ground shock, and either an implosion of streaks drawn
      // into the throat (open/close) or a shard spray and scorch (discharge).
      const core=[f[0],f[1]+2.45,f[2]];
      v.shock({at:f,radius:e.r,color:colour,life:pulse?.7:1.2,width:pulse?.14:.08});
      if(!pulse)v.shock({at:f,radius:2.6,color:hot(colour,.3),life:.8,width:.05});
      if(pulse){
        v.burst({at:core,shape:'sphere',radius:.6,count:30,cell:[CELL.shard,CELL.streak],color:hot(colour,.4),color2:colour,size:[.05,.16],sizeEnd:.02,life:[.45,1.0],speed:[3.5,7.5],gravity:3.2,drag:.8,spin:[-4,4],stretch:.05});
        v.scorch({at:f,radius:Math.min(e.r*.55,3.2),color:colour,life:2.4});
      }else{
        v.burst({at:core,shape:'sphere',radius:closing?2.6:3.4,count:closing?22:30,cell:[CELL.streak,CELL.glow],color:hot(colour,.5),color2:colour,size:[.04,.11],sizeEnd:.015,life:[.5,.95],speed:.2,attract:core,pull:closing?14:10,stretch:.06});
      }
      if(pulse)v.flash({at:[f[0],f[1]+1.2,f[2]],color:colour,intensity:7,life:.25});
      return;
    }
    if(e.k==='severance_traverse'){
      // The Severance Gate landmark plays the coordinated response; this adds
      // only a bounded spark bloom at the threshold (smaller when throttled).
      if(!Number.isFinite(e.x)||!Number.isFinite(e.z))return;
      const f=[e.x,groundHeightOr(e,s)+4.2,e.z];
      v.burst({at:f,shape:'sphere',radius:1.1,count:e.m?6:16,cell:[CELL.shard,CELL.streak],color:0xffd2a0,color2:0xff8a2c,size:[.04,.12],sizeEnd:.02,life:[.4,.9],speed:[.8,2.4],drag:1.2});
      return;
    }
    if (e.k === 'fault_shear' || e.k === 'containment_sweep') {
      // Kestrel/Sinter hostile specials: a fracture line field or a sweeping containment band.
      const f = [e.x, e.y, e.z];
      const sweep = e.k === 'containment_sweep';
      v.shock({ at: f, radius: e.r, color: sweep ? 0xff7a50 : PALETTE.hostileHot, life: 0.6, width: sweep ? 0.12 : 0.08 });
      v.shell({ at: f, radius: e.r, height: sweep ? 1.8 : 0.9, color: sweep ? 0xff6a40 : PALETTE.hostile, kind: 'wall', life: 0.55, from: sweep ? 0.95 : 0.15, to: sweep ? 1 : 1, growPart: 0.5, streak: sweep ? 1.3 : 0.6 });
      if (!sweep) v.scorch({ at: f, radius: Math.min(e.r * 0.6, 5), color: PALETTE.hostile, life: 3 });
      this.dust(f, e.r * 0.5, 10);
      v.flash({ at: [e.x, e.y + 1, e.z], color: PALETTE.hostileHot, intensity: 12, life: 0.35 });
      return;
    }
    if (e.k === 'carapace_echo') {
      const f = [e.x, groundHeightOr(e, s), e.z];
      v.shock({ at: f, radius: e.r, color: 0xc9ae76, life: 0.6 });
      v.sigil({ at: f, radius: e.r * 0.6, style: 'kinetic', color: 0xd8c08a, life: 0.9, spin: 1.6 });
      if (s?.placed && d?.placed) v.beam({ from: s.chest, to: d.chest, color: 0xd8c08a, width: 0.11, life: 0.45, jitter: 0.08, grow: 0.3 });
      return;
    }
    if (e.k === 'deep_record' && o) {
      v.sigil({ at: this.feet(o), radius: 1.5, style: 'survey', color: 0xbacb9a, life: 1.2, spin: 0.8 });
      if (s?.placed) v.beam({ from: () => o.head, to: s.chest, color: 0xbacb9a, width: 0.08, life: 0.85, grow: 0.3, flow: -3, hold: true });
      v.burst({ at: () => o.head, count: 10, cell: CELL.diamond, color: 0xe8f0d8, color2: 0xbacb9a, size: [0.05, 0.09], life: [0.6, 1], speed: [0.2, 0.8], drag: 1.5 });
      return;
    }
    if(e.k==='vein_extract'||e.k==='vein_harvest'||e.k==='vein_break'){
      // resonance drawn from the crystals into the gatherer: a held tether and
      // inbound motes for the channel, a shard rush on success, a fizzle on a break
      if(!s?.placed||!o?.placed)return false;
      const tip=()=>[o.pos.x,o.pos.y+1.6,o.pos.z];
      if(e.k==='vein_extract'){
        const life=Math.min(6,Math.max(.5,(e.ms||3000)/1000));
        v.sigil({at:this.feet(o),radius:1.5,style:'survey',color:0x7fd6ff,life,spin:.6,grow:.2,alpha:.5});
        v.beam({from:tip,to:s.chest,color:0x9fe2ff,width:.05,life,grow:.25,flow:3.5,jitter:.04,hold:true,alpha:.85});
        let acc=0;
        v.emitter({life,tick:(k,t,it,dt)=>{acc+=dt||0;if(acc<.12)return;acc=0;
          v.burst({at:tip,shape:'sphere',radius:.35,count:2+Math.round(k*3),cell:[CELL.glow,CELL.shard],color:0xc8f0ff,color2:0x5fc4ee,size:[.03,.07],life:[.45,.7],speed:.3,attract:s.chest,pull:6+8*k,stretch:.03});}});
      }else if(e.k==='vein_harvest'){
        v.burst({at:tip,shape:'sphere',radius:.4,count:18,cell:[CELL.shard,CELL.streak],color:0xe4f8ff,color2:0x6cc9f2,size:[.04,.1],sizeEnd:.02,life:[.35,.7],speed:[1.2,2.4],attract:s.chest,pull:9,stretch:.05});
        v.shock({at:this.feet(o),radius:2.2,color:0x8fdcff,life:.6,width:.06});
        v.flash({at:tip(),color:0x9fe2ff,intensity:6,life:.3});
      }else{
        v.burst({at:tip,shape:'sphere',radius:.3,count:6,cell:CELL.ember,color:0x9fb6c4,color2:0x4d6b80,size:[.03,.06],life:[.3,.5],speed:[.3,.8],gravity:1.5});
      }
      return;
    }
    if(e.k==='field_recovery'){
      if(!s?.placed||!o?.placed)return false;
      v.sigil({at:this.feet(o),radius:1.25,style:'survey',color:0xc0b88c,life:1.15,spin:.25});
      v.beam({from:()=>o.head,to:s.chest,color:0xbecba3,width:.045,life:.5,grow:.2,flow:2});
      v.burst({at:()=>o.head,shape:'sphere',radius:.23,count:7,cell:CELL.shard,color:0xd2c4a4,color2:0xa9b99b,size:[.035,.075],life:[.3,.6],speed:[.45,.9],attract:s.chest,pull:3});
      return;
    }
    if (e.k === 'sinter_sample' && o) {
      const c = e.mode === 'kinetic' ? 0x8ec4d5 : 0x90c6a1;
      v.sigil({ at: this.feet(o), radius: 1.6, style: e.mode === 'kinetic' ? 'kinetic' : 'restorative', color: c, life: 1.1 });
      if (s?.placed) {
        v.beam({ from: s.chest, to: () => o.head, color: c, width: 0.085, life: 0.72, grow: 0.3, flow: 3 });
        v.burst({ at: () => o.head, shape: 'sphere', radius: 0.3, count: 12, cell: [CELL.shard, CELL.ember], color: hot(c, 0.4), color2: c, size: [0.05, 0.1], life: [0.4, 0.8], speed: 0.2, attract: s.chest, pull: 4 });
      }
      return;
    }
    if (e.k.startsWith('sinter_') && e.k !== 'sinter_sample') {
      if (!s?.placed) return;
      const f = this.feet(s)();
      const r = this.radiusOf(s);
      if (e.k === 'sinter_alarm') {
        // herd alarm: a dusty ochre call that ripples outward
        v.shock({ at: f, radius: 2.4 + r, color: 0xcbb67a, life: 0.7, width: 0.07 });
        this.dust(f, r * 0.9, 8, 0x9a8a68);
        v.burst({ at: s.chest, count: 6, cell: CELL.diamond, color: 0xf0e0a8, color2: 0xcbb67a, size: [0.06, 0.1], life: [0.5, 0.8], speed: [1, 2], dir: [0, 1, 0], spread: 0.7, drag: 2 });
      } else if (e.k === 'sinter_guard') {
        // a shieldback braces: mineral plates flare as a hex shell
        v.shell({ at: s.chest, radius: r + 0.5, color: 0xd98f52, kind: 'sphere', hex: 1, life: 0.7, from: 1.2, to: 1, alpha: 0.45 });
        v.shock({ at: f, radius: r + 1.2, color: 0xd98f52, life: 0.5 });
      } else if (e.k === 'sinter_molt') {
        // growth molt: shed mineral flakes and a dust skirt
        v.burst({ at: s.chest, shape: 'sphere', radius: r * 0.7, count: 18, blend: 'alpha', cell: CELL.shard, color: 0xb8a888, color2: 0x7a6a58, size: [0.08, 0.15], life: [0.8, 1.3], speed: [0.6, 1.6], dir: [0, 1, 0], spread: 1.2, gravity: 9, spin: [-6, 6] });
        this.dust(f, r, 10, 0x9eae83);
      } else if (e.k === 'sinter_repel' && d?.placed) {
        // the guard drives a predator off: a heavy sweep and a push of grit
        v.arc({ at: s.chest, yaw: this.yawTo(s, d), radius: r + 1, color: 0xd98f52, sweep: 2.2, tilt: 0.3, life: 0.35, alpha: 0.8 });
        this.sparks(d.chest, 0xd98f52, 1.1, [d.pos.x - s.pos.x, 0.3, d.pos.z - s.pos.z]);
      } else if (e.k === 'sinter_pounce' && d?.placed) {
        // the predator lunges: a low streak along the line and a dust kick-off
        v.burst({ at: s.chest, shape: 'line', to: d.chest, count: 14, cell: CELL.streak, color: 0xffb070, color2: 0xa05030, size: [0.06, 0.1], life: [0.2, 0.35], speed: 0.4, stretch: 0.05 });
        this.dust(f, r * 0.6, 8, 0x8a7a6a);
        v.arc({ at: d.chest, yaw: this.yawTo(s, d), radius: 1.2, color: PALETTE.hostile, sweep: 1.6, tilt: 0.8, life: 0.25, alpha: 0.6 });
      }
      return;
    }
    if (e.k === 'carapace_imprint') {
      if (!s?.placed) return;
      v.shell({ at: s.chest, radius: 0.9, color: 0x97b6a1, kind: 'sphere', hex: 1, life: 0.6, from: 1.3, to: 0.95, alpha: 0.4 });
      v.sigil({ at: this.feet(s), radius: 1.3, style: 'restorative', color: 0x97b6a1, life: 0.8 });
      return;
    }
    if (e.k === 'survey_blast') {
      const f = [e.x, e.y, e.z];
      const up = [e.x, e.y + 0.8, e.z];
      v.flash({ at: up, color: 0xffb060, intensity: 16, life: 0.45, distance: e.r * 2.5 });
      v.burst({ at: up, count: 1, exact: true, cell: CELL.flare, color: 0xffffff, color2: 0xffb060, size: Math.min(4, e.r * 0.65), sizeEnd: 0.4, life: 0.22, speed: 0 });
      v.burst({ at: up, shape: 'sphere', radius: 0.6, count: 26, cell: CELL.glow, color: 0xffd8a0, color2: 0xff6a20, size: [0.45, 0.8], sizeEnd: [0.1, 0.2], life: [0.3, 0.6], speed: [1.5, e.r * 1.1], drag: 3 });
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
    if (e.k === 'turret_drone_barrage') {
      const f = [e.x, groundHeightOr(e, s), e.z];
      v.shock({ at: f, radius: e.r, color: PALETTE.hostileHot, life: .65, width: .08 });
      v.shell({ at: f, radius: e.r * .95, height: 1.2, color: PALETTE.hostile, kind: 'wall', life: .55, from: .16, growPart: .55 });
      this.dust(f, e.r * .55, 10);
      v.scorch({ at: f, radius: Math.min(e.r * .6, 3.4), color: 0xe07234, life: 3.2 });
      v.flash({ at: [f[0], f[1] + 1, f[2]], color: PALETTE.hostileHot, intensity: 12, life: .3 });
      return;
    }
    if (e.k === 'overseer_press_slam') {
      // a press die the size of a door drops: a falling shaft, a molten splash, a scored ring
      if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !Number.isFinite(e.r)) return;
      const f = [e.x, groundHeightOr(e, s), e.z];
      v.shell({ at: f, radius: e.r * 0.42, height: 9, kind: 'pillar', color: 0xff8a3a, life: 0.35, from: 1, to: 0.15, alpha: 0.55, streak: 1.6, flow: -4 });
      v.shock({ at: f, radius: e.r, color: 0xffb060, life: 0.55, width: 0.12 });
      v.shock({ at: f, radius: e.r * 1.35, color: 0xff5a14, life: 0.9, width: 0.05 });
      v.shell({ at: f, radius: e.r, height: 1.6, color: 0xff6a20, kind: 'wall', life: 0.55, from: 0.2, growPart: 0.5, streak: 1.1 });
      v.scorch({ at: f, radius: Math.min(e.r * 0.75, 6), color: 0xff4a10, life: 4.5 });
      v.burst({ at: [f[0], f[1] + 0.3, f[2]], shape: 'disc', radius: e.r * 0.5, count: 46, cell: [CELL.ember, CELL.shard], color: 0xffd090, color2: 0xff4a10, size: [0.08, 0.2], sizeEnd: 0.02, life: [0.6, 1.3], speed: [4, 9], dir: [0, 1, 0], spread: 0.75, gravity: 16, drag: 0.4 });
      this.dust(f, e.r * 0.7, 22);
      v.flash({ at: [f[0], f[1] + 1.5, f[2]], color: 0xffa040, intensity: 22, life: 0.45, distance: 16 });
      return;
    }
    if (e.k === 'overseer_slag_wave') {
      // a ring of molten slag rolls outward from the Overseer's feet
      if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !Number.isFinite(e.r)) return;
      const f = [e.x, groundHeightOr(e, s), e.z];
      v.shell({ at: f, radius: e.r, height: 1.3, color: 0xff5a14, kind: 'wall', life: 1.1, from: 0.08, to: 1, growPart: 0.85, alpha: 0.75, streak: 1.4 });
      v.shell({ at: f, radius: e.r * 0.92, height: 0.6, color: 0xffc070, kind: 'wall', life: 1.0, from: 0.05, to: 1, growPart: 0.8, alpha: 0.5 });
      v.shock({ at: f, radius: e.r, color: 0xff7a2a, life: 1.1, width: 0.16 });
      v.scorch({ at: f, radius: e.r * 0.9, color: 0xc83a08, life: 5 });
      v.burst({ at: f, shape: 'ring', radius: e.r * 0.85, ground: true, lift: 0.2, count: 60, cell: [CELL.ember, CELL.flare], color: 0xffd090, color2: 0xff4a10, size: [0.1, 0.24], sizeEnd: 0.03, life: [0.7, 1.4], speed: [1.2, 3.2], dir: [0, 1, 0], spread: 0.35, gravity: 4 });
      v.flash({ at: [f[0], f[1] + 1, f[2]], color: 0xff6a20, intensity: 18, life: 0.6, distance: e.r * 1.6 });
      return;
    }
    if (e.k === 'overseer_resonant_overload') {
      // the Overseer vents the Foundry's harmonic charge through the whole chamber
      const at = s ? this.feet(s)() : [e.x, groundHeightOr(e, s), e.z];
      const chest = s ? s.chest : { x: at[0], y: at[1] + 2.5, z: at[2] };
      v.shell({ at, radius: 1.4, height: 14, kind: 'pillar', color: 0x8fd8ff, life: 1.2, streak: 1.8, flow: 3 });
      v.shell({ at: chest, radius: 4, color: 0x5ff0e0, kind: 'sphere', life: 0.7, from: 0.15, to: 2.4, alpha: 0.45 });
      v.sigil({ at, radius: 9, style: 'hazard', color: 0xff8a3a, life: 1.4, spin: 1.6, grow: 0.25 });
      v.shock({ at, radius: Math.min(Number.isFinite(e.r) ? e.r : 30, 30), color: 0x8fd8ff, life: 1.2, width: 0.05 });
      v.shock({ at, radius: 12, color: 0xff8a3a, life: 0.8, width: 0.1 });
      v.burst({ at: [chest.x, chest.y, chest.z], shape: 'sphere', radius: 1.2, count: 54, cell: [CELL.shard, CELL.streak, CELL.glow], color: 0xdff8ff, color2: 0x5ff0e0, size: [0.08, 0.22], sizeEnd: 0.02, life: [0.6, 1.2], speed: [6, 14], drag: 1.4 });
      v.flash({ at: [chest.x, chest.y, chest.z], color: 0x8fd8ff, intensity: 26, life: 0.6, distance: 30 });
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
      if (!Number.isFinite(e.r) || e.r <= 0 || e.r > 60) return false;
      return !!v.play(DISCHARGE, { v, feet: f, radius: e.r, core: [s.chest.x, s.chest.y - 0.12, s.chest.z], combat: this });
    } else if (e.k === 'aegis') {
      if (!Number.isFinite(e.r) || e.r <= 0 || e.r > 60) return false;
      return !!v.play(AEGIS, { v, feet: f, radius: e.r, follow: this.feet(s) });
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
      v.shell({ at: f, radius: Math.min(e.r, 6), color: PALETTE.restore, kind: 'dome', life: 1, alpha: 0.16, streak: 0.5 });
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
    } else if (e.k === 'field_maintenance') {
      v.sigil({at:f,radius:1.15,style:'kinetic',color:0xd6b788,life:1.15,spin:.3});
      v.burst({at:s.chest,shape:'sphere',radius:.2,count:9,cell:CELL.ember,color:0xe9d1a1,color2:0xa6bdad,size:[.035,.06],life:[.28,.55],speed:[.3,.8],gravity:1});
    } else if (e.k === 'field_restorative') {
      // Expedition ampoule: a teal sigil under the feet, an amber-teal helix
      // rising through the body, a soft pillar and a short chest bloom.
      v.sigil({at:f,radius:1.25,style:'resonance',color:0x4fd1c5,life:1.4,spin:.6,grow:.25});
      v.shell({at:f,radius:.75,height:2.6,kind:'pillar',color:0x7fe3d6,life:1.1,alpha:.35,streak:1.2,flow:1.6});
      this.rising(f,.55,[CELL.ember,CELL.glow],0xffb36a,14,2.4);
      this.rising(f,.45,[CELL.cross,CELL.glow],0x6ff0e0,12,2.8);
      v.burst({at:s.chest,shape:'sphere',radius:.25,count:10,cell:[CELL.glow,CELL.cross],color:0xfff0c8,color2:0x4fd1c5,size:[.06,.14],sizeEnd:.02,life:[.5,.9],speed:[.4,1],dir:[0,1,0],spread:.5,drag:1});
      v.flash({at:s.chest,color:0x8ff0e4,intensity:5,life:.35});
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

  /** Keeper Aegis relay: a shield link that lands as a hex flare on the ally. */
  relay(s, d) {
    this.v.beam({ from: s.chest, to: d.chest, color: PALETTE.aegis, width: 0.12, life: 0.65, grow: 0.3, flow: 4 });
    this.v.burst({ at: d.chest, count: 8, cell: CELL.hex, color: hot(PALETTE.aegis, 0.4), color2: PALETTE.aegis, size: [0.18, 0.28], sizeEnd: 0.06, life: [0.4, 0.6], speed: [0.6, 1.4], drag: 3, spin: [-3, 3] });
    this.v.sigil({ at: this.feet(d), radius: 1.7, style: 'resonance', color: PALETTE.aegis, life: 0.9, spin: 1 });
  }

  /** Mender life-transfer beam (companion heal pulse). */
  transfer(s, d) {
    this.v.beam({ from: s.chest, to: d.chest, color: PALETTE.restore, width: 0.09, life: 0.55, grow: 0.3, flow: -4, bend: [0, 0.35, 0] });
    this.v.burst({ at: s.chest, shape: 'line', to: d.chest, count: 8, cell: CELL.glow, color: hot(PALETTE.restore, 0.4), color2: PALETTE.teal, size: [0.05, 0.1], life: [0.3, 0.5], speed: 0.2, attract: d.chest, pull: 6 });
  }

  /**
   * Enemy wind-up for the server's real channel time: energy drawn in toward
   * the caster, a hazard sigil underfoot and a flare on release.
   */
  windup(ent, ms) {
    const v = this.v;
    const life = Math.min(8, Math.max(0.2, (ms || 1000) / 1000));
    const r = this.radiusOf(ent);
    v.sigil({ at: this.feet(ent), radius: r + 0.8, style: 'hazard', color: PALETTE.hostile, life, spin: 1.2, grow: 0.3, alpha: 0.6 });
    let acc = 0;
    v.emitter({
      life,
      tick: (k, t, it, dt) => {
        acc += dt || 0;
        if (acc < 0.08) return;
        acc = 0;
        v.burst({ at: ent.chest, shape: 'sphere', radius: r + 1.2, count: 2 + Math.round(k * 4), cell: [CELL.glow, CELL.ember], color: hot(PALETTE.hostile, 0.4), color2: PALETTE.hostile, size: [0.06, 0.12], life: [0.3, 0.45], speed: 0.1, attract: ent.chest, pull: 9, stretch: 0.03 });
        if (k >= 0.999) {
          v.burst({ at: ent.chest, count: 1, exact: true, cell: CELL.flare, color: 0xffe0c0, color2: PALETTE.hostile, size: r + 1.4, sizeEnd: 0.3, life: 0.2, speed: 0 });
          v.flash({ at: ent.chest, color: PALETTE.hostileHot, intensity: 10, life: 0.25 });
        }
      },
    });
    v.shell({ at: () => ent.chest, radius: r + 0.4, color: PALETTE.hostile, kind: 'sphere', life, from: 1.4, to: 0.6, growPart: 1, holdUntil: 0.9, alpha: 0.25, streak: 1 });
  }

  /** An item reaches the player: gold motes rise into a brief sigil. */
  acquire(ent) {
    const f = this.feet(ent)();
    this.v.sigil({ at: f, radius: 1.1, style: 'kinetic', color: PALETTE.gold, life: 1, spin: 2, alpha: 0.7 });
    this.v.burst({ at: f, shape: 'disc', radius: 0.5, ground: true, lift: 0.2, count: 14, cell: [CELL.diamond, CELL.flare], color: 0xfff0c0, color2: PALETTE.gold, size: [0.06, 0.12], sizeEnd: 0.02, life: [0.7, 1.1], speed: [1.2, 2.2], dir: [0, 1, 0], spread: 0.25, swirl: 3, attract: ent.chest, pull: 1.2 });
  }

  telegraph(x, y, z, r, ms) {
    this.v.telegraph({ at: [x, y, z], radius: r, ms });
  }

  die(ent) {
    if (ent.meta?.k === 'p') {
      // a player falls: grey dust, a guttering shell and fading embers
      const f = this.feet(ent)();
      this.dust(f, 0.6, 10, 0x6a6460);
      this.v.shell({ at: f, radius: 0.7, height: 2.2, color: 0x8a96a0, kind: 'wall', life: 0.9, from: 1, to: 0.6, alpha: 0.35 });
      this.v.burst({ at: ent.chest, count: 10, cell: CELL.ember, color: 0xffc8a0, color2: 0x404040, size: [0.05, 0.08], life: [0.6, 1], speed: [0.3, 0.9], dir: [0, 1, 0], spread: 1, drag: 1 });
      return;
    }
    if (ent.meta?.k !== 'e') return;
    const at = ent.chest.clone();
    this.v.burst({ at, shape: 'sphere', radius: 0.4, count: 12, blend: 'alpha', cell: CELL.smoke, color: 0x4a4048, color2: 0x2a2428, size: [0.5, 0.8], sizeEnd: [1.2, 1.8], life: [0.9, 1.4], speed: [0.3, 1], dir: [0, 1, 0], spread: 1.2, alpha: 0.5, drag: 1 });
    this.v.burst({ at, count: 16, cell: CELL.shard, color: 0xffb080, color2: 0x804030, size: [0.08, 0.16], life: [0.5, 0.9], speed: [2, 5], dir: [0, 1, 0], spread: 1.3, gravity: 12, spin: [-8, 8] });
    this.sparks(at, PALETTE.hostile, 1.1);
  }
}
