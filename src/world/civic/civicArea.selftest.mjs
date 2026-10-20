// civicArea.selftest.mjs — every planned map's civic areas as the props build them (the maps lane, 228; the owner,
// 2026-10-18: "completely fill in this steinburg center"; review AC1-AC4, AC12, G1, G2, G5-G7). Real props in Node, twice:
// with the plan and without it (globalThis.__cotCivicOff), so the plan's build is held to the map's own:
//   - stream neutrality (G7): the props' main and destruction streams draw exactly as on the map without the plan; the
//     records outside the plan's rooms stand where they stood (the parked vehicles and carts aside: the kerbs' seats);
//   - the fill (AC1): no paved stretch of the room left blank (cells over 4 m from anything, the arms and the roundel aside),
//     the records it holds; the airfield dressing off its pad;
//   - the green (AC2): its trees all planted, 6.5 m apart; its benches;
//   - the monument (AC3): one, at its seat, fortified; no walked monument;
//   - the parked vehicles (AC4): at their seats, none moved by the separation pass;
//   - the lanes (G1, G2, C12, C13): nothing in the roundel's hold disc, nothing on the arms' carriageways; the arms as
//     the built square measures them at least the narrowest street feeding the square across (12.25 m), the ring lanes
//     round the green their width (9 m: two hulls abreast) free of every piece and trunk; a 6 m pivot disc clear of
//     every piece at each of the square's mouths;
//   - the lamps (AC12, G6): the map's count does not fall, a dozen round the crossing, none in a structure;
//   - every piece seated on the ground and out of every structure.
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const [maps, terrain, vegetation, props, models, fleet, plans, collision, dressing] = await Promise.all([
  import('../maps/index.ts'), import('../terrain.ts'), import('../vegetation.ts'), import('../props.ts'), import('../propsModelStore.ts'),
  import('../../vehicles/fleetFactory.ts'), import('./plans/index.ts'), import('../collision.ts'), import('../hardstandDressing.ts')]);
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };

async function build(mapId, off) {
  globalThis.__cotCivicOff = off;
  try {
    const config = maps.getMapConfig(mapId);
    if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
    const field = terrain.createHeightField(1337, config);
    const flora = vegetation.createVegetation(field, engine, 2001, config);
    return { config, field, flora, built: props.createProps(field, engine, 2002, config, flora) };
  } finally { globalThis.__cotCivicOff = false; }
}
const inRect = (r, x, z, m = 0) => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;
const VEHICLES = new Set(['sedan', 'wagon', 'pickup', 'van', 'jeep', 'truck', 'truckbox', 'truckflatbed', 'handcart', 'haycart', 'sled']);

// (COT_CIVIC_MAPS=a,b runs those plans only: a lane's own iteration; the gate runs every plan)
const ONLY = process.env.COT_CIVIC_MAPS ? new Set(process.env.COT_CIVIC_MAPS.split(',')) : null;
for (const mapId of plans.CIVIC_PLAN_MAPS.filter((m) => !ONLY || ONLY.has(m))) {
  const plan = plans.civicPlanFor(mapId);
  const base = await build(mapId, true), civic = await build(mapId, false);
  const { built, flora, field, config } = civic;
  // (229 b3) a room may turn about its centre (plans.inCivicRoom)
  const inAnyRoom = (x, z) => plan.areas.some((a) => plans.inCivicRoom(a, x, z, 0.5));

  // ---- stream neutrality
  assert.deepEqual(built.group.userData.streamDraws, base.built.group.userData.streamDraws, `${mapId}: the props' streams draw as on the map without the plan`);
  const key = (d) => `${d.kind}@${d.x.toFixed(1)},${d.z.toFixed(1)}`;
  const seats = plan.areas.flatMap((a) => [...a.furniture, ...a.parking, ...a.lamps]);
  const ownSeat = (d) => seats.some((p) => p.kind === d.kind && Math.hypot(p.x - d.x, p.z - d.z) < 0.05);
  // (229 b3) the map's walked monument, when the plan seats it in its area (overlay.monumentKind), moves from wherever the
  // walk left it (Amberford's market cross at the edge of town)
  const walkedMoves = plan.areas.some((a) => a.monument) && plan.overlay.monumentKind === 'monument';
  const outside = (b) => new Set(b.destructibles.filter((d) => d.slot >= 0 && !inAnyRoom(d.x, d.z) && !VEHICLES.has(d.kind) && d.kind !== 'hedgehog'
    && !ownSeat(d) && !(walkedMoves && d.kind === 'monument')).map(key));
  const before = outside(base.built), after = outside(built);
  // (228 r2: the pieces the plan clears from round its room — pinned by kind and rectangle in the plan — the only others)
  const clears = plan.areas.flatMap((a) => a.clears);
  for (const d of base.built.destructibles) {
    if (d.slot >= 0 && clears.some((c) => c.kinds.includes(d.kind) && inRect(c.rect, d.x, d.z))) before.delete(key(d));
  }
  for (const d of built.destructibles) {
    if (d.slot >= 0) assert.ok(!clears.some((c) => c.kinds.includes(d.kind) && inRect(c.rect, d.x, d.z)), `${mapId}: a cleared ${d.kind} stands at (${d.x.toFixed(1)}, ${d.z.toFixed(1)})`);
  }
  // (the lamp-seat snap: a lamp stood in a structure moves off it — its old seat and its new the only lamps to differ)
  for (const m of built.group.userData.lampSnap ?? []) if (m.from) {
    before.delete(`lamp@${m.from[0].toFixed(1)},${m.from[1].toFixed(1)}`);
    after.delete(`lamp@${m.to[0].toFixed(1)},${m.to[1].toFixed(1)}`);
  }
  const lost = [...before].filter((k) => !after.has(k)), gained = [...after].filter((k) => !before.has(k));
  assert.deepEqual([lost, gained], [[], []], `${mapId}: every record outside the rooms stands where it stood`);

  const structures = built.obstacles.filter((o) => o.kind === 'structure' || o.structureIdx != null);
  const inStructure = (x, z, m) => structures.some((o) => x > o.min[0] - m && x < o.max[0] + m && z > o.min[2] - m && z < o.max[2] + m
    && collision.collisionFootprintContainsPoint(o, x, z, m));
  for (const area of plan.areas) {
    const tag = `${mapId}/${area.id}`, room = area.room, C = area.centre;
    const inRoom = (x, z, m = 0) => plans.inCivicRoom(area, x, z, m);
    // the room's own axes (turned by roomYawDeg about its centre) and its world bounds
    const ryaw = ((area.roomYawDeg ?? 0) * Math.PI) / 180, rc = Math.cos(ryaw), rs = Math.sin(ryaw);
    const rcx = (room.x0 + room.x1) / 2, rcz = (room.z0 + room.z1) / 2, rhx = (room.x1 - room.x0) / 2, rhz = (room.z1 - room.z0) / 2;
    const roomAt = (u, v) => [rcx + u * rc + v * rs, rcz - u * rs + v * rc];
    const corners = [roomAt(-rhx, -rhz), roomAt(rhx, -rhz), roomAt(rhx, rhz), roomAt(-rhx, rhz)];
    const bounds = { x0: Math.min(...corners.map((q) => q[0])), x1: Math.max(...corners.map((q) => q[0])),
      z0: Math.min(...corners.map((q) => q[1])), z1: Math.max(...corners.map((q) => q[1])) };
    // the room's records, and the area's own pieces wherever they stand by it
    const areaSeats = [...area.furniture, ...area.parking, ...area.lamps];
    const records = built.destructibles.filter((d) => d.slot >= 0 && (inRoom(d.x, d.z)
      || areaSeats.some((p) => p.kind === d.kind && Math.hypot(p.x - d.x, p.z - d.z) < 0.05)));
    const trees = flora._trees.filter((t) => inRoom(t.x, t.z, 25));
    // ---- the pieces at their seats, on the ground, out of the structures
    const seats = [...area.furniture, ...area.parking, ...area.lamps];
    for (const p of seats) {
      const rec = built.destructibles.find((d) => d.kind === p.kind && d.slot >= 0 && Math.hypot(d.x - p.x, d.z - p.z) < 0.05);
      assert.ok(rec, `${tag}: ${p.kind} at its seat (${p.x}, ${p.z})`);
      assert.ok(Math.abs(rec.y - field.getHeightAt(p.x, p.z)) < 0.35, `${tag}: ${p.kind} at (${p.x}, ${p.z}) seated on the ground`);
      assert.ok(!inStructure(p.x, p.z, 0.1), `${tag}: ${p.kind} at (${p.x}, ${p.z}) out of every structure`);
    }
    const moved = built.group.userData.parkedVehicleSeparation?.moved ?? [];
    for (const v of area.parking) assert.ok(!moved.some((m) => Math.hypot(m.from[0] - v.x, m.from[1] - v.z) < 0.1), `${tag}: ${v.kind} at (${v.x}, ${v.z}) not moved by the separation pass`);
    // ---- the monument
    if (area.monument) {
      const cols = built.destructibles.filter((d) => d.kind === area.monument.kind && d.slot >= 0);
      assert.equal(cols.length, 1, `${tag}: one ${area.monument.kind}`);
      assert.ok(Math.hypot(cols[0].x - area.monument.x, cols[0].z - area.monument.z) < 0.05, `${tag}: the monument at its seat`);
      // (a kit monument is fortified cover; a map's own walked monument moved to the seat keeps its own class)
      if (area.monument.kind !== 'monument') {
        assert.ok(collision.isFortifiedCoverKind(cols[0].ob.kind) && cols[0].ob.crushMin >= 999, `${tag}: the monument is fortified`);
        assert.ok(!collision.hullYieldingRecord(cols[0].ob), `${tag}: the bots steer round the monument`);
      }
      if (area.monument.kind !== 'monument') assert.equal(built.destructibles.filter((d) => d.kind === 'monument' && d.slot >= 0).length, 0, `${tag}: no walked monument`);
      // G3: the planner's grid with the monument is the grid without it (no edge closed, no bend added)
      const { createBotNavigationGrid } = await import('../../sim/botRoutePlanner.ts');
      const navOf = (obstacles) => createBotNavigationGrid({ heightField: field, queryObstacles: null, getObstacles: () => obstacles });
      const withIt = navOf(built.obstacles), without = navOf(built.obstacles.filter((o) => o !== cols[0].ob));
      assert.deepEqual([...withIt.hullBlockedEdges], [...without.hullBlockedEdges], `${tag}: the monument closes no planner edge`);
      const bendsOf = (nav) => Array.from(nav.hullBends ?? [], (v) => (Number.isNaN(v) ? 0 : 1)).join('');
      assert.equal(bendsOf(withIt), bendsOf(without), `${tag}: the monument adds no bend to the planner's lattice`);
    }
    // ---- the hold disc and the arms' carriageways (the monument is fortified, a solid the lanes keep off)
    for (const d of records) {
      assert.ok(Math.hypot(d.x - C.x, d.z - C.z) > C.ringR[1], `${tag}: ${d.kind} at (${d.x.toFixed(1)}, ${d.z.toFixed(1)}) in the hold disc`);
      for (const arm of area.arms) {
        const hx = (arm.x1 - arm.x0) / 2, hz = (arm.z1 - arm.z0) / 2, half = Math.min(hx, hz);
        const across = hx < hz ? Math.abs(d.x - (arm.x0 + arm.x1) / 2) : Math.abs(d.z - (arm.z0 + arm.z1) / 2);
        if (inRect(arm, d.x, d.z) && d.kind !== 'lamp') assert.ok(across > half - 1.0, `${tag}: ${d.kind} at (${d.x.toFixed(1)}, ${d.z.toFixed(1)}) on an arm's carriageway`);
      }
    }
    for (const t of trees) assert.ok(Math.hypot(t.x - C.x, t.z - C.z) > C.ringR[1], `${tag}: a tree in the hold disc`);
    // ---- the green
    const census = flora.group.userData.civicTrees;
    assert.equal(census.planted, census.stations, `${tag}: every tree station planted (${JSON.stringify(census)})`);
    const civicTrees = flora._trees.filter((t) => area.trees.stations.some((s) => Math.hypot(s.x - t.x, s.z - t.z) < 0.01));
    assert.equal(civicTrees.length, area.trees.stations.length, `${tag}: the trees stand at their stations`);
    const benches = built.destructibles.filter((d) => d.kind === 'bench' && d.slot >= 0
      && area.furniture.some((f) => f.kind === 'bench' && Math.hypot(f.x - d.x, f.z - d.z) < 0.05)).length;
    const T = area.targets;
    assert.ok(benches >= T.benches, `${tag}: ${benches} benches (${T.benches})`);
    const lawn = area.lawns.reduce((a, r) => a + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    assert.ok(lawn >= T.lawnM2, `${tag}: ${lawn.toFixed(0)} m² of green (${T.lawnM2})`);
    // ---- the fill: room cells more than 4 m from anything (records, trees, beds, paving), the arms and the roundel aside
    // (the census's things: every collision record's footprint box by the room — the furniture, a light building poking
    // into a corner, a house's corner — and the trunks)
    const things = [...built.obstacles.filter((o) => o.min && o.max && o.max[0] > bounds.x0 - 5 && o.min[0] < bounds.x1 + 5 && o.max[2] > bounds.z0 - 5 && o.min[2] < bounds.z1 + 5)
      .map((o) => [o.min[0], o.max[0], o.min[2], o.max[2]]), ...trees.map((t) => [t.x - 0.6, t.x + 0.6, t.z - 0.6, t.z + 0.6]),
      // (229 b3) the trees' platforms
      ...(area.platforms ?? []).map((pf) => { const r = pf.half * 1.42; return [pf.x - r, pf.x + r, pf.z - r, pf.z + r]; })];
    let open = 0, cells = 0, largest = 0, largestAt = [0, 0];
    const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / l2)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };
    const inCorridor = (x, z, m = 0) => area.corridors.some((c) => segDist(x, z, c.from, c.to) <= c.half + m);
    // ---- the corridors (G2): no crushable on the bots' measured lanes across the area
    // (228 r4, the gameplay critic's D8: a centre test let a bench's, a stall's and a car's footprints into the corridors)
    // each record's collision footprint (its convex shape, else its box) kept off each corridor's band
    const footprintOf = (d) => {
      const o = d.ob;
      if (o?.shape2?.points?.length >= 6) { const p = o.shape2.points, out = []; for (let i = 0; i + 1 < p.length; i += 2) out.push([p[i], p[i + 1]]); return out; }
      if (o?.min && o?.max) return [[o.min[0], o.min[2]], [o.max[0], o.min[2]], [o.max[0], o.max[2]], [o.min[0], o.max[2]]];
      return [[d.x, d.z]];
    };
    const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const segsMeet = (a, b, c, e) => cross(a, b, c) * cross(a, b, e) < 0 && cross(c, e, a) * cross(c, e, b) < 0;
    const inPoly = (poly, x, z) => { let inside = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside; } return inside; };
    const polySegDist = (poly, a, b) => {
      if (poly.length === 1) return segDist(poly[0][0], poly[0][1], a, b);
      if (inPoly(poly, a[0], a[1]) || inPoly(poly, b[0], b[1])) return 0;
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length];
        if (segsMeet(p, q, a, b)) return 0;
        best = Math.min(best, segDist(p[0], p[1], a, b), segDist(a[0], a[1], p, q), segDist(b[0], b[1], p, q));
      }
      return best;
    };
    for (const d of records) {
      const fp = footprintOf(d);
      for (const c of area.corridors) {
        const gap = polySegDist(fp, c.from, c.to) - c.half;
        assert.ok(gap > 0, `${tag}: ${d.kind} at (${d.x.toFixed(1)}, ${d.z.toFixed(1)}) ${(-gap).toFixed(2)} m into the traffic corridor (${c.from}) -> (${c.to})`);
      }
    }
    for (const t of trees) assert.ok(!inCorridor(t.x, t.z, 0.5), `${tag}: a tree at (${t.x.toFixed(1)}, ${t.z.toFixed(1)}) on a traffic corridor`);
    // ---- the lanes (C12): each measured across at every half metre along it, the widest span no piece or trunk enters
    // (a lamp, a bollard or a railing module on a long edge's kerb line aside: they stand on the kerb, not in the lane)
    // (every collision record's footprint box — the houses, the light buildings, the furniture — and the trunks)
    const blockers = [...built.obstacles.filter((o) => o.min && o.max).map((o) => ({ x0: o.min[0], x1: o.max[0], z0: o.min[2], z1: o.max[2], kind: o.kind })),
      ...flora._trees.map((t) => ({ x0: t.x - 0.6, x1: t.x + 0.6, z0: t.z - 0.6, z1: t.z + 0.6, kind: 'tree' }))];
    const EDGE_KINDS = new Set(['lamp', 'poller', 'fenceiron']);
    const freeSpan = (r, alongX, at, edgeKinds) => {
      // the blocked intervals across the lane on the line at `at` along it
      const lo = alongX ? r.z0 : r.x0, hi = alongX ? r.z1 : r.x1, cuts = [];
      for (const b of blockers) {
        const a0 = alongX ? b.x0 : b.z0, a1 = alongX ? b.x1 : b.z1, c0 = alongX ? b.z0 : b.x0, c1 = alongX ? b.z1 : b.x1;
        if (at < a0 || at > a1 || c1 <= lo || c0 >= hi) continue;
        if (edgeKinds.has(b.kind) && Math.min(c1 - lo, hi - c0) < 0.6) continue;
        cuts.push([c0, c1]);
      }
      cuts.sort((a, b) => a[0] - b[0]);
      let best = 0, from = lo;
      for (const [a, b] of cuts) { best = Math.max(best, a - from); from = Math.max(from, b); }
      return Math.max(best, hi - from);
    };
    const laneWidth = (r, edgeKinds) => {
      const alongX = r.x1 - r.x0 >= r.z1 - r.z0, a0 = alongX ? r.x0 : r.z0, a1 = alongX ? r.x1 : r.z1;
      let min = Infinity;
      for (let at = a0 + 0.25; at < a1; at += 0.5) min = Math.min(min, freeSpan(r, alongX, at, edgeKinds));
      return min;
    };
    const widths = {};
    for (const arm of area.arms) {
      // an arm's carriageway as long as it crosses the room, its lamps on the frontage line aside
      const r = { x0: Math.max(arm.x0, room.x0), x1: Math.min(arm.x1, room.x1), z0: Math.max(arm.z0, room.z0), z1: Math.min(arm.z1, room.z1) };
      const w = laneWidth(r, new Set(['lamp']));
      widths[`arm ${(r.x1 - r.x0).toFixed(0)}x${(r.z1 - r.z0).toFixed(0)}`] = +w.toFixed(2);
      assert.ok(w >= 12.25, `${tag}: an arm ${w.toFixed(2)} m clear across (the narrowest street feeding the square, 12.25 m)`);
    }
    for (const lane of area.lanes) {
      const w = laneWidth(lane.rect, EDGE_KINDS);
      widths[lane.id] = +w.toFixed(2);
      assert.ok(w >= lane.minWidth - 0.01, `${tag}: lane ${lane.id} ${w.toFixed(2)} m clear across (${lane.minWidth})`);
    }
    // ---- the pivot discs (C13): 6 m round each of the square's mouths clear of every piece and trunk (the street's own
    // lamps on its frontage line aside)
    for (const [mx, mz] of plan.pathways?.mouths ?? []) {
      for (const b of blockers) {
        if (b.kind === 'lamp' || b.kind === 'structure') continue; // (the street's lamps; the frontage the mouth opens between)
        const d = Math.hypot(Math.max(b.x0 - mx, 0, mx - b.x1), Math.max(b.z0 - mz, 0, mz - b.z1));
        assert.ok(d >= 6, `${tag}: ${b.kind} at (${((b.x0 + b.x1) / 2).toFixed(1)}, ${((b.z0 + b.z1) / 2).toFixed(1)}) ${d.toFixed(2)} m from the mouth (${mx}, ${mz}) (a 6 m pivot disc)`);
      }
    }
    // ---- the objective holds past the roundel (C13): their discs clear of every piece and trunk
    // (228 r4) a street lamp standing in a hold on the map without the plan too (the town's own lamp at line-2's point) is
    // the map's, not the plan's (228 r5, the critic's D13: lamps only)
    const baseKey = (o) => `${o.kind}@${((o.min[0] + o.max[0]) / 2).toFixed(1)},${((o.min[2] + o.max[2]) / 2).toFixed(1)}`;
    const baseBlockers = new Set(base.built.obstacles.filter((o) => o.min && o.max).map(baseKey));
    for (const h of area.holds) {
      for (const b of blockers) {
        if (b.kind === 'structure') continue;
        if (b.kind === 'lamp' && baseBlockers.has(`${b.kind}@${((b.x0 + b.x1) / 2).toFixed(1)},${((b.z0 + b.z1) / 2).toFixed(1)}`)) continue;
        const d = Math.hypot(Math.max(b.x0 - h.x, 0, h.x - b.x1), Math.max(b.z0 - h.z, 0, h.z - b.z1));
        assert.ok(d >= h.r, `${tag}: ${b.kind} at (${((b.x0 + b.x1) / 2).toFixed(1)}, ${((b.z0 + b.z1) / 2).toFixed(1)}) in the ${h.id} disc (${d.toFixed(2)} m, ${h.r})`);
      }
    }
    const inLane = (x, z) => area.lanes.some((l) => inRect(l.rect, x, z)) || area.holds.some((h) => Math.hypot(x - h.x, z - h.z) < h.r);
    for (let u = -rhx + 0.5; u < rhx; u += 1) for (let v = -rhz + 0.5; v < rhz; v += 1) {
      const [x, z] = roomAt(u, v);
      let d = Infinity;
      for (const [x0, x1, z0, z1] of things) d = Math.min(d, Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)));
      // (229 b1 r1: a plaza's tiles laid wall to wall fill nothing — they are its floor)
      for (const r of [...area.beds.map((b) => b.rect), ...area.paving.filter((p) => p.kind !== 'tiles').map((p) => p.rect)]) {
        d = Math.min(d, Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1)));
      }
      // (229 b3) the strips of paving
      for (const st of area.strips ?? []) d = Math.min(d, Math.max(0, segDist(x, z, st.from, st.to) - st.width / 2));
      d = Math.min(d, rhx - Math.abs(u), rhz - Math.abs(v));
      if (area.arms.some((a) => inRect(a, x, z)) || Math.hypot(x - C.x, z - C.z) < C.ringR[1] + 2 || inCorridor(x, z) || inLane(x, z)) continue;
      if (d > largest) { largest = d; largestAt = [x, z]; }
      cells++;
      if (d > 4) open++;
    }
    const share = open / cells;
    // ---- the lamps: the map's count does not fall; a dozen round the crossing; none in a structure
    const lamps = built.destructibles.filter((d) => d.kind === 'lamp' && d.slot >= 0);
    const baseLamps = base.built.destructibles.filter((d) => d.kind === 'lamp' && d.slot >= 0).length;
    assert.ok(lamps.length >= baseLamps + area.lamps.length, `${tag}: lamps ${lamps.length} (the map's ${baseLamps} and the area's ${area.lamps.length})`);
    const roundCrossing = lamps.filter((l) => Math.hypot(l.x - C.x, l.z - C.z) <= 45).length;
    assert.ok(roundCrossing >= T.lampsAround, `${tag}: ${roundCrossing} lamps within 45 m of the crossing (${T.lampsAround})`);
    for (const l of lamps) assert.ok(!inStructure(l.x, l.z, 0.3), `${tag}: the lamp at (${l.x.toFixed(1)}, ${l.z.toFixed(1)}) out of every structure`);
    // ---- the pad's airfield dressing off
    if (area.pad >= 0) {
      const pad = config.terrain.hardstands[area.pad];
      const g = dressing.buildHardstandDressing([pad], config.splat, field, field._layout.roads, field._layout.village, 2002, new Set([0]));
      assert.equal(g, null, `${tag}: no lip, gully or patch on the square's pad`);
    }
    console.log(`${tag}: ${records.length} records in the room, ${civicTrees.length} trees, ${benches} benches, ${lamps.length} lamps (${roundCrossing} round the crossing), `
      + `open share ${(share * 100).toFixed(1)} %, largest free disc r ${largest.toFixed(1)} m, lanes ${JSON.stringify(widths)}, vetoed ${JSON.stringify(built.group.userData.civic?.vetoed ?? {})}`);
    // (live records: the props' destructibles and the trees' trunks)
    assert.ok(records.length + civicTrees.length >= T.records, `${tag}: ${records.length} records and ${civicTrees.length} trunks in the room (${T.records})`);
    assert.ok(share <= T.openShare, `${tag}: ${(share * 100).toFixed(1)} % of the room's paving more than 4 m from anything (off the arms, the roundel, the corridors and the lanes; ${(T.openShare * 100).toFixed(0)} %)`);
    assert.ok(largest <= T.largestDisc, `${tag}: the largest free disc ${largest.toFixed(1)} m at (${largestAt[0].toFixed(1)}, ${largestAt[1].toFixed(1)}) off the arms, the corridors and the lanes (${T.largestDisc})`);
  }
}
console.log(`civicArea.selftest: ${plans.CIVIC_PLAN_MAPS.join(', ')} — the areas filled, seated, lit and stream-neutral — ok`);
