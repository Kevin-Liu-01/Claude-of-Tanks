#!/usr/bin/env node
// Which tank ids each fleet generator must re-run: the changed-only resolver. First-party tooling: Kevin B. Liu.
//
//   node tools/changed-ids.mjs                       # every step against release/fingerprints.tsv
//   node tools/changed-ids.mjs --step=fills --json   # one step, machine-readable
//   node tools/changed-ids.mjs --explain=t72b3m_hetman_ii
//   node tools/changed-ids.mjs --base=origin/integ/226   # against a release's committed manifest (a report)
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
const { STEPS, config, path: tableModule } = await loadTable(value('table') ?? null);
const names = value('step')?.split(',').filter(Boolean) ?? STEPS.map((step) => step.name);
for (const name of names) if (!STEPS.some((step) => step.name === name)) throw new Error(`unknown step ${name}`);

const started = Date.now();
const state = computeState({ root, steps: STEPS, config, tableModule });
const manifest = loadBase(root, value('base'));
const result = resolveChanged(state, manifest, { steps: names });
const seconds = ((Date.now() - started) / 1000).toFixed(1);

if (json) {
  process.stdout.write(`${JSON.stringify({ seconds: Number(seconds), manifest: manifest ? 'present' : 'missing', steps: result,
    errors: state.errors }, null, 1)}\n`);
} else {
  console.log(`[changed-ids] ${manifest ? 'manifest present' : 'no manifest'}; ${state.ids.length} ids, ${Object.keys(state.groups).length} groups, core ${state.partition.core.length} files (${seconds} s)`);
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
