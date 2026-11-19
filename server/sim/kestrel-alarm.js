import {DEEP} from '../../shared/world.js';
// Expose the active local encounter warning, not hostile targets or threat.
export function containmentAlarm(game){
 return game.enemies.some(e=>e.type==='quarantine_custodian'&&e.state==='combat'&&e.threat.size>0);
}
export function kestrelAlarmFor(game,p){
 return Math.hypot(p.x-DEEP.x,p.z-DEEP.z)<=22&&containmentAlarm(game);
}
