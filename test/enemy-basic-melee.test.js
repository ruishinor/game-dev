// Enemy basic swings must announce a real contact window, not damage on timer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,enemyOf,isolate,place} from './helpers.js';
import {clearCombatSpot} from './cover-setup.js';
import {tickEnemy} from '../server/sim/ai.js';
function setup(){
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard')),e=enemyOf(g,'skitter');
 isolate(g,e);
 const spot=clearCombatSpot(e,0,1.5);place(p,spot.x,spot.z);
 e.state='combat';e.nextAttack=g.time;e.threat.set(p.id,100);
 e.specialAt={};return {g,p,e};
}
test('ordinary enemy melee telegraphs, then resolves damage at contact, once',()=>{
 const {g,p,e}=setup(),hp=p.hp;
 tickEnemy(g,e,0);
 assert.equal(p.hp,hp,'no hit on the warning frame');
 const warning=g.events.find(x=>x.e==='tele'&&x.k==='basic_melee');
 assert.ok(warning&&warning.ms>=390&&warning.ms<=610,'warning has an actual defendable duration');
 assert.ok(e.basicWindup,'attack is pending on the server');
 g.time+=warning.ms-1;tickEnemy(g,e,0);assert.equal(p.hp,hp);
 g.time+=1;tickEnemy(g,e,0);assert.ok(p.hp<hp,'hit after windup');
 const after=p.hp;tickEnemy(g,e,0);assert.equal(p.hp,after,'only one hit per windup');
});
test('sidestepping out of reach during enemy windup avoids actual hp damage',()=>{
 const {g,p,e}=setup();tickEnemy(g,e,0);const before=p.hp,ms=e.basicWindup.until-g.time;
 place(p,e.x+8,e.z+8);g.time+=ms;tickEnemy(g,e,0);
 assert.equal(p.hp,before);
});
test('moving behind the committed swing evades its facing arc',()=>{
 const {g,p,e}=setup();tickEnemy(g,e,0);const before=p.hp,ms=e.basicWindup.until-g.time;
 const direction=e.yaw+Math.PI;
 const pos=clearCombatSpot(e,Math.sin(direction)*1.5,Math.cos(direction)*1.5);
 place(p,pos.x,pos.z);g.time+=ms;tickEnemy(g,e,0);
 assert.equal(p.hp,before);
});
