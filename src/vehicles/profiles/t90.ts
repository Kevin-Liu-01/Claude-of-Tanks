import { lathedWheelSection } from './lathedWheelStock.ts';
import { VEHICLE_HULL_LENGTH_FACTORS } from '../vehicleSizePolicy.ts';
import { captureAuxiliaryStock } from './auxiliaryStation.ts';
import { auxiliaryWeaponProfile } from '../auxiliaryWeapons.ts';
// Strictly typed family extraction from russia.ts (§5.75). Geometry bytes are unchanged.
import * as THREE from 'three';
import { KIT as UNTYPED_KIT, FITTINGS, MUDGUARDS, muzzleBore, orientedSlab } from './kit.ts';
import { addSovietChevronEra } from './sovietChevronEra.ts';
import { sweptTube } from '../accessoryPrimitives.ts';
import { pushConvexQuad } from '../factoryGeometry.ts';
import { buildPT91MPendekar } from './pt91mPendekar.ts';
import type { VehicleProfileRecord } from '../profileBuilderAdapter.ts';
import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { SnapGroupOptions } from '../tankFactoryCore.ts';
import {
  loftHull,
  meshDomeCurved,
  ringSkin,
  tubeGun,
  ruSaddle,
  mast,
  rehookClone,
  ruGlacisKit,
  ruDeck,
  ruSkirtBand,
  widthAnchor,
  eraRuCheeks,
  ruShtora,
} from './russia.ts';
import { addVehicleGhillieSuit } from '../ghillieSuit.ts';

type Vec2Tuple = readonly [number, number];
type Vec3Tuple = readonly [number, number, number];
type MutableVec3 = [number, number, number];
type GeometryScale = number | readonly number[];
type WeldedStation = readonly [
  z: number, y0: number, y1: number, xl: number, xr: number,
  xbl: number, xbr: number, xtl: number, xtr: number,
];
type CastLevel = readonly [y: number, xl: number, xr: number];
type CastStation = readonly [z: number, levels: readonly CastLevel[]];

interface T90Materials extends Record<string, THREE.MeshStandardMaterial> {
  readonly dark: THREE.MeshStandardMaterial;
  readonly hull: THREE.MeshStandardMaterial;
  readonly canvasCloth: THREE.MeshStandardMaterial;
}

interface T90BuilderPort {
  extendHullLength(factor: number): void;
  readonly hullG: THREE.Group;
  readonly turretG: THREE.Group;
  readonly gunG: THREE.Group;
  readonly mats: T90Materials;
  readonly disposables: Array<THREE.BufferGeometry | THREE.Material>;
  readonly spec: {
    readonly id: string;
    readonly visual: { readonly number?: string };
    readonly armor: { readonly gunBarrel: { lengthM: number } };
  };
  readonly rng: () => number;
  readonly q?: boolean;
  topY?: number;
  _shtoraRed?: THREE.MeshStandardMaterial;
  gear?: {
    contactGeom?: { halfWidM: number };
    trackHitbox?: Array<{ x0: number; x1: number }>;
  };
  postAssemble?: (context: { hullG: THREE.Group }) => void;
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
  addGunExtra(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addGunExtraDark(geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addCupola(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addHatch(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  addMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  clear(...slots: string[]): void;
  destructibleCluster(label: string, build: () => void): void;
  visualEraCluster(label: string, owner: 'hull' | 'turret', build: () => void): void;
  decal(
    owner: 'hull' | 'turret',
    kind: string,
    label: string | null,
    scale: number,
    position: Vec3Tuple,
    ...orientation: number[]
  ): void;
  offsetBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  scaleBuckets(slots: readonly string[], x?: number, y?: number, z?: number): void;
  forEachBucketPart(
    slots: readonly string[],
    visit: (geometry: THREE.BufferGeometry, bounds: THREE.Box3) => void,
  ): void;
  /** Registered like addMudguard, then hung from the hull stock above its top edge (mudguardHangers.ts). */
  hangMudguard(label: string, slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
  /** Seats the fittings authored in `build` on their rig group's stock once the profile is done (fittingSnap.ts). */
  snapGroup(label: string, build: () => void, options?: SnapGroupOptions): void;
}

const KIT = UNTYPED_KIT;

// The production T-90M's 2A46M-5 establishes the family cannon's visible
// thermal-jacket section. Keep this datum shared by related variants so
// their tubes cannot drift back to thin, unrelated profiles. Longitudinal
// stations remain variant-specific because each turret seats its trunnion
// at a different fore/aft datum.
const T90M_2A46M5_VISUAL_DATUM = Object.freeze({
  family: 't90m-2a46m5-thermal-jacket-r1',
  sleeveRadiusM: 0.108,
  forwardRadiusM: 0.102,
  muzzleCollarRadiusXM: 0.124 * 0.839,
  muzzleCollarRadiusYM: 0.124,
  boreRadiusM: 0.062,
  fumeExtractorRadiusM: 0.128,
});

// T-90 family chassis datum (lane t90-family-266): the family hull's authored package sits 50 mm below its
// construction stations, and every mark on it seats its turret ring at T90_FAMILY_RING_Y.
type T90FamilyProtection = 'kontakt5' | 'relikt';
const T90_FAMILY_HULL_DATUM_DROP_M = 0.05;
const T90_FAMILY_RING_Y = 1.51 - T90_FAMILY_HULL_DATUM_DROP_M;

function isRecord(value: RuntimeValue): value is Record<string, RuntimeValue> {
  return value !== null && typeof value === 'object';
}

const T90_BUILDER_GROUP_KEYS = Object.freeze(['hullG', 'turretG', 'gunG'] as const);
const T90_BUILDER_FUNCTION_KEYS = Object.freeze([
  'add', 'addGunExtra', 'addGunExtraDark', 'addCupola', 'addEquipment',
  'addHatch', 'addMudguard', 'clear', 'destructibleCluster',
  'visualEraCluster', 'decal', 'offsetBuckets', 'scaleBuckets',
  'forEachBucketPart',
] as const);

function hasT90BuilderGroups(value: Record<string, RuntimeValue>): boolean {
  return T90_BUILDER_GROUP_KEYS.every((key) => value[key] instanceof THREE.Group);
}

function hasT90BuilderFunctions(value: Record<string, RuntimeValue>): boolean {
  return T90_BUILDER_FUNCTION_KEYS.every((key) => typeof value[key] === 'function');
}

function isT90Builder(value: RuntimeValue): value is T90BuilderPort {
  if (!isRecord(value)) return false;
  return hasT90BuilderGroups(value)
    && isRecord(value.mats)
    && isRecord(value.spec)
    && Array.isArray(value.disposables)
    && typeof value.rng === 'function'
    && hasT90BuilderFunctions(value);
}

function requireT90Builder(value: RuntimeValue): T90BuilderPort {
  if (!isT90Builder(value)) {
    throw new TypeError('T-90 profile requires the complete procedural builder contract');
  }
  return value;
}

function t90Profile(build: (builder: T90BuilderPort) => void) {
  return { build: (builder: RuntimeValue): void => build(requireT90Builder(builder)) };
}

// Faceted turret shell with a source-defined lower ring.  The top ring and
// plan outline use the same construction as KIT.polyTurret; only the lower
// y-value may vary along the perimeter.  Edge breakpoints preserve the exact
// straight plan edges while allowing a short, real underside step.
function polyTurretVariableBase(
  plan: readonly Vec2Tuple[],
  h: number,
  flare: number,
  inset: number,
  baseAtZ: (z: number) => number,
  breakZs: readonly number[] = [],
  // TANK-OPT companions (227): close the stepped lower ring with an outward (downward) cap, for a shell whose open
  // bottom shows from below once a cook-off throws the turret. Off by default: other callers keep their bytes.
  closeBottom = false,
): THREE.BufferGeometry {
  const n = plan.length;
  const cx = plan.reduce((s, p) => s + p[0], 0) / n;
  const cz = plan.reduce((s, p) => s + p[1], 0) / n;
  const ring = (scale: number, y: number): MutableVec3[] => plan.map(([x, z]) => (
    [cx + (x - cx) * scale, y, cz + (z - cz) * scale]
  ));
  const b0 = ring(flare, 0), t0 = ring(inset, h);
  const b: MutableVec3[] = [], t: MutableVec3[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cuts = [0];
    for (const z of breakZs) {
      const dz = b0[j][2] - b0[i][2];
      if (Math.abs(dz) < 1e-9) continue;
      const q = (z - b0[i][2]) / dz;
      if (q > 1e-6 && q < 1 - 1e-6) cuts.push(q);
    }
    cuts.sort((a, b2) => a - b2);
    for (const q of cuts) {
      const lerp = (a: number, c: number): number => a + (c - a) * q;
      const bz = lerp(b0[i][2], b0[j][2]);
      b.push([lerp(b0[i][0], b0[j][0]), baseAtZ(bz), bz]);
      t.push([lerp(t0[i][0], t0[j][0]), h, lerp(t0[i][2], t0[j][2])]);
    }
  }
  const positions: number[] = [];
  const tri = (a: Vec3Tuple, b2: Vec3Tuple, c: Vec3Tuple): void => {
    positions.push(...a, ...b2, ...c);
  };
  const clockwise = plan.reduce((area, p, i) => {
    const q = plan[(i + 1) % plan.length];
    return area + p[0] * q[1] - q[0] * p[1];
  }, 0) < 0;
  for (let i = 0; i < b.length; i++) {
    const j = (i + 1) % b.length;
    // Winding follows the whole contour. A center-facing test incorrectly
    // reversed the two re-entrant cheek walls.
    if (clockwise) { tri(b[i], b[j], t[j]); tri(b[i], t[j], t[i]); }
    else { tri(b[j], b[i], t[i]); tri(b[j], t[i], t[j]); }
  }
  // The welded T-90 cheek outline has re-entrant front shoulders. A fan
  // from its arithmetic center crosses those notches; triangulate the actual
  // perimeter so the roof stays inside the authored silhouette.
  const perimeterCap = (ring: readonly MutableVec3[]): number[][] => {
    const cap = THREE.ShapeUtils.triangulateShape(ring.map(([x, , z]) => new THREE.Vector2(x, z)), []);
    // Earcut may elide collinear roof stations inserted for the stepped floor.
    // Reinsert each on its containing edge so roof and walls share exact edges.
    for (let v = 0; v < ring.length; v++) {
      if (cap.some(face => face.includes(v))) continue;
      let inserted = false;
      for (let f = 0; f < cap.length && !inserted; f++) for (let e = 0; e < 3; e++) {
        const face = cap[f], ai = face[e], bi = face[(e + 1) % 3], ci = face[(e + 2) % 3];
        const a = ring[ai], b2 = ring[bi], p = ring[v], dx = b2[0]-a[0], dz = b2[2]-a[2];
        const length2 = dx*dx+dz*dz, along = ((p[0]-a[0])*dx+(p[2]-a[2])*dz)/length2;
        if (along <= 1e-8 || along >= 1-1e-8 || Math.abs(dx*(p[2]-a[2])-dz*(p[0]-a[0])) > 1e-9) continue;
        cap.splice(f,1,[ai,v,ci],[v,bi,ci]); inserted = true; break;
      }
      if (!inserted) throw new Error('T-90 roof perimeter station is not triangulated');
    }
    return cap;
  };
  for (const [i, j, k] of perimeterCap(t)) {
    const a = t[i], b2 = t[j], c = t[k];
    const ny = (b2[2] - a[2]) * (c[0] - a[0]) - (b2[0] - a[0]) * (c[2] - a[2]);
    if (ny > 0) tri(a, b2, c); else tri(b2, a, c);
  }
  if (closeBottom) {
    // One flat floor at the highest point of the stepped lower ring, on the walls themselves (each floor vertex
    // slides up its own wall edge to that height). Below it the lower walls stay a short open skirt. A floor that
    // followed the step would close the slit between the deck and the shell's raised front into a pocket the
    // watertight flood reads as a leak.
    const floorY = Math.max(...b.map(([, y]) => y));
    const floor = b.map((low, i): MutableVec3 => {
      const high = t[i], u = (floorY - low[1]) / Math.max(1e-9, high[1] - low[1]);
      return [low[0] + (high[0] - low[0]) * u, floorY, low[2] + (high[2] - low[2]) * u];
    });
    for (const [i, j, k] of perimeterCap(floor)) {
      const a = floor[i], b2 = floor[j], c = floor[k];
      const ny = (b2[2] - a[2]) * (c[0] - a[0]) - (b2[0] - a[0]) * (c[2] - a[2]);
      if (ny < 0) tri(a, b2, c); else tri(b2, a, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function weldedStationLoft(stations: readonly WeldedStation[], convexPanels=false): THREE.BufferGeometry {
  const positions: number[] = [];
  const tri = (a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, expect: Vec3Tuple): void => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (n[0] * expect[0] + n[1] * expect[1] + n[2] * expect[2] < 0) positions.push(...a, ...c, ...b);
    else positions.push(...a, ...b, ...c);
  };
  const quad = (
    a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, d: Vec3Tuple, expect: Vec3Tuple,
  ): void => {
    if(!convexPanels){tri(a,b,c,expect);tri(a,c,d,expect);return;}
    const normal=new THREE.Vector3().crossVectors(
      new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),
      new THREE.Vector3(...c).sub(new THREE.Vector3(...a)));
    if(normal.dot(new THREE.Vector3(...expect))<0)pushConvexQuad(positions,a,d,c,b);
    else pushConvexQuad(positions,a,b,c,d);
  };
  const rings: MutableVec3[][][] = stations.map(([z, y0, y1, xl, xr, xbl, xbr, xtl, xtr]) => {
    const ym = y0 + (y1 - y0) * 0.46;
    return [
      [[xbl, y0, z], [xbr, y0, z]],
      [[xl, ym, z], [xr, ym, z]],
      [[xtl, y1, z], [xtr, y1, z]],
    ];
  });
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < 2; k++) {
      quad(a[k][0], b[k][0], b[k + 1][0], a[k + 1][0], [-1, 0, 0]);
      quad(a[k][1], a[k + 1][1], b[k + 1][1], b[k][1], [1, 0, 0]);
    }
    quad(a[2][0], a[2][1], b[2][1], b[2][0], [0, 1, 0]);
    quad(a[0][0], b[0][0], b[0][1], a[0][1], [0, -1, 0]);
  }
  const cap = (r: MutableVec3[][], expect: Vec3Tuple): void => {
    for (let k = 0; k < 2; k++) quad(r[k][0], r[k][1], r[k + 1][1], r[k + 1][0], expect);
  };
  // The loft is used in both ascending- and descending-Z station order.
  // Derive each terminal's outward direction from that order; hard-coding
  // the caps made descending bustles closed but mixed-wound.
  const zDirection = Math.sign(stations[stations.length - 1][0] - stations[0][0]) || 1;
  cap(rings[0], [0, 0, -zDirection]);
  cap(rings[rings.length - 1], [0, 0, zDirection]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

// Low cast-turret loft from explicit longitudinal sections.  Unlike the
// rotational dome helper, this preserves independent lower cheek, shoulder,
// upper cheek and crown widths at every fore/aft station, including real
// left/right asymmetry.  It is intentionally faceted at the large foundry
// breaks while vertex normals keep each authored armor plane coherent.
function castSectionLoft(
  stations: readonly CastStation[],
  { faceted = false }: { faceted?: boolean } = {},
): THREE.BufferGeometry {
  const positions: number[] = [];
  const tri = (a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, expect: Vec3Tuple): void => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    if (n[0] * expect[0] + n[1] * expect[1] + n[2] * expect[2] < 0) positions.push(...a, ...c, ...b);
    else positions.push(...a, ...b, ...c);
  };
  const quad = (
    a: Vec3Tuple, b: Vec3Tuple, c: Vec3Tuple, d: Vec3Tuple, expect: Vec3Tuple,
  ): void => { tri(a, b, c, expect); tri(a, c, d, expect); };
  const rings: MutableVec3[][][] = stations.map(([z, levels]) => (
    levels.map(([y, xl, xr]) => [[xl, y, z], [xr, y, z]])
  ));
  const levelCount = rings[0].length;
  for (let i = 0; i < rings.length - 1; i++) {
    const a = rings[i], b = rings[i + 1];
    for (let k = 0; k < levelCount - 1; k++) {
      quad(a[k][0], b[k][0], b[k + 1][0], a[k + 1][0], [-1, 0, 0]);
      quad(a[k][1], a[k + 1][1], b[k + 1][1], b[k][1], [1, 0, 0]);
    }
    quad(a[levelCount - 1][0], a[levelCount - 1][1], b[levelCount - 1][1], b[levelCount - 1][0], [0, 1, 0]);
    quad(a[0][0], b[0][0], b[0][1], a[0][1], [0, -1, 0]);
  }
  const zDirection = Math.sign(stations[stations.length - 1][0] - stations[0][0]) || 1;
  const cap = (r: MutableVec3[][], expect: Vec3Tuple): void => {
    for (let k = 0; k < levelCount - 1; k++) quad(r[k][0], r[k][1], r[k + 1][1], r[k + 1][0], expect);
  };
  cap(rings[0], [0, 0, -zDirection]);
  cap(rings[rings.length - 1], [0, 0, zDirection]);
  if (faceted) {
    // Keep the large authored foundry breaks crisp.  Each quad remains a
    // coherent armor plane, but adjacent lower-cheek, shoulder, upper-cheek
    // and crown courses no longer blend into a rotational half-sphere.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((positions.length / 3) * 2).fill(0), 2));
    geometry.computeVertexNormals();
    return geometry;
  }
  // Weld coincident section vertices before computing normals.  This rounds
  // the transition along authored cast stations when a softer casting is
  // explicitly wanted.
  const unique: number[] = [], indices: number[] = [];
  const indexByPosition = new Map<string, number>();
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i], y = positions[i + 1], z = positions[i + 2];
    const key = `${x.toFixed(6)},${y.toFixed(6)},${z.toFixed(6)}`;
    let index = indexByPosition.get(key);
    if (index === undefined) {
      index = unique.length / 3;
      indexByPosition.set(key, index);
      unique.push(x, y, z);
    }
    indices.push(index);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(unique, 3));
  geometry.setIndex(indices);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((unique.length / 3) * 2).fill(0), 2));
  geometry.computeVertexNormals();
  return geometry;
}

function addT90RadialArmorBelt(
  P: T90BuilderPort,
  rings: readonly (readonly number[])[],
  sz: number,
  { y = 0.16, cz = 0, scale = 1 }: { y?: number; cz?: number; scale?: number } = {},
): void {
  const { box } = KIT;
  const A = ringSkin(rings, y);
  const B = A * sz;
  // K-5 follows the casting as an overlapping field, not a ruler-straight
  // necklace.  The widths and radial depths vary by station like the real
  // wedge courses, while every backing shoe penetrates the dome skin.
  const course = [
    [-1.08, 0.80, 0.86], [-0.84, 0.94, 1.00], [-0.59, 1.08, 1.14],
    [-0.34, 1.15, 1.22], [-0.10, 1.10, 1.18], [0.13, 1.02, 1.10],
    [0.35, 0.92, 1.02], [0.55, 0.82, 0.92],
  ];
  for (const side of [-1, 1]) {
    for (const [t, widthScale, depthScale] of course) {
      const x = side * A * Math.cos(t);
      const z = B * Math.sin(t) + cz;
      const yaw = Math.atan2(x, z - cz);
      const w = 0.27 * scale * widthScale;
      const d = 0.12 * depthScale;
      P.add('turretDark', box(w * 0.92, 0.17 * scale, d), x * 0.965, y - 0.015, z * 0.965 + cz * 0.035, 0, yaw, 0);
      P.add('turretTrack', box(w, 0.19 * scale, d * 0.88), x * 1.012, y + 0.012, z * 1.012 - cz * 0.012, 0, yaw, 0);
      P.add('turretDark', box(0.018, 0.155 * scale, d * 0.74), x * 1.018, y + 0.012, z * 1.018 - cz * 0.018, 0, yaw, 0);
      P.add('turretDark', box(w * 0.78, 0.018, d * 0.55), x * 1.014, y + 0.112 * scale, z * 1.014 - cz * 0.014, 0, yaw, 0);
    }
  }
}

function addT90CastFlankCassettes(
  P: T90BuilderPort,
  { y = 0.24, compact = false, raisedLeftRear = false }: {
    y?: number; compact?: boolean; raisedLeftRear?: boolean;
  } = {},
): void {
  const { box } = KIT;
  const k = compact ? 0.94 : 1;
  const stations: readonly (readonly [number, number, number, number, number, number])[] = [
    // x, z, width, height, depth, plan cant
    [1.39, 0.24, 0.22, 0.34, 0.38, 0.08],
    [1.46, -0.14, 0.20, 0.35, 0.34, 0.03],
    [1.45, -0.50, 0.22, 0.34, 0.34, -0.03],
    [1.39, -0.86, 0.26, 0.32, 0.34, -0.09],
    [1.27, -1.20, 0.30, 0.28, 0.30, -0.16],
  ];
  for (const side of [-1, 1]) {
    // The carrier is sunk into the casting; it appears only in the authored
    // gaps and gives each cassette a visible load path back to the turret.
    P.add('turretDark', box(0.10, 0.14, 1.78), side * 1.25 * k, y - 0.08, -0.46);
    for (const [x, z, w0, h0, d0, cant] of stations) {
      const w = w0 * k, h = h0 * k, d = d0;
      const yaw = -side * cant;
      P.add('turret', box(w, h, d), side * x * k, y, z, 0, yaw, 0);
      P.add('turretDark', box(0.016, h * 0.84, d * 0.84), side * (x + w0 * 0.52) * k, y, z, 0, yaw, 0);
      P.add('turretDark', box(w * 0.78, 0.016, d * 0.72), side * x * k, y + h * 0.52, z, 0, yaw, 0);
      if (raisedLeftRear && side < 0 && z < -1) {
        // Source-left terminal cassette carries a visibly thicker armored
        // cap.  Its lower face penetrates the cassette roof, preserving a
        // continuous load path while matching the three-column shoulder.
        P.add('turretDark', box(w * 0.72, 0.05, d * 0.66), side * x * k, y + h * 0.5 + 0.02, z, 0, yaw, 0);
      }
    }
  }

}

function addT90AAsymmetricBustleBins(P: T90BuilderPort): void {
  const { box } = KIT;
  // The Xarchenko reference carries a long, low vehicle-right bustle run
  // beyond the last cast-side cassette.  Three separate bins share one
  // carrier buried in the dome shoulder; their seams remain visible and the
  // terminal face closes the package instead of leaving a hollow rail cage.
  const side = 1;
  P.add('turretDark', box(0.22, 0.16, 0.76), side * 1.30, 0.09, -1.64);
  for (const [z, d, w, cant] of [
    [-1.50, 0.30, 0.27, -0.03],
    [-1.82, 0.36, 0.27, -0.06],
  ]) {
    const x = 1.48;
    P.add('turret', box(w, 0.28, d), side * x, 0.14, z, 0, -cant, 0);
    // Keep the face seam flush inside the bin's rotated outer plane.  The
    // former half-width seat swung its rear corner beyond the actual bin at
    // the maximum-width front station.
    P.add('turretDark', box(0.016, 0.23, d * 0.82), side * (x + w * 0.40), 0.14, z, 0, -cant, 0);
    P.add('turretDark', box(w * 0.76, 0.016, d * 0.70), side * x, 0.288, z, 0, -cant, 0);
  }
  P.add('turretDark', box(0.22, 0.20, 0.025), side * 1.515, 0.14, -2.012);
}

function addT90ACastPerimeterFlanges(P: T90BuilderPort): void {
  // Measured low perimeter ledges beneath the side equipment.  These are
  // solid casting continuations, not proxy silhouettes: each inner edge is
  // buried in the dome/cassette carrier and each outer edge follows the
  // source plan sweep.  The vehicle-right ledge is long; the left closes to
  // the short Shtora-side point, preserving the oracle's real asymmetry.
  P.add('turret', orientedSlab(
    [1.34, 0.05, 0.87], [1.66, 0.00, 0.25], [1.66, 0.00, -1.224], [1.34, 0.05, -1.205],
    [1.34, 0.17, 0.87], [1.66, 0.04, 0.25], [1.66, 0.04, -1.224], [1.34, 0.17, -1.205],
  ));
  // The left oracle reaches its maximum width in a 55 mm-long point before
  // opening abruptly inboard.  A single long trapezoid opened too early in
  // the outer raster station, so preserve the real knee as two joined
  // sections: a narrow cast tip, then the swept inner ledge.
  P.add('turret', orientedSlab(
    [-1.66, 0.00, 0.415], [-1.60, 0.05, 0.415], [-1.60, 0.05, 0.365], [-1.66, 0.00, 0.365],
    [-1.66, 0.04, 0.415], [-1.60, 0.38, 0.415], [-1.60, 0.38, 0.365], [-1.66, 0.04, 0.365],
  ));
  P.add('turret', orientedSlab(
    [-1.60, 0.05, 0.415], [-1.34, 0.05, 0.87], [-1.34, 0.05, -0.66], [-1.60, 0.05, 0.365],
    [-1.60, 0.38, 0.415], [-1.34, 0.17, 0.87], [-1.34, 0.17, -0.66], [-1.60, 0.38, 0.365],
  ));
  P.add('turretDark', KIT.box(0.20, 0.018, 0.035), 1.45, 0.132, 0.66, 0, -0.34, 0);
  P.add('turretDark', KIT.box(0.20, 0.018, 0.035), -1.45, 0.268, 0.65, 0, 0.34, 0);
}

function addT90CastSightCrown(
  P: T90BuilderPort,
  { y0 = 0.72, forwardHead = true }: { y0?: number; forwardHead?: boolean } = {},
): void {
  // Tapered ESSA head: its full-size footprint sinks into the existing
  // housing, then steps inward toward the sensor cap.  This replaces the
  // visual read of another loose roof box with one supported instrument.
  P.add('turret', orientedSlab(
    [-0.575, y0, 0.05], [-0.335, y0, 0.05], [-0.335, y0, 0.36], [-0.575, y0, 0.36],
    [-0.535, y0 + 0.22, 0.10], [-0.365, y0 + 0.22, 0.10], [-0.365, y0 + 0.22, 0.31], [-0.535, y0 + 0.22, 0.31],
  ));
  P.add('turretDark', KIT.box(0.19, 0.028, 0.23), -0.45, y0 + 0.225, 0.205);
  P.add('turretGlass', KIT.box(0.13, 0.10, 0.014), -0.45, y0 + 0.10, 0.366);
  P.add('turretDark', KIT.box(0.15, 0.025, 0.045), -0.45, y0 + 0.17, 0.35);

  // The oracle carries a second, narrow forward ESSA head above the long
  // housing.  Its rear foot overlaps the crown and its lower prism remains
  // buried in the housing, giving the sensor an explicit armored load path;
  // the old build simply ended after the low aperture and lost this entire
  // two-station roof silhouette.
  if (forwardHead) {
    P.add('turret', orientedSlab(
      [-0.58, y0 - 0.10, 0.28], [-0.33, y0 - 0.10, 0.28], [-0.33, y0 - 0.10, 0.90], [-0.58, y0 - 0.10, 0.90],
      [-0.53, y0 + 0.21, 0.36], [-0.36, y0 + 0.21, 0.36], [-0.36, y0 + 0.21, 0.80], [-0.53, y0 + 0.21, 0.80],
    ));
    P.add('turretDark', KIT.box(0.19, 0.028, 0.42), -0.445, y0 + 0.225, 0.58);
    P.add('turretGlass', KIT.box(0.13, 0.12, 0.014), -0.445, y0 + 0.075, 0.807);
    P.add('turretDark', KIT.box(0.15, 0.025, 0.055), -0.445, y0 + 0.155, 0.79);
  }
}


// Shared first-party welded turret foundation. T-90SM remains the geometry
// authority for this shell; callers may change only its hull-relative seat.
// Keeping the outline, variable lower break, rear casting shelf and crown in
// one helper prevents the T-90A from drifting back to a rotational dome while
// leaving each variant free to author its own armor and combat equipment.
function addT90SMTurretFoundation(
  P: T90BuilderPort,
  { position = [0, 1.40, 0.09], closeUnderside = false }: { position?: Vec3Tuple; closeUnderside?: boolean } = {},
): { tw: number; f: number; b: number; h: number } {
  const { box } = KIT;
  P.turretG.position.set(...position);
  const tw = 1.55, f = 1.40, b = -0.80, h = 0.515;
  P.add('turret', polyTurretVariableBase([
    [-tw * 0.15, 1.26], [tw * 0.15, 1.26], [0.98, 1.26], [1.19, 1.44],
    [1.2985, 1.377], [1.4054, 1.27], [tw * 0.97, 1.12], [tw, 0.55],
    [1.44, -0.395], [1.09, b], [-1.09, b], [-1.44, -0.395],
    [-tw, 0.55], [-tw * 0.97, 1.12], [-1.4054, 1.27], [-1.2985, 1.377],
    [-1.19, 1.44], [-0.98, 1.26],
  ], h, 1.02, 0.78, (z) => z <= 0.50 ? 0 : z >= 0.55 ? 0.08 : (z - 0.50) * 1.6, [0.50, 0.55], closeUnderside));
  // These are structural parts of the SM foundation, not variant dress-up:
  // the shelf closes the shell-to-bustle load path and the crown carries the
  // hatch/sight seats used by both family members.
  P.add('turret', box(1.90, 0.425, 0.70), 0, 0.3125, -0.95);
  P.add('turret', box(1.24, 0.07, 1.05), 0, 0.55, -0.025);
  return { tw, f, b, h };
}

// Replace the aft quarter of a solid skirt with a real stand-off slat field.
// The grid is authored as bolt-on external armor: it can defeat shaped-charge
// jets without inflating the base hull hit shell, while paired buried brackets
// make the visual load path into the fender explicit.  Each T-90 family member
// supplies its own hull stations instead of inheriting Tagil's dimensions.
function addT90RearQuarterSlatCage(P: T90BuilderPort, {
  variant,
  originalSkirtRearZ,
  originalSkirtFrontZ,
  solidSkirtRearZ,
  cageRearZ = originalSkirtRearZ,
  cageFrontZ = solidSkirtRearZ + 0.08,
  xInner,
  xOuter,
  yBottom,
  yTop,
  horizontalRails = 6,
  verticalStiles = 7,
  bracketStations = 4,
}: {
  variant: string;
  originalSkirtRearZ: number;
  originalSkirtFrontZ: number;
  solidSkirtRearZ: number;
  cageRearZ?: number;
  cageFrontZ?: number;
  xInner: number;
  xOuter: number;
  yBottom: number;
  yTop: number;
  horizontalRails?: number;
  verticalStiles?: number;
  bracketStations?: number;
}): void {
  const { box } = KIT;
  const cageDepth = cageFrontZ - cageRearZ;
  const cageHeight = yTop - yBottom;
  const standoff = xOuter - xInner;
  if (!(cageDepth > 0 && cageHeight > 0 && standoff > 0)) {
    throw new Error(`${variant}: invalid rear-quarter slat-cage envelope`);
  }
  const cageCenterZ = (cageRearZ + cageFrontZ) * 0.5;
  const cageCenterY = (yBottom + yTop) * 0.5;
  const xMid = (xInner + xOuter) * 0.5;
  const sector = `${variant}-rear-quarter-slat-cage`;

  P.visualEraCluster(sector, 'hull', () => {
    for (const s of [-1, 1]) {
      // Full-length horizontal bars and close-spaced vertical stiles form the
      // actual stand-off screen. End frames overlap the neighboring solid
      // skirt and rear guard rather than ending as unsupported linework.
      for (let i = 0; i < horizontalRails; i++) {
        const y = yBottom + cageHeight * i / (horizontalRails - 1);
        P.add('hull', box(0.044, 0.038, cageDepth), s * xOuter, y, cageCenterZ);
      }
      for (let i = 0; i < verticalStiles; i++) {
        const z = cageRearZ + cageDepth * i / (verticalStiles - 1);
        P.add('hull', box(0.048, cageHeight + 0.04, 0.042), s * xOuter, cageCenterY, z);
      }

      // Paired stand-off arms and inboard mounting posts describe the cage's
      // stand-off load path without drawing a solid bar through the live shoe
      // envelope. 2026-10-19 (owner float sweep): the posts stood 80-130 mm
      // clear of everything (a deliberate "service gap" to the short stubs);
      // each arm now runs from the cage to its post and each post spans both
      // arms, so the posts are carried by the cage. The arms stay four
      // separate teeth in plan, closing no hull cell.
      for (let i = 0; i < bracketStations; i++) {
        const z = cageRearZ + cageDepth * (i + 0.5) / bracketStations;
        for (const y of [yBottom + 0.09, yTop - 0.09]) {
          P.add('hull', box(standoff, 0.052, 0.065), s * xMid, y, z);
        }
        P.add('hull', box(0.052, cageHeight - 0.128, 0.070),
          s * xInner, cageCenterY, z);
      }
      P.add('hull', box(standoff + 0.08, 0.09, 0.11),
        s * xMid, yTop - 0.035, cageFrontZ - 0.015);
    }
  });

  const removedLength = solidSkirtRearZ - originalSkirtRearZ;
  const originalLength = originalSkirtFrontZ - originalSkirtRearZ;
  P.hullG.userData.t90RearQuarterCageReceipt = Object.freeze({
    variant,
    sector,
    originalSkirtRearZ,
    originalSkirtFrontZ,
    solidSkirtRearZ,
    cageZRange: Object.freeze([cageRearZ, cageFrontZ]),
    cageYRange: Object.freeze([yBottom, yTop]),
    xInner,
    xOuter,
    standoffM: standoff,
    horizontalRails,
    verticalStiles,
    bracketStations,
    sides: 2,
    solidCageOverlapM: cageFrontZ - solidSkirtRearZ,
    replacedFraction: removedLength / originalLength,
    baseHullEnvelopeUnchanged: true,
    attached: true,
  });
}

// One canonical T-90 pressure-hull section. RU-417, Burlak's inherited
// chassis and both Proryv roster entries must keep the same wedge, shoulder
// taper and stern break even when their installed ride heights differ. The
// caller-owned Y offset lets the later assembly pass establish that datum
// without forking the actual hull shape again.
const T90_FAMILY_HULL_PROFILE: Readonly<{
  deck: readonly Vec2Tuple[];
  belly: readonly Vec2Tuple[];
  wUp: readonly Vec2Tuple[];
  wLo: readonly Vec2Tuple[];
  sponsonY: readonly Vec2Tuple[];
}> = Object.freeze({
  deck: Object.freeze([[-3.43, 1.35], [-3.20, 1.47], [-3.00, 1.52], [-2.55, 1.545], [0.95, 1.545], [1.40, 1.50], [1.75, 1.46], [2.30, 1.40], [2.90, 1.26], [3.43, 1.04]] as const),
  belly: Object.freeze([[-3.43, 1.05], [-3.36, 0.86], [-3.10, 0.72], [-2.62, 0.48], [-2.40, 0.44], [2.45, 0.44], [2.80, 0.56], [3.10, 0.71], [3.43, 0.82]] as const),
  wUp: Object.freeze([[-3.43, 1.02], [-3.09, 1.30], [-2.96, 1.60], [2.95, 1.60], [3.16, 1.32], [3.43, 0.60]] as const),
  wLo: Object.freeze([[-3.43, 0.64], [-2.95, 0.88], [-2.30, 0.94], [2.35, 0.94], [2.85, 0.88], [3.43, 0.64]] as const),
  sponsonY: Object.freeze([[-3.43, 1.22], [-2.90, 1.22], [-2.82, 1.40], [-2.05, 1.40], [-1.80, 1.22], [2.42, 1.22], [3.43, 1.22]] as const),
});

function addT90FamilyHull(P: T90BuilderPort, {
  yOffset = 0,
  sponsonYOffset = yOffset,
  sponsonFloorY = null,
  receiptKey = 't90FamilyHullFormReceipt',
}: {
  yOffset?: number;
  sponsonYOffset?: number;
  sponsonFloorY?: number | null;
  receiptKey?: string;
} = {}): void {
  const shift = (stations: readonly Vec2Tuple[]): Vec2Tuple[] => (
    stations.map(([z, y]) => [z, y + yOffset])
  );
  const hasFlatSponson = sponsonFloorY !== null && Number.isFinite(sponsonFloorY);
  const sponsonY: number | Vec2Tuple[] = hasFlatSponson
    ? sponsonFloorY
    : T90_FAMILY_HULL_PROFILE.sponsonY.map(([z, y]): Vec2Tuple => [z, y + sponsonYOffset]);
  loftHull(P, {
    deck: shift(T90_FAMILY_HULL_PROFILE.deck),
    belly: shift(T90_FAMILY_HULL_PROFILE.belly),
    wUp: T90_FAMILY_HULL_PROFILE.wUp.map(([z, x]): Vec2Tuple => [z, x]),
    wLo: T90_FAMILY_HULL_PROFILE.wLo.map(([z, x]): Vec2Tuple => [z, x]),
    // The concealed sponson floor is a mechanical clearance surface, not a
    // visible family-outline station. Proryv's later whole-hull ride lift
    // compensates its visible -200 mm construction offset, but its taller
    // animated shoe return needs the original T-90 floor datum.
    sponsonY,
  });
  P.hullG.userData[receiptKey] = Object.freeze({
    family: 't90-burlak-pressure-hull-r1',
    yOffset,
    sponsonMode: Number.isFinite(sponsonFloorY) ? 'flat-return-clearance' : 'family-profile',
    sponsonYOffset: Number.isFinite(sponsonFloorY) ? null : sponsonYOffset,
    sponsonFloorY,
    sternZ: -3.43,
    bowZ: 3.43,
    maxUpperHalfWidthM: 1.60,
    lowerTubHalfWidthM: 0.94,
    sectionStations: Object.freeze({
      deck: T90_FAMILY_HULL_PROFILE.deck.length,
      belly: T90_FAMILY_HULL_PROFILE.belly.length,
      upperWidth: T90_FAMILY_HULL_PROFILE.wUp.length,
      lowerWidth: T90_FAMILY_HULL_PROFILE.wLo.length,
    }),
  });
}

/**
 * Release 230: where an automated station's moving parts reach, in the station's frame before it is placed: the gun's
 * recoil group at rest (its pitch about the trunnion's x axis and its recoil along its bore keep every point's x), and
 * `cradleRearZ`, the rearmost z the cradle (its shield) reaches over an x band at or below a height as it pitches about
 * the trunnion through the weapon's range (its vertices, a degree apart).
 */
function automatedStationReach(weapon: THREE.Object3D, depression: number, elevation: number) {
  weapon.updateMatrixWorld(true);
  const pitch = weapon.getObjectByName('auxiliaryWeaponPitch')!, recoil = weapon.getObjectByName('auxiliaryWeaponRecoil')!;
  const gun = new THREE.Box3().setFromObject(recoil), pivot = pitch.position, cradle: THREE.Vector3[] = [];
  const toPitch = new THREE.Matrix4().copy(pitch.matrixWorld).invert(), toPitchFrame = new THREE.Matrix4();
  pitch.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (let up: THREE.Object3D | null = mesh; up; up = up.parent) if (up === recoil) return;
    toPitchFrame.multiplyMatrices(toPitch, mesh.matrixWorld);
    const position = mesh.geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) cradle.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(toPitchFrame));
  });
  const pitches: number[] = [];
  for (let e = -depression; e < elevation; e += Math.PI / 180) pitches.push(e);
  pitches.push(elevation);
  return {
    gunMinX: gun.min.x,
    gunMaxX: gun.max.x,
    cradleRearZ(x0: number, x1: number, yMax: number): number {
      let rear = Infinity;
      for (const e of pitches) {
        const c = Math.cos(e), s = Math.sin(e);
        for (const v of cradle) {
          if (v.x < x0 || v.x > x1 || pivot.y + v.y * c + v.z * s > yMax) continue;
          rear = Math.min(rear, pivot.z - v.y * s + v.z * c);
        }
      }
      return rear;
    },
  };
}

// Tagil-derived integrated commander station. The panoramic optic, armored
// slew race, ammunition box, elevation yoke and Kord occupy one connected
// remote mount instead of being scattered between a sight tower and one or
// more hand-served pintles. Only the buried race/foundation is structural;
// sensors and weapon fittings stay in equipment buckets.
function addT90AutomatedCommanderStation(P: T90BuilderPort, {
  x,
  z,
  seatY,
  yaw = 0,
  scale = 1,
  heightScale = 1,
  weaponScale = 1,
  weaponYaw = 0,
  weaponClass = 'kord',
  includeRace = true,
  weaponName,
  receiptKey,
}: {
  x: number;
  z: number;
  seatY: number;
  yaw?: number;
  scale?: number;
  heightScale?: number;
  weaponScale?: number;
  weaponYaw?: number;
  weaponClass?: 'kord' | 'nsvt';
  includeRace?: boolean;
  weaponName: string;
  receiptKey: string;
}): THREE.Group {
  const { box, cylY, torus } = KIT;
  const fit = (value: number): number => value * scale;
  const fitY = (value: number): number => value * scale * heightScale;
  const raceBottomY = seatY;
  const raceTopY = seatY + (includeRace ? fitY(0.24) : 0);
  const foundationTopY = raceTopY + fitY(0.15);
  const headCenterY = foundationTopY + fitY(0.18);
  const weaponFootY = foundationTopY + fitY(0.04);

  if (includeRace) {
    P.addCupola('turret', cylY(fit(0.24), fit(0.27), raceTopY - raceBottomY, 18),
      x, (raceBottomY + raceTopY) * 0.5, z);
    P.add('turretDark', torus(fit(0.255), fit(0.022), 20), x, raceTopY + fit(0.01), z);
  }
  P.addCupola('turret', box(fit(0.62), fitY(0.18), fit(0.58)),
    x, raceTopY + fitY(0.08), z + fit(0.03), 0, yaw, 0);
  P.addCupola('turret', orientedSlab(
    [-fit(0.25), -fitY(0.15), -fit(0.21)], [fit(0.25), -fitY(0.15), -fit(0.21)],
    [fit(0.25), -fitY(0.15), fit(0.21)], [-fit(0.25), -fitY(0.15), fit(0.21)],
    [-fit(0.18), fitY(0.15), -fit(0.15)], [fit(0.18), fitY(0.15), -fit(0.15)],
    [fit(0.18), fitY(0.15), fit(0.15)], [-fit(0.18), fitY(0.15), fit(0.15)],
  ), x, foundationTopY, z + fit(0.03), 0, yaw, 0);

  // VH.14 (coordinator ruling 2026-10-14: every drawn gun works): every host's automated station works, not only the
  // T-90's and the Proryv's — the armoured head turns with its gun and the gun fires.
  const weapon = FITTINGS.pintleMG({
    mats: P.mats,
    cls: weaponClass,
    remoteControlled: true, ridingCradle: true,
    // The weapon and yoke stay dark against the painted armored head so the
    // single automated package remains legible in the normal three-quarter
    // gallery view. A camouflage-painted receiver made the consolidated
    // station read as an unarmed roof box at icon scale.
    tone: 'dark',
    elev: -0.075,
    ammo: true,
    shield: true,
    scale: weaponScale,
    barrelBridge: true,
  });
  // Release 230 (the owner's field-equipment standard: nothing that moves passes through what does not): the station's
  // stock stands clear of everything its gun sweeps through its pitch range and recoil (workingPintleCradleAudit
  // measures the whole station). Every host seats the gun in the open bay (the closed head buried the receiver, which
  // swept through it at every pitch); the cheek plates and the housings beside the gun stand outboard of the gun's sides
  // (the can's side by the can), and the sight and the work light stand back of the shield's sweep at their height.
  const profile = auxiliaryWeaponProfile(12.7, P.spec.id);
  const reach = automatedStationReach(weapon, profile.depressionRad, profile.elevationRad);
  const clear = 0.008; // the audit's 1.5 mm, its sampling and room
  const lean = fit(0.08), plateH = fitY(0.27);
  const cheekIn = fit(0.23) - fit(0.035) * Math.cos(lean) - plateH / 2 * Math.sin(lean); // its top edge, leaning in
  const outL = Math.max(0, -reach.gunMinX + clear - Math.min(cheekIn, fit(0.157)));
  const outR = Math.max(0, reach.gunMaxX + clear - Math.min(cheekIn, fit(0.165)));
  // the sight (its hood's front edge and top) and the work light (its lens and top), from the gun's foot
  const footZ = z + fit(0.10);
  const sightBack = Math.max(0, z + fit(0.381) - footZ + clear
    - reach.cradleRearZ(fit(0.165) + outR - clear, Infinity, headCenterY + fitY(0.096) + fit(0.007) - weaponFootY + clear));
  const lightBack = Math.max(0, z + fit(0.30) - footZ + clear
    - reach.cradleRearZ(-Infinity, -(fit(0.18) + outL) + clear, headCenterY + fitY(0.08) + fit(0.07) - weaponFootY + clear));
  const sx = x + fit(0.27) + outR, sz = (value: number): number => z + fit(value) - sightBack;
  const ax = x - fit(0.27) - outL, lx = x - fit(0.25) - outL, lz = (value: number): number => z + fit(value) - lightBack;
  const finishStation = captureAuxiliaryStock(P,weaponName);
  // 2026-10-07 (tank-accessories round 3): the critics read the T-90M station as "a stack of plain boxes around a
  // bare tube": the Kord's receiver, feed and can sat inside the 0.34 m head box and only the barrel showed. The head
  // becomes a low pedestal and deck under the gun's own cradle, so the receiver, feed cover, can and belt stand in
  // the open yoke between the armored cheek plates, beside the sight and the ammunition housing.
  const pedestalTopY = weaponFootY + 0.012;
  P.addEquipment('turret', box(fit(0.36), pedestalTopY - (foundationTopY - fitY(0.02)), fit(0.34)),
    x, (pedestalTopY + foundationTopY - fitY(0.02)) * 0.5, z + fit(0.04), 0, yaw, 0);
  // 2026-10-08 (tank-accessories round 5, the contact receipt: the cheek plates hung beside the deck, their
  // corners touching nothing within 15 mm): the deck spans the cheeks, and the cheeks stand on it (release 230: out to
  // each plate where it stands outboard).
  const deckL = Math.max(fit(0.29), fit(0.275) + outL), deckR = Math.max(fit(0.29), fit(0.275) + outR);
  P.add('turretDark', box(deckL + deckR, 0.018, fit(0.38)), x + (deckR - deckL) / 2, pedestalTopY + 0.004, z + fit(0.04), 0, yaw, 0);
  // The open bay's deck top, where its cheek plates stand (round 5).
  const deckTopY = pedestalTopY + 0.013;
  for (const side of [-1, 1]) {
    // The plate's lowest (inboard) corner sits 3 mm into the deck: half its rotated height below its centre is
    // h/2 cos(a) + w/2 sin(a).
    const cheekX = x + side * (fit(0.23) + (side < 0 ? outL : outR)), sideLean = side * lean;
    const cheekY = deckTopY - 0.003 + plateH / 2 * Math.cos(lean) + fit(0.035) * Math.sin(lean);
    P.addEquipment('turret', box(fit(0.070), plateH, fit(0.28)),
      cheekX, cheekY, z + fit(0.10),
      0, yaw, sideLean);
    // round 5: the plate's bolt heads, two rows of two on its outer face
    for (const by of [-0.3, 0.3]) for (const bz of [-0.09, 0.09]) {
      const ly = by * plateH;
      P.add('turretDark', KIT.cylX(fit(0.011), fit(0.012), 6),
        cheekX + side * (fit(0.035) * Math.cos(lean) - ly * Math.sin(lean) + fit(0.004)),
        cheekY + ly * Math.cos(lean), z + fit(0.10) + bz * scale, 0, yaw, 0);
    }
  }
  P.addEquipment('turret', box(fit(0.19), fitY(0.21), fit(0.22)),
    sx, headCenterY - fitY(0.02), sz(0.21), 0, yaw, 0);
  P.add('turretGlass', box(fit(0.13), fitY(0.13), fit(0.014)),
    sx, headCenterY, sz(0.328), 0, yaw, 0);
  // 2026-10-08 (tank-accessories round 5; wave 254 on the T-90M: "a stack of blunt slabs (flat side boxes, a
  // camo-painted sensor block and a bare tube barrel) with no cabling, optics glass, ammunition feed chute or
  // fasteners"): the sight's window sits in a dark bezel under a sun hood with the rangefinder's port beside it, the
  // sight and the work light carry their cables down to the station's base, the ammunition housing shows its lid seam
  // and latches, and the armoured plates carry their bolt heads.
  P.add('turretDark', box(fit(0.155), fitY(0.155), fit(0.012)), sx, headCenterY, sz(0.322), 0, yaw, 0);
  // 264 (accessoryContact): the sun hood's rear lower edge rests on the sight housing's top face (headCenterY +
  // fitY(0.085)) and its tilt lifts the front; centred at fitY(0.088) it sank its rear into the housing and crossed the
  // bezel's top with no corner resting on either (the T-90AM II's Kord station, since 230's stock clearance)
  const hoodTilt = 0.18, hoodH = fitY(0.016), hoodD = fit(0.07);
  P.add('turretDark', box(fit(0.21), hoodH, hoodD), sx,
    headCenterY + fitY(0.085) + hoodH / 2 * Math.cos(hoodTilt) + hoodD / 2 * Math.sin(hoodTilt), sz(0.345), -hoodTilt, yaw, 0);
  P.add('turretDark', KIT.cylZ(fit(0.022), fit(0.02), 10), sx + fit(0.062), headCenterY - fitY(0.07), sz(0.326),
    0, yaw, 0);
  P.add('turretGlass', KIT.cylZ(fit(0.014), fit(0.008), 10), sx + fit(0.062), headCenterY - fitY(0.07), sz(0.336),
    0, yaw, 0);
  P.add('turretDark', sweptTube([[sx + fit(0.07), headCenterY - fitY(0.08), sz(0.11)],
    [sx + fit(0.105), headCenterY - fitY(0.10), sz(0.05)],
    [sx + fit(0.105), foundationTopY + fitY(0.02), z + fit(0.0)],
    [x + fit(0.24) + outR, foundationTopY - fitY(0.01), z - fit(0.02)]], fit(0.011), 6, 10));
  P.addEquipment('turret', box(fit(0.22), fitY(0.18), fit(0.28)),
    ax, headCenterY - fitY(0.04), z - fit(0.01), 0, yaw, 0);
  P.add('turretDark', box(fit(0.226), fitY(0.012), fit(0.286)), ax, headCenterY + fitY(0.035), z - fit(0.01), 0, yaw, 0);
  for (const dz of [-0.09, 0.09]) {
    P.add('turretDark', box(fit(0.03), fitY(0.05), fit(0.012)), ax, headCenterY + fitY(0.02),
      z - fit(0.01) + fit(0.14) + fit(0.004), 0, yaw, 0);
    P.add('turretDark', box(fit(0.012), fitY(0.05), fit(0.03)), ax - fit(0.114), headCenterY + fitY(0.02),
      z - fit(0.01) + dz * scale, 0, yaw, 0);
  }
  // A protected coaxial work light gives every family station a readable
  // purpose at gallery distance without turning its weapon or optic into a
  // camouflage-painted lump. The housing and lens remain external equipment.
  P.add('turretDark', KIT.cylZ(fit(0.070), fit(0.075), 14),
    lx, headCenterY + fitY(0.08), lz(0.25), 0, yaw, 0);
  P.add('turretGlass', KIT.cylZ(fit(0.054), fit(0.012), 14),
    lx, headCenterY + fitY(0.08), lz(0.294), 0, yaw, 0);
  P.add('turretDark', sweptTube([[lx, headCenterY + fitY(0.06), lz(0.215)],
    [lx, headCenterY + fitY(0.04), lz(0.15)], [lx - fit(0.01), headCenterY + fitY(0.05), lz(0.11)]],
    fit(0.009), 6, 8));

  finishStation();
  weapon.name = weaponName;
  weapon.position.set(x, weaponFootY, footZ);
  // Keep the armored station's deliberate roof angle, but align the Kord
  // itself with the vehicle centreline. The fitting's barrel axis is +Z.
  weapon.rotation.y = weaponYaw;
  P.turretG.add(weapon);

  P.turretG.userData[receiptKey] = Object.freeze({
    family: 'tagil-integrated-automated-station-r1',
    automated: true,
    remoteControlled: true,
    panoramicIntegrated: true,
    weapon: weaponClass,
    weaponName,
    stationYaw: yaw,
    weaponYaw,
    seat: Object.freeze([x, seatY, z]),
    raceBottomY,
    raceTopY,
    includeRace,
    foundationTopY,
    weaponFootY,
    openWeaponBay: true,
    heightScale,
    structuralFoundation: true,
    separateManualWeaponStations: 0,
  });
  return weapon;
}

function seatFittingOnHorizontalPlate(
  fitting: THREE.Object3D,
  plateY: number,
  embed = 0.006,
): number {
  fitting.updateMatrixWorld(true);
  const localBounds = new THREE.Box3().setFromObject(fitting);
  const seatedY = plateY - localBounds.min.y - embed;
  fitting.position.y = seatedY;
  fitting.userData.horizontalPlateSeatReceipt = Object.freeze({
    planeY: plateY,
    embedM: embed,
    sourceBottomY: localBounds.min.y,
    seatedPositionY: seatedY,
    seatedBottomY: localBounds.min.y + seatedY,
  });
  return seatedY;
}

const T90A_ORIGINAL_TURRET_SEAT_Z_M = 0.12;
const T90A_TURRET_SEAT_Z_M = -0.06;
const T90A_TURRET_REARWARD_SHIFT_M = T90A_ORIGINAL_TURRET_SEAT_Z_M - T90A_TURRET_SEAT_Z_M;
const T90A_ORIGINAL_SHTORA_EYE_Z_M = 1.80;
// The frontal K-5 package now sits on the visible cheek datum. Keep the
// complete OTShU housing (not only its red lens) ahead of the tile faces so
// the dazzler and the two-row chevron remain separately readable.
const T90A_SHTORA_EYE_Z_M = 1.86;
const T90A_SHTORA_LOCAL_FORWARD_SHIFT_M = T90A_SHTORA_EYE_Z_M - T90A_ORIGINAL_SHTORA_EYE_Z_M;
const T90A_SHTORA_SUPPORT_FRONT_Z_M = T90A_SHTORA_EYE_Z_M - 0.04;
const T90A_CHEVRON_FORWARD_M = 0.24;
const T90A_NSVT_RAISE_M = 0.08;
const T90A_GUN_RADIUS_SCALE = 1.08;
const T90A_GUN_ASSEMBLY_RAISE_M = 0.08;

interface T90ALegacyOptions {
  turretSeatZ?: number;
  turretRearwardShiftM?: number;
  shtoraEyeZ?: number;
  shtoraLocalForwardShiftM?: number;
  shtoraSupportFrontZ?: number;
  chevronForwardM?: number;
  nsvtRaiseM?: number;
  gunRadiusScale?: number;
  gunAssemblyRaiseM?: number;
  adoptT90MFamilyGun?: boolean;
  recordSeatReceipt?: boolean;
}

type ResolvedT90ALegacyOptions = Required<T90ALegacyOptions>;

interface T90ALegacyTurretReceiptContext {
  shtoraHousingRearZ: number;
  shtoraHousingFrontZ: number;
  shtoraLensFrontZ: number;
  shtoraChevronDepthClearanceM: number;
  shtoraSupportBodyOverlapM: number;
  roofStations: {
    left: { x: number; z: number };
    right: { x: number; z: number };
  };
}



function addT90ALegacyTurret(P: T90BuilderPort, {
  turretSeatZ,
  shtoraEyeZ,
  shtoraSupportFrontZ,
  chevronForwardM,
  adoptT90MFamilyGun,
  recordSeatReceipt,
}: ResolvedT90ALegacyOptions): T90ALegacyTurretReceiptContext {
  const { box, cylY, cylZ } = KIT;
  // ---- turret: measured T-90A cast shell ----
  // Primary mass follows the source silhouette; every K-5/optic/weapon
  // fitting below is seated into that mass rather than a shared family box.
  // OWNER T-90A BASE RECONCILIATION (2026-08-14): use the exact first-party
  // T-90SM welded foundation at the established A hull seat. The former
  // rotational casting still read as a clipped half-sphere beneath the
  // equipment. Only the foundation changes here; the rings below remain a
  // placement guide for the A-specific K-5 and Shtora courses, which are
  // reseated into this wider faceted shell.
  // Seat the complete rotating assembly over the authored hull ring.  The
  // prior +0.459 m forward offset put the pivot on the glacis shoulder, so
  // the turret appeared to slide ahead of its bearing and opened an
  // exaggerated gap behind the shell.  This is a turret-group correction:
  // gun, ERA, optics and bustle retain their local construction and move as
  // one package in both yaw states.
  // The A seat shows the shell's open underside to a camera below a thrown turret (TANK-OPT ring census, 8 % of the
  // ring disc): `closeUnderside: true` closes it. Held for the gun-hull lane's T-90 batch (240): that lane flips it and
  // regenerates. The SM's own seat is covered by its basket and keeps its bytes.
  addT90SMTurretFoundation(P, { position: [0, T90_FAMILY_RING_Y, turretSeatZ] });
  const rings = [[1.02, -0.022], [1.36, 0.097], [1.29, 0.28], [1.10, 0.35], [0.82, 0.405], [0.48, 0.445], [0.18, 0.47], [0.02, 0.475]];
  // TKN/cross-wind spike pair FIRST in the bucket (heightM p95 anchors +
  // the r12 merge-order law). T4A: x narrowed to the +0.31 column family
  // (the old 0.36 reach lit the +0.367 window at 2.286 where the ref
  // reads its 2.148 TKN line — that column now belongs to the cupola
  // sight head below); spike A z-deepened so the ref's continuous
  // 2.257-2.284 side band keeps a carrier across the -0.787w column.
  P.add('turret', box(0.065, 0.42, 0.13), 0.3025, 0.72, -1.114);
  // 2026-10-19 (owner float sweep): spike B stood 24 mm off the shell and the forward tab 39 mm ahead of spike A; B is
  // seated on the shell and the tab's back now bears on A's front face.
  P.snapGroup('t90a-roof-spike', () => P.add('turret', box(0.065, 0.44, 0.065), 0.3025, 0.735, -1.3465), { reachM: 0.04 });
  P.add('turret', box(0.065, 0.10, 0.10), 0.3025, 0.845, -0.997);
  // r10 k5: clamshell leaves forward + long (ref plan front 2.48-2.53 at
  // |x| 0.7-0.9, faces 1.46@1.36); bottoms hold the 1.42 line
  // §B3.1 (prism sweep 2026-08-06): k5Seg sections the clamshell leaves
  // (flush seams), eyeKit gives the Shtora eyes their emitter grammar.
  // T3A (turret-lane 2026-08-06, owner: "both t90a_2004 turrets are wrong"):
  // fresh plan digest — the ref leaf apex zone fronts 2.48-2.53w at
  // |x| 0.7-0.93 then CLIFFS to 1.54w by 1.14 (my old leaf line fronted
  // 1.84w out at 1.14-1.25 and only 2.40 at the apex): yaw steepened
  // (outer end retreats to x 1.28) + APEX PADS carry the 2.53 line; caps
  // pulled in (k5CapIn) off the ±1.46 window; Shtora eyes PUSHED to the
  // ref's own 2.29-2.32w front line on skin stalks (they sat 0.2 short).
  // T4A K-5 (verdict order 2: "K-5 wedges as broad plates hugging the dome
  // slopes (currently detached planks with unsupported tips)"): the leaf
  // goes BROAD (k5H 0.30) and DEEP (k5D 0.62 — body runs back into the
  // dome skin, front face plane preserved by the k5D re-center), yaw
  // steepened + length trimmed so the outer tip stops lighting the
  // ±1.14-1.25 plan cols the ref cliffs at 1.54w (today's worst plan
  // family, err 0.183-0.215); caps pulled IN (k5CapIn +0.04). Shtora goes
  // ROUND RED (eyeRound — verdict order 3).
  // (k5D 0.62 and k5H 0.30 were both TRIED and REJECTED here: under the
  // 0.42-0.47 yaw the deep/broad body's rotated corners spill to
  // |x| 1.30-1.49 and repaint the guarded ±1.14-1.46 plan cliff — the
  // broad-plate read comes from the TWO-LEAF clamshell (k5Lower) + the
  // axis-aligned under-roots below instead.)
  const p5 = { rings, sz: 1.21, k5T: 0.62, k5Out: 0.24, k5Len: 0.95, k5H: 0.18, k5Y: 0.28, k5Yaw: 0.47, k5Rise: 0, k5Seg: 5, k5CapIn: 0.04, k5Lower: { dy: 0.13, h: 0.16, dPitch: 0.35, tuck: 0.05 }, k5Bucket: 'turret', k5LeafOff: true, eyeKit: true, eyeRound: true, eyeScale: 1.32, eyeX: 0.70, eyeZ: shtoraEyeZ };
  const t90aChevron = addSovietChevronEra(P, {
    sector: 't90a-k5-turret-era',
    receiptKey: 't90AChevronEraReceipt',
    family: 't90a-kontakt5-shtora-chevron-r1',
    plans: [
      [[0.20, 1.48], [0.30, 1.60], [0.83, 1.27], [0.72, 1.14]],
      [[0.73, 1.18], [0.84, 1.30], [1.38, 0.76], [1.26, 0.64]],
    ],
    rows: [
      { y0: 0.09, y1: 0.30, z0: -0.09, z1: 0.075 },
      { y0: 0.30, y1: 0.52, z0: 0.075, z1: -0.085 },
    ],
    tileRanges: [[0.06, 0.29], [0.335, 0.665], [0.71, 0.94]],
    tileDepthM: 0.080,
    gasketDepthM: 0.030,
    // Seat the whole K-5 clamshell on the visible welded cheek face. The
    // previous zero offset left most of both rows inside the T-90SM-derived
    // foundation even though their plan geometry was otherwise correct.
    forwardM: chevronForwardM,
    // 2026-10-19 (owner float sweep): the closure stood 9-19 mm short of both carriers; 40 mm wider and 10 mm aft it
    // laps into them.
    centerClosure: { width: 0.44, height: 0.23, depth: 0.060, y: 0.225, z: 1.61, rx: -0.24 },
  });
  const shtoraHousingRearZ = shtoraEyeZ - 0.11 * p5.eyeScale;
  const shtoraHousingFrontZ = shtoraEyeZ + 0.11 * p5.eyeScale;
  const shtoraLensFrontZ = shtoraEyeZ + 0.130 * p5.eyeScale;
  const shtoraChevronDepthClearanceM = shtoraHousingFrontZ - t90aChevron.frontmostTileZM;
  const shtoraSupportBodyOverlapM = shtoraSupportFrontZ - shtoraHousingRearZ;
  P.visualEraCluster('t90a-k5-turret-support-era', 'turret', () => {
  for (const s2 of [-1, 1]) {
    // The Shtora lane is now a deliberate opening in the K-5 staircase.
    // Inner and outer modules terminate on opposite sides of the emitter
    // rather than crossing its lens.  All three roots still bury into the
    // SM wedge, so opening the optical lane does not create floating ERA.
    P.add('turret', box(0.38, 0.26, 0.18), s2 * 1.04, 0.30, 1.71, -0.38, -s2 * 0.42, 0);
    P.add('turret', box(0.16, 0.23, 0.14), s2 * 1.30, 0.30, 1.54, -0.36, -s2 * 0.48, 0);
    P.add('turret', box(0.22, 0.23, 0.18), s2 * 0.32, 0.295, 1.68, -0.38, -s2 * 0.34, 0);
    P.add('turret', box(0.32, 0.24, 0.56), s2 * 1.02, 0.24, 1.43);
    P.add('turret', box(0.13, 0.20, 0.44), s2 * 1.29, 0.25, 1.38);
    P.add('turret', box(0.20, 0.21, 0.34), s2 * 0.32, 0.31, 1.43);
    // Broad tapered eye pedestal: rear half intersects the shared welded
    // cheek, forward half enters the emitter housing.  It makes the enlarged
    // dazzler a supported armor station instead of simply pushing a lamp in
    // front of the ERA.
    P.add('turret', orientedSlab(
      [s2 * 0.54, 0.08, 1.30], [s2 * 0.86, 0.08, 1.30], [s2 * 0.86, 0.18, shtoraSupportFrontZ], [s2 * 0.54, 0.18, shtoraSupportFrontZ],
      [s2 * 0.54, 0.37, 1.30], [s2 * 0.86, 0.37, 1.30], [s2 * 0.86, 0.50, shtoraSupportFrontZ], [s2 * 0.54, 0.50, shtoraSupportFrontZ],
    ));
  }
  });
  ruShtora(P, p5, 0.38);  // T3A-b3: eyes raised (ref side bottoms 1.397+ at the eye cols)
  addT90RadialArmorBelt(P, rings, 1.21, { y: 0.18, cz: -0.18, scale: 0.92 });
  addT90ACastPerimeterFlanges(P);
  addT90AAsymmetricBustleBins(P);
  // T4A SPARSE ROOF (verdict order 1). LEFT: one segmented ESSA sight
  // housing owns the certified front steps (x -0.31..-1.10) and the FULL
  // side band — the deleted tier ran z_w -0.54..+1.34, so the housing's
  // main run extends local -0.42..+0.80 (side cols to 1.26w read 2.19
  // where the first cut left them at the 1.77 dome line, err 0.19-0.215
  // x4). Tops 2.19w split the side-2.15/front-2.211 certified difference.
  P.add('turretDark', box(0.28, 0.025, 0.82), -0.455, 0.455, 0.17);      // seated collar on the cast crown
  P.add('turret', box(0.25, 0.30, 0.82), -0.455, 0.595, 0.19);           // compact ESSA run
  P.add('turretGlass', box(0.20, 0.11, 0.03), -0.455, 0.625, 0.615);     // aperture at the forward face
  P.add('turretDark', box(0.22, 0.025, 0.05), -0.455, 0.735, 0.62);      // hood lip
  // §B3 housing grammar on the long left face (the view-left slab read):
  // panel seams + access panel + latches, all <=4mm proud INSIDE the
  // face's own column band — side mask is an x-projection (interior),
  // front cols keep their 2.19 tops. Mask-free by construction.
  for (const zs of [-0.15, 0.19, 0.53]) {
    P.add('turretDark', box(0.008, 0.36, 0.018), -0.607, 0.63, zs);
  }
  P.add('turretDark', box(0.008, 0.22, 0.30), -0.607, 0.585, 0.36);      // access panel seam
  P.add('turretDark', box(0.012, 0.04, 0.05), -0.608, 0.50, 0.25);       // latch pair
  P.add('turretDark', box(0.012, 0.04, 0.05), -0.608, 0.50, 0.47);
  P.add('turretDark', box(0.008, 0.30, 0.018), -0.917 - 0.185 + 0.0, 0.60, -0.30);  // C-face seam (x -1.102 face inset)
  // The ESSA shoulder used to meet the crown at a single 10 mm edge, so the
  // broad housing read as a floating box from the marked rear-quarter view.
  // Widen the lower pedestal inboard across the welded crown and outboard
  // beneath the housing; both joins deliberately overlap instead of relying
  // on coincident faces.
  P.add('turret', box(0.44, 0.25, 0.52), -0.78, 0.57, -0.03);
  P.add('turret', box(0.42, 0.30, 0.52), -0.88, 0.725, -0.06);
  P.add('turretDark', box(0.38, 0.016, 0.46), -0.88, 0.867, -0.06);
  // T4A ESSA rear run: the deleted left tier owned the side band z_w
  // -0.46..+0.04 at 2.19 — the housing continues rearward at 2.19w so
  // those columns keep their carrier (vladimir block-rear-extension class).
  P.add('turret', box(0.34, 0.28, 0.36), -0.66, 0.58, -0.61);
  P.add('turretDark', box(0.30, 0.014, 0.30), -0.66, 0.727, -0.61);
  // P95 datum: retain the measured plan/rake but map the raw print's tall
  // head into the published 2.23 m equipment band.
  addT90CastSightCrown(P, { y0: 0.60 });
  // RU-112 roof stations: two complete structural cupolas, seated through
  // the crown instead of one cupola plus a low, ambiguous hatch ring. The
  // left station carries the manually served NSVT and the right station's
  // paired lamps sit on a buried cross-bracket ahead of its hatch.
  const t90aRoofStations = {
    left: { x: -0.35, z: -0.48 },
    right: { x: 0.52, z: -0.42 },
  };
  if (adoptT90MFamilyGun) {
    for (const station of Object.values(t90aRoofStations)) {
      P.addCupola('turret', cylY(0.255, 0.285, 0.18, 18), station.x, 0.575, station.z);
      P.addCupola('turret', cylY(0.235, 0.255, 0.055, 18), station.x, 0.685, station.z);
      P.addHatch('turret', cylY(0.205, 0.205, 0.028, 16), station.x, 0.718, station.z);
      P.addEquipment('turretDark', box(0.055, 0.025, 0.105), station.x, 0.724, station.z - 0.17);
      for (const pa of [-0.62, 0, 0.62]) {
        P.addEquipment('turretDark', box(0.060, 0.052, 0.032),
          station.x + Math.sin(pa) * 0.20, 0.69, station.z + Math.cos(pa) * 0.20,
          0, -pa, 0);
      }
    }

    // Two independently readable armored lamp pods in front of the right
    // cupola. Their support overlaps the ring base, while the recessed glass
    // lenses face local +Z (vehicle forward).
    P.addEquipment('turret', box(0.39, 0.055, 0.15), 0.52, 0.69, -0.18);
    for (const x of [0.405, 0.635]) {
      P.addEquipment('turret', box(0.145, 0.135, 0.19), x, 0.76, -0.105);
      P.addEquipment('turretDark', cylZ(0.053, 0.025, 14), x, 0.76, 0.0025);
      P.addEquipment('turretGlass', cylZ(0.043, 0.012, 14), x, 0.76, 0.021);
    }

    // Replace the exposed hand-served receiver forest with a compact NSVT
    // weapon tower. The existing left cupola remains the structural slew
    // race; the faceted foundation overlaps its hatch and carries the optic,
    // light, ammunition coffin, yoke and forward-aligned gun as one package.
    addT90AutomatedCommanderStation(P, {
      x: t90aRoofStations.left.x,
      z: t90aRoofStations.left.z,
      seatY: 0.705,
      yaw: 0,
      scale: 0.72,
      heightScale: 0.72,
      weaponScale: 0.82,
      weaponYaw: 0,
      weaponClass: 'nsvt',
      includeRace: false,
      weaponName: 't90aRemoteNsvt',
      receiptKey: 't90aAutomatedStationReceipt',
    });
  } else {
    // Legacy derivatives replace these ordinary buckets wholesale. Preserve
    // their old donor roof so RU-112's semantic cupola buckets cannot leak
    // through a later clear-and-rebuild pass.
    P.add('turret', cylY(0.26, 0.28, 0.20, 16), 0.52, 0.57, -0.42);
    P.add('turretDark', cylY(0.215, 0.215, 0.025, 14), 0.52, 0.6725, -0.42);
    P.add('turret', cylY(0.205, 0.205, 0.025, 14), 0.52, 0.6825, -0.42);
    P.add('turretDark', box(0.05, 0.02, 0.10), 0.52, 0.692, -0.29);
    for (const pa of [-0.55, 0, 0.55]) {
      P.add('turretDark', box(0.055, 0.05, 0.03),
        0.52 + Math.sin(pa) * 0.185, 0.675, -0.42 + Math.cos(pa) * 0.185,
        0, -pa, 0);
    }
    P.add('turret', box(0.055, 0.14, 0.12), 0.355, 0.74, -0.42);
    P.add('turretDark', box(0.045, 0.05, 0.014), 0.355, 0.765, -0.353);
    P.add('turret', cylY(0.22, 0.24, 0.12, 14), -0.28, 0.53, -0.28);
    P.add('turretDark', cylY(0.19, 0.19, 0.03, 12), -0.28, 0.60, -0.28);
  }
  // RIGHT flank stowage bins on the dome shoulder (the old right box tier's
  // certified 2.0 / 1.903 lines, now two real bins with lid seams).
  P.add('turret', box(0.34, 0.30, 0.62), 0.845, 0.51, -0.44);            // top 1.995w (ref 2.0 @ x 0.70..1.0)
  P.add('turretDark', box(0.30, 0.016, 0.56), 0.845, 0.667, -0.44);
  P.add('turret', box(0.18, 0.24, 0.55), 1.08, 0.45, -0.42);
  P.add('turretDark', box(0.15, 0.014, 0.49), 1.08, 0.578, -0.42);
  // pano r10c: TWO spikes with a 2.2 dip between (ref side 2.257 at
  // -0.57..-0.68, 2.2 at -0.784, 2.284 at -0.895 — one 0.4-deep tower put
  // 15 cols at 2.26 and broke heightM p95). The 2.23 shoulder step is the
  // heightM 4th-column anchor (p95 = 2.284/2.265/2.265/2.23 = published).
  // r11 dims-p95 raster law: spike B's faces sat ON the -0.841 band
  // boundary and 7mm INSIDE the -1.002 band — on some grids it lit a 4th
  // >=2.26 column (heightM 2.26, dims 98.2) and painted the -1.002 col
  // 2.257 where the ref roof is 1.827 (the round's worst side cell).
  // Both spikes re-seated with every edge >=13mm inside its band:
  // A [-0.720,-0.590] (2 cols), B [-0.935,-0.855] (1 col).
  // r12: fresh front digest — the ref's right cols +0.24..+1.0 read
  // 1.956..2.009: the pano cluster lives LEFT of center (side cols keep
  // their 2.257/2.284 spikes; spike B rear edge pulled off the -1.002 col)
  // (T4A: the turretDetail spike DUPLICATES are deleted — the narrowed
  // camo-bucket pair after meshDomeCurved is the single carrier now.)
  // The aft sensor post previously began 200 mm above the welded bustle
  // crown. This compact shoe overlaps the shell shelf below and the post
  // above, closing the exact unsupported markup surface.
  P.add('turret', box(0.14, 0.24, 0.16), -0.93, 0.62, -1.26);
  P.add('turretDark', cylY(0.05, 0.05, 0.16, 10), -0.93, 0.805, -1.33);
  // Narrow met/crown collar at the measured left roof station.  Its full
  // lower half penetrates the dome and its lid remains below the adjacent
  // mast profile, so it closes the source front-view step without creating
  // a new profile spike or an unsupported decoration.
  // 2026-10-19 (owner float sweep): the collar stood 25 mm over the dome; it and its lid sit 27 mm lower.
  P.add('turret', box(0.13, 0.335, 0.08), -0.36, 0.6905, -1.28);
  P.add('turretDark', box(0.11, 0.014, 0.065), -0.36, 0.851, -1.28);
  // T4A: cross-wind mast head raised toward the ref's 2.296 line at the
  // -0.229 front column (proc read 2.195) — CAPPED at 2.24 (inside the 1%
  // heightM grace: at 2.29 the head became a 4th-5th >grace column and
  // p95 flipped heightM to 2.26 / dims 98.2; measured). z re-seated to
  // the [-0.879,-0.779]w side window center, where the ref's own 2.284
  // spike col had no carrier.
  mast(P, -0.23, 0.46, -1.28, 0.905, 0.022, 0.06);
  if (!recordSeatReceipt) {
    P.add('turretDark', box(0.27, 0.035, 0.15), -0.62, 0.685, -0.55, 0, -0.25, -0.08);
    P.add('turretDark', box(0.050, 0.15, 0.050), -0.62, 0.60, -0.55);
    P.add('turretDark', box(0.25, 0.10, 0.030), -0.62, 0.68, -0.47, -0.12, -0.25, 0);
    const mg = FITTINGS.pintleMG({ mats: P.mats, cls: 'nsvt', tone: 'dark', elev: -0.10, ammo: true, scale: 1.14, shield: false });
    mg.position.set(-0.62, 0.51, -0.55);
    mg.rotation.y = -0.35;
    P.turretG.add(mg);
  }
  // bustle bin band (r10b: x narrowed to +-1.05 — ref plan rear at
  // +-1.11-1.22 is the -0.85 bin line, the 2.5-wide slab read -1.74 there)
  P.add('turret', box(1.86, 0.455, 0.50), 0, 0.2375, -1.62);  // T3A-b2: x edge 0.93 (10mm off the ±1.008 window), rear -1.41w, bottom 1.345w
  // r10c bustle rear: ref side steps 1.639@-1.54 -> 1.371@-1.65 and ENDS
  // -1.70 (the -1.91 slab was an ONLY-PROC column) — box2 to world -1.59
  // plus a low 1.33..1.385 tail shelf to -1.707
  P.add('turret', box(1.86, 0.307, 0.10), 0, 0.1665, -1.88);  // T3A-b2: bottom 1.323w (ref -1.54/-1.432 col bottoms 1.344)
  P.add('turret', box(1.70, 0.30, 0.075), 0, 0.17, -2.0);
  for (const s2 of [-1, 1]) P.add('turret', box(0.46, 0.10, 0.14), s2 * 0.70, 0.03, -2.07);  // T3A/b3: rear -1.68w, x edge 0.93, bottom 1.315w (ref 1.344 — the -0.115 seat owned the rear-col bottoms)
  // (T4A bustle rear extension TRIED and REVERTED: the ref's -1.766w plan
  // rear at |x| 0.7-1.04 has NO side-mask twin — side z -1.755w reads ref
  // NONE (the T3A "-1.755 ONLY-PROC col" law re-proven, err 9) and the
  // -1.008 plan window re-owned rear -1.74 where the ref notches -0.906.
  // The plan-rear residual stays the certified print-asym class.)
  // Join the asymmetric right bustle run to the central bustle with real
  // overlap. The former 120 mm lateral air gap left every outboard bin
  // parented to the turret but visibly unsupported at oblique yaw.
  P.add('turret', box(0.30, 0.07, 0.52), 1.05, 0.0375, -1.859);
  P.add('turret', box(0.27, 0.20, 0.55), 1.325, 0.115, -1.624);
  P.add('turret', box(1.70, 0.055, 0.11), 0, 0.0225, -2.055);
  // A narrow casting tongue closes the final source profile station.  It
  // continues directly from the low bustle shelf; its one-pixel-height end
  // is real rear armor, not an isolated decoration or broad fake wall.
  P.add('turret', box(0.04, 0.020, 0.14), -0.695, 0.025, -2.18);
  P.add('turretDark', box(1.70, 0.24, 0.03), 0, 0.155, -1.99);
  for (const s of [-1, 1]) P.add('turretDetail', box(0.03, 0.05, 0.44), s * 0.92, 0.03, -1.79);  // T3A-b2/b5: rear -1.55w, x ±0.92 (the ±1.00 seat owned the ±1.008 plan window rear at -1.55)
  // Source-seated flank cassettes replace the old continuous U-shaped wall.
  // Real gaps reveal the buried carrier and preserve the cast-dome outline.
  addT90CastFlankCassettes(P, { y: 0.24, raisedLeftRear: true });
  return {
    shtoraHousingRearZ,
    shtoraHousingFrontZ,
    shtoraLensFrontZ,
    shtoraChevronDepthClearanceM,
    shtoraSupportBodyOverlapM,
    roofStations: t90aRoofStations,
  };
}

function addT90ALegacyGun(P: T90BuilderPort, {
  gunRadiusScale,
  gunAssemblyRaiseM,
  recordSeatReceipt,
  turretSeatZ,
  turretRearwardShiftM,
  shtoraEyeZ,
  shtoraLocalForwardShiftM,
  shtoraSupportFrontZ,
  nsvtRaiseM,
}: ResolvedT90ALegacyOptions, receiptContext: T90ALegacyTurretReceiptContext): void {
  const { box, cylZ } = KIT;
  const {
    shtoraHousingRearZ,
    shtoraHousingFrontZ,
    shtoraLensFrontZ,
    shtoraChevronDepthClearanceM,
    shtoraSupportBodyOverlapM,
    roofStations,
  } = receiptContext;
  // ---- 2A46M-2 on the normalized contour: axis 1.54, muzzle world +6.10 ----
  // Raise the articulated trunnion as one unit. All gun, gunDark and
  // gunMount buckets are children of rig_gun, so the saddle, cast collar,
  // recoil housing, boot, barrel and bore retain their accepted alignment.
  P.gunG.position.set(0, 0.165 + gunAssemblyRaiseM, 0.825);
  ruSaddle(P, { rollR: 0.22, rollW: 0.62, tubeR: 0.117 * gunRadiusScale, rootL: 0.69 });
  // §B3.1 (prism sweep 2026-08-06): the bare mantlet block becomes the cast
  // collar — elliptical frustum with the SAME plan (±0.28) and side (±0.20)
  // extremes at center axes; masks read identical rectangles, only the
  // corner read rounds. Boot fold rings ride inside the block∪chin∪tube
  // envelope and a clamp ties the boot onto the tube at the chin's end.
  P.addGunExtra(KIT.xform(cylZ(0.5, 0.30, 16, 0.46), 0, 0, 0, 0, 0, 0, [0.56, 0.40, 1]), 0, 0.02, 0.13);
  // §B3.2 (2026-08-06): PKT coax port right of the tube — dark muzzle stub
  // + port washer INSIDE the collar's plan rectangle (±0.28 to z 0.28) and
  // side band (±0.20): flush-recessed, zero silhouette in every view.
  P.addGunExtraDark(cylZ(0.020, 0.05, 8), 0.20, 0.07, 0.25);
  P.addGunExtraDark(cylZ(0.030, 0.012, 10), 0.20, 0.07, 0.272);
  // r10: housing z-trimmed (ref 2.15 ends world 1.63); hump extended to the
  // ref's 2.61; chin slimmed to the 1.375..1.515 band (its 1.17 bottom
  // owned six side cols where the ref floor is 1.397-1.424)
  // r10c: housing SLOPED — ref 1.946 at -0.06..-0.12, tall only past -0.14
  P.addGunExtra(box(0.09, 0.11, 0.28), -0.095, 0.395, 0.20);
  P.addGunExtra(box(0.21, 0.24, 0.28), -0.245, 0.55, 0.20);
  // §B3: the housing's outer face carries its sight aperture — dark inset
  // + brow, flush on the existing face.
  P.add('gunMountDark', box(0.15, 0.10, 0.016), -0.245, 0.55, 0.341);
  P.addGunExtra(box(0.21, 0.025, 0.05), -0.245, 0.655, 0.32);
  // r10b hump SPLIT: ref plan front at +-0.15..0.4 is 2.185-2.265 while the
  // side carries 1.96 to z 2.6 — wide part ends 2.25, narrow nose to 2.63
  // T4A HUMP SPLIT (today's workorder: the flat 0.46-wide cover printed
  // 1.999 across the center front cols where the ref dips 1.818 at
  // |x|<=0.03 and holds 1.946-1.956 at ±0.06..0.23 — the print's recoil
  // housing is TWO cheek covers over a center channel, §B3.1 grammar):
  for (const sH of [-1, 1]) {
    P.addGunExtra(box(0.175, 0.20, 0.80), sH * 0.1425, 0.35, 0.565);     // cheek covers: top 1.95w
    // The cheek stays tall through the source's 2.45 m break, then its roof
    // falls sharply into the tube instead of ending as a square floating
    // block.  Two joined sections preserve the exact plan rectangle while
    // matching the real longitudinal section.
    P.addGunExtra(box(0.06, 0.20, 0.195), sH * 0.085, 0.38, 1.0675);
    P.addGunExtra(orientedSlab(
      [sH * 0.055, 0.28, 1.165], [sH * 0.115, 0.28, 1.165], [sH * 0.115, 0.28, 1.309], [sH * 0.055, 0.28, 1.309],
      [sH * 0.055, 0.48, 1.165], [sH * 0.115, 0.48, 1.165], [sH * 0.115, 0.323, 1.309], [sH * 0.055, 0.323, 1.309],
    ));
  }
  P.addGunExtra(box(0.11, 0.14, 0.80), 0, 0.25, 0.565);                  // center channel floor 1.82w (ref 1.818)
  P.addGunExtra(box(0.06, 0.12, 0.339), 0, 0.26, 1.1395);
  P.addGunExtra(box(0.62, 0.14, 0.55), 0, -0.055, 0.39);
  // §B3.1: hump identity — top-edge chamfer strips (down-outward, riding
  // the new cheek tops), dark weld seams at the wide->nose joint and dark
  // canvas end faces (all flush, split per cheek/channel — T4A).
  for (const s of [-1, 1]) {
    P.addGunExtra(KIT.xform(box(0.05, 0.014, 0.78), 0, -0.007, 0, 0, 0, s * 0.5), s * 0.185, 0.44, 0.565);
    P.add('gunMountDark', box(0.175, 0.18, 0.016), s * 0.1425, 0.35, 0.958);
    P.add('gunMountDark', box(0.06, 0.043, 0.014), s * 0.085, 0.3015, 1.302);
  }
  P.add('gunMountDark', box(0.11, 0.10, 0.016), 0, 0.25, 0.958);
  P.add('gunMountDark', box(0.06, 0.08, 0.014), 0, 0.26, 1.302);
  // boot fold rings + clamp (inside block/chin/tube envelope)
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0, [0.54, 0.30, 1]), 0, 0.0, 0.21);
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0, [0.60, 0.21, 1]), 0, -0.008, 0.36);
  P.addGunExtraDark(KIT.xform(cylZ(0.5, 0.04, 14), 0, 0, 0, 0, 0, 0, [0.60, 0.21, 1]), 0, -0.008, 0.52);
  P.addGunExtraDark(KIT.xform(cylZ(0.150 * gunRadiusScale, 0.04, 14), 0, 0, 0), 0, 0, 0.645);
  if (recordSeatReceipt) {
    // T-90M-family 2A46M-5 thermal-jacket profile. The A-model keeps its
    // accepted cast collar and mantlet, while the exposed tube now carries
    // the production M's substantial 108/102-mm courses instead of
    // collapsing to a 49-mm pencil barrel after the evacuator.
    const t90aMuzzleZ = 4.92;
    tubeGun(P, [
      [0.65, 1.47, T90M_2A46M5_VISUAL_DATUM.sleeveRadiusM],
      [1.47, 3.17, T90M_2A46M5_VISUAL_DATUM.sleeveRadiusM],
      [3.17, 4.72, T90M_2A46M5_VISUAL_DATUM.forwardRadiusM,
        T90M_2A46M5_VISUAL_DATUM.forwardRadiusM, 0, 0.005],
      [4.72, t90aMuzzleZ, T90M_2A46M5_VISUAL_DATUM.forwardRadiusM,
        T90M_2A46M5_VISUAL_DATUM.forwardRadiusM, 0, 0.005],
    ], { rings: [[1.47, 0.112], [2.12, 0.112], [3.17, 0.106], [3.87, 0.106], [4.30, 0.106]], muzzle: t90aMuzzleZ });
    P.add('gun', KIT.xform(cylZ(T90M_2A46M5_VISUAL_DATUM.muzzleCollarRadiusYM, 0.15, 14),
      0, 0, 0, 0, 0, 0, [0.839, 1, 1]), 0, 0.033, t90aMuzzleZ - 0.155);
    muzzleBore(P, {
      z: t90aMuzzleZ,
      r: T90M_2A46M5_VISUAL_DATUM.forwardRadiusM,
      boreR: T90M_2A46M5_VISUAL_DATUM.boreRadiusM,
      y: 0.005,
    });
    P.add('gun', cylZ(T90M_2A46M5_VISUAL_DATUM.fumeExtractorRadiusM, 0.46, 14, 0.116), 0, 0, 2.88);
    P.add('gunDark', cylZ(0.130, 0.04, 14), 0, 0, 3.11);
    P.gunG.userData.t90FamilyGunReceipt = Object.freeze({
      referenceFamily: T90M_2A46M5_VISUAL_DATUM.family,
      sleeveRadiusM: T90M_2A46M5_VISUAL_DATUM.sleeveRadiusM,
      forwardRadiusM: T90M_2A46M5_VISUAL_DATUM.forwardRadiusM,
      muzzleCollarRadiusXM: T90M_2A46M5_VISUAL_DATUM.muzzleCollarRadiusXM,
      muzzleCollarRadiusYM: T90M_2A46M5_VISUAL_DATUM.muzzleCollarRadiusYM,
      boreRadiusM: T90M_2A46M5_VISUAL_DATUM.boreRadiusM,
      muzzleZ: t90aMuzzleZ,
      assemblyRaiseM: gunAssemblyRaiseM,
    });
  } else {
    // Burlak deliberately retains its already accepted prototype cannon. It
    // calls this builder only as a donor before replacing the complete turret.
    tubeGun(P, [
      [0.65, 1.47, 0.085 * gunRadiusScale],
      [1.47, 3.17, 0.090 * gunRadiusScale],
      [3.17, 4.72, 0.045 * gunRadiusScale, 0.045 * gunRadiusScale, 0, 0.005],
      [4.72, 4.816, 0.045 * gunRadiusScale, 0.045 * gunRadiusScale, 0, 0.005],
    ], { rings: [[1.47, 0.092 * gunRadiusScale], [2.12, 0.093 * gunRadiusScale], [3.17, 0.072 * gunRadiusScale], [3.87, 0.050 * gunRadiusScale], [4.30, 0.050 * gunRadiusScale]], muzzle: 4.816 });
    muzzleBore(P, { r: 0.045 * gunRadiusScale, y: 0.005 });
    P.add('gun', cylZ(0.098 * gunRadiusScale, 0.42, 14, 0.090 * gunRadiusScale), 0, 0, 2.88);
    P.add('gunDark', cylZ(0.100 * gunRadiusScale, 0.04, 14), 0, 0, 3.09);
  }
  if (recordSeatReceipt) {
    P.turretG.userData.t90aSeatReceipt = {
      turretSeatZ,
      turretRearwardShiftM,
      shtoraEyeZ,
      shtoraLocalForwardShiftM,
      shtoraSupportFrontZ,
      shtoraHousingRearZ,
      shtoraHousingFrontZ,
      shtoraLensFrontZ,
      shtoraChevronDepthClearanceM,
      shtoraSupportBodyOverlapM,
      gunRadiusScale,
      gunAssemblyRaiseM,
      gunAxisY: P.gunG.position.y,
      cupolaCount: 2,
      leftCupola: [roofStations.left.x, roofStations.left.z],
      rightCupola: [roofStations.right.x, roofStations.right.z],
      rightCupolaLightCount: 2,
      leftCupolaMannedMg: null,
      leftCupolaRemoteWeapon: 'nsvt',
      leftCupolaArmoredTower: true,
      nsvtRaiseM,
      roofHousingPedestalOverlapM: 0.12,
      aftSensorPedestalOverlapM: 0.015,
      rightBustleBridgeOverlapM: 0.03,
    };
  }
}

function finishT90ALegacy(P: T90BuilderPort): void {
  const { box } = KIT;
  // T5F-d: numbers on the VERTICAL flank-wall faces — the prism wall is
  // side-occluded by the flank walls (render check), and the old ringSkin
  // dome seat floats inside the welded shell (§5.04 DECAL FLOAT class).
  // Right rides the tall wall above the outer wall's 0.26 top; both flush
  // on existing certified faces (no new mask column).
  P.decal('turret', 'number', P.spec.visual.number || '', 0.17, [1.568, 0.30, -0.50], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.25, [-1.568, 0.24, -0.50], -Math.PI / 2);
  P.topY = 0.90;
}

function buildT90ALegacy(P: T90BuilderPort, {
  turretSeatZ = T90A_TURRET_SEAT_Z_M,
  turretRearwardShiftM = T90A_TURRET_REARWARD_SHIFT_M,
  shtoraEyeZ = T90A_SHTORA_EYE_Z_M,
  shtoraLocalForwardShiftM = T90A_SHTORA_LOCAL_FORWARD_SHIFT_M,
  shtoraSupportFrontZ = T90A_SHTORA_SUPPORT_FRONT_Z_M,
  chevronForwardM = T90A_CHEVRON_FORWARD_M,
  nsvtRaiseM = T90A_NSVT_RAISE_M,
  gunRadiusScale = T90A_GUN_RADIUS_SCALE,
  gunAssemblyRaiseM = T90A_GUN_ASSEMBLY_RAISE_M,
  adoptT90MFamilyGun = true,
  recordSeatReceipt = true,
}: T90ALegacyOptions = {}): void {
  const options: ResolvedT90ALegacyOptions = {
    turretSeatZ,
    turretRearwardShiftM,
    shtoraEyeZ,
    shtoraLocalForwardShiftM,
    shtoraSupportFrontZ,
    chevronForwardM,
    nsvtRaiseM,
    gunRadiusScale,
    gunAssemblyRaiseM,
    adoptT90MFamilyGun,
    recordSeatReceipt,
  };
  // Lane t90-family-266 (Main's ruling 2026-10-30, option 1): the T-90A is built on the T-90 family chassis with the
  // 1992 tank's Kontakt-5 fit. Its side photographs show the same hull (deck about 1.55 m, full-height skirt to the
  // road-wheel tops, K-5 on the front three panels); the print-fitted T-90A loft sat 15-20 cm low with a 16 cm skirt.
  addT90FamilyChassis(P, 'kontakt5');
  const receiptContext = addT90ALegacyTurret(P, options);
  addT90ALegacyGun(P, options, receiptContext);
  finishT90ALegacy(P);
}


// PT-91M now has its owner-selected T-72BU core in pt91mPendekar.ts.












interface T90SMLegacyTurretContext {
  tw: number;
  h: number;
  turretRingReceipt: Readonly<{
    topRadiusM: number;
    bottomRadiusM: number;
    heightM: number;
    yM: number;
    zM: number;
  }>;
}

function addT90SMLegacyTurretShell(P: T90BuilderPort): T90SMLegacyTurretContext {
  const { box, cylY } = KIT;
  // ---- WELDED turret: faceted prism + squared removable bustle ----
  // r6: prism roof shaved to the ref's 1.99 face-roof line; the 2.24-2.26
  // band lives on flank roof boxes at |x| 0.65..1.05 (ref front cols +-0.1..
  // 0.61 read 1.99); tower bodies low (1.94) with THIN 2.24-2.25 spikes at
  // world -1.39/-1.94 (ref side 1-col spikes); heightM p95 -> 2.24 (pub 2.23)
  const { tw, f, h } = addT90SMTurretFoundation(P);
  // Owner fit pass (2026-08-25): a tapered structural collar spans the
  // hull-deck/turret seam.  Its lower edge is buried 40 mm below the turret
  // datum and its upper edge overlaps the first 80 mm cheek course, so the
  // rotating assembly remains visibly seated through every yaw angle.
  const turretRingReceipt = Object.freeze({
    topRadiusM: 1.08, bottomRadiusM: 1.14, heightM: 0.12, yM: 0.02, zM: -0.06,
  });
  P.add('turret', cylY(
    turretRingReceipt.topRadiusM,
    turretRingReceipt.bottomRadiusM,
    turretRingReceipt.heightM,
    P.q ? 28 : 18,
  ), 0, turretRingReceipt.yM, turretRingReceipt.zM);
  // r9: ref welded front is a WIDE WEDGE — plan front 1.80@|x|1.02,
  // 1.72@1.13, 1.37@1.48, 1.15@1.69 (the old 0.62/0.14 taper cut the
  // cheeks 0.6-0.9 short); cheek stow panels are small 0.33-deep blobs at
  // z world 0.70..1.12 (their old 1.10-deep reach out to x 1.898 owned the
  // plan +-1.9 monster columns with the hull course missing).
  // T3R TURRET RE-LOFT (turret-lane 2026-08-06, owner punch list 3: "turret
  // does not look good"): the ref welded roof is NOT flat 1.99 — side digest
  // reads 1.912 over z world 0.98..1.63, raking to 1.83 at the face, with the
  // 1.99 line only over the rear-center crown; the rear casting base rises to
  // the 1.50-1.53 underside line behind z world -0.8 (poly base 1.40 was 0.11
  // deep on six cols); the nose reaches plan 1.95-1.98 world at |x|<=0.5
  // (proc ended 1.60-1.73: 12 cols x 0.08-0.15). Prism h 0.515 (roof 1.915),
  // rear outline pulled to -0.80 local with a rear casting shelf (bottom
  // 1.50) carrying the bustle, raked §B1 nose slabs to the measured plan
  // staircase, and a raised center crown plate (1.985) with hatch rings.
  // T4S: the T3R hatch "rings" were ARG-SWAPPED cylY cones (rT,rB,h —
  // 19cm-tall spikes; whatsat vertex-arc decode). The cone accidentally
  // carried the ref's OWN ~2.083 slice-6 cupola mass (flattening it alone
  // cost stations slice 6 +2.45, measured) — so the commander hatch is
  // now an honest RAISED CUPOLA at the same z, x-shifted to -0.395 so its
  // rim clears the ±0.11-0.19 front cols the ref holds at 1.99 (the
  // cone's own +0.09 err family there, now freed). Gunner ring flat.
  // (T4S final: BOTH T3R cones were ref-matched 2.08 rims — the slice-6
  // profile carries commander AND gunner cupola rims. Honest raised
  // cupolas now: commander x -0.395 keeps the ±0.11-0.19 front cols free
  // (whole-best seat, measured 58.1); the gunner rim hides under the
  // Sosna's own 2.15 front line, so its ref envelope is free to match.)
  P.add('turretDark', cylY(0.19, 0.19, 0.012, 16), -0.395, 0.591, 0.10);
  P.add('turret', cylY(0.155, 0.165, 0.07, 16), -0.395, 0.632, 0.10);   // commander cupola drum
  P.add('turretDark', cylY(0.165, 0.165, 0.013, 16), -0.395, 0.6735, 0.10);
  P.add('turret', cylY(0.135, 0.135, 0.018, 16), -0.395, 0.680, 0.10);  // lid
  P.add('turretDetail', box(0.10, 0.13, 0.07), -0.28, 0.665, 0.10);      // commander's forward periscope, foot buried in the cupola rim and ending at the source center-dip boundary
  P.add('turretGlass', box(0.08, 0.055, 0.008), -0.28, 0.675, 0.139);
  P.add('turretDark', cylY(0.17, 0.17, 0.012, 16), 0.33, 0.591, -0.16);
  P.add('turret', cylY(0.155, 0.17, 0.075, 16), 0.33, 0.6325, -0.16);   // gunner cupola drum
  P.add('turretDark', lathedWheelSection([[-.007,.132],[-.007,.17],[.007,.17],[.007,.132]],16).rotateZ(Math.PI/2), 0.33, 0.677, -0.16); // rim (top 2.084 = the ref slice-6 right rim)
  P.add('turret', cylY(0.132, 0.132, 0.012, 16), 0.33, 0.678, -0.16);   // lid flush
  P.add('turretDetail', box(0.10, 0.022, 0.03), -0.395, 0.596, 0.315);  // hatch hinge
  P.add('turretDetail', box(0.09, 0.022, 0.03), 0.33, 0.596, 0.03);
  for (const s of [-1, 1]) {
    const inner = s * tw * 0.15, outer = s * tw;
    P.add('turret', orientedSlab(
      [inner, 0.08, f], [outer, 0.08, f * 0.18], [outer, 0.08, -0.2], [inner, 0.08, f * 0.60],
      [inner, h * 0.8, f * 0.58], [outer * 0.9, h * 0.66, f * 0.05], [outer * 0.9, h * 0.72, -0.3], [inner, h * 0.9, f * 0.38]));
    // T3R nose wedge (§B1 one raked plane per section): plan staircase to
    // the ref line — 1.868 local @|x| 0.44, 1.80 @0.78, joining the poly
    // edge 1.695 @1.05; chin rises 1.40 -> 1.54 world toward the face.
    // Mirrored slabs bind through orientedSlab (§C.1 winding guard).
    // T3R-b3: tops join the poly ROOF plane (0.515 — the old 0.53 rear
    // corner stepped 15mm over it) and rake to 0.40 at the face (ref side
    // 1.83@1.744 world; the 0.435 front edge printed 1.857).
    P.add('turret', orientedSlab(
      [s * 0.78, 0.12, 1.30], [s * 1.16, 0.12, 1.24], [s * 1.16, 0.235, 1.585], [s * 0.78, 0.275, 1.80],
      [s * 0.78, 0.515, 1.30], [s * 1.16, 0.515, 1.24], [s * 1.16, 0.49, 1.585], [s * 0.78, 0.354, 1.80]));
    P.add('turret', orientedSlab(
      [s * 0.44, 0.07, 1.30], [s * 0.78, 0.07, 1.30], [s * 0.78, 0.225, 1.80], [s * 0.44, 0.25, 1.868],
      [s * 0.44, 0.515, 1.30], [s * 0.78, 0.515, 1.30], [s * 0.78, 0.414, 1.80], [s * 0.44, 0.40, 1.868]));
    P.add('turret', orientedSlab(
      [s * 0.14, 0.07, 1.30], [s * 0.44, 0.07, 1.30], [s * 0.44, 0.25, 1.868], [s * 0.14, 0.25, 1.868],
      [s * 0.14, 0.515, 1.30], [s * 0.44, 0.515, 1.30], [s * 0.44, 0.40, 1.868], [s * 0.14, 0.40, 1.868]));
    // T3R-b3 cheek forward wedge: the ref plan front at |x| 1.52..1.62
    // reads 1.269..1.324 world (my main panel ended at 1.105) — a raked
    // plan taper off the casting wall onto the stow panel.
    // §5.331 FLUSH RE-SEAT (owner markup faces 592/593 — the §5.74/§5.79
    // panel-pitch class): the wedge walls were authored dead VERTICAL
    // ("vertically pointing up"). The top ring now pulls inboard onto the
    // prism wall plane (local side rake ~40°), top edge buried in the
    // shell (1.22-1.24 < wall 1.276 @ y 0.40), so the corner panel lies
    // ON the sloped cheek.  Keep the lower ring 80 mm above the turret
    // datum: the former -5 mm ring landed on the hull deck at world y 1.40
    // and made this turret-owned wedge touch the fixed hull through yaw.
    P.add('turret', orientedSlab(
      [s * 1.565, 0.080, 1.18], [s * 1.65, 0.080, 1.065], [s * 1.735, 0.080, 1.00], [s * 1.565, 0.080, 1.00],
      [s * 1.24, 0.40, 1.13], [s * 1.36, 0.40, 1.03], [s * 1.445, 0.40, 0.97], [s * 1.22, 0.40, 0.97]));
    // r10 cheek stow split (fresh plan/front digest): ref plan front/rear at
    // |x| 1.67..1.78 is [1.153..0.313]/[1.099..0.611]; front tops taper
    // 1.829@1.674 -> 1.733@1.845 — a main panel + a lower outer panel with
    // a lid seam (§B3), no yaw skew.
    // The old cassette was a narrow rectangular box whose inboard wall at
    // |x|=1.57 remained visible from the roof cameras.  Carry the cassette
    // back into the welded cheek instead: the lower plate keeps the recovered
    // outer envelope while the upper plate follows the cheek rake.  The rear
    // and inner edges overlap the shell, so this reads as seated armor rather
    // than a cabinet stood beside the turret.
    // §5.331 FLUSH RE-SEAT (owner markup faces 600/601 outer + 604/605
    // exposed inboard wall): the main cassette stood near-vertical (outer
    // face 9.7° from vertical, inboard wall proud of the shell above
    // y 0.30). Top ring re-pitched to the turret side slope — outer face
    // now 36.9°, raised to y 0.50 so the pitched plane carries the mass
    // the retired ±1.51-col wall boxes held — and the whole top ring is
    // buried inside the prism wall (1.10-1.36 < wall 1.19-1.21 @ y 0.50):
    // the standing inboard face is gone, the panel back sits flush on the
    // shell.  Its lower ring shares the same 80 mm turret-deck clearance as
    // the forward wedge; x/z plan extents stay unchanged.
    P.add('turret', orientedSlab(
      [s * 1.42, 0.080, 0.14], [s * 1.735, 0.080, 0.18], [s * 1.735, 0.080, 1.02], [s * 1.48, 0.080, 1.08],
      [s * 1.10, 0.500, 0.10], [s * 1.36, 0.500, 0.18], [s * 1.36, 0.500, 1.00], [s * 1.13, 0.500, 1.06],
    ));
    // Owner markup (2026-08-25): the asymmetric outer cheek wedges and
    // their lid seams were proud of the welded face and read as unsupported
    // side protrusions.  Retire that complete add-on course; the pitched
    // main cassette above already overlaps and closes the cheek shell.
    // Flank transition: replace the two isolated boxes (and their exposed
    // |x|=1.36/1.495 walls) with overlapping wedges that continue the same
    // cheek plane into the bustle shoulder.
    // §5.331: both transition wedges pitched with the panel family (they
    // leaned 6-8° — right behind the re-pitched cheek panels they read as
    // the same standing-vertical class). Bottom rings byte-unchanged;
    // tops pulled inboard onto the shell/crown line (33.8° / 39.5°).
    P.add('turret', orientedSlab(
      [s * 1.18, 0.12, -0.42], [s * 1.50, 0.12, -0.42], [s * 1.50, 0.12, 0.14], [s * 1.18, 0.12, 0.14],
      [s * 1.08, 0.56, -0.38], [s * 1.205, 0.56, -0.38], [s * 1.205, 0.56, 0.14], [s * 1.08, 0.56, 0.14],
    ));
    P.add('turret', orientedSlab(
      [s * 1.38, 0.12, -0.14], [s * 1.63, 0.12, -0.14], [s * 1.63, 0.12, 0.18], [s * 1.38, 0.12, 0.18],
      [s * 1.20, 0.46, -0.12], [s * 1.35, 0.46, -0.12], [s * 1.35, 0.46, 0.16], [s * 1.20, 0.46, 0.16],
    ));
  }
  P.add('turret', box(0.12, 0.07, 0.55), 1.14, 0.595, -0.145);          // right flank cassette crown — §5.331: re-seated inboard onto the pitched transition top (1.08..1.205 @ 0.56)
  // The two left-only end-cap bands belonged to the retired outer cheek
  // wedge.  Remove them with their parent so no dark sliver floats beside
  // the now-clean main cassette.
  // (r12 ±1.51-col casting-wall carrier boxes RETIRED §5.331: they were
  // fully buried inside the old near-vertical cassettes and existed only
  // to hold the vertical-stance front mask to the 1.94 line — with the
  // cheek panels pitched onto the side slope by owner order they would
  // poke through the flush planes as fins. Their mass is folded into the
  // main cassette's raised 0.50 top ring; front-mask delta re-gates with
  // the print restore.)
  // T3R-b3 LEFT flank bin (ref front ±1.12 cols read 2.009 — the right
  // side has the 2.17 bin, the left carried only the deleted upper-Relikt
  // crest): real SM flank stowage on the roof edge + lid seam.
  P.add('turret', box(0.38, 0.20, 0.70), -1.04, 0.54, 0.15);
  P.add('turretDark', box(0.34, 0.016, 0.64), -1.04, 0.634, 0.15);
  // Joined left roof-edge cassette closes the real -1.36..-1.23 shoulder
  // between the casting wall and the plateau bin.  Its 1.94 m roof follows
  // the recovered front staircase and both side faces overlap their carriers.
  // §5.331: pitched with the family (its vertical outer wall poked through
  // the re-pitched transition wedge above y≈0.33); lid re-seated onto the
  // new 1.10..1.185 top. Bottom ring unchanged.
  P.add('turret', orientedSlab(
    [-1.23, 0.16, -0.125], [-1.36, 0.16, -0.125], [-1.36, 0.16, 0.425], [-1.23, 0.16, 0.425],
    [-1.10, 0.54, -0.125], [-1.185, 0.54, -0.125], [-1.185, 0.54, 0.425], [-1.10, 0.54, 0.425],
  ));
  P.add('turretDark', box(0.075, 0.014, 0.49), -1.1425, 0.547, 0.15);
  return { tw, h, turretRingReceipt };
}

function addT90SMLegacyRoof(
  P: T90BuilderPort,
  _context: T90SMLegacyTurretContext,
): void {
  const { box, cylY } = KIT;
  // T3R ROOF EQUIPMENT ENSEMBLE (owner punch list 3: "no attachments or
  // decorations or the machine gun turret"). Today's side digest: the ref's
  // tall 2.239 band spans z world -0.44..-1.32 (my old towers sat aft+low —
  // the -0.44..-0.88 cols read bare roof). The VISIBLE equipment goes right
  // where the print wants mass: pano commander sight (head 2.235) forward,
  // the UDP T05BV-1 RWS (shrouded Kord, yawed right per the abrams CROWS
  // laws — never dead-forward, shapes CONNECTED) behind it, Sosna-U gunner
  // housing on the right crown. heightM p95 stays 2.24-2.25 (ref-aligned
  // spike band, 1%-grace legal — same regime as the certified plateau).
  // Left plateau bin (ref 2.25 line, z world -0.94..-1.44) + bracket:
  P.addEquipment('turret', box(0.12, 0.29, 0.46), -0.77, 0.70, -1.28);  // T5H-b/c: z-span 23mm clear of the re-phased -1.443w window; top 2.245w — the 2.25 top + boundary AA sampled heightM p95 2.2532 > the 2.2523 grace (dims 99.7 x2 measured; the pano-cap suspect was innocent)
  P.add('turretDark', box(0.10, 0.022, 0.42), -0.77, 0.826, -1.28);
  P.add('turret', box(0.08, 0.06, 0.10), -0.77, 0.52, -1.40);          // bin bracket onto the bustle step (§B2)
  // Right roof-bin re-split: main 2.17 body only to x 0.89; outer sliver at
  // the r10 front cap 2.105 (|x| 0.91..0.99); front pulled to z 0.38 so the
  // 0.542/0.651 side cols read the Sosna-U steps (ref 2.103/2.021), not the
  // old proud 2.17 lid (+0.05..+0.14 on four cols).
  P.add('turret', box(0.20, 0.185, 0.69), 0.79, 0.6175, 0.035);  // T3R-b5: top 2.13 (mid-z side cols read ref 2.103)
  P.add('turretDark', box(0.17, 0.022, 0.63), 0.79, 0.699, 0.035);     // §B3: lid seam
  P.add('turret', box(0.18, 0.07, 0.21), 0.79, 0.745, -0.205);         // joined rear crown, source 2.18 m shoulder
  P.add('turretDark', box(0.15, 0.014, 0.18), 0.79, 0.777, -0.205);
  // The outer Sosna service cassette steps up to the source's 2.19 m line
  // only on its rear roof.  A full-depth tall box fixed the front view but
  // falsely held that crest through the lower forward side station; retain
  // the seated 2.105 m body and add the real joined rear crown instead.
  P.add('turret', box(0.12, 0.155, 0.69), 0.95, 0.6275, 0.035);
  P.add('turret', box(0.12, 0.085, 0.21), 0.95, 0.7475, -0.205);
  P.add('turretDark', box(0.10, 0.016, 0.19), 0.95, 0.782, -0.205);
  // 2026-10-19 (owner float sweep): the latch pair stood 63 mm over the shell; each is dropped onto it.
  P.snapGroup('t90sm-latch', () => P.add('turretDark', box(0.022, 0.05, 0.014), 0.88, 0.60, 0.39), { reachM: 0.07, mode: 'down' });      // latch pair
  P.snapGroup('t90sm-latch', () => P.add('turretDark', box(0.022, 0.05, 0.014), 0.70, 0.60, 0.39), { reachM: 0.07, mode: 'down' });
  // Sosna-U gunner sight (right of the gun on the MS): housing + hood +
  // aperture on the crown plate, stepping 2.095 -> 2.015 down the ref line.
  P.add('turretDetail', box(0.34, 0.165, 0.15), 0.30, 0.6675, 0.335); // main housing top 2.15 (ref 2.157 @ 0.32-0.43w)
  P.add('turretDetail', box(0.30, 0.11, 0.08), 0.30, 0.64, 0.45);     // front step 2.095 (ref 2.103 @ 0.542w)
  P.add('turret', box(0.30, 0.10, 0.31), 0.30, 0.565, 0.645);  // T3R-b3: step runs to z local 0.80 (ref side 2.021 holds through world 0.87)
  P.add('turretDark', box(0.30, 0.026, 0.03), 0.30, 0.682, 0.475);     // hood lip (flush under the top)
  P.add('turretGlass', box(0.24, 0.07, 0.012), 0.30, 0.635, 0.497);    // aperture
  // Pano commander sight: mast on the rear shelf, boxy head + EW/meteo
  // cluster — the forward half of the ref 2.239 band (z world -0.41..-0.75).
  // T3R-b2: the ref FRONT has a CENTER DIP — 1.988 at |x|<=0.19 with
  // shoulder masses 2.13-2.23 only at x <= -0.31 and 2.21 at x >= +0.15
  // (gate worst list: my first cluster read 2.233 across the center cols,
  // err 0.19-0.22 x4 = the p95 driver). Pano head parked LEFT of -0.34;
  // the RWS station moved RIGHT of +0.18; center keeps the low drum only.
  // T4S PANO HEAD (verdict order 3: "pano head +0.2-0.3 m"). MEASURED
  // RECONCILIATION: a literal +0.21 put 4-5 side columns at 2.44 — heightM
  // p95 flipped to 2.44 (dims 100 -> 33.6 on the first cut) and the slice
  // topPct family followed (stations -15): dims are sovereign, the
  // normalized print itself carries its towers at 2.24-2.26. What the
  // pair actually shows is the ref pano reading TALLER because its head
  // is a distinct mushroom on a THIN neck while mine sat flush on the EW
  // cluster mass. Delivered: thin neck + distinct wide-lipped head with
  // its top at 2.29w (+0.055) — INSIDE the p95 spike budget (head family
  // spans 3 side windows; p95 stays on the 2.235-2.24 certified band).
  // The remaining +0.15 of the literal order is dims-blocked (reported).
  P.add('turretDetail', cylY(0.045, 0.045, 0.30, 12), -0.455, 0.675, -0.665);  // thin neck
  P.add('turretDetail', box(0.23, 0.13, 0.22), -0.455, 0.78, -0.665);          // head (top 2.245w)
  // 2026-10-19 (owner float sweep): the slot and glass stood 31 mm ahead of the head's front face (-0.555); seated on it.
  P.add('turretDark', box(0.17, 0.08, 0.012), -0.455, 0.778, -0.559);          // window slot (head front face)
  P.add('turretGlass', box(0.13, 0.06, 0.008), -0.455, 0.778, -0.553);
  P.add('turretDark', box(0.25, 0.015, 0.24), -0.455, 0.8375, -0.665);         // mushroom cap lip (T5H: top 2.245w — the tail-extreme trim re-phased the side grid and the old 2.2525 grace-line seat sampled 2.2532 > the 2.2523 grace, dims 99.7 measured; 2.245 keeps the mushroom read with margin)
  P.add('turretDetail', box(0.13, 0.13, 0.26), -0.635, 0.745, -0.665);  // meteo/EW cluster (old tower zone)
  P.add('turretDark', box(0.09, 0.022, 0.20), -0.635, 0.80, -0.665);
  // Central backup-sight pedestal at the recovered x +0.24 / z -1.19 world
  // station.  Its foot penetrates the bustle roof, its narrow head reaches
  // the same 2.245 m equipment cap as the adjacent pano, and a recessed
  // aperture gives the station a readable purpose instead of a blank box.
  P.add('turretDetail', box(0.18, 0.285, 0.18), 0.24, 0.6625, -1.28);
  P.add('turretDark', box(0.14, 0.08, 0.012), 0.24, 0.745, -1.184);
  P.add('turretGlass', box(0.10, 0.055, 0.008), 0.24, 0.745, -1.181);
  // T05BV-1 RWS: the former sideways open yoke is replaced by the same
  // connected armored-station grammar as RU-417 and Proryv, compressed to
  // the T-90SM roof court. The NSVT, optic, light and ammunition box now
  // face local +Z together instead of reading as unrelated roof clutter.
  addT90AutomatedCommanderStation(P, {
    x: 0.40,
    z: -0.95,
    seatY: 0.50,
    yaw: 0,
    scale: 0.68,
    heightScale: 0.78,
    weaponScale: 0.72,
    weaponYaw: 0,
    weaponClass: 'nsvt',
    weaponName: 't90smRemoteNsvt',
    receiptKey: 't90smAutomatedStationReceipt',
  });
  P.turretG.userData.t90smRoofWeaponReceipt = Object.freeze({
    weapon: 'nsvt',
    remoteControlled: true,
    armoredTower: true,
    forwardAligned: true,
    separateManualWeaponStations: 0,
  });
}

function addT90SMLegacyBustleStructure(
  P: T90BuilderPort,
  _context: T90SMLegacyTurretContext,
): void {
  const { box } = KIT;
  // squared removable bustle: full depth only to |x| 0.91 (ref plan rear
  // staircase -2.43 center / -1.99 @1.0 / -1.31 @1.15 / -1.0 @1.23).
  // r9: the ref bustle UNDERSIDE rises rearward (1.654@-2.16 ->
  // 1.762@-2.49) — three z-steps instead of one 1.375-flat box.
  P.add('turret', orientedSlab(
    [-0.91, 0.125, -1.26], [0.91, 0.125, -1.26], [0.91, 0.235, -1.95], [-0.91, 0.235, -1.95],
    [-0.91, 0.525, -1.26], [0.91, 0.525, -1.26], [0.91, 0.525, -1.95], [-0.91, 0.525, -1.95],
  ));
  // The second bustle cassette continues the recovered rising underside:
  // 0.235 at the first joint to 0.31 through the -2.03 m station, while its
  // 0.525 roof and plan footprint remain continuous with both neighbours.
  P.add('turret', orientedSlab(
    [-0.91, 0.235, -1.95], [0.91, 0.235, -1.95], [0.91, 0.31, -2.31], [-0.91, 0.31, -2.31],
    [-0.91, 0.525, -1.95], [0.91, 0.525, -1.95], [0.91, 0.525, -2.31], [-0.91, 0.525, -2.31],
  ));
  // T3R: step3 + slat pulled forward — the r10b slat at -2.555 painted the
  // z -2.517 side col ONLY-PROC (err 9, the row's p95 driver; ref plan rear
  // is -2.418). Slat rear now world -2.445, 17mm clear of the -2.462
  // window boundary; plan rear reads -2.445 vs ref -2.418 (err 0.027).
  P.add('turret', box(1.82, 0.205, 0.20), 0, 0.4225, -2.36);
  // T4S SLAT GRID (verdict order 1: "bustle rear + side panels currently
  // render as dark insets; the print's slat mesh is a signature"). The old
  // one-piece dark plate becomes a real slat panel: frame + horizontal
  // bars + stiles over a RECESSED dark backdrop (slats read against
  // shadow, §B2 stays closed — no see-through). Envelope byte-preserved:
  // outer plane z -2.535 (the certified -2.445w plan rear), y 0.29..0.45
  // (the ref -2.407 col band), x <=0.67.
  P.add('turretDark', box(1.32, 0.155, 0.012), 0, 0.37, -2.462);          // shadow backdrop
  P.add('turretDetail', box(1.34, 0.10, 0.05), 0, 0.48, -2.51);          // raised top rail (top 0.53)
  P.add('turretDetail', box(1.34, 0.028, 0.05), 0, 0.304, -2.51);        // bottom rail (bottom 0.29)
  for (const by of [0.337, 0.37, 0.403]) {
    P.add('turretDetail', box(1.30, 0.022, 0.044), 0, by, -2.508);       // slat bars
  }
  for (const bx of [-0.66, -0.33, 0, 0.33, 0.66]) {
    P.add('turretDetail', box(0.024, 0.16, 0.05), bx, 0.37, -2.51);      // stiles
  }
  for (const bx of [-0.52, 0.52]) {
    P.add('turretDark', box(0.03, 0.03, 0.05), bx, 0.37, -2.472);        // standoff struts onto step3 (§B2 attached)
  }
}

function addT90SMLegacyBustleCageAndSystems(
  P: T90BuilderPort,
  { tw, h }: T90SMLegacyTurretContext,
): void {
  const { box, cylZ } = KIT;
  const cageRailYs = [0.17, 0.27, 0.37, 0.47];
  const addSMBustleSideCell = (
    s: number,
    x: number,
    z: number,
    d: number,
    { backing = true }: { backing?: boolean } = {},
  ): void => {
    const y = 0.31, h = 0.36;
    // The aft cell retains its recessed closure. Owner-selected forward
    // backplates can be omitted independently while their carrier feet and
    // the continuous basket sweep remain physically tied to the bustle.
    if (backing) P.add('turretDark', box(0.025, h * 0.82, d * 0.90), s * x, y, z);
    P.add('turret', box(0.12, 0.12, 0.16), s * (x - 0.02), y - h * 0.34, z + d * 0.28);
  };
  for (const s of [-1, 1]) {
    addSMBustleSideCell(s, 0.985, s < 0 ? -1.63 : -1.57, s < 0 ? 0.90 : 0.78);
    // The two forward cells retain the measured staircase but become one
    // continuous slat language rather than solid vertical coffin blocks.
    addSMBustleSideCell(s, 1.12, -1.17, 0.38, { backing: false });
    addSMBustleSideCell(s, 1.24, -0.90, 0.32, { backing: false });
  }
  // T3R-b6 flank rear step: the welded staircase's first step (ref rear
  // -0.642w at x 1.33..1.43) bridging the poly rear onto the corner box.
  for (const s of [-1, 1]) {
    addSMBustleSideCell(s, 1.3725, -0.56, 0.33, { backing: false });
  }
  // deep inner step is a LEFT-col read (ref -1.585 @ -1.125 vs -1.314 @
  // +1.152 — the step edge sits at |x|~1.10 and the grids sample it
  // asymmetrically): keep the deep box clear of the +1.152 col.
  P.add('turret', box(0.08, 0.36, 0.60), -1.095, 0.29, -1.375);
  P.add('turret', box(0.03, 0.36, 0.60), 1.06, 0.29, -1.375);
  // (T4S: the old full-width dark plate at z -2.42 was fully buried inside
  // step3's envelope — deleted with the slat-grid rework.)
  // §5.331 CAGE FLOW (owner markup turretDetail 1840/1841 — the rear-left
  // rail junction; order: "attach to each other in a more flowing way
  // instead of zig zagging"). The old grammar was four per-cell rail runs
  // plus diagonal joins that DOUBLED BACK rearward across the staircase
  // overlaps (join dz -0.18 and -0.08 while stepping outboard) and
  // overshot their landings by 27-50 mm — the zig-zag. Re-authored as ONE
  // continuous monotone polyline per side per rail height (the leclerc_s2/
  // kf51-class flowing basket line): z strictly forward, x strictly
  // outboard, every segment sharing exact vertices with the next, 29-33°
  // chamfer diagonals riding the cell faces (each lands ON the next cell's
  // face inside its z-band), one 40° corner chamfer into the rear grille.
  // Verticals: a post at every bend + long-run midpoints (~0.3-0.4 m
  // rhythm, replacing the old irregular 0.13-0.36 per-cell stiles) and a
  // corner stile pair tying the sweep into the grille frame so the
  // sections read attached, not butted. Cell backings/feet unchanged.
  for (const s of [-1, 1]) {
    const aftZ = s < 0 ? -2.08 : -1.96;   // print asym: the left cage runs deeper aft
    const V = [
      [0.67, -2.51], [1.037, aftZ], [1.037, -1.30], [1.172, -1.06],
      [1.172, -0.99], [1.292, -0.80], [1.292, -0.75], [1.4245, -0.545],
      [1.4245, -0.40],
    ];
    for (const y of cageRailYs) {
      for (let i = 0; i < V.length - 1; i++) {
        const x0 = s * V[i][0], x1 = s * V[i + 1][0];
        const dx = x1 - x0, dz = V[i + 1][1] - V[i][1];
        P.add('turretDetail', box(0.030, 0.026, Math.hypot(dx, dz) + 0.026),
          (x0 + x1) * 0.5, y, (V[i][1] + V[i + 1][1]) * 0.5, 0, Math.atan2(dx, dz), 0);
      }
    }
    for (const [px, pz] of [
      [1.037, aftZ], [1.037, (aftZ - 1.30) / 2], [1.037, -1.30], [1.172, -1.025],
      [1.292, -0.775], [1.4245, -0.545], [1.4245, -0.42],
    ]) {
      P.add('turretDetail', box(0.028, 0.317, 0.028), s * px, 0.31, pz);
    }
    P.add('turretDetail', box(0.028, 0.33, 0.036), s * 0.67, 0.325, -2.49);
  }
  for (const s of [-1, 1]) P.add('turretDetail', box(0.72, 0.10, 0.88), s * 0.55, 0.50, -1.85);
  // T3R bustle basket rail ring (owner: "rear turret stowage basket ring"):
  // low rail atop the bustle edge — tops 1.955-1.965 world, exactly the ref
  // 1.939-1.966 rear band my bare 1.925 bustle top under-read by 0.03.
  {
    const railY = 0.55;
    P.add('turretDetail', box(1.70, 0.024, 0.024), 0, railY, -2.30);
    P.add('turretDetail', box(1.70, 0.024, 0.024), 0, railY, -1.72);
    for (const s of [-1, 1]) {
      P.add('turretDetail', box(0.024, 0.024, 0.60), s * 0.84, railY, -2.01);
      for (const z of [-2.28, -2.01, -1.74]) {
        P.add('turretDetail', box(0.02, 0.06, 0.02), s * 0.80, railY - 0.038, z);   // posts onto the bustle lid
      }
    }
  }
  // OPVT snorkel section half-sunk on the bustle left (§B3 stowage tell)
  P.add('turretDark', cylZ(0.05, 0.72, 10), -0.62, 0.50, -2.05);
  P.add('turretDetail', box(0.12, 0.02, 0.03), -0.62, 0.545, -1.85);   // strap
  P.add('turretDetail', box(0.12, 0.02, 0.03), -0.62, 0.545, -2.25);
  const pW = { rings: [[tw, 0], [tw * 0.96, h * 0.6], [tw * 0.9, h]], sz: 0.95 };
  eraRuCheeks(P, { ...pW, rRows: 1, rY: 0.12, rH: 0.34 }, 'relikt');  // T6SM: preserve the 0.42 roof while lifting the recovered front-course underside from 0.00 to 0.08; single course avoids the former roof overshoot
  // T3R rear tower zone: body stays LOW (ref side_turret -1.861 col reads
  // 1.966), but the ref DOES carry a one-col 2.239 spike at z world -1.97
  // (side_whole err 0.174 appeared the moment the old panel dropped — r9's
  // "rear 2.24 z-spike at x -0.43..-0.52" decode re-proven). The spike
  // panel is z-THIN (world -1.995..-1.935, 19mm clear of the -1.916
  // turret-col boundary) so the -1.861 col stays on the 1.95 tower line.
  P.add('turret', box(0.30, 0.20, 0.30), -0.50, 0.44, -1.98);
  P.add('turret', box(0.26, 0.38, 0.05), -0.50, 0.65, -2.03);  // T5H-b: world -1.965..-1.915 — the re-phased -2.042w window caught 8mm of the old -1.995 face (err 0.2, the top side_whole item)
  P.add('turretGlass', box(0.18, 0.22, 0.016), -0.50, 0.62, -2.030);  // §B3: rear sight panel lens
  P.add('turretDark', box(0.26, 0.03, 0.02), -0.50, 0.825, -2.05);    // §B3: panel hood lip (inside panel top)
  P.add('turretDark', cylZ(0.024, 0.62, 8), 0.32, 0.72, -0.90, -0.04, 0, 0);
  P.add('turret', box(0.30, 0.36, 0.30), -0.85, 0.52, -0.27);
  // §B3 (prism sweep 2026-08-06): the bare roof box reads as a stowage
  // bin — lid seam + two latches, flush on its own faces.
  P.add('turretDark', box(0.26, 0.012, 0.26), -0.85, 0.694, -0.27);
  P.add('turretDark', box(0.022, 0.05, 0.014), -0.79, 0.60, -0.123);
  P.add('turretDark', box(0.022, 0.05, 0.014), -0.91, 0.60, -0.123);
}

function addT90SMLegacyGunAndFinish(
  P: T90BuilderPort,
  { tw, turretRingReceipt }: T90SMLegacyTurretContext,
): void {
  const { box, cylZ } = KIT;
  // ---- 2A46M-5 + MRS bulge (axis 1.70, muzzle +6.20) ----
  // T3R MANTLET RE-SEAT (§B3.1 mantlets law + the nose re-loft): the plug
  // now fronts AT the new turret face (world 1.96-1.98 = the ref's plan
  // 1.952-1.979 center columns) instead of buried 0.5 behind it; the boot
  // is the canvas-wrapped trunnion collar tapering from the plug onto the
  // tube with crease rings + end clamp (the SM's slit-mantlet grammar).
  // Plug top 1.83 world = the nose top line (h 0.22 — the old 0.42-tall
  // plug would have printed +0.2 over the ref face rake).
  P.gunG.position.set(0, 0.288, 1.17);
  ruSaddle(P, { rollR: 0.21, rollW: 0.60, tubeR: 0.111, rootL: 0.70 });
  P.addGunExtra(box(0.64, 0.22, 0.26), 0, 0.02, 0.66);
  P.addGunExtra(box(0.58, 0.18, 0.018), 0, 0.02, 0.80);                // canvas cover pad (face 1.98 world)
  P.addGunExtra(box(0.58, 0.024, 0.022), 0, 0.105, 0.805);             // straps riding the pad
  P.addGunExtra(box(0.024, 0.17, 0.022), 0.24, 0.02, 0.805);
  P.addGunExtra(box(0.024, 0.17, 0.022), -0.24, 0.02, 0.805);
  P.addGunExtraDark(cylZ(0.125, 0.24, 14, 0.108), 0, 0, 0.93);         // collar boot (plug -> tube; r slimmed — the 0.155 crest printed 1.83 where the ref boot band is 1.775)
  P.addGunExtraDark(cylZ(0.118, 0.028, 14), 0, 0, 0.885);              // crease rings
  P.addGunExtraDark(cylZ(0.112, 0.028, 14), 0, 0, 0.995);
  P.addGunExtraDark(cylZ(0.106, 0.032, 14), 0, 0, 1.065);              // end clamp onto the tube
  // §B3.2 (2026-08-06): PKT coax port right of the tube — stub + washer
  // flush against the canvas pad face.
  P.addGunExtraDark(cylZ(0.022, 0.05, 8), 0.24, 0.045, 0.795);
  P.addGunExtraDark(cylZ(0.032, 0.010, 10), 0.24, 0.045, 0.822);
  // r10: muzzle 4.94 -> 4.97 (the z 6.182 side col reads ref tube to 6.20+;
  // tip 6.23 world covers the col center with margin; overall 9.69 = +0.6%)
  // T3R-b5: outer tube slimmed to the ref's own taper (side 3.6-3.8 cols
  // read the ref band 1.611..1.748 = r 0.068 about a 1.68 line; the flat
  // 0.097 run printed 1.802 on three cols).
  const t90smMuzzleZ = 4.97;
  tubeGun(P, [
    [0.72, 1.92, T90M_2A46M5_VISUAL_DATUM.sleeveRadiusM],
    [1.92, 2.16, T90M_2A46M5_VISUAL_DATUM.forwardRadiusM],
    [2.16, t90smMuzzleZ, T90M_2A46M5_VISUAL_DATUM.forwardRadiusM, T90M_2A46M5_VISUAL_DATUM.forwardRadiusM, 0, -0.012],
  ], { rings: [[1.20, 0.112], [1.90, 0.112], [2.40, 0.106], [3.20, 0.106], [3.80, 0.106], [4.45, 0.106]], muzzle: t90smMuzzleZ });
  P.add('gun', KIT.xform(cylZ(T90M_2A46M5_VISUAL_DATUM.muzzleCollarRadiusYM, 0.15, 14),
    0, 0, 0, 0, 0, 0, [0.839, 1, 1]), 0, 0.021, t90smMuzzleZ - 0.155);
  muzzleBore(P, {
    z: t90smMuzzleZ,
    r: T90M_2A46M5_VISUAL_DATUM.forwardRadiusM,
    boreR: T90M_2A46M5_VISUAL_DATUM.boreRadiusM,
    y: -0.012,
  });
  P.add('gun', cylZ(T90M_2A46M5_VISUAL_DATUM.fumeExtractorRadiusM, 0.46, 16, 0.116), 0, 0, 2.64);
  P.add('gunDark', cylZ(0.130, 0.035, 16), 0, 0, 2.41);
  P.add('gunDark', cylZ(0.130, 0.035, 16), 0, 0, 2.87);
  P.gunG.userData.t90FamilyGunReceipt = Object.freeze({
    referenceFamily: T90M_2A46M5_VISUAL_DATUM.family,
    sleeveRadiusM: T90M_2A46M5_VISUAL_DATUM.sleeveRadiusM,
    forwardRadiusM: T90M_2A46M5_VISUAL_DATUM.forwardRadiusM,
    muzzleCollarRadiusXM: T90M_2A46M5_VISUAL_DATUM.muzzleCollarRadiusXM,
    muzzleCollarRadiusYM: T90M_2A46M5_VISUAL_DATUM.muzzleCollarRadiusYM,
    boreRadiusM: T90M_2A46M5_VISUAL_DATUM.boreRadiusM,
    muzzleZ: t90smMuzzleZ,
    assemblyRaiseM: 0,
  });
  // §5.331: numeral seats moved forward z -0.32 -> -0.05 (§5.266 clip law —
  // the auto-reseat pinned them 10 cm deeper on the pitched transition
  // wedge, and the cage's front post/rails eclipsed the rear digit from
  // rear-3/4 cameras; at -0.05 the glyphs ride the clean pitched cheek
  // plane, 0.35 m clear of the cage front end).
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [tw * 0.99, 0.30, -0.05], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.26, [-tw * 0.99, 0.30, -0.05], -Math.PI / 2);
  P.turretG.userData.t90smFitReceipt = Object.freeze({
    outerCheekProtrusionsRemoved: true,
    outerCheekEndCapsRemoved: 2,
    markedBustleBackingsRemoved: 6,
    preservedAftBustleBackings: 2,
    turretRing: turretRingReceipt,
  });
}

// ---- AM-type turret (lane t90-family-266) ----
// The T-90AM, T-90MS obr. 2011, T-90SM obr. 2013 and the T-90AM II carry one turret design (Uralvagonzavod / RAE
// photographs; docs/references/tanks/t90-family.md): the welded module with the Relikt wedge nose, swept cheek skins,
// the three-section ammunition bustle in its slat basket, the commander's panorama and the remote weapon station. It is
// the recovered T-90SM turret, seated on the family chassis ring; the marks differ only in their own deltas.
const T90_AM_TURRET_SEAT = Object.freeze({ y: T90_FAMILY_RING_Y + 0.01, z: 0.0 });

function addT90AMTypeTurret(P: T90BuilderPort): void {
  const { box } = KIT;
  const turretContext = addT90SMLegacyTurretShell(P);
  addT90SMLegacyRoof(P, turretContext);
  addT90SMLegacyBustleStructure(P, turretContext);
  addT90SMLegacyBustleCageAndSystems(P, turretContext);
  addT90SMLegacyGunAndFinish(P, turretContext);
  // Broad low diamond cheek skins: both plates bury their rear half in the welded core and follow its crown, so the
  // cheeks read as long swept shoulders.
  for (const s of [-1, 1]) {
    P.add('turret', orientedSlab(
      [s * 0.22, 0.08, 1.40], [s * 1.64, 0.08, 0.48], [s * 1.58, 0.08, -0.30], [s * 0.28, 0.08, 0.52],
      [s * 0.22, 0.40, 1.02], [s * 1.39, 0.40, 0.34], [s * 1.36, 0.37, -0.30], [s * 0.28, 0.49, 0.42],
    ));
    P.add('turretDark', box(0.026, 0.22, 0.36), s * 1.43, 0.27, 0.12, 0, 0, -s * 0.10);
  }
  P.turretG.position.set(0, T90_AM_TURRET_SEAT.y, T90_AM_TURRET_SEAT.z);
}


function addT90FenderShelves(P: T90BuilderPort): void {
  // 2026-10-19 (owner float sweep): the aft shelves stood 21 mm outboard of the narrowing hull side; every shelf is
  // 25 mm wider inboard (outer face unchanged at 1.78) and any still clear drops onto the stock under it.
  for (const side of [-1, 1]) {
    for (let index = 0; index < 11; index++) {
      P.snapGroup('t90-fender-shelf', () => P.add('hull', KIT.box(0.185, 0.05, 0.50),
        side * 1.6875, 1.475, -2.75 + index * 0.545), { reachM: 0.10, mode: 'down' });
    }
  }
}

// ---- T-90 family chassis (lane t90-family-266) ----
// One shared chassis for every mark on the T-90 family hull: obr. 1992, T-90AM, T-90AM II, T-90MS obr. 2011 and T-90SM
// obr. 2013 (Main's ruling 2026-10-30: the family has two hulls, the family hull and the T-90A hull, not six lofts).
// The pressure hull, deck, fenders, stern, running gear and mudguards are common; `protection` picks the 1992 tank's
// Kontakt-5 glacis rows and K-5 skirt apron, or the AM-type Relikt glacis, full-length Relikt skirts and rear-quarter
// slat cage. The finished chassis sits at the family datum (the hull 50 mm below its construction stations; the
// running gear keeps its ground datum), so every mark seats its turret ring at T90_FAMILY_RING_Y.

function addT90FamilyChassis(
  P: T90BuilderPort,
  protection: T90FamilyProtection,
  { reliktRearZ = -1.25, gearLengthFactor = 1 }: { reliktRearZ?: number; gearLengthFactor?: number } = {},
): void {
  const { box, cylX, cylY, cylZ, buildRunningGear, stowage } = KIT;
  addT90FamilyHull(P);
  // CENTER GLACIS SLAB — the print's true falling plate (1.46 @ 1.75 ->
  // the 0.84 bow edge; the hull-era rows lie ON it), full closed slab at
  // x ±1.06 (inside the track lanes); every glacis fitting keeps its seat.
  P.add('hull', orientedSlab(
    [-1.06, 1.34, 1.75], [1.06, 1.34, 1.75], [0.88, 0.72, 3.40], [-0.88, 0.72, 3.40],
    [-1.06, 1.46, 1.75], [1.06, 1.46, 1.75], [0.88, 0.84, 3.43], [-0.88, 0.84, 3.43]));
  // rear transom rack row: the print carries a full-width 1.58..1.68 bin
  // band across the tail (rows -3.24..-3.58) — real fabrication on the
  // transom (§B2), with the rearmost reach authored as thin slivers so the
  // hullLengthM body span holds at the -3.43 anchor (12%-filter class).
  // CRITIC FIX (defect 8 "tan smear"): bins read as BIN ROW — scheme
  // bodies, thin dark lid SEAMS (not tan lid sheets), latch dots.
  // Release 240 (the owner: "make sure all tank turrets are clear of hulls"): the row stands 10 cm lower than the print's
  // band (lids at 1.55), under the bustle's tail, which sat 5 cm into its lids at rest and swept through them turned.
  for (const s of [-1, 1]) {
    P.add('hull', box(0.98, 0.20, 0.30), s * 0.60, 1.45, -3.26);
    P.add('hullDark', box(0.90, 0.014, 0.03), s * 0.60, 1.552, -3.14);   // lid seam (front edge)
    P.add('hullDark', box(0.03, 0.014, 0.24), s * 0.155, 1.552, -3.26);  // lid split seam
    P.add('hullDark', box(0.03, 0.05, 0.014), s * 0.38, 1.50, -3.105);   // latches
    P.add('hullDark', box(0.03, 0.05, 0.014), s * 0.84, 1.50, -3.105);
    P.add('hull', box(0.30, 0.26, 0.26), s * 1.42, 1.44, -3.24);
    P.add('hull', box(0.16, 0.20, 0.18), s * 1.53, 1.21, -3.05);    // corner bracket (§B2 cell closure, standard-check ±1.56,-3.05)
    P.add('hull', box(0.07, 0.14, 0.16), s * 0.60, 1.235, -3.50);   // rack sliver bars (y 1.165..1.305)
    P.add('hullDark', box(0.05, 0.10, 0.03), s * 0.60, 1.235, -3.49);  // cap face -3.505 (gate r1 overall trim)
  }
  // split unditching log ON the transom shelf — CRITIC FIX (defect 8):
  // real log read = wood cylinders + pale END-GRAIN discs + dark straps
  for (const s of [-1, 1]) {
    P.add('hullWood', cylX(0.088, 1.18, 10), s * 0.64, 1.30, -3.44);
    P.add('hullDetail', cylX(0.082, 0.012, 10), s * 1.235, 1.30, -3.44);  // end grain
    P.add('hullDetail', cylX(0.082, 0.012, 10), s * 0.045, 1.30, -3.44);
  }
  for (const s of [-0.5, 0.5]) P.add('hullDark', cylX(0.094, 0.04, 10), s * 0.98, 1.30, -3.44);
  for (const s of [-1, 1]) P.add('hullDark', cylX(0.094, 0.035, 10), s * 0.30, 1.30, -3.44);
  // fender shelves at the print's 1.49 line (segmented, prism law)
  addT90FenderShelves(P);
  // forward fender segments carry the print's falling bow-side band
  // (1.37 @ 2.43 -> 1.23 @ 3.12 -> 0.99 @ 3.29) over the dropped glacis
  for (const s of [-1, 1]) {
    P.add('hull', box(0.16, 0.05, 0.42), s * 1.70, 1.40, 2.90);
    P.add('hull', box(0.16, 0.05, 0.30), s * 1.71, 1.26, 3.22);
    P.add('hull', box(0.14, 0.05, 0.12), s * 1.71, 1.10, 3.40);  // tip face 3.46 (gate r1: 3.50 pushed hullLengthM)
  }
  // right-fender long stowage row (print detachparts01_hull: x 1.08..1.85,
  // y 1.24..1.54, z -2.44..-1.49 — PRINT ASYM, right side only).
  // CRITIC FIX (defect 4 "tan fender bins"): scheme body + thin seams/
  // latches instead of the big dark lid sheet.
  // (§B4 fix r3: bottom raised 1.26 -> 1.335 — the bin floor dipped 3.1cm
  // into the sprocket-wrap shoe crown, the audit's rear-87 receipt; rear
  // end pulled off the wrap zone)
  // LADDER-R1 (plan_hull receipt x +1.88 err 1.35): the print's bin row runs
  // out to x 1.83 — outer face widened to the 1.835 court line (§B4 clear:
  // bins ride y 1.335+ over the bare-wheel run behind the skirt band).
  P.add('hull', box(0.715, 0.21, 0.84), 1.4775, 1.44, -1.93);
  P.add('hullDark', box(0.65, 0.012, 0.03), 1.4775, 1.542, -1.60);
  P.add('hullDark', box(0.65, 0.012, 0.03), 1.4775, 1.542, -2.28);
  P.add('hullDark', box(0.012, 0.19, 0.80), 1.827, 1.44, -1.93);
  P.add('hullDark', box(0.03, 0.05, 0.014), 1.4775, 1.46, -1.517);
  ruDeck(P, { deckY: 1.545, hatchY: 1.34, hatchZ: 2.16, gz: -1.72, grilles: 5, gw: 1.5, periY: 1.26 });  // hatch/periscopes ON the glacis slab line
  // eyeX 0.98 (§B4 fix-round: the default w*0.36=1.26 tori sat INSIDE the
  // track lane over the idler wrap — the t90sm_2013/pt91m lesson)
  // 2026-10-19 (owner float sweep): hookX 0.99 hung the hooks 116 mm outboard of the narrow nose; 0.82 (the T-90MS
  // seat) plants them in it.
  ruGlacisKit(P, { w: 3.5, y: 1.15, z: 2.72, eyeX: 0.82, eyeZ: 2.98, eyeSplit: true, hookX: 0.82, hookY: 0.66, hookZ: 3.05, hlY: 1.13, lights: false });
  {
    // bow light pods on rehooked shadow-olive clones — re-seated to the
    // FENDER SHOULDERS (critic defect 3 companion: the mid-glacis seats
    // read as blue lens cells floating between the ERA rows; the print
    // carries its clusters on the fender line)
    const lcMats = { ...P.mats, dark: rehookClone(P.mats.dark, 0x3a3e30, 0x10140c), detail: rehookClone(P.mats.detail, null, 0x0e120b) };
    P.disposables.push(lcMats.dark, lcMats.detail); // each holds its own cascade registration (2026-10-17)
    for (const sL of [-1, 1]) {
      const lc = FITTINGS.lightCluster({ nightKind: 'headlight', mats: lcMats, pods: 2, spacing: 0.15, rake: -0.30, seed: 3 });
      lc.position.set(sL * 1.66, 1.50, 2.62);   // base ON the fender shelf top (1.50)
      P.hullG.add(lc);
      const tl = FITTINGS.lightCluster({ mats: lcMats, pods: 1, r: 0.038, lens: 'dark', rake: 0.0, seed: 4 });
      tl.position.set(sL * 1.10, 1.47, -3.38);
      tl.rotation.y = Math.PI;
      P.hullG.add(tl);
    }
  }
  if (protection === 'kontakt5') {
  // glacis K-5 cassette rows — CRITIC FIX (defect 3 "floating slat shelves
  // + blue cells"): PER-ROW rake matching each glacis segment's own angle
  // (upper 21.8deg / lower 30.6deg — one -0.43 tilted both rows off-plate,
  // leaving air wedges), bricks sunk 0.015 into the plate, and the
  // full-height dark gap BLOCKS replaced by flush face seams (k5Seg
  // zero-growth class — the blocks read as blue plastic cells).
  P.visualEraCluster('t90-k5-glacis-era', 'hull', () => {
  for (const [ry5, rz5, rk5] of [[1.20, 2.575, -0.35], [1.39, 2.06, -0.35]]) {   // ON the glacis-slab plane (20.3 deg)   // centers = plate line + half brick (ON my authored deck polyline)
    for (const s of [-1, 1]) {
      for (const bx of [0.225, 0.565, 0.90]) {
        P.add('hull', box(0.30, 0.09, 0.30), s * bx, ry5, rz5, rk5, s * 0.13, 0);
        P.add('hullDark', KIT.xform(box(0.26, 0.008, 0.26), 0, 0.049, 0), s * bx, ry5, rz5, rk5, s * 0.13, 0);  // face rim seam
      }
      for (const gx of [0.395, 0.7325]) {
        P.add('hullDark', KIT.xform(box(0.026, 0.008, 0.26), 0, 0.048, 0), s * gx, ry5, rz5, rk5, s * 0.13, 0);  // flush gap seam
      }
    }
  }
  });
  } else {
    // Relikt glacis: two courses of flat cassettes over the upper glacis, the AM-type marks' bolted array.
    P.visualEraCluster('t90-relikt-glacis-era', 'hull', () => {
      for (const [ry4, rz4, rk4] of [[1.20, 2.575, -0.35], [1.39, 2.06, -0.35]]) {
        for (const s of [-1, 1]) {
          for (const bx of [0.225, 0.60, 0.975]) {
            P.add('hull', box(0.33, 0.09, 0.30), s * bx, ry4, rz4, rk4, s * 0.14, 0);
            P.add('hullDark', KIT.xform(box(0.29, 0.008, 0.26), 0, 0.049, 0), s * bx, ry4, rz4, rk4, s * 0.14, 0);
          }
          for (const gx of [0.4125, 0.7875]) {
            P.add('hullDark', KIT.xform(box(0.026, 0.008, 0.26), 0, 0.048, 0), s * gx, ry4, rz4, rk4, s * 0.14, 0);
          }
        }
      }
    });
  }
  KIT.towCable(P, [[-1.25, 1.46, 2.30], [0, 1.38, 1.90], [1.25, 1.46, 2.30]]);
  stowage(P, 'hull', P.rng, [[-0.85, 1.42, -2.86, 1.19, 0.09, 0.30]]);
  {
    // Spare track links flat on the right engine-deck shoulder (flush-recess law), aft of every family turret's sweep:
    // the forward-deck seat under the turret overhang fell inside the cast cheeks and the AM-type nose on the family
    // ring (lane t90-family-266).
    const links = FITTINGS.spareTrackLinks({ mats: P.mats, links: 4, width: 0.5, seed: 7 });
    links.position.set(-1.42, 0, -1.95);
    seatFittingOnHorizontalPlate(links, 1.545);
    P.hullG.add(links);
  }
  const t90Gear = {
    // the print's tread/suspension nodes are BYTE-SHARED with the burlak
    // print (same T-90 gear family) — params inherit the t90a-certified
    // §B4-clean set on this same hull grammar.
    // RU-417 now uses the accepted Burlak 770 mm road-wheel diameter. Keep
    // its own 780 mm axle cadence, but raise the centers so the larger tires
    // retain the same loaded 95 mm foot on the lower track course instead of
    // being buried through it.
    // owner 2026-09-23 (round 46 wheel follow-up, census 2R/pitch 0.99): the 770 mm wheels on the 0.78
    // cadence left a 1 cm gap — one touching row. The T-90 runs six 750 mm wheels on a ~0.80 m pitch:
    // r 0.375 (the Burlak/T-90A radius, which this receipt must match) and the stations respread to 0.80
    // about the same centre (2R/pitch 0.94, a 5 cm gap); sprocket, idler and both contact pins stay.
    style: 'rubber', wheelR: 0.375, wheelW: 0.22, wheelY: 0.480, xc: 1.395, dishR: 0.84,
    wheelZs: [-1.95, -1.15, -0.35, 0.45, 1.25, 2.05],
    // Seat the final drive under the rear transom instead of crowding the
    // last road wheel. Its 299 mm radius is exactly thirty percent larger
    // than the former 230 mm wheel, while the axle drops 80 mm so the enlarged
    // assembly reads as a loaded drive wheel rather than a high return
    // roller. The higher-resolution rear arc continues past the crown to its
    // first return-roller tangent, eliminating the old pointed course seam.
    // Lift the front idler 30 mm so its axle and the rising bow run share a
    // cleaner tangent while retaining the authored diameter and fore/aft seat.
    sprocket: { z: -2.52, y: 0.90, r: 0.299 }, idler: { z: 2.70, y: 0.71, r: 0.27 },
    // FSP-03 2026-09-25 (owner: rollers wherever the real vehicle has them): the T-72/T-90 family carries three return
    // rollers per side (FAS T-72 entry; the T-90A X source `support wheels` node); the 2026-09-23 rollerless reading is
    // reversed. Stations follow the source law (4.6 / 51.5 / 91.6 % of the first-to-last-wheel span), r 0.10 m, the axle
    // fitted between the wheel tops and the measured lane ceiling (scratch lane-ceiling-ray probe).
    rollers: [-1.76, 0.11, 1.71].map((z) => ({ z, y: 0.95, r: 0.10 })),
    trackW: 0.61, topY: 0.86, botY: 0.05, paintedEnds: true, coveredTop: true, arms: true,
    rearArcSteps: 18, smoothRearTopTangent: true, tautRearSpan: true,
    contactZF: 2.26, contactZR: -2.16,
  };
  // A mark whose chassis the builder later stretches (P.extendHullLength scales the hull buckets, never the running
  // gear) authors its stations on the stretched wheelbase here, so hull and course stay one length.
  if (gearLengthFactor !== 1) {
    t90Gear.wheelZs = t90Gear.wheelZs.map((z) => z * gearLengthFactor);
    t90Gear.sprocket = { ...t90Gear.sprocket, z: t90Gear.sprocket.z * gearLengthFactor };
    t90Gear.idler = { ...t90Gear.idler, z: t90Gear.idler.z * gearLengthFactor };
    t90Gear.rollers = t90Gear.rollers.map((roller) => ({ ...roller, z: roller.z * gearLengthFactor }));
    t90Gear.contactZF *= gearLengthFactor;
    t90Gear.contactZR *= gearLengthFactor;
  }
  const frontRoad = Math.max(...t90Gear.wheelZs);
  const rearRoad = Math.min(...t90Gear.wheelZs);
  if (!(t90Gear.idler.z > frontRoad && t90Gear.sprocket.z < rearRoad)) {
    throw new Error('T-90 running-gear law: front idler -> road wheels -> rear final-drive sprocket');
  }
  buildRunningGear(P, t90Gear);
  P.hullG.userData.runningGearOrder = {
    front: 'idler', frontWheelPairs: 1, roadWheelPairs: t90Gear.wheelZs.length,
    supportRollerPairs: t90Gear.rollers.length, suspension: 'torsion-arm', rear: 'final-drive-sprocket',
  };
  const t90SkirtCourse = Object.freeze({
    x: 1.7675, th: 0.036, z0: -2.20, z1: 2.35,
    yTop: 1.44, yBot: 0.80, panels: 7, lipX: 1.755,
  });
  const frontSkirtZ1 = 3.43;
  if (protection === 'kontakt5') {
  // Burlak-scale forward side protection: three long K-5 panels cover the
  // upper wheel run, while the structural curtain below carries deeper than
  // Burlak's prototype skirt.
  P.visualEraCluster('t90-k5-skirt-era', 'hull', () => {
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    // inner face 1.7825 overlaps the skirt-band outer face 1.7855 (§B2);
    // outer face 1.885 = the print's own ±1.83..1.91 course = the widthM
    // carrier (gate r1: the 1.845-face court read widthM 3.70, dims -2.15%
    // — the widthAnchor stud alone is too small to own the width columns)
    P.add('hull', box(0.105, 0.70, 0.94), s * 1.8325, 1.06, 2.55 - i * 1.02);
    P.add('hullDark', box(0.045, 0.58, 0.03), s * 1.858, 1.04, 3.02 - i * 1.02);
    P.add('hullDark', box(0.045, 0.04, 0.86), s * 1.858, 0.73, 2.55 - i * 1.02);
  }
  });
  widthAnchor(P, 1.89, 0.95, 0.46);
  // The 1992 tank's side protection (lane t90-family-266, from the Patriot Park and Army-2010 side photographs): one
  // full-length skirt hangs from the fender down to the road-wheel tops and ends over the last road wheel, ahead of the
  // final drive; the three K-5 panels stand proud of its front portion. No stand-off cage: the 1992 tank carried none.
  ruSkirtBand(P, t90SkirtCourse);
  for (const s of [-1, 1]) {
    const xi = s * 1.74, xo = s * 1.84;
    P.add('hull', orientedSlab(
      [xi, 0.80, t90SkirtCourse.z1], [xo, 0.80, t90SkirtCourse.z1],
      [xo, 0.82, frontSkirtZ1], [xi, 0.82, frontSkirtZ1],
      [xi, 1.44, t90SkirtCourse.z1], [xo, 1.44, t90SkirtCourse.z1],
      [xo, 1.08, frontSkirtZ1], [xi, 1.08, frontSkirtZ1],
    ));
    P.add('hullDetail', box(0.035, 0.035, frontSkirtZ1 - t90SkirtCourse.z1 - 0.08),
      s * 1.86, 1.24, (t90SkirtCourse.z1 + frontSkirtZ1) * 0.5, -0.28, 0, 0);
  }
  } else {
    // AM-type side protection (Uralvagonzavod / RAE photographs of the T-90AM, MS and SM): tall Relikt skirt modules
    // from the bow back over the fourth road wheel, each hung from the fender with a bevelled lower front edge, then the
    // slat cage over the final drive. The T-90M carries its modules over the front half and the slat over the rear half
    // (`reliktRearZ`).
    const reliktFrontZ = 2.95, modules = Math.max(3, Math.round((reliktFrontZ - reliktRearZ) / 0.70));
    const step = (reliktFrontZ - reliktRearZ) / modules;
    P.visualEraCluster('t90-relikt-skirt-era', 'hull', () => {
      for (const s of [-1, 1]) for (let i = 0; i < modules; i++) {
        const zc = reliktFrontZ - (i + 0.5) * step;
        P.add('hull', box(0.10, 0.62, step - 0.02), s * 1.835, 1.13, zc);
        P.add('hull', KIT.xform(box(0.10, 0.10, step - 0.02), 0, 0, 0), s * 1.835, 0.79, zc - 0.03, -0.35, 0, 0);
        P.add('hullDark', box(0.04, 0.56, 0.022), s * 1.87, 1.13, zc + step * 0.5 - 0.01);
        P.add('hullDark', box(0.04, 0.022, step - 0.10), s * 1.87, 1.34, zc);
      }
    });
    widthAnchor(P, 1.89, 0.95, 0.46);
    ruSkirtBand(P, { x: 1.7675, th: 0.036, z0: reliktRearZ - 0.05, z1: 2.35, yTop: 1.44, yBot: 0.74, panels: 6, lipX: 1.755 });
    for (const s of [-1, 1]) {
      const xi = s * 1.74, xo = s * 1.84;
      P.add('hull', orientedSlab(
        [xi, 0.74, 2.35], [xo, 0.74, 2.35], [xo, 0.86, frontSkirtZ1], [xi, 0.86, frontSkirtZ1],
        [xi, 1.44, 2.35], [xo, 1.44, 2.35], [xo, 1.08, frontSkirtZ1], [xi, 1.08, frontSkirtZ1],
      ));
    }
    addT90RearQuarterSlatCage(P, {
      variant: P.spec.id,
      originalSkirtRearZ: -3.10,
      originalSkirtFrontZ: frontSkirtZ1,
      solidSkirtRearZ: reliktRearZ,
      xInner: 1.74,
      xOuter: 1.98,
      yBottom: 0.76,
      yTop: 1.43,
      horizontalRails: 6,
      verticalStiles: 7,
      bracketStations: 4,
    });
  }
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'left' : 'right';
    // Keep the established lower edges, but carry each rubber sheet upward
    // into its fender. The rear sheet also reaches the first shelf segment
    // across the deliberate 35 mm longitudinal seam; both are registered
    // with the fleet's five-centimetre physical seating audit.
    MUDGUARDS.add(P, {
      label: `t90-rear-mudguard-${side}`, x: s * 1.52, y: 1.065, z: -3.06,
      thickness: 0.05, length: 0.36, height: 0.83, material: 'rubber',
      rotation: [0, Math.PI / 2, 0], crown: 0.018, rearCut: 0.075,
    });
    P.add('hullDark', box(0.34, 0.035, 0.054), s * 1.52, 1.455, -3.06); // rear fender clamp
    MUDGUARDS.add(P, { hang: true,
      label: `t90-front-mudguard-${side}`, x: s * 1.48, y: 0.825, z: 3.345,
      thickness: 0.05, length: 0.44, height: 0.55, material: 'rubber',
      rotation: [0, Math.PI / 2, 0], crown: 0.018, frontCut: 0.07,
    });
    P.add('hullDark', box(0.42, 0.03, 0.054), s * 1.48, 1.085, 3.345);  // front fender clamp
  }
  if (protection === 'kontakt5') P.hullG.userData.t90AttachmentReceipt = Object.freeze({
    skirt: Object.freeze({
      z0: t90SkirtCourse.z0,
      z1: frontSkirtZ1,
      straightZ1: t90SkirtCourse.z1,
      yTop: t90SkirtCourse.yTop,
      yBot: t90SkirtCourse.yBot,
      height: t90SkirtCourse.yTop - t90SkirtCourse.yBot,
      panels: t90SkirtCourse.panels,
      sides: 2,
      rearQuarterReplacedByCage: false,
      burlakStyleTaperedFront: true,
      frontClosureCoverageM: 1.44 - 0.80,
    }),
    guardLabels: Object.freeze([
      't90-rear-mudguard-left', 't90-rear-mudguard-right',
      't90-front-mudguard-left', 't90-front-mudguard-right',
    ]),
  });

  // B2 plan-contiguity closure beside the right bow cheek.
  P.add('hull', box(0.10, 0.08, 0.12), 1.08, 1.20, 3.25);
  // family shadow-tone lift (t90a_2004 T4A recipe — render-only, masks override)
  P.mats.dark.color.setHex(0x323629);
  P.mats.dark.emissive.setHex(0x0c100a);
  // CRITIC FIX (defect 4): neutral cool rubber — the warm-brown 0x453c30
  // drifted salmon/pink under the warm key (tires, flaps, hems ×3)
  P.mats.rubber.color.setHex(0x3b3a33);
  P.mats.rubber.emissive.setHex(0x0a0a08);
  P.mats.wood.color.setHex(0x473e32);
  if (P.mats.wood.emissive) P.mats.wood.emissive.setHex(0x0c0a07);
  // Stern: backed transom bays, the supported service overhang, the two external fuel drums, tow rope and rails.
  P.add('hullDark', box(1.72, 0.43, 0.026), 0, 1.12, -3.505);
  for (const [x, w, h, y, n] of [[-0.59, 0.48, 0.28, 1.15, 5], [-0.05, 0.36, 0.22, 1.08, 4], [0.52, 0.52, 0.30, 1.16, 6]]) {
    P.add('hullDark', box(w, h, 0.030), x, y, -3.512);
    for (let i = 0; i < n; i++) {
      P.add('hullDetail', box(0.026, h * 0.68, 0.020), x - w * 0.36 + i * (w * 0.72 / Math.max(1, n - 1)), y, -3.530);
    }
  }
  P.add('hullDetail', box(1.48, 0.040, 0.040), -0.04, 0.91, -3.535);
  // Supported stern overhang: two short longitudinal brackets and a backed
  // cross-member recover the source's compact -3.74 m service reach without
  // stretching the pressure hull or placing a loose bar in empty air.
  P.add('hullDark', box(1.44, 0.10, 0.30), 0, 1.04, -3.60);
  for (const s of [-1, 1]) {
    P.add('hullDetail', box(0.045, 0.055, 0.30), s * 0.72, 1.04, -3.62);
    P.add('hullDark', box(0.10, 0.10, 0.08), s * 0.72, 1.04, -3.49);
  }
  P.add('hullDetail', box(1.52, 0.045, 0.045), 0, 1.04, -3.75);
  // Two unequal external fuel drums sit in explicit lower cradles.  Their
  // rear circular ends, straps and inboard brackets restore the source's
  // mixed round/linear service grammar without becoming turret mass.
  for (const [x, r, len, y] of [[-1.26, 0.13, 0.34, 1.08], [1.18, 0.105, 0.29, 1.02]]) {
    P.add('hull', cylZ(r, len, 14), x, y, -3.33);
    P.add('hullDark', cylZ(r + 0.010, 0.035, 14), x, y, -3.18);
    P.add('hullDark', cylZ(r + 0.010, 0.035, 14), x, y, -3.43);
    P.add('hullDetail', box(r * 1.75, 0.045, 0.10), x, y - r * 0.82, -3.34);
    P.add('hullDetail', box(0.045, 0.24, 0.10), x, y - 0.08, -3.25);
  }
  // 2026-10-19 (owner float sweep): the small right drum and its cradle hung 65-80 mm under the stern cover box; a
  // strap from the cover box down over the drum carries it.
  P.add('hullDetail', box(0.045, 0.125, 0.03), 1.10, 1.1375, -3.46);
  KIT.towCable(P, [[-0.92, 1.02, -3.50], [-0.36, 0.88, -3.54], [0.32, 0.86, -3.54], [0.92, 1.00, -3.50]]);
  for (const [x, y] of [[-0.56, 0.72], [0.48, 0.69]]) {
    P.add('hullDark', KIT.torus(0.084, 0.020, 14), x, y, -3.54, Math.PI / 2, 0, 0);
    P.add('hullDark', box(0.044, 0.17, 0.044), x, y + 0.09, -3.52);
  }
  // Upper transom rails, offset service cover and lamps preserve the source's
  // uneven horizontal cadence; all faces overlap the backed rear field.
  // 2026-10-19 (owner float sweep): the top rail ran 110 mm behind the transom bins' rear face with nothing under it;
  // it now lies on that face (z -3.426).
  for (const [y, x, w] of [[1.46, -0.20, 1.44], [1.36, 0.16, 1.22], [1.27, -0.34, 0.86]]) {
    P.add('hullDetail', box(w, 0.035, 0.035), x, y, y > 1.4 ? -3.426 : -3.535);
  }
  P.add('hull', box(0.40, 0.26, 0.08), 0.92, 1.32, -3.49);
  P.add('hullDark', box(0.30, 0.16, 0.018), 0.92, 1.32, -3.535);
  for (const [x, y, r] of [[-0.98, 1.34, 0.055], [0.73, 1.05, 0.045], [1.22, 1.28, 0.050]]) {
    P.add('hullDark', cylZ(r, 0.050, 12), x, y, -3.53);
    P.add('hullDetail', cylZ(r * 0.72, 0.012, 12), x, y, -3.56);
  }
  // Thin shoulder bridges close the original bow-corner pockets while
  // remaining above the final shoe envelope and inside the fender outline.
  for (const s of [-1, 1]) {
    // The bridge's inboard root overlaps the center cheek with a buried
    // shoe.  Besides making the load path explicit in yaw, this closes the
    // last one-cell plan pocket at the shoulder transition.
    P.add('hull', box(0.24, 0.10, 0.20), s * 1.20, 1.21, 3.27);
    P.add('hull', orientedSlab(
      [s * 1.02, 1.14, 3.24], [s * 1.67, 1.13, 3.30], [s * 1.70, 1.16, 2.92], [s * 1.02, 1.15, 2.96],
      [s * 1.02, 1.24, 3.24], [s * 1.67, 1.23, 3.30], [s * 1.70, 1.26, 2.92], [s * 1.02, 1.25, 2.96],
    ));
  }
  // Family datum: the authored hull package sits 50 mm below its construction stations; the native running gear
  // (`userData.runningGear` children) keeps its ground datum, so no wheel, idler or track path moves.
  P.offsetBuckets([
    'hull', 'hullDark', 'hullDetail', 'hullGlass', 'hullRubber',
    'hullWood', 'hullTrack', 'hullShadow', 'hullTrackTrimL',
    'hullTrackTrimR', 'hullTrackDetailL', 'hullTrackDetailR',
  ], 0, -T90_FAMILY_HULL_DATUM_DROP_M, 0);
  for (const child of P.hullG.children) {
    if (!child.userData?.runningGear) child.position.y -= T90_FAMILY_HULL_DATUM_DROP_M;
  }
}

function buildT90(P: T90BuilderPort): void {
  addT90FamilyChassis(P, 'kontakt5');
  // T-90 obr. 1992 (lane t90-family-266, Main's identity call 2026-10-30): the production cast turret, not the Burlak
  // prototype's welded core and autoloader bustle.
  replaceT90CastTurret(P);
  finishT90BaseAuthored(P);
  P.topY = 0.80;
}

function finishT90BaseAuthored(P: T90BuilderPort): void {
  const { box, cylY } = KIT;

  // The cast turret steps own the frontal K-5 horseshoe, Shtora, smoke banks, cupolas, sights and rear bins; the cast
  // flanks carry no K-5 (the launchers stand there). This finish adds the hardware outside that package.

  // Two unequal radio stations, both short enough to preserve the source's
  // low skyline and both entering broad collars on the rear crown.
  for (const [x, z, h, seed] of [
    [-0.48, -0.18, 2.50, 51],
    [1.16, -0.80, 2.33, 52],
    [0.38, -1.07, 1.18, 53],
  ]) {
    const ant = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.013, rake: x < 0 ? -0.018 : 0.018, seed });
    ant.position.set(x, 0.47, z);
    P.turretG.add(ant);
    P.add('turret', cylY(0.065, 0.080, 0.075, 10), x, 0.44, z);
    P.add('turretDark', cylY(0.040, 0.055, 0.12, 8), x, 0.49, z);
  }

  addT90AutomatedCommanderStation(P, {
    x: -0.64,
    z: -0.58,
    seatY: 0.60,
    yaw: 0,
    scale: 0.98,
    heightScale: 1.10,
    weaponScale: 1.0,
    weaponYaw: 0,
    weaponName: 't90Ru417AutomatedKord',
    receiptKey: 't90Ru417AutomatedStationReceipt',
  });

  // Low unequal periscopes bridge the two existing hatch rings and keep the
  // roof busy without creating the old row of square towers.
  for (const [x, y, z, yaw] of [
    [-0.66, 0.79, -0.50, -0.20], [-0.46, 0.80, -0.54, 0.03],
    [-0.22, 0.78, -0.49, 0.18], [0.16, 0.79, -0.42, -0.14],
    [0.40, 0.78, -0.47, 0.13], [0.62, 0.73, -0.59, 0.22],
  ]) {
    // 2026-10-19 (owner float sweep): two of these stood 29-57 mm off the roof and rings; each head is seated.
    P.snapGroup('t90-roof-periscope', () => {
      P.add('turretDark', box(0.105, 0.052, 0.065), x, y, z, 0, yaw, 0);
      P.add('turretGlass', box(0.070, 0.029, 0.010), x, y + 0.010, z + 0.038, 0, yaw, 0);
    }, { reachM: 0.07 });
  }

  // The base bins and open rack are already built by the common cast helper.
  // Add only supported straps, one cable coil and broken low rail courses.
  for (const [x, y, z, w] of [
    [-0.53, 0.54, -1.43, 0.32], [0.00, 0.52, -1.46, 0.36],
    [0.49, 0.55, -1.38, 0.30],
  ]) {
    P.add('turretDetail', box(w, 0.024, 0.045), x, y, z);
    P.add('turretDark', box(0.028, 0.16, 0.040), x - w * 0.38, y - 0.06, z);
  }
  P.add('turretDark', KIT.torus(0.15, 0.017, 20), 0.45, 0.42, -1.43, Math.PI / 2, 0, 0);
  for (const [y, x, w] of [[0.27, -0.08, 1.18], [0.38, 0.10, 1.02], [0.49, -0.14, 0.82]]) {
    P.add('turretDetail', box(w, 0.026, 0.038), x, y, -1.715);
  }
  for (const [x, y, h] of [[-0.56, 0.37, 0.26], [-0.18, 0.39, 0.22], [0.24, 0.36, 0.25], [0.58, 0.39, 0.20]]) {
    P.add('turretDetail', box(0.030, h, 0.040), x, y, -1.70);
  }
}

// ---- T-90 obr. 1992 cast turret (lane t90-family-266) ----
// The production cast turret of the 1992 tank (Vitaly Kuzmin's Patriot Park photographs, docs/references/tanks/
// t90-family.md): a low cast dome with no bustle; the Kontakt-5 "horseshoe" of sloped containers across the front arc,
// the two OTShU-1-7 Shtora emitters at the mantlet, six 902B launchers a side, the 1G46 sight box, the commander's
// cupola and machine-gun station, and flat K-5 plates on the crown. These steps belong to t90_1992 alone.

interface T90CastTurretBuildContext {
  rings: number[][];
}

function addT90CastServiceRack(P: T90BuilderPort): void {
  const { box } = KIT;
  const rackZ = -1.36, rackW = 1.28;
  for (const sx of [-1, 1]) {
    P.add('turret', box(0.09, 0.18, 0.38), sx * rackW * 0.45, 0.34, rackZ + 0.12);
    P.add('turretDetail', box(0.030, 0.28, 0.030), sx * rackW * 0.48, 0.45, rackZ + 0.12);
    P.add('turretDetail', box(0.030, 0.030, 0.68), sx * rackW * 0.48, 0.58, rackZ - 0.02);
  }
  P.add('turretDetail', box(rackW, 0.030, 0.030), 0, 0.58, rackZ - 0.35);
  P.add('turretDetail', box(rackW, 0.030, 0.030), 0, 0.58, rackZ + 0.31);
}

function prepareT90CastTurret(P: T90BuilderPort): T90CastTurretBuildContext {
  const { polyTurret } = KIT;
  P.turretG.clear();
  P.turretG.add(P.gunG);
  P.clear(
    'turret', 'turretExternalArmor', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass', 'turretTrack',
    'gun', 'gunDark', 'gunMount', 'gunMountDark',
  );
  // Seat the cast ring on the family deck datum.
  P.turretG.position.set(0, T90_FAMILY_RING_Y, 0.0);
  const rings = [
    [1.46, -0.04], [1.61, 0.10], [1.58, 0.27], [1.43, 0.43],
    [1.18, 0.57], [0.84, 0.68], [0.44, 0.745], [0.05, 0.775],
  ];
  // The casting is authored from independent longitudinal sections, not revolved from a sphere: a broad lower pear
  // shoulder, clipped mantlet valley, flatter crown and quickly narrowing cast tail. Left/right widths are unequal so the
  // station package does not sit on a generic symmetric dome.
  P.add('turret', castSectionLoft([
    [1.38, [[-0.04, -0.54, 0.58], [0.10, -0.82, 0.86], [0.29, -0.70, 0.74], [0.48, -0.42, 0.46], [0.58, -0.22, 0.26]]],
    [1.10, [[-0.05, -0.98, 1.04], [0.12, -1.34, 1.40], [0.34, -1.22, 1.31], [0.54, -0.86, 0.94], [0.64, -0.46, 0.54]]],
    [0.70, [[-0.06, -1.25, 1.31], [0.13, -1.55, 1.60], [0.37, -1.42, 1.51], [0.58, -1.00, 1.10], [0.69, -0.61, 0.70]]],
    [0.20, [[-0.06, -1.39, 1.44], [0.13, -1.62, 1.64], [0.39, -1.46, 1.55], [0.61, -1.02, 1.12], [0.71, -0.68, 0.76]]],
    [-0.34, [[-0.06, -1.40, 1.44], [0.13, -1.58, 1.61], [0.39, -1.42, 1.51], [0.61, -1.00, 1.10], [0.71, -0.66, 0.74]]],
    [-0.79, [[-0.05, -1.31, 1.38], [0.12, -1.47, 1.53], [0.35, -1.29, 1.39], [0.57, -0.88, 0.98], [0.66, -0.56, 0.64]]],
    [-1.16, [[-0.03, -1.12, 1.23], [0.11, -1.29, 1.37], [0.30, -1.11, 1.23], [0.49, -0.72, 0.84], [0.57, -0.43, 0.52]]],
    [-1.46, [[-0.01, -0.78, 0.91], [0.09, -1.00, 1.10], [0.24, -0.86, 0.98], [0.40, -0.53, 0.66], [0.46, -0.31, 0.40]]],
  ], { faceted: true }));
  const castSeatPlan = [
    [-0.48, 1.30], [0.48, 1.30], [1.12, 0.98], [1.42, 0.48],
    [1.48, -0.30], [1.25, -1.03], [0.84, -1.46], [-0.76, -1.46],
    [-1.22, -1.04], [-1.46, -0.32], [-1.41, 0.48], [-1.10, 0.98],
  ];
  P.add('turret', polyTurret(castSeatPlan, 0.13, 1.0, 0.96), 0, -0.09, 0);
  P.add('turretDark', polyTurret(castSeatPlan, 0.020, 0.965, 0.955), 0, -0.108, 0);
  return { rings };
}

// Shtora-1 OTShU emitter seat (turret frame): beside the mantlet, at the gun axis, in front of the inner K-5 boxes.
const T90_CAST_SHTORA = Object.freeze({ x: 0.66, y: 0.27, z: 1.67, scale: 1.48 });

function addT90CastTurretProtection(P: T90BuilderPort, { rings }: T90CastTurretBuildContext): void {
  const { box } = KIT;
  // Flat Kontakt-5 plates on the crown, split so the hatch and sight foundations stay clear.
  P.visualEraCluster('t90-k5-turret-era', 'turret', () => {
    for (const [x, y, z, w, d, yaw, roll] of [
      [-0.28, 0.742, 0.19, 0.46, 0.52, -0.07, -0.06],
      [0.27, 0.746, 0.17, 0.44, 0.50, 0.08, 0.05],
      [-0.74, 0.704, 0.02, 0.43, 0.52, -0.14, -0.09],
      [0.73, 0.708, 0.00, 0.42, 0.50, 0.13, 0.08],
    ]) {
      P.add('turret', box(w, 0.052, d), x, y, z, -0.05, yaw, roll);
      P.add('turretDark', box(w * 0.78, 0.010, d * 0.72), x, y + 0.031, z, -0.05, yaw, roll);
    }
  });
  // The K-5 horseshoe: two sloped container courses per cheek whose fronts meet in a forward ridge at the gun-axis
  // band and sweep back round the cast front arc. Each carrier's back edge is buried in the casting (front face at
  // z 1.38 to x 0.84, then (1.27, 1.10), (1.47, 0.70) at the ridge height), its front stands 0.20-0.30 m proud.
  const chevronEra = addSovietChevronEra(P, {
    sector: 't90-k5-turret-era',
    receiptKey: 't90ChevronEraReceipt',
    family: 't90-cast-kontakt5-horseshoe-r2',
    plans: [
      [[0.24, 1.32], [0.34, 1.70], [0.94, 1.44], [0.82, 1.18]],
      [[0.82, 1.22], [0.94, 1.48], [1.62, 0.84], [1.44, 0.66]],
    ],
    rows: [
      { y0: 0.04, y1: 0.27, z0: -0.10, z1: 0.06 },
      { y0: 0.27, y1: 0.52, z0: 0.06, z1: -0.14 },
    ],
    tileRanges: [[0.06, 0.30], [0.34, 0.66], [0.70, 0.94]],
    tileDepthM: 0.080,
    gasketDepthM: 0.030,
    centerClosure: { width: 0.46, height: 0.24, depth: 0.060, y: 0.24, z: 1.50, rx: -0.24 },
  });
  // OTShU-1-7 emitters: square housings with round lenses and a finned radiator on the outboard face, on a buried
  // pedestal that runs back into the inner K-5 course.
  ruShtora(P, { rings, sz: 0.72, eyeKit: true, eyeRound: true, eyeScale: T90_CAST_SHTORA.scale, eyeX: T90_CAST_SHTORA.x, eyeZ: T90_CAST_SHTORA.z }, T90_CAST_SHTORA.y);
  if (P._shtoraRed) {
    P._shtoraRed.color.setHex(0x35120c);
    if (P._shtoraRed.emissive) P._shtoraRed.emissive.setHex(0x43120d);
  }
  const es = T90_CAST_SHTORA.scale;
  // The emitter housing's inner edge against the 2A46M boot (half width 0.28 m at the mantlet), and its lens face
  // against the K-5 tile faces (frontmost tile reported by the chevron helper).
  const mantletHalfWidthM = 0.28;
  const shtoraInnerEdgeX = T90_CAST_SHTORA.x - 0.12 * es;
  const shtoraLensFrontZ = T90_CAST_SHTORA.z + 0.130 * es;
  P.turretG.userData.t90TurretProtectionFitReceipt = Object.freeze({
    canonicalEraSector: 't90-k5-turret-era',
    chevronEra,
    shtoraEyeX: T90_CAST_SHTORA.x,
    shtoraEyeScale: es,
    shtoraInnerEdgeX,
    mantletHalfWidthM,
    mantletClearanceM: shtoraInnerEdgeX - mantletHalfWidthM,
    shtoraClearsMantlet: shtoraInnerEdgeX > mantletHalfWidthM,
    shtoraLensFrontZ,
    shtoraChevronDepthClearanceM: shtoraLensFrontZ - chevronEra.frontmostTileZM,
  });
  for (const s of [-1, 1]) {
    const x = s * T90_CAST_SHTORA.x, y = T90_CAST_SHTORA.y, z = T90_CAST_SHTORA.z;
    P.add('turret', box(0.30 * es, 0.24 * es, 0.34), x, y - 0.02, z - 0.26);
    const finX = x + s * (0.135 * es);
    P.add('turretDark', box(0.05, 0.25 * es, 0.20 * es), finX, y, z - 0.01);
    for (let k = 0; k < 6; k++) {
      P.add('turretDetail', box(0.035, 0.24 * es, 0.010), finX + s * 0.02, y, z - 0.10 * es + k * 0.04 * es);
    }
  }
}

function addT90CastTurretSmokeBanks(P: T90BuilderPort): void {
  const { box } = KIT;
  // Twelve 902B launchers (six a side) on the cast shoulders, fanned forward, each bank on a buried armour shoe.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.24, 0.24, 0.62), s * 1.40, 0.31, -0.10, 0, 0, -s * 0.20);
    const smoke = FITTINGS.smokeBank({
      mats: P.mats, count: 6, r: 0.046, len: 0.30, pitch: -0.43, splay: 0.34, arc: 0.60, spacing: 0.100,
    });
    smoke.position.set(s * 1.43, 0.44, -0.07);
    smoke.rotation.y = s * 1.08;
    P.turretG.add(smoke);
  }
}

function addT90CastTurretRoofAndBins(P: T90BuilderPort): void {
  const { box, cylY } = KIT;
  // Low cupolas and sight heads: each housing overlaps a ring or foundation plate.
  P.add('turret', cylY(0.27, 0.30, 0.17, 18), -0.53, 0.68, -0.31);
  P.add('turretDark', cylY(0.23, 0.23, 0.024, 16), -0.53, 0.78, -0.31);
  P.add('turret', cylY(0.21, 0.235, 0.12, 16), 0.36, 0.72, -0.23);
  P.add('turretDark', cylY(0.18, 0.18, 0.024, 14), 0.36, 0.792, -0.23);
  // 1G46 gunner's sight box ahead of the gunner's hatch.
  P.add('turret', box(0.29, 0.18, 0.32), 0.43, 0.70, 0.41);
  P.add('turretGlass', box(0.22, 0.11, 0.018), 0.43, 0.71, 0.578);
  P.add('turretDark', box(0.31, 0.030, 0.065), 0.43, 0.80, 0.55);
  P.add('turret', box(0.11, 0.14, 0.13), -0.34, 0.73, -0.01);
  P.add('turretGlass', box(0.085, 0.052, 0.016), -0.34, 0.75, 0.061);
  // Rear bins hug the cast tail.
  P.add('turret', box(1.34, 0.24, 0.36), 0, 0.40, -1.42);
  P.add('turretDark', box(1.26, 0.025, 0.31), 0, 0.535, -1.42);
  for (const s of [-1, 1]) {
    P.add('turret', box(0.30, 0.26, 0.48), s * 0.79, 0.38, -1.16);
    P.add('turretDark', box(0.25, 0.022, 0.41), s * 0.79, 0.525, -1.16);
  }
}

function addT90CastTurretAftStowage(P: T90BuilderPort): void {
  const { box, cylZ } = KIT;
  // Unequal service packs on the cast tail: broad buried feet and diagonal returns carry every box into the bins.
  for (const [x, y, z, w, h, d, yaw] of [
    [-1.04, 0.36, -1.04, 0.34, 0.24, 0.42, -0.10],
    [ 1.02, 0.39, -1.08, 0.38, 0.27, 0.46,  0.12],
    [-0.42, 0.54, -1.46, 0.42, 0.16, 0.30, -0.04],
    [ 0.35, 0.52, -1.50, 0.34, 0.14, 0.26,  0.05],
  ]) {
    P.add('turret', box(w * 0.82, h * 0.58, d * 0.72), x, y - h * 0.26, z + 0.08, 0, yaw, 0);
    P.add('turret', box(w, h, d), x, y, z, 0, yaw, 0);
    P.add('turretDark', box(w * 0.72, 0.020, d * 0.70), x, y + h * 0.54, z, 0, yaw, 0);
    P.add('turretDetail', box(0.025, h * 0.72, d * 0.76), x - w * 0.31, y, z, 0, yaw, 0);
  }
  for (const [x, z, roll] of [[-0.92, -1.25, -0.34], [0.91, -1.30, 0.31]]) {
    P.add('turretDetail', box(0.035, 0.035, 0.50), x, 0.43, z, roll, 0, 0);
    P.add('turretDark', box(0.10, 0.055, 0.12), x, 0.31, z + 0.17, roll, 0, 0);
  }
  for (const [x, r, len, y, z] of [[-0.88, 0.105, 0.32, 0.58, -1.18], [0.87, 0.12, 0.36, 0.60, -1.24]]) {
    P.add('turret', cylZ(r, len, 14), x, y, z);
    P.add('turretDark', cylZ(r + 0.010, 0.026, 14), x, y, z - len * 0.32);
    P.add('turretDark', cylZ(r + 0.010, 0.026, 14), x, y, z + len * 0.32);
    P.add('turretDetail', box(r * 1.72, 0.040, 0.14), x, y - r * 0.84, z);
  }
}

function addT90CastTurretGunAndFinish(P: T90BuilderPort): void {
  const { cylZ } = KIT;
  // Continuous 2A46M assembly: buried trunnion, canvas boot, segmented tube, thermal jacket and a true dark bore. The
  // trunnion stands 0.30 m over the ring (gun axis 1.76 m).
  P.gunG.position.set(0, 0.30, 0.96);
  ruSaddle(P, { rollR: 0.21, rollW: 0.62, tubeR: 0.112, rootL: 0.68 });
  P.addGunExtra(KIT.xform(cylZ(0.48, 0.30, 18, 0.44), 0, 0, 0, 0, 0, 0, [0.58, 0.42, 1]), 0, 0.02, 0.14);
  P.addGunExtraDark(cylZ(0.17, 0.28, 16, 0.13), 0, 0.01, 0.43);
  for (const z of [0.31, 0.40, 0.49, 0.58]) P.addGunExtraDark(cylZ(0.174, 0.024, 16), 0, 0.01, z);
  tubeGun(P, [
    [0.42, 1.45, 0.138], [1.45, 2.35, 0.145], [2.35, 3.05, 0.129],
    [3.05, 4.38, 0.102], [4.38, 5.08, 0.087],
  ], { rings: [[1.05, 0.130], [1.45, 0.145], [2.35, 0.130], [3.05, 0.104], [3.75, 0.095], [4.30, 0.087]], muzzle: 5.08 });
  muzzleBore(P, { r: 0.087 });
  P.add('gun', cylZ(0.158, 0.78, 16, 0.137), 0, 0, 2.25);
  P.add('gunDark', cylZ(0.161, 0.035, 16), 0, 0, 1.86);
  P.add('gunDark', cylZ(0.161, 0.035, 16), 0, 0, 2.64);
  addT90CastServiceRack(P);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [1.47, 0.27, -0.18], Math.PI / 2);
  P.decal('turret', 'number', P.spec.visual.number || '', 0.24, [-1.47, 0.27, -0.18], -Math.PI / 2);
}

function replaceT90CastTurret(P: T90BuilderPort): void {
  const context = prepareT90CastTurret(P);
  addT90CastTurretProtection(P, context);
  addT90CastTurretSmokeBanks(P);
  addT90CastTurretRoofAndBins(P);
  addT90CastTurretAftStowage(P);
  addT90CastTurretGunAndFinish(P);
}


function buildT90A(P: T90BuilderPort, legacyOptions: T90ALegacyOptions = {}): void {
  buildT90ALegacy(P, legacyOptions);
  // The mature T4A/T5F assembly already passed its independent 14-view
  // sitting.  Family harmony is not permission to replace its measured
  // wedge, K-5 and roof kit with a generic shared casting.
  // Its legacy radio fittings, however, stopped at short mast stubs.  That
  // made the complete T-90A look materially smaller than the base T-90 in
  // the garage even though both hulls retain the same 3.78 m authored
  // envelope.  Restore the two source-semantic radio courses as equipment,
  // not by scaling the tank: each broad shoe overlaps the aft cast shoulder,
  // the collar is half buried in that shoe, and the flexible whip is a child
  // of rig_turret so the full station follows yaw.
  for (const [x, z, h, rake, seed] of [
    [-0.86, -1.02, 0.98, -0.035, 41],
    [0.82, -0.89, 0.82, 0.030, 42],
  ]) {
    P.add('turret', KIT.box(0.18, 0.12, 0.24), x, 0.45, z);
    P.add('turretDark', KIT.cylY(0.045, 0.062, 0.15, 10), x, 0.525, z);
    P.add('turretDetail', KIT.box(0.035, 0.20, 0.30), x * 0.93, 0.43, z + 0.16, -0.42, 0, 0);
    const whip = FITTINGS.antennaWhip({ mats: P.mats, h, r: 0.014, rake, seed });
    whip.position.set(x, 0.53, z);
    P.turretG.add(whip);
  }
}

// T-90A obr. 2006 (lane t90-family-266, owner 2026-10-30 "cleaned up and updated significantly"; Main's identity call):
// the same T-90A as obr. 2004 on the shared T-90A hull, running gear and welded turret. The 2006 production change is the
// gunner's thermal sight, applied as a delta below; the private print-fitted Vladimir hull and turret are retired.
function buildT90A2006(P: T90BuilderPort): void {
  buildT90A(P);
}


// The source-measured T-90SM shell remains the redesign datum; owner-directed
// refinements replace its equipment layer without discarding that geometry.
function buildT90SM(P: T90BuilderPort): void {
  // T-90SM obr. 2013: the export T-90AM/MS on the family chassis with the AM-type turret (Main's ruling 2026-10-30;
  // the photographs show no hull difference from the T-90MS).
  addT90FamilyChassis(P, 'relikt');
  addT90AMTypeTurret(P);
  P.topY = 0.80;
}


function buildT90MS(P: T90BuilderPort): void {
  // T-90MS obr. 2011 (Nizhny Tagil): the export T-90AM on the family chassis with the AM-type turret and no Shtora
  // (Main's identity call 2026-10-30).
  addT90FamilyChassis(P, 'relikt');
  addT90AMTypeTurret(P);
  P.topY = 0.80;
}

function buildT90AM(P: T90BuilderPort): void {
  // T-90AM (2011) and the T-90AM II (the later T-90M Proryv-3) on the family chassis with the AM-type turret (lane
  // t90-family-266; the owner 2026-10-30: "cleaned up and updated significantly"). The former Proryv build built a
  // calibration hull, cleared it, rebuilt it 200 mm low, lifted every hull bucket 160 mm and squashed the turret to
  // 65 % of its height; the shared chassis and turret need none of that.
  // 2026-10-09 (owner): the field net and garnish (ghillieFleetSuits.ts), laid on the assembled build
  addVehicleGhillieSuit(P);
  const t90m = P.spec.id === 't90m_proryv';
  // Owner-directed longer chassis (vehicleSizePolicy.ts): the hull stretches, the turret keeps its size and ring, and
  // the course is authored on the stretched wheelbase.
  const hullLengthFactor = VEHICLE_HULL_LENGTH_FACTORS[P.spec.id] ?? 1;
  addT90FamilyChassis(P, 'relikt', { reliktRearZ: t90m ? 0.20 : -1.25, gearLengthFactor: hullLengthFactor });
  addT90AMTypeTurret(P);
  if (t90m) addT90MNetScreens(P);
  if (hullLengthFactor !== 1) P.extendHullLength(hullLengthFactor);
  P.topY = 0.80;
}

// T-90M Proryv-3 (the T-90AM II): the steel net screens hung round the lower turret front and cheeks (Army-2020
// photographs). Each screen is a framed mesh of thin bars on two hangers that enter the cheek skin.
function addT90MNetScreens(P: T90BuilderPort): void {
  const { box } = KIT;
  // Path 0.12-0.15 m ahead of the AM-type cheek outline measured at the screen's height (turret frame): the nose edge
  // (0.52, 1.95), the cheek (1.02, 1.77), the shoulder (1.31, 1.31), (1.63, 0.94).
  const yTop = 0.40, yBot = 0.05;
  for (const s of [-1, 1]) {
    for (const [x0, z0, x1, z1] of [[0.36, 2.07, 1.08, 1.88], [1.08, 1.88, 1.47, 1.43], [1.47, 1.43, 1.80, 1.02]]) {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const yaw = Math.atan2(s * ux, uz);
      const at = (t: number, inward = 0): [number, number] => {
        // inward normal points toward the turret centre: (-uz, ux) mirrored per side
        const x = x0 + ux * t * len - uz * inward, z = z0 + uz * t * len + ux * inward;
        return [s * x, z];
      };
      const [cx, cz] = at(0.5);
      P.add('turretDark', box(0.022, 0.022, len), cx, yTop, cz, 0, yaw, 0);
      P.add('turretDark', box(0.016, 0.016, len), cx, yBot, cz, 0, yaw, 0);
      for (const f of [0.33, 0.66]) P.add('turretDark', box(0.012, 0.012, len), cx, yTop + (yBot - yTop) * f, cz, 0, yaw, 0);
      const n = Math.max(4, Math.round(len / 0.10));
      for (let i = 0; i <= n; i++) {
        const [px, pz] = at(i / n);
        P.add('turretDark', box(0.012, yTop - yBot, 0.012), px, (yTop + yBot) / 2, pz);
      }
      for (const t of [0.2, 0.8]) {
        const [hx, hz] = at(t, 0.08);
        P.add('turretDetail', box(0.05, 0.05, 0.18), hx, yTop + 0.01, hz, 0, yaw + Math.PI / 2, 0);
      }
    }
  }
}

// Burlak uses the proven T-90A chassis and native six-wheel course.  The
// earlier standalone prototype scaffold drifted into a longer, taller hull
// even though the Burlak change is the rotating fighting compartment and
// autoloader bustle.  Reuse the authored family chassis, then replace only
// the complete turret/gun package with the distinct repository-authored
// Burlak assembly.
function addT90BurlakShoulderFoundationNative2026(P: T90BuilderPort, {
  includeProtection = true,
  carrierDrop = 0,
  frontLift = 0,
  frontForward = 0,
}: {
  includeProtection?: boolean;
  carrierDrop?: number;
  frontLift?: number;
  frontForward?: number;
} = {}): void {
  const { box, polyTurret } = KIT;
  // Burlak keeps the mature cast T-90A fighting compartment.  Its defining
  // armor is a clipped, open-edged outer shoulder system rather than a
  // second solid turret.  The inboard thirds disappear into the native dome
  // and the outboard tips thin in both plan and elevation.
  for (const s of [-1, 1]) {
    // Thin horizontal shoulder diamond: this is the broad plan-view plate
    // visible around the gun court, not a deep solid side wall.  Its rear
    // edge overlaps the core and its outboard tip overlaps the terminal leaf.
    P.add('turret', polyTurret([
      [s * 0.28, 1.30], [s * 0.82, 1.30], [s * 1.84, 0.98],
      [s * 1.80, 0.84], [s * 1.46, 0.62], [s * 1.44, 0.05],
      [s * 0.42, 0.48],
    ], 0.07, 1.00, 1.00), 0, 0.40 - carrierDrop + frontLift, frontForward);
    // Unequal planted protection cassettes preserve negative breaks between
    // the wing and the dome instead of recreating the rejected slab wall.
    if (includeProtection) {
      for (const [x, y, z, yaw, roll, w, h, d] of [
        [0.72, 0.39, 1.28, 0.31, -0.24, 0.44, 0.36, 0.10],
        [1.04, 0.37, 1.04, 0.47, -0.20, 0.48, 0.38, 0.11],
        [1.43, 0.33, 0.78, 0.62, -0.14, 0.44, 0.35, 0.12],
        [1.72, 0.37, 0.92, 0.28, -0.08, 0.34, 0.10, 0.11],
      ]) {
        P.add('turret', KIT.xform(box(w, h, d), 0, 0, -0.045), s * x, y, z, roll, -s * yaw, 0);
        P.add('turretDark', KIT.xform(box(w * 0.76, 0.012, d * 0.72), 0, h * 0.52, 0.030), s * x, y, z, roll, -s * yaw, 0);
      }
    }
    // A short return makes the carrier visibly load-bearing in side and yaw
    // views while leaving the lower shoulder undercut open.
    P.add('turret', box(0.16, 0.30, 0.36), s * 1.63, 0.27, -0.50, 0, 0, -s * 0.10);
    P.add('turretDark', box(0.018, 0.24, 0.30), s * 1.72, 0.27, -0.50, 0, 0, -s * 0.10);
    // Full rear cast shoulder: the measured plan remains near 1.5 m half-
    // width through z=-0.9 before entering the narrow autoloader neck.  A
    // buried unequal service pack supplies that supported shoulder volume
    // while retaining the lower undercut and the one-shell topology.
    P.add('turret', box(0.30, 0.31, 0.68), s * 1.42, 0.31, -0.84, -0.06, -s * 0.10, 0);
    P.add('turretDark', box(0.018, 0.24, 0.56), s * 1.58, 0.31, -0.84, -0.06, -s * 0.10, 0);
    P.add('turretDetail', box(0.23, 0.016, 0.040), s * 1.42, 0.48, -0.61, -0.06, -s * 0.10, 0);
  }
  // Buried mantlet/chin bridge.  The reference protection court continues
  // to z≈1.62 while the closed cast core stops near z=1.3; this supported
  // center mass joins both shoulder roots to the gun cradle and prevents a
  // bare barrel from appearing to enter the turret through a narrow slit.
  P.add('turret', box(0.90, 0.36, 0.34), 0, 0.18 + frontLift, 1.43 + frontForward, -0.08, 0, 0);
  P.add('turretDark', box(0.80, 0.29, 0.028), 0, 0.17 + frontLift, 1.605 + frontForward, -0.08, 0, 0);
}

function addT90BurlakBustleNative2026(
  P: T90BuilderPort,
  { scale = 1 }: { scale?: number } = {},
): void {
  const { box } = KIT;
  const rootZ = -1.08;
  const fit = (value: number): number => value * scale;
  const fitZ = (z: number): number => rootZ + (z - rootZ) * scale;
  // One shallow tapered bustle begins inside the existing cast rear bins.
  // It is a closed authored loft with a real floor and roof; lids and rails
  // merely articulate that load-bearing body and never substitute for it.
  // Scale remains available to comparison tools, while production vehicles
  // use the complete source envelope around the fixed neck plane.
  const stations: WeldedStation[] = [
    [-1.08, 0.00, 0.64, -1.10, 1.10, -0.98, 0.98, -1.04, 1.04],
    [-1.50, 0.05, 0.67, -1.02, 1.02, -0.90, 0.90, -0.96, 0.96],
    [-2.08, 0.07, 0.65, -0.84, 0.84, -0.72, 0.72, -0.79, 0.79],
    [-2.68, 0.08, 0.60, -0.72, 0.72, -0.60, 0.60, -0.67, 0.67],
    // (release 240, the owner: "make sure all tank turrets are clear of hulls": the tail's floor stays level with the
    // station ahead of it; it dropped 8 cm to the ring's plane, into the stern's drums and bins it swings over)
    [-3.30, 0.08, 0.58, -0.58, 0.58, -0.47, 0.47, -0.54, 0.54],
  ].map(([z, y0, y1, xl, xr, xbl, xbr, xtl, xtr]): WeldedStation => [
    fitZ(z), fit(y0), fit(y1), fit(xl), fit(xr),
    fit(xbl), fit(xbr), fit(xtl), fit(xtr),
  ]);
  P.add('turret', weldedStationLoft(stations));
  for (const [z, w, d, y] of [
    [-1.34, 1.54, 0.32, 0.68], [-1.80, 1.44, 0.35, 0.69],
    [-2.29, 1.26, 0.36, 0.67], [-2.83, 1.04, 0.36, 0.62],
  ]) {
    // 2026-10-19 (owner float sweep): the lids kept a flat seat while the bustle roof falls aft, leaving them 8-16 mm
    // up; each lid and its strip is dropped onto the roof.
    P.snapGroup('t90-burlak-bustle-lid', () => {
      P.add('turretDark', box(fit(w), fit(0.018), fit(d)), 0, fit(y), fitZ(z));
      P.add('turretDetail', box(fit(w * 0.80), fit(0.012), fit(0.040)),
        0, fit(y + 0.015), fitZ(z + d * 0.39));
    }, { reachM: 0.04, mode: 'down' });
  }
  for (const s of [-1, 1]) {
    // 2026-10-19 (owner float sweep): the yawed side pods stood 25-46 mm off the tapering bustle wall; each pod and its
    // face plate is seated on the wall.
    for (const [x, z, d] of [[1.00, -2.12, 0.33], [0.92, -2.53, 0.31], [0.82, -2.91, 0.29]]) P.snapGroup('t90-burlak-bustle-pod', () => {
      P.add('turret', box(fit(0.19), fit(0.28), fit(d)), s * fit(x), fit(0.37), fitZ(z), 0, -s * 0.32, 0);
      P.add('turretDark', box(fit(0.015), fit(0.22), fit(d * 0.80)),
        s * fit(x + 0.105), fit(0.37), fitZ(z), 0, -s * 0.32, 0);
    }, { reachM: 0.06 });
    if (scale < 0.999) {
      // Keep optional reduced comparison envelopes watertight without changing
      // the visible armour-pod proportions. Production vehicles remain scale=1.
      P.add('turret', box(fit(0.16), fit(0.24), fit(0.20)),
        s * fit(1.07), fit(0.37), fitZ(-2.44), 0, -s * 0.32, 0);
    }
    for (const y of [0.32, 0.43, 0.54]) P.add('turretDetail',
      box(fit(0.030), fit(0.022), fit(0.68)), s * fit(0.50), fit(y), fitZ(-3.00));
    for (const z of [-3.32, -3.08, -2.84, -2.68]) P.add('turretDetail',
      box(fit(0.030), fit(0.24), fit(0.030)), s * fit(0.50), fit(0.43), fitZ(z));
  }
  for (const [x, w, n] of [[-0.42, 0.42, 4], [0.10, 0.34, 3], [0.43, 0.24, 2]]) {
    P.add('turretDark', box(fit(w), fit(0.20), fit(0.022)), fit(x), fit(0.43), fitZ(-3.315));
    for (let i = 0; i < n; i++) P.add('turretDetail',
      box(fit(0.020), fit(0.14), fit(0.016)),
      fit(x - w * 0.34 + i * (w * 0.68 / Math.max(1, n - 1))), fit(0.43), fitZ(-3.332));
  }
  P.turretG.userData.t90BurlakBustleReceipt = Object.freeze({
    scale,
    rootZ,
    rearZ: fitZ(-3.30),
    frontHalfWidth: fit(1.10),
    frontHeight: fit(0.64),
    maxRoofY: fit(0.69),
  });
}

function finishT90BurlakNative2026(P: T90BuilderPort): void {
  const { box, cylY, cylZ, torus } = KIT;
  // Preserve the full authored magazine envelope. A previous 0.90 scale made
  // the Burlak bustle visibly undersized relative to its turret foundation.
  const bustleScale = 1;
  const bustleRootZ = -1.08;
  const fitBustle = (value: number): number => value * bustleScale;
  const fitBustleZ = (z: number): number => (
    bustleRootZ + (z - bustleRootZ) * bustleScale
  );

  addT90BurlakShoulderFoundationNative2026(P);
  addT90BurlakBustleNative2026(P, { scale: bustleScale });

  // Prototype roof hierarchy: a broad slew seat, compact panoramic head,
  // two hatch rings and a clearly founded NSVT.  These forms supply the tall
  // but low-area silhouette visible in the reference without inflating the
  // cast shell itself.
  P.add('turret', box(0.52, 0.14, 0.48), 0.38, 0.63, -0.70);
  P.add('turretDark', torus(0.22, 0.022, 18), 0.38, 0.71, -0.70);
  // 2026-10-19 (owner float sweep): the sight head stood 40 mm over its seat box (and its window 19 mm off its face),
  // and the left hatch ring 74 mm over the crown with the commander station on it. The window lies on the head's
  // raked face, and the ring's collar runs down into the crown.
  // 2026-10-21 (float-gaps 230): the head keeps its 0.92 station (its crown is the turret's top, pinned by
  // fleetResize20261002; the 10-19 sweep had dropped it 42 mm into the box); a 50 mm neck inside the slew ring
  // (corners 21 mm inside the ring's tube) runs from 2.5 mm inside the seat box to 7.5 mm inside the head.
  P.add('turret', box(0.26, 0.05, 0.24), 0.38, 0.7225, -0.70);
  P.add('turret', orientedSlab(
    [-0.15, -0.18, -0.14], [0.15, -0.18, -0.14], [0.15, -0.18, 0.14], [-0.15, -0.18, 0.14],
    [-0.11, 0.18, -0.10], [0.11, 0.18, -0.10], [0.11, 0.18, 0.10], [-0.11, 0.18, 0.10],
  ), 0.38, 0.92, -0.70);
  P.add('turretGlass', box(0.19, 0.16, 0.012), 0.38, 0.92, -0.576, -0.111, 0, 0);
  P.add('turret', cylY(0.25, 0.28, 0.22, 18), -0.48, 0.72, -0.34);
  P.add('turretDark', cylY(0.22, 0.22, 0.022, 16), -0.48, 0.84, -0.34);
  P.add('turret', cylY(0.20, 0.23, 0.09, 16), 0.38, 0.77, -0.24);
  P.add('turretDark', cylY(0.17, 0.17, 0.020, 14), 0.38, 0.825, -0.24);
  // 2026-10-21 (watertight-230): each hatch ring stands on a cast collar down into the roof crown (0.64-0.68 under
  // them). The rings were authored 6-9 cm over the crown, and the gap they and the commander's station closed over
  // read as turret interior: the interior fills filled it as a dark stair-step under the left ring. The collars sit
  // 8 mm inside each ring's lower radius and 1 cm up into it, so no face of a collar is coplanar with its ring.
  P.add('turret', cylY(0.272, 0.272, 0.13, 18), -0.48, 0.675, -0.34);
  P.add('turret', cylY(0.222, 0.222, 0.125, 16), 0.38, 0.6725, -0.24);
  // Restore the richer repository-authored roof cadence from the earlier
  // Burlak pass, but keep it below the corrected low combat envelope.  The
  // long left foundation is half buried in the crown; every periscope and
  // sight head lands on that foundation or a hatch ring instead of becoming
  // the freestanding roof forest used by the discarded prototype.
  P.add('turret', box(0.34, 0.13, 0.86), -1.12, 0.67, -0.28);
  P.add('turretDark', box(0.29, 0.014, 0.78), -1.12, 0.742, -0.28);
  for (const [x, z, yaw] of [
    [-0.78, -0.29, -0.22], [-0.58, -0.22, 0], [-0.38, -0.29, 0.22],
    [0.18, -0.07, -0.18], [0.47, -0.10, 0.18],
  ]) {
    P.add('turretDark', box(0.12, 0.055, 0.070), x, 0.79, z, 0, yaw, 0);
    P.add('turretGlass', box(0.080, 0.032, 0.010), x, 0.802, z + 0.040, 0, yaw, 0);
  }
  P.add('turret', box(0.30, 0.15, 0.28), 0.36, 0.57, 0.31, 0, -0.12, 0);
  P.add('turretDark', box(0.25, 0.090, 0.014), 0.36, 0.58, 0.462, 0, -0.12, 0);
  P.add('turretGlass', box(0.19, 0.060, 0.008), 0.36, 0.58, 0.471, 0, -0.12, 0);
  // Autoloader feed-lid and two longitudinal rub rails.  They overlap the
  // closed bustle roof and add mechanical scale without altering its plan.
  P.add('turretDark', box(fitBustle(0.72), fitBustle(0.014), fitBustle(0.66)),
    fitBustle(0.02), fitBustle(0.695), fitBustleZ(-2.18));
  P.add('turretDetail', box(fitBustle(0.030), fitBustle(0.022), fitBustle(1.42)),
    fitBustle(-0.31), fitBustle(0.710), fitBustleZ(-2.19));
  P.add('turretDetail', box(fitBustle(0.030), fitBustle(0.022), fitBustle(1.42)),
    fitBustle(0.35), fitBustle(0.710), fitBustleZ(-2.19));
  addT90AutomatedCommanderStation(P, {
    x: -0.46,
    z: -0.42,
    seatY: 0.80,
    yaw: 0,
    scale: 0.58,
    heightScale: 0.65,
    weaponScale: 0.58,
    weaponYaw: 0,
    weaponClass: 'nsvt',
    includeRace: false,
    weaponName: 't90aBurlakCommanderNsvt',
    receiptKey: 't90aBurlakAutomatedStationReceipt',
  });
  // Unequal cheek smoke fans are a defining Burlak/T-90 station.  Their
  // broad local shoes overlap the shoulder carrier; the launchers then grow
  // outboard/upward from those seats instead of intersecting the roof.
  for (const s of [-1, 1]) {
    P.add('turret', box(0.20, 0.16, 0.36), s * 1.30, 0.32, 0.12, 0, 0, -s * 0.15);
    const smoke = FITTINGS.smokeBank({ mats: P.mats, count: s < 0 ? 6 : 5, r: 0.040, len: 0.27, pitch: -0.41, splay: 0.30, arc: 0.56, spacing: 0.098 });
    smoke.position.set(s * 1.34, 0.45, 0.13);
    smoke.rotation.y = s * 1.02;
    P.turretG.add(smoke);
  }
  {
    const antenna = FITTINGS.antennaWhip({ mats: P.mats, h:2.67, r:0.014, rake:0.018, seed:61 });
    antenna.position.set(0, 0.63, -1.02);
    P.turretG.add(antenna);
    P.add('turretDark', cylY(0.045, 0.060, 0.12, 8), 0, 0.63, -1.02);
  }

  // The Burlak source uses the same 2A46 family run but terminates slightly
  // inside the mature T-90A muzzle envelope.
  P.add('gun', cylZ(0.105, 1.36, 18), 0, 0, 1.22);
  P.add('gun', cylZ(0.082, 2.34, 18), 0, 0, 3.05);
  for (const z of [0.56, 1.90, 2.18, 3.02, 4.18]) P.add('gunDark', cylZ(z < 2 ? 0.116 : 0.098, 0.030, 16), 0, 0, z);
  P.gunG.scale.z = 0.955;
  P.gunG.scale.y = 1.318;
  P.gunG.position.y += 0.08;
}

function replaceT90BurlakCoreNative2026(P: T90BuilderPort): void {
  const { polyMultiLoft, polyTurret } = KIT;
  // Retain the mature T-90A cannon tree but remove every cast-turret bucket
  // and direct fitting.  This guarantees there is one rotating primary mass,
  // not a Burlak skin laid over a hidden T-90A dome.
  P.turretG.clear();
  P.turretG.add(P.gunG);
  P.clear('turret', 'turretDetail', 'turretDark', 'turretCloth', 'turretGlass', 'turretTrack');

  const plan = [
    [-0.25, 1.28], [0.25, 1.28], [0.76, 1.10], [1.38, 0.78],
    [1.40, 0.45], [1.46, 0.05], [1.58, -0.48], [1.64, -0.72],
    [1.36, -1.08], [0.76, -1.20], [-0.76, -1.20], [-1.36, -1.08],
    [-1.64, -0.72], [-1.58, -0.48], [-1.46, 0.05], [-1.40, 0.45],
    [-1.38, 0.78], [-0.76, 1.10],
  ];
  const shoulder = [0.37, 0.37, 0.40, 0.43, 0.45, 0.47, 0.47, 0.46, 0.44, 0.41, 0.41, 0.44, 0.46, 0.47, 0.47, 0.45, 0.43, 0.40];
  const crown = [0.54, 0.54, 0.58, 0.62, 0.64, 0.66, 0.66, 0.69, 0.65, 0.61, 0.61, 0.65, 0.69, 0.66, 0.66, 0.64, 0.62, 0.58];
  P.add('turret', polyMultiLoft(plan, [
    { height:0.02, inset:1.00 },
    { height:shoulder, inset:0.98 },
    { height:crown, inset:0.82 },
  ]));
  // Closed ring apron overlaps both the hull ring and the shell floor.  The
  // short plan preserves the source undercut ahead of the autoloader neck.
  const apron = [
    [-0.22, 1.02], [0.22, 1.02], [0.92, 0.68], [1.36, 0.08],
    [1.26, -0.68], [0.82, -1.02], [-0.82, -1.02], [-1.26, -0.68],
    [-1.36, 0.08], [-0.92, 0.68],
  ];
  P.add('turret', polyTurret(apron, 0.24, 0.94, 0.95), 0, -0.18, -0.06);
  P.add('turretDark', polyTurret(apron, 0.022, 0.95, 0.97), 0, 0.04, -0.06);
}

function buildT90BurlakHybridNative2026(P: T90BuilderPort): void {
  buildT90A(P, {
    turretSeatZ: T90A_ORIGINAL_TURRET_SEAT_Z_M,
    turretRearwardShiftM: 0,
    shtoraEyeZ: T90A_ORIGINAL_SHTORA_EYE_Z_M,
    shtoraLocalForwardShiftM: 0,
    shtoraSupportFrontZ: T90A_ORIGINAL_SHTORA_EYE_Z_M - 0.04,
    chevronForwardM: 0,
    nsvtRaiseM: 0,
    gunRadiusScale: 1,
    gunAssemblyRaiseM: 0,
    adoptT90MFamilyGun: false,
    recordSeatReceipt: false,
  });
  // Lane t90-family-266 (Main's ruling 2026-10-30): the Burlak rides the T-90 family chassis unchanged. Its former
  // section scaling, 120 mm lift, plate reseats, closing fender shelves and narrowed track gauge only adapted the
  // retired print-fitted T-90A loft. The Burlak's own turret below is untouched.
  replaceT90BurlakCoreNative2026(P);
  finishT90BurlakNative2026(P);
  // The inherited cast tree is deliberately compressed only in section;
  // width, plan length, ring location and the independently dimensioned roof
  // stations remain unchanged.
  P.turretG.scale.set(1.00, 0.85, 1.00);
  P.gunG.scale.y = 1.318;
  P.gunG.position.y -= 0.035;
}

/** The T-90 family chassis with the AM-type Relikt fit, for vehicles built on it outside this pack (the BMPT T-90). */
export const T90_RELIKT_CHASSIS = t90Profile((P) => addT90FamilyChassis(P, 'relikt'));
/** Turret-ring height on the family chassis (builder frame). */
export { T90_FAMILY_RING_Y };

export const T90_PROFILES = {
  t90a_2004: t90Profile(buildT90A),
  t90_1992: t90Profile(buildT90),
  t90ms_2011: t90Profile(buildT90MS),
  t90a_burlak_proto: t90Profile(buildT90BurlakHybridNative2026),
  pt91m: {build:buildPT91MPendekar},
  t90sm_2013: t90Profile(buildT90SM),
  t90a_2006: t90Profile(buildT90A2006),
  t90am: t90Profile(buildT90AM),
  t90m_proryv: t90Profile(buildT90AM),
} satisfies VehicleProfileRecord;
