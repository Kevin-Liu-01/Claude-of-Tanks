import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const visual = createTank('udes03', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
visual.root.updateMatrixWorld(true);

const hull = visual.root.getObjectByName('rig_hull');
assert.ok(hull, 'UDES 03 owns an articulated hull rig');

const profile = visual.root.getObjectByName('udes03WedgeProfile');
const stations = profile?.userData.stations;
assert.equal(stations?.length, 8, 'UDES 03 wedge is an eight-station continuous closed loft');
assert.ok(stations[0].t <= 1.00 && stations[3].t >= 1.54,
  'cheese wedge climbs at least 54 cm from the beak to its fighting-compartment crown');
assert.ok(stations[0].wt <= 0.95 && stations[3].wt >= 1.37,
  'cheese wedge flares from a narrow beak into broad Swedish shoulder facets');
for (let i = 1; i < stations.length; i++) {
  assert.ok(stations[i].z < stations[i - 1].z,
    'wedge stations remain ordered from bow to stern without folded geometry');
}

for (const side of ['L', 'R']) {
  const ram = visual.root.getObjectByName(`udes03HydraulicRam${side}`);
  assert.equal(ram?.parent, hull, `UDES 03 ${side} nose ram belongs to the hull`);
  assert.equal(ram?.userData.seated, true, `UDES 03 ${side} nose ram is explicitly seated`);
  assert.ok(ram.userData.axis[1] < -0.20 && ram.userData.axis[2] > 0.95,
    `UDES 03 ${side} nose ram follows the sloped glacis toward the bow`);
}

const gear = hull.userData.runningGearReceipts?.[0];
assert.equal(hull.userData.nativeRoadWheelStations, 4,
  'UDES 03 uses its iconic four-station hydropneumatic suspension');
assert.deepEqual(gear?.wheelZs, [1.44, 0.48, -0.48, -1.44],
  'large road wheels form an evenly staged four-wheel course');
assert.equal(gear.sprocket.r, 0.175, 'compact drive sprocket is half its former diameter class');
assert.equal(gear.idler.r, 0.17, 'compact idler is half its former diameter class');
assert.ok(gear.sprocket.r < gear.wheelR * 0.5 && gear.idler.r < gear.wheelR * 0.5,
  'both raised endpoint wheels remain visually subordinate to the four road wheels');
assert.ok(gear.sprocket.y - gear.wheelY >= 0.32 && gear.idler.y - gear.wheelY >= 0.34,
  'front sprocket and rear idler sit high enough to form distinct rising track shoulders');
assert.ok(gear.sprocket.z + gear.sprocket.r < stations[0].z + 0.02,
  'front sprocket remains inside the armored beak envelope');
assert.ok(gear.idler.z - gear.idler.r > stations.at(-1).z - 0.02,
  'rear idler remains inside the armored tail envelope');

const wheelTires = visual.root.getObjectByName('gearRoadWheelTires');
assert.equal(wheelTires?.count, 8, 'four large road wheels are authored on each side');
for (const name of ['gearTrackBandL', 'gearTrackBandR']) {
  const band = visual.root.getObjectByName(name);
  assert.ok(band, `${name} exists as one coherent deformable track course`);
  const bounds = new THREE.Box3().setFromObject(band);
  assert.ok(bounds.max.z >= gear.sprocket.z + gear.sprocket.r - 0.08,
    `${name} wraps the forward sprocket rather than ending at the road wheels`);
  assert.ok(bounds.min.z <= gear.idler.z - gear.idler.r + 0.08,
    `${name} wraps the rear idler rather than ending at the road wheels`);
}

const bore = visual.root.getObjectByName('muzzleBoreShadowDisc');
const boreWorld = bore.getWorldPosition(new THREE.Vector3());
assert.ok(Math.abs(boreWorld.x) < 1e-6 && Math.abs(boreWorld.y - 1.43) < 0.01,
  'fixed gun and muzzle bore remain centered in the armored spine');
assert.ok(boreWorld.z > 4.69 && boreWorld.z < 4.72,
  'muzzle bore stays at the authored fixed-gun tip');

console.log('udes03Fidelity.selftest: wedge, rams, track course and fixed gun passed');
