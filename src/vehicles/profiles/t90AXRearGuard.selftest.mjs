import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function ray(root,origin,direction) {
  return new THREE.Raycaster(new THREE.Vector3(...origin),new THREE.Vector3(...direction),0,4)
    .intersectObject(root,true).find(hit=>{
      for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;
      return !/shadow|gear|track|wheel|suspension/i.test(hit.object.name);
    });
}

function near(hit,target,tolerance,label) {
  assert.ok(hit&&Math.abs(hit.point.y-target)<=tolerance,
    `${label}: ${hit?.point.y} versus independent source ${target} ± ${tolerance}`);
}

for(const quality of ['high','low']) {
  const tank=createTank('t90a_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    for(const side of [-1,1]) {
      near(ray(tank.root,[side*1.4,2,-3.27],[0,-1,0]),1.282231,.001,`${quality}: source neck skin`);
      near(ray(tank.root,[side*1.4,2,-3.290],[0,-1,0]),1.31382,.001,`${quality}: real transverse hinge`);
      for(const z of [-3.32,-3.38,-3.44])near(ray(tank.root,[side*1.4,2,z],[0,-1,0]),
        1.260711,.001,`${quality}: source flat guard ${side}/${z}`);
      for(const [z,right,left]of [[-3.50,1.25175,1.25194],[-3.58,1.22284,1.22327],
        [-3.635,1.18233,1.18400]])near(ray(tank.root,[side*1.4,2,z],[0,-1,0]),
          side>0?right:left,.004,`${quality}: separate aft fold ${side}/${z}`);
      const underside=ray(tank.root,[side*1.4,1.10,-3.38],[0,1,0]);
      near(underside,1.258173,.002,`${quality}: thin guard underside`);
      assert.ok(underside.distance>.15,`${quality}: drive-wheel well is air, not a filled closure slab`);
      // The failing eight-cell region and its mirrored counterpart must be
      // real top-facing skin, including intervals between the measured rays.
      for(const x of [1.16,1.28,1.40,1.52,1.64])for(const z of [-3.21,-3.24,-3.27,-3.30,-3.33]) {
        const h=ray(tank.root,[side*x,2,z],[0,-1,0]);
        assert.ok(h&&h.point.y>1.24,`${quality}: no missing rear fender skin at ${side*x}/${z}`);
      }
    }
    const seats=tank.root.userData.mudguardFenderSeats.filter(row=>row.label==='t90a-x-rear');
    assert.equal(seats.length,2,`${quality}: both independently built rear guards remain registered`);
    for(const seat of seats)assert.ok(seat.directGapM<.001,
      `${quality}: rear guard directly touches real hinge/hull support (${seat.directGapM})`);
  } finally { tank.dispose(); }
}
console.log('t90AXRearGuard: paired measured neck/hinge/folds, intact skin, real underside air and direct seating pass high/low');
