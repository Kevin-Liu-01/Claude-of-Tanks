// Shared, allocation-free world collision primitives.
//
// World props keep min/max AABBs for cheap broad-phase consumers, but may
// carry a tighter `shape2` footprint for the movement and shell narrow phases:
//   { kind:'obb', cx,cz, hw,hl,yaw }
//   { kind:'circle', cx,cz,r }
//   { kind:'convex', cx,cz, points:[x0,z0,...] }  // CCW world points

const EPS = 1e-9;

export type Bounds3 = [number, number, number];

export type CollisionShape =
  | { kind: 'obb'; cx: number; cz: number; hw: number; hl: number; yaw: number }
  | { kind: 'circle'; cx: number; cz: number; r: number }
  | { kind: 'convex'; cx: number; cz: number; points: number[] };

export interface CollisionRecord {
  min: Bounds3;
  max: Bounds3;
  shape2?: CollisionShape;
  crushable?: boolean;
  crushMin?: number;
  crushKeep?: number;
  kind?: string;
  treeIdx?: number;
  propIdx?: number;
  crushed?: boolean;
  dead?: boolean;
  __gridStamp?: number;
}

interface Position2 {
  x: number;
  z: number;
}

interface Vector3Like extends Position2 {
  y: number;
}

interface MutableVector3Like extends Vector3Like {
  set(x: number, y: number, z: number): unknown;
}

interface Push2 extends Position2 {
  x: number;
  z: number;
}

interface AxisOverlap {
  overlap: number;
  nx: number;
  nz: number;
}

export type ObstacleQuery = (
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  out: CollisionRecord[],
) => CollisionRecord[];

/** Attach a tight oriented-box footprint while retaining a world AABB. */
export function setObbShape(
  rec: CollisionRecord,
  cx: number,
  cz: number,
  halfWidth: number,
  halfLength: number,
  yaw = 0,
) {
  const hw = Math.max(0, halfWidth);
  const hl = Math.max(0, halfLength);
  const cs = Math.abs(Math.cos(yaw));
  const sn = Math.abs(Math.sin(yaw));
  const ex = hw * cs + hl * sn;
  const ez = hw * sn + hl * cs;
  rec.min[0] = cx - ex; rec.max[0] = cx + ex;
  rec.min[2] = cz - ez; rec.max[2] = cz + ez;
  rec.shape2 = { kind: 'obb', cx, cz, hw, hl, yaw };
  return rec;
}

/** Attach a circular footprint (finite vertical cylinder in ray tests). */
export function setCircleShape(rec: CollisionRecord, cx: number, cz: number, radius: number) {
  const r = Math.max(0, radius);
  rec.min[0] = cx - r; rec.max[0] = cx + r;
  rec.min[2] = cz - r; rec.max[2] = cz + r;
  rec.shape2 = { kind: 'circle', cx, cz, r };
  return rec;
}

/** Monotone-chain convex hull of [x,z] pairs. Returns CCW flat coordinates. */
export function convexHull2(points: ReadonlyArray<readonly [number, number]>) {
  if (!points || points.length < 3) return [];
  const p = points.map((v) => [v[0], v[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const v of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], v) <= 0) lower.pop();
    lower.push(v);
  }
  const upper: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], v) <= 0) upper.pop();
    upper.push(v);
  }
  lower.pop(); upper.pop();
  const out: number[] = [];
  for (const v of lower.concat(upper)) out.push(v[0], v[1]);
  return out;
}

/** Attach a convex projected footprint while retaining its enclosing AABB. */
export function setConvexShape(rec: CollisionRecord, points: number[]) {
  if (!points || points.length < 6) return rec;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let sx = 0, sz = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i], z = points[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    sx += x; sz += z;
  }
  rec.min[0] = minX; rec.max[0] = maxX;
  rec.min[2] = minZ; rec.max[2] = maxZ;
  const n = points.length / 2;
  rec.shape2 = { kind: 'convex', cx: sx / n, cz: sz / n, points };
  return rec;
}

/** Copy a shape record without sharing mutable min/max arrays. */
export function cloneCollisionRecord(rec: CollisionRecord): CollisionRecord {
  const out: CollisionRecord = { ...rec, min: [...rec.min], max: [...rec.max] };
  if (rec.shape2) {
    out.shape2 = { ...rec.shape2 };
    if (rec.shape2.kind === 'convex' && out.shape2.kind === 'convex') {
      out.shape2.points = rec.shape2.points.slice();
    }
  }
  return out;
}

function testAxis(
  nx: number, nz: number, pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, minB: number, maxB: number,
  centerBX: number, centerBZ: number, best: AxisOverlap,
) {
  const ll = Math.hypot(nx, nz);
  if (ll < EPS) return true;
  nx /= ll; nz /= ll;
  const centerA = pos.x * nx + pos.z * nz;
  const radiusA = halfL * Math.abs(fx * nx + fz * nz) +
    halfW * Math.abs(rx * nx + rz * nz);
  const ov = Math.min(centerA + radiusA, maxB) - Math.max(centerA - radiusA, minB);
  if (ov <= 0) return false;
  if (ov < best.overlap) {
    const towardHull = (pos.x - centerBX) * nx + (pos.z - centerBZ) * nz;
    const sign = towardHull >= 0 ? 1 : -1;
    best.overlap = ov; best.nx = nx * sign; best.nz = nz * sign;
  }
  return true;
}

function testConvexAxis(
  ax: number, az: number, pts: number[], shape: Extract<CollisionShape, { kind: 'convex' }>,
  pos: Position2, fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
) {
  const ll = Math.hypot(ax, az);
  if (ll < EPS) return true;
  const nx = ax / ll, nz = az / ll;
  let minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i] * nx + pts[i + 1] * nz;
    if (p < minB) minB = p; if (p > maxB) maxB = p;
  }
  return testAxis(nx, nz, pos, fx, fz, rx, rz, halfL, halfW,
    minB, maxB, shape.cx, shape.cz, best);
}

function testObbAxis(
  nx: number, nz: number, box: Extract<CollisionShape, { kind: 'obb' }>,
  ofx: number, ofz: number, orx: number, orz: number,
  pos: Position2, fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
) {
  const c = box.cx * nx + box.cz * nz;
  const r = box.hl * Math.abs(ofx * nx + ofz * nz) +
    box.hw * Math.abs(orx * nx + orz * nz);
  return testAxis(nx, nz, pos, fx, fz, rx, rz, halfL, halfW,
    c - r, c + r, box.cx, box.cz, best);
}

/**
 * Tight hull-OBB vs environment-footprint push-out. Adds the minimum
 * translation to `outPush`; returns false when separated.
 */
export function pushHullFromObstacle(
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number,
  ob: CollisionRecord,
  outPush: Push2,
) {
  const sh = ob.shape2;
  if (sh && sh.kind === 'circle') {
    // Circle center in hull-local (right/forward) coordinates.
    const dx = sh.cx - pos.x, dz = sh.cz - pos.z;
    const cx = dx * rx + dz * rz;
    const cz = dx * fx + dz * fz;
    const qx = Math.max(-halfW, Math.min(cx, halfW));
    const qz = Math.max(-halfL, Math.min(cz, halfL));
    const vx = qx - cx, vz = qz - cz;
    const d2 = vx * vx + vz * vz;
    if (d2 >= sh.r * sh.r) return false;
    let px: number, pz: number, depth: number;
    if (d2 > EPS) {
      const d = Math.sqrt(d2);
      px = vx / d; pz = vz / d; depth = sh.r - d;
    } else {
      const ox = halfW + sh.r - Math.abs(cx);
      const oz = halfL + sh.r - Math.abs(cz);
      if (ox < oz) { px = cx >= 0 ? -1 : 1; pz = 0; depth = ox; }
      else { px = 0; pz = cz >= 0 ? -1 : 1; depth = oz; }
    }
    outPush.x += (rx * px + fx * pz) * depth;
    outPush.z += (rz * px + fz * pz) * depth;
    return true;
  }

  const best = _pushBest;
  best.overlap = Infinity; best.nx = 0; best.nz = 0;
  if (sh && sh.kind === 'convex') {
    const pts = sh.points;
    if (!testConvexAxis(fx, fz, pts, sh, pos, fx, fz, rx, rz, halfL, halfW, best) ||
        !testConvexAxis(rx, rz, pts, sh, pos, fx, fz, rx, rz, halfL, halfW, best)) return false;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      if (!testConvexAxis(-(pts[j + 1] - pts[i + 1]), pts[j] - pts[i],
        pts, sh, pos, fx, fz, rx, rz, halfL, halfW, best)) return false;
    }
  } else {
    const box = sh && sh.kind === 'obb' ? sh : _fallbackBox;
    if (box === _fallbackBox) {
      box.cx = (ob.min[0] + ob.max[0]) * 0.5;
      box.cz = (ob.min[2] + ob.max[2]) * 0.5;
      box.hw = (ob.max[0] - ob.min[0]) * 0.5;
      box.hl = (ob.max[2] - ob.min[2]) * 0.5;
      box.yaw = 0;
    }
    const ofx = Math.sin(box.yaw), ofz = Math.cos(box.yaw);
    const orx = ofz, orz = -ofx;
    if (!testObbAxis(fx, fz, box, ofx, ofz, orx, orz,
      pos, fx, fz, rx, rz, halfL, halfW, best) ||
      !testObbAxis(rx, rz, box, ofx, ofz, orx, orz,
        pos, fx, fz, rx, rz, halfL, halfW, best) ||
      !testObbAxis(ofx, ofz, box, ofx, ofz, orx, orz,
        pos, fx, fz, rx, rz, halfL, halfW, best) ||
      !testObbAxis(orx, orz, box, ofx, ofz, orx, orz,
        pos, fx, fz, rx, rz, halfL, halfW, best)) return false;
  }
  outPush.x += best.nx * best.overlap;
  outPush.z += best.nz * best.overlap;
  return true;
}

/**
 * Tight OBB-vs-OBB hull contact. Unlike the historical capsule approximation,
 * this does not round away solid shoulder/track corners. All arguments are
 * scalars so the fixed-step pair loop can reuse existing state without
 * allocating temporary obstacle records.
 */
export function pushHullFromHull(
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
  outPush: Push2,
) {
  const best = _pushBest;
  best.overlap = Infinity; best.nx = 0; best.nz = 0;
  if (!testHullAxis(afx, afz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
    bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(arx, arz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(bfx, bfz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(brx, brz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best)) return false;
  outPush.x += best.nx * best.overlap;
  outPush.z += best.nz * best.overlap;
  return true;
}

function testHullAxis(
  nx: number, nz: number,
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
  best: AxisOverlap,
) {
  const length = Math.hypot(nx, nz);
  if (length < EPS) return true;
  nx /= length; nz /= length;
  const radiusA = aHalfL * Math.abs(afx * nx + afz * nz) +
    aHalfW * Math.abs(arx * nx + arz * nz);
  const radiusB = bHalfL * Math.abs(bfx * nx + bfz * nz) +
    bHalfW * Math.abs(brx * nx + brz * nz);
  const separation = (ax - bx) * nx + (az - bz) * nz;
  const overlap = radiusA + radiusB - Math.abs(separation);
  if (overlap <= 0) return false;
  if (overlap < best.overlap) {
    const sign = separation >= 0 ? 1 : -1;
    best.overlap = overlap;
    best.nx = nx * sign;
    best.nz = nz * sign;
  }
  return true;
}

const _pushBest = { overlap: Infinity, nx: 0, nz: 0 };
const _fallbackBox: Extract<CollisionShape, { kind: 'obb' }> = {
  kind: 'obb', cx: 0, cz: 0, hw: 0, hl: 0, yaw: 0,
};
const _localO = { x: 0, y: 0, z: 0 };
const _localD = { x: 0, y: 0, z: 0 };
const _localRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _localN: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};

function rayAabb(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  outNormal: MutableVector3Like,
) {
  let tmin = 0, tmax = maxDist, axis = -1, sign = 1;
  for (let a = 0; a < 3; a++) {
    const o = a === 0 ? origin.x : a === 1 ? origin.y : origin.z;
    const d = a === 0 ? dir.x : a === 1 ? dir.y : dir.z;
    const lo = rec.min[a], hi = rec.max[a];
    if (Math.abs(d) < EPS) { if (o < lo || o > hi) return -1; continue; }
    const inv = 1 / d;
    let t0 = (lo - o) * inv, t1 = (hi - o) * inv, s = -1;
    if (t0 > t1) { const q = t0; t0 = t1; t1 = q; s = 1; }
    if (t0 > tmin) { tmin = t0; axis = a; sign = s; }
    if (t1 < tmax) tmax = t1;
    if (tmin > tmax) return -1;
  }
  if (axis >= 0) {
    outNormal.set(0, 0, 0);
    if (axis === 0) outNormal.x = sign;
    else if (axis === 1) outNormal.y = sign;
    else outNormal.z = sign;
  } else outNormal.set(-dir.x, -dir.y, -dir.z);
  return tmin;
}

/** Ray against the tight footprint extruded from minY to maxY. */
export function rayCollisionRecord(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  outNormal: MutableVector3Like,
) {
  const sh = rec.shape2;
  if (!sh) return rayAabb(origin, dir, rec, maxDist, outNormal);
  if (sh.kind === 'obb') {
    const s = Math.sin(sh.yaw), c = Math.cos(sh.yaw);
    const dx = origin.x - sh.cx, dz = origin.z - sh.cz;
    _localO.x = dx * c - dz * s; _localO.y = origin.y; _localO.z = dx * s + dz * c;
    _localD.x = dir.x * c - dir.z * s; _localD.y = dir.y; _localD.z = dir.x * s + dir.z * c;
    _localRec.min[0] = -sh.hw; _localRec.min[1] = rec.min[1]; _localRec.min[2] = -sh.hl;
    _localRec.max[0] = sh.hw; _localRec.max[1] = rec.max[1]; _localRec.max[2] = sh.hl;
    const t = rayAabb(_localO, _localD, _localRec, maxDist, _localN);
    if (t < 0) return -1;
    outNormal.set(_localN.x * c + _localN.z * s, _localN.y, -_localN.x * s + _localN.z * c);
    return t;
  }
  if (sh.kind === 'circle') {
    let t0 = 0, t1 = maxDist;
    let nx = 0, ny = 0, nz = 0;
    // vertical slab
    if (Math.abs(dir.y) < EPS) {
      if (origin.y < rec.min[1] || origin.y > rec.max[1]) return -1;
    } else {
      let a = (rec.min[1] - origin.y) / dir.y;
      let b = (rec.max[1] - origin.y) / dir.y;
      let sy = -1;
      if (a > b) { const q = a; a = b; b = q; sy = 1; }
      if (a > t0) { t0 = a; nx = 0; ny = sy; nz = 0; }
      if (b < t1) t1 = b;
    }
    const ox = origin.x - sh.cx, oz = origin.z - sh.cz;
    const aa = dir.x * dir.x + dir.z * dir.z;
    if (aa < EPS) {
      if (ox * ox + oz * oz > sh.r * sh.r) return -1;
    } else {
      const bb = 2 * (ox * dir.x + oz * dir.z);
      const cc = ox * ox + oz * oz - sh.r * sh.r;
      const disc = bb * bb - 4 * aa * cc;
      if (disc < 0) return -1;
      const sd = Math.sqrt(disc);
      let a = (-bb - sd) / (2 * aa), b = (-bb + sd) / (2 * aa);
      if (a > t0) {
        t0 = a;
        const hx = ox + dir.x * a, hz = oz + dir.z * a;
        const il = 1 / Math.max(Math.hypot(hx, hz), EPS);
        nx = hx * il; ny = 0; nz = hz * il;
      }
      if (b < t1) t1 = b;
    }
    if (t0 > t1 || t1 < 0 || t0 > maxDist) return -1;
    outNormal.set(nx, ny, nz);
    return Math.max(0, t0);
  }
  if (sh.kind === 'convex') {
    let t0 = 0, t1 = maxDist;
    let enx = -dir.x, eny = -dir.y, enz = -dir.z;
    // y slab first
    if (Math.abs(dir.y) < EPS) {
      if (origin.y < rec.min[1] || origin.y > rec.max[1]) return -1;
    } else {
      let a = (rec.min[1] - origin.y) / dir.y;
      let b = (rec.max[1] - origin.y) / dir.y;
      let sy = -1;
      if (a > b) { const q = a; a = b; b = q; sy = 1; }
      if (a > t0) { t0 = a; enx = 0; eny = sy; enz = 0; }
      if (b < t1) t1 = b;
    }
    const pts = sh.points;
    for (let i = 0; i < pts.length; i += 2) {
      const j = (i + 2) % pts.length;
      const ex = pts[j] - pts[i], ez = pts[j + 1] - pts[i + 1];
      // CCW polygon inward normal = (-edge.z, edge.x).
      let ix = -ez, iz = ex;
      const il = Math.hypot(ix, iz) || 1;
      ix /= il; iz /= il;
      const s0 = (origin.x - pts[i]) * ix + (origin.z - pts[i + 1]) * iz;
      const sd = dir.x * ix + dir.z * iz;
      if (Math.abs(sd) < EPS) { if (s0 < 0) return -1; continue; }
      const t = -s0 / sd;
      if (sd > 0) {
        if (t > t0) { t0 = t; enx = -ix; eny = 0; enz = -iz; }
      } else if (t < t1) t1 = t;
      if (t0 > t1) return -1;
    }
    if (t1 < 0 || t0 > maxDist) return -1;
    outNormal.set(enx, eny, enz);
    return Math.max(0, t0);
  }
  return rayAabb(origin, dir, rec, maxDist, outNormal);
}

/** Static uniform-grid broad phase. Query writes into the caller-owned array. */
export function createObstacleGrid(records: CollisionRecord[], cellSize = 24): ObstacleQuery {
  const cells = new Map<number, CollisionRecord[]>();
  const inv = 1 / cellSize;
  // Numeric signed-16 packing avoids allocating "x,z" strings in every
  // per-tank query. Battlefield cell coordinates are comfortably inside it.
  const key = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const x0 = Math.floor(r.min[0] * inv), x1 = Math.floor(r.max[0] * inv);
    const z0 = Math.floor(r.min[2] * inv), z1 = Math.floor(r.max[2] * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      let a = cells.get(k);
      if (!a) { a = []; cells.set(k, a); }
      a.push(r);
    }
  }
  let stamp = 0;
  return function query(
    minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[],
  ) {
    out.length = 0;
    stamp++;
    if (stamp >= 0x7fffffff) { stamp = 1; for (const r of records) r.__gridStamp = 0; }
    const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
    const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const a = cells.get(key(x, z));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const r = a[i];
        if (r.__gridStamp === stamp) continue;
        r.__gridStamp = stamp;
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
    }
    return out;
  };
}
