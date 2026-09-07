// Independent, seated source-file fittings. Hollow rims and channels have
// physical walls; source material names are not treated as mechanical owners.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { ARIETE_SUPPLIED_X_DATUMS as D, arieteSourceTurret as add } from './arieteXSuppliedFrame.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
const { box, cylX, cylY, cylZ, torus } = KIT;

function tube(radius: number, inner: number, height: number, segments = 32): THREE.BufferGeometry {
  return new THREE.LatheGeometry([[inner, -height / 2], [radius, -height / 2],
    [radius, height / 2], [inner, height / 2], [inner, -height / 2]]
    .map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

function hatch(P: TankBuilderPort, x: number, z: number, y: number): void {
  add(P, 'turretDetail', cylY(.282, .299, .045, 40), x, y - .087, z);
  add(P, 'turretDetail', tube(.324, .282, .025233), x, y, z);
  P.addHatch('turretDetail', cylY(.235, .235, .039, 40),
    x, y - .046 - D.turretPivot[1], z - D.turretPivot[2]);
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, sx = x + Math.sin(a) * .300, sz = z + Math.cos(a) * .300;
    add(P, 'turretDetail', box(.096, .052, .034), sx, y - .048, sz, 0, a);
    add(P, 'turretGlass', box(.079, .024, .004),
      sx + Math.sin(a) * .019, y - .044, sz + Math.cos(a) * .019, 0, a);
    add(P, 'turretDetail', box(.014, .092, .015), sx, y - .057, sz);
  }
  // Raised handles remain separate stock above a real, closed hatch lid.
  for (const dx of [-.052, .052]) add(P, 'turretDetail', box(.014, .043, .018),
    x + dx, y - .007, z - .115);
  add(P, 'turretDetail', box(.118, .013, .018), x, y + .011, z - .115);
}

function recessedSight(P: TankBuilderPort): void {
  const x = -.67372, z = .713253;
  // Source3725 is a depressed rectangular fore-roof assembly. It is not a
  // solid tall box on top of the roof and does not fill the left cheek dip.
  add(P, 'turretDetail', box(.602227, .009, .339804), x, 1.882675, z);
  add(P, 'turretDetail', box(.602227, .242, .011), x, 1.9997, .54885);
  for (const dx of [-.2956, .2956]) add(P, 'turretDetail', box(.011, .225, .339804),
    x + dx, 1.991, z);
  add(P, 'turretDetail', box(.602227, .009, .238), x, 2.11675, .668);
  add(P, 'turretDark', box(.563, .183, .009), x, 1.993, .595);
  // Recessed optical plate is an independently closed4mm stock. The supplied
  // model leaves this surface untextured; keep the actual open forward cavity.
  add(P, 'turretGlass', box(.539, .148, .004), x, 1.990, .6015);
}

function panoramicHead(P: TankBuilderPort): void {
  const x = -.8104, z = .296;
  add(P, 'turretDetail', cylY(.124, .124, .055, 32), x, 2.053, z);
  const shell = new THREE.Shape(), start = Math.PI / 2 + .42, end = Math.PI * 2.5 - .42;
  shell.absarc(0, 0, .122, start, end, false);
  shell.lineTo(Math.cos(end) * .107, Math.sin(end) * .107);
  shell.absarc(0, 0, .107, end, start, true); shell.closePath();
  const body = new THREE.ExtrudeGeometry(shell, { depth: .265,
    bevelEnabled: false, curveSegments: 32 }).rotateX(Math.PI / 2);
  add(P, 'turretDetail', body, x, 2.3405, z);
  // Sight front has two cheeks around the glazing and a raised cap, rather
  // than a full opaque cylinder laid over a decorative glass rectangle.
  add(P, 'turretDetail', box(.071, .193, .084), x - .083, 2.2415, .391);
  add(P, 'turretDetail', box(.071, .193, .084), x + .083, 2.2415, .391);
  add(P, 'turretDetail', box(.220, .016, .211), x, 2.346, .295);
  add(P, 'turretGlass', box(.07654, .15056, .004), x, 2.253727, .374);
  add(P, 'turretDetail', box(.208, .006, .176), x + .006, 2.357, .285);
  // The source's tall open top shield: two returns, a lower inclined leaf,
  // and a top rail. Preserve air between them; this is NOT an AA gun barrel.
  for (const dx of [-.093, .093]) add(P, 'turretDetail', box(.011, .180, .029),
    x + dx, 2.4505, .210, 0, -.614);
  add(P, 'turretDetail', box(.202, .013, .029), x, 2.542, .210, 0, -.614);
  add(P, 'turretDetail', box(.202, .094, .010), x, 2.398, .226, -.785, -.614);
}

function emptyMount(P: TankBuilderPort): void {
  // The supplied Ariete has an empty fork on its port hatch. No receiver or
  // barrel is invented, and this assembly deliberately gets no MG receipt.
  const x = -.835, z = -.038;
  add(P, 'turretDetail', box(.036, .135, .045), x, 2.274, -.092);
  add(P, 'turretDetail', box(.066, .010, .150), x, 2.3395, z - .010);
  for (const dz of [-.038, .007]) add(P, 'turretDetail', box(.145, .128, .011),
    -.764, 2.408, dz);
  add(P, 'turretDetail', cylX(.017, .041, 12), -.845, 2.361, -.011);
  add(P, 'turretDark', box(.038, .272, .029), -.855, 2.3435, -.183);
}

function roofFurniture(P: TankBuilderPort): void {
  for (const [x, z, y] of [[-.912, -.640, 2.089], [.845, -.665, 2.091],
    [-.300, .769, 2.095], [.317, .769, 2.095]]) {
    add(P, 'turretDetail', torus(.033, .011, 16, 6), x, y, z, Math.PI / 2);
    add(P, 'turretDetail', box(.065, .044, .059), x, y - .045, z);
  }
  // Rear crown rails are thin folded stock, not another raised roof slab.
  for (const x of [-.800, -.268, .081, .482]) {
    add(P, 'turretDetail', box(.018, .052, .322), x, 2.134, -1.324);
  }
  add(P, 'turretDetail', box(.0984, .1035, .7839), -1.032, 2.1158, -1.1792);
  add(P, 'turretDetail', cylX(.0273, 1.4139, 20), -.1384, 2.1629, -.9715);
  for (const x of [-.230, .183]) add(P, 'turretDetail', cylY(.020, .024, .278, 16),
    x, 2.199, -.834);
  add(P, 'turretDetail', cylY(.067, .067, .273, 24), .87222, 2.1673, -.86465);
  add(P, 'turretDark', cylY(.004, .0109, 1.265014, 12), .88736, 2.93207, -.86549);
}

function launcher(P: TankBuilderPort, side: -1 | 1, z: number, angle: number): void {
  const root = new THREE.Vector3(side * 1.177, 1.799, z);
  const axis = new THREE.Vector3(side * Math.sin(angle), .07, Math.cos(angle)).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
  const stock = tube(.045, .032, .200, 20).applyQuaternion(rotation);
  add(P, 'turretDetail', stock, root.x, root.y, root.z);
  const end = root.clone().addScaledVector(axis, -.093);
  add(P, 'turretDark', cylY(.0325, .0325, .010, 20).applyQuaternion(rotation), end.x, end.y, end.z);
  add(P, 'turretDetail', box(.083, .035, .066), side * 1.141, 1.754, z - .048);
}

export function addArieteXSuppliedEquipment(P: TankBuilderPort): void {
  hatch(P, -.547, -.133, 2.19611);
  hatch(P, .558, .00757, 2.17256);
  recessedSight(P); panoramicHead(P); emptyMount(P); roofFurniture(P);
  for (const side of [-1, 1] as const) {
    for (const [z, angle] of [[-.6569, 1.04], [-.4752, .88], [-.29354, .65], [-.045, .25]])
      launcher(P, side, z, angle);
    add(P, 'turretDetail', box(.095, .027, .884), side * 1.155, 1.739, -.420);
  }
}
