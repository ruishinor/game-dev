// Allied Expedition Outpost security. Server authority only.
// NPCs scan within a hard 25m aggro radius and engage actual hostile enemies,
// never players, pets, vendors or allied NPCs. They remain stationed at posts;
// all damage and event replication use the existing combat pipeline.
import { dist, hasLineOfSight, sameTravelRegion } from '../../shared/world.js';
import { dealDamage } from './combat.js';

export const OUTPOST_AGGRO_RADIUS=25;
const PROFILE=Object.freeze({
 arc:       Object.freeze({kind:'bolt',ability:'auto',base:40,period:1150}),
 kinetic:   Object.freeze({kind:'bolt',ability:'auto',base:52,period:1450}),
 thermal:   Object.freeze({kind:'bolt',ability:'auto',base:44,period:1250}),
 resonance: Object.freeze({kind:'bolt',ability:'auto',base:48,period:1320}),
});

function nearestThreat(game,guard){
 let chosen=null,best=OUTPOST_AGGRO_RADIUS+1;
 for(const enemy of game.enemies){
  if(enemy.state==='dead'||enemy.state==='evade'||!sameTravelRegion(guard,enemy))continue;
  const d=dist(guard,enemy);
  if(d>=best||d>OUTPOST_AGGRO_RADIUS||!hasLineOfSight(guard,enemy))continue;
  chosen=enemy;best=d;
 }
 return chosen;
}

export function tickOutpostDefense(game){
 if(!game.expanseOpened)return;
 for(const guard of game.objects){
  if(guard.outpostDefender!==true)continue;
  const target=nearestThreat(game,guard);
  guard.defenseTarget=target?.id||0;
  if(!target||game.time<guard.nextDefenseAt)continue;
  const profile=PROFILE[guard.affinity]||PROFILE.arc;
  const officer=guard.type==='outpost_commander';
  guard.nextDefenseAt=game.time+(officer?Math.round(profile.period*.75):profile.period);
  // An NPC victory deliberately carries ZERO player credit. Do not use
  // player threat as the credit basis for this final blow.
  dealDamage(game,guard,target,officer?profile.base*1.35:profile.base,
   profile.ability,{flat:true,kind:profile.kind});
 }
}
