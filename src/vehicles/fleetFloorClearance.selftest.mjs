import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.js';
import { ALL_TANK_IDS } from './specs.js';

const SURFACE_Y_M = 0.36;
const EPSILON_M = 0.001;
const MAX_PRESENTATION_GAP_M = 0.03;
const bounds = new THREE.Box3();

function effectiveVisible(object, root) {
  for (let current = object; current && current !== root; current = current.parent) {
    if (!current.visible) return false;
  }
  return true;
}

function visibleBounds(root) {
  bounds.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.geometry || !(object.isMesh || object.isInstancedMesh)) return;
    if (!effectiveVisible(object, root)) return;
    if (object.material?.colorWrite === false) return;
    if (object.isInstancedMesh) {
      if (!object.count) return;
      object.computeBoundingBox();
      if (object.boundingBox && !object.boundingBox.isEmpty()) {
        bounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
      return;
    }
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    bounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return bounds;
}

let minimumMarginM = Infinity;
let maximumMarginM = -Infinity;

for (const id of ALL_TANK_IDS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
    staticPreview: true,
  });
  try {
    assert.ok(Number.isFinite(visual.presentationFloorYM),
      `${id}: static presentation exposes a finite rest-floor envelope`);
    assert.equal(typeof visual.seatOnFloor, 'function',
      `${id}: static presentation exposes the canonical floor-seat operation`);

    visual.seatOnFloor(SURFACE_Y_M);
    assert.ok(Number.isFinite(visual.presentationFloorYM),
      `${id}: static presentation measures a finite visible lower envelope`);
    let marginM = visibleBounds(visual.root).min.y - SURFACE_Y_M;
    minimumMarginM = Math.min(minimumMarginM, marginM);
    maximumMarginM = Math.max(maximumMarginM, marginM);
    assert.ok(marginM >= -EPSILON_M,
      `${id}: static presentation clips the floor by ${(-marginM).toFixed(4)} m`);
    assert.ok(marginM <= MAX_PRESENTATION_GAP_M,
      `${id}: static presentation floats ${marginM.toFixed(4)} m above the floor`);

    const contact = visual.prepareForSimulation();
    assert.ok(Number.isFinite(contact?.bottomYM),
      `${id}: battle support exposes a finite rendered contact plane`);
    assert.ok(Number.isFinite(contact?.gearBottomYM),
      `${id}: battle support retains its analytic running-gear floor`);

    visual.seatOnFloor(SURFACE_Y_M);
    marginM = visibleBounds(visual.root).min.y - SURFACE_Y_M;
    assert.ok(marginM >= -EPSILON_M,
      `${id}: promoted presentation clips the floor by ${(-marginM).toFixed(4)} m`);
    assert.ok(marginM <= MAX_PRESENTATION_GAP_M,
      `${id}: promoted presentation floats ${marginM.toFixed(4)} m above the floor`);
  } finally {
    visual.dispose();
  }
}

console.log(`fleetFloorClearance.selftest: ${ALL_TANK_IDS.length} tanks seat on rigid floors `
  + `(visible margin ${minimumMarginM.toFixed(4)}..${maximumMarginM.toFixed(4)} m)`);
