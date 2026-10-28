// The armour paint by panel (263). The per-point score (vehicles/materials.ts ARMOR_PAINT, sim/armorZones.ts) draws a
// zone border as a straight line wherever two plates' scores meet, and after 262's five blind rounds the one defect the
// critics still named was that line crossing a part: a diagonal through an ERA tile, a stair down a turret wedge, a cut
// across a skirt panel. Here every connected triangle cluster of a painted draw — the triangles that share its vertices:
// a box's face, a tile, a panel — takes one zone, the area-weighted majority of that same score over its triangles,
// written as the vertex attribute apZone (the zone + 1; PANEL_BARE for gear left bare; 0 the per-point score, as before),
// so a border falls on a panel's edge. A cluster whose triangles split between zones (a welded casting across its cheek
// and its roof) keeps the per-point score, and so does whatever the turret's yaw or the gun's elevation could move into
// another frame: a hull part under the turret's envelope, a turret part near the barrel.
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
/** Each template's hull and turret zones apart (zoneAt takes one frame's), and the cylinder the turret's yaw sweeps its
 * envelope and footprints over, in the turret's frame. */
interface FrameZones {
  readonly hull: ZonePlate[];
  readonly turret: ZonePlate[];
  readonly sweepMinY: number;
  readonly sweepMaxY: number;
  readonly sweepR2: number;
}
const frameZones = new WeakMap<PanelTemplate, FrameZones>();
function frameZonesOf(template: PanelTemplate): FrameZones {
  let split = frameZones.get(template);
  if (split) return split;
  const turret = template.zones.slice(template.hullZones);
  let minY = template.turretMin.y, maxY = template.turretMax.y, r2 = 0;
  const reach = (x: number, z: number) => { r2 = Math.max(r2, x * x + z * z); };
  const boxes: Array<[readonly number[], readonly number[]]> = [[template.turretMin.toArray(), template.turretMax.toArray()]];
  for (const zone of turret) if (zone.footprint) boxes.push([zone.footprint.min, zone.footprint.max]);
  for (const [min, max] of boxes) {
    if (!(max[0] >= min[0])) continue;
    minY = Math.min(minY, min[1]); maxY = Math.max(maxY, max[1]);
    for (const x of [min[0], max[0]]) for (const z of [min[2], max[2]]) reach(x, z);
  }
  split = { hull: template.zones.slice(0, template.hullZones), turret, sweepMinY: minY, sweepMaxY: maxY, sweepR2: r2 };
  frameZones.set(template, split);
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
 * zoneAt, the mantlet's footprint first). Returns a vote; VOTE_LIVE where the pose decides (the turret's yaw, the gun's
 * elevation), so the bake leaves it to the per-point score.
 */
function vote(template: PanelTemplate, split: FrameZones, pose: PanelPose, barrel: boolean, mode: number,
  owner: Owner, world: THREE.Vector3, normalWorld: THREE.Vector3): number {
  const zones = template.zones, hullN = template.hullZones;
  const t = _t.copy(world).applyMatrix4(pose.turretInv);
  // a hull part the turret's yaw can sweep its envelope over (yaw turns about the turret frame's y: a point's height and
  // radius there stand still) is judged live
  if (owner === 'hull' && zones.length > hullN && t.y >= split.sweepMinY && t.y <= split.sweepMaxY
    && t.x * t.x + t.z * t.z <= split.sweepR2) return VOTE_LIVE;
  let turret = zones.length > hullN && t.x >= template.turretMin.x && t.y >= template.turretMin.y && t.z >= template.turretMin.z
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
    if (owner === 'gun' && g.z > template.barrelFrom && r2 < template.barrelRadius * template.barrelRadius) return VOTE_BARE;
    if (owner === 'turret' && g.z > template.barrelFrom - 0.1 && r2 < (template.barrelRadius + 0.1) ** 2) return VOTE_LIVE;
  }
  // what rides the turret or the gun is the turret's armour wherever it stands: a mantlet ahead of the turret's
  // envelope, an ERA cheek's tip past it (the per-point paint judges them in the hull's frame, above the hull's cells,
  // and leaves them bare behind a hard line: the critics' first defect); they turn with the turret, so no pose decides
  if (owner !== 'hull' && zones.length > hullN) turret = true;
  if (turret && owner === 'hull') return VOTE_LIVE;
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

function find(parent: Int32Array, v: number): number {
  while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; }
  return v;
}
function union(parent: Int32Array, a: number, b: number): void {
  const ra = find(parent, a), rb = find(parent, b);
  if (ra !== rb) parent[ra < rb ? rb : ra] = ra < rb ? ra : rb;
}

/** Positions weld on a 0.2 mm grid (a key per cell), normals within ~2.5°. */
const WELD_PER_M = 5000;
const WELD_SPAN = 131072;
const WELD_NORMAL_DOT = 0.999;
/** A cluster whose normals all lie within ~1.8° of its first is flat: one vote at its area-weighted centre. */
const FLAT_DOT = 0.9995;
/** A curved cluster votes on at most this many of its triangles (an even stride). */
const MAX_VOTES = 32;
/** A flat cluster of at most this many triangles votes on three points a triangle; a larger one once at its centre. */
const FLAT_SAMPLED = 8;

/** A three-component attribute's values as a plain array (a copy when it is interleaved or normalized). */
function plain(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined): ArrayLike<number> | null {
  if (!attribute) return null;
  const direct = attribute as THREE.BufferAttribute;
  if (!(attribute as THREE.InterleavedBufferAttribute).isInterleavedBufferAttribute && !direct.normalized && direct.itemSize === 3) return direct.array;
  const out = new Float32Array(attribute.count * 3);
  for (let v = 0; v < attribute.count; v++) { out[v * 3] = attribute.getX(v); out[v * 3 + 1] = attribute.getY(v); out[v * 3 + 2] = attribute.getZ(v); }
  return out;
}

/** Each vertex's cluster: by the index, and for a soup without one (the merged buckets), by a welded position and normal;
 * a yield every SLICE_TRIANGLES triangles' worth. */
function* clusters(geometry: THREE.BufferGeometry): Generator<void, { parent: Int32Array; triangles: number; corner: (t: number, k: number) => number }, void> {
  const position = geometry.getAttribute('position');
  const index = geometry.index;
  const count = position.count;
  const parent = new Int32Array(count);
  for (let v = 0; v < count; v++) parent[v] = v;
  const triangles = Math.floor((index ? index.count : count) / 3);
  const corner = index ? (t: number, k: number) => index.getX(t * 3 + k) : (t: number, k: number) => t * 3 + k;
  if (!index) {
    const p = plain(position)!, n = plain(geometry.getAttribute('normal'));
    const heads = new Map<number, number>();
    const next = new Int32Array(count).fill(-1);
    const half = WELD_SPAN / 2;
    for (let v = 0; v < count; v++) {
      const key = ((Math.round(p[v * 3] * WELD_PER_M) + half) * WELD_SPAN + Math.round(p[v * 3 + 1] * WELD_PER_M) + half)
        * WELD_SPAN + Math.round(p[v * 3 + 2] * WELD_PER_M) + half;
      const head = heads.get(key);
      let match = -1;
      for (let w = head ?? -1; w >= 0; w = next[w]) {
        if (!n || n[w * 3] * n[v * 3] + n[w * 3 + 1] * n[v * 3 + 1] + n[w * 3 + 2] * n[v * 3 + 2] > WELD_NORMAL_DOT) {
          match = w;
          break;
        }
      }
      if (match >= 0) union(parent, match, v);
      else { next[v] = head ?? -1; heads.set(key, v); }
      if (v % (SLICE_TRIANGLES * 3) === SLICE_TRIANGLES * 3 - 1) yield;
    }
  }
  for (let t = 0; t < triangles; t++) {
    const a = corner(t, 0);
    union(parent, a, corner(t, 1));
    union(parent, a, corner(t, 2));
    if (t % (SLICE_TRIANGLES * 4) === SLICE_TRIANGLES * 4 - 1) yield;
  }
  return { parent, triangles, corner };
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
      const { parent, triangles, corner } = welded.value;
      stats.triangles += triangles;
      const mode = armorPaintMode(mesh.material as THREE.Material);
      const owner = ownerOf(mesh, frames);
      const p = plain(position)!, n = plain(geometry.getAttribute('normal'));
      const m = mesh.matrixWorld.elements;
      _normalWorld.getNormalMatrix(mesh.matrixWorld);
      const q = _normalWorld.elements;
      // each triangle's world centre, normal and area, and its cluster
      const centres = new Float64Array(triangles * 3), normals = new Float64Array(triangles * 3);
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
        if (n) {
          const nx = n[i0] + n[i1] + n[i2], ny = n[i0 + 1] + n[i1 + 1] + n[i2 + 1], nz = n[i0 + 2] + n[i1 + 2] + n[i2 + 2];
          _normal.set(q[0] * nx + q[3] * ny + q[6] * nz, q[1] * nx + q[4] * ny + q[7] * nz, q[2] * nx + q[5] * ny + q[8] * nz);
        }
        const length = _normal.length();
        if (length > 1e-8) _normal.multiplyScalar(1 / length);
        normals[t * 3] = _normal.x; normals[t * 3 + 1] = _normal.y; normals[t * 3 + 2] = _normal.z;
        roots[t] = find(parent, i0 / 3);
        if (spend(1)) { yield; sliceStarted = performance.now(); }
      }
      // the triangles in cluster order (a counting sort on the root vertex)
      const starts = new Int32Array(position.count + 1);
      for (let t = 0; t < triangles; t++) starts[roots[t] + 1]++;
      for (let v = 0; v < position.count; v++) starts[v + 1] += starts[v];
      const order = new Int32Array(triangles), fill = starts.slice(0, position.count);
      for (let t = 0; t < triangles; t++) order[fill[roots[t]]++] = t;
      if (spend(triangles >> 3)) { yield; sliceStarted = performance.now(); }
      const cast = (t: number, weight: number): void => {
        const slot = vote(template, split, pose, barrel, mode, owner, _centre.set(centres[t * 3], centres[t * 3 + 1], centres[t * 3 + 2]),
          _normal.set(normals[t * 3], normals[t * 3 + 1], normals[t * 3 + 2])) + 3;
        if (tally[slot] === 0) touched.push(slot);
        tally[slot] += weight;
        stats.votes++;
      };
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
        if (value > 0) stats.baked += kept; else if (value === PANEL_BARE) stats.bare += kept; else stats.perPoint += kept;
        if (value !== 0) {
          for (let k = start; k < end; k++) {
            const t = order[k];
            values[corner(t, 0)] = value; values[corner(t, 1)] = value; values[corner(t, 2)] = value;
          }
        }
        start = end;
        if (spend(flat ? kept * (kept > FLAT_SAMPLED ? 1 : 3) : Math.min(kept, MAX_VOTES) * 4)) { yield; sliceStarted = performance.now(); }
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
  return { draws: 0, geometries: 0, triangles: 0, baked: 0, bare: 0, perPoint: 0, shared: 0, clusters: 0, votes: 0, ms: 0, slices: 0, sliceMs: 0 };
}

/** The whole bake at once (tools and receipts). */
export function bakePaintPanels(root: THREE.Object3D, template: PanelTemplate, frames: PanelFrames, armor: object): PanelBakeStats {
  const work = bakePaintPanelSteps(root, template, frames, armor, panelBakeStats());
  for (;;) { const next = work.next(); if (next.done) return next.value; }
}
