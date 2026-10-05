// Kevin B. Liu — M256 raked shield, curved rotor and concentric cradle.
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
  shape.moveTo(-.322, -.145);
  shape.lineTo(-.18, -.215);
  shape.lineTo(.28, -.215);
  shape.lineTo(.422, -.145);
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
    p.setZ(i, THREE.MathUtils.lerp(frontZ - .105, frontZ, p.getZ(i)));
  }
  geometry.computeVertexNormals();
  return geometry;
}

function collar(segments: number): THREE.BufferGeometry {
  // A hollow non-recoiling sleeve; the actual recoiling barrel runs through
  // its 132 mm internal radius. Winding closes the annulus, never the opening itself.
  const profile = [[.132, -.14], [.182, -.14], [.182, .27], [.174, .39],
    [.156, .48], [.156, .62], [.132, .62], [.132, -.14]];
  return new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), segments)
    .rotateX(Math.PI / 2);
}

export function buildM1A1GunMount(P: GunMountPort, searchlight: boolean): void {
  const segments = P.q ? 32 : 20;
  // Journals share the actual elevation axis and enter the fixed side
  // bearings. Their inboard ends keep clear of the longitudinal recoil bore.
  for (const x of [-.255,.355]) P.addGunExtra(KIT.cylX(.175, .16, segments), x, 0, 0);
  // A hollow curved rear casting replaces the former deep rectangular
  // extrusion. It nests in the turret's matching relieved throat, and the
  // longitudinal gun bore remains open through the middle of the assembly.
  const rotor = new THREE.Shape();
  rotor.absarc(0, 0, .31, Math.PI / 2, Math.PI, false);
  rotor.lineTo(-.27,0);
  rotor.absarc(0, 0, .27, Math.PI, Math.PI / 2, true);
  rotor.closePath();
  P.addGunExtra(new THREE.ExtrudeGeometry(rotor, {
    depth: .688, steps: 1, bevelEnabled: false, curveSegments: segments / 2,
  }).rotateY(-Math.PI / 2), .394, 0, 0);
  // Shallow lower side webs clear hull stowage without crossing the axial
  // recoil passage. Their inner faces sit outside the entire 132 mm bore;
  // a continuous transverse lower casting would cut the recoiling root.
  const lowerReturn = new THREE.Shape();
  lowerReturn.moveTo(-.31,0);
  for (const [z,y] of [[-.235,-.065],[-.12,-.15],[0,-.18],[0,-.15],[-.105,-.12],[-.21,-.045],[-.27,0]])
    lowerReturn.lineTo(z,y);
  lowerReturn.closePath();
  for (const [x0,x1] of [[-.294,-.15],[.15,.394]]) {
    P.addGunExtra(new THREE.ExtrudeGeometry(lowerReturn, {
      depth: x1-x0, steps: 1, bevelEnabled: false, curveSegments: segments / 2,
    }).rotateY(-Math.PI / 2), x1, 0, 0);
  }
  P.addGunExtra(armoredShield(segments));
  // The sloping top casting joins the rotor crown to the thin face; its
  // tapered shoulders follow the shield's rounded upper corners. It closes
  // the roof across the whole bay rather than leaving the side plates as fins.
  P.addGunExtra(sectionSolid([
    {z: -.045, ring: [[-.294,.272],[.394,.272],[.337,.307],[-.237,.307]]},
    {z: 0, ring: [[-.294,.275],[.394,.275],[.337,.314],[-.237,.314]]},
    {z: .05, ring: [[-.294,.300],[.394,.300],[.337,.344],[-.237,.344]]},
    {z: .105, ring: [[-.294,.315],[.394,.315],[.337,.350],[-.237,.350]]},
  ]));
  // A compact undercut preserves the stepped chin while clearing the
  // rising rear deck at full depression and every turret heading.
  P.addGunExtra(sectionSolid([
    {z: -.02, ring: [[-.242,-.18],[.342,-.18],[.394,-.145],[-.294,-.145]]},
    {z: .12, ring: [[-.267,-.185],[.367,-.185],[.422,-.145],[-.322,-.145]]},
    {z: .25, ring: [[-.257,-.19],[.357,-.19],[.422,-.145],[-.322,-.145]]},
    {z: .425, ring: [[-.247,-.225],[.347,-.225],[.422,-.145],[-.322,-.145]]},
  ]));
  P.addGunExtra(collar(segments));
  // Recessed coax receiver behind its real aperture, not a black decal or a
  // second cannon protruding from an arbitrary side of the gun cover.
  P.addGunExtraDark(KIT.cylZ(.037, .24, P.q ? 16 : 10), -.265, -.095, .14);
  for (const side of [-1, 1]) {
    const x = .05 + side * .372;
    // The side casting tapers back into a circular rotor instead of an
    // exposed rectangular support block.
    // The seam hardware follows the rake instead of floating on a vertical row.
    const sideShape = new THREE.Shape();
    sideShape.moveTo(.396, -.14);
    sideShape.lineTo(.194, .268);
    sideShape.lineTo(.05, .305);
    sideShape.lineTo(0, .31);
    sideShape.absarc(0, 0, .31, Math.PI / 2, Math.PI, false);
    sideShape.lineTo(-.235,-.065);
    sideShape.lineTo(-.12,-.15);
    sideShape.lineTo(0,-.18);
    sideShape.lineTo(.12, -.185);
    sideShape.lineTo(.25, -.19);
    sideShape.closePath();
    const sideCover = new THREE.ExtrudeGeometry(sideShape, {
      depth: .028, steps: 1, bevelEnabled: false, curveSegments: P.q ? 8 : 4,
    }).rotateY(-Math.PI / 2);
    P.addGunExtra(sideCover, x + (side < 0 ? .028 : 0), 0, 0);
    if (P.q) for (const y of [-.12,-.065,.05,.165,.28]) {
      P.addGunExtra(KIT.cylX(.018, .009, 6), x + side * .004, y,
        .455 - .5 * (y + .255) - .052);
    }
    // Upper lifting eyes have a visible return and two feet on the plate.
    const lugX = .05 + side * .23;
    P.addGunExtra(KIT.box(.06, .06, .026), lugX, .366, .061);
    P.addGunExtra(KIT.box(.06, .06, .026), lugX, .366, .137);
    P.addGunExtra(KIT.box(.06, .025, .103), lugX, .402, .099);
  }
  if (searchlight) {
    // Keep the support in the central bay until it is ahead of the longer
    // left cheek, then turn outward into the lamp housing. A direct wide
    // rear block cut through the stationary armor when the gun elevated.
    P.addGunExtra(KIT.box(.055, .10, .40), -.285, .04, .46);
    P.addGunExtra(KIT.box(.310, .14, .16), -.435, .04, .63);
  }
}
