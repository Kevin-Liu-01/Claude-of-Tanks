// The Danish Leopard 1s (release 265): the Leopard 1A3 DK as delivered in 1976-78, the Leopard 1A5 DK it became in
// 1990-94 and the 1A5 DK-1 fit of the tanks sent to Bosnia (docs/references/tanks/leo1a3dk.md). All three ride the
// Leopard 1A5's hull (profiles/leopard1Hull.ts) and carry the welded 1A3 turret, which the Danish 1A5 DK kept where the
// German 1A5 took the cast turret with Blohm & Voss plates (armyvehicles.dk/leopard1a5.htm: "Not to be confused with the
// German 1 A5, the Danish version retains the welded turret"). The turret is measured from the Krigsmuseet tank's side
// view and the Aalborg museum's 1A5 DK turret; the hull carries the Danish dozer channels and slope-fitted fender bins in
// place of the German glacis grousers and side tools. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { buildLeo1HullSteps, type Leo1HullDatums } from './leopard1Hull.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** a3: the 1976 tank (TEM 2A rangefinder, XSW-30-U searchlight); a5: the 1990-94 EMES 18 conversion; a5dk1: the
 * Bosnia fit (turret-rear air conditioning and generator, the M41 DK-1's searchlight, GPS). */
export type Leo1DkMark = 'a3' | 'a5' | 'a5dk1';

// The welded turret, turret-local (origin on the ring 0.50 m ahead of the hull origin, on the 1.60 m turret base). From
// the Krigsmuseet side view scaled by the 0.74 m road-wheel pitch: the roof 0.87 m over the base, the front corner strip
// 1.22 m ahead of the ring rising to 0.58 m where the brow leans back to the roof edge 0.91 m ahead, the body ending
// 1.655 m behind the ring and the rear bin 0.53 m deeper. The cheeks sweep back in plan from beside the mask (x 0.52) to
// the full width (x 1.22) at the rangefinder ports, so the front reads as the A3's pointed wedge from above.
const W = Object.freeze({
  roofY: 0.87,
  shoulderY: 0.42,
  undercutM: 0.09,
  sideLeanM: 0.10,
  halfWidth: 1.22,
  cheekRootX: 0.52,
  cheekRootZ: 1.22,
  cheekTipZ: 0.30,
  browTopZ: 0.91,
  browFootY: 0.58,
  rearZ: -1.655,
  rearHalfWidth: 1.10,
  binRearZ: -2.18,
  binLowY: 0.22,
  trunnionY: 0.32,
  trunnionZ: 1.22,
  rangefinderZ: 0.08,
  rangefinderY: 0.36,
});

/** The side's half-width at height y in a station whose shoulder half-width is ws and roof height yt. */
const sideX = (ws: number, yt: number, y: number): number => y <= W.shoulderY
  ? ws - W.undercutM * (W.shoulderY - y) / W.shoulderY
  : ws - W.sideLeanM * (y - W.shoulderY) / (yt - W.shoulderY);
const ring = (ws: number, yt: number): readonly SectionPoint[] => [
  [-(ws - W.undercutM), 0], [ws - W.undercutM, 0], [ws, W.shoulderY], [ws - W.sideLeanM, yt],
  [-(ws - W.sideLeanM), yt], [-ws, W.shoulderY],
];
/** The cheek plane's shoulder half-width at a station between the cheek tip and its root. */
const cheekX = (z: number): number => W.halfWidth
  - (W.halfWidth - W.cheekRootX) * (z - W.cheekTipZ) / (W.cheekRootZ - W.cheekTipZ);

function addDanishHullKit(P: TankBuilderPort, hull: Leo1HullDatums, mark: Leo1DkMark): void {
  const { box, cylZ } = KIT;
  const { fenderY, sponsonX, deckEdgeX, deckEdgeY } = hull;
  // Fender bins (Krigsmuseet side view): a long bin ahead of the turret's sweep, one under it and a taller box at the
  // engine deck, each with its outer face on the skirt line and its inner face on the sloped side plate.
  const slopeX = (y: number, z: number): number => sponsonX
    - (sponsonX - deckEdgeX) * (y - (fenderY - 0.02)) / (deckEdgeY(z) - (fenderY - 0.02));
  const bins: readonly (readonly [number, number, number])[] = [[1.62, 0.54, 1.42], [0.10, -1.22, 1.42], [-1.30, -1.94, 1.50]];
  for (const s of [-1, 1] as const) {
    for (const [z1, z0, top] of bins) {
      const zc = (z0 + z1) / 2, low = fenderY + 0.004;
      const right: readonly SectionPoint[] = [[slopeX(low, zc) - 0.012, low], [1.672, low], [1.672, top], [slopeX(top, zc) - 0.012, top]];
      const section = s > 0 ? right : right.map(([x, y]) => [-x, y] as const).reverse();
      P.addEquipment('hull', sectionSolid([{ z: z0, ring: section }, { z: z1, ring: section }]));
      // lid seam and two latches on the outer face
      P.addEquipment('hullDark', box(0.012, 0.012, z1 - z0 - 0.04), s * 1.676, top - 0.035, zc);
      for (const f of [0.25, 0.75]) P.addEquipment('hullDark', box(0.014, 0.06, 0.045), s * 1.678, top - 0.075, z0 + (z1 - z0) * f);
    }
  }
  // Dozer channels (armyvehicles.dk/leopard1a3.htm: "All Danish Leopard 1s had dozer attachment channels on the lower
  // front hull"): two channel brackets on the lower glacis, which leans back 28 degrees toward the belly.
  const lowerTilt = Math.atan2(3.54 - 3.24, 1.04 - 0.48);
  for (const s of [-1, 1] as const) {
    const y = 0.74, z = 3.24 + (y - 0.48) * Math.tan(lowerTilt) + 0.035;
    P.addEquipment('hullDark', box(0.12, 0.46, 0.07), s * 0.56, y, z, lowerTilt, 0, 0);
    P.addEquipment('hullDark', box(0.16, 0.08, 0.10), s * 0.56, 0.55, 3.31 + 0.05, lowerTilt, 0, 0);
    P.addEquipment('hullDark', cylZ(0.035, 0.12, 10), s * 0.56, 0.95, 3.52, lowerTilt, 0, 0);
  }
  // the Danish periscope wipe system over the driver's three periscopes
  const periY = hull.deckTopY(1.03);
  P.addEquipment('hullDark', box(0.56, 0.018, 0.018), -0.45, periY + 0.095, 1.075, -0.10, 0, 0);
  for (const x of [-0.66, -0.45, -0.24]) P.addEquipment('hullDark', box(0.012, 0.06, 0.012), x + 0.04, periY + 0.07, 1.072, -0.10, 0, 0);
  if (mark === 'a5dk1') {
    // the DK-1's GPS antenna on the hull roof at the glacis break, past the turret's footprint and the breech's swing at
    // full elevation (gun-depression sweep, 265)
    P.addEquipment('hullDark', KIT.cylY(0.06, 0.07, 0.035, 12), 0.95, hull.deckTopY(2.55) + 0.018, 2.55);
  }
}

function* buildLeo1DkSteps(P: TankBuilderPort, mark: Leo1DkMark): TankProfileBuild {
  const { box, cylX, cylY, cylZ, sph, xform, buildGun, liftEye, stowage, jerryCan, tarpRoll, ammoCan } = KIT;
  const { rng } = P;
  const hull = yield* buildLeo1HullSteps(P, { grouserRack: false, sideTools: false, deckTools: false });
  addDanishHullKit(P, hull, mark);
  yield 'buildLeo1DkHullKit';

  const turretY = hull.deckTopY(0.50) + 0.02;
  P.turretG.position.set(0, turretY, 0.50);
  const roof = W.roofY;
  // ---------------------------------------------------------------- welded body --
  const buildLeo1DkTurretBody = (): void => {
    P.add('turret', cylY(0.98, 1.04, 0.11, P.q ? 28 : 18), 0, -0.055, 0);
    const body = sectionSolid([
      { z: W.rearZ, ring: ring(W.rearHalfWidth, roof) },
      { z: -1.38, ring: ring(W.halfWidth - 0.02, roof) },
      { z: W.cheekTipZ, ring: ring(W.halfWidth, roof) },
      { z: W.browTopZ, ring: ring(cheekX(W.browTopZ), roof) },
      { z: W.cheekRootZ, ring: ring(W.cheekRootX, W.browFootY) },
    ]);
    body.userData.primaryStockRole = 'leo1dk-welded-turret';
    P.add('turret', body);
    // the rear bin, a separate stowage box hung on the rear plate
    P.addEquipment('turret', box(2.10, roof - W.binLowY - 0.02, W.rearZ - W.binRearZ), 0, (roof + W.binLowY) / 2 - 0.01,
      (W.rearZ + W.binRearZ) / 2);
    P.addEquipment('turretDark', box(2.12, 0.022, 0.03), 0, roof - 0.06, W.binRearZ - 0.005);
    for (const x of [-0.70, 0, 0.70]) P.addEquipment('turretDark', box(0.06, 0.07, 0.025), x, roof - 0.11, W.binRearZ - 0.012);
    // weld seams on the sides and the brow edge
    for (const s of [-1, 1] as const) {
      for (const z of [-1.02, 0.02]) {
        P.add('turretDetail', box(0.012, 0.36, 0.016), s * (sideX(W.halfWidth, roof, 0.64) + 0.002), 0.64, z, 0, 0, s * 0.235);
      }
      liftEye(P, 'turretDetail', s * 0.88, roof + 0.01, 0.40, s * 0.45);
      liftEye(P, 'turretDetail', s * 0.86, roof + 0.01, -1.36, s * 2.65);
      // side grab rails (Krigsmuseet: one ahead of the rangefinder port and one behind)
      for (const z of [0.55, -0.62]) {
        const x = sideX(W.halfWidth, roof, 0.30) + 0.05;
        P.addEquipment('turretDark', box(0.022, 0.022, 0.30), s * x, 0.30, z);
        for (const dz of [-0.14, 0.14]) P.addEquipment('turretDark', box(0.05, 0.022, 0.022), s * (x - 0.02), 0.30, z + dz);
      }
    }
  };
  buildLeo1DkTurretBody();
  yield 'buildLeo1DkTurretBody';

  // ---------------------------------------------------------------- sights, hatches, launchers --
  const buildLeo1DkTurretFittings = (): void => {
    // Rangefinder ports on each side behind the cheek (the A3's TEM 2A end windows): an armoured boss with a shutter.
    // The 1A5 DK's EMES 18 made the rangefinder redundant and its ports carry blanking covers with a pale ring.
    for (const s of [-1, 1] as const) {
      const x = sideX(W.halfWidth, roof, W.rangefinderY);
      P.add('turret', xform(cylX(0.20, 0.10, P.q ? 24 : 16), 0, 0, 0, 0, 0, 0), s * (x + 0.03), W.rangefinderY, W.rangefinderZ);
      if (mark === 'a3') {
        P.add('turretDark', cylX(0.13, 0.03, P.q ? 20 : 14), s * (x + 0.085), W.rangefinderY, W.rangefinderZ);
        P.add('turretGlass', cylX(0.085, 0.012, P.q ? 20 : 14), s * (x + 0.098), W.rangefinderY, W.rangefinderZ);
      } else {
        P.addEquipment('turretDetail', cylX(0.155, 0.025, P.q ? 24 : 16), s * (x + 0.09), W.rangefinderY, W.rangefinderZ);
        P.addEquipment('turretDark', cylX(0.085, 0.03, P.q ? 20 : 14), s * (x + 0.10), W.rangefinderY, W.rangefinderZ);
      }
    }
    // Commander's cupola (right, -x: a +Z hull's right) with its PERI R12 ahead of it, raised on the 1A5 DK to see over
    // the EMES 18 housing.
    P.addCupola('turret', cylY(0.27, 0.28, 0.07, P.q ? 20 : 14), -0.52, roof + 0.035, -0.32);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P.add('turretGlass', box(0.055, 0.045, 0.018), -0.52 + Math.sin(a) * 0.24, roof + 0.095, -0.32 + Math.cos(a) * 0.24, 0, a, 0);
    }
    P.addCupola('turret', cylY(0.22, 0.23, 0.05, P.q ? 20 : 14), -0.52, roof + 0.145, -0.32);
    P.addCupola('turret', xform(sph(0.20, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.24, 1]), -0.52, roof + 0.19, -0.32);
    const periH = mark === 'a3' ? 0.20 : 0.46;
    P.addEquipment('turret', cylY(0.115, 0.13, periH, P.q ? 18 : 12), -0.50, roof + periH / 2, 0.12);
    P.addEquipment('turret', box(0.24, 0.17, 0.20), -0.50, roof + periH + 0.085, 0.12);
    P.add('turretGlass', box(0.15, 0.085, 0.014), -0.50, roof + periH + 0.09, 0.225);
    // loader's hatch (left, +x) and its periscope
    P.addCupola('turret', cylY(0.24, 0.25, 0.055, P.q ? 20 : 14), 0.52, roof + 0.0275, -0.30);
    P.addCupola('turret', xform(sph(0.21, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.22, 1]), 0.52, roof + 0.095, -0.30);
    P.addEquipment('turret', box(0.15, 0.10, 0.17), 0.40, roof + 0.05, 0.12);
    P.add('turretGlass', box(0.10, 0.06, 0.014), 0.40, roof + 0.06, 0.207);
    // gunner's periscope in the brow
    P.addEquipment('turret', box(0.16, 0.09, 0.14), -0.30, roof + 0.03, 0.78);
    if (mark !== 'a3') {
      // EMES 18: the armoured thermal sight box on the right (-x) front roof, its two windows behind armoured doors (one
      // door hinged open on the Aalborg turret)
      P.addEquipment('turret', box(0.48, 0.10, 0.46), -0.66, roof + 0.05, 0.56);
      P.addEquipment('turret', box(0.52, 0.25, 0.48), -0.66, roof + 0.22, 0.56);
      P.addEquipment('turret', box(0.56, 0.035, 0.52), -0.66, roof + 0.36, 0.56);
      P.add('turretDark', box(0.40, 0.16, 0.025), -0.66, roof + 0.22, 0.81);
      for (const x of [-0.57, -0.75]) {
        P.add('turretGlass', box(0.115, 0.105, 0.014), x, roof + 0.22, 0.826);
        P.addEquipment('turret', box(0.15, 0.14, 0.014), x, roof + 0.22, 0.842);
      }
      // the 1A5 DK's roof fast fittings for two rifles, behind the loader's hatch
      for (const x of [0.30, 0.12]) {
        P.addEquipment('turretDark', box(0.05, 0.03, 0.06), x, roof + 0.015, -0.78);
        P.addEquipment('turretDark', box(0.05, 0.03, 0.06), x, roof + 0.015, -1.38);
        P.addEquipment('turretDark', box(0.045, 0.06, 0.92), x, roof + 0.05, -1.08);
      }
    }
    // Loader's MG (the Danish MG 62, an MG3) on its ring mount.
    P.addEquipment('turret', cylY(0.12, 0.14, 0.12, P.q ? 16 : 10), 0.52, roof + 0.06, -0.62);
    P.addEquipment('turret', box(0.24, 0.08, 0.20), 0.52, roof + 0.115, -0.62);
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mg3', tone: 'two-tone', elev: 0.05,
      scale: 0.96, seed: 265, shield: false, ammo: true, working: true, ridingCradle: true,
    });
    mg.name = 'leo1DkLoaderMg62';
    mg.position.set(0.52, roof + 0.115, -0.62);
    mg.rotation.y = -0.30;
    P.turretG.add(mg);
    // Wegmann 76 mm dischargers: two rows of four on a bracket high on each side, with a guard loop (Krigsmuseet).
    for (const s of [-1, 1] as const) {
      const x = sideX(W.halfWidth, roof, 0.68);
      P.addEquipment('turret', box(0.08, 0.30, 0.98), s * (x + 0.03), 0.68, 0.06);
      // (the guard's arms run back into the side plate under the roof edge)
      P.addEquipment('turretDark', box(0.028, 0.028, 1.06), s * (x + 0.25), 0.80, 0.06);
      for (const z of [-0.47, 0.59]) P.addEquipment('turretDark', box(0.30, 0.028, 0.028), s * (x + 0.10), 0.80, z);
      for (let k = 0; k < 8; k++) {
        const row = Math.floor(k / 4), col = k % 4;
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.21, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.30, 0),
          s * (x + 0.11), 0.60 + row * 0.16, 0.42 - col * 0.24);
      }
    }
    // whip antennas on the rear roof corners
    for (const s of [-1, 1] as const) {
      P.addEquipment('turret', box(0.08, 0.08, 0.08), s * 0.82, roof + 0.04, -1.40);
      P.addEquipment('turret', cylY(0.014, 0.016, 2.0, 8), s * 0.82, roof + 1.04, -1.40, 0, 0, s * 0.025);
    }
  };
  buildLeo1DkTurretFittings();
  yield 'buildLeo1DkTurretFittings';

  // ---------------------------------------------------------------- rear stowage and markings --
  const buildLeo1DkTurretRear = (): void => {
    if (mark === 'a5dk1') {
      // The DK-1's air conditioning and Honda generator housing over the rear bin (Pansermuseet: "a generator and an air
      // conditioning system mounted on the rear of the turret"), standing over the roof with its louvred rear face.
      const z0 = W.rearZ + 0.02, z1 = W.binRearZ - 0.06, top = roof + 0.20;
      P.addEquipment('turret', box(1.80, top - W.binLowY, z0 - z1), 0, (top + W.binLowY) / 2, (z0 + z1) / 2);
      P.addEquipment('turretDark', box(1.82, 0.03, z0 - z1 + 0.02), 0, top + 0.015, (z0 + z1) / 2);
      for (let k = 0; k < 7; k++) P.addEquipment('turretDark', box(1.30, 0.022, 0.02), 0, W.binLowY + 0.16 + k * 0.08, z1 - 0.01);
      for (const x of [-0.84, 0.84]) P.addEquipment('turretDark', box(0.05, top - W.binLowY, 0.05), x, (top + W.binLowY) / 2, z1);
    } else {
      stowage(P, 'turretCloth', rng, [
        [-0.56, roof + 0.13, -1.86, 0.52, 0.24, 0.44], [0.10, roof + 0.12, -1.88, 0.56, 0.22, 0.44],
      ]);
      tarpRoll(P, 'turretCloth', 0.0, roof + 0.06, -1.60, 1.30, 0.09, true, P.q ? 12 : 8);
    }
    if (mark !== 'a3') {
      // the later rear turret rack: a rail frame behind the bin
      const rz = W.binRearZ - 0.30;
      P.addEquipment('turret', box(1.90, 0.035, 0.035), 0, 0.30, rz);
      P.addEquipment('turret', box(1.90, 0.035, 0.035), 0, 0.68, rz);
      P.addEquipment('turret', box(1.86, 0.025, 0.30), 0, 0.30, W.binRearZ - 0.15);
      for (let k = 0; k < 6; k++) P.addEquipment('turret', box(0.03, 0.38, 0.03), -0.90 + k * 0.36, 0.49, rz);
      for (const x of [-0.92, 0.92]) P.addEquipment('turret', box(0.035, 0.035, 0.32), x, 0.68, W.binRearZ - 0.15);
      jerryCan(P, 'turretCloth', 0.55, 0.47, rz + 0.13, 0.16);
      ammoCan(P, 'turretDark', -0.60, 0.40, rz + 0.12, 0.12);
    } else {
      ammoCan(P, 'turretDark', -0.72, 0.46, W.binRearZ - 0.06, 0.12);
    }
    P.turretG.userData.leopard1DkTurretReceipt = {
      revision: 'leo1dk-265-welded',
      mark,
      weldedTurret: true,
      roofY: roof,
      halfWidth: W.halfWidth,
      cheekRoot: [W.cheekRootX, W.cheekRootZ],
      cheekTipZ: W.cheekTipZ,
      browTopZ: W.browTopZ,
      rearZ: W.rearZ,
      binRearZ: W.binRearZ,
      emes18: mark !== 'a3',
      rangefinderPortsOpen: mark === 'a3',
      airConditioningHousing: mark === 'a5dk1',
    };
    for (const s of [-1, 1] as const) {
      P.decal('turret', 'number', P.spec.visual.number || '21', 0.20,
        [s * (sideX(W.halfWidth, roof, 0.30) + 0.004), 0.30, -1.10], s * Math.PI / 2);
    }
  };
  buildLeo1DkTurretRear();
  yield 'buildLeo1DkTurretRear';

  // ---------------------------------------------------------------- mask and gun --
  // The A3's wedge mask closing to a line where the gun leaves, between the cheek roots; the receiver plate behind it
  // belongs to the turret, the mask and its rear pad pitch with the gun.
  const mask = { halfWidth: 0.47, low: -0.27, high: 0.25, rearZ: -0.20, rearHigh: 0.19, bodyZ: -0.02, ridgeHalfWidth: 0.44,
    ridgeLow: -0.02, ridgeHigh: 0.02, ridgeZ: 0.22 };
  const maskRing = (w: number, yb: number, yt: number, c: number): readonly SectionPoint[] => [
    [-w + c, yb], [w - c, yb], [w, yb + c], [w, yt - c], [w - c, yt], [-w + c, yt], [-w, yt - c], [-w, yb + c],
  ];
  const buildLeo1DkGun = (): void => {
    P.add('turret', new THREE.BoxGeometry(1.08, 0.50, 0.16), 0, W.trunnionY + 0.01, W.cheekRootZ - 0.10);
    P.gunG.position.set(0, W.trunnionY, W.trunnionZ);
    P.addGunExtra(new THREE.BoxGeometry(0.96, 0.40, 0.12), 0, 0, -0.26);
    const k = mask;
    P.addGunExtra(sectionSolid([
      { z: k.rearZ, ring: maskRing(k.halfWidth - 0.02, k.low + 0.02, k.rearHigh, 0.05) },
      { z: k.bodyZ, ring: maskRing(k.halfWidth, k.low, k.high, 0.05) },
      { z: k.ridgeZ, ring: maskRing(k.ridgeHalfWidth, k.ridgeLow, k.ridgeHigh, 0.015) },
    ]));
    const brow = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.high - k.ridgeHigh).normalize();
    const chin = new THREE.Vector2(k.ridgeZ - k.bodyZ, k.ridgeLow - k.low).normalize();
    const onBrow = (t: number, out: number): [number, number] => [
      k.high - (k.high - k.ridgeHigh) * t + brow.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + brow.y * out];
    const onChin = (t: number, out: number): [number, number] => [
      k.low + (k.ridgeLow - k.low) * t - chin.x * out, k.bodyZ + (k.ridgeZ - k.bodyZ) * t + chin.y * out];
    // the gunner's telescope port on the right of the brow (-x), the coaxial MG's on the left of the chin
    P.addGunExtraDark(xform(cylZ(0.05, 0.05, 14), 0, 0, 0, -Math.atan2(brow.x, brow.y), 0, 0), -0.26, ...onBrow(0.45, 0.012));
    P.addGunExtraDark(xform(cylZ(0.026, 0.06, 10), 0, 0, 0, Math.atan2(chin.x, chin.y), 0, 0), 0.28, ...onChin(0.55, 0.014));
    P.addGunExtra(cylZ(0.13, 0.10, P.q ? 20 : 14, 0.15), 0, 0, k.ridgeZ + 0.04);
    const yoke = (lamp: { halfWidth: number; low: number; high: number; rearZ: number; frontZ: number }): void => {
      const lampY = (lamp.low + lamp.high) / 2, lampZ = (lamp.rearZ + lamp.frontZ) / 2;
      const browAt = (z: number): number => k.high - (k.high - k.ridgeHigh) * THREE.MathUtils.clamp((z - k.bodyZ) / (k.ridgeZ - k.bodyZ), 0, 1);
      const foot = browAt(lampZ) - 0.015;
      for (const s of [-1, 1] as const) {
        P.add('gunMount', box(0.04, lampY - foot, 0.09), s * (lamp.halfWidth + 0.045), (lampY + foot) / 2, lampZ);
        P.add('gunMountDark', cylX(0.045, 0.06, 12), s * (lamp.halfWidth + 0.02), lampY, lampZ);
      }
      P.add('gunMount', box(lamp.halfWidth * 2 + 0.13, 0.04, 0.09), 0, foot + 0.01, lampZ);
    };
    if (mark === 'a3') {
      // the XSW-30-U infrared / white-light searchlight over the gun, as on every early Leopard 1
      const lamp = { halfWidth: 0.27, low: 0.33, high: 0.74, rearZ: -0.18, frontZ: 0.15, lensR: 0.165 };
      const lampY = (lamp.low + lamp.high) / 2;
      P.add('gunMount', sectionSolid([
        { z: lamp.rearZ, ring: maskRing(lamp.halfWidth, lamp.low, lamp.high, 0.04) },
        { z: lamp.frontZ, ring: maskRing(lamp.halfWidth, lamp.low, lamp.high, 0.04) },
      ]), 0, 0, 0);
      P.add('gunMountDark', cylZ(lamp.lensR + 0.025, 0.03, P.q ? 28 : 18), 0, lampY, lamp.frontZ + 0.012);
      P.add('gunMountGlass', markVehicleNightLens(cylZ(lamp.lensR, 0.008, P.q ? 28 : 18), 'headlight', { searchlight: true }),
        0, lampY, lamp.frontZ + 0.029);
      yoke(lamp);
    } else if (mark === 'a5dk1') {
      // the M41 DK-1's halogen searchlight, taken over when the M41s left: a round lamp on a low yoke over the mask
      const lamp = { halfWidth: 0.17, low: 0.30, high: 0.62, rearZ: -0.10, frontZ: 0.12 };
      const lampY = (lamp.low + lamp.high) / 2;
      P.add('gunMount', cylZ(0.16, lamp.frontZ - lamp.rearZ, P.q ? 24 : 16), 0, lampY, (lamp.rearZ + lamp.frontZ) / 2);
      P.add('gunMountDark', cylZ(0.175, 0.025, P.q ? 24 : 16), 0, lampY, lamp.frontZ + 0.01);
      P.add('gunMountGlass', markVehicleNightLens(cylZ(0.13, 0.008, P.q ? 24 : 16), 'headlight', { searchlight: true }),
        0, lampY, lamp.frontZ + 0.026);
      yoke(lamp);
    }
    // L7A3 105 mm with its thermal sleeve and evacuator; the 1A5 DK added the muzzle reference collimator
    buildGun(P, { len: 4.35, r: 0.064, sleeve: true, evac: 0.60, evacR: 1.78, collar: true, baseR: 0.13 });
    muzzleBore(P, { len: 4.35, r: 0.064 });
    if (mark !== 'a3') {
      P.add('gunDark', box(0.075, 0.07, 0.16), 0, 0.165, 4.20);
      P.add('gunDark', box(0.02, 0.09, 0.028), 0, 0.105, 4.22);
    }
    P.gunG.userData.leopard1DkMaskReceipt = {
      seated: true,
      wedgeMask: true,
      maskWidth: mask.halfWidth * 2,
      maskRidgeZ: mask.ridgeZ,
      searchlight: mark === 'a3' ? 'XSW-30-U' : mark === 'a5dk1' ? 'M41 DK-1 halogen' : null,
      muzzleReference: mark !== 'a3',
      barrelRadius: 0.064,
    };
    P.mats.glass.color.setHex(0x3e493b);
    P.mats.glass.roughness = 0.48;
    P.mats.glass.metalness = 0.30;
    P.topY = turretY;
  };
  buildLeo1DkGun();
}

export const buildLeo1A3DK = steppedBuilder((P: TankBuilderPort) => buildLeo1DkSteps(P, 'a3'));
export const buildLeo1A5DK = steppedBuilder((P: TankBuilderPort) => buildLeo1DkSteps(P, 'a5'));
export const buildLeo1A5DK1 = steppedBuilder((P: TankBuilderPort) => buildLeo1DkSteps(P, 'a5dk1'));
