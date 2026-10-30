// The Christian II (release 262): a fictional Danish Army concept MBT, a fresh first-party build (the owner, 2026-10-27:
// "the christian 2 is based off the leopard, take innnspo from japanese type 90. but dress it in a ton of netting and
// ghillie", then "the new leo ... should rightfully be based on the new model and use totally new tank generation. the
// type 90 is a separate tank"). A Leopard 2-pattern hull and seven-wheel running gear at the supplied concept model's
// measured proportions, carrying our own Type 90-inspired turret: one long slab-sided box with a stepped, narrower
// autoloader bustle, two bolt-on frontal modules swept back in plan from the gun slot (the supplied model's arrowhead) and
// a box mantlet flush between them,
// the gunner's armoured sight box on the right front of the roof and the commander's stabilised panoramic head on the
// left. The supplied model was read for proportions only; nothing of it is traced or shipped
// (docs/references/tanks/christian2.md; docs/references/concepts/christian2-20261027.json). Heavy field netting and garnish
// ride over it (ghillieFleetSuits.ts christian2).
//
// Frames: hull metres on the hull (+Z forward, y up from the ground; the world's right of a +Z hull is -X); turret metres
// from the ring's centre on the deck (world 0, 1.64, 0.37). The hull and running gear are the release's Leopard 2-pattern
// construction (leopard2Hull.ts); the turret datums are christian2Armor.ts's. The gunner, the gunner's
// sight and the driver sit on the right (-X), the commander's cupola, panoramic sight and the working 12.7 mm on the left
// (+X), the autoloader in the bustle.
import { KIT, FITTINGS, muzzleBore, convexSlab } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { addLeopard2SternRackFloor, buildLeopard2Hull } from './leopard2Hull.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { CHRISTIAN2_TURRET, christian2ModuleFaceZ } from '../christian2Armor.ts';

const T = CHRISTIAN2_TURRET;

// ---- the turret --------------------------------------------------------------------------------------------------

/** A welded section, counter-clockwise from +Z: chamfered lower corners, vertical walls, a bevelled roof edge. */
function shellRing(hw: number, bottom: number, shoulder: number, roof: number, foot = 0.05, bevel = 0.09): SectionPoint[] {
  return [
    [-hw + foot, bottom], [hw - foot, bottom], [hw, bottom + foot], [hw, shoulder],
    [hw - bevel, roof], [-hw + bevel, roof], [-hw, shoulder], [-hw, bottom + foot],
  ];
}

/** The main shell: bustle, the 12 cm step out to the fighting compartment, the compartment over the ring. */
function turretShell(P: TankBuilderPort): void {
  const s = (z: number, hw: number, bottom: number, shoulder: number, roof: number): SolidSection =>
    ({ z, ring: shellRing(hw, bottom, shoulder, roof) });
  P.add('turret', sectionSolid([
    s(T.rearZ, 0.86, 0.27, 0.74, 0.80),
    s(-2.40, T.bustleHalfWidthM, T.bustleFloorY, 0.76, 0.82),
    s(T.stepZ - 0.04, T.bustleHalfWidthM, T.bustleFloorY, 0.77, T.roofRearY),
    s(T.stepZ, T.halfWidthM, T.bustleFloorY, 0.77, T.roofRearY),
    s(-1.10, T.halfWidthM, T.bustleFloorY, 0.77, 0.825),
    s(-1.06, T.halfWidthM, T.floorY, 0.77, 0.825),
    s(0.86, T.halfWidthM, T.floorY, 0.75, 0.79),
    s(T.coreFrontZ, T.halfWidthM, T.floorY, 0.73, T.roofFrontY),
  ], { sideQuadDiagonal: 'convex' }));
}

/**
 * Two bolt-on frontal modules either side of the gun slot, their faces swept back in plan from the slot's edges to the side
 * walls at the shell's front (the supplied model's arrowhead), vertical from the floor, their tops falling 7 cm forward to
 * the faces' tips. Each is one convex piece from 2 cm inside the shell's front, its outer side 3 mm inside the wall's
 * plane; the bolted seams and the bolt heads stand square to the face.
 */
function frontalModules(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const inner = T.slotHalfWidthM, hw = T.halfWidthM - 0.003, root = T.coreFrontZ - 0.02, lo = 0.04;
  const face = christian2ModuleFaceZ, zi = face(inner), zo = face(hw);
  const fall = (T.moduleTopY - T.moduleNoseTopY) / (zi - root);
  const topAt = (z: number): number => T.moduleTopY - (z - root) * fall;
  const sweep = Math.atan2(T.moduleFrontZ - T.coreFrontZ, T.halfWidthM - T.slotHalfWidthM);
  for (const sx of [-1, 1]) {
    P.add('turret', convexSlab(
      [sx * inner, lo, root], [sx * hw, lo, root], [sx * hw, lo, zo], [sx * inner, lo, zi],
      [sx * inner, T.moduleTopY, root], [sx * hw, T.moduleTopY, root], [sx * hw, topAt(zo), zo], [sx * inner, topAt(zi), zi],
    ));
    for (const x of [0.65, 0.95]) {
      const top = topAt(face(x)) - 0.03;
      P.add('turretDark', box(0.012, top - 0.08, 0.012), sx * x, (top + 0.08) / 2, face(x) + 0.004, 0, sx * sweep, 0);
    }
    for (const y of [0.16, 0.54]) for (const x of [0.50, 0.80, 1.10]) {
      P.add('turretDetail', cylZ(0.022, 0.016, 8), sx * x, y, face(x) + 0.006, 0, sx * sweep, 0);
    }
  }
}

/**
 * The pitching box mantlet in the slot, its face flush with the modules' tips (the supplied model's), its underside rising
 * 11 cm over its front 0.30 m so that, traversed over the engine deck, it keeps clear of the deck's net at the published
 * stops; the coax port beside the bore and the 120 mm L/44-class tube.
 */
function gunAssembly(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  const m = T.mantletFaceZ;
  P.gunG.position.set(T.gunLocal[0], T.gunLocal[1], T.gunLocal[2]);
  P.addGunExtra(sectionSolid([
    { z: -0.10, ring: [[-0.30, -0.23], [0.30, -0.23], [0.30, 0.23], [-0.30, 0.23]] },
    { z: m - 0.30, ring: [[-0.30, -0.23], [0.30, -0.23], [0.30, 0.23], [-0.30, 0.23]] },
    { z: m - 0.10, ring: [[-0.30, -0.157], [0.30, -0.157], [0.30, 0.23], [-0.30, 0.23]] },
    { z: m, ring: [[-0.27, -0.12], [0.27, -0.12], [0.27, 0.16], [-0.27, 0.16]] },
  ]), 0, 0, 0);
  P.addGunExtra(cylZ(0.15, 0.10, P.q ? 20 : 12), 0, 0, m + 0.05);
  P.addGunExtraDark(cylZ(0.026, 0.06, 8), 0.205, 0.07, m + 0.025);             // coaxial MG port
  P.addGunExtraDark(box(0.13, 0.08, 0.015), -0.17, 0.11, m + 0.003);           // the gun's own sight aperture plate
  KIT.buildGun(P, { len: T.barrelLengthM, r: T.barrelRadiusM, sleeve: true, evac: 0.56, evacR: 1.78, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: T.barrelLengthM, r: T.barrelRadiusM });
}

/** Gunner's armoured sight box (right front) and the commander's panoramic head (left front). */
function roofSights(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  P.add('turret', box(0.50, 0.28, 0.48), -0.62, 0.90, 0.64);
  P.add('turretDetail', box(0.54, 0.035, 0.16), -0.62, 1.055, 0.91);
  P.add('turretGlass', box(0.36, 0.13, 0.016), -0.62, 0.93, 0.886);
  P.add('turretDark', box(0.42, 0.012, 0.03), -0.62, 0.855, 0.89);
  P.add('turretDetail', cylY(0.14, 0.16, 0.20, P.q ? 18 : 12), 0.62, 0.88, 0.52);
  P.add('turretDetail', box(0.30, 0.20, 0.30), 0.62, 1.08, 0.52);
  P.add('turretDetail', box(0.32, 0.03, 0.32), 0.62, 1.195, 0.52);
  P.add('turretGlass', box(0.20, 0.11, 0.016), 0.62, 1.08, 0.677);
  for (const sx of [-1, 1]) {
    P.add('turretDetail', box(0.12, 0.07, 0.10), sx * 1.12, 0.78, 0.82);
    P.add('turretGlass', box(0.07, 0.035, 0.012), sx * 1.12, 0.785, 0.875);
  }
}

/** The commander's cupola (left) with vision blocks and a working M2, the gunner's hatch (right), the bustle roof. */
function roofHatches(P: TankBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // the cupola stands its vision blocks 20 cm over the roof (their views pass over the roof's net)
  const cx = 0.60, cz = -0.34;
  P.add('turret', cylY(0.36, 0.38, 0.19, P.q ? 28 : 16), cx, 0.90, cz);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    P.add('turretDetail', box(0.11, 0.07, 0.05), cx + Math.sin(a) * 0.33, 1.01, cz + Math.cos(a) * 0.33, 0, a, 0);
    P.add('turretGlass', box(0.08, 0.035, 0.012), cx + Math.sin(a) * 0.357, 1.015, cz + Math.cos(a) * 0.357, 0, a, 0);
  }
  P.addHatch('turretHatch', cylY(0.27, 0.27, 0.04, P.q ? 24 : 14), cx, 1.015, cz);
  P.add('turretDark', box(0.30, 0.025, 0.04), cx, 1.04, cz - 0.20);
  P.add('turret', cylY(0.30, 0.31, 0.05, P.q ? 24 : 14), -0.62, 0.825, -0.28);
  P.addHatch('turretHatch', cylY(0.26, 0.26, 0.03, P.q ? 24 : 14), -0.62, 0.86, -0.28);
  P.add('turretDark', box(0.26, 0.022, 0.035), -0.62, 0.878, -0.48);
  for (const sx of [-1, 1]) {
    P.addHatch('turretHatch', box(0.84, 0.03, 0.84), sx * 0.56, 0.835, -2.12);
    P.add('turretDark', box(0.86, 0.006, 0.86), sx * 0.56, 0.826, -2.12);
  }
  // the M2 on the cupola's rear-outboard rim, laid forward and out so its barrel passes outboard of the panoramic head
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 2621, rotation: [0, 0.38, 0],
    working: true, ridingCradle: true });
  mg.name = 'christian2CommanderM2';
  mg.position.set(cx + 0.12, 1.04, cz - 0.20);
  P.turretG.add(mg);
  P.add('turretDetail', cylY(0.012, 0.016, 0.26, 8), 0, 0.95, -1.38);
  P.add('turretDark', box(0.05, 0.05, 0.12), 0, 1.09, -1.38);
  for (const [x, z] of [[1.0, 0.50], [-1.0, 0.50], [0.9, -1.65], [-0.9, -1.65]]) {
    P.add('turretDetail', cylZ(0.04, 0.03, 10), x, 0.84, z);
  }
}

/** Flank stowage bins on the bustle, side rails, the smoke banks forward and the whips aft. */
function flankEquipment(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const sx of [-1, 1]) {
    P.add('turretDetail', box(0.11, 0.40, 0.78), sx * (T.bustleHalfWidthM + 0.055), 0.52, -2.02);
    P.add('turretDark', box(0.115, 0.012, 0.74), sx * (T.bustleHalfWidthM + 0.056), 0.66, -2.02);
    for (const z of [-1.72, -2.32]) P.add('turretDark', box(0.12, 0.05, 0.04), sx * (T.bustleHalfWidthM + 0.06), 0.56, z);
    // the grab rail ends 12 cm short of the smoke bank's plate
    P.add('turretDetail', box(0.022, 0.022, 1.20), sx * (T.halfWidthM + 0.035), 0.62, -0.50);
    for (const z of [-1.05, -0.50, 0.05]) P.add('turretDetail', box(0.04, 0.05, 0.02), sx * (T.halfWidthM + 0.018), 0.62, z);
    const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.042, len: 0.28, splay: sx * 0.95, pitch: -0.42,
      arc: 0.85, slot: 'detail', seed: 26210 + (sx > 0 ? 1 : 0) });
    bank.position.set(sx * (T.halfWidthM + 0.10), 0.46, 0.36);
    P.turretG.add(bank);
    P.add('turretDetail', box(0.12, 0.06, 0.44), sx * (T.halfWidthM + 0.06), 0.37, 0.36);
    // a stowage box on each compartment wall behind the smoke bank
    P.add('turretDetail', box(0.10, 0.30, 0.56), sx * (T.halfWidthM + 0.05), 0.44, -0.95);
    P.add('turretDark', box(0.104, 0.012, 0.52), sx * (T.halfWidthM + 0.052), 0.56, -0.95);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.30, r: 0.011, seed: 26220 + (sx > 0 ? 1 : 0),
      rotation: [-0.06, 0, 0] });
    whip.position.set(sx * 0.92, 0.81, -2.46);
    P.turretG.add(whip);
  }
}

/** The bustle's rear magazine door and the open basket hung off the rear face. */
function rearBasket(P: TankBuilderPort): void {
  const { box } = KIT;
  const z = T.rearZ;
  P.add('turretDark', box(0.80, 0.012, 0.012), 0, 0.68, z - 0.004);
  P.add('turretDark', box(0.80, 0.012, 0.012), 0, 0.38, z - 0.004);
  for (const sx of [-1, 1]) P.add('turretDark', box(0.012, 0.31, 0.012), sx * 0.40, 0.53, z - 0.004);
  const back = z - 0.36, top = 0.66, low = 0.28;
  for (const y of [low, (low + top) / 2, top]) P.add('turretDetail', box(1.86, 0.035, 0.035), 0, y, back);
  for (let k = 0; k <= 8; k++) P.add('turretDetail', box(0.03, top - low, 0.03), -0.92 + k * 0.23, (low + top) / 2, back);
  for (const sx of [-1, 1]) {
    for (const y of [low, top]) P.add('turretDetail', box(0.035, 0.035, 0.38), sx * 0.93, y, z - 0.17);
    P.add('turretDetail', box(0.035, top - low, 0.035), sx * 0.93, (low + top) / 2, back);
  }
  P.add('turretDark', KIT.openRackGrid(1.82, 0.34, 0.016, 5, 9), 0, low + 0.02, z - 0.18);
  KIT.stowage(P, 'turretCloth', P.rng, [
    [-0.52, low + 0.17, z - 0.19, 0.62, 0.32, 0.27], [0.22, low + 0.16, z - 0.20, 0.56, 0.30, 0.26],
  ]);
  KIT.tarpRoll(P, 'turretCloth', 0.66, low + 0.11, z - 0.19, 0.42, 0.09, true, P.q ? 12 : 8);
}

function turret(P: TankBuilderPort): void {
  P.turretG.position.set(T.pivot[0], T.pivot[1], T.pivot[2]);
  P.add('turret', KIT.cylY(1.00, 1.00, 0.03, P.q ? 48 : 24), 0, 0.013, 0);                       // ring guard
  turretShell(P);
  frontalModules(P);
  gunAssembly(P);
  roofSights(P);
  roofHatches(P);
  flankEquipment(P);
  rearBasket(P);
  for (const side of [-1, 1]) P.decal('turret', 'number', null, 0.24, [side * (T.halfWidthM + 0.002), 0.42, -0.72], side * Math.PI / 2);
}

function buildChristian2(P: TankBuilderPort): void {
  buildLeopard2Hull(P, { flapName: 'christian2-rear-flap', exhaust: 'louvre' });
  addLeopard2SternRackFloor(P);
  turret(P);
  P.topY = 1.24;
  addVehicleGhillieSuit(P);
}

export const CHRISTIAN2_PROFILES = {
  christian2: { build: buildChristian2 },
} satisfies VehicleProfileRecord;
