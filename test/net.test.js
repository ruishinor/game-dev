// Integration tests: real HTTP + WebSocket server, real sockets, real file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { CharacterStore } from '../server/store.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'attune-')), 'characters.json');

class Client {
  constructor(port) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.msgs = [];
    this.snap = null;
    this.sheet = null;
    this.events = [];
    this.closed = null;
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 's') {
        this.snap = m;
        if (m.sheet) this.sheet = m.sheet;
        this.events.push(...m.ev, ...(m.pv || []));
      } else this.msgs.push(m);
    });
    this.ws.on('close', (code) => {
      this.closed = code;
    });
    this.ws.on('error', () => {});
  }
  open() {
    return new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
    });
  }
  send(obj) {
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  async until(fn, ms = 3000, what = 'condition') {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error(`timed out waiting for ${what}`);
  }
  async create(name, cls) {
    await this.open();
    this.send({ t: 'create', name, cls });
    const w = await this.until(() => this.msgs.find((m) => m.t === 'welcome' || m.t === 'create_fail'), 3000, 'welcome');
    this.welcome = w;
    return w;
  }
  async resume(token) {
    await this.open();
    this.send({ t: 'resume', token });
    const w = await this.until(() => this.msgs.find((m) => m.t === 'welcome' || m.t === 'auth_fail'), 3000, 'welcome');
    this.welcome = w;
    return w;
  }
  me() {
    return this.snap?.ents.find((e) => e.i === this.welcome.id);
  }
  ent(id) {
    return this.snap?.ents.find((e) => e.i === id);
  }
  close() {
    this.ws.close();
  }
}

test('http: serves the client, blocks traversal and unknown paths', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const index = await fetch(base + '/');
    assert.equal(index.status, 200);
    assert.match(index.headers.get('content-type'), /text\/html/);
    assert.equal(index.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(index.headers.get('content-security-policy'));
    assert.equal((await fetch(base + '/shared/content.js')).status, 200);
    assert.equal((await fetch(base + '/vendor/three/three.module.js')).status, 200);
    for (const bad of ['/server/index.js', '/package.json', '/client/%2e%2e/package.json', '/shared/..%2fserver/store.js', '/vendor/three/three.cjs', '/data/characters.json', '/client/../data/characters.json']) {
      assert.equal((await fetch(base + bad)).status, 404, bad);
    }
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  } finally {
    await srv.close();
  }
});

test('multiplayer: two clients share one world, see each other, fight the same enemy and heal across players', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  const a = new Client(srv.port);
  const b = new Client(srv.port);
  try {
    const wa = await a.create('Brakka', 'vanguard');
    const wb = await b.create('Lumen', 'symbiotech');
    assert.equal(wa.t, 'welcome');
    assert.match(wa.token, /^[0-9a-f]{64}$/);
    assert.ok(wb.comp > 0, 'symbiotech is told its companion id');
    await a.until(() => a.ent(wb.id) && b.ent(wa.id), 3000, 'mutual visibility');
    assert.ok(a.sheet && a.sheet.name === 'Brakka');

    // Movement: A walks forward; B observes A's authoritative position change.
    const startZ = b.ent(wa.id).z;
    let seq = 0;
    for (let i = 0; i < 30; i++) {
      a.send({ t: 'in', s: [[++seq, 1, 0, 0, 0], [++seq, 1, 0, 0, 0], [++seq, 1, 0, 0, 0]] });
      await new Promise((r) => setTimeout(r, 50));
    }
    await b.until(() => b.ent(wa.id).z > startZ + 5, 3000, 'B sees A move');
    assert.equal(a.snap.y.ack, seq, 'inputs acknowledged');

    // Shared combat: move both next to the same skitter (server-side teleport
    // stands in for the walk), then fight it from both sockets.
    const game = srv.game;
    const skitter = game.enemies.find((e) => e.type === 'skitter');
    for (const e of game.enemies) if (e !== skitter) { e.state = 'dead'; e.respawnAt = Infinity; e.deadAt = -1e9; }
    const pa = game.players.get(wa.id);
    const pb = game.players.get(wb.id);
    pa.x = skitter.x; pa.z = skitter.z + 2.5;
    pb.x = skitter.x + 8; pb.z = skitter.z + 8;
    a.send({ t: 'tgt', id: skitter.id });
    b.send({ t: 'tgt', id: skitter.id });
    a.send({ t: 'use', a: 'rending_arc' });
    b.send({ t: 'use', a: 'neural_lash' });
    await a.until(() => a.events.some((e) => e.e === 'dmg' && e.s === wb.id && e.d === skitter.id), 3000, 'A sees B damage the skitter');
    await b.until(() => b.events.some((e) => e.e === 'dmg' && e.s === wa.id && e.d === skitter.id), 3000, 'B sees A damage the skitter');
    assert.equal(a.ent(skitter.id).h, b.ent(skitter.id).h, 'both see the same enemy health');

    // Cross-player support: B heals A; A observes it. Companion triage too.
    pa.hp = 80;
    b.send({ t: 'tgt', id: wa.id });
    await new Promise((r) => setTimeout(r, 1100));
    b.send({ t: 'use', a: 'mending_graft' });
    await a.until(() => a.events.some((e) => e.e === 'heal' && e.s === wb.id && e.d === wa.id && e.ab === 'mending_graft'), 3000, 'A sees the graft');
    await a.until(() => a.events.some((e) => e.e === 'heal' && e.s === wb.comp && e.d === wa.id && e.ab === 'triage'), 5000, "A is mended by B's symbiote");
    const comp = a.ent(wb.comp);
    assert.equal(comp.md, 'triage');

    // Companion command over the wire, observed by the other player.
    b.send({ t: 'pet', c: 'guard' });
    await a.until(() => a.ent(wb.comp).md === 'guard' && a.ent(wb.comp).hs === wa.id, 3000, 'A sees the symbiote bond to them');
    await a.until(() => a.me().b.includes('bond'), 3000, 'bond buff visible');

    // Kill it together; both get credit.
    skitter.hp = 5;
    a.send({ t: 'tgt', id: skitter.id });
    await new Promise((r) => setTimeout(r, 3200));
    a.send({ t: 'use', a: 'rending_arc' });
    await a.until(() => a.events.some((e) => e.e === 'die' && e.id === skitter.id), 3000, 'skitter dies');
    await b.until(() => b.events.some((e) => e.e === 'xp'), 3000, 'B gets xp');
    assert.ok(a.events.some((e) => e.e === 'xp'));
  } finally {
    a.close();
    b.close();
    await srv.close();
  }
});

test('security: clients cannot act for others, forge state, or crash the server with junk', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  const a = new Client(srv.port);
  const b = new Client(srv.port);
  const junk = new Client(srv.port);
  try {
    const wa = await a.create('Alpha', 'vanguard');
    const wb = await b.create('Beta', 'symbiotech');
    await a.until(() => a.sheet && a.snap);
    const pa = srv.game.players.get(wa.id);
    const pb = srv.game.players.get(wb.id);

    // Forged fields are ignored: there is no message that sets hp, xp or items.
    a.send({ t: 'use', a: 'rending_arc', dmg: 99999, target: wb.id, hp: 1 });
    a.send({ t: 'equip', item: 'myelin_lattice' });
    a.send({ t: 'equip', item: 'glyph_resonant_aegis', owner: wb.id });
    a.send({ t: 'pet', c: 'guard', owner: wb.id, id: wb.comp });
    a.send({ t: 'sheet', level: 5, inventory: ['wardstone_shard'] });
    a.send({ t: 'in', s: [[1, 1, 0, 0, 0, 500, 500]] });
    a.send({ t: 'in', s: [[2, 1e9, 1e9, 0, 0]] });
    a.send({ t: 'in', s: [[3, NaN, 'x', {}, 0]] });
    a.send({ t: 'tgt', id: -5 });
    a.send({ t: 'tgt', id: 1.5 });
    a.send({ t: 'chat', m: '<img src=x onerror=alert(1)>\u0000\u0007' + 'x'.repeat(500) });
    a.send('not json at all');
    a.send('[1,2,3]');
    a.send('null');
    a.send(JSON.stringify({ t: 'respawn' }));
    await b.until(() => b.events.some((e) => e.e === 'chat'), 3000, 'chat relayed');
    const chat = b.events.find((e) => e.e === 'chat');
    assert.equal(chat.n, 'Alpha', 'chat is attributed by the server, not the client');
    assert.ok(chat.m.length <= 140);
    assert.ok(!/[\u0000-\u001f]/.test(chat.m));
    assert.deepEqual(pa.char.inventory, []);
    assert.equal(pa.char.level, 1);
    assert.equal(pb.companion.mode, 'triage', "A could not command B's companion");
    assert.equal(pb.hp, pb.maxHp);
    assert.equal(pa.dead, false);
    assert.ok(Math.hypot(pa.x, pa.z) < 20, 'no teleport from forged movement');
    assert.ok(a.events.some((e) => e.e === 'msg' && e.k === 'err'), 'refusals are explained to the sender');

    // Unauthenticated sockets can do nothing but authenticate.
    await junk.open();
    junk.send({ t: 'use', a: 'rending_arc' });
    junk.send({ t: 'resume', token: 'nope' });
    junk.send({ t: 'resume', token: 'f'.repeat(64) });
    await junk.until(() => junk.msgs.filter((m) => m.t === 'auth_fail').length === 2, 3000, 'auth failures');
    assert.equal(junk.snap, null, 'no world data before authentication');

    // Oversized frames close the socket (ws maxPayload) without harming others.
    const big = new Client(srv.port);
    await big.open();
    big.send('x'.repeat(10000));
    await big.until(() => big.closed !== null, 3000, 'oversized frame rejected');

    // A flood is rate limited and eventually disconnected.
    const flood = new Client(srv.port);
    await flood.create('Flooder', 'vanguard');
    for (let i = 0; i < 4000; i++) flood.send({ t: 'ping', c: i });
    await flood.until(() => flood.closed !== null, 5000, 'flooder disconnected');
    assert.equal(flood.closed, 4002);

    // The server is still healthy for everyone else.
    const before = a.snap.time;
    await a.until(() => a.snap.time > before + 200, 3000, 'ticks continue');
  } finally {
    a.close();
    b.close();
    junk.close();
    await srv.close();
  }
});

test('names: validated and unique', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const mk = async (name, cls = 'vanguard') => {
      const c = new Client(srv.port);
      const r = await c.create(name, cls);
      c.close();
      return r;
    };
    assert.equal((await mk('Vessa')).t, 'welcome');
    assert.equal((await mk('vessa')).t, 'create_fail', 'case-insensitive uniqueness');
    for (const bad of ['', 'ab', '<script>', 'a'.repeat(40), '  Bob  ', 'x--y', 42, null]) {
      assert.equal((await mk(bad)).t, 'create_fail', String(bad));
    }
    assert.equal((await mk('Okay Name', 'wizard')).t, 'create_fail');
  } finally {
    await srv.close();
  }
});

test('persistence: progress survives disconnect, reconnect and a full server restart', async () => {
  const file = tmpFile();
  let srv = await startServer({ port: 0, dataFile: file });
  let token;
  try {
    const a = new Client(srv.port);
    const w = await a.create('Persisto', 'symbiotech');
    token = w.token;
    const p = srv.game.players.get(w.id);
    // Earn things the legitimate way on the server.
    const { grantItem, grantXp, equipItem } = await import('../server/sim/progress.js');
    grantItem(srv.game, p, 'sporeglass_focus');
    grantItem(srv.game, p, 'myelin_lattice');
    grantXp(srv.game, p, 100);
    a.send({ t: 'equip', item: 'sporeglass_focus' });
    a.send({ t: 'equip', item: 'myelin_lattice' });
    a.send({ t: 'pet', c: 'assist' });
    await a.until(() => a.sheet && a.sheet.equipped.implant === 'myelin_lattice', 3000, 'equip applied');
    p.x = 20;
    p.z = 30;
    p.hp = 77;
    p.combatUntil = srv.game.time + 60000;
    a.close();
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(srv.game.players.size, 0, 'player left the world on disconnect');

    // Reconnect to the same running server.
    const b = new Client(srv.port);
    const wb = await b.resume(token);
    assert.equal(wb.t, 'welcome');
    assert.equal(wb.token, undefined, 'token is only ever sent at creation');
    await b.until(() => b.sheet && b.me());
    assert.equal(b.sheet.level, 2);
    assert.deepEqual(b.sheet.equipped, { device: 'sporeglass_focus', implant: 'myelin_lattice', glyph: null });
    assert.ok(Math.abs(b.me().x - 20) < 0.5 && Math.abs(b.me().z - 30) < 0.5, 'position restored');
    assert.ok(b.me().h >= 77 && b.me().h < 90, 'health restored, not refilled');
    assert.equal(b.ent(wb.comp).md, 'assist', 'companion mode restored');
    b.close();
  } finally {
    await srv.close();
  }

  // The token itself is not on disk.
  const disk = fs.readFileSync(file, 'utf8');
  assert.ok(!disk.includes(token));

  // Cold restart from disk.
  srv = await startServer({ port: 0, dataFile: file });
  try {
    const c = new Client(srv.port);
    const wc = await c.resume(token);
    assert.equal(wc.t, 'welcome');
    await c.until(() => c.sheet);
    assert.equal(c.sheet.name, 'Persisto');
    assert.equal(c.sheet.level, 2);
    assert.deepEqual(c.sheet.inventory.sort(), ['myelin_lattice', 'sporeglass_focus']);
    assert.equal(c.sheet.equipped.implant, 'myelin_lattice');
    assert.equal(c.sheet.stats.healMul, 1.3);
    c.close();
  } finally {
    await srv.close();
  }
});

test('sessions: a second login replaces the first; the character never exists twice', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const a = new Client(srv.port);
    const w = await a.create('Twin', 'vanguard');
    const b = new Client(srv.port);
    const wb = await b.resume(w.token);
    assert.equal(wb.t, 'welcome');
    await a.until(() => a.closed !== null, 3000, 'old session closed');
    assert.equal(a.closed, 4001);
    assert.equal(srv.game.players.size, 1);
    assert.equal([...srv.game.players.values()][0].name, 'Twin');
    await b.until(() => b.snap && b.me(), 3000);
    b.close();
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(srv.game.players.size, 0);
    assert.equal(srv.game.companions.length, 0);
  } finally {
    await srv.close();
  }
});

test('disconnect mid-fight: enemies drop the player, companions are removed, others carry on', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const a = new Client(srv.port);
    const b = new Client(srv.port);
    const wa = await a.create('Stayer', 'vanguard');
    const wb = await b.create('Leaver', 'symbiotech');
    const game = srv.game;
    const e = game.enemies.find((x) => x.type === 'skitter');
    const pb = game.players.get(wb.id);
    pb.x = e.x;
    pb.z = e.z + 10;
    b.send({ t: 'tgt', id: e.id });
    b.send({ t: 'use', a: 'neural_lash' });
    b.send({ t: 'pet', c: 'guard' });
    await a.until(() => a.ent(e.id) && a.ent(e.id).t === wb.id, 3000, 'enemy targets B');
    b.ws.terminate();
    await a.until(() => !a.ent(wb.id) && !a.ent(wb.comp), 3000, 'B and its companion vanish for A');
    await a.until(() => a.ent(e.id).t === 0, 3000, 'enemy lets go');
    assert.ok(!e.threat.has(wb.id));
    assert.equal(game.companions.length, 0);
    assert.ok(a.me(), 'A is unaffected');
    a.close();
  } finally {
    await srv.close();
  }
});

test('store: corrupt or tampered files never crash or cross-contaminate characters', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{ this is not json');
  const s1 = new CharacterStore(file);
  assert.equal(s1.chars.size, 0);
  assert.ok(fs.readdirSync(path.dirname(file)).some((f) => f.includes('.corrupt-')), 'unreadable file is kept, not overwritten');

  const s2 = new CharacterStore(file);
  const { char, token } = s2.create('Honest', 'vanguard');
  const other = s2.create('Other', 'symbiotech');
  s2.flush();
  // Tamper: give Honest impossible state and a duplicate of Other's identity.
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const rec = data.characters.find((c) => c.id === char.id);
  rec.level = 99;
  rec.inventory = ['glyph_shared_pulse', 'not_an_item', 'glyph_shared_pulse'];
  rec.equipped = { device: null, implant: 'myelin_lattice', glyph: 'glyph_shared_pulse' };
  rec.attunements = ['resonance', 'godmode'];
  data.characters.push({ ...data.characters.find((c) => c.id === other.char.id), id: 'dupe', name: 'OTHER' });
  data.characters.push({ id: 'broken' }, null, 7);
  fs.writeFileSync(file, JSON.stringify(data));
  const s3 = new CharacterStore(file);
  assert.equal(s3.chars.size, 2);
  const loaded = s3.authenticate(token);
  assert.equal(loaded.name, 'Honest');
  assert.equal(loaded.level, 1, 'out-of-range level reset');
  assert.deepEqual(loaded.inventory, ['glyph_shared_pulse']);
  assert.deepEqual(loaded.equipped, { device: null, implant: null, glyph: null }, 'invalid loadout cleared');
  assert.deepEqual(loaded.attunements, ['resonance']);
  assert.equal(s3.authenticate(other.token).name, 'Other');
  assert.equal(s3.authenticate('f'.repeat(64)), null);
  assert.equal(s3.authenticate({ toString: () => token }), null);
});
