// The Leopard 2A4's own kit (leo2a4), carried over from the build it replaces (inventory: the lane's
// inventory/leo2a4.md) and re-seated on the release hull and the 2A4 turret: two spare-track link racks across the
// glacis's nose, the glacis anti-slip fields and the tow cable clamped across it, shackles on the bow's tow eyes and a
// centre clevis, the blackout lamps beside the headlight pods, the tow cable laid on the engine deck, the deck's anti-slip
// fields and tie-down cleats, the jack and the tow coupling on the rear plate, its rear number; on the turret the
// crosswind sensor's mast, the whips folded on the roof, the roof's tie-down rings and antenna pots, the bustle rack with
// its bundles, cans, ammunition box, tarp and bin, and the crosses on the walls. The rest of the old build's dressing is the
// construction's own now (the inventory's carry-over table, docs/references/tanks/leo2a4-family.md, records each row).
import { KIT } from './kit.ts';
import { withSpareTrackRun } from '../spareTrackSeat.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { Leopard2A4FamilyId } from '../leopard2A4FamilyArmor.ts';
import { HULL_SURFACES as HS, TURRET_SURFACES as TS, bustleRack, crosswindMast, deckFrame, deckY, foldedWhip, sternRackFloor } from './leopard2A4KitParts.ts';

/** What a variant's kit knows about its build. */
export interface Leopard2A4KitContext {
  readonly id: Leopard2A4FamilyId;
  /** The variant's seed (its fittings and soft goods vary by it). */
  readonly seed: number;
}

/** A rack of spare track links laid across the glacis at (x, z): a dark tray, four links, end brackets; one registered run. */
export function glacisTrackRack(P: TankBuilderPort, site: string, x: number, z: number, links = 4, pitch = 0.205): void {
  const { box, xform } = KIT;
  const f = deckFrame(x, z), rx = f.rotation.x, len = links * pitch + 0.04;
  withSpareTrackRun(P, { site, source: 'adhoc', rotation: [rx, 0, 0] }, (R) => {
    R.add('hullDark', box(len, 0.020, 0.055), x, f.point.y + 0.012, z, rx, 0, 0);
    for (let k = 0; k < links; k++) {
      R.add('hullTrack', xform(box(0.16, 0.012, 0.050), -pitch * (links - 1) / 2 + k * pitch, 0.010, 0), x, f.point.y + 0.012, z, rx, 0, 0);
    }
    for (const bx of [-len / 2 + 0.01, len / 2 - 0.01]) {
      R.add('hullDetail', xform(box(0.020, 0.016, 0.053), bx, 0.006, 0), x, f.point.y + 0.012, z, rx, 0, 0);
    }
  });
}

/** A tow cable laid along points on the glacis or deck, sunk to half its thickness, clamped at the listed stations. */
export function laidCable(P: TankBuilderPort, pts: ReadonlyArray<readonly [number, number]>, r: number,
  clamps: ReadonlyArray<readonly [number, number]> = []): void {
  const { box } = KIT;
  KIT.towCable(P, pts.map(([x, z]) => [x, deckY(z) + r * 0.45, z] as [number, number, number]), r);
  for (const [x, z] of clamps) {
    const f = deckFrame(x, z);
    P.add('hullDetail', box(0.085, 0.018, 0.078), x, f.point.y + r * 0.6, z, f.rotation.x, 0, 0);
  }
  for (const [x, z] of [pts[0], pts[pts.length - 1]]) {
    const f = deckFrame(x, z);
    P.add('hullDark', box(0.07, 0.022, 0.10), x, f.point.y + 0.008, z, f.rotation.x, 0, 0);
  }
}

/** A shackle's D-ring hanging from a bow tow eye. */
export function bowShackle(P: TankBuilderPort, x: number, y: number, z: number): void {
  P.add('hullDark', KIT.xform(KIT.torus(0.052, 0.015, 12), 0, 0, 0, Math.PI / 2, 0, 0), x, y, z);
}

function hullKit(P: TankBuilderPort): void {
  const { box, cylZ } = KIT;
  // the spare links across the glacis's nose between the headlight pods (the photographed 2A4s), one run a side
  for (const sx of [-1, 1]) glacisTrackRack(P, `leo2a4-glacis-rack-${sx < 0 ? 'R' : 'L'}`, sx * 0.47, 3.20);
  // the glacis's anti-slip fields either side of the splash board, and the tow cable clamped across the plate
  for (const [x, z, w, d] of [[-0.55, 2.95, 0.55, 0.36], [0.55, 2.95, 0.55, 0.36], [0.62, 2.30, 0.48, 0.40]] as const) {
    const f = deckFrame(x, z);
    P.add('hullRubber', box(w, 0.006, d), x, f.point.y + 0.002, z, f.rotation.x, 0, 0);
  }
  laidCable(P, [[1.06, 2.28], [0.55, 2.66], [-0.25, 2.88], [-1.02, 2.64]], 0.022, [[0.80, 2.47], [0.15, 2.78], [-0.68, 2.76]]);
  // shackles on the bow's tow eyes and on a centre clevis between them
  for (const sx of [-1, 1]) bowShackle(P, sx * 0.70, 0.93, 3.50);
  P.add('hullDetail', box(0.16, 0.12, 0.10), 0, 1.00, 3.42);
  bowShackle(P, 0, 0.92, 3.49);
  // the stern rack's floor (its load went to the deck's corners, critic round 3)
  sternRackFloor(P);
  // the blackout lamps inboard of the headlight pods
  for (const sx of [-1, 1]) {
    const z = HS.pods[1] + 0.02, y = deckY(z) + 0.06;
    P.add('hullDetail', cylZ(0.035, 0.06, 10), sx * 0.93, y, z + 0.04);
    P.add('hullDark', cylZ(0.026, 0.008, 10), sx * 0.93, y, z + 0.074);
  }
  // the tow cable laid on the engine deck in a loop behind the bustle, ahead of the fans
  KIT.towCable(P, [[-1.10, deckY(-2.45) + 0.01, -2.45], [-0.50, deckY(-2.62) + 0.01, -2.62], [0.50, deckY(-2.62) + 0.01, -2.62],
    [1.10, deckY(-2.45) + 0.01, -2.45]], 0.016);
  // the deck's anti-slip fields beside the ring and two flat tie-down cleats
  for (const [x, z0, z1] of [[-1.22, 0.10, 1.30], [1.22, -0.30, 1.10]] as const) {
    P.add('hullRubber', box(0.50, 0.006, z1 - z0), x, deckY((z0 + z1) / 2) + 0.002, (z0 + z1) / 2);
  }
  for (const [x, z] of [[-1.52, 0.40], [1.52, -0.60]] as const) P.add('hullDetail', box(0.10, 0.012, 0.05), x, deckY(z) + 0.006, z);
  // the jack on the rear plate (left of the centre, as on the old build) and the tow coupling's jaw under the cables
  P.add('hullDark', box(0.24, 0.10, 0.08), 0.47, 1.25, HS.rearZ - 0.04);
  P.add('hullDark', box(0.20, 0.14, 0.03), 0, 0.92, HS.rearZ - 0.015);
  P.add('hullDetail', KIT.xform(KIT.torus(0.05, 0.015, 12), 0, 0, 0, Math.PI / 2, 0, 0), 0, 0.92, HS.rearZ - 0.04);
  P.add('hullDetail', box(0.06, 0.05, 0.08), 0, 0.84, HS.rearZ - 0.05);
  // the old build's rear number on the lower rear plate's right
  P.decal('hull', 'number', 'Y-241', 0.24, [-0.62, 1.27, HS.rearZ - 0.006], Math.PI);
}

function turretKit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  const { box, cylY, torus } = KIT;
  crosswindMast(P, -0.85, -2.12);
  // the whips struck and laid along the roof from their pots at the bustle's corners
  foldedWhip(P, -0.88017, -1.98, 0.50);
  foldedWhip(P, 0.91495, -1.98, 0.50);
  // two more pots (the intercom and the radio's) on the roof's shoulders
  for (const x of [-0.88, 0.88]) {
    P.addEquipment('turretDetail', cylY(0.03, 0.035, 0.08, 10), x, TS.roofY + 0.04, -0.70);
    P.addEquipment('turretDark', cylY(0.012, 0.012, 0.05, 8), x, TS.roofY + 0.10, -0.70);
  }
  // tie-down rings on the roof
  for (const [x, z] of [[0.55, 0.30], [-0.45, -0.90], [0.30, -1.27]] as const) {
    P.addEquipment('turretDetail', torus(0.04, 0.008, 10), x, TS.roofY + 0.008, z);
    P.addEquipment('turretDark', cylY(0.022, 0.022, 0.006, 8), x, TS.roofY + 0.003, z);
  }
  // the bustle rack and its load: two bundles, the cans, the ammunition box, the tarp across the top, the bin
  const rack = bustleRack(P, { halfW: 1.05, depth: 0.42, low: 0.30, top: 0.66, rails: 3, bars: 9 });
  const zc = (TS.rearZ + rack.backZ) / 2;
  KIT.stowage(P, 'turretCloth', P.rng, [[-0.55, rack.floorY + 0.17, zc, 0.62, 0.34, 0.34], [0.10, rack.floorY + 0.15, zc, 0.52, 0.30, 0.32]]);
  KIT.jerryCan(P, 'turretCloth', 0.62, rack.floorY + 0.17, zc, 0.12);
  KIT.ammoCan(P, 'turretDark', 0.92, rack.floorY + 0.10, zc + 0.02, -0.1);
  KIT.tarpRoll(P, 'turretCloth', 0, 0.80, TS.rearZ - 0.12, 0.62, 0.082, true, P.q ? 12 : 8);
  P.addEquipment('turretCloth', box(0.62, 0.20, 0.10), -0.05, rack.floorY + 0.10, rack.backZ + 0.07);
  // the crosses on the walls, ahead of the smoke rows
  for (const sx of [-1, 1]) {
    const x = (sx < 0 ? TS.wallRight : TS.wallLeft) + 0.002;
    P.decal('turret', 'crossgrey', null, 0.36, [sx * x, 0.40, -0.25], sx * Math.PI / 2);
  }
  void ctx;
}

/** The Leopard 2A4's kit, after the hull and the turret. */
export function addLeo2A4Kit(P: TankBuilderPort, ctx: Leopard2A4KitContext): void {
  hullKit(P);
  turretKit(P, ctx);
}
