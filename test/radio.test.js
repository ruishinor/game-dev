import test from 'node:test';import assert from 'node:assert/strict';import {RadioQueue} from '../client/src/radio.js';import {makeGame,makeChar,place} from './helpers.js';import {interact,transmit} from '../server/sim/progress.js';
test('radio validates sources, deduplicates pending/current and bounds the queue',()=>{
 const q=new RadioQueue(2);assert.equal(q.push('chat','untrusted'),false);assert.equal(q.push('kernel',''),false);assert.equal(q.push('kernel','x'.repeat(1201)),false);
 assert.ok(q.push('kernel','One'));assert.equal(q.push('kernel','One'),false);assert.equal(q.next().message,'One');assert.equal(q.push('kernel','One'),false);
 q.push('field','Two');q.push('field','Three');q.push('kestrel','Four');assert.equal(q.pending.length,2);assert.equal(q.next().message,'Three');q.clear();assert.equal(q.next(),null);
});
test('Kestrel recorder sends private radio and retains the regular log without changing reward gates',()=>{
 const game=makeGame(),p=game.addPlayer(makeChar('keeper')),other=game.addPlayer(makeChar('vanguard',{name:'Other'}));
 const obj=game.objects.find(o=>o.type==='deep_console');place(p,-59,-8);p.outbox=[];other.outbox=[];
 assert.ok(interact(game,p,obj.id).ok);
 const radio=p.outbox.find(e=>e.e==='radio');assert.equal(radio.source,'kestrel');assert.match(radio.m,/Sinter Laminate/);
 assert.ok(p.outbox.some(e=>e.e==='msg'&&e.m===radio.m));assert.equal(other.outbox.some(e=>e.e==='radio'),false);assert.equal(p.char.inventory.includes('phase_damper'),false);
 transmit(game,p,'kernel','info','Next directive');assert.ok(p.outbox.some(e=>e.e==='radio'&&e.source==='kernel'));
});
