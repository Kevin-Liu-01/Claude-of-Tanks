// Every fleet audit that reads the unbatched seed-4242 LOW build, on one construction per tank (gate plan "one fleet
// pass", 2026-10-02; the rules are in fleetPass.test-support.mjs). It replaces gunArticulation.selftest and
// eraGameplayRegistration.selftest. The ledger's LOW rows are digested first, before anything reads the build (re-pin
// moved rows with npm run tank:geometry:update after review); the ERA audit strips and resets every depletable zone,
// which the pass verifies leaves the build unchanged; gun articulation poses the gun, so it comes last.
import { runFleetPass } from './fleetPass.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS } from './specs.ts';
import { createFleetGeometryLedgerPassAudit } from '../../tools/fleet-geometry-digest.mjs';
import { createEraGameplayRegistrationAudit } from './eraGameplayRegistrationAudit.test-support.mjs';
import { createGunArticulationAudit } from './gunArticulationAudit.test-support.mjs';

const BUILD = { proceduralOnly: true, quality: 'low', camoSeed: 4242, geometryReceipt: true, batchStatic: false };

await runFleetPass({
  name: 'fleetPassLow',
  build: BUILD,
  createTank,
  ids: ALL_TANK_IDS,
  audits: [
    { name: 'fleetGeometryLedger', create: () => createFleetGeometryLedgerPassAudit(BUILD) },
    { name: 'eraGameplayRegistration', create: createEraGameplayRegistrationAudit },
    { name: 'gunArticulation', create: createGunArticulationAudit },
  ],
});
