// British family procedural profiles — FROM-SCRATCH rebuild (2026-07-31).
// Authored against the measured silhouette curves in
// docs/references/profiles/<id>.json (mask-trace polylines decoded to
// hull-centered world meters; the UK oracles sit z-shifted in the lab frame,
// which the per-view centroid alignment absorbs) plus the packets in
// docs/references/tanks/<id>.md. Hulls are lofted station slabs following
// the measured deck/belly polylines; turrets are authored from the
// whole-minus-hull band. Oracles: recovered chieftain5 / challenger1 /
// fv510 GLBs and the re-repaired m_bergman centurion / comet / charioteer /
// A30 prints (assembled turrets — the honest curves).
// challenger1 moved to profiles/challenger.ts (§5.75 family-module split) —
// that module imports this file's shared UK kit (export block at the tail).
import * as THREE from 'three';
import { KIT, FITTINGS, MUDGUARDS, evenStations, muzzleBore, orientedSlab } from './kit.ts';
import { vehicleAmbientFloorHook } from '../materials.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';

const {
  box, cylX, cylY, cylZ, sph, torus, frustum, lathe,
  liftEye, periscope, headlight, cupola, pintleMG, smokeCluster,
  stowage, tarpRoll, jerryCan, spareTrackStrip, polyMultiLoft,
} = KIT;
// §C.1 winding guard on slab. These direct aliases replace the former dynamic
// Proxy without changing any geometry calls and make the shared UK kit visible
// to TypeScript and bundlers.
const slab = orientedSlab;
const xform = KIT.xform as (
  geometry: unknown,
  x?: number,
  y?: number,
  z?: number,
  rotationX?: number,
  rotationY?: number,
  rotationZ?: number,
  scale?: number | readonly number[],
) => THREE.BufferGeometry;

type Vec2Tuple = readonly [number, number];
type Vec3Tuple = readonly [number, number, number];
type NumericRow = readonly number[];
type ProfileCurve = readonly NumericRow[];

interface UKGeometryPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly q?: boolean;
  readonly spec: {
    readonly visual: {
      readonly number?: string;
      bakeDirtDeckEq?: boolean;
    };
  };
  topY?: number;
  add(
    slot: string,
    geometry: unknown,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: number | readonly number[],
  ): unknown;
  addEquipment(
    slot: string,
    geometry: unknown,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: number | readonly number[],
  ): unknown;
  decal(
    owner: 'hull' | 'turret',
    kind: string,
    label: string | null,
    scale: number,
    position: readonly number[],
    ...orientation: number[]
  ): unknown;
}

interface UKGunPort extends UKGeometryPort {
  addGunExtra(geometry: unknown, ...transform: number[]): unknown;
  addGunExtraDark(geometry: unknown, ...transform: number[]): unknown;
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

interface UKCenturionPort extends UKMaterialPort {
  readonly rng: () => number;
  addGunExtra(geometry: unknown, ...transform: number[]): unknown;
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
  readonly wheelW?: number;
  readonly wheelY?: number;
  readonly wheelStyle?: string;
  readonly coveredTop?: boolean;
  readonly arms?: boolean;
  readonly padHex?: number;
  readonly chainHex?: number;
  readonly tireHex?: number;
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
  readonly wheelHex?: number;
  readonly wheelEnv?: number;
  readonly drumHex?: number;
  readonly drumEnv?: number;
  readonly ringHex?: number;
  readonly ringEnv?: number;
  readonly padHex?: number;
  readonly padEnv?: number;
  readonly chainHex?: number;
  readonly chainEnv?: number;
  readonly bandMul?: readonly [number, number, number];
  readonly bandEnv?: number;
  readonly spareHex?: number;
  readonly tireEmissive?: number;
}

interface ClassicUKProfileOptions {
  readonly width: number;
  readonly hullLength: number;
  readonly roofY: number;
  readonly bandY: number;
  readonly trackW: number;
  readonly bowZ: number;
  readonly bowY: number;
  readonly noseTipY: number;
  readonly tailTrim: number;
  readonly wheels: number;
  readonly wheelR: number;
  readonly wheelSpan: number;
  readonly gunLength: number;
  readonly noBins?: boolean;
  readonly bandHalfW?: number;
  readonly apronY?: number;
  readonly sprocketInset?: number;
  readonly lowerBandY?: number;
  readonly lowerSeamY?: number;
  readonly trackXc?: number;
  readonly mgBall?: boolean;
  readonly corridorY?: number;
  readonly guardY?: number;
  readonly hornY?: number;
  readonly wheelBias?: number;
  readonly rollers?: readonly TrackWheel[];
}

const buildRunningGear = KIT.buildRunningGear as (
  builder: UKGeometryPort,
  options: Record<string, unknown>,
) => void;
const buildGun = KIT.buildGun as (
  builder: UKGeometryPort,
  options: Record<string, unknown>,
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
function ukHull(P: UKGeometryPort, g: UKHullOptions): void {
  const bw = g.bodyHalfW;
  const bowZ = g.noseRake[0][0];
  const sternZ = g.tailRake[0][0];
  const innerW = g.lowerHalfW ?? (g.trackXc - g.trackW / 2 - 0.02);
  P.add('hull', box(innerW * 2, g.beltTop - g.belly, (bowZ - sternZ) + 0.4),
    0, (g.beltTop + g.belly) / 2, (bowZ + sternZ) / 2);
  // TRACK CONTAINMENT (owner law 2026-08-03, GEOMETRY-GATE.md #4): the bow/
  // stern rake lofts must stay OUT of the track channel — g.rakeHalfW pins
  // the below-deck rake width to the inter-track span where the wrap arcs
  // and climbing runs live. Silhouettes are unchanged: the tracks own those
  // side/front columns by construction.
  const rakeW = g.rakeHalfW ?? bw * 0.96;
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
  const tailShelf = g.tailShelf;
  if (tailShelf) {
    loftBand(P, 'hull', g.rakeHalfW ?? bw * 0.94, 0.04, g.deck, () => tailShelf.yBot, tailShelf.z0, tailShelf.z1);
  }
  // Fender plates over the tracks. Outer edge defaults to the track edge;
  // g.fenderHalfW/g.fenderHalfWL pin it (right/left) so the widest full-length
  // plane reads the published width without breaching the width guard.
  if (g.fenderY) {
    // NO-STAIRCASES opt-in (challenger1 bow course, §B1 law 5f4cfae): the
    // FLAT fender plane may end short of g.fenderZ1 (g.fenderPlaneZ1) so a
    // single raked guard course can carry the bow line from there — the
    // plate+fill stop at the plane end, the mud flaps keep the g.fenderZ1
    // anchor. Default = g.fenderZ1: byte-identical for every other caller.
    const planeZ1 = g.fenderPlaneZ1 ?? g.fenderZ1;
    for (const side of [-1, 1]) {
      const outer = side < 0 ? (g.fenderHalfWL ?? g.fenderHalfW ?? (g.trackXc + g.trackW / 2 + 0.02))
        : (g.fenderHalfW ?? (g.trackXc + g.trackW / 2 + 0.02));
      const inner = g.trackXc - g.trackW * 0.55;
      // Opt-in z-segmentation (g.fenderSegLen, default OFF = the original
      // single box): the gate's 14 station slices render front-on — an
      // axis-aligned thin plane paints ONLY its end caps there, so a
      // full-length fender vanishes from every mid slice and the measured
      // station width collapses to the track band (chieftain5 vertex r3
      // finding). Splitting the plate puts end caps in every slice; the
      // union silhouette is unchanged.
      if (g.fenderSegLen) {
        const n = Math.ceil((planeZ1 - g.fenderZ0) / g.fenderSegLen);
        const d = (planeZ1 - g.fenderZ0) / n;
        for (let k = 0; k < n; k++) {
          P.add('hullDetail', box(outer - inner, 0.035, d),
            side * (inner + outer) / 2, g.fenderY, g.fenderZ0 + d * (k + 0.5));
        }
      } else {
        P.add('hullDetail', box(outer - inner, 0.035, planeZ1 - g.fenderZ0),
          side * (inner + outer) / 2, g.fenderY, (g.fenderZ0 + planeZ1) / 2);
      }
      // plate-fill r1 (owner directive 2026-08-01, GEOMETRY-GATE.md "Plate
      // fill rule"): the flat fender plane rides ABOVE the deck line where
      // the glacis/tail falls away — the open wedge between the plate
      // underside and the hull top read as a see-through shell from every
      // low angle (centurion bow: a 0.3 m sky wedge THROUGH the vehicle).
      // Close it with lofted mudguard solids from the deck line up to the
      // plate wherever the deck drops below it. Silhouette-inert by
      // construction: the fill lives inside the plate's own plan footprint,
      // under its 1.6-line side columns, and inside front columns already
      // banded by the plate edge + skirts/tracks.
      const fy = g.fenderY - 0.004;
      const zKnots = [...new Set([g.fenderZ0, planeZ1,
        ...g.deck.map((p) => p[0]).filter((z) => z > g.fenderZ0 && z < planeZ1)]
        .map((z) => Number(z.toFixed(4))))].sort((a, b) => b - a);
      for (let i = 0; i < zKnots.length - 1; i++) {
        const zf = zKnots[i], zr = zKnots[i + 1];
        const df = Math.min(lineAt(g.deck, zf), fy), dr = Math.min(lineAt(g.deck, zr), fy);
        if (fy - df < 0.02 && fy - dr < 0.02) continue;
        const xi = Math.min(side * inner, side * outer), xo = Math.max(side * inner, side * outer);
        P.add('hull', slab(
          [xi, df, zf], [xo, df, zf], [xo, dr, zr], [xi, dr, zr],
          [xi, fy, zf], [xo, fy, zf], [xo, fy, zr], [xi, fy, zr]));
      }
    }
  }
  // Optional armored skirts (measured plane).
  if (g.skirt) {
    const sk = g.skirt;
    const panels = g.skirtPanels ?? 6;
    const panelD = (sk.z1 - sk.z0) / panels;
    // g.skirtW opt-in (challenger1 push-2): thin armour-sheet skirts — the
    // CR1 ref's plane face sits at 1.578, inside the 0.05-plate's §B4
    // clearance to the 1.527/1.535 pad/band envelope. Default 0.05 =
    // byte-identical for chieftain5/centurions/fv510.
    const skW = g.skirtW ?? 0.05;
    // g.skirtHemSplit opt-in (centurion5 tone round, r6 O1 "expose the
    // running gear"): per-panel hem split on the chieftain5 LEFT-HEM-PARITY
    // precedent — panels across the wheel span raise their hem to the ref's
    // own exposed-disc line while listed keepPanels retain the low sk.bot
    // course. Front/rear rows read the MIN bottom over all z (interval-mask
    // law, chieftain r5 bank #10), so one kept panel preserves every
    // ±skirt-column read; side bottoms are track-owned under the whole
    // span; station widths ride the skirt TOP band (y max), unchanged.
    // Default undefined -> byte-identical (chieftain5/centurion3/fv510).
    const hemBot = (k: number) => (g.skirtHemSplit && !g.skirtHemSplit.keepPanels.includes(k))
      ? g.skirtHemSplit.bot : sk.bot;
    for (const side of [-1, 1]) {
      for (let k = 0; k < panels; k++) {
        const z = sk.z1 - panelD / 2 - k * panelD;
        const b = hemBot(k);
        P.add('hull', box(skW, sk.top - b, panelD * 0.97), side * (sk.x - skW / 2), (sk.top + b) / 2, z);
        if (P.q) {
          P.add('hullDark', box(skW, (sk.top - b) * 0.9, 0.016), side * (sk.x - skW * 0.4), (sk.top + b) / 2, z - panelD / 2);
          P.add('hullDetail', box(0.02, 0.05, 0.2), side * (sk.x + 0.005), sk.top - 0.1, z);
        }
      }
      // g.skirtTrimFlush opt-in (challenger1 push-2): the rubber trim strip
      // rode sk.top+0.02 (top face +0.0375 PROUD of the armour line) — on a
      // course-true 1.624 skirt it re-painted the fifteen mid side_hull
      // columns the top retune had just fixed. Flush mounts tuck it 0.008
      // under the top edge. Default = the original proud seat (byte-
      // identical for chieftain5/centurions/fv510).
      P.add('hullDark', box(0.014, 0.035, sk.z1 - sk.z0 - 0.1), side * (sk.x - 0.01),
        sk.top + (g.skirtTrimFlush ? -0.0255 : 0.02), (sk.z0 + sk.z1) / 2);
    }
  }
  buildRunningGear(P, {
    // g.wheelW is an r4 opt-in (default = the original formula, byte
    // identical): chieftain5's pad band narrowed to the ref's measured
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
    // shade — the chieftain5 'teeth zipper' read). All undefined for every
    // other caller — buildRunningGear defaults are byte-identical.
    padHex: g.padHex, chainHex: g.chainHex, tireHex: g.tireHex,
    gearFloor: g.gearFloor,
    // uk r6 opt-ins (centurion 90-push): ramp-pad corner floor + pinned
    // contact patch (both undefined for every other caller — byte-identical).
    contactZF: g.contactZF, contactZR: g.contactZR,
  });
  // Mud flaps hang from the FENDER TIPS (hanging them at the hull nose/tail
  // left them floating over the raked plates -> articulation floaters).
  // g.flapDrop is an r4 opt-in (default 0, byte identical): chieftain5's
  // front flap top read over the ref's bare 1.52 glacis-deck columns.
  for (const side of [-1, 1]) {
    if (!g.noFlaps && g.fenderY) {
      const fd = g.flapDrop ?? 0;
      P.add('hullRubber', box(g.trackW * 0.9, 0.26, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.10 - fd, g.fenderZ1 - 0.025, -0.06, 0, 0);
      P.add('hullRubber', box(g.trackW * 0.9, 0.24, 0.03), side * (g.trackXc + 0.02), g.fenderY - 0.09, g.fenderZ0 + 0.025, 0.06, 0, 0);
    }
  }
  // Side number decals. Opt-in overrides (g.numberR/g.numberL/g.numberSize)
  // let a build pin them onto real side planes — the decal quad is mask
  // geometry, so a default position off the body's silhouette band costs
  // gate columns (chieftain5 vertex r3 finding). Defaults byte-identical.
  const numS = g.numberSize ?? 0.38;
  const numR = g.numberR ?? [bw + 0.01, (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0];
  const numL = g.numberL ?? [-(bw + 0.01), (g.beltTop + (g.fenderY ?? g.beltTop)) / 2, g.nose - 2.0];
  P.decal('hull', 'number', P.spec.visual.number || '', numS, numR, Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', numS, numL, -Math.PI / 2);
}

// ---------------------------------------------------------------------------
// Chieftain Mk.5 — full from-scratch build (recovered oracle, repaired rig).
// Round-2 retable against the BATCH-5 REPAIRED oracle (369 stranded turret
// members — chin casting band, discharger banks, searchlight face, cupola
// glass, rack contents, waist kit — absorbed into the turret; the old
// "split-rig mirror" cert is OBSOLETE). Fresh curves: bare hull deck 1.56-
// 1.61 mid, fender crests 1.69/1.71 only at z ~1.7 and -1.7..-2.35, bow
// bottom on the ground to z 2.42 then rising to a 0.83-0.97 blade tip, tail
// rake from -2.35 to the 1.05 shelf. The casting waist, collar, cupola and
// flank racks all live in the TURRET buckets now (they yaw together).
// VERTEX r3 retable (post-warp oracle, law v2 665aa7f): the warped print now
// reads published dims straight (hull mask 7.522, overall 10.788, top 2.928)
// — hull span pinned to the mask, glacis tip pulled to the print's 3.47
// CENTER notch (the 3.75 bow line belongs to the fender WINGS, built in the
// build fn), rear sprocket moved to the print's HIGH rear station (the
// climbing-run line 0.03@-2.47 -> 0.66@-3.57 is the track's own rear climb).
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

const CHIEFTAIN_HULL = {
  bodyHalfW: 1.53, nose: 3.47,
  // r4: glacis dip re-knotted to the UNSHIFTED workorder columns (the r3
  // table was tuned against dAlong-poisoned sampling, see the wing-tip note
  // in the build fn) and the tail deck raised to the ref's 1.71 line.
  deck: [[3.47, 1.205], [3.28, 1.30], [3.10, 1.35], [2.88, 1.33], [2.72, 1.325],
    [2.62, 1.375], [2.52, 1.425], [2.42, 1.475], [2.16, 1.49], [2.08, 1.545],
    [1.88, 1.555], [1.62, 1.56], [1.10, 1.58], [0.30, 1.60], [-0.60, 1.61],
    [-1.35, 1.64], [-1.76, 1.705], [-2.47, 1.71], [-2.60, 1.71], [-3.30, 1.71],
    [-3.44, 1.695], [-3.58, 1.70], [-3.70, 1.72]],
  // Belly raised to the ref's cast floor line (front-view bottoms 0.49-0.56
  // across the inter-track band — the flat 0.50 slab read 0.02-0.06 low on
  // ~30 front columns). The keel/V-profile/channel pieces in the build fn
  // carry the measured cross-section; rakes start at the same 0.56 line.
  beltTop: 1.02, belly: 0.56,
  // Closed over-track soffit: retain the full central hull and the complete
  // outer guard walls, but carry the concealed sponson floor above the
  // native return run instead of through it. This is a connected solid,
  // not an open/deleted side-hull corridor.
  lowerHalfW: 1.02,
  deckCorridor: { x: 1.02, floor: 1.40, z0: -2.35, z1: 2.58 },
  noseRake: [[2.55, 0.56], [2.90, 0.575], [3.20, 0.62], [3.38, 0.69], [3.47, 0.75]],
  tailRake: [[-2.30, 0.56], [-2.72, 0.575], [-3.08, 0.60], [-3.42, 0.64], [-3.60, 0.68]],
  tailShelf: { z0: -3.60, z1: -3.62, yBot: 1.06 },
  // The supplied Mk.5 reference has the same continuous, symmetric shelf as
  // the Mk.10: a shallow fender over each course and a six-piece armoured
  // skirt outside it.  The earlier asymmetric print interpretation left the
  // right return run bare and made the wide shoes intersect the missing
  // skirt plane in normal three-quarter views.
  fenderY: 1.575, fenderZ0: -3.70, fenderZ1: 1.9, fenderHalfW: 1.75, fenderHalfWL: 1.75,
  fenderSegLen: 0.45,
  rakeHalfW: 0.86, // containment law: rake lofts clear of the track channel (dilated)
  // 610 mm course at the family running datum.  Its 1.725 m outer face now
  // sits 25 mm inside the 1.750 m skirt face, eliminating the old track-
  // through-skirt failure while retaining the real over-track stance.
  trackXc: 1.42, trackW: 0.61, wheelW: 0.20, flapDrop: 0.055,
  // r5 O2a gear tones (critic: guide-horn/pad luma p5 3-7 as 'glitch zipper
  // teeth' on pale discs vs the ref's whole-zone 26..76 band): the russia
  // r-series dark-olive recipe + gearFloor ambient re-attach.
  padHex: 0x343a29, chainHex: 0x2b3122, gearFloor: true,
  wheelR: 0.33, wheelY: 0.38, wheelStyle: 'rubber',
  wheelZs: [2.3, 1.42, 0.54, -0.34, -1.22, -2.1],
  // HIGH rear drive sprocket (the real Chieftain layout; the warped print's
  // hull-mask rear bottom line is the climb from the last wheel to this
  // wrap: 0.03@-2.47 rising ~0.53/m to 0.66@-3.57, wrap ending ~-3.60).
  // §B6 TRACK-RUN SILHOUETTE (owner law 2026-08-04, graduate-change round):
  // the r4 idler sat at ROAD-WHEEL height (y 0.42 vs wheelY 0.38) so the
  // band curled to ground at the bow — the parallelogram read the owner
  // flagged ("tracks are the shape \________/ not /_____/"). RAISED to
  // y 0.64: the idler top wrap meets the return-run roller line
  // (0.955) so the top run flows level into the idler like the real
  // Chieftain, the band top face (1.01) stays a §B4-clean 10 mm under the
  // belt loft bottom (beltTop 1.02 — y 0.635 clipped it by 5 mm, audit 24
  // vox), and the contact tangent builds a real ~42° approach ramp from
  // the first road wheel (ramp 2.465,0.055 -> 2.81,0.36, wrap bottom
  // 0.275. The recovered Mk.5 source places the front idler 0.86 road-wheel
  // pitches ahead of the first station; z 3.02 carries that relationship
  // into the authored 0.88 m cadence and tucks the wrap beneath the raised
  // mudguard shoulder instead of leaving it stranded behind the bow. The
  // ORACLE PRINT carries the low-idler defect (its
  // whole-mask bow bottoms: 0 @ z 2.51, 0.091 @ 2.88, 0.183 @ 3.00 — the
  // print's own band grounds to ~2.9); owner law outranks oracle matching
  // (M1-slope precedent) — the residual on side cols z 2.55..3.02 is
  // measured and certified in the packet §B6 section.
  sprocket: { z: -3.10, y: 0.875, r: 0.30 }, idler: { z: 3.02, y: 0.64, r: 0.3 },
  rollers: [{ z: 1.45, y: 0.82, r: 0.09 }, { z: 0.1, y: 0.82, r: 0.09 }, { z: -1.25, y: 0.82, r: 0.09 }],
  trackTop: 0.98, arms: true,
  // A recessed lower tub and closed upper sponsons leave the complete outer
  // deck intact while keeping every non-running-gear solid clear of the
  // animated shoe envelope.  The physical skirts sit just outside the
  // 1.725 m course face, including their recessed seam/trim geometry.
  skirt: { x: 1.765, top: 1.555, bot: 0.79, z0: -2.85, z1: 2.45 },
  skirtPanels: 6, skirtW: 0.025, skirtTrimFlush: true,
  // Decals sit on the new physical skirt faces instead of floating on the
  // former asymmetric fender/bin envelope.
  numberSize: 0.34, numberR: [1.773, 1.18, 0.0], numberL: [-1.773, 1.18, 0.0],
};

/**
 * Chieftain bow wings are pressed armor shells, not a stack of horizontal
 * shelves.  This continuous outer web closes the idler-side daylight while
 * a shallow upper flange carries the load back into the glacis.  Keeping the
 * web outside the 1.725 m shoe plane preserves the complete animated course.
 */
function addChieftainClosedShoulderMudguards(
  P: UKBuilderPort,
  profile: 'chieftain5' | 'chieftain_mk10',
): void {
  const labels: string[] = [];
  for (const s of [-1, 1] as const) {
    const side = s < 0 ? 'left' : 'right';
    const order = (ring: readonly Vec3Tuple[]): [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple] => {
      const mirrored = ring.map(([x, y, z]): Vec3Tuple => [s * x, y, z]);
      return (s < 0
        ? [mirrored[1], mirrored[0], mirrored[3], mirrored[2]]
        : mirrored) as [Vec3Tuple, Vec3Tuple, Vec3Tuple, Vec3Tuple];
    };

    const webLabel = `${profile}-front-mudguard-${side}-closed-web`;
    labels.push(webLabel);
    MUDGUARDS.add(P, {
      label: webLabel,
      bucket: 'hull',
      material: 'painted-steel',
      geometry: slab(
        ...order([[1.735, 1.06, 2.88], [1.795, 1.06, 2.88], [1.795, 0.83, 3.76], [1.735, 0.83, 3.76]]),
        ...order([[1.735, 1.42, 2.88], [1.795, 1.42, 2.88], [1.795, 1.06, 3.76], [1.735, 1.06, 3.76]])),
      x: 0, y: 0, z: 0, support: false,
    });

    const flangeLabel = `${profile}-front-mudguard-${side}-shoulder-flange`;
    labels.push(flangeLabel);
    MUDGUARDS.add(P, {
      label: flangeLabel,
      bucket: 'hull',
      material: 'painted-steel',
      geometry: slab(
        ...order([[0.94, 1.28, 2.82], [1.76, 1.28, 2.82], [1.76, 1.09, 3.46], [0.94, 1.09, 3.46]]),
        ...order([[0.94, 1.43, 2.82], [1.76, 1.43, 2.82], [1.76, 1.24, 3.46], [0.94, 1.24, 3.46]])),
      x: 0, y: 0, z: 0, support: false,
    });
  }
  P.hullG.userData.chieftainShoulderMudguardReceipt = Object.freeze({
    profile,
    architecture: 'continuous-sloped-outer-web-with-glacis-flange',
    labels: Object.freeze(labels),
    sides: 2,
    partsPerSide: 2,
    closedSideVolume: true,
    steppedShelvesVisibleFromSide: false,
    outerWebInnerHalfWidthM: 1.735,
    trackOuterHalfWidthM: 1.725,
    trackClearanceM: 0.010,
    shoulderInnerHalfWidthM: 0.94,
    shoulderFrontZM: 3.46,
  });
}

function chieftain5Build(P: UKBuilderPort): void {
  const g = CHIEFTAIN_HULL;
  ukHull(P, g);
  const { rng } = P;
  // Bow fender WINGS, r4 retable to UNSHIFTED columns. r3's wing tip carried
  // a 0.28-0.30 m band through the LAST side column (3.6753..3.7967) while
  // the ref tip reads 0.214 there — with the 12%-of-height body threshold at
  // 0.267 that single column made the PROC body span one column longer than
  // the ref's, shifting side dAlong by half a pitch (+0.061) and smearing
  // every sharp side transition (REGISTRATION POISONING, BUILD-STANDARD §C).
  // The W3 tip now reads ~0.25 band (thin) and the ref's own bow lines are
  // followed piecewise: top 1.34@3.05 -> 1.22@3.43 -> 1.035@3.63 -> 1.03 at
  // the 3.755 tip; bottom 0.22@3.05 -> 0.56@3.43 -> 0.76@3.63 -> 0.82.
  // Left band full-width (certified left-fender asymmetry), right stops at
  // the 1.545 plane (ref station 13 width 1.542).
  const bowWingCourses: ReadonlyArray<readonly [NumericRow | null, NumericRow, NumericRow]> = [
    [[-1.716, -1.077], [-1.716, -1.04], [-1.716, -1.04]],
    [null, [0.78, 0.83], [0.78, 0.83]],
    [[0.875, 1.484], [0.875, 1.523], [0.875, 1.523]],
  ];
  for (const [xw1, xw2a, xw2b] of bowWingCourses) {
    if (xw1) {
      // r5: W1 underside lifted 0.22 -> 0.30 at the z 3.05 heel — the ref's
      // 3.123 side column bottoms at 0.305 (the old heel read 0.244, the
      // r4 worst-3 side column). Front bottoms are track/tab-owned, so this
      // is side-only; the corner flap above closes the taller bay.
      P.add('hull', slab(                                  // W1 glacis wing / idler mudguard
        [xw1[0], 1.08, 3.43], [xw1[1], 1.08, 3.43], [xw1[1], 1.10, 3.05], [xw1[0], 1.10, 3.05],
        [xw1[0], 1.25, 3.43], [xw1[1], 1.25, 3.43], [xw1[1], 1.34, 3.05], [xw1[0], 1.34, 3.05]));
    }
    P.add('hull', slab(                                    // W2a shoulder
      [xw2a[0], 0.94, 3.55], [xw2a[1], 0.94, 3.55], [xw2a[1], 1.08, 3.43], [xw2a[0], 1.08, 3.43],
      [xw2a[0], 1.235, 3.55], [xw2a[1], 1.235, 3.55], [xw2a[1], 1.25, 3.43], [xw2a[0], 1.25, 3.43]));
    P.add('hull', slab(                                    // W2b ledge
      [xw2b[0], 0.75, 3.616], [xw2b[1], 0.75, 3.616], [xw2b[1], 0.72, 3.55], [xw2b[0], 0.72, 3.55],
      [xw2b[0], 1.22, 3.616], [xw2b[1], 1.22, 3.616], [xw2b[1], 1.235, 3.55], [xw2b[0], 1.235, 3.55]));
    P.add('hull', slab(                                    // W3 thin tip
      [xw2b[0], 0.84, 3.755], [xw2b[1], 0.84, 3.755], [xw2b[1], 0.75, 3.616], [xw2b[0], 0.75, 3.616],
      [xw2b[0], 1.045, 3.755], [xw2b[1], 1.045, 3.755], [xw2b[1], 1.045, 3.616], [xw2b[0], 1.045, 3.616]));
  }
  // Shallow wing-root caps close the high-angle pockets between the narrow
  // bow rake and the mudguard courses.  Their inner edge stays inboard of
  // the native track while their top follows the existing W1 shoulder.
  for (const s of [-1, 1]) {
    const xa = Math.min(s * 0.84, s * 1.10), xb = Math.max(s * 0.84, s * 1.10);
    P.add('hull', slab(
      [xa, 1.10, 3.05], [xb, 1.10, 3.05], [xb, 1.08, 3.43], [xa, 1.08, 3.43],
      [xa, 1.34, 3.05], [xb, 1.34, 3.05], [xb, 1.25, 3.43], [xa, 1.25, 3.43]));
  }
  P.add('hull', slab(
    [1.523, 0.82, 3.755], [1.556, 0.82, 3.755], [1.556, 0.80, 3.55], [1.523, 0.80, 3.55],
    [1.523, 1.045, 3.755], [1.556, 1.045, 3.755], [1.556, 1.13, 3.55], [1.523, 1.13, 3.55]));
  addChieftainClosedShoulderMudguards(P, 'chieftain5');
  for (const s of [-1, 1]) P.add('hull', box(0.21, 0.06, 0.62), s * 0.945, 1.02, 2.81);
  // Right inner-track ground filler: the certified left-shifted print
  // grounds |x| 0.89..1.05 on the RIGHT side only (left track owns
  // 1.05..1.49 on both) — a dark sponson-shadow wall fills the band.
  segBoxZ(P, 'hullRunningGearDark', 0.225, 0.456, 4.8, 1.0025, 0.228, 0);
  segBoxZ(P, 'hullRunningGearDark', 0.045, 0.05, 4.4, 1.4625, 0.025, -0.1);
  segBoxZ(P, 'hullRunningGearDark', 0.045, 0.05, 4.4, -1.4625, 0.025, -0.1);
  segBoxZ(P, 'hullRunningGearDark', 0.04, 0.05, 4.4, -1.0965, 0.025, -0.1);
  // Cast belly cross-section (ref front-view floor): center keel line at
  // 0.46 (x -0.14..-0.09 — the print's 0.08 left shift), a shallow V rising
  // 0.49 -> 0.555 outboard, and the two deep sponson-floor channels at 0.37
  // (right 0.766..0.875 with a 0.44 step at 0.705..0.736, left
  // -0.959..-1.068) the probe located at z ~2.56 by the idler.
  P.add('hull', box(0.05, 0.10, 3.4), -0.115, 0.51, 0.2);
  // r5 O4d: cast belly V steepened to the evaluator's ±5.5° class (proc
  // read 0°/179.5° where the ref rises 5.6° front / 4.9° rear). Two-segment
  // per side, fitted to the ref's own front columns: left 0.512@-0.37 /
  // 0.561@-0.803, right 0.551@0.575 (the r4 flat 0.49->0.555 sat 0.02 low
  // mid-span and read level).
  // z-span runs under BOTH rake lofts (2.55/-2.30) — the rake loft bottom
  // edges are x-flat at 0.56 and owned the evaluator's 0-degree read even
  // after the V landed mid-hull; the V bottoms (0.49..0.5645) hang below
  // and give the front/rear faces the ref's rising lower edge. Front
  // columns are unchanged (same profile, longer span).
  P.add('hull', slab(
    [-0.40, 0.513, 2.55], [-0.03, 0.49, 2.55], [-0.03, 0.49, -2.3], [-0.40, 0.513, -2.3],
    [-0.40, 0.62, 2.55], [-0.03, 0.62, 2.55], [-0.03, 0.62, -2.3], [-0.40, 0.62, -2.3]));
  P.add('hull', slab(
    [-0.90, 0.5715, 2.55], [-0.40, 0.513, 2.55], [-0.40, 0.513, -2.3], [-0.90, 0.5715, -2.3],
    [-0.90, 0.62, 2.55], [-0.40, 0.62, 2.55], [-0.40, 0.62, -2.3], [-0.90, 0.62, -2.3]));
  P.add('hull', slab(
    [0.03, 0.49, 2.55], [0.60, 0.5525, 2.55], [0.60, 0.5525, -2.3], [0.03, 0.49, -2.3],
    [0.03, 0.62, 2.55], [0.60, 0.62, 2.55], [0.60, 0.62, -2.3], [0.03, 0.62, -2.3]));
  P.add('hull', slab(
    [0.60, 0.5525, 2.55], [0.90, 0.5645, 2.55], [0.90, 0.5645, -2.3], [0.60, 0.5525, -2.3],
    [0.60, 0.62, 2.55], [0.90, 0.62, 2.55], [0.90, 0.62, -2.3], [0.60, 0.62, -2.3]));
  P.add('hullDark', box(0.109, 0.21, 0.5), -1.0135, 0.475, 2.45);
  P.add('hullDark', box(0.109, 0.21, 0.5), 0.8205, 0.475, 2.45);
  P.add('hullDark', box(0.022, 0.15, 0.5), 0.755, 0.515, 2.45);
  // Glacis furniture: flush splash rail, driver periscope, headlight pods
  // (the print's 1.385 bump at z 2.94..3.02), shackles.
  P.add('hullDetail', box(1.7, 0.02, 0.08), 0, deckAtUK(g, 2.42) + 0.01, 2.42);
  // r5 O3b: the kit periscope's pale-blue glass band read as a blue chip on
  // the glacis (ref driver periscope is dark) — hand-built with a dark visor.
  P.add('hullDetail', box(0.14, 0.07, 0.1), -0.3, deckAtUK(g, 1.95) + 0.01, 1.95);
  P.add('hullDark', box(0.11, 0.032, 0.104), -0.3, deckAtUK(g, 1.95) + 0.022, 1.95);
  for (const side of [-1, 1]) {
    headlight(P, side * 1.15, 1.33, 2.96, -0.2);
    // r5 O3b: blackout covers over the kit lenses — the pale-blue glass
    // chips popped on the glacis where the ref's lamps read dark.
    P.add('hullDark', xform(cylZ(0.046, 0.014, 12), 0, 0, 0.052), side * 1.15, 1.33, 2.96, -0.2, 0, 0);
    P.add('hullDetail', box(0.24, 0.02, 0.18), side * 1.15, 1.385, 2.96, -0.25, 0, 0);
    P.add('hullDetail', box(0.11, 0.1, 0.15), side * 0.9, 0.66, 3.30);
    P.add('hullDetail', torus(0.065, 0.017, 10), side * 0.9, 0.66, 3.41, Math.PI / 2, 0, 0);
    // Fender crest plates: the live warped-ref side tops ~1.70 only across
    // z 1.38..1.57 (the 1.53 deck line resumes beyond) and 1.72 over the
    // engine bay — mid-run fenders sit under the deck line. r4: front plate
    // 15 mm clear of the 1.3603 column boundary (AA law) and outer edges
    // pulled to the ref's own station widths (1.51 fwd / 1.53 aft).
    P.add('hullDetail', box(0.34, 0.03, 0.20), side * 1.34, 1.685, 1.475);
    P.add('hullDetail', box(0.38, 0.03, 1.3), side * 1.34, 1.695, -2.02);
    // plate-fill r1 (owner directive 2026-08-01): both crest plates floated
    // 9 cm ABOVE the fender plane with a see-through slot beneath — they
    // are raised stowage bins on the real vehicle. Close plate-to-fender
    // (tops tuck under the plates; interior to their side/plan columns).
    P.add('hullDetail', box(0.34, 0.085, 0.20), side * 1.34, 1.6375, 1.475);
    P.add('hullDetail', box(0.38, 0.085, 1.3), side * 1.34, 1.6375, -2.02);
  }
  // Engine deck: louvre field + fuel caps + rear grille face.
  P.add('hull', box(2.2, 0.04, 1.15), 0, 1.685, -2.65);
  for (const i of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDark', box(2.05, 0.018, 0.05), 0, 1.70, -2.2 - i * 0.17);
  }
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.03, 10), side * 1.15, 1.715, -1.9);
  // Tail kit, r4 retable to the ref's measured rear planes (probe: band
  // 1.176..1.68 at z -3.74, ref rear extent -3.768; plan rear line by
  // column: -3.71 left exhaust box, -3.61 recessed center, -3.72 tow plate,
  // -3.76 right exhaust run, -3.70 right outer). The right exhaust run's
  // -3.79 face is the hull-mask z0 (published-hull-length rear anchor) and
  // reliably paints the -3.819 side column the ref's own 1px sliver paints.
  P.add('hullDark', box(1.16, 0.5, 0.03), 0, 1.32, -3.60);
  P.add('hull', box(0.165, 0.63, 0.115), -0.8175, 1.375, -3.6575);
  P.add('hull', box(0.235, 0.63, 0.105), 0.7475, 1.375, -3.6525);
  P.add('hull', box(0.477, 0.475, 0.19), 0.3685, 1.3375, -3.695); // right exhaust run
  P.add('hull', box(0.59, 0.08, 0.125), -0.165, 1.615, -3.6625);  // tow-plate overhang
  P.add('hull', box(0.477, 0.08, 0.19), 0.3685, 1.615, -3.695);   // shelf over the exhausts
  P.add('hullDetail', box(1.9, 0.05, 0.05), 0, 1.66, -3.595);
  P.add('hullDark', cylZ(0.055, 0.016, 10), 0.37, 1.28, -3.782);
  // Right under-fender sponson strip: the ref carries structure to the
  // -3.70 tail at x 0.99..1.10 (plan col 1.048) where the fender's own
  // 17 mm column sliver is an AA coin-flip. The webs inboard close the
  // top-down pockets between the exhaust boxes and the fenders (§B2 hole
  // scan flagged 10 cells each side at x ±0.9, z -3.45).
  P.add('hull', box(0.11, 0.055, 0.55), 1.045, 1.5325, -3.425);
  P.add('hull', box(0.11, 0.055, 0.55), -1.045, 1.5325, -3.425);
  P.add('hull', box(0.36, 0.05, 0.55), 0.925, 1.535, -3.425);
  P.add('hull', box(0.36, 0.05, 0.55), -0.925, 1.535, -3.425);
  towCableUK(P, [[-1.0, 1.44, 2.2], [0, 1.56, 1.7], [1.0, 1.44, 2.2]], 1.37);
  // The former fender-owned storage boxes are intentionally absent here.
  // Both Chieftains now carry their long side boxes on the yawing turret,
  // where the common upper builder can angle and bury them into the cheeks.
  // The former oracle-specific left guard and right belt strips are gone.
  // They occupied the native course volume and became redundant once the
  // source-correct symmetric six-panel skirts above were restored.
  // The five wheel-gap tabs shrink to ground stubs (h 0.625 -> 0.10): the
  // -1.51..-1.71 front-column GROUND reads ride the stub bottoms exactly as
  // before (0.005), the 0.10..0.63 band was interval-interior, and the
  // 'dark teeth over the gear' 3/4 read dies with the pillar mass.
  for (const zTab of [1.86, 0.98, 0.10, -0.78, -1.66]) {
    P.add('hullRunningGearDark', box(0.203, 0.10, 0.045), -1.6115, 0.055, zTab);
  }
  // Wheel-bay backdrop: with the hem raised the wheel gaps see the olive
  // belt face — a near-black panel inboard of the wheel faces keeps the
  // bays reading as shadow (ref gear-zone p5 ~26). Interval-interior on
  // every row (top deck-owned, bottom track-owned, plan wing-owned).
  P.add('hullRunningGearDark', box(0.02, 0.66, 5.0), -1.105, 0.43, 0.075);
  // r5 O2b, source-proportion re-seat: retain both corner flaps but rake
  // them into the forward shoulder cap. The native idler now occupies the
  // bay beneath them, so the flaps close the mudguard crown rather than
  // standing through the animated shoe orbit.
  // hullTrack matches the ref's warm dusty flap/track tone (measured
  // rgb ~(69,63,53)).
  P.add('hullTrack', box(0.6393, 0.34, 0.08), -1.39365, 1.00, 3.50, -0.24, 0, 0);
  P.add('hullTrack', box(0.5957, 0.34, 0.08), 1.17965, 1.00, 3.50, -0.24, 0, 0);
  for (const s of [-1, 1]) {
    const xo = s < 0 ? 1.75 : 1.53;
    segBoxZ(P, 'hullDetail', xo - 1.06, 0.03, 0.95, s * (1.06 + xo) / 2, 1.32, 2.35);
    segBoxZ(P, 'hullDetail', xo - 1.06, 0.03, 0.85, s * (1.06 + xo) / 2, 1.15, 3.2);
  }

  // ---- the FULL casting yaws (batch-5 repaired rig): waist + collar +
  // cupola + racks + crown + gun + masts, all in the turret buckets.
  // VERTEX r3 (post-warp): roofline RAISED to the warped ref — cupola crown
  // 2.90 at (x -0.88, z -0.24), sight housing 2.71 at (x -0.57, z -0.05),
  // masts KNEED to 2.93 at the ref's own three spike columns (z -1.02 whip,
  // z 0.49 twin sight masts) instead of the old 3.5-3.8 towers ----
  P.turretG.position.set(0, 1.72, 0.02);
  // r4: gun axis re-seated on the raycast-probed ref tube (y 1.856, x drift
  // centered at -0.125).
  P.gunG.position.set(-0.125, 0.136, 0.62);
  // Saucer crown (non-cupola crown 2.44-2.56 in the fresh curves).
  P.add('turret', KIT.lathe([
    [1.30, 0.13], [1.32, 0.30], [1.22, 0.46], [1.05, 0.565], [0.78, 0.635], [0.45, 0.66], [0.02, 0.665],
  ], 30, 1.25), 0, 0, -0.55);
  // r6 O1a CAST-READ: the reclined face was ONE canted quad chin->crown (the
  // critic's 'single canted cheek slab' driver in every 3/4 and both heroes).
  // Split into a center panel ON the original plane + two cheek facets
  // rotated back about their own bottom edges (outer-top corners pulled
  // -0.05/-0.033 along the face normal), the O4a chin-precedent pattern:
  // three normals grade the key light like the casting's roll. Silhouette
  // held: the bottom quad is byte-identical to the r5 slab's, the dropped
  // top corners (0.62 -> 0.570 at |x| 0.16..0.30) sit under the saucer dome
  // (r(0.62) covers to |x| ~0.84 at these z) and the cheek outer walls stay
  // under the 0.578 cheek-tier lid line, so no gate column moves.
  P.add('turret', slab(                                               // face center panel
    [-0.26, -0.28, 1.42], [0.26, -0.28, 1.42], [0.30, -0.25, 0.35], [-0.30, -0.25, 0.35],
    [-0.16, 0.62, 0.10], [0.16, 0.62, 0.10], [0.24, 0.655, -0.4], [-0.24, 0.655, -0.4]));
  P.add('turret', slab(                                               // right cheek facet
    [0.26, -0.28, 1.42], [0.55, -0.28, 1.42], [0.62, -0.25, 0.35], [0.30, -0.25, 0.35],
    [0.16, 0.62, 0.10], [0.30, 0.570, 0.066], [0.50, 0.607, -0.433], [0.24, 0.655, -0.4]));
  P.add('turret', slab(                                               // left cheek facet
    [-0.55, -0.28, 1.42], [-0.26, -0.28, 1.42], [-0.30, -0.25, 0.35], [-0.62, -0.25, 0.35],
    [-0.30, 0.570, 0.066], [-0.16, 0.62, 0.10], [-0.24, 0.655, -0.4], [-0.50, 0.607, -0.433]));
  // O1c: quarter-round brow bead where the face meets the crown (tangent
  // under the saucer dome — surface flush with the face plane, silhouette
  // covered by the dome above) + two diagonal beads down the cheek->crown
  // creases so the 3/4 shoulder transition reads rolled, not creased.
  P.add('turret', xform(cylX(0.05, 0.58, 12), 0, 0, 0), 0, 0.575, 0.145);
  for (const s of [-1, 1]) {
    P.add('turret', xform(cylZ(0.045, 0.56, 10), 0, 0, 0, 0.07, s * 0.38, 0), s * 0.335, 0.565, -0.14);
  }
  P.add('turret', slab(                                               // chin to the mantlet
    [-0.5, -0.31, 1.30], [0.5, -0.31, 1.30], [0.6, -0.31, 0.2], [-0.6, -0.31, 0.2],
    [-0.55, -0.28, 1.44], [0.55, -0.28, 1.44], [0.62, -0.25, 0.4], [-0.62, -0.25, 0.4]));
  // Casting waist band (ex-hull static works, absorbed by the oracle repair):
  // ring collar behind the gun. r4: the flat 2.40-wide/2.37-tall box painted
  // seven front columns 0.05-0.07 high — the ref waist SLOPES 2.35@|x|0.98
  // -> 2.27@1.44 (cast shoulders), so the collar narrows to ±0.98 and slab
  // shoulders carry the drop (left one ends at -1.30 under the flank bins).
  P.add('turret', box(1.80, 0.60, 0.90), 0, 0.35, -0.42);
  P.add('turret', slab(
    [0.90, 0.05, 0.03], [1.44, 0.05, 0.03], [1.44, 0.05, -0.87], [0.90, 0.05, -0.87],
    [0.90, 0.635, 0.03], [1.44, 0.55, 0.03], [1.44, 0.55, -0.87], [0.90, 0.635, -0.87]));
  P.add('turret', slab(
    [-1.30, 0.05, 0.03], [-0.90, 0.05, 0.03], [-0.90, 0.05, -0.87], [-1.30, 0.05, -0.87],
    [-1.30, 0.572, 0.03], [-0.90, 0.635, 0.03], [-0.90, 0.635, -0.87], [-1.30, 0.572, -0.87]));
  // r6 O1b: waist lid framed — detail rim at the pinned 0.645 plane, camo
  // tray dropped 0.028 (the unbroken 1.74 m pale plate was the widest
  // fence rail around the saucer in top/toptilt).
  P.add('turretDetail', box(0.08, 0.024, 0.8), -0.83, 0.645, -0.42);
  P.add('turretDetail', box(0.08, 0.024, 0.8), 0.83, 0.645, -0.42);
  P.add('turretDetail', box(1.58, 0.024, 0.08), 0, 0.645, -0.06);
  P.add('turretDetail', box(1.58, 0.024, 0.08), 0, 0.645, -0.78);
  P.add('turret', box(1.58, 0.024, 0.64), 0, 0.617, -0.42);
  // Right cheek tier along the casting (warped ref plan: front edge 1.95 at
  // x 0.50..0.92, top at the 2.29 band; z-shortened clear of the 1.4817
  // side-column boundary so the chin band owns those columns).
  // r6 O1c: the tier's top-outer corner rolls (r 0.05 quarter-round, the r5
  // shoulder-crest treatment extended cheek->crown): L-union of a full-height
  // wall to x 0.895 + a full-width body to y 0.528 + the tangent crest —
  // side tops (0.578) and the 0.92 front wall both stay exactly owned, the
  // sharp corner point is what rounds. Chord-limit class (r < 0.48): radius
  // authored and cited, not tool-paired.
  segBoxZ(P, 'turret', 0.395, 0.55, 2.05, 0.6975, 0.295, 0.405);
  segBoxZ(P, 'turret', 0.42, 0.508, 2.05, 0.71, 0.274, 0.405);
  P.add('turret', xform(cylY(0.05, 0.05, 2.05, 12, false, Math.PI / 2, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0), 0.87, 0.528, 0.405);
  // O1b: tier lid split detail|camo|detail — the unbroken pale strip read as
  // fence rail from top/toptilt; the camo mid-run breaks it to casting tone.
  P.add('turretDetail', box(0.40, 0.014, 0.62), 0.71, 0.578, 1.07);
  P.add('turret', box(0.40, 0.014, 0.72), 0.71, 0.578, 0.40);
  P.add('turretDetail', box(0.40, 0.014, 0.61), 0.71, 0.578, -0.26);
  // r6 O1a: cheek forward box top now FALLS toward the nose like the ref's
  // casting (evaluator frontleft: proc 177.0 level vs ref 9.1 falling; side
  // col 1.905 read 2.163 vs ref 2.132 — the flat 0.47 top owned it, floored
  // reads take the max surface in-column so the fall must reach <=0.4326 by
  // the 1.844 boundary). Flat 0.47 body to world 1.755, then a 22.8-degree
  // dive to 0.396 at the 1.93 nose — col 1.784 keeps its 2.163-read (flat
  // part still in-column), col 1.905 drops to the ref's 2.132.
  P.add('turret', box(0.36, 0.45, 0.165), 0.68, 0.245, 1.6525);
  P.add('turret', slab(
    [0.50, 0.02, 1.91], [0.86, 0.02, 1.91], [0.86, 0.02, 1.735], [0.50, 0.02, 1.735],
    [0.50, 0.410, 1.91], [0.86, 0.410, 1.91], [0.86, 0.47, 1.735], [0.50, 0.47, 1.735]));
  // Right low bin sliver rows (ref plan: the deep run behind the bins reads
  // to z -1.44 at x 1.60..1.63 — plan col 1.658 — while station 4 caps the
  // slice width at the same 1.63; one x 1.49..1.628 run satisfies both).
  segBoxZ(P, 'turret', 0.21, 0.40, 2.08, 1.355, 0.29, -0.75);
  // r6 O1b: lid split detail|camo|detail + a dark crown-facing inner face so
  // the saucer reads against a shadow moat instead of a co-planar pale rail.
  P.add('turretDetail', box(0.19, 0.014, 0.64), 1.355, 0.497, -1.43);
  P.add('turret', box(0.19, 0.014, 0.72), 1.355, 0.497, -0.75);
  P.add('turretDetail', box(0.19, 0.014, 0.64), 1.355, 0.497, -0.07);
  P.add('turretDark', box(0.008, 0.33, 1.98), 1.248, 0.315, -0.75);
  // r5 O4 casting shoulder (evaluator refOnly arc r 0.246 span 124° — the
  // ref's right band rolls 2.295 @ x<=1.52 -> 2.245 @ 1.56 -> 2.235 @ 1.60
  // -> 2.215 @ 1.68 where the proc stepped 2.295 | 2.19 | 2.21 square):
  // the 2.295 turret sliver now stops at the 1.5402 column boundary, the
  // hull run behind it rises to the ref's 2.2325 line, and quarter-round
  // crests roll both top-outer edges (r < 0.48 chord-limit class — radius
  // authored, cited, not tool-paired).
  segBoxZ(P, 'hull', 0.138, 0.415, 1.12, 1.559, 2.025, -0.88);
  P.add('hull', xform(cylY(0.045, 0.045, 1.12, 10, false, Math.PI / 2, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0), 1.583, 2.1875, -0.88);
  segBoxZ(P, 'turret', 0.0505, 0.475, 1.30, 1.50025, 0.3375, -0.28);
  P.add('turret', xform(cylY(0.05, 0.05, 1.30, 10, false, Math.PI / 2, Math.PI / 2), 0, 0, 0, Math.PI / 2, 0, 0), 1.4755, 0.525, -0.28);
  P.add('turret', box(0.04, 0.35, 0.50), 1.62, 0.29, 0.04);
  P.add('turret', box(0.034, 0.045, 0.07), 1.583, 0.4425, 0.275);
  // IR searchlight box on the LEFT cheek (warped ref: front face 1.56-1.58,
  // top at the 2.30 band, x -0.55..-0.98).
  // r6 O1c: searchlight top-outer edge rolls (r 0.05, the crest treatment
  // extended cheek->crown on the LEFT cheek): L-union keeps the -0.98 wall
  // and the 0.58 top exactly owned, only the sharp corner line rounds.
  P.add('turret', box(0.38, 0.68, 0.72), -0.74, 0.24, 1.06);
  P.add('turret', box(0.43, 0.63, 0.72), -0.765, 0.215, 1.06);
  P.add('turret', xform(cylY(0.05, 0.05, 0.72, 12, false), 0, 0, 0, Math.PI / 2, 0, 0), -0.93, 0.53, 1.06);
  P.add('turret', box(0.29, 0.30, 0.32), -0.695, -0.05, 1.60);
  P.add('turret', box(0.14, 0.30, 0.17), -0.91, -0.05, 1.525);
  P.add('turretDark', box(0.36, 0.34, 0.05), -0.765, 0.30, 1.44, -0.1, 0, 0);
  // r5 O3b: the full-size glass pane read PALE BLUE at luma 58.9 (b>=r)
  // where the ref's panes are barely distinct — near-black door with one
  // small lens glint only.
  P.add('turretDark', box(0.28, 0.24, 0.02), -0.765, 0.30, 1.47, -0.1, 0, 0);
  P.add('turretGlass', box(0.04, 0.03, 0.015), -0.765, 0.325, 1.478, -0.1, 0, 0);
  // Chin casting band over the driver, r4 three-piece to the ref's own side
  // line: 2.285->2.315 rising to z 1.44 (B1), a 2.22 step band to 1.58 (B2),
  // then the dive 2.17 -> 2.12 at the driver plate (B3). The old single
  // slab averaged the profile and painted station 10's top 0.06 high. Top
  // quads taper to ±0.56 so the plan front edge falls off at |x|>0.6 like
  // the print's casting (plan_turret col -0.657 reads 1.846, not the 1.937
  // full-width line).
  P.add('turret', slab(                                               // B1
    [-0.62, 0.10, 1.44], [0.62, 0.10, 1.44], [0.66, 0.14, 0.90], [-0.66, 0.14, 0.90],
    [-0.56, 0.595, 1.44], [0.56, 0.595, 1.44], [0.62, 0.56, 0.90], [-0.62, 0.56, 0.90]));
  // r5 O4a needle-nose recline: the crown-to-collar line ran LEVEL 177°
  // where the ref falls 163° (left view, z 1.47..1.94; ref columns bound
  // the line at ~2.22 @ z 1.54 -> 2.132 @ 1.905). B1's 0.595 rear edge now
  // BREAKS down to a falling B2/B3 bevel (0.505@1.44 -> 0.46@1.58 ->
  // 0.40@1.95, world 2.225 -> 2.12, ~164°) and the chin canvas is trimmed
  // under it (the old roll owned the z 1.905 side column 0.03 high).
  P.add('turret', slab(                                               // B2
    [-0.60, 0.185, 1.58], [0.60, 0.185, 1.58], [0.62, 0.10, 1.44], [-0.62, 0.10, 1.44],
    [-0.56, 0.46, 1.58], [0.56, 0.46, 1.58], [0.56, 0.505, 1.44], [-0.56, 0.505, 1.44]));
  P.add('turret', slab(                                               // B3
    [-0.55, 0.34, 1.95], [0.55, 0.34, 1.95], [0.60, 0.185, 1.58], [-0.60, 0.185, 1.58],
    [-0.52, 0.40, 1.95], [0.52, 0.40, 1.95], [0.56, 0.46, 1.58], [-0.56, 0.46, 1.58]));
  // r6 O3c: the chin canvas was the 'under-collar pale band' (front rect p95
  // 90.7 vs ref 68.1; the close-roof 'pale plate right of sleeve'): the
  // shared canvasCloth albedo blows out on this key-facing -0.24 tilt.
  // Scheme camo with the dirt bake keeps the cover in the green family.
  P.add('turret', box(0.5, 0.13, 0.44), 0, 0.285, 1.70, -0.24, 0, 0);
  // No.15 commander cupola LEFT of center (warped ref: drum 2.845 with the
  // 2.90 cap owning exactly ONE side column at z -0.163 — the published-
  // height p95 anchor; drum top 2.833 reads in the -0.285 column like the
  // ref's own stud ring). All faces hold 15 mm off the -0.1017/-0.2243
  // column boundaries (AA law). The small flank block carries the ref's
  // 2.827 read in the -1.002 FRONT column (its vision-block ring bulge).
  P.add('turret', cylY(0.15, 0.165, 0.22, 16), -0.88, 0.69, -0.285);
  P.add('turret', cylY(0.105, 0.105, 0.335, 16), -0.88, 0.9575, -0.225);
  P.add('turret', box(0.045, 0.055, 0.12), -0.9825, 1.0925, -0.22);
  P.add('turret', cylY(0.045, 0.045, 0.055, 14), -0.88, 1.1525, -0.163);
  P.add('turretDark', cylY(0.038, 0.038, 0.016, 14), -0.88, 1.172, -0.163);
  for (let k = 0; k < 5; k++) {
    const a = -0.9 + k * 0.55;
    P.add('turretDark', box(0.05, 0.045, 0.04), -0.88 + Math.sin(a) * 0.10, 1.09, -0.20 + Math.cos(a) * 0.075, 0, a, 0);
  }
  P.add('turretDark', box(0.05, 0.05, 0.14), -0.88, 1.0975, -0.21);
  // Commander sight saddle behind the cupola: the ref side line steps
  // 2.437 -> 2.498 -> 2.559 going forward — saddle plus a lower rear step.
  P.add('turret', box(0.30, 0.205, 0.32), -0.62, 0.7575, -0.565);
  P.add('turret', box(0.30, 0.15, 0.115), -0.62, 0.705, -0.7775);
  // Roof sight housing forward-left (ref front 2.708 flat band at
  // x -0.42..-0.71, one side column at z ~-0.05).
  P.add('turret', box(0.31, 0.35, 0.11), -0.575, 0.813, -0.075);
  P.add('turretDark', box(0.23, 0.035, 0.02), -0.575, 0.935, -0.012);
  // Loader hatch ring right of the cupola.
  P.add('turretDetail', cylY(0.19, 0.21, 0.06, 14), 0.46, 0.595, -0.54);
  // Crown furniture (probed off the warped print): gunner sight ON the
  // crown, the raised sight plate left of center (ref 2.469 at x -0.13..
  // -0.26 / z -0.20..-0.60), the loader periscope (2.43 at x 0.48..0.55)
  // and the ventilator dome (2.385 at x 0.61..0.67).
  P.add('turret', box(0.2, 0.07, 0.24), 0.3, 0.625, -0.14);
  P.add('turretDark', box(0.14, 0.045, 0.03), 0.3, 0.645, -0.01);
  // r5 O3a: the raised sight plate caught the camo scheme's pale patch and
  // read TAN (luma 63.1/p95 91, yellow-shifted — tan belongs to the
  // CENTURIONS' mantlet canvas, §H.4). detail tint still read 62 up-facing
  // vs the ref's 48.6 at the same columns — dark fitting steel matches.
  P.add('turretDark', box(0.135, 0.082, 0.38), -0.1925, 0.701, -0.40);
  P.add('turret', box(0.08, 0.10, 0.12), 0.515, 0.665, -0.50);
  P.add('turret', cylY(0.034, 0.030, 0.055, 12), 0.6425, 0.6375, -0.50);
  // Twin sight/searchlight masts KNEED to the warped ref tops (2.93 band,
  // both in the ref's own z 0.43/0.55 side-column pair): right mast on the
  // crown at x +0.86, left mast on the long bin run at x -1.26. r4: the
  // left head widens to the ref's TWO-column front read (-1.278/-1.239 both
  // 2.926) and its base drops under the 2.31 bin line (ref front col
  // -1.199 reads 2.305, the old 2.42 base owned it).
  P.add('turret', box(0.06, 0.18, 0.12), 0.87, 0.63, 0.50);
  P.add('turret', box(0.024, 0.40, 0.11), 0.865, 0.92, 0.50);
  P.add('turretDark', box(0.028, 0.23, 0.09), 0.865, 1.10, 0.57);
  P.add('turret', box(0.022, 0.05, 0.12), -1.249, 0.585, 0.50);
  P.add('turret', box(0.02, 0.44, 0.11), -1.25, 0.84, 0.50);
  // r5: head widened to pin BOTH of the ref's 2.926 front columns
  // (-1.278/-1.239) — the r4 0.022 head covered the -1.276 column by only
  // 4.5 mm and the boundary drift law made it a ±0.32 whole-row coin (this
  // round's workorder caught it flapped: proc 2.294 vs ref 2.924).
  P.add('turretDark', box(0.052, 0.235, 0.05), -1.255, 1.0875, 0.445);
  // Whip antenna: base pot on the crown rear + slim kneed mast (the ref's
  // single 2.92 column at z -1.03).
  P.add('turret', box(0.06, 0.16, 0.08), 0.72, 0.70, -1.02);
  P.add('turretDark', box(0.036, 0.40, 0.10), 0.72, 1.00, -1.02);
  liftEye(P, 'turretDetail', -0.84, 0.565, 0.35, 0.4);
  liftEye(P, 'turretDetail', 0.84, 0.565, 0.35, -0.4);
  // Commander's GPMG on the crown left, stowed aft over the saddle (§B3
  // mandatory roof MG — FITTINGS census; envelope inside the turret AABB,
  // receiver 2.67 < the 2.90 cap, barrel under the whip column).
  {
    // r5 O5: a fully-open crown pose priced 7 front columns at +0.15 (the
    // receiver rides the low saucer) — over the 0.4-pt pintle allowance.
    // Kept the r4-priced aft-left station but raised 0.04 and yawed 0.15
    // more aft so the receiver crests the saddle edge and the barrel line
    // crosses the (now olive-detail) bustle lids instead of the dark
    // saddle — dark crown-riding polarity per MG PHYSICS.
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0, scale: 0.8, seed: 5 });
    mg.position.set(-0.33, 0.60, -0.32);
    mg.rotation.y = Math.PI + 0.45;
    P.turretG.add(mg);
  }
  // Smoke discharger bins on bracket arms, below the brow.
  for (const sd of [-1, 1]) {
    P.add('turretDetail', box(0.34, 0.05, 0.05), sd * 0.68, 0.1, 0.9, 0, sd * 0.35, 0);
    P.add('turretDark', box(0.15, 0.17, 0.36), sd * 0.9, 0.08, 0.92, 0, sd * 1.1, 0);
    smokeCluster(P, sd * 0.95, 0.2, 0.98, 6, sd * 1.2, 0.8);
  }
  // LEFT flank long bin run (the print's fused fender bins live in its
  // turret node and yaw). r4 terraced: inner shelf x -1.24..-1.02 at the
  // ref's 2.285 side band, outer shelf x -1.37..-1.24 at its 2.24 FRONT
  // band (cols -1.357/-1.318), aft run dropped to the 1.725..2.225 band
  // (side cols -1.869/-1.991 read 2.224..1.736), outer wall at 2.19.
  segBoxZ(P, 'turret', 0.22, 0.8825, 1.99, -1.13, 0.12125, 0.375);
  segBoxZ(P, 'turret', 0.22, 0.7575, 0.31, -1.13, 0.18375, -0.775);
  segBoxZ(P, 'turret', 0.13, 0.84, 1.99, -1.305, 0.10, 0.375);
  segBoxZ(P, 'turret', 0.13, 0.715, 0.31, -1.305, 0.1625, -0.775);
  segBoxZ(P, 'turret', 0.36, 0.50, 0.86, -1.20, 0.255, -1.54);
  // r5: end wall trimmed 2.285 -> 2.235 — the ref's -1.315/-1.355 front
  // columns read 2.235 (was +0.049 on both).
  P.add('turret', box(0.36, 0.51, 0.145), -1.20, 0.26, -1.6175);
  // r6 O1b: long-bin lid split detail|camo|detail (tone-only: the 0.5625
  // shelf top owns every silhouette row here) + dark crown-facing inner
  // face — the left fence rail breaks up and the saucer gets its moat.
  P.add('turretDetail', box(0.205, 0.02, 0.685), -1.1325, 0.552, 0.9725);
  P.add('turret', box(0.205, 0.02, 0.80), -1.1325, 0.552, 0.23);
  P.add('turretDetail', box(0.205, 0.02, 0.74), -1.1325, 0.552, -0.54);
  P.add('turretDark', box(0.008, 0.385, 1.96), -1.022, 0.3525, 0.375);
  segBoxZ(P, 'turret', 0.07, 0.42, 2.92, -1.515, 0.26, -0.26);
  P.add('turretDark', box(0.16, 0.06, 0.06), -1.44, 0.46, 0.40);
  P.add('turretDark', box(0.16, 0.06, 0.06), -1.44, 0.46, -0.80);
  // Aft flank rack tiers: LEFT inner tall tier at the ref's 2.34 side band
  // (z -1.545..-1.045 — clear of the -1.5647 column boundary; the ref dips
  // to 2.285 in the -1.625 column) with the 2.185 outer tier; RIGHT rack
  // pair at the ref's 2.295/2.315 station-4 top.
  // r6 O1b: every rack lid becomes a pinned-height detail RIM FRAME around a
  // dropped camo tray panel (side rows ride the x-strips, front rows the
  // z-strips — all pinned columns keep their exact reads) and the rack
  // fronts facing the crown get dark moat plates. The lid ring stops
  // reading as one co-planar pale fence from top/toptilt (the r5
  // 'rectangle-city crown' driver) and the saucer reads through the steps.
  P.add('turret', box(0.42, 0.62, 0.50), -1.03, 0.31, -1.295);
  P.add('turretDetail', box(0.07, 0.02, 0.44), -1.195, 0.612, -1.295);
  P.add('turretDetail', box(0.07, 0.02, 0.44), -0.865, 0.612, -1.295);
  P.add('turretDetail', box(0.26, 0.02, 0.07), -1.03, 0.612, -1.11);
  P.add('turretDetail', box(0.26, 0.02, 0.07), -1.03, 0.612, -1.48);
  P.add('turret', box(0.26, 0.02, 0.30), -1.03, 0.578, -1.295);
  P.add('turretDark', box(0.36, 0.42, 0.008), -1.03, 0.30, -1.041);
  P.add('turret', box(0.26, 0.475, 0.50), -1.38, 0.2275, -1.40);
  P.add('turret', box(0.66, 0.54, 0.62), 1.12, 0.305, -1.42);
  P.add('turretDetail', box(0.07, 0.02, 0.56), 0.825, 0.585, -1.42);
  P.add('turretDetail', box(0.07, 0.02, 0.56), 1.415, 0.585, -1.42);
  P.add('turretDetail', box(0.52, 0.02, 0.07), 1.12, 0.585, -1.175);
  P.add('turretDetail', box(0.52, 0.02, 0.07), 1.12, 0.585, -1.665);
  P.add('turret', box(0.52, 0.02, 0.42), 1.12, 0.551, -1.42);
  P.add('turretDark', box(0.60, 0.44, 0.008), 1.12, 0.29, -1.106);
  P.add('turret', box(0.36, 0.46, 0.45), -1.17, 0.28, -1.87);
  P.add('turretDetail', box(0.06, 0.02, 0.40), -1.32, 0.51, -1.87);
  P.add('turretDetail', box(0.06, 0.02, 0.40), -1.02, 0.51, -1.87);
  P.add('turretDetail', box(0.24, 0.02, 0.06), -1.17, 0.51, -1.70);
  P.add('turretDetail', box(0.24, 0.02, 0.06), -1.17, 0.51, -2.04);
  P.add('turret', box(0.24, 0.02, 0.28), -1.17, 0.478, -1.87);
  P.add('turret', box(0.48, 0.46, 0.40), 1.05, 0.28, -1.845);
  P.add('turretDetail', box(0.06, 0.02, 0.36), 0.85, 0.51, -1.845);
  P.add('turretDetail', box(0.06, 0.02, 0.36), 1.25, 0.51, -1.845);
  P.add('turretDetail', box(0.34, 0.02, 0.06), 1.05, 0.51, -1.695);
  P.add('turretDetail', box(0.34, 0.02, 0.06), 1.05, 0.51, -1.995);
  P.add('turret', box(0.34, 0.02, 0.24), 1.05, 0.478, -1.845);
  P.add('turret', box(0.42, 0.10, 0.17), -1.03, 0.44, -1.735);
  // Bustle bins + NBC pack + rear rack lip (warped ref: 2.24 band to the
  // -2.3 turret tail; its rear basket top rail reads 2.01..2.07 in the
  // -2.356 side column — the left rail stub carries it).
  P.add('turret', box(1.5, 0.46, 0.6), 0, 0.29, -1.62);
  // r6 O1b: bustle lid framed like the racks (bin solid owns the 0.52 line).
  P.add('turretDetail', box(0.09, 0.03, 0.5), -0.645, 0.505, -1.62);
  P.add('turretDetail', box(0.09, 0.03, 0.5), 0.645, 0.505, -1.62);
  P.add('turretDetail', box(1.20, 0.03, 0.07), 0, 0.505, -1.405);
  P.add('turretDetail', box(1.20, 0.03, 0.07), 0, 0.505, -1.835);
  P.add('turret', box(1.20, 0.03, 0.36), 0, 0.475, -1.62);
  P.add('turretDark', box(1.36, 0.38, 0.008), 0, 0.28, -1.316);
  P.add('turret', box(1.15, 0.46, 0.5), 0.1, 0.29, -2.02);
  // r6 O5 (SHOULD): the rear rack lip becomes a tray + end posts with two
  // duffel-class rolls riding the same 0.515 line the flat lip owned — the
  // 0.52 rail band above still owns every side/rear column (silhouette
  // byte-neutral), but rear/hero/toptilt now read the ref's rounded bustle
  // stowage instead of a flat plate. KIT tarpRoll = the duffel primitive.
  P.add('turret', box(1.49, 0.28, 0.16), -0.015, 0.255, -2.18);
  P.add('turret', box(0.09, 0.40, 0.16), -0.715, 0.315, -2.18);
  P.add('turret', box(0.10, 0.40, 0.16), 0.68, 0.315, -2.18);
  tarpRoll(P, 'turretCloth', -0.40, 0.393, -2.18, 0.60, 0.115, true);
  tarpRoll(P, 'turretCloth', 0.27, 0.395, -2.18, 0.50, 0.105, true);
  P.add('turretDark', box(0.4, 0.24, 0.05), 0.1, 0.235, -2.17);
  P.add('turretDetail', box(0.13, 0.07, 0.125), -0.685, 0.32, -2.3125);
  P.add('turretDetail', box(1.46, 0.04, 0.04), 0, 0.50, -2.25);
  P.add('turretDetail', box(1.46, 0.04, 0.04), 0, 0.12, -2.25);
  for (let k = 0; k < 6; k++) P.add('turretDetail', box(0.03, 0.36, 0.03), -0.66 + k * 0.264, 0.31, -2.25);
  // L11A5 straight out of the casting: collar -> sleeve -> evac -> MRS.
  // r4 tube profile from raycast probes of the warped print: axis y 1.856,
  // bare/sleeved band r 0.105-0.111 the whole run, fume extractor r 0.129
  // CENTERED AT WORLD 4.90 (the old 0.56 fraction drum sat 0.7 m forward of
  // the ref's and cost ~10 tube columns), breech ring 1.98 to z 2.52, and
  // the muzzle-end MRS block reaching x -0.265..0.065 (plan cols -0.292..
  // 0.074 read the ref gun to z 6.45-6.70 there).
  // r5 O4b/O4c: the L11 emerges from a CASTING, not a bracket — the square
  // collar boxes are now a conical cast stack (same probed bands: block
  // bottom 1.546, z-end 1.83 — r4 raycast anchors); the 0.43-wide sleeve
  // box band is an OCTAGONAL prism at the ref's plan line (flats +-0.111 ->
  // plan edge -0.236 vs the ref's one straight -0.24 line; y-band 0.222
  // unchanged) ending at world 4.47 for the ref's side sleeve->tube STEP
  // (ref bottom lines break 2.52 m @ z 1.95..4.47 + 2.17 m @ 4.83..7.00),
  // then a fatter sagged rear octagon (band 1.706..1.949 — ref columns
  // 1.949..1.706 at z 5.44/5.56) carries to the muzzle kit. The fume-
  // extractor drum swells to the ref's r_y 0.1525 (col 4.829 bottom 1.675).
  P.addGunExtra(cylZ(0.17, 0.42, 18, 0.20), 0, 0, 0.16);
  P.addGunExtra(cylZ(0.155, 0.55, 18, 0.185), 0, -0.01, 0.62);
  P.addGunExtra(cylZ(0.22, 0.28, 18), 0.01, -0.09, 1.05);
  P.addGunExtra(cylZ(0.1375, 0.62, 18), 0.01, -0.012, 1.57);
  // canvas hood ring at the gun root — the chin-canvas trim above exposed
  // the ref's 2.041 read in the z 2.027 side column (hood bulge r ~0.20,
  // z-narrow inside the one column, 15 mm off both boundaries).
  // r6 O3a: hood + collar clamp rebucketed dark -> scheme camo — the 'dark'
  // gunmetal (0x36342f, r>g) read as a MAUVE ring at the sleeve root against
  // the green family (critic rgb ~66,63,56 in close-front/close-roof/right).
  P.addGunExtra(cylZ(0.175, 0.092, 16), 0, 0.015, 1.387);
  P.addGunExtra(xform(cylZ(0.1201, 2.88, 8), 0, 0, 0, 0, 0, Math.PI / 8), 0, -0.01, 2.39);
  // r6 O4 sleeve->evac THIRD fit, authored to the fresh workorder columns
  // (quantized reads: a surface reads a 0.0305 grid line when it covers
  // >~40% of that pixel row). The r5 taper+drum read a -11.3-degree dive
  // (left) where the ref runs a near-level 1.706-line into the swell: ref
  // cols 4.464/4.586 bottom 1.706 top 1.949, 4.707 bottom 1.706 top 1.98,
  // 4.829 bottom 1.675 (the only dip) top 1.98, 4.951..5.195 bottom 1.706
  // top 1.98, 5.317+ bottom 1.736 top 1.949 with 1.706 clamp dips at
  // 5.438/5.56. Segments below hit every one of those boxes; buildGun's own
  // evac drum (top 1.985 over world 4.41..5.39, the true 4.586-top
  // contaminator) is disabled — these pieces own the whole swell.
  P.addGunExtra(cylZ(0.121, 0.267, 16, 0.115), 0, -0.024, 3.9635);    // level run 4.470..4.737, bottom easing 1.717->1.711 (the 1.706-read line)
  P.addGunExtra(cylZ(0.139, 0.485, 16), 0, -0.0085, 4.3425);          // swell body 4.740..5.225 (top 1.9865: the mask lights 1.98 only >=~1.985)
  // smooth sag pocket instead of the r6-draft hard notch: bottom 1.6875 is
  // the ref's own ~1.69 bulge class — its 1.675 column read at 4.829 is an
  // AA coin, so ours coins IDENTICALLY (co-located coins flap together).
  P.addGunExtra(cylZ(0.1495, 0.054, 16), 0, -0.019, 4.185);           // drum sag 4.798..4.852 (pixel-fenced)
  // plan-only rear taper: the ref evac chord tapers -0.264 -> -0.233 going
  // aft (top view read 86.5 vs our square step) — a thin axis-level wedge
  // the side masks never see (y band 1.826..1.856 sits inside the tube).
  P.addGunExtra(slab(
    [-0.139, -0.03, 4.585], [0.139, -0.03, 4.585], [0.1163, -0.03, 4.865], [-0.1163, -0.03, 4.865],
    [-0.139, 0.0, 4.585], [0.139, 0.0, 4.585], [0.1163, 0.0, 4.865], [-0.1163, 0.0, 4.865]), 0, 0, 0);
  // rear sagged octagon: bottom flat lifted to the ref's 1.736 tube line
  // (was 1.706 — ten 0.015 columns 5.317..6.9), top flat still 1.949.
  P.addGunExtra(xform(cylZ(0.1163, 2.11, 8), 0, 0, 0, 0, 0, Math.PI / 8), 0, -0.0155, 5.245);
  // MRS clamp band at the ref's own 5.438/5.56 bottom dips (1.706-reads),
  // pixel-fenced so the dip stays two columns wide like the ref's.
  P.addGunExtra(cylZ(0.120, 0.159, 16), 0, -0.026, 4.8555);
  // ring->sleeve transition taper (r5, unchanged — interior shading line).
  P.addGunExtra(cylZ(0.124, 0.25, 12, 0.135), 0.005, -0.014, 1.82);
  P.addGunExtra(box(0.17, 0.19, 0.30), 0.105, 0, 5.91);
  P.addGunExtra(box(0.143, 0.19, 0.26), -0.0565, 0, 5.74);
  P.addGunExtraDark(cylZ(0.108, 0.05, 16), 0, 0, 2.95);
  P.addGunExtraDark(cylZ(0.108, 0.05, 16), 0, 0, 5.32);
  P.addGunExtra(cylZ(0.145, 0.62, 16, 0.215), 0, 0, 0.45);
  P.addGunExtra(cylZ(0.152, 0.05, 16), 0, 0, 0.72);
  buildGun(P, { len: 6.40, r: 0.105, sleeve: false, evac: null, collar: false, baseR: 0.16 });
  muzzleBore(P, { len: 6.40, r: 0.105 });                     // §B3.1 (shadow-named, 3fca39b)
  P.add('gun', cylZ(0.104, 0.09, 12), 0, 0, 6.40 - 0.5);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.1, 0.3, -0.6], Math.PI / 2);
  P.topY = 1.15;
}

// Shared UK tow cable on the glacis with clamp cleats.
const deckAtUK = (g: Pick<UKHullOptions, 'deck'>, z: number): number => lineAt(g.deck, z);

// Opt-in path/cleat overrides (uk r4): chieftain5's cable sagged over the
// ref's bare 1.49-1.55 glacis deck line once side registration was honest —
// its call lowers the run. Defaults byte-identical for every other caller.
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
// UK TONE KIT (combined tone round 2026-08-05, challenger1 r7 O1a/O2/O4 +
// centurion5 r6 O2/O4 + centurion3 r6 Groups 1-2). Family recipe = the
// m47/m46 gearTone lineage (patton.ts r4-r7) in the UK olive family:
// per-instance material work only — createTankMaterials is per-build and the
// gate renders self-lit masks, so nothing here moves a curve or a mask.
// OPT-IN per build fn (§F.2): chieftain5 (frozen graduate 5117b9a8) does NOT
// call this — its own r5/r6 gear tones live in CHIEFTAIN_HULL config.
// ---------------------------------------------------------------------------
function ukToneKit(P: UKMaterialPort, o: UKToneOptions = {}): void {
  const rehook = (m: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial => {
    // Material.clone() drops onBeforeCompile — re-attach the family ambient
    // floor (merkava r12 gearFloor law / leo r13b gearDarkLift pattern).
    m.onBeforeCompile = vehicleAmbientFloorHook;
    m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
    return m;
  };
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
  const wheelTone = rehook(P.mats.wheels.clone());
  wheelTone.color.setHex(o.wheelHex ?? 0x4b523f);
  wheelTone.envMapIntensity = o.wheelEnv ?? 0.22;
  const drumTone = rehook(P.mats.wheels.clone());
  drumTone.color.setHex(o.drumHex ?? 0x3f4534);
  drumTone.envMapIntensity = o.drumEnv ?? 0.18;
  P.disposables.push(wheelTone, drumTone);
  // r8 WHEEL-RING GRAMMAR (combined uk round 3: c3 W1 / c5 O7 / ch1 O1a —
  // the shared family finding): the dished wheelGeo already authors the ring
  // set (tire band + shoulder in the `tire` IM; dish-bottom annulus + 16 rim
  // bolts in the `dark` IM), but BOTH ride mats.rubber, and the r7
  // tireEmissive floor (0x191d12 ~ +25L additive) lifted their lit read into
  // the disc-face luma — the drawn rings vanished and all six wheels rendered
  // as featureless pale pillows, the POLARITY INVERSE of the refs' dark-drawn
  // rim/bolt/hub rings on olive discs. Split the merged tones: both wheel
  // rubber IMs drop onto a dark olive-iron ring clone ~8-12L below the disc
  // face, NO emissive lift (the ambient-floor hook alone owns shade safety —
  // the pad/chain precedent holds sub-30 at zero). The r6 pale-bullseye
  // overshoot stays dead: rings are DARK-drawn, never pale. mkInst creation
  // order is tire-first, dark-second (tankFactory buildRunningGear) — both
  // take the same ring tone so the order only matters for documentation.
  const ringMat = rehook(P.mats.rubber.clone());
  ringMat.color.setHex(o.ringHex ?? 0x2b2f1f);
  ringMat.envMapIntensity = o.ringEnv ?? 0.10;
  ringMat.emissive.setHex(0x000000);
  P.disposables.push(ringMat);
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
    } else if (isInstanced && m === P.mats.rubber) {
      ob.material = ringMat;                             // tire ring + bolt/annulus IMs
    } else if (m === P.mats.wheels) {
      // road-wheel disc InstancedMesh + sprocket/idler body spinners
      ob.material = isInstanced ? wheelTone : drumTone;
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
  const m = P.mats.shadow.clone();
  m.color.setHex(hex);
  m.roughness = 0.97;
  m.metalness = 0.0;
  m.envMapIntensity = 0.14;
  m.onBeforeCompile = vehicleAmbientFloorHook;
  m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
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
// Chieftain Mk 10 — BASE-21 PHOTO-CLASS SCAFFOLD (2026-08-07). First real
// build of the id (the modern3 buildChieftain generic is overridden here via
// PROFILED_BUILDERS, the same binding every uk.ts profile uses). NO ORACLE —
// FALSE-0 law: never run the geometry gate against this id; the bar is the
// photo class + published dims + §B battery + §B8.1 proportion gates
// (docs/references/tanks/chieftain_mk10.md carries the target numbers).
// Family grammar donor: the chieftain5 graduate (d4f2a9a6 — REUSED helpers
// only: ukHull / segBoxZ / towCableUK / ukToneKit; the graduate's own
// geometry and CHIEFTAIN_HULL table are untouched).
// Mk 10 deltas vs the Mk 5: STILLBREW armour masses on the turret front /
// cheeks + ring collar (the hump), TOGS thermal barbette on the RIGHT cheek
// (brief-ordered late-BAOR fit; the Mk 5's left IR searchlight box is
// deleted in exchange), L11A5 with FULL thermal sleeve + fume extractor +
// MRS + open bore, No.15 cupola LEFT with the L37 GPMG on the ring, skirt
// band at the published 3.66 width (±1.83 EXACT — §D width anchor).
// SYMMETRIC hull: the chieftain5 left-fender asymmetry + narrow right track
// + 0.08 left shift are that oracle's certified print quirks, not the
// vehicle — this build carries the published symmetric configuration.
// ---------------------------------------------------------------------------
const MK10_HULL = {
  bodyHalfW: 1.53, nose: 3.72,
  // Family glacis line extended to the real full-width bow: ONE reclined
  // plane 1.49 @ z 2.16 -> 1.205 @ 3.47 -> 1.15 @ 3.72 (§B8.1 gate 2 —
  // ~12.5° run, no bow cliff: the lit bow face is the thin wing tip band).
  deck: [[3.72, 1.15], [3.47, 1.205], [3.10, 1.32], [2.72, 1.40], [2.42, 1.475],
    [2.16, 1.49], [1.62, 1.56], [1.10, 1.58], [0.30, 1.60], [-0.60, 1.61],
    [-1.35, 1.64], [-1.76, 1.705], [-2.60, 1.71], [-3.30, 1.71],
    [-3.44, 1.695], [-3.58, 1.70], [-3.70, 1.72]],
  beltTop: 1.02, belly: 0.56,
  noseRake: [[2.55, 0.56], [2.90, 0.575], [3.20, 0.62], [3.45, 0.69], [3.72, 0.78]],
  tailRake: [[-2.30, 0.56], [-2.72, 0.575], [-3.08, 0.60], [-3.42, 0.64], [-3.60, 0.68]],
  tailShelf: { z0: -3.60, z1: -3.62, yBot: 1.06 },
  // Symmetric fenders at the hull's published 3.50 plane (±1.75); the SKIRT
  // band below carries the 3.66 width anchor.
  fenderY: 1.575, fenderZ0: -3.70, fenderZ1: 1.9, fenderHalfW: 1.75, fenderHalfWL: 1.75,
  fenderSegLen: 0.45,
  rakeHalfW: 1.02, // §B4: rake lofts stay inboard of the 1.115 track inner face
  // Closed sponsons preserve the complete exterior deck/side armor while
  // clearing the concealed solid underside above the native return.
  lowerHalfW: 1.02,
  deckCorridor: { x: 1.02, floor: 1.40, z0: -2.35, z1: 2.58 },
  // 610 mm track at the published over-track stance (outer faces ±1.725).
  trackXc: 1.42, trackW: 0.61, flapDrop: 0.055,
  padHex: 0x343a29, chainHex: 0x2b3122, gearFloor: true,
  wheelR: 0.33, wheelY: 0.38, wheelStyle: 'rubber',
  wheelZs: [2.3, 1.42, 0.54, -0.34, -1.22, -2.1],
  // §B6 trapezoid (family law, banked in the chieftain5 §B6 round): BIG
  // raised front idler + HIGH rear drive sprocket. Idler r 0.30 at the
  // RAISED y 0.64 (the brief's "big idler" — the family-proven geometry;
  // an r 0.32 cut lifted the return-run segment 5-10 mm INTO the 1.02 belt
  // bottom, audit 12 vox); shoe orbit far edge 2.58+0.43=3.01 stays clear
  // and advanced to z 3.02 from the source's 0.86-pitch idler lead. The
  // upper wrap now nests beneath the shoulder mudguard instead of ending
  // behind it.
  sprocket: { z: -3.10, y: 0.875, r: 0.30 }, idler: { z: 3.02, y: 0.64, r: 0.30 },
  rollers: [{ z: 1.45, y: 0.82, r: 0.09 }, { z: 0.1, y: 0.82, r: 0.09 }, { z: -1.25, y: 0.82, r: 0.09 }],
  trackTop: 0.98,
  // Mk 10 skirt band: 6 panels, hem at the 0.79 wheel-top line so all six
  // paired wheels read fully below it (§B8.1 gate 1; the buried-wheels
  // class is the fleet's #1 acceptance killer). WIDTH ANCHOR (§D): ukHull's
  // skirt lift-handle plates stand 14.5 mm proud of the panel plane — the
  // 1.8155 plane puts the HANDLE faces at ±1.8305 ≈ the published 3.66,
  // and nothing (panels 1.8155, seams 1.8185, number decals 1.831) stands
  // wider than the anchor.
  skirt: { x: 1.8155, top: 1.555, bot: 0.79, z0: -2.85, z1: 2.45 },
  skirtPanels: 6,
  // Side numbers pinned ON the skirt planes (decals are mask geometry AND
  // box geometry — §D width guard: they sit 1 mm proud of the ±1.83 anchor,
  // never past it enough to re-scale the probe frame).
  numberSize: 0.34, numberR: [1.831, 1.17, 0.0], numberL: [-1.831, 1.17, 0.0],
};

function chieftainMk10Build(P: UKBuilderPort): void {
  const g = MK10_HULL;
  ukHull(P, g);
  // ---- bow fender WINGS to the ±3.76 hull-length extreme (symmetric; the
  // family W1/W2/W3 piecewise bow with the W3 tip kept THIN — the wing tips
  // are the length anchor, the glacis center runs to 3.72 underneath).
  for (const s of [-1, 1]) {
    const x0 = s * 1.06, x1 = s * 1.75;
    P.add('hull', slab(                                   // W1 glacis wing / idler mudguard
      [x0, 1.08, 3.43], [x1, 1.08, 3.43], [x1, 1.10, 3.08], [x0, 1.10, 3.08],
      [x0, 1.25, 3.43], [x1, 1.25, 3.43], [x1, 1.335, 3.08], [x0, 1.335, 3.08]));
    P.add('hull', slab(                                   // W2 shoulder
      [x0, 0.90, 3.60], [x1, 0.90, 3.60], [x1, 1.08, 3.43], [x0, 1.08, 3.43],
      [x0, 1.225, 3.60], [x1, 1.225, 3.60], [x1, 1.25, 3.43], [x0, 1.25, 3.43]));
    P.add('hull', slab(                                   // W3 thin tip band
      [x0, 0.85, 3.76], [x1, 0.85, 3.76], [x1, 0.72, 3.60], [x0, 0.72, 3.60],
      [x0, 1.05, 3.76], [x1, 1.05, 3.76], [x1, 1.05, 3.60], [x0, 1.05, 3.60]));
    // Retained corner flap, now raked into the shoulder cap above the
    // source-proportioned idler instead of occupying its shoe orbit.
    P.add('hullTrack', box(0.62, 0.34, 0.08), s * 1.40, 1.00, 3.50, -0.24, 0, 0);
    P.add('hullDetail', box(0.21, 0.06, 0.62), s * 0.945, 1.02, 2.81);
    // Close the narrow top-view slot between the inboard bow deck and the
    // fender/wing root.  This is a shallow cap above the moving idler, not a
    // full-depth wall in the track sweep.
    P.add('hull', slab(
      [s * 0.99, deckAtUK(g, 3.08) - 0.035, 3.08], [s * 1.10, deckAtUK(g, 3.08) - 0.035, 3.08],
      [s * 1.10, deckAtUK(g, 2.55) - 0.035, 2.55], [s * 0.99, deckAtUK(g, 2.55) - 0.035, 2.55],
      [s * 0.99, deckAtUK(g, 3.08), 3.08], [s * 1.10, deckAtUK(g, 3.08), 3.08],
      [s * 1.10, deckAtUK(g, 2.55), 2.55], [s * 0.99, deckAtUK(g, 2.55), 2.55]));
  }
  addChieftainClosedShoulderMudguards(P, 'chieftain_mk10');
  // ---- cast belly: center keel + shallow V (family cross-section, symmetric)
  P.add('hull', box(0.06, 0.10, 3.4), 0, 0.51, 0.2);
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.03, 0.49, 2.55], [s * 0.42, 0.515, 2.55], [s * 0.42, 0.515, -2.3], [s * 0.03, 0.49, -2.3],
      [s * 0.03, 0.62, 2.55], [s * 0.42, 0.62, 2.55], [s * 0.42, 0.62, -2.3], [s * 0.03, 0.62, -2.3]));
    P.add('hull', slab(
      [s * 0.42, 0.515, 2.55], [s * 0.92, 0.5675, 2.55], [s * 0.92, 0.5675, -2.3], [s * 0.42, 0.515, -2.3],
      [s * 0.42, 0.62, 2.55], [s * 0.92, 0.62, 2.55], [s * 0.92, 0.62, -2.3], [s * 0.42, 0.62, -2.3]));
  }
  // ---- glacis furniture: splash rail, dark-visor driver periscope (the
  // reclined driver sits CENTER on a Chieftain), headlight pods + blackout
  // covers + guard plates, tow shackles, spare-links fitting, tow cable.
  P.add('hullDetail', box(1.7, 0.02, 0.08), 0, deckAtUK(g, 2.42) + 0.01, 2.42);
  P.add('hullDetail', box(0.14, 0.07, 0.1), -0.15, deckAtUK(g, 1.95) + 0.01, 1.95);
  P.add('hullDark', box(0.11, 0.032, 0.104), -0.15, deckAtUK(g, 1.95) + 0.022, 1.95);
  for (const side of [-1, 1]) {
    headlight(P, side * 1.15, 1.345, 2.96, -0.2);
    P.add('hullDark', xform(cylZ(0.046, 0.014, 12), 0, 0, 0.052), side * 1.15, 1.345, 2.96, -0.2, 0, 0);
    P.add('hullDetail', box(0.24, 0.02, 0.18), side * 1.15, 1.40, 2.96, -0.25, 0, 0);
    P.add('hullDetail', box(0.11, 0.1, 0.15), side * 0.9, 0.70, 3.42);
    P.add('hullDetail', torus(0.065, 0.017, 10), side * 0.9, 0.70, 3.53, Math.PI / 2, 0, 0);
  }
  {
    const st = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.11, pitch: 0.17, seed: 11, rotation: [0.208, 0, 0] });
    st.position.set(-0.62, 1.4275, 2.7884);
    P.hullG.add(st);
  }
  towCableUK(P, [[-1.0, 1.44, 2.2], [0, 1.56, 1.7], [1.0, 1.44, 2.2]], 1.37);
  // ---- engine deck: louvre field + fuel caps + rear tow cable run
  P.add('hull', box(2.2, 0.04, 1.15), 0, 1.685, -2.65);
  for (const i of KIT.grilleIndices(P.q, 6, 3)) {
    P.add('hullDark', box(2.05, 0.018, 0.05), 0, 1.70, -2.2 - i * 0.17);
  }
  for (const side of [-1, 1]) P.add('hullDetail', cylY(0.08, 0.08, 0.03, 10), side * 1.15, 1.715, -1.9);
  KIT.towCable(P, [[-0.95, 1.735, -2.2], [0, 1.75, -2.62], [0.95, 1.735, -2.2]], 0.026);
  // ---- tail kit (symmetric planes; the -3.76 rear extreme = the exhaust
  // run faces, matching the +3.76 wing tips for the published 7.52 hull)
  P.add('hullDark', box(1.16, 0.5, 0.03), 0, 1.32, -3.60);
  P.add('hull', box(0.165, 0.63, 0.115), -0.8175, 1.375, -3.6575);
  P.add('hull', box(0.235, 0.63, 0.105), 0.7475, 1.375, -3.6525);
  P.add('hull', box(0.477, 0.475, 0.13), 0.3685, 1.3375, -3.695);   // right exhaust run (face -3.76)
  P.add('hull', box(0.477, 0.475, 0.13), -0.3685, 1.3375, -3.695);  // left exhaust run (face -3.76)
  P.add('hull', box(0.59, 0.08, 0.125), 0, 1.615, -3.6625);         // tow-plate overhang
  P.add('hullDetail', box(1.9, 0.05, 0.05), 0, 1.66, -3.595);
  P.add('hullDark', cylZ(0.055, 0.016, 10), 0.37, 1.28, -3.745);
  P.add('hullDark', cylZ(0.055, 0.016, 10), -0.37, 1.28, -3.745);
  for (const s of [-1, 1]) {
    P.add('hull', box(0.11, 0.055, 0.55), s * 1.045, 1.5325, -3.425); // under-fender sponson strips
    P.add('hull', box(0.36, 0.05, 0.55), s * 0.925, 1.535, -3.425);   // §B2 webs over the sprocket bay
  }
  // The former paired fender boxes and their strapped roll have moved to the
  // turret owner.  Leaving no duplicate hull lids here prevents the boxes
  // from staying behind when the turret yaws.
  // ---- wheel-bay shadow backdrops (interval-interior: deck-owned tops,
  // track-owned bottoms; the under-skirt zone reads as bay shade, not a
  // pale belt face). x 1.07..1.09 + z ±2.40 keep the panel edges clear of
  // the 1.115 band inner face and the ground-ramp corners (§B4 audit: a
  // 1.10/±2.5 first cut kissed the ramp at 2 vox).
  for (const s of [-1, 1]) {
    P.add('hullShadow', box(0.02, 0.66, 4.8), s * 0.99, 0.43, 0.0);
  }

  // ---- TURRET: the family cast saucer + reclined face, with the Mk 10
  // STILLBREW masses over the front third and the TOGS barbette right.
  // Ring at the spec armor pivot (world y 1.72, z +0.10).
  P.turretG.position.set(0, 1.72, 0.10);
  P.gunG.position.set(0, 0.16, 0.55);
  // saucer crown (family lathe; crown 2.385 world falling aft)
  P.add('turret', KIT.lathe([
    [1.30, 0.13], [1.32, 0.30], [1.22, 0.46], [1.05, 0.565], [0.78, 0.635], [0.45, 0.66], [0.02, 0.665],
  ], 30, 1.25), 0, 0, -0.55);
  // reclined face trio (family O1a pattern: center panel + two cheek facets)
  P.add('turret', slab(
    [-0.26, -0.28, 1.42], [0.26, -0.28, 1.42], [0.30, -0.25, 0.35], [-0.30, -0.25, 0.35],
    [-0.16, 0.62, 0.10], [0.16, 0.62, 0.10], [0.24, 0.655, -0.4], [-0.24, 0.655, -0.4]));
  P.add('turret', slab(
    [0.26, -0.28, 1.42], [0.55, -0.28, 1.42], [0.62, -0.25, 0.35], [0.30, -0.25, 0.35],
    [0.16, 0.62, 0.10], [0.30, 0.570, 0.066], [0.50, 0.607, -0.433], [0.24, 0.655, -0.4]));
  P.add('turret', slab(
    [-0.55, -0.28, 1.42], [-0.26, -0.28, 1.42], [-0.30, -0.25, 0.35], [-0.62, -0.25, 0.35],
    [-0.30, 0.570, 0.066], [-0.16, 0.62, 0.10], [-0.24, 0.655, -0.4], [-0.50, 0.607, -0.433]));
  P.add('turret', slab(                                   // chin to the collar
    [-0.5, -0.31, 1.30], [0.5, -0.31, 1.30], [0.6, -0.31, 0.2], [-0.6, -0.31, 0.2],
    [-0.55, -0.28, 1.44], [0.55, -0.28, 1.44], [0.62, -0.25, 0.4], [-0.62, -0.25, 0.4]));
  // ---- STILLBREW (the Mk 10 acid tell): appliqué masses over the turret
  // front — ONE raked face per block (§B1, no staircase), stepped ABOVE the
  // saucer brow so the front third reads as the hump. Center brow block over
  // the collar + a cheek block each side + side extensions to the waist.
  P.add('turret', slab(                                   // center brow hump
    [-0.30, 0.10, 1.24], [0.30, 0.10, 1.24], [0.34, 0.10, 0.42], [-0.34, 0.10, 0.42],
    [-0.26, 0.66, 0.66], [0.26, 0.66, 0.66], [0.30, 0.78, 0.30], [-0.30, 0.78, 0.30]));
  for (const s of [-1, 1]) {
    P.add('turret', slab(                                 // cheek block (raked face)
      [s * 0.30, -0.02, 1.30], [s * 0.66, -0.02, 1.10], [s * 0.72, -0.02, 0.34], [s * 0.34, -0.02, 0.42],
      [s * 0.26, 0.62, 0.70], [s * 0.56, 0.58, 0.56], [s * 0.64, 0.66, 0.20], [s * 0.30, 0.74, 0.30]));
    P.add('turret', slab(                                 // side extension to the waist
      [s * 0.66, -0.10, 1.02], [s * 0.90, -0.10, 0.72], [s * 0.94, -0.10, 0.10], [s * 0.72, -0.10, 0.20],
      [s * 0.60, 0.44, 0.78], [s * 0.82, 0.40, 0.56], [s * 0.88, 0.50, 0.06], [s * 0.66, 0.56, 0.14]));
    // Stillbrew joint strips (bolted appliqué seams — §B3 identifiable kit)
    P.add('turretDark', box(0.02, 0.42, 0.03), s * 0.62, 0.24, 0.86, 0, s * 0.5, 0);
  }
  P.add('turret', box(1.62, 0.34, 0.70), 0, -0.02, 0.06);  // ring collar armour band
  // casting waist band + shoulders (family)
  P.add('turret', box(1.80, 0.60, 0.90), 0, 0.35, -0.42);
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.90, 0.05, 0.03], [s * 1.44, 0.05, 0.03], [s * 1.44, 0.05, -0.87], [s * 0.90, 0.05, -0.87],
      [s * 0.90, 0.635, 0.03], [s * 1.44, 0.55, 0.03], [s * 1.44, 0.55, -0.87], [s * 0.90, 0.635, -0.87]));
  }
  P.add('turret', box(1.58, 0.024, 0.64), 0, 0.617, -0.42);
  P.add('turretDetail', box(0.08, 0.024, 0.8), -0.83, 0.645, -0.42);
  P.add('turretDetail', box(0.08, 0.024, 0.8), 0.83, 0.645, -0.42);
  // ---- TOGS thermal barbette on the RIGHT cheek (program-frame chirality:
  // +x = right): pedestal + armored housing + curved hood + dark aperture
  // with recessed glass + top flap (§B3 sight grammar — hood + lens).
  P.add('turret', box(0.40, 0.26, 0.50), 0.78, 0.42, -0.02);            // pedestal
  P.add('turret', box(0.46, 0.40, 0.60), 0.80, 0.68, 0.02);             // housing (top 0.88 local)
  P.add('turret', cylX(0.23, 0.46, 14), 0.80, 0.86, -0.06);            // hood roll
  P.add('turretDetail', box(0.50, 0.03, 0.40), 0.80, 0.905, -0.10);     // lid flap (2.62 world)
  P.add('turretDark', box(0.36, 0.26, 0.05), 0.80, 0.66, 0.30);         // aperture recess
  P.add('turretGlass', box(0.24, 0.14, 0.015), 0.80, 0.66, 0.315);      // sight glass (recessed)
  P.add('turretDetail', box(0.05, 0.30, 0.05), 0.60, 0.58, 0.24);       // conduit into the casting
  // left cheek stowage bin (replaces the Mk 5 searchlight — TOGS-era fit)
  P.add('turret', box(0.34, 0.30, 0.62), -0.78, 0.36, 0.12);
  P.add('turretDetail', box(0.30, 0.02, 0.56), -0.78, 0.52, 0.12);
  // ---- chin band over the driver (family B1/B2/B3, nose trimmed to +1.90
  // so the turretMass span holds ≤55% of hull — §B8.1 gate 4)
  P.add('turret', slab(
    [-0.62, 0.10, 1.44], [0.62, 0.10, 1.44], [0.66, 0.14, 0.90], [-0.66, 0.14, 0.90],
    [-0.56, 0.595, 1.44], [0.56, 0.595, 1.44], [0.62, 0.56, 0.90], [-0.62, 0.56, 0.90]));
  P.add('turret', slab(
    [-0.60, 0.185, 1.58], [0.60, 0.185, 1.58], [0.62, 0.10, 1.44], [-0.62, 0.10, 1.44],
    [-0.56, 0.46, 1.58], [0.56, 0.46, 1.58], [0.56, 0.505, 1.44], [-0.56, 0.505, 1.44]));
  P.add('turret', slab(
    [-0.55, 0.31, 1.86], [0.55, 0.31, 1.86], [0.60, 0.185, 1.58], [-0.60, 0.185, 1.58],
    [-0.52, 0.375, 1.86], [0.52, 0.375, 1.86], [0.56, 0.46, 1.58], [-0.56, 0.46, 1.58]));
  P.add('turret', box(0.5, 0.13, 0.44), 0, 0.285, 1.66, -0.24, 0, 0);   // chin cover
  // ---- No.15 commander cupola LEFT (cap 2.90 world = the heightM anchor)
  P.add('turret', cylY(0.15, 0.165, 0.22, 16), -0.88, 0.69, -0.285);
  P.add('turret', cylY(0.105, 0.105, 0.335, 16), -0.88, 0.9575, -0.225);
  P.add('turret', cylY(0.045, 0.045, 0.055, 14), -0.88, 1.1525, -0.163);
  P.add('turretDark', cylY(0.038, 0.038, 0.016, 14), -0.88, 1.172, -0.163);
  for (let k = 0; k < 5; k++) {
    const a = -0.9 + k * 0.55;
    P.add('turretDark', box(0.05, 0.045, 0.04), -0.88 + Math.sin(a) * 0.10, 1.09, -0.20 + Math.cos(a) * 0.075, 0, a, 0);
  }
  P.add('turretDark', box(0.05, 0.05, 0.14), -0.88, 1.0975, -0.21);
  // commander sight saddle + roof furniture (family crown kit)
  P.add('turret', box(0.30, 0.205, 0.32), -0.62, 0.7575, -0.565);
  P.add('turret', box(0.30, 0.15, 0.115), -0.62, 0.705, -0.7775);
  P.add('turretDetail', cylY(0.19, 0.21, 0.06, 14), 0.46, 0.595, -0.54); // loader hatch ring
  P.add('turret', box(0.2, 0.07, 0.24), 0.30, 0.625, -0.30);
  P.add('turretDark', box(0.14, 0.045, 0.03), 0.30, 0.645, -0.17);
  P.add('turretDark', box(0.135, 0.082, 0.38), -0.1925, 0.701, -0.40);
  P.add('turret', cylY(0.034, 0.030, 0.055, 12), 0.6425, 0.6375, -0.50);
  liftEye(P, 'turretDetail', -0.84, 0.565, 0.35, 0.4);
  liftEye(P, 'turretDetail', 0.84, 0.565, 0.35, -0.4);
  // ---- L37 GPMG on the cupola ring (§B3 census fitting; receiver stays
  // under the 2.90 cupola cap line)
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0.06, scale: 0.8, seed: 7 });
    mg.position.set(-0.60, 0.72, -0.30);
    mg.rotation.y = 0.35;
    P.turretG.add(mg);
  }
  // ---- smoke dischargers: 2×6 on bracket arms low on the cheeks (family)
  for (const sd of [-1, 1]) {
    P.add('turretDetail', box(0.34, 0.05, 0.05), sd * 0.72, 0.02, 0.92, 0, sd * 0.35, 0);
    P.add('turretDark', box(0.15, 0.17, 0.36), sd * 0.94, 0.0, 0.94, 0, sd * 1.1, 0);
    smokeCluster(P, sd * 0.99, 0.12, 1.00, 6, sd * 1.2, 0.8);
  }
  // ---- turret flank bins (short, ON the casting rear sides; bottoms 1.90
  // world clear the 1.85 fender-bin lids on yaw)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.30, 0.38, 1.00), s * 1.17, 0.37, -1.05);
    P.add('turretDetail', box(0.26, 0.02, 0.94), s * 1.17, 0.565, -1.05);
    P.add('turretDark', box(0.008, 0.30, 0.94), s * 1.005, 0.36, -1.05);
  }
  // ---- bustle: NBC pack + rear rack tray with duffel rolls (family O5)
  P.add('turret', box(1.5, 0.46, 0.6), 0, 0.29, -1.62);
  P.add('turretDetail', box(1.20, 0.03, 0.07), 0, 0.505, -1.405);
  P.add('turretDetail', box(1.20, 0.03, 0.07), 0, 0.505, -1.835);
  P.add('turret', box(1.20, 0.03, 0.36), 0, 0.475, -1.62);
  P.add('turret', box(1.15, 0.46, 0.5), 0.1, 0.29, -1.98);
  P.add('turret', box(1.49, 0.28, 0.14), -0.015, 0.255, -2.10);
  P.add('turret', box(0.09, 0.40, 0.14), -0.715, 0.315, -2.10);
  P.add('turret', box(0.10, 0.40, 0.14), 0.68, 0.315, -2.10);
  tarpRoll(P, 'turretCloth', -0.40, 0.393, -2.09, 0.55, 0.105, true);
  tarpRoll(P, 'turretCloth', 0.27, 0.395, -2.09, 0.46, 0.095, true);
  P.add('turretDetail', box(1.42, 0.04, 0.04), 0, 0.50, -2.16);
  P.add('turretDetail', box(1.42, 0.04, 0.04), 0, 0.12, -2.16);
  for (let k = 0; k < 6; k++) P.add('turretDetail', box(0.03, 0.36, 0.03), -0.66 + k * 0.264, 0.31, -2.16);
  stowage(P, 'turretCloth', P.rng, [[-0.35, 0.56, -1.62, 0.62, 0.20, 0.34], [0.45, 0.55, -1.64, 0.5, 0.18, 0.30]]);
  KIT.ammoCan(P, 'turretDark', 0.98, 0.55, -1.60, 0.25);
  // ---- twin whip antennas at the bustle corners (kneed at the 2.90 line —
  // with the cupola cap they spend 3 of the 4 p95 spike columns)
  for (const s of [-1, 1]) {
    P.add('turret', box(0.06, 0.16, 0.08), s * 0.95, 0.62, -1.90);
    P.add('turretDark', box(0.032, 0.44, 0.09), s * 0.95, 0.94, -1.90);
  }
  // ---- L11A5: cast collar stack out of the chin (§B3.1 mantlet mass — the
  // Chieftain's mantletless collar casting), FULL thermal sleeve + clamp
  // rings (buildGun sleeve), fume extractor ~60%, MRS at the muzzle, bore.
  P.addGunExtra(cylZ(0.17, 0.42, 18, 0.21), 0, 0, 0.16);
  P.addGunExtra(cylZ(0.155, 0.55, 18, 0.185), 0, -0.01, 0.62);
  P.addGunExtra(cylZ(0.175, 0.092, 16), 0, 0.015, 1.10);
  buildGun(P, { len: 6.38, r: 0.105, sleeve: true, evac: 0.60, evacR: 1.45, collar: true, baseR: 0.16 });
  muzzleBore(P, { len: 6.38, r: 0.105 });                 // §B3.1 (shadow-named)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.19, 0.30, -1.0], Math.PI / 2);
  // family tone kit (glass calm + wheel/band tones; gear pad/chain tones
  // ride the MK10_HULL params like the graduate's)
  ukToneKit(P, { cloth: 0x3e4532 });
  P.topY = 1.15;
}

// ---------------------------------------------------------------------------
// Centurion Mk.3 / Mk.5 — re-repaired bergman prints (assembled turrets).
// VERTEX ROUND r1 (2026-08-03): retabled against the registered parity
// tables (tools/tmp-uk-parity.mjs -> shots/uk-r1/centurion5). The print is
// the best-conditioned UK oracle (hull span -1%, width 0%): hull plate runs
// -3.55..+3.48 with a stepped driver plate (1.69 deck -> 1.51 glacis) and a
// vertical nose plate; the ground line belongs to a 24-inch track band at
// |x| 0.94..1.55 with RAISED END WHEELS at the extremes (idler z 3.50
// y 1.03, sprocket z -3.33 y 1.15 — long climbing runs both ends, the rim
// bands carry the silhouette past the hull plates to z +-3.85); fender
// horns over the idlers carry the plan to (x 1.70, z 3.86).
// Published: hull 7.56, overall 9.83, width 3.38, height 2.94 (sovereign).
const CENTURION_HULL = {
  bodyHalfW: 1.55, nose: 3.458,
  // r5 (written-order round): deck retabled to the EXTRACT curves (build z =
  // extract z + 1.233, probe-verified against root boxes; the workorder's
  // printed frame sits +0.586 from build). Flat run 1.658 over 0.35..2.05
  // with the 1.70 cable-pad zone at 2.05..2.44, the driver step falls
  // 1.693 -> 1.512 in ONE rake (2.44 -> 2.56, NO-STAIRCASES), glacis
  // 1.483 -> 1.462 to the tip (ref 1.485..1.462; the old 1.505 flat +
  // hatch-lid furniture read +0.06..+0.20 over eight columns). Tail 1.75 to
  // -3.16 then falling courses into the r5 overhang SHELF (build fn slabs;
  // the old tailShelf loft at yBot 0.87 read -0.10..-0.34 under the ref's
  // high 1.2-line shelf).
  // r6 (90-push): driver-step rake shifted 0.045 forward to the LIVE ref
  // scan (ref tops 1.695@2.397, 1.54@2.497 — the r5 2.44..2.56 rake read
  // +0.07..+0.08 high on the build-2.53 column, the worst side_hull col
  // both marks); nose tip trimmed to the ref's 3.454 plan line.
  deck: [[3.458, 1.462], [2.80, 1.483], [2.49, 1.512], [2.40, 1.693], [2.30, 1.694],
    [2.05, 1.660], [0.35, 1.658], [-1.00, 1.75],
    [-3.16, 1.75], [-3.30, 1.685], [-3.40, 1.664]],
  // r6: rear deck plateau narrowed (ref front tops 1.64-1.66 outboard of
  // |x| 1.0 — the step plates in the build fn carry that line; the loft's
  // rear top face pulls to +-1.005).
  deckSplit: { z: 0.35, inset: 0.545 },
  beltTop: 1.0, belly: 0.53,
  // Preserve the complete central hull and both exterior skirt/guard walls,
  // while lifting only the concealed over-track shoulder clear of the
  // native return run. The closed top slabs keep this a solid sponson; no
  // visible side armour is deleted or opened.
  deckCorridor: { x: 0.92, floor: 1.08, z0: -2.45, z1: 2.65 },
  noseRake: [[2.55, 0.53], [3.05, 0.56], [3.30, 0.72], [3.458, 1.08]],
  tailRake: [[-2.30, 0.53], [-3.10, 0.63], [-3.40, 0.78]],
  // Front-view outer columns (ref, r2 re-read): the MAIN skirt plane tops
  // 1.48 / hems 0.59 at x ~1.63-1.66; an OUTER armour strip (1.31..0.81)
  // rides at ±1.695 (was misread as handles); fender lid pinned at 1.60.
  // Tracks stay INSIDE the 1.56 column — the r1 0.61-wide band's shoes lit
  // the ±1.58 front columns to the ground where the ref reads skirt hem.
  skirt: { x: 1.61, top: 1.48, bot: 0.60, z0: -3.20, z1: 3.05 }, skirtPanels: 6,
  fenderY: 1.60, fenderZ0: -3.42, fenderZ1: 2.58, fenderHalfW: 1.60,
  trackXc: 1.23625, trackW: 0.5925, wheelR: 0.4, wheelY: 0.45, wheelStyle: 'dished',
  wheelZs: [2.25, 1.40, 0.55, -0.50, -1.35, -2.20],
  // Raised end wheels, r5 retune to the raycast/extract wrap circles: the
  // ref idler reads LOWER/TIGHTER than the r1 table (wrap tops 1.47-1.51
  // where the old y1.03/r0.38 build topped 1.53-1.60 over the skirt line;
  // ref sprocket circle fits (z -2.95, y 0.99, outer 0.55): bottoms
  // 0.843@-3.48 EXACT, wrap tip -3.50 with the overhang shelf carrying the
  // tail past it). Band + shoes render ~(r + 0.19) beyond each end center.
  // REGISTRATION LAW (r5, measured): the LAST front trace window (build
  // 3.81..3.93) must stay a sub-0.21 sliver like the ref's — a deep horn
  // tip + fatter wrap presence there flipped one reg-body column and
  // shifted every side row's dAlong +0.5 pitch (1.237 -> 1.298, §C stray-
  // column law; hullLengthM never needed it — the gun-union column carries
  // the dims span at 7.52 regardless). Horn tip course ends 3.80 with a
  // thin 0.18 band; idler stays at the ref circle z.
  sprocket: { z: -2.95, y: 0.99, r: 0.37 }, idler: { z: 3.30, y: 0.96, r: 0.345 },
  // r8 (c3 Y2 / c5 O10e): the proud skirt-lip trim strip painted a plan
  // double-edge at x ±1.62-1.64 (dark lip + skirt top as parallel lines) —
  // flush-tuck it (the ch1 push-2 opt-in; side-invisible here under the
  // 1.60 fender line, plan x-extents unchanged: mask-neutral).
  skirtTrimFlush: true,
  trackTop: 0.95, arms: false, coveredTop: true, noFlaps: true, rakeHalfW: 0.88,
  // r6 (90-push): the ref's approach/departure ramps start EARLIER than the
  // default wheel-patch tangents (ref rear ramp fits 0.57/m from z -2.35,
  // front from ~2.6 — the r5 defaults read the ramp bottoms -0.06..-0.13 on
  // 7 side columns both marks) + tilted ramp-pad corners clamped to the
  // ground plane is now owned by the measured complete shoe envelope.
  contactZF: 2.50, contactZR: -2.32,
};

export function centurionBuild(P: UKCenturionPort, mk: 3 | 5): void {
  // r7 (combined tone round) — c5 O1 "expose the running gear": the Mk.5/2
  // raises its skirt hem to the ref's own exposed-disc line (outer-strip
  // band bottoms 0.81 per the r2 tables; wheels top 0.85) across panels
  // 0..4, with panel 5 (stern) keeping the 0.60 hem that owns the front/
  // rear-row minima (interval-mask law — the chieftain5 LEFT-HEM-PARITY
  // silhouette-neutral delivery). centurion3 was NOT ordered here (its 8.6
  // side reads carry a tone lane only): mk 3 keeps the shared table
  // byte-identical.
  const g = mk === 5
    ? { ...CENTURION_HULL, skirtHemSplit: { bot: 0.84, keepPanels: [5] } }
    : CENTURION_HULL;
  ukHull(P, g);
  // Outer skirt armour strip, r6 retable (90-push station-width read): the
  // ref's 14-station widths ALTERNATE 3.318/3.375 — the strip is a
  // CONTINUOUS plate at x 1.659 with mounting BOSSES at 1.687-1.690 spaced
  // so stations s3/s4/s6/s7/s9/s10 catch a boss (3.375) and s1/s2/s5/s8
  // read the bare plate (3.318). The r5 9-panel run at 1.679..1.6895 read
  // 3.379 at EVERY station (+1.7% on the gap stations). WIDTH GUARD: boss
  // outer face 1.6895 = the committed 3.38 halfwidth exactly — the bosses
  // are the widthM carrier now. Plate runs z −3.09..2.52 (ref plan rear
  // −3.066 / front 2.516 at the ±1.68 column).
  for (const s of [-1, 1]) {
    // 12 x 0.4675 panels (station end-cap law §C: a cap in every 0.539
    // station window keeps the plate visible in every slice).
    for (let k = 0; k < 12; k++) {
      P.add('hull', box(0.020, 0.50, 0.4675), s * 1.649, 1.06, -2.85625 + k * 0.4675);
    }
    for (const bz of [-1.766, -1.227, -0.149, 0.390, 1.468, 2.007]) {
      P.add('hullDetail', box(0.031, 0.42, 0.25), s * 1.674, 1.00, bz);
    }
    // r10 (uk round 5, c5 O-top — the shaded-parity r7 O10e "procOnly
    // panel-line thinning", now measured: the evaluator top view carries
    // FOUR 5.37 m 90-deg procOnly lines at x ±1.609/±1.639 = the open slot
    // between the skirt plane (outer face 1.61, top 1.48) and the outer
    // strip row (1.639..1.659, tops 1.31) reading as parallel bright/dark
    // edges from above; the REF's own skirt plane tops 1.48 out at x
    // 1.63..1.66 — one continuous surface, one edge). SKIRT TOP CAP: an
    // olive rail closes the slot from above — MASK-INTERIOR BY
    // CONSTRUCTION toward-ref: front cols x 1.61..1.656 straddle the
    // skirt's own 1.48 top; the fully-outboard window ~1.656..1.66 sliver
    // lights 1.4735 where the REF reads its 1.48 skirt line (r2 read);
    // plan: outer edge 1.6585 stays 0.5 mm inside the panels' 1.659 face
    // (boss 1.6895 width guard untouched, station widths boss/plate-
    // carried); side: 1.4735 rides under the 1.48 skirt top everywhere.
    // Inner edge embeds 9 mm into the skirt plate (§B2 chain). Segmented
    // (§C station end-cap law).
    if (mk === 5) {
      for (let k = 0; k < 12; k++) {
        P.add('hull', box(0.0585, 0.012, 0.44), s * 1.63025, 1.4675, -2.85625 + k * 0.4675);
      }
      // BOW CHUTE COVER (the top view's ±0.865..0.916 procOnly line pair,
      // z 3.02..3.44): the glacis rake loft ends at rakeHalfW 0.88 and the
      // open lane to the shoe band (x 0.94) reads as a bright-edge slot
      // from above where the ref's full-width glacis/guard covers. Dark
      // chute plates close the lane: y 1.435 sits under the glacis line
      // (1.462+) and under the wrap crown band (1.47-1.51 at z>3.2), x
      // 0.870..0.930 embeds 10 mm into the rake loft (§B2) and stays
      // 10 mm clear of the 0.94 shoe face (§B4 lateral); front cols
      // (deck 1.658+ over these x) and plan cols (wrap front owns the
      // lane to 3.8) interior by construction.
      P.add('hullDark', box(0.060, 0.012, 0.40), s * 0.90, 1.435, 2.83);
      P.add('hullDark', box(0.060, 0.012, 0.38), s * 0.90, 1.435, 3.22);
    }
  }
  // Fender horns/guards over the raised idlers: the ref's outboard guard
  // run carries the ±1.66 plan columns to z 3.70 (lateral clearance from
  // the wrap — containment law is x-wise here, guards sit outside the shoe
  // plane, INSIDE the ±1.675 front column: the 1.69 column belongs to the
  // outer strip alone). Segmented for the station windows.
  for (const s of [-1, 1]) {
    // r6: per-segment outer faces tuned to the ref station widths — s11
    // wants 3.308 (seg1 outer 1.654), s12 wants 3.375 (seg2 detail strip
    // widened to the 1.6895 width-guard plane), s13 wants 3.318 (seg3
    // outer 1.659, z-extended to 3.74 = the ref's ±1.68-column plan front).
    P.add('hull', box(0.077, 0.045, 0.42), s * 1.6155, 1.478, 2.60);
    P.add('hullDetail', box(0.03, 0.10, 0.40), s * 1.639, 1.38, 2.59);
    P.add('hull', box(0.09, 0.045, 0.42), s * 1.622, 1.478, 3.035);
    P.add('hullDetail', box(0.0155, 0.10, 0.40), s * 1.68175, 1.25, 3.025);
    P.add('hull', box(0.082, 0.045, 0.42), s * 1.618, 1.478, 3.47);
    P.add('hullDetail', box(0.03, 0.10, 0.40), s * 1.639, 1.38, 3.46);
    // r5: falling guard-tip course past the horns — the ref hull line keeps
    // FALLING toward the mask tip. r6 retable to the live paired columns:
    // ref 1.19..1.159 at the 3.873 column (the r5 1.24-top course A end sat
    // in that column's window and read +0.03), tip extended to 3.905 so the
    // proc hull span end matches the ref's own trim window — the last
    // ref-gun column paired 1 mm past the proc turret trim and minted a
    // phantom cover column on turret_side BOTH marks (interp needs both
    // neighbours; +2.9 gate pts for 35 mm of sliver). x pulled INBOARD to
    // 1.548..1.590 (15 mm clear of the shoe face 1.5325 — containment —
    // and of the 1.619 plan-column boundary: the old 1.585..1.665 course
    // painted the ±1.65/±1.68 plan columns to z 3.87 where the ref reads
    // the 3.75 horn-guard line). Two-threshold law intact: 0.04-0.19 bands
    // stay under the 0.21 registration cut; hullLengthM keeps its span.
    const hx0 = s === 1 ? 1.548 : -1.590, hx1 = s === 1 ? 1.590 : -1.548;
    P.add('hull', slab(
      [hx0, 1.08, 3.795], [hx1, 1.08, 3.795], [hx1, 1.28, 3.68], [hx0, 1.28, 3.68],
      [hx0, 1.25, 3.795], [hx1, 1.25, 3.795], [hx1, 1.40, 3.68], [hx0, 1.40, 3.68]));
    P.add('hull', slab(
      [hx0, 1.155, 3.945], [hx1, 1.155, 3.945], [hx1, 1.08, 3.795], [hx0, 1.08, 3.795],
      [hx0, 1.195, 3.945], [hx1, 1.195, 3.945], [hx1, 1.21, 3.795], [hx0, 1.21, 3.795]));
    // skirt hem mounting brackets (ref front: hem-depth content at ±1.65)
    for (let k = 0; k < 6; k++) {
      P.add('hullDetail', box(0.015, 0.35, 0.10), s * 1.652, 0.775, -2.4 + k * 0.98);
    }
    // r6 engine-deck side plates (ref front-view tops 1.638-1.657 over
    // |x| 1.03..1.47 — the full-width 1.75 loft top face read +0.09 on ~20
    // front columns each mark; the deckSplit narrows the loft, these carry
    // the ref's own side-deck line). Inside the fender plan footprint;
    // segmented (§C station end-cap law).
    segBoxZ(P, 'hull', 0.44, 0.03, 2.16, s * 1.235, 1.641, -2.08, 0.44);
  }
  // r5 REAR OVERHANG SHELF (the r4 written order): the ref tail hangs a HIGH
  // full-width shelf over the sprocket wrap — bottoms 1.21-1.25 behind the
  // wrap tip (-3.50), tops falling 1.66 -> 1.37 to the -3.64 mask end. Three
  // monotone raked courses, co-planar joints (NO-STAIRCASES); course A
  // bottom 1.34 clears the wrap crown (1.31 max) — containment law.
  P.add('hull', slab(
    [-1.575, 1.34, -3.51], [1.575, 1.34, -3.51], [1.575, 1.34, -3.40], [-1.575, 1.34, -3.40],
    [-1.575, 1.648, -3.51], [1.575, 1.648, -3.51], [1.575, 1.664, -3.40], [-1.575, 1.664, -3.40]));
  P.add('hull', slab(
    [-1.575, 1.20, -3.585], [1.575, 1.20, -3.585], [1.575, 1.20, -3.51], [-1.575, 1.20, -3.51],
    [-1.575, 1.575, -3.585], [1.575, 1.575, -3.585], [1.575, 1.648, -3.51], [-1.575, 1.648, -3.51]));
  // r6: C-course retable to the live tail column (ref 1.499..1.252 at the
  // -3.652 column; the r5 1.372-top/-3.675-end course read +0.05/-0.04
  // there and pushed the plan rear 0.03 past the ref's -3.59 center line).
  P.add('hull', slab(
    [-1.575, 1.25, -3.64], [1.575, 1.25, -3.64], [1.575, 1.25, -3.585], [-1.575, 1.25, -3.585],
    [-1.575, 1.40, -3.64], [1.575, 1.40, -3.64], [1.575, 1.50, -3.585], [-1.575, 1.50, -3.585]));
  // r6: flank exhaust-corner stubs — the ref plan rear runs to -3.69 at
  // |x| 1.47..1.575 (center holds the -3.63 line).
  for (const s2 of [-1, 1]) {
    P.add('hull', box(0.13, 0.25, 0.105), s2 * 1.51, 1.375, -3.6375);
  }
  // Glacis: driver hatches ON the glacis flat (r5: the old lids stood at the
  // 1.70 deck line over the FALLEN plate — +0.15..+0.20 on five columns),
  // headlights/links kept UNDER the ref's clean 1.462-1.483 glacis line,
  // shackles on the nose plate (British glacis kit).
  for (const [hx, hz] of [[0.48, 2.98], [0.96, 2.98]]) {
    P.add('hullDetail', box(0.4, 0.03, 0.42), hx, 1.478, hz);
    P.add('hullDark', box(0.34, 0.016, 0.03), hx, 1.493, hz - 0.1);
  }
  if (mk === 5) P.add('hullDetail', box(0.40, 0.05, 0.10), 0.72, 1.532, 2.665); // periscope hump (ref 1.564 col)
  for (const s of [-1, 1]) {
    headlight(P, s * 1.05, 1.40, 3.06, -0.2);
    // r8 (c3 Y1): flush lamp faces — the pods read as featureless drums
    // with a hard-dark face (no lens tell, no arc read; the ref presents
    // r~0.18-class round lamps). A wider smoked-glass face disc + a dark
    // rim ring give the circle read; ring r_out 0.069 stays front-interior
    // (the nose front face behind covers y 1.08..1.46) and plan-interior
    // (max y 1.469 under the 1.474 glacis line at z 3.06).
    P.add('hullGlass', xform(cylZ(0.058, 0.014, 14), 0, 0, 0.042), s * 1.05, 1.40, 3.06, -0.2, 0, 0);
    P.add('hullDetail', xform(new THREE.TorusGeometry(0.060, 0.009, 8, 18), 0, 0, 0.040), s * 1.05, 1.40, 3.06, -0.2, 0, 0);
    P.add('hullDetail', box(0.2, 0.02, 0.16), s * 1.05, 1.445, 3.00, -0.25, 0, 0);
    P.add('hullDetail', box(1.05, 0.045, 0.08), s * 0.54, 1.685, 2.26, 0, s * -0.3, 0);
    P.add('hullDetail', box(0.11, 0.1, 0.15), s * 0.82, 0.95, 3.40);
    P.add('hullDetail', torus(0.065, 0.017, 10), s * 0.82, 0.95, 3.50, Math.PI / 2, 0, 0);
  }
  // r6: cable ends/cleats pulled inboard of the 1.002 front-column boundary
  // (§C AA law — the 1.71 cleat tops painted the ±1.04 columns where the
  // ref reads its 1.647 side-deck line).
  KIT.towCable(P, [[-0.94, 1.70, 2.35], [0, 1.672, 1.5], [0.94, 1.70, 2.35]]);
  P.add('hullDetail', box(0.1, 0.05, 0.14), -0.94, 1.685, 2.35);
  P.add('hullDetail', box(0.1, 0.05, 0.14), 0.94, 1.685, 2.35);
  // Rear mud flaps OUTBOARD of the track band (containment law is lateral
  // here). r6 retable: the ref's station-0 width is 3.204 (the r5 1.663
  // flap edge held s0 at 3.33/+5.6% — the certified residual dissolves at
  // x 1.548..1.605) and the ±1.65 front columns top at the 1.467 skirt
  // line (flap tops pulled 1.58 -> 1.475); rear faces at the ref's fresh
  // -3.066 plan line.
  // r8 (c3 X3, priced vs front_whole 91.2 + side rows): the ref hangs FULL
  // flap panels both ends (outer plane |x|~1.63, bottoms ~0.5) — the r6
  // stub was 0.057x0.20 and the 1d front/rear air residual (8.3/8.6% vs
  // <=7) lived in the uncovered 1.61..1.65 outer-flap columns. Envelopes:
  // REAR panel x 1.548..1.625 (14 mm off the 1.639 strip inner face),
  // bottom 0.545 ABOVE the sprocket-wrap side line at z -3.05 (0.541 —
  // side-interior), rear face at the r6-certified -3.064 plan line, plan
  // sliver x 1.61..1.625 rides the ref's own skirt-zone rear. FRONT panel
  // at z 3.44 under the 3.47 horn-guard segment (top embeds 10 mm into its
  // 1.4555 underside — §B2 chain), x to 1.6335 inside the guards' plan
  // footprint (plan-neutral) and the 1.659 strip width guard, bottom 0.545
  // above the idler-wrap side line at z 3.44 (0.548). §B4 lateral: both
  // panels outboard of the 1.545 shoe/pin envelope.
  // (bottoms 0.625: a first cut at 0.545/0.565 read procBot -0.94 vs the
  // gate ref's -0.87 flap line at the ±1.58 column — the ref hangs its
  // flaps to ~0.63 there, and matching it recovers the front_whole cost.
  // Outer faces 1.6365 [dial 2]: the first 1.625/1.6335 cut left the
  // 1.63..1.65 slit open and the 1d air read 7.6/8.1 vs the <=7 gate —
  // widening to 2.5 mm short of the 1.639 strip face kills it. Rear inner
  // pulled 1.548 -> 1.560 (the pin-cap envelope ends 1.5555; the clip
  // audit read 14 rear vox with the tall flap at 1.548).)
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.0765, 0.85, 0.028), s * 1.59825, 1.05, -3.05);
    P.add('hullRubber', box(0.079, 0.841, 0.028), s * 1.597, 1.0455, 3.44);
  }
  spareTrackStrip(P, 'hull', -0.55, 1.41, 3.05, 3);
  // Engine deck: louvre field + fillers, all under the ref's 1.755 ceiling.
  P.add('hull', box(1.86, 0.05, 1.35), 0, 1.705, -2.2);
  for (const i of KIT.grilleIndices(P.q, 7, 3)) {
    P.add('hullDark', box(1.62, 0.02, 0.05), 0, 1.723, -1.68 - i * 0.17);
    P.add('hullDetail', box(1.72, 0.02, 0.042), 0, 1.729, -1.65 - i * 0.17, 0.5, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.04, 10), s * 0.95, 1.71, -1.35);
  P.add('hullDark', box(1.70, 0.11, 0.03), 0, 1.312, -3.625);

  // ---- slab-walled cast turret, ring (0, 1.78, 0.35) ----
  // VERTEX r2 (2026-08-03): re-authored from the EXTRACT curves (local z =
  // extract + 0.883; the r1 "registered tables" mis-placed the under-ring
  // basket by +0.24, the cupola by +0.31 rear, missed the 2.747 crown ridge
  // and both marks' true bustle rooflines). Ref truth (local/world):
  //   basket 0.651 world over local −0.49..+0.90; ring collar 1.49-1.53
  //   bands −1.02..−0.49 and +0.91..+1.17; crown ridge 2.747-2.754 (LEFT
  //   x −0.91..−0.20) over −0.90..−0.49; cupola dome peak 2.848 at
  //   (x −0.48, local −0.19); fwd crown descends 2.61→2.38 with sight/
  //   periscope bumps; c5 bustle: dip 2.488, step crest 2.55-2.60 to
  //   −1.54, rear flat 2.386 to −2.13 (walls ±1.08 end −1.75, plan-round);
  //   c3 bustle: flat 2.488 to −1.31, hump 2.527@−1.48, rear 2.335@−1.73
  //   (narrow: walls ±1.02 end −1.27).
  P.turretG.position.set(0, 1.78, 0.35);
  // r5: gun axis dropped to the PRINT RAYCAST truth (both marks 1.907-1.910
  // world vs the old 1.935; chieftain law — mask reads under-report it, the
  // r4 mask numbers said 1.912/1.943 with the same 0.03 delta).
  P.gunG.position.set(0, 0.125, 0.6);
  const gunHousing = (
    bucket: string,
    geo: unknown,
    x: number,
    y: number,
    z: number,
    rx = 0,
    ry = 0,
    rz = 0,
    scale: number | readonly number[] = 1,
  ): void => {
    const movingBucket = bucket === 'turretDark' ? 'gunMountDark'
      : bucket === 'turretCloth' ? 'gunMountCloth' : 'gunMount';
    P.add(movingBucket, geo, x - P.gunG.position.x, y - P.gunG.position.y,
      z - P.gunG.position.z, rx, ry, rz, scale);
  };
  P.add('turret', slab(                       // nose plate -> forward cheeks
    // r5: front bottom pair raised/undercut (ref chin rises -0.27 -> -0.24
    // over local 1.30..1.43 into the mantlet throat; the flat -0.29 lip read
    // procB 1.511 vs refB 1.727 at build 1.90) — the chin fill above owns
    // the 1.49..1.57 throat line.
    // (front pair -0.10@1.53 keeps the 1.53 column in the turret 12%-band —
    // the first cut to -0.235@1.49 dropped the front body column and shifted
    // the row's dAlong half a pitch, the §C registration-poisoning class)
    [-0.40, -0.23, 1.46], [0.40, -0.23, 1.46], [1.02, -0.29, 1.04], [-1.02, -0.29, 1.04],
    [-0.35, 0.31, 1.55], [0.35, 0.31, 1.55], [0.90, 0.50, 1.04], [-0.90, 0.50, 1.04]));
  P.add('turret', slab(                       // chin fill: 1.53 -> 1.75 rise
    [-0.62, -0.26, 1.07], [0.62, -0.26, 1.07], [0.50, -0.075, 1.47], [-0.50, -0.075, 1.47],
    [-0.62, 0.02, 1.07], [0.62, 0.02, 1.07], [0.46, 0.02, 1.47], [-0.46, 0.02, 1.47]));
  P.add('turret', slab(                       // cheeks -> crown shoulder
    [-1.02, -0.24, 1.04], [1.02, -0.24, 1.04], [1.06, -0.24, 0.50], [-1.06, -0.24, 0.50],
    [-0.90, 0.50, 1.04], [0.90, 0.50, 1.04], [0.95, 0.64, 0.50], [-0.95, 0.64, 0.50]));
  const cwR = mk === 5 ? 1.10 : 0.98, cwL = mk === 5 ? 1.10 : 0.98;
  P.add('turret', slab(                       // mid casting: crown leans LEFT
    [-1.02, -0.24, 0.50], [1.02, -0.24, 0.50], [1.16, -0.28, -0.60], [-1.16, -0.28, -0.60],
    [-0.95, 0.68, 0.50], [0.95, 0.62, 0.50], [cwR, mk === 5 ? 0.78 : 0.66, -0.60], [-cwL, mk === 5 ? 0.85 : 0.78, -0.60]));
  P.add('turret', slab(                       // rear crown over the collar band
    [-1.16, -0.28, -0.60], [1.16, -0.28, -0.60], [1.12, -0.27, -0.92], [-1.12, -0.27, -0.92],
    [-cwL, mk === 5 ? 0.85 : 0.78, -0.60], [cwR, mk === 5 ? 0.78 : 0.66, -0.60], [cwR, mk === 5 ? 0.77 : 0.65, -0.92], [-cwL, mk === 5 ? 0.86 : 0.79, -0.92]));
  // r7 (tone round, c3 Group 3a — §B1 NO-STAIRCASES/cast grammar): the
  // turret plan front read as a stepped slab taper with hard corners where
  // the ref casting is ONE pear curve (top-view 3x decisive). Chord-limited
  // corner FILL facets round the notch between the nose slab's plan
  // diagonal and the discharger-bank front, authored to the live paired
  // plan columns (ref fronts build 1.68@|x|0.69, 1.649@0.82 — proc read
  // 1.557 at 0.82, -0.09): facet fronts land ON the ref line, tops stay
  // 0.10+ under the casting's 0.60-0.64 front-column line (roof-invisible)
  // and bottoms ride the chin line — side/front rows interior by
  // construction, plan moves TOWARD ref only. c5's front carries the same
  // class but its turret sits at 0.5 headroom mid-critic — banked there.
  if (mk !== 5) {
    // (facet TOPS ride at local 0.34-0.40 — a first cut carried them to the
    // nose-slab edge heights 0.46-0.50 and re-topped the build 1.40..1.53
    // side columns +0.03..0.05 over the ref's 2.17-2.21 line, turret_side
    // 91.1 -> 90.8; the plan fill lives in the bottom quads either way.)
    P.add('turret', slab(                    // right corner, inner facet
      [0.68, -0.235, 1.325], [0.80, -0.235, 1.30], [0.80, -0.25, 1.19], [0.68, -0.25, 1.27],
      [0.68, 0.40, 1.29], [0.80, 0.40, 1.265], [0.80, 0.34, 1.19], [0.68, 0.36, 1.27]));
    P.add('turret', slab(                    // right corner, outer facet
      [0.80, -0.235, 1.30], [0.93, -0.24, 1.29], [0.93, -0.25, 1.10], [0.80, -0.25, 1.19],
      [0.80, 0.40, 1.265], [0.93, 0.40, 1.255], [0.93, 0.34, 1.10], [0.80, 0.34, 1.19]));
    P.add('turret', slab(                    // left corner, inner facet
      [-0.80, -0.235, 1.30], [-0.68, -0.235, 1.315], [-0.68, -0.25, 1.27], [-0.80, -0.25, 1.19],
      [-0.80, 0.40, 1.265], [-0.68, 0.40, 1.28], [-0.68, 0.36, 1.27], [-0.80, 0.34, 1.19]));
    P.add('turret', slab(                    // left corner, outer facet
      [-0.87, -0.24, 1.29], [-0.80, -0.235, 1.30], [-0.80, -0.25, 1.19], [-0.87, -0.25, 1.141],
      [-0.87, 0.40, 1.255], [-0.80, 0.40, 1.265], [-0.80, 0.34, 1.19], [-0.87, 0.34, 1.141]));
  }
  // crown ridge (2.747-2.754, left-biased like the print's cast crown);
  // r5: rear edge extended to local -0.92 (the -0.55 build column read 2.64
  // where the ref plateau holds 2.747 — the ridge ended half a column short).
  // r6: x-narrowed to -0.88..-0.10 — the live front columns read the ref at
  // 2.61 by x -0.93 and 2.60 at x -0.01 (the old -0.95..-0.03 span paid
  // +0.11 on both edge columns); z untouched (side-certified 2.732 plateau).
  // r8 (c3 X1b / c5 O3b — FLAT-CAP-BEHIND-A-RAKE): the flat plate's edges
  // read all round vs the print's cast swell. A raked top (0.9675 rear ->
  // 0.9335 front, chasing the evaluator's left-view Δ+4.5° ref fall) was
  // TRIED and measured: turret_side 91.1 -> 91.0 (c3) / 90.5 -> 90.3 (c5) —
  // the evaluator's ref fall is a SHADING edge, not the mask top line; the
  // flat plateau is the mask truth (r5 2.732 side cert stands). REVERTED to
  // the flat box; the delivered X1b/O3b piece is the two FORWARD CAPS
  // flanking the cupola drum (which itself fills x -0.67..-0.23 of the front
  // cliff): they grade the plate's forward edge onto the crown, tops under
  // the 0.9675 plate top at every shared x, bottoms on the crown plane —
  // front/side interior by construction.
  P.add('turret', box(0.845, 0.11, 0.435), -0.4775, 0.912, -0.7025);
  // no-air r1 (§5.35 item 10 + §5.18, uk see-through round): the crown-ridge
  // plate HOVERED 67-78 mm above the crown slabs (bottom 2.637 world over
  // tops 2.50-2.57) — an enclosed-sky window from front-low (889px) and
  // every traversed side (802px y90-T; the rear-low "floating cap" islands
  // were the same gap). The print's ridge is a SOLID cast swell (r2 extract:
  // 2.747-2.754 plateau with mass beneath; ref front_turret bot 1.491-1.531
  // across these columns). Pedestal fill closes the under-plate volume:
  // plan 20 mm inside the plate footprint each way, top embeds 20 mm into
  // the plate, bottom embeds below the 0.723 crown-top minimum (§B2 chains
  // both ends) — all three ortho outlines untouched (interior hole close).
  // mk3 only: c5 keeps byte-identical (its own hover is that lane's order).
  if (mk === 3) P.add('turret', box(0.805, 0.167, 0.395), -0.4775, 0.7935, -0.7025);
  // r9 (uk round 4, c5 ONLY — the CASTING-READ round; centurion3 is a
  // hash-frozen graduate bf0a45e8 and every strip below is mk-5-gated):
  // the r8 interior relief landed but the crown still tiles as rectangles
  // at 1x (straight pale arris lines, hero-toptilt/top). Flush-tangent 45°
  // chamfer strips along the exposed top arrises — each rolled diamond is
  // centered t/√2 inside BOTH faces so its vertices land ON the face
  // planes (tangent-line contact, zero silhouette by construction; the
  // compound-rotation extreme only ever RECEDES). The ridge front arris is
  // already graded by the r8 forward caps + drum — rear + both sides get
  // the ease. Camo 'turret' bucket: the chamfer reads as the casting's own
  // rounded shoulder, not trim.
  if (mk === 5) {
    P.add('turret', box(0.845, 0.048, 0.048), -0.4775, 0.9331, -0.8861, Math.PI / 4, 0, 0);
    P.add('turret', box(0.048, 0.048, 0.435), -0.8661, 0.9331, -0.7025, 0, 0, Math.PI / 4);
    P.add('turret', box(0.048, 0.048, 0.435), -0.0889, 0.9331, -0.7025, 0, 0, Math.PI / 4);
    // crown-slab outboard creases (§B1 slope-motivates-the-mass — the rake's
    // line continues into the flank as a rounded casting shoulder, not a
    // hard crease): mid-casting E(∓0.95,0.68/0.62,0.50)->F(∓1.10,0.85/0.78,
    // -0.60) as one straight rolled strip per side (pitch/yaw follow the
    // crease; centered inside so the extreme only recedes), rear-crown
    // (x ±1.10, z -0.60..-0.92) flat pair sized from the corner MIN y.
    P.add('turret', box(0.048, 0.048, 1.10), -0.9941, 0.7281, -0.05, 0.1534, 0.1355, Math.PI / 4);
    P.add('turret', box(0.048, 0.048, 1.10), 0.9881, 0.6631, -0.05, 0.1444, -0.1355, Math.PI / 4);
    P.add('turret', box(0.048, 0.048, 0.30), -1.0661, 0.8161, -0.76, 0, 0, Math.PI / 4);
    P.add('turret', box(0.048, 0.048, 0.30), 1.0661, 0.7361, -0.76, 0, 0, Math.PI / 4);
  }
  P.add('turret', slab(
    [-0.88, 0.775, -0.30], [-0.70, 0.76, -0.30], [-0.70, 0.857, -0.485], [-0.88, 0.857, -0.485],
    [-0.88, 0.777, -0.302], [-0.70, 0.762, -0.302], [-0.70, 0.945, -0.485], [-0.88, 0.945, -0.485]));
  P.add('turret', slab(
    [-0.21, 0.73, -0.30], [-0.085, 0.725, -0.30], [-0.085, 0.83, -0.485], [-0.21, 0.835, -0.485],
    [-0.21, 0.732, -0.302], [-0.085, 0.727, -0.302], [-0.085, 0.945, -0.485], [-0.21, 0.945, -0.485]));
  P.add('turret', box(0.07, 0.055, 0.435), -0.03, 0.7925, -0.7025);
  // r6 right-rear sight riser: the ref front view tops 2.69 over x
  // 0.37..0.52 (probe: TurretMesh at [0.45, 2.69, build -0.42..-0.55]) —
  // side-invisible under the 2.747 ridge plateau, exactly the ref's own
  // z-band.
  P.add('turret', box(0.16, 0.09, 0.11), 0.45, 0.865, -0.845);
  if (mk === 5) {
    // r10 (uk round 5): flush-tangent eases on the riser's x-arrises — the
    // bare brick read at close-roof/top; vertices ON the top + side planes
    // (zero silhouette by the r9 grammar).
    P.add('turret', box(0.042, 0.042, 0.11), 0.3997, 0.8803, -0.845, 0, 0, Math.PI / 4);
    P.add('turret', box(0.042, 0.042, 0.11), 0.5003, 0.8803, -0.845, 0, 0, Math.PI / 4);
  }
  // ---- bustle: mark-specific roofline lofts (tables in local coords) ----
  if (mk === 5) {
    // r6: extraZ pins the bottom-table knots (the top-knot-only z-set let a
    // slab bottom cut the -1.02..-1.09 rise corner — the c3 twin of this
    // call read its turret bottom 0.19 low at build -0.82); loft z-end
    // pulled to -1.84 with mid/center strips rounding the plan rear to the
    // LIVE paired columns (rear build -1.49 at |x| 0.91..0.95, -1.62 at
    // 0.78..0.88, -1.74 at 0.66..0.72 — the r5 full-width -2.02 loft ran
    // the ±0.66..0.94 plan columns 0.19-0.29 past the ref).
    loftBand(P, 'turret', 0.95, 0.04, [
      [-0.92, 0.83], [-1.01, 0.755], [-1.07, 0.755], [-1.10, 0.79], [-1.53, 0.835],
      [-1.56, 0.72], [-1.645, 0.64], [-1.667, 0.607], [-1.90, 0.60],
    ], (z) => lineAt([[-0.92, -0.28], [-1.02, -0.248], [-1.09, 0.011], [-1.54, 0.011],
      [-1.667, 0.07], [-1.90, 0.11]], z), -0.92, -1.90, [-1.02, -1.09]);
    P.add('turret', box(1.60, 0.512, 0.14), 0, 0.346, -1.97);
    P.add('turret', box(1.36, 0.512, 0.20), 0, 0.346, -2.00);
    // rounded rear: only the center carries the last 0.13 (plan cert r2)
    P.add('turret', box(1.32, 0.44, 0.15), 0, 0.36, -2.115);
    // r8 (O3d rear read): the bustle rear rendered rectangle-in-rectangle —
    // 45-deg trim strips embedded along the rear boxes' top edges broke the
    // punched-corner highlight. r9 (casting-read round): the 20 mm strips
    // were sub-pixel at 1x (75 px/m rear ortho) — upgraded to 55 mm
    // flush-tangent diamonds (vertices ON both face planes, tangent-line
    // contact, silhouette-identical) so the eased shoulder reads at 1x;
    // one strip per rear course (the three courses carry different rear
    // planes/tops), camo 'turret' so the ease reads as the casting.
    P.add('turret', box(1.54, 0.055, 0.055), 0, 0.5631, -2.0011, Math.PI / 4, 0, 0);
    P.add('turret', box(1.30, 0.055, 0.055), 0, 0.5631, -2.0611, Math.PI / 4, 0, 0);
    P.add('turret', box(1.26, 0.055, 0.055), 0, 0.5411, -2.1511, Math.PI / 4, 0, 0);
    for (const s2 of [-1, 1]) {
      P.add('turret', box(0.055, 0.50, 0.055), s2 * 0.7611, 0.346, -2.0011, 0, s2 * Math.PI / 4, 0);
    }
    // bustle WALLS, r5 z-split kept (dip seg at the 2.48 roof dip, crest
    // seg at 2.60 through local -1.16..-1.57 — side-certified 2.609 both).
    // r6: x re-seated to ±0.90..1.19 — the live front columns want the
    // 2.60 crest INBOARD to x 0.90 (ref 2.607 at the ±0.94 column) and
    // CLEAR of the ±1.24 column (ref 2.256 there; the old -1.25 left edge
    // paid +0.17 on two columns each side).
    P.add('turret', box(0.333, 0.70, 0.24), -1.0715, 0.35, -1.04);
    P.add('turret', box(0.285, 0.70, 0.24), 1.0425, 0.35, -1.04);
    P.add('turret', box(0.333, 0.82, 0.41), -1.0715, 0.41, -1.365);
    P.add('turret', box(0.285, 0.82, 0.41), 1.0425, 0.41, -1.365);
    // r8 (O3a/O3d — probe-verified zero-silhouette relief): the front-row
    // probe (tmp-ukr4-probe, x 0.88..1.28 both models) reads the wall band
    // at MASK PARITY (d -0.04..+0.04; the REF ITSELF cliffs 2.60 -> 2.26
    // between x 1.16 and 1.20) — the critic's 81/165-deg shoulder arcs are
    // the ref render's INTERNAL round-over shading, so easing must stay
    // inside the silhouette:
    // - O3a cheek-to-wall blend wedges: the crown slab's outboard edge
    //   (x ±1.09, y 0.84/0.77) dead-ended 0.15 above the first wall seg's
    //   0.70 top — a raked blend continues the rake's line into the flank
    //   (tops <=0.775 under the 0.79 rear-crown side line and the 0.82
    //   crest front cols; §B1 slope-motivates-the-mass).
    // - O3d corner-trim strips: 45-deg facet strips embedded along the
    //   crest outer-top corners break the square-corner highlight into the
    //   ref's eased-shoulder read; strips sit 6 mm INSIDE both faces —
    //   silhouette byte-identical by construction.
    for (const s of [-1, 1]) {
      const wTop = s < 0 ? 0.775 : 0.760;    // under the crown edge (L 0.86 / R 0.77)
      // slab plan order is (-x,+z),(+x,+z),(+x,-z),(-x,-z) — mirror via
      // lo/hi so the LEFT wedge keeps outward windings (§C winding audit).
      const wLo = Math.min(s * 1.09, s * 1.20), wHi = Math.max(s * 1.09, s * 1.20);
      const yLo = s < 0 ? 0.702 : wTop, yHi = s < 0 ? wTop : 0.702;
      P.add('turret', slab(
        [wLo, 0.70, -0.92], [wHi, 0.70, -0.92], [wHi, 0.70, -1.16], [wLo, 0.70, -1.16],
        [wLo, yLo, -0.92], [wHi, yHi, -0.92], [wHi, yHi, -1.16], [wLo, yLo, -1.16]));
      // r9: crest strips upgraded to 55 mm flush-tangent diamonds seated on
      // each wall's TRUE outer-top corner (L outer -1.238 / R outer 1.185 —
      // the r8 symmetric ±1.165 seat rode inboard of both corners).
      const wOut = s < 0 ? -1.238 : 1.185;
      const wIn = wOut - Math.sign(wOut) * 0.0389;
      P.add('turret', box(0.055, 0.055, 0.39), wIn, 0.7811, -1.365, 0, 0, s * Math.PI / 4);
      P.add('turret', box(0.055, 0.055, 0.22), wIn, 0.6611, -1.04, 0, 0, s * Math.PI / 4);
      // r10 (uk round 5, pear-read extension): the walls' INNER top arrises
      // still draw straight pale lines from top/tilt (the r9 diamonds sit
      // on the outer crest corners only). Same flush-tangent grammar on the
      // inner arrises — centered t/√2 inside the top face AND inside the
      // wall body from its inner face, so vertices land ON both planes
      // (tangent-line contact, zero silhouette; interior toward the dip).
      const wInn = s < 0 ? -0.905 : 0.90;
      const wInC = wInn + Math.sign(wOut) * 0.0389;
      P.add('turret', box(0.055, 0.055, 0.39), wInC, 0.7811, -1.365, 0, 0, s * Math.PI / 4);
      P.add('turret', box(0.055, 0.055, 0.22), wInC, 0.6611, -1.04, 0, 0, s * Math.PI / 4);
    }
    P.add('turret', box(0.08, 0.25, 0.075), -1.14, 0.475, -1.5825);
    P.add('turret', box(0.08, 0.25, 0.075), 1.14, 0.475, -1.5825);
    for (const s of [-1, 1]) {
      // r5: post bottoms lifted to the ref's rising 1.87 bustle-bottom line
      // r6: rear ends pulled to the ref's -1.30 plan line at the ±1.06 col
      P.add('turret', box(0.15, 0.50, 0.15), s * 1.025, 0.345, -1.695);
    }
    P.add('turretDark', box(1.60, 0.02, 0.36), 0, 0.612, -1.77);
  } else {
    // r6: the c3 bustle plan rear ROUNDS hard (live paired columns: rear
    // build -0.93 at |x| 0.82..0.94, -1.06 at 0.69, -1.21 at 0.57, center
    // to -1.40) — the r5 full-width -1.75 loft ran the outer plan columns
    // 0.3-0.45 long. Four width-stepped lofts share the r5 tables; extraZ
    // pins the bottom-table knots (the top-knot-only z-set let the
    // -1.01..-1.31 slab bottom cut the -1.02..-1.09 rise corner — the
    // turret bottom read 1.615 vs the ref's 1.807 at build -0.82, the r6
    // worst c3 side column).
    const c3top = [
      [-0.92, 0.755], [-1.01, 0.78], [-1.06, 0.708], [-1.31, 0.708], [-1.40, 0.728], [-1.477, 0.747],
      [-1.647, 0.637], [-1.75, 0.545]];
    const c3bot = (z: number) => lineAt([[-0.92, -0.28], [-1.02, -0.248], [-1.09, 0.011], [-1.42, 0.011],
      [-1.647, 0.042], [-1.75, 0.07]], z);
    loftBand(P, 'turret', 0.95, 0.19, c3top, c3bot, -0.92, -1.34, [-1.02, -1.09]);
    loftBand(P, 'turret', 0.66, 0.03, c3top, c3bot, -1.34, -1.49);
    loftBand(P, 'turret', 0.52, 0.02, c3top, c3bot, -1.49, -1.60);
    loftBand(P, 'turret', 0.44, 0.02, c3top, c3bot, -1.60, -1.75);
    // left-lean rear boxes (the print casting leans left: ref rear -1.38
    // build at x -0.68, -1.30 at -0.80, -1.16 at -0.93 vs -1.14/-0.99 right)
    P.add('turret', box(0.85, 0.28, 0.07), 0, 0.22, -1.765);
    P.add('turret', box(0.265, 0.50, 0.24), -0.5825, 0.32, -1.61);
    P.add('turret', box(0.09, 0.48, 0.16), -0.80, 0.30, -1.57);
    P.add('turret', box(0.12, 0.46, 0.14), -0.94, 0.28, -1.44);
    P.add('turret', box(0.10, 0.68, 0.32), -0.99, 0.34, -1.06);
    P.add('turret', box(0.13, 0.55, 0.32), 0.985, 0.275, -1.06);
    P.add('turretDark', box(1.6, 0.02, 0.28), 0, 0.718, -1.17);
  }
  // Under-ring basket/breech mass + ring collars (r6: basket floor raised
  // to the live 0.666 bottom line — the r5 0.64 read -0.03 on ~10 side
  // turret-bottom columns).
  P.add('turretDark', box(1.5, 0.90, 1.50), 0, -0.664, 0.19);
  P.add('turret', box(1.3, 0.26, 0.29), 0, -0.155, 1.043);
  // Flank stowage shelves (in the print's TURRET mask — they yaw).
  // r6: split into three width-stepped slabs — the live plan columns taper
  // BOTH marks' shelf rears (c5: -0.69 build at the ±1.28 col, -0.60 at
  // ±1.31, -0.475 at ±1.43; c3 runs deeper inboard: -0.79 at ±1.16) and
  // want the front edge at the 1.22 build line (local 0.87, was 0.77).
  for (const s of [-1, 1]) {
    const a1r = -1.04;
    P.add('turret', box(0.0875, 0.50, 0.87 - a1r), s * 1.18875, 0.17, (0.87 + a1r) / 2);
    if (mk !== 5) P.add('turret', box(0.0875, 0.415, 0.19), s * 1.18875, 0.2125, -1.135);
    const a2r = mk === 5 ? -0.95 : -1.04;
    P.add('turret', box(0.05, 0.50, 0.87 - a2r), s * 1.275, 0.17, (0.87 + a2r) / 2);
    if (mk === 5) {
      const tabR = s < 0 ? -1.10 : -1.03;
      P.add('turret', box(0.05, 0.415, a2r - tabR), s * 1.275, 0.2125, (a2r + tabR) / 2);
    }
    P.add('turret', box(0.165, 0.50, 1.69), s * 1.3825, 0.17, 0.025);
    // r8 (c3 Y4 — bin-row slot floors, med 52.7 vs the >=55 gate; duffels
    // verdict-protected and untouched): the mk3 shelf lids join the scheme
    // detail class (mask-identical bucket swap) and a low olive coaming
    // fills the dark slot shadow behind the duffel row (interior: under the
    // 0.58 duffel top, inboard of the 1.4875 stub, z inside the shelf).
    P.add(mk === 5 ? 'turretDark' : 'turretDetail', box(0.13, 0.02, 0.87 - a1r - 0.06), s * 1.1675, 0.43, (0.87 + a1r) / 2);
    P.add(mk === 5 ? 'turretDark' : 'turretDetail', box(0.165, 0.02, 1.63), s * 1.3825, 0.43, 0.025);
    if (mk !== 5) {
      P.add('turret', box(0.35, 0.065, 0.022), s * 1.175, 0.435, -0.975);
      P.add('turret', box(0.35, 0.065, 0.022), s * 1.175, 0.435, 0.845);
    }
    // r7 (tone round, c5 O5 weave read): the outer basket wall reads as a
    // plain pale camo slab vs the ref's dark woven basketry — rebucket the
    // slab 'turret' -> 'turretDark' on the Mk.5 (mask-identical material
    // swap; the Mk.3 keeps camo). A first cut ran thin slat strips at
    // x 1.469 and partial-pixel-painted the 1.4625 stub-column boundary
    // (±1.42/1.47 plan cols +0.03..0.05) — withdrawn per §C.
    // r8 (O9, shaded-parity r7): the turretDark rebucket OVERSHOT — panels
    // measured 53.8 vs the ref's LIGHT dotted weave 65.2. Same box, same
    // masks, but a standalone mesh on a solid light-olive weave clone
    // (~63 albedo, no camo — the ref weave is unpainted basketry) under
    // rig_turret (§B5), plus flush dark slat hints inset on the outer face
    // (15 mm off every edge; the outer face x 1.5135 sits 74 mm clear of
    // the 1.5875 plan boundary — the r7 withdrawal was the INBOARD 1.469
    // face against the 1.4625 boundary).
    if (mk === 5) {
      const weaveMat = P.mats.detail.clone();
      weaveMat.color.setHex(0x474e38);
      weaveMat.roughness = 0.95;
      weaveMat.envMapIntensity = 0.16;
      weaveMat.onBeforeCompile = vehicleAmbientFloorHook;
      weaveMat.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      P.disposables.push(weaveMat);
      const wg = new THREE.BoxGeometry(0.05, 0.46, 0.55);
      const wall = new THREE.Mesh(wg, weaveMat);
      wall.name = 'basketWeavePanel';
      wall.position.set(s * 1.4875, 0.17, 0.135);
      wall.castShadow = false;
      wall.receiveShadow = true;
      P.turretG.add(wall);
      P.disposables.push(wg);
      // r10 (uk round 5): the r8 slat hints read plain from dead-rear vs
      // the ref's DOTTED weave — full dot lattice on the same outer face
      // (x 1.5135, the r8-cleared 74 mm plan margin; every dot inside the
      // wall's own y/z envelope — mask-free by the same argument).
      for (const wy of [0.045, 0.135, 0.225, 0.30]) {
        for (const wz of [-0.10, -0.01, 0.08, 0.17, 0.26, 0.35]) {
          P.add('turretDark', box(0.004, 0.026, 0.026), s * 1.5135, wy, wz);
        }
        // dead-rear rows: the outer-face dots read edge-on from the rear —
        // the ref presents its weave dots there too. Rear-face pair per
        // row (4 mm proud at z -0.142; x inside the wall span, plan cols
        // interior by the shelf's own -1.03/-1.10 rears).
        for (const wx of [-0.012, 0.012]) {
          P.add('turretDark', box(0.022, 0.026, 0.004), s * (1.4875 + wx), wy, -0.142);
        }
      }
    } else {
      P.add('turret', box(0.05, 0.46, 0.55), s * 1.4875, 0.17, 0.135);
    }
    // r5: ROUNDED outer stub read (r1 cert) — a falling chamfer carries the
    // ref's 1.93-class half-column at x 1.53..1.56 instead of a hard drop
    // from the 2.18 stub lid to the 1.66 tail shelf. v2: the stub box ends
    // 1.5125 (out of the ±1.53 trace window) and the chamfer starts INSIDE
    // it at 1.47 falling to 0.05 — the window max reads ~1.96 like the ref.
    const cx0 = s * 1.47, cx1 = s * 1.545;
    P.add('turret', slab(
      [cx0, -0.06, 0.37], [cx1, -0.06, 0.37], [cx1, -0.06, -0.10], [cx0, -0.06, -0.10],
      [cx0, 0.40, 0.37], [cx1, 0.05, 0.37], [cx1, 0.05, -0.10], [cx0, 0.40, -0.10]));
    for (const zw of [0.72, -0.14]) {
      P.add('turretDark', box(0.32, 0.48, 0.02), s * 1.31, 0.17, zw);
    }
    // r6: the rear cross-wall narrowed to the inboard shelf slab — its z-thin
    // plate at x 1.30..1.47 poked the ±1.43 plan column 0.18 past the ref's
    // tapered shelf rear.
    P.add('turretDark', box(0.105, 0.48, 0.02), s * 1.1975, 0.17, -1.0);
    // r6: c3 duffels trimmed inboard (x 0.99..1.35) — the 1.45 edge painted
    // the ±1.46 front columns at 2.24 where the ref reads its 2.15 shelf line.
    stowage(P, 'turretCloth', P.rng, mk === 5
      ? [[s * 1.33, 0.36, 0.3, 0.24, 0.14, 0.7]]
      : [[s * 1.17, 0.38, 0.3, 0.36, 0.20, 0.7]]);
  }
  // Cupola at the print's own peak (x −0.48, local −0.23; dome 2.848).
  // r5 v2: the ROUND STACK tops at the ref's own 2.85 dome class (its
  // x-wide ring was paying +0.17 on ELEVEN front columns for the p95
  // anchor) — the published-height anchor now rides a NARROW commander
  // sight VANE: 0.06 wide in x (two front columns) but 0.40 long in z
  // (four side columns at 2.92 hold heightM p95 inside the 1% grace;
  // dims sovereign, aligned with the ref's own 2.848 spike zone).
  P.add('turret', cylY(0.198, 0.218, 0.13, 16), -0.45, 0.85, -0.30);
  cupola(P, 'turret', -0.45, 0.87, -0.30, 0.155, 0.145, 6);
  P.add('turretDark', torus(0.145, 0.016, 16), -0.45, 0.97, -0.30);
  // r8 (c3 X2 / c5 O3c — cupola read): the drum stack rendered featureless
  // (c3: "faceted cupola drum, arc unpaired"; the refs present a sculpted
  // ring r~0.10 span ~101-104 deg + clip relief).
  // - CLIP RELIEF (both marks, zero height/plan change): eight radial clip
  //   blocks on the drum cone face — outer extent 0.208 <= the 0.218 base
  //   circle, y-band 0.807..0.893 inside the drum's 0.785..0.915.
  // - HATCH ARC RING (both marks): a 101-deg dark torus arc on the lid
  //   (r 0.10, tube top 1.053 < the 1.055 lid top — zero height change);
  //   answers the unpaired ref arc.
  // - DOME CAP (Mk.5 ONLY — O3c "3-ring stack -> domed read"): a lathe dome
  //   over the lid to 2.844 world, inside the certified 2.85 class (the ref
  //   dome peaks 2.848; the p95 anchor is the VANE, untouched). c3 X2 is
  //   bound to ZERO height change and keeps the flat lid.
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + 0.20;
    P.add('turretDetail', box(0.035, 0.085, 0.012),
      -0.45 + Math.sin(a) * 0.202, 0.85, -0.30 + Math.cos(a) * 0.202, 0, a, 0);
  }
  P.add('turretDark', xform(new THREE.TorusGeometry(0.10, 0.012, 8, 16, 1.76), 0, 0, 0, Math.PI / 2, 0, 0),
    -0.45, 1.041, -0.30, 0, -0.55, 0);
  if (mk === 5) {
    // r10 (uk round 5): ELLIPTICAL dome falloff — the oblq probe attributes
    // the frontright upper silhouette at u -0.87..-0.65 to the REF dome
    // SHOULDER falling 2.842 -> 2.834 (17-deg tangents) where the r9
    // profile held a near-flat cap (3-8 deg over its top 0.21 m). True
    // ellipse x = 0.146*sqrt(1-(y/0.066)^2): same base circle (plan
    // identical), same 2.844 peak (the certified 2.85 class; the p95
    // anchor stays the VANE), mid-flank within -4 mm of the r9 profile
    // (interior) and +6 mm only on the top 2 mm cap sliver (sub-AA).
    P.add('turret', lathe([[0.146, 0], [0.1436, 0.012], [0.136, 0.024], [0.1224, 0.036],
      [0.1047, 0.046], [0.0839, 0.054], [0.0608, 0.060], [0.0357, 0.064], [0.001, 0.066]], 20), -0.45, 0.998, -0.30);
  }
  if (mk === 5) {
    // r10 (uk round 5): the p95-anchor VANE tapers to a blade — the oblq
    // probe attributes the frontright Δ+14.3 fitted edge to THIS box's
    // dead-level 2.93 top (0.29 u-run) pairing against the ref dome
    // shoulder. The Z-SPINE at x -0.45 keeps the FULL 1.155 top over the
    // FULL 0.40 z-run: all four side p95-anchor columns byte-equal
    // (heightM 2.91-2.92 grace intact — dims sovereign), plan base
    // unchanged; only the front-view x-profile tapers (2 tax cols move
    // TOWARD the ref's 2.76 line — the r6-certified vane-tax class
    // shrinks). Roof halves are planar quads (twisted-quad law).
    P.add('turret', box(0.06, 0.064, 0.40), -0.45, 1.062, -0.22);
    P.add('turret', slab(
      [-0.48, 1.094, -0.02], [-0.45, 1.094, -0.02], [-0.45, 1.094, -0.42], [-0.48, 1.094, -0.42],
      [-0.48, 1.098, -0.02], [-0.45, 1.155, -0.02], [-0.45, 1.155, -0.42], [-0.48, 1.098, -0.42]));
    P.add('turret', slab(
      [-0.45, 1.094, -0.02], [-0.42, 1.094, -0.02], [-0.42, 1.094, -0.42], [-0.45, 1.094, -0.42],
      [-0.45, 1.155, -0.02], [-0.42, 1.098, -0.02], [-0.42, 1.098, -0.42], [-0.45, 1.155, -0.42]));
  } else {
    P.add('turret', box(0.06, 0.125, 0.40), -0.45, 1.0925, -0.22);
  }
  P.add('turretGlass', box(0.052, 0.03, 0.05), -0.45, 1.09, -0.035);
  // Loader hatch ring + gunner sight (r5: sight/periscope hoods shaved to
  // the ref's 2.53-2.65 bump lines; the x−0.30 hood holds the ref's own
  // 2.649 zone at build 0.60..0.75) + roof MG dropped to a stowed pintle
  // (2.78 read at build +0.30 vs ref 2.606).
  P.add('turret', cylY(0.20, 0.22, 0.05, 14), 0.42, 0.78, -0.35);
  P.add('turretDark', box(0.32, 0.014, 0.03), 0.42, 0.815, -0.35);
  // r6: sight housing dropped to the ref's 2.53 line (probe: 2.53 over
  // build 0.43..0.71 at x 0.45; the 2.62 top read +0.09 on the +0.42 col)
  P.add('turret', box(0.24, 0.10, 0.30), 0.44, 0.715, 0.29);
  if (mk === 5) {
    // r10 (uk round 5): gunner-sight hood OUTBOARD top arris eased —
    // flush-tangent, silhouette-identical (the front arris keeps its
    // glass strip clear).
    P.add('turret', box(0.036, 0.036, 0.26), 0.5345, 0.7395, 0.29, 0, 0, Math.PI / 4);
  }
  P.add('turretGlass', box(0.16, 0.05, 0.03), 0.44, 0.74, 0.45);
  // r6: right hood raised/re-seated to the live 2.51@build 1.03..1.15 zone
  // (r5 read it 2.429/2.445 — the fresh scan says +0.065 higher, both marks
  // proportionally)
  periscope(P, 'turretDetail', 0.30, mk === 5 ? 0.695 : 0.595, 0.74);
  P.add('turretDetail', box(0.2, 0.10, 0.15), -0.30, 0.82, 0.325);
  P.add('turretGlass', box(0.14, 0.05, 0.03), -0.30, 0.84, 0.415);
  // A visible, fully supported loader's MAG replaces the former low stowed
  // run on the Mk.5/2. Its foot overlaps the hatch ring, its short armor
  // shield rises clear of the crown, and the complete fitting remains
  // equipment rather than enlarging the turret armor envelope. The Mk.3's
  // already-certified low stow is intentionally unchanged.
  if (mk === 5) {
    P.addEquipment('turretDark', cylY(0.16, 0.18, 0.038, 18), 0.42, 0.82, -0.35);
    P.addEquipment('turretDetail', torus(0.155, 0.012, 20), 0.42, 0.838, -0.35);
    const mg = FITTINGS.pintleMG({
      mats: P.mats,
      cls: 'mag58',
      tone: 'two-tone',
      elev: 0.08,
      scale: 1.02,
      seed: 5,
      ammo: true,
      shield: 'low',
      barrelBridge: true,
    });
    mg.name = 'centurion5_loader_roof_machine_gun';
    mg.position.set(0.42, 0.838, -0.35);
    mg.rotation.y = 0.08;
    mg.userData.stationVariant = 'centurion-mk5-loader-mag58-r1';
    mg.userData.forwardFacing = true;
    P.turretG.add(mg);
    P.turretG.userData.centurionRoofMachineGunReceipt = Object.freeze({
      revision: 'centurion-mk5-visible-loader-mag-r1',
      weaponClass: 'mag58',
      supportBucket: 'turretEquipment',
      supportOverlapM: 0.0035,
      forwardFacing: true,
      armorEnvelopeExcluded: true,
    });
  } else {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0, scale: 0.8, seed: 9,
    });
    mg.position.set(-0.10, 0.53, -0.62);
    mg.rotation.y = Math.PI + 0.35;
    P.turretG.add(mg);
  }
  liftEye(P, 'turretDetail', -0.80, 0.36, 1.05, 0.5);
  liftEye(P, 'turretDetail', 0.80, 0.36, 1.05, -0.5);
  liftEye(P, 'turretDetail', -0.88, mk === 5 ? 0.80 : 0.74, -0.70, 2.6);
  liftEye(P, 'turretDetail', 0.82, mk === 5 ? 0.62 : 0.56, -0.70, -2.6);
  // Smoke discharger banks, r6 redesign (the r4/r5 seat missed the ref's
  // FORWARD RAKE): the print's banks ride the cheeks raking down-forward —
  // plan front edges 1.714@|x|1.05 / 1.674@1.16 (probe, BOTH marks, turret
  // mesh) and side tops falling 2.52@build 1.16 -> 2.39@1.28 (c5) /
  // 2.42@0.91 -> 2.30@1.28 (c3). The old cluster seat left the ±1.05..1.19
  // plan columns 0.2-0.3 short and the 1.28 side column -0.10. Bank = flat
  // cap + raked tube slab + low tip plate to the 1.71 plan line; everything
  // seats on the shelf/casting (floater law).
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.05, 0.12, 0.10), s * 1.19, 0.28, 0.80, 0, s * 0.4, 0);
    smokeCluster(P, s * 1.10, 0.38, 0.86, mk === 5 ? 6 : 3, s * 0.95, 0.7);
    const i1 = s * (mk === 5 ? 1.10 : 1.015), i0 = s * 0.92, o1 = s * 1.185;
    if (mk === 5) {
      P.add('turretDetail', slab(
        [i0, 0.45, 0.68], [i1, 0.45, 0.68], [i1, 0.34, 0.78], [i0, 0.34, 0.78],
        [i0, 0.735, 0.68], [i1, 0.735, 0.68], [i1, 0.735, 0.78], [i0, 0.735, 0.78]));
      P.add('turretDetail', slab(
        [i0, 0.34, 0.78], [i1, 0.34, 0.78], [i1, 0.16, 1.32], [i0, 0.16, 1.32],
        [i0, 0.735, 0.78], [i1, 0.735, 0.78], [i1, 0.24, 1.32], [i0, 0.24, 1.32]));
    } else {
      P.add('turretDetail', slab(
        [i0, 0.40, 0.50], [i1, 0.40, 0.50], [i1, 0.30, 0.62], [i0, 0.30, 0.62],
        [i0, 0.645, 0.50], [i1, 0.645, 0.50], [i1, 0.645, 0.62], [i0, 0.645, 0.62]));
      P.add('turretDetail', slab(
        [i0, 0.30, 0.62], [i1, 0.30, 0.62], [i1, 0.16, 1.32], [i0, 0.16, 1.32],
        [i0, 0.645, 0.62], [i1, 0.645, 0.62], [i1, 0.33, 1.32], [i0, 0.33, 1.32]));
    }
    P.add('turretDetail', slab(
      [i1, 0.26, 0.72], [o1, 0.26, 0.72], [o1, 0.14, 1.32], [i1, 0.14, 1.32],
      [i1, 0.36, 0.72], [o1, 0.36, 0.72], [o1, 0.22, 1.32], [i1, 0.22, 1.32]));
    P.add('turretDetail', box(0.15, 0.07, 0.11), s * 1.095, 0.215, 1.305);
    // no-air r1 (§5.35 item 10 "under-cheek pockets" + §5.18 mounts-connect):
    // the bank slabs stood off the receding cheek/nose side faces with a
    // clear corridor beneath — front-low read 480/412px of sky between the
    // bank outer slab and the casting wall (|x| 1.05-1.15, world y
    // 1.79-1.95). The print fuses the banks INTO the cheeks (r6 note: plan
    // fronts probed on the turret mesh; ref front_turret runs SOLID
    // 1.49-2.25+ across |x| 0.98-1.23). One mounting web per side closes the
    // corridor: bottom quad embedded 3-6 mm into the cheek/nose side faces,
    // top quad 10 mm into the bank undersides, outer edges 5-15 mm inside
    // the bank's own plan/front lines — the web silhouette lives inside
    // casting ∪ bank in all three views (the |x| 1.06-1.18 front sliver
    // lands inside the ref's own solid band). mk3 only: c5 byte-identical.
    if (mk === 3) {
      P.add('turret', slab(
        [s * 0.92, -0.10, 0.74], [s * 1.024, -0.10, 0.74], [s * 0.685, -0.16, 1.26], [s * 0.60, -0.16, 1.26],
        [s * 0.92, 0.27, 0.74], [s * 1.18, 0.27, 0.74], [s * 1.17, 0.165, 1.26], [s * 0.60, 0.165, 1.26]));
      // no-air r1b: the first web left a 1-8 cm crack between its sloped
      // outer face and the smoke-cluster bases standing at |x| 1.15
      // (front-low residual 212/154px, raycast: right boundary z-local
      // 0.86-1.16 exactly on the cluster seats). Chained filler box spans
      // web -> cluster base -> bank undersides (all overlapped 10-15 mm);
      // bottom 1.76 world keeps the honest 7 cm ring-air lane over the
      // 1.69 fender. Same interior class: plan under the bank slabs, side
      // under the cheek band, front sliver inside the ref's solid
      // 1.49-2.25 band.
      P.add('turret', box(0.22, 0.32, 0.42), s * 1.06, 0.14, 0.99);
    }
    // r8 (c5 O8, §B3 NO-MYSTERY-BOXES — tone-first pass): the covered banks
    // read as bare dark slabs at the gun root; the ref presents the housing
    // + a scalloped tube-mouth row. Five dark mouth discs + a pale lip
    // strip painted ON the inner raked face (plane (0.735, 0.78) ->
    // (0.24, 1.32), 42.5 deg): discs ride 4 mm proud along the face normal
    // — every proud extent is interior to the bank's own silhouette in all
    // three views (§C margins kept off the 96.9-guard plan columns).
    if (mk === 5) {
      const fy = 0.735 - 0.30 * 0.495, fz = 0.78 + 0.30 * 0.54;   // 30% down the face
      const ny = Math.cos(0.815), nz = Math.sin(0.815);           // face normal (up-forward)
      // r9 (O8 geometry escalation, reserved by the order — the painted
      // discs alone still read bare slabs at 1x): five tube TIPS proud
      // 36 mm along the face normal (r 0.016 cylinders with dark bore
      // discs on their outer faces) give the scalloped mouth row real
      // relief. Interior by construction: proud extent (0, +0.025, +0.026)
      // keeps max y 0.614 under the bank's 0.735 top, max z 0.971 under
      // its 1.32 tip plate, x unchanged — all three ortho silhouettes are
      // the bank's own (the 96.9 plan guard never sees them).
      for (let k = 0; k < 5; k++) {
        const mx = s * (0.938 + k * 0.0335);
        P.add('turretDetail', cylZ(0.016, 0.036, 10),
          mx, fy + 0.018 * ny, fz + 0.018 * nz, -(Math.PI / 2 - 0.815), 0, 0);
        P.add('turretDark', cylZ(0.0125, 0.005, 10),
          mx, fy + 0.0375 * ny, fz + 0.0375 * nz, -(Math.PI / 2 - 0.815), 0, 0);
      }
      P.add('turretDetail', xform(box(0.168, 0.012, 0.005), 0, 0, 0, -(Math.PI / 2 - 0.815), 0, 0),
        s * 1.005, fy + 0.030, fz - 0.026);
    }
  }
  // Bucket on the shelf rear wall (British) + antenna base pots kept under
  // the local roofline (the print tops 2.85 at the cupola only).
  P.add('turretDark', cylY(0.06, 0.075, 0.13, 10), 1.30, 0.02, -0.85);
  if (mk === 5) {
    P.add('turretDetail', cylY(0.04, 0.05, 0.08, 8), -0.92, 0.70, -1.30);
    P.add('turretDetail', cylY(0.04, 0.05, 0.08, 8), 0.92, 0.70, -1.30);
  } else {
    // r5: pots held to the ref's 2.48 rear-roof line (0.75 read +0.07)
    P.add('turretDetail', cylY(0.04, 0.05, 0.06, 8), -0.50, 0.67, -1.50);
    P.add('turretDetail', cylY(0.04, 0.05, 0.06, 8), 0.50, 0.67, -1.50);
  }
  // Recessed internal mantlet + canvas hood: the print's hood is RIGHT-
  // biased (plan front: right to local 1.83, LEFT recedes at 1.48).
  gunHousing('turretDark', box(0.85, 0.34, 0.06), 0, 0.10, 1.50);
  // r8 (c3 X1c): soften the mantlet-recess hard rectangle — the dark plate
  // read as a punched rectangle at 3-4x. An olive lintel bevel eases the top
  // edge and two side bevels ease the verticals; every piece sits INSIDE the
  // recess plate's own footprint (x<=0.425, y<=0.27, z>=1.47) or inside the
  // nose-slab face span (x<=0.35 at the lintel's 0.245..0.295 band), so
  // silhouettes are identical by construction.
  gunHousing('turret', slab(
    [-0.35, 0.245, 1.532], [0.35, 0.245, 1.532], [0.35, 0.245, 1.505], [-0.35, 0.245, 1.505],
    [-0.35, 0.295, 1.541], [0.35, 0.295, 1.541], [0.35, 0.295, 1.528], [-0.35, 0.295, 1.528]), 0, 0, 0);
  for (const s of [-1, 1]) {
    gunHousing('turret', box(0.035, 0.295, 0.014), s * 0.405, 0.0975, 1.535);
  }
  // r6: hood +0.03 to the live 2.115 column (both marks read 2.085 at the
  // build +1.90 column)
  gunHousing('turretCloth', box(0.42, 0.24, 0.34), 0.23, 0.155, 1.63, -0.42, 0, 0);
  gunHousing('turretCloth', box(0.30, 0.16, 0.22), 0.24, 0.14, 1.72, -0.1, 0, 0);
  // r8 (c3 X1a): hood rear-corner chamfer INTO the casting line — the box
  // exits the nose-slab face at y~0.246/z~1.54 and its top-rear corners read
  // free past the casting. A canvas lap rides the face plane (z(y) = 1.46 +
  // 0.1667*(y+0.23), offset +2 mm out of z-fight — 2 mm << the 22 mm §C
  // pixel, no column risk) from under the hood exit up to the slab's 0.31
  // top edge, so the cover visibly continues onto the casting. x 0.04..0.35
  // stays inside the slab face span at every y it paints.
  gunHousing('turretCloth', slab(
    [0.04, 0.185, 1.5312], [0.35, 0.185, 1.5312], [0.35, 0.185, 1.42], [0.04, 0.185, 1.42],
    [0.04, 0.305, 1.5512], [0.35, 0.305, 1.5512], [0.35, 0.305, 1.44], [0.04, 0.305, 1.44]), 0, 0, 0);
  const gunLen = 5.15;
  if (mk === 5) {
    // L7: the print tube reads ~0.28 thick the whole way (sleeved); the
    // muzzle collar runs to the tip so the plan trace holds the last bins.
    buildGun(P, { len: gunLen, r: 0.125, sleeve: false, evac: null, collar: false, baseR: 0.15 });
    muzzleBore(P, { len: gunLen, r: 0.125 });               // §B3.1 (shadow-named, 3fca39b)
    // r5: the print's L7 extractor drum is TOP-BIASED — authored offset.
    // r6: the live paired columns read the drum band 2.115..1.776 (offset
    // +0.04, r 0.17) and LONGER than the r5 read — full radius from build
    // 3.13 to 3.80 (the r5 3.19..3.55 drum left the 3.5-3.75 columns -0.04
    // on both edges).
    // r7 (tone round O6b): drum BODY -> gunDark (§C material split at the
    // gate-priced geometry) — the Mk.5/2's canonical evacuator tell reads
    // as a distinct dark band vs the camo tube at garage distance (the r5
    // lesson stands: never re-fatten; the taper rings keep scheme paint).
    P.add('gunDark', cylZ(0.170, 0.67, 12), 0, 0.0405, 2.515);
    P.add('gun', cylZ(0.170, 0.08, 12, 0.145), 0, 0.0405, 2.16);
    P.add('gun', cylZ(0.145, 0.08, 12, 0.170), 0, 0.0405, 2.89);
    P.add('gun', cylZ(0.15, 0.8, 12, 0.16), 0, 0, 0.55);
    // r7 (tone round O4c): dark bore disc on the muzzle face — the pale
    // collar end ring read 63.3-66.6 vs the ref's 57.9-with-dark-center.
    // The collar shortens 8 mm and the dark disc's front face sits EXACTLY
    // at the original gunLen tip plane: mask tip unchanged (a first cut
    // 3 mm proud nudged dAlong 1.237 -> 1.238 and smeared ~0.01 mean pct
    // across every side column — the two-threshold registration lesson).
    P.add('gun', cylZ(0.145, 0.552, 12), 0, 0, gunLen - 0.284);
    P.add('gunDark', cylZ(0.118, 0.008, 12), 0, 0, gunLen - 0.004);
  } else {
    // 20-pdr: the print tube reads nearly as thick as the L7's (0.25); a
    // hair fatter here so the thin tube holds its plan center columns.
    buildGun(P, { len: gunLen, r: 0.125, sleeve: false, evac: 0.52, evacR: 1.12, collar: false, baseR: 0.145 });
    // §B3.1 (shadow-named, 3fca39b): bore on the TIP-COLLAR face (gunLen) —
    // the 20-pdr tip collar (below) caps at exactly gunLen, PAST the buildGun
    // tube face, so the len-0.02 seat buried the shadow disc 8mm behind the
    // collar's own camo cap (end-on 44-47 mottled CAP vs the 36-flat family
    // void; boresweep re-cert FAIL). Same class + fix as the L7A1 tip collar
    // below (z = the collar cap plane, r = the collar face radius).
    muzzleBore(P, { z: gunLen, r: 0.145 });
    P.add('gun', cylZ(0.138, 0.6, 12, 0.148), 0, 0, 0.5);
    P.add('gun', cylZ(0.145, 0.5, 10), 0, 0, gunLen - 0.25);
  }
  P.turretG.userData.centurionGunHousingRig = {
    gunPivotLocal: [0, 0.125, 0.6],
    movingHousingBuckets: ['gunMount', 'gunMountDark', 'gunMountCloth'],
  };
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [1.17, 0.2, -0.3], Math.PI / 2);
  // ------------------------------------------------------------------
  // r7 COMBINED TONE ROUND (c5 r6 O2/O4/O5 + c3 r6 Groups 1-2)
  // ------------------------------------------------------------------
  if (mk === 5) {
    // O5 — rear dressing: the ref drapes a tow cable across the tail plate
    // in a double-U with end fittings + spare-link teeth at the shoulders;
    // the r6 tail was bare. Cable rides the stepped course faces flush
    // (max rear z -3.632 inside the -3.64 C-course line; ends on the A
    // face); one link plate per shoulder flat on the B face (top 1.46
    // under the local 1.49 course line, z max -3.632).
    KIT.towCable(P, [
      [-1.22, 1.60, -3.465], [-0.63, 1.30, -3.598], [0, 1.565, -3.48],
      [0.63, 1.30, -3.598], [1.22, 1.60, -3.465],
    ]);
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.08, 0.07, 0.05), s * 1.22, 1.60, -3.475);
      spareTrackStrip(P, 'hull', s * 1.26, 1.38, -3.585, 1, 1.35);
    }
  } else {
    // r8 Y3 (c3 shaded-parity r7): tail-plate dressing — the c3 tail read
    // BARE vs its print's draped-cable jungle. The c5 O5 recipe verbatim
    // (same shared tail courses, same mask-interior envelope: cable max rear
    // z -3.632 inside the -3.64 C-course line, ends on the A face, link
    // plates flat on the B face under the local 1.49 course line); §B3
    // tells: cable drape + end cleats + spare-link chevrons.
    KIT.towCable(P, [
      [-1.22, 1.60, -3.465], [-0.63, 1.30, -3.598], [0, 1.565, -3.48],
      [0.63, 1.30, -3.598], [1.22, 1.60, -3.465],
    ]);
    for (const s of [-1, 1]) {
      P.add('hullDark', box(0.08, 0.07, 0.05), s * 1.22, 1.60, -3.475);
      spareTrackStrip(P, 'hull', s * 1.26, 1.38, -3.585, 1, 1.35);
    }
    // c3 2a — ink/camo overshoot on plan/roof fields (view-top sub-38
    // census 9-10x the print's; medians -3.5..-5.3L): the documented
    // per-spec UP-FACE deck equalization (bakeDirt drops the *0.84 term —
    // the m47 B3 lineage; the print refs bake the shared canvas with NO
    // up-face term, so this is ref-bake parity by construction). Vertex
    // colors only — masks and geometry untouched. c5 was not ordered here.
    P.spec.visual.bakeDirtDeckEq = true;
    // c3 2a/2d second lever (measured post-deckEq: front deck sub-38 3498
    // vs the <=1500 gate, turret 2411 vs <=1000 — the residual is the CAMO
    // MAP's own near-black ink stamps; the shared canvas also paints the
    // ref, so canvas edits are off the table): a map-domain DARK-TEXEL
    // LIFT chained AFTER whatever hook stack the material carries (CSM
    // path composes via onBeforeCompile per engine/lighting.ts
    // setupShadowMaterial — wrapping is the documented chain). Lifts only
    // linear-albedo below ~0.04 (the ink class) toward the print's soft
    // dark-olive; mid camo and the parity side tables are untouched.
    // "Few deep pockets, not many stamps" — §C ordered-class law.
    const inkLift = (m: THREE.MeshStandardMaterial, key: string): void => {
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, rdr) => {
        if (prev) prev(shader, rdr);
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  float ukInkL = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  float ukLift = smoothstep(0.042, 0.007, ukInkL) * 0.0105;
  diffuseColor.rgb += ukLift * vec3(0.85, 1.0, 0.72);
}`);
      };
      m.customProgramCacheKey = () => key;
    };
    inkLift(P.mats.hull, 'veh-ambient-floor-v2+c3ink');
    inkLift(P.mats.barrel, 'veh-ambient-floor-v2+c3ink-b');
  }
  // Shared driver classes (c5 O2/O4 = c3 Groups 1-2): family tone kit —
  // pads/chain rehook+olive (the ambient-dead near-black class: c3 1a/1b,
  // c5 O2a), wheel/drum disc tones (c5 O2b, c3 1c pale-bullseye kill),
  // band multiplier, spare-track teeth/rings, smoked glass (c5 O4b, c3 2b
  // 177 blue px), c5 tan hood retone (O4a — c3 keeps its cloth: the r6
  // verdict measured its duffels at ref parity, no order).
  // Cycle-2 dial (ordered-class law): first cut overshot BRIGHT (left band
  // med 63-66 vs ref 51; horn/pad row 75.9; ground strip p95 75) — hexes
  // re-sampled on the render toward the ref 50-58 class; c5 hood one notch
  // down (p95 82.9 vs the <=73 target).
  // r8 (c3 W1/W2 + c5 O7 — the shaded-parity r7 family finding): disc faces
  // dropped 0x3e4531 -> 0x323826 into the ref 51-class (c5 disc interior
  // read 64.5 vs ref 51.4; c3 band p95 73.2 vs the <=65 gate; the W2 pale
  // ground wedges are the same lit disc arcs at the contact zone) and the
  // ring split restores the dark-drawn rim/bolt read (ukToneKit ringHex).
  // r8 c5 SHOULD set: glassHex half-steps the bow periscope lids toward the
  // 41.4 deck context (O10c: they read +23..28 over it); dark 0x32352c is
  // the O10d drum neutral nudge to the ordered (50,53,44) — the band tell
  // stays (dark vs camo tube), the r-g warmth goes.
  ukToneKit(P, {
    cloth: mk === 5 ? 0x353c2b : undefined,
    glassHex: mk === 5 ? 0x353c35 : undefined,
    dark: mk === 5 ? 0x32352c : undefined,
    wheelHex: 0x323826, wheelEnv: 0.13, drumHex: 0x373d2c, drumEnv: 0.14,
    ringHex: 0x2b2f1f, ringEnv: 0.10,
    padHex: 0x272b20, padEnv: 0.18, chainHex: 0x2f3427, chainEnv: 0.22,
    bandMul: [0.92, 0.98, 0.82], bandEnv: 0.08,
  });
  // c3 1d air + the shared black-window kill: render-only /shadow/ catch
  // plates threaded between the ground-ramp and return-run sag envelopes
  // (idler bay 2.86, mid bay 0.02, sprocket bay -2.68; wheel discs
  // 0.19/0.08 m clear) + the SKIRT-SLOT plate: the measured 1d air is a
  // real background slot between the skirt face (x 1.61) and the outer
  // strip's 0.81 bottom line (rays at x 1.61..1.65, y 0.60..0.81 exit the
  // far side) — the ref's wider skirt plane fills it. A thin shadow-named
  // recess plate closes the render slot; masks never see it.
  ukGearAirBackers(P, [
    [0.52, 0.70, 0.02, 1.23, 0.72, 2.86],
    [0.52, 0.46, 0.02, 1.23, 0.52, 0.02],
    [0.52, 0.72, 0.02, 1.23, 0.76, -2.68],
    [0.008, 0.20, 5.90, 1.632, 0.705, -0.075],
  ]);
  P.topY = 1.2;
}

// ---------------------------------------------------------------------------
// Cromwell-family chassis (Comet / Charioteer / A30): boxy pannier hull with
// a vertical driver's plate, LOW bow deck step, flat full-length track
// guards and exposed Christie gear. Curve-corrected: the tall pannier band
// ends at the driver's plate; the bow runs LOW to a blunt nose.
// ---------------------------------------------------------------------------
interface ClassicHullReceipt {
  readonly width: number;
  readonly length: number;
  readonly halfL: number;
  readonly roofY: number;
}

function cromwellHull(P: UKBuilderPort, o: ClassicUKProfileOptions): ClassicHullReceipt {
  const width = o.width, halfL = o.hullLength / 2;
  const rearL = halfL - (o.tailTrim ?? 0);     // hull rear plate station
  const roofY = o.roofY, bandY = o.bandY, trackW = o.trackW;
  // Containment law: the inner body hugs the REAL track channel (which may
  // sit inboard of the width-derived default when o.trackXc overrides it).
  const chanIn = (o.trackXc ?? (width / 2 - trackW / 2)) - trackW / 2 - 0.06;
  const innerW = Math.min(width - trackW * 2.1, chanIn * 2);
  const bandW = o.bandHalfW ? o.bandHalfW * 2 : width * 0.94;
  const bowZ = o.bowZ ?? halfL * 0.62;         // driver's plate station
  const bowY = o.bowY ?? roofY - 0.24;         // low bow deck
  const noseTipY = o.noseTipY ?? bandY + 0.36;

  P.add('hull', box(innerW, bandY - 0.14, halfL * 0.99 + rearL * 0.98), 0, 0.24 + (bandY - 0.14) / 2, (halfL * 0.99 - rearL * 0.98) / 2);
  // Containment law: the end-wheel wrap circles top out at hornY + 0.72R +
  // 0.135 band — full-width solids stay above that line in the wrap zones.
  const wrapTop = (o.hornY ?? 0.62) + o.wheelR * 0.72 + 0.155;
  // Pannier band: vertical sides ending at the vertical driver's plate.
  // Split at the wrap line: the full-length slice rides above it, the lower
  // slice stops short of the sprocket wrap (silhouette owned by the tracks).
  const ySplit = Math.min(roofY - 0.05, Math.max(bandY, wrapTop, o.corridorY ?? -Infinity));
  const lowerBandY = o.lowerBandY ?? bandY;
  const bodyTop = bandY + 0.10;
  if (o.corridorY && ySplit > bodyTop + 0.01) {
    P.add('hull', box(innerW, ySplit - bodyTop, halfL * 0.99 + rearL * 0.98),
      0, (ySplit + bodyTop) / 2, (halfL * 0.99 - rearL * 0.98) / 2);
  }
  P.add('hull', box(bandW, roofY - ySplit, rearL + bowZ), 0, (roofY + ySplit) / 2, (bowZ - rearL) / 2);
  const zRearLow = -(rearL - (o.sprocketInset ?? 0.38)) + o.wheelR * 0.72 + 0.155;
  if (ySplit > lowerBandY + 0.01) {
    P.add('hull', box(bandW, ySplit - lowerBandY, bowZ - zRearLow), 0, (ySplit + lowerBandY) / 2, (bowZ + zRearLow) / 2);
  }
  // Low bow deck from the driver's plate to the nose, then the short glacis
  // (lower edge held above the idler wrap line).
  const bowLo = Math.min(bowY - 0.02, Math.max(bandY - 0.05, wrapTop, o.corridorY ?? -Infinity));
  P.add('hull', slab(
    [-bandW / 2, bowLo, bowZ], [bandW / 2, bowLo, bowZ],
    [bandW / 2, bowLo + 0.12, halfL * 0.99], [-bandW / 2, bowLo + 0.12, halfL * 0.99],
    [-bandW / 2 * 0.98, bowY, bowZ], [bandW / 2 * 0.98, bowY, bowZ],
    [bandW / 2 * 0.98, noseTipY, halfL], [-bandW / 2 * 0.98, noseTipY, halfL]));
  // §C.1 per-face adjudication (sweep 2026-08-06): the authored rings
  // CROSSED in y along the run (bottom ring above the top ring at the bowZ
  // end) — a twisted prism the winding guard cannot repair (out2/6 mixed;
  // comet/charioteer/a30 read 2.7 cm inward-facing skins on every top-down
  // glacis ray). Same eight corners, rings re-assigned so bottom stays
  // below top at both ends; the guard normalizes handedness.
  P.add('hull', slab(                       // narrow under-slab to the belly
    [-chanIn, bowLo + 0.01, bowZ], [chanIn, bowLo + 0.01, bowZ],
    [chanIn, bandY + 0.1, halfL * 0.99], [-chanIn, bandY + 0.1, halfL * 0.99],
    [-chanIn, bandY - 0.05, bowZ], [chanIn, bandY - 0.05, bowZ],
    [chanIn, noseTipY, halfL], [-chanIn, noseTipY, halfL]));
  // Lower toe/tail solids stay INSIDE the track channel (containment law:
  // the wrap arcs + climbing runs at |x| chanIn..width/2 own those zones).
  const toeW = Math.min(width * 0.44, chanIn);
  P.add('hull', slab(                              // lower glacis to the toe
    [-toeW, 0.32, halfL * 0.9], [toeW, 0.32, halfL * 0.9],
    [toeW, 0.3, halfL * 0.82], [-toeW, 0.3, halfL * 0.82],
    [-toeW, noseTipY, halfL], [toeW, noseTipY, halfL],
    [toeW, noseTipY, halfL * 0.94], [-toeW, noseTipY, halfL * 0.94]));
  // Rear plate closing to the floor + tail rake.
  P.add('hull', frustum(toeW, -rearL * 0.84, -rearL * 0.91, toeW, -rearL * 0.84, -rearL * 0.99, 0.32, bandY + 0.03));
  P.add('hull', frustum(toeW, -rearL * 0.91, -rearL * 0.99, toeW, -rearL * 0.985, -rearL * 0.99, bandY + 0.03, roofY - 0.06));

  // Riveted plate seams + rivet dots on the pannier band.
  for (const s of [-1, 1]) {
    const px = s * (bandW / 2 + 0.006);
    P.add('hullDark', box(0.012, 0.016, rearL + bowZ - 0.3), px, roofY - 0.055, (bowZ - rearL) / 2);
    P.add('hullDark', box(0.012, 0.016, rearL + bowZ - 0.3), px, o.lowerSeamY ?? (bandY + 0.1), (bowZ - rearL) / 2);
    if (P.q) for (let i = 0; i < 11; i++) {
      P.add('hullDark', cylX(0.016, 0.024, 6), px, roofY - 0.13, -halfL * 0.9 + i * (o.hullLength * 0.78 / 10));
    }
    for (const zc of [halfL * 0.4, -halfL * 0.28]) {
      P.add('hullDark', box(0.012, roofY - bandY - 0.14, 0.016), px, (roofY + bandY) / 2, zc);
    }
  }
  // Vertical driver's plate face: framed visor + Besa ball (or blanking).
  P.add('hullDetail', box(0.42, 0.18, 0.05), -width * 0.2, roofY - 0.14, bowZ + 0.02);
  P.add('hullDark', box(0.34, 0.055, 0.03), -width * 0.2, roofY - 0.13, bowZ + 0.035);
  for (const s of [-1, 1]) P.add('hullDetail', box(0.07, 0.045, 0.05), -width * 0.2 + s * 0.16, roofY - 0.035, bowZ + 0.03);
  if (o.mgBall !== false) {
    P.add('hullDetail', cylZ(0.135, 0.06, 14), width * 0.2, roofY - 0.16, bowZ + 0.02);
    P.add('hullDetail', sph(0.105, 12), width * 0.2, roofY - 0.16, bowZ + 0.03);
    P.add('hullDark', cylZ(0.024, 0.22, 8), width * 0.2, roofY - 0.145, bowZ + 0.08);
  } else {
    P.add('hullDetail', box(0.3, 0.16, 0.04), width * 0.2, roofY - 0.15, bowZ + 0.02);
    periscope(P, 'hullDetail', width * 0.2, roofY + 0.045, bowZ - 0.25);
  }
  periscope(P, 'hullDetail', -width * 0.2, roofY + 0.045, bowZ - 0.25);
  // Bow deck kit: hatch + headlights on the low deck.
  P.add('hullDetail', box(0.62, 0.035, 0.55), width * 0.24, bowY + 0.06, bowZ + 0.7, -0.08, 0, 0);
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylY(0.018, 0.018, 0.12, 8), s * width * 0.36, bowY + 0.12, halfL * 0.96);
    headlight(P, s * width * 0.36, bowY + 0.2, halfL * 0.96, -0.12);
  }
  // Deck: raised louvred engine bank + fillers + intake mushroom.
  P.add('hull', box(width * 0.58, 0.075, o.hullLength * 0.245), 0, roofY + 0.03, -halfL * 0.42);
  for (const i of KIT.grilleIndices(P.q, 6, 3)) {
    const z = -halfL * 0.42 + (2.5 - i) * o.hullLength * 0.036;
    P.add('hullDark', box(width * 0.5, 0.022, 0.048), 0, roofY + 0.062, z);
    P.add('hullDetail', box(width * 0.53, 0.024, 0.04), 0, roofY + 0.08, z + 0.028, 0.5, 0, 0);
  }
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.085, 0.085, 0.05, 10), s * width * 0.3, roofY + 0.045, -halfL * 0.16);
  P.add('hullDetail', cylY(0.075, 0.095, 0.09, 10), -width * 0.24, roofY + 0.05, halfL * 0.3);
  P.add('hullDetail', cylY(0.12, 0.085, 0.035, 10), -width * 0.24, roofY + 0.11, halfL * 0.3);
  // Twin fishtail exhaust cowls on the rear deck (kept at the deck line —
  // the comet print's rear deck reads flat).
  for (const s of [-1, 1]) {
    P.add('hull', cylZ(0.105, 0.72, 12), s * 0.52, roofY + 0.015, -rearL * 0.72);
    P.add('hullDetail', box(0.26, 0.05, 0.3), s * 0.52, roofY - 0.02, -rearL * 0.915, 0.55, 0, 0);
    P.add('hullDark', box(0.22, 0.022, 0.06), s * 0.52, roofY - 0.075, -rearL * 0.98, 0.55, 0, 0);
  }
  P.add('hullDark', box(width * 0.3, 0.16, 0.03), 0, roofY - 0.3, -rearL * 0.985);
  // Fender aprons: with a narrowed pannier band the ref reads a low flat
  // apron plate out to the guards (comet/charioteer prints: 1.54 line).
  if (o.bandHalfW) for (const s of [-1, 1]) {
    P.add('hullDetail', box(width / 2 - 0.02 - o.bandHalfW, 0.035, o.hullLength * 0.86),
      s * (o.bandHalfW + (width / 2 - 0.02 - o.bandHalfW) / 2), o.apronY ?? (roofY - 0.16), -o.hullLength * 0.02);
  }
  // Flat full-length track guards + pannier bins (WIDTH GUARD: guard outer
  // edge sits exactly at the committed width/2). Containment law: the guard
  // plane and its tip plates ride ABOVE the end-wheel wrap line.
  for (const s of [-1, 1]) {
    const gx = s * (width / 2 - trackW / 2);
    const gy = Math.max(bandY + 0.02, wrapTop + 0.015, o.guardY ?? -Infinity);
    P.add('hullDetail', box(trackW, 0.035, halfL + rearL + 0.1), gx, gy, (halfL - rearL) / 2);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.26), gx, gy - 0.02, halfL - 0.14, -0.3, 0, 0);
    P.add('hullDetail', box(trackW * 1.06, 0.03, 0.26), gx, gy - 0.02, -(rearL - 0.14), 0.28, 0, 0);
    P.add('hullDetail', box(trackW * 0.82, 0.09, 0.3), gx, gy + 0.06, halfL * 0.52);
    if (!o.noBins) for (const [zc, len2] of [[halfL * 0.24, o.hullLength * 0.2], [-halfL * 0.44, o.hullLength * 0.18]]) {
      P.add('hull', box(trackW * 0.92, 0.22, len2), gx + s * 0.03, roofY - 0.03, zc);
      P.add('hullDark', box(trackW * 0.92 + 0.012, 0.018, len2 - 0.06), gx + s * 0.03, roofY + 0.075, zc);
      for (const f of [-0.3, 0.3]) {
        P.add('hullDark', box(trackW * 0.94, 0.23, 0.022), gx + s * 0.035, roofY - 0.03, zc + f * len2);
      }
    }
  }
  // Bow tow shackles.
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.1, 0.09, 0.14), s * width * 0.28, 0.5, halfL * 0.945);
    P.add('hullDetail', torus(0.065, 0.017, 10), s * width * 0.28, 0.5, halfL * 1.0, Math.PI / 2, 0, 0);
  }
  // Christie run: big dished wheels, no return rollers (Comet adds 4).
  const wheelZs = evenStations(o.wheels, o.wheelSpan, o.wheelBias ?? 0.05);
  buildRunningGear(P, {
    style: 'holes', wheelR: o.wheelR, wheelW: Math.min(0.24, trackW * 0.55),
    wheelY: o.wheelR + 0.15, xc: o.trackXc ?? (width / 2 - trackW / 2), wheelZs, botY: 0.13,
    sprocket: { z: -(rearL - (o.sprocketInset ?? 0.38)), y: o.hornY ?? 0.62, r: o.wheelR * 0.72 },
    idler: { z: halfL - 0.42, y: o.hornY ?? 0.62, r: o.wheelR * 0.72 },
    rollers: o.rollers || [],
    trackW, topY: bandY - 0.07, paintedEnds: true, coveredTop: true, arms: false,
  });
  P.decal('hull', 'number', P.spec.visual.number || '', 0.3, [width / 2 + 0.01, (roofY + bandY) / 2, -halfL * 0.3], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.3, [-(width / 2 + 0.01), (roofY + bandY) / 2, -halfL * 0.3], -Math.PI / 2);
  return { width, length: o.hullLength, halfL, roofY };
}

// Comet A34: low welded turret with curved cast front + rear radio bustle,
// 77 mm HV. Band: turret z -1.9..+2.0 rel ring 0.55, roof 2.55, mantlet 2.0.
function cometBuild(P: UKBuilderPort, o: ClassicUKProfileOptions): void {
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, 0.55);
  P.gunG.position.set(0, 0.16, 0.35);
  const h = 0.75;
  // vertex r1 v2 — REGISTERED PARITY TABLES ONLY (the extract z-frame for
  // this fused/repaired print is unreliable; shots/uk-r1/comet-r2). Lab
  // truth (world): casting face 1.50 with the mantlet band 1.50..1.97
  // (y 1.52..2.14), crown 2.45-2.57 peaking over z -0.02..0.55, rear end
  // -1.00 (bot 1.72 aft of -0.58), walls to |x| ~1.15, under-skirt bot 1.52,
  // basket 0.74 under z 0.27..1.50 ONLY, gun axis ~1.87, and the tall
  // strapped bin on the turret RIGHT (x to 1.52, y 1.92..2.29).
  P.add('turret', KIT.polyTurret([
    [-0.42, 0.95], [0.42, 0.95], [0.92, 0.72], [1.15, 0.10], [1.10, -0.95], [0.88, -1.53],
    [-0.88, -1.53], [-1.10, -0.95], [-1.15, 0.10], [-0.92, 0.72],
  ], h, 1.02, 0.88));
  P.add('turret', cylY(0.50, 0.55, h * 0.92, 18, false, -0.9, 1.8), 0, h * 0.03, 0.45);
  // Crown pad (2.45..2.57 world over z -0.57..0.0 local).
  P.add('turret', box(1.28, 0.12, 0.62), 0, 0.81, -0.28);
  // Under-skirt band closing the casting bottom to the 1.52 line.
  P.add('turret', box(1.85, 0.18, 2.30), 0, -0.09, 0.12);
  // Rear casting bottom 1.72 aft of z -0.58 comes from the poly base; the
  // -1.53..-1.0 rear quarter reads in the poly rear wall.
  // Cupola carries the published-height (2.68) p95 anchor at 2.66 (the
  // print's own peak is 2.57 — dims sovereign, bounded anchor tax).
  P.add('turret', cylY(0.26, 0.28, 0.12, 16), 0.60, h - 0.03, -0.30);
  cupola(P, 'turret', 0.60, h + 0.09, -0.30, 0.25, 0.10, 6);
  P.add('turretDark', torus(0.25, 0.016, 16), 0.60, h + 0.212, -0.30);
  // Turret-right tall bin (print turret mask; outer face capped at the
  // width guard's 1.52 plane).
  P.add('turret', box(0.20, 0.37, 0.75), 1.42, 0.405, -0.50);
  P.add('turretDark', box(0.21, 0.02, 0.69), 1.42, 0.60, -0.50);
  P.add('turretDetail', box(0.16, 0.03, 0.77), 1.42, 0.22, -0.50);
  // Deep basket/breech mass (0.74 world under z 0.27..1.50 world ONLY).
  P.add('turretDark', box(1.3, 0.87, 1.23), 0, -0.615, 0.335);
  P.add('turret', cylY(0.2, 0.2, 0.05, 12), -0.5, h, -0.30);
  P.add('turretDark', box(0.32, 0.014, 0.03), -0.5, h + 0.035, -0.30);
  pintleMG(P, -0.28, h - 0.34, -0.72, false); // owner decoration law: roof MG (kept under the crown line)
  periscope(P, 'turretDetail', 0.3, h + 0.04, 0.15);
  liftEye(P, 'turretDetail', -0.72, h + 0.01, 0.45, 0.5);
  liftEye(P, 'turretDetail', 0.72, h + 0.01, 0.45, -0.5);
  liftEye(P, 'turretDetail', -0.60, h + 0.01, -1.15, 2.6);
  liftEye(P, 'turretDetail', 0.60, h + 0.01, -1.15, -2.6);
  P.add('turretDetail', box(0.05, 0.14, 0.26), 0.98, h * 0.42, 0.45, 0, 0.6, 0);
  smokeCluster(P, 1.06, h * 0.52, 0.52, 5, 0.95, 0.65);
  // Bolted internal mantlet: wide plate + bolt ring + coax/sight ports
  // (registered mantlet band 1.50..1.97 world -> gun-frame z 0.60..1.05).
  P.addGunExtra(box(0.74, 0.58, 0.12), 0, 0, 0.68);
  for (const [bx, by] of [[-0.3, 0.21], [0, 0.24], [0.3, 0.21], [-0.3, -0.21], [0, -0.24],
    [0.3, -0.21], [-0.34, 0], [0.34, 0]]) {
    P.addGunExtraDark(cylZ(0.021, 0.03, 6), bx, by, 0.745);
  }
  P.addGunExtraDark(cylZ(0.032, 0.14, 8), 0.24, 0.1, 0.72);
  P.addGunExtraDark(cylZ(0.026, 0.12, 8), -0.24, 0.12, 0.72);
  P.addGunExtra(cylZ(0.115, 0.3, 12, 0.145), 0, 0, 0.90);
  buildGun(P, { len: o.gunLength, r: 0.115, brake: 'single', sleeve: false, evac: null, collar: false, baseR: 0.16 });
  muzzleBore(P, { len: o.gunLength, r: 0.115, brake: true });                         // §B3.1 (shadow-named, 3fca39b)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, h * 0.42, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
}

// FV4101 Charioteer: tall angular two-tier welded turret, slim 20-pdr.
function charioteerBuild(P: UKBuilderPort, o: ClassicUKProfileOptions): void {
  cromwellHull(P, o);
  // The print's turret band registers ~1 m aft of the hull-length mid (its
  // bow-short hull anchors the frame) — the pivot follows the oracle.
  P.turretG.position.set(0, o.roofY, 0.2);
  P.gunG.position.set(0, 0.27, 0.35);
  P.add('turret', frustum(1.04, 1.22, -1.3, 0.96, 1.02, -1.16, 0, 0.42));
  P.add('turret', frustum(0.96, 1.02, -1.16, 0.56, 0.34, -0.78, 0.42, 0.78));
  P.add('turret', box(0.78, 0.42, 0.14), 0, 0.5, 0.78, -0.35, 0, 0);
  P.add('turretDark', box(0.3, 0.05, 0.05), 0.42, 0.72, -0.1);
  P.add('turret', cylY(0.24, 0.26, 0.14, 16), -0.34, 0.80, -0.52);
  cupola(P, 'turret', -0.34, 0.86, -0.52, 0.22, 0.12, 6);
  P.add('turretDark', torus(0.25, 0.016, 16), -0.34, 1.015, -0.52);
  P.add('turretDark', box(1.3, 0.72, 0.9), 0, -0.51, 0.65);
  P.add('turret', cylY(0.19, 0.19, 0.05, 12), 0.4, 0.78, -0.45);
  P.add('turretDark', box(0.3, 0.014, 0.03), 0.4, 0.815, -0.45);
  periscope(P, 'turretDetail', 0.26, 0.83, 0.05);
  liftEye(P, 'turretDetail', -0.82, 0.53, 0.85, 0.5);
  liftEye(P, 'turretDetail', 0.82, 0.53, 0.85, -0.5);
  liftEye(P, 'turretDetail', -0.7, 0.8, -0.72, 2.6);
  liftEye(P, 'turretDetail', 0.7, 0.8, -0.72, -2.6);
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.24, 0.13, 0.1), s * 0.8, 0.3, 0.92, 0, s * 0.35, 0);
    for (const k of [-1, 0, 1]) {
      P.add('turretDark', cylZ(0.028, 0.16, 8), s * 0.8 + k * 0.065, 0.38, 0.96, -0.45, s * 0.35, 0);
    }
  }
  P.add('turret', box(1.15, 0.32, 0.55), 0, 0.71, -0.80);
  P.add('turretDark', box(1.03, 0.018, 0.48), 0, 0.88, -0.80);
  P.add('turret', box(1.0, 0.5, 0.45), 0, 0.42, -1.20);
  P.add('turret', box(0.9, 0.35, 0.4), 0, 0.18, -1.70);
  for (const xr of [-0.34, 0.34]) P.add('turretDark', box(0.022, 0.30, 0.56), xr, 0.71, -0.805);
  // Forward face wedge (print face line 2.20 at z 0.5 -> 2.42 at 0.0).
  P.add('turret', slab(
    [-0.65, 0.30, 1.10], [0.65, 0.30, 1.10], [0.75, 0.30, 0.30], [-0.75, 0.30, 0.30],
    [-0.55, 0.52, 1.05], [0.55, 0.52, 1.05], [0.72, 0.80, 0.32], [-0.72, 0.80, 0.32]));
  P.add('turretDetail', box(0.022, 0.22, 0.022), -0.88, 0.78, -0.95, 0, 0, -0.05);
  P.add('turretDetail', box(0.022, 0.22, 0.022), 0.88, 0.78, -0.95, 0, 0, 0.05);
  P.addGunExtra(box(0.5, 0.44, 0.12), 0, 0, 0.62);
  for (const [bx, by] of [[-0.2, 0.16], [0.2, 0.16], [-0.2, -0.16], [0.2, -0.16]]) {
    P.addGunExtraDark(cylZ(0.019, 0.03, 6), bx, by, 0.685);
  }
  P.addGunExtra(cylZ(0.095, 0.42, 12, 0.125), 0, 0, 0.86);
  buildGun(P, { len: o.gunLength, r: 0.105, sleeve: false, evac: 0.52, evacR: 1.3, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: o.gunLength, r: 0.105 });                     // §B3.1 (shadow-named, 3fca39b)
  P.add('gun', cylZ(0.14, 1.5, 12, 0.15), 0, 0, 1.9);
  P.add('gun', cylZ(0.12, 1.2, 12, 0.14), 0, 0, 3.25);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [1.0, 0.24, -0.3], Math.PI / 2);
  P.topY = 1.05;
}

// A30 Challenger: long six-wheel chassis, tall narrow 17-pdr turret.
function a30Build(P: UKBuilderPort, o: ClassicUKProfileOptions): void {
  cromwellHull(P, o);
  P.turretG.position.set(0, o.roofY, 0.12);
  P.gunG.position.set(0, 0.35, 0.35);
  const h = 0.84;
  P.add('turret', frustum(0.86, 1.02, -1.18, 0.78, 0.86, -1.06, 0, h));
  P.add('turret', cylY(0.56, 0.62, h * 0.96, 20, false, -1.1, 2.2), 0, h * 0.02, 0.52);
  P.add('turret', box(1.42, 0.3, 0.72), 0, 0.15, -0.95);
  P.add('turretDark', box(1.3, 0.018, 0.62), 0, 0.31, -0.95);
  for (const xr of [-0.42, 0.42]) P.add('turretDark', box(0.022, 0.31, 0.73), xr, 0.15, -0.955);
  for (const s of [-1, 1]) {
    P.add('turretDetail', cylX(0.085, 0.035, 12), s * 0.83, h * 0.48, -0.18);
    P.add('turretDark', cylX(0.032, 0.04, 8), s * 0.835, h * 0.48, -0.18);
    liftEye(P, 'turretDetail', s * 0.62, h + 0.01, 0.55, s * -0.5);
    liftEye(P, 'turretDetail', s * 0.58, h + 0.01, -0.85, s * -2.6);
  }
  P.add('turret', cylY(0.26, 0.28, 0.34, 16), 0.02, h + 0.13, -0.55);
  cupola(P, 'turret', 0.02, h + 0.34, -0.55, 0.23, 0.12, 6);
  P.add('turretDark', torus(0.26, 0.016, 16), 0.02, h + 0.505, -0.55);
  P.add('turretDark', box(1.2, 0.7, 1.05), 0, -0.5, 0.55);
  P.add('turret', cylY(0.18, 0.18, 0.05, 12), -0.44, h, 0.02);
  P.add('turretDark', box(0.28, 0.014, 0.03), -0.44, h + 0.035, 0.02);
  periscope(P, 'turretDetail', 0.3, h + 0.04, -0.05);
  P.add('turretDetail', box(0.022, 0.3, 0.022), 0.7, h + 0.12, -0.9, 0, 0, 0.05);
  P.addGunExtra(box(0.44, 0.42, 0.2), 0, 0, 0.55);
  P.addGunExtraDark(box(0.3, 0.3, 0.03), 0, 0, 0.665);
  P.addGunExtra(cylZ(0.088, 0.44, 12, 0.115), 0, 0, 0.8);
  P.addGunExtra(cylZ(0.062, 0.1, 10), 0, 0, 1.04);
  buildGun(P, { len: o.gunLength, r: 0.11, sleeve: false, evac: null, collar: true, baseR: 0.15 });
  muzzleBore(P, { len: o.gunLength, r: 0.11 });                     // §B3.1 (shadow-named, 3fca39b)
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [0.86, h * 0.35, -0.35], Math.PI / 2);
  P.topY = h + 0.25;
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
const fvGlacisY = (z: number): number => 1.93 - (z - 1.55) * 0.549383;
const fvBowY = (z: number): number => (z > 2.46 ? 0.55 + (z - 2.45) * 1.06 : 0.55);
const fvSternY = (z: number): number => (z < -2.46 ? 0.45 + (-z - 2.45) * 0.496454 : 0.45);
const fvSeg = (a: number, b: number, step = 0.45): number[] => {
  const out = [];
  for (let z = Math.max(a, b) - step; z > Math.min(a, b); z -= step) out.push(Number(z.toFixed(3)));
  return out;
};

function fv510PhotoBuild(P: UKBuilderPort): void {
  const num = P.spec.visual.number || '';
  const upperHullScaleY = 0.765;
  // ---- lower body (inter-track ±0.93 — clear of the 0.945 track channel,
  // §B4; station-segmented) ----
  // Raised inner tub leaves real mechanical negative space behind the open
  // outer slats.  The former 0.45 m belly filled the entire wheel corridor
  // in orthographic side views and made the IFV read as a solid casemate.
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
  // ---- WRAP appliqué strakes: the Warrior's ribbed flanks. Faces at the
  // committed ±1.515 width plane (THE §D anchor), segmented ≤0.46 so every
  // station slice catches end caps; rows never crest the deck line ----
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
  P.add('hullDark', box(0.34, 0.30, 0.018), 0, 0.79, 2.905, -0.688, 0, 0);
  P.add('hullDetail', box(0.30, 0.26, 0.020), 0, 0.79, 2.907, -0.688, 0, 0);
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
  P.add('hullDark', box(0.13, 0.02, 0.98), 1.355, 1.958, 0.98);
  for (let k = 0; k < 4; k++) P.add('hullDetail', box(0.15, 0.024, 0.05), 1.355, 1.968, 0.62 + k * 0.24);
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
  for (const s of [-1, 1]) P.add('hullDetail', cylY(0.07, 0.09, 0.06, 10), s * 1.05, 2.08, -1.02);
  P.add('hullDetail', cylY(0.05, 0.06, 0.10, 8), 1.12, 2.10, -2.55);
  // ---- rear: power door (panel face at -3.17 = the length razor), vision
  // block, hinge stacks, corner bins with lid seams + latches, lower slat
  // rows on the stern rake, tow eyes, light clusters ----
  P.add('hull', box(0.86, 0.96, 0.028), -0.03, 1.32, -2.860);
  // Rear marker/camera shoe at the published hull datum.  It is carried by
  // a short transom bracket; the former high isolated rectangle preserved
  // length in masks but visibly floated above the vehicle in yaw evidence.
  P.add('hullDetail', box(0.05, 0.05, 0.28), 0.12, 1.72, -3.025);
  P.add('hullDark', box(0.20, 0.08, 0.012), 0.12, 1.72, -3.164);
  P.add('hullDark', box(0.05, 0.16, 0.014), -0.50, 1.30, -2.891);
  for (const hy of [1.05, 1.68]) P.add('hullDetail', box(0.07, 0.12, 0.05), 0.60, hy, -2.89);
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
    P.add('hullDetail', box(0.12, 0.10, 0.14), s * 0.55, 0.80, 2.86);
    P.add('hullDark', torus(0.055, 0.016, 10), s * 0.55, 0.78, 2.945, Math.PI / 2, 0, 0);
  }
  // mud flaps at the fender shelf tips
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.36, 0.27, 0.028), s * 1.155, 1.145, 3.148, -0.05, 0, 0);
    P.add('hullRubber', box(0.36, 0.25, 0.028), s * 1.155, 1.10, -2.78, 0.05, 0, 0);
  }
  // ---- KIT fittings (§I census): headlight clusters in guards, rear
  // lights, tow cable, jerry cans, left-flank CES basket, hull whip ----
  for (const s of [-1, 1]) {
    // photo-parity r2 gap #5: lights sit LOW on the bow corners in a
    // chunky wrap-over brush-guard frame (not bare pods on the shelf top)
    P.add('hullDetail', box(0.30, 0.045, 0.16), s * 1.14, 1.36, 3.02);
    const hl = FITTINGS.lightCluster({ mats: P.mats, pods: 2, spacing: 0.15, r: 0.05, rake: -0.55, seed: 3 + s });
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
  // tow cable re-draped (photo-parity r2 gap #6: the colinear r1 route read
  // as a straight pipe — x/y weave gives the rope read)
  const tc = FITTINGS.towCable({
    mats: P.mats, seed: 9,
    pts: [[1.30, 2.075, -0.42], [1.22, 2.062, -0.95], [1.30, 2.068, -1.50], [1.23, 2.060, -2.05]],
  });
  P.hullG.add(tc);
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
  hw.position.set(-1.26, 2.05, -2.83);
  P.hullG.add(hw);
  const stl = FITTINGS.spareTrackLinks({ mats: P.mats, seed: 6, rotation: [0.539, 0, 0] });
  // Authored before the final 0.765 vertical / 1.10 presentation scaling;
  // this pre-transform seat becomes a 41 mm carrier embed on the glacis.
  stl.position.set(-0.52, 2.058, 2.319);
  P.hullG.add(stl);
  // Snapshot authored fitting groups before the native running gear is
  // appended. They receive the same section correction as the bucket-built
  // armor, while the animated wheel/link course keeps its measured diameter
  // and ground contact.
  const upperHullFittings = [...P.hullG.children];
  // ---- running gear: 6 roadwheels, FRONT drive sprocket, raised rear
  // idler — §B6 trapezoid by construction; band inboard so the committed
  // skirt/strake plane clears the dilated shoe surface (§B4) ----
  buildRunningGear(P, {
    style: 'rubber', wheelR: 0.42, wheelW: 0.26, wheelY: 0.44, xc: 1.16,
    // One six-station smart course, spread evenly between full-size end
    // drums.  The previous 0.25/0.28 m terminals were tucked beside the
    // first/last road wheels, so the links read as a flat under-hull belt
    // with neither an approach nor a departure wrap.  These stations retain
    // every road wheel and every protected skirt above them while restoring
    // the Warrior's long, visibly trapezoidal course.
    wheelZs: [1.92, 1.16, 0.40, -0.40, -1.16, -1.92],
    sprocket: { z: 2.48, y: 0.64, r: 0.37 },
    idler: { z: -2.45, y: 0.62, r: 0.35 },
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
  P.add('turret', cylY(0.74, 0.78, 0.16, 20), 0, -0.06, 0);
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
  // collar — §B3.1: cylinders and cast shapes only, no prisms on the run
  P.add('turretDark', box(0.40, 0.34, 0.025), -0.10, 0.30, 0.505, -0.651, 0, 0);
  // uk round 2026-08-07 (owner identity list): the RARDEN's DISTINCTIVE
  // MANTLET CHEEKS — the paired angular castings flanking the mount slot
  // on the real Warrior face, riding ON the raked plane (§B1.1: detail on
  // the plane, never replacing it) + the lintel over the slot.
  P.add('turret', box(0.15, 0.30, 0.075), -0.335, 0.295, 0.515, -0.651, 0, 0); // left cheek casting
  P.add('turret', box(0.15, 0.30, 0.075), 0.135, 0.295, 0.515, -0.651, 0, 0);  // right cheek casting
  P.add('turret', box(0.44, 0.09, 0.065), -0.10, 0.475, 0.425, -0.651, 0, 0);  // mantlet lintel
  P.add('turretDark', box(0.13, 0.02, 0.078), -0.335, 0.30, 0.517, -0.651, 0, 0); // cheek bolt seams
  P.add('turretDark', box(0.13, 0.02, 0.078), 0.135, 0.30, 0.517, -0.651, 0, 0);
  P.add('turret', box(0.44, 0.22, 0.65), -0.10, 0.10, 0.75, -0.18, 0, 0);
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
  // ---- whip antennas on pots at the bustle corners (2 thin columns of the
  // p95 budget, aligned with the print's own mast spikes) ----
  const wa1 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.70, r: 0.011, rake: 0.05, seed: 2 });
  wa1.position.set(-0.60, 0.462, -0.50);
  P.turretG.add(wa1);
  const wa2 = FITTINGS.antennaWhip({ mats: P.mats, h: 0.55, r: 0.011, rake: -0.04, seed: 3 });
  wa2.position.set(0.56, 0.462, -0.54);
  P.turretG.add(wa2);
  const waRear = FITTINGS.antennaWhip({ mats: P.mats, h: 0.65, r: 0.009, rake: 0.02, seed: 12 });
  waRear.position.set(-0.60, 0.462, -1.737);
  P.turretG.add(waRear);
  const waShoulder = FITTINGS.antennaWhip({ mats: P.mats, h: 0.65, r: 0.009, rake: -0.02, seed: 13 });
  waShoulder.position.set(0.56, 0.462, -1.166);
  P.turretG.add(waShoulder);
  // ---- pintle GPMG at the commander's station (§B3 decoration minimum;
  // sky-backed -> two-tone per MG PHYSICS) ----
  const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0.10, scale: 0.85, seed: 3 });
  mg.position.set(0.50, 0.50, -0.44);
  mg.rotation.y = Math.PI * 0.82;
  P.turretG.add(mg);
  liftEye(P, 'turretDetail', -0.72, 0.44, 0.30, 0.5);
  liftEye(P, 'turretDetail', 0.72, 0.44, 0.30, -0.5);
  P.decal('turret', 'number', num, 0.22, [0.82, 0.24, -0.10], Math.PI / 2);
  P.decal('turret', 'number', num, 0.22, [-0.82, 0.24, -0.10], -Math.PI / 2);

  // ================= 30mm L21A1 RARDEN (§B3.1: the gun run is cylinders
  // only — cast root sleeve, stepped bare tube, PERFORATED flash hider with
  // dark ring vents, slotted tip; NO evacuator, NO thermal sleeve; the
  // muzzle never clears the +3.17 nose, so overhang masks stay empty) =====
  P.addGunExtra(cylZ(0.075, 0.30, 12, 0.092), 0, 0, 0.26);
  buildGun(P, { len: 1.84, r: 0.030, sleeve: false, evac: null, collar: false, baseR: 0.058 });
  muzzleBore(P, { len: 1.84, r: 0.030 });                     // §B3.1 (shadow-named, 3fca39b)
  // RARDEN 30 mm: autocannon-scale disc (law: smaller disc)
  // These pieces are tube furniture and therefore belong to the recoil
  // bucket. The former gunMount ownership left a stationary solid cap in
  // front of the fleet bore furniture and blocked the visible gun hole.
  P.add('gun', cylZ(0.041, 0.60, 10, 0.046), 0, 0, 0.82);
  P.add('gun', cylZ(0.0335, 0.55, 10), 0, 0, 1.42);
  // perforated flash hider (photo-parity r2 gap #4: the vent read — four
  // deep dark rings + slotted cap; muzzle tip 3.152 < the +3.17 nose)
  P.add('gun', cylZ(0.048, 0.30, 12), 0, 0, 1.68);
  for (const zr of [1.575, 1.655, 1.735, 1.815]) P.add('gunDark', cylZ(0.0495, 0.018, 12), 0, 0, zr);
  P.add('gunDark', cylZ(0.037, 0.05, 10), 0, 0, 1.84);
  P.add('gunDark', cylZ(0.028, 0.012, 10), 0, 0, 1.866);
  // coax 7.62 chain gun port left of the main gun (dark ring + stub)
  P.add('turretDark', cylZ(0.032, 0.02, 10), -0.42, 0.30, 0.52);
  P.add('turretDark', cylZ(0.014, 0.16, 8), -0.42, 0.30, 0.58);
  // Match the measured 1.68 m Warrior roof without individually nudging a
  // hundred authored plates. This affine correction touches our primitives
  // only; no source vertices enter the runtime builder.
  P.scaleBuckets(
    ['hull', 'hullDetail', 'hullDark', 'hullRubber', 'hullCloth'],
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
  P.turretG.position.y = 1.74;
  P.turretG.scale.y = 0.84;
  P.topY = 0.79;
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
    for (let k = 0; k < 6; k++) {
      const z = 1.95 - k * 0.77;
      P.add('hull', box(0.036, 0.32, 0.61), s * 1.515, 1.47, z);
      P.add('hullDark', box(0.010, 0.026, 0.47), s * 1.536, 1.62, z);
      P.add('hullDetail', box(0.045, 0.050, 0.16), s * 1.535, 1.32, z);
    }
  }

  // ---- glacis service equipment: a protected central IR lamp, paired large
  // white-light pods and their brush guards, plus tools/cable runs.  These are
  // semantic equipment rather than armor and therefore use addEquipment.
  P.addEquipment('hull', box(0.30, 0.18, 0.25), 0.48, 1.55, 2.18, -0.35, 0, 0);
  P.addEquipment('hullDark', cylZ(0.090, 0.12, 16), 0.48, 1.58, 2.31, -0.18, 0, 0);
  P.addEquipment('hullGlass', cylZ(0.068, 0.014, 16), 0.48, 1.59, 2.377, -0.18, 0, 0);
  for (const s of [-1, 1]) {
    const lamp = FITTINGS.lightCluster({
      mats: P.mats, pods: 1, spacing: 0.16, r: 0.090, rake: -0.44,
      seed: 31 + s,
    });
    lamp.position.set(s * 1.08, 1.49, 2.72);
    lamp.scale.setScalar(1.08);
    P.hullG.add(lamp);
    P.addEquipment('hullDark', box(0.025, 0.24, 0.23), s * 1.20, 1.49, 2.72);
    P.addEquipment('hullDark', box(0.025, 0.24, 0.23), s * 0.96, 1.49, 2.72);
    P.addEquipment('hullDark', box(0.27, 0.025, 0.23), s * 1.08, 1.61, 2.72);
  }
  P.addEquipment('hullDetail', box(0.055, 0.055, 1.15), -0.44, 1.58, 2.05, 0, 0.08, 0);
  P.addEquipment('hullDetail', box(0.055, 0.055, 0.88), 0.13, 1.60, 2.04, 0, -0.12, 0);
  for (const x of [-0.72, -0.45, -0.18]) {
    P.addEquipment('hullDark', box(0.20, 0.035, 0.28), x, 1.59, 1.52, 0, -0.10, 0);
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
  P.addEquipment('turret', box(0.36, 0.16, 0.48), 0.56, 0.63, -0.08, 0, -0.06, 0);
  P.addEquipment('turretDark', cylX(0.075, 0.40, 12), 0.56, 0.70, -0.03);
  P.addEquipment('turret', box(0.12, 0.30, 0.14), 0.56, 0.79, -0.03, 0.10, 0, 0);
  P.addEquipment('turretDark', cylZ(0.112, 1.12, 18, 0.124), 0.56, 0.92, 0.36, -0.04, 0, 0);
  P.addEquipment('turretDetail', cylZ(0.126, 0.17, 18), 0.56, 0.92, -0.13, -0.04, 0, 0);
  P.addEquipment('turretDark', cylZ(0.086, 0.025, 18), 0.56, 0.92, 0.927, -0.04, 0, 0);
  P.addEquipment('turretGlass', box(0.14, 0.10, 0.018), 0.37, 0.89, 0.01, -0.02, 0, 0);
  // Two spare missile tubes remain tied to the bustle by broad saddles.
  for (const [x, y] of [[-0.33, 0.55], [0.02, 0.59]]) {
    P.addEquipment('turret', box(0.20, 0.08, 0.68), x, y - 0.08, -1.20);
    P.addEquipment('turretDark', cylZ(0.074, 0.72, 14, 0.082), x, y, -1.20);
    P.addEquipment('turretDetail', cylZ(0.083, 0.035, 14), x, y, -0.83);
  }

  // ---- populated roof: armored rectangular hatch, panoramic head, paired
  // periscope hoods, a shielded second GPMG and compact stowage/radio boxes.
  P.addEquipment('turret', box(0.46, 0.045, 0.42), -0.29, 0.61, -0.49, 0, 0.08, 0);
  P.addEquipment('turretDark', box(0.38, 0.018, 0.035), -0.29, 0.642, -0.30, 0, 0.08, 0);
  P.addEquipment('turret', cylY(0.14, 0.16, 0.16, 14), -0.55, 0.68, -0.10);
  P.addEquipment('turret', box(0.26, 0.18, 0.24), -0.55, 0.83, -0.10);
  P.addEquipment('turretGlass', box(0.17, 0.07, 0.016), -0.55, 0.85, 0.026);
  for (const x of [-0.20, 0.08]) {
    P.addEquipment('turret', box(0.19, 0.07, 0.15), x, 0.63, 0.06, -0.12, 0, 0);
    P.addEquipment('turretGlass', box(0.13, 0.035, 0.014), x, 0.65, 0.142, -0.12, 0, 0);
  }
  P.addEquipment('turret', box(0.30, 0.20, 0.28), 0.54, 0.62, -0.80);
  P.addEquipment('turretDetail', box(0.27, 0.030, 0.30), 0.54, 0.735, -0.80);
  const roofMg = FITTINGS.pintleMG({
    mats: P.mats, cls: 'mag', tone: 'two-tone', elev: 0.16, scale: 0.82, seed: 29,
  });
  roofMg.position.set(-0.34, 0.67, -0.58);
  roofMg.rotation.y = 0.16;
  P.turretG.add(roofMg);
  for (const s of [-1, 1]) {
    P.addEquipment('turret', box(0.035, 0.24, 0.30), -0.34 + s * 0.22, 0.76, -0.50,
      0, s * 0.08, 0);
  }

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

function vickersMk1Build(P: UKBuilderPort): void {
  const { rng } = P;
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
    P.add('hullRubber', box(0.40, 0.34, 0.03), s * 1.30, 1.05, -3.415, 0.06, 0, 0);
    P.add('hullRubber', box(0.10, 0.60, 0.035), s * 1.525, 0.94, 3.31);
  }
  // Fender tip wedges sloping down over the raised idler (ref side falls
  // 1.35 → 1.09 over b 3.30..3.56 at |x| up to 1.55 — thin curved mudguard
  // tips like the print's own 4-14 cm wedge). Bottom line tracks the idler
  // wrap arc (crown 1.19 at z 3.145) with ≥3 cm clearance — containment.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 1.06, 1.24, 3.28], [s * 1.55, 1.24, 3.28], [s * 1.53, 1.06, 3.53], [s * 1.10, 1.06, 3.53],
      [s * 1.06, 1.355, 3.28], [s * 1.55, 1.355, 3.28], [s * 1.53, 1.09, 3.555], [s * 1.10, 1.09, 3.555]));
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
  buildRunningGear(P, {
    style: 'dished', wheelR: 0.40, wheelW: 0.24, wheelY: 0.45, xc: 1.185,
    wheelZs: [2.02, 1.238, 0.456, -0.326, -1.108, -1.89],
    sprocket: { z: -2.98, y: 0.92, r: 0.26 }, idler: { z: 3.145, y: 0.80, r: 0.255 },
    rollers: [{ z: 1.15, y: 0.79, r: 0.09 }, { z: -0.15, y: 0.79, r: 0.09 }, { z: -1.45, y: 0.79, r: 0.09 }],
    trackW: 0.49, trackTh: 0.09, topY: 0.95, paintedEnds: true, arms: true,
  });
  // decals sit 3 mm proud of the sloped band side face, INBOARD of the
  // ±1.5845 width edge (an edge decal minted phantom front-view columns)
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [1.562, 1.28, -0.7], Math.PI / 2);
  P.decal('hull', 'number', P.spec.visual.number || '', 0.30, [-1.562, 1.28, -0.7], -Math.PI / 2);

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
  P.add('turretDark', cylY(0.055, 0.07, 0.12, 10), -1.12, 0.60, 0.80); // bucket on the bin front
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

// ---------------------------------------------------------------------------
// Chieftain family upper assembly — owner rebuild (2026-08-15).
//
// The recovered Mk.5 OBJ is used only as a measurement/visual oracle.  Its
// source geometry and textures never enter the runtime.  The older authored
// turrets below were painstaking silhouette studies, but successive local
// corrections let their independent bins and ledges overtake the turret in
// normal garage lighting.  These wrappers deliberately retain the complete
// first-party hull/running gear, clear only the upper-assembly buckets, and
// rebuild one low armored core shared by Mk.5 and Mk.10.  Deliberately planar
// crown/cheek caps then sit over that core as real plate volumes: the Mk.5 has
// the thinner production shell, while Mk.10 receives the deeper Stillbrew fit.
const CHIEFTAIN_UPPER_BUCKETS = [
  'turret', 'turretExternalArmor', 'turretEquipment', 'turretDetail', 'turretDark', 'turretGlass', 'turretCloth', 'turretTrack',
  'gun', 'gunDark', 'gunMount', 'gunMountDark',
];

const CHIEFTAIN_TURRET_BUCKETS = CHIEFTAIN_UPPER_BUCKETS.filter((bucket) =>
  !bucket.startsWith('gun'));
// The r9 fidelity pass deliberately compressed the turret to 68% of its
// authored height.  Raise the current r10 envelope by one further exact ten
// percent, still pivoting about the buried ring seat so the turret does not
// float or detach from the hull.
const CHIEFTAIN_TURRET_HEIGHT_SCALE = 0.68 * 1.10 * 1.10;
const CHIEFTAIN_TURRET_SEAT_Y = -0.18;

function compressedChieftainTurretY(y: number): number {
  return CHIEFTAIN_TURRET_SEAT_Y
    + (y - CHIEFTAIN_TURRET_SEAT_Y) * CHIEFTAIN_TURRET_HEIGHT_SCALE;
}

function compressChieftainTurretHeight(P: UKBuilderPort): void {
  // Compress around the buried ring seat, not local zero. That keeps the
  // turret planted on the hull while retaining the source's low, full crown.
  P.scaleBuckets(CHIEFTAIN_TURRET_BUCKETS, 1, CHIEFTAIN_TURRET_HEIGHT_SCALE, 1);
  P.offsetBuckets(CHIEFTAIN_TURRET_BUCKETS, 0,
    CHIEFTAIN_TURRET_SEAT_Y * (1 - CHIEFTAIN_TURRET_HEIGHT_SCALE), 0);

  // Gun pitch remains rigid and dimensionally unchanged; only its trunnion
  // follows the lowered mask. Direct child fittings (the pintle GPMG) are
  // likewise reseated without being squashed with the cast armour.
  P.gunG.position.y = compressedChieftainTurretY(P.gunG.position.y);
  for (const child of P.turretG.children) {
    if (child !== P.gunG) child.position.y = compressedChieftainTurretY(child.position.y);
  }
  P.topY = compressedChieftainTurretY(P.topY!);
}

function clearChieftainUpper(P: UKBuilderPort): void {
  P.clear(CHIEFTAIN_UPPER_BUCKETS);
  P.clearDecals('turret');
  for (const child of [...P.turretG.children]) {
    if (child === P.gunG) continue;
    P.turretG.remove(child);
    child.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  }
  for (const child of [...P.gunG.children]) {
    if (child === P.recoilG) continue;
    P.gunG.remove(child);
    child.traverse((object: THREE.Object3D) => {
      if (object instanceof THREE.Mesh) object.geometry.dispose();
    });
  }
}

function buildChieftainUpper2026(
  P: UKBuilderPort,
  { stillbrew = false }: { readonly stillbrew?: boolean } = {},
): void {
  clearChieftainUpper(P);
  const seg = P.q ? 24 : 16;

  const mirroredPlan = (source: readonly (readonly [number, number])[], side: number) => {
    const result = source.map(([x, z]) => [side * x, z] as const);
    if (side < 0) result.reverse();
    return result;
  };
  const mirroredHeights = (source: readonly number[], side: number) =>
    side < 0 ? [...source].reverse() : source;

  // Source measurements (canonical X-right / Y-up / Z-forward) show a low
  // turret body below a visibly separate plate package.  The core therefore
  // stops at a broad, clipped roof instead of continuing into a tall cast dome.
  // Discrete armor-cap solids below overlap that core with a dark retaining
  // seam, so the result reads as bolted armor placed over structure rather than
  // a second organic skin occupying the same surface.
  P.turretG.position.set(0, 1.72, stillbrew ? 0.08 : 0.02);
  P.gunG.position.set(-0.02, 0.15, 0.66);
  // Ten deliberately uneven stations create long cheek/side flats and clipped
  // transitions instead of a mathematically perfect oval.  Four vertical
  // rings are enough for the structural core; the removed fifth ring was the
  // main source of the tall, egg-shaped crown in normal garage views.
  const turretLobePlan: readonly (readonly [number, number])[] = [
    [0.18, 1.34], [0.48, 1.53], [0.92, 1.42], [1.25, 1.04],
    [1.42, 0.47], [1.40, -0.22], [1.22, -0.82], [0.83, -1.25],
    [0.40, -1.38], [0.23, -0.48],
  ];
  const turretFloor = [-0.17, -0.17, -0.15, -0.13, -0.10,
    -0.07, -0.04, -0.02, -0.04, -0.11];
  const turretBelt = [0.12, 0.16, 0.23, 0.31, 0.37,
    0.38, 0.34, 0.27, 0.20, 0.14];
  const turretShoulder = [0.42, 0.48, 0.55, 0.60, 0.61,
    0.58, 0.53, 0.49, 0.46, 0.42];
  const turretRoof = [0.54, 0.62, 0.68, 0.70, 0.68,
    0.63, 0.58, 0.54, 0.53, 0.54];
  for (const s of [-1, 1]) {
    P.add('turret', polyMultiLoft(mirroredPlan(turretLobePlan, s), [
      { height: mirroredHeights(turretFloor, s), inset: 1, offsetZ: 0 },
      { height: mirroredHeights(turretBelt, s), inset: 0.99, offsetZ: -0.08 },
      { height: mirroredHeights(turretShoulder, s), inset: 0.94, offsetZ: -0.25 },
      { height: mirroredHeights(turretRoof, s), inset: 0.78, offsetZ: -0.48 },
    ]));
  }
  P.add('turret', cylY(0.96, 0.96, 0.15, seg), 0, -0.12, -0.04); // buried ring seat

  // A broad aft saddle closes the lobes behind the
  // trunnions.  It is intentionally hidden under the roof fittings and never
  // bridges the forward gun aperture.
  P.add('turret', slab(
    [-0.40, 0.39, 0.62], [0.40, 0.39, 0.62], [0.82, 0.40, -1.38], [-0.82, 0.40, -1.38],
    [-0.34, 0.73, 0.59], [0.34, 0.73, 0.59], [0.68, 0.75, -1.34], [-0.68, 0.75, -1.34]));

  // The L11 sits in a recessed armored throat.  The cut-out is backed by a
  // dark pocket and two armored returns, so no camera can see through the turret.
  P.add('turretDark', box(0.76, 0.46, 0.16), 0, 0.28, 1.42);
  for (const s of [-1, 1]) {
    P.add('turret', slab(
      [s * 0.14, 0.01, 1.56], [s * 0.58, 0.04, 1.49], [s * 0.66, 0.11, 1.12], [s * 0.34, 0.09, 1.17],
      [s * 0.13, 0.46, 1.06], [s * 0.51, 0.57, 0.96], [s * 0.57, 0.61, 0.62], [s * 0.29, 0.52, 0.69]));
  }
  P.addGunExtra(cylZ(0.24, 0.22, seg, 0.27), 0, 0, 0.18);
  P.addGunExtraDark(cylZ(0.205, 0.10, seg), 0, 0, 0.33);
  P.addGunExtra(cylZ(0.175, 0.46, seg, 0.215), 0, 0, 0.57);
  P.addGunExtra(cylZ(0.145, 0.48, seg, 0.17), 0, 0, 0.98);
  for (const z of [0.39, 0.47, 0.55]) {
    P.addGunExtraDark(torus(0.205 - (z - 0.39) * 0.22, 0.022, seg), 0, 0, z);
  }

  // A real plate package now sits over the low core on both variants.  Each
  // side is split into front cheek, shoulder, and rear crown solids so the
  // silhouette contains deliberate breaks instead of one inflated surface.
  // The dark copy beneath every plate creates a restrained retaining seam;
  // it also makes the stand-off legible under camouflage without leaving a
  // literal hole between plate and core.
  type ArmorPanel = readonly [
    readonly [number, number, number], readonly [number, number, number],
    readonly [number, number, number], readonly [number, number, number],
    readonly [number, number, number], readonly [number, number, number],
    readonly [number, number, number], readonly [number, number, number],
  ];
  const shellOutboard = stillbrew ? 0.13 : 0.07;
  const shellForward = stillbrew ? 0.15 : 0.09;
  const shellLift = stillbrew ? 0.055 : 0.025;
  const mirrorPanel = (panel: ArmorPanel, side: number, yOffset = 0): ArmorPanel => {
    const mirrored = panel.map(([x, y, z]) => [side * x, y + shellLift + yOffset, z] as const);
    if (side > 0) return mirrored as unknown as ArmorPanel;
    return [mirrored[0], mirrored[3], mirrored[2], mirrored[1],
      mirrored[4], mirrored[7], mirrored[6], mirrored[5]] as ArmorPanel;
  };
  const addArmorPanel = (panel: ArmorPanel, side = 1, yOffset = 0): void => {
    const points = mirrorPanel(panel, side, yOffset);
    const backing = points.map(([x, y, z]) => [x, y - 0.038, z] as const) as unknown as ArmorPanel;
    P.add('turretDark', slab(...backing));
    P.add('turretExternalArmor', slab(...points));
  };
  const frontCheekPanel: ArmorPanel = [
    [0.16, 0.34, 1.46], [0.50, 0.38, 1.55 + shellForward],
    [1.34 + shellOutboard, 0.40, 0.62], [0.49, 0.35, 0.56],
    [0.18, 0.63, 1.10], [0.44, 0.75, 1.28 + shellForward],
    [1.16 + shellOutboard, 0.70, 0.42], [0.39, 0.61, 0.36],
  ];
  const shoulderPanel: ArmorPanel = [
    [0.48, 0.34, 0.62], [1.34 + shellOutboard, 0.40, 0.65],
    [1.39 + shellOutboard, 0.35, -0.42], [0.55, 0.32, -0.64],
    [0.39, 0.61, 0.38], [1.16 + shellOutboard, 0.70, 0.43],
    [1.22 + shellOutboard, 0.63, -0.48], [0.44, 0.55, -0.70],
  ];
  const rearCrownPanel: ArmorPanel = [
    [0.53, 0.31, -0.58], [1.38 + shellOutboard, 0.35, -0.36],
    [1.18 + shellOutboard, 0.29, -1.18], [0.40, 0.28, -1.24],
    [0.45, 0.54, -0.68], [1.19 + shellOutboard, 0.62, -0.52],
    [0.93 + shellOutboard, 0.53, -1.21], [0.33, 0.50, -1.25],
  ];
  // The two forward shells were centered on the roof package instead of the
  // gun mask.  Their selected face spans source Y 0.38..0.75, while the
  // mantlet spans 0.074..0.486; removing the variant lift and dropping the
  // shared 0.285 m center offset puts both faces on one vertical datum.  Keep
  // the remaining shell panels high so the armor still reads as a layered cap.
  const frontShellDrop = shellLift + 0.285;
  for (const s of [-1, 1]) {
    addArmorPanel(frontCheekPanel, s, -frontShellDrop);
    addArmorPanel(shoulderPanel, s);
    addArmorPanel(rearCrownPanel, s);
    // Three exposed joints prevent the panels from visually dissolving back
    // into one camouflaged surface: a long lower retaining rail plus the two
    // cross-plate breaks visible from the normal three-quarter camera.
    P.add('turretDark', box(0.045, 0.050, 1.10),
      s * (1.405 + shellOutboard), 0.445 + shellLift, 0.04);
    P.add('turretDark', box(0.76, 0.040, 0.050),
      s * 0.80, 0.685 + shellLift, 0.43);
    P.add('turretDark', box(0.78, 0.040, 0.050),
      s * 0.82, 0.605 + shellLift, -0.59);
  }
  const centerBrow: ArmorPanel = [
    [-0.32, 0.40, 0.72], [0.32, 0.40, 0.72],
    [0.45, 0.37, -0.48], [-0.45, 0.37, -0.48],
    [-0.25, 0.69, 0.45], [0.25, 0.69, 0.45],
    [0.36, 0.65, -0.62], [-0.36, 0.65, -0.62],
  ];
  addArmorPanel(centerBrow);
  // Sparse exposed fasteners underline that this is a fitted armor shell, not
  // another cast lobe.  The Mk.10 heads sit on its deeper Stillbrew side lip.
  for (const s of [-1, 1]) {
    for (const [y, z] of [[0.54, 0.44], [0.50, -0.06], [0.45, -0.55]] as const) {
      P.add('turretDetail', cylX(0.025, 0.036, 8),
        s * (1.42 + shellOutboard), y + shellLift, z);
    }
  }

  // The turret turns inward beside the L11 rather than ending as two free
  // cheeks.  These returns create the source U-shaped gun aperture in the same
  // structural bucket as the primary body.  The fitted armor plates above it
  // remain independent, so neither variant relies on the shell to close holes.
  const frontArmorBucket = 'turret';
  for (const s of [-1, 1]) {
    P.add(frontArmorBucket, slab(
      [s * 0.14, 0.17, 1.48], [s * 0.43, 0.20, 1.42],
      [s * 0.40, 0.50, 0.91], [s * 0.23, 0.48, 0.94],
      [s * 0.13, 0.35, 1.18], [s * 0.40, 0.43, 1.08],
      [s * 0.35, 0.75, 0.58], [s * 0.20, 0.68, 0.64]));
  }

  // One crown bridge joins both halves above/behind the gun.  It belongs to
  // the same envelope, leaving the barrel tunnel open without adding a second
  // visible roof skin.
  P.add(frontArmorBucket, slab(
    [-0.24, 0.58, 0.95], [0.24, 0.58, 0.95], [0.34, 0.57, 0.56], [-0.34, 0.57, 0.56],
    [-0.20, 0.82, 0.70], [0.20, 0.82, 0.70], [0.29, 0.87, 0.35], [-0.29, 0.87, 0.35]));

  // The center cleft is shallow, fully backed, and ends before the roof
  // saddle; its visible walls prove the shells wrap around the gun.
  P.add('turretDark', slab(
    [-0.15, 0.31, 1.58], [0.15, 0.31, 1.58], [0.28, 0.46, 0.74], [-0.28, 0.46, 0.74],
    [-0.11, 0.56, 1.02], [0.11, 0.56, 1.02], [0.21, 0.64, 0.43], [-0.21, 0.64, 0.43]));

  P.turretG.userData.chieftainArmorShellReceipt = Object.freeze({
    revision: 'low-angular-layered-shell-r11',
    sourceAxes: 'x,z,-y',
    primaryEnvelopeCount: 2,
    primaryConstruction: 'low-faceted-core',
    primaryPlanStations: turretLobePlan.length,
    primarySurfaceFinish: 'hard-faceted',
    primaryHalfWidthM: 1.42,
    upperShellPanelCount: 7,
    upperShellType: stillbrew ? 'thick-stillbrew-plate-shell' : 'segmented-production-plate-shell',
    upperShellHalfWidthM: 1.39 + shellOutboard,
    upperShellForwardZ: 1.55 + shellForward,
    upperShellRearZ: -1.25,
    upperShellStandOffM: shellOutboard,
    upperShellRetainingSeamM: 0.038,
    frontShellDropM: frontShellDrop,
    frontShellDatumSourceY: 0.28,
    mantletDatumSourceY: 0.28,
    turretHeightScale: CHIEFTAIN_TURRET_HEIGHT_SCALE,
    turretHeightGain: 1.21,
    turretHeightStepGain: 1.10,
    frontSetbackM: 0.73,
    gunAxisLocalY: 0.15,
  });

  // Two long storage boxes per side now belong to the turret rather than the
  // hull fenders.  Their inboard faces bury into the cheek/waist, their outer
  // doors lean with the flank, and broad shoes carry each end into armor.
  // This preserves the marked box cadence while making every box yaw with and
  // visibly load into the turret.
  for (const s of [-1, 1]) {
    const serviceBoxes = [
      { z: 0.40, depth: 1.62 },
      { z: -0.82, depth: 0.82 },
    ];
    for (const serviceBox of serviceBoxes) {
      const front = serviceBox.z + serviceBox.depth * 0.5;
      const rear = serviceBox.z - serviceBox.depth * 0.5;
      P.addEquipment('turret', slab(
        [s * 1.12, 0.12, front], [s * 1.51, 0.16, front - 0.04],
        [s * 1.51, 0.15, rear + 0.04], [s * 1.14, 0.11, rear],
        [s * 1.10, 0.46, front - 0.04], [s * 1.47, 0.54, front - 0.08],
        [s * 1.47, 0.51, rear + 0.08], [s * 1.12, 0.43, rear + 0.04]));
      P.add('turretDark', box(0.024, 0.30, serviceBox.depth - 0.12),
        s * 1.505, 0.34, serviceBox.z, 0, s * 0.025, s * 0.075);
      P.addEquipment('turret', box(0.026, 0.26, serviceBox.depth - 0.18),
        s * 1.521, 0.34, serviceBox.z, 0, s * 0.025, s * 0.075);
      for (const z of [front - 0.09, rear + 0.09]) {
        P.addEquipment('turret', box(0.36, 0.075, 0.11),
          s * 1.31, 0.18, z, 0, 0, s * 0.06);
      }
    }
    // A paired horizontal bottle and its two shoes occupy the exposed lower
    // edge seen beneath the aft service box in both supplied meshes.
    P.add('turretDark', cylZ(0.066, 0.70, 12), s * 1.48, 0.075, -0.82);
    for (const dz of [-0.22, 0.22]) {
      P.add('turretDetail', box(0.068, 0.12, 0.05), s * 1.48, 0.10, -0.82 + dz);
    }

    // Open flank basket: two continuous rails, a shallow tray, four uprights
    // and inner tie-bars join the cabinet to the rear bustle without floating
    // ends.  This is deliberately structural rather than a second solid box.
    const basketZ = -1.56;
    const basketDepth = 0.92;
    P.add('turretDetail', box(0.035, 0.035, basketDepth), s * 1.48, 0.52, basketZ);
    P.add('turretDetail', box(0.035, 0.035, basketDepth), s * 1.48, 0.15, basketZ);
    P.add('turret', box(0.54, 0.028, basketDepth - 0.08), s * 1.22, 0.135, basketZ);
    for (const dz of [-0.42, -0.14, 0.14, 0.42]) {
      P.add('turretDetail', box(0.035, 0.37, 0.035), s * 1.48, 0.335, basketZ + dz);
    }
    P.add('turretDetail', box(0.58, 0.035, 0.035), s * 1.20, 0.52, basketZ + 0.42);
    P.add('turretDetail', box(0.82, 0.035, 0.035), s * 1.08, 0.52, basketZ - 0.42);
    P.add('turretDetail', box(0.82, 0.035, 0.035), s * 1.08, 0.15, basketZ - 0.42);
  }
  // NBC/bustle pack and a true open rear basket with diagonal/vertical
  // returns.  Every rail lands on the pack or tray; no line ends in air.
  P.add('turret', box(1.42, 0.42, 0.62), 0.02, 0.28, -1.72);
  P.add('turretDetail', box(1.24, 0.035, 0.08), 0.02, 0.505, -1.47);
  P.add('turretDetail', box(1.24, 0.035, 0.08), 0.02, 0.505, -1.95);
  P.add('turret', box(1.16, 0.035, 0.40), 0.02, 0.47, -1.72);
  P.add('turret', box(1.46, 0.10, 0.42), 0, 0.14, -2.16);
  for (const y of [0.12, 0.52]) P.add('turretDetail', box(1.52, 0.035, 0.035), 0, y, -2.37);
  for (let k = 0; k < 6; k++) {
    const x = -0.70 + k * 0.28;
    P.add('turretDetail', box(0.03, 0.40, 0.03), x, 0.32, -2.37);
  }
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.035, 0.46, 0.035), s * 0.75, 0.31, -2.20, s * 0.45, 0, 0);
    P.add('turretDetail', box(0.035, 0.035, 0.42), s * 0.70, 0.52, -2.16);
    P.add('turretDetail', box(0.035, 0.035, 0.42), s * 0.70, 0.12, -2.16);
  }
  tarpRoll(P, 'turretCloth', -0.36, 0.34, -2.16, 0.54, 0.105, true);
  tarpRoll(P, 'turretCloth', 0.29, 0.34, -2.16, 0.48, 0.095, true);
  KIT.ammoCan(P, 'turretDark', 0.96, 0.49, -1.66, 0.18);

  // Mk.5's large IR/searchlight and Mk.10's armored thermal head occupy the
  // same broad cheek station, making the upgrade lineage obvious.  Both use
  // a buried shoe and recessed aperture rather than a floating box.
  if (stillbrew) {
    P.add('turret', box(0.38, 0.16, 0.42), 0.70, 0.57, 0.34);
    P.add('turret', box(0.44, 0.30, 0.48), 0.70, 0.75, 0.34);
    P.add('turretDark', box(0.32, 0.18, 0.04), 0.70, 0.75, 0.59);
    P.add('turretGlass', box(0.22, 0.11, 0.018), 0.70, 0.75, 0.615);
    P.add('turretDetail', box(0.46, 0.03, 0.38), 0.70, 0.915, 0.31);
  } else {
    P.add('turret', box(0.44, 0.18, 0.46), -0.70, 0.50, 1.02);
    P.add('turret', box(0.48, 0.42, 0.42), -0.70, 0.75, 1.04);
    P.add('turretDark', cylZ(0.19, 0.08, seg), -0.70, 0.76, 1.275);
    P.add('turretGlass', cylZ(0.15, 0.022, seg), -0.70, 0.76, 1.326);
    P.add('turretDetail', torus(0.16, 0.018, seg), -0.70, 0.76, 1.34);
    P.add('turretDetail', box(0.50, 0.035, 0.44), -0.70, 0.98, 1.03);
  }

  // Low asymmetric roof station: No.15 cupola, loader hatch, compact sight
  // heads, periscope ring, and a properly seated L37 GPMG.  These fittings
  // sit on different facets of the sloped crown, so each family gets its own
  // contact datum.  A tapered adapter under the outboard cupola closes the
  // step between the low shoulder plate and the higher center saddle: the
  // cupola can neither hover over the shoulder nor disappear into the saddle.
  const cupolaSeatY = stillbrew ? 0.73 : 0.71;
  const cupolaDrop = 0.84 - cupolaSeatY;
  const cupolaY = (y: number): number => y - cupolaDrop;
  const cupolaAdapterBottomY = stillbrew ? 0.63 : 0.60;
  P.add('turret', cylY(0.285, 0.31, cupolaSeatY - cupolaAdapterBottomY, seg),
    -0.55, (cupolaSeatY + cupolaAdapterBottomY) * 0.5, -0.20);
  P.add('turret', cylY(0.30, 0.32, 0.14, seg), -0.55, cupolaY(0.91), -0.20);
  P.add('turret', cylY(0.22, 0.23, 0.15, seg), -0.55, cupolaY(1.055), -0.20);
  P.add('turret', sph(0.19, P.q ? 16 : 10), -0.55, cupolaY(1.16), -0.18, 0, 0, 0, [1, 0.62, 1]);
  for (let k = 0; k < 7; k++) {
    const a = -1.25 + k * 0.42;
    P.add('turretDark', box(0.055, 0.045, 0.045), -0.55 + Math.sin(a) * 0.25,
      cupolaY(1.115), -0.20 + Math.cos(a) * 0.20, 0, a, 0);
  }
  const saddleSeatY = 0.74;
  const loaderDrop = (0.89 - 0.055 * 0.5) - saddleSeatY;
  const loaderY = (y: number): number => y - loaderDrop;
  P.add('turretDetail', cylY(0.25, 0.27, 0.055, seg), 0.43, loaderY(0.89), -0.43);
  P.add('turret', box(0.40, 0.055, 0.46), 0.43, loaderY(0.93), -0.43, 0, -0.12, 0);
  P.add('turretDark', box(0.28, 0.045, 0.035), 0.43, loaderY(0.96), -0.20);
  const sightDrop = (0.94 - 0.18 * 0.5) - saddleSeatY;
  const sightY = (y: number): number => y - sightDrop;
  P.add('turret', box(0.24, 0.18, 0.25), -0.18, sightY(0.94), -0.54);
  P.add('turretDark', box(0.16, 0.09, 0.025), -0.18, sightY(0.96), -0.395);
  const periscopeCenterY = saddleSeatY + 0.07 * 0.5;
  periscope(P, 'turretDetail', 0.20, periscopeCenterY, -0.03, 0.08);
  periscope(P, 'turretDetail', 0.43, periscopeCenterY, -0.05, -0.10);
  {
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'mag', tone: 'two-tone',
      elev: 0.08, scale: 0.84, seed: stillbrew ? 17 : 15, ammo: true });
    mg.position.set(-0.49, cupolaY(1.12), -0.20);
    mg.rotation.y = 0;
    P.turretG.add(mg);
  }

  // Six-tube canted smoke banks sit low on broad cheek pads.  The tubes and
  // pads rotate with the shell and remain clear of the searchlight/gun.
  for (const s of [-1, 1]) {
    const x = stillbrew ? 1.27 : 1.33;
    const y = stillbrew ? 0.56 : 0.57;
    const z = stillbrew ? 0.61 : 0.78;
    P.add('turret', box(0.36, 0.09, 0.30), s * (x - 0.13), y - 0.12, z, 0, s * 0.42, 0);
    P.add('turretDetail', box(0.30, 0.055, 0.08), s * x, y - 0.02, z, 0, s * 0.55, 0);
    smokeCluster(P, s * (x + 0.09), y + 0.08, z + 0.04, 6, s * 1.05, 0.72);
  }

  // Three unequal radio stations reproduce the reference cadence.  Each
  // whip has a visible shoe, collar and short brace embedded in the bustle.
  const radioShoeY = 0.54;
  const radios = [[-0.92, -1.62, 0.76], [0.82, -1.73, 0.66], [0.18, -1.92, 0.54]];
  for (const [x, z, h] of radios) {
    P.add('turret', box(0.13, 0.10, 0.15), x, radioShoeY, z);
    P.add('turretDetail', cylY(0.055, 0.065, 0.12, 12), x, radioShoeY + 0.10, z);
    P.add('turretDark', cylY(0.018, 0.012, h, 10), x, radioShoeY + 0.22 + h * 0.5, z);
    P.add('turretDetail', box(0.035, 0.20, 0.035), x + 0.07,
      radioShoeY + 0.16, z + 0.05, 0.35, 0, -0.25);
  }

  // L11A5 thermal-sleeved cannon, fume extractor and recessed muzzle bore.
  buildGun(P, { len: 6.35, r: 0.115, sleeve: true, evac: 0.60, evacR: 1.42,
    collar: false, baseR: 0.185 });
  P.add('gun', cylZ(0.132, 0.42, seg), 0, 0, 1.58);
  P.add('gun', box(0.16, 0.11, 0.22), -0.18, 0.06, 5.53);
  muzzleBore(P, { len: 6.35, r: 0.115 });
  P.turretG.userData.chieftainEquipmentReceipt = Object.freeze({
    revision: 'source-equipment-seat-r6',
    roofSeatDatum: 'local-facet-surfaces',
    cupolaSeatSourceY: cupolaSeatY,
    cupolaSeatLocalY: compressedChieftainTurretY(cupolaSeatY),
    cupolaAdapterBottomSourceY: cupolaAdapterBottomY,
    saddleSeatSourceY: saddleSeatY,
    radioShoeSeatSourceY: radioShoeY - 0.05,
    cupolaAdapterPlinths: 1,
    commanderCupolas: 1,
    loaderHatches: 1,
    smokeBanks: 2,
    smokeTubes: 12,
    smokeBankCantRad: 1.05,
    sideServiceCabinets: 2,
    turretOwnedSideBoxes: 4,
    sideBoxAttachmentShoes: 8,
    sideBoxCamouflagedParts: 16,
    sideBoxPaintBucket: 'turretEquipment',
    sideBoxFinish: 'vehicle-scale-camouflage',
    sideBustleBaskets: 2,
    sideBasketBustleTies: 4,
    rearBustleBaskets: 1,
    rearBasketBustleTies: 4,
    radioWhips: 3,
    pintleGpmgs: 1,
    primaryOptic: stillbrew ? 'armored-thermal-head' : 'ir-searchlight',
  });
  P.decal('turret', 'number', P.spec.visual.number || '', 0.28,
    [1.34, 0.33, -0.72], Math.PI / 2);
  ukToneKit(P, { cloth: stillbrew ? 0x41493b : 0x3d4634, dark: 0x292f29 });
  P.topY = 1.28;
  compressChieftainTurretHeight(P);
}

function chieftain5OwnerRebuild2026(P: UKBuilderPort): void {
  chieftain5Build(P);
  buildChieftainUpper2026(P, { stillbrew: false });
}

function chieftainMk10OwnerRebuild2026(P: UKBuilderPort): void {
  chieftainMk10Build(P);
  buildChieftainUpper2026(P, { stillbrew: true });
}

export const UK_PROFILES = {
  chieftain5: { build: chieftain5OwnerRebuild2026 },
  // BASE-21 scaffold (2026-08-07): first real Mk 10 build — photo-class, no
  // oracle (FALSE-0 law). Overrides the modern3 generic via PROFILED_BUILDERS.
  chieftain_mk10: { build: chieftainMk10OwnerRebuild2026 },
  vickers_mk1: {
    build: (P: UKBuilderPort) => {
      vickersMk1Build(P);
      applyCompleteVehicleScale(P, 0.95, 'cot-vickers-mk1-compact-r1');
    },
  },
  centurion3: { build: (P: UKBuilderPort) => centurionBuild(P, 3) },
  centurion5: { build: (P: UKBuilderPort) => centurionBuild(P, 5) },
  comet: {
    build: cometBuild, width: 3.05, hullLength: 6.55, roofY: 1.70, bandY: 0.96, trackW: 0.36,
    bowZ: 2.05, bowY: 1.50, noseTipY: 1.16, tailTrim: 0.02, wheels: 5, wheelR: 0.44, wheelSpan: 3.8,
    gunLength: 3.49, noBins: true, bandHalfW: 1.26, apronY: 1.54, sprocketInset: 0.50,
    lowerBandY: 0.99, lowerSeamY: 1.13,
    trackXc: 1.30, // ref ground band |x| ~1.10..1.50 (v2 front row; the v1 narrow read was dy-shifted)
    // Comet cue: FOUR return rollers between the big Christie wheels.
    // Keep profile data inert at module evaluation time.  Calling the kit's
    // station helper here re-entered tankFactory through the profile import
    // cycle before KIT had initialized.  These are the exact four evenly
    // spaced stations produced by evenStations(4, 3.3).
    rollers: [1.65, 0.55, -0.55, -1.65].map((z) => ({ z, y: 0.76, r: 0.085 })),
  },
  challenger_cruiser: {
    build: a30Build, width: 2.91, hullLength: 8.03, roofY: 1.50, bandY: 0.88, trackW: 0.44,
    bowZ: 2.85, bowY: 1.40, noseTipY: 1.16, tailTrim: 0.03, wheels: 6, wheelR: 0.41, wheelSpan: 5.9,
    gunLength: 3.67, mgBall: false, corridorY: 1.13, lowerBandY: 1.13, lowerSeamY: 1.15,
  },
  charioteer: {
    build: charioteerBuild, width: 3.05, hullLength: 6.55, roofY: 1.62, bandY: 0.94, trackW: 0.40,
    bowZ: 2.2, bowY: 1.40, noseTipY: 1.16, tailTrim: 0.02, wheels: 5, wheelR: 0.44, wheelSpan: 4.3,
    gunLength: 5.38, noBins: true, bandHalfW: 1.30, apronY: 1.50,
    corridorY: 1.14, lowerBandY: 1.14, lowerSeamY: 1.16, guardY: 1.15,
  },
  // FV510 Warrior — photo-class full build (owner order 2026-08-06 "made
  // actual"): published dims 6.34 x 3.03 x 2.80 authored as world coords in
  // fv510Build; the recovered oracle is certified -10.9% short (curve rows
  // carry the cap until the parked §E warp lands — packet round section).
  fv510: {
    build: (P: UKBuilderPort) => {
      fv510PhotoBuild(P);
      applyCompleteVehicleScale(P, 1.10, 'cot-warrior-enlarged-r1');
    },
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
