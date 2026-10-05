import { markSmokeTube, registerSmokeSockets } from './vehicleAuxiliaryGeometry.ts';
import {NATIONAL_LEGACY_IDS} from './nationalLegacyConfig.ts';
// src/vehicles/decorations.ts — cosmetic external-stowage / fittings kit for
// the whole fleet ("decoration system", 2026-07 round).
//
// WHAT THIS IS: a library of parameterized decoration builders (cupolas, roof
// MGs, stowage, tow cables, fuel drums, netting, …), a per-tank manifest table
// (curated ids + era/nation defaults so EVERY tank dresses), and a placement
// engine that anchors each piece against the tank's REAL as-built geometry by
// raycast probing — never spec fractions alone — so nothing floats and
// nothing interpenetrates.
//
// ARCHITECTURE LAW (non-negotiable — the fleet metrology program depends on
// every clause):
//  * Every decoration mesh lives under a dedicated group: `rig_decor_hull`
//    (child of rig_hull) or `rig_decor_turret` (child of rig_turret, so
//    turret decor yaws with the turret).
//  * Decor is a COSMETIC layer: procedural/metrology builds skip it by
//    default, while an explicit `decor:true` lets the first-party Gallery
//    show the shipped equipment. Metrology stub engine contexts still
//    auto-skip unless explicitly opted in (see resolveDecorMode), so the
//    geometry-gate ledger remains bare and byte-stable.
//  * In-game builds (garage pedestal, battle, studio, icon generator) get
//    decor ON by default — no call-site changes required. Smoke dispensers
//    are functional: aperture receipts feed the generated control inventory.
//    Inventory generation must explicitly include the shipped decoration layer.
//  * Per-tank selection is DETERMINISTIC, seeded by stable decoration
//    identity only (never camoSeed): normally the SPEC ID, with the preserved
//    Revolution Proto retaining its old ID. Variation lives across the
//    fleet, stability per vehicle.
//  * Placement guards: WIDTH GUARD (no piece may reach past
//    dims.widthM/2 + 0.05 m — the loader's width clamp must never fire on
//    account of cosmetics), GUN GUARD (the full-depression bore swept across
//    every turret yaw must clear every hull piece), TURRET-SWEEP GUARD (hull
//    decor inside the swept annulus stays below the turret's lowest skirt),
//    and a 5-point seat probe (uneven/occupied surfaces are rejected — which
//    also de-dupes against profile-authored greebles like the M60's
//    searchlight: an occupied roof spot simply doesn't probe flat).
//  * PERF: static decor merges into ONE BufferGeometry per material family
//    per parent group (≈4-9 added draws/tank), budgeted ≤ 3000 added
//    triangles per tank, castShadow OFF (the fleet's shadow proxies carry
//    silhouettes; per-mesh casters are swept off on both procedural and GLB
//    paths), LOD-wrapped at the same 150 m greeble horizon tankFactory uses.
//  * WRECKS: decor materials are per-visual MeshStandardMaterials chained
//    through the same ambient-floor hook pattern createTankMaterials uses,
//    so tankFactory.setDestroyed's existing traversal wraps them with the
//    burn mask and decor chars in lockstep with the hull (listen-only —
//    nothing here touches the burn driver).
//
// No top-level side effects; canvas textures are created lazily (plain-node
// imports — the track-geometry selftest imports tankFactory — must stay
// safe).

import {NATIONAL_MODERNIZATION_IDS} from './nationalModernizationConfig.ts';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  vehicleAmbientFloorHook, getKitPaintTexture, getSharedRoughnessTexture,
} from './materials.ts';
import { VEHICLE_ERAS, isContemporaryVehicleEra } from './taxonomy.ts';
import {
  buildBranchBundle, buildCargoVariant, buildLog, buildNetDrape, buildNetRoll, buildPackCluster, buildTarpRoll,
  buildTools, drum200, duffel, jerrycan, sandbag, type AccessoryPainter, type RGB,
} from './accessoryKits.ts';
import { FOLIAGE_ALPHA_TEST, vehicleFoliageAtlas, type VehicleFoliageKind } from './vehicleFoliage.ts';
import { moldedBox, place, roundBar } from './accessoryPrimitives.ts';
import {
  addPintleAmmo, addPintleBarrel, addPintleMount, addPintleReceiver, addPintleRing, addPintleShield, createPintleLayout,
} from './machineGunGeometry.ts';
import type { FleetTankSpec } from './specContracts.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';

type Rng = () => number;
type GeometryScale = number | readonly [number, number, number];
type DecorFrame = 'hull' | 'turret';
type DecorMaterialKey = 'kit' | 'steel' | 'wood' | 'canvas' | 'burlap'
  | 'rubber' | 'cans' | 'net' | 'mesh' | 'lens' | 'foliage';

interface DecorOptions {
  proceduralOnly?: boolean;
  decor?: boolean;
  /** The factory's geometry tier: 'low' (the mobile tier) builds only the coarse accessory forms. */
  geometryQuality?: string;
}

interface ShadowEngineContext {
  releaseShadowMaterial?: (material: THREE.Material) => boolean;
  setupShadowMaterial?: (
    material: THREE.Material,
    extraHook?: typeof vehicleAmbientFloorHook,
  ) => THREE.Material;
}

interface DecorPartMeta {
  mount?: string;
  centerY?: number;
  clearY?: number;
  h?: number;
  d?: number;
  w?: number;
  basket?: boolean;
  runH?: number;
  continuousCarrier?: boolean;
}

interface DecorPart {
  mat: DecorMaterialKey;
  geo: THREE.BufferGeometry;
}

interface DecorPartList extends Array<DecorPart> {
  meta?: DecorPartMeta;
  metaCx?: number;
  /** The same piece at the coarse level (built from an identically seeded stream; seated with this list's matrix). */
  coarse?: DecorPartList;
}

interface DecorKitArgs {
  rng: Rng;
  /** 1 = the near level, 0 = the coarse level (far LOD and mobile tier). Builders draw rng before branching on it. */
  detail?: 0 | 1;
  v?: string;
  nation?: string;
  shield?: boolean;
  ring?: boolean;
  helmet?: boolean;
  flat?: boolean;
  rubberRim?: boolean;
  water?: boolean;
  mesh?: boolean;
  w?: number;
  h?: number;
  d?: number;
  len?: number;
  sag?: number;
  n?: number;
  linkW?: number;
  rows?: number;
  perRow?: number;
  r?: number;
  scale?: number;
  links?: number;
  _W?: number;
  set?: string[];
}

type DecorKitBuilder = (args: DecorKitArgs) => DecorPartList;

type FleetEquipmentNationStyle =
  | 'american'
  | 'british'
  | 'east-asian'
  | 'french'
  | 'german'
  | 'israeli'
  | 'italian'
  | 'nordic'
  | 'polish'
  | 'soviet'
  | 'ukrainian'
  | 'neutral';

interface FleetEquipmentPalette {
  canvas: number;
  burlap: number;
  steel: number;
  net: number;
  mesh: number;
  accent: readonly [number, number, number];
  fuelA: readonly [number, number, number];
  fuelB: readonly [number, number, number];
  waterA: readonly [number, number, number];
  waterB: readonly [number, number, number];
  extinguisher: readonly [number, number, number];
  toolCan: readonly [number, number, number];
  ammoCase: readonly [number, number, number];
}

/**
 * Fleet-wide loose-equipment vocabulary.  These are named visual variants,
 * not twenty copies of one anonymous box: each entry has an authored material
 * treatment and silhouette in DECOR_KITS.cargo.  Keeping the list exported
 * gives the catalog and regression tests an exact contract for the requested
 * variation floor.
 */
export const FLEET_EQUIPMENT_VARIANTS = Object.freeze([
  'beer-cooler-blue',
  'cooler-red',
  'insulated-chest-olive',
  'long-duffel',
  'large-rucksack',
  'bedroll-pair',
  'folded-tarp-pack',
  'camo-net-bag',
  'nato-fuel-can',
  'blue-water-can',
  'twin-can-cradle',
  'soviet-tool-can',
  'fifty-cal-ammo-can',
  'wood-ammo-crate',
  'ration-case',
  'medical-case',
  'mechanics-tool-chest',
  'fire-extinguisher',
  'cable-reel',
  'helmet-bundle',
  'crew-backpack',
  'folding-chair',
  'spare-optics-case',
  'thermos-crate',
] as const);

type FleetEquipmentVariant = typeof FLEET_EQUIPMENT_VARIANTS[number];

interface DecorSlotArgs {
  side?: number;
  corner?: number;
  zFrac?: number;
  x?: number;
  z?: number;
  spread?: number;
  rear?: boolean;
  high?: boolean;
  center?: boolean;
  back?: boolean;
  small?: boolean;
  along?: boolean;
  low?: boolean;
  onBasket?: boolean;
  routes?: Array<[string, DecorSlotArgs]>;
}

interface DecorManifestRow {
  kit: string;
  p?: number;
  v?: Omit<DecorKitArgs, 'rng'>;
  slot: [string, DecorSlotArgs];
}

type DecorManifestBuilder = (spec: FleetTankSpec, rng: Rng) => DecorManifestRow[];

export interface DecorationAttachmentArgs {
  root: THREE.Object3D;
  hullG: THREE.Group;
  turretG: THREE.Group;
  spec: FleetTankSpec;
  engineCtx?: ShadowEngineContext | null;
  disposables?: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>;
  opts?: DecorOptions;
  isDestroyed?: () => boolean;
}

type SurfaceMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material>;

interface SurfaceHit {
  p: THREE.Vector3;
  n: THREE.Vector3;
  dist: number;
}

interface ProjectedGrid {
  minU: number;
  maxU: number;
  minV: number;
  maxV: number;
  size: number;
  scaleU: number;
  scaleV: number;
  cells: Array<number[] | undefined>;
  broad: number[];
}

interface SurfaceRecord {
  mesh: SurfaceMesh;
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
  index: ArrayLike<number> | null;
  triangleCount: number;
  toGroup: THREE.Matrix4;
  toLocal: THREE.Matrix4;
  worldNormalMatrix: THREE.Matrix3;
}

interface AxisSurfaceIndex {
  cast(origin: THREE.Vector3, direction: THREE.Vector3): SurfaceHit | null;
}

interface SurfaceIndexPreparation {
  records: SurfaceRecord[];
  bounds: THREE.Box3;
  triangleTotal: number;
}

interface AxisProjectedGrids {
  xz: ProjectedGrid;
  yz: ProjectedGrid;
  xy: ProjectedGrid;
}

interface SurfaceProber {
  top(x: number, z: number, fromY: number): SurfaceHit | null;
  side(y: number, z: number, side: number, fromX: number): SurfaceHit | null;
  zface(x: number, y: number, dirZ: number, fromZ: number): SurfaceHit | null;
}

interface SurfaceSeat {
  y: number;
  n: THREE.Vector3 | null;
  spread: number;
}

interface GunGuard {
  (boxes: THREE.Box3[], seatY?: number | null): boolean;
  lastYaw: number | null;
}

interface CommitOptions {
  allowOverlap?: boolean;
  seatY?: number | null;
  zExtra?: number;
  attachment?: DecorAttachmentIntent;
}

interface DecorAttachmentIntent {
  slot: string;
  supportPoint: THREE.Vector3;
  supportNormal: THREE.Vector3;
  embedM: number;
  mountAxis?: 'y' | 'z';
}

interface DecorPieceSummary {
  kit: string;
  frame: DecorFrame;
  tris: number;
  attachment?: {
    slot: string;
    supportPoint: [number, number, number];
    supportNormal: [number, number, number];
    mountNormal: [number, number, number];
    alignmentDot: number;
    supportGapM: number;
    embedM: number;
    continuousCarrier: boolean;
  };
}

interface DecorSummary {
  pieces: DecorPieceSummary[];
  tris: number;
  drawCalls: number;
  skipped: Array<[string, string]>;
}

interface BasketAnchor {
  x: number;
  y: number;
  z: number;
  d?: number;
}

type SlotPlacer = (
  args: DecorSlotArgs,
  parts: DecorPartList,
  name: string,
) => boolean;

function errorMessage(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Deterministic seeding — stable vehicle identity, never camo or entity ID.
// ---------------------------------------------------------------------------

function mulberry32(a: number): Rng {a|=0;return function(){a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);
  t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function decorIdentityFor(specId: string): string {
  // Keep the prototype hull-kit seed stable across its turret redesign.
  // Both Revolution variants choose their explicit manifests below.
  return specId === 'leo2_revolution_proto' ? 'leo2_revolution' : specId;
}

const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------
// Geometry helpers (self-contained twins of the tankFactory primitives —
// deliberately NOT imported from tankFactory: that module imports us).
// Segment counts run one notch under the hull builders': decoration is
// greeble-class and budgeted (~3k tris/tank).
// ---------------------------------------------------------------------------

function xform(
  geo: THREE.BufferGeometry,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  s: GeometryScale = 1,
): THREE.BufferGeometry {
  const sc = Array.isArray(s) ? s : [s, s, s];
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sc[0], sc[1], sc[2]),
  );
  geo.applyMatrix4(m);
  return geo;
}
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cylY = (rT: number, rB: number, h: number, seg = 10) => new THREE.CylinderGeometry(rT, rB, h, seg);
const cylX = (r: number, len: number, seg = 10, r2?: number) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, 0, 0, Math.PI / 2);
const cylZ = (r: number, len: number, seg = 10, r2?: number) => xform(cylY(r, r2 ?? r, len, seg), 0, 0, 0, Math.PI / 2, 0, 0);
const sph = (r: number, w = 9, h = 6) => new THREE.SphereGeometry(r, w, h);
const torus = (r: number, tube: number, seg = 10, tSeg = 5, arc = Math.PI * 2) =>
  xform(new THREE.TorusGeometry(r, tube, tSeg, seg, arc), 0, 0, 0, Math.PI / 2, 0, 0);
// torus in its native XY plane (vertical rings: bail handles, end loops)
const torusV = (r: number, tube: number, seg = 10, tSeg = 5, arc = Math.PI * 2) =>
  new THREE.TorusGeometry(r, tube, tSeg, seg, arc);
const lathe = (profile: readonly (readonly [number, number])[], seg = 16) =>
  new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y)), seg);

// World-scale box-projected UVs (same recipe as tankFactory.boxUV) so the
// shared weave/wood canvases keep a uniform texel density across pieces.
function boxUV(geo: THREE.BufferGeometry, scale = 1.1): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = pos.getX(i); v = pos.getZ(i); }
    else if (nx >= nz) { u = pos.getZ(i); v = pos.getY(i); }
    else { u = pos.getX(i); v = pos.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

const triCount = (geo: THREE.BufferGeometry) => ((geo.index ? geo.index.count : geo.attributes.position.count) / 3) | 0;

// Per-piece baked shade: tone jitter + a soft downward-face AO so merged
// families don't read as one flat injection-molded color (the same trick
// tankFactory.bakeDirt plays on the camo shells, minus the dust ramp).
function bakeShade(geo: THREE.BufferGeometry, tone = 1, ao = 0.3): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const nyv = nor.getY(i);
    const a = (1 - Math.max(0, -nyv) * ao) * (1 - Math.max(0, nyv) * ao * 0.25);
    col[i * 3] = tone * a; col[i * 3 + 1] = tone * a; col[i * 3 + 2] = tone * a;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Tinted variant (rgb multipliers) — one merged family can carry several
// authored colors (fuel-tan vs water-green jerrycans, helmet OD).
function bakeTint(geo: THREE.BufferGeometry, r: number, g: number, b: number, ao = 0.3): THREE.BufferGeometry {
  bakeShade(geo, 1, ao);
  const col = geo.attributes.color;
  for (let i = 0; i < col.count; i++) {
    col.setXYZ(i, col.getX(i) * r, col.getY(i) * g, col.getZ(i) * b);
  }
  return geo;
}

// shift/rotate every part of a kit in its local frame (builder helper)
function xformParts(parts: DecorPartList, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, from = 0): DecorPartList {
  for (let i = from; i < parts.length; i++) xform(parts[i].geo, x, y, z, rx, ry, rz);
  return parts;
}

function partsBBox(parts: DecorPartList): THREE.Box3 {
  const bb = new THREE.Box3();
  const t = new THREE.Box3();
  for (const p of parts) {
    p.geo.computeBoundingBox();
    if (p.geo.boundingBox) t.copy(p.geo.boundingBox);
    bb.union(t);
  }
  return bb;
}

/**
 * Build a stable surface frame for kits whose authored mounting plane is XY
 * and whose outward axis is local +Z. Local +Y stays as close to world-up as
 * the face permits, so a track run remains vertical on side/bow armor and
 * follows the uphill direction on a glacis.
 */
export function surfaceMountEuler(normal: THREE.Vector3): THREE.Euler {
  const n = normal.clone().normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const y = up.addScaledVector(n, -up.dot(n));
  if (y.lengthSq() < 1e-8) {
    const forward = new THREE.Vector3(0, 0, -1);
    y.copy(forward).addScaledVector(n, -forward.dot(n));
  }
  y.normalize();
  const x = new THREE.Vector3().crossVectors(y, n).normalize();
  y.crossVectors(n, x).normalize();
  const basis = new THREE.Matrix4().makeBasis(x, y, n);
  return new THREE.Euler().setFromRotationMatrix(basis, 'XYZ');
}

/**
 * Align a kit authored on the local XZ floor plane to a roof skin. The
 * optional yaw is applied around the kit's local up axis before that axis is
 * matched to the measured carrier normal, so the base remains flush even on
 * a subtly crowned or pitched roof.
 */
export function roofMountEuler(normal: THREE.Vector3, yaw = 0): THREE.Euler {
  const up = new THREE.Vector3(0, 1, 0);
  const n = normal.clone().normalize();
  const align = new THREE.Quaternion().setFromUnitVectors(up, n);
  const heading = new THREE.Quaternion().setFromAxisAngle(up, yaw);
  return new THREE.Euler().setFromQuaternion(align.multiply(heading), 'XYZ');
}

export function roofMountPosition(
  parts: DecorPartList,
  hit: SurfaceHit,
  embedM: number,
): THREE.Vector3 {
  const minY = partsBBox(parts).min.y;
  return hit.p.clone().addScaledVector(hit.n.clone().normalize(), -embedM - minY);
}

function surfaceMountPosition(
  parts: DecorPartList,
  hit: SurfaceHit,
  embedM: number,
): THREE.Vector3 {
  const minZ = partsBBox(parts).min.z;
  return hit.p.clone().addScaledVector(hit.n.clone().normalize(), -embedM - minZ);
}

// ---------------------------------------------------------------------------
// Shared canvas detail textures (lazy, module-cached, shared across tanks —
// textures MAY be shared; MATERIALS never are: the burn hook needs per-visual
// material instances).
// ---------------------------------------------------------------------------

const _texCache = new Map<string, THREE.CanvasTexture | null>();
function canvasTex(
  key: string,
  size: number,
  paint: (context: CanvasRenderingContext2D, size: number) => void,
): THREE.CanvasTexture | null {
  if (_texCache.has(key)) return _texCache.get(key)!;
  if (typeof document === 'undefined') { _texCache.set(key, null); return null; } // node safety
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const context = c.getContext('2d');
  if (!context) { _texCache.set(key, null); return null; }
  paint(context, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  _texCache.set(key, t);
  return t;
}

// woven canvas / burlap: two thread directions + macro tone blotches
function weaveTex() {
  return canvasTex('decor-weave', 128, (g, S) => {
    g.fillStyle = '#b9b2a4'; g.fillRect(0, 0, S, S);
    const rng = mulberry32(0x51ab);
    for (let y = 0; y < S; y += 2) {
      g.fillStyle = `rgba(60,52,40,${0.05 + 0.07 * ((y >> 1) & 1)})`;
      g.fillRect(0, y, S, 1);
    }
    for (let x = 0; x < S; x += 3) {
      g.fillStyle = 'rgba(255,250,240,0.06)';
      g.fillRect(x, 0, 1, S);
    }
    for (let i = 0; i < 26; i++) {
      const x = rng() * S, y = rng() * S, r = 8 + rng() * 26;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${rng() < 0.5 ? '30,26,18' : '235,228,210'},0.10)`);
      grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}

// crate wood: planks + grain
function woodTex() {
  return canvasTex('decor-wood', 128, (g, S) => {
    g.fillStyle = '#8d7a5e'; g.fillRect(0, 0, S, S);
    const rng = mulberry32(0x77d1);
    const plank = S / 4;
    for (let p = 0; p < 4; p++) {
      g.fillStyle = `rgba(70,50,28,${0.10 + rng() * 0.12})`;
      g.fillRect(0, p * plank, S, 2);
      for (let i = 0; i < 22; i++) {
        const y = p * plank + 3 + rng() * (plank - 5);
        g.strokeStyle = `rgba(${rng() < 0.6 ? '92,68,40' : '150,120,80'},${0.12 + rng() * 0.15})`;
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(0, y);
        for (let x = 0; x <= S; x += 16) g.lineTo(x, y + (rng() - 0.5) * 3);
        g.stroke();
      }
    }
  });
}

// Painted polymer / field-can finish: low-contrast dust bloom, tiny scuffs,
// and handling streaks. It stays deliberately close to neutral grey so the
// authored vertex color remains dominant instead of turning cargo graphic.
function fieldHardwareTex() {
  return canvasTex('decor-field-hardware', 128, (g, S) => {
    g.fillStyle = '#cbc9c1'; g.fillRect(0, 0, S, S);
    const rng = mulberry32(0x4a11c0);
    for (let i = 0; i < 180; i++) {
      const tone = rng() < 0.68 ? '72,68,60' : '236,232,220';
      g.fillStyle = `rgba(${tone},${0.025 + rng() * 0.04})`;
      const r = 0.4 + rng() * 1.4;
      g.fillRect(rng() * S, rng() * S, r, r * (0.55 + rng()));
    }
    for (let i = 0; i < 14; i++) {
      g.strokeStyle = `rgba(82,78,70,${0.025 + rng() * 0.025})`;
      g.lineWidth = 0.5 + rng();
      g.beginPath();
      const x = rng() * S, y = rng() * S;
      g.moveTo(x, y); g.lineTo(x + 7 + rng() * 16, y + (rng() - 0.5) * 4); g.stroke();
    }
  });
}

// camouflage netting: open diagonal mesh with garnish rags; alpha = holes
function netTex() {
  return canvasTex('decor-net', 128, (g, S) => {
    g.clearRect(0, 0, S, S);
    const rng = mulberry32(0x4e7a);
    g.strokeStyle = 'rgba(58,62,40,0.95)';
    g.lineWidth = 2;
    for (let d = -S; d < S * 2; d += 9) {
      g.beginPath(); g.moveTo(d, 0); g.lineTo(d + S, S); g.stroke();
      g.beginPath(); g.moveTo(d + S, 0); g.lineTo(d, S); g.stroke();
    }
    for (let i = 0; i < 170; i++) { // garnish scrim rags
      const x = rng() * S, y = rng() * S;
      g.fillStyle = rng() < 0.5 ? 'rgba(72,82,46,0.92)' : (rng() < 0.5 ? 'rgba(96,92,54,0.92)' : 'rgba(52,58,38,0.92)');
      g.save();
      g.translate(x, y); g.rotate(rng() * Math.PI);
      g.fillRect(-4 - rng() * 5, -2, 8 + rng() * 10, 4);
      g.restore();
    }
  });
}

// welded wire grid (bustle baskets / mesh cages): straight open cross-hatch
function gridTex() {
  return canvasTex('decor-grid', 64, (g, S) => {
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(70,74,78,0.98)';
    g.lineWidth = 1.6;
    for (let d = 0; d <= S; d += 8) {
      g.beginPath(); g.moveTo(d, 0); g.lineTo(d, S); g.stroke();
      g.beginPath(); g.moveTo(0, d); g.lineTo(S, d); g.stroke();
    }
  });
}

// ---------------------------------------------------------------------------
// Engine-context probe — the metrology/live discriminator.
//
// Same probe materials.js captureGlbEngineCtx uses: a REAL game context's
// setupShadowMaterial stamps USE_CSM onto a throwaway material. Metrology
// surfaces (procedural-fidelity lab & its geometry gate, shaded-parity
// boards, rig-QA pages) pass `(m) => m` stubs — decor auto-skips there so
// even the gate's REFERENCE builds (which don't pass proceduralOnly) can
// never wear kit. Pages with NO ctx at all (icon generator) are NOT
// metrology — they render the game's shipped look and stay decorated.
// ---------------------------------------------------------------------------

const CTX_PROBED = new WeakMap<ShadowEngineContext, boolean>(); // engineCtx -> boolean (real CSM ctx)
function releaseDecorationMaterial(engineCtx: ShadowEngineContext | null | undefined, material: THREE.Material): void {
  try { engineCtx?.releaseShadowMaterial?.(material); }
  finally { material.dispose(); }
}
function isRealShadowCtx(engineCtx: ShadowEngineContext | null | undefined): boolean {
  if (!engineCtx || typeof engineCtx.setupShadowMaterial !== 'function') return false;
  if (CTX_PROBED.has(engineCtx)) return CTX_PROBED.get(engineCtx) ?? false;
  let real = false;
  const probe = new THREE.MeshStandardMaterial();
  try {
    engineCtx.setupShadowMaterial(probe);
    real = !!(probe.defines && probe.defines.USE_CSM);
  } catch (e) { real = false; }
  finally { releaseDecorationMaterial(engineCtx, probe); }
  CTX_PROBED.set(engineCtx, real);
  return real;
}

/**
 * Should this build wear decorations?
 * @param {{proceduralOnly?:boolean, decor?:boolean}} opts createTank opts
 * @param {?object} engineCtx
 * @returns {boolean}
 */
export function resolveDecorMode(
  opts: DecorOptions = {},
  engineCtx: ShadowEngineContext | null = null,
): boolean {
  if (opts.decor === false) return false;          // explicit off
  if (opts.decor === true) return true;            // explicit on (decoration board)
  if (opts.proceduralOnly) return false;           // implicit metrology contract
  // auto: a ctx that OFFERS setupShadowMaterial but fails the CSM probe is a
  // measurement stub (fidelity lab / parity boards / thumb booth) — skip.
  // Real game ctx or no ctx at all (icon generator) -> decorate.
  if (engineCtx && typeof engineCtx.setupShadowMaterial === 'function' && !isRealShadowCtx(engineCtx)) {
    return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Per-visual decoration materials.
//
// Per-visual (never shared) because tankFactory.setDestroyed wraps every
// rendered material with THAT tank's burn driver — a shared material would
// trip applyBurnHook's ownership guard and drop the second tank's decor to
// the flat shared-burnt swap. The ambient-floor hook is chained through
// setupShadowMaterial on real contexts and assigned directly otherwise —
// byte-identical to the createTankMaterials pattern (same shared program
// cache key), so decor materials survive the same clone/CSM paths and stay
// readable in shade like the rest of the vehicle.
// ---------------------------------------------------------------------------

interface DecorMaterials {
  get(key: DecorMaterialKey): THREE.MeshStandardMaterial;
  all(): Partial<Record<DecorMaterialKey, THREE.MeshStandardMaterial>>;
}

const BASE_EQUIPMENT_PALETTE = Object.freeze({
  canvas: 0x746f58,
  burlap: 0x8a7857,
  steel: 0x34383a,
  net: 0x626b4e,
  mesh: 0x62665e,
  accent: [0.34, 0.34, 0.25],
  fuelA: [0.48, 0.40, 0.23],
  fuelB: [0.35, 0.38, 0.22],
  waterA: [0.12, 0.28, 0.42],
  waterB: [0.10, 0.24, 0.36],
  extinguisher: [0.58, 0.10, 0.065],
  toolCan: [0.34, 0.39, 0.23],
  ammoCase: [0.28, 0.34, 0.20],
} satisfies FleetEquipmentPalette);

const EQUIPMENT_PALETTE_OVERRIDES: Record<
  FleetEquipmentNationStyle,
  Partial<FleetEquipmentPalette>
> = Object.freeze({
  american: {
    canvas: 0x777158, burlap: 0x8d7854, steel: 0x3b3d3d, net: 0x687052,
    accent: [0.38, 0.35, 0.22], fuelA: [0.50, 0.40, 0.21], fuelB: [0.38, 0.36, 0.18],
    extinguisher: [0.62, 0.085, 0.055], ammoCase: [0.30, 0.35, 0.18],
  },
  british: {
    canvas: 0x696a50, burlap: 0x817052, steel: 0x343938, net: 0x59634a,
    accent: [0.29, 0.34, 0.22], fuelA: [0.34, 0.38, 0.22], fuelB: [0.27, 0.32, 0.19],
    toolCan: [0.29, 0.34, 0.21],
  },
  'east-asian': {
    canvas: 0x5d674f, burlap: 0x786b4d, steel: 0x303634, net: 0x536047,
    accent: [0.25, 0.34, 0.22], fuelA: [0.29, 0.36, 0.20], fuelB: [0.22, 0.30, 0.18],
    waterA: [0.10, 0.26, 0.34], waterB: [0.08, 0.22, 0.31],
  },
  french: {
    canvas: 0x746b55, burlap: 0x88765b, steel: 0x363a3d, net: 0x616951,
    accent: [0.31, 0.33, 0.27], fuelA: [0.41, 0.38, 0.25], fuelB: [0.31, 0.34, 0.24],
    waterA: [0.12, 0.26, 0.38], waterB: [0.10, 0.23, 0.34],
  },
  german: {
    canvas: 0x62665a, burlap: 0x7a705d, steel: 0x35393b, net: 0x59624f,
    accent: [0.28, 0.31, 0.27], fuelA: [0.34, 0.35, 0.25], fuelB: [0.26, 0.31, 0.23],
    extinguisher: [0.54, 0.075, 0.055], toolCan: [0.30, 0.34, 0.25],
  },
  israeli: {
    canvas: 0x80765f, burlap: 0x918064, steel: 0x3a3b38, net: 0x6d7058,
    accent: [0.38, 0.36, 0.28], fuelA: [0.44, 0.40, 0.27], fuelB: [0.36, 0.36, 0.25],
    waterA: [0.13, 0.27, 0.35], waterB: [0.11, 0.23, 0.31],
  },
  italian: {
    canvas: 0x6b6b4d, burlap: 0x857454, steel: 0x353936, net: 0x5c6449,
    accent: [0.31, 0.35, 0.22], fuelA: [0.38, 0.39, 0.21], fuelB: [0.29, 0.34, 0.18],
    toolCan: [0.31, 0.37, 0.20],
  },
  nordic: {
    canvas: 0x59645f, burlap: 0x716f5d, steel: 0x303638, net: 0x4f5f55,
    accent: [0.24, 0.31, 0.29], fuelA: [0.30, 0.35, 0.28], fuelB: [0.24, 0.31, 0.25],
    waterA: [0.11, 0.26, 0.37], waterB: [0.09, 0.23, 0.33],
  },
  polish: {
    canvas: 0x626751, burlap: 0x7c7154, steel: 0x333837, net: 0x566149,
    accent: [0.27, 0.34, 0.22], fuelA: [0.32, 0.37, 0.20], fuelB: [0.25, 0.32, 0.18],
    toolCan: [0.28, 0.35, 0.19],
  },
  soviet: {
    canvas: 0x596047, burlap: 0x75694c, steel: 0x303532, net: 0x505b42,
    accent: [0.24, 0.32, 0.18], fuelA: [0.28, 0.35, 0.18], fuelB: [0.22, 0.29, 0.16],
    waterA: [0.09, 0.25, 0.31], waterB: [0.075, 0.21, 0.27],
    extinguisher: [0.48, 0.105, 0.065], toolCan: [0.25, 0.34, 0.17], ammoCase: [0.24, 0.32, 0.17],
  },
  ukrainian: {
    canvas: 0x636b50, burlap: 0x7e7251, steel: 0x343836, net: 0x58654a,
    accent: [0.29, 0.35, 0.20], fuelA: [0.39, 0.38, 0.19], fuelB: [0.27, 0.34, 0.17],
    waterA: [0.10, 0.27, 0.42], waterB: [0.085, 0.23, 0.37],
    extinguisher: [0.51, 0.12, 0.065], toolCan: [0.27, 0.35, 0.18],
  },
  neutral: {},
});

export function fleetEquipmentNationStyle(nation = ''): FleetEquipmentNationStyle {
  if (/Ukraine/i.test(nation)) return 'ukrainian';
  if (/USSR|Russia/i.test(nation)) return 'soviet';
  if (/USA/i.test(nation)) return 'american';
  if (/UK/i.test(nation)) return 'british';
  if (/Germany/i.test(nation)) return 'german';
  if (/France/i.test(nation)) return 'french';
  if (/Italy/i.test(nation)) return 'italian';
  if (/Sweden/i.test(nation)) return 'nordic';
  if (/Poland/i.test(nation)) return 'polish';
  if (/Israel/i.test(nation)) return 'israeli';
  if (/China|Japan|South Korea/i.test(nation)) return 'east-asian';
  return 'neutral';
}

function equipmentPaletteForNation(nation = ''): FleetEquipmentPalette {
  return {
    ...BASE_EQUIPMENT_PALETTE,
    ...EQUIPMENT_PALETTE_OVERRIDES[fleetEquipmentNationStyle(nation)],
  };
}

function buildDecorMaterials(
  spec: FleetTankSpec,
  engineCtx: ShadowEngineContext | null | undefined,
): DecorMaterials {
  const equipmentPalette = equipmentPaletteForNation(spec.nation || '');
  const setup = isRealShadowCtx(engineCtx)
    ? (m: THREE.MeshStandardMaterial) => {
      engineCtx?.setupShadowMaterial?.(m, vehicleAmbientFloorHook);
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    }
    : (m: THREE.MeshStandardMaterial) => {
      m.onBeforeCompile = vehicleAmbientFloorHook;
      m.customProgramCacheKey = () => 'veh-ambient-floor-v2';
      return m;
    };

  const made: Partial<Record<DecorMaterialKey, THREE.MeshStandardMaterial>> = {};
  // garage parity (2026-09-13): the Garage exhibit worker builds the workshop
  // tanks with `decor: true` and no DOM, so every canvas-backed kit texture
  // threw "document is not defined" and the exhibits stood undressed. Without
  // a document the kits take flat colours (the workshop palette repaints the
  // transferred geometry anyway); with one nothing changes.
  const canPaint = typeof document !== 'undefined';
  const painted = <T extends THREE.MeshStandardMaterialParameters>(params: T): T => {
    if (canPaint) return params;
    const { map: _map, roughnessMap: _rough, ...flat } = params as T & { map?: unknown; roughnessMap?: unknown };
    return flat as T;
  };
  const defs: Record<DecorMaterialKey, () => THREE.MeshStandardMaterialParameters> = {
    // scheme-painted steel kit: the shared per-spec kit-paint canvas keeps
    // bolt-on hardware in the ACTIVE camo pattern's tonal family and live-
    // repaints with garage pattern switches (same texture the ARAT/stowage
    // add-on path uses — crews spray hard kit, never soft kit).
    kit: () => (canPaint ? {
      map: getKitPaintTexture(spec), roughnessMap: getSharedRoughnessTexture(spec),
      roughness: 0.86, metalness: 0.06, vertexColors: true, envMapIntensity: 0.35,
    } : { color: equipmentPalette.steel, roughness: 0.86, metalness: 0.06, vertexColors: true, envMapIntensity: 0.35 }),
    // dark oily gunmetal: MGs, cables, tools, shackles, track links
    steel: () => painted({
      color: equipmentPalette.steel, roughness: 0.62, metalness: 0.35,
      roughnessMap: canPaint ? getSharedRoughnessTexture(spec) : undefined,
      vertexColors: true, envMapIntensity: 0.35,
    }),
    wood: () => painted({
      map: woodTex(), color: 0x97815f, roughness: 0.9, metalness: 0.02,
      vertexColors: true, envMapIntensity: 0.15,
    }),
    canvas: () => painted({
      map: weaveTex(), color: equipmentPalette.canvas, roughness: 0.96, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.12,
    }),
    burlap: () => painted({
      map: weaveTex(), color: equipmentPalette.burlap, roughness: 0.98, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.1,
    }),
    rubber: () => ({
      color: 0x232425, roughness: 0.94, metalness: 0.04,
      vertexColors: true, envMapIntensity: 0.12,
    }),
    cans: () => painted({ // authored-color hardware (jerrycans): tint baked per piece
      map: fieldHardwareTex(), color: 0xffffff, roughness: 0.82, metalness: 0.07,
      roughnessMap: canPaint ? getSharedRoughnessTexture(spec) : undefined,
      vertexColors: true, envMapIntensity: 0.2,
    }),
    net: () => painted({
      map: netTex(), color: equipmentPalette.net, roughness: 0.95, metalness: 0.0,
      alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.1,
    }),
    mesh: () => painted({ // wire-grid panels (baskets, cages)
      map: gridTex(), color: equipmentPalette.mesh, roughness: 0.7, metalness: 0.35,
      alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.25,
    }),
    lens: () => ({ // optic faces / vision blocks / searchlight glass
      color: 0x161d23, roughness: 0.28, metalness: 0.6, envMapIntensity: 0.55,
      vertexColors: true,
    }),
    // fresh-cut branches: the trees lane's species spray atlas on alpha-cut cards (vehicleFoliage.ts); the map and
    // cut are set before the cascade setup runs, so the atlas gets its coverage-preserving mips
    foliage: () => painted({
      map: vehicleFoliageAtlas(FIELD_FOLIAGE[spec.id]?.kind ?? 'oak') ?? undefined, color: 0xffffff,
      roughness: 0.9, metalness: 0.0, alphaTest: FOLIAGE_ALPHA_TEST, side: THREE.DoubleSide,
      vertexColors: true, envMapIntensity: 0.1,
    }),
  };
  return {
    get(key: DecorMaterialKey) {
      if (!made[key]) {
        const def = { ...defs[key]() };
        if (!def.map) delete def.map; // node safety (no canvas available)
        const material = new THREE.MeshStandardMaterial(def);
        made[key] = material;
        setup(material);
        material.name = `Decor_${key}`;
      }
      return made[key]!;
    },
    all: () => made,
  };
}

// ---------------------------------------------------------------------------
// Accessory painter: routes the shared accessory builders (accessoryKits.ts) into
// this kit's material families with its tint / shade / UV conventions. No method
// draws from the stream: the near and coarse builds of one piece stay aligned.
// ---------------------------------------------------------------------------

/**
 * Cargo is seen beneath the same sun/IBL as the tank: raw near-primary tints read
 * as glossy toys on weathered armor. Keep the hue identity, lower the value and
 * pull only the brightest colours toward their neutral luminance (fade + grime);
 * a nation's equipment accent shifts every authored colour slightly.
 */
function mutedEquipmentTint(rgb: RGB, nation: string, palette: FleetEquipmentPalette): RGB {
  const countryTint = palette.accent;
  const countryMix = nation ? 0.16 : 0;
  const themed: RGB = [
    rgb[0] * (1 - countryMix) + countryTint[0] * countryMix,
    rgb[1] * (1 - countryMix) + countryTint[1] * countryMix,
    rgb[2] * (1 - countryMix) + countryTint[2] * countryMix,
  ];
  const peak = Math.max(themed[0], themed[1], themed[2], 0.0001);
  // linear-space vertex multipliers: keep peaks in the painted-hardware range
  const scale = Math.min(0.72, 0.18 / peak);
  const neutral = ((themed[0] + themed[1] + themed[2]) / 3) * scale;
  const fade = peak > 0.48 ? 0.28 : 0;
  return [
    themed[0] * scale * (1 - fade) + neutral * fade,
    themed[1] * scale * (1 - fade) + neutral * fade,
    themed[2] * scale * (1 - fade) + neutral * fade,
  ];
}

function accessoryPainter(parts: DecorPartList, rng: Rng, detail: 0 | 1, nation = ''): AccessoryPainter {
  const palette = equipmentPaletteForNation(nation);
  return {
    detail,
    rng,
    paint(geo, rgb, ao = 0.26) {
      const [r, g, b] = mutedEquipmentTint(rgb, nation, palette);
      parts.push({ mat: 'cans', geo: bakeTint(geo, r, g, b, ao) });
    },
    cloth(geo, tone = 0.75, rgb) {
      const uv = boxUV(geo, 2.5);
      parts.push({ mat: 'canvas', geo: rgb ? bakeTint(uv, rgb[0] * tone, rgb[1] * tone, rgb[2] * tone, 0.32) : bakeShade(uv, tone, 0.32) });
    },
    // Burlap shares the canvas draw (same weave map, near-identical finish): a warmer tint of the issue fabric.
    burlap(geo, tone = 0.9) { parts.push({ mat: 'canvas', geo: bakeTint(boxUV(geo, 2.8), 1.42 * tone, 1.16 * tone, 0.94 * tone, 0.3) }); },
    steel(geo, tone = 0.55) { parts.push({ mat: 'steel', geo: bakeShade(geo, tone) }); },
    wood(geo, tone = 0.8) { parts.push({ mat: 'wood', geo: bakeShade(boxUV(geo, 2.2), tone) }); },
    rubber(geo, tone = 0.6) { parts.push({ mat: 'rubber', geo: bakeShade(geo, tone) }); },
    kit(geo, tone = 0.92) { parts.push({ mat: 'kit', geo: bakeShade(geo, tone) }); },
    lens(geo) { parts.push({ mat: 'lens', geo: bakeShade(geo, 0.9) }); },
    net(geo, tone = 1) { parts.push({ mat: 'net', geo: bakeShade(boxUV(geo, 1.8), tone, 0.12) }); },
    leaves(geo) { parts.push({ mat: 'foliage', geo }); },
  };
}

// ---------------------------------------------------------------------------
// THE KIT LIBRARY.
//
// Every builder: ({ rng, ...params }) => [{ mat:<family>, geo }] in
// PIECE-LOCAL frame — origin at the SEAT (contact point), +Z the piece's
// forward, +Y up. The placer positions the parts on the tank and merges per
// material family. `parts.meta` may carry mount hints for the slot resolver.
// ---------------------------------------------------------------------------

export const DECOR_KITS: Record<string, DecorKitBuilder> = {

  // -- commander's cupola upgrade: raised vision-block ring ------------------
  cupola({ rng, v = 'ring' }) {
    const parts: DecorPartList = [];
    const tone = 0.92 + rng() * 0.14;
    if (v === 'ring') {              // low vision-block ring + closed lid
      const r = 0.30;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r * 0.94, 0], [r, 0.02], [r, 0.16], [r * 0.9, 0.19], [r * 0.62, 0.215], [0.001, 0.225]], 16), tone) });
      for (let i = 0; i < 7; i++) {   // vision blocks
        const a = (i / 7) * Math.PI * 2;
        parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.085, 0.05, 0.03), Math.sin(a) * (r - 0.006), 0.105, Math.cos(a) * (r - 0.006), 0, a, 0), 0.9) });
      }
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.02, 0.16), 0, 0.232, -0.1), tone) }); // lid hinge spine
    } else if (v === 'drum') {       // taller drum cupola (early pattern)
      const r = 0.27;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r, 0], [r, 0.24], [r * 0.93, 0.27], [r * 0.5, 0.30], [0.001, 0.305]], 16), tone) });
      for (let i = 0; i < 5; i++) {   // vision slits
        const a = (i / 5) * Math.PI * 2 + 0.3;
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.10, 0.035, 0.025), Math.sin(a) * r, 0.17, Math.cos(a) * r, 0, a, 0), 0.55) });
      }
    } else {                          // 'split': ring + open lid leaned on the hinge
      const r = 0.28;
      const lidR = r * 0.55;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r * 0.95, 0], [r, 0.05], [r, 0.13], [r * 0.6, 0.16], [0.001, 0.165]], 16), tone) });
      // lid disc pivoted AT ITS EDGE on the ring rim (open ~68 deg)
      const lid = cylY(lidR, lidR, 0.028, 12);
      xform(lid, 0, 0, lidR);                        // hinge at disc edge
      xform(lid, 0, 0, 0, -68 * D2R, 0, 0);          // swing open
      parts.push({ mat: 'kit', geo: bakeShade(xform(lid, 0, 0.165, -r * 0.72), tone * 1.05) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.07, 0.03, 0.05), 0, 0.155, -r * 0.8), 0.55) }); // hinge block
      parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.04, 0.01, 8, 4), 0, 0.17, r * 0.35), 0.55) }); // grab ring
    }
    return parts;
  },

  // -- openable-looking hatch cover with hinges -------------------------------
  hatch({ rng, v = 'round' }) {
    const tone = 0.9 + rng() * 0.16;
    const parts: DecorPartList = [];
    if (v === 'round') {
      const r = 0.25;
      parts.push({ mat: 'kit', geo: bakeShade(lathe([[r, 0], [r, 0.035], [r * 0.86, 0.055], [r * 0.3, 0.07], [0.001, 0.075]], 14), tone) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.028, 0.11), 0, 0.02, r * 0.9), 0.62) });    // hinge block
      parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.045, 0.011, 8, 4), 0, 0.078, -r * 0.4), 0.6) }); // grab ring
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.08, 0.02, 0.05), 0, 0.03, -r * 0.88), tone) });      // latch lug
    } else { // rect twin-panel
      const w = 0.42, d = 0.34;
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, 0.05, d), 0, 0.025, 0), tone) });
      for (const s of [-1, 1]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.02, 0.07, 6), s * w * 0.3, 0.03, d / 2 + 0.015), 0.6) });
      }
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.1, 0.022, 0.04), 0, 0.058, -d * 0.28), 0.65) });   // handle
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.09, 0.06, 0.09), w * 0.28, 0.08, d * 0.1), tone * 1.05) }); // periscope stub
    }
    return parts;
  },

  // -- roof AAMG: .50 M2 / DShK, pintle or ring, with/without gun shield ------
  // The fleet's one Browning-family construction (machineGunGeometry.ts, shared
  // with the profile fittings): bearing -> spindle -> fork -> trunnion, pressed
  // receiver, feed cover, spade grips, jacket and muzzle device per class, can
  // and belt. Weapon steel and ammunition stay gunmetal; the shield and ring
  // take the scheme's kit paint. Gun and shield stow ~7 deg muzzle-up about
  // the trunnion; the mount stays plumb.
  aamg({ rng, v = 'm2', shield = false, ring = false }) {
    const parts: DecorPartList = [];
    const tone = 0.56 + rng() * 0.06;
    const collector = {
      add(slot: string, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
        xform(geo, x, y, z, rx, ry, rz);
        const painted = slot === 'detail' || slot === 'hull';
        parts.push({ mat: painted ? 'kit' : 'steel', geo: bakeShade(geo, painted ? 0.92 : slot === 'shadow' ? 0.32 : tone) });
      },
    };
    const layout = createPintleLayout({
      cls: v === 'dshk' ? 'dshk' : 'm2', shield, ring: ring ? { r: 0.33, stubs: 4 } : false, ammo: true, tone: 'two-tone',
    }, collector);
    addPintleRing(layout);
    addPintleMount(layout);
    const gunFrom = parts.length;
    addPintleReceiver(layout);
    addPintleBarrel(layout);
    addPintleAmmo(layout);
    addPintleShield(layout);
    const pivotY = layout.colTop + 0.105 * layout.s, pivotZ = 0.065 * layout.s;
    for (let i = gunFrom; i < parts.length; i++) {
      xform(parts[i].geo, 0, -pivotY, -pivotZ);
      xform(parts[i].geo, 0, 0, 0, -7 * D2R, 0, 0);
      xform(parts[i].geo, 0, pivotY, pivotZ);
    }
    return parts;
  },

  // -- roof lights: IR searchlight (large/small) + convoy light ----------------
  light({ rng, v = 'ir_large' }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.12;
    if (v === 'convoy') {
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.02, 0.024, 0.1, 6), 0, 0.05, 0), 0.55) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.045, 0.09, 8), 0, 0.13, 0.008), tone) });
      parts.push({ mat: 'lens', geo: bakeShade(xform(cylZ(0.038, 0.012, 8), 0, 0.13, 0.056), 1) });
      return parts;
    }
    const R = v === 'ir_large' ? 0.19 : 0.115;   // drum radius
    const D = v === 'ir_large' ? 0.30 : 0.19;    // drum depth
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.16, 0.035, 0.16), 0, 0.018, 0), tone) }); // base plate
    for (const s of [-1, 1]) { // yoke arms — stop at the drum axle line
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.02, R + 0.045, 0.045), s * (R + 0.014), (R + 0.045) / 2 + 0.02, 0), 0.55) });
    }
    parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(R, D, 14), 0, R + 0.07, -D * 0.18), tone) });            // drum
    parts.push({ mat: 'steel', geo: bakeShade(xform(torus(R * 0.99, 0.014, 14, 4), 0, R + 0.07, D * 0.32, Math.PI / 2, 0, 0), 0.55) }); // face rim
    parts.push({ mat: 'lens', geo: bakeShade(xform(cylZ(R * 0.93, 0.018, 14), 0, R + 0.07, D * 0.325), 1) });   // glass
    if (v === 'ir_large') { // cable conduit
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.012, 0.012, R + 0.05, 5), R + 0.04, (R + 0.05) / 2, 0.03), 0.5) });
    }
    return parts;
  },

  // -- antenna set: whip short/long, star command antenna, helmet gag ----------
  antenna({ rng, v = 'whip_short', helmet = false }) {
    const parts: DecorPartList = [];
    parts.push({ mat: 'kit', geo: bakeShade(lathe([[0.045, 0], [0.05, 0.02], [0.03, 0.05], [0.022, 0.09]], 8), 0.85) });
    if (v === 'star') {
      const H = 1.15;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.008, 0.011, H, 5), 0, H / 2 + 0.08, 0), 0.5) });
      for (let i = 0; i < 6; i++) { // star tines
        const a = (i / 6) * Math.PI * 2;
        parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.004, 0.004, 0.34, 3), Math.sin(a) * 0.115, H + 0.06, Math.cos(a) * 0.115, Math.cos(a) * 0.62, 0, -Math.sin(a) * 0.62), 0.5) });
      }
    } else {
      const H = v === 'whip_long' ? 1.75 : 1.15;
      const lean = (rng() - 0.5) * 0.14;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.006, 0.012, H, 5), Math.sin(lean) * H * 0.4, H / 2 + 0.07, 0, 0, 0, lean), 0.5) });
      if (helmet) {
        parts.push({ mat: 'kit', geo: bakeTint(xform(sph(0.115, 9, 6), Math.sin(lean) * H * 0.78, H + 0.02, 0, 0, 0, 0, [1, 0.74, 1]), 0.55, 0.58, 0.42) });
      }
    }
    return parts;
  },

  // -- gunner's sight head / periscope hood ------------------------------------
  sight({ rng, v = 'peri' }) {
    const tone = 0.92 + rng() * 0.1;
    const parts: DecorPartList = [];
    if (v === 'peri') {
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.14, 0.09, 0.12), 0, 0.045, 0), tone) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.12, 0.05, 0.10), 0, 0.112, -0.012, -14 * D2R), tone) });
      parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.09, 0.028, 0.012), 0, 0.112, 0.05, -14 * D2R), 1) });
    } else { // 'doghouse' primary-sight hood
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.26, 0.14, 0.30), 0, 0.07, 0), tone) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.26, 0.09, 0.12), 0, 0.175, -0.07, -26 * D2R), tone) });
      parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.18, 0.05, 0.014), 0, 0.10, 0.152), 1) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.28, 0.016, 0.02), 0, 0.148, 0.14), 0.6) }); // brow rail
    }
    return parts;
  },

  // -- add-on applique armor plate (bolted) -------------------------------------
  applique({ rng, v = 'rect', w = 0.9, h = 0.5 }) {
    const parts: DecorPartList = [];
    const tone = 0.95 + rng() * 0.1;
    const t = 0.045;
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h, t), 0, h / 2, t / 2), tone) });
    if (v === 'wedge') {
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w * 0.78, h * 0.7, t), 0, h * 0.42, t * 1.45), tone * 1.03) });
    }
    const bx = w / 2 - 0.06, by = h - 0.06;
    for (const [px, py] of [[-bx, 0.06], [bx, 0.06], [-bx, by], [bx, by], [0, by], [0, 0.06]]) {
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.016, 0.02, 6), px, py, t + 0.008), 0.58) });
    }
    return parts;
  },

  // -- smoke grenade launcher cluster: 4/6/8 tubes, angled, turret-side --------
  smoke({ rng, v = '6', detail = 1 }) {
    const n = parseInt(v, 10) || 6;
    const tubeSeg = detail ? 8 : 6;
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.1;
    const rows = n > 6 ? 2 : 1;
    const per = Math.ceil(n / rows);
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(per * 0.082 + 0.06, 0.10, 0.06), 0, 0.05, -0.01), tone) }); // wedge bracket
    for (let i = 0; i < n; i++) {
      const row = (i / per) | 0;
      const k = i % per;
      const x = (k - (per - 1) / 2) * 0.082;
      const y = 0.115 + row * 0.078;
      const cant = (k - (per - 1) / 2) * 6 * D2R;   // fanned tubes
      const g = markSmokeTube(cylZ(0.032, 0.21, tubeSeg));
      xform(g, 0, 0, 0.075);                        // tube forward of its pivot
      // dark muzzle cap disc crisps the tube read at gameplay distance
      const cap = xform(cylZ(0.0335, 0.014, tubeSeg), 0, 0, 0.185);
      xform(g, 0, 0, 0, -34 * D2R, cant, 0);        // elevated + fanned
      xform(cap, 0, 0, 0, -34 * D2R, cant, 0);
      parts.push({ mat: 'kit', geo: bakeShade(xform(g, x, y, 0.02), tone * (0.94 + rng() * 0.1)) });
      // the dark muzzle cap shares the bank's kit draw (one resident draw per bank family)
      parts.push({ mat: 'kit', geo: bakeShade(xform(cap, x, y, 0.02), 0.32) });
    }
    return parts;
  },

  // -- stowage boxes: wood crate / steel bin / long fender box ------------------
  // Molded / pressed stock (accessoryPrimitives.moldedBox): filleted vertical
  // edges and bevelled rims, so the boxes catch a highlight on every edge.
  bin({ rng, v = 'steel', w = 0.55, h = 0.28, d = 0.4, detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.2;
    const seg = detail ? 2 : 1;
    if (v === 'crate') {
      parts.push({ mat: 'wood', geo: bakeShade(boxUV(place(moldedBox(w, h, d, 0.008, 1, 0.006), 0, h / 2, 0), 2.2), tone) });
      for (const sy of [0.14, 0.9]) { // batten frames
        parts.push({ mat: 'wood', geo: bakeShade(boxUV(place(moldedBox(w + 0.022, 0.035, d + 0.022, 0.006, 1, 0.005), 0, h * sy, 0), 2.2), 0.68) });
      }
    } else if (v === 'long') { // fender-length box with proud lid
      parts.push({ mat: 'kit', geo: bakeShade(place(moldedBox(w, h * 0.86, d, 0.018, seg, 0.01), 0, h * 0.43, 0), tone * 0.94) });
      parts.push({ mat: 'kit', geo: bakeShade(place(moldedBox(w * 1.012, h * 0.16, d * 1.03, 0.022, seg, 0.012), 0, h * 0.92, 0), 1.04) });
      if (detail) {
        for (const fx of [-w * 0.32, w * 0.32]) { // hasp straps over the lid lip
          parts.push({ mat: 'steel', geo: bakeShade(place(moldedBox(0.03, h * 0.42, 0.01, 0.003, 0, 0.002), fx, h * 0.74, d / 2 + 0.006), 0.6) });
        }
      }
    } else { // pressed steel bin, crowned lid + clasp
      parts.push({ mat: 'kit', geo: bakeShade(place(moldedBox(w, h * 0.8, d, 0.03, seg, 0.012), 0, h * 0.4, 0), 0.95 + (tone - 1) * 0.4) });
      parts.push({ mat: 'kit', geo: bakeShade(place(moldedBox(w * 1.01, h * 0.22, d * 1.02, 0.045, seg, h * 0.08), 0, h * 0.89, 0), 1.03) });
      if (detail) {
        parts.push({ mat: 'steel', geo: bakeShade(place(moldedBox(0.05, 0.05, 0.016, 0.006, 1, 0.003), 0, h * 0.8, d / 2 + 0.01), 0.6) });
        for (const fx of [-w * 0.34, w * 0.34]) {
          parts.push({ mat: 'steel', geo: bakeShade(roundBar([fx - 0.03, h * 1.0, -d / 2 - 0.004], [fx + 0.03, h * 1.0, -d / 2 - 0.004], 0.009, 6), 0.55) });
        }
      }
    }
    return parts;
  },

  // -- rolled tarp / canvas roll (accessoryKits.buildTarpRoll) -------------------
  tarp({ rng, v = 'fat', len = 0.9, detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.85 + rng() * 0.25;
    buildTarpRoll(accessoryPainter(parts, rng, detail), len, v === 'fat' ? 0.125 : 0.085, tone * 0.9);
    return parts;
  },

  // -- camo netting: rolled bundle or draped patch (accessoryKits) ---------------
  camonet({ rng, v = 'roll', len = 1.0, w = 0.9, detail = 1 }) {
    const parts: DecorPartList = [];
    const painter = accessoryPainter(parts, rng, detail);
    if (v === 'roll') buildNetRoll(painter, len, 0.6 + rng() * 0.1);
    else {
      const seed = rng() * 10;
      rng();
      buildNetDrape(painter, w, len, seed);
    }
    return parts;
  },

  // -- unditching log (rear-strapped beam, axis X) -------------------------------
  log({ rng, len = 2.4, detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.95 + rng() * 0.2;
    buildLog(accessoryPainter(parts, rng, detail), len, 0.115, tone, Math.floor(rng() * 97));
    return parts;
  },

  // -- soft stowage: rucksack / bedroll / duffel cluster (accessoryKits) --------
  packs({ rng, n = 3, detail = 1 }) {
    const parts: DecorPartList = [];
    const span = buildPackCluster(accessoryPainter(parts, rng, detail), n);
    xformParts(parts, -span / 2, 0, 0);
    return parts;
  },

  // -- loose crew cargo: 24 named, material-authored variants ---------------------
  // Molded cases, sewn bags, pressed cans and crates from accessoryKits.ts: lids,
  // handles, straps and latches stay separate members instead of becoming one
  // grey cuboid after merging. Every geometry still originates at its seat.
  cargo({ rng, v = 'beer-cooler-blue', scale = 1, nation = '', flat, detail = 1 }) {
    const variant = (FLEET_EQUIPMENT_VARIANTS as readonly string[]).includes(v)
      ? v as FleetEquipmentVariant : 'beer-cooler-blue';
    const parts: DecorPartList = [];
    buildCargoVariant(variant, accessoryPainter(parts, rng, detail, nation), equipmentPaletteForNation(nation), flat);
    const safeScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.72, 1);
    if (safeScale !== 1) {
      for (const part of parts) part.geo.scale(safeScale, safeScale, safeScale);
    }
    parts.meta = {
      w: 0.78 * safeScale,
      h: 0.58 * safeScale,
      d: 0.42 * safeScale,
    };
    return parts;
  },

  // -- turret bustle basket (open lattice + shaped soft contents) -------------------
  // Local frame: open face toward +Z (bolts to the bustle), extends -Z.
  basket({ rng, w = 1.2, d = 0.42, h = 0.34, detail = 1 }) {
    const parts: DecorPartList = [];
    const rod = Math.max(0.016, Math.min(0.026, Math.min(w, d, h) * 0.065));
    const st = (geo: THREE.BufferGeometry) => parts.push({ mat: 'steel', geo: bakeShade(geo, 0.5 + rng() * 0.06) });
    for (const y of [h * 0.3, h]) {          // rails
      st(xform(cylX(rod, w, 5), 0, y, -d));
      for (const s of [-1, 1]) st(xform(cylZ(rod, d, 5), s * w / 2, y, -d / 2));
    }
    for (let i = 0; i <= 4; i++) {           // verticals on the outer face
      st(xform(cylY(rod * 0.9, rod * 0.9, h, 4), -w / 2 + (i / 4) * w, h / 2, -d));
    }
    for (const s of [-1, 1]) st(xform(cylY(rod * 0.9, rod * 0.9, h, 4), s * w / 2, h / 2, -d * 0.04));
    // True open grids replace the old textured planes. Every aperture is
    // physical air, so rear and elevated views can see through the basket.
    const floorRows = Math.max(3, Math.min(7, Math.round(d / 0.10) + 1));
    for (let i = 0; i < floorRows; i++) {
      const z = -d + i * (d / (floorRows - 1));
      st(xform(cylX(rod * 0.62, w * 0.98, 5), 0, h * 0.30, z));
    }
    const floorCols = Math.max(4, Math.min(9, Math.round(w / 0.20) + 1));
    for (let i = 0; i < floorCols; i++) {
      const x = -w / 2 + i * (w / (floorCols - 1));
      st(xform(cylZ(rod * 0.62, d * 0.98, 5), x, h * 0.30, -d / 2));
    }
    const backCols = Math.max(5, Math.min(12, Math.round(w / 0.14)));
    for (let i = 1; i < backCols; i++) {
      const x = -w / 2 + i * (w / backCols);
      st(xform(cylY(rod * 0.52, rod * 0.52, h * 0.66, 4), x, h * 0.63, -d));
    }
    for (const y of [h * 0.45, h * 0.68, h * 0.90]) {
      st(xform(cylX(rod * 0.52, w * 0.98, 4), 0, y, -d));
    }
    for (const side of [-1, 1]) {
      const x = side * w / 2;
      st(xform(box(rod, rod, Math.hypot(h * 0.68, d) + rod), x,
        h * 0.64, -d / 2, Math.atan2(-h * 0.68, d), 0, 0));
      st(xform(box(rod, rod, Math.hypot(h * 0.68, d) + rod), x,
        h * 0.64, -d / 2, Math.atan2(h * 0.68, d), 0, 0));
      // Two feet visibly bridge the open basket into its host turret.
      st(xform(box(w * 0.14, 0.045, rod * 1.5), side * w * 0.31,
        h * 0.29, -rod * 0.6));
    }
    // Contents: two sewn duffels lying in the lattice and a tarp roll across the
    // top (accessoryKits), inside the lattice envelope.
    const painter = accessoryPainter(parts, rng, detail);
    const bagLen = Math.min(0.5, w * 0.4);
    const bagR = Math.min(0.11, h * 0.34, d * 0.26);
    for (const [x, tone, yaw] of [[-w * 0.22, 0.86, 0.12], [w * 0.24, 0.72, -0.1]] as const) {
      duffel(painter, bagLen, bagR, [x, h * 0.30 + rod * 0.6, -d * 0.5], yaw, tone, 500 + Math.round(x * 100));
    }
    const tarpR = Math.min(0.075, h * 0.22);
    const tarpParts: DecorPartList = [];
    buildTarpRoll(accessoryPainter(tarpParts, rng, detail), w * 0.58, tarpR, 0.8);
    xformParts(tarpParts, 0, h * 0.90 - tarpR, -d * 0.42);
    parts.push(...tarpParts);
    parts.meta = { basket: true, w, d, h };
    return parts;
  },

  // -- tow cable run with end loops (axis X; slots lay it fore-aft) ------------------
  cable({ rng, len = 2.2, sag = 0.05 }) {
    const parts: DecorPartList = [];
    const R = 0.032; // reads as a heavy wire rope at gameplay distance
    const pts = [];
    const seed = rng() * 6;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      pts.push(new THREE.Vector3(
        (t - 0.5) * len,
        R + 0.012 + Math.abs(Math.sin(t * 7 + seed)) * 0.02,   // lazy over-clamp lie
        Math.sin(t * Math.PI) * sag + Math.sin(t * 11 + seed) * 0.012,
      ));
    }
    parts.push({ mat: 'steel', geo: bakeShade(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 20, R, 5, false), 0.46) });
    for (const s of [-1, 1]) { // swaged eye loops + ferrules
      parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.07, 0.024, 10, 5), s * (len / 2 + 0.07), R + 0.01, 0), 0.52) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.04, 0.11, 7), s * (len / 2 - 0.02), R + 0.012, 0), 0.55) });
    }
    for (const s of [-0.3, 0, 0.31]) { // hull clamp blocks
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.06, 0.06, 0.055), s * len, 0.03, 0), 0.72) });
    }
    return parts;
  },

  // -- spare track link run (built flat in the X/Y plane, +Z outward) -----------------
  tracks({ rng, n = 5, linkW = 0.42 }) {
    const parts: DecorPartList = [];
    const pitch = 0.15;
    const linkH = pitch * 0.92;
    const runH = (n - 1) * pitch + linkH;
    // Two recessed carrier rails and four welded feet give every loose link a
    // continuous, visible load path into the host armor. Their outward faces
    // end at the authored mount plane (Z=0); the links sit immediately above.
    for (const x of [-linkW * 0.32, linkW * 0.32]) {
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.034, runH, 0.024), x, 0, -0.012), 0.72) });
    }
    for (const x of [-linkW * 0.32, linkW * 0.32]) {
      for (const y of [-runH * 0.42, runH * 0.42]) {
        parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.12, 0.038, 0.030), x, y, -0.015), 0.68) });
      }
    }
    for (let i = 0; i < n; i++) {
      const y = (i - (n - 1) / 2) * pitch;
      // Alternating tone + restrained per-link cant keeps the links distinct
      // without reopening the conspicuous stair-step gaps this carrier fixes.
      const tone = ((i % 2 ? 0.58 : 0.42) + rng() * 0.08) * 0.72;
      const cant = (rng() - 0.5) * 0.018;
      const from = parts.length;
      parts.push({ mat: 'steel', geo: bakeShade(box(linkW, linkH, 0.055), tone) });
      // twin center guide horns
      for (const hx of [-linkW * 0.13, linkW * 0.13]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.045, 0.07, 0.055), hx, 0, 0.055), tone * 0.85) });
      }
      // grouser bar proud across the pad face
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(linkW * 0.98, 0.034, 0.024), 0, -pitch * 0.24, 0.038), tone * 1.3) });
      // end connectors (pin bosses) at both edges
      for (const s of [-1, 1]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.026, 0.026, pitch * 0.94, 6), s * (linkW / 2 - 0.02), 0, 0.012), tone * 1.15) });
      }
      xformParts(parts, 0, y, 0.028, 0, 0, cant, from);
    }
    parts.meta = { runH, continuousCarrier: true };
    return parts;
  },

  // -- pioneer tools on fender clamps (laid along +Z, fanned across X) ---------------
  tools({ rng, set = ['shovel', 'axe', 'crowbar'], detail = 1 }) {
    const parts: DecorPartList = [];
    buildTools(accessoryPainter(parts, rng, detail), set);
    return parts;
  },

  // -- tow hooks / shackles (bolted to a vertical plate, +Z outward) ------------------
  shackles({ rng, v = 'hook' }) {
    const parts: DecorPartList = [];
    const tone = 0.55 + rng() * 0.1;
    if (v === 'hook') { // cast C-hook on a base plate
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.16, 0.16, 0.03), 0, 0, 0.015), 0.9) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.055, 0.022, 9, 5, Math.PI * 1.5), 0, -0.005, 0.075, 0, 0, -0.6), tone) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.026, 0.06, 7), 0, 0.045, 0.045), tone) });
    } else { // D-shackle + pin through welded lugs
      for (const s of [-1, 1]) {
        parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.028, 0.09, 0.075), s * 0.05, 0, 0.038), 0.88) });
      }
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.016, 0.15, 6), 0, 0.012, 0.075), tone) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.05, 0.016, 9, 4, Math.PI), 0, -0.005, 0.075, 0, 0, Math.PI), tone) });
    }
    return parts;
  },

  // -- external fuel drums --------------------------------------------------------
  // twin: two longitudinal 200 L drums as one piece, brackets down (deck-seat).
  // single: one TRANSVERSE drum (axis X), rear-plate cantilever mount. The drum
  // body is a lathe with rolled chimes and rolling hoops (accessoryKits.drum200).
  drums({ rng, v = 'twin', _W = 0, detail = 1 }) {
    const parts: DecorPartList = [];
    const painter = accessoryPainter(parts, rng, detail);
    const R = 0.28, L = 0.85;
    const drum = (cx: number, transverse: boolean) => {
      const tone = 0.86 + rng() * 0.18;
      drum200(painter, cx, transverse, tone);
      // cradle brackets + straps
      for (const b of [-L * 0.3, L * 0.3]) {
        const strap = transverse
          ? xform(torusV(R + 0.014, 0.009, detail ? 10 : 6, 3, Math.PI), cx + b, 0, 0, 0, Math.PI / 2, 0)
          : xform(torus(R + 0.014, 0.009, detail ? 10 : 6, 3, Math.PI), cx, 0, b, Math.PI / 2, 0, 0);
        parts.push({ mat: 'steel', geo: bakeShade(strap, 0.42) });
        const bx = transverse ? cx + b : cx;
        const bz = transverse ? 0 : b;
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.06, R * 0.5, 0.05), bx, -R * 0.72, bz), 0.45) });
      }
    };
    if (v === 'twin') {
      const cx = _W ? Math.max(R + 0.07, _W / 2 - R - 0.16) : R + 0.07;
      drum(-cx, false);
      drum(cx, false);
      parts.metaCx = cx;
    } else {
      drum(0, true);
    }
    // rebase: piece origin at the BRACKET BASE (drum axis at +R) so slots
    // seat it like every other kit
    xformParts(parts, 0, R + 0.01, 0);
    parts.meta = { mount: v === 'twin' ? 'deck' : 'rearFace', centerY: R + 0.01, clearY: R };
    return parts;
  },

  // -- jerrycan rack (fuel tan / water green), pressed 20 L cans ----------------------
  jerry({ rng, n = 2, water = true, detail = 1 }) {
    const parts: DecorPartList = [];
    const painter = accessoryPainter(parts, rng, detail);
    const pairedCount = Math.max(2, Math.ceil(n / 2) * 2);
    const pitch = 0.178;
    for (let i = 0; i < pairedCount; i++) {
      const x = (i - (pairedCount - 1) / 2) * pitch;
      const isWater = water && i >= pairedCount - 2;
      const tint: RGB = isWater ? [0.24, 0.30, 0.22] : [0.45, 0.37, 0.24];
      jerrycan(painter, x, tint, 1, i === 0 ? -1 : i === pairedCount - 1 ? 1 : 0);
    }
    const W = pairedCount * pitch + 0.05; // rack frame
    parts.push({ mat: 'steel', geo: bakeShade(place(moldedBox(W, 0.026, 0.39, 0, 0, 0.004), 0, 0.013, 0), 0.5) });
    for (const z of [-0.185, 0.185]) {
      parts.push({ mat: 'steel', geo: bakeShade(place(moldedBox(W, 0.045, 0.02, 0.004, 0, 0.003), 0, 0.28, z), 0.5) });
    }
    for (const sx of [-1, 1]) { // diagonal braces back to the hull plate
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.025, 0.3, 0.025), sx * W * 0.42, 0.13, -0.19, 0.6, 0, 0), 0.45) });
    }
    if (detail) painter.cloth(place(moldedBox(W + 0.01, 0.03, 0.012, 0, 0, 0.003), 0, 0.36, 0.2), 0.6, [0.5, 0.56, 0.44]);
    return parts;
  },

  // -- spare road wheel (radius matched to the tank's own gear) -----------------------
  wheel({ rng, r = 0.31, flat = true, rubberRim = true }) {
    const parts: DecorPartList = [];
    const W = Math.max(0.14, r * 0.42);
    const rimR = r * (rubberRim ? 0.8 : 0.95);
    parts.push({
      mat: 'kit',
      geo: bakeShade(lathe([
        [0.05, 0.005], [0.05, W * 0.3], [r * 0.35, W * 0.34], [r * 0.55, W * 0.16],
        [rimR, W * 0.42], [rimR, W * 0.9], [r * 0.4, W], [0.05, W],
      ], 16), 0.9 + rng() * 0.12),
    });
    if (rubberRim) {
      parts.push({ mat: 'rubber', geo: bakeShade(xform(cylY(r, r, W * 0.7, 16), 0, W * 0.6, 0), 1) });
    }
    for (let i = 0; i < 6; i++) { // hub bolts
      const a = (i / 6) * Math.PI * 2;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.02, 0.02, 0.03, 5), Math.sin(a) * r * 0.2, W + 0.008, Math.cos(a) * r * 0.2), 0.55) });
    }
    if (!flat) xformParts(parts, 0, r, -W / 2, Math.PI / 2, 0, 0); // upright against a plate
    return parts;
  },

  // -- exhaust shroud / muffler (axis Z along the fender) ------------------------------
  exhaust({ rng, v = 'muffler', len = 0.9 }) {
    const parts: DecorPartList = [];
    const tone = 0.7 + rng() * 0.15; // heat-scorched paint
    if (v === 'muffler') {
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.105, len, 12), 0, 0.105, 0), tone * 0.82) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.042, 0.22, 7), 0.015, 0.12, -len / 2 - 0.06, 0.5, 0, 0), 0.42) }); // tail kick
      for (const s of [-0.3, 0.3]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(torus(0.11, 0.01, 12, 4), 0, 0.105, s * len, Math.PI / 2, 0, 0), 0.4) });
      }
    } else { // perforated heat shield over a pipe
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.07, len, 9), 0, 0.09, 0), 0.4) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.105, len * 0.92, 9), 0, 0.105, 0), tone) });
      for (const s of [-0.25, 0.25]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.02, 0.09, 0.03), 0.1, 0.05, s * len), 0.45) });
      }
    }
    return parts;
  },

  // -- sandbag applique (glacis stack): filled bags with tied necks -------------------
  sandbags({ rng, rows = 2, perRow = 4, w = 1.2, detail = 1 }) {
    const parts: DecorPartList = [];
    const painter = accessoryPainter(parts, rng, detail);
    const draws: number[] = [];
    for (let r = 0; r < rows; r++) for (let i = 0; i < perRow - (r % 2); i++) draws.push(rng(), rng());
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const n = perRow - (r % 2);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (w / perRow);
        const tone = 0.78 + draws[k++] * 0.3;
        const roll = (draws[k++] - 0.5) * 0.3;
        sandbag(painter, (w / perRow) * 0.98, 0.24, 0.13, [x, r * 0.11, -r * 0.055], 0, roll, tone, 900 + r * 17 + i);
      }
    }
    return parts;
  },

  // -- welded patch plate (+Z outward) ------------------------------------------------
  patch({ rng, w = 0.5, h = 0.4 }) {
    const parts: DecorPartList = [];
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h, 0.024), 0, 0, 0.012), 1.03 + rng() * 0.06) });
    const bead = 0.016;
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(bead, w + 0.02, 5), 0, h / 2, 0.022), 0.72) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(bead, w + 0.02, 5), 0, -h / 2, 0.022), 0.72) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(bead, bead, h + 0.02, 5), w / 2, 0, 0.022), 0.72) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(bead, bead, h + 0.02, 5), -w / 2, 0, 0.022), 0.72) });
    return parts;
  },

  // -- slat / wire-mesh standoff armor section (modern; faces +Z, struts -Z) -----------
  slat({ rng, w = 1.5, h = 0.55, mesh = false }) {
    const parts: DecorPartList = [];
    const frame = 0.02;
    const st = (geo: THREE.BufferGeometry, t = 0.55) => parts.push({ mat: 'steel', geo: bakeShade(geo, t + rng() * 0.05) });
    st(xform(box(w, frame * 1.7, frame * 1.7), 0, h / 2, 0));
    st(xform(box(w, frame * 1.7, frame * 1.7), 0, -h / 2, 0));
    st(xform(box(frame * 1.7, h, frame * 1.7), -w / 2, 0, 0));
    st(xform(box(frame * 1.7, h, frame * 1.7), w / 2, 0, 0));
    if (mesh) {
      parts.push({ mat: 'mesh', geo: bakeShade(boxUV(new THREE.PlaneGeometry(w * 0.97, h * 0.94, 1, 1), 5.5), 0.85) });
    } else {
      const n = Math.max(5, Math.round(w / 0.115));
      for (let i = 1; i < n; i++) {
        st(xform(box(0.016, h * 0.94, 0.05), -w / 2 + (i / n) * w, 0, 0), 0.6);
      }
    }
    for (const s of [-0.38, 0.38]) { // standoff struts toward the hull
      st(xform(cylZ(0.016, 0.3, 5), s * w, 0, -0.16), 0.5);
    }
    return parts;
  },

  // -- barrel travel lock, stowed folded on the deck -----------------------------------
  travelLock({ rng }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.1;
    parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.14, 0.06, 0.12), 0, 0.03, 0), tone) });
    for (const s of [-1, 1]) { // folded A-frame arms lying aft
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylZ(0.024, 0.52, 7), s * 0.06, 0.075, -0.28, 0, s * 0.12, 0), tone) });
    }
    parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.055, 0.015, 9, 4, Math.PI), 0, 0.06, -0.52, 0, 0, Math.PI), 0.55) }); // saddle claw
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(0.015, 0.13, 5), 0, 0.05, 0.03), 0.55) });
    return parts;
  },

  // -- ration / small-stores case stack: banded fibreboard cases ------------------------
  rations({ rng, n = 2, detail = 1 }) {
    const parts: DecorPartList = [];
    const jitter: number[] = [];
    for (let i = 0; i < n; i++) jitter.push(rng(), rng(), rng(), rng());
    for (let i = 0; i < n; i++) {
      const [jx, jz, jy, jt] = jitter.slice(i * 4, i * 4 + 4);
      const w = 0.34 - i * 0.04, h = 0.14, d = 0.24;
      const y = 0.07 + i * 0.142;
      const box2 = place(moldedBox(w, h, d, 0.01, 1, 0.006), (jx - 0.5) * 0.05, y, (jz - 0.5) * 0.04, 0, (jy - 0.5) * 0.3, 0);
      parts.push({ mat: 'cans', geo: bakeTint(box2, 0.19 * (0.9 + jt * 0.2), 0.14 * (0.9 + jt * 0.2), 0.085, 0.3) });
      if (detail) {
        const band = place(moldedBox(w + 0.004, h + 0.004, 0.016, 0, 0, 0.002), (jx - 0.5) * 0.05, y, (jz - 0.5) * 0.04, 0, (jy - 0.5) * 0.3, 0);
        parts.push({ mat: 'steel', geo: bakeShade(band, 0.42) });
      }
    }
    return parts;
  },

  // -- bucket hung on a rear hook ---------------------------------------------------------
  bucket({ rng }) {
    const parts: DecorPartList = [];
    parts.push({ mat: 'steel', geo: bakeShade(lathe([[0.075, 0], [0.09, 0.02], [0.115, 0.20], [0.105, 0.21], [0.088, 0.205]], 11), 0.62 + rng() * 0.1) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(0.1, 0.007, 10, 4, Math.PI), 0, 0.21, 0), 0.5) }); // bail up
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.02, 0.06, 0.014), 0, 0.30, 0.02), 0.5) });          // hook tab
    return parts;
  },

  // -- fresh-cut branch bundle (proposal E, 2026-10-05): per-spec opt-in field camouflage ------
  foliage({ rng, v = 'upright', n = 5, detail = 1 }) {
    const parts: DecorPartList = [];
    buildBranchBundle(accessoryPainter(parts, rng, detail), v === 'lying' ? 'lying' : 'upright', n);
    return parts;
  },

  // -- chain segment hanging off a bow shackle --------------------------------------------
  chain({ rng, links = 6 }) {
    const parts: DecorPartList = [];
    for (let i = 0; i < links; i++) {
      const y = -i * 0.05;
      parts.push({
        mat: 'steel',
        geo: bakeShade(xform(torusV(0.026, 0.008, 8, 4), (rng() - 0.5) * 0.006, y, 0, 0, i % 2 ? Math.PI / 2 : 0, 0), 0.5),
      });
    }
    return parts;
  },
};

// Kit metadata for the catalog board / docs (era tags + variant lists).
export const DECOR_KIT_INFO = {
  cupola: { label: "Commander's cupola ring", eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'ring' }, { v: 'drum' }, { v: 'split' }] },
  hatch: { label: 'Hatch cover w/ hinges', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'round' }, { v: 'rect' }] },
  aamg: { label: 'Roof AA MG', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'm2' }, { v: 'm2', shield: true }, { v: 'dshk' }, { v: 'dshk', ring: true }] },
  light: { label: 'Roof light', eras: ['cold-war', 'modern'], variants: [{ v: 'ir_large' }, { v: 'ir_small' }, { v: 'convoy' }] },
  antenna: { label: 'Antenna set', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'whip_short' }, { v: 'whip_long' }, { v: 'star' }, { v: 'whip_short', helmet: true }] },
  sight: { label: 'Sight head / periscope', eras: ['cold-war', 'modern'], variants: [{ v: 'peri' }, { v: 'doghouse' }] },
  applique: { label: 'Add-on armor plate', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'rect' }, { v: 'wedge' }] },
  smoke: { label: 'Smoke launcher cluster', eras: ['cold-war', 'modern'], variants: [{ v: '4' }, { v: '6' }, { v: '8' }] },
  bin: { label: 'Stowage box', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'crate' }, { v: 'steel' }, { v: 'long', w: 1.1, h: 0.24, d: 0.3 }] },
  tarp: { label: 'Rolled tarp / canvas', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'fat' }, { v: 'thin' }] },
  camonet: { label: 'Camo net bundle', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'roll' }, { v: 'drape' }] },
  log: { label: 'Unditching log', eras: ['ww2', 'cold-war'], variants: [{}] },
  packs: { label: 'Rucksacks / bedrolls', eras: ['ww2', 'cold-war', 'modern'], variants: [{ n: 2 }, { n: 3 }, { n: 4 }] },
  cargo: { label: 'Crew cargo and field equipment', eras: ['ww2', 'cold-war', 'modern'], variants: FLEET_EQUIPMENT_VARIANTS.map((v) => ({ v })) },
  basket: { label: 'Bustle basket', eras: ['ww2', 'cold-war', 'modern'], variants: [{ w: 1.0 }, { w: 1.3 }] },
  cable: { label: 'Tow cable', eras: ['ww2', 'cold-war', 'modern'], variants: [{ len: 1.8 }, { len: 2.6 }] },
  tracks: { label: 'Spare track links', eras: ['ww2', 'cold-war', 'modern'], variants: [{ n: 4 }, { n: 6 }] },
  tools: { label: 'Pioneer tools', eras: ['ww2', 'cold-war', 'modern'], variants: [{ set: ['shovel', 'axe'] }, { set: ['shovel', 'sledge', 'crowbar'] }] },
  shackles: { label: 'Tow hooks / shackles', eras: ['ww2', 'cold-war', 'modern'], variants: [{ v: 'hook' }, { v: 'shackle' }] },
  drums: { label: 'External fuel drums', eras: ['ww2', 'cold-war'], variants: [{ v: 'single' }, { v: 'twin' }] },
  jerry: { label: 'Jerrycan rack', eras: ['ww2', 'cold-war', 'modern'], variants: [{ n: 2 }, { n: 3 }] },
  wheel: { label: 'Spare road wheel', eras: ['ww2', 'cold-war'], variants: [{ flat: true }, { flat: false }] },
  exhaust: { label: 'Exhaust shroud / muffler', eras: ['ww2', 'cold-war'], variants: [{ v: 'muffler' }, { v: 'shield' }] },
  sandbags: { label: 'Sandbag applique', eras: ['ww2'], variants: [{ rows: 2 }, { rows: 3, perRow: 5 }] },
  patch: { label: 'Welded patch plate', eras: ['ww2', 'cold-war'], variants: [{}] },
  slat: { label: 'Slat / mesh armor section', eras: ['modern'], variants: [{ mesh: false }, { mesh: true }] },
  travelLock: { label: 'Barrel travel lock (stowed)', eras: ['cold-war', 'modern'], variants: [{}] },
  rations: { label: 'Ration box stack', eras: ['ww2', 'cold-war', 'modern'], variants: [{ n: 2 }] },
  bucket: { label: 'Bucket', eras: ['ww2', 'cold-war'], variants: [{}] },
  chain: { label: 'Chain segment', eras: ['ww2', 'cold-war', 'modern'], variants: [{ links: 6 }] },
  foliage: { label: 'Fresh-cut branches (opt-in)', eras: ['modern'], variants: [{ v: 'upright', n: 5 }, { v: 'lying', n: 4 }] },
};

// ---------------------------------------------------------------------------
// ERA + MANIFESTS
// ---------------------------------------------------------------------------

export function decorEra(spec: FleetTankSpec): string {
  if (spec.era === VEHICLE_ERAS.COLD_WAR) return VEHICLE_ERAS.COLD_WAR;
  return isContemporaryVehicleEra(spec.era) ? VEHICLE_ERAS.MODERN : VEHICLE_ERAS.WORLD_WAR_II;
}

const SOVIET_RE = /USSR|Russia|China/i;
const US_RE = /USA/i;

// Slot grammar (resolved by the placement engine):
//   rearDeck | fender | glacis | glacisLow | hullSideTop | hullSide |
//   hullRear (drums) | hullRearLow | hullRearHang | hullRearCage | bowPair |
//   bowChain | turretRoof | turretRear | turretRearFrame | turretSide |
//   turretSidePlate | turretCheekPair
// Entries: { kit, p:probability, v:params, slot:[name, args] }. `p` rolls are
// drawn deterministically IN ORDER for every entry whether or not the piece
// lands, so one skip never reshuffles the rest of the tank.
interface DefaultManifestContext {
  era: string;
  soviet: boolean;
  american: boolean;
  casemate: boolean;
}

function appendDefaultTurretedManifest(
  manifest: DecorManifestRow[],
  spec: FleetTankSpec,
  rng: Rng,
  context: DefaultManifestContext,
): void {
  const { era, soviet, american } = context;
  manifest.push({ kit: 'packs', p: 0.85, v: { n: 2 + ((rng() * 2) | 0) }, slot: ['turretRear', {}] });
  manifest.push({ kit: 'tarp', p: 0.6, v: { v: rng() < 0.5 ? 'fat' : 'thin', len: 0.7 }, slot: ['turretSide', { side: rng() < 0.5 ? -1 : 1 }] });
  manifest.push({ kit: 'antenna', p: 0.9, v: { v: rng() < 0.25 && era !== 'ww2' ? 'whip_long' : 'whip_short', helmet: american && era === 'ww2' && rng() < 0.18 }, slot: ['turretRoof', { rear: true, side: 1 }] });
  if (era !== 'ww2') {
    manifest.push({ kit: 'smoke', p: 0.75, v: { v: rng() < 0.4 ? '4' : '6' }, slot: ['turretCheekPair', {}] });
    manifest.push({ kit: 'aamg', p: era === 'cold-war' ? 0.75 : 0.5, v: { v: soviet ? 'dshk' : 'm2', shield: rng() < 0.4, ring: !soviet && rng() < 0.3 }, slot: ['turretRoof', { rear: true, side: -1 }] });
    // Modern fleets carry thermal sights, not a bolt-on IR searchlight drum;
    // the generic drum read as an odd blue-lensed can on every X study.
    if (era !== 'modern') manifest.push({ kit: 'light', p: 0.35, v: { v: 'ir_small' }, slot: ['turretRoof', { rear: false, side: 1 }] });
  } else {
    manifest.push({ kit: 'aamg', p: american ? 0.65 : 0.2, v: { v: soviet ? 'dshk' : 'm2', shield: rng() < 0.3 }, slot: ['turretRoof', { rear: true, side: -1 }] });
    manifest.push({ kit: 'hatch', p: 0.4, v: { v: rng() < 0.6 ? 'round' : 'rect' }, slot: ['turretRoof', { rear: false, side: -1 }] });
  }
  manifest.push({ kit: 'tracks', p: era === 'ww2' ? 0.5 : 0.3, v: { n: 4, linkW: Math.min(0.5, spec.dims.widthM * 0.13) }, slot: ['turretSidePlate', { side: -1 }] });
  manifest.push({ kit: 'camonet', p: 0.45, v: { v: 'roll', len: 0.9 }, slot: ['turretRear', { low: true }] });
}

function appendDefaultCasemateManifest(
  manifest: DecorManifestRow[],
  rng: Rng,
  context: DefaultManifestContext,
): void {
  const { era, soviet } = context;
  manifest.push({ kit: 'antenna', p: 0.9, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] });
  manifest.push({ kit: 'aamg', p: era === 'ww2' ? 0.35 : 0.7, v: { v: soviet ? 'dshk' : 'm2', shield: rng() < 0.5 }, slot: ['turretRoof', { rear: true, side: -1 }] });
  manifest.push({ kit: 'packs', p: 0.8, v: { n: 2 }, slot: ['rearDeck', { spread: 0.4 }] });
  manifest.push({ kit: 'camonet', p: 0.5, v: { v: 'roll', len: 1.1 }, slot: ['rearDeck', {}] });
  // Fixed-bore vehicles keep the rear-deck travel lock outside the gun sweep.
  manifest.push({ kit: 'travelLock', p: 0.6, v: {}, slot: ['rearDeck', { center: true, back: true, small: true }] });
}

function appendDefaultTurretManifest(
  manifest: DecorManifestRow[],
  spec: FleetTankSpec,
  rng: Rng,
  context: DefaultManifestContext,
): void {
  if (context.casemate) appendDefaultCasemateManifest(manifest, rng, context);
  else appendDefaultTurretedManifest(manifest, spec, rng, context);
}

function appendDefaultHullManifest(
  manifest: DecorManifestRow[],
  spec: FleetTankSpec,
  rng: Rng,
  context: DefaultManifestContext,
): void {
  const { era, soviet, american } = context;
  manifest.push({ kit: 'cable', p: 0.85, v: { len: Math.min(2.6, spec.dims.hullLengthM * 0.36) }, slot: ['hullSideTop', { side: 1 }] });
  manifest.push({ kit: 'bin', p: 0.8, v: { v: era === 'ww2' ? 'crate' : 'long', w: era === 'ww2' ? 0.55 : 0.9, h: 0.24, d: 0.34 }, slot: ['fender', { side: -1, zFrac: -0.25 }] });
  manifest.push({ kit: 'tools', p: 0.75, v: { set: rng() < 0.5 ? ['shovel', 'axe'] : ['shovel', 'sledge', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.1, along: true }] });
  manifest.push({ kit: 'jerry', p: era === 'ww2' ? 0.6 : 0.45, v: { n: 2 + (rng() < 0.4 ? 1 : 0) }, slot: ['rearDeck', { corner: 1 }] });
  manifest.push({ kit: 'tarp', p: 0.7, v: { v: 'fat', len: Math.min(1.2, spec.dims.widthM * 0.35) }, slot: ['rearDeck', { corner: -1 }] });
  manifest.push({ kit: 'shackles', p: 0.9, v: { v: rng() < 0.5 ? 'hook' : 'shackle' }, slot: ['bowPair', {}] });
  // Spare links belong on WW2 and Cold War glacis plates. On a modern
  // composite glacis the centred five-link rack read as a louvered grille.
  if (era !== 'modern') manifest.push({ kit: 'tracks', p: era === 'ww2' ? 0.6 : 0.4, v: { n: 5, linkW: Math.min(0.5, spec.dims.widthM * 0.14) }, slot: ['glacis', {}] });
  if (soviet && era !== 'modern') {
    manifest.push({ kit: 'drums', p: 0.75, v: { v: rng() < 0.6 ? 'twin' : 'single' }, slot: ['hullRear', {}] });
    manifest.push({ kit: 'log', p: 0.6, v: { len: Math.min(2.8, spec.dims.widthM * 0.82) }, slot: ['hullRearLow', {}] });
  } else {
    manifest.push({ kit: 'wheel', p: 0.4, v: {}, slot: ['rearDeck', { corner: 1, back: true }] });
  }
  if (american && era === 'ww2') {
    manifest.push({ kit: 'sandbags', p: 0.45, v: { rows: 2, perRow: 4, w: spec.dims.widthM * 0.5 }, slot: ['glacisLow', {}] });
  }
  if (era === 'modern') {
    manifest.push({ kit: 'camonet', p: 0.4, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] });
    manifest.push({ kit: 'bin', p: 0.5, v: { v: 'steel', w: 0.5, h: 0.3, d: 0.4 }, slot: ['rearDeck', { corner: -1, back: true }] });
    manifest.push({ kit: 'applique', p: 0.3, v: { v: 'rect', w: 0.8, h: 0.42 }, slot: ['hullSide', { side: 1, zFrac: -0.05 }] });
  }
  manifest.push({ kit: 'bucket', p: era === 'modern' ? 0.15 : 0.35, v: {}, slot: ['hullRearHang', {}] });
  manifest.push({ kit: 'rations', p: 0.35, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] });
  manifest.push({ kit: 'chain', p: 0.3, v: { links: 5 }, slot: ['bowChain', {}] });
  // Decoration batch 2 (2026-09-15, triple-A program): era kits on the default load. The source-study
  // X profiles keep the rows above exactly — their silhouettes are gated against source-model masks.
  if (!isSourceStudy(spec)) appendEraHullKit(manifest, spec, rng, context);
}

/**
 * Source-study rebuilds (`*_x`) gate against source masks, and the renamed Revolution original keeps its
 * historical manifest and jitter streams: their stowage stays exactly as authored.
 */
function isSourceStudy(spec: FleetTankSpec): boolean {
  return /_x$/.test(spec.id) || spec.id === 'leo2_revolution_proto';
}

/**
 * Era-specific hull stowage beyond the common load (decoration batch 2): WW2 crews piled bedrolls on the
 * deck and lashed an unditching beam; Cold War fleets carried extra fuel on the deck and rolled nets on the
 * turret; modern crews stow packs on the turret side and bolt patch plates on the flanks. Every row reuses a
 * kit / station pairing the curated manifests already place.
 */
function appendEraHullKit(
  manifest: DecorManifestRow[],
  spec: FleetTankSpec,
  rng: Rng,
  context: DefaultManifestContext,
): void {
  const { era, soviet } = context;
  if (era === 'ww2') {
    manifest.push({ kit: 'packs', p: 0.45, v: { n: 3 }, slot: ['rearDeck', { spread: 0.4 }] });
    if (!soviet) manifest.push({ kit: 'log', p: 0.3, v: { len: Math.min(2.6, spec.dims.widthM * 0.78) }, slot: ['hullRearLow', {}] });
  } else if (era === 'cold-war') {
    manifest.push({ kit: 'jerry', p: 0.4, v: { n: 2 }, slot: ['rearDeck', { corner: -1, back: true }] });
    manifest.push({ kit: 'camonet', p: 0.3, v: { v: 'roll', len: 0.9 }, slot: ['turretSide', { side: 1 }] });
    if (!context.casemate) manifest.push({ kit: 'bin', p: 0.35, v: { v: 'steel', w: 0.6, h: 0.3, d: 0.4 }, slot: ['turretSide', { side: -1 }] });
  } else {
    if (!context.casemate) manifest.push({ kit: 'packs', p: 0.35, v: { n: 2 }, slot: ['turretSide', { side: rng() < 0.5 ? -1 : 1 }] });
    manifest.push({ kit: 'patch', p: 0.3, v: { w: 0.45, h: 0.4 }, slot: ['hullSide', { side: -1, zFrac: 0.15 }] });
    manifest.push({ kit: 'rations', p: 0.3, v: { n: 3 }, slot: ['rearDeck', { center: true, small: true }] });
  }
}

function defaultManifest(spec: FleetTankSpec, rng: Rng): DecorManifestRow[] {
  const context: DefaultManifestContext = {
    era: decorEra(spec),
    soviet: SOVIET_RE.test(spec.nation || ''),
    american: US_RE.test(spec.nation || ''),
    casemate: !!(spec.armor && spec.armor.turretless),
  };
  const manifest: DecorManifestRow[] = [];
  appendDefaultTurretManifest(manifest, spec, rng, context);
  appendDefaultHullManifest(manifest, spec, rng, context);
  return manifest;
}

/**
 * Fresh-cut branch camouflage (owner-approved proposal E, 2026-10-05): the 2022 war imagery shows Ukrainian, Russian
 * and Polish field vehicles hung with cut branches. Strictly per-spec opt-in; each listed hull names its region's
 * species (the trees lane's spray atlas) and carries bundles tucked at the turret's rear quarters and along a fender.
 * Suited hulls (ghillieSuit.ts) and the Garage workshop exhibits stay out of the list.
 */
const FIELD_FOLIAGE: Readonly<Record<string, { kind: VehicleFoliageKind }>> = Object.freeze({
  ua_t80bv: { kind: 'oak' }, ua_t80u_kursk: { kind: 'oak' }, ua_t84_oplot_m: { kind: 'oak' },
  ua_challenger2: { kind: 'oak' }, ua_m2a3_bradley: { kind: 'oak' },
  t72b3m: { kind: 'birch' }, t90m_proryv: { kind: 'birch' }, t90a: { kind: 'birch' },
  pt91m: { kind: 'beech' }, t72_rys: { kind: 'beech' }, t72m1_jaguar: { kind: 'beech' },
});

function fieldFoliageRows(spec: FleetTankSpec): DecorManifestRow[] {
  if (!FIELD_FOLIAGE[spec.id]) return [];
  return [
    { kit: 'foliage', p: 1, v: { v: 'upright', n: 5 }, slot: ['turretSide', { side: -1, rear: true }] },
    { kit: 'foliage', p: 1, v: { v: 'upright', n: 4 }, slot: ['turretSide', { side: 1, rear: true }] },
    { kit: 'foliage', p: 1, v: { v: 'lying', n: 4 }, slot: ['fender', { side: -1, zFrac: 0.12 }] },
  ];
}

// Curated per-tank manifests: marquee/composition tanks get an authored,
// period-documented loadout replacing the era default. Fleet profile agents
// may REQUEST changes here (docs/DECORATIONS.md carries the ask process) —
// this table is decorations-owned.
const TANK_MANIFESTS: Record<string, DecorManifestBuilder> = {
  // --- WW2 ---
  kv2: () => [
    { kit: 'drums', p: 1, v: { v: 'single' }, slot: ['hullRear', {}] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.6, h: 0.3, d: 0.45 }, slot: ['fender', { side: 1, zFrac: -0.3 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.2 }, slot: ['fender', { side: -1, zFrac: -0.25 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.55 }, slot: ['glacis', {}] },
    { kit: 'tools', p: 1, v: { set: ['sledge', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.25, along: true }] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'hatch', p: 1, v: { v: 'round' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'bucket', p: 1, v: {}, slot: ['hullRearHang', {}] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.2 }, slot: ['turretSide', { side: -1 }] },
  ],
  // --- Cold war ---
  m60a1: () => [
    { kit: 'aamg', p: 1, v: { v: 'm2', shield: true }, slot: ['turretRoof', { rear: true, side: -1 }] },
    // The native M60 builder owns one compact open-lattice bustle envelope
    // shared byte-for-byte by A1 and A3. Do not stack a second cosmetic
    // basket or floating onBasket packs over that load-bearing assembly.
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: 0.17 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe', 'crowbar'] }, slot: ['fender', { side: -1, zFrac: 0.05, along: true }] },
    { kit: 'bin', p: 1, v: { v: 'long', w: 1.0, h: 0.22, d: 0.3 }, slot: ['fender', { side: 1, zFrac: -0.25 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.15 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'tarp', p: 1, v: { v: 'thin', len: 0.8 }, slot: ['rearDeck', { center: true, back: true, small: true }] },
  ],
  type74: () => [
    { kit: 'aamg', p: 1, v: { v: 'm2' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'smoke', p: 1, v: { v: '6' }, slot: ['turretCheekPair', {}] },
    { kit: 'cable', p: 1, v: { len: 2.2 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  // The native 103A profile owns its secured starboard recovery rope. The
  // generic casemate manifest otherwise adds a second looped cable in the
  // garage; its side-placement fallback can stand that duplicate nearly
  // vertical, while procedural-only Gallery builds correctly omit it.
  // Preserve the rest of the deterministic cold-war dressing, but keep the
  // recovery rope canonical so both surfaces render the same assembly.
  strv103a: (spec, rng) => defaultManifest(spec, rng)
    .map((row) => (row.kit === 'cable' ? { ...row, p: 0 } : row)),
  // --- Modern ---
  leo2a4: () => [
    // The family profile owns the complete hull-and-turret ghillie suit.
    // Keep normal stowage here, but do not layer the old rectangular side
    // veils or tied rolls over its shaped, cut-out carrier meshes.
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.15 }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.5 }, slot: ['hullSideTop', { side: 1 }] },
  ],
  leo2a6: () => [
    { kit: 'basket', p: 1, v: { w: 1.5, d: 0.4, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.15, w: 0.95 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.55, h: 0.3, d: 0.4 }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: -0.17 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  k2: (s) => [
    { kit: 'basket', p: 1, v: { w: 1.3, d: 0.38, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.0, w: 0.85 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.5, h: 0.28, d: 0.38 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.2 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.44 }, slot: ['turretSidePlate', { side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'slat', p: 1, v: { w: Math.min(1.7, s.dims.widthM * 0.5), h: 0.5 }, slot: ['hullRearCage', {}] },
  ],
  m1a2: () => [
    { kit: 'basket', p: 1, v: { w: 1.4, d: 0.42, h: 0.32 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.1 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 3, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'rations', p: 1, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  m1a2_tusk: () => [
    // Urban hard kit only: no foliage or grass-like camouflage geometry.
    { kit: 'basket', p: 1, v: { w: 1.75, d: 0.48, h: 0.36 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 5 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.70, h: 0.36, d: 0.48 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 3, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.7 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe', 'crowbar'] }, slot: ['fender', { side: -1, zFrac: -0.05, along: true }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: 1 }] },
    { kit: 'rations', p: 1, v: { n: 3 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  m1a2_sepv2: () => [
    { kit: 'basket', p: 1, v: { w: 1.65, d: 0.46, h: 0.35 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.66, h: 0.34, d: 0.46 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 3, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.6 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'sledge'] }, slot: ['fender', { side: 1, zFrac: 0.12, along: true }] },
  ],
  m1a2_sepv3: () => [
    { kit: 'basket', p: 1, v: { w: 1.70, d: 0.47, h: 0.35 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.72, h: 0.35, d: 0.48 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.7 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_large' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.10, along: true }] },
    { kit: 'rations', p: 1, v: { n: 3 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  // tank decoration batch 1 (2026-09-13, owner: "decorations on par with World
  // of Tanks"): the modern heroes that still drew the probabilistic default
  // now carry their real stowage plans, deterministic like the other heroes.
  challenger2: () => [
    { kit: 'basket', p: 1, v: { w: 1.6, d: 0.45, h: 0.32 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.1 }, slot: ['turretRear', { low: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.6, h: 0.3, d: 0.42 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.6 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.10, along: true }] },
  ],
  challenger_3: () => [
    { kit: 'basket', p: 1, v: { w: 1.6, d: 0.45, h: 0.32 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.6, h: 0.3, d: 0.42 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['rearDeck', { corner: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.6 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.10, along: true }] },
    { kit: 'rations', p: 1, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] },
  ],
  leclerc: () => [
    { kit: 'basket', p: 1, v: { w: 1.4, d: 0.42, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'smoke', p: 1, v: { v: '6' }, slot: ['turretCheekPair', {}] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.0, w: 0.85 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.55, h: 0.3, d: 0.4 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: -0.17 }] },
    { kit: 'cable', p: 1, v: { len: 2.3 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  leclerc_xlr: (s) => [
    { kit: 'basket', p: 1, v: { w: 1.4, d: 0.42, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'smoke', p: 1, v: { v: '6' }, slot: ['turretCheekPair', {}] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.0, w: 0.85 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.55, h: 0.3, d: 0.4 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: -0.17 }] },
    { kit: 'cable', p: 1, v: { len: 2.3 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'slat', p: 1, v: { w: Math.min(1.7, s.dims.widthM * 0.5), h: 0.5 }, slot: ['hullRearCage', {}] },
  ],
  t14: (s) => [
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.7, h: 0.32, d: 0.42 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.7, h: 0.32, d: 0.42 }, slot: ['turretSide', { side: -1 }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'slat', p: 1, v: { w: Math.min(1.7, s.dims.widthM * 0.5), h: 0.5 }, slot: ['hullRearCage', {}] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'crowbar'] }, slot: ['fender', { side: -1, zFrac: -0.20, along: true }] },
  ],
  kf51: () => [
    { kit: 'basket', p: 1, v: { w: 1.5, d: 0.4, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.6, h: 0.3, d: 0.4 }, slot: ['turretSide', { side: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: 1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  kf51b: () => [
    { kit: 'basket', p: 1, v: { w: 1.5, d: 0.4, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.6, h: 0.3, d: 0.4 }, slot: ['turretSide', { side: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: 1 }] },
    { kit: 'jerry', p: 1, v: { n: 2, water: true }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
  ],
  type10: () => [
    { kit: 'basket', p: 1, v: { w: 1.3, d: 0.36, h: 0.28 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 2 }, slot: ['turretRear', { onBasket: true }] },
    { kit: 'camonet', p: 1, v: { v: 'drape', len: 0.9, w: 0.8 }, slot: ['rearDeck', { center: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.5, h: 0.28, d: 0.36 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'cable', p: 1, v: { len: 2.0 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'tracks', p: 1, v: { n: 3, linkW: 0.42 }, slot: ['turretSidePlate', { side: -1 }] },
  ],
  t90m: () => [
    { kit: 'log', p: 1, v: { len: 2.6 }, slot: ['hullRearLow', {}] },
    { kit: 'drums', p: 1, v: { v: 'twin' }, slot: ['hullRear', {}] },
    { kit: 'cable', p: 1, v: { len: 2.3 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['turretRear', { low: true }] },
    { kit: 'bin', p: 1, v: { v: 'steel', w: 0.5, h: 0.26, d: 0.36 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_long' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
  ],
};

/** Resolve the manifest rows for one spec (curated table or era default). */
export function decorManifestFor(spec: FleetTankSpec, rng: Rng): DecorManifestRow[] {
  // These concepts own their complete stowage and mounts. Generic aft cargo
  // falls behind the native fuel drums, outside any physical support.
  if (NATIONAL_MODERNIZATION_IDS.some(id=>id===spec.id)||NATIONAL_LEGACY_IDS.some(id=>id===spec.id)) return [];
  // AMX-10P photo-authored turret/coax configurations own their fittings.
  // Random roof guns and crates would change the real equipment and silhouette.
  if (spec.id === 'amx10p' || spec.id === 'amx10p_25') return [];
  // The pitching battery and retained Tagil chassis already own their fittings.
  // Turret-roof hatches/whips would be mounted on the moving launcher instead.
  if (spec.id === 'tos1a_tagil') return [];
  // These source-study profiles already own their complete equipment and
  // open racks. Preserve their authored cargo without a random overlay.
  // Originals and unrelated X studies keep their existing loadouts.
  if (['m1a2_x', 'm1a2_tusk_x', 'm1a2_sepv2_x', 'm1a2_sepv3_x', 'ua_m1a1_x'].includes(spec.id)) return [];
  // The Type 100 is authored complete from the owner's reference renders (2026-09-16): pods, weapon
  // station, whips, sensor cubes, hatches and grilles, with a clean deck. The generic field load hung a
  // steel bin and jerrycans behind the stern and a canvas roll on the deck, which the renders never show.
  if (spec.id === 'type100' || spec.id === 'ztz100_x' || spec.id === 'ztz100_prototype' || spec.id === 'object695_x') return [];
  // The source-authored Revolution already carries its complete SEOSS,
  // RCWS, hatch, smoke, cable and service package. Generic coolers/crates
  // on this low roof obscure that equipment and the large EMES recess.
  // The redesigned ancestor also owns its complete turret equipment. Keep
  // generic coolers, rangefinders and duplicate weapons off both roofs.
  if (spec.id === 'leo2_revolution' || spec.id === 'leo2_revolution_proto') return [
    { kit: 'tools', p: 1, v: { set: ['shovel', 'crowbar'] },
      slot: ['fender', { side: -1, zFrac: -0.31, along: true }] },
  ];
  const decorId = decorIdentityFor(spec.id);
  const curated = TANK_MANIFESTS[decorId];
  // Give every playable a visible, deterministic field load rather than one
  // tiny hash-selected object that can disappear behind a bustle. Seven
  // station-aware pieces occupy the bustle, rear turret roof, engine deck,
  // and hull rear rack. Pools are deliberately disjoint:
  // a soft bag belongs on armor, paired cans sit at a rack/fender station,
  // and hard cases remain horizontal. Keeping these first in the manifest
  // guarantees the common fleet vocabulary before optional curated clutter.
  const side = (fnv1a(`${decorId}:fleet-cargo-side`) & 1) ? 1 : -1;
  const hardCases = [
    'beer-cooler-blue', 'cooler-red', 'insulated-chest-olive',
    'fifty-cal-ammo-can', 'wood-ammo-crate', 'ration-case', 'medical-case',
    'mechanics-tool-chest', 'spare-optics-case', 'thermos-crate',
  ] as const satisfies readonly FleetEquipmentVariant[];
  const softStowage = [
    'long-duffel', 'large-rucksack', 'bedroll-pair', 'folded-tarp-pack',
    'camo-net-bag', 'crew-backpack',
  ] as const satisfies readonly FleetEquipmentVariant[];
  const serviceGear = [
    'soviet-tool-can', 'fire-extinguisher', 'cable-reel', 'helmet-bundle',
    'folding-chair',
  ] as const satisfies readonly FleetEquipmentVariant[];
  const pairedCans = [
    'nato-fuel-can', 'blue-water-can', 'twin-can-cradle',
  ] as const satisfies readonly FleetEquipmentVariant[];
  const nationStyle = fleetEquipmentNationStyle(spec.nation || '');
  const nationPhase = [
    'american', 'british', 'east-asian', 'french', 'german', 'israeli',
    'italian', 'nordic', 'polish', 'soviet', 'ukrainian', 'neutral',
  ].indexOf(nationStyle);
  const choose = <T extends readonly FleetEquipmentVariant[]>(pool: T, salt: string, offset = 0) =>
    pool[(fnv1a(`${decorId}:${salt}`) + nationPhase + offset) % pool.length];
  // Challenger 3 already fills the Garage card with its long gun, bustle and
  // roof sensors. Keep the same seven-piece vocabulary, but make the portable
  // field items slightly more compact so aft stowage does not force an
  // out-of-family portrait crop.
  const cargoScale = spec.id === 'challenger_3' ? 0.85
    : spec.id === 'ztz85_iii' ? 0.94
      : 1;
  const cargoVariant = (v: FleetEquipmentVariant) => ({
    v,
    scale: cargoScale,
    nation: spec.nation || '',
    ...(v === 'fire-extinguisher' ? { flat: true } : {}),
  });
  const aftRoutes = (seatSide: number, xOffset = 0): Array<[string, DecorSlotArgs]> => [
    ['turretRear', { side: seatSide }],
    ['turretRoof', { rear: true, side: seatSide }],
    ['rearDeck', { corner: seatSide, back: true, small: true }],
    ['hullRearRack', { x: seatSide * (0.12 + xOffset) }],
    ['rearDeck', { center: true, back: true, small: true }],
    ['turretSide', { side: seatSide, rear: true }],
    ['fender', { side: seatSide, zFrac: -0.30, small: true }],
  ];
  const hardCaseRoutes = (seatSide: number, xOffset = 0): Array<[string, DecorSlotArgs]> => (
    spec.id === 'm48'
      ? [
        ['hullRearRack', { x: seatSide * (0.12 + xOffset) }],
        ['rearDeck', { corner: seatSide, back: true, small: true }],
        ['rearDeck', { center: true, back: true, small: true }],
        ['fender', { side: seatSide, zFrac: -0.30, small: true }],
      ]
      : aftRoutes(seatSide, xOffset)
  );
  // Hull-only service routes keep the rear rack as the preferred station and
  // never climb onto the turret.
  const hullServiceRoutes = (seatSide: number, xOffset = 0): Array<[string, DecorSlotArgs]> => {
    const routes = aftRoutes(seatSide, xOffset).filter(([slot]) => !slot.startsWith('turret'));
    return [...routes.filter(([slot]) => slot === 'hullRearRack'), ...routes.filter(([slot]) => slot !== 'hullRearRack')];
  };
  const strvRoofRoutes = (x: number, z: number): Array<[string, DecorSlotArgs]> => [
    ['hullRoof', { x, z }],
  ];
  const normalPairedCanRoutes: Array<[string, DecorSlotArgs]> = [
      ['hullRearRack', { x: side * 0.22 }],
      ['turretRear', { side: -side }],
      ['rearDeck', { corner: side, back: true, small: true }],
      ['turretRoof', { rear: true, side }],
      ['rearDeck', { center: true, back: true, small: true }],
      ['turretSide', { side, rear: true }],
      ['fender', { side, zFrac: -0.32, small: true }],
  ];

  // The Ukrainian M1A1's field-built anti-drone cage and profile-authored
  // fittings already define its silhouette. Keep only one paired fuel-can
  // cradle from the generic loose-cargo layer; chairs, coolers, cases, bags,
  // tools and duplicate roof equipment would clutter or snag on the cage.
  if (spec.id === 'ua_m1a1') {
    return [{
      kit: 'cargo', p: 1,
      v: cargoVariant('twin-can-cradle'),
      slot: ['fleetCargo', { routes: [
        ['hullRearRack', { x: side * 0.22 }],
        ['rearDeck', { corner: side, back: true, small: true }],
        ['rearDeck', { center: true, back: true, small: true }],
        ['fender', { side, zFrac: -0.32, small: true }],
      ] }],
    }];
  }

  const base = curated ? curated(spec, rng) : defaultManifest(spec, rng);
  // Viper's tall launcher makes the old upright fallback conspicuous. Its
  // towing cable has a dedicated, armor-seated run along the hull side.
  if (spec.id === 'griffin_viper') {
    for (const row of base) if (row.kit === 'cable') row.slot = ['hullSideCable', { side: 1 }];
  }
  const serviceItem = choose(serviceGear, 'fender-service');
  const cargo: DecorManifestRow[] = [
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(hardCases, 'deck-case')),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(0.65, -1.45) : hardCaseRoutes(side, 0.12) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(softStowage, 'bustle-soft')),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-0.25, -1.45) : aftRoutes(-side, 0.12) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(serviceItem),
      // A fire extinguisher lies in a hull rack or on the deck; laid across
      // the turret roof it read as a red drum with a blue lens.
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-1.05, -1.30)
        : serviceItem === 'fire-extinguisher' && decorEra(spec) === VEHICLE_ERAS.MODERN
          ? hullServiceRoutes(-side, 0.22)
          : aftRoutes(-side, 0.22) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(pairedCans, 'rear-cans')),
      // The 103B has no rotating turret: its water-can cradle sits at the
      // exact roof point supplied by Gallery surface markup.
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-0.80, -0.20) : normalPairedCanRoutes }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(hardCases, 'deck-case', 3)),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(1.15, -1.00) : hardCaseRoutes(-side, 0.02) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(serviceGear, 'fender-service', 2)),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(0.85, -0.30) : aftRoutes(side, 0.22) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(softStowage, 'bustle-soft', 2)),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-0.25, -0.85) : aftRoutes(side, 0.02) }],
    },
  ];
  // opt-in branch bundles take their seats before loose cargo crowds the turret's rear quarters
  const manifest = [...fieldFoliageRows(spec), ...cargo, ...base];
  if (spec.id === 'ares_apc_x') {
    // The tiny remote station is not a turret-bustle cargo shelf. The three
    // procedural soft packs read as sandbags perched on its weapon housing.
    return manifest.filter(row => row.kit !== 'packs' && row.kit !== 'sandbags'
      && !(row.kit === 'cargo' && softStowage.includes(row.v?.v as typeof softStowage[number]))
      && !(['tarp', 'camonet'].includes(row.kit) && row.slot[0].startsWith('turret')));
  }
  return manifest;
}

// ---------------------------------------------------------------------------
// PLACEMENT ENGINE
// ---------------------------------------------------------------------------

const DECOR_LOD_DIST = 150; // same greeble horizon tankFactory uses
/** Past this camera range each cosmetic material family draws its coarse forms (fewer segments, no small hardware). */
const DECOR_COARSE_DIST = 28;
const GEAR_NAME_RE = /wheel|sprocket|idler|roller|road|track|tread/i;

// probe target collector: visible, color-writing, non-instanced meshes under
// `group`, excluding running gear (by name), decor itself, and LOD levels > 0.
function probeTargets(group: THREE.Group): SurfaceMesh[] {
  const out: SurfaceMesh[] = [];
  group.updateWorldMatrix(true, false);
  const visit = (o: THREE.Object3D): void => {
    if (o.visible === false) return;
    if (o.name && o.name.startsWith('rig_decor')) return;
    if (o instanceof THREE.LOD) { if (o.levels.length && o.levels[0].object) visit(o.levels[0].object); return; }
    if (o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.geometry) {
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      if (m && m.colorWrite !== false && !GEAR_NAME_RE.test(o.name || '')
          && !Array.isArray(o.material)) out.push(o as SurfaceMesh);
    }
    for (const c of o.children) visit(c);
  };
  for (const c of group.children) visit(c);
  for (const o of out) o.updateWorldMatrix(true, false);
  return out;
}

// Decoration slots fire many axis-aligned surface rays at the same finished
// hull/turret meshes. THREE.Mesh.raycast correctly evaluates them, but each
// call walks every triangle again. A detailed procedural shell can contain
// tens of thousands of triangles, turning deterministic cosmetic seating
// into the largest cold garage-build stage.
//
// Build three short-lived projected grids (XZ for top rays, YZ for side rays,
// XY for front/rear rays). Candidate hits still use THREE.Ray.intersectTriangle
// with the source mesh's exact vertex order and material-side rule; only the
// obviously unrelated triangles are skipped. The index dies as soon as the
// decoration build returns, so it adds no resident battle/garage memory.
const AXIS_GRID_MIN = 12;
const AXIS_GRID_MAX = 32;
const AXIS_GRID_MAX_CELLS_PER_TRIANGLE = 96;
const AXIS_GRID_EPS = 1e-9;

function projectedGrid(
  minU: number,
  maxU: number,
  minV: number,
  maxV: number,
  size: number,
): ProjectedGrid {
  const spanU = Math.max(1e-6, maxU - minU);
  const spanV = Math.max(1e-6, maxV - minV);
  return {
    minU, maxU, minV, maxV, size,
    scaleU: size / spanU,
    scaleV: size / spanV,
    cells: new Array(size * size),
    broad: [],
  };
}

function projectedCell(grid: ProjectedGrid, u: number, v: number): number[] | null {
  if (u < grid.minU - AXIS_GRID_EPS || u > grid.maxU + AXIS_GRID_EPS
      || v < grid.minV - AXIS_GRID_EPS || v > grid.maxV + AXIS_GRID_EPS) return null;
  const x = Math.min(grid.size - 1,
    Math.max(0, Math.floor((u - grid.minU) * grid.scaleU)));
  const y = Math.min(grid.size - 1,
    Math.max(0, Math.floor((v - grid.minV) * grid.scaleV)));
  return grid.cells[y * grid.size + x] || null;
}

function addProjectedTriangle(
  grid: ProjectedGrid,
  minU: number,
  maxU: number,
  minV: number,
  maxV: number,
  encoded: number,
): void {
  const x0 = Math.min(grid.size - 1,
    Math.max(0, Math.floor((minU - AXIS_GRID_EPS - grid.minU) * grid.scaleU)));
  const x1 = Math.min(grid.size - 1,
    Math.max(0, Math.floor((maxU + AXIS_GRID_EPS - grid.minU) * grid.scaleU)));
  const y0 = Math.min(grid.size - 1,
    Math.max(0, Math.floor((minV - AXIS_GRID_EPS - grid.minV) * grid.scaleV)));
  const y1 = Math.min(grid.size - 1,
    Math.max(0, Math.floor((maxV + AXIS_GRID_EPS - grid.minV) * grid.scaleV)));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > AXIS_GRID_MAX_CELLS_PER_TRIANGLE) {
    grid.broad.push(encoded);
    return;
  }
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const index = y * grid.size + x;
      (grid.cells[index] || (grid.cells[index] = [])).push(encoded);
    }
  }
}

function expandTransformedBounds(
  bounds: THREE.Box3,
  box: THREE.Box3,
  transform: THREE.Matrix4,
  corner: THREE.Vector3,
): void {
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        bounds.expandByPoint(corner.set(x, y, z).applyMatrix4(transform));
      }
    }
  }
}

function collectSurfaceRecords(
  _group: THREE.Group,
  targets: SurfaceMesh[],
  groupInverse: THREE.Matrix4,
): SurfaceIndexPreparation | null {
  const records: SurfaceRecord[] = [];
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  let triangleTotal = 0;
  for (const mesh of targets) {
    if (Array.isArray(mesh.material)) return null;
    const position = mesh.geometry?.getAttribute('position');
    if (!position || position.count < 3) continue;
    mesh.updateWorldMatrix(true, false);
    const toGroup = new THREE.Matrix4().multiplyMatrices(groupInverse, mesh.matrixWorld);
    const toLocal = new THREE.Matrix4().copy(toGroup).invert();
    // Match Mesh.raycast's face-normal pipeline exactly. The legacy prober
    // first transforms the geometry-local face normal into world space with
    // the mesh normal matrix, then transforms that direction into group-local
    // space. Collapsing those steps into getNormalMatrix(toGroup) is not
    // equivalent when an ancestor has non-uniform scale.
    const worldNormalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    if (box && !box.isEmpty()) expandTransformedBounds(bounds, box, toGroup, corner);
    const index = mesh.geometry.index?.array || null;
    const triangleCount = Math.floor((index ? index.length : position.count) / 3);
    records.push({ mesh, position, index, triangleCount, toGroup, toLocal, worldNormalMatrix });
    triangleTotal += triangleCount;
  }
  if (!records.length || bounds.isEmpty()) return null;
  return { records, bounds, triangleTotal };
}

function* indexSurfaceTrianglesSteps(
  records: SurfaceRecord[],
  bounds: THREE.Box3,
  triangleTotal: number,
  work: DecorationWorkOptions,
): Generator<DecorationWorkSlice, AxisProjectedGrids | null, void> {
  const size = Math.max(AXIS_GRID_MIN, Math.min(AXIS_GRID_MAX,
    Math.ceil(Math.sqrt(triangleTotal / 24))));
  const xz = projectedGrid(bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z, size);
  const yz = projectedGrid(bounds.min.y, bounds.max.y, bounds.min.z, bounds.max.z, size);
  const xy = projectedGrid(bounds.min.x, bounds.max.x, bounds.min.y, bounds.max.y, size);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const now = work.now || decorationWorkNow;
  let sliceStartedAt = now(), sliceTriangles = 0, completed = 0;
  for (let targetIndex = 0; targetIndex < records.length; targetIndex++) {
    const record = records[targetIndex];
    if (record.triangleCount >= 0x100000) return null;
    for (let triangle = 0; triangle < record.triangleCount; triangle++) {
      const offset = triangle * 3;
      const ia = record.index ? record.index[offset] : offset;
      const ib = record.index ? record.index[offset + 1] : offset + 1;
      const ic = record.index ? record.index[offset + 2] : offset + 2;
      record.mesh.getVertexPosition(ia, a).applyMatrix4(record.toGroup);
      record.mesh.getVertexPosition(ib, b).applyMatrix4(record.toGroup);
      record.mesh.getVertexPosition(ic, c).applyMatrix4(record.toGroup);
      const encoded = targetIndex * 0x100000 + triangle;
      addProjectedTriangle(xz,
        Math.min(a.x, b.x, c.x), Math.max(a.x, b.x, c.x),
        Math.min(a.z, b.z, c.z), Math.max(a.z, b.z, c.z), encoded);
      addProjectedTriangle(yz,
        Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y),
        Math.min(a.z, b.z, c.z), Math.max(a.z, b.z, c.z), encoded);
      addProjectedTriangle(xy,
        Math.min(a.x, b.x, c.x), Math.max(a.x, b.x, c.x),
        Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y), encoded);
      completed++;
      sliceTriangles++;
      if (sliceTriangles >= DECORATION_INDEX_BATCH_LIMIT
        || (sliceTriangles % 16 === 0 && now() - sliceStartedAt >= DECORATION_WORK_BUDGET_MS)) {
        yield { stage: 'surface-index', completed, total: triangleTotal };
        sliceStartedAt = now();
        sliceTriangles = 0;
      }
    }
  }
  return { xz, yz, xy };
}

function* buildAxisSurfaceIndexSteps(
  group: THREE.Group,
  targets: SurfaceMesh[],
  work: DecorationWorkOptions,
): Generator<DecorationWorkSlice, AxisSurfaceIndex | null, void> {
  if (!targets.length || targets.length >= 2048) return null;
  group.updateWorldMatrix(true, false);
  const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const prepared = collectSurfaceRecords(group, targets, groupInverse);
  if (!prepared) return null;
  const { records, bounds, triangleTotal } = prepared;
  const grids = yield* indexSurfaceTrianglesSteps(records, bounds, triangleTotal, work);
  if (!grids) return null;
  const { xz, yz, xy } = grids;

  const rayGroup = new THREE.Ray();
  const rayLocal = new THREE.Ray();
  const hitLocal = new THREE.Vector3();
  const hitGroup = new THREE.Vector3();
  const bestPoint = new THREE.Vector3();
  const va = new THREE.Vector3();
  const vb = new THREE.Vector3();
  const vc = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let bestRecordIndex = -1;
  let bestTriangle = -1;
  let bestDistance = Infinity;
  let activeRecord: SurfaceRecord | null = null;

  const testEncoded = (encoded: number): void => {
    const recordIndex = Math.floor(encoded / 0x100000);
    const record = records[recordIndex];
    const triangle = encoded % 0x100000;
    if (record !== activeRecord) {
      activeRecord = record;
      rayLocal.copy(rayGroup).applyMatrix4(record.toLocal);
    }
    const offset = triangle * 3;
    const ia = record.index ? record.index[offset] : offset;
    const ib = record.index ? record.index[offset + 1] : offset + 1;
    const ic = record.index ? record.index[offset + 2] : offset + 2;
    record.mesh.getVertexPosition(ia, va);
    record.mesh.getVertexPosition(ib, vb);
    record.mesh.getVertexPosition(ic, vc);
    const side = record.mesh.material?.side ?? THREE.FrontSide;
    const point = side === THREE.BackSide
      ? rayLocal.intersectTriangle(vc, vb, va, true, hitLocal)
      : rayLocal.intersectTriangle(va, vb, vc, side === THREE.FrontSide, hitLocal);
    if (!point) return;
    hitGroup.copy(point).applyMatrix4(record.toGroup);
    const distance = hitGroup.distanceTo(rayGroup.origin);
    if (distance < 0 || distance > 80 || distance >= bestDistance) return;
    bestDistance = distance;
    bestRecordIndex = recordIndex;
    bestTriangle = triangle;
    bestPoint.copy(hitGroup);
  };

  return {
    cast(origin: THREE.Vector3, direction: THREE.Vector3): SurfaceHit | null {
      let grid: ProjectedGrid;
      let u;
      let v;
      if (Math.abs(direction.y) > 0.999999) {
        grid = xz; u = origin.x; v = origin.z;
      } else if (Math.abs(direction.x) > 0.999999) {
        grid = yz; u = origin.y; v = origin.z;
      } else if (Math.abs(direction.z) > 0.999999) {
        grid = xy; u = origin.x; v = origin.y;
      } else return null;
      rayGroup.set(origin, direction);
      bestRecordIndex = -1;
      bestTriangle = -1;
      bestDistance = Infinity;
      activeRecord = null;
      const candidates = projectedCell(grid, u, v) ?? [];
      // Both lists are appended in source mesh/triangle order. Merge them in
      // that same order so equal-distance coplanar faces choose the identical
      // first triangle (and therefore identical authored face normal) as
      // THREE.Mesh.raycast.
      let broadIndex = 0;
      let cellIndex = 0;
      while (broadIndex < grid.broad.length || cellIndex < candidates.length) {
        const broadEncoded = broadIndex < grid.broad.length
          ? grid.broad[broadIndex] : Infinity;
        const cellEncoded = cellIndex < candidates.length
          ? candidates[cellIndex] : Infinity;
        if (broadEncoded <= cellEncoded) {
          testEncoded(broadEncoded);
          broadIndex++;
          if (broadEncoded === cellEncoded) cellIndex++;
        } else {
          testEncoded(cellEncoded);
          cellIndex++;
        }
      }
      const resolvedRecord = records[bestRecordIndex];
      if (!resolvedRecord) return null;
      const offset = bestTriangle * 3;
      const ia = resolvedRecord.index ? resolvedRecord.index[offset] : offset;
      const ib = resolvedRecord.index ? resolvedRecord.index[offset + 1] : offset + 1;
      const ic = resolvedRecord.index ? resolvedRecord.index[offset + 2] : offset + 2;
      resolvedRecord.mesh.getVertexPosition(ia, va);
      resolvedRecord.mesh.getVertexPosition(ib, vb);
      resolvedRecord.mesh.getVertexPosition(ic, vc);
      THREE.Triangle.getNormal(va, vb, vc, normal);
      normal.applyMatrix3(resolvedRecord.worldNormalMatrix).normalize();
      normal.transformDirection(groupInverse);
      return { p: bestPoint.clone(), n: normal.clone(), dist: bestDistance };
    },
  };
}

function makeProber(
  group: THREE.Group,
  targets: SurfaceMesh[],
  axisIndex: AxisSurfaceIndex | null,
): SurfaceProber {
  const ray = new THREE.Raycaster();
  ray.far = 80;
  const orig = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const hitLocal = new THREE.Vector3();
  const inv = new THREE.Matrix4();
  const nrm = new THREE.Vector3();
  const nm3 = new THREE.Matrix3();
  function legacyCast(oLocal: THREE.Vector3, dLocal: THREE.Vector3): SurfaceHit | null {
    group.updateWorldMatrix(true, false);
    inv.copy(group.matrixWorld).invert();
    orig.copy(oLocal).applyMatrix4(group.matrixWorld);
    dir.copy(dLocal).transformDirection(group.matrixWorld);
    ray.set(orig, dir);
    const hits = ray.intersectObjects(targets, false);
    if (!hits.length) return null;
    const h = hits[0];
    hitLocal.copy(h.point).applyMatrix4(inv);
    if (h.face) {
      nm3.getNormalMatrix(h.object.matrixWorld);
      nrm.copy(h.face.normal).applyMatrix3(nm3).normalize(); // -> world
      nrm.transformDirection(inv);                            // -> group local
    } else nrm.set(0, 1, 0);
    return { p: hitLocal.clone(), n: nrm.clone(), dist: h.distance };
  }
  const verify = typeof location !== 'undefined'
    && new URLSearchParams(location.search).has('decorprobe');
  function cast(oLocal: THREE.Vector3, dLocal: THREE.Vector3): SurfaceHit | null {
    if (!axisIndex) return legacyCast(oLocal, dLocal);
    const fast = axisIndex.cast(oLocal, dLocal);
    if (verify) {
      const legacy = legacyCast(oLocal, dLocal);
      const pointError = fast && legacy ? fast.p.distanceTo(legacy.p)
        : (fast === legacy ? 0 : Infinity);
      const normalError = fast && legacy ? fast.n.distanceTo(legacy.n)
        : (fast === legacy ? 0 : Infinity);
      if (pointError > 1e-5 || normalError > 1e-5) {
        console.error('[decorations] axis probe parity failure', {
          pointError, normalError, origin: oLocal.toArray(), direction: dLocal.toArray(),
        });
      }
    }
    return fast;
  }
  return {
    top(x: number, z: number, fromY: number) { return cast(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0)); },
    side(y: number, z: number, side: number, fromX: number) { return cast(new THREE.Vector3(fromX * side, y, z), new THREE.Vector3(-side, 0, 0)); },
    zface(x: number, y: number, dirZ: number, fromZ: number) { return cast(new THREE.Vector3(x, y, fromZ), new THREE.Vector3(0, 0, dirZ)); },
  };
}

// 5-point footprint seat: MAX height wins (nothing sinks into slots), spread
// rejects occupied/steep surfaces (this is the greeble de-dupe: an existing
// searchlight/periscope in the footprint blows the spread and the slot walks
// on). Returns { y, n, spread } or null.
function seatProbe(
  prober: SurfaceProber,
  cx: number,
  cz: number,
  w: number,
  d: number,
  fromY: number,
  maxSpread = 0.16,
): SurfaceSeat | null {
  const pts: Array<[number, number]> = [[0, 0], [-w * 0.4, -d * 0.4], [w * 0.4, -d * 0.4], [-w * 0.4, d * 0.4], [w * 0.4, d * 0.4]];
  let top = -Infinity, bot = Infinity;
  let n = null;
  for (const [dx, dz] of pts) {
    const h = prober.top(cx + dx, cz + dz, fromY);
    if (!h) return null;
    if (h.p.y > top) { top = h.p.y; n = h.n; }
    if (h.p.y < bot) bot = h.p.y;
  }
  if (top - bot > maxSpread) return null;
  return { y: top, n, spread: top - bot };
}

// piece record for guard bookkeeping: local-frame AABB after placement.
function placedBox(parts: DecorPartList, pos: THREE.Vector3, rot: THREE.Euler): THREE.Box3 {
  const bb = partsBBox(parts);
  const m = new THREE.Matrix4().compose(
    pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1),
  );
  const out = new THREE.Box3();
  const v = new THREE.Vector3();
  for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
    out.expandByPoint(v.set(x, y, z).applyMatrix4(m));
  }
  return out;
}

// per-part placed boxes (gun-guard granularity: no empty-corner false hits)
function placedPartBoxes(parts: DecorPartList, pos: THREE.Vector3, rot: THREE.Euler): THREE.Box3[] {
  const m = new THREE.Matrix4().compose(
    pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1),
  );
  const v = new THREE.Vector3();
  return parts.map((p) => {
    p.geo.computeBoundingBox();
    const b = p.geo.boundingBox;
    const out = new THREE.Box3();
    if (!b) return out;
    for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
      out.expandByPoint(v.set(x, y, z).applyMatrix4(m));
    }
    return out;
  });
}

function clonePartList(parts: DecorPartList): DecorPartList {
  const clone = parts.map((p) => ({ mat: p.mat, geo: p.geo.clone() })) as DecorPartList;
  if (parts.meta) clone.meta = { ...parts.meta };
  if (parts.metaCx !== undefined) clone.metaCx = parts.metaCx;
  if (parts.coarse) clone.coarse = clonePartList(parts.coarse);
  return clone;
}

/**
 * Kits whose builders author a coarse level (`detail: 0`): fewer segments and no small hardware inside the same
 * envelope. Every other kit's coarse level is a copy of its near geometry, because each material bucket's coarse
 * draw must still carry every piece of that bucket.
 */
const DETAIL_KITS = new Set(['smoke', 'bin', 'tarp', 'camonet', 'log', 'packs', 'cargo', 'basket', 'tools', 'drums',
  'jerry', 'sandbags', 'rations', 'foliage']);
/** Working equipment among the decor kits: its draws stay resident at every range (combatVisibility.ts). */
const FUNCTIONAL_KITS = new Set(['smoke']);
/**
 * Attach the decoration kit to a built tank visual.
 *
 * Called by tankFactory's seam (procedural tanks: at build; GLB tanks: after
 * the model swap so anchors probe the REAL rendered geometry). Idempotent per
 * root. Never throws — cosmetics must not take down a build.
 *
 * @param {object} a
 * @param {THREE.Object3D} a.root   tank root (rig groups' parent)
 * @param {THREE.Group} a.hullG     rig_hull
 * @param {THREE.Group} a.turretG   rig_turret
 * @param {object}      a.spec      TankSpec
 * @param {?object}     a.engineCtx EngineCtx
 * @param {Array}       a.disposables tankFactory's disposal list (decor
 *                                  geometry + materials die with the visual)
 * @param {{proceduralOnly?:boolean, decor?:boolean}} [a.opts]
 * @param {() => boolean} [a.isDestroyed] live-wreck guard (never dress a wreck)
 * @returns {?object} summary { pieces, tris, drawCalls, skipped } or null
 */
export const DECORATION_INDEX_BATCH_LIMIT = 256;
const DECORATION_WORK_BUDGET_MS = 2;
interface DecorationWorkSlice {
  stage: 'surface-index' | 'surface-ready' | 'manifest-row' | 'material-bucket' | 'publish';
  completed: number;
  total: number;
}
interface DecorationWorkOptions { now?: () => number; }
const decorationWorkNow = (): number => performance.now();

/** Only newly authored decoration resources enter this per-job owner. */
function createDecorationResourceOwner(
  root: THREE.Object3D,
  disposables: Array<THREE.BufferGeometry | THREE.Material | THREE.Texture>,
  engineCtx: ShadowEngineContext | null | undefined,
) {
  const pending = new Set<THREE.BufferGeometry>();
  const released = new WeakSet<THREE.BufferGeometry>();
  const completed: THREE.BufferGeometry[] = [];
  const groups: Array<{ parent: THREE.Group; group: THREE.Group }> = [];
  let published = false;
  function releaseGeometry(geometry: THREE.BufferGeometry): void {
    pending.delete(geometry);
    if (released.has(geometry)) return;
    released.add(geometry);
    geometry.dispose();
  }
  return {
    ownGeometry(geometry: THREE.BufferGeometry): void { pending.add(geometry); },
    releaseGeometry,
    completeGeometry(geometry: THREE.BufferGeometry): void { completed.push(geometry); },
    addGroup(parent: THREE.Group, group: THREE.Group): void { groups.push({ parent, group }); },
    groupCount: (): number => groups.length,
    publish(summary: DecorSummary, materials: DecorMaterials): void {
      for (const { parent, group } of groups) parent.add(group);
      for (const geometry of completed) disposables.push(geometry);
      for (const material of Object.values(materials.all())) if (material) disposables.push(material);
      root.userData.__decorSummary = summary;
      published = true;
      pending.clear();
    },
    cancel(materials: DecorMaterials | null): void {
      if (published) return;
      for (const { group } of groups) group.removeFromParent();
      for (const geometry of pending) releaseGeometry(geometry);
      for (const material of Object.values(materials?.all() || {})) {
        if (material) releaseDecorationMaterial(engineCtx, material);
      }
      delete root.userData.__decorApplied;
    },
  };
}

/** Synchronous callers retain the existing fully dressed return contract. */
export function attachTankDecorations(a: DecorationAttachmentArgs): DecorSummary | null {
  try {
    const steps = attachTankDecorationsSteps(a);
    let result = steps.next();
    while (!result.done) result = steps.next();
    return result.value;
  } catch (error) {
    try { console.warn(`[decorations] ${a.spec.id}: attach failed —`, errorMessage(error)); } catch (_) { /* noop */ }
    return null;
  }
}

/**
 * The caller owns the core visual privately until this iterator finishes.
 * Each row consumes both RNG draws and its complete placement before yielding;
 * no draft decoration group is attached until all owner/material buckets exist.
 * A single kit, native merge, and final publication remain synchronous units.
 */
export function* attachTankDecorationsSteps(
  a: DecorationAttachmentArgs,
  work: DecorationWorkOptions = {},
): Generator<DecorationWorkSlice, DecorSummary | null, void> {
  const { root, hullG, turretG, spec, engineCtx, disposables = [], opts = {} } = a;
  const resources = createDecorationResourceOwner(root, disposables, engineCtx);
  let mats: DecorMaterials | null = null;
  let claimed = false;
  function disposePartList(parts: DecorPartList): void {
    for (const part of parts) resources.releaseGeometry(part.geo);
    if (parts.coarse) disposePartList(parts.coarse);
  }
  try {
    function shouldSkipAttachment(): boolean {
      if (!root || root.userData.__decorApplied) return true;
      if (!resolveDecorMode(opts, engineCtx)) return true;
      return !!(a.isDestroyed && a.isDestroyed());
    }
    if (shouldSkipAttachment()) return null;
    root.userData.__decorApplied = true;
    claimed = true;

    const decorId = decorIdentityFor(spec.id);
    const rng = mulberry32(fnv1a(`decor:${decorId}`));
    const materials = buildDecorMaterials(spec, engineCtx);
    mats = materials;
    const dims = spec.dims;
    const armor = spec.armor;
    const W = dims.widthM, H = dims.heightM;
    const L = dims.hullLengthM || dims.overallLengthM * 0.8;
    const pivot = armor.turretPivot;
    const casemate = !!armor.turretless;

    // --- probers over the real geometry -----------------------------------
    const hullTargets = probeTargets(hullG);
    const turretTargets = probeTargets(turretG);
    if (!hullTargets.length && !turretTargets.length) return null;
    const hullProbeTargets = hullTargets.length ? hullTargets : turretTargets;
    const turretProbeTargets = turretTargets.length ? turretTargets : hullTargets;
    const hullIndex = yield* buildAxisSurfaceIndexSteps(hullG, hullProbeTargets, work);
    const hullP = makeProber(hullG, hullProbeTargets, hullIndex);
    yield { stage: 'surface-ready', completed: 1, total: 2 };
    const turretIndex = yield* buildAxisSurfaceIndexSteps(turretG, turretProbeTargets, work);
    const turP = makeProber(turretG, turretProbeTargets, turretIndex);
    yield { stage: 'surface-ready', completed: 2, total: 2 };

    // --- guard precomputation ---------------------------------------------
    // Turret swept annulus + PER-RADIAL-BAND lowest turret surface: the
    // mantlet hangs low near the ring while the bustle bottom rides high —
    // one global minimum would ban the classic sponson-edge stowage line
    // (the real Tiger's cables) for a mantlet it can never touch. Hull decor
    // inside the sweep only needs to clear the bands it actually sits under.
    // Casemates skip the sweep (nothing yaws).
    function measureTurretSweep(): {
      sweepR: number;
      turretMinY: number;
      bandMinY: number[];
    } {
      let sweepR = 0;
      let turretMinY = 0.10;
      const bandMinY = [Infinity, Infinity, Infinity];
      const v = new THREE.Vector3();
      const bb = new THREE.Box3();
      const inv = new THREE.Matrix4();
      const m = new THREE.Matrix4();
      const samples: Array<[number, number]> = [];
      turretG.updateWorldMatrix(true, false);
      inv.copy(turretG.matrixWorld).invert();

      function belongsToGunRig(object: THREE.Object3D): boolean {
        // Gun-subtree geometry pitches; the gun guard owns its envelope.
        for (let p: THREE.Object3D | null = object; p && p !== turretG; p = p.parent) {
          if (p.name === 'rig_gun') return true;
        }
        return false;
      }

      function appendTargetSamples(object: SurfaceMesh): void {
        if (belongsToGunRig(object)) return;
        if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
        if (!object.geometry.boundingBox) return;
        bb.copy(object.geometry.boundingBox);
        m.multiplyMatrices(inv, object.matrixWorld);
        for (const x of [bb.min.x, bb.max.x]) {
          for (const y of [bb.min.y, bb.max.y]) {
            for (const z of [bb.min.z, bb.max.z]) {
              v.set(x, y, z).applyMatrix4(m);
              const r = Math.hypot(v.x, v.z);
              sweepR = Math.max(sweepR, r);
              if (v.y < turretMinY) turretMinY = v.y;
              samples.push([r, v.y]);
            }
          }
        }
      }

      for (const object of turretTargets) appendTargetSamples(object);
      sweepR = Math.min(sweepR || W * 0.45, dims.overallLengthM * 0.5); // sanity
      for (const [r, y] of samples) {
        const i = r < sweepR * 0.5 ? 0 : (r < sweepR * 0.8 ? 1 : 2);
        if (y < bandMinY[i]) bandMinY[i] = y;
      }
      for (let i = 0; i < 3; i++) {
        if (!Number.isFinite(bandMinY[i])) bandMinY[i] = 0.12;
      }
      return { sweepR, turretMinY, bandMinY };
    }
    const { sweepR, turretMinY, bandMinY } = measureTurretSweep();

    // Gun full-depression bore envelope, swept across every yaw. Hull decor
    // within reach must clear the bore cylinder.
    const dep = (spec.gunDepressionDeg ?? 8) * D2R;
    const gunPiv = armor.gunPivot || [0, 0, 0];
    const boreY0 = pivot[1] + gunPiv[1];
    const boreRho = Math.hypot(gunPiv[0], gunPiv[2]);
    const boreLen = (armor.gunBarrel && armor.gunBarrel.lengthM) || 4;
    const boreR = ((armor.gunBarrel && armor.gunBarrel.radiusM) || 0.08) * 1.15 + 0.02;
    const boreReach = boreRho + boreLen * Math.cos(dep) + 0.2;
    const boreYAt = (r: number) => boreY0 - Math.max(0, r - boreRho) * Math.tan(dep);
    // guards evolve as turret decor lands: baskets legally extend the bustle
    let sweepRLive = sweepR;
    let turretMinYLive = turretMinY;

    const widthGuardOK = (bb: THREE.Box3, zExtra = 0) => {
      if (Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) > W / 2 + 0.048) return false;
      const zLim = dims.overallLengthM / 2 + 0.4 + zExtra;
      return bb.min.z > -zLim && bb.max.z < zLim;
    };
    // GUN GUARD — full-depression bore corridor across every yaw, resolved
    // the way a PLAYER would see it: a piece fails only when a bore-bundle
    // ray meets the DECOR before any of the tank's own plates. (Tall flat
    // decks — Sherman/Tiger/M60 rear arcs — already skim or eat the bore;
    // geometry the hull occludes first can never render as decor-through-
    // barrel.) The cheap analytic cone check accepts the clear-by-height
    // majority before any rays fire.
    const _gray = new THREE.Ray();
    const _ghit = new THREE.Vector3();
    const guardRay = new THREE.Raycaster();
    const gunGuardYaws = casemate
      ? [0]
      : Array.from({ length: 24 }, (_, index) => (index / 24) * Math.PI * 2);
    const gunGuardOffsets: Array<[number, number]> = [
      [0, 0], [boreR, 0], [-boreR, 0], [0, boreR], [0, -boreR],
    ];
    const sinDepression = Math.sin(dep);
    const cosDepression = Math.cos(dep);
    const analyticallyClearsGun = (boxes: readonly THREE.Box3[]): boolean => {
      for (const bb of boxes) {
        for (const x of [bb.min.x, bb.max.x, (bb.min.x + bb.max.x) / 2]) {
          for (const z of [bb.min.z, bb.max.z, (bb.min.z + bb.max.z) / 2]) {
            const r = Math.hypot(x - pivot[0], z - pivot[2]);
            if (r > boreReach || r < boreRho * 0.5) continue;
            if (bb.max.y > boreYAt(r) - boreR - 0.03) return false;
          }
        }
      }
      return true;
    };
    const nearestDecorHit = (boxes: readonly THREE.Box3[]): number => {
      let distance = Infinity;
      for (const bb of boxes) {
        const hit = _gray.intersectBox(bb, _ghit);
        if (hit) distance = Math.min(distance, _ghit.distanceTo(_gray.origin));
      }
      return distance;
    };
    const hullBlocksGuardRay = (distance: number, toWorld: THREE.Matrix4): boolean => {
      guardRay.ray.origin.copy(_gray.origin).applyMatrix4(toWorld);
      guardRay.ray.direction.copy(_gray.direction).transformDirection(toWorld);
      guardRay.far = distance - 0.02;
      guardRay.near = 0.1;
      return guardRay.intersectObjects(hullTargets, false).length > 0;
    };
    const gunClearAtYaw = (
      boxes: readonly THREE.Box3[],
      yaw: number,
      toWorld: THREE.Matrix4,
    ): boolean => {
      const sinYaw = Math.sin(yaw);
      const cosYaw = Math.cos(yaw);
      const originX = pivot[0] + gunPiv[0] * cosYaw + gunPiv[2] * sinYaw;
      const originZ = pivot[2] - gunPiv[0] * sinYaw + gunPiv[2] * cosYaw;
      const directionX = sinYaw * cosDepression;
      const directionY = -sinDepression;
      const directionZ = cosYaw * cosDepression;
      const sideX = cosYaw;
      const sideZ = -sinYaw;
      // up = direction × side; both inputs are unit and orthogonal.
      const upX = directionY * sideZ;
      const upY = directionZ * sideX - directionX * sideZ;
      const upZ = -directionY * sideX;
      for (const [sideOffset, upOffset] of gunGuardOffsets) {
        _gray.origin.set(
          originX + sideX * sideOffset + upX * upOffset,
          boreY0 + upY * upOffset,
          originZ + sideZ * sideOffset + upZ * upOffset,
        );
        _gray.direction.set(directionX, directionY, directionZ);
        const decorDistance = nearestDecorHit(boxes);
        if (!Number.isFinite(decorDistance) || decorDistance > boreLen + 0.15) continue;
        if (!hullBlocksGuardRay(decorDistance, toWorld)) return false;
      }
      return true;
    };
    const gunGuardOK: GunGuard = (boxes, seatY = null) => {
      void seatY;
      if (analyticallyClearsGun(boxes)) return true;
      // First-hit ray test: bore bundle (center + 4 sleeve-radius offsets).
      hullG.updateWorldMatrix(true, false);
      const toWorld = hullG.matrixWorld;
      for (const yaw of gunGuardYaws) {
        if (gunClearAtYaw(boxes, yaw, toWorld)) continue;
        gunGuardOK.lastYaw = Math.round(yaw / D2R);
        return false;
      }
      return true;
    };
    gunGuardOK.lastYaw = null;
    const sweepGuardOK = (bb: THREE.Box3) => {
      if (casemate) return true;
      // closest horizontal approach of the box to the yaw axis (edges count,
      // not just corners — a long cable's mid-span is its nearest point)
      const rMin = Math.hypot(
        Math.max(0, bb.min.x - pivot[0], pivot[0] - bb.max.x),
        Math.max(0, bb.min.z - pivot[2], pivot[2] - bb.max.z),
      );
      let rMax = 0;
      for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
        rMax = Math.max(rMax, Math.hypot(x - pivot[0], z - pivot[2]));
      }
      if (rMin > sweepRLive + 0.07) return true;
      // clear the lowest turret surface among the radial bands overlapped
      let minY = Infinity;
      const n0 = rMin / Math.max(sweepR, 1e-3), n1 = rMax / Math.max(sweepR, 1e-3);
      if (n0 < 0.5) minY = Math.min(minY, bandMinY[0]);
      if (n1 > 0.5 && n0 < 0.8) minY = Math.min(minY, bandMinY[1]);
      if (n1 > 0.8) minY = Math.min(minY, bandMinY[2]);
      if (!Number.isFinite(minY)) minY = turretMinYLive;
      return bb.max.y <= pivot[1] + minY - 0.035;
    };

    // --- collision ledgers (hull & turret frames kept apart) ---------------
    const placedHull: THREE.Box3[] = [];
    const placedTurret: THREE.Box3[] = [];
    const overlaps = (bb: THREE.Box3, ledger: THREE.Box3[]) =>
      ledger.some((other) => bb.intersectsBox(other));

    // --- spare-wheel radius: measured off the real gear ---------------------
    function measureWheelRadius(): number {
      let best: number | null = null;
      const s = new THREE.Vector3();
      hullG.traverse((o) => {
        if (!(o instanceof THREE.Mesh) || !o.geometry) return;
        const wheelish = o instanceof THREE.InstancedMesh || GEAR_NAME_RE.test(o.name || '');
        if (!wheelish) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        if (!o.geometry.boundingBox) return;
        o.geometry.boundingBox.getSize(s);
        const ext = [s.x, s.y, s.z].sort((p, q) => p - q);
        const r = (ext[1] + ext[2]) / 4;
        if (r > 0.16 && r < 0.62 && ext[1] / Math.max(ext[2], 1e-3) > 0.7 && ext[0] < r * 1.7) {
          if (!best || r > best) best = r;
        }
      });
      return best === null ? 0.31 : Math.min(0.45, best);
    }
    const wheelR = measureWheelRadius();

    // --- deck landmarks ------------------------------------------------------
    const topFrom = H + 1.5;
    const deckProbe = (x: number, z: number) => hullP.top(x, z, topFrom);
    const sternZ = -L / 2;
    function measureRearDeckY(): number {
      const ys: number[] = [];
      for (let i = 0; i <= 6; i++) {
        const z = sternZ + 0.2 + (i / 6) * Math.max(0.4, (pivot[2] - sweepR - 0.25) - sternZ - 0.3);
        const h = deckProbe(0, z);
        if (h) ys.push(h.p.y);
      }
      if (!ys.length) return H * 0.6;
      ys.sort((p, q) => p - q);
      return ys[(ys.length / 2) | 0];
    }
    const rearDeckY = measureRearDeckY();

    // --- placement bookkeeping ----------------------------------------------
    // Seven visible fleet-equipment stations plus the per-vehicle curated kit
    // fit below this cap. Geometry is still merged by material/frame, so the
    // higher detail allowance grows silhouettes without multiplying draws.
    // Near-level triangles. The molded / sewn accessories (accessoryKits.ts) spend more per piece than
    // the old boxes and spheres; their coarse level (from DECOR_COARSE_DIST, and the whole mobile tier)
    // runs at about two fifths of this, and the cosmetic groups detach at battle range.
    const budget = { tris: 0, max: 6000 };
    const buckets: Record<DecorFrame, Map<DecorMaterialKey, THREE.BufferGeometry[]>> = {
      hull: new Map(),
      turret: new Map(),
    };
    // The coarse level of every cosmetic bucket (shown from DECOR_COARSE_DIST) and the working equipment (smoke
    // banks), which keeps its own resident draws.
    const coarseBuckets: Record<DecorFrame, Map<DecorMaterialKey, THREE.BufferGeometry[]>> = {
      hull: new Map(),
      turret: new Map(),
    };
    const functionalBuckets: Record<DecorFrame, Map<DecorMaterialKey, THREE.BufferGeometry[]>> = {
      hull: new Map(),
      turret: new Map(),
    };
    const lowTier = opts.geometryQuality === 'low';
    const summary: DecorSummary = { pieces: [], tris: 0, drawCalls: 0, skipped: [] };
    let basketAnchor: BasketAnchor | null = null; // set by turretRearFrame; used by onBasket packs

    function rejectCommit(
      name: string,
      parts: DecorPartList,
      reason: string,
    ): false {
      summary.skipped.push([name, reason]);
      disposePartList(parts);
      return false;
    }

    function guardHullCommit(
      name: string,
      parts: DecorPartList,
      bb: THREE.Box3,
      pos: THREE.Vector3,
      rot: THREE.Euler,
      seatY: number | null,
      zExtra: number,
    ): boolean {
      if (!widthGuardOK(bb, zExtra)) return rejectCommit(name, parts, 'width');
      if (!gunGuardOK(placedPartBoxes(parts, pos, rot), seatY)) {
        const reason = `gun@${gunGuardOK.lastYaw ?? 'cone'}`;
        gunGuardOK.lastYaw = null;
        return rejectCommit(name, parts, reason);
      }
      if (!sweepGuardOK(bb)) return rejectCommit(name, parts, 'sweep');
      return true;
    }

    function guardTurretCommit(
      name: string,
      parts: DecorPartList,
      bb: THREE.Box3,
    ): boolean {
      let rMax = 0;
      for (const x of [bb.min.x, bb.max.x]) {
        for (const z of [bb.min.z, bb.max.z]) {
          rMax = Math.max(rMax, Math.hypot(x, z));
        }
      }
      if (Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) > W / 2 + 0.048) {
        return rejectCommit(name, parts, 'turret-width');
      }
      if (rMax > sweepR + 0.55) return rejectCommit(name, parts, 'turret-reach');
      sweepRLive = Math.max(sweepRLive, rMax);
      turretMinYLive = Math.min(turretMinYLive, bb.min.y);
      for (const x of [bb.min.x, bb.max.x]) {
        for (const z of [bb.min.z, bb.max.z]) {
          const rn = Math.hypot(x, z) / Math.max(sweepR, 1e-3);
          const bi = rn < 0.5 ? 0 : (rn < 0.8 ? 1 : 2);
          if (bb.min.y < bandMinY[bi]) bandMinY[bi] = bb.min.y;
        }
      }
      return true;
    }

    function attachmentReceipt(
      parts: DecorPartList,
      pos: THREE.Vector3,
      rot: THREE.Euler,
      attachment: DecorAttachmentIntent,
    ): NonNullable<DecorPieceSummary['attachment']> {
      const localBounds = partsBBox(parts);
      const supportNormal = attachment.supportNormal.clone().normalize();
      const mountAxis = attachment.mountAxis === 'y'
        ? new THREE.Vector3(0, 1, 0)
        : new THREE.Vector3(0, 0, 1);
      const mountNormal = mountAxis
        .applyQuaternion(new THREE.Quaternion().setFromEuler(rot)).normalize();
      const baseOffset = attachment.mountAxis === 'y'
        ? localBounds.min.y
        : localBounds.min.z;
      const basePoint = pos.clone().addScaledVector(mountNormal, baseOffset);
      return {
        slot: attachment.slot,
        supportPoint: attachment.supportPoint.toArray() as [number, number, number],
        supportNormal: supportNormal.toArray() as [number, number, number],
        mountNormal: mountNormal.toArray() as [number, number, number],
        alignmentDot: mountNormal.dot(supportNormal),
        supportGapM: basePoint.sub(attachment.supportPoint).dot(supportNormal),
        embedM: attachment.embedM,
        continuousCarrier: parts.meta?.continuousCarrier === true,
      };
    }

    /** Commit one built kit at pos/rot under hull|turret. */
    function commit(
      name: string,
      parts: DecorPartList,
      frame: DecorFrame,
      pos: THREE.Vector3,
      rot: THREE.Euler,
      ledger: THREE.Box3[],
      { allowOverlap = false, seatY = null, zExtra = 0, attachment }: CommitOptions = {},
    ): boolean {
      let tris = 0;
      for (const p of parts) tris += triCount(p.geo);
      if (budget.tris + tris > budget.max) return rejectCommit(name, parts, 'budget');
      const bb = placedBox(parts, pos, rot);
      // Turret-frame reach can exceed the hull width only within the bounded
      // authored bustle envelope; hull-frame pieces retain the width, gun,
      // and turret-sweep guards.
      const guarded = frame === 'hull'
        ? guardHullCommit(name, parts, bb, pos, rot, seatY, zExtra)
        : guardTurretCommit(name, parts, bb);
      if (!guarded) return false;
      if (!allowOverlap && overlaps(bb, ledger)) {
        return rejectCommit(name, parts, 'overlap');
      }
      const receipt = attachment ? attachmentReceipt(parts, pos, rot, attachment) : null;
      ledger.push(bb);
      budget.tris += tris;
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
      const functional = FUNCTIONAL_KITS.has(name);
      const map = (functional ? functionalBuckets : buckets)[frame];
      for (const p of parts) {
        p.geo.applyMatrix4(m);
        if (!map.has(p.mat)) map.set(p.mat, []);
        map.get(p.mat)!.push(p.geo);
        resources.ownGeometry(p.geo);
      }
      if (parts.coarse) {
        // Working equipment stays resident at its near level; a cosmetic piece's coarse copy is
        // seated with exactly the near copy's matrix.
        if (functional) {
          disposePartList(parts.coarse);
        } else {
          const coarseMap = coarseBuckets[frame];
          for (const p of parts.coarse) {
            p.geo.applyMatrix4(m);
            if (!coarseMap.has(p.mat)) coarseMap.set(p.mat, []);
            coarseMap.get(p.mat)!.push(p.geo);
            resources.ownGeometry(p.geo);
          }
        }
        delete parts.coarse;
      }
      const piece: DecorPieceSummary = { kit: name, frame, tris };
      if (receipt) piece.attachment = receipt;
      summary.pieces.push(piece);
      return true;
    }

    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const E = (rx = 0, ry = 0, rz = 0) => new THREE.Euler(rx, ry, rz);

    const placeHullRearDeck: SlotPlacer = (_args, parts, name) => {
      const bounds = partsBBox(parts);
      const depth = bounds.max.z - bounds.min.z;
      const centerX = parts.metaCx || 0.35;
      for (const offsetZ of [0, 0.25, 0.5]) {
        const z = sternZ + depth / 2 + 0.12 + offsetZ;
        const leftSeat = seatProbe(hullP, -centerX, z, 0.4, depth * 0.7, topFrom, 0.42);
        const rightSeat = seatProbe(hullP, centerX, z, 0.4, depth * 0.7, topFrom, 0.42);
        if (!leftSeat || !rightSeat) continue;
        const seatY = Math.max(leftSeat.y, rightSeat.y);
        const normal = leftSeat.y > rightSeat.y ? leftSeat.n : rightSeat.n;
        const pitch = normal ? Math.atan2(normal.z, Math.max(normal.y, 0.4)) : 0;
        if (commit(name, parts, 'hull', V(0, seatY - 0.012, z), E(pitch * 0.8, 0, 0),
          placedHull, { seatY, zExtra: 0.3 })) return true;
      }
      disposePartList(parts);
      return false;
    };

    // fender line: walk inboard from the width guard until a fender-height
    // top face answers (sponson/fender tops live in [0.35H, 0.85H])
    const fenderX = (side: number): number | null => {
      // pass 1: true track-guard band (low fenders); pass 2: sponson roofline
      for (const [y0, y1] of [[H * 0.32, H * 0.62], [H * 0.62, H * 0.86]]) {
        for (const fx of [W / 2 - 0.14, W / 2 - 0.22, W / 2 - 0.30]) {
          for (const z of [L * 0.3, L * 0.16, -L * 0.18, 0]) {
            const h = deckProbe(side * fx, z);
            if (h && h.p.y > y0 && h.p.y < y1 && h.n.y > 0.75) return fx;
          }
        }
      }
      return null;
    };

    const SLOTS: Record<string, SlotPlacer> = {
      fleetCargo(args, parts, name) {
        // Fleet-wide cargo gets an authored preference followed by a few
        // semantically compatible seats. Different turret/hull layouts can
        // make one preferred station unreachable; silently losing the model
        // was the reason only a cooler appeared on some vehicles.
        for (const [slotName, slotArgs] of args.routes || []) {
          const slot = SLOTS[slotName];
          if (!slot || slot === SLOTS.fleetCargo) continue;
          const candidate = clonePartList(parts);
          if (slot(slotArgs, candidate, name)) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      rearDeck(args, parts, name) {
        const bb = partsBBox(parts);
        const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
        const xs = args.center ? 0 : (args.corner || 1) * Math.max(0, W / 2 - 0.34 - w / 2);
        let z0 = args.back
          ? sternZ + d / 2 + 0.2
          : Math.max(sternZ + d / 2 + 0.16, pivot[2] - sweepR - d / 2 - (args.small ? 0.5 : 0.24));
        if (casemate) z0 = sternZ + d / 2 + 0.25 + (args.back ? 0 : 0.3);
        for (const dz of [0, -0.25, 0.28, -0.5]) {
          const seat = seatProbe(hullP, xs, z0 + dz, w, d, topFrom, 0.28);
          if (!seat) continue;
          const yaw = (rng() - 0.5) * 0.16 + (args.spread ? (rng() - 0.5) * 0.8 : 0);
          if (commit(name, parts, 'hull', V(xs, seat.y - 0.012, z0 + dz), E(0, yaw, 0), placedHull, { seatY: seat.y })) return true;
        }
        disposePartList(parts);
        return false;
      },
      hullRoof(args, parts, name) {
        const bb = partsBBox(parts);
        const w = bb.max.x - bb.min.x;
        const d = bb.max.z - bb.min.z;
        const x = args.x ?? 0;
        const z = args.z ?? (args.zFrac ?? 0) * L;
        const seat = seatProbe(hullP, x, z, w, d, topFrom, 0.08);
        const hit = deckProbe(x, z);
        if (!seat || !hit || !seat.n || hit.n.y < 0.92) {
          disposePartList(parts);
          return false;
        }
        const embedM = 0.004;
        const yaw = (rng() - 0.5) * 0.04;
        return commit(name, parts, 'hull', roofMountPosition(parts, hit, embedM),
          roofMountEuler(hit.n, yaw), placedHull, {
            seatY: seat.y,
            attachment: {
              slot: 'hull-roof',
              supportPoint: hit.p,
              supportNormal: hit.n,
              embedM,
              mountAxis: 'y',
            },
          });
      },
      fender(args, parts, name) {
        const side = args.side ?? 1;
        const fx = fenderX(side);
        if (fx === null) { disposePartList(parts); return false; }
        const bb = partsBBox(parts);
        // auto-orient: the LONG axis always runs fore-aft along the fender
        const rot90 = (bb.max.x - bb.min.x) > (bb.max.z - bb.min.z) * 1.15;
        const w = rot90 ? bb.max.z - bb.min.z : bb.max.x - bb.min.x;   // across
        const d = rot90 ? bb.max.x - bb.min.x : bb.max.z - bb.min.z;   // along
        const z = (args.zFrac ?? 0) * L;
        const seat = seatProbe(hullP, side * fx, z, Math.min(w, 0.34), Math.min(d, 0.4), topFrom, 0.26);
        if (!seat) { disposePartList(parts); return false; }
        const yaw = (rot90 ? Math.PI / 2 : 0) + (rng() - 0.5) * 0.08;
        return commit(name, parts, 'hull', V(side * fx, seat.y - 0.012, z), E(0, yaw, 0), placedHull, { seatY: seat.y });
      },
      glacis(args, parts, name) {
        const x = (args.side || 0) * W * (casemate ? 0.22 : 0.16);
        const embedM = 0.006;
        for (const zf of [0.36, 0.42, 0.3]) {
          const z = L * zf;
          const h = deckProbe(x, z);
          if (!h || h.n.y < 0.3 || h.n.y > 0.985 || Math.abs(h.n.x) > 0.4) continue;
          const candidate = clonePartList(parts);
          if (commit(name, candidate, 'hull', surfaceMountPosition(candidate, h, embedM), surfaceMountEuler(h.n), placedHull,
            { attachment: { slot: 'glacis', supportPoint: h.p, supportNormal: h.n, embedM } })) {
            disposePartList(parts);
            return true;
          }
        }
        // near-vertical bow plates (Tiger driver plate): hang the run flat
        // against the plate instead of lying on it, LOW (under the bow bore)
        for (const yf of [0.42, 0.5]) {
          const y = H * yf;
          const h = hullP.zface(x, y, -1, L / 2 + 1.6);
          if (!h || h.n.z < 0.5) continue;
          const candidate = clonePartList(parts);
          if (commit(name, candidate, 'hull', surfaceMountPosition(candidate, h, embedM), surfaceMountEuler(h.n), placedHull,
            { attachment: { slot: 'glacis-bow', supportPoint: h.p, supportNormal: h.n, embedM } })) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      glacisLow(_args, parts, name) {
        for (const zf of [0.44, 0.48, 0.4]) {
          const z = L * zf;
          const h = deckProbe(0, z);
          if (!h) continue;
          const pitch = Math.atan2(h.n.z, Math.max(h.n.y, 0.2));
          if (commit(name, clonePartList(parts), 'hull', V(0, h.p.y + 0.01, z), E(pitch * 0.85, 0, 0), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      hullSideCable(args, parts, name) {
        const side = args.side ?? 1;
        for (const yf of [0.6, 0.52]) {
          const h = hullP.side(H * yf, 0, side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.55) continue;
          // Cable stock runs along local X with its clamps on local Y=0.
          // Seat that clamp plane on the armor, then turn X fore-aft. The old
          // XYZ yaw/roll combination stood the cable upright beside Viper.
          const candidate = clonePartList(parts);
          const embedM = 0.004;
          if (commit(name, candidate, 'hull', roofMountPosition(candidate, h, embedM),
            roofMountEuler(h.n, Math.PI / 2), placedHull, {
              attachment: {
                slot: 'hull-side-cable', supportPoint: h.p, supportNormal: h.n,
                embedM, mountAxis: 'y',
              },
            })) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      hullSideTop(args, parts, name) {
        const side = args.side ?? 1;
        const fx = fenderX(side) ?? (W / 2 - 0.2);
        for (const z0 of [0.1, -0.4]) {
          const seat = seatProbe(hullP, side * fx, z0, 0.2, 1.2, topFrom, 0.3);
          if (!seat) continue;
          if (commit(name, clonePartList(parts), 'hull', V(side * fx, seat.y - 0.004, z0 * 0.5),
            E(0, Math.PI / 2, 0), placedHull, { seatY: seat.y })) {
            disposePartList(parts);
            return true;
          }
        }
        // fallback 1: hang the run nearly FLAT on the upper hull side plate
        // (the classic Tiger cable line) — under the roof, inside the width
        for (const yf of [0.6, 0.52]) {
          const y = H * yf;
          const h = hullP.side(y, 0, side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.55) continue;
          if (commit(name, clonePartList(parts), 'hull', V(h.p.x + side * 0.012, y, 0),
            E(0, Math.PI / 2, side * 1.35), placedHull)) {
            disposePartList(parts);
            return true;
          }
        }
        // fallback 2: horizontal run across the lower bow plate (Tiger bow
        // spare cable) — the bore never reaches this low forward
        {
          const y = H * 0.42;
          const h = hullP.zface(0, y, -1, L / 2 + 1.6);
          if (h && h.n.z > 0.3) {
            const pitch = Math.atan2(-h.n.y, h.n.z);
            if (commit(name, clonePartList(parts), 'hull', V(0, y, h.p.z + 0.04),
              E(pitch + Math.PI / 2 * 0.92, 0, 0), placedHull)) {
              disposePartList(parts);
              return true;
            }
          }
        }
        disposePartList(parts);
        return false;
      },
      // low cantilever rack on the rear plate: jerrycans & tall kit on tanks
      // whose flat rear decks sit inside the full-depression bore sweep
      hullRearRack(args, parts, name) {
        const bb = partsBBox(parts);
        const ph = bb.max.y - bb.min.y;
        const topY = Math.min(rearDeckY - 0.02, boreYAt(Math.abs(sternZ - pivot[2])) - boreR - 0.05);
        const y = topY - ph;
        if (y < H * 0.22) { disposePartList(parts); return false; }
        const h = hullP.zface((args.x || 0) * W, Math.max(H * 0.3, y + ph * 0.4), 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V((args.x || 0) * W, y, h.p.z - (bb.max.z - bb.min.z) / 2 - 0.03),
          E(), placedHull, { seatY: y, zExtra: 0.35 });
      },
      hullSide(args, parts, name) {
        const side = args.side ?? 1;
        const embedM = 0.006;
        // plate flat against the upper hull side (spare tracks, patches)
        const z = (args.zFrac ?? 0) * L;
        for (const yf of [0.55, 0.62, 0.48]) {
          const y = H * yf;
          const h = hullP.side(y, z, side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.7) continue;
          const candidate = clonePartList(parts);
          if (commit(name, candidate, 'hull', surfaceMountPosition(candidate, h, embedM), surfaceMountEuler(h.n), placedHull,
            { attachment: { slot: 'hull-side', supportPoint: h.p, supportNormal: h.n, embedM } })) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      hullRear(args, parts, name) {
        const meta = parts.meta || {};
        if (meta.mount === 'deck') return placeHullRearDeck(args, parts, name);
        // single transverse drum cantilevered off the rear plate (piece origin
        // at bracket base -> drum axis rides meta.centerY above the commit y)
        const cY = meta.centerY || 0.29;
        const axisY = Math.max(H * 0.34 + cY,
          Math.min(rearDeckY - 0.04, boreYAt(Math.abs(sternZ - pivot[2])) - boreR - (meta.clearY || 0.28) - 0.06));
        const h = hullP.zface(0, axisY, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, axisY - cY, h.p.z - (meta.clearY || 0.28) - 0.04), E(), placedHull,
          { seatY: axisY - cY, zExtra: 0.4 });
      },
      hullRearLow(_args, parts, name) {
        const y = Math.max(H * 0.33, rearDeckY * 0.62);
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.16), E(0, 0, (rng() - 0.5) * 0.04), placedHull,
          { seatY: y, zExtra: 0.35 });
      },
      hullRearHang(_args, parts, name) {
        const y = rearDeckY * 0.82;
        const h = hullP.zface(W * 0.26, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        const bb = partsBBox(parts);
        return commit(name, parts, 'hull', V(W * 0.26, y - (bb.max.y - bb.min.y), h.p.z - 0.09), E(), placedHull,
          { zExtra: 0.3 });
      },
      hullRearCage(_args, parts, name) {
        const y = rearDeckY * 0.72;
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.28), E(0, Math.PI, 0), placedHull,
          { seatY: y - 0.25, zExtra: 0.45 });
      },
      bowPair(_args, parts, name) {
        let ok = false;
        for (const s of [-1, 1]) {
          const cl = clonePartList(parts);
          let done = false;
          for (const yf of [0.3, 0.38, 0.24]) {
            const y = H * yf;
            const h = hullP.zface(s * W * 0.28, y, -1, L / 2 + 1.6);
            if (!h || h.n.z < 0.3) continue;
            const pitch = Math.atan2(-h.n.y, h.n.z); // bolt flush to the bow plate
            if (commit(name, cl, 'hull', V(s * W * 0.28, y, h.p.z + 0.005), E(pitch, 0, 0), placedHull)) { done = true; break; }
          }
          if (!done) disposePartList(cl);
          ok = ok || done;
        }
        disposePartList(parts);
        return ok;
      },
      bowChain(_args, parts, name) {
        const y = H * 0.3;
        const h = hullP.zface(-W * 0.28, y, -1, L / 2 + 1.6);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(-W * 0.28, y - 0.02, h.p.z + 0.05), E(), placedHull);
      },
      // ---- turret slots ----
      turretRoof(args, parts, name) {
        const zBase = args.rear ? -Math.max(0.3, sweepR * 0.36) : Math.max(0.24, sweepR * 0.26);
        const xBase = (args.side || 1) * Math.max(0.28, W * 0.1);
        const bb = partsBBox(parts);
        const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z;
        // casemate roofs are big sloped plates: looser flatness gate
        const spread = casemate ? 0.3 : 0.12;
        const minNy = casemate ? 0.6 : 0.8;
        const cands = [[0, 0], [-0.15, -0.1], [0.15, 0.12], [0, -0.24], [-0.1, 0.2], [0.24, 0], [-0.24, 0.06], [0.1, -0.34], [-0.3, -0.2]];
        if (casemate) cands.push([0, -0.7], [0.25, -0.6], [-0.25, -0.85], [0, 0.5], [0.3, 0.45]);
        for (const [dx, dz] of cands) {
          const x = xBase + dx, z = zBase + dz;
          if (Math.abs(x) < 0.24 && z > 0 && !casemate) continue; // gun corridor
          // The repaired Leopard throats are real air, including the full
          // footprint beside the moving shield, not just its center ray.
          if (['leo2a7v_x','leo2a6m_x','leo2a4m_x'].includes(spec.id)) {
            const pivot = turretG.getObjectByName('rig_gun')?.position;
            if (pivot && Math.abs(x-pivot.x)<.44+w/2 && z+d/2>pivot.z-.70) continue;
          }
          const seat = seatProbe(turP, x, z, Math.min(w, 0.42), Math.min(d, 0.42), 3.5, spread);
          if (!seat || !seat.n || seat.n.y < minNy) continue;
          if (commit(name, parts, 'turret', V(x, seat.y - 0.008, z), E(0, (rng() - 0.5) * 0.2, 0), placedTurret)) return true;
        }
        disposePartList(parts);
        return false;
      },
      turretRear(args, parts, name) {
        const bb = partsBBox(parts);
        const d = bb.max.z - bb.min.z;
        if (args.onBasket && basketAnchor) {
          return commit(name, parts, 'turret',
            V(basketAnchor.x, basketAnchor.y + 0.02, basketAnchor.z - (basketAnchor.d || 0.4) / 2),
            E(0, (rng() - 0.5) * 0.3, 0), placedTurret, { allowOverlap: true });
        }
        const x = (args.side || 0) * Math.min(W * 0.18, Math.max(0.22, sweepR * 0.22));
        for (const back of [0.1, 0.3, 0.55]) {
          const z = -(sweepR * 0.55 + back) - d * 0.2;
          const seat = seatProbe(turP, x, z, Math.min(bb.max.x - bb.min.x, 0.5), Math.min(d, 0.35), 3.5, 0.2);
          if (!seat) continue;
          if (commit(name, parts, 'turret', V(x, seat.y - 0.01, z), E(0, (rng() - 0.5) * 0.3, 0), placedTurret)) return true;
        }
        disposePartList(parts);
        return false;
      },
      // Open-mesh veil bonded to a turret side. Rotation maps the kit's
      // horizontal X/Z sheet onto the vertical Y/Z armor face.
      turretVeil(args, parts, name) {
        const side = args.side || 1;
        const zs = args.rear ? [-1.25, -0.95, -1.55, -0.65] : [-0.2, -0.45, 0.05];
        for (const z of zs) {
          for (const yf of args.high ? [0.56, 0.48] : [0.35, 0.5]) {
            const y = Math.max(0.26, pivotTopY() * yf);
            const h = turP.side(y, z, side, W / 2 + 1);
            if (!h || Math.abs(h.n.x) < 0.55) continue;
            if (commit(name, parts, 'turret', V(h.p.x + side * 0.075, y, z),
              E(0, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2), placedTurret,
              { allowOverlap: true })) return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      turretRearFrame(_args, parts, name) {
        // basket bolts to the bustle rear face (open face +Z toward the turret)
        const meta = parts.meta || {};
        for (const yf of [0.3, 0.45, 0.2]) {
          const h = turP.zface(0, Math.max(0.14, (pivotTopY() - 0) * yf), 1, -sweepR - 1.4);
          if (!h || h.n.z > -0.25) continue;
          const y = Math.max(0.1, h.p.y - (meta.h || 0.32) * 0.4);
          if (commit(name, parts, 'turret', V(0, y, h.p.z + 0.01), E(), placedTurret)) {
            basketAnchor = { x: 0, y: y + (meta.h || 0.32) * 0.35, z: h.p.z - 0.02, d: meta.d || 0.4 };
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      turretSide(args, parts, name) {
        const side = args.side ?? 1;
        const bb = partsBBox(parts);
        const out = (bb.max.z - bb.min.z) * 0.35;
        const sideStations = args.rear ? [-0.78, -1.02, -0.58, -1.24] : [-0.2, -0.45, 0.05];
        for (const z of sideStations) {
          for (const yf of [0.35, 0.5]) {
            const y = Math.max(0.18, pivotTopY() * yf);
            const h = turP.side(y, z, side, W / 2 + 1);
            if (!h || Math.abs(h.n.x) < 0.55) continue;
            if (commit(name, clonePartList(parts), 'turret', V(h.p.x + side * out * 0.3, y - 0.06, z),
              E(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, (rng() - 0.5) * 0.1), placedTurret)) {
              disposePartList(parts);
              return true;
            }
          }
        }
        disposePartList(parts);
        return false;
      },
      turretSidePlate(args, parts, name) {
        const side = args.side ?? 1;
        const embedM = 0.006;
        for (const z of [0.05, -0.25]) {
          const y = Math.max(0.2, pivotTopY() * 0.45);
          const h = turP.side(y, z, side, W / 2 + 1);
          if (!h || Math.abs(h.n.x) < 0.6) continue;
          const candidate = clonePartList(parts);
          if (commit(name, candidate, 'turret', surfaceMountPosition(candidate, h, embedM), surfaceMountEuler(h.n), placedTurret,
            { attachment: { slot: 'turret-side', supportPoint: h.p, supportNormal: h.n, embedM } })) {
            disposePartList(parts);
            return true;
          }
        }
        disposePartList(parts);
        return false;
      },
      turretCheekPair(_args, parts, name) {
        let ok = false;
        for (const s of [-1, 1]) {
          const cl = clonePartList(parts);
          let done = false;
          for (const [z, yf] of [[0.3, 0.5], [0.2, 0.42], [0.36, 0.6]]) {
            const y = Math.max(0.24, pivotTopY() * yf);
            const h = turP.side(y, z, s, W / 2 + 1);
            if (!h) continue;
            const yaw = s * 0.55; // forward fan, mirrored about local +Z
            if (commit(name, cl, 'turret', V(h.p.x + s * 0.03, y, z), E(0, yaw, 0), placedTurret)) { done = true; break; }
          }
          if (!done) disposePartList(cl);
          ok = ok || done;
        }
        disposePartList(parts);
        return ok;
      },
    };

    // turret roof height above the pivot (probed once, cached)
    let _pivotTopY: number | null = null;
    function pivotTopY(): number {
      if (_pivotTopY !== null) return _pivotTopY;
      const h = seatProbe(turP, 0, -Math.max(0.2, sweepR * 0.3), 0.3, 0.3, 3.5, 0.5)
        || seatProbe(turP, 0, 0, 0.3, 0.3, 3.5, 0.6);
      _pivotTopY = h ? Math.max(0.3, h.y) : Math.max(0.3, H - pivot[1]);
      return _pivotTopY;
    }

    function createManifestParts(
      row: DecorManifestRow,
      kitFn: DecorKitBuilder,
      jitterSeed: number,
    ): DecorPartList | null {
      try {
        const seed = fnv1a(`${decorId}:${row.kit}:${row.slot[0]}`) ^ jitterSeed;
        const values = { ...(row.v || {}) };
        if (row.kit === 'wheel') values.r = wheelR;
        if (row.kit === 'drums') values._W = W;
        // The mobile tier builds only the coarse forms; other tiers build both levels
        // from identically seeded streams (builders draw before branching on detail).
        if (lowTier) return kitFn({ rng: mulberry32(seed), ...values, detail: 0 });
        const parts = kitFn({ rng: mulberry32(seed), ...values, detail: 1 });
        if (parts) {
          parts.coarse = DETAIL_KITS.has(row.kit)
            ? kitFn({ rng: mulberry32(seed), ...values, detail: 0 })
            : clonePartList(parts);
        }
        return parts;
      } catch (error) {
        return null;
      }
    }

    function placeManifestParts(
      row: DecorManifestRow,
      slotFn: SlotPlacer,
      parts: DecorPartList,
    ): void {
      try {
        const before = summary.skipped.length;
        const pieceName = row.kit === 'cargo'
          ? `cargo:${String(row.v?.v || 'field-kit')}` : row.kit;
        const ok = slotFn(row.slot[1] || {}, parts, pieceName);
        // Slots log guard failures themselves; a silent false is a probe miss
        // where no anchor surface answered.
        if (!ok && summary.skipped.length === before) {
          summary.skipped.push([row.kit, 'probe']);
        }
      } catch (error) {
        summary.skipped.push([row.kit, `slot:${errorMessage(error)}`]);
        try {
          disposePartList(parts);
        } catch (_) {
          // The slot may already have consumed the part list.
        }
      }
    }

    function* attachManifestRows(): Generator<DecorationWorkSlice, void, void> {
      const manifest = decorManifestFor(spec, rng);
      // Reserve functional banks before cosmetic cargo can occupy their seat.
      // A separate stream makes smoke independent of quality-dependent retries
      // without reordering the existing random stream for other equipment.
      const smokeRng = mulberry32(fnv1a(`smoke:${decorId}`));
      for (const row of manifest) {
        if (row.kit !== 'smoke') continue;
        // A declared gameplay fitting is always installed; cosmetic dice
        // must not decide whether a vehicle can use its smoke control.
        const jitterSeed = (smokeRng() * 0x7fffffff) | 0;
        const slotFn = SLOTS[row.slot[0]];
        if (!slotFn) continue;
        const parts = createManifestParts(row, DECOR_KITS.smoke!, jitterSeed);
        if (parts) placeManifestParts(row, slotFn, parts);
      }
      // Radio whips stand at their mounts before loose cargo fills the rear roof
      // (2026-10-05: the molded cargo's larger footprints otherwise crowded every
      // antenna seat). Their own stream keeps the main stream's row draws aligned.
      const antennaRng = mulberry32(fnv1a(`antenna:${decorId}`));
      for (const row of manifest) {
        if (row.kit !== 'antenna') continue;
        const roll = antennaRng(), jitterSeed = (antennaRng() * 0x7fffffff) | 0;
        if (roll > (row.p ?? 1)) continue;
        const slotFn = SLOTS[row.slot[0]];
        if (!slotFn) continue;
        const parts = createManifestParts(row, DECOR_KITS.antenna!, jitterSeed);
        if (parts) placeManifestParts(row, slotFn, parts);
      }
      for (let index = 0; index < manifest.length; index++) {
        const row = manifest[index];
        const roll = rng(), jitterSeed = (rng() * 0x7fffffff) | 0;
        if (row.kit !== 'smoke' && row.kit !== 'antenna' && !(roll > (row.p ?? 1))) {
          const kitFn = DECOR_KITS[row.kit];
          const slotFn = SLOTS[row.slot[0]];
          if (kitFn && slotFn) {
            const parts = createManifestParts(row, kitFn, jitterSeed);
            if (parts) placeManifestParts(row, slotFn, parts);
          }
        }
        yield { stage: 'manifest-row', completed: index + 1, total: manifest.length };
      }
    }
    yield* attachManifestRows();

    // ---- merge per family per frame + attach --------------------------------
    /** Merge one material family's committed geometry into a single draw (or null when empty). */
    function mergeFamily(geos: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
      if (!geos.length) return null;
      const nonIndexed = geos.map((geometry) => {
        if (!geometry.index) return geometry;
        const converted = geometry.toNonIndexed();
        resources.ownGeometry(converted);
        return converted;
      });
      const merged = mergeGeometries(nonIndexed, false);
      if (merged) resources.ownGeometry(merged);
      for (const geometry of nonIndexed) resources.releaseGeometry(geometry);
      return merged;
    }

    function decorMesh(merged: THREE.BufferGeometry, frame: DecorFrame, matKey: DecorMaterialKey,
      level: 'near' | 'coarse', functional: boolean): THREE.Mesh {
      resources.completeGeometry(merged);
      const mesh = new THREE.Mesh(merged, materials.get(matKey));
      mesh.name = `decor_${frame}_${matKey}${level === 'coarse' ? '_coarse' : ''}`;
      // PERF: the fleet's shadow story is proxy-based (procedural proxies /
      // GLB buildShadowProxy) with per-mesh casters swept off — decor
      // follows the same contract. receiveShadow keeps the kit grounded.
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.userData.__decor = true;
      mesh.userData.decorLevel = level;
      // Cosmetic stowage is non-armor dressing that distance detail may drop
      // (combatVisibility.ts); the smoke banks are working equipment.
      mesh.userData.combatHitboxRole = functional ? 'equipment' : 'nonArmor';
      return mesh;
    }

    function* mergeDecorationBucket(
      frame: DecorFrame,
      map: Map<DecorMaterialKey, THREE.BufferGeometry[]>,
      coarseMap: Map<DecorMaterialKey, THREE.BufferGeometry[]>,
      functional: boolean,
    ): Generator<DecorationWorkSlice, number, void> {
      const keys = [...new Set([...map.keys(), ...coarseMap.keys()])];
      if (!keys.length) return 0;
      const parent = frame === 'hull' ? hullG : turretG;
      const g = new THREE.Group();
      g.name = functional ? `rig_decor_${frame}_functional` : frame === 'hull' ? 'rig_decor_hull' : 'rig_decor_turret';
      let drawCalls = 0, done = 0;
      for (const matKey of keys) {
        const geos = map.get(matKey) || [];
        const coarseGeos = coarseMap.get(matKey) || [];
        const merged = mergeFamily(geos);
        const socketOwner = new THREE.Object3D();
        registerSmokeSockets(socketOwner, geos);
        for (const geometry of geos) resources.releaseGeometry(geometry);
        const coarseMerged = mergeFamily(coarseGeos);
        for (const geometry of coarseGeos) resources.releaseGeometry(geometry);
        if (!merged && !coarseMerged) continue;
        const lod = new THREE.LOD();
        if (merged) {
          const mesh = decorMesh(merged, frame, matKey, 'near', functional);
          if (socketOwner.userData.smokeSockets) mesh.userData.smokeSockets = socketOwner.userData.smokeSockets;
          lod.addLevel(mesh, 0);
          drawCalls++;
        } else {
          lod.addLevel(new THREE.Object3D(), 0);
        }
        // LOD: the coarse forms from DECOR_COARSE_DIST, nothing past the fleet's greeble horizon
        if (coarseMerged) lod.addLevel(decorMesh(coarseMerged, frame, matKey, 'coarse', functional), DECOR_COARSE_DIST, 0.1);
        lod.addLevel(new THREE.Object3D(), DECOR_LOD_DIST, 0.1);
        g.add(lod);
        done++;
        yield { stage: 'material-bucket', completed: done, total: keys.length };
      }
      resources.addGroup(parent, g);
      g.userData.combatHitboxRole = functional ? 'equipment' : 'nonArmor';
      g.userData.decorFunctional = functional;
      return drawCalls;
    }

    let drawCalls = 0;
    for (const frame of ['hull', 'turret'] as const) {
      drawCalls += yield* mergeDecorationBucket(frame, buckets[frame], coarseBuckets[frame], false);
      drawCalls += yield* mergeDecorationBucket(frame, functionalBuckets[frame], new Map(), true);
    }
    yield { stage: 'publish', completed: resources.groupCount(), total: resources.groupCount() };
    summary.tris = budget.tris;
    summary.drawCalls = drawCalls;
    resources.publish(summary, materials);
    return summary;
  } finally {
    if (claimed) resources.cancel(mats);
  }
}

export { buildDecorMaterials, DECOR_LOD_DIST };
