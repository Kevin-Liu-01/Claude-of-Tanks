// The Danish Leopard 2s (release 265; docs/references/tanks/leo2a5dk.md, leo2a7dk.md): the Leopard 2A5 DK and the
// Leopard 2A7 DK it became, on the source-study 2A5 and 2A7V builds (profiles/leopardX.ts) with their Danish kit.
// - 2A5 DK (51 tanks, the 2000 contract; armyvehicles.dk/leopard2a5.htm): the Elop stabilised day/thermal commander's
//   sight, a drum on the PERI's bearing (US Army photographs at Grafenwöhr, 3-4 July 2014, show it over the roof), and
//   the bar armour the tanks took for Helmand in 2008 and kept: a cage across the stern and the rear hull quarters and a
//   cage round the turret bustle (the same photographs, side and rear).
// - 2A7 DK (44 tanks, Jydske Dragonregiment; the Forsvaret fact sheet): the 2A7's new stowage modules, ribbed boxes
//   round the bustle and the rear turret sides (the Danish Army's transporter photograph), and the Barracuda mobile
//   camouflage system ("mobilt sløringssystem"), the suit in ghillieFleetSuits.ts (the Latvian live-fire photograph).
// Neither carries the German builds' remote 30 mm station. First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import { KIT } from './kit.ts';
import { LEOPARD_X_DATUMS, buildLeopard2A5X, buildLeopard2A7VX } from './leopardX.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylY, cylZ, stowage } = KIT;
type Vec3 = readonly [number, number, number];

/** A flat-bar slat panel standing in a plane of constant x (`along: 'z'`) or z (`along: 'x'`): bars edge-on to the
 * threat every `pitch`, posts at `posts`, top and bottom rails. Coordinates in the owner's frame. */
interface SlatPanel {
  readonly along: 'x' | 'z';
  readonly at: number;
  readonly from: number;
  readonly to: number;
  readonly low: number;
  readonly high: number;
  readonly posts: readonly number[];
  readonly pitch?: number;
}

function slatPanel(P: TankBuilderPort, bucket: 'hullOpenLattice' | 'turretOpenLattice', o: SlatPanel, origin: Vec3 = [0, 0, 0]): void {
  const [ox, oy, oz] = origin, len = o.to - o.from, mid = (o.from + o.to) / 2, pitch = o.pitch ?? 0.09;
  const put = (w: number, h: number, d: number, a: number, y: number): void => {
    if (o.along === 'x') P.addEquipment(bucket, box(w, h, d), a - ox, y - oy, o.at - oz);
    else P.addEquipment(bucket, box(d, h, w), o.at - ox, y - oy, a - oz);
  };
  const bars = Math.max(2, Math.round((o.high - o.low) / pitch));
  for (let k = 1; k < bars; k++) put(len, 0.014, 0.07, mid, o.low + (o.high - o.low) * k / bars);
  for (const y of [o.low, o.high]) put(len + 0.05, 0.04, 0.05, mid, y);
  for (const a of o.posts) put(0.05, o.high - o.low, 0.05, a, (o.low + o.high) / 2);
}

/** A standoff arm from (a) to (b), axis-aligned along one axis. */
function arm(P: TankBuilderPort, bucket: string, a: Vec3, b: Vec3, origin: Vec3 = [0, 0, 0]): void {
  const size = [0, 1, 2].map((i) => Math.max(0.04, Math.abs(b[i] - a[i]))) as [number, number, number];
  P.addEquipment(bucket, box(...size), (a[0] + b[0]) / 2 - origin[0], (a[1] + b[1]) / 2 - origin[1], (a[2] + b[2]) / 2 - origin[2]);
}

/** The Helmand bar armour on the 2A5 DK's hull: a band across the stern's upper half 0.35 m off the louvres, below the
 * deck line so the gun keeps its depression over the stern, the lower plate with its lights and crossed tow cables left
 * open (the Grafenwöhr rear photograph), and a band on each rear quarter at upper-hull height, ending above the sprocket
 * and standing within the skirts' width. */
function addA5DkHullSlats(P: TankBuilderPort): void {
  const sternZ = -3.97, low = 1.22, high = 1.76, sideX = 1.80;
  slatPanel(P, 'hullOpenLattice', { along: 'x', at: sternZ, from: -1.72, to: 1.72, low, high, posts: [-1.72, -0.86, 0, 0.86, 1.72] });
  for (const x of [-1.30, -0.43, 0.43, 1.30]) {
    for (const y of [1.32, 1.66]) arm(P, 'hullOpenLattice', [x, y, sternZ + 0.03], [x, y, -3.64]);
  }
  for (const side of [-1, 1]) {
    const x = side * sideX;
    slatPanel(P, 'hullOpenLattice', { along: 'z', at: x, from: sternZ, to: -2.35, low, high: 1.74, posts: [-3.43, -2.89, -2.35] });
    for (const z of [-3.43, -2.89, -2.35]) {
      for (const y of [1.32, 1.64]) arm(P, 'hullOpenLattice', [side * 1.735, y, z], [x - side * 0.025, y, z]);
    }
    // the corner post joining the stern band
    P.addEquipment('hullOpenLattice', box(0.05, 1.74 - low, 0.05), x, (1.74 + low) / 2, sternZ);
    arm(P, 'hullOpenLattice', [side * 1.72, 1.48, sternZ], [x, 1.48, sternZ]);
  }
}

/** A Danish flag on a short pole beside the commander's hatch (the Grafenwöhr photographs), turret frame. */
function addDanishFlag(P: TankBuilderPort, pivot: Vec3, base: Vec3): void {
  const [bx, by, bz] = base, x = bx - pivot[0], y = by - pivot[1], z = bz - pivot[2];
  P.addEquipment('turretDark', cylY(0.03, 0.035, 0.06, 10), x, y + 0.03, z);
  // (r4 critics: the Grafenwoehr rear photograph's pole is short, about 0.6 m to the cloth's top)
  P.addEquipment('turretDark', cylY(0.011, 0.013, 0.70, 8), x, y + 0.35, z);
  P.addEquipment('turretCloth', box(0.012, 0.21, 0.30), x, y + 0.58, z - 0.165);
  // the Dannebrog on both faces, its cross toward the pole on each (a plain quarter turn each way: the decal turns about
  // world Z last, so the old half turn swung the far face back to face +x, and the flag vanished from the right); a
  // 'cross' decal is the national insignia and was re-seated off the cloth
  for (const s of [-1, 1] as const) {
    P.decal('turret', 'flag', 'dk-dannebrog', 0.36, [x + s * 0.008, y + 0.58, z - 0.165], s * Math.PI / 2, 0, 0);
  }
}

/** The bustle cage round the 2A5 DK's rear turret bins (turret frame from the build's datum). */
function addA5DkTurretSlats(P: TankBuilderPort): void {
  const pivot = LEOPARD_X_DATUMS.leo2a5.turretPivot;
  // (r4 critics: the cage's top rail stood over the bustle like a railing; the photograph's is level with the bin lids)
  const rearZ = -3.00, low = 1.96, high = 2.46, sideFront = -1.55;
  slatPanel(P, 'turretOpenLattice', { along: 'x', at: rearZ, from: -1.42, to: 1.42, low, high, posts: [-1.42, -0.71, 0, 0.71, 1.42] }, pivot);
  // r2 critics (the Grafenwoehr rear): drab kit packed in the cage between the bins and the slats, under the cage's top
  const bz = (rearZ + 0.025 - 2.78) / 2;
  stowage(P, 'turretCloth', P.rng, ([[-0.95, 0.40], [-0.40, 0.44], [0.20, 0.42], [0.80, 0.46]] as const).map(([x, w], k) =>
    [x - pivot[0], low + 0.17 + (k % 2) * 0.03 - pivot[1], bz - pivot[2], w, 0.30 + (k % 2) * 0.05, 0.17] as const));
  // arms back from the bins' rear faces (z -2.78)
  for (const x of [-1.10, -0.55, 0.60, 1.15]) arm(P, 'turretOpenLattice', [x, 2.20, -2.79], [x, 2.20, rearZ + 0.025], pivot);
  for (const side of [-1, 1]) {
    const x = side * 1.46, binOuter = side > 0 ? 1.354 : -1.271;
    // the side bands run forward along about half the turret's side, to just behind the smoke banks
    slatPanel(P, 'turretOpenLattice', { along: 'z', at: x, from: rearZ, to: sideFront, low, high, posts: [-2.42, -1.98, sideFront] }, pivot);
    for (const z of [-2.62, -2.05, sideFront + 0.06]) arm(P, 'turretOpenLattice', [binOuter, 2.20, z], [x - side * 0.025, 2.20, z], pivot);
    P.addEquipment('turretOpenLattice', box(0.05, high - low, 0.05), x - pivot[0], (low + high) / 2 - pivot[1], rearZ - pivot[2]);
  }
}

/** The 2A5 DK's Elop commander's sight: a stabilised drum on the PERI's .461 m bearing (top 2.799 m), its window
 * forward. */
function addA5DkCommanderSight(P: TankBuilderPort): void {
  const [px, py, pz] = LEOPARD_X_DATUMS.leo2a5.turretPivot;
  const x = -0.278 - px, z = -0.372 - pz;
  // r2 critics (the Poland 2015 front): a squat dark drum about 0.4 m across, its round lens forward
  P.addEquipment('turretDark', cylY(0.20, 0.205, 0.20, P.q ? 32 : 18), x, 2.90 - py, z);
  P.addEquipment('turretDark', cylY(0.215, 0.215, 0.028, P.q ? 32 : 18), x, 3.014 - py, z);
  P.addEquipment('turretDetail', cylY(0.07, 0.09, 0.04, 14), x, 3.048 - py, z);
  // (r4 critics: the Poland photograph's drum shows a large round aperture forward)
  P.addEquipment('turretDark', cylZ(0.13, 0.03, P.q ? 24 : 14), x, 2.90 - py, z + 0.19);
  P.addEquipment('turretGlass', cylZ(0.105, 0.012, P.q ? 24 : 14), x, 2.90 - py, z + 0.207);
  // the washer tank and the sight's cable conduit down its back
  P.addEquipment('turretDetail', box(0.08, 0.12, 0.08), x + 0.17, 2.86 - py, z - 0.10);
  P.addEquipment('turretDark', box(0.035, 0.16, 0.035), x, 2.87 - py, z - 0.205);
}

export function buildLeopard2A5DK(P: TankBuilderPort): void {
  buildLeopard2A5X(P, { danish: true });
  addA5DkCommanderSight(P);
  addA5DkTurretSlats(P);
  addA5DkHullSlats(P);
  addDanishFlag(P, LEOPARD_X_DATUMS.leo2a5.turretPivot, [-0.66, 2.68, -0.98]);
  P.turretG.userData.leopard2DkReceipt = { mark: '2A5 DK', elopCommanderSight: true, bustleSlats: true, hullSlats: true, flag: true };
}

/** A ribbed stowage module: a closed box with vertical ribs on its outer face (`face`: +1/-1 along x for a side
 * module, 0 for the rear face along -z). World frame of the 2A7V build, turret-owned. */
function ribbedModule(P: TankBuilderPort, c: Vec3, size: Vec3, face: -1 | 0 | 1): void {
  const pivot = LEOPARD_X_DATUMS.leo2a7v.turretPivot;
  const [cx, cy, cz] = c, [w, h, d] = size;
  P.addEquipment('turretDetail', box(w, h, d), cx - pivot[0], cy - pivot[1], cz - pivot[2]);
  P.addEquipment('turretDetail', box(w + 0.02, 0.025, d + 0.02), cx - pivot[0], cy + h / 2 + 0.0125 - pivot[1], cz - pivot[2]);
  const span = face === 0 ? w : d, ribs = Math.max(3, Math.round(span / 0.09));
  for (let k = 1; k < ribs; k++) {
    const t = -span / 2 + span * k / ribs;
    if (face === 0) P.addEquipment('turretDetail', box(0.022, h - 0.06, 0.03), cx + t - pivot[0], cy - pivot[1], cz - d / 2 - 0.015 - pivot[2]);
    else P.addEquipment('turretDetail', box(0.03, h - 0.06, 0.022), cx + face * (w / 2 + 0.015) - pivot[0], cy - pivot[1], cz + t - pivot[2]);
  }
}

export function buildLeopard2A7DK(P: TankBuilderPort): void {
  buildLeopard2A7VX(P, { danish: true });
  // the rear module across the bustle and a module down each rear turret side, behind the smoke banks
  // (the rear module runs forward under the bustle's overhang to the turret's rear wall at z -2.49; the side modules sit
  // into the wall)
  // (the side modules run forward along the turret sides to just behind the smoke banks at z -1.12)
  ribbedModule(P, [0.05, 2.36, -2.90], [2.44, 0.50, 0.80], 0);
  for (const side of [-1, 1] as const) ribbedModule(P, [side * 1.40, 2.38, -2.06], [0.48, 0.46, 1.56], side);
  addDanishFlag(P, LEOPARD_X_DATUMS.leo2a7v.turretPivot, [-0.98, 2.68, -0.92]);
  P.turretG.userData.leopard2DkReceipt = { mark: '2A7 DK', ribbedStowageModules: 3, barracuda: true, flag: true };
}
