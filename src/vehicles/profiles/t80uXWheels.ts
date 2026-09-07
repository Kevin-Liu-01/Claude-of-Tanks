// Original turned solids from the canonical source's scalar wheel sections.
// These are closed stepped dishes, not copied source vertices or donor wheels.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function hubCone(side: -1 | 1, floor: number, apex: number): THREE.BufferGeometry {
  const height = apex - floor;
  const cone = new THREE.CylinderGeometry(0, .1210, height, 6, 1, false,
    side < 0 ? Math.PI / 12 : Math.PI / 4).rotateZ(-Math.PI / 2);
  const p = cone.attributes.position;
  // The source has a six-sided hub, not a twelve-sided extension of the outer
  // rim. Its sub-2 mm off-axis apex belongs to this cap, not the axle datum.
  for (let i = 0; i < p.count; i++) {
    const t = (p.getX(i) + height / 2) / height;
    p.setY(i, p.getY(i) + t * (side < 0 ? .0005197 : .0005941));
    p.setZ(i, p.getZ(i) - side * t * .00189285);
  }
  cone.computeVertexNormals();
  return cone.translate((floor + apex) / 2 - 1.35185, 0, 0);
}

function shell(side: -1 | 1): THREE.BufferGeometry {
  const [back, floor, outside, hub, lip] = side < 0
    ? [1.17167240, 1.51006156, 1.57202631, 1.58356249, 1.58960503]
    : [1.18925124, 1.52775055, 1.58960539, 1.60114133, 1.60718399];
  // Fixed original axle. Real source side asymmetry belongs to the steel
  // face, not to a shifted wheel center or moved track lane.
  const profile = [[0, back], [.35247, back], [.35247, outside],
    [.29333, lip], [.266997, floor], [0, floor]];
  const body = new THREE.LatheGeometry(profile.map(([r, x]) =>
    new THREE.Vector2(r, x - 1.35185)), 12).rotateZ(-Math.PI / 2);
  const cone = hubCone(side, floor, hub);
  const result = mergeGeometries([body, cone], false);
  body.dispose(); cone.dispose();
  if (!result) throw new Error('T80U source-sized wheel solids require compatible attributes');
  if (side < 0) result.rotateY(Math.PI);
  return result;
}

export function t80uXWheelSolids(nativeSegments: number): {
  core: THREE.BufferGeometry; left: THREE.BufferGeometry;
  right: THREE.BufferGeometry; shoulder: THREE.BufferGeometry;
} {
  // The real central axle is inside the closed source-sized steel bodies.
  // Existing face-depth scaling affects only this concealed axial spindle.
  const core = new THREE.CylinderGeometry(.075, .075, .16, 24).rotateZ(-Math.PI / 2);
  // Retain the original rubber shoulder radius/width while opening its
  // previously opaque center around the actual recessed steel floor.
  const shoulder = new THREE.LatheGeometry([
    [.2671, -.178705], [.3313218, -.178705], [.3313218, .178705],
    [.2671, .178705], [.2671, -.178705],
  ].map(([r, x]) => new THREE.Vector2(r, x)), nativeSegments).rotateZ(Math.PI / 2);
  return { core, left: shell(-1), right: shell(1), shoulder };
}
