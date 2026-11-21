// The Type 90 (B): the production Type 90 (type90X.ts) built ready for the Type 92 mine-clearing roller (267; owner
// 2026-10-31, "add a type 90 b esp with that awesome machine gun"; Main: the roller-ready Type 90, its kit the
// difference). The roller's 10 mm mounting plate covers the lower front plate with its six seats for the roller's push
// frames, and two hitch lugs on the glacis take its lift chains; the roller itself is not carried. A Type 90 built this
// way cannot take the dozer kit. The roof M2 is the Type 90's own (type90X.ts). First-party procedural geometry: Kevin B.
// Liu (NOTICE.md); photographs and sources in docs/references/photos/type90b-20261031.json.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { buildType90X, TYPE90_X_DATUMS } from './type90X.ts';
import { TYPE90B_ROLLER_PLATE } from '../type90bArmor.ts';
import { withSpareTrackRun } from '../spareTrackSeat.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylY } = KIT;

const { foot: FOOT, up: UP, out: OUT, lengthM: PLATE_LEN } = TYPE90B_ROLLER_PLATE;
const TILT = Math.atan2(UP[1], UP[0]);                          // a box's +Y along the plate, its +Z out of it

/** Hull [y, z] `s` metres up the lower front plate from its foot and `o` metres out of it. */
function onPlate(s: number, o: number): [number, number] {
  return [FOOT[0] + UP[0] * s + OUT[0] * o, FOOT[1] + UP[1] * s + OUT[1] * o];
}

function addRollerMounts(P: TankBuilderPort): void {
  const t = TYPE90B_ROLLER_PLATE.thicknessM, halfW = TYPE90B_ROLLER_PLATE.halfW;
  // the plate, bolted on 2 mm into the hull plate's face, with a raised rim round its edges and its bolt rows along the
  // top and bottom (the plate reads as its own slab over the hull plate, not a paint line)
  const [py, pz] = onPlate(PLATE_LEN / 2, t / 2 - 0.002);
  P.addEquipment('hullDetail', box(halfW * 2, PLATE_LEN - 0.02, t), 0, py, pz, TILT, 0, 0);
  for (const s of [0.02, PLATE_LEN - 0.02]) {
    const [ry, rz] = onPlate(s, t + 0.011);
    P.addEquipment('hullDetail', box(halfW * 2, 0.03, 0.022), 0, ry, rz, TILT, 0, 0);
    for (let i = 0; i < 9; i++) {
      const [by, bz] = onPlate(s, t + 0.025);
      P.addEquipment('hullDark', cylY(0.017, 0.017, 0.012, 8), -0.80 + i * 0.20, by, bz, TILT, 0, 0);
    }
  }
  for (const side of [-1, 1]) {
    const [ey, ez] = onPlate(PLATE_LEN / 2, t + 0.011);
    P.addEquipment('hullDetail', box(0.03, PLATE_LEN - 0.07, 0.022), side * (halfW - 0.015), ey, ez, TILT, 0, 0);
  }
  // the plate's lower edge in shadow under its rim (round 3: "the plate's raised rim hardly stands out")
  const [dy, dz] = onPlate(0.002, t + 0.004);
  P.addEquipment('hullDark', box(halfW * 2 + 0.01, 0.004, 0.03), 0, dy, dz, TILT, 0, 0);
  // six seats for the roller's push frames, three in front of each track (round 3: "deep, chunky clevis blocks with
  // pins"): a deep base block, the clevis's two cheeks with the shadowed slot between them, the pin through them and its
  // bosses on the cheeks' outer faces
  for (const side of [-1, 1]) {
    for (const x of [0.26, 0.50, 0.74]) {
      const sx = side * x, s = 0.12;
      const [ay, az] = onPlate(s, t + 0.03);
      P.addEquipment('hullDetail', box(0.22, 0.20, 0.06), sx, ay, az, TILT, 0, 0);
      const [ny, nz] = onPlate(s, t + 0.0605);
      P.addEquipment('hullDark', box(0.078, 0.18, 0.001), sx, ny, nz, TILT, 0, 0);
      for (const o of [-1, 1]) {
        const [cy, cz] = onPlate(s, t + 0.061 + 0.065);
        P.addEquipment('hullDetail', box(0.07, 0.20, 0.13), sx + o * 0.072, cy, cz, TILT, 0, 0);
        const [oy, oz] = onPlate(s, t + 0.061 + 0.09);
        P.addEquipment('hullDark', cylX(0.046, 0.016, 14), sx + o * 0.116, oy, oz);
      }
      const [qy, qz] = onPlate(s, t + 0.061 + 0.09);
      P.addEquipment('hullDark', cylX(0.03, 0.18, 12), sx, qy, qz);
    }
  }
  // the lift chains' anchor brackets on the glacis (its top falls 1.4677 -> 1.2751 from z 2.324 to 3.408), inboard of the
  // headlights. Round 4 (the photo critic: "chunky bracket assemblies, about 2.5 times that size: a block base, side
  // plates and a pin eye, standing proud of the glacis"; type90_with_type92_roller_front.jpg): a base block, two cheeks
  // and the pin through them with its bosses
  const glacisRake = Math.atan2(1.4677 - 1.2751, 3.408 - 2.324);
  for (const side of [-1, 1]) {
    const x = side * 0.66, z = 3.24, y = 1.4677 - (z - 2.324) * Math.tan(glacisRake);
    // (round 5: "small stirrups that look like the hull's tie-downs"; the photographs' anchors are heavy blocks)
    P.addEquipment('hullDetail', box(0.36, 0.06, 0.30), x, y + 0.025, z, glacisRake, 0, 0);
    for (const o of [-1, 1]) P.addEquipment('hullDetail', box(0.05, 0.26, 0.26), x + o * 0.13, y + 0.18, z, glacisRake, 0, 0);
    // (round 6: "thin goalposts": the eye block between the cheeks makes it one heavy anchor)
    P.addEquipment('hullDetail', box(0.16, 0.16, 0.20), x, y + 0.135, z, glacisRake, 0, 0);
    P.addEquipment('hullDark', cylX(0.04, 0.32, 12), x, y + 0.22, z + 0.01);
    for (const o of [-1, 1]) P.addEquipment('hullDetail', cylX(0.062, 0.018, 14), x + o * 0.164, y + 0.22, z + 0.01);
  }
}

// ---- the turret's breaching fit (owner 2026-11-20: "make the type 90b have a more more unique turret compared to the
// type 90"). The record has no real turret difference (the B's change is the roller's plate; no Type 90 carried a remote
// station), so the B's turret carries the field fit a roller tank plausibly would: the roller crew's deep bustle rack with
// its lift chains, shackle bins and tarp; a raised panoramic commander's head; the smoke banks boxed in; spare shoes hung
// on the flanks; and the lane-marker poles a breaching tank sets along its cleared lane. Gun, pivots and plates are the
// Type 90's. Points below are hull-frame; tt() seats them in the turret frame (the Type 90's pivot).
const PIVOT = TYPE90_X_DATUMS.turretPivot;
const ROOF = TYPE90_X_DATUMS.roofHeightM;

function tt(P: TankBuilderPort, slot: string, g: THREE.BufferGeometry, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0): void {
  P.addEquipment(slot, g, x - PIVOT[0], y - PIVOT[1], z - PIVOT[2], rx, ry, rz);
}

/** A bar from a to b (hull frame) in the given slot. */
function bar(P: TankBuilderPort, slot: string, a: readonly number[], b: readonly number[], r = 0.016): void {
  const start = new THREE.Vector3(a[0], a[1], a[2]), end = new THREE.Vector3(b[0], b[1], b[2]);
  const axis = end.clone().sub(start);
  const g = KIT.cylY(r, r, axis.length(), 8);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize()));
  const c = start.add(end).multiplyScalar(0.5);
  tt(P, slot, g, c.x, c.y, c.z);
}

/** The turret flank's vertical face |x| at hull z (type90X.ts turretArmor rows: left is -x). */
function flankX(side: number, z: number): number {
  const rows: [number, number, number][] = [[-2.007733, 1.229805, 1.114095], [-1.47, 1.262868, 1.152498],
    [-0.927, 1.296256, 1.191278], [0.157, 1.313827, 1.219205], [1.241, 1.313827, 1.219205]];
  const k = side < 0 ? 1 : 2;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1]!, b = rows[i]!;
    if (z <= b[0]) return a[k] + (b[k] - a[k]) * Math.max(0, (z - a[0]) / (b[0] - a[0]));
  }
  return rows[rows.length - 1]![k];
}

/** The roller crew's rack in the basket's place: deeper, taller, wrapped onto both rear flanks. */
function addBustleRack(P: TankBuilderPort): void {
  const front = -2.008, rear = -2.80, left = -1.30, right = 1.19, floor = 1.90, rails = [2.03, 2.19, 2.38];
  // the floor tray, inclined like the Type 90's, on two cross bearers
  tt(P, 'turretDetail', box(right - left - 0.04, 0.025, front - rear - 0.04), (left + right) / 2, floor, (front + rear) / 2);
  for (const z of [-2.25, -2.62]) bar(P, 'turretDark', [left, floor - 0.03, z], [right, floor - 0.03, z], 0.018);
  // three courses round the back and both sides, posts at every 0.30 m and the corners
  for (const y of rails) {
    bar(P, 'turretOpenLattice', [left, y, rear], [right, y, rear], 0.02);
    for (const x of [left, right]) bar(P, 'turretOpenLattice', [x, y, rear], [x, y, front], 0.02);
  }
  for (let x = left; x <= right + 1e-6; x += (right - left) / 8) bar(P, 'turretOpenLattice', [x, floor, rear], [x, rails[2]!, rear], 0.018);
  for (const x of [left, right]) for (const z of [-2.27, -2.54]) bar(P, 'turretOpenLattice', [x, floor, z], [x, rails[2]!, z], 0.018);
  // the mesh back: a fine vertical grille behind the posts
  for (let i = 0; i <= 24; i++) {
    const x = left + 0.05 + i * (right - left - 0.10) / 24;
    bar(P, 'turretOpenLatticeDark', [x, floor + 0.02, rear + 0.012], [x, rails[2]! - 0.01, rear + 0.012], 0.005);
  }
  for (const y of [2.11, 2.28]) bar(P, 'turretOpenLatticeDark', [left, y, rear + 0.012], [right, y, rear + 0.012], 0.005);
  // the wrap: a side bin on each rear flank, from the rack forward to behind the smoke housing
  for (const side of [-1, 1]) {
    const z0 = -1.42, z1 = front - 0.01, xi = side * (flankX(side, (z0 + z1) / 2) + 0.03), w = 0.22;
    const xc = xi + side * w / 2, zc = (z0 + z1) / 2, d = z1 - z0;
    tt(P, 'turretDetail', box(w, 0.025, -d), xc, 1.92, zc);
    tt(P, 'turretDetail', box(0.02, 0.30, -d), xi + side * w, 2.06, zc);           // outer wall
    for (const z of [z0, z1]) tt(P, 'turretDetail', box(w, 0.30, 0.02), xc, 2.06, z);
    tt(P, 'turretCloth', box(w - 0.02, 0.06, -d - 0.02), xc, 2.24, zc);              // the stowed tarp sack's top in the bin
    for (const z of [zc - d / 4, zc + d / 4]) tt(P, 'turretDark', box(w + 0.03, 0.012, 0.035), xc, 2.265, z);  // its straps
  }
  // the tarp roll strapped across the rack's top course
  tt(P, 'turretCloth', KIT.cylX(0.13, right - left - 0.10, P.q ? 18 : 10), (left + right) / 2, rails[2]! + 0.10, -2.62);
  for (const x of [left + 0.35, (left + right) / 2, right - 0.35]) {
    const strap = new THREE.TorusGeometry(0.135, 0.008, 6, 18); strap.rotateY(Math.PI / 2);
    tt(P, 'turretDark', strap, x, rails[2]! + 0.10, -2.62);
  }
  // two shackle and pin bins on the floor
  for (const x of [-0.70, 0.30]) {
    tt(P, 'turretDetail', box(0.46, 0.22, 0.32), x, floor + 0.12, -2.30);
    tt(P, 'turretDark', box(0.47, 0.014, 0.33), x, floor + 0.235, -2.30);           // lid seam
    tt(P, 'turretDark', box(0.10, 0.03, 0.02), x, floor + 0.20, -2.30 + 0.17);       // latch
  }
  // the roller's two lift chains, hung in a sag over the rear course (the pair the glacis lugs take)
  for (const x0 of [-0.95, 0.55]) {
    const n = 13, span = 0.52;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), x = x0 + t * span, sag = 0.16 * 4 * t * (1 - t);
      const link = new THREE.TorusGeometry(0.032, 0.009, 6, P.q ? 12 : 8);
      link.scale(1.35, 1, 1);
      if (i % 2) link.rotateX(Math.PI / 2);
      tt(P, 'turretDark', link, x, rails[2]! - 0.02 - sag, rear - 0.035);
    }
  }
}

/** A raised, stabilised panoramic head in place of the Type 90's commander's sight. */
function addPanoramicSight(P: TankBuilderPort): void {
  // 6 cm ahead of the stock sight's seat, so the head clears the commander's cupola dome
  const x = -0.494031, z = 0.61704;
  tt(P, 'turretDetail', box(0.25, 0.15, 0.25), x, ROOF + 0.075, z);                // armoured pedestal
  tt(P, 'turretDark', KIT.cylY(0.15, 0.15, 0.035, 24), x, ROOF + 0.168, z);        // traverse ring
  tt(P, 'turretDetail', box(0.42, 0.20, 0.36), x, ROOF + 0.285, z);                // the head
  // the hood leaning over the window, and the head's chamfered rear
  const hood = box(0.45, 0.03, 0.44); tt(P, 'turretDetail', hood, x, ROOF + 0.398, z + 0.03, -0.10, 0, 0);
  tt(P, 'turretDetail', box(0.40, 0.11, 0.06), x, ROOF + 0.24, z - 0.205, 0.45, 0, 0);
  // day and thermal windows side by side on its face, a wiper bar over them
  tt(P, 'turretGlass', box(0.20, 0.11, 0.006), x - 0.08, ROOF + 0.30, z + 0.183);
  tt(P, 'turretGlass', box(0.11, 0.11, 0.006), x + 0.125, ROOF + 0.30, z + 0.183);
  tt(P, 'turretDark', box(0.40, 0.018, 0.03), x, ROOF + 0.37, z + 0.19);
  tt(P, 'turretDark', box(0.02, 0.13, 0.012), x + 0.055, ROOF + 0.30, z + 0.186);  // the mullion
}

/** The Type 90's smoke banks in open-topped armoured boxes on the shoulders. */
function addSmokeHousings(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    const tubeX = side < 0 ? -1.387471 : 1.28236, outer = tubeX + side * 0.095;
    const z0 = -1.33, z1 = -0.48, y0 = 2.02, y1 = 2.34, zc = (z0 + z1) / 2;
    tt(P, 'turretDetail', box(0.025, y1 - y0, z1 - z0), outer, (y0 + y1) / 2, zc);   // outer wall
    tt(P, 'turretDetail', box(0.035, 0.02, z1 - z0 + 0.02), outer, y1 + 0.01, zc);   // its rolled top lip
    const inner = side * (flankX(side, zc) + 0.005), xm = (outer + inner) / 2, w = Math.abs(outer - inner);
    for (const z of [z0, z1]) tt(P, 'turretDetail', box(w, y1 - y0, 0.025), xm, (y0 + y1) / 2, z);
    for (const z of [zc - 0.25, zc + 0.25]) tt(P, 'turretDark', KIT.cylX(0.016, 0.02, 8), outer + side * 0.02, y0 + 0.05, z);  // bolts
  }
}

/** Spare track shoes hung on rails along both turret flanks, ahead of the smoke housings. */
function addFlankShoes(P: TankBuilderPort): void {
  const zs = [-0.30, -0.11, 0.08, 0.27, 0.46, 0.65];
  for (const side of [-1, 1]) {
    // VEH-13: each shoe is bolted flush to the flank, its connectors as the brackets, and is one registered run
    // (spareTrackSeat.ts) laid out with its local +Y out of the flank, so it seats where it is drawn
    for (const z of zs) withSpareTrackRun(P, { site: 'type90b-flank-shoe', source: 'adhoc', rotation: [0, 0, -side * Math.PI / 2] }, (R) => {
      const x = side * (flankX(side, z) + 0.034);
      tt(R, 'turretTrack', box(0.065, 0.52, 0.155), x, 2.03, z);                     // the shoe on edge, its pad outboard
      tt(R, 'turretTrack', box(0.03, 0.08, 0.06), x + side * 0.045, 2.03, z);        // the guide horn
      for (const y of [1.79, 2.27]) tt(R, 'turretDark', box(0.075, 0.04, 0.17), x, y, z);  // the end connectors, bolted on
      tt(R, 'turretDark', box(0.012, 0.36, 0.10), x + side * 0.034, 2.03, z);        // the rubber pad's face
    });
  }
}

/** The breach-lane marker poles in a tube holder on the rack's left rear corner. */
function addLaneMarkers(P: TankBuilderPort): void {
  const x0 = -1.20, z0 = -2.70;
  tt(P, 'turretDetail', box(0.18, 0.36, 0.18), x0, 2.08, z0);                      // the holder
  for (const [dx, dz, h] of [[-0.045, -0.045, 1.25], [0.045, -0.045, 1.10], [-0.045, 0.045, 1.05], [0.045, 0.045, 1.18]] as const) {
    const x = x0 + dx, z = z0 + dz;
    tt(P, 'turretDark', KIT.cylY(0.011, 0.011, h, 6), x, 2.26 + h / 2, z);
    tt(P, 'turretCloth', box(0.004, 0.13, 0.20), x, 2.26 + h - 0.08, z - 0.10);     // its flag
  }
}

export function buildType90B(P: TankBuilderPort): void {
  buildType90X(P, { basket: false, commanderSight: false });
  addRollerMounts(P);
  addBustleRack(P);
  addPanoramicSight(P);
  addSmokeHousings(P);
  addFlankShoes(P);
  addLaneMarkers(P);
}
