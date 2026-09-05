import assert from 'node:assert/strict';
import { createTank } from '../src/vehicles/tankFactory.ts';
import { isTrackShoeMesh } from './track-clip-classification.mjs';

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
console.log('track-clip-classification.selftest: native shoes included; suspension mounts excluded');
