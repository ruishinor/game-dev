// Transient combat effects: bolts, beams, ground rings, telegraphs.
// All are driven by server events; none of them decide anything.

import * as THREE from '/vendor/three/three.module.js';
import { groundHeight } from '../../shared/world.js';
import { createArtEffect } from './artfx/common.js';
import { faunaImpactSampler } from './artfx/fauna.js';
import { finiteVector, makeTracerGeometry, poseTracer, projectileStyle } from './projectile-presentation.js';

const SPH = new THREE.SphereGeometry(1, 8, 6); // stationary impact sparks, not traveling shots
const TRACER = makeTracerGeometry(THREE);
const CYL = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const RING = new THREE.RingGeometry(0.86, 1, 48);
const DISC = new THREE.CircleGeometry(1, 48);
const UP = new THREE.Vector3(0, 1, 0);

// Shared, bent organic filaments placed around a rooted enemy's feet.
// Built once; individual enemies only receive a small instance group.
const ROOT_VINES = Array.from({ length: 4 }, (_, i) => {
  const angle = i * Math.PI / 2;
  const pt = (r, y, a) => new THREE.Vector3(Math.sin(angle + a) * r, y, Math.cos(angle + a) * r);
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    pt(0.98, 0.045, -0.32), pt(0.7, 0.16, -0.09),
    pt(0.46, 0.47, 0.22), pt(0.59, 0.83, 0.55),
  ]), 12, 0.045, 6, false);
});

const additive = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });

export class Fx {
  constructor(scene) {
    this.scene = scene;
    this.items = [];
    this.roots = new Map();
    this.rootMaterial = new THREE.MeshStandardMaterial({ color: 0x377b48, emissive: 0x234326, emissiveIntensity: 0.65, roughness: 0.88 });
    this.faunaEffects = [];
  }

  /** Bounded effects rendered by the shared art-VFX engine. */
  faunaImpact(center,direction,{radius=.48,duration=.48,reducedMotion=false,variant='contact'}={}){
    if(this.faunaEffects.length>=12){this.faunaEffects.shift().effect.dispose();}
    const effect=createArtEffect(THREE,faunaImpactSampler({center,direction,radius,duration,reducedMotion,variant}));
    effect.group.name='live-fauna:'+variant;
    this.scene.add(effect.group);
    effect.update(0.001);
    this.faunaEffects.push({effect,age:0,duration});
  }
  clearFauna(){
    for(const it of this.faunaEffects)it.effect.dispose();
    this.faunaEffects.length=0;
  }

  add(obj, life, tick) {
    this.scene.add(obj);
    this.items.push({ obj, life, age: 0, tick });
  }

  /** Reflect authoritative Rooted buff state for its entire lifetime. */
  setRooted(id, x, z, radius, active) {
    let g = this.roots.get(id);
    if (!active) {
      if (g) this.clearRoot(id);
      return;
    }
    if (!g) {
      g = new THREE.Group();
      for (const geometry of ROOT_VINES) g.add(new THREE.Mesh(geometry, this.rootMaterial));
      this.scene.add(g);
      this.roots.set(id, g);
    }
    const size = Math.max(0.8, radius * 1.5);
    g.scale.setScalar(size);
    g.position.set(x, groundHeight(x, z) + 0.04, z);
  }

  clearRoot(id) {
    const g = this.roots.get(id);
    if (!g) return;
    this.scene.remove(g);
    this.roots.delete(id);
  }

  /** A short directional tracer; actual muzzle/hand location is supplied by the caller. */
  bolt(from, to, color, ms = 200, family = 'generic') {
    const origin=from(),target=to();
    if(!finiteVector(origin)||!finiteVector(target)||!Number.isFinite(ms)||ms<=0)return;
    const m = new THREE.Mesh(TRACER, additive(color, .82));
    m.name='combat-projectile-tracer';m.visible=false;
    const start=origin.clone(),end=target.clone(),dir=new THREE.Vector3(),style=projectileStyle(family);
    this.add(m, ms / 1000, (k) => {
      const next=to();if(finiteVector(next))end.copy(next);
      poseTracer(m,start,end,k,style,dir,UP);
      m.material.opacity=.82*(1-.30*k);
    });
  }

  /** A beam linking two moving points that fades out. */
  beam(from, to, color, ms = 450, width = 0.07) {
    const m = new THREE.Mesh(CYL, additive(color, 0.9));
    const dir = new THREE.Vector3();
    this.add(m, ms / 1000, (k) => {
      const a = from();
      const b = to();
      dir.subVectors(b, a);
      const len = dir.length() || 0.001;
      m.position.copy(a).addScaledVector(dir, 0.5);
      m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
      const w = width * (1 + Math.sin(k * Math.PI * 3) * 0.25);
      m.scale.set(w, len, w);
      m.material.opacity = 0.9 * (1 - k);
    });
  }

  /** A ring on the ground expanding to `radius`. */
  ring(x, z, radius, color, ms = 550, y) {
    const m = new THREE.Mesh(RING, additive(color, 0.9));
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, (y ?? groundHeight(x, z)) + 0.2, z);
    this.add(m, ms / 1000, (k) => {
      const e = 1 - (1 - k) * (1 - k);
      m.scale.setScalar(Math.max(0.01, radius * e));
      m.material.opacity = 0.9 * (1 - k);
    });
  }

  /** A column of light rising from a point. */
  pillar(x, z, color, ms = 900) {
    const m = new THREE.Mesh(CYL, additive(color, 0.6));
    const y = groundHeight(x, z);
    this.add(m, ms / 1000, (k) => {
      m.scale.set(0.9 * (1 - k * 0.5), 1 + k * 7, 0.9 * (1 - k * 0.5));
      m.position.set(x, y + (1 + k * 7) / 2, z);
      m.material.opacity = 0.6 * (1 - k);
    });
  }

  /** Small sparks bursting from a point. */
  burst(pos, color, count = 8, spread = 1.2) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(SPH, additive(color));
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar(spread * (0.5 + Math.random()));
      const start = pos.clone();
      this.add(m, 0.45 + Math.random() * 0.25, (k) => {
        m.position.copy(start).addScaledVector(v, k);
        m.position.y -= k * k * 0.8;
        m.scale.setScalar(0.07 * (1 - k));
      });
    }
  }

  /** A warning area that fills over `ms`, then vanishes. */
  telegraph(x, z, radius, ms) {
    const y = groundHeight(x, z) + 0.12;
    const g = new THREE.Group();
    const edge = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
    const area = new THREE.Mesh(DISC, new THREE.MeshBasicMaterial({ color: 0xff3a2a, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(DISC, new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.34, depthWrite: false, side: THREE.DoubleSide }));
    for (const m of [edge, area, fill]) {
      m.rotation.x = -Math.PI / 2;
      g.add(m);
    }
    edge.scale.setScalar(radius);
    area.scale.setScalar(radius * 0.86);
    fill.position.y = 0.02;
    g.position.set(x, y, z);
    this.add(g, ms / 1000, (k) => {
      fill.scale.setScalar(Math.max(0.01, radius * 0.86 * k));
      edge.material.opacity = 0.6 + Math.sin(k * 40) * 0.35;
    });
  }

  update(dt) {
    for(let i=this.faunaEffects.length-1;i>=0;i--){
      const it=this.faunaEffects[i];it.age+=dt;
      if(it.age>=it.duration){it.effect.dispose();this.faunaEffects.splice(i,1);}
      else it.effect.update(it.age);
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      it.age += dt;
      const k = Math.min(1, it.age / it.life);
      it.tick(k);
      if (k >= 1) {
        this.scene.remove(it.obj);
        it.obj.traverse((o) => {
          if (o.material) o.material.dispose();
        });
        this.items.splice(i, 1);
      }
    }
  }
}
