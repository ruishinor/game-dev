// Presentation-only parameters for the Listening Stone. Keep these independent
// of game-state authority and browser rendering so low-quality accessibility
// behaviour and performance budgets remain regression-testable.
export const STONE_VFX_BUDGET = Object.freeze({ waves: 3, motes: 70, lights: 1 });

const clamp = (v, low, high) => Math.max(low, Math.min(high, Number.isFinite(v) ? v : low));

export function listeningStonePresentation({ wake = 0, cast = 0, reducedMotion = false, effectsQuality = 2 } = {}) {
  const proximity = clamp(wake, 0, 1);
  const crescendo = clamp(cast, 0, 1);
  const energy = proximity + crescendo;
  const q = Math.round(clamp(effectsQuality, 0, 2));
  // Continuous integration belongs to the model: this function returns
  // bounded angular *speeds*, never time multiplied by a changing impulse.
  const response = energy / (1 + 0.12 * energy);
  const idleResponse = proximity / (1 + 0.12 * proximity);
  const motion = reducedMotion ? idleResponse * 0.45 : response + 0.45 * (response - idleResponse);
  return {
    energy, motion,
    ringSpeed: 1 + motion * 3,
    orbitSpeed: 1 + motion * 1.55,
    medallionSpeed: 0.15 + motion * 0.58,
    moteSpeed: 1 + (reducedMotion ? idleResponse * 0.45 : response),
    // Quality is an *effect budget*, not an accessibility preference.
    waveCount: reducedMotion ? 0 : q === 0 ? 1 : q === 1 ? 2 : STONE_VFX_BUDGET.waves,
    moteCount: q === 0 ? 28 : q === 1 ? 48 : STONE_VFX_BUDGET.motes,
    waveInterval: (q === 0 ? 2.2 : 1.95) - 0.8 * crescendo,
    waveLifetime: 2.55,
    lampIntensity: 10 + 20 * proximity + 18 * crescendo,
    beamOpacity: 0.11 + 0.04 * proximity + 0.15 * crescendo,
  };
}
