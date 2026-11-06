import { sectionSolid, type SectionPoint } from './sectionSolid.ts';
import { armorLoft } from './europeSourcePrimitives.ts';
import { weaponAssembly } from './weaponStock.ts';
// Two first-party procedural Swedish IFVs of the CV90 family (round 267 rebuild).
//
// `cv90` is the modernised 40 mm Strf 9040 (the CV90 Mk III-class 40 mm vehicle with bolted modular armour);
// `cv90_mk4_concept` is a CV90 Mk IV hull carrying a modern two-man 50 mm turret with a twin missile pod, an
// active-protection kit, a panoramic commander sight and a light RWS. Reference packets (real photographs, a 1/76
// four-view drawing with its metric scale bar, published dimensions): ~/cot-lanes/ifv-modern-267-evidence/research/
// cv90/ and research/cv90_mk4_concept/. No external mesh, texture, material, node, or runtime asset is loaded.
//
// Both ids share the CV90 construction in place (the hull section loft, the modular side armour courses, the rear
// door and corner bins, the running-gear recipe); each passes its own measured dimensions. The turrets, guns and
// mission equipment are each vehicle's own. Authoring frame: metres, +Z forward, +X the vehicle's left, ground y 0;
// applyAdvancedIfvScale bakes the whole build to 90 % (the spec's combat frame is published at that scale).

import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab, convexSlab } from './kit.ts';
import {
  ADVANCED_IFV_SCALE,
  applyAdvancedIfvScale,
  type AdvancedIfvScalePort,
} from './advancedIfvScale.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { TankBuilderPort, TrackShoeBuildParameters } from '../tankFactoryCore.ts';
import { mountRotated as mount } from './fittingMount.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';
import { hatchParts, reserveDecorVolume } from './fieldChest.ts';

type Vec3 = [number, number, number];
type Owner = 'hull' | 'turret';

/** The builder surface the CV90 construction uses (the CV9040C, profiles/cv9040CSourceX.ts, builds on it too). */
export interface CvBuilderPort extends AdvancedIfvScalePort {
  readonly snapGroup: TankBuilderPort['snapGroup'];
  readonly forEachBucketPart: TankBuilderPort['forEachBucketPart'];
  readonly gunG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & {
    readonly canvasCloth: THREE.MeshStandardMaterial;
    readonly wheels?: THREE.MeshStandardMaterial;
  };
  readonly q?: boolean;
  readonly disposables: Array<{ dispose(): void }>;
  readonly geometryReceipt?: boolean;
  readonly spec: { readonly id: string; readonly visual: { readonly number?: string } };
  muzzleZ: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addHatch(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addExternalArmor(owner: Owner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addModuleVisual(module: string, slot: string, geometry: THREE.BufferGeometry,
    ...transform: number[]): void;
  decal(owner: Owner, kind: string, label: string | null, scale: number,
    position: Vec3, ...orientation: number[]): void;
}

// -------------------------------------------------------------------------
// Shared CV90 construction (both ids use these in place with their own dimensions).

/** One CV90 hull's measured stations. The belly runs between the track courses; the upper hull (sponsons) spans the
 * tracks to the full hull width; the long shallow upper glacis runs from the troop roof down to a short near-vertical
 * nose plate; the raked lower glacis meets the belly at its knee; the stern is a near-vertical door plate over a
 * short raked lower rear plate. */
interface Cv90Hull {
  readonly noseZ: number; readonly rearZ: number;
  readonly roofY: number; readonly sponY: number;
  readonly upperHalf: number; readonly bellyHalf: number; readonly bellyY: number;
  readonly glacisBreakZ: number; readonly noseTopY: number;
  readonly chinY: number; readonly kneeZ: number; readonly kneeY: number;
  readonly rearFloorY: number; readonly rearKneeZ: number; readonly bowBellyZ: number;
}

const lerp = THREE.MathUtils.lerp;

/** Height of the roof/upper glacis surface at station z. */
export function cv90RoofY(d: Cv90Hull, z: number): number {
  if (z <= d.glacisBreakZ) return d.roofY;
  const lean = d.noseZ - 0.04;
  if (z <= lean) return lerp(d.roofY, d.noseTopY, (z - d.glacisBreakZ) / (lean - d.glacisBreakZ));
  return lerp(d.noseTopY, d.noseTopY - 0.03, (z - lean) / 0.04);
}

/** Height of the belly/lower glacis surface at station z. */
function cv90FloorY(d: Cv90Hull, z: number): number {
  if (z <= d.rearKneeZ) return lerp(d.rearFloorY, d.bellyY, (z - d.rearZ) / (d.rearKneeZ - d.rearZ));
  if (z <= d.bowBellyZ) return d.bellyY;
  if (z <= d.kneeZ) return lerp(d.bellyY, d.kneeY, (z - d.bowBellyZ) / (d.kneeZ - d.bowBellyZ));
  return lerp(d.kneeY, d.chinY, (z - d.kneeZ) / (d.noseZ - d.kneeZ));
}

/** The closed welded hull: one T-section loft (belly between the tracks, sponsons over them) whose roof line carries
 * the troop roof, the glacis break, the upper glacis and the nose plate, and whose floor line carries the raked lower
 * rear plate, the belly and the lower glacis. Every station section is planar; every side panel is a welded plate. */
function cv90HullShell(d: Cv90Hull): THREE.BufferGeometry {
  const zs = [...new Set([d.rearZ, d.rearKneeZ, d.glacisBreakZ, d.bowBellyZ, d.kneeZ, d.noseZ - 0.04, d.noseZ])]
    .sort((a, b) => a - b);
  const b = d.bellyHalf, s = d.upperHalf, p = d.sponY, c = 0.035;
  const shell = sectionSolid(zs.map((z) => {
    const f = cv90FloorY(d, z), r = cv90RoofY(d, z);
    const ring: SectionPoint[] = [[-b, f], [b, f], [b, p], [s, p], [s, r - c], [s - c, r],
      [-(s - c), r], [-s, r - c], [-s, p], [-b, p]];
    return { z, ring };
  }));
  shell.userData.cv90HullRole = 'continuous-t-section-hull-v8';
  return shell;
}

/** A course of bolted modular side-armour panels on one side. Each panel is its own chamfered slab, seated 10 mm into
 * the hull side, with a 20 mm joint between neighbours; `top(z)` lets the upper course follow the glacis line. */
function cv90ArmourCourse(P: CvBuilderPort, side: -1 | 1, panels: readonly (readonly [number, number])[],
  o: { inner: number; outer: number; bottom: number; top: (z: number) => number; chamferTop: number;
    chamferBottom: number; breaks?: readonly number[]; frontRake?: number }): void {
  const front = Math.max(...panels.map(([, z1]) => z1));
  for (const [z0, z1] of panels) {
    const zs = [z0, ...(o.breaks ?? []).filter((z) => z > z0 + 0.01 && z < z1 - 0.01), z1];
    const sections = zs.map((z, i) => {
      // the front panel of a lower course rakes its leading bottom corner back over the rising track
      const bottom = o.frontRake && z1 === front && i === zs.length - 1 ? o.bottom + o.frontRake : o.bottom;
      const top = o.top(z), ct = o.chamferTop, cb = o.chamferBottom;
      const inner = side * o.inner, outer = side * o.outer, outerTop = side * (o.outer - ct);
      const outerBot = side * (o.outer - cb);
      const ring: SectionPoint[] = side > 0
        ? [[inner, bottom], [outerBot, bottom], [outer, bottom + cb], [outer, top - ct], [outerTop, top], [inner, top]]
        : [[outerBot, bottom], [inner, bottom], [inner, top], [outerTop, top], [outer, top - ct], [outer, bottom + cb]];
      return { z, ring };
    });
    P.addExternalArmor('hull', sectionSolid(sections));
  }
}

/** Fixing bolts on a course's outer face: one near each corner of every panel (inset 70 mm). */
function cv90PanelBolts(P: CvBuilderPort, side: -1 | 1, panels: readonly (readonly [number, number])[],
  outer: number, bottom: number, top: (z: number) => number, rows: 1 | 2): void {
  const bolt = KIT.box(0.012, 0.036, 0.036);
  for (const [z0, z1] of panels) for (const z of [z0 + 0.07, z1 - 0.07]) {
    const ys = rows === 2 ? [bottom + 0.07, top(z) - 0.09] : [(bottom + top(z)) / 2];
    for (const y of ys) P.add('hullDetail', bolt.clone(), side * (outer + 0.004), y, z);
  }
  bolt.dispose();
}

/** The CV90 stern: the hinged troop door with its vision block, handle and hinge knuckles, two armoured stowage bins
 * on the rear corners carrying the tail lamps, the tow pintle and hooks. */
function cv90Stern(P: CvBuilderPort, d: Cv90Hull, o: { doorHalf: number; doorBottom: number; doorTop: number;
  binInner: number; binOuter: number; binBottom: number; binTop: number; binDepth: number }): void {
  const { box, cylY, cylZ } = KIT;
  const zr = d.rearZ;
  // door leaf: 50 mm plate seated 10 mm into the rear plate, a raised frame of the door's own steel round it
  const doorH = o.doorTop - o.doorBottom, doorY = (o.doorTop + o.doorBottom) / 2;
  P.addHatch('hull', box(o.doorHalf * 2, doorH, 0.06), 0, doorY, zr - 0.02);
  for (const y of [o.doorBottom + 0.16, doorY, o.doorTop - 0.16]) {
    P.add('hullDark', cylY(0.034, 0.034, 0.13, 10), -o.doorHalf - 0.02, y, zr - 0.075);
    P.add('hullDark', box(0.10, 0.10, 0.03), -o.doorHalf + 0.03, y, zr - 0.06);
  }
  P.add('hullDark', box(0.22, 0.05, 0.05), o.doorHalf - 0.20, doorY, zr - 0.072);
  P.add('hullDark', box(0.20, 0.14, 0.02), 0.05, o.doorTop - 0.22, zr - 0.058);
  P.addModuleVisual('optics', 'hullGlass', box(0.14, 0.08, 0.012), 0.05, o.doorTop - 0.22, zr - 0.072);
  for (const side of [-1, 1]) {
    // stowage bins on the rear corners, their outer faces flush with the side armour
    const x = side * (o.binInner + o.binOuter) / 2, w = o.binOuter - o.binInner;
    const binY = (o.binBottom + o.binTop) / 2, binH = o.binTop - o.binBottom;
    P.addEquipment('hull', orientedSlab(
      [x - w / 2, o.binBottom, zr + 0.012], [x + w / 2, o.binBottom, zr + 0.012],
      [x + w / 2, o.binBottom + 0.06, zr - o.binDepth], [x - w / 2, o.binBottom + 0.06, zr - o.binDepth],
      [x - w / 2, o.binTop, zr + 0.012], [x + w / 2, o.binTop, zr + 0.012],
      [x + w / 2, o.binTop, zr - o.binDepth], [x - w / 2, o.binTop, zr - o.binDepth],
    ));
    P.add('hullDark', box(w - 0.10, 0.018, 0.02), x, binY + binH * 0.12, zr - o.binDepth - 0.004);
    P.add('hullDark', box(0.20, 0.13, 0.02), x + side * 0.02, o.binTop - 0.11, zr - o.binDepth - 0.006);
    P.addModuleVisual('optics', 'hullGlass', box(0.08, 0.075, 0.012), x + side * 0.06, o.binTop - 0.11,
      zr - o.binDepth - 0.018);
    P.addModuleVisual('optics', 'hullGlass', box(0.08, 0.075, 0.012), x - side * 0.04, o.binTop - 0.11,
      zr - o.binDepth - 0.018);
    // towing hooks under the door, on the lower rear plate's foot
    P.add('hullDark', box(0.13, 0.15, 0.06), side * 0.62, d.rearFloorY - 0.02, zr - 0.02);
    P.add('hullDark', cylZ(0.036, 0.10, 12), side * 0.62, d.rearFloorY - 0.03, zr - 0.09);
  }
  P.add('hullDark', box(0.16, 0.12, 0.05), 0, d.rearFloorY + 0.02, zr - 0.015);
  P.add('hullDark', cylY(0.032, 0.032, 0.10, 12), 0, d.rearFloorY + 0.02, zr - 0.06);
  // the decor keeps out of the door's swing and its hinges
  reserveDecorVolume(P.hullG, [-o.doorHalf - 0.12, o.doorBottom - 0.05, zr - 0.60],
    [o.doorHalf + 0.05, o.doorTop + 0.05, zr - 0.01]);
}

interface Cv90Gear {
  readonly wheelR: number; readonly wheelW: number; readonly wheelY: number; readonly xc: number;
  readonly wheelZs: number[]; readonly sprocket: { z: number; y: number; r: number };
  readonly idler: { z: number; y: number; r: number }; readonly rollerZs: readonly number[];
  readonly rollerY: number; readonly rollerR: number; readonly trackW: number; readonly trackTh: number;
  readonly linkPitchM: number; readonly topY: number; readonly contactZF: number; readonly contactZR: number;
}

/** Seven dual rubber-tyred road wheels on trailing arms, the drive sprocket high at the FRONT, the idler at the rear,
 * three small return rollers under the side armour. */
function cv90RunningGear(P: CvBuilderPort, g: Cv90Gear, shoe?: Cv90TrackShoeBuilder): void {
  P.gear = KIT.buildRunningGear(P, {
    ...(shoe ? { trackShoeBuilder: shoe } : {}),
    style: 'rubber', dishR: 0.75, wheelR: g.wheelR, wheelW: g.wheelW, wheelY: g.wheelY, xc: g.xc,
    wheelZs: g.wheelZs, sprocket: g.sprocket, idler: g.idler,
    rollers: g.rollerZs.map((z) => ({ z, y: g.rollerY })),
    rollerR: g.rollerR, trackW: g.trackW, trackTh: g.trackTh,
    trackPattern: 'compact-ifv', linkPitchM: g.linkPitchM, shoeWidthScale: 0.99,
    topY: g.topY, botY: 0.045, paintedEnds: true, arms: true, coveredTop: false,
    contactZF: g.contactZF, contactZR: g.contactZR,
  });
}

/** Headlamp clusters on the fender noses, the tow eyes and shackles on the lower glacis, the tow cable. */
function cv90Bow(P: CvBuilderPort, d: Cv90Hull, lampX: number, seed: number): void {
  const { box, torus } = KIT;
  for (const side of [-1, 1]) {
    mount(P, 'hull', FITTINGS.lightCluster({ nightKind: 'headlight',
      mats: P.mats, pods: 2, spacing: 0.12, r: 0.042, guard: false, rake: 0, seed: seed + side,
    }), side * lampX, (d.sponY + cv90RoofY(d, d.noseZ)) / 2, d.noseZ + 0.004, [0, 0, 0]);
    // tow eye on the lower glacis: a hung shackle on a welded lug (the lug is buried in the plate)
    const yEye = d.chinY - 0.20, zEye = d.kneeZ + (yEye - d.kneeY) / (d.chinY - d.kneeY) * (d.noseZ - d.kneeZ);
    P.add('hullDark', box(0.10, 0.08, 0.10), side * 0.62, yEye, zEye - 0.02);
    P.add('hullDetail', torus(0.07, 0.018, 12), side * 0.62, yEye - 0.06, zEye + 0.045, Math.PI / 2, 0, 0);
  }
}

/** A dark grille (louvre slats in a frame) laid on the upper glacis. */
function glacisGrille(P: CvBuilderPort, d: Cv90Hull, x0: number, x1: number, z0: number, z1: number,
  slats: number): void {
  const { box } = KIT;
  const tilt = Math.atan2(cv90RoofY(d, z0) - cv90RoofY(d, z1), z1 - z0);
  const zc = (z0 + z1) / 2, yc = cv90RoofY(d, zc), len = (z1 - z0) / Math.cos(tilt);
  P.add('hullDark', box(x1 - x0, 0.030, len), (x0 + x1) / 2, yc + 0.006, zc, tilt, 0, 0);
  for (let i = 0; i < slats; i++) {
    const t = (i + 0.5) / slats, z = lerp(z0, z1, t);
    P.add('hullDetail', box(x1 - x0 - 0.04, 0.026, 0.022), (x0 + x1) / 2, cv90RoofY(d, z) + 0.024, z, tilt, 0, 0);
  }
}

/** A gun-mounted solid of chamfered rectangular sections (cradle covers, rocking masks). */
export function chamferedBox(stations: readonly (readonly [z: number, half: number, bottom: number, top: number,
  chamfer: number])[]): THREE.BufferGeometry {
  return sectionSolid(stations.map(([z, h, yb, yt, c]) => ({ z, ring: [
    [-h + c, yb], [h - c, yb], [h, yb + c], [h, yt - c], [h - c, yt], [-h + c, yt], [-h, yt - c], [-h, yb + c],
  ] as SectionPoint[] })));
}

// -------------------------------------------------------------------------
// CV90 (modernised Strf 9040, 40 mm).
// Measured: the 1/76 four-view drawing's metric scale bar (314.7 px/m) and the published Strf 9040C envelope
// (6.55 m hull, 3.17 m wide without modular armour, 3.42 m with it, 2.71 m to the sight heads).

export const CV90_HULL: Cv90Hull = Object.freeze({
  noseZ: 3.28, rearZ: -3.25, roofY: 1.76, sponY: 1.07, upperHalf: 1.52, bellyHalf: 1.00, bellyY: 0.42,
  // the lower glacis is the plane through (z 2.14, y 0.24) and the nose chin (3.28, 1.00); it meets the belly at 0.345
  glacisBreakZ: 1.10, noseTopY: 1.34, chinY: 1.00, kneeZ: 2.2975, kneeY: 0.345,
  rearFloorY: 0.70, rearKneeZ: -2.85, bowBellyZ: 1.80,
});

const CV90_GEAR: Cv90Gear = Object.freeze({
  wheelR: 0.305, wheelW: 0.23, wheelY: 0.385, xc: 1.30,
  wheelZs: [2.14, 1.49, 0.84, 0.19, -0.46, -1.11, -1.76],
  sprocket: { z: 3.00, y: 0.68, r: 0.28 }, idler: { z: -2.56, y: 0.52, r: 0.26 },
  rollerZs: [1.17, -0.14, -1.44], rollerY: 0.86, rollerR: 0.065,
  trackW: 0.50, trackTh: 0.075, linkPitchM: 0.14, topY: 1.00, contactZF: 2.20, contactZR: -1.80,
});

/** The Strf 9040 hull (the CV9040C builds on it, adding its C kit). `glacisTowCable: false` leaves the tow cable off the
 * glacis (the CV9040C's applique tiles cover that run and stow it elsewhere). */
export function buildCv90Hull(P: CvBuilderPort, o: { readonly glacisTowCable?: boolean } = {}): void {
  const d = CV90_HULL, { box } = KIT;
  P.add('hull', cv90HullShell(d));
  // Modular armour: a tall upper course whose top follows the troop roof and the glacis to the nose, and a lower
  // course hung over the track run with a ledge between them (the Strf 9040's bolted panels).
  // the upper course stands 15 mm proud of the troop roof (the gun depresses over its rear corners)
  const glacisTop = (z: number): number => cv90RoofY(d, z) + 0.015;
  const upper = [[-3.22, -2.19], [-2.17, -1.15], [-1.13, -0.11], [-0.09, 0.93], [0.95, 2.04], [2.06, 3.12]] as const;
  const lower = [[-3.18, -2.03], [-2.01, -0.86], [-0.84, 0.31], [0.33, 1.48], [1.50, 2.62]] as const;
  for (const side of [-1, 1] as const) {
    cv90ArmourCourse(P, side, upper, { inner: 1.51, outer: 1.66, bottom: 1.04, top: glacisTop, chamferTop: 0.035,
      chamferBottom: 0.015, breaks: [d.glacisBreakZ] });
    cv90ArmourCourse(P, side, lower,
      { inner: 1.575, outer: 1.70, bottom: 0.74, top: () => 1.10, chamferTop: 0.012, chamferBottom: 0.04,
        frontRake: 0.16 });
    cv90PanelBolts(P, side, upper.slice(0, 5), 1.66, 1.04, glacisTop, 2);
    cv90PanelBolts(P, side, lower.slice(0, 4), 1.70, 0.78, () => 1.06, 1);
    // ledge brackets at the lower course's joints
    for (const z of [-2.02, -0.85, 0.32, 1.49]) {
      P.add('hullDetail', box(0.06, 0.07, 0.10), side * 1.70, 1.07, z);
    }
    P.addEquipment('hull', box(0.05, 0.05, 0.08), side * 1.685, 1.62, -2.70);
  }
  // Rear: door and corner bins.
  cv90Stern(P, d, { doorHalf: 0.50, doorBottom: 0.76, doorTop: 1.60, binInner: 1.00, binOuter: 1.64,
    binBottom: 1.07, binTop: 1.68, binDepth: 0.20 });
  // Roof: the two troop hatches over the rear compartment, set in the deck.
  for (const side of [-1, 1]) {
    P.addHatch('hull', box(0.64, 0.03, 1.02), side * 0.36, d.roofY + 0.008, -2.56);
    P.add('hullDark', box(0.10, 0.02, 0.12), side * 0.36, d.roofY + 0.024, -2.12);
  }
  // Driver at the front left on the glacis, three vision blocks ahead of the hatch.
  const tilt = Math.atan2(d.roofY - d.noseTopY, d.noseZ - 0.04 - d.glacisBreakZ);
  P.addHatch('hull', box(0.58, 0.05, 0.64), 0.62, cv90RoofY(d, 1.72) + 0.017, 1.72, tilt, 0, 0);
  for (const x of [0.44, 0.62, 0.80]) KIT.periscope(P, 'hullDetail', x, cv90RoofY(d, 2.12) + 0.030, 2.12);
  // Engine compartment on the right front: the access plate and the cooling grille ahead of the turret.
  P.add('hull', box(1.10, 0.03, 1.30), -0.78, cv90RoofY(d, 2.35) + 0.010, 2.35, tilt, 0, 0);
  glacisGrille(P, d, -1.30, -0.30, 1.22, 1.58, 6);
  cv90Bow(P, d, 1.26, 900);
  if (o.glacisTowCable ?? true) {
    KIT.towCable(P, [[-1.10, 1.30, 2.95], [-0.60, 1.38, 2.62], [0.10, 1.40, 2.60], [0.20, 1.36, 2.88]]);
  }
}

/** A track shoe constructor for the running gear (tankFactoryCore's `trackShoeBuilder`). */
type Cv90TrackShoeBuilder = (parameters: TrackShoeBuildParameters) => THREE.BufferGeometry;

/** The Strf 9040 running gear (the CV9040C builds on it; `trackShoe` lays the run with a shared shoe constructor). */
export function buildCv90RunningGear(P: CvBuilderPort, o: { readonly trackShoe?: Cv90TrackShoeBuilder } = {}): void {
  cv90RunningGear(P, CV90_GEAR, o.trackShoe);
}

/** The 40 mm Bofors L/70 mount: a raked rocking mask running into the turret front, the long tapered cradle cover, the finned
 * barrel jacket and the barrel with its flared flash hider. Nothing on the moving gun reaches behind the trunnion far
 * enough to meet the hull roof at full elevation. */
export function buildCv90Gun(P: CvBuilderPort): void {
  const { cylX, cylZ } = KIT;
  // rocking mask between the cheeks: its raked back runs into the turret front at every pitch, its foot stays clear
  // of the hull roof at full elevation
  const mask = convexSlab(
    [-0.25, -0.17, -0.14], [0.25, -0.17, -0.14], [0.24, -0.17, 0.24], [-0.24, -0.17, 0.24],
    [-0.25, 0.18, -0.40], [0.25, 0.18, -0.40], [0.24, 0.18, 0.24], [-0.24, 0.18, 0.24],
  );
  mask.userData.cv90GunRole = 'buried-rocking-mask';
  P.addGunExtra(mask);
  P.addGunExtra(cylX(0.10, 0.68, P.q ? 20 : 12), 0, 0, 0);
  // cradle cover: tapered, chamfered, running forward out of the gun channel
  P.addGunExtra(chamferedBox([[0.22, 0.21, -0.18, 0.19, 0.05], [0.70, 0.18, -0.15, 0.17, 0.045],
    [1.04, 0.13, -0.11, 0.12, 0.035]]));
  P.addGunExtraDark(cylZ(0.098, 0.08, P.q ? 20 : 12), 0, 0, 1.08);
  KIT.buildGun(P, { len: 3.12, r: 0.060, sleeve: false, collar: false, baseR: 0.095 });
  // finned barrel jacket ahead of the cradle and the flared flash hider (they recoil with the barrel)
  const seg = P.q ? 20 : 10;
  P.add('gun', cylZ(0.080, 0.40, seg), 0, 0, 1.32);
  for (let i = 0; i < 5; i++) P.add('gun', cylZ(0.094, 0.026, seg), 0, 0, 1.16 + i * 0.08);
  P.add('gun', cylZ(0.084, 0.17, seg, 0.062), 0, 0, 3.025);
  muzzleBore(P, { len: 3.12, r: 0.060, seg: 18 });
  P.muzzleZ = 3.12;
}

/** The smoke-grenade banks on the rear of the turret's upper side panels (the CV9040C seats its Galix there). */
interface Cv90SmokeBanks {
  readonly count: number; readonly r: number; readonly len: number; readonly spacing: number; readonly seed: number;
}
const CV90_SMOKE_BANKS: Cv90SmokeBanks = Object.freeze({ count: 4, r: 0.038, len: 0.22, spacing: 0.085, seed: 920 });

/** The Strf 9040 turret shell: the crew shell, the wedge cheeks, the lower-band panels, the smoke banks on the upper side
 * panels and the lift eyes (the CV9040C builds on it, `smoke` its Galix banks on the same seat). */
export function cv90TurretShell(P: CvBuilderPort, o: { readonly smoke?: Cv90SmokeBanks } = {}): void {
  const smoke = o.smoke ?? CV90_SMOKE_BANKS;
  // Two-man Bofors turret: upright lower band, inward-raked upper add-on panels, short squared rear, a raked lower
  // front, and wedge cheek armour either side of the open gun channel the cradle runs out of.
  P.add('turret', armorLoft([
    [-1.06, 0.88, 0.98, 0.82, -0.10, 0.40, 0.74],
    [-0.96, 0.96, 1.05, 0.88, -0.10, 0.40, 0.78],
    [0.22, 1.00, 1.07, 0.90, -0.10, 0.40, 0.78],
    [0.62, 0.86, 0.93, 0.76, -0.10, 0.40, 0.78],
    [0.98, 0.70, 0.75, 0.62, -0.10, 0.32, 0.44],
    [1.32, 0.58, 0.60, 0.54, -0.10, 0.04, 0.10],
    [1.42, 0.44, 0.45, 0.42, -0.10, -0.06, -0.02],
  ]));
  for (const side of [-1, 1]) {
    // wedge cheek armour flanking the gun channel: the arrowhead front of the Strf 9040's add-on package (its tips stay
    // inside a 1.49 m radius of the ring axis, so the traversing turret never sweeps the side armour's top edge; their
    // rear tops run 30 mm under the roof plate, so the roof stays one flat plate for the dock's feet)
    P.addExternalArmor('turret', convexSlab(
      [side * 0.33, -0.06, 0.50], [side * 0.94, -0.06, 0.40], [side * 0.56, -0.06, 1.38], [side * 0.33, -0.06, 1.40],
      [side * 0.33, 0.75, 0.50], [side * 0.86, 0.75, 0.40], [side * 0.53, 0.32, 1.38], [side * 0.33, 0.35, 1.40],
    ));
    // bolted add-on panels on the lower band, following the band's outward lean
    for (const [z0, z1] of [[-0.90, -0.31], [-0.29, 0.30]] as const) P.addExternalArmor('turret', orientedSlab(
      [side * 0.96, -0.05, z0], [side * 0.965, -0.05, z1], [side * 1.055, -0.05, z1], [side * 1.05, -0.05, z0],
      [side * 1.036, 0.38, z0], [side * 1.03, 0.38, z1], [side * 1.12, 0.38, z1], [side * 1.126, 0.38, z0],
    ));
    // smoke dischargers on the rear of the upper side panels, firing forward, out and up: the bank is rolled 66 deg
    // about the turret's long axis so its bracket lies flush on the 24 deg inward-raked panel (5 mm into it). The roll
    // turns the bank's splay into elevation, so the splay leans the tubes toward the roof (-side): every tube rises
    // (tools/vehicle-controls-inventory.mjs rejects a downward or rearward smoke socket)
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: smoke.count, r: smoke.r, len: smoke.len, spacing: smoke.spacing,
      splay: -side * 0.15, pitch: -0.35, seed: smoke.seed + side,
    }), side * 1.051, 0.593, -0.64, [0, 0, -side * 1.152]);
    KIT.liftEye(P, 'turretDetail', side * 0.70, 0.78, -0.80);
  }
}

/** The Strf 9040 turret roof: the gunner's sight head, the commander's cupola, its periscopes and sight, the gunner's
 * hatch and the Lyran illumination launcher (the CV9040C carries the same roof). */
export function cv90TurretRoof(P: CvBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // Gunner's sight head on the right front of the roof.
  P.addEquipment('turret', box(0.34, 0.30, 0.40), -0.52, 0.92, 0.30);
  P.add('turretDark', box(0.30, 0.16, 0.025), -0.52, 0.94, 0.505);
  P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.11, 0.014), -0.52, 0.94, 0.522);
  // Commander's cupola on the left with its vision blocks, the commander's sight in front of it.
  P.addCupola('turret', cylY(0.33, 0.35, 0.09, P.q ? 24 : 14), 0.44, 0.81, -0.30);
  {
    const hatch = hatchParts(0.27, !!P.q, -1);
    for (const g of hatch.lid) P.addCupola('turret', g, 0.44, 0.85, -0.30);
    for (const g of hatch.dark) P.add('turretDark', g, 0.44, 0.85, -0.30);
  }
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i - 2.5) * 0.42;
    KIT.periscope(P, 'turretDetail', 0.44 + Math.sin(a) * 0.34, 0.835, -0.30 + Math.cos(a) * 0.34, a);
  }
  // (the sight stands 0.47 m behind the roof's front edge: the drone dock's cradle runs forward from just ahead of it,
  // its landing pad over the left cheek; tools/gen-mission-attachment-seats.mjs AUTHORED_DOCKS)
  P.add('turret', cylY(0.10, 0.12, 0.14, 14), 0.44, 0.84, 0.15);
  P.addEquipment('turret', box(0.26, 0.22, 0.28), 0.44, 1.01, 0.15);
  P.addModuleVisual('optics', 'turretGlass', box(0.18, 0.10, 0.014), 0.44, 1.02, 0.296);
  // Gunner's hatch.
  P.addHatch('turret', box(0.52, 0.04, 0.58), -0.44, 0.79, -0.42);
  // Lyran illumination launcher: twin tubes on a block at the left rear of the roof.
  P.addEquipment('turret', box(0.26, 0.14, 0.30), 0.60, 0.84, -0.80);
  for (const x of [0.54, 0.66]) P.add('turretDetail', cylZ(0.045, 0.40, 12), x, 0.96, -0.74, -0.30, 0, 0);
}

function buildCv90Turret(P: CvBuilderPort): void {
  const { box, cylY } = KIT;
  cv90TurretShell(P);
  buildCv90Gun(P);
  cv90TurretRoof(P);
  // Roof machine gun (the commander's Ksp 88 on a compact remote station at the right rear).
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'hull', sizeStandard: 'k2b-compact-tower',
    scale: 0.80, towerRise: 0.06, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Ksp 88 RWS', seed: 934,
  });
  rws.name = 'cv90K2bStyleRws';
  rws.userData.hostVariant = 'cv90';
  mount(P, 'turret', rws, -0.40, 0.78, -0.98, [0, 0, 0]);
  // Rear stowage bin across the turret back.
  P.addEquipment('turret', orientedSlab(
    [-0.70, 0.14, -1.04], [0.70, 0.14, -1.04], [0.70, 0.14, -1.30], [-0.70, 0.14, -1.30],
    [-0.70, 0.52, -1.04], [0.70, 0.52, -1.04], [0.70, 0.52, -1.30], [-0.70, 0.52, -1.30],
  ));
  P.add('turretDark', box(1.20, 0.02, 0.02), 0, 0.40, -1.305);
  for (const [x, height, seed] of [[-0.78, 0.95, 955], [0.80, 0.80, 956]] as const) {
    P.add('turretDark', cylY(0.040, 0.050, 0.08, 10), x, 0.76, -0.92);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }), x, 0.80, -0.92);
  }
  P.decal('turret', 'crossgrey', null, 0.22, [-1.135, 0.20, -0.30], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.70);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90IndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false, identityFamily: 'cv90-native',
      foreignFamilyGeometryReused: false,
      turretConstruction: 'strf9040-wedge-cheeks-raked-panels-v8',
      gunAssembly: 'buried-mask-tapered-cradle-40mm-v4',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws', allAroundOptics: true,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true, wedgeCheeksPerSide: 1, lowerBandPanelsPerSide: 2,
      frontArmorShell: 'wedge-cheeks-open-gun-channel', equipmentReseatedForShell: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90', architecture: 'buried-mask-tapered-cradle-cover-finned-jacket-v4',
      movingWithGun: true, surroundsMainBarrel: true, rootJoinedToTurretFace: true,
      mainGunCaliberMm: 40, barrelLengthM: 3.12,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([-0.40, 0.78, -0.98]),
      scale: rws.userData.scale, sizeStandard: rws.userData.sizeStandard,
      towerRiseM: rws.userData.towerRise, caliberMm: rws.userData.caliberMm,
      visibleFeedBelt: rws.userData.hasVisibleFeedBelt, turretOwned: true,
    });
  }
}

function buildCv90(P: CvBuilderPort): void {
  buildCv90Hull(P);
  buildCv90RunningGear(P);
  buildCv90Turret(P);
  P.decal('hull', 'roundel', null, 0.27, [-1.665, 1.45, -1.62], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '9040', 0.22, [1.665, 1.45, -0.62], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.cv90IndependentHullReceipt = Object.freeze({
      id: 'cv90', firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      designLineage: 'strf9040-modernised-267',
      hullConstruction: 'cv90-t-section-hull-long-glacis-v8', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 11,
      sideArmorCourses: 2, planarRoofCell: true, upperGlacisConstruction: 'continuous-loft-glacis',
      monotonicArmorInset: true, concaveSurfaceCount: 0,
      lowerHullFusion: 'continuous-raked-belly-to-nose-v3',
      frontDrive: true, rearTroopDoor: true, sharedCv90Construction: 'cv90-hull-armour-stern-gear-v1',
      rearTrackDepartureZM: CV90_GEAR.wheelZs[CV90_GEAR.wheelZs.length - 1],
    });
  }
  applyAdvancedIfvScale(P, 'cot-cv90-compact-r1');
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the scaled, assembled build
  addVehicleGhillieSuit(P);
}

// -------------------------------------------------------------------------
// CV90 Mk IV concept: the taller, stronger Mk IV hull (new front, 1,000 hp) with a modern two-man 50 mm turret.

const MKIV_HULL: Cv90Hull = Object.freeze({
  noseZ: 3.49, rearZ: -3.40, roofY: 1.84, sponY: 1.12, upperHalf: 1.56, bellyHalf: 1.02, bellyY: 0.44,
  // the lower glacis is the plane through (z 2.24, y 0.20) and the nose chin (3.49, 1.07); it meets the belly at 0.345
  glacisBreakZ: 1.30, noseTopY: 1.47, chinY: 1.07, kneeZ: 2.4483, kneeY: 0.345,
  rearFloorY: 0.74, rearKneeZ: -2.98, bowBellyZ: 1.90,
});

const MKIV_GEAR: Cv90Gear = Object.freeze({
  wheelR: 0.315, wheelW: 0.25, wheelY: 0.395, xc: 1.33,
  wheelZs: [2.26, 1.57, 0.88, 0.19, -0.50, -1.19, -1.88],
  sprocket: { z: 3.15, y: 0.72, r: 0.295 }, idler: { z: -2.70, y: 0.54, r: 0.27 },
  rollerZs: [1.23, -0.15, -1.53], rollerY: 0.89, rollerR: 0.068,
  trackW: 0.57, trackTh: 0.08, linkPitchM: 0.148, topY: 1.05, contactZF: 2.32, contactZR: -1.92,
});

function buildCv90MkivHull(P: CvBuilderPort): void {
  const d = MKIV_HULL, { box } = KIT;
  P.add('hull', cv90HullShell(d));
  const glacisTop = (z: number): number => cv90RoofY(d, z) + 0.07;
  for (const side of [-1, 1] as const) {
    // heavier Mk IV modules: a deeper upper course standing farther out, a bevelled lower course
    cv90ArmourCourse(P, side, [[-3.37, -2.17], [-2.15, -0.95], [-0.93, 0.27], [0.29, 1.49], [1.51, 2.50],
      [2.52, 3.30]], { inner: 1.55, outer: 1.78, bottom: 1.09, top: glacisTop, chamferTop: 0.04,
      chamferBottom: 0.02, breaks: [d.glacisBreakZ] });
    cv90ArmourCourse(P, side, [[-3.33, -2.12], [-2.10, -0.89], [-0.87, 0.34], [0.36, 1.57], [1.59, 2.74]],
      { inner: 1.635, outer: 1.78, bottom: 0.76, top: () => 1.12, chamferTop: 0.02, chamferBottom: 0.07,
        frontRake: 0.18 });
    for (const z of [-2.11, -0.88, 0.35, 1.58]) P.add('hullDetail', box(0.05, 0.08, 0.12), side * 1.785, 1.10, z);
  }
  cv90Stern(P, d, { doorHalf: 0.54, doorBottom: 0.80, doorTop: 1.72, binInner: 1.04, binOuter: 1.73,
    binBottom: 1.12, binTop: 1.80, binDepth: 0.22 });
  for (const side of [-1, 1]) {
    P.addHatch('hull', box(0.66, 0.04, 1.10), side * 0.38, d.roofY + 0.012, -2.62);
    P.add('hullDark', box(0.10, 0.03, 0.12), side * 0.38, d.roofY + 0.032, -2.14);
  }
  const tilt = Math.atan2(d.roofY - d.noseTopY, d.noseZ - 0.04 - d.glacisBreakZ);
  {
    // the driver's hatch lies in the glacis plane
    const z = 1.86, hatch = hatchParts(0.30, !!P.q, -1);
    for (const g of hatch.lid) P.addCupola('hull', g, 0.66, cv90RoofY(d, z) - 0.012, z, tilt, 0, 0);
    for (const g of hatch.dark) P.add('hullDark', g, 0.66, cv90RoofY(d, z) - 0.012, z, tilt, 0, 0);
  }
  for (const x of [0.46, 0.66, 0.86]) KIT.periscope(P, 'hullDetail', x, cv90RoofY(d, 2.30) + 0.030, 2.30);
  P.add('hull', box(1.14, 0.03, 1.40), -0.80, cv90RoofY(d, 2.55) + 0.010, 2.55, tilt, 0, 0);
  glacisGrille(P, d, -1.34, -0.30, 1.42, 1.80, 7);
  cv90Bow(P, d, 1.30, 904);
  // the Mk IV's new nose: a full-width bumper beam across the nose plate carrying the tow shackles
  P.add('hull', box(2.06, 0.12, 0.10), 0, d.chinY + 0.10, d.noseZ - 0.02);
  KIT.towCable(P, [[-1.12, 1.48, 3.15], [-0.62, 1.55, 2.80], [0.10, 1.57, 2.78], [0.20, 1.53, 3.06]]);
}

function buildCv90MkivRunningGear(P: CvBuilderPort): void {
  cv90RunningGear(P, MKIV_GEAR);
}

/** 50 mm Bushmaster III-class mount: a broad armoured mantlet box closed round the barrel (its rear buried in the
 * turret front at every pitch), the barrel sleeve and the short slotted muzzle brake. */
function buildCv90MkivGun(P: CvBuilderPort): void {
  const { cylX, cylZ } = KIT;
  const root = chamferedBox([[-0.30, 0.34, -0.20, 0.20, 0.06], [0.30, 0.33, -0.19, 0.20, 0.07],
    [0.72, 0.27, -0.15, 0.185, 0.06]]);
  root.userData.cv90GunRole = 'buried-trunnion-mask';
  P.addGunExtra(root);
  P.addGunExtra(cylX(0.15, 0.80, P.q ? 20 : 12), 0, 0, 0);
  P.addGunExtraDark(cylZ(0.098, 0.10, P.q ? 20 : 12), 0, 0, 0.77);
  KIT.buildGun(P, { len: 3.76, r: 0.074, sleeve: true, collar: true, baseR: 0.12 });
  muzzleBore(P, { len: 3.76, r: 0.074, seg: 20 });
  P.muzzleZ = 3.76;
}

function buildCv90MkivTurret(P: CvBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  // The authored combat frame seats the complete cannon 18 cm farther into the turret; the visual pivot uses that
  // same frame without an offset.
  const gunTrunnionRecessM = 0.18 * ADVANCED_IFV_SCALE;
  // Modern two-man turret: wide flat-sided body with raked upper panels, a long squared bustle, a broad raked front
  // carrying a central mantlet, smoke grenade banks on the front corners.
  P.add('turret', armorLoft([
    [-1.42, 1.06, 1.12, 0.98, -0.08, 0.30, 0.84],
    [-1.32, 1.15, 1.21, 1.07, -0.08, 0.30, 0.88],
    [0.40, 1.16, 1.22, 1.08, -0.08, 0.30, 0.88],
    [1.00, 0.96, 1.00, 0.88, -0.08, 0.30, 0.88],
    [1.20, 0.86, 0.88, 0.80, -0.08, 0.30, 0.44],
    [1.36, 0.62, 0.64, 0.60, -0.08, 0.02, 0.088],
    [1.40, 0.52, 0.53, 0.50, -0.08, -0.05, 0.00],
  ]));
  // the mantlet's housing: the roof carried forward over the trunnions, closed round the mask
  P.add('turret', chamferedBox([[0.60, 0.42, 0.08, 0.86, 0.06], [1.36, 0.40, 0.10, 0.80, 0.07]]));
  for (const side of [-1, 1]) {
    // add-on modules on the lower band, three a side with joints between them
    for (const [z0, z1] of [[-1.30, -0.62], [-0.60, 0.04], [0.06, 0.38]] as const) P.addExternalArmor('turret',
      orientedSlab(
        [side * 1.145, -0.06, z0], [side * 1.145, -0.06, z1], [side * 1.225, -0.06, z1], [side * 1.225, -0.06, z0],
        [side * 1.20, 0.29, z0], [side * 1.20, 0.29, z1], [side * 1.28, 0.29, z1], [side * 1.28, 0.29, z0],
      ));
    // APS radar faces on the four corners (Iron Fist-class sensor heads), on the upper panels
    for (const [z, yaw] of [[0.62, side * 1.05], [-1.20, side * (Math.PI - 0.80)]] as const) {
      const x = side * (z > 0 ? 1.14 : 1.13);
      P.addEquipment('turret', box(0.40, 0.36, 0.10), x, 0.58, z, 0, yaw, 0);
      P.addModuleVisual('optics', 'turretDark', box(0.32, 0.28, 0.014), x + Math.sin(yaw) * 0.054, 0.58,
        z + Math.cos(yaw) * 0.054, 0, yaw, 0);
    }
    // add-on cheek modules on the raked front either side of the mantlet housing (inner faces on the front plane
    // through z 1.00 / y 0.88 and z 1.40 / y 0, 100 mm thick along its normal), each carrying a forward-firing smoke
    // grenade bank. The lower front stays inside a 1.50 m radius of the ring axis below the side armour's top, so the
    // traversing turret never sweeps it.
    P.addExternalArmor('turret', convexSlab(
      [side * 0.43, 0.18, 1.318], [side * 0.60, 0.18, 1.318], [side * 0.43, 0.82, 1.027], [side * 0.80, 0.82, 1.027],
      [side * 0.43, 0.221, 1.409], [side * 0.58, 0.221, 1.409], [side * 0.43, 0.861, 1.118], [side * 0.78, 0.861, 1.118],
    ));
    mount(P, 'turret', FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.040, len: 0.22, spacing: 0.075,
      splay: side * 0.15, pitch: -0.35, seed: 930 + side,
    }), side * 0.58, 0.50, 1.33, [0, 0, 0]);
    // Iron Fist-class twin launchers on the rear corners of the roof, trained outward
    P.add('turret', cylY(0.13, 0.15, 0.08, 14), side * 0.78, 0.89, -1.04);
    P.addEquipment('turret', box(0.20, 0.16, 0.22), side * 0.78, 1.01, -1.04);
    for (const dy of [-0.045, 0.045]) {
      P.add('turretDetail', cylZ(0.048, 0.40, 12), side * 0.80, 1.05 + dy, -0.92, -0.20, side * 0.55, 0);
    }
    KIT.liftEye(P, 'turretDetail', side * 0.66, 0.86, -1.20);
  }
  buildCv90MkivGun(P);
  // Gunner's sight hood at the front left of the roof (beside the mantlet housing).
  P.addEquipment('turret', box(0.36, 0.30, 0.42), 0.66, 1.00, 0.46);
  P.add('turretDark', box(0.30, 0.17, 0.025), 0.66, 1.02, 0.675);
  P.addModuleVisual('optics', 'turretGlass', box(0.22, 0.12, 0.014), 0.66, 1.02, 0.692);
  // Commander's panoramic sight on its mast at the right, the commander's hatch behind it.
  P.add('turret', cylY(0.16, 0.18, 0.10, 16), -0.50, 0.90, -0.06);
  P.add('turret', cylY(0.085, 0.10, 0.36, 14), -0.50, 1.12, -0.06);
  P.addEquipment('turret', box(0.30, 0.26, 0.30), -0.50, 1.43, -0.06);
  P.addModuleVisual('optics', 'turretGlass', box(0.20, 0.13, 0.014), -0.50, 1.44, 0.095);
  P.add('turretDark', box(0.24, 0.025, 0.24), -0.50, 1.57, -0.06);
  {
    const hatch = hatchParts(0.28, !!P.q, -1);
    for (const g of hatch.lid) P.addCupola('turret', g, -0.48, 0.85, -0.64);
    for (const g of hatch.dark) P.add('turretDark', g, -0.48, 0.85, -0.64);
  }
  P.addHatch('turret', box(0.52, 0.04, 0.56), 0.50, 0.87, -0.36);
  // Twin missile pod (Spike LR / MMP class) raised on its arm at the left side of the turret.
  weaponAssembly(P, () => {
    P.add('turret', box(0.20, 0.26, 0.34), 1.02, 0.97, -0.30);
    P.addEquipment('turret', box(0.36, 0.34, 1.10), 1.24, 1.20, -0.18);
    for (const y of [1.12, 1.29]) {
      P.add('turretDark', cylZ(0.072, 0.06, 16), 1.24, y, 0.36);
      P.add('turretDetail', KIT.torus(0.074, 0.010, 16), 1.24, y, 0.393, Math.PI / 2, 0, 0);
    }
  });
  // Light RWS (the roof machine gun) on the bustle roof.
  const rws = FITTINGS.openYokeRws({
    mats: P.mats, bodySlot: 'hull', sizeStandard: 'k2b-compact-tower',
    scale: 0.90, towerRise: 0.08, variant: 'korean-twin', ammoSide: 1,
    sensorSide: -1, elev: 0.055, caliberMm: 12.7,
    weaponName: 'CV90 Mk IV light RWS', seed: 944,
  });
  rws.name = 'cv90MkivK2bStyleRws';
  rws.userData.hostVariant = 'cv90_mk4_concept';
  mount(P, 'turret', rws, 0.30, 0.86, -1.06, [0, 0, 0]);
  // bustle stowage and antennas
  P.addEquipment('turret', orientedSlab(
    [-0.84, 0.12, -1.40], [0.84, 0.12, -1.40], [0.84, 0.12, -1.66], [-0.84, 0.12, -1.66],
    [-0.84, 0.56, -1.40], [0.84, 0.56, -1.40], [0.84, 0.56, -1.66], [-0.84, 0.56, -1.66],
  ));
  P.add('turretDark', box(1.40, 0.02, 0.02), 0, 0.44, -1.665);
  for (const [x, height, seed] of [[-0.90, 1.00, 975], [0.94, 0.85, 976]] as const) {
    P.add('turretDark', cylY(0.042, 0.054, 0.085, 10), x, 0.84, -1.30);
    mount(P, 'turret', FITTINGS.antennaWhip({ mats: P.mats, h: height, r: 0.010, seed }), x, 0.88, -1.30);
  }
  P.decal('turret', 'crossgrey', null, 0.25, [-1.215, 0.20, -0.40], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 2.02);
  if (P.geometryReceipt) {
    P.turretG.userData.cv90MkivIndependentTurretReceipt = Object.freeze({
      sharedStructuralBuilder: false, identityFamily: 'cv90-native',
      foreignFamilyGeometryReused: false,
      turretConstruction: 'cv90-mkiv-two-man-50mm-aps-v8',
      gunAssembly: 'buried-mask-closed-mantlet-50mm-v4',
      remoteMachineGunTower: 'k2b-style-complete-open-yoke-rws',
      spikeLauncherTubes: 2, launcherTubes: 2, apsRadarFaces: 4, apsLaunchers: 2,
      panoramicCommanderSight: true,
      planarRoofCrown: true, monotonicArmorInset: true, concaveSurfaceCount: 0,
      integratedRearBustle: true, lowerBandPanelsPerSide: 3,
      frontArmorShell: 'raked-front-closed-mantlet-housing',
      sideEquipmentSeat: 'raised-pod-arm-v1',
      equipmentReseatedForShell: true,
    });
    P.gunG.userData.cv90GunAssemblyReceipt = Object.freeze({
      host: 'cv90_mk4_concept', architecture: 'buried-mask-closed-mantlet-50mm-v4',
      movingWithGun: true, surroundsMainBarrel: true, closedNoseFace: true,
      rootJoinedToTurretFace: true, rootRearZM: -0.30,
      mainGunCaliberMm: 50, barrelLengthM: 3.76,
      trunnionRecessM: gunTrunnionRecessM,
    });
    P.turretG.userData.cv90RoofRwsReceipt = Object.freeze({
      host: 'cv90_mk4_concept', designFamily: rws.userData.designFamily,
      variant: rws.userData.stationVariant, mountLocal: Object.freeze([0.30, 0.86, -1.06]),
      scale: rws.userData.scale, sizeStandard: rws.userData.sizeStandard,
      towerRiseM: rws.userData.towerRise, caliberMm: rws.userData.caliberMm,
      visibleFeedBelt: rws.userData.hasVisibleFeedBelt, turretOwned: true,
    });
  }
}

function buildCv90Mkiv(P: CvBuilderPort): void {
  buildCv90MkivHull(P);
  buildCv90MkivRunningGear(P);
  buildCv90MkivTurret(P);
  P.decal('hull', 'roundel', null, 0.30, [-1.785, 1.52, -1.70], -Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '904-IV', 0.23, [1.785, 1.52, -0.60], Math.PI / 2);
  if (P.geometryReceipt) {
    P.hullG.userData.cv90MkivIndependentHullReceipt = Object.freeze({
      id: 'cv90_mk4_concept', firstPartyProceduralOnly: true, externalGeometryLoaded: false,
      designLineage: 'cv90-mkiv-hull-267',
      hullConstruction: 'cv90-mkiv-t-section-hull-tall-nose-v8', roadWheelsPerSide: 7,
      canonicalTrackCourses: 1, duplicateTrackMeshes: 0,
      suspensionPlacement: 'inboard-behind-road-wheel', sideArmorStationsPerSide: 11,
      sideArmorCourses: 2, planarRoofCell: true, upperGlacisConstruction: 'continuous-loft-glacis',
      monotonicArmorInset: true, concaveSurfaceCount: 0,
      lowerHullFusion: 'continuous-raked-belly-to-nose-v3',
      frontDrive: true, rearTroopDoor: true, sharedCv90Construction: 'cv90-hull-armour-stern-gear-v1',
      rearTrackDepartureZM: MKIV_GEAR.wheelZs[MKIV_GEAR.wheelZs.length - 1],
    });
  }
  applyAdvancedIfvScale(P, 'cot-cv90-mkiv-compact-r1');
}

export const CV90_PROFILES = Object.freeze({
  cv90: Object.freeze({ build: buildCv90 }),
  cv90_mk4_concept: Object.freeze({ build: buildCv90Mkiv }),
}) satisfies VehicleProfileRecord;
