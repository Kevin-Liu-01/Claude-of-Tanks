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
// --lanes=z,0,x0,x1;x,-50,z0,z1: the bot planner's 25 m lattice lines a street must keep open (botRoutePlanner.ts: an edge
// keeps the widest hull's 2.75 m from every footprint), a house pushed back off its street until it clears them by
// --laneClear (default 3.1 m), else left out: the objective access and the bots reach the town along these lines
// The map's own townRowPlan is ignored while planning (the plan replaces it).
// --sites=cottage:6,farmhouse:2,tavern:1 --gap=3,8: a village street of detached houses instead (a lintdorp): each the
// structure the mix picks (by a hash of its place), its plot the base builder's, a gap of 3-8 m to the next, written as
// planned sites ({ structure, x, z, yawDeg }) for props.plannedSites (with plannedSitesAfterPlan on a recorded town).
// A recorded town plan's buildings (props.townPlan) are kept out of, as the planned sites and set pieces are.
// --built=2: every structure the map's own build stands (its plan, its yards' sheds, its set pieces), built in Node
// without the sites being planned, is kept out of by this margin (m): a site on a yard shed's seat pushes the shed off
// it (2026-10-16, the 226 gate's townPlans: a Polders cottage 1.4 m from a PR-head yard shed's seat read as two
// buildings moved off a carriageway).
// --yards=8.5: a recorded town's houses that take a yard (the kit's yard kinds) keep this much more ground round them
// (yards.ts plans a house's yard up to 8 m deep off any clear side: a site in that ground turns the yard and its shed)
// --clear=2.5 (sites mode): each house slid along its street, by the least that clears it, to stand this far from every
// building standing before it as the kit builds them (the map built with the sites); see the pass below
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
const SITES_MODE = !!opt.sites;
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
const INFO = { tavern: [9.7, 14.9], granary: [4.2, 6.4], woodshed: [4.3, 5.4], mill: [6.6, 6.6], fishery: [18, 20], church: [9.6, 23.1], chapel: [5.8, 8.6], tower: [3.8, 3.8], factory: [16, 26], rowhouse: [9.6, 10.2], cottage: [6, 8.4],
  depot: [11, 20], barn: [8.4, 12.3], farmhouse: [13.4, 9.9], ruin: [6.8, 9], warehouse: [16, 24], firestation: [11.8, 15.4] };
const blocks = [];
// (in the sites mode the map's planned sites are the plan being replaced: neither kept out of nor built)
for (const s of SITES_MODE ? [] : P.plannedSites ?? []) {
  const [w, d] = INFO[s.structure] ?? [10, 12];
  blocks.push({ r: rect(s.x, s.z, w + 3, d + 3, (s.yawDeg ?? 0) * Math.PI / 180), why: `planned ${s.structure}` });
}
for (const p of P.landmarks ?? []) {
  const kind = LANDMARK_KINDS[p.kind];
  if (!kind?.footprint) continue;
  const [hx, hz] = kind.footprint(resolveLandmarkParams(p));
  blocks.push({ r: rect(p.x, p.z, 2 * hx + 2, 2 * hz + 2, (p.yawDeg ?? 0) * Math.PI / 180), why: `landmark ${p.kind}` });
}
const { resolveRegionalArchitecture } = await import(`${T}/src/world/maps/regional/index.ts`);
const yardKinds = new Set(resolveRegionalArchitecture(P.architecture)?.yard?.kinds ?? []);
const YARDS = Number(opt.yards ?? 0);
for (const t of P.townPlan ?? []) {
  const [w, d] = INFO[t.structure] ?? [10, 12];
  const pad = yardKinds.has(t.structure) ? 2 * YARDS : 3;
  blocks.push({ r: rect(t.x, t.z, w + pad, d + pad, t.rot), why: `town ${t.structure}` });
}
for (const b of P.tacticalBeats ?? []) blocks.push({ r: rect(b.x, b.z, 30, 30, 0), why: `beat ${b.id}` });
for (const h of config.terrain.hardstands ?? []) blocks.push({ r: rect(h.x, h.z, h.width + 7, h.length + 7, (h.yawDeg ?? 0) * Math.PI / 180), why: 'hardstand' });
const keeps = (opt.keep ?? '').split(';').filter(Boolean).map((k) => k.split(',').map(Number));
const discHits = (r) => keeps.some(([kx, kz, kr]) => {
  const dx = kx - r.x, dz = kz - r.z, [[ux, uz], [vx, vz]] = axes(r);
  const lx = dx * ux + dz * uz, lz = dx * vx + dz * vz;
  return Math.hypot(lx - Math.max(-r.hw, Math.min(r.hw, lx)), lz - Math.max(-r.hd, Math.min(r.hd, lz))) < kr;
});
const LANE_CLEAR = Number(opt.laneClear ?? 3.1);
const lanes = (opt.lanes ?? '').split(';').filter(Boolean).map((l) => { const [ax, v, a, b] = l.split(','); return ax === 'z' ? [Number(a), Number(v), Number(b), Number(v)] : [Number(v), Number(a), Number(v), Number(b)]; });
/** The least distance from a rectangle to the lane segments (corners and edge samples against each segment). */
const laneDist = (r) => {
  if (!lanes.length) return Infinity;
  const cs = cornersOf(r), pts = [];
  for (let i = 0; i < 4; i++) { const [a, b] = [cs[i], cs[(i + 1) % 4]]; for (let t = 0; t <= 1; t += 0.125) pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  let best = Infinity;
  for (const [x0, z0, x1, z1] of lanes) for (const [px, pz] of pts) best = Math.min(best, segD(px, pz, x0, z0, x1, z1));
  // a lane line through the house itself
  for (const [x0, z0, x1, z1] of lanes) for (let t = 0; t <= 1; t += 0.01) { const x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; const [[ux, uz], [vx, vz]] = axes(r); const dx = x - r.x, dz = z - r.z; if (Math.abs(dx * ux + dz * uz) <= r.hw && Math.abs(dx * vx + dz * vz) <= r.hd) return 0; }
  return best;
};
if (opt.built) {
  const pad = Number(opt.built);
  const [vegetation, props, fleet, models] = await Promise.all([import(`${T}/src/world/vegetation.ts`), import(`${T}/src/world/props.ts`),
    import(`${T}/src/vehicles/fleetFactory.ts`), import(`${T}/src/world/propsModelStore.ts`)]);
  await models.preloadPropModels();
  const bare = { ...config, props: { ...config.props, ...(SITES_MODE ? { plannedSites: [] } : {}) } };
  const ids = bare.props?.tankWrecks?.ids ?? []; if (ids.length) await fleet.ensureTankBuilders(ids);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const flora = vegetation.createVegetation(field, engine, 2001, bare);
  const dressing = props.createProps(field, engine, 2002, bare, flora);
  for (const o of dressing.obstacles) {
    if (o.kind !== 'structure') continue;
    const w = o.max[0] - o.min[0], d = o.max[2] - o.min[2];
    blocks.push({ r: rect((o.min[0] + o.max[0]) / 2, (o.min[2] + o.max[2]) / 2, w + 2 * pad, d + 2 * pad, 0), why: 'built structure' });
  }
}
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
  // the house's frontage centred at s + w/2 along the road, its front SETBACK from the line (pushed further back, up to
  // 4 m, where a lattice lane runs along the street)
  const [rx, rz, tx, tz] = at(s + w / 2);
  const nx = -tz * side, nz = tx * side;
  let push = 0;
  for (; push <= 4; push += 0.5) {
    const o = SETBACK + push + d / 2, r0 = rect(rx + nx * o, rz + nz * o, w, d, Math.atan2(-nx, -nz));
    if (laneDist(r0) >= LANE_CLEAR) break;
  }
  if (push > 4) return 'lane';
  const off = SETBACK + push + d / 2, x = rx + nx * off, z = rz + nz * off;
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
const SITES = (opt.sites ?? '').split(',').filter(Boolean).map((t) => t.split(':')).map(([k, wt]) => [k, Number(wt)]);
const [G0, G1] = (opt.gap ?? '3,8').split(',').map(Number);
const hash = (x, z) => { let h = Math.imul(Math.round(x * 10) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(z * 10) + 0x7f4a7c15, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const pickSite = (x, z) => { const tot = SITES.reduce((a, [, wt]) => a + wt, 0); let r = hash(x, z) * tot; for (const [k, wt] of SITES) { if ((r -= wt) < 0) return k; } return SITES[0][0]; };
for (let ri = 0; ri < roads.length && SITES.length; ri++) {
  const { total, at } = sampler(roads[ri]);
  for (const side of [-1, 1]) {
    let s = 2 + rng() * 6;
    while (s < total - 4) {
      const [px, pz] = at(s);
      const kind = pickSite(px + side * 0.5, pz);
      const [w, d] = INFO[kind] ?? [7, 9];
      const got = tryHouse(ri, side, s, w, d, at);
      if (typeof got === 'string') { note(got); s += got === 'outside' ? 6 : 2; continue; }
      rows.push({ ...got, w, d, structure: kind, road: ri, side, s, at });
      s += w + G0 + rng() * (G1 - G0);
    }
  }
}
for (let ri = 0; ri < roads.length && !SITES.length; ri++) {
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

// ---- (sites mode) --clear=2.5: every house of the street at least this far (m) from every other building, as the kit
// builds them. The plan sizes its sites by INFO, a kit-agnostic table: the Zeeland farm stands 15-16.7 m long where INFO
// gives 13.4, so a farm and its neighbour round a corner stood 1.0-1.6 m apart, roof to roof (the maps lane, 2026-10-17;
// the Polders village blind 227, poses 1 and 2: "roofs crowd or touch"). The map is built with the sites (as --built
// builds it without), and a house nearer than this to a building standing before it (a structure the map stands, a
// recorded light building, an earlier site) slides along its street, away, by the least that clears it (up to 3 m, its
// footprint moved with it) where the row's own checks still pass — where its street will not take it clear (the other
// stands round a corner), the earlier house slides along its own — and a house that cannot is left where it stood.
// Rebuilt and checked again, up to three rounds (a slid house's kit takes its variant from its new seat).
if (SITES_MODE && opt.clear) {
  const CLEAR = Number(opt.clear);
  const [vegetation, props, fleet, models, coll] = await Promise.all([import(`${T}/src/world/vegetation.ts`), import(`${T}/src/world/props.ts`),
    import(`${T}/src/vehicles/fleetFactory.ts`), import(`${T}/src/world/propsModelStore.ts`), import(`${T}/src/world/collision.ts`)]);
  await models.preloadPropModels();
  const LIGHT = new Set((P.townLightPlan ?? []).map((e) => e.kind));
  for (let round = 0; round < 3; round++) {
    const sites = rows.map((h) => ({ structure: h.structure, x: +h.x.toFixed(2), z: +h.z.toFixed(2), yawDeg: +(h.rot * 180 / Math.PI).toFixed(1), terrace: true }));
    const withSites = { ...config, props: { ...config.props, plannedSites: sites, plannedSitesAfterPlan: true } };
    const ids = withSites.props?.tankWrecks?.ids ?? []; if (ids.length) await fleet.ensureTankBuilders(ids);
    const engine = { anisotropy: 4, setupShadowMaterial() {} };
    const flora = vegetation.createVegetation(field, engine, 2001, withSites);
    const built = props.createProps(field, engine, 2002, withSites, flora).obstacles
      .filter((o) => o.kind === 'structure' || LIGHT.has(o.kind))
      .map((o) => {
        const cells = [];
        for (let x = o.min[0]; x <= o.max[0]; x += 0.4) for (let z = o.min[2]; z <= o.max[2]; z += 0.4) if (coll.collisionFootprintContainsPoint(o, x, z, 0)) cells.push([x, z]);
        return { o, cells, cx: (o.min[0] + o.max[0]) / 2, cz: (o.min[2] + o.max[2]) / 2 };
      });
    // each site's own building: the structure nearest its site (within 2.5 m)
    const own = rows.map((h) => built.reduce((best, b) => (b.o.kind === 'structure' && Math.hypot(b.cx - h.x, b.cz - h.z) < (best ? Math.hypot(best.cx - h.x, best.cz - h.z) : 2.5) ? b : best), null));
    const gapOf = (a, b) => {
      if (a.o.min[0] > b.o.max[0] + CLEAR || b.o.min[0] > a.o.max[0] + CLEAR || a.o.min[2] > b.o.max[2] + CLEAR || b.o.min[2] > a.o.max[2] + CLEAR) return Infinity;
      let g = Infinity;
      for (const p of a.cells) for (const q of b.cells) g = Math.min(g, Math.hypot(p[0] - q[0], p[1] - q[1]));
      return g;
    };
    // (a yard's shed is planned round the houses after them: not a building standing before)
    const isShed = (b) => !own.includes(b) && b.o.max[0] - b.o.min[0] <= 6.5 && b.o.max[2] - b.o.min[2] <= 6.5;
    /** Slide row k along its street, away from `from`, by the least (0.25 m steps, up to 3 m) that leaves it CLEAR of
     *  every building of `standing` (its footprint moved with it) where the row's own checks pass. */
    const slide = (k, standing, from) => {
      const mine = own[k], h = rows[k];
      const gapAt = (dx, dz) => {
        const slid = { o: { min: [mine.o.min[0] + dx, 0, mine.o.min[2] + dz], max: [mine.o.max[0] + dx, 0, mine.o.max[2] + dz] },
          cells: mine.cells.map(([x, z]) => [x + dx, z + dz]) };
        return standing.reduce((g, b) => Math.min(g, gapOf(slid, b)), Infinity);
      };
      const [, , tx, tz] = h.at(h.s + h.w / 2);
      const away = Math.sign((mine.cx - from.cx) * tx + (mine.cz - from.cz) * tz) || 1;
      const self = rows.splice(k, 1)[0];
      let got = null;
      for (let step = 0.25; step <= 3 && !got; step += 0.25) {
        if (gapAt(tx * away * step, tz * away * step) < CLEAR) continue;
        const r = tryHouse(self.road, self.side, self.s + away * step, self.w, self.d, self.at);
        if (typeof r !== 'string') got = { ...r, s: self.s + away * step };
      }
      rows.splice(k, 0, got ? { ...self, ...got } : self);
      return !!got;
    };
    let moved = 0;
    for (const [k] of rows.entries()) {
      const mine = own[k];
      if (!mine) continue;
      // the buildings standing before it: every one but the later sites' and the yards' sheds
      const later = new Set(own.slice(k + 1).filter(Boolean));
      const standing = built.filter((b) => b !== mine && !later.has(b) && !isShed(b));
      const close = standing.filter((b) => gapOf(mine, b) < CLEAR);
      if (!close.length) continue;
      const worst = close.reduce((w, b) => (gapOf(mine, b) < gapOf(mine, w) ? b : w));
      if (slide(k, standing, worst)) { moved++; note('clear-moved'); continue; }
      // where its street will not take it clear (the other house stands off its street's line, round a corner), the
      // earlier house of the plan slides along its own, clear of every building but the yards' sheds
      const m = own.indexOf(worst);
      if (m >= 0 && m < k && slide(m, built.filter((b) => b !== worst && !isShed(b)), mine)) { moved++; note('clear-moved'); }
    }
    console.error(`--clear round ${round}: ${moved} houses slid along their streets`);
    if (!moved) break;
  }
}

// ---- out
if (SITES.length) {
  // (terrace: each site builds from a stream of its own — props.ts draws a terrace site's builder from seed + its index,
  // not the props stream — and is seated without the roadside clearance test, the plan's own checks standing for it: a
  // site on the props stream moves every later draw, the clutter with it, and the yards round the plan's houses turn)
  const siteLines = rows.map((h) => `  { structure: '${h.structure}', x: ${h.x.toFixed(2)}, z: ${h.z.toFixed(2)}, yawDeg: ${(h.rot * 180 / Math.PI).toFixed(1)}, terrace: true },`);
  const flags = process.argv.slice(3).filter((a) => /^--(keep|seed|lanes|laneClear|sites|gap|setback|built|yards|clear)/.test(a)).join(' ');
  writeFileSync(outPath, `// Generated by tools/plan-street-rows.mjs ${mapId} ${flags} (the maps lane, the Verdant process): ${rows.length} houses
// along the village's streets at one building line (setback ${SETBACK} m), each turned to its street (props.plannedSites).
// Regenerate with the tool; do not edit by hand.
export const ${exportName} = [
${siteLines.join('\n')}
] as const;
`);
  console.log(JSON.stringify({ sites: rows.length, rejected: why, kinds: rows.reduce((a, h) => ({ ...a, [h.structure]: (a[h.structure] ?? 0) + 1 }), {}) }));
  process.exit(0);
}
const lines = rows.map((h) => `  { x: ${h.x.toFixed(3)}, z: ${h.z.toFixed(3)}, rot: ${h.rot.toFixed(5)}, w: ${h.w.toFixed(2)}, d: ${h.d.toFixed(2)}, ruined: ${h.ruined}, wall: '${h.wall}', rng: ${h.rng} },`);
const cmd = process.argv.slice(3).filter((a) => /^--(keep|seed|lanes|laneClear)/.test(a)).join(' ');
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
