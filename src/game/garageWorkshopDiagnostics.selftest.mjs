import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGarageWorkshopDiagnostics } from './garageWorkshopDiagnostics.ts';

const dressingGroup = new THREE.Group();
dressingGroup.userData = {
  workshopTriangleCount: 4321,
  buildTimings: ['shell', 'fleet'],
  garageMapId: 'verdant',
  sharedMaintenanceBayIds: ['alpha'],
  workshopFamilies: ['abrams'],
  workshopSourceVehicleIds: ['m1a2_sep_v3'],
  battleScreenVisible: true,
};
const stageGroup = new THREE.Group();
stageGroup.userData.garageSceneMode = 'workshop';
stageGroup.userData.garageRoofMode = 'open';
let selected = 'verdant_motor_pool';
let built = false;
let invalidations = 0;
const pedestalRoot = new THREE.Group();
pedestalRoot.position.y = 2;

const diagnostics = createGarageWorkshopDiagnostics({
  variants: [{
    id: 'verdant_motor_pool', mapId: 'verdant', name: 'Verdant Motor Pool',
    architecture: 'field_shed', location: '', description: '', accent: 0,
    wallTint: 0, floorTint: 0, lightTint: 0, layout: 0, weather: 'clear',
  }],
  garage: {
    getSelectedGarageVariant: () => selected,
    setSelectedGarageVariant: (value) => { selected = value; return true; },
  },
  dressing: {
    group: dressingGroup,
    async ensureBuilt() { built = true; },
    isBuilt: () => built,
  },
  stage: {
    group: stageGroup,
    stats: () => ({ authored: true }),
  },
  pedestal: {
    current: {
      specId: 'm1a2_sep_v3',
      root: pedestalRoot,
      presentationTrackFloorYM: -1.5,
      dispose() {},
    },
  },
  battlefield: {
    diagnostics: () => ({
      variantId: selected, mapId: 'verdant', mode: 'verdant-workshop',
      ready: true, placement: null, error: '',
    }),
  },
  phase: {
    diagnostics: () => ({
      scene: { worldMounted: true },
      gpu: {},
    }),
  },
  renderer: { info: { render: { calls: 17, triangles: 2300 } } },
  garagePosition: { y: 0 },
  podiumTopYM: 0.36,
  getCurrentWorldMapId: () => 'verdant',
  invalidatePresentation: () => { invalidations += 1; },
});

assert.deepEqual(diagnostics.variants, [{
  id: 'verdant_motor_pool', mapId: 'verdant', name: 'Verdant Motor Pool',
  architecture: 'field_shed',
}]);
assert.equal(diagnostics.set('desert_forward_depot'), true);
assert.equal(selected, 'desert_forward_depot');
await diagnostics.ensureBuilt();
assert.equal(built, true);
assert.equal(invalidations, 1);

const stats = diagnostics.stats();
assert.equal(stats.triangles, 4321);
assert.equal(stats.heroTrackContactErrorM, 0.14);
assert.equal(stats.battlefield.worldMounted, true);
assert.equal(stats.battlefield.currentWorldMapId, 'verdant');
assert.deepEqual(stats.families, ['abrams']);
assert.deepEqual(stats.renderer, { calls: 17, triangles: 2300 });

// Snapshots must not expose mutable userData arrays to probe callers.
dressingGroup.userData.workshopFamilies.push('leopard');
assert.deepEqual(stats.families, ['abrams']);

console.log('garageWorkshopDiagnostics.selftest: typed variants, commands, and immutable receipts pass');
