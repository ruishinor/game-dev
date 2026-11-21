import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { makeGame, makeChar, place } from './helpers.js';
import { MAX_LEVEL } from '../shared/content.js';
import { WORLD, RIFT_ANNEX, travelRegionAt, inSafeZone } from '../shared/world.js';
import { gmIds, gmAuthorized, executeGm, GM_HELP } from '../server/gm.js';
import { CharacterStore } from '../server/store.js';
import { startServer } from '../server/index.js';
import { dealDamage } from '../server/sim/combat.js';

test('GM allowlist defaults off and accepts only account UUIDs', () => {
  const id = '2ad75896-3e75-46a7-9f4c-20b467d2ae71';
  assert.equal(gmIds().size, 0);
  assert.equal(gmIds('admin,guest,not-a-uuid').size, 0);
  assert.deepEqual([...gmIds(' ' + id.toUpperCase() + ',' + id + ' ')], [id]);
  assert.equal(gmAuthorized({}, gmIds(id), null, null, null), false);
});

test('GM level and unlock respect the current server cap and are replay-safe', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard')), other = g.addPlayer(makeChar('vanguard'));
  assert.ok(GM_HELP.includes('1–' + MAX_LEVEL));
  assert.equal(executeGm(g, p, 'level ' + MAX_LEVEL).ok, true);
  assert.equal(p.char.level, MAX_LEVEL);
  assert.equal(p.char.xp, 0);
  assert.equal(p.hp, p.maxHp);
  assert.equal(other.char.level, 1);
  for (const invalid of ['level 0', 'level -1', 'level 01', 'level 0x2', 'level 2.5',
    'level ' + (MAX_LEVEL + 1), 'level NaN', 'level Infinity', 'teleport reach',
    'unknown', 'unlock extra', 'god always', 'tp foundry', 'tp expanse', 'tp 10,20']) {
    assert.equal(executeGm(g, p, invalid).ok, false, invalid);
  }
  assert.equal(executeGm(g, p, 'unlock').ok, true);
  assert.equal(executeGm(g, p, 'unlock').ok, true);
  assert.equal(p.char.riftCalibration, 'completed');
  assert.deepEqual(p.char.attunements.filter(a => a === 'resonance'), ['resonance']);
  assert.equal(other.char.attunements.length, 0);
  assert.equal(executeGm(g, p, 'status').ok, true);
});

test('teleport resolves within real regions without opening shared world encounters', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('keeper'));
  const before = { expanse: g.expanseOpened, annex: g.annexOpened, foundry: g.foundryOpened };
  assert.equal(executeGm(g, p, 'tp reach').ok, true);
  assert.equal(travelRegionAt(p.x, p.z), 'reach');
  assert.ok(Math.hypot(p.x - WORLD.spawn.x, p.z - WORLD.spawn.z) < 2);
  assert.equal(executeGm(g, p, 'tp annex').ok, true);
  assert.equal(travelRegionAt(p.x, p.z), 'phase_annex');
  assert.ok(Math.hypot(p.x - RIFT_ANNEX.x, p.z - RIFT_ANNEX.arrivalZ) < 8);
  assert.deepEqual({ expanse: g.expanseOpened, annex: g.annexOpened, foundry: g.foundryOpened }, before);
  assert.deepEqual(p.char.pos, WORLD.spawn, 'disconnected encounter location must not be persisted');
  assert.equal(executeGm(g, p, 'tp reach').ok, true);
  assert.equal(executeGm(g, p, 'tp scar').ok, true);
  assert.equal(travelRegionAt(p.x, p.z), 'reach');
});

test('real outside-safe-zone damage baseline proves session-only invulnerability', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard'));
  place(p, -42, 26);
  assert.equal(inSafeZone(p), false, 'damage baseline must not be in a safe zone');
  const start = p.hp;
  assert.ok(dealDamage(g, null, p, 20, 'gm_probe') > 0);
  assert.ok(p.hp < start);
  assert.equal(executeGm(g, p, 'heal').ok, true);
  assert.equal(executeGm(g, p, 'god on').ok, true);
  assert.equal(dealDamage(g, null, p, 50, 'gm_probe'), 0);
  assert.equal(p.hp, p.maxHp);
  assert.equal(p.char.gmInvulnerable, undefined);
  assert.equal(executeGm(g, p, 'god off').ok, true);
  assert.ok(dealDamage(g, null, p, 10, 'gm_probe') > 0);
});

async function connect(port) {
  const ws = new WebSocket('ws://127.0.0.1:' + port + '/ws');
  const msgs = [];
  ws.on('message', chunk => msgs.push(JSON.parse(chunk.toString())));
  ws.on('error', () => {});
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  return { ws, msgs, send: msg => ws.send(JSON.stringify(msg)) };
}
async function until(check, detail) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  throw new Error('Timed out: ' + detail);
}
const messages = (conn, expression) => conn.msgs.find(expression);

test('real WebSocket: signed-in owner, guest, wrong owner, revoked session and reconnect isolation', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'attune-gm-'));
  const file = path.join(dir, 'characters.json');
  const password = 'Example-GmOnly-Password-2026!';
  const seed = new CharacterStore(file);
  const owner = await seed.registerAccount('PreviewOwner', password);
  const outsider = await seed.registerAccount('PreviewOther', password);
  const ownChar = seed.createForAccount(owner.account, 'OwnerPreview', 'vanguard').char;
  const otherChar = seed.createForAccount(outsider.account, 'OtherPreview', 'keeper').char;
  seed.flush();
  const prior = process.env.ATTUNEMENT_GM_ACCOUNT_IDS;
  process.env.ATTUNEMENT_GM_ACCOUNT_IDS = owner.account.id;
  let srv;
  try {
    srv = await startServer({ port: 0, dataFile: file });
  } finally {
    if (prior === undefined) delete process.env.ATTUNEMENT_GM_ACCOUNT_IDS;
    else process.env.ATTUNEMENT_GM_ACCOUNT_IDS = prior;
  }
  const clients = [];
  try {
    const a = await connect(srv.port); clients.push(a);
    a.send({ t: 'account_login', handle: 'PreviewOwner', password });
    const ready = await until(() => messages(a, m => m.t === 'account_ready'), 'owner login');
    assert.ok(ready.token);
    a.send({ t: 'account_select', id: ownChar.id });
    await until(() => messages(a, m => m.t === 'welcome'), 'owner select');
    const ownerConn = [...srv.net.conns].find(c => c.char?.id === ownChar.id);
    assert.ok(gmAuthorized(ownerConn, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game));
    assert.equal(gmAuthorized({ ...ownerConn, char: { ...ownerConn.char } }, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
    assert.equal(gmAuthorized({ ...ownerConn, player: { ...ownerConn.player } }, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
    assert.equal(gmAuthorized({ ...ownerConn, accountToken: 'f'.repeat(64) }, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
    a.send({ t: 'gm', line: 'level ' + MAX_LEVEL });
    await until(() => srv.store.chars.get(ownChar.id)?.level === MAX_LEVEL, 'owner level');
    a.send({ t: 'gm', line: 'unlock' });
    await until(() => srv.store.chars.get(ownChar.id)?.riftCalibration === 'completed', 'owner unlock');
    a.send({ t: 'gm', line: 'tp annex' });
    await until(() => travelRegionAt(ownerConn.player.x, ownerConn.player.z) === 'phase_annex', 'owner annex transfer');
    assert.ok(!srv.game.annexOpened, 'GM teleport cannot spawn a shared encounter');
    a.send({ t: 'gm', line: 'god on' });
    await until(() => ownerConn.player.gmInvulnerable === true, 'owner god on');
    a.send({ t: 'gm', line: 'level ' + (MAX_LEVEL + 1) });
    await until(() => ownerConn.player.outbox.some(e => /Level must be/.test(e.m)) || 
      a.msgs.some(m => m.t === 's' && m.pv?.some(e => /Level must be/.test(e.m))), 'out of range denied');
    assert.equal(ownerConn.char.level, MAX_LEVEL);

    const b = await connect(srv.port); clients.push(b);
    b.send({ t: 'account_login', handle: 'PreviewOther', password });
    await until(() => messages(b, m => m.t === 'account_ready'), 'other login');
    b.send({ t: 'account_select', id: ownChar.id });
    await until(() => messages(b, m => m.t === 'account_fail' && /does not belong/.test(m.reason)), 'forged character rejected');
    b.send({ t: 'account_select', id: otherChar.id });
    await until(() => messages(b, m => m.t === 'welcome'), 'other select');
    b.send({ t: 'gm', line: 'level ' + MAX_LEVEL });
    await until(() => messages(b, m => m.t === 's' && m.pv?.some(e => /GM access denied/.test(e.m))), 'other GM denial');
    assert.equal(srv.store.chars.get(otherChar.id).level, 1);

    const guest = await connect(srv.port); clients.push(guest);
    guest.send({ t: 'create', name: 'PlainVisitor', cls: 'vanguard' });
    await until(() => messages(guest, m => m.t === 'welcome'), 'guest create');
    guest.send({ t: 'gm', line: 'level ' + MAX_LEVEL });
    await until(() => messages(guest, m => m.t === 's' && m.pv?.some(e => /GM access denied/.test(e.m))), 'guest GM denial');
    assert.equal(srv.store.byName.get('plainvisitor').level, 1);

    a.send({ t: 'account_leave' });
    await until(() => a.msgs.filter(m => m.t === 'account_ready').length > 1, 'owner leaves character');
    a.send({ t: 'account_select', id: ownChar.id });
    await until(() => a.msgs.filter(m => m.t === 'welcome').length > 1, 'owner reconnects character');
    const resumed = [...srv.net.conns].find(c => c.char?.id === ownChar.id);
    assert.notEqual(resumed.player, ownerConn.player, 'fresh entity on character reselection');
    assert.notEqual(resumed.player.gmInvulnerable, true, 'god mode cannot leak across sessions');
    assert.equal(resumed.char.level, MAX_LEVEL);
    assert.equal(travelRegionAt(resumed.player.x, resumed.player.z), 'reach', 'annex does not persist on reconnect');

    srv.store.revokeAccountSession(resumed.account, ready.token);
    a.send({ t: 'gm', line: 'god on' });
    await until(() => a.msgs.some(m => m.t === 'account_fail'), 'revocation enforced');
    assert.equal(gmAuthorized(resumed, srv.net.gmAccounts, srv.store, srv.net.sessions, srv.game), false);
  } finally {
    for (const c of clients) c.ws.terminate();
    await srv.close();
  }
  const record = JSON.parse(fs.readFileSync(file, 'utf8'));
  const persisted = record.characters.find(c => c.id === ownChar.id);
  assert.equal(persisted.level, MAX_LEVEL);
  assert.equal(persisted.riftCalibration, 'completed');
  assert.equal(persisted.gmInvulnerable, undefined);
  assert.equal(record.characters.find(c => c.id === otherChar.id).level, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
