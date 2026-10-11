// The stream-neutral rail berth (the landmarks lane, 2026-10-05; railSpurs.ts `berth: 'clearance'`).
//
//   - the option: a clearance spur stays out of the height field's noVeg (createRailSpurExclusion), its berth reaches the
//     grass, tall grass and litter through the field's `_railBerth` (railBerthField: absent on a map without one, so
//     every other map's field is the object it was), the trees through a post-placement clearance along each edge
//     (railSpurBerthClearances, carried by vegetationClearance.ts placedStructureClearances), and it takes no cutting;
//   - no stream moves: every authoring map's world built with its clearance spurs and without them holds the same
//     records — obstacles, shell colliders and concealers, byte for byte — but the trees its berth clears, each one of
//     them on the berth;
//   - the line keeps clear of every solid: landmarks.selftest asserts the berth against the committed shard.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installWorldBuildFixture, packWorldCollision } from '../../tools/headlessWorldCollision.mjs';
import {
  RAIL_SPUR_BERTH_M, createRailSpurExclusion, railBerthField, railSpurBerthClearances,
} from './railSpurs.ts';
import { overlapsStructureClearance } from './vegetationClearance.ts';

// A world build in a process of its own (a second build in one process does not repeat the first: the world modules keep
// process-wide state), its packed records written to the file named: `--build=<map>:<with|without>:<file>`.
const buildArg = process.argv.find((arg) => arg.startsWith('--build='));
if (buildArg) {
  const [id, mode, file] = buildArg.slice('--build='.length).split('|');
  installWorldBuildFixture();
  const [maps, terrain, vegetation, props, models, fleet] = await Promise.all([
    import('./maps/index.ts'), import('./terrain.ts'), import('./vegetation.ts'), import('./props.ts'), import('./propsModelStore.ts'),
    import('../vehicles/fleetFactory.ts'),
  ]);
  await models.preloadPropModels();
  const base = maps.getMapConfig(id);
  const spurs = base.terrain?.railSpurs ?? [];
  const config = mode === 'with' ? base : { ...base, terrain: { ...base.terrain, railSpurs: spurs.filter((spur) => spur.berth !== 'clearance') } };
  // the wreck cast bakes real hull geometry: its demand-loaded builders resident first (tools/headlessWorldCollision.mjs)
  const wreckIds = config.props?.tankWrecks?.ids ?? [];
  if (wreckIds.length) await fleet.ensureTankBuilders(wreckIds);
  const engine = { anisotropy: 4, setupShadowMaterial() {} };
  const heightField = terrain.createHeightField(1337, config);
  const flora = vegetation.createVegetation(heightField, engine, 2001, config);
  const dressing = props.createProps(heightField, engine, 2002, config, flora);
  writeFileSync(file, JSON.stringify(packWorldCollision({
    obstacles: [...dressing.obstacles, ...flora.treeObstacles],
    colliders: [...dressing.colliders, ...flora.treeObstacles],
    concealers: flora.concealers || [],
  })));
  process.exit(0);
}

// ------------------------------------------------------------------------------------------------------------ the option
const line = { path: [[0, 0], [40, 0], [80, 6]], berth: 'clearance' };
const siding = { path: [[0, 20], [60, 20]] };
assert.equal(createRailSpurExclusion([line]), null, 'a clearance spur joins no noVeg');
assert.ok(createRailSpurExclusion([line, siding])(30, 20), 'an exclusion spur still does');
assert.equal(createRailSpurExclusion([line, siding])(30, 0), false, '… and the clearance one beside it does not');
assert.deepEqual(railBerthField(undefined), {}, 'a map without spurs gains no field');
assert.deepEqual(railBerthField([siding]), {}, 'nor one with exclusion spurs only');
const field = railBerthField([line, siding]);
assert.ok(field._railBerth(20, RAIL_SPUR_BERTH_M - 0.1) && !field._railBerth(20, RAIL_SPUR_BERTH_M + 0.1), 'the predicate is the berth');
assert.equal(field._railBerth(30, 20), false, 'the predicate is the clearance spurs\' alone');
assert.throws(() => railBerthField([{ ...line, cutting: { from: [60, 3] } }]), /no cutting/, 'a clearance spur takes no cutting');
const clearances = railSpurBerthClearances([line, siding]);
assert.equal(clearances.length, 2, 'one clearance per edge of the clearance spurs');
assert.ok(overlapsStructureClearance(clearances, 60, 3, 0.1) && overlapsStructureClearance(clearances, 20, RAIL_SPUR_BERTH_M - 0.2, 0.1),
  'a tree on the berth is cleared');
assert.ok(!overlapsStructureClearance(clearances, 20, RAIL_SPUR_BERTH_M + 1.2, 0.5), 'a tree off it stands');

// ------------------------------------------------------------------------------------------------------- no stream moves
const { MAP_IDS, getMapConfig } = await import('./maps/index.ts');
const self = fileURLToPath(import.meta.url), scratch = mkdtempSync(path.join(tmpdir(), 'rail-berth-'));
function buildInChild(id, mode) {
  const file = path.join(scratch, `${id}-${mode}.json`);
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [self, `--build=${id}|${mode}|${file}`], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('exit', (code) => (code === 0 ? resolve(JSON.parse(readFileSync(file, 'utf8'))) : reject(new Error(`${id} ${mode} build: ${stderr.slice(-800)}`))));
  });
}
// a record's identity without its tree index: a cleared tree renumbers the trees after it (excludeVegetation)
const key = (value) => (Array.isArray(value) ? JSON.stringify(value) : JSON.stringify({ ...value, t: undefined }));
let checked = 0;
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  const spurs = config.terrain?.railSpurs ?? [];
  const clear = spurs.filter((spur) => spur.berth === 'clearance');
  if (!clear.length) continue;
  const [withLine, without] = await Promise.all([buildInChild(id, 'with'), buildInChild(id, 'without')]);
  const berth = railSpurBerthClearances(clear);
  for (const list of ['obstacles', 'colliders']) {
    // the records the line keeps: the same, in the same order; the ones it removes: trees on the berth
    const kept = new Map();
    for (const record of withLine[list]) kept.set(key(record), (kept.get(key(record)) ?? 0) + 1);
    const removed = [];
    let at = 0;
    for (const record of without[list]) {
      const k = key(record), n = kept.get(k) ?? 0;
      if (n > 0) { kept.set(k, n - 1); assert.equal(key(withLine[list][at]), k, `${id}: ${list}[${at}] in its place`); at++; continue; }
      removed.push(record);
    }
    assert.equal(at, withLine[list].length, `${id}: the line adds no ${list} record`);
    for (const record of removed) {
      assert.equal(record.k, 'tree', `${id}: the line removes only trees from the ${list} (${record.k})`);
      const x = (record.b[0] + record.b[3]) / 2, z = (record.b[2] + record.b[5]) / 2, r = Math.max(record.b[3] - record.b[0], record.b[5] - record.b[2]) / 2;
      assert.ok(overlapsStructureClearance(berth, x, z, r + 6), `${id}: a removed tree stood on the berth (${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
  }
  // the concealers: a subset in order (a cleared tree takes its disc with it)
  const discs = new Set(without.concealers.map(key));
  for (const disc of withLine.concealers) assert.ok(discs.has(key(disc)), `${id}: the line adds no concealer (${key(disc)})`);
  checked++;
  console.log(`railSpurBerth.selftest: ${id}: ${without.obstacles.length - withLine.obstacles.length} trees off the berth, every other record byte-identical`);
}
rmSync(scratch, { recursive: true, force: true });
assert.ok(checked >= 1, 'at least one map lays a clearance berth');
console.log(`railSpurBerth.selftest: the option, ${checked} map(s) with no stream moved`);
