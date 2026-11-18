// Offline turntable/close-up renderer for a skinned GLB (development aid).
//   node tools/dev/glb-view.mjs <file.glb> <outPrefix> [clip] [time] [shots]
// shots: comma list of name:yawDeg:height:dist:targetY:fov
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from '../browser.mjs';
const [file, outPrefix, clip = '', time = '0.5', shotsArg] = process.argv.slice(2);
const ROOT = path.resolve('node_modules/three');
const html = `<!doctype html><html><body style="margin:0;background:#2a2f36"><script type="importmap">{"imports":{"three":"/three/build/three.module.js","three/addons/":"/three/examples/jsm/"}}</script>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(innerWidth, innerHeight); r.toneMapping = THREE.ACESFilmicToneMapping; r.outputColorSpace = THREE.SRGBColorSpace; r.shadowMap.enabled = true;
document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x30353c);
scene.environment = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.35;
const key = new THREE.DirectionalLight(0xfff1e0, 2.6); key.position.set(2, 3, 2.5); key.castShadow = true; key.shadow.mapSize.set(2048,2048); key.shadow.bias=-0.0003; key.shadow.normalBias=0.01; key.shadow.camera.left=-1;key.shadow.camera.right=1;key.shadow.camera.top=2;key.shadow.camera.bottom=-0.2; scene.add(key);
const rim = new THREE.DirectionalLight(0x9fc4ff, 1.4); rim.position.set(-2.5, 2.2, -2.5); scene.add(rim);
scene.add(new THREE.HemisphereLight(0xbfd2e6, 0x3a3128, 0.5));
const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 48), new THREE.MeshStandardMaterial({ color: 0x4a4d52, roughness: 0.9 })); floor.rotation.x = -Math.PI/2; floor.receiveShadow = true; scene.add(floor);
const cam = new THREE.PerspectiveCamera(30, innerWidth/innerHeight, 0.01, 50);
const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync('/model.glb');
scene.add(gltf.scene); gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; o.frustumCulled = false; } });
const mixer = new THREE.AnimationMixer(gltf.scene);
const c = gltf.animations.find(a => a.name === ${JSON.stringify(clip)});
if (c) { mixer.clipAction(c).play(); mixer.setTime(${+time}); }
window.shot = (yaw, h, dist, ty, fov) => { const a = yaw*Math.PI/180; cam.fov = fov; cam.updateProjectionMatrix(); cam.position.set(Math.sin(a)*dist, h, Math.cos(a)*dist); cam.lookAt(0, ty, 0); r.render(scene, cam); };
window.ready = true; window.clips = gltf.animations.map(a=>a.name);
</script></body></html>`;
const srv = http.createServer((req, res) => {
  if (req.url === '/') return res.end(html);
  if (req.url === '/model.glb') return res.end(fs.readFileSync(file));
  if (req.url.startsWith('/three/')) { const f = path.join(ROOT, req.url.slice(7).split('?')[0]); if (fs.existsSync(f)) { res.setHeader('content-type', 'text/javascript'); return res.end(fs.readFileSync(f)); } }
  res.statusCode = 404; res.end();
}).listen(0);
await new Promise((r) => srv.once('listening', r));
const b = await launchBrowser();
const page = await b.newPage({ viewport: { width: 700, height: 900 } });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForFunction(() => window.ready, null, { timeout: 120000 });
const shots = (shotsArg || 'full:25:1.0:4.2:0.9:30,face:0:1.62:0.75:1.6:25,face34:40:1.62:0.75:1.6:25,side:90:1.62:0.75:1.6:25').split(',');
for (const s of shots) {
  const [name, ...v] = s.split(':');
  await page.evaluate((v) => window.shot(...v.map(Number)), v);
  await page.screenshot({ path: `${outPrefix}-${name}.png` });
}
await b.close(); srv.close();
console.log('ok');
