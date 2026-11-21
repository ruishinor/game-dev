// Worn 3D chest armour: allowlisted presentation metadata derived by the
// server from the authoritative loadout, the published skinned GLBs, and the
// rendered inventory icons (tools/asset-pipeline route "body-fitted-armour").
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import WebSocket from 'ws';
import { setTimeout as delay } from 'node:timers/promises';
import { ARMOUR_ASSETS, ARMOUR_VISUALS, publicArmourVisual } from '../shared/armour-visual.js';
import { ITEMS } from '../shared/content.js';
import { GOODS } from '../shared/goods.js';
import { RENDERED_ICON_IDS, renderedItemIcon } from '../client/src/item-renders.js';

import { equipItem, unequipSlot } from '../server/sim/progress.js';
import { startServer } from '../server/index.js';
import { makeGame, makeChar } from './helpers.js';

const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
function glbJson(file) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('ascii', 0, 4), 'glTF');
  return JSON.parse(b.slice(20, 20 + b.readUInt32LE(12)).toString('utf8'));
}

test('armour visual lists the equipped, owned modelled pieces per slot and nothing else', () => {
  for (const id of ['field_chest', 'reinforced_chest', 'resonant_chest']) assert.equal(ITEMS[id]?.slot, 'chest', `${id} is a live chest item`);
  for (const id of ARMOUR_VISUALS) if (ITEMS[id]) assert.ok(['chest', 'gloves', 'greaves', 'boots'].includes(ITEMS[id].slot), id);
  const char = makeChar('vanguard', { inventory: ['field_chest'], equipped: { chest: 'field_chest' } });
  assert.deepEqual(publicArmourVisual(char), { chest: 'field_chest' });
  assert.equal(publicArmourVisual({ ...char, inventory: [] }), null, 'not owned');
  assert.equal(publicArmourVisual({ ...char, equipped: { chest: 'untrusted/../path' } }), null);
  assert.equal(publicArmourVisual({ ...char, equipped: { chest: 'relay_carbine' } }), null);
  assert.equal(publicArmourVisual({ ...char, equipped: {} }), null);
  assert.equal(publicArmourVisual(null), null);
});

test('server metadata carries `av` only through real equip/unequip and invalidates on change', () => {
  const game = makeGame();
  const char = makeChar('vanguard', { inventory: ['field_chest', 'reinforced_chest'], equipped: {} });
  const p = game.addPlayer(char);
  const v = p.metaVer;
  assert.equal(game.metaFor(p).av, undefined);
  assert.equal(equipItem(game, p, 'field_chest').ok, true);
  assert.deepEqual(game.metaFor(p).av, { chest: 'field_chest' });
  assert.ok(p.metaVer > v, 'metadata version bumped so observers rebuild');
  const v1 = p.metaVer;
  assert.equal(equipItem(game, p, 'reinforced_chest').ok, true);
  assert.deepEqual(game.metaFor(p).av, { chest: 'reinforced_chest' });
  assert.ok(p.metaVer > v1);
  assert.equal(unequipSlot(game, p, 'chest').ok, true);
  assert.equal(game.metaFor(p).av, undefined);
  // a forged item the player does not own cannot become visible
  assert.equal(equipItem(game, p, 'resonant_chest').ok, false);
  assert.equal(game.metaFor(p).av, undefined);
  const meta = game.metaFor(p);
  assert.equal(meta.inventory, undefined);
  assert.equal(meta.equipped, undefined);
});

test('published armour GLBs: one skinned mesh per item on the shared 67-joint skeleton', () => {
  const manifest = JSON.parse(fs.readFileSync('client/assets/manifest.json', 'utf8'));
  const published = [...new Set(Object.values(ARMOUR_ASSETS))].filter((a) => fs.existsSync(`tools/asset-pipeline/assets/${a}/outputs/export.json`));
  assert.ok(published.includes('armour_chest'));
  for (const [asset, body, bundle] of published.flatMap((a) => [['humanoid_m', `${a}_m`], ['humanoid_f', `${a}_f`]].map(([b, n]) => [a, b, n]))) {
    const report = JSON.parse(fs.readFileSync(`tools/asset-pipeline/assets/${asset}/outputs/export.json`, 'utf8'));
    const items = Object.entries(ARMOUR_ASSETS).filter(([, a]) => a === asset).map(([id]) => id);
    const entry = manifest.assets[bundle];
    assert.ok(entry, `${bundle} in manifest`);
    assert.equal(entry.kind, 'skinned');
    const file = `client/assets/${entry.url}`;
    const digest = sha(file);
    assert.equal(digest.slice(0, 12), entry.hash);
    assert.equal(digest, report[bundle.endsWith('_f') ? 'f' : 'm'].sha256, 'committed GLB matches the pipeline report');
    const g = glbJson(file);
    const bodyG = glbJson(`client/assets/${manifest.assets[body].url}`);
    const jointNames = (j) => j.skins[0].joints.map((i) => j.nodes[i].name);
    assert.deepEqual(jointNames(g), jointNames(bodyG), `${bundle} uses ${body}'s joints in order`);
    const meshes = g.nodes.filter((n) => n.mesh !== undefined).map((n) => ({ name: n.name, skin: n.skin }));
    assert.deepEqual([...new Set(meshes.map((m) => m.name.split('__')[0]))].sort(), [...items].sort());
    for (const m of meshes) assert.notEqual(m.skin, undefined, `${m.name} is skinned`);
    assert.ok(entry.bytes < 9_000_000, `${bundle} stays a bounded download (${entry.bytes} B)`);
    assert.ok(!/cc0/i.test(entry.note || ''), 'derived armour is not described as CC0');
  }
});

test('rendered inventory icons: every armour item, content-hashed, present on disk', () => {
  // inventory renders of armour pieces, and schematic renders of their blueprints
  const piece = (id) => (id.startsWith('blueprint_') ? id.slice('blueprint_'.length) : id);
  for (const id of RENDERED_ICON_IDS) assert.ok(ARMOUR_VISUALS.includes(piece(id)), id);
  for (const id of RENDERED_ICON_IDS.filter((x) => x.startsWith('blueprint_'))) assert.equal(GOODS[id]?.category, 'blueprint', `${id} is a real blueprint`);
  for (const [id, asset] of Object.entries(ARMOUR_ASSETS)) {
    if (fs.existsSync(`tools/asset-pipeline/assets/${asset}/outputs/publish.json`)) assert.ok(RENDERED_ICON_IDS.includes(id), `${id} has a rendered icon`);
  }
  for (const id of RENDERED_ICON_IDS) {
    const url = renderedItemIcon(id);
    const [pathPart, query] = url.split('?v=');
    const file = pathPart.slice(1);
    assert.ok(fs.existsSync(file), file);
    assert.equal(sha(file).slice(0, 12), query, `${id} icon hash`);
    const b = fs.readFileSync(file);
    assert.equal(b.toString('ascii', 0, 4), 'RIFF');
    assert.equal(b.toString('ascii', 8, 12), 'WEBP');
  }
  assert.equal(renderedItemIcon('relay_carbine'), null);
  assert.equal(renderedItemIcon('__proto__'), null);
  assert.equal(renderedItemIcon(42), null);
});

async function until(check, message) {
  const end = Date.now() + 5000;
  while (Date.now() < end) { const v = check(); if (v) return v; await delay(20); }
  throw Error(message);
}
function client(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`), meta = new Map(), messages = [];
  ws.on('error', () => {});
  ws.on('message', (raw) => { const m = JSON.parse(raw); messages.push(m); if (m.t === 's') for (const v of m.meta || []) meta.set(v.i, v); });
  return { ws, meta, messages, async join(name) {
    await until(() => ws.readyState === WebSocket.OPEN, 'socket open');
    ws.send(JSON.stringify({ t: 'create', name, cls: 'vanguard' }));
    return until(() => messages.find((m) => m.t === 'welcome'), 'welcome');
  } };
}

test('a real equip intent replicates the worn armour to observers without private loadout data', async () => {
  const server = await startServer({ port: 0, dataFile: null });
  const owner = client(server.port), observer = client(server.port);
  try {
    const a = await owner.join('Armour One');
    await observer.join('Armour Two');
    const p = server.game.players.get(a.id);
    await until(() => observer.meta.has(p.id), 'observer metadata');
    assert.equal(observer.meta.get(p.id).av, undefined);
    // forged: equipping something not owned changes nothing
    owner.ws.send(JSON.stringify({ t: 'equip', item: 'reinforced_chest' }));
    await delay(150);
    assert.equal(observer.meta.get(p.id).av, undefined);
    p.char.inventory.push('field_chest');
    server.game.markDirty(p);
    owner.ws.send(JSON.stringify({ t: 'equip', item: 'field_chest' }));
    await until(() => owner.meta.get(p.id)?.av?.chest === 'field_chest' && observer.meta.get(p.id)?.av?.chest === 'field_chest', 'replicated worn vest');
    const seen = observer.meta.get(p.id);
    assert.equal(seen.inventory, undefined);
    assert.equal(seen.equipped, undefined);
    owner.ws.send(JSON.stringify({ t: 'unequip', slot: 'chest' }));
    await until(() => observer.meta.get(p.id)?.av === undefined, 'replicated removal');
  } finally {
    owner.ws.close(); observer.ws.close(); await server.close();
  }
});
