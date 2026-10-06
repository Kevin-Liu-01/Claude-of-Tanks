// Route clearance for moving shots (2026-10-05): every actor's track sampled through the take against the map's dumped
// features — a hull's centre 3 m or more from any building footprint, outside 0.9 of every wood's radius (a hull at
// speed must not graze the outer trees, where a lens only needs to clear the 0.75 core), off water and 60 m inside the
// map's edge — and every pair of hulls 7 m apart or more at every instant. Pure: give it a built scene and the map's
// features (lab --features dump).
import { sampleActorTrack } from '../../src/game/studioTimeline.ts';

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
