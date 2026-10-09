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
// best is written to site50-motion.json, which siteScene merges over the shot's own motion. Since composition wave c1
// (2026-10-07) the score is led by framing: the share of the take in the blind critics' sweet spot (framing below).
//   MEDIA_R5_LIGHT=1 node tools/media-r5/motion-search.mjs [--ids=4,21] [--out=tools/media-r5/site50-motion.json]
//   WHY=1 also prints each shot's rejection tally.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS, siteScene } from './site50.mjs';
import { frame } from './setups.mjs';
import { MOTION, aimFor, leadReveal, orbitRise, overtake, swoop, weave } from './moves.mjs';
import { propProblems, routeProblems, waterBlocks } from './route-check.mjs';
import { worldModel } from './world-model.mjs';
import { framingScore, lensReport } from './lens-check.mjs';
import { blockedFraction, heroInFrameFraction } from './camera-clearance.mjs';
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';
import { SHOTS as SHOTS_DIR } from './paths.mjs';

const arg = (name, fallback) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const IDS = arg('ids', '').split(',').filter(Boolean).map(Number), OUT = arg('out', 'tools/media-r5/site50-motion.json');
const DUR = 6600, TOWNS = new Set(['urban']);
// the spread penalty per earlier use of a move family (USAGE_W; 0.5 until composition wave c1 narrowed the moves that
// frame well, when 0.9 keeps the fifty from settling on three low moves)
const USAGE_W = Number(process.env.USAGE_W ?? 0.5);
const OCCLUDE_MS = Number(process.env.OCCLUDE_MS ?? 300);
// the longest span of consecutive samples passing `test`, in ms (one sample alone is 0)
const longestRun = (samples, test) => { let best = 0, from = null; for (const q of samples) { if (test(q)) { from ??= q.tMs; best = Math.max(best, q.tMs - from); } else from = null; } return best; };
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

/** Low street moves (composition wave c1, 2026-10-07: the critics' good frames hold the lens about 2 m up and level; the
 * street moves above climb to 27-34 m and look down on roofs): a dolly back down the street ahead of the tank rising
 * only to 5 m, and a drop from 9 m into the street ahead of it. */
const STREET_LOW = [1, -1].flatMap((s) => [
  [`streetLeadLow${s > 0 ? 'R' : 'L'}`, street([[0, 0.8 * s, 9, 1.6, 38, [0, 0, 1.8]], [0.35, 1.5 * s, 13, 2.2, 38, [0, 1, 1.8]], [0.7, 2 * s, 18, 3.4, 36, [0, 0, 1.6]], [1, 1 * s, 24, 5, 34, [0, -1, 1.4]]])],
  [`streetDropLow${s > 0 ? 'R' : 'L'}`, street([[0, 0.5 * s, 26, 9, 32, [0, 0, 1.2]], [0.35, 1 * s, 18, 4.5, 34, [0, 0, 1.4]], [0.7, 1.5 * s, 12, 2.2, 38, [0, 0, 1.6]], [1, 2.5 * s, 9, 1.8, 40, [0, 0, 1.6]]])],
  // the street's dolly zoom: falling back from 9 to 30 m down the street while the lens closes from 40° to 16°, so the
  // tank keeps its size and the street compresses behind it (close to far without the tank going small)
  [`streetPullZoom${s > 0 ? 'R' : 'L'}`, street([[0, 0.8 * s, 9, 1.6, 40, [0, 0, 1.6]], [0.5, 1.2 * s, 18, 2.2, 26, [0, 0, 1.5]], [1, 1.5 * s, 30, 3, 16, [0, 0, 1.4]]])],
]);

/** Low moves for any kind (composition wave c1, 2026-10-07): the critics' composition falls with the lens's look-down
 * (rank correlation -0.63), its height (-0.57) and its distance (-0.46); their GOOD frames sit about 2 m up, 11-18 m
 * out, the hull 40-55 % of the frame's height, centred and whole. Range comes from distance at a low height and a
 * longer lens, not from climbing: a tracking pass off the front quarter, a lead that falls back and rises to 5 m, a low
 * orbit, a gentle swoop from 7 m, and a long-lens track from 6-9 m up for the wide takes. */
const lowMoves = (kind) => [1, -1].flatMap((s) => [
  [`trackLow${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 32, radius: 17, lift: 2.2, fov: 36, lookHero: [0, 1.5, 1.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 62, radius: 11, lift: 1.6, fov: 40, lookHero: [0, 1, 1.5] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 38, radius: 19, lift: 3, fov: 36, lookHero: [0, 1.5, 1.3] }]],
  [`leadLow${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 10, radius: 11, lift: 1.6, fov: 38, lookHero: [0, 0, 1.6] },
    { tMs: Math.round(DUR * 0.4), frame: 'travel', lookFrame: 'travel', orbit: s * 22, radius: 15, lift: 2.4, fov: 38, lookHero: [0, 0.5, 1.5] },
    { tMs: Math.round(DUR * 0.75), frame: 'travel', lookFrame: 'travel', orbit: s * 34, radius: 20, lift: 3.6, fov: 36, lookHero: [0, 0, 1.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 44, radius: 25, lift: 5, fov: 34, lookHero: [0, -1, 1.3] }]],
  [`orbitLow${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, { ...(s > 0 ? { from: -55, to: 75 } : { from: 55, to: -75 }), radius: [12, 17], lift: [1.6, 4.5], fov: [40, 38] })],
  [`swoopLow${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [7, 30], low: [2.2, 11], out: [3, 18], fov: [34, 40, 38], lookAhead: 1.5 })],
  // dolly zooms: the range of close and far with the hull holding its size (the lens closes as it falls back, opens as it
  // pushes in), the background compressing or opening behind it
  [`pullZoom${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 15, radius: 10, lift: 1.6, fov: 40, lookHero: [0, 0.5, 1.5] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 22, radius: 19, lift: 2.4, fov: 25, lookHero: [0, 0.5, 1.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 28, radius: 31, lift: 3.2, fov: 16, lookHero: [0, 0.5, 1.4] }]],
  [`pushZoom${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 38, radius: 32, lift: 3.2, fov: 16, lookHero: [0, 0.5, 1.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 28, radius: 20, lift: 2.4, fov: 25, lookHero: [0, 0.5, 1.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 18, radius: 11, lift: 1.8, fov: 38, lookHero: [0, 0.5, 1.5] }]],
  // composition wave c2 (2026-10-08): bigger and lower in the frame, three-quarter, with lead room. The lens aims 2.4-2.5 m
  // up so the hull sits low; a 45 %-tall hull wants about 11 m at 36°, or a longer lens further out
  [`track34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 38, radius: 12.5, lift: 2, fov: 36, lookHero: [0, 1.2, 2.5] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 55, radius: 10, lift: 1.7, fov: 38, lookHero: [0, 1, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 42, radius: 13, lift: 2.2, fov: 36, lookHero: [0, 1.2, 2.5] }]],
  [`orbit34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 20, radius: 11, lift: 1.7, fov: 38, lookHero: [0, 1, 2.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 50, radius: 10, lift: 2, fov: 38, lookHero: [0, 1, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 75, radius: 12, lift: 2.4, fov: 38, lookHero: [0, 1, 2.4] }]],
  [`dollyZoom34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 28, radius: 9, lift: 1.8, fov: 40, lookHero: [0, 0.5, 2.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 32, radius: 17, lift: 2.2, fov: 21.8, lookHero: [0, 0.5, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 36, radius: 28, lift: 2.8, fov: 13.4, lookHero: [0, 0.5, 2.4] }]],
  [`pushZoom34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 40, radius: 28, lift: 2.8, fov: 13.4, lookHero: [0, 0.5, 2.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 34, radius: 17, lift: 2.2, fov: 21.8, lookHero: [0, 0.5, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 28, radius: 9, lift: 1.8, fov: 40, lookHero: [0, 0.5, 2.4] }]],
  [`lead34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 18, radius: 10, lift: 1.8, fov: 38, lookHero: [0, 0.5, 2.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 30, radius: 13, lift: 2.2, fov: 31, lookHero: [0, 0.5, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 40, radius: 16, lift: 2.6, fov: 26, lookHero: [0, 0.5, 2.4] }]],
  // composition wave c3 (2026-10-08): the critics' 7.0-7.5 frames held an elevated three-quarter as well as the low lens
  // (3.9-4.9 m up looking down 14-17°, the hull 11-14 m out), and the c3 re-plans that held the gun against the frame's
  // edge lost points. The lens rides 4-6.5 m up off the front quarter and aims 2.5 m ahead of the hull, so the gun points
  // into the frame; and it travels close to far (the owner's motion note, 2026-10-05) as a dolly zoom, 18 m to 10.5 m or
  // back with the lens opening as it closes (distance × tan(fov / 2) held), so the hull keeps its size: a static
  // elevated orbit at 12-15 m won 12 of c4's 19 searches before it was replaced, at a range of 1.25
  [`raisedPush34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 42, radius: 18, lift: 6.4, fov: 26, lookHero: [0, 2.5, 2.2] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 34, radius: 14, lift: 5.2, fov: 32.6, lookHero: [0, 2.5, 2.2] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 26, radius: 10.5, lift: 4.2, fov: 41.3, lookHero: [0, 2.5, 2.2] }]],
  [`raisedPull34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 24, radius: 10.5, lift: 4.2, fov: 41.3, lookHero: [0, 2.5, 2.2] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 34, radius: 14, lift: 5.2, fov: 32.6, lookHero: [0, 2.5, 2.2] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 44, radius: 18, lift: 6.4, fov: 26, lookHero: [0, 2.5, 2.2] }]],
  ...(kind === 'scene' || kind === 'battle' ? [[`teleTrack${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', orbit: s * 40, radius: 30, lift: 6, fov: 26, lookHero: [0, 2, 1.2] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', orbit: s * 58, radius: 25, lift: 7.5, fov: 27, lookHero: [0, 1.5, 1.2] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', orbit: s * 74, radius: 28, lift: 9, fov: 28, lookHero: [0, 1, 1.1] }]]] : []),
]);

/** Route leads (2026-10-08: in Steinburg's narrow streets every low orbit and every lens offset along the hull's heading
 * met a wall where the street bends): the lens rides the hull's own route 9-13 m ahead of it, a metre or two to the
 * side and 2-3.2 m up, looking back at it, so it follows the street's curve on ground the route keeps clear. The zoom
 * variant falls back along the route from 9 to 24 m ahead while the lens closes from 40° to 15.6°, distance × tan(fov/2)
 * held, so the hull keeps its size (a true dolly zoom). */
const ROUTE_LEADS = [1, -1].flatMap((s) => [
  [`routeLead${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', aheadM: 13, side: 0.8 * s, along: 0, lift: 2, fov: 36, lookHero: [0, 0, 1.6] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', aheadM: 11, side: 1.2 * s, along: 0, lift: 2.6, fov: 37, lookHero: [0, 0, 1.6] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', aheadM: 9, side: 1.6 * s, along: 0, lift: 3.2, fov: 38, lookHero: [0, 0, 1.5] }]],
  [`routeLeadZoom${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', aheadM: 9, side: 0.8 * s, along: 0, lift: 1.8, fov: 40, lookHero: [0, 0, 1.6] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', aheadM: 15, side: 1 * s, along: 0, lift: 2.4, fov: 24.6, lookHero: [0, 0, 1.5] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', aheadM: 24, side: 1.2 * s, along: 0, lift: 3, fov: 15.6, lookHero: [0, 0, 1.4] }]],
  // a high view down the street done with a long lens (the titles' church tower and roof tiles): from tower height
  // (11-12 m) 38-46 m ahead on the route, or roof height (7-8 m) 22-30 m ahead, the lens at 19-28° keeps the look-down
  // near 15° and the hull large, where the old street cranes looked down from 27-34 m
  [`towerTele${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', aheadM: 46, side: 1.5 * s, along: 0, lift: 12, fov: 19, lookHero: [0, 0, 1.2] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', aheadM: 38, side: 1.5 * s, along: 0, lift: 11, fov: 21, lookHero: [0, 0, 1.2] }]],
  [`roofLead${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', aheadM: 30, side: 1.2 * s, along: 0, lift: 8, fov: 24, lookHero: [0, 0, 1.3] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', aheadM: 22, side: 1.2 * s, along: 0, lift: 7, fov: 28, lookHero: [0, 0, 1.3] }]],
  // composition wave c2 (2026-10-08): dead ground under a mid-frame hull and dead-centre head-ons. The lens aims 2.4 m
  // up so the hull sits low in the frame, rides further to the side so it turns three-quarter, and the zoom holds the
  // hull's size as a true dolly zoom
  [`routeLead34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', aheadM: 11, side: 2.2 * s, along: 0, lift: 1.8, fov: 36, lookHero: [0, 0, 2.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', aheadM: 10, side: 2.4 * s, along: 0, lift: 2.2, fov: 37, lookHero: [0, 0, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', aheadM: 9, side: 2.6 * s, along: 0, lift: 2.6, fov: 38, lookHero: [0, 0, 2.4] }]],
  [`routeZoom34${s > 0 ? 'R' : 'L'}`, [
    { tMs: 0, frame: 'travel', lookFrame: 'travel', aheadM: 8, side: 1.6 * s, along: 0, lift: 1.8, fov: 40, lookHero: [0, 0, 2.4] },
    { tMs: Math.round(DUR * 0.5), frame: 'travel', lookFrame: 'travel', aheadM: 13, side: 1.8 * s, along: 0, lift: 2.3, fov: 25.2, lookHero: [0, 0, 2.4] },
    { tMs: 'end', frame: 'travel', lookFrame: 'travel', aheadM: 21, side: 2 * s, along: 0, lift: 2.8, fov: 15.8, lookHero: [0, 0, 2.4] }]],
]);

/** Lens moves by kind: [name, keys]. */
function lensMoves(kind, town = false) {
  if (town && kind !== 'scene') return [...STREET_MOVES, ...STREET_LOW, ...ROUTE_LEADS, ...lowMoves(kind)];
  if (town) return [...STREET_MOVES, ...STREET_LOW, ...ROUTE_LEADS, ...lensMoves(kind)];
  if (kind === 'tank') return [...lowMoves(kind), ...[1, -1].flatMap((s) => [
    [`swoop${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [34, 66], low: [2.1, 7.5], out: [11, 30] })],
    [`leadReveal${s > 0 ? 'R' : 'L'}`, leadReveal(DUR, { side: s, near: [1.5, 9], far: [26, 50], swing: 38 })],
    [`orbitRise${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, s > 0 ? { from: -70, to: 110 } : { from: 70, to: -110 })],
    [`overtake${s > 0 ? 'R' : 'L'}`, overtake(DUR, { side: s })],
  ])];
  if (kind === 'battle') return [...lowMoves(kind), ...[1, -1].flatMap((s) => [
    [`swoop${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [42, 80], low: [2.6, 10], out: [14, 36], lookAhead: 10 })],
    [`orbitRise${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, { ...(s > 0 ? { from: -60, to: 100 } : { from: 60, to: -100 }), radius: [11, 32], lift: [2, 24] })],
    [`weave${s > 0 ? 'R' : 'L'}`, weave(DUR, { side: s, close: 7, wide: 26 })],
    [`leadReveal${s > 0 ? 'R' : 'L'}`, leadReveal(DUR, { side: s, near: [1.8, 11], far: [30, 60], swing: 45 })],
  ])];
  return [...lowMoves(kind), ...[1, -1].flatMap((s) => [
    [`swoopHigh${s > 0 ? 'R' : 'L'}`, swoop(DUR, { side: s, high: [70, 110], low: [7, 16], out: [28, 50], fov: [44, 42, 44], lookAhead: 14 })],
    [`orbitRiseHigh${s > 0 ? 'R' : 'L'}`, orbitRise(DUR, { ...(s > 0 ? { from: -40, to: 120 } : { from: 40, to: -120 }), radius: [18, 52], lift: [9, 48], fov: [44, 42] })],
    [`leadRevealHigh${s > 0 ? 'R' : 'L'}`, leadReveal(DUR, { side: s, near: [4, 14], far: [48, 80], swing: 50, fov: [38, 44] })],
  ])];
}

// the framing measure lives in lens-check.mjs (framingScore); FRAMING_V=1 scores as composition wave c1's re-plan did
const FRAMING_V = Number(process.env.FRAMING_V ?? 2);
const framing = (report) => framingScore(report, { version: FRAMING_V });

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
// takes sharing a set (2026-10-08: S01, S19 and S41 all stand on steinburg-day-main, and the route leads gave all three
// the same road, start and move): a route another take on the set already drives costs 1, the same route with the same
// move costs 3, and the same move on any route 1.5, so a set's takes differ in what they show
const setUse = new Map();
const setKeys = (n, family, lens) => { const set = SHOTS.find((x) => x[0] === Number(n))?.[4]?.id; return [`${set}|${family}`, `${set}|${family}|${lens?.replace(/[LR]$/, '')}`, `${set}|move|${lens?.replace(/[LR]$/, '')}`]; };
for (const [n, entry] of Object.entries(plan)) {
  if (!IDS.length || IDS.includes(Number(n))) continue;
  const [family, rest = ''] = (entry.note ?? '').split(' at ');
  const lens = rest.split('; ')[1]?.split(/[ (;]/)[0];
  for (const k of [lens?.replace(/[LR]$/, ''), family?.split(/[[+-]/)[0]]) if (k) usage.set(k, (usage.get(k) ?? 0) + 1);
  for (const k of setKeys(n, family, lens)) setUse.set(k, (setUse.get(k) ?? 0) + 1);
}
for (const [n, id, kind, title, set, film, still] of SHOTS) {
  if (IDS.length && !IDS.includes(n)) continue;
  const features = featuresOf(set.map);
  if (!features) { console.log(`s${n}: no features for ${set.map}, skipped`); continue; }
  const model = worldModel(features);
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
      // the props (world-model.mjs, from a features dump that carries them): crush what the hull can, hit nothing else
      const props = model ? propProblems(probe, model).filter((p) => !/^foe\d+$/.test(p.actor)) : [];
      if (props.length) { for (const p of props) reject(`${p.actor.replace(/\d+/g, '')}: ${p.what.replace(/[\d.]+ m\/s/g, '#').replace(/[\d.]+ slope/, 'steep slope')}`); continue; }
      const tracks = new Map(probe.storyboard.actorTracks.map((t) => [t.actor, t.keys])), o = {};
      const foes = probe.actors.filter((a) => a.name.startsWith('foe'));
      let foeGap = Infinity;
      for (let t = 0; t <= DUR; t += 200) for (const name of Object.keys(routes)) { sampleActorTrack(tracks.get(name), t, o); for (const f of foes) foeGap = Math.min(foeGap, Math.hypot(o.x - f.pos[0], o.z - f.pos[1])); }
      if (foeGap < 15) { reject('within 15 m of a foe'); continue; }
      // the fight is ahead: a hero never draws away from its nearest foe over the take (s01 'pushes up the main street'
      // drove off from its enemy on its road's other way, 2026-10-05), and closing on it scores
      let closing = 0;
      if (foes.length) {
        const heroKeys = tracks.get('hero'), near = (tMs) => { sampleActorTrack(heroKeys, tMs, o); return Math.min(...foes.map((f) => Math.hypot(o.x - f.pos[0], o.z - f.pos[1]))); };
        const d0 = near(0), d1 = near(DUR);
        if (d1 > d0 + 5) { reject('draws away from the enemy'); continue; }
        closing = Math.max(0, Math.min(1, (d0 - d1) / 40));
      }
    // a stabilised gun counter-rotates at the hull's yaw rate: a turn tighter than a turret can follow (65°/s, under the
    // selftest's 70) is out
    const wrapD = (d) => ((d % 360) + 540) % 360 - 180;
    const traverse = Math.max(0, ...probe.storyboard.actorTracks.filter((t) => !t.actor.startsWith('foe')).map((t) => Math.max(0, ...t.keys.slice(1).map((k, i) => Math.abs(wrapD(k.turretDeg - t.keys[i].turretDeg)) / ((k.tMs - t.keys[i].tMs) / 1000)))));
    if (traverse > 65) { reject('turret traverse over 65°/s'); continue; }
      // EXCLUDE_LENS (a regex over move names) keeps a take off moves another take on its set already shows
      const excluded = process.env.EXCLUDE_LENS ? new RegExp(process.env.EXCLUDE_LENS) : null;
      for (const [lens, cam] of [...lensMoves(kind, town), ...(town ? lensMoves(kind) : [])].filter(([name]) => !excluded?.test(name))) {
        let scene;
        try { scene = siteScene([n, id, kind, title, set, { ...base, ...MOTION, routes, ...(aim ? { aim } : {}), cam }, still]); } catch { reject('build'); continue; }
        const footprintBlocked = blockedFraction(scene), inFrame = heroInFrameFraction(scene);
        if (footprintBlocked > 0.05 || inFrame < 0.9) { reject(footprintBlocked > 0.05 ? 'lens blocked' : 'hero out of frame'); continue; }
        // the rail as the Studio plays it, against every prop, canopy and roof (lens-check.mjs)
        const lensSeen = model ? lensReport(scene, model) : null;
        if (lensSeen && (lensSeen.blocked > 0.05 || lensSeen.outOfFrame > 0.1)) { reject(lensSeen.blocked > 0.05 ? `lens blocked by ${lensSeen.worst[0]?.by.replace(/^a /, '') ?? 'props'}` : 'hero out of frame between keys'); continue; }
        if (lensSeen?.inside > 0) { reject('lens inside a record'); continue; }
        const blocked = Math.max(footprintBlocked, lensSeen?.blocked ?? 0);
        const fr = lensSeen ? framing(lensSeen) : { sweet: 0, bad: 1 };
        if (fr.bad > 0.5) { reject('framing: half the take outside the critics\' bar'); continue; }
        // (2026-10-09: S17, S30 and S40 hid the hero behind bushes for 0.6–0.9 s, which a wave's per-take mean forgives and
        // a loop on the site does not) the hero more than half behind the foreground for OCCLUDE_MS (300) is a defect
        if (longestRun(lensSeen?.perSample ?? [], (q) => (q.fore?.share ?? 0) > 0.5) >= OCCLUDE_MS) { reject('the hero behind the foreground'); continue; }
        const m = metrics(scene), range = m.far / Math.max(3, m.near), road = family.startsWith('road');
        // a FLANK take swings the hero's gun out across the frame (site50.selftest: 40° off the hull in ten takes); the
        // stabilised aim sets that angle from where the foes stand, so a route that brings it scores
        const wrapD = (d) => ((d % 360) + 540) % 360 - 180;
        const heroKeys = scene.storyboard.actorTracks.find((t) => t.actor === 'hero')?.keys ?? [];
        const flankSwing = scene.meta.turrets?.style === 'flank' && heroKeys.some((k) => Math.abs(wrapD(k.turretDeg)) >= 40) ? 1 : 0;
        // a move family (left and right alike) and a route family used before cost the next shot, so the fifty mix
        const moveFamily = lens.replace(/[LR]$/, ''), routeFamily = family.split(/[[+-]/)[0];
        // framing leads (composition wave c1): the sweet share and the bad share outweigh the motion terms, whose range
        // and climb rewards (which drove the lens up into the look-down) are capped low
        // framing v3's flaws (composition wave c3: clutter in the foreground and sliced escorts cost a good frame half a
        // point; a gun jammed against the edge for most of a take cost it: the four re-plans whose share of tight-gun
        // samples rose to 0.88-1.00 all lost 0.33-1.00, and at 1.5 the search score tracks c3's takes best, rank 0.57)
        const score = 4 * fr.sweet - 3 * fr.bad - 1.75 * (fr.flaw ?? 0) - 1.5 * (fr.gunTight ?? 0) - 0.5 * (fr.merger ?? 0) + 1.0 * Math.min(range, 3) / 3 + 0.2 * Math.min(m.climb, 10) / 10 + 0.8 * m.front + 0.4 * Math.min(m.speed, speed) / speed + 0.3 * closing
          + 0.3 * inFrame - 2 * blocked - USAGE_W * (usage.get(moveFamily) ?? 0) - 0.15 * (usage.get(routeFamily) ?? 0) + (scene.meta.cameraFix ? -0.2 : 0) + (road && town ? 0.15 : 0)
          - 1 * (setUse.get(setKeys(n, family, lens)[0]) ?? 0) - 3 * (setUse.get(setKeys(n, family, lens)[1]) ?? 0) - 1.5 * (setUse.get(setKeys(n, family, lens)[2]) ?? 0)
          + 0.6 * flankSwing;
        results.push({ score, family, lens, routes, aim, cam: scene.meta.cameraFix ? null : cam, m, blocked, inFrame, fix: scene.meta.cameraFix ?? null, fr });
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
  if (process.env.TOP) for (const r of results.slice(0, Number(process.env.TOP))) console.log(`   ${r.score.toFixed(2)} ${r.family} ${r.lens} sweet ${r.fr.sweet.toFixed(2)} bad ${r.fr.bad.toFixed(2)}${r.fr.flaw != null ? ` flaw ${r.fr.flaw.toFixed(2)} gun ${r.fr.gunTight.toFixed(2)}` : ''}`);
  // (2026-10-08: a partial run that found nothing deleted three takes' plans; the plan in hand stays unless DROP=1)
  if (!best) { console.log(`s${String(n).padStart(2, '0')} ${id}: no candidate clears every check — ${process.env.DROP === '1' ? 'keeps its own motion' : plan[n] ? 'keeps its plan' : 'keeps its own motion'} (${secs} s)`); if (process.env.DROP === '1') delete plan[n]; continue; }
  for (const k of [best.lens.replace(/[LR]$/, ''), best.family.split(/[[+-]/)[0]]) usage.set(k, (usage.get(k) ?? 0) + 1);
  for (const k of setKeys(n, best.family, best.lens)) setUse.set(k, (setUse.get(k) ?? 0) + 1);
  plan[n] = { note: `${best.family} at ${best.m.speed.toFixed(0)} m/s; ${best.lens}${best.fix ? ` (lens ${best.fix})` : ''}${found.count ? `; ${found.count} tanks` : ''}`, ...MOTION,
    ...(found.count ? { count: found.count } : {}),
    routes: best.routes, ...(best.aim ? { aim: best.aim } : {}), cam: best.cam ?? [...lensMoves(kind, town), ...lensMoves(kind)].find(([l]) => l === best.lens)[1],
    checks: { lens: `${best.m.near.toFixed(0)}–${best.m.far.toFixed(0)} m`, climb: +best.m.climb.toFixed(1), front: +best.m.front.toFixed(2), inFrame: +best.inFrame.toFixed(2), blocked: +best.blocked.toFixed(2),
      sweet: +best.fr.sweet.toFixed(2), bad: +best.fr.bad.toFixed(2), ...(best.fr.flaw != null ? { flaw: +best.fr.flaw.toFixed(2), gunTight: +best.fr.gunTight.toFixed(2), merger: +best.fr.merger.toFixed(2) } : {}), candidates: results.length } };
  console.log(`s${String(n).padStart(2, '0')} ${id}: ${plan[n].note} · lens ${plan[n].checks.lens}, climb ${plan[n].checks.climb} m, front ${plan[n].checks.front}, sweet ${plan[n].checks.sweet}, bad ${plan[n].checks.bad}, ${results.length} passed (${secs} s)`);
}
writeFileSync(OUT, `${JSON.stringify(plan, null, 1)}\n`);
console.log(`motion plan: ${Object.keys(plan).length} shots -> ${OUT}`);
