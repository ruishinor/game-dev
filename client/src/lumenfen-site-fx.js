// Presentation-only Lumenfen site atmosphere, emitted through the existing
// shared VFX engine. All positions are local to established visual landmarks.
// No new lights, materials, colliders, hazards or gameplay timing are created.
import { FEN_SITES, fenHeight, inLumenfen } from '../../shared/lumenfen.js';
import { CELL } from './vfx/textures.js';

export const LUMENFEN_SITE_FX_BUDGET = Object.freeze({
  near: 26, maxDt: 0.1, maxParticlesPerBurst: 8,
});

// Site-specific material behaviour, not interchangeable glowing spheres.
// Colour, height, motion and cadence are deliberately different for each site.
const PROFILES = Object.freeze({
  'veil-landing': {
    dx: 0, dz: 1.8, lift: 0.35, cadence: 8.4, count: 4,
    color: 0x80b49f, color2: 0xb5d6b3, size: [0.014, 0.023],
    dir: [0, 1, 0], speed: [0.12, 0.32], gravity: -0.02,
    life: [0.75, 1.3], alpha: 0.25, cell: [CELL.dust, CELL.spore],
  },
  'mossbound-thicket': {
    dx: 1.5, dz: 2.0, lift: 0.6, cadence: 7.2, count: 6,
    color: 0x80bc81, color2: 0xa4d9a4, size: [0.013, 0.033],
    dir: [0, 1, 0], speed: [0.16, 0.4], gravity: -0.03,
    life: [0.85, 1.5], alpha: 0.33, cell: [CELL.spore, CELL.petal],
  },
  'glasswater-spring': {
    dx: 1.3, dz: 3.7, lift: 0.24, cadence: 4.6, count: 8,
    color: 0x8ec7c8, color2: 0xc0ebe3, size: [0.014, 0.031],
    dir: [0, 1, 0], speed: [0.24, 0.68], gravity: 0.24,
    life: [0.45, 0.92], alpha: 0.38, cell: [CELL.smoke, CELL.bubble],
  },
  'root-crown-hollow': {
    dx: 0, dz: 0, lift: 3.45, cadence: 6.5, count: 5,
    color: 0x7edcc0, color2: 0xc0d6b5, size: [0.014, 0.025],
    dir: [0, 1, 0], speed: [0.1, 0.28], gravity: 0,
    life: [0.45, 0.9], alpha: 0.27, cell: [CELL.spore, CELL.petal],
  },
  'tidal-weir': {
    dx: 8, dz: 0.9, lift: 1.5, cadence: 4.2, count: 8,
    color: 0x7baea7, color2: 0xb3dad0, size: [0.015, 0.039],
    dir: [0, 0.9, 0.35], speed: [0.38, 1.12], gravity: 1.15,
    life: [0.38, 0.78], alpha: 0.42, cell: [CELL.bubble, CELL.smoke],
  },
  'luminous-canopy': {
    dx: 0.9, dz: 0.6, lift: 10.8, cadence: 5.5, count: 7,
    color: 0x9eca8c, color2: 0xc5e7ae, size: [0.017, 0.038],
    dir: [0, -1, 0], speed: [0.1, 0.35], gravity: 0.02,
    life: [0.85, 1.5], alpha: 0.32, cell: [CELL.petal, CELL.spore],
  },
});

export function createLumenfenSiteFx(vfx) {
  const sites = FEN_SITES.filter(s => Object.hasOwn(PROFILES, s.id));
  const remaining = new Map(sites.map((s, i) => [s.id, PROFILES[s.id].cadence * (0.4 + (i % 3) * 0.15)]));
  const emissions = new Map(sites.map(s => [s.id, 0]));
  let disposed = false;

  function emit(site, profile) {
    if (typeof vfx.burst !== 'function') return;
    const x = site.x + profile.dx, z = site.z + profile.dz;
    const y = fenHeight(x, z) + profile.lift;
    vfx.burst({
      at: [x, y, z], shape: 'sphere', radius: profile.count >= 7 ? 0.4 : 0.22,
      count: Math.min(profile.count, LUMENFEN_SITE_FX_BUDGET.maxParticlesPerBurst),
      color: profile.color, color2: profile.color2, blend: 'alpha', cell: profile.cell,
      size: profile.size, sizeEnd: 0.004, dir: profile.dir,
      spread: 0.7, speed: profile.speed, gravity: profile.gravity,
      life: profile.life, drag: 0.6, alpha: profile.alpha, turb: 0.08,
    });
    // The observatory's actual armillary carries a faint, short-lived
    // calibrated resonance between its rings. No telegraph, AoE or damage.
    if (site.id === 'root-crown-hollow' && vfx.quality >= 2 &&
        !vfx.calmFlashes && typeof vfx.beam === 'function') {
      vfx.beam({
        from: [site.x - 0.8, fenHeight(site.x, site.z) + 3.65, site.z],
        to: [site.x + 0.8, fenHeight(site.x, site.z) + 3.65, site.z],
        color: 0x86cdb6, width: 0.012, life: 0.28, alpha: 0.19,
        flow: 0.7, jitter: 0.012, taper: 0.65,
      });
    }
    emissions.set(site.id, emissions.get(site.id) + 1);
  }

  return {
    update(dt, focus) {
      if (disposed || !vfx || vfx.quality <= 0 || vfx.reducedMotion ||
          !Number.isFinite(dt) || dt <= 0 || !focus ||
          !Number.isFinite(focus.x) || !Number.isFinite(focus.z) ||
          !inLumenfen(focus.x, focus.z)) return;
      const step = Math.min(dt, LUMENFEN_SITE_FX_BUDGET.maxDt);
      for (const site of sites) {
        if (Math.hypot(site.x - focus.x, site.z - focus.z) > LUMENFEN_SITE_FX_BUDGET.near) continue;
        const profile = PROFILES[site.id];
        const next = remaining.get(site.id) - step;
        if (next > 0) { remaining.set(site.id, next); continue; }
        remaining.set(site.id, profile.cadence);
        emit(site, profile);
      }
    },
    dispose() { disposed = true; },
    stats() {
      return { disposed, emissions: Object.fromEntries(emissions) };
    },
  };
}
