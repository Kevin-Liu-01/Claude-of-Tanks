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
//   - (266) with no fingerprints table, or one recorded on another toolchain, a plain run refuses (exit 2, nothing run)
//     and names the toolchain part that moved; --ids runs every step on exactly those ids (the world step on the maps
//     casting them), records their rows only when the table exists on this toolchain, and refuses an unknown or repeated
//     id; an install that is not the lock's refuses; --help prints the usage;
//   - (266) a page built from a step's output (steps.mjs DEPENDENTS, the Field Manual prerender after icons) is checked
//     after that step ran and rewritten only when stale; a chain where the step did not run never touches it.
//   - (268) a parts step (steps.mjs `parts`, as fills and anatomy) on eight ids runs as parallel parts and one merge that
//     write what one process writes, manifest included; a part that writes the step's shared table itself fails the step
//     before the merge runs.
//   - (268) an id the tool cannot run here (its oracle absent) is stamped with the reason and reads current until the
//     oracle appears; a stamp never hides an output edited by hand, and a skip without a reason gets none.
//   - (268) a partial chain (--steps) writes only the lines of the steps it ran: a step whose tool moved stays due and
//     reads as its tool.
//   - (268) every fixture chain is bounded by the CPU its process tree spends, never wall time (watchChild), and a
//     tree's CPU keeps what its exited members spent.
// First-party tooling: Kevin B. Liu.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { dynamicSites, h16 } from './graph.mjs';
import { DEPENDENTS, FLEET_API_TOKENS, stepByName } from './steps.mjs';
import { cpuChildCommand } from './childPriority.mjs';
import { psCpuSeconds, treeCpu, watchChild } from './childBudget.mjs';
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
put(B, 'docs/floors.json', '{"schema":1,"tolerance":1,"rows":{"a1":{"f":1,"g":0},"a2":{"f":2,"g":0},"b1":{"f":3,"g":0},"b2":{"f":4,"g":0}}}\n');
put(B, 'src/vehicles/fleetFactory.ts', "import './fleetRegistration.ts';\nconst GROUP_LOADERS = Object.freeze({\n  alpha: () => import('./profiles/alpha.ts'),\n  beta: () => import('./profiles/beta.ts'),\n});\nexport { GROUP_LOADERS };\n");

// Generators: each rebuilds the listed ids (all without --ids), keeps every other row, writes rows in roster order, and
// with --check compares instead of writing. controls ignores the fills its build reads, so the chain's second pass
// re-runs it for the ids whose fills moved and gets the same rows: the fixpoint the real chain relies on.
// seats also takes the chain's --skipped report (267): b1 is measured against its oracle (public/models/b1.glb, as the
// geometry gate's ids), and while that file is absent it keeps its row and is reported in the gate's own words, which the
// fixture step stamps with the gate's own steps.mjs gateStamp (268). COT_FIXTURE_SKIP_NO_REASON is the mutant: the skip
// is reported without a reason.
// fills also runs as parts (268, tools/changed-only/parts.mjs): a part (--out-dir) writes its ids' rows into its dir
// alone, and the merge (--merge-from) takes them in place of building those ids; the run that writes the table appends
// the ids it wrote to --report (the chain gives that flag to the merge alone). COT_FIXTURE_PARTS_RACE is the mutant:
// each part also writes the shared table, as two --ids runs would.
const generator = (table, exportName, formula, { skips = false, parts = false } = {}) => [
  "import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  "import { createTank } from '../src/vehicles/tankFactory.ts';",
  "import { ALL_TANK_IDS } from '../src/vehicles/specs.ts';",
  'const args = process.argv.slice(2);',
  "const idsArg = args.find((arg) => arg.startsWith('--ids='))?.slice(6) ?? '';",
  "const scoped = idsArg && idsArg !== 'all' ? new Set(idsArg.split(',')) : null;",
  `const head = 'export const ${exportName} = ';`,
  `const text = readFileSync('src/vehicles/${table}.generated.ts', 'utf8');`,
  'const previous = JSON.parse(text.slice(head.length, -2));',
  'const rows = {};',
  ...(skips ? ["const ORACLES = { b1: '/models/b1.glb' };", 'const skipped = {};'] : []),
  ...(parts ? ["const partDir = args.find((arg) => arg.startsWith('--out-dir='))?.slice(10);",
    "const merged = Object.assign({}, ...(args.find((arg) => arg.startsWith('--merge-from='))?.slice(13).split(',') ?? [])",
    "  .map((dir) => JSON.parse(readFileSync(`${dir}/rows.json`, 'utf8'))));"] : []),
  'for (const id of ALL_TANK_IDS) {',
  ...(parts ? ['  if (partDir && !scoped.has(id)) continue;', '  if (merged[id]) { rows[id] = merged[id]; continue; }'] : []),
  '  if (scoped && !scoped.has(id) && previous[id]) { rows[id] = previous[id]; continue; }',
  ...(skips ? ['  if (ORACLES[id] && !existsSync(`public${ORACLES[id]}`) && (!scoped || scoped.has(id))) {',
    "    rows[id] = previous[id]; skipped[id] = process.env.COT_FIXTURE_SKIP_NO_REASON ? '' : `oracle absent here (${ORACLES[id]})`; continue;",
    '  }'] : []),
  '  const tank = createTank(id);',
  `  rows[id] = ${formula};`,
  '}',
  ...(skips ? ["const report = args.find((arg) => arg.startsWith('--skipped='))?.slice(10);",
    'if (report) writeFileSync(report, JSON.stringify(skipped));'] : []),
  ...(parts ? ['if (partDir) {', '  mkdirSync(partDir, { recursive: true });', '  writeFileSync(`${partDir}/rows.json`, JSON.stringify(rows));',
    `  if (process.env.COT_FIXTURE_PARTS_RACE) writeFileSync('src/vehicles/${table}.generated.ts', \`\${head}\${JSON.stringify({ ...previous, ...rows })};\\n\`);`,
    '  process.exit(0);', '}',
    "const reportFile = args.find((arg) => arg.startsWith('--report='))?.slice(9);",
    "if (reportFile) appendFileSync(reportFile, `${JSON.stringify(Object.keys(rows))}\\n`);"] : []),
  'const out = `${head}${JSON.stringify(rows)};\\n`;',
  "if (args.includes('--check')) { if (out !== text) { console.error('stale'); process.exitCode = 1; } }",
  `else writeFileSync('src/vehicles/${table}.generated.ts', out);`, ''].join('\n');
put(B, 'tools/gen-controls.mjs', generator('controls', 'CONTROLS', '{ guns: tank.base % 7 }'));
const fillsTool = generator('fills', 'FILLS', '{ fill: tank.base * 2 + tank.guns }', { parts: true });
put(B, 'tools/gen-fills.mjs', fillsTool);
const seatsTool = generator('seats', 'SEATS', '{ seat: tank.fill + tank.guns + 1 }', { skips: true });
put(B, 'tools/gen-seats.mjs', seatsTool);
put(B, 'public/models/b1.glb', 'oracle b1\n');
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
// A page built from the seats table (the Field Manual from the icons manifest): no args checks it (exit 1 when stale),
// --write rewrites it.
put(B, 'tools/gen-docs.mjs', [
  "import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';",
  "const seats = readFileSync('src/vehicles/seats.generated.ts', 'utf8');",
  'const out = `${JSON.stringify({ seats: seats.length, sum: [...seats.matchAll(/"seat":(-?\\d+)/g)].reduce((sum, match) => sum + Number(match[1]), 0) })}\\n`;',
  "if (process.argv.includes('--write')) { mkdirSync('docs', { recursive: true }); writeFileSync('docs/fleet.json', out); }",
  "else if ((existsSync('docs/fleet.json') ? readFileSync('docs/fleet.json', 'utf8') : '') !== out) { console.error('docs: stale'); process.exitCode = 1; }", ''].join('\n'));

// The fixture step table (tools/changed-only/table.mjs), kept outside every closure the resolver walks.
const tableModule = join(base, 'table.mjs');
writeFileSync(tableModule, [
  `import { gateStamp } from ${JSON.stringify(join(repo, 'tools/changed-only/steps.mjs'))};`,
  'export const TABLES = {',
  "  controls: { kind: 'module', files: ['src/vehicles/controls.generated.ts'], exportName: 'CONTROLS' },",
  "  fills: { kind: 'module', files: ['src/vehicles/fills.generated.ts'], exportName: 'FILLS' },",
  "  seats: { kind: 'module', files: ['src/vehicles/seats.generated.ts'], exportName: 'SEATS' },",
  // a ledger seats checks each id against, read per id: its order means nothing (267, TABLES `canonical`)
  "  floors: { kind: 'json', files: ['docs/floors.json'], path: ['rows'], canonical: true },",
  '};',
  'export const CONFIG = { tables: TABLES, aggregates: [],',
  "  fleetEntries: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/specs.ts', 'src/vehicles/fleetRegistration.ts'],",
  "  loaderFiles: ['src/vehicles/tankFactory.ts', 'src/vehicles/fleetFactory.ts', 'src/vehicles/profiledProcedurals.ts'],",
  // The world tool reads its own outputs at computed paths (the index, to keep the maps it does not rebuild): declared.
  `  groupLoadersFile: 'src/vehicles/fleetFactory.ts', declared: { 'tools/gen-world.mjs': { pin: '${h16(dynamicSites(worldTool, 'gen-world.mjs').join('\n'))}', reads: [] },`,
  // fills' parts read their scratch dirs (the merge's --merge-from): never the tree.
  `    'tools/gen-fills.mjs': { pin: '${h16(dynamicSites(fillsTool, 'gen-fills.mjs').join('\n'))}', reads: [] },`,
  // seats' oracle is per id (the gate keys each record's oracle; the stamp keys its presence): never a whole-step input
  `    'tools/gen-seats.mjs': { pin: '${h16(dynamicSites(seatsTool, 'gen-seats.mjs').join('\n'))}', reads: [] } }, accessors: {},`,
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
  "export const STEPS = [step('controls'), { ...step('fills'), parts: (dir) => [`--out-dir=${dir}`], report: '--report' },",
  "  { ...step('seats'), skipped: '--skipped', stamp: gateStamp, rowReads: ['floors'] }];",
  "export const DEPENDENTS = [{ name: 'docs', tool: 'tools/gen-docs.mjs', check: [], write: ['--write'], after: ['seats'] }];", ''].join('\n'));

// A pristine copy before any chain ran: no fingerprints table, empty generated tables (main before 265's bootstrap).
const N = join(base, 'N');
cpSync(B, N, { recursive: true });
// (268) And an eight-id fleet for the parts path (the chain splits a parts step of eight ids or more).
const P = join(base, 'P');
cpSync(B, P, { recursive: true });
const EIGHT = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'];
put(P, 'src/vehicles/specs.ts', [
  `export const ALL_TANK_IDS = ${JSON.stringify(EIGHT)};`,
  'export const SAVED_TANK_IDS = ALL_TANK_IDS;',
  'export const DEVELOPMENT_TANK_IDS = [];',
  `export const TANK_SPECS = { ${EIGHT.map((id) => `${id}: { id: '${id}'${id === 'b2' ? ", visualBase: 'a1'" : ''} }`).join(', ')} };`, ''].join('\n'));
put(P, 'src/vehicles/fleetManifest.ts', `export const FLEET_GROUP_BY_ID = { ${EIGHT.map((id) => `${id}: '${id[0] === 'a' ? 'alpha' : 'beta'}'`).join(', ')} };\n`);
put(P, 'src/vehicles/profiles/alpha.ts', "import { TURRET } from './turretKit.ts';\nexport const ALPHA = { a1: 10 + TURRET, a2: 20 + TURRET, a3: 23 + TURRET, a4: 27 + TURRET };\n");
put(P, 'src/vehicles/profiles/beta.ts', 'export const BETA = { b1: 30, b2: 41, b3: 44, b4: 52 };\n');
put(P, 'docs/floors.json', `${JSON.stringify({ schema: 1, tolerance: 1, rows: Object.fromEntries(EIGHT.map((id, i) => [id, { f: i + 1, g: 0 }])) })}\n`);
const env = { ...process.env, COT_CHANGED_ONLY_CACHE_DIR: cacheDir, NODE_OPTIONS: '' };
const summaries = (root) => {
  const dir = join(root, '.qa-dev/changed-only');
  return existsSync(dir) ? readdirSync(dir).filter((name) => /^\d{4}-.*Z\.json$/.test(name)).sort() : [];
};
/** One process per step unless the flags name --jobs (268: the parts path). */
const jobs = (flags) => (flags.some((flag) => flag.startsWith('--jobs=')) ? [] : ['--jobs=1']);
/** A fixture chain's limit: a budget of the CPU its process tree spends (childBudget.mjs watchChild), never wall time
 *  (268: at load 560 a healthy chain overran a 300 s wall limit). A tree with no CPU progress for the hang cap is stopped
 *  as a hang. */
const CHAIN_CPU_S = 300, CHAIN_HANG_S = 600;
/** Run the chain with `args` in `root`; resolves { status, stdout, stderr, verdict } (verdict: why its watch stopped it). */
function runChain(root, args, childEnv = env) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(repo, 'tools/tank-regen-changed.mjs'), `--root=${root}`, `--table=${tableModule}`, ...args],
      { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const watch = watchChild(child.pid, { budgetS: CHAIN_CPU_S, hangS: CHAIN_HANG_S, pollMs: 2000, graceMs: 5000 });
    child.on('close', (status) => { watch.stop(); done({ status, stdout, stderr, verdict: watch.verdict }); });
  });
}
/** Run the chain in `root`; returns its summary (the newest .qa-dev/changed-only/<stamp>.json it wrote). */
const chain = (root, ...flags) => chainWith({}, root, ...flags);
async function chainWith(extraEnv, root, ...flags) {
  const before = new Set(summaries(root));
  const run = await runChain(root, ['--no-gpu', ...jobs(flags), ...flags], { ...env, ...extraEnv });
  if (run.status !== 0) {
    throw new Error(`chain ${flags.join(' ')} failed in ${root}${run.verdict ? ` (${run.verdict.message})` : ''}:\n${run.stdout}\n${run.stderr}`);
  }
  const written = summaries(root).filter((name) => !before.has(name));
  assert.equal(written.length, 1, 'one summary per chain run');
  return JSON.parse(readFileSync(join(root, '.qa-dev/changed-only', written[0]), 'utf8'));
}
const OUTPUTS = ['src/vehicles/controls.generated.ts', 'src/vehicles/fills.generated.ts', 'src/vehicles/seats.generated.ts',
  'server/world-collision-manifests/index.json', 'server/world-collision-manifests/alpha.json',
  'server/world-collision-manifests/beta.json', 'release/fingerprints.tsv', 'docs/fleet.json'];
const snapshot = (root) => Object.fromEntries(OUTPUTS.map((rel) => [rel, read(root, rel)]));
const ranIds = (summary, name) => summary.runs.filter((run) => run.step === name).flatMap((run) => run.ids);

// 1. Bootstrap: every step on the whole fleet, then to a fixpoint; --verify re-checks every step.
const boot = await chain(B, '--all', '--verify');
assert.equal(boot.ok, true);
for (const [name, entry] of Object.entries(boot.final)) assert.equal(entry.mode, 'none', `bootstrap leaves ${name} resolved`);
assert.deepEqual(boot.verify.map((entry) => `${entry.step}:${entry.check}`), ['controls:pass', 'fills:pass', 'seats:pass', 'collision:pass']);
assert.equal(boot.final.collision.mode, 'none', 'the world step is recorded too');
assert.ok(boot.passes >= 2, 'controls re-keyed after the fills it reads moved (a second pass)');
assert.match(read(B, 'src/vehicles/seats.generated.ts'), /"a1":\{"seat":/);
assert.deepEqual(boot.dependents.map((entry) => `${entry.step}:${entry.wrote}`), ['docs:true'], 'seats ran: the page built from it is rewritten');

// 2. Unchanged: nothing runs and nothing is rewritten.
const quiet = snapshot(B);
const noop = await chain(B);
assert.deepEqual(noop.runs, [], 'an unchanged tree runs no generator');
assert.deepEqual(noop.dependents, [], 'nor checks the page built from one (negative control)');
assert.deepEqual(snapshot(B), quiet, 'an unchanged tree is left byte-identical');

// 3. A shared-kit edit: the changed-only tree C against a whole-fleet regen F of the same edit.
const C = join(base, 'C'), F = join(base, 'F');
cpSync(B, C, { recursive: true });
cpSync(B, F, { recursive: true });
for (const root of [C, F]) put(root, 'src/vehicles/profiles/turretKit.ts', 'export const TURRET = 3;\n');
const changedRun = await chain(C, '--verify');
const fullRun = await chain(F, '--all');
assert.deepEqual(snapshot(C), snapshot(F), 'changed-only outputs and manifest are byte-identical to a whole-fleet regen');
assert.deepEqual(changedRun.dependents.map((entry) => `${entry.step}:${entry.wrote}`), ['docs:true'], 'the kit moved seats rows: the page is rewritten');
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
const repair = await chain(C);
assert.deepEqual(ranIds(repair, 'seats'), ['b1'], 'the hand-edited row is the only one regenerated');
assert.deepEqual(repair.dependents.map((entry) => `${entry.step}:${entry.wrote}`), ['docs:false'],
  'seats ran but restored the rows the page was built from: checked, not rewritten');
assert.deepEqual(snapshot(C), snapshot(F), 'the repair restores the full regen bytes');

// 4b (267). A tool that cannot run an id in this tree reports it (steps.mjs `skipped`): the chain records the other ids,
// leaves that one due without failing or re-trying it, and names it in the final resolve; once the tree can run it, the
// next chain runs it alone. (268) Its output was edited by hand, which only a run can repair: the stamp the chain takes
// holds the output its last run left, so the id still reads due.
const oracle = read(C, 'public/models/b1.glb');
put(C, 'src/vehicles/seats.generated.ts', seats.replace(/"b1":\{"seat":\d+\}/, '"b1":{"seat":-1}').replace(/"a2":\{"seat":\d+\}/, '"a2":{"seat":-2}'));
rmSync(join(C, 'public/models/b1.glb'));
const blocked = await chain(C);
assert.equal(blocked.ok, true, 'an id the tool cannot run here does not fail the chain');
assert.deepEqual(ranIds(blocked, 'seats'), ['a2', 'b1'], 'seats ran once on both edited ids: the skipped one is not retried');
assert.deepEqual([blocked.final.seats.mode, Object.keys(blocked.final.seats.notRunHere ?? {}), blocked.final.seats.stamped],
  ['none', ['b1'], undefined], 'the final resolve names the id left due, with its reason: its stamp does not hold over the hand edit');
assert.match(read(C, 'src/vehicles/seats.generated.ts'), /"b1":\{"seat":-1\}/, 'its row is untouched');
put(C, 'public/models/b1.glb', oracle);
const unblocked = await chain(C);
assert.deepEqual(ranIds(unblocked, 'seats'), ['b1'], 'the id left due runs alone once the tree can run it (a2 was recorded)');
assert.deepEqual(snapshot(C), snapshot(F), 'and the tree returns to the full regen bytes');

// 4c (268). Not run by design, told from stale: an id due for its inputs (b1's sim-floor row) whose oracle is absent here is
// stamped with its reason and reads current, so the next chain and the fresh resolve run nothing; dropping the oracle in
// makes it due and the chain runs it alone, clearing the stamp. Mutant: a skip reported without a reason is never stamped
// and stays due.
const floorsBefore = read(C, 'docs/floors.json');
put(C, 'docs/floors.json', floorsBefore.replace('"b1":{"f":3,', '"b1":{"f":3.5,'));
rmSync(join(C, 'public/models/b1.glb'));
const M = join(base, 'M');
cpSync(C, M, { recursive: true });
const unnamed = await chainWith({ COT_FIXTURE_SKIP_NO_REASON: '1' }, M);
assert.deepEqual([unnamed.ok, Object.keys(unnamed.final.seats.notRunHere ?? {}), /^stamp\t/m.test(read(M, 'release/fingerprints.tsv'))],
  [true, ['b1'], false], 'mutant: a skip without a reason gets no stamp');
const unnamedResolve = await chainWith({ COT_FIXTURE_SKIP_NO_REASON: '1' }, M, '--dry-run');
assert.deepEqual([unnamedResolve.final.seats.mode, unnamedResolve.final.seats.ids], ['ids', ['b1']], 'mutant: and stays red');
const stamping = await chain(C);
assert.deepEqual([ranIds(stamping, 'seats'), stamping.final.seats.mode, stamping.final.seats.notRunHere, stamping.final.seats.stamped],
  [['b1'], 'none', undefined, { b1: 'oracle-absent: oracle absent here (/models/b1.glb)' }], 'the absent oracle is stamped with its reason');
assert.deepEqual(stamping.changedIds, [], 'an id the tool did not run is no regenerated id (the release check names none)');
assert.match(read(C, 'release/fingerprints.tsv'), /^stamp\tseats\tb1\t[0-9a-f]{16}\t[0-9a-f]{16}\toracle-absent\tpublic\/models\/b1\.glb\toracle absent here \(\/models\/b1\.glb\)$/m);
const stampedQuiet = snapshot(C);
assert.deepEqual((await chain(C)).runs, [], 'a fixture id with a missing oracle reads current: the next chain runs nothing');
assert.deepEqual(snapshot(C), stampedQuiet, 'and rewrites nothing');
put(C, 'public/models/b1.glb', oracle);
const dropped = await chain(C, '--dry-run');
assert.deepEqual([dropped.final.seats.ids, dropped.final.seats.reasons.b1?.includes('stamp\'s inputs moved (public/models/b1.glb)')], [['b1'], true],
  'dropping the oracle in makes it due, named by the stamp');
const measured = await chain(C);
assert.deepEqual([ranIds(measured, 'seats'), /^stamp\t/m.test(read(C, 'release/fingerprints.tsv'))], [['b1'], false], 'the chain runs it alone and clears the stamp');
put(C, 'docs/floors.json', floorsBefore);
await chain(C);
assert.deepEqual(snapshot(C), snapshot(F), 'restored, the tree returns to the full regen bytes');

// 5. A map config edit rebuilds that map alone (no tank step runs); the whole-world regen agrees byte for byte.
for (const root of [C, F]) put(root, 'src/world/maps/betaMap.ts', "export default { base: 8, props: { tankWrecks: { ids: ['b1'] } } };\n");
const mapRun = await chain(C);
assert.deepEqual(mapRun.runs.map((run) => `${run.step}[${run.ids.join(',')}]`), ['collision[beta]'], 'a map config edit runs that map only');
await chain(F, '--all', '--steps=collision');
assert.deepEqual(snapshot(C), snapshot(F), 'the map edit leaves the changed-only tree equal to the whole-world regen');

// 5b (267). A canonical ledger (TABLES `canonical`, read per id): re-serializing it with rows and keys in another order
// runs nothing; one id's changed row runs that id alone; its frame (a tolerance) runs every id.
const floors = read(C, 'docs/floors.json');
const flip = (value) => (value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.keys(value).reverse().map((key) => [key, flip(value[key])])) : value);
put(C, 'docs/floors.json', `${JSON.stringify(flip(JSON.parse(floors)), null, 2)}\n`);
assert.deepEqual((await chain(C)).runs, [], 'the same ledger in another order runs nothing');
put(C, 'docs/floors.json', floors.replace('"a2":{"f":2,', '"a2":{"f":2.5,'));
assert.deepEqual((await chain(C)).runs.map((run) => `${run.step}[${run.ids.join(',')}]`), ['seats[a2]'], 'one id\'s changed row runs that id alone');
put(C, 'docs/floors.json', floors.replace('"tolerance":1', '"tolerance":2'));
assert.deepEqual(ranIds(await chain(C), 'seats'), ['*'], 'the frame (its tolerance) runs the step on the whole fleet');
put(C, 'docs/floors.json', floors);
await chain(C);
assert.deepEqual(snapshot(C), snapshot(F), 'restored, the tree returns to the full regen bytes');

/** A chain run expected to refuse: exit 2 and no generator; returns its output. */
async function refused(root, ...flags) {
  const before = summaries(root).length;
  const run = await runChain(root, ['--no-gpu', '--jobs=1', ...flags]);
  if (run.status === 0) assert.fail(`${flags.join(' ') || 'a plain run'} in ${root} should have refused`);
  assert.equal(run.status, 2, `${flags.join(' ')} refuses with exit 2${run.verdict ? ` (${run.verdict.message})` : ''}:\n${run.stderr}`);
  const written = summaries(root).slice(before);
  for (const name of written) assert.deepEqual(JSON.parse(read(root, `.qa-dev/changed-only/${name}`)).runs, [], 'a refusal runs no generator');
  return `${run.stdout}${run.stderr}`;
}
const rowOf = (root, table, id) => JSON.parse(read(root, `src/vehicles/${table}.generated.ts`).replace(/^export const \w+ = /, '').replace(/;\n$/, ''))[id];

// 6. No fingerprints table (main before the 265 bootstrap): a plain run, a dry run and --verify refuse; --help prints usage.
assert.ok(!existsSync(join(N, 'release/fingerprints.tsv')));
for (const flags of [[], ['--dry-run'], ['--verify']]) {
  assert.match(await refused(N, ...flags), /no fingerprints table: pass --ids=<ids> for a lane-scoped regen, or --all to bootstrap/);
}
assert.deepEqual(summaries(N), [], 'the table refusals write nothing at all');
const help = execFileSync(process.execPath, [join(repo, 'tools/tank-regen-changed.mjs'), '--help'], { cwd: N, env, encoding: 'utf8' });
assert.match(help, /--ids=a,b/); assert.match(help, /--all/); assert.match(help, /refuses/);
assert.match(await refused(N, '--ids=a1,a1'), /lists a1 2 times/, 'a repeated id is refused');
assert.match(await refused(N, '--ids=zz'), /roster does not hold: zz/, 'an unknown id is refused before any step runs');
assert.match(await refused(N, '--ids=b1', '--all'), /drop --all/);

// 7. --ids with no table: every step on exactly b1, the world step on the map casting it; nothing recorded.
const lone = await chain(N, '--ids=b1');
for (const name of ['controls', 'fills', 'seats']) assert.deepEqual(ranIds(lone, name), ['b1'], `${name} ran b1 alone`);
assert.deepEqual(ranIds(lone, 'collision'), ['beta'], 'the world step ran the map whose wrecks cast b1');
assert.ok(!existsSync(join(N, 'release/fingerprints.tsv')), 'no table: none created, no rows recorded');
for (const table of ['controls', 'fills', 'seats']) {
  // (the fixture generators fill an absent row even under --ids; the chain asked for b1 alone, as ranIds shows)
  assert.deepEqual(rowOf(N, table, 'b1'), rowOf(B, table, 'b1'), `${table}: b1's row equals the bootstrapped tree's`);
}
assert.equal(read(N, 'server/world-collision-manifests/beta.json'), read(B, 'server/world-collision-manifests/beta.json'));
assert.ok(!existsSync(join(N, 'server/world-collision-manifests/alpha.json')), 'the map that does not cast b1 is untouched');

// 8. A table recorded on another toolchain marks every id: a plain run refuses and names the part that moved (268: the
// table keeps its parts); --ids runs its ids and records nothing, so the table's toolchain never moves under a lane.
const T = join(base, 'T');
cpSync(B, T, { recursive: true });
assert.match(read(T, 'release/fingerprints.tsv'), /^toolchain\t\w+\tschema:1\tnode:v[\d.]+\tplatform:\S+\tpackage-lock:[0-9a-f]{64}$/m,
  'the table keeps the toolchain\'s parts beside its hash');
const elsewhere = read(T, 'release/fingerprints.tsv').replace(/^toolchain\t\w+\t(.*)\tnode:v[\d.]+/m, 'toolchain\t0123456789abcdef\t$1\tnode:v0.0.0');
put(T, 'release/fingerprints.tsv', elsewhere);
assert.match(await refused(T), /recorded on another toolchain \(0123456789abcdef; this run \w+: node: v0\.0\.0 recorded, v[\d.]+ here\)/);
const unrecorded = await chain(T, '--ids=b1');
assert.deepEqual([ranIds(unrecorded, 'seats'), unrecorded.final.seats.unrecorded, read(T, 'release/fingerprints.tsv') === elsewhere], [['b1'], true, true],
  '--ids on another toolchain runs its ids and records nothing');
// 8b (268). A node_modules that is not the lock's install refuses before a tool runs (the toolchain keys the lock alone).
put(T, 'package-lock.json', '{"lockfileVersion":3,"packages":{"node_modules/kit":{"version":"2.0.0"}}}\n');
put(T, 'node_modules/.package-lock.json', '{"packages":{"node_modules/kit":{"version":"1.0.0"}}}\n');
assert.match(await refused(T, '--ids=b1'), /node_modules is not package-lock\.json's install \(1: kit 1\.0\.0 installed, 2\.0\.0 locked\): run npm ci/);

// 9. With a table: --ids runs exactly those ids and records their rows; the plain chain then finds only the rest, and the
// tree ends equal to a whole-fleet regen of the same edit. Negative control: the plain chain on a tree with a current
// table is not refused.
const S = join(base, 'S'), G = join(base, 'G');
cpSync(B, S, { recursive: true });
cpSync(B, G, { recursive: true });
for (const root of [S, G]) put(root, 'src/vehicles/profiles/alpha.ts', "import { TURRET } from './turretKit.ts';\nexport const ALPHA = { a1: 12 + TURRET, a2: 21 + TURRET };\n");
const first = await chain(S, '--ids=a1');
for (const name of ['controls', 'fills', 'seats']) assert.deepEqual([...new Set(ranIds(first, name))], ['a1'], `${name} ran a1 alone (a later pass re-runs it when the fills it reads moved)`);
assert.deepEqual(ranIds(first, 'collision'), ['alpha'], 'the world step ran the map casting a1');
const rest = await chain(S);
for (const name of ['controls', 'fills', 'seats']) {
  const ids = ranIds(rest, name);
  assert.ok(!ids.includes('a1') && ids.includes('a2') && ids.includes('b2'), `${name}: a1's rows were recorded, the rest ran (${ids})`);
}
await chain(G, '--all');
assert.deepEqual(snapshot(S), snapshot(G), '--ids then changed-only equals a whole-fleet regen, manifest included');
assert.deepEqual((await chain(S)).runs, [], 'a current table: the plain chain runs nothing and is not refused');

// 10. Bootstrapping the pristine tree lifts the refusal (negative control for 6).
await chain(N, '--all');
assert.deepEqual((await chain(N)).runs, [], 'after --all the plain chain resolves clean');

// 11 (268). A parts step on eight ids: two parts and one merge write what one process writes, manifest included. The
// mutant (each part also writes the shared fills table, as two --ids runs would) fails the step before the merge runs.
const P1 = join(base, 'P1'), P2 = join(base, 'P2'), P3 = join(base, 'P3');
for (const root of [P1, P2, P3]) cpSync(P, root, { recursive: true });
await chain(P1, '--all');
await chain(P2, '--all', '--jobs=2');
assert.deepEqual(snapshot(P2), snapshot(P1), 'fills as parts and a merge write what one process writes');
/** The children the chain started (its log names each by label as it starts it). */
const started = (root) => readdirSync(join(root, '.qa-dev/changed-only')).filter((name) => name.endsWith('.log'))
  .flatMap((name) => [...read(root, `.qa-dev/changed-only/${name}`).matchAll(/^\[regen\] ([\w-]+): (?:nice -n 10 )?node /gm)].map((match) => match[1]));
for (const label of ['fills-part0', 'fills-part1', 'fills-merge']) {
  assert.ok(started(P2).includes(label), `${label} ran (the parts path, not one process)`);
  assert.ok(!started(P1).includes(label), `--jobs=1 runs no ${label}`);
}
// the step's report flag goes to the merge alone, which writes what the one process wrote
const chainLog = (root) => readdirSync(join(root, '.qa-dev/changed-only')).filter((name) => name.endsWith('.log')).map((name) => read(root, `.qa-dev/changed-only/${name}`)).join('');
assert.match(chainLog(P2), /^\[regen\] fills-merge: .*--report=/m, 'the merge gets --report');
assert.doesNotMatch(chainLog(P2), /^\[regen\] fills-part\d: .*--report=/m, 'a part never does');
const fillsReport = (root) => read(root, `.qa-dev/changed-only/${readdirSync(join(root, '.qa-dev/changed-only')).find((name) => name.endsWith('-fills-report.json'))}`);
assert.equal(fillsReport(P2), fillsReport(P1), 'the merge\'s report equals the one process\'s');
assert.match(fillsReport(P2), /^\["a1","a2","a3","a4","b1","b2","b3","b4"\]$/m, 'and names every id the parts measured');
const raced = await runChain(P3, ['--no-gpu', '--all', '--jobs=2'], { ...env, COT_FIXTURE_PARTS_RACE: '1' });
assert.equal(raced.status, 1, 'a part that writes the shared table fails the chain');
assert.match(raced.stdout, /fills: a part wrote src\/vehicles\/fills\.generated\.ts; only the merge writes the step's shared outputs/);
assert.ok(started(P3).includes('fills-part1') && !started(P3).includes('fills-merge'), 'the parts ran; the merge did not');

const runsOf = (summary) => summary.runs.map((run) => `${run.step}[${run.ids.join(',')}]`).join(' ');
// The repository's dependents: the Field Manual prerender after the icons step (its fleet tiles read the icons
// manifest, which the icons step writes), the public shell after a prerender write.
assert.deepEqual(DEPENDENTS.map((entry) => `${entry.name}<${entry.after.join(',')}`), ['docsPrerender<icons', 'publicShell<docsPrerender']);
assert.ok(stepByName('icons').outputs.includes('tankAssets'), 'icons writes the manifest the prerender reads');
for (const entry of DEPENDENTS) assert.ok(existsSync(join(repo, entry.tool)), `${entry.name}: ${entry.tool} exists`);

// 267 (Main: release priority covers the CPU too): a lane's CPU children run at nice 10, the release chain's
// (COT_CAPTURE_PRIORITY=release) un-niced; the command line differs by that setting alone, and GPU children never nice.
const childArgv = ['tools/gen.mjs', '--ids=a1'];
const laneChild = cpuChildCommand('/bin/node', childArgv, { niced: true, env: {} });
const releaseChild = cpuChildCommand('/bin/node', childArgv, { niced: true, env: { COT_CAPTURE_PRIORITY: 'release' } });
assert.deepEqual(laneChild, { command: 'nice', args: ['-n', '10', '/bin/node', ...childArgv], prefix: 'nice -n 10 ' });
assert.deepEqual(releaseChild, { command: '/bin/node', args: childArgv, prefix: '' });
assert.deepEqual([laneChild.args.slice(3), releaseChild.args], [childArgv, childArgv], 'the same node command line either way');
assert.equal(cpuChildCommand('/bin/node', childArgv, { niced: true, env: { COT_CAPTURE_PRIORITY: 'normal' } }).command, 'nice');
assert.deepEqual(cpuChildCommand('/bin/node', childArgv, { niced: false, env: {} }), releaseChild, 'a GPU child is never niced');
const runnerSource = readFileSync(join(repo, 'tools/tank-regen-changed.mjs'), 'utf8');
assert.match(runnerSource, /cpuChildCommand\(process\.execPath, argv, \{ niced \}\)/, 'the runner spawns every child through it');
assert.doesNotMatch(runnerSource, /\['-n', '10'/, 'no hard-coded nice left in the runner');

// 267 (Main: the load class): a CPU child's limit is a budget of its tree's CPU, not of wall time. A child starved of
// CPU (SIGSTOP slices) outlives the wall time its budget names; a child burning CPU past its budget is stopped with the
// budget named; a child with no CPU progress for the hang cap is stopped as a hang.
assert.equal(psCpuSeconds('1-02:03:04.50'), 93784.5);
assert.equal(psCpuSeconds('0:01.25'), 1.25);
assert.deepEqual(treeCpu([{ pid: 1, ppid: 0, cpuS: 1 }, { pid: 2, ppid: 1, cpuS: 2 }, { pid: 3, ppid: 2, cpuS: 3 }, { pid: 4, ppid: 9, cpuS: 5 }], 1),
  { pids: [1, 2, 3], cpuS: 6 });
async function watched(code, options, slices = null) {
  const child = spawn(process.execPath, ['-e', code], { stdio: 'ignore' });
  let stopped = null, slicer = null, paused = false;
  const watch = watchChild(child.pid, { pollMs: 200, graceMs: 1000, ...options, onStop: (verdict) => { stopped = verdict; } });
  if (slices) {
    const flip = () => { paused = !paused; try { process.kill(child.pid, paused ? 'SIGSTOP' : 'SIGCONT'); } catch { /* gone */ }
      slicer = setTimeout(flip, paused ? slices.stopMs : slices.runMs); };
    slicer = setTimeout(flip, slices.runMs);
  }
  const startedAt = Date.now();
  const exit = await new Promise((resolveExit) => child.on('close', (status, signal) => resolveExit(status ?? signal)));
  clearTimeout(slicer); watch.stop();
  return { exit, stopped, wallS: (Date.now() - startedAt) / 1000 };
}
const spend = (cpuS) => `const t = process.cpuUsage(); for (;;) { const u = process.cpuUsage(t); if (u.user + u.system > ${cpuS * 1e6}) break; }`;
const starved = await watched(spend(1.2), { budgetS: 3, hangS: 60 }, { runMs: 100, stopMs: 400 });
assert.equal(starved.exit, 0, 'a starved child finishes');
assert.equal(starved.stopped, null, 'a starved child is never stopped under its CPU budget');
assert.ok(starved.wallS > 3, `the starved child ran past the wall time its budget names (${starved.wallS.toFixed(1)} s)`);
const burner = await watched('for (;;) {}', { budgetS: 1, hangS: 60 });
assert.equal(burner.stopped?.kind, 'budget', 'a child burning CPU past its budget is stopped');
assert.match(burner.stopped.message, /CPU budget 1 s spent/, 'the budget is named');
assert.notEqual(burner.exit, 0);
const hung = await watched('setTimeout(() => {}, 120000)', { budgetS: 100, hangS: 2 });
assert.equal(hung.stopped?.kind, 'hang', 'a child with no CPU progress past the hang cap is stopped as a hang');
assert.match(hung.stopped.message, /no CPU progress/);
// (268) The tree's CPU keeps what exited members spent. Short children run one after another spend the budget between
// them; summed over the live members alone, no sample ever saw more than one child's share. A child that spent a lot and
// exited is no hang while its parent keeps working: the live sum fell below its old peak.
const sequential = `const { execFileSync } = require('node:child_process'); for (let k = 0; k < 4; k++) execFileSync(process.execPath, ['-e', ${JSON.stringify(spend(0.6))}]);`;
const overspent = await watched(sequential, { budgetS: 1.5, hangS: 60 });
assert.equal(overspent.stopped?.kind, 'budget', 'children run one after another spend one budget');
const afterChild = `const { execFileSync } = require('node:child_process'); execFileSync(process.execPath, ['-e', ${JSON.stringify(spend(1.2))}]);
  const until = Date.now() + 6000; const nap = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() < until) { ${spend(0.03)} Atomics.wait(nap, 0, 0, 150); }`;
const working = await watched(afterChild, { budgetS: 100, hangS: 3 });
assert.deepEqual([working.exit, working.stopped], [0, null], 'a parent working on after its child exits is no hang');
// cpuLimited: a synchronous child bounded by its own CPU (RLIMIT_CPU), never wall time, as the rows read is
const { cpuLimited } = await import('./childBudget.mjs');
let burned = null;
// the burner ends itself after 10 s of CPU, so a limit that never fires fails this check instead of hanging it
const selfEnding = 'const t = process.cpuUsage(); for (;;) { const u = process.cpuUsage(t); if (u.user + u.system > 10e6) process.exit(0); }';
try { execFileSync(...cpuLimited(process.execPath, ['-e', selfEnding], 1), { stdio: 'ignore' }); } catch (error) { burned = error; }
assert.equal(burned?.signal, 'SIGXCPU', 'a synchronous child past its CPU limit is stopped by the kernel');
const sleptAt = Date.now();
execFileSync(...cpuLimited(process.execPath, ['-e', 'setTimeout(() => {}, 2500)'], 1), { stdio: 'ignore' });
assert.ok(Date.now() - sleptAt > 2000, 'and one that outlives that much wall time on little CPU finishes');
const runnerBudget = readFileSync(join(repo, 'tools/tank-regen-changed.mjs'), 'utf8');
assert.match(runnerBudget, /watchChild\(child\.pid, \{ budgetS: timeoutS, hangS: HANG_S/, 'the runner budgets its CPU children through it');

// 12 (268). A partial chain writes only the lines of the steps it ran: --steps=seats on a tree where fills' tool moved
// (every fills id due) and one seats input moved (b1) runs seats on b1. Every other line of the table stays byte for
// byte, the shared ones included. fills stays due and still reads as its tool; the shared refresh used to relabel it
// "inputs rewritten after this step ran". Then the plain chain settles the rest.
const X = join(base, 'X');
cpSync(B, X, { recursive: true });
put(X, 'tools/gen-fills.mjs', `${read(X, 'tools/gen-fills.mjs')}// 268: the tool moved\n`);
put(X, 'docs/floors.json', read(X, 'docs/floors.json').replace('"b1":{"f":3,', '"b1":{"f":3.5,'));
const beforePartial = read(X, 'release/fingerprints.tsv');
const partial = await chain(X, '--steps=seats');
assert.deepEqual(partial.runs.map((run) => `${run.step}[${run.ids.join(',')}]`), ['seats[b1]'], 'the partial chain runs seats on b1 alone');
const othersOf = (text) => text.split('\n').filter((line) => line.split('\t')[1] !== 'seats');
assert.deepEqual(othersOf(read(X, 'release/fingerprints.tsv')), othersOf(beforePartial),
  'every line of a step it did not run (and every shared line) is byte-identical');
assert.notEqual(read(X, 'release/fingerprints.tsv'), beforePartial, 'control: seats\' own lines moved');
const afterPartial = await chain(X, '--dry-run');
assert.deepEqual([afterPartial.final.fills.mode, afterPartial.final.fills.reasons.a1?.[0]], ['all', 'tool tools/gen-fills.mjs or its flags'],
  'the step whose tool moved stays due, named as its tool');
assert.equal(afterPartial.final.seats.mode, 'none', 'and the step that ran is current');
assert.deepEqual(Object.entries((await chain(X)).final).filter(([, entry]) => entry.mode !== 'none'), [], 'the plain chain settles the rest');

console.log(`changed-only chain.selftest: PASS (bootstrap ${boot.passes} passes; kit edit: ${runsOf(changedRun)}; fixture ${base})`);
