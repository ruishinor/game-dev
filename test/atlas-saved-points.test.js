import test from 'node:test';
import assert from 'node:assert/strict';
import {loadSavedPoints,persistSavedPoints,sanitizeSavedPoint,MAX_SAVED_POINTS,MAX_NOTE_LENGTH} from '../client/src/atlas-saved-points.js';

const a='12345678-1234-4234-8234-123456789abc',b='22345678-1234-4234-8234-123456789abc';
const point={id:'11111111-aaaa-4bbb-8ccc-111111111111',x:23.5,z:-15,region:'The Verdigris Reach',label:'Resource site',note:'Return after crafting'};
function store(){const entries=new Map();return{getItem:key=>entries.get(key)||null,setItem:(k,v)=>entries.set(k,v)};}
test('saved map notes survive reload and remain separated by character UUID',()=>{
  const storage=store();
  assert.equal(persistSavedPoints(storage,a,[point]),true);
  assert.deepEqual(loadSavedPoints(storage,a),[point]);
  assert.deepEqual(loadSavedPoints(storage,b),[]);
  assert.equal(persistSavedPoints(storage,b,[{...point,note:'Different character'}]),true);
  assert.equal(loadSavedPoints(storage,a)[0].note,point.note);
  assert.equal(loadSavedPoints(storage,b)[0].note,'Different character');
});
test('local map storage rejects invalid owner, locations and excess markers',()=>{
  const storage=store();
  assert.equal(persistSavedPoints(storage,'not-a-uuid',[point]),false);
  assert.deepEqual(loadSavedPoints(storage,'not-a-uuid'),[]);
  assert.equal(sanitizeSavedPoint({...point,x:Infinity}),null);
  assert.equal(persistSavedPoints(storage,a,Array(MAX_SAVED_POINTS+1).fill(point)),false);
  assert.equal(persistSavedPoints(storage,a,[{...point,note:'x'.repeat(500)}]),true);
  assert.equal(loadSavedPoints(storage,a)[0].note.length,MAX_NOTE_LENGTH);
});
test('malformed local storage is handled without rendering injected text',()=>{
  const storage=store();storage.setItem('attunement.atlas.saved.v1.'+a,'{bad');
  assert.deepEqual(loadSavedPoints(storage,a),[]);
  const safe=sanitizeSavedPoint({...point,label:'<script>alert(1)</script>',note:'<img src=x onerror=1>'});
  assert.match(safe.label,/script/);
  assert.equal(safe.note,'<img src=x onerror=1>');
});
