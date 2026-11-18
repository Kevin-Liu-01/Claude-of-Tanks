#!/usr/bin/env node
// Hitbox fit census (tools/hitbox-fit-census-lib.mjs): every hit surface a tank's armour model traces must lie on the
// geometry the player sees (hitbox-fit-274; the owner, 2026-11-18). CPU only, one tank at a time.
//   node tools/hitbox-fit-census.mjs --ids=abramsx,m1a1 [--json=out.json] [--all-rows]
//   node tools/hitbox-fit-census.mjs --all [--json=out.json]
//   --apply-fits     measure what the next anatomy regen gives (the generator's crop/fit/drop receipts applied in memory)
//   --ledger=<path>  hold the convex cells' bridges to the committed rows: with --check a tank fails when it bridges more
//                    faces, or deeper (by over LEDGER_SLACK_M), than its row; --update writes the measured rows
// The gate: no plate or housing may float (FLOAT_TOL_M), ever; a convex cell bridging a recess deeper than
// CELL_BRIDGE_TOL_M is a defect of the generator's slicing (tools/gen-combat-anatomy.mjs HULL_LATERAL_CUTS) held by the
// ledger until that slicing is fixed, never allowed to grow. Without --ledger every floating primitive fails.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { uniqueIds } from './id-list.mjs';
import { FLEET_GROUP_BY_ID } from '../src/vehicles/fleetManifest.ts';
import { hitboxFitCensus, FLOAT_TOL_M, CELL_BRIDGE_TOL_M } from './hitbox-fit-census-lib.mjs';

/** A cell bridge may read this much deeper (m) than its ledger row before it fails (build-to-build float noise). */
const LEDGER_SLACK_M = 0.01;

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name) => process.argv.includes(`--${name}`);
const ids = flag('all') ? Object.keys(FLEET_GROUP_BY_ID)
  : uniqueIds((arg('ids') ?? '').split(',').filter(Boolean), 'hitbox-fit-census --ids');
if (!ids.length) { console.error('usage: node tools/hitbox-fit-census.mjs --ids=a,b | --all [--json=path] [--ledger=path --check|--update]'); process.exit(2); }
const ledgerPath = arg('ledger');
if (ledgerPath && flag('check') === flag('update')) { console.error('--ledger takes exactly one of --check and --update'); process.exit(2); }
const ledger = ledgerPath && existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, 'utf8'))
  : { about: 'tools/hitbox-fit-census.mjs: per tank, its convex cells bridging a recess of the drawn shell deeper than '
    + `${CELL_BRIDGE_TOL_M} m (faces, deepest centre gap in m). Held, never grown, until the generator's slicing fits them.`, rows: {} };

const out = [], failures = [];
const started = performance.now();
for (const id of ids) {
  const t0 = performance.now();
  let row;
  try { row = await hitboxFitCensus(id, { all: flag('all-rows'), applyFits: flag('apply-fits') }); }
  catch (error) { console.log(`${id}: ERROR ${error.message}`); out.push({ id, error: String(error.message) }); failures.push(`${id}: ${error.message}`); continue; }
  const floating = row.rows.filter((r) => r.floating);
  const layers = floating.filter((r) => r.type !== 'cell'), bridges = floating.filter((r) => r.type === 'cell');
  const bridge = { faces: bridges.length, deepestM: bridges.length ? Math.max(...bridges.map((r) => r.centreM)) : 0 };
  console.log(`${id}: ${row.primitives} primitives, ${layers.length} floating plates or housings, ${bridge.faces} cell bridges`
    + `${bridge.faces ? ` (deepest ${bridge.deepestM} m)` : ''}${row.pivotGapM ? `, turret rig ${row.pivotGapM} m off pivot` : ''}`
    + ` (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  for (const fit of row.fits || []) console.log(`   ${fit.action.toUpperCase()} ${fit.owner} ${fit.name} (${fit.kind}) was ${fit.gapM} m off`);
  for (const r of floating) {
    console.log(`   FLOAT ${r.type} ${r.frame} ${r.name} (${r.kind}) centre ${r.centreM} m, min ${r.minM} m, off ${Math.round(r.offShare * 100)} %, `
      + `${r.areaM2} m2 at [${r.centre.join(',')}]`);
  }
  if (layers.length) failures.push(`${id}: ${layers.length} floating plate(s) or housing(s): ${layers.map((r) => r.name).join(', ')}`);
  if (ledgerPath && flag('update')) {
    if (bridge.faces) ledger.rows[id] = bridge; else delete ledger.rows[id];
  } else if (ledgerPath) {
    const held = ledger.rows[id] ?? { faces: 0, deepestM: 0 };
    if (bridge.faces > held.faces || bridge.deepestM > held.deepestM + LEDGER_SLACK_M) {
      failures.push(`${id}: cell bridges grew to ${bridge.faces} face(s), deepest ${bridge.deepestM} m (ledger ${held.faces}, ${held.deepestM} m)`);
    }
  } else if (bridge.faces) failures.push(`${id}: ${bridge.faces} cell bridge(s), deepest ${bridge.deepestM} m`);
  out.push(row);
}
console.log(`\n${ids.length} tanks, ${failures.length} failing (plates and housings ${FLOAT_TOL_M} m, cell bridges ${CELL_BRIDGE_TOL_M} m`
  + `${ledgerPath ? `, held to ${ledgerPath}` : ''}) in ${((performance.now() - started) / 1000).toFixed(0)} s`);
for (const failure of failures) console.log(`  FAIL ${failure}`);
const json = arg('json');
if (json) writeFileSync(json, JSON.stringify(out, null, 1));
if (ledgerPath && flag('update')) {
  if (flag('all')) for (const id of Object.keys(ledger.rows)) if (!ids.includes(id)) delete ledger.rows[id];
  ledger.rows = Object.fromEntries(Object.entries(ledger.rows).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(ledgerPath, `${JSON.stringify(ledger, null, 1)}\n`);
  console.log(`wrote ${Object.keys(ledger.rows).length} ledger rows to ${ledgerPath}`);
  process.exit(failures.some((f) => !/cell bridge/.test(f)) ? 1 : 0);
}
process.exit(failures.length ? 1 : 0);
