import test from 'node:test';
import assert from 'node:assert/strict';
import { CLASSES, LOOKS, defaultLook, validLook } from '../shared/content.js';

test('Brine Surveyor is a distinct profession without changing existing class defaults', () => {
  assert.equal(defaultLook('symbiotech'), 'conductor');
  assert.equal(defaultLook('vanguard'), 'vanguard_plate');
  assert.ok(validLook('surveyor', 'brine_surveyor'));
  assert.equal(validLook('symbiotech', 'brine_surveyor'), false);
  assert.equal(CLASSES.surveyor.companion, null);
  assert.equal(defaultLook('surveyor'), 'brine_surveyor');
  assert.equal(validLook('vanguard', 'brine_surveyor'), false);
  assert.equal(new Set(LOOKS.symbiotech.map(x => x.id)).size, LOOKS.symbiotech.length);
  assert.equal(CLASSES.symbiotech.companion, 'mender');
});

import { ZONES, OBJECTS, PROPS, PLAYER_RADIUS, groundHeight, resolveCollisions, zoneAt } from '../shared/world.js';
import { surveyState, surveyHint } from '../shared/survey.js';
import { makeGame, makeChar, place } from './helpers.js';
import { interact } from '../server/sim/progress.js';

for (const route of ['signal', 'ledger']) test('Brineworks: ' + route + ' branch is optional, exclusive and rewarded once', () => {
  const game = makeGame();
  const p = game.addPlayer(makeChar('symbiotech'));
  const source = game.objects.find(o => o.type === 'survey_' + route);
  const other = game.objects.find(o => o.type.startsWith('survey_') && o !== source);
  const venn = game.objects.find(o => o.type === 'archivist');
  assert.equal(interact(game, p, source.id).reason, 'Move closer.');
  place(p, source.x, source.z + 2);
  p.dead = true;
  assert.equal(interact(game, p, source.id).ok, false);
  p.dead = false;
  assert.ok(interact(game, p, source.id).ok);
  assert.equal(p.char.survey, route);
  assert.match(surveyHint(p.char.survey), /return to Archivist Venn/);
  place(p, other.x, other.z + 2);
  assert.ok(interact(game, p, other.id).ok);
  assert.equal(p.char.survey, route);
  place(p, venn.x + 2, venn.z);
  assert.ok(interact(game, p, venn.id).ok);
  assert.equal(p.char.survey, route + '_done');
  assert.equal(p.char.xp, 35);
  assert.equal(p.char.quest.step, 0);
  assert.equal(game.sheet(p).survey, route + '_done');
  assert.ok(interact(game, p, venn.id).ok);
  assert.equal(p.char.xp, 35);
  place(p, source.x, source.z + 2);
  assert.equal(interact(game, p, source.id).ok,false,'commissioning must start at a station');
  assert.equal(p.char.survey, route + '_done');
});

test('Brineworks: valid state, accessible southern approach and both evidence terminals', () => {
  assert.equal(surveyState(undefined), null);
  assert.equal(surveyState('untrusted'), null);
  assert.equal(zoneAt(ZONES.survey.x, ZONES.survey.z), 'Brineworks Cut');
  assert.equal(groundHeight(43, -33), -1.8);
  const free = (x, z) => {
    const p = resolveCollisions({ x, z }, PLAYER_RADIUS);
    assert.ok(Math.hypot(p.x-x, p.z-z) < 1e-6, 'blocked at '+x+', '+z);
  };
  for (let z = -17; z >= -30; z -= 0.5) free(43, z);
  for (const o of OBJECTS.filter(o => o.type.startsWith('survey_'))) free(o.x, o.z+2);
  for (let x = 39; x <= 47; x += 0.5) free(x, -30);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CharacterStore } from '../server/store.js';

test('Brineworks: survey and new appearance survive a save/reload; old and invalid state migrate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attune-survey-'));
  try {
    const file = path.join(dir, 'characters.json');
    const store = new CharacterStore(file);
    const { char, token } = store.create('Brine Tester', 'surveyor', 'brine_surveyor');
    char.survey = 'ledger_done';
    store.flush();
    const restored = new CharacterStore(file).authenticate(token);
    assert.equal(restored.survey, 'ledger_done');
    assert.equal(restored.look, 'brine_surveyor');
    assert.equal(restored.cls, 'surveyor');
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    delete raw.characters[0].survey;
    fs.writeFileSync(file, JSON.stringify(raw));
    assert.equal(new CharacterStore(file).authenticate(token).survey, null);
    // A previously cosmetic Surveyor stays a Conductor; do not rewrite profession or equipment.
    raw.characters[0].cls = 'symbiotech';
    fs.writeFileSync(file, JSON.stringify(raw));
    const legacy = new CharacterStore(file).authenticate(token);
    assert.equal(legacy.cls, 'symbiotech');
    assert.equal(legacy.look, 'conductor');
    raw.characters[0].cls = 'surveyor';
    raw.characters[0].survey = 'invalid';
    fs.writeFileSync(file, JSON.stringify(raw));
    assert.equal(new CharacterStore(file).authenticate(token).survey, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});


test('Brineworks research station has an authoritative collider and a clear southern approach', () => {
  const stations = PROPS.filter(p => p.type === 'survey_workstation');
  assert.equal(stations.length, 1);
  const station = stations[0];
  const atCentre = resolveCollisions({x: station.x, z: station.z}, PLAYER_RADIUS);
  assert.ok(Math.abs(atCentre.x-station.x) >= station.hw || Math.abs(atCentre.z-station.z) >= station.hd);
  for (let z = -34; z >= -37; z -= 0.25) {
    const p = resolveCollisions({x: station.x, z}, PLAYER_RADIUS);
    assert.ok(Math.hypot(p.x-station.x,p.z-z) < 1e-6, 'station approach blocked at '+z);
  }
});

test('engineering station retains clear access to research and evidence', () => {
  const station = PROPS.find(p => p.type === 'survey_engineering');
  assert.ok(station);
  const atCentre = resolveCollisions({x: station.x, z: station.z}, PLAYER_RADIUS);
  assert.ok(Math.abs(atCentre.x-station.x) >= station.hw || Math.abs(atCentre.z-station.z) >= station.hd);
  for (let z = -34.25; z >= -37; z -= 0.25) {
    const pos = resolveCollisions({x:49,z}, PLAYER_RADIUS);
    assert.ok(Math.hypot(pos.x-49,pos.z-z) < 1e-6, 'engineering approach blocked at '+z);
  }
});
