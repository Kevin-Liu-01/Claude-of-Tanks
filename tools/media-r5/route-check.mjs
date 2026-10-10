// Route clearance for moving shots (2026-10-05): every actor's track sampled through the take against the map's dumped
// features — a hull's centre 3 m or more from any building footprint, outside 0.9 of every wood's radius (a hull at
// speed must not graze the outer trees, where a lens only needs to clear the 0.75 core), off water and 60 m inside the
// map's edge — and every pair of hulls 7 m apart or more at every instant. Pure: give it a built scene and the map's
// features (lab --features dump).
import { existsSync, readFileSync } from 'node:fs';
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';

// Each media tank's contact rectangle (hull-dims.mjs → hull-dims.json): [half length, half width]; a tank not in the
// table is held to a long MBT's (4.1 × 1.95 m).
const DIMS_FILE = new URL('./hull-dims.json', import.meta.url);
const DIMS = existsSync(DIMS_FILE) ? JSON.parse(readFileSync(DIMS_FILE, 'utf8')) : {};
/** A tank's contact half extents [halfLength, halfWidth] (m). */
export const hullOf = (id) => DIMS[id] ?? [4.1, 1.95];

const edgeDist = (b, x, z) => {
  const c = Math.cos(b.rot ?? 0), s = Math.sin(b.rot ?? 0), dx = x - b.x, dz = z - b.z;
  const u = Math.abs(dx * c + dz * s) - b.w / 2, v = Math.abs(-dx * s + dz * c) - b.d / 2;
  return u > 0 || v > 0 ? Math.hypot(Math.max(u, 0), Math.max(v, 0)) : Math.max(u, v);
};

/** Battlefields whose water is ice the tanks drive on (Glacier Pass's lake, Frosthollow's river and pools). */
const FROZEN_MAPS = new Set(['alpine', 'winter', 'whiteout']);
/** Whether a scene's water stops its tanks: not on a frozen map, and not for a set staged on the water (allowWater). */
export const waterBlocks = (scene) => !FROZEN_MAPS.has(scene.map) && !scene.actors.some((a) => a.allowWater);

/** Problems with a scene's routes: [{ actor, tMs, what }] (empty when clear), first per actor and kind. */
export function routeProblems(scene, features, { wallM = 3, gapM = 7, woodK = 0.9, stepMs = 100, water = true } = {}) {
  const dur = scene.storyboard?.durationMs ?? 0, tracks = new Map((scene.storyboard?.actorTracks ?? []).map((t) => [t.actor, t.keys]));
  const half = (features.size ?? 1024) / 2 - 60, woods = (features.treeClusters ?? []).map((t) => ({ x: t.x, z: t.z, r: t.r * woodK }));
  const pools = water ? (features.waterOrSoft ?? []).filter((w) => 'r' in w) : []; // a set on the ice (allowWater) drives on it
  const problems = [], seen = new Set(), o = {};
  const note = (actor, tMs, kind, what) => { if (seen.has(`${actor}|${kind}`)) return; seen.add(`${actor}|${kind}`); problems.push({ actor, tMs, what }); };
  const at = (a, t) => { const keys = tracks.get(a.name); if (!keys?.length) return [a.pos[0], a.pos[1]]; sampleActorTrack(keys, t, o); return [o.x, o.z]; };
  for (let t = 0; t <= dur; t += stepMs) {
    const pos = scene.actors.map((a) => [a, at(a, t)]);
    for (const [a, [x, z]] of pos) {
      if (Math.abs(x) > half || Math.abs(z) > half) note(a.name, t, 'edge', `near the map's edge at [${x.toFixed(0)}, ${z.toFixed(0)}]`);
      let wall = Infinity, wallKind = '';
      for (const b of features.buildings ?? []) { const d = edgeDist(b, x, z); if (d < wall) { wall = d; wallKind = b.kind ?? 'building'; } }
      if (wall < wallM) note(a.name, t, 'wall', `${wall.toFixed(1)} m from a ${wallKind}`);
      for (const w of woods) if (Math.hypot(x - w.x, z - w.z) < w.r) note(a.name, t, 'wood', 'in a wood');
      for (const w of pools) if (Math.hypot(x - w.x, z - w.z) < w.r) note(a.name, t, 'water', 'on water');
    }
    for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) {
      const d = Math.hypot(pos[i][1][0] - pos[j][1][0], pos[i][1][1] - pos[j][1][1]);
      if (d < gapM) note(`${pos[i][0].name}+${pos[j][0].name}`, t, 'gap', `hulls ${d.toFixed(1)} m apart`);
    }
  }
  return problems;
}

/**
 * Problems with a scene's routes against the props (2026-10-06, world-model.mjs: the engine review's clips showed hulls
 * passing through standing walls and carts). A hull may run through what it crushes at its speed there — the Studio
 * crushes it as a battle hull does (src/game/studioCrush.ts), and a record crushed once stays down for the hulls behind
 * — but never into what it cannot crush (a bunker, a building, a prop whose overrun speed it does not reach). No hull
 * starts inside a record or climbs a slope past 0.4 (22°: the lab's PATH note flags 0.32, a battle tank climbs 30°). The hull
 * is its own contact rectangle (hull-dims.json) with `pad` to spare.
 * [{ actor, tMs, what }], first per actor and kind.
 */
export function propProblems(scene, model, { pad = 0.15, stepMs = 50, maxSlope = 0.4 } = {}) {
  const dur = scene.storyboard?.durationMs ?? 0, tracks = new Map((scene.storyboard?.actorTracks ?? []).map((t) => [t.actor, t.keys]));
  const problems = [], seen = new Set(), crushed = new Set(), contacts = [], o = {}, prev = new Map();
  const note = (actor, tMs, kind, what) => { if (seen.has(`${actor}|${kind}`)) return; seen.add(`${actor}|${kind}`); problems.push({ actor, tMs, what }); };
  for (let t = 0; t <= dur; t += stepMs) {
    for (const a of scene.actors) {
      const keys = tracks.get(a.name);
      if (!keys?.length && t > 0) continue; // a parked hull is checked where it stands
      let x, z, yaw;
      if (keys?.length) { sampleActorTrack(keys, t, o); x = o.x; z = o.z; yaw = (o.facingDeg ?? 0) * Math.PI / 180; }
      else { x = a.pos[0]; z = a.pos[1]; yaw = (a.facingDeg ?? 0) * Math.PI / 180; }
      const last = prev.get(a.name), speed = last ? Math.hypot(x - last[0], z - last[1]) / (stepMs / 1000) : 0;
      prev.set(a.name, [x, z]);
      const [hl, hw] = hullOf(a.id);
      for (const r of model.hullContacts(x, z, yaw, hl + pad, hw + pad, contacts)) {
        if (crushed.has(r)) continue;
        if (t === 0) { note(a.name, t, 'start', `starts in a ${r.kind}`); continue; }
        if (model.crushes(r, speed)) { crushed.add(r); continue; }
        note(a.name, t, 'hit', r.crushable ? `meets a ${r.kind} at ${speed.toFixed(1)} m/s, under its ${(r.crushMin ?? 1.67).toFixed(1)} m/s overrun` : `drives into a ${r.kind}`);
      }
      const slope = model.slopeAt(x, z);
      if (slope > maxSlope) note(a.name, t, 'slope', `a ${slope.toFixed(2)} slope`);
    }
  }
  return problems;
}
