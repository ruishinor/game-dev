// Public Workshop presentation for the owner's component diagram. Graph edges
// are read from the real recipes. No reward rates or server mutations here.
import {ITEMS} from '../../shared/content.js';
import {MATERIALS,RECIPES,previewProduction,canFabricateAt,missingRecipeKnowledge} from '../../shared/crafting.js';

export const ASSEMBLY_NODES=Object.freeze([
 Object.freeze({id:'phase_lens',label:'Phase lens',recipe:'shape_phase_lens',x:16,y:14}),
 Object.freeze({id:'pulse_cell',label:'Pulse cell',recipe:'prepare_pulse_cell',x:50,y:14}),
 Object.freeze({id:'pulse_housing',label:'Field housing',recipe:'machine_pulse_housing',x:84,y:14}),
 Object.freeze({id:'pulse_module',label:'Pulse module',recipe:'combine_optic_pulse_module',x:33,y:49}),
 Object.freeze({id:'relay_frame',label:'Relay frame',recipe:'machine_relay_frame',x:83,y:49}),
 Object.freeze({id:'patrol_arc_sidearm',label:'Patrol Arc Sidearm',recipe:'assemble_patrol_arc_sidearm',x:33,y:84}),
 Object.freeze({id:'relay_arc_carbine',label:'Relay Arc Carbine',recipe:'assemble_relay_arc_carbine',x:83,y:84}),
]);
export const ASSEMBLY_IDS=Object.freeze(ASSEMBLY_NODES.map(n=>n.id));
const LOOKUP=Object.freeze(Object.fromEntries(ASSEMBLY_NODES.map(n=>[n.id,n])));
export function assemblyEdges(){
 const edges=[];
 for(const to of ASSEMBLY_NODES){
  const recipe=RECIPES[to.recipe];
  if(!recipe||((recipe.output.material||recipe.output.item)!==to.id))continue;
  for(const [input,count] of Object.entries(recipe.inputs))
   if(Object.hasOwn(LOOKUP,input))edges.push(Object.freeze({from:input,to:to.id,count}));
 }
 return edges;
}
export function assemblyNodeState(sheet,site,id,buildLocked=false){
 if(!sheet||typeof id!=='string'||!Object.hasOwn(LOOKUP,id))return null;
 const node=LOOKUP[id],recipe=RECIPES[node.recipe],item=ITEMS[id],material=MATERIALS[id];
 if(!recipe||(!item&&!material))return null;
 const owned=item?Number(!!sheet.inventory?.includes(id)):Math.max(0,sheet.materials?.[id]||0);
 const knowledge=missingRecipeKnowledge(sheet,recipe);
 const siteReady=canFabricateAt(recipe,site);
 const preview=previewProduction(sheet,node.recipe,1);
 const reason=buildLocked?'Unavailable during combat or defeat.':knowledge||(!siteReady?'Approach the appropriate Workshop first.':!preview.ok?preview.reason:'');
 const missing=Object.entries(recipe.inputs).filter(([input,count])=>(sheet.materials?.[input]||0)<count)
  .map(([input,count])=>({id:input,have:sheet.materials?.[input]||0,need:count}));
 const status=owned?'Owned':knowledge?(recipe.blueprint&&sheet.goods?.[recipe.blueprint]!==1?'Blueprint locked':'Knowledge locked'):
  reason?(missing.length?'Components missing':'Not ready'):'Ready to fabricate';
 return {node,recipe,item:item||null,material:material||null,owned,known:!knowledge,siteReady,
  ready:!reason,reason,status,missing,blueprint:recipe.blueprint||null};
}
