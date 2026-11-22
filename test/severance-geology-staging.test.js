import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as T from 'three';
import {EXPEDITION_OUTPOST as OP,OUTPOST_COLLIDERS} from '../shared/severance-gate.js';
import {buildOutpostStaging,OUTPOST_STAGING_LIMITS} from '../client/src/severance-outpost-staging.js';
import {createExpeditionOutpost,OUTPOST_LIMITS} from '../client/src/severance-outpost.js';

test('Expedition Outpost has recognisable antenna and field repair hardware within existing colliders',()=>{
 const original=OUTPOST_COLLIDERS.map(x=>({...x}));
 const ground=()=>0;
 const rig=buildOutpostStaging(T,{ground});
 const names=new Set(),nodes=[];
 rig.group.traverse(o=>{names.add(o.name);if(o.isMesh)nodes.push(o)});
 for(const name of ['outpost:telemetry-dish','outpost:real-antenna-cabling',
   'outpost:generator-reactor-housing','outpost:generator-status-ring',
   'outpost:field-repair-plinth','outpost:repair-instrument'])
   assert.ok(names.has(name),name);
 assert.ok(nodes.length>=16);
 assert.equal(rig.stats.lights,0);
 assert.equal(rig.stats.colliderChanges,0);
 assert.equal(rig.stats.connectors,OUTPOST_STAGING_LIMITS.connectors);
 assert.deepEqual(OUTPOST_COLLIDERS,original);
 rig.dispose();
});
test('existing production Sanctum GLBs can become outpost machine components',()=>{
 const used=[],assets={
  get:k=>k==='sanctum'?{}:null,
  instance(_id,piece){used.push(piece);return new T.Group();}
 };
 const rig=buildOutpostStaging(T,{ground:()=>0,assets});
 assert.ok(rig.stats.glb>=5);
 assert.ok(rig.stats.glb<=OUTPOST_STAGING_LIMITS.maxGLB);
 assert.ok(used.includes('Prop_AccessPoint'));
 assert.ok(used.includes('Prop_ItemHolder'));
 rig.dispose();
});
test('existing 1-light shelter remains authoritative; terrain shader has real multiscale bands',()=>{
 const scene=new T.Group();
 const out=createExpeditionOutpost(T,{group:scene,ground:()=>0});
 assert.equal(out.stats().lights,OUTPOST_LIMITS.lights);
 assert.ok(out.stats().staging);
 out.dispose();
 const shader=readFileSync(new URL('../client/src/severance-pocket.js',import.meta.url),'utf8');
 assert.match(shader,/severance-strata-v3/);
 assert.match(shader,/float cliffVein/);
 assert.match(shader,/float ashWash/);
 assert.equal(OP.r,17);
});
