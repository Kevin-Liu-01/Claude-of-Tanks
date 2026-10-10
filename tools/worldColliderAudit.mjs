// World collider audit (the hitbox lane, 2026-10-07; owner: "rock hitboxes are way too big and inaccurate"): does every
// world collider match the geometry a player sees? Built in Node from the same deterministic builders the collision
// shards are captured from (tools/headlessWorldCollision.mjs), so the meshes and the records are the shipped ones.
//
// Two measures, per collider kind and per map:
//   movement  — the collider's 2D footprint against the mesh's horizontal section in the tank-contact band (CONTACT_BAND
//               above the local ground, cell by cell). Phantom area: collider where no solid mesh stands (an invisible
//               wall). Leak area: the object's own mesh where no collider stands (a tank drives through what it sees).
//   shells    — horizontal rays from SHELL_AZIMUTHS directions at SHELL_HEIGHTS (hull to turret heights) across every
//               record: the share that hit the collider but miss every solid mesh on the segment (a shell or a sight line
//               stopped by air), and the share that hit the object's mesh but no collider at all (a shell through stone).
//
// The section is exact for closed and open-bottomed solids: each band slice cuts every triangle into a segment oriented
// by the triangle's normal (the solid on its left), and a cell is inside when the signed crossings on both sides of it
// say so (an open sheet's crossings disagree and fill nothing). Deterministic: no randomness, fixed sampling.
import * as THREE from 'three';
import { pointInsideCollisionRecord, rayCollisionRecord } from '../src/world/collision.ts';

/** The ground a stone's rise is read over, as the settle reads it (rockCollision.ts rockGroundAt; inlined so the audit
 * also measures a tree from before the stones' own colliders): the rendered triangles a hull meets, else the 1 m grid. */
function rockGroundAt(field) {
  if (field.getContactHeightAt) return (x, z) => field.getContactHeightAt(x, z);
  if (field.getHeightAtFast) return (x, z) => field.getHeightAtFast(x, z);
  return (x, z) => field.getHeightAt(x, z);
}

/** The tank-contact band, metres above the local ground (the hull's sides between its track tops and its deck). */
export const CONTACT_BAND = Object.freeze([0.2, 1.4]);
/** Slice spacing through the band (m). */
const SLICE_STEP_M = 0.1;
/** Shell rays: horizontal, at these heights above the ground under the record's centre (hull to turret roof). */
export const SHELL_HEIGHTS = Object.freeze([0.6, 1.0, 1.4, 1.8, 2.2, 2.6]);
export const SHELL_AZIMUTHS = 16;
/** Lateral spacing of the parallel rays of one azimuth (m). */
const SHELL_LANE_M = 0.2;

// ---------------------------------------------------------------------------------------------- triangle soup

/** World-space triangles in a 2D bucket grid, each tagged with a family and a source (one mesh instance). */
export class TriangleSoup {
  constructor(cellSize = 4) {
    this.cell = cellSize;
    this.inv = 1 / cellSize;
    this.xyz = new Float32Array(9 * 4096);
    this.family = new Uint16Array(4096);
    this.source = new Int32Array(4096);
    this.count = 0;
    this.cells = new Map();
    this.families = [];
    this.familyIndex = new Map();
    this.sources = [];
    this._stamp = new Uint32Array(0);
    this._stampValue = 0;
  }

  familyId(name) {
    let id = this.familyIndex.get(name);
    if (id === undefined) { id = this.families.length; this.families.push(name); this.familyIndex.set(name, id); }
    return id;
  }

  /** Register one source (a mesh or one instance); returns its id. */
  addSource(info) {
    this.sources.push({ ...info, first: this.count, tris: 0, min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
    return this.sources.length - 1;
  }

  _grow() {
    const size = this.family.length * 2;
    const xyz = new Float32Array(size * 9); xyz.set(this.xyz); this.xyz = xyz;
    const family = new Uint16Array(size); family.set(this.family); this.family = family;
    const source = new Int32Array(size); source.set(this.source); this.source = source;
  }

  push(ax, ay, az, bx, by, bz, cx, cy, cz, family, sourceId) {
    if (this.count >= this.family.length) this._grow();
    const t = this.count++;
    const o = t * 9;
    const d = this.xyz;
    d[o] = ax; d[o + 1] = ay; d[o + 2] = az; d[o + 3] = bx; d[o + 4] = by; d[o + 5] = bz; d[o + 6] = cx; d[o + 7] = cy; d[o + 8] = cz;
    this.family[t] = family;
    this.source[t] = sourceId;
    const src = this.sources[sourceId];
    src.tris++;
    const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx), minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
    const minY = Math.min(ay, by, cy), maxY = Math.max(ay, by, cy);
    if (minX < src.min[0]) src.min[0] = minX; if (maxX > src.max[0]) src.max[0] = maxX;
    if (minY < src.min[1]) src.min[1] = minY; if (maxY > src.max[1]) src.max[1] = maxY;
    if (minZ < src.min[2]) src.min[2] = minZ; if (maxZ > src.max[2]) src.max[2] = maxZ;
    const x0 = Math.floor(minX * this.inv), x1 = Math.floor(maxX * this.inv);
    const z0 = Math.floor(minZ * this.inv), z1 = Math.floor(maxZ * this.inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const key = (x + 32768) * 65536 + (z + 32768);
      let list = this.cells.get(key);
      if (!list) { list = []; this.cells.set(key, list); }
      list.push(t);
    }
  }

  /** Triangle ids whose bucket overlaps the box, optionally only of the given families / sources. */
  query(minX, minZ, maxX, maxZ, accept = null) {
    if (this._stamp.length < this.count) { this._stamp = new Uint32Array(this.family.length); this._stampValue = 0; }
    const stamp = ++this._stampValue;
    const out = [];
    const x0 = Math.floor(minX * this.inv), x1 = Math.floor(maxX * this.inv);
    const z0 = Math.floor(minZ * this.inv), z1 = Math.floor(maxZ * this.inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const list = this.cells.get((x + 32768) * 65536 + (z + 32768));
      if (!list) continue;
      for (const t of list) {
        if (this._stamp[t] === stamp) continue;
        this._stamp[t] = stamp;
        if (accept && !accept(t)) continue;
        out.push(t);
      }
    }
    return out;
  }
}

const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();

/** Add a mesh's world triangles (every instance of an InstancedMesh up to its count) to the soup. */
export function addMeshTriangles(soup, mesh, family, sourceInfo = {}) {
  const geometry = mesh.geometry;
  const position = geometry?.attributes?.position;
  if (!position) return [];
  const index = geometry.index;
  const corners = index ? index.count : position.count;
  const familyId = soup.familyId(family);
  const instances = mesh.isInstancedMesh ? mesh.count : 1;
  const world = new Float32Array(position.count * 3);
  const ids = [];
  // (forced: three r185 refreshes a matrixWorld only when it is flagged stale, and a mesh with matrixAutoUpdate off never is)
  mesh.updateWorldMatrix(true, false, true);
  for (let instance = 0; instance < instances; instance++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(instance, _mi); _m.multiplyMatrices(mesh.matrixWorld, _mi); } else _m.copy(mesh.matrixWorld);
    for (let v = 0; v < position.count; v++) {
      _v.fromBufferAttribute(position, v).applyMatrix4(_m);
      world[v * 3] = _v.x; world[v * 3 + 1] = _v.y; world[v * 3 + 2] = _v.z;
    }
    const sourceId = soup.addSource({ family, mesh: mesh.name, instance, matrix: mesh.isInstancedMesh ? _mi.clone() : null, ...sourceInfo });
    for (let c = 0; c + 2 < corners; c += 3) {
      const a = index ? index.getX(c) : c, b = index ? index.getX(c + 1) : c + 1, d = index ? index.getX(c + 2) : c + 2;
      soup.push(world[a * 3], world[a * 3 + 1], world[a * 3 + 2], world[b * 3], world[b * 3 + 1], world[b * 3 + 2],
        world[d * 3], world[d * 3 + 1], world[d * 3 + 2], familyId, sourceId);
    }
    ids.push(sourceId);
  }
  return ids;
}

// ---------------------------------------------------------------------------------------------- the band section

/** A raster over [x0, x0 + nx h] x [z0, z0 + nz h]; cell centres at half steps. */
export function makeRegion(minX, minZ, maxX, maxZ, h) {
  const nx = Math.max(1, Math.ceil((maxX - minX) / h)), nz = Math.max(1, Math.ceil((maxZ - minZ) / h));
  return { x0: minX, z0: minZ, nx, nz, h };
}

/** Ground heights at the region's cell centres. */
export function regionGround(region, groundAt) {
  const { x0, z0, nx, nz, h } = region;
  const g = new Float64Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) g[j * nx + i] = groundAt(x0 + (i + 0.5) * h, z0 + (j + 0.5) * h);
  return g;
}

/**
 * Cells of the region where the solid bounded by the triangles occupies some height in [ground + band[0], ground +
 * band[1]]: the union of the band's horizontal sections. Slices every SLICE_STEP_M; each triangle the slice plane cuts
 * gives a segment with the solid on its left (from the triangle's normal); a cell is inside a slice when the signed
 * crossings of its row to its left and to its right are both nonzero (closed loops agree; an open sheet fills nothing).
 */
export function sectionRaster(region, ground, band, soup, triangles, out = null) {
  const { x0, z0, nx, nz, h } = region;
  const occupied = out ?? new Uint8Array(nx * nz);
  if (!triangles.length) return occupied;
  let gMin = Infinity, gMax = -Infinity;
  for (let k = 0; k < ground.length; k++) { if (ground[k] < gMin) gMin = ground[k]; if (ground[k] > gMax) gMax = ground[k]; }
  // the triangles' own vertical range bounds the slices too
  const d = soup.xyz;
  let tMin = Infinity, tMax = -Infinity;
  for (const t of triangles) {
    const o = t * 9;
    tMin = Math.min(tMin, d[o + 1], d[o + 4], d[o + 7]); tMax = Math.max(tMax, d[o + 1], d[o + 4], d[o + 7]);
  }
  const yStart = Math.max(gMin + band[0], tMin), yEnd = Math.min(gMax + band[1], tMax);
  if (!(yEnd >= yStart)) return occupied;
  // slices every SLICE_STEP_M at most, the first and the last a hair inside the range (a solid's top or the band's edge
  // is sampled, not missed by a step)
  const steps = Math.max(1, Math.ceil((yEnd - yStart) / SLICE_STEP_M));
  const rows = Array.from({ length: nz }, () => []);
  for (let k = 0; k <= steps; k++) {
    // (an irrational offset keeps the plane off the vertices' heights)
    const Y = Math.min(yEnd - 1.234567e-5, Math.max(yStart + 1.234567e-5, yStart + ((yEnd - yStart) * k) / steps));
    for (const row of rows) row.length = 0;
    let any = false;
    for (const t of triangles) {
      const o = t * 9;
      const ay = d[o + 1], by = d[o + 4], cy = d[o + 7];
      const sa = ay >= Y, sb = by >= Y, sc = cy >= Y;
      if (sa === sb && sb === sc) continue;
      // the two edges the plane crosses
      let px = 0, pz = 0, qx = 0, qz = 0, n = 0;
      const edge = (ux, uy, uz, vx, vy, vz) => {
        const f = (Y - uy) / (vy - uy), x = ux + (vx - ux) * f, z = uz + (vz - uz) * f;
        if (n === 0) { px = x; pz = z; } else { qx = x; qz = z; }
        n++;
      };
      if (sa !== sb) edge(d[o], ay, d[o + 2], d[o + 3], by, d[o + 5]);
      if (sb !== sc) edge(d[o + 3], by, d[o + 5], d[o + 6], cy, d[o + 8]);
      if (sc !== sa) edge(d[o + 6], cy, d[o + 8], d[o], ay, d[o + 2]);
      if (n !== 2) continue;
      // the triangle's normal, horizontal part: the solid lies to the left of the segment's direction
      const e1x = d[o + 3] - d[o], e1y = by - ay, e1z = d[o + 5] - d[o + 2];
      const e2x = d[o + 6] - d[o], e2y = cy - ay, e2z = d[o + 8] - d[o + 2];
      const nX = e1y * e2z - e1z * e2y, nZ = e1x * e2y - e1y * e2x;
      let dx = qx - px, dz = qz - pz;
      if (nX * dz - nZ * dx < 0) { const sx = px, sz = pz; px = qx; pz = qz; qx = sx; qz = sz; dx = -dx; dz = -dz; }
      if (Math.abs(dz) < 1e-12) continue;
      const sign = dz > 0 ? 1 : -1;
      const lo = Math.min(pz, qz), hi = Math.max(pz, qz);
      let j0 = Math.ceil((lo - z0) / h - 0.5), j1 = Math.ceil((hi - z0) / h - 0.5) - 1;
      if (j0 < 0) j0 = 0; if (j1 > nz - 1) j1 = nz - 1;
      for (let j = j0; j <= j1; j++) {
        const zc = z0 + (j + 0.5) * h;
        if (zc < lo || zc >= hi) continue;
        rows[j].push(px + (qx - px) * (zc - pz) / (qz - pz), sign);
        any = true;
      }
    }
    if (!any) continue;
    for (let j = 0; j < nz; j++) {
      const row = rows[j];
      if (!row.length) continue;
      const m = row.length / 2;
      const order = Array.from({ length: m }, (_, i) => i).sort((a, b) => row[a * 2] - row[b * 2]);
      let total = 0;
      for (let i = 0; i < m; i++) total += row[i * 2 + 1];
      let left = 0, c = 0;
      for (let i = 0; i < nx; i++) {
        const xc = x0 + (i + 0.5) * h;
        while (c < m && row[order[c] * 2] < xc) { left += row[order[c] * 2 + 1]; c++; }
        if (left === 0 || total - left === 0) continue;
        const cell = j * nx + i, g = ground[cell];
        if (Y >= g + band[0] && Y <= g + band[1]) occupied[cell] = 1;
      }
    }
  }
  return occupied;
}

// ---------------------------------------------------------------------------------------------- collider rasters

function recordParts(record) {
  const shape = record.shape2;
  if (!shape) return [null];
  return shape.kind === 'compound' ? shape.parts : [shape];
}

/** Cells of the region where the record has a part whose vertical extent overlaps the band. */
export function colliderRaster(region, ground, band, record, out = null) {
  const { x0, z0, nx, nz, h } = region;
  const occupied = out ?? new Uint8Array(nx * nz);
  const parts = recordParts(record);
  const i0 = Math.max(0, Math.floor((record.min[0] - x0) / h)), i1 = Math.min(nx - 1, Math.ceil((record.max[0] - x0) / h));
  const j0 = Math.max(0, Math.floor((record.min[2] - z0) / h)), j1 = Math.min(nz - 1, Math.ceil((record.max[2] - z0) / h));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cell = j * nx + i;
    if (occupied[cell]) continue;
    const x = x0 + (i + 0.5) * h, z = z0 + (j + 0.5) * h, g = ground[cell];
    for (const part of parts) {
      const y0 = part?.y0 ?? record.min[1], y1 = part?.y1 ?? record.max[1];
      if (!(y1 > g + band[0] && y0 < g + band[1])) continue;
      if (pointInsideCollisionRecord(record, part, x, z)) { occupied[cell] = 1; break; }
    }
  }
  return occupied;
}

// ---------------------------------------------------------------------------------------------- rays

/** Nearest hit of a ray on the triangles (Moller-Trumbore, both faces), or -1. */
export function rayTriangles(soup, triangles, ox, oy, oz, dx, dy, dz, maxDistance) {
  const d = soup.xyz;
  let best = maxDistance;
  let hit = false;
  for (const t of triangles) {
    const o = t * 9;
    const e1x = d[o + 3] - d[o], e1y = d[o + 4] - d[o + 1], e1z = d[o + 5] - d[o + 2];
    const e2x = d[o + 6] - d[o], e2y = d[o + 7] - d[o + 1], e2z = d[o + 8] - d[o + 2];
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const tx = ox - d[o], ty = oy - d[o + 1], tz = oz - d[o + 2];
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < 0 || u > 1) continue;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
    if (dist >= 0 && dist < best) { best = dist; hit = true; }
  }
  return hit ? best : -1;
}

const _rayOrigin = new THREE.Vector3();
const _rayDir = new THREE.Vector3();
const _rayNormal = new THREE.Vector3();

/** Nearest hit of a ray on the records (the game's own shell/LOS test), or -1. */
export function rayRecords(records, ox, oy, oz, dx, dy, dz, maxDistance) {
  _rayOrigin.set(ox, oy, oz); _rayDir.set(dx, dy, dz);
  let best = -1;
  for (const record of records) {
    const hit = rayCollisionRecord(_rayOrigin, _rayDir, record, best < 0 ? maxDistance : best, _rayNormal);
    if (hit >= 0 && (best < 0 || hit < best)) best = hit;
  }
  return best;
}

/**
 * Horizontal rays across a footprint centred at (cx, cz) with reach r: SHELL_AZIMUTHS directions, parallel lanes
 * SHELL_LANE_M apart over the reach plus a margin, at SHELL_HEIGHTS above `groundY`. Calls visit(ox, oy, oz, dx, dz, len).
 */
export function forEachShellRay(cx, cz, r, groundY, visit, heights = SHELL_HEIGHTS, azimuths = SHELL_AZIMUTHS) {
  const reach = r + 0.6;
  const lanes = Math.max(1, Math.round((2 * reach) / SHELL_LANE_M));
  for (let a = 0; a < azimuths; a++) {
    const theta = (a / azimuths) * Math.PI * 2 + 0.0731;
    const dx = Math.cos(theta), dz = Math.sin(theta);
    // perpendicular
    const px = -dz, pz = dx;
    for (let lane = 0; lane <= lanes; lane++) {
      const s = -reach + (2 * reach * lane) / lanes;
      const ox = cx + px * s - dx * (reach + 1), oz = cz + pz * s - dz * (reach + 1);
      for (const hgt of heights) visit(ox, groundY + hgt, oz, dx, dz, 2 * (reach + 1));
    }
  }
}

// ---------------------------------------------------------------------------------------------- summaries

export function polygonArea(points) {
  let a = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    a += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return Math.abs(a) * 0.5;
}

export function quantile(values, q) {
  if (!values.length) return 0;
  const sorted = Float64Array.from(values).sort();
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
  return sorted[at];
}

// ---------------------------------------------------------------------------------------------- horizontal slices

/** The 2D segments [px, pz, qx, qz, ...] where the plane y = Y cuts the triangles. */
export function sliceSegments(soup, triangles, Y) {
  const d = soup.xyz;
  const out = [];
  for (const t of triangles) {
    const o = t * 9;
    const ay = d[o + 1], by = d[o + 4], cy = d[o + 7];
    const sa = ay >= Y, sb = by >= Y, sc = cy >= Y;
    if (sa === sb && sb === sc) continue;
    let n = 0;
    const edge = (ux, uy, uz, vx, vy, vz) => {
      const f = (Y - uy) / (vy - uy);
      out.push(ux + (vx - ux) * f, uz + (vz - uz) * f);
      n++;
    };
    if (sa !== sb) edge(d[o], ay, d[o + 2], d[o + 3], by, d[o + 5]);
    if (sb !== sc) edge(d[o + 3], by, d[o + 5], d[o + 6], cy, d[o + 8]);
    if (sc !== sa) edge(d[o + 6], cy, d[o + 8], d[o], ay, d[o + 2]);
    if (n !== 2) out.length -= n * 2;
  }
  return out;
}

/** How close the 2D ray segment (ox, oz) + t (dx, dz), 0 <= t <= len, passes the segments (a ray that misses them). */
export function rayClearance2(segments, ox, oz, dx, dz, len) {
  let best = Infinity;
  const ex = ox + dx * len, ez = oz + dz * len;
  const pointToRay = (px, pz) => {
    const t = Math.max(0, Math.min(len, (px - ox) * dx + (pz - oz) * dz));
    return Math.hypot(ox + dx * t - px, oz + dz * t - pz);
  };
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i], az = segments[i + 1], bx = segments[i + 2], bz = segments[i + 3];
    best = Math.min(best, pointToRay(ax, az), pointToRay(bx, bz));
    // the ray's ends against the segment
    for (const [px, pz] of [[ox, oz], [ex, ez]]) {
      const sx = bx - ax, sz = bz - az, l2 = sx * sx + sz * sz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / l2)) : 0;
      best = Math.min(best, Math.hypot(ax + sx * t - px, az + sz * t - pz));
    }
  }
  return best;
}

/** The span of the 2D ray inside the segments' outline: the last crossing less the first (0 when it crosses none). */
export function rayChord2(segments, ox, oz, dx, dz, len) {
  let first = Infinity, last = -Infinity;
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i], az = segments[i + 1], ex = segments[i + 2] - ax, ez = segments[i + 3] - az;
    const det = dx * ez - dz * ex;
    if (Math.abs(det) < 1e-12) continue;
    const wx = ax - ox, wz = az - oz;
    const t = (wx * ez - wz * ex) / det, s = (wx * dz - wz * dx) / det;
    if (s < 0 || s > 1 || t < 0 || t > len) continue;
    if (t < first) first = t;
    if (t > last) last = t;
  }
  return last > first ? last - first : 0;
}

/** How far a horizontal ray at height y runs before the ground rises over it (len when it never does), marched every
 * 5 cm and bisected; the game's own raycast stops a shell or a sight line at the terrain first. 0 when it starts under. */
export function rayTerrainReach(groundAt, ox, y, oz, dx, dz, len, step = 0.05) {
  if (groundAt(ox, oz) >= y) return 0;
  let prev = 0;
  for (let t = step; t <= len + 1e-9; t += step) {
    if (groundAt(ox + dx * t, oz + dz * t) >= y) {
      let lo = prev, hi = t;
      for (let i = 0; i < 12; i++) {
        const mid = (lo + hi) / 2;
        if (groundAt(ox + dx * mid, oz + dz * mid) >= y) hi = mid; else lo = mid;
      }
      return lo;
    }
    prev = t;
  }
  return len;
}

/** A phantom or a leak counts as visible past this (m): a shell passing a stone by less, or clipping less of it, is not
 * a miss anyone can see. */
export const VISIBLE_RAY_ERROR_M = 0.1;

/** Nearest crossing of the 2D ray (ox, oz) + t (dx, dz), 0 <= t <= len, with the segments, or -1. */
export function raySegments2(segments, ox, oz, dx, dz, len) {
  let best = -1;
  for (let i = 0; i < segments.length; i += 4) {
    const ax = segments[i], az = segments[i + 1], ex = segments[i + 2] - ax, ez = segments[i + 3] - az;
    const det = dx * ez - dz * ex;
    if (Math.abs(det) < 1e-12) continue;
    const wx = ax - ox, wz = az - oz;
    const t = (wx * ez - wz * ex) / det, s = (wx * dz - wz * dx) / det;
    if (s < 0 || s > 1 || t < 0 || t > len) continue;
    if (best < 0 || t < best) best = t;
  }
  return best;
}

// ---------------------------------------------------------------------------------------------- the map audit

const NON_SOLID_MESH = /(-far|-shadow|-broken)$|wires|crop-fields|sandbag-beds|snow-drifts|rock-beds|props-bucket-glass|props-bucket-curtain|baked-pole-distance/;

function visibleChain(object) {
  for (let o = object; o; o = o.parent) if (o.visible === false) return false;
  return true;
}

/** The audit family of a props mesh (null: not a solid a hull or a shell meets — decals, wires, shadows, LOD twins). */
export function classifyPropsMesh(mesh) {
  if (!mesh.isMesh || !visibleChain(mesh)) return null;
  if (mesh.userData?.terrainDecal || mesh.userData?.groundContactDecal) return null;
  const name = mesh.name || '';
  if (!name || NON_SOLID_MESH.test(name)) return null;
  if (/^rock-variant-\d$/.test(name)) return 'boulder';
  if (name === 'props-scenery-rock') return 'scenery-rock';
  if (name.startsWith('props-bucket-')) return 'bucket';
  return name;
}

/** A stone rising less than this over its ground is driven over by design (rockCollision.ts ROCK_DRIVE_OVER_M). */
const DRIVE_OVER_RISE_M = 0.45;

function regionBox(boxes, margin) {
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const b of boxes) {
    if (!b) continue;
    minX = Math.min(minX, b[0]); minZ = Math.min(minZ, b[1]); maxX = Math.max(maxX, b[2]); maxZ = Math.max(maxZ, b[3]);
  }
  return [minX - margin, minZ - margin, maxX + margin, maxZ + margin];
}

function recordBox(record) { return [record.min[0], record.min[2], record.max[0], record.max[2]]; }

/** The movement and shell measures of one object: its own triangles, its records, everything solid around it. */
function measureObject({ soup, field, ownTris, box, obstacle, collider, colliders = null, nearObstacles, nearColliders, solidAccept, rays }) {
  const extent = Math.max(box[2] - box[0], box[3] - box[1]);
  // (cells of about a sixtieth of the object, 5-25 cm: the shares average over hundreds of objects a map)
  const h = Math.min(0.25, Math.max(0.05, extent / 60));
  const region = makeRegion(box[0], box[1], box[2], box[3], h);
  // (the ground a hull meets and the eye sees, as the settle reads it: rockCollision.ts rockGroundAt)
  const groundAt = rockGroundAt(field);
  const ground = regionGround(region, groundAt);
  const allTris = soup.query(box[0], box[1], box[2], box[3], solidAccept);
  const meshAll = sectionRaster(region, ground, CONTACT_BAND, soup, allTris);
  const meshOwn = sectionRaster(region, ground, CONTACT_BAND, soup, ownTris);
  const colliderOwn = obstacle ? colliderRaster(region, ground, CONTACT_BAND, obstacle) : new Uint8Array(region.nx * region.nz);
  const colliderAll = new Uint8Array(region.nx * region.nz);
  for (const record of nearObstacles) if (!record.dead) colliderRaster(region, ground, CONTACT_BAND, record, colliderAll);
  let colliderCells = 0, phantomCells = 0, meshCells = 0, leakCells = 0, coveredCells = 0;
  for (let k = 0; k < meshOwn.length; k++) {
    if (colliderOwn[k]) { colliderCells++; if (!meshAll[k]) phantomCells++; else coveredCells++; }
    if (meshOwn[k]) { meshCells++; if (!colliderAll[k]) leakCells++; }
  }
  const cell = h * h;
  const cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2;
  const groundY = groundAt(cx, cz);
  let meshTop = -Infinity;
  const d = soup.xyz;
  for (const t of ownTris) meshTop = Math.max(meshTop, d[t * 9 + 1], d[t * 9 + 4], d[t * 9 + 7]);
  let meshRise = -Infinity;
  for (const t of ownTris) {
    const o = t * 9;
    for (let c = 0; c < 9; c += 3) meshRise = Math.max(meshRise, d[o + c + 1] - groundAt(d[o + c], d[o + c + 2]));
  }
  const row = {
    x: +cx.toFixed(2), z: +cz.toFixed(2), meshRiseM: meshRise,
    colliderM2: colliderCells * cell, phantomM2: phantomCells * cell, meshM2: meshCells * cell, leakM2: leakCells * cell,
    meshTopM: meshTop - groundY, colliderTopM: obstacle ? obstacle.max[1] - groundY : null,
    shellTopM: collider ? collider.max[1] - groundY : colliders?.length ? Math.max(...colliders.map((r) => r.max[1])) - groundY : null,
  };
  if (!rays) return row;
  // shells: horizontal rays at the shell heights; the triangles cut at each height once
  const reach = Math.max(box[2] - box[0], box[3] - box[1]) / 2 - 0.4;
  let hits = 0, phantom = 0, leak = 0, early = 0, phantomSeen = 0, leakSeen = 0;
  const slices = new Map();
  const cut = (Y) => {
    let s = slices.get(Y);
    if (!s) { s = { own: sliceSegments(soup, ownTris, Y), all: sliceSegments(soup, allTris, Y) }; slices.set(Y, s); }
    return s;
  };
  forEachShellRay(cx, cz, Math.max(0.3, reach), groundY, (ox, oy, oz, dx, dz, full) => {
    // the ray as the game casts it: from its origin to where the terrain first rises over it
    const len = rayTerrainReach(groundAt, ox, oy, oz, dx, dz, full);
    if (len <= 0) return;
    const s = cut(oy);
    const own = raySegments2(s.own, ox, oz, dx, dz, len);
    const c = colliders ? rayRecords(colliders, ox, oy, oz, dx, 0, dz, len) : collider ? rayRecords([collider], ox, oy, oz, dx, 0, dz, len) : -1;
    if (own < 0 && c < 0) return;
    hits++;
    if (c >= 0) {
      const all = raySegments2(s.all, ox, oz, dx, dz, len);
      if (all < 0) {
        phantom++;
        if (rayClearance2(s.all, ox, oz, dx, dz, len) > VISIBLE_RAY_ERROR_M) phantomSeen++;
      } else if (all - c > 0.25) early++;
    }
    if (own >= 0 && rayRecords(nearColliders, ox, oy, oz, dx, 0, dz, len) < 0) {
      leak++;
      if (rayChord2(s.own, ox, oz, dx, dz, len) > VISIBLE_RAY_ERROR_M) leakSeen++;
    }
  }, SHELL_HEIGHTS, SHELL_AZIMUTHS / 2);
  row.rays = hits; row.phantomRays = phantom; row.leakRays = leak; row.earlyRays = early;
  row.phantomRaysSeen = phantomSeen; row.leakRaysSeen = leakSeen;
  return row;
}

/** The rock record a stone's instance carries: the nearest unclaimed kindless or small-rock record whose box holds the
 * stone's centre (the legacy records sat at the stone's seat height; refitted ones keep the seat or the ground line).
 * A stone half buried on a slope stands its exposed stone, and so its record, off its centre (2026-10-08: some of the
 * first audit's 95 "tall stones without a collider" had one): failing the centre, the record over the stone's box
 * that keeps its seat or its top (the stone's own, to the centimetre), or the one nearest `near` (the movement
 * record's centre, for its shell twin). */
function rockRecordAt(grid, claimed, x, y, z, box, near = null, top = null) {
  const cx = (box[0] + box[2]) / 2, cz = (box[1] + box[3]) / 2;
  const pick = (candidates, strict) => {
    let best = null, bestScore = Infinity;
    for (const record of candidates) {
      if (claimed.has(record) || (record.kind !== undefined && record.kind !== 'small-rock') || record.treeIdx != null) continue;
      const shape = record.shape2?.kind;
      if (shape !== 'convex' && shape !== 'compound') continue;
      const seat = Math.abs(record.min[1] - y) < 2e-3 ? 0 : 1;
      const rx = (record.min[0] + record.max[0]) / 2, rz = (record.min[2] + record.max[2]) / 2;
      const away = near ? Math.hypot(rx - near[0], rz - near[1]) : Math.hypot(rx - cx, rz - cz);
      const ownTop = top !== null && Math.abs(record.max[1] - top) < 0.011;
      if (strict && (near ? away > 1 : seat && !ownTop)) continue;
      const score = seat + away;
      if (score < bestScore) { bestScore = score; best = record; }
    }
    return bestScore < 3 ? best : null;
  };
  return pick(grid(x - 0.01, z - 0.01, x + 0.01, z + 0.01, []), false) ?? pick(grid(box[0], box[1], box[2], box[3], []), true);
}

/**
 * Every rock: the boulder instances (with or without a collider) and the scenery's rock masses. On a tree whose stones
 * carry their own colliders (props.ts refitRockColliders), each stone's legacy record survives as the ground cover's
 * cosmetic twin (group.userData.rockGroundCover): it is measured on the same stone as a 'legacy-' row, so one build
 * gives the before and the after of every stone.
 */
function auditRocks({ soup, field, dressing, rays, obstacleGrid, colliderGrid, solidAccept, claimed = new Set(), createObstacleGrid = null, stones: measureStones = true }) {
  const rows = [];
  const twins = dressing.group?.userData?.rockGroundCover ?? [];
  const legacyGrid = twins.length && createObstacleGrid ? createObstacleGrid(twins) : null;
  const legacyClaimed = new Set();
  // the stones in order of their seat height's match first (the legacy records), so a refitted record finds its own
  const stones = soup.sources.filter((source) => source.family === 'boulder' && source.tris);
  for (const source of stones) {
    const e = source.matrix.elements;
    const x = e[12], y = e[13], z = e[14];
    const meshBox = [source.min[0], source.min[2], source.max[0], source.max[2]];
    const obstacle = rockRecordAt(obstacleGrid, claimed, x, y, z, meshBox, null, source.max[1]);
    if (obstacle) claimed.add(obstacle);
    const collider = rockRecordAt(colliderGrid, claimed, x, y, z, meshBox,
      obstacle ? [(obstacle.min[0] + obstacle.max[0]) / 2, (obstacle.min[2] + obstacle.max[2]) / 2] : null);
    if (collider) claimed.add(collider);
    // (the formations alone: the stones' records are claimed, so a boulder by a formation is not read as its mass)
    if (!measureStones) continue;
    const ownTris = [];
    for (let t = source.first; t < source.first + source.tris; t++) ownTris.push(t);
    const box = regionBox([meshBox, obstacle ? recordBox(obstacle) : null, collider ? recordBox(collider) : null], 0.6);
    const nearObstacles = obstacleGrid(box[0], box[1], box[2], box[3], []);
    const nearColliders = colliderGrid(box[0], box[1], box[2], box[3], []);
    const scale = Math.hypot(e[0], e[1], e[2]);
    const row = measureObject({ soup, field, ownTris, box, obstacle, collider, nearObstacles, nearColliders, solidAccept, rays });
    // a stone without a collider is drive-over by design when it rises less than a hull's belly line over its ground
    const driveOver = !obstacle && row.meshRiseM < DRIVE_OVER_RISE_M;
    row.kind = obstacle ? (obstacle.kind === 'small-rock' ? 'small-rock' : 'boulder') : driveOver ? 'boulder-drive-over' : 'boulder-no-collider';
    row.scale = +scale.toFixed(3);
    row.sink = +((field.getHeightAt(x, z) - y) / Math.max(1e-6, scale)).toFixed(3);
    rows.push(row);
    // the same stone under its legacy record (its seat height marks it exactly)
    const legacy = legacyGrid ? rockRecordAt(legacyGrid, legacyClaimed, x, y, z, meshBox) : null;
    if (legacy && Math.abs(legacy.min[1] - y) < 2e-3) {
      legacyClaimed.add(legacy);
      const lbox = regionBox([meshBox, recordBox(legacy)], 0.6);
      const near = (grid) => grid(lbox[0], lbox[1], lbox[2], lbox[3], []).filter((r) => r !== obstacle && r !== collider);
      const legacyRow = measureObject({ soup, field, ownTris, box: lbox, obstacle: legacy, collider: legacy,
        nearObstacles: [legacy, ...near(obstacleGrid)], nearColliders: [legacy, ...near(colliderGrid)], solidAccept, rays });
      legacyRow.kind = legacy.kind === 'small-rock' ? 'legacy-small-rock' : 'legacy-boulder';
      legacyRow.scale = row.scale; legacyRow.sink = row.sink;
      rows.push(legacyRow);
    }
  }
  // the scenery's standing rock masses: kindless, solid records over the scenery rock mesh
  const sceneryFamily = soup.familyIndex.get('scenery-rock');
  if (sceneryFamily !== undefined) {
    const masses = (list) => list.filter((record) => !claimed.has(record) && record.kind === undefined && !record.crushable
      && record.treeIdx == null && (record.shape2?.kind === 'convex' || record.shape2?.kind === 'compound'));
    const freeColliders = masses(dressing.colliders);
    const massRecords = [];
    for (const obstacle of masses(dressing.obstacles)) {
      const box = regionBox([recordBox(obstacle)], 1.0);
      const ownTris = soup.query(box[0], box[1], box[2], box[3], (t) => soup.family[t] === sceneryFamily);
      if (!ownTris.length) continue;
      // its shell record: the nearest free mass collider whose box overlaps its own
      const ox = (obstacle.min[0] + obstacle.max[0]) / 2, oz = (obstacle.min[2] + obstacle.max[2]) / 2;
      let collider = null, best = Infinity;
      for (const record of freeColliders) {
        if (claimed.has(record) || record.max[0] < obstacle.min[0] || record.min[0] > obstacle.max[0]
          || record.max[2] < obstacle.min[2] || record.min[2] > obstacle.max[2]) continue;
        const d = Math.hypot((record.min[0] + record.max[0]) / 2 - ox, (record.min[2] + record.max[2]) / 2 - oz);
        if (d < best) { best = d; collider = record; }
      }
      if (collider) claimed.add(collider);
      claimed.add(obstacle);
      const full = regionBox([recordBox(obstacle), collider ? recordBox(collider) : null], 1.0);
      const nearObstacles = obstacleGrid(full[0], full[1], full[2], full[3], []);
      const nearColliders = colliderGrid(full[0], full[1], full[2], full[3], []);
      const row = measureObject({ soup, field, ownTris, box: full, obstacle, collider, nearObstacles, nearColliders, solidAccept, rays });
      row.kind = 'scenery-mass';
      rows.push(row);
      massRecords.push(obstacle);
    }
    if (massRecords.length) rows.push(formationUnion({ soup, field, sceneryFamily, solidAccept, obstacleGrid, massRecords }));
  }
  return rows;
}

/**
 * The formations' movement colliders against their stone over the whole map, each cell counted once (2026-10-08): the
 * rows measure each record over its own region, and neighbouring records' regions (a formation's loose blocks, which
 * carry their own records) count the stone between them more than once. 8 m tiles over all the scenery rock and every
 * formation record (the same ground on any tree, whatever its records); in each the scenery rock's band section, the
 * formation records' footprints and every movement record's.
 */
function formationUnion({ soup, field, sceneryFamily, solidAccept, obstacleGrid, massRecords }) {
  const TILE = 8, H = 0.1;
  const groundAt = rockGroundAt(field);
  const tiles = new Map();
  const cover = (x0, z0, x1, z1) => {
    for (let i = Math.floor(x0 / TILE); i <= Math.floor(x1 / TILE); i++) {
      for (let j = Math.floor(z0 / TILE); j <= Math.floor(z1 / TILE); j++) {
        const key = `${i},${j}`;
        if (!tiles.has(key)) tiles.set(key, [i, j, []]);
      }
    }
  };
  // (every scenery rock triangle's tile: the formations' meshes are merged, so a source spans the map)
  const d = soup.xyz;
  for (let t = 0; t < soup.count; t++) {
    if (soup.family[t] !== sceneryFamily) continue;
    const o = t * 9;
    cover(Math.min(d[o], d[o + 3], d[o + 6]), Math.min(d[o + 2], d[o + 5], d[o + 8]), Math.max(d[o], d[o + 3], d[o + 6]), Math.max(d[o + 2], d[o + 5], d[o + 8]));
  }
  for (const r of massRecords) cover(r.min[0] - 1, r.min[2] - 1, r.max[0] + 1, r.max[2] + 1);
  for (const r of massRecords) {
    for (let i = Math.floor((r.min[0] - 1) / TILE); i <= Math.floor((r.max[0] + 1) / TILE); i++) {
      for (let j = Math.floor((r.min[2] - 1) / TILE); j <= Math.floor((r.max[2] + 1) / TILE); j++) tiles.get(`${i},${j}`)[2].push(r);
    }
  }
  const out = { kind: 'scenery-union', x: 0, z: 0, n: massRecords.length, colliderM2: 0, meshM2: 0, phantomM2: 0, leakM2: 0 };
  for (const [i, j, mine] of tiles.values()) {
    const x0 = i * TILE, z0 = j * TILE;
    const region = makeRegion(x0, z0, x0 + TILE, z0 + TILE, H);
    const ground = regionGround(region, groundAt);
    const rock = soup.query(x0, z0, x0 + TILE, z0 + TILE, (t) => soup.family[t] === sceneryFamily);
    const solid = soup.query(x0, z0, x0 + TILE, z0 + TILE, solidAccept);
    const meshRock = sectionRaster(region, ground, CONTACT_BAND, soup, rock);
    const meshAll = sectionRaster(region, ground, CONTACT_BAND, soup, solid);
    const own = new Uint8Array(region.nx * region.nz), any = new Uint8Array(region.nx * region.nz);
    for (const r of mine) colliderRaster(region, ground, CONTACT_BAND, r, own);
    for (const r of obstacleGrid(x0, z0, x0 + TILE, z0 + TILE, [])) if (!r.dead) colliderRaster(region, ground, CONTACT_BAND, r, any);
    for (let k = 0; k < own.length; k++) {
      if (own[k]) { out.colliderM2 += H * H; if (!meshAll[k]) out.phantomM2 += H * H; }
      if (meshRock[k]) { out.meshM2 += H * H; if (!any[k]) out.leakM2 += H * H; }
    }
  }
  for (const key of ['colliderM2', 'meshM2', 'phantomM2', 'leakM2']) out[key] = +out[key].toFixed(2);
  return out;
}

/** Whether triangle `t` lies inside the record's box grown by `margin` (m) every way. */
function insideBox(soup, t, record, margin) {
  const d = soup.xyz;
  for (let c = 0; c < 9; c += 3) {
    const x = d[t * 9 + c], y = d[t * 9 + c + 1], z = d[t * 9 + c + 2];
    if (x < record.min[0] - margin || x > record.max[0] + margin || y < record.min[1] - margin || y > record.max[1] + margin
      || z < record.min[2] - margin || z > record.max[2] + margin) return false;
  }
  return true;
}

/** The audit kind of a record: its own kind, else what it is (a solid without a kind, a crushable one). */
function recordKind(record) {
  return record.kind ?? (record.crushable ? 'crushable' : record.shape2 ? `solid-${record.shape2.kind}` : 'solid-box');
}

/**
 * Every other record (walls, fences, props, wrecks, structures, the kindless solids): its own mesh is its destructible
 * instance when it has one, else the solid triangles of its families inside its box (the merged buckets a structure, a
 * rubble heap or a well is drawn in; the wreck cast). A record whose shell twin is a separate record (a structure's
 * bands) is judged on rays against every shell record of its kind round it.
 */
function auditRecords({ soup, field, dressing, rays, obstacleGrid, colliderGrid, solidAccept, claimed, kinds = null, limit = Infinity }) {
  const rows = [];
  const sourceOf = new Map();
  soup.sources.forEach((source, index) => sourceOf.set(`${source.mesh}#${source.instance}`, index));
  const destructibleOf = new Map();
  for (const d of dressing.destructibles ?? []) if (d.ob) destructibleOf.set(d.ob, d);
  const family = (name) => soup.familyIndex.get(name);
  const wrecks = family('tank-wrecks'), buckets = family('bucket'), poles = family('baked-pole-full');
  const counts = new Map();
  for (const obstacle of dressing.obstacles) {
    if (claimed.has(obstacle) || obstacle.treeIdx != null) continue;
    const kind = recordKind(obstacle);
    if (kinds && !kinds.has(kind)) continue;
    const seen = counts.get(kind) ?? 0;
    if (seen >= limit) continue;
    counts.set(kind, seen + 1);
    const d = destructibleOf.get(obstacle);
    let ownTris = null, collider = d?.col ?? null, colliders = null;
    const rec = recordBox(obstacle);
    if (d && d.slot >= 0) {
      const index = sourceOf.get(`destructible-${d.kind}#${d.slot}`);
      if (index !== undefined) {
        const source = soup.sources[index];
        ownTris = [];
        for (let t = source.first; t < source.first + source.tris; t++) ownTris.push(t);
      }
    }
    if (!ownTris) {
      const accept = kind === 'tank-wreck' ? (t) => soup.family[t] === wrecks
        : (t) => soup.family[t] === buckets || soup.family[t] === poles;
      ownTris = soup.query(rec[0] - 0.3, rec[1] - 0.3, rec[2] + 0.3, rec[3] + 0.3, accept);
      // a hedgehog beam's own steel lies inside its record's box (the merged bucket also holds the lamp post or the
      // pole beside it, which the box's footprint reaches; 2026-10-08)
      if (kind === 'hedgehog') ownTris = ownTris.filter((t) => insideBox(soup, t, obstacle, 0.05));
    }
    const box = regionBox([rec], 1.0);
    const nearObstacles = obstacleGrid(box[0], box[1], box[2], box[3], []);
    const nearColliders = colliderGrid(box[0], box[1], box[2], box[3], []);
    if (!collider) {
      // its shell twin: a clone (the same box), else every shell record of its kind round it (a structure's bands)
      collider = nearColliders.find((r) => r !== obstacle && r.kind === obstacle.kind && r.min[0] === obstacle.min[0]
        && r.min[2] === obstacle.min[2] && r.max[0] === obstacle.max[0] && r.max[2] === obstacle.max[2]) ?? null;
      if (!collider && obstacle.kind !== undefined) colliders = nearColliders.filter((r) => r.kind === obstacle.kind && r.treeIdx == null);
    }
    const row = measureObject({ soup, field, ownTris, box, obstacle, collider, colliders, nearObstacles, nearColliders, solidAccept, rays });
    row.kind = kind;
    row.crushable = !!obstacle.crushable;
    rows.push(row);
  }
  return rows;
}

/** Build the soup and audit one map's world; returns { rows } with one row per measured object. */
export function auditMapWorld({ mapId, field, flora, dressing, families = ['rocks'], rays = true, createObstacleGrid, recordLimit = Infinity, recordKinds = null }) {
  const soup = new TriangleSoup(4);
  dressing.group.updateMatrixWorld(true);
  dressing.group.traverse((mesh) => {
    const family = classifyPropsMesh(mesh);
    if (family) addMeshTriangles(soup, mesh, family);
  });
  const solidFamilies = new Set(soup.families.map((_, i) => i));
  const solidAccept = (t) => solidFamilies.has(soup.family[t]);
  const obstacleGrid = createObstacleGrid([...dressing.obstacles, ...flora.treeObstacles]);
  const colliderGrid = createObstacleGrid([...dressing.colliders, ...flora.treeObstacles]);
  const rows = [];
  const claimed = new Set();
  const all = families.includes('all');
  if (all || families.includes('rocks') || families.includes('formations')) {
    // ('formations': the scenery's rock masses alone, without the stones)
    rows.push(...auditRocks({ soup, field, dressing, rays, obstacleGrid, colliderGrid, solidAccept, claimed, createObstacleGrid,
      stones: all || families.includes('rocks') }));
  }
  if (all || families.includes('records')) {
    rows.push(...auditRecords({ soup, field, dressing, rays, obstacleGrid, colliderGrid, solidAccept, claimed, limit: recordLimit, kinds: recordKinds }));
  }
  return { mapId, triangles: soup.count, rows };
}

/** Per-kind totals: areas (m2), shares, ray shares, mean height error. */
export function kindTotals(rows) {
  const kinds = new Map();
  for (const row of rows) {
    let k = kinds.get(row.kind);
    if (!k) kinds.set(row.kind, k = { kind: row.kind, n: 0, colliderM2: 0, phantomM2: 0, meshM2: 0, leakM2: 0, rays: 0, phantomRays: 0, leakRays: 0, earlyRays: 0, phantomRaysSeen: 0, leakRaysSeen: 0, topErr: 0, topN: 0, phantomShares: [] });
    k.n++;
    k.colliderM2 += row.colliderM2; k.phantomM2 += row.phantomM2; k.meshM2 += row.meshM2; k.leakM2 += row.leakM2;
    k.rays += row.rays ?? 0; k.phantomRays += row.phantomRays ?? 0; k.leakRays += row.leakRays ?? 0; k.earlyRays += row.earlyRays ?? 0;
    k.phantomRaysSeen += row.phantomRaysSeen ?? 0; k.leakRaysSeen += row.leakRaysSeen ?? 0;
    if (row.colliderTopM != null) { k.topErr += row.colliderTopM - row.meshTopM; k.topN++; }
    if (row.colliderM2 > 0) k.phantomShares.push(row.phantomM2 / row.colliderM2);
  }
  return [...kinds.values()].map((k) => ({
    kind: k.kind, n: k.n,
    colliderM2: +k.colliderM2.toFixed(1), meshM2: +k.meshM2.toFixed(1),
    phantomShare: k.colliderM2 ? +(k.phantomM2 / k.colliderM2).toFixed(3) : 0,
    leakShare: k.meshM2 ? +(k.leakM2 / k.meshM2).toFixed(3) : 0,
    colliderOverMesh: k.meshM2 ? +(k.colliderM2 / k.meshM2).toFixed(2) : null,
    phantomShareP50: +quantile(k.phantomShares, 0.5).toFixed(3), phantomShareP90: +quantile(k.phantomShares, 0.9).toFixed(3),
    rayPhantomShare: k.rays ? +(k.phantomRays / k.rays).toFixed(3) : 0,
    rayEarlyShare: k.rays ? +(k.earlyRays / k.rays).toFixed(3) : 0,
    rayLeakShare: k.rays ? +(k.leakRays / k.rays).toFixed(3) : 0,
    rayPhantomSeenShare: k.rays ? +(k.phantomRaysSeen / k.rays).toFixed(3) : 0,
    rayLeakSeenShare: k.rays ? +(k.leakRaysSeen / k.rays).toFixed(3) : 0,
    topErrM: k.topN ? +(k.topErr / k.topN).toFixed(2) : null,
  }));
}

export function summariseAudit(audit) {
  return kindTotals(audit.rows).map((k) => `${k.kind.padEnd(20)} n=${String(k.n).padStart(4)} collider ${String(k.colliderM2).padStart(8)} m2 mesh ${String(k.meshM2).padStart(8)} m2`
    + ` phantom ${(k.phantomShare * 100).toFixed(1)}% (p50 ${(k.phantomShareP50 * 100).toFixed(0)}% p90 ${(k.phantomShareP90 * 100).toFixed(0)}%)`
    + ` leak ${(k.leakShare * 100).toFixed(1)}% | rays phantom ${(k.rayPhantomShare * 100).toFixed(1)}% (>10cm ${(k.rayPhantomSeenShare * 100).toFixed(1)}%) early ${(k.rayEarlyShare * 100).toFixed(1)}% leak ${(k.rayLeakShare * 100).toFixed(1)}% (>10cm ${(k.rayLeakSeenShare * 100).toFixed(1)}%)`
    + (k.topErrM != null ? ` | top err ${k.topErrM} m` : ''));
}
