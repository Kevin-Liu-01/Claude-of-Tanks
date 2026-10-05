// Camera clearance against a battlefield's buildings and woods (the dumped map features: rotated footprints, tree
// cluster circles): a built shot's camera must never sit inside a building or a wood's dense core, and below roof
// (canopy) height its line of sight to the hero must not pass through one. Pure geometry on the scene JSON, so a
// plan is checked before it costs a GPU lease.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SHOTS } from './paths.mjs';

const footprints = new Map();
/** Rotated building rectangles of `map` ([] when its features were never dumped). */
export function buildingsOf(map) {
  if (!footprints.has(map)) {
    const f = join(SHOTS, 'features', `features-${map}.json`);
    const list = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).buildings ?? [] : [];
    footprints.set(map, list.map(b => ({ x: b.x, z: b.z, hw: b.w / 2, hd: b.d / 2, c: Math.cos(b.rot ?? 0), s: Math.sin(b.rot ?? 0) })));
  }
  return footprints.get(map);
}
const woods = new Map();
/** Tree clusters of `map` as dense cores (0.75 of the dumped radius: the trees thin toward a cluster's edge). */
export function woodsOf(map) {
  if (!woods.has(map)) {
    const f = join(SHOTS, 'features', `features-${map}.json`);
    const list = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')).treeClusters ?? [] : [];
    woods.set(map, list.map(t => ({ x: t.x, z: t.z, r: t.r * 0.75 })));
  }
  return woods.get(map);
}
/** Height above which a camera clears the woods' canopy. */
const CANOPY_CLEAR_M = 22;
const inside = (b, x, z, pad) => {
  const dx = x - b.x, dz = z - b.z, u = dx * b.c + dz * b.s, v = -dx * b.s + dz * b.c;
  return Math.abs(u) < b.hw + pad && Math.abs(v) < b.hd + pad;
};
/** Height above which a camera clears the village roofs (sightlines are only tested below it). */
export const ROOF_CLEAR_M = 12;
/** Height below which a camera may not hover over a building at all (the tall town houses rise past ROOF_CLEAR_M). */
const HOVER_CLEAR_M = 22;

/** Fraction of the storyboard's camera keys that sit inside a building or lose the hero behind one. */
export function blockedFraction(scene, { pad = 1.4 } = {}) {
  const shots = scene.storyboard?.shots ?? [];
  const blds = buildingsOf(scene.map), trees = woodsOf(scene.map);
  if (!shots.length || (!blds.length && !trees.length)) return 0;
  const hero = scene.storyboard.actorTracks?.find(t => t.actor === 'hero')?.keys;
  const heroAt = tMs => {
    if (!hero?.length) { const a = scene.actors.find(x => x.name === 'hero'); return a?.pos; }
    let k = hero.findIndex(h => h.tMs >= tMs); if (k < 0) k = hero.length - 1;
    return hero[k].pos;
  };
  let bad = 0;
  for (const sh of shots) {
    const [cx, cy, cz] = sh.pos; // ground-relative storyboards: y is the lens height above the terrain
    if (cy > CANOPY_CLEAR_M) continue; // over the roofs and the woods
    if (cy > ROOF_CLEAR_M && cy <= HOVER_CLEAR_M && blds.some(b => Math.hypot(b.x - cx, b.z - cz) < 40 && inside(b, cx, cz, pad))) { bad++; continue; }
    const near = cy > ROOF_CLEAR_M ? [] : blds.filter(b => Math.hypot(b.x - cx, b.z - cz) < 80);
    const wood = trees.filter(t => Math.hypot(t.x - cx, t.z - cz) < 80 + t.r);
    const inWood = (x, z) => wood.some(t => Math.hypot(x - t.x, z - t.z) < t.r);
    if (near.some(b => inside(b, cx, cz, pad)) || inWood(cx, cz)) { bad++; continue; }
    const h = heroAt(sh.tMs); if (!h) continue;
    const len = Math.hypot(h[0] - cx, h[1] - cz), steps = Math.max(2, Math.ceil(len));
    let blocked = false;
    for (let i = 1; i < steps - 3 && !blocked; i++) {
      const t = i / steps, x = cx + (h[0] - cx) * t, z = cz + (h[1] - cz) * t;
      blocked = near.some(b => inside(b, x, z, 0)) || inWood(x, z);
    }
    if (blocked) bad++;
  }
  return bad / shots.length;
}

/** Fraction of the storyboard's camera keys whose frame (16:9 at the key's vertical fov) holds the hero's centre. */
export function heroInFrameFraction(scene, aspect = 16 / 9) {
  const shots = scene.storyboard?.shots ?? [];
  const hero = scene.storyboard?.actorTracks?.find(t => t.actor === 'hero')?.keys;
  const at = tMs => { if (!hero?.length) return scene.actors.find(a => a.name === 'hero')?.pos; let k = hero.findIndex(h => h.tMs >= tMs); return hero[k < 0 ? hero.length - 1 : k].pos; };
  if (!shots.length) return 1;
  let inside = 0;
  for (const sh of shots) {
    const h = at(sh.tMs); if (!h) continue;
    const f = [sh.lookAt[0] - sh.pos[0], sh.lookAt[1] - sh.pos[1], sh.lookAt[2] - sh.pos[2]];
    const d = [h[0] - sh.pos[0], 1.4 - sh.pos[1], h[1] - sh.pos[2]]; // heights are ground-relative: the hull centre ~1.4 m up
    const n = v => Math.hypot(...v), fl = n(f);
    const fw = f.map(v => v / fl), right = [fw[2], 0, -fw[0]].map((v, _, a) => v / (Math.hypot(a[0], a[2]) || 1));
    const up = [fw[1] * right[2] - fw[2] * right[1], fw[2] * right[0] - fw[0] * right[2], fw[0] * right[1] - fw[1] * right[0]];
    const z = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2]; if (z <= 0.5) continue;
    const x = (d[0] * right[0] + d[1] * right[1] + d[2] * right[2]) / z, y = (d[0] * up[0] + d[1] * up[1] + d[2] * up[2]) / z;
    const ty = Math.tan((sh.fov ?? 40) * Math.PI / 360), tx = ty * aspect;
    if (Math.abs(x) < tx * 0.95 && Math.abs(y) < ty * 0.95) inside++;
  }
  return inside / shots.length;
}
