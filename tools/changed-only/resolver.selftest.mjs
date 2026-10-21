// The changed-only resolver on a fixture fleet (no tank builds): unchanged ids are skipped; a shared builder marks
// every id that uses it; tool code, flags, the toolchain, the roster and undeclared dynamic reads mark everything they
// affect; an output edited outside the chain is caught by its row or its file. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { computeState, emptyManifest, parseManifest, recordStep, refreshComponents, resolveChanged, serializeManifest }
  from './fingerprint.mjs';

const root = mkdtempSync(join(tmpdir(), 'cot-changed-only-fixture-'));
const cacheDir = mkdtempSync(join(tmpdir(), 'cot-changed-only-cache-'));
const put = (rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };

// A fleet of three ids in two builder groups. alpha builds a1 and a2 from profiles/alpha.ts (which uses
// profiles/turretKit.ts); beta builds b1 from profiles/beta.ts. The core is the factory, the kit and the specs.
put('package-lock.json', '{"lockfileVersion":3}\n');
put('node_modules/.package-lock.json', '{}\n');
put('src/vehicles/specs.ts', "export const ALL_TANK_IDS = ['a1', 'a2', 'b1'];\n");
put('src/vehicles/fleetRegistration.ts', "import './specs.ts';\n");
put('src/vehicles/kit.ts', 'export const KIT = { wheel: 0.4 };\n');
put('src/vehicles/tankFactoryCore.ts', "import { KIT } from './kit.ts';\nimport { ANCHORS } from './anchors.generated.ts';\nexport const createTank = (id) => ({ id, KIT, anchor: ANCHORS[id] });\n");
put('src/vehicles/anchors.generated.ts', 'export const ANCHORS = { a1: 1, a2: 2, b1: 3 };\n');
put('src/vehicles/profiles/turretKit.ts', 'export const TURRET = 1;\n');
put('src/vehicles/profiles/alpha.ts', "import { TURRET } from './turretKit.ts';\nexport const ALPHA = { a1: TURRET, a2: TURRET };\n");
put('src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 2 };\n');
put('src/vehicles/profiledProcedurals.ts', "import { ALPHA } from './profiles/alpha.ts';\nimport { BETA } from './profiles/beta.ts';\nexport const P = { ...ALPHA, ...BETA };\n");
put('src/vehicles/tankFactory.ts', "import './fleetRegistration.ts';\nimport { P } from './profiledProcedurals.ts';\nexport { createTank } from './tankFactoryCore.ts';\n");
put('src/vehicles/fleetFactory.ts', "import './fleetRegistration.ts';\nconst GROUP_LOADERS = Object.freeze({\n  alpha: () => import('./profiles/alpha.ts'),\n  beta: () => import('./profiles/beta.ts'),\n});\nexport { GROUP_LOADERS };\n");
put('src/vehicles/sizes.generated.ts', 'export const SIZES = { a1: 1, a2: 1, b1: 1 };\n');
put('tools/helper.mjs', 'export const round = (x) => Math.round(x);\n');
put('tools/gen-sizes.mjs', "import { createTank } from '../src/vehicles/tankFactory.ts';\nimport { round } from './helper.mjs';\nexport default [createTank, round];\n");
put('tools/gen-other.mjs', "import { createTank } from '../src/vehicles/tankFactory.ts';\nexport default createTank;\n");

const config = {
  tables: {
    anchors: { kind: 'module', files: ['src/vehicles/anchors.generated.ts'], exportName: 'ANCHORS' },
    sizes: { kind: 'module', files: ['src/vehicles/sizes.generated.ts'], exportName: 'SIZES' },
  },
  aggregates: [],
  fleetEntries: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/specs.ts', 'src/vehicles/fleetRegistration.ts'],
  loaderFiles: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/profiledProcedurals.ts'],
  groupLoadersFile: 'src/vehicles/fleetFactory.ts',
  declared: {},
};
const baseSteps = () => [
  { name: 'sizes', device: 'cpu', tool: 'tools/gen-sizes.mjs', flags: ['--rounds=8'], full: [], scoped: (ids) => [`--ids=${ids}`], outputs: ['sizes'], files: [] },
  { name: 'other', device: 'cpu', tool: 'tools/gen-other.mjs', flags: [], full: [], scoped: (ids) => [`--ids=${ids}`], outputs: [], files: [] },
];
const rowsData = (overrides = {}) => ({
  roster: { all: ['a1', 'a2', 'b1'], saved: ['a1', 'a2', 'b1'], development: [], groupById: { a1: 'alpha', a2: 'alpha', b1: 'beta' }, renames: [], idSchema: 1 },
  rows: { anchors: { a1: 'r1', a2: 'r2', b1: 'r3' }, sizes: { a1: 's1', a2: 's2', b1: 's3' } },
  fileIds: { 'src/vehicles/anchors.generated.ts': ['a1', 'a2', 'b1'], 'src/vehicles/sizes.generated.ts': ['a1', 'a2', 'b1'] },
  chains: { a1: ['a1'], a2: ['a2'], b1: ['b1'] },
  errors: [],
  ...overrides,
});
const env = { NODE_OPTIONS: '--max-old-space-size=4096' };
const state = ({ steps = baseSteps(), rows = rowsData(), cfg = config } = {}) => computeState({ root, steps, env, rows, cacheDir, config: cfg });
const changed = (result) => Object.fromEntries(Object.entries(result).map(([name, entry]) => [name, `${entry.mode}:${entry.ids.join(',')}`]));

/** The manifest a full chain run would leave on this state: every step recorded on every id. */
function bootstrap(current) {
  const manifest = emptyManifest();
  for (const name of Object.keys(current.steps)) {
    const inKeys = Object.fromEntries(current.ids.map((id) => [id, current.inKey(name, id)]));
    recordStep(manifest, name, null, inKeys, current);
  }
  return refreshComponents(manifest, current);
}

// The fleet decomposes: alpha's closure holds the turret kit; the kit and specs are core; the anchors are read per id.
const s0 = state();
assert.deepEqual(s0.globalReasons, [], 'fixture fleet decomposes');
assert.deepEqual(s0.partition.groups.alpha.sort(), ['src/vehicles/profiles/alpha.ts', 'src/vehicles/profiles/turretKit.ts']);
assert.deepEqual(s0.partition.groups.beta, ['src/vehicles/profiles/beta.ts']);
assert.ok(s0.partition.core.includes('src/vehicles/kit.ts') && s0.partition.core.includes('src/vehicles/profiledProcedurals.ts'));
assert.ok(!s0.partition.core.includes('src/vehicles/profiles/alpha.ts'), 'a registration import does not pull a group into core');
assert.deepEqual(s0.buildReadTables, ['anchors']);
const m0 = bootstrap(s0);

// 1. Nothing changed: every id is skipped.
assert.deepEqual(changed(resolveChanged(s0, m0)), { sizes: 'none:', other: 'none:' }, 'unchanged ids are skipped');
// The manifest is deterministic: sorted, no timestamps, and it round-trips byte for byte.
const text0 = serializeManifest(m0);
assert.equal(serializeManifest(parseManifest(text0)), text0);
assert.equal(serializeManifest(bootstrap(state())), text0, 'two bootstraps of one tree write the same manifest');
assert.deepEqual(text0.split('\n').slice(1, -1), [...text0.split('\n').slice(1, -1)].sort());

// 2. A group-only builder edit marks only that group's ids.
const beta = readFileSync(join(root, 'src/vehicles/profiles/beta.ts'), 'utf8');
put('src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 3 };\n');
let result = resolveChanged(state(), m0);
assert.deepEqual(changed(result), { sizes: 'ids:b1', other: 'ids:b1' }, 'a beta builder edit marks only b1');
assert.ok(result.sizes.reasons.b1.includes('group beta'));
put('src/vehicles/profiles/beta.ts', beta);

// 3. A shared builder kit marks every id that uses it, and only those.
put('src/vehicles/profiles/turretKit.ts', 'export const TURRET = 2;\n');
assert.deepEqual(changed(resolveChanged(state(), m0)), { sizes: 'ids:a1,a2', other: 'ids:a1,a2' }, 'the turret kit marks alpha ids');
// ...and once beta imports it too, every id.
put('src/vehicles/profiles/beta.ts', "import { TURRET } from './turretKit.ts';\nexport const BETA = { b1: TURRET };\n");
const m1 = bootstrap(state());
put('src/vehicles/profiles/turretKit.ts', 'export const TURRET = 3;\n');
assert.deepEqual(changed(resolveChanged(state(), m1)), { sizes: 'all:a1,a2,b1', other: 'all:a1,a2,b1' }, 'a kit both groups import marks every id');
put('src/vehicles/profiles/beta.ts', beta);
put('src/vehicles/profiles/turretKit.ts', 'export const TURRET = 1;\n');
assert.deepEqual(changed(resolveChanged(state(), m0)), { sizes: 'none:', other: 'none:' }, 'restored sources resolve clean');

// 4. A core edit marks every id of every step.
put('src/vehicles/kit.ts', 'export const KIT = { wheel: 0.41 };\n');
result = resolveChanged(state(), m0);
assert.deepEqual(changed(result), { sizes: 'all:a1,a2,b1', other: 'all:a1,a2,b1' });
assert.ok(result.sizes.reasons.a1.includes('core'));
put('src/vehicles/kit.ts', 'export const KIT = { wheel: 0.4 };\n');

// 5. A spec chain carries a donor's builder: a2 built on b1 follows beta.
const chained = rowsData({ chains: { a1: ['a1'], a2: ['a2', 'b1'], b1: ['b1'] } });
const m2 = bootstrap(state({ rows: chained }));
put('src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 4 };\n');
assert.deepEqual(changed(resolveChanged(state({ rows: chained }), m2)), { sizes: 'ids:a2,b1', other: 'ids:a2,b1' }, 'the donor chain follows beta');
put('src/vehicles/profiles/beta.ts', beta);

// 6. Tool code marks every id of that step only; a canonical flag edit too.
put('tools/helper.mjs', 'export const round = (x) => Math.round(x * 10) / 10;\n');
result = resolveChanged(state(), m0);
assert.deepEqual(changed(result), { sizes: 'all:a1,a2,b1', other: 'none:' }, 'a tool helper edit marks only its step');
assert.ok(result.sizes.reasons.a1.some((reason) => reason.startsWith('tool ')));
put('tools/helper.mjs', 'export const round = (x) => Math.round(x);\n');
const flagged = baseSteps(); flagged[0].flags = ['--rounds=4'];
assert.deepEqual(changed(resolveChanged(state({ steps: flagged }), m0)), { sizes: 'all:a1,a2,b1', other: 'none:' }, 'a flag edit marks its step');
const scheduling = baseSteps(); scheduling[0].timeoutS = 99; scheduling[0].gb = 32;
assert.deepEqual(changed(resolveChanged(state({ steps: scheduling }), m0)), { sizes: 'none:', other: 'none:' }, 'scheduling fields are not keyed');

// 7. A build-read row marks its id in every step that reads it; an own output row edited outside the chain marks it too.
const anchorMoved = rowsData(); anchorMoved.rows.anchors.a2 = 'r2b';
result = resolveChanged(state({ rows: anchorMoved }), m0);
assert.deepEqual(changed(result), { sizes: 'ids:a2', other: 'ids:a2' });
assert.ok(result.sizes.reasons.a2.includes('row anchors[a2]'));
const sizeEdited = rowsData(); sizeEdited.rows.sizes.b1 = 's3-hand';
result = resolveChanged(state({ rows: sizeEdited }), m0);
assert.deepEqual(changed(result), { sizes: 'ids:b1', other: 'none:' }, 'an output row edited by hand marks its id; sizes is not read by builds');
assert.deepEqual(result.sizes.reasons.b1, ['output edited outside chain']);

// 8. An output file edited outside its rows (a frame or format edit) re-runs the step on the whole fleet.
const sizes = readFileSync(join(root, 'src/vehicles/sizes.generated.ts'), 'utf8');
put('src/vehicles/sizes.generated.ts', `// hand note\n${sizes}`);
result = resolveChanged(state(), m0);
assert.equal(result.sizes.mode, 'full');
assert.match(result.sizes.reasons['*'][0], /output file edited: src\/vehicles\/sizes\.generated\.ts/);
put('src/vehicles/sizes.generated.ts', sizes);

// 9. Roster, toolchain and a missing manifest fail closed.
const reordered = rowsData(); reordered.roster.all = ['a2', 'a1', 'b1'];
assert.deepEqual(changed(resolveChanged(state({ rows: reordered }), m0)), { sizes: 'full:a2,a1,b1', other: 'full:a2,a1,b1' }, 'a roster reorder runs whole-fleet');
assert.deepEqual(changed(resolveChanged(s0, null)), { sizes: 'full:a1,a2,b1', other: 'full:a1,a2,b1' }, 'no manifest runs whole-fleet');
put('package-lock.json', '{"lockfileVersion":3,"x":1}\n');
assert.deepEqual(changed(resolveChanged(state(), m0)), { sizes: 'all:a1,a2,b1', other: 'all:a1,a2,b1' }, 'a lockfile change marks everything');
put('package-lock.json', '{"lockfileVersion":3}\n');
const otherOptions = computeState({ root, steps: baseSteps(), env: { NODE_OPTIONS: '--experimental-strip-types' }, rows: rowsData(), cacheDir, config });
assert.equal(resolveChanged(otherOptions, m0).sizes.mode, 'all', 'a non-heap NODE_OPTIONS flag marks everything');
const bigHeap = computeState({ root, steps: baseSteps(), env: { NODE_OPTIONS: '--max-old-space-size=8192' }, rows: rowsData(), cacheDir, config });
assert.equal(resolveChanged(bigHeap, m0).sizes.mode, 'none', 'a heap size flag is not keyed');
const universes = rowsData(); universes.roster.saved = ['a1', 'a2'];
assert.match(state({ rows: universes }).globalReasons.join(), /different ids/, 'id lists that disagree fail closed');
const rowErrors = rowsData({ errors: ['sizes: unreadable'] });
assert.equal(resolveChanged(state({ rows: rowErrors }), m0).sizes.mode, 'all', 'an unreadable table fails closed');

// 10. Undeclared dynamic reads fail closed: a directory read in a tool, a computed import in a builder.
put('tools/helper.mjs', "import { readdirSync } from 'node:fs';\nexport const round = (x) => readdirSync(String(x)).length;\n");
result = resolveChanged(state(), m0);
assert.equal(result.sizes.mode, 'all');
assert.match(result.sizes.reasons['*'].join(), /undeclared dynamic read in tools\/helper\.mjs/);
assert.equal(result.other.mode, 'none', 'the other step does not reach the helper');
// A declaration pinned to other call sites does not cover a changed one.
const declared = { ...config, declared: { 'tools/helper.mjs': { pin: '0000000000000000', reads: [] } } };
assert.match(resolveChanged(state({ cfg: declared }), m0).sizes.reasons['*'].join(), /declaration pin stale for tools\/helper\.mjs/);
// A file read at a computed path is a dynamic read too (a literal path is a named input); `world.spawn` is not.
put('tools/helper.mjs', "import { readFileSync } from 'node:fs';\nexport const round = (file) => readFileSync(file).length;\n");
assert.match(resolveChanged(state(), m0).sizes.reasons['*'].join(), /undeclared dynamic read in tools\/helper\.mjs/);
put('tools/helper.mjs', "import { readFileSync } from 'node:fs';\nexport const round = () => readFileSync('tools/data.json').length;\nexport const go = (world) => world.spawn(1);\n");
put('tools/data.json', '{"a":1}\n');
const literal = state();
assert.ok(literal.steps.sizes.decomposed, 'a literal read and a non-child-process spawn need no declaration');
assert.ok(literal.steps.sizes.toolFiles.includes('tools/data.json'), 'a literal read is a named input of the step');
put('tools/helper.mjs', 'export const round = (x) => Math.round(x);\n');
put('src/vehicles/profiles/beta.ts', "export const BETA = { b1: 2 };\nexport const load = (name) => import(name);\n");
result = resolveChanged(state(), m0);
assert.equal(result.sizes.mode, 'all');
assert.equal(result.other.mode, 'all');
assert.match(result.sizes.reasons['*'].join(), /fleet: undeclared dynamic read in src\/vehicles\/profiles\/beta\.ts/);
put('src/vehicles/profiles/beta.ts', "import { readFileSync } from 'node:fs';\nexport const BETA = { b1: readFileSync('x').length };\n");
assert.match(state().globalReasons.join(), /beta\.ts can read files/, 'a fleet module that reads files ends the mention rule');
put('src/vehicles/profiles/beta.ts', beta);

// 11. Recording a scoped run keeps every other id's keys.
const after = state();
const manifest = bootstrap(after);
const before = JSON.stringify(manifest.keys.sizes.a1);
recordStep(manifest, 'sizes', ['b1'], { b1: 'newin' }, after);
assert.equal(JSON.stringify(manifest.keys.sizes.a1), before);
assert.equal(manifest.keys.sizes.b1.in, 'newin');

// 12. Files a step writes beside its tables (`writes`: icon images) are not inputs of its own key, though its tool names
// their directory; to every other step they stay inputs. Paths read only in modes the chain never runs (`modeOnly`) drop out.
put('tools/gen-other.mjs', "import { createTank } from '../src/vehicles/tankFactory.ts';\nexport const OUT = 'public/out';\nexport default createTank;\n");
put('public/out/a1.webp', 'image-1');
const writer = () => { const steps = baseSteps(); steps[1].writes = ['public/out/**']; return steps; };
const m3 = bootstrap(state({ steps: writer() }));
put('public/out/a1.webp', 'image-2');
assert.equal(resolveChanged(state({ steps: writer() }), m3).other.mode, 'none', 'rewriting its own images leaves the step resolved');
assert.equal(resolveChanged(state(), bootstrap(state())).other.mode, 'none');
const unwritten = bootstrap(state());
put('public/out/a1.webp', 'image-3');
assert.equal(resolveChanged(state(), unwritten).other.mode, 'all', 'without `writes` the named directory is an input');
const modeOnly = { ...config, declared: { 'tools/gen-other.mjs': { pin: '', reads: [], modeOnly: ['public/out'] } } };
const m4 = bootstrap(state({ cfg: modeOnly }));
put('public/out/a1.webp', 'image-4');
assert.equal(resolveChanged(state({ cfg: modeOnly }), m4).other.mode, 'none', 'a modeOnly path is not an input');
put('tools/gen-other.mjs', "import { createTank } from '../src/vehicles/tankFactory.ts';\nexport default createTank;\n");

console.log('changed-only resolver.selftest: PASS');
