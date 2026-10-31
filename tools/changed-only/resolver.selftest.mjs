// The changed-only resolver on a fixture fleet (no tank builds): unchanged ids are skipped; a shared builder marks
// every id that uses it; tool code, flags, the toolchain, the roster and undeclared dynamic reads mark everything they
// affect; an output edited outside the chain is caught by its row or its file. First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { computeState, emptyManifest, parseManifest, recordStep, refreshComponents, resolveChanged, serializeManifest }
  from './fingerprint.mjs';
import { createGraph } from './graph.mjs';
import { SPEC_COMBAT, SPEC_REST } from './steps.mjs';
import { tokenPin } from './world.mjs';

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

// 11. Test-only files never key a build (266): a fleet record naming its receipt (as docs/references/concepts/*.json do)
// keeps the record keyed and the receipt out, so an edit to the receipt or to the test runner marks no id. Negative
// controls: an edit to the record itself, or to the kit beside it, still marks every id.
put('src/vehicles/kit.ts', "export const RECORD = 'docs/references/concepts/alpha.json';\nexport const KIT = { wheel: 0.4 };\n");
put('docs/references/concepts/alpha.json', `${JSON.stringify({ id: 'a1', receipt: 'src/vehicles/profiles/alpha.selftest.mjs' })}\n`);
put('src/vehicles/profiles/alpha.selftest.mjs', "import './alpha.ts';\nconsole.log('alpha');\n");
put('tools/run-selftests.mjs', 'export const RUNNER = 1;\n');
const s5 = state(), m5 = bootstrap(s5);
assert.ok(s5.partition.core.includes('docs/references/concepts/alpha.json'), 'the record a core module names is a core input');
assert.ok(!s5.partition.core.includes('src/vehicles/profiles/alpha.selftest.mjs'), 'the receipt it names is not');
put('src/vehicles/profiles/alpha.selftest.mjs', "import './alpha.ts';\nconsole.log('alpha, edited');\n");
put('tools/run-selftests.mjs', 'export const RUNNER = 2;\n');
assert.deepEqual(changed(resolveChanged(state(), m5)), { sizes: 'none:', other: 'none:' }, 'a receipt or test-runner edit marks no id');
put('docs/references/concepts/alpha.json', `${JSON.stringify({ id: 'a1', receipt: 'src/vehicles/profiles/alpha.selftest.mjs', note: 'x' })}\n`);
assert.deepEqual(changed(resolveChanged(state(), m5)), { sizes: 'all:a1,a2,b1', other: 'all:a1,a2,b1' }, 'the record itself still keys the core');
put('docs/references/concepts/alpha.json', `${JSON.stringify({ id: 'a1', receipt: 'src/vehicles/profiles/alpha.selftest.mjs' })}\n`);
put('src/vehicles/kit.ts', "export const RECORD = 'docs/references/concepts/alpha.json';\nexport const KIT = { wheel: 0.45 };\n");
assert.deepEqual(changed(resolveChanged(state(), m5)), { sizes: 'all:a1,a2,b1', other: 'all:a1,a2,b1' }, 'a kit edit still marks every id');
put('src/vehicles/kit.ts', 'export const KIT = { wheel: 0.4 };\n');

// 265: a key the committed manifest holds reads the same in every checkout. A route in the app (`/docs/${topic}`) names
// no directory, so docs/ edits never re-key the GPU steps (the same string in a tool still does); a file under
// public/models/ (gitignored whole) is a row by its path, the same with any bytes or none.
{
  const tree = mkdtempSync(join(tmpdir(), 'cot-changed-only-local-'));
  const add = (rel, text) => { mkdirSync(dirname(join(tree, rel)), { recursive: true }); writeFileSync(join(tree, rel), text); };
  add('src/ui/routes.ts', "export const route = (topic) => [`/docs/${topic}`, 'docs.html'];\n");
  add('docs.html', '<!doctype html>\n');
  add('docs/ledger.json', '{}\n');
  add('tools/source.mjs', "export const SOURCE = 'public/models/x_source.glb';\nexport const page = (topic) => `/docs/${topic}`;\n");
  const mentions = (file) => [...createGraph({ root: tree, cacheDir: mkdtempSync(join(tmpdir(), 'cot-changed-only-cache-')) })
    .edges(join(tree, file)).mention].map((target) => target.slice(tree.length + 1)).sort();
  assert.deepEqual(mentions('src/ui/routes.ts'), ['docs.html'], 'an app route names its page, not the docs directory');
  assert.deepEqual(mentions('tools/source.mjs'), ['docs', 'public/models/x_source.glb'], 'a tool that names a directory keeps it');
  const rows = () => {
    const graph = createGraph({ root: tree, cacheDir: mkdtempSync(join(tmpdir(), 'cot-changed-only-cache-')) });
    return graph.rowsOf(graph.edges(join(tree, 'tools/source.mjs')).mention).filter((row) => !row.startsWith('dir:docs:'));
  };
  const absent = rows();
  assert.deepEqual(absent, ['local:public/models/x_source.glb'], 'a public/models file is keyed by its path');
  add('public/models/x_source.glb', 'glb-1');
  assert.deepEqual(rows(), absent, 'present, the same row');
  add('public/models/x_source.glb', 'glb-2');
  assert.deepEqual(rows(), absent, 'other bytes, the same row');
}

// 13. Route strings are no input (266): a module that only names the public pages (src/ui/localeRouting.ts's route
// table) declares them `namesOnly`, so a document-head edit marks no id. Controls: undeclared, the mention keys the step
// (466cea1178 marked centering, icons and every map's world steps that way); a tool that reads a page itself still keys it.
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const genSizes = read('tools/gen-sizes.mjs'), genOther = read('tools/gen-other.mjs');
put('src/ui/routes.ts', "export const ROUTES = [{ path: '/', file: 'index.html' }, { path: '/404', file: '404.html' }];\n");
put('index.html', '<!doctype html><html><head><title>t</title></head><body></body></html>\n');
put('404.html', '<!doctype html><html><head><title>404</title></head></html>\n');
put('tools/gen-other.mjs', "import { createTank } from '../src/vehicles/tankFactory.ts';\nimport { ROUTES } from '../src/ui/routes.ts';\nexport default [createTank, ROUTES];\n");
const routes = { ...config, declared: { 'src/ui/routes.ts': { pin: '', reads: [], namesOnly: ['*.html'] } } };
const head = (title) => put('index.html', `<!doctype html><html><head><title>${title}</title><meta name="og" content="x"></head><body></body></html>\n`);
const m6 = bootstrap(state({ cfg: routes })), m7 = bootstrap(state());
assert.ok(!state({ cfg: routes }).steps.other.toolFiles.includes('index.html') && state().steps.other.toolFiles.includes('index.html'));
head('t2');
assert.deepEqual(changed(resolveChanged(state({ cfg: routes }), m6)), { sizes: 'none:', other: 'none:' }, 'a document-head edit marks no id');
assert.equal(resolveChanged(state(), m7).other.mode, 'all', 'control: undeclared, the route string keys the step');
put('tools/gen-sizes.mjs', "import { readFileSync } from 'node:fs';\nimport { createTank } from '../src/vehicles/tankFactory.ts';\nimport { round } from './helper.mjs';\nexport const PAGE = readFileSync('index.html', 'utf8');\nexport default [createTank, round];\n");
const m8 = bootstrap(state({ cfg: routes }));
head('t3');
assert.deepEqual(changed(resolveChanged(state({ cfg: routes }), m8)), { sizes: 'all:a1,a2,b1', other: 'none:' }, 'control: a tool reading the page itself keeps it keyed');
put('tools/gen-sizes.mjs', genSizes);
put('tools/gen-other.mjs', genOther);

// 14. The balance pass is keyed per id through the spec rows, not the core (266, Main: a balance merge re-keyed every
// step on every id). Its registration import leaves it out of the core; a lever on one id's combat leaves marks that id on
// the steps that read them (rowReads SPEC_COMBAT) alone, a lever on any other field marks it on every step. Controls: the
// same edit through the core (no balance declaration), a second importer and a stale importer pin each mark every id.
const registration = read('src/vehicles/fleetRegistration.ts');
put('src/vehicles/balance.ts', 'export const applyBalance = (ids) => ids.length;\n');
put('src/vehicles/fleetRegistration.ts', "import { ALL_TANK_IDS } from './specs.ts';\nimport { applyBalance } from './balance.ts';\napplyBalance(ALL_TANK_IDS);\n");
const tokens = ['balance.ts', 'applyBalance'];
const balanced = { ...config, balance: { entries: ['src/vehicles/balance.ts'], tokens, combat: ['hp'],
  importers: { 'src/vehicles/fleetRegistration.ts': { pin: tokenPin(read('src/vehicles/fleetRegistration.ts'), tokens) } } } };
const readers = () => { const steps = baseSteps(); steps[1].rowReads = [SPEC_COMBAT]; return steps; };
const specRows = (moved = {}) => { const rows = rowsData(); rows.rows[SPEC_COMBAT] = { a1: 'c1', a2: 'c2', b1: 'c3', ...moved.combat };
  rows.rows[SPEC_REST] = { a1: 'x1', a2: 'x2', b1: 'x3', ...moved.rest }; return rows; };
const lever = (rows, cfg = balanced) => changed(resolveChanged(state({ steps: readers(), rows, cfg }), bootstrap(state({ steps: readers(), rows: specRows(), cfg }))));
const s9 = state({ steps: readers(), rows: specRows(), cfg: balanced });
assert.deepEqual([s9.partition.balance, s9.partition.balanceReason, s9.partition.core.includes('src/vehicles/balance.ts')],
  [['src/vehicles/balance.ts'], null, false], 'the registration import leaves the pass out of the core');
assert.deepEqual([s9.steps.sizes.rowTables, s9.steps.other.rowTables], [['anchors', SPEC_REST], ['anchors', SPEC_COMBAT, SPEC_REST]]);
put('src/vehicles/balance.ts', 'export const applyBalance = (ids) => ids.length + 1;\n'); // the lever's own edit: no key reads the file
assert.deepEqual(lever(specRows({ combat: { a2: 'c2b' } })), { sizes: 'none:', other: 'ids:a2' }, 'a combat lever marks its id on the reader alone');
assert.ok(resolveChanged(state({ steps: readers(), rows: specRows({ combat: { a2: 'c2b' } }), cfg: balanced }),
  bootstrap(s9)).other.reasons.a2.includes(`row ${SPEC_COMBAT}[a2]`));
assert.deepEqual(lever(specRows({ rest: { a2: 'x2b' } })), { sizes: 'ids:a2', other: 'ids:a2' }, 'negative control: a non-combat lever marks its id on every step');
assert.deepEqual(lever(specRows()), { sizes: 'none:', other: 'none:' }, 'an edit that moves no spec marks nothing');
const unbalanced = { ...config, balance: null }, m9 = bootstrap(state({ steps: readers(), rows: specRows(), cfg: unbalanced }));
put('src/vehicles/balance.ts', 'export const applyBalance = (ids) => ids.length + 2;\n');
assert.deepEqual(changed(resolveChanged(state({ steps: readers(), rows: specRows({ combat: { a2: 'c2b' } }), cfg: unbalanced }), m9)),
  { sizes: 'all:a1,a2,b1', other: 'all:a1,a2,b1' }, 'control: through the core, the same lever marks every id on every step');
put('src/vehicles/kit.ts', "import './balance.ts';\nexport const KIT = { wheel: 0.4 };\n");
const imported = state({ steps: readers(), rows: specRows(), cfg: balanced });
assert.deepEqual([imported.partition.balance, imported.partition.balanceReason, imported.partition.core.includes('src/vehicles/balance.ts')],
  [[], 'another fleet module imports it', true], 'control: a second importer keeps the pass in the core');
put('src/vehicles/kit.ts', 'export const KIT = { wheel: 0.4 };\n');
put('src/vehicles/fleetRegistration.ts', "import { ALL_TANK_IDS } from './specs.ts';\nimport { applyBalance } from './balance.ts';\napplyBalance(ALL_TANK_IDS);\nexport const TOTAL = applyBalance(ALL_TANK_IDS);\n");
assert.match(state({ steps: readers(), rows: specRows(), cfg: balanced }).partition.balanceReason, /importer pin stale: src\/vehicles\/fleetRegistration\.ts \(now [0-9a-f]{16}\)/,
  'control: a new use of the pass in its importer keeps it in the core until reviewed');
put('src/vehicles/fleetRegistration.ts', registration);

// 15. A module a table imports (266: auxiliaryRoofGuns.generated.ts decodes its rows with auxiliaryRoofGunsCodec.ts) is
// keyed through the rows it decodes: the partition names it for the runtime traces, outside the core. Controls: one a
// core module imports too is core; one that reads files ends the mention rule like any executed fleet module.
const anchors = read('src/vehicles/anchors.generated.ts');
put('src/vehicles/anchorsCodec.ts', 'export const decode = (rows) => rows;\n');
put('src/vehicles/anchors.generated.ts', "import { decode } from './anchorsCodec.ts';\nexport const ANCHORS = decode({ a1: 1, a2: 2, b1: 3 });\n");
const decoded = state();
assert.deepEqual([decoded.partition.tableImports, decoded.partition.core.includes('src/vehicles/anchorsCodec.ts'), decoded.globalReasons],
  [['src/vehicles/anchorsCodec.ts'], false, []], 'a table\'s decoder is named apart, outside the core');
put('src/vehicles/kit.ts', "import { decode } from './anchorsCodec.ts';\nexport const KIT = decode({ wheel: 0.4 });\n");
assert.deepEqual([state().partition.tableImports, state().partition.core.includes('src/vehicles/anchorsCodec.ts')], [[], true],
  'control: a decoder the core imports is core');
put('src/vehicles/kit.ts', 'export const KIT = { wheel: 0.4 };\n');
put('src/vehicles/anchorsCodec.ts', "import { readFileSync } from 'node:fs';\nexport const decode = (rows) => (readFileSync('x'), rows);\n");
assert.match(state().globalReasons.join(), /anchorsCodec\.ts can read files/, 'control: a decoder that reads files fails closed');
put('src/vehicles/anchors.generated.ts', anchors);

console.log('changed-only resolver.selftest: PASS');
