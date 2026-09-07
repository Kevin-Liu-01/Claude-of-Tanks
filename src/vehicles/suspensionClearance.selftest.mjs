import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {auditTankWheelQuality} from './wheelQuality.ts';
import {measureSpatialArmClearance} from './suspensionClearance.ts';

for (const quality of ['high', 'low']) {
  const tank = createTank('leo2a6_x', null, {proceduralOnly:true, geometryReceipt:true, quality});
  try {
    const arm=tank.root.getObjectByName('gearSuspensionLinks');
    const before=Array.from(arm.instanceMatrix.array), matrix=new THREE.Matrix4();
    for(const side of ['left','right']) {
      const result=measureSpatialArmClearance(arm,side);
      assert.equal(result?.arms,7,'all seven actual forgings must have observed wheel faces');
      assert.ok(result.samples>400,'face vertices, edge midpoints and centroids are observed');
      assert.ok(result.minimumM>=.019162,'unchanged source clearance floor');
      assert.ok(arm.userData.assemblyOutboardAbsX[side]>arm.userData.wheelInnerAbsX[side],
        'faithful complete bounding boxes remain overlapping; do not falsify the receipt');
    }
    assert.deepEqual(auditTankWheelQuality(tank.root).issues,[],'narrow-phase actual geometry passes');
    // A real outward error is rejected even though source metadata is intact.
    for(let i=0;i<arm.count;i++) {
      arm.getMatrixAt(i,matrix); matrix.elements[12]+=Math.sign(matrix.elements[12])*.10;
      arm.setMatrixAt(i,matrix);
    }
    const failures=auditTankWheelQuality(tank.root).issues.filter(x=>x.code==='suspension-outboard-of-wheel-back');
    assert.equal(failures.length,2,'both physically clipped sides fail with unchanged receipts');
    assert.ok(failures.every(x=>x.spatialMinimumM<0),'actual clipping is measured, not self-certified');
    arm.instanceMatrix.array.set(before);
    const old=arm.userData.wheelInnerAbsX;
    delete arm.userData.wheelInnerAbsX;
    assert.equal(auditTankWheelQuality(tank.root).issues.filter(x=>x.code==='suspension-outboard-of-wheel-back').length,2,
      'spatial narrow phase never excuses incomplete metadata');
    arm.userData.wheelInnerAbsX=old;
    tank.root.rotation.y=.7;tank.root.scale.setScalar(.9);
    assert.deepEqual(auditTankWheelQuality(tank.root).issues,[],
      'native metre-space test is invariant under the displayed vehicle pose and scale');
  } finally {tank.dispose();}
}
console.log('suspensionClearance: both native LODs, every arm, real positive/negative clearance and posed roots pass');
