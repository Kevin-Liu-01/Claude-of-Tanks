import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs source${expected} ±${tolerance}`);
const cast = (meshes, from, direction, far = 10) => new THREE.Raycaster(
  new THREE.Vector3(...from), new THREE.Vector3(...direction), 0, far).intersectObjects(meshes, false)[0];

function sourceStock(all) {
  // Complete Object3 first surfaces, independently frozen before authoring.
  // The reported rounded continuity coordinate is not its actual cell center.
  for (const [x, z, y, tolerance] of [[.03, -3.46, 1.484541059, .00001],
    [.08, -3.40, 1.483699918, .001], [-.14, -3.38, 1.470865963, .001],
    [-.14, -3.43, 1.484541059, .00001], [0, -3.20, 1.482458725, .003]])
    near(cast(all, [x, 2, z], [0, -1, 0])?.point.y, y, tolerance,
      `actual high/low source towing assembly atX${x}/Z${z}`);
  near(cast(all, [.03, 1.3, -3.46], [0, 1, 0])?.point.y, 1.447532535, .001,
    'the source flat head has closed37mm stock, not an erased cap or round torus');
  near(cast(all, [.2, 1.465, -3.21], [-1, 0, 0])?.point.x, .072334577, .00001,
    'independent right crosswise hinge stock remains seated beside the shank');
}

function realAir(all) {
  for (const [x, z] of [[-.02, -3.39], [-.12, -3.39]])
    assert.equal(cast(all, [x, 2, z], [0, -1, 0]), undefined,
      'actual C head retains the source inner opening and left-side throat');
  assert.equal(cast(all, [-.115, 1.466, -3.39], [0, 0, 1], .018), undefined,
    'the side throat is not connected by an invented filled bridge');
  // Same fixed native-frame cell centers: complete canonical source and
  // native both retain these three genuine openings. They are not waived.
  for (const [x, z] of [[-.059230768, -3.3571051],
    [-.059230768, -3.41679071], [0, -3.41679071]])
    assert.equal(cast(all, [x, 2, z], [0, -1, 0]), undefined,
      'coincident source/native continuity cell remains physically open');
  near(cast(all, [-.14, 1.474, -3.43], [0, 1, 0])?.point.y, 1.475288868, .00001,
    'rear retaining ear has a real separated underside above the lever');
  near(cast(all, [-.14, 1.456, -3.43], [0, -1, 0])?.point.y, 1.455102563, .00001,
    'rear retaining ear has a distinct lower jaw rather than a full solid box');
}

function lowerHookAndDeckCap(all) {
  for (const [x, z, y, tolerance] of [[0, -3.357, .956491284, .006],
    [0, -3.3571051, .956214, .006],
    [0, -3.34, .977735536, .006], [0, -3.32, .912882982, .004],
    [0, -2.75, 1.518185054, .00001], [0, -2.95, 1.497998589, .00001],
    [.42, -2.429937, 1.508526471, .003]])
    near(cast(all, [x, 2, z], [0, -1, 0])?.point.y, y, tolerance,
      'independent lower coupling projection and correctly located deck cap');
  assert.equal(cast(all, [0, .95, -3.31], [0, 0, 1], .09), undefined,
    'lower forged hook keeps its real open throat below the locking jaw');
  near(cast(all, [0, 1.04, -3.4], [0, 0, 1])?.point.z, -3.273413493, .003,
    'the real upper locking jaw is separate from the hook below it');
}

function physicalContacts(root, all) {
  const hull = root.getObjectByName('hull');
  const rearFace = cast([hull], [0, 1.46, -3.6], [0, 0, 1]);
  near(rearFace?.point.z, -3.157488346, .000001,
    'source rear hull face is unchanged; flared root reaches1mm into it');
  near(cast(all, [.075, 1.48, -3.3], [0, 0, 1])?.point.z, -3.161355, .001,
    'actual source flared right root provides the physical shank-to-hull connection');
  assert.ok(cast(all, [-.14, 1.475, -3.48131], [1, 0, 0], .05),
    'real retaining collar overlaps the transverse pin, not a floating lever');
  near(cast(all, [0, 1.463934, -3.48131], [-1, 0, 0], .1)?.point.x,
    -.052148183, .00001, 'actual closed cross-pin retains its source inner endpoint');
  near(cast(all, [-.06, 2, -3.48131], [0, -1, 0])?.point.y,
    1.484541059, .00001, 'cross-pin passes through the measured C-head stock');
  near(cast(all, [-.06, 1.3, -3.48131], [0, 1, 0])?.point.y,
    1.447532535, .001, 'head stock encloses the actual pin axis and radius from below');
  let hiddenRole = 0;
  root.traverse(o => {
    if (o.isMesh && o.userData.continuityRole === 'open-lattice') {
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      if (b.min.z < -3.3 && b.max.x > -.2 && b.min.x < .2) hiddenRole++;
    }
  });
  assert.equal(hiddenRole, 0, 'the real rear fitting is not relabeled out of continuity scanning');
}

for (const quality of ['high', 'low']) {
  const tank = createTank('ariete_c1_x', null,
    { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false });
  try {
    tank.root.updateMatrixWorld(true);
    const all = [];
    tank.root.traverse(o => {
      if (o.isMesh && !o.userData.shadowOnly && !o.userData.vehicleMarking
        && !/Proxy|procShadow/.test(o.name)) all.push(o);
    });
    sourceStock(all); realAir(all); physicalContacts(tank.root, all); lowerHookAndDeckCap(all);
  } finally { tank.dispose(); }
}
console.log('arieteXSuppliedRearTow: actual high/low flat C head, source cell stock, throat/jaw air and lever/shank contact PASS');
