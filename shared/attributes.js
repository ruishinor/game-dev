import { SKILL_NAMES } from './content.js';
import { weaponBonus, weaponReach } from './condition.js';

export const ATTRIBUTE_DISPLAY = {
  ...Object.fromEntries(Object.entries(SKILL_NAMES).map(([key, name]) => [key, { name }])),
  maxHp: { name: 'Maximum health' },
  power: { name: 'Power', unit: ' pp' },
  dmgMul: { name: 'Damage modifier', unit: ' pp' },
  healMul: { name: 'Healing modifier', unit: ' pp' },
  chargeMul: { name: 'Charge generation', unit: ' pp' },
  dischargeRadius: { name: 'Discharge radius', unit: ' m' },
  shieldMul: { name: 'Aegis capacity', unit: ' pp' },
  barrierMul: { name: 'Projected barrier capacity', unit: ' pp' },
  graftTicks: { name: 'Mending Graft ticks', unit: '' },
  relayRadius: { name: 'Lattice Relay radius', unit: ' m' },
  scanMs: { name: 'Fault Scan duration', unit: ' s' },
  blastRadius: { name: 'Controlled Blast radius', unit: ' m' },
  weaponDamage: { name: 'Auto-attack damage' },
  weaponReach: { name: 'Auto-attack reach', unit: ' m' },
};

export function equipmentAttributes(character, stats) {
  return {
    ...stats.skills,
    maxHp: stats.maxHp,
    power: stats.power * 100,
    dmgMul: stats.dmgMul * 100,
    healMul: stats.healMul * 100,
    chargeMul: stats.chargeMul * 100,
    shieldMul: stats.shieldMul * 100,
    dischargeRadius: stats.dischargeRadius,
    barrierMul: (stats.barrierMul ?? 1) * 100,
    graftTicks: stats.graftTicks ?? 0,
    relayRadius: stats.relayRadius ?? 0,
    scanMs: (stats.scanMs ?? 0) / 1000,
    blastRadius: stats.blastRadius ?? 0,
    weaponDamage: weaponBonus(character),
    weaponReach: weaponReach(character),
  };
}

export function attributeChanges(before, after) {
  return Object.keys(ATTRIBUTE_DISPLAY).flatMap(key => {
    const delta = Math.round((after[key] - before[key]) * 100) / 100;
    return delta ? [{ key, delta }] : [];
  });
}
