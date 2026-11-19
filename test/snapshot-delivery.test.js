import test from 'node:test';
import assert from 'node:assert/strict';
import {NetServer} from '../server/net.js';
import {makeGame,makeChar} from './helpers.js';
import { RIFT_ANNEX, WORLD } from '../shared/world.js';
function setup(){
 const game=makeGame(),net=new NetServer({on(){}},game,{markDirty(){}});
 const make=cls=>{const p=game.addPlayer(makeChar(cls)),messages=[];const conn={player:p,account:null,known:new Map(),pendingVisual:[],stalledSince:null,ws:{readyState:1,bufferedAmount:0,send(raw){messages.push(JSON.parse(raw));},terminate(){this.readyState=3;this.terminated=true;}}};net.conns.add(conn);return {p,conn,messages};};
 return {game,net,a:make('vanguard'),b:make('keeper')};
}
test('skipped snapshots retain private messages without disclosure or duplicates; fresh cues replay only to stalled recipient',()=>{
 const {game,net,a,b}=setup();a.conn.ws.bufferedAmount=600000;
 const hit={e:'hit',s:a.p.id,d:b.p.id,a:3,ab:'auto'},warn={e:'tele',id:a.p.id,ms:500};
 game.emitWorldEvent(hit);game.emitWorldEvent(warn);game.message(a.p,'info','private record');game.message(b.p,'info','other record');
 net.broadcast();assert.equal(a.messages.length,0);assert.deepEqual(b.messages[0].ev,[hit,warn]);assert.equal(b.messages[0].pv[0].m,'other record');
 assert.equal(a.p.outbox[0].m,'private record');assert.equal(b.p.outbox.length,0);assert.equal(a.p.sheetDirty,true);
 game.time+=50;game.message(a.p,'info','following private message');a.conn.ws.bufferedAmount=0;
 net.broadcast();assert.deepEqual(a.messages[0].ev,[hit]);assert.deepEqual(a.messages[0].pv.map(x=>x.m),['private record','following private message']);assert.ok(a.messages[0].sheet);
 assert.deepEqual(b.messages[1].ev,[]);assert.equal(b.messages[1].pv,undefined);
 net.broadcast();assert.deepEqual(a.messages[1].ev,[]);assert.equal(a.messages[1].pv,undefined);assert.equal(a.messages[1].sheet,undefined);
});
test('expired cues are discarded and prolonged stalls and outbox overflow terminate',()=>{
 const {game,net,a,b}=setup();a.conn.ws.bufferedAmount=600000;
 game.emitWorldEvent({e:'cast',s:a.p.id,ab:'test'});net.broadcast();game.time+=1000;a.conn.ws.bufferedAmount=0;net.broadcast();assert.deepEqual(a.messages[0].ev,[]);
 a.conn.ws.bufferedAmount=600000;net.broadcast();game.time+=5001;net.broadcast();assert.equal(a.conn.ws.terminated,true);
 for(let i=0;i<257;i++)game.message(b.p,'info','bounded');net.broadcast();assert.equal(b.conn.ws.terminated,true);
});

test('regions isolate rows, metadata and live or buffered world cues across transfers', () => {
 const {game, net, a, b} = setup();
 const reachCue = { e: 'cast', s: a.p.id, ab: 'reach-test' };
 const annexCue = { e: 'tele', id: a.p.id, ms: 500 };
 a.conn.ws.bufferedAmount = 600000;
 game.emitWorldEvent(reachCue);
 net.broadcast();
 assert.deepEqual(b.messages.at(-1).ev, [reachCue]);

 a.conn.ws.bufferedAmount = 0;
 game.emitWorldEvent({ e: 'tele', id: a.p.id, x: a.p.x, z: a.p.z, ms: 600 });
 game.transferPlayer(a.p, { x: RIFT_ANNEX.x, z: RIFT_ANNEX.arrivalZ });
 b.p.target = a.p.id;
 game.emitWorldEvent(annexCue);
 net.broadcast();

 const annex = a.messages.at(-1);
 const reach = b.messages.at(-1);
 assert.equal(annex.y.region, 'phase_annex');
 assert.equal(reach.y.region, 'reach');
 assert.deepEqual(annex.ev, [annexCue]);
 assert.deepEqual(reach.ev, []);
 assert.ok(!annex.ents.some(row => row.i === b.p.id));
 assert.ok(!annex.meta.some(row => row.i === b.p.id));
 assert.ok(!reach.ents.some(row => row.i === a.p.id));
 assert.equal(reach.ents.find(row => row.i === b.p.id).t, 0);
 assert.equal(b.conn.known.has(a.p.id), false);

 game.transferPlayer(a.p, WORLD.spawn);
 net.broadcast();
 assert.ok(b.messages.at(-1).meta.some(row => row.i === a.p.id));
});
