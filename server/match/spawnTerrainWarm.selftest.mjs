// spawnTerrainWarm.selftest.mjs — the perf stream (2026-10-13): the countdown warms the terrain a match's first minute
// reads (spawnTerrainWarm.ts).
// 1. The generator: the fast tiles within 48 m of every hull with a position, one tile a step, then the contact vertices
//    within 10 m of each hull, a row a step, every vertex of the 4/3 m lattice there touched.
// 2. Exactness: a real field warmed this way answers every fast and contact query round the spawns exactly as an unwarmed
//    field does.
// 3. The wiring: the actor runs it only during the countdown, a bounded slice a tick, and drops it once play begins.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSpawnTerrainWarm, SPAWN_FAST_RADIUS_M, SPAWN_CONTACT_RADIUS_M } from './spawnTerrainWarm.ts';
import { createHeightField } from '../../src/world/terrain.ts';
import { getMapConfig } from '../../src/world/maps/index.ts';

// ---- 1. the generator
{
  const warmed = [], contacts = [];
  const field = {
    *warmFastTilesAround(points) { warmed.push(...points); yield 11; yield 12; },
    getContactHeightAt(x, z) { contacts.push([x, z]); return 0; },
  };
  const entities = [{ state: { pos: { x: 10, z: -20 } } }, { state: { pos: { x: NaN, z: 0 } } }, { state: null }, { state: { pos: { x: -5, z: 7 } } }];
  const steps = [...createSpawnTerrainWarm(field, entities)];
  assert.deepEqual(warmed, [{ x: 10, z: -20, radiusM: SPAWN_FAST_RADIUS_M }, { x: -5, z: 7, radiusM: SPAWN_FAST_RADIUS_M }],
    'every hull with a finite position, at the fast reach');
  assert.deepEqual(steps.slice(0, 2), [11, 12], 'one fast tile a step first');
  const rows = steps.filter((step) => step === -1).length;
  assert.equal(rows, 2 * 16, 'then a row of contact vertices a step for each hull');
  assert.equal(contacts.length, 2 * 16 * 16);
  const near = contacts.filter(([x, z]) => Math.abs(x - 10) <= SPAWN_CONTACT_RADIUS_M + 1e-6 && Math.abs(z + 20) <= SPAWN_CONTACT_RADIUS_M + 1e-6);
  assert.equal(near.length, 256, 'the contact lattice stays within its reach');
  assert.deepEqual([...createSpawnTerrainWarm({}, entities)], [], 'a field without the grids warms nothing');
}

// ---- 2. exactness on a real field
{
  const config = getMapConfig('railyard');
  const cold = createHeightField(1337, config), warm = createHeightField(1337, config);
  const spawns = [config.spawns?.player ?? { x: 0, z: 0 }].map((s) => ({ state: { pos: { x: s.x, z: s.z } } }));
  let units = 0;
  for (const _ of createSpawnTerrainWarm(warm, spawns)) units++;
  assert.ok(units > 10, `the warm ran (${units} steps)`);
  let seed = 99;
  const rand = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let i = 0; i < 4000; i++) {
    const s = spawns[0].state.pos, x = s.x + (rand() - 0.5) * 120, z = s.z + (rand() - 0.5) * 120;
    assert.ok(Object.is(warm.getHeightAtFast(x, z), cold.getHeightAtFast(x, z)), 'fast heights are the unwarmed field\'s');
    assert.ok(Object.is(warm.getContactHeightAt(x, z), cold.getContactHeightAt(x, z)), 'contact heights are the unwarmed field\'s');
  }
}

// ---- 3. the wiring
const actor = readFileSync(new URL('./matchActor.ts', import.meta.url), 'utf8');
assert.match(actor, /let terrainWarm: Iterator<number> \| null = countdownS > 0 \? createSpawnTerrainWarm\(authority\.heightField, authority\.entities\) : null;/);
const tickBody = actor.slice(actor.indexOf('  function onTick(tick: number, dt: number): void {'));
assert.match(tickBody, /if \(authority\.phase !== 'countdown'\) terrainWarm = null;/, 'only during the countdown, dropped once play begins');
assert.match(tickBody, /for \(let unit = 0; unit < 6 && now\(\) - sliceStart < TERRAIN_WARM_SLICE_MS; unit\+\+\)/, 'a bounded slice a tick');
assert.ok(tickBody.indexOf('terrainWarm.next()') < tickBody.indexOf('authority.step('), 'before the authority steps');

console.log('spawnTerrainWarm.selftest: the countdown warms the fast tiles and contact vertices round every spawn, a slice a tick, and changes no height');
