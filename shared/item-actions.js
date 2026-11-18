// Player-facing action eligibility for replaceable Workshop equipment.
// Recovery yields and outcome selection are owned by the server.
const SALVAGEABLE = new Set(['field_emitter', 'tuned_emitter', 'dense_pulse_core', 'longpoint_emitter', 'resonance_buffer']);
export function canSalvageEquipment(id) {
  return SALVAGEABLE.has(id);
}
