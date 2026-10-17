// The changed-only world keys on a fixture (no world build): a map's own config marks that map; a module two configs
// share marks both; the world core, the fleet core, the toolchain and the step's flags mark every map; a wreck donor's
// builder marks only the maps that bake it; a map's rows edited by hand mark it, a frame edit or a map roster change runs
// the whole world; an undeclared fleet use, an unpinned one or an undeclared dynamic read fails closed.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { computeState, emptyManifest, recordStep, refreshComponents, resolveChanged } from './fingerprint.mjs';
import { FLEET_API_TOKENS } from './steps.mjs';
import { parseMapRegistry, tokenPin } from './world.mjs';

const root = mkdtempSync(join(tmpdir(), 'cot-changed-only-world-'));
const cacheDir = mkdtempSync(join(tmpdir(), 'cot-changed-only-world-cache-'));
const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// The fleet: alpha builds a1, beta builds b1; the factory core is kit.ts and the specs.
put('package-lock.json', '{"lockfileVersion":3}\n');
put('node_modules/.package-lock.json', '{}\n');
put('src/vehicles/specs.ts', "export const ALL_TANK_IDS = ['a1', 'b1'];\n");
put('src/vehicles/fleetRegistration.ts', "import './specs.ts';\n");
put('src/vehicles/kit.ts', 'export const KIT = 1;\n');
put('src/vehicles/tankFactoryCore.ts', "import { KIT } from './kit.ts';\nexport const build = (id) => ({ id, KIT });\n");
put('src/vehicles/profiles/alpha.ts', 'export const ALPHA = { a1: 1 };\n');
put('src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 2 };\n');
put('src/vehicles/profiledProcedurals.ts', "import { ALPHA } from './profiles/alpha.ts';\nimport { BETA } from './profiles/beta.ts';\nexport const P = { ...ALPHA, ...BETA };\n");
put('src/vehicles/tankFactory.ts', "import './fleetRegistration.ts';\nimport './profiledProcedurals.ts';\nexport { build as createTank } from './tankFactoryCore.ts';\n");
put('src/vehicles/fleetFactory.ts', "import './fleetRegistration.ts';\nexport { build as createTank } from './tankFactoryCore.ts';\nconst GROUP_LOADERS = Object.freeze({\n  alpha: () => import('./profiles/alpha.ts'),\n  beta: () => import('./profiles/beta.ts'),\n});\nexport { GROUP_LOADERS };\n");

// The world: three maps. north and south share maps/ground.ts; north bakes a1, south bakes b1, east bakes nothing.
put('src/world/maps/ground.ts', 'export const GROUND = 1;\n');
put('src/world/maps/north.ts', "import { GROUND } from './ground.ts';\nexport default { ground: GROUND, wrecks: ['a1'] };\n");
put('src/world/maps/south.ts', "import { GROUND } from './ground.ts';\nexport default { ground: GROUND + 1, wrecks: ['b1'] };\n");
put('src/world/maps/east.ts', 'export default { ground: 3, wrecks: [] };\n');
put('src/world/maps/index.ts', "import north from './north.ts';\nimport south from './south.ts';\nimport east from './east.ts';\nconst CONFIGS = { north, south, east_map: east } satisfies Record<string, object>;\nexport const getMapConfig = (id) => CONFIGS[id];\n");
put('src/world/terrain.ts', 'export const heights = (seed) => seed * 2;\n');
const props = "import { createTank } from '../vehicles/fleetFactory.ts';\nimport { heights } from './terrain.ts';\nexport const build = (config) => ({ h: heights(config.ground), wrecks: config.wrecks.map((id) => createTank(id)) });\n";
put('src/world/props.ts', props);
put('tools/world-tool.mjs', "import { getMapConfig } from '../src/world/maps/index.ts';\nimport { build } from '../src/world/props.ts';\nexport const run = (map) => build(getMapConfig(map));\n");

const fleetConfig = {
  tables: {}, aggregates: [],
  fleetEntries: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/specs.ts', 'src/vehicles/fleetRegistration.ts'],
  loaderFiles: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/profiledProcedurals.ts'],
  groupLoadersFile: 'src/vehicles/fleetFactory.ts', declared: {}, accessors: {},
};
const worldConfig = (users = { 'src/world/props.ts': { pin: tokenPin(read('src/world/props.ts'), FLEET_API_TOKENS) } }) => ({
  ...fleetConfig,
  world: { registryFile: 'src/world/maps/index.ts', outputs: ['server/shards'], fleetApiUsers: users, fleetApiTokens: FLEET_API_TOKENS },
});
const worldSteps = (flags = []) => [{ name: 'shards', universe: 'maps', device: 'cpu', tool: 'tools/world-tool.mjs', flags, full: [],
  scoped: (maps) => [`--maps=${maps.join(',')}`], outputs: ['shards'], files: ['server/shards/index.json'], donors: 'plan' }];
const rowsData = (overrides = {}) => ({
  roster: { all: ['a1', 'b1'], saved: ['a1', 'b1'], development: [], groupById: { a1: 'alpha', b1: 'beta' }, renames: [], idSchema: 1 },
  rows: {}, fileIds: {}, chains: { a1: ['a1'], b1: ['b1'] }, errors: [],
  world: {
    mapIds: ['north', 'south', 'east_map'],
    donors: {
      north: { plan: ['a1'], named: ['a1'], cast: [], wrecks: 1 },
      south: { plan: ['b1'], named: ['b1'], cast: [], wrecks: 1 },
      east_map: { plan: [], named: [], cast: [], wrecks: 0 },
    },
    rows: { shards: { north: 'n1', south: 's1', east_map: 'e1' } },
    frames: { 'server/shards/index.json': 'frame-1' },
    errors: [],
  },
  ...overrides,
});
const env = { NODE_OPTIONS: '--max-old-space-size=4096' };
const state = ({ rows = rowsData(), cfg = worldConfig(), flags = [], envOverride = env } = {}) =>
  computeState({ root, steps: [], worldSteps: worldSteps(flags), env: envOverride, rows, cacheDir, config: cfg });
const bootstrap = (current) => {
  const manifest = emptyManifest();
  const world = current.world;
  for (const name of Object.keys(world.steps)) {
    recordStep(manifest, name, null, Object.fromEntries(world.ids.map((map) => [map, world.inKey(name, map)])), world);
  }
  return refreshComponents(manifest, current);
};
const marked = (current, manifest) => {
  const entry = resolveChanged(current.world, manifest).shards;
  return `${entry.mode}:${entry.ids.join(',')}`;
};

// The registry parses to config modules; the world decomposes; the maps' own files are their configs (and shared module).
assert.deepEqual(parseMapRegistry(read('src/world/maps/index.ts'), 'index.ts'), { north: './north.ts', south: './south.ts', east_map: './east.ts' });
const s0 = state();
assert.ok(s0.world, 'world rows read');
assert.deepEqual(s0.world.steps.shards.reasons, [], 'the fixture world decomposes');
assert.deepEqual(s0.world.steps.shards.mapFiles.north, ['src/world/maps/ground.ts', 'src/world/maps/north.ts']);
assert.deepEqual(s0.world.steps.shards.mapFiles.east_map, ['src/world/maps/east.ts']);
assert.ok(!s0.world.steps.shards.toolFiles.includes('src/world/maps/north.ts'), 'the registry\'s config imports are per map');
assert.ok(!s0.world.steps.shards.toolFiles.some((file) => file.startsWith('src/vehicles/')), 'the fleet enters through the donors');
const m0 = bootstrap(s0);

// 1. Nothing changed: no map runs.
assert.equal(marked(state(), m0), 'none:');
// 2. A map's own config marks that map alone; a module two configs share marks both.
put('src/world/maps/east.ts', 'export default { ground: 4, wrecks: [] };\n');
assert.equal(marked(state(), m0), 'ids:east_map');
assert.deepEqual(resolveChanged(state().world, m0).shards.reasons.east_map, ['map config east_map']);
put('src/world/maps/east.ts', 'export default { ground: 3, wrecks: [] };\n');
put('src/world/maps/ground.ts', 'export const GROUND = 2;\n');
assert.equal(marked(state(), m0), 'ids:north,south', 'a module two configs import marks both maps');
put('src/world/maps/ground.ts', 'export const GROUND = 1;\n');
// 3. The world core marks every map.
put('src/world/terrain.ts', 'export const heights = (seed) => seed * 3;\n');
assert.equal(marked(state(), m0), 'all:north,south,east_map');
put('src/world/terrain.ts', 'export const heights = (seed) => seed * 2;\n');
// 4. A donor's builder marks the maps that bake it; the fleet core marks every map (spec data reaches every map).
put('src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 3 };\n');
let result = resolveChanged(state().world, m0).shards;
assert.equal(`${result.mode}:${result.ids.join(',')}`, 'ids:south', 'a builder edit marks only the map that bakes its id');
assert.match(result.reasons.south.join(), /donors b1/);
put('src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 2 };\n');
put('src/vehicles/kit.ts', 'export const KIT = 2;\n');
assert.equal(marked(state(), m0), 'all:north,south,east_map', 'the fleet core marks every map');
put('src/vehicles/kit.ts', 'export const KIT = 1;\n');
// A donor's build-read row (a per-id table the factory reads) marks the maps that bake it.
put('src/vehicles/anchors.generated.ts', 'export const ANCHORS = { a1: 1, b1: 2 };\n');
put('src/vehicles/tankFactoryCore.ts', "import { KIT } from './kit.ts';\nimport { ANCHORS } from './anchors.generated.ts';\nexport const build = (id) => ({ id, KIT, anchor: ANCHORS[id] });\n");
const anchorTables = { ...worldConfig(), tables: { anchors: { kind: 'module', files: ['src/vehicles/anchors.generated.ts'], exportName: 'ANCHORS' } } };
const anchored = rowsData({ rows: { anchors: { a1: 'x', b1: 'y' } } });
const m1 = bootstrap(state({ rows: anchored, cfg: anchorTables }));
assert.deepEqual(state({ rows: anchored, cfg: anchorTables }).buildReadTables, ['anchors']);
const moved = rowsData({ rows: { anchors: { a1: 'x', b1: 'y2' } } });
assert.equal(marked(state({ rows: moved, cfg: anchorTables }), m1), 'ids:south', 'a donor\'s build-read row marks the map that bakes it');
put('src/vehicles/tankFactoryCore.ts', "import { KIT } from './kit.ts';\nexport const build = (id) => ({ id, KIT });\n");
// 5. The plan's donors moving re-keys that map.
const replanned = rowsData(); replanned.world.donors.east_map = { plan: ['a1'], named: [], cast: [], wrecks: 1 };
assert.equal(marked(state({ rows: replanned }), m0), 'ids:east_map', 'a map that starts baking a donor re-keys');
// 6. Tool flags, the toolchain: every map.
assert.equal(marked(state({ flags: ['--variant=x'] }), m0), 'all:north,south,east_map', 'a flag edit marks every map');
put('package-lock.json', '{"lockfileVersion":3,"x":1}\n');
assert.equal(marked(state(), m0), 'all:north,south,east_map', 'a lockfile change marks every map');
put('package-lock.json', '{"lockfileVersion":3}\n');
// 7. A map's rows edited by hand mark it; a frame edit or a map roster change runs the whole world.
const handEdited = rowsData(); handEdited.world.rows.shards.south = 's1-hand';
result = resolveChanged(state({ rows: handEdited }).world, m0).shards;
assert.equal(`${result.mode}:${result.ids.join(',')}`, 'ids:south');
assert.deepEqual(result.reasons.south, ['output edited outside chain']);
const reframed = rowsData(); reframed.world.frames['server/shards/index.json'] = 'frame-2';
assert.equal(marked(state({ rows: reframed }), m0), 'full:north,south,east_map', 'a frame edit runs the whole world');
const newMap = rowsData(); newMap.world.mapIds = ['north', 'south'];
assert.equal(marked(state({ rows: newMap }), m0), 'full:north,south', 'a map roster change runs the whole world');
assert.equal(marked(state(), null), 'full:north,south,east_map', 'no manifest runs the whole world');
// 8. Fail closed: an undeclared fleet user, a stale pin, an undeclared dynamic read, a world row error.
assert.match(state({ cfg: worldConfig({}) }).world.steps.shards.reasons.join(), /undeclared fleet use in src\/world\/props\.ts/);
assert.equal(marked(state({ cfg: worldConfig({ 'src/world/props.ts': { pin: '0000000000000000' } }) }), m0), 'all:north,south,east_map');
assert.match(state({ cfg: worldConfig({ 'src/world/props.ts': { pin: '0000000000000000' } }) }).world.steps.shards.reasons.join(), /fleet use pin stale/);
put('src/world/terrain.ts', "import { readFileSync } from 'node:fs';\nexport const heights = (file) => readFileSync(file).length;\n");
assert.match(state().world.steps.shards.reasons.join(), /undeclared dynamic read in src\/world\/terrain\.ts/);
put('src/world/terrain.ts', 'export const heights = (seed) => seed * 2;\n');
const broken = rowsData(); broken.world.errors = ['the registry did not load'];
assert.equal(marked(state({ rows: broken }), m0), 'all:north,south,east_map', 'unreadable world rows fail closed');
// A config imported outside the registry is world core: an edit to it marks every map.
put('src/world/terrain.ts', "import east from './maps/east.ts';\nexport const heights = (seed) => seed * 2 + east.ground * 0;\n");
const m2 = bootstrap(state());
put('src/world/maps/east.ts', 'export default { ground: 5, wrecks: [] };\n');
assert.equal(marked(state(), m2), 'all:north,south,east_map', 'a config the world core imports marks every map');

console.log('changed-only world.selftest: PASS');
