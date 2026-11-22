import test from 'node:test';
import assert from 'node:assert/strict';
import {makeGame,makeChar,place} from './helpers.js';
import {interact} from '../server/sim/progress.js';

test('Sanctum Warden Observe action is informational and server-validated',()=>{
 const game=makeGame(),p=game.addPlayer(makeChar('vanguard'));
 const w=game.objects.find(o=>o.type==='sanctum_guard');
 assert.ok(w);
 place(p,w.x+1,w.z);
 assert.equal(interact(game,p,w.id).ok,true);
 assert.deepEqual(p.outbox.filter(e=>e.e==='msg').slice(-1),[
  {e:'msg',k:'info',m:'The Sanctum Warden watches the approach without speaking.'}
 ]);
 const count=p.outbox.length;
 place(p,w.x+10,w.z);
 assert.equal(interact(game,p,w.id).ok,false);
 assert.equal(p.outbox.length,count,'no info returned outside interaction range');
 place(p,w.x+1,w.z);p.dead=true;
 assert.equal(interact(game,p,w.id).ok,false);
});
