import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import '../sourceXFleetSpecs.ts';
import { registerProfiledBuilders } from '../tankFactoryCore.ts';
import { K2_X_PROFILES } from './k2X.ts';

registerProfiledBuilders({ k2_x: K2_X_PROFILES.k2_x.build });
const near=(actual,expected,tolerance,label)=>assert.ok(
  Number.isFinite(actual)&&Math.abs(actual-expected)<=tolerance,
  `${label}: ${actual} vs source ${expected} ± ${tolerance}`,
);
const top=(root,x,z)=>new THREE.Raycaster(new THREE.Vector3(x,5,z),
  new THREE.Vector3(0,-1,0),0,6).intersectObject(root,true)[0]?.point.y;

for(const quality of ['high','low']) {
  const tank=createTank('k2_x',null,{proceduralOnly:true,geometryReceipt:true,quality});
  try {
    tank.root.updateMatrixWorld(true);
    const mount=tank.root.getObjectByName('gunMount');
    assert.ok(mount?.isMesh);
    // Independently sampled canonical source planes. Bounding-box agreement
    // alone allowed a 28 cm excess above the previous flat forward face.
    for(const [z,y] of [[1.4,2.47436],[1.7,2.53247],[1.9,2.52989],
      [2.1,2.51604],[2.2,2.40483],[2.3,2.19385],[2.36,2.05666]]) {
      near(top(mount,-.25,z),y,.002,`${quality}: mantlet/hood station ${z}`);
    }
    near(top(mount,.2,2.2),2.36023,.002,`${quality}: optic opening has a real lower floor`);
    assert.ok(top(mount,-.25,2.2)-top(mount,.2,2.2)>.04,
      `${quality}: asymmetric hood cutout remains physically open`);
    const ray=new THREE.Raycaster(new THREE.Vector3(.2112,2.43173,2.5),
      new THREE.Vector3(0,0,-1),0,1);
    const hit=ray.intersectObject(tank.root.getObjectByName('rig_gun'),true)[0];
    near(hit?.point.z,2.123,.002,`${quality}: recessed glass is visible beyond the hood nose`);
    assert.equal(hit?.object.name,'gunMountGlass',`${quality}: window is not occluded by a dark filler box`);
    near(top(tank.root.getObjectByName('hullDetail'),.323,2.07),1.5433,.004,
      `${quality}: driver's vision bank is seated on +X`);
    near(top(tank.root.getObjectByName('hullDetail'),-.65,2.4),1.4436,.004,
      `${quality}: port service plate follows the glacis plane`);
    const pivot=tank.root.getObjectByName('rig_gun');
    assert.equal(mount.parent,pivot,`${quality}: shaped armor moves with the actual trunnion`);
  } finally {tank.dispose();}
}
console.log('k2XDetail: measured mantlet slopes, real optic cavity/glazing and source-seated hull fittings pass in both LODs');
