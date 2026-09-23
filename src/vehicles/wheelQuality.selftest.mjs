import assert from 'node:assert/strict';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import {
  WHEEL_PATTERN_DEFINITIONS,
  WHEEL_PATTERN_IDS,
  wheelPatternFor,
} from './wheelPatterns.ts';
import { auditTankWheelQuality } from './wheelQuality.ts';

const patternUse = new Map();
const geometrySignatures = new Map();

for (const id of ALL_TANK_IDS) {
  const resolvedA = wheelPatternFor(getSpec(id));
  const resolvedB = wheelPatternFor(getSpec(id));
  assert.deepEqual(resolvedA, resolvedB, `${id}: deterministic wheel pattern`);
  assert(WHEEL_PATTERN_DEFINITIONS[resolvedA.id], `${id}: registered wheel pattern`);

  const tank = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  await Promise.resolve();
  const audit = auditTankWheelQuality(tank.root);
  assert.deepEqual(audit.issues, [], `${id}: ${JSON.stringify(audit.issues)}`);
  assert(audit.patterns.length >= 1, `${id}: runtime wheel pattern receipt`);
  assert(audit.patterns.includes(resolvedA.id),
    `${id}: the family policy must agree with the authored running gear`);

  for (const pattern of audit.patterns) {
    patternUse.set(pattern, (patternUse.get(pattern) || 0) + 1);
  }
  tank.root.traverse((object) => {
    if (object.name !== 'gearRoadWheelDiscs') return;
    const pattern = object.userData.wheelPattern;
    const positionCount = object.geometry?.getAttribute?.('position')?.count || 0;
    const indexCount = object.geometry?.index?.count || 0;
    const signature = `${positionCount}:${indexCount}`;
    const signatures = geometrySignatures.get(pattern) || new Set();
    signatures.add(signature);
    geometrySignatures.set(pattern, signatures);
  });
  tank.dispose();
}

assert.equal(patternUse.size, WHEEL_PATTERN_IDS.length,
  'every authored wheel pattern is represented by the selectable fleet');
assert(patternUse.size >= 10, 'fleet exposes at least ten distinct mechanical wheel patterns');
assert.equal(wheelPatternFor(getSpec('m1a2')).id, 'split-rim-ten', 'Abrams split-rim identity');
assert.equal(wheelPatternFor(getSpec('t90m')).id, 'pressed-six', 'T-90 pressed-wheel identity');
assert.equal(wheelPatternFor(getSpec('merkava4b')).id, 'deep-dish-eight', 'Merkava deep-dish identity');
assert.equal(wheelPatternFor(getSpec('kf51b')).id, 'plain-dish-twelve', 'Leopard-hull family uses the plain dished disc');
assert.equal(wheelPatternFor(getSpec('m60a1')).id, 'cast-five-spoke', 'Patton cast-wheel identity');
// Nation wheel sets (owner 2026-09-22, "standardize our wheels across NATIONS"; nationWheelSets.ts):
assert.equal(wheelPatternFor(getSpec('k21_x')).id, 'armored-hub-six', 'owner 2026-09-23: the K21 draws the BMP-3 ROK (Dragun) wheel');
assert.equal(wheelPatternFor(getSpec('k2_x')).id, 'flanged-twelve', 'K2 retains its own wheel family');
assert.equal(wheelPatternFor(getSpec('type100')).id, 'pressed-six', 'Chinese Type 100 IFV is a donor and keeps its pressed wheel');
assert.equal(wheelPatternFor(getSpec('type10_x')).id, 'flanged-twelve', 'Japanese Type 10 retains its own wheel family');
assert.equal(wheelPatternFor(getSpec('sabra_mk2_x')).id, 'cast-five-spoke', 'owner 2026-09-22: "sabra uses the m60a3 wheels"');
assert.equal(wheelPatternFor(getSpec('mbt70')).id, 'plain-dish-twelve', 'German-registered MBT-70 draws the Leopard 2A6 wheel');
assert.equal(wheelPatternFor(getSpec('type59')).id, 'armored-hub-six', 'Chinese MBT hulls draw the ZTZ-100 wheel');
assert.equal(wheelPatternFor(getSpec('ajax_x')).id, 'armored-hub-six', 'UK IFV hulls draw the Warrior Milan X wheel');
assert.equal(wheelPatternFor(getSpec('bmp2')).id, 'armored-hub-six', 'USSR-registered BMP-2 draws the Russia light wheel (Dragun)');
assert.equal(wheelPatternFor(getSpec('strv81')).id, 'plain-dish-twelve', 'Swedish Centurion draws the Strv 122 wheel');
assert.equal(wheelPatternFor(getSpec('tiger1')).id, 'interleaved-dish', 'pre-1950 hulls keep their period wheel construction');
assert.equal(wheelPatternFor(getSpec('m26_pershing')).id, 'cast-five-spoke', 'pre-1950 hulls keep their period wheel construction');

const uniqueGeometry = new Set();
for (const signatures of geometrySignatures.values()) {
  for (const signature of signatures) uniqueGeometry.add(signature);
}
assert(uniqueGeometry.size >= 8,
  `patterns produce materially different road-wheel geometry (${uniqueGeometry.size} signatures)`);

console.log(`wheelQuality.selftest: ${ALL_TANK_IDS.length} tanks use ${patternUse.size} wheel patterns`);
