import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {ANNEX_FORMATIONS} from '../shared/world.js';
import {planAnnexRocks} from '../client/src/annex-rock-fit.js';

const manifest=JSON.parse(await readFile(new URL('../client/assets/manifest.json',import.meta.url),'utf8'));
const getMeta=name=>manifest.assets.nature.pieces[name];

test('licensed Annex rock placements use distinct kit assets and fit existing formation footprints',()=>{
  for(const p of ANNEX_FORMATIONS){
    const plan=planAnnexRocks(p,getMeta);
    assert.deepEqual(plan,planAnnexRocks(p,getMeta),'placement is deterministic');
    assert.equal(new Set(plan.map(r=>r.name)).size,3);
    for(const {name,dx,dz,ry,s,origin} of plan){
      const {min,max}=getMeta(name);
      for(const x of [min[0],max[0]])for(const z of [min[2],max[2]]){
        const a=(x+origin[0])*s[0],b=(z+origin[2])*s[2];
        const wx=dx+a*Math.cos(ry)+b*Math.sin(ry);
        const wz=dz-a*Math.sin(ry)+b*Math.cos(ry);
        assert.ok(Math.hypot(wx,wz)<=p.r+1e-8,name+' escaped collider');
      }
      assert.ok(Math.abs((min[1]+origin[1])*s[1])<1e-8);
      assert.ok((max[1]+origin[1])*s[1]<=p.h);
    }
  }
});

test('missing donor bounds are rejected before any batch placement',()=>{
  assert.throws(()=>planAnnexRocks(ANNEX_FORMATIONS[0],()=>undefined),/donor bounds/);
  assert.throws(()=>planAnnexRocks(ANNEX_FORMATIONS[0],()=>({min:[0,0,0],max:[0,0,0]})),/donor bounds/);
});
