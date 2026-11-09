import assert from 'node:assert/strict';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { expectedTrackBandCount, isTrackShoeMesh } from './track-clip-classification.mjs';

const tank = createTank('leo2_revolution', null, { proceduralOnly: true, geometryReceipt: true });
try {
  const classified = [];
  tank.root.traverse((object) => { if (isTrackShoeMesh(object)) classified.push(object.name); });
  assert.deepEqual(classified.sort(), ['gearTrackPads', 'gearTrackPadsSimplified'],
    'both native shoe detail levels participate in the strict envelope audit');
  for (const name of ['gearSuspensionLinks', 'gearSuspensionJointBosses']) {
    const object = tank.root.getObjectByName(name);
    assert.ok(object?.isInstancedMesh && object.parent?.isLOD && object.count >= 8,
      `${name}: exercise the actual LOD-owned suspension shape that fooled the old classifier`);
    assert.equal(isTrackShoeMesh(object), false,
      `${name}: a hull-mounted suspension part cannot become an animated track shoe`);
  }
  const pad = tank.root.getObjectByName('gearTrackPads');
  const originalName = pad.name;
  pad.name = 'renamed-native-shoes';
  assert.equal(isTrackShoeMesh(pad), true, 'shoe identity survives a diagnostic display-name change');
  pad.name = originalName;
} finally {
  tank.dispose();
}
// two bands per running-gear unit: one unit on a conventional tank, two on the four-track T95
for (const [id, units] of [['leo2_revolution', 1], ['t95', 2]]) {
  const built = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const bands = [];
    built.root.traverse((object) => { if (/^gearTrackBand[LR]$/.test(object.name)) bands.push(object); });
    assert.equal(bands.length, 2 * units, `${id}: live bands`);
    assert.equal(expectedTrackBandCount(bands), bands.length, `${id}: the audit expects every unit's pair`);
  } finally {
    built.dispose();
  }
}
assert.equal(expectedTrackBandCount([]), 2, 'no bands still expects the factory pair (the hand-rolled fallback)');
console.log('track-clip-classification.selftest: native shoes included; suspension mounts excluded; two bands per running-gear unit');
