// Head-vertex bounds straight from client/assets/humanoid_*.glb (Node, meshopt
// decoding). Coordinates are GLB node space. node tools/dev/measure-head-glb.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
for (const f of ['humanoid_m', 'humanoid_f']) {
  const doc = await io.read(`client/assets/${f}.glb`);
  const root = doc.getRoot();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh(); const skin = node.getSkin();
    if (!mesh || !skin || node.getName().startsWith('shell_')) continue;
    const joints = skin.listJoints().map(j => j.getName());
    const H = joints.indexOf('Head'), N = joints.indexOf('neck_01');
    const wm = node.getWorldMatrix();
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9], front=-1e9, n=0, eyeZ=[];
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION'), J = prim.getAttribute('JOINTS_0'), W = prim.getAttribute('WEIGHTS_0');
      for (let i = 0; i < P.getCount(); i++) {
        const j = J.getElement(i, []), w = W.getElement(i, []);
        let hw = 0; for (let k = 0; k < 4; k++) if (j[k] === H) hw += w[k];
        if (hw < 0.9) continue;
        const p = P.getElement(i, []);
        const x = wm[0]*p[0]+wm[4]*p[1]+wm[8]*p[2]+wm[12], y = wm[1]*p[0]+wm[5]*p[1]+wm[9]*p[2]+wm[13], z = wm[2]*p[0]+wm[6]*p[1]+wm[10]*p[2]+wm[14];
        mn=[Math.min(mn[0],x),Math.min(mn[1],y),Math.min(mn[2],z)]; mx=[Math.max(mx[0],x),Math.max(mx[1],y),Math.max(mx[2],z)]; n++;
      }
    }
    console.log(f, node.getName(), 'headverts', n, 'min', mn.map(v=>v.toFixed(3)).join(','), 'max', mx.map(v=>v.toFixed(3)).join(','));
  }
}
