// Additive devices use the existing server-authoritative equipment contract.
// No new slot, resource, crafting protocol or client-owned effects.
export const GADGET_ITEMS = {
  aegis_rectifier: {
    name:'Aegis Rectifier', slot:'device', cls:'vanguard', req:{attune:'resonance'},
    mods:{dischargeRadius:-2,shieldMul:1.35},
    summary:'Resonant Aegis: 35% greater shield capacity · −2m Discharge radius',
    desc:'A conductive membrane grown across collapsed vector vanes. Reverses the projection geometry, concentrating instead of dispersing charge. Requires Resonance. Shields from Resonant Aegis are 35% stronger, but Discharge reaches 2m less. Does not strengthen Keeper fields.',
  },
  field_vector_array: {
    name: 'Field Vector Array',
    slot: 'device',
    cls: 'vanguard',
    mods: { chargeMul: 0.8, dischargeRadius: 2 },
    desc: 'Recovered projection vanes redistribute kinetic flux. Discharge and Resonant Aegis reach 2m further, but Charge generation is 20% lower.',
    summary: '+2m Discharge / Aegis radius; -20% Charge generation.',
  },
  conductive_membrane: {
    name: 'Conductive Membrane',
    slot: 'device',
    skills: { kinetics: 2, biotech: 2 },
    mods: { dmgMul: 0.9 },
    desc: 'A cultured interface bridges biological and mechanical signals. +2 Kinetics, +2 Biotech; 10% less damage dealt.',
    summary: '+2 Kinetics, +2 Biotech; -10% damage dealt.',
  },
};

