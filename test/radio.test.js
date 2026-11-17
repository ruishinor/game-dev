import test from 'node:test';import assert from 'node:assert/strict';import {RadioQueue} from '../client/src/radio.js';import {makeGame,makeChar,place} from './helpers.js';import {interact,transmit} from '../server/sim/progress.js';
import { RADIO_DIALOGUE, directiveDialogueId, getRadioDialogue } from '../shared/dialogue.js';
test('radio validates sources, deduplicates pending/current and bounds the queue',()=>{
 const q=new RadioQueue(2);assert.equal(q.push('chat','untrusted'),false);assert.equal(q.push('kernel',''),false);assert.equal(q.push('kernel','x'.repeat(1201)),false);
 assert.ok(q.push('kernel','One'));assert.equal(q.push('kernel','One'),false);assert.equal(q.next().message,'One');assert.equal(q.push('kernel','One'),false);
 q.push('field','Two');q.push('field','Three');q.push('kestrel','Four');assert.equal(q.pending.length,2);assert.equal(q.next().message,'Three');q.clear();assert.equal(q.next(),null);
});
test('Kestrel recorder sends private radio and retains the regular log without changing reward gates',()=>{
 const game=makeGame(),p=game.addPlayer(makeChar('keeper')),other=game.addPlayer(makeChar('vanguard',{name:'Other'}));
 const obj=game.objects.find(o=>o.type==='deep_console');place(p,-59,-8);p.outbox=[];other.outbox=[];
 assert.ok(interact(game,p,obj.id).ok);
 const radio=p.outbox.find(e=>e.e==='radio');assert.equal(radio.source,'kestrel');assert.equal(radio.dialogueId,'kestrel.log17');assert.equal(radio.m,getRadioDialogue(radio.dialogueId).transcript);assert.match(radio.m,/Sinter Laminate/);
 assert.ok(p.outbox.some(e=>e.e==='msg'&&e.m===radio.m));assert.equal(other.outbox.some(e=>e.e==='radio'),false);assert.equal(p.char.inventory.includes('phase_damper'),false);
 transmit(game,p,'kernel','info','Next directive');assert.ok(p.outbox.some(e=>e.e==='radio'&&e.source==='kernel'));
});

test('authored radio inventory includes distinct class variants and rejects mismatched or unknown IDs without losing text',()=>{
 const entries=Object.values(RADIO_DIALOGUE);
 assert.equal(entries.length,26);
 assert.equal(new Set(entries.map(d=>d.id)).size,entries.length);
 for(const d of entries){assert.equal(getRadioDialogue(d.id),d);assert.ok(d.transcript.trim());assert.ok(Object.isFrozen(d));}
 assert.equal(directiveDialogueId('keeper',1),'kernel.directive.calibrate.keeper');
 assert.equal(directiveDialogueId('surveyor',2),'kernel.directive.integrate.surveyor');
 assert.equal(directiveDialogueId('vanguard',3),directiveDialogueId('keeper',3));
 assert.equal(directiveDialogueId('keeper',7),'kernel.directive.complete');
 assert.equal(directiveDialogueId('keeper',0),null);
 assert.equal(getRadioDialogue('__proto__'),null);
 const d=getRadioDialogue('kestrel.log17'),q=new RadioQueue();
 assert.ok(q.push(d.source,d.transcript,d.id));assert.equal(q.next().dialogueId,d.id);q.clear();
 assert.ok(q.push(d.source,'Different transcript',d.id));assert.equal(q.next().dialogueId,undefined);q.clear();
 assert.ok(q.push(d.source,d.transcript,'unknown'));assert.equal(q.next().message,d.transcript);assert.equal(q.current.dialogueId,undefined);
});
