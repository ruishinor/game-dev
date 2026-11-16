// Character persistence: a single JSON file written atomically.
// Characters are owned by whoever holds their secret token; only a hash of
// the token is stored.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { CLASSES, ITEMS, DIRECTIVES, MAX_LEVEL, ATTUNEMENT_NAMES, COMPANIONS, defaultLook, validLook } from '../shared/content.js';
import { validateLoadout } from '../shared/build.js';

const NAME_RE = /^[A-Za-z][A-Za-z '-]{1,14}[A-Za-z]$/;
export const MAX_CHARACTERS = 500;

const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function validName(name) {
  return typeof name === 'string' && NAME_RE.test(name) && !/[ '-]{2}/.test(name);
}

/** Coerce a loaded record into a valid character, or return null. */
function sanitize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.id !== 'string' || typeof raw.tokenHash !== 'string') return null;
  if (!validName(raw.name) || !Object.hasOwn(CLASSES, raw.cls)) return null;
  const int = (v, lo, hi, d) => (Number.isInteger(v) && v >= lo && v <= hi ? v : d);
  const c = {
    id: raw.id,
    tokenHash: raw.tokenHash,
    name: raw.name,
    cls: raw.cls,
    // Cosmetic only; anything unrecognised falls back to the class default.
    look: validLook(raw.cls, raw.look) ? raw.look : defaultLook(raw.cls),
    level: int(raw.level, 1, MAX_LEVEL, 1),
    xp: int(raw.xp, 0, 1e6, 0),
    inventory: Array.isArray(raw.inventory) ? [...new Set(raw.inventory.filter((i) => Object.hasOwn(ITEMS, i)))] : [],
    equipped: { device: null, implant: null, glyph: null },
    attunements: Array.isArray(raw.attunements) ? [...new Set(raw.attunements.filter((a) => Object.hasOwn(ATTUNEMENT_NAMES, a)))] : [],
    quest: {
      step: int(raw.quest?.step, 0, DIRECTIVES.length, 0),
      progress: int(raw.quest?.progress, 0, 1000, 0),
    },
    pos: null,
    hp: typeof raw.hp === 'number' && Number.isFinite(raw.hp) ? raw.hp : 0,
    petMode: typeof raw.petMode === 'string' && Object.hasOwn(COMPANIONS.mender.modes, raw.petMode) ? raw.petMode : 'triage',
    createdAt: int(raw.createdAt, 0, Number.MAX_SAFE_INTEGER, 0),
    lastSeen: int(raw.lastSeen, 0, Number.MAX_SAFE_INTEGER, 0),
  };
  if (raw.pos && Number.isFinite(raw.pos.x) && Number.isFinite(raw.pos.z)) c.pos = { x: raw.pos.x, z: raw.pos.z };
  if (raw.equipped && typeof raw.equipped === 'object') {
    const eq = { device: raw.equipped.device || null, implant: raw.equipped.implant || null, glyph: raw.equipped.glyph || null };
    // A loadout that no longer validates (content changed) is simply cleared.
    if (validateLoadout(c, eq).ok) c.equipped = eq;
  }
  return c;
}

export class CharacterStore {
  /** @param {string|null} file Path of the JSON file, or null for in-memory. */
  constructor(file) {
    this.file = file;
    this.chars = new Map();
    this.byToken = new Map();
    this.byName = new Map();
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
    for (const raw of Array.isArray(data?.characters) ? data.characters : []) {
      const c = sanitize(raw);
      if (c && !this.chars.has(c.id) && !this.byName.has(c.name.toLowerCase())) this.index(c);
    }
  }

  index(c) {
    this.chars.set(c.id, c);
    this.byToken.set(c.tokenHash, c);
    this.byName.set(c.name.toLowerCase(), c);
  }

  /** Create a character. Returns {char, token} or {error}. */
  create(name, cls, look) {
    if (!validName(name)) return { error: 'Names are 3–16 letters (spaces, apostrophes and hyphens allowed inside).' };
    if (!Object.hasOwn(CLASSES, cls)) return { error: 'Unknown class.' };
    if (this.byName.has(name.toLowerCase())) return { error: 'That name is already taken.' };
    if (this.chars.size >= MAX_CHARACTERS) return { error: 'This world is full.' };
    const token = crypto.randomBytes(32).toString('hex');
    const char = {
      id: crypto.randomUUID(),
      tokenHash: hashToken(token),
      name,
      cls,
      look: validLook(cls, look) ? look : defaultLook(cls),
      level: 1,
      xp: 0,
      inventory: [],
      equipped: { device: null, implant: null, glyph: null },
      attunements: [],
      quest: { step: 0, progress: 0 },
      pos: null,
      hp: 0,
      petMode: 'triage',
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

  markDirty() {
    this.dirty = true;
  }

  /** Write to disk if anything changed. Atomic: temp file + rename. */
  flush() {
    if (!this.dirty || !this.file) {
      this.dirty = false;
      return false;
    }
    const data = JSON.stringify({ version: 1, characters: [...this.chars.values()] });
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, data, { mode: 0o600 });
    fs.renameSync(tmp, this.file);
    this.dirty = false;
    return true;
  }
}
