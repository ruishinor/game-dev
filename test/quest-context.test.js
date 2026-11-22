import test from 'node:test';
import assert from 'node:assert/strict';
import {dungeonQuestContext,questIsLocalToDungeon} from '../client/src/quest-context.js';
import {trackedEntries,trackingPrefs} from '../client/src/quest-tracking.js';

test('dungeon-focused HUD compacts nonlocal objectives but keeps local quest descriptions',()=>{
 assert.equal(dungeonQuestContext('Phase Annex · Null Chamber'),'annex');
 assert.equal(dungeonQuestContext('Silent Foundry · Fabrication Hall'),'foundry');
 assert.equal(dungeonQuestContext('Severance Expanse · Amber Flats'),null);
 assert.equal(questIsLocalToDungeon({id:'directive:field_trial',group:'Directive',title:'Field Trial'},'annex'),false);
 assert.equal(questIsLocalToDungeon({id:'brine:investigation',title:'Brineworks field investigation'},'foundry'),false);
 assert.equal(questIsLocalToDungeon({id:'field:rift_calibration',title:'Phase Annex signal'},'annex'),true);
 assert.equal(questIsLocalToDungeon({id:'field:foundry_extract',title:'Excavation Depths'},'foundry'),true);
});
test('manual tracked quest selection and saved collapse state are not changed by context',()=>{
 const entries=[
  {id:'directive:field_trial',group:'Directive',title:'Field Trial',status:'active'},
  {id:'brine:investigation',group:'Field',title:'Brineworks',status:'active'},
  {id:'field:foundry_extract',group:'Foundry',title:'Excavation Depths',status:'active'}
 ];
 const prefs=trackingPrefs({keys:['directive','brine','field:foundry_extract'],collapsed:false});
 const saved=JSON.stringify(prefs);
 const selected=trackedEntries(entries,prefs);
 assert.equal(selected.length,3);
 assert.equal(questIsLocalToDungeon(selected[2],'foundry'),true);
 assert.equal(questIsLocalToDungeon(selected[0],'foundry'),false);
 assert.equal(JSON.stringify(prefs),saved,'automatic context must never alter manual tracking');
});
