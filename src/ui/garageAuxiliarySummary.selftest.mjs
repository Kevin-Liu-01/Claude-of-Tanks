// garageAuxiliarySummary.selftest.mjs — the garage's auxiliary-kit counts agree with the full inventory (FE-P2).
// `npm run tank:controls:check` regenerates both files from a fleet build; this receipt keeps the derived
// summary honest in npm test without building the fleet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUXILIARY_INVENTORY } from '../vehicles/auxiliaryInventory.generated.ts';
import { GARAGE_AUXILIARY_SUMMARY } from './garageAuxiliarySummary.generated.ts';

assert.deepEqual(Object.keys(GARAGE_AUXILIARY_SUMMARY), Object.keys(AUXILIARY_INVENTORY),
  'one summary row per inventoried vehicle, in inventory order');
for (const [id, kit] of Object.entries(AUXILIARY_INVENTORY)) {
  assert.deepEqual(GARAGE_AUXILIARY_SUMMARY[id], [kit.smoke.length, kit.lights ? 1 : 0, kit.guns.length],
    `${id}: [smoke launchers, driving lights, roof guns] must match auxiliaryInventory.generated.ts`);
}
assert.ok(Object.values(GARAGE_AUXILIARY_SUMMARY).some(([smoke, lights, guns]) => smoke && lights && guns),
  'the fixture of real data covers all three controls');

const garage = readFileSync(new URL('./garage.ts', import.meta.url), 'utf8');
assert.doesNotMatch(garage, /from ['"][^'"]*auxiliaryInventory(?:\.generated)?\.ts['"]/,
  'the garage reads the counts, never the 217 kB mount-geometry inventory');
assert.match(garage, /from '\.\/garageAuxiliarySummary\.generated\.ts'/);
const generator = readFileSync(new URL('../../tools/vehicle-controls-inventory.mjs', import.meta.url), 'utf8');
assert.match(generator, /src\/ui\/garageAuxiliarySummary\.generated\.ts/,
  'tank:controls:update/check own the summary beside the inventory');

console.log(`garageAuxiliarySummary.selftest: ${Object.keys(GARAGE_AUXILIARY_SUMMARY).length} vehicles agree with the inventory`);
