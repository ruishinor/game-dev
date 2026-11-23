// Lightweight wetland atmosphere using the existing shared, pooled GPU VFX
// engine. No separate particle meshes, light allocation or simulation writes.
import { LUMENFEN, FEN_POOLS, FEN_SITES, inLumenfen, fenHeight } from '../../shared/lumenfen.js';
import { CELL } from './vfx/textures.js';

const EMITTERS = Object.freeze([
  ...FEN_POOLS.map((p, i) => ({
    x: p.x, z: p.z, radius: Math.min(p.rx, p.rz) * .68, id: i, water: true
  })),
  ...FEN_SITES.filter(s => s.id === 'mossbound-thicket' || s.id === 'luminous-canopy' ||
    s.id === 'root-crown-hollow').map((s, i) => ({
    x: s.x, z: s.z, radius: Math.max(1, s.clearance * .65), id: i + 30, water: false
  })),
]);

export function createLumenfenAmbientVfx(engine) {
  let elapsed = 0, emitted = 0, index = 0, disposed = false;
  const stats = () => ({ emitted, emitters: EMITTERS.length });
  function update(dt, eye, reducedMotion = false) {
    if (disposed || !engine || !eye || !inLumenfen(eye.x, eye.z, 35)) {
      elapsed = 0;
      return;
    }
    if (reducedMotion || engine.reducedMotion || engine.quality < 1) return;
    elapsed += Math.max(0, Math.min(.1, dt || 0));
    // Maximum four emission windows a second; most frames do no work.
    if (elapsed < .25) return;
    elapsed %= .25;
    // Rotate deterministically; avoid polluting distant GPU particle pools.
    for (let k = 0; k < EMITTERS.length; k++) {
      const source = EMITTERS[(index++ % EMITTERS.length)];
      if (Math.hypot(eye.x - source.x, eye.z - source.z) > 58) continue;
      const a = (index * 2.399963 + source.id) % (Math.PI * 2);
      const r = source.radius * (.3 + ((index % 5) / 7));
      const x = source.x + Math.cos(a) * r, z = source.z + Math.sin(a) * r;
      const at = [x, fenHeight(x, z) + (source.water ? .14 : 1.1), z];
      emitted += engine.burst({
        at, count: source.water ? 4 : 5, blend: 'alpha',
        color: source.water ? 0x92bfc4 : 0x91c6a0,
        color2: source.water ? 0xd0ddd1 : 0x486b61,
        shape: 'sphere', radius: source.water ? .45 : .8,
        life: source.water ? 1.15 : 2, speed: source.water ? .10 : .16,
        size: source.water ? .13 : .18, sizeEnd: .025,
        alpha: source.water ? .22 : .30, gravity: -.015, turb: .12,
        cell: source.water ? CELL.glow : CELL.dust
      });
      return; // exactly one emitter per tick
    }
  }
  return { update, stats, dispose() { disposed = true; elapsed = 0; } };
}
