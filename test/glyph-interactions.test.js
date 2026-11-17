import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place } from './helpers.js';
import { useAbility, dealDamage, getBuff, repairAegis, addBuff } from '../server/sim/combat.js';
import { tickCompanion } from '../server/sim/companion.js';

const make = (g,cls,glyph) => g.addPlayer(makeChar(cls,{inventory:[glyph],attunements:['resonance'],equipped:{device:null,implant:null,glyph}}));

test('Shared Pulse routes its secondary mend into a damaged Aegis, without healing health or renewing duration',()=>{
  const g=makeGame(), tank=make(g,'vanguard','glyph_resonant_aegis'), healer=make(g,'symbiotech','glyph_shared_pulse');
  const patient=g.addPlayer(makeChar('vanguard'));
  place(tank,0,35); place(patient,2,35); place(healer,3,35);
  healer.companion.x=patient.x; healer.companion.z=patient.z;
  tank.res=100;
  assert.ok(useAbility(g,tank,'discharge').ok);
  const field=getBuff(tank,'shield');
  const expires=field.until;
  field.v=field.cap-12;
  tank.hp-=25; patient.hp-=150;
  const hp=tank.hp;
  tickCompanion(g,healer.companion,0);
  assert.equal(field.v,field.cap-7);
  assert.equal(tank.hp,hp);
  assert.equal(field.until,expires);
  assert.ok(g.events.some(e=>e.e==='shield'&&e.k==='relay'&&e.d===tank.id&&e.a===5));
  assert.ok(g.events.some(e=>e.e==='beam'&&e.k==='aegis_relay'&&e.d===tank.id));
  assert.ok(!g.events.some(e=>e.e==='heal'&&e.d===tank.id));
});

test('repair rejects invalid, empty, expired and source-less fields and cannot exceed capacity',()=>{
  const g=makeGame(), tank=make(g,'vanguard','glyph_resonant_aegis'), healer=make(g,'symbiotech','glyph_shared_pulse');
  const shield={k:'shield',src:tank.id,v:11,cap:12,until:8000};
  addBuff(tank,shield);
  assert.equal(repairAegis(g,healer,tank,9,healer.companion.id),1);
  assert.equal(shield.v,12);
  assert.equal(repairAegis(g,healer,tank,9,healer.companion.id),0);
  shield.v=0; assert.equal(repairAegis(g,healer,tank,9,healer.companion.id),0);
  shield.v=3; shield.until=0; assert.equal(repairAegis(g,healer,tank,9,healer.companion.id),0);
  shield.until=8000; shield.src=99999; assert.equal(repairAegis(g,healer,tank,9,healer.companion.id),0);
  shield.src=tank.id; tank.dead=true; assert.equal(repairAegis(g,healer,tank,9,healer.companion.id),0);
});

test('Carapace reflection relocates only one Rending Echo and consumes the living imprint',()=>{
  const g=makeGame(), tank=make(g,'vanguard','glyph_rending_echo'), healer=make(g,'symbiotech','glyph_carapace');
  const [primary,near,far]=g.enemies.filter(e=>e.type==='skitter');
  for(const e of g.enemies) if(![primary,near,far].includes(e)){e.state='dead';e.respawnAt=Infinity;}
  place(tank,0,35); place(healer,2,35);
  place(primary,0,38.5); place(near,0,31); place(far,0,43);
  addBuff(tank,{k:'bond',src:healer.companion.id,until:300,dr:0.45,reflect:6});
  dealDamage(g,primary,tank,7,'auto',{melee:true,kind:'melee'});
  assert.ok(getBuff(primary,'carapace_imprint'));
  const nh=near.hp,fh=far.hp;
  g.setTarget(tank,primary.id);
  assert.ok(useAbility(g,tank,'rending_arc').ok);
  assert.equal(near.hp,nh);
  assert.ok(far.hp<fh);
  assert.equal(getBuff(primary,'carapace_imprint'),null);
  assert.ok(g.events.some(e=>e.e==='fx'&&e.k==='carapace_echo'&&e.z===38.5));
  tank.cds.rending_arc=0; tank.gcdUntil=0;
  const nh2=near.hp,fh2=far.hp;
  assert.ok(useAbility(g,tank,'rending_arc').ok);
  assert.ok(near.hp<nh2);
  assert.equal(far.hp,fh2);
});

test('expired imprint does not relocate Rending Echo',()=>{
  const g=makeGame(), tank=make(g,'vanguard','glyph_rending_echo');
  const [primary,near,far]=g.enemies.filter(e=>e.type==='skitter');
  place(tank,0,35); place(primary,0,38.5); place(near,0,31); place(far,0,43);
  addBuff(primary,{k:'carapace_imprint',until:0,src:999});
  g.setTarget(tank,primary.id);
  const nh=near.hp,fh=far.hp;
  assert.ok(useAbility(g,tank,'rending_arc').ok);
  assert.ok(near.hp<nh); assert.equal(far.hp,fh);
  assert.ok(!g.events.some(e=>e.k==='carapace_echo'));
});
