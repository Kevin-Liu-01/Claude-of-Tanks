#!/usr/bin/env node
/**
 * Tank-world contact census (physics interactions stream, 2026-10-13; the owner: "for tanks on rocks, fix all hitboxes
 * and tank interactions with them, like with buildings or if they land on top of buildings or other weird objects! all
 * physics engine stuff i want to account for").
 *
 * Every way a tank meets the world, on every battlefield and its assault-trench variant, through the real network
 * authority (sim/authoritativeMatch.ts by way of tools/physics-torture.mjs runCase: the movement step, the structure
 * support, the obstacle solver, the crush and ram laws, the hull-on-hull contact pass) over the map's committed collision
 * shard and height field (server/dedicatedWorldCollision.ts) — the worlds the dedicated server and the browser host run.
 * Node-only and deterministic: no GPU, no randomness the arguments do not fix.
 *
 * Sites are sampled from the shard by contact class (seeded by the map id, spread apart):
 *   terrain  rocks and stones, scenery masses, rubble heaps, steep cuts and ledges, rough ground (crater rims, berms)
 *   walls    building walls and corners (structures), tall outcrops
 *   roofs    building tops: flat, stepped (pitched roofs are band stairs), edges, driving onto one from the slope
 *   objects  wrecks, vehicles, crates and stores, sandbags, fences, crushable walls, hedgehogs, bunkers, sheds, poles,
 *            bridges and abutments, trenches, shores
 *   tanks    tank-on-tank: head-on, pushing, T-bone, stacking, driving onto a hull, wreck entities
 * and driven through scripted maneuvers (approach, cross, crawl, ram and reverse out, scrape, pivot, drop on, stand,
 * drive off, stop and rest). Each run's metrics are physics-torture's plus the census's own (jolts as the second
 * difference of the root over three steps, tilt, fall-through, a solid's inside, the world's edge, contact launches).
 *
 *   node tools/tank-world-contact-census.mjs --maps=urban,titan_gorge [--variants=base,assault-trenches]
 *        [--classes=terrain,walls,roofs,objects,tanks] [--sites=4] [--out=<dir>]     one JSON per map and variant
 *   node tools/tank-world-contact-census.mjs --ledger=<dir> [--base=<dir>] [--md=<file>] [--json=<file>]
 *                                                    the ranked defect ledger (and the change against a base census)
 *   node tools/tank-world-contact-census.mjs --maps=urban --only=<run id> --trace=<file.json>
 *                                                    one run again, its hull pose every step
 *   node tools/tank-world-contact-census.mjs --fidelity --maps=urban,titan_gorge --out=<dir>
 *                                                    hitbox fidelity (tools/tankWorldContactFidelity.mjs): support tops
 *                                                    against the drawn tops, contact-band phantom and leak per kind
 *   ... --ledger=<dir> --fidelity-dir=<dir>          the ledger with the fidelity tables
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runCase } from './physics-torture.mjs';
import { ensureAuthorityFleet } from '../src/vehicles/authorityFleet.ts';
import { getSpec } from '../src/vehicles/specs.ts';
import { MAP_IDS } from '../src/world/maps/mapIds.ts';
import { HULL_STANDABLE_HEIGHT_M, pointInsideCollisionRecord } from '../src/world/collision.ts';
import { tankContactRect } from '../src/sim/tankContactShape.ts';

export const CLASSES = Object.freeze(['terrain', 'walls', 'roofs', 'objects', 'tanks']);
export const VARIANTS = Object.freeze(['base', 'assault-trenches']);
/** The hulls the sites rotate through (light, medium, main battle, heavy). */
export const CENSUS_HULLS = Object.freeze(['t90m', 'jpz_e100_x', 'bmp2', 'm1a2']);
const WORLD_HALF_M = 512;
const DT = 1 / 60;

// ---- deterministic picks ------------------------------------------------------------------------------------------
function hashString(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Up to `count` candidates in a seeded order, each at least `spacing` metres from those already taken. */
function spreadPick(candidates, count, spacing, seed) {
  const random = mulberry32(seed);
  const keyed = candidates.map((c) => ({ c, k: random() }));
  keyed.sort((a, b) => a.k - b.k);
  const out = [];
  for (const { c } of keyed) {
    if (out.length >= count) break;
    if (out.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < spacing)) continue;
    out.push(c);
  }
  return out;
}

// ---- record geometry ----------------------------------------------------------------------------------------------
const partsOf = (record) => (record.shape2?.kind === 'compound' ? record.shape2.parts : [record.shape2 ?? null]);
const centerOf = (record) => ({ x: (record.min[0] + record.max[0]) / 2, z: (record.min[2] + record.max[2]) / 2 });
const radiusOf = (record) => Math.hypot(record.max[0] - record.min[0], record.max[2] - record.min[2]) / 2;
const isStructure = (record) => record.kind === 'structure' || record.structureIdx != null;

/** A part's outline (x, z pairs). */
function partOutline(record, part) {
  if (!part) return [record.min[0], record.min[2], record.max[0], record.min[2], record.max[0], record.max[2], record.min[0], record.max[2]];
  if (part.kind === 'obb') {
    const fx = Math.sin(part.yaw), fz = Math.cos(part.yaw), rx = fz, rz = -fx;
    const out = [];
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      out.push(part.cx + rx * part.hw * a + fx * part.hl * b, part.cz + rz * part.hw * a + fz * part.hl * b);
    }
    return out;
  }
  if (part.kind === 'circle') {
    const out = [];
    for (let i = 0; i < 12; i++) out.push(part.cx + part.r * Math.sin(i * Math.PI / 6), part.cz + part.r * Math.cos(i * Math.PI / 6));
    return out;
  }
  return [...part.points];
}
/** The convex hull (counter-clockwise x, z pairs) of a point list. */
function convexHull(points) {
  const pts = [];
  for (let i = 0; i < points.length; i += 2) pts.push([points[i], points[i + 1]]);
  pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts.flat();
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), p) <= 0) lower.pop(); lower.push(p); }
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)].flat();
}
/** The record's ground-band outline: the hull of its parts that reach down to its floor (a wall's foot, not its eaves). */
function groundOutline(record) {
  const parts = partsOf(record);
  const low = parts.filter((p) => !p || (p.y0 ?? record.min[1]) <= record.min[1] + 0.6);
  const points = [];
  for (const p of (low.length ? low : parts)) points.push(...partOutline(record, p));
  return convexHull(points);
}

/** The highest standable top under (x, z) — the structure support's rule without the step-up ceiling. */
function supportTopAt(records, x, z) {
  let best = -Infinity;
  for (const record of records) {
    if (record.crushed || record.dead || record.crushable) continue;
    if (record.max[1] - record.min[1] < HULL_STANDABLE_HEIGHT_M) continue;
    if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
    for (const part of partsOf(record)) {
      const top = part?.y1 ?? record.max[1];
      if (top > best && pointInsideCollisionRecord(record, part, x, z)) best = top;
    }
  }
  return best;
}
/** Whether any solid (non-crushable) record's part stands over (x, z) above `y` + 0.3. */
function solidAt(records, x, z, y = -Infinity) {
  for (const record of records) {
    if (record.crushed || record.dead || record.crushable) continue;
    if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
    for (const part of partsOf(record)) {
      const top = part?.y1 ?? record.max[1];
      if (top > y + 0.3 && pointInsideCollisionRecord(record, part, x, z)) return true;
    }
  }
  return false;
}

// ---- the world one map's runs share -----------------------------------------------------------------------------
async function loadWorld(mapId, variant) {
  const { createDedicatedWorldCollision } = await import('../server/dedicatedWorldCollision.ts');
  const worldCollision = createDedicatedWorldCollision(mapId, { variant: variant === 'base' ? null : variant });
  const hf = worldCollision.heightField;
  const fn = (x, z) => hf.getHeightAt(x, z);
  const contact = hf.getContactHeightAt ? (x, z) => hf.getContactHeightAt(x, z) : fn;
  const water = (x, z) => hf.getWaterDepthAt?.(x, z) ?? 0;
  const query = (x, z, r) => worldCollision.queryObstacles(x - r, z - r, x + r, z + r, []).slice();
  return { mapId, variant, worldCollision, hf, fn, contact, water, query };
}
/** Clear the crushes, falls and ram marks a run left on the shared records (a fresh world for the next run). */
function resetWorld(world) {
  for (const list of [world.worldCollision.getObstacles(), world.worldCollision.getColliders?.() ?? []]) {
    for (const record of list) {
      if (record.crushed) delete record.crushed;
      if (record.dead) delete record.dead;
      if (record._pressS) { delete record._pressS; delete record._pressT; }
    }
  }
}
const grade = (world, x, z, dx, dz) => (world.contact(x + dx, z + dz) - world.contact(x - dx, z - dz)) / (2 * Math.hypot(dx, dz));
const gradeMag = (world, x, z) => Math.hypot(grade(world, x, z, 1, 0), grade(world, x, z, 0, 1));
/** A spawn point a hull can start from: dry, not on a solid, on ground it can stand on. */
function clearSpawn(world, x, z, records) {
  if (Math.abs(x) > WORLD_HALF_M - 30 || Math.abs(z) > WORLD_HALF_M - 30) return false;
  if (world.water(x, z) > 0.4) return false;
  if (gradeMag(world, x, z) > 0.45) return false;
  for (const [ox, oz] of [[0, 0], [2.6, 0], [-2.6, 0], [0, 2.6], [0, -2.6], [1.9, 1.9], [-1.9, 1.9], [1.9, -1.9], [-1.9, -1.9]]) {
    if (solidAt(records, x + ox, z + oz, world.contact(x + ox, z + oz) - 0.2)) return false;
  }
  return true;
}
const yawToward = (dx, dz) => Math.atan2(dx, dz);

// ---- maneuvers ------------------------------------------------------------------------------------------------------
// Each returns the case's timing, input and windows: { seconds, spawn, input(t), rest, mustMove, grounded, mayTip }.
// `grounded`: the hull should never be thrown off its support (a contact launch is a defect); `mayTip`: a fall the
// hull may tip over in (driving off a roof), so tipping is not counted against it.
const hold = (throttle = 0, steer = 0, brake = false) => ({ throttle, steer, brake });
function restAfter(t, extra = {}) { return { afterS: t, settleS: 1, deadlineS: t + 3, spanS: 1.5, ...extra }; }

/** Drive at the feature; with `backS`, then back out of wherever it ended for that long (it must make way: a hull that
 * cannot is wedged), then brake and rest. */
function driveAcross({ x, z, yaw, speed = 0, throttle = 1, driveS = 6, backS = 0, total = 10, governMps = Infinity }) {
  return {
    seconds: total + backS, spawn: { x, z, yaw, speed: speed || undefined }, allowBlocked: true,
    // (a governor holds the approach near its pace: the throttle is a force, and a crawl at 0.35 reached 7.6 m/s)
    input: (t, s) => (t < driveS ? hold(s && Math.abs(s.speed) > governMps ? 0 : throttle)
      : t < driveS + backS ? hold(-1) : hold(0, 0, true)),
    mustMove: backS ? [[driveS + 0.6, driveS + backS]] : undefined, rest: restAfter(driveS + backS), grounded: true,
  };
}
function ramAndReverse({ x, z, yaw, speed = 'top', ramS = 3, backS = 3, total = 10 }) {
  return {
    seconds: total, spawn: { x, z, yaw, speed }, allowBlocked: true,
    input: (t) => (t < ramS ? hold(1) : t < ramS + backS ? hold(-1) : hold(0, 0, true)),
    // the reverse out must make way (wedged otherwise), after a half second for the gearbox to swap
    mustMove: [[ramS + 0.6, ramS + backS]], rest: restAfter(ramS + backS), grounded: true,
  };
}
function pivotInPlace({ x, z, yaw, steer = 1, turnS = 3.5, total = 7 }) {
  return {
    seconds: total, spawn: { x, z, yaw }, allowBlocked: true, input: (t) => (t < turnS ? hold(0, steer) : hold(0, 0, true)),
    rest: restAfter(turnS), grounded: true,
  };
}
function dropOn({ x, z, yaw, dropTo, total = 8 }) {
  return { seconds: total, spawn: { x, z, yaw, dropTo }, input: () => hold(0, 0, true), rest: restAfter(total - 3), mayTip: true };
}
function standOn({ x, z, yaw, total = 7 }) {
  return { seconds: total, spawn: { x, z, yaw, dropTo: 0.12 }, input: () => hold(0, 0, true), rest: { afterS: 2, settleS: 1, deadlineS: 4, spanS: 3 }, grounded: true };
}
function driveOff({ x, z, yaw, throttle = 0.6, waitS = 1, driveS = 4, total = 11 }) {
  return {
    seconds: total, spawn: { x, z, yaw, dropTo: 0.12 },
    input: (t) => (t < waitS ? hold(0, 0, true) : t < waitS + driveS ? hold(throttle) : hold(0, 0, true)),
    rest: restAfter(waitS + driveS, { deadlineS: waitS + driveS + 4 }), mayTip: true,
  };
}

// ---- site samplers by class -----------------------------------------------------------------------------------------
/**
 * Approach a point from `range` metres out along one of eight bearings whose start and path are clear (seeded): no
 * solid before the feature, no deep water, and no drop or wall along the line through it and `beyond` metres past it
 * (a hull sent over a feature is not sent off a cliff behind it).
 */
function approachFrom(world, records, cx, cz, range, seed, { pathCheck = true, beyond = 8 } = {}) {
  const random = mulberry32(seed);
  const first = Math.floor(random() * 8);
  for (let k = 0; k < 8; k++) {
    const a = ((first + k) % 8) * Math.PI / 4;
    const dx = Math.sin(a), dz = Math.cos(a);
    const sx = cx - dx * range, sz = cz - dz * range;
    if (!clearSpawn(world, sx, sz, records)) continue;
    let blocked = false;
    let lastH = world.contact(sx, sz);
    for (let d = 1.5; d < range + beyond && !blocked; d += 1.5) {
      const px = sx + dx * d, pz = sz + dz * d;
      const h = world.contact(px, pz);
      if (Math.abs(h - lastH) > 0.9 || world.water(px, pz) > 0.8) blocked = true;
      if (pathCheck && d > 3.5 && d < range - 3 && solidAt(records, px, pz, h)) blocked = true;
      lastH = h;
    }
    if (blocked) continue;
    return { x: sx, z: sz, yaw: yawToward(dx, dz), dx, dz };
  }
  return null;
}
/** The drive time that carries a hull from `start` metres out across a feature of radius r and a few metres past it. */
const crossingS = (start, r, mps) => Math.min(4.5, Math.max(1.5, (start + 2 * r + 5) / mps));
/** ... and at a 2.5 m/s crawl (its first second spent getting there). */
const crawlS = (start, r) => Math.min(9, Math.max(3, 1 + (start + 2 * r + 4) / 2.5));

function terrainSites(world, count, seed) {
  const obstacles = world.worldCollision.getObstacles();
  const sites = [];
  const rockLike = obstacles.filter((r) => !isStructure(r) && !r.crushed && (r.kind === 'small-rock' || (r.kind == null && !r.crushable)));
  const stones = rockLike.filter((r) => r.max[1] - r.min[1] <= 3.5 && radiusOf(r) < 9).map((r) => ({ ...centerOf(r), record: r }));
  const outcrops = rockLike.filter((r) => r.max[1] - r.min[1] > 3.5 || radiusOf(r) >= 9).map((r) => ({ ...centerOf(r), record: r }));
  const rubble = obstacles.filter((r) => r.kind === 'rubble').map((r) => ({ ...centerOf(r), record: r }));
  for (const site of spreadPick(stones, count + 2, 18, seed + 1)) sites.push({ sub: site.record.kind ?? 'mass', ...site });
  for (const site of spreadPick(outcrops, Math.ceil(count / 2), 30, seed + 2)) sites.push({ sub: 'outcrop', ...site });
  for (const site of spreadPick(rubble, Math.ceil(count / 2), 20, seed + 3)) sites.push({ sub: 'rubble', ...site });
  // terrain alone: steep cuts and ledges, rough ground (a 3 m ring that leaves its plane by > 0.35 m: crater rims, berms)
  const steep = [], rough = [];
  for (let x = -WORLD_HALF_M + 40; x <= WORLD_HALF_M - 40; x += 12) {
    for (let z = -WORLD_HALF_M + 40; z <= WORLD_HALF_M - 40; z += 12) {
      if (world.water(x, z) > 0.2) continue;
      const g = gradeMag(world, x, z);
      if (g > 0.55 && g < 1.25) steep.push({ x, z, g });
      const h0 = world.contact(x, z);
      const gx = grade(world, x, z, 1.5, 0), gz = grade(world, x, z, 0, 1.5);
      let dev = 0;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, ox = 3 * Math.sin(a), oz = 3 * Math.cos(a);
        dev = Math.max(dev, Math.abs(world.contact(x + ox, z + oz) - (h0 + gx * ox + gz * oz)));
      }
      if (dev > 0.35 && g < 0.6) rough.push({ x, z, dev });
    }
  }
  const nearRecord = (s) => world.query(s.x, s.z, 6).some((r) => !r.crushable && !r.crushed);
  for (const site of spreadPick(steep.filter((s) => !nearRecord(s)), Math.ceil(count / 2), 60, seed + 4)) sites.push({ sub: 'steep', ...site });
  for (const site of spreadPick(rough.filter((s) => !nearRecord(s)), Math.ceil(count / 2), 60, seed + 5)) sites.push({ sub: 'rough', ...site });
  return sites;
}

function terrainManeuvers(world, site, seed) {
  const records = world.query(site.x, site.z, 30);
  const out = [];
  if (site.sub === 'steep') {
    // up the fall line and across it
    const gx = grade(world, site.x, site.z, 1, 0), gz = grade(world, site.x, site.z, 0, 1), g = Math.hypot(gx, gz) || 1;
    const ux = gx / g, uz = gz / g;
    if (clearSpawn(world, site.x - ux * 9, site.z - uz * 9, records)) {
      out.push(['climb', driveAcross({ x: site.x - ux * 9, z: site.z - uz * 9, yaw: yawToward(ux, uz), driveS: 5, backS: 2.5, total: 9, governMps: 6 })]);
    }
    if (clearSpawn(world, site.x + uz * 10, site.z - ux * 10, records)) {
      out.push(['traverse', driveAcross({ x: site.x + uz * 10, z: site.z - ux * 10, yaw: yawToward(-uz, ux), speed: 7, driveS: 3, total: 7, governMps: 7 })]);
    }
    return out;
  }
  if (site.sub === 'outcrop') {
    const r = Math.min(radiusOf(site.record), 12);
    // the face nearest a clear approach: drive into it, then back off
    const a = approachFrom(world, records, site.x, site.z, r + 9, seed);
    if (a) out.push(['ram', ramAndReverse({ x: a.x, z: a.z, yaw: a.yaw, speed: 8 })]);
    return out;
  }
  const r = site.record ? radiusOf(site.record) : 1.5;
  const fast = approachFrom(world, records, site.x, site.z, r + 10, seed);
  if (fast) out.push(['cross', driveAcross({ x: fast.x, z: fast.z, yaw: fast.yaw, speed: 8, driveS: crossingS(r + 10, r, 8), backS: 2.5, total: 7, governMps: 8 })]);
  const slow = approachFrom(world, records, site.x, site.z, r + 5, seed + 17, { pathCheck: false });
  if (slow) out.push(['crawl', driveAcross({ x: slow.x, z: slow.z, yaw: slow.yaw, throttle: 0.5, driveS: crawlS(r + 5, r), backS: 2.5, total: 11, governMps: 2.5 })]);
  if (site.record) {
    // a hull parked with a track edge over the stone's flank, turning in place, then reversing off it
    const side = approachFrom(world, records, site.x, site.z, r + 1.2, seed + 29, { pathCheck: false });
    if (side) {
      out.push(['pivot', pivotInPlace({ x: side.x, z: side.z, yaw: side.yaw + Math.PI / 2, steer: seed % 2 ? 1 : -1 })]);
      const back = { x: site.x + side.dx * (r + 4), z: site.z + side.dz * (r + 4) };
      if (clearSpawn(world, back.x, back.z, records)) {
        out.push(['reverse', { ...driveAcross({ x: back.x, z: back.z, yaw: side.yaw, throttle: -0.8, driveS: crawlS(4, r), total: 9, governMps: 3 }) }]);
      }
    }
  }
  return out;
}

function wallSites(world, count, seed) {
  const structures = world.worldCollision.getObstacles().filter((r) => isStructure(r) && !r.crushable && r.max[1] - r.min[1] >= 2);
  return spreadPick(structures.map((r) => ({ ...centerOf(r), record: r })), count, 25, seed + 7).map((s) => ({ sub: 'building', ...s }));
}

function wallManeuvers(world, site, seed) {
  const record = site.record;
  const records = world.query(site.x, site.z, radiusOf(record) + 25);
  const outline = groundOutline(record);
  const n = outline.length / 2;
  const edges = [];
  for (let i = 0; i < n; i++) {
    const ax = outline[2 * i], az = outline[2 * i + 1], bx = outline[(2 * i + 2) % (2 * n)], bz = outline[(2 * i + 3) % (2 * n)];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 3) continue;
    // counter-clockwise in (x, z): the outward normal is (dz, -dx)
    const nx = (bz - az) / len, nz = -(bx - ax) / len;
    edges.push({ ax, az, bx, bz, len, nx, nz, mx: (ax + bx) / 2, mz: (az + bz) / 2 });
  }
  edges.sort((a, b) => b.len - a.len);
  const out = [];
  const random = mulberry32(seed);
  for (const e of edges) {
    if (out.length >= 4) break;
    const sx = e.mx + e.nx * 13, sz = e.mz + e.nz * 13;
    if (!clearSpawn(world, sx, sz, records)) continue;
    let blocked = false;
    for (let d = 3; d < 11.5; d += 1.5) {
      const px = e.mx + e.nx * d, pz = e.mz + e.nz * d;
      if (world.water(px, pz) > 0.8 || solidAt(records, px, pz, world.contact(px, pz))) { blocked = true; break; }
    }
    if (blocked) continue;
    if (!out.some(([m]) => m === 'ram')) { out.push(['ram', ramAndReverse({ x: sx, z: sz, yaw: yawToward(-e.nx, -e.nz) })]); continue; }
    if (!out.some(([m]) => m === 'scrape')) {
      // 35 degrees onto the wall from along it, keeping the throttle on
      const ux = (e.bx - e.ax) / e.len, uz = (e.bz - e.az) / e.len, a = 35 * Math.PI / 180;
      const dx = -e.nx * Math.sin(a) + ux * Math.cos(a), dz = -e.nz * Math.sin(a) + uz * Math.cos(a);
      const px = e.mx - dx * 12, pz = e.mz - dz * 12;
      if (clearSpawn(world, px, pz, records)) out.push(['scrape', driveAcross({ x: px, z: pz, yaw: yawToward(dx, dz), speed: 8, driveS: 3, total: 7, governMps: 8 })]);
      continue;
    }
    if (!out.some(([m]) => m === 'pivot')) {
      // parked along the wall, its side half a metre off it, turning in place
      const spec = getSpec('t90m');
      const off = 0.5 * spec.dims.widthM + 0.5;
      const px = e.mx + e.nx * off, pz = e.mz + e.nz * off;
      if (!solidAt(records, px, pz, world.contact(px, pz))) {
        out.push(['pivot', pivotInPlace({ x: px, z: pz, yaw: yawToward(e.bx - e.ax, e.bz - e.az), steer: random() < 0.5 ? 1 : -1 })]);
      }
    }
  }
  // a corner: aimed at a vertex down the outward bisector
  for (let i = 0; i < n && !out.some(([m]) => m === 'corner'); i++) {
    const vx = outline[2 * i], vz = outline[2 * i + 1];
    const c = centerOf(record);
    const dx = vx - c.x, dz = vz - c.z, d = Math.hypot(dx, dz) || 1;
    const sx = vx + dx / d * 12, sz = vz + dz / d * 12;
    if (clearSpawn(world, sx, sz, records)) out.push(['corner', ramAndReverse({ x: sx, z: sz, yaw: yawToward(-dx, -dz), speed: 6 })]);
  }
  return out;
}

function roofSites(world, count, seed) {
  const structures = world.worldCollision.getObstacles().filter((r) => isStructure(r) && !r.crushable && r.max[1] - r.min[1] >= 2.2);
  const picks = spreadPick(structures.map((r) => ({ ...centerOf(r), record: r })), count * 2, 30, seed + 11);
  const sites = [];
  for (const pick of picks) {
    const record = pick.record;
    const records = world.query(pick.x, pick.z, radiusOf(record) + 20);
    // the deck: grid points 1.5 m apart whose standable top stands 2.2 m over the ground
    const deck = [];
    for (let x = record.min[0] + 0.75; x < record.max[0]; x += 1.5) {
      for (let z = record.min[2] + 0.75; z < record.max[2]; z += 1.5) {
        const top = supportTopAt(records, x, z);
        if (top - world.contact(x, z) >= 2.2) deck.push({ x, z, top });
      }
    }
    if (!deck.length) continue;
    // a hull's span (3 m wide, 6 m long) of tops round each point: level (flat) or stepping (pitched band stairs)
    let flat = null, pitched = null, edge = null;
    for (const p of deck) {
      let lo = Infinity, hi = -Infinity, holes = 0;
      for (const [ox, oz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 3], [0, -3], [1.5, 3], [-1.5, -3], [1.5, -3], [-1.5, 3]]) {
        const t = supportTopAt(records, p.x + ox, p.z + oz);
        if (!Number.isFinite(t) || t - world.contact(p.x + ox, p.z + oz) < 1) { holes++; continue; }
        lo = Math.min(lo, t); hi = Math.max(hi, t);
      }
      if (!holes && hi - lo <= 0.3 && !flat) flat = { ...p, spread: hi - lo };
      if (!holes && hi - lo > 0.6 && !pitched) pitched = { ...p, spread: hi - lo };
      if (holes >= 3 && holes <= 5 && !edge) edge = p;
    }
    const destructible = record.structureIdx != null;
    for (const [sub, p] of [['flat', flat], ['pitched', pitched], ['edge', edge]]) {
      if (p) sites.push({ sub, x: p.x, z: p.z, top: p.top, record, destructible, spread: p.spread ?? null });
    }
    // driving onto it from the slope: terrain within 0.5 m of the top beside an edge
    for (let i = 0; i < 16 && deck.length; i++) {
      const a = i * Math.PI / 8, dx = Math.sin(a), dz = Math.cos(a);
      const p = deck[Math.floor(deck.length / 2)];
      for (let d = 2; d < radiusOf(record) + 6; d += 1) {
        const x = p.x + dx * d, z = p.z + dz * d;
        if (Number.isFinite(supportTopAt(records, x, z)) && supportTopAt(records, x, z) - world.contact(x, z) > 1) continue;
        const ground = world.contact(x + dx * 3, z + dz * 3);
        if (Math.abs(ground - p.top) < 0.5 && clearSpawn(world, x + dx * 9, z + dz * 9, records)) {
          sites.push({ sub: 'slope-onto', x: x + dx * 9, z: z + dz * 9, yaw: yawToward(-dx, -dz), top: p.top, record, destructible });
          i = 99;
        }
        break;
      }
    }
    if (sites.length >= count * 3) break;
  }
  return sites;
}

function roofManeuvers(world, site, seed) {
  const random = mulberry32(seed);
  const yaw = random() * Math.PI * 2;
  if (site.sub === 'slope-onto') return [['drive-onto', driveAcross({ x: site.x, z: site.z, yaw: site.yaw, throttle: 0.7, driveS: 6, total: 11, governMps: 4 })]];
  if (site.sub === 'edge') {
    return [['edge-drop', dropOn({ x: site.x, z: site.z, yaw, dropTo: 1.5, total: 9 })],
      ['edge-stand', { ...standOn({ x: site.x, z: site.z, yaw: yaw + 1.3 }), mayTip: true, grounded: false }]];
  }
  const records = world.query(site.x, site.z, 30);
  // the nearest edge from the site: the first bearing whose top falls away within 12 m
  let off = null;
  for (let i = 0; i < 8 && !off; i++) {
    const a = yaw + i * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a);
    for (let d = 1; d < 12; d += 0.5) {
      const t = supportTopAt(records, site.x + dx * d, site.z + dz * d);
      if (!Number.isFinite(t) || site.top - t > 1.5) { off = a; break; }
    }
  }
  const list = [
    ['drop3', dropOn({ x: site.x, z: site.z, yaw, dropTo: 3 })],
    ['drop8', dropOn({ x: site.x, z: site.z, yaw: yaw + 0.6, dropTo: 8, total: 9 })],
    ['stand', standOn({ x: site.x, z: site.z, yaw })],
    ['pivot', { ...pivotInPlace({ x: site.x, z: site.z, yaw, steer: 1 }), spawn: { x: site.x, z: site.z, yaw, dropTo: 0.12 } }],
  ];
  if (off != null) list.push(['drive-off', driveOff({ x: site.x, z: site.z, yaw: off })]);
  return list;
}

const OBJECT_GROUPS = Object.freeze({
  wreck: ['tank-wreck', 'tram-wreck'],
  vehicle: ['truck', 'truckbox', 'truckflatbed', 'sedan', 'van', 'pickup', 'jeep', 'wagon', 'haycart', 'handcart'],
  stores: ['crate', 'cablespool', 'firewood', 'trough', 'bench', 'stall', 'rugframe', 'bale', 'stook', 'diemen', 'logdeck', 'container-screen'],
  sandbag: ['sandbagwall', 'sandbagbig', 'sandbagsmall'],
  fence: ['fencerail', 'fenceplank', 'fencepicket', 'fencewattle', 'barbedwire', 'gate'],
  wall: ['wallstone', 'walladobe'],
  obstacle: ['hedgehog', 'barrier'],
  bunker: ['bunker'],
  shed: ['tent', 'deserttent', 'commandtent', 'fieldhut', 'checkpointhut', 'motorpool', 'guardpost', 'transformershed', 'securityoffice',
    'servicegarage', 'fieldhospital', 'huntingblind', 'quonsethut'],
  pole: ['lamp', 'roadsign', 'bildstock', 'waysidecross', 'transformer'],
  bridge: ['bridge'],
});
const GROUP_OF = new Map(Object.entries(OBJECT_GROUPS).flatMap(([group, kinds]) => kinds.map((k) => [k, group])));

function objectSites(world, count, seed) {
  const sites = [];
  const byGroup = new Map();
  for (const record of world.worldCollision.getObstacles()) {
    const group = GROUP_OF.get(record.kind);
    if (!group) continue;
    (byGroup.get(group) ?? byGroup.set(group, []).get(group)).push({ ...centerOf(record), record });
  }
  let g = 0;
  for (const [group, list] of [...byGroup.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const n = group === 'wreck' || group === 'vehicle' || group === 'bridge' ? count : Math.max(1, Math.ceil(count / 2));
    for (const site of spreadPick(list, n, 15, seed + 31 + g++)) sites.push({ sub: group, kind: site.record.kind, ...site });
  }
  // bridges as the height field draws them: the deck's ends (abutments)
  for (const deck of world.hf.bridgeDecks ?? []) {
    for (const end of [-1, 1]) {
      sites.push({ sub: 'abutment', x: deck.x + deck.ux * end * deck.halfLength, z: deck.z + deck.uz * end * deck.halfLength,
        dirX: -deck.ux * end, dirZ: -deck.uz * end });
    }
  }
  // trenches: the variant's assault lines and the map's field lines, crossed square on
  const lines = [...(world.hf.assaultTrenchLines?.lines ?? []), ...(world.hf.fieldTrenchLines?.lines ?? [])];
  for (const line of spreadPick(lines.map((l) => ({ ...l })), Math.max(2, count), 40, seed + 41)) {
    sites.push({ sub: 'trench', x: line.x, z: line.z, dirX: line.lx, dirZ: line.lz, assault: (world.hf.assaultTrenchLines?.lines ?? []).includes(line) });
  }
  // shores: dry ground 5 m from water over 0.6 m deep
  const shores = [];
  for (let x = -WORLD_HALF_M + 40; x <= WORLD_HALF_M - 40; x += 16) {
    for (let z = -WORLD_HALF_M + 40; z <= WORLD_HALF_M - 40; z += 16) {
      if (world.water(x, z) > 0) continue;
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, dx = Math.sin(a), dz = Math.cos(a);
        if (world.water(x + dx * 6, z + dz * 6) > 0.6) { shores.push({ x, z, dirX: dx, dirZ: dz }); break; }
      }
    }
  }
  for (const site of spreadPick(shores, Math.ceil(count / 2), 60, seed + 43)) sites.push({ sub: 'shore', ...site });
  return sites;
}

function objectManeuvers(world, site, seed) {
  const records = world.query(site.x, site.z, 30);
  const out = [];
  if (site.sub === 'trench' || site.sub === 'abutment' || site.sub === 'shore') {
    const dx = site.dirX, dz = site.dirZ;
    const sx = site.x - dx * 12, sz = site.z - dz * 12;
    if (clearSpawn(world, sx, sz, records)) {
      out.push(['cross', driveAcross({ x: sx, z: sz, yaw: yawToward(dx, dz), speed: 8, driveS: crossingS(12, 2, 8), backS: 2.5, total: 7, governMps: 8 })]);
      out.push(['crawl', driveAcross({ x: site.x - dx * 7, z: site.z - dz * 7, yaw: yawToward(dx, dz), throttle: 0.5, driveS: crawlS(7, 2), backS: 2.5, total: 12, governMps: 2.5 })]);
    }
    if (site.sub === 'shore') {
      const wx = site.x + dx * 9, wz = site.z + dz * 9;
      out.push(['exit', driveAcross({ x: wx, z: wz, yaw: yawToward(-dx, -dz), throttle: 1, driveS: 6, total: 10, governMps: 6 })]);
    }
    return out;
  }
  const r = radiusOf(site.record);
  const fast = approachFrom(world, records, site.x, site.z, r + 10, seed);
  if (fast) out.push(['drive', driveAcross({ x: fast.x, z: fast.z, yaw: fast.yaw, speed: 8, driveS: crossingS(r + 10, r, 8), backS: 2.5, total: 7, governMps: 8 })]);
  const slow = approachFrom(world, records, site.x, site.z, r + 5, seed + 13, { pathCheck: false });
  if (slow) out.push(['crawl', driveAcross({ x: slow.x, z: slow.z, yaw: slow.yaw, throttle: 0.5, driveS: crawlS(r + 5, r), backS: 2.5, total: 11, governMps: 2.5 })]);
  if (['wreck', 'vehicle', 'bunker', 'bridge', 'shed', 'stores'].includes(site.sub)) {
    out.push(['drop', dropOn({ x: site.x, z: site.z, yaw: seed % 6, dropTo: 2.5 })]);
  }
  return out;
}

function tankSites(world, count, seed) {
  const flats = [];
  for (let x = -WORLD_HALF_M + 60; x <= WORLD_HALF_M - 60; x += 20) {
    for (let z = -WORLD_HALF_M + 60; z <= WORLD_HALF_M - 60; z += 20) {
      if (world.water(x, z) > 0) continue;
      if (gradeMag(world, x, z) > 0.12 || gradeMag(world, x + 10, z) > 0.15 || gradeMag(world, x - 10, z) > 0.15) continue;
      if (world.query(x, z, 16).some((r) => !r.crushable)) continue;
      flats.push({ x, z });
    }
  }
  return spreadPick(flats, Math.max(1, Math.ceil(count / 2)), 80, seed + 51).map((s) => ({ sub: 'flat', ...s }));
}

function tankManeuvers(world, site, seed) {
  const random = mulberry32(seed);
  const yaw = random() * Math.PI * 2;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), rx = fz, rz = -fx;
  const at = (along, across = 0) => ({ x: site.x + fx * along + rx * across, z: site.z + fz * along + rz * across });
  const p0 = at(-12), p1 = at(12), pp = at(2), pw = at(0);
  const o = { allowBlocked: true };
  return [
    ['headon', { ...driveAcross({ ...p0, yaw, speed: 10, driveS: 2.5, total: 7, governMps: 10 }), ...o,
      extras: [{ id: 'oncoming', specId: 'same', ...p1, yaw: yaw + Math.PI, speed: 10, input: (t) => (t < 2.5 ? hold(1) : hold(0, 0, true)) }] }],
    ['push', { ...driveAcross({ ...at(-7), yaw, driveS: 6, total: 10, governMps: 4 }), ...o, extras: [{ id: 'parked', specId: 't90m', ...pp, yaw }] }],
    ['tbone', { ...driveAcross({ ...at(-14), yaw, speed: 10, driveS: 2, total: 6, governMps: 10 }), ...o,
      extras: [{ id: 'parked', specId: 'm1a2', ...pp, yaw: yaw + Math.PI / 2 }] }],
    ['stack', { ...dropOn({ ...at(0.3, 0.2), yaw: yaw + 0.3, dropTo: 3.5, total: 9 }), extras: [{ id: 'lower', specId: 'm1a2', ...pw, yaw }] }],
    ['climb-onto', { ...driveAcross({ ...at(-6.5), yaw, throttle: 0.5, driveS: 6, total: 10, governMps: 2.5 }), ...o,
      extras: [{ id: 'parked', specId: 'bmp2', ...pw, yaw }] }],
    ['wreck-drop', { ...dropOn({ ...at(-0.6, 0.4), yaw: yaw + 0.7, dropTo: 3, total: 9 }), extras: [{ id: 'wreck', specId: 't90m', ...pw, yaw, wreck: true }] }],
    ['wreck-ram', { ...driveAcross({ ...at(-14), yaw, speed: 9, driveS: 2.5, total: 7, governMps: 9 }), ...o,
      extras: [{ id: 'wreck', specId: 'm1a2', ...pp, yaw: yaw + 0.4, wreck: true }] }],
    ['side-scrape', { ...driveAcross({ ...at(-10, -2.1), yaw, speed: 7, driveS: 3, total: 7, governMps: 7 }), ...o,
      extras: [{ id: 'other', specId: 't90m', ...at(-10, 2.1), yaw, speed: 7, input: (t) => (t < 4 ? hold(1, -0.25) : hold(0, 0, true)) }] }],
  ];
}

const SAMPLERS = {
  terrain: [terrainSites, terrainManeuvers],
  walls: [wallSites, wallManeuvers],
  roofs: [roofSites, roofManeuvers],
  objects: [objectSites, objectManeuvers],
  tanks: [tankSites, tankManeuvers],
};

// ---- the defects a run can show --------------------------------------------------------------------------------------
/** Each: the metric, its limit, its weight in the ranking, and the runs it applies to. */
export const DEFECTS = Object.freeze([
  { id: 'nan', what: 'NaN or Infinity in the movement state', sev: 10, value: (m) => m.nan, max: 0 },
  { id: 'outOfWorld', what: 'left the world', sev: 10, value: (m) => (m.outOfWorld ? 1 : 0), max: 0 },
  { id: 'fellThrough', what: 'root more than 0.5 m under the ground (fell through)', sev: 9, value: (m) => m.fellThroughM, max: 0.5 },
  { id: 'insideSolid', what: 'root inside a solid record, > 0.3 m under its top (sank in, fell through a roof)', sev: 8, value: (m) => m.insideSolidM, max: 0.3 },
  { id: 'launch', what: 'thrown off its support by a contact (takeoff 2.5 m/s over its ground grade, no jump)', sev: 7, value: (m) => m.takeoffMaxMps, max: 2.5, when: (r) => r.grounded },
  { id: 'energy', what: 'energy gained in flight or a rebound over the law', sev: 7, value: (m) => Math.max(m.energyGainMaxJkg - 0.2, m.reboundExcessMps - 0.05, 0), max: 0 },
  { id: 'popXZ', what: 'unexplained horizontal step > 12 cm (pop)', sev: 6, value: (m) => m.popXZMaxM, max: 0.12 },
  { id: 'popY', what: 'unexplained vertical step > 12 cm (pop)', sev: 6, value: (m) => m.popYMaxM, max: 0.12 },
  { id: 'obstaclePen', what: 'left overlapping a collider > 10 cm after the step', sev: 6, value: (m) => m.obstaclePenMaxM, max: 0.10 },
  { id: 'roofSink', what: 'stood more than 25 cm into a top it stands on', sev: 6, value: (m) => m.roofSinkMaxM, max: 0.25 },
  { id: 'tip', what: 'overturned where nothing should overturn it', sev: 6, value: (m) => m.overturnedS, max: 0, when: (r) => !r.mayTip },
  // (jolts are judged on the grounded maneuvers: a drop's own landing stops a fall in a few steps by design)
  { id: 'joltY', what: 'vertical jolt > 12 cm while driving or standing (second difference over three steps)', sev: 5, value: (m) => m.joltYMaxM,
    max: 0.12, when: (r) => r.grounded },
  { id: 'snap', what: 'attitude snap > 0.05 rad in a step', sev: 5, value: (m) => m.snapMaxRad, max: 0.05 },
  { id: 'hullPen', what: 'left overlapping another hull > 15 cm', sev: 5, value: (m) => m.hullPenMaxM, max: 0.15 },
  { id: 'stuck', what: 'wedged: made no way for > 0.6 s backing out', sev: 5, value: (m) => m.longestStuckS, max: 0.6, when: (r) => r.mustMove },
  { id: 'bodyPen', what: 'armor shell > 5 cm into the ground or a top', sev: 4, value: (m) => m.bodyPenMaxM, max: 0.05 },
  { id: 'joltXZ', what: 'horizontal jolt > 6 cm off a hard contact', sev: 4, value: (m) => m.joltXZMaxM, max: 0.06 },
  { id: 'restJitter', what: 'pose noise at rest (> 0.5 mm or 0.5 mrad rms a step)', sev: 4,
    value: (m) => (m.rest ? Math.max(m.rest.jitterYRmsMm, m.rest.jitterAttRmsMrad) : 0), max: 0.5 },
  { id: 'jink', what: 'contact push flipping side to side (> 3 reversals)', sev: 4, value: (m) => m.pushFlips, max: 3 },
  { id: 'restCreep', what: 'creeping at rest (> 5 mm/s)', sev: 3, value: (m) => (m.rest ? Math.abs(m.rest.creepMmS) : 0), max: 5 },
  { id: 'joltYfelt', what: 'vertical jolt > 6 cm while driving or standing (felt)', sev: 2, value: (m) => m.joltYMaxM, max: 0.06,
    when: (r) => r.grounded },
]);

export function defectsOf(row) {
  const out = [];
  for (const d of DEFECTS) {
    if (d.when && !d.when(row)) continue;
    const v = d.value(row.m);
    if (v > d.max) out.push(d.id);
  }
  return out;
}

// ---- one map ---------------------------------------------------------------------------------------------------------
const KEEP = ['nan', 'popXZMaxM', 'popsXZ', 'popYMaxM', 'popsY', 'snapMaxRad', 'snaps', 'jerkP99', 'bodyPenMaxM', 'obstaclePenMaxM',
  'hullPenMaxM', 'roofSinkMaxM', 'gearCompMaxM', 'longestStuckS', 'stuckS', 'pushFlips', 'overturnedS', 'tumblingS', 'maxLandingMps',
  'energyGainMaxJkg', 'reboundExcessMps', 'closingExcessMps', 'liftM', 'longestAirS', 'perchedS', 'progressM', 'joltYMaxM', 'joltsY6',
  'joltsY12', 'joltXZMaxM', 'joltsXZ6', 'joltAt', 'tiltMaxDeg', 'fellThroughM', 'insideSolidM', 'insideSolidS', 'outOfWorld',
  'takeoffMaxMps', 'launches', 'rest', 'final', 'bodyPenAt', 'fallDamageHp', 'impactDamageHp'];
function compact(metrics) {
  const out = {};
  for (const key of KEEP) {
    const v = metrics[key];
    out[key] = typeof v === 'number' ? +v.toFixed(4) : v;
  }
  return out;
}

export async function censusMap(mapId, { variant = 'base', classes = CLASSES, sites = 4, world: worldId = 'earth', only = null, trace = null,
  onRow = null } = {}) {
  const world = await loadWorld(mapId, variant);
  const seed = hashString(`${mapId}`);
  const rows = [];
  let n = 0;
  for (const cls of classes) {
    const [sample, maneuvers] = SAMPLERS[cls];
    const list = sample(world, sites, seed + CLASSES.indexOf(cls) * 1009);
    list.forEach((site, siteIndex) => {
      const plans = maneuvers(world, site, seed + siteIndex * 97 + CLASSES.indexOf(cls));
      plans.forEach(([maneuver, plan], planIndex) => {
        const hullId = CENSUS_HULLS[(siteIndex + planIndex + CLASSES.indexOf(cls)) % CENSUS_HULLS.length];
        const id = `${mapId}${variant === 'base' ? '' : `@${variant}`}/${cls}/${site.sub}/${siteIndex}/${maneuver}`;
        if (only && id !== only) return;
        resetWorld(world);
        // (the records the metrics read: those round the site, without the trees, which every hull fells on contact)
        const near = world.query(site.x, site.z, 40).filter((r) => r.treeIdx == null && r.kind !== 'tree');
        const caseDef = {
          id, mapId, seconds: plan.seconds, spawn: plan.spawn, input: plan.input, rest: plan.rest, mustMove: plan.mustMove,
          allowBlocked: plan.allowBlocked, extras: plan.extras, worldHalfM: WORLD_HALF_M - 2, floorY: world.hf.minY - 20,
          // (steps and jolts are read from 0.3 s: the spawn's own seat on uneven ground is the harness's, not the sim's)
          metricsFromS: 0.3,
          anchor: { x: site.x > 0 ? site.x - 200 : site.x + 200, z: site.z > 0 ? site.z - 200 : site.z + 200 },
          world: { fn: world.fn, contact: world.contact, heightField: world.hf, obstacles: near, worldCollision: world.worldCollision },
        };
        const poses = trace ? [] : null;
        const started = performance.now();
        let metrics;
        try {
          metrics = runCase(hullId, worldId, caseDef, {
            replay: false,
            trace: poses ? (tick, match) => {
              const s = match.entityById.get('subject').state;
              poses.push({ t: +(tick * DT).toFixed(4), x: +s.pos.x.toFixed(4), y: +s.pos.y.toFixed(4), z: +s.pos.z.toFixed(4),
                yaw: +s.yaw.toFixed(4), pitch: +s.visualPitch.toFixed(4), roll: +s.visualRoll.toFixed(4), speed: +s.speed.toFixed(3),
                grounded: s.grounded, sup: +s._sup.y.toFixed(4) });
            } : null,
          });
        } catch (error) {
          metrics = { nan: 1, error: String(error?.stack ?? error).slice(0, 400) };
        }
        const row = { id, map: mapId, variant, cls, sub: site.sub, kind: site.kind ?? site.record?.kind ?? null,
          site: { x: +site.x.toFixed(2), z: +site.z.toFixed(2), top: site.top != null ? +site.top.toFixed(2) : undefined,
            destructible: site.destructible, spread: site.spread != null ? +site.spread.toFixed(2) : undefined },
          maneuver, hull: hullId, grounded: !!plan.grounded, mayTip: !!plan.mayTip, mustMove: !!plan.mustMove, allowBlocked: !!plan.allowBlocked,
          ms: Math.round(performance.now() - started), m: metrics.error ? { ...metrics } : compact(metrics) };
        row.defects = metrics.error ? ['nan'] : defectsOf(row);
        rows.push(row);
        n++;
        onRow?.(row);
        if (poses) writeFileSync(trace, JSON.stringify({ id, hull: hullId, spawn: plan.spawn, poses }, null, 0));
      });
    });
  }
  world.worldCollision.release?.();
  return rows;
}

// ---- the ledger ---------------------------------------------------------------------------------------------------------
function readCensus(dir) {
  const rows = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));
    if (Array.isArray(data.rows)) rows.push(...data.rows);
  }
  // re-judge with this tree's defect table (a base census written by an older table reads the same way)
  for (const row of rows) row.defects = row.m?.error ? ['nan'] : defectsOf(row);
  return rows;
}

export function ledger(rows, baseRows = null) {
  const byClass = {};
  const byMap = {};
  const defectIndex = new Map(DEFECTS.map((d) => [d.id, d]));
  for (const row of rows) {
    const c = byClass[row.cls] ??= { runs: 0, withDefect: 0, defects: {}, subs: {} };
    c.runs++;
    if (row.defects.length) c.withDefect++;
    const s = c.subs[row.sub] ??= { runs: 0, withDefect: 0, defects: {} };
    s.runs++;
    if (row.defects.length) s.withDefect++;
    for (const d of row.defects) {
      c.defects[d] = (c.defects[d] ?? 0) + 1;
      s.defects[d] = (s.defects[d] ?? 0) + 1;
    }
    const key = row.variant === 'base' ? row.map : `${row.map}@at`;
    const m = byMap[key] ??= { runs: 0, withDefect: 0, score: 0 };
    m.runs++;
    if (row.defects.length) m.withDefect++;
    for (const d of row.defects) m.score += defectIndex.get(d).sev;
  }
  // the ranking: class x defect by weight x count
  const ranked = [];
  for (const [cls, c] of Object.entries(byClass)) {
    for (const [d, count] of Object.entries(c.defects)) {
      const def = defectIndex.get(d);
      const worst = rows.filter((r) => r.cls === cls && r.defects.includes(d))
        .sort((a, b) => def.value(b.m) - def.value(a.m)).slice(0, 5)
        .map((r) => ({ id: r.id, hull: r.hull, value: +def.value(r.m).toFixed(3), kind: r.kind }));
      const subs = {};
      for (const r of rows) if (r.cls === cls && r.defects.includes(d)) subs[r.sub] = (subs[r.sub] ?? 0) + 1;
      ranked.push({ cls, defect: d, what: def.what, sev: def.sev, count, runs: c.runs, rate: +(count / c.runs).toFixed(3),
        score: def.sev * count, subs, worst });
    }
  }
  ranked.sort((a, b) => b.score - a.score);
  let compare = null;
  if (baseRows) {
    const baseById = new Map(baseRows.map((r) => [`${r.id}|${r.hull}`, r]));
    compare = { matched: 0, fixed: {}, regressed: {}, regressedRuns: [] };
    for (const row of rows) {
      const base = baseById.get(`${row.id}|${row.hull}`);
      if (!base) continue;
      compare.matched++;
      for (const d of base.defects) if (!row.defects.includes(d)) compare.fixed[d] = (compare.fixed[d] ?? 0) + 1;
      for (const d of row.defects) {
        if (!base.defects.includes(d)) {
          compare.regressed[d] = (compare.regressed[d] ?? 0) + 1;
          if (compare.regressedRuns.length < 60) compare.regressedRuns.push({ id: row.id, hull: row.hull, defect: d,
            base: +defectIndex.get(d).value(base.m).toFixed(3), now: +defectIndex.get(d).value(row.m).toFixed(3) });
        }
      }
    }
  }
  return { runs: rows.length, withDefect: rows.filter((r) => r.defects.length).length, byClass, byMap, ranked, compare };
}

/** Fidelity rows from a directory of tankWorldContactFidelity outputs, summed per support group and per contact kind. */
export function fidelityTotals(dir) {
  const support = {}, contact = {}, worst = [];
  for (const name of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    const data = JSON.parse(readFileSync(`${dir}/${name}`, 'utf8'));
    for (const [group, g] of Object.entries(data.support ?? {})) {
      const t = support[group] ??= { maps: 0, records: 0, points: 0, float: 0, sink: 0, air: 0, holes: 0, p90: [] };
      t.maps++; t.records += g.records; t.points += g.points; t.float += g.floatShare * g.points; t.sink += g.sinkShare * g.points;
      t.air += g.airShare * g.points; t.holes += g.holePoints; t.p90.push(g.errP90M);
    }
    // (the audit's legacy-* rows are its comparison against the retired colliders, not what ships)
    for (const k of (data.contact ?? []).filter((row) => !row.kind.startsWith('legacy-'))) {
      const t = contact[k.kind] ??= { n: 0, colliderM2: 0, meshM2: 0, phantomM2: 0, leakM2: 0 };
      t.n += k.n; t.colliderM2 += k.colliderM2; t.meshM2 += k.meshM2; t.phantomM2 += k.phantomShare * k.colliderM2; t.leakM2 += k.leakShare * k.meshM2;
    }
    for (const w of data.worst ?? []) worst.push({ map: data.mapId, ...w });
  }
  worst.sort((a, b) => b.worstM - a.worstM);
  return { support, contact, worst: worst.slice(0, 25) };
}

export function fidelityMarkdown(totals) {
  const lines = ['## Hitbox fidelity: what a hull stands on against what is drawn', '',
    'Support: every standable record\'s tops sampled on a 0.75 m grid against the drawn top under the same point (cast down).',
    'Float = the top over the drawn surface by > 15 cm (the hull stands on air); sink = under it (the hull sinks into what it',
    'sees); air = a top where nothing is drawn; holes = drawn a hull\'s height over the ground with no top under it.', '',
    '| Class / group | Maps | Records | Points | Float | Sink | Air | Hole points | Error p90 (median of maps) |', '|---|---|---|---|---|---|---|---|---|'];
  const pct = (a, b) => (b ? `${(100 * a / b).toFixed(1)} %` : '-');
  for (const [group, t] of Object.entries(totals.support).sort((a, b) => b[1].points - a[1].points)) {
    const p90 = [...t.p90].sort((a, b) => a - b)[Math.floor(t.p90.length / 2)] ?? 0;
    lines.push(`| ${group} | ${t.maps} | ${t.records} | ${t.points} | ${pct(t.float, t.points)} | ${pct(t.sink, t.points)} | ${pct(t.air, t.points)} | ${t.holes} | ${p90.toFixed(2)} m |`);
  }
  lines.push('', 'Contact band (0.2-1.4 m over the ground): phantom = collider area where nothing stands (invisible wall); leak = drawn',
    'area with no collider (drive-through).', '', '| Kind | Objects | Collider m2 | Phantom | Leak |', '|---|---|---|---|---|');
  for (const [kind, t] of Object.entries(totals.contact).sort((a, b) => b[1].colliderM2 - a[1].colliderM2).slice(0, 30)) {
    lines.push(`| ${kind} | ${t.n} | ${t.colliderM2.toFixed(0)} | ${pct(t.phantomM2, t.colliderM2)} | ${pct(t.leakM2, t.meshM2)} |`);
  }
  lines.push('', 'Worst records (support error):', '');
  for (const w of totals.worst.slice(0, 12)) lines.push(`- ${w.map} ${w.group} ${w.kind ?? ''} at (${w.x}, ${w.z}): ${w.worstM} m (${w.at?.[2] ?? ''}), ${w.holes} hole points`);
  return lines.join('\n') + '\n';
}

export function ledgerMarkdown(report, { title = 'Tank-world contact census', note = '' } = {}) {
  const lines = [`# ${title}`, ''];
  if (note) lines.push(note, '');
  lines.push(`${report.runs} runs, ${report.withDefect} with at least one defect.`, '');
  lines.push('## Per class', '', '| Class | Runs | With a defect | Defects (count) |', '|---|---|---|---|');
  for (const [cls, c] of Object.entries(report.byClass)) {
    const list = Object.entries(c.defects).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d} ${n}`).join(', ');
    lines.push(`| ${cls} | ${c.runs} | ${c.withDefect} (${(100 * c.withDefect / c.runs).toFixed(0)} %) | ${list} |`);
  }
  lines.push('', '## Ranked defects (weight x count)', '', '| # | Class | Defect | Runs | Rate | Where (sub-class: runs) | Worst (run, hull, value) |', '|---|---|---|---|---|---|---|');
  report.ranked.slice(0, 40).forEach((r, i) => {
    const subs = Object.entries(r.subs).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(', ');
    const worst = r.worst.slice(0, 3).map((w) => `\`${w.id}\` ${w.hull} ${w.value}`).join('<br>');
    lines.push(`| ${i + 1} | ${r.cls} | **${r.defect}** — ${r.what} | ${r.count}/${r.runs} | ${(100 * r.rate).toFixed(1)} % | ${subs} | ${worst} |`);
  });
  lines.push('', '## Per map (defect weight sum)', '', '| Map | Runs | With a defect | Weight |', '|---|---|---|---|');
  for (const [map, m] of Object.entries(report.byMap).sort((a, b) => b[1].score - a[1].score)) {
    lines.push(`| ${map} | ${m.runs} | ${m.withDefect} | ${m.score} |`);
  }
  if (report.compare) {
    lines.push('', '## Against the base census', '', `${report.compare.matched} runs matched by id and hull.`, '',
      `Fixed: ${Object.entries(report.compare.fixed).map(([d, n]) => `${d} ${n}`).join(', ') || 'none'}`, '',
      `New: ${Object.entries(report.compare.regressed).map(([d, n]) => `${d} ${n}`).join(', ') || 'none'}`);
    for (const r of report.compare.regressedRuns.slice(0, 30)) lines.push(`- \`${r.id}\` ${r.hull}: ${r.defect} ${r.base} -> ${r.now}`);
  }
  lines.push('', `Defect table: ${DEFECTS.map((d) => `${d.id} (${d.what}; weight ${d.sev})`).join('; ')}.`);
  return lines.join('\n') + '\n';
}

// ---- CLI ------------------------------------------------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (const arg of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(arg);
    if (match) args[match[1]] = match[2] ?? true;
  }
  return args;
}
const list = (value, fallback) => (typeof value === 'string' ? value.split(',').filter(Boolean) : fallback);

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.ledger) {
    const rows = readCensus(args.ledger);
    const base = args.base ? readCensus(args.base) : null;
    const report = ledger(rows, base);
    if (args.json) writeFileSync(args.json, JSON.stringify(report, null, 1));
    let md = ledgerMarkdown(report, { note: args.note ?? '' });
    if (args['fidelity-dir']) md += '\n' + fidelityMarkdown(fidelityTotals(args['fidelity-dir']));
    if (args.md) writeFileSync(args.md, md);
    else console.log(md);
    return;
  }
  const maps = list(args.maps, [...MAP_IDS]);
  for (const id of maps) if (!MAP_IDS.includes(id)) throw new Error(`unknown map ${id}`);
  if (args.fidelity) {
    const { fidelityMap } = await import('./tankWorldContactFidelity.mjs');
    if (args.out) mkdirSync(args.out, { recursive: true });
    for (const mapId of maps) {
      for (const variant of list(args.variants, ['base'])) {
        const started = performance.now();
        const result = await fidelityMap(mapId, { variant });
        result.seconds = +((performance.now() - started) / 1000).toFixed(1);
        const label = variant === 'base' ? mapId : `${mapId}@${variant}`;
        console.log(`== fidelity ${label} (${result.seconds} s)`);
        if (args.out) writeFileSync(`${args.out}/${label}.json`, JSON.stringify(result) + '\n');
      }
    }
    return;
  }
  const variants = list(args.variants, ['base']);
  const classes = list(args.classes, [...CLASSES]);
  const sites = Number(args.sites ?? 4);
  await ensureAuthorityFleet([...new Set([...CENSUS_HULLS, 't90m', 'm1a2', 'bmp2'])]);
  if (args.out) mkdirSync(args.out, { recursive: true });
  for (const mapId of maps) {
    for (const variant of variants) {
      const started = performance.now();
      const rows = await censusMap(mapId, { variant, classes, sites, world: args.world ?? 'earth', only: args.only ?? null,
        trace: args.trace ?? null,
        onRow: args.quiet ? null : (r) => console.log(`${r.id.padEnd(58)} ${r.hull.padEnd(11)} ${r.defects.length ? r.defects.join(',') : 'ok'}`
          + ` jolt${(r.m.joltYMaxM ?? 0).toFixed(3)} pop${(r.m.popXZMaxM ?? 0).toFixed(2)}/${(r.m.popYMaxM ?? 0).toFixed(2)}`
          + ` o${(r.m.obstaclePenMaxM ?? 0).toFixed(2)} in${(r.m.insideSolidM ?? 0).toFixed(2)} stuck${(r.m.longestStuckS ?? 0).toFixed(1)}`
          + ` tilt${(r.m.tiltMaxDeg ?? 0).toFixed(0)} (${r.ms} ms)`) });
      const label = variant === 'base' ? mapId : `${mapId}@${variant}`;
      const summary = { map: mapId, variant, runs: rows.length, withDefect: rows.filter((r) => r.defects.length).length,
        seconds: +((performance.now() - started) / 1000).toFixed(1) };
      console.log(`== ${label}: ${summary.runs} runs, ${summary.withDefect} with a defect (${summary.seconds} s)`);
      if (args.out) writeFileSync(`${args.out}/${label}.json`, JSON.stringify({ summary, rows }) + '\n');
    }
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
  process.exit(0);
}
