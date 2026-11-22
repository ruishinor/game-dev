import { regionEntryDenial, RIFT_LEVEL, ELITE } from './enemy-levels.js';
import {migrateSurveyStrider} from './survey-strider.js';
// Authoritative world simulation. No I/O here: the network layer feeds
// validated commands in and reads snapshots/events out, and tests drive the
// clock directly through tick().

import { randomInt } from 'node:crypto';
import { CLASSES, ENEMIES, SPAWNS, SURVEYOR } from '../../shared/content.js';
import { deriveStats } from '../../shared/build.js';
import { activeBuildPreview, buildPreviewOptions, reconcileBuildPreview } from '../gm-build.js';
import { publicWeaponVisual } from '../../shared/weapon-visual.js';
import { activeWeaponSlot, electricalRodActive } from '../../shared/weapons.js';
import { tickPosture } from './posture.js';
import { publicArmourVisual, sameArmourVisual } from '../../shared/armour-visual.js';
import { publicSocialVisual } from '../../shared/social-visual.js';
import { sanitizeMaterials } from '../../shared/crafting.js';
import {sanitizeCraftingDisciplines} from '../../shared/crafting-disciplines.js';
import { sanitizeGoods } from '../../shared/goods.js';
import { sanitizeCredits } from './wallet.js';
import { sanitizeCondition } from '../../shared/condition.js';
import {vendorState,tickVendor} from './vendor.js';
import { WORLD, OBJECTS, MOVE_HZ, MOVE_DT, RUN_SPEED, dist, hasLineOfSight, stepMove, resolveCollisions, inSanctum, inSafeZone, PLAYER_RADIUS, RIFT_ANNEX, inRiftAnnex, inDisconnectedRegion, sameTravelRegion, travelRegionAt } from '../../shared/world.js';
import { tickEnemy, resetEnemy } from './ai.js';
import {
  tickCompanion, companionRoster, canCommissionSpindle, restoreCompanion,
  syncEquippedCompanion, dismissForTransit,
} from './companion.js';
import { createRift,tickRift,riftRow } from './rift.js';
import { createSeveranceGate, tickSeveranceGate, severanceRow, gateFront, pocketArrival } from './severance-gate.js';
import { spawnSeverancePatrols } from './severance-patrols.js';
import { spawnSalvageCamp } from './severance-camps.js';
import { worldClockPhase } from '../../shared/world-clock.js';
import {fieldQuestProjection} from './field-quests.js';
import {fieldReceiptProjection} from './field-receipts.js';
import {sanitizeDirectiveReceipts} from '../../shared/directive-receipts.js';
import {recoverySamples} from '../../shared/recovery.js';
import {recoveryRemaining} from './recovery.js';
import { tickVein, veinState, clearVein } from './severance-veins.js';
import {kestrelAlarmFor} from './kestrel-alarm.js';
import { tickPlayerCombat, expireBuffs, clearThreatFor, blastRadiusFor } from './combat.js';
import { workshopSite } from '../../shared/survey.js';
import { checkDirective, tickBrineTrial, tickInscription, cancelInscription, inscriptionState } from './progress.js';
import { partyState, removePartyPlayer } from './party.js';
import { inventoryCounts, trackAcquisitions } from './inventory-seen.js';
import { productionState, productionVisualState, stopProduction, tickProduction } from './production.js';
import { lootState, tickLoot, forgetLoot, clearLoot } from './loot.js';

const MOVE_BUDGET_MAX = 30; // movement steps a client may bank (0.5s)
export const CORPSE_MS = 12000;
export const RESPAWN_DELAY_MS = 3000;
export const COMBAT_LINGER_MS = 6000;

const r2 = (n) => Math.round(n * 100) / 100;

export class Game {
  constructor({ rng = Math.random, wallNow = Date.now, relicRng=()=>randomInt(1000000)/1000000, blueprintRng=()=>randomInt(1000000)/1000000, classArmourRng=()=>randomInt(1000000)/1000000, eliteRng=()=>randomInt(1000000)/1000000 } = {}) {
    this.eliteRng=eliteRng;
    this.relicRng=relicRng;
    this.blueprintRng=blueprintRng;
    this.classArmourRng=classArmourRng;
    this.wallNow=wallNow;
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
    this.eventRegions = new WeakMap();
    /** Called with a character record whenever persistent state changes. */
    this.onCharChanged = () => {};

    for (const o of OBJECTS) {
      const obj = { id: this.nextId++, kind: 'object', key: o.key, type: o.type, name: o.name, x: o.x, z: o.z, metaVer: 1 };
      if (o.yaw !== undefined) { obj.yaw = o.yaw; obj.variant = o.variant; }
      if (o.look) obj.look = o.look;
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
        form: s.form ?? null,
        metaVer: 1,
      };
      resetEnemy(this, e);
      this.enemies.push(e);
      this.ents.set(e.id, e);
    }
    this.rift=createRift(this);
    this.severance=createSeveranceGate(this);
    this.annexOpened=false;
  }

  // --- players -----------------------------------------------------------

  /** Bring a persisted character into the world. Returns the player entity. */
  addPlayer(char) {
    migrateSurveyStrider(char);
    const def = CLASSES[char.cls];
    const stats = deriveStats(char);
    const fresh = !(char.hp > 0) || !char.pos;
    const savedInAnnex=char.pos&&inDisconnectedRegion(char.pos.x,char.pos.z,4);
    const pos = fresh || savedInAnnex ? { ...WORLD.spawn } : { x: char.pos.x, z: char.pos.z };
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
      meleeState: null,
      cds: {},
      gcdUntil: 0,
      buffs: [],
      combatUntil: 0,
      lastSeq: 0,
      moveBudget: 12,
      followId: 0,
      followAcc: 0,
      lootTarget:null,
      vendor:null,
      utilityRev:0,
      inventoryRev: 0,
      inventoryCounts: inventoryCounts(char),
      outbox: [],
      sheetDirty: true,
      weaponVisual: publicWeaponVisual(char),
      armourVisual: publicArmourVisual(char),
      socialVisual: publicSocialVisual(char),
      metaVer: 1,
      companion: null,
      spindleCompanion: null,
      brineTrial: null,
      brineServiceUntil: 0,
      surveyKit: char.cls === 'surveyor' ? { mark: null, rig: null } : null,
      partyId: 0,
      partyInvite: null,
    };
    this.players.set(p.id, p);
    this.ents.set(p.id, p);
    restoreCompanion(this, p);
    checkDirective(this, p);
    return p;
  }

  /** Remove a player (disconnect). Persists position/health onto the record. */
  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (activeBuildPreview(p)) {
      p.gmAttributeBonus = 0;
      p.gmClassUnlocked = false;
      reconcileBuildPreview(p);
      this.refreshStats(p);
    }
    this.syncChar(p);
    cancelInscription(this, p);
    stopProduction(this, p);
    forgetLoot(this,p);
    removePartyPlayer(this, p);
    clearThreatFor(this, p.id);
    for (const c of new Set([p.companion, p.spindleCompanion].filter(Boolean))) {
      this.companions = this.companions.filter(active => active !== c);
      this.ents.delete(c.id);
    }
    for(const other of this.players.values())if(other.followId===id)this.stopFollow(other);
    this.players.delete(id);
    this.ents.delete(id);
    this.onCharChanged(p.char);
  }

  /** Copy live state that should survive a reconnect onto the record. */
  syncChar(p) {
    // Reconnects from the annex return safely to the Reach; HP is not restored.
    p.char.pos = inDisconnectedRegion(p.x,p.z,2)?{...WORLD.spawn}:{ x: r2(p.x), z: r2(p.z) };
    p.char.hp = p.dead ? 0 : Math.max(1, Math.round(p.hp));
    if (p.companion && p.companion.type !== 'spindle') {
      p.char.petMode = p.companion.mode;
      p.char.petName = p.companion.name;
    }
  }

  markDirty(p) {
    trackAcquisitions(p);
    p.sheetDirty = true;
    this.onCharChanged(p.char);
  }

  /** Only presentation metadata crosses the public entity boundary. */
  refreshPresentation(p) {
    const visual = publicWeaponVisual(p.char);
    if (p.weaponVisual !== visual) { p.weaponVisual = visual; p.metaVer += 1; }
    const armour = publicArmourVisual(p.char);
    if (!sameArmourVisual(p.armourVisual, armour)) { p.armourVisual = armour; p.metaVer += 1; }
    const social = publicSocialVisual(p.char);
    if (p.socialVisual !== social) { p.socialVisual = social; p.metaVer += 1; }
  }

  /** Recompute derived stats after level or loadout changes. */
  refreshStats(p) {
    p.stats = deriveStats(p.char, buildPreviewOptions(p));
    this.refreshPresentation(p);
    p.maxHp = p.stats.maxHp;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    syncEquippedCompanion(this, p);
  }

  message(p, kind, text) {
    p.outbox.push({ e: 'msg', k: kind, m: text });
  }

  emitWorldEvent(event) {
    const origin = this.ents.get(event.s || event.id || event.d || event.o);
    if (!origin) return;
    this.eventRegions.set(event, travelRegionAt(origin.x, origin.z));
    this.events.push(event);
  }

  // --- movement ----------------------------------------------------------

  moveSpeedMul(p) {
    // Owner GM preview bonus is session-only, bounded and server-authoritative.
    // The regular snapshot `sp` also updates the client's existing predictor.
    return p.dead ? 0 : 1 + Math.min(300, Math.max(0, p.gmSpeedBonus || 0)) / 100;
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
      if (p.inscription && (inp.f || inp.s || inp.j)) cancelInscription(this, p, 'Inscription interrupted by movement.');
      p.yaw = inp.yaw;
      stepMove(p, inp, this.moveSpeedMul(p));
    }
  }

  stopFollow(p) {p.followId=0;p.followAcc=0;}

  setFollow(p,id) {
    if(id===0){this.stopFollow(p);return {ok:true};}
    const target=this.players.get(id);
    if(p.dead||!target||target===p||target.dead||!sameTravelRegion(p,target)||dist(p,target)>45)return {ok:false,reason:'Select a living player within 45m to follow.'};
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
    if(p.dead||!target||target.dead||!sameTravelRegion(p,target)||dist(p,target)>45){this.stopFollow(p);return;}
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

  // The only gameplay route into the disconnected deck. The interaction
  // checks the actual server-owned gate, range, calibration and combat.
  travelRift(p,obj) {
    const entering=obj===this.rift?.entry,exiting=obj===this.rift?.exit;
    if(!entering&&!exiting)return {ok:false,reason:'Unknown phase gate.'};
    if(p.dead||dist(p,obj)>5||!hasLineOfSight(p,obj))return {ok:false,reason:'Approach the gate while alive.'};
    if(p.autoOn||this.time<p.combatUntil||p.buffs.some(b=>b.k==='root'&&b.until>this.time))return {ok:false,reason:'Disengage before travel.'};
    if(entering&&!(p.char.level>=RIFT_LEVEL))return {ok:false,reason:`The Phase Scar requires character level ${RIFT_LEVEL}.`};
    if(entering&&(inRiftAnnex(p.x,p.z)||!p.char.attunements.includes('resonance')||p.char.riftCalibration!=='completed'||['opening','unstable'].includes(this.rift.phase)))return {ok:false,reason:'Complete calibration and wait for a safe phase.'};
    if(exiting&&!inRiftAnnex(p.x,p.z))return {ok:false,reason:'The return gate is inside the annex.'};
    const regionDenial=entering&&this.severance?regionEntryDenial('severance_expanse',p.char):null;
    if(regionDenial)return {ok:false,reason:regionDenial};
    if(entering&&!this.severance)this.openAnnex();
    if(entering&&this.severance)this.openExpanse();
    // Phase Scar -> Severance Expanse (gate approach) -> Severance Gate -> Annex.
    // The Annex arrival gate returns travellers to the foot of the Severance Gate.
    const destination = entering ? (this.severance ? pocketArrival() : { x: RIFT_ANNEX.x, z: RIFT_ANNEX.arrivalZ })
      : this.severance ? gateFront() : { x: this.rift.entry.x, z: this.rift.entry.z - 3.6 };
    this.transferPlayer(p, destination);
    this.message(p,'info',entering?(this.severance?'Severance Expanse. Three routes cross the plain to the Severance Gate in the north: the Causeway of Sentinels, the Severed Pass and the Amber Flats. The Expedition Outpost east of the arrival is safe ground. The return rift beside the arrival terrace returns to the Reach.':'Phase Annex: Arrival Gallery. Cross the Relay Workshop to reach the Null Chamber. Return through the arrival gate outside combat.'):(this.severance?'You emerge before the Severance Gate.':'You returned to the Reach.'));
    return {ok:true};
  }

  /** Expanse patrols spawn with the first arrival and then persist (server-only routes). */
  openExpanse() {
    if(!this.expanseOpened){spawnSeverancePatrols(this);spawnSalvageCamp(this);this.expanseOpened=true;}
  }

  /** Persistent shared encounter, not an instance or a reset-on-entry farm. */
  openAnnex() {
    if(!this.annexOpened){
      // With the Severance Expanse present, the Annex is the Null Annex behind
      // the Foundry's Null Breach: level 13-15 content (REGION_LEVELS.null_annex),
      // six of its ten guards elite, and the Null Chamber Warden at 15.
      const heroic=!!this.severance;
      for(const [type,dx,z,name,lvl,elite] of [
        ['skitter',-9,17,'Threshold Skitter',13],['skitter',9,16,'Gallery Skitter',13],['skitter',-3,14,'Gallery Burrower',13,true],
        ['sentinel',-6,2,'Displaced Sentinel',14,true],['skitter',6,-3,'Phase Skitter',14],['faultstalker',10,5,'Null Relay Stalker',14,true],['skitter',-8,-5,'Relay Burrower',14],
        ['sentinel',7,-24,'Null Chamber Sentinel',15,true],['warden',-7,-25,'Null Chamber Warden',15],['faultstalker',8,-14,'Null Stalker',15,true],['skitter',-8,-17,'Null Burrower',15,true]
      ]){
        const def=ENEMIES[type],e={id:this.nextId++,kind:'enemy',type,name,level:heroic?lvl:def.level,radius:def.radius,home:{x:RIFT_ANNEX.x+dx,z},route:null,form:null,metaVer:1,annexEncounter:true,
          ...(heroic?{nullAnnex:true}:{}),...(heroic&&elite?{elite:{hp:ELITE.hp,dmg:ELITE.dmg}}:{})};
        resetEnemy(this,e);this.enemies.push(e);this.ents.set(e.id,e);
      }
      this.annexOpened=true;
    }
  }

  // Call only after the server accepts a specific gate and destination.
  transferPlayer(p, destination) {
    clearVein(p);
    this.stopFollow(p);for(const other of this.players.values())if(other.followId===p.id)this.stopFollow(other);
    clearThreatFor(this,p.id);clearLoot(p);p.vendor=null;
    cancelInscription(this,p);stopProduction(this,p);
    p.target=0;p.autoOn=false;p.meleeState=null;p.jy=0;p.vy=0;p.brineTrial=null;
    if(p.surveyKit){p.surveyKit.rig=null;p.surveyKit.mark=null;}
    this.transit(p,destination.x,destination.z,'area crossing');
    resolveCollisions(p,PLAYER_RADIUS);
    this.syncChar(p);this.markDirty(p);
  }

  setTarget(p, id) {
    if (id === 0) {
      p.target = 0;
      p.autoOn = false;
      return true;
    }
    const t = this.ents.get(id);
    if (!t || t.kind === 'object'||!sameTravelRegion(p,t)) return false;
    if (t.kind === 'enemy' && t.state === 'dead') return false;
    if (p.target !== id) p.autoOn = false;
    p.target = id;
    return true;
  }

  // All non-movement relocations dismiss companions without stripping buffs.
  transit(p,x,z,reason='transit') {
    dismissForTransit(this,p,reason);
    p.x=x;p.z=z;p.jy=0;p.vy=0;
  }

  respawn(p) {
    if (!p.dead) return false;
    if (this.time - p.deadAt < RESPAWN_DELAY_MS) return false;
    p.dead = false;
    this.stopFollow(p);
    clearLoot(p);
    this.transit(p,WORLD.spawn.x,WORLD.spawn.z,'return to the Sanctum');
    p.hp = p.maxHp;
    p.res = CLASSES[p.cls].resource.start;
    p.surveyKit = p.cls === 'surveyor' ? { mark: null, rig: null } : null;
    p.buffs = [];
    p.target = 0;
    p.combatUntil = 0;
    this.emitWorldEvent({ e: 'fx', k: 'respawn', s: p.id });
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
      tickPosture(this, p);
      tickBrineTrial(this,p);
      tickLoot(this,p);
      tickVendor(this,p);
      if (!p.dead && p.deployRetryAt != null && this.time >= p.deployRetryAt) {
        p.deployRetryAt = null;
        restoreCompanion(this, p);
      }
      if (p.target) {
        const t = this.ents.get(p.target);
        if (!t || (t.kind === 'enemy' && t.state === 'dead' && this.time - t.deadAt > CORPSE_MS)) {
          p.target = 0;
          p.autoOn = false;
        }
      }
    }
    tickRift(this);
    tickSeveranceGate(this);
    // aiHold: server-side capture fixture only (never client reachable)
    if (!this.aiHold) for (const e of this.enemies) tickEnemy(this, e, dt);
    for (const c of this.companions) tickCompanion(this, c, dt);
    for (const p of this.players.values()) {
      if (p.inscription) tickInscription(this, p);
      if (p.production) tickProduction(this, p);
      if (p.veinChannel) tickVein(this, p);
    }
  }

  // --- snapshots ---------------------------------------------------------

  /** Public per-entity rows before the network layer applies region visibility. */
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
        // 16: seated (sit/stand emote), public presentation only.
        f: (p.dead ? 1 : 0) | (this.time < p.combatUntil ? 8 : 0) | (p.sitting ? 16 : 0),
        t: p.target,
        // Rod appearance: 1 joined / 2 dual in hand, 3 stowed while the ranged weapon is active.
        ...(p.char.equipped.weapon==='electrical_combat_rod'&&p.char.inventory.includes('electrical_combat_rod')?{er:!electricalRodActive(p.char)?3:p.char.electricalRodMode==='dual'?2:1}:{}),
        ...(p.production?{work:productionVisualState(this,p)}:{}),
        b: p.buffs.filter(b => b.k !== 'shield' || (b.v > 0 && b.until > this.time)).map((b) => b.k),
        ...(p.surveyKit?.rig ? { rig: { x: r2(p.surveyKit.rig.x), z: r2(p.surveyKit.rig.z), r: blastRadiusFor(p) } } : {}),
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
        ...(e.form ? { ec: e.ecologyMode, grown: e.grown ? 1 : 0, ...(e.calcified?{mineral:1}:{}), ...(e.scarred?{scar:1}:{}) } : e.type==='faultstalker' ? {ec:e.ecologyMode} : {}),
      });
    }
    for (const c of this.companions) {
      rows.push({ i: c.id, x: r2(c.x), z: r2(c.z), r: r2(c.yaw), md: c.mode, a: c.act, t: c.actTarget, hs: c.host, ...(c.type === 'spindle' ? { li: c.lightOn ? 1 : 0 } : {}) });
    }
    for (const o of this.objects) rows.push({ i: o.id, x: o.x, z: o.z, ...riftRow(this,o), ...severanceRow(this,o) });
    return rows;
  }

  metaFor(ent) {
    switch (ent.kind) {
      case 'player':
        return { i: ent.id, k: 'p', n: ent.name, c: ent.cls, l: ent.char.level, a: ent.char.look, ap: ent.char.appearance, ...(ent.weaponVisual ? { wv: ent.weaponVisual } : {}), ...(ent.socialVisual ? { sv: ent.socialVisual } : ent.armourVisual ? { av: ent.armourVisual } : {}) };
      case 'enemy':
        return { i: ent.id, k: 'e', n: ent.name, c: ent.type, l: ent.level, el: ENEMIES[ent.type].elite || ent.elite ? 1 : 0, ...(ENEMIES[ent.type].neutral ? { neu: 1 } : {}), ...(ent.form ? { form: ent.form } : {}), ...(ent.vx ? { vx: ent.vx } : {}) };
      case 'companion':
        return { i: ent.id, k: 'c', n: ent.name, c: ent.type, o: ent.owner };
      default:
        return { i: ent.id, k: 'o', n: ent.name, c: ent.type, ...(ent.yaw !== undefined ? { y: ent.yaw, v: ent.variant } : {}), ...(ent.look ? { a: ent.look } : {}) };
    }
  }

  /** World clock phase 0..1 (server-owned; wall-clock based so it survives restarts). */
  worldClock() {
    return worldClockPhase(this.clockNow ? this.clockNow() : Date.now());
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
      region: travelRegionAt(p.x, p.z),
      ack: p.lastSeq,
      comp:p.companion?.id??0,
      spindleId:p.spindleCompanion?.id??0,
      ...lootState(this,p),
      recoveryMs:recoveryRemaining(p.char,this.wallNow()),
      ...(travelRegionAt(p.x, p.z) === 'severance_expanse' ? { veins: veinState(this, p) } : {}),
      vendor:vendorState(this,p),
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
      weaponSwitchMs: Math.max(0, Math.round((p.weaponSwitchReady || 0) - this.time)),
      safe: inSafeZone(p) ? 1 : 0,
      wc: Math.round(this.worldClock() * 10000),
      workshop:workshopSite(p),
      kestrelAlarm:kestrelAlarmFor(this,p),
      party: partyState(this, p),
      companions: companionRoster(this, p),
      canCommissionSpindle: canCommissionSpindle(this, p),
      inscription: inscriptionState(this, p),
      production: productionState(this, p),
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
      companion:p.companion?.type??null,
      striderLearned:c.striderLearned===true,
      initiationSeen:c.initiationSeen===true,
      look: c.look,
      appearance: c.appearance,
      level: c.level,
      xp: c.xp,
      inventory: [...c.inventory],
      unseenItems: [...(c.unseenItems || [])],
      inventoryRev: p.inventoryRev,
      materials: sanitizeMaterials(c.materials),
      goods: sanitizeGoods(c.goods),
      utilityRev:p.utilityRev,
      credits: sanitizeCredits(c.credits),
      condition:sanitizeCondition(c.condition,c.inventory),
      equipped: { ...c.equipped },
      ...(c.equipped.weapon==='electrical_combat_rod'&&c.inventory.includes('electrical_combat_rod')?{electricalRodMode:c.electricalRodMode==='dual'?'dual':'rod'}:{}),
      activeWeapon: activeWeaponSlot(c),
      attunements: [...c.attunements],
      quest: { step: c.quest.step, progress: c.quest.progress },
      directiveReceipts:sanitizeDirectiveReceipts(c.directiveReceipts,c.cls,c.quest.step),
      ...fieldQuestProjection(c),
      fieldRewardReceipts:fieldReceiptProjection(c),
      recoverySamples:recoverySamples(c.recoverySamples),
      craftingDisciplines:sanitizeCraftingDisciplines(c.craftingDisciplines),
      survey: c.survey ?? null,
      brineStage: c.brineStage ?? 0,
      stats: p.stats,
      // Private sheet only; these values describe active preview effects, never grant authority.
      ...(activeBuildPreview(p) ? { buildPreview: buildPreviewOptions(p) } : {}),
    };
  }

  endTick({preservePrivate=false}={}) {
    this.events = [];
    if(!preservePrivate)for (const p of this.players.values()) p.outbox = [];
  }
}
