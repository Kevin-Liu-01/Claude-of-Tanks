import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function visible(hit) {
  for (let object=hit.object; object; object=object.parent) if (!object.visible) return false;
  return !/shadow/i.test(hit.object.name);
}

function first(root, origin, direction) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, 5)
    .intersectObject(root, true).find(visible)?.point;
}

function near(actual, expected, tolerance, label) {
  assert.ok(Number.isFinite(actual) && Math.abs(actual-expected)<=tolerance,
    `${label}: ${actual} vs source ${expected} ±${tolerance}`);
}

for (const quality of ['high', 'low']) {
  const tank=createTank('t90sm_x', null, {quality, proceduralOnly:true, geometryReceipt:true, batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const turret=tank.root.getObjectByName('rig_turret');
    for (const [x,z] of [[.26,-.98],[.26,-1.02],[.28,-1.06],[.28,-1.10],
      [.30,-1.14],[.34,-1.02],[.34,-1.10],[.38,-1.18]]) {
      near(first(turret,[x,3.5,z],[0,-1,0])?.y,2.479199,.0002,'actual partial-rim source crown');
    }
    for (const [z,x] of [[-1.24,.37863763],[-1.20,.34072849],[-1.15,.30153073],
      [-1.10,.27772223],[-1.05,.26239095],[-1,.25512159],[-.98,.25221385]]) {
      near(first(turret,[-.2,2.45,z],[1,0,0])?.x,x,.008,'source partial-rim curved outside, not its bounding box');
    }
    for (const [x,z] of [[.26,-.92],[.28,-.90],[.30,-.86],[.25,-.98],[.26,-1.06]]) {
      near(first(turret,[x,3.5,z],[0,-1,0])?.y,2.413402,.0002,'real low plate remains exposed outside the partial rim');
    }
    near(first(turret,[.38,3.5,-1.10],[0,-1,0])?.y,2.53100,.002,
      'clipped high housing leaves 244mm of source air at the rear side corner');
    for (const [x,z] of [[.38,-1.06],[.42,-1.10],[.48,-1.14]]) {
      near(first(turret,[x,3.5,z],[0,-1,0])?.y,2.775274,.0002,'retained source high housing crown');
    }
    for (const [x,z,y] of [[.26,-1.18,2.21981],[.28,-1.24,2.21975],[.26,-.86,2.22909]]) {
      near(first(turret,[x,3.5,z],[0,-1,0])?.y,y,.010,
        'held-out exterior air is not filled by a complete rim or oversized pedestal');
    }
  } finally { tank.dispose(); }
}
console.log('t90SMXRwsBase: partial curved rim, stepped bearing plates, clipped high housing and real surrounding air pass high/low');
