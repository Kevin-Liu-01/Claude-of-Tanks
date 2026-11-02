import type { SnapGroupOptions, TankBuilderPort } from '../tankFactoryCore.ts';
import { centurionFamilySteps, type CenturionMark } from './centurionFamily.ts';
import { weaponAssembly } from './weaponStock.ts';
// British family procedural profiles — FROM-SCRATCH rebuild (2026-07-31).
// Authored against the measured silhouette curves in
// docs/references/profiles/<id>.json (mask-trace polylines decoded to
// hull-centered world meters; the UK oracles sit z-shifted in the lab frame,
// which the per-view centroid alignment absorbs) plus the packets in
// docs/references/tanks/<id>.md. Hulls are lofted station slabs following
// the measured deck/belly polylines; turrets are authored from the
// whole-minus-hull band. Oracles: recovered chieftain3 / challenger1_mk2 /
// fv510 GLBs and the re-repaired m_bergman centurion / comet / charioteer /
// A30 prints (assembled turrets — the honest curves).
// challenger1_mk2 moved to profiles/challenger.ts (§5.75 family-module split) —
// that module imports this file's shared UK kit (export block at the tail).
import * as THREE from 'three';
import { KIT, FITTINGS, muzzleBore, orientedSlab } from './kit.ts';
import { cloneRehookedVehicleMaterial, rehookVehicleMaterial } from '../materials.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { drainTankBuild, steppedBuilder, type TankProfileBuild } from '../tankBuildCooperation.ts';

const {
  box, cylX, cylY, cylZ, torus,
  liftEye, periscope, headlight, pintleMG, smokeCluster,
  stowage, tarpRoll, spareTrackStrip,
} = KIT;
// §C.1 winding guard on slab. These direct aliases replace the former dynamic
// Proxy without changing any geometry calls and make the shared UK kit visible
// to TypeScript and bundlers.
const slab = orientedSlab;
const xform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x?: number,
  y?: number,
  z?: number,
  rotationX?: number,
  rotationY?: number,
  rotationZ?: number,
  scale?: number | readonly number[],
) => THREE.BufferGeometry;

type Vec3Tuple = readonly [number, number, number];
type NumericRow = readonly number[];
type ProfileCurve = readonly NumericRow[];

interface UKGeometryPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly q?: boolean;
  readonly spec: {
    readonly id: string;
    readonly visual: {
      readonly number?: string;
      bakeDirtDeckEq?: boolean;
    };
  };
  topY?: number;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  add(
    slot: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: number | readonly number[],
  ): void;
  addEquipment(
    slot: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: number | readonly number[],
  ): void;
  decal(
    owner: 'hull' | 'turret',
    kind: string,
    label: string | null,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
}

interface UKGunPort extends UKGeometryPort {
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface UKMaterialSet {
  readonly hull: THREE.MeshStandardMaterial;
  readonly barrel: THREE.MeshStandardMaterial;
  readonly detail: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshStandardMaterial;
  readonly canvasCloth: THREE.MeshStandardMaterial;
  readonly dark: THREE.MeshStandardMaterial;
  readonly wheels: THREE.MeshStandardMaterial;
  readonly rubber: THREE.MeshStandardMaterial;
  readonly trackL: THREE.MeshStandardMaterial;
  readonly trackR: THREE.MeshStandardMaterial;
  readonly spareTrack: THREE.MeshStandardMaterial;
  readonly shadow: THREE.MeshStandardMaterial;
}

interface UKMaterialPort extends UKGeometryPort {
  readonly mats: UKMaterialSet;
  readonly disposables: Array<{ dispose(): void }>;
}

export interface UKBuilderPort extends UKGunPort, UKMaterialPort {}

export interface UKBuilderPort {
  readonly recoilG: THREE.Group;
  readonly rng: () => number;
  muzzleZ: number;
  readonly gear?: {
    contactGeom?: {
      halfLenM: number;
      zCenterM: number;
      halfWidM: number;
      bottomYM: number;
      endRise?: { dzM: number; frontM: number; rearM: number };
    };
    trackHitbox?: Array<{
      x0: number;
      x1: number;
      poly: Array<[number, number]>;
    }>;
    roadWheelLayout?: {
      xc: number;
      wheelY: number;
      wheelR: number;
      wheelZs: number[];
    };
  } | null;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  clear(slots: readonly string[] | string, ...rest: string[]): void;
  clearDecals(owner?: 'hull' | 'turret'): void;
  offsetBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  scaleAllBuckets(x?: number, y?: number, z?: number): void;
  scaleBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  scaleDecals(scale: number): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  snapGroup(label: string, build: () => void, options?: SnapGroupOptions): void;
}

function applyCompleteVehicleScale(
  P: UKBuilderPort,
  vehicleScale: number,
  designFamily: string,
): void {
  // Bake primitive buckets while they are still unmerged, then transform the
  // already-instantiated fittings and smart running gear in the same frame.
  // Keeping the articulation owners at their authored scales means gameplay,
  // anatomy and metrology all continue to read actual metres rather than
  // having to infer a late render-parent transform.
  P.scaleAllBuckets(vehicleScale);
  P.scaleDecals(vehicleScale);
  const scaleAssembly = (object: THREE.Object3D): void => {
    object.position.multiplyScalar(vehicleScale);
    object.scale.multiplyScalar(vehicleScale);
  };
  for (const child of [...P.hullG.children]) scaleAssembly(child);
  for (const child of [...P.turretG.children]) {
    if (child !== P.gunG) scaleAssembly(child);
  }
  // Muzzle-bore furniture is deliberately a direct gun-rig child rather than
  // bucket geometry. Scale it without scaling recoilG, whose merged cannon
  // geometry has already been baked above.
  for (const child of [...P.gunG.children]) {
    if (child !== P.recoilG) scaleAssembly(child);
  }
  P.turretG.position.multiplyScalar(vehicleScale);
  P.gunG.position.multiplyScalar(vehicleScale);

  // Contact metadata is consumed outside the render hierarchy, so it must be
  // transformed into the same vehicle frame explicitly.
  if (P.gear?.contactGeom) {
    for (const key of ['halfLenM', 'zCenterM', 'halfWidM', 'bottomYM'] as const) {
      P.gear.contactGeom[key] *= vehicleScale;
    }
    if (P.gear.contactGeom.endRise) {
      for (const key of ['dzM', 'frontM', 'rearM'] as const) {
        P.gear.contactGeom.endRise[key] *= vehicleScale;
      }
    }
  }
  for (const lane of P.gear?.trackHitbox || []) {
    lane.x0 *= vehicleScale;
    lane.x1 *= vehicleScale;
    lane.poly = lane.poly.map(([z, y]) => [z * vehicleScale, y * vehicleScale]);
  }
  if (P.gear?.roadWheelLayout) {
    const layout = P.gear.roadWheelLayout;
    layout.xc *= vehicleScale;
    layout.wheelY *= vehicleScale;
    layout.wheelR *= vehicleScale;
    layout.wheelZs = layout.wheelZs.map((z) => z * vehicleScale);
  }
  P.muzzleZ *= vehicleScale;
  if (Number.isFinite(P.topY)) P.topY = (P.topY || 0) * vehicleScale;

  const receipt = Object.freeze({
    designFamily,
    vehicleScale,
    bakedBucketGeometry: true,
    directAssembliesScaled: true,
    ownerScalesPreserved: true,
    turretPivotScaled: true,
    gunPivotScaled: true,
    muzzleAnchorScaled: true,
    contactGeometryScaled: true,
    trackHitboxesScaled: true,
    roadWheelLayoutScaled: true,
  });
  P.hullG.userData.ukCompleteVehicleScaleReceipt = receipt;
  P.turretG.userData.ukCompleteVehicleScaleReceipt = receipt;
}

interface TrackWheel {
  readonly z: number;
  readonly y: number;
  readonly r: number;
}

interface UKHullOptions {
  readonly bodyHalfW: number;
  readonly noseRake: ProfileCurve;
  readonly tailRake: ProfileCurve;
  readonly deck: ProfileCurve;
  readonly nose: number;
  readonly belly: number;
  readonly beltTop: number;
  readonly trackXc: number;
  readonly trackW: number;
  readonly lowerHalfW?: number;
  readonly trackTop: number;
  readonly wheelR: number;
  readonly wheelZs: readonly number[];
  readonly sprocket: TrackWheel;
  readonly idler: TrackWheel;
  readonly rollers?: readonly TrackWheel[];
  readonly rakeHalfW?: number;
  readonly deckInset?: number;
  readonly deckSplit?: { readonly z: number; readonly inset: number };
  readonly deckCorridor?: { readonly x: number; readonly floor: number; readonly z0: number; readonly z1: number };
  readonly tailShelf?: { readonly z0: number; readonly z1: number; readonly yBot: number };
  readonly fenderY?: number;
  readonly fenderZ0: number;
  readonly fenderZ1: number;
  readonly fenderPlaneZ1?: number;
  readonly fenderHalfW?: number;
  readonly fenderHalfWL?: number;
  readonly fenderSegLen?: number;
  readonly skirt?: { readonly x: number; readonly top: number; readonly bot: number; readonly z0: number; readonly z1: number };
  readonly skirtPanels?: number;
  readonly skirtW?: number;
  readonly skirtHemSplit?: { readonly bot: number; readonly keepPanels: readonly number[] };
  readonly skirtTrimFlush?: boolean;
  /** Hang the skirt panels from the fender above them (P.hangMudguard; the Centurions' panels stop 4-10 cm short). */
  readonly skirtHang?: boolean;
  /** A hanger rail along the fender's outer edge carries panels that stand just outboard of it (Chieftain Mk 10). */
  readonly skirtRail?: boolean;
  readonly wheelW?: number;
  readonly wheelY?: number;
  readonly wheelStyle?: string;
  readonly coveredTop?: boolean;
  readonly arms?: boolean;
  readonly padHex?: number;
  readonly chainHex?: number;
  readonly gearFloor?: boolean;
  readonly contactZF?: number;
  readonly contactZR?: number;
  readonly noFlaps?: boolean;
  readonly flapDrop?: number;
  readonly numberR?: readonly number[];
  readonly numberL?: readonly number[];
  readonly numberSize?: number;
}

interface HullCorridor {
  readonly x: number;
  readonly floor: number;
  readonly z0: number;
  readonly z1: number;
}

interface UKToneOptions {
  readonly glass?: boolean;
  readonly glassHex?: number;
  readonly cloth?: number;
  readonly clothEnv?: number;
  readonly dark?: number;
  readonly padHex?: number;
  readonly padEnv?: number;
  readonly chainHex?: number;
  readonly chainEnv?: number;
  readonly bandMul?: readonly [number, number, number];
  readonly bandEnv?: number;
  readonly spareHex?: number;
  readonly tireEmissive?: number;
}

const buildRunningGear = KIT.buildRunningGear as (
  builder: UKGeometryPort,
  options: object,
) => void;
const buildGun = KIT.buildGun as (
  builder: UKGeometryPort,
  options: object,
) => void;

// ---------------------------------------------------------------------------
// Curve helpers (same discipline as the Abrams module: the deck/belly tables
// are the measured polylines, tilt-compensated ~0.05x(plate half width)).
// ---------------------------------------------------------------------------
function lineAt(pts: ProfileCurve, z: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [z0, y0] = pts[i], [z1, y1] = pts[i + 1];
    if ((z <= z0 && z >= z1) || (z >= z0 && z <= z1)) {
      return y0 + (y1 - y0) * ((z - z0) / ((z1 - z0) || 1));
    }
  }
  return (Math.abs(z - pts[0][0]) < Math.abs(z - pts[pts.length - 1][0]) ? pts[0] : pts[pts.length - 1])[1];
}

function loftBand(
  P: UKGeometryPort,
  bucket: string,
  halfW: number,
  inset: number,
  top: ProfileCurve,
  bottomAt: (z: number) => number,
  zA: number,
  zB: number,
  extraZ: readonly number[] = [],
): void {
  const zs = [...new Set([zA, zB, ...top.map((p) => p[0]), ...extraZ]
    .filter((z) => z >= Math.min(zA, zB) - 1e-6 && z <= Math.max(zA, zB) + 1e-6)
    .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a);
  for (let i = 0; i < zs.length - 1; i++) {
    const zf = zs[i], zr = zs[i + 1];
    const tf = lineAt(top, zf), tr = lineAt(top, zr);
    const bf = bottomAt(zf), br = bottomAt(zr);
    if (tf - bf < 0.015 && tr - br < 0.015) continue;
    P.add(bucket, slab(
      [-halfW, bf, zf], [halfW, bf, zf], [halfW, br, zr], [-halfW, br, zr],
      [-(halfW - inset), tf, zf], [halfW - inset, tf, zf],
      [halfW - inset, tr, zr], [-(halfW - inset), tr, zr]));
  }
}

// Opt-in closed-sponson variant of loftBand. The full inter-track body and
// exact original roof/outer side surface remain; only the concealed lower
// over-track volume is omitted above the moving native course.
function loftBandCorridor(
  P: UKGeometryPort,
  bucket: string,
  halfW: number,
  inset: number,
  top: ProfileCurve,
  bottomAt: (z: number) => number,
  zA: number,
  zB: number,
  corridor: HullCorridor,
  extraZ: readonly number[] = [],
): void {
  const lo = Math.min(corridor.z0, corridor.z1), hi = Math.max(corridor.z0, corridor.z1);
  const zs = [...new Set([zA, zB, lo, hi, ...top.map((p) => p[0]), ...extraZ]
    .filter((z) => z >= Math.min(zA, zB) - 1e-6 && z <= Math.max(zA, zB) + 1e-6)
    .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a);
  const topW = halfW - inset;
  for (let i = 0; i < zs.length - 1; i++) {
    const zf = zs[i], zr = zs[i + 1];
    const tf = lineAt(top, zf), tr = lineAt(top, zr);
    const bf = bottomAt(zf), br = bottomAt(zr);
    if (tf - bf < 0.015 && tr - br < 0.015) continue;
    const mid = (zf + zr) * 0.5;
    if (mid < lo - 1e-6 || mid > hi + 1e-6) {
      P.add(bucket, slab(
        [-halfW, bf, zf], [halfW, bf, zf], [halfW, br, zr], [-halfW, br, zr],
        [-topW, tf, zf], [topW, tf, zf], [topW, tr, zr], [-topW, tr, zr]));
      continue;
    }
    const X = corridor.x, F = corridor.floor;
    P.add(bucket, slab(
      [-X, bf, zf], [X, bf, zf], [X, br, zr], [-X, br, zr],
      [-X, tf, zf], [X, tf, zf], [X, tr, zr], [-X, tr, zr]));
    const widthAtFloor = (b: number, t: number): number => {
      const k = Math.min(1, Math.max(0, (F - b) / Math.max(1e-6, t - b)));
      return halfW + (topW - halfW) * k;
    };
    const wf = widthAtFloor(bf, tf), wr = widthAtFloor(br, tr);
    for (const side of [-1, 1]) {
      P.add(bucket, side > 0
        ? slab([X, F, zf], [wf, F, zf], [wr, F, zr], [X, F, zr],
          [X, tf, zf], [topW, tf, zf], [topW, tr, zr], [X, tr, zr])
        : slab([-wf, F, zf], [-X, F, zf], [-X, F, zr], [-wr, F, zr],
          [-topW, tf, zf], [-X, tf, zf], [-X, tr, zr], [-topW, tr, zr]));
    }
  }
}

// Generic UK hull: curve-lofted bow wedge + full band + stern wedge (+ rear
// shelf), fenders, optional skirts, running gear. All values world meters.
function* ukHullSteps(P: UKGeometryPort, g: UKHullOptions): TankProfileBuild {
  const bw = g.bodyHalfW;
  const bowZ = g.noseRake[0][0];
  const sternZ = g.tailRake[0][0];
  const innerW = g.lowerHalfW ?? (g.trackXc - g.trackW / 2 - 0.02);
  const ukHullHullStage1 = (): void => {
    P.add('hull', box(innerW * 2, g.beltTop - g.belly, (bowZ - sternZ) + 0.4),
      0, (g.beltTop + g.belly) / 2, (bowZ + sternZ) / 2);
  };
  const ukHullAssemblyStage1 = (): void => {
    ukHullHullStage1();
  };
  ukHullAssemblyStage1();
  yield 'ukHullAssemblyStage1';
  // TRACK CONTAINMENT (owner law 2026-08-03, GEOMETRY-GATE.md #4): the bow/
  // stern rake lofts must stay OUT of the track channel — g.rakeHalfW pins
  // the below-deck rake width to the inter-track span where the wrap arcs
  // and climbing runs live. Silhouettes are unchanged: the tracks own those
  // side/front columns by construction.
  const rakeW = g.rakeHalfW ?? bw * 0.96;
  const ukHullHullStage2 = (): void => {
    loftBand(P, 'hull', rakeW, 0.04, g.deck, (z) => lineAt(g.noseRake, z),
      g.nose, bowZ, g.noseRake.map((p) => p[0]));
    // g.deckSplit opt-in (uk 90-push, centurion r6): the REAR deck plateau
    // (1.75 line) is NARROW on the ref — its front-view tops at |x| 1.03..1.47
    // read the 1.64-1.66 engine-deck side plates, not the full-width loft top.
    // Split the full band at deckSplit.z: the rear part takes deckSplit.inset
    // so its top face narrows to the ref's raised center deck; side/plan
    // silhouettes are unchanged (any-x paints side; the belt/fenders own plan).
    // Default undefined -> single band, byte-identical.
    if (g.deckSplit) {
      if (g.deckCorridor) {
        loftBandCorridor(P, 'hull', bw, g.deckInset ?? 0.08, g.deck, () => g.beltTop,
          bowZ, g.deckSplit.z, g.deckCorridor);
        loftBandCorridor(P, 'hull', bw, g.deckSplit.inset, g.deck, () => g.beltTop,
          g.deckSplit.z, sternZ, g.deckCorridor);
      } else {
        loftBand(P, 'hull', bw, g.deckInset ?? 0.08, g.deck, () => g.beltTop,
          bowZ, g.deckSplit.z);
        loftBand(P, 'hull', bw, g.deckSplit.inset, g.deck, () => g.beltTop,
          g.deckSplit.z, sternZ);
      }
    } else {
      if (g.deckCorridor) {
        loftBandCorridor(P, 'hull', bw, g.deckInset ?? 0.08, g.deck, () => g.beltTop,
          bowZ, sternZ, g.deckCorridor);
      } else {
        loftBand(P, 'hull', bw, g.deckInset ?? 0.08, g.deck, () => g.beltTop, bowZ, sternZ);
      }
    }
    loftBand(P, 'hull', g.rakeHalfW ?? bw * 0.94, 0.04, g.deck, (z) => lineAt(g.tailRake, z),
      sternZ, g.tailRake[g.tailRake.length - 1][0], g.tailRake.map((p) => p[0]));
  };
  const ukHullAssemblyStage2 = (): void => {
    ukHullHullStage2();
  };
  ukHullAssemblyStage2();
  yield 'ukHullAssemblyStage2';
  const tailShelf = g.tailShelf;
  const ukHullHullStage3 = (): void => {
    if (tailShelf) {
      loftBand(P, 'hull', g.rakeHalfW ?? bw * 0.94, 0.04, g.deck, () => tailShelf.yBot, tailShelf.z0, tailShelf.z1);
    }
  };
  const ukHullAssemblyStage3 = (): void => {
    ukHullHullStage3();
  };
  ukHullAssemblyStage3();
  yield 'ukHullAssemblyStage3';
  // Fender plates over the tracks. Outer edge defaults to the track edge;
  // g.fenderHalfW/g.fenderHalfWL pin it (right/left) so the widest full-length
  // plane reads the published width without breaching the width guard.
  const addFenderSide = (side: number, planeZ1: number, fenderY: number): void => {
    const outer = side < 0
      ? (g.fenderHalfWL ?? g.fenderHalfW ?? (g.trackXc + g.trackW / 2 + 0.02))
      : (g.fenderHalfW ?? (g.trackXc + g.trackW / 2 + 0.02));
    const inner = g.trackXc - g.trackW * 0.55;
    // Segment long plates so every station slice receives a real end face.
    if (g.fenderSegLen) {
      const count = Math.ceil((planeZ1 - g.fenderZ0) / g.fenderSegLen);
      const depth = (planeZ1 - g.fenderZ0) / count;
      for (let index = 0; index < count; index++) {
        P.add('hullDetail', box(outer - inner, 0.035, depth),
          side * (inner + outer) / 2, fenderY,
          g.fenderZ0 + depth * (index + 0.5));
      }
    } else {
      P.add('hullDetail', box(outer - inner, 0.035, planeZ1 - g.fenderZ0),
        side * (inner + outer) / 2, fenderY, (g.fenderZ0 + planeZ1) / 2);
    }
    // Close the otherwise visible wedge between the plate and deck while
    // staying inside the fender's established silhouette.
    const fenderFloorY = fenderY - 0.004;
    const zKnots = [...new Set([g.fenderZ0, planeZ1,
      ...g.deck.map((point) => point[0])
        .filter((z) => z > g.fenderZ0 && z < planeZ1)]
      .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a);
    for (let index = 0; index < zKnots.length - 1; index++) {
      const frontZ = zKnots[index];
      const rearZ = zKnots[index + 1];
      const frontDeckY = Math.min(lineAt(g.deck, frontZ), fenderFloorY);
      const rearDeckY = Math.min(lineAt(g.deck, rearZ), fenderFloorY);
      if (fenderFloorY - frontDeckY < 0.02 && fenderFloorY - rearDeckY < 0.02) continue;
      const innerX = Math.min(side * inner, side * outer);
      const outerX = Math.max(side * inner, side * outer);
      P.add('hull', slab(
        [innerX, frontDeckY, frontZ], [outerX, frontDeckY, frontZ],
        [outerX, rearDeckY, rearZ], [innerX, rearDeckY, rearZ],
        [innerX, fenderFloorY, frontZ], [outerX, fenderFloorY, frontZ],
        [outerX, fenderFloorY, rearZ], [innerX, fenderFloorY, rearZ]));
    }
  };
  const ukHullHullStage4 = (): void => {
    if (!g.fenderY) return;
    // The flat plate may stop before the mud-flap anchor when a single raked
    // guard course owns the bow transition.
    const planeZ1 = g.fenderPlaneZ1 ?? g.fenderZ1;
    for (const side of [-1, 1]) addFenderSide(side, planeZ1, g.fenderY);
  };
  ukHullHullStage4();
  yield 'ukHullHullStage4';
  // Optional armored skirts (measured plane).
  const ukHullRunningGearStage1 = (): void => {
    if (g.skirt) {
      const sk = g.skirt;
      const panels = g.skirtPanels ?? 6;
      const panelD = (sk.z1 - sk.z0) / panels;
      // g.skirtW opt-in (challenger1_mk2 push-2): thin armour-sheet skirts — the
      // CR1 ref's plane face sits at 1.578, inside the 0.05-plate's §B4
      // clearance to the 1.527/1.535 pad/band envelope. Default 0.05 =
      // byte-identical for chieftain3/centurions/fv510.
      const skW = g.skirtW ?? 0.05;
      // g.skirtHemSplit opt-in (centurion5_2 tone round, r6 O1 "expose the
      // running gear"): per-panel hem split on the chieftain3 LEFT-HEM-PARITY
      // precedent — panels across the wheel span raise their hem to the ref's
      // own exposed-disc line while listed keepPanels retain the low sk.bot
      // course. Front/rear rows read the MIN bottom over all z (interval-mask
      // law, chieftain r5 bank #10), so one kept panel preserves every
      // ±skirt-column read; side bottoms are track-owned under the whole
      // span; station widths ride the skirt TOP band (y max), unchanged.
      // Default undefined -> byte-identical (chieftain3/centurion3/fv510).
      const hemBot = (k: number) => (g.skirtHemSplit && !g.skirtHemSplit.keepPanels.includes(k))
        ? g.skirtHemSplit.bot : sk.bot;
      for (const side of [-1, 1]) {
        for (let k = 0; k < panels; k++) {
          const z = sk.z1 - panelD / 2 - k * panelD;
          const b = hemBot(k);
          // owner 2026-10-19 (flaps sweep): g.skirtHang panels hang from the fender above them (mudguardHangers.ts): the
          // Centurions' and the Strv 81's stopped 4-10 cm short of it.
          const panel = box(skW, sk.top - b, panelD * 0.97);
          if (g.skirtHang) P.hangMudguard('uk-skirt-panel', 'hull', panel, side * (sk.x - skW / 2), (sk.top + b) / 2, z);
          else P.add('hull', panel, side * (sk.x - skW / 2), (sk.top + b) / 2, z);
          if (P.q) {
            // 2026-10-19 (owner float sweep): the 16 mm joint strip stood in the 26 mm gap between panels touching
            // neither (46 mm islands); 30 mm deep now, so it laps both panel edges.
            P.add('hullDark', box(skW, (sk.top - b) * 0.9, 0.030), side * (sk.x - skW * 0.4), (sk.top + b) / 2, z - panelD / 2);
            P.add('hullDetail', box(0.02, 0.05, 0.2), side * (sk.x + 0.005), sk.top - 0.1, z);
          }
        }
        // g.skirtTrimFlush opt-in (challenger1_mk2 push-2): the rubber trim strip
        // rode sk.top+0.02 (top face +0.0375 PROUD of the armour line) — on a
        // course-true 1.624 skirt it re-painted the fifteen mid side_hull
        // columns the top retune had just fixed. Flush mounts tuck it 0.008
        // under the top edge. Default = the original proud seat (byte-
        // identical for chieftain3/centurions/fv510).
        // 2026-10-19 (owner float sweep): the proud seat stood 2.5 mm over the panel tops (48 mm island); its foot
        // now sits 1.5 mm into them.
        P.add('hullDark', box(0.014, 0.035, sk.z1 - sk.z0 - 0.1), side * (sk.x - 0.01),
          sk.top + (g.skirtTrimFlush ? -0.0255 : 0.016), (sk.z0 + sk.z1) / 2);
        if (g.skirtRail && g.fenderY) {
          // 2026-10-19 (owner float sweep): the Mk 10 panels stood 15 mm outboard of (and 2.5 mm under) the 1.75
          // fender edge (16 mm islands); a hanger rail under that edge carries their tops.
          const fenderOuter = side < 0 ? (g.fenderHalfWL ?? g.fenderHalfW ?? 0) : (g.fenderHalfW ?? 0);
          const railX0 = fenderOuter - 0.004, railX1 = sk.x - skW + 0.008;
          P.add('hullDetail', box(railX1 - railX0, 0.04, sk.z1 - sk.z0 - 0.1), side * (railX0 + railX1) / 2,
            sk.top - 0.012, (sk.z0 + sk.z1) / 2);
        }
      }
    }
  };
  const ukHullAssemblyStage4 = (): void => {
    ukHullRunningGearStage1();
  };
  ukHullAssemblyStage4();
  yield 'ukHullAssemblyStage4';
  const ukHullRunningGearStage2 = (): void => {
    buildRunningGear(P, {
      // g.wheelW is an r4 opt-in (default = the original formula, byte
      // identical): chieftain3's pad band narrowed to the ref's measured
      // 1.0765..1.4845 ground columns, and the derived wheel width would have
      // gone skinny with it.
      style: g.wheelStyle ?? 'dished', wheelR: g.wheelR, wheelW: g.wheelW ?? Math.min(0.24, g.trackW * 0.42),
      wheelY: g.wheelY ?? g.wheelR + 0.05, xc: g.trackXc, wheelZs: g.wheelZs,
      sprocket: g.sprocket, idler: g.idler, rollers: g.rollers ?? [],
      trackW: g.trackW, topY: g.trackTop, paintedEnds: true,
      coveredTop: g.coveredTop ?? !!g.skirt, arms: g.arms ?? !g.skirt,
      // uk r5 opt-ins (merkava r12 gear-tone law): per-tank pad/chain/tire
      // tones + the ambient-floor re-attach (Material.clone drops the family
      // hook and the default near-black pads render ambient-dead in wheel-bay
      // shade — the chieftain3 'teeth zipper' read). All undefined for every
      // other caller — buildRunningGear defaults are byte-identical.
      padHex: g.padHex, chainHex: g.chainHex,
      gearFloor: g.gearFloor,
      // uk r6 opt-ins (centurion 90-push): ramp-pad corner floor + pinned
      // contact patch (both undefined for every other caller — byte-identical).
      contactZF: g.contactZF, contactZR: g.contactZR,
    });
    // Mud flaps hang from the FENDER TIPS (hanging them at the hull nose/tail
    // left them floating over the raked plates -> articulation floaters).
    // g.flapDrop is an r4 opt-in (default 0, byte identical): chieftain3's
    // front flap top read over the ref's bare 1.52 glacis-deck columns.
    for (const side of [-1, 1]) {
      if (!g.noFlaps && g.fenderY) {
        const fd = g.flapDrop ?? 0;
        P.add('hullRubber', box(g.trackW * 0.9, 0.26, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.10 - fd, g.fenderZ1 - 0.025, -0.06, 0, 0);
        P.add('hullRubber', box(g.trackW * 0.9, 0.24, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.09, g.fenderZ0 + 0.025, 0.06, 0, 0);
      }
    }
  };
  const ukHullAssemblyStage5 = (): void => {
    ukHullRunningGearStage2();
  };
  ukHullAssemblyStage5();
  yield 'ukHullAssemblyStage5';
  // Side number decals. Opt-in overrides (g.numberR/g.numberL/g.numberSize)
  // let a build pin them onto real side planes — the decal quad is mask
  // geometry, so a default position off the body's silhouette band costs
  // gate columns (chieftain3 vertex r3 finding). Defaults byte-identical.
  const numS = g.numberSize ?? 0.38;
  const numR: Vec3Tuple = g.numberR
    ? [g.numberR[0], g.numberR[1], g.numberR[2]]
    : [bw + 0.01, (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0];
  const numL: Vec3Tuple = g.numberL
    ? [g.numberL[0], g.numberL[1], g.numberL[2]]
    : [-(bw + 0.01), (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0];
  const ukHullMarkingsStage1 = (): void => {
    P.decal('hull', 'number', P.spec.visual.number || '', numS, numR, Math.PI / 2);
    P.decal('hull', 'number', P.spec.visual.number || '', numS, numL, -Math.PI / 2);
  };
  const ukHullMarkingsStage2 = (): void => {
    ukHullMarkingsStage1();
  };
  ukHullMarkingsStage2();
}
function ukHull(...args: Parameters<typeof ukHullSteps>): void {
  drainTankBuild(ukHullSteps(...args));
}

// ---------------------------------------------------------------------------
// Station-caps helper (vertex r3 finding): the gate's 14 station slices
// render FRONT-ON — an axis-aligned thin box paints only its END CAPS in a
// z-clipped slice, so a long plane vanishes from every mid slice and the
// measured station width collapses to whatever curved geometry remains.
// Split long planes into <=segLen chunks: same union silhouette, end caps
// land in every slice.
function segBoxZ(
  P: UKGeometryPort,
  bucket: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  segLen = 0.48,
): void {
  const n = Math.max(1, Math.ceil(d / segLen));
  const dz = d / n;
  for (let k = 0; k < n; k++) P.add(bucket, box(w, h, dz), x, y, z - d / 2 + dz * (k + 0.5));
}

// Shared UK tow cable on the glacis with clamp cleats; a caller may pass its own path and cleat height.
function towCableUK(
  P: UKGeometryPort,
  pts: readonly (readonly number[])[] = [[-1.0, 1.52, 2.2], [0, 1.62, 1.7], [1.0, 1.52, 2.2]],
  cleatY = 1.45,
): void {
  KIT.towCable(P, pts);
  P.add('hullDetail', box(0.1, 0.24, 0.14), -1.0, cleatY, 2.2);
  P.add('hullDetail', box(0.1, 0.24, 0.14), 1.0, cleatY, 2.2);
}

// ---------------------------------------------------------------------------
// UK TONE KIT (combined tone round 2026-08-05, challenger1_mk2 r7 O1a/O2/O4 +
// centurion5_2 r6 O2/O4 + centurion3 r6 Groups 1-2). Family recipe = the
// m47/m46 gearTone lineage (patton.ts r4-r7) in the UK olive family:
// per-instance material work only — createTankMaterials is per-build and the
// gate renders self-lit masks, so nothing here moves a curve or a mask.
// OPT-IN per build fn (§F.2).
// ---------------------------------------------------------------------------
function ukToneKit(P: UKMaterialPort, o: UKToneOptions = {}): void {
  // Material.clone() drops onBeforeCompile — re-attach the family ambient
  // floor (merkava r12 gearFloor law / leo r13b gearDarkLift pattern); a
  // registered material keeps its registration (2026-10-17, the wheel-band lane).
  const rehook = rehookVehicleMaterial;
  if (o.glass !== false) {
    // Blue-glass calm (patton C1 / m60 r4 lineage): the shared 'glass' lens
    // is a blue-grey MIRROR (0x2a3540, metalness 0.85) — under the PMREM sky
    // it fires saturated-blue chips (ch1 r7 O4c: 8 clusters b-r +12..+22;
    // c5 r6 O4b ×3; c3 r6 2b: 177 blue-signature px). Smoked dark-olive
    // glass instead: b-r <= 0, soft sheen at closeup.
    P.mats.glass.color.setHex(o.glassHex ?? 0x3d443c);
    P.mats.glass.roughness = 0.48;
    P.mats.glass.metalness = 0.38;
    P.mats.glass.envMapIntensity = 0.3;
  }
  if (o.cloth) {
    // Canvas family retone (ch1 O4a/b sand covers + plank; c5 O4a tan hood
    // rgb (64,65,47)/p95 89.7 -> ref (56,62,47)/p95 <= 73): darker g-dominant
    // olive canvas, env highlights capped. canvasCloth is per-instance and
    // not pattern-repainted — safe to mutate in place.
    P.mats.canvasCloth.color.setHex(o.cloth);
    P.mats.canvasCloth.envMapIntensity = o.clothEnv ?? 0.10;
  }
  if (o.dark) {
    // Dark-fittings hue (ch1 O4b): the shared 'dark' gunmetal is warm
    // (0x36342f, r > g by design) — the CR1 gun-root/collar masses read as
    // a flat warm-grey box family at 61-63L vs the ref's dark-olive 47
    // class. Olive-dark swap at the same darkness (MG PHYSICS polarity
    // unaffected). Per-instance.
    P.mats.dark.color.setHex(o.dark);
  }
  // Running-gear tones (the floor-setter class): buildRunningGear's pad/chain
  // clones default 0x171614/0x27251f with NO ambient hook (clone dropped it)
  // — they render ambient-dead in skirt shade (c3 1a: rear cols med 13.1
  // sub-30 10.4k; c5 O2 horn/pad p5 6.8; ch1 O2 wrap chevrons luma p5 4-7).
  // Retone by hex on this build's own subtree + rehook (abrams/leopard/m47
  // proven idiom); road-wheel discs + end-drum bodies swap onto olive clones
  // (ch1 O1a pale dished disc read; c5 O2b / c3 1c pale-disc-in-wrap kill).
  // (owner 2026-09-22 running-gear finish, runningGearFinish.ts: road-wheel discs, end-wheel bodies and tire rings
  // keep the hull's one scheme wheel paint and the fleet rubber; the former wheelTone/drumTone/ringMat clones left.)
  P.hullG.traverse((ob: THREE.Object3D) => {
    if (!(ob instanceof THREE.Mesh) && !(ob instanceof THREE.InstancedMesh)) return;
    const isInstanced = ob instanceof THREE.InstancedMesh;
    const m = ob.material;
    if (!m || !m.color || !m.color.getHex) return;
    if (isInstanced && m.color.getHex() === 0x171614) {
      rehook(m).color.setHex(o.padHex ?? 0x353928);      // shoe pads
      m.envMapIntensity = o.padEnv ?? 0.30;
    } else if (isInstanced && m.color.getHex() === 0x27251f) {
      rehook(m).color.setHex(o.chainHex ?? 0x3b402f);    // inner chain/horns
      m.envMapIntensity = o.chainEnv ?? 0.32;
    }
  });
  // Band material: linear multiplier over the shared band map (m60/m47
  // recipe, olive weights) — the serrated near-black run joins the ref's
  // muted-earth class.
  const bm = o.bandMul ?? [1.10, 1.15, 0.97];
  for (const tm of [P.mats.trackL, P.mats.trackR]) {
    tm.color.setRGB(bm[0], bm[1], bm[2]);
    tm.envMapIntensity = o.bandEnv ?? 0.12;
  }
  // Sprocket/idler teeth + recess rings + spare links: dark olive-iron (the
  // pale drawn bolt-ring bullseye class, c3 1c — ref's are occluded-dark).
  P.mats.spareTrack.color.setHex(o.spareHex ?? 0x2c2f24);
  // Shared rubber (mud-flap class only, r8 — the wheel-ring IMs moved onto
  // ringMat above): small emissive floor (merkava r12 tire law) so flap
  // panels in wrap shade never feed the sub-30 census.
  if (P.mats.rubber.emissive) P.mats.rubber.emissive.setHex(o.tireEmissive ?? 0x191d12);
}

// Render-only gear-air backers (c3 r6 order 1d "dark backer INSIDE the
// existing wrap silhouette, AABB unchanged" — shared with ch1 O1a's
// ambient-fill and c5 O2's black-window kill). Front/rear-view rays that
// slip the comb gaps around the end-wheel wraps and the return-run sag
// corridor exit the far side as background = counted air (c3: 9.3/9.7% vs
// ref 5.5/7.6). Thin dark-olive catch plates ⊥z inside the gear bay block
// those rays and read as shadowed gear interior. The meshes are NAMED
// /shadow/i so the gate mask pass, the evaluator analysis masks and the
// critic framing box all EXCLUDE them (§C shadow-proxy law, verified
// per-harness in the patton r6 round) — the gate line holds bit-identical.
// Placement stays clear of band/shoe/wheel voxels (track-clip-audit does
// NOT skip them): callers pass per-tank [w, h, d, x, y, z] boxes threaded
// between the ground ramp and the return-run sag envelope.
function ukGearAirBackers(
  P: UKMaterialPort,
  plates: readonly (readonly [number, number, number, number, number, number])[],
  hex = 0x20261c,
): void {
  const m = cloneRehookedVehicleMaterial(P.mats.shadow);
  m.color.setHex(hex);
  m.roughness = 0.97;
  m.metalness = 0.0;
  m.envMapIntensity = 0.14;
  P.disposables.push(m);
  for (const [w, h, d, x, y, z] of plates) {
    for (const side of [-1, 1]) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = 'gearAirShadowBacker';
      // This is an occlusion member of the native running-gear assembly,
      // not hull armour. Keep it auditable without pretending a track-bay
      // shadow plate is exterior structure.
      mesh.userData.runningGear = true;
      mesh.position.set(side * x, y, z);
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      P.hullG.add(mesh);
      P.disposables.push(geo);
    }
  }
}

// ---------------------------------------------------------------------------
// Centurion Mk 3 and Mk 5/2 (release 262): rebuilt from the historical references in profiles/centurionFamily.ts
// (docs/references/tanks/centurion3.md, centurion5_2.md). The Strv 81 (profiles/sweden.ts) builds through the same
// family; each takes the UK running-gear and cloth tones.
function* centurionUkSteps(P: TankBuilderPort, mark: CenturionMark): TankProfileBuild {
  yield* centurionFamilySteps(P, mark);
  const mk5 = mark !== 'mk3';
  ukToneKit(P, {
    cloth: mk5 ? 0x353c2b : 0x3e4532,
    glassHex: mk5 ? 0x353c35 : undefined,
    dark: mk5 ? 0x32352c : undefined,
    padHex: 0x272b20, padEnv: 0.18, chainHex: 0x2f3427, chainEnv: 0.22,
    bandMul: [0.92, 0.98, 0.82], bandEnv: 0.08,
  });
}
export function centurionBuild(P: TankBuilderPort, mark: CenturionMark): void {
  drainTankBuild(centurionUkSteps(P, mark));
}

// ---------------------------------------------------------------------------
// FV510 Warrior — recovered oracle (repaired: turret purified, mirrors keep
// the width bound). Tall ribbed troop hull (flank top ~2.06 rendered), long
// shallow glacis (1.83 -> 1.77 to the nose), compact square two-man turret
// at +0.5, thin RARDEN that never clears the nose.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// FV510 Warrior — PHOTO-CLASS full build (owner order 2026-08-06: "i really
// want the fv510 to be made actual"). Authored to the real vehicle's
// configuration at published dims (6.34 x 3.03 x 2.80, hull = overall; the
// RARDEN never clears the nose so gun-overhang masks stay empty by
// construction). The recovered print is certified -10.9% short (curve rows
// carry the cap until the parked §E warp lands) — dims/floaters/§B battery
// are the live measured targets; layout truth cross-checked against the
// print's shaded critic renders (driver front-LEFT, powerpack louvres
// front-RIGHT, exhaust cowl LEFT flank, turret forward of center, twin
// sight heads, ribbed flank strakes, bow slat, big rear power door).
// Width anchor (§D probe-frame law): the strake faces ARE the committed
// ±1.515 plane — nothing else reaches it. Length anchors: glacis/lower-bow
// crease plane at +3.17, rear door panel face at -3.17 (razor-solid faces).
// Height: sight-head top 2.795 is the p95 anchor; only the whips exceed
// 2.80 (<=4-column budget, aligned with the print's own mast spikes).
// ---------------------------------------------------------------------------
// s-mirrored slab: mirroring x on a slab() reverses the ring winding and
// FrontSide shaded renders cull it inside-out (§C missing-side class; masks
// are DoubleSide and hide the defect). Mirror + swap corner pairs restores
// outward winding on both sides.
function sslab(
  s: number,
  b0: Vec3Tuple,
  b1: Vec3Tuple,
  b2: Vec3Tuple,
  b3: Vec3Tuple,
  t0: Vec3Tuple,
  t1: Vec3Tuple,
  t2: Vec3Tuple,
  t3: Vec3Tuple,
): THREE.BufferGeometry {
  const m = ([x, y, z]: Vec3Tuple): Vec3Tuple => [s * x, y, z];
  return s >= 0
    ? slab(b0, b1, b2, b3, t0, t1, t2, t3)
    : slab(m(b1), m(b0), m(b3), m(b2), m(t1), m(t0), m(t3), m(t2));
}

// Hull top polyline from the first-party photo build. fv510PhotoBuild applies
// one final authored vertical section correction to this entire upper-hull
// bucket set; retaining the original section here keeps every glacis/roof
// transition colinear while matching the lower owner-source silhouette.
const FV_DECK = [
  // Owner closeout 2026-08-13: carry the roof break into one long Warrior
  // upper-glacis rake.  The former 2.82/2.00 knee left almost the complete
  // rise in the last 20 cm and read as a vertical nose below a flat shelf.
  // These four points retain the published bow/deck anchors while spreading
  // the same rise continuously rearward; no lower hull or running gear moves.
  [3.17, 1.32], [3.02, 1.50], [2.62, 1.76], [2.30, 2.01], [1.98, 1.95], [1.55, 2.05],
  [0.85, 1.93], [0.70, 2.05], [-2.95, 2.05], [-3.155, 2.03],
];
const fvBowY = (z: number): number => (z > 2.46 ? 0.55 + (z - 2.45) * 1.06 : 0.55);
const fvSternY = (z: number): number => (z < -2.46 ? 0.45 + (-z - 2.45) * 0.496454 : 0.45);
const fvSeg = (a: number, b: number, step = 0.45): number[] => {
  const out = [];
  for (let z = Math.max(a, b) - step; z > Math.min(a, b); z -= step) out.push(Number(z.toFixed(3)));
  return out;
};

function* fv510PhotoBuildSteps(P: UKBuilderPort): TankProfileBuild {
  const num = P.spec.visual.number || '';
  const upperHullScaleY = 0.765;
  // ---- lower body (inter-track ±0.93 — clear of the 0.945 track channel,
  // §B4; station-segmented) ----
  // Raised inner tub leaves real mechanical negative space behind the open
  // outer slats.  The former 0.45 m belly filled the entire wheel corridor
  // in orthographic side views and made the IFV read as a solid casemate.
  const fv510PhotoBuildHullStage1 = (): void => {
    segBoxZ(P, 'hull', 1.72, 0.66, 5.30, 0, 1.00, 0.10);
    // Twin lower longitudinal rails carry the floor at the real front/rear
    // hard points.  They preserve the two open service/suspension bays either
    // side of the narrow tub instead of recreating a full-width belly plate.
    // ---- full-width sponson band: sides rise to the deck line; the glacis
    // rake OWNS the band top from the break forward (§B1 slope-motivates —
    // flanks and roof meet the raked face on its own line) ----
    loftBand(P, 'hull', 1.15, 0.06, FV_DECK, () => 1.335, 2.30, -2.85,
      fvSeg(2.30, -2.85));
    // ---- center glacis + lower bow: one raked plate diving to the 1.04
    // crease at +3.17 (the length anchor), lower plate raking under to the
    // belly. ±0.93 keeps the diving plate clear of the sprocket wrap (§B4).
    loftBand(P, 'hull', 0.90, 0.02, FV_DECK, fvBowY, 3.02, 2.30, [2.82, 2.68, 2.46]);
    // glacis corner facets: the raked plane continues into the fender
    // shoulders (no box corner pokes past the rake — §B1)
    for (const s of [-1, 1]) {
      P.add('hull', sslab(s,
        [0.90, 1.27, 2.68], [1.44, 1.27, 2.68], [1.46, 1.27, 2.28], [0.90, 1.27, 2.28],
        [0.90, 1.3092, 2.68], [1.44, 1.335, 2.68], [1.46, 1.518, 2.28], [0.90, 1.518, 2.28]));
    }
    // ---- fender shelves over the sprockets (level 1.335 crowns; the wrap
    // arc crests 1.04 — containment). r2: rear widths meet the front-guard
    // plane (1.47 overlaps its 1.461 inner face) — the mirror arm + guard
    // otherwise enclose a 1-cell §B2 sky pocket at the shelf/guard slot ----
    for (const s of [-1, 1]) {
      for (const [zf, zr, xf, xr] of [[3.16, 2.92, 1.37, 1.47], [2.92, 2.66, 1.47, 1.47]]) {
        P.add('hull', sslab(s,
          [0.90, 1.285, zf], [xf, 1.285, zf], [xr, 1.285, zr], [0.90, 1.285, zr],
          [0.90, 1.335, zf], [xf, 1.335, zf], [xr, 1.335, zr], [0.90, 1.335, zr]));
      }
    }
    // ---- stern: lower plate rakes up to the 0.80 door sill ----
    loftBand(P, 'hull', 0.90, 0.02, [[-2.30, 1.335], [-2.90, 1.335]], fvSternY,
      -2.30, -2.90, [-2.7]);
    // ---- segmented WRAP side armour.  Six deep, chamfered applique modules
    // fill the Warrior flank behind the open rib screen.  The earlier recovery
    // used shallow rectangular cards; from the normal garage angle the rails
    // swallowed them and the vehicle still read as if its side skirts were
    // missing.  These are real closed armour volumes with inset backs, bevelled
    // edges and raised chevron stiffeners.  They remain hull-owned, stop above
    // the native linked-shoe corridor and never replace the complete sponson.
    for (const s of [-1, 1]) {
      for (let k = 0; k < 6; k++) {
        const z = 2.30 - 0.41 - k * 0.82;
        P.add('hull', sslab(s,
          [1.438, 0.75, z + 0.39], [1.438, 1.91, z + 0.39],
          [1.438, 1.91, z - 0.39], [1.438, 0.75, z - 0.39],
          [1.497, 0.80, z + 0.35], [1.497, 1.84, z + 0.35],
          [1.497, 1.84, z - 0.35], [1.497, 0.80, z - 0.35]));
        // A dark recessed perimeter separates the six modules at normal scale.
        for (const by of [0.815, 1.825]) {
          P.add('hullDark', box(0.012, 0.026, 0.66), s * 1.504, by, z);
        }
        for (const bz of [z - 0.365, z + 0.365]) {
          P.add('hullDark', box(0.012, 0.96, 0.024), s * 1.504, 1.32, bz);
        }
        // Paired diagonal armour ribs form the deep saw-tooth/chevron cadence
        // visible on the protected Warrior side package.  Each rib is planted
        // on the closed panel face; nothing is carried by the outer rail cage.
        P.add('hullDetail', box(0.030, 0.100, 0.68), s * 1.516, 1.47, z + 0.22,
          -0.46, 0, 0);
        P.add('hullDetail', box(0.030, 0.100, 0.68), s * 1.516, 1.47, z - 0.22,
          0.46, 0, 0);
        P.add('hullDetail', box(0.032, 0.14, 0.10), s * 1.517, 1.32, z);
        // Two broad transverse shoes carry each module back to the sponson.
        // They close the otherwise empty 0.29 m stand-off and remain well
        // above/inboard of the moving native course.
        P.add('hullDetail', box(0.30, 0.075, 0.14), s * 1.292, 1.76, z + 0.22);
        P.add('hullDetail', box(0.30, 0.075, 0.14), s * 1.292, 1.42, z - 0.22);
      }
      // Armoured lower drops bridge the module seams and produce the toothed
      // lower edge without intruding into a wheel face or linked shoe.
      for (const zw of [1.80, 0.90, 0.0, -0.90, -1.80]) {
        P.add('hull', sslab(s,
          [1.445, 0.66, zw + 0.11], [1.497, 0.66, zw + 0.11],
          [1.497, 0.66, zw - 0.11], [1.445, 0.66, zw - 0.11],
          [1.445, 0.88, zw + 0.24], [1.497, 0.88, zw + 0.24],
          [1.497, 0.88, zw - 0.24], [1.445, 0.88, zw - 0.24]));
      }
      // §B2 FENDER-SHELF CLOSURE (IFV see-through sweep §5.326): the 0.29 m
      // module stand-off (sponson wall 1.15 -> module backs 1.438) was open
      // from above between the transverse shoes — the top/tilt views read
      // ~280px ground-through slots per inter-shoe bay, both flanks (4157px
      // y0-top total). The real WRAP package sits on a continuous fender
      // shelf. One shelf plate per module span closes the corridor: inner
      // edge sunk 1 cm into the sponson band, outer edge buried in the module
      // bodies (1.438..1.497), top 1.83 under the deck line and the module
      // top edge; segmented at 0.41 m (station-slice law), z -2.62..2.30 —
      // the glacis corner facet (to 2.28) and rear shoulder bridge own the
      // corridor ends. Wheel daylight below the 0.75 module bottoms is
      // untouched (§B9).
      for (let k = 0; k < 12; k++) {
        const z0 = 2.30 - k * 0.41;
        P.add('hull', sslab(s,
          [1.14, 1.76, z0], [1.50, 1.76, z0],
          [1.50, 1.76, z0 - 0.41], [1.14, 1.76, z0 - 0.41],
          [1.14, 1.83, z0], [1.50, 1.83, z0],
          [1.50, 1.83, z0 - 0.41], [1.14, 1.83, z0 - 0.41]));
      }
      P.add('hullDark', box(0.014, 0.035, 0.46), s * 1.499, 1.325, 2.06);
      P.add('hullDark', box(0.014, 0.035, 0.46), s * 1.499, 1.325, -2.38);
      // front mudguard steps over the sprocket wrap (crest ~1.04)
      P.add('hull', box(0.048, 0.46, 0.36), s * 1.485, 1.11, 2.49);
      P.add('hull', box(0.048, 0.36, 0.32), s * 1.485, 1.16, 2.82);
      // rear guard stub over the raised idler wrap
      P.add('hull', box(0.048, 0.40, 0.34), s * 1.28, 1.14, -2.80);
      // The shortened native course leaves the real rear fender shoulder
      // visible. Bridge that shoulder back into the sponson at the hull roof
      // line: this is fixed hull structure, not a track-covering skirt, and it
      // stays a centimetre above the exact instanced-shoe envelope.
      P.add('hull', sslab(s,
        [0.90, 1.335, -2.52], [1.30, 1.335, -2.52], [1.30, 1.335, -2.93], [0.90, 1.335, -2.93],
        [0.90, 1.400, -2.52], [1.30, 1.400, -2.52], [1.30, 1.400, -2.93], [0.90, 1.400, -2.93]));
    }
  };
  fv510PhotoBuildHullStage1();
  yield 'fv510PhotoBuildHullStage1';
  // ---- WRAP appliqué strakes: the Warrior's ribbed flanks. Faces at the
  // committed ±1.515 width plane (THE §D anchor), segmented ≤0.46 so every
  // station slice catches end caps; rows never crest the deck line ----
  const fv510PhotoBuildHullStage2 = (): void => {
    for (const s of [-1, 1]) {
      for (const [ry, z0, z1] of [
        [0.84, -2.45, 2.26], [1.00, -2.45, 2.26],
        [1.16, -2.45, 2.26], [1.32, -2.55, 2.26],
      ]) {
        const n = Math.ceil((z1 - z0) / 0.46);
        const d = (z1 - z0) / n;
        for (let k = 0; k < n; k++) {
          P.add('hullDetail', box(0.045, 0.055, d - 0.012), s * 1.4925, ry, z0 + d * (k + 0.5));
        }
      }
      // Dense station ties make the exterior WRAP screen a supported cage
      // over the closed armour modules, rather than a few disconnected rails.
      for (const zs of [-2.42, -1.64, -0.82, 0, 0.82, 1.64, 2.25]) {
        P.add('hullDetail', box(0.04, 0.64, 0.05), s * 1.493, 1.16, zs);
      }
    }
    // ---- bow furniture (photo-parity r2 gap #5/#8: the owner's exercise
    // Warrior carries NO bow slat cage — cage deleted, §B7 photo governs;
    // the LOW bow now reads: convoy plate on the lower bow rake, guarded
    // light clusters seated low on the corner shelves, wing mirrors on
    // stalks INSIDE the ±1.515 strake anchor (the r2 width-breach class
    // stays dead: heads reach |x| 1.47 max) ----
    // convoy plate: pale square + dark frame lying ON the lower bow rake
    // 2026-10-19 (owner float sweep): the plate stood 16 mm proud of the rake; it is seated on it
    P.snapGroup('fv510-convoy-plate', () => {
      P.add('hullDark', box(0.34, 0.30, 0.018), 0, 0.79, 2.905, -0.688, 0, 0);
      P.add('hullDetail', box(0.30, 0.26, 0.020), 0, 0.79, 2.907, -0.688, 0, 0);
    }, { reachM: 0.04 });
    // wing mirrors: fender-shelf post -> cross arm -> angled head (contiguous;
    // heads ride at ~driver-plate height so they read against sky in 3/4
    // views like the photo — tops 1.99 stay far under the 2.80 height anchor)
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.024, 0.58, 0.024), s * 1.26, 1.62, 3.02);
      P.add('hullDark', box(0.026, 0.026, 0.30), s * 1.26, 1.90, 2.92, 0, 0, 0);
      P.add('hullDark', box(0.20, 0.024, 0.024), s * 1.335, 1.90, 3.02);
      P.add('hullDetail', box(0.17, 0.24, 0.022), s * 1.40, 1.83, 3.045, 0, s * 0.30, 0.06);
      P.add('hullDark', box(0.13, 0.19, 0.012), s * 1.40, 1.83, 3.057, 0, s * 0.30, 0.06);
    }
    // ---- driver station front-LEFT: flush hatch + periscope hood on the
    // plate break, twin scopes (real Warrior layout — print-confirmed) ----
    P.add('hullDetail', cylY(0.245, 0.245, 0.012, 16), -0.60, 1.938, 1.22);
    P.add('hull', cylY(0.215, 0.225, 0.045, 16), -0.60, 1.955, 1.22);
    P.add('hull', box(0.42, 0.075, 0.20), -0.60, 1.955, 1.56);
    P.add('hullDark', box(0.34, 0.032, 0.02), -0.60, 1.968, 1.665);
    periscope(P, 'hullDetail', -0.74, 1.985, 1.50);
    periscope(P, 'hullDetail', -0.47, 1.985, 1.50);
    // ---- powerpack bay front-RIGHT: recessed intake louvre bank in a raised
    // frame + outboard radiator strip + filler caps (§B3 grammar: blades in a
    // frame, not a floating shelf) ----
    P.add('hull', box(1.16, 0.05, 1.26), 0.66, 1.943, 1.00);
    for (let k = 0; k < 6; k++) {
      const z = 0.50 + k * 0.20;
      P.add('hullDark', box(1.02, 0.018, 0.115), 0.66, 1.962, z);
      P.add('hullDetail', box(1.06, 0.022, 0.06), 0.66, 1.978, z + 0.032, 0.42, 0, 0);
    }
    // 2026-10-19 (owner float sweep): outboard of the louvre frame the strip and its slats stood 38 mm over the
    // deck edge; they are seated on it
    P.snapGroup('fv510-radiator-strip', () => {
      P.add('hullDark', box(0.13, 0.02, 0.98), 1.355, 1.958, 0.98);
      for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.15, 0.024, 0.05), 1.355, 1.968, 0.62 + k * 0.24);
    }, { reachM: 0.06 });
    P.add('hullDetail', cylY(0.055, 0.055, 0.022, 10), 0.28, 1.945, 1.78);
    P.add('hullDetail', cylY(0.055, 0.055, 0.022, 10), 1.08, 1.945, 1.78);
    // splash rail V across the glacis mid + glacis panel seams (surface lines)
    P.add('hullDetail', box(0.82, 0.025, 0.035), -0.38, 1.845, 1.74, 0, -0.22, 0);
    P.add('hullDetail', box(0.82, 0.025, 0.035), 0.38, 1.845, 1.74, 0, 0.22, 0);
    P.add('hullDark', box(0.012, 0.012, 1.30), 0, 1.52, 2.30, -0.503, 0, 0);
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.012, 0.012, 1.05), s * 0.62, 1.60, 2.16, -0.503, 0, 0);
    }
    // ---- exhaust cowl LEFT flank (Warrior signature): louvred box proud of
    // the wall, top flush-crests the roofline; dark outlet ribs ----
    P.add('hull', box(0.26, 0.32, 0.94), -1.375, 1.90, 0.80);
    P.add('hullDark', box(0.22, 0.016, 0.86), -1.375, 2.062, 0.80);
    for (let k = 0; k < 4; k++) P.add('hullDark', box(0.02, 0.20, 0.15), -1.508, 1.90, 0.48 + k * 0.22);
    P.add('hullDetail', box(0.015, 0.26, 0.90), -1.502, 1.88, 0.80);
    // ---- troop-bay roof: the big rectangular hatch + periscope domes + GPS
    // pot; rear-right hull whip ----
    P.add('hullDark', box(1.26, 0.014, 1.02), 0, 2.052, -1.62);
    P.add('hull', box(1.18, 0.032, 0.94), 0, 2.062, -1.62);
    P.add('hullDetail', box(0.09, 0.05, 0.16), -0.50, 2.06, -1.15);
    P.add('hullDetail', box(0.09, 0.05, 0.16), 0.50, 2.06, -1.15);
    // 2026-10-21 (the turret's lower seat): the troop-bay periscope domes stand 25 mm lower; the turret's rear corners
    // sweep over them
    for (const s of [-1, 1]) P.add('hullDetail', cylY(0.07, 0.09, 0.035, 10), s * 1.05, 2.0675, -1.02);
    P.add('hullDetail', cylY(0.05, 0.06, 0.10, 8), 1.12, 2.10, -2.55);
    // ---- rear: power door (panel face at -3.17 = the length razor), vision
    // block, hinge stacks, corner bins with lid seams + latches, lower slat
    // rows on the stern rake, tow eyes, light clusters ----
    P.add('hull', box(0.86, 0.96, 0.028), -0.03, 1.32, -2.860);
    // Rear marker/camera shoe at the published hull datum.  It is carried by
    // a short transom bracket; the former high isolated rectangle preserved
    // length in masks but visibly floated above the vehicle in yaw evidence.
    P.add('hullDetail', box(0.05, 0.05, 0.28), 0.12, 1.72, -3.025);
  };
  fv510PhotoBuildHullStage2();
  yield 'fv510PhotoBuildHullStage2';
  const fv510PhotoBuildHullStage3 = (): void => {
    P.add('hullDark', box(0.20, 0.08, 0.012), 0.12, 1.72, -3.164);
    P.add('hullDark', box(0.05, 0.16, 0.014), -0.50, 1.30, -2.891);
    // 2026-10-19 (owner float sweep): the upper hinge block stood 16 mm off the raked rear plate; both run 20 mm deeper
    // forward into it (rear faces kept)
    for (const hy of [1.05, 1.68]) P.add('hullDetail', box(0.07, 0.12, 0.07), 0.60, hy, -2.88);
    for (const s of [-1, 1]) {
      // photo-parity r2 gap #6: BIG loaded rear corner bins — lid seam,
      // latches, cinch straps (a loaded vehicle, not parade-clean)
      P.add('hull', box(0.42, 0.46, 0.10), s * 1.10, 1.72, -2.89);
      P.add('hullDark', box(0.43, 0.014, 0.11), s * 1.10, 1.885, -2.89);
      P.add('hullDetail', box(0.06, 0.10, 0.02), s * 1.02, 1.66, -2.94);
      P.add('hullDark', box(0.05, 0.47, 0.115), s * (1.10 - 0.12), 1.725, -2.89);
      P.add('hullDark', box(0.05, 0.47, 0.115), s * (1.10 + 0.12), 1.725, -2.89);
      P.add('hullDetail', box(0.07, 0.12, 0.025), s * 1.10, 1.58, -2.92);
    }
    // door stencil plate + extra hinge blocks (rear face busy-ness)
    P.add('hullDetail', box(0.26, 0.16, 0.012), -0.30, 1.52, -2.892);
    P.add('hullDetail', box(0.07, 0.10, 0.05), 0.60, 1.38, -2.89);
    for (let k = 0; k < 3; k++) {
      P.add('hullDetail', box(1.72, 0.045, 0.05), 0, 0.55 + k * 0.13, -2.60 - k * 0.11);
    }
    P.add('hullDetail', box(0.05, 0.05, 0.34), -0.72, 0.66, -2.75, 0.50, 0, 0);
    P.add('hullDetail', box(0.05, 0.05, 0.34), 0.72, 0.66, -2.75, 0.50, 0, 0);
    liftEye(P, 'hullDetail', -0.58, 0.78, -2.82, 2.8);
    liftEye(P, 'hullDetail', 0.58, 0.78, -2.82, -2.8);
    // bow tow shackles on the lower plate
    for (const s of [-1, 1]) {
      // 2026-10-19 (owner float sweep): the shackle block stood 44 mm off the lower plate; it is seated on it
      P.snapGroup('fv510-bow-shackle', () => {
        P.add('hullDetail', box(0.12, 0.10, 0.14), s * 0.55, 0.80, 2.86);
        P.add('hullDark', torus(0.055, 0.016, 10), s * 0.55, 0.78, 2.945, Math.PI / 2, 0, 0);
      }, { reachM: 0.06 });
    }
    // mud flaps at the fender shelf tips
    for (const s of [-1, 1]) {
      P.hangMudguard('fv510-front-flap', 'hullRubber', box(0.36, 0.27, 0.028), s * 1.155, 1.145, 3.148, -0.05, 0, 0);
      P.add('hullRubber', box(0.36, 0.25, 0.028), s * 1.155, 1.10, -2.78, 0.05, 0, 0);
    }
    // ---- KIT fittings (§I census): headlight clusters in guards, rear
    // lights, tow cable, jerry cans, left-flank CES basket, hull whip ----
    for (const s of [-1, 1]) {
      // photo-parity r2 gap #5: lights sit LOW on the bow corners in a
      // chunky wrap-over brush-guard frame (not bare pods on the shelf top)
      P.add('hullDetail', box(0.30, 0.045, 0.16), s * 1.14, 1.36, 3.02);
      const hl = FITTINGS.lightCluster({ nightKind: 'headlight', mats: P.mats, pods: 2, spacing: 0.15, r: 0.05, rake: -0.55, seed: 3 + s });
      hl.position.set(s * 1.14, 1.425, 3.03);
      P.hullG.add(hl);
      P.add('hullDark', box(0.022, 0.115, 0.17), s * 1.14 - 0.155, 1.44, 3.03);
      P.add('hullDark', box(0.022, 0.115, 0.17), s * 1.14 + 0.155, 1.44, 3.03);
      P.add('hullDark', box(0.335, 0.022, 0.17), s * 1.14, 1.505, 3.03);
      const rl = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.12, r: 0.04, rake: 0, lens: 'dark', seed: 5 + s, rotation: [0, Math.PI, 0] });
      rl.position.set(s * 1.22, 1.10, -2.89);
      rl.scale.setScalar(0.65);
      P.hullG.add(rl);
    }
  };
  fv510PhotoBuildHullStage3();
  yield 'fv510PhotoBuildHullStage3';
  // tow cable re-draped (photo-parity r2 gap #6: the colinear r1 route read
  // as a straight pipe — x/y weave gives the rope read)
  const tc = FITTINGS.towCable({
    mats: P.mats, seed: 9,
    // (release 240, the owner: "make sure all tank turrets are clear of hulls": the run starts 0.2 m aft, its eye out of
    // the sweep of the turret's side, 1.768 and 1.62 m off the ring's axis, which grazed it)
    pts: [[1.30, 2.075, -0.62], [1.22, 2.062, -1.05], [1.30, 2.068, -1.55], [1.23, 2.060, -2.05]],
  });
  const fv510PhotoBuildAssemblyStage1 = (): void => {
    // 2026-10-19 (owner float sweep): the coiled run lay 68 mm outboard of the roof edge; it is seated on the hull
    P.snapGroup('fv510-tow-cable', () => P.hullG.add(tc), { reachM: 0.09 });
  };
  fv510PhotoBuildAssemblyStage1();
  yield 'fv510PhotoBuildAssemblyStage1';
  // Keep the troop-roof and rear flanks mechanically clean. Earlier rounds
  // filled this entire zone with exercise-day jerry cans, bergens and two
  // opaque CES baskets. That optional load visually merged with the WRAP
  // armour and made the authored Warrior read as a much taller, solid-sided
  // conversion. The reference vehicle's defining silhouette is the hull,
  // open rib course and rear door; small field loads belong in a cosmetic
  // preset, not in the base playable geometry.
  // The reference vehicle's roof whips sit inside the compact Warrior
  // combat-height envelope.  The former 1.15 m procedural whip made the
  // vehicle read almost a metre too tall in every whole-vehicle measure.
  // Keep the authored fitting and its hull-owned collar, but use the
  // stowed/short field cadence visible on the reference vehicle.
  const hw = FITTINGS.antennaWhip({ mats: P.mats, h: 1.46, r: 0.010, rake: 0.0, seed: 4 });
  const fv510PhotoBuildAssemblyStage2 = (): void => {
    hw.position.set(-1.26, 2.05, -2.83);
    P.hullG.add(hw);
  };
  fv510PhotoBuildAssemblyStage2();
  yield 'fv510PhotoBuildAssemblyStage2';
  const stl = FITTINGS.spareTrackLinks({ mats: P.mats, seed: 6, rotation: [0.539, 0, 0] });
  // Authored before the final 0.765 vertical / 1.10 presentation scaling;
  // this pre-transform seat becomes a 41 mm carrier embed on the glacis.
  const fv510PhotoBuildAssemblyStage3 = (): void => {
    stl.position.set(-0.52, 2.058, 2.319);
    P.hullG.add(stl);
  };
  fv510PhotoBuildAssemblyStage3();
  yield 'fv510PhotoBuildAssemblyStage3';
  // Snapshot authored fitting groups before the native running gear is
  // appended. They receive the same section correction as the bucket-built
  // armor, while the animated wheel/link course keeps its measured diameter
  // and ground contact.
  const upperHullFittings = [...P.hullG.children];
  // ---- running gear: 6 roadwheels, FRONT drive sprocket, raised rear
  // idler — §B6 trapezoid by construction; band inboard so the committed
  // skirt/strake plane clears the dilated shoe surface (§B4) ----
  const fv510PhotoBuildRunningGearStage1 = (): void => {
    // owner 2026-09-22 ("fv510 warrior, warrior milan … wheels too big that go top from bottom but
    // overlap each other when road wheels should be used"): r 0.42 on the 0.76 pitch overlapped by
    // 8 cm and the 0.37/0.35 end drums sat 21 cm inside the outer road wheels. The Warrior rides
    // six ~620 mm wheels (the warrior_tes_h source measures r 0.2991; 2R/pitch 0.82, a 14 cm gap)
    // under a return run carried by three return rollers, as the measured X course records — the
    // wheels no longer span the belt from the loaded run to the upper run.
    buildRunningGear(P, {
      style: 'rubber', wheelR: 0.31, wheelW: 0.30, wheelY: 0.37, xc: 1.16,
      // One six-station smart course, spread evenly between full-size end
      // drums.  The previous 0.25/0.28 m terminals were tucked beside the
      // first/last road wheels, so the links read as a flat under-hull belt
      // with neither an approach nor a departure wrap.  These stations retain
      // every road wheel and every protected skirt above them while restoring
      // the Warrior's long, visibly trapezoidal course.
      wheelZs: [1.92, 1.16, 0.40, -0.40, -1.16, -1.92],
      sprocket: { z: 2.50, y: 0.64, r: 0.30 },
      idler: { z: -2.50, y: 0.62, r: 0.28 },
      rollers: [{ z: -1.45, y: 0.90, r: 0.10 }, { z: 0, y: 0.85, r: 0.15 }, { z: 1.45, y: 0.90, r: 0.10 }],
      trackW: 0.46, trackTh: 0.055, shoeRadialScale: 0.72,
      topY: 1.06, botY: 0.055, deadSag: 0.055,
      contactZF: 2.12, contactZR: -2.12,
      coveredTop: true, arms: false, paintedEnds: true,
      // warm-olive pads + ambient floor (merkava r12 gear-tone law; the
      // default near-black band read ambient-dead behind the skirts)
      padHex: 0x333429, chainHex: 0x2b2c24, gearFloor: true,
    });
    // side numbers on the band wall above the strakes (inside ±1.515)
    P.decal('hull', 'number', num, 0.30, [1.462, 1.80, -1.60], Math.PI / 2);
    P.decal('hull', 'number', num, 0.30, [-1.462, 1.80, -1.60], -Math.PI / 2);

    // ================= TURRET: two-man welded steel box, forward of center.
    // uk round 2026-08-07 ("look more like its actual tank"): the community
    // fv510_warrior.glb (local vertex probe — the id stays UNREGISTERED,
    // FALSE-0 law) reads its above-deck mass centered x ≈ -0.10 with the
    // turret band at z +0.3..+0.9 — ring re-seated -0.20 -> -0.10 (the r2
    // owner-photo LEFT-of-center read stands, milder), z +0.55 confirmed.
    // Raked face plate with symmetric cheek returns (§B1.1); everything
    // below lives in turret buckets (§B5 — it all yaws) =========
    P.turretG.position.set(0.125, 2.02, 0.55);
    P.gunG.position.set(0.05, 0.285, 0.55);
    // ring race + hull splash collar
    // 2026-10-21 (the turret's lower seat, below): the race sits 5 mm shallower. The turret buckets move 0.25 m aft of
    // the yaw axis (offsetBuckets below), so the race swings out to 1.13 m (vehicle scale) as the turret turns, over
    // the deck's side edge: it clears it by 8 mm.
    P.add('turret', cylY(0.74, 0.78, 0.155, 20), 0, -0.0575, 0);
    P.add('hull', cylY(0.80, 0.82, 0.055, 20), 0.125, 1.958, 0.55);
    // Main welded crew cell, raked face and tapered rear shoulder. These coarse
    // authored sections deliberately remain independent of the oracle mesh.
    P.add('turret', slab(
      [-0.78, -0.14, 0.42], [0.78, -0.14, 0.42], [0.88, -0.14, -0.10], [-0.88, -0.14, -0.10],
      [-0.74, 0.42, 0.38], [0.74, 0.42, 0.38], [0.84, 0.50, -0.10], [-0.84, 0.50, -0.10]));
    P.add('turret', slab(
      [-0.88, -0.14, -0.10], [0.88, -0.14, -0.10], [0.78, -0.14, -0.62], [-0.78, -0.14, -0.62],
      [-0.84, 0.50, -0.10], [0.84, 0.50, -0.10], [0.74, 0.56, -0.60], [-0.74, 0.56, -0.60]));
    P.add('turret', slab(
      [-0.66, -0.06, 0.78], [0.66, -0.06, 0.78], [0.78, -0.14, 0.44], [-0.78, -0.14, 0.44],
      [-0.52, 0.30, 0.52], [0.52, 0.30, 0.52], [0.74, 0.42, 0.36], [-0.74, 0.42, 0.36]));
    P.add('turret', slab(
      [-0.80, 0.44, 0.37], [0.80, 0.44, 0.37], [0.75, 0.44, -0.61], [-0.75, 0.44, -0.61],
      [-0.76, 0.462, 0.33], [0.76, 0.462, 0.33], [0.71, 0.462, -0.57], [-0.71, 0.462, -0.57]));
    P.add('turret', slab(
      [-0.82, -0.14, -0.60], [0.82, -0.14, -0.60], [0.72, -0.10, -1.42], [-0.72, -0.10, -1.42],
      [-0.81, 0.55, -0.60], [0.81, 0.55, -0.60], [0.71, 0.36, -1.40], [-0.71, 0.36, -1.40]));
    P.add('turret', slab(
      [-0.76, 0.34, -0.62], [0.76, 0.34, -0.62], [0.61, 0.30, -1.36], [-0.61, 0.30, -1.36],
      [-0.75, 0.62, -0.62], [0.75, 0.62, -0.62], [0.60, 0.54, -1.36], [-0.60, 0.54, -1.36]));
    // ---- gun mount: dark vertical slot recess ON the raked face, cast
    // collar — §B3.1: cylinders and cast shapes only, no prisms on the run.
    // 227 gun-gaps r4: the slot, its cheeks, lintel and lower cradle block (and
    // the coax port beside them, below) are centred on the RARDEN (gunG x 0.05).
    // The 2026-08-12 restore moved the gun 0.15 m right of the -0.10 slot it had
    // shared, so the gun's root sleeve ran into the right cheek casting instead
    // of entering the slot between them.
    const slotX = P.gunG.position.x;
    P.add('turretDark', box(0.40, 0.34, 0.025), slotX, 0.30, 0.505, -0.651, 0, 0);
    // uk round 2026-08-07 (owner identity list): the RARDEN's DISTINCTIVE
    // MANTLET CHEEKS — the paired angular castings flanking the mount slot
    // on the real Warrior face, riding ON the raked plane (§B1.1: detail on
    // the plane, never replacing it) + the lintel over the slot.
    P.add('turret', box(0.15, 0.30, 0.075), slotX - 0.235, 0.295, 0.515, -0.651, 0, 0); // left cheek casting
    P.add('turret', box(0.15, 0.30, 0.075), slotX + 0.235, 0.295, 0.515, -0.651, 0, 0); // right cheek casting
    P.add('turret', box(0.44, 0.09, 0.065), slotX, 0.475, 0.425, -0.651, 0, 0);  // mantlet lintel
    P.add('turretDark', box(0.13, 0.02, 0.078), slotX - 0.235, 0.30, 0.517, -0.651, 0, 0); // cheek bolt seams
    P.add('turretDark', box(0.13, 0.02, 0.078), slotX + 0.235, 0.30, 0.517, -0.651, 0, 0);
    P.add('turret', box(0.44, 0.22, 0.65), slotX, 0.10, 0.75, -0.18, 0, 0);
    // ---- twin sight heads: BGTI hood (the 2.795 height anchor) + commander
    // day sight; hooded visors + glass slits (§B3 tells) ----
    P.add('turret', box(0.44, 0.36, 0.18), -0.26, 0.64, -1.40);
    P.add('turretDark', box(0.38, 0.10, 0.024), -0.26, 0.72, -1.304);
    P.add('turretGlass', box(0.30, 0.05, 0.012), -0.26, 0.685, -1.298);
    P.add('turretDark', box(0.02, 0.10, 0.02), -0.44, 0.72, -1.34, 0, 0, 0.3);
    // RAVEN commander acquisition head: keep the original station, but give
    // it the readable protected day/thermal + laser channels visible on the
    // service vehicle instead of a single tiny slit.  The broad tapered pot
    // overlaps the cupola roof; every optic face remains turret-owned.
    P.add('turret', cylY(0.13, 0.155, 0.16, 12), 0.30, 0.54, -0.345);
    P.add('turret', box(0.28, 0.15, 0.20), 0.30, 0.675, -0.345);
    P.add('turretDark', box(0.24, 0.075, 0.022), 0.30, 0.690, -0.238);
    P.add('turretGlass', box(0.075, 0.040, 0.012), 0.245, 0.682, -0.225);
    P.add('turretGlass', box(0.075, 0.040, 0.012), 0.355, 0.682, -0.225);
    P.add('turretDetail', box(0.32, 0.025, 0.22), 0.30, 0.758, -0.345);
    // Protected IR searchlight beside the RARDEN root.  A broad cheek shoe,
    // two guard returns and the rear housing keep the lens mechanically
    // seated; the cylinder points forward along the gun axis.
    P.add('turretDetail', box(0.26, 0.035, 0.18), -0.52, 0.42, 0.34, -0.24, 0, 0);
    P.add('turretDark', cylZ(0.075, 0.13, 16, 0.083), -0.52, 0.45, 0.455, -0.12, 0, 0);
  };
  fv510PhotoBuildRunningGearStage1();
  yield 'fv510PhotoBuildRunningGearStage1';
  const fv510PhotoBuildTurretStage1 = (): void => {
    P.add('turretGlass', cylZ(0.052, 0.012, 16), -0.52, 0.46, 0.528, -0.12, 0, 0);
    P.add('turretDetail', box(0.20, 0.020, 0.16), -0.52, 0.545, 0.455, -0.12, 0, 0);
    P.add('turretDetail', box(0.020, 0.18, 0.16), -0.63, 0.455, 0.455, -0.12, 0, 0);
    P.add('turretDetail', box(0.020, 0.18, 0.16), -0.41, 0.455, 0.455, -0.12, 0, 0);
    // hatches: gunner left, commander right (+ periscope ring + grab rails)
    P.add('turret', cylY(0.20, 0.22, 0.035, 16), -0.30, 0.478, -0.22);
    P.add('turret', cylY(0.185, 0.185, 0.026, 16), -0.30, 0.508, -0.22);
    P.add('turret', cylY(0.22, 0.24, 0.04, 16), 0.32, 0.480, -0.26);
    P.add('turret', cylY(0.205, 0.205, 0.028, 16), 0.32, 0.512, -0.26);
    P.add('turretDark', box(0.26, 0.016, 0.03), 0.32, 0.532, -0.26);
    periscope(P, 'turretDetail', 0.12, 0.468, -0.06);
    periscope(P, 'turretDetail', 0.52, 0.468, -0.10);
    periscope(P, 'turretDetail', -0.55, 0.468, -0.06);
    // ---- L8 smoke dischargers (photo-parity r2 gap #2: PROMINENT banks on
    // both front corners — TWO chunky 4-tube clusters per corner, angled
    // outward, on real bracket plates tied to the cheek returns) ----
    for (const s of [-1, 1]) {
      P.add('turretDetail', box(0.06, 0.13, 0.34), s * 0.74, 0.17, 0.40, 0, s * 0.42, 0);
      P.add('turretDark', box(0.30, 0.05, 0.06), s * 0.72, 0.115, 0.47, 0, s * 0.42, 0);
      const sbIn = FITTINGS.smokeBank({
        mats: P.mats, count: 4, r: 0.046, len: 0.30, spacing: 0.102,
        splay: s * 0.92, pitch: -0.42, seed: s > 0 ? 7 : 8, rotation: [0, s * 0.42, 0],
      });
      sbIn.position.set(s * 0.48, 0.30, 0.56);
      P.turretG.add(sbIn);
      const sbOut = FITTINGS.smokeBank({
        mats: P.mats, count: 4, r: 0.046, len: 0.30, spacing: 0.102,
        splay: s * 1.22, pitch: -0.42, seed: s > 0 ? 17 : 18, rotation: [0, s * 0.42, 0],
      });
      sbOut.position.set(s * 0.58, 0.26, 0.44);
      P.turretG.add(sbOut);
    }
    // ---- bustle stowage basket wrapping the rear (rails + mesh + rolls) ----
    P.add('turretDetail', box(0.96, 0.035, 0.035), 0, 0.32, -1.75);
    P.add('turretDetail', box(0.96, 0.035, 0.035), 0, 0.06, -1.75);
    for (const s of [-1, 1]) {
      // Root rails begin at the bustle shoulder and converge toward the narrow
      // aft cross-member.  This preserves the open basket and its real load
      // path without projecting the old full-width rectangular cage in plan.
      P.add('turretDetail', box(0.035, 0.035, 1.18), s * 0.59, 0.32, -1.17, 0, s * 0.17, 0);
      P.add('turretDetail', box(0.035, 0.035, 1.18), s * 0.59, 0.06, -1.17, 0, s * 0.17, 0);
      P.add('turretDetail', box(0.03, 0.30, 0.03), s * 0.47, 0.19, -1.74);
    }
    for (let k = 0; k < 4; k++) P.add('turretDetail', box(0.028, 0.30, 0.028), -0.36 + k * 0.24, 0.19, -1.75);
    // The rear basket stays genuinely open: rails, uprights and returns carry
    // the load path, without an opaque floor sheet or permanent tarp bundle.
    // Shallow side baskets remain as the vehicle-specific wall structure.
    for (const s of [-1, 1]) {
      P.add('turretDetail', box(0.03, 0.03, 0.52), s * 0.84, 0.30, -0.26);
      P.add('turretDetail', box(0.03, 0.03, 0.52), s * 0.84, 0.10, -0.26);
      P.add('turretDark', box(0.016, 0.18, 0.50), s * 0.825, 0.20, -0.26);
      P.add('turretDetail', box(0.03, 0.20, 0.03), s * 0.83, 0.20, -0.04);
      P.add('turretDetail', box(0.03, 0.20, 0.03), s * 0.83, 0.20, -0.48);
    }
  };
  fv510PhotoBuildTurretStage1();
  yield 'fv510PhotoBuildTurretStage1';
  // ---- whip antennas on pots at the bustle corners (2 thin columns of the
  // p95 budget, aligned with the print's own mast spikes) ----
  const wa1 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.70, r: 0.011, rake: 0.05, seed: 2 });
  const fv510PhotoBuildAssemblyStage4 = (): void => {
    wa1.position.set(-0.60, 0.462, -0.50);
    P.turretG.add(wa1);
  };
  fv510PhotoBuildAssemblyStage4();
  yield 'fv510PhotoBuildAssemblyStage4';
  const wa2 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.55, r: 0.011, rake: -0.04, seed: 3 });
  const fv510PhotoBuildAssemblyStage5 = (): void => {
    wa2.position.set(0.56, 0.462, -0.54);
    P.turretG.add(wa2);
  };
  fv510PhotoBuildAssemblyStage5();
  yield 'fv510PhotoBuildAssemblyStage5';
  const waRear = FITTINGS.antennaWhip({ mats: P.mats, h: 0.65, r: 0.009, rake: 0.02, seed: 12 });
  const fv510PhotoBuildAssemblyStage6 = (): void => {
    waRear.position.set(-0.51, 0.462, -1.737);   // 2026-10-19 (owner float sweep): its pot stood 85 mm outboard of the narrowing bustle
    P.turretG.add(waRear);
  };
  fv510PhotoBuildAssemblyStage6();
  yield 'fv510PhotoBuildAssemblyStage6';
  const waShoulder = FITTINGS.antennaWhip({ mats: P.mats, h: 0.65, r: 0.009, rake: -0.02, seed: 13 });
  const fv510PhotoBuildAssemblyStage7 = (): void => {
    waShoulder.position.set(0.56, 0.462, -1.166);
    P.turretG.add(waShoulder);
  };
  fv510PhotoBuildAssemblyStage7();
  yield 'fv510PhotoBuildAssemblyStage7';
  // VH.14 (coordinator ruling 2026-10-14): the Warrior carries its 30 mm RARDEN and a coaxial L94A1 chain gun and no
  // roof machine gun (roofWeaponPolicy.ts), so the commander's pintle GPMG of the old decoration minimum is gone.
  const fv510PhotoBuildMarkingsStage1 = (): void => {
    liftEye(P, 'turretDetail', -0.72, 0.44, 0.30, 0.5);
    liftEye(P, 'turretDetail', 0.72, 0.44, 0.30, -0.5);
    P.decal('turret', 'number', num, 0.22, [0.82, 0.24, -0.10], Math.PI / 2);
    P.decal('turret', 'number', num, 0.22, [-0.82, 0.24, -0.10], -Math.PI / 2);

    // ================= 30mm L21A1 RARDEN (§B3.1: the gun run is cylinders
    // only — cast root sleeve, stepped bare tube, PERFORATED flash hider with
    // dark ring vents, slotted tip; NO evacuator, NO thermal sleeve; the
    // muzzle never clears the +3.17 nose, so overhang masks stay empty) =====
    P.addGunExtra(cylZ(0.075, 0.30, 12, 0.092), 0, 0, 0.26);
    // 227 gun-gaps (owner 2026-10-17, "fix any of these" with the C2 gun gap): the turret buckets are offset 0.25 m
    // aft below (the measured turret station) while the gun group stays at z 0.55, so the raked face sits 0.27 m behind
    // the trunnion and the recoiling base ended 0.075 m behind it: from 12-14 of 24 directions the background showed
    // along the gun line between the RARDEN and the face (83-305 mm behind the pivot, 80-350 mm at -9 deg). The cradle
    // now continues aft as a 0.070 m sleeve (just over the 0.067 m recoiling base it receives) from 0.03 m behind the
    // trunnion into the face, keeping its rear behind the raked face at rest, +30 and -9 deg. r3 (critic): at full
    // depression the r2 sleeve's full-radius rear (0.49 m aft) broke 14 mm up through the seam groove between the roof
    // plate and the add-on block ahead of it. The full section now ends 0.36 m aft (the face's rake reaches 0.32 m at
    // -9 deg) and its last 0.09 m tapers to a 0.036 m rim 0.45 m aft, so at full depression the sleeve passes 18 mm
    // under that groove's floor.
    P.addGunExtra(cylZ(0.070, 0.33, 12), 0, 0, -0.195);
    P.addGunExtra(cylZ(0.070, 0.09, 12, 0.036), 0, 0, -0.405);
    buildGun(P, { len: 1.84, r: 0.030, sleeve: false, evac: null, collar: false, baseR: 0.058 });
    // Fleet visual standard (2026-09-12): the mouth sits ON the tip face at
    // 1.872 (the former seat at 1.84 was buried inside the dark hider nose
    // and hidden behind a solid dark cap, so the Warrior showed a black blob
    // instead of a gun hole; muzzle-bore-probe: rim occluded by gunDark).
    muzzleBore(P, { z: 1.872, r: 0.030 });                      // §B3.1 (shadow-named, 3fca39b)
    // RARDEN 30 mm: autocannon-scale disc (law: smaller disc)
    // These pieces are tube furniture and therefore belong to the recoil
    // bucket. The former gunMount ownership left a stationary solid cap in
    // front of the fleet bore furniture and blocked the visible gun hole.
    P.add('gun', cylZ(0.041, 0.60, 10, 0.046), 0, 0, 0.82);
    P.add('gun', cylZ(0.0335, 0.55, 10), 0, 0, 1.42);
    // perforated flash hider (photo-parity r2 gap #4: the vent read — four
    // deep dark rings, a steel nose and a slotted steel tip collar carrying
    // the bore; muzzle tip 3.152 < the +3.17 nose)
    P.add('gun', cylZ(0.048, 0.30, 12), 0, 0, 1.68);
    for (const zr of [1.575, 1.655, 1.735, 1.815]) P.add('gunDark', cylZ(0.0495, 0.018, 12), 0, 0, zr);
    P.add('gun', cylZ(0.037, 0.05, 12), 0, 0, 1.84);            // hider nose 1.815..1.865
    P.add('gunDark', cylZ(0.0375, 0.006, 12), 0, 0, 1.858);     // slot read behind the tip
    P.add('gun', cylZ(0.030, 0.012, 12), 0, 0, 1.866);          // tip collar 1.860..1.872 (bore face)
    // coax 7.62 chain gun port left of the main gun (dark ring + stub), at the
    // left cheek casting's outer edge, 0.32 m from the RARDEN as authored
    const coaxX = P.gunG.position.x - 0.32;
    P.add('turretDark', cylZ(0.032, 0.02, 10), coaxX, 0.30, 0.52);
    P.add('turretDark', cylZ(0.014, 0.16, 8), coaxX, 0.30, 0.58);
    // Match the measured 1.68 m Warrior roof without individually nudging a
    // hundred authored plates. This affine correction touches our primitives
    // only; no source vertices enter the runtime builder.
    // 2026-10-19 (owner float sweep): the hull glass rides the same correction (the driver's periscope glasses stood
    // 456 mm over their lowered housings)
    P.scaleBuckets(
      ['hull', 'hullDetail', 'hullDark', 'hullRubber', 'hullCloth', 'hullGlass'],
      1, upperHullScaleY, 1,
    );
    P.offsetBuckets(
      ['turret', 'turretDetail', 'turretDark', 'turretGlass', 'turretCloth'],
      0, 0, -0.25,
    );
    for (const fitting of upperHullFittings) {
      fitting.position.y *= upperHullScaleY;
      fitting.scale.y *= upperHullScaleY;
    }
    // The component oracle places the turret at y 1.61..2.83. Compress the
    // complete seated package as one articulation-owned assembly, including
    // its sights, basket, smoke banks and gun cradle.
    // 2026-10-21 (owner: "the fv510 warriors and its MILAN variant turret is kind of floating above the hull"): its flat
    // underside stood 60 mm over the deck all round the ring (vehicle scale, the 1.10 below included). It sits 52 mm
    // lower (1.74 -> 1.6927 here): 8 mm of running clearance over the deck and the deck's side edge, and over the
    // troop-bay periscope domes its rear corners sweep (lowered 25 mm for it).
    P.turretG.position.y = 1.6927;
    P.turretG.scale.y = 0.84;
    // Fleet visual standard (2026-09-12): the RARDEN rides inside that
    // squashed assembly, so counter-scale the elevating gun group (the
    // challenger.ts convention) and the tube, flash hider and mouth stay
    // round instead of reading as a 16 % flattened ellipse.
    P.gunG.scale.y = 1 / 0.84;
    P.topY = 0.79;
  };
  fv510PhotoBuildMarkingsStage1();
}
function fv510PhotoBuild(...args: Parameters<typeof fv510PhotoBuildSteps>): void {
  drainTankBuild(fv510PhotoBuildSteps(...args));
}

// FV510 Warrior MILAN — tier-IX protected support conversion.  The complete
// photo-class Warrior remains the structural base, including its WRAP skirts,
// rib cages, rear door, native six-station suspension and RARDEN installation.
// This pass is strictly additive: applique, missile equipment, observation
// kit and a denser roof/glacis service grammar all land on existing armor.
function fv510MilanBuild(P: UKBuilderPort): void {
  fv510PhotoBuild(P);
  const num = P.spec.visual.number || 'M9';

  // ---- layered upper-glacis package.  Every closed tile overlaps the long
  // Warrior rake below it; the two rows step upward with that parent plane.
  for (const [x, y, z, w, d, pitch] of [
    [-0.62, 1.235, 2.71, 0.55, 0.42, -0.56],
    [0.00, 1.235, 2.71, 0.55, 0.42, -0.56],
    [0.62, 1.235, 2.71, 0.55, 0.42, -0.56],
    [-0.58, 1.430, 2.35, 0.62, 0.48, -0.46],
    [0.10, 1.430, 2.35, 0.62, 0.48, -0.46],
    [0.78, 1.430, 2.35, 0.56, 0.48, -0.46],
  ]) {
    P.add('hull', box(w, 0.085, d), x, y, z, pitch, 0, 0);
    P.add('hullDark', box(w * 0.88, 0.018, 0.026), x, y + 0.050, z - d * 0.34,
      pitch, 0, 0);
  }
  // Broad bow shoulders bridge the applique into the existing fenders while
  // remaining above the end-wheel sweeps and inside the original skirt face.
  for (const s of [-1, 1]) {
    P.add('hull', sslab(s,
      [0.88, 1.20, 2.83], [1.43, 1.20, 2.83], [1.45, 1.35, 2.30], [0.88, 1.35, 2.30],
      [0.88, 1.29, 2.78], [1.40, 1.29, 2.78], [1.42, 1.45, 2.30], [0.88, 1.45, 2.30]));
    // Additional modular side armor is seated directly on the existing WRAP
    // panels, not substituted for them.  The shallow course keeps the full
    // zig-zag armor and outer rib cage readable underneath.
    // 2026-10-21 (the turret's lower seat, fv510PhotoBuild): the course's top edge comes down 4 cm (to 1.59) so the
    // turret's rear corners, sweeping 2.0 m from its pivot, clear it.
    for (let k = 0; k < 6; k++) {
      const z = 1.95 - k * 0.77;
      P.add('hull', box(0.036, 0.28, 0.61), s * 1.515, 1.45, z);
      P.add('hullDark', box(0.010, 0.026, 0.47), s * 1.536, 1.58, z);
      P.add('hullDetail', box(0.045, 0.050, 0.16), s * 1.535, 1.32, z);
    }
  }

  // ---- glacis service equipment: a protected central IR lamp, paired large
  // white-light pods and their brush guards, plus tools/cable runs.  These are
  // semantic equipment rather than armor and therefore use addEquipment.
  // 2026-10-21 (the turret's lower seat, fv510PhotoBuild): the turret's rear corners sweep 2.0 m from its pivot, and
  // the lamp's front stood 2.05 m out, 26 mm into their sweep even before; it moves 8 cm up the glacis (to 1.97 m)
  // and is dropped onto the plate. Release 240 (the owner: "make sure all tank turrets are clear of hulls"): its top
  // stood 1.88-1.92 m inside that sweep (the turret's rear underside 1.795, after the 1.1 vehicle scale); it goes 0.42 m
  // down the glacis, wholly past 2.05 m, its top under the turret's 1.88 detail line.
  P.snapGroup('fv510-milan-ir-lamp', () => {
    P.addEquipment('hull', box(0.30, 0.18, 0.25), 0.48, 1.52, 2.52, -0.35, 0, 0);
    P.addEquipment('hullDark', cylZ(0.090, 0.12, 16), 0.48, 1.55, 2.65, -0.18, 0, 0);
    P.addEquipment('hullGlass', cylZ(0.068, 0.014, 16), 0.48, 1.56, 2.717, -0.18, 0, 0);
  }, { reachM: 0.10, mode: 'down' });
  for (const s of [-1, 1]) {
    // 2026-10-19 (owner float sweep): the lamp and its guard stood 23 mm over the bow shoulder; they drop onto it
    P.snapGroup('fv510-milan-lamp', () => {
      const lamp = FITTINGS.lightCluster({ nightKind: 'headlight',
        mats: P.mats, pods: 1, spacing: 0.16, r: 0.090, rake: -0.44,
        seed: 31 + s,
      });
      lamp.position.set(s * 1.08, 1.49, 2.72);
      lamp.scale.setScalar(1.08);
      P.hullG.add(lamp);
      P.addEquipment('hullDark', box(0.025, 0.24, 0.23), s * 1.20, 1.49, 2.72);
      P.addEquipment('hullDark', box(0.025, 0.24, 0.23), s * 0.96, 1.49, 2.72);
      P.addEquipment('hullDark', box(0.27, 0.025, 0.23), s * 1.08, 1.61, 2.72);
    }, { reachM: 0.05, mode: 'down' });
  }
  // (release 240: the two tool rods 2.5 cm lower, under the turret's side, 1.771 after the 1.1 vehicle scale, as it turns)
  P.addEquipment('hullDetail', box(0.055, 0.055, 1.15), -0.44, 1.555, 2.05, 0, 0.08, 0);
  P.addEquipment('hullDetail', box(0.055, 0.055, 0.88), 0.13, 1.575, 2.04, 0, -0.12, 0);
  for (const x of [-0.72, -0.45, -0.18]) {
    // 2026-10-19 (owner float sweep): two of the three pads stood 24 mm over the deck; each drops onto it
    // 2026-10-21 (the turret's lower seat): 15 mm thick, not 35: the turret's sides sweep over them
    P.snapGroup('fv510-milan-deck-pad', () => P.addEquipment('hullDark', box(0.20, 0.015, 0.28), x, 1.58, 1.52, 0, -0.10, 0),
      { reachM: 0.05, mode: 'down' });
  }

  // ---- turret cheek/bustle applique.  The armor overlaps the welded crew
  // cell at both the front and side returns, so it remains a single supported
  // mass under yaw rather than a stand-off collection of boxes.
  for (const s of [-1, 1]) {
    P.add('turret', sslab(s,
      [0.35, 0.00, 0.50], [0.82, -0.02, 0.32], [0.88, 0.00, -0.02], [0.50, 0.00, 0.08],
      [0.32, 0.48, 0.46], [0.76, 0.48, 0.28], [0.83, 0.48, -0.04], [0.47, 0.48, 0.04]));
    P.add('turret', box(0.16, 0.42, 0.52), s * 0.82, 0.26, -0.45, 0, s * 0.12, 0);
    P.add('turret', box(0.19, 0.34, 0.62), s * 0.69, 0.25, -1.43, 0, s * 0.10, 0);
    P.add('turretDark', box(0.025, 0.045, 0.43), s * 0.91, 0.37, -0.45);
    P.add('turretDetail', box(0.22, 0.06, 0.14), s * 0.69, 0.46, -1.42);
  }
  P.add('turret', box(1.20, 0.34, 0.30), 0, 0.24, -1.58);
  P.add('turretDetail', box(1.08, 0.035, 0.34), 0, 0.43, -1.57);

  // ---- MILAN launcher: a forward-facing closed tube, armored collar,
  // elevation cradle and sight channel on the turret-right roof.  The cradle
  // penetrates the roof shoe and the tube overlaps the cradle at both ends.
  weaponAssembly(P, () => {
    // 2026-10-19 (owner float sweep): the launcher's roof shoe stood 29 mm over the roof; the assembly is seated on it
    P.snapGroup('fv510-milan-launcher', () => {
      P.addEquipment('turret', box(0.36, 0.16, 0.48), 0.56, 0.63, -0.08, 0, -0.06, 0);
      P.addEquipment('turretDark', cylX(0.075, 0.40, 12), 0.56, 0.70, -0.03);
      P.addEquipment('turret', box(0.12, 0.30, 0.14), 0.56, 0.79, -0.03, 0.10, 0, 0);
      P.addEquipment('turretDark', cylZ(0.112, 1.12, 18, 0.124), 0.56, 0.92, 0.36, -0.04, 0, 0);
      P.addEquipment('turretDetail', cylZ(0.126, 0.17, 18), 0.56, 0.92, -0.13, -0.04, 0, 0);
      P.addEquipment('turretDark', cylZ(0.086, 0.025, 18), 0.56, 0.92, 0.927, -0.04, 0, 0);
      P.addEquipment('turretGlass', box(0.14, 0.10, 0.018), 0.37, 0.89, 0.01, -0.02, 0, 0);
    }, { reachM: 0.06 });
    // Two spare missile tubes remain tied to the bustle by broad saddles.
    for (const [x, y] of [[-0.33, 0.55], [0.02, 0.59]]) {
      P.addEquipment('turret', box(0.20, 0.08, 0.68), x, y - 0.08, -1.20);
      P.addEquipment('turretDark', cylZ(0.074, 0.72, 14, 0.082), x, y, -1.20);
      P.addEquipment('turretDetail', cylZ(0.083, 0.035, 14), x, y, -0.83);
    }

  });
  // ---- populated roof: armored rectangular hatch, panoramic head, paired
  // periscope hoods and compact stowage/radio boxes.
  // 2026-10-19 (owner float sweep): the hatch, the panoramic head and the two hoods stood 40-87 mm over the falling
  // roof (authored for a higher plate); each is seated on it
  P.snapGroup('fv510-milan-hatch', () => {
    P.addEquipment('turret', box(0.46, 0.045, 0.42), -0.29, 0.61, -0.49, 0, 0.08, 0);
    P.addEquipment('turretDark', box(0.38, 0.018, 0.035), -0.29, 0.642, -0.30, 0, 0.08, 0);
  }, { reachM: 0.08, mode: 'down' });
  P.snapGroup('fv510-milan-panoramic-head', () => {
    P.addEquipment('turret', cylY(0.14, 0.16, 0.16, 14), -0.55, 0.68, -0.10);
    P.addEquipment('turret', box(0.26, 0.18, 0.24), -0.55, 0.83, -0.10);
    P.addEquipment('turretGlass', box(0.17, 0.07, 0.016), -0.55, 0.85, 0.026);
  }, { reachM: 0.12 });
  for (const x of [-0.20, 0.08]) P.snapGroup('fv510-milan-periscope-hood', () => {
    P.addEquipment('turret', box(0.19, 0.07, 0.15), x, 0.63, 0.06, -0.12, 0, 0);
    P.addEquipment('turretGlass', box(0.13, 0.035, 0.014), x, 0.65, 0.142, -0.12, 0, 0);
  }, { reachM: 0.12 });
  P.addEquipment('turret', box(0.30, 0.20, 0.28), 0.54, 0.62, -0.80);
  P.addEquipment('turretDetail', box(0.27, 0.030, 0.30), 0.54, 0.735, -0.80);
  // VH.14 (coordinator ruling 2026-10-14): no roof machine gun on the real Warrior (roofWeaponPolicy.ts) — the shielded
  // second GPMG and its shield cheeks are gone.

  // Dense but supported designation grammar.  The custom fleet marking uses
  // a different hull-side anchor; these builder decals identify the upgrade.
  P.decal('turret', 'number', num, 0.20, [0.92, 0.30, -0.48], Math.PI / 2);
  P.decal('turret', 'number', num, 0.20, [-0.92, 0.30, -0.48], -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Vickers MBT Mk.1 (Vijayanta) — first build, vertex r2 (2026-08-03).
// Authored column-by-column from docs/references/vertex/vickers_mk1.json
// (JackTheTinkerer print, CC BY, near-clean stylization triage 0a39d55).
// FRAME: build z = extract z + 1.051 (body centered); all values world m.
//
// LENGTH LAW (dims sovereign vs a z-short print): the as-loaded oracle hull
// masks 7.145 m vs the published 7.92 (the width guard's safeScale shrinks
// the chunky print 5.4%). Every mid-hull feature here is REF-ALIGNED so the
// curve rows read the print. The old bow length carrier was a tall box on two
// exposed struts beyond the beak; it read as detached from the upper glacis.
// The travel lock is now folded into a shallow, face-following glacis cradle.
// The tail phone/stow box still carries the rear published-length datum.
// Overall rides the muzzle at +5.75 (9.75, −0.4%); height rides
// the cupola+MG crown run at 2.687 (p95 anchor, ref crown 2.664).
// Published: hull 7.92, overall 9.79, width 3.17, height 2.71.
const VICKERS_DECK = [
  // FULL-WIDTH deck plane (side_hull top fwd of the superstructure; the
  // fender plane 1.547 carries the width aft — front_hull: 1.547 out to
  // ±1.52 while the rear deck rise is a CENTER superstructure only)
  [3.00, 1.368], [2.53, 1.381], [2.38, 1.383], [2.30, 1.428],
  [2.28, 1.469], [2.26, 1.54],
  [1.28, 1.54], [1.27, 1.502], [1.15, 1.502], [1.14, 1.54],
  [-0.27, 1.54], [-0.28, 1.502], [-0.42, 1.502], [-0.43, 1.54], [-0.77, 1.54],
];
// center superstructure tiers (rear deck rise): front_hull tapers 1.786 →
// 1.742 (±0.78) → 1.641 (±0.95) → fender 1.547
const VICKERS_REAR1 = [   // ±0.95 tier
  [-0.77, 1.545], [-0.85, 1.596], [-0.98, 1.641], [-3.15, 1.641],
  [-3.32, 1.641], [-3.34, 1.655], [-3.46, 1.655],
];
const VICKERS_REAR2 = [   // ±0.78 tier
  [-0.98, 1.60], [-1.17, 1.674], [-1.37, 1.72], [-1.58, 1.742],
  [-2.62, 1.742], [-2.72, 1.735], [-3.10, 1.65],
];
const VICKERS_REAR3 = [   // ±0.55 tier (side silhouette line)
  [-1.45, 1.72], [-1.65, 1.786], [-2.28, 1.786], [-2.42, 1.762], [-2.66, 1.745],
];

function addVickersMk1Hull(P: UKBuilderPort): void {
  // Keep the measured deck and full exterior sponson sides, but open the
  // concealed underside over the native return run.  The center body stays
  // closed inside x +/-0.90 and the original outer skin resumes above 1.14 m;
  // no fender, mudguard, skirt, bow or stern surface is removed.
  const trackCorridor = { x: 0.90, floor: 1.14, z0: -2.0, z1: 2.74 };
  // Station-slice prism law (russia r7c): every loft below is SEGMENTED at
  // ≤0.5 m pitch via extraZ knots so each 0.57 m station window contains
  // real end caps — a single full-length prism reads zero width edge-on.
  const seg5 = (a: number, b: number): number[] => {
    const out: number[] = [];
    for (let z = a; z > b; z -= 0.45) out.push(Number(z.toFixed(2)));
    return out;
  };
  // ---- sponson band: full width over the tracks, floor above the wrap ----
  // widths: ref stations read ±1.5845 midships, ±1.5525 aft of −2.0.
  loftBandCorridor(P, 'hull', 1.5845, 0.05, VICKERS_DECK, () => 1.05,
    2.30, -0.77, trackCorridor, seg5(2.3, -0.77));
  loftBandCorridor(P, 'hull', 1.5845, 0.05, [[-0.77, 1.547], [-2.0, 1.547]], () => 1.05,
    -0.77, -2.0, trackCorridor, seg5(-0.77, -2.0));
  // tail band floor steps to 1.36 over the raised sprocket wrap (top 1.335
  // — TRACK CONTAINMENT: the wrap arc stays clear of the sponson floor);
  // last 0.3 m tapers to ±1.50 (ref's ±1.55 plane ends −3.39; the fender
  // END CAPS carry the ±1.55 station width across the tail window)
  loftBand(P, 'hull', 1.5475, 0.05, [[-2.0, 1.547], [-3.19, 1.547]],
    (z) => (z < -2.42 ? 1.36 : 1.10), -2.0, -3.19, seg5(-2.0, -3.19));
  loftBand(P, 'hull', 1.50, 0.05, [[-3.19, 1.547], [-3.49, 1.547]], () => 1.36, -3.19, -3.49);
  // rear-deck superstructure tiers (see width taper note above; inset thin
  // so the front-view top plane reaches the tier's own width line)
  loftBand(P, 'hull', 0.95, 0.015, VICKERS_REAR1, () => 1.30, -0.77, -3.46, seg5(-0.77, -3.46));
  loftBand(P, 'hull', 0.78, 0.015, VICKERS_REAR2, () => 1.55, -0.98, -3.10, seg5(-0.98, -3.1));
  loftBand(P, 'hull', 0.55, 0.015, VICKERS_REAR3, () => 1.60, -1.45, -2.66, seg5(-1.45, -2.66));
  // glacis band: full width to 3.00 (ref plan holds ±1.585 to ext 1.95).
  // Floor lifts to 1.23 past 2.72 where the raised idler wrap crowns at
  // 1.19 (containment) — the glacis IS a plate over the idler there.
  loftBandCorridor(P, 'hull', 1.5845, 0.04, VICKERS_DECK,
    (z) => (z > 2.72 ? 1.23 : 1.05), 3.00, 2.30, trackCorridor, seg5(3.0, 2.3));
  // center nose beak (plan: |x|<0.55 ends 3.19) + shackle wing pads (plan:
  // |x| 0.56..0.80 lead the beak to 3.30 — the print's swept bow).
  P.add('hull', slab(
    [-0.55, 1.06, 3.00], [0.55, 1.06, 3.00], [0.55, 1.27, 3.19], [-0.55, 1.27, 3.19],
    [-0.55, 1.368, 3.00], [0.55, 1.368, 3.00], [0.55, 1.36, 3.24], [-0.55, 1.36, 3.24]));
  for (const s of [-1, 1]) {
    P.add('hull', box(0.24, 0.30, 0.30), s * 0.68, 1.16, 3.16);
    P.add('hullDetail', box(0.11, 0.10, 0.16), s * 0.68, 0.98, 3.30);
    P.add('hullDetail', torus(0.06, 0.016, 10), s * 0.68, 0.98, 3.40, Math.PI / 2, 0, 0);
  }
  // ---- inner body + lower plates (all inside the track channel) ----
  P.add('hull', box(1.74, 0.58, 5.4), 0, 0.77, -0.35);
  // Engine bay tub wall (owner 2026-10-21, "gaps in hull around the engines ... a top slab and bottom slab"): aft of
  // the return-run corridor the tail band's floor climbs from 1.10 to 1.36 over the sprocket wrap, full width, while
  // the inner body stops at 1.06, so a slot opened through the hull from track to track over -2.0..-3.05. The body's
  // side plates carry on up into the band, flush with it, and meet the stern rake.
  P.add('hull', box(1.74, 0.31, 1.06), 0, 1.215, -2.52);
  P.add('hull', slab(                                  // lower bow to the beak
    [-0.85, 0.48, 2.30], [0.85, 0.48, 2.30], [0.58, 1.20, 3.17], [-0.58, 1.20, 3.17],
    [-0.85, 1.06, 2.30], [0.85, 1.06, 2.30], [0.58, 1.30, 3.19], [-0.58, 1.30, 3.19]));
  P.add('hull', slab(                                  // lower stern rake
    [-0.85, 0.48, -3.05], [0.85, 0.48, -3.05], [0.80, 0.90, -3.40], [-0.80, 0.90, -3.40],
    [-0.85, 1.38, -3.05], [0.85, 1.38, -3.05], [0.80, 1.38, -3.40], [-0.80, 1.38, -3.40]));
  P.add('hull', box(1.6, 0.48, 0.10), 0, 1.14, -3.44);
  // Tail: stepped rear plate (ref side: 1.655@−3.46 → 1.42@−3.50 → 1.24 lip
  // to −3.57; plan: plate ±1.0 ends −3.48, lip ±0.82 carries to −3.565).
  P.add('hull', slab(
    [-1.0, 0.87, -3.42], [1.0, 0.87, -3.42], [1.0, 0.90, -3.485], [-1.0, 0.90, -3.485],
    [-1.0, 1.655, -3.44], [1.0, 1.655, -3.44], [1.0, 1.46, -3.485], [-1.0, 1.46, -3.485]));
  P.add('hull', slab(
    [-0.82, 0.90, -3.48], [0.82, 0.90, -3.48], [0.82, 0.92, -3.565], [-0.82, 0.92, -3.565],
    [-0.82, 1.46, -3.48], [0.82, 1.46, -3.48], [0.82, 1.225, -3.565], [-0.82, 1.225, -3.565]));
  // Fender end caps + mud flaps at the sprocket line (plan track cols end
  // −3.40; hems above the wrap — containment law). The DEEP flaps hang at
  // the BOW outer corners (ref front bot 0.549 at |x| 1.46..1.56, where the
  // ref side bot is already the idler climb ~0.5).
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.44, 0.04, 0.30), s * 1.33, 1.525, -3.28);
    P.hangMudguard('vickers-mk1-rear-flap', 'hullRubber', box(0.40, 0.34, 0.03), s * 1.30, 1.05, -3.415, 0.06, 0, 0);
    P.hangMudguard('vickers-mk1-front-flap', 'hullRubber', box(0.10, 0.60, 0.035), s * 1.495, 0.94, 3.31); // top inside the fender tip wedge (outer edge 1.548 at z 3.31)
  }
  // Fender tip wedges sloping down over the raised idler (ref side falls
  // 1.35 → 1.09 over b 3.30..3.56 at |x| up to 1.55 — thin curved mudguard
  // tips like the print's own 4-14 cm wedge). Bottom line tracks the idler
  // wrap arc (crown 1.19 at z 3.145) with ≥3 cm clearance — containment.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 1.06, 1.24, 3.28], [s * 1.55, 1.24, 3.28], [s * 1.53, 1.06, 3.53], [s * 1.10, 1.06, 3.53],
      [s * 1.06, 1.355, 3.28], [s * 1.55, 1.355, 3.28], [s * 1.53, 1.09, 3.555], [s * 1.10, 1.09, 3.555]));
    // The fender runs on level to the wedge (owner 2026-10-19 sweep: the wedge and its flap stood 0.28 m ahead of the
    // fender's end at z 3.00, carried by nothing); its 1.24 underside clears the 1.19 wrap crown.
    P.add('hull', box(0.49, 0.115, 0.32), s * 1.305, 1.2975, 3.13);
  }
  // ---- BOW TRAVEL LOCK + REAR LENGTH CARRIER (see header law). ---------
  // The lock is stowed flat on the center beak. Its twin feet follow the
  // measured 1.368 -> 1.360 m upper-glacis fall and overlap the armor by
  // 10 mm; the yoke and saddle ears overlap both feet. This keeps every
  // visible part in one supported chain and removes the former vertical
  // daylight. It is external equipment, not part of the armor envelope.
  const bowLockPitch = 0.034;
  for (const x of [-0.065, 0.065]) {
    P.addEquipment('hull', box(0.04, 0.05, 0.40), x, 1.381, 3.06,
      bowLockPitch, 0, 0);
  }
  P.addEquipment('hull', box(0.22, 0.06, 0.11), 0, 1.390, 3.205,
    bowLockPitch, 0, 0);
  for (const x of [-0.075, 0.075]) {
    P.addEquipment('hull', box(0.045, 0.16, 0.055), x, 1.445, 3.205,
      bowLockPitch, 0, 0);
    P.add('hullDark', box(0.032, 0.035, 0.018), x, 1.522, 3.224,
      bowLockPitch, 0, 0);
  }
  // tail: infantry-telephone / convoy-stow box on brackets off the rear lip
  // (front face past the ref tail + margin so no edge-smear columns).
  P.add('hull', box(0.10, 0.38, 0.31), -0.07, 1.41, -3.815);
  P.add('hullDark', box(0.08, 0.10, 0.02), -0.07, 1.50, -3.966);
  P.add('hullDetail', box(0.04, 0.05, 0.30), -0.035, 1.19, -3.53);
  P.add('hullDetail', box(0.04, 0.05, 0.30), -0.105, 1.19, -3.53);
  P.hullG.userData.vickersBowLockReceipt = Object.freeze({
    owner: 'hull',
    carrier: 'upper-glacis',
    stowed: true,
    formerBoxCenter: Object.freeze([0.07, 1.72, 3.78]),
    formerRailCenterY: 1.12,
    footCenters: Object.freeze([Object.freeze([-0.065, 1.381, 3.06]),
      Object.freeze([0.065, 1.381, 3.06])]),
    carrierFallM: 0.008,
    contactEmbedM: 0.010,
    maxSupportGapM: 0,
    armorEnvelopeExcluded: true,
  });
  // ---- deck furniture ----
  // engine-deck louvre boxes (ref bumps 1.816 / 1.801: CENTER x ±0.4 only —
  // front_hull reads 1.814 over ±0.4 with the tiers below outboard)
  P.add('hull', box(0.8, 0.062, 0.10), 0, 1.785, -2.575);
  P.add('hull', box(0.8, 0.047, 0.13), 0, 1.7775, -2.365);
  P.add('hullDetail', box(0.84, 0.02, 0.36), 0, 1.755, -2.32);
  P.add('hull', box(0.10, 0.06, 0.30), 0.61, 1.78, -2.45);   // right filler pod
  for (const i of KIT.grilleIndices(P.q, 5, 3)) {
    P.add('hullDark', box(0.9, 0.018, 0.05), 0, 1.788, -1.80 - i * 0.10);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.035, 10), s * 0.62, 1.75, -1.35);
  // driver hatch strip (ref 1.585 over 2.02..2.25, right side) + periscopes
  P.add('hullDetail', box(0.78, 0.05, 0.24), 0.52, 1.558, 2.135);
  P.add('hullDark', box(0.30, 0.016, 0.18), 0.52, 1.586, 2.135);
  periscope(P, 'hullDetail', 0.30, 1.545, 1.95);
  periscope(P, 'hullDetail', 0.62, 1.545, 1.95);
  // deck periscope/vent wells (ref dips to 1.502): dark well floors sit
  // INSIDE the loft's own dips (the deck table carries the 1.502 line)
  P.add('hullDark', box(1.2, 0.01, 0.11), 0, 1.508, 1.21);
  P.add('hullDark', box(1.2, 0.01, 0.13), 0, 1.508, -0.35);
  // headlight pods on the glacis (ref bump 1.417 at 2.97..3.05)
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.26, 0.09, 0.20), s * 0.95, 1.385, 3.0);
    headlight(P, s * 0.95, 1.40, 3.09, -0.15);
  }
  // British glacis kit: spare track links + tow cable run
  spareTrackStrip(P, 'hull', -0.45, 1.40, 2.72, 3);
  KIT.towCable(P, [[-0.9, 1.56, 2.2], [0, 1.57, 1.6], [0.9, 1.56, 2.2]]);
  P.add('hullDetail', box(0.1, 0.05, 0.14), -0.9, 1.545, 2.2);
  P.add('hullDetail', box(0.1, 0.05, 0.14), 0.9, 1.545, 2.2);
  // rear-deck stowage: tarp on the center plateau (under the 1.814 line),
  // camo roll on the left fender run
  tarpRoll(P, 'hullCloth', -0.42, 1.715, -2.0, 0.6, 0.07, false);
  tarpRoll(P, 'hullCloth', -1.30, 1.485, -1.2, 1.0, 0.06, false);
  P.add('hullDark', box(1.9, 0.30, 0.03), 0, 1.15, -3.56);
  // ---- running gear. Ref reads (my frame): ground band z −2.09..2.24 at
  // |x| 0.89..1.45 (w 0.56, xc 1.17); a SMALL HIGH front idler (rim top
  // 1.19, front extent 3.56, steep 0.38-slope climb — fitted r2) and a
  // raised sprocket (rear extent −3.40, climb from −2.09 at ~0.34). ----
  // Tire width 0.33 (round 40 axial fit): the Challenger paired wheel this hull draws is 1.36 × its radius wide;
  // the 0.24 band and the 0.49 track bounded it to 0.65 of its proportion.
  // owner 2026-09-23 (round 46 wheel follow-up, census 2R/pitch 1.02): r 0.40 on the 0.782 pitch
  // overlapped by 2 cm. The Vickers Mk 1 rides six ~720 mm wheels (r 0.36 here, 0.34 after the 0.95
  // vehicle scale; 2R/pitch 0.92, a 6 cm gap); stations, end wheels and its three return rollers stay.
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.36, wheelW: 0.33, wheelY: 0.41, xc: 1.185,
    wheelZs: [2.02, 1.238, 0.456, -0.326, -1.108, -1.89],
    sprocket: { z: -2.98, y: 0.92, r: 0.26 }, idler: { z: 3.145, y: 0.80, r: 0.255 },
    rollers: [{ z: 1.15, y: 0.79, r: 0.09 }, { z: -0.15, y: 0.79, r: 0.09 }, { z: -1.45, y: 0.79, r: 0.09 }],
    trackW: 0.49, trackTh: 0.09, topY: 0.95, paintedEnds: true, arms: true,
  });
  // decals sit 3 mm proud of the sloped band side face, INBOARD of the
  // ±1.5845 width edge (an edge decal minted phantom front-view columns)
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [1.562, 1.28, -0.7], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [-1.562, 1.28, -0.7], -Math.PI / 2);
}

function vickersMk1Build(P: UKBuilderPort): void {
  const { rng } = P;
  addVickersMk1Hull(P);

  // ---- turret: low curved casting, wide crown left, cupola right, deep
  // ring collar + basket (side_turret bot: collar 1.05 over ±0.785 of the
  // ring, basket 0.838), long shallow face to the mantlet cone ----
  P.turretG.position.set(0, 1.54, 0.463);
  P.gunG.position.set(0, 0.4855, 0.60);
  // ring collar + basket (world 1.05..1.617 / 0.836..1.05)
  P.add('turret', cylY(0.775, 0.79, 0.567, 22), 0, -0.2065, 0.013);
  P.add('turret', cylY(0.645, 0.655, 0.216, 20), 0, -0.596, 0.035);
  P.add('turretDark', box(1.0, 0.5, 1.0), 0, -0.30, 0.05);
  // main casting belt (skirt 1.617 → shoulder): walls ±1.02; cheek front
  // corners follow the ref plan (right 1.27 at x 0.5, LEFT recedes to 1.12)
  P.add('turret', slab(
    [-0.70, 0.077, 1.08], [0.72, 0.077, 1.10], [1.02, 0.077, 0.30], [-1.02, 0.077, 0.30],
    [-0.62, 0.60, 1.15], [0.64, 0.60, 1.27], [0.95, 0.62, 0.30], [-0.95, 0.62, 0.30]));
  P.add('turret', slab(
    [-1.02, 0.077, 0.30], [1.02, 0.077, 0.30], [0.95, 0.077, -0.75], [-0.95, 0.077, -0.75],
    [-0.95, 0.62, 0.30], [0.95, 0.62, 0.30], [0.90, 0.70, -0.75], [-0.90, 0.70, -0.75]));
  P.add('turret', slab(                        // rear taper into the bustle
    [-0.95, 0.10, -0.75], [0.95, 0.10, -0.75], [0.68, 0.30, -1.46], [-0.68, 0.30, -1.46],
    [-0.90, 0.70, -0.75], [0.90, 0.70, -0.75], [0.66, 0.80, -1.42], [-0.66, 0.80, -1.42]));
  // casting-to-bin waist blocks (ref plan dips to −1.54 at |x| 0.70..0.80)
  P.add('turret', box(0.12, 0.45, 0.16), -0.75, 0.42, -1.47);
  P.add('turret', box(0.12, 0.45, 0.16), 0.75, 0.42, -1.47);
  // rear underside skirt (side bot 1.618..1.655 between collar and bustle)
  P.add('turret', slab(
    [-0.84, 0.078, -0.70], [0.84, 0.078, -0.70], [0.80, 0.115, -1.12], [-0.80, 0.115, -1.12],
    [-0.84, 0.32, -0.70], [0.84, 0.32, -0.70], [0.80, 0.34, -1.12], [-0.80, 0.34, -1.12]));
  // chin under the mantlet (side bot 1.636@0.81..1.07, 1.674@1.08..1.17)
  P.add('turret', slab(
    [-0.60, 0.096, 1.07], [0.60, 0.096, 1.07], [0.52, 0.134, 1.17], [-0.52, 0.134, 1.17],
    [-0.55, 0.55, 1.30], [0.55, 0.55, 1.30], [0.50, 0.55, 1.42], [-0.50, 0.55, 1.42]));
  // FACE: steep brow then a long shallow plate to the gun line (ref side
  // top falls FAST 2.49→2.33 over ext 0.08..0.20 then gently to 2.19 by
  // 0.75); the LEFT cheek recedes earlier than the right (ref plan: left
  // ends 1.12..1.28, right 1.27..1.60)
  P.add('turret', slab(
    [-0.62, 0.55, 0.95], [0.68, 0.55, 0.95], [0.75, 0.60, 0.70], [-0.75, 0.60, 0.70],
    [-0.60, 0.775, 0.81], [0.64, 0.775, 0.81], [0.55, 0.947, 0.66], [-0.55, 0.947, 0.66]));
  P.add('turret', slab(
    [-0.55, 0.55, 1.24], [0.62, 0.55, 1.28], [0.70, 0.55, 0.86], [-0.70, 0.55, 0.86],
    [-0.38, 0.66, 1.40], [0.42, 0.66, 1.44], [0.62, 0.775, 0.82], [-0.58, 0.775, 0.82]));
  // mantlet housing (plan: nose 1.60 spans x −0.15..0.40, right-biased;
  // bottom follows the ref cone line 1.83→1.89 — the r2 worst side_turret
  // columns were this housing's box-bottom hanging 0.17 low)
  P.add('turret', slab(
    [-0.15, 0.31, 1.58], [0.40, 0.31, 1.58], [0.45, 0.27, 1.28], [-0.30, 0.27, 1.28],
    [-0.15, 0.62, 1.60], [0.40, 0.62, 1.60], [0.45, 0.66, 1.30], [-0.30, 0.66, 1.30]));
  // ---- roof: crown plateau left+center 2.607-2.614, right shoulder 2.49,
  // fwd roof 2.487, periscope hood 2.563, cupola right 2.664→2.687 anchor
  P.add('turret', slab(
    [-0.92, 0.62, 0.10], [0.22, 0.62, 0.10], [0.22, 0.64, -1.36], [-0.92, 0.64, -1.36],
    [-0.86, 1.070, 0.06], [0.16, 1.070, 0.06], [0.16, 1.070, -1.35], [-0.86, 1.070, -1.35]));
  P.add('turret', slab(                        // right shoulder falls outboard
    [0.16, 0.62, 0.30], [0.96, 0.60, 0.30], [0.96, 0.64, -1.36], [0.16, 0.64, -1.36],
    [0.16, 1.070, 0.28], [0.94, 0.947, 0.30], [0.94, 0.947, -1.35], [0.16, 1.070, -1.35]));
  P.add('turret', slab(                        // fwd roof band to the face
    [-0.90, 0.62, 0.68], [0.90, 0.60, 0.68], [0.92, 0.62, 0.06], [-0.92, 0.62, 0.06],
    [-0.55, 0.947, 0.67], [0.55, 0.947, 0.67], [0.90, 0.947, 0.10], [-0.90, 0.947, 0.10]));
  // left roof shoulder (front view: 2.544 at x −0.91..−0.96, gone by −0.97)
  P.add('turret', slab(
    [-0.955, 0.62, 0.05], [-0.86, 0.62, 0.05], [-0.86, 0.64, -1.30], [-0.955, 0.64, -1.30],
    [-0.94, 1.004, 0.03], [-0.87, 1.004, 0.03], [-0.87, 1.004, -1.30], [-0.94, 1.004, -1.30]));
  // periscope hood (2.563 over ext −0.12..0.01)
  P.add('turret', box(0.30, 0.076, 0.14), -0.20, 0.985, 0.535);
  P.add('turretGlass', box(0.22, 0.03, 0.02), -0.20, 1.005, 0.61);
  // commander cupola (ref peak footprint is SHORT: ext −0.55..−0.28, x
  // 0.21..0.68): a compact dome carrying the published-height p95 anchor at
  // 2.695 together with the MG receiver run beside it (heightM p95 needs
  // ~5 columns at the anchor; dims grace read 0.98% on the big-dome r2)
  P.add('turret', cylY(0.17, 0.21, 0.045, 16), 0.44, 1.068, 0.10);
  P.add('turret', KIT.lathe([
    [0.155, 0.0], [0.15, 0.045], [0.125, 0.068], [0.09, 0.078], [0.02, 0.082],
  ], 18, 1.0), 0.44, 1.073, 0.10);
  P.add('turretDark', torus(0.13, 0.012, 16), 0.44, 1.105, 0.10);
  for (let k = 0; k < 5; k++) {
    const a = -1.1 + k * 0.55;
    P.add('turretDark', box(0.05, 0.03, 0.035), 0.44 + Math.sin(a) * 0.14, 1.096, 0.10 + Math.cos(a) * 0.14, 0, a, 0);
  }
  // loader hatch ring, left crown
  P.add('turretDetail', cylY(0.19, 0.21, 0.045, 14), -0.42, 1.075, -0.35);
  P.add('turretDark', box(0.30, 0.014, 0.03), -0.42, 1.105, -0.35);
  // Loader's MAG: the former generic low stow was buried inside the crown and
  // disappeared from every standard presentation angle. Seat the authored
  // fitting on a shallow equipment-owned bearing over the loader hatch so
  // the receiver, feed, cradle and low shield read as one attached station.
  P.addEquipment('turretDark', cylY(0.16, 0.18, 0.038, 18), -0.42, 1.10, -0.35);
  P.addEquipment('turretDetail', torus(0.155, 0.012, 20), -0.42, 1.118, -0.35);
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats,
      cls: 'mag58',
      tone: 'two-tone',
      elev: 0.08,
      scale: 1.0,
      seed: 23,
      ammo: true,
      shield: 'low',
      barrelBridge: true,
      working: true, ridingCradle: true, // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): a working station
    });
    mg.name = 'vickers_mk1_loader_roof_machine_gun';
    mg.position.set(-0.42, 1.118, -0.35);
    mg.rotation.y = -0.06;
    mg.userData.stationVariant = 'vickers-mk1-loader-mag58-r1';
    mg.userData.forwardFacing = true;
    P.turretG.add(mg);
    P.turretG.userData.vickersRoofMachineGunReceipt = Object.freeze({
      revision: 'vickers-mk1-visible-loader-mag-r1',
      weaponClass: 'mag58',
      supportBucket: 'turretEquipment',
      supportOverlapM: 0.0035,
      forwardFacing: true,
      armorEnvelopeExcluded: true,
    });
  }
  P.add('turretDark', box(0.09, 0.08, 0.34), 0.28, 1.115, 0.08);
  liftEye(P, 'turretDetail', -0.85, 0.80, 0.45, 0.5);
  liftEye(P, 'turretDetail', 0.85, 0.78, 0.45, -0.5);
  liftEye(P, 'turretDetail', -0.62, 0.90, -1.25, 2.6);
  liftEye(P, 'turretDetail', 0.62, 0.90, -1.25, -2.6);
  // ---- bustle (flat 2.477 roof, steps up into the crown; rear face at
  // local −2.225 = ref −2.805 ext within 8 mm — also keeps the st3 station
  // window catching the bustle sliver on the longer hull). The ref plan
  // rounds hard: full-rear only inside ±0.545, walls ±0.585, and the outer
  // ±0.585..0.655 band exists only near the casting (to local −1.44) ----
  P.add('turret', box(1.17, 0.646, 0.56), 0, 0.614, -1.67);
  P.add('turret', box(1.09, 0.646, 0.275), 0, 0.614, -2.0875);
  P.add('turret', box(0.07, 0.593, 0.31), -0.62, 0.6405, -1.285);
  P.add('turret', box(0.07, 0.593, 0.31), 0.62, 0.6405, -1.285);
  P.add('turret', slab(                        // fwd floor pan: 1.884 line
    [-0.655, 0.344, -1.13], [0.655, 0.344, -1.13], [0.655, 0.344, -1.50], [-0.655, 0.344, -1.50],
    [-0.655, 0.937, -1.13], [0.655, 0.937, -1.13], [0.655, 0.937, -1.50], [-0.655, 0.937, -1.50]));
  P.add('turret', slab(                        // roof steps 2.518 / 2.582
    [-0.62, 0.90, -1.36], [0.62, 0.90, -1.36], [0.62, 0.90, -1.70], [-0.62, 0.90, -1.70],
    [-0.60, 1.042, -1.39], [0.60, 1.042, -1.39], [0.60, 0.937, -1.69], [-0.60, 0.937, -1.69]));
  // rear corner chamfers (ref plan: bustle walls taper aft of −2.0 ext)
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.545, 0.30, -1.95], [s * 0.585, 0.30, -1.95], [s * 0.585, 0.30, -2.10], [s * 0.545, 0.30, -2.22],
      [s * 0.545, 0.937, -1.95], [s * 0.585, 0.937, -1.95], [s * 0.585, 0.937, -2.10], [s * 0.545, 0.937, -2.22]));
  }
  P.add('turretDark', box(1.18, 0.02, 0.44), 0, 0.925, -1.95);
  P.add('turretDetail', box(1.05, 0.04, 0.05), 0, 0.62, -2.20);
  P.add('turretDetail', box(1.05, 0.04, 0.05), 0, 0.34, -2.20);
  for (let k = 0; k < 5; k++) P.add('turretDetail', box(0.03, 0.30, 0.03), -0.52 + k * 0.26, 0.48, -2.20);
  stowage(P, 'turretCloth', rng, [[-0.2, 0.87, -1.75, 0.62, 0.13, 0.5], [0.42, 0.87, -1.85, 0.4, 0.12, 0.4]]);
  // ---- flank stowage bins: smooth SLOPED masses, not boxes (dense ref
  // front line: 2.37 at x ±0.98 falling to ~2.20 at ±1.40 then off to the
  // fender — the earlier "flat 2.364/2.227 tops" read was a summarizer
  // averaging artifact). Tiers still step shorter outboard in plan. ----
  for (const s of [-1, 1]) {
    const zF = s < 0 ? 0.71 : 0.646, zRm = s < 0 ? -1.25 : -1.246;
    const zF2 = s < 0 ? 0.66 : 0.60, zRo = s < 0 ? -0.98 : -1.04;
    P.add('turret', slab(                     // inner tier (top 0.825→0.74)
      [s * 0.97, 0.36, zF], [s * 1.18, 0.36, zF], [s * 1.18, 0.36, zRm], [s * 0.97, 0.36, zRm],
      [s * 0.97, 0.825, zF - 0.03], [s * 1.18, 0.745, zF - 0.03], [s * 1.18, 0.745, zRm], [s * 0.97, 0.825, zRm]));
    P.add('turret', slab(                     // outer tier (0.74→0.66)
      [s * 1.18, 0.36, zF2], [s * 1.40, 0.36, zF2], [s * 1.40, 0.36, zRo], [s * 1.18, 0.36, zRo],
      [s * 1.18, 0.745, zF2 - 0.03], [s * 1.40, 0.665, zF2 - 0.03], [s * 1.40, 0.665, zRo], [s * 1.18, 0.745, zRo]));
    for (const zb of [0.35, -0.35, -1.0]) {   // brackets close the 1.653 strip
      P.add('turret', box(0.16, 0.25, 0.10), s * 1.06, 0.24, zb);
    }
    P.add('turretDark', box(0.02, 0.02, 1.5), s * 1.09, 0.79, -0.28);
  }
  // edge pouches (the extreme-x sliver is SHORT in the ref plan)
  P.add('turret', slab(
    [-1.40, 0.36, 0.17], [-1.435, 0.36, 0.17], [-1.435, 0.36, -0.13], [-1.40, 0.36, -0.13],
    [-1.40, 0.665, 0.15], [-1.435, 0.60, 0.15], [-1.435, 0.60, -0.13], [-1.40, 0.665, -0.13]));
  P.add('turret', slab(
    [1.40, 0.36, 0.07], [1.435, 0.36, 0.07], [1.435, 0.36, -0.25], [1.40, 0.36, -0.25],
    [1.40, 0.665, 0.05], [1.435, 0.60, 0.05], [1.435, 0.60, -0.25], [1.40, 0.665, -0.25]));
  // bin lids / straps
  for (const zb of [0.3, -0.3, -0.9]) {
    P.add('turretDetail', box(0.39, 0.02, 0.03), -1.145, 0.70, zb);
    P.add('turretDetail', box(0.32, 0.02, 0.03), 1.10, 0.60, zb);
  }
  // 2026-10-19 (owner float sweep): the bucket stood 30 mm off the bin front; it bears on it
  P.add('turretDark', cylY(0.055, 0.07, 0.12, 10), -1.12, 0.60, 0.768); // bucket on the bin front
  // smoke discharger banks on the cheeks (plan bumps at ±0.55..0.63 → 1.11)
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.10, 0.24), s * 0.62, 0.30, 0.98, 0, s * 0.5, 0);
    smokeCluster(P, s * 0.66, 0.42, 1.02, 5, s * 0.9, 0.6);
  }
  // whip antenna base pots ONLY: the print carries no masts, and a tall
  // mast SHARES side columns with the body below it — the column band then
  // passes the 12% rule and the mast top poisons heightM/rough (r1 lesson:
  // a 0.85 mast read heightM 2.80 and dropped the carriers out of the body
  // span; even a 0.16 stub minted a 2.82 turret_side column in r3).
  P.add('turretDetail', cylY(0.045, 0.055, 0.055, 8), -0.50, 1.055, -1.05);
  P.add('turretDetail', cylY(0.045, 0.055, 0.10, 8), 0.72, 0.90, -1.30);
  // ---- L7A1: bare tube, fume extractor at ext 1.895..2.445, thin neck +
  // tip collar at the muzzle (print's own tip read), muzzle 5.75 (overall
  // anchor 9.75, −0.4%) ----
  P.addGunExtra(cylZ(0.135, 0.42, 16, 0.205), 0, 0, 0.78);
  P.addGunExtraDark(cylZ(0.142, 0.05, 14), 0, 0, 1.02);
  buildGun(P, { len: 4.44, r: 0.13, sleeve: false, evac: null, collar: false, baseR: 0.20 });
  P.add('gun', cylZ(0.158, 0.55, 14), 0, 0.03, 2.158);          // extractor
  P.add('gunDark', cylZ(0.05, 0.11, 10), 0, 0, 4.475);          // muzzle neck
  P.add('gun', cylZ(0.132, 0.16, 12), 0, 0, 4.61);              // tip collar
  // §B3.1 (shadow-named, 3fca39b): bore on the TIP COLLAR face (4.69) —
  // the L7A1's neck+collar run PAST the buildGun tube face (first seat at
  // len-0.02 buried the furniture behind the collar; crop-caught).
  muzzleBore(P, { z: 4.69, r: 0.132 });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [1.03, 0.35, -0.35], Math.PI / 2);
  P.topY = 1.2;
}

export const UK_PROFILES = {
  vickers_mk1: {
    build: (P: UKBuilderPort) => {
      vickersMk1Build(P);
      applyCompleteVehicleScale(P, 0.95, 'cot-vickers-mk1-compact-r1');
    },
  },
  centurion3: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'mk3')) },
  centurion5_2: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'mk5_2')) },
  // release 262: the IDF's Sho't Kal of 1973 on the rebuilt Centurion family
  shot_kal: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'shot_kal')) },
  // release 262: the Mk 13 and its L2 searchlight on the rebuilt family
  centurion13: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'mk13')) },
  // release 262: the South African Olifant Mk 2 and the Royal Engineers' Mk 5 AVRE on the rebuilt family
  olifant_mk2: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'olifant_mk2')) },
  centurion5_avre: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'avre')) },
  // the Australian Mk 5/1 of Vietnam (2026-10-28)
  centurion5_1_aus: { build: steppedBuilder((P: TankBuilderPort) => centurionUkSteps(P, 'mk5_1_aus')) },
  // FV510 Warrior — photo-class full build (owner order 2026-08-06 "made
  // actual"): published dims 6.34 x 3.03 x 2.80 authored as world coords in
  // fv510Build; the recovered oracle is certified -10.9% short (curve rows
  // carry the cap until the parked §E warp lands — packet round section).
  fv510: {
    build: steppedBuilder(function* (P: UKBuilderPort): TankProfileBuild {
      yield* fv510PhotoBuildSteps(P);
      applyCompleteVehicleScale(P, 1.10, 'cot-warrior-enlarged-r1');
    }),
  },
  fv510_milan: {
    build: (P: UKBuilderPort) => {
      fv510MilanBuild(P);
      applyCompleteVehicleScale(P, 1.10, 'cot-warrior-milan-enlarged-r1');
    },
  },
} satisfies VehicleProfileRecord;

// §5.75 family-module split: profiles/challenger.ts (challenger1Build moved
// there) imports the UK family kit from this module. The helpers stay OWNED
// here (the chieftain/centurion/vickers/comet residents use them) and are
// exported for that one consumer — imported, never duplicated. The kit-proxy
// names below carry the §C.1 slab winding guard exactly as local builders
// see it (slab = orientedSlab).
export {
  ukHull, segBoxZ, towCableUK, ukToneKit, ukGearAirBackers,
  box, cylY, cylZ, torus, slab, xform, buildRunningGear, buildGun,
  liftEye, periscope, headlight, pintleMG, smokeCluster, stowage,
};
