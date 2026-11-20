import test from 'node:test';
import assert from 'node:assert/strict';
import {disclosureSignal, addedLines, publicationFindings, isOwnerExemptedScrapyard, excludeApprovedRewardTableDiff} from '../tools/publication-preflight.mjs';

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

test('the owner exemption is restricted to PR 189, the original branch and pinned reward blob',()=>{
 const event={repository:{full_name:'ruishinor/game-dev'},pull_request:{number:189,head:{ref:'claude/expanse-scrapyard'}}};
 const hash='31f8460bfed119b4bff90e53eaed83311a7b96e5';
 assert.equal(isOwnerExemptedScrapyard(event,hash),true);
 assert.equal(isOwnerExemptedScrapyard({...event,pull_request:{...event.pull_request,number:190}},hash),false);
 assert.equal(isOwnerExemptedScrapyard(event,'0000000000000000000000000000000000000000'),false);
 assert.equal(isOwnerExemptedScrapyard({...event,repository:{full_name:'elsewhere/game-dev'}},hash),false);
 const diff=[
   'diff --git a/server/sim/loot-tables.js b/server/sim/loot-tables.js',
   '@@ -1 +1 @@','+const rare = '+String(35)+String.fromCharCode(37)+';',
   'diff --git a/client/src/example.js b/client/src/example.js',
   '@@ -1 +1 @@','+const rate = '+'chance'+':0.9;'
 ].join('\n');
 const remaining=excludeApprovedRewardTableDiff(diff);
 assert.equal(remaining.includes('rare ='),false);
 assert.equal(remaining.includes('chance:0.9'),true);
 assert.deepEqual(publicationFindings('',remaining,['client/src/example.js']),['added source or documentation']);
});
