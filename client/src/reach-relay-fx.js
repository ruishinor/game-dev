// Intermittent presentation-only contact fault on the Derelict Relay.
// Geometry coordinates are local to the fitted service cabinet in relay-tower.js.
// No server state, damage, targeting or gameplay telegraph is created.
export const RELAY_FX_BUDGET = Object.freeze({
  near: 28, cadence: 5.8, initial: 2.3, sparks: 6,
});

export function createReachRelayFx(T, tower, vfx) {
  let disposed = false;
  let remaining = RELAY_FX_BUDGET.initial;
  let activations = 0;
  const pivot = new T.Vector3();
  const source = new T.Vector3(1.48, 1.17, 0.33);
  const sink = new T.Vector3(1.24, 1.48, 0.39);
  const worldPoint = (v) => tower.localToWorld(v.clone()).toArray();

  function update(dt, focus) {
    if (disposed || !tower || !vfx || vfx.quality <= 0 || vfx.reducedMotion ||
        !Number.isFinite(dt) || dt <= 0 || !focus ||
        !Number.isFinite(focus.x) || !Number.isFinite(focus.z)) return;
    tower.getWorldPosition(pivot);
    if (Math.hypot(focus.x - pivot.x, focus.z - pivot.z) > RELAY_FX_BUDGET.near) return;
    remaining -= Math.min(dt, 0.1);
    if (remaining > 0) return;
    remaining = RELAY_FX_BUDGET.cadence;
    const from = worldPoint(source), to = worldPoint(sink);
    if (typeof vfx.lightning !== 'function' || typeof vfx.burst !== 'function') return;
    vfx.lightning({
      from, to, color: 0xd4e1dc, color2: 0x65948b, width: 0.014,
      life: 0.2, rate: 0.07, jag: 0.12, branches: 0, alpha: 0.48,
    });
    vfx.burst({
      at: to, count: vfx.quality >= 2 ? RELAY_FX_BUDGET.sparks : 3,
      color: 0xd4e1dc, color2: 0x65948b, cell: [1, 13],
      shape: 'sphere', radius: 0.06, size: [0.018, 0.045],
      sizeEnd: 0.006, life: [0.14, 0.3], speed: [0.4, 1.5],
      gravity: 1.5, drag: 3, alpha: 0.5,
    });
    activations++;
  }
  return {
    update,
    dispose() { disposed = true; },
    stats() { return { activations, disposed }; },
  };
}
