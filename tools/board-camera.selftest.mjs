import assert from 'node:assert/strict';
import * as THREE from 'three';
import { fitBoardCamera } from './board-camera.mjs';
const root = new THREE.Group();
for (const [size, position] of [[[4,2,8],[0,1,0]], [[.2,.2,7],[0,2,4]], [[.02,4,.02],[1,4,-3]]]) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size));
  mesh.position.set(...position); root.add(mesh);
}
root.position.set(20, 0, -40);
for (const yaw of [0,.7,1.5,3]) {
  root.rotation.y = yaw;
  const camera = fitBoardCamera(root, () => true);
  let maximum = 0;
  root.traverse(object => {
    const positions = object.geometry?.attributes.position;
    for (let i=0; i<(positions?.count ?? 0); i++) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, i).applyMatrix4(object.matrixWorld).project(camera);
      assert.ok(Math.abs(point.x) <= .910001 && Math.abs(point.y) <= .910001, 'all visible geometry fits with margin');
      assert.ok(point.z > -1 && point.z < 1, 'not clipped in depth');
      maximum = Math.max(maximum, Math.abs(point.x), Math.abs(point.y));
    }
  });
  assert.ok(maximum > .9099, 'evidence fills frame instead of shrinking into unused bbox corners');
}
console.log('board-camera: exact perspective framing, translation, rotation and long fittings pass');
