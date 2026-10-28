// The armour paint by panel (263). The per-point score (vehicles/materials.ts ARMOR_PAINT, sim/armorZones.ts) draws a
// zone border as a straight line wherever two plates' scores meet, and after 262's five blind rounds the one defect the
// critics still named was that line crossing a part: a diagonal through an ERA tile, a stair down a turret wedge, a cut
// across a skirt panel. Here every connected triangle cluster of a painted draw — the triangles that share its vertices:
// a box's face, a tile, a panel — takes one zone, the area-weighted majority of that same score over its triangles,
// written as the vertex attribute apZone (the zone + 1; PANEL_BARE for gear left bare; 0 the per-point score, as before),
// so a border falls on a panel's edge. Each part is judged in its own rig's frame (a hull part is hull armour at any yaw;
// what rides the turret or the gun is the turret's). A cluster with no majority goes by part (264, Main): a small one (a
// dome, a hatch) whole on its plurality, a large welded casting split at its creases, each piece voting again; a piece
// still split keeps the per-point score, as does a turret part by the barrel (the gun's elevation decides there).
//
// Baked in slices once the overlay primes a vehicle (the battle visual streamer's staging, else the overlay's own frames),
// once per geometry: copies of a spec share it. Each geometry is judged at one pose, its frames taken as it starts. Every
// painted geometry gets the attribute (zeros where it bakes nothing), so the draws a far LOD merges keep one vertex
// layout; a draw without it reads 0 (the hook's defaultAttributeValues).

import * as THREE from 'three';
import { zoneAt, type ZonePlate } from '../sim/armorZones.ts';
import { ARMOR_PAINT_PANEL_BARE as PANEL_BARE, ARMOR_PAINT_ZONE_ATTRIBUTE as PANEL_ZONE_ATTRIBUTE, armorPaintMode } from '../vehicles/materials.ts';

/** The share of a cluster's area its zone must hold to be baked; under it the cluster keeps the per-point score. */
export const PANEL_MAJORITY = 0.6;

/** What the bake needs of the overlay's template (game/armorAimOverlay.ts): the zones and the frames' boxes. */
export interface PanelTemplate {
  readonly zones: readonly ZonePlate[];
  readonly hullZones: number;
  readonly turretMin: THREE.Vector3;
  readonly turretMax: THREE.Vector3;
  readonly hullCentre: THREE.Vector3;
  readonly turretCentre: THREE.Vector3;
  readonly hullHalf: THREE.Vector3;
  readonly turretHalf: THREE.Vector3;
  readonly barrelFrom: number;
  readonly barrelRadius: number;
}

export interface PanelFrames {
  readonly hull: THREE.Object3D;
  readonly turret: THREE.Object3D | null;
  readonly gun?: THREE.Object3D | null;
}

export interface PanelBakeStats {
  draws: number;
  geometries: number;
  triangles: number;
  /** Triangles whose cluster took one zone, was left bare, or kept the per-point score. */
  baked: number;
  bare: number;
  perPoint: number;
  /** Geometries drawn more than once (another place, another zone): zeros. */
  shared: number;
  /** The per-point triangles by why: no zone held the majority, the pose decides (live), no plate faces them. */
  perPointSplit: number;
  perPointLive: number;
  perPointNone: number;
  /** Clusters with no majority that were baked by part: whole (a small part's plurality) or split at their creases. */
  wholeParts: number;
  creaseParts: number;
  /** (measurePanelDisagreement) the painted area, the panels' share of it, and the part of that the per-point paint gives
   * another zone (m²). */
  paintedArea: number;
  bakedArea: number;
  disagreeArea: number;
  /** ... by why: the per-point paint leaves it bare or unpainted; it judges it in the other frame; another plate. */
  disagreeBare: number;
  disagreeFrame: number;
  disagreeZone: number;
  /** Clusters, and the votes they cast (one a flat cluster). */
  clusters: number;
  votes: number;
  /** The bake's own time, its slices and the longest (what a frame pays). */
  ms: number;
  slices: number;
  sliceMs: number;
}

// a triangle's vote: a zone (>= 0), or one of these
const VOTE_NONE = -1;
const VOTE_BARE = -2;
const VOTE_LIVE = -3;

/** Which armour model baked a geometry (same-spec copies share theirs); a geometry seen under another is zeroed. */
const bakedBy = new WeakMap<THREE.BufferGeometry, object | null>();
/** Each template's hull and turret zones apart (zoneAt takes one frame's). */
interface FrameZones {
  readonly hull: ZonePlate[];
  readonly turret: ZonePlate[];
}
const frameZones = new WeakMap<PanelTemplate, FrameZones>();
function frameZonesOf(template: PanelTemplate): FrameZones {
  let split = frameZones.get(template);
  if (!split) {
    split = { hull: template.zones.slice(0, template.hullZones), turret: template.zones.slice(template.hullZones) };
    frameZones.set(template, split);
  }
  return split;
}

/** One geometry's frames, as they stood when its bake started (a slice later the vehicle may have moved). */
interface PanelPose {
  readonly hullInv: THREE.Matrix4;
  readonly turretInv: THREE.Matrix4;
  readonly gunInv: THREE.Matrix4;
}
/** Triangles a slice of the bake takes before it yields. */
const SLICE_TRIANGLES = 1500;

const _unscale = new THREE.Matrix4();
const _normalWorld = new THREE.Matrix3();
const _b = new THREE.Vector3(), _c = new THREE.Vector3(), _world = new THREE.Vector3();
const _centre = new THREE.Vector3(), _normal = new THREE.Vector3(), _p = new THREE.Vector3(), _t = new THREE.Vector3();
const _g = new THREE.Vector3(), _n = new THREE.Vector3(), _box = new THREE.Vector3();

function frameInverse(group: THREE.Object3D, out: THREE.Matrix4): THREE.Matrix4 {
  _unscale.makeScale(1 / (group.scale.x || 1), 1 / (group.scale.y || 1), 1 / (group.scale.z || 1));
  return out.multiplyMatrices(group.matrixWorld, _unscale).invert();
}

type Owner = 'hull' | 'turret' | 'gun';
function ownerOf(object: THREE.Object3D, frames: PanelFrames): Owner {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node === frames.gun) return 'gun';
    if (node === frames.turret) return 'turret';
    if (node === frames.hull) return 'hull';
  }
  return 'hull';
}

/**
 * The paint's own judgement at one world point with its world normal (materials.ts ARMOR_PAINT_DIFFUSE_GLSL, the same
 * terms): its frame, its normal leaned on the frame's cell box, the gear it leaves bare, then the zone (sim/armorZones.ts
 * zoneAt, the mantlet's footprint first).
 * - `perPoint` false (the bake): the frame is the part's own rig's: a hull part is hull armour at any yaw, what rides the
 *   turret or the gun is the turret's wherever it stands (the per-fragment paint cannot know a part's rig and takes the
 *   turret's frame inside its envelope: a hull deck under the turret's overhang changed zone with the yaw, a mantlet ahead
 *   of the envelope stood bare). VOTE_LIVE where the gun's elevation decides (a turret part by the barrel).
 * - `perPoint` true: exactly the per-fragment paint's rule (the frame by the envelope and the footprints), for the
 *   measure of where a panel and the per-point paint disagree.
 */
function vote(template: PanelTemplate, split: FrameZones, pose: PanelPose, barrel: boolean, mode: number,
  owner: Owner, world: THREE.Vector3, normalWorld: THREE.Vector3, perPoint = false): number {
  const zones = template.zones, hullN = template.hullZones;
  const hasTurret = zones.length > hullN;
  const t = _t.copy(world).applyMatrix4(pose.turretInv);
  let turret = hasTurret && t.x >= template.turretMin.x && t.y >= template.turretMin.y && t.z >= template.turretMin.z
    && t.x <= template.turretMax.x && t.y <= template.turretMax.y && t.z <= template.turretMax.z;
  let overFoot = false;
  for (let k = hullN; k < zones.length; k++) {
    const box = zones[k].footprint;
    if (box && t.x >= box.min[0] && t.y >= box.min[1] && t.z >= box.min[2] && t.x <= box.max[0] && t.y <= box.max[1] && t.z <= box.max[2]) overFoot = true;
  }
  turret = turret || overFoot;
  // the barrel, in the gun's frame: bare at any elevation; a turret part near it moves in and out with the gun
  if (barrel) {
    const g = _g.copy(world).applyMatrix4(pose.gunInv);
    const r2 = g.x * g.x + g.y * g.y;
    const inBarrel = g.z > template.barrelFrom && r2 < template.barrelRadius * template.barrelRadius;
    if (inBarrel && (perPoint || owner === 'gun')) return VOTE_BARE;
    if (!perPoint && owner === 'turret' && g.z > template.barrelFrom - 0.1 && r2 < (template.barrelRadius + 0.1) ** 2) return VOTE_LIVE;
  }
  if (!perPoint) {
    turret = owner !== 'hull' && hasTurret;
    if (owner === 'hull') overFoot = false;
  }
  const p = turret ? t : _p.copy(world).applyMatrix4(pose.hullInv);
  const n = _n.copy(normalWorld).transformDirection(turret ? pose.turretInv : pose.hullInv);
  const centre = turret ? template.turretCentre : template.hullCentre;
  const half = turret ? template.turretHalf : template.hullHalf;
  const hx = Math.max(half.x, 0.05), hy = Math.max(half.y, 0.05), hz = Math.max(half.z, 0.05);
  const qx = (p.x - centre.x) / hx, qy = (p.y - centre.y) / hy, qz = (p.z - centre.z) / hz;
  const box = _box.set(qx * qx * qx / hx, qy * qy * qy / hy, qz * qz * qz / hz);
  if (box.lengthSq() > 1e-12) box.normalize(); else box.set(0, 1, 0);
  if (mode > 1) n.copy(box);
  else {
    n.addScaledVector(box, 3);
    if (n.lengthSq() < 1e-6) n.copy(box); else n.normalize();
  }
  // the rest of the gear: weapon steel outside the turret's cells, what stands above the hull's cells or past their ends
  if (mode === 3 && turret && !overFoot && (Math.abs(t.x - template.turretCentre.x) > template.turretHalf.x + 0.05
    || Math.abs(t.y - template.turretCentre.y) > template.turretHalf.y + 0.05
    || Math.abs(t.z - template.turretCentre.z) > template.turretHalf.z + 0.05)) return VOTE_BARE;
  if (!turret && template.hullHalf.y > 0
    && (p.y > template.hullCentre.y + template.hullHalf.y + 0.1 || Math.abs(p.z - template.hullCentre.z) > template.hullHalf.z + 0.1)) return VOTE_BARE;
  const zone = zoneAt(turret ? split.turret : split.hull, p.x, p.y, p.z, n.x, n.y, n.z);
  return zone >= 0 ? zone + (turret ? hullN : 0) : VOTE_NONE;
}

function plateName(zone: ZonePlate | undefined): string {
  return String((zone?.plate as { name?: string } | undefined)?.name ?? '');
}

function find(parent: Int32Array, v: number): number {
  while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
  return v;
}
function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a), rb = find(parent, b);
  if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
}

/** Positions weld on a 0.2 mm grid (a key per cell). */
const WELD_PER_M = 5000;
const WELD_SPAN = 131072;
/** A cluster whose normals all lie within ~1.8° of its first is flat: one vote at its area-weighted centre. */
const FLAT_DOT = 0.9995;
/** A curved cluster votes on at most this many of its triangles (an even stride). */
const MAX_VOTES = 32;
/** A flat cluster of at most this many triangles votes on three points a triangle; a larger one once at its centre. */
const FLAT_SAMPLED = 8;
/** A cluster with no majority under this area (m²: a dome, a hatch, a lamp's casing) takes its plurality as one part;
 * a larger one (a welded hull or turret casting) is split at its creases and each piece votes again. */
const SMALL_PART_M2 = 0.5;
const PLURALITY = 0.4;
/** Adjacent triangles whose faces turn more than ~30° apart lie on two sides of a crease. */
const CREASE_DOT = 0.866;

/** A baked triangle as a lane measure reads it: its world centre and normal, its area, its part (the draw and its
 * cluster), and the plate its panel shows and the plate the per-point paint would (null: bare or unpainted). */
export interface PanelSample {
  readonly x: number; readonly y: number; readonly z: number;
  readonly nx: number; readonly ny: number; readonly nz: number;
  readonly area: number;
  readonly part: string;
  readonly panel: string;
  readonly point: string | null;
}
/** (lane tools) Also measure where a panel's zone and the per-point paint's disagree (bakedArea, disagreeArea), and hand
 * each baked triangle to `sink`; null stops it. */
let measureDisagreement = false;
let panelSink: ((sample: PanelSample) => void) | null = null;
export function measurePanels(sink: ((sample: PanelSample) => void) | null): void {
  measureDisagreement = !!sink;
  panelSink = sink;
}

/** A three-component attribute's values as a plain array (a copy when it is interleaved or normalized). */
function plain(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): ArrayLike<number> | null {
  if (!attribute) return null;
  const direct = attribute as THREE.BufferAttribute;
  if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !direct.normalized && direct.itemSize === 3) return direct.array;
  const out = new Float32Array(attribute.count * 3);
  for (let v = 0; v < attribute.count; v++) { out[v * 3] = attribute.getX(v); out[v * 3 + 1] = attribute.getY(v); out[v * 3 + 2] = attribute.getZ(v); }
  return out;
}

/** A geometry's clusters: each triangle's (`parent`, a union-find over triangles), each vertex's welded twin (`canon`: one
 * vertex per welded corner), and the triangles' corners. */
interface Clusters {
  readonly parent: Int32Array;
  readonly canon: Int32Array;
  readonly triangles: number;
  readonly corner: (t: number, k: number) => number;
  readonly indexed: boolean;
}

/**
 * The parts of a geometry: triangles joined across every edge they share (corners welded by position) where their faces
 * turn less than a crease (CREASE_DOT), so a part is a surface its creases bound: a box's faces stay apart, a faceted
 * dome, a bevel's run or a smooth casting holds together (264: a dome drawn flat-shaded voted facet by facet). An indexed
 * geometry's triangles that share a vertex stay together too (one value a vertex). A yield every SLICE_TRIANGLES.
 */
function* clusters(geometry: THREE.BufferGeometry): Generator<void, Clusters, void> {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = position.count;
  const canon = new Int32Array(count);
  const triangles = Math.floor((index ? index.count : count) / 3);
  const parent = new Int32Array(triangles);
  for (let t = 0; t < triangles; t++) parent[t] = t;
  const corner = index ? (t: number, k: number) => index.getX(t * 3 + k) : (t: number, k: number) => t * 3 + k;
  const p = plain(position)!;
  // corners welded by position (0.2 mm)
  const heads = new Map<number, number>();
  const half = WELD_SPAN / 2;
  for (let v = 0; v < count; v++) {
    const key = ((Math.round(p[v * 3] * WELD_PER_M) + half) * WELD_SPAN + Math.round(p[v * 3 + 1] * WELD_PER_M) + half)
      * WELD_SPAN + Math.round(p[v * 3 + 2] * WELD_PER_M) + half;
    const head = heads.get(key);
    if (head === undefined) { heads.set(key, v); canon[v] = v; } else canon[v] = head;
    if (v % (SLICE_TRIANGLES * 3) === SLICE_TRIANGLES * 3 - 1) yield;
  }
  // each triangle's face direction (local: a rigid frame keeps the angles)
  const face = new Float64Array(triangles * 3);
  for (let t = 0; t < triangles; t++) {
    const a = corner(t, 0) * 3, b = corner(t, 1) * 3, c = corner(t, 2) * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const wx = p[c] - p[a], wy = p[c + 1] - p[a + 1], wz = p[c + 2] - p[a + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (length > 1e-18) { face[t * 3] = nx / length; face[t * 3 + 1] = ny / length; face[t * 3 + 2] = nz / length; }
  }
  // across each shared edge, short of a crease
  const edges = new Map<number, number>();
  for (let t = 0; t < triangles; t++) {
    for (let e = 0; e < 3; e++) {
      const a = canon[corner(t, e)], b = canon[corner(t, (e + 1) % 3)];
      if (a === b) continue;
      const key = a < b ? a * count + b : b * count + a;
      const other = edges.get(key);
      if (other === undefined) { edges.set(key, t); continue; }
      if (face[t * 3] * face[other * 3] + face[t * 3 + 1] * face[other * 3 + 1] + face[t * 3 + 2] * face[other * 3 + 2] >= CREASE_DOT) {
        union(parent, t, other);
      }
    }
    if (t % SLICE_TRIANGLES === SLICE_TRIANGLES - 1) yield;
  }
  // an indexed geometry: the triangles that share a vertex, together
  if (index) {
    const owner = new Int32Array(count).fill(-1);
    for (let t = 0; t < triangles; t++) {
      for (let k = 0; k < 3; k++) {
        const v = corner(t, k);
        if (owner[v] < 0) owner[v] = t; else union(parent, owner[v], t);
      }
    }
  }
  return { parent, canon, triangles, corner, indexed: !!index };
}

/**
 * Bake the panels of one vehicle in slices (a yield every SLICE_TRIANGLES): every single-material, non-instanced draw the
 * paint colours gets the apZone attribute. `stats` fills as it goes. Allocates per geometry, once; nothing per frame.
 */
export function* bakePaintPanelSteps(
  root: THREE.Object3D, template: PanelTemplate, frames: PanelFrames, armor: object, stats: PanelBakeStats,
): Generator<void, PanelBakeStats, void> {
  const split = frameZonesOf(template);
  const barrel = !!frames.gun && Number.isFinite(template.barrelFrom) && template.barrelRadius > 0;
  const users = new Map<THREE.BufferGeometry, THREE.Mesh[]>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh & { isInstancedMesh?: boolean; isBatchedMesh?: boolean };
    if (!mesh.isMesh || mesh.isInstancedMesh || mesh.isBatchedMesh || Array.isArray(mesh.material) || !mesh.material) return;
    if (armorPaintMode(mesh.material) < 1 || !mesh.geometry?.getAttribute('position')) return;
    const list = users.get(mesh.geometry);
    if (list) list.push(mesh); else users.set(mesh.geometry, [mesh]);
  });
  const pose: PanelPose = { hullInv: new THREE.Matrix4(), turretInv: new THREE.Matrix4(), gunInv: new THREE.Matrix4() };
  // a tally of one cluster's votes by area (VOTE_LIVE .. the last zone), and the slots it touched
  const tally = new Float64Array(template.zones.length + 3);
  const touched: number[] = [];
  let sliceStarted = performance.now(), sliceWork = 0;
  const yieldSlice = (): void => {
    const took = performance.now() - sliceStarted;
    stats.ms += took;
    stats.sliceMs = Math.max(stats.sliceMs, Math.round(took * 10) / 10);
    stats.slices++;
    sliceWork = 0;
  };
  const spend = (triangles: number): boolean => {
    sliceWork += triangles;
    if (sliceWork < SLICE_TRIANGLES) return false;
    yieldSlice();
    return true;
  };
  for (const [geometry, meshes] of users) {
    if (!geometry.getAttribute('position')) continue;
    stats.draws += meshes.length;
    const position = geometry.getAttribute('position');
    const was = bakedBy.get(geometry);
    if (was === armor || (was === null && geometry.getAttribute(PANEL_ZONE_ATTRIBUTE))) continue;
    stats.geometries++;
    const values = new Int8Array(position.count);
    const sharedElsewhere = meshes.length > 1 || (was !== undefined && was !== armor);
    if (sharedElsewhere) {
      stats.shared++;
      stats.perPoint += Math.floor((geometry.index ? geometry.index.count : position.count) / 3);
    } else {
      const mesh = meshes[0];
      // this geometry's pose: its frames and its own matrix, now
      mesh.updateWorldMatrix(true, false);
      frames.hull.updateWorldMatrix(true, false);
      frames.turret?.updateWorldMatrix(true, false);
      frames.gun?.updateWorldMatrix(true, false);
      frameInverse(frames.hull, pose.hullInv);
      if (frames.turret) frameInverse(frames.turret, pose.turretInv); else pose.turretInv.copy(pose.hullInv);
      if (frames.gun) frameInverse(frames.gun, pose.gunInv); else pose.gunInv.copy(pose.turretInv);
      const welding = clusters(geometry);
      let welded = welding.next();
      while (!welded.done) { yieldSlice(); yield; sliceStarted = performance.now(); welded = welding.next(); }
      const { parent, canon, triangles, corner, indexed } = welded.value;
      stats.triangles += triangles;
      const mode = armorPaintMode(mesh.material as THREE.Material);
      const owner = ownerOf(mesh, frames);
      const p = plain(position)!, n = plain(geometry.getAttribute('normal'));
      const m = mesh.matrixWorld.elements;
      _normalWorld.getNormalMatrix(mesh.matrixWorld);
      const q = _normalWorld.elements;
      // each triangle's world centre, normal and area, and its cluster
      const centres = new Float64Array(triangles * 3), normals = new Float64Array(triangles * 3), faces = new Float64Array(triangles * 3);
      const areas = new Float64Array(triangles);
      const roots = new Int32Array(triangles);
      for (let t = 0; t < triangles; t++) {
        const i0 = corner(t, 0) * 3, i1 = corner(t, 1) * 3, i2 = corner(t, 2) * 3;
        // the local centre and edges, then the world (the matrix is affine: a centre maps as a point, edges as vectors)
        const lx = (p[i0] + p[i1] + p[i2]) / 3, ly = (p[i0 + 1] + p[i1 + 1] + p[i2 + 1]) / 3, lz = (p[i0 + 2] + p[i1 + 2] + p[i2 + 2]) / 3;
        centres[t * 3] = m[0] * lx + m[4] * ly + m[8] * lz + m[12];
        centres[t * 3 + 1] = m[1] * lx + m[5] * ly + m[9] * lz + m[13];
        centres[t * 3 + 2] = m[2] * lx + m[6] * ly + m[10] * lz + m[14];
        const bx = p[i1] - p[i0], by = p[i1 + 1] - p[i0 + 1], bz = p[i1 + 2] - p[i0 + 2];
        const cx = p[i2] - p[i0], cy = p[i2 + 1] - p[i0 + 1], cz = p[i2 + 2] - p[i0 + 2];
        _b.set(m[0] * bx + m[4] * by + m[8] * bz, m[1] * bx + m[5] * by + m[9] * bz, m[2] * bx + m[6] * by + m[10] * bz);
        _c.set(m[0] * cx + m[4] * cy + m[8] * cz, m[1] * cx + m[5] * cy + m[9] * cz, m[2] * cx + m[6] * cy + m[10] * cz);
        _normal.crossVectors(_b, _c);
        areas[t] = _normal.length() / 2;
        if (areas[t] > 0) { faces[t * 3] = _normal.x / (2 * areas[t]); faces[t * 3 + 1] = _normal.y / (2 * areas[t]); faces[t * 3 + 2] = _normal.z / (2 * areas[t]); }
        if (n) {
          const nx = n[i0] + n[i1] + n[i2], ny = n[i0 + 1] + n[i1 + 1] + n[i2 + 1], nz = n[i0 + 2] + n[i1 + 2] + n[i2 + 2];
          _normal.set(q[0] * nx + q[3] * ny + q[6] * nz, q[1] * nx + q[4] * ny + q[7] * nz, q[2] * nx + q[5] * ny + q[8] * nz);
        }
        const length = _normal.length();
        if (length > 1e-8) _normal.multiplyScalar(1 / length);
        normals[t * 3] = _normal.x; normals[t * 3 + 1] = _normal.y; normals[t * 3 + 2] = _normal.z;
        roots[t] = find(parent, t);
        if (spend(1)) { yield; sliceStarted = performance.now(); }
      }
      // the triangles in cluster order (a counting sort on the root triangle)
      const starts = new Int32Array(triangles + 1);
      for (let t = 0; t < triangles; t++) starts[roots[t] + 1]++;
      for (let v = 0; v < triangles; v++) starts[v + 1] += starts[v];
      const order = new Int32Array(triangles), fill = starts.slice(0, triangles);
      for (let t = 0; t < triangles; t++) order[fill[roots[t]]++] = t;
      if (spend(triangles >> 3)) { yield; sliceStarted = performance.now(); }
      const cast = (t: number, weight: number): void => {
        const slot = vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
          _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) + 3;
        if (tally[slot] === 0) touched.push(slot);
        tally[slot] += weight;
        stats.votes++;
      };
      // a cluster with no majority, by part: a small one whole on its plurality (a dome, a hatch); a large one (a welded
      // casting) split at its creases, each piece voting on all its triangles and taking its majority, or its plurality
      // when it is small; a piece still split keeps the per-point score
      function* resolveParts(start: number, end: number, total: number): Generator<void, void, void> {
        const count = end - start;
        const tv = new Int16Array(count);
        for (let k = 0; k < count; k++) {
          const t = order[start + k];
          tv[k] = areas[t] > 0 ? vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
            _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) : VOTE_NONE;
          if (spend(4)) { yield; sliceStarted = performance.now(); }
        }
        stats.votes += count;
        const part = new Int32Array(count);
        let parts = 1;
        if (total >= SMALL_PART_M2 && !indexed) {
          part.fill(-1);
          parts = 0;
          // the triangles across each welded edge, then the pieces a crease bounds
          const edges = new Map<number, number>(), across = new Int32Array(count * 3).fill(-1), span = position.count;
          for (let k = 0; k < count; k++) {
            const t = order[start + k];
            for (let e = 0; e < 3; e++) {
              const a = canon[corner(t, e)], b = canon[corner(t, (e + 1) % 3)];
              const key = a < b ? a * span + b : b * span + a;
              const other = edges.get(key);
              if (other === undefined) edges.set(key, k * 3 + e);
              else { across[k * 3 + e] = Math.floor(other / 3); across[other] = k; }
            }
          }
          const stack: number[] = [];
          for (let k = 0; k < count; k++) {
            if (part[k] >= 0) continue;
            part[k] = parts;
            stack.push(k);
            while (stack.length) {
              const j = stack.pop()!, tj = order[start + j] * 3;
              for (let e = 0; e < 3; e++) {
                const o = across[j * 3 + e];
                if (o < 0 || part[o] >= 0) continue;
                const to = order[start + o] * 3;
                if (faces[tj] * faces[to] + faces[tj + 1] * faces[to + 1] + faces[tj + 2] * faces[to + 2] < CREASE_DOT) continue;
                part[o] = parts;
                stack.push(o);
              }
            }
            parts++;
          }
        }
        // each piece in turn (a counting sort on its number), its area by vote
        const first = new Int32Array(parts + 1);
        for (let k = 0; k < count; k++) first[part[k] + 1]++;
        for (let k = 0; k < parts; k++) first[k + 1] += first[k];
        const inPart = new Int32Array(count), at = first.slice(0, parts);
        for (let k = 0; k < count; k++) inPart[at[part[k]]++] = k;
        for (let piece = 0; piece < parts; piece++) {
          touched.length = 0;
          let voted = 0;
          for (let i = first[piece]; i < first[piece + 1]; i++) {
            const k = inPart[i], area = areas[order[start + k]];
            if (!(area > 0)) continue;
            const slot = tv[k] + 3;
            if (tally[slot] === 0) touched.push(slot);
            tally[slot] += area;
            voted += area;
          }
          let top = VOTE_NONE, topArea = -1;
          for (const slot of touched) {
            const key = slot - 3, area = tally[slot];
            if (area > topArea || (area === topArea && key > top)) { top = key; topArea = area; }
            tally[slot] = 0;
          }
          // a piece is never baked bare here: a collar round the bore whose barrel share wins keeps the per-point score,
          // which leaves only the barrel's cylinder bare (the round-5 critic: the ZTZ-99A's collar untinted)
          let value = voted > 0 && topArea >= PANEL_MAJORITY * voted && top >= 0 && top < 127 ? top + 1 : 0;
          if (value === 0 && voted < SMALL_PART_M2 && top >= 0 && top < 127 && topArea >= PLURALITY * voted) value = top + 1;
          const kept = first[piece + 1] - first[piece];
          if (value !== 0) { if (parts > 1) stats.creaseParts++; else stats.wholeParts++; }
          if (value > 0) stats.baked += kept; else if (value === PANEL_BARE) stats.bare += kept;
          else {
            stats.perPoint += kept;
            if (top === VOTE_LIVE) stats.perPointLive += kept;
            else if (top === VOTE_NONE) stats.perPointNone += kept;
            else stats.perPointSplit += kept;
          }
          if (value === 0) continue;
          for (let i = first[piece]; i < first[piece + 1]; i++) {
            const t = order[start + inPart[i]];
            values[corner(t, 0)] = value; values[corner(t, 1)] = value; values[corner(t, 2)] = value;
          }
        }
      }
      // per cluster: a flat one votes once at its area-weighted centre, a curved one on an even stride of its triangles;
      // the largest vote wins if it holds PANEL_MAJORITY of the area voted
      for (let start = 0; start < triangles;) {
        const cluster = roots[order[start]];
        let end = start;
        while (end < triangles && roots[order[end]] === cluster) end++;
        const first = order[start];
        let flat = true, total = 0, cx = 0, cy = 0, cz = 0;
        for (let k = start; k < end; k++) {
          const t = order[k], area = areas[t];
          total += area;
          cx += centres[t * 3] * area; cy += centres[t * 3 + 1] * area; cz += centres[t * 3 + 2] * area;
          if (flat && normals[t * 3] * normals[first * 3] + normals[t * 3 + 1] * normals[first * 3 + 1]
            + normals[t * 3 + 2] * normals[first * 3 + 2] < FLAT_DOT) flat = false;
        }
        touched.length = 0;
        let voted = 0;
        if (total > 0 && flat && end - start > FLAT_SAMPLED) {
          const slot = vote(template, split, pose, barrel, mode, owner, _centre.set(cx / total, cy / total, cz / total),
            _normal.set(normals[first * 3], normals[first * 3 + 1], normals[first * 3 + 2])) + 3;
          touched.push(slot);
          tally[slot] = voted = total;
          stats.votes++;
        } else if (total > 0 && flat) {
          // a small flat panel (a box's face, a mantlet's front) by its area: three points a triangle, halfway from its
          // centre to each corner, so the barrel's bare cylinder takes the face only if it covers most of it
          for (let k = start; k < end; k++) {
            const t = order[k];
            if (!(areas[t] > 0)) continue;
            for (let c = 0; c < 3; c++) {
              const v = corner(t, c) * 3;
              _world.set(p[v], p[v + 1], p[v + 2]).applyMatrix4(mesh.matrixWorld);
              _centre.set((centres[t * 3] + _world.x) / 2, (centres[t * 3 + 1] + _world.y) / 2, (centres[t * 3 + 2] + _world.z) / 2);
              const slot = vote(template, split, pose, barrel, mode, owner, _centre,
                _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) + 3;
              if (tally[slot] === 0) touched.push(slot);
              tally[slot] += areas[t] / 3;
              stats.votes++;
            }
            voted += areas[t];
          }
        } else if (total > 0) {
          const stride = Math.max(1, Math.ceil((end - start) / MAX_VOTES));
          for (let k = start; k < end; k += stride) { const t = order[k]; if (areas[t] > 0) { cast(t, areas[t]); voted += areas[t]; } }
        }
        let top = VOTE_NONE, topArea = -1;
        for (const slot of touched) {
          const key = slot - 3, area = tally[slot];
          if (area > topArea || (area === topArea && key > top)) { top = key; topArea = area; }
          tally[slot] = 0;
        }
        const value = voted > 0 && topArea >= PANEL_MAJORITY * voted && top !== VOTE_LIVE && top !== VOTE_NONE && top < 127
          ? top === VOTE_BARE ? PANEL_BARE : top + 1 : 0;
        const kept = end - start;
        stats.clusters++;
        if (value === 0 && voted > 0 && top !== VOTE_LIVE) {
          yield* resolveParts(start, end, total);
          start = end;
          continue;
        }
        if (value > 0) stats.baked += kept; else if (value === PANEL_BARE) stats.bare += kept;
        else {
          stats.perPoint += kept;
          if (top === VOTE_LIVE) stats.perPointLive += kept;
          else if (top === VOTE_NONE) stats.perPointNone += kept;
          else stats.perPointSplit += kept;
        }
        if (value !== 0) {
          for (let k = start; k < end; k++) {
            const t = order[k];
            values[corner(t, 0)] = value; values[corner(t, 1)] = value; values[corner(t, 2)] = value;
          }
        }
        start = end;
        if (spend(flat ? kept * (kept > FLAT_SAMPLED ? 1 : 3) : Math.min(kept, MAX_VOTES) * 4)) { yield; sliceStarted = performance.now(); }
      }
      if (measureDisagreement) {
        for (let t = 0; t < triangles; t++) {
          const value = values[corner(t, 0)];
          if (areas[t] > 0) stats.paintedArea += areas[t];
          if (!(value > 0) || !(areas[t] > 0)) continue;
          const zone = vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
            _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2]), true);
          stats.bakedArea += areas[t];
          panelSink?.({
            x: centres[t * 3], y: centres[t * 3 + 1], z: centres[t * 3 + 2],
            nx: normals[t * 3], ny: normals[t * 3 + 1], nz: normals[t * 3 + 2],
            area: areas[t], part: `${mesh.name || mesh.parent?.name || 'mesh'}#${roots[t]}`,
            panel: plateName(template.zones[value - 1]), point: zone >= 0 ? plateName(template.zones[zone]) : null,
          });
          if (zone !== value - 1) {
            stats.disagreeArea += areas[t];
            if (zone < 0) stats.disagreeBare += areas[t];
            else if ((zone >= template.hullZones) !== (value - 1 >= template.hullZones)) stats.disagreeFrame += areas[t];
            else stats.disagreeZone += areas[t];
          }
          if (spend(4)) { yield; sliceStarted = performance.now(); }
        }
      }
    }
    // into the attribute the build seeded (tankFactoryCore seedArmorPaintPanels), else a new one
    const seeded = geometry.getAttribute(PANEL_ZONE_ATTRIBUTE) as THREE.BufferAttribute | undefined;
    if (seeded && seeded.count === position.count && seeded.array instanceof Int8Array) {
      seeded.array.set(values);
      seeded.needsUpdate = true;
    } else geometry.setAttribute(PANEL_ZONE_ATTRIBUTE, new THREE.BufferAttribute(values, 1, false));
    bakedBy.set(geometry, sharedElsewhere ? null : armor);
  }
  const took = performance.now() - sliceStarted;
  stats.sliceMs = Math.max(stats.sliceMs, Math.round(took * 10) / 10);
  stats.ms = Math.round((stats.ms + took) * 10) / 10;
  return stats;
}

/** An empty tally for bakePaintPanelSteps. */
export function panelBakeStats(): PanelBakeStats {
  return { draws: 0, geometries: 0, triangles: 0, baked: 0, bare: 0, perPoint: 0, shared: 0, perPointSplit: 0, perPointLive: 0, perPointNone: 0, wholeParts: 0, creaseParts: 0, paintedArea: 0, bakedArea: 0, disagreeBare: 0, disagreeFrame: 0, disagreeZone: 0,
    disagreeArea: 0, clusters: 0, votes: 0, ms: 0, slices: 0, sliceMs: 0 };
}

/** The whole bake at once (tools and receipts). */
export function bakePaintPanels(root: THREE.Object3D, template: PanelTemplate, frames: PanelFrames, armor: object): PanelBakeStats {
  const work = bakePaintPanelSteps(root, template, frames, armor, panelBakeStats());
  for (;;) { const next = work.next(); if (next.done) return next.value; }
}
