// tools/plan-street-rows.mjs — a town's street rows authored as a plan (the maps lane, 2026-10-15; the Verdant process on
// Steinburg). The props pass's street rows (props.ts placeStreetRows) draw each slot's width, setback and a skip from the
// street stream and drop a slot at every check it fails, so its rows stand as detached houses between gaps (Steinburg:
// 95 of 120 row houses with both sides open). A Franconian town's houses stand wall to wall along its streets; this tool
// lays them so — both sides of every street inside the town box, house after house at one building line, each the next
// one's neighbour, a gap only where a lane, a planned building, a set piece, the square, the town wall or the ground
// stops the row — and writes them as the map's `props.townRowPlan` (props.ts TownRowEntry), which the props pass seats as
// recorded: each house the kit's row house on its plot, from a stream of its own.
//
// usage (cwd = a tree): node tools/plan-street-rows.mjs <mapId> <out.ts> <EXPORT_NAME> [--seed=n] [--ruin=0.06]
//   [--setback=6.3] [--width=7.4,10.4] [--depth=9,11.5] [--keep=x,z,r;x,z,r] [--json=<summary.json>]
// --keep: discs the rows keep out of whole (an objective's disc the match placement seats on open ground: Steinburg's
// square zone, which the plaza's sandbag nest pushes north-east of the crossing)
// The map's own townRowPlan is ignored while planning (the plan replaces it).
import { writeFileSync } from 'node:fs';
const T = process.cwd();
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const opt = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => a.slice(2).split('=')));
const [mapId, outPath, exportName] = args;
if (!mapId || !outPath || !exportName) throw new Error('usage: plan-street-rows.mjs <mapId> <out.ts> <EXPORT_NAME>');
const { installWorldBuildFixture } = await import(`${T}/tools/headlessWorldCollision.mjs`);
installWorldBuildFixture();
const { getMapConfig } = await import(`${T}/src/world/maps/index.ts`);
const { createHeightField, mulberry32 } = await import(`${T}/src/world/terrain.ts`);
const { roadSettlementJunction } = await import(`${T}/src/world/roadSettlementJunction.ts`);
const { LANDMARK_KINDS, resolveLandmarkParams } = await import(`${T}/src/world/landmarks/plan.ts`);

const base = getMapConfig(mapId);
const config = { ...base, props: { ...base.props, townRowPlan: undefined } };
const field = createHeightField(1337, config);
const L = field._layout, roads = L.roads, P = config.props;
const town = P.town ? { ...L.village, ...P.town } : L.village;
const junction = roadSettlementJunction(roads, { x: town.cx, z: town.cz });
const rng = mulberry32(Number(opt.seed ?? 0x5e1b0));
const RUIN = Number(opt.ruin ?? 0.06), SETBACK = Number(opt.setback ?? 6.3);
const [W0, W1] = (opt.width ?? '7.4,10.4').split(',').map(Number), [D0, D1] = (opt.depth ?? '9,11.5').split(',').map(Number);

// ---- geometry: oriented rectangles (centre, half sizes, yaw as three.js rotation.y: local +x -> (cos, -sin))
const rect = (x, z, w, d, rot) => ({ x, z, hw: w / 2, hd: d / 2, c: Math.cos(rot), s: Math.sin(rot) });
const axes = (r) => [[r.c, -r.s], [r.s, r.c]];
function overlap(a, b, pad = 0) {
  for (const [ax, az] of [...axes(a), ...axes(b)]) {
    const proj = (r) => {
      const [[ux, uz], [vx, vz]] = axes(r);
      const ext = r.hw * Math.abs(ux * ax + uz * az) + r.hd * Math.abs(vx * ax + vz * az);
      const m = r.x * ax + r.z * az;
      return [m - ext, m + ext];
    };
    const [a0, a1] = proj(a), [b0, b1] = proj(b);
    if (a1 <= b0 - pad || b1 <= a0 - pad) return false;
  }
  return true;
}
const cornersOf = (r) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, k]) => {
  const [[ux, uz], [vx, vz]] = axes(r);
  return [r.x + ux * r.hw * i + vx * r.hd * k, r.z + uz * r.hw * i + vz * r.hd * k];
});
const segD = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - ax - dx * t, pz - az - dz * t);
};
const roadDist = (x, z, skip = -1) => {
  let best = Infinity;
  roads.forEach((pts, ri) => { if (ri !== skip) for (let i = 1; i < pts.length; i++) best = Math.min(best, segD(x, z, ...pts[i - 1], ...pts[i])); });
  return best;
};

// ---- what the rows keep out of: planned buildings, set pieces, tactical beats, hardstands, the walls
const INFO = { church: [9.6, 23.1], chapel: [5.8, 8.6], tower: [3.8, 3.8], factory: [16, 26], rowhouse: [9.6, 10.2], cottage: [6, 8.4],
  depot: [11, 20], barn: [8.4, 12.3], farmhouse: [13.4, 9.9], ruin: [6.8, 9], warehouse: [16, 24], firestation: [11.8, 15.4] };
const blocks = [];
for (const s of P.plannedSites ?? []) {
  const [w, d] = INFO[s.structure] ?? [10, 12];
  blocks.push({ r: rect(s.x, s.z, w + 3, d + 3, (s.yawDeg ?? 0) * Math.PI / 180), why: `planned ${s.structure}` });
}
for (const p of P.landmarks ?? []) {
  const kind = LANDMARK_KINDS[p.kind];
  if (!kind?.footprint) continue;
  const [hx, hz] = kind.footprint(resolveLandmarkParams(p));
  blocks.push({ r: rect(p.x, p.z, 2 * hx + 2, 2 * hz + 2, (p.yawDeg ?? 0) * Math.PI / 180), why: `landmark ${p.kind}` });
}
for (const b of P.tacticalBeats ?? []) blocks.push({ r: rect(b.x, b.z, 30, 30, 0), why: `beat ${b.id}` });
for (const h of config.terrain.hardstands ?? []) blocks.push({ r: rect(h.x, h.z, h.width + 7, h.length + 7, (h.yawDeg ?? 0) * Math.PI / 180), why: 'hardstand' });
const keeps = (opt.keep ?? '').split(';').filter(Boolean).map((k) => k.split(',').map(Number));
const discHits = (r) => keeps.some(([kx, kz, kr]) => {
  const dx = kx - r.x, dz = kz - r.z, [[ux, uz], [vx, vz]] = axes(r);
  const lx = dx * ux + dz * uz, lz = dx * vx + dz * vz;
  return Math.hypot(lx - Math.max(-r.hw, Math.min(r.hw, lx)), lz - Math.max(-r.hd, Math.min(r.hd, lz))) < kr;
});
const walls = (P.wallRuns ?? []).map(([x0, z0, x1, z1]) => [x0, z0, x1, z1]);
const wallDist = (x, z) => walls.reduce((m, w) => Math.min(m, segD(x, z, ...w)), Infinity);

// ---- the rows
const rows = [], why = {};
const note = (k) => { why[k] = (why[k] ?? 0) + 1; };
function sampler(pts) {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = cum[cum.length - 1];
  const at = (t) => {
    let i = 1;
    while (i < cum.length - 1 && cum[i] < t) i++;
    const f = (t - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1]);
    const tx = pts[i][0] - pts[i - 1][0], tz = pts[i][1] - pts[i - 1][1], tl = Math.hypot(tx, tz) || 1;
    return [pts[i - 1][0] + tx * f, pts[i - 1][1] + tz * f, tx / tl, tz / tl];
  };
  return { total, at };
}
function tryHouse(ri, side, s, w, d, at) {
  // the house's frontage centred at s + w/2 along the road, its front SETBACK from the line
  const [rx, rz, tx, tz] = at(s + w / 2);
  const nx = -tz * side, nz = tx * side;
  const off = SETBACK + d / 2, x = rx + nx * off, z = rz + nz * off;
  if (x < town.x0 + 6 || x > town.x1 - 6 || z < town.z0 + 6 || z > town.z1 - 6) return 'outside';
  const rot = Math.atan2(-nx, -nz);
  const r = rect(x, z, w, d, rot);
  const cs = cornersOf(r);
  // every corner clear of every other road's core (3.5 m) and of its own (the front stays on the building line)
  for (const [cx, cz] of cs) if (roadDist(cx, cz, ri) < 4.2) return 'road';
  if (roadDist(x, z, ri) < 9.5) return 'road';
  if (Math.hypot(x - junction.x, z - junction.z) < 26) return 'junction';
  if (field._noVeg(x, z)) return 'noVeg';
  for (const b of blocks) if (overlap(r, b.r)) return b.why.split(' ')[0];
  if (discHits(r)) return 'keep';
  if (cs.some(([cx, cz]) => wallDist(cx, cz) < 1.5) || wallDist(x, z) < 2.5) return 'wall';
  for (const o of rows) if (overlap(r, o.r, -0.3)) return 'row';
  const hs = cs.map(([cx, cz]) => field.getHeightAt(cx, cz));
  if (Math.max(...hs) - Math.min(...hs) > 2.4) return 'ground';
  return { x, z, rot, r };
}
for (let ri = 0; ri < roads.length; ri++) {
  const { total, at } = sampler(roads[ri]);
  for (const side of [-1, 1]) {
    let s = 2;
    while (s < total - 4) {
      const w = W0 + rng() * (W1 - W0), d = D0 + rng() * (D1 - D0);
      let got = tryHouse(ri, side, s, w, d, at), used = w;
      // a narrower house where the full width will not go (the inside of a bend, a lot's end)
      if (typeof got === 'string' && got === 'row') { const w2 = Math.max(W0 - 1.2, w * 0.7); const g2 = tryHouse(ri, side, s, w2, d, at); if (typeof g2 !== 'string') { got = g2; used = w2; } }
      if (typeof got === 'string') { note(got); s += got === 'outside' ? 6 : 1.5; continue; }
      const ruined = rng() < RUIN;
      const wallRoll = rng();
      const wall = wallRoll < 0.42 ? 'plaster' : wallRoll < 0.7 ? 'plaster2' : wallRoll < 0.86 ? 'plaster3' : 'stone';
      rows.push({ ...got, w: used, d, ruined, wall, rng: (Math.floor(rng() * 4294967296) | 0), road: ri, side });
      s += used - 0.2;
    }
  }
}

// ---- out
const lines = rows.map((h) => `  { x: ${h.x.toFixed(3)}, z: ${h.z.toFixed(3)}, rot: ${h.rot.toFixed(5)}, w: ${h.w.toFixed(2)}, d: ${h.d.toFixed(2)}, ruined: ${h.ruined}, wall: '${h.wall}', rng: ${h.rng} },`);
const cmd = process.argv.slice(3).filter((a) => a.startsWith('--keep') || a.startsWith('--seed')).join(' ');
const head = `// Generated by tools/plan-street-rows.mjs ${mapId} ${cmd} (the maps lane, the Verdant process): ${rows.length} street-row houses wall to
// wall along the town's streets at one building line (setback ${SETBACK} m), each the kit's row house on its plot from a
// stream of its own (props.ts townRowPlan, TownRowEntry). Regenerate with the tool; do not edit by hand.
import type { TownRowEntry } from '../props.ts';

export const ${exportName}: readonly TownRowEntry[] = [
`;
writeFileSync(outPath, head + lines.join('\n') + '\n];\n');
const summary = { houses: rows.length, ruined: rows.filter((h) => h.ruined).length, rejected: why,
  byRoad: Object.fromEntries(roads.map((_, ri) => [ri, rows.filter((h) => h.road === ri).length]).filter(([, n]) => n)) };
if (opt.json) writeFileSync(opt.json, JSON.stringify({ ...summary, rows: rows.map(({ r, ...h }) => h) }, null, 1));
console.log(JSON.stringify(summary));
