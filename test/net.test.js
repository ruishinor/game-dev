// Integration tests: real HTTP + WebSocket server, real sockets, real file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';
import { CharacterStore } from '../server/store.js';
import { RESPAWN_DELAY_MS, CORPSE_MS } from '../server/sim/game.js';
import { dealDamage } from '../server/sim/combat.js';

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'attune-')), 'characters.json');

class Client {
  constructor(port) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.msgs = [];
    this.meta = new Map();
    // Mirror the browser's entity creation/removal lifecycle. Metadata alone
    // is not a rendered entity: a returning ID needs a fresh metadata row.
    this.rendered = new Set();
    this.snap = null;
    this.sheet = null;
    this.events = [];
    this.closed = null;
    this.ws.on('message', (d) => {
      const m = JSON.parse(d.toString());
      if (m.t === 's') {
        this.snap = m;
        for (const meta of m.meta || []) {
          this.meta.set(meta.i, meta);
          this.rendered.add(meta.i);
        }
        const visible = new Set(m.ents.map((row) => row.i));
        for (const id of this.rendered) if (!visible.has(id)) this.rendered.delete(id);
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
    // The socket may already be open if another client was awaited first.
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
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
  async create(name, cls, look) {
    await this.open();
    this.send({ t: 'create', name, cls, look });
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

test('http: built assets and the loader modules are served narrowly, with the right types and caching', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  try {
    const base = `http://127.0.0.1:${srv.port}`;
    const manifest = await (await fetch(base + '/client/assets/manifest.json')).json();
    const entry = manifest.assets.creatures;
    const glb = await fetch(`${base}/client/assets/${entry.url}?v=${entry.hash}`);
    assert.equal(glb.status, 200);
    assert.equal(glb.headers.get('content-type'), 'model/gltf-binary');
    assert.match(glb.headers.get('cache-control'), /immutable/, 'hashed asset URLs are cacheable forever');
    assert.equal(Number(glb.headers.get('content-length')), entry.bytes);
    assert.equal((await fetch(`${base}/client/assets/${entry.url}`)).headers.get('cache-control'), 'no-cache', 'unversioned requests are revalidated');
    assert.equal((await fetch(`${base}/shared/world.js?v=${entry.hash}`)).headers.get('cache-control'), 'no-cache', 'only /client/assets/ is ever immutable');
    assert.equal((await fetch(`${base}/client/assets/tex/ground_albedo.webp`)).headers.get('content-type'), 'image/webp');
    // Exactly the three.js modules the client imports, nothing else from the package.
    for (const ok of ['loaders/GLTFLoader.js', 'utils/SkeletonUtils.js', 'utils/BufferGeometryUtils.js', 'libs/meshopt_decoder.module.js']) {
      assert.equal((await fetch(`${base}/vendor/three-addons/${ok}`)).status, 200, ok);
    }
    for (const bad of ['/vendor/three-addons/loaders/DRACOLoader.js', '/vendor/three-addons/controls/OrbitControls.js', '/vendor/three-addons/../../package.json', '/assets/sources.json', '/assets/recipe.mjs', '/tools/assets/build.mjs', '/tools/browser.mjs', '/.asset-cache/ual1/universal_animation_librarystandard.zip', '/node_modules/sharp/package.json', '/docs/HANDOFF.md']) {
      assert.equal((await fetch(base + bad)).status, 404, bad);
    }
    // The page's inline import map is allowed by hash; no blanket inline or eval.
    const csp = (await fetch(base + '/')).headers.get('content-security-policy');
    assert.match(csp, /script-src 'self' 'wasm-unsafe-eval' 'sha256-[A-Za-z0-9+/=]+'/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
    assert.doesNotMatch(csp, /'unsafe-eval'/);
  } finally {
    await srv.close();
  }
});

test('looks: a cosmetic appearance is stored, relayed to other players, validated, and never changes rules', async () => {
  const file = tmpFile();
  let srv = await startServer({ port: 0, dataFile: file });
  let token;
  try {
    const a = new Client(srv.port);
    const b = new Client(srv.port);
    const c = new Client(srv.port);
    const d = new Client(srv.port);
    const wa = await a.create('Rucker', 'vanguard', 'red_rucker');
    const wb = await b.create('Plain', 'vanguard');
    const wc = await c.create('Wrong', 'symbiotech', 'red_rucker'); // not a look of that class
    const wd = await d.create('Junk', 'vanguard', { toString: 1 }); // not even a string
    token = wa.token;
    await b.until(() => b.meta.has(wa.id) && b.meta.has(wc.id) && b.meta.has(wd.id), 3000, 'meta for the others');
    assert.equal(b.meta.get(wa.id).a, 'red_rucker', 'another player is told the chosen look');
    assert.equal(b.meta.get(wa.id).c, 'vanguard', 'the look does not replace the class');
    await a.until(() => a.meta.has(wb.id), 3000, 'meta for b');
    assert.equal(a.meta.get(wb.id).a, 'vanguard_plate', 'no choice means the class default');
    assert.equal(b.meta.get(wc.id).a, 'conductor', "another class's look falls back to the default");
    assert.equal(b.meta.get(wd.id).a, 'vanguard_plate', 'junk falls back to the default');
    await a.until(() => a.sheet && b.sheet, 3000, 'sheets');
    assert.equal(a.sheet.look, 'red_rucker');
    assert.deepEqual(a.sheet.stats, b.sheet.stats, 'two vanguards with different looks have identical stats');
    for (const x of [a, b, c, d]) x.close();
  } finally {
    await srv.close();
  }
  // The look survives a restart; a tampered value on disk is corrected on load.
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.characters.find((ch) => ch.name === 'Rucker').look, 'red_rucker');
  saved.characters.find((ch) => ch.name === 'Plain').look = '<script>';
  fs.writeFileSync(file, JSON.stringify(saved));
  srv = await startServer({ port: 0, dataFile: file });
  try {
    const a = new Client(srv.port);
    const w = await a.resume(token);
    assert.equal(w.t, 'welcome');
    await a.until(() => a.sheet, 3000, 'sheet');
    assert.equal(a.sheet.look, 'red_rucker');
    assert.equal([...srv.store.chars.values()].find((ch) => ch.name === 'Plain').look, 'vanguard_plate');
    a.close();
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

    // Focused live-party and companion identity checks in the existing
    // two-player integration test. Neither changes XP or encounter rules.
    b.send({ t: 'pet_rename', name: 'Tender' });
    await a.until(() => a.meta.get(wb.comp)?.n === 'Tender', 3000, 'companion name seen by ally');
    assert.equal(srv.game.players.get(wb.id).char.petName, 'Tender');
    b.send({ t: 'party_invite', id: wa.id });
    await a.until(() => a.snap?.y?.party?.invite?.name === 'Lumen', 3000, 'party invitation');
    a.send({ t: 'party_answer', accept: true });
    await b.until(() => b.snap?.y?.party?.members?.length === 2, 3000, 'party formed');
    assert.equal(a.snap.y.party.members.length, 2);
    a.send({ t: 'party_leave' });
    await b.until(() => b.snap?.y?.party?.members?.length === 0, 3000, 'party dissolved');

    // The third socket must not receive a private whisper. Remove it before
    // the existing two-player combat scenario.
    const observer = new Client(srv.port);
    try {
      const wc = await observer.create('Witness', 'vanguard');
      await observer.until(() => observer.ent(wa.id) && observer.ent(wc.id));
      a.send({ t: 'whisper', id: wb.id, m: 'Private greeting' });
      await b.until(() => b.events.some(e => e.k === 'whisper' && /Private greeting/.test(e.m)), 3000, 'whisper received');
      await a.until(() => a.events.some(e => e.k === 'whisper' && /Private greeting/.test(e.m)));
      await observer.until(() => observer.snap?.time >= b.snap.time);
      assert.ok(!observer.events.some(e => /Private greeting/.test(e.m || '')), 'whisper is not broadcast');
    } finally { observer.close(); }

    // Movement: A walks forward; B observes A's authoritative position change.
    const startZ = b.ent(wa.id).z;
    let seq = 0;
    for (let i = 0; i < 30; i++) {
      a.send({ t: 'in', s: [[++seq, 1, 0, 0, 0], [++seq, 1, 0, 0, 0], [++seq, 1, 0, 0, 0]] });
      await new Promise((r) => setTimeout(r, 50));
    }
    await b.until(() => b.ent(wa.id).z > startZ + 5, 3000, 'B sees A move');
    await a.until(() => a.snap?.y?.ack === seq, 3000, 'movement input acknowledgements');
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

    // Explicit stop/resume is authoritative; a legacy right-click request still engages.
    a.send({ t: 'atk', on: 0 });
    await a.until(() => !pa.autoOn && a.snap?.y?.auto === 0, 3000, 'auto-attack disengaged');
    a.send({ t: 'atk', on: 1 });
    await a.until(() => pa.autoOn && a.snap?.y?.auto === 1, 3000, 'auto-attack re-engaged');
    assert.ok(a.snap.y.autoCd >= 0, 'auto-attack timer exposed');

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

test('combat lifecycle: two clients recreate an enemy after corpse expiry and respawn, without a server restart', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  const a = new Client(srv.port);
  const b = new Client(srv.port);
  try {
    const wa = await a.create('Aster', 'vanguard');
    const wb = await b.create('Boreal', 'symbiotech');
    const game = srv.game;
    const e = game.enemies.find((x) => x.type === 'skitter');
    const pa = game.players.get(wa.id);
    const pb = game.players.get(wb.id);

    // Isolate one enemy so an unrelated spawn cannot interrupt the sequence.
    for (const other of game.enemies) {
      if (other === e) continue;
      other.state = 'dead';
      other.deadAt = -1e9;
      other.respawnAt = Infinity;
    }
    pa.x = e.x;
    pa.z = e.z + 2.5;
    await a.until(() => a.rendered.has(e.id) && b.rendered.has(e.id), 3000, 'enemy model in both sessions');

    e.hp = 1;
    a.send({ t: 'tgt', id: e.id });
    a.send({ t: 'use', a: 'rending_arc' });
    await a.until(() => a.events.some((event) => event.e === 'die' && event.id === e.id), 3000, 'enemy death for A');
    await b.until(() => b.events.some((event) => event.e === 'die' && event.id === e.id), 3000, 'enemy death for B');

    // The full corpse duration is covered by the simulation test. Here we
    // accelerate expiry to keep the network lifecycle check short.
    e.deadAt = game.time - CORPSE_MS + 900;
    e.respawnAt = game.time + 4500;
    pa.x = 0; pa.z = 0;
    pb.x = 0; pb.z = 0;
    await a.until(() => !a.ent(e.id) && !a.rendered.has(e.id), 6000, 'A drops expired corpse');
    await b.until(() => !b.ent(e.id) && !b.rendered.has(e.id), 3000, 'B drops expired corpse');
    await a.until(() => e.state === 'idle' && a.ent(e.id) && a.rendered.has(e.id), 4000, 'A recreates respawned enemy');
    await b.until(() => b.ent(e.id) && b.rendered.has(e.id), 3000, 'B recreates respawned enemy');
    assert.equal(a.meta.get(e.id).n, e.name);
    assert.equal(b.meta.get(e.id).n, e.name);

    // The revived enemy is not merely visible: another player can fight it.
    pb.x = e.x; pb.z = e.z + 3;
    b.send({ t: 'tgt', id: e.id });
    b.send({ t: 'use', a: 'neural_lash' });
    await a.until(() => a.events.some((ev) => ev.e === 'dmg' && ev.s === wb.id && ev.d === e.id), 3000, 'A sees B hit respawned enemy');
    assert.ok(a.rendered.has(e.id) && b.rendered.has(e.id));
    assert.ok(e.hp < e.maxHp, 'the respawned enemy can take damage');
  } finally {
    a.close();
    b.close();
    await srv.close();
  }
});

test('two-player recovery: either session can respawn independently and remain visible to its ally', async () => {
  const srv = await startServer({ port: 0, dataFile: null });
  const a = new Client(srv.port);
  const b = new Client(srv.port);
  try {
    const wa = await a.create('RecoveryA', 'vanguard');
    const wb = await b.create('RecoveryB', 'symbiotech');
    const game = srv.game;
    const pa = game.players.get(wa.id);
    const pb = game.players.get(wb.id);

    // Remove unrelated combat, keeping both sockets connected throughout.
    for (const e of game.enemies) {
      e.state = 'dead';
      e.deadAt = -1e9;
      e.respawnAt = Infinity;
    }
    for (const p of [pa, pb]) { p.x = 0; p.z = 45; }
    await a.until(() => a.ent(wb.id) && b.ent(wa.id), 3000, 'both player frames');

    for (const [victim, watcher, player] of [[a, b, pa], [b, a, pb]]) {
      const id = player.id;
      const level = player.char.level;
      dealDamage(game, null, player, player.hp + 100, 'test_defeat');
      await victim.until(() => (victim.me()?.f & 1) !== 0, 3000, 'defeated player sees death');
      await watcher.until(() => (watcher.ent(id)?.f & 1) !== 0, 3000, 'ally sees player defeated');
      victim.send({ t: 'respawn' });
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(player.dead, true, 'early respawn request respects the delay');

      // A rounded network countdown can reach zero a fraction of a tick
      // before the authoritative delay elapses; wait on server time.
      await victim.until(() => game.time >= player.deadAt + RESPAWN_DELAY_MS + 100, 5000, 'respawn delay elapsed');
      assert.equal(victim.snap.y.dead, 0, 'client countdown has finished');
      victim.send({ t: 'respawn' });
      await victim.until(() => !(victim.me()?.f & 1) && victim.me()?.h === victim.me()?.m, 3000, 'player recovered at full health');
      await watcher.until(() => !(watcher.ent(id)?.f & 1) && watcher.ent(id)?.h === watcher.ent(id)?.m, 3000, 'ally sees recovery');
      assert.ok(Math.hypot(player.x, player.z) < 13, 'respawn returned player to Sanctum');
      assert.equal(player.char.level, level, 'respawn preserves progression');
      assert.equal(game.players.size, 2, 'neither recovery disconnects the other player');
    }
    assert.ok(b.ent(wb.comp), 'companion remains present after its owner recovers');
    assert.ok(a.me() && b.me(), 'both sessions are still usable');
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

test('accounts: ownership, guest recovery, roster deletion and sign-in survive restart', async () => {
  const file = tmpFile();
  let srv = await startServer({ port: 0, dataFile: file });
  const guest = new Client(srv.port);
  const owner = new Client(srv.port);
  const parallel = new Client(srv.port);
  const password = 'Example-LocalPassword-2026!';
  let sessionToken;
  try {
    const eve = await guest.create('Eve', 'symbiotech');
    assert.equal(eve.t, 'welcome');
    await owner.open();
    owner.send({ t: 'account_register', handle: 'EveningPlayer', password });
    const ready = await owner.until(() => owner.msgs.find((m) => m.t === 'account_ready'), 8000, 'new account roster');
    assert.equal(ready.chars.length, 0);
    sessionToken = ready.token;
    assert.match(sessionToken, /^[0-9a-f]{64}$/);

    owner.send({ t: 'account_claim_character', token: eve.token });
    const linked = await owner.until(() => owner.msgs.find((m) => m.t === 'account_ready' && m.chars.some((c) => c.name === 'Eve')), 3000, 'legacy character linked');
    const eveId = linked.chars[0].id;
    await guest.until(() => guest.closed !== null, 3000, 'old bearer disconnected');
    assert.equal(srv.store.authenticate(eve.token), null, 'old guest token revoked');
    owner.send({ t: 'account_select', id: eveId });
    const welcome = await owner.until(() => owner.msgs.find((m) => m.t === 'welcome' && m.charId === eveId), 3000, 'owned Eve enters world');
    assert.ok(welcome.id > 0);

    const rosterBefore = owner.msgs.filter((m) => m.t === 'account_ready').length;
    owner.send({ t: 'account_leave' });
    // The new roster is emitted when leaving the active character.
    await owner.until(() => owner.msgs.filter((m) => m.t === 'account_ready').length > rosterBefore, 3000, 'character menu');
    owner.send({ t: 'account_create_character', name: 'Rhea', cls: 'vanguard' });
    const created = await owner.until(() => owner.msgs.some((m) => m.t === 'welcome' && m.charId !== eveId), 3000, 'second character');
    assert.ok(created);
    const rheaId = srv.store.byName.get('rhea').id;
    const beforeLeave = owner.msgs.filter((m) => m.t === 'account_ready').length;
    owner.send({ t: 'account_leave' });
    await owner.until(() => owner.msgs.filter((m) => m.t === 'account_ready').length > beforeLeave, 3000, 'return to roster');
    owner.send({ t: 'account_delete_character', id: rheaId, confirmName: 'WrongName' });
    await owner.until(() => owner.msgs.some((m) => m.t === 'account_fail' && /not authorised/.test(m.reason)), 3000, 'unauthorized deletion refused');
    assert.ok(srv.store.chars.has(rheaId));
    owner.send({ t: 'account_delete_character', id: rheaId, confirmName: 'Rhea' });
    await owner.until(() => !srv.store.chars.has(rheaId), 3000, 'authorized deletion');
    assert.equal(srv.store.byName.has('rhea'), false);

    await parallel.open();
    parallel.send({ t: 'account_resume', token: sessionToken });
    await parallel.until(() => parallel.msgs.some((m) => m.t === 'account_ready'), 3000, 'second socket using the session');
    owner.send({ t: 'account_logout' });
    await owner.until(() => owner.msgs.some((m) => m.t === 'account_logged_out'), 3000, 'logout acknowledgement');
    assert.equal(srv.store.authenticateAccount(sessionToken), null, 'session revoked on logout');
    await parallel.until(() => parallel.closed !== null, 3000, 'revoked open socket disconnected');
  } finally {
    guest.close();
    owner.close();
    parallel.close();
    await srv.close();
  }

  const disk = fs.readFileSync(file, 'utf8');
  assert.ok(!disk.includes(password), 'plaintext password never written to disk');
  assert.ok(!disk.includes(sessionToken), 'account bearer token never written to disk');
  srv = await startServer({ port: 0, dataFile: file });
  const returning = new Client(srv.port);
  const outsider = new Client(srv.port);
  try {
    await returning.open();
    returning.send({ t: 'account_login', handle: 'EveningPlayer', password });
    const ready = await returning.until(() => returning.msgs.find((m) => m.t === 'account_ready'), 8000, 'account login after restart');
    assert.deepEqual(ready.chars.map((c) => c.name), ['Eve']);
    const other = await outsider.create('OtherPlayer', 'vanguard');
    assert.equal(other.t, 'welcome');
    returning.send({ t: 'account_select', id: srv.store.byName.get('otherplayer').id });
    await returning.until(() => returning.msgs.some((m) => m.t === 'account_fail' && /does not belong/.test(m.reason)), 3000, 'cannot select another owner character');
  } finally {
    returning.close();
    outsider.close();
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
