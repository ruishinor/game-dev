// Fabrication is deterministic, skill-gated and server-authoritative.
// Existing equipment IDs remain stable; counted materials are independent of
// the unique owned-item list. Client preview never mutates a character.
import { ITEMS, SKILL_NAMES, ATTUNEMENT_NAMES } from './content.js';
import { computeSkills } from './build.js';
import { GOODS,GOODS_CAP,sanitizeGoods } from './goods.js';
import {recoveryRank} from './recovery.js';
import { classArmourRecipes } from './class-armour.js';
import { surveyState } from './survey.js';

export const MATERIAL_CAP=99;
export const MATERIALS={
  pulse_housing:{name:'Pulse containment housing',desc:'A standardized insulated case for modular field emitters.',source:'Sanctum Quartermaster'},
  vector_matrix:{name:'Recovered vector matrix',desc:'A dismantled sentinel control grid. Its original device is permanently consumed during extraction.',source:'Rogue Sentinel field vector array; Engineering fabrication'},
  phase_lens:{name:'Field phase lens',desc:'An aligned optical substrate shaped from loose sinter and alloy, used in modular pulse assemblies.',source:'Sanctum Engineering Workshop'},
  relay_frame:{name:'Extended relay frame',desc:'A dedicated longarm chassis fabricated from a field housing and alloy; consumed when assembling a carbine.',source:'Sanctum Engineering Workshop'},
  pulse_cell:{name:'Dormant pulse cell',desc:'A machined energy reservoir prepared from conductive fibres.',source:'Engineering fabrication'},
  pulse_module:{name:'Assembled pulse module',desc:'An aligned vector matrix and cell, ready for final weapon fabrication.',source:'Engineering assembly'},
  sinter_flake:{name:'Loose sinter flake',desc:'Conductive surface shedding recovered without disturbing living mineral colonies or grazers.',source:'Loose deposits at Sinter Flats'},
  mire_fibre:{name:'Mire fibre',desc:'Conductive organic strands harvested from Mire Skitters.',source:'Mire Skitter'},
  sentinel_alloy:{name:'Sentinel alloy',desc:'Recoverable actuator alloy and contact assemblies.',source:'Rogue Sentinel'},
  resonance_fragment:{name:'Resonance fragment',desc:'An inert resonance-bearing fragment recovered from the Vault Warden or field calibration.',source:'Vault Warden; Phase Scar calibration'},
  kinetic_coupler:{name:'Kinetic coupler',desc:'Machined interface for controlled Charge transfer.',source:'Engineering fabrication'},
  fen_lantern_membrane:{name:'Lantern membrane',desc:'Iridescent light-bearing membrane recovered from Fen Lanterns; modeled after the alien plant and wetland creature donors.',source:'Lumenfen Fen Lantern'},
  bog_chitin:{name:'Bog chitin',desc:'Layered plating from the six-limbed Bog Stalker; retains its moisture-resistant structure.',source:'Lumenfen Bog Stalker'},
  rootglass_fibre:{name:'Rootglass fibre',desc:'Sinuous mineralized filament integrated into Lumenfen root systems.',source:'Lumenfen wildlife, especially during monsoon'},
  monsoon_silt:{name:'Monsoon conductive silt',desc:'Micaceous residue concentrated in Lumenfen during monsoon flooding.',source:'Lumenfen monsoon wildlife salvage'},
  culture_matrix:{name:'Culture matrix',desc:'A stabilized living scaffold for restorative signal transfer.',source:'Research fabrication'},
};
export const RECIPES={
  field_emitter:{name:'Assemble field pulse emitter',discipline:'Engineering',inputs:{mire_fibre:1,sentinel_alloy:1},output:{item:'field_emitter'}},
  // Independent component graph for the Patrol sidearm and Relay Arc Carbine.
  machine_pulse_housing:{name:'Fabricate field housing',discipline:'Engineering',inputs:{sentinel_alloy:2},output:{material:'pulse_housing',count:1}},
  shape_phase_lens:{name:'Shape field phase lens',discipline:'Engineering',inputs:{sinter_flake:1,sentinel_alloy:1},output:{material:'phase_lens',count:1}},
  combine_optic_pulse_module:{name:'Align phase lens and pulse cell',discipline:'Engineering',kind:'assembly',inputs:{phase_lens:1,pulse_cell:1},output:{material:'pulse_module',count:1}},
  machine_relay_frame:{name:'Fabricate relay frame',discipline:'Engineering',inputs:{pulse_housing:1,sentinel_alloy:2},output:{material:'relay_frame',count:1}},
  assemble_patrol_arc_sidearm:{name:'Assemble Patrol Arc Sidearm',discipline:'Engineering',kind:'assembly',inputs:{pulse_module:1,pulse_housing:1},output:{item:'patrol_arc_sidearm'}},
  assemble_relay_arc_carbine:{name:'Assemble Relay Arc Carbine',discipline:'Engineering',kind:'assembly',blueprint:'blueprint_relay_arc_carbine',site:'brine_engineering',attune:'resonance',requires:{instrumentation:13},inputs:{pulse_module:1,relay_frame:1,resonance_fragment:1},output:{item:'relay_arc_carbine'}},
  // Optional modular route to the existing QL5 weapon; the classic upgrade path and Longpoint are unchanged.
  extract_vector_matrix:{name:'Recover sentinel vector matrix',discipline:'Engineering',kind:'assembly',inputs:{sentinel_alloy:1},targets:['field_vector_array'],output:{material:'vector_matrix',count:1}},
  prepare_pulse_cell:{name:'Prepare dormant pulse cell',discipline:'Engineering',inputs:{mire_fibre:2},output:{material:'pulse_cell',count:1}},
  combine_pulse_module:{name:'Combine vector matrix and pulse cell',discipline:'Engineering',kind:'assembly',inputs:{vector_matrix:1,pulse_cell:1},output:{material:'pulse_module',count:1}},
  assemble_dense_core_modular:{name:'Assemble Dense Pulse Core from modules',discipline:'Engineering',kind:'assembly',site:'brine_engineering',attune:'resonance',requires:{kinetics:13},inputs:{pulse_housing:1,pulse_module:1,kinetic_coupler:2,resonance_fragment:1},output:{item:'dense_pulse_core'}},
  field_chest:{name:'Assemble field composite vest',discipline:'Engineering',inputs:{mire_fibre:2,sentinel_alloy:2},output:{item:'field_chest'}},
  reinforced_chest:{name:'Reinforce relay vest',discipline:'Engineering',kind:'upgrade',blueprint:'blueprint_relay_vest',inputs:{sentinel_alloy:3,mire_fibre:2},target:'field_chest',output:{item:'reinforced_chest'}},
  resonant_chest:{name:'Line vest with resonance',discipline:'Engineering',kind:'upgrade',blueprint:'blueprint_resonant_vest',site:'brine_engineering',attune:'resonance',inputs:{resonance_fragment:1,kinetic_coupler:1},target:'reinforced_chest',output:{item:'resonant_chest'}},
  tune_emitter:{name:'Tune field pulse emitter',discipline:'Engineering',kind:'upgrade',inputs:{mire_fibre:2,sentinel_alloy:3},target:'field_emitter',output:{item:'tuned_emitter'}},
  dense_pulse_core:{name:'Rebuild Dense Pulse Core',discipline:'Engineering',site:'brine_engineering',kind:'upgrade',attune:'resonance',requires:{kinetics:13},inputs:{kinetic_coupler:2,resonance_fragment:1},target:'tuned_emitter',output:{item:'dense_pulse_core'}},
  longpoint_emitter:{name:'Rebuild Longpoint Emitter',discipline:'Engineering',site:'brine_engineering',kind:'upgrade',attune:'resonance',requires:{instrumentation:13},inputs:{resonance_fragment:1,sentinel_alloy:4,mire_fibre:2},target:'tuned_emitter',output:{item:'longpoint_emitter'}},
  survey_strider_link:{name:'Assemble Survey Strider Link',discipline:'Engineering',site:'brine_engineering',cls:'surveyor',attune:'resonance',requires:{instrumentation:13},inputs:{sentinel_alloy:4,mire_fibre:2,resonance_fragment:1},output:{item:'survey_strider_link'}},
  coupler:{name:'Assemble kinetic coupler',discipline:'Engineering',requires:{kinetics:13},inputs:{sentinel_alloy:2,mire_fibre:1},output:{material:'kinetic_coupler',count:1}},
  field_maintenance_kit:{name:'Assemble field maintenance kits',discipline:'Engineering',inputs:{mire_fibre:1,sentinel_alloy:1},output:{goods:'field_maintenance_kit',count:2}},
  recovery_maintenance:{name:'Recondition maintenance cassettes',discipline:'Engineering',recoveryRank:2,inputs:{sinter_flake:2,sentinel_alloy:1},output:{goods:'field_maintenance_kit',count:2}},
  matrix:{name:'Grow culture matrix',discipline:'Research',requires:{biotech:13},inputs:{mire_fibre:2,sentinel_alloy:1},output:{material:'culture_matrix',count:1}},
  calibrate_servo:{name:'Calibrate servo harness',discipline:'Engineering',kind:'upgrade',requires:{kinetics:11},inputs:{kinetic_coupler:1,sentinel_alloy:1},target:'servo_harness',output:{item:'calibrated_servo'}},
  cultivate_focus:{name:'Cultivate Sporeglass focus',discipline:'Research',kind:'upgrade',requires:{biotech:11},inputs:{culture_matrix:1,mire_fibre:1},target:'sporeglass_focus',output:{item:'cultured_focus'}},
  restore_servo:{name:'Remove servo calibration',discipline:'Engineering',kind:'restore',inputs:{},target:'calibrated_servo',output:{item:'servo_harness'}},
  restore_focus:{name:'Remove focus culture',discipline:'Research',kind:'restore',inputs:{},target:'cultured_focus',output:{item:'sporeglass_focus'}},
  resonance_buffer:{name:'Assemble resonance buffer',discipline:'Engineering',attune:'resonance',inputs:{resonance_fragment:1,sentinel_alloy:2,mire_fibre:2},output:{item:'resonance_buffer'}},
  bloom_relay:{name:'Fuse Bloom Relay',discipline:'Research',site:'brine_research',cls:'symbiotech',kind:'fusion',attune:'resonance',requires:{biotech:13},inputs:{culture_matrix:1,resonance_fragment:1},targets:['conductive_membrane','sinter_laminate'],output:{item:'bloom_relay'}},
  // Rare class armour collection: one blueprint-gated recipe per piece.
  ...classArmourRecipes(Object.fromEntries(Object.entries(ITEMS).map(([id,it])=>[id,it.name]))),
  aegis_rectifier:{name:'Fuse Aegis Rectifier',discipline:'Engineering',site:'brine_engineering',cls:'vanguard',kind:'fusion',attune:'resonance',requires:{kinetics:13},inputs:{kinetic_coupler:1},targets:['field_vector_array','conductive_membrane'],output:{item:'aegis_rectifier'}},
};

export function sanitizeMaterials(raw){
  const out={};
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return out;
  for(const id of Object.keys(MATERIALS)){
    if(Object.hasOwn(raw,id)&&Number.isSafeInteger(raw[id])&&raw[id]>0)out[id]=Math.min(MATERIAL_CAP,raw[id]);
  }
  return out;
}

/** Validate and calculate the whole result without modifying any input. */
export function previewRecipe(char,id){
  const fail=reason=>({ok:false,reason});
  if(typeof id!=='string'||!Object.hasOwn(RECIPES,id))return fail('Unknown recipe.');
  const recipe=RECIPES[id];
  if(recipe.blueprint&&sanitizeGoods(char.goods)[recipe.blueprint]!==1)return fail('Recover the required blueprint first.');
  if(recipe.recoveryRank&&recoveryRank(char.recoverySamples)<recipe.recoveryRank)return fail('Requires Field Recovery rank '+recipe.recoveryRank+'.');
  const inventory=[...char.inventory];
  const materials=sanitizeMaterials(char.materials);
  const skills=computeSkills(char.cls,char.level,char.equipped);
  if(recipe.attune&&!char.attunements.includes(recipe.attune))return fail('Requires Attunement: '+ATTUNEMENT_NAMES[recipe.attune]+'.');
  for(const [skill,min] of Object.entries(recipe.requires||{})){
    if((skills[skill]||0)<min)return fail('Requires '+SKILL_NAMES[skill]+' '+min+' (you have '+(skills[skill]||0)+').');
  }
  if(recipe.cls&&recipe.cls!==char.cls)return fail('This recipe is not available to your profession.');
  const targets=recipe.targets??(recipe.target?[recipe.target]:[]);
  if(!Array.isArray(targets)||new Set(targets).size!==targets.length||targets.some(id=>!Object.hasOwn(ITEMS,id)))return fail('Invalid fusion inputs.');
  for(const target of targets){
    if(!inventory.includes(target))return fail('Missing '+ITEMS[target].name+'.');
    if(Object.values(char.equipped).includes(target))return fail('Unequip '+ITEMS[target].name+' first. Resolve equipment dependencies if required.');
  }
  const output=recipe.output;
  if(output.item==='survey_strider_link'&&char.striderLearned===true)return fail('Survey Strider deployment already learned.');
  if(output.item&&inventory.includes(output.item))return fail('You already own '+ITEMS[output.item].name+'.');
  for(const [material,count] of Object.entries(recipe.inputs)){
    if((materials[material]||0)<count)return fail('Needs '+count+' × '+MATERIALS[material].name+'.');
    materials[material]-=count;
    if(!materials[material])delete materials[material];
  }
  if(output.material){
    const count=(materials[output.material]||0)+output.count;
    if(count>MATERIAL_CAP)return fail('Material storage is full for '+MATERIALS[output.material].name+'.');
    materials[output.material]=count;
  }
  for(const target of targets)inventory.splice(inventory.indexOf(target),1);
  if(output.item)inventory.push(output.item);
  if(output.goods){
    const goods=sanitizeGoods(char.goods),count=(goods[output.goods]||0)+output.count;
    if(count>GOODS_CAP)return fail('Utility storage is full for '+GOODS[output.goods].name+'.');
    goods[output.goods]=count;
    return {ok:true,inventory,materials,goods};
  }
  return {ok:true,inventory,materials};
}

export function canFabricateAt(recipe,site){return !!recipe && (site==='sanctum' ? !recipe.site : recipe.site ? recipe.site===site : (site==='brine_engineering'&&recipe.discipline==='Engineering')||(site==='brine_research'&&recipe.discipline==='Research'));}

export function productionQuantities(recipe) {
  const units = recipe.output.count || 1;
  // A unique equipment donor cannot supply five or ten extraction cycles.
  return recipe.output.item || recipe.target || recipe.targets?.length ? [1] : [units, 5, 10].filter((count, index, all) => count % units === 0 && all.indexOf(count) === index);
}

export function productionTime(recipe) {
  // Keep the established Longpoint progression and quick consumable service.
  // Sustained equipment work and component fabrication expose the authored
  // preparation, working and inspection stages at a useful time scale.
  if (recipe.output.item === 'longpoint_emitter') return 1900;
  if (recipe.output.goods) return recipe.discipline === 'Research' ? 1450 : 1100;
  if (recipe.kind === 'fusion') return 9000;
  if (recipe.kind === 'upgrade') return 6500;
  if (recipe.kind === 'restore') return 4000;
  if (recipe.output.material) return recipe.discipline === 'Research' ? 4000 : 3000;
  if (recipe.discipline === 'Research') return 5500;
  if (recipe.kind === 'assembly') return 5000;
  return 4000;
}

// The consequence is part of the player-facing recipe quote.
export function productionRisk(id) {
  if (id === 'dense_pulse_core') return 'kinetic_coupler';
  if (id === 'longpoint_emitter') return 'sentinel_alloy';
  return null;
}

export function missingRecipeKnowledge(char, recipe) {
  if (recipe.blueprint && sanitizeGoods(char.goods)[recipe.blueprint] !== 1) return 'Recover the required blueprint first.';
  if (recipe.recoveryRank && recoveryRank(char.recoverySamples) < recipe.recoveryRank) {
    return `Requires Field Recovery rank ${recipe.recoveryRank}.`;
  }
  if (recipe.site?.startsWith('brine_') && (char.brineStage !== 3 || !surveyState(char.survey)?.endsWith('_done'))) {
    return 'Commission Brineworks to learn this recipe.';
  }
  return null;
}

export function previewProduction(char, id, quantity) {
  if (!Object.hasOwn(RECIPES, id)) return { ok: false, reason: 'Unknown recipe.' };
  const recipe = RECIPES[id];
  const knowledge = missingRecipeKnowledge(char, recipe);
  if (knowledge) return { ok: false, reason: knowledge };
  if (!productionQuantities(recipe).includes(quantity)) return { ok: false, reason: 'This quantity is unavailable.' };
  const cycles = quantity / (recipe.output.count || 1);
  let next = char;
  for (let i = 0; i < cycles; i++) {
    const step = previewRecipe(next, id);
    if (!step.ok) return step;
    next = { ...next, ...step };
  }
  return { ok: true, cycles };
}
