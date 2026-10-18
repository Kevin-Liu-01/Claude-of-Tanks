// garage r9 skyline receipt (K10): every Garage with a built skyline of its own (garageKitPlacements.ts GARAGE_SKYLINES)
// names its map's landmarks, places each within 15 degrees of its bearing from the Garage's terrain-patch anchor (map x/z
// = pack x/z: the patch is unrotated), builds byte-identically twice, stays in its triangle share and in the biome's
// ceilings (masses 13.2 m, slender accents 26 m). Saltmere's coast is composed about its quay (garageSaltmereKit.ts):
// its relative bearings are the map's, turned as one, and its sea fills at least 90 degrees of the horizon.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import { GARAGE_SKYLINES } from './garageKitPlacements.ts';
import { GarageSkylineEmitter, mapBearing } from './garageSkylineKit.ts';
import { getGarageTerrainPatch } from './garageTerrainPatches.generated.ts';

const DEG = Math.PI / 180;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const build = (skyline) => {
  const positions = [], colors = [], indices = [];
  const e = new GarageSkylineEmitter(positions, colors, indices, new THREE.Color(0.8, 0.85, 0.9), new THREE.Vector3(0.53, 0.5, -0.63).normalize(), 7);
  skyline.build(e);
  return { positions, colors, indices, massTop: e.massTop, accentTop: e.accentTop };
};

let checked = 0;
for (const [architecture, skyline] of Object.entries(GARAGE_SKYLINES)) {
  const variant = GARAGE_VARIANTS.find((v) => v.architecture === architecture);
  assert.ok(variant, `${architecture}: a Garage`);
  assert.ok(skyline.landmarks.length >= 4, `${architecture}: at least four named landmarks`);
  const a = build(skyline), b = build(skyline);
  assert.deepEqual(a.positions, b.positions, `${architecture}: the skyline builds deterministically`);
  assert.deepEqual(a.colors, b.colors, `${architecture}: its colours too`);
  const triangles = a.indices.length / 3;
  assert.ok(triangles > 400 && triangles <= 4000, `${architecture}: landmarks ${triangles} triangles (the horizon's 9.5k share)`);
  assert.ok(a.massTop > 0 && a.massTop <= 13.2, `${architecture}: masses under the biome ceiling (${a.massTop.toFixed(1)} m)`);
  assert.ok(a.accentTop <= 26, `${architecture}: slender accents bounded (${a.accentTop.toFixed(1)} m)`);
  for (const landmark of skyline.landmarks) {
    assert.ok(landmark.name && landmark.source && landmark.radius >= 50 && landmark.radius <= 160, `${architecture}: ${landmark.name} placed`);
  }
  if (architecture === 'naval_drydock') {
    const sea = skyline.landmarks.find((landmark) => landmark.name === 'sea');
    assert.ok(skyline.seaArc && skyline.seaArc[1] - skyline.seaArc[0] >= 90 * DEG, 'Saltmere: the sea fills 90 degrees or more of the horizon');
    assert.ok(sea, 'Saltmere: the sea is a named landmark');
    // the composition keeps the map's relative bearings: headland, village and downs turned as one about the strand
    const strand = [255, -210];
    const head = skyline.landmarks.find((landmark) => landmark.name === 'lighthouse headland');
    const village = skyline.landmarks.find((landmark) => landmark.name === 'whitewashed slate village');
    const mapGap = wrap(mapBearing(strand, [150, 30]) - mapBearing(strand, [300, -430]));
    assert.ok(Math.abs(wrap(village.bearing - head.bearing) - mapGap) < 1 * DEG, 'Saltmere: the village and the headland keep the map\'s angle');
    // the sea's arc faces the graving dock's mouth (the opening view's direction)
    const mid = (skyline.seaArc[0] + skyline.seaArc[1]) / 2;
    assert.ok(Math.abs(wrap(mid - 225 * DEG)) < 2 * DEG, 'Saltmere: the bay lies where the dock opens');
  } else {
    // every landmark whose source names a map point stands within 15 degrees of that point's bearing from the anchor
    const anchor = getGarageTerrainPatch(variant.mapId).sourceAnchor;
    let mapped = 0;
    for (const landmark of skyline.landmarks) {
      const match = /map \((-?\d+), (-?\d+)\)/.exec(landmark.source);
      if (!match) continue;
      const bearing = mapBearing(anchor, [Number(match[1]), Number(match[2])]);
      assert.ok(Math.abs(wrap(landmark.bearing - bearing)) <= 15 * DEG,
        `${architecture}: ${landmark.name} at ${(landmark.bearing / DEG).toFixed(0)} deg, its map bearing ${(bearing / DEG).toFixed(0)} deg`);
      mapped += 1;
    }
    assert.ok(mapped >= 4, `${architecture}: four or more landmarks tied to map points (${mapped})`);
  }
  checked += 1;
}
assert.ok(checked >= 3, 'the per-garage skylines are checked');
console.log(`garageSkyline.selftest: ${checked} built skylines name their map's landmarks at their bearings`);
