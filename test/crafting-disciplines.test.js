import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeCraftingDisciplines,disciplineProgress,disciplineDuration} from '../shared/crafting-disciplines.js';
import {creditDiscipline} from '../server/sim/crafting-disciplines.js';
import {craftRecipe} from '../server/sim/progress.js';
import {makeGame,makeChar} from './helpers.js';
test('discipline progression sanitizes legacy records, isolates streams, and bounds level and duration',()=>{
 assert.deepEqual(sanitizeCraftingDisciplines({Engineering:50,Research:-1,Admin:100}),{Engineering:50,Research:0});
 assert.equal(disciplineProgress({Engineering:40},'Engineering').level,2);
 assert.equal(disciplineProgress({Engineering:1e8},'Engineering').level,10);
 assert.equal(disciplineDuration(5000,{Engineering:1180},'Engineering'),4100);
 assert.equal(disciplineDuration(5000,{Research:1180},'Engineering'),5000);
});
test('craft success awards XP, free reversal and failed requirements do not',()=>{
 const g=makeGame(),p=g.addPlayer(makeChar('vanguard',{level:4,inventory:['calibrated_servo'],materials:{mire_fibre:1,sentinel_alloy:1}}));
 assert.equal(g.sheet(p).craftingDisciplines.Engineering,0);
 assert.ok(craftRecipe(g,p,'field_maintenance_kit',p.utilityRev).ok);
 assert.equal(g.sheet(p).craftingDisciplines.Engineering,14);
 assert.ok(craftRecipe(g,p,'restore_servo',p.utilityRev).ok);
 assert.equal(g.sheet(p).craftingDisciplines.Engineering,14);
 assert.equal(craftRecipe(g,p,'field_maintenance_kit',p.utilityRev).ok,false);
 assert.equal(g.sheet(p).craftingDisciplines.Engineering,14);
 const saved={...p.char};g.removePlayer(p.id);const next=g.addPlayer(saved);
 assert.equal(g.sheet(next).craftingDisciplines.Engineering,14);
 assert.equal(creditDiscipline(g,next,{discipline:'Research',inputs:{mire_fibre:2}}),14);
 assert.deepEqual(g.sheet(next).craftingDisciplines,{Engineering:14,Research:14});
});
