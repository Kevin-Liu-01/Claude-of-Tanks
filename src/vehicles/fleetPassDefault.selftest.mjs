// Every fleet audit that reads the factory's default build ({ proceduralOnly, geometryReceipt }: seed 4000, HIGH,
// unbatched), the build tools/gen-vehicle-marking-seats.mjs and tools/gen-combat-anatomy.mjs measure, on one
// construction per tank (gate plan "one fleet pass", 2026-10-02; the rules are in fleetPass.test-support.mjs). It
// replaces combatAnatomy.selftest, mudguardFenderSeating.selftest, vehicleMarkings.selftest and tankAssets.selftest.
// The first three read the build as it leaves the factory (vehicleMarkings restores the turret yaw it probes);
// tankAssets lets one microtask run before it certifies the shadow casters, so it comes last.
import { runFleetPass } from './fleetPass.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';
import { createCombatAnatomyAudit } from './combatAnatomyAudit.test-support.mjs';
import { createMudguardFenderSeatingAudit } from './mudguardFenderSeatingAudit.test-support.mjs';
import { createVehicleMarkingsAudit } from './vehicleMarkingsAudit.test-support.mjs';
import { createTankAssetsAudit } from './tankAssetsAudit.test-support.mjs';

await runFleetPass({
  name: 'fleetPassDefault',
  build: { proceduralOnly: true, geometryReceipt: true },
  createTank,
  ids: ALL_TANK_IDS,
  audits: [
    { name: 'combatAnatomy', create: createCombatAnatomyAudit },
    { name: 'mudguardFenderSeating', create: createMudguardFenderSeatingAudit },
    { name: 'vehicleMarkings', create: createVehicleMarkingsAudit },
    { name: 'tankAssets', create: createTankAssetsAudit },
  ],
});
