// Every fleet audit that reads the factory's default build ({ proceduralOnly, geometryReceipt }: seed 4000, HIGH,
// unbatched), the build tools/gen-vehicle-marking-seats.mjs and tools/gen-combat-anatomy.mjs measure, on one
// construction per tank (gate plan "one fleet pass", 2026-10-02; the rules are in fleetPass.test-support.mjs). It
// replaces combatAnatomy.selftest, mudguardFenderSeating.selftest, vehicleMarkings.selftest and tankAssets.selftest,
// and carries the fleet watertight gate (2026-10-02, watertightAudit.test-support.mjs). The first four read the build as
// it leaves the factory (vehicleMarkings restores the turret yaw it probes; watertight attaches the shipped fills and
// removes them again); tankAssets lets one microtask run before it certifies the shadow casters, so it comes last.
// The watertight gate passes the inherited leakers named in docs/geometry-gate/watertight-carry.json at exactly their
// listed litres and fails any other leak, a larger or smaller one, or a listed hull that now holds water (2026-10-16, R7c).
// The running-gear registration audit (2026-10-04) reads first: the units P.gear registers are the units drawn.
// Release 229: every working pintle rides its cradle, its moving parts 1.5 mm clear of its own mount through its profile's
// pitch range and recoil (workingPintleCradleAudit.test-support.mjs; it reads the build and poses nothing).
import { runFleetPass } from './fleetPass.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';
import { createCombatAnatomyAudit } from './combatAnatomyAudit.test-support.mjs';
import { createMudguardFenderSeatingAudit } from './mudguardFenderSeatingAudit.test-support.mjs';
import { createVehicleMarkingsAudit } from './vehicleMarkingsAudit.test-support.mjs';
import { createWatertightAudit } from './watertightAudit.test-support.mjs';
import { createTankAssetsAudit } from './tankAssetsAudit.test-support.mjs';
import { createRunningGearRegistrationAudit } from './runningGearRegistrationAudit.test-support.mjs';
import { createWorkingPintleCradleAudit } from './workingPintleCradleAudit.test-support.mjs';

await runFleetPass({
  name: 'fleetPassDefault',
  build: { proceduralOnly: true, geometryReceipt: true },
  createTank,
  ids: ALL_TANK_IDS,
  audits: [
    // 2026-10-04: every running-gear unit registered is a unit drawn, and every unit drawn is registered
    { name: 'runningGearRegistration', create: createRunningGearRegistrationAudit },
    { name: 'combatAnatomy', create: createCombatAnatomyAudit },
    { name: 'mudguardFenderSeating', create: createMudguardFenderSeatingAudit },
    { name: 'vehicleMarkings', create: createVehicleMarkingsAudit },
    { name: 'watertight', create: createWatertightAudit },
    { name: 'workingPintleCradle', create: () => createWorkingPintleCradleAudit({ minimumStations: 60 }) },
    { name: 'tankAssets', create: createTankAssetsAudit },
  ],
});
