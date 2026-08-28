import assert from 'node:assert/strict';
import './tankFactory.ts';
import { SAVED_TANK_IDS, TANK_SPECS } from './specs.js';
import {
  VEHICLE_ERAS,
  VEHICLE_ERA_ORDER,
  VEHICLE_ERA_META,
  isVehicleRole,
  vehicleEraForId,
  vehicleEraLabel,
} from './taxonomy.ts';

const counts = new Map(VEHICLE_ERA_ORDER.map((era) => [era, 0]));
for (const id of SAVED_TANK_IDS) {
  const spec = TANK_SPECS[id];
  assert.equal(Object.hasOwn(spec, 'class'), false, `${id}: retired class field is absent`);
  assert.equal(spec.era, vehicleEraForId(id), `${id}: registry uses its canonical era`);
  assert.ok(VEHICLE_ERA_META[spec.era], `${id}: era is recognized`);
  assert.ok(isVehicleRole(spec.role), `${id}: internal mechanical role is valid`);
  counts.set(spec.era, counts.get(spec.era) + 1);
}

for (const era of VEHICLE_ERA_ORDER) {
  assert.ok(counts.get(era) > 0, `${vehicleEraLabel(era)} has at least one saved vehicle`);
}

assert.equal(TANK_SPECS.leichttraktor.era, VEHICLE_ERAS.INTERWAR);
assert.equal(TANK_SPECS.tiger1.era, VEHICLE_ERAS.WORLD_WAR_II);
assert.equal(TANK_SPECS.m60a1.era, VEHICLE_ERAS.COLD_WAR);
assert.equal(TANK_SPECS.challenger2.era, VEHICLE_ERAS.MODERN);
assert.equal(TANK_SPECS.abramsx.era, VEHICLE_ERAS.NEXT_GENERATION);
assert.equal(vehicleEraLabel(VEHICLE_ERAS.WORLD_WAR_II, { short: true }), 'WWII');

console.log(`taxonomy.selftest: ${SAVED_TANK_IDS.length} saved vehicles across ${counts.size} canonical eras`);
