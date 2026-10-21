#!/usr/bin/env node
// The sim-floor drift receipt's command line (tools/anatomy-floor-ledger.mjs explains the 226 slip it closes).
//
//   node tools/anatomy-floor-drift.mjs [--check] [--ids=a,b] [--no-blame]
//       Compare the committed combat-anatomy calibration with docs/geometry-gate/sim-floors.json. Data only (~0.2 s);
//       a drifting id is built once to name the parts responsible. Fails (exit 2) on a move over 5 cm, an id without
//       a row, or a row whose id left the fleet.
//   node tools/anatomy-floor-drift.mjs --accept=<id>[,<id>]:<reason> [--by=<owner>]
//       Record the current values for those ids with a note of the old ones (repeatable; COT_ACCEPT_FLOOR_DRIFT too).
//   node tools/anatomy-floor-drift.mjs --prune
//       Drop rows whose id left the fleet (a renamed or retired tank); never touches another row.
//   node tools/anatomy-floor-drift.mjs --init
//       Write the ledger from the committed calibration; refuses when it exists.
//
// gen-combat-anatomy runs the same comparison on its fresh measurement (write and --check modes), so a regen that
// moves a floor stops there; this command covers the committed files (npm test runs it as a receipt).

import { existsSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import {
  SIM_FLOOR_LEDGER, acceptFloorRows, acceptHint, compareFloorRows, emptyFloorLedger, floorRowOf, formatFloorDrift,
  parseFloorAccepts, readCommittedCalibrations, readFloorLedger, writeFloorLedger,
} from './anatomy-floor-ledger.mjs';

const argv = process.argv.slice(2);
const root = process.cwd();
const flagValue = (name) => argv.find((arg) => arg.startsWith(`${name}=`))?.slice(name.length + 1) ?? null;
const by = flagValue('--by') || process.env.COT_LANE || userInfo().username;

const calibrations = readCommittedCalibrations(root);
const fleetIds = Object.keys(calibrations).sort();
const current = Object.fromEntries(fleetIds.map((id) => [id, floorRowOf(calibrations[id], id)]));

if (argv.includes('--init')) {
  if (existsSync(join(root, SIM_FLOOR_LEDGER))) {
    console.error(`[sim-floors] ${SIM_FLOOR_LEDGER} exists; change rows with --accept`);
    process.exit(2);
  }
  const ledger = emptyFloorLedger();
  for (const id of fleetIds) ledger.rows[id] = current[id];
  writeFloorLedger(ledger, root);
  console.log(`[sim-floors] wrote ${fleetIds.length} rows to ${SIM_FLOOR_LEDGER}`);
  process.exit(0);
}

const ledger = readFloorLedger(root);
let accepts;
try { accepts = parseFloorAccepts(argv, process.env); } catch (error) { console.error(error.message); process.exit(2); }
if (accepts.length) {
  const { changed, unchanged } = acceptFloorRows(ledger, calibrations, accepts, { by });
  if (changed.length) writeFloorLedger(ledger, root);
  console.log(`[sim-floors] accepted ${changed.length} row(s)${changed.length ? `: ${changed.join(', ')}` : ''}`
    + `${unchanged.length ? `; already current: ${unchanged.join(', ')}` : ''}`);
  process.exit(0);
}
if (argv.includes('--prune')) {
  const fleet = new Set(fleetIds);
  const gone = Object.keys(ledger.rows).filter((id) => !fleet.has(id));
  for (const id of gone) delete ledger.rows[id];
  if (gone.length) writeFloorLedger(ledger, root);
  console.log(`[sim-floors] pruned ${gone.length} row(s)${gone.length ? `: ${gone.join(', ')}` : ''}`);
  process.exit(0);
}

const idsArg = flagValue('--ids');
const ids = idsArg && idsArg !== 'all' ? idsArg.split(',').map((id) => id.trim()).filter(Boolean) : fleetIds;
const unknown = ids.filter((id) => !current[id]);
if (unknown.length) { console.error(`[sim-floors] no calibration row for ${unknown.join(', ')}`); process.exit(2); }
const result = compareFloorRows(ledger.rows, current, { ids, fleetIds: idsArg && idsArg !== 'all' ? null : fleetIds });
if (result.ok) {
  console.log(`[sim-floors] PASS: ${ids.length} id(s) within ${ledger.toleranceM * 100} cm of ${SIM_FLOOR_LEDGER}`
    + `${result.within.length ? ` (${result.within.length} moved less: ${result.within.slice(0, 8).join(', ')}${result.within.length > 8 ? ', ...' : ''})` : ''}`);
  process.exit(0);
}

const blame = argv.includes('--no-blame') ? null : (await import('./anatomy-floor-blame.mjs')).blameFloorDrift;
if (result.drifts.size) {
  console.error(`[sim-floors] FAIL: ${result.drifts.size} tank(s) moved a sim floor or the combat hull box by more than `
    + `${ledger.toleranceM * 100} cm against ${SIM_FLOOR_LEDGER}:`);
  for (const [id, moved] of result.drifts) {
    let culprits = null;
    try { culprits = blame ? blame(id, moved) : null; } catch (error) { console.error(`  ${id}: blame build failed: ${error.message}`); }
    for (const line of formatFloorDrift(id, moved, culprits)) console.error(line);
  }
  console.error('  Fix the geometry (nothing below the belly line; equipment out of the structural buckets), or, when the move');
  console.error(`  is intended, record it: ${acceptHint([...result.drifts.keys()])}`);
}
if (result.missing.length) {
  console.error(`[sim-floors] FAIL: no ledger row for ${result.missing.join(', ')}: a calibrated tank's row is never re-seeded `
    + `(gen-combat-anatomy seeds only an id the committed calibration has never measured); restore it from git, or `
    + `${acceptHint(result.missing)}`);
}
if (result.extra.length) {
  console.error(`[sim-floors] FAIL: ledger rows for ids no longer in the fleet: ${result.extra.join(', ')} `
    + '(node tools/anatomy-floor-drift.mjs --prune)');
}
process.exit(2);
