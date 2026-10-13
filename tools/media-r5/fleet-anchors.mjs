// The fleet takes' sets (fleet-plan.mjs, fleet-replan.mjs): candidate anchors on a battlefield from its own records,
// best first. An anchor is a start the hero's ground and 10 m round it leave flat, dry, open and clear, with the enemy's
// ground 80 m ahead the same and the run between crossing a wood or a wall twice at most (the motion search routes round
// them), lived in around (records 25-160 m off), on a road when one passes. [x, z, headingDeg, score]
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { worldModel } from './world-model.mjs';

const hash = (s) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
/** The finder over the surveys in FEATURES: { anchorsOf(map), modelOf(map) }. */
export function anchorsFinder(FEATURES) {
  const models = new Map();
  const modelOf = (map) => {
    if (!models.has(map)) {
      const f = join(FEATURES, `features-${map}.json`);
      const features = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : null;
      models.set(map, features ? { features, model: worldModel(features) } : null);
    }
    return models.get(map);
  };
  const rad = (d) => d * Math.PI / 180;
  /** Candidate anchors on a map, best first: [x, z, headingDeg, score]. */
  function anchorsOf(map) {
    const got = modelOf(map);
    if (!got?.model) return [];
    const { features, model } = got, half = model.size / 2 - 110, out = [], contacts = [];
    // the route checker's woods (tree clusters at 0.9 of their radius) and water (the soft circles), 3 m to spare
    const woods = (features.treeClusters ?? []).map((t) => [t.x, t.z, t.r * 0.9 + 3]);
    const pools = (features.waterOrSoft ?? []).filter((w) => 'r' in w).map((w) => [w.x, w.z, w.r + 3]);
    const open = (x, z) => woods.every(([wx, wz, r]) => Math.hypot(x - wx, z - wz) > r) && pools.every(([wx, wz, r]) => Math.hypot(x - wx, z - wz) > r);
    const flatDry = (x, z) => Math.abs(x) < half && Math.abs(z) < half && model.slopeAt(x, z) < 0.15 && model.wetAt(x, z) < 0.2 && open(x, z);
    const clearBox = (x, z, yaw, hl, hw) => !model.hullContacts(x, z, yaw, hl, hw, contacts).length;
    const consider = (x, z, heading, road) => {
      const f = [Math.sin(rad(heading)), Math.cos(rad(heading))], side = [f[1], -f[0]];
      // the start (the hero's ground and 10 m round it) and the enemy's ground 80 m ahead must be flat, dry, open and clear;
      // the run between may cross a wood or a wall twice at most (the motion search routes round them)
      for (const [s, lat] of [[0, 0], [10, 0], [-10, 0], [0, 10], [0, -10], [80, 0], [80, 8], [80, -8]]) {
        if (!flatDry(x + f[0] * s + side[0] * lat, z + f[1] * s + side[1] * lat)) return;
      }
      if (!clearBox(x, z, rad(heading), 9, 6) || !clearBox(x + f[0] * 80, z + f[1] * 80, rad(heading), 6, 8)) return;
      let blocked = 0;
      for (let s = 20; s <= 70; s += 10) if (!flatDry(x + f[0] * s, z + f[1] * s) || !clearBox(x + f[0] * s, z + f[1] * s, rad(heading), 3, 4)) blocked++;
      if (blocked > 2) return;
      // lived in: records between 25 and 160 m around (a town's edge or a farm, not an empty plain or a street canyon)
      const near = model.query(x - 160, z - 160, x + 160, z + 160, []).filter((r) => {
        const cx = (r.min[0] + r.max[0]) / 2, cz = (r.min[2] + r.max[2]) / 2, d = Math.hypot(cx - x, cz - z);
        return d > 25 && d < 160;
      }).length;
      const score = Math.min(near, 160) / 160 + (road ? 0.35 : 0) - Math.hypot(x, z) / model.size * 0.3;
      out.push([+x.toFixed(1), +z.toFixed(1), +((heading % 360 + 360) % 360).toFixed(1), +score.toFixed(3)]);
    };
    for (const road of features.roads ?? []) {
      const pts = Array.isArray(road) ? road : road.pts ?? [];
      for (let i = 1; i < pts.length; i++) {
        const [a, b] = [pts[i - 1], pts[i]], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1) continue;
        const heading = Math.atan2(b[0] - a[0], b[1] - a[1]) * 180 / Math.PI;
        for (let s = 0; s < len; s += 25) {
          const x = a[0] + (b[0] - a[0]) * s / len, z = a[1] + (b[1] - a[1]) * s / len;
          consider(x, z, heading, true); consider(x, z, heading + 180, true);
        }
      }
    }
    for (let x = -half; x <= half; x += 45) for (let z = -half; z <= half; z += 45) for (const heading of [0, 90, 180, 270]) consider(x, z, heading + (hash(`${map}${x}${z}`) % 40) - 20, false);
    return out.sort((p, q) => q[3] - p[3]);
  }

  return { anchorsOf, modelOf };
}
