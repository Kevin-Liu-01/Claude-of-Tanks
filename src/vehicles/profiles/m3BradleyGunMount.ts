// Kevin B. Liu — compact M242 shield and open recoil sleeve for the M3A3.
import * as THREE from 'three';
import type {TankBuilderPort} from '../tankFactoryCore.ts';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';

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
  // Rounded lower receiver shoe behind the shield. All lower stations lie
  // inside a 240 mm radius about the pitch axis, so rocking the gun cannot
  // swing a square chin into the deck. Its upper face clears the real barrel
  // passage and its front keys into the finite shield rather than hovering.
  P.addGunExtra(sectionSolid([
    {z:-.10,low:-.218},{z:0,low:-.240},{z:.10,low:-.218},{z:.16,low:-.170},
  ].map(({z,low})=>({z,ring:[[-.275,low],[.275,low],[.275,-.130],[-.275,-.130]]}))));
  buildM3CradleHood(P);
}

/** Every hood station lies within this radius of the pitch axis. The roof
 * plate's nearest stock to that axis is its lower leading edge, 180 mm behind
 * and 89 mm above it (r 200.7 mm), so the hood sweeps under it at any pitch. */
export const M3_CRADLE_HOOD_RADIUS_M = .196;
/** Receiver passage: the M242 receiver is 115 mm in radius and recoils 60 mm. */
export const M3_CRADLE_HOOD_PASSAGE_M = .13;

/** Upper cradle hood (227 gun-gaps, r4). Between the roof's leading edge and
 * the receiver's rear the gun line lay open from above: a 90 mm slot showing
 * the turret interior past the gun at rest and at full depression. The hood is
 * a gun-rig casting the shield's width, so it pitches with the shield; its rear
 * is a drum about the trunnion that tucks under the roof edge, its fore part an
 * arch over the receiver with a 15 mm working passage, ending inside the
 * shield's rear. Its cheeks come down to the shoe's top and a floor plate runs
 * from the drum onto the shoe, so the receiver recoils in a closed cradle: the
 * pocket behind it is not a nook open to the trough beside the hood. */
function buildM3CradleHood(P: TankBuilderPort): void {
  const R = M3_CRADLE_HOOD_RADIUS_M, halfWidth = .278, chamfer = .025, crown = .16, sill = -.13;
  // Behind the pitch axis the crown follows the drum radius; ahead of it
  // nothing of the turret lies above the cradle, so the crown runs level.
  const top = (z: number) => (z < 0 ? Math.min(crown, Math.sqrt(R * R - z * z)) : crown);
  const outline = (z: number): [number, number][] => {
    const y = top(z), c = Math.min(chamfer, y / 2);
    return [[halfWidth, y - c], [halfWidth - c, y], [-(halfWidth - c), y], [-halfWidth, y - c]];
  };
  // Rear drum: solid behind the receiver's full-recoil reach (rear at -0.135).
  P.addGunExtra(sectionSolid([-.192, -.185, -.175, -.16, -.14].map((z) => ({
    z, ring: [[-halfWidth, sill], [halfWidth, sill], ...outline(z)],
  }))));
  // Fore arch over the receiver, from the drum into the shield's rear face; its
  // cheeks run down to the shoe's top beside the passage.
  const arc = P.q ? 16 : 10, r = M3_CRADLE_HOOD_PASSAGE_M;
  const passage: [number, number][] = [[-r, sill]];
  for (let k = 0; k <= arc; k++) {
    const a = Math.PI - (Math.PI * k) / arc;
    passage.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  passage.push([r, sill]);
  P.addGunExtra(sectionSolid([-.14, -.13, -.113, .16].map((z) => ({
    z, ring: [[halfWidth, sill], ...outline(z), [-halfWidth, sill], ...passage],
  }))));
  // Cradle floor under the recoil stroke, from under the drum onto the shoe.
  P.addGunExtra(sectionSolid([-.192, -.095].map((z) => ({
    z, ring: [[-halfWidth, sill - .02], [halfWidth, sill - .02], [halfWidth, sill], [-halfWidth, sill]],
  }))));
}
