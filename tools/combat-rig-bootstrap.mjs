#!/usr/bin/env node
// The combat rig before anything builds a tank (276 sim-det-trig-c). finalizeCombatAnatomy refuses a drawn weapon whose
// calibration has no measured rig (there is no authored fallback), and every tool that loads the fleet (tankFactory.ts,
// authorityFleet.ts) finalizes at import. A tree whose calibrations predate the measured rig (the first regen after 276's
// combat-rig change, or a row lost to a merge) could then load none of them: tank:regen:changed's first aggregate
// (gen-authored-paint-catalog) failed at import on integ/276 8fcde83322, before the anatomy step that writes the rig ran.
//
// This tool reads the merged calibration table (no fleet import), lists the ids whose row carries no rig, and runs
// tools/gen-combat-anatomy.mjs for exactly those (its measurement mode loads the fleet without rigs), in parts with one
// merge. With every row rigged it does nothing. tank:regen:changed runs it first (tools/changed-only/steps.mjs
// RIG_BOOTSTRAP), ahead of the aggregates and every step that builds a tank; tools/combat-rig-bootstrap.selftest.mjs holds
// that order.
//
//   node tools/combat-rig-bootstrap.mjs [--check] [--jobs=4] [--ids=a,b]
//
// --ids: only those of the named ids that have no rig (a lane's own, or a receipt's small run).
// --check: exit 1 while any row lacks a rig (writes nothing). Exit 0 when every row has one (after writing them).
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** The ids of `table` (id -> calibration row) whose row carries no measured combat rig, sorted. */
export function idsWithoutRig(table) {
  return Object.keys(table).filter((id) => !table[id]?.rig).sort();
}

/** `ids` cut into at most `jobs` runs of near-equal size. */
export function rigParts(ids, jobs) {
  const count = Math.max(1, Math.min(jobs, ids.length));
  const size = Math.ceil(ids.length / count);
  return Array.from({ length: count }, (_, i) => ids.slice(i * size, (i + 1) * size)).filter((part) => part.length);
}

async function main(argv) {
  const check = argv.includes('--check');
  const jobs = Math.max(1, Number(argv.find((arg) => arg.startsWith('--jobs='))?.slice(7)) || 4);
  const { COMBAT_ANATOMY_CALIBRATIONS } = await import(pathToFileURL(join(ROOT, 'src/vehicles/combatAnatomyCalibrations.ts')).href);
  const only = argv.find((arg) => arg.startsWith('--ids='))?.slice(6).split(',').filter(Boolean) ?? null;
  const missing = idsWithoutRig(COMBAT_ANATOMY_CALIBRATIONS).filter((id) => !only || only.includes(id));
  if (!missing.length) {
    console.log(`[rig-bootstrap] every one of ${only ? `the ${only.length} named` : Object.keys(COMBAT_ANATOMY_CALIBRATIONS).length} calibration rows has its measured rig`);
    return 0;
  }
  if (check) {
    console.log(`[rig-bootstrap] ${missing.length} row(s) have no measured rig: ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ', ...' : ''}`);
    return 1;
  }
  const all = Object.keys(COMBAT_ANATOMY_CALIBRATIONS).length;
  // Every row without a rig (the first regen after the combat rig): parts side by side, then one merge, which is quick
  // only because the parts cover the whole fleet (a merge measures every id no part holds, one after another). Some rows
  // only: one run for exactly those ids, whose rows join the committed ones.
  const runTool = (args) => new Promise((done) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
    child.on('error', () => done(1));
    child.on('close', (code) => done(code ?? 1));
  });
  if (missing.length < all) {
    console.log(`[rig-bootstrap] measuring the rig of ${missing.length} id(s) with no row rig (of ${all})`);
    const code = await runTool(['--max-old-space-size=5000', 'tools/gen-combat-anatomy.mjs', `--ids=${missing.join(',')}`]);
    if (code !== 0) throw new Error(`gen-combat-anatomy failed (exit ${code})`);
  } else {
    const parts = rigParts(missing, jobs);
    console.log(`[rig-bootstrap] no row has a rig: measuring all ${all} in ${parts.length} part(s), then one merge`);
    const scratch = mkdtempSync(join(tmpdir(), 'cot-rig-bootstrap-'));
    try {
      const dirs = parts.map((_, i) => join(scratch, `p${i + 1}`));
      const codes = await Promise.all(parts.map((ids, i) => runTool(['--max-old-space-size=4500', 'tools/gen-combat-anatomy.mjs', `--ids=${ids.join(',')}`, `--out-dir=${dirs[i]}`])));
      if (codes.some((code) => code !== 0)) throw new Error(`gen-combat-anatomy part(s) failed (exit ${codes.join(', ')})`);
      const merge = await runTool(['--max-old-space-size=5500', 'tools/gen-combat-anatomy.mjs', `--merge-from=${dirs.join(',')}`]);
      if (merge !== 0) throw new Error(`gen-combat-anatomy merge failed (exit ${merge})`);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }
  const after = spawnSync(process.execPath, ['tools/combat-rig-bootstrap.mjs', '--check', ...(only ? [`--ids=${only.join(',')}`] : [])], { cwd: ROOT, encoding: 'utf8' });
  process.stdout.write(after.stdout ?? '');
  return after.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(`[rig-bootstrap] ${error.message}`); process.exit(1); });
}
