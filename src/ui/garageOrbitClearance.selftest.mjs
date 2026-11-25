// garage-env-276: the Garage camera's clearance through its whole orbit (garageOrbitClearance.ts).
// 1. no part of an outdoor pack holds the orbiting camera or blocks its view of the hero, at any of the band's samples;
// 2. planted controls: a post standing on the band holds the camera; a slab across a sightline blocks the hero; a ring
//    whose box swallows the camera but whose triangles keep clear is no finding (the box only nominates).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { auditGarageOrbitClearance, garageOrbitSamples, GARAGE_ORBIT_BAND } from './garageOrbitClearance.ts';
import { buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets } from './garageEnvironmentKit.ts';

// 2. controls first (they hold whatever the packs do)
const samples = garageOrbitSamples();
const canonical = samples.find((s) => s.yawDeg === 0 && s.distanceM === Number(GARAGE_ORBIT_BAND.distancesM[1].toFixed(1))
  && Math.abs(s.pitchDeg - Math.round(GARAGE_ORBIT_BAND.pitchesRad[1] * 180 / Math.PI)) < 1);
const at = canonical.camera;
const post = new THREE.BoxGeometry(0.3, 4, 0.3).translate(at.x, 2, at.z);
post.computeBoundingBox();
assert.deepEqual(auditGarageOrbitClearance([{ label: 'planted post', box: post.boundingBox, geometry: post }]).map((f) => f.split(' (')[0]),
  ['planted post holds the camera'], 'a post on the band holds the camera');
const mid = at.clone().multiplyScalar(0.5);
const slab = new THREE.BoxGeometry(3, 3, 0.2).lookAt(at).translate(mid.x, mid.y, mid.z);
slab.computeBoundingBox();
assert.deepEqual(auditGarageOrbitClearance([{ label: 'planted slab', box: slab.boundingBox, geometry: slab }]).map((f) => f.split(' (')[0]),
  ['planted slab blocks the hero'], 'a slab across the sightline blocks the hero');
const ring = new THREE.TorusGeometry(4, 0.2, 6, 48).rotateX(Math.PI / 2).translate(0, 0.4, 0); // a drift ring round the plinth
ring.computeBoundingBox();
ring.boundingBox.expandByScalar(12); // a box that swallows the whole band
assert.deepEqual(auditGarageOrbitClearance([{ label: 'ring', box: ring.boundingBox, geometry: ring }]), [],
  'a part whose box swallows the camera but whose triangles keep clear is no finding');

// 1. every outdoor pack, audited
const assets = createGarageEnvironmentAssetLibrary({});
const rows = [];
const failures = [];
for (const variant of GARAGE_VARIANTS.filter((v) => v.architecture !== 'field_shed')) {
  await prepareGarageEnvironmentAssets(assets, variant);
  const build = buildGarageEnvironment({}, assets, variant, () => {}, { auditOrbit: true });
  const findings = build.stats.orbitFindings;
  rows.push(`${variant.mapId} ${findings.length}`);
  for (const finding of findings) failures.push(`${variant.id}: ${finding}`);
  build.dispose();
}
assets.dispose();
assert.deepEqual(failures, [], 'no part holds the orbiting camera or blocks its view of the hero');
console.log(`garageOrbitClearance.selftest: ${samples.length} orbit samples a pack, no finding in ${rows.length} packs; `
  + 'a planted post holds the camera, a planted slab blocks the hero, a ring boxed over the band is clear PASS');
process.exit(0);
