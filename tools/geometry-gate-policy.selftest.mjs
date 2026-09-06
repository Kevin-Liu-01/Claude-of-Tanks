import assert from 'node:assert/strict';
import {
  QUALITY_GATE_FLOORS,
  requiredMinimumForQualityBar,
  unavailableOracleReport,
  geometryReceiptPassed,
  evaluateGeometryGate,
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
const exact={qualityBar:'exemplar',requiredMinimum:92,geoMin:92,gatePassed:true};
assert.equal(geometryReceiptPassed(exact),true);
assert.equal(geometryReceiptPassed({...exact,gatePassed:false}),false,'rounded 91.99 does not become a pass');
assert.equal(geometryReceiptPassed({...exact,geoMin:91.9}),false);
assert.equal(geometryReceiptPassed({...exact,requiredMinimum:90,geoMin:91}),false,'certificate cannot lower named floor');
assert.equal(geometryReceiptPassed({...exact,geoMin:NaN}),false);
assert.equal(geometryReceiptPassed({geoMin:100}),false,'missing decision is not a pass');
assert.equal(geometryReceiptPassed(null),false);
for(const value of [91.96,91.996,NaN,Infinity]) {
  const decision=evaluateGeometryGate({qualityBar:'exemplar',components:{whole:98,stations:value,dims:97}});
  assert.equal(decision.gatePassed,false,'an unrounded sub-floor or nonfinite component fails');
  assert.equal(geometryReceiptPassed({...exact,rawGeoMin:value}),false);
  assert.equal(geometryReceiptPassed({...exact,rawComponents:{stations:value}}),false);
}
assert.equal(evaluateGeometryGate({qualityBar:'exemplar',components:{stations:92,dims:92}}).gatePassed,true);
assert.equal(evaluateGeometryGate({qualityBar:'exemplar',components:{}}).gatePassed,false);
const page=await(await import('node:fs/promises')).readFile(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
assert.match(page,/stations: stationScore[,\n]/);
assert.match(page,/dims: dimScore[,\n]/);
assert.match(page,/gatePassed: geometryGate.gatePassed/);
assert.doesNotMatch(page,/(?:wPct|topPct):[^\n]*toFixed/,'station errors stay unrounded');
assert.doesNotMatch(page,/dimRows.push\([^\n]*toFixed/,'dimensional errors stay unrounded');

console.log('geometry-gate-policy.selftest: 90/92 source floors, 99 preservation floor and fail-closed policy verified');
