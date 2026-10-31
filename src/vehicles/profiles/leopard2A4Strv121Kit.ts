// The kit of the Stridsvagn 121 (strv121), the Swedish Army's Leopard 2A4 (the owner, 2026-10-28: "oh yeah this meanns we
// nnneed to update the strv 121 as well"), carried over from the build it replaces (inventory: the lane's
// inventory/strv121.md; legacy buildStrv122 = the 2A5 build, the Strv 122 package and the suit) and re-seated on the
// release hull and the square 2A4 turret (leopard2A4Family.ts). What the Strv 121 carries: the Swedish radio pair on the
// turret's antenna bases (its two raked whips, the taller on the loader's side), the Swedish rear basket round the bustle
// loaded with the old build's packs, jerrycan pair and tarp roll, the ventilator behind the loader's hatch and the crosswind
// sensor, the tactical number on the basket's sides and the rear plate, and the owner's Swedish field suit
// (ghillieFleetSuits.ts strv121) last of all. The loader's Ksp 58 (the FN MAG) is the turret's own (its loaderMG option).
// The Strv 122 package's armour (glacis wedges, skirt cassettes, side plates, bustle returns, roof armour and the hatches,
// periscopes, vision blocks and panorama on it, the six-tube banks, the gun root) is the 122's, not the 2A4's: the
// construction draws the Strv 121's own glacis, skirts, walls, roof stations, PERI R17, Wegmann tubes and mantlet.
// The legacy build was mirrored (its commander at +X): kit tied to a crew station changes the sign of its x here.
import { KIT, FITTINGS } from './kit.ts';
import { mulberry32 } from '../factoryGeometry.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { Leopard2A4KitContext } from './leopard2A4Kit.ts';
import { turretRoofAt } from './leopard2A4VKit.ts';
import { HULL_SURFACES as HS, TURRET_SURFACES as TS, sternRackFloor } from './leopard2A4KitParts.ts';

/**
 * The Swedish rear basket's datums (turret metres): its back 0.44 m behind the bustle's rear plate, its side sheets
 * outboard of the bustle's chamfered corners from the back to the bustle's end (behind the side bins), its four rails
 * (the old basket's heights) over a slatted floor at the bustle's foot.
 */
export const STRV121_BASKET = Object.freeze({
  backZ: TS.rearZ - 0.44, frontZ: TS.bustleEndZ, halfW: 1.22,
  rails: Object.freeze([0.26, 0.38, 0.50, 0.62] as const), floorY: 0.255, postTop: 0.65,
});

/** The basket's frame, floor and backing (inventory B #16). */
function basketFrame(P: TankBuilderPort): void {
  const { box } = KIT;
  const B = STRV121_BASKET, w = B.halfW * 2, sideLen = B.frontZ - B.backZ, sideZ = (B.frontZ + B.backZ) / 2;
  const postH = B.postTop - B.floorY;
  // the back: four rails across, nine posts, the dark canvas backing just inside them
  for (const y of B.rails) P.addEquipment('turretDetail', box(w + 0.032, 0.028, 0.032), 0, y, B.backZ);
  for (let k = 0; k < 9; k++) {
    P.addEquipment('turretDetail', box(0.030, postH, 0.032), -B.halfW + k * (w / 8), B.floorY + postH / 2, B.backZ);
  }
  P.addEquipment('turretDark', box(w - 0.06, 0.34, 0.012), 0, 0.44, B.backZ + 0.024);
  // the floor behind the rear plate: a welded grid on the bottom rail's line
  const floorD = TS.rearZ - B.backZ - 0.02;
  P.addEquipment('turretDark', KIT.openRackGrid(w - 0.04, floorD, 0.016, 5, 11), 0, B.floorY, B.backZ + 0.01 + floorD / 2);
  for (const sx of [-1, 1]) {
    const x = sx * B.halfW;
    // the side sheet from the back to the bustle's end, its foot on the bottom rail's line
    P.addEquipment('turretDetail', box(0.032, 0.36, sideLen), x, 0.44, sideZ);
    // a bracket from the sheet's front edge to the bustle's wall at its end
    const wall = TS.wallAt(sx, B.frontZ + 0.02), reach = B.halfW - wall + 0.02;
    P.addEquipment('turretDetail', box(reach, 0.30, 0.03), sx * (wall + reach / 2 - 0.01), 0.44, B.frontZ - 0.015);
    // two ties from the sheet to the chamfered corner, low and high
    const tz = -2.50, cw = TS.wallAt(sx, tz), tie = B.halfW - cw + 0.02;
    for (const y of [0.30, 0.58]) P.addEquipment('turretDetail', box(tie, 0.034, 0.034), sx * (cw + tie / 2 - 0.01), y, tz);
  }
}

/** The basket's load (inventory B #22; the old build's, mirrored): the jerrycan pair at the loader's end, three packs, the
 *  tarp roll across the commander's two. */
function basketLoad(P: TankBuilderPort, rng: () => number): void {
  const B = STRV121_BASKET, zc = (TS.rearZ + B.backZ) / 2, fy = B.floorY + 0.008;
  KIT.jerryCan(P, 'turretCloth', 0.97, fy + 0.24, zc, 0);
  KIT.stowage(P, 'turretCloth', rng, [
    [0.44, fy + 0.18, zc, 0.62, 0.36, 0.38],
    [-0.18, fy + 0.17, zc - 0.01, 0.56, 0.34, 0.38],
    [-0.80, fy + 0.16, zc, 0.42, 0.32, 0.36],
  ]);
  KIT.tarpRoll(P, 'turretCloth', -0.50, fy + 0.40, zc + 0.02, 0.90, 0.085, true, P.q ? 12 : 8);
}

/**
 * The Swedish radio pair (inventory B #15) on the turret's antenna bases at the bustle's corners: the taller whip on the
 * loader's side, both raked outboard (the old build's heights, pots and seeds).
 */
function swedishRadios(P: TankBuilderPort): void {
  for (const sx of [-1, 1]) {
    const x = sx < 0 ? -0.88017 : 0.91495, z = -1.98;
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h: sx > 0 ? 0.82 : 0.68, r: 0.012, rake: -sx * 0.045,
      seed: 12230 + (sx > 0 ? 0 : 1) });
    whip.position.set(x, turretRoofAt(z) + 0.10, z);
    P.turretG.add(whip);
  }
}

/** The ventilator behind the loader's hatch and the crosswind sensor at the commander's rear quarter (#12, #24). */
function roofKit(P: TankBuilderPort): void {
  const { box, cylY } = KIT;
  const roof = TS.roofY, vx = 0.70, vz = -1.38;
  P.addEquipment('turretDetail', box(0.30, 0.10, 0.34), vx, roof + 0.05, vz);
  P.addEquipment('turretDark', box(0.26, 0.006, 0.29), vx, roof + 0.103, vz);
  for (let k = 0; k < 4; k++) P.addEquipment('turretDetail', box(0.26, 0.008, 0.024), vx, roof + 0.108, vz - 0.105 + k * 0.07);
  const mz = -2.12, my = turretRoofAt(mz), mx = -0.85, h = 0.16;
  P.addEquipment('turretDetail', cylY(0.018, 0.024, h, 8), mx, my + h / 2, mz);
  P.addEquipment('turretDark', box(0.14, 0.02, 0.02), mx, my + h + 0.01, mz);
  P.addEquipment('turretDark', box(0.02, 0.02, 0.14), mx, my + h + 0.01, mz);
}

/** The tactical number (the spec's): on both basket sides behind the suit's bustle drapes, and on the rear plate (#18, #23). */
function numbers(P: TankBuilderPort): void {
  const B = STRV121_BASKET;
  for (const sx of [-1, 1]) P.decal('turret', 'number', null, 0.22, [sx * (B.halfW + 0.017), 0.44, -2.82], sx * Math.PI / 2);
  P.decal('hull', 'number', null, 0.18, [-0.62, 1.26, HS.rearZ - 0.006], Math.PI);
}

/** The Strv 121's kit, after the hull and the turret; the field suit last, over everything. */
export function addStrv121Kit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  basketFrame(P);
  basketLoad(P, mulberry32(ctx.seed + 11));
  // the hull's stern rack floored as on the 2A4 (empty, the standard check's contiguity read 54 cells, release 265's gate)
  sternRackFloor(P);
  swedishRadios(P);
  roofKit(P);
  numbers(P);
  addVehicleGhillieSuit(P);
}
