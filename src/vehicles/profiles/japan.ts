// First-party Japanese armored-family derivatives. The owner-supplied GLBs
// remain external silhouette/metric oracles: no source topology is imported.
// Each builder preserves its complete donor hull, skirts and single smart
// running-gear course, then adds source-specific supported armor/equipment.

import * as THREE from 'three';
import { KIT, FITTINGS } from './kit.ts';
import { buildType90 } from './misc.ts';
import { addType10DozerKit } from './type10Dozer.ts';
import { addType10DozerFieldKit } from './type10DozerFieldKit.ts';
import { buildType10X, TYPE10_X_DATUMS, TYPE10_X_SIDE_WALL } from './type10X.ts';
import { sectionSolid } from './sectionSolid.ts';
import { TKX_TRIAL_MODULE, TKX_GLACIS_PLATE, tkxGlacisY, TYPE10B_WEDGE_FOOT, TYPE10B_WEDGE_ROWS } from '../type10MarkArmor.ts';
import { sourceMachineGun } from './sourceMachineGun.ts';
import { libraryStationGun, libraryStationGunBounds } from './libraryRoofMg.ts';
import { buildType90B } from './type90B.ts';
import { buildType74Family } from './type74Family.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { mount as mountFitting } from './fittingMount.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';

type Vec3Tuple = [number, number, number];
type VehicleAssemblyOwner = 'hull' | 'turret';
type Axis = 'x' | 'y' | 'z';

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

// 262 (owner, 2026-10-27: "both the type 74 and stb should be based from this", with his STB-1 model): the STB-1 is the
// Type 74 family's prototype variant on the hull, running gear and cast turret measured on that model, with the model's
// own oval mask, searchlight box, vertical stern, mesh-topped boxes and silencers, caged lamps and roof kit
// (profiles/type74Family.ts).
function buildSTB1(P: TankBuilderPort): void {
  buildType74Family(P, 'prototype');
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

// ---- the Type 10 marks on the modern Type 10 (267, Main 2026-10-31: the Japan line's one base) ----------------------
// Positions below are hull-frame points; turret parts are placed in the turret frame through tl() (the base's pivot).
const T10_PIVOT = TYPE10_X_DATUMS.turretPivot;
const tl = (x: number, y: number, z: number): Vec3Tuple => [x - T10_PIVOT[0], y - T10_PIVOT[1], z - T10_PIVOT[2]];

/** The TK-X's trials rack behind the commander's sight (TRDI trial photographs, 267): an open tube frame on the rear roof
 *  carrying the recorder case, its junction box and a telemetry antenna. */
function addTkxTrialsFit(P: JapaneseBuilderPort): void {
  const { box, cylY } = KIT;
  const roof = 2.20, x0 = -1.04, z0 = -1.30;
  for (const [dx, dz] of [[-0.17, -0.20], [0.17, -0.20], [-0.17, 0.20], [0.17, 0.20]] as const)
    P.add('turretDetail', cylY(0.013, 0.013, 0.30, 8), ...tl(x0 + dx, roof + 0.15, z0 + dz));
  for (const dz of [-0.20, 0.20]) P.add('turretDetail', box(0.37, 0.022, 0.022), ...tl(x0, roof + 0.29, z0 + dz));
  for (const dx of [-0.17, 0.17]) P.add('turretDetail', box(0.022, 0.022, 0.43), ...tl(x0 + dx, roof + 0.29, z0));
  P.add('turretDetail', box(0.36, 0.022, 0.42), ...tl(x0, roof + 0.10, z0));
  P.add('turretDark', box(0.30, 0.15, 0.34), ...tl(x0, roof + 0.186, z0));         // recorder case on the shelf
  P.add('turretDetail', box(0.31, 0.012, 0.35), ...tl(x0, roof + 0.266, z0));
  P.add('turretDark', box(0.12, 0.08, 0.10), ...tl(x0 + 0.06, roof + 0.34, z0 - 0.10)); // junction box on the top rails
}

// ---- the TK-X as the trials vehicle (owner 2026-11-01: "the prototype can literally have a new turret or diff hull and
// things like that. different antennas, roof decorations, cutouts, armor"). On the modern Type 10's hull and running
// gear: blunt trial armour modules boxing in the cheek wedges, a bolted trial plate on the glacis, the side armour in
// six bolted panels with cutouts between them and no lower skirts, an instrumentation pod, GPS dome, cable runs and two
// telemetry masts on the roof for the production whips, and a ballast rack in place of the basket.

/** The trial armour modules: a flat-faced bolted box over each cheek wedge, squaring the turret's nose, and the trial plate
 *  bolted to the upper glacis. */
function addTkxTrialArmour(P: JapaneseBuilderPort & TankBuilderPort): void {
  const { box, cylZ, cylY } = KIT;
  const { xi, xo, z0, z1, y0, y1 } = TKX_TRIAL_MODULE;                    // its plates: type10MarkArmor.ts
  for (const side of [-1, 1]) {
    const xc = side * (xi + xo) / 2, w = xo - xi;
    P.add('turretDetail', box(w, y1 - y0, z1 - z0), ...tl(xc, (y0 + y1) / 2, (z0 + z1) / 2));
    // the front face's bolted frame and bolt rows, the seam where the module meets the turret, two lifting eyes on top
    for (const y of [y0 + 0.03, y1 - 0.03]) P.add('turretDetail', box(w - 0.02, 0.03, 0.02), ...tl(xc, y, z1 + 0.0105));
    for (const x of [xi + 0.025, xo - 0.025]) P.add('turretDetail', box(0.03, y1 - y0 - 0.09, 0.02), ...tl(side * x, (y0 + y1) / 2, z1 + 0.0105));
    for (let i = 0; i < 4; i++) for (const y of [y0 + 0.13, (y0 + y1) / 2, y1 - 0.13])
      P.add('turretDark', cylZ(0.016, 0.012, 8), ...tl(side * (xi + 0.14 + i * (w - 0.28) / 3), y, z1 + 0.007));
    P.add('turretDark', box(0.006, y1 - y0 - 0.02, 0.012), ...tl(side * (xo + 0.004), (y0 + y1) / 2, z0 + 0.03));
    for (const z of [z0 + 0.25, z1 - 0.25]) {
      const eye = new THREE.TorusGeometry(0.035, 0.009, 6, 12); eye.rotateY(Math.PI / 2);
      P.add('turretDetail', eye, ...tl(xc, y1 + 0.035, z));
    }
  }
  // the glacis trial plate (the glacis falls 1.370 -> 1.3065 from z 2.50 to 3.31), its bolt rows along both long edges
  const G = TKX_GLACIS_PLATE, rake = Math.atan2(1.370 - 1.3065, 3.3137 - 2.50), zc = (G.z0 + G.z1) / 2;
  const yc = tkxGlacisY(zc) + G.t / 2 + 0.001;
  P.addEquipment('hullDetail', box(G.halfW * 2, G.t, G.z1 - G.z0), 0, yc, zc, rake, 0, 0);
  for (let i = 0; i < 8; i++) for (const dz of [-0.27, 0.27])
    P.addEquipment('hullDark', cylY(0.017, 0.017, 0.012, 8), -0.66 + i * 0.19, yc + 0.026 - dz * Math.tan(rake), zc + dz, rake, 0, 0);
}

/** The trials instrumentation on the roof: the pod on the rear roof's right, the GPS dome, the cable runs and the two
 *  telemetry masts at the bustle's corners (each a mast on its foot with a disc antenna and a cross arm). */
function addTkxTrialsInstruments(P: JapaneseBuilderPort): void {
  const { box, cylY, cylX } = KIT;
  const podRoof = 2.202, px = 0.58, pz = -1.30;
  P.add('turretDetail', box(0.55, 0.30, 0.72), ...tl(px, podRoof + 0.151, pz));
  P.add('turretDark', box(0.50, 0.012, 0.66), ...tl(px, podRoof + 0.308, pz));                  // its lid seam
  for (const dz of [-0.22, 0.0, 0.22]) P.add('turretDark', box(0.006, 0.12, 0.14), ...tl(px + 0.2785, podRoof + 0.16, pz + dz)); // vents
  for (const dz of [-0.26, 0.26]) P.add('turretDark', cylX(0.012, 0.16, 8), ...tl(px, podRoof + 0.33, pz + dz)); // handles
  // the GPS dome on its base ring
  const domeRoof = 2.188, dx = 0.15, dz2 = -1.75;
  P.add('turretDetail', cylY(0.15, 0.15, 0.05, 24), ...tl(dx, domeRoof + 0.026, dz2));
  const dome = new THREE.SphereGeometry(0.14, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  P.add('turretDetail', dome, ...tl(dx, domeRoof + 0.052, dz2));
  // the two telemetry masts on the bustle's corners, a foot, a mast, a disc antenna and a cross arm
  for (const side of [-1, 1]) {
    const mx = side * 1.10, mroof = 2.186, mz = -1.90;
    P.add('turretDetail', cylY(0.07, 0.07, 0.10, 16), ...tl(mx, mroof + 0.051, mz));
    P.add('turretDark', cylY(0.024, 0.032, 1.30, 10), ...tl(mx, mroof + 0.10 + 0.651, mz));
    P.add('turretDark', cylY(0.11, 0.11, 0.03, 16), ...tl(mx, mroof + 1.40 + 0.016, mz));
    P.add('turretDark', box(0.36, 0.02, 0.02), ...tl(mx, mroof + 1.10, mz));
  }
  // cable runs from the pod to each mast's foot, laid on the roof
  for (const side of [-1, 1]) {
    const run = new THREE.CatmullRomCurve3([[px - side * 0.0 - 0.20, podRoof + 0.02, pz - 0.36], [side > 0 ? 0.9 : 0.1, 2.21, -1.60],
      [side * 1.10 - side * 0.09, 2.21, -1.90]].map(([x, y, z]) => new THREE.Vector3(...tl(x, y, z))));
    P.add('turretDark', new THREE.TubeGeometry(run, 20, 0.014, 6, false), 0, 0, 0);
  }
}

/** The ballast rack in the basket's place: a floor and low rails off the bustle carrying the trial ballast blocks. */
function addTkxBallastRack(P: JapaneseBuilderPort): void {
  const { box, cylY, cylX, cylZ } = KIT;
  const front = -2.018, rear = -2.66, floorY = 1.635, half = 1.02;
  P.add('turretDetail', box(half * 2, 0.03, front - rear), ...tl(0, floorY, (front + rear) / 2));
  for (const x of [-half, half]) for (const z of [rear + 0.02, front - 0.06]) P.add('turretDetail', cylY(0.016, 0.016, 0.30, 8), ...tl(x, floorY + 0.166, z));
  P.add('turretDetail', cylX(0.016, half * 2, 8), ...tl(0, floorY + 0.30, rear + 0.02));
  for (const x of [-half, half]) P.add('turretDetail', cylZ(0.016, front - rear - 0.08, 8), ...tl(x, floorY + 0.30, (front + rear) / 2 - 0.02));
  // the ballast: three blocks on the floor and two stacked on them, each with its lifting lug
  for (const [x, layer] of [[-0.62, 0], [0, 0], [0.62, 0], [-0.31, 1], [0.31, 1]] as const) {
    const y = floorY + 0.016 + 0.11 + layer * 0.221;
    P.add('turretDark', box(0.55, 0.22, 0.42), ...tl(x, y, (front + rear) / 2));
    P.add('turretDark', cylX(0.025, 0.12, 8), ...tl(x, y + 0.123, (front + rear) / 2));
  }
}

function buildType10TkX(P: JapaneseBuilderPort & TankBuilderPort): void {
  // the TK-X prototype as the trials vehicle: the base's prototype forms (plain side blocks, four round smoke ports, the
  // muzzle mirror on the left) without its basket, whips and rear mount, lower skirts or one-piece side fascia, and the
  // trial armour, instrumentation and ballast in their place
  buildType10X(P, { mark: 'prototype', basketStowage: false, basket: false, antennas: false, lowerSkirts: false, fascia: 'segmented' });
  addTkxTrialsFit(P);
  addTkxTrialArmour(P);
  addTkxTrialsInstruments(P);
  addTkxBallastRack(P);
}

/** The 10B's remote weapon station on the commander's ring (the 12.7 mm station in place of the manual mount), stacked face
 *  to face (the accessory receipt): the turntable on the ring, the pedestal and its top plate, the yoke's cheeks standing
 *  on it, the cradle between the cheeks carrying the M2 on its top, the ammunition can on the right cheek's outer face
 *  and the sight head on the left's. */
function addType10BRemoteStation(P: JapaneseBuilderPort & TankBuilderPort): void {
  const { box, cylX, cylY, cylZ } = KIT;
  const x = -0.3228, z = 0.496, ringTop = 2.405 + 0.0225, muzzleZ = 1.62;
  const tableTop = ringTop + 0.034, discTop = tableTop + 0.006, pedestalTop = 2.70, plateTop = pedestalTop + 0.035;
  const cheekIn = 0.117, cheekOut = 0.139, cheekTop = plateTop + 0.20;
  // the remote form's housing hangs under its receiver: the cradle's top meets the lowest point of the drawn gun
  const trunnionY = 2.80, boreY = 2.886;
  const gun = { cls: 'm2', x, boreY, pivotZ: z + 0.02, muzzleZ, feed: 'right' } as const;
  // (each face 1 mm off its neighbour: within the receipt's 15 mm touch, never coplanar)
  const cradleTop = libraryStationGunBounds(gun).min.y - 0.001, cradleH = cradleTop - (plateTop + 0.03);
  P.add('turretDetail', cylY(0.209, 0.209, 0.045, 32), ...tl(x, 2.405, z));              // the commander's ring
  const weapon = sourceMachineGun(P, T10_PIVOT, { name: 'type10bRemoteM2', caliberMm: 12.7,
    yaw: [x, ringTop, z], pivot: [x, trunnionY, z + 0.02], muzzle: [x, boreY, muzzleZ] });
  libraryStationGun(weapon, gun);
  weapon.add('turretDetail', box(cheekIn * 2 - 0.002, cradleH, 0.50), x, cradleTop - cradleH / 2, z + 0.05); // cradle between the cheeks
  for (const side of [-1, 1]) weapon.add('turretDark', cylX(0.02, 0.012, 12), x + side * (cheekOut + 0.006), trunnionY, z + 0.02);
  const canX = x - cheekOut - 0.065;
  weapon.add('turretAmmo', box(0.13, 0.205, 0.33), canX, cheekTop - 0.1025, z - 0.03);
  weapon.add('turretDark', box(0.13, 0.016, 0.31), canX, cheekTop + 0.008, z - 0.03);
  const sx = x + cheekOut + 0.075, sy = cheekTop - 0.10, sz = z + 0.10;
  weapon.add('turretDetail', box(0.15, 0.20, 0.30), sx, sy, sz);                          // the sight head
  weapon.add('turretDetail', box(0.16, 0.022, 0.32), sx, sy + 0.111, sz - 0.005);
  weapon.add('turretDark', box(0.13, 0.17, 0.012), sx, sy, sz + 0.156);
  weapon.add('turretGlass', cylZ(0.034, 0.008, 20), sx + 0.03, sy + 0.035, sz + 0.166);
  weapon.add('turretGlass', box(0.05, 0.05, 0.008), sx - 0.035, sy + 0.035, sz + 0.166);
  weapon.add('turretGlass', cylZ(0.016, 0.008, 14), sx, sy - 0.05, sz + 0.166);
  weapon.stage('yaw');
  weapon.add('turretDetail', cylY(0.19, 0.19, 0.034, 32), x, ringTop + 0.017, z);
  weapon.add('turretDark', cylY(0.17, 0.17, 0.006, 32), x, tableTop + 0.003, z);
  weapon.add('turretDetail', box(0.17, pedestalTop - discTop, 0.20), x, (pedestalTop + discTop) / 2, z - 0.01);
  weapon.add('turretDetail', box(0.30, plateTop - pedestalTop, 0.26), x, (plateTop + pedestalTop) / 2, z);
  for (const side of [-1, 1]) weapon.add('turretDetail', box(cheekOut - cheekIn, cheekTop - plateTop, 0.18),
    x + side * (cheekIn + cheekOut) / 2, (cheekTop + plateTop) / 2, z + 0.02);
  weapon.add('turretDark', box(0.10, 0.09, 0.08), x - 0.05, discTop + 0.045, z - 0.15);  // the traverse drive
  weapon.finish();
}

/** The 10B's active protection: a radar head at each turret corner looking out over its quarter (a broad flat panel of
 *  radiating tiles in its frame under a sun cap), and a launcher unit a side on the shelf over the side blocks: a pedestal
 *  and turntable carrying a box of four tubes raised outboard, their muzzles capped. Round 3 (the photo critic: "make the
 *  radar heads larger flat panels angled at each corner and the launchers clearly separate turreted units"). */
function addType10BActiveProtection(P: JapaneseBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  for (const side of [-1, 1]) {
    // the four heads stand on bracket blocks at the turret's corners, the front pair on the front blocks' shelves looking
    // forward and out, the rear pair on the bustle's roof corners looking aft and out: one crown of four panels over the
    // roof line (round 6: "raise all four panels to roof height at the corners"; the owner 2026-11-01: the 10B must read
    // apart from the Type 10 at a glance). The roof net is cut round them (ghillieFleetSuits.ts type10b).
    for (const [z, y, aft] of [[0.70, 2.03, false], [-1.55, 2.19, true]] as const) {
      const x = side * (aft ? 1.22 : 1.16), yaw = side * (aft ? Math.PI * 0.75 : Math.PI * 0.25);
      const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      const w = 0.40, h = 0.32, cy = y + 0.04 + h / 2 + 0.10;
      P.add('turretDetail', box(0.20, 0.02, 0.16), ...tl(x, y + 0.01, z), 0, yaw, 0);
      P.add('turretDetail', box(0.12, 0.118, 0.10), ...tl(x - fx * 0.02, y + 0.021 + 0.059, z - fz * 0.02), 0, yaw, 0);
      P.add('turretDetail', box(w, h, 0.07), ...tl(x, cy, z), 0, yaw, 0);
      P.add('turretDetail', box(w + 0.03, 0.022, 0.10), ...tl(x + fx * 0.016, cy + h / 2 + 0.012, z + fz * 0.016), 0, yaw, 0);
      const nu = 6, nv = 4;
      for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
        const u = (i - (nu - 1) / 2) * 0.056, v = (j - (nv - 1) / 2) * 0.062;
        P.add('turretDark', box(0.048, 0.052, 0.008), ...tl(x + fx * 0.0395 + rx * u, cy + v, z + fz * 0.0395 + rz * u), 0, yaw, 0);
      }
    }
    // the launcher unit: pedestal, turntable, the four-tube box raised 30 degrees outboard with its capped muzzles
    const lx = side * 1.20, ly = 2.07, lz = -0.55;
    // (round 5: "each stands like a tall chimney": the unit sits low on the shelf, its box raised 20 degrees)
    P.add('turretDetail', box(0.24, 0.04, 0.34), ...tl(lx, ly + 0.0, lz));
    P.add('turretDetail', cylY(0.14, 0.14, 0.04, 24), ...tl(lx, ly + 0.041, lz));
    const pitch = -Math.PI / 9, out = side * Math.PI / 2;
    const launcher = box(0.24, 0.16, 0.34); launcher.rotateX(pitch).rotateY(out);
    P.add('turretDetail', launcher, ...tl(lx, ly + 0.196, lz));       // its lowest edge 1 mm over the turntable
    for (const [du, dv] of [[-0.055, -0.038], [0.055, -0.038], [-0.055, 0.038], [0.055, 0.038]] as const) {
      const cap = cylZ(0.034, 0.012, 14);
      cap.translate(du, dv, 0.171).rotateX(pitch).rotateY(out);
      P.add('turretDark', cap, ...tl(lx, ly + 0.196, lz));
    }
  }
}

/** The 10B's reactive armour: a course of cassettes a side on the hull's upper skirt over the road wheels, and over the
 *  turret's side blocks, rear, middle and front, under the smoke dischargers' sloped face (seeded by type10b_skirt_era_*
 *  and type10b_turret_era_*, japan.ts). */
function addType10BReactiveArmor(P: JapaneseBuilderPort): void {
  const wall = TYPE10_X_SIDE_WALL;
  for (const side of [-1, 1]) {
    // (the owner 2026-11-01: the full skirt, eight a side, so the belt reads at distance)
    for (let i = 0; i < 8; i++) {
      const t = 0.13, x0 = 1.5745;                       // round 3: proud of the skirt ('10-15 cm of stand-off')
      // (round 5: "one thin belt about a third of the skirt's height": the cassettes cover the skirt's depth)
      seatedArmorCassette(P, 'hull', side * (x0 + t / 2), 0.985, 2.80 - i * 0.70, t, 0.42, 0.64, null,
        { axis: 'x', contactSide: -side, embed: 0.010, lid: true });
    }
    for (const z of [-1.62, -1.26, -0.96, -0.62, 0.45, 0.78, 1.10]) {
      const t = 0.14;
      seatedArmorCassette(P, 'turret', ...tl(side * (wall.x + t / 2), (wall.low + wall.high) / 2, z), t,
        wall.high - wall.low - 0.03, 0.31, null, { axis: 'x', contactSide: -side, embed: 0.010, lid: true });
    }
  }
}

/** The upgrade's add-on armour (owner 2026-11-01: "different ... armor"): a wedge module over each cheek, pointed forward
 *  from the cheek's full face to a narrow nose, its top falling to the nose, with bolt rows along its top. */
function addType10BWedges(P: JapaneseBuilderPort): void {
  const { box, cylY } = KIT, F = TYPE10B_WEDGE_FOOT;
  for (const side of [-1, 1]) {
    const xin = side > 0 ? F.xinR : F.xinL;                                     // the foot under the nose, beside the mantlet
    P.add('turretDetail', box(F.xo - xin, F.y1 - F.y0, F.z1 - F.z0), ...tl(side * (xin + F.xo) / 2, (F.y0 + F.y1) / 2, (F.z0 + F.z1) / 2));
    const g = sectionSolid(TYPE10B_WEDGE_ROWS.map(([z, xi, xo, lo, hi]) => {                 // its plates: type10MarkArmor.ts
      const ring: [number, number][] = [[xi, lo], [xo, lo], [xo, hi], [xi, hi]];
      return { z, ring: side < 0 ? ring.map(([x, y]) => [-x, y] as [number, number]).reverse() : ring };
    }));
    P.add('turretDetail', g, ...tl(0, 0, 0));
    for (let i = 0; i < 3; i++) for (const f of [0.25, 0.75]) {
      const z = 1.75 + i * 0.30, t = (z - 1.62) / (2.86 - 1.62);
      const xi = 0.49 + (0.84 - 0.49) * t, xo = 1.42 + (0.94 - 1.42) * t, top = 2.15 + (1.98 - 2.15) * t;
      P.add('turretDark', cylY(0.016, 0.016, 0.012, 8), ...tl(side * (xi + (xo - xi) * f), top + 0.004, z));
    }
  }
}

/** The armoured stowage box in the basket's place, its lid seams, hinges and latches, and the SATCOM dome on its lid. */
function addType10BBustleBox(P: JapaneseBuilderPort): void {
  const { box, cylY, cylX } = KIT;
  const front = -2.018, rear = -3.20, lo = 1.622, hi = 2.10, left = -1.326, right = 1.172;
  const xc = (left + right) / 2, zc = (front + rear) / 2;
  P.add('turretDetail', box(right - left, hi - lo, front - rear), ...tl(xc, (lo + hi) / 2, zc));
  for (const z of [-2.42, -2.82]) P.add('turretDark', box(right - left + 0.006, 0.012, 0.012), ...tl(xc, hi - 0.002, z)); // lid seams
  for (const x of [left + 0.3, xc, right - 0.3]) {
    P.add('turretDark', cylX(0.014, 0.10, 8), ...tl(x, hi - 0.01, front - 0.03));                                       // hinges
    P.add('turretDark', box(0.06, 0.08, 0.02), ...tl(x, hi - 0.06, rear - 0.011));                                      // latches
  }
  P.add('turretDetail', cylY(0.22, 0.22, 0.04, 28), ...tl(-0.60, hi + 0.021, -2.65));
  const dome = new THREE.SphereGeometry(0.20, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  P.add('turretDetail', dome, ...tl(-0.60, hi + 0.042, -2.65));
}

function buildType10B(P: JapaneseBuilderPort & TankBuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  // the later production Type 10: the base's production forms, its side blocks under the reactive armour, the basket
  // replaced by the upgrade's armoured stowage box (owner 2026-11-01: the 10B "need[s] to look a lot more unique")
  buildType10X(P, { remoteM2: false, stowageDoors: false, basket: false });
  addType10BRemoteStation(P);
  addType10BActiveProtection(P);
  addType10BReactiveArmor(P);
  addType10BWedges(P);
  addType10BBustleBox(P);
}

function buildType10Dozer(P: TankBuilderPort): void {
  // The modern Type 10 (profiles/type10X.ts, owner 2026-10-22) with the JGSDF dozer kit and its field kit: two remote
  // autocannon turrets in place of the 12.7 mm station, cages, appliqué, lamps and bins (profiles/type10DozerFieldKit.ts).
  // The blade rides stowed in battle and the Garage; spec.visual.dozerBlade = 'lowered' builds the presentation pose.
  buildType10X(P, { remoteM2: false, smoke: false });
  addType10DozerKit(P, P.spec.visual.dozerBlade === 'lowered' ? 'lowered' : 'stowed');
  addType10DozerFieldKit(P);
}

export const JAPAN_PROFILES = {
  stb1: { build: buildSTB1 },
  type90a: { build: buildType90A },
  type10b: { build: buildType10B },
  type10_tk_x: { build: buildType10TkX },
  type10_dozer: { build: buildType10Dozer },
  type90b: { build: buildType90B },
} satisfies VehicleProfileRecord;
