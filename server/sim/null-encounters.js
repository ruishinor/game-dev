// Null Chamber mixed security/salvage incursions. Server only: all routes,
// affinities, attack profiles and reward-source flags are authoritative.
// Bounded circuits remain in the Null Chamber (-34 < z < -9), never crossing
// the Relay Workshop's partition. Two distinct mixed squads patrol indefinitely.
import { ENEMIES } from '../../shared/content.js';
import { RIFT_ANNEX } from '../../shared/world.js';
import { resetEnemy } from './ai.js';
import { ELITE } from './enemy-levels.js';

const A=RIFT_ANNEX;
const at=([x,z])=>({x:A.x+x,z});
const ROSTER=[
  // Existing gallery / relay population. Preserve routes and progression flags.
  ['skitter',-9,17,'Threshold Skitter',13,false],
  ['skitter',9,16,'Gallery Skitter',13,false],
  ['skitter',-3,14,'Gallery Burrower',13,true],
  ['sentinel',-6,2,'Displaced Sentinel',14,true],
  ['skitter',6,-3,'Phase Skitter',14,false],
  ['faultstalker',10,5,'Null Relay Stalker',14,true],
  ['skitter',-8,-5,'Relay Burrower',14,false],
  // The Warden remains the room's unique principal enemy and cache prerequisite.
  ['warden',-7,-25,'Null Chamber Warden',15,true],
  ['sentinel',8,-25,'Scrapyard Reclaimer',15,true],
  ['turret_drone',10,-17,'Scrapyard Sentry',15,false],
];
const CIRCUITS=[
  [[-7,-13],[-2,-13],[4,-15],[5,-19],[0,-21],[-6,-19]],
  [[7,-29],[2,-30],[-3,-28],[-5,-24],[0,-22],[7,-24]],
];
// Each patrol has three Severance soldiers and one scrapyard sentry.
// The first soldier on each route is an elite leader and an independent
// guaranteed blueprint source. Each recipient gets independently rolled loot.
const SQUADS=[
  [
    {type:'severance_soldier',name:'Null Breach Captain',affinity:'arc',weapon:'carbine',level:15,elite:true,blueprint:true},
    {type:'severance_soldier',name:'Null Kinetic Enforcer',affinity:'kinetic',weapon:'combat rod',level:14},
    {type:'severance_soldier',name:'Null Flux Skirmisher',affinity:'thermal',weapon:'combat rod',level:14},
    {type:'sentinel',name:'Scrapyard Arc Rifleman',affinity:'arc',weapon:'arc rifle',level:14},
  ],
  [
    {type:'severance_soldier',name:'Scrapyard Breaker Captain',affinity:'resonance',weapon:'carbine',level:15,elite:true,blueprint:true},
    {type:'severance_soldier',name:'Null Breach Rifleman',affinity:'arc',weapon:'carbine',level:14},
    {type:'severance_soldier',name:'Severance Kinetic Guard',affinity:'kinetic',weapon:'combat rod',level:15},
    {type:'sentinel',name:'Scrapyard Field Sentry',affinity:'resonance',weapon:'arc rifle',level:14},
  ],
];
const AFFINITY={
  kinetic:{attack:{range:2.6,interval:1700,dmg:13,kind:'melee'},specials:[{id:'kinetic_discharge',name:'Kinetic Discharge',cd:11500,first:4400,windup:1600,radius:3.5,dmg:29,at:'self'}]},
  thermal:{attack:{range:2.7,interval:1800,dmg:12,kind:'melee'},specials:[{id:'fault_shear',name:'Thermal Fault Shear',cd:11200,first:4800,windup:1850,radius:3.8,dmg:29,at:'target'}]},
  arc:{attack:{range:14,interval:2300,dmg:10,kind:'bolt'},specials:[{id:'arc_pulse',name:'Arc Pulse',cd:11500,first:4100,windup:1650,radius:4.2,dmg:27,at:'target'}]},
  resonance:{attack:{range:16,interval:2600,dmg:12,kind:'bolt'},specials:[{id:'resonance_burst',name:'Resonance Burst',cd:13000,first:6200,windup:1350,radius:5,dmg:16,at:'target'}]},
};
function spawn(game,{type,name,level,dx,z,elite=false,route=null,squad=null,rank=0,affinity=null,weapon=null,blueprint=false,heroic}){
 const def=ENEMIES[type],home=route?route[rank%route.length]:{x:A.x+dx,z};
 const e={id:game.nextId++,kind:'enemy',type,name,level:heroic?level:def.level,radius:def.radius,
  home:{...home},route:route?route.map(p=>({...p})):null,patrol:!!route,form:null,metaVer:1,
  annexEncounter:true,...(heroic?{nullAnnex:true}:{}),
  ...(heroic&&elite&&type!=='warden'?{elite:{hp:ELITE.hp,dmg:ELITE.dmg}}:{}),
  ...(blueprint?{nullBlueprintSource:true}:{}),
  ...(affinity?{affinity,weapon,vx:'null_'+affinity,
    combatDef:{...def,attack:AFFINITY[affinity].attack,specials:AFFINITY[affinity].specials},
    specials:AFFINITY[affinity].specials.map((s,i)=>({...s,first:s.first+rank*650+i*250}))}:{}),
  ...(squad!==null?{nullSquad:squad}:{}),
 };
 if(route){
  // Stagger positions along the circuit, preserving each squad's bounded loop.
  const rotated=route.slice(rank%route.length).concat(route.slice(0,rank%route.length));
  e.home={...rotated[0]};e.route=rotated;
 }
 resetEnemy(game,e);game.enemies.push(e);game.ents.set(e.id,e);return e;
}
export function spawnNullEncounters(game,heroic=true){
 const out=[];
 for(const [type,dx,z,name,level,elite] of ROSTER)
  out.push(spawn(game,{type,dx,z,name,level,elite,heroic}));
 if(heroic)for(let group=0;group<SQUADS.length;group++){
  const route=CIRCUITS[group].map(at);
  for(let rank=0;rank<SQUADS[group].length;rank++)
   out.push(spawn(game,{...SQUADS[group][rank],route,squad:group,rank,heroic}));
 }
 return out;
}
export const NULL_PATROL_GROUPS=2;
export const NULL_BLUEPRINT_SOURCES=2;
