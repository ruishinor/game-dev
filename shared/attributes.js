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
