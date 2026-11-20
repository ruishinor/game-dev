// The world clock: one server-owned time of day shared by every player. The
// Severance Expanse presents it (day, dusk, night, dawn); the server sends the
// current phase (0..1, 0 = day key) and clients only display it.
export const WORLD_CLOCK = Object.freeze({
  periodMs: 48 * 60 * 1000,   // one full day/night cycle: 48 minutes (12 per phase)
  offsetMs: 0,                // shifts the cycle without a restart
});

/** Phase 0..1 at wall-clock time `now` (ms). 0 day, 0.25 dusk, 0.5 night, 0.75 dawn. */
export function worldClockPhase(now, clock = WORLD_CLOCK) {
  const p = ((now + clock.offsetMs) % clock.periodMs) / clock.periodMs;
  return p < 0 ? p + 1 : p;
}

/** Human label for a phase (the nearest key). */
export function worldClockLabel(phase) {
  return ['Day', 'Dusk', 'Night', 'Dawn'][Math.round(((phase % 1) + 1) % 1 * 4) % 4];
}
