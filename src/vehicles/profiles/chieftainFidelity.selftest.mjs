import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

const receipts = new Map();

for (const id of ['chieftain5', 'chieftain_mk10']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const hullRig = tank.root.getObjectByName('rig_hull');
  assert.equal(hullRig.userData.nativeRoadWheelStations, 6,
    `${id}: all six suspension-driven road-wheel stations remain`);

  const bands = [];
  const idlers = [];
  tank.root.traverse((object) => {
    if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') bands.push(object);
    if (object.name === 'gearEndWheelBody' && object.position.z > 0) idlers.push(object);
  });
  assert.deepEqual(bands.map((band) => band.name).sort(), ['gearTrackBandL', 'gearTrackBandR'],
    `${id}: exactly one native smart course per side`);
  assert.equal(idlers.length, 2, `${id}: one front idler per side`);
  for (const idler of idlers) {
    assert(Math.abs(idler.position.z - 3.02) < 1e-9,
      `${id}: source-spaced idler reaches beneath the bow shoulder`);
    assert(Math.abs(idler.position.y - 0.64) < 1e-9,
      `${id}: idler stays seated on the raised return-run tangent`);
  }
  for (const band of bands) {
    band.geometry.computeBoundingBox();
    assert(band.geometry.boundingBox.max.z > 3.40,
      `${id}: animated tread wraps through the forward mudguard station`);
  }

  const turret = tank.root.getObjectByName('turret');
  receipts.set(id, turret.geometry.attributes.position.count);
  tank.dispose();
}

assert(receipts.get('chieftain_mk10') >= receipts.get('chieftain5') + 200,
  'Mk.10: closed, supported Stillbrew cheek/roof complex remains distinct from the clean Mk.5 casting');

console.log('chieftainFidelity.selftest: forward idlers, single courses, cast cheeks, and closed Stillbrew fit verified');
