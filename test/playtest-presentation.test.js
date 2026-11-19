import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
// Structural guards complement, not replace, visual browser inspection.
test('projectile trails are seeded at the emitter before registration',()=>{
 const s=read('client/src/vfx/combat.js');const a=s.indexOf('const at = [a.x, a.y, a.z];');assert.ok(a>=0&&a<s.indexOf('const follow = () => at;',a));
});
test('player hood state is not derived from selected hair',()=>{
 assert.ok(read('client/src/characters.js').includes('const hoodDown = !!opts.appearance;'));
});
