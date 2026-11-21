// Sit / stand emote: server-owned posture, public flag, and auto-stand rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, makeChar, place, enemyOf, isolate } from './helpers.js';
import { setPosture, tickPosture } from '../server/sim/posture.js';
import { startServer } from '../server/index.js';
import WebSocket from 'ws';

const row = (g, p) => g.buildRows().find(r => r.i === p.id);
const sitting = (g, p) => !!(row(g, p).f & 16);

test('sit and stand are explicit desired states with validated preconditions', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('keeper'));
  for (const bad of ['yes', 1, null, undefined, {}]) assert.equal(setPosture(g, p, bad).ok, false);
  assert.ok(setPosture(g, p, true).ok); assert.ok(sitting(g, p));
  assert.ok(setPosture(g, p, true).ok, 'idempotent'); tickPosture(g, p); assert.ok(sitting(g, p), 'stays seated at rest');
  p.yaw += 1; tickPosture(g, p); assert.ok(sitting(g, p), 'turning does not stand up');
  assert.ok(setPosture(g, p, false).ok); assert.ok(!sitting(g, p));
  p.combatUntil = g.time + 1000; assert.equal(setPosture(g, p, true).ok, false); p.combatUntil = 0;
  p.dead = true; assert.equal(setPosture(g, p, true).ok, false); p.dead = false;
  p.jy = 1; assert.equal(setPosture(g, p, true).ok, false); p.jy = 0;
  p.production = { id: 'x' }; assert.equal(setPosture(g, p, true).ok, false); p.production = null;
  p.followId = 9; assert.equal(setPosture(g, p, true).ok, false); p.followId = null;
  p.autoOn = true; assert.ok(setPosture(g, p, true).ok); assert.equal(p.autoOn, false, 'sitting stops auto-attack');
});

test('moving, jumping, attacking, combat and defeat stand the character up', () => {
  const g = makeGame(), p = g.addPlayer(makeChar('vanguard'));
  const check = (mutate, undo) => { assert.ok(setPosture(g, p, true).ok); mutate(); tickPosture(g, p); assert.ok(!sitting(g, p)); undo?.(); };
  check(() => { p.x += .5; });
  check(() => { p.jy = .3; }, () => { p.jy = 0; });
  check(() => { p.autoOn = true; }, () => { p.autoOn = false; });
  check(() => { p.combatUntil = g.time + 5000; }, () => { p.combatUntil = 0; });
  const e = enemyOf(g, 'skitter'); isolate(g, e); place(p, e.x + 1, e.z);
  assert.ok(setPosture(g, p, true).ok);
  g.tick(50); assert.ok(sitting(g, p));
  p.target = e.id; p.autoOn = true; g.tick(50); assert.ok(!sitting(g, p), 'engaging stands up through the real tick');
});

test('socket path: posture validates type, abilities and weapon switches stand the player up, observers see only the flag', async () => {
  const server = await startServer({ port: 0, dataFile: null }); const sockets = [];
  const until = async (fn, what) => { const end = Date.now() + 3000; while (Date.now() < end) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 10)); } throw new Error('timed out: ' + what); };
  const connect = () => { const ws = new WebSocket(`ws://127.0.0.1:${server.port}/ws`), msgs = [], rows = new Map();
    ws.on('message', d => { const m = JSON.parse(d.toString()); if (m.t === 's') for (const r of m.ents) rows.set(r.i, r); else msgs.push(m); }); ws.on('error', () => {});
    sockets.push(ws); return { ws, msgs, rows, send: o => ws.send(JSON.stringify(o)) }; };
  try {
    const a = connect(), b = connect();
    await until(() => a.ws.readyState === 1 && b.ws.readyState === 1, 'open');
    a.send({ t: 'create', name: 'Sitter One', cls: 'keeper' }); b.send({ t: 'create', name: 'Watcher Two', cls: 'surveyor' });
    const w = await until(() => a.msgs.find(m => m.t === 'welcome'), 'welcome'); await until(() => b.msgs.find(m => m.t === 'welcome'), 'welcome b');
    const p = server.game.players.get(w.id);
    a.send({ t: 'posture', sit: 'true' }); await new Promise(r => setTimeout(r, 120)); assert.ok(!p.sitting, 'non-boolean refused');
    a.send({ t: 'posture', sit: true }); await until(() => b.rows.get(p.id)?.f & 16, 'observer sees seated');
    a.send({ t: 'weapon_select', slot: 'weapon' }); await until(() => !(b.rows.get(p.id)?.f & 16), 'weapon switch stands');
    a.send({ t: 'posture', sit: true }); await until(() => p.sitting, 'seated again');
    a.send({ t: 'posture', sit: false }); await until(() => !p.sitting, 'stand request');
  } finally { for (const ws of sockets) ws.close(); await server.close(); }
});
