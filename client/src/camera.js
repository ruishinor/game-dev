// Third-person orbit camera with terrain and obstacle avoidance.

import { COLLIDERS, groundHeight, DEEP, deepRoofAt } from '../../shared/world.js';

const MIN_DIST = 2.5;
const MAX_DIST = 24;
const MIN_PITCH = -0.2;
const MAX_PITCH = 1.45;
const HEAD = 1.75;

// The camera is stopped only by terrain and by solid architecture or
// boulders. Vegetation, pods and thin pillars never push it around: they fade
// out instead when they cross the view line (see Occluders in scene.js), which
// avoids both the popping and the foreground blocking that collision causes.
const SEE_THROUGH = new Set(['sporetree', 'pod', 'conduit', 'crystal', 'pylon', 'gatepost']);
const BLOCKERS = COLLIDERS.filter((c) => !SEE_THROUGH.has(c.type) && (c.hw !== undefined || c.r >= 0.9)).map((c) => ({ ...c, top: groundHeight(c.x, c.z) + c.h }));

function blocked(x, y, z) {
  if (y < groundHeight(x, z) + 0.3) return true;
  // Allow clearance from hanging ribs, ducts and strip lighting as well
  // as the roof slab itself (lowest fixture is 0.52m below its underside).
  if (deepRoofAt(x, z, 0.18) && y > DEEP.roofBottom - 0.78 && y < DEEP.roofTop + 0.25) return true;
  for (let i = 0; i < BLOCKERS.length; i++) {
    const c = BLOCKERS[i];
    if (y > c.top) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (c.r !== undefined) {
      const r = c.r + 0.25;
      if (dx * dx + dz * dz < r * r) return true;
    } else if (Math.abs(dx) < c.hw + 0.25 && Math.abs(dz) < c.hd + 0.25) return true;
  }
  return false;
}

export class ThirdPersonCamera {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI;
    this.pitch = 0.32;
    this.want = 10;
    this.dist = 10;
  }

  look(dx, dy) {
    this.yaw -= dx * 0.0042;
    this.pitch = Math.max(MIN_PITCH, Math.min(MAX_PITCH, this.pitch + dy * 0.0036));
  }

  zoom(steps) {
    this.want = Math.max(MIN_DIST, Math.min(MAX_DIST, this.want * (1 + steps * 0.12)));
  }

  /** Snap back to the default view behind the character. */
  reset(yaw) {
    this.yaw = yaw;
    this.pitch = 0.32;
    this.want = 10;
  }

  /** Ease the camera back behind the character (used while running). */
  trail(yaw, dt) {
    let d = yaw - this.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.yaw += d * Math.min(1, dt * 2.2);
  }

  /** Place the camera for a focus point at the character's feet. */
  update(focus, dt) {
    const px = focus.x;
    const py = focus.y + HEAD;
    const pz = focus.z;
    const cp = Math.cos(this.pitch);
    const dx = -Math.sin(this.yaw) * cp;
    const dy = Math.sin(this.pitch);
    const dz = -Math.cos(this.yaw) * cp;

    // March outward from the head; stop short of the first obstruction.
    let allowed = this.want;
    const steps = Math.ceil(this.want / 0.25);
    for (let i = 2; i <= steps; i++) {
      const t = (i * this.want) / steps;
      if (blocked(px + dx * t, py + dy * t, pz + dz * t)) {
        allowed = Math.max(0.6, t - 0.45);
        break;
      }
    }
    // Pull in instantly (never clip), ease back out.
    if (allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * (1 - Math.exp(-dt * 5));

    const d = this.dist;
    this.camera.position.set(px + dx * d, py + dy * d, pz + dz * d);
    this.camera.lookAt(px, py + 0.1, pz);
  }
}
