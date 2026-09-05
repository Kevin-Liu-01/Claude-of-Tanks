// First-party Japanese armored-family derivatives. The owner-supplied GLBs
// remain external silhouette/metric oracles: no source topology is imported.
// Each builder preserves its complete donor hull, skirts and single smart
// running-gear course, then adds source-specific supported armor/equipment.

import * as THREE from 'three';
import { KIT, FITTINGS, orientedSlab } from './kit.ts';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildType10BBase } from '../modern3.ts';
import { buildType90 } from './misc.ts';
import { TYPE10_MANTLET_FIT } from './type10GunSeat.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type Axis = 'x' | 'y' | 'z';
type Quad = [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];

interface JapaneseBuilderPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly recoilG: THREE.Group;
  readonly mats: Record<string, THREE.Material> & {
    readonly rubber: THREE.Material;
    readonly dark: THREE.Material;
    readonly detail: THREE.Material;
    readonly shadow: THREE.Material;
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
  fitting.position.set(x, y, z);
  if (rotation) fitting.rotation.set(rotation[0], rotation[1], rotation[2]);
  (owner === 'hull' ? P.hullG : P.turretG).add(fitting);
}

function cassette(
  P: JapaneseBuilderPort,
  owner: VehicleAssemblyOwner,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  rotation: Vec3Tuple | null = null,
  fastener = true,
): void {
  const r = rotation || [0, 0, 0];
  const armor = owner === 'hull' ? 'hull' : 'turret';
  const detail = owner === 'hull' ? 'hullDark' : 'turretDark';
  P.add(armor, KIT.box(w, h, d), x, y, z, r[0], r[1], r[2]);
  if (fastener) P.add(detail, KIT.box(w * 0.68, 0.014, Math.max(0.025, d * 0.07)),
    x, y + h * 0.5 + 0.009, z + d * 0.25, r[0], r[1], r[2]);
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

function sampleFace(
  p00: Vec3Tuple,
  p10: Vec3Tuple,
  p11: Vec3Tuple,
  p01: Vec3Tuple,
  u: number,
  v: number,
  outwardHint: Vec3Tuple,
): FaceSample {
  const a = new THREE.Vector3(...p00);
  const b = new THREE.Vector3(...p10);
  const c = new THREE.Vector3(...p11);
  const d = new THREE.Vector3(...p01);
  const point = a.clone().multiplyScalar((1 - u) * (1 - v))
    .addScaledVector(b, u * (1 - v))
    .addScaledVector(c, u * v)
    .addScaledVector(d, (1 - u) * v);
  const du = b.clone().sub(a).multiplyScalar(1 - v)
    .add(c.clone().sub(d).multiplyScalar(v));
  const dv = d.clone().sub(a).multiplyScalar(1 - u)
    .add(c.clone().sub(b).multiplyScalar(u));
  const normal = new THREE.Vector3().crossVectors(du, dv).normalize();
  if (normal.dot(new THREE.Vector3(...outwardHint)) < 0) normal.negate();
  return { point, normal, du, dv };
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

function roofWeapon(
  P: JapaneseBuilderPort,
  x: number,
  y: number,
  z: number,
  seed: number,
  scale = 0.78,
  yaw = 0,
  s = 1,
): void {
  P.add('turret', KIT.box(0.46 * s, 0.075 * s, 0.43 * s), x, y, z);
  P.add('turretDark', KIT.box(0.36 * s, 0.020 * s, 0.33 * s), x, y + 0.048 * s, z);
  P.add('turret', KIT.cylY(0.19 * s, 0.21 * s, 0.070 * s, 16), x, y + 0.085 * s, z);
  mount(P, FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', scale, elev: 0.10,
    shield: true, ammo: true, ring: { r: 0.16 * s, stubs: 3 }, seed,
  }), x, y + 0.105 * s, z, [0, yaw, 0]);
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
    P.add('hull', orientedSlab(
      [-a.w, a.b, a.z], [a.w, a.b, a.z], [b.w, b.b, b.z], [-b.w, b.b, b.z],
      [-a.ws, a.s, a.z], [a.ws, a.s, a.z], [b.ws, b.s, b.z], [-b.ws, b.s, b.z]));
    P.add('hull', orientedSlab(
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
    P.add('hull', box(0.34, 0.12, 0.62), side * 1.29, 1.40, -1.62);
    P.add('hull', box(0.34, 0.11, 0.72), side * 1.29, 1.39, -0.55);
    // Source-specific horizontal muffler canister on the exposed rear
    // fender, including both closed end bands and a short deck return.
    P.add('hullDetail', cylZ(0.145, 0.92, 18), side * 1.30, 1.49, -1.72);
    for (const z of [-2.18, -1.26]) P.add('hullDark', cylZ(0.158, 0.030, 18),
      side * 1.30, 1.49, z);
    P.add('hullDetail', box(0.035, 0.15, 0.34), side * 1.30, 1.42, -2.20);
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
  buildRunningGear(P, {
    style: 'rubber', dishR: 0.86, wheelR: 0.455, wheelW: 0.26,
    wheelY: 0.51, xc: 1.38,
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
  P.add('turret', toCreasedNormals(polyMultiLoft(stbCastPlan, [
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
  ]), Math.PI / 4.5), 0, 0, -0.03);
  P.turretG.userData.japaneseCastTurretReceipt = {
    family: 'stb-leopard-generation-cast',
    planStations: stbCastPlan.length,
    verticalRings: 5,
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
  mount(P, FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'dark', scale: 0.82, elev: 0.06,
    shield: false, ammo: true, ring: { r: 0.15, stubs: 3 }, seed: 1110,
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
    P.add('turretDark', box(0.14, 0.025, 0.025), side * 0.87, 0.885, 0.88);
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

function addType90APackage(P: JapaneseBuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  // Replace the quiet cheek read with joined, faceted NERA carriers and
  // shallow service cassettes. Every carrier overlaps the donor turret core.
  for (const side of [-1, 1]) {
    P.add('turret', orientedSlab(
      [side * 0.22, 0.02, 1.22], [side * 1.50, 0.02, 0.78],
      [side * 1.45, 0.03, -0.40], [side * 0.42, 0.03, 0.24],
      [side * 0.20, 0.57, 1.03], [side * 1.31, 0.60, 0.58],
      [side * 1.28, 0.55, -0.48], [side * 0.39, 0.59, 0.16]));
    for (let i = 0; i < 4; i++) cassette(P, 'turret', side * (0.58 + i * 0.25),
      0.60 - i * 0.018, 0.89 - i * 0.17, 0.22, 0.18, 0.21,
      [-0.14, side * (0.04 + i * 0.04), side * 0.02], false);
    // Armored skirt modules remain outside the hull side but above the linked
    // shoe course; they do not replace or hide donor running gear.
    for (let i = 0; i < 6; i++) cassette(P, 'hull', side * 1.70, 1.07,
      1.78 - i * 0.70, 0.055, 0.40, 0.62, null, false);
  }
  // Large panoramic thermal head and shielded low roof weapon.
  P.add('turret', box(0.48, 0.075, 0.46), -0.55, 0.86, -0.22);
  P.add('turretDetail', box(0.38, 0.34, 0.35), -0.55, 1.04, -0.18, -0.05, 0, 0);
  P.add('turretDark', box(0.28, 0.18, 0.032), -0.55, 1.06, 0.03);
  P.add('turretGlass', box(0.20, 0.11, 0.022), -0.55, 1.06, 0.055);
  P.add('turret', cylY(0.27, 0.29, 0.075, 18), 0.50, 0.86, -0.48);
  P.add('turretDark', torus(0.25, 0.014, 18), 0.50, 0.91, -0.48);
  roofWeapon(P, 0.50, 0.92, -0.48, 9010, 0.82, -0.04);

  // The donor's broad welded roof remains the correct Type 90 family mass,
  // but the A package needs a visible service grammar at garage distance.
  // Keep every addition shallow and seated: split hatch, vision blocks,
  // weld courses and access plates all overlap the existing roof plane.
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

  // Joined flank modules and 360-degree camera/APS heads replace the quiet
  // slab read.  These are NERA/service faces, not a second track or skirt
  // course; their inner faces are buried into the turret shoulders.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const z = 0.35 - i * 0.38;
      P.add('turretDark', box(0.035, 0.30, 0.33), side * 1.305, 0.48, z,
        0, side * 0.09, 0);
      P.add('turret', box(0.050, 0.26, 0.30), side * 1.325, 0.49, z,
        0, side * 0.09, 0);
      P.add('turretDetail', box(0.054, 0.018, 0.22), side * 1.353, 0.57, z,
        0, side * 0.09, 0);
    }
    P.add('turret', box(0.21, 0.16, 0.23), side * 1.17, 0.69, 0.49,
      -0.06, side * 0.12, 0);
    P.add('turretDark', box(0.022, 0.10, 0.14), side * 1.285, 0.70, 0.51,
      -0.06, side * 0.12, 0);
    P.add('turretGlass', box(0.015, 0.060, 0.080), side * 1.300, 0.71, 0.52,
      -0.06, side * 0.12, 0);
  }
  smoke(P, 1.23, 0.65, 0.08, 5, 9020, -0.44);
  joinedBasket(P, 2.48, 0.47, -1.72, 0.62, 9030);
  whips(P, 0.73, -1.86, 9040, 1.08);
  // Revised Rh-120 plant — §5.364 re-seat in the donor's new trunnion frame
  // (buildType90 now pitches about the turret-face trunnion: gunExtra world
  // = local + (0, 1.686, 1.30); the old 0.38/0.67 stations, authored for the
  // retired scale-preserving seat, would float 0.4 m ahead of the new
  // mantlet). The A-mark identity keeps its BEEFIER mask read as layered
  // applique ON the donor's wide plate: an up-armor collar frame proud of
  // the face, a fatter sleeve root over the donor's recoil step, and the
  // long coax sleeve wrapping the donor port.
  P.addGunExtra(box(0.92, 0.44, 0.06), 0, 0, 0.245);                          // A-mark applique collar frame (z_w 1.515..1.575, seated 5 mm into the donor face plate — §B2)
  P.addGunExtra(cylZ(0.15, 0.34, 18, 0.12), 0, 0, 0.60);                      // strengthened sleeve root (z_w 1.73..2.07, overlapping the donor step 1.55..1.85)
  P.addGunExtraDark(cylZ(0.038, 0.10, 10), 0.36, 0.105, 0.28);                // coax sleeve wrapping the donor port (same face station, 8 cm longer)
  // (decal seats on the unscaled rig_turret after the donor's postAssemble
  // shell regroup — 0.2856/−0.6396 = 0.42/−0.78 through the shell scale.)
  P.decal('turret', 'number', '90-A', 0.20, [1.48, 0.2856, -0.6396], Math.PI / 2);
  P.topY = Math.max(P.topY || 0, 0.9928);                                     // rig_turretTop world 2.3928 unchanged = the old 1.46 through the 0.68 shell scale
}

function buildType90A(P: JapaneseBuilderPort): void {
  buildType90(P);
  addType90APackage(P);
}

function addType10BPackage(P: JapaneseBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
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
    P.add('turret', orientedSlab(
      [side * 0.198, 0.055, 1.606], sideFace[0], sideFace[3], [side * 0.44, 0.055, 0.264],
      topFace[0], topFace[1], topFace[2], topFace[3]));

    // Four compound-pitch courses replace the two hand-rotated diagonal
    // strips. Every cassette inherits the wing's local normal and penetrates
    // its carrier by 12 mm, so neither yaw nor pitch can open a daylight gap.
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

  const rwsBaseY = roofY + (0.075 * 1.1) * 0.5 - roofEmbed;
  roofWeapon(P, 0.462, rwsBaseY, -0.638, 10010, 0.858, 0.045, 1.1);
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
  // §5.336: the shared base is the rebuilt ×1.10 buildType10Native2026
  // (the §5.299 byte-pin retired by owner authority; buildType10BBase now
  // delegates). The B-variant identity rides on top, re-seated at scale.
  buildType10BBase(P);
  addType10BPackage(P);
}

export const JAPAN_PROFILES = {
  stb1: { build: buildSTB1 },
  type90a: { build: buildType90A },
  type10b: { build: buildType10B },
} satisfies VehicleProfileRecord;
