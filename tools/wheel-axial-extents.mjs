import { Matrix4, Vector3 } from 'three';

function outboardFace(geometry, world, origin, axis, side, point) {
  const { index, drawRange } = geometry;
  const position = geometry.getAttribute('position');
  if (!position?.count) return null;
  const end = Math.min(index?.count ?? position.count, drawRange.start + drawRange.count);
  let face = -Infinity;
  // Use actual signed stock. Absolute local bounds would reflect an inboard
  // axle tail onto the outward face and discard the complete world transform.
  for (let vertex = drawRange.start; vertex < end; vertex++) {
    point.fromBufferAttribute(position, index ? index.getX(vertex) : vertex).applyMatrix4(world);
    face = Math.max(face, side * point.sub(origin).dot(axis));
  }
  return Number.isFinite(face) ? face : null;
}

/** Rest-pose wheel faces in metres along the vehicle's actual world-space axle. */
export function roadWheelAxialExtents(root) {
  root.updateMatrixWorld(true);
  const origin = new Vector3().setFromMatrixPosition(root.matrixWorld);
  const axis = new Vector3().setFromMatrixColumn(root.matrixWorld, 0).normalize();
  const instance = new Matrix4(), world = new Matrix4(), point = new Vector3();
  const sides = [-1, 1].map(side => ({ side, tireFaceM: null,
    dressingFaceM: null, dressingName: '', proudM: null }));
  const axial = () => point.sub(origin).dot(axis);
  root.traverse(mesh => {
    if (!mesh.isInstancedMesh) return;
    const layer = mesh.userData?.dynamicWheelFace === true;
    const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const role = mesh.userData?.appearanceRole ?? material?.userData?.appearanceRole;
    const tire = mesh.name === 'gearRoadWheelTires' || (layer && role === 'wheelTire');
    if (!tire && !layer) return;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, instance);
      world.multiplyMatrices(mesh.matrixWorld, instance);
      point.set(0, 0, 0).applyMatrix4(world);
      const side = Math.sign(axial());
      if (!side) throw new Error(`${mesh.name}/${i}: road-wheel axle is on the vehicle centreline`);
      const face = outboardFace(mesh.geometry, world, origin, axis, side, point);
      if (face === null) continue;
      const row = sides[side < 0 ? 0 : 1];
      if (tire) row.tireFaceM = Math.max(row.tireFaceM ?? -Infinity, face);
      else if (face > (row.dressingFaceM ?? -Infinity)) {
        row.dressingFaceM = face;
        row.dressingName = mesh.name;
      }
    }
  });
  for (const row of sides) {
    if (row.tireFaceM !== null && row.dressingFaceM !== null)
      row.proudM = row.dressingFaceM - row.tireFaceM;
  }
  return sides;
}
