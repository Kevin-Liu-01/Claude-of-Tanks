#!/usr/bin/env node
// Runtime check of the world keys (nightly, or after a world or fleet-structure change): build each map through a world
// step's own --check mode (it builds exactly what the write mode builds and writes nothing) under the read trace
// (trace-reads.mjs, inherited by child processes), and fail on any repository module it loaded or file it read that the
// map's key does not cover:
//   - the step's world core and the map's own config closure;
//   - the fleet core, and the builder groups on the spec chains of the map's donors (the wreck plan's rows and the ids
//     its config names): a builder group loaded for any other id means the map bakes a donor its key does not hold;
//   - per-id tables, index maps, the world outputs (--check reads the committed shards and plan), declared reads,
//     node_modules and .qa-dev scratch;
//   - the balance pass and what the tables import (a decoder), as tools/changed-only/trace-check.mjs accepts them
//     (266): every map's fleet key holds every id's registered spec rows (SPEC_COMBAT, SPEC_REST), where the passes
//     land, and each donor's key the rows its tables decode.
// Every other map's config module is loaded too (the registry imports all of them) and is reported apart: configs are
// data (src/world/maps/index.ts), and the nightly whole-world --check is the tripwire for a config with side effects.
// Writes nothing in the tree. First-party tooling: Kevin B. Liu.
//
//   node tools/changed-only/world-trace.mjs [--root=<tree>] [--steps=collision,trenches,wreckPlan] [--maps=a,b]
//        [--jobs=3] [--json=out.json] [--plant=<repository path>]
// --plant (a control): every traced process also reads that file, through a preload outside the tree; a file the
// map's key does not hold must come back as the run's one uncovered read.
import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { computeState } from './fingerprint.mjs';
import { expandGlobs } from './globs.mjs';
import { AGGREGATES, DECLARED_DYNAMIC, TABLES, WORLD_OUTPUTS, WORLD_STEPS } from './steps.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(value('root') ?? process.cwd());
const jobs = Math.max(1, Number(value('jobs') ?? 3) | 0);
const trace = join(import.meta.dirname, 'trace-reads.mjs');
// the --plant control's preload, outside the tree
const plant = value('plant');
const plantModule = plant ? join(mkdtempSync(join(tmpdir(), 'cot-world-trace-plant-')), 'plant.mjs') : null;
if (plantModule) writeFileSync(plantModule, `import { readFileSync } from 'node:fs';\n`
  + `readFileSync(${JSON.stringify(resolve(root, plant))});\n`);
const nodeOptions = `--max-old-space-size=4096 --import=${trace}${plantModule ? ` --import=${plantModule}` : ''}`;
const state = computeState({ root });
if (!state.world) throw new Error(`no world rows in ${root}`);
const world = state.world;
const names = value('steps')?.split(',') ?? ['collision', 'trenches', 'wreckPlan'];
const maps = value('maps')?.split(',') ?? world.ids;
const rel = (path) => relative(root, path);
const insideRoot = (path) => path === root || path.startsWith(root + sep);
const isDirectory = (path) => { try { return statSync(path).isDirectory(); } catch { return false; } };
const tableFiles = [...Object.values(TABLES).flatMap((table) => expandGlobs(root, table.files)), ...AGGREGATES];
const outputs = WORLD_OUTPUTS;
const allConfigFiles = new Set(Object.values(world.steps).flatMap((step) => Object.values(step.mapFiles).flat()));

const jobsList = [];
for (const name of names) for (const map of maps) jobsList.push({ name, map });
const report = { root, steps: {} };
let failures = 0;

async function runOne({ name, map }) {
  const step = WORLD_STEPS.find((entry) => entry.name === name);
  const s = world.steps[name];
  const donors = world.donorsOf(name, map);
  const groups = [...new Set(donors.flatMap((id) => state.groupChain(id)))];
  const keyed = new Set([...s.toolFiles, ...(s.mapFiles[map] ?? []), ...state.partition.core,
    ...state.partition.balance, ...state.partition.tableImports,
    ...groups.flatMap((group) => state.partition.groups[group] ?? []), ...tableFiles, step.tool,
    ...expandGlobs(root, Object.values(DECLARED_DYNAMIC).flatMap((declaration) => declaration.reads ?? [])),
    'package-lock.json', 'node_modules/.package-lock.json']);
  const keyedDirs = [...keyed].filter((entry) => isDirectory(join(root, entry)));
  const ancestors = new Set();
  for (const entry of keyed) for (let dir = dirname(entry); dir && dir !== '.'; dir = dirname(dir)) ancestors.add(dir);
  const classify = (path) => {
    const r = rel(path);
    if (r === 'node_modules' || r.startsWith('node_modules/') || r === '.qa-dev' || r.startsWith('.qa-dev/')) return 'ok';
    if (outputs.some((output) => r === output || r.startsWith(`${output}/`))) return 'ok';
    if (keyed.has(r) || keyedDirs.some((dir) => r.startsWith(`${dir}/`))) return 'ok';
    if (ancestors.has(r) && isDirectory(path)) return 'ok';
    if (allConfigFiles.has(r)) return 'otherConfig';
    return 'uncovered';
  };
  const out = mkdtempSync(join(tmpdir(), `cot-world-trace-${name}-${map}-`));
  const runArgs = [step.tool, ...(step.checkFlags ?? step.flags), ...step.checkScoped([map])];
  const started = Date.now();
  const result = await new Promise((done) => execFile('nice', ['-n', '10', process.execPath, ...runArgs], {
    cwd: root, maxBuffer: 64 * 1024 * 1024, timeout: 3_600_000,
    env: { ...process.env, NODE_OPTIONS: nodeOptions, COT_TRACE_READS_OUT: join(out, 'trace') },
  }, (error, stdout, stderr) => done({ error, stdout, stderr })));
  let files = [];
  try { files = readdirSync(join(out, 'trace')).filter((entry) => entry.endsWith('.json')); } catch {}
  const seen = new Set();
  for (const file of files) {
    const record = JSON.parse(readFileSync(join(out, 'trace', file), 'utf8'));
    for (const path of [...record.reads, ...record.listed, ...record.loads]) if (insideRoot(path)) seen.add(path);
  }
  const verdicts = [...seen].map((path) => [rel(path), classify(path)]);
  const pick = (kind) => verdicts.filter(([, verdict]) => verdict === kind).map(([path]) => path).sort();
  // A builder group's files loaded for this map: which groups (by partition) the build demanded.
  const loadedGroups = Object.entries(state.partition.groups)
    .filter(([, groupFiles]) => groupFiles.some((file) => seen.has(join(root, file)))).map(([group]) => group).sort();
  const entry = {
    // --check exits 1 when a committed shard is stale; that is a verdict, not a trace failure.
    exit: result.error ? (result.error.code ?? 1) : 0, seconds: Math.round((Date.now() - started) / 1000), processes: files.length,
    donors, donorGroups: groups.sort(), loadedGroups, uncovered: pick('uncovered'), otherConfigs: pick('otherConfig').length,
  };
  (report.steps[name] ??= {})[map] = entry;
  const crashed = entry.exit !== 0 && entry.exit !== 1;
  const bad = entry.uncovered.length || !files.length || crashed;
  if (bad) failures++;
  console.log(`[world-trace] ${name} ${map}: exit ${entry.exit}, ${files.length} process(es), donors ${donors.join(',') || '-'}, groups loaded ${loadedGroups.join(',') || '-'}, ${entry.uncovered.length} uncovered (${entry.seconds} s)`);
  for (const path of entry.uncovered.slice(0, 20)) console.log(`  uncovered: ${path}`);
  if (crashed || !files.length) console.log(String(result.stderr).split('\n').slice(-6).join('\n'));
}

const queue = [...jobsList];
await Promise.all(Array.from({ length: jobs }, async () => { for (let job = queue.shift(); job; job = queue.shift()) await runOne(job); }));
if (value('json')) writeFileSync(value('json'), `${JSON.stringify(report, null, 1)}\n`);
console.log(`[world-trace] ${failures ? `FAIL (${failures})` : 'PASS'}: ${jobsList.length} build(s), ${names.join(',')} on ${maps.length} map(s)`);
if (failures) process.exitCode = 1;
