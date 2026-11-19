import test from 'node:test';import assert from 'node:assert/strict';import * as T from 'three';import {buildSanctumFabricator} from '../client/src/sanctum-fabricator.js';import {makeGame,makeChar,place} from './helpers.js';import {beginProduction,productionVisualState,stopProduction} from '../server/sim/production.js';
test('machine projection is driven by accepted production, not recipe exposure',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{materials:{mire_fibre:3,sentinel_alloy:3}}));place(p,2.8,5.7);
 assert.equal(productionVisualState(g,p),null);assert.ok(beginProduction(g,p,'field_maintenance_kit',2,p.inventoryRev).ok);const w=productionVisualState(g,p);assert.deepEqual(w,{m:'assemble',site:'sanctum',q:0});
 assert.deepEqual(g.buildRows().find(x=>x.i===p.id).work,w);
 const m=buildSanctumFabricator(T),sp=m.getObjectByName('fabricator:spindle'),part=m.getObjectByName('fabricator:workpiece');
 for(let i=0;i<30;i++)m.userData.updateWork(.05,i*.05,{...w,q:.5},false);
 assert.ok(sp.position.y<1.7&&Math.abs(sp.rotation.y)>1);assert.ok(part.visible);
 stopProduction(g,p);assert.equal(productionVisualState(g,p),null);assert.equal(g.buildRows().find(x=>x.i===p.id).work,undefined);
 for(let i=0;i<30;i++)m.userData.updateWork(.05,i*.05,null,true);
 assert.equal(part.visible,false);assert.ok(sp.position.y>1.78);
});
