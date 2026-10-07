// gromace.selftest — the karst fields' clearance heaps (the scenery lane, b33; gauntlet on b23's first form: "a dome
// with dice on it"; the coordinator: "clearance heaps of loose angular limestone, stone surfaces with no smooth core, at
// a talus angle, broad heaps and field-edge ridges where the karst cover is thin ... off roads and zone discs"). Pinned:
//   1. the form (sceneryRocks.ts gromaca): a heap and a ridge each one convex mass of their own size and height, within
//      their triangle budgets (a phone's fewer); seen from above its stones cover it — the dark core under them shows
//      only between them;
//   2. Saltwind (scenery.ts composeGromace, the map's areas): most of what the areas ask for stands, every one inside a
//      field, in its area, off the roads by its reach and more, off the spawn pads and the objective zones, clear of
//      each other; a static collider each, their stone one mesh on the rock material.
import assert from 'node:assert/strict';
import { buildRockFormation } from './sceneryRocks.ts';
import { GROMACE } from './scenery.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ---------------------------------------------------------------------------------------------- 1. the form
{
  const noise = new SimplexNoise({ random: mulberry32(4242) });
  const ground = { getHeightAt: (x, z) => 0.02 * x + Math.sin(z * 0.11) * 0.2 };
  const cases = [
    { name: 'heap', spec: { form: 'gromaca', geology: 'limestone', x: 3, z: -2, radius: 2.8, height: 1.3, yawDeg: 20 }, budget: 1700 },
    { name: 'ridge', spec: { form: 'gromaca', geology: 'limestone', x: -4, z: 5, radius: 2.2, height: 1.2, yawDeg: 30, length: 12 }, budget: 2800 },
  ];
  for (const { name, spec, budget } of cases) {
    const b = buildRockFormation(spec, ground, noise, mulberry32(7), {});
    const phone = buildRockFormation(spec, ground, noise, mulberry32(7), { mobile: true });
    assert.ok(b.geometry && b.masses.length === 1, `${name}: one mass`);
    assert.ok(b.triangles <= budget && phone.triangles < b.triangles, `${name}: within its budget (${b.triangles} of ${budget}; a phone ${phone.triangles})`);
    const a = spec.yawDeg * Math.PI / 180, ux = Math.cos(a), uz = Math.sin(a);
    const pts = b.masses[0].points;
    let along = 0, across = 0;
    for (let i = 0; i < pts.length; i += 2) {
      const dx = pts[i] - spec.x, dz = pts[i + 1] - spec.z;
      along = Math.max(along, Math.abs(dx * ux + dz * uz)); across = Math.max(across, Math.abs(-dx * uz + dz * ux));
    }
    const wantAlong = spec.length ? spec.length / 2 : spec.radius;
    assert.ok(along > wantAlong * 0.8 && along < wantAlong * 1.2 && across > spec.radius * 0.8 && across < spec.radius * 1.25,
      `${name}: its mass its own size (${along.toFixed(2)} along, ${across.toFixed(2)} across)`);
    const rise = b.masses[0].y1 - ground.getHeightAt(spec.x, spec.z);
    assert.ok(rise > spec.height * 0.9 && rise < spec.height * 1.45, `${name}: its own height (${rise.toFixed(2)} m)`);
    // from above: the highest face over each point of its inner footprint is a stone's, not the core's (the core is
    // the formation's first piece: its lattice of 0.8 m cells comes first in the merged geometry)
    const half = Math.max(0, (spec.length ?? 0) / 2 - spec.radius);
    const nu = Math.max(3, Math.ceil(((half + spec.radius) * 2) / 0.8)), nv = Math.max(3, Math.ceil((spec.radius * 2) / 0.8));
    const coreTris = nu * nv * 2, p = b.geometry.attributes.position, tris = p.count / 3;
    let stone = 0, total = 0;
    for (let gu = -half - spec.radius; gu <= half + spec.radius; gu += 0.23) {
      for (let gv = -spec.radius; gv <= spec.radius; gv += 0.23) {
        if (Math.hypot(Math.max(Math.abs(gu) - half, 0), gv) > spec.radius * 0.85) continue;
        const x = spec.x + gu * ux - gv * uz, z = spec.z + gu * uz + gv * ux;
        let top = -Infinity, topCore = false;
        for (let t = 0; t < tris; t++) {
          const i = t * 3, ax = p.getX(i), az = p.getZ(i), bx = p.getX(i + 1), bz = p.getZ(i + 1), cx = p.getX(i + 2), cz = p.getZ(i + 2);
          const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
          if (Math.abs(d) < 1e-12) continue;
          const w0 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, w1 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w2 = 1 - w0 - w1;
          if (w0 < 0 || w1 < 0 || w2 < 0) continue;
          const y = w0 * p.getY(i) + w1 * p.getY(i + 1) + w2 * p.getY(i + 2);
          if (y > top) { top = y; topCore = t < coreTris; }
        }
        total++;
        if (!topCore) stone++;
      }
    }
    assert.ok(stone / total > 0.8, `${name}: its stones cover it, the core only between them (${(stone / total * 100).toFixed(0)} % stone from above)`);
  }
}

// ---------------------------------------------------------------------------------------------- 2. Saltwind
{
  installWorldBuildFixture();
  const root = new URL('../../', import.meta.url).href;
  const [mapsMod, terrain, vegetation, props, fleet, models] = await Promise.all([
    import(root + 'src/world/maps/index.ts'), import(root + 'src/world/terrain.ts'), import(root + 'src/world/vegetation.ts'),
    import(root + 'src/world/props.ts'), import(root + 'src/vehicles/fleetFactory.ts'), import(root + 'src/world/propsModelStore.ts'),
  ]);
  const { MATCH_OBJECTIVE_LAYOUTS } = await import(root + 'src/sim/matchObjectiveLayouts.ts');
  await models.preloadPropModels();
  const config = mapsMod.getMapConfig('saltwind');
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const hf = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(hf, engine, 2001, config);
  const dressing = props.createProps(hf, engine, 2002, config, flora);
  const r = dressing.group.userData.scenery?.gromace;
  const areas = config.scenery.gromace;
  assert.ok(r && r.wanted === areas.reduce((n, a) => n + a.heaps + a.ridges, 0), 'the areas\' asks counted');
  assert.ok(r.heaps + r.ridges >= r.wanted * 0.8 && r.ridges >= 8 && r.heaps >= 10, `most of them stand (${r.heaps} heaps, ${r.ridges} ridges of ${r.wanted})`);
  assert.equal(r.colliders, r.sites.length, 'a static collider each');
  const mesh = dressing.group.getObjectByName('props-scenery-gromace');
  assert.ok(mesh && mesh.geometry.attributes.position.count / 3 === r.triangles && r.triangles <= 40000, `their stone one mesh (${r.triangles} triangles)`);
  const spawns = [config.layout?.spawns?.player, ...(config.layout?.spawns?.enemies ?? [])].filter(Boolean);
  const zones = MATCH_OBJECTIVE_LAYOUTS.saltwind?.zones ?? [];
  const field = {};
  for (const [i, s] of r.sites.entries()) {
    assert.ok(hf._roadDist(s.x, s.z) >= GROMACE.roadM + s.r - 1e-6, `${i}: off the roads by its reach and more (${hf._roadDist(s.x, s.z).toFixed(1)} m)`);
    hf._landUseAt(s.x, s.z, field);
    assert.ok(field.active > 0.5 && !field.track && !field.hedge, `${i}: inside a field`);
    assert.ok(areas.some((a) => Math.hypot(s.x - a.x, s.z - a.z) <= a.radius + 1e-6), `${i}: in its area`);
    for (const sp of spawns) assert.ok(Math.hypot(s.x - sp.x, s.z - sp.z) >= 22 + s.r, `${i}: off the spawn pads`);
    for (const zone of zones) assert.ok(Math.hypot(s.x - zone.x, s.z - zone.z) >= 33 + s.r, `${i}: off the objective zones`);
    for (const t of r.sites.slice(i + 1)) assert.ok(Math.hypot(s.x - t.x, s.z - t.z) >= s.r + t.r + GROMACE.gapM - 1e-6, `${i}: clear of the others`);
  }
}

console.log('gromace.selftest: a heap and a ridge each one mass of their size, within budget, their stones covering them from above; Saltwind\'s in fields, in their areas, off the roads, pads and zones, clear of each other, a collider each, one mesh');
