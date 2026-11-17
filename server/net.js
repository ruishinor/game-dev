// Network layer: authenticates sockets, validates every inbound message and
// turns it into a simulation command; streams snapshots back out.
// Nothing a client sends is trusted beyond "this is what I would like to do".

import { useAbility, startAttack } from './sim/combat.js';
import { petCommand } from './sim/companion.js';
import { equipItem, unequipSlot, interact } from './sim/progress.js';
import { inviteParty, answerParty, leaveParty } from './sim/party.js';
import { renameCompanion } from './sim/companion.js';

export const PROTOCOL_VERSION = 1;
const MAX_CONNECTIONS = 64;
const AUTH_TIMEOUT_MS = 15000;
const RATE_PER_SEC = 90;
const RATE_BURST = 180;
const MAX_STRIKES = 300;
const MAX_INPUTS_PER_MSG = 16;
const CHAT_INTERVAL_MS = 800;
const CHAT_MAX_LEN = 140;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isId = (v) => Number.isInteger(v) && v >= 0 && v < 2 ** 31;

function send(ws, obj) {
  if (ws.readyState === 1) ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
}

export class NetServer {
  constructor(wss, game, store) {
    this.wss = wss;
    this.game = game;
    this.store = store;
    this.conns = new Set();
    /** character id -> connection currently controlling it */
    this.sessions = new Map();
    game.onCharChanged = () => store.markDirty();
    wss.on('connection', (ws) => this.onConnection(ws));
  }

  onConnection(ws) {
    if (this.conns.size >= MAX_CONNECTIONS) {
      ws.close(4003, 'server full');
      return;
    }
    const conn = {
      ws,
      player: null,
      char: null,
      known: new Map(),
      tokens: RATE_BURST,
      lastRefill: Date.now(),
      strikes: 0,
      authFails: 0,
      lastChat: 0,
      alive: true,
      authTimer: setTimeout(() => {
        if (!conn.player) ws.close(4000, 'auth timeout');
      }, AUTH_TIMEOUT_MS),
    };
    this.conns.add(conn);
    ws.on('message', (data, isBinary) => this.onMessage(conn, data, isBinary));
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => {});
    ws.on('pong', () => {
      conn.alive = true;
    });
  }

  onClose(conn) {
    clearTimeout(conn.authTimer);
    this.conns.delete(conn);
    this.detach(conn);
  }

  /** Take the connection's player out of the world and persist it. */
  detach(conn) {
    if (!conn.player) return;
    conn.char.lastSeen = Date.now();
    this.game.removePlayer(conn.player.id);
    if (this.sessions.get(conn.char.id) === conn) this.sessions.delete(conn.char.id);
    conn.player = null;
    this.store.markDirty();
  }

  enter(conn, char, token) {
    // A second login for the same character replaces the first session, so
    // one character can never exist twice or be written from two sockets.
    const existing = this.sessions.get(char.id);
    if (existing && existing !== conn) {
      this.detach(existing);
      existing.ws.close(4001, 'replaced by a newer session');
    }
    clearTimeout(conn.authTimer);
    conn.char = char;
    conn.player = this.game.addPlayer(char);
    conn.known.clear();
    this.sessions.set(char.id, conn);
    const msg = {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      id: conn.player.id,
      comp: conn.player.companion ? conn.player.companion.id : 0,
      time: this.game.time,
      x: conn.player.x,
      z: conn.player.z,
    };
    if (token) msg.token = token;
    send(conn.ws, msg);
  }

  onMessage(conn, data, isBinary) {
    // Token bucket: a well-behaved client sends ~35 messages a second.
    const now = Date.now();
    conn.tokens = Math.min(RATE_BURST, conn.tokens + ((now - conn.lastRefill) / 1000) * RATE_PER_SEC);
    conn.lastRefill = now;
    if (conn.tokens < 1) {
      if (++conn.strikes > MAX_STRIKES) conn.ws.close(4002, 'rate limited');
      return;
    }
    conn.tokens -= 1;

    if (isBinary) return this.strike(conn);
    let msg;
    try {
      msg = JSON.parse(data.toString('utf8'));
    } catch {
      return this.strike(conn);
    }
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.t !== 'string') return this.strike(conn);

    if (!conn.player) return this.onAuthMessage(conn, msg);
    try {
      this.onGameMessage(conn, conn.player, msg);
    } catch (err) {
      console.error('[net] error handling message', msg.t, err);
    }
  }

  strike(conn) {
    conn.strikes += 10;
    if (conn.strikes > MAX_STRIKES) conn.ws.close(4002, 'malformed traffic');
  }

  onAuthMessage(conn, msg) {
    if (msg.t === 'resume') {
      const char = this.store.authenticate(msg.token);
      if (!char) {
        send(conn.ws, { t: 'auth_fail', reason: 'That character could not be found.' });
        if (++conn.authFails >= 5) conn.ws.close(4000, 'too many attempts');
        return;
      }
      this.enter(conn, char, null);
    } else if (msg.t === 'create') {
      const res = this.store.create(msg.name, msg.cls, msg.look);
      if (res.error) {
        send(conn.ws, { t: 'create_fail', reason: res.error });
        if (++conn.authFails >= 8) conn.ws.close(4000, 'too many attempts');
        return;
      }
      this.enter(conn, res.char, res.token);
    } else {
      this.strike(conn);
    }
  }

  onGameMessage(conn, p, msg) {
    const game = this.game;
    const reply = (res) => {
      if (res && !res.ok && res.reason) game.message(p, 'err', res.reason);
    };
    switch (msg.t) {
      case 'in': {
        if (!Array.isArray(msg.s) || msg.s.length > MAX_INPUTS_PER_MSG) return this.strike(conn);
        const inputs = [];
        for (const row of msg.s) {
          if (!Array.isArray(row) || row.length < 5) return this.strike(conn);
          const [seq, f, s, yaw, j] = row;
          if (!isId(seq) || !isNum(f) || !isNum(s) || !isNum(yaw)) return this.strike(conn);
          inputs.push({
            seq,
            f: Math.max(-1, Math.min(1, f)),
            s: Math.max(-1, Math.min(1, s)),
            yaw: Math.max(-1e4, Math.min(1e4, yaw)),
            j: j ? 1 : 0,
          });
        }
        game.handleInputs(p, inputs);
        break;
      }
      case 'tgt':
        if (!isId(msg.id)) return this.strike(conn);
        game.setTarget(p, msg.id);
        break;
      case 'use':
        reply(useAbility(game, p, msg.a));
        break;
      case 'atk':
        // Right-click (legacy atk) always engages; explicit on=0 disengages.
        if (msg.on !== undefined && msg.on !== 0 && msg.on !== 1) return this.strike(conn);
        if (msg.on === 0) p.autoOn = false;
        else reply(startAttack(game, p));
        break;
      case 'pet':
        reply(petCommand(game, p, msg.c));
        break;
      case 'pet_rename':
        reply(renameCompanion(game, p, msg.name));
        break;
      case 'party_invite':
        if (!isId(msg.id)) return this.strike(conn);
        reply(inviteParty(game, p, msg.id));
        break;
      case 'party_answer':
        if (typeof msg.accept !== 'boolean') return this.strike(conn);
        reply(answerParty(game, p, msg.accept));
        break;
      case 'party_leave':
        reply(leaveParty(game, p));
        break;
      case 'equip':
        reply(equipItem(game, p, msg.item));
        break;
      case 'unequip':
        reply(unequipSlot(game, p, msg.slot));
        break;
      case 'act':
        if (!isId(msg.id)) return this.strike(conn);
        reply(interact(game, p, msg.id));
        break;
      case 'respawn':
        game.respawn(p);
        break;
      case 'chat': {
        if (typeof msg.m !== 'string') return this.strike(conn);
        const now = Date.now();
        if (now - conn.lastChat < CHAT_INTERVAL_MS) return;
        // Strip control characters; clients render chat as plain text only.
        const text = msg.m.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX_LEN);
        if (!text) return;
        conn.lastChat = now;
        game.events.push({ e: 'chat', id: p.id, n: p.name, m: text });
        break;
      }
      case 'ping':
        if (isNum(msg.c)) send(conn.ws, { t: 'pong', c: msg.c });
        break;
      default:
        this.strike(conn);
    }
  }

  /** Send this tick's snapshot to every player, then clear tick events. */
  broadcast() {
    const game = this.game;
    const rows = game.buildRows();
    const rowsJson = JSON.stringify(rows);
    const evJson = JSON.stringify(game.events);
    const liveIds = new Set(rows.map((row) => row.i));
    for (const conn of this.conns) {
      const p = conn.player;
      if (!p || conn.ws.readyState !== 1) continue;
      // Skip a snapshot rather than queue without bound for a stalled client.
      if (conn.ws.bufferedAmount > 512 * 1024) continue;
      // Clients discard entities omitted from a snapshot (e.g. expired corpses).
      // Forget those IDs here as well: an enemy respawning under the same ID
      // must arrive with metadata so its model can be recreated.
      for (const id of conn.known.keys()) if (!liveIds.has(id)) conn.known.delete(id);
      const meta = [];
      for (const row of rows) {
        const ent = game.ents.get(row.i);
        if (ent && conn.known.get(row.i) !== ent.metaVer) {
          conn.known.set(row.i, ent.metaVer);
          meta.push(game.metaFor(ent));
        }
      }
      let out = `{"t":"s","time":${Math.round(game.time)},"ents":${rowsJson},"ev":${evJson},"y":${JSON.stringify(game.privateState(p))}`;
      if (meta.length) out += `,"meta":${JSON.stringify(meta)}`;
      if (p.outbox.length) out += `,"pv":${JSON.stringify(p.outbox)}`;
      if (p.sheetDirty) {
        out += `,"sheet":${JSON.stringify(game.sheet(p))}`;
        p.sheetDirty = false;
      }
      out += '}';
      conn.ws.send(out);
    }
    game.endTick();
  }

  /** Drop connections that stopped answering pings. */
  heartbeat() {
    for (const conn of this.conns) {
      if (!conn.alive) {
        conn.ws.terminate();
        continue;
      }
      conn.alive = false;
      try {
        conn.ws.ping();
      } catch {
        /* socket already closing */
      }
    }
  }

  /** Persist live positions for everyone online (periodic + shutdown). */
  syncAll() {
    for (const conn of this.conns) {
      if (conn.player) {
        this.game.syncChar(conn.player);
        conn.char.lastSeen = Date.now();
        this.store.markDirty();
      }
    }
  }
}
