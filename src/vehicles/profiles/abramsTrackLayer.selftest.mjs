import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const M1_VARIANTS = [
  'm1a1',
  'm1a1ha',
  'ua_m1a1',
  'm1a2',
  'm1a2_tusk',
  'm1a2_sepv2',
  'm1a2_sepv3',
];
const REMOVED_DUPLICATE_NAMES = new Set([
  'gear_frontRampPadBelt',
  'gear_wrapPadsL',
  'gear_wrapPadsR',
]);

for (const id of M1_VARIANTS) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
    staticPreview: true,
  });
  await Promise.resolve();

  try {
    const names = new Set();
    tank.root.traverse((object) => names.add(object.name));
    for (const name of REMOVED_DUPLICATE_NAMES) {
      assert.equal(names.has(name), false,
        `${id}: obsolete static track overlay ${name} is absent`);
    }
    assert.ok(names.has('gearTrackBandL'), `${id}: canonical left track band remains`);
    assert.ok(names.has('gearTrackBandR'), `${id}: canonical right track band remains`);
    assert.ok(names.has('gearTrackPads'), `${id}: canonical animated track pads remain`);
  } finally {
    tank.dispose();
  }
}

console.log(`abramsTrackLayer.selftest: ${M1_VARIANTS.length} M1 variants use one canonical track layer`);
