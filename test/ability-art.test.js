import test from 'node:test';
import assert from 'node:assert/strict';
import { paintedAbilityArt } from '../client/src/ability-art.js';

const ids=['rending_arc','graviton_tether','kinetic_ward','discharge'];

test('Vanguard action illustrations are distinct original, layered SVGs',()=>{
  const arts=ids.map(id=>paintedAbilityArt(id));
  assert.equal(new Set(arts).size,ids.length);
  for(const [i,art] of arts.entries()){
    assert.match(art,/<svg[^>]*viewBox="0 0 64 64"/);
    assert.ok(art.includes('bg-'+ids[i])&&art.includes('clip-'+ids[i]));
    assert.ok((art.match(/<path\b/g)||[]).length>=3,'Each action needs multiple compositional layers');
    assert.ok(!/https?:|<script|<image|foreignObject/i.test(art),'Original illustrations must not reference third-party imagery or scripts');
  }
});

test('Non-illustrated abilities preserve their existing vector icon fallback',()=>{
  assert.equal(paintedAbilityArt('not_a_spell'),null);
  assert.equal(paintedAbilityArt('__proto__'),null);
  assert.equal(paintedAbilityArt('triage'),null);
});
