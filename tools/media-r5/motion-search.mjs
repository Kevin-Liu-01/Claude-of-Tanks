#!/usr/bin/env node
// Motion search for the site fifty (owner 2026-10-05: "a lot of motion with the camera itself moving as if it's on a
// fully 3D track, and tanks moving in crazy directions with a lot of speed, camera being close and far away"). Per
// shot, on its own set: hero routes — racing down the roads that cross the set (either way) or across open ground
// (advance, diagonal, flank, arc; from a spread of starts) — the allies strung behind on the same road or fanning on
// their own curves at their own speeds, every gun stabilised on a foe, and the lens moves that suit the shot's kind
// (tank: low and close; battle: wide over the fight; scene: high). Each candidate is built through siteScene and must
// clear route-check (walls, woods, water, edges, the other hulls, 15 m off the foes) and the lens checks (blocked
// ≤ 5 %, hero in frame ≥ 90 %, the site50 selftest's bar); the survivors are scored on what the owner asked for — the lens's close-to-far
// range, its climb, front angles, speed — with a spread penalty so neighbouring shots don't share a move, and the
// best is written to site50-motion.json, which siteScene merges over the shot's own motion.
//   MEDIA_R5_LIGHT=1 node tools/media-r5/motion-search.mjs [--ids=4,21] [--out=tools/media-r5/site50-motion.json]
//   WHY=1 also prints each shot's rejection tally.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS, siteScene } from './site50.mjs';
import { frame } from './setups.mjs';
import { MOTION, aimFor, leadReveal, orbitRise, overtake, swoop, weave } from './moves.mjs';
import { routeProblems, waterBlocks } from './route-check.mjs';
import { blockedFraction, heroInFrameFraction } from './camera-clearance.mjs';
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const IDS = arg('ids', '').split(',').filter(Boolean).map(Number), OUT = arg('out', 'tools/media-r5/site50-motion.json');
const DUR = 6600, TOWNS = new Set(['urban']);
const rad = (d) => d * Math.PI / 180;
const MOTION_FIELDS = ['speed', 'curveDegS', 'foeSpeed', 'pinMs', 'cam', 'turrets', 'guns', 'turretKeys', 'turretSweep', 'keepWidth', 'frame', 'lookFrame', 'ease', 'stepMs'];

/** Waypoints [lat, lon] of a curve leaving (lat, lon) on `dirDeg` (relative to the set heading, + to its right) for
 * `len` metres, bending `bendDeg` over its length and weaving `wiggle` metres either side. */
function curve(lat, lon, dirDeg, len, { bendDeg = 0, wiggle = 0, phase = 1, n = 5 } = {}) {
  const pts = [[lat, lon]];
  let x = lat, y = lon, h = dirDeg;
  for (let i = 1; i < n; i++) {
    h += bendDeg / (n - 1);
    x += Math.sin(rad(h)) * len / (n - 1); y += Math.cos(rad(h)) * len / (n - 1);
    const w = i < n - 1 ? wiggle * (i % 2 ? phase : -phase) : 0;
    pts.push([+(x + Math.cos(rad(h)) * w).toFixed(1), +(y - Math.sin(rad(h)) * w).toFixed(1)]);
  }
  return pts;
}

/** Road routes through the set: each road passing within 45 m of the anchor, driven either way from 50, 30 or 10 m
 * before the anchor, the hero and its allies strung `gap` metres apart on it, a metre or two off the crown. In the
 * set's frame. */
function roadRoutes(features, set, len, allies, gap = 18) {
  const fr = frame(set.anchor, set.heading), toSet = ([x, z]) => { const dx = x - set.anchor[0], dz = z - set.anchor[1]; return [+(dx * fr.r[0] + dz * fr.r[1]).toFixed(1), +(dx * fr.f[0] + dz * fr.f[1]).toFixed(1)]; };
  const out = [];
  for (const [ri, road] of (features.roads ?? []).entries()) {
    const dense = [];
    for (let i = 1; i < road.length; i++) {
      const [a, b] = [road[i - 1], road[i]], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let k = i === 1 ? 0 : 1; k <= n; k++) dense.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    const cum = [0]; for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
    let i0 = 0, best = Infinity;
    dense.forEach((p, i) => { const d = Math.hypot(p[0] - set.anchor[0], p[1] - set.anchor[1]); if (d < best) { best = d; i0 = i; } });
    if (best > 45) continue;
    const at = (s) => { let i = 1; while (i < cum.length - 1 && cum[i] < s) i++; const u = Math.max(0, Math.min(1, (s - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]))); return [dense[i - 1][0] + (dense[i][0] - dense[i - 1][0]) * u, dense[i - 1][1] + (dense[i][1] - dense[i - 1][1]) * u]; };
    for (const [dir, lead] of [1, -1].flatMap((d) => [50, 30, 10].map((l) => [d, l]))) {
      const s0 = cum[i0] - dir * lead;
      const path = (from, lateral) => {
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const s = from + dir * (len * k / 8), p = at(s), q = at(s + dir * 2), t = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(...t) || 1;
          pts.push(toSet([p[0] - t[1] / l * lateral * dir, p[1] + t[0] / l * lateral * dir]));
        }
        return pts;
      };
      if (s0 - (dir > 0 ? gap * allies : 0) < 0 || s0 + dir * len > cum.at(-1) || s0 + dir * len < 0) continue;
      const routes = { hero: path(s0, 1.2) };
      for (let k = 1; k <= allies; k++) routes[`ally${k}`] = path(s0 - dir * gap * k, k % 2 ? -1.4 : 1.4);
      out.push([`road${ri}${dir > 0 ? '+' : '-'}${lead}`, routes]);
    }
  }
  return out;
}

/** Off-road hero families on a set: [name, dirDeg, bendDeg, starts as [lat, lon]] (the foes stand ~70–90 m ahead). */
const FAMILIES = [
  ['advance', 0, 0, [[0, -110], [0, -80], [-20, -80], [20, -80], [0, -50]]],
  ['diagonal-left', -35, 0, [[30, -70], [20, -45], [40, -90]]],
  ['diagonal-right', 35, 0, [[-30, -70], [-20, -45], [-40, -90]]],
  ['flank-left', -78, 0, [[55, 0], [45, 25], [60, -25]]],
  ['flank-right', 78, 0, [[-55, 0], [-45, 25], [-60, -25]]],
  ['arc-left', 0, -70, [[15, -70], [25, -40]]],
  ['arc-right', 0, 70, [[-15, -70], [-25, -40]]],
];

/** Street moves: in a town the lens keeps to the street's corridor (a few metres off the travel axis) until it clears
 * the roofs, so the houses never stand between it and the tank. */
const street = (keys) => keys.map(([u, side, along, lift, fov, look]) => ({ tMs: u >= 1 ? 'end' : Math.round(DUR * u), frame: 'travel', lookFrame: 'travel', side, along, lift, fov, lookHero: look }));
const STREET_MOVES = [1, -1].flatMap((s) => [
  // in front of the tank, flying back down the street and up over the roofs as it comes on
  [`streetLead${s > 0 ? 'R' : 'L'}`, street([[0, 0.8 * s, 9, 1.6, 38, [0, 0, 1.8]], [0.35, 1.5 * s, 15, 3, 40, [0, 1, 1.8]], [0.7, 2 * s, 24, 11, 42, [0, -2, 1.4]], [1, 1 * s, 32, 27, 44, [0, -8, 0.8]]])],
  // from over the roofs down into the street ahead of the charging tank, held low as it closes
  [`streetDrop${s > 0 ? 'R' : 'L'}`, street([[0, 0, 34, 34, 42, [0, 0, 1]], [0.35, 0.5 * s, 22, 14, 40, [0, 0, 1.4]], [0.7, 1.5 * s, 12, 2.4, 38, [0, 0, 1.6]], [1, 2.5 * s, 7, 1.8, 40, [0, 0, 1.6]]])],
  // up and over: from low off the quarter to high over the tank's front, looking down the street it is taking
  [`streetCrane${s > 0 ? 'R' : 'L'}`, street([[0, -2 * s, -9, 2, 40, [0, 4, 1.6]], [0.35, -1 * s, -3, 9, 40, [0, 6, 1.4]], [0.7, 0, 6, 24, 42, [0, 10, 0.8]], [1, 0, 13, 32, 44, [0, 16, 0.4]]])],
]);

/** Lens moves by kind: [name, keys]. */
function lensMoves(kind, town = false) {
  if (town && kind !== 'scene') return STREET_MOVES;
  if (town) return [...STREET_MOVES, ...lensMoves(kind)];
  if (kind === 'tank') return [1, -1].flatMap((s) => [
    [`swoop${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [34, 66], low: [2.1, 7.5], out: [11, 30] })],
    [`leadReveal${s > 0 ? 'R' : 'L'}`, leadReveal(DUR, { side: s, near: [1.5, 9], far: [26, 50], swing: 38 })],
    [`orbitRise${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, s > 0 ? { from: -70, to: 110 } : { from: 70, to: -110 })],
    [`overtake${s > 0 ? 'R' : 'L'}`, overtake(DUR, { side: s })],
  ]);
  if (kind === 'battle') return [1, -1].flatMap((s) => [
    [`swoop${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [42, 80], low: [2.6, 10], out: [14, 36], lookAhead: 10 })],
    [`orbitRise${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, { ...(s > 0 ? { from: -60, to: 100 } : { from: 60, to: -100 }), radius: [11, 32], lift: [2, 24] })],
    [`weave${s > 0 ? 'R' : 'L'}`, weave(DUR, { side: s, close: 7, wide: 26 })],
    [`leadReveal${s > 0 ? 'R' : 'L'}`, leadReveal(DUR, { side: s, near: [1.8, 11], far: [30, 60], swing: 45 })],
  ]);
  return [1, -1].flatMap((s) => [
    [`swoopHigh${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [70, 110], low: [7, 16], out: [28, 50], fov: [44, 42, 44], lookAhead: 14 })],
    [`orbitRiseHigh${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, { ...(s > 0 ? { from: -40, to: 120 } : { from: 40, to: -120 }), radius: [18, 52], lift: [9, 48], fov: [44, 42] })],
    [`leadRevealHigh${s > 0 ? 'R' : 'L'}`, leadReveal(DUR, { side: s, near: [4, 14], far: [48, 80], swing: 50, fov: [38, 44] })],
  ]);
}

const featuresOf = (() => { const cache = new Map(); return (map) => { if (!cache.has(map)) { const f = join(SHOTS_DIR, 'features', `features-${map}.json`); cache.set(map, existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null); } return cache.get(map); }; })();

/** The take's lens metrics: range (far / near to the hero), climb (lift range), front share (lens ahead of the hull's
 * travel), hero speed. */
function metrics(scene) {
  const hero = scene.storyboard.actorTracks.find((t) => t.actor === 'hero')?.keys ?? [], o = {}, d = [], y = [];
  let front = 0;
  for (const s of scene.storyboard.shots) {
    sampleActorTrack(hero, s.tMs, o);
    d.push(Math.hypot(s.pos[0] - o.x, s.pos[2] - o.z)); y.push(s.pos[1]);
    if (Math.sin(rad(o.facingDeg)) * (s.pos[0] - o.x) + Math.cos(rad(o.facingDeg)) * (s.pos[2] - o.z) > 0) front++;
  }
  const a = {}, b = {}; sampleActorTrack(hero, 1000, a); sampleActorTrack(hero, 5000, b);
  return { near: Math.min(...d), far: Math.max(...d), climb: Math.max(...y) - Math.min(...y), front: front / d.length, speed: Math.hypot(b.x - a.x, b.z - a.z) / 4 };
}

const plan = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : {};
const usage = new Map();
for (const [n, id, kind, title, set, film, still] of SHOTS) {
  if (IDS.length && !IDS.includes(n)) continue;
  const features = featuresOf(set.map);
  if (!features) { console.log(`s${n}: no features for ${set.map}, skipped`); continue; }
  const t0 = Date.now();
  const baseOwn = Object.fromEntries(Object.entries(film).filter(([k]) => !MOTION_FIELDS.includes(k)));
  const town = TOWNS.has(set.map), speed = town ? 9 : 15, len = speed * DUR / 1000 + 25;
  const foesSpec = 'enemies' in film ? film.enemies : set.enemies;
  // the allies the shot actually stages (formations and counts vary by set): its own scene, built once; a shot whose
  // full cast fits no route tries again one tank lighter (count in the plan)
  const fullAllies = siteScene([n, id, kind, title, set, film, still]).actors.filter((a) => a.name.startsWith('ally')).length;
  const searchShot = (allies) => {
    const base = allies < fullAllies ? { ...baseOwn, count: allies + 1 } : baseOwn;
    // route sets: the roads through the set, then open ground with the allies in a column behind or fanning out
    const routeSets = roadRoutes(features, set, len, allies, town ? 15 : 18).map(([name, pts]) => [name, Object.fromEntries(Object.entries(pts).map(([a, p], i) => [a, { pts: p, speed: speed + (i ? 0.4 : 0) }]))]);
    for (const [family, dir, bend, starts] of FAMILIES) for (const [slat, slon] of starts) for (const allyMode of ['column', 'fan']) {
      const wiggle = town ? 0.8 : 4, routes = { hero: { pts: curve(slat, slon, dir, len, { bendDeg: bend, wiggle }), speed } };
      for (let i = 1; i <= allies; i++) {
        const side = i % 2 ? 1 : -1, k = Math.ceil(i / 2);
        const back = allyMode === 'column' ? 17 * i : 14 * k, lateral = allyMode === 'column' ? side * 2 : side * 10 * k;
        const lat0 = slat + lateral * Math.cos(rad(dir)) - back * Math.sin(rad(dir)), lon0 = slon - back * Math.cos(rad(dir)) - lateral * Math.sin(rad(dir));
        routes[`ally${i}`] = { pts: curve(+lat0.toFixed(1), +lon0.toFixed(1), dir + (allyMode === 'fan' ? side * 8 * k : 0), len, { bendDeg: bend * 0.85, wiggle: wiggle * 0.7, phase: -side }), speed: speed + (k % 2 ? 0.6 : -0.4) };
      }
      routeSets.push([`${family}[${slat},${slon}]/${allyMode}`, routes]);
    }
    // stop-short variants: each tank pulls up 30 m before the nearest foe on its path (duels in streets, a tank braking
    // to fire); a route that never nears a foe has no variant
    const own = siteScene([n, id, kind, title, set, film, still]), fr = frame(set.anchor, set.heading);
    const foeSet = own.actors.filter((a) => a.name.startsWith('foe')).map((a) => { const dx = a.pos[0] - set.anchor[0], dz = a.pos[1] - set.anchor[1]; return [dx * fr.r[0] + dz * fr.r[1], dx * fr.f[0] + dz * fr.f[1]]; });
    const cutShort = (pts) => {
      const out = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]], steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
        for (let k = 1; k <= steps; k++) {
          const p = [a[0] + (b[0] - a[0]) * k / steps, a[1] + (b[1] - a[1]) * k / steps];
          if (foeSet.some((f) => Math.hypot(p[0] - f[0], p[1] - f[1]) < 30)) return out.length >= 2 || k > 1 ? [...out, p.map((v) => +v.toFixed(1))] : null;
        }
        out.push(b);
      }
      return null;
    };
    for (const [name, routes] of [...routeSets]) {
      const cut = Object.fromEntries(Object.entries(routes).map(([a, r]) => [a, cutShort(r.pts)]));
      if (!cut.hero) continue;
      routeSets.push([`${name}/stop`, Object.fromEntries(Object.entries(routes).map(([a, r]) => [a, cut[a] && cut[a].length >= 2 ? { ...r, pts: cut[a], stop: true } : r]))]);
    }
    const results = [], why = new Map(), reject = (k) => why.set(k, (why.get(k) ?? 0) + 1);
    for (const [family, routes] of routeSets) {
      const aim = foesSpec ? aimFor(film.effects ?? [], Object.keys(routes), foesSpec.count ?? 2) : undefined;
      // routes first, once per route set (the lens doesn't change them)
      let probe;
      try { probe = siteScene([n, id, kind, title, set, { ...base, ...MOTION, routes, ...(aim ? { aim } : {}), cam: lensMoves(kind, town)[0][1] }, still]); } catch { reject('build'); continue; }
      const problems = routeProblems(probe, features, { water: waterBlocks(probe) }).filter((p) => !/^foe\d+\+foe\d+$/.test(p.actor) && !/^foe\d+$/.test(p.actor));
      if (problems.length) { for (const p of problems) reject(`${p.actor.replace(/\d+/g, '')}: ${p.what.replace(/[\d.]+ m/g, '#').replace(/ at \[.*\]/, '')}`); continue; }
      const tracks = new Map(probe.storyboard.actorTracks.map((t) => [t.actor, t.keys])), o = {};
      const foes = probe.actors.filter((a) => a.name.startsWith('foe'));
      let foeGap = Infinity;
      for (let t = 0; t <= DUR; t += 200) for (const name of Object.keys(routes)) { sampleActorTrack(tracks.get(name), t, o); for (const f of foes) foeGap = Math.min(foeGap, Math.hypot(o.x - f.pos[0], o.z - f.pos[1])); }
      if (foeGap < 15) { reject('within 15 m of a foe'); continue; }
    // a stabilised gun counter-rotates at the hull's yaw rate: a turn tighter than a turret can follow (65°/s, under the
    // selftest's 70) is out
    const wrapD = (d) => ((d % 360) + 540) % 360 - 180;
    const traverse = Math.max(0, ...probe.storyboard.actorTracks.filter((t) => !t.actor.startsWith('foe')).map((t) => Math.max(0, ...t.keys.slice(1).map((k, i) => Math.abs(wrapD(k.turretDeg - t.keys[i].turretDeg)) / ((k.tMs - t.keys[i].tMs) / 1000)))));
    if (traverse > 65) { reject('turret traverse over 65°/s'); continue; }
      for (const [lens, cam] of [...lensMoves(kind, town), ...(town ? lensMoves(kind) : [])]) {
        let scene;
        try { scene = siteScene([n, id, kind, title, set, { ...base, ...MOTION, routes, ...(aim ? { aim } : {}), cam }, still]); } catch { reject('build'); continue; }
        const blocked = blockedFraction(scene), inFrame = heroInFrameFraction(scene);
        if (blocked > 0.05 || inFrame < 0.9) { reject(blocked > 0.05 ? 'lens blocked' : 'hero out of frame'); continue; }
        const m = metrics(scene), range = m.far / Math.max(3, m.near), road = family.startsWith('road');
        // a move family (left and right alike) and a route family used before cost the next shot, so the fifty mix
        const moveFamily = lens.replace(/[LR]$/, ''), routeFamily = family.split(/[[+-]/)[0];
        const score = 1.2 * Math.min(range, 7) / 7 + 0.8 * Math.min(m.climb, 30) / 30 + 1.0 * m.front + 0.5 * Math.min(m.speed, speed) / speed
          + 0.5 * inFrame - 2 * blocked - 0.5 * (usage.get(moveFamily) ?? 0) - 0.15 * (usage.get(routeFamily) ?? 0) + (scene.meta.cameraFix ? -0.2 : 0) + (road && town ? 0.15 : 0);
        results.push({ score, family, lens, routes, aim, cam: scene.meta.cameraFix ? null : cam, m, blocked, inFrame, fix: scene.meta.cameraFix ?? null });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return { results, why, count: allies < fullAllies ? allies + 1 : null };
  };
  let found = searchShot(fullAllies);
  if (!found.results.length && fullAllies > 0) found = searchShot(fullAllies - 1);
  const { results, why } = found;
  const best = results[0], secs = ((Date.now() - t0) / 1000).toFixed(0);
  if (process.env.WHY || !best) console.log(`   rejected: ${[...why].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k} ×${v}`).join('; ')}`);
  if (!best) { console.log(`s${String(n).padStart(2, '0')} ${id}: no candidate clears every check — keeps its own motion (${secs} s)`); delete plan[n]; continue; }
  for (const k of [best.lens.replace(/[LR]$/, ''), best.family.split(/[[+-]/)[0]]) usage.set(k, (usage.get(k) ?? 0) + 1);
  plan[n] = { note: `${best.family} at ${best.m.speed.toFixed(0)} m/s; ${best.lens}${best.fix ? ` (lens ${best.fix})` : ''}${found.count ? `; ${found.count} tanks` : ''}`, ...MOTION,
    ...(found.count ? { count: found.count } : {}),
    routes: best.routes, ...(best.aim ? { aim: best.aim } : {}), cam: best.cam ?? [...lensMoves(kind, town), ...lensMoves(kind)].find(([l]) => l === best.lens)[1],
    checks: { lens: `${best.m.near.toFixed(0)}–${best.m.far.toFixed(0)} m`, climb: +best.m.climb.toFixed(1), front: +best.m.front.toFixed(2), inFrame: +best.inFrame.toFixed(2), blocked: +best.blocked.toFixed(2), candidates: results.length } };
  console.log(`s${String(n).padStart(2, '0')} ${id}: ${plan[n].note} · lens ${plan[n].checks.lens}, climb ${plan[n].checks.climb} m, front ${plan[n].checks.front}, ${results.length} passed (${secs} s)`);
}
writeFileSync(OUT, `${JSON.stringify(plan, null, 1)}\n`);
console.log(`motion plan: ${Object.keys(plan).length} shots -> ${OUT}`);
