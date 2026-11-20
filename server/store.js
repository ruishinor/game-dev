// Character persistence: a single JSON file written atomically.
import {sanitizeVeinReady} from './sim/severance-veins.js';
// Characters are owned by whoever holds their secret token; only a hash of
// the token is stored.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { CLASSES, ITEMS, SLOTS, DIRECTIVES, MAX_LEVEL, ATTUNEMENT_NAMES, COMPANIONS, defaultLook, validLook, validCompanionName } from '../shared/content.js';
import { resolveLoadout } from '../shared/build.js';
import { publicWeaponVisual } from '../shared/weapon-visual.js';
import { publicArmourVisual } from '../shared/armour-visual.js';
import { publicSocialVisual } from '../shared/social-visual.js';
import { WORLD, zoneAt, inDisconnectedRegion } from '../shared/world.js';
import { surveyState, brineStage } from '../shared/survey.js';
import { sanitizeMaterials } from '../shared/crafting.js';
import {sanitizeCraftingDisciplines} from '../shared/crafting-disciplines.js';
import { appearanceString } from '../shared/appearance.js';
import { sanitizeGoods } from '../shared/goods.js';
import { sanitizeCredits } from './sim/wallet.js';
import { sanitizeCondition } from '../shared/condition.js';
import {sanitizeTraceState} from './sim/field-quests.js';
import {sanitizeFieldReceipts} from './sim/field-receipts.js';
import {sanitizeDirectiveReceipts} from '../shared/directive-receipts.js';
import {sanitizeRiftCalibration} from './sim/rift-journal.js';
import { sanitizeUnseen } from './sim/inventory-seen.js';
import { ownedCompanionTypes } from './sim/companion.js';
import {migrateSurveyStrider} from './sim/survey-strider.js';
import { recoverySamples } from '../shared/recovery.js';
import { sanitizeRecoveryReadyAt } from './sim/recovery.js';

const NAME_RE = /^[A-Za-z][A-Za-z '-]{1,14}[A-Za-z]$/;
export const MAX_CHARACTERS = 500;
export const MAX_ACCOUNT_CHARACTERS = 6;
const MAX_ACCOUNT_SESSIONS = 4;
const HANDLE_RE = /^[A-Za-z][A-Za-z0-9_-]{2,23}$/;
const scrypt = promisify(crypto.scrypt);
const passwordDigest = async (password, salt) =>
  (await scrypt(password, Buffer.from(salt, 'hex'), 64, { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex');

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function validName(name) {
  return typeof name === 'string' && NAME_RE.test(name) && !/[ '-]{2}/.test(name);
}

/** Coerce a loaded record into a valid character, or return null. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string') return null;
  const accountId = typeof raw.accountId === 'string' ? raw.accountId : null;
  if (!accountId && typeof raw.tokenHash !== 'string') return null;
  if (!validName(raw.name) || !Object.hasOwn(CLASSES, raw.cls)) return null;
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  const c = {
    id: raw.id,
    tokenHash: accountId ? null : raw.tokenHash,
    accountId,
    name: raw.name,
    cls: raw.cls,
    // Cosmetic only; anything unrecognised falls back to the class default.
    look: validLook(raw.cls, raw.look) ? raw.look : defaultLook(raw.cls),
    // Cosmetic body/race/hair; saves made before it existed keep their look's body.
    appearance: appearanceString(raw.appearance, validLook(raw.cls, raw.look) ? raw.look : defaultLook(raw.cls)),
    initiationSeen:raw.initiationSeen===true,
    level: int(raw.level, 1, MAX_LEVEL, 1),
    xp: int(raw.xp, 0, 1e6, 0),
    inventory: Array.isArray(raw.inventory) ? [...new Set(raw.inventory.filter((i) => Object.hasOwn(ITEMS, i)))] : [],
    materials: sanitizeMaterials(raw.materials),
    goods: sanitizeGoods(raw.goods),
    credits: sanitizeCredits(raw.credits),
    equipped: { device: null, implant: null, glyph: null },
    attunements: Array.isArray(raw.attunements) ? [...new Set(raw.attunements.filter((a) => Object.hasOwn(ATTUNEMENT_NAMES, a)))] : [],
    quest: {
      step: int(raw.quest?.step, 0, DIRECTIVES.length, 0),
      progress: int(raw.quest?.progress, 0, 1000, 0),
    },
    survey: surveyState(raw.survey),
    traceState:sanitizeTraceState(raw.traceState),
    riftCalibration:sanitizeRiftCalibration(raw.riftCalibration),
    annexProgress:int(raw.annexProgress,0,3,0),
    annexClaimed:raw.annexClaimed===true&&raw.annexProgress===3,
    foundryProgress:int(raw.foundryProgress,0,3,0),
    foundryClaimed:raw.foundryClaimed===true&&raw.foundryProgress===3,
    recoverySamples:recoverySamples(raw.recoverySamples),
    craftingDisciplines:sanitizeCraftingDisciplines(raw.craftingDisciplines),
    recoveryReadyAt:sanitizeRecoveryReadyAt(raw.recoveryReadyAt),
    veinReadyAt:sanitizeVeinReady(raw.veinReadyAt),
    brineStage: surveyState(raw.survey)?.endsWith('_done') ? brineStage(raw.brineStage) : 0,
    pos: null,
    hp: typeof raw.hp === 'number' && Number.isFinite(raw.hp) ? raw.hp : 0,
    petMode: typeof raw.petMode === 'string' && Object.hasOwn((raw.cls==='surveyor'?COMPANIONS.survey_strider:COMPANIONS.mender).modes, raw.petMode) ? raw.petMode : (raw.cls==='surveyor'?'follow':'triage'),
    petName: raw.cls==='surveyor' ? (validCompanionName(raw.petName)&&raw.petName!==COMPANIONS.mender.name?raw.petName:COMPANIONS.survey_strider.name) : (validCompanionName(raw.petName)?raw.petName:COMPANIONS.mender.name),
    createdAt: int(raw.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastSeen: int(raw.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  c.directiveReceipts=sanitizeDirectiveReceipts(raw.directiveReceipts,c.cls,c.quest.step);
  c.fieldReceipts=sanitizeFieldReceipts(raw.fieldReceipts,c);
  c.condition=sanitizeCondition(raw.condition,c.inventory);
  c.companionDismissed = raw.companionDismissed === true;
  c.striderLearned=c.cls==='surveyor'&&raw.striderLearned===true;
  c.activeCompanion=raw.activeCompanion==='spindle'&&raw.spindle?.commissioned===true?'spindle':null;
  if(c.cls==='surveyor'&&raw.equipped?.device==='survey_strider_link')c.equipped.device='survey_strider_link';
  migrateSurveyStrider(c);
  c.unseenItems = sanitizeUnseen(raw.unseenItems, c);
  if (raw.spindle?.commissioned === true) {
    c.spindle = {
      commissioned: true,
      name: validCompanionName(raw.spindle.name) ? raw.spindle.name : COMPANIONS.spindle.name,
      mode: raw.spindle.mode === 'stay' ? 'stay' : 'follow',
    };
    // Independent persistent utility slot. Legacy saves stored a summoned
    // Spindle in the exclusive activeCompanion field.
    c.spindleDismissed = raw.spindleDismissed === false ? false
      : raw.spindleDismissed === true ? true
      : !(raw.activeCompanion === 'spindle' && raw.companionDismissed !== true);
  }
  const owned = ownedCompanionTypes(c);
  c.defaultCompanion = owned.includes(raw.defaultCompanion) ? raw.defaultCompanion : null;
  c.activeCompanion = !c.companionDismissed && owned.includes(raw.activeCompanion) ? raw.activeCompanion : null;
  if (raw.pos && Number.isFinite(raw.pos.x) && Number.isFinite(raw.pos.z)) c.pos = { x: raw.pos.x, z: raw.pos.z };
  if (raw.equipped && typeof raw.equipped === 'object') {
    const eq = { device: raw.equipped.device || null, implant: raw.equipped.implant || null, glyph: raw.equipped.glyph || null };
    for(const slot of SLOTS.filter(slot => !['device','implant','glyph'].includes(slot)))if(raw.equipped[slot])eq[slot]=raw.equipped[slot];
    c.equipped = resolveLoadout(c, eq).equipped;
    for(const slot of SLOTS.filter(slot => !['device','implant','glyph'].includes(slot)))if(!c.equipped[slot])delete c.equipped[slot];
  }
  if(c.cls==='vanguard'&&c.inventory.includes('electrical_combat_rod')&&raw.electricalRodMode==='dual')c.electricalRodMode='dual';
  return c;
}

export class CharacterStore {
  /** @param {string|null} file Path of the JSON file, or null for in-memory. */
  constructor(file) {
    this.file = file;
    this.chars = new Map();
    this.byToken = new Map();
    this.byName = new Map();
    this.accounts = new Map();
    this.byHandle = new Map();
    this.byAccountToken = new Map();
    this.dirty = false;
    if (file) this.load();
  }

  load() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') return;
      throw err;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      // Never overwrite a file we could not understand: keep it for recovery.
      const backup = `${this.file}.corrupt-${Date.now()}`;
      fs.renameSync(this.file, backup);
      console.error(`[store] character file was unreadable; moved to ${backup}`);
      return;
    }
    for (const a of Array.isArray(data?.accounts) ? data.accounts : []) {
      if (!a || typeof a.id !== 'string' || typeof a.handle !== 'string' || !HANDLE_RE.test(a.handle)) continue;
      if (typeof a.salt !== 'string' || !/^[0-9a-f]{32}$/.test(a.salt)) continue;
      if (typeof a.passwordHash !== 'string' || !/^[0-9a-f]{128}$/.test(a.passwordHash)) continue;
      if (this.accounts.has(a.id) || this.byHandle.has(a.handle.toLowerCase())) continue;
      const account = {
        id: a.id, handle: a.handle, salt: a.salt, passwordHash: a.passwordHash,
        sessions: Array.isArray(a.sessions) ? [...new Set(a.sessions.filter((t) => typeof t === 'string' && /^[0-9a-f]{64}$/.test(t)))].slice(-MAX_ACCOUNT_SESSIONS) : [],
      };
      this.indexAccount(account);
    }
    for (const raw of Array.isArray(data?.characters) ? data.characters : []) {
      const c = sanitize(raw);
      if (c?.accountId && !this.accounts.has(c.accountId)) continue;
      if (c && !this.chars.has(c.id) && !this.byName.has(c.name.toLowerCase())) this.index(c);
    }
  }

  index(c) {
    this.chars.set(c.id, c);
    if (c.tokenHash) this.byToken.set(c.tokenHash, c);
    this.byName.set(c.name.toLowerCase(), c);
  }

  indexAccount(a) {
    this.accounts.set(a.id, a);
    this.byHandle.set(a.handle.toLowerCase(), a);
    for (const tokenHash of a.sessions) this.byAccountToken.set(tokenHash, a);
  }

  /** Create a character. Returns {char, token} or {error}. */
  create(name, cls, look, appearance) {
    if (!validName(name)) return { error: 'Names are 3–16 letters (spaces, apostrophes and hyphens allowed inside).' };
    if (!Object.hasOwn(CLASSES, cls)) return { error: 'Unknown class.' };
    if (this.byName.has(name.toLowerCase())) return { error: 'That name is already taken.' };
    if (this.chars.size >= MAX_CHARACTERS) return { error: 'This world is full.' };
    const token = crypto.randomBytes(32).toString('hex');
    const char = {
      id: crypto.randomUUID(),
      tokenHash: hashToken(token),
      accountId: null,
      name,
      cls,
      look: validLook(cls, look) ? look : defaultLook(cls),
      appearance: appearanceString(appearance, validLook(cls, look) ? look : defaultLook(cls)),
      initiationSeen:false,
      level: 1,
      xp: 0,
      inventory: [],
      materials: {},
      goods: {},
      credits: 0,
      condition: {},
      equipped: { device: null, implant: null, glyph: null },
      directiveReceipts: [],
      fieldReceipts: {},
      attunements: [],
      quest: { step: 0, progress: 0 },
      survey: null,
      traceState:null,
      riftCalibration:null,
      recoverySamples:0,
      craftingDisciplines:sanitizeCraftingDisciplines(null),
      recoveryReadyAt:0,
      veinReadyAt:{},
      brineStage: 0,
      pos: null,
      hp: 0,
      petMode: 'triage',
      petName: cls==='surveyor'?COMPANIONS.survey_strider.name:COMPANIONS.mender.name,
      createdAt: Date.now(),
      lastSeen: Date.now(),
    };
    this.index(char);
    this.dirty = true;
    return { char, token };
  }

  /** Look up the character a token unlocks, or null. */
  authenticate(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    return this.byToken.get(hashToken(token)) || null;
  }

  /** Account sessions are separate from legacy character bearer tokens. */
  authenticateAccount(token) {
    if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
    return this.byAccountToken.get(hashToken(token)) || null;
  }

  listCharacters(account) {
    return [...this.chars.values()].filter((c) => c.accountId === account.id)
      .map((c) => ({
        id:c.id, name:c.name, cls:c.cls, look:c.look, appearance:c.appearance,
        level:c.level, xp:c.xp, credits:c.credits, lastSeen:c.lastSeen,
        initiationSeen:c.initiationSeen,
        // Only this authenticated account's characters are projected.
        // Use the same allowlisted appearance metadata as the actual world entity.
        wv:publicWeaponVisual(c),
        // Match the world entity's cosmetic override precedence.
        av:publicSocialVisual(c)?null:publicArmourVisual(c),
        sv:publicSocialVisual(c),
        er:c.cls==='vanguard'&&c.equipped?.weapon==='electrical_combat_rod'
          &&c.inventory.includes('electrical_combat_rod')?(c.electricalRodMode==='dual'?2:1):null,
        location:!c.initiationSeen?'Character Initiation':!c.pos||inDisconnectedRegion(c.pos.x,c.pos.z,4)
          ?zoneAt(WORLD.spawn.x,WORLD.spawn.z):zoneAt(c.pos.x,c.pos.z),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  issueAccountSession(account) {
    const token = crypto.randomBytes(32).toString('hex');
    const digest = hashToken(token);
    account.sessions.push(digest);
    this.byAccountToken.set(digest, account);
    while (account.sessions.length > MAX_ACCOUNT_SESSIONS) this.byAccountToken.delete(account.sessions.shift());
    this.dirty = true;
    return token;
  }

  async registerAccount(handle, password) {
    if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) return { error: 'Account names must be 3–24 letters, numbers, underscores or hyphens.' };
    if (typeof password !== 'string' || password.length < 12 || password.length > 128 || Buffer.byteLength(password, 'utf8') > 256) {
      return { error: 'Use a password of 12–128 characters.' };
    }
    if (this.byHandle.has(handle.toLowerCase())) return { error: 'That account name is taken.' };
    const salt = crypto.randomBytes(16).toString('hex');
    const digest = await passwordDigest(password, salt);
    if (this.byHandle.has(handle.toLowerCase())) return { error: 'That account name is taken.' };
    const account = { id: crypto.randomUUID(), handle, salt, passwordHash: digest, sessions: [] };
    this.indexAccount(account);
    const token = this.issueAccountSession(account);
    return { account, token };
  }

  async loginAccount(handle, password) {
    if (typeof handle !== 'string' || !HANDLE_RE.test(handle) || typeof password !== 'string' || password.length > 128 || Buffer.byteLength(password, 'utf8') > 256) return { error: 'Invalid account name or password.' };
    const account = this.byHandle.get(handle.toLowerCase());
    // Equal work for unknown names avoids revealing account existence through timing.
    const salt = account?.salt || '00000000000000000000000000000000';
    const digest = await passwordDigest(password, salt);
    if (!account || !crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(account.passwordHash, 'hex'))) {
      return { error: 'Invalid account name or password.' };
    }
    return { account, token: this.issueAccountSession(account) };
  }

  revokeAccountSession(account, token) {
    const digest = typeof token === 'string' ? hashToken(token) : '';
    if (!account.sessions.includes(digest)) return false;
    account.sessions = account.sessions.filter((t) => t !== digest);
    this.byAccountToken.delete(digest);
    this.dirty = true;
    return true;
  }

  createForAccount(account, name, cls, look, appearance) {
    if (this.listCharacters(account).length >= MAX_ACCOUNT_CHARACTERS) return { error: 'This account already has six characters.' };
    const result = this.create(name, cls, look, appearance);
    if (result.error) return result;
    const char = result.char;
    this.byToken.delete(char.tokenHash);
    char.tokenHash = null;
    char.accountId = account.id;
    this.dirty = true;
    return { char };
  }

  claimLegacy(account, token) {
    const char = this.authenticate(token);
    if (!char || char.accountId) return { error: 'Invalid or already-linked character recovery key.' };
    if (this.listCharacters(account).length >= MAX_ACCOUNT_CHARACTERS) return { error: 'This account already has six characters.' };
    this.byToken.delete(char.tokenHash);
    char.tokenHash = null;
    char.accountId = account.id;
    this.dirty = true;
    return { char };
  }

  deleteOwned(account, id, confirmedName) {
    const char = typeof id === 'string' ? this.chars.get(id) : null;
    if (!char || char.accountId !== account.id || confirmedName !== char.name) return { error: 'Character deletion was not authorised.' };
    this.chars.delete(char.id);
    this.byName.delete(char.name.toLowerCase());
    this.dirty = true;
    return { char };
  }

  markDirty() {
    this.dirty = true;
  }

  /** Write to disk if anything changed. Atomic: temp file + rename. */
  flush() {
    if (!this.dirty || !this.file) {
      this.dirty = false;
      return false;
    }
    const data = JSON.stringify({ version: 2, accounts: [...this.accounts.values()], characters: [...this.chars.values()] });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.dirty = false;
    return true;
  }
}
