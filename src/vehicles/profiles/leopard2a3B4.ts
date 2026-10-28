// The Leopard 2A3 of the fourth batch (release 262; Main 2026-10-27: one new tank "built on the same new first-party
// Leopard construction as the Christian II", the current 2A3 shown as the "Leopard 2A2 OTCO"). A fresh first-party build:
// the release's Leopard 2-pattern hull and seven-wheel gear (leopard2Hull.ts) with the fourth batch's round-rod exhaust
// grilles, and its own vertical-faced turret at the Christian II concept model's measured Leopard 2 turret proportions
// (read for proportions only; nothing traced): two cheek blocks with chamfered outer corners framing the mantlet in its
// slot, the EMES 15 sight bay on the right front of the roof, the commander's PERI R17 and hatch with its periscope
// ring right, the loader's hatch and MG3 left, the ammunition hatch on the left wall, smoke dischargers forward of the
// side bins, the stepped bustle with its rear basket, the SEM 80/90 radios' short antenna bases and the crosswind mast.
//
// Frames: hull metres on the hull (+Z forward, y up from the ground; the world's right of a +Z hull is -X); turret metres
// from the ring's centre on the deck (world 0, 1.64, 0.37). The datums are leopard2a3B4Armor.ts's.
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { buildLeopard2Hull, mirrorRing } from './leopard2Hull.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { LEO2A3B4_TURRET } from '../leopard2a3B4Armor.ts';

const T = LEO2A3B4_TURRET;

/** A welded section, counter-clockwise from +Z: chamfered lower corners, vertical walls, a bevelled roof edge. */
function shellRing(hw: number, bottom: number, shoulder: number, roof: number, foot = 0.05, bevel = 0.07): SectionPoint[] {
  return [
    [-hw + foot, bottom], [hw - foot, bottom], [hw, bottom + foot], [hw, shoulder],
    [hw - bevel, roof], [-hw + bevel, roof], [-hw, shoulder], [-hw, bottom + foot],
  ];
}

/** The welded shell from the bustle's rear plate to the cheeks' root, the roof falling toward the front. */
function turretShell(P: TankBuilderPort): void {
  const s = (z: number, hw: number, bottom: number, shoulder: number, roof: number): SolidSection =>
    ({ z, ring: shellRing(hw, bottom, shoulder, roof) });
  P.add('turret', sectionSolid([
    s(T.rearZ, T.rearHalfWidthM, 0.27, 0.76, 0.80),
    s(-2.45, T.bustleHalfWidthM, T.bustleFloorY, 0.78, T.roofY),
    // the bustle's floor eases up from the ring to its full 0.21 m only behind the step
    s(T.stepZ - 0.04, T.bustleHalfWidthM, 0.17, 0.78, T.roofY + 0.005),
    s(T.stepZ, T.halfWidthM, 0.16, 0.78, T.roofY + 0.005),
    s(-1.29, T.halfWidthM, 0.12, 0.78, T.roofY + 0.005),
    s(-0.87, T.halfWidthM, T.floorY, 0.78, T.roofY),
    s(-0.40, T.halfWidthM, T.floorY, 0.77, T.roofY),
    s(T.cornerZ, T.halfWidthM, T.floorY, 0.66, 0.70),
  ], { sideQuadDiagonal: 'convex' }));
}

/** The two cheek blocks: vertical faces either side of the gun slot, the outer corners chamfered back to the walls. */
function cheeks(P: TankBuilderPort): void {
  const { box } = KIT;
  const inner = T.slotHalfWidthM, z0 = T.cornerZ, z1 = T.frontZ, hw = T.halfWidthM;
  const right: SolidSection[] = [
    { z: z0 - 0.02, ring: [[-hw, T.floorY], [-inner, T.floorY], [-inner, 0.70], [-hw, 0.70]] },
    { z: z1, ring: [[-T.frontHalfWidthM, T.floorY + 0.02], [-inner, T.floorY + 0.02], [-inner, T.roofFrontY], [-T.frontHalfWidthM, T.roofFrontY]] },
  ];
  P.add('turret', sectionSolid(right));
  P.add('turret', sectionSolid(right.map((st) => ({ z: st.z, ring: mirrorRing(st.ring) }))));
  for (const sx of [-1, 1]) {
    // the welded joint between the front plate and the cheek's side, and the lifting lugs on the brow
    P.add('turretDark', box(0.012, 0.60, 0.012), sx * (inner + 0.012), 0.33, z1 + 0.002);
    P.add('turretDetail', box(0.08, 0.05, 0.06), sx * 0.80, T.roofFrontY + 0.02, z1 - 0.10);
  }
}

/** The mantlet in the slot, the coaxial MG3's port on its left, the 120 mm L/44 with its thermal sleeves. */
function gunAssembly(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  P.gunG.position.set(T.gunLocal[0], T.gunLocal[1], T.gunLocal[2]);
  P.addGunExtra(sectionSolid([
    { z: -0.10, ring: [[-0.33, -0.25], [0.33, -0.25], [0.33, 0.22], [-0.33, 0.22]] },
    { z: 0.33, ring: [[-0.33, -0.25], [0.33, -0.25], [0.33, 0.22], [-0.33, 0.22]] },
    { z: 0.41, ring: [[-0.30, -0.22], [0.30, -0.22], [0.30, 0.18], [-0.30, 0.18]] },
  ]), 0, 0, 0);
  P.addGunExtra(cylZ(0.15, 0.10, P.q ? 20 : 12), 0, 0, 0.46);
  P.addGunExtraDark(cylZ(0.026, 0.06, 8), 0.22, 0.06, 0.43);                    // coaxial MG3 port
  KIT.buildGun(P, { len: T.barrelLengthM, r: T.barrelRadiusM, sleeve: true, evac: 0.56, evacR: 1.78, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: T.barrelLengthM, r: T.barrelRadiusM });
}

/** The EMES 15 sight bay in the right cheek's roof: an armoured housing, its window and the door frames. */
function emes15(P: TankBuilderPort): void {
  const { box } = KIT;
  const x = -0.72, z = 0.86;
  P.add('turret', box(0.44, 0.26, 0.60), x, 0.79, z);
  P.add('turretDetail', box(0.48, 0.03, 0.64), x, 0.935, z);
  P.add('turretGlass', box(0.30, 0.11, 0.016), x, 0.80, z + 0.302);
  for (const dx of [-0.17, 0.17]) P.add('turretDark', box(0.012, 0.20, 0.014), x + dx, 0.79, z + 0.303);
  P.add('turretDark', box(0.40, 0.012, 0.014), x, 0.885, z + 0.303);
}

/** The commander's PERI R17 and hatch with its periscope ring (right), the loader's hatch and MG3 (left). */
function roofFittings(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  // PERI R17: a drum on a raised base, its head's window forward
  P.add('turret', cylY(0.15, 0.17, 0.12, P.q ? 20 : 12), -0.98, T.roofY + 0.06, 0.18);
  P.add('turretDetail', cylY(0.11, 0.12, 0.12, P.q ? 18 : 12), -0.98, T.roofY + 0.18, 0.18);
  P.add('turretDetail', box(0.24, 0.18, 0.22), -0.98, T.roofY + 0.33, 0.18);
  P.add('turretGlass', box(0.16, 0.08, 0.016), -0.98, T.roofY + 0.34, 0.298);
  P.add('turretDetail', box(0.28, 0.03, 0.26), -0.98, T.roofY + 0.435, 0.18);
  // the commander's ring stands its eight periscopes 15 cm over the roof
  const cx = -0.78, cz = -0.48;
  P.add('turret', cylY(0.38, 0.40, 0.15, P.q ? 28 : 16), cx, T.roofY + 0.07, cz);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    P.add('turretDetail', box(0.10, 0.07, 0.05), cx + Math.sin(a) * 0.35, T.roofY + 0.17, cz + Math.cos(a) * 0.35, 0, a, 0);
    P.add('turretGlass', box(0.07, 0.035, 0.012), cx + Math.sin(a) * 0.376, T.roofY + 0.175, cz + Math.cos(a) * 0.376, 0, a, 0);
  }
  P.addHatch('turretHatch', cylY(0.28, 0.28, 0.04, P.q ? 24 : 14), cx, T.roofY + 0.165, cz);
  P.add('turretDark', box(0.30, 0.025, 0.04), cx, T.roofY + 0.19, cz - 0.20);
  // the loader's flat hatch on its ring, the MG3 on the ring's mount
  const lx = 0.62, lz = -0.52;
  P.add('turret', cylY(0.34, 0.35, 0.06, P.q ? 24 : 14), lx, T.roofY + 0.025, lz);
  P.addHatch('turretHatch', cylY(0.29, 0.29, 0.03, P.q ? 24 : 14), lx, T.roofY + 0.07, lz);
  P.add('turretDark', box(0.28, 0.022, 0.035), lx, T.roofY + 0.09, lz - 0.20);
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mg3', tone: 'two-tone', seed: 2623, rotation: [0, 0.10, 0],
    working: true, ridingCradle: true });
  mg.name = 'leo2a3b4LoaderMG3';
  mg.position.set(lx + 0.10, T.roofY + 0.09, lz - 0.16);
  P.turretG.add(mg);
  // the crosswind sensor mast and the lifting eyes
  P.add('turretDetail', cylY(0.012, 0.016, 0.30, 8), 0, T.roofY + 0.15, -2.30);
  P.add('turretDark', box(0.05, 0.05, 0.12), 0, T.roofY + 0.32, -2.30);
  for (const [x, z] of [[1.05, 0.55], [-0.30, 0.70], [0.95, -1.95], [-0.95, -1.95]]) {
    KIT.liftEye(P, 'turretDetail', x, T.roofY - (z > 0.4 ? 0.06 : 0) + 0.015, z);
  }
}

/** The side bins, the smoke dischargers ahead of them, the ammunition hatch (left wall), the short antenna bases. */
function flankEquipment(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  for (const sx of [-1, 1]) {
    P.add('turretDetail', box(0.27, 0.44, 0.50), sx * (T.halfWidthM + 0.135), 0.52, -1.32);
    P.add('turretDark', box(0.275, 0.012, 0.46), sx * (T.halfWidthM + 0.136), 0.70, -1.32);
    for (const z of [-0.98, -0.72]) {
      const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.04, len: 0.26, splay: sx * 0.80, pitch: -0.48,
        arc: 0.5, slot: 'detail', seed: 26230 + (sx > 0 ? 1 : 0) + (z > -0.8 ? 2 : 0) });
      bank.position.set(sx * (T.halfWidthM + 0.09), 0.50, z);
      P.turretG.add(bank);
    }
    P.add('turretDetail', box(0.10, 0.06, 0.60), sx * (T.halfWidthM + 0.05), 0.40, -0.85);
    // the SEM 80/90 radios' short antenna bases on the bustle roof, their whips
    P.add('turretDetail', cylY(0.05, 0.06, 0.08, 10), sx * 0.80, T.roofY + 0.04, -2.25);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.20, r: 0.011, seed: 26240 + (sx > 0 ? 1 : 0),
      rotation: [-0.06, 0, 0] });
    whip.position.set(sx * 0.80, T.roofY + 0.08, -2.25);
    P.turretG.add(whip);
  }
  // the ammunition hatch on the left (loader's) wall, as built: a raised plate on its frame, the hinge line and a handle
  P.add('turretDetail', box(0.035, 0.38, 0.54), T.halfWidthM + 0.0175, 0.42, -0.30);
  P.add('turretDark', box(0.037, 0.012, 0.52), T.halfWidthM + 0.019, 0.615, -0.30);
  P.add('turretDetail', box(0.03, 0.03, 0.14), T.halfWidthM + 0.05, 0.38, -0.30);
}

/** The bustle's rear plate and the open basket hung off it. */
function rearBasket(P: TankBuilderPort): void {
  const { box } = KIT;
  const z = T.rearZ, back = z - 0.34, top = 0.66, low = 0.28;
  for (const y of [low, (low + top) / 2, top]) P.add('turretDetail', box(1.74, 0.035, 0.035), 0, y, back);
  for (let k = 0; k <= 8; k++) P.add('turretDetail', box(0.03, top - low, 0.03), -0.86 + k * 0.215, (low + top) / 2, back);
  for (const sx of [-1, 1]) {
    for (const y of [low, top]) P.add('turretDetail', box(0.035, 0.035, 0.36), sx * 0.87, y, z - 0.16);
  }
  P.add('turretDark', KIT.openRackGrid(1.70, 0.32, 0.016, 5, 9), 0, low + 0.02, z - 0.17);
  KIT.stowage(P, 'turretCloth', P.rng, [
    [-0.48, low + 0.16, z - 0.18, 0.58, 0.30, 0.26], [0.26, low + 0.15, z - 0.19, 0.52, 0.28, 0.25],
  ]);
}

function turret(P: TankBuilderPort): void {
  P.turretG.position.set(T.pivot[0], T.pivot[1], T.pivot[2]);
  P.add('turret', KIT.cylY(1.00, 1.00, 0.03, P.q ? 48 : 24), 0, 0.013, 0);                       // ring guard
  turretShell(P);
  cheeks(P);
  gunAssembly(P);
  emes15(P);
  roofFittings(P);
  flankEquipment(P);
  rearBasket(P);
  for (const side of [-1, 1]) P.decal('turret', 'number', null, 0.24, [side * (T.halfWidthM + 0.002), 0.42, 0.40], side * Math.PI / 2);
}

function buildLeopard2A3B4(P: TankBuilderPort): void {
  buildLeopard2Hull(P, { flapName: 'leo2a3b4-rear-flap', exhaust: 'rods' });
  turret(P);
  P.topY = 1.24;
}

export const LEOPARD2A3B4_PROFILES = {
  leo2a3_b4: { build: buildLeopard2A3B4 },
} satisfies VehicleProfileRecord;
