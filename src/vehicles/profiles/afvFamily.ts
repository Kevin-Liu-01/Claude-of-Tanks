import { buildBradleyA3Turret, placeBradleyA3CheekEra, placeBradleyA3SideEra } from './bradleyA3Turret.ts';
import {buildUpiorUpgrade} from './upiorUpgrade.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import { buildT72B3MXHull } from './t72b3mX.ts';
import { T72B3M_X_SOURCE_DATUMS } from '../t72b3mXArmor.ts';
import { buildBmpt72Station, addBmpt72HullKit } from './bmpt72Station.ts';
import { weaponAssembly } from './weaponStock.ts';
// First-party procedural AFV family.
//
// The owner-supplied GLBs are six-view silhouette/equipment oracles only.
// Each playable below retains one certified suspension-driven smart course
// from its closest native family, then authors the vehicle-specific hull
// armor, turret, gun plant and supported equipment in project primitives.

import * as THREE from 'three';
import { markVehicleNightLens } from '../vehicleNightLighting.ts';
import { KIT, FITTINGS, orientedSlab, convexSlab, muzzleBore, muzzleTipDot } from './kit.ts';
import {
  BRADLEY_GLACIS,
  BRADLEY_HULL,
  buildBradley,
  buildPuma,
  bradleyFlankDressing,
} from '../modern3.ts';
import { BMP_HULL_OPTIONS, buildBmpBoatHull } from './bmpBoatHull.ts';
import { addBwp1Applique, buildBwp1Rcws30 } from './bwp1Rcws30.ts';
import { addBmp3HullDetail, addBmp3SternWaterJetFlaps, buildBmp3WeldedTurret } from './bmp3Family.ts';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { T90_X_PROFILES } from './t90X.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mount } from './fittingMount.ts';
import { ammoCanParts, fieldChestParts } from './fieldChest.ts';
import { fabricBody, fabricStrap, type FabricSpec } from '../accessoryPrimitives.ts';
import { jerrycanParts } from '../accessoryKits.ts';
import { buildTerminatorT90Station } from './bmptT90Station.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type EraPut = (...transform: number[]) => void;

interface SideArmorOptions {
  count?: number;
  front?: number;
  step?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  d?: number;
  rz?: number;
  cap?: boolean;
}

type AfvBuilderPort = TankBuilderPort;

const nonUniformXform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x: number,
  y: number,
  z: number,
  rotationX: number,
  rotationY: number,
  rotationZ: number,
  scale: number | readonly number[],
) => THREE.BufferGeometry;

function armorTile(
  P: AfvBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  cap = true,
): void {
  const r = rotation || [0, 0, 0];
  const body = owner === 'hull' ? 'hull' : 'turret';
  const dark = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(body, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (cap) P.add(dark, KIT.box(w * 0.72, 0.016, Math.max(0.025, d * 0.08)),
    x, y + h * 0.50 + 0.010, z + d * 0.22, r[0], r[1], r[2]);
}

function clearUpperStructure(P: AfvBuilderPort): void {
  P.clear('turret', 'turretDark', 'turretDetail', 'turretGlass', 'turretCloth',
    'turretExternalArmor', 'turretCupola', 'turretHatch', 'gun', 'gunDark', 'gunMount', 'gunMountDark');
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) {
    if (child !== P.gunG) P.turretG.remove(child);
  }
  for (const child of [...P.gunG.children]) {
    if (child !== P.recoilG) P.gunG.remove(child);
  }
  for (const child of [...P.recoilG.children]) {
    if (!child.name.startsWith('rig_barrel_')) P.recoilG.remove(child);
  }
  delete P.turretG.userData.bradleyA2TurretClosureReceipt;
}

function radioPair(P: AfvBuilderPort, y: number, z: number, seed: number, spread = 0.92): void {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.032, 0.042, 0.060, 10), side * spread, y, z);
    mount(P, 'turret', FITTINGS.antennaWhip({
      mats: P.mats, h: side < 0 ? 0.72 : 0.60, r: 0.011,
      rake: -side * 0.04, seed: seed + (side > 0 ? 1 : 0),
    // Sink the fitting's own pot into the broad authored shoe so the whip
    // remains one connected supported component in every yaw mask.
    }), side * spread, y + 0.005, z);
  }
}

function smokePair(
  P: AfvBuilderPort,
  x: number,
  y: number,
  z: number,
  count: number,
  seed: number,
  pitch = -0.42,
): void {
  for (const side of [-1, 1]) {
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count, r: 0.040, len: 0.27, spacing: 0.095,
      splay: side * 1.02, pitch, arc: 0.60, slot: 'detail',
      rotation: [0, 0, -side * 0.10], seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z);
  }
}

function sideArmorCourse(P: AfvBuilderPort, o: SideArmorOptions = {}): void {
  const count = o.count || 7;
  for (const side of [-1, 1]) for (let i = 0; i < count; i++) {
    const z = (o.front ?? 2.35) - i * (o.step ?? 0.78);
    const x = side * (o.x ?? 1.68), y = o.y ?? 1.17, w = o.w ?? 0.08, h = o.h ?? 0.50, d = o.d ?? 0.66;
    const rz = side * (o.rz ?? 0.018);
    // Spaced side armour stands off the hull on brackets (owner 2026-10-19 sweep: the tiles floated up to 0.19 m
    // beside the hull side with nothing joining them): each tile hangs from the stock over or beside its top edge
    // (mudguardHangers.ts), the dark cap riding its top.
    P.hangMudguard('afv-side-armor-tile', 'hull', KIT.box(w, h, d), x, y, z, 0, 0, rz);
    if (o.cap !== false) P.add('hullDark', KIT.box(w * 0.72, 0.016, Math.max(0.025, d * 0.08)),
      x, y + h * 0.50 + 0.010, z + d * 0.22, 0, 0, rz);
    // a backing strap behind each joint ties the course together, so the bow tile (no stock over or beside it at the
    // falling nose) rides its neighbour; it laps 20 mm into each tile's back
    const step = o.step ?? 0.78;
    if (i < count - 1) P.add('hull', KIT.box(0.02, h * 0.5, step - d + 0.04),
      side * ((o.x ?? 1.68) - w / 2 + 0.006), y, z - step / 2, 0, 0, rz);
  }
}

function bowLightPair(P: AfvBuilderPort, x: number, y: number, z: number, seed: number): void {
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.13, r: 0.045,
      shield: true, rake: -0.15, seed: seed + (side > 0 ? 1 : 0),
    }), side * x, y, z, [-0.14, 0, 0]);
  }
}

// 267 rebuild (owner: "now update the ... bmp 3 rok"): the BMP-3 in Republic of Korea Army service (delivered
// 1996-2005; research/bmp3_rok: the 3rd Armoured Brigade photograph) is the standard export BMP-3, so it stands on the
// fleet's BMP-3 hull (buildBMP3Hull: rear-engined boat hull with the wave-breaker bow, bow PKTs, rear drive sprocket,
// rear doors under the raised troop deck). Round 268b (the owner: "make a new bmp 3 turret"): it carries the new
// welded BMP-3 turret (profiles/bmp3Family.ts) with its own 2A70 + 2A72 + PKT plant, whips, flank bins and markings.

// The BMP-3 hull's three stern roof pockets (census: the void under the stern block behind the leaning underside
// plate, x +-1.01 y 0.53..0.63, and the two slots under the troop hatches' rear lips, y 1.67..1.73): solid fills inside
// the existing envelope. Round 268b: buildBMP3Hull calls it, so bmp3 closes them too.
function closeBmp3SternPockets(P: AfvBuilderPort): void {
  const q: Array<[number, number]> = [[-3.18, 0.35], [-3.53, 0.66], [-3.53, 0.675], [-3.06, 0.675]];
  P.add('hull', orientedSlab(
    ...q.map(([z, y]) => [-1.00, y, z] as Vec3Tuple) as [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple],
    ...q.map(([z, y]) => [1.00, y, z] as Vec3Tuple) as [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple]));
  P.add('hull', KIT.box(1.40, 0.185, 0.13), 0, 1.7425, -3.30);
}

function buildBMP3ROK(P: AfvBuilderPort): void {
  buildBMP3Hull(P);
  P.clearDecals('hull');
  P.decal('hull', 'soot', null, 0.55, [0.90, 1.60, -3.585], Math.PI);
  buildBmp3WeldedTurret(P, 'bmp3_rok');
}

// 268 (owner: "update all the bradleys"): the Ukrainian M2A2 ODS-SA as the captured vehicles show it (research/
// ua_m2a3_bradley 1-6, Saratov and Moscow). Round 3 (blind A/B b2, both critics: the photos show two unbroken rows):
// BRAT tiles in two unbroken rows of thirteen along the whole upper side band on both sides (face x 1.57, the lower
// row on the skirt ledge 1.27, the upper 1.2 cm under the plate top 1.93; research notes: ~0.36 x 0.38 m tiles, 13 a
// row), from the stern to where the side's top falls along the glacis, the lower row on one more tile to the bow box;
// they cover the side boxes, vent and grille, which stay off this vehicle (bradleyFlankDressing sideFittings false).
// Two rows of four across the upper glacis and six across the folded trim vane (photo 6), a column on the turret's
// left (+X) wall aft of the stowed TOW launcher; no roof gun (the owner's field standard 2026-10-08: the 25 mm, the
// M240C coax and TOW).
const UA_BRAT = Object.freeze({
  depth: 0.085, tileZ: 0.36, tileY: 0.32, pitchZ: 0.368, rowsY: [1.428, 1.758] as const,
  rowStartZ: -3.00, tilesPerRow: 13, lowerExtraZ: [1.97] as const,
});

function addUkrainianBradleyPackage(P: AfvBuilderPort): void {
  const { box } = KIT;
  const B = UA_BRAT;
  const x = BRADLEY_HULL.sideX + B.depth / 2 - 0.002;
  for (const side of [-1, 1]) {
    for (let k = 0; k < B.tilesPerRow; k++) {
      const z = B.rowStartZ + B.tileZ / 2 + k * B.pitchZ;
      for (const y of B.rowsY) P.add('hull', box(B.depth, B.tileY, B.tileZ), side * x, y, z);
    }
    for (const z of B.lowerExtraZ) P.add('hull', box(B.depth, B.tileY, B.tileZ), side * x, B.rowsY[0], z);
  }
  // across the upper glacis (two rows of four inside the deck crown's ±0.85) and the folded trim vane (six: vane centre
  // 3.05 cm off the glacis plane, 4.5 cm thick); the shared glacis link course gives way (addUkrainianBradleyFieldKit)
  const G = BRADLEY_GLACIS, n = G.normalOutward;
  for (const tz of [1.88, 2.16]) for (const tx of [-0.63, -0.21, 0.21, 0.63]) {
    const lift = 0.0405;
    P.add('hull', box(0.40, 0.085, 0.30), tx, G.yAt(tz) + n.y * lift, tz + n.z * lift, G.angleRad, 0, 0);
  }
  for (let i = 0; i < 6; i++) {
    const tx = -0.925 + i * 0.37, tz = 2.48, lift = 0.0305 + 0.0225 + 0.035;
    P.add('hull', box(0.34, 0.07, 0.30), tx, G.yAt(tz) + n.y * lift, tz + n.z * lift, G.angleRad, 0, 0);
  }
  // the turret's left (+X) wall aft of the stowed TOW launcher: a column of two tiles over the chine
  for (const z of [-0.93]) for (const y of [0.43, 0.65]) {
    P.add('turret', box(0.08, 0.22, 0.29), 0.87, y, z);
  }
  P.decal('turret', 'number', 'UA B3', 0.21, [1.365, 0.53, -0.25], Math.PI / 2);                // on the stowed TOW box
  addUkrainianBradleyFieldKit(P);
  P.topY = Math.max(P.topY || 0, 1.43);
}

// ---- the frontline kit (268, the owner: "the m2a3 bradley needs a lot more decorrations and props too") -------------
// Seated on the shared hull's measured surfaces (modern3.ts BRADLEY_HULL, BRADLEY_GLACIS) and kept out of every sweep:
// the turret's low parts pass 2.18 m and over within 1.66 m of the ring, the 25 mm at -9 deg passes 2.13 m and over to
// its 2.85 m reach, so nothing below stands above 2.0 m within them. Spare links on the nose shelf and the bow plate
// (the shared glacis course gives way to the BRAT); round 3 (blind A/B b2): an open railed cage across the turret rear
// in place of the small bundle rack, holding a camouflage-net bundle, two rucksacks, a bedroll and an ammunition chest
// beside the shared kit bag; a log in the right roof gutter and a net roll in the left; a side basket on the right
// rear (ammunition chest and can, rucksack, bedroll) and a jerrycan shelf on the left rear with a net roll on the
// cans, both hung outboard of the BRAT course.
const UA_KIT = Object.freeze({
  // the BRAT tiles' outer face on the side plates, and the skirt ledge and skirt face the side racks stand on
  tileFaceX: BRADLEY_HULL.sideX + UA_BRAT.depth - 0.002, ledgeY: 1.27, skirtX: 1.70,
  rearZ: [-2.98, -2.10] as const,
});

function uaSoftLoad(P: AfvBuilderPort, slot: string, strapSlot: string, spec: FabricSpec,
  at: readonly [number, number, number], yaw: number): void {
  P.addEquipment(slot, fabricBody(spec), at[0], at[1], at[2], 0, yaw, 0);
  for (const z of spec.cinch || []) P.addEquipment(strapSlot, fabricStrap(spec, z, 0.032, 0.006), at[0], at[1], at[2], 0, yaw, 0);
}
/** A soft load's centre height over the surface it rests on (its pressed base sinks 4 mm). */
const uaRestY = (spec: FabricSpec) => spec.hh * (1 - (spec.flatten ?? 0)) - 0.004;

function addUkrainianBradleyFieldKit(P: AfvBuilderPort): void {
  const { box } = KIT;
  const K = UA_KIT;
  // the shared glacis link course gives way to the BRAT across the glacis; two short runs lie on the nose shelf (1.40,
  // z 2.84..3.18) and one stands on the bow plate (z 3.265, y 0.98..1.32) between the tow shackles, beyond the muzzle
  for (const child of [...P.hullG.children]) {
    if (child.name === 'fitting_spareTrackLinks' && child.position.z > 2.0 && child.position.z < 2.4) P.hullG.remove(child);
  }
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.spareTrackLinks({ mats: P.mats, links: 2, width: 0.48, seed: 31 + side }),
      side * 0.42, BRADLEY_HULL.noseY + 0.03, 3.00);
  }
  mount(P, 'hull', FITTINGS.spareTrackLinks({ mats: P.mats, links: 2, width: 0.48, seed: 33 }),
    0, 1.15, BRADLEY_HULL.bowZ + 0.03, [Math.PI / 2, 0, 0]);
  addUkrainianBradleyBustleCage(P);
  // an unditching log nested in the right roof gutter (x -1.51 plate, 1.67 gutter, the roof falling 0.59 a metre):
  // touching the plate's inner face and the roof, 20 cm under the turret bin's floor as it turns
  const logR = 0.11, logX = -(BRADLEY_HULL.edgeX - logR);
  const roofAt = 2.06 - 0.591 * (-logX - BRADLEY_HULL.crownX);
  mount(P, 'hull', FITTINGS.unditchingLog({ mats: P.mats, len: 1.80, r: logR, straps: 2, seed: 2681, axis: 'z' }),
    logX, roofAt + logR / Math.cos(Math.atan(0.591)), -1.55);
  // a camouflage-net roll in the left roof gutter (the roof falling 0.70 a metre to 1.60), alongside the turret, 39 cm
  // under the stowed launcher's floor as it turns
  const rollR = 0.10, rollX = BRADLEY_HULL.edgeX - rollR, slope = 0.46 / 0.66;
  const netRoll: FabricSpec = { len: 1.30, hw: rollR, hh: rollR, exponent: 2.2, endScale: 0.85, endLength: 0.08, flatten: 0.12,
    wrinkle: 0.07, cinch: [-0.42, 0, 0.42], cinchDepth: 0.06 };
  uaSoftLoad(P, 'hullCloth', 'hullDark', netRoll,
    [rollX, 2.06 - slope * (rollX - BRADLEY_HULL.crownX) + rollR / Math.cos(Math.atan(slope)) + 0.01, -0.25], 0);
  // right rear: a welded basket hung outboard of the BRAT course from the plate top, standing on the skirt top
  const [z0, z1] = K.rearZ, zc = (z0 + z1) / 2, len = z1 - z0;
  const bx0 = -(K.tileFaceX + 0.002), bx1 = -1.985, bxc = (bx0 + bx1) / 2, bw = bx0 - bx1;
  P.addEquipment('hullDetail', box(bw, 0.03, len), bxc, K.ledgeY + 0.015, zc);                         // floor
  for (const z of [z0 + 0.0125, z1 - 0.0125]) {
    for (const x of [bx0 - 0.0125, bx1 + 0.0125]) P.addEquipment('hullDetail', box(0.025, 0.50, 0.025), x, K.ledgeY + 0.28, z);
    P.addEquipment('hullDetail', box(bw, 0.025, 0.025), bxc, K.ledgeY + 0.53, z);                    // end rails
    // the hanger over the plate top and down to the inner post
    P.addEquipment('hullDetail', box(0.13, 0.025, 0.03), -1.605, 1.9425, z);
    P.addEquipment('hullDetail', box(0.025, 0.15, 0.03), bx0 - 0.0125, 1.865, z);
  }
  for (const y of [K.ledgeY + 0.25, K.ledgeY + 0.53]) P.addEquipment('hullDetail', box(0.025, 0.025, len), bx1 + 0.0125, y, zc);
  const floor = K.ledgeY + 0.03, cx = bxc;
  const chest = fieldChestParts(0.26, 0.28, 0.42, { high: P.q !== false, handles: false });
  for (const g of chest.paint) P.addEquipment('hull', g, cx, floor, z0 + 0.25);
  for (const g of chest.dark) P.addEquipment('hullDark', g, cx, floor, z0 + 0.25);
  const can = ammoCanParts(P.q !== false);
  for (const g of can.paint) P.addEquipment('hull', g, cx, floor + 0.28 + 0.005, z0 + 0.25, 0, Math.PI / 2, 0);
  for (const g of can.dark) P.addEquipment('hullDark', g, cx, floor + 0.28 + 0.005, z0 + 0.25, 0, Math.PI / 2, 0);
  KIT.stowage(P, 'hullCloth', P.rng, [[cx, floor + 0.19, z1 - 0.20, 0.25, 0.38, 0.30]]);
  const bed: FabricSpec = { len: 0.80, hw: 0.08, hh: 0.075, exponent: 2.2, endScale: 0.82, endLength: 0.08, flatten: 0.22,
    wrinkle: 0.05, cinch: [-0.24, 0.24], cinchDepth: 0.07 };
  uaSoftLoad(P, 'hullCloth', 'hullDark', bed, [cx, K.ledgeY + 0.5425 + uaRestY(bed), zc], 0);
  // left rear: a shelf on the skirt top and two brackets to the skirt face, two jerrycans on it against the BRAT
  // course, a retaining strap on two posts
  const sx0 = K.tileFaceX + 0.002, sx1 = 1.855, sxc = (sx0 + sx1) / 2;
  P.addEquipment('hullDetail', box(sx1 - sx0, 0.03, len), sxc, K.ledgeY + 0.015, zc);
  for (const z of [z0 + 0.10, z1 - 0.10]) {
    P.addEquipment('hullDetail', box(sx1 - K.skirtX, 0.10, 0.02), (sx1 + K.skirtX) / 2, K.ledgeY - 0.05, z);
    P.addEquipment('hullDetail', box(0.02, 0.38, 0.02), sx1 - 0.01, K.ledgeY + 0.22, z);
  }
  P.addEquipment('hullDetail', box(0.02, 0.06, len), sx1 - 0.01, K.ledgeY + 0.06, zc);                // lip
  const canX = sx0 + 0.0825;
  P.addEquipment('hullDetail', box(0.012, 0.03, len), sx1 - 0.026, K.ledgeY + 0.35, zc);              // strap
  for (const z of [z0 + 0.20, z0 + 0.58]) {
    const c = jerrycanParts(1, [1], P.q !== false);
    for (const g of [c.body, ...c.stamps, c.spine, ...c.grips]) P.addEquipment('hullCloth', g, canX, K.ledgeY + 0.03, z);
    if (c.spout) P.addEquipment('hullDark', c.spout, canX, K.ledgeY + 0.03, z);
  }
  // a net roll lashed along the cans' handles
  const canRoll: FabricSpec = { len: 0.70, hw: 0.075, hh: 0.075, exponent: 2.2, endScale: 0.85, endLength: 0.08,
    flatten: 0.20, wrinkle: 0.06, cinch: [-0.22, 0.22], cinchDepth: 0.05 };
  uaSoftLoad(P, 'hullCloth', 'hullDark', canRoll, [canX, K.ledgeY + 0.03 + 0.44 + 0.036 + uaRestY(canRoll), z0 + 0.39], 0);
}

// Round 3 (blind A/B b2): the open railed cage across the turret rear (turret frame) in place of the shared bundle rack:
// a floor grate of round bars, corner and middle posts, two rail courses, two brackets into the rear wall; inside, beside
// the shared kit bag (modern3.ts addBradleyTurretKit: x -0.26..0.54, z -1.55..-1.25 on 0.35), a camouflage-net bundle,
// two rucksacks, a bedroll and an ammunition chest. Its floor passes 13 cm over the raised troop roof as it turns.
const UA_CAGE = Object.freeze({ x0: -0.86, x1: 0.80, zf: -1.21, zr: -1.76, floorY: 0.338, midY: 0.56, topY: 0.80 });

function addUkrainianBradleyBustleCage(P: AfvBuilderPort): void {
  const { box, cylX, cylY, cylZ } = KIT;
  const C = UA_CAGE, w = C.x1 - C.x0, d = C.zf - C.zr, xc = (C.x0 + C.x1) / 2, zc = (C.zf + C.zr) / 2;
  for (const child of [...P.turretG.children]) if (child.name === 'fitting_stowageRack') P.turretG.remove(child);
  const bar = 0.011, floorTop = C.floorY + bar;
  for (const z of [C.zf - 0.03, zc, C.zr + 0.03]) P.addEquipment('turretDetail', cylX(bar, w, 8), xc, C.floorY, z);
  for (const x of [C.x0 + 0.015, -0.30, 0.25, C.x1 - 0.015]) {
    P.addEquipment('turretDetail', cylZ(bar, d, 8), x, C.floorY - 2 * bar, zc);
  }
  const postH = C.topY - (C.floorY - 3 * bar);
  for (const [x, z] of [[C.x0 + 0.015, C.zr + 0.015], [C.x1 - 0.015, C.zr + 0.015], [-0.30, C.zr + 0.015], [0.25, C.zr + 0.015],
    [C.x0 + 0.015, C.zf - 0.015], [C.x1 - 0.015, C.zf - 0.015]] as const) {
    P.addEquipment('turretDetail', cylY(0.014, 0.014, postH, 8), x, (C.topY + C.floorY - 3 * bar) / 2, z);
  }
  for (const y of [C.midY, C.topY]) {
    P.addEquipment('turretDetail', cylX(0.013, w, 8), xc, y, C.zr + 0.015);
    for (const x of [C.x0 + 0.015, C.x1 - 0.015]) P.addEquipment('turretDetail', cylZ(0.013, d, 8), x, y, zc);
  }
  P.addEquipment('turretDetail', cylX(0.013, w, 8), xc, C.topY, C.zf - 0.015);
  // two welded brackets from the rear wall (its face at z -1.20, x -0.84..0.70 at this height) down on to the floor bar
  for (const x of [-0.60, 0.45]) P.addEquipment('turretDetail', box(0.05, 0.13, 0.05), x, 0.40, C.zf - 0.02);
  // the loads, each clear of its neighbours
  const net: FabricSpec = { len: 0.80, hw: 0.085, hh: 0.10, exponent: 2.8, endScale: 0.62, endLength: 0.10, flatten: 0.30,
    wrinkle: 0.09, cinch: [-0.26, 0, 0.26], cinchDepth: 0.08 };
  uaSoftLoad(P, 'turretCloth', 'turretDark', net, [0.10, floorTop + uaRestY(net), -1.636], Math.PI / 2);
  const bed: FabricSpec = { len: 0.48, hw: 0.085, hh: 0.085, exponent: 2.2, endScale: 0.82, endLength: 0.08, flatten: 0.22,
    wrinkle: 0.05, cinch: [-0.14, 0.14], cinchDepth: 0.07 };
  uaSoftLoad(P, 'turretCloth', 'turretDark', bed, [-0.40, floorTop + uaRestY(bed), -1.48], 0);
  KIT.stowage(P, 'turretCloth', P.rng, [[0.67, floorTop + 0.20, -1.38, 0.20, 0.40, 0.26],
    [0.67, floorTop + 0.18, -1.64, 0.20, 0.36, 0.20]]);
  const chest = fieldChestParts(0.30, 0.26, 0.44, { high: P.q !== false, handles: false });
  for (const g of chest.paint) P.addEquipment('turret', g, -0.67, floorTop, -1.49);
  for (const g of chest.dark) P.addEquipment('turretDark', g, -0.67, floorTop, -1.49);
}

function buildUAM2A3(P: AfvBuilderPort): void {
  buildBradley(P);
  addUkrainianBradleyPackage(P);
  // OWNER BRADLEY ORDER (2026-08-17): the shared internal-fill and side-armour grammar (modern3.ts).
  // (round 3: the full BRAT course covers the side plates, so their boxes, vent, grille and side markings stay off)
  bradleyFlankDressing(P, { sideFittings: false });
  const turretReceipt = P.turretG.userData.bradleyA2TurretClosureReceipt;
  P.turretG.userData.uaBradleyRoofSeatingReceipt = Object.freeze({
    revision: 'source-roof-r3',
    roofY: turretReceipt.roofY,
    // the shell's Integrated Sight Unit (modern3.ts addBradleyTurretKit) is the roof's only plinth: no pintle
    isuPlinth: Object.freeze({ x: 0.50, z: 0.30, bottomY: turretReceipt.roofY - 0.01, topY: turretReceipt.roofY + 0.35 }),
  });
}

// =========================== BMPT-72 "Terminator 2" ==========================
// 267 (lane bmpt-family-267; the owner: "upgrade our BMPT T-72"): the BMPT-72 is a T-72 conversion, so it rides the
// fleet's T-72 X hull, built in place by its own builder (t72b3mX.ts buildT72B3MXHull: the T-72B3M's measured tub,
// running gear, fenders, Relikt glacis cover and boxed Relikt skirts, deck and stern fittings; it was the T-80U X hull),
// carries the Ramka-72 module on the T-72's ring and adds the slat screens over the engine compartment's flanks and
// across the stern (profiles/bmpt72Station.ts, from the Army-2016/2018/2020 photographs).
function addTerminatorStation(P: AfvBuilderPort): void {
  clearUpperStructure(P);
  // The station's own turntable is the only turretTrack stock (no donor crown course under it).
  P.clear('turretTrack');
  buildBmpt72Station(P);
  P.turretG.userData.bmptTerminator2TurretSeatingReceipt = Object.freeze({
    revision: 'bmpt72-t72-ring-r2',
    ring: 't72b3m_2016',
    inheritedDonorTurretTrack: false,
    dedicatedTurntable: true,
  });
}

function buildBMPT2(P: AfvBuilderPort): void {
  buildT72B3MXHull(P);
  // the T-72B3M's ring, on the centreline (its datum's 7 um lateral offset is measurement noise; the twin plant's centre
  // anchor is held to the axis, recoilRig.selftest.mjs)
  const [, ringY, ringZ] = T72B3M_X_SOURCE_DATUMS.turretPivot;
  P.turretG.position.set(0, ringY, ringZ);
  addTerminatorStation(P);
  addBmpt72HullKit(P);
  P.hullG.userData.familyRebuild = { donor: 't72b3m_2016', revision: 3 };
}

// 267 rebuild (owner: "now update the ... bwp-1"): the Polish BWP-1 on the shared BMP-1/BMP-2 boat hull
// (profiles/bmpBoatHull.ts, BMP-1 stations) with the BWP-1M "Puma" demonstrator fit: bolted appliqué and the unmanned
// Rafael RCWS-30 station with its Spike-LR canister (profiles/bwp1Rcws30.ts).
function buildBWP1Variant(P: AfvBuilderPort): void {
  buildBmpBoatHull(P, 'bwp1');
  buildBwp1Rcws30(P);
  addBwp1Applique(P, BMP_HULL_OPTIONS.bwp1.binOuter);
}

// ============================ Marder 1A3 ====================================
// §5.302 OWNER ORDER (verbatim): "now completely revert our marder hull while
// preserving its new turret". The pre-§5.286 Bradley-donor hull returns
// COMPLETELY — buildBradley loft/gear/skirts/glacis/ramp/fenders plus the A3
// appliqué rails and bow lights below; the wave's ground-up hull (scalloped
// hem, one-plane glacis + fording vane, ramp frame/drums/lights) reverts with
// it. The §5.269-fix LOW CAST turret (external MK20 carriage, MILAN, offset
// commander station, smoke collars) is PRESERVED verbatim in
// addMarderCastTurret and re-seats at the old hull's ring station
// (0.18, -0.05) — the pre-wave turret station — at y 1.895 (donor roof plate
// top 1.905: the collar's local -0.02..0.08 band buries 0.03 into the roof,
// §B2 no-air at the ring seam). Seat rides the spec armor turretPivot.
function addMarderCastTurret(P: AfvBuilderPort): void {
  const { box, cylY, cylZ, lathe, buildGun } = KIT;
  clearUpperStructure(P);
  // ---- LOW CAST ROUND-FRONTED turret (§5.269 rebuild: the tall two-tier
  // box is dead — one smooth casting, longer than wide, rounded front,
  // with the EXTERNAL MK20 carriage riding above it) ------------------------
  P.add('turret', cylY(0.70, 0.78, 0.10, 22), 0, 0.03, 0.0);                   // seating collar
  P.add('turret', nonUniformXform(lathe([                                       // cast body: rounded shoulder,
    [0.70, 0.02], [0.72, 0.10], [0.70, 0.22], [0.64, 0.34],                     //   crown 2.585
    [0.52, 0.44], [0.34, 0.52], [0.12, 0.56], [0.0, 0.565],
  ], 22), 0, 0, 0, 0, 0, 0, [1.02, 1, 1.22]), 0, 0, 0.03);
  // external carriage: trunnion towers rooted in the casting + cradle beam
  for (const s of [-1, 1]) {
    P.add('turret', box(0.14, 0.30, 0.30), s * 0.24, 0.62, 0.22);              // trunnion towers (base 0.47 buried)
  }
  P.add('turret', box(0.60, 0.14, 0.42), 0, 0.90, 0.20);                       // carriage beam, top 2.96
  P.add('turret', box(0.20, 0.20, 0.34), 0, 0.76, 0.21);                       // carriage riser web
  // §5.349 RESIDUE (§B2 sweep handoff marder(a)): the MILAN-carriage pocket
  // — enclosed sky [y 2.66..2.87, z -0.59..-0.31] world (552px plain-side
  // pre-landing, 631+802px at the live seat) between the cast crown, the
  // MILAN tube underside, the carriage towers and the MG cluster. Solid
  // carriage pedestal web closes the mount frame to the casting: spans the
  // inter-tower bay (x +-0.17 flush to the trunnion tower inner faces),
  // welds into the beam/riser undersides (top 0.87 vs beam bottom 0.83) and
  // buries into the cast crown (bottom 0.42). Every §5.269 cast line and
  // carriage/MILAN/PERI piece stays untouched (§5.354 fence).
  P.add('turret', box(0.34, 0.45, 0.67), 0, 0.645, -0.255);
  P.addGunExtra(box(0.30, 0.24, 0.55), 0, 0, 0.16);                            // cradle block
  P.addGunExtra(cylZ(0.075, 0.24, 14, 0.06), 0, 0, 0.50);                      // collar taper
  buildGun(P, { len: 2.55, r: 0.026, sleeve: false, collar: true, baseR: 0.075 });
  muzzleBore(P, { len: 2.55, r: 0.026 });
  P.addGunExtraDark(cylZ(0.014, 0.55, 8), 0.16, -0.05, 0.65);                  // coax MG3 tube
  muzzleTipDot(P, 0.16, -0.05, 0.93, 0.010, { parent: 'gunG' });
  // MILAN launcher on the RIGHT of the carriage (A3-era identity)
  weaponAssembly(P, () => {
    P.addEquipment('turret', box(0.14, 0.36, 0.30), 0.44, 0.66, -0.14);                   // launcher seat (rooted in the cast)
    P.add('turretDark', cylZ(0.115, 1.05, 14), 0.55, 0.92, -0.10);               // MILAN tube, crown 3.06
    P.add('turretDetail', cylZ(0.122, 0.03, 14), 0.55, 0.92, 0.43);              // tube mouth ring
    P.add('turretDark', box(0.10, 0.16, 0.22), 0.42, 0.90, -0.36);               // sight/grip block
  });
  // PERI-Z11 commander sight LEFT + gunner sight hood on the roof front
  P.add('turret', box(0.20, 0.40, 0.22), -0.32, 0.70, -0.10);                  // PERI tower, crown 3.04 (base
  P.add('turretDark', box(0.16, 0.06, 0.03), -0.32, 0.86, 0.02);
  P.add('turretGlass', box(0.13, 0.035, 0.014), -0.32, 0.855, 0.033);
  P.add('turret', box(0.16, 0.14, 0.16), 0.16, 0.575, 0.44);                   // gunner hood (on the cast slope)
  P.add('turretGlass', box(0.11, 0.045, 0.015), 0.16, 0.605, 0.525);
  // commander cupola LEFT-REAR — ringed command station (owner c425f495
  // intent, absorbed into the ground-up frame): flush ring + torus + lid
  // plate + periscope glass trio.
  P.add('turret', cylY(0.23, 0.25, 0.09, 16), -0.28, 0.525, -0.36);            // (ring sunk onto the casting)
  P.add('turretDark', KIT.torus(0.23, 0.011, 16), -0.28, 0.585, -0.36);
  P.add('turret', box(0.32, 0.05, 0.34), -0.28, 0.605, -0.36, 0, -0.10, 0);    // station lid plate
  for (let i = -1; i <= 1; i++) {
    P.add('turretGlass', box(0.068, 0.042, 0.022), -0.28 + i * 0.085, 0.625, -0.185, 0, -0.10, 0);
  }
  // unequal side service boxes low on the raked walls (owner intent + the
  // 1A3's real flank stowage), lids seamed; they stay inside the tw plan
  for (const side of [-1, 1]) {
    P.add('turret', box(0.16, 0.22, side < 0 ? 0.46 : 0.38), side * 0.585, 0.27, -0.14,
      0, 0, side * 0.045);
    P.add('turretDark', box(0.025, 0.13, side < 0 ? 0.36 : 0.28), side * 0.665, 0.29, -0.14,
      0, 0, side * 0.045);
  }
  // closed rear equipment wall + basket rails (owner "close the empty tail"
  // + the 1A3's real turret rear bin)
  P.add('turret', box(0.92, 0.26, 0.22), 0, 0.30, -0.80);
  P.add('turretDark', box(0.74, 0.13, 0.035), 0, 0.31, -0.92);
  mount(P, 'turret', FITTINGS.stowageRack({
    mats: P.mats, w: 0.90, d: 0.28, h: 0.20, fill: 0.66, rails: 3, seed: 3497,
  }), 0, 0.47, -0.86);
  // VH.14 (2026-10-14): no roof machine gun on the real vehicle (roofWeaponPolicy.ts); the decorative pintle is gone.
  for (const sde of [-1, 1]) {
    P.add('turret', box(0.12, 0.20, 0.34), sde * 0.60, 0.30, -0.44, 0, 0, sde * 0.10); // smoke collar seats
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 3, r: 0.044, len: 0.30, spacing: 0.105,
      splay: sde * 1.1, pitch: -0.38, arc: 0.60, slot: 'detail',
      rotation: [0, sde * 0.08, -sde * 0.08], seed: 3510 + (sde > 0 ? 1 : 0),
    }), sde * 0.62, 0.40, -0.46);                                              // banks READ on their collars
  }
  radioPair(P, 0.38, -0.58, 3520, 0.42);                                       // pots on the cast rear slope
  P.decal('turret', 'number', 'Y-224', 0.17, [0.60, 0.32, 0.05], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 2.02);
}

function buildMarder1A3(P: AfvBuilderPort): void {
  // §5.302 reverted hull: the Bradley donor supplies the Marder's defining
  // six-station, tall troop-compartment hull and rear ramp more faithfully
  // than the shallower BMP family. Only the native running gear and hull are
  // retained; the preserved §5.269 cast turret replaces the donor's.
  buildBradley(P);
  addMarderCastTurret(P);
  // The A3's horizontal appliqué rails are passive armor, not invented ERA.
  sideArmorCourse(P, { x: 1.68, y: 1.22, h: 0.42, d: 0.72, count: 8,
    front: 2.42, step: 0.74, cap: false });
  for (const side of [-1, 1]) for (let row = 0; row < 3; row++) {
    P.add('hullDetail', KIT.box(0.032, 0.045, 5.25), side * 1.72,
      1.02 + row * 0.18, -0.18);
  }
  bowLightPair(P, 1.16, 1.48, 2.86, 3530);
  // §5.349 RESIDUE (§B2 sweep handoff marder(b)): the donor under-bow window
  // ([y 0.50..0.63, z 2.84..3.08] live read — the shared m2a2/m3a3/ua 200px
  // class) closed with the SAME §5.341 bow-corner grammar
  // bradleyFlankDressing lands on the other three Bradleys (side plate on
  // the 1.40..1.44 plane, §B4-clear of the 1.395 shoe reach with the raised
  // idler disc §B9-readable; transverse cap sealing into the bow corner
  // slabs), authored marder-locally so the hard-gated splice takes none of
  // the dressing's other content.
  for (const s of [-1, 1]) {
    const m = (x: number): number => s * x;
    // FSP-05 (2026-09-25): same reversed right-hand copy as the shared Bradley
    // grammar — orientedSlab re-orders it, the left plate stays byte-identical.
    P.add('hull', orientedSlab(
      [m(1.40), 0.55, 2.80], [m(1.44), 0.55, 2.80], [m(1.44), 0.55, 3.14], [m(1.40), 0.55, 3.14],
      [m(1.40), 1.17, 2.80], [m(1.44), 1.17, 2.80], [m(1.44), 1.02, 3.14], [m(1.40), 1.02, 3.14]));
    P.add('hull', orientedSlab(
      [m(1.06), 0.55, 3.10], [m(1.44), 0.55, 3.10], [m(1.44), 0.55, 3.16], [m(1.06), 0.55, 3.16],
      [m(1.06), 1.00, 3.10], [m(1.44), 1.00, 3.10], [m(1.44), 1.00, 3.16], [m(1.06), 1.00, 3.16]));
  }
}

// ========================= M3A3 Bradley CFV =================================
// §5.306 OWNER ORDER (verbatim): "revert our m3a3 bradley CFV except add the
// extra equipment we added and detailing and armor". 269 (owner 2026-11-05: "redesign the m3a3 bradley turret"): the
// turret is the A3's (profiles/bradleyA3Turret.ts), the family's measured A2 shell, M242 and stowed TOW launcher with the
// A3's IBAS head, Commander's Independent Viewer, side-by-side hatches, deep bustle rack and BRAT tiles; it replaced the
// 268 scout shell squashed to 0.80 of its height (roof 0.59 m over the ring, the low-poly and Ukrainian A3 sources and
// the A2 source stand theirs 0.70-0.77 m) and its lowered M242 on the compact M3 shield. The hull keeps its glacis
// field, side courses and spaced side armour.
function addM3A3Turret(P: AfvBuilderPort): void {
  buildBradleyA3Turret(P);
  // Destructible BRAT tiles (eraCluster takes turret-frame x, hull-frame y and z when turret-local).
  const [, pivotY, pivotZ] = P.spec.armor.turretPivot;
  const hullFrame = (put: EraPut): EraPut => (x, y, z, ...rest) => put(x, y + pivotY, z + pivotZ, ...rest);
  for (const side of [-1, 1]) {
    P.eraCluster(`m3a3_turret_cheek_${side > 0 ? 'R' : 'L'}`, (put: EraPut) => {
      placeBradleyA3CheekEra(side, hullFrame(put));
    }, true);
    P.eraCluster(`m3a3_turret_side_${side > 0 ? 'R' : 'L'}`, (put: EraPut) => {
      placeBradleyA3SideEra(side, hullFrame(put));
    }, true);
  }
  // Retain the full-length A3 spaced side armor as the cassette backing.
  sideArmorCourse(P, { x: 1.73, y: 1.43, h: 0.58, d: 0.62, count: 8,
    front: 2.42, step: 0.71 });
}

function buildM3A3(P: AfvBuilderPort): void {
  buildBradley(P);
  addM3A3Turret(P);
  // Backed upper-glacis ERA field on the shared Bradley glacis plane (modern3.ts BRADLEY_GLACIS: the source's glacis
  // from the deck break at z 1.70 down to its toe at 2.70). The carrier uses local Z as its tangent, each cassette
  // local Z as its outward normal. 268: the field sits between the deck break and the folded trim vane (its rear edge
  // z 2.32), its columns inside the deck crown's ±0.85 where the roof falls to the side gutters.
  const glacisAngleRad = BRADLEY_GLACIS.angleRad;
  const carrierRotationXRad = glacisAngleRad;
  const cassetteRotationXRad = glacisAngleRad - Math.PI / 2;
  const fieldZ = 2.00;
  const surfaceCenter = Object.freeze({ y: BRADLEY_GLACIS.yAt(fieldZ), z: fieldZ });
  const tangentRearward = Object.freeze({ y: Math.sin(glacisAngleRad), z: -Math.cos(glacisAngleRad) });
  const normalOutward = BRADLEY_GLACIS.normalOutward;
  const carrier = Object.freeze({ widthM: 1.70, thicknessM: 0.055, lengthM: 0.70 });
  const carrierCenterOffsetM = 0.006;
  const cassetteDepthM = 0.07 * 1.25;
  const cassetteSeatOverlapM = 0.006;
  const cassetteCenterOffsetM = carrierCenterOffsetM + carrier.thicknessM / 2
    + cassetteDepthM / 2 - cassetteSeatOverlapM;
  const carrierCenter = Object.freeze({
    y: surfaceCenter.y + normalOutward.y * carrierCenterOffsetM,
    z: surfaceCenter.z + normalOutward.z * carrierCenterOffsetM,
  });
  P.add('hullDark', KIT.box(carrier.widthM, carrier.thicknessM, carrier.lengthM),
    0, carrierCenter.y, carrierCenter.z, carrierRotationXRad, 0, 0);
  const cassetteCenters: Array<Readonly<{ x: number; y: number; z: number }>> = [];
  for (const side of [-1, 1]) {
    P.eraCluster(`m3a3_glacis_${side > 0 ? 'R' : 'L'}`, (put: EraPut) => {
      for (let row = 0; row < 3; row++) for (let c = 0; c < 2; c++) {
        const along = -0.25 + row * 0.25;
        const x = side * (0.22 + c * 0.42);
        const y = surfaceCenter.y + along * tangentRearward.y
          + cassetteCenterOffsetM * normalOutward.y;
        const z = surfaceCenter.z + along * tangentRearward.z
          + cassetteCenterOffsetM * normalOutward.z;
        cassetteCenters.push(Object.freeze({ x, y, z }));
        put(x, y, z, cassetteRotationXRad, 0, 0,
          1.43, 1.12, 1.25);
      }
    });
  }
  P.hullG.userData.bradleyUpperGlacisArmorReceipt = Object.freeze({
    revision: 'flush-glacis-carrier-and-era-r2',
    surfaceCenter,
    angleRad: glacisAngleRad,
    tangentRearward,
    normalOutward,
    carrier: Object.freeze({
      ...carrier,
      center: carrierCenter,
      rotationXRad: carrierRotationXRad,
      centerOffsetM: carrierCenterOffsetM,
    }),
    cassettes: Object.freeze({
      count: cassetteCenters.length,
      centers: Object.freeze(cassetteCenters),
      rotationXRad: cassetteRotationXRad,
      depthM: cassetteDepthM,
      centerOffsetM: cassetteCenterOffsetM,
      seatOverlapM: cassetteSeatOverlapM,
    }),
  });

  // Two full side ERA courses seated directly on the existing spaced-armor
  // panels. They are the only new flank layer: the smart track, road wheels,
  // skirt hangers and underlying armor remain unchanged.
  for (const side of [-1, 1]) {
    P.eraCluster(`m3a3_side_${side > 0 ? 'R' : 'L'}`, (put: EraPut) => {
      for (let row = 0; row < 2; row++) for (let c = 0; c < 8; c++) {
        put(side * 1.77, 1.30 + row * 0.22, 2.39 - c * 0.70,
          0, side * Math.PI / 2, 0, 2.10, 1.42, 1.12);
      }
    });
    // (268: the old front-fender bridge plate is gone — the shared shell's side-armour box and glacis shoulder close
    // the camber-to-shoulder slot it covered.)
  }
  // OWNER SKIRT ORDER (2026-08-17, "make m3a3 bradley sideskirts symmetric
  // and properly attached") — promoted by the follow-up BRADLEY order into
  // the SHARED dressing (modern3.ts bradleyFlankDressing): symmetric 8-panel
  // course over the donor's print-asymmetric flanks (the m2a2-guard lattice
  // itself stays untouched in buildBradley), hinge seams + hanger blocks,
  // mounting aprons closing the skirt-top daylight, and the §B2 donor
  // bow-corner closure. CFV blank flanks hold (§5.286): no port holes.
  bradleyFlankDressing(P);                                        // (269: the A2 shell's seat, as the M2A2's)
  // (268: the old engine-raise cap that closed a deck-to-cradle slit is gone: the shared hull's engine-deck raise now
  // stands on the source's deck on the right, −X, and leaves no slit)
  // 268: the glacis ERA field covers the shared spare-link course's station, so the CFV racks a short run on the nose
  // shelf instead (1.40, z 2.84..3.18), beyond the muzzle's reach
  mount(P, 'hull', FITTINGS.spareTrackLinks({ mats: P.mats, links: 2, width: 0.48, seed: 3622 }),
    0.42, BRADLEY_HULL.noseY + 0.03, 3.00);
}

// =============================== BMP-3 (ground-up) ==========================
// §5.248 NEW ID — built against the fully semantic bmp3_rok_42manako print
// (docs/references/vertex/bmp3.json). The print reads +3.3% long in the
// width-anchored frame; all longitudinal lines below are the print's own,
// mapped x0.9684 into the PUBLISHED 7.14 envelope (pub-dims sovereignty).
// Identity: low boat hull, three bow hatches (driver center), REAR engine
// deck with twin long troop hatches, raised mid-deck collar strip, stowed
// trim-vane roll on the nose, six small wheels + FRONT idler + REAR drive
// sprocket (rear transmission), full-length sponson band, low two-man
// turret with the 100 mm 2A70 + 30 mm 2A72 + PKT triple plant, commander
// sight tower on the roof rear-left.
function addBmp3WaveBreakerRibs(P: AfvBuilderPort): void {
  for (let index = 0; index < 4; index++) {
    P.add('hullDetail', KIT.box(1.90, 0.024, 0.06),
      0, 1.755 - index * 0.026, 2.46 + index * 0.20, -0.16, 0, 0);
  }
}

// 267: split into its hull and its turret (same calls, same order: bmp3 is byte-identical) so the ROK variant can
// draw the BMP-3 hull under its own turret.
function buildBMP3(P: AfvBuilderPort): void {
  buildBMP3Hull(P);
  buildBmp3WeldedTurret(P, 'bmp3');
}

function buildBMP3Hull(P: AfvBuilderPort): void {
  const { box, cylX, cylY, cylZ, frustum, xform, torus,
    buildRunningGear, periscope, shovelTool, stowage } = KIT;
  const { rng } = P;
  // ---- hull core (print lines x0.9684): tub floor 0.29, deck 1.80-1.84,
  // raised mid strip 1.95, fender band to +-1.615 ---------------------------
  // Round 268b (the owner: "fix the rectaunglar prisms in teh bmp 3 hulls that look like jutting out from bottom"): the
  // tub's square front-bottom corner stood 0.30 m off the ground out to z 3.00, under the rising track and ahead of the
  // first wheel. The tub now ends at the first wheel's station and the lower bow plate rises from the belly to the nose
  // (its underside on prow plane A's inner face), as the real hull's does.
  P.add('hull', box(2.16, 0.92, 5.28), 0, 0.76, -0.56);                        // tub y 0.30..1.22, z -3.20..2.08
  P.add('hull', orientedSlab(                                                   // lower bow plate wedge
    [-1.08, 0.335, 2.08], [1.08, 0.335, 2.08], [1.08, 0.876, 3.00], [-1.08, 0.876, 3.00],
    [-1.08, 1.22, 2.08], [1.08, 1.22, 2.08], [1.08, 1.22, 3.00], [-1.08, 1.22, 3.00]));
  P.add('hull', box(3.00, 0.51, 5.42), 0, 1.545, -0.55);                       // upper body y 1.29..1.80 (SS-B4)
  P.add('hull', box(2.90, 0.05, 5.30), 0, 1.815, -0.57);                       // roof plate, top 1.84
  // (release 240, the owner: "make sure all tank turrets are clear of hulls": the strip starts at -1.05, outside the sweep
  // of the turret's floor (1.91, 1.04-1.23 m off the ring's axis), which sat 4.5 cm in its fore end at rest)
  P.add('hull', box(1.90, 0.11, 0.875), 0, 1.895, -1.4875);                    // raised mid strip, top 1.95
                                                                                //   (print 1.956 band z -1.93..-0.55)
  P.add('hull', box(1.20, 0.045, 1.60), 0, 1.86, 0.90);                        // fore-deck crown 1.89-1.91 band (release 240: top 1.8825, under the turret's 1.91 floor)
  // ---- BOW (print deck 1.74@2.28 -> 1.66@3.00, trim-vane roll band 1.80
  // over 3.06..3.28, tip 1.58; belly rises 0.30@2.05 -> 0.90@3.06 ->
  // knuckle 1.13@3.31 -> 1.51 at the tip) -----------------------------------
  P.add('hull', frustum(1.05, 3.42, 3.34, 1.30, 3.00, 2.90, 1.52, 1.66));      // VANE PLANE (lower rake, §5.269:
                                                                                //   the bow is TWO raked planes,
                                                                                //   not a flat deck + vertical tip)
  P.add('hull', frustum(1.30, 3.00, 2.90, 1.45, 2.34, 2.26, 1.66, 1.80));      // upper glacis plane to the deck
  P.add('hull', frustum(1.02, 2.12, 2.02, 1.05, 3.12, 3.04, 0.30, 0.90));      // prow plane A (boat run)
  P.add('hull', frustum(1.04, 3.12, 3.04, 1.06, 3.38, 3.30, 0.90, 1.14));      // prow plane B (knuckle)
  P.add('hull', orientedSlab(                                                   // RAKED nose lip (25 deg back —
    [-1.05, 1.10, 3.50], [1.05, 1.10, 3.50], [1.05, 1.10, 3.57], [-1.05, 1.10, 3.57], // §5.269: no vertical slab
    [-1.05, 1.52, 3.34], [1.05, 1.52, 3.34], [1.05, 1.52, 3.42], [-1.05, 1.52, 3.42])); // face; the 0.42 tip band
                                                                                //   still anchors hullLengthM 7.14)
  P.add('hull', box(1.96, 0.06, 0.52), 0, 0.44, 2.02);                         // bow belly pan (§B2 closure)
  for (const s of [-1, 1]) {                                                   // §B2 bow flank closure plates
    const m = (x: number): number => (s < 0 ? -x : x);
    P.add('hull', orientedSlab(
      [m(0.94), 0.40, 2.10], [m(1.00), 0.40, 2.10], [m(1.00), 0.92, 3.06], [m(0.94), 0.92, 3.06],
      [m(0.94), 1.58, 2.36], [m(1.00), 1.58, 2.36], [m(1.00), 1.30, 3.06], [m(0.94), 1.30, 3.06]));
    // §5.303 GAP CLOSURE (owner: "huge gap you can see through the side
    // through upper glacis"): the glacis/vane wings ran full width while the
    // closure plates stopped at x 1.00 — side rays passed clean through the
    // y 1.35..1.66 corridor over z 2.2..3.4 and lit the FAR side's inner
    // faces (the screenshot's phantom bracket = the far closure plate seen
    // through the void). REAL bow flank cheeks close it: wedge A under the
    // upper-glacis wing (bottom 1.38 — the pad envelope reads y<=1.345 at
    // the idler wrap apex, §B4 +3.5 cm), wedge B under the vane foot
    // tapering to the nose-lip corner, and the fender nose run + taper
    // carrying the band line to the bow (outboard of the 1.535 pad plane
    // like the band bins themselves).
    P.add('hull', orientedSlab(                                                // cheek wedge A (glacis wing return)
      [m(1.02), 1.38, 2.10], [m(1.48), 1.38, 2.10], [m(1.315), 1.38, 2.95], [m(1.02), 1.38, 2.95],
      [m(1.02), 1.79, 2.28], [m(1.44), 1.79, 2.28], [m(1.30), 1.645, 2.95], [m(1.02), 1.645, 2.95]));
    P.add('hull', orientedSlab(                                                // cheek wedge B (vane-foot cheek)
      [m(1.02), 1.36, 2.90], [m(1.315), 1.36, 2.90], [m(1.05), 1.12, 3.46], [m(1.02), 1.12, 3.46],
      [m(1.02), 1.65, 2.90], [m(1.30), 1.65, 2.90], [m(1.05), 1.54, 3.40], [m(1.02), 1.54, 3.40]));
    P.add('hull', box(0.07, 0.33, 0.26), m(1.58), 1.165, 3.19);                // fender nose run (band section
                                                                                //   continued past the bin course)
    P.add('hull', orientedSlab(                                                // fender nose taper to the lip —
      [m(1.05), 1.00, 3.50], [m(1.60), 1.00, 3.32], [m(1.60), 1.00, 3.21], [m(1.05), 1.00, 3.21], //   rear edge 3.21 stays aft of
      [m(1.05), 1.33, 3.50], [m(1.60), 1.33, 3.32], [m(1.60), 1.33, 3.21], [m(1.05), 1.33, 3.21])); // the 3.202 pad front (§B4)
    // §5.303 bow armament: TWO 7.62 PKT bow MGs — ball mounts buried in the
    // upper-glacis corners beside the flank hatches, tubes proud (the real
    // BMP-3's signature corner MGs).
    P.add('hull', nonUniformXform(KIT.sph(0.085, 12), 0, 0, 0, 0, 0, 0, [1, 0.85, 1]), m(0.88), 1.735, 2.52);
    P.add('hullDark', KIT.cylZ(0.020, 0.34, 8), m(0.88), 1.760, 2.70);         // PKT tube
    P.add('hullDark', KIT.cylZ(0.026, 0.06, 8), m(0.88), 1.760, 2.885);        // muzzle boss
    muzzleTipDot(P, m(0.88), 1.760, 2.918, 0.008, { parent: 'hullG' });
    P.add('hull', box(0.42, 0.34, 0.05), m(1.23), 1.19, 3.215);                // bow-slot web (kills the last
                                                                                //   y 1.0..1.22 sliver between pad
                                                                                //   front 3.202 and the taper rear;
                                                                                //   x-band clear of the pads at
                                                                                //   these heights, §B4)
  }
  P.add('hullDetail', xform(cylX(0.085, 2.05, 12), 0, 0, 0), 0, 1.665, 3.06);  // stowed trim-vane roll ON the
                                                                                //   vane-plane break line
  addBmp3WaveBreakerRibs(P);
  // three bow hatches: driver CENTER (print hatch.001 z 1.60..2.12) + flanks
  P.add('hull', cylY(0.24, 0.24, 0.025, 16), -0.04, 1.852, 1.86);
  P.add('hullDark', torus(0.24, 0.010, 18), -0.04, 1.868, 1.86);
  for (let k = 0; k < 3; k++) periscope(P, 'hullDetail', -0.25 + k * 0.21, 1.845, 2.16, (k - 1) * -0.10);
  for (const s of [-1, 1]) {
    P.add('hull', cylY(0.20, 0.20, 0.025, 14), s * 0.72, 1.80, 2.06);          // flank crew hatches on the glacis
    P.add('hullDark', torus(0.20, 0.010, 16), s * 0.72, 1.816, 2.06);          //   shoulder
  }
  // ---- STERN (print: rear plate 0.66..1.65 near-vertical at -3.50..-3.57,
  // deck step 1.73 over -3.46..-3.30, engine deck 1.84, twin long troop
  // hatches z -3.38..-1.52, belly ledge 0.35@-3.12 -> 0.66@-3.53) -----------
  P.add('hull', box(2.10, 0.99, 0.14), 0, 1.155, -3.50);                       // rear plate y 0.66..1.65 (between
  P.add('hull', box(2.62, 0.35, 0.14), 0, 1.475, -3.50);                       //   tracks below 1.30; full width
                                                                                //   above the sprocket wrap, §B4)
  P.add('hull', box(2.10, 0.99, 0.32), 0, 1.155, -3.29);                       // stern body block BETWEEN the
  P.add('hull', box(2.62, 0.39, 0.32), 0, 1.455, -3.29);                       //   tracks + full-width band ABOVE
                                                                                //   the sprocket wrap (r3: the band
                                                                                //   z -3.26..-3.43 was a §B2 void —
                                                                                //   run-2 side worst -3.38/-3.28;
                                                                                //   §B4 keeps x>1.05 clear of the
                                                                                //   wrap below y 1.26)
  // sealed check 2026-09-13: front/rear z were given rear-first, which winds the
  // rings the wrong way and turns both stern pieces inside-out (culled faces let
  // the camera look into the hull from behind). Same shapes, outward faces.
  P.add('hull', frustum(1.28, -3.30, -3.44, 1.31, -3.46, -3.57, 1.65, 1.73));  // stern deck step to 1.73
  P.add('hull', box(2.56, 0.09, 0.55), 0, 1.60, -3.02);                        // engine deck shoulder band
  P.add('hull', frustum(1.02, -3.06, -3.18, 1.02, -3.43, -3.53, 0.35, 0.66));  // stern underside rise — capped
                                                                                //   BETWEEN the tracks (§B4: the
                                                                                //   1.28 rear taper sat in the
                                                                                //   sprocket wrap, 35 vox)
  for (const s of [-1, 1]) {                                                   // twin long troop hatches (print
    P.add('hull', box(0.62, 0.055, 1.80), s * 0.38, 1.855, -2.45);             //   hatch9b/8b band, top 1.79-1.88)
    P.add('hullDark', box(0.56, 0.014, 1.72), s * 0.38, 1.888, -2.45);
    P.add('hullDetail', box(0.06, 0.03, 0.09), s * 0.70, 1.86, -2.05);         // hinges
    P.add('hullDark', box(0.55, 0.60, 0.035), s * 0.40, 1.32, -3.575);         // rear door recesses on the plate
    P.add('hullDetail', box(0.035, 0.56, 0.04), s * 0.70, 1.32, -3.570);       // hinge lines (§5.269 relief)
    P.add('hullDetail', box(0.035, 0.56, 0.04), s * 0.12, 1.32, -3.570);
    P.add('hullDetail', box(0.10, 0.05, 0.04), s * 0.40, 1.10, -3.578);        // steps
    P.add('hull', nonUniformXform(cylX(0.10, 0.30, 12), 0, 0, 0, 0, 0, 0, [1, 0.62, 1]), s * 0.62, 0.82, -3.545); // waterjet
    P.add('hullDark', cylX(0.07, 0.045, 12), s * 0.62, 0.82, -3.568);          //   outlet covers (§5.269)
    // §5.303 waterjet depth: proud cover rim ring + recessed dark bore — the
    // flat disc read paper-thin at garage angles. (z-axis rings: the first
    // cut used cylX discs whose radius bled 5 cm past the -3.645 stern plane
    // and pushed measured overallLengthM 7.14 -> 7.25 — gate receipt.)
    P.add('hullDetail', nonUniformXform(cylZ(0.115, 0.022, 14, 0.098), 0, 0, 0, 0, 0, 0, [1, 0.62, 1]), s * 0.62, 0.82, -3.575);
    P.add('hullDark', nonUniformXform(cylZ(0.050, 0.03, 10), 0, 0, 0, 0, 0, 0, [1, 0.62, 1]), s * 0.62, 0.82, -3.582);
    P.add('hullDark', box(0.14, 0.07, 0.03), s * 0.98, 1.52, -3.568);          // taillight boxes
    P.add('hullDetail', box(0.17, 0.022, 0.06), s * 0.98, 1.572, -3.575);      // §5.303 taillight guard lips
  }
  P.add('hullDark', box(1.34, 0.26, 0.02), 0, 1.50, -3.560);                   // stern grille band over the doors
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(1.28, 0.022, 0.045), 0, 1.42 + k * 0.08, -3.566); // (§5.269)
  // §5.303 grille depth: proud frame posts + deeper louvre bars so the band
  // stops reading as a decal.
  for (const s of [-1, 0, 1]) P.add('hullDetail', box(0.045, 0.27, 0.055), s * 0.62, 1.50, -3.572);
  for (let k = 0; k < 2; k++) P.add('hullDark', box(1.24, 0.020, 0.06), 0, 1.46 + k * 0.08, -3.574);
  P.add('hullDark', box(0.72, 0.02, 0.95), 0.62, 1.845, -1.15);                // exhaust louvre field (rear-left
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.64, 0.024, 0.055), 0.62, 1.854, -0.85 - k * 0.20); // of the raised strip)
  // ---- §B9 GEAR-VISIBILITY (§5.269 fix round): the round-1 full-height
  // flank wall was an AABB misread of the print's hull object — the critic
  // gear sheet (shots/critic-ifv/bmp3/close-wheels-left.png) shows ALL SIX
  // wheels + idler + sprocket EXPOSED under a ~1.05 sponson overhang, open
  // bays behind them (the tub side is the bay back wall). Only the shallow
  // sponson/fender band survives above the wheel line.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 14; i++) {                                             // shallow band bins y 1.00..1.33
      P.add('hull', box(0.07, 0.33, 0.46), s * 1.58, 1.165, 2.85 - i * 0.46);  //   (§C sub-slab-pitch end caps;
    }                                                                          //   inner face 1.525 clears the
                                                                               //   1.504 shoe plane §B4)
    P.add('hull', box(0.42, 0.06, 6.40), s * 1.40, 1.355, -0.14);              // band roof over the track run
    P.add('hullDetail', box(0.09, 0.03, 0.60), s * 1.56, 1.34, 2.40);          // band step rails
    P.add('hullDetail', box(0.09, 0.03, 0.60), s * 1.56, 1.34, -2.60);
    // 267 round 2 (both critics: the bow flaps "hang below ... and look detached", most visibly ahead of the front
    // idler): the band's own painted fender ends curve down over the front idler and the rear sprocket, lofted inside
    // the band faces (x 1.55..1.61, outboard of the 1.504 shoe plane) and buried in the band bins and the nose run. The
    // bow flaps are gone; the rear rubber flaps stay (the BMP-3 carries them) and now hang flush from the rear end's
    // flat 0.88 underside instead of from air.
    for (const end of [
      [[-3.47, 1.05], [-3.45, 0.88], [-3.15, 0.88], [-3.02, 0.95], [-2.88, 1.01]],
      [[2.78, 1.01], [2.92, 0.95], [3.05, 0.88], [3.14, 0.88], [3.20, 1.00], [3.24, 1.16]],
    ] as Array<Array<[number, number]>>) {
      P.add('hull', sectionSolid(end.map(([z, bottom]) => {
        const ring: SectionPoint[] = [[1.55, bottom], [1.61, bottom], [1.61, 1.30], [1.55, 1.30]];
        return { z, ring: s > 0 ? ring : ring.slice().reverse().map(([x, y]) => [-x, y] as SectionPoint) };
      })));
    }
  }
  // Round 268b: the plain rubber boxes that hung 16 cm under the rear fender ends (the stern's "jutting prisms") are the
  // stern water-jet outlet flaps, now shaped and hung flush under the fender ends (profiles/bmp3Family.ts); the glacis
  // headlights move into their hoop guards there (addBmp3HullDetail).
  addBmp3SternWaterJetFlaps(P);
  shovelTool(P, -1.56, 1.40, 0.80, 0.9);
  stowage(P, 'hullCloth', rng, [[1.50, 1.41, -1.60, 0.20, 0.08, 0.66]]);      // inside the width datum (r6)
  // §5.303 equipment: rear-deck stowage bins flanking the troop hatches
  // (lid seams + lashing straps), stowed snorkel tube on the center strip
  // with clamp blocks, and bow tow shackles on the prow knuckle.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.13, 0.85), s * 1.06, 1.875, -2.40);
    P.add('hullDark', box(0.45, 0.02, 0.78), s * 1.06, 1.945, -2.40);
    for (const dz of [-0.25, 0.25]) {
      P.add('hullDetail', box(0.52, 0.035, 0.045), s * 1.06, 1.90, -2.40 + dz);
    }
    P.add('hullDetail', box(0.07, 0.05, 0.13), s * 0.55, 0.97, 3.13);          // shackle clevis seats
    P.add('hullDark', cylX(0.022, 0.10, 8), s * 0.55, 0.95, 3.185);            // shackle pins
  }
  P.add('hullDark', cylZ(0.055, 0.90, 10), 0, 1.878, -2.40);                   // stowed snorkel tube
  P.add('hullDetail', cylZ(0.062, 0.035, 10), 0, 1.878, -2.88);                // tube collar
  for (const zc of [-2.72, -2.08]) P.add('hullDetail', box(0.13, 0.05, 0.06), 0, 1.858, zc); // clamp blocks
  // §5.303 side-band relief: full-length rib rail on the slabby bin band
  // (outer face inside the 1.615 width datum) + idler hub cap rings (the
  // plain idler face debt; smooth ring = rotation-invariant over the
  // spinning wheel).
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.018, 0.05, 5.90), s * 1.6055, 1.245, -0.14);
    P.add('hullDetail', xform(cylX(0.075, 0.035, 12, 0.06), 0, 0, 0), s * 1.445, 0.88, 2.73);
  }
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.30, pitch: 0.14, seed: 9 });
    // round 268b: the seat pass never kept the links on the band roof (they cut 7 cm into the upper side; its recorded
    // answer stood them on the right flank wall at z -1.915, over the exhaust slot, profiles/bmp3Family.ts). They are
    // authored on that wall seat, carried forward of the slot.
    links.position.set(-1.5405, 1.623, -0.95);                                 // inside the 1.615 width datum
    links.rotation.set(0, 0, Math.PI / 2);
    P.hullG.add(links);                                                        //   (r6 WIDTH GUARD: at -1.56 the
                                                                               //   0.30-wide fitting reached -1.71
                                                                               //   and the harness shrank the
                                                                               //   whole build x0.944 — the static
                                                                               //   6.85/2.53 dims reads)
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, seed: 4,
      pts: [[-0.85, 1.86, -2.90], [-0.10, 1.75, -3.20], [0.75, 1.86, -2.95]],
    });
    P.hullG.add(cable);
  }
  P.add('hullDark', cylY(0.03, 0.04, 0.05, 10), -1.30, 1.865, -1.90);          // antenna base pot
  P.add('hullDark', cylY(0.018, 0.018, 0.03, 8), -1.30, 1.905, -1.90);
  P.decal('hull', 'number', '331', 0.26, [-1.617, 1.10, 0.90], -Math.PI / 2);
  P.decal('hull', 'soot', null, 0.55, [0.90, 1.60, -3.585], Math.PI);
  addBmp3HullDetail(P);
  closeBmp3SternPockets(P);
  // ---- running gear (print x0.9684): 6 wheels r 0.30, FRONT idler raised,
  // REAR drive sprocket (rear engine), track band top 1.20 ------------------
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.30, wheelW: 0.17, wheelY: 0.37, xc: 1.32, dishR: 0.80,
    wheelZs: [1.79, 1.04, 0.055, -0.62, -1.315, -2.15],
    sprocket: { z: -2.98, y: 0.72, r: 0.35 }, idler: { z: 2.73, y: 0.88, r: 0.29 },
    rollers: [[1.30, 1.02], [-0.10, 1.02], [-1.50, 1.02]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.38, topY: 1.18, arms: true, paintedEnds: true,
    contactZF: 1.79, contactZR: -2.15,
  });
  P.topY = 1.00;
}

// ================================ Upiór (ground-up) ==========================
// §5.248 NEW ID — FICTIONAL Polish concept: THE PRINT IS THE DESIGN
// (upior_killcapturedestroy, docs/references/vertex/upior.json). Dims are
// PRINT-PROPORTIONAL at the banked 3.00 width anchor (§5.249 default) — the
// extract frame IS the authoring frame (no mapping). Identity: compact
// faceted stealth hull (crowned roof chamfers, wedge bow converging to a
// mid-height nose edge, cut plan corners), full-width skirt flanks over
// narrow-gauge tracks, BMP-2-class faceted turret rear-of-mid with a thin
// 30 mm, and the tall LEFT sensor tower behind the ring (crown 2.55).
function buildUpior(P: AfvBuilderPort): void {
  const { box, cylX, cylY, frustum, slab, xform, torus,
    buildRunningGear, periscope, stowage } = KIT;
  const { rng } = P;
  // OWNER FLIP ORDER (2026-08-17, "the upior ifv's hull is backwards"): the
  // §5.269 "native-frame rebuild" was itself the mirrored read — pixel
  // receipts shots/upior-flip/before/: the PRINT's +z end is the SHACKLED
  // CONVERGING PROW WEDGE (D-shackles on the mid-height bow beam, headlight
  // pods, raked glacis) and its -z end is the twin-door/coiled-cable stern;
  // the §5.269 build had those end SHELLS swapped (flat plated face at +z,
  // wedge wearing the doors at -z) and read backwards in the garage. All
  // hull shell stations below are the TRUE lines (+z = wedge bow), the
  // content law (§5.279/§5.286) furniture rides its lawful end, and the
  // turret re-seats rear-of-mid at z -0.74 (print ring station).
  // ---- faceted hull core: deck crown 1.60 falling to 1.43 at the flanks --
  P.add('hull', box(1.44, 0.54, 4.10), 0, 0.55, -0.05);                        // tub y 0.28..0.82 (SS-B4: track
                                                                                //   pins sweep in to x 0.735)
  P.add('hull', box(1.48, 0.62, 3.85), 0, 1.12, -0.25);                        // sponson center y 0.81..1.43
  for (const sx of [-1, 1]) {
    P.add('hull', box(0.56, 0.50, 3.42), sx * 1.02, 1.18, -0.10);              // outboard sponsons y 0.93..1.43
                                                                                //   (ends clear of both wraps)
  }                                                                            //   (§B4: the 0.85 shoe top run)
  P.add('hull', orientedSlab(                                                   // crowned roof facet LEFT
    [-1.30, 1.43, 1.42], [0.0, 1.43, 1.70], [0.0, 1.43, -2.35], [-1.30, 1.43, -2.20],
    [-0.30, 1.60, 1.55], [0.0, 1.60, 1.62], [0.0, 1.60, -2.30], [-0.30, 1.60, -2.28]));
  P.add('hull', orientedSlab(                                                   // crowned roof facet RIGHT
    [0.0, 1.43, 1.70], [1.30, 1.43, 1.42], [1.30, 1.43, -2.20], [0.0, 1.43, -2.35],
    [0.0, 1.60, 1.62], [0.30, 1.60, 1.55], [0.30, 1.60, -2.28], [0.0, 1.60, -2.30]));
  // ---- SHACKLED PROW-WEDGE BOW (+z): glacis + lower rise converge on the
  // mid-height nose beam (the print's own thin nose edge) ------------------
  P.add('hull', frustum(0.92, 2.53, 2.46, 1.32, 1.75, 1.65, 0.90, 1.43));      // raked glacis up to the deck edge
  P.add('hull', frustum(0.70, 1.90, 1.80, 0.72, 2.51, 2.44, 0.10, 0.90));      // lower rise (§B4: between the
                                                                                //   tracks; the idler wrap lanes)
  P.add('hull', slab(                                                           // mid-height NOSE BEAM (thin like
    [-0.70, 0.72, 2.555], [0.70, 0.72, 2.555], [0.70, 0.72, 2.38], [-0.70, 0.72, 2.38], // the print tip — anchors
    [-0.70, 0.92, 2.555], [0.70, 0.92, 2.555], [0.70, 1.02, 2.38], [-0.70, 1.02, 2.38])); // the body read; x +-0.70
                                                                                //   clears the wrap lanes (SS-B4)
  for (const s of [-1, 1]) {
    P.add('hull', convexSlab(                                                   // bow corner facets (sealed check 2026-09-13: twisted rings → convex hull)
      [s * 1.46, 0.45, 1.85], [s * 1.155, 0.45, 2.42], [s * 1.155, 0.45, 2.22], [s * 1.46, 0.45, 2.06],
      [s * 1.46, 1.43, 1.85], [s * 1.155, 1.40, 2.34], [s * 1.155, 1.40, 2.18], [s * 1.46, 1.43, 2.04]));
    P.add('hullDark', box(0.10, 0.16, 0.05), s * 0.62, 0.82, 2.545);           // tow shackle plates ON the beam
    P.add('hullDetail', xform(torus(0.055, 0.018, 10), 0, 0, 0, Math.PI / 2, 0, 0), s * 0.62, 0.80, 2.585);
    P.add('hullDetail', box(0.16, 0.06, 0.05), s * 0.98, 1.345, 1.845, -0.98, 0, 0); // headlight pods sunk ON the
    P.add('hullGlass', markVehicleNightLens(box(0.12, 0.035, 0.02), 'headlight'), s * 0.98, 1.375, 1.865, -0.98, 0, 0); //   glacis corners (§B2: the
                                                                                //   proud seat left a 122px sky
                                                                                //   wedge under each pod)
  }
  for (let r = 0; r < 4; r++) {                                                // glacis appliqué rivet rows,
    P.add('hullDetail', box(1.66, 0.022, 0.022),                               //   pitched onto the raked face
      0, 1.01 + r * 0.12, 2.355 - r * 0.18, -0.98, 0, 0);
  }
  // ---- TALL PLATED STERN (-z): the twin-door/cable/waterjet face ----------
  P.add('hull', box(2.00, 0.61, 0.12), 0, 1.205, -2.49);                       // stern plate y 0.90..1.51
  P.add('hull', box(1.44, 0.45, 0.12), 0, 0.675, -2.49);                       // stern plate lower, BETWEEN the
  P.add('hull', frustum(0.70, -2.42, -2.52, 0.72, -2.10, -2.20, 0.25, 0.45));  //   tracks + underside rise (§B4:
                                                                                //   the sprocket wrap lanes)
  for (const s of [-1, 1]) {
    P.add('hull', convexSlab(                                                   // stern corner facets (sealed check 2026-09-13: twisted rings → convex hull)
      [s * 1.155, 0.45, -2.42], [s * 1.46, 0.45, -1.85], [s * 1.46, 0.45, -2.06], [s * 1.155, 0.45, -2.22],
      [s * 1.155, 1.47, -2.48], [s * 1.46, 1.43, -1.85], [s * 1.46, 1.43, -2.04], [s * 1.155, 1.47, -2.26]));
    // twin door leaves ON the stern plates (§5.269 relief law, flat seat)
    P.add('hullDark', box(0.40, 0.66, 0.035), s * 0.44, 1.06, -2.565);
    P.add('hullDetail', box(0.035, 0.60, 0.03), s * 0.055, 1.06, -2.567);      // center jamb pair
    P.add('hullDetail', box(0.05, 0.09, 0.045), s * 0.60, 1.02, -2.568);       // hinge blocks
    P.add('hullDark', box(0.12, 0.07, 0.04), s * 0.66, 0.56, -2.56);           // taillight boxes low
    P.add('hull', nonUniformXform(cylX(0.09, 0.26, 12), 0, 0, 0, 0, 0, 0, [1, 0.6, 1]), s * 0.50, 0.30, -2.44); // waterjet covers
    P.add('hullDark', cylX(0.065, 0.045, 12), s * 0.50, 0.30, -2.485);
  }
  P.add('hull', orientedSlab(                                                   // stern top chamfer roof->plate
    [-0.98, 1.43, -2.35], [0.98, 1.43, -2.35], [0.98, 1.47, -2.52], [-0.98, 1.47, -2.52],
    [-0.90, 1.47, -2.36], [0.90, 1.47, -2.36], [0.90, 1.51, -2.49], [-0.90, 1.51, -2.49]));
  {
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: true, seed: 6,
      pts: [[-0.55, 1.18, -2.575], [0.02, 0.92, -2.60], [0.58, 1.16, -2.575]],
    });
    P.hullG.add(cable);                                                        // coiled cable on the stern face
  }
  P.add('hullDetail', box(0.10, 0.05, 0.05), 0.34, 1.36, -2.575);              // door handle at the top edge
  // ---- deck furniture (print-true): driver at the BOW, engine hatch
  // FORWARD-RIGHT (front-engine IFV — the stern doors own the rear) --------
  P.add('hull', cylY(0.22, 0.22, 0.028, 16), -0.55, 1.60, 1.05);               // driver hatch
  P.add('hullDark', torus(0.22, 0.010, 16), -0.55, 1.618, 1.05);
  for (let k = 0; k < 2; k++) periscope(P, 'hullDetail', -0.66 + k * 0.22, 1.60, 1.32, (k - 0.5) * -0.16);
  P.addEquipment('hull', box(0.42, 0.045, 0.40), 0.10, 1.60, 1.28);            // co-driver sight box
  P.add('hullGlass', box(0.30, 0.02, 0.02), 0.10, 1.617, 1.475);
  P.add('hull', box(0.62, 0.055, 0.60), 0.62, 1.60, 0.90);                     // engine intake riser (bow-right,
  P.add('hullDark', box(0.54, 0.015, 0.52), 0.62, 1.632, 0.90);                //   the print's rounded hatch)
  for (let k = 0; k < 3; k++) P.add('hullDetail', box(0.48, 0.022, 0.05), 0.62, 1.64, 0.75 + k * 0.15);
  P.add('hull', box(1.35, 0.05, 0.72), 0, 1.575, -1.98);                       // rear deck riser over the doors
  P.add('hull', box(1.35, 0.10, 0.40), 0, 1.50, -2.14);                        // riser plinth into the crown taper
                                                                                //   (§B2: the riser flanks floated
                                                                                //   5cm over the falling crown —
                                                                                //   2x122px top-view slots)
  P.add('hullDark', box(0.56, 0.014, 0.56), 0.30, 1.607, -1.98);               // rear hatch seam
  // (§5.269 adjudicated NEGATIVE, receipts shots/ifv-fix1/
  // upior_refhull_side.png: the print's remaining tall hull-mask content is
  // TWO FLOATING BOX FRAGMENTS at the pedestal flank plus a sub-pixel bow
  // whip — matching floating junk costs floaters/stations far more than
  // the 2-3 curve columns it buys. The fragments stay the print's own
  // documented defect; the §B3 antenna minimum rides the turret whips.)
  // ---- flanks: SHALLOW sponson skirts, wheels EXPOSED (§B9) ----------------
  for (const s of [-1, 1]) {
    for (let i = 0; i < 13; i++) {
      P.add('hull', box(0.075, 0.54, 0.34), s * 1.4625, 1.14, 2.02 - i * 0.355,
        0, 0, s * 0.008);                                                      // skirt bins y 0.87..1.41 (§C
    }                                                                          //   sub-slab-pitch end caps)
    P.add('hullRubber', box(0.07, 0.22, 0.36), s * 1.38, 0.76, 2.24);          // bow flaps
    P.add('hullRubber', box(0.07, 0.24, 0.28), s * 1.38, 0.74, -2.24);         // stern flaps
    P.add('hullDetail', box(0.05, 0.05, 3.90), s * 1.36, 1.475, -0.20);        // skirt top rail
  }
  // 2026-10-19 (owner float sweep): the deck bag hung 71 mm above the sloping roof facet; it now drops onto it.
  P.snapGroup('upior-deck-bag', () => stowage(P, 'hullCloth', rng, [[0.85, 1.63, -1.60, 0.20, 0.08, 0.60]]),
    { mode: 'down', reachM: 0.10 });
  // §B2 sweep handoff upior(a) (corridor-annulus law, re-applied post-flip):
  // the full-length open sponson corridors between sponson outer face
  // (+-1.30) and skirt inner face (+-1.425) read ground-through from above
  // (y0-top 7818px pre-flip). TOP annulus plates close the corridor from
  // the sponson edge to 3.5cm short of the skirt face, contiguous 0.48m
  // segments (§C station-slice law), tucked under the 1.45 rail bottom;
  // wheel daylight below the skirt hem stays (§B9).
  for (const s of [-1, 1]) {
    for (let k = 0; k < 10; k++) {
      P.add('hull', box(0.115, 0.03, 0.46), s * 1.3575, 1.44, -2.07 + k * 0.46);
    }
    P.add('hull', box(0.115, 0.03, 0.14), s * 1.3575, 1.44, 2.37);             // flap-zone end stubs (the corner
    P.add('hull', box(0.115, 0.03, 0.14), s * 1.3575, 1.44, -2.37);            //   nubs beyond the +-2.30 run)
  }
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.28, pitch: 0.13, seed: 11 });
    links.position.set(0.62, 1.4435, 1.8030);
    links.rotation.x = 0.597;
    P.hullG.add(links);
  }
  P.decal('hull', 'number', 'W-01', 0.22, [-1.482, 0.95, 0.65], -Math.PI / 2);
  P.decal('hull', 'emblem', null, 0.26, [1.482, 0.95, 0.30], Math.PI / 2);
  // ---- running gear (print-true): 6 wheels r 0.235, raised FRONT idler +
  // REAR drive sprocket (§5.248 identity); wraps at the print's thin band --
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.285, wheelW: 0.22, wheelY: 0.33, xc: 1.06, dishR: 0.82,
    wheelZs: [1.577, 0.978, 0.345, -0.435, -1.032, -1.628],
    sprocket: { z: -2.10, y: 0.50, r: 0.21 }, idler: { z: 2.20, y: 0.58, r: 0.21 },
    rollers: [[1.28, 0.78], [0.0, 0.78], [-1.30, 0.78]].map(([z, y]) => ({ z, y, r: 0.07 })),
    trackW: 0.44, topY: 0.83, botY: 0.045, arms: true, paintedEnds: true,
    contactZF: 1.577, contactZR: -1.628,
  });
  P.topY = 0.92;
  buildUpiorUpgrade(P);
}

function addPumaOraclePackage(P: AfvBuilderPort): void {
  // Level-C reactive side modules and the high RCT30 observation cadence.
  sideArmorCourse(P, { x: 1.82, y: 1.52, h: 0.66, d: 0.70, count: 8,
    front: 2.55, step: 0.77, rz: 0.010 });
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    armorTile(P, 'hull', side * (0.28 + i * 0.32), 1.72, 2.52 - i * 0.10,
      0.29, 0.11, 0.33, [-0.27, 0, 0], false);
  }
  // §5.248 spz_puma refresh rung 1 (restored-print re-baseline): the r-wave
  // package seated these two fittings on AIR — the MG pot floated 0.18 over
  // the raked wedge roof and the whip pair stood 0.3 m BEHIND the bustle
  // rear face (the gate's floater scan flagged the whip island at every
  // pose once the §5.249 print restore re-framed the render). Both re-seat
  // on real surfaces: MG pot buried into the roof at its own z, whips onto
  // the bustle roof plate (§B5 physical-seat law). 2026-10-14 (VH.14): the Puma carries its 30 mm, the coaxial MG4 and
  // MELLS and no roof machine gun (roofWeaponPolicy.ts), so the roof MG3 pot is gone.
  radioPair(P, 0.79, -1.20, 3710, 0.55);
  // 2026-10-19 (owner float sweep): the sight stand hung 106-180 mm over the raked roof (106 mm to the MUSS head
  // beside it) and its window 19 mm off the drum; the window now sits on the drum and the whole stand drops onto
  // the roof, clear of that head.
  P.snapGroup('puma-roof-sight', () => {
    P.add('turret', KIT.box(0.28, 0.07, 0.28), 0.42, 0.90, -0.18);
    P.add('turretDetail', KIT.cylY(0.12, 0.14, 0.32, 14), 0.42, 1.09, -0.18);
    P.add('turretGlass', KIT.box(0.18, 0.12, 0.024), 0.42, 1.11, -0.042);
  }, { mode: 'down', reachM: 0.22 });
  P.topY = Math.max(P.topY || 0, 1.52);
}

function buildPumaOracle(P: AfvBuilderPort): void {
  buildPuma(P);
  // The native hull whip was authored exactly tangent to the deck. Bury its
  // collar into the supporting shoe so mask-based attachment audits see the
  // same continuous load path that is visible in the rendered vehicle.
  for (const child of P.hullG.children) {
    if (child.name === 'fitting_antennaWhip') child.position.y -= 0.04;
  }
  addPumaOraclePackage(P);
}

// =============================== BMPT T-90 ==================================
// §5.363 OWNER ORDER (verbatim): "add a bmp terminator 2 where it has an even
// crazier beefier two autocannon turret with even more equipment and
// decorations and even some era on a t90_1992 hull".
// NEW id `bmpt_t90` ("BMPT T-90", Russia, tier 10) — FALSE-0/photo-class: no
// oracle exists and none is invented; the id is never gated (the
// bmpt_terminator2/kf51b ledger-absence class).
// HULL: the certified T-90A donor (T90_PROFILES.t90a_2004 — the T72_PROFILES
// precedent import): K-5 glacis cassette courses, §5.262 six-wheel rubber
// course, guarded bow/stern light clusters, split unditching log + stern
// drums, fender kit, ruSkirtBand. This build adds the §5.350-class flank
// program on top (full-run skirt ERA panels + top strips + rubber
// fore/rear sections) with panel bottoms holding the certified 0.98 skirt
// line — §B9 wheel exposure preserved — plus twin AG-17 bow pods.
// STATION (267, lane t90-family-267): the Ob'yekt 199 "Ramka" Terminator module (profiles/bmptT90Station.ts) on
// the T-90M X hull: low octagonal base, narrow waist, the tall armoured hammerhead with the twin 2A42 high in one
// elevating casing between trunnion brackets, two long armoured Ataka boxes (2 x 2 tubes each, eight in all) on
// pivot shafts with their tops at the crown, the panoramic sight on its tall housing and the gunner's sight mast,
// with K-5 class bricks on the head's glacis and flat reactive tiles on the boxes ("even some era").
function addTerminatorT90Station(P: AfvBuilderPort): void {
  clearUpperStructure(P);
  // The T-90A donor also dresses its dome through the turretTrack /
  // turretCupola / turretHatch / turretEquipment buckets, which the shared helper leaves
  // alone (t72/bmp2/bradley donors never use them — widening the shared
  // clear would strip live donor equipment on the other residents). Clear
  // them HERE so no donor spare-track course or cupola floats around the
  // replacement station.
  P.clear('turretTrack', 'turretCupola', 'turretHatch', 'turretEquipment');
  buildTerminatorT90Station(P);
}

function buildBMPTT90(P: AfvBuilderPort): void {
  // Lane t90-family-266 (the owner 2026-10-30: "including updating the bmpt t90"; "take inspiration and update from the
  // later t90s we added that have far more accurate models"): the BMPT rides the source-X T-90M hull, running gear and
  // Relikt side protection (the 2018 BMPT's photographs: full-length ERA box skirts with slat over the rear). The X turret
  // is cleared whole, every turret- and gun-owned bucket, before the station.
  T90_X_PROFILES.t90m.build(P);
  P.clear('turretBark', 'turretCanvasPale', 'turretEquipment', 'turretFittingPaint', 'turretOpenLattice',
    'turretOpenLatticeDark', 'turretPaintedDetail', 'turretPermanentMarkingSurface', 'turretTrackLinks', 'turretWeaponSteel',
    'gunMountCanvasSkin', 'gunMountCloth', 'gunMountGlass', 'gunMountLamp');
  addTerminatorT90Station(P);
  // Twin AG-17 bow pods (hull-fixed, the real vehicle's corner stations):
  // seat buried into the bow deck, armored pod, stub tube with an explicit
  // dark mouth, drum feed lapped into the pod's inboard wall.
  for (const side of [-1, 1]) {
    P.addEquipment('hull', KIT.box(0.20, 0.10, 0.30), side * 1.28, 1.26, 2.55);
    P.addEquipment('hull', KIT.box(0.24, 0.20, 0.36), side * 1.28, 1.40, 2.53);
    P.addEquipment('hull', KIT.cylZ(0.034, 0.30, 10), side * 1.28, 1.44, 2.79);
    P.add('hullDark', KIT.cylZ(0.015, 0.022, 10), side * 1.28, 1.44, 2.945);
    P.addEquipment('hull', KIT.cylX(0.085, 0.13, 12), side * 1.10, 1.38, 2.48);
  }
}

import { buildBMPTTerminator } from './bmptTerminator.ts';
export const AFV_FAMILY_PROFILES = {
  bmp3_rok: { build: buildBMP3ROK },
  ua_m2a3_bradley: { build: buildUAM2A3 },
  bmpt_terminator2: { build: buildBMPT2 },
  bwp1: { build: buildBWP1Variant },
  marder1a3: { build: buildMarder1A3 },
  m3a3_bradley: { build: buildM3A3 },
  spz_puma: { build: buildPumaOracle },
  // §5.248 ground-up wave (print-measured, no donor geometry)
  bmp3: { build: buildBMP3 },
  upior: { build: buildUpior },
  // §5.363 owner order — Terminator on the T-90 hull (photo-class new id)
  bmpt_t90: { build: buildBMPTT90 },
  // 267: the original Ob'yekt 199 "Ramka" Terminator on the T-72 X hull (profiles/bmptTerminator.ts)
  bmpt_terminator: { build: buildBMPTTerminator },
} satisfies VehicleProfileRecord;
