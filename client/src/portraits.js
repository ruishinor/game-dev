// Static asset portraits for character and Codex screens. No second
// scene is rendered per frame. Instances are discarded after capture.
import * as THREE from '/vendor/three/three.module.js';
import { createModel } from './characters.js';
import {portraitCacheKey,createPortraitCache} from './portrait-identity.js';

export function makePortraits(assets, useGlb) {
  const cache = createPortraitCache();
  let renderer, unavailable = false;
  return (meta, style = 'portrait') => {
    const glb=useGlb(meta),key=portraitCacheKey(meta,style,glb);
    const cached=cache.get(key);if(cached!==undefined)return cached;
    if (unavailable) return null;
    let model, sketchMaterial;
    try {
      if (!renderer) {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power', preserveDrawingBuffer: true });
        renderer.setPixelRatio(1);
        renderer.setSize(400, 400, false);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.15;
      }
      model = createModel(assets, meta, glb);
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xb8edff, 0x293748, 2.1));
      const keyLight = new THREE.DirectionalLight(0xf1f9ff, 3);
      keyLight.position.set(3, 5, 4);
      scene.add(keyLight);
      const rim = new THREE.DirectionalLight(0x4fcce2, 2);
      rim.position.set(-3, 2, -2);
      scene.add(rim, model.group);
      model.update(0.08, { t: 1, speed: 0, dead: false, attack: 0, cast: 0, hit: 0, air: false, mode: 'triage', act: 'idle', casting: false, combat: false, charge: 0, fwd: 1, interval: 0 });
      model.group.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model.group);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const extent = Math.max(size.x, size.y, size.z, .7) * .69;
      if (!Number.isFinite(extent)) throw Error('Invalid model bounds');
      const sketch=style==='sketch',bust=style==='bust';
      renderer.setSize(sketch?320:bust?256:400,sketch?480:bust?256:400,false);
      if(bust)center.y=box.min.y+size.y*.79;
      const halfY=bust?Math.max(size.y*.25,.2):sketch?Math.max(size.y*.55,size.x*.825,size.z*.55,.35):extent;
      const halfX=halfY*(sketch?2/3:1);
      if(sketch){
        sketchMaterial=new THREE.MeshStandardMaterial({color:0x317789,emissive:0x102c36,roughness:.8,metalness:.05});
        scene.overrideMaterial=sketchMaterial;
      }
      const camera = new THREE.OrthographicCamera(-halfX, halfX, halfY, -halfY, .01, 100);
      camera.position.copy(center).add(new THREE.Vector3(sketch?0:.38, sketch?0:.13, 1).normalize().multiplyScalar(extent * 5));
      camera.lookAt(center);
      renderer.render(scene, camera);
      const data = renderer.domElement.toDataURL('image/png');
      cache.set(key, data);
      return data;
    } catch {
      // A second WebGL context is optional; the journal remains usable.
      unavailable = true;
      renderer?.dispose();
      renderer = null;
      return null;
    } finally { sketchMaterial?.dispose(); model?.dispose?.(); }
  };
}
