// garage-env-276 (the cold first visit, timing6, notes ab13/ab14: a page's switch spent 1-1.5 s of a phone's thread on
// its map's buildings and their battle prints before it presented; Kevin 2026-11-24, "fade them in"): a page's pack
// presents with its structures' footprints alone and builds their geometry, the set pieces and the battle prints after it
// is shown (garageEnvironmentKit.ts GarageEnvironmentBuild.standLateStructures). Copyright © 2026 Kevin B. Liu.
// 1. a late pack presents on its structures' footprints: the same sites, the same shaped ground, the same draws after
//    them (its trees stand where the whole pack's do), less geometry, and its yard parts on the Garage library's stand-ins;
// 2. its late layer lands the whole pack's geometry (every triangle of every structure, set piece and yard part, on the
//    map's battle prints), its camera obstacles, and the stand-ins go; a second call has nothing to do;
// 3. a late layer stopped before it lands builds nothing into the pack, and its pack disposes cleanly;
// 4. the prepare's kind is the caller's: a whole prepare after a late one builds whole.
import assert from 'node:assert/strict';
import { GARAGE_VARIANTS } from '../game/garageVariants.ts';
import {
  buildGarageEnvironment, createGarageEnvironmentAssetLibrary, prepareGarageEnvironmentAssets,
} from './garageEnvironmentKit.ts';
import { garageStructureSurfaceCache } from './garageBattleStructures.ts';

const assets = createGarageEnvironmentAssetLibrary({});
const variant = GARAGE_VARIANTS.find((entry) => entry.id === 'urban_arsenal');
const trianglesOf = (mesh) => (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
const structureTriangles = (root) => {
  let sum = 0;
  root.traverse((object) => {
    if (object.isMesh && object.parent && object.name.startsWith('authored_structures_') && object.name !== 'authored_structures_route') sum += trianglesOf(object);
  });
  return sum;
};
// (the terraces under the structures shape it: the same ground on a 3 m grid is the same footprints and seats)
// (the groves draw from the pack's sequence after the structures: the same instances, the same draws)
const trees = (build) => {
  const matrices = [];
  build.root.traverse((object) => {
    if (!object.isInstancedMesh || !object.name.startsWith('battlefield_tree_')) return;
    for (let index = 0; index < object.count; index += 1) {
      for (let k = 12; k < 15; k += 1) matrices.push(object.instanceMatrix.array[index * 16 + k].toFixed(3));
    }
  });
  return matrices.join(' ');
};
const ground = (build) => {
  const heights = [];
  for (let x = -60; x <= 60; x += 3) for (let z = -60; z <= 60; z += 3) heights.push(build.groundAtWorld(x, z).toFixed(4));
  return heights.join(' ');
};

// the whole pack (Node's, and an enclosure's exterior)
await prepareGarageEnvironmentAssets(assets, variant, () => true, 'wait', { lateStructures: false });
const whole = buildGarageEnvironment({}, assets, variant, () => {});
const wholeTriangles = structureTriangles(whole.root);
const wholeObstacles = whole.cameraObstacles.length;
const wholeGround = ground(whole), wholeTrees = trees(whole), wholeSectors = whole.stats.structurePerimeterSectors;
assert.equal(whole.standLateStructures, undefined, 'a whole pack has no late layer');
whole.dispose();

// 1.
await prepareGarageEnvironmentAssets(assets, variant, () => true, 'wait', { lateStructures: true });
const late = buildGarageEnvironment({}, assets, variant, () => {});
assert.equal(typeof late.standLateStructures, 'function', 'a late pack builds its structures once shown');
assert.equal(ground(late), wholeGround, 'the same ground, shaped round the same footprints');
assert.equal(late.stats.structurePerimeterSectors, wholeSectors, 'the same structure sites');
assert.ok(wholeTrees.length > 0, 'the pack plants groves');
assert.equal(trees(late), wholeTrees, 'the same draws after the structures: its groves stand where the whole pack\'s do');
const presented = structureTriangles(late.root);
assert.ok(presented < wholeTriangles * 0.8, `it presents without its buildings (${presented} of ${wholeTriangles} triangles)`);
assert.ok(late.cameraObstacles.length <= wholeObstacles, 'its camera obstacles are its yard\'s alone till they land');
assert.ok(!late.root.getObjectByName('garage_late_structures'), 'no late layer before it is shown');

// 2.
assert.equal(await late.standLateStructures(() => true), true, 'its late layer lands');
const lateGroup = late.root.getObjectByName('garage_late_structures');
assert.ok(lateGroup, 'the late layer stands in the pack');
assert.equal(structureTriangles(late.root), wholeTriangles, 'every structure, set piece and yard part the whole pack draws');
assert.equal(late.cameraObstacles.length, wholeObstacles, 'the camera\'s obstacles are the whole pack\'s');
const painted = garageStructureSurfaceCache().find((entry) => entry.mapId === variant.mapId);
assert.ok(painted?.painted && painted.holds > 0, 'the map\'s battle prints are painted and held by the pack');
late.root.traverse((object) => {
  if (!object.isMesh || !object.name.startsWith('authored_structures_') || object.name === 'authored_structures_route') return;
  assert.equal(object.parent, lateGroup, `${object.name}: the stand-in went once the battle prints landed`);
});
assert.equal(await late.standLateStructures(() => true), false, 'once landed, nothing to do');
late.dispose();

// 3.
await prepareGarageEnvironmentAssets(assets, variant, () => true, 'wait', { lateStructures: true });
const stopped = buildGarageEnvironment({}, assets, variant, () => {});
let asks = 0;
assert.equal(await stopped.standLateStructures(() => (asks += 1) < 2), false, 'a stopped late layer does not land');
assert.ok(!stopped.root.getObjectByName('garage_late_structures'), 'nothing of it in the pack');
stopped.dispose();
assert.equal(await stopped.standLateStructures(() => true), false, 'a disposed pack builds no late layer');

// 4.
await prepareGarageEnvironmentAssets(assets, variant, () => true, 'wait', { lateStructures: true });
await prepareGarageEnvironmentAssets(assets, variant, () => true, 'wait', { lateStructures: false });
const again = buildGarageEnvironment({}, assets, variant, () => {});
assert.equal(again.standLateStructures, undefined, 'a whole prepare after a late one builds whole');
assert.equal(structureTriangles(again.root), wholeTriangles, 'and draws the whole pack');
again.dispose();
assets.dispose();
console.log(`garageLateStructures.selftest: a late pack presents on the same sites and ground with ${presented} of `
  + `${wholeTriangles} structure triangles; its late layer lands all of them on the battle prints with the whole pack's `
  + `${wholeObstacles} camera obstacles; a stopped one lands nothing; a whole prepare after a late one builds whole PASS`);
process.exit(0);
