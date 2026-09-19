import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

// Frozen authored dimensions, not values read back from the shoe generator.
const studies = [
  ['kf41_lynx_x', .590, .036, .013, .025, .100],
  ['cv90_mkiv_x', .550, .022, .008, .016, .070],
  ['cv90105_tml_x', .523, .022, .008, .016, .070],
  ['sabra_mk2_x', .586, .017, .006, .012, .067],
];
const material = new THREE.MeshBasicMaterial({side: THREE.FrontSide});
for (const quality of ['high', 'low']) for (const [id, width, pad, grouser, web, horn] of studies) {
  const tank = createTank(id, null, {proceduralOnly:true, quality, camoSeed:4242, geometryReceipt:true});
  try {
    const shoes = tank.root.getObjectByName('gearTrackPads');
    assert.ok(shoes?.isInstancedMesh && shoes.count > 100, 'one articulated near shoe course remains');
    const mesh = new THREE.Mesh(shoes.geometry, material);
    const hitY = (x, fromBelow = false) => {
      const hit = new THREE.Raycaster(new THREE.Vector3(x, fromBelow ? -.4 : .4, 0),
        new THREE.Vector3(0, fromBelow ? 1 : -1, 0)).intersectObject(mesh)[0];
      assert.ok(hit, `${id} ${quality}: native shoe must have finite stock`);
      return hit.point.y;
    };
    for (const side of [-1, 1]) {
      assert.ok(Math.abs(hitY(side*width*.25) - (pad/2+grouser)) < 1e-6, 'paired pad/grouser keeps authored peak');
      assert.ok(Math.abs(hitY(side*width*.30, true) - (-pad/2-web+.004)) < 1e-6, 'real web supports both pads');
    }
    assert.ok(Math.abs(hitY(0) - (-pad/2+.004)) < 1e-6, 'central pad split stays open down to the web');
    assert.ok(Math.abs(hitY(0,true) - (-pad/2-web+.006-horn)) < 1e-6, 'physical guide horn retains authored projection');
    const gap = new THREE.Raycaster(new THREE.Vector3(0,pad*.25,-.2), new THREE.Vector3(0,0,1),0,.4);
    assert.equal(gap.intersectObject(mesh).length, 0, 'paired pad air remains along the complete link');
    assert.ok(tank.root.userData.physicalMuzzleBoreVerification?.minimumDepthM > .05,
      'running gear optimization must preserve the actual cannon bore');
    if (id !== 'kf41_lynx_x') continue;
    const tire = tank.root.getObjectByName('gearRoadWheelTires');
    const layers = [];
    tank.root.traverse(o => { if (/^kf41SourceWheel/.test(o.name)) layers.push(o); });
    assert.equal(layers.length, 4);
    const before = layers.map(m => Array.from(m.instanceMatrix.array));
    const state = createTankState(getSpec(id), new THREE.Vector3(), 0);
    tank.setGroundSampler((x,z) => Math.abs(z) < .6 ? -.12 : 0);
    state.trackScroll.l = .27; state.trackScroll.r = .16;
    for (let i=0; i<12; i++) tank.syncFromState(state,1/30,20);
    for (const [j, layer] of layers.entries()) {
      assert.notDeepEqual(Array.from(layer.instanceMatrix.array), before[j], 'source wheel stock follows native motion');
      assert.equal(layer.count, 6, 'each measured wheel layer belongs only to its vehicle side');
      for (let i=0; i<layer.count; i++) {
        const m = new THREE.Matrix4(); layer.getMatrixAt(i,m);
        const p = new THREE.Vector3().setFromMatrixPosition(m);
        let matched = false;
        for (let k=0; k<tire.count; k++) {
          const t = new THREE.Matrix4(); tire.getMatrixAt(k,t);
          const q = new THREE.Vector3().setFromMatrixPosition(t);
          if (p.distanceTo(q) > 1e-6) continue;
          matched = true;
          for (const n of [0,1,2,4,5,6,8,9,10]) assert.ok(Math.abs(m.elements[n]-t.elements[n]) < 1e-6,
            'wheel stock and tire share rotation, drop and throw state');
        }
        assert.ok(matched, 'no wheel layer has an independent station');
      }
    }
  } finally { tank.dispose(); }
}
material.dispose();
console.log('europeSourceRunningGear: HIGH/LOW actual paired pads/web/guides/air, retained cannon bores and KF41 animated source layers pass');
