// Separate server-authoritative region access and encounters.
import {LUMENFEN,inLumenfen} from '../../shared/lumenfen.js';
import {travelRegionAt,hasLineOfSight,dist,resolveCollisions} from '../../shared/world.js';
import {ENEMIES} from '../../shared/content.js';
import {resetEnemy} from './ai.js';
import {regionEntryDenial,ELITE} from './enemy-levels.js';
const deny=reason=>({ok:false,reason});
export function spawnLumenfenWildlife(game){
 if(game.lumenfenOpened)return [];
 game.lumenfenOpened=true;
 const P=LUMENFEN,group=[];
 const placements=[
  ['fen_lantern',-97,-82,7],['fen_lantern',-27,34,7],['fen_lantern',58,22,7],['fen_lantern',97,103,7],
  ['fen_stalker',-73,-26,8],['fen_stalker',43,-72,8],['fen_stalker',-42,81,9],
  ['fen_stalker',88,18,9],['fen_stalker',0,105,10],['fen_stalker',-90,112,11,true],
 ];
 for(const [type,u,v,level,elite] of placements){
  const def=ENEMIES[type],x=P.x+u,z=P.z+v;
  const home=resolveCollisions({x,z},def.radius);
  const e={id:game.nextId++,kind:'enemy',type,name:def.name,level,radius:def.radius,
    home,route:null,form:null,metaVer:1,lumenfenWildlife:true};
  if(elite)e.elite={hp:ELITE.hp,dmg:ELITE.dmg};
  resetEnemy(game,e);game.enemies.push(e);game.ents.set(e.id,e);group.push(e);
 }
 return group;
}
export function travelLumenfen(game,p,obj){
 if(!['lumenfen_entry','lumenfen_return','lumenfen_spring','lumenfen_crown'].includes(obj?.type))return deny('Unknown threshold.');
 if(game.objects.find(o=>o.type===obj.type)!==obj)return deny('Unknown threshold.');
 if(p.dead)return deny('You are defeated.');
 if(dist(p,obj)>5||!hasLineOfSight(p,obj))return deny('Approach the rift along clear ground.');
 if(p.autoOn||game.time<p.combatUntil||p.buffs.some(b=>b.k==='root'&&b.until>game.time))return deny('Disengage before crossing.');
 const region=travelRegionAt(p.x,p.z),P=LUMENFEN;
 let to;
 if(obj.type==='lumenfen_entry'){
   if(region!=='reach')return deny('The Rootglass Tear is reached from the Verdigris Reach.');
   const denied=regionEntryDenial('lumenfen',p.char);if(denied)return deny(denied);
   if(!p.char.attunements?.includes('resonance'))return deny('Rootglass travel requires Resonance attunement.');
   spawnLumenfenWildlife(game);to=P.arrival;
 }else{
   if(region!=='lumenfen'||!inLumenfen(p.x,p.z))return deny('This threshold belongs to Lumenfen.');
   if(obj.type==='lumenfen_return'){
     const entry=game.objects.find(o=>o.type==='lumenfen_entry');
     if(!entry)return deny('The return anchor is missing.');
     to={x:entry.x,z:entry.z-3.7};
   }else if(obj.type==='lumenfen_spring')to=P.crownLanding;
   else to=P.springLanding;
 }
 game.transferPlayer(p,to);
 game.message(p,'info',obj.type==='lumenfen_entry'?'Lumenfen. The Mirrorpools, Mossbound Thicket and Luminous Canopy lie beyond the Veil Landing. The return rift stands nearby.':obj.type==='lumenfen_return'?'You returned to the Verdigris Reach.':'You crossed a living rootglass threshold.');
 return {ok:true};
}
