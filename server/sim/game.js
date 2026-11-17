// Authoritative world simulation. No I/O here: the network layer feeds
// validated commands in and reads snapshots/events out, and tests drive the
// clock directly through tick().

import { CLASSES, ENEMIES, SPAWNS, COMPANIONS, SURVEYOR } from '../../shared/content.js';
import { deriveStats } from '../../shared/build.js';
import { sanitizeMaterials } from '../../shared/crafting.js';
import { WORLD, OBJECTS, MOVE_HZ, MOVE_DT, RUN_SPEED, dist, hasLineOfSight, stepMove, resolveCollisions, inSanctum, PLAYER_RADIUS } from '../../shared/world.js';
import { tickEnemy, resetEnemy } from './ai.js';
import { tickCompanion } from './companion.js';
import { tickPlayerCombat, expireBuffs, clearThreatFor } from './combat.js';
import { workshopSite } from '../../shared/survey.js';
import { checkDirective, tickBrineTrial } from './progress.js';
import { partyState, removePartyPlayer } from './party.js';

const MOVE_BUDGET_MAX = 30; // movement steps a client may bank (0.5s)
export const CORPSE_MS = 12000;
export const RESPAWN_DELAY_MS = 3000;
export const COMBAT_LINGER_MS = 6000;

const r2 = (n) => Math.round(n * 100) / 100;

export class Game {
  constructor({ rng = Math.random } = {}) {
    this.time = 0;
    this.rng = rng;
    this.nextId = 1;
    this.ents = new Map();
    this.players = new Map();
    this.enemies = [];
    this.companions = [];
    this.objects = [];
    this.parties = new Map();
    this.nextPartyId = 1;
    this.events = [];
    /** Called with a character record whenever persistent state changes. */
    this.onCharChanged = () => {};

    for (const o of OBJECTS) {
      const obj = { id: this.nextId++, kind: 'object', key: o.key, type: o.type, name: o.name, x: o.x, z: o.z, metaVer: 1 };
      this.objects.push(obj);
      this.ents.set(obj.id, obj);
    }
    for (const s of SPAWNS) {
      const def = ENEMIES[s.type];
      const e = {
        id: this.nextId++,
        kind: 'enemy',
        type: s.type,
        name: def.name,
        level: def.level,
        radius: def.radius,
        home: { x: s.x, z: s.z },
        route: s.route ?? null,
        metaVer: 1,
      };
      resetEnemy(this, e);
      this.enemies.push(e);
      this.ents.set(e.id, e);
    }
  }

  // --- players -----------------------------------------------------------

  /** Bring a persisted character into the world. Returns the player entity. */
  addPlayer(char) {
    const def = CLASSES[char.cls];
    const stats = deriveStats(char);
    const fresh = !(char.hp > 0) || !char.pos;
    const pos = fresh ? { ...WORLD.spawn } : { x: char.pos.x, z: char.pos.z };
    resolveCollisions(pos, PLAYER_RADIUS);
    const p = {
      id: this.nextId++,
      kind: 'player',
      char,
      name: char.name,
      cls: char.cls,
      radius: PLAYER_RADIUS,
      x: pos.x,
      z: pos.z,
      jy: 0,
      vy: 0,
      yaw: Math.PI,
      stats,
      maxHp: stats.maxHp,
      hp: fresh ? stats.maxHp : Math.min(stats.maxHp, char.hp),
      res: def.resource.start,
      dead: false,
      deadAt: 0,
      target: 0,
      autoOn: false,
      nextAuto: 0,
      cds: {},
      gcdUntil: 0,
      buffs: [],
      combatUntil: 0,
      lastSeq: 0,
      moveBudget: 12,
      followId: 0,
      followAcc: 0,
      outbox: [],
      sheetDirty: true,
      metaVer: 1,
      companion: null,
      brineTrial: null,
      brineServiceUntil: 0,
      surveyKit: char.cls === 'surveyor' ? { mark: null, rig: null } : null,
      partyId: 0,
      partyInvite: null,
    };
    this.players.set(p.id, p);
    this.ents.set(p.id, p);
    if (def.companion) {
      const cdef = COMPANIONS[def.companion];
      const mode = cdef.modes[char.petMode] && char.petMode !== 'guard' ? char.petMode : 'triage';
      const c = {
        id: this.nextId++,
        kind: 'companion',
        type: def.companion,
        name: char.petName || cdef.name,
        owner: p.id,
        x: p.x + 1.5,
        z: p.z - 1.5,
        yaw: 0,
        mode,
        host: 0,
        act: 'idle',
        actTarget: 0,
        nextPulse: 0,
        nextRegen: 0,
        metaVer: 1,
      };
      p.companion = c;
      this.companions.push(c);
      this.ents.set(c.id, c);
    }
    checkDirective(this, p);
    return p;
  }

  /** Remove a player (disconnect). Persists position/health onto the record. */
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    this.syncChar(p);
    removePartyPlayer(this, p);
    clearThreatFor(this, p.id);
    if (p.companion) {
      this.companions = this.companions.filter((c) => c !== p.companion);
      this.ents.delete(p.companion.id);
    }
    for(const other of this.players.values())if(other.followId===id)this.stopFollow(other);
    this.players.delete(id);
    this.ents.delete(id);
    this.onCharChanged(p.char);
  }

  /** Copy live state that should survive a reconnect onto the record. */
  syncChar(p) {
    p.char.pos = { x: r2(p.x), z: r2(p.z) };
    p.char.hp = p.dead ? 0 : Math.max(1, Math.round(p.hp));
    if (p.companion) {
      p.char.petMode = p.companion.mode;
      p.char.petName = p.companion.name;
    }
  }

  markDirty(p) {
    p.sheetDirty = true;
    this.onCharChanged(p.char);
  }

  /** Recompute derived stats after level or loadout changes. */
  refreshStats(p) {
    p.stats = deriveStats(p.char);
    p.maxHp = p.stats.maxHp;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
  }

  message(p, kind, text) {
    p.outbox.push({ e: 'msg', k: kind, m: text });
  }

  // --- movement ----------------------------------------------------------

  moveSpeedMul(p) {
    return p.dead ? 0 : 1;
  }

  /**
   * Apply a batch of movement inputs from a client. Each input advances the
   * shared fixed-step movement by one tick; the per-player budget (refilled
   * in tick()) caps how many steps real time allows, which bounds speed.
   */
  handleInputs(p, inputs) {
    for (const inp of inputs) {
      if (inp.seq <= p.lastSeq) continue;
      p.lastSeq = inp.seq;
      if(p.followId)this.stopFollow(p);
      if (p.moveBudget < 1) continue; // acknowledged but not applied
      p.moveBudget -= 1;
      p.yaw = inp.yaw;
      stepMove(p, inp, this.moveSpeedMul(p));
    }
  }

  stopFollow(p) {p.followId=0;p.followAcc=0;}

  setFollow(p,id) {
    if(id===0){this.stopFollow(p);return {ok:true};}
    const target=this.players.get(id);
    if(p.dead||!target||target===p||target.dead||dist(p,target)>45)return {ok:false,reason:'Select a living player within 45m to follow.'};
    // Prevent mutual or longer cyclic following chains.
    const seen=new Set([p.id]);
    for(let t=target;t;t=this.players.get(t.followId)){
      if(seen.has(t.id))return {ok:false,reason:'Cannot create a circular follow chain.'};
      seen.add(t.id);
    }
    p.followId=id;p.followAcc=0;return {ok:true};
  }

  tickFollow(p,dt) {
    if(!p.followId)return;
    const target=this.players.get(p.followId);
    if(p.dead||!target||target.dead||dist(p,target)>45){this.stopFollow(p);return;}
    // Share the fixed-step movement budget with manual inputs.
    p.followAcc+=Math.min(.1,Math.max(0,dt))*MOVE_HZ;
    const steps=Math.min(6,Math.floor(p.followAcc+1e-9));p.followAcc=Math.max(0,p.followAcc-steps);
    for(let i=0;i<steps&&p.moveBudget>=1;i++){
      const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz);
      const speed=this.moveSpeedMul(p);
      const f=d>2.8&&speed>0?Math.min(1,(d-2.8)/(RUN_SPEED*MOVE_DT*speed)):0;
      if(!f&&p.jy<=0&&p.vy<=0)break;
      p.moveBudget-=1;
      if(f)p.yaw=Math.atan2(dx,dz);
      stepMove(p,{f,s:0,yaw:p.yaw,j:0},speed);
    }
  }

  setTarget(p, id) {
    if (id === 0) {
      p.target = 0;
      p.autoOn = false;
      return true;
    }
    const t = this.ents.get(id);
    if (!t || t.kind === 'object') return false;
    if (t.kind === 'enemy' && t.state === 'dead') return false;
    if (p.target !== id) p.autoOn = false;
    p.target = id;
    return true;
  }

  respawn(p) {
    if (!p.dead) return false;
    if (this.time - p.deadAt < RESPAWN_DELAY_MS) return false;
    p.dead = false;
    this.stopFollow(p);
    p.x = WORLD.spawn.x;
    p.z = WORLD.spawn.z;
    p.jy = 0;
    p.vy = 0;
    p.hp = p.maxHp;
    p.res = CLASSES[p.cls].resource.start;
    p.surveyKit = p.cls === 'surveyor' ? { mark: null, rig: null } : null;
    p.buffs = [];
    p.target = 0;
    p.combatUntil = 0;
    if (p.companion) {
      p.companion.x = p.x + 1.5;
      p.companion.z = p.z - 1.5;
    }
    this.events.push({ e: 'fx', k: 'respawn', s: p.id });
    this.message(p, 'info', 'The Sanctum lattice reconstitutes you.');
    return true;
  }

  // --- simulation --------------------------------------------------------

  tick(dtMs) {
    this.time += dtMs;
    const dt = dtMs / 1000;
    for (const p of this.players.values()) {
      p.moveBudget = Math.min(MOVE_BUDGET_MAX, p.moveBudget + dt * MOVE_HZ);
      this.tickFollow(p,dt);
      expireBuffs(this, p);
      tickPlayerCombat(this, p, dt);
      tickBrineTrial(this,p);
      if (p.target) {
        const t = this.ents.get(p.target);
        if (!t || (t.kind === 'enemy' && t.state === 'dead' && this.time - t.deadAt > CORPSE_MS)) {
          p.target = 0;
          p.autoOn = false;
        }
      }
    }
    for (const e of this.enemies) tickEnemy(this, e, dt);
    for (const c of this.companions) tickCompanion(this, c, dt);
  }

  // --- snapshots ---------------------------------------------------------

  /** Public per-entity rows, shared by every recipient this tick. */
  buildRows() {
    const rows = [];
    for (const p of this.players.values()) {
      rows.push({
        i: p.id,
        x: r2(p.x),
        z: r2(p.z),
        j: r2(p.jy),
        r: r2(p.yaw),
        h: Math.max(0, Math.ceil(p.hp)),
        m: p.maxHp,
        f: (p.dead ? 1 : 0) | (this.time < p.combatUntil ? 8 : 0),
        t: p.target,
        b: p.buffs.filter(b => b.k !== 'shield' || (b.v > 0 && b.until > this.time)).map((b) => b.k),
        ...(p.surveyKit?.rig ? { rig: { x: r2(p.surveyKit.rig.x), z: r2(p.surveyKit.rig.z), r: p.stats.glyph === 'glyph_faultline' ? SURVEYOR.faultlineRadius : SURVEYOR.blastRadius } } : {}),
      });
    }
    for (const e of this.enemies) {
      if (e.state === 'dead' && this.time - e.deadAt > CORPSE_MS) continue;
      rows.push({
        i: e.id,
        x: r2(e.x),
        z: r2(e.z),
        r: r2(e.yaw),
        h: Math.max(0, Math.ceil(e.hp)),
        m: e.maxHp,
        f: (e.state === 'dead' ? 1 : 0) | (e.state === 'evade' ? 2 : 0) | (e.cast ? 4 : 0) | (e.state === 'combat' ? 8 : 0),
        t: e.target,
        b: e.buffs.map((b) => b.k),
      });
    }
    for (const c of this.companions) {
      rows.push({ i: c.id, x: r2(c.x), z: r2(c.z), r: r2(c.yaw), md: c.mode, a: c.act, t: c.actTarget, hs: c.host });
    }
    for (const o of this.objects) rows.push({ i: o.id, x: o.x, z: o.z });
    return rows;
  }

  metaFor(ent) {
    switch (ent.kind) {
      case 'player':
        return { i: ent.id, k: 'p', n: ent.name, c: ent.cls, l: ent.char.level, a: ent.char.look };
      case 'enemy':
        return { i: ent.id, k: 'e', n: ent.name, c: ent.type, l: ent.level, el: ENEMIES[ent.type].elite ? 1 : 0, ...(ENEMIES[ent.type].neutral ? { neu: 1 } : {}) };
      case 'companion':
        return { i: ent.id, k: 'c', n: ent.name, c: ent.type, o: ent.owner };
      default:
        return { i: ent.id, k: 'o', n: ent.name, c: ent.type };
    }
  }

  /** Private per-tick state for the owning player. */
  privateState(p) {
    const cds = {};
    for (const k of Object.keys(p.cds)) {
      const rem = p.cds[k] - this.time;
      if (rem > 0) cds[k] = Math.round(rem);
    }
    const barrier=p.buffs.find(b=>b.k==='shield'&&b.v>0&&b.until>this.time);
    const y = {
      ack: p.lastSeq,
      barrier:barrier?{remaining:Math.round(barrier.v),capacity:Math.round(barrier.cap??barrier.v),ms:Math.max(0,Math.round(barrier.until-this.time))}:null,
      follow: p.followId,
      x: p.x,
      z: p.z,
      jy: p.jy,
      vy: p.vy,
      sp: this.moveSpeedMul(p),
      res: Math.floor(p.res),
      cds,
      gcd: Math.max(0, Math.round(p.gcdUntil - this.time)),
      auto: p.autoOn ? 1 : 0,
      ...(p.cls==='keeper' ? {keeperShield: Math.max(0,Math.floor(p.buffs.find(b=>b.k==='shield'&&b.src===p.id&&b.keeper&&b.until>this.time)?.v||0))}:{}),
      losTarget: p.target,
      los: p.target && this.ents.has(p.target) ? Number(hasLineOfSight(p,this.ents.get(p.target))) : 1,
      autoCd: Math.max(0, Math.round(p.nextAuto - this.time)),
      safe: inSanctum(p) ? 1 : 0,
      workshop:workshopSite(p),
      party: partyState(this, p),
    };
    if(p.char.equipped.implant==='brine_rescue_lattice')y.rescueReady=!p.rescueSpent;
    if (p.brineTrial) y.brineTrial = { ms: Math.max(0,p.brineTrial.until-this.time), read:p.brineTrial.read };
    if (p.cls === 'surveyor') {
      const mark = p.surveyKit?.mark;
      const rig = p.surveyKit?.rig;
      y.surveyKit = { mark: mark?.id || 0, markMs: mark ? Math.max(0, mark.until - this.time) : 0, rigMs: rig ? Math.max(0, rig.until - this.time) : 0, rigDistance: rig ? r2(dist(p, rig)) : null };
    }
    if (p.dead) y.dead = Math.max(0, Math.round(RESPAWN_DELAY_MS - (this.time - p.deadAt)));
    return y;
  }

  /** The character sheet: sent whenever persistent/derived state changes. */
  sheet(p) {
    const c = p.char;
    return {
      name: c.name,
      cls: c.cls,
      look: c.look,
      level: c.level,
      xp: c.xp,
      inventory: [...c.inventory],
      materials: sanitizeMaterials(c.materials),
      equipped: { ...c.equipped },
      attunements: [...c.attunements],
      quest: { step: c.quest.step, progress: c.quest.progress },
      survey: c.survey ?? null,
      brineStage: c.brineStage ?? 0,
      stats: p.stats,
    };
  }

  endTick() {
    this.events = [];
    for (const p of this.players.values()) p.outbox = [];
  }
}
