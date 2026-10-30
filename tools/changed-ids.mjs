#!/usr/bin/env node
// Which tank ids each fleet generator must re-run: the changed-only resolver. First-party tooling: Kevin B. Liu.
//
//   node tools/changed-ids.mjs                       # every step against release/fingerprints.tsv
//   node tools/changed-ids.mjs --step=fills --json   # one step, machine-readable
//   node tools/changed-ids.mjs --explain=t72b3m_hetman_ii
//   node tools/changed-ids.mjs --base=origin/integ/226   # against a release's committed manifest (a report)
//   node tools/changed-ids.mjs --maps                # the world steps only (per map: wreck plan, collision, trenches)
//
// No tank is built: the resolver reads the import graph, the data modules and the manifest
// (tools/changed-only/fingerprint.mjs). Modes: none, ids (a subset), all (every id), full (every id in whole-fleet mode:
// roster change, missing manifest, an output file edited outside its rows). The chain that acts on it is
// tools/tank-regen-changed.mjs (npm run tank:regen:changed).
import { resolve } from 'node:path';
import { computeState, loadBase, resolveChanged } from './changed-only/fingerprint.mjs';
import { loadTable } from './changed-only/table.mjs';

const args = process.argv.slice(2);
const value = (name) => args.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const root = resolve(value('root') ?? process.cwd());
const json = args.includes('--json');
const explain = value('explain') ?? (args.includes('--explain') ? '*' : null);
const { STEPS, WORLD_STEPS, config, path: tableModule } = await loadTable(value('table') ?? null);
const worldNames = WORLD_STEPS.map((step) => step.name);
const names = value('step')?.split(',').filter(Boolean)
  ?? (args.includes('--maps') ? worldNames : [...STEPS.map((step) => step.name), ...worldNames]);
for (const name of names) if (![...STEPS, ...WORLD_STEPS].some((step) => step.name === name)) throw new Error(`unknown step ${name}`);

const started = Date.now();
const state = computeState({ root, steps: STEPS, worldSteps: WORLD_STEPS, config, tableModule });
const manifest = loadBase(root, value('base'));
const tankNames = names.filter((name) => !worldNames.includes(name)), mapNames = names.filter((name) => worldNames.includes(name));
if (mapNames.length && !state.world) throw new Error(`no world rows in ${root}`);
const result = { ...resolveChanged(state, manifest, { steps: tankNames }),
  ...(mapNames.length ? resolveChanged(state.world, manifest, { steps: mapNames }) : {}) };
// A map whose wreck plan is due may bake other donors: until the chain re-runs the plan, its shards count as due too.
const plan = result.wreckPlan;
if (plan && plan.mode !== 'none') for (const name of mapNames.filter((entry) => entry !== 'wreckPlan')) {
  const entry = result[name];
  if (entry.mode === 'all' || entry.mode === 'full') continue;
  for (const map of plan.ids) if (!entry.ids.includes(map)) { entry.ids.push(map); entry.reasons[map] = ['wreck plan due (its donors may move)']; }
  entry.ids = state.world.ids.filter((map) => entry.ids.includes(map));
  entry.mode = entry.ids.length === 0 ? 'none' : entry.ids.length === state.world.ids.length ? 'all' : 'ids';
}
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (json) {
  process.stdout.write(`${JSON.stringify({ seconds: Number(seconds), manifest: manifest ? 'present' : 'missing', steps: result,
    errors: [...state.errors, ...(state.world?.globalReasons ?? [])] }, null, 1)}\n`);
} else {
  console.log(`[changed-ids] ${manifest ? 'manifest present' : 'no manifest'}; ${state.ids.length} ids, ${Object.keys(state.groups).length} groups, core ${state.partition.core.length} files${state.world ? `; ${state.world.ids.length} maps` : ''} (${seconds} s)`);
  // A toolchain mismatch marks every id on every step: say so once, with this run's parts (the table keeps only a hash).
  if (manifest && manifest.toolchain !== state.toolchain) {
    console.log(`[changed-ids] toolchain differs: the table was recorded on ${manifest.toolchain}, this run is ${state.toolchain} (${state.toolchainParts.join(', ')}); every id reads "toolchain"`);
  }
  for (const name of names) {
    const entry = result[name];
    const head = entry.ids.slice(0, 12).join(',');
    console.log(`${name.padEnd(10)} ${entry.mode.padEnd(4)} ${String(entry.ids.length).padStart(3)} changed${entry.ids.length ? `: ${head}${entry.ids.length > 12 ? ',...' : ''}` : ''}`);
    // Long reason lists (every shard of a table unrecorded) print their first few and a count.
    const why = entry.reasons['*'];
    if (why) console.log(`           why: ${why.slice(0, 4).join('; ')}${why.length > 4 ? `; and ${why.length - 4} more` : ''}`);
    if (explain) {
      for (const id of explain === '*' ? entry.ids.slice(0, 20) : [explain]) {
        if (entry.reasons[id]) console.log(`           ${id}: ${entry.reasons[id].join('; ')}`);
      }
    }
  }
  if (state.errors.length) for (const error of state.errors) console.error(`[changed-ids] ${error}`);
}
if (state.errors.length) process.exitCode = 2;
