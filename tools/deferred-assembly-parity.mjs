#!/usr/bin/env node
// Deferred-assembly parity over the fleet's suited tanks (2026-10-16, PERF: the garage's default m1a3 wears a suit and
// its build was one long task). Each suited id is built twice per caller build: with the suit or field net inside the
// core (assemblyInCore, how it was built before) and in its own slices after the core checkpoint (the default). The
// two must be identical (tools/deferred-assembly-receipt.mjs). The longest slice of each is reported.
//
//   node tools/deferred-assembly-parity.mjs --all [--builds=battleHigh,battleLow,garage] [--json=out.json]
//   node tools/deferred-assembly-parity.mjs m1a3 ua_challenger2
//
// --all finds the suited ids itself (addVehicleGhillieSuit's accepted builds). An unsuited id is skipped. Exit 1 on any
// difference.
import './tank-surface-collect.mjs';
import { writeFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { DEFERRED_ASSEMBLY_BUILDS, deferredAssemblyDifference, deferredAssemblyReceipt, drainTimedSteps } from './deferred-assembly-receipt.mjs';

const suited = new Set();
globalThis.__deferredAssemblySuited = suited;
const MARKER = '  SUITED.add(P);\n';
registerHooks({
  load(href, context, next) {
    const result = next(href, context);
    if (!href.endsWith('/src/vehicles/ghillieSuit.ts')) return result;
    const source = String(result.source);
    if (!source.includes(MARKER)) throw new Error('deferred-assembly-parity: addVehicleGhillieSuit no longer records SUITED.add(P)');
    return { ...result, source: source.replace(MARKER, `${MARKER}  globalThis.__deferredAssemblySuited?.add(P.spec.id);\n`) };
  },
});
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { createTankSteps } = await import('../src/vehicles/tankFactoryCore.ts');
const { ALL_TANK_IDS } = await import('../src/vehicles/specs.ts');

const args = process.argv.slice(2);
const option = (name) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const builds = (option('builds') ?? Object.keys(DEFERRED_ASSEMBLY_BUILDS).join(',')).split(',');
for (const name of builds) if (!DEFERRED_ASSEMBLY_BUILDS[name]) throw new Error(`unknown build '${name}'`);
const named = args.filter((a) => !a.startsWith('--'));
const ids = args.includes('--all') ? [...ALL_TANK_IDS] : named;
if (!ids.length) throw new Error('pass ids or --all');

const rows = [];
let failures = 0;
for (const id of ids) {
  suited.delete(id);
  createTank(id, null, { proceduralOnly: true, geometryQuality: 'low', quality: 'low', camoSeed: 4242, decor: false }).dispose();
  if (!suited.has(id)) continue;
  const row = { id, builds: {} };
  for (const name of builds) {
    const options = DEFERRED_ASSEMBLY_BUILDS[name];
    const inCore = drainTimedSteps(createTankSteps(id, null, { ...options, assemblyInCore: true }));
    const deferred = drainTimedSteps(createTankSteps(id, null, options));
    try {
      const a = deferredAssemblyReceipt(inCore.visual), b = deferredAssemblyReceipt(deferred.visual);
      const same = a.digest === b.digest;
      if (!same) failures++;
      row.builds[name] = { same, digest: b.digest, inCoreMaxSliceMs: Math.round(Math.max(...inCore.slices)),
        deferredMaxSliceMs: Math.round(Math.max(...deferred.slices)), deferredSlices: deferred.slices.length,
        ...(same ? {} : { difference: deferredAssemblyDifference(a, b) }) };
    } finally { inCore.visual.dispose(); deferred.visual.dispose(); }
  }
  rows.push(row);
  console.log(id, Object.entries(row.builds).map(([name, b]) => `${name} ${b.same ? 'same' : 'DIFFERS'} slice ${b.inCoreMaxSliceMs} -> ${b.deferredMaxSliceMs} ms`).join(' | '));
}
const json = option('json');
if (json) writeFileSync(json, JSON.stringify({ builds, suited: rows.length, failures, rows }, null, 1) + '\n');
console.log(`deferred-assembly-parity: ${rows.length} suited ids x ${builds.length} builds, ${failures} different`);
process.exitCode = failures ? 1 : 0;
