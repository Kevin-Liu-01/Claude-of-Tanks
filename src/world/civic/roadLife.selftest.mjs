// roadLife.selftest.mjs — every map's road life as the props build it (the maps lane, 229; the owner: "for all maps we can
// have destructible objects like cars and stuff on roads"). Real props in Node, twice: with the road life and without it
// (globalThis.__cotRoadLifeOff), so the map's own build holds:
//   - stream neutrality: the props' streams draw exactly as without it, and every other record stands where it stood;
//   - each piece at its seat, on the ground, out of every structure, not moved by the separation passes;
//   - each piece's kind a pool the map draws without it (no new draw);
//   - no seat in an objective's or a deployment's disc (landmarkObjectiveDiscs: the zones, the kickoff, the middle, the
//     deployments), nor two vehicles across a carriageway closer than a tank passes (4.2 m between their sides).
// COT_ROAD_LIFE_MAPS=a,b runs those maps only (a batch's own iteration); the gate runs every map with road life.
import assert from 'node:assert/strict';
import { installWorldBuildFixture } from '../../../tools/headlessWorldCollision.mjs';
installWorldBuildFixture();
const [maps, terrain, vegetation, props, models, fleet, roadLife, compose, collision] = await Promise.all([
  import('../maps/index.ts'), import('../terrain.ts'), import('../vegetation.ts'), import('../props.ts'), import('../propsModelStore.ts'),
  import('../../vehicles/fleetFactory.ts'), import('./roadLife.ts'), import('../landmarks/compose.ts'), import('../collision.ts')]);
await models.preloadPropModels();
const engine = { anisotropy: 4, setupShadowMaterial() {} };

async function build(mapId, off) {
  globalThis.__cotRoadLifeOff = off;
  try {
    const config = maps.getMapConfig(mapId);
    if (config.props?.tankWrecks?.ids?.length) await fleet.ensureTankBuilders(config.props.tankWrecks.ids);
    const field = terrain.createHeightField(1337, config);
    const flora = vegetation.createVegetation(field, engine, 2001, config);
    return { field, built: props.createProps(field, engine, 2002, config, flora) };
  } finally { globalThis.__cotRoadLifeOff = false; }
}

const VEHICLES = new Set(['sedan', 'wagon', 'pickup', 'van', 'jeep', 'truck', 'truckbox', 'truckflatbed']);
const HALF_WIDTH = { sedan: 1.01, wagon: 1.01, pickup: 1.11, van: 1.11, jeep: 0.94, truck: 1.29, truckbox: 1.29, truckflatbed: 1.29 };
const ONLY = process.env.COT_ROAD_LIFE_MAPS ? new Set(process.env.COT_ROAD_LIFE_MAPS.split(',')) : null;
const mapIds = roadLife.roadLifeMaps().filter((m) => !ONLY || ONLY.has(m));
let pieces = 0;
for (const mapId of mapIds) {
  const seats = roadLife.roadLifeFor(mapId);
  const base = await build(mapId, true), withLife = await build(mapId, false);
  const { built, field } = withLife;
  // ---- stream neutrality
  assert.deepEqual(built.group.userData.streamDraws, base.built.group.userData.streamDraws, `${mapId}: the props' streams draw as without the road life`);
  const own = (d) => seats.some((p) => p.kind === d.kind && Math.hypot(p.x - d.x, p.z - d.z) < 0.05);
  const key = (d) => `${d.kind}@${d.x.toFixed(2)},${d.z.toFixed(2)}`;
  const before = new Set(base.built.destructibles.filter((d) => d.slot >= 0).map(key));
  const after = new Set(built.destructibles.filter((d) => d.slot >= 0 && !own(d)).map(key));
  const lost = [...before].filter((k) => !after.has(k)), gained = [...after].filter((k) => !before.has(k));
  assert.deepEqual([lost.slice(0, 6), gained.slice(0, 6)], [[], []], `${mapId}: every other record stands where it stood (${lost.length} lost, ${gained.length} gained)`);
  // ---- the pieces
  const kinds = new Set(base.built.destructibles.filter((d) => d.slot >= 0).map((d) => d.kind));
  const structures = built.obstacles.filter((o) => o.kind === 'structure' || o.structureIdx != null);
  const inStructure = (x, z, m) => structures.some((o) => x > o.min[0] - m && x < o.max[0] + m && z > o.min[2] - m && z < o.max[2] + m
    && collision.collisionFootprintContainsPoint(o, x, z, m));
  const L = field._layout;
  const discs = compose.landmarkObjectiveDiscs(mapId, [L.spawns.player, ...L.spawns.enemies]);
  const moved = built.group.userData.parkedVehicleSeparation?.moved ?? [];
  for (const p of seats) {
    const tag = `${mapId}: the road life's ${p.kind} at (${p.x}, ${p.z})`;
    assert.ok(kinds.has(p.kind), `${tag}: a kind the map draws without it (no new pool)`);
    const rec = built.destructibles.find((d) => d.kind === p.kind && d.slot >= 0 && Math.hypot(d.x - p.x, d.z - p.z) < 0.05);
    assert.ok(rec, `${tag} at its seat`);
    assert.ok(Math.abs(rec.y - field.getHeightAt(p.x, p.z)) < 0.35, `${tag} seated on the ground`);
    assert.ok(!inStructure(p.x, p.z, 0.5), `${tag} out of every structure`);
    assert.ok(!moved.some((m) => Math.hypot(m.from[0] - p.x, m.from[1] - p.z) < 0.1), `${tag} not moved by the separation pass`);
    for (const [dx, dz, r] of discs) assert.ok(Math.hypot(p.x - dx, p.z - dz) >= r, `${tag} out of the disc at (${dx.toFixed(0)}, ${dz.toFixed(0)}) r ${r}`);
    pieces++;
  }
  // ---- no two vehicles across a carriageway closer than a tank passes (their sides 4.2 m apart at least)
  const cars = seats.filter((p) => VEHICLES.has(p.kind));
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
    const a = cars[i], b = cars[j];
    const d = Math.hypot(a.x - b.x, a.z - b.z);
    const ya = (a.yawDeg * Math.PI) / 180, along = Math.abs((b.x - a.x) * Math.sin(ya) + (b.z - a.z) * Math.cos(ya));
    const across = Math.sqrt(Math.max(0, d * d - along * along));
    if (along < 4.5 && across > 1) assert.ok(across - HALF_WIDTH[a.kind] - HALF_WIDTH[b.kind] >= 4.2, `${mapId}: the ${a.kind} at (${a.x}, ${a.z}) and the ${b.kind} at (${b.x}, ${b.z}) ${(across - HALF_WIDTH[a.kind] - HALF_WIDTH[b.kind]).toFixed(2)} m apart across (a tank needs 4.2)`);
  }
  console.log(`${mapId}: ${seats.length} pieces (${cars.length} vehicles) at their seats; streams and the map's records as without them`);
}
console.log(`roadLife.selftest: ${mapIds.length} map(s), ${pieces} pieces — at their seats, out of the discs, no new pool, stream-neutral — ok`);
