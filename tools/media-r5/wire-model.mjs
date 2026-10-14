// Overhead wires as the engine strings them, for the lens checks (2026-10-14, the coordinator on the combat round's
// 224 review: wires and cables are occluders; s225 and s226 ended with the lens under a telephone line's conductors).
// - The telephone line (props.ts, utilityNetwork.ts): consecutive utility poles 6-52 m apart are strung with two
//   conductors 0.6 m either side of the line, 6.5 m over each pole's foot, hanging a catenary 0.45 m + 0.8 % of the
//   span deep, 0.02 m in radius. A features dump's 'pole' crushables keep the network's order (lab.mjs exports the
//   world's crushables in order, a utility pole being the one with an index and no kind).
// - The high-voltage lines (scenery.ts, sceneryKit.ts buildPylon): the map's scenery.powerLines, a conductor from each
//   insulator yoke of a tower (two crossarm pairs, the earth-wire peak) to the same yoke of the next, sagging span x
//   0.04 as a parabola (the earth wire 0.8 of that), 0.055 m in radius (the earth wire 0.03). A dump with `pylons` (the
//   scenery receipt, lab.mjs since 2026-10-14) gives the standing towers and the height they were built to, exactly;
//   an older one gets the game's rule without the crowns: the authored height, raised until the lowest conductor in its
//   sag clears the ground under the span by 12 m, at most 70 m (over a wood the true towers stand taller).
// Pure: features and the map's source in, wires out ({ kind, r, pts: [[x, y, z], ...], min, max }).
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAPS = join(fileURLToPath(new URL('.', import.meta.url)), '../../src/world/maps');
const POLE_ATTACH_M = 6.5, POLE_SIDE_M = 0.6, SPAN_MIN_M = 6, SPAN_MAX_M = 52, CATENARY_K = 1.35, TELEPHONE_R = 0.02;
const PYLON_SAG = 0.04, PYLON_TALLEST_M = 70, HV_R = 0.055, EARTH_R = 0.03;
const cache = new WeakMap();

function bounds(pts) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (const p of pts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  return { min, max };
}

/** The telephone line's conductors from a dump's poles (utilityNetwork.ts writeSpanPoints, standing poles). */
export function telephoneWires(features, segments = 12) {
  const poles = (features?.crushables ?? []).filter((c) => c[5] === 'pole');
  const wires = [], cosh = Math.cosh(CATENARY_K) - 1;
  for (let i = 0; i + 1 < poles.length; i++) {
    const [ax, ay, az] = poles[i], [bx, by, bz] = poles[i + 1], span = Math.hypot(bx - ax, bz - az);
    if (span > SPAN_MAX_M || span < SPAN_MIN_M) continue;
    // the crossarm stands across the line: the conductors 0.6 m either side of the span's direction
    const sx = -(bz - az) / span * POLE_SIDE_M, sz = (bx - ax) / span * POLE_SIDE_M, droop = 0.45 + span * 0.008;
    for (const side of [-1, 1]) {
      const pts = [];
      for (let k = 0; k <= segments; k++) {
        const t = k / segments, cat = 1 - (Math.cosh((t - 0.5) * 2 * CATENARY_K) - 1) / cosh;
        pts.push([ax + (bx - ax) * t + side * sx, ay + POLE_ATTACH_M + (by - ay) * t - cat * droop, az + (bz - az) * t + side * sz]);
      }
      wires.push({ kind: 'telephone wire', r: TELEPHONE_R, pts, ...bounds(pts) });
    }
  }
  return wires;
}

/** The map's high-voltage lines as authored (`powerLines: [{ towers: [[x, z], ...], heightM }]` in its source). */
export function powerLinesOf(map) {
  const file = join(MAPS, `${map}.ts`);
  if (!map || !existsSync(file)) return [];
  const block = /powerLines:\s*\[([\s\S]*?)\]\s*,?\s*\n/.exec(readFileSync(file, 'utf8'))?.[1] ?? '';
  const lines = [];
  for (const m of block.matchAll(/towers:\s*(\[\s*\[[\s\S]*?\]\s*\])\s*,\s*heightM:\s*([\d.]+)/g)) {
    lines.push({ towers: JSON.parse(m[1]), heightM: Number(m[2]) });
  }
  return lines;
}

/**
 * The high-voltage conductors (scenery.ts composeScenery's power lines; sceneryKit.ts buildPylon's arms). With the
 * dump's `pylons` (lab.mjs, the scenery receipt: [x, z, placed, heightM, authoredHeightM, name]) the line is strung
 * between its standing towers at the height they were built to; without them, at the height the game's rule gives
 * over the bare ground.
 */
export function powerWires(map, heightAt, segments = 18, pylons = null) {
  const wires = [];
  for (const line of powerLinesOf(map)) {
    const H0 = line.heightM ?? 34;
    const built = pylons?.length ? line.towers.map(([x, z]) => pylons.find((p) => Math.abs(p[0] - x) < 0.5 && Math.abs(p[1] - z) < 0.5) ?? null) : null;
    let H = H0;
    for (let t = 0; t + 1 < line.towers.length; t++) {
      const [ax, az] = line.towers[t], [bx, bz] = line.towers[t + 1], span = Math.hypot(bx - ax, bz - az);
      if (span < 1) continue;
      const sag = span * PYLON_SAG, footA = heightAt(ax, az), footB = heightAt(bx, bz);
      const need = (f, top) => (top + 2.2 + 4 * sag * f * (1 - f) - (footA + (footB - footA) * f)) / 0.62;
      for (let k = 0, n = Math.max(2, Math.ceil(span / 8)); k <= n; k++) {
        H = Math.max(H, need(k / n, heightAt(ax + (bx - ax) * k / n, az + (bz - az) * k / n) + 12));
      }
    }
    H = Math.min(H, PYLON_TALLEST_M);
    const receiptH = built?.find((p) => p && p[3] > 0)?.[3];
    if (receiptH) H = receiptH;
    // buildPylon(rng, H, mobile, H0): the arms keep the authored tower's breadth
    const wide = H0 / 34, waistY = H * 0.62, arms = [];
    for (const [y, reach] of [[waistY + 0.4, 11.5 * wide], [waistY + (H - waistY) * 0.55, 8.2 * wide]]) {
      for (const side of [-1, 1]) arms.push([side * (reach - 0.3), y - 2.6, HV_R, 1]);
    }
    arms.push([0, H, EARTH_R, 0.8]);
    // each tower's yaw from its authored neighbours (as scenery.ts turns it), then only the towers that stand
    const towers = line.towers.map(([x, z], t) => {
      const [px, pz] = line.towers[Math.max(0, t - 1)], [nx, nz] = line.towers[Math.min(line.towers.length - 1, t + 1)];
      return { x, z, y: heightAt(x, z) - 0.15, yaw: Math.atan2(nx - px, nz - pz) };
    }).filter((_, t) => !built || built[t]?.[2] === 1);
    for (let t = 0; t + 1 < towers.length; t++) {
      const a = towers[t], b = towers[t + 1], span = Math.hypot(b.x - a.x, b.z - a.z);
      for (const [ax, ay, r, sagK] of arms) {
        // the arm's offset turned to each tower's yaw (THREE's applyAxisAngle about +Y)
        const pa = [a.x + ax * Math.cos(a.yaw), a.y + ay, a.z - ax * Math.sin(a.yaw)];
        const pb = [b.x + ax * Math.cos(b.yaw), b.y + ay, b.z - ax * Math.sin(b.yaw)];
        const sag = span * PYLON_SAG * sagK, pts = [];
        for (let k = 0; k <= segments; k++) {
          const f = k / segments;
          pts.push([pa[0] + (pb[0] - pa[0]) * f, pa[1] + (pb[1] - pa[1]) * f - sag * 4 * f * (1 - f), pa[2] + (pb[2] - pa[2]) * f]);
        }
        wires.push({ kind: r === EARTH_R ? 'earth wire' : 'power line', r, pts, ...bounds(pts) });
      }
    }
  }
  return wires;
}

/** Every overhead wire of a dump's battlefield, cached per dump. */
export function wiresOf(features, heightAt) {
  if (!features) return [];
  if (!cache.has(features)) cache.set(features, [...telephoneWires(features), ...powerWires(features.map, heightAt, 18, features.pylons ?? null)]);
  return cache.get(features);
}
