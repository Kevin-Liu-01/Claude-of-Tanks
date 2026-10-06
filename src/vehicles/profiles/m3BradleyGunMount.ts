// Kevin B. Liu — compact M242 shield and open recoil sleeve for the M3A3.
import * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';

/** A rounded shoulder casting, with real M242 and M240 passages. Its rear
 * tapers into the existing rotary receiver; all stock stays inside the old
 * mask's 560 × 360 mm envelope and behind its original forward edge. */
function shield(segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-.220, -.175);
  shape.lineTo(.220, -.175);
  shape.quadraticCurveTo(.278, -.175, .278, -.117);
  shape.lineTo(.278, .110);
  shape.quadraticCurveTo(.278, .175, .213, .175);
  shape.lineTo(-.213, .175);
  shape.quadraticCurveTo(-.278, .175, -.278, .110);
  shape.lineTo(-.278, -.117);
  shape.quadraticCurveTo(-.278, -.175, -.220, -.175);
  shape.closePath();
  for (const [x, y, radius] of [[0, 0, .136], [.19, .06, .026]]) {
    const hole = new THREE.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: 1, steps: 1, bevelEnabled: false, curveSegments: segments / 2,
  });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    // Keep the entire shield face in one raked plane. Warping only its
    // outer vertices back folded the cap triangulation across the top lip.
    // The outline owns the rounded corners; the rear owns the taper.
    const front = .391 - .24 * y;
    const rear = .125 + .20 * Math.max(0, Math.abs(x) - .20);
    p.setZ(i, THREE.MathUtils.lerp(rear, front, p.getZ(i)));
  }
  g.computeVertexNormals();
  return g;
}

export function buildM3BradleyGunMount(P: TankBuilderPort): void {
  const n = P.q ? 28 : 16;
  const casting = shield(n);
  const anchors: [number,number,number][] = [];
  const positions = casting.attributes.position;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), hit = new THREE.Vector3();
  for (const x of [-.24,.24]) for (const y of [-.095,.095]) {
    const ray = new THREE.Ray(new THREE.Vector3(x,y,1), new THREE.Vector3(0,0,-1));
    let z = -Infinity;
    for (let i = 0; i < positions.count; i += 3) {
      a.fromBufferAttribute(positions,i); b.fromBufferAttribute(positions,i+1); c.fromBufferAttribute(positions,i+2);
      if (ray.intersectTriangle(a,b,c,false,hit)) z = Math.max(z,hit.z);
    }
    if (!Number.isFinite(z)) throw new Error('M3 mantlet fastener has no casting backing');
    anchors.push([x,y,z]);
  }
  P.addGunExtra(casting);
  // The collar is a hollow, stepped casting rather than a solid tapered cap
  // intersecting the recoiling barrel. Its flared lip keys into the shield.
  const profile = [[.123,.15],[.138,.15],[.138,.37],[.149,.37],
    [.149,.43],[.139,.49],[.095,.61],[.088,.78],
    [.072,.78],[.072,.61],[.123,.49],[.123,.15]];
  P.addGunExtra(new THREE.LatheGeometry(profile.map(([r,z]) => new THREE.Vector2(r,z)), n)
    .rotateX(Math.PI / 2));
  // The existing M240 tube starts at Z=.42. This keyed bushing seats that
  // unchanged tube in the raked face instead of leaving its rear in open air.
  const coaxProfile = [[.017,.30],[.031,.30],[.031,.435],[.017,.435],[.017,.30]];
  P.addGunExtra(new THREE.LatheGeometry(coaxProfile.map(([r,z]) => new THREE.Vector2(r,z)), P.q ? 16 : 10)
    .rotateX(Math.PI / 2), .19,.06,0);
  // Small recessed shoulder fasteners sit on the casting's own raked face;
  // they cannot become another block between the mask and fixed turret.
  for (const [x,y,z] of anchors) {
    P.addGunExtraDark(KIT.cylZ(.013,.008, P.q ? 12 : 8), x,y,z+.002);
    P.addGunExtra(KIT.cylZ(.008,.012,6), x,y,z+.004);
  }
}
