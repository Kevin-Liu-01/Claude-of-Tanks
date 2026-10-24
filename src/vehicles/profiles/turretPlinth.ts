// A hull plinth under a seated turret (release 240, the owner's closed-hull bar): it closes the daylight under a turret
// seated over a raised engine deck, and keeps the ring's race and the turret's collar in a round well.
import * as THREE from 'three';

/** The plan polygon [x, z] extruded from `bottom` to `top` (hull frame), with a round hole [x, z, r] about the ring's
 *  axis. */
export function turretPlinthGeometry(plan: readonly (readonly [number, number])[], hole: readonly [number, number, number],
  bottom: number, top: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(plan.map(([x, z]) => new THREE.Vector2(x, -z)));
  const ring = new THREE.Path();
  ring.absarc(hole[0], -hole[1], hole[2], 0, Math.PI * 2, true);
  shape.holes.push(ring);
  return new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false, curveSegments: 24 })
    .rotateX(-Math.PI / 2).translate(0, bottom, 0);
}
