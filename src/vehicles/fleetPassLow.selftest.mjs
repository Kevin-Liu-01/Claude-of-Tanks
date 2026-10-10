// Every fleet audit that reads the unbatched seed-4242 LOW build, on one construction per tank (gate plan "one fleet
// pass", 2026-10-02; the rules are in fleetPass.test-support.mjs). It replaces gunArticulation.selftest and
// eraGameplayRegistration.selftest. The ledger's LOW rows are digested first, before anything reads the build (re-pin
// moved rows with npm run tank:geometry:update after review); the ERA audit strips and resets every depletable zone,
// which the pass verifies leaves the build unchanged; gun articulation poses the gun, so it comes last.
import { createCircularCapAudit } from '../../tools/circular-cap-audit.mjs';
import { runFleetPass } from './fleetPass.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';
import { createFleetGeometryLedgerPassAudit } from '../../tools/fleet-geometry-digest.mjs';
import { createEraGameplayRegistrationAudit } from './eraGameplayRegistrationAudit.test-support.mjs';
import { createGunArticulationAudit } from './gunArticulationAudit.test-support.mjs';
import { createTrackContactDerivationAudit } from './trackContactDerivationAudit.test-support.mjs';
import { createRunningGearRegistrationAudit } from './runningGearRegistrationAudit.test-support.mjs';

const BUILD = { proceduralOnly: true, quality: 'low', camoSeed: 4242, geometryReceipt: true, batchStatic: false };

await runFleetPass({
  name: 'fleetPassLow',
  build: BUILD,
  createTank,
  ids: ALL_TANK_IDS,
  audits: [
    { name: 'fleetGeometryLedger', create: () => createFleetGeometryLedgerPassAudit(BUILD) },
    // 2026-10-04: the LOW build registers exactly the running-gear units it draws (a profile may branch on quality)
    { name: 'runningGearRegistration', create: createRunningGearRegistrationAudit },
    { name: 'circularCapOverlap', create: () => createCircularCapAudit({ quality: 'low' }) },
    { name: 'eraGameplayRegistration', create: createEraGameplayRegistrationAudit },
    // 2026-10-04 (physics lane round 8): every tank's LOW build derives its published track contact (with the HIGH pass:
    // the two tiers agree within 1 cm), and the run's ends sit where its drawn band leaves the ground
    { name: 'trackContactDerivation', create: () => createTrackContactDerivationAudit('LOW') },
    { name: 'gunArticulation', create: createGunArticulationAudit },
  ],
});
