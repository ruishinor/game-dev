import { randomInt } from 'node:crypto';
import { MATERIALS, RECIPES, canFabricateAt, previewRecipe, previewProduction, productionTime, productionRisk } from '../../shared/crafting.js';
import { workshopSite } from '../../shared/survey.js';
import { craftRecipe } from './progress.js';
import {disciplineDuration} from '../../shared/crafting-disciplines.js';

const fail = reason => ({ ok: false, reason });

function eligibility(game, p) {
  if (p.dead) return 'You are defeated.';
  if (p.combatUntil > game.time || p.autoOn) return 'Disengage before starting production.';
  if (p.inscription) return 'Finish your inscription first.';
  return null;
}

function notify(game, p, job, phase) {
  game.emitWorldEvent({ e: 'production', s: p.id, phase, method: job.method,
    ...(phase === 'begin' && job.complete === 0 ? { first: true } : {}) });
}

export function beginProduction(game, p, id, quantity, rev) {
  if (p.production) return fail('You already have a production run underway.');
  if (rev !== p.inventoryRev) return fail('Inventory changed. Review the recipe and try again.');
  const unavailable = eligibility(game, p);
  if (unavailable) return fail(unavailable);
  if (!Object.hasOwn(RECIPES, id)) return fail('Unknown recipe.');
  const recipe = RECIPES[id], site = workshopSite(p);
  if (!canFabricateAt(recipe, site)) return fail('Approach the appropriate Workshop first.');
  const preview = previewProduction(p.char, id, quantity);
  if (!preview.ok) return preview;
  // Lock the duration for the whole batch at its accepted starting level.
  const duration = disciplineDuration(productionTime(recipe),p.char.craftingDisciplines,recipe.discipline);
  const method = recipe.kind === 'upgrade' || recipe.kind === 'restore' ? 'upgrade' :
    recipe.discipline === 'Research' ? 'culture' : 'assemble';
  p.production = { id, site, method, duration, quantity, cycles: preview.cycles, complete: 0, until: game.time + duration };
  notify(game, p, p.production, 'begin');
  return { ok: true };
}

export function productionState(game, p) {
  const job = p.production;
  return job ? { id: job.id, quantity: job.quantity, cycles: job.cycles, complete: job.complete,
    total: job.duration, ms: Math.max(0, job.until - game.time) } : null;
}

// Public presentation only: recipe identity and inputs stay private.
export function productionVisualState(game,p){const j=p.production;if(!j)return null;return {m:j.method,site:j.site,q:Math.round(Math.min(1,Math.max(0,1-(j.until-game.time)/j.duration))*100)/100};}

export function stopProduction(game, p, reason = 'Production cancelled.') {
  const job = p.production;
  if (!job) return;
  p.production = null;
  notify(game, p, job, 'stop');
  const made = job.complete * (RECIPES[job.id].output.count || 1);
  game.message(p, 'warn', `${reason} Produced ${made} of ${job.quantity}. Unfinished work consumed no materials.`);
}

export function tickProduction(game, p, roll = game.productionRoll ?? (() => randomInt(100))) {
  const job = p.production;
  if (!job) return;
  if (eligibility(game, p)) return stopProduction(game, p, 'Production interrupted.');
  if (workshopSite(p) !== job.site) return stopProduction(game, p, 'You moved away from the Workshop.');
  if (game.time < job.until) return;
  // Each finished cycle commits its inputs and output together. An inventory
  // change during a run can invalidate a future cycle without losing inputs.
  const recipe = RECIPES[job.id];
  const risk = productionRisk(job.id);
  if (risk) {
    const result = previewRecipe(p.char, job.id);
    if (!result.ok) return stopProduction(game, p, result.reason);
    const [skill, required] = Object.entries(recipe.requires)[0];
    const failurePercent = Math.max(5, 22 - (p.stats.skills[skill] - required) * 4);
    if (roll() < failurePercent) {
      const materials = { ...p.char.materials };
      if (--materials[risk] === 0) delete materials[risk];
      p.char.materials = materials;
      game.economy?.observe('materials_spent',p,1,risk);
      game.markDirty(p);
      p.production = null;
      notify(game, p, job, 'stop');
      game.message(p, 'warn', `${recipe.name} failed. The emitter was preserved. Lost 1 ${MATERIALS[risk].name}.`);
      return;
    }
  }
  const committed = craftRecipe(game, p, job.id, p.utilityRev, { quiet: true });
  if (!committed.ok) return stopProduction(game, p, committed.reason);
  if (++job.complete < job.cycles) {
    job.until = game.time + job.duration;
    notify(game, p, job, 'begin');
    return;
  }
  p.production = null;
  notify(game, p, job, 'complete');
  game.message(p, 'production', `${recipe.name} complete · ${job.quantity} produced.`);
}
