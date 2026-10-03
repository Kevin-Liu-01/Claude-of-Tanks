// auxiliaryRoofGuns.selftest.mjs — combat anatomy's roof-gun table agrees with the full inventory.
// `npm run tank:controls:check` regenerates all three files from a fleet build; this receipt keeps the derived
// table honest in npm test without building the fleet, and keeps the spec finalizer off the 217 kB inventory
// (fleetFactory.ts, in the garage boot, imports combatAnatomy.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUXILIARY_INVENTORY } from './auxiliaryInventory.generated.ts';
import { AUXILIARY_ROOF_GUNS } from './auxiliaryRoofGuns.generated.ts';

const expected = Object.fromEntries(Object.entries(AUXILIARY_INVENTORY)
  .filter(([, kit]) => kit.guns[0]?.collisionParts?.length)
  .map(([id, kit]) => [id, kit.guns[0]]));
assert.deepEqual(Object.keys(AUXILIARY_ROOF_GUNS), Object.keys(expected),
  'one row per vehicle whose first roof gun has collision parts, in inventory order');
for (const [id, gun] of Object.entries(expected)) {
  assert.deepEqual(AUXILIARY_ROOF_GUNS[id], gun, `${id}: the roof gun must match auxiliaryInventory.generated.ts`);
}
assert.ok(Object.keys(AUXILIARY_ROOF_GUNS).length > 0, 'the fleet has damageable roof guns to cover');
const withoutParts = Object.entries(AUXILIARY_INVENTORY).find(([, kit]) => kit.guns.length && !kit.guns[0].collisionParts?.length);
if (withoutParts) assert.equal(AUXILIARY_ROOF_GUNS[withoutParts[0]], undefined, 'a roof gun without collision parts adds no module');

const anatomy = readFileSync(new URL('./combatAnatomy.ts', import.meta.url), 'utf8');
assert.doesNotMatch(anatomy, /^import (?!type )[^;]*from '\.\/auxiliaryInventory(?:\.generated)?\.ts';/m,
  'combat anatomy reads the roof-gun table, never the mount-geometry inventory at runtime');
assert.match(anatomy, /from '\.\/auxiliaryRoofGuns\.generated\.ts'/);
const generator = readFileSync(new URL('../../tools/vehicle-controls-inventory.mjs', import.meta.url), 'utf8');
assert.match(generator, /src\/vehicles\/auxiliaryRoofGuns\.generated\.ts/,
  'tank:controls:update/check own the roof-gun table beside the inventory');

console.log(`auxiliaryRoofGuns.selftest: ${Object.keys(AUXILIARY_ROOF_GUNS).length} roof guns agree with the inventory`);
