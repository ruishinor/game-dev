import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place } from './helpers.js';
import { useAbility, dealDamage, getBuff, repairAegis, addBuff } from '../server/sim/combat.js';
import { tickCompanion } from '../server/sim/companion.js';
import { hasLineOfSight, resolveCollisions, inSanctum } from '../shared/world.js';

// Find real clear ground, rather than disabling new cover rules for the old fixture.
function echoGround(tank,primary,near,far){
  for(let z=23;z<=39;z+=2)for(let x=-18;x<=18;x+=2){
    const points=[{x,z},{x,z:z+3.5},{x,z:z-4},{x,z:z+8}];
    if(points.some(p=>inSanctum(p)||Math.hypot(resolveCollisions(p,.8).x-p.x,resolveCollisions(p,.8).z-p.z)>1e-5))continue;
    if(![[0,1],[0,2],[1,3]].every(([a,b])=>hasLineOfSight(points[a],points[b])))continue;
    [tank,primary,near,far].forEach((ent,i)=>place(ent,points[i].x,points[i].z));return;
  }
  assert.fail('No clear combat fixture found');
}
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
  echoGround(tank,primary,near,far);place(healer,tank.x+2,tank.z);
  addBuff(tank,{k:'bond',src:healer.companion.id,until:300,dr:0.45,reflect:6});
  dealDamage(g,primary,tank,7,'auto',{melee:true,kind:'melee'});
  assert.ok(getBuff(primary,'carapace_imprint'));
  const nh=near.hp,fh=far.hp;
  g.setTarget(tank,primary.id);
  assert.ok(useAbility(g,tank,'rending_arc').ok);
  assert.equal(near.hp,nh);
  assert.ok(far.hp<fh);
  assert.equal(getBuff(primary,'carapace_imprint'),null);
  assert.ok(g.events.some(e=>e.e==='fx'&&e.k==='carapace_echo'&&e.z===primary.z));
  tank.cds.rending_arc=0; tank.gcdUntil=0;
  const nh2=near.hp,fh2=far.hp;
  assert.ok(useAbility(g,tank,'rending_arc').ok);
  assert.ok(near.hp<nh2);
  assert.equal(far.hp,fh2);
});

test('expired imprint does not relocate Rending Echo',()=>{
  const g=makeGame(), tank=make(g,'vanguard','glyph_rending_echo');
  const [primary,near,far]=g.enemies.filter(e=>e.type==='skitter');
  echoGround(tank,primary,near,far);
  addBuff(primary,{k:'carapace_imprint',until:0,src:999});
  g.setTarget(tank,primary.id);
  const nh=near.hp,fh=far.hp;
  assert.ok(useAbility(g,tank,'rending_arc').ok);
  assert.ok(near.hp<nh); assert.equal(far.hp,fh);
  assert.ok(!g.events.some(e=>e.k==='carapace_echo'));
});
