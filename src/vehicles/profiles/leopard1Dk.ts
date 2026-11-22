// The Danish Leopard 1s (release 265): the Leopard 1A3 DK as delivered in 1976-78, the Leopard 1A5 DK it became in
// 1990-94 and the 1A5 DK-1 fit of the tanks sent to Bosnia (docs/references/tanks/leo1a3dk.md), and the Australian
// Leopard AS1. All four ride the Leopard 1A5's hull (profiles/leopard1Hull.ts). Their turrets are the Leopard 1 family's
// (release 275, owner 2026-11-21: "they should also be based o the 1a2 and 1a5 turret deisngs and mantlets too"): the
// 1A5 DK and the DK-1 carry the German 1A5's cast turret with the Blohm & Voss plates and mask, the 1A3 DK and the AS1 the
// 1A2A1's one-piece casting and mask (profiles/leopard1TurretBuild.ts). The real tanks kept the welded 1A3 turret
// (armyvehicles.dk/leopard1a5.htm); the owner's ruling puts them on the family's turrets, with the Krigsmuseet and Aalborg
// photographs' national kit on top. The hull carries the Danish dozer channels and slope-fitted fender bins in place of
// the German glacis grousers and side tools. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { antennaPart } from './antennaPart.ts';
import { KIT, FITTINGS } from './kit.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { mount } from './fittingMount.ts';
import { buildLeo1HullSteps, type Leo1HullDatums } from './leopard1Hull.ts';
import { LEO1_TURRET } from './leopard1Turret.ts';
import {
  LEO1_BUSTLE_BIN, LEO1_BV_MASK, LEO1_ONE_PIECE_MASK, addLeo1BustleBin, addLeo1BvCastCore, addLeo1BvMantlet, addLeo1BvPlates,
  addLeo1OnePieceCasting, addLeo1OnePieceMantlet, leo1BvOuterX, leo1BvRoofAt, leo1BvUpperFaceX, leo1MaskTopAt,
} from './leopard1TurretBuild.ts';
import { markSmokeTube } from '../vehicleAuxiliaryGeometry.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

/** a3: the 1976 tank (TEM 2A rangefinder, XSW-30-U searchlight); a5: the 1990-94 EMES 18 conversion; a5dk1: the
 * Bosnia fit (turret-rear air conditioning and generator, the M41 DK-1's searchlight, GPS); as1 (release 269): the
 * Australian Leopard AS1 of 1976-2007 on the same family turret as the a3 (docs/references/tanks/leopard_as1.md): the Belgian
 * SABCA fire control's laser in its armoured drum on the left cheek, the right port blanked, the crosswind sensor's mast
 * on the roof, one row of four dischargers a side under a guard, no searchlight, FN MAGs, the Australian basket. */
export type Leo1DkMark = 'a3' | 'a5' | 'a5dk1' | 'as1';
const LEO1_DK_MARKS: readonly Leo1DkMark[] = ['a3', 'a5', 'a5dk1', 'as1'];

// The national kit's stations on the family turret, turret-local (origin on the Leopard 1 family's ring,
// profiles/leopard1Turret.ts): the rangefinder ports behind the cheek on the side plates' upper face, the discharger
// brackets and their guard loops under the plates' top edge (0.75 m), the DK-1's UN stencil.
const K = Object.freeze({
  rangefinderZ: 0.08,
  rangefinderY: 0.42,
  dischargerY: 0.60,
  tubeRowY: 0.525,
  tubeRowStepM: 0.145,
  guardY: 0.71,
  stencilY: 0.56,
});
const maskRing = (w: number, yb: number, yt: number, c: number): readonly SectionPoint[] => [
  [-w + c, yb], [w - c, yb], [w, yb + c], [w, yt - c], [w - c, yt], [-w + c, yt], [-w, yt - c], [-w, yb + c],
];

function addDanishHullKit(P: TankBuilderPort, hull: Leo1HullDatums, mark: Leo1DkMark): void {
  const { box, cylZ } = KIT;
  // the UN-white DK-1's fittings painted over in a grey, not left black (r8 critics: black latches and channels on white)
  const fit = mark === 'a5dk1' ? 'hullFittingPaint' : 'hullDark';
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
      P.addEquipment(fit, box(0.012, 0.012, z1 - z0 - 0.04), s * 1.676, top - 0.035, zc);
      for (const f of [0.25, 0.75]) P.addEquipment(fit, box(0.014, 0.06, 0.045), s * 1.678, top - 0.075, z0 + (z1 - z0) * f);
    }
  }
  // (the engine's outlets on the sloped rear side plates behind the bins, the Krigsmuseet side view's last fifth of the
  // hull side, are the family hull's grille housings, their slats continuous from the last bin to the stern: outlets
  // 'continuous', profiles/leopard1Hull.ts.)
  // Dozer channels (armyvehicles.dk/leopard1a3.htm: "All Danish Leopard 1s had dozer attachment channels on the lower
  // front hull"): two channel brackets on the lower glacis, which leans back 28 degrees toward the belly.
  const lowerTilt = Math.atan2(3.54 - 3.24, 1.04 - 0.48);
  for (const s of [-1, 1] as const) {
    const y = 0.74, z = 3.24 + (y - 0.48) * Math.tan(lowerTilt) + 0.035;
    P.addEquipment(fit, box(0.12, 0.46, 0.07), s * 0.56, y, z, lowerTilt, 0, 0);
    P.addEquipment(fit, box(0.16, 0.08, 0.10), s * 0.56, 0.55, 3.31 + 0.05, lowerTilt, 0, 0);
    P.addEquipment(fit, cylZ(0.035, 0.12, 10), s * 0.56, 0.95, 3.52, lowerTilt, 0, 0);
  }
  // the Danish periscope wipe system over the driver's three periscopes (not the Australian tank's)
  const periY = hull.deckTopY(1.03);
  if (mark !== 'as1') {
    P.addEquipment(fit, box(0.56, 0.018, 0.018), -0.45, periY + 0.095, 1.075, -0.10, 0, 0);
    for (const x of [-0.66, -0.45, -0.24]) P.addEquipment(fit, box(0.012, 0.06, 0.012), x + 0.04, periY + 0.07, 1.072, -0.10, 0, 0);
  }
  if (mark === 'a5dk1') {
    // r6 critics: UN on the upper glacis (r8: the bins' lettering, squeezed under their latches, read "IIN": gone) (its face 6 cm over the datum) and the rear plate between the fuel cans
    P.decal('hull', 'stencil', 'UN', 0.50, [0, hull.upperGlacisY(3.10) + 0.065, 3.103], 0, -Math.PI / 3);
    P.decal('hull', 'stencil', 'UN', 0.28, [0, 1.47, -3.553], Math.PI);
  }
}

function* buildLeo1DkSteps(P: TankBuilderPort, mark: Leo1DkMark): TankProfileBuild {
  // an unknown mark fails here, never on a default path
  if (!LEO1_DK_MARKS.includes(mark)) throw new Error(`leopard1Dk: unknown mark '${String(mark)}'`);
  const { box, cylX, cylY, cylZ, sph, xform, liftEye, stowage, jerryCan, tarpRoll, ammoCan } = KIT;
  const { rng } = P;
  const hull = yield* buildLeo1HullSteps(P, { grouserRack: false, sideTools: false, deckTools: false, skirtBucket: 'hull',
    rearCans: true, rearCanBucket: mark === 'a5dk1' ? 'hull' : 'hullCloth', denseGrilles: mark === 'a5dk1',
    outlets: 'continuous' });
  addDanishHullKit(P, hull, mark);
  yield 'buildLeo1DkHullKit';

  // ---------------------------------------------------------------- the family turret --
  // Owner 2026-11-21: "they should also be based o the 1a2 and 1a5 turret deisngs and mantlets too". The 1A5 DK and the
  // DK-1 carry the German 1A5's cast turret with its Blohm & Voss plates and mask; the 1A3 DK and the AS1 the 1A2A1's
  // one-piece casting and its mask, here on the flat deck (profiles/leopard1TurretBuild.ts). Their national kit (sights,
  // searchlights, dischargers, rangefinder ports, rear stowage, MGs, markings) is seated on those castings' surfaces.
  const turretY = hull.deckTopY(0.50) + 0.02;
  P.turretG.position.set(0, turretY, LEO1_TURRET.ringZ);
  const roof = LEO1_TURRET.roofOverRingM;
  const bvTurret = mark === 'a5' || mark === 'a5dk1';
  const mask = bvTurret ? LEO1_BV_MASK : LEO1_ONE_PIECE_MASK;
  // (the UN-white DK-1's small fittings painted grey: r9-r11 critics, black dots and slivers on the white)
  const tFit = mark === 'a5dk1' ? 'turretFittingPaint' : 'turretDark';
  let roofAt: (z: number) => number = leo1BvRoofAt;
  let outerX: (z: number, y: number) => number = leo1BvOuterX;
  let upperFaceX: (z: number, y: number) => number = leo1BvUpperFaceX;
  const buildLeo1DkTurretBody = (): void => {
    if (bvTurret) {
      addLeo1BvCastCore(P);
      addLeo1BvPlates(P, roof);
    } else {
      const casting = addLeo1OnePieceCasting(P, { castRoofY: roof, footing: 'deck' });
      ({ roofAt, outerX, upperFaceX } = casting);
      for (const s of [-1, 1] as const) {
        liftEye(P, 'turretDetail', s * 0.64, roof + 0.01, 0.20, s * 0.45);
        liftEye(P, 'turretDetail', s * 0.62, roofAt(-1.10) - 0.01, -1.10, s * 2.65);
      }
    }
  };
  buildLeo1DkTurretBody();
  yield 'buildLeo1DkTurretBody';

  // ---------------------------------------------------------------- sights, hatches, launchers --
  const buildLeo1DkTurretFittings = (): void => {
    // Rangefinder ports on each side behind the cheek (the TEM 2A end windows): an armoured boss with a shutter, its
    // outer face 0.10 m past x. The 1A5 DK's EMES 18 made the rangefinder redundant and its ports carry blanking covers
    // with a pale ring.
    for (const s of [-1, 1] as const) {
      const x = outerX(K.rangefinderZ, K.rangefinderY) - 0.01;
      P.add('turret', cylX(0.24, 0.22, P.q ? 24 : 16), s * (x - 0.01), K.rangefinderY, K.rangefinderZ);
      if (mark === 'a3') {
        P.add('turretDark', cylX(0.16, 0.03, P.q ? 20 : 14), s * (x + 0.105), K.rangefinderY, K.rangefinderZ);
        P.add('turretGlass', cylX(0.11, 0.012, P.q ? 20 : 14), s * (x + 0.118), K.rangefinderY, K.rangefinderZ);
      } else if (mark === 'as1') {
        if (s > 0) {
          // the SABCA laser rangefinder's armoured drum over the left port: a broad round housing standing well proud of
          // the cheek, its face ringed with bolts round the dark lens (the 1st Armoured Regiment and Puckapunyal photographs)
          P.addEquipment('turret', cylX(0.29, 0.20, P.q ? 28 : 18), s * (x + 0.16), K.rangefinderY, K.rangefinderZ);
          P.addEquipment('turretDetail', cylX(0.30, 0.03, P.q ? 28 : 18), s * (x + 0.255), K.rangefinderY, K.rangefinderZ);
          P.add('turretDark', cylX(0.12, 0.02, P.q ? 20 : 14), s * (x + 0.275), K.rangefinderY, K.rangefinderZ);
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            P.add('turretDark', cylX(0.016, 0.012, 6), s * (x + 0.272), K.rangefinderY + Math.sin(a) * 0.22, K.rangefinderZ + Math.cos(a) * 0.22);
          }
        } else {
          // the right port blanked by a hexagonal plate
          P.addEquipment('turretDetail', cylX(0.17, 0.03, 6), s * (x + 0.11), K.rangefinderY, K.rangefinderZ);
        }
      } else {
        // the blanking cover: a bolted flange ring and a flat plate (r7 critics: the bulging cap read as a dome; the Aalborg
        // turret's cover is flush, white and perforated round a dark centre)
        // (r10 Opus: the covers about an eighth of the turret's length; the Aalborg and RAMTA discs nearer a sixth)
        P.addEquipment('turretDetail', cylX(0.245, 0.03, P.q ? 24 : 16), s * (x + 0.11), K.rangefinderY, K.rangefinderZ);
        P.addEquipment('turret', cylX(0.20, 0.02, P.q ? 24 : 16), s * (x + 0.125), K.rangefinderY, K.rangefinderZ);
        P.decal('turret', 'flag', 'leo1-rangefinder-blank', 0.40, [s * (x + 0.138), K.rangefinderY, K.rangefinderZ], s * Math.PI / 2, 0, 0);
      }
    }
    // Commander's cupola (right, -x: a +Z hull's right) at the German station, with its PERI R12 ahead of it, raised on
    // the 1A5 DK to see over the EMES 18 housing.
    const cmd = { x: -0.48, z: -0.32 };
    P.addCupola('turret', cylY(0.27, 0.28, 0.07, P.q ? 20 : 14), cmd.x, roof + 0.035, cmd.z);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      P.add('turretGlass', box(0.055, 0.045, 0.018), cmd.x + Math.sin(a) * 0.24, roof + 0.095, cmd.z + Math.cos(a) * 0.24, 0, a, 0);
    }
    P.addCupola('turret', cylY(0.22, 0.23, 0.05, P.q ? 20 : 14), cmd.x, roof + 0.145, cmd.z);
    P.addCupola('turret', xform(sph(0.20, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.24, 1]), cmd.x, roof + 0.19, cmd.z);
    // (the 1A5s' raised PERI R12 a slim tube under a small head: r9 Opus, r10 Sonnet: the thick column read as a chimney)
    const a3Roof = mark === 'a3' || mark === 'as1';
    const periH = a3Roof ? 0.20 : 0.46, peri = mark === 'a5' ? 'turretDark' : 'turret';
    if (a3Roof) {
      P.addEquipment('turret', cylY(0.115, 0.13, periH, P.q ? 18 : 12), -0.50, roof + periH / 2, 0.12);
      P.addEquipment('turret', box(0.24, 0.17, 0.20), -0.50, roof + periH + 0.085, 0.12);
      P.add('turretGlass', box(0.15, 0.085, 0.014), -0.50, roof + periH + 0.09, 0.225);
    } else {
      P.addEquipment('turret', cylY(0.13, 0.14, 0.06, P.q ? 18 : 12), -0.50, roof + 0.03, 0.12);
      P.addEquipment(peri, cylY(0.068, 0.075, periH, P.q ? 16 : 10), -0.50, roof + periH / 2, 0.12);
      P.addEquipment(peri, box(0.18, 0.14, 0.17), -0.50, roof + periH + 0.07, 0.12);
      P.add('turretGlass', box(0.12, 0.07, 0.014), -0.50, roof + periH + 0.075, 0.212);
    }
    // loader's hatch (left, +x) and its periscope
    P.addCupola('turret', cylY(0.24, 0.25, 0.055, P.q ? 20 : 14), 0.52, roof + 0.0275, -0.30);
    P.addCupola('turret', xform(sph(0.21, P.q ? 18 : 12), 0, 0, 0, 0, 0, 0, [1, 0.22, 1]), 0.52, roof + 0.095, -0.30);
    P.addEquipment('turret', box(0.15, 0.10, 0.17), 0.40, roof + 0.05, 0.12);
    P.add('turretGlass', box(0.10, 0.06, 0.014), 0.40, roof + 0.06, 0.207);
    // gunner's periscope on the front roof, seated on its fall to the mask
    P.addEquipment('turret', box(0.16, 0.12, 0.14), -0.30, roofAt(0.78) + 0.03, 0.78);
    if (mark === 'a5' || mark === 'a5dk1') {
      // EMES 18: the armoured thermal sight box on the right (-x) front roof at the German 1A5's station over the mask's
      // right cheek, its two windows behind armoured doors (one door hinged open on the Aalborg turret)
      // (r9, r10 critics: the Aalborg box is a dark grey armoured block, not in the coat; the DK-1's in its UN white)
      const emes = mark === 'a5' ? 'turretFittingPaint' : 'turret';
      const ex = -0.47, ez = -0.04;
      // (its foot reaches down to the front roof's fall under the box's front edge)
      const foot = roofAt(0.75 + ez) - 0.01;
      P.addEquipment(emes, box(0.48, roof + 0.10 - foot, 0.46), ex, (roof + 0.10 + foot) / 2, 0.56 + ez);
      P.addEquipment(emes, box(0.52, 0.25, 0.36), ex, roof + 0.22, 0.50 + ez);
      P.addEquipment(emes, box(0.56, 0.035, 0.40), ex, roof + 0.36, 0.50 + ez);
      // the armoured hood's sloped front, 42 degrees back from the vertical
      const hood = (w: number): readonly SectionPoint[] => [[-w, 0.095], [w, 0.095], [w, 0.345], [-w, 0.345]];
      const hoodLow = (w: number): readonly SectionPoint[] => [[-w, 0.095], [w, 0.095], [w, 0.20], [-w, 0.20]];
      P.addEquipment(emes, sectionSolid([{ z: 0.68 + ez, ring: hood(0.26) }, { z: 0.84 + ez, ring: hoodLow(0.26) }]), ex, roof, 0);
      const n = new THREE.Vector2(0.16, 0.145).normalize(), slope = -Math.atan2(n.x, n.y);
      const on = (t: number, out: number): [number, number] => [roof + 0.345 - 0.145 * t + n.x * out, 0.68 + ez + 0.16 * t + n.y * out];
      P.add('turretDark', box(0.44, 0.15, 0.02), ex, ...on(0.5, 0.004), slope, 0, 0);
      for (const [dx, open] of [[0.11, true], [-0.11, false]] as const) {
        P.add('turretGlass', box(0.15, 0.11, 0.014), ex + dx, ...on(0.5, 0.012), slope, 0, 0);
        // one armoured door hinged up open (the Aalborg turret), one closed over its window
        if (open) P.addEquipment('turret', box(0.19, 0.17, 0.018), ex + dx, roof + 0.43, 0.70 + ez, -0.12, 0, 0);
        else P.addEquipment('turret', box(0.19, 0.15, 0.018), ex + dx, ...on(0.5, 0.026), slope, 0, 0);
      }
      // the 1A5 DK's roof fast fittings for two rifles, behind the loader's hatch, laid along the roof's fall to the bustle
      const z0 = -0.62, z1 = -1.54, fall = Math.atan2(roofAt(z0) - roofAt(z1), z0 - z1);
      for (const x of [0.30, 0.12]) {
        P.addEquipment(tFit, box(0.05, 0.03, 0.06), x, roofAt(-0.78) + 0.015, -0.78);
        P.addEquipment(tFit, box(0.05, 0.03, 0.06), x, roofAt(-1.38) + 0.015, -1.38);
        // (r7 critics: the DK-1's black rails read as a slot across its white roof: painted with it)
        P.addEquipment(mark === 'a5dk1' ? 'turret' : 'turretDark', box(0.045, 0.06, 0.92), x, roofAt(-1.08) + 0.04, -1.08, -fall, 0, 0);
      }
    }
    // Loader's MG (the Danish MG 62, an MG3; the AS1's MAG 58) on its ring mount.
    P.addEquipment('turret', cylY(0.12, 0.14, 0.12, P.q ? 16 : 10), 0.52, roofAt(-0.62) + 0.06, -0.62);
    P.addEquipment('turret', box(0.24, 0.08, 0.20), 0.52, roofAt(-0.62) + 0.115, -0.62);
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: mark === 'as1' ? 'mag58' : 'mg3', tone: 'two-tone', elev: 0.05,
      scale: 0.96, seed: 265, shield: false, ammo: true, working: true, ridingCradle: true,
    });
    mg.name = mark === 'as1' ? 'leo1As1LoaderMag' : 'leo1DkLoaderMg62';
    mg.position.set(0.52, roofAt(-0.62) + 0.115, -0.62);
    mg.rotation.y = -0.30;
    P.turretG.add(mg);
    // the AS1's commander's M2 on a pintle at the cupola's front edge (front34_service_1armd, 1st Armoured Regiment:
    // the commander's heavy gun belt-fed beside the loader's MAG 58)
    if (mark === 'as1') {
      P.addEquipment('turretDark', cylY(0.03, 0.035, 0.16, P.q ? 12 : 8), -0.40, roof + 0.20, -0.14);
      const commander = FITTINGS.pintleMG({
        mats: P.mats, cls: 'm2', tone: 'two-tone', elev: 0.04,
        scale: 0.92, seed: 2691, shield: false, ammo: true, working: true, ridingCradle: true,
      });
      commander.name = 'leo1As1CommanderM2';
      commander.position.set(-0.40, roof + 0.28, -0.14);
      commander.rotation.y = 0.12;
      P.turretG.add(commander);
    }
    // Wegmann 76 mm dischargers on brackets on the side plates' upper faces: the 1A3 DK's two rows of four high on each
    // side under a guard loop (Krigsmuseet); the 1A5s' four in two rows at the side's rear (the Aalborg turret, the RAMTA
    // front and the Air Show rear: r10 critics); the AS1's one row of four at mid-side under its guard loop (Esperance)
    if (mark === 'a5' || mark === 'a5dk1') for (const s of [-1, 1] as const) {
      const zc = -0.98, x = outerX(zc, K.dischargerY) - 0.015;
      P.addEquipment('turret', box(0.08, 0.30, 0.52), s * (x + 0.03), K.dischargerY, zc);
      for (let k = 0; k < 4; k++) {
        const row = Math.floor(k / 2), col = k % 2;
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.21, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.30, 0),
          s * (x + 0.11), K.tubeRowY + row * K.tubeRowStepM, zc + 0.12 - col * 0.24);
      }
    }
    if (mark === 'a3') for (const s of [-1, 1] as const) {
      const x = outerX(0.06, K.dischargerY);
      P.addEquipment('turret', box(0.08, 0.30, 0.98), s * (x + 0.03), K.dischargerY, 0.06);
      // (the guard's arms run back into the side plate under its top edge)
      P.addEquipment('turretDark', box(0.028, 0.028, 1.06), s * (x + 0.25), K.guardY, 0.06);
      for (const z of [-0.47, 0.59]) P.addEquipment('turretDark', box(0.30, 0.028, 0.028), s * (x + 0.10), K.guardY, z);
      for (let k = 0; k < 8; k++) {
        const row = Math.floor(k / 4), col = k % 4;
        P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.21, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.30, 0),
          s * (x + 0.11), K.tubeRowY + row * K.tubeRowStepM, 0.42 - col * 0.24);
      }
    }
    if (mark === 'as1') {
      for (const s of [-1, 1] as const) {
        const x = outerX(-0.28, K.dischargerY);
        P.addEquipment('turret', box(0.08, 0.20, 0.98), s * (x + 0.03), K.dischargerY - 0.02, -0.28);
        P.addEquipment('turretDark', box(0.028, 0.028, 1.06), s * (x + 0.25), K.guardY - 0.02, -0.28);
        for (const z of [-0.81, 0.25]) P.addEquipment('turretDark', box(0.30, 0.028, 0.028), s * (x + 0.10), K.guardY - 0.02, z);
        for (let k = 0; k < 4; k++) {
          P.addEquipment('turret', xform(markSmokeTube(cylZ(0.038, 0.21, P.q ? 12 : 8)), 0, 0, 0, -0.62, s * 0.30, 0),
            s * (x + 0.11), K.dischargerY - 0.02, 0.08 - k * 0.24);
        }
      }
      // the SABCA fire control's crosswind sensor on its mast at the roof's right front (the Esperance and service fronts)
      P.addEquipment('turretDark', cylY(0.018, 0.022, 0.42, 8), -0.70, roofAt(0.42) + 0.21, 0.42);
      P.addEquipment('turret', box(0.10, 0.12, 0.06), -0.70, roofAt(0.42) + 0.47, 0.42);
      P.addEquipment('turretDark', box(0.14, 0.02, 0.08), -0.70, roofAt(0.42) + 0.54, 0.42);
    }
  };
  buildLeo1DkTurretFittings();
  yield 'buildLeo1DkTurretFittings';

  // ---------------------------------------------------------------- rear stowage and markings --
  // The bustle: the family's bin round the casting's tail with the whips' bases at its sides (as on the German 1A5 and
  // 1A2A1), which the DK-1 closes into its air-conditioning housing and the AS1 gives up for its own basket.
  const bin = LEO1_BUSTLE_BIN;
  const binZc = (bin.frontZ + bin.rearZ) / 2, binDepth = bin.frontZ - bin.rearZ;
  // (the Danish and Australian whips 2.16 m long, their tips at the photo packets' 4.51 m)
  const whipLength = 2.16;
  const whip = (s: -1 | 1): void => {
    P.addEquipment('turret', box(0.07, 0.08, 0.08), s * 0.60, roofAt(-1.42) - 0.04, -1.42);
    P.addEquipment('turret', antennaPart(cylY(0.014, 0.016, whipLength, 8)), s * 0.60, roofAt(-1.42) + whipLength / 2, -1.42,
      0, 0, s * 0.025);
  };
  const buildLeo1DkTurretRear = (): void => {
    if (mark === 'a5dk1') {
      // The DK-1's air conditioning and Honda generator (Pansermuseet: "a generator and an air conditioning system mounted
      // on the rear of the turret"). r8 (critics on the two DK-1 photographs: the Air Show's rear is one full-width block
      // at the roof's height carrying the markings; the RAMTA front shows only a narrow unit standing over it): the bin
      // closed into the housing, louvred along its sides, its narrow cooling stack over the middle, the GPS dome on its
      // lid, the UN on its rear face
      const z0 = bin.frontZ, z1 = bin.rearZ, zc = binZc, lid = roofAt(bin.frontZ) - 0.02;
      P.addEquipment('turret', box(bin.width, lid - bin.floorY, binDepth), 0, (lid + bin.floorY) / 2, zc);
      for (const s of [-1, 1] as const) {
        whip(s);
        for (let k = 0; k < 5; k++) {
          P.addEquipment('turretFittingPaint', box(0.025, 0.03, z0 - z1 - 0.14), s * (bin.width / 2 + 0.012), lid - 0.10 - k * 0.07, zc);
        }
      }
      // (r9 critics, both: the raised part short and narrow; the RAMTA front photograph's stands about 0.45 of the turret's
      // height)
      const sw = 0.29, sh = 0.46, sd = 0.20;
      P.addEquipment('turret', box(sw * 2, sh, sd * 2), 0, lid + sh / 2, zc);
      P.addEquipment('turret', box(sw * 2 + 0.04, 0.03, sd * 2 + 0.04), 0, lid + sh + 0.015, zc);
      for (const s of [-1, 1] as const) for (let k = 0; k < 4; k++) {
        P.addEquipment('turretFittingPaint', box(0.025, 0.03, sd * 2 - 0.10), s * (sw + 0.008), lid + 0.10 + k * 0.08, zc);
      }
      P.decal('turret', 'stencil', 'UN', 0.50, [0, (lid + bin.floorY) / 2 + 0.02, z1 - 0.012], Math.PI);
      // the GPS antenna: a grey mushroom dome on a short post (r13 Sonnet: the white dome in a dark puck read as a hole in
      // the lid from above, and as no GPS at all)
      P.addEquipment('turretDark', cylY(0.018, 0.022, 0.12, 8), 0.62, lid + 0.06, zc);
      P.addEquipment('turretFittingPaint', xform(sph(0.075, 14, 7), 0, 0, 0, 0, 0, 0, [1, 0.45, 1]), 0.62, lid + 0.12, zc);
      P.addEquipment('turretDark', cylY(0.012, 0.012, 0.14, 8), -0.62, lid + 0.07, zc);
    } else if (mark === 'as1') {
      // the Australian basket on arms from the casting's tail, its top over the bustle's line (the 1st Armoured
      // Regiment's service photographs)
      const basketZ = -2.20 - 0.04 - 0.23;
      mount(P, 'turret', FITTINGS.stowageRack({ mats: P.mats, w: 1.90, d: 0.46, h: 0.50, fill: 0.6, rails: 2, seed: 1761 }),
        0, 0.36, basketZ);
      for (const s of [-1, 1] as const) {
        whip(s);
        P.addEquipment('turretDark', box(0.05, 0.05, 0.22), s * 0.36, 0.38, -2.18 - 0.07);
      }
    } else {
      addLeo1BustleBin(P, { eachSide: whip });
      // (r7 critics: a mound of bundles over the roof; the Krigsmuseet and Aalborg roofs are clear): one pack and the roll
      stowage(P, 'turretCloth', rng, [[-0.50, bin.floorY + 0.20, binZc - 0.06, 0.44, 0.22, 0.36]]);
      tarpRoll(P, 'turretCloth', 0.0, bin.rimY + 0.09, bin.rearZ + 0.10, 1.30, 0.09, true, P.q ? 12 : 8);
    }
    if (mark === 'a5') {
      // the later rear turret rack: a rail frame behind the bin (r7 critics: on the DK-1 it read as a floating frame beside
      // the housing, in neither of its photographs)
      const rz = bin.rearZ - 0.30;
      P.addEquipment('turret', box(1.90, 0.035, 0.035), 0, 0.30, rz);
      P.addEquipment('turret', box(1.90, 0.035, 0.035), 0, 0.68, rz);
      P.addEquipment('turret', box(1.86, 0.025, 0.30), 0, 0.30, bin.rearZ - 0.15);
      for (let k = 0; k < 6; k++) P.addEquipment('turret', box(0.03, 0.38, 0.03), -0.90 + k * 0.36, 0.49, rz);
      for (const x of [-0.92, 0.92]) P.addEquipment('turret', box(0.035, 0.035, 0.32), x, 0.68, bin.rearZ - 0.15);
      jerryCan(P, 'turretCloth', 0.55, 0.47, rz + 0.13, 0.16);
      ammoCan(P, 'turretDark', -0.60, 0.40, rz + 0.12, 0.12);
    } else if (mark === 'a3') {
      ammoCan(P, 'turretDark', -0.72, 0.46, bin.rearZ - 0.08, 0.12);
    }
    P.turretG.userData.leopard1DkTurretReceipt = {
      revision: 'leo1dk-275-family-turret',
      mark,
      familyTurret: bvTurret ? 'cast-bv' : 'cast-one-piece',
      weldedTurret: false,
      roofY: roof,
      emes18: mark === 'a5' || mark === 'a5dk1',
      rangefinderPortsOpen: mark === 'a3',
      sabcaLaserDrum: mark === 'as1',
      airConditioningHousing: mark === 'a5dk1',
    };
    // the hull number on the casting's flank behind the plates (the German 1A5's seat, both sides); the United Nations'
    // black "UN" on the DK-1's white side plates (UNPROFOR, 1994-95)
    for (const s of [-1, 1] as const) {
      P.decal('turret', 'number', P.spec.visual.number || '21', 0.20, [s * (upperFaceX(-1.50, 0.52) + 0.01), 0.52, -1.50],
        s * Math.PI / 2, 0, s * 0.70);
      if (mark === 'a5dk1') P.decal('turret', 'stencil', 'UN', 0.34, [s * (outerX(-0.53, K.stencilY) + 0.004), K.stencilY, -0.53],
        s * Math.PI / 2);
    }
  };
  buildLeo1DkTurretRear();
  yield 'buildLeo1DkTurretRear';

  // ---------------------------------------------------------------- mask and gun --
  // The family mask and the L7A3 (the 1A5's B&V mask with its two-section sleeve; the one-piece casting's mask under
  // buildGun's sleeve); the national searchlight rides the mask's top on a yoke, its rear at the trunnion's station as
  // the German XSW-30-U's is, so it clears the front roof at full elevation.
  const buildLeo1DkGun = (): void => {
    const maskReceipt = bvTurret ? addLeo1BvMantlet(P, { xsw30Searchlight: false }) : addLeo1OnePieceMantlet(P);
    const k = mask;
    const yoke = (lamp: { x: number; halfWidth: number; low: number; high: number; rearZ: number; frontZ: number }): void => {
      const lampY = (lamp.low + lamp.high) / 2, lampZ = (lamp.rearZ + lamp.frontZ) / 2;
      const foot = leo1MaskTopAt(k, lampZ) - 0.015;
      for (const s of [-1, 1] as const) {
        P.add('gunMount', box(0.04, lampY - foot, 0.09), lamp.x + s * (lamp.halfWidth + 0.045), (lampY + foot) / 2, lampZ);
        P.add('gunMountDark', cylX(0.045, 0.06, 12), lamp.x + s * (lamp.halfWidth + 0.02), lampY, lampZ);
      }
      P.add('gunMount', box(lamp.halfWidth * 2 + 0.13, 0.04, 0.09), lamp.x, foot + 0.01, lampZ);
    };
    // each lamp stands 0.04 m over the mask's top and starts at the trunnion's station
    const seat = <L extends { low: number; high: number; rearZ: number; frontZ: number }>(lamp: L): L => {
      const dy = k.high + 0.04 - lamp.low, dz = -lamp.rearZ;
      return { ...lamp, low: lamp.low + dy, high: lamp.high + dy, rearZ: lamp.rearZ + dz, frontZ: lamp.frontZ + dz };
    };
    if (mark === 'a3') {
      // the XSW-30-U infrared / white-light searchlight on the mask, as on every early Leopard 1 (r7 critics: dead centre
      // and high; on the A3 and A4 it rides the mask's top to the gun's left, low)
      const lamp = seat({ x: 0.20, halfWidth: 0.22, low: 0.29, high: 0.62, rearZ: -0.16, frontZ: 0.14, lensR: 0.145 });
      const lampY = (lamp.low + lamp.high) / 2;
      P.add('gunMount', sectionSolid([
        { z: lamp.rearZ, ring: maskRing(lamp.halfWidth, lamp.low, lamp.high, 0.04) },
        { z: lamp.frontZ, ring: maskRing(lamp.halfWidth, lamp.low, lamp.high, 0.04) },
      ]), lamp.x, 0, 0);
      P.add('gunMountDark', cylZ(lamp.lensR + 0.03, 0.03, P.q ? 28 : 18), lamp.x, lampY, lamp.frontZ + 0.012);
      P.add('gunMountGlass', markVehicleNightLens(cylZ(lamp.lensR, 0.008, P.q ? 28 : 18), 'headlight', { searchlight: true }),
        lamp.x, lampY, lamp.frontZ + 0.029);
      // the shutter's hinge bar and the lamp's cooling fins along its top
      P.add('gunMountDark', box(lamp.halfWidth * 2 - 0.06, 0.03, 0.03), lamp.x, lamp.high - 0.02, lamp.frontZ + 0.02);
      for (let f = 0; f < 4; f++) P.add('gunMountDark', box(0.02, 0.035, lamp.frontZ - lamp.rearZ - 0.06), lamp.x - 0.12 + f * 0.08,
        lamp.high + 0.015, (lamp.rearZ + lamp.frontZ) / 2);
      yoke(lamp);
    } else if (mark === 'a5dk1') {
      // the M41 DK-1's halogen searchlight, taken over when the M41s left: a round lamp on a low yoke over the mask
      // (r7 critics: the A3's drum without its hood, centred; the DK-1's is its own smaller halogen box, to the gun's left)
      const lamp = seat({ x: 0.20, halfWidth: 0.13, low: 0.30, high: 0.54, rearZ: -0.08, frontZ: 0.12 });
      const lampY = (lamp.low + lamp.high) / 2;
      P.add('gunMount', box(lamp.halfWidth * 2, lamp.high - lamp.low, lamp.frontZ - lamp.rearZ), lamp.x, lampY, (lamp.rearZ + lamp.frontZ) / 2);
      P.add('gunMountDark', cylZ(0.095, 0.02, P.q ? 24 : 16), lamp.x, lampY, lamp.frontZ + 0.008);
      // the clear lens over its silvered reflector, in the mount's pale paint, the bulb cap at its centre (r13 Sonnet: the
      // tinted glass read as the EMES windows' dark green)
      P.add('gunMount', markVehicleNightLens(cylZ(0.08, 0.008, P.q ? 24 : 16), 'headlight', { searchlight: true }),
        lamp.x, lampY, lamp.frontZ + 0.02);
      P.add('gunMountDark', cylZ(0.022, 0.008, 12), lamp.x, lampY, lamp.frontZ + 0.026);
      // r4 (critics: a bare lens in a ring read as a camera): the lamp's rain hood over the lens (r6: its guard bars read
      // as a grille; gone)
      P.add('gunMountDark', box(lamp.halfWidth * 2 + 0.04, 0.02, 0.09), lamp.x, lamp.high + 0.01, lamp.frontZ + 0.03, -0.12, 0, 0);
      yoke(lamp);
    } else if (mark === 'a5') {
      // the 1A5 DK's light in its armoured box over the mask to the gun's left, its front door shut (the Aalborg turret;
      // r8 critics, both: the box with its lid up on the roof's brow stood where the photograph has only a periscope)
      const lamp = seat({ x: 0.20, halfWidth: 0.20, low: 0.30, high: 0.57, rearZ: -0.14, frontZ: 0.12 });
      const lampY = (lamp.low + lamp.high) / 2;
      P.add('gunMount', box(lamp.halfWidth * 2, lamp.high - lamp.low, lamp.frontZ - lamp.rearZ), lamp.x, lampY, (lamp.rearZ + lamp.frontZ) / 2);
      P.add('gunMount', box(lamp.halfWidth * 2 - 0.05, lamp.high - lamp.low - 0.05, 0.025), lamp.x, lampY, lamp.frontZ + 0.012);
      P.add('gunMountDark', box(lamp.halfWidth * 2 - 0.08, 0.025, 0.03), lamp.x, lamp.high - 0.035, lamp.frontZ + 0.03);
      for (const dx of [-0.11, 0.11]) P.add('gunMountDark', box(0.04, 0.05, 0.03), lamp.x + dx, lamp.low + 0.06, lamp.frontZ + 0.03);
      P.add('gunMount', box(lamp.halfWidth * 2 + 0.02, 0.02, lamp.frontZ - lamp.rearZ + 0.02), lamp.x, lamp.high + 0.01, (lamp.rearZ + lamp.frontZ) / 2);
      yoke(lamp);
    }
    // (the AS1 carries no searchlight: none of its photographs shows one on the mask) The 1A5 DK added the muzzle
    // reference collimator.
    if (mark === 'a5' || mark === 'a5dk1') {
      P.add('gunDark', box(0.075, 0.07, 0.16), 0, 0.165, 4.20);
      P.add('gunDark', box(0.02, 0.09, 0.028), 0, 0.105, 4.22);
    }
    P.gunG.userData.leopard1DkMaskReceipt = {
      ...maskReceipt,
      familyMask: bvTurret ? 'cast-bv' : 'cast-one-piece',
      searchlight: mark === 'a3' ? 'XSW-30-U' : mark === 'a5dk1' ? 'M41 DK-1 halogen' : mark === 'a5' ? 'armoured box' : null,
      muzzleReference: mark === 'a5' || mark === 'a5dk1',
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
export const buildLeopardAS1 = steppedBuilder((P: TankBuilderPort) => buildLeo1DkSteps(P, 'as1'));
