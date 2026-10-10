// Every fleet audit that reads the unbatched seed-4242 HIGH build, on one construction per tank (gate plan "one fleet
// pass", 2026-10-02; the rules are in fleetPass.test-support.mjs). It replaces wheelQuality.selftest (which already
// shared this build between the ledger, machine-gun mount, end-wrap and wheel audits: 594 constructions became 198)
// and surfaceMarkupFleet.selftest. The ledger's HIGH rows are digested first, before anything reads the build; re-pin
// moved rows with npm run tank:geometry:update after review. Keep both rosters when they diverge.
import assert from 'node:assert/strict';
import { Group } from 'three';
import { createCircularCapAudit } from '../../tools/circular-cap-audit.mjs';
import { runFleetPass } from './fleetPass.test-support.mjs';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, DEVELOPMENT_TANK_IDS } from './specs.ts';
import { createFleetGeometryLedgerPassAudit } from '../../tools/fleet-geometry-digest.mjs';
import { createMachineGunAttachmentAudit } from './profiles/machineGunAttachment.test-support.mjs';
import { createTrackEndWrapAudit } from './trackEndWrap.test-support.mjs';
import { createWheelQualityAudit } from './wheelQualityAudit.test-support.mjs';
import { createSurfaceMarkupFleetAudit } from '../gallery/surfaceMarkupFleetAudit.test-support.mjs';
import { createDrawnGeometryShapeAudit } from '../world/geometryStreams.test-support.mjs';
import { createTrackContactDerivationAudit } from './trackContactDerivationAudit.test-support.mjs';
import { createRunningGearRegistrationAudit } from './runningGearRegistrationAudit.test-support.mjs';

const BUILD = { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true, batchStatic: false };

function machineGunMounts() {
  const root = new Group(), fitting = new Group();
  fitting.userData = { fittingRoot: true, fitting: 'pintleMG' };
  root.add(fitting);
  assert.throws(() => createMachineGunAttachmentAudit().check('detached-fixture', { root }), /attached to a vehicle rig/,
    'the shared inspection still rejects a mounted weapon outside every tank rig');
  const mounts = createMachineGunAttachmentAudit();
  return {
    check: mounts.check,
    finish() {
      const counts = mounts.finish();
      console.log(`fleet mounts: ${counts.fittingCount} fittings on ${counts.tankCount} tanks`);
    },
  };
}

function trackEndWraps() {
  const wraps = createTrackEndWrapAudit();
  return { check: wraps.check, finish: () => console.log(`fleet track wraps: ${JSON.stringify(wraps.finish())}`) };
}

await runFleetPass({
  name: 'fleetPassHigh',
  build: BUILD,
  createTank,
  ids: new Set([...ALL_TANK_IDS, ...DEVELOPMENT_TANK_IDS]),
  audits: [
    { name: 'fleetGeometryLedger', create: () => createFleetGeometryLedgerPassAudit(BUILD) },
    // every drawn geometry keeps fast attribute objects (no deleteAttribute on what the renderer draws; reads only)
    { name: 'drawnGeometryShape', create: createDrawnGeometryShapeAudit },
    // 2026-10-04: the development hulls too register exactly the running-gear units they draw
    { name: 'runningGearRegistration', create: createRunningGearRegistrationAudit },
    { name: 'circularCapOverlap', create: () => createCircularCapAudit({ quality: 'high' }) },
    // the mount inspection keeps its authored camo seed; camo seeds do not move the running gear
    { name: 'machineGunAttachment', ids: DEVELOPMENT_TANK_IDS, create: machineGunMounts },
    { name: 'trackEndWrap', ids: ALL_TANK_IDS, create: trackEndWraps },
    { name: 'wheelQuality', ids: ALL_TANK_IDS, create: createWheelQualityAudit },
    // 2026-10-04 (physics lane round 8): every tank's HIGH build derives its published track contact (with the LOW pass:
    // the two tiers agree within 1 cm), and the run's ends sit where its drawn band leaves the ground
    { name: 'trackContactDerivation', ids: ALL_TANK_IDS, create: () => createTrackContactDerivationAudit('HIGH') },
    { name: 'surfaceMarkupFleet', ids: ALL_TANK_IDS, create: createSurfaceMarkupFleetAudit },
  ],
});
