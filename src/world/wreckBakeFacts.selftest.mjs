// Receipt for the wreck bake facts (wreck-bake-after-reveal-278; src/world/wreckBakeFacts.ts, src/world/deferredWrecks.ts).
// A browser build with a wreck worker places its hulks from the map's recorded facts and draws stand-ins until the hulks
// bake after the reveal. The battle must not be able to tell: this builds each map's props twice in Node, once baking
// every hulk in line (what the collision manifests are captured from) and once from the committed facts with nothing
// baked, and holds them equal — every obstacle and collider, every hulk's seat and record, every destructible and
// crushable placed after the hulks (the parked vehicles read the hulks' drawn footprints). Then it bakes the facts
// build's hulks as the swap does and holds the drawn wrecks equal too: the same vertices, the same triangle count. Two
// maps (Winter: 13 bakes; Verdant: 2), each built after the other as well as first (no module state between builds).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installWorldBuildFixture } from '../../tools/headlessWorldCollision.mjs';

installWorldBuildFixture();
const [{ getMapConfig }, { createHeightField }, { createVegetationAsync }, { createProps }, fleet, models, wrecks,
  { loadWreckBakeFacts }, { bakeDeferredWrecks }, { WRECK_BAKE_PLAN }] = await Promise.all([
  import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'),
  import('../vehicles/fleetFactory.ts'), import('./propsModelStore.ts'), import('./wrecks.ts'),
  import('./wreckBakeFacts.ts'), import('./deferredWrecks.ts'), import('./maps/wreckBakePlan.ts'),
]);
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };

/** A runtime's laid-out world as exact text: numbers with their sign of zero, no functions, scene objects or cycles. */
function worldText(value) {
  const seen = new WeakSet();
  return JSON.stringify(value, (key, v) => {
    if (typeof v === 'number') return Object.is(v, -0) ? '-0' : Number.isFinite(v) ? v : String(v);
    if (typeof v === 'function' || v instanceof THREE.Object3D || v instanceof THREE.BufferGeometry || v instanceof THREE.Material) return undefined;
    if (v && typeof v === 'object') { if (seen.has(v)) return '[seen]'; seen.add(v); }
    return v;
  });
}
const laidOut = (props) => ({
  obstacles: props.obstacles, colliders: props.colliders, tankWreckSpots: props.tankWreckSpots,
  destructibles: props.destructibles.map((d) => ({ kind: d.kind, x: d.x, y: d.y, z: d.z, r: d.r, h: d.h, yaw: d.yaw, ob: d.ob })),
  crushables: props.crushables, grounding: props.decorationGroundingReceipts,
});
const named = (props, name) => props.group.getObjectByName(name) ?? null;
/** The drawn wrecks' unique corner positions (float words) and triangle count over the named meshes. */
function drawnWrecks(meshes) {
  const corners = new Set();
  let tris = 0;
  for (const mesh of meshes) {
    if (!mesh) continue;
    const g = mesh.geometry, p = g.attributes.position;
    if (!p) continue;
    tris += (g.index ? g.index.count : p.count) / 3;
    for (let i = 0; i < p.count; i++) corners.add(`${p.getX(i)},${p.getY(i)},${p.getZ(i)}`);
  }
  return { corners, tris };
}

async function build(mapId, facts) {
  const config = getMapConfig(mapId);
  const field = createHeightField(1337, config);
  const flora = await createVegetationAsync(field, engine, 2001, config, null, false);
  return createProps(field, engine, 2002, config, flora, facts);
}

const MAPS = ['winter', 'verdant'];
for (const mapId of MAPS) for (const [specId] of WRECK_BAKE_PLAN[mapId]) await fleet.ensureTankBuilder(specId);
for (const order of [MAPS, [...MAPS].reverse()]) {
  for (const mapId of order) {
    const facts = await loadWreckBakeFacts(mapId);
    assert.ok(facts, `${mapId} has committed wreck facts (node tools/wreck-bake-plan.mjs --write --maps=${mapId})`);
    const baked = await build(mapId, null);
    const placed = await build(mapId, facts);
    assert.ok(baked.tankWreckSpots.length > 0, `${mapId} places hulks`);
    assert.equal(worldText(laidOut(placed)), worldText(laidOut(baked)),
      `${mapId}: the world placed from the facts is the world that baked its hulks (obstacles, colliders, seats, records, later props)`);
    // the facts build draws a stand-in for every hulk and bakes none
    const plan = placed.group.userData.deferredWrecks;
    assert.equal(plan?.hulks.length, baked.tankWreckSpots.length, `${mapId}: every hulk waits for its bake`);
    assert.equal(plan.state, 'pending');
    assert.equal(named(baked, 'tank-wrecks-deferred'), null, `${mapId}: the baking build defers nothing`);
    const standIn = drawnWrecks([named(placed, 'tank-wrecks-deferred')]);
    assert.ok(standIn.tris > 0 && standIn.tris < 600 * plan.hulks.length, `${mapId}: the stand-ins are drawn, a few hundred triangles a hulk (${standIn.tris})`);
    // the swap: the hulks baked as the worker bakes them, then the drawn wrecks equal the baking build's
    const stats = await bakeDeferredWrecks(plan, {
      makeClient: () => ({
        async bake(specId, options) { await fleet.ensureTankBuilder(specId); return wrecks.bakeTankWreck({}, specId, options); },
        dispose() {},
      }),
      pace: () => Promise.resolve(),
    });
    assert.equal(plan.state, 'done');
    assert.equal(stats.failed, 0);
    assert.equal(stats.baked, stats.bakes);
    const after = drawnWrecks([named(placed, 'tank-wrecks'), named(placed, 'tank-wrecks-deferred')]);
    const before = drawnWrecks([named(baked, 'tank-wrecks')]);
    assert.equal(after.tris, before.tris, `${mapId}: after the swap the wrecks draw the baking build's triangles`);
    assert.equal(after.corners.size, before.corners.size, `${mapId}: and its corners`);
    for (const corner of before.corners) assert.ok(after.corners.has(corner), `${mapId}: corner ${corner} drawn after the swap`);
    // and its shadow proxies
    const shadow = (props, names) => names.reduce((n, name) => n + (named(props, name)?.geometry.attributes.position.count ?? 0), 0);
    assert.equal(shadow(placed, ['tank-wrecks-shadow', 'tank-wrecks-deferred-shadow']), shadow(baked, ['tank-wrecks-shadow']),
      `${mapId}: the swapped shadow proxies are the baking build's`);
    console.log(`  ${mapId}: ${plan.hulks.length} hulks, ${stats.bakes} bakes; world identical; ${standIn.tris} stand-in triangles -> ${after.tris} after the swap`);
  }
}
console.log('wreckBakeFacts.selftest: the facts build lays out the baking build\'s world, and its swap draws the baking build\'s wrecks');
