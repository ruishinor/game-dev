import test from 'node:test';
import assert from 'node:assert/strict';
import {disclosureSignal, addedLines, publicationFindings} from '../tools/publication-preflight.mjs';

test('identifies numeric unpublished reward disclosure without printing it',()=>{
  const example='rare drop roll '+String(7.25)+String.fromCharCode(37);
  assert.equal(disclosureSignal(example),true);
  assert.equal(disclosureSignal('Level 15 character progression'),false);
  assert.equal(disclosureSignal('Your heal is boosted by 5 percent'),false);
});

test('detects numeric source-rule assignment but ignores harmless PR text',()=>{
  const example='chance'+':'+' 0.'+'125';
  assert.equal(disclosureSignal(example),true);
  assert.deepEqual(publicationFindings('Level 15 milestone','+const title = "Level 15";',[]),[]);
});

test('ordinary CSS hidden/width declarations do not impersonate private loot odds',()=>{
 const css='#hud .map-waypoint-brief { overflow:hidden; min-height:36px; max-width:100%; }';
 assert.equal(disclosureSignal(css),false);
 assert.deepEqual(publicationFindings('', '+'+css, ['client/style.css']),[]);
});
test('inspects added lines only and requires restricted reward-table review',()=>{
  assert.deepEqual(addedLines('--- a/old\n+++ b/new\n-removed\n+added\n same'),['added']);
  assert.deepEqual(publicationFindings('', '+const ok = true;', ['server/sim/loot-tables.js']),['restricted reward table changed in public repository']);
});
