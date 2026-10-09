// The battlefield as the engine holds it, rebuilt from a lab features dump (2026-10-06, the engine review: hulls drove
// through walls and carts, and poles, stalls, canopies and roofs blocked lenses that the footprint checks had passed).
// Every collision record comes back with its footprint, height and overrun speed — and every presentation crushable
// (utility poles, loop-class dressing) as a small round record a hull topples over 1.2 m/s — so the engine's own code
// answers the questions: which records a hull overruns (and crushes or hits), what the Studio's hulls will crush
// (src/game/studioCrush.ts, the same plan the Studio makes), the slope and water under a hull, and whether a lens's
// sightline crosses a record or a canopy. Pure: features in, answers out.
import { createObstacleGrid, pushHullFromObstacle } from '../../src/world/collision.ts';

/** The overrun speed of a crushable record without its own (state.ts CRUSH_MIN_MPS). */
export const CRUSH_MIN_MPS = 6 / 3.6;
/** The speed over which a hull topples the presentation crushables (battlePresentationRuntime.ts crushNearbyProps). */
const PROP_CRUSH_MIN_MPS = 1.2;
/** Records lower than this do not stop a hull or block a lens worth naming (kerbs, sandbag lips, wreck plates). */
const LOW_M = 0.6;

const shapeFrom = (s) => {
  if (!s) return undefined;
  if (s[0] === 'o') return { kind: 'obb', cx: s[1], cz: s[2], hw: s[3], hl: s[4], yaw: s[5] };
  if (s[0] === 'c') return { kind: 'circle', cx: s[1], cz: s[2], r: s[3] };
  if (s[0] === 'v') return { kind: 'convex', cx: avg(s[1], 0), cz: avg(s[1], 1), points: s[1] };
  if (s[0] === 'm') {
    return { kind: 'compound', cx: 0, cz: 0, parts: s[1].map(([p, y0, y1]) => ({ ...shapeFrom(p), ...(y0 == null ? {} : { y0 }), ...(y1 == null ? {} : { y1 }) })) };
  }
  return undefined;
};
function avg(points, axis) { let sum = 0, n = 0; for (let i = axis; i < points.length; i += 2) { sum += points[i]; n++; } return n ? sum / n : 0; }
const grid = (b64, Type) => { const buf = Buffer.from(b64, 'base64'); return new Type(buf.buffer, buf.byteOffset, buf.byteLength / Type.BYTES_PER_ELEMENT); };

const models = new WeakMap();
/**
 * The world model of a features dump, or null when the dump predates the obstacle export (an older lab run).
 * records: CollisionRecord-shaped objects (min, max, kind, crushable, crushMin, shape2, treeIdx, canopyR).
 */
export function worldModel(features) {
  if (!features?.obstacles || !features.grid) return null;
  if (models.has(features)) return models.get(features);
  const records = features.obstacles.map((o, i) => {
    const r = { min: o.b.slice(0, 3), max: o.b.slice(3, 6), kind: o.k || 'obstacle' };
    if ('c' in o) { r.crushable = true; if (o.c != null) r.crushMin = o.c; }
    const shape = shapeFrom(o.s);
    if (shape) r.shape2 = shape;
    if (o.t) { r.treeIdx = i; if (o.cr) r.canopyR = o.cr; }
    return r;
  });
  // the presentation crushables (utility poles, loop-class dressing): no collision record in the engine, but they
  // stand in a lens's way and a hull at more than 1.2 m/s topples them (battlePresentationRuntime.ts crushNearbyProps)
  for (const [x, y, z, r, h, kind, dynamic] of features.crushables ?? []) {
    records.push({ min: [x - r, y, z - r], max: [x + r, y + h, z + r], kind, crushable: true, crushMin: PROP_CRUSH_MIN_MPS,
      shape2: { kind: 'circle', cx: x, cz: z, r }, presentation: true, ...(dynamic ? { dynamic: true } : {}) });
  }
  const query = createObstacleGrid(records);
  const { step, n, origin } = features.grid;
  const heights = grid(features.grid.heightDm, Int16Array), water = grid(features.grid.water255, Uint8Array);
  const bilinear = (data, scale, x, z) => {
    const fx = Math.min(n - 1.001, Math.max(0, (x - origin) / step)), fz = Math.min(n - 1.001, Math.max(0, (z - origin) / step));
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = data[j * n + i], b = data[j * n + i + 1], c = data[(j + 1) * n + i], d = data[(j + 1) * n + i + 1];
    return ((a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v) * scale;
  };
  const heightAt = (x, z) => bilinear(heights, 0.1, x, z);
  /** The lab's slope: the height gradient over ±3 m (lab.mjs PATH notes). */
  const slopeAt = (x, z) => { const d = 3; return Math.hypot(heightAt(x + d, z) - heightAt(x - d, z), heightAt(x, z + d) - heightAt(x, z - d)) / (2 * d); };
  const wetAt = (x, z) => bilinear(water, 1 / 255, x, z);
  const near = [];
  /** Records a hull's contact rectangle overlaps at a pose (bridges and records under LOW_M left out). */
  function hullContacts(x, z, yawRad, halfLength, halfWidth, out = []) {
    out.length = 0;
    const reach = Math.hypot(halfLength, halfWidth), fx = Math.sin(yawRad), fz = Math.cos(yawRad), push = { x: 0, z: 0 };
    near.length = 0;
    query(x - reach, z - reach, x + reach, z + reach, near);
    for (const r of near) {
      if (r.kind === 'bridge' || r.max[1] - r.min[1] < LOW_M) continue;
      push.x = 0; push.z = 0;
      if (pushHullFromObstacle({ x, z }, fx, fz, fz, -fx, halfLength, halfWidth, r, push)) out.push(r);
    }
    return out;
  }
  /** Whether a hull at `speedMps` crushes a record it overruns (as a battle hull does) rather than stopping on it. */
  const crushes = (r, speedMps) => !!r.crushable && speedMps > (r.crushMin ?? CRUSH_MIN_MPS);
  // the shrubs (lab features since 2026-10-08): bushes and understorey a hull drives through, so they stop no route and
  // stay out of the records, but a lens beside one sees leaves (lens-check.mjs's foreground). { x, y, z, r, h, kind }
  // on an 8 m grid.
  const shrubs = (features.shrubs ?? []).map(([x, y, z, r, h, k]) => ({ x, y, z, r, h, kind: k ? 'understorey' : 'bush' }));
  const SHRUB_CELL = 8, shrubCells = new Map();
  for (const sh of shrubs) {
    const key = `${Math.floor(sh.x / SHRUB_CELL)},${Math.floor(sh.z / SHRUB_CELL)}`;
    if (!shrubCells.has(key)) shrubCells.set(key, []);
    shrubCells.get(key).push(sh);
  }
  /** The shrubs whose crowns reach into the box x0..x1, z0..z1 (crowns stay under 8 m across). */
  function queryShrubs(x0, z0, x1, z1, out = []) {
    out.length = 0;
    for (let i = Math.floor((x0 - SHRUB_CELL) / SHRUB_CELL); i <= Math.floor((x1 + SHRUB_CELL) / SHRUB_CELL); i++) {
      for (let j = Math.floor((z0 - SHRUB_CELL) / SHRUB_CELL); j <= Math.floor((z1 + SHRUB_CELL) / SHRUB_CELL); j++) {
        for (const sh of shrubCells.get(`${i},${j}`) ?? []) {
          if (sh.x + sh.r >= x0 && sh.x - sh.r <= x1 && sh.z + sh.r >= z0 && sh.z - sh.r <= z1) out.push(sh);
        }
      }
    }
    return out;
  }
  // where a hull stands (2026-10-08: on the cliffbridge viaduct the lens check placed the hero on the gorge floor, 30 m
  // under the deck it drives): a bridge's deck where one spans the point well over the ground or over water (the Studio
  // seats hulls on decks, studioActorSupport.ts studioSupportBelly), the ground otherwise
  const bridges = records.filter((r) => r.kind === 'bridge');
  const supportAt = (x, z) => {
    const g = heightAt(x, z);
    let top = g;
    for (const r of bridges) {
      if (x < r.min[0] || x > r.max[0] || z < r.min[2] || z > r.max[2]) continue;
      if (r.max[1] > g + 1.5 || (r.max[1] > g && wetAt(x, z) > 0.3)) top = Math.max(top, r.max[1]);
    }
    return top;
  };
  const model = { records, query, heightAt, supportAt, slopeAt, wetAt, hullContacts, crushes, shrubs, queryShrubs, size: features.size };
  models.set(features, model);
  return model;
}

// --- sightlines ---------------------------------------------------------------------------------------------------
/** Does a 3D segment a→b cross an axis-aligned box [min, max]? (slab test) */
function segmentHitsBox(a, b, min, max) {
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    const d = b[k] - a[k];
    if (Math.abs(d) < 1e-9) { if (a[k] < min[k] || a[k] > max[k]) return false; continue; }
    let u0 = (min[k] - a[k]) / d, u1 = (max[k] - a[k]) / d;
    if (u0 > u1) { const t = u0; u0 = u1; u1 = t; }
    if (u0 > t0) t0 = u0;
    if (u1 < t1) t1 = u1;
    if (t0 > t1) return false;
  }
  return true;
}
/**
 * A record's solid as oriented boxes {cx, cz, s, c, hw, hl, y0, y1} (the footprint's own: an OBB as itself, a circle
 * as its square, a convex or a part without a shape as its bounds), plus a tree's canopy: from the trunk's top up two
 * canopy radii, the canopy radius around the trunk.
 */
export function solidsOf(r) {
  if (r._solids) return r._solids;
  const out = [];
  const add = (shape, y0, y1) => {
    if (shape?.kind === 'obb') out.push({ cx: shape.cx, cz: shape.cz, s: Math.sin(shape.yaw), c: Math.cos(shape.yaw), hw: shape.hw, hl: shape.hl, y0, y1 });
    else if (shape?.kind === 'circle') out.push({ cx: shape.cx, cz: shape.cz, s: 0, c: 1, hw: shape.r, hl: shape.r, y0, y1 });
    else if (shape?.kind === 'convex') {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < shape.points.length; i += 2) { x0 = Math.min(x0, shape.points[i]); x1 = Math.max(x1, shape.points[i]); z0 = Math.min(z0, shape.points[i + 1]); z1 = Math.max(z1, shape.points[i + 1]); }
      out.push({ cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, s: 0, c: 1, hw: (x1 - x0) / 2, hl: (z1 - z0) / 2, y0, y1 });
    } else out.push({ cx: (r.min[0] + r.max[0]) / 2, cz: (r.min[2] + r.max[2]) / 2, s: 0, c: 1, hw: (r.max[0] - r.min[0]) / 2, hl: (r.max[2] - r.min[2]) / 2, y0, y1 });
  };
  if (r.shape2?.kind === 'compound') for (const part of r.shape2.parts) add(part, part.y0 ?? r.min[1], part.y1 ?? r.max[1]);
  else add(r.shape2, r.min[1], r.max[1]);
  if (r.canopyR) {
    const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2;
    out.push({ cx, cz, s: 0, c: 1, hw: r.canopyR, hl: r.canopyR, y0: r.max[1] - r.canopyR * 0.3, y1: r.max[1] + r.canopyR * 1.7, canopy: true });
  }
  r._solids = out;
  return out;
}
/** A point in a solid's frame: [across, y, along]. */
const local = (o, p) => { const dx = p[0] - o.cx, dz = p[2] - o.cz; return [dx * o.c - dz * o.s, p[1], dx * o.s + dz * o.c]; };
const segmentHitsSolid = (o, a, b) => segmentHitsBox(local(o, a), local(o, b), [-o.hw, o.y0, -o.hl], [o.hw, o.y1, o.hl]);

/**
 * The records (and canopies) a sightline from `a` to `b` ([x, y, z], absolute heights) passes through. Crushable
 * solids within `skipNearB` m of b are left out (the subject's own neighbourhood: the prop it is crushing), and so is
 * any record `ignore` names.
 */
export function sightBlockers(model, a, b, { skipNearB = 2.5, ignore = null, out = [] } = {}) {
  out.length = 0;
  const found = [];
  model.query(Math.min(a[0], b[0]) - 8, Math.min(a[2], b[2]) - 8, Math.max(a[0], b[0]) + 8, Math.max(a[2], b[2]) + 8, found);
  for (const r of found) {
    if (r.max[1] - r.min[1] < LOW_M || ignore?.(r)) continue;
    for (const o of solidsOf(r)) {
      if (!o.canopy && r.crushable && Math.hypot(o.cx - b[0], o.cz - b[2]) < skipNearB) continue;
      if (segmentHitsSolid(o, a, b)) { out.push(r); break; }
    }
  }
  return out;
}
/** The record (or canopy) a point ([x, y, z]) sits inside, padded by `pad`; null when clear. */
export function insideRecord(model, p, pad = 0.4) {
  const found = [];
  model.query(p[0] - 12, p[2] - 12, p[0] + 12, p[2] + 12, found);
  for (const r of found) {
    for (const o of solidsOf(r)) {
      const q = local(o, p);
      if (Math.abs(q[0]) < o.hw + pad && Math.abs(q[2]) < o.hl + pad && q[1] > o.y0 - pad && q[1] < o.y1 + pad) return r;
    }
  }
  return null;
}
