// First-party Japanese armored-family derivatives. The owner-supplied GLBs
// remain external silhouette/metric oracles: no source topology is imported.
// Each builder preserves its complete donor hull, skirts and single smart
// running-gear course, then adds source-specific supported armor/equipment.

import * as THREE from 'three';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { refineCastLoft } from '../factoryGeometry.ts';
import { buildFleetTrackShoe } from './abramsSourceXTrackShoe.ts';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildType10BBase } from '../modern3.ts';
import { buildType90 } from './misc.ts';
import { TYPE10_MANTLET_FIT } from './type10GunSeat.ts';
import { addType10DozerKit } from './type10Dozer.ts';
import { addType10DozerFieldKit } from './type10DozerFieldKit.ts';
import { buildType10X } from './type10X.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mount as mountFitting } from './fittingMount.ts';
import { sampleConvexArmorFace as sampleFace } from './armorFaceSampling.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type Axis = 'x' | 'y' | 'z';
type Quad = [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];

interface JapaneseBuilderPort {
  readonly forEachBucketPart: TankBuilderPort['forEachBucketPart'];
  readonly snapGroup: TankBuilderPort['snapGroup'];
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly recoilG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & {
    readonly rubber: THREE.Material;
    readonly dark: THREE.Material;
    readonly detail: THREE.Material;
    readonly shadow: THREE.Material;
    readonly canvasCloth: THREE.MeshStandardMaterial;
    readonly wheels?: THREE.MeshStandardMaterial;
  };
  readonly q?: boolean;
  readonly rng: () => number;
  readonly disposables: THREE.BufferGeometry[];
  readonly gear: {
    readonly roadWheelLayout?: {
      readonly wheelZs: readonly number[];
      readonly xc: number;
      readonly wheelY: number;
    };
    addRoadWheelLayer(
      geometry: THREE.BufferGeometry,
      material: THREE.Material,
      options?: {
        readonly outset?: number;
        readonly yOffset?: number;
        readonly name?: string;
        readonly appearanceRole?: string;
      },
    ): void;
  };
  readonly spec: {
    readonly id: string;
    readonly armor: {
      readonly gunPivot: readonly [number, number, number];
      readonly turretPivot: readonly [number, number, number];
    };
    readonly visual: { readonly number?: string };
  };
  readonly geometryReceipt?: boolean;
  topY: number;
  muzzleZ: number;
  add(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(owner: VehicleAssemblyOwner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(owner: VehicleAssemblyOwner, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(id: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  eraCluster(
    key: string,
    build: (place: (
      x: number,
      y: number,
      z: number,
      rotationX?: number,
      rotationY?: number,
      rotationZ?: number,
      scaleX?: number,
      scaleY?: number,
      scaleZ?: number,
    ) => void) => void,
    turretOwned?: boolean,
  ): void;
  decal(
    owner: VehicleAssemblyOwner,
    kind: string,
    label: string,
    scale: number,
    position: Vec3Tuple,
    yaw: number,
  ): void;
  scaleBuckets(names: readonly string[], x: number, y: number, z: number): void;
  offsetBuckets(names: readonly string[], x?: number, y?: number, z?: number): void;
  visualEraCluster(
    key: string,
    owner: VehicleAssemblyOwner,
    build: () => void,
  ): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface FaceSample {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  du: THREE.Vector3;
  dv: THREE.Vector3;
}

interface SeatedCassetteOptions {
  axis?: Axis;
  contactSide?: number;
  embed?: number;
  lid?: boolean;
  lidEmbed?: number;
}

function mount(
  P: JapaneseBuilderPort,
  fitting: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  rotation: Vec3Tuple | null = null,
  owner: VehicleAssemblyOwner = 'turret',
): void {
  mountFitting(P, owner, fitting, x, y, z, rotation);
}

function seatedArmorCassette(
  P: JapaneseBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  {
  axis = 'y', contactSide = -1, embed = 0.012, lid = true, lidEmbed = 0.002,
  }: SeatedCassetteOptions = {},
): void {
  const bucket = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  const r = rotation || [0, 0, 0];
  const dims = { x: w, y: h, z: d };
  const shift = { x: 0, y: 0, z: 0 };
  dims[axis] += embed;
  shift[axis] = contactSide * embed * 0.5;
  P.visualEraCluster(`japan-layered-${owner}`, owner, () => {
    P.add(bucket, KIT.xform(KIT.box(dims.x, dims.y, dims.z),
      shift.x, shift.y, shift.z), x, y, z, r[0], r[1], r[2]);
    if (!lid) return;
    const outward = -contactSide;
    const lidDims = { x: w * 0.76, y: h * 0.76, z: d * 0.76 };
    lidDims[axis] = Math.min(0.020, dims[axis] * 0.22);
    const lidShift = { x: 0, y: 0, z: 0 };
    // Seat the camouflaged outer layer by its inner face: a 2 mm lap keeps
    // physical contact while the remaining relief is independent of draw
    // order or depth bias.
    const resolvedLidEmbed = Math.min(lidEmbed, lidDims[axis] * 0.25);
    lidShift[axis] = outward * (dims[axis] * 0.5 - embed * 0.5
      + lidDims[axis] * 0.5 - resolvedLidEmbed);
    P.add(detail, KIT.xform(KIT.box(lidDims.x, lidDims.y, lidDims.z),
      lidShift.x, lidShift.y, lidShift.z), x, y, z, r[0], r[1], r[2]);
  });
}

function faceSeatedArmorCassette(
  P: JapaneseBuilderPort,
  owner: VehicleAssemblyOwner,
  face: FaceSample,
  courseAxis: THREE.Vector3,
  w: number,
  h: number,
  d: number,
  embed = 0.012,
): { point: THREE.Vector3; normal: THREE.Vector3; center: THREE.Vector3; embed: number } {
  const n = face.normal.clone().normalize();
  const course = courseAxis.clone();
  const zAxis = course.addScaledVector(n, -course.dot(n)).normalize();
  const xAxis = new THREE.Vector3().crossVectors(n, zAxis).normalize();
  const basis = new THREE.Matrix4().makeBasis(xAxis, n, zAxis);
  const rotation = new THREE.Euler().setFromQuaternion(
    new THREE.Quaternion().setFromRotationMatrix(basis), 'XYZ');
  const center = face.point.clone().addScaledVector(n, h * 0.5);
  seatedArmorCassette(P, owner, center.x, center.y, center.z, w, h, d,
    [rotation.x, rotation.y, rotation.z], { embed, lid: true });
  return { point: face.point.clone(), normal: n, center, embed };
}

// `s` is an opt-in uniform scale on the helpers' internal fixed sizes
// (§5.336 type10b ×1.10 re-seat) — the default 1 keeps every other
// consumer (stb1, type90a) byte-identical (§F.2 shared-helper law).
function whips(
  P: JapaneseBuilderPort,
  y: number,
  z: number,
  seed: number,
  spread = 1.02,
  s = 1,
): void {
  for (const side of [-1, 1]) {
    P.add('turretDetail', KIT.cylY(0.036 * s, 0.046 * s, 0.060 * s, 10), side * spread, y, z);
    mount(P, FITTINGS.antennaWhip({
      mats: P.mats, h: (side < 0 ? 0.98 : 0.90) * s, r: 0.011 * s,
      rake: side * 0.035, seed: seed + (side > 0 ? 1 : 0),
    }), side * spread, y + 0.025 * s, z);
  }
}

function smoke(
  P: JapaneseBuilderPort,
  x: number,
  y: number,
  z: number,
  count: number,
  seed: number,
  pitch = -0.38,
  s = 1,
): void {
  for (const side of [-1, 1]) mount(P, FITTINGS.smokeBank({
    mats: P.mats, count, r: 0.041 * s, len: 0.28 * s, splay: side * 1.02,
    pitch, arc: 0.55, spacing: 0.10 * s, slot: 'detail',
    rotation: [0, 0, -side * 0.10], seed: seed + (side > 0 ? 1 : 0),
  }), side * x, y, z);
}

function joinedBasket(
  P: JapaneseBuilderPort,
  width: number,
  y: number,
  z: number,
  depth: number,
  seed: number,
  s = 1,
): void {
  P.add('turretDark', KIT.box(width, 0.30 * s, 0.045 * s), 0, y, z - depth * 0.5);
  for (const yy of [y - 0.14 * s, y, y + 0.14 * s])
    P.add('turretDetail', KIT.box(width + 0.18 * s, 0.026 * s, 0.030 * s), 0, yy, z - depth - 0.025 * s);
  for (let i = 0; i < 8; i++) P.add('turretDetail', KIT.box(0.026 * s, 0.38 * s, 0.030 * s),
    -width * 0.47 + i * (width * 0.94 / 7), y, z - depth - 0.025 * s);
  // 2026-10-19 (owner float sweep): the rail-and-post frame stood ~14 cm aft of the back panel with nothing between; side
  // bars at the end posts run it back to the panel.
  for (const sx of [-1, 1]) P.add('turretDetail', KIT.box(0.026 * s, 0.026 * s, depth * 0.5 + 0.04 * s),
    sx * width * 0.47, y, z - depth * 0.75 - 0.0075 * s);
  mount(P, FITTINGS.stowageRack({
    mats: P.mats, w: width * 0.76, d: depth * 0.62, h: 0.22 * s,
    fill: 0.45, rails: 3, seed,
  }), 0, y + 0.14 * s, z - depth * 0.50);
}

const STB_TURRET_HEIGHT_SCALE = 0.45;

function prepareSTB1Rig(P: JapaneseBuilderPort): void {
  // The STB prototype uses the same low cast-turret height class as the
  // production Type 74.  The shell was previously left at the authoring
  // construction height (almost exactly 2x Type 74), so compress the entire
  // completed turret section in its own local frame.  Width and plan remain
  // untouched; articulated gun geometry stays independently pitchable.
  // Seat the bearing at the same deck-level datum as the production Type 74
  // and preserve the shared 1.60 m bore axis. The old low pivot buried most
  // of the newly shortened casting inside the STB hull.
  P.turretG.position.set(0, 1.42, 0.22);
  P.gunG.position.set(0, 0.18, 1.10);
}

function addSTB1HullBody(P: JapaneseBuilderPort): void {
  const { box, cylZ } = KIT;

  // The owner reference is an unusually low, broad STB prototype—not the
  // taller production Type 74.  This is therefore a complete standalone
  // hull, turret and running-gear build.  No Type 74 bucket survives here.
  // Closed seven-station source loft.  The previous three nested boxes made
  // the tank read as a long slab with vertical sides; the GLB instead has a
  // narrow lower tub, full-width shoulder flare, falling glacis and tucked
  // chin.  Each interval is one closed outward-wound volume.
  const hullRows = [
    { z: -3.03, b: 0.58, s: 1.15, t: 1.25, w: 0.82, ws: 0.95, wt: 1.08 },
    { z: -2.72, b: 0.30, s: 1.28, t: 1.38, w: 0.98, ws: 1.04, wt: 1.42 },
    { z: -1.60, b: 0.23, s: 1.27, t: 1.38, w: 0.98, ws: 1.04, wt: 1.46 },
    { z:  1.58, b: 0.23, s: 1.26, t: 1.36, w: 0.98, ws: 1.04, wt: 1.46 },
    { z:  2.18, b: 0.32, s: 1.18, t: 1.28, w: 0.94, ws: 1.00, wt: 1.12 },
    { z:  2.72, b: 0.48, s: 0.90, t: 1.00, w: 0.86, ws: 0.92, wt: 1.05 },
    { z:  3.05, b: 0.65, s: 0.76, t: 0.84, w: 0.72, ws: 0.77, wt: 0.84 },
  ];
  for (let i = 0; i < hullRows.length - 1; i++) {
    const a = hullRows[i]; const b = hullRows[i + 1];
    // Narrow lower tub stays wholly inside the shoe corridor.  The shoulder
    // flare begins only at the top-run line, matching the source cross-
    // section and preventing the diagonal side wall from cutting through
    // suspension-driven pads.
    P.add('hull', convexSlab(
      [-a.w, a.b, a.z], [a.w, a.b, a.z], [b.w, b.b, b.z], [-b.w, b.b, b.z],
      [-a.ws, a.s, a.z], [a.ws, a.s, a.z], [b.ws, b.s, b.z], [-b.ws, b.s, b.z]));
    P.add('hull', convexSlab(
      [-a.ws, a.s, a.z], [a.ws, a.s, a.z], [b.ws, b.s, b.z], [-b.ws, b.s, b.z],
      [-a.wt, a.t, a.z], [a.wt, a.t, a.z], [b.wt, b.t, b.z], [-b.wt, b.t, b.z]));
  }
  // Thin shoulder returns close the flare onto the source's exposed course;
  // these are armor/fender seats, not a second running-gear shell.
  for (const side of [-1, 1]) {
    P.add('hull', box(0.30, 0.060, 4.72), side * 1.31, 1.36, -0.12);
    P.add('hullDetail', box(0.035, 0.070, 4.58), side * 1.465, 1.385, -0.12);
  }
  P.add('hullDetail', box(1.50, 0.035, 0.045), 0, 1.08, 2.48, -0.50, 0, 0);

  // Low squared stern, cooling banks and source-specific external exhaust.
  P.add('hull', box(1.82, 0.79, 0.10), 0, 0.75, -2.98);
  P.add('hull', box(2.72, 0.055, 0.54), 0, 1.38, -2.70);
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.62, 0.30, 0.028), side * 0.63, 0.91, -3.04);
    for (let i = 0; i < 5; i++) P.add('hullDetail', box(0.55, 0.018, 0.024),
      side * 0.63, 0.80 + i * 0.055, -3.058);
    P.add('hullDark', box(0.12, 0.10, 0.032), side * 0.96, 1.12, -3.06);
    // (release 240: both fender boxes 3.5 cm lower, tops 1.42-1.425, under the bustle's 1.439 floor that turns over them)
    P.add('hull', box(0.34, 0.12, 0.62), side * 1.29, 1.365, -1.62);
    P.add('hull', box(0.34, 0.11, 0.72), side * 1.29, 1.365, -0.55);
    // Source-specific horizontal muffler canister on the exposed rear
    // fender, including both closed end bands and a short deck return.
    // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): 0.50 m aft, -1.76..-2.68, wholly past
    // the bustle's low floor (1.439 to 2.05 m off the ring's axis, 1.548 to 2.25); its front stood 20 cm in it.
    P.add('hullDetail', cylZ(0.145, 0.92, 18), side * 1.30, 1.49, -2.22);
    for (const z of [-2.68, -1.76]) P.add('hullDark', cylZ(0.158, 0.030, 18),
      side * 1.30, 1.49, z);
    P.add('hullDetail', box(0.035, 0.15, 0.34), side * 1.30, 1.42, -2.62);
  }
  for (const side of [-1, 1]) {
    P.add('hullDark', box(0.34, 0.16, 0.035), side * 0.91, 1.04, -3.075);
    for (const dx of [-0.08, 0.08]) P.add('hullDetail', cylZ(0.045, 0.018, 12),
      side * 0.91 + dx, 1.04, -3.096);
  }
  // Three backed radiator/service fields reproduce the dense source engine
  // deck instead of reading as a few loose stripes.  The ribs are seated on
  // shallow shoes so there is never a grate hovering above open hull space.
  for (const side of [-1, 1]) for (let bank = 0; bank < 3; bank++) {
    const z = -1.38 - bank * 0.53;
    P.add('hull', box(0.82, 0.040, 0.45), side * 0.54, 1.326, z);
    P.add('hullDark', box(0.72, 0.026, 0.36), side * 0.54, 1.352, z);
    for (let i = -3; i <= 3; i++) P.add('hullDetail', box(0.036, 0.018, 0.34),
      side * 0.54 + i * 0.095, 1.372, z);
    for (let i = -1; i <= 1; i++) P.add('hullDetail', box(0.68, 0.019, 0.025),
      side * 0.54, 1.374, z + i * 0.10);
  }
}

function addSTB1HullHardwareAndRunningGear(P: JapaneseBuilderPort): void {
  const { box, cylY, torus, buildRunningGear, fenders, headlight, liftEye, periscope } = KIT;

  // Thin broken fenders and fully exposed native track run.  Source has no
  // full-height side skirts; the five suspension stations remain countable.
  fenders(P, 1.02, 1.555, 1.385, -2.72, 2.72, 0.028);
  // owner 2026-10-25 (the modernisation): fender support gussets along the outer edge (0.18 m over the 1.13 top run)
  // and a bolt course along the shoulder return
  for (const side of [-1, 1]) {
    for (const z of [2.20, 1.30, 0.40, -0.50, -1.40, -2.30]) {
      P.add('hullDetail', box(0.026, 0.075, 0.07), side * 1.505, 1.3475, z);
      P.add('hullDetail', box(0.40, 0.022, 0.026), side * 1.29, 1.362, z);
    }
    for (let k = 0; k < 14; k++) P.add('hullDetail', KIT.cylY(0.016, 0.016, 0.012, 8), side * 1.31, 1.396, 2.10 - k * 0.32);
    // filler cap and lift handles on the deck behind the turret
    P.add('hull', cylY(0.075, 0.08, 0.026, 14), side * 0.98, 1.39, -0.98);
    P.add('hullDark', torus(0.068, 0.008, 14), side * 0.98, 1.403, -0.98, Math.PI / 2, 0, 0);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) P.add('hullDetail', box(0.46, 0.025, 0.035),
      side * 1.30, 1.415, -2.45 + i * 0.92);
    P.add('hullDark', box(0.40, 0.070, 0.035), side * 1.31, 1.405, -2.76);
    P.add('hullDark', box(0.42, 0.070, 0.035), side * 1.31, 1.405, 2.72);
  }
  // Driver's hatch, periscopes, twin light clusters, tow fixtures and cable.
  P.add('hull', cylY(0.23, 0.24, 0.040, 16), -0.48, 1.335, 1.64);
  P.add('hullDark', box(0.37, 0.014, 0.045), -0.48, 1.36, 1.64);
  for (const x of [-0.68, -0.48, -0.28]) periscope(P, 'hullDetail', x, 1.37, 1.88);
  for (const side of [-1, 1]) {
    // The oracle carries a three-lamp bank in one armored fender shoe on
    // each shoulder.  The former isolated pin lights disappeared at normal
    // board scale and did not explain the source's frontal identity.
    P.add('hull', box(0.53, 0.13, 0.24), side * 1.00, 1.38, 2.30,
      -0.24, 0, 0);
    for (let lamp = 0; lamp < 3; lamp++) headlight(P,
      side * (0.84 + lamp * 0.16), 1.44, 2.39, -0.24, 0.050);
    P.add('hullDetail', torus(0.082, 0.014, 14), side * 0.54, 0.55, 2.82,
      Math.PI / 2, 0, 0);
    liftEye(P, 'hullDetail', side * 1.18, 1.33, 1.85, side * 0.24);
  }
  P.add('hullDark', box(1.88, 0.29, 0.035), 0, 0.53, 2.84);
  P.add('hullDetail', box(1.62, 0.035, 0.045), 0, 0.69, 2.865);
  mount(P, FITTINGS.towCable({
    mats: P.mats,
    pts: [[-0.95, 1.16, 2.28], [0, 1.29, 2.00], [0.95, 1.16, 2.28]],
    r: 0.017, seed: 1101,
  }), 0, 0, 0, null, 'hull');

  const wheelZs = [1.60, 0.79, -0.02, -0.83, -1.64];
  // owner 2026-09-22 ("stb-1 … wheels too big … overlap each other"): r 0.455 on the 0.81 pitch
  // overlapped by 10 cm. The prototype's five wheels are the Type 74 class (~700 mm here, 2R/pitch
  // 0.86, an 11 cm gap); the dead track keeps riding on the wheel tops.
  // Tire width 0.30 (round 40 axial fit): the Type 90 forging this hull draws is 1.38 × its radius wide; the 0.26
  // band and the 0.42 track bounded it to 0.60 of its proportion.
  buildRunningGear(P, {
    // owner 2026-10-25 (the STB-1 modernisation): the fleet's fitted shoe in the Japanese staggered-rib pattern, the
    // loaded run fitted to the live wheel rims
    trackShoeBuilder: buildFleetTrackShoe, fitLoadedRun: true, dedupeLoopPoints: true,
    style: 'rubber', dishR: 0.86, wheelR: 0.35, wheelW: 0.30,
    wheelY: 0.42, xc: 1.38,
    wheelZs,
    sprocket: { z: -2.55, y: 0.74, r: 0.42 },
    idler: { z: 2.48, y: 0.74, r: 0.42 },
    rollers: [], trackW: 0.42, trackTh: 0.090, topY: 1.13, botY: 0.03,
    deadSag: 0.045, paintedEnds: true, coveredTop: false, arms: true,
  });
}

function addSTB1CastTurret(P: JapaneseBuilderPort): void {
  const { box, cylY, torus, polyMultiLoft, frustum, liftEye } = KIT;

  // The prototype casting shares the Leopard 1 generation's low, faceted
  // cheek language, but it is still a cast shell rather than a welded box.
  // Five connected rings turn a tucked bearing into a full shoulder, then
  // through two deliberate armor breaks into a shallow polygonal crown.  The
  // irregular 18-station plan prevents the old mathematically perfect egg:
  // broad side flats, clipped fore-cheeks and a tapered rear shoulder remain
  // readable while the short stations between them retain cast continuity.
  const stbCastPlan: Array<readonly [number, number]> = [
    [0.00, 1.34], [0.40, 1.28], [0.78, 1.08], [1.07, 0.78],
    [1.27, 0.38], [1.31, -0.18], [1.27, -0.72], [1.08, -1.18],
    [0.76, -1.52], [0.00, -1.69],
    [-0.76, -1.52], [-1.08, -1.18], [-1.27, -0.72], [-1.31, -0.18],
    [-1.27, 0.38], [-1.07, 0.78], [-0.78, 1.08], [-0.40, 1.28],
  ];
  const stbCastBaseY = -0.045;
  const raiseSTBCastY = (y: number): number => stbCastBaseY + (y - stbCastBaseY) * 2;
  // owner 2026-10-25 ("update the type 74 and stb 1 tanks completely fullly"): the measured stations and rings are refined
  // into a continuous casting (refineCastLoft: 36 plan stations through the 18 authored, nine rings rounding the shoulder
  // and crown inside the authored envelope); the 40° crease keeps the deliberate armour breaks only.
  const stbCast = refineCastLoft(stbCastPlan, [
    { height: stbCastBaseY, inset: 0.70 },
    {
      height: [0.10, 0.10, 0.095, 0.09, 0.085, 0.085, 0.095, 0.115, 0.13,
        0.135, 0.13, 0.115, 0.095, 0.085, 0.085, 0.09, 0.095, 0.10]
        .map(raiseSTBCastY),
      inset: 1,
    },
    {
      height: [0.27, 0.28, 0.295, 0.31, 0.325, 0.335, 0.345, 0.36, 0.37,
        0.375, 0.37, 0.36, 0.345, 0.335, 0.325, 0.31, 0.295, 0.28]
        .map(raiseSTBCastY),
      inset: [0.90, 0.91, 0.92, 0.94, 0.95, 0.95, 0.94, 0.92, 0.90,
        0.89, 0.90, 0.92, 0.94, 0.95, 0.95, 0.94, 0.92, 0.91],
    },
    {
      height: [0.39, 0.395, 0.405, 0.42, 0.435, 0.45, 0.46, 0.465, 0.47,
        0.47, 0.47, 0.465, 0.46, 0.45, 0.435, 0.42, 0.405, 0.395]
        .map(raiseSTBCastY),
      inset: [0.64, 0.66, 0.69, 0.72, 0.75, 0.77, 0.78, 0.78, 0.77,
        0.76, 0.77, 0.78, 0.78, 0.77, 0.75, 0.72, 0.69, 0.66],
    },
    {
      height: raiseSTBCastY(0.49),
      inset: [0.43, 0.46, 0.50, 0.54, 0.58, 0.60, 0.60, 0.58, 0.55,
        0.53, 0.55, 0.58, 0.60, 0.60, 0.58, 0.54, 0.50, 0.46],
      centerHeight: raiseSTBCastY(0.49),
    },
  ]);
  P.add('turret', toCreasedNormals(polyMultiLoft(stbCast.plan, stbCast.rings), Math.PI / 4.5), 0, 0, -0.03);
  P.turretG.userData.japaneseCastTurretReceipt = {
    family: 'stb-leopard-generation-cast',
    authoredStations: stbCastPlan.length,
    planStations: stbCast.plan.length,
    verticalRings: stbCast.rings.length,
    cheekBreaksPerSide: 4,
    flatCrown: true,
    circularLathe: false,
    creaseAngleDeg: 40,
    heightScale: STB_TURRET_HEIGHT_SCALE,
    shellHeightM: 0.48,
    roofEquipment: { cupolas: 2, machineGuns: 1, markerLights: 2, opticHeads: 1 },
  };
  // Buried cast ring skirt, reduced in plan so it no longer reads as a flat
  // rectangular cylinder under the organic shell.
  P.add('turret', box(1.58, 0.11, 0.92), 0, 0.015, -0.55);
  P.add('turretDark', box(1.48, 0.018, 0.84), 0, -0.035, -0.55);
  // Shallow bustle extension is buried into the casting and closes with a
  // backed rear service face—never a free-floating pack.
  P.add('turret', frustum(0.85, -0.55, -1.82, 0.66, -0.64, -1.73, 0.04, 0.41));
  P.add('turret', box(1.24, 0.30, 0.055), 0, 0.26, -1.83);

  // Source flank ventilation arrays, access plates and grab rails.  These
  // break up the casting while remaining flush with its local side envelope.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const z = 0.25 - i * 0.22;
      P.add('turretDark', box(0.045, 0.29, 0.19), side * 1.225, 0.54, z,
        0, side * 0.07, 0);
      for (let rib = -1; rib <= 1; rib++) P.add('turretDetail',
        box(0.050, 0.018, 0.16), side * 1.250, 0.54 + rib * 0.092, z,
        0, side * 0.07, 0);
      P.add('turretDetail', box(0.052, 0.31, 0.018), side * 1.250, 0.54,
        z - 0.095, 0, side * 0.07, 0);
    }
    P.add('turret', box(0.035, 0.31, 0.42), side * 1.215, 0.47, -0.70,
      0, side * 0.08, 0);
    P.add('turretDetail', box(0.024, 0.024, 0.96), side * 1.235, 0.67, -0.57);
    for (const z of [-0.98, -0.18]) P.add('turretDetail', box(0.10, 0.024, 0.024),
      side * 1.19, 0.67, z);
    liftEye(P, 'turretDetail', side * 0.72, 0.76, 0.42, side * 0.30);
  }

  // The oracle's four-cell cheek grilles are a primary frontal identifier.
  // Each cell has a shallow armor backing and is canted with the casting.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.070, 0.38, 0.70), side * 1.170, 0.54, 0.59,
      0, side * 0.10, 0);
    for (let i = 0; i < 4; i++) {
      const z = 0.84 - i * 0.17;
      P.add('turretDark', box(0.034, 0.29, 0.142), side * 1.218, 0.55, z,
        0, side * 0.10, 0);
      P.add('turretDetail', box(0.040, 0.020, 0.128), side * 1.239, 0.65,
        z, 0, side * 0.10, 0);
      P.add('turretDetail', box(0.040, 0.020, 0.128), side * 1.239, 0.45,
        z, 0, side * 0.10, 0);
    }
  }

  // Signature left-front multi-pane searchlight: solid armored cradle,
  // hood, six luminous panes and a conduit seated back into the cheek.
  P.add('turret', box(0.54, 0.40, 0.38), 0.73, 0.52, 1.04, -0.05, 0, 0);
  P.add('turret', box(0.58, 0.055, 0.13), 0.73, 0.75, 1.15, -0.05, 0, 0);
  P.add('turretDark', box(0.48, 0.33, 0.028), 0.73, 0.52, 1.242);
  for (let row = 0; row < 3; row++) for (let col = 0; col < 2; col++) {
    P.add('turretGlass', box(0.160, 0.080, 0.018), 0.642 + col * 0.176,
      0.42 + row * 0.112, 1.262);
  }
  P.add('turretDetail', box(0.085, 0.42, 0.085), 0.73, 0.27, 0.92);
  // owner 2026-10-25 (the modernisation): guard bars over the six panes and cooling fins on the cradle's back
  for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.014, 0.36, 0.018), 0.57 + k * 0.08, 0.52, 1.274);
  for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.46, 0.04, 0.014), 0.73, 0.735, 0.92 + k * 0.06);
  P.add('turretDark', box(0.025, 0.025, 0.76), 1.02, 0.49, 0.62, 0, 0.32, 0);

  // Offset rangefinder blisters and their backed optic faces give the side
  // elevation the same asymmetric equipment cadence as the source print.
  for (const side of [-1, 1]) {
    P.add('turret', box(0.16, 0.25, 0.32), side * 1.20, 0.56, -0.30,
      0, side * 0.08, 0);
    P.add('turretDark', box(0.028, 0.17, 0.22), side * 1.293, 0.57, -0.29,
      0, side * 0.08, 0);
    P.add('turretGlass', box(0.020, 0.10, 0.13), side * 1.311, 0.58, -0.27,
      0, side * 0.08, 0);
  }

  // Closed cast-in service plates and roof bosses break the remaining blank
  // dome while staying shallow enough to read as part of the casting.  Their
  // unequal cadence follows the source rather than mirroring generic ERA.
  P.add('turret', box(0.56, 0.025, 0.34), -0.48, 0.82, 0.31,
    -0.18, 0.05, 0.02);
  P.add('turretDark', box(0.46, 0.018, 0.025), -0.48, 0.845, 0.31,
    -0.18, 0.05, 0.02);
  P.add('turret', cylY(0.115, 0.125, 0.045, 16), 0.06, 0.91, 0.55);
  P.add('turretDark', torus(0.112, 0.012, 18), 0.06, 0.94, 0.55);
  P.add('turret', cylY(0.090, 0.100, 0.035, 14), -0.10, 0.92, -0.79);
  for (const [x, z, yaw] of [[-0.78, 0.08, 0.32], [0.81, 0.02, -0.28]]) {
    P.add('turretDetail', box(0.24, 0.028, 0.045), x, 0.80, z, 0, yaw, 0);
    P.add('turretDetail', box(0.045, 0.12, 0.045), x, 0.75, z, 0, yaw, 0);
  }
}

function addSTB1RoofEquipment(P: JapaneseBuilderPort): void {
  const { box, cylY, cylZ, torus, cupola, periscope } = KIT;

  // Two different roof stations, low hatches, periscopes and the source's
  // commander-mounted machine gun stay planted on the corrected low crown.
  cupola(P, 'turret', 0.43, 0.98, -0.38, 0.34, 0.115, 12);
  P.add('turret', cylY(0.285, 0.320, 0.095, 20), 0.43, 1.105, -0.38);
  P.add('turretDark', torus(0.285, 0.016, 24), 0.43, 1.162, -0.38);
  // The source commander station is a low two-tier drum surrounded by
  // individually readable vision blocks, not a featureless roof cylinder.
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4;
    P.add('turretGlass', box(0.095, 0.075, 0.032),
      0.43 + Math.sin(a) * 0.295, 1.118, -0.38 + Math.cos(a) * 0.295,
      0, a, 0);
  }
  P.add('turret', box(0.34, 0.15, 0.25), 0.43, 1.25, -0.31, -0.04, 0, 0);
  P.add('turretDark', box(0.24, 0.082, 0.027), 0.43, 1.26, -0.168);
  P.add('turretGlass', box(0.17, 0.050, 0.020), 0.43, 1.26, -0.186);
  P.add('turret', cylY(0.275, 0.315, 0.080, 20), -0.43, 0.985, -0.12);
  P.add('turret', cylY(0.230, 0.250, 0.045, 20), -0.43, 1.050, -0.12);
  P.add('turretDark', torus(0.250, 0.015, 24), -0.43, 1.074, -0.12);
  P.add('turretDark', box(0.40, 0.018, 0.036), -0.43, 1.083, -0.12,
    0, 0.08, 0);
  P.add('turretDetail', box(0.060, 0.050, 0.17), -0.17, 1.060, -0.12,
    0, 0.08, 0);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    P.add('turretGlass', box(0.075, 0.055, 0.026),
      -0.43 + Math.sin(a) * 0.265, 1.045, -0.12 + Math.cos(a) * 0.265,
      0, a, 0);
  }
  for (const [x, z, yaw] of [[0.14, 0.38, 0], [-0.22, 0.34, 0.15], [0.69, -0.05, -0.2]])
    periscope(P, 'turretDetail', x, 1.04, z, yaw);
  // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): a working station
  mount(P, FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.82, elev: 0.06,
    shield: false, ammo: true, ring: { r: 0.15, stubs: 3 }, seed: 1110, working: true, ridingCradle: true,
  }), 0.43, 1.11, -0.38, [0, -0.05, 0]);
  P.add('turretDark', box(0.12, 0.11, 0.34), 0.43, 1.25, -0.20);
  P.add('turretDark', cylZ(0.020, 0.64, 10), 0.43, 1.27, 0.26, -0.05, 0, 0);
  P.add('turretDark', box(0.17, 0.13, 0.11), 0.57, 1.22, -0.30);

  // Roof equipment is intentionally dense but individually supported: a
  // low commander's sight, two guarded marker lamps and a spare ammunition
  // case give the prototype roof a working-vehicle cadence without rebuilding
  // any item as a second armor layer.
  P.add('turret', box(0.22, 0.19, 0.20), 0.02, 1.135, 0.06, -0.06, 0, 0);
  P.add('turretDark', box(0.17, 0.11, 0.025), 0.02, 1.145, 0.175);
  P.add('turretGlass', box(0.12, 0.065, 0.018), 0.02, 1.145, 0.192);
  for (const side of [-1, 1]) {
    P.add('turretDetail', cylZ(0.058, 0.105, 12), side * 0.87, 0.745, 0.87);
    P.add('turretGlass', cylZ(0.042, 0.018, 12), side * 0.87, 0.745, 0.931);
    P.add('turretDark', box(0.14, 0.025, 0.025), side * 0.87, 0.814, 0.88);   // 2026-10-19 (owner float sweep): the brow stood 70 mm over its housing
  }
  P.add('turretDetail', box(0.24, 0.17, 0.16), 0.70, 1.225, -0.52);
  P.add('turretDark', box(0.025, 0.11, 0.12), 0.835, 1.225, -0.52);

  // The source crown terminates in a broad backed mesh ventilation field.
  // Its shallow shoe overlaps the cast roof so it reads as fitted hardware,
  // not a black decal or a floating grate.
  P.add('turret', box(0.82, 0.055, 0.42), 0, 0.91, -1.15, -0.07, 0, 0);
  P.add('turretDark', box(0.72, 0.030, 0.34), 0, 0.947, -1.15, -0.07, 0, 0);
  for (let i = -3; i <= 3; i++) P.add('turretDetail', box(0.035, 0.020, 0.31),
    i * 0.10, 0.970, -1.15, -0.07, 0, 0);
}

function addSTB1TurretBasket(P: JapaneseBuilderPort): void {
  const { box } = KIT;

  // Small supported smoke banks and a continuous bustle basket/cage.  Every
  // rail has a visible return into the turret or its backed rear face.
  for (const side of [-1, 1]) mount(P, FITTINGS.smokeBank({
    mats: P.mats, count: 5, r: 0.045, len: 0.27, splay: side * 0.86,
    pitch: -0.38, arc: 0.48, spacing: 0.09, slot: 'detail', seed: 1120 + side,
  }), side * 0.94, 0.69, -0.72);
  for (const side of [-1, 1]) {
    for (const y of [0.30, 0.52]) P.add('turretDetail', box(0.025, 0.025, 0.88),
      side * 1.20, y, -1.42);
    for (let i = 0; i < 4; i++) P.add('turretDetail', box(0.025, 0.25, 0.025),
      side * 1.20, 0.41, -1.02 - i * 0.28);
    P.add('turretDetail', box(0.24, 0.025, 0.025), side * 1.08, 0.52, -1.86);
  }
  for (const y of [0.30, 0.52]) P.add('turretDetail', box(2.42, 0.025, 0.025),
    0, y, -1.88);
  for (let i = 0; i < 8; i++) P.add('turretDetail', box(0.025, 0.25, 0.025),
    -1.16 + i * (2.32 / 7), 0.41, -1.88);
  mount(P, FITTINGS.stowageRack({
    mats: P.mats, w: 1.72, d: 0.55, h: 0.16, fill: 0.50, rails: 3, seed: 1130,
  }), 0, 0.58, -1.58);
  whips(P, 0.72, -1.56, 1140, 0.83);
}

function addSTB1GunAndFinish(P: JapaneseBuilderPort): void {
  const { box, cylZ, buildGun } = KIT;
  const seg = P.q ? 36 : 18;

  // Rounded cast saddle and long bare L7 tube.  The gun group remains the
  // only pitch owner; the searchlight and all roof equipment yaw with turret.
  P.addGunExtra(box(0.66, 0.38, 0.20), 0, 0, 0.28);
  const saddle = KIT.sph(0.26, seg);
  saddle.scale(1.48, 0.90, 0.82);
  P.addGunExtra(saddle, 0, 0, 0.46);
  P.addGunExtra(cylZ(0.145, 0.34, seg, 0.115), 0, 0, 0.66);
  P.addGunExtraDark(cylZ(0.031, 0.10, 10), 0.27, 0.07, 0.50);
  buildGun(P, { len: 4.72, r: 0.062, sleeve: false, evac: 0.46,
    evacR: 1.72, collar: false, baseR: 0.145 });
  P.add('gunDark', cylZ(0.067, 0.075, 12), 0, 0, 4.695);
  // owner 2026-10-25 (the modernisation): the canvas boot over the tube's root ahead of the saddle, three straps
  // holding its folds (it rides the gun)
  P.add('gunMountCanvasSkin', cylZ(0.128, 0.20, seg, 0.168), 0, 0, 0.78);
  for (const [z, r] of [[0.72, 0.163], [0.79, 0.151], [0.86, 0.139]]) P.add('gunMountDark', KIT.torus(r, 0.009, 18), 0, 0, z);

  // Compress every already-transformed turret primitive around the local
  // ring datum. This catches canted cheek plates, baskets and roof hardware
  // as a single coherent section instead of flattening each primitive in its
  // own pre-rotation axes. Direct fitting groups are translated to the same
  // corrected roof datum but retain realistic MG, rack and antenna sizes.
  P.scaleBuckets(
    [
      'turret', 'turretCupola', 'turretEquipment', 'turretDark',
      'turretDetail', 'turretGlass', 'turretCloth',
    ],
    1, STB_TURRET_HEIGHT_SCALE, 1,
  );
  for (const child of P.turretG.children) {
    if (child === P.gunG || !child.name.startsWith('fitting_')) continue;
    child.position.y *= STB_TURRET_HEIGHT_SCALE;
  }

  P.decal('turret', 'number', 'STB-1', 0.21,
    [-1.23, 0.47 * STB_TURRET_HEIGHT_SCALE, -0.54], -Math.PI / 2);
  P.topY = 0.90;
}

function buildSTB1(P: JapaneseBuilderPort): void {
  prepareSTB1Rig(P);
  addSTB1HullBody(P);
  addSTB1HullHardwareAndRunningGear(P);
  addSTB1CastTurret(P);
  addSTB1RoofEquipment(P);
  addSTB1TurretBasket(P);
  addSTB1GunAndFinish(P);
}

function addSTC2TrialsPackage(P: JapaneseBuilderPort): void {
  const { box, cylY, torus } = KIT;
  // owner 2026-10-25 ("change the type 90a and type 90 kyu maru into prototype-named vriants"): type90a is the second
  // TK-X prototype, STC-2 (TK-X-0002, June 1985), not a Kai upgrade. The Kai package's NERA cheek carriers, skirt
  // cassettes, panoramic thermal head, flank modules, camera/APS heads and up-armour gun collar are gone. What the
  // second prototype carried instead: a commander's sight of its own design, a covered gunner's sight and blackout
  // lamps on the bow. The roof plate's top is y 0.94 in this builder frame (the donor's buildType90Turret); every
  // addition below seats 5 mm into the surface under it.

  // The prototype commander's independent sight: a drum head on a pedestal ahead-outboard of the commander's hatch
  // (x 0.34..0.78, z -0.39..0.05), clear of the cupola's outboard segment (z -0.28..-0.06).
  P.add('turret', box(0.22, 0.065, 0.22), 0.80, 0.9675, 0.30);                 // pedestal 0.935..1.00 on the 0.94 roof
  P.add('turretDetail', cylY(0.125, 0.125, 0.20, 18), 0.80, 1.095, 0.30);       // drum 0.995..1.195
  P.add('turretDark', torus(0.125, 0.010, 18), 0.80, 1.195, 0.30);
  P.add('turret', cylY(0.115, 0.13, 0.025, 18), 0.80, 1.205, 0.30);             // cap
  P.add('turretDark', box(0.16, 0.10, 0.024), 0.80, 1.11, 0.415);               // window frame on the drum's front
  P.add('turretGlass', box(0.13, 0.075, 0.012), 0.80, 1.11, 0.428);

  // The gunner's sight under its own hinged armoured cover: a plate over the donor hood (top 1.09, x 0.10..0.445,
  // z 0.79..1.48), seated 3 mm into it, with the hinge bar at its rear edge.
  P.add('turret', box(0.38, 0.026, 0.42), 0.2725, 1.100, 1.25, -0.035, 0, 0);
  P.add('turretDark', box(0.36, 0.030, 0.035), 0.2725, 1.096, 1.03);
  for (const x of [0.13, 0.415]) P.add('turretDetail', box(0.025, 0.05, 0.10), x, 1.09, 1.42);

  // blackout lamps on the front fender run (flat top 1.181, x 1.22..1.64, z 2.58..3.20), outboard of the headlights
  for (const side of [-1, 1]) {
    P.add('hullDetail', box(0.10, 0.07, 0.08), side * 1.46, 1.212, 3.06);
    P.add('hullDark', box(0.08, 0.05, 0.010), side * 1.46, 1.215, 3.102);
    P.add('hullGlass', box(0.06, 0.020, 0.006), side * 1.46, 1.222, 3.108);
  }

  // The roof's service grammar (split hatch with vision blocks, weld courses, access plates) as the Kai package seated
  // it: the prototypes carried the same hatches and plates.
  P.add('turret', cylY(0.27, 0.29, 0.065, 18), -0.43, 0.87, -0.71);
  P.add('turretDark', torus(0.255, 0.014, 18), -0.43, 0.91, -0.71);
  P.add('turret', cylY(0.23, 0.245, 0.030, 18), -0.43, 0.93, -0.71);
  P.add('turretDark', box(0.37, 0.018, 0.034), -0.43, 0.95, -0.71, 0, 0.08, 0);
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI * 0.72 + i * (Math.PI * 1.44 / 5);
    P.add('turretGlass', box(0.075, 0.055, 0.028),
      -0.43 + Math.sin(a) * 0.275, 0.925, -0.71 + Math.cos(a) * 0.275,
      0, a, 0);
  }
  for (const [z, w] of [[0.72, 1.18], [0.30, 1.52], [-0.20, 1.82], [-0.92, 1.92], [-1.46, 1.68]]) {
    P.add('turretDark', box(w, 0.016, 0.030), 0, 0.862, z);
  }
  for (const [x, z, w, d] of [
    [-0.77, 0.43, 0.38, 0.32], [0.75, 0.34, 0.34, 0.30],
    [-0.82, -1.20, 0.42, 0.30], [0.80, -1.15, 0.38, 0.28],
  ]) {
    P.add('turretDark', box(w + 0.035, 0.020, d + 0.035), x, 0.875, z);
    P.add('turret', box(w, 0.045, d), x, 0.892, z, -0.035, 0, 0);
    P.add('turretDetail', box(w * 0.68, 0.014, 0.025), x, 0.923, z + d * 0.22);
  }
  smoke(P, 1.23, 0.65, 0.08, 5, 9020, -0.44);
  joinedBasket(P, 2.48, 0.47, -1.72, 0.62, 9030);
  whips(P, 0.73, -1.86, 9040, 1.08);
  // the turret flanks carry STC-2 from the donor (spec.visual.number), the glacis TK-X-0002
  P.topY = Math.max(P.topY || 0, 0.9928);                                     // rig_turretTop world 2.3928 unchanged = the old 1.46 through the 0.68 shell scale
}

function buildType90A(P: JapaneseBuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  buildType90(P);
  addSTC2TrialsPackage(P);
}

function addType10BPackage(P: JapaneseBuilderPort): void {
  const { box, cylZ } = KIT;
  const eraEmbed = 0.012;
  let turretEraCount = 0;
  // §5.336 re-seat: every station and size below is the ratified B-variant
  // delta carried at the owner-decreed ×1.10 frame of the rebuilt shared
  // base (the §5.299 byte-pin is retired by that order — the base upgrade
  // covers both marks, the B identity delta is preserved here verbatim
  // in shape, scaled in place).
  // Sharp modular Type 10B cheek shell. It remains a shallow swept mass and
  // intersects the donor crown, avoiding a second detached turret volume.
  for (const side of [-1, 1]) {
    const topFace: Quad = [
      [side * 0.176, 0.638, 1.342], [side * 1.43, 0.671, 0.638],
      [side * 1.375, 0.616, -0.715], [side * 0.407, 0.66, 0.165],
    ];
    const sideFace: Quad = [
      [side * 1.694, 0.055, 0.88], [side * 1.43, 0.671, 0.638],
      [side * 1.375, 0.616, -0.715], [side * 1.628, 0.055, -0.638],
    ];
    // Two welded support facets form each compound face. The old fixed
    // quad diagonal dented one cheek inward and disagreed with its mirror.
    P.add('turret', convexSlab(
      [side * 0.198, 0.055, 1.606], sideFace[0], sideFace[3], [side * 0.44, 0.055, 0.264],
      topFace[0], topFace[1], topFace[2], topFace[3]));

    // Every cassette samples the emitted planar facets, not a bilinear
    // imaginary patch between them. Its local normal and 12 mm embed follow
    // its carrier, so neither yaw nor pitch can open a daylight gap.
    for (const u of [0.16, 0.38, 0.60, 0.82]) {
      for (const v of [0.12, 0.36, 0.60, 0.84]) {
        const face = sampleFace(...topFace, u, v, [0, 1, 0]);
        faceSeatedArmorCassette(P, 'turret', face, face.dv,
          0.225, 0.082, 0.205, eraEmbed);
        turretEraCount++;
      }
    }
    // A joined outer-shoulder course protects the flank without forming a
    // detached second shell. Local +Y follows the outward side normal.
    for (const v of [0.14, 0.38, 0.62, 0.86]) {
      const face = sampleFace(...sideFace, 0.58, v, [side, 0, 0]);
      faceSeatedArmorCassette(P, 'turret', face, face.dv,
        0.285, 0.078, 0.255, eraEmbed);
      turretEraCount++;
    }
    // High modular side armor is additive over the intact Type 10 skirts and
    // stays clear of the five-wheel smart course (inner faces seated on the
    // 1.6605 skirt outer plane. The old course stopped 0.15 mm short; these
    // modules embed 10 mm into that exact carrier plane.
    for (let i = 0; i < 6; i++) {
      const thickness = 0.0495;
      const carrierX = 1.6605;
      const centerX = side * (carrierX + thickness * 0.5);
      seatedArmorCassette(P, 'hull', centerX, 1.133, 1.782 - i * 0.748,
        thickness, 0.462, 0.66, null, {
          axis: 'x', contactSide: -side, embed: 0.010, lid: true,
        });
    }
  }
  // Paired EO stations and compact commander's RWS preserve JGSDF asymmetry.
  // Each assembly is lowered as a unit onto the marked 0.637 m crown plane;
  // optics, shields and weapons keep their relative internal alignment.
  const roofY = 0.637;
  const roofEmbed = 0.012;
  const leftBaseY = roofY + 0.0825 * 0.5 - roofEmbed;
  const leftDeltaY = leftBaseY - 0.968;
  P.add('turret', box(0.495, 0.0825, 0.484), -0.55, leftBaseY, -0.242);
  P.add('turretDetail', box(0.385, 0.363, 0.352), -0.55, 1.155 + leftDeltaY, -0.187, -0.06, 0, 0);
  P.add('turretDark', box(0.286, 0.187, 0.033), -0.55, 1.166 + leftDeltaY, 0.0275);
  P.add('turretGlass', box(0.198, 0.11, 0.022), -0.55, 1.166 + leftDeltaY, 0.0528);

  const rightBodyY = roofY + 0.275 * 0.5 - roofEmbed;
  const rightDeltaY = rightBodyY - 0.979;
  P.add('turret', box(0.374, 0.275, 0.341), 0.77, rightBodyY, 0.11, -0.08, 0, 0);
  P.add('turretDark', box(0.264, 0.143, 0.0286), 0.77, 0.99 + rightDeltaY, 0.3135);
  P.add('turretGlass', box(0.176, 0.0825, 0.0198), 0.77, 0.99 + rightDeltaY, 0.3366);

  // VH.14 (coordinator ruling 2026-10-14): the Type 10's one roof gun is its M2, a working station; the GPMG here is gone
  smoke(P, 1.353, roofY, 0.055, 6, 10020, -0.45, 1.1);
  const kaiBasketZ = -1.789;
  joinedBasket(P, 2.772, 0.528, kaiBasketZ, 0.77, 10030, 1.1);
  for (const side of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.035, 0.56),
      side * 1.34, 0.53, -2.30, 0, side * 0.08, 0);
  }
  whips(P, 0.814, -2.134, 10040, 1.21, 1.1);
  P.turretG.userData.type10bRoofEraReceipt = {
    roofCarrierY: roofY,
    contactEmbedM: roofEmbed,
    leftSightBottomY: roofY - roofEmbed,
    rightSightBottomY: roofY - roofEmbed,
    rwsBottomY: roofY - roofEmbed,
    maxRoofGapM: 0,
    turretEraCassettes: turretEraCount,
    formerTurretEraCassettes: 20,
    hullEraCassettes: 12,
    eraCarrierDerivedTransforms: true,
    turretEraEmbedM: eraEmbed,
    hullEraEmbedM: 0.010,
    eraLidEmbedM: 0.002,
    eraLidReliefM: 0.018,
    kaiBasketRearZ: kaiBasketZ - 0.77 - 0.025 * 1.1,
    baseBasketForwardZ: -2.585,
    basketJoinGapM: 0,
  };
  // Type 10 Kai 120-mm closed mask and strengthened sleeve. The applique
  // remains inside the shared turret throat instead of restoring the former
  // oversized rectangular mask.
  P.addGunExtra(box(TYPE10_MANTLET_FIT.kaiMaskWidth, TYPE10_MANTLET_FIT.kaiMaskHeight, 0.297), 0, 0, 0.44);
  P.addGunExtra(cylZ(0.209, 0.44, 18, 0.165), 0, 0, 0.77);
  P.addGunExtra(cylZ(0.0825, 0.242, 12), -TYPE10_MANTLET_FIT.auxiliaryPortX, 0.145, 0.517);
  P.addGunExtraDark(cylZ(0.0528, 0.0495, 12), -TYPE10_MANTLET_FIT.auxiliaryPortX, 0.145, 0.66);
  P.addGunExtraDark(cylZ(0.0418, 0.11, 10), TYPE10_MANTLET_FIT.auxiliaryPortX, 0.077, 0.671);
  P.decal('turret', 'number', '10-B', 0.22, [-1.628, 0.473, -0.902], -Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 1.628);
}

function buildType10B(P: JapaneseBuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  // §5.336: the shared base is the rebuilt ×1.10 buildType10Native2026
  // (the §5.299 byte-pin retired by owner authority; buildType10BBase now
  // delegates). The B-variant identity rides on top, re-seated at scale.
  buildType10BBase(P);
  addType10BPackage(P);
}

function buildType10Dozer(P: TankBuilderPort): void {
  // The modern Type 10 (profiles/type10X.ts, owner 2026-10-22) with the JGSDF dozer kit and its field kit: two remote
  // autocannon turrets in place of the 12.7 mm station, cages, appliqué, lamps and bins (profiles/type10DozerFieldKit.ts).
  // The blade rides stowed in battle and the Garage; spec.visual.dozerBlade = 'lowered' builds the presentation pose.
  buildType10X(P, { remoteM2: false });
  addType10DozerKit(P, P.spec.visual.dozerBlade === 'lowered' ? 'lowered' : 'stowed');
  addType10DozerFieldKit(P);
}

export const JAPAN_PROFILES = {
  stb1: { build: buildSTB1 },
  type90a: { build: buildType90A },
  type10b: { build: buildType10B },
  type10_dozer: { build: buildType10Dozer },
} satisfies VehicleProfileRecord;
