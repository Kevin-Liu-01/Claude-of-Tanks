// Nation road-wheel constructions (owner 2026-09-22: "standardize our wheels across NATIONS"): the
// donor face constructions of nationWheelSets.ts as builders the running-gear factory can draw at any
// hull's wheel size. A construction is the donor's FACE — dish, spokes, fasteners, hub, tire profile —
// never its dimensions: `buildNationWheel` draws it at the consuming hull's own radius and keeps the
// hull's authored width — the wheel is never narrower than the authored tire band nor wider than the
// standard disc stack's cap envelope (STANDARD_WHEEL_AXIAL_ENVELOPE × tire width) — so station count,
// axle positions and the footprint between hull and track stay the hull's own.
//
// Two kinds of construction live here:
// - native: the donor's own fixed-metre stock (lathed dishes, paired tire bands, face hardware) is
//   built at the donor's size, scaled uniformly to the requested radius and, only when its own
//   proportion falls outside the hull's [tire, cap] width bounds, scaled axially to the nearer bound
//   (the Challenger paired wheel already fits an axial width this way, 2026-09-14);
// - parametric: constructions that are functions of radius and width already (the fleet's standard
//   disc motifs, the hollow paired wheel, the paired turned stock, the T-90 X pressed face) build
//   straight at the requested radius and tire width.
// The donor profiles import their sections and layer recipes from here so a donor and its consumers
// share one definition; every donor still draws its wheel through its own running-gear config.
//
// Leaf module: it imports geometry primitives and wheel-stock leaves only (never the profile kit or
// the running-gear builder), so tankFactoryCore.ts can consume it without a module cycle.
import * as THREE from 'three';
import { box, cylX, mergeAll, torus, xform } from './factoryGeometry.ts';
import { lathedWheelSection, type AxialWheelStation } from './profiles/lathedWheelStock.ts';
import { measuredTireBands, type MeasuredTireBand } from './measuredWheelGeometry.ts';
import { buildHollowPairedRoadWheel, hollowPairedRoadWheelWidth } from './hollowRoadWheelStock.ts';
import { pairedRunningGearStock } from './pairedRunningGearStock.ts';
import { type100RoadWheelStock } from './profiles/type100RunningGear.ts';
import { leopardA6WheelSolids } from './profiles/leopardA6XWheels.ts';
import { kf41LynxWheelStock } from './profiles/kf41LynxWheelStock.ts';
import { leclercWheelSolids } from './profiles/leclercXWheels.ts';
import { k1a1XWheelSolids } from './profiles/k1a1XWheels.ts';
import { strv122SuppliedWheelSolids } from './profiles/strv122XWheels.ts';
import { CUSTOM_FACE_WHEEL_AXIAL_ENVELOPE, wheelGeo, type WheelGeometrySet } from './roadWheelGeometry.ts';
import { WHEEL_PATTERN_DEFINITIONS, type WheelPattern, type WheelPatternId } from './wheelPatterns.ts';
import type { WheelConstructionId } from './nationWheelSets.ts';

/** Which running-gear material an instanced face layer takes; the builder binds it to the hull's own paint. */
type NationWheelPaint = 'dish' | 'dark' | 'detail' | 'rubber';
type NationWheelRole = 'wheelDish' | 'wheelInset' | 'wheelTire';

export interface NationWheelLayer {
  geometry: THREE.BufferGeometry;
  paint: NationWheelPaint;
  role: NationWheelRole;
  /** Instance only on this side of the hull (asymmetric or mirrored stock). */
  side?: -1 | 1;
  /** Outboard offset from the wheel centre plane, wheel-local metres (layers positioned by offset rather than baked X). */
  outset?: number;
  name: string;
}

export interface NationWheelBuildRequest {
  /** The consuming hull's own road-wheel radius. */
  radiusM: number;
  /** The hull's authored tire width (RunningGearConfig.wheelW): the narrowest the wheel may be. */
  tireWidthM: number;
  /** The hull's standard cap envelope (STANDARD_WHEEL_AXIAL_ENVELOPE × tire width): the widest the wheel may be. */
  maxWidthM: number;
  high: boolean;
  /** The running-gear builder's radial segment budget for tire bands. */
  segments: number;
}

interface NationWheelBuild extends WheelGeometrySet {
  layers: NationWheelLayer[];
  /** Uniform scale applied to a native construction (1 for parametric ones). */
  radialScale: number;
  /** Axial fit applied on top of the radial scale (1 when the native proportion already matched). */
  axialScale: number;
}

interface NativeWheelStock extends WheelGeometrySet {
  layers: NationWheelLayer[];
}

type Radial = readonly [axial: number, radius: number];

/** Axial fits outside this window would distort a dish beyond its donor's read; the receipt lists the hulls that hit it. */
export const NATION_WHEEL_AXIAL_FIT = Object.freeze({ min: 0.5, max: 1.5 });

function pattern(id: WheelPatternId): WheelPattern {
  return Object.freeze({ id, ...WHEEL_PATTERN_DEFINITIONS[id] });
}

function turned(rows: readonly Radial[], segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(rows.map(([x, r]) => new THREE.Vector2(r, x)), segments).rotateZ(-Math.PI / 2);
}

/** The measured rubber ring of a recessed steel dish (the same lathe replaceMeasuredWheelSolids turns). */
function openAnnulusTire(innerRadiusM: number, radiusM: number, widthM: number, segments: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry([[innerRadiusM, -widthM / 2], [radiusM, -widthM / 2],
    [radiusM, widthM / 2], [innerRadiusM, widthM / 2], [innerRadiusM, -widthM / 2]]
    .map(([r, y]) => new THREE.Vector2(r, y)), segments).rotateZ(Math.PI / 2);
}

function radialExtent(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  let radius = 0;
  for (let i = 0; i < position.count; i++) radius = Math.max(radius, Math.hypot(position.getY(i), position.getZ(i)));
  return radius;
}

function axialExtent(geometry: THREE.BufferGeometry, outset = 0): number {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  return Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) + Math.abs(outset);
}

/** Full axial envelope of a wheel: tire faces, dish stack and every face layer at its outset. */
function wheelAxialEnvelope(solids: WheelGeometrySet, layers: readonly { geometry: THREE.BufferGeometry; outset?: number }[]): number {
  let half = 0;
  for (const geometry of [solids.tire, solids.disc, solids.dark]) if (geometry) half = Math.max(half, axialExtent(geometry));
  for (const layer of layers) half = Math.max(half, axialExtent(layer.geometry, layer.outset));
  return half * 2;
}

/** The width a construction of natural width `naturalM` takes on a hull: its own, bounded by the hull's tire and cap widths. */
function boundedWidth(naturalM: number, request: NationWheelBuildRequest): number {
  return Math.min(request.maxWidthM, Math.max(request.tireWidthM, naturalM));
}

/** Scale a donor's native stock uniformly to the requested radius, then axially to the nearer width bound when needed. */
function fitNative(stock: NativeWheelStock, request: NationWheelBuildRequest): NationWheelBuild {
  const nativeRadius = radialExtent(stock.tire ?? stock.disc);
  if (!(nativeRadius > 0)) throw new RangeError('Nation wheel construction has no radial extent');
  const radialScale = request.radiusM / nativeRadius;
  const nativeWidth = wheelAxialEnvelope(stock, stock.layers) * radialScale;
  const axialScale = Math.min(NATION_WHEEL_AXIAL_FIT.max, Math.max(NATION_WHEEL_AXIAL_FIT.min,
    boundedWidth(nativeWidth, request) / nativeWidth));
  if (radialScale !== 1 || axialScale !== 1) {
    const sx = radialScale * axialScale;
    const tireHalf = axialExtent(stock.tire ?? stock.disc);
    for (const geometry of [stock.tire, stock.disc, stock.dark]) geometry?.scale(sx, radialScale, radialScale);
    for (const layer of stock.layers) {
      if (layer.outset === undefined) {
        // Baked-X faces are the dish itself: they stretch with the tire bands.
        layer.geometry.scale(sx, radialScale, radialScale);
        continue;
      }
      // Offset-seated dressing (rims, hub drums, caps) follows the tire face but keeps its protrusion
      // proportional to the radius only, so the 2.5 cm seat (wheel-review PROUD) survives an axial stretch.
      layer.geometry.scale(radialScale, radialScale, radialScale);
      layer.outset = radialScale * layer.outset + radialScale * tireHalf * (axialScale - 1);
    }
  }
  return { tire: stock.tire, disc: stock.disc, dark: stock.dark, layers: stock.layers, radialScale, axialScale };
}

function parametric(solids: WheelGeometrySet, layers: NationWheelLayer[] = []): NationWheelBuild {
  return { ...solids, layers, radialScale: 1, axialScale: 1 };
}

/** The fleet's standard disc in the donor's motif and dish ratio, built straight at the hull's radius and tire width. */
function standardConstruction(patternId: WheelPatternId, dishR: number, style: string, request: NationWheelBuildRequest): NationWheelBuild {
  return parametric(wheelGeo(style, request.radiusM, request.tireWidthM, request.segments, dishR, pattern(patternId)));
}

/** A hollow paired wheel at the hull's radius, its natural width bounded by the hull's tire and cap widths. */
function hollowPairedConstruction(request: NationWheelBuildRequest, fasteners?: { fasteners: number; fastenersAsInsets: boolean }): NationWheelBuild {
  const naturalWidthM = hollowPairedRoadWheelWidth(request.radiusM);
  const axialWidthM = boundedWidth(naturalWidthM, request);
  const solids = buildHollowPairedRoadWheel({ radiusM: request.radiusM, high: request.high, ...fasteners, axialWidthM });
  return { ...solids, layers: [], radialScale: 1, axialScale: axialWidthM / naturalWidthM };
}

// ----------------------------------------------------------------------------------------------- China
/** ZTZ-100 X source-only radial rays through Objects 7/17: raised hub, recessed web, curved rim shoulder. */
const ZTZ100_ROAD_WHEEL_SECTION: readonly AxialWheelStation[] = Object.freeze([
  [.029, 0], [.16291, 0], [.16291, .059],
  [.124, .067], [.124, .097], [.04038, .100], [.04038, .140],
  [.05191, .160], [.06631, .180], [.08208, .200], [.09885, .220],
  [.12276, .240], [.17346, .260], [.16934, .280],
  [.18449, .287], [.029, .287],
]);
export const ZTZ100_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([
  { centerM: -.106, widthM: .1535, innerRadiusM: .2865 },
  { centerM: .106, widthM: .1535, innerRadiusM: .2865 },
]);
const ZTZ100_ROAD_WHEEL_RADIUS_M = .3135, ZTZ100_ROAD_WHEEL_WIDTH_M = .366;

export function ztz100RoadWheelCore(high: boolean): THREE.BufferGeometry {
  const segments = high ? 28 : 14;
  return mergeAll([lathedWheelSection(ZTZ100_ROAD_WHEEL_SECTION, segments),
    lathedWheelSection(ZTZ100_ROAD_WHEEL_SECTION.map(([x, r]) => [-x, r]), segments)]);
}

/** Object 17 has twelve hub hexes and eight two-piece web fasteners, all on the outboard face. */
export function ztz100RoadWheelHardware(side: -1 | 1): THREE.BufferGeometry {
  const hardware: THREE.BufferGeometry[] = [];
  for (const [count, ring, axial, radius, depth] of [
    [12, .08173, .12764, .00784, .01007],
    [8, .11145, .04427, .01394, .00850],
    [8, .11145, .05234, .00884, .00850],
  ]) {
    for (let i = 0; i < count; i++) {
      const angle = i * Math.PI * 2 / count;
      hardware.push(cylX(radius, depth, 6).rotateX(angle)
        .translate(side * axial, Math.cos(angle) * ring, Math.sin(angle) * ring));
    }
  }
  return mergeAll(hardware);
}

// ----------------------------------------------------------------------------------------------- Israel
/** Merkava Mk 4 pressed-face ring stack (merkava.ts modernWheelFace), relative to the wheel radius and tire half width. */
export function merkavaPressedFaceLayers(wheelR: number, halfWidth: number): NationWheelLayer[] {
  return [
    { geometry: cylX(wheelR * 0.84, 0.012, 18), paint: 'dark', role: 'wheelDish',
      outset: halfWidth + 0.006, name: 'gearRoadWheelPressedFaces' },
    { geometry: cylX(wheelR * 0.61, 0.010, 16), paint: 'detail', role: 'wheelDish',
      outset: halfWidth + 0.010, name: 'gearRoadWheelDishRings' },
    { geometry: cylX(wheelR * 0.45, 0.011, 14), paint: 'dark', role: 'wheelInset',
      outset: halfWidth + 0.014, name: 'gearRoadWheelDishRecesses' },
    { geometry: cylX(wheelR * 0.20, 0.013, 10), paint: 'detail', role: 'wheelDish',
      outset: halfWidth + 0.019, name: 'gearRoadWheelHubCaps' },
  ];
}

// ----------------------------------------------------------------------------------------------- Japan
/** Type 90 X independent lathed forging: the dish ~120 mm behind its rubber face, the clipped hub projecting back. */
export function type90RoadWheelCore(high: boolean): THREE.BufferGeometry {
  const profile = [[0, -.246988], [.316, -.246988], [.316, .246988],
    [.309, .13170], [.111, .12499], [.111, .194432], [.096, .194432],
    [.079, .22650], [0, .252278], [0, -.246988]];
  return new THREE.LatheGeometry(profile.map(([r, x]) => new THREE.Vector2(r, x)), high ? 32 : 20)
    .rotateZ(-Math.PI / 2);
}
const TYPE90_ROAD_WHEEL = Object.freeze({ radiusM: .357347, widthM: .493976, tireInnerRadiusM: .3158 });
const TYPE10_GUIDE_GAP_RATIO = .10 / .33617; // the Type 10 X fitted course: 100 mm channel at its 336 mm wheel

// ----------------------------------------------------------------------------------------------- Italy
/** Ariete supplied-frame recessed dish with a proud axle cap; the measured outer face is X1.369310, the dish X1.286041. */
export function arieteRoadWheelFace(side: -1 | 1, segments: number): THREE.BufferGeometry {
  // 2026-09-22 wheel audit: the axle cap tip sits at .2083 (source .209717) — the Ariete family rig scale
  // (×1.232) put the 2.1 cm model-space cap 2.6 cm outside the tire face in world metres; the fleet seat is 2.5 cm.
  const rows: readonly Radial[] = [[.2083, 0], [.19991, .030], [.18746, .045],
    [.13432, .065], [.105558, .073], [.105558, .21406], [.188827, .237],
    [.188827, .261], [.179827, .261], [.096558, .21406],
    [.096558, .073], [.1993, 0], [.2083, 0]];
  // The dish contour runs from its outer axle tip toward its back. Reverse
  // that contour so the closed stock faces outward, like the wheel core.
  const geometry = turned([...rows].reverse(), segments);
  if (side < 0) geometry.rotateY(Math.PI);
  return geometry;
}
export function arieteRoadWheelCore(segments: number): THREE.BufferGeometry {
  return turned([[-.111, 0], [-.111, .241], [.106, .241], [.106, 0], [-.111, 0]], segments);
}
export const ARIETE_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([-.116491, .116491].map(centerM => ({
  centerM, widthM: .14467, innerRadiusM: .260,
})));
const ARIETE_ROAD_WHEEL = Object.freeze({ radiusM: .28975886, widthM: .377654 });

// ----------------------------------------------------------------------------------------------- France
/** AMX-40 X pressed face: rim ring, six ribs and bolts on both sides of the axle (fixed source metres). */
export function amx40PressedWheelFaces(): THREE.BufferGeometry {
  const pieces: THREE.BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    pieces.push(torus(.307, .010, 32, 8).rotateZ(Math.PI / 2).translate(s * .164, 0, 0));
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      pieces.push(box(.033, .055, .176).rotateX(-a).translate(s * .155,
        Math.sin(a) * .190, Math.cos(a) * .190));
      pieces.push(cylX(.019, .042, 6).translate(s * .154, Math.sin(a) * .234, Math.cos(a) * .234));
    }
  }
  return mergeAll(pieces);
}
const AMX40_ROAD_WHEEL = Object.freeze({ radiusM: .3401, widthM: .3211, tireInnerRadiusM: .282, faceDepthScale: .70 });
const LECLERC_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([-.1563971, .1563971].map(centerM => ({
  centerM, widthM: .2138948, innerRadiusM: .2753843,
})));
const LECLERC_ROAD_WHEEL = Object.freeze({ radiusM: .3307865, widthM: .526689 });

// ----------------------------------------------------------------------------------------------- UK
/** Warrior Milan X Object_33: a deep plain steel web, not the generic capped six-hub face. */
const WARRIOR_WEB_SECTION_HIGH: readonly AxialWheelStation[] = Object.freeze([
  [.006, 0], [.08605, 0], [.08605, .020], [.0784, .030], [.02315, .045],
  [.02315, .165], [.0324, .18], [.071, .21], [.08115, .242], [.08115, .252],
  [.027, .252], [.006, .20],
]);
const WARRIOR_WEB_SECTION_LOW: readonly AxialWheelStation[] = Object.freeze([
  [.006, 0], [.08605, 0], [.08605, .020], [.02315, .045], [.02315, .165],
  [.071, .21], [.08115, .252], [.027, .252], [.006, .20],
]);
export function warriorRoadWheelCore(high: boolean): THREE.BufferGeometry {
  const section = high ? WARRIOR_WEB_SECTION_HIGH : WARRIOR_WEB_SECTION_LOW;
  return mergeAll([
    lathedWheelSection(section, high ? 24 : 12),
    lathedWheelSection(section.map(([x, r]) => [-x, r]), high ? 24 : 12),
    cylX(.06, .045, high ? 16 : 10),
  ]);
}
export const WARRIOR_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([
  { centerM: -.1000, widthM: .1435, innerRadiusM: .251 },
  { centerM: .1000, widthM: .1435, innerRadiusM: .251 },
]);
const WARRIOR_ROAD_WHEEL = Object.freeze({ radiusM: .2991, widthM: .3435 });

// ----------------------------------------------------------------------------------------------- Russia
/** T-90 X source-pressed road-wheel face: six-hole plate, rim ring, hub and bolt heads (t90X.ts), relative to the radius and tire half width. */
export function t90SourcePressedFaceLayers(r: number, halfWidth: number, zScale: number): NationWheelLayer[] {
  const shape = new THREE.Shape(); shape.absarc(0, 0, r * .865, 0, Math.PI * 2, false);
  for (let i = 0; i < 6; i++) {
    const angle = i * Math.PI / 3, hole = new THREE.Path();
    hole.absarc(Math.sin(angle) * r * .55, Math.cos(angle) * r * .55, r * .12, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  const disc = new THREE.ExtrudeGeometry(shape, { depth: .018, bevelEnabled: false, curveSegments: 16 })
    .translate(0, 0, -.009).rotateY(Math.PI / 2).scale(1, 1, zScale);
  const rim = torus(r * .853, .010, 32, 8).rotateZ(Math.PI / 2).scale(1, 1, zScale);
  const bolts = Array.from({ length: 6 }, (_, i) => {
    const angle = i * Math.PI / 3;
    return cylX(.012, .025, 6).translate(0, Math.sin(angle) * r * .30, Math.cos(angle) * r * .30 * zScale);
  });
  return [
    { geometry: disc, paint: 'dish', role: 'wheelDish', outset: halfWidth + .004, name: 'gearRoadWheelSourcePressedFaces' },
    { geometry: rim, paint: 'dish', role: 'wheelDish', outset: halfWidth + .010, name: 'gearRoadWheelSourceRims' },
    // 2026-09-14 owner: hub and bolt heads stood 3 cm proud of the tire; seated within 2 cm.
    { geometry: cylX(r * .24, .030, 20), paint: 'dish', role: 'wheelDish', outset: halfWidth + .004, name: 'gearRoadWheelSourceHubs' },
    { geometry: mergeAll(bolts), paint: 'dark', role: 'wheelInset', outset: halfWidth + .006, name: 'gearRoadWheelSourceBolts' },
  ];
}
const T90_FACE_DEPTH_SCALE = .695; // the T-90M X study's wheelFaceDepthScale
/** BMP-3M Dragun source wheel rays relative to the axle: hub +.113 m, web +.072 m, rolled lip +.135 m. */
const DRAGUN_WEB_SECTION: readonly AxialWheelStation[] = Object.freeze([
  [.045, 0], [.113, 0], [.113, .075], [.072, .092], [.072, .195],
  [.114, .221], [.1355, .239], [.1355, .250], [.102, .250],
  [.044, .212], [.044, .09], [.045, 0],
]);
export function dragunRoadWheelCore(high: boolean): THREE.BufferGeometry {
  return mergeAll([
    lathedWheelSection(DRAGUN_WEB_SECTION, high ? 28 : 16),
    lathedWheelSection(DRAGUN_WEB_SECTION.map(([x, r]) => [-x, r]), high ? 28 : 16),
    cylX(.059, .224, high ? 20 : 12),
  ]);
}
export const DRAGUN_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([
  { centerM: -.090, widthM: .091, innerRadiusM: .247 },
  { centerM: .090, widthM: .091, innerRadiusM: .247 },
]);
const DRAGUN_ROAD_WHEEL = Object.freeze({ radiusM: .2925, widthM: .271 });

// ----------------------------------------------------------------------------------------------- Germany
const LEO2A6_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([-.10442, .10442].map(centerM => ({
  centerM, widthM: .13956, innerRadiusM: .31624,
})));
const LEO2A6_ROAD_WHEEL = Object.freeze({ radiusM: .34531, widthM: .3484 });
const LYNX_TIRE_BANDS: readonly MeasuredTireBand[] = Object.freeze([
  { centerM: -.1246, widthM: .1805, innerRadiusM: .307 },
  { centerM: .1246, widthM: .1805, innerRadiusM: .307 },
]);
const LYNX_ROAD_WHEEL = Object.freeze({ radiusM: .3675, widthM: .4297 });

// ----------------------------------------------------------------------------------------------- Sweden / Korea
const STRV122_ROAD_WHEEL = Object.freeze({ radiusM: .3375, widthM: .370, tireInnerRadiusM: .314 });
const K1A1_ROAD_WHEEL = Object.freeze({ radiusM: .3313, widthM: .3701, tireInnerRadiusM: .2700 });

// ----------------------------------------------------------------------------------------------- USA
/** M551A1 TTS pressed rim, dish well, hub drum and cap (sheridan.ts), seated on the 0.120 tire face (2026-09-14). */
export function sheridanWheelFaceLayers(high: boolean): NationWheelLayer[] {
  return [
    // KIT.torus is already rotated into the XZ plane; a Z quarter-turn puts its axis on X, exactly matching cylX and the road-wheel axle.
    { geometry: xform(torus(0.284, 0.026, high ? 28 : 18, high ? 8 : 6), 0, 0, 0, 0, 0, Math.PI / 2),
      paint: 'dish', role: 'wheelDish', outset: 0.114, name: 'gearRoadWheelPressedRims' },
    { geometry: cylX(0.236, 0.014, high ? 24 : 16), paint: 'dark', role: 'wheelInset', outset: 0.084, name: 'gearRoadWheelDishWells' },
    { geometry: cylX(0.126, 0.022, high ? 20 : 14), paint: 'dish', role: 'wheelDish', outset: 0.092, name: 'gearRoadWheelHubDrums' },
    { geometry: cylX(0.050, 0.026, high ? 14 : 10), paint: 'dark', role: 'wheelInset', outset: 0.096, name: 'gearRoadWheelHubCaps' },
  ];
}
const SHERIDAN_ROAD_WHEEL = Object.freeze({ radiusM: .368, widthM: .20 });

// ----------------------------------------------------------------------------------------------- builders
type NationWheelBuilder = (request: NationWheelBuildRequest) => NationWheelBuild;

const BUILDERS: Readonly<Partial<Record<WheelConstructionId, NationWheelBuilder>>> = Object.freeze({
  'ztz100-recessed-web': (q) => fitNative({
    tire: measuredTireBands(ZTZ100_TIRE_BANDS, ZTZ100_ROAD_WHEEL_RADIUS_M, ZTZ100_ROAD_WHEEL_WIDTH_M, q.segments),
    disc: ztz100RoadWheelCore(q.high), dark: null,
    layers: ([-1, 1] as const).map(side => ({ geometry: ztz100RoadWheelHardware(side), paint: 'dish' as const, role: 'wheelDish' as const,
      side, name: `ztz100WheelFasteners${side < 0 ? 'Left' : 'Right'}` })),
  }, q),
  'type100-paired-pressed': (q) => fitNative({ ...type100RoadWheelStock(q.high), layers: [] }, q),
  'merkava-deep-dish': (q) => {
    // The Mk 4 draws the custom-face base stack under the ring stack; its hub cap reaches
    // CUSTOM_FACE_WHEEL_AXIAL_ENVELOPE × the tire width, so the tire is held to the hull's cap bound.
    const width = Math.min(q.tireWidthM, q.maxWidthM / CUSTOM_FACE_WHEEL_AXIAL_ENVELOPE);
    return parametric(wheelGeo('rubber', q.radiusM, width, q.segments, .78, pattern('deep-dish-eight'), true),
      merkavaPressedFaceLayers(q.radiusM, width / 2));
  },
  'strv122-pressed-recess': (q) => {
    const solids = strv122SuppliedWheelSolids(q.high ? 40 : 24), d = STRV122_ROAD_WHEEL;
    return fitNative({ tire: openAnnulusTire(d.tireInnerRadiusM, d.radiusM, d.widthM, q.segments), disc: solids.core, dark: null,
      layers: [{ geometry: solids.left, paint: 'dish', role: 'wheelDish', side: -1, name: 'strv122SuppliedWheelFacesLeft' },
        { geometry: solids.right, paint: 'dish', role: 'wheelDish', side: 1, name: 'strv122SuppliedWheelFacesRight' }] }, q);
  },
  'cv90-armoured-hub': (q) => standardConstruction('armored-hub-six', .90, 'rubber', q),
  'k2-flanged': (q) => standardConstruction('flanged-twelve', .90, 'rubber', q),
  'k1a1-deep-bowl': (q) => {
    const solids = k1a1XWheelSolids(q.high ? 32 : 20), d = K1A1_ROAD_WHEEL;
    return fitNative({ tire: openAnnulusTire(d.tireInnerRadiusM, d.radiusM, d.widthM, q.segments), disc: solids.core, dark: null,
      layers: [{ geometry: solids.left, paint: 'dish', role: 'wheelDish', side: -1, name: 'k1a1SourceWheelFacesLeft' },
        { geometry: solids.right, paint: 'dish', role: 'wheelDish', side: 1, name: 'k1a1SourceWheelFacesRight' }] }, q);
  },
  'pl01-plain-dish': (q) => standardConstruction('plain-dish-twelve', .60, 'rubber', q),
  'bwp1-armoured-hub': (q) => standardConstruction('armored-hub-six', .80, 'rubber', q),
  'type10-paired': (q) => parametric(pairedRunningGearStock({ radiusM: q.radiusM, axialWidthM: q.tireWidthM,
    guideGapM: TYPE10_GUIDE_GAP_RATIO * q.radiusM, high: q.high })),
  'type90-recessed-forging': (q) => {
    const d = TYPE90_ROAD_WHEEL;
    return fitNative({ tire: openAnnulusTire(d.tireInnerRadiusM, d.radiusM, d.widthM, q.segments), disc: type90RoadWheelCore(q.high), dark: null, layers: [] }, q);
  },
  'ariete-recessed-dish': (q) => {
    const segments = q.high ? 32 : 20, d = ARIETE_ROAD_WHEEL;
    return fitNative({ tire: measuredTireBands(ARIETE_TIRE_BANDS, d.radiusM, d.widthM, q.segments), disc: arieteRoadWheelCore(segments), dark: null,
      layers: ([-1, 1] as const).map(side => ({ geometry: arieteRoadWheelFace(side, segments), paint: 'dish' as const, role: 'wheelDish' as const,
        side, name: `arieteSuppliedRecessedWheelFace${side}` })) }, q);
  },
  'leclerc-stepped-plate': (q) => {
    const solids = leclercWheelSolids(q.high ? 32 : 16), d = LECLERC_ROAD_WHEEL;
    return fitNative({ tire: measuredTireBands(LECLERC_TIRE_BANDS, d.radiusM, d.widthM, q.segments), disc: solids.core, dark: null,
      layers: solids.faces.flatMap(({ side, steel, rubber }) => [
        { geometry: steel, paint: 'dish' as const, role: 'wheelDish' as const, side, name: `leclercSourceWheelSteel${side}` },
        { geometry: rubber, paint: 'rubber' as const, role: 'wheelTire' as const, side, name: `leclercSourceWheelGroove${side}` },
      ]) }, q);
  },
  'amx40-pressed-face': (q) => {
    const d = AMX40_ROAD_WHEEL;
    // The AMX-40 X draws the fleet's custom-face base stack under its pressed faces, compressed to the source dish depth.
    const solids = wheelGeo('rubber', d.radiusM, d.widthM, q.segments, .90, pattern('scalloped-six'), true);
    solids.tire?.dispose();
    solids.disc.scale(d.faceDepthScale, 1, 1); solids.dark?.scale(d.faceDepthScale, 1, 1);
    return fitNative({ tire: openAnnulusTire(d.tireInnerRadiusM, d.radiusM, d.widthM, q.segments), disc: solids.disc, dark: solids.dark,
      layers: [{ geometry: amx40PressedWheelFaces(), paint: 'dish', role: 'wheelDish', name: 'amx40WheelPressedFaces' }] }, q);
  },
  'challenger-hollow-paired': (q) => hollowPairedConstruction(q, { fasteners: 8, fastenersAsInsets: true }),
  'warrior-plain-web': (q) => {
    const d = WARRIOR_ROAD_WHEEL;
    return fitNative({ tire: measuredTireBands(WARRIOR_TIRE_BANDS, d.radiusM, d.widthM, q.segments), disc: warriorRoadWheelCore(q.high), dark: null, layers: [] }, q);
  },
  't90-pressed-source-face': (q) => {
    // The hull's own tire width; the pressed face plate and rim ring seat 20 mm outside its face as on the donor.
    const width = q.tireWidthM;
    const solids = wheelGeo('rubber', q.radiusM, width, q.segments, .90, pattern('pressed-six'));
    solids.disc.scale(T90_FACE_DEPTH_SCALE, 1, 1); solids.dark?.scale(T90_FACE_DEPTH_SCALE, 1, 1);
    return parametric(solids, t90SourcePressedFaceLayers(q.radiusM, width / 2, 1));
  },
  'dragun-rolled-lip': (q) => {
    const d = DRAGUN_ROAD_WHEEL;
    return fitNative({ tire: measuredTireBands(DRAGUN_TIRE_BANDS, d.radiusM, d.widthM, q.segments), disc: dragunRoadWheelCore(q.high), dark: null, layers: [] }, q);
  },
  'leo2a6-paired-dish': (q) => {
    const solids = leopardA6WheelSolids(q.high ? 32 : 20), d = LEO2A6_ROAD_WHEEL;
    return fitNative({ tire: measuredTireBands(LEO2A6_TIRE_BANDS, d.radiusM, d.widthM, q.segments), disc: solids.core, dark: null,
      layers: [{ geometry: solids.left, paint: 'dish', role: 'wheelDish', side: -1, name: 'a6SourcePairedWheelFacesL' },
        { geometry: solids.right, paint: 'dish', role: 'wheelDish', side: 1, name: 'a6SourcePairedWheelFacesR' }] }, q);
  },
  'lynx-stamped-web': (q) => {
    const solids = kf41LynxWheelStock(q.high), d = LYNX_ROAD_WHEEL;
    return fitNative({ tire: measuredTireBands(LYNX_TIRE_BANDS, d.radiusM, d.widthM, q.segments), disc: solids.core, dark: null,
      layers: solids.faces.flatMap(({ side, steel, dark }) => [
        { geometry: steel, paint: 'dish' as const, role: 'wheelDish' as const, side, name: `kf41SourceWheelSteel${side}` },
        { geometry: dark, paint: 'rubber' as const, role: 'wheelInset' as const, side, name: `kf41SourceWheelFasteners${side}` },
      ]) }, q);
  },
  'abrams-hollow-paired': (q) => hollowPairedConstruction(q),
  'sheridan-pressed-rim': (q) => {
    const d = SHERIDAN_ROAD_WHEEL;
    return fitNative({ ...wheelGeo('rubber', d.radiusM, d.widthM, q.segments, .90, pattern('cast-five-spoke'), true),
      layers: sheridanWheelFaceLayers(q.high) }, q);
  },
  'm60a3-cast-spoke': (q) => standardConstruction('cast-five-spoke', .90, 'dished', q),
});

/** Constructions a non-donor hull can draw; the others are donor-only (every hull of that shape is a donor). */
export const BUILDABLE_WHEEL_CONSTRUCTIONS = Object.freeze(Object.keys(BUILDERS) as WheelConstructionId[]);

/** Draw a nation wheel construction at a hull's own radius, between its authored tire width and cap envelope. */
export function buildNationWheel(construction: WheelConstructionId, request: NationWheelBuildRequest): NationWheelBuild {
  const builder = BUILDERS[construction];
  if (!builder) throw new Error(`Nation wheel construction ${construction} has no builder (donor-only construction)`);
  if (!(request.radiusM > 0) || !(request.tireWidthM > 0) || !(request.maxWidthM >= request.tireWidthM)
    || !Number.isInteger(request.segments) || request.segments < 4) {
    throw new RangeError(`Invalid nation wheel request for ${construction}`);
  }
  return builder(request);
}
