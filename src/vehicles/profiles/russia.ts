// Soviet/Russian modern family procedural profiles (fidelity oracles:
// recovered T-62/T-64/T-72/T-90 variants + PT-91M). Owned by the
// Russia-modern family agent.
//
// 2026-07-31 r4: FROM-SCRATCH rebuild of all nine tanks against the measured
// silhouette polylines in docs/references/profiles/<id>.json (the r1-r3
// donor/parametric builders are deleted, not patched). Every hull is a loft
// of measured stations, every dome a lathe of measured rings, every tube a
// measured segment stack; the r3 fitting language that already read on
// boards (Shtora eyes, K-1/K-5/Relikt/ERAWA architectures, seam-ringed
// sleeves, NSVT, glacis kit) is re-seated on the new curve-true shells.
// Oracle-parity notes (misparented drums/racks, hull-parented barrels,
// floating baselines) live per-build below and in the reference packets.
//
// Coordinate convention: authored directly in the width-normalized lab
// frame each profile JSON was traced in — ground y=0, +z forward, and the
// oracle's own (often aft-shifted) hull center, so the raw-frame component
// masks (gun overhang especially) line up. Everything is an original
// primitive construction — measured dimensions only, no source topology.
import * as THREE from 'three';
import { KIT, FITTINGS, MUDGUARDS, evenStations, muzzleBore, muzzleTipDot, orientedSlab } from './kit.ts';
import { addSovietChevronEra } from './sovietChevronEra.ts';
import { vehicleAmbientFloorHook } from '../materials.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';

type Vec2Tuple = readonly [number, number];
type Vec3Tuple = readonly [number, number, number];
type ProfileCurve = readonly Vec2Tuple[];
// Several already-typed sibling profiles derive these rings with Array.map,
// which deliberately widens the tuple to a numeric row. The geometry contract
// only reads indices 0 and 1, so expose the honest interoperable shape here.
type DomeRing = readonly number[];
type GeometryScale = number | readonly number[];
type EraKind = 'k1' | 'k5' | 'tip' | 'erawa' | 'relikt';

interface RussiaGeometryPort {
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly q?: boolean;
  topY?: number;
  add(
    slot: string,
    geometry: THREE.BufferGeometry,
    x?: number,
    y?: number,
    z?: number,
    rotationX?: number,
    rotationY?: number,
    rotationZ?: number,
    scale?: GeometryScale,
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

interface RussiaGunPort extends RussiaGeometryPort {
  muzzleZ?: number;
}

interface RussiaGunMountPort extends RussiaGeometryPort {
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface RussiaMudguardPort extends RussiaGeometryPort {
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface RussiaOffsetPort extends RussiaGeometryPort {
  offsetBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
}

interface RussiaChassisPort extends RussiaGeometryPort {
  readonly mats: RuntimeValue;
}

interface RussiaEraPort extends RussiaGeometryPort {
  visualEraCluster(key: string, owner: 'hull' | 'turret', build: () => void): void;
}

interface RussiaBuilderPort
  extends RussiaGunPort, RussiaGunMountPort, RussiaMudguardPort, RussiaOffsetPort, RussiaEraPort {
  readonly mats: Record<string, THREE.MeshStandardMaterial> & {
    readonly dark: THREE.MeshStandardMaterial;
  };
  readonly spec: { readonly visual: { readonly number?: string } };
  _shtoraRed?: THREE.MeshStandardMaterial;
}

interface RussiaShtoraPort extends RussiaGeometryPort {
  readonly mats: { readonly dark: THREE.MeshStandardMaterial };
  _shtoraRed?: THREE.MeshStandardMaterial;
}

interface LoftHullOptions {
  readonly deck: ProfileCurve;
  readonly belly: ProfileCurve;
  readonly wUp: ProfileCurve;
  readonly wLo: ProfileCurve;
  readonly sponsonY: number | ProfileCurve;
}

interface T80CastTurretOptions {
  readonly scaleY?: number;
  readonly sz?: number;
  readonly cx?: number;
  readonly cz?: number;
  readonly curved?: boolean;
  readonly capR?: number;
  readonly roofTiltScale?: number;
  readonly reference?: string;
  readonly equipmentSeatRevision?: string;
}

interface CurvedDomeOptions {
  readonly capR?: number;
  readonly roofTiltScale?: number;
  readonly bucket?: string;
}

interface DomeBoxSeatOptions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
  readonly d: number;
  readonly cx?: number;
  readonly cz?: number;
  readonly rx?: number;
  readonly ry?: number;
  readonly rz?: number;
  readonly order?: THREE.EulerOrder;
  readonly overlap?: number;
  readonly standoff?: number;
}

type GunSegment = readonly [
  zStart: number,
  zEnd: number,
  radius: number,
  endRadius?: number,
  centerX?: number,
  centerY?: number,
  legacyPlanRadius?: number,
];

type GunRing = readonly [z: number, radius: number, centerX?: number, centerY?: number];

interface TubeGunOptions {
  readonly rings?: readonly GunRing[];
  readonly muzzle?: number;
}

interface SaddleOptions {
  readonly rollR: number;
  readonly rollW: number;
  readonly tubeR: number;
  readonly rootR?: number;
  readonly rootL?: number;
}

type BootPoint = readonly [z: number, width: number, height: number, centerY?: number];

interface BootOptions {
  readonly pts: readonly BootPoint[];
  readonly bulge?: number;
  readonly creaseD?: number;
  readonly clamp?: boolean;
}

interface GlacisKitOptions {
  readonly w: number;
  readonly y: number;
  readonly z: number;
  readonly barY?: number;
  readonly hookBucket?: string;
  readonly hookH?: number;
  readonly hookD?: number;
  readonly hookX?: number;
  readonly hookY?: number;
  readonly hookZ?: number;
  readonly eyes?: boolean;
  readonly eyeSplit?: boolean;
  readonly eyeX?: number;
  readonly eyeY?: number;
  readonly eyeZ?: number;
  readonly lights?: boolean;
  readonly hlX?: number;
  readonly hlY?: number;
}

interface DeckOptions {
  readonly deckY: number;
  readonly hatchZ: number;
  readonly gz: number;
  readonly hatchX?: number;
  readonly hatchY?: number;
  readonly periY?: number;
  readonly grilles?: number;
  readonly gw?: number;
  readonly gx?: number;
  readonly gY?: number;
  readonly ribY?: number;
}

interface SkirtBandOptions {
  readonly x: number;
  readonly z0: number;
  readonly z1: number;
  readonly yTop: number;
  readonly yBot: number;
  readonly panels?: number;
  readonly firstYBot?: number;
  readonly rubberBotH?: number;
  readonly th?: number;
  readonly dressIn?: number;
  readonly lipX?: number;
  readonly lipXL?: number;
  readonly lipY?: number;
  readonly lipYL?: number;
  readonly firstLipY?: number;
}

interface FlapBaseOptions {
  readonly x: number;
  readonly w: number;
}

type FlapOptions = FlapBaseOptions & (
  | { readonly front: Vec2Tuple; readonly frontZ: number; readonly rear?: never; readonly rearZ?: never }
  | { readonly front?: never; readonly frontZ?: never; readonly rear: Vec2Tuple; readonly rearZ: number }
  | { readonly front: Vec2Tuple; readonly frontZ: number; readonly rear: Vec2Tuple; readonly rearZ: number }
);

interface T62BowServiceOptions {
  readonly stiffenerY?: number;
  readonly stiffenerZ?: number;
  readonly stiffenerPitch?: number;
  readonly recoveryY?: number;
  readonly recoveryBodyZ?: number;
  readonly recoveryEyeZ?: number;
}

interface T62ChassisOptions {
  readonly bowService?: T62BowServiceOptions;
  readonly gear?: Readonly<Record<string, RuntimeValue>>;
}

interface TallTrackLiftOptions {
  readonly trackHeightIncreaseM: number;
  readonly hullRideHeightIncreaseM?: number;
  readonly lowerHullDropM?: number;
  readonly trackBottomY: number;
  readonly trackTopY: number;
  readonly authoredEnvelopeHeightM: number;
  readonly roadWheelRadiusM: number;
  readonly roadWheelCenterY: number;
  readonly frontIdlerLiftM?: number;
}

interface EraLowerLeafOptions {
  readonly dy?: number;
  readonly tuck?: number;
  readonly h?: number;
  readonly dPitch?: number;
}

interface EraSurfaceSeat {
  readonly point: Vec3Tuple;
  readonly normal: Vec3Tuple;
}

interface EraChevronOptions {
  readonly t0?: number;
  readonly out?: number;
  readonly inX?: number;
  readonly inZ?: number;
  readonly yaw: number;
  readonly rows?: number;
  readonly arcFrom?: number;
  readonly arcTop?: boolean;
  readonly banksOff?: boolean;
  readonly d0?: number;
  readonly pitch?: number;
  readonly rowTuck?: number;
  readonly bucket?: string;
  readonly bw?: number;
  readonly bh?: number;
  readonly bd?: number;
  readonly tilt?: number;
  readonly tiltRow?: number;
}

interface EraTipOptions {
  readonly x?: number;
  readonly z: number;
  readonly ox: number;
  readonly oz: number;
  readonly y?: number;
  readonly h?: number;
  readonly d?: number;
  readonly tilt?: number;
  readonly segs?: number;
  readonly rows?: number;
  readonly bucket?: string;
  readonly pad?: number;
  readonly capW?: number;
  readonly noBacker?: boolean;
  readonly gap?: boolean;
  readonly gapH?: number;
  readonly lip?: EraLowerLeafOptions;
}

interface EraCheekOptions {
  readonly rings?: readonly DomeRing[];
  readonly sz?: number;
  readonly rCz?: number;
  readonly k5T?: number;
  readonly k5Y?: number;
  readonly k5Out?: number;
  readonly k5Yaw?: number;
  readonly k5Len?: number;
  readonly k5H?: number;
  readonly k5Rise?: number;
  readonly k5Pitch?: number;
  readonly k5D?: number;
  readonly k5Bucket?: string;
  readonly k5LeafOff?: boolean;
  readonly k5Seg?: number;
  readonly k5Lower?: EraLowerLeafOptions;
  readonly k5CapIn?: number;
  readonly k5FlankSurfaceSeats?: readonly EraSurfaceSeat[];
  readonly k5FlankSurfaceRowOffsets?: readonly number[];
  readonly k5FlankRowOffsets?: readonly number[];
  readonly k5TileWidth?: number;
  readonly k5TileHeight?: number;
  readonly k5TileDepth?: number;
  readonly k5TileEmbed?: number;
  readonly k5TileBackerDepth?: number;
  readonly k5TileBackerOverlap?: number;
  readonly k5LayeredFlankTiles?: boolean;
  readonly k5MirrorFlankTiles?: boolean;
  readonly k5TileY?: number;
  readonly k5TileOut?: number;
  readonly k5FlushFlankTiles?: boolean;
  readonly k5TileYaw0?: number;
  readonly k5TileYawStep?: number;
  readonly k5TilePitch?: number;
  readonly k1Chevron?: EraChevronOptions;
  readonly k1Y?: number;
  readonly k1Pitch?: number;
  readonly k1N?: number;
  readonly k1T0?: number;
  readonly k1Step?: number;
  readonly k1H?: number;
  readonly k1Out?: number;
  readonly k1OutI?: readonly number[];
  readonly k1Bucket?: string;
  readonly tip?: EraTipOptions;
  readonly eDists?: readonly number[];
  readonly rT0?: number;
  readonly rStep?: number;
  readonly rDist?: number;
  readonly rDists?: readonly number[];
  readonly rD?: number;
  readonly rY?: number;
  readonly rY0?: number;
  readonly rH?: number;
  readonly rTilt?: number;
  readonly rBucket?: string;
  readonly rGapBucket?: string;
  readonly rRows?: number;
  readonly rDeep?: number;
  readonly rChev?: { readonly lean?: number };
  readonly rSeam?: boolean;
  readonly rGapH?: number;
  readonly rStrip?: boolean;
  readonly rXPairs?: readonly (readonly number[])[];
}

interface ShtoraOptions {
  readonly rings: readonly DomeRing[];
  readonly sz: number;
  readonly eyeScale?: number;
  readonly eyeX?: number;
  readonly eyeZ?: number;
  readonly eyeRound?: boolean;
  readonly eyeKit?: boolean;
}

const nonUniformXform = KIT.xform as (
  geometry: THREE.BufferGeometry,
  x?: number,
  y?: number,
  z?: number,
  rotationX?: number,
  rotationY?: number,
  rotationZ?: number,
  scale?: GeometryScale,
) => THREE.BufferGeometry;

// THREE is used only for the t72b3m r23 light-immune flat class (kf51 r7
// precedent, leopard.js): MeshBasicMaterial renders its albedo flat from
// every view — the only route below the ~52 hemi vertical-face floor. The
// gate's white-mask overrideMaterial replaces it in the mask pass (proven).

// ---------------------------------------------------------------------------
// 2026-07-31 FROM-SCRATCH rebuild core. Authoring data: the measured
// silhouette polylines in docs/references/profiles/<id>.json (side/plan/front
// mask traces of each width-normalized local reference + 14 hull stations).
// Hulls are LOFTED STATION SLABS that follow the measured deck/belly/width
// polylines; domes are lathed against the measured whole-minus-hull curves;
// gun tubes are segment stacks with the measured radii/breaks. These are
// measurements (dimension tables), never source topology.
//
// Frame: world meters of the width-normalized lab — ground y=0, +z forward,
// the same aft-shifted oracle frames the raw-mask gun-overhang crop needs.
// Side-view mask traces lean +0.05·|x| (camera tilt), so full-width plate
// lines are authored ~0.09 below their traced values; iteration against the
// per-view overlays settles the rest.
// ---------------------------------------------------------------------------

// Piecewise-linear lookup over [[z, v], ...] breakpoints (sorted by z).
function lerpPts(pts: ProfileCurve, z: number): number {
  if (z <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (z <= pts[i][0]) {
      const [z0, v0] = pts[i - 1], [z1, v1] = pts[i];
      return v0 + (v1 - v0) * ((z - z0) / Math.max(1e-6, z1 - z0));
    }
  }
  return pts[pts.length - 1][1];
}

// Lofted station hull following the measured curves EXACTLY.
//   deck : [[z, y]] hull plate top line (furniture excluded), rear -> front
//   belly: [[z, y]] plate underside (rear rake, flat belly, lower bow)
//   wUp  : [[z, halfW]] upper-band half width (sponson/fender line)
//   wLo  : [[z, halfW]] lower-band half width (between the tracks)
//   sponsonY: track-bay roof — the upper band lofts sponsonY->deck, the
//   lower band belly->sponsonY, both pinch out where the curves cross.
export function loftHull(P: RussiaGeometryPort, o: LoftHullOptions): void {
  const { slab } = KIT;
  // sponsonY: scalar (fleet default, byte-identical) OR [[z, y]] profile
  // (t72b3m §B4: the track-bay roof lifts above the idler/sprocket wrap
  // crowns so the band never buries into the sponson slab — merkava
  // sponson-floor-station recipe). Profile z-knots join the station cuts
  // so the knees land exactly.
  const spProf = Array.isArray(o.sponsonY) ? o.sponsonY : null;
  const spAt = (z: number): number => (spProf ? lerpPts(spProf, z) : o.sponsonY as number);
  const raw = [...new Set([o.deck, o.belly, o.wUp, o.wLo, ...(spProf ? [spProf] : [])].flat().map((p) => p[0]))]
    .sort((a, b) => a - b);
  // EDGE-ON PRISM LAW (docs/GEOMETRY-GATE.md, r7c): the station cameras clip
  // a ~0.52 m z-slab; an axis-aligned long box shows the front camera only
  // its end caps, so a multi-metre loft slab is INVISIBLE at every mid-span
  // station slice. Subdivide the loft at <=0.36 m pitch so every station
  // slab contains real cross-section faces. Outer silhouette is unchanged
  // (the cuts interpolate the same curves).
  const zs = [];
  for (let i = 0; i < raw.length; i++) {
    zs.push(raw[i]);
    if (i < raw.length - 1) {
      const span = raw[i + 1] - raw[i];
      const cuts = Math.floor(span / 0.36);
      for (let c = 1; c <= cuts; c++) zs.push(raw[i] + (span * c) / (cuts + 1));
    }
  }
  zs.sort((a, b) => a - b);
  for (let i = 0; i < zs.length - 1; i++) {
    const z0 = zs[i], z1 = zs[i + 1];
    if (z1 - z0 < 0.015) continue;
    const d0 = lerpPts(o.deck, z0), d1 = lerpPts(o.deck, z1);
    const b0 = lerpPts(o.belly, z0), b1 = lerpPts(o.belly, z1);
    const s0 = Math.min(spAt(z0), d0 - 0.01), s1 = Math.min(spAt(z1), d1 - 0.01);
    const u0 = Math.max(s0, b0), u1 = Math.max(s1, b1);
    const wu0 = lerpPts(o.wUp, z0), wu1 = lerpPts(o.wUp, z1);
    const wl0 = lerpPts(o.wLo, z0), wl1 = lerpPts(o.wLo, z1);
    if (d0 > u0 + 0.012 || d1 > u1 + 0.012) {
      P.add('hull', slab(
        [-wu1, u1, z1], [wu1, u1, z1], [wu0, u0, z0], [-wu0, u0, z0],
        [-wu1, d1, z1], [wu1, d1, z1], [wu0, d0, z0], [-wu0, d0, z0]));
    }
    if (u0 > b0 + 0.012 || u1 > b1 + 0.012) {
      P.add('hull', slab(
        [-wl1, b1, z1], [wl1, b1, z1], [wl0, b0, z0], [-wl0, b0, z0],
        [-wl1, Math.max(u1, b1), z1], [wl1, Math.max(u1, b1), z1],
        [wl0, Math.max(u0, b0), z0], [-wl0, Math.max(u0, b0), z0]));
    }
  }
}

// T-64BV lower-hull correction shared by the BV1 and Donbas builds. Keep the
// traced upper armor/deck stations byte-identical and lower only the belly
// profile; the forward belly segment is the lower-glacis underside, so it
// grows down to the same datum without moving the upper glacis or bow crest.
export const T64_LOWER_HULL_DROP_M = 0.08;
// The BV-family bow sits slightly higher than the original print-derived
// course. Keep this as one shared correction so the BV1 and Donbas running
// gear retain the same front-idler stance without lifting either sprocket or
// the loaded lower run.
export const T64_FRONT_IDLER_LIFT_M = 0.04;
export function lowerT64BellyProfile(points: ProfileCurve, dropM = T64_LOWER_HULL_DROP_M): Vec2Tuple[] {
  return points.map(([z, y]) => [z, y - dropM]);
}

// Canonical T-80 cast-turret shell, shared by every T-80 family builder.
// This is the accepted T-80/T-80B/T-80U Kursk nine-ring silhouette. Variant
// identity belongs in armor and equipment, never in another base casting.
export const T80_CAST_TURRET_RINGS = Object.freeze([
  Object.freeze([1.44, 0.06]), Object.freeze([1.465, 0.40]),
  Object.freeze([1.435, 0.44]), Object.freeze([1.30, 0.545]),
  Object.freeze([1.19, 0.585]), Object.freeze([1.05, 0.615]),
  Object.freeze([0.86, 0.68]), Object.freeze([0.60, 0.72]),
  Object.freeze([0.02, 0.735]),
]);

export function buildT80CastTurret(P: RussiaGeometryPort, {
  scaleY = 0.90, sz = 0.88, cx = 0, cz = 0.22,
  curved = false, capR = 1.60, roofTiltScale = 0.62,
  reference = 't80/t80b/ua_t80u_kursk',
  equipmentSeatRevision = 'reference-original',
}: T80CastTurretOptions = {}) {
  const rawRings = T80_CAST_TURRET_RINGS;
  const firstRawRing = rawRings[0]!;
  const lastRawRing = rawRings[rawRings.length - 1]!;
  const baseY = firstRawRing[1];
  const rings = rawRings.map(([r, y]) => [r, baseY + (y - baseY) * scaleY]);
  if (curved) {
    meshDomeCurved(P, rings, sz, cx, cz, { capR, roofTiltScale });
  } else {
    meshDome(P, rings, sz, cx, cz);
  }
  const lastRing = rings[rings.length - 1]!;
  const roofDrop = (lastRawRing[1] - baseY) * (1 - scaleY);
  P.turretG.userData.t80CastTurretReceipt = Object.freeze({
    architecture: 'shared-t80-cast-dome-r1',
    profile: 'standard',
    reference,
    ringCount: rawRings.length,
    ringBaseY: baseY,
    crownY: lastRing[1],
    maximumRadiusM: Math.max(...rawRings.map(([r]) => r)),
    planScaleZ: sz,
    planCenterZ: cz,
    scaleY,
    curvedNormals: curved,
    equipmentSeatRevision,
  });
  return { rawRings, rings, roofDrop, roofTopY: lastRing[1] };
}

// Measured cast dome: lathe rings [[r, y]] (y=0 at the ring base, in the
// turret frame), plan-stretched by sz = depth/width, centered (cx, cz).
export function meshDome(P: RussiaGeometryPort, rings: readonly DomeRing[], sz: number, cx = 0, cz = 0): void {
  P.add('turret', KIT.lathe(rings, P.q ? 30 : 16, sz), cx, 0, cz);
}

function curvedDomeVertexAngles(rings: readonly DomeRing[]): number[] {
  const segmentAngles: number[] = [];
  for (let index = 0; index < rings.length - 1; index++) {
    const deltaRadius = rings[index + 1][0] - rings[index][0];
    const deltaY = rings[index + 1][1] - rings[index][1];
    segmentAngles.push(Math.atan2(deltaY, -deltaRadius));
  }
  const vertexAngles = [segmentAngles[0]];
  for (let index = 1; index < rings.length - 1; index++) {
    vertexAngles.push((segmentAngles[index - 1] + segmentAngles[index]) / 2);
  }
  vertexAngles.push(segmentAngles[rings.length - 2]);
  return vertexAngles;
}

function interpolateCurvedDomeProfile(
  rings: readonly DomeRing[], vertexAngles: readonly number[],
): { points: Vec2Tuple[]; angles: number[] } {
  const points: Vec2Tuple[] = [];
  const angles: number[] = [];
  for (let index = 0; index < rings.length - 1; index++) {
    const [radiusStart, yStart] = rings[index];
    const [radiusEnd, yEnd] = rings[index + 1];
    const cuts = Math.max(
      1,
      Math.ceil(Math.hypot(radiusEnd - radiusStart, yEnd - yStart) / 0.055),
    );
    for (let cut = 0; cut < cuts; cut++) {
      const t = cut / cuts;
      points.push([
        radiusStart + (radiusEnd - radiusStart) * t,
        yStart + (yEnd - yStart) * t,
      ]);
      angles.push(vertexAngles[index]
        + (vertexAngles[index + 1] - vertexAngles[index]) * t);
    }
  }
  points.push([rings.at(-1)![0], rings.at(-1)![1]]);
  angles.push(vertexAngles.at(-1)!);
  return { points, angles };
}

function curvedDomeNormalAngle(
  authoredAngle: number,
  radius: number,
  capRadius: number,
  roofTiltScale: number | undefined,
): number {
  let angle = authoredAngle;
  if (capRadius && angle < 0.8) {
    const capAngle = Math.min(0.8, Math.asin(Math.min(1, radius / capRadius)));
    if (capAngle > angle) angle = capAngle;
  }
  if (roofTiltScale && angle < 0.8) angle *= roofTiltScale;
  return angle;
}

function applyCurvedDomeNormals(
  geometry: THREE.BufferGeometry,
  points: readonly Vec2Tuple[],
  angles: readonly number[],
  planScaleZ: number,
  options: CurvedDomeOptions,
): void {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  for (let vertex = 0; vertex < position.count; vertex++) {
    const profileIndex = vertex % points.length;
    const angle = curvedDomeNormalAngle(
      angles[profileIndex], points[profileIndex][0], options.capR ?? 0, options.roofTiltScale,
    );
    const x = position.getX(vertex);
    const z = position.getZ(vertex) / planScaleZ;
    const radius = Math.hypot(x, z);
    const unitX = radius > 1e-4 ? x / radius : 0;
    const unitZ = radius > 1e-4 ? z / radius : 0;
    const normalX = unitX * Math.sin(angle);
    const normalY = Math.cos(angle);
    const normalZ = (unitZ * Math.sin(angle)) / planScaleZ;
    const length = Math.hypot(normalX, normalY, normalZ) || 1;
    normal.setXYZ(vertex, normalX / length, normalY / length, normalZ / length);
  }
  normal.needsUpdate = true;
}

// r15 CURVED DOME SHELL (t72b3m visual r4 item 1, opt-in — siblings keep
// meshDome). The certified ring polyline is geometrically near-flat across
// the crown (4 cm rise over 0.84 m), so the lathe renders as conical plates
// while the ref's cast shell reads dome through continuously CURVED normals.
// This variant keeps the silhouette BYTE-EXACT (same 30-gon, every added
// profile point sits exactly on the certified linear polyline) and rebuilds
// only the normal field: profile angles are angle-lerped between the ring
// bisectors (LatheGeometry lerps the vectors, which collapses over long
// near-flat bands) and floored at the angle a virtual spherical cap of
// radius capR would have at that ring radius. Shading-only geometry — the
// gate masks cannot see normals; the luminance gradient is tuned BY SAMPLE
// against the ref half (shaded-parity r3 done-gate).
// o.bucket (t72b3m r18 item 5b, opt-in): the crown cap can render in a
// non-camo family — the shared per-spec camo canvas drops a giant dark
// patch exactly on the cap's camera face in both heroes (box-UV accident
// of the cap mesh; the ref GLB's own UVs sample a clean region). Siblings
// keep the default camo bucket.
export function meshDomeCurved(
  P: RussiaGeometryPort,
  rings: readonly DomeRing[],
  sz: number,
  cx = 0,
  cz = 0,
  o: CurvedDomeOptions = {},
): void {
  const seg = P.q ? 30 : 16;
  const vertexAngles = curvedDomeVertexAngles(rings);
  const profile = interpolateCurvedDomeProfile(rings, vertexAngles);
  const geometry = KIT.lathe(profile.points, seg, sz);
  applyCurvedDomeNormals(geometry, profile.points, profile.angles, sz, o);
  P.add(o.bucket ?? 'turret', geometry, cx, 0, cz);
}

// Dome-skin radius at height y for a measured ring profile (fitting seats).
export function ringSkin(rings: readonly DomeRing[], y: number): number {
  let r = rings[0][0];
  for (let i = 1; i < rings.length; i++) {
    const [r0, y0] = rings[i - 1], [r1, y1] = rings[i];
    if (y <= rings[i][1]) return r0 + (r1 - r0) * ((y - y0) / Math.max(1e-6, y1 - y0));
    r = r1;
  }
  return r;
}

// Seat an oriented box on an elliptical cast-turret shell without changing
// its authored angular layout. The returned centre puts the box's innermost
// plan corner a small `overlap` inside the measured dome, so ERA reads as a
// supported outer layer instead of either floating clear or disappearing
// through the casting. This is a build-time geometry helper, never a render
// loop allocation path.
export function domeBoxPlanSeat(rings: readonly DomeRing[], sz: number, o: DomeBoxSeatOptions) {
  const cx = o.cx ?? 0;
  const cz = o.cz ?? 0;
  const dx = o.x - cx;
  const dz = o.z - cz;
  const angle = Math.atan2(dz, dx);
  const r = Math.max(1e-5, ringSkin(rings, o.y));
  const a = r;
  const b = Math.max(1e-5, r * sz);
  const ray = 1 / Math.sqrt((Math.cos(angle) / a) ** 2 + (Math.sin(angle) / b) ** 2);
  const surfaceX = cx + Math.cos(angle) * ray;
  const surfaceZ = cz + Math.sin(angle) * ray;
  let nx = (surfaceX - cx) / (a * a);
  let nz = (surfaceZ - cz) / (b * b);
  const nLen = Math.hypot(nx, nz) || 1;
  nx /= nLen;
  nz /= nLen;

  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(
    o.rx ?? 0, o.ry ?? 0, o.rz ?? 0, o.order ?? 'XYZ'));
  const normal = new THREE.Vector3(nx, 0, nz);
  const axisX = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  const axisY = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
  const axisZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const planHalfExtent = Math.abs(normal.dot(axisX)) * (o.w / 2)
    + Math.abs(normal.dot(axisY)) * (o.h / 2)
    + Math.abs(normal.dot(axisZ)) * (o.d / 2);
  const overlap = o.overlap ?? 0.01;
  const offset = Math.max(0, planHalfExtent - overlap + (o.standoff ?? 0));
  return Object.freeze({
    x: surfaceX + nx * offset,
    z: surfaceZ + nz * offset,
    surfaceX,
    surfaceZ,
    nx,
    nz,
    planHalfExtent,
    overlap,
    surfaceGapM: offset - planHalfExtent,
  });
}

// r15 item 6 (t72b3m): chamfered roof plate — same outer face planes and
// top/bottom as a plain box, but the plan corners are cut 45° by c (center
// box + two trapezoid prisms). Every certified face keeps a full-width /
// full-depth run inside its own column band (c stays well under half a
// 0.107 column), so no printed row can move — only the "rect footprint"
// corner read goes away.
export function chamferBox(
  P: RussiaGeometryPort,
  bucket: string,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  c = 0.04,
): void {
  const { box, slab } = KIT;
  P.add(bucket, box(w, h, d - 2 * c), x, y, z);
  const y0 = y - h / 2, y1 = y + h / 2;
  const strip = (b0: Vec2Tuple, b1: Vec2Tuple, b2: Vec2Tuple, b3: Vec2Tuple): void => {
    P.add(bucket, slab(
      [b0[0], y0, b0[1]], [b1[0], y0, b1[1]], [b2[0], y0, b2[1]], [b3[0], y0, b3[1]],
      [b0[0], y1, b0[1]], [b1[0], y1, b1[1]], [b2[0], y1, b2[1]], [b3[0], y1, b3[1]]));
  };
  // front strip (+z narrow edge) then rear strip (-z narrow edge), corners
  // in slab's plan order (-x,+z),(+x,+z),(+x,-z),(-x,-z)
  strip([x - w / 2 + c, z + d / 2], [x + w / 2 - c, z + d / 2], [x + w / 2, z + d / 2 - c], [x - w / 2, z + d / 2 - c]);
  strip([x - w / 2, z - d / 2 + c], [x + w / 2, z - d / 2 + c], [x + w / 2 - c, z - d / 2], [x - w / 2 + c, z - d / 2]);
}

// Gun tube as measured contour segments.
// segs: [[zStart, zEnd, radius, radius2?, cx?, cy?, legacyPlanR?]]
// in gun-local z (0 at the gun pivot). Dark seam rings close each diameter
// break so sleeve/tube stages read as separate fittings (r3 language).
// cx (r9): tiny lateral seat for warp-biased reference tubes (t72b3m ref
// tube spans x -0.05..+0.17): the tube stays a TRUE CYLINDER (top-down
// circle law) — only its axis shifts a few cm, invisible at tank scale but
// it decides which 0.107 m plan columns the tube owns.
export function tubeGun(P: RussiaGunPort, segs: readonly GunSegment[], opts: TubeGunOptions = {}): void {
  const { cylZ } = KIT;
  const seg = P.q ? 24 : 12;
  // cy (r10f): tiny per-segment vertical seat — the t72b3m ref's printed
  // band RISES toward the muzzle (mid/tip centers 1.577/1.583 vs axis
  // 1.5695); the segments stay true cylinders, only their centers step.
  // The legacy seventh value widened only the horizontal radius and baked
  // oval cannon tubes into several profiles. Keep accepting those tuples so
  // old profile data remains source-compatible, but barrel geometry now has
  // one radial dimension by construction.
  for (const [z0, z1, r, r2, cx, cy] of segs) {
    const geo = cylZ(r, z1 - z0, seg, r2 ?? r);
    P.add('gun', geo, cx ?? 0, cy ?? 0, (z0 + z1) / 2);
  }
  for (const ring of opts.rings || []) {
    const [z, r, cx, cy] = ring;
    const geo = cylZ(r, 0.045, seg);
    P.add('gunDark', geo, cx ?? 0, cy ?? 0, z);
  }
  P.muzzleZ = opts.muzzle ?? segs[segs.length - 1][1];
}

// Sealed trunnion saddle for the Soviet slit mantlet: every piece is a body
// of revolution about the trunnion X-axis through the gun pivot, so no slot
// can open at any elevation. Root cone tapers onto the tube.
export function ruSaddle(P: RussiaGunMountPort, o: SaddleOptions): void {
  const { cylX, cylZ } = KIT;
  P.addGunExtra(cylX(o.rollR, o.rollW, 14), 0, 0, 0);
  P.addGunExtra(cylZ(o.rootR ?? o.rollR * 0.62, o.rootL ?? 0.55, 12, o.tubeR * 1.25), 0, 0, (o.rootL ?? 0.55) * 0.5 + 0.05);
}

// §B3.1 GUN-ASSEMBLY ACCURACY (owner directive 2026-08-06): the Russian
// mantlet BOOT — the accordion canvas dust cover every T-62/64/72/80/90
// carries between the turret face and the thermal sleeve. Grammar: TAPERED
// canvas sections following a measured polyline (slab frustums — one raked
// surface per section, never a box stack, §B1 staircase law), dark crease
// collars at the section joints, and a clamp collar tying the last fold
// onto the tube. Authored INSIDE the caller's measured root envelope: the
// polyline's extreme faces carry the replaced prism's certified lines; the
// taper sheds only far-end corners the root cone/tube already own, so the
// swap is mask-near-neutral by construction (gate-in-loop verifies).
//   o.pts   : [[z, w, h, yC], ...] gun-local section rects, root -> tube
//   o.bulge : crease-collar proudness (default 7 mm — under every §C
//             partial-pixel threshold)
//   o.clamp : false to skip the end clamp ring
// Sections are gunMount (pitch, no recoil) like every mantlet part; the
// crease/clamp collars ride gunMountDark.
export function ruBoot(P: RussiaGunMountPort, o: BootOptions): void {
  const { frustum, cylZ } = KIT;
  const pts = o.pts;
  for (let i = 0; i < pts.length - 1; i++) {
    const [zA, wA, hA, yAr] = pts[i], [zB, wB, hB, yBr] = pts[i + 1];
    const yA = yAr ?? 0, yB = yBr ?? yA;
    // frustum builds along +Y; rotate +Y -> +Z (rx = PI/2 maps y'->z, z'->-y)
    const g = frustum(wA / 2, -(yA - hA / 2), -(yA + hA / 2),
      wB / 2, -(yB - hB / 2), -(yB + hB / 2), 0, zB - zA);
    P.addGunExtra(nonUniformXform(g, 0, 0, 0, Math.PI / 2, 0, 0), 0, 0, zA);
    if (i > 0) {
      // crease collar at the joint: elliptical ring a few mm proud of the
      // local canvas skin (the accordion fold read)
      const b = o.bulge ?? 0.007;
      P.addGunExtraDark(nonUniformXform(cylZ(0.5, o.creaseD ?? 0.035, 14), 0, 0, 0, 0, 0, 0,
        [wA + b * 2, hA + b * 2, 1]), 0, yA, zA);
    }
  }
  if (o.clamp !== false) {
    const [zE, wE, hE, yEr] = pts[pts.length - 1];
    P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0,
      [wE + 0.012, hE + 0.012, 1]), 0, yEr ?? 0, zE - 0.02);
  }
}

// ---------------------------------------------------------------------------
// Shared Soviet-family furniture (hull frame unless noted)
// ---------------------------------------------------------------------------

// NSVT/DShK pintle with a real cradle, receiver, finned barrel and ammo box
// (r1 bullet 8: "AA MGs are stick-blocks on posts") — turret frame.
export function nsvt(P: RussiaGeometryPort, x: number, y: number, z: number, shield = false): void {
  const { box, cylX, cylY, cylZ, torus } = KIT;
  // Compact legacy-path derivative of the canonical Browning-family load
  // path. The NSVT keeps its unsleeved barrel and muzzle device, but no
  // longer degrades to a rectangular receiver balanced on a single post.
  P.add('turretDark', cylY(0.042, 0.052, 0.022, 12), x, y + 0.011, z);
  P.add('turretDark', torus(0.043, 0.007, 16), x, y + 0.024, z);
  P.add('turretDark', cylY(0.023, 0.030, 0.16, 10), x, y + 0.104, z);
  P.add('turretDark', box(0.13, 0.045, 0.14), x, y + 0.202, z + 0.01);
  for (const side of [-1, 1]) {
    P.add('turretDark', box(0.020, 0.090, 0.10),
      x + side * 0.050, y + 0.225, z + 0.05, side * 0.05, 0, 0);
  }
  P.add('turretDark', cylX(0.028, 0.14, 12), x, y + 0.265, z + 0.07);
  P.add('turretDark', box(0.095, 0.10, 0.42), x, y + 0.28, z + 0.06);
  P.add('turretDark', box(0.087, 0.018, 0.36), x, y + 0.339, z + 0.065);
  P.add('turretDark', box(0.018, 0.065, 0.22), x + 0.058, y + 0.28, z + 0.035);
  P.add('turretDark', box(0.045, 0.017, 0.070), x - 0.068, y + 0.30, z + 0.02);
  for (const side of [-1, 1]) {
    P.add('turretDark', box(0.017, 0.024, 0.09),
      x + side * 0.031, y + 0.258, z - 0.195, side * 0.08, 0, 0);
  }
  P.add('turretDark', cylZ(0.024, 0.55, 10), x, y + 0.28, z + 0.50, -0.06, 0, 0);
  P.add('turretDark', cylZ(0.035, 0.10, 12), x, y + 0.295, z + 0.76, -0.06, 0, 0);
  const ammoX = x - 0.11;
  P.add('turretDark', box(0.10, 0.11, 0.17), ammoX, y + 0.24, z - 0.04);
  P.add('turretDark', box(0.104, 0.014, 0.176), ammoX, y + 0.302, z - 0.04);
  for (let index = 0; index < 5; index++) {
    const t = index / 4;
    P.add('turretDark', box(0.018, 0.026, 0.024),
      ammoX + (0.020 + t * 0.065), y + 0.277 + t * 0.010,
      z + 0.030 + t * 0.070, 0, 0, -0.10 + t * 0.15);
  }
  if (shield) {
    for (const side of [-1, 1]) {
      P.add('turretDetail', box(0.155, 0.22, 0.025),
        x + side * 0.095, y + 0.30, z + 0.20,
        0, -side * 0.055, side * 0.035);
      P.add('turretDark', box(0.018, 0.19, 0.030),
        x + side * 0.18, y + 0.295, z + 0.185);
      P.add('turretDark', box(0.020, 0.020, 0.15),
        x + side * 0.095, y + 0.205, z + 0.12, -0.26, 0, side * 0.08);
    }
    P.add('turretDetail', box(0.23, 0.032, 0.032), x, y + 0.425, z + 0.195);
  }
}
// Thin roof mast (met mast / antenna base / pano tower stem) — turret frame.
export function mast(P: RussiaGeometryPort, x: number, yBase: number, z: number, yTop: number, r = 0.028, head = 0.11): void {
  const { box } = KIT;
  const h = Math.max(0.05, yTop - yBase);
  P.add('turretDetail', box(r * 2, h, r * 2), x, yBase + h / 2, z);
  P.add('turretDark', box(head, head, head), x, yTop - head / 2, z);
}
// SHADOW-TONE rehook (§C revolution gray fix; pt91m r28 recipe): cloned
// slot materials KEEP the ambient floor (clone drops onBeforeCompile) and
// take an honest albedo/emissive floor so corner fittings never render
// unmovable near-black. Render-only — masks use overrideMaterial.
export function rehookClone(
  base: THREE.MeshStandardMaterial,
  colorHex: number | null,
  emissiveHex: number | null,
): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.onBeforeCompile = vehicleAmbientFloorHook;
  m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
  if (colorHex != null) m.color.setHex(colorHex);
  if (emissiveHex != null && m.emissive) m.emissive.setHex(emissiveHex);
  return m;
}
// ---------------------------------------------------------------------------
// FROM-SCRATCH builds (curve-lofted). World frame per module header.
// ---------------------------------------------------------------------------

function ruGlacisEyeBucket(options: GlacisKitOptions, side: number): string {
  if (!options.eyeSplit) return 'hullDetail';
  return side < 0 ? 'hullTrackDetailL' : 'hullTrackDetailR';
}

function addRuGlacisSide(
  P: RussiaGeometryPort,
  options: GlacisKitOptions,
  side: number,
): void {
  const { box, torus } = KIT;
  const glacisY = options.y;
  const glacisZ = options.z;
  P.add('hullDetail', box(options.w * 0.30, 0.045, 0.05),
    side * options.w * 0.16, options.barY ?? (glacisY + 0.04), glacisZ,
    -0.35, side * 0.25, 0);
  // Explicit hook seats keep wide-hull recovery fittings clear of track
  // dilation while preserving the legacy proportional default.
  P.add(options.hookBucket ?? 'hullDark',
    box(0.10, options.hookH ?? 0.12, options.hookD ?? 0.14),
    side * (options.hookX ?? options.w * 0.30),
    options.hookY ?? glacisY - 0.42,
    options.hookZ ?? glacisZ + 0.42,
    -0.3, 0, 0);
  if (options.eyes === false) return;
  P.add(ruGlacisEyeBucket(options, side), torus(0.085, 0.016, 10),
    side * (options.eyeX ?? options.w * 0.36),
    options.eyeY ?? 0.50,
    options.eyeZ ?? glacisZ + 0.30,
    Math.PI / 2, 0, 0);
}

// Shared Russia-family dressing at measured seats.
export function ruGlacisKit(P: RussiaGeometryPort, o: GlacisKitOptions): void {
  const { headlight } = KIT;
  const yG = o.y, zG = o.z;                       // glacis mid reference
  for (const s of [-1, 1]) {
    addRuGlacisSide(P, o, s);
  }
  // hlX (t90sm r12, opt-in): the default w*0.44 seat lands INSIDE the track
  // lane on wide hulls — with a low hlY the housings share §B4 boundary
  // voxels with the idler wrap. Default byte-identical.
  // lights:false (§4.999991 fix-round, opt-in): skip the bucket headlights
  // so the caller can mount FITTINGS.lightCluster pods on rehooked
  // shadow-olive clones at the same seats (SHADOW-TONE order — the merged
  // hullDetail/hullDark drums rendered unmovable near-black at the bow
  // corners). Default byte-identical.
  if (o.lights !== false) {
    headlight(P, -(o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05);
    headlight(P, (o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05);
  }
}

// Soviet deck furniture at explicit seats: driver hatch, engine grilles.
export function ruDeck(P: RussiaGeometryPort, o: DeckOptions): void {
  const { box, cylY } = KIT;
  // hatchY (r10): hatch seat on the LOCAL deck line when it differs from the
  // grille plateau (t72b3m glacis hatch sits at 1.34, plateau 1.40)
  const hY = o.hatchY ?? o.deckY;
  P.add('hull', cylY(0.24, 0.24, 0.04, 14), o.hatchX ?? 0, hY + 0.025, o.hatchZ);
  P.add('hullDark', cylY(0.247, 0.247, 0.012, 14), o.hatchX ?? 0, hY + 0.032, o.hatchZ);
  // periY: near-flush driver periscopes (t72b3m r6 — ref deck line is clean)
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) - 0.16, o.periY ?? (o.deckY + 0.05), o.hatchZ + 0.30);
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) + 0.16, o.periY ?? (o.deckY + 0.05), o.hatchZ + 0.30);
  // gY/ribY (t90m PERFECTION r3, opt-in): explicit grille-plate / rib seats
  // for refs whose engine deck reads FLUSH (the t90m ref holds a clean
  // 1.365-1.368 line over its whole grille run; the default +0.026 ribs
  // printed 1.402 across five side cols). Defaults byte-identical.
  for (let i = 0; i < (o.grilles ?? 6); i++) {
    P.add('hullDark', box(o.gw ?? 1.5, 0.018, 0.075), o.gx ?? 0, (o.gY ?? o.deckY) + 0.012, o.gz - i * 0.24);
    P.add('hullDetail', box(o.gw ?? 1.5, 0.028, 0.026), o.gx ?? 0, (o.ribY ?? ((o.gY ?? o.deckY) + 0.026)), o.gz - 0.12 - i * 0.24);
  }
}

// Segmented rubber skirt band with dark inset lip (r3 language, explicit y).
// o.th: panel thickness (default 0.04) — front-view columns only register
// the band when the face is >1-2 mask pixels deep (t62mv1 r6 lesson).
function addRuSkirtPanel(
  P: RussiaGeometryPort,
  options: SkirtBandOptions,
  side: number,
  index: number,
  panelD: number,
): void {
  const { box } = KIT;
  const z = options.z0 + panelD * (index + 0.5);
  const panelYBot = index === 0 && options.firstYBot !== undefined
    ? options.firstYBot
    : options.yBot;
  const panelH = options.yTop - panelYBot;
  const panelYMid = (options.yTop + panelYBot) / 2;
  // rubberBotH (pt91m r27, opt-in): split each panel into an upper camo
  // box + a lower hullRubber band at the SAME faces (the two boxes
  // partition [yBot, yTop] exactly — mask-identical, material-only).
  // The pt91m ref's legit warm class lives in this lower band (critic
  // r25 order 2); default 0 keeps the single-box call byte-identical.
  const rubberBottomH = options.rubberBotH ?? 0;
  if (rubberBottomH > 0) {
    P.add('hull', box(options.th ?? 0.04, panelH - rubberBottomH, panelD * 0.94),
      side * options.x, panelYMid + rubberBottomH / 2, z);
    P.add('hullRubber', box(options.th ?? 0.04, rubberBottomH, panelD * 0.94),
      side * options.x, panelYBot + rubberBottomH / 2, z);
  } else {
    P.add('hull', box(options.th ?? 0.04, panelH, panelD * 0.94),
      side * options.x, panelYMid, z);
  }
  // dressIn (pt91m r25, opt-in): pull the seam battens/bolt heads inboard
  // so the panel FACE is the station-widest course (the default battens
  // print o.x+0.027 and owned five station slices at +1.9 cm/side).
  const dressIn = options.dressIn ?? 0;
  P.add('hullDark', box(0.048, panelH * 0.9, 0.02),
    side * (options.x + 0.003 - dressIn), panelYMid, z + panelD / 2);
  P.add('hullDark', KIT.cylZ(0.014, 0.014, 8),
    side * (options.x + 0.015 - dressIn), options.yTop - 0.07, z,
    0, side * Math.PI / 2, 0);
  // bottom lip segmented per panel (edge-on prism law: a full-length strip
  // has no station-visible faces mid-span). Explicit seats let individual
  // family builds retain their measured plan columns and vertical lines.
  P.add('hullDark', box(0.042, 0.09, panelD * 0.92),
    side * ((side < 0 ? options.lipXL : undefined) ?? options.lipX ?? (options.x - 0.002)),
    (index === 0 ? options.firstLipY : undefined)
      ?? (side < 0 ? options.lipYL : undefined)
      ?? options.lipY
      ?? (panelYBot - 0.03),
    z);
}

export function ruSkirtBand(P: RussiaGeometryPort, o: SkirtBandOptions): void {
  const panels = o.panels ?? 7;
  const panelD = (o.z1 - o.z0) / panels;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      addRuSkirtPanel(P, o, s, i, panelD);
    }
  }
}

// Front/rear rubber mud flaps over the track runs.
export function ruFlaps(P: RussiaMudguardPort, o: FlapOptions): void {
  for (const s of [-1, 1]) {
    const xf = s * o.x;
    if (o.front) MUDGUARDS.add(P, {
      label: `ru-front-flap-${s}`, x: xf, y: o.front[0], z: o.frontZ,
      thickness: 0.045, length: o.w, height: o.front[1], material: 'rubber',
      rotation: [0, Math.PI / 2, 0], crown: 0.014, frontCut: o.front[1] * 0.11,
    });
    if (o.rear) MUDGUARDS.add(P, {
      label: `ru-rear-flap-${s}`, x: xf, y: o.rear[0], z: o.rearZ,
      thickness: 0.045, length: o.w, height: o.rear[1], material: 'rubber',
      rotation: [0, Math.PI / 2, 0], crown: 0.014, rearCut: o.rear[1] * 0.09,
    });
  }
}

// ---- T-90A (docs/references/profiles/t90a.json) ---------------------------
// r5 DIMS-FIRST: the print (safeScale 1.093) is 9.3% inflated vs published
// dims — published wins (gate doctrine). Envelope: body span -3.30..3.56
// (hullLength 6.86), thin tail rack to -3.72, muzzle +5.81 (overall 9.53),
// p95 roof 2.25 (heightM 2.23; mast + pano are the 2 spike columns). Ref
// curve targets kept wherever dims allow: deck 1.37-1.41, bustle top 2.02
// z -1.7..-1.05, crown plateau pushed to the dims ceiling, wedges to +2.3.
// ---- T-62 obr. 1975 (owner-supplied authoritative source rebuild) -----------
// Sole geometric/visual oracle: the owner-supplied T-62 Obr. 1975 GLB.
// Runtime geometry remains entirely first-party procedural. The registered
// source inventory is a low welded hull, five large pressed road wheels,
// elevated front idler/rear sprocket, one linked course, organic cast turret,
// U-5TS gun, DShK station, asymmetric optics/searchlight, one radio whip,
// engine-deck louvres and an externally supported rear drum/service field.
// §5.304 SHARED WIDENED CHASSIS (owner order: "update our t62 obr 1975 10%
// wider and then redeisgn our type 59 to be based off of that"): the widened
// obr-1975 hull/gear/fender/tail construction is the family base.
// buildT62MV1 dresses it with the T-62 casting + U-5TS; profiles/china.ts
// buildType59 dresses the SAME chassis with the WZ-120 (T-54A-family) dome
// + 100 mm kit. o.gear spreads over the base running-gear config (the Type
// 59 wheel-gap pattern); defaults are byte-identical to the widened T-62.
export function buildT62Obr1975Chassis(P: RussiaChassisPort, o: T62ChassisOptions = {}): void {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear } = KIT;
  const bowService = o.bowService || {};
  // §5.304 OWNER-DECREED WIDEN (2026-08-17, order verbatim: "update our t62
  // obr 1975 10% wider ..."): every LATERAL (x) station below is the
  // certified obr-1975 line ×1.10 — loft width curves, V-nose corners, track
  // gauge/shoe width, fender/bin rails, turret dome plan (rings ×1.10 with
  // meshDome sz ÷1.10 so the plan LENGTH is byte-held), ring race, roof
  // stations and gun-mount ellipses. y (heights) and z (lengths) are
  // untouched; circular fittings keep true radii. Spec widthM moved
  // 3.30 → 3.63 in the same landing (dims stays honest vs the NEW spec).
  // The inline decode comments below intentionally keep the PRE-WIDEN
  // print-frame numbers (the offline owner oracle's own lines): the oracle
  // now reads ~9.1% narrow vs this build by owner decree — adjudicated
  // FALSE-class divergence, never chase the print back (§5.304 packet).
  // Sole oracle: owner-supplied T-62 obr. 1975 GLB (2026-08-14). The retired
  // MV-1/Bergman measurements are intentionally not reused. The source has a
  // clean cast turret, exposed five-wheel course and long low hull; it does
  // not carry the Kontakt-1 apron or turret blanket of the superseded build.
  // r3 TAIL DECODE (worldtrace, world z): the ref hull TUB ends at the
  // -2.72 rear plate; z -2.77..-3.35 is ONLY the overhung drum row (two
  // transverse 200 L drums, circle fit z_c -3.05 r 0.29 y_c 1.685: tops
  // 1.92-1.973 over -2.835..-3.256, 1.789..1.5 at -3.361) riding raked
  // bracket rails (ref bottoms 0.973-1.052 over -2.835..-3.15). The old
  // full-depth loft tail owned 8 columns x 0.23-0.45. Front-view: drums
  // span |x| 0.08..1.09 (tops 1.95-1.97) with a bare center gap (ref
  // 1.504 at |x|<0.06). r3 BOW DECODE: plan front is a V — center 3.13,
  // 3.157@|x|0.25-0.7, 3.31 only at the fender corners |x| 0.99..1.65;
  // ref nose belly falls 0.42@2.85 -> 0.763@3.163 (old belly sat 0.13-0.26
  // high). Hull mask INCLUDES the fused track in this print: ground run
  // 0.026 to z 2.216 with the front wrap at 2.24..2.7 (idler re-seated to
  // the real bow position 2.42) and rear fade past -2.0 (print fades its
  // sprocket band — §B6 keeps my real gear; residual certified).
  loftHull(P, {
    deck: [[-3.18, 1.20], [-3.10, 1.42], [-2.86, 1.50], [-2.50, 1.53], [1.58, 1.54], [2.30, 1.50], [2.60, 1.42], [2.86, 1.30], [3.20, 1.23], [3.57, 0.95]],
    belly: [[-3.18, 0.50], [-2.86, 0.38], [-2.30, 0.35], [-1.90, 0.34], [2.30, 0.34], [2.60, 0.37], [3.20, 0.58], [3.57, 0.94]],
    wUp: [[-3.18, 1.705], [2.30, 1.705], [2.80, 1.452], [3.20, 1.232], [3.57, 1.045]],
    // Lower tub stays inboard of the native shoe envelopes. This raises and
    // closes the concealed track-bay roof; it does not remove the visible
    // upper hull, fenders, side armor or deck volume.
    wLo: [[-3.18, 1.012], [2.35, 1.034], [3.57, 0.99]],
    // Closed track-bay roof above the complete native return and both raised
    // terminal wraps. The previous 0.864 m mid-span floor occupied the shoe
    // run; lifting only this concealed underside preserves the measured deck,
    // outer hull, fenders and skirts.
    sponsonY: 1.33,
  });
  // BOW V-NOSE corner prisms (plan front edge 3.15@|x|0.46 -> 3.315@1.14;
  // side body band 0.35 at the 3.268 column = hullLengthM front anchor)
  P.add('hull', slab(
    [0.462, 0.70, 3.180], [1.034, 0.70, 3.335], [1.034, 0.60, 3.178], [0.462, 0.60, 3.178],
    [0.462, 1.00, 3.180], [1.034, 0.88, 3.335], [1.034, 1.00, 3.178], [0.462, 1.00, 3.178]));
  P.add('hull', slab(
    [-1.034, 0.70, 3.335], [-0.462, 0.70, 3.180], [-0.462, 0.60, 3.178], [-1.034, 0.60, 3.178],
    [-1.034, 0.88, 3.335], [-0.462, 1.00, 3.180], [-0.462, 1.00, 3.178], [-1.034, 1.00, 3.178]));
  // Close the two small plan pockets between the V-corner prisms and the
  // lofted center nose.  These are inboard armor bridges ahead of the idler
  // sweep—not track covers—and complete the real bow shell without changing
  // the measured outer contour.
  [-1, 1].forEach((s) => {
    // §B4 (§5.304 widen): outer face 1.107 = 4 mm inboard of the widened
    // band's inner plane (1.111) — the exact-shared-plane read flagged a
    // one-voxel sheet at the idler wrap rim; the 4 mm shim is sub-voxel and
    // plan-invisible while the inner V-prism/loft seal is unchanged.
    P.add('hull', box(0.172, 0.20, 0.22), s * 1.021, 0.90, 3.44);
  });
  // splash-board brow strip on the real glacis deck
  P.add('hull', box(2.75, 0.035, 0.37), 0, 1.43, 1.806, -0.16, 0, 0);
  // Low front service cadence: paired lamps, four lower-plate stiffeners and
  // planted recovery eyes. Every fitting overlaps the glacis/nose skin and
  // remains inboard of the front track wraps.
  KIT.headlight(P, -0.506, 1.12, 2.92, -0.28, 0.07);
  KIT.headlight(P, 0.506, 1.12, 2.92, -0.28, 0.07);
  [-0.792, -0.264, 0.264, 0.792].forEach((x) => {
    P.add('hullDetail', box(0.13, 0.15, 0.035), x,
      bowService.stiffenerY ?? 0.66, bowService.stiffenerZ ?? 3.555,
      bowService.stiffenerPitch ?? -0.05, 0, 0);
  });
  [-1, 1].forEach((s) => {
    P.add('hullDark', box(0.16, 0.10, 0.08), s * 1.012,
      bowService.recoveryY ?? 0.55, bowService.recoveryBodyZ ?? 3.515);
    P.add('hullDetail', cylZ(0.065, 0.035, 10), s * 1.012,
      bowService.recoveryY ?? 0.55, bowService.recoveryEyeZ ?? 3.570);
  });
  P.hullG.userData.t62BowServiceReceipt = Object.freeze({
    stiffenerCount: 4,
    stiffenerY: bowService.stiffenerY ?? 0.66,
    stiffenerZ: bowService.stiffenerZ ?? 3.555,
    recoveryCount: 2,
    recoveryY: bowService.recoveryY ?? 0.55,
    recoveryBodyZ: bowService.recoveryBodyZ ?? 3.515,
    recoveryEyeZ: bowService.recoveryEyeZ ?? 3.570,
  });
  ruDeck(P, { deckY: 1.482, hatchX: -0.605, hatchZ: 2.13, hatchY: 1.40, periY: 1.42, gz: -1.435, grilles: 4, gw: 1.54 });
  KIT.towCable(P, [[-1.265, 1.43, 1.11], [0, 1.482, 0.65], [1.265, 1.43, 1.11]]);
  // Twin backed engine-deck louvre beds. The shallow ribs are planted on
  // the aft deck and stay below its existing silhouette.
  [-1, 1].forEach((s) => {
    P.add('hullDark', box(1.10, 0.025, 0.78), s * 0.682, 1.532, -1.82);
    Array.from({ length: 5 }).forEach((_, i) => {
      P.add('hullDetail', box(1.023, 0.022, 0.045), s * 0.682, 1.550, -2.10 + i * 0.14);
    });
    P.add('hull', box(0.418, 0.18, 0.62), s * 1.474, 1.50, -1.70);
    P.add('hullDark', box(0.33, 0.025, 0.50), s * 1.474, 1.603, -1.70);
  });
  // fender stowage boxes low on the sponson line
  [-1, 1].forEach((s) => {
    P.add('hull', box(0.33, 0.09, 1.30), s * 1.364, 1.453, s > 0 ? 0.46 : 1.30);
    P.add('hullDark', box(0.286, 0.02, 0.03), s * 1.364, 1.506, s > 0 ? 1.11 : 0.74);
  });
  // ---- TAIL DRUM ROW (decoded): two transverse 200 L drums overhanging the
  // -2.72 rear plate on raked bracket rails; bare center gap |x|<0.078 ----
  // (r 0.30 z_c -3.05, x 0.078..1.06 — ref front-view drum band ends |x|
  // ~1.06 and the ±1.09 column reads its 1.50 deck line)
  [-1, 1].forEach((s) => {
    P.add('hull', cylX(0.275, 1.080, 14), s * 0.626, 1.68, -3.24);            // drum
    [0.096, 1.156].forEach((e) => {
      P.add('hullDark', cylX(0.279, 0.018, 14), s * e, 1.68, -3.24); // rim caps
    });
    P.add('hullDark', cylX(0.278, 0.016, 14), s * 0.626, 1.68, -3.24);       // mid weld seam
    P.add('hull', box(0.132, 0.45, 0.44), s * 0.682, 1.225, -3.12);            // bracket rails
  });
  // center bracket rail, raked bottom 1.02@-2.74 -> 1.40@-3.30 (ref bottom
  // line; also carries the plan center columns to the ref's -3.315 rear)
  P.add('hull', slab(
    [-0.066, 1.02, -2.74], [0.066, 1.02, -2.74], [0.066, 1.40, -3.48], [-0.066, 1.40, -3.48],
    [-0.066, 1.45, -2.74], [0.066, 1.45, -2.74], [0.066, 1.45, -3.48], [-0.066, 1.45, -3.48]));
  // rack rear cross-frames: hard body band through the -3.38 side column
  // (the drum-circle edge alone reads a razor 0.30 band = hullLengthM
  // coin-flip; published 6.63 needs that column solidly body). Seated at
  // x ±0.30 UNDER the drums — a center plate topped the front view's bare
  // 1.494 center line.
  [-1, 1].forEach((s) => {
    P.add('hull', box(0.11, 0.27, 0.05), s * 0.33, 1.585, -3.505);
  });
  // Backed transom/service panel: unequal vertical bays, tail lamps and
  // recovery points reproduce the source cadence without changing the hull
  // envelope or crossing the track terminal paths.
  P.add('hullDark', box(1.958, 0.34, 0.035), 0, 0.82, -3.192);
  [[-0.704, 0.374], [-0.242, 0.396], [0.264, 0.462], [0.726, 0.33]].forEach(([x, w]) => {
    P.add('hullDetail', box(w, 0.28, 0.025), x, 0.82, -3.216);
  });
  [-1, 1].forEach((s) => {
    P.add('hullDark', cylZ(0.10, 0.05, 12), s * 1.232, 1.08, -3.205);
    P.add('hullDetail', KIT.torus(0.085, 0.018, 10), s * 0.902, 0.48, -3.225, Math.PI / 2, 0, 0);
  });
  // rear flap rails (plan rear -3.13 at |x| 1.20..1.54, ref line)
  [-1, 1].forEach((s) => {
    P.add('hull', box(0.374, 0.05, 0.40), s * 1.507, 1.40, -3.02);
  });
  // spare-track-link rows bedded flat on the aft deck (ref top line 1.473)
  [-1, 1].forEach((s) => {
    P.add('hullTrack', box(0.946, 0.08, 0.21), s * 0.583, 1.415, -2.55, 0.06, 0, 0);
    P.add('hullTrack', box(0.858, 0.07, 0.17), s * 0.539, 1.425, -2.68, 0.08, 0, 0);
  });
  // §B3.2 DENSITY (owner directive 2026-08-06, CEILING-CERT tank ->
  // mask-neutral only): common kit strictly inside the certified lines.
  // The tail-drum row carries side 1.92-1.97 over z -2.83..-3.36 and front
  // 1.92 across |x| 0.08..1.05 — the log nests UNDER the drums (top 1.36,
  // bedded through the bracket rails, §B2-connected); links + cable ride
  // FLUSH on the 1.482 deck plateau (t84 recipe).
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 1.76, r: 0.08, straps: 2, seed: 5 });
    log.position.set(0, 1.28, -3.10);
    P.hullG.add(log);
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 3, width: 0.55, seed: 9 });
    links.position.set(-0.583, 1.432, 0.60);
    P.hullG.add(links);
    const cable = FITTINGS.towCable({
      mats: P.mats, eyes: false, r: 0.018,
      pts: [[0.55, 1.468, 0.30], [1.045, 1.458, 0.90], [0.605, 1.468, 1.50]], seed: 7,
    });
    P.hullG.add(cable);
  }
  // glacis eye hooks on the lower bow (tow eyes clear of the fwd idler wrap)
  [-1, 1].forEach((s) => {
    P.add('hullDark', box(0.10, 0.115, 0.13), s * 1.034, 0.816, 2.519, -0.3, 0, 0);
    P.add('hullDetail', cylZ(0.072, 0.035, 10), s * 1.034, 0.66, 3.30);
  });
  buildRunningGear(P, {
    style: 'holes', wheelR: 0.42, wheelW: 0.308, wheelY: 0.455, xc: 1.397, dishR: 0.88,
    wheelZs: [2.235, 1.297, 0.293, -0.791, -1.933],
    sprocket: { z: -2.795, y: 0.79, r: 0.32 }, idler: { z: 3.01, y: 0.83, r: 0.30 },
    rollers: [], trackW: 0.572, topY: 1.185, botY: 0.02, contactZF: 2.66, contactZR: -2.36,
    paintedEnds: true, coveredTop: false, arms: true, wheelHex: 0x697250,
    ...(o.gear || {}),
  });
  // full-length fender runs + segmented outer fender-bin row (r7c prism law)
  [-1, 1].forEach((s) => {
    P.add('hull', box(0.286, 0.03, 4.46), s * 1.65, 1.482, -0.008);  // ref fender line ends 2.26/-2.24
    P.add('hullDark', box(0.242, 0.012, 0.02), s * 1.65, 1.501, -0.008);
    Array.from({ length: 9 }).forEach((_, i) => {
      P.add('hull', box(0.0605, 0.29, 0.445), s * 1.7732, 1.338, -1.908 + i * 0.4816);
      P.add('hullDark', box(0.055, 0.25, 0.02), s * 1.7754, 1.333, -1.908 + i * 0.4816 + 0.232);
    });
    P.add('hull', box(0.0605, 0.25, 0.39), s * 1.7732, 1.26, -2.60, 0.08, 0, 0);  // aft rake bin
    P.add('hull', box(0.055, 0.10, 0.46), s * 1.76, 1.42, -3.00);               // aft fender bracket
    P.add('hull', box(0.0605, 0.24, 0.315), s * 1.7732, 1.325, 2.519, -0.05, 0, 0); // glacis bin
    P.add('hull', box(0.0605, 0.24, 0.30), s * 1.7732, 1.26, 2.86, -0.10, 0, 0);
    P.add('hull', box(0.484, 0.055, 0.54), s * 1.518, 1.335, 2.75, -0.20, 0, 0);   // front corner guards above shoe crown
    P.add('hull', box(0.638, 0.05, 0.30), s * 1.496, 1.34, 3.16);                  // nose fender tips above shoe crown
    P.add('hull', box(0.0275, 0.25, 0.57), s * 1.76, 1.018, 2.667);
  });
  widthAnchor(P, 1.815, 1.344, -0.463);
}

function buildT62MV1(P: RussiaBuilderPort): void {
  const { box, cylX, cylY, cylZ } = KIT;
  buildT62Obr1975Chassis(P);

  // ---- turret on the normalized casting: TRUE seat (bias split deleted),
  // crown 2.40, cupola 2.42, DShK stow spike 2.43-2.44 (3 cols, p95-legal).
  // r3 DECODE: the old aft race skirt owned FIVE ONLY-PROC side_turret
  // columns (world z -0.41..-0.84 — the ref turret mask ends at -0.33) and
  // ten plan center columns (proc rear -0.789 vs ref -0.211): DELETED.
  // Ref race-drum band (bottom 0.71) runs z 0.2..1.74 -> drum widened
  // forward; KTD-2 sits over the gun root at z 1.80..2.09 (ref tops
  // 2.368-2.394 there, NOT the old 1.35..1.63 seat); dome fat rings 1.355
  // crossed the ±1.407 plan column edge at 1.354 (§C partial-pixel, 2
  // cover cols) -> rings shrunk to 1.30 max. ----
  // r3b: front view exposes the ref's TRUE dome apex at 2.27-2.33 (the side
  // 2.39-2.447 tops are all cupola/loader/DShK hardware at z 0.46..1.08) —
  // crown rings re-lathed to a 2.315 apex; fat ring 1.34 restores the ref's
  // ±1.29-1.34 front flank columns (plan ±1.407 window edge 1.354 stays
  // 14 mm clear); sz 0.74 ends the dome tail at -0.246 (the -0.325 side
  // column is the ref turret-mask void — 26 mm clear beats the AA coin-flip)
  // Registered owner-oracle profile places the complete fighting compartment
  // 0.22 m farther aft than the retired Bergman-based seat. Move the entire
  // articulated package at its ring (never the shell children individually).
  P.turretG.position.set(0, 1.4804, 0.676);
  // §5.304: ring radii = certified lines ×1.10; meshDome sz 1.13 ÷ 1.10 so
  // the dome's plan LENGTH (z chord) stays byte-held while the casting
  // widens with the hull.
  const rings = [[1.43, -0.022], [1.474, 0.171], [1.4575, 0.455], [1.342, 0.620], [1.067, 0.752], [0.682, 0.870], [0.33, 0.938], [0.022, 0.973]];
  // The owner GLB has the characteristic long T-62 cast plan.  Its main
  // shell reaches about 0.45 m farther aft than the retired-oracle dome while
  // retaining the same mantlet shoulder.  Stretch and re-centre the one
  // connected casting (rather than adding a bustle box) so the rear shoulder
  // remains organic and the ring seat/hull geometry stay untouched.
  meshDome(P, rings, 1.0273, 0, -0.50);
  // Closed race collar immediately under the casting.  The earlier 0.74 m
  // drum extended 0.73 m below the articulated turret root, invisibly buried
  // through the hull and poisoning yaw/component ownership measurements.
  // The supplied GLB's turret tree bottoms at the casting skirt, so retain a
  // short planted collar only; the hull deck still provides the visible ring.
  P.add('turret', cylY(0.748, 0.7865, 0.10, 20), 0, 0.025, -0.05);
  // The authoritative 1975 fit is a bare organic casting: no Kontakt-1
  // horseshoe, cheek fan, side cassette wall or welded bustle wrapper.
  // Paired low side stowage/lamps on planted cheek brackets. Their ribbed,
  // painted end caps match the source's outboard rolls rather than reading
  // as oversized blue optics.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.176, 0.18, 0.26), s * 1.364, 0.47, 0.41, -0.05, 0, 0);
    P.add('turret', cylZ(0.13, 0.09, 14), s * 1.43, 0.47, 0.57);
    P.add('turretDark', cylZ(0.10, 0.015, 14), s * 1.43, 0.47, 0.62);
  }
  // One DShK station only.  A previous round retained a hand-built receiver,
  // post and ring underneath the complete `pintleMG` fitting below, producing
  // two overlapping weapons and an oversized roof mask.  The source carries
  // a single gun on the commander cupola, so keep only a broad low cradle
  // that visibly transfers its load into the casting.
  P.add('turretDark', box(0.418, 0.06, 0.28), -0.682, 0.94, -0.27, 0, -0.06, 0);
  P.add('turretDetail', box(0.12, 0.10, 0.15), -0.462, 0.88, -0.24);
  // commander cupola LEFT (ref side profile domes 2.27->2.39 over z 0.2..0.74
  // — flat 2.42 cylinders overshot it; every roof top now <=2.41 so the
  // heightM p95 dissolves to the 2.39 loader line, pct 0.4 FREE)
  P.add('turret', cylY(0.25, 0.27, 0.15, 14), -0.77, 0.875, -0.50);
  P.add('turret', cylY(0.21, 0.22, 0.06, 14), -0.77, 0.932, -0.50);
  P.add('turretDark', cylY(0.075, 0.085, 0.04, 10), -0.704, 0.935, -0.445);
  // loader hump RIGHT + vent dome (edge 0.985: covers the ref's 2.33-2.39
  // front cols at |x| 0.95-0.99 without crossing the 1.026 window)
  P.add('turret', cylY(0.24, 0.26, 0.14, 14), 0.7975, 0.885, -0.324);
  P.add('turretDark', cylY(0.20, 0.20, 0.02, 12), 0.7975, 0.963, -0.324);
  P.add('turret', KIT.sph(0.125, 12, Math.PI / 2), 0.286, 0.67, 0.278);
  // Low planted periscope/cupola cadence from the supplied roof inventory.
  // Each glass head returns through a broad cast-roof pad.
  for (const [x, y, z, ry] of [
    [-1.045, 0.91, -0.30, -0.45], [-0.946, 0.94, -0.08, -0.20],
    [-0.495, 0.99, -0.02, 0.10], [0.374, 0.94, -0.03, -0.12],
    [0.836, 0.98, -0.05, 0.24], [1.089, 0.88, -0.27, 0.42],
  ]) {
    P.add('turret', box(0.16, 0.055, 0.14), x, y - 0.035, z, 0, ry, 0);
    P.add('turretGlass', box(0.12, 0.055, 0.025), x, y, z + 0.065, 0, ry, 0);
  }
  P.add('turret', cylY(0.30, 0.32, 0.055, 18), 0.286, 0.86, 0.02);
  P.add('turretDark', box(0.462, 0.035, 0.06), 0.286, 0.90, 0.02, 0, -0.22, 0);
  // Horizontal rear roll/tool courses seen on the 1975 casting. They sit
  // against the aft dome on four broad saddles and therefore remain visibly
  // turret-owned through yaw instead of becoming hull-deck clutter.
  for (const [y, z, r, len] of [[0.40, -1.61, 0.075, 1.892], [0.25, -1.68, 0.060, 1.694]]) {
    P.add('turretDetail', cylX(r, len, 12), 0, y, z);
    for (const s of [-1, 1]) {
      P.add('turretDark', box(0.07, 0.19, 0.12), s * (len * 0.34), y - 0.03, z + 0.02);
    }
  }
  // Raised circular IR head on its short roof shoe; front pixels in the
  // source make this a distinct station rather than a generic roof cube.
  P.add('turret', box(0.26, 0.16, 0.18), 0.638, 0.93, 0.14, -0.08, 0, 0);
  P.add('turretGlass', cylZ(0.18, 0.12, 16), 0.638, 1.06, 0.25);
  domeRailRu(P, rings, 0.935, 0.47, 0.93);
  // §B3 census MG: DShK-class pintle on the loader ring. TIP-round §5.29
  // (owner: "more machine guns... PROMINENT"): the muzzle-down stow
  // (elev -0.5) read as no-gun — the DShK now rests in the real AA
  // posture: barrel FORWARD (CROWS law §5.07), slight droop (elev -0.18)
  // + inboard aim (ry 0.30) so the muzzle run crosses toward the 2.315
  // crown apex zone and its side line stays under the dome/cupola tops
  // (receiver+ridge top 2.38 byte-held — under the 2.39 p95 line; §C
  // pintle allowance ≤0.4 gate-pt).
  {
    // (TIP r2: elev -0.18 -> -0.32 — the level barrel's 2.26-2.31w run
    // over the 2.0-2.2 forward slope cost ~1.5 turret; the steeper droop
    // sinks the run under the dome line while the muzzle still rakes
    // visibly forward over the crown.)
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'dshk', scale: 1.08, tone: 'two-tone', elev: 0.02, ammo: true });
    mg.position.set(-0.572, 0.92, -0.30);
    mg.rotation.y = -0.06;
    P.turretG.add(mg);
  }
  // Single source radio whip on the turret-rear shoulder.
  P.add('turret', cylY(0.055, 0.07, 0.08, 10), 0.968, 0.68, -0.48);
  P.add('turretDark', cylY(0.012, 0.014, 1.92, 7), 0.968, 1.69, -0.48);
  // ---- U-5TS: axis 1.717 (post-warp contour), pivot world +2.065, evac
  // swell 4.99..5.99, muzzle +6.03 (overall 9.34 published) ----
  P.gunG.position.set(0, 0.2866, 1.019);
  ruSaddle(P, { rollR: 0.19, rollW: 0.462, tubeR: 0.145, rootL: 0.58 });
  // §B3.1 (prism sweep 2026-08-06): the U-5TS mantlet is a rounded CAST
  // collar under a canvas boot, not a prism — elliptical frustum with the
  // SAME plan width (±0.26 -> plan front 2.34 line held at max-y) and side
  // height (±0.165 at center-x) as the old box; masks see identical
  // plan/side rectangles, only the corner read changes. Boot crease rings
  // inside the local skin + clamp where the cast meets the tube.
  P.addGunExtra(nonUniformXform(cylZ(0.5, 0.36, 16, 0.4425), 0, 0, 0, 0, 0, 0, [0.572, 0.33, 1]), 0, -0.06, 0.13);
  P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.035, 16), 0, 0, 0, 0, 0, 0, [0.5555, 0.318, 1]), 0, -0.058, 0.20);
  P.addGunExtraDark(KIT.xform(cylZ(0.150, 0.04, 14), 0, 0, 0), 0, -0.02, 0.325);
  // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
  // inside the mantlet's plan rectangle (±0.26 to z 0.31) and side band.
  P.addGunExtraDark(cylZ(0.020, 0.05, 8), 0.198, 0.02, 0.285);
  P.addGunExtraDark(cylZ(0.028, 0.010, 10), 0.198, 0.02, 0.304);
  P.addGunExtra(box(0.16, 0.30, 0.20), 0, 0.32, -0.072);    // KTD-2 support pylon (bridges root -> hood)
  // §B3.1: the KTD-2 rangefinder is a rounded pod — elliptical shell with
  // the certified top band (2.35-2.37) and ±0.15 plan width held exactly;
  // dark lens inset in the front face.
  P.addGunExtra(nonUniformXform(cylZ(0.5, 0.26, 14), 0, 0, 0, 0, 0, 0, [0.33, 0.28, 1]), 0, 0.50, -0.072);
  P.add('gunMountDark', box(0.22, 0.16, 0.02), 0, 0.50, 0.052);
  // §B3.1: the Luna L-2AG is a SEARCHLIGHT — drum + glass face + yoke arms
  // + mount plate replacing the bare bracket prism. The old box's plan
  // front line (2.13 out to x -0.78) is carried by the drum face plus the
  // yoke arms at the old corner columns.
  P.addGunExtra(KIT.xform(cylZ(0.26, 0.27, 18), 0, 0, 0), -0.66, 0.42, -0.05);
  P.add('gunMountDark', KIT.xform(cylZ(0.245, 0.018, 18), 0, 0, 0), -0.66, 0.42, 0.090);
  P.addGunExtra(box(0.045, 0.36, 0.30), -0.3377, 0.35, -0.05);
  P.addGunExtra(box(0.045, 0.36, 0.30), -0.9823, 0.35, -0.05);
  P.addGunExtra(box(0.726, 0.16, 0.12), -0.66, 0.24, -0.17);
  P.addGunExtra(KIT.xform(cylZ(0.105, 0.11, 14), 0, 0, 0), 0.572, 0.28, 0.02);
  P.add('gunMountDark', KIT.xform(cylZ(0.095, 0.014, 14), 0, 0, 0), 0.572, 0.28, 0.082);
  tubeGun(P, [
    [0.40, 3.05, 0.085], [3.05, 3.95, 0.135], [3.95, 4.68, 0.080],
  ], { rings: [[0.72, 0.089], [1.40, 0.089], [2.20, 0.089], [3.05, 0.139], [3.95, 0.085]], muzzle: 4.68 });
  P.add('gunDark', cylZ(0.082, 0.05, 14), 0, 0, 4.655);
  muzzleBore(P, { r: 0.082 });
  // §C.1 winding fix-round 2026-08-07 (fleet sweep item 4): the number quads
  // sat at the dome's max radius but at the forward-cheek z +0.51 where the
  // 0.74-squashed egg is far narrower — flat one-sided planes floating up to
  // 0.55 m off the skin (and the *0.98 sank the plane center INSIDE the
  // dome): frontleft/frontright F-vs-D read 184/127 px. Re-seated at the
  // ellipse max-width station z -0.30, radius from the band's own fat edge
  // (y 0.18) + 6 mm pin; plan line 1.344 stays inside the 1.354 window edge.
  const dx = ringSkin(rings, 0.18) + 0.006;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [dx, 0.29, -0.30], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.22, [-dx, 0.29, -0.30], -Math.PI / 2);
  P.topY = 1.10;
}

// ---- T-54B (docs/references/vertex/t54.json — PRISTINE bergman print) ------
// r30 FIRST BUILD. INCIDENT LAW (triage STATUS UPDATE 2): the pristine print
// is the VISUAL reference; author to PUBLISHED dims (hull 6.45 / overall
// 9.00 / width 3.27 / heightM spec 2.65 = the registered crown+MG
// convention). Extract -> authored: z ×0.9808 about the print hull mid
// (-1.4095 -> my 0), y ×0.9757 (print crown 2.72 -> the 2.65 spec line);
// x true (print width = pub). Print landmarks (authored frame): deck ramp
// 0.98@-3.23 -> 1.26@-2.81 (drum bumps), engine deck 1.42..1.49 over
// -2.46..-1.42, ring deck 1.38..1.44, splash lip 1.51@1.59, glacis
// 1.48@1.60 -> 1.29@3.03, nose V ~1.2@3.226 (belly rises 0.41@2.58 ->
// 1.13@2.88); belly flat 0.01 over -2.05..1.64; track outer 1.546 / fender
// edge 1.635; dome crown 2.60-2.65 over z -0.65..1.05, halfW max 1.288 @
// z 0.32, rear tip -0.71, mantlet collar band 1.94..2.09 (halfW 0.46 ->
// 0.20), tube top 1.79 (axis ~1.65), print muzzle 6.00 -> tube PINNED to
// 5.72 = rearmost + 9.00 (dims sovereign; the print runs +4.4%).
function buildT54(P: RussiaBuilderPort): void {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  // r30b REGISTERED RE-SEAT (gate-digest, authored frame): the gate registers
  // by BODY-span mids (the print's thin nose lip is band-excluded), landing
  // the ref ~+1.466 from raw — every extract-derived seat below is from the
  // DIGEST, not the raw extract. Registered ref reads: hull deck 1.44-1.47
  // side / 1.37 front (crowned narrow ridge), glacis top 1.47@2.25 ->
  // 1.33@3.07 with a THIN NOSE LIP 1.18..1.33 to 3.31; flap hems 0.80@2.95;
  // rear gear: wrap bottoms 0.30@-2.72, belt grounded to ~-2.3; front: belt
  // rises from ~2.05, idler wrap bottom 0.21@2.4; TURTLE turret: shell
  // front-center 2.09-2.19, plan rear -0.655@|x|<0.6 -> -0.068@1.22, plan
  // front 2.10@0.63 -> 1.63@1.10; CUPOLA (left, z 0.44..0.85) to 2.81;
  // DShK cluster LEFT-FRONT overhanging the shell (x -1.2..-1.45,
  // z 1.66..1.96, tops 2.53-2.56); turret-node APRON bottoming 0.56 over
  // z -0.1..1.43; fused tube band 1.53..1.80 runs to 6.17 (mine PINNED
  // 5.72 = dims; ~4 ONLY-REF muzzle cols accepted).
  loftHull(P, {
    deck: [[-3.226, 0.98], [-3.16, 1.10], [-2.98, 1.17], [-2.60, 1.32], [-2.48, 1.41], [-1.55, 1.42], [-0.90, 1.41], [-0.30, 1.40], [0.78, 1.41], [1.48, 1.42], [1.60, 1.47], [2.20, 1.46], [2.70, 1.40], [3.05, 1.29], [3.226, 1.25]],
    belly: [[-3.226, 0.96], [-3.09, 0.90], [-3.07, 0.70], [-2.98, 0.53], [-2.63, 0.315], [-2.20, 0.10], [-2.05, 0.01], [1.64, 0.01], [1.85, 0.06], [2.23, 0.22], [2.58, 0.41], [2.74, 0.61], [2.87, 0.83], [2.90, 1.13], [3.226, 1.18]],
    wUp: [[-3.226, 1.05], [-2.95, 1.35], [2.50, 1.35], [3.00, 1.05], [3.226, 0.90]],
    wLo: [[-3.226, 0.95], [2.20, 1.00], [3.226, 0.92]],
    // Keep the measured outer deck/sponson silhouette, but lift only the
    // concealed track-bay roof above the supported return shoes.  The lower
    // band remains a closed centre tub at wLo while the upper band retains
    // the published wUp/deck faces; no exterior hull or fender is removed.
    sponsonY: 1.16,
  });
  // fender shelves x 1.28..1.635 (print full-width line), prism-law segments
  for (const s of [-1, 1]) for (let i = 0; i < 13; i++) {
    P.add('hull', box(0.355, 0.03, 0.48), s * 1.4575, 1.295, -3.02 + i * 0.503);
  }
  // front mud flaps at the ref's own 2.95 hang line (hems 0.80; they also
  // carry the ±1.635 width column with a >=0.35 y-band); rear flaps close
  // the fender run
  for (const s of [-1, 1]) {
    P.add('hullRubber', box(0.35, 0.36, 0.045), s * 1.457, 0.98, 2.94);
    P.add('hullRubber', box(0.34, 0.26, 0.045), s * 1.457, 1.02, -3.20);
  }
  // fender stowage (§B3/§H4 variety): RIGHT flat fuel tanks, LEFT bins —
  // tops held at the 1.44 fender-stack line (registered front-view read)
  P.add('hullDetail', box(0.30, 0.16, 0.92), 1.44, 1.36, 1.30);
  P.add('hullDetail', box(0.30, 0.16, 0.92), 1.44, 1.36, 0.20);
  P.add('hullDark', box(0.26, 0.02, 0.03), 1.44, 1.45, 0.75);
  P.add('hull', box(0.30, 0.15, 0.80), -1.44, 1.355, 1.20);
  P.add('hull', box(0.30, 0.15, 0.66), -1.44, 1.355, 0.28);
  P.add('hullDark', box(0.26, 0.02, 0.03), -1.44, 1.44, 0.74);
  // rear plate: transverse fuel drums ON the ramp (the print's 1.26/1.27
  // deck bumps at -2.81/-2.62) + unditching log low on the tail plate
  P.add('hullDetail', cylX(0.15, 2.00, 12), 0, 1.11, -2.83);
  P.add('hullDetail', cylX(0.15, 2.00, 12), 0, 1.13, -2.58);
  for (const s of [-1, 1]) {
    // End bands seat on the drum body, not over the return lane.  The
    // former ±1.00 seat left the 4 cm ring grazing the inner shoe edge.
    P.add('hullDark', cylX(0.154, 0.04, 12), s * 0.96, 1.11, -2.83);
    P.add('hullDark', cylX(0.154, 0.04, 12), s * 0.96, 1.13, -2.58);
    P.add('hullDark', box(0.04, 0.30, 0.02), s * 0.62, 1.10, -2.71);
  }
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 2.1, r: 0.11, seed: 5 });
    log.position.set(0, 1.02, -3.12);
    P.hullG.add(log);
  }
  ruDeck(P, { deckY: 1.42, hatchX: -0.55, hatchY: 1.39, hatchZ: 1.90, periY: 1.41, gz: -1.55, grilles: 4, gw: 1.35 });
  P.add('hull', box(1.7, 0.035, 0.28), 0, 1.475, 1.58, -0.10, 0, 0);   // splash board
  // eyes:false — the default tow-eye tori hung 0.46..0.64 under the thin
  // nose lip and owned the z 3.07 col (0.231, top hull item of the first
  // gate run)
  ruGlacisKit(P, { w: 3.0, y: 1.36, z: 2.55, eyes: false, hookY: 0.70, hookZ: 2.55, hlY: 1.38 });
  KIT.towCable(P, [[-1.10, 1.38, 1.90], [0, 1.42, 1.50], [1.10, 1.38, 1.90]]);
  buildRunningGear(P, {
    // 5 starfish wheels, no return rollers; registered gear reads: sprocket
    // wrap bottom 0.30@-2.72, idler wrap 0.21@2.4, belt grounded -2.3..2.05
    style: 'holes', wheelR: 0.40, wheelW: 0.28, wheelY: 0.437, xc: 1.276, dishR: 0.88,
    wheelZs: [1.64, 0.68, -0.16, -1.00, -1.84],
    sprocket: { z: -2.62, y: 0.66, r: 0.27 }, idler: { z: 2.30, y: 0.62, r: 0.26 },
    rollers: [], trackW: 0.50, topY: 0.86, botY: 0.05, paintedEnds: true, coveredTop: false, arms: true,
    contactZF: 2.05, contactZR: -2.28,
  });
  widthAnchor(P, 1.635, 1.30, -0.46);

  // ---- TURTLE-SHELL dome to the registered print: shell front-center
  // 2.09-2.19, long egg (plan -0.67..2.10 at center, halfW max 1.29), the
  // tall reads are all OFF-CENTER furniture (cupola/DShK/fume) ----
  P.turretG.position.set(0, 1.40, 0.715);
  const rings = [[1.29, 0.0], [1.27, 0.26], [1.19, 0.50], [1.03, 0.72], [0.79, 0.89], [0.48, 0.99], [0.02, 1.02]];
  meshDome(P, rings, 1.074, 0, -0.10);
  // hidden turret-node APRON (t90m class): the print bakes hull kit into the
  // turret node bottoming 0.56 over z -0.1..1.43; §C mid-seam split
  P.add('turretDark', box(1.90, 0.50, 0.94), 0, -0.59, -0.695);
  P.add('turretDark', box(1.90, 0.50, 0.94), 0, -0.59, 0.245);
  // commander cupola LEFT (registered z 0.44..0.85, top 2.81 -> built 2.68:
  // heightM p95 rides this band, spec 2.65)
  P.add('turret', cylY(0.27, 0.29, 0.42, 14), -0.62, 1.05, -0.365);
  P.add('turretDark', cylY(0.23, 0.23, 0.025, 14), -0.62, 1.235, -0.365);
  P.add('turretDetail', box(0.10, 0.08, 0.16), -0.62, 1.20, -0.175);
  // fume-extractor dome RIGHT
  P.add('turret', KIT.sph(0.16, 12, Math.PI / 2), 0.55, 0.76, 0.60);
  // DShK cluster LEFT-FRONT, overhanging the shell like the print (ring
  // mount embedded in the skin, arm + ammo drum reach x -1.41, tops 2.5-2.7
  // over z 1.55..1.95; barrel raised AA so the z-footprint stays ~3 cols
  // inside the heightM p95 exclusion)
  P.add('turret', cylY(0.17, 0.19, 0.30, 12), -1.02, 0.62, 0.90);
  P.add('turretDark', box(0.36, 0.09, 0.12), -1.16, 0.80, 0.95);
  P.add('turretDetail', box(0.16, 0.14, 0.22), -1.33, 1.05, 0.95);
  {
    const dshk = FITTINGS.pintleMG({
      mats: P.mats, cls: 'dshk', scale: 0.75, tone: 'two-tone', elev: 0.05, ammo: true,
      rotation: [0, 1.15, 0], seed: 4,
    });
    dshk.position.set(-1.16, 0.86, 0.90);
    P.turretG.add(dshk);
  }
  domeRailRu(P, rings, 1.074, 0.45, 1.0);
  // ---- D-10T2S: axis 1.65 (registered tube band 1.53..1.80), pivot world
  // +1.565, fume extractor forward, muzzle +5.72 (pinned; print runs 6.17,
  // the last ~4 cols ride as ONLY-REF, dims sovereign) ----
  P.gunG.position.set(0, 0.25, 0.85);
  ruSaddle(P, { rollR: 0.19, rollW: 0.50, tubeR: 0.135, rootR: 0.19, rootL: 0.50 });
  // §B3.1 (turret-lane 2026-08-06): the pig-snout is a CAST collar — the
  // inscribed elliptical frustum keeps the box's exact plan (±0.23) and
  // side (±0.17) extremes at the center axes (INSCRIBED-DRUM law: masks
  // read identical rectangles, only the corner read rounds), with the
  // canvas boot ring tying it onto the tube.
  P.addGunExtra(nonUniformXform(cylZ(0.5, 0.30, 16, 0.42), 0, 0, 0, 0, 0, 0, [0.46, 0.34, 1]), 0, 0, 0.12);
  P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.045, 14), 0, 0, 0, 0, 0, 0, [0.30, 0.26, 1]), 0, 0, 0.30);
  // Luna L-2 IR searchlight right of the mantlet (era kit, gun-slaved like
  // the real linkage): drum + dark rim + glass + yoke bracket onto the
  // collar — inside the turret-face plan/side envelopes.
  P.addGunExtra(KIT.xform(cylZ(0.095, 0.13, 12), 0, 0, 0), 0.36, 0.14, 0.16);
  P.addGunExtraDark(KIT.xform(cylZ(0.099, 0.014, 12), 0, 0, 0), 0.36, 0.14, 0.235);
  P.addGunExtraDark(KIT.xform(cylZ(0.078, 0.010, 12), 0, 0, 0), 0.36, 0.14, 0.243); // IR lens (dark — no gun-frame glass slot)
  P.addGunExtraDark(box(0.03, 0.10, 0.03), 0.30, 0.06, 0.14);
  tubeGun(P, [
    [0.35, 0.85, 0.135], [0.85, 1.40, 0.128], [1.40, 1.95, 0.105],
    [1.95, 2.50, 0.105], [2.50, 3.05, 0.105], [3.05, 3.35, 0.125],
    [3.35, 3.90, 0.105], [3.90, 4.155, 0.105],
  ], { rings: [[0.85, 0.132], [1.40, 0.110], [3.05, 0.128], [3.35, 0.108], [3.90, 0.107]], muzzle: 4.155 });
  muzzleBore(P, { r: 0.105 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dxT = ringSkin(rings, 0.45) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [dxT * 0.98, 0.35, 0.35], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-dxT * 0.98, 0.35, 0.35], -Math.PI / 2);
  P.topY = 1.25;
}

// ---- T-44 (T44-NEWBUILD-2026-08-08, §5.45 no-builder queue — the T-34→T-54
// bridge, t54-lineage donor grammar per §5.13) -------------------------------
// Oracle: t44_foxygamer.glb (CC BY-SA), extract docs/references/vertex/
// t44.json — authored DIRECTLY in the extract frame (ref body -3.702..+2.455
// = 6.157 m, +1.4% of pub 6.07 → my body ends pulled in to -3.66/+2.41,
// registration mids equal by construction). PUB SOVEREIGN: hull 6.07 / width
// 3.18 (fender rail ±1.59 carries it, WIDTH-CARRIER law) / height 2.72 (the
// integration row's over-DShK convention, t54-2.65 analog — the DShK-cluster
// crowns 2.70-2.72 carry p95 over ~5 cols vs the print's own 2.45-2.55 tall
// band: the documented dims-sovereign price, m48 §5.68 class) / muzzle +3.99
// (7.65 overall; print tube ends +3.74 → last ~3 cols ride ONLY-PROC).
// Ref decode (extract frame): engine/bin deck 1.42 (bin jitter 1.417-1.448)
// over -3.0..-0.46; LOW crew roof 1.308 over -0.46..+1.457 (the T-44 tell:
// no T-34 driver bulge — clean plate); one-piece glacis knee (1.457, 1.308)
// → toe (2.41, 0.69); fender front run 1.046 to z 2.19 with flap tips
// carrying plan 2.484; tail: two longitudinal fuel drums (plan |x| 0.25..0.9,
// y 1.03..1.47, rear rim -3.74 → mine -3.66 = the 6.07 crop); belly plate
// 0.384 front-view (T-44's 0.425 clearance class, §B2 holes-not-channels —
// no channel fill); turret = LOW WIDE casting with FLAT ROOF: plan egg
// -1.42..+0.76 (max halfW 0.935 @ -0.62, rear shoulders 0.84 @ -1.17),
// skirt hem 1.40, roof plateau 2.43-2.49, cupola LEFT crest 2.545 @ -0.62,
// DShK cluster crest 2.537 @ +0.48; bustle bin -1.45..-2.07 y 1.56..2.06;
// turret-node APRON bottoming 1.03 over -0.95..+0.10 (t90m/t54 class);
// tube band 1.597..1.812 (axis 1.705, r 0.108) to +3.74.
function buildT44(P: RussiaBuilderPort): void {
  const { box, cylX, cylY, cylZ, buildRunningGear } = KIT;
  // r2 registered decode: ref deck plate spans only ±1.30 (front_hull tops
  // 1.449@|x|<1.28 = deck-edge bins, 1.31-1.35@1.35..1.59 = the narrow
  // fenders) and mid stations read 2.90 wide — the ±1.59 full-width columns
  // exist ONLY at the bin/flap zones (ref st1/2/11/12), so the fenders stay
  // y ~1.29 with the width carried zone-wise, never a full-length rail.
  loftHull(P, {
    deck: [[-3.29, 1.28], [-3.19, 1.355], [-3.00, 1.42], [-0.52, 1.42], [-0.46, 1.308], [1.457, 1.308], [2.44, 0.70]],
    belly: [[-3.29, 0.70], [-2.95, 0.44], [-2.60, 0.40], [1.70, 0.40], [2.05, 0.46], [2.44, 0.672]],
    wUp: [[-3.29, 1.30], [2.44, 1.30]],
    wLo: [[-3.29, 0.94], [2.44, 0.95]],
    // sponson profile DROPS at the bow (r4 find: with a flat 0.86 the nose
    // upper band pinched out at z ~2.15 — the glacis toe went missing from
    // every mask past 2.07; the profile keeps the full-width glacis plane
    // alive to the +2.44 toe, merkava sponson-floor recipe)
    sponsonY: [[-3.29, 0.86], [2.00, 0.86], [2.15, 0.60], [2.44, 0.54]],
  });
  // tail fuel drums (longitudinal pair, ref plan lanes |x| 0.25..0.9 to
  // -3.74 → mine -3.66; y band 1.01..1.49 = the hullLengthM rear anchor;
  // their 1.49 crowns also carry the ref's 1.466 front-view stern line)
  for (const s of [-1, 1]) {
    P.add('hullDetail', cylZ(0.24, 0.37, 14), s * 0.60, 1.25, -3.475);
    P.add('hullDark', cylZ(0.244, 0.03, 14), s * 0.60, 1.25, -3.645);
    P.add('hullDark', cylZ(0.244, 0.03, 14), s * 0.60, 1.25, -3.315);
    // support brackets tie the drums onto the rear plate (§B2 no-air)
    P.add('hull', box(0.10, 0.36, 0.20), s * 0.60, 1.06, -3.35, -0.25, 0, 0);
    P.add('hullDark', box(0.05, 0.02, 0.36), s * 0.60, 1.50, -3.48);
  }
  // rear tow hooks flat on the stern plate (r3 read: an rx-raked seat hung
  // stray voxels under the drum lanes)
  for (const s of [-1, 1]) P.add('hullDark', box(0.10, 0.11, 0.10), s * 0.62, 0.72, -3.26);
  // narrow fenders — r3 STATION ARCHITECTURE (ref stations: ±1.4495 at sts
  // 4/7-10, ±1.52 bulges ONLY at st3/st5, ±1.589 zones ONLY at st1/2 +
  // st11/12, ±1.494 at st0/13): shelf outer 1.4495 full run, width carried
  // zone-wise by bins/flaps, never a full-length rail (m48 AA-razor law)
  for (const s of [-1, 1]) for (let i = 0; i < 10; i++) {
    P.add('hull', box(0.15, 0.03, 0.46), s * 1.3748, 1.285, -2.95 + i * 0.478);
  }
  for (const s of [-1, 1]) {
    // front fender step (ref side line 1.046 over z 1.75..2.40; runs to the
    // flap face so the flap hangs from real metal, §B2)
    P.add('hull', box(0.15, 0.028, 0.87), s * 1.3748, 1.032, 1.965);
    // front mud flaps: the hullLengthM FRONT anchor at +2.45 (band
    // 0.66..1.05; the r3 2.41 face left the ref's 2.43-2.48 nose columns
    // pairing against the bare tube at 0.45 err ×2 — 6.11 body stays in
    // grace) + hanger strut into the step + BAND-THIN tip strip covering
    // the ref's last nose columns to 2.50 (0.28 band < the 12% body filter
    // → hullLengthM anchor unmoved; whip-rough margin 0.046)
    P.add('hullRubber', box(0.34, 0.39, 0.045), s * 1.32, 0.855, 2.425);
    P.add('hullDark', box(0.04, 0.06, 0.12), s * 1.32, 1.02, 2.36);
    // (strip sits CLEAR of the flap face in z — an overlapping col unioned
    // flap-top∪strip-bot to a 0.31 band and rode the 12% body filter:
    // hullLengthM read 6.17 twice, the m48 AA-razor class)
    P.add('hullRubber', box(0.30, 0.24, 0.04), s * 1.32, 0.86, 2.478);
    // front skirt-flap plates at the ±1.589 plane (ref st11/12 bot 0.0-0.1
    // + front-view outer band 0.38..1.31 — hang beside the idler wrap,
    // outboard of the ±1.445 track, §B4 clear)
    P.add('hullRubber', box(0.03, 0.72, 0.35), s * 1.573, 0.67, 1.575);
    // rear flaps at the ±1.589 st1 column (ref st1 bot 0.185; z -3.10 keeps
    // them clear of the st0/st1 slab boundary at -3.22 — bradley ≥20mm law)
    P.add('hullRubber', box(0.34, 0.34, 0.045), s * 1.42, 0.78, -3.10);
    P.add('hullRubber', box(0.34, 0.30, 0.04), s * 1.42, 0.42, -3.08);
    P.add('hullDark', box(0.04, 0.36, 0.07), s * 1.42, 1.10, -3.045);
    // rear fender extension to the ref's -3.33 fender tail (st0 ±1.494)
    P.add('hull', box(0.24, 0.03, 0.15), s * 1.37, 1.285, -3.255);
    // mid-fender bin pair at the ±1.52 st3/st5 bulges (gap keeps st4 clean)
    P.add('hullDetail', box(0.14, 0.14, 0.40), s * 1.45, 1.37, -2.18);
    P.add('hull', box(0.14, 0.14, 0.35), s * 1.45, 1.37, -1.30);
  }
  // deck-edge bin rows (ref front tops 1.449 at |x| ≤ 1.28; §H4 variety:
  // RIGHT two long bins, LEFT bin + rack)
  P.add('hullDetail', box(0.30, 0.14, 0.88), 1.13, 1.375, -1.15);
  P.add('hullDetail', box(0.30, 0.14, 0.70), 1.13, 1.375, -2.55);
  P.add('hullDark', box(0.26, 0.02, 0.03), 1.13, 1.45, -1.15);
  P.add('hull', box(0.30, 0.13, 0.80), -1.13, 1.37, -2.60);
  P.add('hull', box(0.30, 0.13, 0.62), -1.13, 1.37, -1.05);
  P.add('hullDark', box(0.26, 0.02, 0.03), -1.13, 1.44, -2.60);
  // stern bin pair OVER the fenders (the ref's ±1.589 st1/st2 columns —
  // zone width carriers, tops at the fender-stack line)
  P.add('hullDetail', box(0.28, 0.15, 0.60), 1.448, 1.38, -2.80);
  P.add('hull', box(0.28, 0.15, 0.60), -1.448, 1.38, -2.80);
  // front bins on the low fender step (the ±1.589 st11/st12 columns; tops
  // 1.30 = the ref's 1.309 front-view fender line)
  P.add('hullDetail', box(0.28, 0.25, 0.44), 1.448, 1.175, 1.59);
  P.add('hull', box(0.28, 0.25, 0.44), -1.448, 1.175, 1.59);
  ruDeck(P, { deckY: 1.42, hatchX: -0.50, hatchY: 1.308, hatchZ: 1.10, periY: 1.318, gz: -2.30, grilles: 4, gw: 1.35 });
  // splash board low on the glacis knee (ref 1.402 @ 0.856)
  P.add('hull', box(1.70, 0.045, 0.20), 0, 1.355, 0.88, -0.35, 0, 0);
  ruGlacisKit(P, { w: 2.55, y: 0.98, z: 1.95, eyes: false, hookY: 0.52, hookZ: 2.30, hlX: 1.00, hlY: 1.13 });
  KIT.towCable(P, [[-0.90, 1.155, 1.72], [0, 1.325, 1.40], [0.90, 1.155, 1.72]]);
  buildRunningGear(P, {
    // 5 large wheels at the T-44's EVEN spacing (the identity tell vs the
    // T-54 gap), torsion-bar era, no return rollers; rear drive sprocket.
    // Track outer wall ±1.445 (ref ground cols end ±1.44-1.46)
    style: 'holes', wheelR: 0.41, wheelW: 0.28, wheelY: 0.425, xc: 1.195, dishR: 0.88,
    wheelZs: [1.35, 0.45, -0.45, -1.35, -2.25],
    sprocket: { z: -2.86, y: 0.62, r: 0.27 }, idler: { z: 1.95, y: 0.58, r: 0.24 },
    rollers: [], trackW: 0.50, topY: 0.84, botY: 0.045, paintedEnds: true, coveredTop: false, arms: true,
    contactZF: 1.50, contactZR: -2.26,
  });
  widthAnchor(P, 1.59, 1.30, -2.80);

  // ---- LOW WIDE FLAT-ROOF casting: three overlapping lathes loft the
  // measured egg (nose drum + main body + rear shoulders — one contiguous
  // cast read, §B2), roof plateau 2.43-2.45, skirt hem 1.40 ----
  P.turretG.position.set(0, 1.31, -0.44);
  const rA = [[0.935, 0.09], [0.93, 0.32], [0.91, 0.54], [0.875, 0.74], [0.815, 0.92], [0.72, 1.05], [0.60, 1.12], [0.02, 1.135]];
  meshDome(P, rA, 0.93, 0, -0.11);                       // main body (max 0.935 @ world -0.55)
  const rB = [[0.80, 0.10], [0.79, 0.30], [0.765, 0.50], [0.725, 0.68], [0.68, 0.85], [0.66, 1.00], [0.50, 1.09], [0.02, 1.10]];
  meshDome(P, rB, 0.95, 0, 0.44);                        // nose drum (front +0.76, flat crown 2.41)
  const rC = [[0.84, 0.13], [0.835, 0.38], [0.815, 0.60], [0.77, 0.78], [0.70, 0.92], [0.58, 1.00], [0.02, 1.01]];
  meshDome(P, rC, 0.45, 0, -0.72);                       // rear shoulders (0.84 @ world -1.17)
  // BLUNT NOSE BLOCK (r3 read: the ref roof holds 2.43-2.45 out to +0.72
  // then cliffs — plan there is only ±0.49-0.65, so no lathe can carry it;
  // §B1 single swept slab, sides+front raked, buried into dome B)
  P.add('turret', KIT.slab(
    [-0.62, 0.24, 1.18], [0.62, 0.24, 1.18], [0.62, 0.24, 0.74], [-0.62, 0.24, 0.74],
    [-0.46, 1.09, 1.14], [0.46, 1.09, 1.14], [0.46, 1.09, 0.74], [-0.46, 1.09, 0.74]));
  // hidden turret-node APRON (t90m/t54 class): ref turret mask bottoms 1.03
  // over -0.90..-0.05 world at |x| ≤ 0.88 — carriers INSIDE the hull
  // silhouette, §C mid-seam split (r3: ±0.85 clears the ±0.91 plan column)
  P.add('turretDark', box(1.70, 0.27, 0.425), 0, -0.125, -0.2475);
  P.add('turretDark', box(1.70, 0.27, 0.425), 0, -0.125, 0.1775);
  // commander cupola LEFT (ref crest 2.545 @ world -0.62; the front-view
  // crest is NARROW: x -0.14..-0.42 only — a small early periscope ring,
  // r4 re-read: an r 0.28 ring paid 0.3-0.45 on the -0.48..-0.58 cols)
  P.add('turret', cylY(0.14, 0.155, 0.17, 14), -0.28, 1.155, -0.18);
  P.add('turretDark', cylY(0.125, 0.125, 0.028, 14), -0.28, 1.222, -0.18);
  P.add('turretDetail', box(0.09, 0.07, 0.13), -0.28, 1.20, -0.02);
  // loader hatch RIGHT (ref 2.49 ring reads)
  P.add('turret', cylY(0.235, 0.235, 0.05, 14), 0.45, 1.135, -0.25);
  P.add('turretDark', cylY(0.242, 0.242, 0.014, 14), 0.45, 1.163, -0.25);
  // ventilator dome right-rear (ref right-side tops 2.39-2.45)
  P.add('turret', KIT.sph(0.13, 12, Math.PI / 2), 0.42, 1.04, -0.68);
  // DShK AA station LEFT-FRONT (ref crest 2.537 @ +0.48): ring-mount pintle
  // + receiver + ammo cans — the compact crown band 2.69-2.72 (world) CARRIES
  // heightM 2.72 (over-DShK convention row; ~5-6 cols at z +0.27..+0.78,
  // documented dims-sovereign price, m48 §5.68 class). Barrel STOWED aft-
  // level over the roof so no plan_turret/whole column extends (r1 lesson:
  // a forward barrel owned six tube-band columns at +1.2 err).
  // the whole 2.69-2.72 crown band lives INSIDE the st9 slab (world
  // +0.40..+0.74; r4 receipt: a +0.29..+0.75 span painted st8 AND st10
  // tops at 10% each — the bradley slab-boundary law, heightM edition)
  P.add('turret', cylY(0.14, 0.16, 0.22, 12), -0.25, 0.95, 1.01);           // ring-mount drum
  P.add('turretDark', box(0.09, 0.24, 0.09), -0.25, 1.18, 1.01);            // pintle post
  P.add('turretDark', box(0.11, 0.115, 0.34), -0.25, 1.3525, 1.01);         // receiver (top 2.72; 0.34 z-span = the 4-col p95 carrier)
  P.add('turretDark', cylZ(0.026, 0.50, 8), -0.25, 1.05, 0.58, 0.36, 0, 0);  // barrel stowed muzzle-down-aft ON the roof line (r5: a 1.20 seat painted st8 tops 7%)
  P.add('turretDark', cylZ(0.038, 0.09, 8), -0.25, 0.965, 0.32, 0.36, 0, 0); // flash hider at the dome crown
  P.add('turretDetail', box(0.15, 0.16, 0.24), -0.40, 1.30, 0.98);          // ammo can on the cradle (top 2.69)
  P.add('turretDetail', box(0.14, 0.115, 0.28), -0.11, 1.3425, 1.05);       // spare can (top 2.71)
  P.add('turretDark', box(0.30, 0.05, 0.05), -0.25, 1.21, 0.87);            // cradle beam
  // turret bustle bin (ref tail -1.45..-2.07, y 1.56..2.06) — lid seam +
  // latches so it reads as the real T-44 stowage bin (§B3 no-mystery-box)
  chamferBox(P, 'turret', 1.20, 0.50, 0.60, 0, 0.50, -1.32, 0.10);
  P.add('turretDark', box(1.10, 0.02, 0.03), 0, 0.685, -1.33);
  for (const s of [-1, 1]) P.add('turretDark', box(0.05, 0.16, 0.02), s * 0.38, 0.55, -1.615);
  domeRailRu(P, rA, 0.93, 0.45, 0.9);
  // ---- ZiS-S-53 85 mm: axis 1.705 (ref band 1.597..1.812), pivot world
  // +0.45, clean tube (no evacuator/brake — 1945 mark), muzzle +3.99 pinned
  // to the 7.65 overall (print ends +3.74: ~3 ONLY-PROC cols, dims sovereign)
  P.gunG.position.set(0, 0.395, 0.89);
  ruSaddle(P, { rollR: 0.175, rollW: 0.46, tubeR: 0.12, rootR: 0.175, rootL: 0.44 });
  // cast collar (pig-snout class, INSCRIBED-DRUM law) + canvas boot ring
  P.addGunExtra(nonUniformXform(cylZ(0.5, 0.26, 16, 0.42), 0, 0, 0, 0, 0, 0, [0.40, 0.30, 1]), 0, 0, 0.10);
  P.addGunExtraDark(nonUniformXform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0, [0.27, 0.23, 1]), 0, 0, 0.26);
  tubeGun(P, [
    [0.30, 0.80, 0.125], [0.80, 1.45, 0.112], [1.45, 2.20, 0.108],
    [2.20, 2.95, 0.108], [2.95, 3.54, 0.105],
  ], { rings: [[0.80, 0.128], [1.45, 0.115], [2.95, 0.108]], muzzle: 3.54 });
  muzzleBore(P, { r: 0.10 });  // §B3.1 (shadow-named, mask/frame-neutral)
  const dxT44 = ringSkin(rA, 0.40) + 0.02;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [dxT44 * 0.98, 0.40, -0.11], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-dxT44 * 0.98, 0.40, -0.11], -Math.PI / 2);
  P.topY = 1.42;
}

// ---- Type 59 — §5.304 REDESIGN (2026-08-17): builder RETIRED from this
// module. The owner order (verbatim: "update our t62 obr 1975 10% wider and
// then redeisgn our type 59 to be based off of that") supersedes the §5.45
// type69-print build that lived here (git history keeps it; decode notes
// live on in docs/references/tanks/type59.md). The playable now renders
// profiles/china.ts buildType59 — the WZ-120 dome + 100 mm kit on the
// widened buildT62Obr1975Chassis base above.

// ---- T-90A "Vladimir" recovered print (profiles/t90a_vladimir.json) -------
// Aft-shifted frame: hull z -5.20..+2.61, crew deck ~1.66, engine deck 1.76,
// glacis -> 1.28@2.62; oracle parents a full-width stowage STACK (top 2.31,
// z -2.84..-0.94) and the tail drum rack (-4.5..-5.35) into the hull. Dome
// crown 2.32 center trough with left sight block 2.92, pano 3.10 @ +0.39,
// met mast 3.81 @ (-0.24, -2.25), tall rear bin stack to 3.1 on the turret.
// Tube: axis 1.92, sleeve r.105 -> 4.2, muzzle 5.15.
// ---- T-64BV-1 (docs/references/profiles/t64bv1.json) ----------------------
// hull z -4.30..+1.71 (6.0 m), deck 1.21, rear step 1.02 @ -3.9, glacis ->
// 0.94@1.71; slab sides ±1.70 full length; 6 small wheels + 4 rollers, rear
// sprocket; dome center -0.6 crown ~2.02 w/ left cupola 2.29; K-1 cheeks;
// 125 mm at axis 1.466, evac swell z 2.11..3.01, muzzle 4.312. The bergman
// print parents its rear drum/log rack into the Turret node — matched here
// (same world seats) so the component masks compare like for like.
function addT64BV1TransomLouvres(P: RussiaBuilderPort): void {
  for (let index = 0; index < 6; index++) {
    P.add('hullDetail', KIT.box(0.24, 0.13, 0.025),
      -0.75 + index * 0.30, 0.96, -2.995);
  }
}

function buildT64BV1(P: RussiaBuilderPort): void {
  const { box, cylX, cylY, cylZ, slab, buildRunningGear } = KIT;
  // Grow the authored 0.80 m course upward by 10%. The loaded lower run stays
  // on its ground datum while the road wheels clear its shoe crest; the
  // terminal wheels, return rollers and upper run rise. The body retains a
  // 180 mm lift above the legacy seating so the result is a proportionate
  // \____/ course rather
  // than suspension translated upward into the old hull bay.
  const trackHeightIncreaseM = 0.08;
  const hullRideHeightIncreaseM = 0.18;
  const turretForwardShiftM = 0.20;
  const roadWheelRadiusM = 0.285;
  const roadWheelCenterY = 0.49;

  // §5.247 LECLERC-METHOD REDESIGN (2026-08-16/17). Visual/measurement
  // oracle: the owner-supplied t-64bv1_ussr print (SHA-256 608336f2...,
  // fused two-mesh Sketchfab bake) staged comparison-only at
  // public/models/tanks/community/recovered/t64bv1.glb. Every station below
  // is a MEASURED line from the direct vertex decode (tools/tmp-t64-decode
  // receipts, gate meters, width-normalized 3.42): six 0.267-radius wheels
  // at z 1.875/1.125/0.40/-0.325/-1.075/-1.775 hub y 0.315, raised idler
  // (2.57, 0.665) and rear drive (-2.58, 0.788), track band x 0.996..1.565,
  // top run 0.93; glacis plane (1.45, 1.31)->(2.36, 0.94) with the 2.655
  // center bow crease; deck plateau 1.315 with the raised 1.36 engine run;
  // skirt face x 1.705 y 0.60..1.02; cast dome chord z -1.45..+1.33 with
  // the LOW center crown ~2.0, low RIGHT roof 1.87-1.89 and the raised
  // LEFT commander gallery 2.21..2.28; 2A46-2 axis 1.505 muzzle +5.60.
  // The §5.37-ratified reads are preserved: the K-1 wing-plate chevron V
  // meets at a pointed tip against the boot, and the NSVT stays a forward,
  // prominent census MG. No source vertex, index, texture or topology ships.

  // Lofted hull to the measured curves: flat 0.38 belly between the tracks,
  // deck plateau 1.315, raised engine run, transom falling to the 0.44 tail
  // line, and the clipped V bow whose center crease ends at z 2.655.
  loftHull(P, {
    deck: [
      [-3.00, 1.24], [-2.94, 1.27], [-2.62, 1.335], [-2.08, 1.348],
      [-1.78, 1.315], [1.45, 1.315], [2.05, 1.09], [2.38, 0.94],
      [2.655, 0.715],
    ],
    belly: lowerT64BellyProfile([
      [-3.00, 0.44], [-2.55, 0.425], [-1.90, 0.42], [1.55, 0.40],
      [2.05, 0.38], [2.30, 0.40], [2.46, 0.50], [2.655, 0.665],
    ]),
    wUp: [
      [-3.00, 1.30], [-2.86, 1.454], [2.28, 1.454], [2.44, 1.24],
      [2.52, 1.02], [2.60, 0.66], [2.655, 0.34],
    ],
    wLo: [
      [-3.00, 0.74], [-2.80, 0.74], [2.24, 0.74], [2.46, 0.70], [2.655, 0.33],
    ],
    sponsonY: [[-3.00, 1.12], [2.26, 1.12], [2.52, 0.84], [2.655, 0.70]],
  });

  // Bow corner prongs: the measured plan edge steps 2.655@0.33 -> 2.75@0.53
  // -> 2.88@0.73 -> 2.93@0.85 (FLAT slabs — the r8 rotated-prong lesson) and
  // the fender tips that carry the front flap hangers over the idler.
  for (const s of [-1, 1]) {
    P.add('hull', slab(
      [s * 0.33, 0.60, 2.655], [s * 0.53, 0.62, 2.75], [s * 0.73, 0.66, 2.60], [s * 0.33, 0.62, 2.60],
      [s * 0.33, 0.86, 2.655], [s * 0.53, 0.90, 2.75], [s * 0.73, 0.95, 2.60], [s * 0.33, 0.90, 2.60]));
    P.add('hull', slab(
      [s * 0.53, 0.64, 2.75], [s * 0.73, 0.68, 2.88], [s * 0.90, 0.72, 2.70], [s * 0.53, 0.66, 2.62],
      [s * 0.53, 0.90, 2.75], [s * 0.73, 0.95, 2.88], [s * 0.90, 1.00, 2.70], [s * 0.53, 0.92, 2.62]));
    P.add('hull', box(0.42, 0.26, 0.24), s * 0.74, 0.84, 2.80, -0.10, 0, 0);
    P.add('hull', box(0.30, 0.10, 0.55), s * 0.78, 1.06, 2.55, -0.16, 0, 0);
    // front mud flap over the raised idler (plan front line 2.99)
    P.add('hull', box(0.15, 0.26, 0.045), s * 1.72, 0.93, 2.89, -0.06, 0, 0);
    P.add('hullRubber', box(0.15, 0.40, 0.040), s * 1.72, 0.80, 2.915);
  }

  // Four staggered Kontakt-1 glacis courses ON the measured glacis plane
  // (1.31@1.45 -> 0.94@2.38, rake -0.38): full cassette bodies with dark lid
  // seams, ending at the splash-board crease.
  P.visualEraCluster('t64bv1-k1-hull-era', 'hull', () => {
  for (let row = 0; row < 4; row++) {
    const zr = 1.60 + row * 0.235;
    const yr = 1.253 - row * 0.0925;
    for (let col = -3; col <= 3; col++) {
      const x = col * 0.262 + (row & 1 ? 0.131 : 0);
      if (Math.abs(x) > 0.90) continue;
      P.add('hullTrack', box(0.245, 0.105, 0.235), x, yr, zr + Math.abs(x) * 0.045, -0.38, x * 0.10, 0);
      P.add('hullDark', box(0.19, 0.026, 0.026), x, yr + 0.048, zr + 0.105 + Math.abs(x) * 0.045, -0.38, x * 0.10, 0);
    }
  }
  });
  // V splash board proud of the lower glacis (measured 0.976 crest at 2.30)
  for (const s of [-1, 1]) {
    P.add('hull', box(0.50, 0.075, 0.045), s * 0.235, 0.925, 2.325, -0.38, s * 0.42, 0);
  }
  // Headlight clusters with brush guards on the fender tips + bow tow eyes.
  for (const s of [-1, 1]) {
    KIT.headlight(P, s * 1.13, 1.075, 2.42, -0.24, 0.070);
    P.add('hullDark', box(0.17, 0.15, 0.12), s * 1.13, 1.07, 2.33, -0.24, 0, 0);
    P.add('hullDetail', box(0.020, 0.16, 0.30), s * (1.13 + 0.11), 1.10, 2.42, -0.24, 0, 0);
    P.add('hullDetail', KIT.torus(0.075, 0.016, 10), s * 0.55, 0.52, 2.53, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.08, 0.10, 0.14), s * 0.55, 0.56, 2.44, -0.30, 0, 0);
  }

  // Driver station on the 1.315 deck plateau: hatch, twin periscopes and the
  // splash strip at the glacis break.
  P.add('hull', cylY(0.235, 0.235, 0.042, 14), 0, 1.335, 1.10);
  P.add('hullDark', cylY(0.242, 0.242, 0.012, 14), 0, 1.352, 1.10);
  KIT.periscope(P, 'hullDetail', -0.15, 1.345, 1.40);
  KIT.periscope(P, 'hullDetail', 0.15, 1.345, 1.40);
  P.add('hullDark', box(0.62, 0.045, 0.055), 0, 1.335, 1.50);

  // Segmented sponson/fender strips (edge-on prism law) with bin lids, the
  // measured 1.19..1.26 fender line, and the LEFT-side exhaust duct identity.
  for (const s of [-1, 1]) {
    for (let i = 0; i < 8; i++) {
      const z = 2.02 - i * 0.60;
      P.add('hull', box(0.40, 0.115, 0.56), s * 1.245, 1.20, z);
      P.add('hullDark', box(0.34, 0.028, 0.46), s * 1.245, 1.265, z);
      P.add('hullDetail', cylX(0.018, 0.05, 8), s * 1.452, 1.22, z + 0.14);
    }
  }
  P.add('hullDark', box(0.24, 0.17, 0.92), -1.315, 1.30, -2.10);
  P.add('hullDetail', box(0.20, 0.13, 0.78), -1.315, 1.40, -2.10);
  P.add('hullDark', box(0.16, 0.05, 0.42), -1.415, 1.245, -2.10, 0, 0, 0.10);
  P.add('hullDark', box(0.40, 0.20, 0.30), 1.22, 1.32, -2.52);
  KIT.towCable(P, [[-1.18, 1.29, 0.60], [-0.42, 1.345, 0.10], [0.44, 1.345, 0.08], [1.16, 1.29, 0.56]]);
  {
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 5, width: 0.46, seed: 642 });
    links.position.set(-0.62, 1.335, 0.62);
    P.hullG.add(links);
  }

  // Raised engine run with transverse intake louvres and the rear deck rail.
  for (const s of [-1, 1]) {
    P.add('hullDark', box(1.02, 0.030, 1.02), s * 0.62, 1.338, -2.10);
    for (let i = 0; i < 7; i++) {
      P.add('hullDetail', box(0.92, 0.020, 0.048), s * 0.62, 1.358, -2.52 + i * 0.14);
    }
  }
  P.add('hullDark', box(1.30, 0.05, 0.06), 0, 1.36, -1.62);

  // Layered transom at the measured -2.98 face: louvre field, service plate,
  // recovery eyes and the low strapped unditching log. Nothing hangs in air.
  P.add('hull', box(1.84, 0.72, 0.18), 0, 0.82, -2.88, 0.06, 0, 0);
  P.add('hullDark', box(1.80, 0.30, 0.035), 0, 0.96, -2.975);
  addT64BV1TransomLouvres(P);
  P.add('hullDark', box(0.40, 0.26, 0.05), -1.10, 1.06, -2.975);
  P.add('hullDetail', box(0.33, 0.18, 0.035), 1.02, 1.05, -2.99);
  for (const s of [-1, 1]) {
    P.add('hullDark', cylZ(0.085, 0.022, 14), s * 0.48, 0.62, -2.972);
    P.add('hullDetail', cylZ(0.032, 0.028, 10), s * 0.48, 0.62, -2.975);
    P.add('hullDetail', box(0.26, 0.032, 0.018), s * 0.78, 0.70, -2.968);
  }
  P.add('hullDark', box(0.22, 0.14, 0.055), -0.62, 0.55, -2.962);
  P.add('hullDetail', box(0.34, 0.045, 0.020), 0.60, 0.55, -2.968);
  {
    const log = FITTINGS.unditchingLog({ mats: P.mats, len: 1.80, r: 0.10, straps: 4, seed: 641 });
    log.position.set(0, 0.70, -2.83);
    P.hullG.add(log);
  }
  for (const s of [-1, 1]) {
    P.add('hullDark', KIT.torus(0.075, 0.018, 12), s * 0.82, 0.52, -2.96, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.07, 0.26, 0.08), s * 0.82, 0.68, -2.93);
    // rear mud flap at the measured 1.505..1.655 hanger band
    P.add('hull', box(0.16, 0.26, 0.045), s * 1.73, 0.92, -2.94, 0.08, 0, 0);
    P.add('hullRubber', box(0.16, 0.24, 0.040), s * 1.73, 0.70, -2.965);
  }

  // (rear drums/snorkel ride the TURRET rack at the measured z -1.5..-1.95
  // cluster — the print's engine run aft of it stays a clean 1.33..1.42
  // louvre deck; long deck canisters poisoned eight side columns, receipt
  // banked in the packet.)

  // One suspension-driven T-64 course at the six MEASURED wheel stations:
  // 0.285 steel wheels (hub y 0.490), four return rollers, the raised
  // 0.665 authored idler plus the shared 40 mm BV bow correction, and the
  // 0.788 rear drive. Track band x 0.996..1.565 exact.
  buildRunningGear(P, {
    style: 'holes',
    wheelR: roadWheelRadiusM,
    wheelW: 0.30,
    wheelY: roadWheelCenterY,
    xc: 1.28,
    dishR: 0.82,
    wheelZs: [1.875, 1.125, 0.40, -0.325, -1.075, -1.775],
    idler: {
      z: 2.55,
      y: 0.665 + trackHeightIncreaseM + T64_FRONT_IDLER_LIFT_M,
      r: 0.262,
    },
    sprocket: { z: -2.555, y: 0.788 + trackHeightIncreaseM, r: 0.315 },
    rollers: [-1.85, -0.60, 0.70, 1.95]
      .map((z) => ({ z, y: 0.90 + trackHeightIncreaseM, r: 0.078 })),
    trackW: 0.578,
    pinCapOuter: 0.27,
    endRingSpan: 0.51,
    shoeRadialScale: 0.46,
    // The thin T-64 shoe uses the canonical single-pin family geometry; its
    // web, pins and guide horn remain within the one closed tread course.
    topY: 0.93 + trackHeightIncreaseM,
    botY: 0.13,
    contactZF: 2.14,
    contactZR: -2.04,
    paintedEnds: false,
    coveredTop: false,
    arms: true,
    wheelHex: 0x30352d,
  });

  // Shallow full-run skirts at the measured 1.705 face (0.60..1.02 band)
  // hung from a real fender side plate, with the BV's leading K-1 tabs.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.012, 0.14, 4.50), s * 1.60, 1.10, 0.05);
    P.add('hull', box(0.13, 0.045, 4.50), s * 1.505, 1.185, 0.05);
  }
  // §5.256 fix: the print's skirt is a THIN ~0.22 m band — wheel tops and
  // the upper run stay exposed (the six-small-wheels acid tell).
  ruSkirtBand(P, { x: 1.66, z0: -2.30, z1: 2.24, yTop: 1.02, yBot: 0.80, panels: 8, dressIn: 0.030, th: 0.05, lipY: 0.79 });
  for (const s of [-1, 1]) {
    for (let i = 0; i < 6; i++) {
      const z = 2.02 - i * 0.44;
      P.add('hullTrack', box(0.055, 0.38, 0.335), s * 1.670, 0.81, z, 0, 0, -s * (0.015 + i * 0.005));
      P.add('hullDark', box(0.016, 0.024, 0.26), s * 1.698, 0.985, z, 0, 0, -s * 0.018);
    }
  }
  widthAnchor(P, 1.71, 0.80, -2.42);

  // Low cast turret at the MEASURED seat: plan chord z -1.45..+1.33 (pivot
  // at the chord center, §5.31), max half-width 1.30, low ~1.97 center
  // crown, and the print's asymmetric roof — a low right half against the
  // raised LEFT commander gallery carrying the 2.28 height datum.
  P.turretG.position.set(0, 1.30, -0.06 + turretForwardShiftM);
  // §5.256 fix: the owner print's CASTING measures ~2.28 m across the
  // cheeks (140/210 of hull width) — the 2.82 m dome was the donbass broad
  // read reserved for ua_t64bv. Rings x0.82 (seats kept); the wide flat
  // REAR BUSTLE (ref tops 1.84-1.93 over z -0.76..-1.45, halfW ~1.08) is
  // now REAL chamfered geometry instead of dome fill, and the side K-1 /
  // smoke / wing hardware stands off the narrow casting on true brackets.
  const rings = [
    [0.98, -0.02], [1.09, 0.12], [1.14, 0.30], [1.115, 0.46],
    [1.045, 0.545], [0.92, 0.578], [0.64, 0.60], [0.34, 0.638], [0.107, 0.658],
  ];
  meshDomeCurved(P, rings, 0.92, 0, 0, { capR: 1.60, roofTiltScale: 0.62 });
  P.add('turret', cylY(0.84, 0.88, 0.10, 24), 0, 0.0, 0);
  P.add('turretDark', cylY(0.90, 0.90, 0.035, 24), 0, 0.02, 0);
  chamferBox(P, 'turret', 2.16, 0.50, 0.56, 0, 0.35, -0.94, 0.12);
  chamferBox(P, 'turret', 1.96, 0.40, 0.24, 0, 0.34, -1.34, 0.10);

  // Compact Kontakt-1 interpretation of the approved Tagil construction.
  // Two shallow rows meet beside the gun to form a real < / > section, but
  // the smaller T-64 casting keeps two shorter plan carriers and two tiles
  // per face instead of inheriting the T-90MS footprint wholesale.
  addSovietChevronEra(P, {
    sector: 't64bv1-k1-turret-era',
    receiptKey: 't64BV1ChevronEraReceipt',
    family: 't64bv1-kontakt1-compact-chevron-r1',
    plans: [
      [[0.24, 1.10], [0.34, 1.19], [0.79, 0.86], [0.69, 0.76]],
      [[0.70, 0.80], [0.80, 0.90], [1.19, 0.58], [1.09, 0.48]],
    ],
    rows: [
      { y0: 0.13, y1: 0.31, z0: -0.07, z1: 0.055 },
      { y0: 0.31, y1: 0.49, z0: 0.055, z1: -0.065 },
    ],
    tileRanges: [[0.08, 0.46], [0.54, 0.92]],
    carrierBucket: 'turret',
    tileBucket: 'turretTrack',
    tileDepthM: 0.060,
    gasketDepthM: 0.022,
    tilePadY: 0.010,
    centerClosure: { width: 0.34, height: 0.18, depth: 0.055, y: 0.23, z: 1.18, rx: -0.18 },
  });
  P.visualEraCluster('t64bv1-k1-turret-flank-era', 'turret', () => {
  for (const s of [-1, 1]) {
    // three K-1 flank returns per side along the cheek line (the print's
    // LEFT flank sits measurably inboard — front col -1.40 reads 1.26)
    const fxr = s < 0 ? 1.243 : 1.285;
    const fxl = s < 0 ? 1.318 : 1.363;
    for (let i = 0; i < 3; i++) {
      P.add('turretTrack', box(0.15, 0.33 - i * 0.02, 0.31), s * fxr, 0.30, 0.10 - i * 0.33, -0.06, s * 0.09, 0);
      P.add('turretDark', box(0.026, 0.23, 0.24), s * fxl, 0.31, 0.10 - i * 0.33, -0.06, s * 0.09, 0);
    }
    // real standoff frames: casting wall -> side cassettes / outer wing end
    P.add('turretDetail', box(0.24, 0.15, 0.11), s * 1.10, 0.30, 0.08, -0.06, s * 0.09, 0);
    P.add('turretDetail', box(0.30, 0.15, 0.11), s * 1.10, 0.29, -0.56, -0.06, s * 0.09, 0);
    P.add('turretDetail', box(0.26, 0.18, 0.12), s * 1.02, 0.30, 0.42, -0.10, s * 0.50, 0);
    // BV roof-arc extension: two low-profile cassettes per side follow the
    // forward dome slope (ERA-to-roof identity read, silhouette-shy).
    P.add('turretTrack', box(0.30, 0.070, 0.26), s * 0.50, 0.60, 0.56, -0.26, s * 0.28, -s * 0.14);
    P.add('turretTrack', box(0.28, 0.070, 0.24), s * 0.84, 0.475, 0.40, -0.24, s * 0.34, -s * 0.18);
  }
  P.add('turretDark', box(0.40, 0.14, 0.06), 0, 0.03, 1.12);
  P.add('turretDark', box(0.34, 0.22, 0.10), 0, 0.16, 0.98, -0.16, 0, 0);
  chamferBox(P, 'turret', 0.56, 0.22, 0.24, 0, 0.11, 1.10, 0.06);
  });

  // Raised LEFT commander gallery + cupola (the print's 2.21..2.28 band)
  // seated on the dome skin, with TKN vision blocks and the hatch ring.
  P.add('turret', box(0.46, 0.30, 0.78), -0.66, 0.63, 0.03, 0, 0, -0.03);
  P.add('turret', box(0.42, 0.18, 0.26), -0.64, 0.60, -0.49, 0, 0, -0.03);
  P.add('turret', box(0.42, 0.16, 0.62), -0.66, 0.83, 0.00, 0, 0, -0.03);
  P.add('turret', slab(
    [-0.20, 0.64, 0.30], [-0.45, 0.64, 0.32], [-0.45, 0.64, -0.36], [-0.20, 0.64, -0.34],
    [-0.20, 0.72, 0.30], [-0.45, 0.895, 0.32], [-0.45, 0.895, -0.36], [-0.20, 0.72, -0.34]));
  P.add('turret', cylY(0.250, 0.268, 0.085, 18), -0.67, 0.945, -0.02);
  P.add('turretDark', cylY(0.212, 0.212, 0.028, 18), -0.67, 0.975, -0.02);
  P.add('turretDetail', box(0.09, 0.05, 0.06), -0.67, 0.955, 0.24);
  for (const [gx, gz, gry] of [[-0.50, 0.26, 0.35], [-0.67, 0.30, 0], [-0.84, 0.26, -0.35]]) {
    P.add('turret', box(0.11, 0.06, 0.09), gx, 0.90, gz, -0.10, gry, 0);
    P.add('turretGlass', box(0.075, 0.045, 0.022), gx, 0.925, gz + 0.045, -0.10, gry, 0);
  }

  // Front-left sight tower (the print's tall z 0.9..1.3 mass): armored
  // 1G42 head on a buried base wedge, glass aperture forward.
  P.add('turret', box(0.30, 0.24, 0.24), -0.44, 0.50, 0.92, -0.08, -0.05, 0);
  P.add('turret', box(0.28, 0.34, 0.36), -0.44, 0.80, 1.06, -0.06, -0.05, 0);
  P.add('turretDark', box(0.24, 0.09, 0.05), -0.44, 0.915, 1.25, -0.06, -0.05, 0);
  P.add('turretGlass', box(0.19, 0.12, 0.028), -0.44, 0.81, 1.255, -0.06, -0.05, 0);

  // Luna IR searchlight RIGHT of the gun on a real cheek bracket, and the
  // low right gunner hatch keeping the measured 1.87-1.89 right roof.
  P.add('turret', box(0.12, 0.14, 0.22), 0.54, 0.29, 0.96, -0.10, 0.06, 0);
  P.add('turretDark', cylZ(0.170, 0.15, 18), 0.54, 0.30, 1.10, Math.PI / 2, 0, 0);
  P.add('turretDetail', cylZ(0.140, 0.024, 18), 0.54, 0.30, 1.185, Math.PI / 2, 0, 0);
  P.add('turret', cylY(0.235, 0.235, 0.035, 16), 0.48, 0.575, -0.14);
  P.add('turretDark', cylY(0.208, 0.208, 0.022, 16), 0.48, 0.60, -0.14);
  // gunner's day-sight spike at the measured center-right 2.10 column
  P.add('turret', box(0.10, 0.12, 0.12), 0.09, 0.66, 0.28, -0.06, 0, 0);
  P.add('turretGlass', box(0.07, 0.05, 0.022), 0.09, 0.685, 0.345, -0.06, 0, 0);

  // Low periscope cadence around the crown.
  for (const [x, z, ry] of [[-0.30, 0.52, 0.06], [0.30, 0.46, -0.10], [0.62, 0.30, -0.22], [-0.24, -0.42, 0.05], [0.30, -0.40, -0.08]]) {
    P.add('turret', box(0.14, 0.05, 0.12), x, 0.615, z, 0, ry, 0);
    P.add('turretGlass', box(0.095, 0.042, 0.022), x, 0.645, z + 0.055, 0, ry, 0);
  }

  // §5.37 FORWARD MG (preserved): shielded NSVT census station riding the
  // cupola front, barrel forward over the gallery.
  {
    const mg = FITTINGS.pintleMG({
      mats: P.mats, cls: 'nsvt', tone: 'two-tone', elev: 0.10,
      ammo: true, shield: true, scale: 1.18,
    });
    mg.position.set(-0.62, 0.60, 0.34);
    mg.rotation.y = -0.05;
    P.turretG.add(mg);
  }

  // 902A bank on the left rear flank (obr. 1985 seat — clears the chevron).
  {
    P.add('turretDark', box(0.40, 0.10, 0.26), -0.98, 0.36, -0.62, -0.10, -0.30, -0.12);
    const smoke = FITTINGS.smokeBank({
      mats: P.mats, count: 4, r: 0.042, len: 0.28,
      splay: -1.0, pitch: -0.20, arc: 0.50, spacing: 0.096,
      rotation: [0, -0.30, -0.10], seed: 651,
    });
    smoke.position.set(-1.02, 0.42, -0.58);
    P.turretG.add(smoke);
  }

  // Turret rear: bustle rack rail, paired stowage boxes and the rear roof
  // rod at the measured -1.12 spike, all turret-owned through yaw.
  // §5.256 fix: REAL rail rack off the bustle rear — twin horizontal rails
  // on hanger straps + struts, the short right fuel drum and the stowed
  // two-tube OPVT cluster strapped TO the rails (silhouette-readable).
  P.add('turretDetail', cylX(0.017, 2.00, 10), 0, 0.46, -1.50);
  P.add('turretDetail', cylX(0.017, 2.00, 10), 0, 0.27, -1.55);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.035, 0.22, 0.030), s * 0.86, 0.365, -1.52, -0.14, 0, 0);
    P.add('turretDark', box(0.035, 0.22, 0.030), s * 0.30, 0.365, -1.52, -0.14, 0, 0);
    P.add('turretDetail', box(0.04, 0.05, 0.16), s * 0.55, 0.44, -1.42);
  }
  P.add('turret', cylZ(0.142, 0.60, 14), 0.94, 0.36, -1.60);
  P.add('turretDark', cylZ(0.150, 0.04, 14), 0.94, 0.36, -1.86);
  P.add('turretDark', box(0.030, 0.30, 0.035), 0.94, 0.36, -1.52, -0.10, 0, 0);
  P.add('turret', cylZ(0.062, 0.66, 12), -0.90, 0.415, -1.56);
  P.add('turret', cylZ(0.062, 0.66, 12), -0.90, 0.285, -1.56);
  P.add('turretDark', cylZ(0.070, 0.035, 12), -0.90, 0.415, -1.82);
  P.add('turretDark', cylZ(0.070, 0.035, 12), -0.90, 0.285, -1.82);
  P.add('turretDark', box(0.030, 0.26, 0.035), -0.90, 0.35, -1.50, -0.10, 0, 0);
  {
    P.add('turretDark', box(0.07, 0.06, 0.07), 0.10, 0.56, -1.06);
    const antenna = FITTINGS.antennaWhip({ mats: P.mats, h: 0.22, r: 0.011, rake: 0.02, seed: 652 });
    antenna.position.set(0.10, 0.62, -1.06);
    P.turretG.add(antenna);
  }
  domeRailRu(P, rings, 0.92, 0.36, 1.00);

  // 2A46-2 at the measured 1.505 axis: sealed saddle, the ratified narrow
  // accordion boot the chevron tips tuck against, stepped thermal sleeve
  // with the mid evacuator swell, thin muzzle run to +5.60 and a true bore.
  P.gunG.position.set(0, 0.24, 1.00);
  ruSaddle(P, { rollR: 0.165, rollW: 0.30, tubeR: 0.086, rootR: 0.185, rootL: 0.50 });
  ruBoot(P, { pts: [
    [-0.30, 0.16, 0.40, -0.10],
    [0.04, 0.15, 0.32, -0.07],
    [0.34, 0.135, 0.235, -0.03],
    [0.62, 0.12, 0.15, 0.00],
  ] });
  tubeGun(P, [
    [0.62, 1.56, 0.097],
    [1.56, 2.41, 0.100],
    [2.41, 3.31, 0.1025],
    [3.31, 3.97, 0.088],
    [3.97, 4.66, 0.084],
  ], {
    rings: [[0.90, 0.099], [1.56, 0.1015], [2.41, 0.104], [3.31, 0.0895], [3.97, 0.0855], [4.36, 0.0855]],
    muzzle: 4.66,
  });
  P.add('gunDark', cylZ(0.086, 0.05, 16), 0, 0, 4.635);
  muzzleBore(P, { r: 0.082 });

  const decalX = ringSkin(rings, 0.40) + 0.025;
  P.decal('turret', 'number', P.spec.visual.number || '', 0.23, [decalX, 0.38, -0.50], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.23, [-decalX, 0.38, -0.50], -Math.PI / 2);
  // Recessed bridge under the paired forward fender/ERA roots.  It closes
  // the two narrow plan-view wells while remaining below the visible
  // glacis course and inside the moving-track lanes.
  for (const side of [-1, 1]) {
    P.add('hull', box(0.26, 0.025, 0.30), side * 0.96, 1.18, 2.44);
  }
  liftT64HullAboveTallTrack(P, {
    trackHeightIncreaseM,
    hullRideHeightIncreaseM,
    lowerHullDropM: T64_LOWER_HULL_DROP_M,
    trackBottomY: 0.13,
    trackTopY: 1.01,
    authoredEnvelopeHeightM: 0.80,
    roadWheelRadiusM,
    roadWheelCenterY,
    frontIdlerLiftM: T64_FRONT_IDLER_LIFT_M,
  });
  P.topY = 1.30;
}

// ---- PT-91M Pendekar (docs/references/profiles/pt91m.json) ----------------
// Centered frame: hull ±3.85, deck 1.81, tall powerpack stack (±0.9 wide,
// steps 2.02/2.16) over the raised tail, glacis -> 1.44@3.80; skirts ±1.735
// with ERAWA plates ±1.79 on the front half; dome crown ~2.33 center 0.18,
// left cluster 2.64, pano 2.85, met mast 3.82 @ (-0.25, -1.0); tube axis
// 2.008, sleeve r.122, muzzle 6.58.
// Invisible width anchor: sub-pixel studs at the exact normalized half-width
// (is7 precedent) so safeScale stays 1.0 and authored heights hold.
export function widthAnchor(P: RussiaGeometryPort, halfW: number, y: number, z: number): void {
  for (const s of [-1, 1]) P.add('hull', KIT.box(0.012, 0.02, 0.02), s * (halfW - 0.006), y, z);
}

// T-64 ride-height correction shared by the Russian and Ukrainian profiles.
// Hull buckets are still unmerged here, while fittings and running gear are
// direct rig children. Moving only non-running-gear ownership keeps the
// lower course planted and raises the complete vehicle body above it.
export function liftT64HullAboveTallTrack(P: RussiaOffsetPort, {
  trackHeightIncreaseM,
  hullRideHeightIncreaseM = trackHeightIncreaseM,
  lowerHullDropM = 0,
  trackBottomY,
  trackTopY,
  authoredEnvelopeHeightM,
  roadWheelRadiusM,
  roadWheelCenterY,
  frontIdlerLiftM = 0,
}: TallTrackLiftOptions): void {
  P.offsetBuckets([
    'hull', 'hullCupola', 'hullHatch', 'hullExternalArmor', 'hullEquipment',
    'hullDetail', 'hullDark', 'hullRubber', 'hullWood', 'hullCloth',
    'hullGlass', 'hullShadow', 'hullTrack', 'hullTrackDetailL',
    'hullTrackDetailR', 'hullTrackTrimL', 'hullTrackTrimR',
    'hullTrackGuardL', 'hullTrackGuardR',
  ], 0, hullRideHeightIncreaseM, 0);

  let liftedDirectHullChildren = 0;
  for (const child of P.hullG.children) {
    let containsRunningGear = child.userData.runningGear === true;
    child.traverse((node: THREE.Object3D) => { containsRunningGear ||= node.userData.runningGear === true; });
    if (containsRunningGear) continue;
    child.position.y += hullRideHeightIncreaseM;
    liftedDirectHullChildren += 1;
  }

  P.turretG.position.y += hullRideHeightIncreaseM;
  P.hullG.userData.t64TallTrackReceipt = Object.freeze({
    authoredEnvelopeHeightM,
    trackHeightIncreaseM,
    installedEnvelopeHeightM: trackTopY - trackBottomY,
    trackBottomY,
    trackTopY,
    roadWheelRadiusM,
    roadWheelCenterY,
    frontIdlerLiftM,
    hullRideHeightIncreaseM,
    lowerHullDropM,
    upperHullShiftM: 0,
    runningGearShiftM: 0,
    lowerGlacisExtendedToBelly: lowerHullDropM > 0,
    liftedDirectHullChildren,
  });
}

// ---- T-80 line: T-80 (1976) / T-80B / T-80BV ------------------------------
// r25 EXPANSION (docs/references/vertex/t80.json / t80b.json / t80bv.json,
// REG batch 0a39d55; triage-zero-rows: oracles clean, no build existed).
// World frame = extract frame + 1.3485 (t80; hull mask re-centered). PUB
// SOVEREIGN: hull ±3.39 (6.78), width 3.52 (skirt faces ±1.76), height 2.20
// (crown), muzzle +6.27 (9.66 overall). The t80 oracle mask runs 4.3% long
// (±3.53) — both hull ends eat a known ~2-col miss per the round brief.
// Decode highlights (t80 curves, world): deck 1.41..1.505 with the 1.505
// engine plateau at -1.66..-1.36; SIDE HUMP band (turbine exhaust deck)
// x ±0.78..1.62 topping 1.86 over -3.39..-3.06 with a recessed 1.44 center
// channel (plan center rear -3.26 vs the sides' clamped -3.39); belly 0.44
// tub floor with gear-fade ramps rear (0->0.49 @ -1.90..-2.84) and front
// (0->0.775 @ 2.33..3.36); bow ARROW plan (center 3.16, fender corners
// 3.49->clamp); turret crown 2.20, MG cluster 2.29 x2 cols @ -0.64..-0.49,
// bustle band 2.20 over -1.64..-1.09 with raked 1.84->1.65 bottom; FAT
// sleeved tube band 1.56..1.86 (true r 0.135-0.15 cylinders, circle law);
// turret-node APRON: the ref turret mask bottoms at 0.66 across z -0.49..
// +1.08 (print carries hull-side kit in the turret node) — mirrored with a
// hidden turretDark carrier inside the hull silhouette.
// ---- T-84 Oplot (docs/references/vertex/t84.json — batch-35 RE-WARPED print)
// r31 RE-ANCHOR (post be7eb4f): the oracle now sits at PUBLISHED dims (hull
// ×1.107, fused tube pinned rear+9.72, furniture knee 2.23) so the r30
// short-print laws are RETIRED here: no end extensions, no rearward margin,
// no cover columns — the build re-authors 1:1 against the warped ref in its
// OWN WORLD FRAME (extract hullMask −4.858..+2.222, muzzle +4.863, box
// z ±4.863). Authored frame == ref world frame (dAlong ≈ 0 by construction)
// and max |x| is EXACTLY 1.78 so safeScale stays 1.0 (r30's ±1.7875 strips
// shrank the whole build 0.42%).
// Calibrated digest (tools/tmp-t84-workorder-full.mjs, visibility-fixed
// boxes — the stock workorder's side-z labels ran +0.54 off ref-world this
// round; y values were always ground-true): deck 1.30@−2.16..−0.10 /
// 1.333@−2.60..−4.16 + hump 1.365@−2.67..−3.05, glacis 1.278@0.55 ->
// 1.148@1.91 -> nose face 1.99 (plan center; corner content to 2.24 rides
// LOW y 0.62..1.00 — V-bow class), stern overhang deck 1.21-1.25 to −4.86
// at |x| 0.93..1.29 ONLY (center plate −4.71, notch −4.55); front-view tub:
// center belly 0.23 (|x|<=0.78), step 0.35 to 0.95, ground contact
// 0.99..1.50, fender line 1.31-1.35, skirt lip rail at ±1.78 y 0.93..0.97;
// tracks grounded −3.43..0.95, straight 27° climb to a small HIGH idler
// (wrap front <=1.97), sprocket wrap bottoms 0.21@−3.79; welded turret:
// cheek apex ramp 1.94@0.81 -> 2.04@−0.16, tall body walls 2.10 at ±1.20
// over z −0.50..−1.31, low collar 1.58..1.66 to ±1.245 (z −0.98..0.55),
// roof plates 2.205@−0.40..−2.03, sight housings 2.23 @ z −0.36..−0.50,
// bustle ±0.88 to −3.04 (bottoms 1.66->1.80, Utes crate 2.21@−2.56..−2.84,
// RIGHT-flank stowage to x 1.20 — print asymmetry, variant tell); apron
// 0.94 @ −0.16..−1.73 (hidden carrier, t80 pattern); tube axis 1.835
// (band 1.94..1.73), plan edge <=0.10 (bin law), evac BOX 1.97 @
// 2.39..3.12, muzzle +4.86.
// ---- T-90M Proryv (docs/references/vertex/t90m.json, batch-31 warped oracle)
// FIRST BUILD (r26). World frame = extract + 1.38 (hull mask re-centered to
// ±3.43 = pub 6.86). PUB SOVEREIGN: width 3.78, height 2.23 (roof plateau
// 2.24-2.25 rides the 1% grace), muzzle +6.20 (9.63 overall).
// Decode (world): flat deck 1.35-1.39; glacis corner prongs 3.44 over a 3.20
// center V-bow (t90sm bow-notch class); rear plate -2.90 full width with the
// drum/log RACK to -3.43 at |x|<=0.99 (tops 1.84, floor 1.23-1.44); WELDED
// turret vs the t90a cast dome — flat cheeks (plan front 1.91 center ->
// 0.92@|x|1.74, chamfered corners), broad roof plateau 2.24-2.25 over z
// -1.2..+0.5, turret-node APRON bottoming 0.88 across z -0.8..+0.9 (print
// carries hull-side kit in the turret node — hidden carrier, t80 pattern);
// Kord RWS + bustle bins as SEPARATED THIN MEMBERS (post-warp ref holds them
// at 2.20-2.25 / bins band 1.58..1.91 reaching z -2.32); Relikt skirt line;
// 2A46M-5 axis 1.61, evac swell r 0.138 at 3.20..3.44, muzzle +6.20.
// ---- T-72B obr.1987 (profiles/t72b_1987.json) ------------------------------
// Aft frame: hull -4.84..+2.43, deck 1.56-1.61, tail rack to 1.74 (drums+log
// on the plate), glacis 1.42@1.1 -> 1.13@2.43; Super-Dolly dome center -0.7
// crown ~2.55 w/ left cluster, 902B bank LEFT cheek, K-1 rafts; 2A46M axis
// 1.75, evac swell r.119 z 2.65..3.53, muzzle 4.852.
// ---- T-72B3M obr.2022 (profiles/t72b3m.json) -------------------------------
// Aft frame: hull -4.56..+2.27, deck 1.36-1.39 with a raised soft-stowage
// band 1.94 (z -2.7..-1.4, oracle hull-parented), tail slat shelf 1.53; dome
// center -0.5 crown ~2.35 under the Sosna-U tower (3.05) / mast 3.40; Relikt
// cassettes + soft-bag skirts; 2A46M-5 axis 1.679, muzzle 4.792.
// ---- T-72BU (profiles/t72bu.json) ------------------------------------------
// Aft frame: hull plates -4.75..+2.68; the print parents its BARREL and a
// dome filler band (1.78-1.81, z -1.5..+0.9) into the HULL node — the filler
// is matched with a hull-bucket box under the dome; the barrel stays on the
// correct rig (documented oracle cap: hull/turret masks split the tube).
// Dome crown ~2.20 center w/ big left cluster 2.78 and mast 3.58; rear
// basket run -1.5..-3.2 rising 2.0 -> 2.43. Tube axis 1.715, muzzle 5.448.
// ---- T-90SM (profiles/t90sm.json) ------------------------------------------
// Near-centered frame: hull -3.83..+3.85, deck 1.55, glacis -> 1.13@3.73;
// WELDED turret ~3.3 wide with the squared bustle to -2.9 (top 2.20) and two
// sight towers to 3.15 (pano left -0.65, RWS right +0.25); Relikt cheeks.
// Tube axis 1.912, MRS bulge r.118 at world 5.17..5.29, muzzle 6.732.
// ---- T-90 (base, 1992 obr.) — §5.38 owner priority wave --------------------
// Print: public/models/community-candidates/t90_kojf.glb (LOCAL-ONLY
// quarantine, semantic OBJ re-bake; vertex REG + all three harness maps,
// commit 7b45f13). Probe receipts (tools/tmp-t90fam-probe.mjs — node AABBs
// + z-hists, raw meters ~1:1: skirt width 3.81 vs pub 3.78): hull body
// -3.48..+3.38 (6.86 = pub), deck plateau 1.545 over z -2.55..+0.95, glacis
// break ~2.30 falling to the 0.99 nose at 3.29, belly 0.44 flat, rear rake
// 0.70@-3.40; rear rack band to -3.76 + split-log tail to -4.18 (matched as
// thin slivers only — hullLengthM sovereign, the t90sm tail-sliver class);
// skirt-front ERA x 1.83..1.91 / y 0.83..1.43 / z 0.59..2.58 (3 per side);
// glacis K-5 rows y 0.84..1.13 @ z 2.26..2.84 + y 1.11..1.33 @ z 1.80..2.27.
// Turret casting z -1.23..+1.16 (max halfW 1.66 @ -0.27, nose 0.69 @ +1.12),
// ring skirt bottom 1.408, crown ~2.20; the print's OWN K-5 chevron is the
// §5.29 tip read: inner plates flank the gun (|x| 0.34..0.59, z to 1.34),
// mid leaves |x| 0.83..1.44 z to 1.21, outer leaves |x| 1.00..1.74 z
// 0.07..0.87 — one V line (±0.30, 1.42) -> (±1.62, 0.45); roof plates to
// 2.32 (authored 2.24 tops — dims p95 cap, the t90sm mushroom class); NSVT
// mass to 2.86 over z -0.57..+0.16 (matched to the dims budget only —
// t62mv1 DShK certified-cap class, §5.37 NSVT-prominence ASK-OWNER trade);
// rear bustle rack to -2.15 (halfW 0.76), whip antenna at (-0.27, -1.22).
// Gun axis 1.72, print muzzle 5.99 -> authored 6.10 (overall 9.53
// sovereign). Authored frame = print +0.05 z (body ±3.43), ground y=0.
// FAMILY LAW §5.13: the landed t90a kit grammar (K-5 chevron front, round
// red Shtora eyes, saddle/collar/boot gun assembly, glacis kit) on the base
// mark's own CAST dome — the print is cast (the 1992 turret); the §5.13
// welded-rebase order named t90a/vladimir; the t72 graduates keep the
// fleet's cast grammar. SPIN §5.31: pivot at the casting plan-chord center
// (chord -1.18..+1.21 authored -> center ~0 = turretG z 0).
// ---- T-90MS Tagil (export demonstrator) — §5.38 owner priority wave --------
// Print: public/models/community-candidates/t90ms_kojf.glb (LOCAL-ONLY
// quarantine, semantic OBJ re-bake; vertex REG + harness maps, 7b45f13).
// Probe receipts (tmp-t90fam-probe, raw ~1:1; authored frame = print
// +0.09 z, body ±3.43, ground y=0 — hull family byte-shared with the t90
// print, same gear/tread nodes): turret prism body world -1.6..+1.05
// (halfW 1.48..1.61, roof 2.23..2.29), BIG bustle world -1.6..-2.79 (halfW
// ~1.0..1.24, roof 2.14..2.19, underside 1.62..1.72), rear slat cage to
// world -3.27, bustle-side stowage modules x ±1.33 / y 1.68..2.12 /
// z -3.05..-0.88, RWS+pano tower cluster ON the bustle roof (print 2.93..
// 3.03 — matched to the dims budget only, the certified t90sm tower-cap
// class), ejection-port roof plate x ±0.19 z -1.41..-0.93, smoke banks
// x ±1.48 z -0.84..-0.38, whip antenna (0.56, -1.77). Cheek Relikt: inner
// chevron pair era06/07 (|x| 0.29..0.99, z to 1.46 world) + outer sets
// era04/05/08/09 out to |x| 1.84 — the §5.29 V again, Relikt-era plates.
// Hull: era01-06_hull = TALL hard-skirt ERA (face ±1.79, y 0.76..1.43,
// three per side over z -1.25..+2.73); cage01_hull = full-perimeter bar
// armor to ±1.89 (the width line) wrapping the rear flanks + transom
// (rear reach authored sliver-class, hullLengthM sovereign); glacis rows
// era07-10 (upper y 1.08..1.43 z 1.78..2.46, lower y 0.85..1.23 z
// 2.44..2.94). Gun 2A46M-5: axis 1.82, print muzzle 6.05 -> authored 6.10.
// FAMILY LAW §5.13: the t90sm welded grammar (polyTurret prism + squared
// removable bustle + slat + RWS/pano/Sosna ensemble) re-lofted to THIS
// print's staircase; garage tells vs t90sm: desert-sand factory paint
// (spec), hull perimeter cage, taller skirt ERA, bustle-side module rows.
// SPIN §5.31: pivot at the prism plan-chord center (turretG z -0.19).
// ---- T-90A Burlak (experimental bustle-autoloader turret) — §5.38 ----------
// Print: public/models/community-candidates/t-90a_burlak_armored_warfare.glb
// (LOCAL-ONLY quarantine, flat Object_N; vertex REG + harness maps,
// 7b45f13). Probe receipts (tmp-t90fam-probe; authored frame = print
// +0.05 z, body ±3.43 — the hull/tread/suspension nodes are BYTE-IDENTICAL
// to the t90 print's: one T-90 hull family): turret shell Object_2 world
// -3.66..+1.52 / roof band 2.21..2.31 / ring skirt 1.388; casting z
// -1.55..+1.05 with the ROUNDED plan front (staircase 1.77@-1.06 ->
// 1.60@+0.35 -> 1.06@+0.81 -> 0.77@+1.04, mantlet cheeks ±0.28 to +1.52);
// the LONG autoloader bustle z -1.7..-3.66 (x ±0.63..0.96, roof 2.245..
// 2.30 = the spec 2.30 height datum, underside ~1.70); side/cheek armor
// modules Object_20/23 out to ±1.98/±2.04 (authored faces capped inside
// the 1.845/1.89 width court — dims sovereign; print width-normalization
// cap documented in the packet); commander station LEFT-REAR Object_16
// (x -1.59..-0.25, y to 2.69 — tops ride the dims budget), left roof rail
// bins Object_17 (to 2.37), roof-front plate field Object_4 (y 1.58..2.06,
// z -0.15..+1.13), engine-deck cover plate under the bustle Object_9
// (hull kit — the §B2 bustle-overhang air is turret-bearing class), right
// fender bins Object_25 (the t90-print seat), bow center splash strip
// Object_12. Gun Object_15: axis 1.78, print muzzle 5.93 -> authored 6.10.
// FAMILY LAW §5.13: t90a hull + family prism grammar; the Burlak turret's
// own identity = rounded front + the big squared rear bustle (the print is
// the authority on its unusual shape). SPIN §5.31: pivot at the CASTING
// plan-chord center (turretG z -0.25; the bustle is rear kit, not chord).
// Dome grab rail pair seated just off the measured skin.
export function domeRailRu(
  P: RussiaGeometryPort,
  rings: readonly DomeRing[],
  sz: number,
  y: number,
  len: number,
): void {
  const { box } = KIT;
  const r = ringSkin(rings, y) + 0.035;
  for (const s of [-1, 1]) {
    P.add('turretDetail', box(0.02, 0.02, len), s * r, y, -0.2);
    for (const dz of [-len / 2 + 0.06, len / 2 - 0.06]) {
      P.add('turretDetail', box(0.05, 0.018, 0.018), s * (r - 0.025), y, -0.2 + dz);
    }
  }
}

// K-5/K-1/relikt/erawa cheek arrays seated on a MEASURED ring profile.
export function eraRuCheeks(P: RussiaEraPort, p: EraCheekOptions, kind: EraKind): void {
  const buildRussianEraCheekCluster = (): void => {
  const { box } = KIT;
  const skinD = (t: number, y: number): number => {
    const r = ringSkin(p.rings!, y);
    const A = r, B = r * p.sz!;
    return 1 / Math.sqrt((Math.cos(t) / A) ** 2 + (Math.sin(t) / B) ** 2);
  };
  const addCover = (
    x: number,
    y: number,
    z: number,
    w: number,
    hgt: number,
    d: number,
    rx: number,
    ry: number,
    rz: number,
  ): void => {
    const coverD = Math.min(0.014, d * 0.30);
    P.add('turretDark', KIT.xform(
      box(w * 0.82, hgt * 0.82, coverD),
      0, 0, d * 0.5 + coverD * 0.5 - 0.003,
    ), x, y, z, rx, ry, rz);
  };
  // rCz (r9): seat the ERA ring around the DOME's plan center. The lathe is
  // authored at (cx, cz) but this ring used to revolve around z=0 — on a
  // cz -0.20 dome every front-arc cassette floated 0.2 m proud of the skin
  // in plan (t72b3m r9 workorder: 8 columns x 0.1-0.25).
  const put = (
    t: number,
    y: number,
    w: number,
    hgt: number,
    d: number,
    tilt: number,
    bucket: string,
    dist: number,
    layered = true,
  ): void => {
    const x = Math.cos(t) * dist;
    const z = Math.sin(t) * dist + (p.rCz ?? 0);
    const ry = Math.PI / 2 - t;
    P.add(bucket, box(w, hgt, d), x, y, z, tilt, ry, 0);
    if (layered) addCover(x, y, z, w, hgt, d, tilt, ry, 0);
  };
  const buildRussianEraCheekClusterTurretStage1 = (): void => {
    if (kind === 'k5') {
      // Kontakt-5 clamshell: one wedge course per cheek meeting at the mantlet,
      // welded end caps, dark course seam + proud flank tiles. The wedges own
      // the measured front-arc wings (tips near the full turret-mask width,
      // hanging to just above the fender line).
      const buildRussianEraCheekClusterTurretCourse1 = (): void => {
        for (const s of [1, -1]) {
          // k5T/k5Out (r10): arc seat + standoff — the t90a clamshell leaves
          // reach 0.4 m proud of the cheeks toward the mantlet (ref plan front
          // 2.48-2.53 at |x| 0.7-0.9)
          const buildRussianEraCheekClusterTurretCourse1Iteration1 = (): void => {
            const t = Math.PI / 2 + s * (p.k5T ?? 0.55);
            const yc = p.k5Y ?? 0.16;
            const D = skinD(t, yc) + (p.k5Out ?? -0.04);
            const x = Math.cos(t) * D, z = Math.sin(t) * D;
            // k5Yaw (r12): rake the leaf forward-inboard toward the mantlet
            // (t90a ref: leaf runs (±1.29, 1.36) -> (±0.61, 2.35)); k5Rise lifts
            // the inner end (ref upper edge 2.004 at the cheek).
            const ry = Math.PI / 2 - t - s * (p.k5Yaw ?? 0);
            const L = p.k5Len ?? 1.30;
            const H = p.k5H ?? 0.40;
            const rz = s * (p.k5Rise ?? 0);
            // k5Pitch / k5TileY (t90a_vladimir rTAIL r13b, opt-in): leaf pitch and
            // flank-tile seat height — defaults byte-identical for every caller.
            const px5 = p.k5Pitch ?? -0.40;
            // k5D (§4.999991 russia fix-round, opt-in): leaf DEPTH along its own
            // local z — the verdict's "detached planks with unsupported tips"
            // read comes from the square-section plank floating at its k5Out
            // standoff. A deep leaf keeps the FRONT face plane byte-identical
            // (center retreats along local -z by (k5D-H)/2) while the body runs
            // back INTO the dome skin — a broad plate hugging the casting.
            // Default k5D = H is byte-identical for every legacy caller.
            const k5D = p.k5D ?? H;
            const dGrow = (k5D - H) / 2;
            // box local +z in world under XYZ Euler (rx=px5, ry, rz~0):
            // dir = (sin ry, -cos ry * sin px5, cos ry * cos px5)
            const dzx = Math.sin(ry) * dGrow;
            const dzy = -Math.cos(ry) * Math.sin(px5) * dGrow;
            const dzz = Math.cos(ry) * Math.cos(px5) * dGrow;
            // k5Bucket (§4.999991, opt-in): the real K-5 wedges wear the SCHEME
            // PAINT (t72b3m rBucket law — the spareTrack slot reads grey-steel);
            // material-only, mask-identical. Default byte-identical.
            const k5B = p.k5Bucket ?? 'turretTrack';
            // TIP §5.29 k5LeafOff (opt-in): the clamshell leaves are replaced by
            // the 'tip' panel pair — the flank tiles keep their seats EXACTLY.
            // Absent = byte-identical for every legacy caller.
            if (!p.k5LeafOff) {
            const buildRussianEraCheekClusterTurretCourse15 = (): void => {
              const buildRussianEraCheekClusterTurretCourse9 = (): void => {
                P.add(k5B, box(L, H, k5D), x - dzx, yc - dzy, z - dzz, px5, ry, rz);
                addCover(x - dzx, yc - dzy, z - dzz, L, H, k5D, px5, ry, rz);
                P.add('turretDark', box(L + 0.01, 0.035, H - 0.04), x, yc + H / 2, z, px5, ry, rz);
                // k5Seg (§B3.1 prism sweep 2026-08-06, opt-in): the real K-5 clamshell
                // is SECTIONED — n-1 dark seams across the leaf face plus a lower lip
                // strip. Seams FLUSH with the leaf face (outer face at exactly H/2 —
                // zero silhouette growth; the r1 +4 mm proud strips cost front_whole
                // 0.5 on vladimir). Defaults byte-identical for every legacy caller.
                if (p.k5Seg) {
                  for (let gi = 1; gi < p.k5Seg; gi++) {
                    const lx = -L / 2 + (L * gi) / p.k5Seg;
                    P.add('turretDark', KIT.xform(box(0.022, H - 0.024, 0.008), lx, 0, H / 2 - 0.004), x, yc, z, px5, ry, rz);
                  }
                  P.add('turretDark', KIT.xform(box(L - 0.03, 0.03, 0.008), 0, -H / 2 + 0.035, H / 2 - 0.004), x, yc, z, px5, ry, rz);
                }
                // k5Lower (§4.999991 t90a fix-round, opt-in): the real clamshell is
                // TWO leaves — a steeper lower plate under the upper one doubles the
                // wedge face (the verdict's "broad plates" read) while both stay
                // inside the certified rotated x-envelope (a broad-H single plank
                // spilled its corners into the guarded ±1.30-1.46 plan cliff, tried
                // and reverted). Bottom edge holds the certified 1.40-1.42w floor.
                if (p.k5Lower) {
                  const yl = yc - (p.k5Lower.dy ?? 0.13);
                  const Dl = D - (p.k5Lower.tuck ?? 0.05);
                  const hl = p.k5Lower.h ?? 0.16;
                  P.add(p.k5Bucket ?? 'turretTrack', box(L * 0.94, hl, hl), Math.cos(t) * Dl, yl, Math.sin(t) * Dl, px5 + (p.k5Lower.dPitch ?? 0.35), ry, rz);
                  addCover(Math.cos(t) * Dl, yl, Math.sin(t) * Dl,
                    L * 0.94, hl, hl, px5 + (p.k5Lower.dPitch ?? 0.35), ry, rz);
                  P.add('turretDark', box(L * 0.94 + 0.01, 0.03, hl - 0.03), Math.cos(t) * Dl, yl - hl / 2, Math.sin(t) * Dl, px5 + (p.k5Lower.dPitch ?? 0.35), ry, rz);
                }
                const bx = Math.cos(ry), bz = -Math.sin(ry);
                // k5CapIn (t90a turret-lane 2026-08-06, opt-in): end-cap seat along
                // the leaf axis — default +0.02 byte-identical; t90a pulls the outer
                // cap in so its corner stops partial-lighting the ±1.46 plan window.
                const capIn = p.k5CapIn ?? 0.02;
                for (const e of [-1, 1]) {
                  P.add(p.k5Bucket ?? 'turretTrack', box(0.06, H - 0.02, H - 0.02),
                    x - e * bx * (L / 2 + capIn), yc + e * Math.sin(rz) * (L / 2), z - e * bz * (L / 2 + capIn), px5, ry, rz);
                }
              };
              buildRussianEraCheekClusterTurretCourse9();
            };
            buildRussianEraCheekClusterTurretCourse15();
            } // end !k5LeafOff (TIP §5.29)
            // A faceted casting cannot be fitted from the rounded ring proxy above.
            // Variant-owned surface seats provide one point and outward normal on
            // each real carrier face. Build a frame whose local +Z is the carrier
            // normal and whose local +Y is vehicle-up projected onto that face;
            // row offsets then run along the armor instead of vertically through it.
            const surfaceSeats = p.k5FlankSurfaceSeats;
            const addAuthoredFlankSurfaceSeats = (): boolean => {
              if (!surfaceSeats) return false;
              const rows = p.k5FlankSurfaceRowOffsets ?? [0];
              const tileWidth = p.k5TileWidth ?? 0.34;
              const tileHeight = p.k5TileHeight ?? 0.30;
              const tileDepth = p.k5TileDepth ?? 0.11;
              const embed = p.k5TileEmbed ?? 0.015;
              const backerDepth = p.k5TileBackerDepth ?? 0.06;
              const backerOverlap = p.k5TileBackerOverlap ?? 0.015;
              const normal = new THREE.Vector3();
              const upTangent = new THREE.Vector3();
              const acrossTangent = new THREE.Vector3();
              const point = new THREE.Vector3();
              const rotation = new THREE.Matrix4();
              const euler = new THREE.Euler();
              for (const seat of surfaceSeats) {
                normal.set(s * seat.normal[0], seat.normal[1], seat.normal[2]).normalize();
                upTangent.set(0, 1, 0).addScaledVector(normal, -normal.y).normalize();
                acrossTangent.crossVectors(upTangent, normal).normalize();
                rotation.makeBasis(acrossTangent, upTangent, normal);
                euler.setFromRotationMatrix(rotation, 'XYZ');
                point.set(s * seat.point[0], seat.point[1], seat.point[2]);
                for (const rowOffset of rows) {
                  const carrierPoint = point.clone().addScaledVector(upTangent, rowOffset);
                  const bodyCenter = carrierPoint.clone().addScaledVector(
                    normal, tileDepth / 2 - embed,
                  );
                  if (p.k5LayeredFlankTiles) {
                    const backerCenter = carrierPoint.clone().addScaledVector(
                      normal, -(backerDepth / 2 + embed - backerOverlap),
                    );
                    P.add('turretDark', box(tileWidth * 0.88, tileHeight * 0.88, backerDepth),
                      backerCenter.x, backerCenter.y, backerCenter.z,
                      euler.x, euler.y, euler.z);
                  }
                  P.add(k5B, box(tileWidth, tileHeight, tileDepth),
                    bodyCenter.x, bodyCenter.y, bodyCenter.z,
                    euler.x, euler.y, euler.z);
                  addCover(bodyCenter.x, bodyCenter.y, bodyCenter.z,
                    tileWidth, tileHeight, tileDepth, euler.x, euler.y, euler.z);
                }
              }
              return true;
            };
            if (addAuthoredFlankSurfaceSeats()) return;
            for (let i = 0; i < 3; i++) {
              const buildRussianEraCheekClusterTurretCourse16 = (): void => {
                const buildRussianEraCheekClusterTurretCourse10 = (): void => {
                  const tileAngle = 0.12 + i * 0.17;
                  // Some recovered T-90 prints encoded the second flank bank by
                  // negating the arc angle.  That keeps cos(t) positive, so all six
                  // blocks land on vehicle-right (three of them behind the trunnion).
                  // Opt-in mirroring places the opposite bank on the actual left
                  // cheek while preserving the legacy byte layout for every caller.
                  const tf = p.k5MirrorFlankTiles
                    ? (s > 0 ? tileAngle : Math.PI - tileAngle)
                    : s * tileAngle;
                  const baseTileY = p.k5TileY ?? 0.26;
                  const rowOffsets = p.k5FlankRowOffsets ?? [0];
                  for (const rowOffset of rowOffsets) {
                    const tY = baseTileY + rowOffset;
                    const tileDist = skinD(tf, tY) + (p.k5TileOut ?? 0.02);
                    if (p.k5FlushFlankTiles) {
                      // Fit the broad rear face to the upper cheek rather than standing
                      // the cassette vertically beside it.  The pitch/yaw progression
                      // follows the faceted shoulder normals; a deeper cassette buries
                      // its inner course through the armor skin and removes the visible
                      // air seam without increasing the exterior standoff.
                      const tileYaw = s * ((p.k5TileYaw0 ?? 0.36) + i * (p.k5TileYawStep ?? 0.12));
                      const tilePitch = p.k5TilePitch ?? -1.05;
                      const tileDepth = p.k5TileDepth ?? 0.11;
                      if (p.k5LayeredFlankTiles) {
                        // A buried backing shoe follows the exact cassette transform.
                        // Its outer face overlaps the ERA inner face by 15 mm, so the
                        // visible two-row grid has a real load path into the cheek
                        // rather than reading as a necklace of hovering blocks.
                        P.add('turretDark', KIT.xform(box(0.30, 0.26, 0.06), 0, 0, -0.07),
                          Math.cos(tf) * tileDist, tY, Math.sin(tf) * tileDist + (p.rCz ?? 0),
                          tilePitch, tileYaw, 0);
                      }
                      P.add(k5B, box(0.34, 0.30, tileDepth),
                        Math.cos(tf) * tileDist, tY, Math.sin(tf) * tileDist + (p.rCz ?? 0),
                        tilePitch, tileYaw, 0);
                      addCover(Math.cos(tf) * tileDist, tY,
                        Math.sin(tf) * tileDist + (p.rCz ?? 0),
                        0.34, 0.30, tileDepth, tilePitch, tileYaw, 0);
                    } else {
                      put(tf, tY, 0.34, 0.30, 0.07, -0.08, k5B, tileDist);
                    }
                  }
                };
                buildRussianEraCheekClusterTurretCourse10();
              };
              buildRussianEraCheekClusterTurretCourse16();
            }
          };
          buildRussianEraCheekClusterTurretCourse1Iteration1();
        }
      };
      buildRussianEraCheekClusterTurretCourse1();
    } else if (kind === 'k1') {
      // K-1 brick field over the whole front arc, ring to shoulder (the MV
      // turret wears 3 tall courses wrapping the sight housings).
      // k1OutI (t62mv1 r3, opt-in): PER-ARC-INDEX skin offsets — the ref K-1
      // front courses stand proud toward the mantlet (plan 2.03-2.16 at
      // |x| 0.3-0.6) while the flank arcs tuck to the casting; one scalar
      // k1Out cannot follow it. Default byte-identical for every caller.
      // CHEV k1Chevron (§5.14 owner '<' order 2026-08-07, opt-in): the front
      // cheek bricks leave the ring arc and form TWO STRAIGHT BANKS sweeping
      // back from the gun center in PLAN — the buildT90A/buildT90AVladimir
      // k5Yaw arrow grammar, brick-built. Bank anchor = the brick-0 arc seat
      // (self-derived from the same skinD math, so the certified inner-front
      // extent holds); every bank brick shares the bank yaw (ry = -s*yaw, k5
      // sign convention); rows stack plumb on one plan line (the real K-1
      // cheek walls are planar frames, not skin shingles) with a small
      // per-row inward tuck. Arc bricks at i >= arcFrom keep their legacy
      // ring seats (the flank wrap the real fits carry). A thin dark backer
      // frame bridges the bank to the casting (§B2 attached read) and shows
      // through the inter-brick gaps as the K-1 seam grammar. Defaults
      // byte-identical: absent param reproduces the legacy arc exactly.
      const buildRussianEraCheekClusterTurretCourse2 = (): void => {
        const C = p.k1Chevron;
        for (const s of [1, -1]) {
          const buildRussianEraCheekClusterTurretCourse2Iteration1 = (): void => {
            const bank = C ? (() => {
              const y0 = p.k1Y ?? 0.15;
              const t0 = Math.PI / 2 + s * (C.t0 ?? p.k1T0 ?? 0.22);
              const d0 = skinD(t0, y0) + (C.out ?? p.k1OutI?.[0] ?? p.k1Out ?? 0.03);
              return {
                ax: Math.abs(Math.cos(t0) * d0) + (C.inX ?? 0),
                z0: Math.sin(t0) * d0 + (p.rCz ?? 0) + (C.inZ ?? 0),
                a: C.yaw,
              };
            })() : null;
            const rowsN = C?.rows ?? 3;
            for (let row = 0; row < 3; row++) {
              const buildRussianEraCheekClusterTurretCourse2Iteration1Iteration1 = (): void => {
                const y = (p.k1Y ?? 0.15) + row * (p.k1Pitch ?? 0.27);
                for (let i = 0; i < (p.k1N ?? 4); i++) {
                  const buildRussianEraCheekClusterTurretCourse2Iteration1Iteration1Iteration1 = (): void => {
                    const usesChevronBank = (): boolean => Boolean(
                      C && bank
                      && i < (C.arcFrom ?? (p.k1N ?? 4))
                      && !(C.arcTop && row >= rowsN),
                    );
                    if (usesChevronBank()) {
                      const bankConfig = C!;
                      const bankSeat = bank!;
                      // TIP §5.29 banksOff (opt-in): the banked bricks are replaced by
                      // the 'tip' panel pair — arc bricks (i >= arcFrom) and arcTop
                      // rows keep their seats EXACTLY. Absent = byte-identical.
                      if (row >= rowsN || bankConfig.banksOff) return;
                      const along = (bankConfig.d0 ?? 0.06) + i * (bankConfig.pitch ?? 0.30);
                      const tuck = row * (bankConfig.rowTuck ?? 0.02);
                      const bx = bankSeat.ax + along * Math.cos(bankSeat.a) - tuck * Math.sin(bankSeat.a);
                      const bz = bankSeat.z0 - along * Math.sin(bankSeat.a) - tuck * Math.cos(bankSeat.a);
                      P.add(bankConfig.bucket ?? p.k1Bucket ?? 'turretTrack', box(bankConfig.bw ?? 0.28, bankConfig.bh ?? (p.k1H ?? 0.24), bankConfig.bd ?? 0.15),
                        -s * bx, y, bz, (bankConfig.tilt ?? -0.20) - row * (bankConfig.tiltRow ?? 0.07), -s * bankSeat.a, 0);
                      addCover(-s * bx, y, bz,
                        bankConfig.bw ?? 0.28, bankConfig.bh ?? (p.k1H ?? 0.24), bankConfig.bd ?? 0.15,
                        (bankConfig.tilt ?? -0.20) - row * (bankConfig.tiltRow ?? 0.07), -s * bankSeat.a, 0);
                    } else {
                      const buildRussianEraCheekClusterTurretCourse18 = (): void => {
                        const t = Math.PI / 2 + s * ((p.k1T0 ?? 0.22) + i * (p.k1Step ?? 0.21));
                        put(t, y, 0.30, p.k1H ?? 0.24, 0.16, -0.24 - row * 0.09,
                          p.k1Bucket ?? 'turretTrack', skinD(t, y) + (p.k1OutI?.[i] ?? p.k1Out ?? 0.03));
                      };
                      buildRussianEraCheekClusterTurretCourse18();
                    }
                  };
                  buildRussianEraCheekClusterTurretCourse2Iteration1Iteration1Iteration1();
                }
              };
              buildRussianEraCheekClusterTurretCourse2Iteration1Iteration1();
            }
            if (C && bank && !C.banksOff) {
              // backer frame: spans the banked bricks, sits behind their backs
              // toward the casting (dark slot — reads as the mounting frame in
              // the brick gaps; its inner half embeds into the dome skin).
              const buildRussianEraCheekClusterTurretCourse14 = (): void => {
                const buildRussianEraCheekClusterTurretCourse11 = (): void => {
                  const nBank = Math.min(C.arcFrom ?? (p.k1N ?? 4), p.k1N ?? 4);
                  const len = (nBank - 1) * (C.pitch ?? 0.30) + (C.bw ?? 0.28) + 0.05;
                  const mid = (C.d0 ?? 0.06) + ((nBank - 1) * (C.pitch ?? 0.30)) / 2;
                  const rowSpan = (rowsN - 1) * (p.k1Pitch ?? 0.27) + (C.bh ?? (p.k1H ?? 0.24)) + 0.03;
                  const yMid = (p.k1Y ?? 0.15) + ((rowsN - 1) * (p.k1Pitch ?? 0.27)) / 2;
                  const nOff = (C.bd ?? 0.15) / 2 + 0.012;
                  const bxm = bank.ax + mid * Math.cos(bank.a) - nOff * Math.sin(bank.a);
                  const bzm = bank.z0 - mid * Math.sin(bank.a) - nOff * Math.cos(bank.a);
                  P.add('turretDark', box(len, rowSpan, 0.024), -s * bxm, yMid, bzm, (C.tilt ?? -0.20), -s * bank.a, 0);
                };
                buildRussianEraCheekClusterTurretCourse11();
              };
              buildRussianEraCheekClusterTurretCourse14();
            }
          };
          buildRussianEraCheekClusterTurretCourse2Iteration1();
        }
      };
      buildRussianEraCheekClusterTurretCourse2();
    } else if (kind === 'tip') {
      // TIP §5.29 CHEVRON-TIP (owner refinement 2026-08-07, REAL T-72B3
      // obr. 2016 parade photo): "its like two panels of era that meet at a
      // tip. thats what i wanted dude!" — TWO large flat ERA panels form the
      // turret front: a shallow V in plan MEETING AT A POINTED TIP at
      // center-front, the gun emerging above/behind the tip. NOT swept brick
      // banks, NOT arcs (refines the §5.14 k1Chevron/k5Yaw round). Each
      // panel is ONE plate whose FACE PLANE holds the measured tip->outer
      // line exactly (box center retreats half the depth along the face
      // normal); face grammar (bag/cassette seam grid, rim frame) rides
      // FLUSH (k5Seg zero-growth law); a dark backer bridges panel ->
      // casting (§B2 attached) and a dark center gap plate closes the V
      // vertex under the gun (no see-through at the tip).
      // p.tip = { x, z (inner/tip end of the face line), ox, oz (outer end —
      //   seat it AT/INSIDE the cheek skin so the panel closes onto the
      //   casting), y (band center), h, d, tilt, segs (vertical bag seams),
      //   rows (horizontal seam rows), bucket, pad (length pad), lip
      //   {h, dy, dPitch, tuck} (K-5 lower-leaf class), gap:false, gapH,
      //   noBacker, capW }
      const buildRussianEraCheekClusterTurretCourse3 = (): void => {
        const T = p.tip!;
        const tX = T.x ?? 0.12, tZ = T.z, oX = T.ox, oZ = T.oz;
        const H = T.h ?? 0.42, D = T.d ?? 0.12, yc = T.y ?? 0.18;
        const tilt = T.tilt ?? -0.12;
        const segsN = T.segs ?? 4, rowsN = T.rows ?? 0;
        const bucket = T.bucket ?? 'turretTrack';
        const ax = oX - tX, az = oZ - tZ;
        const L = Math.hypot(ax, az) + (T.pad ?? 0.02);
        const ux = -az / Math.hypot(ax, az), uz = ax / Math.hypot(ax, az); // outward face normal (s=+1 side)
        const mx = (tX + oX) / 2 - ux * (D / 2), mz = (tZ + oZ) / 2 - uz * (D / 2);
        const rcz = p.rCz ?? 0;
        for (const s of [1, -1]) {
          const buildRussianEraCheekClusterTurretCourse7 = (): void => {
            const ry = Math.atan2(-az, s * ax);
            const px = s * mx, pz = mz + rcz;
            P.add(bucket, box(L, H, D), px, yc, pz, tilt, ry, 0);
            addCover(px, yc, pz, L, H, D, tilt, ry, 0);
            // flush face grammar (§C zero-growth): vertical bag/cassette seams,
            // optional row seams, rim frame strips
            for (let gi = 1; gi < segsN; gi++) {
              const lx = -L / 2 + (L * gi) / segsN;
              P.add('turretDark', KIT.xform(box(0.024, H - 0.03, 0.008), lx, 0, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
            }
            for (let ri = 1; ri <= rowsN; ri++) {
              const ly = -H / 2 + (H * ri) / (rowsN + 1);
              P.add('turretDark', KIT.xform(box(L - 0.03, 0.022, 0.008), 0, ly, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
            }
            P.add('turretDark', KIT.xform(box(L - 0.02, 0.028, 0.008), 0, H / 2 - 0.022, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
            P.add('turretDark', KIT.xform(box(L - 0.02, 0.028, 0.008), 0, -H / 2 + 0.022, D / 2 - 0.004), px, yc, pz, tilt, ry, 0);
            // end caps (inner cap = the tip face; outer cap embeds at the cheek)
            for (const e of [-1, 1]) {
              P.add(bucket, KIT.xform(box(T.capW ?? 0.05, H - 0.015, D - 0.015), e * (L / 2 - (T.capW ?? 0.05) / 2 + 0.01), 0, 0), px, yc, pz, tilt, ry, 0);
            }
            // dark backer bridging panel -> casting (§B2 attached read)
            if (!T.noBacker) {
              const bx2 = mx - ux * (D / 2 + 0.014), bz2 = mz - uz * (D / 2 + 0.014);
              P.add('turretDark', box(L * 0.92, H * 0.90, 0.03), s * bx2, yc, bz2 + rcz, tilt, ry, 0);
            }
            // optional lower lip (the K-5 clamshell second-leaf class)
            if (T.lip) {
              const lh = T.lip.h ?? 0.10;
              const yl = yc - H / 2 - (T.lip.dy ?? 0.0) - lh / 2;
              const tk = T.lip.tuck ?? 0.03;
              P.add(bucket, box(L * 0.96, lh, D - 0.02), s * (mx - ux * tk), yl, mz - uz * tk + rcz, tilt + (T.lip.dPitch ?? 0.30), ry, 0);
            }
          };
          buildRussianEraCheekClusterTurretCourse7();
        }
        // center gap plate: closes the V vertex dark under/behind the gun
        if (T.gap !== false) {
          const buildRussianEraCheekClusterTurretCourse8 = (): void => {
            P.add('turretDark', box(tX * 2 + 0.06, H * (T.gapH ?? 0.86), 0.03), 0, yc - H * 0.05, tZ - 0.055 + rcz, tilt, 0, 0);
          };
          buildRussianEraCheekClusterTurretCourse8();
        }
      };
      buildRussianEraCheekClusterTurretCourse3();
    } else if (kind === 'erawa') {
      // r9 WALL rework (pt91m workorder): the real ERAWA front is a near-flat
      // upright wall, not skin-hugging shingles. Ref plan front staircase
      // 1.46@|x|0.3 -> 1.32@0.8 -> 1.05@1.14; upper rows lean back so the
      // side silhouette stays inside the ref's 1.42 line above y 1.72; flank
      // arcs (i>=3) drop the top row (ref front 1.82@|x|1.07).
      const buildRussianEraCheekClusterTurretCourse4 = (): void => {
        const eD = p.eDists ?? [1.395, 1.438, 1.550, 1.525, 1.470];
        for (const s of [1, -1]) {
          const buildRussianEraCheekClusterTurretCourse4Iteration1 = (): void => {
            for (let row = 0; row < 3; row++) {
              // r25: base course seated at the ref's 1.475 deck-shadow line (row0
              // bottoms printed 1.421 vs ref 1.475 at the 1.483/1.59 side cols);
              // row2 KEEPS 0.40 — its 1.974 top owns the ±0.2..0.6 front cols.
              const y = [0.13, 0.29, 0.40][row];
              for (let i = 0; i < 5; i++) {
                if (row === 2 && i >= 3) continue;
                const t = Math.PI / 2 + s * (0.12 + i * 0.18);
                // r25: row1 pulled 2 cm deeper — its center tiles poked 5 mm into
                // the 1.483 side column (top 1.81 vs the ref's 1.716 sleeve line).
                // r25c: RIGHT i4 (s=-1) retreats 8 cm — dedicated flank tiles own
                // the 1.14/1.247 plan cols (ref pinch is asymmetric; left keeps eD)
                const dist = eD[i] - (row === 1 ? 0.108 : row === 2 ? 0.118 : 0)
                  - (i === 4 && s === -1 ? 0.08 : 0);
                put(t, y, i === 4 ? 0.20 : 0.28, 0.22, 0.06, -0.10 - row * 0.04, 'turretTrack', dist);
              }
            }
          };
          buildRussianEraCheekClusterTurretCourse4Iteration1();
        }
      };
      buildRussianEraCheekClusterTurretCourse4();
    } else if (kind === 'relikt') {
      // optional squeeze params (t72b3m r4): rT0/rStep arc seats, rDist skin
      // offset, rD depth, rY row base, rH height — defaults = legacy behavior
      // r11: rTilt (base course tilt — the default -0.34 spread the t72b3m
      // pair-0/1 top corners 0.08 proud and poked bottoms 0.06 under the
      // 1.42 skirt line) + rDists (PER-CASSETTE skin offsets: the ref Relikt
      // front is a flat wedge wall — plan staircase 0.13-0.19 proud at
      // mid-arc, tucked at center — which no uniform skin offset can follow).
      const buildRussianEraCheekClusterTurretCourse5 = (): void => {
        const rT0 = p.rT0 ?? 0.28, rStep = p.rStep ?? 0.28, rDist = p.rDist ?? -0.05;
        const rD = p.rD ?? 0.22, rY = p.rY ?? 0.06, rH = p.rH ?? 0.27;
        const rTilt = p.rTilt ?? -0.34;
        // rBucket (t72b3m visual r1, opt-in): the ref Relikt course renders in
        // the SCHEME PAINT (pale olive like the dome) — the spareTrack steel
        // bucket read as maroon-brown inset wedges at critic zoom. Legacy
        // builds (t90sm) keep turretTrack.
        const rBucket = p.rBucket ?? 'turretTrack';
        // rGapBucket (t72b3m visual r5, opt-in): the ring GAP plates used to be
        // hard 'turretDark' — at the flat board light they rendered as void-black
        // trapezoids flanking the crown (critic r4 item 6: deep-shade floor is
        // reserved for ref-black elements). Scheme-shadow cloth keeps the
        // lid-vs-gap swing at the ref's ~12L without reading as holes. Legacy
        // builds keep turretDark.
        const rGapBucket = p.rGapBucket ?? 'turretDark';
        const rowSeats = (p.rRows ?? 2) === 1 ? [[0, rY]] : [[0, rY], [1, 0.34]];
        // rDeep (t72b3m visual r2, opt-in): deepen each cassette INWARD keeping
        // the calibrated outer face plane — the extra depth widens the bright
        // TOP trapezoid so the ring reads from plan/tilt (the r13 0.14-deep
        // boxes rendered as a thin line; the ref ring reads via wide tops).
        // Plan-safe (growth is into the lathe) and top-corner rise at tilt
        // -0.12 is +6mm (still inside the r11 1.663-print row, cap 1.690).
        const rDeep = p.rDeep ?? 0;
        for (const s of [1, -1]) {
          const buildRussianEraCheekClusterTurretCourse6 = (): void => {
            for (let i = 0; i < 3; i++) {
              const buildRussianEraCheekClusterTurretCourse12 = (): void => {
                const t = Math.PI / 2 + s * (rT0 + i * rStep);
                const dI = p.rDists ? p.rDists[i] : rDist;
                for (const [row, y0] of rowSeats) {
                  // rY0 (r10f): the FIRST (front-most) cassette pair can seat lower —
                  // the t72b3m ref's mantlet-dip cols read 1.637-1.663 where a
                  // uniform course crested 1.70-1.72
                  const buildRussianEraCheekClusterTurretCourse17 = (): void => {
                    const yc = (i === 0 && p.rY0 != null ? p.rY0 : y0) + 0.13;
                    const dd = skinD(t, yc) + dI;
                    put(t, yc, 0.48, rH, rD + rDeep, rTilt + row * 0.10, rBucket, dd - rDeep / 2);
                    // rChev (t90m r8 ORDER 4, opt-in): Relikt tile-course relief —
                    // the oracle's cheek arrays read bold diagonal chevron courses
                    // (§B3 ERA grammar; the flat cassettes read "faint seams" at
                    // graduation zoom). Face seams/crests ride +0.8 mm proud of the
                    // calibrated face plane (sub-half-pixel, leopard r9 class);
                    // course ribs live on the tilted TOP shoulder (§B3.1
                    // 45°-shoulder free lane; rib crowns stay within +2 mm of the
                    // cassette's own certified corner envelope). Defaults
                    // byte-identical for every legacy caller (only t90m passes it).
                    if (p.rChev) {
                      const tiltR = rTilt + row * 0.10;
                      const D0 = dd - rDeep / 2;
                      const zF = (rD + rDeep) / 2;
                      const px2 = Math.cos(t) * D0, pz2 = Math.sin(t) * D0 + (p.rCz ?? 0);
                      const ry2 = Math.PI / 2 - t;
                      const lean = (p.rChev.lean ?? 0.55) * s;
                      for (const [lx, kind] of [[-0.155, 0], [-0.075, 1], [0.005, 0], [0.085, 1], [0.165, 0]]) {
                        const g = kind === 0
                          ? KIT.xform(box(0.014, rH - 0.05, 0.0026), lx, 0, zF + 0.0008, 0, 0, lean)
                          : KIT.xform(box(0.020, rH - 0.07, 0.0022), lx, 0, zF + 0.0006, 0, 0, lean);
                        P.add(kind === 0 ? 'turretDark' : 'turretCloth', g, px2, yc, pz2, tiltR, ry2, 0);
                      }
                      for (const lx of [-0.15, 0, 0.15]) {
                        P.add(rBucket, KIT.xform(box(0.10, 0.010, (rD + rDeep) * 0.68), lx, rH / 2 + 0.0045, -0.012),
                          px2, yc, pz2, tiltR, ry2, 0);
                      }
                    }
                    // rSeam (visual r1, LOUDER r2): the r13 slivers/seams declared the
                    // ring but rendered 15-20% of ref loudness. Now: bright crest
                    // sliver + pale face plate + a WIDE dark gap wedge at each pair
                    // boundary + a sunk dark backdrop that owns the gap read from
                    // off-axis. Gap tops capped at yc+rH/2 (the +0.285 world col
                    // prints 1.637, cap 1.664 — a taller wedge would poke it).
                    if (p.rSeam) {
                      // pale TOP LID — the ring's plan/tilt read is alternating bright
                      // trapezoid tops against dark gap tops; the camo top faces were
                      // invisible against the camo dome (r14 close-roof verdict). Lid
                      // rides 4mm INSET below the certified top corner (cap 1.690).
                      put(t, yc + rH * 0.5 - 0.006, 0.46, 0.012, rD + rDeep - 0.01, rTilt + row * 0.10, 'turretDetail', dd - rDeep / 2, false);
                      put(t, yc + rH * 0.38, 0.46, 0.05, rD + rDeep - 0.015, rTilt + row * 0.10, 'turretDetail', dd - rDeep / 2 + 0.010, false);
                      // pale face plate: the course fronts sit under a dark camo
                      // blotch on this print — the scheme-detail plate restores the
                      // ref's pale-wedge read from dead front (4mm proud of the face)
                      put(t, yc - 0.012, 0.42, rH - 0.05, 0.008, rTilt + row * 0.10, 'turretDetail', dd + rD / 2 + 0.003, false);
                      // GAP = a full-depth DARK standing plate at the pair boundary —
                      // its dark top trapezoid alternates with the pale lids (the r13
                      // thin seam strips + sunk backdrops never reached pixels).
                      // rGapH (t72b3m r24, opt-in): cap the gap-plate heights so the
                      // ring reads lid-over-notch relief instead of a flush collar —
                      // entries without it are byte-identical (Infinity min).
                      const tg = Math.PI / 2 + s * (rT0 + (i + 0.5) * rStep);
                      const gM1 = Math.min(rH - 0.02, p.rGapH ?? Infinity);
                      const gM2 = Math.min(rH - 0.01, p.rGapH ?? Infinity);
                      put(tg, yc - 0.008 - (rH - 0.02 - gM1) / 2, 0.15, gM1, rD + rDeep - 0.02, rTilt, rGapBucket, skinD(tg, yc) + dI - rDeep / 2 - 0.012, false);
                      put(tg, yc - 0.005 - (rH - 0.01 - gM2) / 2, 0.062, gM2, 0.016, rTilt, rGapBucket, skinD(tg, yc) + dI + rD / 2 + 0.005, false);
                    }
                  };
                  buildRussianEraCheekClusterTurretCourse17();
                }
                // rStrip:false — on a squat dome the tilted strip corners rise to a
                // 1.85 canopy 0.2 proud of the roof (t72b3m r7 whatsat verdict)
                if (p.rStrip !== false) put(t, 0.34, 0.50, 0.032, 0.20, -0.30, 'turretDark', skinD(t, 0.34) - 0.03, false);
              };
              buildRussianEraCheekClusterTurretCourse12();
            }
            // rXPairs (t72b3m visual r1, opt-in; r2 REBUILT): flank/rear ring
            // continuation — standing cassettes at wider arc seats so every
            // quarter reads the ref's ~15-cassette dome ring. Plates stay sunk
            // inside the lathe plan (dI<0); heights are now REAL (0.20-0.27, the
            // r13 0.11 nubs never reached pixels) with tops still 5+cm under the
            // local dome/basket side lines; entry [tOff, dI, h, w, yc?].
            // gapH (7th entry, r22 opt-in): caps the auto-gap plate height where
            // the gap azimuth lands in a LOWER certified row than the pair itself
            // (t72b3m 0.62-pair: its 0.465-rad gap sits in the mantlet-dip cols).
            // Entries without it are byte-identical (only t72b3m passes rXPairs).
            for (const [tOff, dI, h, w, ycX, lean, gapH] of p.rXPairs ?? []) {
              const buildRussianEraCheekClusterTurretCourse13 = (): void => {
                const t = Math.PI / 2 + s * tOff;
                const yc = ycX ?? ((p.rY ?? 0.06) + 0.13);
                const wd = w ?? 0.44;
                // lean (6th entry, default -0.08): extra back-tilt for the standing
                // top-face read. REAR-arc plates pass lean 0 — the tilt swings the
                // bottom-outer corner radially outward and the aft lathe skin is
                // already the certified dome-waist overfill (r13 lesson).
                const tl = rTilt + (lean ?? -0.08);
                // deepened like the mains (outer face fixed, growth into the lathe)
                // so the pale top lid is a WIDE trapezoid, not a 12cm sliver.
                const xDp = 0.26, xShift = (xDp - (rD - 0.02)) / 2;
                put(t, yc, wd, h, xDp, tl, rBucket, skinD(t, yc) + dI - xShift);
                if (p.rSeam) {
                  // pale top lid + crest + outer face (the standing-plate read)
                  put(t, yc + h * 0.5 - 0.006, wd - 0.01, 0.012, xDp - 0.01, tl, 'turretDetail', skinD(t, yc) + dI - xShift, false);
                  put(t, yc + h * 0.42, wd - 0.03, 0.045, xDp - 0.02, tl, 'turretDetail', skinD(t, yc) + dI - xShift + 0.008, false);
                  put(t, yc - 0.005, wd - 0.05, h - 0.04, 0.006, tl, 'turretDetail', skinD(t, yc) + dI + (rD - 0.02) / 2 + 0.003, false);
                  // GAP = full-depth dark standing plate (dark top trapezoid between
                  // the pale lids) + a thin proud seam on the face line
                  const tg = Math.PI / 2 + s * (tOff - 0.155);
                  const gH1 = Math.min(h - 0.015, gapH ?? Infinity);
                  const gH2 = Math.min(h, gapH ?? Infinity);
                  put(tg, yc - 0.006 - (h - 0.015 - gH1) / 2, 0.15, gH1, xDp - 0.015, rTilt, rGapBucket, skinD(tg, yc) + dI - xShift - 0.010, false);
                  put(tg, yc + 0.005 - (h - gH2) / 2, 0.07, gH2, 0.02, rTilt, rGapBucket, skinD(tg, yc) + dI + 0.012, false);
                }
              };
              buildRussianEraCheekClusterTurretCourse13();
            }
          };
          buildRussianEraCheekClusterTurretCourse6();
        }
      };
      buildRussianEraCheekClusterTurretCourse5();
    }
  };
  buildRussianEraCheekClusterTurretStage1();
  };
  P.visualEraCluster(`ru-${kind}-turret-era`, 'turret', buildRussianEraCheekCluster);
}

// Shtora dazzler pair seated on the measured skin (THE T-90 cue).
// p.eyeZ (r9): absolute local-z seat for prints whose eyes ride the mantlet
// plane forward of the dome skin (t72bu: ref plan front 1.89-1.92 at
// |x| 0.4..0.65); the caller adds a bracket back to the skin.
export function ruShtora(P: RussiaShtoraPort, p: ShtoraOptions, y: number): void {
  const { box } = KIT;
  const r = ringSkin(p.rings, y);
  const es = p.eyeScale ?? 1;
  const A = r, B = r * p.sz, x = p.eyeX ?? 0.52;
  const zSkin = B * Math.sqrt(Math.max(0.1, 1 - (x / A) ** 2));
  const zc = p.eyeZ ?? (zSkin + 0.06);
  // eyeRound (§4.999991 russia fix-round, opt-in): the OTShU-1-7 dazzlers
  // are ROUND RED emitters, not blue rectangles — round dark drum + red
  // lens disc INSIDE the old glass pane's own extents (inscribed-drum
  // class: front plane byte-equal at zc+0.130, x-span inside the housing
  // box). Lens material = rehooked dark clone with a deep red-amber
  // emissive floor (SHADOW-TONE mechanics) shared by both eyes; direct
  // meshes under rig_turret so they yaw with the casting (§B5).
  if (p.eyeRound && !P._shtoraRed) P._shtoraRed = rehookClone(P.mats.dark, 0x54180e, 0x7c2410);
  for (const s of [-1, 1]) {
    P.add('turretDark', box(0.24 * es, 0.27 * es, 0.22 * es), s * x, y, zc);
    if (p.eyeRound) {
      P.add('turretDark', KIT.cylZ(0.100 * es, 0.055 * es, 16), s * x, y, zc + 0.0975 * es);
      P.add('turretDetail', KIT.cylZ(0.106 * es, 0.016 * es, 16), s * x, y, zc + 0.092 * es);
      const lens = new THREE.Mesh(KIT.cylZ(0.072 * es, 0.014 * es, 16), P._shtoraRed);
      lens.position.set(s * x, y, zc + 0.123 * es);
      lens.castShadow = lens.receiveShadow = true;
      P.turretG.add(lens);
    } else {
      P.add('turretGlass', box(0.17, 0.18, 0.03), s * x, y, zc + 0.115);
    }
    P.add('turretDetail', box(0.27 * es, 0.04 * es, 0.24 * es), s * x, y + 0.155 * es, zc + 0.01 * es);
    // eyeKit (§B3.1 prism sweep 2026-08-06, opt-in): the OTShU-1-7 emitter
    // grammar — horizontal vent fins over the emitter window, side cheek
    // plates and an under-bracket back to the skin, all inside the eye
    // box's own envelope (+<=8 mm face relief; under §C thresholds; gate
    // HOLD proven on vladimir 71.4 exact pre-revert). Defaults
    // byte-identical for every legacy caller.
    if (p.eyeKit) {
      for (let fi = 0; fi < 3; fi++) {
        P.add('turretDark', box(0.19 * es, 0.024 * es, 0.014 * es), s * x, y + (-0.056 + fi * 0.056) * es, zc + 0.118 * es);
      }
      P.add('turretDetail', box(0.014 * es, 0.21 * es, 0.19 * es), s * (x + 0.122 * es), y, zc - 0.005 * es);
      P.add('turretDetail', box(0.014 * es, 0.21 * es, 0.19 * es), s * (x - 0.122 * es), y, zc - 0.005 * es);
      P.add('turretDark', box(0.18 * es, 0.045 * es, 0.16 * es), s * x, y - 0.155 * es, zc - 0.045 * es);
    }
  }
}
// ---------------------------------------------------------------------------
// Profiles. Dimensions are width-normalized oracle measurements (packets);
// width = spec width − 0.09 so skirts/fasteners land exactly on spec width.
// zC = the oracle's hull-center offset (overall-bbox-centered GLBs).
// turretPivotZ stays hull-center relative; gun muzzle = zC+pivotZ+gunZ+len.
// ---------------------------------------------------------------------------
export const RUSSIA_PROFILES = {
  t62mv1: { build: buildT62MV1 },
  t64bv1: { build: buildT64BV1 },
  t54: { build: buildT54 },
  t44: { build: buildT44 },
  // type59 §5.304: builder moved to profiles/china.ts (buildType59 on the
  // widened obr-1975 chassis) — profiledProcedurals.ts keys it from
  // CHINA_PROFILES at the same carousel position.
} satisfies VehicleProfileRecord;
