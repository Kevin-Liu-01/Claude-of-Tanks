// Release 268: the 2K22M Tunguska-M turret on the GM-352 (photographs 01-08 in docs/references/tanks/tunguska_m.md:
// Kuzmin's TankBiathlon 2014 set gives every angle; the MAKS M1 photographs 09-13 show the search radar raised).
// The wide octagonal lower turret on the ring, the upper body over it, the tall radar housing at its back with the
// search radar's elliptical dish raised on its pedestal (as most photographs show it), the tracking radar's round dish
// standing on the body's front, the commander's cupola and the gunner's sight head on the roof. On each flank a 2A38M
// twin-barrel 30 mm cannon (its receiver, the two barrels side by side in their perforated cooling jackets, the muzzle
// brace) on one trunnion with the 9M311M rack outboard of it: the rounded cradle box and its four containers, two by two.
//
// Combat wiring (gm352Layout.ts TUNGUSKA, read by gm352AirDefenseSpecs.ts): the ring at GM352_RING, the trunnion at
// gunPivot, one fire axis per gun on its inner bore (barrel groups 0 and 1, firing alternately as the BMPT's twin 2A42),
// the eight launch exits on the containers' front caps. The racks pitch with the guns (the game's single elevation);
// they stand short behind the trunnion, so their backs stay over the deck through the full -10..+87 degree arc.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { weaponAssembly } from './weaponStock.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { convexSolid } from './gm352Chassis.ts';
import { GM352_RING, TUNGUSKA as T, rackMouths } from './gm352Layout.ts';

type P3 = readonly [number, number, number];

/** A regular octagonal prism, flat faces to the four axes, tapering from bottom to top. */
export function octagonPrism(bottomApothem: number, topApothem: number, bottomY: number, topY: number): THREE.BufferGeometry {
  const ring = (apothem: number, y: number): P3[] => Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + k * Math.PI / 4, r = apothem / Math.cos(Math.PI / 8);
    return [r * Math.sin(a), y, r * Math.cos(a)] as P3;
  });
  return convexSolid([...ring(bottomApothem, bottomY), ...ring(topApothem, topY)]);
}

/** A box with rounded edges in its side (z-y) profile, swept across x from x0 to x1. */
export function roundedSideBox(x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, radius: number,
  segments: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(z0 + radius, y0);
  shape.lineTo(z1 - radius, y0);
  shape.quadraticCurveTo(z1, y0, z1, y0 + radius);
  shape.lineTo(z1, y1 - radius);
  shape.quadraticCurveTo(z1, y1, z1 - radius, y1);
  shape.lineTo(z0 + radius, y1);
  shape.quadraticCurveTo(z0, y1, z0, y1 - radius);
  shape.lineTo(z0, y0 + radius);
  shape.quadraticCurveTo(z0, y0, z0 + radius, y0);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false, curveSegments: segments, steps: 1 });
  // shape x -> hull z, extrusion -> hull x
  return geometry.rotateY(-Math.PI / 2).translate(x1, 0, 0);
}

/** An elliptical dish shell (concave face toward local -z), width x height, depth at the rim. */
function ellipticalDish(halfWidth: number, halfHeight: number, depth: number, thickness: number,
  segments: number): THREE.BufferGeometry {
  const profile: number[][] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i++) { const r = Math.max(0.001, i / steps); profile.push([r, r * r]); }
  for (let i = steps; i >= 0; i--) { const r = Math.max(0.001, i / steps); profile.push([r, r * r + thickness / depth]); }
  return KIT.xform(KIT.lathe(profile, segments), 0, 0, 0, -Math.PI / 2, 0, 0, [halfWidth, depth, halfHeight]);
}

function turretBody(P: TankBuilderPort): void {
  const { drum, body, radarBox } = T;
  const n = P.q ? 32 : 18;
  // the ring collar, 4 cm into the deck, and the wide octagonal lower turret riding 12 mm over the deck on it
  P.add('turret', KIT.cylY(0.95, 0.97, 0.08, n), 0, 0, 0);
  P.add('turret', octagonPrism(drum.bottomApothem, drum.topApothem, drum.bottomY, drum.topY));
  // the upper body: chamfered roof edges, the brow rounding down onto the front plate
  const c = 0.04;
  P.add('turret', convexSolid([-1, 1].flatMap((s) => [
    [s * body.halfWidth, body.bottomY, body.rearZ], [s * body.halfWidth, body.roofY - c, body.rearZ],
    [s * (body.halfWidth - c), body.roofY, body.rearZ], [s * (body.halfWidth - c), body.roofY, body.browZ],
    [s * body.halfWidth, body.roofY - c, body.browZ], [s * body.halfWidth, body.browY, body.frontZ],
    [s * body.halfWidth, body.bottomY, body.frontZ],
  ] as P3[])));
  // the search radar's housing at the back: taller than the roof, its top back edge chamfered
  P.add('turret', convexSolid([-1, 1].flatMap((s) => [
    [s * radarBox.halfWidth, radarBox.bottomY, radarBox.rearZ], [s * radarBox.halfWidth, radarBox.topY - 0.08, radarBox.rearZ],
    [s * radarBox.halfWidth, radarBox.topY, radarBox.rearZ + 0.08], [s * radarBox.halfWidth, radarBox.topY, radarBox.frontZ],
    [s * radarBox.halfWidth, radarBox.bottomY, radarBox.frontZ],
  ] as P3[])));
  // its hinged service doors on the back, their hinges, the housing's side access panels
  for (const x of [-0.38, 0.38]) {
    P.add('turretDetail', KIT.box(0.62, 0.66, 0.024), x, 0.60, radarBox.rearZ - 0.002);
    P.add('turretDark', KIT.box(0.035, 0.56, 0.035), x + Math.sign(x) * 0.30, 0.60, radarBox.rearZ - 0.012);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', KIT.box(0.024, 0.50, 0.56), s * (radarBox.halfWidth + 0.002), 0.66, -1.62);
    // the racks' drive housing on the turret side behind the elevating cradle box, carrying its rounded profile aft
    // (photographs 02, 05, 09: the long rounded box over the turret's flank); it stands clear of the 0.54 m the
    // cradle's corners sweep round the trunnion, built out from the body side
    const { rack } = T, [gy, gz] = [T.gunPivot[1], T.gunPivot[2]];
    const inner = body.halfWidth - 0.01, outer = rack.outerX - 0.02;
    const [hx0, hx1] = s < 0 ? [-outer, -inner] : [inner, outer];
    P.add('turret', roundedSideBox(hx0, hx1, -1.25, gz - 0.63, gy + rack.bottomY + 0.03, gy + rack.topY - 0.03, 0.10, P.q ? 4 : 2));
    // the trunnion's bearing boss on the body side
    P.add('turret', KIT.cylX(0.15, 0.055, P.q ? 24 : 14), s * (body.halfWidth + 0.0125), T.gunPivot[1], T.gunPivot[2]);
  }
}

function searchRadar(P: TankBuilderPort): void {
  const { radarBox } = T, z = -1.58, n = P.q ? 28 : 16;
  // pedestal and yoke on the housing's roof, the strut to the dish's back (silhouette stock: kept at every range)
  P.add('turret', KIT.cylY(0.17, 0.19, 0.28, n), 0, radarBox.topY + 0.12, z);
  P.add('turret', KIT.box(0.52, 0.12, 0.24), 0, radarBox.topY + 0.30, z);
  P.add('turret', KIT.box(0.12, 0.34, 0.12), 0, radarBox.topY + 0.50, z + 0.02);
  // the reflector: 1.60 x 0.72 m, facing back and 15 degrees up, its back on the strut. A thin open dish, not armour:
  // it rides the raised-equipment stock that stays drawn at range, not the armour body's own mesh
  const dish = ellipticalDish(0.80, 0.36, 0.15, 0.035, P.q ? 36 : 20);
  P.add('turretCupola', KIT.xform(dish, 0, 0, 0, 0.26, 0, 0), 0, radarBox.topY + 0.56, z - 0.035);
  // the feed horn on its boom at the dish's focus, the boom from the dish's lower rim
  const feed: P3 = [0, radarBox.topY + 0.62, z - 0.44];
  P.add('turretDark', KIT.box(0.14, 0.11, 0.12), ...feed);
  P.add('turretDark', beamBetween([0, radarBox.topY + 0.30, z - 0.22], [feed[0], feed[1] - 0.03, feed[2] + 0.03], 0.022, 8));
}

function trackingRadar(P: TankBuilderPort): void {
  const { body } = T, n = P.q ? 32 : 18;
  const r = 0.42, y = 0.56, back = body.frontZ - 0.02, depth = 0.30;
  // the drum on the body's front, its arms either side, the flat antenna face with its rim
  P.add('turret', KIT.cylZ(r, depth, n), 0, y, back + depth / 2);
  P.add('turretDark', KIT.cylZ(r - 0.03, 0.02, n), 0, y, back + depth + 0.005);
  P.add('turretDetail', KIT.torus(r - 0.01, 0.022, n, 6).rotateX(Math.PI / 2), 0, y, back + depth + 0.01);
  for (const s of [-1, 1]) P.add('turretDetail', KIT.box(0.08, 0.16, 0.30), s * (r + 0.02), y, back + 0.12);
  // the drive housing under it: a block from the lower turret's front face out under the drum, closing the space
  // between the drum, the body's underside and the lower turret
  P.add('turret', KIT.box(0.44, 0.17, 0.40), 0, 0.215, back + 0.06);
}

function roofKit(P: TankBuilderPort): void {
  const { body } = T;
  // the commander's cupola front left and the gunner's hatch and sight head front right (the crew stations
  // internalLayoutRegistry.ts spaaTunguska gives: commander front left, gunner front right, radar operator rear left)
  KIT.cupola(P, 'turret', 0.38, body.roofY - 0.01, -0.20, 0.27, 0.12, 6);
  P.add('turretHatch', KIT.cylY(0.22, 0.23, 0.035, P.q ? 24 : 12), -0.36, body.roofY + 0.012, -0.48);
  // the gunner's sight head: its pedestal, the drum head, the window looking forward
  P.add('turretDetail', KIT.box(0.26, 0.16, 0.26), -0.42, body.roofY + 0.07, 0.50);
  P.add('turretDetail', KIT.cylX(0.12, 0.28, P.q ? 20 : 12), -0.42, body.roofY + 0.24, 0.50);
  P.addModuleVisual('optics', 'turretGlass', KIT.box(0.16, 0.08, 0.012), -0.42, body.roofY + 0.24, 0.62);
  // the roof's vision blocks and the whip at the back
  for (const [x, z, ry] of [[0.10, 0.62, 0], [-0.10, 0.62, 0], [0.62, -0.80, -Math.PI / 2]] as const) {
    KIT.periscope(P, 'turretDetail', x, body.roofY + 0.02, z, ry);
  }
  P.add('turretDetail', KIT.cylY(0.04, 0.05, 0.05, 12), -0.62, body.roofY + 0.02, -1.0);
  mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: 1.10, r: 0.011, rake: 0.05, seed: 2681 }),
    -0.62, body.roofY + 0.045, -1.0);
}

/** The perforated cooling jacket: a lathe whose rings of holes read as grooves (a plain tube at LOW). */
function coolingJacket(q: boolean, length: number, n: number): THREE.BufferGeometry {
  if (!q) return KIT.cylZ(0.050, length, n).translate(0, 0, length / 2);
  const profile: number[][] = [[0.001, 0], [0.050, 0]];
  for (let z = 0.08; z < length - 0.06; z += 0.07) profile.push([0.050, z], [0.045, z + 0.012], [0.045, z + 0.028], [0.050, z + 0.04]);
  profile.push([0.050, length], [0.001, length]);
  return KIT.lathe(profile, n).rotateX(Math.PI / 2);
}

/** One 2A38M twin-barrel 30 mm on its trunnion (gun-local, either flank), shared by both modules: the trunnion journal
 * from inside the body side through the receiver to the launcher (a body of revolution about the pitch axis), the
 * receiver with its cover and front collar, the two barrels side by side in their perforated cooling jackets (bare dark
 * steel, as every photograph shows them), the muzzle brace, the collars. Barrel group `index`'s painted stock is the
 * firing (inner) bore's mounting flange, so the group is drawn on its fire axis; the outer bore carries its dark mouth. */
export function cannon2A38M(P: TankBuilderPort, side: number, gunX: number, boreDx: number, muzzleZ: number,
  shaft: readonly [number, number]): void {
  const n = P.q ? 16 : 10, gx = side * gunX, index = side < 0 ? 0 : 1, dark = `gunBarrel${index}Dark`;
  P.add('gunMount', KIT.cylX(0.085, shaft[1] - shaft[0], n), side * (shaft[0] + shaft[1]) / 2, 0, 0);
  P.addModuleVisual('gun', 'gunMount', KIT.box(0.26, 0.25, 1.02), gx, 0, 0.11);
  P.add('gunMount', KIT.box(0.25, 0.035, 0.80), gx, 0.135, 0.05);
  P.add('gunMountDark', KIT.box(0.22, 0.12, 0.08), gx, 0, 0.64);
  const jacket = 0.62;
  for (const dx of [-boreDx, boreDx]) {
    const x = gx + dx;
    P.add(dark, coolingJacket(P.q, jacket, n), x, 0, 0.58);
    P.add(dark, KIT.cylZ(0.036, muzzleZ - 0.04 - (0.58 + jacket - 0.04), n), x, 0, (muzzleZ - 0.04 + 0.58 + jacket - 0.04) / 2);
    P.add(dark, KIT.cylZ(0.044, 0.08, n), x, 0, muzzleZ - 0.04);
  }
  const inner = gx - side * boreDx;
  P.add(`gunBarrel${index}`, KIT.cylZ(0.058, 0.06, n), inner, 0, 0.73);
  P.add(dark, KIT.box(0.17, 0.05, 0.05), gx, 0, muzzleZ - 0.26);
  P.add(dark, KIT.cylZ(0.017, 0.004, 10), gx + side * boreDx, 0, muzzleZ);
}

function cannons(P: TankBuilderPort): void {
  for (const side of [-1, 1]) cannon2A38M(P, side, T.gunX, T.boreDx, T.muzzleZ, [0.72, 1.22]);
  P.muzzleZ = T.muzzleZ;
}

function missileRacks(P: TankBuilderPort): void {
  const { rack } = T, n = P.q ? 18 : 10;
  const length = rack.mouthZ - 0.01 - rack.tubeRearZ;
  for (const side of [-1, 1]) {
    const [x0, x1] = side < 0 ? [-rack.outerX, -rack.innerX] : [rack.innerX, rack.outerX];
    const box = roundedSideBox(x0, x1, rack.rearZ, rack.frontZ, rack.bottomY, rack.topY, 0.10, P.q ? 4 : 2);
    P.addModuleVisual('missileRack', 'gunMount', box);
    for (const tx of rack.tubeXs) for (const ty of rack.tubeYs) {
      const x = side * tx;
      P.addModuleVisual('missileRack', 'gunMount', KIT.cylZ(rack.tubeR, length, n), x, ty, rack.tubeRearZ + length / 2);
      // the front cover over the launch exit
      P.add('gunMountDark', KIT.cylZ(rack.tubeR - 0.012, 0.02, n), x, ty, rack.mouthZ - 0.01);
    }
    // the clamp band round the four containers
    const cx = side * (rack.tubeXs[0] + rack.tubeXs[1]) / 2, cy = (rack.tubeYs[0] + rack.tubeYs[1]) / 2;
    const span = rack.tubeXs[1] - rack.tubeXs[0] + 2 * rack.tubeR + 0.02, rise = rack.tubeYs[1] - rack.tubeYs[0] + 2 * rack.tubeR + 0.02;
    P.add('gunMount', KIT.box(span, rise, 0.06), cx, cy, 1.25);
  }
  P.turretG.userData.airDefenseLauncher = { launcherTubes: rackMouths(rack.tubeXs, rack.tubeYs, rack.mouthZ).length };
}

/** The 2K22M turret on a GM-352 hull (the caller builds the chassis first). */
export function buildTunguskaTurret(P: TankBuilderPort): void {
  P.turretG.position.set(...GM352_RING);
  P.gunG.position.set(...T.gunPivot);
  turretBody(P);
  searchRadar(P);
  trackingRadar(P);
  roofKit(P);
  // VH.14 (roofWeaponPolicy.ts): the 2K22M carries its two 2A38M and eight 9M311M; no machine gun
  weaponAssembly(P, () => cannons(P), 'gun');
  weaponAssembly(P, () => missileRacks(P), 'missileRack');
  P.topY = T.radarBox.topY + 0.92;
}
