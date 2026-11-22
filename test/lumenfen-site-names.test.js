import test from 'node:test';
import assert from 'node:assert/strict';
import {LUMENFEN,FEN_SITES,fenArea,inLumenfen} from '../shared/lumenfen.js';

const physicalNames={
  'veil-landing':'Veil Landing',
  'mossbound-thicket':'Mossbound Thicket',
  'glasswater-spring':'Glasswater Spring',
  'root-crown-hollow':'Root-Crown Hollow',
  'tidal-weir':'Tidal Mycelium',
  'luminous-canopy':'Luminous Canopy',
};

test('each of the six authored landmark cores reports its own physical location',()=>{
  assert.equal(FEN_SITES.length,6);
  for(const site of FEN_SITES){
    assert.ok(inLumenfen(site.x,site.z),site.id+' must be inside the region');
    assert.equal(fenArea(site.x,site.z),physicalNames[site.id],
      site.id+' was mislabelled by a generic coordinate band');
    assert.equal(fenArea(site.x+site.clearance*.45,site.z),physicalNames[site.id],
      site.id+' should keep its name across the local structure');
  }
});

test('physical landmark label correction preserves portal threshold identities',()=>{
  assert.equal(fenArea(LUMENFEN.arrival.x,LUMENFEN.arrival.z),'Veil Landing');
  assert.equal(fenArea(LUMENFEN.springRift.x,LUMENFEN.springRift.z),'Glasswater Spring');
  assert.equal(fenArea(LUMENFEN.crownRift.x,LUMENFEN.crownRift.z),'Root-Crown Hollow');
});
