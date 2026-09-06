import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';

// Independent canonical Gun_Msh measurements, not builder metadata: source
// collar Z [5.452418073,5.655017121], radius [.107723912,.107725538].
// Its centerline is Y1.85491175. The complete source muzzle ends Z6.899749978.
const near=(actual,target,tolerance,label)=>assert.ok(
  Number.isFinite(actual)&&Math.abs(actual-target)<tolerance,
  `${label}: ${actual} vs ${target} ± ${tolerance}`,
);
function top(object,z) {
  return new THREE.Raycaster(new THREE.Vector3(0,3,z),new THREE.Vector3(0,-1,0),0,2)
    .intersectObject(object,false)[0]?.point.y;
}
function collarVertices(gun) {
  const p=gun.geometry.attributes.position,points=[];
  for(let i=0;i<p.count;i++) {
    const point=new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(gun.matrixWorld);
    const radius=Math.hypot(point.x,point.y-1.85491175);
    if(point.z>5.4&&point.z<5.7&&radius>.1075&&radius<.108)points.push(point);
  }
  return new THREE.Box3().setFromPoints(points);
}
for(const quality of ['high','low']) {
  const tank=createTank('kf51_x',null,{proceduralOnly:true,geometryReceipt:true,quality,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const gun=tank.root.getObjectByName('gun'),recoil=tank.root.getObjectByName('rig_recoil');
    assert.ok(gun?.isMesh&&recoil,`${quality}: actual native barrel exists`);
    assert.equal(gun.parent,recoil,`${quality}: complete collar shares barrel recoil ownership`);
    const collar=collarVertices(gun);
    near(collar.min.z,5.452418073,.000003,`${quality}: source collar aft edge`);
    near(collar.max.z,5.655017121,.000003,`${quality}: source collar forward edge`);
    // Held-out rays include the previously missing 105 mm aft run, not merely
    // the old ring's surviving middle. Jacket continuation remains unchanged.
    for(const z of [5.46,5.50,5.55,5.60,5.65])
      near(top(gun,z),1.962635992,.000003,`${quality}: actual source collar roof ${z}`);
    for(const z of [5.44,5.67,6.30])
      near(top(gun,z),1.956899256,.00002,`${quality}: retained neighboring jacket ${z}`);
    near(top(gun,6.86),1.944111335,.000002,`${quality}: retained reduced neck radius`);

    const bore=tank.root.getObjectByName('muzzleBoreShadowFallback');
    const rim=tank.root.getObjectByName('muzzleBoreShadowFallbackRim')
      ??bore.children.find(part=>part.userData.mobileStaticBatch);
    const annulus=tank.root.getObjectByName('muzzleBoreShadowFallbackAnnulus');
    assert.ok(rim?.isMesh,`${quality}: real assembled muzzle parts exist`);
    assert.equal(bore.userData.cannonBore,true,`${quality}: actual bore owner is retained`);
    // Low quality physically merges the rim+annulus into one bore-owned dark
    // mesh. Inspect that actual buffer instead of demanding high-LOD names.
    assert.equal(rim.parent,bore,`${quality}: full physical lip stays recoil-owned through its bore frame`);
    assert.equal(Boolean(annulus),quality==='high',`${quality}: existing low-LOD lip batching remains intact`);
    for(const part of [rim,annulus].filter(Boolean)) {
      assert.equal(part.visible,true,`${quality}: native muzzle is visibly rendered`);
      assert.ok(part.userData.cannonBorePrimaryPart||part.userData.mobileStaticBatch,
        `${quality}: primary bore furniture or its actual merged low-LOD geometry`);
      assert.notEqual(part.userData.shadowOnly,true,`${quality}: name does not make a real rim shadow-only`);
      assert.equal(part.material.colorWrite,true,`${quality}: muzzle contributes real color/depth`);
    }
    const seat=bore.userData.muzzleSeatReceipt;
    near(seat.supportOuterRadiusM,.0892,.000002,`${quality}: rim seats on source neck radius`);
    assert.equal(seat.supportSource,'terminal-cap',`${quality}: native bore uses real physical neck face`);
    const tubeEnd=new THREE.Box3().setFromObject(gun).max.z;
    const rimBox=new THREE.Box3().setFromObject(rim);
    near(tubeEnd,6.87969993,.000002,`${quality}: intentional final native lip allowance retained`);
    near(rimBox.max.z,6.899749978,.003,`${quality}: complete assembled source endpoint within 3 mm`);
    assert.ok(rimBox.min.z-tubeEnd>0&&rimBox.min.z-tubeEnd<.003,
      `${quality}: native rim seats within 3 mm of the neck, without a detached extension`);
    near(rim.getWorldPosition(new THREE.Vector3()).y,1.85491175,.000001,`${quality}: centered bore`);
    recoil.position.z-=.10;tank.root.updateMatrixWorld(true);
    near(top(gun,5.40),1.962635992,.000003,`${quality}: physical collar follows 100 mm recoil`);
    near(new THREE.Box3().setFromObject(rim).max.z,rimBox.max.z-.10,.000001,
      `${quality}: complete native mouth follows the same recoil`);
  } finally {tank.dispose();}
}
console.log('kf51XGunFit: exact source collar span, jacket continuity, assembled muzzle and actual recoil ownership pass high/low');
