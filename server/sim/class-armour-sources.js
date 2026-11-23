// One-time, class-specific blueprint knowledge at four existing world sites.
// The normal station / Stone / Rift interactions continue when not eligible.
import { CLASS_ARMOUR_ARCHIVES, classArmourBlueprint } from '../../shared/class-armour.js';
import { sanitizeGoods } from '../../shared/goods.js';
import { sameTravelRegion, dist } from '../../shared/world.js';
import { surveyState, brineStage } from '../../shared/survey.js';
import { grantGoods } from './goods.js';

export function claimClassArmourArchive(game, p, obj) {
  if (!p || !obj || game.players.get(p.id) !== p || game.ents.get(obj.id) !== obj ||
      p.dead || dist(p, obj) > 5 || !sameTravelRegion(p, obj)) return null;
  const source = Object.entries(CLASS_ARMOUR_ARCHIVES).find(([, row]) =>
    row.cls === p.cls && row.objectType === obj.type);
  if (!source) return null;
  const [name, row] = source;
  const char = p.char;
  if (char.level < row.level || !char.attunements?.includes('resonance') ||
      game.time < p.combatUntil || p.autoOn || p.production || p.inscription) return null;
  if (obj.type.startsWith('brine_') &&
      (brineStage(char.brineStage) !== 3 || !surveyState(char.survey)?.endsWith('_done'))) return null;
  if (obj.type === 'rift_regulator' && char.riftCalibration !== 'completed') return null;
  const blueprint = classArmourBlueprint(row.cls, row.slot);
  if ((sanitizeGoods(char.goods)[blueprint] || 0) >= 1) return null;
  if (!grantGoods(game, p, blueprint)) return null;
  game.message(p, 'gain', name + ': archived class armour pattern recovered. The blueprint is retained after fabrication.');
  return { ok: true };
}
