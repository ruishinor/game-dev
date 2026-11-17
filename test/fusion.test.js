import test from 'node:test';
import assert from 'node:assert/strict';
import { previewRecipe } from '../shared/crafting.js';
import { craftRecipe } from '../server/sim/progress.js';
import { useAbility,getBuff } from '../server/sim/combat.js';
import { makeGame,makeChar,place } from './helpers.js';
const inputs=['field_vector_array','conductive_membrane'];
const character=()=>makeChar('vanguard',{level:4,survey:'signal_done',brineStage:3,attunements:['resonance'],inventory:[...inputs,'glyph_resonant_aegis'],materials:{kinetic_coupler:1},equipped:{device:null,implant:null,glyph:'glyph_resonant_aegis'}});
test('fusion consumes both unique items and coupler only after every gate passes',()=>{
 const game=makeGame(),p=game.addPlayer(character());
 const initial=JSON.stringify(p.char);
 place(p,0,7.5);assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);assert.equal(JSON.stringify(p.char),initial);
 place(p,38,-36.5);assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);
 place(p,49,-36.5);p.char.brineStage=2;assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);p.char.brineStage=3;
 p.char.equipped.device='field_vector_array';assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);p.char.equipped.device=null;
 p.char.materials={};assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);p.char.materials={kinetic_coupler:1};
 p.combatUntil=game.time+1000;assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);p.combatUntil=0;
 assert.ok(craftRecipe(game,p,'aegis_rectifier').ok);
 assert.deepEqual(p.char.inventory,['glyph_resonant_aegis','aegis_rectifier']);assert.deepEqual(p.char.materials,{});
 assert.equal(craftRecipe(game,p,'aegis_rectifier').ok,false);
});
test('pure preview rejects missing input, other professions and duplicate output',()=>{
 const char=character(),snapshot=JSON.stringify(char);
 assert.ok(previewRecipe(char,'aegis_rectifier').ok);assert.equal(JSON.stringify(char),snapshot);
 assert.equal(previewRecipe({...char,inventory:['conductive_membrane']},'aegis_rectifier').ok,false);
 assert.equal(previewRecipe({...char,cls:'keeper'},'aegis_rectifier').ok,false);
 assert.equal(previewRecipe({...char,inventory:[...char.inventory,'aegis_rectifier']},'aegis_rectifier').ok,false);
});
test('Rectifier trades coverage radius for Aegis capacity in actual combat',()=>{
 const game=makeGame(),char=character();char.inventory.push('aegis_rectifier');char.equipped.device='aegis_rectifier';
 const p=game.addPlayer(char),near=game.addPlayer(makeChar('keeper')),far=game.addPlayer(makeChar('keeper'));
 place(p,0,25);place(near,4.5,25);place(far,6,25);p.res=100;
 assert.equal(p.stats.shieldMul,1.35);assert.equal(p.stats.dischargeRadius,-2);
 assert.ok(useAbility(game,p,'discharge').ok);
 assert.equal(getBuff(p,'shield').cap,Math.round(60*p.stats.power*1.35));
 assert.ok(getBuff(near,'shield'));assert.equal(getBuff(far,'shield'),null);
});
