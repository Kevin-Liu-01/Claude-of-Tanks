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
  vehicleAmbientFloorHook, getKitPaintTexture, getSharedRoughnessTexture, resolveCamoVisual, followVehicleScheme,
  type MaterialTankSpec,
} from './materials.ts';
import { garnishedNetTextures, NET_TILE_M, theatreOfHex, type SuitTheatre } from './camoNetTexture.ts';
import { VEHICLE_ERAS, isContemporaryVehicleEra } from './taxonomy.ts';
import {
  buildBranchBundle, buildCargoVariant, buildCupola, buildExhaust, buildHatch, buildLog, buildNetDrape, buildNetRoll,
  buildPackCluster, buildSearchlight, buildSight, buildTarpRoll, buildTools, buildTravelLock, drum200, duffel, jerrycan,
  canRack, canRackStyleFor, FABRIC_FAMILIES, sandbag, whipAntennaParts, type AccessoryPainter, type RGB,
} from './accessoryKits.ts';
import { FOLIAGE_ALPHA_TEST, vehicleFoliageAtlas, type VehicleFoliageKind } from './vehicleFoliage.ts';
import { clearGhillieForSmoke, drapeGhillieOverLoads, GHILLIE_TOP_VERTICES } from './ghillieDrape.ts';
import { block, latheY, moldedBox, place, roundBar, sweptTube, withBoxUV } from './accessoryPrimitives.ts';
import {
  addPintleAmmo, addPintleBarrel, addPintleMount, addPintleReceiver, addPintleRing, addPintleShield, createPintleLayout,
  MG_AMMO_CAN_SLOT, MG_CARTRIDGE_SLOT,
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
  /** A camouflage net the placement lays on the surface under it (round 4: conformDrape). */
  drape?: boolean;
  /**
   * A load stacked on another (round 4 follow-up: stackLoad): its carrier's placed footprint and lid height in the
   * frame, [minX, maxX, minZ, maxZ, topY], so an audit can measure the stacked piece against what carries it.
   */
  stackedOn?: [number, number, number, number, number];
}

interface DecorPart {
  mat: DecorMaterialKey;
  geo: THREE.BufferGeometry;
  /**
   * 'pad': the contact pad under a secured load; slots that carry the piece on a built rack drop it.
   * 'lash' (round 5, 2026-10-08): a tie-down holding the load to its deck or rack (webbing, deck rings, buckle).
   * 'cinch': a bag's own strap that a lashing replaces at its station. A load seated on a deck or a rack keeps its
   * lashings and drops the cinches they replace; anywhere else (a side ledge, a stack, a basket) it keeps the cinches
   * and drops the lashings (tieKept), so exactly one of each pair is drawn.
   */
  role?: 'pad' | 'lash' | 'cinch';
  /** A cinch strap's station (an index into its list's lashAt) until lashLoad claims it (round 5). */
  station?: number;
  /** A lashing's deck ring (round 5): commit keeps a lashing only where both its rings have support under them. */
  anchor?: boolean;
  /**
   * Which end of its lashing a deck ring anchors (0 the near flank, 1 the far), and whether it is the inner ring of
   * that end (round 5): every end carries a ring just outside the load's foot and one just inside it, under the load's
   * edge; commit draws the outer ring where the deck reaches it and the inner one where the load's foot is the deck's
   * edge (a case on a narrow bustle plate, a roof's rim), so the lashing keeps its hold either way.
   */
  end?: 0 | 1;
  inner?: boolean;
  /** The lashing a part belongs to, or the lashing that replaces a cinch strap (round 5; per piece). */
  tie?: number;
  /** A smoke bank's mounting bracket (round 5): turretCheekPair rebuilds it as a wedge flush with the cheek. */
  bracket?: boolean;
  /** A smoke tube's (or its cap's) pivot on the bracket face (round 5): a side mount cants the tubes about it. */
  pivot?: readonly [number, number, number];
}

/** Where a bag's cinch strap crosses it (round 5): a point on the bag's axis and the strap's crossing direction. */
interface LashStation { x: number; z: number; cx: number; cz: number }

interface DecorPartList extends Array<DecorPart> {
  meta?: DecorPartMeta;
  metaCx?: number;
  /** The same piece at the coarse level (built from an identically seeded stream; seated with this list's matrix). */
  coarse?: DecorPartList;
  /** The cinch stations of the piece's soft goods (round 5), indexed by DecorPart.station. */
  lashAt?: LashStation[];
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
  /**
   * The fabric family of a soft load (round 5, 2026-10-08): the n-th soft load a tank dresses takes the n-th family of
   * the tank's rotation (fabricFamilyRgb), so its kit alternates light and dark goods instead of one olive.
   */
  fabric?: number;
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
  /** turretRoofPair: the bank's yaw off the bow, mirrored per side (radians) */
  yaw?: number;
}

interface DecorManifestRow {
  kit: string;
  p?: number;
  v?: Omit<DecorKitArgs, 'rng'>;
  slot: [string, DecorSlotArgs];
  /**
   * Seat this row before the loose cargo (round 4, 2026-10-07): a fitting a receipt keeps (the Viper's tow cable) must
   * not wait behind cargo whose growth spends the triangle budget. It keeps its own roll and seed draws.
   */
  early?: boolean;
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
  /**
   * Round 5: the load rides a deck ('deck': its foot is laid on the support under it, settleFoot) or a built rack
   * ('rack'); either keeps its lashings (tieKept). A load on a side ledge, a stack or in a basket keeps its straps.
   */
  secure?: 'deck' | 'rack';
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

/**
 * The netting lane (2026-10-10): the smoke grenade lines of the decor's own banks under a frame (its rig_decor groups),
 * as [px, py, pz, dx, dy, dz] rows in that frame, for the field suit to give way to (ghillieDrape.ts).
 */
function decorSmokeLines(frameG: THREE.Object3D): number[] {
  frameG.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(frameG.matrixWorld).invert(), m = new THREE.Matrix4();
  const p = new THREE.Vector3(), d = new THREE.Vector3(), rows: number[] = [];
  for (const group of frameG.children) {
    if (!/^rig_decor_/.test(group.name || '')) continue;
    group.traverse((o) => {
      const sockets = o.userData?.smokeSockets as Array<{ position: number[]; direction: number[] }> | undefined;
      if (!Array.isArray(sockets)) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      for (const s of sockets) {
        p.fromArray(s.position).applyMatrix4(m);
        d.fromArray(s.direction).transformDirection(m);
        rows.push(p.x, p.y, p.z, d.x, d.y, d.z);
      }
    });
  }
  return rows;
}

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
// 2026-10-08: round 2's baked dust-and-mud ramp left with the field wear (blind waves 240 and 264 scored the wear flat
// up close: "a gravity-blind overlay ... flat tan tints"); the wear redesign owns dirt.
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

// shift/rotate every part of a kit in its local frame (builder helper); a whole-list move carries its cinch stations
function xformParts(parts: DecorPartList, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, from = 0): DecorPartList {
  for (let i = from; i < parts.length; i++) xform(parts[i].geo, x, y, z, rx, ry, rz);
  if (from === 0 && parts.lashAt) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz));
    const p = new THREE.Vector3(), d = new THREE.Vector3();
    for (const st of parts.lashAt) {
      p.set(st.x, 0, st.z).applyQuaternion(q);
      d.set(st.cx, 0, st.cz).applyQuaternion(q).setY(0).normalize();
      st.x = p.x + x; st.z = p.z + z; st.cx = d.x; st.cz = d.z;
    }
  }
  return parts;
}

/**
 * The piece's own box. Round 5: a load's lashings lie on the support beside it and are not part of its envelope (its
 * seat, guards, ledger, packing and racks read the load itself); commit checks their deck rings have support.
 */
function partsBBox(parts: DecorPartList): THREE.Box3 {
  const bb = new THREE.Box3();
  const t = new THREE.Box3();
  for (const p of parts) {
    if (p.role === 'lash') continue;
    p.geo.computeBoundingBox();
    if (p.geo.boundingBox) t.copy(p.geo.boundingBox);
    bb.union(t);
  }
  return bb;
}

/**
 * Loose loads get secured (2026-10-06, round 2: the critics read unstrapped crates, coolers and cans as "placed rather
 * than secured", and decor casts no shadow). Every loose piece gets a dark contact pad a hair proud of its support
 * under its footprint (both levels: it is the piece's footing, standing in for the contact occlusion), and hard loads
 * get webbing tie-downs over the top across their short axis, down both faces to steel D-rings at the foot (near level).
 * Soft goods keep their own cinch straps. Everything rides the painted-hardware ('cans') and steel draws the pieces
 * already carry.
 * Round 3 (2026-10-07, critics: "on a hard-edged black rectangle", "with its own flat shadow-plane beneath it"): the pad
 * is inset INSIDE the footprint (86 %), so it can only darken the contact line under a piece that rests on its
 * support; it never shows as a rectangle around one. Pieces carried on a built rack drop it (role 'pad').
 */
/**
 * A tie's path over a load, measured off the load's own surfaces (round 4, 2026-10-07; wave 216 on the PT-91: "the
 * straps are flat dark bars that neither wrap nor compress their loads"): the band crosses the load along `axis` ('z':
 * the tie runs fore-aft over a load that is wider than deep) at `lateral` on the other axis, from a deck ring outside
 * one face, up that face, over the top and down the far face to the other ring. Returns the path points in the
 * crossing plane as [along, y] with each point's outward normal, or null when the load's surfaces do not answer.
 */
function tiePath(meshes: THREE.Mesh[], axis: 'x' | 'z', lateral: number, lo: number, hi: number, top: number):
  Array<{ a: number; y: number; na: number; ny: number }> | null {
  const ray = new THREE.Raycaster();
  const o = new THREE.Vector3(), d = new THREE.Vector3();
  const at = (along: number, y: number): THREE.Vector3 => (axis === 'z' ? o.set(lateral, y, along) : o.set(along, y, lateral));
  const cast = (origin: THREE.Vector3, dir: THREE.Vector3): THREE.Intersection | null => {
    ray.set(origin, dir);
    ray.far = 1.5;
    return ray.intersectObjects(meshes, false)[0] ?? null;
  };
  // the top profile: four stations across the load, cast straight down
  const span = hi - lo;
  const tops: Array<[number, number]> = [];
  for (const f of [0.06, 0.36, 0.64, 0.94]) {
    const a = lo + span * f;
    const hit = cast(at(a, top + 0.2).clone(), d.set(0, -1, 0));
    if (hit) tops.push([a, hit.point.y]);
  }
  if (tops.length < 3) return null;
  // each face: cast inward at the face's upper and lower heights (a quarter of the way down from the top edge it meets)
  const face = (sign: number): Array<[number, number]> | null => {
    const pts: Array<[number, number]> = [];
    for (const y of [Math.max(0.02, top * 0.12), Math.max(0.03, Math.min(top - 0.02, (sign < 0 ? tops[0][1] : tops[tops.length - 1][1]) - 0.025))]) {
      const origin = at(sign < 0 ? lo - 0.3 : hi + 0.3, y).clone();
      const dir = axis === 'z' ? d.set(0, 0, -sign) : d.set(-sign, 0, 0);
      const hit = cast(origin, dir.clone());
      if (!hit) return null;
      pts.push([axis === 'z' ? hit.point.z : hit.point.x, y]);
    }
    return pts;
  };
  const near = face(-1), far = face(1);
  if (!near || !far) return null;
  const path: Array<{ a: number; y: number; na: number; ny: number }> = [];
  path.push({ a: near[0][0] - 0.03, y: 0.003, na: 0, ny: 1 });             // the deck ring outside the near face
  for (const [a, y] of near) path.push({ a, y, na: -1, ny: 0 });
  for (const [a, y] of tops) path.push({ a, y, na: 0, ny: 1 });
  for (const [a, y] of [...far].reverse()) path.push({ a, y, na: 1, ny: 0 });
  path.push({ a: far[0][0] + 0.03, y: 0.003, na: 0, ny: 1 });               // the far ring
  return path;
}

/**
 * A tie's path with its straight runs merged (round 4 follow-up, 2026-10-07): an interior point that lies within 3 mm
 * of the line through its neighbours on the same face (all three share an outward normal) adds a span and no shape,
 * so a flat lid's four stations become its two edges. The rings, the face stations and every corner stay.
 */
function simplifyTiePath<T extends { a: number; y: number; na: number; ny: number }>(path: readonly T[]): T[] {
  const out: T[] = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const p = out[out.length - 1], q = path[i], r = path[i + 1];
    const same = p.na === q.na && p.ny === q.ny && q.na === r.na && q.ny === r.ny;
    const dx = r.a - p.a, dy = r.y - p.y, len = Math.hypot(dx, dy) || 1;
    if (same && Math.abs((q.a - p.a) * dy - (q.y - p.y) * dx) / len < 0.003) continue;
    out.push(q);
  }
  out.push(path[path.length - 1]);
  return out;
}

/**
 * A webbing band along a crossing-plane path, `width` wide across the crossing plane, laid 3.5 mm off the surface it
 * follows. Round 4 follow-up (2026-10-07: the triangle budget is full on many hulls, and the closed three-sided
 * section cost six triangles a span): a ribbon with a face each way, four triangles a span, over the simplified path
 * (simplifyTiePath), so a case's tie costs what the round-3 box tie did. Piece-local, non-indexed, flat normals.
 */
function tieBand(path0: ReadonlyArray<{ a: number; y: number; na: number; ny: number }>, axis: 'x' | 'z', lateral: number,
  width: number): THREE.BufferGeometry {
  return ribbonBand(path0, (a, y, l) => (axis === 'z' ? [lateral + l, y, a] : [a, y, lateral + l]), width);
}

/**
 * tieBand along any vertical crossing plane (round 5): `P(a, y, l)` maps a path point (`a` along the crossing, height
 * `y`) and an offset `l` across the band to the piece frame; it must be affine.
 */
function ribbonBand(path0: ReadonlyArray<{ a: number; y: number; na: number; ny: number }>,
  P: (a: number, y: number, l: number) => [number, number, number], width: number): THREE.BufferGeometry {
  const path = simplifyTiePath(path0);
  const rings: Array<[[number, number, number], [number, number, number]]> = path.map((p, i) => {
    // the band's own normal at a corner: the mean of its neighbours' outward normals
    const prev = path[Math.max(0, i - 1)], next = path[Math.min(path.length - 1, i + 1)];
    let na = p.na + (prev.na + next.na) * 0.5, ny = p.ny + (prev.ny + next.ny) * 0.5;
    const l = Math.hypot(na, ny) || 1; na /= l; ny /= l;
    const off = 0.0035, hw = width / 2;
    return [P(p.a + na * off, p.y + ny * off, -hw), P(p.a + na * off, p.y + ny * off, hw)];
  });
  // the front face's winding, taken where the path is longest from its ends: it must face the path's outward normal
  const m = Math.floor(path.length / 2), r0 = rings[Math.max(0, m - 1)], r1 = rings[m];
  const e1 = new THREE.Vector3(...r1[0]).sub(new THREE.Vector3(...r0[0]));
  const e2 = new THREE.Vector3(...r0[1]).sub(new THREE.Vector3(...r0[0]));
  const pm = path[m];
  const outward = new THREE.Vector3(...P(pm.na, pm.ny, 0)).sub(new THREE.Vector3(...P(0, 0, 0)));
  const flip = e1.cross(e2).dot(outward) < 0;
  const positions: number[] = [];
  const tri = (a: number[], b: number[], c: number[]): void => { positions.push(...a, ...b, ...c); };
  for (let i = 0; i < rings.length - 1; i++) {
    const [a, b] = rings[i], [d, c] = rings[i + 1];
    // front (outward) and back (toward the load): the back face is the front's reverse
    if (!flip) { tri(a, d, b); tri(b, d, c); tri(a, b, d); tri(b, c, d); }
    else { tri(a, b, d); tri(b, c, d); tri(a, d, b); tri(b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}

/** A flat upward quad `w` by `d` centred at (x, y, z) (round 4 follow-up: the contact pad). */
function padQuad(w: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const a = [x - hw, y, z - hd], b = [x + hw, y, z - hd], c = [x + hw, y, z + hd], e = [x - hw, y, z + hd];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...e, ...c, ...a, ...c, ...b], 3));
  g.computeVertexNormals();
  return withBoxUV(g);
}

const SECURED_HARD_KITS: ReadonlySet<string> = new Set(['jerry', 'rations']);
const SECURED_PAD_KITS: ReadonlySet<string> = new Set(['cargo', 'jerry', 'rations', 'bin', 'packs', 'tarp', 'camonet']);
const SOFT_CARGO: ReadonlySet<string> = new Set(['long-duffel', 'large-rucksack', 'bedroll-pair', 'folded-tarp-pack',
  'camo-net-bag', 'crew-backpack', 'helmet-bundle', 'folding-chair', 'cable-reel']);
function secureLoadParts(parts: DecorPartList, kit: string, variant: string, detail: 0 | 1, tie: RGB): void {
  if (!SECURED_PAD_KITS.has(kit)) return;
  // round 4: a draped net lies on the deck itself (conformDrape); a dark pad would show through its mesh
  if (parts.meta?.drape) return;
  const bb = partsBBox(parts);
  if (bb.isEmpty() || bb.min.y < -0.03 || bb.max.y < 0.06) return; // a piece not authored on its foot
  const w = bb.max.x - bb.min.x, d = bb.max.z - bb.min.z, h = bb.max.y;
  const cx = (bb.max.x + bb.min.x) / 2, cz = (bb.max.z + bb.min.z) / 2;
  // round 4 follow-up (2026-10-07): the pad is one upward quad 1.5 mm proud (two triangles; its 3 mm block cost twelve,
  // and its sides sat inside the footprint where nothing sees them)
  parts.push({ mat: 'cans', role: 'pad', geo: bakeTint(padQuad(w * 0.86, d * 0.86, cx, 0.0015, cz), 0.03, 0.03, 0.026, 0) });
  const hard = SECURED_HARD_KITS.has(kit) || (kit === 'cargo' && !SOFT_CARGO.has(variant));
  // round 5: the coarse level (28 m on, where the chase and flank cameras sit) carries the ties too, without buckles
  if (!hard) return;
  const alongX = w >= d; // the tie crosses the short axis
  // Round 3: a pair or a wide case gets two ties, one over each half; a single tie down the middle of a can pair ran
  // along the gap between the cans, and the critics read the pair as "upright and unstrapped".
  const count = Math.max(w, d) > 0.38 ? 2 : 1;
  const band = 0.038, thick = 0.006;
  // round 5: the ties are lashings (tieKept drops them where the load rides a ledge or a stack), in a webbing that
  // stands off the load's own value (`tie`, tieRgbFor: a dark case takes coyote straps, a pale crate near-black ones)
  // each tie is one lashing (tie id 1000 + k); its deck rings are anchors commit checks for support
  let tieId = 1000;
  const strap = (geo: THREE.BufferGeometry) => parts.push({ mat: 'cans', role: 'lash', tie: tieId, geo: bakeTint(geo, tie[0], tie[1], tie[2], 0.25) });
  const ring = (geo: THREE.BufferGeometry, anchor = true, end?: 0 | 1, inner = false) => parts.push({ mat: 'steel',
    role: 'lash', tie: tieId, anchor, ...(end !== undefined ? { end } : {}), ...(inner ? { inner } : {}), geo: bakeShade(geo, 0.5) });
  // Round 4 (2026-10-07, wave 216 on the PT-91: "the straps are flat dark bars that neither wrap nor compress their
  // loads"): each tie follows the load's own surfaces (tiePath: down onto its lid, in onto both faces), round its
  // edges and over whatever stands on its top, from a deck ring to a deck ring, with a cam buckle on its near face.
  // A load whose surfaces do not answer keeps the round-3 box tie.
  const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = parts.filter((p) => p.role !== 'pad').map((p) => new THREE.Mesh(p.geo, solid));
  for (const mesh of meshes) mesh.updateMatrixWorld(true);
  for (let k = 0; k < count; k++) {
    tieId = 1000 + k;
    const t = count === 1 ? 0 : (k ? 0.27 : -0.27);
    // the tie takes the flattest lane near its station: beside a bottle or a handle rather than up over it, so no
    // span stands off the load
    let lateral = alongX ? cx + t * w : cz + t * d;
    let path: ReturnType<typeof tiePath> = null, rise = Infinity;
    for (const dt of [0, -0.09, 0.09, -0.16, 0.16]) {
      const at = alongX ? cx + (t + dt) * w : cz + (t + dt) * d;
      const p = tiePath(meshes, alongX ? 'z' : 'x', at, alongX ? bb.min.z : bb.min.x, alongX ? bb.max.z : bb.max.x, h);
      if (!p) continue;
      const tops = p.slice(3, p.length - 3).map((q) => q.y);
      const range = Math.max(...tops) - Math.min(...tops);
      if (range < rise - 0.01) { rise = range; path = p; lateral = at; }
    }
    if (path) {
      strap(withBoxUV(tieBand(path, alongX ? 'z' : 'x', lateral, band)));
      const along = (a: number, y: number, wx: number, wy: number, wz: number) => (alongX
        ? place(block(wx, wy, wz), lateral, y, a) : place(block(wz, wy, wx), a, y, lateral));
      // round 5: the deck rings are low steel ridges (deckRing: six triangles where a block took twelve)
      const deck = (a: number) => (alongX ? place(deckRing(band + 0.014, 0.03, 0.014), lateral, 0, a)
        : place(deckRing(band + 0.014, 0.03, 0.014), a, 0, lateral, 0, Math.PI / 2, 0));
      // each end's ring just outside the foot, and its alternative just inside the face, under the load's edge
      ring(deck(path[0].a - 0.006), true, 0);
      ring(deck(path[1].a + 0.012), true, 0, true);
      ring(deck(path[path.length - 1].a + 0.006), true, 1);
      ring(deck(path[path.length - 2].a - 0.012), true, 1, true);
      // the cam buckle on the near face, a hand's width up (round 4 follow-up: on the first tie only; the budget)
      if (k === 0 && detail) {
        const b0 = path[1], b1 = path[2];
        const by = b0.y + (b1.y - b0.y) * 0.45, ba = b0.a + (b1.a - b0.a) * 0.45 - 0.008;
        ring(along(ba, by, band + 0.012, 0.03, 0.012), false);
      }
      continue;
    }
    if (alongX) {
      const x = cx + t * w;
      strap(place(block(band, thick, d + 0.014), x, h + thick / 2, cz));
      for (const sz of [-1, 1]) {
        strap(place(block(band, h, thick), x, h / 2, cz + sz * (d / 2 + thick / 2 + 0.001)));
        ring(place(block(0.046, 0.012, 0.028), x, 0.006, cz + sz * (d / 2 + 0.018)));
      }
    } else {
      const z = cz + t * d;
      strap(place(block(w + 0.014, thick, band), cx, h + thick / 2, z));
      for (const sx of [-1, 1]) {
        strap(place(block(thick, h, band), cx + sx * (w / 2 + thick / 2 + 0.001), h / 2, z));
        ring(place(block(0.028, 0.012, 0.046), cx + sx * (w / 2 + 0.018), 0.006, z));
      }
    }
  }
}

/**
 * Tie-down webbing that stands off its load (round 5, 2026-10-08; the critics: ties "neither wrap nor compress their
 * loads", "olive bags ... with no straps" where the dark olive webbing vanished into the olive bag): a load whose own
 * surfaces are pale (canvas tan, coyote, weathered crate wood) takes near-black webbing, every darker load coyote
 * webbing. Vertex tints for the painted-hardware ('cans') draw over its map's ground (#cbc9c1): coyote about sRGB
 * (124, 110, 82), near-black about (41, 43, 36).
 */
const TIE_LIGHT: RGB = [0.335, 0.265, 0.16];
const TIE_DARK: RGB = [0.037, 0.041, 0.032];
/** A load whose mean surface luminance (linear albedo) passes this is pale and takes the dark webbing. */
const LIGHT_LOAD_Y = 0.085;
function tieRgbFor(parts: DecorPartList, canvas: THREE.Color): RGB {
  let sum = 0, n = 0;
  for (const p of parts) {
    if (p.role || p.station !== undefined) continue;
    // each family's ground: its map's mean colour times the material colour (linear)
    const g = p.mat === 'canvas' ? [canvas.r * 0.43, canvas.g * 0.4, canvas.b * 0.33]
      : p.mat === 'cans' ? [0.597, 0.584, 0.533] : p.mat === 'wood' ? [0.113, 0.092, 0.066] : null;
    const col = g ? p.geo.getAttribute('color') : null;
    if (!g || !col) continue;
    for (let i = 0; i < col.count; i += 3) {
      sum += 0.2126 * col.getX(i) * g[0] + 0.7152 * col.getY(i) * g[1] + 0.0722 * col.getZ(i) * g[2];
      n++;
    }
  }
  return (n ? sum / n : 0) > LIGHT_LOAD_Y ? TIE_DARK : TIE_LIGHT;
}

/**
 * The path of a lashing over a load (round 5): hullTiePath along any horizontal crossing direction (dx, dz) through
 * (ox, oz), scanning `half` either side. Seventeen rays down onto the load (a small bedroll's curve between samples
 * stays within 2 mm of the chord) and five heights in from each side; the upper convex hull of the hits from a deck
 * ring 15 mm beyond one flank to one beyond the other, so the webbing bridges the hollow between two bags.
 */
function lashPath(meshes: THREE.Mesh[], ox: number, oz: number, dx: number, dz: number, half: number, top: number):
  Array<{ a: number; y: number; na: number; ny: number }> | null {
  const ray = new THREE.Raycaster();
  const at = (a: number, y: number): THREE.Vector3 => new THREE.Vector3(ox + dx * a, y, oz + dz * a);
  const cast = (origin: THREE.Vector3, dir: THREE.Vector3): THREE.Intersection | null => {
    ray.set(origin, dir);
    ray.far = 3;
    return ray.intersectObjects(meshes, false)[0] ?? null;
  };
  const along = (p: THREE.Vector3): number => (p.x - ox) * dx + (p.z - oz) * dz;
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 16; k++) {
    const hit = cast(at(-half + (2 * half * k) / 16, top + 0.3), new THREE.Vector3(0, -1, 0));
    if (hit) pts.push([along(hit.point), hit.point.y]);
  }
  for (let k = 0; k < 5; k++) {
    const y = 0.015 + ((top - 0.03) * k) / 4;
    for (const sign of [-1, 1]) {
      const hit = cast(at(sign < 0 ? -half - 0.3 : half + 0.3, y), new THREE.Vector3(-sign * dx, 0, -sign * dz));
      if (hit) pts.push([along(hit.point), y]);
    }
  }
  if (pts.length < 6) return null;
  let a0 = Infinity, a1 = -Infinity;
  for (const [a] of pts) { a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
  pts.push([a0 - 0.015, 0.003], [a1 + 0.015, 0.003]);
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const hull: Array<[number, number]> = [];
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (const p of pts) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0) hull.pop();
    hull.push(p);
  }
  if (hull.length < 3) return null;
  // a corner within 2.5 mm of the chord between its kept neighbours adds a span and no shape (the triangle budget)
  const kept: Array<[number, number]> = [hull[0]];
  for (let i = 1; i < hull.length - 1; i++) {
    const p = kept[kept.length - 1], q = hull[i], r = hull[i + 1];
    const ex = r[0] - p[0], ey = r[1] - p[1], l = Math.hypot(ex, ey) || 1;
    if (Math.abs((q[0] - p[0]) * ey - (q[1] - p[1]) * ex) / l < 0.0025) continue;
    kept.push(q);
  }
  kept.push(hull[hull.length - 1]);
  const edgeN = (i: number): [number, number] => {
    const [ax, ay] = kept[i], [bx, by] = kept[i + 1];
    const ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1;
    return [-ey / l, ex / l];
  };
  return kept.map(([a, y], i) => {
    const n0 = i > 0 ? edgeN(i - 1) : edgeN(0), n1 = i < kept.length - 1 ? edgeN(i) : edgeN(kept.length - 2);
    const na = n0[0] + n1[0], ny = n0[1] + n1[1], l = Math.hypot(na, ny) || 1;
    return { a, y, na: na / l, ny: ny / l };
  });
}

/**
 * A deck ring's anchor (round 5): a low steel ridge `w` across the webbing and `d` along it, `h` tall, its base on the
 * deck (y = 0) and its ridge under the webbing; six triangles (the base never shows).
 */
function deckRing(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const a = [-hw, 0, -hd], b = [hw, 0, -hd], c = [hw, 0, hd], e = [-hw, 0, hd], r0 = [-hw, h, 0], r1 = [hw, h, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    ...a, ...r0, ...r1, ...a, ...r1, ...b,          // the near slope
    ...e, ...c, ...r1, ...e, ...r1, ...r0,          // the far slope
    ...a, ...e, ...r0, ...b, ...r1, ...c,           // the two ends
  ], 3));
  g.computeVertexNormals();
  return withBoxUV(g);
}

/**
 * Lash a soft load down (round 5, 2026-10-08; wave 255 on the M60A1: "three olive bedrolls and a round sack lie loose
 * on the rear engine deck ... with no straps or tie-downs"; wave 253 on the SEPv3: "crates, sacks and rolls ... lie loose
 * ... with no straps, lashing points, sag or contact shadow"; the coordinator: "straps that wrap the load and pull it
 * in"). Where a bag's own strap pinches it (its cinch stations, recorded by the kit), a lashing takes the strap's place:
 * webbing from a deck ring beyond one flank, over the pinched crown, to a ring beyond the other flank, 3.5 mm off the
 * load (lashPath), with a cam buckle on the first flank at the near level. Stations on one crossing line (a pair of
 * bedrolls, a pack cluster) share one lashing over all of them. The lashing's parts are 'lash' and the straps it
 * replaces 'cinch'; a station whose section does not answer keeps its plain strap. The webbing and rings ride the
 * hardware and steel draws the straps already use; no random draws.
 */
function lashLoad(parts: DecorPartList, detail: 0 | 1, tie: RGB): void {
  const stations = parts.lashAt;
  if (!stations?.length) return;
  const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = parts.filter((p) => p.role !== 'pad' && p.station === undefined).map((p) => new THREE.Mesh(p.geo, solid));
  const bb = partsBBox(parts);
  const claimed = new Set<number>(), claimedBy = new Map<number, number>();
  const lashParts: DecorPart[] = [];
  for (let i = 0; i < stations.length; i++) {
    if (claimed.has(i)) continue;
    const first = stations[i];
    const group = [i];
    for (let j = i + 1; j < stations.length; j++) {
      if (claimed.has(j)) continue;
      const b = stations[j];
      if (Math.abs(first.cx * b.cx + first.cz * b.cz) < 0.955) continue;              // square to the line within 17 deg
      if (Math.abs((b.x - first.x) * first.cz - (b.z - first.z) * first.cx) < 0.06) group.push(j);   // within 6 cm of it
    }
    let ox = 0, oz = 0;
    for (const k of group) { ox += stations[k].x; oz += stations[k].z; }
    ox /= group.length; oz /= group.length;
    const dx = first.cx, dz = first.cz;
    let half = 0;
    for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) {
      half = Math.max(half, Math.abs((x - ox) * dx + (z - oz) * dz));
    }
    const path = lashPath(meshes, ox, oz, dx, dz, half + 0.05, bb.max.y);
    if (!path) continue;
    const tieId = i;
    for (const k of group) { claimed.add(k); claimedBy.set(k, tieId); }
    const from = lashParts.length;
    // the band runs along the crossing; its width lies along the bag's axis
    const map = (a: number, y: number, l: number): [number, number, number] => [ox + dx * a - dz * l, y, oz + dz * a + dx * l];
    const band = 0.034;
    lashParts.push({ mat: 'cans', role: 'lash', geo: bakeTint(withBoxUV(ribbonBand(path, map, band)), tie[0], tie[1], tie[2], 0.25) });
    const yaw = Math.atan2(dx, dz);
    for (const [end, dir, k] of [[path[0], -1, 0], [path[path.length - 1], 1, 1]] as const) {
      // the deck ring: a low steel bar on its anchor plate, square to the webbing; its alternative under the load's edge
      for (const inner of [false, true]) {
        const [x, , z] = map(end.a + dir * (inner ? -0.022 : 0.004), 0, 0);
        lashParts.push({ mat: 'steel', role: 'lash', anchor: true, end: k, ...(inner ? { inner } : {}),
          geo: bakeShade(place(deckRing(band + 0.014, 0.03, 0.014), x, 0, z, 0, yaw, 0), 0.5) });
      }
    }
    if (detail) {
      // the cam buckle on the first flank, a hand's width up from the ring
      const p0 = path[0], p1 = path[1];
      const t = 0.45, ta = p1.a - p0.a, ty = p1.y - p0.y, tl = Math.hypot(ta, ty) || 1;
      const pa = p0.a + ta * t, py = p0.y + ty * t;
      const [x, y, z] = map(pa - (ty / tl) * 0.008, py + (ta / tl) * 0.008, 0);
      const buckle = place(block(band + 0.012, 0.03, 0.012), 0, 0, 0, Math.atan2(ta / tl, ty / tl), 0, 0);
      lashParts.push({ mat: 'steel', role: 'lash', geo: bakeShade(place(buckle, x, y, z, 0, yaw, 0), 0.5) });
    }
    for (let k = from; k < lashParts.length; k++) lashParts[k].tie = tieId;
  }
  for (const p of parts) {
    if (p.station !== undefined && claimed.has(p.station)) { p.role = 'cinch'; p.tie = claimedBy.get(p.station); }
    delete p.station;
  }
  parts.push(...lashParts);
}

/**
 * One of each lashing and the strap it replaces is drawn (round 5): a load the slot seats on a deck or rack keeps its
 * lashings ('lash') and drops the cinch straps they replace; anywhere else it keeps the cinches and drops the lashings;
 * a lashing whose deck ring finds no support gives way to the strap it would replace. Commit counts the kept parts and
 * prunes the others only once the piece is placed (a slot may try one list at several seats).
 */
interface TieRings {
  /** Lashings with an end whose rings both lack support: the strap they replace is drawn instead. */
  readonly unsupported: ReadonlySet<number>;
  /** `${tie}:${end}` for each lashing end anchored by its inner ring (the outer one had no deck under it). */
  readonly inner: ReadonlySet<string>;
}
const NO_TIE_RINGS: TieRings = { unsupported: new Set(), inner: new Set() };

function tieKept(part: DecorPart, lashed: boolean, rings: TieRings): boolean {
  if (part.role !== 'lash' && part.role !== 'cinch') return true;
  const keepLash = lashed && !(part.tie !== undefined && rings.unsupported.has(part.tie));
  if (part.role !== (keepLash ? 'lash' : 'cinch')) return false;
  // one deck ring per lashing end: the outer one, or the inner one where the outer has no deck under it
  if (part.anchor && part.end !== undefined) return rings.inner.has(`${part.tie}:${part.end}`) === !!part.inner;
  return true;
}

function pruneTies(list: DecorPartList | undefined, lashed: boolean, rings: TieRings,
  release: (geometry: THREE.BufferGeometry) => void): void {
  if (!list) return;
  // released through the attach's owner: a slot may commit a list a guard already turned away (seatLoad's keep-out
  // step), whose geometries the owner has released once
  for (let i = list.length - 1; i >= 0; i--) {
    if (!tieKept(list[i], lashed, rings)) { release(list[i].geo); list.splice(i, 1); }
  }
}

/** How high above its foot a load's base follows the support under it (m; round 5). */
const FOOT_BAND_M = 0.06;
/** How far a foot vertex may move onto the support under it (m; round 5): the soft seat's spread. */
const FOOT_REACH_M = 0.05;
/** A lashing's deck ring needs the support within this of its foot (m; round 5): a ring is never seated in air. */
const RING_REACH_M = 0.02;

/**
 * Lay a load's foot on the support it really has (round 5, 2026-10-08; the coordinator: "sag where the load rests"; the
 * contact receipt: contact pads tilted through a crowned turret roof). The support's height above or below the piece's
 * foot plane is probed straight down on a 5 x 5 grid over its footprint; then every vertex of its contact pad, of its
 * lashings near the deck and, for a soft load, of its own body within FOOT_BAND_M of the foot moves vertically by that
 * height (bilinear between the probes, clamped to FOOT_REACH_M), fully at the foot and fading to nothing at the band's
 * top: a bag settles into the hollows and rides the crowns, a pad and a deck ring lie on the deck itself. A grid node
 * with nothing under it moves nothing. `lists` share one grid (the near and coarse levels move alike).
 */
function settleFoot(lists: DecorPartList[], prober: SurfaceProber, pos: THREE.Vector3, rot: THREE.Euler, soft: boolean): void {
  // the grid spans the load and its lashings' deck runs (partsBBox leaves the lashings out)
  const bb = partsBBox(lists[0]);
  for (const p of lists[0]) {
    if (p.role !== 'lash') continue;
    p.geo.computeBoundingBox();
    if (p.geo.boundingBox) bb.union(p.geo.boundingBox);
  }
  if (bb.isEmpty()) return;
  const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
  const inv = m.clone().invert();
  const N = 5, delta: number[] = [];
  const v = new THREE.Vector3();
  const gx = (i: number): number => bb.min.x + ((bb.max.x - bb.min.x) * i) / (N - 1);
  const gz = (k: number): number => bb.min.z + ((bb.max.z - bb.min.z) * k) / (N - 1);
  for (let k = 0; k < N; k++) for (let i = 0; i < N; i++) {
    v.set(gx(i), 0, gz(k)).applyMatrix4(m);
    const hit = prober.top(v.x, v.z, v.y + 0.12);
    delta.push(hit ? THREE.MathUtils.clamp(hit.p.y - v.y, -FOOT_REACH_M, FOOT_REACH_M) : 0);
  }
  const at = (x: number, z: number): number => {
    const fx = THREE.MathUtils.clamp(((x - bb.min.x) / Math.max(bb.max.x - bb.min.x, 1e-6)) * (N - 1), 0, N - 1);
    const fz = THREE.MathUtils.clamp(((z - bb.min.z) / Math.max(bb.max.z - bb.min.z, 1e-6)) * (N - 1), 0, N - 1);
    const i = Math.min(N - 2, Math.floor(fx)), k = Math.min(N - 2, Math.floor(fz)), u = fx - i, w = fz - k;
    const d = (ii: number, kk: number): number => delta[kk * N + ii];
    return (d(i, k) * (1 - u) + d(i + 1, k) * u) * (1 - w) + (d(i, k + 1) * (1 - u) + d(i + 1, k + 1) * u) * w;
  };
  for (const list of lists) {
    for (const part of list) {
      const pad = part.role === 'pad';
      if (!pad && part.role !== 'lash' && !soft) continue;
      const attr = part.geo.getAttribute('position');
      let moved = false;
      for (let i = 0; i < attr.count; i++) {
        const ly = attr.getY(i);
        if (ly > FOOT_BAND_M) continue;
        const weight = pad ? 1 : 1 - THREE.MathUtils.smoothstep(Math.max(0, ly), 0.004, FOOT_BAND_M);
        const shift = at(attr.getX(i), attr.getZ(i)) * weight;
        if (Math.abs(shift) < 1e-5) continue;
        v.set(attr.getX(i), ly, attr.getZ(i)).applyMatrix4(m);
        v.y += shift;
        v.applyMatrix4(inv);
        attr.setXYZ(i, v.x, v.y, v.z);
        moved = true;
      }
      if (moved) { attr.needsUpdate = true; part.geo.computeBoundingBox(); }
    }
  }
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
// 2026-10-07 (tank-accessories round 4; wave 215 on the M60A1: "the crate reads as varnished mahogany furniture"): issue
// crate wood is weathered, sun-greyed pine, not a warm stained hardwood: a grey-brown ground with greyer grain and
// plank joints (the same random draws, so every crate keeps its grain).
function woodTex() {
  return canvasTex('decor-wood', 128, (g, S) => {
    g.fillStyle = '#8f8573'; g.fillRect(0, 0, S, S);
    const rng = mulberry32(0x77d1);
    const plank = S / 4;
    for (let p = 0; p < 4; p++) {
      g.fillStyle = `rgba(62,56,46,${0.10 + rng() * 0.12})`;
      g.fillRect(0, p * plank, S, 2);
      for (let i = 0; i < 22; i++) {
        const y = p * plank + 3 + rng() * (plank - 5);
        g.strokeStyle = `rgba(${rng() < 0.6 ? '84,76,62' : '156,148,130'},${0.12 + rng() * 0.15})`;
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

/**
 * The theatre a vehicle's decor nets are issued for, from the scheme it wears (round 5, 2026-10-08; wave 255 on the
 * M60A1: a green leaf-print net roll on a sand hull; the coordinator: derive net colours from the scheme and theatre).
 */
function decorNetTheatre(spec: FleetTankSpec): SuitTheatre {
  try {
    return theatreOfHex(resolveCamoVisual(spec as unknown as MaterialTankSpec).base);
  } catch {
    return 'woodland';
  }
}
/** The decor nets' own garnish seed (camoNetTexture.ts caches one texture per theatre and seed). */
const DECOR_NET_SEED = 77;

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

/**
 * Decor optic glass (lenses, vision blocks, searchlight faces): near-black with a faint green cast. 2026-10-07 (round 3:
 * the old 0x161d23 folded into the steel draw as a dark navy the probe flagged blue on the Challenger 1's sights).
 */
const DECOR_GLASS = 0x171b17;

/**
 * Issue paints of 200 L drums (round 5, 2026-10-08): olive drab, dark green, field grey and sand, linear multipliers on
 * the painted-hardware draw (muted again by accessoryPainter.paint); never the vehicle's scheme.
 */
const DRUM_PAINTS: readonly RGB[] = [[0.27, 0.31, 0.18], [0.18, 0.23, 0.15], [0.23, 0.24, 0.22], [0.44, 0.39, 0.27]];

// 2026-10-06 (round 2): water cans in slate-olive and extinguishers in a dirty issue red, not toy blue and red.
// 2026-10-07 (round 3): the extinguisher red is now only the bottle's band, an oxide red that no longer reads as a toy.
const BASE_EQUIPMENT_PALETTE = Object.freeze({
  canvas: 0x746f58,
  burlap: 0x8a7857,
  steel: 0x34383a,
  net: 0x626b4e,
  mesh: 0x62665e,
  accent: [0.34, 0.34, 0.25],
  fuelA: [0.48, 0.40, 0.23],
  fuelB: [0.35, 0.38, 0.22],
  // round 5 (2026-10-08; wave 257, the coordinator: "military kit only, in service colours (olive, tan, sand, field
  // grey)"; the critics: water cans "pale blue-grey and spotless", "blue-grey rather than service tan or olive"): water
  // cans in a deeper green than the fuel cans, and the extinguisher's band a dark field grey, never red
  waterA: [0.215, 0.27, 0.17],
  waterB: [0.185, 0.235, 0.15],
  extinguisher: [0.16, 0.165, 0.15],
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
    ammoCase: [0.30, 0.35, 0.18],
  },
  british: {
    canvas: 0x696a50, burlap: 0x817052, steel: 0x343938, net: 0x59634a,
    accent: [0.29, 0.34, 0.22], fuelA: [0.34, 0.38, 0.22], fuelB: [0.27, 0.32, 0.19],
    toolCan: [0.29, 0.34, 0.21],
  },
  'east-asian': {
    canvas: 0x5d674f, burlap: 0x786b4d, steel: 0x303634, net: 0x536047,
    accent: [0.25, 0.34, 0.22], fuelA: [0.29, 0.36, 0.20], fuelB: [0.22, 0.30, 0.18],
    waterA: [0.19, 0.26, 0.17], waterB: [0.16, 0.22, 0.145],
  },
  french: {
    canvas: 0x746b55, burlap: 0x88765b, steel: 0x363a3d, net: 0x616951,
    accent: [0.31, 0.33, 0.27], fuelA: [0.41, 0.38, 0.25], fuelB: [0.31, 0.34, 0.24],
    waterA: [0.22, 0.25, 0.18], waterB: [0.19, 0.215, 0.155],
  },
  german: {
    canvas: 0x62665a, burlap: 0x7a705d, steel: 0x35393b, net: 0x59624f,
    accent: [0.28, 0.31, 0.27], fuelA: [0.34, 0.35, 0.25], fuelB: [0.26, 0.31, 0.23],
    toolCan: [0.30, 0.34, 0.25],
  },
  israeli: {
    canvas: 0x80765f, burlap: 0x918064, steel: 0x3a3b38, net: 0x6d7058,
    accent: [0.38, 0.36, 0.28], fuelA: [0.44, 0.40, 0.27], fuelB: [0.36, 0.36, 0.25],
    waterA: [0.3, 0.28, 0.2], waterB: [0.26, 0.245, 0.18],
  },
  italian: {
    canvas: 0x6b6b4d, burlap: 0x857454, steel: 0x353936, net: 0x5c6449,
    accent: [0.31, 0.35, 0.22], fuelA: [0.38, 0.39, 0.21], fuelB: [0.29, 0.34, 0.18],
    toolCan: [0.31, 0.37, 0.20],
  },
  nordic: {
    canvas: 0x59645f, burlap: 0x716f5d, steel: 0x303638, net: 0x4f5f55,
    accent: [0.24, 0.31, 0.29], fuelA: [0.30, 0.35, 0.28], fuelB: [0.24, 0.31, 0.25],
    waterA: [0.19, 0.24, 0.19], waterB: [0.165, 0.21, 0.165],
  },
  polish: {
    canvas: 0x626751, burlap: 0x7c7154, steel: 0x333837, net: 0x566149,
    accent: [0.27, 0.34, 0.22], fuelA: [0.32, 0.37, 0.20], fuelB: [0.25, 0.32, 0.18],
    toolCan: [0.28, 0.35, 0.19],
  },
  soviet: {
    canvas: 0x596047, burlap: 0x75694c, steel: 0x303532, net: 0x505b42,
    accent: [0.24, 0.32, 0.18], fuelA: [0.28, 0.35, 0.18], fuelB: [0.22, 0.29, 0.16],
    waterA: [0.18, 0.24, 0.14], waterB: [0.155, 0.205, 0.12],
    toolCan: [0.25, 0.34, 0.17], ammoCase: [0.24, 0.32, 0.17],
  },
  ukrainian: {
    canvas: 0x636b50, burlap: 0x7e7251, steel: 0x343836, net: 0x58654a,
    accent: [0.29, 0.35, 0.20], fuelA: [0.39, 0.38, 0.19], fuelB: [0.27, 0.34, 0.17],
    waterA: [0.2, 0.26, 0.15], waterB: [0.17, 0.225, 0.13],
    toolCan: [0.27, 0.35, 0.18],
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
    // 2026-10-06 (round 2): matte, oily steel; at 0.62 roughness and 0.35 metalness thin handles read as mirror chrome
    steel: () => painted({
      color: equipmentPalette.steel, roughness: 0.78, metalness: 0.16,
      roughnessMap: canPaint ? getSharedRoughnessTexture(spec) : undefined,
      vertexColors: true, envMapIntensity: 0.35,
    }),
    // round 4 (2026-10-07): matte, greyer, weathered issue-crate wood (was 0x97815f, roughness 0.9, a warm stain that
    // read as varnished mahogany): woodTex's grey-brown ground x a near-neutral multiplier, about #5f5648 in all
    wood: () => painted({
      map: woodTex(), color: 0xaca8a5, roughness: 0.96, metalness: 0.0,
      vertexColors: true, envMapIntensity: 0.08,
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
    // round 5 (2026-10-08): the rolled and draped nets wear the suits' garnished net in the vehicle's theatre
    // (camoNetTexture.ts; sand on a desert hull), its painted tones carrying the colour
    net: () => painted({
      map: garnishedNetTextures(decorNetTheatre(spec), DECOR_NET_SEED)?.map ?? undefined, color: 0xffffff,
      roughness: 0.95, metalness: 0.0, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.1,
    }),
    mesh: () => painted({ // wire-grid panels (baskets, cages)
      map: gridTex(), color: equipmentPalette.mesh, roughness: 0.7, metalness: 0.35,
      alphaTest: 0.3, side: THREE.DoubleSide, vertexColors: true, envMapIntensity: 0.25,
    }),
    // optic faces / vision blocks / searchlight glass. 2026-10-07 (tank-accessories round 3: blue optics read as UI
    // placeholders): dark coated glass with a faint green cast, in the matte steel draw it folds into
    lens: () => ({
      color: DECOR_GLASS, roughness: 0.42, metalness: 0.3, envMapIntensity: 0.3,
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
        // round 5: the nets swap to the new theatre's when a garage pattern switch repaints the vehicle in place
        if (key === 'net' && canPaint) {
          followVehicleScheme(spec.id, material, (vis) => {
            const next = garnishedNetTextures(theatreOfHex(vis.base), DECOR_NET_SEED);
            if (next) material.map = next.map;
          });
        }
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

function accessoryPainter(parts: DecorPartList, rng: Rng, detail: 0 | 1, nation = '', fabric?: number): AccessoryPainter {
  const palette = equipmentPaletteForNation(nation);
  const webbingTint = (tone: number): RGB => {
    const c = new THREE.Color(palette.canvas);
    return [c.r * 0.5 * 0.8 * tone, c.g * 0.56 * 0.78 * tone, c.b * 0.44 * 0.7 * tone];
  };
  return {
    detail,
    rng,
    fabric,
    paint(geo, rgb, ao = 0.26) {
      const [r, g, b] = mutedEquipmentTint(rgb, nation, palette);
      parts.push({ mat: 'cans', geo: bakeTint(geo, r, g, b, ao) });
    },
    cloth(geo, tone = 0.75, rgb) {
      const uv = boxUV(geo, 2.5);
      parts.push({ mat: 'canvas', geo: rgb ? bakeTint(uv, rgb[0] * tone, rgb[1] * tone, rgb[2] * tone, 0.32) : bakeShade(uv, tone, 0.32) });
    },
    // Webbing rides the painted-hardware draw, which nearly every frame with cargo already carries (2026-10-05 draw
    // audit: canvas webbing on rear-rack cans and drums added a canvas draw to 37 hulls with no soft goods). Colour:
    // the nation's issue canvas through the webbing tint (0.5, 0.56, 0.44), times the weave map's ground over the
    // lighter hardware map's (#b9b2a4 over #cbc9c1, linear), so the strap reads as it did in the canvas family.
    strap(geo, tone = 0.6) {
      const [r, g, b] = webbingTint(tone);
      parts.push({ mat: 'cans', geo: bakeTint(geo, r, g, b, 0.3) });
    },
    // round 5: a bag's cinch strap at a station a lashing may take over (lashLoad); `at` and `across` in the piece frame
    cinch(geo, at, across, tone = 0.6) {
      const [r, g, b] = webbingTint(tone);
      const stations = parts.lashAt ?? (parts.lashAt = []);
      const station = stations.push({ x: at[0], z: at[1], cx: across[0], cz: across[1] }) - 1;
      parts.push({ mat: 'cans', station, geo: bakeTint(geo, r, g, b, 0.3) });
    },
    // Burlap shares the canvas draw (same weave map, near-identical finish): a warmer tint of the issue fabric.
    burlap(geo, tone = 0.9) { parts.push({ mat: 'canvas', geo: bakeTint(boxUV(geo, 2.8), 1.42 * tone, 1.16 * tone, 0.94 * tone, 0.3) }); },
    steel(geo, tone = 0.55) { parts.push({ mat: 'steel', geo: bakeShade(geo, tone) }); },
    wood(geo, tone = 0.8, rgb) {
      const uv = boxUV(geo, 2.2);
      parts.push({ mat: 'wood', geo: rgb ? bakeTint(uv, rgb[0] * tone, rgb[1] * tone, rgb[2] * tone, 0.3) : bakeShade(uv, tone) });
    },
    // Small wooden parts ride the painted-hardware draw (grain does not read on a handle; 2026-10-05 draw audit): the
    // wood family's colour, woodTex ground #8f8573 x 0xaca8a5 over the hardware map's #cbc9c1 (linear; round 4,
    // 2026-10-07: the weathered crate wood, was #8d7a5e x 0x97815f).
    trim(geo, tone = 0.7) { parts.push({ mat: 'cans', geo: bakeTint(geo, 0.1897 * tone, 0.1572 * tone, 0.121 * tone, 0.28) }); },
    rubber(geo, tone = 0.6) { parts.push({ mat: 'rubber', geo: bakeShade(geo, tone) }); },
    kit(geo, tone = 0.92) { parts.push({ mat: 'kit', geo: bakeShade(geo, tone) }); },
    lens(geo) { parts.push({ mat: 'lens', geo: bakeShade(geo, 0.9) }); },
    // a rolled or folded net shows its garnish gathered: the net's tile at a little under half its laid-out size
    net(geo, tone = 1) { parts.push({ mat: 'net', geo: bakeShade(boxUV(geo, 2.2 / NET_TILE_M), tone, 0.12) }); },
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
  cupola({ rng, v = 'ring', detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.92 + rng() * 0.14;
    buildCupola(accessoryPainter(parts, rng, detail), v, tone);
    return parts;
  },

  // -- openable-looking hatch cover with hinges -------------------------------
  hatch({ rng, v = 'round', detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.16;
    buildHatch(accessoryPainter(parts, rng, detail), v, tone);
    return parts;
  },

  // -- roof AAMG: .50 M2 / DShK, pintle or ring, with/without gun shield ------
  // The fleet's one Browning-family construction (machineGunGeometry.ts, shared
  // with the profile fittings): bearing -> spindle -> fork -> trunnion, pressed
  // receiver, feed cover, spade grips, jacket and muzzle device per class, can
  // and belt. Weapon steel and ammunition stay gunmetal; the shield and ring
  // take the scheme's kit paint. Gun and shield stow ~7 deg muzzle-up about
  // the trunnion; the mount stays plumb.
  aamg({ rng, v = 'm2', shield = false, ring = false, detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.56 + rng() * 0.06;
    const collector = {
      add(slot: string, geo: THREE.BufferGeometry, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
        xform(geo, x, y, z, rx, ry, rz);
        // round 2 (2026-10-06): the can in olive-khaki and the belt's rounds in dull brass, on the painted-hardware draw
        if (slot === MG_AMMO_CAN_SLOT) { parts.push({ mat: 'cans', geo: bakeTint(geo, 0.2, 0.2, 0.13, 0.28) }); return; }
        if (slot === MG_CARTRIDGE_SLOT) { parts.push({ mat: 'cans', geo: bakeTint(geo, 0.34, 0.25, 0.1, 0.2) }); return; }
        const painted = slot === 'detail' || slot === 'hull';
        parts.push({ mat: painted ? 'kit' : 'steel', geo: bakeShade(geo, painted ? 0.92 : slot === 'shadow' ? 0.32 : tone) });
      },
    };
    // round 3 (2026-10-07): the coarse level (detail 0) keeps the envelope without the gun's small hardware
    // round 4 (2026-10-07): the decor gun keeps the right-hand feed it always had. Its slot is the rear roof's right side
    // (side -1 on every generic manifest), so the round-4 crew default (the gunner's left) put the can, belt and tray
    // inboard over the roof furniture, and the placement guards (overlap, keep-clear) dropped the gun from nine mobile-
    // tier builds and admitted it on three others (fleet decor census, base 6753ef5eb vs the round-4 branch).
    const layout = createPintleLayout({
      cls: v === 'dshk' ? 'dshk' : 'm2', shield, ring: ring ? { r: 0.33, stubs: 4 } : false, ammo: true, tone: 'two-tone',
      detail: detail ? 1 : 0, feed: 'right',
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
  light({ rng, v = 'ir_large', detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.12;
    buildSearchlight(accessoryPainter(parts, rng, detail), v, tone);
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
      // round 3 (2026-10-07, the kit critics: "antenna masts stand off their bases"): the rod pivots about its foot inside
      // the base (the old centred rotation set the foot 0.9 x H x sin(lean) off the base centre, 11 cm on a long whip)
      // and is the fitting whip's tapered, bowed construction (accessoryKits.ts whipAntennaParts) at the old rod's cost
      // (18 triangles for 20): the decor budget is full on several hulls and an early piece's growth drops a late one,
      // so the decor whip stands on its moulded base without the fitting's coil
      const whip = whipAntennaParts({ h: H, r: 0.012, rake: lean, seed: Math.round(Math.abs(lean) * 1e4), spring: false, radial: 3, along: 2 });
      parts.push({ mat: 'steel', geo: bakeShade(xform(whip.rod, 0, 0.07, 0), 0.5) });
      if (helmet) {
        parts.push({ mat: 'kit', geo: bakeTint(xform(sph(0.115, 9, 6), whip.tip[0], whip.tip[1] + 0.02, whip.tip[2], 0, 0, 0, [1, 0.74, 1]), 0.55, 0.58, 0.42) });
      }
    }
    return parts;
  },

  // -- gunner's sight head / periscope hood ------------------------------------
  sight({ rng, v = 'peri', detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.92 + rng() * 0.1;
    buildSight(accessoryPainter(parts, rng, detail), v, tone);
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
    // Round 3 (2026-10-07, catalog wave: "raised panels bury their own bolts"): a bolt under the wedge's raised face
    // sits on that face instead of inside it.
    const rw = w * 0.78 / 2, ry0 = h * 0.42 - h * 0.35, ry1 = h * 0.42 + h * 0.35;
    for (const [px, py] of [[-bx, 0.06], [bx, 0.06], [-bx, by], [bx, by], [0, by], [0, 0.06]]) {
      const raised = v === 'wedge' && Math.abs(px) < rw && py > ry0 && py < ry1;
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylZ(0.016, 0.02, 6), px, py, (raised ? t * 1.45 + t / 2 : t) + 0.008), 0.58) });
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
    const bracket = bakeShade(xform(box(per * 0.082 + 0.06, 0.10, 0.06), 0, 0.05, -0.01), tone);
    bracket.userData.tone = tone;
    parts.push({ mat: 'kit', bracket: true, geo: bracket }); // wedge bracket (turretCheekPair lays its back on the cheek)
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
      parts.push({ mat: 'kit', pivot: [x, y, 0.02], geo: bakeShade(xform(g, x, y, 0.02), tone * (0.94 + rng() * 0.1)) });
      // the dark muzzle cap shares the bank's kit draw (one resident draw per bank family)
      parts.push({ mat: 'kit', pivot: [x, y, 0.02], geo: bakeShade(xform(cap, x, y, 0.02), 0.32) });
    }
    return parts;
  },

  // -- stowage boxes: wood crate / steel bin / long fender box ------------------
  // Molded / pressed stock (accessoryPrimitives.moldedBox): filleted vertical
  // edges and bevelled rims, so the boxes catch a highlight on every edge.
  bin({ rng, v = 'steel', w = 0.55, h = 0.28, d = 0.4, detail = 1, nation = '' }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.2;
    const seg = detail ? 2 : 1;
    // Round 5 (2026-10-08; wave 262, both critics: "stowage that takes on the hull's camo pattern disappears into it.
    // Canvas and kit should be their own materials and colours"): a loose steel bin is issue kit in its own service paint
    // (the nation's tool-can olive, the long box its ammunition-case olive or sand) on the painted-hardware draw, not the
    // scheme's kit paint
    const palette = equipmentPaletteForNation(nation);
    const service = mutedEquipmentTint(v === 'long' ? palette.ammoCase : palette.toolCan, nation, palette);
    const paint = (geo: THREE.BufferGeometry, k: number) => parts.push({ mat: 'cans',
      geo: bakeTint(geo, service[0] * k, service[1] * k, service[2] * k, 0.3) });
    if (v === 'crate') {
      parts.push({ mat: 'wood', geo: bakeShade(boxUV(place(moldedBox(w, h, d, 0.008, 1, 0.006), 0, h / 2, 0), 2.2), tone) });
      for (const sy of [0.14, 0.9]) { // batten frames
        parts.push({ mat: 'wood', geo: bakeShade(boxUV(place(moldedBox(w + 0.022, 0.035, d + 0.022, 0.006, 1, 0.005), 0, h * sy, 0), 2.2), 0.68) });
      }
    } else if (v === 'long') { // fender-length box with proud lid
      paint(place(moldedBox(w, h * 0.86, d, 0.018, seg, 0.01), 0, h * 0.43, 0), tone * 0.94);
      paint(place(moldedBox(w * 1.012, h * 0.16, d * 1.03, 0.022, seg, 0.012), 0, h * 0.92, 0), 1.08);
      if (detail) {
        for (const fx of [-w * 0.32, w * 0.32]) { // hasp straps over the lid lip
          parts.push({ mat: 'steel', geo: bakeShade(place(moldedBox(0.03, h * 0.42, 0.01, 0.003, 0, 0.002), fx, h * 0.74, d / 2 + 0.006), 0.6) });
        }
      }
    } else { // pressed steel bin, crowned lid + clasp
      paint(place(moldedBox(w, h * 0.8, d, 0.03, seg, 0.012), 0, h * 0.4, 0), 0.95 + (tone - 1) * 0.4);
      paint(place(moldedBox(w * 1.01, h * 0.22, d * 1.02, 0.045, seg, h * 0.08), 0, h * 0.89, 0), 1.08);
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
  tarp({ rng, v = 'fat', len = 0.9, detail = 1, fabric }) {
    const parts: DecorPartList = [];
    const tone = 0.85 + rng() * 0.25;
    // round 4 (2026-10-07): the roll's strap stations and pinch come from a seed off its tone draw (no new draw)
    buildTarpRoll(accessoryPainter(parts, rng, detail, '', fabric), len, v === 'fat' ? 0.125 : 0.085, tone * 0.9, 71 + Math.floor(tone * 7919));
    return parts;
  },

  // -- camo netting: rolled bundle or draped patch (accessoryKits) ---------------
  camonet({ rng, v = 'roll', len = 1.0, w = 0.9, detail = 1 }) {
    const parts: DecorPartList = [];
    const painter = accessoryPainter(parts, rng, detail);
    if (v === 'roll') {
      const tone = 0.6 + rng() * 0.1;
      buildNetRoll(painter, len, tone, 83 + Math.floor(tone * 7919));
    } else {
      const seed = rng() * 10;
      rng();
      buildNetDrape(painter, w, len, seed);
      // round 4: the placement lays the sheet on the deck under it (conformDrape)
      parts.meta = { drape: true };
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
  packs({ rng, n = 3, detail = 1, fabric }) {
    const parts: DecorPartList = [];
    const span = buildPackCluster(accessoryPainter(parts, rng, detail, '', fabric), n);
    xformParts(parts, -span / 2, 0, 0);
    return parts;
  },

  // -- loose crew cargo: 24 named, material-authored variants ---------------------
  // Molded cases, sewn bags, pressed cans and crates from accessoryKits.ts: lids,
  // handles, straps and latches stay separate members instead of becoming one
  // grey cuboid after merging. Every geometry still originates at its seat.
  cargo({ rng, v = 'beer-cooler-blue', scale = 1, nation = '', flat, detail = 1, fabric }) {
    const variant = (FLEET_EQUIPMENT_VARIANTS as readonly string[]).includes(v)
      ? v as FleetEquipmentVariant : 'beer-cooler-blue';
    const parts: DecorPartList = [];
    // round 4 follow-up: the can pairs ride their nation's rack (canRackStyleFor)
    buildCargoVariant(variant, accessoryPainter(parts, rng, detail, nation, fabric), equipmentPaletteForNation(nation), flat,
      canRackStyleFor(nation));
    const safeScale = THREE.MathUtils.clamp(Number(scale) || 1, 0.72, 1);
    if (safeScale !== 1) {
      for (const part of parts) part.geo.scale(safeScale, safeScale, safeScale);
      for (const st of parts.lashAt ?? []) { st.x *= safeScale; st.z *= safeScale; }
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
    // round 4 (2026-10-07): each basket's bags and roll take seeds from its own size, so no two hulls carry the same
    const own = Math.round(w * 1000 + d * 100 + h * 10);
    for (const [x, tone, yaw] of [[-w * 0.22, 0.86, 0.12], [w * 0.24, 0.72, -0.1]] as const) {
      duffel(painter, bagLen, bagR, [x, h * 0.30 + rod * 0.6, -d * 0.5], yaw, tone, 500 + Math.round(x * 100) + own);
    }
    const tarpR = Math.min(0.075, h * 0.22);
    const tarpParts: DecorPartList = [];
    buildTarpRoll(accessoryPainter(tarpParts, rng, detail), w * 0.58, tarpR, 0.8, 71 + own);
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
    // Round 5 (2026-10-08; wave 257 on the Merkava 4: "the cable ... is a uniform black line with a loop rather than wire
    // rope"): six-sided rope whose radius swells on alternate sides and turns a sixth round each span, so three strands
    // wind along its lay (the round-4 tube's 20 spans, one more side)
    const curve = new THREE.CatmullRomCurve3(pts);
    const strand = (tube: THREE.TubeGeometry, path: THREE.Curve<THREE.Vector3>, spans: number): THREE.TubeGeometry => {
      const rp = tube.getAttribute('position');
      const c = new THREE.Vector3(), v = new THREE.Vector3();
      for (let i = 0; i <= spans; i++) {
        path.getPointAt(i / spans, c);
        for (let j = 0; j <= 6; j++) {
          const k = i * 7 + j;
          v.fromBufferAttribute(rp, k).sub(c).multiplyScalar(1 + 0.15 * Math.cos(Math.PI * j + 1.05 * i)).add(c);
          rp.setXYZ(k, v.x, v.y, v.z);
        }
      }
      tube.computeVertexNormals();
      return tube;
    };
    const rope = bakeShade(strand(new THREE.TubeGeometry(curve, 20, R, 6, false), curve, 20), 0.5);
    // the part order is the cable's contract (griffinViper reads it): the rope, each end's eye and ferrule, three clamps
    parts.push({ mat: 'steel', geo: rope });
    for (const s of [-1, 1]) {
      // round 5 (wave 255 on the T-90M's cable: "the tow-cable eye reads as a rubbery ring, not braided steel"): each end
      // a spliced eye lying on the deck, the rope itself turned back in a teardrop to a pressed ferrule over the throat
      // the ferrule stands on the support at the rope's end height (no part dips under the clamp plane, y = 0); the
      // eye's legs leave it pressed together and the loop sags to rest on the support at its far end
      const end = curve.getPointAt(s < 0 ? 0 : 1), L = R * 6.5, W = R * 2.4;
      const yf = Math.max(end.y, R * 1.6 + 0.003), yRest = R * 0.9 + 0.003;
      const at = (u: number, w: number): THREE.Vector3 => new THREE.Vector3(end.x + s * u, yf + (yRest - yf) * Math.min(1, u / (L * 0.6)), end.z + w);
      const loop = new THREE.CatmullRomCurve3([at(R * 0.4, R * 0.6), at(L * 0.42, W * 0.92), at(L * 0.84, W * 0.78), at(L, 0),
        at(L * 0.84, -W * 0.78), at(L * 0.42, -W * 0.92), at(R * 0.4, -R * 0.6)], false, 'centripetal');
      parts.push({ mat: 'steel', geo: bakeShade(strand(new THREE.TubeGeometry(loop, 8, R * 0.9, 6, false), loop, 8), 0.52) });
      parts.push({ mat: 'steel', geo: bakeShade(xform(cylX(R * 1.6, R * 3.4, 7), end.x + s * R * 0.9, yf, end.z), 0.55) });
    }
    const straps: THREE.BufferGeometry[] = [];
    // hull clamps: round 5 (2026-10-08; the contact receipt: the rope ran through solid clamp blocks) a saddle under the
    // rope and a steel strap over it, each where the rope really lies
    for (const s of [-0.3, 0, 0.31]) {
      const at = curve.getPointAt(THREE.MathUtils.clamp(s + 0.5, 0, 1));
      const base = at.y - R * 1.15 - 0.004, Rs = R * 1.15 + 0.006;   // the strand swell reaches 1.15 R
      parts.push({ mat: 'kit', geo: bakeShade(xform(box(0.06, base, 2 * Rs + 0.016), at.x, base / 2, at.z), 0.72) });
      // the strap: down to the saddle on both sides, over the rope between (outward winding)
      const path: Array<[number, number]> = [[at.z - Rs, base], [at.z - Rs, at.y]];
      for (const a of [Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.25]) path.push([at.z + Math.cos(a) * Rs, at.y + Math.sin(a) * Rs]);
      path.push([at.z + Rs, at.y], [at.z + Rs, base]);
      const ring: number[] = [], x0 = at.x - 0.016, x1 = at.x + 0.016;
      for (let k = 0; k < path.length - 1; k++) {
        const [z0, y0] = path[k], [z1, y1] = path[k + 1];
        ring.push(x0, y0, z0, x0, y1, z1, x1, y1, z1, x0, y0, z0, x1, y1, z1, x1, y0, z0);
      }
      const strap = new THREE.BufferGeometry();
      strap.setAttribute('position', new THREE.Float32BufferAttribute(ring, 3));
      strap.computeVertexNormals();
      straps.push(bakeShade(withBoxUV(strap), 0.55));
    }
    // the clamps' straps ride the rope's own part (one steel draw either way)
    const flat = rope.index ? rope.toNonIndexed() : rope;
    const merged = mergeGeometries([flat, ...straps], false);
    if (merged) {
      parts[0].geo = merged;
      if (flat !== rope) flat.dispose();
      rope.dispose();
      for (const g of straps) g.dispose();
    } else for (const g of straps) parts.push({ mat: 'steel', geo: g });
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
  // (round 5: DRUM_PAINTS, the issue colours a drum comes in)
  // twin: two longitudinal 200 L drums as one piece, brackets down (deck-seat).
  // single: one TRANSVERSE drum (axis X), rear-plate cantilever mount. The drum
  // body is a lathe with rolled chimes and rolling hoops (accessoryKits.drum200).
  drums({ rng, v = 'twin', _W = 0, detail = 1 }) {
    const parts: DecorPartList = [];
    const painter = accessoryPainter(parts, rng, detail);
    const R = 0.28, L = 0.85;
    const drum = (cx: number, transverse: boolean) => {
      const tone = 0.86 + rng() * 0.18;
      // round 5 (wave 255: "identical smooth tubes. Give them rims and ribs, rust at the straps, spill streaks and some
      // variation"): each drum its own issue colour from its tone draw (no new draw), rust and spill baked by drum200
      drum200(painter, cx, transverse, tone, DRUM_PAINTS[Math.floor(tone * 997) % DRUM_PAINTS.length], Math.floor(tone * 7919));
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
  jerry({ rng, n = 2, water = true, nation = '', detail = 1 }) {
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
    // Round 4 (2026-10-07, wave 217 on the T-72B3M's can rack: "flat pure-black square bars with no brackets, bolts or
    // shading ... a thin strut ending in a loose plate"): the rack is shaded steel, closed round the cans, and the
    // tie-downs (secureLoadParts) wrap the cans themselves. Round 4 follow-up (wave 240: "the same generic ... jerrycan
    // rack on several nations"): the rack is the nation's own (accessoryKits canRack: a welded Soviet frame, a NATO
    // holder with a latch bar, Israeli end plates and retaining bars, a Chinese frame with clamp bars).
    canRack(painter, canRackStyleFor(nation), pairedCount * pitch + 0.05, 0.39, 0.44, pairedCount,
      ((pairedCount - 1) / 2) * pitch + 0.0825, 0.1725);
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
    // Round 3 (2026-10-07, critics: "a spare road wheel lies flat and unsecured on the deck ... where it would slide
    // off at the first turn"): the wheel is held. A threaded stud rises through the hub from a deck foot with a clamp
    // plate and nut. Two webbing straps cross over the tyre and run down its sides to D-rings at the deck. Upright,
    // the stud carries it against the plate.
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.018, 0.018, W + 0.06, 6), 0, (W + 0.06) / 2, 0), 0.5) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(r * 0.24, r * 0.24, 0.012, 10), 0, W + 0.03, 0), 0.46) });
    parts.push({ mat: 'steel', geo: bakeShade(xform(cylY(0.03, 0.03, 0.024, 6), 0, W + 0.048, 0), 0.4) });
    if (flat) {
      const strapRgb: RGB = [0.30, 0.31, 0.21];
      for (const turn of [0.35, 0.35 + Math.PI / 2]) {
        const strap: THREE.BufferGeometry[] = [
          xform(box(0.038, 0.006, r * 2 + 0.012), 0, W + 0.004, 0),
          xform(box(0.038, W, 0.006), 0, W / 2, r + 0.004),
          xform(box(0.038, W, 0.006), 0, W / 2, -r - 0.004),
        ];
        for (const g of strap) parts.push({ mat: 'cans', geo: bakeTint(xform(g, 0, 0, 0, 0, turn, 0), strapRgb[0], strapRgb[1], strapRgb[2], 0.25) });
        for (const sz of [-1, 1]) {
          parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.05, 0.012, 0.03), 0, 0.006, sz * (r + 0.022), 0, turn, 0), 0.5) });
        }
      }
    }
    if (!flat) xformParts(parts, 0, r, -W / 2, Math.PI / 2, 0, 0); // upright against a plate
    return parts;
  },

  // -- exhaust shroud / muffler (axis Z along the fender) ------------------------------
  exhaust({ rng, v = 'muffler', len = 0.9, detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.7 + rng() * 0.15; // heat-scorched paint
    buildExhaust(accessoryPainter(parts, rng, detail), v, len, tone);
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
  travelLock({ rng, detail = 1 }) {
    const parts: DecorPartList = [];
    const tone = 0.9 + rng() * 0.1;
    buildTravelLock(accessoryPainter(parts, rng, detail), tone);
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
    // Round 5 (2026-10-08; wave 254 on the Challenger 1: "the black bucket at the far-left rear corner hangs in space
    // with no visible hook or bracket"): a pressed pail with a rolled rim and two swaged ribs, its bail a round 8 mm
    // rod from two ears on the rim up to the hook it hangs on (hullRearHang builds the bracket and hook)
    const tone = 0.62 + rng() * 0.1;
    parts.push({ mat: 'steel', geo: bakeShade(latheY([[0.075, 0], [0.09, 0.02], [0.1, 0.09], [0.105, 0.097], [0.108, 0.15],
      [0.113, 0.157], [0.115, 0.2], [0.123, 0.207], [0.117, 0.214], [0.107, 0.208], [0.094, 0.03], [0.0005, 0.03]], 10)
      .rotateY(Math.PI / 2), tone) });                                  // a lathe station under each ear (the ears sit on the wall)
    for (const s of [-1, 1]) parts.push({ mat: 'steel', geo: bakeShade(xform(box(0.016, 0.03, 0.014), s * 0.118, 0.19, 0), 0.5) }); // bail ears
    parts.push({ mat: 'steel', geo: bakeShade(sweptTube([[-0.124, 0.19, 0], [-0.1, 0.27, 0], [-0.045, 0.32, 0], [0, 0.33, 0],
      [0.045, 0.32, 0], [0.1, 0.27, 0], [0.124, 0.19, 0]], 0.0045, 5, 12), 0.5) });                         // bail up
    return parts;
  },

  // -- fresh-cut branch bundle (proposal E, 2026-10-05): per-spec opt-in field camouflage ------
  foliage({ rng, v = 'flank', n = 5, detail = 1 }) {
    const parts: DecorPartList = [];
    buildBranchBundle(accessoryPainter(parts, rng, detail), v === 'deck' || v === 'lying' ? 'deck' : 'flank', n);
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
  foliage: { label: 'Fresh-cut branches (opt-in)', eras: ['modern'], variants: [{ v: 'flank', n: 5 }, { v: 'deck', n: 4 }] },
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
  // Fixed-bore vehicles keep the rear-deck travel lock outside the gun sweep. Round 4 follow-up (2026-10-07): it is the
  // gun's fitting and seats before the loose cargo (early), which on the Strv 103A had begun to take its station.
  manifest.push({ kit: 'travelLock', p: 0.6, v: {}, slot: ['rearDeck', { center: true, back: true, small: true }], early: true });
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
    // 2026-10-06 (round 2): bundles lashed along the turret flanks and laid on a fender, never planted upright
    { kit: 'foliage', p: 1, v: { v: 'flank', n: 5 }, slot: ['turretSide', { side: -1, rear: true }] },
    { kit: 'foliage', p: 1, v: { v: 'flank', n: 4 }, slot: ['turretSide', { side: 1, rear: true }] },
    { kit: 'foliage', p: 1, v: { v: 'deck', n: 4 }, slot: ['fender', { side: -1, zFrac: 0.12 }] },
  ];
}

/**
 * Field-equipment variants no loadout carries, and what a draw that lands on one carries instead (round 4,
 * 2026-10-07; see decorManifestFor's service items). Round 4 follow-up: a light soft load of about the retired piece's
 * cost (the chair 260 triangles, the spool 494), so the budget still has room for the rows after it; the next service
 * item (a tool can or the helmet bag, 420-720 on a rack) cost the fleet loads.
 */
const RETIRED_STAND_IN: Readonly<Partial<Record<FleetEquipmentVariant, FleetEquipmentVariant>>> = {
  'folding-chair': 'folded-tarp-pack',
  'cable-reel': 'camo-net-bag',
};

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
  // Round 5 (2026-10-08; wave 254: "the rear kit is a few tiny, clean, rigid lumps", the bucket "hangs in space"; wave 262
  // on the desert line: "olive kit bags, upright green cans, a brown box and a grey bin ... unstrapped"): the Challenger 1
  // carried the default draw (smoke, whip, IR light, side links, bow hooks, bucket, rations). It keeps those pieces and
  // gains a fat canvas roll across the rear deck, laid ahead of the roof gear so the stern reads at play distance; the
  // L37 on the commander's cupola is the profile's roof gun, so the decor adds none (as before).
  challenger1: () => [
    { kit: 'smoke', p: 1, v: { v: '4' }, slot: ['turretCheekPair', {}] },
    { kit: 'antenna', p: 1, v: { v: 'whip_short' }, slot: ['turretRoof', { rear: true, side: 1 }] },
    { kit: 'tarp', p: 1, v: { v: 'fat', len: 1.25 }, slot: ['rearDeck', { corner: -1 }] },
    { kit: 'bucket', p: 1, v: {}, slot: ['hullRearHang', {}] },
    { kit: 'rations', p: 1, v: { n: 2 }, slot: ['rearDeck', { center: true, small: true }] },
    { kit: 'shackles', p: 1, v: { v: 'hook' }, slot: ['bowPair', {}] },
    { kit: 'tracks', p: 1, v: { n: 4, linkW: 0.46 }, slot: ['turretSidePlate', { side: -1 }] },
    { kit: 'light', p: 1, v: { v: 'ir_small' }, slot: ['turretRoof', { rear: false, side: 1 }] },
  ],
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
  // Round 5 (2026-10-08; wave 256 on the Strv 103A rear basket: "a tan box with two crossed olive poles and a black
  // curved mark, is unidentifiable as any kit and reads as a cartoon face"): that was the casemate kit's stowed travel
  // lock, seated in the tail rack. The 103A carries its gun's travel clamp on the beak (sweden.ts), so it takes none.
  strv103a: (spec, rng) => defaultManifest(spec, rng)
    .map((row) => (row.kit === 'cable' || row.kit === 'travelLock' ? { ...row, p: 0 } : row)),
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
  // Round 4 (2026-10-07, wave 217: "the Leclerc's stowage is sparse for a turret that size"): bdbe29f69 seated the
  // bustle basket and its packs early; at 1,796 and 1,172 triangles they cost the fleet cargo three of its seven loads.
  // Round 4 follow-up: they wait their turn again. With the cheaper ties, the retired pieces' light stand-ins and
  // packing, six of the Leclerc's seven loads now ride its turret (the bustle, the roof and the side ledges).
  leclerc: () => [
    { kit: 'basket', p: 1, v: { w: 1.4, d: 0.42, h: 0.3 }, slot: ['turretRearFrame', {}] },
    { kit: 'packs', p: 1, v: { n: 3 }, slot: ['turretRear', { onBasket: true }] },
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
  if (spec.id === 'm6_linebacker' || spec.id === 'amx10p' || spec.id === 'amx10p_25') return [];
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
  // Round 4 (2026-10-07, wave 216 on the Strv 103A): the 103A has no turret either, so its turret routes probed the
  // hull from an empty turret frame and the one load that found a seat was hung off a periscope dome. Its loads take
  // the flat roof beside and behind the cupolas instead (measured: 1.87-1.88 m from x -1.6 to -0.9 and 1.0 to 1.6),
  // clear of the commander's ring (KEEP_CLEAR_HULL), the front pair where the front three-quarter view sees them;
  // the aft routes stay behind them.
  const strvA = spec.id === 'strv103a';
  const strvARoutes = (x: number, z: number, fallback: Array<[string, DecorSlotArgs]>): Array<[string, DecorSlotArgs]> =>
    strvA ? [['hullRoof', { x, z }], ...fallback] : fallback;
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
  // towing cable has a dedicated, armor-seated run along the hull side, and it
  // is always carried (round 3: a 0.85 roll on the shared stream let unrelated
  // seating changes drop it).
  if (spec.id === 'griffin_viper') {
    for (const row of base) if (row.kit === 'cable') { row.slot = ['hullSideCable', { side: 1 }]; row.p = 1; row.early = true; }
  }
  // 2026-10-08 (coordinator ruling, "a visual refactor must not change a gameplay count incidentally"): the Type 89
  // Light Tiger's decor bank pair is curated on its roof front. Its cheek stations read their height off pivotTopY(),
  // and the old compact roof RWS raised that probe to 1.12 m, so the third station met a roof box and the pair stood
  // on the roof front (8 of its 20 launch sockets, the PR head's). The round-5 true-size open-yoke RWS reads 1.03 m,
  // the station meets the turret side and overhangs the width guard, and the pair was lost (20 -> 12). The pair keeps
  // its roof-front seat by name: on the roof plate itself, outboard of the roof box, the PR head's yaw.
  if (spec.id === 'type89_light_tiger') {
    for (const row of base) if (row.kit === 'smoke') row.slot = ['turretRoofPair', { x: 0.76, z: 0.36, yaw: 0.55 }];
  }
  // Round 4 (2026-10-07): no loadout carries a cable spool or a camp chair. Wave 215 on the M60A1 and Type 99A: "a
  // wooden cable spool ... with no bracket or lashing ... decor cargo rather than crew kit" (both critics: strapping it
  // down would be the wrong fix); wave 217 on the Leclerc (and the Challenger 1 before it): "a camp chair hangs off the
  // turret with its legs in the air", read as toys. A tank whose draw lands on either carries its stand-in
  // (RETIRED_STAND_IN: a folded tarp pack for the chair, a net bag for the spool), so no other tank's equipment moves;
  // both stay in the vocabulary.
  const service = (offset: number): FleetEquipmentVariant => {
    const item = choose(serviceGear, 'fender-service', offset);
    return RETIRED_STAND_IN[item] ?? item;
  };
  const serviceItem = service(0);
  const cargo: DecorManifestRow[] = [
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(hardCases, 'deck-case')),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(0.65, -1.45) : strvARoutes(-1.22, -0.70, hardCaseRoutes(side, 0.12)) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(softStowage, 'bustle-soft')),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-0.25, -1.45) : strvARoutes(1.32, -0.66, aftRoutes(-side, 0.12)) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(serviceItem),
      // A fire extinguisher lies in a hull rack or on the deck; laid across
      // the turret roof it read as a red drum with a blue lens.
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-1.05, -1.30)
        : strvARoutes(-1.24, 0.22, serviceItem === 'fire-extinguisher' && decorEra(spec) === VEHICLE_ERAS.MODERN
          ? hullServiceRoutes(-side, 0.22)
          : aftRoutes(-side, 0.22)) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(pairedCans, 'rear-cans')),
      // The 103B has no rotating turret: its water-can cradle sits at the
      // exact roof point supplied by Gallery surface markup.
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-0.80, -0.20) : strvARoutes(1.30, -1.42, normalPairedCanRoutes) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(hardCases, 'deck-case', 3)),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(1.15, -1.00) : strvARoutes(-0.36, -1.26, hardCaseRoutes(-side, 0.02)) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(service(2)),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(0.85, -0.30) : strvARoutes(-1.25, -1.45, aftRoutes(side, 0.22)) }],
    },
    {
      kit: 'cargo', p: 1,
      v: cargoVariant(choose(softStowage, 'bustle-soft', 2)),
      slot: ['fleetCargo', { routes: spec.id === 'strv103'
        ? strvRoofRoutes(-0.25, -0.85) : strvARoutes(1.32, 0.22, aftRoutes(side, 0.02)) }],
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
// Running gear by name: wheels, sprockets, idlers, rollers, the track run and its pads. The track GUARDS
// (hullTrackGuardL/R: the mudguards and side skirts) are hull-fixed equipment that decor seats on and is blocked by.
// Until 2026-10-05 the bare /track/ caught them too, so a side piece could seat on the hull BEHIND a skirt, and the
// skirt's bucket (rubber or painted) decided decor admission (burlakFixedSidePaint.selftest).
const GEAR_NAME_RE = /wheel|sprocket|idler|roller|road|track(?!guard)|tread/i;

/** True for running-gear meshes, which decor never probes or seats on (the track guards are not running gear). */
export function isDecorRunningGearName(name: string): boolean {
  return GEAR_NAME_RE.test(name);
}

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
      if (m && m.colorWrite !== false && !isDecorRunningGearName(o.name || '')
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

/**
 * A cantilever stowage rack bolted to the rear plate, built in the carried piece's own frame (round 3, 2026-10-07).
 * The hull rear rack slot hung loads behind the plate with nothing under them; the critics read the M1A2 bag as
 * "floats entirely clear of the hull above it and the ground below it" and the T-90M's cans and chest the same way.
 * The rack is a welded frame of square rails under the piece's footprint, slats, a retaining lip at the rear edge
 * and a diagonal bracket on each side from a plate foot down to the rail end. It is painted steel and rides the
 * steel draw. `plateZ` is the local z of the rear plate face; the piece occupies `bb` on its foot (y = 0).
 */
function rearRackParts(bb: THREE.Box3, railZ: readonly [number, number], detail: 0 | 1,
  struts: ReadonlyArray<{ b: number; z: number; n?: THREE.Vector3 } | null>,
  railN: ReadonlyArray<THREE.Vector3 | null> = [null, null]): DecorPart[] {
  // Round 4 (2026-10-07, wave 217 on the T-72B3M: "flat pure-black square bars with no brackets, bolts or shading, and
  // its only visible support is a thin strut ending in a loose plate below it"): the frame is angle stock in shaded
  // steel (RACK_STEEL_TONE, not near-black), each strut is round bar ending on a foot plate laid on the rear plate where
  // the plate really is at that height (`footZ`, probed by the slot: a sloped plate leans back), and every foot plate
  // carries its bolt heads.
  // Round 4 follow-up (2026-10-07, wave 240: "rack struts ending in mid-air on the Russian tanks' rears"): each side
  // rail runs to the plate at its own height (`railZ`, probed per side by the slot) and its upper foot is bolted there;
  // each strut's foot is where the slot found the plate below it (`struts`). A side the slot found no plate under
  // carries no strut, and its rail foot becomes a deeper welded bracket bolted to the plate.
  const parts: DecorPart[] = [];
  const steel = (geo: THREE.BufferGeometry) => parts.push({ mat: 'steel', geo: bakeShade(geo, RACK_STEEL_TONE) });
  const x0 = bb.min.x - 0.025, x1 = bb.max.x + 0.025, z0 = bb.min.z - 0.03, z1 = Math.min(railZ[0], railZ[1]);
  const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2;
  const rail = 0.03;
  for (const [i, x] of [x0, x1].entries()) {
    const len = railZ[i] - z0;
    steel(angleStock(len, 'z', x, z0 + len / 2, i ? 1 : -1, rail));
  }
  // the short cross rails are plain bar (round 4 follow-up: the budget); the long side rails stay angle stock
  for (const z of [z0 + rail / 2, z1 - rail / 2]) steel(place(block(w + rail, rail, rail), cx, -rail / 2, z));
  // round 4 follow-up: a slat every 12 cm (it was 9; the budget is full on many hulls)
  const slats = detail ? Math.max(3, Math.round(d / 0.12)) : 2;
  for (let k = 0; k < slats; k++) {
    const z = z0 + rail + (k + 0.5) * ((d - 2 * rail) / slats);
    steel(place(block(w - rail, 0.008, 0.035), cx, -0.004, z));
  }
  steel(place(block(w + rail, 0.06, 0.008), cx, 0.03, z0 + 0.004));                // retaining lip at the rear edge
  for (const [i, x] of [x0, x1].entries()) {
    const strut = struts[i];
    if (strut) {
      steel(roundBar([x, -rail, z0 + 0.04], [x, -strut.b, strut.z - 0.012], 0.012, detail ? 8 : 5));  // diagonal under-strut
      steel(footPlate(x, -strut.b, strut.z, 0.07, 0.09, detail, strut.n));           // foot plate bolted to the hull
      steel(footPlate(x, -rail / 2, railZ[i], 0.07, 0.07, 0, railN[i]));            // upper foot at the rail (under the load)
    } else {
      steel(footPlate(x, -0.06, railZ[i], 0.07, 0.14, detail, railN[i]));            // welded bracket bolted to the plate
    }
  }
  return parts;
}

/** Rack steel's baked shade (round 4): the steel family at full value reads as shaded steel; 0.4 read near-black. */
const RACK_STEEL_TONE = 1.15;

/**
 * Angle stock (round 4): a 5 mm L of two flanges `size` wide and `len` long, running along `along` with its middle at
 * `mid` on that axis and `across` on the other: the horizontal flange under the load's edge, the vertical flange on
 * its outer side (`out` -1 / +1 across the run), hanging below y = 0.
 */
function angleStock(len: number, along: 'x' | 'z', across: number, mid: number, out: number, size: number): THREE.BufferGeometry {
  const t = 0.005;
  const flat = along === 'z' ? place(block(size, t, len), across, -t / 2, mid) : place(block(len, t, size), mid, -t / 2, across);
  const web = along === 'z' ? place(block(t, size, len), across + out * (size / 2 - t / 2), -size / 2, mid)
    : place(block(len, size, t), mid, -size / 2, across + out * (size / 2 - t / 2));
  const merged = mergeGeometries([flat, web], false) ?? flat;
  if (merged !== flat) { flat.dispose(); web.dispose(); }
  return merged;
}

/**
 * A bolt head standing on a face (round 4 follow-up, 2026-10-07): a low square pyramid, `size` across and `rise`
 * proud, its base on the face at `faceZ` and its point toward -z. Four triangles where a block cost twelve; its base
 * sits on the plate, so it closes there.
 */
function boltHead(x: number, y: number, faceZ: number, size = 0.016, rise = 0.008): THREE.BufferGeometry {
  const h = size / 2, apex = [x, y, faceZ - rise];
  const c = [[x - h, y - h, faceZ], [x + h, y - h, faceZ], [x + h, y + h, faceZ], [x - h, y + h, faceZ]];
  const positions: number[] = [];
  for (let k = 0; k < 4; k++) positions.push(...c[k], ...apex, ...c[(k + 1) % 4]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return withBoxUV(g);
}

/**
 * A foot plate on a plate face at z = `faceZ` (the plate behind it, +z), with two bolt heads at the near level. Round 5
 * (2026-10-08; the contact receipt: a vertical foot plate cut into a sloped rear plate, or stood off a leaning turret
 * wall): given the face's outward normal `n` (from the probe that found the face), the foot lies on the face itself.
 */
function footPlate(x: number, y: number, faceZ: number, w: number, h: number, detail: 0 | 1,
  n?: THREE.Vector3 | null): THREE.BufferGeometry {
  const plate = place(block(w, h, 0.01), 0, 0, -0.005);
  const bolts = detail ? [-1, 1].map((s) => boltHead(s * w * 0.3, 0, -0.01)) : [];
  const merged = bolts.length ? (mergeGeometries([plate, ...bolts], false) ?? plate) : plate;
  if (merged !== plate) { plate.dispose(); for (const b of bolts) b.dispose(); }
  if (n && n.lengthSq() > 1e-8) merged.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), n.clone().normalize()));
  return merged.translate(x, y, faceZ);
}

/** How far a rear rack's diagonal struts reach down the plate below its rails (m). */
function rearRackBrace(bb: THREE.Box3): number {
  return Math.min(0.24, Math.max(0.12, (bb.max.y - bb.min.y) * 0.55));
}
/** A rear rack's lowest point below its load's foot: the strut's foot plate (round 4). */
const REAR_RACK_FOOT = 0.045;
/** A turret-side load's back clears the surface behind it by this (m; round 5, sideClearance)... */
const SIDE_CLEAR_M = 0.008;
/** ...and a ledge reaches at most this far past the probed wall to give it that (m). */
const SIDE_PUSH_MAX_M = 0.32;

/**
 * Turret-side carriage for a hung load (round 3, 2026-10-07), built in the piece's frame, where the turret wall lies
 * at local z = `wallZ` and the piece's foot at y = 0. The side slot pressed bags and rolls against the wall with
 * nothing under or around them, so they read as stuck on. Each load now sits on two welded L-arms that run from the
 * wall out under its far edge, held by a webbing strap from a wall cleat over its top to the arm tip.
 */
function sideLedgeParts(bb: THREE.Box3, wallZ: number, detail: 0 | 1, webbingRgb: RGB, load: THREE.Mesh[] = [],
  wallAt?: (x: number, y: number) => { p: THREE.Vector3; n: THREE.Vector3 } | null): DecorPart[] {
  const parts: DecorPart[] = [];
  // round 4 (wave 217: racks of "flat pure-black square bars with no brackets, bolts or shading"): angle-stock arms in
  // shaded steel, the wall plates bolted, and the strap laid over the load's own surfaces (tiePath) where they answer
  const steel = (geo: THREE.BufferGeometry) => parts.push({ mat: 'steel', geo: bakeShade(geo, RACK_STEEL_TONE) });
  const len = bb.max.x - bb.min.x;
  const arms = len > 0.5 ? [bb.min.x + len * 0.2, bb.max.x - len * 0.2] : [(bb.min.x + bb.max.x) / 2];
  const top = bb.max.y;
  for (const x of arms) {
    // round 5: the wall foot lies on the wall where the slot finds it behind the arm (a leaning or curved turret side
    // tilts and moves it, a bin or a cloth cover stands it out), not on a plane at wallZ, below the arm's flange (the
    // load rests against the wall above it); the arm runs from that foot out under the load
    const wall = wallAt?.(x, -0.045) ?? null;
    const z0 = wall ? wall.p.z : wallZ;
    const reach = Math.max(0.06, bb.max.z + 0.02 - z0);
    steel(angleStock(reach, 'z', x, z0 + reach / 2, 1, 0.03));                        // arm under the load
    steel(place(block(0.03, 0.05, 0.008), x, 0.025, z0 + reach - 0.004));             // upturned tip
    steel(footPlate(x, -0.045, z0, 0.06, 0.08, detail, wall?.n ?? null));             // wall foot plate, bolted
    if (detail) steel(roundBar([x, -0.075, z0 + 0.008], [x, -0.012, z0 + reach * 0.7], 0.009, 6)); // gusset strut
    const band = (geo: THREE.BufferGeometry) => parts.push({ mat: 'cans', geo: bakeTint(geo, webbingRgb[0], webbingRgb[1], webbingRgb[2], 0.25) });
    const path = load.length ? tiePath(load, 'z', x, Math.max(z0, bb.min.z), bb.max.z, top) : null;
    // the wall cleat on the wall at the strap's height; the strap runs from it to the load's back edge and over
    const cleatY = (path ? path[2].y : top) + 0.012;
    const cleatWall = wallAt?.(x, cleatY) ?? null;
    const cleatZ = (cleatWall ? cleatWall.p.z : z0) + 0.01;
    if (path) {
      if (path[2].a - cleatZ > 0.03) path.splice(0, 2, { a: cleatZ + 0.008, y: cleatY, na: 0, ny: 1 });
      band(withBoxUV(tieBand(path, 'z', x, 0.035)));
    } else {
      band(place(block(0.035, 0.006, bb.max.z - cleatZ), x, top + 0.003, (cleatZ + bb.max.z) / 2));   // over the top
      band(place(block(0.035, top, 0.006), x, top / 2, bb.max.z + 0.003));                           // down the outer face
    }
    steel(place(block(0.05, 0.03, 0.02), x, cleatY, cleatZ));                           // wall cleat
  }
  return parts;
}

// Round 3 (2026-10-07). The 5-point seat above seats a piece at the MAX height under a probe pattern capped at 0.42 m
// and accepts spreads of 0.12-0.42 m, so a piece could rest on one high point and float over the rest of its
// footprint. A census of 220 tanks found 41 % of seated pieces over 5 cm of spread and 247 over 10 cm. The critics
// read that as "perched on a thin post", "the olive stowage bag floats entirely clear of the hull" and "placed rather
// than secured". A cargo seat is now judged on the support it really has. A 3 x 3 grid spans the piece's whole
// footprint and a least-squares support plane is fitted through it. A rigid piece needs every probe within
// RIGID_SPREAD_M of that plane, so it rests flat (tilted onto a sloped plate at most LOAD_MIN_NY) or the slot walks on
// to another candidate. A soft piece accepts up to SOFT_SPREAD_M and sags onto the high points: its fabric takes the
// gap, so it never bridges air.
const RIGID_SPREAD_M = 0.03;
const SOFT_SPREAD_M = 0.05;
/** A load rests on a deck, not a ramp: its support plane may lean at most 12 degrees (casemate roofs excepted). */
const LOAD_MIN_NY = Math.cos((12 * Math.PI) / 180);
const SOFT_SAG_M = 0.05;
/** Kits and cargo variants whose fabric can sag over uneven support (everything else rests rigidly). */
const SAGGING_KITS: ReadonlySet<string> = new Set(['packs', 'tarp', 'camonet']);
const SAGGING_CARGO: ReadonlySet<string> = new Set(['long-duffel', 'large-rucksack', 'bedroll-pair', 'folded-tarp-pack',
  'camo-net-bag', 'crew-backpack', 'helmet-bundle']);
/** Pieces judged as loads on their support (cargo, cans, bags, rolls, drums...), not roof equipment (lights, sights, whips). */
const LOAD_KITS: ReadonlySet<string> = new Set(['jerry', 'rations', 'packs', 'tarp', 'camonet', 'bin', 'drums', 'wheel',
  'bucket', 'sandbags', 'log']);
function isLoadPiece(pieceName: string): boolean {
  return pieceName.startsWith('cargo:') || LOAD_KITS.has(pieceName);
}
function sagsOnSupport(pieceName: string): boolean {
  if (pieceName.startsWith('cargo:')) return SAGGING_CARGO.has(pieceName.slice(6));
  return SAGGING_KITS.has(pieceName);
}
function supportedSeat(
  prober: SurfaceProber,
  cx: number,
  cz: number,
  w: number,
  d: number,
  fromY: number,
  slotMaxSpread: number,
  soft: boolean,
  offX = 0,
  offZ = 0,
): SurfaceSeat | null {
  // Least-squares support plane through the grid (symmetric offsets, so the cross terms vanish): a flat but sloped
  // plate is full support for a rigid piece tilted onto it; what must stay small is the residual off that plane.
  const hx = Math.max(0.03, w * 0.44), hz = Math.max(0.03, d * 0.44);
  cx += offX; cz += offZ;
  const ys: number[] = [];
  let sum = 0, sx = 0, sz = 0;
  for (const fx of [-1, 0, 1]) {
    for (const fz of [-1, 0, 1]) {
      const h = prober.top(cx + fx * hx, cz + fz * hz, fromY);
      if (!h) return null;
      ys.push(h.p.y);
      sum += h.p.y; sx += fx * hx * h.p.y; sz += fz * hz * h.p.y;
    }
  }
  const a = sum / 9, b = sx / (6 * hx * hx), c = sz / (6 * hz * hz);
  let above = 0, below = 0, k = 0;
  for (const fx of [-1, 0, 1]) {
    for (const fz of [-1, 0, 1]) {
      const r = ys[k++] - (a + b * fx * hx + c * fz * hz);
      if (r > above) above = r;
      if (-r > below) below = -r;
    }
  }
  const residual = above + below;
  if (residual > Math.min(slotMaxSpread, soft ? SOFT_SPREAD_M : RIGID_SPREAD_M)) return null;
  const n = new THREE.Vector3(-b, 1, -c).normalize();
  // A rigid piece rests on the highest points above the plane; a soft one sags back toward the plane through them.
  const lift = soft ? above - Math.min(residual, SOFT_SAG_M) * 0.7 : above;
  return { y: a + lift, n, spread: residual };
}

/**
 * Stations decor must leave clear (round 3, 2026-10-07), in the HULL frame as [x, z, radius]: commander machine-gun
 * rings and cupolas whose traverse a load would block. The critics read the Strv 103's "dark duffel bag lying over
 * the machine-gun ring, so the gun can be neither seen nor traversed". The radius covers the ring and the gun's sweep.
 */
const KEEP_CLEAR_HULL: Readonly<Record<string, ReadonlyArray<readonly [number, number, number]>>> = {
  strv103: [[0.26, -0.22, 0.62], [0.06, -0.35, 0.34]],
  // round 4 (2026-10-07): and the periscope dome on the left of the roof (top at 2.02 m), which the decor chest stood on
  strv103a: [[0.28, -0.40, 0.70], [-0.535, -0.285, 0.26]],
  // round 4 (2026-10-07): the Challenger 1 commander's L37 cupola on the low right roof (turret-local (0.50, -0.81),
  // turret pivot z 0.362): the bedrolls the decor laid there would bury the new gun's pintle and can.
  challenger1: [[0.50, -0.45, 0.62]],
};

/** A disc of the frame's deck plane (frame-local x, z, radius) that no load may cover. */
interface DecorKeepOut { x: number; z: number; r: number }

/**
 * Working equipment a load must leave clear (round 4, 2026-10-07; wave 215 on the Type 99A: "antennas grow out of the
 * stowage on the turret: the left whip from inside the wooden crate, the centre one from the pair of rolls, the right
 * one from the olive bag"). Per fitting type: how tall a foot to read (m) and the clearance round it. A roof gun keeps
 * its pintle or ring base clear (its barrel rides above the loads).
 */
// Round 4 follow-up (2026-10-07): the discs are the support audit's own (whip foot + 5 cm, gun mounts at most 0.22 or
// 0.30 m, hatch and cupola patches 0.8 of their half-diagonal); the wider margins turned away loads the audit judged
// clear, and the fleet lost 116 of its 1,375 loads in round 4.
const KEEP_OUT_FITTINGS: Readonly<Record<string, { foot: number; clear: number; maxR: number }>> = {
  antennaWhip: { foot: 0.12, clear: 0.05, maxR: 0.2 },
  // a gun body without its own pintle (the Challenger 1's L37) reads its receiver as the foot: a disc round its
  // centre, never the whole gun's length
  pintleMG: { foot: 0.22, clear: 0.05, maxR: 0.22 },
  americanM2: { foot: 0.22, clear: 0.05, maxR: 0.22 },
  americanRws: { foot: 0.22, clear: 0.05, maxR: 0.3 },
  openYokeRws: { foot: 0.22, clear: 0.05, maxR: 0.3 },
};
/**
 * The decor seats no weapon. Round 5 first dropped the kit's generic roof AA gun ('aamg') under any roof gun the vehicle
 * carries (the machine-gun helper's sweep: "bmp3_rok: the decor aamg stands right over the authored MAG, two guns
 * stacked"; the coordinator: one owner per mount point). Then the owner's field standard (main 6763d7cc0, 2026-10-08:
 * every roof weapon true to its calibre, none duplicate or nonfunctional) retired it: the one vehicle it still reached,
 * the Dardo, carries no roof gun on its real turret, and a decor gun never fires. Its manifest rows keep their draws, so
 * every other decor piece seats as before.
 */
const DECOR_RETIRED_KITS: ReadonlySet<string> = new Set(['aamg']);
/** Structural hatches and cupolas (P.addHatch / P.addCupola buckets) and their disc's share of the patch's half-diagonal. */
const KEEP_OUT_STRUCTURE_RE = /(?:Hatch|Cupola)$/;
const KEEP_OUT_STRUCTURE_SHARE = 0.8;
/** Decor equipment committed before the loads keeps a disc of this radius round its seat (m). */
const KEEP_OUT_DECOR: Readonly<Record<string, number>> = { antenna: 0.1, aamg: 0.3, hatch: 0.3, cupola: 0.36 };

/**
 * The keep-out discs of one frame (`group`-local), read off the built geometry: each whip or roof-gun fitting's foot
 * (its vertices within `foot` of its lowest point), and each hatch or cupola (the structural buckets' vertices grouped
 * on a 10 cm raster into connected patches). Running gear and decor are never read.
 */
function collectKeepOut(group: THREE.Group): DecorKeepOut[] {
  const out: DecorKeepOut[] = [];
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const m = new THREE.Matrix4(), v = new THREE.Vector3();
  const cells = new Map<string, [number, number]>();
  const CELL = 0.1;
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.geometry || o.visible === false) return;
    if ((o.name || '').startsWith('rig_decor')) return;
    const fitting = typeof o.userData.fitting === 'string' ? KEEP_OUT_FITTINGS[o.userData.fitting] : undefined;
    const structural = KEEP_OUT_STRUCTURE_RE.test(o.name || '');
    if (!fitting && !structural) return;
    const pos = o.geometry.getAttribute('position');
    if (!pos) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    if (structural) {
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m);
        const key = `${Math.floor(v.x / CELL)},${Math.floor(v.z / CELL)}`;
        if (!cells.has(key)) cells.set(key, [Math.floor(v.x / CELL), Math.floor(v.z / CELL)]);
      }
      return;
    }
    let minY = Infinity;
    for (let i = 0; i < pos.count; i++) minY = Math.min(minY, v.fromBufferAttribute(pos, i).applyMatrix4(m).y);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      if (v.y > minY + fitting!.foot) continue;
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
    }
    if (x0 <= x1) {
      out.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.min(fitting!.maxR, Math.hypot(x1 - x0, z1 - z0) / 2 + fitting!.clear) });
    }
  });
  // connected patches of hatch / cupola cells (4-neighbour), one disc each
  const seen = new Set<string>();
  for (const [key, start] of cells) {
    if (seen.has(key)) continue;
    seen.add(key);
    const stack = [start];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    while (stack.length) {
      const [i, k] = stack.pop()!;
      x0 = Math.min(x0, i); x1 = Math.max(x1, i); z0 = Math.min(z0, k); z1 = Math.max(z1, k);
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const next = `${i + di},${k + dk}`;
        if (!cells.has(next) || seen.has(next)) continue;
        seen.add(next);
        stack.push([i + di, k + dk]);
      }
    }
    const w = (x1 - x0 + 1) * CELL, d = (z1 - z0 + 1) * CELL;
    out.push({ x: (x0 + x1 + 1) * CELL / 2, z: (z0 + z1 + 1) * CELL / 2, r: Math.hypot(w, d) / 2 * KEEP_OUT_STRUCTURE_SHARE });
  }
  return out;
}

/** How far a piece stays off a field-upgrade volume (m), and how close to a side's outermost lattice a screen bar is. */
const FIELD_EQUIPMENT_CLEAR = 0.01;
const FIELD_SCREEN_FACE_BAND = 0.04;

/** The bounds of each connected piece of `mesh` (vertices welded on a 0.1 mm grid), in the frame `toFrame` maps into. */
function connectedPieceBoxes(mesh: THREE.Mesh, toFrame: THREE.Matrix4): THREE.Box3[] {
  const pos = mesh.geometry.getAttribute('position'), index = mesh.geometry.getIndex();
  const n = pos.count, parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const local: THREE.Vector3[] = [];
  const welded = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(toFrame);
    local.push(p);
    const key = `${Math.round(p.x * 1e4)},${Math.round(p.y * 1e4)},${Math.round(p.z * 1e4)}`;
    const at = welded.get(key);
    if (at === undefined) welded.set(key, i); else parent[find(i)] = find(at);
  }
  const corners = index ? index.count : n;
  for (let t = 0; t < corners; t += 3) {
    const a = index ? index.getX(t) : t, b = index ? index.getX(t + 1) : t + 1, c = index ? index.getX(t + 2) : t + 2;
    parent[find(b)] = find(a); parent[find(c)] = find(a);
  }
  const boxes = new Map<number, THREE.Box3>();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!boxes.has(r)) boxes.set(r, new THREE.Box3());
    boxes.get(r)!.expandByPoint(local[i]);
  }
  return [...boxes.values()];
}

/**
 * The volumes a profile's field upgrade owns, `group`-local (2026-10-08; main's 5f8eefaa4 "roof cannons and field
 * protection upgrades", the coordinator: "they must not double up with your MGs, RWS or stowage -- two guns on one
 * mount or packs clipping your racks. Decide one owner per mount point"). The upgrade owns every mount point it fits,
 * and a decor piece whose placed box enters one takes its next route: the stern rack (rearFieldStowage: the shelf,
 * cans, log, bags and the rods back to the stern plate), the roof cage wings (fieldRoofCage), the side screens (on a
 * tank carrying oplotFieldUpgrade or leclercFieldProtection: per side, the band from the wall to the screen face that
 * the outermost lattice bars and their standoffs span; on a tank carrying modernFieldCage, the band its panels span,
 * wall to packs) and each piece of a remote roof station seated on a yaw support
 * (sourceMachineGun with a datum: its base, cradle, gun, sight and ammunition box, each its own box, since one box round
 * an L-shaped station would also take the turret cheek under its ammunition box). Read off the built tank's own records
 * and geometry; running gear and decor never.
 */
function collectFieldEquipment(group: THREE.Group, frame: DecorFrame, screens: boolean): THREE.Box3[] {
  const out: THREE.Box3[] = [];
  const rack = group.userData.rearFieldStowage as
    { anchors: [number, number, number][]; z: number; top: number; logY: number } | undefined;
  if (frame === 'hull' && rack?.anchors?.length) {
    const front = Math.max(...rack.anchors.map((a) => a[2])) + 0.03;
    out.push(new THREE.Box3(new THREE.Vector3(-1.34, rack.logY - 0.09, rack.z - 0.17),
      new THREE.Vector3(1.34, rack.top + 0.01, front)));
  }
  const cage = group.userData.fieldRoofCage as { feet: [number, number, number][]; corners: [number, number, number][] }[] | undefined;
  if (frame === 'turret' && Array.isArray(cage)) {
    for (const wing of cage) {
      const b = new THREE.Box3();
      for (const p of [...wing.feet, ...wing.corners]) b.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
      b.max.y += 0.025;
      out.push(b.expandByScalar(0.03));
    }
  }
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const toFrame = (mesh: THREE.Object3D): THREE.Matrix4 => new THREE.Matrix4().multiplyMatrices(inv, mesh.matrixWorld);
  const lattice: THREE.Box3[] = [];
  group.traverse((o) => {
    if (o.userData?.remoteControlled && o.userData.auxiliaryPivot && o.getObjectByName('sourceMachineGun_yawSupport')) {
      o.traverse((c) => {
        if (!(c instanceof THREE.Mesh) || !c.geometry?.getAttribute('position')) return;
        for (const b of connectedPieceBoxes(c, toFrame(c))) out.push(b.expandByScalar(FIELD_EQUIPMENT_CLEAR));
      });
    }
    if (screens && o instanceof THREE.Mesh && o.name === `${frame}OpenLattice`) lattice.push(...connectedPieceBoxes(o, toFrame(o)));
  });
  // per side, the screen: the lattice pieces reaching within FIELD_SCREEN_FACE_BAND of that side's outermost bar (the
  // face bars and the standoffs out to them), one band box
  for (const side of [-1, 1]) {
    const own = lattice.filter((b) => Math.sign(b.min.x + b.max.x) === side);
    if (!own.length) continue;
    const outer = (b: THREE.Box3): number => (side > 0 ? b.max.x : -b.min.x);
    const face = Math.max(...own.map(outer));
    const band = new THREE.Box3();
    for (const b of own) if (outer(b) >= face - FIELD_SCREEN_FACE_BAND) band.union(b);
    out.push(band.expandByScalar(FIELD_EQUIPMENT_CLEAR));
  }
  // the owner's modern field cage (modernFieldCage.ts, main 6763d7cc0 "fit cages"): three panels a side stood 0.19 m off
  // the turret's outer course on wall feet, its bars the frame's whole open lattice on every tank that carries it. Per
  // side, the band those bars span (each standoff starts inside its wall foot, so the band runs from the wall out to the
  // screen face over the panels' run and height), and past the face the rear panels' strapped packs (0.12 m). Read off
  // the built bars, not the record's anchors: a profile's post-build scale (the Challenger 1 X's turret, 1.1) moves the
  // geometry and leaves the record where the builder stood. Decor that hung on the bare wall (the Challengers' cans,
  // canvas and kit) takes its next route.
  if (frame === 'turret' && group.userData.modernFieldCage) {
    const bars: THREE.Box3[] = [];
    group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.name === 'turretOpenLattice') bars.push(...connectedPieceBoxes(o, toFrame(o)));
    });
    for (const side of [-1, 1]) {
      const band = new THREE.Box3();
      for (const b of bars) if (Math.sign(b.min.x + b.max.x) === side) band.union(b);
      if (band.isEmpty()) continue;
      if (side > 0) band.max.x += 0.13; else band.min.x -= 0.13;
      out.push(band.expandByScalar(FIELD_EQUIPMENT_CLEAR));
    }
  }
  return out;
}

/**
 * The bodies of the frame's roof guns (round 5, 2026-10-08; the lane lead after helper B's crew-scale machine-gun floor:
 * "decor loads now touch the grown guns on udes03, type90, type90a, carro45t, leo2a6m, pl01_105 and m46_patton"): every
 * connected piece of a pintle gun, M2 or remote-station fitting (receiver, barrel, cradle, ammunition box, shield), its
 * own box `group`-local and a centimetre proud, which a decor piece's placed box may not enter. The foot disc (collectKeepOut)
 * keeps the mount's base clear; these keep the gun itself out of the stowage, a barrel above a load leaving it be.
 */
const GUN_BODY_FITTINGS: ReadonlySet<string> = new Set(['pintleMG', 'americanM2', 'americanRws', 'openYokeRws']);
/**
 * Decor kept off the guns' bodies: every piece (an M46's roof light stood through its M2's receiver) but the smoke banks,
 * whose sockets are pinned and seated first, and the decor roof gun, whose dedupe against an authored gun is the lane
 * lead's.
 */
const GUN_BODY_EXEMPT: ReadonlySet<string> = new Set(['smoke', 'aamg']);
function collectGunBodies(group: THREE.Group): THREE.Box3[] {
  const out: THREE.Box3[] = [];
  group.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o instanceof THREE.InstancedMesh || !o.geometry?.getAttribute('position')) return;
    if (o.visible === false || (o.name || '').startsWith('rig_decor')) return;
    if (typeof o.userData.fitting !== 'string' || !GUN_BODY_FITTINGS.has(o.userData.fitting)) return;
    const toFrame = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    for (const b of connectedPieceBoxes(o, toFrame)) out.push(b.expandByScalar(0.01));
  });
  return out;
}

/** The first keep-out disc the frame-local box's deck footprint reaches into, or null. */
function keepOutDisc(bb: THREE.Box3, discs: readonly DecorKeepOut[]): DecorKeepOut | null {
  for (const disc of discs) {
    const { x, z, r } = disc;
    const dx = Math.max(bb.min.x - x, 0, x - bb.max.x), dz = Math.max(bb.min.z - z, 0, z - bb.max.z);
    if (dx * dx + dz * dz < r * r) return disc;
  }
  return null;
}

/**
 * Lay a smoke bank's bracket flush on the cheek (round 5, 2026-10-08; the contact receipt: the bracket box stood
 * diagonally through the turret cheek, one end buried, the other 20 cm off it): the bracket becomes a welded wedge,
 * its front face the bank's mounting face and its back face on the cheek plane the station's probe met (`wallP`,
 * `wallN` in the frame), each back corner straight behind its front corner. A wall nearly edge-on to the bank keeps
 * the box. Same twelve triangles; the bank's tubes and sockets do not move.
 */
function wedgeBracket(list: DecorPartList, pos: THREE.Vector3, rot: THREE.Euler, wallP: THREE.Vector3, wallN: THREE.Vector3,
  release: (geometry: THREE.BufferGeometry) => void, castBack?: (front: THREE.Vector3) => THREE.Vector3 | null): void {
  const k = list.findIndex((p) => p.bracket);
  if (k < 0) return;
  const q = new THREE.Quaternion().setFromEuler(rot).invert();
  const p0 = wallP.clone().sub(pos).applyQuaternion(q), n0 = wallN.clone().applyQuaternion(q).normalize();
  if (n0.z < 0.2) return;
  const old = list[k].geo;
  old.computeBoundingBox();
  const b = old.boundingBox!;
  // each back corner where the cheek really is straight behind its front corner (a curved cheek is not its tangent
  // plane over half a metre), else on the tangent plane the station's probe met
  const backs = new Map<string, THREE.Vector3>();
  const corner = (sx: number, sy: number, front: boolean): THREE.Vector3 => {
    const f = new THREE.Vector3(sx > 0 ? b.max.x : b.min.x, sy > 0 ? b.max.y : b.min.y, b.max.z);
    if (front) return f;
    const key = `${sx},${sy}`;
    if (!backs.has(key)) {
      const hit = castBack?.(f) ?? null;
      const t = hit ? f.z - hit.z + 0.002 : f.clone().sub(p0).dot(n0) / n0.z;
      backs.set(key, f.clone().setZ(f.z - THREE.MathUtils.clamp(t, 0.02, 0.4)));
    }
    return backs.get(key)!.clone();
  };
  const box3 = new THREE.BoxGeometry(1, 1, 1);
  const pos3 = box3.getAttribute('position');
  for (let i = 0; i < pos3.count; i++) {
    const v = corner(Math.sign(pos3.getX(i)), Math.sign(pos3.getY(i)), pos3.getZ(i) > 0);
    pos3.setXYZ(i, v.x, v.y, v.z);
  }
  const wedge = box3.toNonIndexed();
  box3.dispose();
  wedge.computeVertexNormals();
  const tone = Number(old.userData.tone) || 0.95;
  list[k].geo = bakeShade(withBoxUV(wedge), tone);
  list[k].geo.userData.tone = tone;
  release(old);   // a station's guard may already have released the list it re-seats
}

/**
 * Cant every smoke tube (and its cap) of a bank about its pivot on the bracket face by `angle` about +Y (round 5): a
 * bank laid along a side wall points its tubes forward on the bracket. The sockets ride the geometry (markSmokeTube).
 */
function skewTubes(list: DecorPartList, angle: number): void {
  if (Math.abs(angle) > 1e-6) {
    const turn = new THREE.Matrix4().makeRotationY(angle), m = new THREE.Matrix4();
    for (const part of list) {
      if (!part.pivot) continue;
      const [x, y, z] = part.pivot;
      m.makeTranslation(x, y, z).multiply(turn).multiply(new THREE.Matrix4().makeTranslation(-x, -y, -z));
      part.geo.applyMatrix4(m);
    }
  }
  if (list.coarse) skewTubes(list.coarse, angle);
}
/** A smoke bank's cheek faces at most this far off the bow (rad; round 5): its row lies flush along it. */
const CHEEK_MAX_ALPHA = 0.85;
/** A side wall facing further round than this (rad, 16 degrees aft of square out) takes a bank only as the last resort. */
const SIDE_MAX_ALPHA = 1.85;
/** A bank's row turns at most this far from the bow (rad): on a wall facing further aft it stands off the wall more. */
const SIDE_ALONG_MAX = 1.47;
/** A bank laid along a side wall turns this far off it toward the bow (rad; round 5)... */
const SIDE_TOE = 0.1;
/** ...and its tubes point at most this far off the bow (rad), canted forward on the bracket where the wall faces
 * further out, by at most SIDE_CANT_MAX (45 degrees: tube clears tube), so the outer tube of a six-tube fan stays
 * inside the 60-degree forward cone (smokeLauncherFleet). */
const SIDE_AIM = 0.7;
const SIDE_CANT_MAX = Math.PI / 4;
/** A seated bank's bracket reaches back to the turret at most this far behind any corner (m; round 5). */
const BRACKET_MAX_DEPTH = 0.2;

/** How dark a load's foot is baked where it meets its support, and over what height the darkening fades (round 4). */
const CONTACT_AO = 0.6;
const CONTACT_BAND_M = 0.06;
/**
 * Contact occlusion baked into a load's own foot (round 4, 2026-10-07; wave 215 on the M60A1: "roof gear has almost no
 * contact shadow"). Decor casts no shadow, and the inset pad (secureLoadParts) only darkens the deck under a piece, so
 * a load's lowest few centimetres darken toward its seat (piece frame: y = 0 is the support): its silhouette meets the
 * deck in a dark line that follows its own outline, never a rectangle. Rack and ledge steel below the foot, and the
 * pad, keep their colours.
 */
function contactShade(list: DecorPartList): void {
  for (const part of list) {
    if (part.role === 'pad') continue;
    const pos = part.geo.getAttribute('position'), col = part.geo.getAttribute('color');
    if (!pos || !col) continue;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.005 || y > CONTACT_BAND_M) continue;
      const t = THREE.MathUtils.smoothstep(Math.max(0, y), 0, CONTACT_BAND_M);
      const f = 1 - CONTACT_AO * (1 - t);
      col.setXYZ(i, col.getX(i) * f, col.getY(i) * f, col.getZ(i) * f);
    }
    col.needsUpdate = true;
  }
}

/**
 * Hard loads a soft load can ride on (round 4 follow-up, 2026-10-07: stackLoad). Crates, chests, cases and coolers, and
 * the racked can pairs (a bag thrown across the cans' handles and the rack's top bar sags onto them); the tool tube,
 * drums and the extinguisher are round.
 */
const STACK_CARRIERS: ReadonlySet<string> = new Set(['cargo:wood-ammo-crate', 'cargo:mechanics-tool-chest',
  'cargo:medical-case', 'cargo:spare-optics-case', 'cargo:insulated-chest-olive', 'cargo:cooler-red',
  'cargo:beer-cooler-blue', 'cargo:ration-case', 'cargo:thermos-crate', 'cargo:fifty-cal-ammo-can', 'rations', 'bin',
  'cargo:twin-can-cradle', 'cargo:nato-fuel-can', 'cargo:blue-water-can']);
/** Flat-lidded cases a case of their own may stand on (round 4 follow-up: stackLoad, rigid on rigid). */
const FLAT_LID_CARRIERS: ReadonlySet<string> = new Set(['cargo:wood-ammo-crate', 'cargo:mechanics-tool-chest',
  'cargo:medical-case', 'cargo:spare-optics-case', 'cargo:insulated-chest-olive', 'cargo:ration-case',
  'cargo:thermos-crate', 'rations', 'bin']);
/** Rigid cases that stand square on a larger flat lid (round 4 follow-up: stackLoad). */
const STACKABLE_CASES: ReadonlySet<string> = new Set(['cargo:wood-ammo-crate', 'cargo:mechanics-tool-chest',
  'cargo:medical-case', 'cargo:spare-optics-case', 'cargo:ration-case', 'cargo:fifty-cal-ammo-can', 'cargo:thermos-crate']);
/** A stack (carrier and load) stands at most this tall over its carrier's foot (m). */
const STACK_MAX_H = 0.85;

/**
 * The path of a tie over a stack (round 4 follow-up): the upper convex hull of the stack's cross-section in the
 * crossing plane (a strap under tension bridges every hollow), sampled by nine rays down onto the stack and five
 * heights in from each side, from a deck ring 15 mm outside the near face to one outside the far face. Returns the
 * path with each point's outward normal (the mean of its hull edges'), or null when the stack does not answer.
 */
function hullTiePath(meshes: THREE.Mesh[], axis: 'x' | 'z', lateral: number, lo: number, hi: number, top: number):
  Array<{ a: number; y: number; na: number; ny: number }> | null {
  const ray = new THREE.Raycaster();
  const at = (along: number, y: number): THREE.Vector3 => (axis === 'z' ? new THREE.Vector3(lateral, y, along)
    : new THREE.Vector3(along, y, lateral));
  const cast = (origin: THREE.Vector3, dir: THREE.Vector3): THREE.Intersection | null => {
    ray.set(origin, dir);
    ray.far = 3;
    return ray.intersectObjects(meshes, false)[0] ?? null;
  };
  const pts: Array<[number, number]> = [];
  const along = (p: THREE.Vector3): number => (axis === 'z' ? p.z : p.x);
  for (let k = 0; k <= 8; k++) {
    const hit = cast(at(lo + ((hi - lo) * k) / 8, top + 0.3), new THREE.Vector3(0, -1, 0));
    if (hit) pts.push([along(hit.point), hit.point.y]);
  }
  for (let k = 0; k < 5; k++) {
    const y = 0.015 + ((top - 0.03) * k) / 4;
    for (const sign of [-1, 1]) {
      const dir = axis === 'z' ? new THREE.Vector3(0, 0, -sign) : new THREE.Vector3(-sign, 0, 0);
      const hit = cast(at(sign < 0 ? lo - 0.3 : hi + 0.3, y), dir);
      if (hit) pts.push([along(hit.point), y]);
    }
  }
  if (pts.length < 8) return null;
  let a0 = Infinity, a1 = -Infinity;
  for (const [a] of pts) { a0 = Math.min(a0, a); a1 = Math.max(a1, a); }
  pts.push([a0 - 0.015, 0.003], [a1 + 0.015, 0.003]);
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  const hull: Array<[number, number]> = [];
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (const p of pts) {
    while (hull.length >= 2 && cross(hull[hull.length - 2], hull[hull.length - 1], p) >= 0) hull.pop();
    hull.push(p);
  }
  if (hull.length < 3) return null;
  const edgeN = (i: number): [number, number] => {
    const [ax, ay] = hull[i], [bx, by] = hull[i + 1];
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  };
  return hull.map(([a, y], i) => {
    const n0 = i > 0 ? edgeN(i - 1) : edgeN(0), n1 = i < hull.length - 1 ? edgeN(i) : edgeN(hull.length - 2);
    const na = n0[0] + n1[0], ny = n0[1] + n1[1], l = Math.hypot(na, ny) || 1;
    return { a, y, na: na / l, ny: ny / l };
  });
}

/** A packed load sits this far off the neighbour it packs against (m; round 4): touching, never interpenetrating. */
const PACK_GAP = 0.012;
/** How far from its slot's own station a load may move to pack against a neighbour (m; round 4). */
const PACK_REACH = 0.6;

/** Lashed cargo rides a little off square and off centre ("shifted in transit"): 2-7 degrees of yaw either way. */
function transitYaw(rng: Rng): number {
  const sign = rng() < 0.5 ? -1 : 1;
  return sign * (0.035 + rng() * 0.085);
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
  const clone = parts.map((p) => ({ mat: p.mat, geo: p.geo.clone(), ...(p.role ? { role: p.role } : {}),
    ...(p.station !== undefined ? { station: p.station } : {}), ...(p.anchor ? { anchor: true } : {}),
    ...(p.tie !== undefined ? { tie: p.tie } : {}), ...(p.bracket ? { bracket: true } : {}),
    ...(p.end !== undefined ? { end: p.end } : {}), ...(p.inner ? { inner: true } : {}),
    ...(p.pivot ? { pivot: p.pivot } : {}) })) as DecorPartList;
  if (parts.meta) clone.meta = { ...parts.meta };
  if (parts.metaCx !== undefined) clone.metaCx = parts.metaCx;
  if (parts.lashAt) clone.lashAt = parts.lashAt.map((st) => ({ ...st }));
  if (parts.coarse) clone.coarse = clonePartList(parts.coarse);
  return clone;
}

/**
 * Kits whose builders author a coarse level (`detail: 0`): fewer segments and no small hardware inside the same
 * envelope. Every other kit's coarse level is a copy of its near geometry, because each material bucket's coarse
 * draw must still carry every piece of that bucket.
 */
const DETAIL_KITS = new Set(['smoke', 'bin', 'tarp', 'camonet', 'log', 'packs', 'cargo', 'basket', 'tools', 'drums',
  'jerry', 'sandbags', 'rations', 'foliage', 'cupola', 'hatch', 'light', 'sight', 'exhaust', 'travelLock', 'aamg']);
/** Working equipment among the decor kits: its draws stay resident at every range (combatVisibility.ts). */
const FUNCTIONAL_KITS = new Set(['smoke']);
/**
 * Camo-painted hard kit (bins, boxes, the smoke banks' own finish) rides the resident group with the working smoke
 * banks: it reads as part of the vehicle, it was resident before the 2026-10-05 retag, and sharing that draw keeps
 * every tank's decor draws at or below the old count (a separate cosmetic 'kit' draw beside the smoke banks' added one
 * per turret). Past 150 m a tank draws this one decor call; every other family drops.
 */
const RESIDENT_FAMILIES: ReadonlySet<DecorMaterialKey> = new Set<DecorMaterialKey>(['kit']);

/**
 * Small flat-colour families folded into a host family's draw (2026-10-05 draw audit: a searchlight's glass or a
 * spare wheel's tyre each opened a draw of its own). The vertex-colour multiplier keeps the colour: optic glass
 * (0x161d23) in the gunmetal steel draw, over the nation's steel colour; tyre rubber (0x232425) in the painted-
 * hardware draw, over the hardware map's ground (#cbc9c1). Linear values.
 */
function decorFamilyFolds(palette: FleetEquipmentPalette): ReadonlyMap<DecorMaterialKey, { to: DecorMaterialKey; k: readonly [number, number, number] }> {
  const steel = new THREE.Color(palette.steel), glass = new THREE.Color(DECOR_GLASS), rubber = new THREE.Color(0x232425);
  const ground = new THREE.Color(0xcbc9c1);
  return new Map<DecorMaterialKey, { to: DecorMaterialKey; k: readonly [number, number, number] }>([
    ['lens', { to: 'steel', k: [glass.r / steel.r, glass.g / steel.g, glass.b / steel.b] }],
    ['rubber', { to: 'cans', k: [rubber.r / ground.r, rubber.g / ground.g, rubber.b / ground.b] }],
  ]);
}

function foldDecorPart(part: DecorPart, folds: ReturnType<typeof decorFamilyFolds>): void {
  const fold = folds.get(part.mat);
  if (!fold) return;
  const color = part.geo.getAttribute('color');
  if (color) {
    for (let i = 0; i < color.count; i++) {
      color.setXYZ(i, color.getX(i) * fold.k[0], color.getY(i) * fold.k[1], color.getZ(i) * fold.k[2]);
    }
    color.needsUpdate = true;
  }
  part.mat = fold.to;
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
    // Round 3 (2026-10-07): every slot draw (yaw, station jitter, transit yaw) comes from a per-row stream seeded by
    // the row's own jitter seed. The main stream then advances exactly two draws per row (its roll and its seed)
    // whatever the seating retries, so no geometry change upstream can flip which optional rows dress a tank
    // (griffinViper's tow cable flipped twice in this round).
    let slotRng: Rng = mulberry32(0x51a7e);
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
    // 2026-10-09 (the netting lane): a hull dressed in a field suit with working clearances (ghillieSuit.ts
    // fieldClearanceM: its meshes carry userData.fieldSuit) holds its net and garnish on the decks the turret's loads
    // swing over; each load hung on the turret clears the suit's top at its radius by 3 cm through the traverse. The
    // suit's top by radius from the turret's axis, turret frame, 5 cm bins (empty without such a suit).
    const hullSuitTop = new Map<number, number>();
    // and its hanging drapes (the net's triangles after its roof and deck carriers, owner frame): a load seated on a
    // wall, a fender or a bustle face under one would sit inside the cloth, so it takes another seat
    const suitDrapes: Record<DecorFrame, THREE.Triangle[]> = { hull: [], turret: [] };
    for (const [frame, group] of [['hull', hullG], ['turret', turretG]] as const) {
      group.updateWorldMatrix(true, true);
      const toFrame = new THREE.Matrix4().copy(group.matrixWorld).invert(), m = new THREE.Matrix4();
      group.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData?.fieldSuit !== true || !/_net$/.test(mesh.name || '')) return;
        const pos = mesh.geometry?.attributes?.position as THREE.BufferAttribute | undefined;
        if (!pos) return;
        m.multiplyMatrices(toFrame, mesh.matrixWorld);
        const top = Number(mesh.userData[GHILLIE_TOP_VERTICES]) || 0;
        for (let i = top - (top % 3); i + 2 < pos.count; i += 3) {
          suitDrapes[frame].push(new THREE.Triangle(
            new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m),
            new THREE.Vector3().fromBufferAttribute(pos, i + 1).applyMatrix4(m),
            new THREE.Vector3().fromBufferAttribute(pos, i + 2).applyMatrix4(m)));
        }
      });
    }
    const triBox = new THREE.Box3();
    const meetsDrape = (frame: DecorFrame, bb: THREE.Box3): boolean => suitDrapes[frame].some((t) => {
      triBox.setFromPoints([t.a, t.b, t.c]);
      return triBox.intersectsBox(bb) && bb.intersectsTriangle(t);
    });
    {
      turretG.updateWorldMatrix(true, false);
      const toTurret = new THREE.Matrix4().copy(turretG.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
      hullG.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData?.fieldSuit !== true || !mesh.geometry?.attributes?.position) return;
        m.multiplyMatrices(toTurret, mesh.matrixWorld);
        const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(m);
          const k = Math.floor(Math.hypot(v.x, v.z) / 0.05);
          hullSuitTop.set(k, Math.max(hullSuitTop.get(k) ?? -Infinity, v.y));
        }
      });
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
        const wheelish = o instanceof THREE.InstancedMesh || isDecorRunningGearName(o.name || '');
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

    // Round 4 (2026-10-07, wave 216 on the PT-91: "a jerrycan rack and a bag tray hang below the rear plate almost at
    // ground level, where the first ditch would tear them off"): stowage hung on the rear plate keeps to its upper two
    // thirds and at least 0.3 m above its lower edge (the hull's bottom at the stern); a load the bore or the deck
    // will not let rise that far goes on to its next station. The plate is the rear-facing face the stern probes meet.
    let rearPlateSpan: { bottom: number; top: number } | null | undefined;
    function rearStowFloor(): number {
      if (rearPlateSpan === undefined) {
        let bottom = Infinity, top = -Infinity;
        for (const xf of [-0.25, 0, 0.25]) {
          for (let y = H * 0.04; y <= rearDeckY + 0.02; y += 0.04) {
            const h = hullP.zface(xf * W, y, 1, sternZ - 1.4);
            if (!h || h.p.z > sternZ + 0.9 || h.n.z > -0.2) continue;
            bottom = Math.min(bottom, h.p.y); top = Math.max(top, h.p.y);
          }
        }
        rearPlateSpan = Number.isFinite(bottom) ? { bottom, top } : null;
      }
      if (!rearPlateSpan) return H * 0.33;
      const { bottom, top } = rearPlateSpan;
      return Math.max(bottom + (top - bottom) / 3, bottom + 0.3);
    }
    /** The lowest any rear fitting (a rack's strut feet) may reach: 0.3 m above the plate's lower edge. */
    function rearFittingFloor(): number {
      rearStowFloor();
      return rearPlateSpan ? rearPlateSpan.bottom + 0.3 : H * 0.33;
    }
    /** A stern probe hit that is the rear plate (near the stern, facing aft), not a face seen through a gap. */
    const isRearPlateHit = (h: SurfaceHit | null): h is SurfaceHit => !!h && h.p.z < sternZ + 0.9 && h.n.z < -0.2;

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
    const familyFolds = decorFamilyFolds(equipmentPaletteForNation(spec.nation || ''));
    // round 5: the tank's issue canvas (linear; tieRgbFor) and its soft loads' fabric rotation (fabricFamily)
    const canvasLinear = new THREE.Color(equipmentPaletteForNation(spec.nation || '').canvas);
    const fabricBase = fnv1a(`fabric:${decorId}`) % FABRIC_FAMILIES.length;
    let fabricCount = 0;
    // the tie-downs' webbing: the nation's issue canvas through the painter's webbing tint (accessoryPainter.strap)
    const webbingRgb: RGB = (() => {
      const c = new THREE.Color(equipmentPaletteForNation(spec.nation || '').canvas);
      return [c.r * 0.5 * 0.8 * 0.62, c.g * 0.56 * 0.78 * 0.62, c.b * 0.44 * 0.7 * 0.62];
    })();
    const summary: DecorSummary = { pieces: [], tris: 0, drawCalls: 0, skipped: [] };
    let basketAnchor: BasketAnchor | null = null; // set by turretRearFrame; used by onBasket packs

    // round 4: whip feet, roof-gun mounts, hatches and cupolas of each frame, and the decor equipment seated so far
    const keepOut: Record<DecorFrame, DecorKeepOut[]> = { hull: collectKeepOut(hullG), turret: collectKeepOut(turretG) };
    // 2026-10-08: the volumes main's field upgrades own (collectFieldEquipment); the side screens ride the turret's record
    const screens = !!(turretG.userData.oplotFieldUpgrade || turretG.userData.leclercFieldProtection);
    const fieldEquipment: Record<DecorFrame, THREE.Box3[]> = {
      hull: collectFieldEquipment(hullG, 'hull', screens), turret: collectFieldEquipment(turretG, 'turret', screens),
    };
    // round 5: the roof guns' own bodies (collectGunBodies), out of every decor piece's placed box (GUN_BODY_EXEMPT aside)
    const gunBodies: Record<DecorFrame, THREE.Box3[]> = { hull: collectGunBodies(hullG), turret: collectGunBodies(turretG) };
    // Round 4 (2026-10-07, wave 214 on the Challenger 1: "each stowage item ... sits alone on spotless roof paint,
    // spaced like display pieces with no piling"; the critic: "crews pack kit ... cluster and compress what is there"):
    // the loads seated so far on each frame (placed boxes), so the next deck load packs against one of them.
    const seatedLoads: Record<DecorFrame, THREE.Box3[]> = { hull: [], turret: [] };
    /**
     * Stations where a load abuts a load already seated on `frame` (round 4): flush against each face of the nearest
     * neighbours within PACK_REACH of the slot's own station (x0, z0), centred on the neighbour's face or flush with
     * either end of it, PACK_GAP off it, nearest first. Each station is a function of the load's yaw, since a yawed
     * footprint is wider; it returns the piece origin.
     */
    function packStations(frame: DecorFrame, parts: DecorPartList, x0: number, z0: number):
      Array<(yaw: number) => [number, number]> {
      const near = seatedLoads[frame]
        .map((n) => ({ n, dist: Math.hypot((n.min.x + n.max.x) / 2 - x0, (n.min.z + n.max.z) / 2 - z0) }))
        .filter((e) => e.dist < PACK_REACH)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);
      const out: Array<{ at: (yaw: number) => [number, number]; dist: number }> = [];
      const origin = new THREE.Vector3();
      for (const { n } of near) {
        const ncx = (n.min.x + n.max.x) / 2, ncz = (n.min.z + n.max.z) / 2;
        for (const [ax, sign] of [['x', -1], ['x', 1], ['z', -1], ['z', 1]] as const) {
          for (const align of [0, -1, 1]) {
            const at = (yaw: number): [number, number] => {
              const e = placedBox(parts, origin, new THREE.Euler(0, yaw, 0));
              if (ax === 'x') {
                const x = sign < 0 ? n.min.x - PACK_GAP - e.max.x : n.max.x + PACK_GAP - e.min.x;
                const z = align === 0 ? ncz - (e.min.z + e.max.z) / 2 : align < 0 ? n.min.z - e.min.z : n.max.z - e.max.z;
                return [x, z];
              }
              const z = sign < 0 ? n.min.z - PACK_GAP - e.max.z : n.max.z + PACK_GAP - e.min.z;
              const x = align === 0 ? ncx - (e.min.x + e.max.x) / 2 : align < 0 ? n.min.x - e.min.x : n.max.x - e.max.x;
              return [x, z];
            };
            const [x, z] = at(0);
            out.push({ at, dist: Math.hypot(x - x0, z - z0) });
          }
        }
      }
      return out.filter((e) => e.dist < PACK_REACH).sort((a, b) => a.dist - b.dist).map((e) => e.at);
    }
    // Round 4 follow-up (2026-10-07): the last commit a keep-out disc turned away (its frame, the disc, the placed box).
    let keepOutMiss: { frame: DecorFrame; disc: DecorKeepOut; bb: THREE.Box3 } | null = null;
    /**
     * Seat a load on `prober` at (x, z) through supportedSeat and commit (round 4 follow-up). A keep-out disc used to
     * cost the load its station outright; it now steps the footprint straight away from the disc it met, 4-40 cm in
     * 3 cm steps to the first spot clear of every disc of its frame, and tries that station once, if `allowed` takes
     * it. Returns true when the load is committed. Load slots pass the solid probers (solidTurretProber,
     * solidHullProber): a ghillie suit's net and garnish are no support, so the load nests into them on the armour.
     */
    function seatLoad(o: {
      name: string; parts: DecorPartList; frame: DecorFrame; prober: SurfaceProber; ledger: THREE.Box3[];
      x: number; z: number; yaw: number; w: number; d: number; fromY: number; spread: number; soft: boolean;
      off: readonly [number, number]; minNy: number; sink: number; seatOpts?: boolean;
      allowed?: (x: number, z: number) => boolean;
    }): boolean {
      let { x, z } = o;
      for (let attempt = 0; attempt < 2; attempt++) {
        const seat = supportedSeat(o.prober, x, z, o.w, o.d, o.fromY, o.spread, o.soft, o.off[0], o.off[1]);
        if (!seat || !seat.n || seat.n.y < o.minNy) return false;
        if (commit(o.name, o.parts, o.frame, V(x, seat.y - o.sink, z), roofMountEuler(seat.n, o.yaw), o.ledger,
          o.seatOpts ? { seatY: seat.y, secure: 'deck' } : { secure: 'deck' })) {
          registerCarrier(o.name, o.frame, o.parts, o.ledger, seat.y - o.sink);
          return true;
        }
        const miss = keepOutMiss;
        if (attempt || !miss || miss.frame !== o.frame) return false;
        const cx = (miss.bb.min.x + miss.bb.max.x) / 2, cz = (miss.bb.min.z + miss.bb.max.z) / 2;
        let ux = cx - miss.disc.x, uz = cz - miss.disc.z;
        const l = Math.hypot(ux, uz);
        if (l < 1e-4) return false;
        ux /= l; uz /= l;
        let step: number | null = null;
        for (let t = 0.04; t <= 0.4; t += 0.03) {
          const moved = miss.bb.clone().translate(new THREE.Vector3(ux * t, 0, uz * t));
          if (!keepOutDisc(moved, keepOut[o.frame])) { step = t; break; }
        }
        if (step === null) return false;
        x += ux * step; z += uz * step;
        if (o.allowed && !o.allowed(x, z)) return false;
      }
      return false;
    }
    // Round 4 follow-up (2026-10-07): hard loads seated on a deck whose lid a soft load can ride (STACK_CARRIERS):
    // their frame, their ledger box and their placed near geometry (for the stacked load's seat and its tie).
    const carriers: Array<{ frame: DecorFrame; box: THREE.Box3; lid: THREE.Box3; footY: number; meshes: THREE.Mesh[];
      used: boolean; flat: boolean }> = [];
    const carrierMat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    /**
     * `footY`: the frame height of the carrier's own foot (its deck, or its rack's slats); `lid`: the load's own placed
     * box (a rack's frame is not lid), defaulting to its ledger box.
     */
    function registerCarrier(name: string, frame: DecorFrame, parts: DecorPartList, ledger: THREE.Box3[], footY: number,
      lid?: THREE.Box3): void {
      if (!STACK_CARRIERS.has(name) || !ledger.length) return;
      const meshes = parts.filter((p) => p.role !== 'pad').map((p) => new THREE.Mesh(p.geo, carrierMat));
      const box = ledger[ledger.length - 1];
      carriers.push({ frame, box, lid: lid ?? box, footY, meshes, used: false, flat: FLAT_LID_CARRIERS.has(name) });
    }
    /**
     * Stack a soft load on a hard one (round 4 follow-up, 2026-10-07; the critics on the Challenger 1: "cluster and
     * compress what is there", and the fleet lost loads to crowded decks): when every route of a soft load is taken,
     * it rides the lid of a crate or case already seated on a deck, under one tie over both. Its 3 x 3 footprint grid
     * must land on the carrier, sag at most SOFT_SPREAD_M, and the stack stays under STACK_MAX_H; it then commits
     * with every guard, keep-out and the overlap ledger (less the carrier's own box). One load per carrier.
     */
    function stackLoad(parts: DecorPartList, name: string): boolean {
      const bb = partsBBox(parts);
      const h = bb.max.y - Math.max(0, bb.min.y);
      // a soft load sags onto any carrier; a case stands square on a flat lid at least its own size
      const rigid = !sagsOnSupport(name);
      for (const c of carriers) {
        if (c.used || (rigid && !c.flat)) continue;
        const cw = c.lid.max.x - c.lid.min.x, cd = c.lid.max.z - c.lid.min.z;
        const ccx = (c.lid.min.x + c.lid.max.x) / 2, ccz = (c.lid.min.z + c.lid.max.z) / 2;
        for (const turn of [0, Math.PI / 2]) {
          const yaw = turn + transitYaw(slotRng) * 0.3;
          const e = placedBox(parts, new THREE.Vector3(), new THREE.Euler(0, yaw, 0));
          const w = e.max.x - e.min.x, d = e.max.z - e.min.z;
          // a soft load may overhang its carrier's lid by a seventh a side (its outer foot points still land on the lid:
          // the bag keeps its shape, so a longer overhang hangs in the air); a case stands within the lid
          if (w > cw * (rigid ? 1.04 : 1.28) || d > cd * (rigid ? 1.04 : 1.28)) continue;
          const x = ccx - (e.min.x + e.max.x) / 2, z = ccz - (e.min.z + e.max.z) / 2;
          // the lid under the middle of the load's footprint: 3 x 3 rays onto the carrier (its ties included)
          const ray = new THREE.Raycaster();
          const ys: number[] = [];
          for (const fx of [-0.28, 0, 0.28]) for (const fz of [-0.28, 0, 0.28]) {
            ray.set(new THREE.Vector3(ccx + fx * Math.min(w, cw), c.box.max.y + 0.3, ccz + fz * Math.min(d, cd)), new THREE.Vector3(0, -1, 0));
            ray.far = 1;
            const hit = ray.intersectObjects(c.meshes, false)[0];
            if (hit) ys.push(hit.point.y);
          }
          if (ys.length < 9) continue;
          const hi = Math.max(...ys), residual = hi - Math.min(...ys);
          if (residual > (rigid ? RIGID_SPREAD_M : SOFT_SPREAD_M)) continue;
          const y = rigid ? hi : hi - Math.min(residual, SOFT_SAG_M) * 0.7;
          if (y + h - c.footY > STACK_MAX_H) continue;
          const pos = V(x, y - 0.004, z), rot = E(0, yaw, 0);
          const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
          // one tie over the load and down the carrier's faces to the deck, across the stack's shorter span
          const placed = parts.filter((p) => p.role !== 'pad').map((p) => {
            const mesh = new THREE.Mesh(p.geo.clone().applyMatrix4(m), carrierMat);
            return mesh;
          });
          const meshes = [...c.meshes, ...placed];
          const alongX = cw >= cd;
          const footY = c.footY;
          const shift = new THREE.Matrix4().makeTranslation(0, -footY, 0);
          for (const mesh of meshes) mesh.geometry = mesh.geometry.clone().applyMatrix4(shift);
          const path = hullTiePath(meshes, alongX ? 'z' : 'x', alongX ? ccx : ccz, alongX ? c.lid.min.z : c.lid.min.x,
            alongX ? c.lid.max.z : c.lid.max.x, y + h - footY);
          for (const mesh of meshes) mesh.geometry.dispose();
          for (const mesh of placed) mesh.geometry.dispose();
          if (!path) continue;
          const tie = withBoxUV(tieBand(path, alongX ? 'z' : 'x', alongX ? ccx : ccz, 0.038))
            .applyMatrix4(new THREE.Matrix4().makeTranslation(0, footY, 0))
            .applyMatrix4(m.clone().invert());
          const candidate = clonePartList(parts);
          // no contact pad on a lid: the load may overhang it, where a dark quad would hang in the air
          for (const list of [candidate, candidate.coarse ?? []]) {
            for (let i = list.length - 1; i >= 0; i--) if (list[i].role === 'pad') { list[i].geo.dispose(); list.splice(i, 1); }
          }
          candidate.push({ mat: 'cans', geo: bakeTint(tie, webbingRgb[0], webbingRgb[1], webbingRgb[2], 0.25) });
          candidate.meta = { ...(candidate.meta ?? {}), stackedOn: [c.lid.min.x, c.lid.max.x, c.lid.min.z, c.lid.max.z, hi] };
          const ledger = c.frame === 'hull' ? placedHull : placedTurret;
          const at = ledger.indexOf(c.box);
          if (at >= 0) ledger.splice(at, 1);
          const ok = commit(name, candidate, c.frame, pos, rot, ledger);
          if (at >= 0) ledger.splice(at, 0, c.box);
          if (ok) { c.used = true; disposePartList(parts); return true; }
        }
      }
      return false;
    }
    const keepClear = KEEP_CLEAR_HULL[spec.id] ?? [];
    function keepClearHit(bb: THREE.Box3, frame: DecorFrame): boolean {
      if (!keepClear.length) return false;
      const ox = frame === 'turret' ? turretG.position.x : 0, oz = frame === 'turret' ? turretG.position.z : 0;
      for (const [x, z, r] of keepClear) {
        const cx = x - ox, cz = z - oz;
        const dx = Math.max(bb.min.x - cx, 0, cx - bb.max.x), dz = Math.max(bb.min.z - cz, 0, cz - bb.max.z);
        if (dx * dx + dz * dz < r * r) return true;
      }
      return false;
    }

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
      // round 5: the bore and the turret's skirt pass over a load's lashings, which lie flat on the deck beside it
      if (!gunGuardOK(placedPartBoxes(parts.filter((p) => p.role !== 'lash'), pos, rot), seatY)) {
        const reason = `gun@${gunGuardOK.lastYaw ?? 'cone'}`;
        gunGuardOK.lastYaw = null;
        return rejectCommit(name, parts, reason);
      }
      if (!sweepGuardOK(bb)) return rejectCommit(name, parts, 'sweep');
      // a gameplay fitting (the smoke banks) is always seated: the field suit gives way to it instead (ghillieDrape.ts)
      if (!FUNCTIONAL_KITS.has(name) && meetsDrape('hull', bb)) return rejectCommit(name, parts, 'suit-drape');
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
      if (hullSuitTop.size && !FUNCTIONAL_KITS.has(name)) {
        // the piece's horizontal reach from the axis: its box's nearest approach to its farthest corner
        const rMin = Math.hypot(Math.max(0, bb.min.x, -bb.max.x), Math.max(0, bb.min.z, -bb.max.z));
        let under = -Infinity;
        for (let k = Math.floor(rMin / 0.05) - 1; k <= Math.floor(rMax / 0.05) + 1; k++) under = Math.max(under, hullSuitTop.get(k) ?? -Infinity);
        if (bb.min.y < under + 0.03) return rejectCommit(name, parts, 'hull-suit');
      }
      if (!FUNCTIONAL_KITS.has(name) && meetsDrape('turret', bb)) return rejectCommit(name, parts, 'suit-drape');
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

    /**
     * Round 5: which deck ring anchors each lashing end, and the lashings that have none: a ring needs the frame's
     * surface within RING_REACH_M of its foot, probed straight down (a ring past a deck's edge or over a grille well
     * has none). An end takes its outer ring where it has support, else the inner one under the load's edge; a
     * lashing with an end that has neither gives way to the strap it would replace.
     */
    function tieRings(parts: DecorPartList, frame: DecorFrame, pos: THREE.Vector3, rot: THREE.Euler): TieRings {
      const unsupported = new Set<number>(), inner = new Set<string>();
      const byTie = new Map<number, DecorPart[]>();
      for (const p of parts) {
        if (!p.anchor || p.tie === undefined) continue;
        if (!byTie.has(p.tie)) byTie.set(p.tie, []);
        byTie.get(p.tie)!.push(p);
      }
      if (!byTie.size) return { unsupported, inner };
      const prober = frame === 'hull' ? solidHullProber() : solidTurretProber();
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
      const c = new THREE.Vector3();
      const held = (ring: DecorPart): boolean => {
        ring.geo.computeBoundingBox();
        ring.geo.boundingBox!.getCenter(c);
        c.y = 0;
        c.applyMatrix4(m);
        const hit = prober.top(c.x, c.z, c.y + 0.12);
        return !!hit && Math.abs(hit.p.y - c.y) <= RING_REACH_M;
      };
      for (const [tie, rings] of byTie) {
        if (rings.some((r) => r.end === undefined)) {          // a box tie's rings: every one must hold
          if (!rings.every(held)) unsupported.add(tie);
          continue;
        }
        for (const end of [0, 1] as const) {
          const outer = rings.filter((r) => r.end === end && !r.inner), alt = rings.filter((r) => r.end === end && r.inner);
          if (outer.length && outer.every(held)) continue;
          if (alt.length && alt.every(held)) { inner.add(`${tie}:${end}`); continue; }
          unsupported.add(tie);
          break;
        }
      }
      return { unsupported, inner };
    }

    /** Commit one built kit at pos/rot under hull|turret. */
    function commit(
      name: string,
      parts: DecorPartList,
      frame: DecorFrame,
      pos: THREE.Vector3,
      rot: THREE.Euler,
      ledger: THREE.Box3[],
      { allowOverlap = false, seatY = null, zExtra = 0, attachment, secure }: CommitOptions = {},
    ): boolean {
      keepOutMiss = null;
      // round 5: a load on a deck or rack keeps its lashings, anywhere else the straps they replace; on a deck, each
      // lashing only where both its deck rings have the deck under them (a ring past a roof's edge would hang in air)
      const rings = secure === 'deck' ? tieRings(parts, frame, pos, rot) : NO_TIE_RINGS;
      let tris = 0;
      for (const p of parts) if (tieKept(p, !!secure, rings)) tris += triCount(p.geo);
      if (budget.tris + tris > budget.max) return rejectCommit(name, parts, 'budget');
      if (parts.meta?.drape) {
        conformDrape(parts, frame, pos, rot);
        if (parts.coarse) conformDrape(parts.coarse, frame, pos, rot);
      }
      const bb = placedBox(parts, pos, rot);
      // Turret-frame reach can exceed the hull width only within the bounded
      // authored bustle envelope; hull-frame pieces retain the width, gun,
      // and turret-sweep guards.
      const guarded = frame === 'hull'
        ? guardHullCommit(name, parts, bb, pos, rot, seatY, zExtra)
        : guardTurretCommit(name, parts, bb);
      if (!guarded) return false;
      if (keepClearHit(bb, frame)) return rejectCommit(name, parts, 'keep-clear');
      if (fieldEquipment[frame].some((box) => box.intersectsBox(bb))) return rejectCommit(name, parts, 'field-equipment');
      const disc = isLoadPiece(name) ? keepOutDisc(bb, keepOut[frame]) : null;
      if (disc) { keepOutMiss = { frame, disc, bb }; return rejectCommit(name, parts, 'keep-out'); }
      if (!GUN_BODY_EXEMPT.has(name) && gunBodies[frame].some((box) => box.intersectsBox(bb))) return rejectCommit(name, parts, 'gun-body');
      if (!allowOverlap && overlaps(bb, ledger)) {
        return rejectCommit(name, parts, 'overlap');
      }
      pruneTies(parts, !!secure, rings, resources.releaseGeometry);
      pruneTies(parts.coarse, !!secure, rings, resources.releaseGeometry);
      const receipt = attachment ? attachmentReceipt(parts, pos, rot, attachment) : null;
      ledger.push(bb);
      budget.tris += tris;
      if (isLoadPiece(name)) {
        seatedLoads[frame].push(bb.clone());
        // round 4: the contact line darkened into the load's own foot (contactShade), both levels
        if (!parts.meta?.drape) { contactShade(parts); if (parts.coarse) contactShade(parts.coarse); }
        // round 5: on a deck, the pad, the lashings' deck runs and a soft load's base lie on the support under them
        if (secure === 'deck' && !parts.meta?.drape) {
          settleFoot(parts.coarse ? [parts, parts.coarse] : [parts], frame === 'hull' ? solidHullProber() : solidTurretProber(),
            pos, rot, sagsOnSupport(name));
        }
      }
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
      const functional = FUNCTIONAL_KITS.has(name);
      for (const p of [...parts, ...(parts.coarse ?? [])]) { delete p.geo.userData.drapeRelief; delete p.geo.userData.drapeRest; }
      for (const p of parts) {
        foldDecorPart(p, familyFolds);
        p.geo.applyMatrix4(m);
        const map = (functional || RESIDENT_FAMILIES.has(p.mat) ? functionalBuckets : buckets)[frame];
        if (!map.has(p.mat)) map.set(p.mat, []);
        map.get(p.mat)!.push(p.geo);
        resources.ownGeometry(p.geo);
      }
      if (parts.coarse) {
        // The resident group keeps its near forms at every range; a cosmetic family's coarse copy is
        // seated with exactly the near copy's matrix.
        const coarseMap = coarseBuckets[frame];
        for (const p of parts.coarse) {
          foldDecorPart(p, familyFolds);
          if (functional || RESIDENT_FAMILIES.has(p.mat)) { resources.releaseGeometry(p.geo); continue; }
          p.geo.applyMatrix4(m);
          if (!coarseMap.has(p.mat)) coarseMap.set(p.mat, []);
          coarseMap.get(p.mat)!.push(p.geo);
          resources.ownGeometry(p.geo);
        }
        delete parts.coarse;
      }
      const piece: DecorPieceSummary = { kit: name, frame, tris };
      if (receipt) piece.attachment = receipt;
      summary.pieces.push(piece);
      // round 4: a whip, roof gun, hatch or cupola seated by the decor keeps its foot clear of the loads after it
      if (KEEP_OUT_DECOR[name]) keepOut[frame].push({ x: pos.x, z: pos.z, r: KEEP_OUT_DECOR[name] });
      return true;
    }

    /**
     * Lay a draped net on the surface under it (round 4, 2026-10-07; wave 213: nets "sit proud of the hull with
     * dead-straight hems"): every vertex carrying a relief (accessoryKits buildNetDrape) goes to the frame's surface
     * straight below it plus that relief, so the sheet follows the deck, rides over what stands on it and its hem lies
     * on the armour; where nothing answers below (past a deck edge) it hangs 8 cm under the seat. Normals are then
     * averaged across the sheet's shared corners. The commit drops the sheet's relief data once it is seated.
     */
    function conformDrape(list: DecorPartList, frame: DecorFrame, pos: THREE.Vector3, rot: THREE.Euler): void {
      const prober = frame === 'hull' ? hullP : turP;
      const fromY = frame === 'hull' ? topFrom : 3.5;
      const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, 1, 1));
      const inv = m.clone().invert();
      const v = new THREE.Vector3();
      for (const part of list) {
        const relief = part.geo.userData.drapeRelief as ArrayLike<number> | undefined;
        if (!relief) continue;
        const attr = part.geo.getAttribute('position');
        // a slot may try several seats with one piece: every try starts from the sheet as built
        let rest = part.geo.userData.drapeRest as number[] | undefined;
        if (!rest) { rest = Array.from(attr.array as ArrayLike<number>); part.geo.userData.drapeRest = rest; }
        const below = new Map<string, number | null>();
        for (let i = 0; i < attr.count; i++) {
          v.set(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2]).applyMatrix4(m);
          const key = `${Math.round(v.x * 2000)},${Math.round(v.z * 2000)}`;
          let y = below.get(key);
          if (y === undefined) {
            const hit = prober.top(v.x, v.z, fromY);
            y = hit ? hit.p.y : null;
            below.set(key, y);
          }
          const support = y === null ? pos.y - 0.08 : THREE.MathUtils.clamp(y, pos.y - 0.25, pos.y + 0.4);
          v.y = support + (relief[i] ?? 0);
          v.applyMatrix4(inv);
          attr.setXYZ(i, v.x, v.y, v.z);
        }
        attr.needsUpdate = true;
        // smooth shading across the sheet: average the face normals of the triangles meeting at each corner
        part.geo.computeVertexNormals();
        const nor = part.geo.getAttribute('normal');
        const sum = new Map<string, THREE.Vector3>();
        const keyOf = (i: number) => `${attr.getX(i).toFixed(4)},${attr.getY(i).toFixed(4)},${attr.getZ(i).toFixed(4)}`;
        for (let i = 0; i < attr.count; i++) {
          const k = keyOf(i);
          const acc = sum.get(k) ?? new THREE.Vector3();
          acc.x += nor.getX(i); acc.y += nor.getY(i); acc.z += nor.getZ(i);
          sum.set(k, acc);
        }
        for (let i = 0; i < attr.count; i++) {
          const n = sum.get(keyOf(i))!.clone().normalize();
          nor.setXYZ(i, n.x, n.y, n.z);
        }
        nor.needsUpdate = true;
      }
    }

    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const E = (rx = 0, ry = 0, rz = 0) => new THREE.Euler(rx, ry, rz);

    /**
     * Round 5: a caster for a turret-frame piece at pos/rot that finds the turret's own surface straight behind a
     * piece-local point (along the piece's -z), returned in the piece frame (wedgeBracket).
     */
    function cheekCaster(pos: THREE.Vector3, rot: THREE.Euler): (front: THREE.Vector3) => THREE.Vector3 | null {
      const ray = new THREE.Raycaster();
      const q = new THREE.Quaternion().setFromEuler(rot), qi = q.clone().invert();
      turretG.updateWorldMatrix(true, false);
      const toWorld = turretG.matrixWorld, fromWorld = toWorld.clone().invert();
      const back = new THREE.Vector3(0, 0, -1).applyQuaternion(q).transformDirection(toWorld);
      return (front) => {
        const o = front.clone().applyQuaternion(q).add(pos).applyMatrix4(toWorld);
        ray.set(o, back);
        ray.far = 0.5;
        const hit = ray.intersectObjects(turretTargets, false)[0];
        return hit ? hit.point.clone().applyMatrix4(fromWorld).sub(pos).applyQuaternion(qi) : null;
      };
    }

    /**
     * Round 5 (2026-10-08; the contact receipt: a side-hung water-can rack cut 21 cm into the Leclerc's side bins, and a
     * census found every turret-side load's back 15-30 cm inside the turret's outer surface, the ledge built from a
     * wall plane at the probe's height): how far a turret-side load at pos/rot (its local +z out of the wall, toward
     * `side`) must move out so its back clears the turret's outermost solid surface behind it (armour, a bin, an ERA
     * brick, a cloth cover; not a suit's net), probed straight in from the side over its back face; null past
     * SIDE_PUSH_MAX_M, where something stands out further than a ledge reaches past.
     */
    function sideClearance(bb: THREE.Box3, pos: THREE.Vector3, rot: THREE.Euler, side: number): number | null {
      const prober = solidTurretProber();
      const q = new THREE.Quaternion().setFromEuler(rot), qi = q.clone().invert();
      const p = new THREE.Vector3();
      let need = 0;
      for (let i = 0; i < 5; i++) {
        for (const fy of [0.1, 0.5, 0.9]) {
          p.set(bb.min.x + 0.03 + (bb.max.x - bb.min.x - 0.06) * (i / 4), bb.min.y + (bb.max.y - bb.min.y) * fy, bb.min.z)
            .applyQuaternion(q).add(pos);
          const hit = prober.side(p.y, p.z, side, W / 2 + 1);
          if (!hit) continue;
          const z = hit.p.clone().sub(pos).applyQuaternion(qi).z;
          need = Math.max(need, z - bb.min.z + SIDE_CLEAR_M);
        }
      }
      return need > SIDE_PUSH_MAX_M ? null : need;
    }

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
        // Round 4 follow-up (2026-10-07: keep-out, the rear-plate floor and the retired spools and chairs cost the fleet
        // 116 of its 1,375 loads): a load whose authored routes are all taken tries the same stations on the other
        // side of the vehicle (side, corner and x mirrored) before it is dropped.
        const routes = args.routes || [];
        const mirrored = routes.flatMap(([slotName, slotArgs]): Array<[string, DecorSlotArgs]> => {
          // hullRoof stations are measured points (the Strv 103's Gallery markup), never mirrored
          if (slotName === 'hullRoof') return [];
          if (slotArgs.side === undefined && slotArgs.corner === undefined && slotArgs.x === undefined) return [];
          const m: DecorSlotArgs = { ...slotArgs };
          if (m.side !== undefined) m.side = -m.side;
          if (m.corner !== undefined) m.corner = -m.corner;
          if (m.x !== undefined) m.x = -m.x;
          return [[slotName, m]];
        });
        for (const [slotName, slotArgs] of [...routes, ...(isLoadPiece(name) ? mirrored : [])]) {
          const slot = SLOTS[slotName];
          if (!slot || slot === SLOTS.fleetCargo) continue;
          const candidate = clonePartList(parts);
          if (slot(slotArgs, candidate, name)) {
            disposePartList(parts);
            return true;
          }
        }
        // round 4 follow-up: a soft load or a case with no free deck rides a crate or case already seated (stackLoad)
        if ((sagsOnSupport(name) || STACKABLE_CASES.has(name)) && stackLoad(parts, name)) return true;
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
        if (isLoadPiece(name)) {
          // Round 3: loads on the deck take a supported seat (see supportedSeat); the louvre grilles and hatch rims
          // that used to hold one corner up now send the piece on to a flat stretch of deck.
          const soft = sagsOnSupport(name);
          const inward = -Math.sign(xs || 1);
          // round 4: pack against a load already on the deck first (packStations), square to it
          const deckLoad = (px: number, pz: number, yaw: number): boolean => seatLoad({ name, parts, frame: 'hull',
            prober: solidHullProber(), ledger: placedHull, x: px, z: pz, yaw, w, d, fromY: topFrom, spread: 0.28, soft,
            off: [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2], minNy: casemate ? 0.8 : LOAD_MIN_NY, sink: 0.01,
            seatOpts: true });
          for (const station of packStations('hull', parts, xs, z0)) {
            const yaw = transitYaw(slotRng) * 0.4;
            const [px, pz] = station(yaw);
            if (deckLoad(px, pz, yaw)) return true;
          }
          for (const dz of [0, -0.25, 0.28, -0.5, 0.14, -0.38]) {
            for (const dx of [0, inward * 0.16, inward * 0.32]) {
              const yaw = transitYaw(slotRng) + (args.spread ? (slotRng() - 0.5) * 0.8 : 0);
              const px = xs + dx + (slotRng() - 0.5) * 0.05, pz = z0 + dz + (slotRng() - 0.5) * 0.05;
              if (deckLoad(px, pz, yaw)) return true;
            }
          }
          disposePartList(parts);
          return false;
        }
        for (const dz of [0, -0.25, 0.28, -0.5]) {
          const seat = seatProbe(hullP, xs, z0 + dz, w, d, topFrom, 0.28);
          if (!seat) continue;
          const yaw = (slotRng() - 0.5) * 0.16 + (args.spread ? (slotRng() - 0.5) * 0.8 : 0);
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
        // round 4: the roof itself, under any suit net (the load nests into the garnish instead of riding on it)
        const solid = solidHullProber();
        const seat = seatProbe(solid, x, z, w, d, topFrom, 0.08);
        const hit = solid.top(x, z, topFrom);
        if (!seat || !hit || !seat.n || hit.n.y < 0.92) {
          disposePartList(parts);
          return false;
        }
        const embedM = 0.004;
        const yaw = (slotRng() - 0.5) * 0.04;
        return commit(name, parts, 'hull', roofMountPosition(parts, hit, embedM),
          roofMountEuler(hit.n, yaw), placedHull, {
            seatY: seat.y,
            secure: isLoadPiece(name) ? 'deck' : undefined,
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
        // Round 4 (2026-10-07): a branch mat on a hull whose fenders never answer or are cluttered end to end (the
        // T-90M's and PT-91M's fender boxes) lies across the rear deck's corner on that side instead of being dropped
        if (fx === null && name === 'foliage') return SLOTS.rearDeck!({ corner: side }, parts, name);
        if (fx === null) { disposePartList(parts); return false; }
        const bb = partsBBox(parts);
        // auto-orient: the LONG axis always runs fore-aft along the fender
        const rot90 = (bb.max.x - bb.min.x) > (bb.max.z - bb.min.z) * 1.15;
        const w = rot90 ? bb.max.z - bb.min.z : bb.max.x - bb.min.x;   // across
        const d = rot90 ? bb.max.x - bb.min.x : bb.max.z - bb.min.z;   // along
        const z = (args.zFrac ?? 0) * L;
        if (isLoadPiece(name)) {
          // Round 3: a load on the fender takes a supported seat (see supportedSeat), stepping along the run.
          const soft = sagsOnSupport(name);
          for (const dz of [0, 0.18, -0.18, 0.36, -0.36]) {
            const yaw = (rot90 ? Math.PI / 2 : 0) + transitYaw(slotRng);
            const pz = z + dz + (slotRng() - 0.5) * 0.04;
            if (seatLoad({ name, parts, frame: 'hull', prober: solidHullProber(), ledger: placedHull, x: side * fx, z: pz, yaw, w, d,
              fromY: topFrom, spread: 0.26, soft, off: [0, 0], minNy: LOAD_MIN_NY, sink: 0.01, seatOpts: true })) return true;
          }
          disposePartList(parts);
          return false;
        }
        // Round 4 (2026-10-07): a branch mat walks the fender run until it finds a plate to lie on (the T-90M and
        // PT-91M fenders answer only aft of the bow ERA); every other piece keeps its single station.
        for (const dz of name === 'foliage' ? [0, -0.25, 0.25, -0.5, 0.5] : [0]) {
          // a mat is flexible: its seat is read over the fender's own width, not the leaves' spread
          const seat = seatProbe(hullP, side * fx, z + dz, Math.min(w, name === 'foliage' ? 0.18 : 0.34), Math.min(d, 0.4), topFrom, 0.26);
          if (!seat) continue;
          const yaw = (rot90 ? Math.PI / 2 : 0) + (slotRng() - 0.5) * 0.08;
          if (commit(name, parts, 'hull', V(side * fx, seat.y - 0.012, z + dz), E(0, yaw, 0), placedHull, { seatY: seat.y })) return true;
        }
        if (name === 'foliage') return SLOTS.rearDeck!({ corner: side }, parts, name);
        disposePartList(parts);
        return false;
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
        // spare cable) — the bore never reaches this low forward. Round 5 (2026-10-08; the contact receipt: on the
        // raked, curved bows of the Leopard 2, Leclerc and T-72 the clamps stood through the plate): only across a
        // near-vertical bow plate, flat to 1.2 cm over the run (the Tiger's driver plate it was written for).
        {
          const y = H * 0.42;
          const h = hullP.zface(0, y, -1, L / 2 + 1.6);
          const span = partsBBox(parts).max.x * 0.62;
          const flat = !!h && Math.abs(h.n.y) < 0.2 && [-span, span].every((x) => {
            const e = hullP.zface(x, y, -1, L / 2 + 1.6);
            return !!e && Math.abs(e.p.z - h.p.z) < 0.012;
          });
          if (h && h.n.z > 0.3 && flat) {
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
        // round 4: the load stays on the plate's upper two thirds and the rack's strut feet 0.3 m above its lower edge
        // (the struts shorten to fit, never below 0.1 m); a rack the bore holds lower is not built and the load goes
        // on to its next station
        if (y < rearStowFloor()) { disposePartList(parts); return false; }
        const px = (args.x || 0) * W;
        const h = hullP.zface(px, Math.max(H * 0.3, y + ph * 0.4), 1, sternZ - 1.4);
        if (!isRearPlateHit(h)) { disposePartList(parts); return false; }
        // Round 3: the load rides a built cantilever rack (rearRackParts) instead of hanging in air behind the plate;
        // the rack replaces the contact pad, and it rides a few degrees off square on its slats.
        // Round 4 follow-up (2026-10-07, wave 240: "rack struts ending in mid-air on the Russian tanks' rears"; the
        // T-72B3M's and T-90A's racks stood 14-48 cm off their plates at the rail and 52-62 cm at the struts' feet,
        // where the plates fall back under the overhang): the load sits clear of the plate wherever it reaches over
        // its own height; each side rail runs to the plate at the rail's height; each strut takes the highest foot (its
        // authored reach down to 0.1 m, never under the fitting floor) that meets the plate within 35 cm of its rail's
        // end, or the side carries a bolted bracket instead. Where the plate steps (a box or drum mount on one side), the
        // deeper side's rail runs on past the cross rail to the plate. A rack whose rails find no plate is not built and
        // the load goes on to its next station.
        const gap = 0.02;
        let plateOut = h.p.z;
        for (const fy of [0.05, 0.5, 0.95]) {
          const hit = hullP.zface(px, y + ph * fy, 1, sternZ - 1.4);
          if (isRearPlateHit(hit) && hit.p.z < plateOut && hit.p.z > h.p.z - 0.25) plateOut = hit.p.z;
        }
        const pieceZ = plateOut - gap - bb.max.z;
        const lxs = [bb.min.x - 0.025, bb.max.x + 0.025];
        const railN: Array<THREE.Vector3 | null> = [null, null];
        const railZ = lxs.map((lx, i) => {
          const hit = hullP.zface(px + lx, y - 0.015, 1, sternZ - 1.4);
          if (!isRearPlateHit(hit) || hit.p.z < plateOut - 0.02 || hit.p.z > plateOut + 0.45) return null;
          railN[i] = hit.n.clone();
          return hit.p.z - pieceZ;
        });
        if (railZ[0] === null || railZ[1] === null) { disposePartList(parts); return false; }
        const rails: [number, number] = [railZ[0], railZ[1]];
        // round 5: each foot keeps the plate's own normal where it was found (a sloped plate tilts its foot)
        const struts = lxs.map((lx, i) => {
          for (let b = rearRackBrace(bb); b >= 0.1 - 1e-6; b -= 0.03) {
            if (y - b - REAR_RACK_FOOT < rearFittingFloor()) continue;
            const hit = hullP.zface(px + lx, y - b, 1, sternZ - 1.4);
            if (!isRearPlateHit(hit)) continue;
            const z = hit.p.z - pieceZ;
            if (z >= rails[i] - 0.05 && z <= rails[i] + 0.35) return { b, z, n: hit.n.clone() };
          }
          return null;
        });
        const yaw = transitYaw(slotRng) * 0.5;
        const pivotX = (bb.min.x + bb.max.x) / 2, pivotZ = (bb.min.z + bb.max.z) / 2;
        const about = new THREE.Matrix4().makeTranslation(pivotX, 0, pivotZ)
          .multiply(new THREE.Matrix4().makeRotationY(yaw))
          .multiply(new THREE.Matrix4().makeTranslation(-pivotX, 0, -pivotZ));
        const carry = (list: DecorPartList, detail: 0 | 1) => {
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].role === 'pad') { list[i].geo.dispose(); list.splice(i, 1); }
          }
          for (const part of list) part.geo.applyMatrix4(about);
          list.push(...rearRackParts(bb, rails, detail, struts, railN));
        };
        carry(parts, 1);
        if (parts.coarse) carry(parts.coarse, 0);
        if (!commit(name, parts, 'hull', V(px, y, pieceZ), E(), placedHull, { seatY: y, zExtra: 0.35, secure: 'rack' })) return false;
        // round 4 follow-up: a case on the rack can carry a soft load too (stackLoad); its lid is the load's own box
        registerCarrier(name, 'hull', parts, placedHull, y, bb.clone().translate(new THREE.Vector3(px, y, pieceZ)));
        return true;
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
        const axisTop = Math.min(rearDeckY - 0.04, boreYAt(Math.abs(sternZ - pivot[2])) - boreR - (meta.clearY || 0.28) - 0.06);
        let axisY = Math.max(H * 0.34 + cY, axisTop);
        // round 4: the drums' lowest point stays on the plate's upper two thirds (rearStowFloor)
        const lowest = partsBBox(parts).min.y - cY;
        if (axisY + lowest < rearStowFloor()) {
          axisY = rearStowFloor() - lowest;
          if (axisY > Math.max(axisTop, H * 0.34 + cY) + 1e-6) { disposePartList(parts); return false; }
        }
        const h = hullP.zface(0, axisY, 1, sternZ - 1.4);
        if (!isRearPlateHit(h)) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, axisY - cY, h.p.z - (meta.clearY || 0.28) - 0.04), E(), placedHull,
          { seatY: axisY - cY, zExtra: 0.4 });
      },
      hullRearLow(_args, parts, name) {
        // round 4: raised to the plate's upper two thirds when its old station hangs it lower (rearStowFloor), never
        // up past the deck's edge
        const bbLow = partsBBox(parts);
        const y = Math.max(H * 0.33, rearDeckY * 0.62, rearStowFloor() - bbLow.min.y);
        if (y + bbLow.max.y > rearDeckY + 0.02) { disposePartList(parts); return false; }
        const h = hullP.zface(0, y, 1, sternZ - 1.4);
        if (!isRearPlateHit(h)) { disposePartList(parts); return false; }
        return commit(name, parts, 'hull', V(0, y, h.p.z - 0.16), E(0, 0, (slotRng() - 0.5) * 0.04), placedHull,
          { seatY: y, zExtra: 0.35 });
      },
      hullRearHang(_args, parts, name) {
        const bb = partsBBox(parts);
        // round 4: a hung piece's foot stays on the plate's upper two thirds (rearStowFloor), its hook under the deck
        const y = Math.max(rearDeckY * 0.82, rearStowFloor() + bb.max.y - 2 * bb.min.y);
        if (y > rearDeckY - 0.02) { disposePartList(parts); return false; }
        const h = hullP.zface(W * 0.26, y, 1, sternZ - 1.4);
        if (!isRearPlateHit(h)) { disposePartList(parts); return false; }
        // Round 3 (2026-10-07, critics: "a white ring-shaped object hovers detached in mid-air"): the hung piece
        // hangs from a visible hook. A welded bracket arm runs from the plate face out to the piece's top tab and
        // drops a hook through it, so the bucket hangs from the hull instead of beside it.
        // Round 5 (2026-10-08; wave 254 on the Challenger 1: "hangs in space with no visible hook or bracket"): the
        // bracket reads at play distance: a bolted foot plate on the rear plate, an angle-stock arm out over the bail
        // and a J-hook of round bar through it; the pail hangs a hand's width off the plate.
        const hookY = bb.max.y, plateZ = 0.135;
        const hook = (list: DecorPartList, detail: 0 | 1) => {
          const st = (geo: THREE.BufferGeometry) => list.push({ mat: 'steel', geo: bakeShade(geo, RACK_STEEL_TONE) });
          st(footPlate(0, hookY + 0.035, plateZ, 0.1, 0.09, detail));                                   // foot plate, bolted
          st(angleStock(plateZ + 0.002, 'z', 0, plateZ / 2 - 0.011, 1, 0.034).translate(0, hookY + 0.06, 0)); // arm over the bail
          st(sweptTube([[0, hookY + 0.057, 0.013], [0, hookY - 0.004, 0.013], [0, hookY - 0.019, -0.002],
            [0, hookY - 0.006, -0.02]], 0.0055, 5, detail ? 8 : 4));                                      // J-hook round the bail
        };
        hook(parts, 1);
        if (parts.coarse) hook(parts.coarse, 0);
        return commit(name, parts, 'hull', V(W * 0.26, y - (bb.max.y - bb.min.y), h.p.z - plateZ), E(), placedHull,
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
        // round 5 (2026-10-08; wave 257 on the Merkava 4: "a dark wheel-like disc floats beside the rear-left corner"):
        // the bow probe passed under the Merkava's glacis and met the stern, so the chain hung off the rear corner;
        // a chain hangs only from a forward-facing bow plate
        if (!h || h.n.z < 0.3 || h.p.z < 0) { disposePartList(parts); return false; }
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
        // Round 3: a load seats only on real support (supportedSeat), so it walks a wider ring before the slot gives
        // up, and it rides a few degrees off square and a few centimetres off its station.
        const load = isLoadPiece(name), soft = sagsOnSupport(name);
        if (load) cands.push([0.36, -0.12], [-0.36, 0.1], [0.2, -0.46], [-0.16, -0.5], [0.42, 0.24], [-0.44, -0.36], [0.32, 0.3], [-0.06, -0.62]);
        // the gun corridor and the repaired Leopard throats (real air beside the moving shield)
        const roofAllowed = (x: number, z: number): boolean => {
          if (Math.abs(x) < 0.24 && z > 0 && !casemate) return false;
          if (['leo2a7v_x','leo2a6m_x','leo2a4m_x'].includes(spec.id)) {
            const pivot = turretG.getObjectByName('rig_gun')?.position;
            if (pivot && Math.abs(x-pivot.x)<.44+w/2 && z+d/2>pivot.z-.70) return false;
          }
          return true;
        };
        const roofLoad = (x: number, z: number, yaw: number, minN: number): boolean => seatLoad({ name, parts,
          frame: 'turret', prober: solidTurretProber(), ledger: placedTurret, x, z, yaw, w, d, fromY: 3.5, spread, soft,
          off: [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2], minNy: minN, sink: 0.006, allowed: roofAllowed });
        // round 4: a load first tries to pack against a load already on the roof (packStations), square to it
        if (load && !casemate) {
          for (const station of packStations('turret', parts, xBase, zBase)) {
            const yaw = transitYaw(slotRng) * 0.4;
            const [x, z] = station(yaw);
            if (z > zBase + 0.1) continue; // packed kit stays aft: the roof's front is hatches and sights
            if (!roofAllowed(x, z)) continue;
            if (roofLoad(x, z, yaw, LOAD_MIN_NY)) return true;
          }
        }
        for (const [dx, dz] of cands) {
          const yaw = load ? transitYaw(slotRng) : 0;
          const jx = load ? (slotRng() - 0.5) * 0.06 : 0, jz = load ? (slotRng() - 0.5) * 0.06 : 0;
          const x = xBase + dx + jx, z = zBase + dz + jz;
          if (Math.abs(x) < 0.24 && z > 0 && !casemate) continue; // gun corridor
          // The repaired Leopard throats are real air, including the full
          // footprint beside the moving shield, not just its center ray.
          if (['leo2a7v_x','leo2a6m_x','leo2a4m_x'].includes(spec.id)) {
            const pivot = turretG.getObjectByName('rig_gun')?.position;
            if (pivot && Math.abs(x-pivot.x)<.44+w/2 && z+d/2>pivot.z-.70) continue;
          }
          if (load) {
            if (roofLoad(x, z, yaw, casemate ? minNy : LOAD_MIN_NY)) return true;
            continue;
          }
          const seat = seatProbe(turP, x, z, Math.min(w, 0.42), Math.min(d, 0.42), 3.5, spread);
          if (!seat || !seat.n || seat.n.y < minNy) continue;
          if (commit(name, parts, 'turret', V(x, seat.y - 0.008, z), E(0, (slotRng() - 0.5) * 0.2, 0), placedTurret)) return true;
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
            E(0, (slotRng() - 0.5) * 0.3, 0), placedTurret, { allowOverlap: true });
        }
        const x = (args.side || 0) * Math.min(W * 0.18, Math.max(0.22, sweepR * 0.22));
        if (isLoadPiece(name)) {
          // Round 3: loads on the bustle take a supported seat (see supportedSeat), sweeping the deck sideways too.
          const soft = sagsOnSupport(name), w = bb.max.x - bb.min.x;
          const toward = -Math.sign(x || 1);
          // round 4: pack against a load already on the bustle first (packStations), square to it
          const rearLoad = (px: number, z: number, yaw: number): boolean => seatLoad({ name, parts, frame: 'turret',
            prober: solidTurretProber(), ledger: placedTurret, x: px, z, yaw, w, d, fromY: 3.5, spread: 0.2, soft,
            off: [(bb.min.x + bb.max.x) / 2, (bb.min.z + bb.max.z) / 2], minNy: LOAD_MIN_NY, sink: 0.006 });
          for (const station of packStations('turret', parts, x, -(sweepR * 0.55 + 0.3) - d * 0.2)) {
            const yaw = transitYaw(slotRng) * 0.4;
            const [px, z] = station(yaw);
            if (rearLoad(px, z, yaw)) return true;
          }
          for (const back of [0.1, 0.3, 0.55, 0.75]) {
            for (const dx of [0, toward * 0.14, -toward * 0.14, toward * 0.28]) {
              const yaw = transitYaw(slotRng);
              const px = x + dx + (slotRng() - 0.5) * 0.05;
              const z = -(sweepR * 0.55 + back) - d * 0.2 + (slotRng() - 0.5) * 0.05;
              if (rearLoad(px, z, yaw)) return true;
            }
          }
          disposePartList(parts);
          return false;
        }
        for (const back of [0.1, 0.3, 0.55]) {
          const z = -(sweepR * 0.55 + back) - d * 0.2;
          const seat = seatProbe(turP, x, z, Math.min(bb.max.x - bb.min.x, 0.5), Math.min(d, 0.35), 3.5, 0.2);
          if (!seat) continue;
          if (commit(name, parts, 'turret', V(x, seat.y - 0.01, z), E(0, (slotRng() - 0.5) * 0.3, 0), placedTurret)) return true;
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
        // Round 3: a hung load rides welded L-arms with a strap over it (sideLedgeParts), not bare against the wall.
        // The arms are built in the piece frame, where the wall is local -z at the push-out distance, and the pad goes.
        const hung = isLoadPiece(name);
        // Round 4 (2026-10-07, wave 216 on the Strv 103A: "the container is perched on a round pedestal it overhangs ...
        // rack uprights end in mid-air"): a vehicle whose turret group carries no geometry of its own has no turret
        // wall. Its turret prober falls back to the hull, so the side probe met a periscope dome on the roof and the
        // chest was hung on L-arms off it. A hung load needs a real turret wall; it goes on to its next route.
        if (hung && !turretTargets.length) { disposePartList(parts); return false; }
        for (const z of sideStations) {
          for (const yf of [0.35, 0.5]) {
            const y = Math.max(0.18, pivotTopY() * yf);
            const h = turP.side(y, z, side, W / 2 + 1);
            if (!h || Math.abs(h.n.x) < 0.55) continue;
            const candidate = clonePartList(parts);
            const pos = V(h.p.x + side * out * 0.3, y - 0.06, z);
            const rot = E(0, side > 0 ? Math.PI / 2 : -Math.PI / 2, (slotRng() - 0.5) * 0.1);
            if (hung) {
              // round 5: out until its back clears the turret's outermost surface behind it (sideClearance)
              const push = sideClearance(bb, pos, rot, side);
              if (push === null) { disposePartList(candidate); continue; }
              pos.x += side * push;
              const wallZ = -out * 0.3 - push;
              // round 5: the wall behind each arm, probed at the arm's foot, in the piece's frame
              const qr = new THREE.Quaternion().setFromEuler(rot), qi = qr.clone().invert();
              const wallAt = (lx: number, ly: number): { p: THREE.Vector3; n: THREE.Vector3 } | null => {
                const f = new THREE.Vector3(lx, ly, wallZ).applyQuaternion(qr).add(pos);
                const hit = turP.side(f.y, f.z, side, W / 2 + 1);
                if (!hit || Math.abs(hit.n.x) < 0.3) return null;
                const p = hit.p.clone().sub(pos).applyQuaternion(qi);
                // between a hand behind the probed wall and the load's own back (a bin or a cover stands out of it)
                return p.z > wallZ - 0.12 && p.z < bb.min.z + 0.01 ? { p, n: hit.n.clone().applyQuaternion(qi).normalize() } : null;
              };
              const carry = (list: DecorPartList, detail: 0 | 1) => {
                for (let i = list.length - 1; i >= 0; i--) {
                  if (list[i].role === 'pad') { list[i].geo.dispose(); list.splice(i, 1); }
                }
                const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
                // the strap rides the load's own surfaces, not the deck lashings a ledge drops (tieKept)
                const load = list.filter((p) => p.role !== 'pad' && p.role !== 'lash').map((p) => new THREE.Mesh(p.geo, solid));
                list.push(...sideLedgeParts(bb, wallZ, detail, webbingRgb, load, wallAt));
              };
              carry(candidate, 1);
              if (candidate.coarse) carry(candidate.coarse, 0);
            }
            if (commit(name, candidate, 'turret', pos, rot, placedTurret)) {
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
      // A bank pair seated on the turret roof plate at (+-x, z), yaw +-yaw (2026-10-08; a curated seat, see the
      // type89_light_tiger override in decorManifestFor): the bracket stands on the solid roof under it (decor,
      // suits and fittings are not support), 4 mm into the plate; a side without roof there keeps no bank.
      turretRoofPair(args, parts, name) {
        const x = args.x ?? 0.7, z = args.z ?? 0.3, yaw = args.yaw ?? 0.55;
        let ok = false;
        const solid = solidTurretProber();
        for (const s of [-1, 1]) {
          const cl = clonePartList(parts);
          const seat = seatProbe(solid, s * x, z, 0.3, 0.1, 3.5, 0.03);
          if (seat && commit(name, cl, 'turret', V(s * x, seat.y - 0.004, z), E(0, s * yaw, 0), placedTurret)) ok = true;
          else disposePartList(cl);
        }
        disposePartList(parts);
        return ok;
      },
      turretCheekPair(_args, parts, name) {
        let ok = false;
        const stations = [[0.3, 0.5], [0.2, 0.42], [0.36, 0.6]];
        // Round 5 (2026-10-08; the contact receipt and a fleet census: the forward-fan yaw laid a bank's row along a
        // cheek facing about 31 degrees off the bow, so on the flat sides of the Abrams, Griffin and T-80 and the round
        // T-72 and T-62 turrets the row stood out of the wall with its inner half inside the turret): a bank seats to
        // the wall it meets. Its row lies along the wall (a side wall: SIDE_TOE off it toward the bow), its bracket's back
        // clear of it and the wedge filling the rest, its tubes along the wall's normal or, where that faces further out
        // than SIDE_AIM, canted forward on the bracket about their pivots. Cheeks are tried first, the stations and
        // three more forward along the cheek; then a side facing square out; a wall facing aft, or a roof or an
        // overhang, takes the old fan only where nothing else does, so no bank is dropped (the smoke counts are pinned).
        const forward = [[0.45, 0.5], [0.6, 0.48], [0.75, 0.46]];
        // a cheek or a side is looked for higher up the wall as well (a T-72's stations meet the underside of its side
        // boxes), the old fan only at the stations themselves
        const candidates = (pass: 0 | 1 | 2): number[][] => {
          const base = pass === 0 ? [...stations, ...forward] : stations;
          if (pass === 2) return base;
          const lifts = pass === 0 ? [0, 0.14, 0.28] : [0, 0.14];
          return lifts.flatMap((dy) => base.map(([z, yf]) => [z, Math.min(0.9, yf + dy)]));
        };
        // The smoke counts are pinned (vehicle-controls-inventory): a side whose bank the old fan could not seat keeps
        // no bank, wherever a wall seat might have taken one. legacySeats replays the old fan's stations, its
        // soft-cover fallback and the field upgrades' forward steps against the commit's own guards (turret width and
        // reach, keep-clear, the field volumes, overlap) on the bank's plain bracket, without committing.
        const legacyGuards = (pos: THREE.Vector3, rot: THREE.Euler): 'ok' | 'field' | 'no' => {
          const bb = placedBox(parts, pos, rot);
          let rMax = 0;
          for (const x of [bb.min.x, bb.max.x]) for (const z of [bb.min.z, bb.max.z]) rMax = Math.max(rMax, Math.hypot(x, z));
          if (Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) > W / 2 + 0.048 || rMax > sweepR + 0.55) return 'no';
          if (keepClearHit(bb, 'turret')) return 'no';
          if (fieldEquipment.turret.some((box) => box.intersectsBox(bb))) return 'field';
          return overlaps(bb, placedTurret) ? 'no' : 'ok';
        };
        const legacySeats = (s: number): boolean => {
          let field = false;
          for (const [z, yf] of stations) {
            const y = Math.max(0.24, pivotTopY() * yf);
            const h = turP.side(y, z, s, W / 2 + 1);
            if (!h) continue;
            const r = legacyGuards(V(h.p.x + s * 0.03, y, z), E(0, s * 0.55, 0));
            if (r === 'ok') return true;
            field ||= r === 'field';
          }
          const solid = solidTurretProber();
          for (const [z, yf] of stations) {
            const y = Math.max(0.24, pivotTopY() * yf);
            const h = solid.side(y, z, s, W / 2 + 1);
            if (!h) continue;
            const pos = V(h.p.x + s * 0.03, y, z), rot = E(0, s * 0.55, 0);
            const bb = placedBox(parts, pos, rot);
            const over = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) - (W / 2 + 0.048);
            if (over > 0.003) continue;
            if (over > 0) pos.x -= s * (over + 0.0005);
            const r = legacyGuards(pos, rot);
            if (r === 'ok') return true;
            field ||= r === 'field';
          }
          if (field) {
            const y = Math.max(0.24, pivotTopY() * 0.5);
            for (let z = 0.42; z <= 1.6; z += 0.06) {
              const h = solid.side(y, z, s, W / 2 + 1);
              if (h && legacyGuards(V(h.p.x + s * 0.03, y, z), E(0, s * 0.55, 0)) === 'ok') return true;
            }
          }
          return false;
        };
        for (const s of [-1, 1]) {
          if (!legacySeats(s)) continue;
          const cl = clonePartList(parts);
          let done = false;
          // whether a station passed every guard and was turned away by a field upgrade's volume alone (below)
          let fieldBlocked = false;
          const tryCommit = (pos: THREE.Vector3, rot: THREE.Euler): boolean => {
            if (commit(name, cl, 'turret', pos, rot, placedTurret)) return true;
            if (summary.skipped[summary.skipped.length - 1]?.[1] === 'field-equipment') fieldBlocked = true;
            return false;
          };
          let skewed = 0;
          const skewTo = (angle: number): void => { skewTubes(cl, angle - skewed); skewed = angle; };
          // the old fan's own bracket (pass 2 replays it exactly, so a bank it seated seats again)
          const plainBracket = (): void => {
            const k = cl.findIndex((p) => p.bracket), k0 = parts.findIndex((p) => p.bracket);
            if (k < 0 || k0 < 0) return;
            resources.releaseGeometry(cl[k].geo);
            cl[k].geo = parts[k0].geo.clone();
          };
          const seat = (h: { p: THREE.Vector3; n: THREE.Vector3 }, y: number, z: number, pass: 0 | 1 | 2):
            { pos: THREE.Vector3; rot: THREE.Euler } | null => {
            const alpha = Math.atan2(Math.abs(h.n.x), h.n.z);
            if (pass === 2) { skewTo(0); plainBracket(); return { pos: V(h.p.x + s * 0.03, y, z), rot: E(0, s * 0.55, 0) }; }
            if (Math.abs(h.n.y) > 0.7) return null;
            if (pass === 0 ? alpha > CHEEK_MAX_ALPHA : alpha <= CHEEK_MAX_ALPHA || alpha > SIDE_MAX_ALPHA) return null;
            // a side facing aft of square out turns the row further off it, so the cant still brings the tubes forward
            const toe = pass === 0 ? 0 : Math.max(SIDE_TOE, alpha - SIDE_ALONG_MAX), along = alpha - toe;
            skewTo(s * Math.max(-SIDE_CANT_MAX, Math.min(0, SIDE_AIM - along)));
            const k = cl.findIndex((p) => p.bracket);
            const bb = k >= 0 ? (cl[k].geo.computeBoundingBox(), cl[k].geo.boundingBox!) : null;
            const half = bb ? (bb.max.x - bb.min.x) / 2 : 0.2, back = bb ? Math.max(0.04, -bb.min.z) : 0.04;
            const off = 0.005 + half * Math.sin(toe) + back * Math.cos(toe);
            const nh = new THREE.Vector3(h.n.x, 0, h.n.z).normalize();
            // the bracket's middle on the probed point (its foot stood at the probe, so a low wall left its top in air)
            const mid = bb ? (bb.min.y + bb.max.y) / 2 : 0.05;
            return { pos: V(h.p.x + nh.x * off, y - mid, h.p.z + nh.z * off), rot: E(0, s * along, 0) };
          };
          // a seat to the wall holds only where the turret stands behind every corner of the bracket within
          // BRACKET_MAX_DEPTH (a row longer than a small cheek hangs past its edge: the BMP-3M Dragun)
          const backed = (pos: THREE.Vector3, rot: THREE.Euler): boolean => {
            const k = cl.findIndex((p) => p.bracket);
            if (k < 0) return true;
            cl[k].geo.computeBoundingBox();
            const b = cl[k].geo.boundingBox!, cast = cheekCaster(pos, rot);
            for (const cx of [b.min.x, b.max.x]) {
              for (const cy of [b.min.y, b.max.y]) {
                const f = new THREE.Vector3(cx, cy, b.max.z), hit = cast(f);
                if (!hit || f.z - hit.z > BRACKET_MAX_DEPTH) return false;
              }
            }
            return true;
          };
          for (const pass of [0, 1, 2] as const) {
            for (const [z, yf] of candidates(pass)) {
              const y = Math.max(0.24, pivotTopY() * yf);
              const h = turP.side(y, z, s, W / 2 + 1);
              if (!h) continue;
              const at = seat(h, y, z, pass);
              if (!at || (pass < 2 && !backed(at.pos, at.rot))) continue;
              const { pos, rot } = at;
              wedgeBracket(cl, pos, rot, h.p, h.n, resources.releaseGeometry, cheekCaster(pos, rot));
              if (tryCommit(pos, rot)) { done = true; break; }
              // the old fan with its wedge turned away: its own plain bracket at the same seat, as it always seated
              if (pass === 2) { plainBracket(); if (tryCommit(pos, rot)) { done = true; break; } }
            }
            if (done) break;
          }
          // Round 3 (2026-10-07): a declared smoke bank is a gameplay fitting, and a change in the turret's dressing
          // alone must not drop it. When every station overhangs the width guard, the bank seats on the turret under
          // any soft cover (a ghillie suit's net and garnish stand up to half a metre off the armour, leo2a6_ua), and a
          // last overhang of at most 3 mm (a stowage roll's finer facets, k2b) is taken inboard. A bank that seats at
          // a station never reaches this; one that overhangs by more stays off, as before.
          if (!done) {
            const solid = solidTurretProber();
            for (const pass of [0, 1, 2] as const) {
              for (const [z, yf] of candidates(pass)) {
                const y = Math.max(0.24, pivotTopY() * yf);
                const h = solid.side(y, z, s, W / 2 + 1);
                if (!h) continue;
                const at = seat(h, y, z, pass);
                if (!at || (pass < 2 && !backed(at.pos, at.rot))) continue;
                const { pos, rot } = at;
                const inboard = (): boolean => {
                  const bb = placedBox(cl, pos, rot);
                  const over = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x)) - (W / 2 + 0.048);
                  if (over > 0.003) return false;
                  if (over > 0) pos.x -= s * (over + 0.0005);
                  return true;
                };
                wedgeBracket(cl, pos, rot, h.p, h.n, resources.releaseGeometry, cheekCaster(pos, rot));
                const x0 = pos.x;
                if (inboard() && tryCommit(pos, rot)) { done = true; break; }
                if (pass === 2) { pos.x = x0; plainBracket(); if (inboard() && tryCommit(pos, rot)) { done = true; break; } }
              }
              if (done) break;
            }
          }
          // 2026-10-08: a field upgrade's screens or roof-cage legs own the cheek stations (main's 5f8eefaa4 on the
          // Oplot-M and the Leclerc X); a bank one of them turned away keeps its launch sockets on the first station
          // forward of them along the turret side, in 6 cm steps. A bank every station refused for its own reasons (the
          // width guard, its overlap) stays off, as before, so no vehicle gains sockets it never had. Round 5: seated to
          // the wall there as at the stations (seat), cheek, then side, then the old fan.
          if (!done && fieldBlocked) {
            const solid = solidTurretProber();
            const y = Math.max(0.24, pivotTopY() * 0.5);
            for (const pass of [0, 1, 2] as const) {
              for (let z = 0.42; z <= 1.6 && !done; z += 0.06) {
                const h = solid.side(y, z, s, W / 2 + 1);
                if (!h) continue;
                const at = seat(h, y, z, pass);
                if (!at || (pass < 2 && !backed(at.pos, at.rot))) continue;
                wedgeBracket(cl, at.pos, at.rot, h.p, h.n, resources.releaseGeometry, cheekCaster(at.pos, at.rot));
                done = tryCommit(at.pos, at.rot);
                if (!done && pass === 2) { plainBracket(); done = tryCommit(at.pos, at.rot); }
              }
              if (done) break;
            }
          }
          if (!done) disposePartList(cl);
          ok = ok || done;
        }
        disposePartList(parts);
        return ok;
      },
    };

    // The turret's solid surfaces for a rigid fitting's seat: soft cover (a ghillie suit's net and garnish, named
    // by ghillieSuit.ts; their alpha cut exists only where a canvas does, so it cannot be the test) is left out.
    // Built once, on first use, as a plain raycast prober (a handful of rays).
    let _solidTurP: SurfaceProber | null = null;
    function solidTurretProber(): SurfaceProber {
      if (_solidTurP) return _solidTurP;
      const solid = turretProbeTargets.filter((mesh) => mesh.userData.vehicleFoliage === undefined
        && !mesh.name.includes('_ghillie_'));
      _solidTurP = solid.length === turretProbeTargets.length ? turP : makeProber(turretG, solid, null);
      return _solidTurP;
    }
    // The hull's solid surfaces likewise (round 4, 2026-10-07: the Strv 103A's suit net and garnish stand 2-36 cm off
    // its roof, so a roof seat probed through them came out tilted or perched on the leaves).
    let _solidHullP: SurfaceProber | null = null;
    function solidHullProber(): SurfaceProber {
      if (_solidHullP) return _solidHullP;
      const solid = hullProbeTargets.filter((mesh) => mesh.userData.vehicleFoliage === undefined
        && !mesh.name.includes('_ghillie_'));
      _solidHullP = solid.length === hullProbeTargets.length ? hullP : makeProber(hullG, solid, null);
      return _solidHullP;
    }

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
        // round 4 follow-up: a can rack is the nation's own (canRackStyleFor); round 5: a bin wears the nation's paint
        if (row.kit === 'jerry' || row.kit === 'bin') values.nation = spec.nation || '';
        // The mobile tier builds only the coarse forms; other tiers build both levels
        // from identically seeded streams (builders draw before branching on detail).
        const variant = String(values.v ?? '');
        const pieceName = row.kit === 'cargo' ? `cargo:${variant}` : row.kit;
        // round 5: the n-th soft load of the tank takes the n-th fabric of its rotation (fabricFamily), so its kit
        // alternates light and dark goods; the counter steps once per built row, the same at every tier
        if (sagsOnSupport(pieceName)) values.fabric = fabricBase + fabricCount++;
        // round 5: one tie webbing per load at both levels, standing off the load's own value (tieRgbFor)
        const secure = (list: DecorPartList, detail: 0 | 1, tie: RGB): void => {
          secureLoadParts(list, row.kit, variant, detail, tie);
          if (isLoadPiece(pieceName)) lashLoad(list, detail, tie);
        };
        if (lowTier) {
          const coarseOnly = kitFn({ rng: mulberry32(seed), ...values, detail: 0 });
          if (coarseOnly) secure(coarseOnly, 0, tieRgbFor(coarseOnly, canvasLinear));
          return coarseOnly;
        }
        const parts = kitFn({ rng: mulberry32(seed), ...values, detail: 1 });
        if (parts) {
          const tie = tieRgbFor(parts, canvasLinear);
          parts.coarse = DETAIL_KITS.has(row.kit)
            ? kitFn({ rng: mulberry32(seed), ...values, detail: 0 })
            : clonePartList(parts);
          if (parts.coarse && DETAIL_KITS.has(row.kit)) secure(parts.coarse, 0, tie);
          secure(parts, 1, tie);
          if (parts.coarse && !DETAIL_KITS.has(row.kit)) secure(parts.coarse, 0, tie);
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
      jitterSeed: number,
    ): void {
      slotRng = mulberry32((jitterSeed ^ 0x51a7e) >>> 0);
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
        if (parts) placeManifestParts(row, slotFn, parts, jitterSeed);
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
        if (parts) placeManifestParts(row, slotFn, parts, jitterSeed);
      }
      // Every row's roll and seed off the main stream, drawn in manifest order exactly as before (two draws a row), so
      // an early row (DecorManifestRow.early) seats first with the very draws it would have had in its turn.
      const draws = manifest.map(() => { const roll = rng(); return { roll, jitterSeed: (rng() * 0x7fffffff) | 0 }; });
      const skipRow = (row: DecorManifestRow): boolean => DECOR_RETIRED_KITS.has(row.kit);
      const seatRow = (row: DecorManifestRow, jitterSeed: number): void => {
        const kitFn = DECOR_KITS[row.kit];
        const slotFn = SLOTS[row.slot[0]];
        if (!kitFn || !slotFn) return;
        const parts = createManifestParts(row, kitFn, jitterSeed);
        if (parts) placeManifestParts(row, slotFn, parts, jitterSeed);
      };
      manifest.forEach((row, index) => {
        if (row.early && row.kit !== 'smoke' && row.kit !== 'antenna' && !skipRow(row)
          && !(draws[index].roll > (row.p ?? 1))) seatRow(row, draws[index].jitterSeed);
      });
      for (let index = 0; index < manifest.length; index++) {
        const row = manifest[index];
        const { roll, jitterSeed } = draws[index];
        if (row.early) { yield { stage: 'manifest-row', completed: index + 1, total: manifest.length }; continue; }
        // the decor seats no weapon (DECOR_RETIRED_KITS); the roof gun row's draws stay consumed above
        if (skipRow(row)) { yield { stage: 'manifest-row', completed: index + 1, total: manifest.length }; continue; }
        if (row.kit !== 'smoke' && row.kit !== 'antenna' && !(roll > (row.p ?? 1))) {
          const kitFn = DECOR_KITS[row.kit];
          const slotFn = SLOTS[row.slot[0]];
          if (kitFn && slotFn) {
            const parts = createManifestParts(row, kitFn, jitterSeed);
            if (parts) placeManifestParts(row, slotFn, parts, jitterSeed);
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
    // round 5 (2026-10-08, the nets lane): a camouflage suit's roof and deck nets are drawn up over the loads stowed on
    // them, never laid through them (ghillieDrape.ts)
    drapeGhillieOverLoads(hullG, seatedLoads.hull);
    drapeGhillieOverLoads(turretG, seatedLoads.turret);
    // the netting lane (2026-10-10): a field suit gives way to the smoke banks seated here (gameplay fittings, laid
    // after the suit): its cloth and garnish in their lines of fire are cut away
    for (const frameG of [hullG, turretG]) clearGhillieForSmoke(frameG, decorSmokeLines(frameG));
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
