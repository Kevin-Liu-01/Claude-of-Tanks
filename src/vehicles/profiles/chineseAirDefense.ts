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
 * The CLC-1's shovel reflector facing +z (concave forward), `thick` deep: a straight top edge, its sides curving in to a
 * rounded, narrower bottom, curved about a vertical axis only (fix round 1, both critics: "a wide, singly curved,
 * shovel-like reflector"). The front and back sheets are smooth, the rim is flat-faced.
 */
function reflectorShell(width: number, height: number, depth: number, thick: number, nu: number, nv: number,
  taper = 0.38, arch = 0): THREE.BufferGeometry {
  const at = (i: number, j: number): [number, number, number] => {
    const u = -1 + 2 * i / nu, v = -1 + 2 * j / nv;
    // full width over the upper half; below it the outline rounds in to (1 - taper) of the width at the bottom edge;
    // the top edge one arc, `arch` of the half-height higher at the middle than at the corners (fix round 2)
    const narrow = v < 0 ? 1 - taper + taper * Math.sqrt(1 - v * v) : 1;
    const x = width / 2 * u * narrow;
    const y = height / 2 * v * (v > 0 ? 1 + arch * (1 - u * u) : 1);
    return [x, y, depth * (2 * x / width) ** 2];
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
  P.add('gunMount', box(G.capSize, G.capSize, G.launchZ - G.headRearZ), x, y, (G.launchZ + G.headRearZ) / 2);
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
  // the trunnion brackets standing on the side walls up past the roof edge, the pods' shafts turning in their bearings
  // (fix round 1, critic B: "the barrel roots sit on tall frames above the turret roof")
  const [, gy, gz] = L.gunPivot;
  for (const s of [-1, 1]) {
    P.add('turret', convexBody([[0.80, 0.52, gz - 0.24], [0.90, 0.52, gz - 0.24], [0.80, 0.52, gz + 0.24], [0.90, 0.52, gz + 0.24],
      [0.70, gy + 0.14, gz - 0.15], [0.90, gy + 0.14, gz - 0.15], [0.70, gy + 0.14, gz + 0.15], [0.90, gy + 0.14, gz + 0.15]]
      .map(([x, y, z]) => [s * x, y, z] as P3)));
    P.add('turretDark', cylX(0.12, 0.03, P.q ? 20 : 12), s * 0.905, gy, gz);
  }
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
  // the inset access doors in both flanks with their hinges (fix round 2, both A/B critics, photograph 02)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.016, 0.46, 0.50), s * (T.sideX + 0.006), 0.32, 0.10);
    P.add('turretDark', box(0.012, 0.40, 0.44), s * (T.sideX + 0.016), 0.32, 0.10);
    for (const y of [0.16, 0.48]) P.add('turretDark', box(0.03, 0.06, 0.08), s * (T.sideX + 0.02), y, -0.17);
  }
  // four smoke grenade launchers at each front corner, on a foot plate, fired forward and up (Army Technology)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.34, 0.04, 0.17), s * 0.765, 0.06, 1.01);
    for (let k = 0; k < 4; k++) {
      P.add('turretDetail', cylZ(0.036, 0.22, 10), s * (0.645 + k * 0.083), 0.15, 1.04, -0.45, 0, 0);
    }
  }
  // roof: the gunner's hatch and periscope, the flat grey cover plate on the front left (photographs 01-02), the antenna
  // base
  P.addHatch('turret', cylY(0.25, 0.25, 0.035, P.q ? 22 : 14), -0.32, T.roofY + 0.012, -0.05);
  P.add('turretDark', KIT.torus(0.25, 0.010, P.q ? 22 : 14, 4), -0.32, T.roofY + 0.03, -0.05);
  P.addModuleVisual('optics', 'turretDetail', box(0.15, 0.08, 0.11), -0.32, T.roofY + 0.04, 0.38);
  P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.03, 0.012), -0.32, T.roofY + 0.05, 0.437);
  P.add('turretDetail', box(0.54, 0.024, 0.48), 0.42, T.roofY + 0.008, 0.26);
  // the large box bolted on the rear left of the roof, a quarter of the turret's width, with its lid seam and the antenna
  // base on it (fix round 2, both A/B critics, photograph 02)
  P.add('turret', convexBody([-1.14, -0.72].flatMap((z) => [[0.40, T.roofY - 0.02, z], [T.roofHalf, T.roofY - 0.02, z],
    [0.82, 0.775, z]] as P3[]).concat([[0.42, T.roofY + 0.24, -1.12], [0.78, T.roofY + 0.24, -1.12], [0.42, T.roofY + 0.24, -0.74],
    [0.78, T.roofY + 0.24, -0.74]])));
  P.add('turretDark', box(0.38, 0.012, 0.012), 0.60, T.roofY + 0.20, -0.733);
  P.add('turretDark', cylY(0.04, 0.05, 0.06, 10), 0.66, T.roofY + 0.27, -1.00);
  // the CLC-1 search antenna on its short pedestal: the turntable housing, the column, the yoke, the reflector tilted
  // back on its back frame, the feed on its strut
  const mz = R.mastZ;
  P.add('turret', convexBody(mirrored([[0.26, T.roofY - 0.02, mz - 0.24], [0.26, T.roofY - 0.02, mz + 0.24],
    [0.22, T.roofY + 0.15, mz - 0.22], [0.22, T.roofY + 0.15, mz + 0.20]])));
  P.add('turretDark', cylY(0.19, 0.19, 0.04, P.q ? 20 : 12), 0, T.roofY + 0.17, mz);
  P.add('turretDetail', cylY(0.12, 0.14, R.pedestalTopY - T.roofY - 0.18, P.q ? 16 : 10), 0, (R.pedestalTopY + T.roofY + 0.18) / 2, mz);
  P.add('turretDetail', box(0.46, 0.12, 0.26), 0, R.pedestalTopY + 0.04, mz);
  // the reflector's own frame: tilted back by R.tilt about its centre
  const onDish = (geometry: THREE.BufferGeometry): THREE.BufferGeometry =>
    geometry.rotateX(-R.tilt).translate(R.x, R.y, R.z);
  P.add('turretDetail', onDish(reflectorShell(R.width, R.height, R.depth, R.thick, P.q ? 16 : 10, P.q ? 8 : 5, 0.38, R.arch)));
  // the back frame: its flat front 1.5 cm into the sheet's back (curved about the vertical only), down onto the yoke
  const frameBottom = new THREE.Vector3(0, -R.height / 2 - 0.12, -0.10).applyAxisAngle(new THREE.Vector3(1, 0, 0), -R.tilt)
    .add(new THREE.Vector3(R.x, R.y, R.z));
  P.add('turretDetail', onDish(convexBody(mirrored([[0.13, -R.height / 2 - 0.12, -0.17], [0.13, -R.height / 2 - 0.12, -R.thick + 0.02],
    [0.13, 0.08, -0.17], [0.13, 0.08, -R.thick + 0.02]]))));
  if (Math.abs(frameBottom.z - mz) > 0.12 || frameBottom.y > R.pedestalTopY + 0.10) {
    throw new Error('PGZ-95 radar: the reflector frame no longer stands on the yoke');
  }
  const feed = new THREE.Vector3(0, -0.04, 0.46);
  P.add('turretDetail', onDish(box(0.12, 0.10, 0.14).translate(feed.x, feed.y, feed.z)));
  P.add('turretDark', onDish(beamBetween([0, -R.height / 2 + 0.03, 0.005], [0, feed.y - 0.05, feed.z - 0.03], 0.018, 8)));
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
      P.addGunExtra(box(0.045, 0.66, 1.24), s * 0.972, 0.02, 0);
      // the two receivers with their feed covers and cocking housings, the feed block between them
      for (const y of G.boreY) {
        P.addGunExtraDark(box(0.18, 0.19, G.receiverFrontZ - G.receiverRearZ), x, y, (G.receiverFrontZ + G.receiverRearZ) / 2);
        P.addGunExtraDark(box(0.08, 0.05, 0.36), x, y + Math.sign(y) * 0.115, 0.20);
        P.addGunExtraDark(box(0.035, 0.09, 0.50), x + s * 0.105, y, -0.15);
      }
      P.addGunExtraDark(box(0.12, 0.17, 0.90), x, 0, -0.05);
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
      // the clamp bands standing on the upper receiver under the tubes, fore and aft
      for (const z of [-0.40, 0.30]) P.add('gunMountDark', box(0.12, 0.37, 0.06), x, 0.435, z);
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
  // the round drum from the ring to beltY, set back under the overhanging upper body (fix round 2, both A/B critics,
  // photographs 01 and 03), on its race collar
  P.add('turret', cylY(T.drumR + 0.03, T.drumR + 0.05, 0.08, n), 0, 0.02, 0);
  P.add('turret', cylY(T.drumR, T.drumR, T.beltY, n), 0, T.beltY / 2, 0);
  // behind the drum the base runs on under the rear of the upper body as a low block, set in 0.12 m (photograph 02's
  // lower band reaches the turret's rear)
  P.add('turret', convexBody(mirrored([[0.82, 0.02, T.rearZ + 0.14], [0.82, 0.02, 0], [0.86, T.beltY, T.rearZ + 0.10],
    [0.86, T.beltY, 0]])));
  // the upper body to the front part's roof, the front face between the guns
  P.add('turret', convexBody(mirrored([
    [T.bodyHalf, T.beltY - 0.02, T.rearZ], [T.bodyHalf, T.frontRoofY - 0.05, T.rearZ], [T.bodyHalf - 0.06, T.frontRoofY, T.rearZ],
    [T.bodyHalf, T.beltY - 0.02, T.frontZ], [T.bodyHalf, T.frontRoofY - 0.05, T.frontZ], [T.bodyHalf - 0.06, T.frontRoofY, T.frontZ - 0.05],
  ])));
  // its rear part standing up to the roof between the gun housings' tops, stepped down at stepZ to the front part
  // (photograph 02's silhouette: 1.27 m over the ring behind, 1.06 m in front)
  P.add('turret', convexBody(mirrored([
    [T.bodyHalf - 0.005, T.frontRoofY - 0.02, T.rearZ + 0.005], [T.bodyHalf - 0.005, T.shoulderY, T.rearZ + 0.005],
    [T.roofHalf, T.roofY, T.rearZ + 0.04],
    [T.bodyHalf - 0.005, T.frontRoofY - 0.02, T.stepZ], [T.bodyHalf - 0.005, T.shoulderY, T.stepZ], [T.roofHalf, T.roofY, T.stepZ - 0.04],
  ])));
  // the front column under the EO head, and the head with its round lens, window and laser warning plate
  P.add('turret', convexBody(mirrored([[0.34, T.beltY - 0.02, 1.18], [0.34, T.beltY - 0.02, T.columnFrontZ], [0.34, T.frontRoofY, 1.18],
    [0.32, T.frontRoofY, 1.70]])));
  // the EO head (enlarged, fix round 2): the upper box with the round lens and the laser warning plate, the sensor box
  // with its window under its front (photograph 02)
  P.addModuleVisual('optics', 'turret', convexBody(mirrored([[0.29, T.frontRoofY - 0.04, 1.22], [0.29, T.frontRoofY - 0.04, 1.74],
    [0.28, 1.24, 1.24], [0.28, 1.24, 1.70]])));
  P.addModuleVisual('optics', 'turretGlass', cylZ(0.07, 0.012, P.q ? 18 : 12), 0.12, 1.12, 1.723);
  P.add('turretDetail', box(0.12, 0.06, 0.012), -0.14, 1.17, 1.718);
  P.addModuleVisual('optics', 'turret', box(0.34, 0.22, 0.28), -0.05, 0.92, 1.62);
  P.addModuleVisual('optics', 'turretGlass', box(0.16, 0.10, 0.012), -0.07, 0.92, 1.766);
  // the tracking radar's round antenna on its stalk at the front: 0.60 m across, 0.26 m deep (fix round 1)
  const domeBack = TR.z - 0.07;
  P.add('turretDark', cylZ(0.09, domeBack - T.columnFrontZ + 0.03, P.q ? 14 : 10), 0, TR.y, (domeBack + T.columnFrontZ) / 2 - 0.005);
  const dome = KIT.lathe([[0, -0.07], [0.25, -0.07], [TR.r, -0.04], [TR.r, -0.01], [0.28, 0.04], [0.22, 0.11],
    [0.13, 0.16], [0, 0.19]], P.q ? 28 : 16).rotateX(Math.PI / 2);
  P.add('turretDetail', dome, 0, TR.y, TR.z);
  // the trunnion bosses on the upper sides
  for (const s of [-1, 1]) P.add('turret', cylX(0.16, 0.02, P.q ? 20 : 12), s * (T.bodyHalf + 0.005), L.gunPivot[1], L.gunPivot[2]);
  // three smoke dischargers a side in a mounting block on the drum's flank, filling the space up to the upper body's
  // overhang (photograph 02: under the housing's front), fired forward and up; the block stays inside the housing's
  // sweep (x 1.02 outward)
  for (const s of [-1, 1]) {
    P.add('turret', convexBody([[0.80, 0.12, -0.25], [0.97, 0.12, -0.25], [0.80, 0.12, 0.25], [0.97, 0.12, 0.25],
      [0.80, T.beltY, -0.25], [0.97, T.beltY, -0.25], [0.80, T.beltY, 0.25], [0.97, T.beltY, 0.25]]
      .map(([x, y, z]) => [s * x, y, z] as P3)));
    for (const [x, y] of [[0.845, 0.175], [0.925, 0.175], [0.885, 0.245]]) {
      P.add('turretDetail', cylZ(0.037, 0.20, 10), s * x, y, 0.22, -0.55, 0, 0);
    }
  }
  // roof: two hatches on the rear part, the gunner's periscope on the front part, the rear sight box, the folded search
  // antenna lying fore and aft on its stepped pedestal (fix round 1, both critics: a 0.26 m deep box, its long side
  // fore-aft, its rear edge 0.4 m ahead of the turret's rear face)
  for (const s of [-1, 1]) {
    P.addHatch('turret', cylY(0.25, 0.25, 0.035, P.q ? 22 : 14), s * 0.45, T.roofY + 0.012, 0.25);
    P.add('turretDark', KIT.torus(0.25, 0.010, P.q ? 22 : 14, 4), s * 0.45, T.roofY + 0.03, 0.25);
  }
  P.addModuleVisual('optics', 'turretDetail', box(0.15, 0.09, 0.12), -0.46, T.frontRoofY + 0.045, 0.95);
  P.addModuleVisual('optics', 'turretGlass', box(0.12, 0.035, 0.012), -0.46, T.frontRoofY + 0.05, 1.012);
  // the search array: a square-sided box with shallow transverse ribs on its top, carried on two short brackets that leave
  // a 0.10 m gap over the roof (fix round 2, both A/B critics, photographs 01-03)
  const antennaBottom = SR.topY - SR.thick;
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.10, SR.gap + 0.04, SR.depth - 0.20), s * 0.32, T.roofY + (SR.gap + 0.04) / 2 - 0.02, SR.z);
  }
  P.add('turretDetail', box(SR.width, SR.thick, SR.depth), 0, antennaBottom + SR.thick / 2, SR.z);
  for (let k = 0; k < 4; k++) {
    P.add('turretDark', box(SR.width - 0.08, 0.012, 0.035), 0, SR.topY + 0.004, SR.z - SR.depth / 2 + 0.13 + k * (SR.depth - 0.26) / 3);
  }
  P.add('turret', convexBody([[-0.56, T.roofY - 0.02, -1.42], [-0.12, T.roofY - 0.02, -1.42], [-0.56, T.roofY - 0.02, -1.00],
    [-0.12, T.roofY - 0.02, -1.00], [-0.54, T.roofY + 0.33, -1.40], [-0.14, T.roofY + 0.33, -1.40], [-0.54, T.roofY + 0.33, -1.03],
    [-0.14, T.roofY + 0.33, -1.03]]));
  P.add('turretGlass', box(0.28, 0.10, 0.012), -0.34, T.roofY + 0.20, -1.009);
  // the rear wall: the loading door, four hinge latches, the antenna base on its upper left corner; the lifting lugs
  P.add('turretDetail', box(0.90, 0.56, 0.02), 0, 0.76, T.rearZ - 0.008);
  for (const x of [-0.47, 0.47]) for (const y of [0.58, 0.94]) P.add('turretDark', box(0.06, 0.08, 0.05), x, y, T.rearZ - 0.02);
  P.add('turretDark', box(0.14, 0.14, 0.10), 0.74, 1.12, T.rearZ - 0.04);
  P.add('turretDark', cylY(0.035, 0.045, 0.12, 10), 0.74, 1.25, T.rearZ - 0.04);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.10, 0.10), s * 0.93, T.roofY - 0.01, T.rearZ + 0.08);
  P.topY = T.roofY + 0.05;
}

function pgz09Guns(P: TankBuilderPort): void {
  const G = PGZ09_GUNS, n = P.q ? 16 : 10;
  weaponAssembly(P, () => {
    for (const s of [-1, 1]) {
      const x = s * G.gunX, barrel = s < 0 ? 0 : 1;
      // the trunnion shaft from the boss into the housing (a body of revolution about the pitch axis)
      P.addGunExtra(cylX(0.10, 0.12, P.q ? 18 : 12), s * 1.00, 0, 0);
      // the tall angular armoured housing: its top the turret's rear roof (the shoulder), its front face deep, its
      // underside a wedge pointing down to the keel under the trunnion; the outer face bevelled at the top and front
      const inner = s * G.housingInner, outer = s * G.housingOuter;
      P.addGunExtra(convexBody([
        [inner, G.housingTopY, G.housingRearZ], [inner, G.housingTopY, G.housingFrontZ],
        [inner, G.housingFrontBottomY, G.housingFrontZ], [inner, G.housingKeelY, G.housingKeelZ],
        [inner, G.housingRearBottomY, G.housingRearZ],
        [outer, G.housingTopY - 0.07, G.housingRearZ + 0.04], [outer, G.housingTopY - 0.07, G.housingFrontZ - 0.06],
        [outer, G.housingFrontBottomY + 0.05, G.housingFrontZ - 0.04], [outer, G.housingKeelY + 0.05, G.housingKeelZ],
        [outer, G.housingRearBottomY + 0.03, G.housingRearZ + 0.04],
      ]));
      P.addGunExtraDark(box(0.26, 0.012, 0.62), (inner + outer) / 2, G.housingTopY + 0.004, -0.10);
      P.addGunExtra(cylZ(G.collarR, G.collarFrontZ - G.housingFrontZ + 0.03, n), x, 0, (G.collarFrontZ + G.housingFrontZ) / 2 - 0.015);
      // the barrel, sliding back into the collar, and the muzzle booster with its velocity-measuring ring
      const rootZ = G.housingFrontZ + 0.08;
      P.add(`gunBarrel${barrel}`, cylZ(G.barrelR, G.brakeRearZ - rootZ + 0.03, n), x, 0, (G.brakeRearZ + rootZ) / 2 + 0.015);
      P.add(`gunBarrel${barrel}`, cylZ(0.058, 0.50, n), x, 0, G.collarFrontZ + 0.24);
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
