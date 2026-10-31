// The receipt tiers (tools/selftest-tiers.mjs, 266): the registry splits cleanly, the must-keep invariants stay in the
// default tier, nothing but test:heavy runs a manual suite, lane mode and the recommender select what they claim, and a
// broken selector or recommender is caught (negative controls). No tank or map is built; the real closure control
// reads this receipt's own imports.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SELFTEST_SUITES } from './selftest-suites.mjs';
import { MANUAL_SUITES, MANUAL_SUITE_NAMES, MERGED_RECEIPTS, MUST_KEEP, RETIRED_RECEIPTS, STALE_GUARDS, defaultTierFiles,
  manualSuiteFiles, manualSuiteOf, namedIds, parseSuiteNames } from './selftest-tiers.mjs';
import { selftestCommand, selftestReadOf, SELFTEST_DECLARED_INPUTS, SELFTEST_FIXTURE_KEYED_FILES, SELFTEST_FRESH_FILES } from './run-selftests.mjs';
import { createSelftestCache, REPO_ROOT } from './selftest-cache.mjs';
import { laneControl, selectLane } from './test-lane.mjs';
import { recommend, reportLines, tierList } from './test-recommend.mjs';
import { balanceChanges, changedMaps, changedTankIds, createReadIndex, laneReadOf } from './test-diff.mjs';
import { ENTRY_HTML, readsOnPurpose } from './test-recommend.mjs';
import { SELFTEST_BROAD_DIRS } from './selftest-cache.mjs';
import { idScopedSelection } from './test-heavy.mjs';
import { simulateWall } from './test-audit.mjs';
import { WORLD_STEPS } from './changed-only/steps.mjs';

const registered = Object.values(SELFTEST_SUITES).flat();

// ---- the split: every manual entry is a registered receipt in exactly one suite; must-keep and retired hold
const owner = new Map();
for (const [name, suite] of Object.entries(MANUAL_SUITES)) {
  assert.ok(suite.files.length && suite.about, `${name}: a suite has receipts and says what it covers`);
  for (const file of suite.files) {
    assert.ok(registered.includes(file), `${name}: ${file} is not a registered receipt (a stale tier entry: drop it with its receipt)`);
    assert.ok(!owner.has(file), `${file} is in both ${owner.get(file)} and ${name}`);
    owner.set(file, name);
  }
  for (const [command, tool] of suite.commands) assert.ok(command === 'node' && existsSync(tool), `${name}: its command runs ${tool}`);
}
assert.deepEqual(MANUAL_SUITE_NAMES.filter((name) => MANUAL_SUITES[name].idScoped), ['tanks'], 'tanks is the one id-scoped suite');
for (const file of Object.keys(MUST_KEEP)) {
  assert.equal(manualSuiteOf(file), null, `${file} is a must-keep invariant: it never leaves the default tier`);
  assert.ok(!RETIRED_RECEIPTS[file] && !MERGED_RECEIPTS[file], `${file} is must-keep: never retired or merged`);
}
for (const file of ['tools/driver-boundaries.selftest.mjs', 'src/sim/driverStepParity.selftest.mjs', 'tools/changed-only/fresh.selftest.mjs',
  'tools/sim-determinism-audit.selftest.mjs', 'server/match/frameView.selftest.mjs', 'tools/i18n-page-catalogs.selftest.mjs', 'tools/attribution-audit.mjs']) {
  assert.equal(manualSuiteOf(file), null, `${file} stays in the default tier`);
}
for (const [file, entry] of Object.entries(RETIRED_RECEIPTS)) {
  assert.ok(!registered.includes(file) && !existsSync(file), `${file} is retired: not registered, not on disk (git history keeps it)`);
  assert.ok(entry.reason && entry.coverage, `${file}: a retirement records its reason and where its coverage lives`);
}
for (const [file, guard] of Object.entries(STALE_GUARDS)) {
  const suite = Object.values(MANUAL_SUITES).find((entry) => entry.files.includes(file) || entry.commands.some((command) => command[1] === file));
  assert.ok(suite && guard.keeps, `${file}: a stale-output guard belongs to a manual suite and names what it keeps fresh`);
  for (const step of guard.worldSteps ?? []) assert.ok(WORLD_STEPS.some((entry) => entry.name === step), `${file}: ${step} is a changed-only world step`);
  assert.ok(guard.worldSteps?.length || guard.tanks, `${file}: a guard fires on maps or on tanks`);
}
assert.ok(STALE_GUARDS['server/collisionManifestDrift.selftest.mjs'].worldSteps.includes('collision'),
  'Main 266: the recommender names collisionManifestDrift on any map, world-core, fleet-core or donor change');

// ---- a default-tier cost guard: a receipt the committed snapshot times at a minute or more is either a must-keep
// invariant or belongs in a manual suite; the default tier stays inside the owner's budget
const snapshot = JSON.parse(readFileSync(new URL('./selftest-durations.json', import.meta.url), 'utf8')).runMs;
const defaults = defaultTierFiles(registered);
const heavyDefaults = defaults.filter((file) => (snapshot[file] ?? 0) >= 60_000 && !MUST_KEEP[file]);
assert.deepEqual(heavyDefaults, [], `default-tier receipts timed at a minute or more must be must-keep or join a manual suite: ${heavyDefaults.join(', ')}`);
const defaultMinutes = defaults.reduce((sum, file) => sum + (snapshot[file] ?? 0), 0) / 60_000;
assert.ok(defaultMinutes <= 140, `the default tier holds ${defaultMinutes.toFixed(1)} snapshot CPU-min (budget 140, about 15 % of 916)`);

// ---- callers: npm test and the release gate run the default tier; nothing but test:heavy (and tank:release:check's
// id-scoped tanks step) runs a manual suite; CI and hooks never do
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(pkg.scripts.test, 'node tools/run-selftests.mjs all');
assert.equal(pkg.scripts['test:heavy'], 'node tools/test-heavy.mjs');
assert.equal(pkg.scripts['test:recommend'], 'node tools/test-recommend.mjs');
assert.equal(pkg.scripts['test:lane'], 'node tools/test-lane.mjs');
for (const [name, script] of Object.entries(pkg.scripts)) {
  if (name === 'test:heavy') continue;
  assert.ok(!script.includes('test-heavy') && !script.includes('--heavy') && !script.includes('test:heavy'), `npm script ${name} runs no manual suite`);
}
for (const file of ['tools/gate.mjs', 'tools/release.mjs', 'vercel.json']) {
  const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  assert.ok(!text.includes('test-heavy') && !text.includes('--heavy') && !text.includes('test:heavy'), `${file} runs no manual suite`);
}
const workflows = new URL('../.github/workflows/', import.meta.url);
for (const name of existsSync(workflows) ? readdirSync(workflows) : []) {
  const text = readFileSync(new URL(name, workflows), 'utf8');
  assert.ok(!/test-heavy|test:heavy|--heavy|run-selftests/.test(text), `.github/workflows/${name} runs no receipt suite`);
}
for (const hooks of ['.husky', '.githooks']) assert.ok(!existsSync(new URL(`../${hooks}`, import.meta.url)), `no ${hooks}: no hook runs receipts`);
const plan = readFileSync(new URL('./tank-release-plan.mjs', import.meta.url), 'utf8');
assert.deepEqual([...plan.matchAll(/'tools\/test-heavy\.mjs'[^\]]*\]/g)].map((match) => match[0]), ["'tools/test-heavy.mjs','tanks',selected]"],
  'tank:release:check runs only the id-scoped tanks form, on its own ids');
assert.match(readFileSync(new URL('./test-heavy.mjs', import.meta.url), 'utf8'), /if \(process\.env\.CI\)/, 'test:heavy refuses a CI environment');
assert.deepEqual(MANUAL_SUITES.fleet.commands.map((command) => command.join(' ')),
  pkg.scripts['tank:anatomy:check'].split(' && ').filter((step) => step !== 'node src/vehicles/fleetPassDefault.selftest.mjs'),
  'the fleet suite runs npm run tank:anatomy:check, its fleetPassDefault as a receipt of the suite');
assert.ok(MANUAL_SUITES.fleet.files.includes('src/vehicles/fleetPassDefault.selftest.mjs'));

// ---- the runner: the default tier by default, manual suites by name, a manual --only says where it lives
assert.deepEqual(selftestCommand([]).files, defaults, 'npm test runs the default tier');
assert.deepEqual(selftestCommand(['all', '--heavy=world']).files, manualSuiteFiles(registered, ['world']));
assert.deepEqual(selftestCommand(['all', '--heavy=all']).files.length, owner.size);
assert.throws(() => selftestCommand(['--only=src/world/scenery.selftest.mjs']), /matched no default-tier receipt; it matches 1 in world \(npm run test:heavy -- world\)/);
assert.throws(() => selftestCommand(['--heavy=world', '--only=tools/selftest-tiers.selftest.mjs']), /matches 1 in default \(drop --heavy\)/);
assert.throws(() => parseSuiteNames('nope'), /unknown manual suite "nope"/);
assert.deepEqual(parseSuiteNames('all'), [...MANUAL_SUITE_NAMES]);
assert.equal(selftestCommand(['--write-durations']).files.length, registered.length, 'run times are recorded for every tier');
assert.deepEqual([...namedIds(`x('t90a'); "m1a2" t55a 'not_an_id'`, new Set(['t90a', 'm1a2', 't55a']))], ['t90a', 'm1a2']);

// ---- lane mode on fixtures: what reads a change runs, a broad match and other manual suites never do, the fleet core
// alone runs no tank pin (Main 266: a one-line tankFactoryCore edit never runs all 428)
const fixture = {
  'r/default-reader': { 'src/a.ts': 'named' }, 'r/default-lister': { 'src/b/c.ts': 'scan' }, 'r/default-broad': { 'src/a.ts': 'broad' },
  'r/pin-own': { 'src/vehicles/profiles/leo.ts': 'named', 'src/vehicles/tankFactoryCore.ts': 'named' },
  'r/pin-core': { 'src/vehicles/tankFactoryCore.ts': 'named' }, 'r/pin-named': { 'src/vehicles/tankFactoryCore.ts': 'named' },
  'r/world-reader': { 'src/a.ts': 'named' },
};
const readOf = (file, path) => fixture[file]?.[path] ?? null;
const lane = (changed, naming = new Map()) => selectLane({ defaults: ['r/default-reader', 'r/default-lister', 'r/default-broad'],
  tanks: ['r/pin-own', 'r/pin-core', 'r/pin-named'], changed, readOf, core: new Set(['src/vehicles/tankFactoryCore.ts']), naming });
{
  const { selected, coreOnly } = lane(['src/a.ts', 'src/b/c.ts']);
  assert.deepEqual([...selected.keys()], ['r/default-reader', 'r/default-lister'], 'a closure read and a listing select; a broad match does not');
  assert.deepEqual(selected.get('r/default-reader'), { tier: 'default', reasons: ['reads src/a.ts'] });
  assert.deepEqual(selected.get('r/default-lister').reasons, ['lists src/b/c.ts']);
  assert.equal(selected.has('r/world-reader'), false, 'a manual suite outside tanks never runs in lane mode');
  assert.equal(coreOnly.size, 0);
  const core = lane(['src/vehicles/tankFactoryCore.ts']);
  assert.deepEqual([...core.selected.keys()], [], 'a fleet-core edit selects no tank pin');
  assert.deepEqual([...core.coreOnly.keys()], ['r/pin-own', 'r/pin-core', 'r/pin-named'], '...it reports them for test:recommend');
  const own = lane(['src/vehicles/profiles/leo.ts', 'src/vehicles/tankFactoryCore.ts'], new Map([['r/pin-named', ['leo2a4']]]));
  assert.deepEqual([...own.selected].map(([file, entry]) => [file, entry.tier, entry.reasons]),
    [['r/pin-own', 'tanks', ['reads src/vehicles/profiles/leo.ts']], ['r/pin-named', 'tanks', ['names leo2a4 (changed)']]],
    'a pin reading a changed group file or naming a changed id runs; one reading only the core does not');
  assert.deepEqual([...own.coreOnly.keys()], ['r/pin-core']);
  // a lane whose pins come to more than a quarter of the suite's CPU (a whole-fleet regeneration) runs none of them
  const costly = selectLane({ defaults: [], tanks: ['r/pin-own', 'r/pin-core', 'r/pin-named'], changed: ['src/vehicles/profiles/leo.ts'], readOf,
    core: new Set(['src/vehicles/tankFactoryCore.ts']), naming: new Map([['r/pin-named', ['leo2a4']]]), pinCostOf: () => 60_000 });
  assert.deepEqual([[...costly.selected.keys()], [...costly.deferred.keys()]], [[], ['r/pin-own', 'r/pin-named']],
    'two of three pins are over the quarter share: deferred to the owner');
  const cheap = selectLane({ defaults: [], tanks: ['r/pin-own', 'r/pin-core', 'r/pin-named', 'r/a', 'r/b', 'r/c', 'r/d', 'r/e'],
    changed: ['src/vehicles/profiles/leo.ts'], readOf, core: new Set(['src/vehicles/tankFactoryCore.ts']), pinCostOf: () => 60_000 });
  assert.deepEqual([[...cheap.selected.keys()], cheap.deferred.size], [['r/pin-own'], 0], 'one pin of eight runs');
  const edited = selectLane({ defaults: [], tanks: ['r/pin-own', 'r/pin-core', 'r/pin-named'], changed: ['src/vehicles/profiles/leo.ts', 'r/pin-named'],
    readOf: (file, path) => (file === path ? 'named' : readOf(file, path)), core: new Set(), pinCostOf: () => 60_000 });
  assert.deepEqual([[...edited.selected.keys()], [...edited.deferred.keys()]], [['r/pin-named'], ['r/pin-own']],
    'past the share, a pin the lane edited itself still runs (the centurion-family-262 proof caught it)');
  // negative control: a receipt that reads a file must be selected when it changes, and a changed receipt must be selected
  const closures = { 'r/default-reader': ['src/a.ts'], 'r/default-lister': [], 'r/default-broad': [] };
  const control = (select, changed = []) => laneControl({ defaults: ['r/default-reader', 'r/default-lister', 'r/default-broad'], tanks: [],
    changed, selected: select(changed), readOf, root: '/x', closureOf: (file) => new Set((closures[file] ?? []).map((path) => `/x/${path}`)) });
  assert.deepEqual(control((changed) => lane(changed).selected).failures, [], 'the control holds for the real selector');
  assert.deepEqual(control((changed) => lane(changed).selected).probe, { receipt: 'r/default-reader', input: 'src/a.ts' });
  const missed = control(() => new Map(), ['r/default-broad']);
  assert.deepEqual(missed.failures, ['r/default-broad changed and is a receipt, but was not selected'],
    'a selection that drops a changed receipt fails the control');
  const blind = laneControl({ defaults: ['r/default-reader'], tanks: [], changed: [], selected: new Map(), readOf: () => null, root: '/x',
    closureOf: () => new Set(['/x/src/a.ts']) });
  assert.deepEqual(blind.failures, ['no probe receipt with a named source input'], 'a selector that reads nothing fails the control');
}

// ---- a spawned tool's reads count: a receipt that runs a tool as a child sees only the tool's file in its closure
{
  const root = '/r', abs = (path) => `/r/${path}`;
  const fake = { closureOf() {}, runSetOf: (file) => (file === abs('t/spawner.selftest.mjs') ? [abs('t/spawner.selftest.mjs')] : [file]),
    metadataOf: (file) => ({ spawns: file === abs('t/spawner.selftest.mjs') }), runEdgesOf: () => [abs('t/tool.mjs')] };
  const reads = { 't/tool.mjs': { 'src/vehicles/specs.ts': 'named' }, 't/spawner.selftest.mjs': { 'src/vehicles/specs.ts': 'broad' } };
  const read = laneReadOf(fake, (file, path) => reads[file]?.[path] ?? null, root);
  assert.equal(read('t/spawner.selftest.mjs', 'src/vehicles/specs.ts'), 'named', 'a read of the tool it spawns selects the spawner');
  assert.equal(read('t/spawner.selftest.mjs', 'docs/x.md'), null);
  assert.equal(laneReadOf({ ...fake, metadataOf: () => ({ spawns: false }) }, (file, path) => reads[file]?.[path] ?? null, root)
    ('t/spawner.selftest.mjs', 'src/vehicles/specs.ts'), 'broad', 'without a spawn, a broad match stays broad (negative control)');
  // 266: a path its latest PASS read or listed (tools/selftest-observe.mjs) selects it, whatever the closure says
  const observedOf = (file) => (file === 't/spawner.selftest.mjs' ? { reads: new Set(['src/ui/hud.ts']), lists: new Set(['site']) } : null);
  const seen = laneReadOf({ ...fake, metadataOf: () => ({ spawns: false }), observedOf }, (file, path) => reads[file]?.[path] ?? null, root);
  assert.equal(seen('t/spawner.selftest.mjs', 'src/ui/hud.ts'), 'observed', 'a computed read its run made selects it');
  assert.equal(seen('t/spawner.selftest.mjs', 'site/new-page.html'), 'observed', 'a file in a directory its run listed selects it');
  assert.equal(seen('t/spawner.selftest.mjs', 'docs/x.md'), null, 'negative control: a path it was never seen reading');
  assert.ok(selectLane({ defaults: ['t/spawner.selftest.mjs'], tanks: [], changed: ['src/ui/hud.ts'], readOf: seen })
    .selected.get('t/spawner.selftest.mjs').reasons[0].includes('was seen reading src/ui/hud.ts'), 'its reason says so');
}

// ---- the real closure: this receipt reads tools/test-diff.mjs through its imports, so a change to it selects it
{
  const cache = createSelftestCache({ alwaysRun: SELFTEST_FRESH_FILES, fixtureKeyed: SELFTEST_FIXTURE_KEYED_FILES, declaredInputs: SELFTEST_DECLARED_INPUTS });
  const real = (file, path) => selftestReadOf(cache, file, path, REPO_ROOT);
  const self = 'tools/selftest-tiers.selftest.mjs';
  assert.ok(['named', 'scan'].includes(real(self, 'tools/test-diff.mjs')), 'this receipt reads tools/test-diff.mjs');
  assert.ok(selectLane({ defaults: [self], tanks: [], changed: ['tools/test-diff.mjs'], readOf: real }).selected.has(self));
  // the read index equals selftestReadOf on the real cache (receipts with listings, broad closures and plain imports; files,
  // directories, deleted paths and paths outside every closure)
  const files = ['tools/selftest-tiers.selftest.mjs', 'src/ui/i18n.selftest.mjs', 'src/sim/movement.selftest.mjs', 'tools/tank-id-rekey-assets.selftest.mjs',
    'src/vehicles/profiles/type99Armor.selftest.mjs', 'server/collisionManifestDrift.selftest.mjs', 'tools/run-selftests.selftest.mjs'];
  const paths = ['tools/test-diff.mjs', 'src/sim/movement.ts', 'src/vehicles/tankFactoryCore.ts', 'index.html', 'src/ui/i18nCatalog.en-US.json',
    'docs/DEPLOYS.md', 'public/icons/tank-assets.json', 'src/world/maps/verdant.ts', 'gone/deleted.ts', 'src/vehicles/profiles', 'package.json'];
  const index = createReadIndex(cache, REPO_ROOT, paths, SELFTEST_BROAD_DIRS);
  for (const file of files) for (const path of paths) {
    assert.equal(index.readOf(file, path), selftestReadOf(cache, file, path, REPO_ROOT), `read index == selftestReadOf for ${file} x ${path}`);
  }
  // (its own closure is broad: the changed-only step table names whole directories as data, so almost any change selects it)
  assert.equal(selectLane({ defaults: [self], tanks: [], changed: ['nowhere/never.ts'], readOf: real }).selected.has(self), false,
    'a path outside its closure does not select it');
}

// ---- changed ids and maps on a fixture partition (the changed-only fleet and world partitions in reverse)
{
  const partition = { ids: ['leo2a4', 'leo2a5', 't90a'], core: new Set(['src/vehicles/tankFactoryCore.ts']),
    groups: { leopard: ['src/vehicles/profiles/leopard.ts'], t90: ['src/vehicles/profiles/t90.ts'] },
    groupChain: (id) => (id.startsWith('leo') ? ['leopard'] : ['t90']), fileIds: { 'src/vehicles/table.generated.ts': ['leo2a4', 't90a'] } };
  const moved = changedTankIds(partition, ['src/vehicles/profiles/leopard.ts', 'src/vehicles/tankFactoryCore.ts', 'public/icons/tanks/t90a.json',
    'src/vehicles/table.generated.ts', 'docs/DEPLOYS.md']);
  assert.deepEqual(moved.core, ['src/vehicles/tankFactoryCore.ts'], 'a core file marks no id: it is reported apart');
  assert.deepEqual([...moved.ids.keys()].sort(), ['leo2a4', 'leo2a5', 't90a']);
  assert.deepEqual(moved.ids.get('leo2a5'), ['src/vehicles/profiles/leopard.ts (group leopard)']);
  assert.deepEqual(moved.ids.get('t90a'), ['public/icons/tanks/t90a.json', 'src/vehicles/table.generated.ts (rows unresolved)'],
    'a path naming the id, and a table file with no diff to read (all its ids)');
  assert.equal(changedTankIds(partition, ['docs/DEPLOYS.md']).ids.size, 0, 'a docs edit moves no tank');
  const world = { maps: ['verdant', 'desert'], donorsOf: (step, map) => (map === 'desert' ? ['t90a'] : []),
    steps: { collision: { core: new Set(['tools/capture-world-collision-manifests.mjs']), maps: { verdant: new Set(['src/world/maps/verdant.ts']), desert: new Set() } } } };
  assert.deepEqual([...changedMaps(world, ['src/world/maps/verdant.ts']).collision.keys()], ['verdant'], 'a map file moves its map');
  assert.deepEqual([...changedMaps(world, [], { ids: new Map([['t90a', []]]) }).collision], [['desert', ['donor t90a']]], 'a donor moves the maps casting it');
  assert.deepEqual([...changedMaps(world, [], { core: ['src/vehicles/tankFactoryCore.ts'] }).collision.keys()], ['verdant', 'desert'], 'the fleet core moves every map');
  assert.equal(changedMaps(world, ['docs/DEPLOYS.md']).collision.size, 0, 'a docs edit moves no map');
}

// ---- balance inputs: only a moved balance field marks an id, with its tier
{
  const row = (armour, gun = 'g') => ({ tier: 8, digests: { armour, gun, hp: 'h', mobility: 'm', size: 's', role: 'r' } });
  assert.deepEqual(balanceChanges({ leo2a4: row('a'), t90a: row('a') }, { leo2a4: row('b'), t90a: row('a') }), [{ id: 'leo2a4', tier: 8, classes: ['armour'] }]);
  assert.deepEqual(balanceChanges({ leo2a4: row('a') }, { leo2a4: row('a') }), [], 'unchanged specs change nothing');
  assert.equal(tierList([9, 8, 8]), 'VIII-IX');
  assert.equal(tierList([5, 8, 9, 10]), 'V, VIII-X');
}

// ---- the recommender: one plain line per warranted suite with its command; a docs diff warrants nothing; a moved
// balance field, a map, the fleet core each warrant their suites; ids alone never warrant the whole tanks suite
{
  const none = new Map();
  const quiet = recommend({ readers: none, balance: [], wallMs: {} });
  assert.deepEqual(quiet.filter((row) => row.warranted), [], 'nothing read, nothing moved: no suite');
  assert.deepEqual(reportLines(quiet), [`Not warranted: ${MANUAL_SUITE_NAMES.join(', ')}.`]);
  const balanceRead = new Map([['balance', new Map([['src/vehicles/balanceMatchups.selftest.mjs', ['src/vehicles/specs.ts']]])]]);
  const spec = recommend({ readers: balanceRead, wallMs: { balance: 40_000 },
    balance: [{ id: 'leo2a4', tier: 8, classes: ['armour', 'hp'] }, { id: 'm1a2', tier: 9, classes: ['gun'] }] });
  const lines = reportLines(spec);
  assert.equal(lines[0], 'balance (~1 min): 2 tanks changed armour/HP/gun in tiers VIII-IX (leo2a4, m1a2); 1 of its 4 checks read the change (src/vehicles/specs.ts)');
  assert.equal(lines[1], '  npm run test:heavy -- balance');
  const added = recommend({ readers: none, wallMs: {}, balance: [{ id: 'centurion13', tier: 2, classes: ['new'] }, { id: 'strv81', tier: 3, classes: ['size'] }] });
  assert.match(added.find((row) => row.suite === 'balance').line, /^balance: 1 new tank, 1 tank changed size in tiers II-III \(centurion13, strv81\)$/);
  const few = recommend({ readers: new Map([['fleet', new Map([['src/vehicles/fleetLazy.selftest.mjs', ['src/ui/hudAmmunitionPresentation.ts']]])]]),
    wallMs: { fleet: 6_000_000 }, subsetWallMs: () => 72_000 });
  assert.deepEqual([few.find((row) => row.suite === 'fleet').line, few.find((row) => row.suite === 'fleet').run],
    ['fleet (~1 min): 1 of its 66 checks read the change (src/ui/hudAmmunitionPresentation.ts)', 'npm run test:heavy -- fleet --only=src/vehicles/fleetLazy.selftest.mjs'],
    'a few readers: the command and its time name just them');
  const broken = recommend({ readers: none, balance: [{ id: 'leo2a4', tier: 8, classes: ['armour'] }], suites: { balance: { ...MANUAL_SUITES.balance } }, guards: {} });
  assert.equal(broken[0].warranted, true, 'a moved armour value alone warrants balance, even with no closure read');
  const maps = recommend({ readers: none, maps: { collision: new Map([['verdant', ['src/world/maps/verdant.ts']]]) }, wallMs: {} });
  assert.match(maps.find((row) => row.suite === 'world').line, /^world: the collision shards \(the multiplayer host plays on them\) may be stale on 1 map \(verdant\)$/);
  const core = recommend({ readers: new Map([['tanks', new Map([['x', ['src/vehicles/tankFactoryCore.ts']]])]]), core: ['src/vehicles/tankFactoryCore.ts'], wallMs: {} });
  assert.deepEqual(core.filter((row) => row.warranted).map((row) => row.suite), ['fleet', 'tanks'], 'the fleet core warrants fleet and the whole tanks suite');
  const many = recommend({ readers: none, ids: new Map([['leo2a4', ['x']], ['t90a', ['y']]]), idPinsDeferred: 400, wallMs: {} });
  assert.equal(many.find((row) => row.suite === 'tanks').line, 'tanks: 2 tanks changed (leo2a4, t90a): their 400 pins are more than lane mode runs');
  assert.equal(many.find((row) => row.suite === 'tanks').warranted, true);
  const ids = recommend({ readers: none, ids: new Map([['leo2a4', ['x']]]), idPins: 3, wallMs: {} });
  assert.equal(ids.find((row) => row.suite === 'tanks').warranted, false, 'changed ids alone: lane mode runs their pins');
  assert.equal(ids.find((row) => row.suite === 'tanks').run, 'npm run test:heavy -- tanks --ids=leo2a4');
  assert.deepEqual(ids.filter((row) => row.warranted).map((row) => row.suite), ['fleet'], '...and the fleet ledgers may be stale');
}

// ---- entry pages: a root *.html counts as a heavy-suite trigger only for a receipt naming that page
assert.ok(ENTRY_HTML.test('index.html') && ENTRY_HTML.test('404.html') && !ENTRY_HTML.test('src/ui/page.html'));
assert.equal(readsOnPurpose('index.html', "import { build } from 'vite';"), false, 'a receipt reaching index.html through vite does not read it on purpose');
assert.equal(readsOnPurpose('index.html', "readFileSync('index.html', 'utf8')"), true, 'one that names the page does');
assert.equal(readsOnPurpose('src/world/terrain.ts', ''), true, 'any other path counts as the closure says');

// ---- the id-scoped selection and the wall replay
{
  const texts = { a: "build('leo2a4')", b: 'x', c: 'y' };
  const picked = idScopedSelection(['a', 'b', 'c'], ['leo2a4'], { textOf: (file) => texts[file], groupFilesOf: () => ['src/vehicles/profiles/leopard.ts'],
    readsAny: (file, paths) => (file === 'b' ? paths[0] : null) });
  assert.deepEqual([...picked], [['a', 'names leo2a4'], ['b', 'reads src/vehicles/profiles/leopard.ts']]);
  const wall = simulateWall(['p1', 'p2', 'p3'], (file) => ({ p1: 60_000, p2: 30_000, p3: 30_000 })[file], { workers: 2 });
  assert.deepEqual([wall.wallMs, wall.cpuMs], [60_000, 120_000], 'longest-first on two workers');
}

console.log(`selftest-tiers.selftest: ${defaults.length} default-tier receipts (${defaultMinutes.toFixed(1)} snapshot CPU-min), `
  + `${owner.size} in ${MANUAL_SUITE_NAMES.length} manual suites, ${Object.keys(RETIRED_RECEIPTS).length} retired; callers, lane mode and the recommender hold`);
