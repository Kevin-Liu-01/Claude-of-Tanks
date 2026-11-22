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
// pitch range and recoil (workingPintleCradleAudit.test-support.mjs; it reads the build and poses nothing). Release 230:
// so do the American M2 and M240 working stations, the TTS-derived RWS towers and the armed open-yoke towers.
// Release 274 (turret-deck-gate): every turret's foot stands at least a centimetre over the deck it turns over, no hull
// kit beside it stands over it, and the seat brought the whole foot onto its plane (turretDeckAudit.test-support.mjs).
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
import { createTurretDeckAudit } from './turretDeckAudit.test-support.mjs';

// 274: the turret-deck gate's carry (what a hull keeps until its own fix lands) and the ids their own lanes are fixing
// (measured, never failing here)
const TURRET_DECK_CARRY = Object.freeze({
  // the turret's foot 1.7 cm into its deck on the right rear; the seat is 5.5 cm short of the plane there (the Merkava hull)
  merkava4b: { deck: 1, props: 0 },
  // the driver's hatch 2.3 cm over the turret's front foot (t54Family addHullFront); the photo check is owed
  t55a: { deck: 0, props: 1 },
  type59: { deck: 0, props: 1 },
  // the engine plateau itself stands 1.4 cm over the bustle's foot, so its grilles stand 3.5 cm over it (the hull)
  amx40_proto: { deck: 0, props: 1 },
  // a 0.22 m ring: hull kit 4.7 cm over the small turret's foot ahead-right
  ares_apc: { deck: 0, props: 1 },
  // deck kit on the right 2 cm over the foot; its foot inside the builder's own keep radius (1.02 m), which the foot band
  // honours again since 274 fix2 (the Abrams' relieved floor)
  bmpt_terminator2: { deck: 1, props: 1 },
  // the classic turret opts out of the foot band (modern3.ts buildM2A2Bradley): its foot 2.1 cm into the hull kit ahead-left
  m2a2_bradley: { deck: 1, props: 0 },
});
const TURRET_DECK_LANES = Object.freeze(['dardo', 'leopard2_proto', 'marder1a3', 't80uk']);

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
    { name: 'workingPintleCradle', create: () => createWorkingPintleCradleAudit({
      minimumStations: { pintleMG: 60, americanM2: 12, americanRws: 3, openYokeRws: 9 } }) },
    { name: 'turretDeck', create: () => createTurretDeckAudit({ carry: TURRET_DECK_CARRY, exclude: TURRET_DECK_LANES }) },
    { name: 'tankAssets', create: createTankAssetsAudit },
  ],
});
