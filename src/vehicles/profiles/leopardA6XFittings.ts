// Original equipment from source scalar bounds and face-plane measurements.
// These parts are permanent fittings, not expendable armor or source meshes.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
type Point = readonly [number, number, number];
const { box, cylZ } = KIT;

function turretPart(P: TankBuilderPort, pivot: Point, bucket: string,
  g: THREE.BufferGeometry, x = 0, y = 0, z = 0): void {
  P.addEquipment(bucket, g, x - pivot[0], y - pivot[1], z - pivot[2]);
}

function slopedPlate(left: number, right: number, aft: number, fore: number,
  plane: number, thickness: number): THREE.BufferGeometry {
  return sectionSolid([aft, fore].map(z => {
    const top = (plane - .10727284 * z) / .99422962;
    return { z, ring: [[left, top - thickness], [right, top - thickness],
      [right, top], [left, top]] };
  }));
}

function cupolaSight(P: TankBuilderPort, pivot: Point): void {
  // Source front cupola sight: lower housing, tilted shoulder, 8.2 mm frame,
  // and a real glazed opening under its thin cap. Never a tall solid box.
  turretPart(P, pivot, 'turretDetail', box(.44051, .140, .088), -.6323, 2.497, .373);
  turretPart(P, pivot, 'turretDetail', slopedPlate(-.875575, -.389025,
    .314215, .423665, 2.59870866, .0207));
  turretPart(P, pivot, 'turretDetail', slopedPlate(-.800875, -.463725,
    .335945, .403695, 2.60692490, .0082));
  for (const x of [-.804975, -.459625]) {
    turretPart(P, pivot, 'turretDetail', box(.0082, .0710, .06775), x, 2.6116, .37666);
  }
  turretPart(P, pivot, 'turretDetail', slopedPlate(-.809075, -.455525,
    .342785, .410535, 2.67067464, .008245));
  turretPart(P, pivot, 'turretGlass', box(.35195, .05767, .00623),
    -.6323, 2.612995, .34208);
}

function aftLiftingEye(P: TankBuilderPort, pivot: Point): void {
  // Independent polygonal arch, based on outer and inner scalar stations.
  // Its transverse eye is genuinely empty at Y 2.48 / Z -1.18.
  const shape = new THREE.Shape();
  shape.moveTo(-1.282345, 2.44021);
  for (const [z, y] of [[-1.267225, 2.49858], [-1.244395, 2.53393],
    [-1.200275, 2.55312], [-1.155905, 2.55151], [-1.106825, 2.52419],
    [-1.032135, 2.47902], [-.997255, 2.44393], [-1.045, 2.44021],
    [-1.14, 2.471], [-1.16, 2.510669], [-1.18, 2.515729],
    [-1.20, 2.514281], [-1.225, 2.487], [-1.245, 2.44021]]) shape.lineTo(z, y);
  shape.closePath();
  const eye = new THREE.ExtrudeGeometry(shape, { depth: .03736, bevelEnabled: false });
  eye.rotateY(-Math.PI / 2).translate(.018685, 0, 0);
  turretPart(P, pivot, 'turretDetail', eye);
  // The source has a separate low shoe; the lower 8 mm continuation seats
  // it in the authored permanent roof without closing the eye.
  turretPart(P, pivot, 'turretDetail', box(.067, .025, .309), .000005, 2.437, -1.1398);
}

function fenderMirror(P: TankBuilderPort, side: number): void {
  const face = new THREE.Shape();
  const w = .32947 / 2, h = .18224 / 2, bevel = .014;
  face.moveTo(-w + bevel, -h);
  for (const [x, y] of [[w - bevel, -h], [w, -h + bevel], [w, h - bevel],
    [w - bevel, h], [-w + bevel, h], [-w, h - bevel], [-w, -h + bevel]]) face.lineTo(x, y);
  face.closePath();
  const plate = new THREE.ExtrudeGeometry(face, { depth: .02328, bevelEnabled: false });
  P.addEquipment('hullDetail', plate, side * 1.30958, 1.51501, 3.231825);
  P.addEquipment('hullGlass', box(.276, .132, .002), side * 1.30958, 1.51501, 3.230825);
  P.addEquipment('hullDetail', cylZ(.026565, .07652, 16), side * 1.30958, 1.515005, 3.291095);
  P.addEquipment('hullDetail', box(.09098, .04376, .04376), side * 1.555765, 1.51482, 3.306465);
  // Measured folded cross-arm and the actual outboard hinge/stalk. The
  // source face is not supported by an invented central vertical pedestal.
  const arm = sectionSolid([1.253005, 1.64, 1.721335].map(x => {
    const top = x < 1.65 ? 1.52675 : 1.465;
    return { z: x, ring: [[-3.318395, top - .02387], [-3.294535, top - .02387],
      [-3.294535, top], [-3.318395, top]] };
  }));
  arm.rotateY(Math.PI / 2);
  if (side < 0) arm.rotateY(Math.PI).translate(0, 0, 6.61293);
  P.addEquipment('hullDetail', arm);
  P.addEquipment('hullDetail', box(.0461, .09739, .04954), side * 1.708895, 1.398325, 3.306465);
  P.addEquipment('hullDetail', box(.11835, .02718, .09732), side * 1.74125, 1.33672, 3.306465);
}

export function addLeopardA6XFittings(P: TankBuilderPort, pivot: Point): void {
  cupolaSight(P, pivot);
  aftLiftingEye(P, pivot);
  fenderMirror(P, -1);
  fenderMirror(P, 1);
}
