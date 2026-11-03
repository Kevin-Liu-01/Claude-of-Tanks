// Release 268, the PLA's twin-cannon air defence (owner 2026-11-02, "we should add more double barrel vehicels"): the
// PGZ-95 (Type 95 SPAAA) and the PGZ-09 (Type 09 SPAAA) on their own chassis (plaAirDefenseChassis.ts).
// - PGZ-95 (the Beijing museum vehicle, photographs 01-02): the one-man turret on the rear of the hull with the EO
//   director's armoured box on its front left, an over-under pair of Type 87 25 mm cannons in an open cradle on each
//   side (exposed receivers, long thin barrels clamped together midway, flash hiders), two QW-2 launch tubes stacked over
//   each pair with their boxy seeker caps, four smoke grenade launchers at each front corner, and the CLC-1 search
//   antenna raised on its mast at the turret rear, the light orange-peel reflector as wide as the turret.
// - PGZ-09 (the 2017 exhibition vehicle, photographs 01-03): the long boxy turret over a sloped lower band, a PG99 35 mm
//   cannon in a wedge-shaped armoured housing on each upper side with its barrel and muzzle booster running past the
//   turret front, the round tracking-radar antenna on a stalk at the front with the EO head above it, three smoke
//   dischargers on each side of the band, the search antenna folded flat on its pedestal on the roof, two roof hatches.
// Every firing datum is the layout's (chineseAirDefenseLayout.ts), which the spec (chineseAirDefenseSpecs.ts) reads: the
// ring, the trunnion, the two fire axes (spec.gun.muzzles: the upper bore of each PGZ-95 pair, both bores of a side
// riding that side's recoil group) and the four QW-2 launch exits. First-party procedural geometry: Kevin B. Liu
// (NOTICE.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { KIT } from './kit.ts';
import { weaponAssembly } from './weaponStock.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { buildPgz09Chassis, buildPgz95Chassis, convexBody, mirrored, type P3 } from './plaAirDefenseChassis.ts';
import { PGZ09_GUNS, PGZ09_LAYOUT, PGZ95_GUNS, PGZ95_LAUNCHER_MUZZLES, PGZ95_LAYOUT } from './chineseAirDefenseLayout.ts';

const { box, cylX, cylY, cylZ } = KIT;

/**
 * A doubly curved reflector sheet facing +z (concave forward), `thick` deep, on a rounded-rectangle outline: the front
 * and back sheets are smooth, the rim is flat-faced.
 */
function reflectorShell(width: number, height: number, depth: number, thick: number, nu: number, nv: number,
  round = 0.6): THREE.BufferGeometry {
  const at = (i: number, j: number): [number, number, number] => {
    const u = -1 + 2 * i / nu, v = -1 + 2 * j / nv;
    const x = width / 2 * u * (1 - round + round * Math.sqrt(1 - v * v / 2));
    const y = height / 2 * v * (1 - round + round * Math.sqrt(1 - u * u / 2));
    return [x, y, depth * (0.8 * (2 * x / width) ** 2 + 0.5 * (2 * y / height) ** 2) / 1.3];
  };
  const sheet = (back: boolean): THREE.BufferGeometry => {
    const positions: number[] = [], index: number[] = [], uv: number[] = [];
    for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) {
      const [x, y, z] = at(i, j);
      positions.push(x, y, back ? z - thick : z); uv.push(x, y);
    }
    const k = (i: number, j: number): number => i * (nv + 1) + j;
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const a = k(i, j), b = k(i + 1, j), c = k(i + 1, j + 1), d = k(i, j + 1);
      if (back) index.push(a, c, b, a, d, c); else index.push(a, b, c, a, c, d);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index);
    geometry.computeVertexNormals();
    return geometry.toNonIndexed();
  };
  const loop: Array<[number, number]> = [];
  for (let i = 0; i < nu; i++) loop.push([i, 0]);
  for (let j = 0; j < nv; j++) loop.push([nu, j]);
  for (let i = nu; i > 0; i--) loop.push([i, nv]);
  for (let j = nv; j > 0; j--) loop.push([0, j]);
  const rim: number[] = [], rimUv: number[] = [];
  loop.forEach(([i, j], n) => {
    const [ni, nj] = loop[(n + 1) % loop.length];
    const fa = at(i, j), fb = at(ni, nj);
    const ba: P3 = [fa[0], fa[1], fa[2] - thick], bb: P3 = [fb[0], fb[1], fb[2] - thick];
    for (const p of [fa, ba, bb, fa, bb, fb]) { rim.push(...p); rimUv.push(p[0], p[1] + p[2]); }
  });
  const edge = new THREE.BufferGeometry();
  edge.setAttribute('position', new THREE.Float32BufferAttribute(rim, 3));
  edge.setAttribute('uv', new THREE.Float32BufferAttribute(rimUv, 2));
  edge.computeVertexNormals();
  const merged = mergeGeometries([sheet(false), sheet(true), edge]);
  if (!merged) throw new Error('reflectorShell: sheets did not merge');
  return merged;
}

/** One QW-2 launch tube with its seeker cap box and the frangible cover disc that is the launch exit. */
function qw2Tube(P: TankBuilderPort, x: number, y: number): void {
  const G = PGZ95_GUNS, n = P.q ? 12 : 8;
  P.add('gunMount', cylZ(G.tubeR, G.headRearZ - G.tubeRearZ + 0.02, n), x, y, (G.headRearZ + G.tubeRearZ) / 2 + 0.01);
  P.add('gunMount', box(0.13, 0.13, G.launchZ - G.headRearZ), x, y, (G.launchZ + G.headRearZ) / 2);
  P.add('gunMountDark', cylZ(0.042, 0.012, n), x, y, G.launchZ + 0.004);
  P.add('gunMountDark', cylZ(G.tubeR + 0.006, 0.05, n), x, y, G.tubeRearZ + 0.02);
}

// ------------------------------------------------------------------------------------------------------- PGZ-95 --
function pgz95Turret(P: TankBuilderPort): void {
  const L = PGZ95_LAYOUT, T = L.turret, R = L.radar;
  const n = P.q ? 32 : 18;
  // ring collar sunk 2 cm into the deck, the welded body: vertical sides, chamfered roof edges, the sloped front
  P.add('turret', cylY(0.86, 0.88, 0.10, n), 0, 0.03, 0);
  const frontAt = (y: number): number => T.frontZ - (y - T.noseY) * (T.frontZ - T.roofFrontZ) / (T.roofY - T.noseY);
  P.add('turret', convexBody(mirrored([
    [T.sideX, 0.02, T.rearZ], [T.sideX, 0.74, T.rearZ], [T.roofHalf, T.roofY, T.rearZ],
    [T.sideX, 0.02, T.frontZ], [T.sideX, T.noseY, T.frontZ], [T.sideX, 0.74, frontAt(0.74)], [T.roofHalf, T.roofY, T.roofFrontZ],
  ])));
  // trunnion bosses on the side walls, the pods' shafts turn in them
  for (const s of [-1, 1]) P.add('turret', cylX(0.15, 0.04, P.q ? 20 : 12), s * (T.sideX + 0.02), L.gunPivot[1], L.gunPivot[2]);
  // the EO director's armoured box on the front left: TV and IR windows, the laser rangefinder port
  P.addModuleVisual('optics', 'turret', convexBody([0.10, 0.60].flatMap((x) => [
    [x, 0.04, 0.60], [x, 0.74, 0.60], [x, 0.04, 1.25], [x, 0.70, 1.25]] as P3[])));
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.17, 0.012), 0.24, 0.48, 1.252);
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.055, 0.012, P.q ? 16 : 10), 0.48, 0.48, 1.252);
  P.add('turretDark', box(0.26, 0.022, 0.08), 0.24, 0.585, 1.25);
  P.add('turretDark', cylZ(0.035, 0.03, 10), 0.48, 0.26, 1.255);
  // the gunner's sight head on the director box and the access door in the left wall (photograph 02)
  P.addModuleVisual('optics', 'turretDetail', box(0.24, 0.14, 0.26), 0.26, 0.78, 0.86);
  P.addModuleVisual('optics', 'turretGlass', box(0.16, 0.06, 0.012), 0.26, 0.79, 0.994);
  P.add('turretDetail', box(0.016, 0.46, 0.46), T.sideX + 0.006, 0.40, -0.40);
  for (const z of [-0.56, -0.24]) P.add('turretDark', box(0.03, 0.05, 0.08), T.sideX + 0.02, 0.56, z);
  // four smoke grenade launchers at each front corner, on a foot plate, fired forward and up (Army Technology)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.34, 0.04, 0.17), s * 0.765, 0.06, 1.01);
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', cylZ(0.036, 0.22, 10), s * (0.645 + k * 0.083), 0.15, 1.04, -0.45, 0, 0);
    }
  }
  // roof: the gunner's hatch, his periscope, a handrail and the antenna base
  P.addHatch('turret', cylY(0.25, 0.25, 0.035, P.q ? 22 : 14), -0.32, T.roofY + 0.012, -0.30);
  P.add('turretDark', KIT.torus(0.25, 0.010, P.q ? 22 : 14, 4), -0.32, T.roofY + 0.03, -0.30);
  P.addModuleVisual('optics', 'turretDetail', box(0.15, 0.08, 0.11), -0.32, T.roofY + 0.04, 0.12);
  P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.03, 0.012), -0.32, T.roofY + 0.05, 0.177);
  P.add('turretDark', cylX(0.013, 0.56, 6), 0.30, T.roofY + 0.09, 0.30);
  for (const x of [0.04, 0.56]) P.add('turretDark', cylY(0.013, 0.013, 0.09, 6), x, T.roofY + 0.045, 0.30);
  P.add('turretDark', cylY(0.04, 0.05, 0.06, 10), 0.58, T.roofY + 0.03, -0.98);
  // the CLC-1 search antenna raised as photographed: turntable, mast, hinge yoke, the reflector and its feed
  P.add('turret', convexBody(mirrored([[0.26, T.roofY - 0.02, -1.13], [0.26, T.roofY - 0.02, -0.66],
    [0.22, T.roofY + 0.15, -1.12], [0.22, T.roofY + 0.15, -0.70]])));
  P.add('turretDark', cylY(0.20, 0.20, 0.04, P.q ? 20 : 12), 0, T.roofY + 0.17, R.mastZ);
  P.add('turretDetail', cylY(0.10, 0.13, R.y - 0.40 - T.roofY - 0.18, P.q ? 16 : 10), 0, (R.y - 0.40 + T.roofY + 0.18) / 2, R.mastZ);
  P.add('turretDetail', box(0.42, 0.18, 0.20), 0, R.y - 0.40, R.mastZ);
  const dish = reflectorShell(R.width, R.height, R.depth, R.thick, P.q ? 14 : 8, P.q ? 10 : 6);
  P.add('turretDetail', dish, R.x, R.y, R.z);
  // the reflector's back frame: its front face follows the sheet's back 1 cm deep, down onto the yoke
  const dishBack = (y: number): number => R.z - R.thick + R.depth * 0.5 * (2 * (y - R.y) / R.height) ** 2 / 1.3 + 0.01;
  P.add('turretDetail', convexBody(mirrored([[0.15, R.y - 0.44, R.mastZ - 0.03], [0.15, R.y + 0.02, R.mastZ - 0.03],
    [0.15, R.y - 0.44, dishBack(R.y - 0.44)], [0.15, R.y + 0.02, dishBack(R.y + 0.02)]])));
  const feed: P3 = [0, R.y - 0.08, R.z + 0.50];
  P.add('turretDetail', box(0.12, 0.10, 0.14), ...feed);
  P.add('turretDark', beamBetween([0, R.y - R.height / 2 + 0.03, R.z + R.depth * 0.5 / 1.3], [feed[0], feed[1] - 0.04, feed[2]], 0.018, 8));
  P.add('turretDark', beamBetween([0.40, R.y - 0.30, R.z + 0.07], [0.05, feed[1] - 0.02, feed[2] - 0.05], 0.012, 6));
  P.add('turretDark', beamBetween([-0.40, R.y - 0.30, R.z + 0.07], [-0.05, feed[1] - 0.02, feed[2] - 0.05], 0.012, 6));
  P.topY = T.roofY + 0.05;
}

function pgz95Pods(P: TankBuilderPort): void {
  const G = PGZ95_GUNS, n = P.q ? 14 : 10;
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const x = s * G.podX, barrel = s < 0 ? 0 : 1;
      // the shaft through the turret boss (a body of revolution about the pitch axis) and the cradle's inner plate: the
      // guns hang open on its outer face (photograph 02)
      P.addGunExtra(cylX(0.075, 0.14, P.q ? 18 : 12), s * 0.885, 0, 0);
      P.addGunExtra(box(0.045, 0.66, 1.04), s * 0.972, 0.02, 0.17);
      // the two receivers with their feed covers and cocking housings, the feed block between them
      for (const y of G.boreY) {
        P.addGunExtraDark(box(0.18, 0.19, G.receiverFrontZ - G.receiverRearZ), x, y, (G.receiverFrontZ + G.receiverRearZ) / 2);
        P.addGunExtraDark(box(0.08, 0.05, 0.30), x, y + Math.sign(y) * 0.115, 0.30);
        P.addGunExtraDark(box(0.035, 0.09, 0.42), x + s * 0.105, y, 0.05);
      }
      P.addGunExtraDark(box(0.12, 0.17, 0.60), x, 0, 0.12);
      // barrels, jackets, flash hiders, the midway clamp: one recoil group a side (fire axis on the upper bore)
      for (const y of G.boreY) {
        P.add(`gunBarrel${barrel}`, cylZ(G.jacketR, G.jacketFrontZ - G.receiverFrontZ + 0.02, n), x, y, (G.jacketFrontZ + G.receiverFrontZ) / 2 - 0.01);
        P.add(`gunBarrel${barrel}`, cylZ(G.barrelR, G.brakeRearZ - G.jacketFrontZ + 0.04, n), x, y, (G.brakeRearZ + G.jacketFrontZ) / 2);
        P.add(`gunBarrel${barrel}Dark`, cylZ(G.brakeR, G.muzzleZ - G.brakeRearZ, n), x, y, (G.muzzleZ + G.brakeRearZ) / 2);
        P.add(`gunBarrel${barrel}`, cylZ(0.036, 0.06, n), x, y, 1.30);
        // the gas cylinder under the barrel's root
        P.add(`gunBarrel${barrel}Dark`, cylZ(0.017, 0.48, 8), x, y - 0.040, G.receiverFrontZ + 0.24);
      }
      // the lower bore's mouth (the upper one is the fire axis, whose bore the factory seats)
      P.add(`gunBarrel${barrel}Dark`, cylZ(0.014, 0.012, 8), x, G.boreY[1], G.muzzleZ + 0.004);
      P.add(`gunBarrel${barrel}`, box(0.05, 0.30, 0.07), x, 0, 1.30);
    }
  }, 'gun', 10);
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const x = s * G.tubeX;
      for (const y of G.tubeY) qw2Tube(P, x, y);
      // the clamp bands: the rear one stands on the upper receiver, the front one ties the tubes under the caps
      P.add('gunMountDark', box(0.12, 0.37, 0.06), x, 0.435, 0.30);
      P.add('gunMountDark', box(0.12, 0.28, 0.05), x, (G.tubeY[0] + G.tubeY[1]) / 2, 1.10);
    }
  }, 'missileRack', 10);
  P.turretG.userData.launcherTubes = PGZ95_LAUNCHER_MUZZLES.length;
  P.muzzleZ = G.muzzleZ;
}

function buildPgz95(P: TankBuilderPort): void {
  const L = PGZ95_LAYOUT;
  buildPgz95Chassis(P);
  P.turretG.position.set(...L.turretPivot);
  P.gunG.position.set(...L.gunPivot);
  pgz95Turret(P);
  pgz95Pods(P);
}

// ------------------------------------------------------------------------------------------------------- PGZ-09 --
function pgz09Turret(P: TankBuilderPort): void {
  const L = PGZ09_LAYOUT, T = L.turret, TR = L.trackingRadar, SR = L.searchRadar;
  const n = P.q ? 36 : 20;
  P.add('turret', cylY(1.02, 1.04, 0.10, n), 0, 0.03, 0);
  // the lower band: its faces lean out from the ring to the belt line, the chin raked forward under the front column
  P.add('turret', convexBody(mirrored([
    [T.baseHalf, 0.02, T.rearZ + 0.08], [T.baseHalf, 0.02, T.baseFrontZ],
    [T.bodyHalf, T.beltY, T.rearZ], [T.bodyHalf, T.beltY, T.beltFrontZ],
  ])));
  // the upper body: vertical sides, the roof's edge chamfers, the front face between the guns
  P.add('turret', convexBody(mirrored([
    [T.bodyHalf, T.beltY - 0.02, T.rearZ], [T.bodyHalf, T.shoulderY, T.rearZ], [T.roofHalf, T.roofY, T.rearZ + 0.04],
    [T.bodyHalf, T.beltY - 0.02, T.frontZ], [T.bodyHalf, T.shoulderY, T.frontZ], [T.roofHalf, T.roofY, T.frontZ - 0.10],
  ])));
  // the front column under the EO head, and the head with its round lens, window and laser warning plate
  P.add('turret', convexBody(mirrored([[0.34, T.beltY - 0.02, 1.18], [0.34, T.beltY - 0.02, 1.74], [0.34, 1.06, 1.18],
    [0.32, 1.06, 1.70]])));
  P.addModuleVisual('optics', 'turret', convexBody(mirrored([[0.25, 1.04, 1.26], [0.25, 1.04, 1.74], [0.24, 1.31, 1.28],
    [0.24, 1.31, 1.70]])));
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.075, 0.012, P.q ? 18 : 12), 0.10, 1.17, 1.733);
  P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.09, 0.012), -0.12, 1.17, 1.736);
  P.add('turretDetail', box(0.10, 0.06, 0.012), -0.12, 1.265, 1.712);
  // the tracking radar's round antenna on its stalk at the front
  P.add('turretDark', cylZ(0.09, TR.z - 1.74 - 0.02, P.q ? 14 : 10), 0, TR.y, (TR.z + 1.74) / 2 - 0.02);
  const dome = KIT.lathe([[0, -0.05], [0.24, -0.05], [TR.r, -0.03], [TR.r, -0.01], [0.27, 0.02], [0.21, 0.058],
    [0.12, 0.088], [0, 0.10]], P.q ? 28 : 16).rotateX(Math.PI / 2);
  P.add('turretDetail', dome, 0, TR.y, TR.z + 0.02);
  // the trunnion bosses on the upper sides
  for (const s of [-1, 1]) P.add('turret', cylX(0.16, 0.03, P.q ? 20 : 12), s * (T.bodyHalf + 0.005), L.gunPivot[1], L.gunPivot[2]);
  // three smoke dischargers on each side of the band, fired forward and up
  for (const s of [-1, 1]) for (const z of [0.15, 0.40, 0.65]) {
    P.add('turretDetail', cylZ(0.04, 0.22, 10), s * 0.965, 0.27, z, -0.62, 0, 0);
  }
  // roof: two hatches, the gunner's periscope, the folded search antenna on its pedestal, the rear sight box
  for (const s of [-1, 1]) {
    P.addHatch('turret', cylY(0.26, 0.26, 0.035, P.q ? 22 : 14), s * 0.46, T.roofY + 0.012, 0.30);
    P.add('turretDark', KIT.torus(0.26, 0.010, P.q ? 22 : 14, 4), s * 0.46, T.roofY + 0.03, 0.30);
  }
  P.addModuleVisual('optics', 'turretDetail', box(0.15, 0.09, 0.12), -0.46, T.roofY + 0.045, 0.72);
  P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.035, 0.012), -0.46, T.roofY + 0.05, 0.782);
  P.add('turretDetail', cylY(0.26, 0.30, SR.topY - SR.thick - T.roofY + 0.02, P.q ? 20 : 12), 0, (SR.topY - SR.thick + T.roofY) / 2 - 0.01, SR.z);
  P.add('turretDetail', box(SR.width, SR.thick, SR.depth), 0, SR.topY - SR.thick / 2, SR.z);
  P.add('turretDark', box(SR.width - 0.08, 0.012, SR.depth - 0.08), 0, SR.topY + 0.004, SR.z);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.08, 0.10, 0.16), s * 0.40, SR.topY - SR.thick - 0.04, SR.z - SR.depth / 2 + 0.10);
  P.add('turret', convexBody([[-0.70, T.roofY - 0.02, -1.62], [-0.22, T.roofY - 0.02, -1.62], [-0.70, T.roofY - 0.02, -1.20],
    [-0.22, T.roofY - 0.02, -1.20], [-0.68, T.roofY + 0.30, -1.58], [-0.24, T.roofY + 0.30, -1.58], [-0.68, T.roofY + 0.30, -1.24],
    [-0.24, T.roofY + 0.30, -1.24]]));
  P.add('turretGlass', box(0.30, 0.10, 0.012), -0.46, T.roofY + 0.18, -1.226);
  // the rear wall's loading door with its hinges and the lifting lugs at the rear corners (photograph 02)
  P.add('turretDetail', box(0.90, 0.56, 0.02), 0, 0.80, T.rearZ - 0.008);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.06, 0.10, 0.05), s * 0.47, 0.80, T.rearZ - 0.02);
    P.add('turretDark', box(0.05, 0.10, 0.10), s * 0.92, T.shoulderY + 0.09, T.rearZ + 0.06);
  }
  P.add('turretDark', cylY(0.04, 0.05, 0.06, 10), 0.80, T.roofY + 0.03, -1.55);
  P.topY = T.roofY + 0.05;
}

function pgz09Guns(P: TankBuilderPort): void {
  const G = PGZ09_GUNS, n = P.q ? 16 : 10;
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const x = s * G.gunX, barrel = s < 0 ? 0 : 1;
      // the trunnion shaft from the boss into the housing (a body of revolution about the pitch axis)
      P.addGunExtra(cylX(0.10, 0.12, P.q ? 18 : 12), s * 1.03, 0, 0);
      // the wedge-shaped armoured housing over the receiver: deep at the front, its underside rising to the rear
      P.addGunExtra(convexBody([
        [s * G.housingInner, G.housingTopY, G.housingRearZ], [s * G.housingInner, G.housingTopY, G.housingFrontZ],
        [s * G.housingInner, G.housingBottomY, G.housingFrontZ], [s * G.housingInner, G.housingRearBottomY, G.housingRearZ],
        [s * G.housingOuter, G.housingTopY - 0.08, G.housingRearZ + 0.06], [s * G.housingOuter, G.housingTopY - 0.08, G.housingFrontZ - 0.07],
        [s * G.housingOuter, G.housingBottomY + 0.08, G.housingFrontZ - 0.05], [s * G.housingOuter, G.housingRearBottomY + 0.02, G.housingRearZ + 0.06],
      ]));
      P.addGunExtraDark(box(0.24, 0.012, 0.50), x, G.housingTopY + 0.004, -0.05);
      P.addGunExtra(cylZ(G.collarR, G.collarFrontZ - G.housingFrontZ + 0.03, n), x, 0, (G.collarFrontZ + G.housingFrontZ) / 2 - 0.015);
      // the barrel, sliding back into the collar, and the muzzle booster with its velocity-measuring ring
      P.add(`gunBarrel${barrel}`, cylZ(G.barrelR, G.brakeRearZ - 0.56 + 0.03, n), x, 0, (G.brakeRearZ + 0.56) / 2 + 0.015);
      P.add(`gunBarrel${barrel}`, cylZ(0.058, 0.50, n), x, 0, 0.92);
      P.add(`gunBarrel${barrel}Dark`, cylZ(G.brakeR, G.muzzleZ - G.brakeRearZ, n), x, 0, (G.muzzleZ + G.brakeRearZ) / 2);
      P.add(`gunBarrel${barrel}Dark`, cylZ(0.088, 0.10, n), x, 0, G.brakeRearZ + 0.10);
    }
  }, 'gun', 10);
  P.muzzleZ = G.muzzleZ;
}

function buildPgz09(P: TankBuilderPort): void {
  const L = PGZ09_LAYOUT;
  buildPgz09Chassis(P);
  P.turretG.position.set(...L.turretPivot);
  P.gunG.position.set(...L.gunPivot);
  pgz09Turret(P);
  pgz09Guns(P);
}

export const CHINESE_AIR_DEFENSE_PROFILES = {
  pgz95: { build: buildPgz95 },
  pgz09: { build: buildPgz09 },
} as const;
