// The T-80U Kursk (release 274, lane t80-family-274; the owner, 2026-11-20: "make unique versions of them now", and on its
// first look: "the kursk needs a ton of era at front of turret, on top of turret, on sideskirts and upper glacis and
// different machine guns and 2 machine guns"): a T-80U in Ukrainian service, as the captured T-80Us and T-80UKs the 1st,
// 17th and 93rd brigades showed in 2022 (lane evidence photos/t80u-ukraine/, the Ministry of Defence's CC BY 4.0
// photographs). It is the complete T-80U X build (profiles/t80uX.ts: casting, Kontakt-5, turbine chassis), as the T-80UK
// is (t80ukRenewal.ts), with a field fit a Russian T-80U does not carry:
//  - field Kontakt-1 (the fleet's 4S20 container, profiles/t80Marks.ts k1) laid over the factory Kontakt-5 on the upper
//    glacis, in two rows the full length of each skirt, on the front cheek blocks the smoke banks leave free, and across
//    the turret roof's front half against top attack;
//  - two roof guns in place of the commander's NSVT: a 12.7 mm M2 on the NSVT's own pintle and riser at the commander's
//    cupola, and a 7.62 mm M240-class gun (the fleet's GPMG section) on a welded socket post beside the gunner's hatch,
//    both guns Ukraine was supplied (no photograph shows either on a T-80U; the owner asked for two, and different);
//  - the old Kursk's rear kit, the owner's call on its second look ("add the log and 2 other rear things from the t80u
//    kursk to this new t80u"): the unditching log on the stern, the pair of 200 L drums on the T-80U X's empty stern
//    cradles, and a stowage crate on each rear flank of the turret;
//  - foliage netting over the turret roof's rear half (the 93rd brigade's T-80UKs), the bricks left bare;
//  - the 2022 identification paint, each fender nose yellow with a blue band (the 1st brigade's);
//  - a Ukrainian flag on a short pole at the turret's rear left (the 1st brigade's);
//  - two pale tape bands round the gun's thermal sleeve (the 93rd brigade's).
// Its print-fitted loft and the T-90-style turret suite it shared with the old Ukrainian T-80BV are retired; its combat
// frame and armour are the T-80U X's, with the field Kontakt-1's six gameplay plates (t80MarkFrames.ts).
// First-party geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { FITTINGS, KIT } from './kit.ts';
import { buildT80UX, machineGun, T80U_X_TRUNNION, T80U_X_YAW } from './t80uX.ts';
import { k1, k1Counts } from './t80Marks.ts';
import { addT90CradleDrums } from './t90CradleDrums.ts';
import { stowagePart } from './stowagePart.ts';
import { beamBetween } from './measuredPrimitives.ts';
import { mount } from './fittingMount.ts';
import { MG_CLASSES } from '../machineGunGeometry.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylZ } = KIT;
const cylY = (r: number, h: number, n = 12) => KIT.cylY(r, r, h, n);
type Point3 = readonly [number, number, number];
const YAW = T80U_X_YAW;

// ------------------------------------------------------------------------------------------------- field Kontakt-1 --

/** The factory Kontakt-5 sheet's top over the upper glacis (profiles/t80uX.ts glacisEra: x to ±1.025). */
const K5_GLACIS: readonly (readonly [number, number])[] = [[1.85, 1.504], [2.10, 1.424], [2.40, 1.289], [2.70, 1.187], [3.005, 1.053]];
function k5Top(z: number): { y: number; lean: number } {
  for (let i = 1; i < K5_GLACIS.length; i++) {
    const [z0, y0] = K5_GLACIS[i - 1], [z1, y1] = K5_GLACIS[i];
    if (z <= z1 || i === K5_GLACIS.length - 1) return { y: y0 + (y1 - y0) * (z - z0) / (z1 - z0), lean: Math.atan2(y0 - y1, z1 - z0) };
  }
  throw new Error('unreachable');
}

/** Containers lying across the glacis over the Kontakt-5 sheet, long side across the tank: eight columns, six courses,
 * clear of the gun's depression line at the top course's middle, the sheet's handles and bars (±.55-.85, z 2.20-2.65),
 * the headlamps in their guards (±.8475, 2.62) and the splash strip (|x| < .45, z 2.62-2.78). Hull frame. */
function glacisK1(P: TankBuilderPort): void {
  for (const z of [1.95, 2.11, 2.27, 2.43, 2.59, 2.87]) {
    const { y, lean } = k5Top(z);
    for (const c of [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5]) {
      const x = c * 0.27, ax = Math.abs(x);
      if (z < 2.0 && ax < 0.30) continue;
      if (ax > 0.45 && ax < 0.85 && z > 2.20 && z < 2.65) continue;
      if (Math.hypot(ax - 0.8475, z - 2.62) < 0.21) continue;
      if (ax < 0.45 && z > 2.55 && z < 2.80) continue;
      if (ax > 0.9 && z > 2.80) continue; // the bottom course's outer pair stood in the track's climb over the idler
      k1(P, `glacis_k1_${x >= 0 ? 'R' : 'L'}`, 'hull', [x, y, z], 0, Math.PI / 2 - lean);
    }
  }
}

/** The T-80U X side apron's section (profiles/t80uX.ts skirt: the outer edge at x 1.8 at its foot, the inner 1.685 at its
 * top), its foot and top along z. */
const APRON: readonly (readonly [number, number, number])[] = [[-2.882, 0.886, 1.414], [-2.45, 0.815, 1.458], [-1.22, 0.782, 1.504],
  [1.75, 0.762, 1.449], [2.886, 0.782, 1.418]];
function apronAt(z: number): { foot: number; top: number } {
  for (let i = 1; i < APRON.length; i++) {
    const [z0, f0, t0] = APRON[i - 1], [z1, f1, t1] = APRON[i];
    if (z <= z1 || i === APRON.length - 1) { const t = (z - z0) / (z1 - z0); return { foot: f0 + (f1 - f0) * t, top: t0 + (t1 - t0) * t }; }
  }
  throw new Error('unreachable');
}

/** Two rows of containers the full length of each skirt, standing on its outer face (it leans in toward its top), clear of
 * the box on the hull side at z -.69 to -.28, their shoes 5 cm through the thin apron so the outer faces stay inside the
 * tank's 1.80 m half-width (seated on the face, the lower row stood out to 1.829; 3 cm in, to 1.821). Hull frame. */
function skirtK1(P: TankBuilderPort): void {
  // k 0 and 20 (z ±2.70) stood where the track climbs to the idler and the sprocket, and k 1's upper brick (z 2.43) over
  // the start of the climb to the idler (tools/track-clip-audit.mjs --exact --strict): 33 a side
  for (const side of [-1, 1]) for (let k = 1; k < 20; k++) {
    const z = 2.70 - k * 0.27;
    if (z > -0.76 && z < -0.20) continue;
    const { foot, top } = apronAt(z), lean = Math.atan2(0.115, top - foot);
    for (const y of k === 1 ? [top - 0.33] : [top - 0.17, top - 0.33]) {
      const x = 1.8 - 0.115 * (y - foot) / (top - foot) - 0.03;
      k1(P, `skirt_era_${side > 0 ? 'R' : 'L'}`, 'hull', [side * x, y, z], side * Math.PI / 2, lean);
    }
  }
}

/** The front cheek blocks of the factory horseshoe that no smoke bank stands on (profiles/t80uX.ts turretEra: x, z, width,
 * depth, yaw, the inner edge's height; each block's top falls outward to 1.605), a container lying on each top. */
const FREE_CHEEKS: readonly (readonly [number, number, number, number, number, number])[] = [
  [-1.046, 1.231, 0.43, 0.27, -0.59, 1.830], [-0.696, 1.442, 0.44, 0.273, -0.28, 1.826], [0.897, 1.286, 0.336, 0.261, 0.46, 1.841],
];

/** The casting's own stock (no ERA, no fittings), turret frame, for seating roof containers and the gunner's post. */
function castingStock(P: TankBuilderPort): THREE.Mesh[] {
  const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), stock: THREE.Mesh[] = [];
  P.forEachBucketPart('turret', (g) => {
    if (g.userData.eraHitFaceVertexStarts) return;
    const m = new THREE.Mesh(g, mat); m.updateMatrixWorld(); stock.push(m);
  });
  P.disposables.push(mat);
  return stock;
}
/** The casting's top under hull-frame (x, z), in the hull frame, and whether it is roof (not a wall). */
function roofAt(stock: THREE.Mesh[], x: number, z: number): number | null {
  const hit = new THREE.Raycaster(new THREE.Vector3(x - YAW[0], 3, z - YAW[2]), new THREE.Vector3(0, -1, 0)).intersectObjects(stock)[0];
  if (!hit || !hit.face || hit.face.normal.y < 0.8) return null;
  return hit.point.y + YAW[1];
}

/** Keep-outs on the roof (hull frame): the gun's channel and mantlet, both cupolas and hatches, the gunner's sight box,
 * the commander's sight and its head, the M2's pintle and the gunner's post, and the smoke banks over the cheeks. */
function roofClear(x: number, z: number): boolean {
  if (Math.abs(x) < 0.34 && z > 0.92) return false;
  if (Math.hypot(x + 0.6265, z + 0.225) < 0.53 || Math.hypot(x - 0.4495, z + 0.4315) < 0.53) return false;
  if (x > 0.49 && x < 0.98 && z > 0.05 && z < 0.52) return false;
  if (x > -1.07 && x < -0.44 && z > 0.18 && z < 0.90) return false;
  if (x > -0.86 && x < -0.38 && z > -0.12 && z < 0.30) return false;
  if (Math.hypot(x + 0.955, z - 0.251) < 0.30) return false;
  if (Math.abs(x) > 1.0 && z > 0.20 && z < 1.0) return false;
  return true;
}

/** The roof's front half under a field of containers lying flat, long side across, each seated at the lowest of its four
 * corners so none stands off the curved roof; and a container on each free front cheek block. Turret-owned. */
function turretK1(P: TankBuilderPort, stock: THREE.Mesh[]): void {
  for (const z of [1.02, 0.86, 0.70, 0.54, 0.38, 0.22, 0.06]) for (const x of [-0.98, -0.70, -0.42, -0.14, 0.14, 0.42, 0.70, 0.98]) {
    if (!roofClear(x, z)) continue;
    const ys = [[-0.12, -0.06], [0.12, -0.06], [-0.12, 0.06], [0.12, 0.06]].map(([dx, dz]) => roofAt(stock, x + dx, z + dz));
    if (ys.some((y) => y === null)) continue;
    const front = roofAt(stock, x, z + 0.06)!, back = roofAt(stock, x, z - 0.06)!, slope = (front - back) / 0.12;
    k1(P, `turret_k1_${x >= 0 ? 'R' : 'L'}`, 'turret', [x, Math.min(...(ys as number[])), z], 0, Math.PI / 2 + Math.atan(slope));
  }
  for (const [x, z, , depth, yaw, high] of FREE_CHEEKS) {
    const tilt = Math.atan2(depth, high - 1.605), y = (high + 1.605) / 2;
    k1(P, `turret_k1_${x >= 0 ? 'R' : 'L'}`, 'turret', [x, y, z], yaw, tilt);
  }
}

// ------------------------------------------------------------------------------------------------------ roof guns --

/** The gunner's post (hull frame): on the roof ahead and outboard of the gunner's hatch ring (centre .4495, -.4315, radius
 * .3555), clear of the lid and of the gunner's sight box; the gun's bore 0.62 m over the roof, resting 25 degrees
 * outboard. Its reach and the M2's keep 0.2 m apart across their axes' 1.9 m at every bearing. */
const GUNNER_POST = { x: 0.88, z: -0.30, bore: 0.62, bearingDeg: 25 } as const;

function gunnerM240(P: TankBuilderPort, stock: THREE.Mesh[]): void {
  const { x, z } = GUNNER_POST;
  const corners = [[-0.10, -0.09], [0.10, -0.09], [-0.10, 0.09], [0.10, 0.09]].map(([dx, dz]) => roofAt(stock, x + dx, z + dz));
  if (corners.some((y) => y === null)) throw new Error(`${P.spec.id}: the gunner's post has no roof under it`);
  const low = Math.min(...(corners as number[])), high = Math.max(...(corners as number[]));
  const lx = x - YAW[0], lz = z - YAW[2], lowL = low - YAW[1], highL = high - YAW[1];
  // the base plate bedded into the roof's low corner, the socket tube with its foot ring and clamp collar
  const plateTop = highL + 0.014, top = highL + 0.26, h = top - plateTop;
  P.addEquipment('turretDetail', box(0.20, plateTop - lowL + 0.008, 0.18), lx, (plateTop + lowL - 0.008) / 2, lz);
  P.addEquipment('turretDetail', cylY(0.058, 0.016, 16), lx, plateTop + 0.008, lz);
  P.addEquipment('turretDetail', cylY(0.040, h, 16), lx, plateTop + h / 2, lz);
  P.addEquipment('turretDetail', cylY(0.050, 0.045, 16), lx, top - 0.0225, lz);
  P.addEquipment('turretDark', KIT.cylX(0.009, 0.07, 10), lx + 0.08, top - 0.024, lz);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    P.addEquipment('turretDetail', box(0.008, 0.10, 0.06), lx + Math.sin(a) * 0.068, plateTop + 0.05, lz + Math.cos(a) * 0.068, 0, a, 0);
  }
  // the gun on its pintle (the crew pintle's trunnion stands this high over its foot before the riser,
  // machineGunGeometry.ts createPintleLayout at the GPMG's true scale)
  const cls = MG_CLASSES.mag, s = cls.s, trunnion = 0.014 + 0.16 * s + 0.08 * s + cls.rec[1] * s / 2 + 0.004;
  const gun = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', working: true, ridingCradle: true, feed: 'right',
    riser: Math.max(0, highL + GUNNER_POST.bore - top - trunnion), seed: 274 });
  gun.name = 't80uKurskGunnerM240';
  gun.position.set(lx, top, lz);
  gun.rotation.y = THREE.MathUtils.degToRad(GUNNER_POST.bearingDeg);
  P.turretG.add(gun);
}

// --------------------------------------------------------------------------------------------------- the rear kit --

/** The unditching log (the fleet's bark log) on the T-80BV mark's stern seat (profiles/t80Marks.ts stern: the X hull
 * tapers to a .533 half-width at its stern face, so the log spans that face and its chains, 1.40 m), hung by three chains
 * to the upper rear plate; and the two 200 L drums lying tangent on that plate over the empty cradles, as the T-80BV
 * carries them. Hull frame. */
function sternKit(P: TankBuilderPort): void {
  addT90CradleDrums(P, 1.664, -3.433, [[-1.542, -1.179], [1.179, 1.542]]);
  mount(P, 'hull', FITTINGS.unditchingLog({ mats: P.mats, len: 1.40, r: 0.135, straps: 2, seed: 274 }), 0, 1.06, -3.49);
  for (const x of [-0.50, 0, 0.50]) {
    P.addEquipment('hullDark', stowagePart(KIT.torus(0.142, 0.012, 16, 5).rotateY(Math.PI / 2)), x, 1.06, -3.49);
    P.addEquipment('hullDark', stowagePart(beamBetween([x, 1.19, -3.45], [x, 1.30, -3.33], 0.010)), 0, 0, 0);
  }
}

/** The T-80U X casting's flank walls round the rear (profiles/t80uX.ts casting: z, the left and right half-widths, the
 * wall standing to the shoulder at 1.75), and a stowage crate standing against each, turned to the wall's run: the right
 * one forward of the left, as the old Kursk carried them. Turret-owned, below the roof net's edge. */
const CAST_REAR: readonly (readonly [number, number, number])[] = [[-1.20, 0.631, 0.634], [-0.90, 0.942, 0.975], [-0.60, 1.149, 1.161]];
function wallAt(z: number, side: number): { x: number; run: number } {
  const k = z < -0.90 ? 1 : 2, [z0, l0, r0] = CAST_REAR[k - 1], [z1, l1, r1] = CAST_REAR[k];
  const w0 = side > 0 ? r0 : l0, w1 = side > 0 ? r1 : l1, slope = (w1 - w0) / (z1 - z0);
  return { x: side * (w0 + slope * (z - z0)), run: side * Math.atan(slope) };
}
function flankCrates(P: TankBuilderPort): void {
  for (const [side, z] of [[1, -0.70], [-1, -0.86]] as const) {
    const { x, run } = wallAt(z, side), out = side * 0.115 / Math.cos(run), y = 1.66;
    const at = (dx: number, dy: number): [number, number, number] => [x + out + dx - YAW[0], y + dy - YAW[1], z - YAW[2]];
    P.addEquipment('turretDetail', stowagePart(box(0.22, 0.30, 0.34)), ...at(0, 0), 0, run, 0);
    P.addEquipment('turretDetail', stowagePart(box(0.24, 0.02, 0.36)), ...at(0, 0.16), 0, run, 0);
    P.addEquipment('turretDark', stowagePart(box(0.02, 0.10, 0.06)), ...at(side * 0.11 * Math.cos(run), 0.10), 0, run, 0);
  }
}

// ------------------------------------------------------------------------------------------------------ the rest --

/** The fender nose's sloping plate (profiles/t80uX.ts fenderShell: z 3.20 at 1.226, 3.36 at .939; x 1.030-1.722), the
 * yellow paint laid on it at the middle of its 0.33 m run, its quad turned back about x by the plate's lean (a patch
 * centred at the top edge overhung it and the sealed check saw through its back). */
const NOSE_X = 1.376, NOSE_Z = 3.28, NOSE_Y = 1.226 - (NOSE_Z - 3.20) * (1.226 - 0.939) / 0.16, NOSE_PAINT_M = 0.24;
const NOSE_LEAN = Math.atan2(0.16, 1.226 - 0.939);
function fenderIdPaint(P: TankBuilderPort): void {
  const ny = Math.sin(NOSE_LEAN), nz = Math.cos(NOSE_LEAN);
  for (const side of [-1, 1]) {
    P.decal('hull', 'flag', 'ua-fender-id', NOSE_PAINT_M, [side * NOSE_X, NOSE_Y + ny * 0.004, NOSE_Z + nz * 0.004], 0, -NOSE_LEAN, 0);
  }
}

/** The flag pole's foot: on the top of the snorkel's left bracket (profiles/t80uX.ts roofEquipment: box .025 x .433 x
 * .422 at -.982, 1.918, -1.466), hull frame. */
const FLAG_FOOT: Point3 = [-0.982, 1.918 + 0.433 / 2, -1.466];
const FLAG_POLE_M = 0.70, FLAG_CLOTH_M = 0.36;
function flag(P: TankBuilderPort): void {
  const x = FLAG_FOOT[0] - YAW[0], y = FLAG_FOOT[1] - YAW[1], z = FLAG_FOOT[2] - YAW[2];
  // a clamp on the bracket's top, the pole and the cloth flying aft (the decals are the cloth's own square, both faces)
  P.addEquipment('turretDark', box(0.06, 0.05, 0.08), x, y + 0.025, z);
  P.addEquipment('turretDark', cylY(0.013, FLAG_POLE_M, 8), x, y + 0.05 + FLAG_POLE_M / 2, z);
  const clothY = y + 0.05 + FLAG_POLE_M - FLAG_CLOTH_M / 2, clothZ = z - FLAG_CLOTH_M / 2 - 0.015;
  P.addEquipment('turretCloth', box(0.012, FLAG_CLOTH_M, FLAG_CLOTH_M), x, clothY, clothZ);
  for (const s of [-1, 1] as const) {
    P.decal('turret', 'flag', 'ua-flag', FLAG_CLOTH_M, [x + s * 0.008, clothY, clothZ], s * Math.PI / 2, 0, 0);
  }
}

/** The pale ID tape round the thermal sleeve's middle jacket (profiles/t80uX.ts mainGun: hull z 2.158-3.631, radius
 * .1093), hull z. */
const BARREL_BANDS_Z = [2.90, 3.20] as const;
function barrelBands(P: TankBuilderPort): void {
  for (const z of BARREL_BANDS_Z) P.add('gunCanvasPale', cylZ(0.1165, 0.075, P.q ? 32 : 20), 0, 0, z - T80U_X_TRUNNION[2]);
}

export function buildT80UKursk(P: TankBuilderPort): void {
  // the field net and garnish over the roof's rear half (ghillieFleetSuits.ts t80u_kursk), laid on the assembled build
  addVehicleGhillieSuit(P);
  buildT80UX(P, { commanderMg: false });
  machineGun(P, 'm2', 't80uKurskCommanderM2Station');
  const stock = castingStock(P);
  glacisK1(P);
  skirtK1(P);
  turretK1(P, stock);
  gunnerM240(P, stock);
  sternKit(P);
  flankCrates(P);
  fenderIdPaint(P);
  flag(P);
  barrelBands(P);
  P.hullG.userData.familyRebuild = { donor: 't80u', revision: 1, variant: 'ua-service' };
  P.turretG.userData.t80uKurskReceipt = {
    base: 't80u-x', fit: 'ua-2022-captured', kontakt1: k1Counts(P), roofGuns: ['m2', 'm240'],
    rearKit: ['unditching-log', 'stern-drums', 'flank-crates'], ghillie: ['turret-rear-roof'], fenderIdPaint: 2, flag: 'ua', barrelBands: BARREL_BANDS_Z.length,
  };
}
