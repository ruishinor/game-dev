import test from 'node:test';import assert from 'node:assert/strict';
import {makeGame,makeChar,place,run} from './helpers.js';
test('follow moves on server ticks without any follower input; stops at distance and manual movement cancels',()=>{
 const g=makeGame(),a=g.addPlayer(makeChar('vanguard')),b=g.addPlayer(makeChar('vanguard'));
 place(a,0,7.5);place(b,0,11);
 assert.ok(g.setFollow(b,a.id).ok);assert.equal(g.privateState(b).follow,a.id);
 run(g,1000);assert.ok(Math.abs(Math.hypot(a.x-b.x,a.z-b.z)-2.8)<.15);
 // Leader walks via real, budgeted input; follower sends none.
 const before=b.z;
 for(let i=1;i<=30;i++){g.handleInputs(a,[{seq:i,f:1,s:0,yaw:Math.PI,j:0}]);g.tick(50);}
 assert.ok(b.z<before-1);assert.equal(b.followId,a.id);
 g.handleInputs(b,[{seq:1,f:1,s:0,yaw:0,j:0}]);assert.equal(b.followId,0);
});
test('follow validates target, rejects cycles, cancels on death, distance and removal',()=>{
 const g=makeGame(),a=g.addPlayer(makeChar('vanguard')),b=g.addPlayer(makeChar('vanguard')),c=g.addPlayer(makeChar('vanguard'));
 place(a,0,7.5);place(b,0,11);place(c,0,9);
 assert.equal(g.setFollow(a,a.id).ok,false);assert.equal(g.setFollow(a,99999).ok,false);
 assert.ok(g.setFollow(a,b.id).ok);assert.ok(g.setFollow(b,c.id).ok);assert.equal(g.setFollow(c,a.id).ok,false);
 c.dead=true;g.tick(50);assert.equal(b.followId,0);
 assert.ok(g.setFollow(a,b.id).ok);place(b,0,70);g.tick(50);assert.equal(a.followId,0);
 place(b,0,11);assert.ok(g.setFollow(a,b.id).ok);g.removePlayer(b.id);assert.equal(a.followId,0);
 assert.ok(g.setFollow(a,0).ok);
});
