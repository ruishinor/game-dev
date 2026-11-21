// Server-authoritative regional encounter tuning. Patrol formations and routes
// remain exclusively owned by the parallel soldier-squad workstream.
import { ENEMIES } from '../../shared/content.js';
export const EXPANSE_LEVELS=Object.freeze({min:5,max:12});
export const FOUNDRY_LEVELS=Object.freeze({min:8,max:11});
const LEGACY_PATROL_LEVELS=Object.freeze([5,6,7,6,7,8,11,12]);
// Only the first eight legacy individually roaming enemies. Any subsequent
// soldier squads retain their separate, owner-authored levels and configuration.
export function legacyPatrolLevel(index){return Number.isInteger(index)&&index>=0&&index<LEGACY_PATROL_LEVELS.length?LEGACY_PATROL_LEVELS[index]:null;}
export function scrapyardLevel(enemy){
 if(enemy.name==='Forge Overseer')return 12;
 if(enemy.name==='Scrapyard Sentinel')return 9;
 if(enemy.name==='Yard Drone')return 8;
 return null;
}
export function regionalEnemyScale(type,level,kind){
 const def=ENEMIES[type],range=kind==='foundry'?FOUNDRY_LEVELS:EXPANSE_LEVELS;
 if(!def||!Number.isInteger(level)||level<range.min||level>range.max)throw new RangeError('Invalid regional enemy level');
 const steps=Math.max(0,level-def.level);
 return {hp:1+steps*.12,dmg:1+steps*.065};
}
export function setRegionalEnemyLevel(game,enemy,level,kind,resetEnemy){
 if(level===null)return;
 enemy.level=level;
 enemy.zoneScale=regionalEnemyScale(enemy.type,level,kind);
 resetEnemy(game,enemy);
 enemy.metaVer=(enemy.metaVer||1)+1;
}
/** Grant earned kill XP, with decay only for substantially overlevel characters.
 * Existing Reach creature XP remains unchanged. */
export function regionalKillXp(enemy,playerLevel){
 const base=ENEMIES[enemy.type].xp;
 if(!enemy.zoneScale)return base;
 const gap=Math.max(0,enemy.level-ENEMIES[enemy.type].level);
 const over=Math.max(0,playerLevel-enemy.level);
 const penalty=over<=1?1:over===2?.65:over===3?.35:0;
 return Math.round(base*(1+gap*.22)*(enemy.elite?1.6:1)*penalty);
}
