import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place } from './helpers.js';
import { interact, tickBrineTrial, craftRecipe } from '../server/sim/progress.js';
import { BRINE_ROUTES, BRINE_TRIAL, brineHint, FIELD_RECORDS } from '../shared/survey.js';
import { resolveCollisions, PLAYER_RADIUS } from '../shared/world.js';
const positions={brine_research:[38,-36.5],brine_engineering:[49,-36.5],survey_signal:[39,-30],survey_ledger:[47,-30]};
function fixture(route){
  const game=makeGame(),p=game.addPlayer(makeChar('surveyor',{survey:route+'_done'}));
  function use(type){const pos=positions[type];place(p,...pos);return interact(game,p,game.objects.find(o=>o.type===type).id);}
  return {game,p,use,route:BRINE_ROUTES[route]};
}
for(const name of ['signal','ledger'])test(name+' commissioning: correct sequence, expiry, exclusion, one reward and services',()=>{
  const {game,p,use,route}=fixture(name);
  assert.equal(use(route.second).ok,false);
  assert.ok(use(route.first).ok);
  assert.equal(p.char.brineStage,1);
  assert.ok(use(route.second).ok);
  assert.equal(p.char.brineStage,2);
  assert.match(brineHint(p.char.survey,2,game.privateState(p).brineTrial),/LIVE TEST/);
  assert.equal(use(route.read[1]).ok,false);
  assert.ok(use(route.read[0]).ok);
  place(p,BRINE_TRIAL.exclusion.x,BRINE_TRIAL.exclusion.z);tickBrineTrial(game,p);
  assert.equal(p.brineTrial,null);
  assert.equal(use(route.read[1]).ok,false);
  assert.ok(use(route.second).ok);
  game.time+=BRINE_TRIAL.ms;tickBrineTrial(game,p);
  assert.equal(p.brineTrial,null);
  assert.ok(use(route.second).ok);
  assert.ok(use(route.read[0]).ok);assert.ok(use(route.read[1]).ok);
  assert.equal(p.char.brineStage,3);assert.equal(p.char.xp,55);
  assert.deepEqual(p.char.inventory,[route.reward]);
  assert.ok(use(route.read[1]).ok);assert.equal(p.char.xp,55);
  p.res=10;p.hp=20;
  assert.ok(use('brine_research').ok);assert.equal(p.res,45);
  assert.equal(use('brine_engineering').ok,false);
  game.time+=BRINE_TRIAL.serviceMs;assert.ok(use('brine_engineering').ok);assert.ok(p.hp>20);
  game.time+=BRINE_TRIAL.serviceMs;p.combatUntil=game.time+1000;
  assert.equal(use('brine_engineering').ok,false);
});
test('station and reading positions are reachable; commission requires evidence report and range',()=>{
  for(const [x,z] of Object.values(positions)){const p=resolveCollisions({x,z},PLAYER_RADIUS);assert.ok(Math.hypot(p.x-x,p.z-z)<1e-6);}
  const {game,p,use,route}=fixture('signal');p.char.survey='signal';
  assert.equal(use(route.first).ok,false);
  p.char.survey='signal_done';place(p,0,0);
  assert.equal(interact(game,p,game.objects.find(o=>o.type===route.first).id).reason,'Move closer.');
});
test('reconnect preserves preparation but does not preserve live test timer',()=>{
 const {game,p,use,route}=fixture('signal');
 assert.ok(use(route.first).ok);assert.ok(use(route.second).ok);
 const saved=p.char;game.removePlayer(p.id);const next=game.addPlayer(saved);
 assert.equal(next.char.brineStage,2);assert.equal(next.brineTrial,null);
});

test('records and commissioned workshops are meaningful, gated by station and proximity',()=>{
 const {game,p,use,route}=fixture('ledger');
 use(route.first);assert.ok(p.outbox.some(e=>e.e==='field_record'&&e.key===route.first));
 use(route.second);use(route.read[0]);use(route.read[1]);
 assert.ok(p.outbox.some(e=>e.e==='field_record'&&e.key==='survey_ledger'));
 assert.ok(FIELD_RECORDS.survey_ledger.lines.length>=5);
 const conductor=game.addPlayer(makeChar('symbiotech',{survey:'ledger_done',brineStage:3,inventory:['sporeglass_focus'],equipped:{device:'sporeglass_focus',implant:null,glyph:null},materials:{mire_fibre:2,sentinel_alloy:1}}));
 place(conductor,49,-36.5);
 assert.equal(game.privateState(conductor).workshop,'brine_engineering');
 assert.equal(craftRecipe(game,conductor,'matrix').ok,false);
 place(conductor,38,-36.5);
 assert.equal(game.privateState(conductor).workshop,'brine_research');
 assert.ok(craftRecipe(game,conductor,'matrix').ok);
 assert.equal(conductor.char.materials.culture_matrix,1);
 conductor.char.brineStage=2;
 assert.equal(game.privateState(conductor).workshop,null);
});
