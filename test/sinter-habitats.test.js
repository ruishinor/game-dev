import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,place,run} from './helpers.js';
import {SINTER_SITES,sinterSiteAt,ZONES,dist,resolveCollisions} from '../shared/world.js';

test('sheltered nursery and feeding bed are distinct walkable sites',()=>{
 for(const [id,site] of Object.entries(SINTER_SITES)){
  assert.equal(sinterSiteAt(site),id);
  assert.ok(dist(site,ZONES.sinter)+site.r<ZONES.sinter.r);
  assert.ok(dist(site,resolveCollisions({x:site.x,z:site.z},.62))<1e-6);
 }
 assert.equal(sinterSiteAt({x:6,z:70}),null);
});
test('mature generalist adapts only after sufficient feeding-bed exposure',()=>{
 const g=makeGame(),adult=g.enemies.find(e=>e.form==='adult'),juvenile=g.enemies.find(e=>e.form==='juvenile');
 const predator=g.enemies.find(e=>e.type==='faultstalker');
 predator.huntReadyAt=Infinity;place(predator,19,56);predator.wanderAt=30000;
 place(adult,SINTER_SITES.mineral.x,SINTER_SITES.mineral.z);
 place(juvenile,SINTER_SITES.nursery.x,SINTER_SITES.nursery.z);
 adult.grown=true;adult.wanderAt=20000;juvenile.wanderAt=20000;
 run(g,13000);assert.equal(adult.calcified,false);
 run(g,1500);assert.equal(adult.calcified,true);
 assert.equal(juvenile.ecologyMode,'rest');
 assert.equal(juvenile.calcified,false);
 assert.equal(g.buildRows().find(r=>r.i===adult.id).mineral,1);
 assert.equal(adult.hp,adult.maxHp);
});
