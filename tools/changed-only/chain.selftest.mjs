// The real changed-only chain (tools/tank-regen-changed.mjs) end to end on a fixture fleet: three generators that build
// tanks and read each other's tables through the build, as controls, fills and seats do. Proves, with real child
// processes, manifests and merges:
//   - a full bootstrap reaches a fixpoint (the final resolve is empty) and a second run changes nothing;
//   - after a shared-kit edit the changed-only chain runs only the ids built on the kit, in order (controls, then fills,
//     then seats), and leaves every output and the manifest byte-identical to a whole-fleet regen of the same edit;
//   - --verify checks exactly the ids each step ran;
//   - an output row edited by hand is found and regenerated;
//   - the world step (per map, after the tank steps) re-runs only the maps whose wreck donors or config moved, and its
//     shards and index match the whole-world regen byte for byte;
//   - (266) with no fingerprints table, or one recorded on another toolchain, a plain run refuses (exit 2, nothing run);
//     --ids runs every step on exactly those ids (the world step on the maps casting them), records their rows only
//     when the table exists, and refuses an unknown or repeated id; --help prints the usage.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { dynamicSites, h16 } from './graph.mjs';
import { FLEET_API_TOKENS } from './steps.mjs';
import { tokenPin } from './world.mjs';

const repo = resolve(import.meta.dirname, '../..');
const base = mkdtempSync(join(tmpdir(), 'cot-changed-only-chain-'));
const cacheDir = join(base, 'graph-cache');
const B = join(base, 'B');
const put = (root, rel, text) => { mkdirSync(dirname(join(root, rel)), { recursive: true }); writeFileSync(join(root, rel), text); };
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

// The fleet: alpha builds a1, a2 from profiles/alpha.ts on the shared profiles/turretKit.ts; beta builds b1, b2 (b2's
// spec names a1 as its visual base, so b2 follows alpha's builders too). Builds read the controls and fills tables.
put(B, 'package-lock.json', '{"lockfileVersion":3}\n');
put(B, 'node_modules/.package-lock.json', '{}\n');
put(B, 'src/vehicles/specs.ts', [
  "export const ALL_TANK_IDS = ['a1', 'a2', 'b1', 'b2'];",
  'export const SAVED_TANK_IDS = ALL_TANK_IDS;',
  'export const DEVELOPMENT_TANK_IDS = [];',
  "export const TANK_SPECS = { a1: { id: 'a1' }, a2: { id: 'a2' }, b1: { id: 'b1' }, b2: { id: 'b2', visualBase: 'a1' } };", ''].join('\n'));
put(B, 'src/vehicles/fleetRegistration.ts', "import './specs.ts';\n");
put(B, 'src/vehicles/fleetManifest.ts', "export const FLEET_GROUP_BY_ID = { a1: 'alpha', a2: 'alpha', b1: 'beta', b2: 'beta' };\n");
put(B, 'src/vehicles/tankIdAliases.ts', 'export const TANK_ID_RENAMES = {};\nexport const TANK_ID_SCHEMA = 1;\n');
put(B, 'src/vehicles/kit.ts', 'export const KIT = 2;\n');
put(B, 'src/vehicles/profiles/turretKit.ts', 'export const TURRET = 1;\n');
put(B, 'src/vehicles/profiles/alpha.ts', "import { TURRET } from './turretKit.ts';\nexport const ALPHA = { a1: 10 + TURRET, a2: 20 + TURRET };\n");
put(B, 'src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 30, b2: 41 };\n');
put(B, 'src/vehicles/profiledProcedurals.ts', "import { ALPHA } from './profiles/alpha.ts';\nimport { BETA } from './profiles/beta.ts';\nexport const P = { ...ALPHA, ...BETA };\n");
put(B, 'src/vehicles/tankFactoryCore.ts', [
  "import { KIT } from './kit.ts';",
  "import { CONTROLS } from './controls.generated.ts';",
  "import { FILLS } from './fills.generated.ts';",
  'export const build = (id, base) => ({ id, base: base * KIT, guns: CONTROLS[id]?.guns ?? 0, fill: FILLS[id]?.fill ?? 0 });', ''].join('\n'));
put(B, 'src/vehicles/tankFactory.ts', "import './fleetRegistration.ts';\nimport { P } from './profiledProcedurals.ts';\nimport { build } from './tankFactoryCore.ts';\nexport const createTank = (id) => build(id, P[id]);\n");
put(B, 'src/vehicles/fleetFactory.ts', "import './fleetRegistration.ts';\nconst GROUP_LOADERS = Object.freeze({\n  alpha: () => import('./profiles/alpha.ts'),\n  beta: () => import('./profiles/beta.ts'),\n});\nexport { GROUP_LOADERS };\n");

// Generators: each rebuilds the listed ids (all without --ids), keeps every other row, writes rows in roster order, and
// with --check compares instead of writing. controls ignores the fills its build reads, so the chain's second pass
// re-runs it for the ids whose fills moved and gets the same rows: the fixpoint the real chain relies on.
const generator = (table, exportName, formula) => [
  "import { readFileSync, writeFileSync } from 'node:fs';",
  "import { createTank } from '../src/vehicles/tankFactory.ts';",
  "import { ALL_TANK_IDS } from '../src/vehicles/specs.ts';",
  'const args = process.argv.slice(2);',
  "const idsArg = args.find((arg) => arg.startsWith('--ids='))?.slice(6) ?? '';",
  "const scoped = idsArg && idsArg !== 'all' ? new Set(idsArg.split(',')) : null;",
  `const head = 'export const ${exportName} = ';`,
  `const text = readFileSync('src/vehicles/${table}.generated.ts', 'utf8');`,
  'const previous = JSON.parse(text.slice(head.length, -2));',
  'const rows = {};',
  'for (const id of ALL_TANK_IDS) {',
  '  if (scoped && !scoped.has(id) && previous[id]) { rows[id] = previous[id]; continue; }',
  '  const tank = createTank(id);',
  `  rows[id] = ${formula};`,
  '}',
  'const out = `${head}${JSON.stringify(rows)};\\n`;',
  "if (args.includes('--check')) { if (out !== text) { console.error('stale'); process.exitCode = 1; } }",
  `else writeFileSync('src/vehicles/${table}.generated.ts', out);`, ''].join('\n');
put(B, 'tools/gen-controls.mjs', generator('controls', 'CONTROLS', '{ guns: tank.base % 7 }'));
put(B, 'tools/gen-fills.mjs', generator('fills', 'FILLS', '{ fill: tank.base * 2 + tank.guns }'));
put(B, 'tools/gen-seats.mjs', generator('seats', 'SEATS', '{ seat: tank.fill + tank.guns + 1 }'));
for (const [table, exportName] of [['controls', 'CONTROLS'], ['fills', 'FILLS'], ['seats', 'SEATS']]) {
  put(B, `src/vehicles/${table}.generated.ts`, `export const ${exportName} = {};\n`);
}

// The world: two maps whose configs name their wreck donors (alpha bakes a1, beta bakes b1); a collision-style generator
// writes one shard per map and the index of their checksums (kept for the maps it does not rebuild), as
// tools/capture-world-collision-manifests.mjs does.
put(B, 'src/world/maps/shared.ts', 'export const GROUND = 5;\n');
put(B, 'src/world/maps/alphaMap.ts', "import { GROUND } from './shared.ts';\nexport default { base: GROUND + 1, props: { tankWrecks: { ids: ['a1'] } } };\n");
put(B, 'src/world/maps/betaMap.ts', "export default { base: 7, props: { tankWrecks: { ids: ['b1'] } } };\n");
put(B, 'src/world/maps/index.ts', [
  "import alpha from './alphaMap.ts';",
  "import beta from './betaMap.ts';",
  'const CONFIGS = { alpha, beta };',
  "export const MAP_IDS = ['alpha', 'beta'];",
  'export const getMapConfig = (id) => CONFIGS[id];', ''].join('\n'));
const worldTool = [
  "import { createHash } from 'node:crypto';",
  "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  "import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';",
  "import { createTank } from '../src/vehicles/tankFactory.ts';",
  'const args = process.argv.slice(2);',
  "const mapsArg = args.find((arg) => arg.startsWith('--maps='))?.slice(7);",
  "const maps = mapsArg ? mapsArg.split(',') : MAP_IDS;",
  "const dir = 'server/world-collision-manifests';",
  'mkdirSync(dir, { recursive: true });',
  "const previous = existsSync(`${dir}/index.json`) ? JSON.parse(readFileSync(`${dir}/index.json`, 'utf8')).maps : {};",
  'const entries = {};',
  'let stale = 0;',
  'for (const map of MAP_IDS) {',
  '  if (!maps.includes(map)) { entries[map] = previous[map]; continue; }',
  '  const config = getMapConfig(map);',
  '  const text = JSON.stringify({ value: config.base + config.props.tankWrecks.ids.reduce((sum, id) => sum + createTank(id).base, 0) });',
  "  entries[map] = { bytes: text.length, sha256: createHash('sha256').update(text).digest('hex') };",
  "  if (args.includes('--check')) { if (previous[map]?.sha256 !== entries[map].sha256) stale++; }",
  '  else writeFileSync(`${dir}/${map}.json`, text);',
  '}',
  "if (args.includes('--check')) process.exitCode = stale ? 1 : 0;",
  "else writeFileSync(`${dir}/index.json`, `${JSON.stringify({ version: 2, maps: entries }, null, 1)}\\n`);", ''].join('\n');
put(B, 'tools/gen-world.mjs', worldTool);

// The fixture step table (tools/changed-only/table.mjs), kept outside every closure the resolver walks.
const tableModule = join(base, 'table.mjs');
writeFileSync(tableModule, [
  'export const TABLES = {',
  "  controls: { kind: 'module', files: ['src/vehicles/controls.generated.ts'], exportName: 'CONTROLS' },",
  "  fills: { kind: 'module', files: ['src/vehicles/fills.generated.ts'], exportName: 'FILLS' },",
  "  seats: { kind: 'module', files: ['src/vehicles/seats.generated.ts'], exportName: 'SEATS' },",
  '};',
  'export const CONFIG = { tables: TABLES, aggregates: [],',
  "  fleetEntries: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/specs.ts', 'src/vehicles/fleetRegistration.ts'],",
  "  loaderFiles: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/profiledProcedurals.ts'],",
  // The world tool reads its own outputs at computed paths (the index, to keep the maps it does not rebuild): declared.
  `  groupLoadersFile: 'src/vehicles/fleetFactory.ts', declared: { 'tools/gen-world.mjs': { pin: '${h16(dynamicSites(worldTool, 'gen-world.mjs').join('\n'))}', reads: [] } }, accessors: {},`,
  "  world: { registryFile: 'src/world/maps/index.ts', outputs: ['server/world-collision-manifests'],",
  `    fleetApiUsers: { 'tools/gen-world.mjs': { pin: '${tokenPin(worldTool, FLEET_API_TOKENS)}' } }, fleetApiTokens: ${JSON.stringify(FLEET_API_TOKENS)} } };`,
  "export const MAP_REGISTRY_FILE = 'src/world/maps/index.ts';",
  "export const WORLD_TABLES = { collision: { kind: 'collision', file: 'server/world-collision-manifests/index.json', path: ['maps'], shard: '{map}.json' } };",
  "export const WORLD_STEPS = [{ name: 'collision', universe: 'maps', device: 'cpu', tool: 'tools/gen-world.mjs', flags: [], full: [],",
  "  scoped: (list) => [`--maps=${list.join(',')}`], check: ['--check'], checkScoped: (list) => ['--check', `--maps=${list.join(',')}`],",
  "  outputs: ['collision'], files: ['server/world-collision-manifests/index.json'], donors: 'plan', gb: 0.1, timeoutS: 120, perIdS: 1 }];",
  "const ids = (list) => `--ids=${list.join(',')}`;",
  'const step = (name) => ({ name, device: \'cpu\', tool: `tools/gen-${name}.mjs`, flags: [], full: [], scoped: (list) => [ids(list)],',
  "  check: ['--check'], checkScoped: (list) => ['--check', ids(list)], outputs: [name], files: [], gb: 0.1, timeoutS: 120, perIdS: 1 });",
  // Listed out of dependency order on purpose: the chain must follow CPU_FIXPOINT_STEPS, not alphabetical order.
  "export const STEPS = [step('controls'), step('fills'), step('seats')];", ''].join('\n'));

// A pristine copy before any chain ran: no fingerprints table, empty generated tables (main before 265's bootstrap).
const N = join(base, 'N');
cpSync(B, N, { recursive: true });
const env = { ...process.env, COT_CHANGED_ONLY_CACHE_DIR: cacheDir, NODE_OPTIONS: '' };
const summaries = (root) => {
  const dir = join(root, '.qa-dev/changed-only');
  return existsSync(dir) ? readdirSync(dir).filter((name) => /^\d{4}-.*Z\.json$/.test(name)).sort() : [];
};
/** Run the chain in `root`; returns its summary (the newest .qa-dev/changed-only/<stamp>.json it wrote). */
function chain(root, ...flags) {
  const before = new Set(summaries(root));
  try {
    execFileSync(process.execPath, [join(repo, 'tools/tank-regen-changed.mjs'), `--root=${root}`, `--table=${tableModule}`,
      '--no-gpu', '--jobs=1', ...flags], { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
  } catch (error) {
    throw new Error(`chain ${flags.join(' ')} failed in ${root}:\n${error.stdout}\n${error.stderr}`);
  }
  const written = summaries(root).filter((name) => !before.has(name));
  assert.equal(written.length, 1, 'one summary per chain run');
  return JSON.parse(readFileSync(join(root, '.qa-dev/changed-only', written[0]), 'utf8'));
}
const OUTPUTS = ['src/vehicles/controls.generated.ts', 'src/vehicles/fills.generated.ts', 'src/vehicles/seats.generated.ts',
  'server/world-collision-manifests/index.json', 'server/world-collision-manifests/alpha.json',
  'server/world-collision-manifests/beta.json', 'release/fingerprints.tsv'];
const snapshot = (root) => Object.fromEntries(OUTPUTS.map((rel) => [rel, read(root, rel)]));
const ranIds = (summary, name) => summary.runs.filter((run) => run.step === name).flatMap((run) => run.ids);

// 1. Bootstrap: every step on the whole fleet, then to a fixpoint; --verify re-checks every step.
const boot = chain(B, '--all', '--verify');
assert.equal(boot.ok, true);
for (const [name, entry] of Object.entries(boot.final)) assert.equal(entry.mode, 'none', `bootstrap leaves ${name} resolved`);
assert.deepEqual(boot.verify.map((entry) => `${entry.step}:${entry.check}`), ['controls:pass', 'fills:pass', 'seats:pass', 'collision:pass']);
assert.equal(boot.final.collision.mode, 'none', 'the world step is recorded too');
assert.ok(boot.passes >= 2, 'controls re-keyed after the fills it reads moved (a second pass)');
assert.match(read(B, 'src/vehicles/seats.generated.ts'), /"a1":\{"seat":/);

// 2. Unchanged: nothing runs and nothing is rewritten.
const quiet = snapshot(B);
const noop = chain(B);
assert.deepEqual(noop.runs, [], 'an unchanged tree runs no generator');
assert.deepEqual(snapshot(B), quiet, 'an unchanged tree is left byte-identical');

// 3. A shared-kit edit: the changed-only tree C against a whole-fleet regen F of the same edit.
const C = join(base, 'C'), F = join(base, 'F');
cpSync(B, C, { recursive: true });
cpSync(B, F, { recursive: true });
for (const root of [C, F]) put(root, 'src/vehicles/profiles/turretKit.ts', 'export const TURRET = 3;\n');
const changedRun = chain(C, '--verify');
const fullRun = chain(F, '--all');
assert.deepEqual(snapshot(C), snapshot(F), 'changed-only outputs and manifest are byte-identical to a whole-fleet regen');
assert.notDeepEqual(snapshot(C), quiet, 'the edit moved rows');
for (const name of ['controls', 'fills', 'seats']) {
  const ids = new Set(ranIds(changedRun, name));
  assert.ok(!ids.has('*') && !ids.has('b1'), `${name}: b1 (built without the kit) is skipped, ran ${[...ids]}`);
  assert.ok(ids.has('a1') && ids.has('a2') && ids.has('b2'), `${name}: the kit's ids and b2 (visual base a1) run, ran ${[...ids]}`);
}
assert.ok(ranIds(fullRun, 'controls').includes('*'), 'the whole-fleet run is the oracle');
const order = changedRun.runs.map((run) => run.step);
assert.ok(order.indexOf('controls') < order.indexOf('fills') && order.indexOf('fills') < order.indexOf('seats'),
  `seats run after fills and controls: ${order}`);
assert.deepEqual(ranIds(changedRun, 'collision'), ['alpha'], 'only the map whose donor (a1) is built on the kit is rebuilt');
assert.ok(order.indexOf('collision') > order.indexOf('seats'), 'the world step runs after the tank steps');
assert.ok(ranIds(fullRun, 'collision').includes('*'), 'the whole-world run is the oracle');
assert.deepEqual(changedRun.verify.map((entry) => `${entry.step}:${entry.check}:${entry.ids.join(',')}`),
  ['controls:pass:a1,a2,b2', 'fills:pass:a1,a2,b2', 'seats:pass:a1,a2,b2', 'collision:pass:alpha'], '--verify checks exactly the ids each step ran');

// 4. An output row edited by hand is found and regenerated; the tree returns to the full regen's bytes.
const seats = read(C, 'src/vehicles/seats.generated.ts');
put(C, 'src/vehicles/seats.generated.ts', seats.replace(/"b1":\{"seat":\d+\}/, '"b1":{"seat":-1}'));
const repair = chain(C);
assert.deepEqual(ranIds(repair, 'seats'), ['b1'], 'the hand-edited row is the only one regenerated');
assert.deepEqual(snapshot(C), snapshot(F), 'the repair restores the full regen bytes');

// 5. A map config edit rebuilds that map alone (no tank step runs); the whole-world regen agrees byte for byte.
for (const root of [C, F]) put(root, 'src/world/maps/betaMap.ts', "export default { base: 8, props: { tankWrecks: { ids: ['b1'] } } };\n");
const mapRun = chain(C);
assert.deepEqual(mapRun.runs.map((run) => `${run.step}[${run.ids.join(',')}]`), ['collision[beta]'], 'a map config edit runs that map only');
chain(F, '--all', '--steps=collision');
assert.deepEqual(snapshot(C), snapshot(F), 'the map edit leaves the changed-only tree equal to the whole-world regen');

/** A chain run expected to refuse: exit 2 and no generator; returns its output. */
function refused(root, ...flags) {
  const before = summaries(root).length;
  try {
    execFileSync(process.execPath, [join(repo, 'tools/tank-regen-changed.mjs'), `--root=${root}`, `--table=${tableModule}`, '--no-gpu', '--jobs=1', ...flags],
      { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 });
  } catch (error) {
    assert.equal(error.status, 2, `${flags.join(' ')} refuses with exit 2:\n${error.stderr}`);
    const written = summaries(root).slice(before);
    for (const name of written) assert.deepEqual(JSON.parse(read(root, `.qa-dev/changed-only/${name}`)).runs, [], 'a refusal runs no generator');
    return `${error.stdout}${error.stderr}`;
  }
  assert.fail(`${flags.join(' ') || 'a plain run'} in ${root} should have refused`);
}
const rowOf = (root, table, id) => JSON.parse(read(root, `src/vehicles/${table}.generated.ts`).replace(/^export const \w+ = /, '').replace(/;\n$/, ''))[id];

// 6. No fingerprints table (main before the 265 bootstrap): a plain run, a dry run and --verify refuse; --help prints usage.
assert.ok(!existsSync(join(N, 'release/fingerprints.tsv')));
for (const flags of [[], ['--dry-run'], ['--verify']]) {
  assert.match(refused(N, ...flags), /no fingerprints table: pass --ids=<ids> for a lane-scoped regen, or --all to bootstrap/);
}
assert.deepEqual(summaries(N), [], 'the table refusals write nothing at all');
const help = execFileSync(process.execPath, [join(repo, 'tools/tank-regen-changed.mjs'), '--help'], { cwd: N, env, encoding: 'utf8' });
assert.match(help, /--ids=a,b/); assert.match(help, /--all/); assert.match(help, /refuses/);
assert.match(refused(N, '--ids=a1,a1'), /lists a1 2 times/, 'a repeated id is refused');
assert.match(refused(N, '--ids=zz'), /roster does not hold: zz/, 'an unknown id is refused before any step runs');
assert.match(refused(N, '--ids=b1', '--all'), /drop --all/);

// 7. --ids with no table: every step on exactly b1, the world step on the map casting it; nothing recorded.
const lone = chain(N, '--ids=b1');
for (const name of ['controls', 'fills', 'seats']) assert.deepEqual(ranIds(lone, name), ['b1'], `${name} ran b1 alone`);
assert.deepEqual(ranIds(lone, 'collision'), ['beta'], 'the world step ran the map whose wrecks cast b1');
assert.ok(!existsSync(join(N, 'release/fingerprints.tsv')), 'no table: none created, no rows recorded');
for (const table of ['controls', 'fills', 'seats']) {
  // (the fixture generators fill an absent row even under --ids; the chain asked for b1 alone, as ranIds shows)
  assert.deepEqual(rowOf(N, table, 'b1'), rowOf(B, table, 'b1'), `${table}: b1's row equals the bootstrapped tree's`);
}
assert.equal(read(N, 'server/world-collision-manifests/beta.json'), read(B, 'server/world-collision-manifests/beta.json'));
assert.ok(!existsSync(join(N, 'server/world-collision-manifests/alpha.json')), 'the map that does not cast b1 is untouched');

// 8. A table recorded on another toolchain marks every id: a plain run refuses and names this run's parts; --ids runs.
const T = join(base, 'T');
cpSync(B, T, { recursive: true });
put(T, 'release/fingerprints.tsv', read(T, 'release/fingerprints.tsv').replace(/^toolchain\t\w+$/m, 'toolchain\t0123456789abcdef'));
assert.match(refused(T), /recorded on another toolchain \(0123456789abcdef; this run \w+: schema:1, node:v\d+/);
assert.deepEqual(ranIds(chain(T, '--ids=b1'), 'seats'), ['b1'], '--ids is not blocked by the toolchain');

// 9. With a table: --ids runs exactly those ids and records their rows; the plain chain then finds only the rest, and the
// tree ends equal to a whole-fleet regen of the same edit. Negative control: the plain chain on a tree with a current
// table is not refused.
const S = join(base, 'S'), G = join(base, 'G');
cpSync(B, S, { recursive: true });
cpSync(B, G, { recursive: true });
for (const root of [S, G]) put(root, 'src/vehicles/profiles/alpha.ts', "import { TURRET } from './turretKit.ts';\nexport const ALPHA = { a1: 12 + TURRET, a2: 21 + TURRET };\n");
const first = chain(S, '--ids=a1');
for (const name of ['controls', 'fills', 'seats']) assert.deepEqual([...new Set(ranIds(first, name))], ['a1'], `${name} ran a1 alone (a later pass re-runs it when the fills it reads moved)`);
assert.deepEqual(ranIds(first, 'collision'), ['alpha'], 'the world step ran the map casting a1');
const rest = chain(S);
for (const name of ['controls', 'fills', 'seats']) {
  const ids = ranIds(rest, name);
  assert.ok(!ids.includes('a1') && ids.includes('a2') && ids.includes('b2'), `${name}: a1's rows were recorded, the rest ran (${ids})`);
}
chain(G, '--all');
assert.deepEqual(snapshot(S), snapshot(G), '--ids then changed-only equals a whole-fleet regen, manifest included');
assert.deepEqual(chain(S).runs, [], 'a current table: the plain chain runs nothing and is not refused');

// 10. Bootstrapping the pristine tree lifts the refusal (negative control for 6).
chain(N, '--all');
assert.deepEqual(chain(N).runs, [], 'after --all the plain chain resolves clean');

const runsOf = (summary) => summary.runs.map((run) => `${run.step}[${run.ids.join(',')}]`).join(' ');
console.log(`changed-only chain.selftest: PASS (bootstrap ${boot.passes} passes; kit edit: ${runsOf(changedRun)}; fixture ${base})`);
