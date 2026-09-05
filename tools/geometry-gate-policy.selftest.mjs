import assert from 'node:assert/strict';
import {
  QUALITY_GATE_FLOORS,
  requiredMinimumForQualityBar,
  unavailableOracleReport,
} from './geometry-gate-policy.mjs';

assert.deepEqual(QUALITY_GATE_FLOORS, { fleet: 90, exemplar: 92, preservation: 99 },
  'quality policy publishes the fleet and rebuilt-exemplar floors');
assert.equal(requiredMinimumForQualityBar('exemplar'), 92,
  'ground-up vehicle rebuilds use the stricter 92-point floor');
assert.equal(requiredMinimumForQualityBar('preservation'), 99,
  'frozen first-party preservation requires near-identical geometry, not source fidelity');
assert.equal(requiredMinimumForQualityBar('unknown'), 90,
  'unrecognized legacy registrations retain the fleet floor');

const missing = unavailableOracleReport('vt4a1', 'exemplar');
assert.equal(missing.geoMin, 0, 'a missing registered oracle cannot inherit a stale score');
assert.equal(missing.requiredMinimum, 92, 'missing exemplar keeps its strict floor');
assert.equal(missing.gatePassed, false, 'missing registered oracle fails closed');
assert.equal(missing.components.oracleAvailability, 0,
  'missing-oracle reason remains machine-readable');

console.log('geometry-gate-policy.selftest: 90/92 source floors, 99 preservation floor and fail-closed policy verified');
