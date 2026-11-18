// Codex entries use the actual definitions shipped with this vertical slice.
// No invented loot, faction membership, weapon slots or progression.
import { ITEMS, SLOT_NAMES, ENEMIES, COMPANIONS, CLASSES, ABILITIES, SKILL_NAMES } from '../../shared/content.js';
import { WORLD, ZONES } from '../../shared/world.js';
import { MATERIALS, RECIPES } from '../../shared/crafting.js';
import { GOODS } from '../../shared/goods.js';

const locations = {
  sanctum: 'A protected enclave within the Reach. Travellers recover here; the Archivist provides guidance.',
  sporefield: 'West of the Sanctum. Mire Skitters inhabit the field; the first directive sends travellers here.',
  relay: 'East of the Sanctum. Rogue Sentinels defend the relay and deploy Arc Pulse.',
  vault: 'The monolith ring to the north. The Vault Warden guards this site.',
  obelisk: 'A rock hollow to the north-west. Interact with the Listening Stone to gain Resonance.',
};
export const GROUPS = ['Locations', 'Items & Gear', 'Weapons', 'Creatures', 'Factions', 'Lore', 'Skills & Abilities', 'Fabrication'];
export const ENTRIES = [
  ...Object.entries(ZONES).map(([id, zone]) => ({ id, group: 'Locations', name: zone.name, type: 'Location', desc: locations[id], facts: ['Region: ' + WORLD.name], zone: id })),
  ...Object.entries(ITEMS).map(([id, item]) => ({ id, group: item.slot==='weapon'?'Weapons':'Items & Gear', name: item.name, type: SLOT_NAMES[item.slot], desc: item.desc, item: id, facts: [
    ...(item.ql?['Quality level: '+item.ql,'Repairable: condition scales the weapon bonus']:[]),
    ...(item.cls ? ['Class: ' + CLASSES[item.cls].name] : []),
    ...Object.entries(item.req?.skills || {}).map(([k,v]) => (SKILL_NAMES[k] || k) + ' required: ' + v),
    ...(item.req?.attune ? ['Requires Resonance'] : []),
  ] })),
  ...Object.entries(GOODS).map(([id,g])=>({id,group:'Items & Gear',name:g.name,type:'Trade salvage',desc:g.desc,item:id,facts:['Stackable · not equippable']})),
  ...Object.entries(MATERIALS).map(([id,m])=>({id,group:'Fabrication',name:m.name,type:'Material',desc:m.desc,facts:['Source: '+m.source]})),
  ...Object.entries(RECIPES).map(([id,r])=>({id:'recipe_'+id,group:'Fabrication',name:r.name,type:r.discipline+' recipe',desc:'Fabricate at the Lattice Sanctum workshop.',facts:[...Object.entries(r.inputs).map(([key,n])=>n+' × '+MATERIALS[key].name),...(r.target?['Consumes carried '+ITEMS[r.target].name]:[]),'Result: '+(r.output.item?ITEMS[r.output.item].name:MATERIALS[r.output.material].name)]})),
  ...Object.entries(ENEMIES).map(([id, e]) => ({
    id, group: 'Creatures', name: e.name, type: e.elite ? 'Elite hostile' : 'Hostile',
    desc: id === 'skitter' ? 'A hostile creature encountered in the Sporefield. Attacks in melee and can draw nearby skitters into combat.' :
      id === 'sentinel' ? 'A ranged enemy at the Derelict Relay. Its Arc Pulse marks the ground before it strikes.' :
      'The elite guardian of the Resonance Vault. Its attacks threaten nearby travellers; its health scales with the number engaged.',
    meta: { k: 'e', c: id }, facts: [
      'Level: ' + e.level, 'Base health: ' + e.hp,
      'Attack: ' + (e.attack.kind === 'bolt' ? 'Ranged' : 'Melee') + ' · ' + e.attack.range + 'm',
      'Experience: ' + e.xp,
      ...((e.specials || []).map(s => s.name + ' · ' + s.windup / 1000 + 's wind-up')),
      'Recovery: inspect eligible remains for personal salvage.',
    ],
  })),
  ...Object.entries(COMPANIONS).map(([id,c])=>({id,group:'Creatures',name:c.name,type:'Companion',
    desc:'A bioengineered symbiote bonded to a Conductor. Its behavior depends on the selected companion command.',
    meta:{ k:'c', c:id }, facts: Object.values(c.modes).map(m=>m.name+': '+m.desc)})),
  {id:'quartermaster',group:'Lore',name:'Sanctum Quartermaster',type:'NPC',desc:'A supply clerk at the Lattice Sanctum. Exchanges recovered trade salvage for credits and stocks fabrication materials.',meta:{k:'o',c:'quartermaster'},facts:['Location: Lattice Sanctum','Interaction: Buy and sell salvage']},
  {id:'archivist',group:'Lore',name:'Archivist Venn',type:'NPC',desc:'An archivist at the Lattice Sanctum who guides travellers through their directives.',meta:{k:'o',c:'archivist'},facts:['Location: Lattice Sanctum','Interaction: Talk for current directive guidance']},
  {id:'resonance',group:'Lore',name:'Resonance',type:'Attunement',desc:'Acquired by interacting with the Listening Stone. Resonance unlocks glyphs that depend on it; it does not directly increase Power.',facts:['Source: The Listening Stone']},
  {id:'kinetics',group:'Skills & Abilities',name:'Kinetics',type:'Skill',desc:'The Vanguard primary skill. Each point above 10 contributes two percentage points of Power. It also satisfies Kinetics equipment requirements. It does not modify movement speed.',facts:[]},
  {id:'instrumentation',group:'Skills & Abilities',name:'Instrumentation',type:'Skill',desc:'Surveyor primary skill. Raises Power and meets field instrument requirements.',facts:[]},
  {id:'biotech',group:'Skills & Abilities',name:'Biotech',type:'Skill',desc:'The Conductor primary skill. Each point above 10 contributes two percentage points of Power and helps meet Biotech equipment requirements.',facts:[]},
  ...Object.entries(ABILITIES).map(([id,a])=>({id,group:'Skills & Abilities',name:a.name,type:'Ability',desc:a.desc,ability:id,facts:['Cooldown: '+a.cd/1000+'s',...(a.range?['Range: '+a.range+'m']:[])]})),
];
