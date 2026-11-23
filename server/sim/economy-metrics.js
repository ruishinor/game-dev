// Opt-in, aggregated, server-side economic observation. No event log, player
// identity, IP, token, name, position, chat content or raw session history.
import fs from 'node:fs';
import path from 'node:path';
import { CLASSES, ITEMS } from '../../shared/content.js';
import { MATERIALS, RECIPES } from '../../shared/crafting.js';
import { GOODS } from '../../shared/goods.js';

const EVENTS = Object.freeze([
  'sessions', 'session_seconds', 'kills', 'xp_awarded',
  'credits_looted', 'credits_vendor_in', 'credits_vendor_out', 'vendor_trades',
  'materials_granted', 'materials_crafted', 'materials_spent',
  'goods_granted', 'goods_crafted', 'goods_spent',
  'items_granted', 'items_crafted', 'items_consumed', 'craft_cycles',
]);
const VALID_EVENTS = new Set(EVENTS);
const DETAIL = Object.freeze({
  materials_granted: MATERIALS, materials_crafted: MATERIALS, materials_spent: MATERIALS,
  goods_granted: GOODS, goods_crafted: GOODS, goods_spent: GOODS,
  items_granted: ITEMS, items_crafted: ITEMS, items_consumed: ITEMS,
  craft_cycles: RECIPES,
});
const MAX_DAYS = 90;
const BAND = level => level < 5 ? '1-4' : level < 8 ? '5-7' : level < 12 ? '8-11' : '12-15';
const validNumber = n => Number.isSafeInteger(n) && n >= 0 && n <= 1_000_000_000;
const bounded = n => Math.min(Number.MAX_SAFE_INTEGER, n);
const emptyDay = () => ({ totals: {}, byClass: {}, byLevel: {}, byDetail: {} });
const record = (bucket, event, amount) => {
  bucket[event] = bounded((bucket[event] || 0) + amount);
};
const validCount = (n) => validNumber(n) && n > 0;
const validDay = s => /^\\d{4}-\\d{2}-\\d{2}$/.test(s);
const sanitizeBucket = raw => {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) for (const event of EVENTS) {
    if (validNumber(raw[event])) out[event] = raw[event];
  }
  return out;
};
// Never trust historical telemetry JSON to add new fields or free-form keys.
function sanitizeDays(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const day of Object.keys(raw).filter(validDay).sort().slice(-MAX_DAYS)) {
    const src = raw[day];
    if (!src || typeof src !== 'object' || Array.isArray(src)) continue;
    const clean = emptyDay();
    clean.totals = sanitizeBucket(src.totals);
    for (const cls of Object.keys(CLASSES)) clean.byClass[cls] = sanitizeBucket(src.byClass?.[cls]);
    for (const band of ['1-4', '5-7', '8-11', '12-15']) clean.byLevel[band] = sanitizeBucket(src.byLevel?.[band]);
    for (const [event, catalogue] of Object.entries(DETAIL)) {
      const srcValues = src.byDetail?.[event];
      if (!srcValues || typeof srcValues !== 'object') continue;
      const outValues = {};
      for (const id of Object.keys(catalogue)) {
        if (validNumber(srcValues[id])) outValues[id] = srcValues[id];
      }
      if (Object.keys(outValues).length) clean.byDetail[event] = outValues;
    }
    out[day] = clean;
  }
  return out;
}

export class EconomyMetrics {
  constructor(file, now = Date.now) {
    this.file = typeof file === 'string' && file.trim() ? file : null;
    this.now = now;
    this.days = {};
    this.dirty = false;
    if (this.file && fs.existsSync(this.file)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        if (data.version !== 1 || !data.days || typeof data.days !== 'object') throw Error('invalid metrics schema');
        this.days = sanitizeDays(data.days);
      } catch (error) {
        // Never overwrite an unreadable historical metrics snapshot.
        console.warn('[economy] metrics read failed; recording disabled:', error.message);
        this.file = null;
      }
    }
  }

  observe(event, player, amount = 1, detail = null) {
    if (!this.file || !VALID_EVENTS.has(event) || !validCount(amount) ||
        !player || player.economyExcluded === true ||
        !Object.hasOwn(CLASSES, player.cls) ||
        !Number.isSafeInteger(player.char?.level) || player.char.level < 1 || player.char.level > 15) return false;
    if (detail !== null && (!DETAIL[event] || !Object.hasOwn(DETAIL[event], detail))) return false;
    const timestamp = this.now();
    if (!Number.isFinite(timestamp)) return false;
    const day = new Date(timestamp).toISOString().slice(0, 10);
    if (!validDay(day)) return false;
    const bucket = this.days[day] ||= emptyDay();
    const cls = player.cls, band = BAND(player.char.level);
    record(bucket.totals, event, amount);
    record(bucket.byClass[cls] ||= {}, event, amount);
    record(bucket.byLevel[band] ||= {}, event, amount);
    if (detail) record(bucket.byDetail[event] ||= {}, detail, amount);
    this.dirty = true;
    const keys = Object.keys(this.days).sort();
    for (const oldest of keys.slice(0, Math.max(0, keys.length - MAX_DAYS))) delete this.days[oldest];
    return true;
  }

  sessionEnded(player) {
    if (!Number.isFinite(player?.economyStartedAt)) return;
    this.observe('sessions', player);
    const elapsed = Math.max(0, this.now() - player.economyStartedAt);
    const seconds = Math.floor(Math.min(elapsed, 8 * 3600 * 1000) / 1000);
    if (seconds > 0) this.observe('session_seconds', player, seconds);
  }

  snapshot() {
    return { version: 1, description: 'Opt-in aggregate gameplay economy; sessions are not distinct players', days: sanitizeDays(this.days) };
  }

  flush() {
    if (!this.file || !this.dirty) return false;
    const tmp = this.file + '.tmp';
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.snapshot(), null, 2) + '\n', { mode: 0o600 });
      fs.renameSync(tmp, this.file);
      this.dirty = false;
      return true;
    } catch (error) {
      console.warn('[economy] metrics flush failed:', error.message);
      try { fs.rmSync(tmp, { force: true }); } catch {}
      return false;
    }
  }
}
