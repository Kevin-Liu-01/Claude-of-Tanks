import type { SnapGroupOptions, TankBuilderPort } from '../tankFactoryCore.ts';
import { buildT64BV1 } from './t64bvK1.ts';
import { buildT64BV } from './t64KontaktFamily.ts';
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
import { KIT, MUDGUARDS, orientedSlab } from './kit.ts';
import { cloneRehookedVehicleMaterial } from '../materials.ts';
import { addShtoraEyes } from './shtora.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import { buildT55A } from './t54Family.ts';
import { buildT62Obr1975 } from './t62Family.ts';

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
  /** Seats the fittings authored in `build` on their rig group's stock once the profile is done (fittingSnap.ts). */
  snapGroup?(label: string, build: () => void, options?: SnapGroupOptions): void;
}

// Owner float sweep 2026-10-19: seat a small fitting on its stock when the port can (P.snapGroup, fittingSnap.ts).
function seatRu(P: RussiaGeometryPort, label: string, build: () => void, options: SnapGroupOptions): void {
  if (P.snapGroup) P.snapGroup(label, build, options);
  else build();
}

interface RussiaGunPort extends RussiaGeometryPort {
  muzzleZ?: number;
}

interface RussiaGunMountPort extends RussiaGeometryPort {
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface RussiaSkirtPort extends RussiaGeometryPort {
  hangMudguard?(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface RussiaMudguardPort extends RussiaGeometryPort {
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

interface RussiaEraPort extends RussiaGeometryPort {
  visualEraCluster(key: string, owner: 'hull' | 'turret', build: () => void): void;
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
  readonly closeBase?: boolean;
}

interface CurvedDomeOptions {
  readonly capR?: number;
  readonly roofTiltScale?: number;
  readonly bucket?: string;
  readonly closeBase?: boolean;
}

interface DomeOptions {
  readonly closeBase?: boolean;
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
  /** The front panel's top falls this far toward its bow end (default 0: every panel square). */
  readonly frontRake?: number;
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

// THREE is used only for the t72b3m_2022 r23 light-immune flat class (kf51_evo r7
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
  // (t72b3m_2022 §B4: the track-bay roof lifts above the idler/sprocket wrap
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
  // owner 2026-10-19 ("the empty gaps in hulls are annoying"): a knot pair closer than 15 mm was skipped, which left
  // that sliver open between its neighbours (the T-90 stern's 8 mm seam, where the whole stern floated); the sliver
  // now opens the next segment instead.
  let carried: number | null = null;
  for (let i = 0; i < zs.length - 1; i++) {
    const z0: number = carried ?? zs[i], z1: number = zs[i + 1];
    if (z1 - z0 < 0.015) { carried = z0; continue; }
    carried = null;
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

// Canonical T-80 cast-turret shell, shared by every T-80 family builder.
// This is the accepted T-80/T-80B/T-80U Kursk nine-ring silhouette. Variant
// identity belongs in armor and equipment, never in another base casting.
const T80_CAST_TURRET_RINGS = Object.freeze([
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
  closeBase = false,
}: T80CastTurretOptions = {}) {
  const rawRings = T80_CAST_TURRET_RINGS;
  const firstRawRing = rawRings[0]!;
  const lastRawRing = rawRings[rawRings.length - 1]!;
  const baseY = firstRawRing[1];
  const rings = rawRings.map(([r, y]) => [r, baseY + (y - baseY) * scaleY]);
  if (curved) {
    meshDomeCurved(P, rings, sz, cx, cz, { capR, roofTiltScale, closeBase });
  } else {
    meshDome(P, rings, sz, cx, cz, { closeBase });
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
export function meshDome(
  P: RussiaGeometryPort, rings: readonly DomeRing[], sz: number, cx = 0, cz = 0, o: DomeOptions = {},
): void {
  P.add('turret', KIT.lathe(rings, P.q ? 30 : 16, sz), cx, 0, cz);
  if (o.closeBase) addDomeBaseCap(P, 'turret', rings, P.q ? 30 : 16, sz, cx, cz);
}

// TANK-OPT companions (227): the lathe dome has no floor, so once a cook-off throws the turret a camera below it looks
// up through the open base into the casting's inside. The cap is a downward disc on the dome's first ring, built by the
// same lathe so its rim shares the dome's base vertices exactly. Opt-in per builder: every other dome keeps its bytes.
function addDomeBaseCap(
  P: RussiaGeometryPort, bucket: string, rings: readonly DomeRing[], segments: number, sz: number, cx: number, cz: number,
): void {
  const [r0, y0] = rings[0];
  P.add(bucket, KIT.lathe([[0, y0], [r0, y0]], segments, sz), cx, 0, cz);
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

// r15 CURVED DOME SHELL (t72b3m_2022 visual r4 item 1, opt-in — siblings keep
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
// o.bucket (t72b3m_2022 r18 item 5b, opt-in): the crown cap can render in a
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
  if (o.closeBase) addDomeBaseCap(P, 'turret', rings, seg, sz, cx, cz);
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

// r15 item 6 (t72b3m_2022): chamfered roof plate — same outer face planes and
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
// cx (r9): tiny lateral seat for warp-biased reference tubes (t72b3m_2022 ref
// tube spans x -0.05..+0.17): the tube stays a TRUE CYLINDER (top-down
// circle law) — only its axis shifts a few cm, invisible at tank scale but
// it decides which 0.107 m plan columns the tube owns.
export function tubeGun(P: RussiaGunPort, segs: readonly GunSegment[], opts: TubeGunOptions = {}): void {
  const { cylZ } = KIT;
  const seg = P.q ? 24 : 12;
  // cy (r10f): tiny per-segment vertical seat — the t72b3m_2022 ref's printed
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
  // 2026-10-17 (the wheel-band lane, round 2): the re-hooked clone in its base's cascade registration
  const m = cloneRehookedVehicleMaterial(base);
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
  // hlX (t90sm_2013 r12, opt-in): the default w*0.44 seat lands INSIDE the track
  // lane on wide hulls — with a low hlY the housings share §B4 boundary
  // voxels with the idler wrap. Default byte-identical.
  // lights:false (§4.999991 fix-round, opt-in): skip the bucket headlights
  // so the caller can mount FITTINGS.lightCluster pods on rehooked
  // shadow-olive clones at the same seats (SHADOW-TONE order — the merged
  // hullDetail/hullDark drums rendered unmovable near-black at the bow
  // corners). Default byte-identical.
  // 2026-10-19 (owner float sweep): on the T-80 line the lamps stood 54-243 mm clear of the bow (ahead of the falling
  // sponsons); each lamp is seated on the nearest bow stock (a lamp already touching stays where it is).
  if (o.lights !== false) {
    seatRu(P, 'ru-headlight', () => headlight(P, -(o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05), { reachM: 0.25 });
    seatRu(P, 'ru-headlight', () => headlight(P, (o.hlX ?? o.w * 0.44), o.hlY ?? (yG + 0.10), zG + 0.14, -0.30, 0.05), { reachM: 0.25 });
  }
}

// Soviet deck furniture at explicit seats: driver hatch, engine grilles.
export function ruDeck(P: RussiaGeometryPort, o: DeckOptions): void {
  const { box, cylY } = KIT;
  // hatchY (r10): hatch seat on the LOCAL deck line when it differs from the
  // grille plateau (t72b3m_2022 glacis hatch sits at 1.34, plateau 1.40)
  const hY = o.hatchY ?? o.deckY;
  // 2026-10-19 (owner float sweep): where the deck falls under the hatch seat the hatch stood up to 15 mm over it; it
  // drops onto the deck (a hatch already on it stays).
  seatRu(P, 'ru-driver-hatch', () => {
    P.add('hull', cylY(0.24, 0.24, 0.04, 14), o.hatchX ?? 0, hY + 0.025, o.hatchZ);
    P.add('hullDark', cylY(0.247, 0.247, 0.012, 14), o.hatchX ?? 0, hY + 0.032, o.hatchZ);
  }, { reachM: 0.03, mode: 'down' });
  // periY: near-flush driver periscopes (t72b3m_2022 r6 — ref deck line is clean)
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) - 0.16, o.periY ?? (o.deckY + 0.05), o.hatchZ + 0.30);
  KIT.periscope(P, 'hullDetail', (o.hatchX ?? 0) + 0.16, o.periY ?? (o.deckY + 0.05), o.hatchZ + 0.30);
  // gY/ribY (t90am PERFECTION r3, opt-in): explicit grille-plate / rib seats
  // for refs whose engine deck reads FLUSH (the t90am ref holds a clean
  // 1.365-1.368 line over its whole grille run; the default +0.026 ribs
  // printed 1.402 across five side cols). Defaults byte-identical.
  // 2026-10-19 (owner float sweep): the grille plates and ribs keep one flat seat, so where the deck falls aft they
  // stood 9-42 mm over it; each plate and rib drops onto the deck (those already on it stay).
  for (let i = 0; i < (o.grilles ?? 6); i++) {
    seatRu(P, 'ru-deck-grille', () => P.add('hullDark', box(o.gw ?? 1.5, 0.018, 0.075), o.gx ?? 0, (o.gY ?? o.deckY) + 0.012, o.gz - i * 0.24), { reachM: 0.05, mode: 'down' });
    seatRu(P, 'ru-deck-rib', () => P.add('hullDetail', box(o.gw ?? 1.5, 0.028, 0.026), o.gx ?? 0, (o.ribY ?? ((o.gY ?? o.deckY) + 0.026)), o.gz - 0.12 - i * 0.24), { reachM: 0.05, mode: 'down' });
  }
}

// Segmented rubber skirt band with dark inset lip (r3 language, explicit y).
// o.th: panel thickness (default 0.04) — front-view columns only register
// the band when the face is >1-2 mask pixels deep (t62_1975 r6 lesson).
function addRuSkirtPanel(
  P: RussiaSkirtPort,
  options: SkirtBandOptions,
  side: number,
  index: number,
  panelD: number,
  last: boolean,
): void {
  const { box } = KIT;
  // owner 2026-10-19 sweep: on most of the T-72/T-80/T-90 courses the panels' tops stopped 2-10 cm under the fender
  // and nothing held them; each upper panel is hung from the fender over it (mudguardHangers.ts)
  const panel = (slot: string, geometry: THREE.BufferGeometry, x: number, y: number, z: number): void => {
    if (P.hangMudguard) P.hangMudguard('ru-skirt-panel', slot, geometry, x, y, z);
    else P.add(slot, geometry, x, y, z);
  };
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
  // frontRake (T-90M 249, opt-in): the front panel's top falls toward the bow, under the gun's sweep over the corner
  const rake = last ? options.frontRake ?? 0 : 0;
  if (rubberBottomH > 0) {
    panel('hull', box(options.th ?? 0.04, panelH - rubberBottomH, panelD * 0.94),
      side * options.x, panelYMid + rubberBottomH / 2, z);
    P.add('hullRubber', box(options.th ?? 0.04, rubberBottomH, panelD * 0.94),
      side * options.x, panelYBot + rubberBottomH / 2, z);
  } else if (rake > 0) {
    const t = (options.th ?? 0.04) / 2, d = panelD * 0.47, h = panelH / 2;
    panel('hull', orientedSlab(
      [-t, -h, d], [t, -h, d], [t, -h, -d], [-t, -h, -d],
      [-t, h - rake, d], [t, h - rake, d], [t, h, -d], [-t, h, -d],
    ), side * options.x, panelYMid, z);
  } else {
    panel('hull', box(options.th ?? 0.04, panelH, panelD * 0.94),
      side * options.x, panelYMid, z);
  }
  // dressIn (pt91m r25, opt-in): pull the seam battens/bolt heads inboard
  // so the panel FACE is the station-widest course (the default battens
  // print o.x+0.027 and owned five station slices at +1.9 cm/side).
  const dressIn = options.dressIn ?? 0;
  // 2026-10-19 (owner float sweep): a deep dressIn pulled the batten and bolt heads clear behind the panel (15-22 mm
  // off it), and the course's last batten stood 16 mm past its panel's end with no backing strip; the dressed seats
  // stop 2 mm inside the panel's inner face, and the last batten caps its own panel's end.
  const thick = options.th ?? 0.04;
  P.add('hullDark', box(0.048, (panelH - rake) * 0.9, 0.02),
    side * Math.max(options.x + 0.003 - dressIn, options.x - thick / 2 - 0.022), panelYMid - rake / 2,
    last ? z + panelD * 0.47 - 0.008 : z + panelD / 2);
  // A backing strip behind each joint carries the panels as one course and the joint's batten with them (owner
  // 2026-10-19 sweep: the 6 % joints left every panel, and every batten, on its own, and a panel with no fender over
  // it floated). It laps 20 mm into each panel's back and stays 19 mm inside the outer face line.
  if (!last) {
    const th = options.th ?? 0.04, inner = options.x - th / 2 - 0.009, outer = options.x - Math.min(0.019, th / 2 - 0.001);
    P.add('hull', box(outer - inner, panelH * 0.5, panelD * 0.06 + 0.04),
      side * (inner + outer) / 2, panelYMid, z + panelD / 2);
  }
  P.add('hullDark', KIT.cylZ(0.014, 0.014, 8),
    side * Math.max(options.x + 0.015 - dressIn, options.x - thick / 2 - 0.005), options.yTop - rake / 2 - 0.07, z,
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

export function ruSkirtBand(P: RussiaSkirtPort, o: SkirtBandOptions): void {
  const panels = o.panels ?? 7;
  const panelD = (o.z1 - o.z0) / panels;
  for (const s of [-1, 1]) {
    for (let i = 0; i < panels; i++) {
      addRuSkirtPanel(P, o, s, i, panelD, i === panels - 1);
    }
  }
}

// Front/rear rubber mud flaps over the track runs.
export function ruFlaps(P: RussiaMudguardPort, o: FlapOptions): void {
  for (const s of [-1, 1]) {
    const xf = s * o.x;
    if (o.front) MUDGUARDS.add(P, { hang: true,
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
// ---- PT-91M Pendekar (docs/references/profiles/pt91m.json) ----------------
// Centered frame: hull ±3.85, deck 1.81, tall powerpack stack (±0.9 wide,
// steps 2.02/2.16) over the raised tail, glacis -> 1.44@3.80; skirts ±1.735
// with ERAWA plates ±1.79 on the front half; dome crown ~2.33 center 0.18,
// left cluster 2.64, pano 2.85, met mast 3.82 @ (-0.25, -1.0); tube axis
// 2.008, sleeve r.122, muzzle 6.58.
// Invisible width anchor: sub-pixel studs at the exact normalized half-width
// (is7 precedent) so safeScale stays 1.0 and authored heights hold.
// 2026-10-22 (owner float calls): `innerX` is the face a stud stands on; the stud runs inboard to it, its outer face
// still the width plane (the default is the old 12 mm stud).
export function widthAnchor(P: RussiaGeometryPort, halfW: number, y: number, z: number, innerX = halfW - 0.012): void {
  for (const s of [-1, 1]) P.add('hull', KIT.box(halfW - innerX, 0.02, 0.02), s * (halfW + innerX) / 2, y, z);
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
// center V-bow (t90sm_2013 bow-notch class); rear plate -2.90 full width with the
// drum/log RACK to -3.43 at |x|<=0.99 (tops 1.84, floor 1.23-1.44); WELDED
// turret vs the t90a_2004 cast dome — flat cheeks (plan front 1.91 center ->
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
// thin slivers only — hullLengthM sovereign, the t90sm_2013 tail-sliver class);
// skirt-front ERA x 1.83..1.91 / y 0.83..1.43 / z 0.59..2.58 (3 per side);
// glacis K-5 rows y 0.84..1.13 @ z 2.26..2.84 + y 1.11..1.33 @ z 1.80..2.27.
// Turret casting z -1.23..+1.16 (max halfW 1.66 @ -0.27, nose 0.69 @ +1.12),
// ring skirt bottom 1.408, crown ~2.20; the print's OWN K-5 chevron is the
// §5.29 tip read: inner plates flank the gun (|x| 0.34..0.59, z to 1.34),
// mid leaves |x| 0.83..1.44 z to 1.21, outer leaves |x| 1.00..1.74 z
// 0.07..0.87 — one V line (±0.30, 1.42) -> (±1.62, 0.45); roof plates to
// 2.32 (authored 2.24 tops — dims p95 cap, the t90sm_2013 mushroom class); NSVT
// mass to 2.86 over z -0.57..+0.16 (matched to the dims budget only —
// t62_1975 DShK certified-cap class, §5.37 NSVT-prominence ASK-OWNER trade);
// rear bustle rack to -2.15 (halfW 0.76), whip antenna at (-0.27, -1.22).
// Gun axis 1.72, print muzzle 5.99 -> authored 6.10 (overall 9.53
// sovereign). Authored frame = print +0.05 z (body ±3.43), ground y=0.
// FAMILY LAW §5.13: the landed t90a_2004 kit grammar (K-5 chevron front, round
// red Shtora eyes, saddle/collar/boot gun assembly, glacis kit) on the base
// mark's own CAST dome — the print is cast (the 1992 turret); the §5.13
// welded-rebase order named t90a_2004/vladimir; the t72 graduates keep the
// fleet's cast grammar. SPIN §5.31: pivot at the casting plan-chord center
// (chord -1.18..+1.21 authored -> center ~0 = turretG z 0).
// ---- T-90MS Tagil (export demonstrator) — §5.38 owner priority wave --------
// Print: public/models/community-candidates/t90ms_kojf.glb (LOCAL-ONLY
// quarantine, semantic OBJ re-bake; vertex REG + harness maps, 7b45f13).
// Probe receipts (tmp-t90fam-probe, raw ~1:1; authored frame = print
// +0.09 z, body ±3.43, ground y=0 — hull family byte-shared with the t90_1992
// print, same gear/tread nodes): turret prism body world -1.6..+1.05
// (halfW 1.48..1.61, roof 2.23..2.29), BIG bustle world -1.6..-2.79 (halfW
// ~1.0..1.24, roof 2.14..2.19, underside 1.62..1.72), rear slat cage to
// world -3.27, bustle-side stowage modules x ±1.33 / y 1.68..2.12 /
// z -3.05..-0.88, RWS+pano tower cluster ON the bustle roof (print 2.93..
// 3.03 — matched to the dims budget only, the certified t90sm_2013 tower-cap
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
// FAMILY LAW §5.13: the t90sm_2013 welded grammar (polyTurret prism + squared
// removable bustle + slat + RWS/pano/Sosna ensemble) re-lofted to THIS
// print's staircase; garage tells vs t90sm_2013: desert-sand factory paint
// (spec), hull perimeter cage, taller skirt ERA, bustle-side module rows.
// SPIN §5.31: pivot at the prism plan-chord center (turretG z -0.19).
// ---- T-90A Burlak (experimental bustle-autoloader turret) — §5.38 ----------
// Print: public/models/community-candidates/t-90a_burlak_armored_warfare.glb
// (LOCAL-ONLY quarantine, flat Object_N; vertex REG + harness maps,
// 7b45f13). Probe receipts (tmp-t90fam-probe; authored frame = print
// +0.05 z, body ±3.43 — the hull/tread/suspension nodes are BYTE-IDENTICAL
// to the t90_1992 print's: one T-90 hull family): turret shell Object_2 world
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
// FAMILY LAW §5.13: t90a_2004 hull + family prism grammar; the Burlak turret's
// own identity = rounded front + the big squared rear bustle (the print is
// the authority on its unusual shape). SPIN §5.31: pivot at the CASTING
// plan-chord center (turretG z -0.25; the bustle is rear kit, not chord).
// Dome grab rail pair seated just off the measured skin.
export function domeRailRu(
  P: RussiaGeometryPort,
  rings: readonly DomeRing[],
  _sz: number,
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
  // in plan (t72b3m_2022 r9 workorder: 8 columns x 0.1-0.25).
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
          // k5T/k5Out (r10): arc seat + standoff — the t90a_2004 clamshell leaves
          // reach 0.4 m proud of the cheeks toward the mantlet (ref plan front
          // 2.48-2.53 at |x| 0.7-0.9)
          const buildRussianEraCheekClusterTurretCourse1Iteration1 = (): void => {
            const t = Math.PI / 2 + s * (p.k5T ?? 0.55);
            const yc = p.k5Y ?? 0.16;
            const D = skinD(t, yc) + (p.k5Out ?? -0.04);
            const x = Math.cos(t) * D, z = Math.sin(t) * D;
            // k5Yaw (r12): rake the leaf forward-inboard toward the mantlet
            // (t90a_2004 ref: leaf runs (±1.29, 1.36) -> (±0.61, 2.35)); k5Rise lifts
            // the inner end (ref upper edge 2.004 at the cheek).
            const ry = Math.PI / 2 - t - s * (p.k5Yaw ?? 0);
            const L = p.k5Len ?? 1.30;
            const H = p.k5H ?? 0.40;
            const rz = s * (p.k5Rise ?? 0);
            // k5Pitch / k5TileY (t90a_2006 rTAIL r13b, opt-in): leaf pitch and
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
            // PAINT (t72b3m_2022 rBucket law — the spareTrack slot reads grey-steel);
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
                // k5Lower (§4.999991 t90a_2004 fix-round, opt-in): the real clamshell is
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
                // k5CapIn (t90a_2004 turret-lane 2026-08-06, opt-in): end-cap seat along
                // the leaf axis — default +0.02 byte-identical; t90a_2004 pulls the outer
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
      // k1OutI (t62_1975 r3, opt-in): PER-ARC-INDEX skin offsets — the ref K-1
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
      // optional squeeze params (t72b3m_2022 r4): rT0/rStep arc seats, rDist skin
      // offset, rD depth, rY row base, rH height — defaults = legacy behavior
      // r11: rTilt (base course tilt — the default -0.34 spread the t72b3m_2022
      // pair-0/1 top corners 0.08 proud and poked bottoms 0.06 under the
      // 1.42 skirt line) + rDists (PER-CASSETTE skin offsets: the ref Relikt
      // front is a flat wedge wall — plan staircase 0.13-0.19 proud at
      // mid-arc, tucked at center — which no uniform skin offset can follow).
      const buildRussianEraCheekClusterTurretCourse5 = (): void => {
        const rT0 = p.rT0 ?? 0.28, rStep = p.rStep ?? 0.28, rDist = p.rDist ?? -0.05;
        const rD = p.rD ?? 0.22, rY = p.rY ?? 0.06, rH = p.rH ?? 0.27;
        const rTilt = p.rTilt ?? -0.34;
        // rBucket (t72b3m_2022 visual r1, opt-in): the ref Relikt course renders in
        // the SCHEME PAINT (pale olive like the dome) — the spareTrack steel
        // bucket read as maroon-brown inset wedges at critic zoom. Legacy
        // builds (t90sm_2013) keep turretTrack.
        const rBucket = p.rBucket ?? 'turretTrack';
        // rGapBucket (t72b3m_2022 visual r5, opt-in): the ring GAP plates used to be
        // hard 'turretDark' — at the flat board light they rendered as void-black
        // trapezoids flanking the crown (critic r4 item 6: deep-shade floor is
        // reserved for ref-black elements). Scheme-shadow cloth keeps the
        // lid-vs-gap swing at the ref's ~12L without reading as holes. Legacy
        // builds keep turretDark.
        const rGapBucket = p.rGapBucket ?? 'turretDark';
        const rowSeats = (p.rRows ?? 2) === 1 ? [[0, rY]] : [[0, rY], [1, 0.34]];
        // rDeep (t72b3m_2022 visual r2, opt-in): deepen each cassette INWARD keeping
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
                  // the t72b3m_2022 ref's mantlet-dip cols read 1.637-1.663 where a
                  // uniform course crested 1.70-1.72
                  const buildRussianEraCheekClusterTurretCourse17 = (): void => {
                    const yc = (i === 0 && p.rY0 != null ? p.rY0 : y0) + 0.13;
                    const dd = skinD(t, yc) + dI;
                    put(t, yc, 0.48, rH, rD + rDeep, rTilt + row * 0.10, rBucket, dd - rDeep / 2);
                    // rChev (t90am r8 ORDER 4, opt-in): Relikt tile-course relief —
                    // the oracle's cheek arrays read bold diagonal chevron courses
                    // (§B3 ERA grammar; the flat cassettes read "faint seams" at
                    // graduation zoom). Face seams/crests ride +0.8 mm proud of the
                    // calibrated face plane (sub-half-pixel, leopard r9 class);
                    // course ribs live on the tilted TOP shoulder (§B3.1
                    // 45°-shoulder free lane; rib crowns stay within +2 mm of the
                    // cassette's own certified corner envelope). Defaults
                    // byte-identical for every legacy caller (only t90am passes it).
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
                      // rGapH (t72b3m_2022 r24, opt-in): cap the gap-plate heights so the
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
                // 1.85 canopy 0.2 proud of the roof (t72b3m_2022 r7 whatsat verdict)
                if (p.rStrip !== false) put(t, 0.34, 0.50, 0.032, 0.20, -0.30, 'turretDark', skinD(t, 0.34) - 0.03, false);
              };
              buildRussianEraCheekClusterTurretCourse12();
            }
            // rXPairs (t72b3m_2022 visual r1, opt-in; r2 REBUILT): flank/rear ring
            // continuation — standing cassettes at wider arc seats so every
            // quarter reads the ref's ~15-cassette dome ring. Plates stay sunk
            // inside the lathe plan (dI<0); heights are now REAL (0.20-0.27, the
            // r13 0.11 nubs never reached pixels) with tops still 5+cm under the
            // local dome/basket side lines; entry [tOff, dI, h, w, yc?].
            // gapH (7th entry, r22 opt-in): caps the auto-gap plate height where
            // the gap azimuth lands in a LOWER certified row than the pair itself
            // (t72b3m_2022 0.62-pair: its 0.465-rad gap sits in the mantlet-dip cols).
            // Entries without it are byte-identical (only t72b3m_2022 passes rXPairs).
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
// plane forward of the dome skin (t72bu_1989: ref plan front 1.89-1.92 at
// |x| 0.4..0.65); the caller adds a bracket back to the skin.
export function ruShtora(P: RussiaShtoraPort, p: ShtoraOptions, y: number): void {
  const r = ringSkin(p.rings, y), x = p.eyeX ?? 0.52;
  const zSkin = r * p.sz * Math.sqrt(Math.max(0.1, 1 - (x / r) ** 2));
  addShtoraEyes(P, { x, y, z: p.eyeZ ?? (zSkin + 0.06),
    scale: p.eyeScale ?? 1, round: !!p.eyeRound, kit: !!p.eyeKit });
}
// ---------------------------------------------------------------------------
// Profiles. Dimensions are width-normalized oracle measurements (packets);
// width = spec width − 0.09 so skirts/fasteners land exactly on spec width.
// zC = the oracle's hull-center offset (overall-bbox-centered GLBs).
// turretPivotZ stays hull-center relative; gun muzzle = zC+pivotZ+gunZ+len.
// ---------------------------------------------------------------------------
export const RUSSIA_PROFILES = {
  // 262 (owner 2026-10-27): the T-55A on the T-54/T-55 family construction (profiles/t54Family.ts)
  t55a: { build: buildT55A },
  t62_1975: { build: buildT62Obr1975 },
  t64bv1: { build: (P: TankBuilderPort) => buildT64BV1(P) },
  t64bv: { build: (P: TankBuilderPort) => buildT64BV(P) },
  // type59 §5.304: builder moved to profiles/china.ts (buildType59 on the
  // widened obr-1975 chassis) — profiledProcedurals.ts keys it from
  // CHINA_PROFILES at the same carousel position.
} satisfies VehicleProfileRecord;
