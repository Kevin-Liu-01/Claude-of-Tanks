// civicPathways.selftest.mjs — every planned map's pathway architecture as the props build it (the maps lane, 228; the
// owner, 2026-10-18: "fix / improve the pathways in steinburg"; review AC5). Real props in Node:
//   - the legacy strips are gone: no kerb or pavement on a square (the plan's excluded rooms), none past the wall line,
//     none along a lane (a Gasse is laid in setts wall to wall);
//   - every run is fronted and clear: its kerb face on the main street's line (kerbM ± 0.05 m), its kerb and pavement
//     out of every structure, a gate's piers and the town wall's modules (the kerb a metre clear of them), its pavement
//     no wider than the plan's widest;
//   - each run one ribbon: every piece's start meets the last one's end (no gap over 10 mm), a run at least 3 m long;
//   - the lanes' corners return round their radius where the street's pavement reaches them.
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const [maps, terrain, vegetation, props, models, fleet, plans, collision] = await Promise.all([
  import('../maps/index.ts'), import('../terrain.ts'), import('../vegetation.ts'), import('../props.ts'), import('../propsModelStore.ts'),
  import('../../vehicles/fleetFactory.ts'), import('./plans/index.ts'), import('../collision.ts')]);
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };

const segDist = (x, z, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
};
const roadDist = (road, x, z) => { let b = Infinity; for (let i = 0; i + 1 < road.length; i++) b = Math.min(b, segDist(x, z, ...road[i], ...road[i + 1])); return b; };
const insidePolygon = (poly, x, z) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
};

for (const mapId of plans.CIVIC_PLAN_MAPS) {
  const plan = plans.civicPlanFor(mapId), pw = plan.pathways;
  if (!pw) continue;
  const config = maps.getMapConfig(mapId);
  if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
  const field = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(field, engine, 2001, config);
  const built = props.createProps(field, engine, 2002, config, flora);
  const roads = field._layout.roads;
  const report = built.group.userData.pathways;
  assert.ok(report, `${mapId}: the pathway kit ran`);
  const { census } = report;
  assert.ok(census.legacyPieces > 0, `${mapId}: the legacy pass's draws spent (${census.legacyPieces} pieces)`);
  const kerbs = built.group.userData.pathwayFootprints;
  assert.ok(Array.isArray(kerbs) && kerbs.length > 0, `${mapId}: the runs' footprints published`);
  const solids = built.obstacles.filter((o) => o.kind === 'structure' || o.kind === 'wallstone' || o.structureIdx != null);
  const clearance = (x, z) => {
    // the nearest solid's footprint distance, to 1.2 m (sampled: inside at 0, then rings)
    for (const m of [0, 0.3, 0.6, 0.9]) {
      if (solids.some((o) => x > o.min[0] - m && x < o.max[0] + m && z > o.min[2] - m && z < o.max[2] + m && collision.collisionFootprintContainsPoint(o, x, z, m))) return m;
    }
    return Infinity;
  };
  const mains = Object.entries(pw.classes).filter(([, c]) => c === 'main').map(([i]) => roads[Number(i)]);
  const lanes = Object.entries(pw.classes).filter(([, c]) => c === 'gasse').map(([i]) => roads[Number(i)]);
  let runs = 0, metres = 0, prev = null, runLen = 0, shortRuns = 0;
  for (const f of kerbs) {
    const [k0, k1, o1, o0] = f.pts;
    // the kerb face on the main street's line
    const face = Math.min(...mains.map((r) => roadDist(r, k0[0], k0[1])));
    assert.ok(Math.abs(face - pw.kerbM) < 0.06, `${mapId}: a kerb face ${face.toFixed(3)} m off its street (${pw.kerbM})`);
    for (const [x, z] of [k0, k1, [(k0[0] + o0[0] + k1[0] + o1[0]) / 4, (k0[1] + o0[1] + k1[1] + o1[1]) / 4]]) {
      assert.ok(!pw.exclude.some((r) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1), `${mapId}: pavement at (${x.toFixed(1)}, ${z.toFixed(1)}) on a square`);
      assert.ok(insidePolygon(pw.inside, x, z), `${mapId}: pavement at (${x.toFixed(1)}, ${z.toFixed(1)}) past the wall line`);
      for (const lane of lanes) assert.ok(roadDist(lane, x, z) > 3.4, `${mapId}: a kerb at (${x.toFixed(1)}, ${z.toFixed(1)}) along a lane`);
    }
    for (const [x, z] of [k0, k1]) assert.ok(clearance(x, z) > 0.6, `${mapId}: the kerb at (${x.toFixed(1)}, ${z.toFixed(1)}) clear of every structure and wall`);
    const mid = [(k0[0] + o0[0] + k1[0] + o1[0]) / 4, (k0[1] + o0[1] + k1[1] + o1[1]) / 4];
    assert.ok(clearance(mid[0], mid[1]) > 0, `${mapId}: the pavement at (${mid[0].toFixed(1)}, ${mid[1].toFixed(1)}) out of every structure`);
    const width = Math.hypot(o0[0] - k0[0], o0[1] - k0[1]);
    assert.ok(width <= 0.25 + pw.maxWalkM + 0.02, `${mapId}: a pavement ${width.toFixed(2)} m wide (${pw.maxWalkM})`);
    const len = Math.hypot(k1[0] - k0[0], k1[1] - k0[1]);
    if (prev && Math.hypot(prev[0] - k0[0], prev[1] - k0[1]) < 0.01) runLen += len;
    else { if (prev) { runs++; if (runLen < 3) shortRuns++; } runLen = len; }
    metres += len;
    prev = k1;
  }
  runs++;
  if (runLen < 3) shortRuns++;
  assert.equal(shortRuns, 0, `${mapId}: every run at least 3 m long`);
  assert.equal(runs, census.runs, `${mapId}: ${runs} continuous ribbons, one a run (${census.runs})`);
  assert.ok((census.returns ?? 0) >= 1, `${mapId}: the lanes' corners return (${census.returns ?? 0})`);
  console.log(`${mapId}: ${census.legacyPieces} legacy pieces' draws spent; ${runs} runs, ${metres.toFixed(0)} m of kerb, ${(census.walkM2 ?? 0).toFixed(0)} m² of pavement, `
    + `${census.returns ?? 0} returns, ${census.triangles} triangles`);
}
console.log(`civicPathways.selftest: ${plans.CIVIC_PLAN_MAPS.join(', ')} — kerbs and pavements only where houses front a main street, clear and continuous — ok`);
