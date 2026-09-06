import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { smEngineDeckSupportRoof } from './t90SMXEngineDeck.ts';

const near = (actual, expected, tolerance, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} vs source ${expected} ±${tolerance}`,
);

function top(root, x, z) {
  return new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0), 0, 2)
    .intersectObject(root, true).find(hit => {
      for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
      return !/shadow|gear|track|wheel/i.test(hit.object.name);
    });
}

for (const z of [-4, -3.431, -1.447, -1, 0, 3]) {
  assert.equal(smEngineDeckSupportRoof(z, 1.6), 1.6, 'outside SM rear footprint remains unchanged');
}
assert.equal(smEngineDeckSupportRoof(-3.43, 1.317), 1.317, 'rear nose is never raised');
assert.equal(smEngineDeckSupportRoof(-2.85, 1.56), 1.485, 'carrier cannot occlude the source lower deck');

for (const quality of ['high', 'low']) {
  const tank = createTank('t90sm_x', null, { quality, proceduralOnly: true, geometryReceipt: true });
  try {
    tank.root.updateMatrixWorld(true);
    const hull = tank.root.getObjectByName('rig_hull');
    for (const x of [-.66, -.19, .19, .66]) for (const z of [-2.14, -1.9, -1.6]) {
      near(top(hull, x, z)?.point.y, 1.57678687, .002, 'actual source header; former generic box was87mm too high');
    }
    for (const [x, z, y] of [[.66, -3.10, 1.5030174], [-.66, -3.10, 1.5030174],
      [.66, -3.04, 1.51598], [.66, -3.0, 1.55773], [.66, -2.90, 1.56898],
      [.66, -2.60, 1.5624605], [-.66, -2.60, 1.5624603], [.66, -2.40, 1.55801],
      [.95, -2.60, 1.52947], [-.95, -2.60, 1.52649],
      [.66, -2.20, 1.49912], [-.66, -2.20, 1.49920]]) {
      near(top(hull, x, z)?.point.y, y, .003, 'source stepped cover, narrow side bevel and lower transverse channel');
    }
    assert.ok(top(hull, .66, -2.14).point.y - top(hull, .66, -2.20).point.y > .075,
      'the low channel between source covers is not painted onto an opaque high carrier');
    for (const [x, z, y] of [[.90, -2.25, 1.5865952], [-.90, -2.25, 1.5865952],
      [.93, -2.24, 1.5468798], [-.92, -2.24, 1.5468798], [.97, -2.23, 1.58772]]) {
      near(top(hull, x, z)?.point.y, y, .003, 'source attached recessed latch, not a generic proud rear handle');
    }
    assert.ok(top(hull, .90, -2.24).point.y - top(hull, .93, -2.24).point.y > .038,
      'real air depth survives between the unequal source latch cheeks');
  } finally { tank.dispose(); }
}
console.log('t90SMXEngineDeck: source header, shallow folded cover, exposed channel and recessed attached latches pass high/low');
