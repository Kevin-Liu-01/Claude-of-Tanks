#!/usr/bin/env node
// The street poses (buildings-271; Main's ruling 2026-11-09): the close camera a building detail step is judged from,
// placed by rule, not by hand. From each map's Node world build (the seeds every client's world uses), seeded points on
// the carriageway round the buildings that a tank can hold (on a road or its verge, within 8 m of its centre line: dry, level, inside the square, outside every building; Caldera's farmsteads stand back from their lanes, and a 2 m band found two)
// whose nearest facade stands 12-15 m off, the eye at the chase height over the point, looking square at that facade's
// nearest point at door height, the line of sight clear of every other building and every tall solid. A fixed count per
// map from a fixed seed, spaced apart and one per building; written as a building-style-shots `posesFrom` manifest, so
// every arm of a pair shoots the same cameras whatever its own props.
//
//   node tools/street-poses.mjs --maps=autumn,caldera [--count=6] [--seed=271] --out=<poses-street.json>
//
// (amberford-lavoir-272) `--focus=x,z` aims every pose at one place instead (a square's corner, a set piece): the eye on
// the carriageway band 12-40 m from it, looking at it at door height, the line of sight clear of every building and tall
// solid but the focus's own (those within 8 m of it), poses 12 m apart; the same cameras whatever stands there.
//   node tools/street-poses.mjs --maps=autumn --focus=-114,75 --count=6 --out=<poses-place.json>

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildWorldCollisionData } from './headlessWorldCollision.mjs';

const EYE_UP_M = 3.4, AT_UP_M = 2.2, NEAR_M = 12, FAR_M = 15, ROAD_BAND_M = 8, SPACING_M = 30, TALL_M = 2, TRIES = 200000;

function parse(argv) {
  const out = { maps: [], count: 6, seed: 271, out: null, focus: null };
  for (const arg of argv) {
    const m = /^--([a-z]+)=(.*)$/.exec(arg);
    if (!m) throw new Error(`unknown argument ${arg}`);
    if (m[1] === 'maps') out.maps = m[2].split(',').filter(Boolean);
    else if (m[1] === 'count') out.count = Number(m[2]);
    else if (m[1] === 'seed') out.seed = Number(m[2]);
    else if (m[1] === 'out') out.out = path.resolve(m[2]);
    else if (m[1] === 'focus') out.focus = m[2].split(',').map(Number);
    else throw new Error(`unknown flag --${m[1]}`);
  }
  if (!out.maps.length || !out.out) throw new Error('--maps=<ids> and --out=<file> are required');
  return out;
}

const mulberry32 = (a) => () => {
  a |= 0; a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const hash = (s) => [...s].reduce((h, ch) => Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0, 2166136261);

/** A building's footprints as closed polygons (world x-z): a regional build's plinths, else its placed rectangle. */
function footprints(b) {
  const plinths = b.contacts?.().map((c) => c.plinth) ?? [];
  if (plinths.length) return plinths;
  const c = Math.cos(b.rot || 0), s = Math.sin(b.rot || 0), hw = (b.w || 0) / 2, hd = (b.d || 0) / 2;
  if (!hw || !hd) return [];
  return [[[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([px, pz]) => [px * c + pz * s + b.x, -px * s + pz * c + b.z])];
}

/** The nearest point on a polygon's outline to (x, z), its distance, and whether (x, z) lies inside it. */
function nearestOnOutline(poly, x, z) {
  let best = { d: Infinity, x: 0, z: 0 }, inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    if ((az > z) !== (bz > z) && x < ((bx - ax) * (z - az)) / (bz - az) + ax) inside = !inside;
    const vx = bx - ax, vz = bz - az, t = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (vx * vx + vz * vz || 1)));
    const px = ax + vx * t, pz = az + vz * t, d = Math.hypot(px - x, pz - z);
    if (d < best.d) best = { d, x: px, z: pz };
  }
  return { ...best, inside };
}

/** Whether segment p-q crosses polygon `poly`'s outline (2D). */
function segmentCrosses(poly, px, pz, qx, qz) {
  const cross = (ax, az, bx, bz, cx, cz) => (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const d1 = cross(px, pz, qx, qz, ax, az), d2 = cross(px, pz, qx, qz, bx, bz);
    const d3 = cross(ax, az, bx, bz, px, pz), d4 = cross(ax, az, bx, bz, qx, qz);
    if (d1 * d2 < 0 && d3 * d4 < 0) return true;
  }
  return false;
}

/** Whether segment p-q (2D) meets an axis-aligned box's footprint (slab test), stopping short of q by `stop` m. */
function segmentHitsBox(o, px, pz, qx, qz, stop) {
  const dx = qx - px, dz = qz - pz, len = Math.hypot(dx, dz), tMax = (len - stop) / len;
  let t0 = 0, t1 = tMax;
  for (const [p, d, lo, hi] of [[px, dx, o.min[0], o.max[0]], [pz, dz, o.min[2], o.max[2]]]) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, b = (hi - p) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

const FOCUS_NEAR_M = 12, FOCUS_FAR_M = 40, FOCUS_SPACING_M = 12, FOCUS_OWN_M = 8;

async function posesFor(mapId, { count, seed, focus }) {
  let field = null, buildings = [], obstacles = [];
  await buildWorldCollisionData(mapId, {
    inspect: ({ dressing, flora, field: f }) => {
      field = f;
      buildings = dressing.features?.buildings ?? [];
      obstacles = [...dressing.obstacles, ...(flora.treeObstacles ?? [])];
    },
  });
  if (!field?._roadDist) throw new Error(`${mapId}: the headless build handed no height field with a road distance`);
  const polys = buildings.map((b, i) => ({ i, polys: footprints(b), cx: b.x, cz: b.z })).filter((b) => b.polys.length);
  for (const b of polys) b.reach = Math.min(...b.polys.flat().map(([x, z]) => Math.hypot(x - b.cx, z - b.cz)));
  const tall = obstacles.filter((o) => o.max[1] - o.min[1] > TALL_M && (o.max[0] - o.min[0]) * (o.max[2] - o.min[2]) < 400);
  const rng = mulberry32(hash(mapId) ^ seed);
  const poses = {}, taken = [], used = new Set();
  let tries = 0;
  if (focus) {
    const [fx, fz] = focus, fy = field.getHeightAt(fx, fz);
    // the focus's own solids (what stands at the place: a set piece, the well) never block its view
    const own = (o) => Math.hypot((o.min[0] + o.max[0]) / 2 - fx, (o.min[2] + o.max[2]) / 2 - fz) < FOCUS_OWN_M;
    const blockers = obstacles.filter((o) => o.max[1] - o.min[1] > TALL_M && !own(o));
    // (the focus's own plan is published among the buildings: a set piece's footprint) never a building between
    const others = polys.filter((b) => Math.hypot(b.cx - fx, b.cz - fz) >= FOCUS_OWN_M && !b.polys.some((poly) => nearestOnOutline(poly, fx, fz).inside));
    const rejects = { road: 0, ground: 0, spacing: 0, building: 0, solid: 0 };
    while (taken.length < count && tries++ < TRIES) {
      const a = rng() * Math.PI * 2, d = FOCUS_NEAR_M + rng() * (FOCUS_FAR_M - FOCUS_NEAR_M);
      const x = fx + Math.sin(a) * d, z = fz + Math.cos(a) * d;
      if (field._roadDist(x, z) > ROAD_BAND_M) { rejects.road++; continue; }
      if ((field.getWaterMaskAt?.(x, z) ?? 0) > 0.02 || field.getNormalAt(x, z).y < 0.94) { rejects.ground++; continue; }
      if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < FOCUS_SPACING_M)) { rejects.spacing++; continue; }
      if (others.some((b) => b.polys.some((poly) => nearestOnOutline(poly, x, z).inside || segmentCrosses(poly, x, z, fx, fz)))) { rejects.building++; continue; }
      if (blockers.some((o) => segmentHitsBox(o, x, z, fx, fz, FOCUS_OWN_M))) { rejects.solid++; continue; }
      taken.push({ x, z });
      poses[`street${taken.length}`] = {
        cam: [x, field.getHeightAt(x, z) + EYE_UP_M, z], at: [fx, fy + AT_UP_M, fz], heading: tries, hitM: +d.toFixed(1),
        building: { kind: 'focus', x: fx, z: fz },
      };
    }
    if (taken.length < count) console.log(`street-poses: ${mapId} focus rejects ${JSON.stringify(rejects)}`);
    return { buildings: buildings.length, tries, rejects, poses };
  }
  while (taken.length < count && tries++ < TRIES) {
    // a candidate in the band round a seeded building (its outline's reach plus 12-15 m, any bearing)
    const pick = polys[(rng() * polys.length) | 0], a = rng() * Math.PI * 2, out = NEAR_M + rng() * (FAR_M - NEAR_M);
    const x = pick.cx + Math.sin(a) * (pick.reach + out), z = pick.cz + Math.cos(a) * (pick.reach + out);
    if (Math.max(Math.abs(x), Math.abs(z)) > 470) continue;
    if (field._roadDist(x, z) > ROAD_BAND_M) continue;
    if ((field.getWaterMaskAt?.(x, z) ?? 0) > 0.02 || field.getNormalAt(x, z).y < 0.94) continue;
    if (taken.some((p) => Math.hypot(p.x - x, p.z - z) < SPACING_M)) continue;
    let near = null, inside = false;
    for (const b of polys) for (const poly of b.polys) {
      const hit = nearestOnOutline(poly, x, z);
      if (hit.inside) inside = true;
      if (!near || hit.d < near.d) near = { ...hit, b: b.i, poly };
    }
    if (inside || !near || near.d < NEAR_M || near.d > FAR_M || used.has(near.b)) continue;
    // the line of sight: no other building's outline and no tall solid between the eye and the facade
    if (polys.some((b) => b.i !== near.b && b.polys.some((poly) => segmentCrosses(poly, x, z, near.x, near.z)))) continue;
    if (tall.some((o) => segmentHitsBox(o, x, z, near.x, near.z, 0.6))) continue;
    const gy = field.getHeightAt(x, z), ty = field.getHeightAt(near.x, near.z);
    taken.push({ x, z });
    used.add(near.b);
    const b = buildings[near.b];
    poses[`street${taken.length}`] = {
      cam: [x, gy + EYE_UP_M, z], at: [near.x, ty + AT_UP_M, near.z], heading: tries, hitM: +near.d.toFixed(1),
      building: { kind: b.kind ?? b.landmark ?? null, x: +b.x.toFixed(1), z: +b.z.toFixed(1) },
    };
  }
  return { buildings: buildings.length, tries, poses };
}

const options = parse(process.argv.slice(2));
const out = { tool: 'street-poses', seed: options.seed, rule: options.focus ? `road band ${ROAD_BAND_M} m, focus (${options.focus}) ${FOCUS_NEAR_M}-${FOCUS_FAR_M} m, eye +${EYE_UP_M} m`
  : `road band ${ROAD_BAND_M} m, facade ${NEAR_M}-${FAR_M} m, eye +${EYE_UP_M} m`, maps: {} };
for (const mapId of options.maps) {
  out.maps[mapId] = await posesFor(mapId, options);
  const n = Object.keys(out.maps[mapId].poses).length;
  console.log(`street-poses: ${mapId} ${n}/${options.count} poses in ${out.maps[mapId].tries} tries`);
  if (n < options.count) process.exitCode = 1;
}
writeFileSync(options.out, `${JSON.stringify(out, null, 1)}\n`);
