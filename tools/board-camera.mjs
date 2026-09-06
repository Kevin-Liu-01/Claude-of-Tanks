import * as THREE from 'three';

function worldVertices(root, include) {
  const points = [], matrix = new THREE.Matrix4(), world = new THREE.Matrix4();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    const positions = object.geometry?.attributes?.position;
    if (!positions || !include(object)) return;
    const count = object.isInstancedMesh ? object.count : 1;
    for (let instance = 0; instance < count; instance++) {
      world.copy(object.matrixWorld);
      if (object.isInstancedMesh) {
        object.getMatrixAt(instance, matrix);
        world.multiplyMatrices(object.matrixWorld, matrix);
      }
      for (let index = 0; index < positions.count; index++) {
        points.push(new THREE.Vector3().fromBufferAttribute(positions, index).applyMatrix4(world));
      }
    }
  });
  return points;
}

// Shaded-evidence framing only. Exact perspective constraints over visible
// authored vertices fit long cannon/whips without the huge empty margins of
// a full-box bounding sphere. Never used by any metric or scoring camera.
export function fitBoardCamera(root, include, direction = new THREE.Vector3(.75, .32, 1)) {
  const points = worldVertices(root, include);
  if (!points.length) throw new Error('No visible geometry to frame');
  const forward = direction.clone().normalize();
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize();
  const up = new THREE.Vector3().crossVectors(forward, right);
  const bounds = new THREE.Box3();
  for (const p of points) bounds.expandByPoint(new THREE.Vector3(p.dot(right), p.dot(up), p.dot(forward)));
  const center = bounds.getCenter(new THREE.Vector3());
  const target = right.clone().multiplyScalar(center.x).addScaledVector(up, center.y).addScaledVector(forward, center.z);
  const camera = new THREE.PerspectiveCamera(30, 1, .05, 500);
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * .91;
  let distance = .1;
  for (const p of points) {
    const depth = p.dot(forward) - center.z;
    distance = Math.max(distance, depth + Math.abs(p.dot(right) - center.x) / tangent,
      depth + Math.abs(p.dot(up) - center.y) / tangent);
  }
  camera.position.copy(target).addScaledVector(forward, distance);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
}
