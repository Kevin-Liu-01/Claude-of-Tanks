import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const receipts = new Map();
const turretHeights = new Map();

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
    const trackWidth = band.geometry.boundingBox.max.x - band.geometry.boundingBox.min.x;
    const expectedWidth = id === 'chieftain5' ? 0.656 : 0.61;
    assert(Math.abs(trackWidth - expectedWidth) < 1e-6,
      `${id}: native course retains its authored ${expectedWidth.toFixed(3)} m width`);
    if (id === 'chieftain5') {
      const innerFace = Math.abs(band.position.x) - trackWidth / 2;
      assert(Math.abs(innerFace - 1.1165) < 1e-6,
        'Mk.5: doubled track grows outward from the original inner running clearance');
    }
  }

  const turret = tank.root.getObjectByName('turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  turret.geometry.computeBoundingBox();
  turretHeights.set(id, turret.geometry.boundingBox.max.y - turret.geometry.boundingBox.min.y);
  assert(Math.abs(gunRig.position.y - 0.084) < 1e-9,
    `${id}: unchanged L11 assembly is reseated on the compressed trunnion datum`);
  receipts.set(id, turret.geometry.attributes.position.count);

  if (id === 'chieftain_mk10') {
    const forehead = tank.root.userData.combatGeometryParts.find((part) =>
      part.bucket === 'turret'
      && part.min[0] < -0.97 && part.max[0] > 0.97
      && part.min[2] <= 0.50 && part.max[2] >= 1.51);
    assert(forehead,
      'Mk.10: Stillbrew upper forehead reaches forward into the supported mantlet throat');
  }
  tank.dispose();
}

for (const [id, height] of turretHeights) {
  assert(Math.abs(height - 1.05824) < 1e-5,
    `${id}: merged turret height is exactly 20% below the 1.3228 m owner rebuild`);
}

assert(receipts.get('chieftain_mk10') >= receipts.get('chieftain5') + 200,
  'Mk.10: closed, supported Stillbrew cheek/roof complex remains distinct from the clean Mk.5 casting');

console.log('chieftainFidelity.selftest: forward idlers, single courses, cast cheeks, and closed Stillbrew fit verified');
