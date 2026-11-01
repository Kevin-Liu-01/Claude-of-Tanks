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
import { sourceMachineGun } from './sourceMachineGun.ts';
import { libraryStationGun } from './libraryRoofMg.ts';
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
  P.add('turretDark', cylY(0.012, 0.012, 0.42, 8), ...tl(x0 - 0.12, roof + 0.50, z0 + 0.16));
  P.add('turretDetail', cylY(0.035, 0.035, 0.02, 12), ...tl(x0 - 0.12, roof + 0.715, z0 + 0.16));
}

function buildType10TkX(P: JapaneseBuilderPort & TankBuilderPort): void {
  // the TK-X prototype: the base's prototype forms (plain side blocks, four round smoke ports, the open basket fence,
  // the muzzle mirror on the left) and its trials fit
  buildType10X(P, { mark: 'prototype' });
  addTkxTrialsFit(P);
}

/** The 10B's remote weapon station on the commander's ring (the 12.7 mm station in place of the manual mount): turntable,
 *  pedestal and yoke over the ring, the cradle with the M2, its ammunition can on the gun's right and the sight head on
 *  its left. */
function addType10BRemoteStation(P: JapaneseBuilderPort & TankBuilderPort): void {
  const { box, cylX, cylY, cylZ } = KIT;
  const x = -0.3228, z = 0.496, ringY = 2.405 + 0.0225 + 0.017, trunnionY = 2.80, boreY = 2.838, muzzleZ = 1.62;
  P.add('turretDetail', cylY(0.209, 0.209, 0.045, 32), ...tl(x, 2.405, z));              // the commander's ring
  const weapon = sourceMachineGun(P, T10_PIVOT, { name: 'type10bRemoteM2', caliberMm: 12.7,
    yaw: [x, ringY, z], pivot: [x, trunnionY, z + 0.02], muzzle: [x, boreY, muzzleZ] });
  libraryStationGun(weapon, { cls: 'm2', x, boreY, pivotZ: z + 0.02, muzzleZ, feed: 'right' });
  weapon.add('turretDetail', box(0.19, 0.035, 0.62), x, trunnionY - 0.07, z + 0.06);
  for (const side of [-1, 1]) weapon.add('turretDetail', box(0.016, 0.11, 0.56), x + side * 0.098, trunnionY - 0.02, z + 0.05);
  weapon.add('turretDark', cylX(0.024, 0.30, 14), x, trunnionY, z + 0.02);
  weapon.add('turretAmmo', box(0.13, 0.205, 0.33), x - 0.20, trunnionY + 0.005, z - 0.03);
  weapon.add('turretDark', box(0.135, 0.018, 0.30), x - 0.20, trunnionY + 0.115, z - 0.03);
  weapon.add('turretDetail', box(0.10, 0.04, 0.08), x - 0.125, trunnionY + 0.07, z + 0.02);
  const sx = x + 0.205, sy = trunnionY + 0.03, sz = z + 0.10;
  weapon.add('turretDetail', box(0.15, 0.20, 0.30), sx, sy, sz);
  weapon.add('turretDetail', box(0.16, 0.022, 0.32), sx, sy + 0.111, sz - 0.005);
  weapon.add('turretDark', box(0.13, 0.17, 0.012), sx, sy, sz + 0.156);
  weapon.add('turretGlass', cylZ(0.034, 0.008, 20), sx + 0.03, sy + 0.035, sz + 0.164);
  weapon.add('turretGlass', box(0.05, 0.05, 0.008), sx - 0.035, sy + 0.035, sz + 0.164);
  weapon.add('turretGlass', cylZ(0.016, 0.008, 14), sx, sy - 0.05, sz + 0.164);
  weapon.add('turretDark', box(0.03, 0.12, 0.10), x + 0.115, trunnionY, z + 0.06);
  weapon.stage('yaw');
  weapon.add('turretDetail', cylY(0.19, 0.19, 0.034, 32), x, ringY, z);
  weapon.add('turretDark', cylY(0.196, 0.196, 0.008, 32), x, ringY + 0.017, z);
  const pedestalTop = trunnionY - 0.12;
  weapon.add('turretDetail', box(0.17, pedestalTop - ringY, 0.20), x, (pedestalTop + ringY) / 2, z - 0.01);
  weapon.add('turretDetail', box(0.23, 0.035, 0.24), x, pedestalTop, z);
  for (const side of [-1, 1]) weapon.add('turretDetail', box(0.022, 0.20, 0.18), x + side * 0.128, trunnionY - 0.03, z + 0.02);
  weapon.add('turretDark', box(0.10, 0.09, 0.08), x - 0.05, ringY + 0.075, z - 0.15);
  weapon.finish();
}

/** The 10B's active protection: a radar head at each turret corner looking out over its quarter, and a launcher a side on
 *  the shelf over the side blocks, its two tubes raised outboard. */
function addType10BActiveProtection(P: JapaneseBuilderPort): void {
  const { box, cylY, cylZ } = KIT;
  for (const side of [-1, 1]) {
    for (const [z, y, aft] of [[0.70, 2.07, false], [-1.55, 2.15, true]] as const) {
      const x = side * 1.16, yaw = side * (aft ? Math.PI * 0.75 : Math.PI * 0.25);
      P.add('turretDetail', cylY(0.03, 0.03, 0.12, 10), ...tl(x, y + 0.04, z));
      P.add('turretDetail', box(0.26, 0.21, 0.05), ...tl(x, y + 0.20, z), 0, yaw, 0);
      P.add('turretDark', box(0.22, 0.17, 0.008), ...tl(x + Math.sin(yaw) * 0.028, y + 0.20, z + Math.cos(yaw) * 0.028), 0, yaw, 0);
    }
    const lx = side * 1.20, ly = 2.07, lz = -0.55;
    P.add('turretDetail', box(0.20, 0.10, 0.30), ...tl(lx, ly + 0.03, lz));
    for (const dz of [-0.07, 0.07]) {
      const tube = cylZ(0.042, 0.26, 14);
      tube.rotateX(-0.55).rotateY(side * Math.PI / 2);
      P.add('turretDark', tube, ...tl(lx + side * 0.07, ly + 0.14, lz + dz));
    }
  }
}

/** The 10B's reactive armour: a course of cassettes a side on the hull's upper skirt over the road wheels, and over the
 *  turret's rear and middle side blocks (seeded by type10b_skirt_era_* and type10b_turret_era_*, japan.ts). */
function addType10BReactiveArmor(P: JapaneseBuilderPort): void {
  const wall = TYPE10_X_SIDE_WALL;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const t = 0.05, x0 = 1.5745;
      seatedArmorCassette(P, 'hull', side * (x0 + t / 2), 1.035, 2.80 - i * 0.70, t, 0.32, 0.64, null,
        { axis: 'x', contactSide: -side, embed: 0.010, lid: true });
    }
    for (const z of [-1.62, -1.26, -0.96, -0.62]) {
      const t = 0.07;
      seatedArmorCassette(P, 'turret', ...tl(side * (wall.x + t / 2), (wall.low + wall.high) / 2, z), t,
        wall.high - wall.low - 0.03, 0.31, null, { axis: 'x', contactSide: -side, embed: 0.010, lid: true });
    }
  }
}

function buildType10B(P: JapaneseBuilderPort & TankBuilderPort): void {
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  // the later production Type 10: the base's production forms, its side blocks under the reactive armour
  buildType10X(P, { remoteM2: false, stowageDoors: false });
  addType10BRemoteStation(P);
  addType10BActiveProtection(P);
  addType10BReactiveArmor(P);
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
