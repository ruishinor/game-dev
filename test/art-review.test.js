import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewStore,REVIEW_KEY} from '../client/src/art-review.js';
const items=[{id:'a',revision:'1'},{id:'b',revision:'1'}];
const storage=()=>{const map=new Map();return {getItem:k=>map.get(k),setItem:(k,v)=>map.set(k,v)};};
test('art review decisions persist per item, notes export and revisions invalidate old decisions',()=>{
 const s=storage(),r=createReviewStore(items,s);assert.equal(r.get('a').status,'unreviewed');r.set('a','modify','Add detail');r.set('b','accepted','');
 const restored=createReviewStore(items,s);assert.deepEqual(restored.get('a'),{status:'modify',note:'Add detail'});assert.equal(restored.get('b').status,'accepted');assert.equal(restored.counts().modify,1);assert.equal(restored.exportData().records.length,2);
 const next=createReviewStore([{id:'a',revision:'2'},items[1]],s);assert.equal(next.get('a').status,'unreviewed');assert.equal(next.get('b').status,'accepted');
 assert.throws(()=>r.set('a','bad',''));assert.throws(()=>r.set('unknown','accepted',''));
});
test('art review survives blocked or malformed local storage without claiming persistence',()=>{
 const s={getItem(){return '{bad';},setItem(){throw Error('blocked');}},r=createReviewStore(items,s);r.set('a','not-accepted','notes');assert.equal(r.persistent,false);assert.equal(r.exportData().records[0].status,'not-accepted');
});
