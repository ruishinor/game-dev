import {compactPrimitive} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';

// A second ordinary glTF scene keeps the default scene usable in any viewer.
// Its complete rigid hierarchy reuses the tool meshes, UV atlas and materials.
// Only the high-triangle rim and transmission receive new vertex buffers.
export async function addSpindleDistanceScene(doc) {
  await MeshoptSimplifier.ready;
  const farScene = doc.createScene('Distance');
  const defaultScene = doc.getRoot().getDefaultScene();
  function copyNode(source) {
    const name = source.getName();
    const node = doc.createNode('Far' + name).setMatrix(source.getMatrix());
    const mesh = source.getMesh();
    if (mesh && ['RollAssembly', 'HousingAssembly'].includes(name)) {
      const sourcePrimitive = mesh.listPrimitives()[0];
      const positions = sourcePrimitive.getAttribute('POSITION').getArray();
      const normals = sourcePrimitive.getAttribute('NORMAL').getArray();
      const uv = sourcePrimitive.getAttribute('TEXCOORD_0').getArray();
      const features = new Float32Array(uv.length / 2 * 5);
      for (let i = 0; i < uv.length / 2; i++) {
        features.set(uv.subarray(i * 2, i * 2 + 2), i * 5);
        features.set(normals.subarray(i * 3, i * 3 + 3), i * 5 + 2);
      }
      const indices = sourcePrimitive.getIndices();
      const targetCount = Math.floor(indices.getCount() * .17 / 3) * 3;
      const [reduced] = MeshoptSimplifier.simplifyWithAttributes(
        new Uint32Array(indices.getArray()), positions, 3, features, 5,
        [.2, .2, .02, .02, .02], null, targetCount, .009, ['Permissive', 'Prune']);
      const primitive = sourcePrimitive.clone().setIndices(indices.clone().setArray(reduced));
      compactPrimitive(primitive);
      node.setMesh(doc.createMesh('Far' + mesh.getName()).addPrimitive(primitive));
    } else if (mesh) {
      node.setMesh(mesh);
    }
    for (const child of source.listChildren()) node.addChild(copyNode(child));
    return node;
  }
  for (const root of defaultScene.listChildren()) farScene.addChild(copyNode(root));
}
