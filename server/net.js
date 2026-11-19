// Network layer: authenticates sockets, validates every inbound message and
// turns it into a simulation command; streams snapshots back out.
// Nothing a client sends is trusted beyond "this is what I would like to do".

import { useAbility, startAttack } from './sim/combat.js';
import { petCommand, renameCompanion, manageCompanion } from './sim/companion.js';
import { equipItem, unequipSlot, interact, cancelInscription, changeInitiationAppearance, setElectricalRodMode } from './sim/progress.js';
import { markItemSeen } from './sim/inventory-seen.js';
import { disposeItem } from './sim/disposal.js';
import { beginProduction, stopProduction } from './sim/production.js';
import { inviteParty, answerParty, leaveParty } from './sim/party.js';
import { openLoot, takeLoot, clearLoot } from './sim/loot.js';
import { tradeVendor,closeVendor } from './sim/vendor.js';
import { useUtility } from './sim/utility.js';

export const PROTOCOL_VERSION = 1;
const MAX_CONNECTIONS = 64;
const AUTH_TIMEOUT_MS = 15000;
const RATE_PER_SEC = 90;
const RATE_BURST = 180;
const MAX_STRIKES = 300;
const MAX_INPUTS_PER_MSG = 16;
const CHAT_INTERVAL_MS = 800;
const CHAT_MAX_LEN = 140;
const VICINITY_CHAT_RANGE = 45; // world metres, independent of camera visibility
const SNAPSHOT_BACKPRESSURE=512*1024;
const STALL_LIMIT_MS=5000;
const PRIVATE_EVENT_LIMIT=256;
const VISUAL_EVENT_LIMIT=64;
const VISUAL_EVENT_TTL_MS=500;
// Retain only recent action cues. Never replay telegraphs or persistent effects.
const replayable=e=>e.e==='hit'||e.e==='cast';
function recentVisual(events,now){
 return events.filter(x=>now-x.time<=VISUAL_EVENT_TTL_MS).slice(-VISUAL_EVENT_LIMIT);
}

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
    // Bounded, per-remote-address admission control for expensive password
    // verification. Client-supplied proxy headers are never trusted.
    this.accountAttempts = new Map();
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
      account: null,
      accountToken: null,
      authPending: false,
      remote: ws._socket?.remoteAddress || 'unknown',
      known: new Map(),
      pendingVisual: [],
      stalledSince: null,
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
    conn.char = null;
    conn.pendingVisual=[];
    conn.stalledSince=null;
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
    conn.pendingVisual=[];
    conn.stalledSince=null;
    this.sessions.set(char.id, conn);
    const msg = {
      t: 'welcome',
      v: PROTOCOL_VERSION,
      id: conn.player.id,
      charId: char.id,
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

    if (!this.validAccountSession(conn)) return;
    if (!conn.player) return conn.account ? this.onAccountMessage(conn, msg) : this.onAuthMessage(conn, msg);
    try {
      this.onGameMessage(conn, conn.player, msg);
    } catch (err) {
      console.error('[net] error handling message', msg.t, err);
    }
  }

  /** Revoked/evicted account sessions must not retain access on an open socket. */
  validAccountSession(conn) {
    if (!conn.account || this.store.authenticateAccount(conn.accountToken) === conn.account) return true;
    this.detach(conn);
    conn.account = null;
    conn.accountToken = null;
    send(conn.ws, { t: 'account_fail', reason: 'The account session expired. Sign in again.' });
    conn.ws.close(4000, 'account session expired');
    return false;
  }

  strike(conn) {
    conn.strikes += 10;
    if (conn.strikes > MAX_STRIKES) conn.ws.close(4002, 'malformed traffic');
  }

  /** Limit password guesses and scrypt work even across new connections. */
  allowAccountAttempt(remote) {
    const now = Date.now();
    const current = this.accountAttempts.get(remote);
    const item = !current || now - current.start > 60000 ? { start: now, count: 0 } : current;
    item.count++;
    this.accountAttempts.set(remote, item);
    if (this.accountAttempts.size > 512) {
      for (const [key, v] of this.accountAttempts) if (now - v.start > 60000) this.accountAttempts.delete(key);
      // A burst of distinct active addresses must not grow this table forever.
      while (this.accountAttempts.size > 512) this.accountAttempts.delete(this.accountAttempts.keys().next().value);
    }
    return item.count <= 12;
  }

  sendRoster(conn, token) {
    const msg = { t: 'account_ready', handle: conn.account.handle, chars: this.store.listCharacters(conn.account) };
    if (token) msg.token = token;
    send(conn.ws, msg);
  }

  async accountAuth(conn, msg) {
    if (conn.authPending) return this.strike(conn);
    if (!this.allowAccountAttempt(conn.remote)) {
      send(conn.ws, { t: 'account_fail', reason: 'Too many attempts. Try again later.' });
      return;
    }
    conn.authPending = true;
    try {
      const result = msg.t === 'account_register'
        ? await this.store.registerAccount(msg.handle, msg.password)
        : await this.store.loginAccount(msg.handle, msg.password);
      if (conn.ws.readyState !== 1) return;
      if (result.error) {
        send(conn.ws, { t: 'account_fail', reason: result.error });
        if (++conn.authFails >= 5) conn.ws.close(4000, 'too many attempts');
        return;
      }
      clearTimeout(conn.authTimer);
      conn.account = result.account;
      conn.accountToken = result.token;
      this.sendRoster(conn, result.token);
    } catch (err) {
      console.error('[net] account auth failed internally', err);
      send(conn.ws, { t: 'account_fail', reason: 'Account authentication failed.' });
    } finally {
      conn.authPending = false;
    }
  }

  onAuthMessage(conn, msg) {
    if (conn.authPending) return this.strike(conn);
    if (msg.t === 'account_register' || msg.t === 'account_login') {
      void this.accountAuth(conn, msg);
    } else if (msg.t === 'account_resume') {
      const account = this.store.authenticateAccount(msg.token);
      if (!account) {
        send(conn.ws, { t: 'account_fail', reason: 'The account session expired. Sign in again.' });
        if (++conn.authFails >= 5) conn.ws.close(4000, 'too many attempts');
        return;
      }
      conn.account = account;
      conn.accountToken = msg.token;
      clearTimeout(conn.authTimer);
      this.sendRoster(conn);
    } else if (msg.t === 'resume') {
      const char = this.store.authenticate(msg.token);
      if (!char || char.accountId) {
        send(conn.ws, { t: 'auth_fail', reason: 'That character could not be found.' });
        if (++conn.authFails >= 5) conn.ws.close(4000, 'too many attempts');
        return;
      }
      this.enter(conn, char, null);
    } else if (msg.t === 'create') {
      const res = this.store.create(msg.name, msg.cls, msg.look, msg.appearance);
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

  onAccountMessage(conn, msg) {
    const account = conn.account;
    if (msg.t === 'account_select') {
      const char = typeof msg.id === 'string' ? this.store.chars.get(msg.id) : null;
      if (!char || char.accountId !== account.id) {
        send(conn.ws, { t: 'account_fail', reason: 'That character does not belong to this account.' });
        return;
      }
      this.enter(conn, char, null);
    } else if (msg.t === 'account_create_character') {
      const res = this.store.createForAccount(account, msg.name, msg.cls, msg.look, msg.appearance);
      if (res.error) send(conn.ws, { t: 'create_fail', reason: res.error });
      else this.enter(conn, res.char, null);
    } else if (msg.t === 'account_claim_character') {
      const res = this.store.claimLegacy(account, msg.token);
      if (res.error) {
        send(conn.ws, { t: 'account_fail', reason: res.error });
        return;
      }
      const existing = this.sessions.get(res.char.id);
      if (existing && existing !== conn) {
        this.detach(existing);
        existing.ws.close(4001, 'character linked to account');
      }
      this.sendRoster(conn);
    } else if (msg.t === 'account_delete_character') {
      const res = this.store.deleteOwned(account, msg.id, msg.confirmName);
      if (res.error) {
        send(conn.ws, { t: 'account_fail', reason: res.error });
        return;
      }
      const existing = this.sessions.get(res.char.id);
      if (existing && existing !== conn) {
        this.detach(existing);
        existing.ws.close(4001, 'character deleted');
      }
      this.sendRoster(conn);
    } else if (msg.t === 'account_logout') {
      this.store.revokeAccountSession(account, conn.accountToken);
      conn.account = null;
      conn.accountToken = null;
      send(conn.ws, { t: 'account_logged_out' });
      conn.ws.close(1000, 'signed out');
    } else if (msg.t === 'ping' && isNum(msg.c)) {
      send(conn.ws, { t: 'pong', c: msg.c });
    } else this.strike(conn);
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
      case 'follow':
        if (!isId(msg.id)) return this.strike(conn);
        reply(game.setFollow(p,msg.id));
        break;
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
      case 'pet_manage':
        if (!['commission', 'default', 'dismiss', 'summon'].includes(msg.action) ||
          ((msg.action === 'default' || msg.action === 'commission' || (msg.action === 'summon' && msg.type != null)) &&
            (typeof msg.type !== 'string' || msg.type.length > 40))) return this.strike(conn);
        reply(manageCompanion(game, p, msg.action, msg.type));
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
      case 'craft':
        if (msg.quantity === undefined) { reply({ ok: false, reason: 'Reload the page to use the updated Workshop.' }); break; }
        if (typeof msg.recipe !== 'string' || msg.recipe.length > 80 || !isId(msg.quantity) || !isId(msg.rev)) return this.strike(conn);
        reply(beginProduction(game,p,msg.recipe,msg.quantity,msg.rev));
        break;
      case 'production_cancel':
        stopProduction(game, p);
        break;
      case 'use_utility':
        if(typeof msg.item!=='string'||msg.item.length>80||typeof msg.weapon!=='string'||msg.weapon.length>80||!isId(msg.rev))return this.strike(conn);
        reply(useUtility(game,p,msg.item,msg.weapon,msg.rev));break;
      case 'appearance_change': {
        if(typeof msg.appearance!=='string'||msg.appearance.length>48)return this.strike(conn);
        const result=changeInitiationAppearance(game,p,msg.appearance,()=>{
          this.store.markDirty();
          this.store.flush();
        });
        if(!result.ok)p.outbox.push({e:'appearance_rejected',reason:result.reason});
        break;
      }
      case 'rod_mode':
        if(msg.mode!=='rod'&&msg.mode!=='dual')return this.strike(conn);
        reply(setElectricalRodMode(game,p,msg.mode));
        break;
      case 'equip':
        reply(equipItem(game, p, msg.item));
        break;
      case 'item_seen':
        if (typeof msg.item !== 'string' || msg.item.length > 80 || !isId(msg.rev)) return this.strike(conn);
        markItemSeen(game, p, msg.item, msg.rev);
        break;
      case 'item_dispose':
        if (typeof msg.item !== 'string' || msg.item.length > 80 || !isId(msg.rev) ||
          (msg.action !== 'destroy' && msg.action !== 'salvage')) return this.strike(conn);
        reply(disposeItem(game, p, msg));
        break;
      case 'unequip':
        reply(unequipSlot(game, p, msg.slot));
        break;
      case 'inscription_cancel':
        cancelInscription(game, p);
        break;
      case 'loot_open':
        if(!isId(msg.id)||!isId(msg.generation)||typeof msg.auto!=='boolean')return this.strike(conn);
        reply(openLoot(game,p,msg.id,msg.generation,msg.auto));break;
      case 'loot_take':
        if(!isId(msg.id)||!isId(msg.generation)||!(msg.item===null||typeof msg.item==='string'&&msg.item.length<=80))return this.strike(conn);
        reply(takeLoot(game,p,msg.id,msg.generation,msg.item));break;
      case 'vendor_trade':
        if(typeof msg.ticket!=='string'||msg.ticket.length!==36||!isId(msg.rev)||!isId(msg.qty)||msg.qty<1||msg.qty>99||typeof msg.id!=='string'||msg.id.length>80||!['buy','sell','sell_junk','buyback','repair'].includes(msg.op))return this.strike(conn);
        reply(tradeVendor(game,p,msg));break;
      case 'vendor_close':
        closeVendor(p);break;
      case 'loot_close':
        clearLoot(p);break;
      case 'act':
        if (!isId(msg.id)) return this.strike(conn);
        reply(interact(game, p, msg.id));
        break;
      case 'respawn':
        game.respawn(p);
        break;
      case 'account_leave':
        if (!conn.account) return reply({ ok: false, reason: 'Link this character to an account first.' });
        this.detach(conn);
        this.sendRoster(conn);
        break;
      case 'account_logout':
        if (!conn.account) return reply({ ok: false, reason: 'No account is signed in.' });
        this.detach(conn);
        this.store.revokeAccountSession(conn.account, conn.accountToken);
        conn.account = null;
        conn.accountToken = null;
        send(conn.ws, { t: 'account_logged_out' });
        conn.ws.close(1000, 'signed out');
        break;
      case 'whisper':
      case 'chat': {
        if (typeof msg.m !== 'string') return this.strike(conn);
        const channel=msg.channel===undefined?'vicinity':msg.channel;
        if(msg.t==='chat'&&channel!=='vicinity'&&channel!=='party')return this.strike(conn);
        const now = Date.now();
        if (now - conn.lastChat < CHAT_INTERVAL_MS) return;
        // Strip control characters; clients render chat as plain text only.
        const text = msg.m.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, CHAT_MAX_LEN);
        if (!text) return;
        conn.lastChat = now;
        if (msg.t === 'whisper') {
          if (!isId(msg.id)) return this.strike(conn);
          const other = game.players.get(msg.id);
          if (!other || other.id === p.id) return game.message(p, 'err', 'That player is unavailable.');
          game.message(other, 'whisper', `From ${p.name}: ${text}`);
          game.message(p, 'whisper', `To ${other.name}: ${text}`);
        } else {
          const event={e:'chat',id:p.id,n:p.name,m:text,channel};
          if(channel==='party'){
            const members=game.parties.get(p.partyId);
            if(!members?.has(p.id))return game.message(p,'err','You are not in a party.');
            for(const id of members){
              const recipient=game.players.get(id);
              if(recipient)recipient.outbox.push(event);
            }
          }else{
            for(const recipient of game.players.values()){
              if(Math.hypot(recipient.x-p.x,recipient.z-p.z)<=VICINITY_CHAT_RANGE)recipient.outbox.push(event);
            }
          }
        }
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
      if (conn.ws.readyState !== 1 || !this.validAccountSession(conn)) continue;
      const p = conn.player;
      if (!p) continue;
      // Replaceable position snapshots may be skipped; private messages are retained.
      if(p.outbox.length>PRIVATE_EVENT_LIMIT){conn.ws.terminate();continue;}
      if(conn.ws.bufferedAmount>SNAPSHOT_BACKPRESSURE){
        conn.stalledSince??=game.time;
        if(game.time-conn.stalledSince>STALL_LIMIT_MS){conn.ws.terminate();continue;}
        conn.pendingVisual=recentVisual([...(conn.pendingVisual||[]),...game.events.filter(replayable).map(event=>({time:game.time,event}))],game.time);
        continue;
      }
      conn.stalledSince=null;
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
      const delayed=recentVisual(conn.pendingVisual||[],game.time).map(x=>x.event).filter(e=>(!e.s||liveIds.has(e.s))&&(!e.d||liveIds.has(e.d)));
      const deliveredEvents=delayed.length?JSON.stringify([...delayed,...game.events]):evJson;
      let out = `{"t":"s","time":${Math.round(game.time)},"ents":${rowsJson},"ev":${deliveredEvents},"y":${JSON.stringify(game.privateState(p))}`;
      if (meta.length) out += `,"meta":${JSON.stringify(meta)}`;
      if (p.outbox.length) out += `,"pv":${JSON.stringify(p.outbox)}`;
      if (p.sheetDirty) {
        out += `,"sheet":${JSON.stringify(game.sheet(p))}`;
      }
      out += '}';
      try{
        conn.ws.send(out,error=>{if(error)conn.ws.terminate();});
      }catch{
        conn.ws.terminate();continue;
      }
      // Socket accepted the payload, not an application-level acknowledgement.
      p.sheetDirty=false;
      p.outbox=[];
      conn.pendingVisual=[];
    }
    game.endTick({preservePrivate:true});
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
