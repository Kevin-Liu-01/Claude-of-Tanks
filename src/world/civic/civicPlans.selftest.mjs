// civicPlans.selftest.mjs — the civic kit's plans and its generality (the maps lane, 228; the owner, 2026-10-19: one shared
// kit every map adopts through its plan). No world build: the plans' data against the kit's rules.
//   - the kit names no map: no 'urban' or 'steinburg' in src/world/civic/*.ts outside plans/ (review R10, AC14);
//   - every plan's style row exists; its rooms hold their beds, arms, paving, furniture and trees; nothing stands in the
//     roundel's hold disc or on an arm's prop-free carriageway (G1, G2);
//   - the tree stations stand 6.5 m apart and 9 m off every authored road centreline (G5);
//   - a fortified monument stands 2.75 m (its footprint) off every segment of its bot-planner cell (the 25 m lattice's
//     sides and diagonals) and 3.5 m off every node (G3);
//   - the overlay names only the settings the kit knows.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { CIVIC_PLAN_MAPS, civicPlanFor, inCivicRect } = await import('./plans/index.ts');
const { CIVIC_STYLES } = await import('./styles.ts');
const { CIVIC_RECORDS } = await import('./civicFurnitureKit.ts');
const { getMapConfig } = await import('../maps/index.ts');

// ---- the kit names no map
for (const file of readdirSync(here).filter((f) => f.endsWith('.ts'))) {
  const text = readFileSync(join(here, file), 'utf8');
  assert.ok(!/['"`]urban['"`]|steinburg/i.test(text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')),
    `civic/${file}: kit code names no map (a plan does)`);
}

const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const LATTICE = 25;

assert.ok(CIVIC_PLAN_MAPS.length >= 1, 'at least the pilot map has a plan');
for (const mapId of CIVIC_PLAN_MAPS) {
  const plan = civicPlanFor(mapId), cfg = getMapConfig(mapId);
  assert.equal(plan.mapId, mapId, `${mapId}: the plan names its map`);
  assert.ok(CIVIC_STYLES[plan.style], `${mapId}: its style row '${plan.style}' exists`);
  assert.equal(plan.style, cfg.props?.architecture, `${mapId}: its style is its map's architecture`);
  const roads = cfg.terrain.roads.paths;
  for (const key of Object.keys(plan.overlay)) assert.ok(['plazaNest', 'hedgehogsAtApproaches', 'monumentKind'].includes(key), `${mapId}: overlay key ${key} is the kit's`);
  for (const area of plan.areas) {
    const tag = `${mapId}/${area.id}`, room = area.room;
    assert.ok(cfg.terrain.hardstands?.[area.pad], `${tag}: its pad ${area.pad} exists`);
    for (const bed of area.beds) {
      assert.ok(inCivicRect(room, bed.rect.x0, bed.rect.z0) && inCivicRect(room, bed.rect.x1, bed.rect.z1), `${tag}: bed ${bed.id} inside its room`);
      for (const arm of area.arms) {
        const overlap = Math.min(bed.rect.x1, arm.x1) - Math.max(bed.rect.x0, arm.x0) > 0 && Math.min(bed.rect.z1, arm.z1) - Math.max(bed.rect.z0, arm.z0) > 0;
        assert.ok(!overlap, `${tag}: bed ${bed.id} keeps off the arms`);
      }
    }
    const pieces = [...area.furniture, ...area.parking, ...area.lamps];
    const C = area.centre;
    for (const p of pieces) {
      assert.ok(inCivicRect(room, p.x, p.z, 12), `${tag}: ${p.kind} at (${p.x}, ${p.z}) by its room`);
      assert.ok(Math.hypot(p.x - C.x, p.z - C.z) > C.ringR[1] + 0.5, `${tag}: ${p.kind} at (${p.x}, ${p.z}) out of the roundel's hold disc`);
      // the arms' carriageways (their middle, the narrower of their half widths less 2 m) carry nothing
      for (const arm of area.arms) {
        const hx = (arm.x1 - arm.x0) / 2, hz = (arm.z1 - arm.z0) / 2, mx = (arm.x0 + arm.x1) / 2, mz = (arm.z0 + arm.z1) / 2;
        const across = hx < hz ? Math.abs(p.x - mx) : Math.abs(p.z - mz), half = Math.min(hx, hz);
        if (inCivicRect(arm, p.x, p.z)) assert.ok(across > half - 0.2, `${tag}: ${p.kind} at (${p.x}, ${p.z}) on an arm's carriageway`);
      }
    }
    // the ring lanes round the green (C12): inside the room, their width, and no piece or tree station planned in them (a
    // lamp or a bollard on a long edge's kerb line aside)
    for (const lane of area.lanes) {
      const r = lane.rect, across = Math.min(r.x1 - r.x0, r.z1 - r.z0), alongX = r.x1 - r.x0 >= r.z1 - r.z0;
      assert.ok(across >= lane.minWidth - 1e-9, `${tag}: lane ${lane.id} ${across.toFixed(2)} m across (${lane.minWidth})`);
      assert.ok(inCivicRect(room, r.x0, r.z0, 0.01) && inCivicRect(room, r.x1, r.z1, 0.01), `${tag}: lane ${lane.id} inside its room`);
      const edge = (x, z) => (alongX ? Math.min(z - r.z0, r.z1 - z) : Math.min(x - r.x0, r.x1 - x)) < 0.6;
      for (const p of pieces) {
        if (!inCivicRect(r, p.x, p.z)) continue;
        assert.ok((p.kind === 'lamp' || p.kind === 'poller') && edge(p.x, p.z), `${tag}: ${p.kind} at (${p.x}, ${p.z}) in lane ${lane.id}`);
      }
      for (const t of area.trees.stations) assert.ok(!inCivicRect(r, t.x, t.z, 0.6), `${tag}: a tree at (${t.x}, ${t.z}) in lane ${lane.id}`);
      for (const bed of area.beds) {
        const b = bed.rect, overlap = Math.min(b.x1, r.x1) - Math.max(b.x0, r.x0) > 0.01 && Math.min(b.z1, r.z1) - Math.max(b.z0, r.z0) > 0.01;
        assert.ok(!overlap, `${tag}: bed ${bed.id} keeps off lane ${lane.id}`);
      }
    }
    // the objective holds past the roundel (C13): no piece or tree station planned in their discs
    for (const h of area.holds) {
      for (const p of pieces) assert.ok(Math.hypot(p.x - h.x, p.z - h.z) >= h.r + 0.3, `${tag}: ${p.kind} at (${p.x}, ${p.z}) in the ${h.id} disc`);
      for (const t of area.trees.stations) assert.ok(Math.hypot(t.x - h.x, t.z - h.z) >= h.r + 0.6, `${tag}: a tree at (${t.x}, ${t.z}) in the ${h.id} disc`);
    }
    // the trees: 6.5 m apart, 9 m off every authored road
    const st = area.trees.stations;
    for (let i = 0; i < st.length; i++) {
      for (let j = i + 1; j < st.length; j++) assert.ok(Math.hypot(st[i].x - st[j].x, st[i].z - st[j].z) >= 6.5, `${tag}: trees ${i} and ${j} 6.5 m apart`);
      let road = Infinity;
      for (const path of roads) for (let k = 0; k + 1 < path.length; k++) road = Math.min(road, segDist(st[i].x, st[i].z, ...path[k], ...path[k + 1]));
      assert.ok(road >= 9, `${tag}: tree ${i} at (${st[i].x}, ${st[i].z}) ${road.toFixed(1)} m off a road (9)`);
    }
    // the monument: off its planner cell's six segments and its nodes
    if (area.monument) {
      const mo = area.monument, rec = CIVIC_RECORDS[mo.kind];
      assert.ok(rec, `${tag}: the monument's kind ${mo.kind} is the kit's`);
      const x0 = Math.floor(mo.x / LATTICE) * LATTICE, z0 = Math.floor(mo.z / LATTICE) * LATTICE, x1 = x0 + LATTICE, z1 = z0 + LATTICE;
      const segs = [[x0, z0, x1, z0], [x1, z0, x1, z1], [x1, z1, x0, z1], [x0, z1, x0, z0], [x0, z0, x1, z1], [x1, z0, x0, z1]];
      const clear = Math.min(...segs.map((s) => segDist(mo.x, mo.z, ...s)));
      assert.ok(clear >= 2.75 + rec.collisionR, `${tag}: the monument ${clear.toFixed(2)} m off its cell's lattice segments (${(2.75 + rec.collisionR).toFixed(2)})`);
      for (const [nx, nz] of [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]) assert.ok(Math.hypot(mo.x - nx, mo.z - nz) >= 3.5 + rec.collisionR, `${tag}: the monument off node (${nx}, ${nz})`);
      assert.ok(Math.hypot(mo.x - C.x, mo.z - C.z) > 9, `${tag}: the monument out of the hold disc`);
    }
  }
  if (plan.pathways) {
    const pw = plan.pathways;
    assert.ok(pw.frontage[0] < pw.frontage[1] && pw.kerbM > 2 && pw.returnR > 0 && pw.maxWalkM > 0, `${mapId}: pathway numbers`);
    for (const [i, cls] of Object.entries(pw.classes)) assert.ok(roads[Number(i)], `${mapId}: pathway class for road ${i} names a road (${cls})`);
    assert.ok(pw.inside.length >= 3, `${mapId}: the town's inside is a polygon`);
  }
}
console.log(`civicPlans.selftest: ${CIVIC_PLAN_MAPS.length} plan(s) (${CIVIC_PLAN_MAPS.join(', ')}) hold the kit's rules; the kit names no map — ok`);
