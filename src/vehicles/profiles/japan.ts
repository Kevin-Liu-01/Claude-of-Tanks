// First-party Japanese armored-family derivatives. The owner-supplied GLBs
// remain external silhouette/metric oracles: no source topology is imported.
// Each builder preserves its complete donor hull, skirts and single smart
// running-gear course, then adds source-specific supported armor/equipment.

import * as THREE from 'three';
import { KIT, FITTINGS, convexSlab } from './kit.ts';
import { buildType10BBase } from '../modern3.ts';
import { buildType90 } from './misc.ts';
import { TYPE10_MANTLET_FIT } from './type10GunSeat.ts';
import { addType10DozerKit } from './type10Dozer.ts';
import { addType10DozerFieldKit } from './type10DozerFieldKit.ts';
import { buildType10X } from './type10X.ts';
import { buildType74Family } from './type74Family.ts';
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
