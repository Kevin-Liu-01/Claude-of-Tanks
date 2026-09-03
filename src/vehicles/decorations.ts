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
//    decor ON by default — no call-site changes required.
//  * Per-tank selection is DETERMINISTIC, seeded by SPEC ID only (never
//    camoSeed): the same tank always wears the same kit; variation lives
//    ACROSS the fleet, stability per vehicle.
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

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  vehicleAmbientFloorHook, getKitPaintTexture, getSharedRoughnessTexture,
} from './materials.ts';
import { VEHICLE_ERAS, isContemporaryVehicleEra } from './taxonomy.ts';
import type { FleetTankSpec } from './specContracts.ts';

type Rng = () => number;
type GeometryScale = number | readonly [number, number, number];
type DecorFrame = 'hull' | 'turret';
type DecorMaterialKey = 'kit' | 'steel' | 'wood' | 'canvas' | 'burlap'
  | 'rubber' | 'cans' | 'net' | 'mesh' | 'lens';

interface DecorOptions {
  proceduralOnly?: boolean;
  decor?: boolean;
}

interface ShadowEngineContext {
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
}

interface DecorKitArgs {
  rng: Rng;
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

export type FleetEquipmentNationStyle =
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

export type FleetEquipmentVariant = typeof FLEET_EQUIPMENT_VARIANTS[number];

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

interface DecorationAttachmentArgs {
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// ---------------------------------------------------------------------------
// Deterministic seeding — spec id ONLY (mandate: stable per vehicle).
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
const capX = (r: number, len: number, seg = 8) =>
  xform(new THREE.CapsuleGeometry(r, Math.max(len - 2 * r, 0.01), 2, seg), 0, 0, 0, 0, 0, Math.PI / 2);
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
function isRealShadowCtx(engineCtx: ShadowEngineContext | null | undefined): boolean {
  if (!engineCtx || typeof engineCtx.setupShadowMaterial !== 'function') return false;
  if (CTX_PROBED.has(engineCtx)) return CTX_PROBED.get(engineCtx) ?? false;
  let real = false;
  try {
    const probe = new THREE.MeshStandardMaterial();
    engineCtx.setupShadowMaterial(probe);
    real = !!(probe.defines && probe.defines.USE_CSM);
    probe.dispose();
  } catch (e) { real = false; }
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
  const defs: Record<DecorMaterialKey, () => THREE.MeshStandardMaterialParameters> = {
    // scheme-painted steel kit: the shared per-spec kit-paint canvas keeps
    // bolt-on hardware in the ACTIVE camo pattern's tonal family and live-
    // repaints with garage pattern switches (same texture the ARAT/stowage
    // add-on path uses — crews spray hard kit, never soft kit).
    kit: () => ({
      map: getKitPaintTexture(spec), roughnessMap: getSharedRoughnessTexture(spec),
      roughness: 0.86, metalness: 0.06, vertexColors: true, envMapIntensity: 0.35,
    }),
    // dark oily gunmetal: MGs, cables, tools, shackles, track links
    steel: () => ({
      color: equipmentPalette.steel, roughness: 0.62, metalness: 0.35,
      roughnessMap: getSharedRoughnessTexture(spec),
      vertexColors: true, envMapIntensity: 0.35,
    }),
    wood: () => ({
      map: woodTex(), color: 0x97815f, roughness: 0.9, metalness: 0.02,
      vertexColors: true, envMapIntensity: 0.15,
    }),
    canvas: () => ({
      map: weaveTex(), color: equipmentPalette.canvas, roughness: 0.96, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.12,
    }),
    burlap: () => ({
      map: weaveTex(), color: equipmentPalette.burlap, roughness: 0.98, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.1,
    }),
    rubber: () => ({
      color: 0x232425, roughness: 0.94, metalness: 0.04,
      vertexColors: true, envMapIntensity: 0.12,
    }),
    cans: () => ({ // authored-color hardware (jerrycans): tint baked per piece
      map: fieldHardwareTex(), color: 0xffffff, roughness: 0.82, metalness: 0.07,
      roughnessMap: getSharedRoughnessTexture(spec),
      vertexColors: true, envMapIntensity: 0.2,
    }),
    net: () => ({
      map: netTex(), color: equipmentPalette.net, roughness: 0.95, metalness: 0.0,
      alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.1,
    }),
    mesh: () => ({ // wire-grid panels (baskets, cages)
      map: gridTex(), color: equipmentPalette.mesh, roughness: 0.7, metalness: 0.35,
      alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.25,
    }),
    lens: () => ({ // optic faces / vision blocks / searchlight glass
      color: 0x161d23, roughness: 0.28, metalness: 0.6, envMapIntensity: 0.55,
      vertexColors: true,
    }),
  };
  return {
    get(key: DecorMaterialKey) {
      if (!made[key]) {
        const def = { ...defs[key]() };
        if (!def.map) delete def.map; // node safety (no canvas available)
        made[key] = setup(new THREE.MeshStandardMaterial(def));
        made[key]!.name = `Decor_${key}`;
      }
      return made[key]!;
    },
    all: () => made,
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
  aamg({ rng, v = 'm2', shield = false, ring = false }) {
    const parts: DecorPartList = [];
    const steel = (geo: THREE.BufferGeometry, t = 0.6) => parts.push({ mat: 'steel', geo: bakeShade(geo, t + rng() * 0.06) });
    const kit = (geo: THREE.BufferGeometry, t = 0.95) => parts.push({ mat: 'kit', geo: bakeShade(geo, t) });
    const H = 0.30;                          // trunnion height above seat
    if (ring) {                              // ring mount: rail + 4 standoffs
      steel(xform(torus(0.33, 0.016, 20, 5), 0, 0.10, 0), 0.55);
      for (let i = 0; i < 4; i++) {
        const a = i * (Math.PI * 2 / 4) + 0.5;
        steel(xform(cylY(0.014, 0.014, 0.10, 6), Math.sin(a) * 0.33, 0.05, Math.cos(a) * 0.33), 0.5);
      }
    }
    // Flanged slew bearing, spindle, bridge, fork arms and trunnion form a
    // visible load path. This decoration path used to be the last fleet-wide
    // source of a receiver floating on a single rod.
    steel(xform(cylY(0.050, 0.060, 0.024, 12), 0, 0.012, 0), 0.54);
    steel(xform(torus(0.050, 0.008, 16, 5), 0, 0.026, 0), 0.48);
    steel(xform(cylY(0.025, 0.032, H - 0.06, 10), 0, H / 2 - 0.015, 0), 0.5);
    steel(xform(box(0.145, 0.045, 0.13), 0, H - 0.055, 0.02), 0.53);
    for (const side of [-1, 1]) {
      steel(xform(box(0.022, 0.095, 0.105), side * 0.055, H - 0.015, 0.055,
        side * 0.05), 0.52);
    }
    steel(xform(cylX(0.029, 0.145, 10), 0, H, 0.07), 0.55);
    const recY = H + 0.055;
    const gunFrom = parts.length;            // parts from here ride the cradle
    if (v === 'dshk') {
      steel(xform(box(0.11, 0.12, 0.42), 0, recY, -0.05), 0.62);               // receiver
      steel(xform(box(0.10, 0.018, 0.37), 0, recY + 0.069, -0.04), 0.58);      // top cover
      steel(xform(box(0.020, 0.075, 0.22), 0.066, recY, -0.06), 0.52);         // service plate
      for (let i = 0; i < 5; i++) {
        steel(xform(cylZ(0.040, 0.020, 10), 0, recY + 0.01, 0.205 + i * 0.031), 0.50);
      }
      steel(xform(cylZ(0.026, 0.62, 10), 0, recY + 0.01, 0.48), 0.58);         // barrel
      steel(xform(cylZ(0.055, 0.075, 10, 0.028), 0, recY + 0.01, 0.80), 0.55);// muzzle booster
      steel(xform(box(0.05, 0.14, 0.05), 0, recY - 0.12, -0.24, 0.5), 0.5);   // spade grips
      steel(xform(box(0.095, 0.12, 0.24), -0.115, recY + 0.01, 0.02), 0.58);  // belt box
    } else {                                  // Browning M2HB
      steel(xform(box(0.105, 0.115, 0.46), 0, recY, -0.02), 0.62);            // receiver
      steel(xform(box(0.097, 0.018, 0.405), 0, recY + 0.066, -0.015), 0.58);  // hinged cover
      steel(xform(box(0.020, 0.070, 0.23), 0.064, recY, -0.045), 0.52);       // side plate
      steel(xform(box(0.050, 0.017, 0.075), -0.080, recY + 0.02, -0.04), 0.5);// charge handle
      steel(xform(cylZ(0.034, 0.24, 12), 0, recY + 0.012, 0.29), 0.52);       // barrel jacket
      for (let i = 0; i < 5; i++) {
        steel(xform(torus(0.0345, 0.004, 10, 4), 0, recY + 0.012, 0.19 + i * 0.042), 0.48);
      }
      steel(xform(cylZ(0.021, 0.56, 10), 0, recY + 0.012, 0.46), 0.58);       // barrel
      steel(xform(cylZ(0.034, 0.075, 12), 0, recY + 0.012, 0.778), 0.54);     // flash hider
      steel(xform(box(0.032, 0.05, 0.07), 0, recY + 0.09, -0.20), 0.5);       // rear sight
      for (const side of [-1, 1]) {
        steel(xform(box(0.022, 0.026, 0.10), side * 0.034, recY - 0.02, -0.255,
          side * 0.08), 0.5);
      }
      steel(xform(box(0.095, 0.12, 0.24), -0.115, recY - 0.01, 0.03), 0.58); // ammo can
    }
    // Connected disintegrating-link run. Ammunition stays steel/gunmetal and
    // never samples the host camouflage.
    for (let index = 0; index < 5; index++) {
      const t = index / 4;
      steel(xform(box(0.018, 0.026, 0.024), -0.112 + t * 0.075,
        recY + 0.025 + t * 0.010, 0.11 + t * 0.08, 0, 0, -0.10 + t * 0.15),
      index % 2 ? 0.52 : 0.61);
    }
    if (shield) {
      // Split, shallow-chevron shield with edge ribs and real lower braces.
      for (const side of [-1, 1]) {
        kit(xform(box(0.235, 0.30, 0.026), side * 0.14, recY + 0.09, 0.15,
          0, -side * 0.055, side * 0.035), 0.9);
        steel(xform(box(0.022, 0.275, 0.034), side * 0.262, recY + 0.08, 0.135), 0.5);
        steel(xform(box(0.024, 0.024, 0.18), side * 0.14, recY - 0.03, 0.06,
          -0.26, 0, side * 0.08), 0.5);
      }
      kit(xform(box(0.32, 0.036, 0.034), 0, recY + 0.255, 0.145), 0.9);
      steel(xform(box(0.15, 0.10, 0.028), 0, recY + 0.12, 0.175), 0.52);      // sight cutout frame
    }
    // gun + shield stowed muzzle-up ~7 deg about the trunnion; mount stays plumb
    for (let i = gunFrom; i < parts.length; i++) {
      xform(parts[i].geo, 0, -H, 0);
      xform(parts[i].geo, 0, 0, 0, -7 * D2R, 0, 0);
      xform(parts[i].geo, 0, H, 0);
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
  smoke({ rng, v = '6' }) {
    const n = parseInt(v, 10) || 6;
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
      const g = cylZ(0.032, 0.21, 8);
      xform(g, 0, 0, 0.075);                        // tube forward of its pivot
      // dark muzzle cap disc crisps the tube read at gameplay distance
      const cap = xform(cylZ(0.0335, 0.014, 8), 0, 0, 0.185);
      xform(g, 0, 0, 0, -34 * D2R, cant, 0);        // elevated + fanned
      xform(cap, 0, 0, 0, -34 * D2R, cant, 0);
      parts.push({ mat: 'kit', geo: bakeShade(xform(g, x, y, 0.02), tone * (0.94 + rng() * 0.1)) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cap, x, y, 0.02), 0.4) });
    }
    return parts;
  },

  // -- stowage boxes: wood crate / steel bin / long fender box ------------------
  bin({ rng, v = 'steel', w = 0.55, h = 0.28, d = 0.4 }) {
    const parts: DecorPartList = [];
    if (v === 'crate') {
      parts.push({ mat: 'wood', geo: bakeShade(boxUV(xform(box(w, h, d), 0, h / 2, 0), 2.2), 0.9 + rng() * 0.2) });
      for (const sy of [0.14, 0.9]) { // batten frames
        parts.push({ mat: 'wood', geo: bakeShade(boxUV(xform(box(w + 0.022, 0.035, d + 0.022), 0, h * sy, 0), 2.2), 0.68) });
      }
    } else if (v === 'long') { // fender-length box with proud lid
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h, d), 0, h / 2, 0), 0.94 + rng() * 0.1) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w * 1.012, 0.03, d * 1.03), 0, h + 0.012, 0), 1.04) });
      for (const fx of [-w * 0.32, w * 0.32]) { // hasp straps
        parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.03, h * 0.8, 0.012), fx, h * 0.45, d / 2 + 0.007), 0.6) });
      }
    } else { // steel bin, rounded lid + clasp
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(w, h * 0.8, d), 0, h * 0.4, 0), 0.95 + rng() * 0.08) });
      parts.push({ mat: 'kit', geo: bakeShade(xform(cylX(d * 0.49, w * 0.99, 10), 0, h * 0.8, 0), 1.03) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.03, 0.05), 0, h * 0.8 + d * 0.45, 0), 0.6) });
    }
    return parts;
  },

  // -- rolled tarp / canvas roll --------------------------------------------------
  tarp({ rng, v = 'fat', len = 0.9 }) {
    const parts: DecorPartList = [];
    const R = v === 'fat' ? 0.125 : 0.085;
    const tone = 0.85 + rng() * 0.25;
    const body = boxUV(capX(R, len, 9), 2.6);
    const pos = body.attributes.position;  // sag the ends a touch
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setY(i, pos.getY(i) - Math.pow(Math.abs(x) / (len / 2 + 0.01), 2) * 0.02);
    }
    body.computeVertexNormals();
    parts.push({ mat: 'canvas', geo: bakeShade(xform(body, 0, R * 0.92, 0), tone) });
    for (const s of [-0.3, 0.3]) { // cinch straps
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(R + 0.006, 0.011, 9, 4), s * len, R * 0.92, 0, 0, Math.PI / 2, 0), 0.42) });
    }
    return parts;
  },

  // -- camo netting: rolled bundle or draped flat patch ---------------------------
  camonet({ rng, v = 'roll', len = 1.0, w = 0.9 }) {
    const parts: DecorPartList = [];
    if (v === 'roll') {
      const R = 0.135;
      const body = boxUV(capX(R, len, 9), 2.0);
      const pos = body.attributes.position;   // lumpy roll
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const k = 1 + 0.12 * Math.sin(x * 9.1 + 2) * Math.sin(y * 7 + z * 8);
        pos.setY(i, y * k); pos.setZ(i, z * k);
      }
      body.computeVertexNormals();
      parts.push({ mat: 'canvas', geo: bakeShade(xform(body, 0, R, 0), 0.6 + rng() * 0.1) });
      // net skin wrapped over the top half (open half-cylinder shell)
      const wrap = new THREE.CylinderGeometry(R + 0.012, R + 0.012, len * 0.94, 10, 1, true, -Math.PI / 2, Math.PI);
      xform(wrap, 0, 0, 0, 0, 0, Math.PI / 2);
      parts.push({ mat: 'net', geo: bakeShade(boxUV(xform(wrap, 0, R, 0), 1.8), 0.95) });
      for (const s of [-0.32, 0.02, 0.34]) {
        parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(R + 0.014, 0.01, 9, 4), s * len, R, 0, 0, Math.PI / 2, 0), 0.45) });
      }
    } else { // draped flat patch (alpha-tested sheet with sag + hang)
      const g = new THREE.PlaneGeometry(w, len, 7, 7);
      xform(g, 0, 0, 0, -Math.PI / 2, 0, 0);
      const pos = g.attributes.position;
      const seed = rng() * 10;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const edge = Math.max(Math.abs(x) / (w / 2), Math.abs(z) / (len / 2));
        pos.setY(i, 0.06 + 0.05 * Math.sin(x * 6 + seed) * Math.cos(z * 5 - seed) - edge * edge * 0.11);
      }
      g.computeVertexNormals();
      parts.push({ mat: 'net', geo: bakeShade(boxUV(g, 1.4), 1.0 + rng() * 0.15, 0.12) });
    }
    return parts;
  },

  // -- unditching log (rear-strapped beam, axis X) ---------------------------------
  log({ rng, len = 2.4 }) {
    const parts: DecorPartList = [];
    const R = 0.115;
    parts.push({ mat: 'wood', geo: bakeShade(boxUV(cylX(R, len, 9, R * 0.94), 2.0), 0.6 + rng() * 0.12) });
    for (const s of [-1, 1]) {
      parts.push({ mat: 'wood', geo: bakeShade(xform(cylX(R * 0.88, 0.03, 9), s * (len / 2 + 0.012), 0, 0), 0.95) }); // pale end cut
      parts.push({ mat: 'steel', geo: bakeShade(xform(torusV(R + 0.008, 0.013, 9, 4), s * len * 0.31, 0, 0, 0, Math.PI / 2, 0), 0.42) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.028, 0.10, 0.012), s * len * 0.31, -R * 0.5, R + 0.02), 0.42) }); // strap tail
    }
    return parts;
  },

  // -- soft stowage: rucksack / bedroll / duffel cluster -----------------------------
  packs({ rng, n = 3 }) {
    const parts: DecorPartList = [];
    let x = 0;
    for (let i = 0; i < n; i++) {
      const kind = rng();
      const tone = 0.52 + rng() * 0.34;
      if (kind < 0.4) {        // rucksack: squashed sphere + flap
        const w = 0.26 + rng() * 0.06, h = 0.3 + rng() * 0.07, d = 0.2;
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(sph(0.5), x, h * 0.42, 0, rng() * 0.5 - 0.2, rng(), 0, [w, h * 0.62, d]), 2.4), tone) });
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(box(w * 0.75, 0.06, d * 1.02), x, h * 0.6, 0, -0.3), 2.4), tone * 0.88) });
        x += w * 0.95;
      } else if (kind < 0.75) { // bedroll
        const len = 0.5 + rng() * 0.15;
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(capX(0.085, len, 8), x, 0.085, 0, 0, (rng() - 0.5) * 0.5, 0), 2.6), tone) });
        x += 0.26;
      } else {                  // duffel
        parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(capX(0.11, 0.42, 8), x, 0.11, 0.02, 0, rng() * 0.8, 0), 2.6), tone) });
        x += 0.3;
      }
    }
    xformParts(parts, -x / 2 + 0.12, 0, 0);
    return parts;
  },

  // -- loose crew cargo: 24 named, material-authored variants ---------------------
  // Small pieces are deliberately a little graphic at gameplay distance: lids,
  // handles, straps and latches remain separate instead of becoming one grey
  // cuboid after merging.  Every geometry still originates at its physical seat.
  cargo({ rng, v = 'beer-cooler-blue', scale = 1, nation = '', flat }) {
    const variant = (FLEET_EQUIPMENT_VARIANTS as readonly string[]).includes(v)
      ? v as FleetEquipmentVariant : 'beer-cooler-blue';
    const equipmentPalette = equipmentPaletteForNation(nation);
    const parts: DecorPartList = [];
    const paint = (geo: THREE.BufferGeometry, rgb: readonly [number, number, number], ao = 0.26) => {
      // Cargo is seen beneath the same sun/IBL as the tank. Raw near-primary
      // tints therefore read as glossy toys even on a weathered armor shell.
      // Keep the hue identity, but lower its value and pull only the brightest
      // colors slightly toward their neutral luminance (paint fade + grime).
      const countryTint = equipmentPalette.accent;
      const countryMix = nation ? 0.16 : 0;
      const themed: readonly [number, number, number] = [
        rgb[0] * (1 - countryMix) + countryTint[0] * countryMix,
        rgb[1] * (1 - countryMix) + countryTint[1] * countryMix,
        rgb[2] * (1 - countryMix) + countryTint[2] * countryMix,
      ];
      const peak = Math.max(themed[0], themed[1], themed[2], 0.0001);
      // Values here are linear-space vertex multipliers; a seemingly modest
      // 0.4 displays much brighter after output transfer. Keep peaks down in
      // the painted-hardware range so red/blue pieces do not glow against camo.
      const scale = Math.min(0.72, 0.18 / peak);
      const neutral = ((themed[0] + themed[1] + themed[2]) / 3) * scale;
      const fade = peak > 0.48 ? 0.28 : 0;
      const muted: readonly [number, number, number] = [
        themed[0] * scale * (1 - fade) + neutral * fade,
        themed[1] * scale * (1 - fade) + neutral * fade,
        themed[2] * scale * (1 - fade) + neutral * fade,
      ];
      parts.push({ mat: 'cans', geo: bakeTint(geo, muted[0], muted[1], muted[2], ao) });
    };
    const steel = (geo: THREE.BufferGeometry, tone = 0.52) => {
      parts.push({ mat: 'steel', geo: bakeShade(geo, tone + rng() * 0.04) });
    };
    const cloth = (geo: THREE.BufferGeometry, tone = 0.78) => {
      parts.push({ mat: 'canvas', geo: bakeShade(boxUV(geo, 2.5), tone + rng() * 0.05) });
    };
    const wood = (geo: THREE.BufferGeometry, tone = 0.82) => {
      parts.push({ mat: 'wood', geo: bakeShade(boxUV(geo, 2.2), tone + rng() * 0.05) });
    };
    const strap = (x: number, y: number, z: number, w: number, h: number, d: number) => {
      parts.push({ mat: 'rubber', geo: bakeShade(xform(box(w, h, d), x, y, z), 0.58) });
    };
    const hardCase = (
      rgb: readonly [number, number, number], w = 0.46, h = 0.25, d = 0.32,
      lid: readonly [number, number, number] = rgb,
    ) => {
      paint(xform(box(w, h * 0.78, d), 0, h * 0.39, 0), rgb);
      paint(xform(box(w * 1.03, h * 0.22, d * 1.035), 0, h * 0.89, 0), lid, 0.18);
      steel(xform(box(w * 0.26, 0.025, 0.035), 0, h + 0.025, -d * 0.28));
      for (const side of [-1, 1]) steel(xform(box(0.026, h * 0.30, 0.035), side * w * 0.36, h * 0.49, d * 0.51), 0.46);
    };
    const jerryCan = (x: number, rgb: readonly [number, number, number], scale = 1) => {
      const w = 0.18 * scale, h = 0.40 * scale, d = 0.29 * scale;
      paint(xform(box(w, h, d), x, h / 2, 0), rgb);
      // stamped X panel and a real open handle/spout silhouette
      for (const rz of [-0.58, 0.58]) {
        paint(xform(box(0.016 * scale, h * 0.68, 0.022 * scale), x, h * 0.47, d / 2 + 0.012, 0, 0, rz),
          [rgb[0] * 1.08, rgb[1] * 1.08, rgb[2] * 1.08]);
      }
      paint(xform(box(w * 0.72, 0.035 * scale, 0.045 * scale), x, h + 0.04 * scale, 0), rgb);
      paint(xform(box(0.028 * scale, 0.085 * scale, 0.045 * scale), x - w * 0.32, h, 0), rgb);
      paint(xform(box(0.028 * scale, 0.085 * scale, 0.045 * scale), x + w * 0.32, h, 0), rgb);
      steel(xform(cylY(0.025 * scale, 0.029 * scale, 0.045 * scale, 7), x - w * 0.27, h + 0.055 * scale, -d * 0.28));
    };

    switch (variant) {
      case 'beer-cooler-blue': { // weathered field cooler, not a clean/emissive toy block
        const w = 0.50, h = 0.28, d = 0.34;
        const body: readonly [number, number, number] = [0.08, 0.19, 0.29];
        const bodyRaised: readonly [number, number, number] = [0.10, 0.22, 0.32];
        const bodyScuff: readonly [number, number, number] = [0.07, 0.15, 0.21];
        const lid: readonly [number, number, number] = [0.50, 0.52, 0.49];
        const lidEdge: readonly [number, number, number] = [0.41, 0.43, 0.41];

        paint(xform(box(w, h * 0.78, d), 0, h * 0.39, 0), body, 0.34);
        paint(xform(box(w * 1.025, h * 0.22, d * 1.025), 0, h * 0.89, 0), lid, 0.30);
        paint(xform(box(w * 0.72, 0.012, d * 0.70), 0, h * 1.015, 0), lidEdge, 0.38);
        paint(xform(box(w * 1.01, 0.034, d * 1.015), 0, h * 0.77, 0), lidEdge, 0.34);
        paint(xform(box(w * 0.90, 0.025, d * 1.018), 0, 0.035, 0), bodyScuff, 0.40);
        for (const z of [-1, 1]) {
          const faceZ = z * (d / 2 + 0.004);
          paint(xform(box(w * 0.70, h * 0.43, 0.012), 0, h * 0.40, faceZ), bodyRaised, 0.38);
          for (const x of [-0.20, 0.20]) {
            paint(xform(box(0.024, h * 0.60, 0.014), x, h * 0.40, faceZ + z * 0.002), bodyScuff, 0.42);
          }
        }
        paint(xform(box(w * 0.30, 0.026, 0.036), 0, h + 0.018, -d * 0.24), bodyScuff, 0.40);
        for (const side of [-1, 1]) {
          paint(xform(box(0.026, h * 0.29, 0.036), side * w * 0.34, h * 0.49, d * 0.505), bodyScuff, 0.42);
          paint(xform(box(0.050, 0.038, 0.026), side * w * 0.26, h * 0.79, -d * 0.515), lidEdge, 0.40);
          paint(xform(box(0.042, 0.070, 0.022), side * w * 0.22, h * 0.69, d * 0.518), bodyRaised, 0.40);
        }
        break;
      }
      case 'cooler-red':
        hardCase([0.82, 0.12, 0.09], 0.45, 0.25, 0.31, [0.96, 0.96, 0.92]);
        break;
      case 'insulated-chest-olive':
        hardCase([0.34, 0.40, 0.20], 0.56, 0.27, 0.36, [0.48, 0.50, 0.29]);
        strap(-0.18, 0.15, 0.185, 0.035, 0.22, 0.025);
        strap(0.18, 0.15, 0.185, 0.035, 0.22, 0.025);
        break;
      case 'long-duffel':
        cloth(xform(capX(0.14, 0.72, 10), 0, 0.14, 0, 0, 0.08, 0), 0.66);
        for (const side of [-0.23, 0.23]) strap(side, 0.15, 0, 0.026, 0.24, 0.30);
        steel(xform(torusV(0.12, 0.012, 9, 4), 0, 0.29, 0, Math.PI / 2, 0, 0));
        break;
      case 'large-rucksack':
        cloth(xform(sph(0.5, 11, 7), 0, 0.22, 0, -0.10, 0.12, 0, [0.42, 0.38, 0.25]), 0.62);
        cloth(xform(box(0.35, 0.10, 0.26), 0, 0.35, 0.015, -0.20), 0.58);
        for (const side of [-1, 1]) strap(side * 0.13, 0.22, 0.135, 0.028, 0.33, 0.022);
        break;
      case 'bedroll-pair':
        for (const z of [-0.105, 0.105]) {
          cloth(xform(capX(0.085, 0.55, 9), 0, 0.085, z), z < 0 ? 0.67 : 0.82);
          for (const x of [-0.15, 0.15]) strap(x, 0.088, z, 0.018, 0.17, 0.18);
        }
        break;
      case 'folded-tarp-pack':
        for (let i = 0; i < 3; i++) cloth(xform(box(0.50 - i * 0.035, 0.065, 0.34 - i * 0.02), 0, 0.035 + i * 0.064, 0), 0.70 + i * 0.06);
        for (const x of [-0.15, 0.15]) strap(x, 0.11, 0, 0.025, 0.22, 0.36);
        break;
      case 'camo-net-bag': {
        const bag = xform(sph(0.5, 10, 7), 0, 0.18, 0, 0.12, -0.18, 0, [0.46, 0.32, 0.34]);
        cloth(bag, 0.52);
        const skin = xform(sph(0.505, 10, 7), 0, 0.18, 0, 0.12, -0.18, 0, [0.47, 0.33, 0.35]);
        parts.push({ mat: 'net', geo: bakeShade(boxUV(skin, 1.9), 0.92) });
        strap(0, 0.34, 0, 0.30, 0.026, 0.035);
        break;
      }
      case 'nato-fuel-can':
        jerryCan(-0.105, equipmentPalette.fuelA, 0.92);
        jerryCan(0.105, equipmentPalette.fuelB, 0.92);
        steel(xform(box(0.44, 0.025, 0.33), 0, 0.015, 0), 0.48);
        for (const side of [-1, 1]) steel(xform(box(0.024, 0.36, 0.33), side * 0.215, 0.18, 0), 0.48);
        break;
      case 'blue-water-can':
        jerryCan(-0.105, equipmentPalette.waterA, 0.92);
        jerryCan(0.105, equipmentPalette.waterB, 0.92);
        steel(xform(box(0.44, 0.025, 0.33), 0, 0.015, 0), 0.48);
        for (const side of [-1, 1]) steel(xform(box(0.024, 0.36, 0.33), side * 0.215, 0.18, 0), 0.48);
        break;
      case 'twin-can-cradle':
        jerryCan(-0.11, equipmentPalette.fuelA, 0.90);
        jerryCan(0.11, equipmentPalette.fuelB, 0.90);
        steel(xform(box(0.46, 0.025, 0.34), 0, 0.015, 0), 0.48);
        for (const side of [-1, 1]) steel(xform(box(0.025, 0.38, 0.34), side * 0.22, 0.19, 0), 0.48);
        break;
      case 'soviet-tool-can':
        paint(xform(cylX(0.13, 0.60, 12), 0, 0.13, 0), equipmentPalette.toolCan);
        for (const x of [-0.26, 0.26]) steel(xform(torusV(0.135, 0.012, 12, 4), x, 0.13, 0, 0, Math.PI / 2, 0));
        steel(xform(box(0.18, 0.025, 0.045), 0, 0.28, 0));
        break;
      case 'fifty-cal-ammo-can':
        hardCase(equipmentPalette.ammoCase, 0.36, 0.24, 0.20, equipmentPalette.toolCan);
        break;
      case 'wood-ammo-crate':
        wood(xform(box(0.58, 0.28, 0.34), 0, 0.14, 0), 0.76);
        for (const x of [-0.23, 0.23]) wood(xform(box(0.055, 0.30, 0.36), x, 0.15, 0), 0.58);
        for (const z of [-0.145, 0.145]) steel(xform(box(0.46, 0.025, 0.025), 0, 0.29, z), 0.44);
        break;
      case 'ration-case':
        hardCase([0.52, 0.36, 0.18], 0.42, 0.22, 0.30, [0.62, 0.45, 0.25]);
        for (const x of [-0.12, 0.12]) paint(xform(box(0.045, 0.04, 0.012), x, 0.18, 0.157), [0.92, 0.78, 0.42]);
        break;
      case 'medical-case':
        hardCase([0.33, 0.42, 0.22], 0.42, 0.24, 0.28, [0.40, 0.50, 0.26]);
        paint(xform(box(0.05, 0.14, 0.014), 0, 0.125, 0.148), [0.92, 0.90, 0.84]);
        paint(xform(box(0.14, 0.05, 0.014), 0, 0.125, 0.149), [0.92, 0.90, 0.84]);
        break;
      case 'mechanics-tool-chest':
        hardCase([0.68, 0.10, 0.07], 0.52, 0.24, 0.28, [0.78, 0.14, 0.09]);
        for (const x of [-0.16, 0.16]) steel(xform(box(0.045, 0.055, 0.025), x, 0.19, 0.15), 0.64);
        break;
      case 'fire-extinguisher':
        paint(xform(cylY(0.105, 0.115, 0.44, 12), 0, 0.22, 0), equipmentPalette.extinguisher);
        paint(xform(cylY(0.07, 0.10, 0.08, 10), 0, 0.48, 0), equipmentPalette.extinguisher);
        steel(xform(box(0.19, 0.025, 0.035), 0.06, 0.54, 0), 0.54);
        steel(xform(torusV(0.11, 0.014, 12, 4), 0, 0.25, 0, Math.PI / 2, 0, 0), 0.48);
        // Fleet cargo bottles are normally transported on their side in a
        // low retaining cradle. Profile-authored emergency bottles may still
        // opt into the upright silhouette with `flat:false`.
        if (flat !== false) {
          xformParts(parts, -0.27, 0.16, 0, 0, 0, -Math.PI / 2);
          for (const x of [-0.14, 0.14]) {
            steel(xform(box(0.025, 0.025, 0.25), x, 0.025, 0), 0.45);
          }
        }
        break;
      case 'cable-reel':
        for (const x of [-0.14, 0.14]) wood(xform(cylX(0.18, 0.035, 12), x, 0.18, 0), 0.68);
        wood(xform(cylX(0.08, 0.30, 10), 0, 0.18, 0), 0.58);
        for (let i = 0; i < 5; i++) steel(xform(torusV(0.085 + i * 0.012, 0.010, 12, 4), -0.10 + i * 0.05, 0.18, 0, 0, Math.PI / 2, 0), 0.42);
        break;
      case 'helmet-bundle':
        for (const x of [-0.15, 0, 0.15]) {
          paint(xform(sph(0.5, 10, 6), x, 0.10 + Math.abs(x) * 0.12, 0, 0, 0, 0, [0.24, 0.14, 0.22]), [0.30, 0.38, 0.19]);
          steel(xform(box(0.08, 0.015, 0.025), x, 0.19 + Math.abs(x) * 0.12, 0));
        }
        strap(0, 0.11, 0, 0.40, 0.025, 0.035);
        break;
      case 'crew-backpack':
        cloth(xform(box(0.38, 0.38, 0.22), 0, 0.19, 0), 0.60);
        cloth(xform(box(0.32, 0.12, 0.235), 0, 0.32, 0.012, -0.18), 0.56);
        for (const x of [-0.12, 0.12]) strap(x, 0.19, 0.12, 0.025, 0.34, 0.02);
        cloth(xform(box(0.20, 0.12, 0.08), 0, 0.09, 0.15), 0.66);
        break;
      case 'folding-chair':
        for (const x of [-0.18, 0.18]) {
          steel(xform(cylY(0.012, 0.012, 0.48, 5), x, 0.24, -0.08, 0, 0, x < 0 ? -0.16 : 0.16));
          steel(xform(cylY(0.012, 0.012, 0.48, 5), x, 0.24, 0.08, 0, 0, x < 0 ? 0.16 : -0.16));
        }
        cloth(xform(box(0.42, 0.025, 0.28), 0, 0.27, 0), 0.64);
        cloth(xform(box(0.42, 0.24, 0.025), 0, 0.41, -0.13, -0.12), 0.68);
        break;
      case 'spare-optics-case':
        hardCase([0.18, 0.20, 0.17], 0.44, 0.30, 0.34, [0.24, 0.26, 0.22]);
        parts.push({ mat: 'lens', geo: bakeShade(xform(box(0.16, 0.08, 0.014), 0, 0.17, 0.178), 0.72) });
        steel(xform(box(0.20, 0.018, 0.02), 0, 0.17, 0.188), 0.48);
        break;
      case 'thermos-crate':
        wood(xform(box(0.50, 0.24, 0.34), 0, 0.12, 0), 0.74);
        for (const x of [-0.13, 0.13]) {
          paint(xform(cylY(0.060, 0.066, 0.28, 10), x, 0.26, 0), [0.72, 0.72, 0.64]);
          paint(xform(cylY(0.052, 0.060, 0.045, 10), x, 0.422, 0), [0.18, 0.20, 0.17]);
        }
        for (const x of [-0.22, 0.22]) wood(xform(box(0.035, 0.26, 0.36), x, 0.13, 0), 0.56);
        break;
    }
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
  basket({ rng, w = 1.2, d = 0.42, h = 0.34 }) {
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
    // Contents: two compressible packs with flaps, pockets, and straps plus
    // a transverse tarp roll. They remain inside the lattice envelope.
    for (const [x, tone, yaw] of [[-w * 0.22, 0.86, 0.22], [w * 0.24, 0.72, -0.18]] as const) {
      const bw = Math.min(0.34, w * 0.28);
      const bh = h * 0.56;
      const bd = d * 0.50;
      parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(sph(0.5, 10, 7), x,
        h * 0.48, -d * 0.50, 0.08, yaw, 0, [bw, bh, bd]), 2.4), tone + rng() * 0.08) });
      parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(box(bw * 0.74, 0.026, bd * 0.60),
        x, h * 0.72, -d * 0.47, -0.12, yaw, 0), 2.4), tone * 0.92) });
      parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(box(bw * 0.52, bh * 0.28, 0.020),
        x, h * 0.48, -d * 0.23, 0, yaw, 0), 2.4), tone * 0.88) });
      for (const sx of [-0.22, 0.22]) {
        st(xform(box(0.015, bh * 0.95, bd * 1.02), x + sx * bw,
          h * 0.48, -d * 0.50, 0, yaw, 0));
      }
    }
    const tarpR = Math.min(0.075, h * 0.22);
    parts.push({ mat: 'canvas', geo: bakeShade(boxUV(xform(capX(tarpR, w * 0.58, 9),
      0, h * 0.90, -d * 0.42), 2.6), 0.78 + rng() * 0.10) });
    for (const x of [-w * 0.17, w * 0.17]) st(xform(torusV(tarpR + 0.006, 0.009, 9, 4),
      x, h * 0.90, -d * 0.42, 0, Math.PI / 2, 0));
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
  tools({ rng, set = ['shovel', 'axe', 'crowbar'] }) {
    const parts: DecorPartList = [];
    const wood = (geo: THREE.BufferGeometry, t = 1) => parts.push({ mat: 'wood', geo: bakeShade(geo, t) });
    const st = (geo: THREE.BufferGeometry, t = 0.55) => parts.push({ mat: 'steel', geo: bakeShade(geo, t + rng() * 0.05) });
    set.forEach((tool, idx) => {
      const lane = (idx - (set.length - 1) / 2) * 0.115;
      const from = parts.length;
      const tone = 0.68 + rng() * 0.16; // worn dull handles, never fresh lumber
      if (tool === 'shovel') {
        wood(xform(cylZ(0.016, 0.78, 5), 0, 0.03, 0), tone);
        st(xform(box(0.13, 0.02, 0.19), 0, 0.03, 0.45));
        st(xform(box(0.05, 0.028, 0.05), 0, 0.03, -0.42));
      } else if (tool === 'axe') {
        wood(xform(cylZ(0.015, 0.62, 5), 0, 0.03, 0), tone);
        st(xform(box(0.03, 0.05, 0.15), 0, 0.032, 0.30));
        st(xform(box(0.085, 0.045, 0.05), 0.02, 0.032, 0.33));
      } else if (tool === 'sledge') {
        wood(xform(cylZ(0.017, 0.7, 5), 0, 0.035, 0), tone);
        st(xform(box(0.07, 0.07, 0.14), 0, 0.035, 0.33));
      } else { // crowbar
        st(xform(cylZ(0.012, 0.75, 5), 0, 0.026, 0), 0.5);
        st(xform(cylZ(0.012, 0.09, 5), 0, 0.052, 0.37, 0.6), 0.5);
      }
      for (const cz of [-0.2, 0.24]) { // clamp blocks
        parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.05, 0.05, 0.035), 0, 0.026, cz), 0.88) });
      }
      xformParts(parts, lane, 0, (rng() - 0.5) * 0.1, 0, 0, 0, from);
    });
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
  // single: one TRANSVERSE drum (axis X), rear-plate cantilever mount.
  drums({ rng, v = 'twin', _W = 0 }) {
    const parts: DecorPartList = [];
    const R = 0.28, L = 0.85;
    const drum = (cx: number, transverse: boolean) => {
      const tone = 0.86 + rng() * 0.18;
      const body = transverse ? cylX(R, L, 14) : cylZ(R, L, 14);
      parts.push({ mat: 'kit', geo: bakeShade(xform(body, cx, 0, 0), tone) });
      for (const rz of [-L * 0.27, L * 0.27]) { // rolling ribs
        const rib = transverse
          ? xform(torusV(R + 0.011, 0.012, 14, 4), cx + rz, 0, 0, 0, Math.PI / 2, 0)
          : xform(torus(R + 0.011, 0.012, 14, 4), cx, 0, rz, Math.PI / 2, 0, 0);
        parts.push({ mat: 'kit', geo: bakeShade(rib, tone * 0.92) });
      }
      const bungAt: [number, number, number] = transverse
        ? [cx + L * 0.31, R * 0.86, 0.1]
        : [cx + R * 0.4, R * 0.86, L * 0.31];
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.035, 0.035, 0.03, 7), ...bungAt), 0.5) });
      // cradle brackets + straps
      for (const b of [-L * 0.3, L * 0.3]) {
        const strap = transverse
          ? xform(torusV(R + 0.014, 0.009, 12, 4, Math.PI), cx + b, 0, 0, 0, Math.PI / 2, 0)
          : xform(torus(R + 0.014, 0.009, 12, 4, Math.PI), cx, 0, b, Math.PI / 2, 0, 0);
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

  // -- jerrycan rack (fuel tan / water green) ---------------------------------------
  jerry({ rng, n = 2, water = true }) {
    const parts: DecorPartList = [];
    const pairedCount = Math.max(2, Math.ceil(n / 2) * 2);
    for (let i = 0; i < pairedCount; i++) {
      const x = (i - (pairedCount - 1) / 2) * 0.20;
      const isWater = water && i >= pairedCount - 2;
      const tint: [number, number, number] = isWater
        ? [0.24, 0.30, 0.22]
        : [0.45, 0.37, 0.24];
      parts.push({ mat: 'cans', geo: bakeTint(xform(box(0.17, 0.44, 0.33), x, 0.22, 0), ...tint) });
      for (const s of [-1, 1]) { // X-stamp ribs
        parts.push({ mat: 'cans', geo: bakeTint(xform(box(0.012, 0.36, 0.05), x + s * 0.086, 0.21, 0, 38 * D2R), tint[0] * 1.08, tint[1] * 1.08, tint[2] * 1.08) });
        parts.push({ mat: 'cans', geo: bakeTint(xform(box(0.012, 0.36, 0.05), x + s * 0.086, 0.21, 0, -38 * D2R), tint[0] * 1.08, tint[1] * 1.08, tint[2] * 1.08) });
      }
      for (const h of [-0.05, 0, 0.05]) { // triple handles
        parts.push({ mat: 'cans', geo: bakeTint(xform(cylZ(0.011, 0.12, 4), x, 0.465, h), tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9) });
      }
      parts.push({ mat: 'cans', geo: bakeTint(xform(cylY(0.028, 0.028, 0.05, 6), x - 0.05, 0.46, -0.11), tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8) }); // spout
    }
    const W = pairedCount * 0.20 + 0.06; // rack frame
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(W, 0.03, 0.4), 0, 0.015, 0), 0.5) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(W, 0.05, 0.02), 0, 0.28, -0.18), 0.5) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(box(W, 0.05, 0.02), 0, 0.28, 0.18), 0.5) });
    for (const sx of [-1, 1]) { // diagonal braces back to the hull plate
      parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.025, 0.3, 0.025), sx * W * 0.42, 0.13, -0.19, 0.6, 0, 0), 0.45) });
    }
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

  // -- sandbag applique (glacis stack) ---------------------------------------------
  sandbags({ rng, rows = 2, perRow = 4, w = 1.2 }) {
    const parts: DecorPartList = [];
    for (let r = 0; r < rows; r++) {
      const n = perRow - (r % 2);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * (w / perRow);
        const tone = 0.78 + rng() * 0.3;
        const g = sph(0.5, 8, 5);
        xform(g, 0, 0, 0, 0, 0, (rng() - 0.5) * 0.4, [w / perRow * 0.6, 0.105, 0.21]);
        parts.push({ mat: 'burlap', geo: bakeShade(boxUV(xform(g, x, 0.085 + r * 0.14, -r * 0.055), 2.8), tone) });
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

  // -- ration / small-stores box stack ---------------------------------------------------
  rations({ rng, n = 2 }) {
    const parts: DecorPartList = [];
    for (let i = 0; i < n; i++) {
      const w = 0.34 - i * 0.04;
      parts.push({
        mat: 'wood',
        geo: bakeShade(boxUV(xform(box(w, 0.14, 0.24), (rng() - 0.5) * 0.05, 0.07 + i * 0.142, (rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.3, 0), 2.6), 0.86 + rng() * 0.2),
      });
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
function defaultManifest(spec: FleetTankSpec, rng: Rng): DecorManifestRow[] {
  const era = decorEra(spec);
  const sov = SOVIET_RE.test(spec.nation || '');
  const us = US_RE.test(spec.nation || '');
  const casemate = !!(spec.armor && spec.armor.turretless);
  const M: DecorManifestRow[] = [];

  // ---- turret / roof kit ----
  if (!casemate) {
    M.push({ kit: 'packs', p: 0.85, v: { n: 2 + ((rng() * 2) | 0) }, slot: ['turretRear', {}] });
    M.push({ kit: 'tarp', p: 0.6, v: { v: rng() < 0.5 ? 'fat' : 'thin', len: 0.7 }, slot: ['turretSide', { side: rng() < 0.5 ? -1 : 1 }] });
    M.push({ kit: 'antenna', p: 0.9, v: { v: rng() < 0.25 && era !== 'ww2' ? 'whip_long' : 'whip_short', helmet: us && era === 'ww2' && rng() < 0.18 }, slot: ['turretRoof', { rear: true, side: 1 }] });
    if (era !== 'ww2') {
      M.push({ kit: 'smoke', p: 0.75, v: { v: rng() < 0.4 ? '4' : '6' }, slot: ['turretCheekPair', {}] });
      M.push({ kit: 'aamg', p: era === 'cold-war' ? 0.75 : 0.5, v: { v: sov ? 'dshk' : 'm2', shield: rng() < 0.4, ring: !sov && rng() < 0.3 }, slot: ['turretRoof', { rear: true, side: -1 }] });
      M.push({ kit: 'light', p: 0.35, v: { v: 'ir_small' }, slot: ['turretRoof', { rear: false, side: 1 }] });
    } else {
      M.push({ kit: 'aamg', p: us ? 0.65 : 0.2, v: { v: sov ? 'dshk' : 'm2', shield: rng() < 0.3 }, slot: ['turretRoof', { rear: true, side: -1 }] });
      M.push({ kit: 'hatch', p: 0.4, v: { v: rng() < 0.6 ? 'round' : 'rect' }, slot: ['turretRoof', { rear: false, side: -1 }] });
    }
    M.push({ kit: 'tracks', p: era === 'ww2' ? 0.5 : 0.3, v: { n: 4, linkW: Math.min(0.5, spec.dims.widthM * 0.13) }, slot: ['turretSidePlate', { side: -1 }] });
    M.push({ kit: 'camonet', p: 0.45, v: { v: 'roll', len: 0.9 }, slot: ['turretRear', { low: true }] });
  } else {
    M.push({ kit: 'antenna', p: 0.9, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] });
    M.push({ kit: 'aamg', p: era === 'ww2' ? 0.35 : 0.7, v: { v: sov ? 'dshk' : 'm2', shield: rng() < 0.5 }, slot: ['turretRoof', { rear: true, side: -1 }] });
    M.push({ kit: 'packs', p: 0.8, v: { n: 2 }, slot: ['rearDeck', { spread: 0.4 }] });
    M.push({ kit: 'camonet', p: 0.5, v: { v: 'roll', len: 1.1 }, slot: ['rearDeck', {}] });
    // fixed-bore vehicles: the rear deck sits outside any gun sweep — the
    // stowed travel lock is period kit on long-gun TDs
    M.push({ kit: 'travelLock', p: 0.6, v: {}, slot: ['rearDeck', { center: true, back: true, small: true }] });
  }

  // ---- hull kit ----
  M.push({ kit: 'cable', p: 0.85, v: { len: Math.min(2.6, spec.dims.hullLengthM * 0.36) }, slot: ['hullSideTop', { side: 1 }] });
  M.push({ kit: 'bin', p: 0.8, v: { v: era === 'ww2' ? 'crate' : 'long', w: era === 'ww2' ? 0.55 : 0.9, h: 0.24, d: 0.34 }, slot: ['fender', { side: -1, zFrac: -0.25 }] });
  M.push({ kit: 'tools', p: 0.75, v: { set: rng() < 0.5 ? ['shovel', 'axe'] : ['shovel', 'sledge', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.1, along: true }] });
  M.push({ kit: 'jerry', p: era === 'ww2' ? 0.6 : 0.45, v: { n: 2 + (rng() < 0.4 ? 1 : 0) }, slot: ['rearDeck', { corner: 1 }] });
  M.push({ kit: 'tarp', p: 0.7, v: { v: 'fat', len: Math.min(1.2, spec.dims.widthM * 0.35) }, slot: ['rearDeck', { corner: -1 }] });
  M.push({ kit: 'shackles', p: 0.9, v: { v: rng() < 0.5 ? 'hook' : 'shackle' }, slot: ['bowPair', {}] });
  M.push({ kit: 'tracks', p: era === 'ww2' ? 0.6 : 0.4, v: { n: 5, linkW: Math.min(0.5, spec.dims.widthM * 0.14) }, slot: ['glacis', {}] });
  if (sov && era !== 'modern') {
    M.push({ kit: 'drums', p: 0.75, v: { v: rng() < 0.6 ? 'twin' : 'single' }, slot: ['hullRear', {}] });
    M.push({ kit: 'log', p: 0.6, v: { len: Math.min(2.8, spec.dims.widthM * 0.82) }, slot: ['hullRearLow', {}] });
  } else {
    M.push({ kit: 'wheel', p: 0.4, v: {}, slot: ['rearDeck', { corner: 1, back: true }] });
  }
  if (us && era === 'ww2') {
    M.push({ kit: 'sandbags', p: 0.45, v: { rows: 2, perRow: 4, w: spec.dims.widthM * 0.5 }, slot: ['glacisLow', {}] });
  }
  if (era === 'modern') {
    M.push({ kit: 'camonet', p: 0.4, v: { v: 'drape', len: 1.1, w: 0.9 }, slot: ['rearDeck', { center: true }] });
    M.push({ kit: 'bin', p: 0.5, v: { v: 'steel', w: 0.5, h: 0.3, d: 0.4 }, slot: ['rearDeck', { corner: -1, back: true }] });
    M.push({ kit: 'applique', p: 0.3, v: { v: 'rect', w: 0.8, h: 0.42 }, slot: ['hullSide', { side: 1, zFrac: -0.05 }] });
  }
  M.push({ kit: 'bucket', p: era === 'modern' ? 0.15 : 0.35, v: {}, slot: ['hullRearHang', {}] });
  M.push({ kit: 'rations', p: 0.35, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] });
  M.push({ kit: 'chain', p: 0.3, v: { links: 5 }, slot: ['bowChain', {}] });
  return M;
}

// Curated per-tank manifests: marquee/composition tanks get an authored,
// period-documented loadout replacing the era default. Fleet profile agents
// may REQUEST changes here (docs/DECORATIONS.md carries the ask process) —
// this table is decorations-owned.
const TANK_MANIFESTS: Record<string, DecorManifestBuilder> = {
  // --- WW2 ---
  tiger1: () => [
    { kit: 'cable', p: 1, v: { len: 2.7, sag: 0.05 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.7, sag: 0.04 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.52 }, slot: ['glacis', {}] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe', 'crowbar'] }, slot: ['fender', { side: 1, zFrac: 0.05, along: true }] },
    { kit: 'bin', p: 1, v: { v: 'long', w: 1.15, h: 0.22, d: 0.3 }, slot: ['fender', { side: -1, zFrac: -0.2 }] },
    // Tiger's full-width flat roof sits barely under the -6.5° rear sweep:
    // tall kit hangs LOW on the rear plate, soft kit lies on the fender line
    { kit: 'jerry', p: 1, v: { n: 3, water: false }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.15 }, slot: ['fender', { side: -1, zFrac: -0.38 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', {}] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['turretRear', { low: true }] },
    { kit: 'hatch', p: 1, v: { v: 'round' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'bucket', p: 1, v: {}, slot: ['hullRearHang', {}] },
    { kit: 'patch', p: 1, v: { w: 0.45, h: 0.4 }, slot: ['hullSide', { side: -1, zFrac: 0.15 }] },
    { kit: 'tracks', p: 1, v: { n: 3, linkW: 0.5 }, slot: ['turretSidePlate', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 3, linkW: 0.5 }, slot: ['turretSidePlate', { side: -1 }] },
  ],
  t34_85: () => [
    { kit: 'drums', p: 1, v: { v: 'single' }, slot: ['hullRear', {}] },
    { kit: 'log', p: 1, v: { len: 2.5 }, slot: ['hullRearLow', {}] },
    { kit: 'cable', p: 1, v: { len: 2.2 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.55, h: 0.3, d: 0.42 }, slot: ['fender', { side: -1, zFrac: -0.3 }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.5, h: 0.26, d: 0.4 }, slot: ['fender', { side: 1, zFrac: -0.35 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.0 }, slot: ['turretRear', { low: true }] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretSide', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'sledge'] }, slot: ['fender', { side: 1, zFrac: 0.2, along: true }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.5 }, slot: ['glacis', { side: 1 }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 0.9 }, slot: ['turretSide', { side: -1 }] },
  ],
  m4a3e8: (s, rng) => [
    { kit: 'sandbags', p: 1, v: { rows: 2, perRow: 4, w: 1.5 }, slot: ['glacisLow', {}] },
    { kit: 'aamg', p: 1, v: { v: 'm2' }, slot: ['turretRoof', { rear: true, side: -1 }] },
    { kit: 'packs', p: 1, v: { n: 4 }, slot: ['turretRear', {}] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.0 }, slot: ['hullRearRack', { x: 0.18 }] },
    { kit: 'jerry', p: 1, v: { n: 3 }, slot: ['hullRearRack', { x: -0.16 }] },
    { kit: 'cable', p: 1, v: { len: 2.0 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.0, along: true }] },
    { kit: 'bin', p: 1, v: { v: 'crate', w: 0.55, h: 0.26, d: 0.4 }, slot: ['fender', { side: 1, zFrac: 0.3 }] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.42 }, slot: ['hullSide', { side: -1, zFrac: 0.3 }] },
    { kit: 'shackles', p: 1, v: { v: 'shackle' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short', helmet: rng() < 0.5 }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'rations', p: 1, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true, back: true }] },
  ],
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
  isu152: () => [
    { kit: 'drums', p: 1, v: { v: 'twin' }, slot: ['hullRear', {}] },
    { kit: 'log', p: 1, v: { len: 2.7 }, slot: ['hullRearLow', {}] },
    { kit: 'cable', p: 1, v: { len: 2.4 }, slot: ['hullSideTop', { side: 1 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.55 }, slot: ['glacis', { side: -1 }] },
    { kit: 'aamg', p: 1, v: { v: 'dshk', ring: true }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['rearDeck', { spread: 0.5 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.1 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'axe'] }, slot: ['fender', { side: -1, zFrac: 0.1, along: true }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: false, side: -1 }] },
    { kit: 'camonet', p: 1, v: { v: 'roll', len: 1.0 }, slot: ['rearDeck', { corner: 1 }] },
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
  is7: () => [
    { kit: 'aamg', p: 1, v: { v: 'dshk', ring: true }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'cable', p: 1, v: { len: 2.6 }, slot: ['hullSideTop', { side: -1 }] },
    { kit: 'tracks', p: 1, v: { n: 5, linkW: 0.55 }, slot: ['glacis', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', {}] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.1 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'tools', p: 1, v: { set: ['shovel', 'sledge'] }, slot: ['fender', { side: 1, zFrac: 0.15, along: true }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: false, side: -1 }] },
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
  const curated = TANK_MANIFESTS[spec.id];
  // Give every playable a visible, deterministic field load rather than one
  // tiny hash-selected object that can disappear behind a bustle. Seven
  // station-aware pieces occupy the bustle, rear turret roof, engine deck,
  // and hull rear rack. Pools are deliberately disjoint:
  // a soft bag belongs on armor, paired cans sit at a rack/fender station,
  // and hard cases remain horizontal. Keeping these first in the manifest
  // guarantees the common fleet vocabulary before optional curated clutter.
  const side = (fnv1a(`${spec.id}:fleet-cargo-side`) & 1) ? 1 : -1;
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
    pool[(fnv1a(`${spec.id}:${salt}`) + nationPhase + offset) % pool.length];
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
      v: cargoVariant(choose(serviceGear, 'fender-service')),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-1.05, -1.30) : aftRoutes(-side, 0.22) }],
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
  return [...cargo, ...base];
}

// ---------------------------------------------------------------------------
// PLACEMENT ENGINE
// ---------------------------------------------------------------------------

const DECOR_LOD_DIST = 150; // same greeble horizon tankFactory uses
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

function buildAxisSurfaceIndex(
  group: THREE.Group,
  targets: SurfaceMesh[],
): AxisSurfaceIndex | null {
  if (!targets.length || targets.length >= 2048) return null;
  group.updateWorldMatrix(true, false);
  const groupInverse = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const records: SurfaceRecord[] = [];
  const bounds = new THREE.Box3();
  const corner = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
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
    if (box && !box.isEmpty()) {
      for (const x of [box.min.x, box.max.x]) {
        for (const y of [box.min.y, box.max.y]) {
          for (const z of [box.min.z, box.max.z]) {
            bounds.expandByPoint(corner.set(x, y, z).applyMatrix4(toGroup));
          }
        }
      }
    }
    const index = mesh.geometry.index?.array || null;
    const triangleCount = Math.floor((index ? index.length : position.count) / 3);
    records.push({ mesh, position, index, triangleCount, toGroup, toLocal, worldNormalMatrix });
    triangleTotal += triangleCount;
  }
  if (!records.length || bounds.isEmpty()) return null;
  const size = Math.max(AXIS_GRID_MIN, Math.min(AXIS_GRID_MAX,
    Math.ceil(Math.sqrt(triangleTotal / 24))));
  const xz = projectedGrid(bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z, size);
  const yz = projectedGrid(bounds.min.y, bounds.max.y, bounds.min.z, bounds.max.z, size);
  const xy = projectedGrid(bounds.min.x, bounds.max.x, bounds.min.y, bounds.max.y, size);
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
    }
  }

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

function makeProber(group: THREE.Group, targets: SurfaceMesh[]): SurfaceProber {
  const axisIndex = buildAxisSurfaceIndex(group, targets);
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
  return clone;
}
function disposePartList(parts: DecorPartList): void {
  for (const p of parts) p.geo.dispose();
}

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
export function attachTankDecorations(a: DecorationAttachmentArgs): DecorSummary | null {
  const { root, hullG, turretG, spec, engineCtx, disposables = [], opts = {} } = a;
  try {
    if (!root || root.userData.__decorApplied) return null;
    if (!resolveDecorMode(opts, engineCtx)) return null;
    if (a.isDestroyed && a.isDestroyed()) return null;
    root.userData.__decorApplied = true;

    const rng = mulberry32(fnv1a(`decor:${spec.id}`));
    const mats = buildDecorMaterials(spec, engineCtx);
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
    const hullP = makeProber(hullG, hullTargets.length ? hullTargets : turretTargets);
    const turP = makeProber(turretG, turretTargets.length ? turretTargets : hullTargets);

    // --- guard precomputation ---------------------------------------------
    // Turret swept annulus + PER-RADIAL-BAND lowest turret surface: the
    // mantlet hangs low near the ring while the bustle bottom rides high —
    // one global minimum would ban the classic sponson-edge stowage line
    // (the real Tiger's cables) for a mantlet it can never touch. Hull decor
    // inside the sweep only needs to clear the bands it actually sits under.
    // Casemates skip the sweep (nothing yaws).
    let sweepR = 0;
    let turretMinY = 0.10;                    // global (relative to pivot)
    const bandMinY = [Infinity, Infinity, Infinity]; // r/sweepR: <0.5, 0.5-0.8, >0.8
    {
      const v = new THREE.Vector3();
      const bb = new THREE.Box3();
      const inv = new THREE.Matrix4();
      const m = new THREE.Matrix4();
      const samples: Array<[number, number]> = [];
      turretG.updateWorldMatrix(true, false);
      inv.copy(turretG.matrixWorld).invert();
      for (const o of turretTargets) {
        let underGun = false; // gun subtree pitches — the gun guard owns it
        for (let p: THREE.Object3D | null = o; p && p !== turretG; p = p.parent) {
          if (p.name === 'rig_gun') { underGun = true; break; }
        }
        if (underGun) continue;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        if (!o.geometry.boundingBox) continue;
        bb.copy(o.geometry.boundingBox);
        m.multiplyMatrices(inv, o.matrixWorld);
        for (const x of [bb.min.x, bb.max.x]) for (const y of [bb.min.y, bb.max.y]) for (const z of [bb.min.z, bb.max.z]) {
          v.set(x, y, z).applyMatrix4(m);
          const r = Math.hypot(v.x, v.z);
          sweepR = Math.max(sweepR, r);
          if (v.y < turretMinY) turretMinY = v.y;
          samples.push([r, v.y]);
        }
      }
      sweepR = Math.min(sweepR || W * 0.45, dims.overallLengthM * 0.5); // sanity
      for (const [r, y] of samples) {
        const i = r < sweepR * 0.5 ? 0 : (r < sweepR * 0.8 ? 1 : 2);
        if (y < bandMinY[i]) bandMinY[i] = y;
      }
      for (let i = 0; i < 3; i++) if (!Number.isFinite(bandMinY[i])) bandMinY[i] = 0.12;
    }

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
    const gunGuardOK: GunGuard = (boxes, seatY = null) => {
      void seatY;
      // analytic quick-accept: every PART fully under the depressed bore cone
      let clear = true;
      for (const bb of boxes) {
        for (const x of [bb.min.x, bb.max.x, (bb.min.x + bb.max.x) / 2]) {
          for (const z of [bb.min.z, bb.max.z, (bb.min.z + bb.max.z) / 2]) {
            const r = Math.hypot(x - pivot[0], z - pivot[2]);
            if (r > boreReach || r < boreRho * 0.5) continue;
            if (bb.max.y > boreYAt(r) - boreR - 0.03) { clear = false; break; }
          }
          if (!clear) break;
        }
        if (!clear) break;
      }
      if (clear) return true;
      // first-hit ray test: bore bundle (center + 4 sleeve-radius offsets)
      const yaws = casemate ? [0] : Array.from({ length: 24 }, (_, i) => (i / 24) * Math.PI * 2);
      const sinD = Math.sin(dep), cosD = Math.cos(dep);
      hullG.updateWorldMatrix(true, false);
      const toWorld = hullG.matrixWorld;
      for (const yaw of yaws) {
        const sy = Math.sin(yaw), cy = Math.cos(yaw);
        const ox = pivot[0] + gunPiv[0] * cy + gunPiv[2] * sy;
        const oz = pivot[2] - gunPiv[0] * sy + gunPiv[2] * cy;
        const oy = boreY0;
        const dx = sy * cosD, dyy = -sinD, dz = cy * cosD;
        const sideV = [cy, 0, -sy];                       // ⟂ bearing, horizontal
        // up = dir × side (unit: dir and side are unit and orthogonal)
        const ux = dyy * sideV[2], uy = dz * sideV[0] - dx * sideV[2], uz = -dyy * sideV[0];
        for (const [a, b] of [[0, 0], [boreR, 0], [-boreR, 0], [0, boreR], [0, -boreR]]) {
          _gray.origin.set(
            ox + sideV[0] * a + ux * b,
            oy + uy * b,
            oz + sideV[2] * a + uz * b,
          );
          _gray.direction.set(dx, dyy, dz);
          let tBox = Infinity;
          for (const bb of boxes) {
            const hit = _gray.intersectBox(bb, _ghit);
            if (hit) tBox = Math.min(tBox, _ghit.distanceTo(_gray.origin));
          }
          if (!Number.isFinite(tBox) || tBox > boreLen + 0.15) continue;
          // does the tank's own geometry eat the ray first?
          guardRay.ray.origin.copy(_gray.origin).applyMatrix4(toWorld);
          guardRay.ray.direction.copy(_gray.direction).transformDirection(toWorld);
          guardRay.far = tBox - 0.02;
          guardRay.near = 0.1;
          const blocked = guardRay.intersectObjects(hullTargets, false).length > 0;
          if (!blocked) { gunGuardOK.lastYaw = Math.round(yaw / D2R); return false; } // decor first-hit
        }
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
    let wheelR = 0.31;
    {
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
      if (best !== null) wheelR = Math.min(0.45, best);
    }

    // --- deck landmarks ------------------------------------------------------
    const topFrom = H + 1.5;
    const deckProbe = (x: number, z: number) => hullP.top(x, z, topFrom);
    const sternZ = -L / 2;
    let rearDeckY = H * 0.6;
    {
      const ys: number[] = [];
      for (let i = 0; i <= 6; i++) {
        const z = sternZ + 0.2 + (i / 6) * Math.max(0.4, (pivot[2] - sweepR - 0.25) - sternZ - 0.3);
        const h = deckProbe(0, z);
        if (h) ys.push(h.p.y);
      }
      if (ys.length) { ys.sort((p, q) => p - q); rearDeckY = ys[(ys.length / 2) | 0]; }
    }

    // --- placement bookkeeping ----------------------------------------------
    // Seven visible fleet-equipment stations plus the per-vehicle curated kit
    // fit below this cap. Geometry is still merged by material/frame, so the
    // higher detail allowance grows silhouettes without multiplying draws.
    const budget = { tris: 0, max: 4200 };
    const buckets: Record<DecorFrame, Map<DecorMaterialKey, THREE.BufferGeometry[]>> = {
      hull: new Map(),
      turret: new Map(),
    };
    const summary: DecorSummary = { pieces: [], tris: 0, drawCalls: 0, skipped: [] };
    let basketAnchor: BasketAnchor | null = null; // set by turretRearFrame; used by onBasket packs

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
      if (budget.tris + tris > budget.max) { summary.skipped.push([name, 'budget']); disposePartList(parts); return false; }
      const bb = placedBox(parts, pos, rot);
      if (frame === 'hull') {
        if (!widthGuardOK(bb, zExtra)) { summary.skipped.push([name, 'width']); disposePartList(parts); return false; }
        if (!gunGuardOK(placedPartBoxes(parts, pos, rot), seatY)) { summary.skipped.push([name, `gun@${gunGuardOK.lastYaw ?? 'cone'}`]); gunGuardOK.lastYaw = null; disposePartList(parts); return false; }
        if (!sweepGuardOK(bb)) { summary.skipped.push([name, 'sweep']); disposePartList(parts); return false; }
      } else {
        // turret frame: the WIDTH guard applies to the yaw-0 footprint (the
        // committed plan width the loader measures); radial reach may extend
        // the existing bustle envelope a bounded amount (baskets), since a
        // yawed turret legally overhangs the hull like the bustle itself.
        let rMax = 0;
        for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
          rMax = Math.max(rMax, Math.hypot(x, z));
        }
        if (Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) > W / 2 + 0.048) {
          summary.skipped.push([name, 'turret-width']); disposePartList(parts); return false;
        }
        if (rMax > sweepR + 0.55) {
          summary.skipped.push([name, 'turret-reach']); disposePartList(parts); return false;
        }
        sweepRLive = Math.max(sweepRLive, rMax);
        turretMinYLive = Math.min(turretMinYLive, bb.min.y);
        for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
          const rn = Math.hypot(x, z) / Math.max(sweepR, 1e-3);
          const bi = rn < 0.5 ? 0 : (rn < 0.8 ? 1 : 2);
          if (bb.min.y < bandMinY[bi]) bandMinY[bi] = bb.min.y;
        }
      }
      if (!allowOverlap && overlaps(bb, ledger)) { summary.skipped.push([name, 'overlap']); disposePartList(parts); return false; }
      ledger.push(bb);
      budget.tris += tris;
      const localBounds = attachment ? partsBBox(parts).clone() : null;
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
      const map = buckets[frame];
      for (const p of parts) {
        p.geo.applyMatrix4(m);
        if (!map.has(p.mat)) map.set(p.mat, []);
        map.get(p.mat)!.push(p.geo);
      }
      const piece: DecorPieceSummary = { kit: name, frame, tris };
      if (attachment) {
        const supportNormal = attachment.supportNormal.clone().normalize();
        const mountAxis = attachment.mountAxis === 'y'
          ? new THREE.Vector3(0, 1, 0)
          : new THREE.Vector3(0, 0, 1);
        const mountNormal = mountAxis
          .applyQuaternion(new THREE.Quaternion().setFromEuler(rot)).normalize();
        const baseOffset = attachment.mountAxis === 'y'
          ? localBounds!.min.y
          : localBounds!.min.z;
        const basePoint = pos.clone().addScaledVector(mountNormal, baseOffset);
        piece.attachment = {
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
      summary.pieces.push(piece);
      return true;
    }

    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const E = (rx = 0, ry = 0, rz = 0) => new THREE.Euler(rx, ry, rz);

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
      glacisLow(args, parts, name) {
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
        if (meta.mount === 'deck') { // twin longitudinal drums at the deck edges
          const bb = partsBBox(parts);
          const d = bb.max.z - bb.min.z;
          const cx = parts.metaCx || 0.35;
          for (const dz of [0, 0.25, 0.5]) {
            const z = sternZ + d / 2 + 0.12 + dz;
            // per-drum footprints (the raised center hatch line stays out of
            // the probe); sloped soviet decks pitch the whole rack
            const sL = seatProbe(hullP, -cx, z, 0.4, d * 0.7, topFrom, 0.42);
            const sR = seatProbe(hullP, cx, z, 0.4, d * 0.7, topFrom, 0.42);
            if (!sL || !sR) continue;
            const seatY = Math.max(sL.y, sR.y);
            const n = sL.y > sR.y ? sL.n : sR.n;
            const pitch = n ? Math.atan2(n.z, Math.max(n.y, 0.4)) : 0;
            if (commit(name, parts, 'hull', V(0, seatY - 0.012, z), E(pitch * 0.8, 0, 0), placedHull,
              { seatY, zExtra: 0.3 })) return true;
          }
          disposePartList(parts);
          return false;
        }
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
      hullRearLow(args, parts, name) {
        const y = Math.max(H * 0.33, rearDeckY * 0.62);
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.16), E(0, 0, (rng() - 0.5) * 0.04), placedHull,
          { seatY: y, zExtra: 0.35 });
      },
      hullRearHang(args, parts, name) {
        const y = rearDeckY * 0.82;
        const h = hullP.zface(W * 0.26, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        const bb = partsBBox(parts);
        return commit(name, parts, 'hull', V(W * 0.26, y - (bb.max.y - bb.min.y), h.p.z - 0.09), E(), placedHull,
          { zExtra: 0.3 });
      },
      hullRearCage(args, parts, name) {
        const y = rearDeckY * 0.72;
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!h) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.28), E(0, Math.PI, 0), placedHull,
          { seatY: y - 0.25, zExtra: 0.45 });
      },
      bowPair(args, parts, name) {
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
      bowChain(args, parts, name) {
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
      turretRearFrame(args, parts, name) {
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
      turretCheekPair(args, parts, name) {
        let ok = false;
        for (const s of [-1, 1]) {
          const cl = clonePartList(parts);
          let done = false;
          for (const [z, yf] of [[0.3, 0.5], [0.2, 0.42], [0.36, 0.6]]) {
            const y = Math.max(0.24, pivotTopY() * yf);
            const h = turP.side(y, z, s, W / 2 + 1);
            if (!h) continue;
            const yaw = s > 0 ? Math.PI / 2 + 0.55 : -Math.PI / 2 - 0.55; // fan forward
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

    // ---- resolve the manifest ---------------------------------------------
    const manifest = decorManifestFor(spec, rng);
    for (const row of manifest) {
      // deterministic dice: EVERY row draws its roll + jitter seed up front,
      // so a failed placement can never reshuffle later pieces
      const roll = rng();
      const jitterSeed = (rng() * 0x7fffffff) | 0;
      if (roll > (row.p ?? 1)) continue;
      const kitFn = DECOR_KITS[row.kit];
      const slotFn = SLOTS[row.slot[0]];
      if (!kitFn || !slotFn) continue;
      let parts: DecorPartList;
      try {
        const localRng = mulberry32(fnv1a(`${spec.id}:${row.kit}:${row.slot[0]}`) ^ jitterSeed);
        const v = { ...(row.v || {}) };
        if (row.kit === 'wheel') v.r = wheelR;
        if (row.kit === 'drums') v._W = W;
        parts = kitFn({ rng: localRng, ...v });
      } catch (e) { continue; }
      try {
        const before = summary.skipped.length;
        const pieceName = row.kit === 'cargo'
          ? `cargo:${String(row.v?.v || 'field-kit')}` : row.kit;
        const ok = slotFn(row.slot[1] || {}, parts, pieceName);
        // slots log commit-guard skips themselves; a silent false is a probe
        // miss (no anchor surface answered) — record it so nothing hides
        if (!ok && summary.skipped.length === before) summary.skipped.push([row.kit, 'probe']);
      } catch (e) {
        summary.skipped.push([row.kit, `slot:${errorMessage(e)}`]);
        try { disposePartList(parts); } catch (_) { /* already consumed */ }
      }
    }

    // ---- merge per family per frame + attach --------------------------------
    let drawCalls = 0;
    for (const [frame, map] of Object.entries(buckets)) {
      if (!map.size) continue;
      const parent = frame === 'hull' ? hullG : turretG;
      const g = new THREE.Group();
      g.name = frame === 'hull' ? 'rig_decor_hull' : 'rig_decor_turret';
      for (const [matKey, geos] of map) {
        const nonIndexed = geos.map((x) => (x.index ? x.toNonIndexed() : x));
        const merged = mergeGeometries(nonIndexed, false);
        for (const x of nonIndexed) x.dispose();
        for (const x of geos) if (!x.attributes || x !== merged) x.dispose();
        if (!merged) continue;
        disposables.push(merged);
        const mesh = new THREE.Mesh(merged, mats.get(matKey));
        mesh.name = `decor_${frame}_${matKey}`;
        // PERF: the fleet's shadow story is proxy-based (procedural proxies /
        // GLB buildShadowProxy) with per-mesh casters swept off — decor
        // follows the same contract. receiveShadow keeps the kit grounded.
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.userData.__decor = true;
        mesh.userData.combatHitboxRole = 'equipment';
        // LOD: decor vanishes at the fleet's greeble horizon
        const lod = new THREE.LOD();
        lod.addLevel(mesh, 0);
        lod.addLevel(new THREE.Object3D(), DECOR_LOD_DIST, 0.1);
        g.add(lod);
        drawCalls++;
      }
      parent.add(g);
      g.userData.combatHitboxRole = 'equipment';
    }
    for (const m of Object.values(mats.all())) if (m) disposables.push(m);

    summary.tris = budget.tris;
    summary.drawCalls = drawCalls;
    root.userData.__decorSummary = summary;
    return summary;
  } catch (e) {
    try { console.warn(`[decorations] ${spec.id}: attach failed —`, errorMessage(e)); } catch (_) { /* noop */ }
    return null;
  }
}

export { buildDecorMaterials, DECOR_LOD_DIST };
