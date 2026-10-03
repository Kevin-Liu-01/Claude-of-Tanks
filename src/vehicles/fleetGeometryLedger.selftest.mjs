// The fleet geometry ledger (docs/references/fleet-geometry-ledger.json) replaces the frozen per-receipt geometry pins
// retired on 2026-10-01 (owner: "Retire frozen pins"). Its rows are verified in npm test by the two fleet passes that
// already build the whole fleet with the ledger's options for their other audits, fleetPassHigh.selftest (HIGH) and
// fleetPassLow.selftest (LOW), so the ledger costs no second fleet build. An intended geometry change re-pins in one
// command (npm run tank:geometry:update) and the reviewed diff names the tanks and rig groups that moved.
//
// This receipt guards the ledger itself: it covers exactly the playable roster at both qualities, both passes run in
// npm test and feed it, a probe build reproduces its row, and the comparison bites (a moved row, one moved vertex,
// a missing or extra tank, a foreign camo seed or build option, a tank the sweep never built).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SELFTEST_SUITES } from '../../tools/selftest-suites.mjs';
import {
  LEDGER_QUALITIES, compareFleetGeometry, createFleetGeometryLedgerAudit, digestTankRoot, fleetRoster,
  ledgerBuildOptions, readFleetGeometryLedger,
} from '../../tools/fleet-geometry-digest.mjs';
import { ALL_TANK_IDS } from './specs.ts';
import { createTank } from './tankFactory.ts';

const ledger = readFleetGeometryLedger();
const roster = fleetRoster();
assert.deepEqual([...ALL_TANK_IDS].sort(), roster, 'the ledger roster is the playable roster');
assert.deepEqual(Object.keys(ledger.tanks), roster, 'one sorted ledger row per playable tank');
assert.deepEqual(ledger.qualities, [...LEDGER_QUALITIES], 'HIGH and LOW rows');
assert.deepEqual({ ...ledger.build, quality: 'low' }, ledgerBuildOptions('low'), 'the ledger records the build it digests');
const GROUP_KEYS = ['gun', 'hull', 'other', 'runningGear', 'turret'];
for (const id of roster) for (const quality of LEDGER_QUALITIES) {
  const row = ledger.tanks[id][quality];
  assert.ok(row && /^[0-9a-f]{16}$/.test(row.digest), `${id}/${quality}: digest recorded`);
  assert.ok(row.meshes > 0 && row.vertices > 0 && row.triangles > 0, `${id}/${quality}: non-empty mesh census`);
  assert.deepEqual(Object.keys(row.groups).sort(), GROUP_KEYS, `${id}/${quality}: every rig group rolled up`);
}

// Both fleet passes run in npm test and feed the ledger from the builds they already make: the ledger audit is the
// first audit of each pass (so it digests each fresh build before anything reads it), built with the pass's own options.
const registered = Object.values(SELFTEST_SUITES).flat();
for (const [file, source, quality] of [
  ['src/vehicles/fleetPassHigh.selftest.mjs', readFileSync(new URL('./fleetPassHigh.selftest.mjs', import.meta.url), 'utf8'), 'high'],
  ['src/vehicles/fleetPassLow.selftest.mjs', readFileSync(new URL('./fleetPassLow.selftest.mjs', import.meta.url), 'utf8'), 'low'],
]) {
  assert.ok(registered.includes(file), `${file} runs in npm test`);
  assert.match(source, new RegExp(`const BUILD = \\{[^}]*quality: '${quality}'`), `${file} builds the ${quality} ledger model`);
  assert.match(source, /build: BUILD,/, `${file} hands its BUILD to the fleet pass`);
  assert.match(source, /audits: \[\n\s*\{ name: 'fleetGeometryLedger', create: \(\) => createFleetGeometryLedgerPassAudit\(BUILD\) \},/,
    `${file} audits the ledger first, with its own build options`);
}
const passAudit = readFileSync(new URL('../../tools/fleet-geometry-digest.mjs', import.meta.url), 'utf8');
assert.match(passAudit, /check\(id, tank\) \{ geometryLedger\.record\(id, tank\); \}/, 'the pass audit records every fresh build');
assert.match(passAudit, /const ledgerResult = geometryLedger\.finish\(\);\n\s*assert\.deepEqual\(ledgerResult\.problems, \[\]/,
  'the pass audit fails on moved rows');

// A probe build through the audit reproduces its row; every other tank is reported as not built by that sweep.
const PROBE = 'm551_sheridan';
const audit = createFleetGeometryLedgerAudit(ledgerBuildOptions('low'));
const probe = createTank(PROBE, null, ledgerBuildOptions('low'));
try {
  audit.record(PROBE, probe);
  const result = audit.finish();
  assert.equal(result.checked, 1);
  assert.equal(result.problems.length, roster.length - 1, 'only the unbuilt tanks are reported');
  assert.ok(result.problems.every(problem => /: not built by this sweep$/.test(problem)), 'the probe row matches the ledger');

  const before = digestTankRoot(probe.root);
  assert.deepEqual(before, ledger.tanks[PROBE].low, 'the probe digest is its ledger row');
  const rows = { [PROBE]: { low: before } };
  assert.deepEqual(compareFleetGeometry(ledger, rows, { roster, qualities: ['low'] }), [], 'the unmodified ledger passes');

  // One moved vertex moves the tank digest and exactly one rig group, and the comparison names it.
  let mesh = null;
  probe.root.traverse(object => { if (!mesh && object.isMesh && !object.userData?.interiorFill) mesh = object; });
  mesh.geometry.attributes.position.array[0] += 0.001;
  const after = digestTankRoot(probe.root);
  assert.notEqual(after.digest, before.digest, 'one moved vertex changes the tank digest');
  assert.equal(GROUP_KEYS.filter(group => after.groups[group] !== before.groups[group]).length, 1, 'and exactly one group digest');
  const movedVertex = compareFleetGeometry(ledger, { [PROBE]: { low: after } }, { qualities: ['low'] });
  assert.equal(movedVertex.length, 1);
  assert.match(movedVertex[0], new RegExp(`^${PROBE}/low: geometry moved \\((gun|hull|other|runningGear|turret);`));

  const movedRow = structuredClone(ledger);
  movedRow.tanks[PROBE].low.digest = '0000000000000000';
  assert.equal(compareFleetGeometry(movedRow, rows, { qualities: ['low'] }).length, 1, 'a moved row is reported');
  const missingQuality = structuredClone(ledger);
  delete missingQuality.tanks[PROBE].low;
  assert.match(compareFleetGeometry(missingQuality, rows, { qualities: ['low'] }).join('\n'), /missing ledger row/);
  assert.match(compareFleetGeometry(ledger, { [PROBE]: {} }, { qualities: ['low'] }).join('\n'), /missing measured row/);
  const missing = structuredClone(ledger);
  delete missing.tanks[roster[0]];
  assert.match(compareFleetGeometry(missing, rows, { roster }).join('\n'), new RegExp(`^${roster[0]}: missing from the ledger$`, 'm'));
  const extra = structuredClone(ledger);
  extra.tanks.retired_tank = ledger.tanks[PROBE];
  assert.match(compareFleetGeometry(extra, rows, { roster }).join('\n'), /^retired_tank: in the ledger but not in the playable roster$/m);
  const reseeded = structuredClone(ledger);
  reseeded.build.camoSeed = 4000;
  assert.match(compareFleetGeometry(reseeded, rows).join('\n'), /ledger camo seed 4000 != 4242/);
} finally { probe.dispose(); }
assert.throws(() => createFleetGeometryLedgerAudit({ ...ledgerBuildOptions('high'), batchStatic: true }),
  /build option batchStatic=true differs/, 'a sweep with other build options cannot verify the ledger');
assert.throws(() => createFleetGeometryLedgerAudit({ ...ledgerBuildOptions('high'), camoSeed: 4000 }), /build option camoSeed/);
assert.throws(() => ledgerBuildOptions('ai'), /unknown quality 'ai'/);
console.log(`fleetGeometryLedger.selftest: ${roster.length} tanks x ${LEDGER_QUALITIES.join('/')} recorded; both fleet passes wired; probe ${PROBE} reproduces its row; negative controls bite`);
