// Release 268: the 2K22M Tunguska-M turret on the GM-352 (photographs 01-08 in docs/references/tanks/tunguska_m.md:
// Kuzmin's TankBiathlon 2014 set gives every angle; the MAKS M1 photographs 09-13 show the search radar raised).
// The broad round lower turret on the ring, the upper body on it with its roof's front edge rounded down, the tall radar
// housing at its back with the search radar folded back over the engine deck for travel (photographs 01-06: the curved
// plate on its drive box), the tracking radar's round drum standing ahead of the body on its neck, the commander's
// cupola and the gunner's sight head on the roof. On each flank a 2A38M twin-barrel 30 mm cannon (its receiver, the two
// barrels side by side in their perforated cooling jackets, the muzzle brace) on one trunnion with the 9M311M launcher
// outboard of it: the flat armoured side box and its four containers ahead of it, two by two.
//
// Combat wiring (gm352Layout.ts TUNGUSKA, read by gm352AirDefenseSpecs.ts): the ring at GM352_RING, the trunnion at
// gunPivot, one fire axis per gun on its inner bore (barrel groups 0 and 1, firing alternately as the BMPT's twin 2A42),
// the eight launch exits on the containers' front covers. The launchers pitch with the guns (the game's single
// elevation): the side box's front part elevates, its back an arc about the trunnion, and its back part stands fixed on
// the turret behind a concave arc 3 cm outside it, so the box reads as one at rest and clears through -10..+87 degrees.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT, FITTINGS } from './kit.ts';
import { mount } from './fittingMount.ts';
import { weaponAssembly } from './weaponStock.ts';
import { convexSolid, profileSolid } from './gm352Chassis.ts';
import { GM352_RING, TUNGUSKA as T, rackMouths } from './gm352Layout.ts';

type P3 = readonly [number, number, number];
type P2 = readonly [number, number];

/** A regular octagonal prism, flat faces to the four axes, tapering from bottom to top. */
export function octagonPrism(bottomApothem: number, topApothem: number, bottomY: number, topY: number): THREE.BufferGeometry {
  const ring = (apothem: number, y: number): P3[] => Array.from({ length: 8 }, (_, k) => {
    const a = Math.PI / 8 + k * Math.PI / 4, r = apothem / Math.cos(Math.PI / 8);
    return [r * Math.sin(a), y, r * Math.cos(a)] as P3;
  });
  return convexSolid([...ring(bottomApothem, bottomY), ...ring(topApothem, topY)]);
}

/** The lower turret's side profile (radius in, height): its foot, the sides leaning in, the rounded top edge (the spec's
 * plates, gm352AirDefenseSpecs.ts tubPlates, follow its foot, its 0.20 m station and its edge). */
const TUB_PROFILE: readonly P2[] = Object.freeze([
  [0, T.tub.bottomY], [-0.02, 0.06], [-0.05, 0.20], [-0.09, 0.255], [-0.16, 0.29], [-0.26, T.tub.topY],
] as P2[]);

/** Points on an arc about the trunnion (gun-local z, y), from angle a0 to a1, radius r. */
function arc(r: number, a0: number, a1: number, steps: number): P2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + (a1 - a0) * i / steps;
    return [r * Math.cos(a), r * Math.sin(a)] as P2;
  });
}

function turretBody(P: TankBuilderPort): void {
  const { tub, body, radarBox } = T;
  const n = P.q ? 40 : 22;
  // the ring collar, 4 cm into the deck, and the broad oval lower turret riding 12 mm over the deck on it: its sides
  // leaning in, its top edge rounded (photographs 02, 05, 06)
  P.add('turret', KIT.cylY(0.95, 0.97, 0.08, n), 0, 0, 0);
  const profile = [[0.001, tub.bottomY], ...TUB_PROFILE.map(([dr, y]) => [tub.halfWidth + dr, y]), [0.001, tub.topY]];
  P.add('turret', KIT.lathe(profile, n, tub.halfLength / tub.halfWidth), 0, 0, tub.centreZ);
  // the upper body: chamfered roof side edges, the roof's front edge rounded down onto the front plate
  const c = 0.04, brow: P2[] = arc(1, Math.PI / 2, 0, P.q ? 5 : 3).map(([u, v]) => [
    body.browZ + u * (body.frontZ - body.browZ), body.browY + v * (body.roofY - body.browY)] as P2);
  P.add('turret', convexSolid([-1, 1].flatMap((s) => [
    [s * body.halfWidth, body.bottomY, body.rearZ], [s * body.halfWidth, body.roofY - c, body.rearZ],
    [s * (body.halfWidth - c), body.roofY, body.rearZ],
    ...brow.map(([z, y]) => [s * (body.halfWidth - (y > body.roofY - c ? c : 0)), y, z] as P3),
    [s * body.halfWidth, body.roofY - c, body.browZ], [s * body.halfWidth, body.bottomY, body.frontZ],
  ] as P3[])));
  // the search radar's housing at the back: taller than the roof, its top back edge chamfered
  P.add('turret', convexSolid([-1, 1].flatMap((s) => [
    [s * radarBox.halfWidth, radarBox.bottomY, radarBox.rearZ], [s * radarBox.halfWidth, radarBox.topY - 0.08, radarBox.rearZ],
    [s * radarBox.halfWidth, radarBox.topY, radarBox.rearZ + 0.08], [s * radarBox.halfWidth, radarBox.topY, radarBox.frontZ],
    [s * radarBox.halfWidth, radarBox.bottomY, radarBox.frontZ],
  ] as P3[])));
  // its hinged service doors on the back, their hinges, the housing's side access panels
  for (const x of [-0.46, 0.46]) {
    P.add('turretDetail', KIT.box(0.44, 0.62, 0.024), x, 0.58, radarBox.rearZ - 0.002);
    P.add('turretDark', KIT.box(0.035, 0.52, 0.035), x + Math.sign(x) * 0.21, 0.58, radarBox.rearZ - 0.012);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', KIT.box(0.024, 0.50, 0.56), s * (radarBox.halfWidth + 0.002), 0.66, -1.62);
    // the side box's fixed back part: from the body side out to the launcher's outer face, its front a concave arc
    // about the trunnion 3 cm outside the elevating cradle's back (gm352Layout.ts TUNGUSKA.rack)
    const { rack } = T, [gy, gz] = [T.gunPivot[1], T.gunPivot[2]];
    const top = Math.asin(rack.topY / rack.housingArcR), bottom = Math.asin(rack.bottomY / rack.housingArcR);
    const r = 0.08, back = rack.housingRearZ;
    const outline: P2[] = [
      [back + r, rack.bottomY],
      ...arc(rack.housingArcR, Math.PI - bottom, Math.PI - top, P.q ? 12 : 6),
      [back + r, rack.topY], [back + r * 0.3, rack.topY - r * 0.3], [back, rack.topY - r],
      [back, rack.bottomY + r], [back + r * 0.3, rack.bottomY + r * 0.3],
    ].map(([z, y]) => [gz + z, gy + y] as P2);
    const inner = T.body.halfWidth - 0.01;
    P.add('turret', profileSolid(s < 0 ? -rack.outerX : inner, s < 0 ? -inner : rack.outerX, outline));
    // the trunnion's bearing boss on the body side
    P.add('turret', KIT.cylX(0.15, 0.055, P.q ? 24 : 14), s * (body.halfWidth + 0.0125), gy, gz);
  }
}

/** The search radar folded for travel (photographs 01-06): its drive head over the housing's back on the lattice
 * ladder frame, the reflector plate hinged low in the head and folded 15 degrees down and back out of its rear face
 * over the engine deck, 2.2 m across (70 % of the turret's width over the launchers), its tips curving down 25
 * degrees, the triangular lightening pockets of its ribbed back facing up. Raised equipment, not armour: the stock
 * kept drawn at every range. */
function searchRadar(P: TankBuilderPort): void {
  const { searchDrive: D, searchPlate: S } = T;
  P.add('turretCupola', convexSolid([-1, 1].flatMap((s) => [
    [s * D.halfWidth, D.bottomY, D.rearZ + 0.06], [s * D.halfWidth, D.topY, D.rearZ + 0.06], [s * D.halfWidth, D.topY, D.frontZ],
    [s * D.halfWidth, D.bottomY, D.frontZ], [s * D.halfWidth, D.bottomY + 0.08, D.rearZ], [s * D.halfWidth, D.topY - 0.08, D.rearZ],
  ] as P3[])));
  // the lattice of the IFF antenna over the head's roof (photographs 01-03)
  P.add('turretDark', KIT.box(0.40, 0.06, 0.30), 0, D.topY + 0.02, D.rearZ + 0.30);
  // the plate: its section arched across the width, its outline a D (the straight hinge edge, the rounded free edge)
  const nx = P.q ? 18 : 10, ns = P.q ? 6 : 3, hw = S.halfWidth;
  // its tips curve down 25 degrees off the centre line, which stays at the hinge's height
  const archY = (x: number): number => -S.arch * (x / hw) ** 2;
  const reach = (x: number): number => S.length * (0.35 + 0.65 * Math.cbrt(1 - Math.abs(x / hw) ** 3));
  const local = (x: number, s: number, up: number): THREE.Vector3 => {
    // plate-local: x across, s back from the hinge along the plate, up out of its upper (back) face
    const y = archY(x) + up, cos = Math.cos(S.fold), sin = Math.sin(S.fold);
    return new THREE.Vector3(x, S.hingeY + y * cos - s * sin, S.hingeZ - s * cos - y * sin);
  };
  const positions: number[] = [];
  const quad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3): void => {
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  };
  const xs = Array.from({ length: nx + 1 }, (_, i) => -hw + 2 * hw * i / nx);
  const at = (i: number, j: number, up: number): THREE.Vector3 => local(xs[i], reach(xs[i]) * j / ns, up);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ns; j++) {
      quad(at(i, j, 0), at(i + 1, j, 0), at(i + 1, j + 1, 0), at(i, j + 1, 0));
      quad(at(i, j + 1, -S.thickness), at(i + 1, j + 1, -S.thickness), at(i + 1, j, -S.thickness), at(i, j, -S.thickness));
    }
    // the hinge edge and the free edge
    quad(at(i, 0, -S.thickness), at(i + 1, 0, -S.thickness), at(i + 1, 0, 0), at(i, 0, 0));
    quad(at(i, ns, 0), at(i + 1, ns, 0), at(i + 1, ns, -S.thickness), at(i, ns, -S.thickness));
  }
  for (const [i, sign] of [[0, -1], [nx, 1]] as const) for (let j = 0; j < ns; j++) {
    const [a, b] = sign < 0 ? [j, j + 1] : [j + 1, j];
    quad(at(i, a, 0), at(i, b, 0), at(i, b, -S.thickness), at(i, a, -S.thickness));
  }
  const plate = new THREE.BufferGeometry();
  plate.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  plate.setAttribute('uv', new THREE.Float32BufferAttribute(positions.flatMap((v, k) => k % 3 === 1 ? [] : [v]), 2));
  plate.computeVertexNormals();
  P.add('turretCupola', plate);
  // the lightening pockets on its upper (back) face: two rows of triangles, apex alternating (photographs 02, 03, 12)
  if (P.q) for (const [row, s] of [[0, 0.40], [1, 0.66]] as const) for (let k = 0; k < 4; k++) {
    const x = (k - 1.5) * 0.46, flip = (k + row) % 2 === 0 ? 1 : -1, w = 0.15, d = 0.10;
    const corners = [[x - w, s - flip * d], [x + w, s - flip * d], [x, s + flip * d]].map(([cx, cs]) =>
      [cx, Math.min(cs, reach(cx) - 0.05)] as P2);
    P.add('turretDark', convexSolid(corners.flatMap(([cx, cs]) => [local(cx, cs, 0.004), local(cx, cs, -0.012)]
      .map((v) => [v.x, v.y, v.z] as P3))));
  }
  // the lattice ladder frame under the head, down the housing's back, braced to it (photographs 02, 03, 04)
  const rail = D.ladderHalfWidth, top = D.bottomY + 0.01, foot = D.ladderBottomY;
  for (const sx of [-1, 1]) {
    P.add('turretDark', KIT.box(0.045, top - foot, 0.045), sx * rail, (top + foot) / 2, D.ladderZ);
    for (const y of [foot + 0.10, top - 0.12]) {
      P.add('turretDark', KIT.box(0.035, 0.035, T.radarBox.rearZ - D.ladderZ + 0.01), sx * rail, y,
        (D.ladderZ + T.radarBox.rearZ) / 2 - 0.005);
    }
  }
  for (let y = foot + 0.05; y < top - 0.02; y += 0.11) P.add('turretDark', KIT.box(2 * rail, 0.025, 0.03), 0, y, D.ladderZ);
}

function trackingRadar(P: TankBuilderPort): void {
  const { body, trackRadar: R } = T, n = P.q ? 32 : 18, depth = R.frontZ - R.rearZ;
  // the neck from the body's front out under the drum, the yoke's arms either side of it
  P.add('turret', KIT.box(0.50, 0.44, R.rearZ - body.frontZ + 0.10), 0, R.y - 0.12, (body.frontZ - 0.05 + R.rearZ + 0.05) / 2);
  for (const s of [-1, 1]) P.add('turret', KIT.box(0.08, 0.30, 0.36), s * (R.r + 0.03), R.y, R.rearZ + 0.10);
  // the drive's chin under the drum, from the base's foot up into the drum (photographs 02, 05: the drum stands on it)
  P.add('turret', KIT.box(0.48, R.y - T.tub.bottomY - 0.22, R.frontZ - 0.04 - (R.rearZ - 0.02)), 0,
    (R.y - 0.22 + T.tub.bottomY) / 2, (R.frontZ - 0.04 + R.rearZ - 0.02) / 2);
  // the drum, its gently domed antenna face with the rim
  P.add('turret', KIT.cylZ(R.r, depth, n), 0, R.y, R.rearZ + depth / 2);
  const dome = KIT.lathe([[R.r - 0.02, 0], [R.r - 0.10, 0.03], [0.18, 0.05], [0.001, 0.055]], n);
  P.add('turret', dome.rotateX(Math.PI / 2), 0, R.y, R.frontZ - 0.002);
  P.add('turretDetail', KIT.torus(R.r - 0.01, 0.022, n, 6).rotateX(Math.PI / 2), 0, R.y, R.frontZ + 0.006);
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
 * firing (inner) bore's mounting flange, so the group is drawn on its fire axis; the outer bore carries its dark mouth.
 * `dz` moves the gun out along its bores from the trunnion (the Pantsir's trunnion stands behind its receivers). */
export function cannon2A38M(P: TankBuilderPort, side: number, gunX: number, boreDx: number, muzzleZ: number,
  shaft: readonly [number, number], dz = 0): void {
  const n = P.q ? 16 : 10, gx = side * gunX, index = side < 0 ? 0 : 1, dark = `gunBarrel${index}Dark`;
  P.add('gunMount', KIT.cylX(0.085, shaft[1] - shaft[0], n), side * (shaft[0] + shaft[1]) / 2, 0, 0);
  // the receiver: 0.92 m from just behind the trunnion (its back stays inside 0.33 m of the pitch axis)
  P.addModuleVisual('gun', 'gunMount', KIT.box(0.26, 0.25, 0.92), gx, 0, dz + 0.16);
  // out along the bores, the cradle arm from the journal forward to the receiver
  if (dz > 0) P.add('gunMount', KIT.box(0.16, 0.14, dz + 0.04), gx, -0.02, dz / 2);
  P.add('gunMount', KIT.box(0.25, 0.035, 0.74), gx, 0.135, dz + 0.08);
  P.add('gunMountDark', KIT.box(0.22, 0.12, 0.08), gx, 0, dz + 0.64);
  const jacket = 0.62, j0 = dz + 0.58;
  for (const ox of [-boreDx, boreDx]) {
    const x = gx + ox;
    P.add(dark, coolingJacket(P.q, jacket, n), x, 0, j0);
    P.add(dark, KIT.cylZ(0.036, muzzleZ - 0.04 - (j0 + jacket - 0.04), n), x, 0, (muzzleZ - 0.04 + j0 + jacket - 0.04) / 2);
    P.add(dark, KIT.cylZ(0.044, 0.08, n), x, 0, muzzleZ - 0.04);
  }
  const inner = gx - side * boreDx;
  P.add(`gunBarrel${index}`, KIT.cylZ(0.058, 0.06, n), inner, 0, dz + 0.73);
  // the muzzle frame: a rectangular brace round both barrels (photographs 02, 12, 13)
  const fw = 2 * boreDx + 0.13, fh = 0.13, ft = 0.02;
  for (const s of [-1, 1]) {
    P.add(dark, KIT.box(fw, ft, 0.04), gx, s * (fh - ft) / 2, muzzleZ - 0.22);
    P.add(dark, KIT.box(ft, fh, 0.04), gx + s * (fw - ft) / 2, 0, muzzleZ - 0.22);
  }
  P.add(dark, KIT.box(2 * boreDx, 0.04, 0.04), gx, 0, muzzleZ - 0.22);
  P.add(dark, KIT.cylZ(0.017, 0.004, 10), gx + side * boreDx, 0, muzzleZ);
}

function cannons(P: TankBuilderPort): void {
  for (const side of [-1, 1]) cannon2A38M(P, side, T.gunX, T.boreDx, T.muzzleZ, [0.72, 1.22]);
  P.muzzleZ = T.muzzleZ;
}

/** A thin band round a pack of containers (gun-local), 4 cm wide. */
export function packBand(P: TankBuilderPort, cx: number, cy: number, w: number, h: number, z: number): void {
  const t = 0.018;
  for (const s of [-1, 1]) {
    P.add('gunMount', KIT.box(w + 2 * t, t, 0.04), cx, cy + s * (h + t) / 2, z);
    P.add('gunMount', KIT.box(t, h, 0.04), cx + s * (w + t) / 2, cy, z);
  }
}

function missileRacks(P: TankBuilderPort): void {
  const { rack } = T, n = P.q ? 18 : 10;
  const length = rack.mouthZ - 0.01 - rack.tubeRearZ;
  const top = Math.asin(rack.topY / rack.arcR), bottom = Math.asin(rack.bottomY / rack.arcR), r = 0.06;
  // the side box's elevating front part: its back an arc about the trunnion, its front corners rounded
  const outline: P2[] = [
    ...arc(rack.arcR, Math.PI - top, Math.PI - bottom, P.q ? 12 : 6),
    [rack.frontZ - r, rack.bottomY], [rack.frontZ - r * 0.3, rack.bottomY + r * 0.3], [rack.frontZ, rack.bottomY + r],
    [rack.frontZ, rack.topY - r], [rack.frontZ - r * 0.3, rack.topY - r * 0.3], [rack.frontZ - r, rack.topY],
  ];
  for (const side of [-1, 1]) {
    const [x0, x1] = side < 0 ? [-rack.outerX, -rack.innerX] : [rack.innerX, rack.outerX];
    P.addModuleVisual('missileRack', 'gunMount', profileSolid(x0, x1, outline));
    for (const tx of rack.tubeXs) for (const ty of rack.tubeYs) {
      const x = side * tx;
      P.addModuleVisual('missileRack', 'gunMount', KIT.cylZ(rack.tubeR, length, n), x, ty, rack.tubeRearZ + length / 2);
      // the front cover over the launch exit, its rim
      P.add('gunMountDark', KIT.cylZ(rack.tubeR - 0.012, 0.02, n), x, ty, rack.mouthZ - 0.01);
      if (P.q) P.add('gunMount', KIT.cylZ(rack.tubeR + 0.006, 0.05, n), x, ty, rack.mouthZ - 0.05);
    }
    // two thin bands round the four containers
    const cx = side * (rack.tubeXs[0] + rack.tubeXs[1]) / 2, cy = (rack.tubeYs[0] + rack.tubeYs[1]) / 2;
    const w = rack.tubeXs[1] - rack.tubeXs[0] + 2 * rack.tubeR, h = rack.tubeYs[1] - rack.tubeYs[0] + 2 * rack.tubeR;
    for (const z of [0.55, 1.15]) packBand(P, cx, cy, w, h, z);
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
  // the gunner's sight head is the turret's top with the search radar folded (the published 3.36 m)
  P.topY = T.body.roofY + 0.36;
}
