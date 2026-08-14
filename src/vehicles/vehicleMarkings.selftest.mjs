import assert from 'node:assert/strict';
import { SURFACE_MARKING_STYLE, vehicleMarkingRecord } from './vehicleMarkings.js';

const nations = ['USA', 'Germany', 'USSR', 'Russia', 'UK', 'France', 'China', 'Israel', 'Italy', 'Japan', 'Poland', 'South Korea', 'Sweden', 'Ukraine'];
const records = nations.map((nation, index) => vehicleMarkingRecord({
  id: `tank_${index}`,
  nation,
  visual: { number: String(100 + index) },
}));

assert.equal(new Set(records.map((record) => record.countryCode)).size, 13, 'USSR and Russia share one country filter while other nations remain distinct');
assert.equal(new Set(records.map((record) => record.markingCode)).size, records.length, 'marking codes remain vehicle-specific');
for (const record of records) {
  assert.match(record.designation, /^[A-Z]+-[A-Z0-9 -]+$/, `${record.countryLabel}: designation`);
  assert(record.insignia, `${record.countryLabel}: insignia`);
  assert(record.filterLabel.length <= 3, `${record.countryLabel}: compact country filter label`);
}
assert.equal(SURFACE_MARKING_STYLE.surfaceLiftM, 0.006, 'paint and impact marks share the 6 mm surface layer');
assert.deepEqual(vehicleMarkingRecord({ id: 'stable', nation: 'USA', visual: {} }), vehicleMarkingRecord({ id: 'stable', nation: 'USA', visual: {} }), 'fallback tactical numbers are deterministic');

console.log('vehicleMarkings.selftest: national insignia, tactical numbers, and shared surface style pass');
