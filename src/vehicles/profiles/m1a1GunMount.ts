// Kevin B. Liu — M256 armored shield, stepped chin and concentric cradle.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import {sectionSolid} from './sectionSolid.ts';

interface GunMountPort {
  readonly q: boolean;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

/** Finite front armor with actual gun/coax apertures. Its broad raked face
 * stays straight across the vehicle: the staggered fixed cheeks do not twist
 * the mantlet. The rear rotor seats inside the turret's separate pitch bay. */
function armoredShield(segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(-.322, -.255);
  shape.lineTo(.422, -.255);
  shape.lineTo(.422, .265);
  shape.quadraticCurveTo(.422, .35, .337, .35);
  shape.lineTo(-.237, .35);
  shape.quadraticCurveTo(-.322, .35, -.322, .265);
  shape.closePath();
  for (const [x, y, radius] of [[0, 0, .184], [-.265, -.095, .039]]) {
    const hole = new THREE.Path();
    hole.absarc(x, y, radius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: 1, bevelEnabled: false, steps: 1, curveSegments: segments / 2,
  });
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const frontZ = .455 - .5 * (p.getY(i) + .255);
    p.setZ(i, THREE.MathUtils.lerp(-.16, frontZ, p.getZ(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function collar(segments: number): THREE.BufferGeometry {
  // A hollow non-recoiling sleeve; the actual recoiling barrel runs through
  // its 132 mm internal radius. Winding closes the annulus, never the opening itself.
  const profile = [[.132, -.14], [.182, -.14], [.182, .27], [.174, .39],
    [.156, .48], [.156, .73], [.132, .73], [.132, -.14]];
  return new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments)
    .rotateX(Math.PI / 2);
}

export function buildM1A1GunMount(P: GunMountPort, searchlight: boolean): void {
  const segments = P.q ? 32 : 20;
  for (const x of [-.25,.35]) P.addGunExtra(KIT.cylX(.21, .14, segments), x, 0, -.12);
  P.addGunExtra(armoredShield(segments));
  P.addGunExtra(sectionSolid([
    {z: -.16, ring: [[-.267,-.35],[.367,-.35],[.422,-.245],[-.322,-.245]]},
    {z: .12, ring: [[-.267,-.35],[.367,-.35],[.422,-.245],[-.322,-.245]]},
    {z: .25, ring: [[-.257,-.32],[.357,-.32],[.422,-.245],[-.322,-.245]]},
    {z: .445, ring: [[-.247,-.265],[.347,-.265],[.422,-.245],[-.322,-.245]]},
  ]));
  P.addGunExtra(collar(segments));
  // Recessed coax receiver behind its real aperture, not a black decal or a
  // second cannon protruding from an arbitrary side of the gun cover.
  P.addGunExtraDark(KIT.cylZ(.037, .13, P.q ? 16 : 10), -.265, -.095, .0825);
  for (const side of [-1, 1]) {
    const x = .05 + side * .374;
    // Rounded rear shoulder continues into a deep chamfered side plate.
    // The seam hardware follows the rake instead of floating on a vertical row.
    const sideShape = new THREE.Shape();
    sideShape.moveTo(.448, -.25);
    sideShape.lineTo(.148, .35);
    sideShape.lineTo(-.055, .35);
    sideShape.quadraticCurveTo(-.29, .35, -.29, .11);
    sideShape.lineTo(-.245, -.22);
    sideShape.lineTo(-.12, -.35);
    sideShape.lineTo(.12, -.35);
    sideShape.lineTo(.25, -.32);
    sideShape.closePath();
    const sideCover = new THREE.ExtrudeGeometry(sideShape, {
      depth: .010, steps: 1, bevelEnabled: false, curveSegments: P.q ? 8 : 4,
    }).rotateY(-Math.PI / 2);
    P.addGunExtra(sideCover, x + .005, 0, 0);
    if (P.q) for (const y of [-.18,-.065,.05,.165,.28]) {
      P.addGunExtra(KIT.cylX(.018, .009, 6), x + side * .006, y,
        .455 - .5 * (y + .255) - .052);
    }
    // Upper lifting eyes have a visible return and two feet on the plate.
    const lugX = .05 + side * .23;
    P.addGunExtra(KIT.box(.06, .045, .105), lugX, .358, .058);
    P.addGunExtra(KIT.box(.06, .045, .065), lugX, .358, -.105);
    P.addGunExtra(KIT.box(.06, .025, .275), lugX, .387, -.018);
  }
  if (searchlight) {
    // HA/UA lamp remains on its existing gun-owned mounting datum.
    P.addGunExtra(KIT.box(.27, .18, .23), -.44, .04, .365);
  }
}
