// Skeletal animation state for one entity, on top of THREE.AnimationMixer.
//
// Two layers:
//   * a looping base state (idle / walk / run / jump ...), cross-faded;
//   * at most one "action" (attack, cast, hit reaction, death) played once
//     over the base.
// Priority follows the usual MMO rule: death beats everything, an ability
// beats a hit reaction, and anything beats locomotion.
//
// An action triggered while the entity is moving plays on the upper body only
// (tracks for the spine and above), so the legs keep running. Actions run at a
// weight far above the base layer instead of replacing it: the mixer's
// weighted average then shows almost pure action, and fading the weight in
// and out never blends through the bind pose.

import * as THREE from '/vendor/three/three.module.js';

const ACTION_WEIGHT = 14;
const PRIORITY = { hit: 1, ability: 2, death: 3 };

const upperCache = new WeakMap();
/** A copy of `clip` restricted to bones matched by `isUpper` (cached per clip). */
function upperBodyClip(clip, isUpper) {
  let c = upperCache.get(clip);
  if (!c) {
    c = new THREE.AnimationClip(`${clip.name}:upper`, clip.duration, clip.tracks.filter((t) => isUpper(t.name.slice(0, t.name.lastIndexOf('.')))));
    upperCache.set(clip, c);
  }
  return c;
}

export class Animator {
  /**
   * @param {THREE.Object3D} root instance root (bones are found by name below it)
   * @param {Map<string, THREE.AnimationClip>} clips shared, immutable clips
   * @param {{isUpper?: (bone: string) => boolean}} opts
   */
  constructor(root, clips, opts = {}) {
    this.mixer = new THREE.AnimationMixer(root);
    this.clips = clips;
    this.isUpper = opts.isUpper || null;
    this.base = null; // {name, action}
    this.act = null; // {action, priority, until, hold, fadeOut}
    this.time = 0;
  }

  has(name) {
    return this.clips.has(name);
  }

  duration(name) {
    const c = this.clips.get(name);
    return c ? c.duration : 0;
  }

  /** Set the looping base state. Cheap to call every frame. */
  setBase(name, { fade = 0.18, timeScale = 1, sync = false } = {}) {
    if (this.base && this.base.name === name) {
      this.base.action.timeScale = timeScale;
      return;
    }
    const clip = this.clips.get(name);
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.timeScale = timeScale;
    action.setEffectiveWeight(1);
    action.play();
    if (this.base) {
      // Keep foot phase when swapping one locomotion loop for another.
      const prev = this.base.action;
      const prevClip = prev.getClip();
      if (sync && this.base.sync && prevClip.duration > 0) action.time = (((prev.time / prevClip.duration) % 1) + 1) % 1 * clip.duration;
      action.crossFadeFrom(prev, fade, false);
    }
    this.base = { name, action, sync };
  }

  /**
   * Play a clip once over the base state.
   * @returns {boolean} whether it started (false if a higher-priority action is running)
   */
  play(name, { kind = 'ability', fadeIn = 0.07, fadeOut = 0.2, timeScale = 1, upper = false, hold = false, start = 0 } = {}) {
    const clip = this.clips.get(name);
    if (!clip) return false;
    const priority = PRIORITY[kind] || 1;
    if (this.act) {
      if (this.act.priority > priority && (this.act.hold || this.time < this.act.until)) return false;
      this.act.action.fadeOut(0.1);
    }
    const use = upper && this.isUpper ? upperBodyClip(clip, this.isUpper) : clip;
    const action = this.mixer.clipAction(use);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    action.time = start * clip.duration;
    action.setEffectiveWeight(ACTION_WEIGHT);
    action.fadeIn(fadeIn);
    action.play();
    const length = (clip.duration * (1 - start)) / Math.abs(timeScale || 1);
    this.act = { action, priority, hold, fadeOut, until: this.time + Math.max(0.05, length - fadeOut) };
    return true;
  }

  /** End a held action (e.g. the death pose when the entity revives). */
  release(fade = 0.25) {
    if (!this.act) return;
    this.act.action.fadeOut(fade);
    this.act = null;
  }

  get busy() {
    return !!this.act;
  }

  update(dt) {
    this.time += dt;
    if (this.act && !this.act.hold && this.time >= this.act.until) {
      this.act.action.fadeOut(this.act.fadeOut);
      this.act = null;
    }
    this.mixer.update(dt);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.mixer.getRoot());
  }
}

/**
 * How often an entity's skeleton needs re-posing, by distance from the viewer.
 * Position and facing still update every frame; only the (much more expensive)
 * bone evaluation is spread out. Returns seconds between updates, 0 for every
 * frame, Infinity to skip while out of view.
 */
export function animationInterval(distance, inView, changed) {
  if (changed) return 0;
  if (!inView) return Infinity;
  if (distance > 70) return 1 / 10;
  if (distance > 40) return 1 / 20;
  return 0;
}
