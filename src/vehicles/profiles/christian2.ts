// The Christian II (release 262): a fictional Danish Army concept MBT, a fresh first-party build (the owner, 2026-10-27:
// "the christian 2 is based off the leopard, take innnspo from japanese type 90. but dress it in a ton of netting and
// ghillie", then "the new leo ... should rightfully be based on the new model and use totally new tank generation. the
// type 90 is a separate tank"). A Leopard 2-pattern hull and seven-wheel running gear at the supplied concept model's
// measured proportions, carrying our own Type 90-inspired turret: one long slab-sided box with a stepped, narrower
// autoloader bustle, two bolt-on frontal modules with chamfered outer corners framing the gun slot and a box mantlet in it,
// the gunner's armoured sight box on the right front of the roof and the commander's stabilised panoramic head on the
// left. The supplied model was read for proportions only; nothing of it is traced or shipped
// (docs/references/tanks/christian2.md; docs/references/concepts/christian2-20261027.json). Heavy field netting and garnish
// ride over it (ghillieFleetSuits.ts christian2).
//
// Frames: hull metres on the hull (+Z forward, y up from the ground; the world's right of a +Z hull is -X); turret metres
// from the ring's centre on the deck (world 0, 1.64, 0.37); the datums are christian2Armor.ts's. The gunner, the gunner's
// sight and the driver sit on the right (-X), the commander's cupola, panoramic sight and the working 12.7 mm on the left
// (+X), the autoloader in the bustle.
import { KIT, FITTINGS, muzzleBore } from './kit.ts';
import { sectionSolid, type SectionPoint, type SolidSection } from './sectionSolid.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { CHRISTIAN2_HULL, CHRISTIAN2_TURRET } from '../christian2Armor.ts';

const H = CHRISTIAN2_HULL, T = CHRISTIAN2_TURRET;

/** Linear interpolation along a [z, y] station line, held past its ends. */
function lineAt(line: readonly (readonly [number, number])[], z: number): number {
  if (z <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [z0, y0] = line[i - 1], [z1, y1] = line[i];
    if (z <= z1) return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return line[line.length - 1][1];
}

const mirrorRing = (ring: readonly SectionPoint[]): SectionPoint[] =>
  ring.map(([x, y]) => [-x, y] as SectionPoint).reverse();

/** The hull stations: every deck and belly break, so both lines are drawn exactly. */
function hullStations(z0: number, z1: number): number[] {
  const zs = new Set<number>([z0, z1]);
  for (const [z] of [...H.deck, ...H.belly]) if (z > z0 && z < z1) zs.add(z);
  return [...zs].sort((a, b) => a - b);
}

/** The lower tub between the tracks, its sponsons over them, the ring's race collar. */
function hull(P: TankBuilderPort): void {
  const tw = H.tubHalfWidthM;
  P.add('hull', sectionSolid(hullStations(-3.80, 3.45).map((z): SolidSection => {
    const roof = lineAt(H.deck, z), floor = Math.min(lineAt(H.belly, z), roof - 0.08), bevel = Math.min(0.05, (roof - floor) * 0.3);
    return { z, ring: [[-tw + 0.03, floor], [tw - 0.03, floor], [tw, floor + bevel], [tw, roof], [-tw, roof], [-tw, floor + bevel]] };
  })));
  for (const side of [-1, 1]) {
    // sponsons from the tub's wall out over the track, flat-floored at 1.36, their tops the deck line
    const rows = hullStations(-3.70, 3.30).map((z): SolidSection => {
      const top = Math.max(lineAt(H.deck, z), H.sponsonFloorY + 0.06);
      const ring: SectionPoint[] = [[tw - 0.02, H.sponsonFloorY], [H.sponsonHalfWidthM, H.sponsonFloorY],
        [H.sponsonHalfWidthM, top - 0.025], [H.sponsonHalfWidthM - 0.025, top], [tw - 0.02, top]];
      return { z, ring: side > 0 ? ring : mirrorRing(ring) };
    });
    P.add('hull', sectionSolid(rows));
  }
  P.add('hullDark', KIT.cylY(1.02, 1.02, 0.03, P.q ? 48 : 24), 0, lineAt(H.deck, T.pivot[2]) + 0.005, T.pivot[2]);
}

/** The model's skirts: three heavy bolted blocks forward, chamfered at the leader, a long two-band run aft. */
function skirts(P: TankBuilderPort): void {
  const { box } = KIT;
  for (const side of [-1, 1]) {
    const blocks: Array<[number, number]> = [[1.42, 2.02], [2.04, 2.64], [2.66, 3.16]];
    for (const [z0, z1] of blocks) {
      const lead = z1 > 3.0;
      const ring = (z: number, bottom: number): SolidSection => {
        const r: SectionPoint[] = [[1.70, bottom], [1.818, bottom], [1.818, H.skirtTopY], [1.70, H.skirtTopY]];
        return { z, ring: side > 0 ? r : mirrorRing(r) };
      };
      P.add('hull', sectionSolid(lead
        ? [ring(z0, 0.86), ring(z1 - 0.18, 0.86), ring(z1, 1.12)]
        : [ring(z0, 0.86), ring(z1, 0.86)]));
      for (const z of [z0 + 0.12, z1 - 0.12]) P.add('hullDetail', box(0.10, 0.05, 0.07), side * 1.76, H.skirtTopY + 0.02, z);
    }
    const n = 6, a = -3.66, b = 1.40, L = (b - a) / n;
    for (let k = 0; k < n; k++) {
      const zc = a + L * (k + 0.5), d = L - 0.016;
      P.add('hull', box(0.034, 0.30, d), side * 1.703, H.skirtTopY - 0.15, zc);           // proud upper band
      P.add('hull', box(0.028, 0.30, d), side * 1.697, H.skirtTopY - 0.44, zc);           // recessed lower band
      P.add('hullDark', box(0.03, 0.58, 0.014), side * 1.70, H.skirtTopY - 0.30, a + L * k);
    }
    P.add('hullDetail', box(0.03, 0.04, b - a), side * 1.722, H.skirtTopY - 0.02, (a + b) / 2);   // top rail
    // front mudguard over the idler and the rear flap off the sponson's end
    P.add('hull', sectionSolid([[3.16, 1.36, 1.40], [3.40, 1.30, 1.36], [3.62, 1.16, 1.24]].map(([z, bottom, top]): SolidSection => {
      const r: SectionPoint[] = [[1.05, bottom], [1.72, bottom], [1.72, top], [1.05, top]];
      return { z, ring: side > 0 ? r : mirrorRing(r) };
    })));
    P.hangMudguard('christian2-rear-flap', 'hullRubber', box(0.60, 0.42, 0.025), side * 1.36, 1.15, -3.74);
  }
}

/** The bow's tow eyes and lamps, the driver's hatch and periscopes; the stern's grilles, lights and towing gear. */
function hullFittings(P: TankBuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.12, 0.10, 0.12), side * 0.70, 1.02, 3.40);
    P.add('hullDark', torus(0.06, 0.018, 10), side * 0.70, 0.98, 3.47);
    P.add('hullDetail', cylZ(0.065, 0.10, 14), side * 1.15, 1.345, 3.20);
    P.add('hullGlass', markVehicleNightLens(cylZ(0.052, 0.012, 14), 'headlight'), side * 1.15, 1.345, 3.254);
    for (let k = 0; k < 5; k++) P.add('hullDark', box(0.42, 0.012, 0.035), side * 1.20, 1.795, -3.40 - k * 0.07);
    P.add('hullDetail', box(0.12, 0.08, 0.04), side * 1.15, 1.62, -3.82);
    P.add('hullDetail', box(0.10, 0.10, 0.10), side * 0.80, 0.90, -3.82);
  }
  P.addHatch('hullHatch', cylY(0.25, 0.25, 0.03, P.q ? 20 : 12), -0.55, lineAt(H.deck, 2.10) + 0.015, 2.10);
  for (const dx of [-0.16, 0, 0.16]) {
    P.add('hullDetail', box(0.12, 0.05, 0.09), -0.55 + dx, lineAt(H.deck, 2.36) + 0.02, 2.36);
    P.add('hullGlass', box(0.09, 0.025, 0.012), -0.55 + dx, lineAt(H.deck, 2.36) + 0.03, 2.41);
  }
  for (const side of [-1, 1]) {
    P.add('hullDark', KIT.cylY(0.36, 0.36, 0.012, P.q ? 28 : 16), side * 0.62, lineAt(H.deck, -2.30) + 0.004, -2.30);
    P.add('hullDark', box(0.012, 0.006, 1.10), side * 0.08, lineAt(H.deck, -3.20) + 0.004, -3.20);
  }
  P.add('hullDetail', box(0.30, 0.10, 0.06), 0, 1.30, -3.84);                                  // convoy light
}

/** Seven measured road wheels, the raised front idler, the rear sprocket and four return rollers a side. */
function runningGear(P: TankBuilderPort): void {
  P.gear = KIT.buildRunningGear(P, {
    style: 'rubber', dishR: 0.84,
    wheelR: H.wheelR, wheelW: 0.23, wheelY: H.wheelY, xc: H.trackXc,
    wheelZs: [...H.wheelZs],
    idler: { ...H.idler }, sprocket: { ...H.sprocket },
    rollers: H.rollers.map((z) => ({ z, y: H.rollerY, r: H.rollerR })),
    trackW: H.trackW, topY: H.rollerY + H.rollerR + 0.045, botY: 0.075,
    paintedEnds: true, coveredTop: true,
  });
}

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

/** Two bolt-on frontal modules either side of the gun slot, outer corners chamfered in plan, brows dropping to the face. */
function frontalModules(P: TankBuilderPort): void {
  const { box } = KIT;
  const inner = T.slotHalfWidthM, z0 = T.coreFrontZ, z1 = T.moduleFrontZ, hw = T.halfWidthM;
  const right: SolidSection[] = [
    { z: z0, ring: [[-hw, 0.04], [-inner, 0.04], [-inner, 0.725], [-hw, 0.725]] },
    { z: z0 + 0.18, ring: [[-hw + 0.18, 0.045], [-inner, 0.045], [-inner, 0.715], [-hw + 0.18, 0.715]] },
    { z: z1, ring: [[-hw + 0.28, 0.06], [-inner, 0.06], [-inner, 0.64], [-hw + 0.28, 0.64]] },
  ];
  P.add('turret', sectionSolid(right));
  P.add('turret', sectionSolid(right.map((st) => ({ z: st.z, ring: mirrorRing(st.ring) }))));
  for (const sx of [-1, 1]) {
    P.add('turretDark', box(0.012, 0.54, 0.012), sx * 0.64, 0.35, z1 + 0.002);
    for (const y of [0.16, 0.54]) for (const x of [0.47, 0.81]) P.add('turretDetail', KIT.cylZ(0.022, 0.016, 8), sx * x, y, z1 + 0.006);
    P.add('turretDark', box(0.012, 0.64, 0.012), sx * (hw - 0.004), 0.38, z0 + 0.004);
  }
}

/** The pitching box mantlet in the slot, the coax port beside it and the 120 mm L/44-class tube. */
function gunAssembly(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  P.gunG.position.set(T.gunLocal[0], T.gunLocal[1], T.gunLocal[2]);
  P.addGunExtra(sectionSolid([
    { z: -0.10, ring: [[-0.30, -0.23], [0.30, -0.23], [0.30, 0.23], [-0.30, 0.23]] },
    { z: 0.24, ring: [[-0.30, -0.23], [0.30, -0.23], [0.30, 0.23], [-0.30, 0.23]] },
    { z: 0.34, ring: [[-0.27, -0.20], [0.27, -0.20], [0.27, 0.15], [-0.27, 0.15]] },
  ]), 0, 0, 0);
  P.addGunExtra(cylZ(0.15, 0.10, P.q ? 20 : 12), 0, 0, 0.39);
  P.addGunExtraDark(cylZ(0.026, 0.06, 8), 0.205, 0.07, 0.365);                 // coaxial MG port
  P.addGunExtraDark(box(0.13, 0.08, 0.015), -0.17, 0.12, 0.343);               // the gun's own sight aperture plate
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
  const cx = 0.60, cz = -0.34;
  P.add('turret', cylY(0.36, 0.38, 0.09, P.q ? 28 : 16), cx, 0.85, cz);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
    P.add('turretDetail', box(0.11, 0.07, 0.05), cx + Math.sin(a) * 0.33, 0.91, cz + Math.cos(a) * 0.33, 0, a, 0);
    P.add('turretGlass', box(0.08, 0.035, 0.012), cx + Math.sin(a) * 0.357, 0.915, cz + Math.cos(a) * 0.357, 0, a, 0);
  }
  P.addHatch('turretHatch', cylY(0.27, 0.27, 0.04, P.q ? 24 : 14), cx, 0.915, cz);
  P.add('turretDark', box(0.30, 0.025, 0.04), cx, 0.94, cz - 0.20);
  P.add('turret', cylY(0.30, 0.31, 0.05, P.q ? 24 : 14), -0.62, 0.825, -0.28);
  P.addHatch('turretHatch', cylY(0.26, 0.26, 0.03, P.q ? 24 : 14), -0.62, 0.86, -0.28);
  P.add('turretDark', box(0.26, 0.022, 0.035), -0.62, 0.878, -0.48);
  for (const sx of [-1, 1]) {
    P.addHatch('turretHatch', box(0.84, 0.03, 0.84), sx * 0.56, 0.835, -2.12);
    P.add('turretDark', box(0.86, 0.006, 0.86), sx * 0.56, 0.826, -2.12);
  }
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'm2', tone: 'two-tone', seed: 2621, rotation: [0, -0.25, 0],
    working: true, ridingCradle: true });
  mg.name = 'christian2CommanderM2';
  mg.position.set(cx - 0.05, 0.94, cz + 0.30);
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
    P.add('turretDetail', box(0.022, 0.022, 1.60), sx * (T.halfWidthM + 0.035), 0.62, -0.30);
    for (const z of [-1.05, -0.30, 0.45]) P.add('turretDetail', box(0.04, 0.05, 0.02), sx * (T.halfWidthM + 0.018), 0.62, z);
    const bank = FITTINGS.smokeBank({ mats: P.mats, count: 4, r: 0.042, len: 0.28, splay: sx * 0.95, pitch: -0.42,
      arc: 0.6, slot: 'detail', seed: 26210 + (sx > 0 ? 1 : 0) });
    bank.position.set(sx * (T.halfWidthM + 0.10), 0.46, 0.36);
    P.turretG.add(bank);
    P.add('turretDetail', box(0.12, 0.06, 0.44), sx * (T.halfWidthM + 0.06), 0.37, 0.36);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: 1.30, r: 0.011, seed: 26220 + (sx > 0 ? 1 : 0),
      rotation: [-0.08, 0, sx * 0.03] });
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
  hull(P);
  skirts(P);
  hullFittings(P);
  runningGear(P);
  turret(P);
  P.topY = 1.24;
  addVehicleGhillieSuit(P);
}

export const CHRISTIAN2_PROFILES = {
  christian2: { build: buildChristian2 },
} satisfies VehicleProfileRecord;
