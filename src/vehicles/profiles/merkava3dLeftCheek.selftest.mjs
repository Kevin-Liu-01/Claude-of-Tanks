import assert from 'node:assert/strict';
import * as THREE from 'three';
import '../../../tools/tank-surface-collect.mjs';
import { createTank } from '../tankFactory.ts';
import '../sourceXFleetSpecs.ts';
import { ensureInteriorFills } from '../interiorFills.ts';

// Owner-selected faces94/95/114 are the forward negative-X shoulder, not the
// positive-X armor module corrected previously. These independent stations
// keep the existing roof and outer shoulder endpoints while removing the
// extra inward bend between them. All coordinates below are world metres.
const stations = [
  { z: -.10, innerX: -.60, innerY: 2.55, outerX: -1.74, outerY: 2.12, oldDrop: 2.28 },
  { z: .60, innerX: -.30, innerY: 2.53, outerX: -1.27, outerY: 2.04, oldDrop: 2.31 },
  { z: 1.10, innerX: -.30, innerY: 2.42, outerX: -1.12, outerY: 1.92, oldDrop: 2.13 },
  { z: 1.60, innerX: -.24, innerY: 2.26, outerX: -.64, outerY: 1.91, oldDrop: 2.08 },
];
const height = (s, x) => s.innerY + (s.outerY - s.innerY) * ((x - s.innerX) / (s.outerX - s.innerX));
function castLocal(mesh, x, z, y = 4) {
  const origin=mesh.localToWorld(new THREE.Vector3(x,y-1.68034,z+.72418));
  const direction=new THREE.Vector3(0,-1,0).transformDirection(mesh.matrixWorld);
  const hit=new THREE.Raycaster(origin,direction,0,6).intersectObject(mesh,false)[0];
  return hit ? mesh.worldToLocal(hit.point.clone()).y+1.68034 : undefined;
}
function assertContinuous(mesh) {
  for (const s of stations) for (const t of [.15,.45,.75]) {
    const x=THREE.MathUtils.lerp(s.innerX,s.outerX,t),actual=castLocal(mesh,x,s.z);
    assert.ok(Number.isFinite(actual)&&Math.abs(actual-height(s,x))<.00002,
      `left shoulder ${s.z}/${x}: ${actual}, expected continuous plate ${height(s,x)}`);
  }
}
await ensureInteriorFills(['merkava3d_x']);
for (const quality of ['high','low']) {
  const tank=createTank('merkava3d_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    const turret=tank.root.getObjectByName('turret'),rig=tank.root.getObjectByName('rig_turret');
    assert.ok(turret?.isMesh&&rig&&turret.parent===rig,'Permanent structural armor follows turret yaw');
    tank.root.updateMatrixWorld(true);assertContinuous(turret);
    for (const yaw of [-1.1,.7]) {rig.rotation.y=yaw;tank.root.updateMatrixWorld(true);assertContinuous(turret);}
    rig.rotation.y=0;tank.root.updateMatrixWorld(true);
    // Recreate the actual previous inward point in the emitted mesh. Merely
    // changing labels or adding a dummy mount cannot make this control pass.
    const original=turret.geometry;turret.geometry=original.clone();
    const pos=turret.geometry.getAttribute('position');let restored=0;
    for (let i=0;i<pos.count;i++) for (const s of stations) {
      if (Math.abs(pos.getX(i)-(s.innerX-.04))<1e-5&&Math.abs(pos.getZ(i)-(s.z+.72418))<1e-5) {
        pos.setY(i,s.oldDrop-1.68034);restored++;break;
      }
    }
    assert.ok(restored>=24,'Negative control restores real left shoulder triangles');
    turret.geometry.computeBoundingSphere();
    assert.throws(()=>assertContinuous(turret),/left shoulder/,'Original collapse must fail');
    turret.geometry.dispose();turret.geometry=original;
    assertContinuous(turret);
    // The opposite-side permanent module remains intact.
    const right=castLocal(turret,1.60,.65);
    assert.ok(right>2.25&&right<2.34,'Unchanged positive-X repair');
    console.log(`merkava3d_x/${quality}: continuous owner-selected left shoulder, yaw and real-collapse negative PASS`);
  } finally {tank.dispose();}
}
