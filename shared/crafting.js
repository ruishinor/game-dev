// Fabrication is deterministic, skill-gated and server-authoritative.
// Existing equipment IDs remain stable; counted materials are independent of
// the unique owned-item list. Client preview never mutates a character.
import { ITEMS, SKILL_NAMES, ATTUNEMENT_NAMES } from './content.js';
import { computeSkills } from './build.js';

export const MATERIAL_CAP=99;
export const MATERIALS={
  mire_fibre:{name:'Mire fibre',desc:'Conductive organic strands harvested from Mire Skitters.',source:'Mire Skitter'},
  sentinel_alloy:{name:'Sentinel alloy',desc:'Recoverable actuator alloy and contact assemblies.',source:'Rogue Sentinel'},
  resonance_fragment:{name:'Resonance fragment',desc:'An inert fragment recovered from the Vault Warden.',source:'Vault Warden'},
  kinetic_coupler:{name:'Kinetic coupler',desc:'Machined interface for controlled Charge transfer.',source:'Engineering fabrication'},
  culture_matrix:{name:'Culture matrix',desc:'A stabilized living scaffold for restorative signal transfer.',source:'Research fabrication'},
};
export const SALVAGE={skitter:'mire_fibre',sentinel:'sentinel_alloy',warden:'resonance_fragment'};
export const RECIPES={
  coupler:{name:'Assemble kinetic coupler',discipline:'Engineering',requires:{kinetics:13},inputs:{sentinel_alloy:2,mire_fibre:1},output:{material:'kinetic_coupler',count:1}},
  matrix:{name:'Grow culture matrix',discipline:'Research',requires:{biotech:13},inputs:{mire_fibre:2,sentinel_alloy:1},output:{material:'culture_matrix',count:1}},
  calibrate_servo:{name:'Calibrate servo harness',discipline:'Engineering',kind:'upgrade',requires:{kinetics:11},inputs:{kinetic_coupler:1,sentinel_alloy:1},target:'servo_harness',output:{item:'calibrated_servo'}},
  cultivate_focus:{name:'Cultivate Sporeglass focus',discipline:'Research',kind:'upgrade',requires:{biotech:11},inputs:{culture_matrix:1,mire_fibre:1},target:'sporeglass_focus',output:{item:'cultured_focus'}},
  restore_servo:{name:'Remove servo calibration',discipline:'Engineering',kind:'restore',inputs:{},target:'calibrated_servo',output:{item:'servo_harness'}},
  restore_focus:{name:'Remove focus culture',discipline:'Research',kind:'restore',inputs:{},target:'cultured_focus',output:{item:'sporeglass_focus'}},
  resonance_buffer:{name:'Assemble resonance buffer',discipline:'Engineering',attune:'resonance',inputs:{resonance_fragment:1,sentinel_alloy:2,mire_fibre:2},output:{item:'resonance_buffer'}},
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
  const inventory=[...char.inventory];
  const materials=sanitizeMaterials(char.materials);
  const skills=computeSkills(char.cls,char.level,char.equipped);
  if(recipe.attune&&!char.attunements.includes(recipe.attune))return fail('Requires Attunement: '+ATTUNEMENT_NAMES[recipe.attune]+'.');
  for(const [skill,min] of Object.entries(recipe.requires||{})){
    if((skills[skill]||0)<min)return fail('Requires '+SKILL_NAMES[skill]+' '+min+' (you have '+(skills[skill]||0)+').');
  }
  if(recipe.target){
    if(!inventory.includes(recipe.target))return fail('Missing '+ITEMS[recipe.target].name+'.');
    if(Object.values(char.equipped).includes(recipe.target))return fail('Unequip '+ITEMS[recipe.target].name+' first. Resolve equipment dependencies if required.');
  }
  const output=recipe.output;
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
  if(recipe.target)inventory.splice(inventory.indexOf(recipe.target),1);
  if(output.item)inventory.push(output.item);
  return {ok:true,inventory,materials};
}
