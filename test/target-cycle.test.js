import test from 'node:test';
import assert from 'node:assert/strict';
import { cycleHostileTarget } from '../client/src/target-cycle.js';

const pos = {x:0,z:0};
const enemy = (id,x,z=0,extra={}) => ({id,pos:{x,z},meta:{k:'e'},row:{f:0},placed:true,...extra});
test('Tab starts with the closest living hostile regardless of camera direction and cycles both ways',()=>{
 const list=[enemy(3,10),enemy(1,-2),enemy(2,5)];
 assert.equal(cycleHostileTarget(list,pos),1);
 assert.equal(cycleHostileTarget(list,pos,0,true),1);
 assert.equal(cycleHostileTarget(list,pos,1),2);
 assert.equal(cycleHostileTarget(list,pos,2),3);
 assert.equal(cycleHostileTarget(list,pos,3),1);
 assert.equal(cycleHostileTarget(list,pos,1,true),3);
 assert.equal(cycleHostileTarget(list,pos,3,true),2);
 assert.equal(cycleHostileTarget(list,pos,999),1);
});
test('invalid candidates are skipped and equal distances use a deterministic order',()=>{
 const list=[enemy(9,1,0,{dead:true}),enemy(8,1,0,{placed:false}),
 enemy(7,1,0,{meta:{k:'p'}}),enemy(6,1,0,{meta:{k:'e',neu:true}}),
 enemy(5,51),enemy(4,NaN),enemy(3,2),enemy(2,-2),
 enemy(1,4,0,{meta:{k:'e',neu:true},row:{f:8}})];
 assert.equal(cycleHostileTarget(list,pos),2);
 assert.equal(cycleHostileTarget(list,pos,2),3);
 assert.equal(cycleHostileTarget(list,pos,3),1);
 assert.equal(cycleHostileTarget([],pos),0);
});
