import assert from 'node:assert/strict';
import * as T from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { createTankState } from '../../sim/movement.ts';

// These rays query native factory geometry. In particular the bow samples
// fall below the old upper wedge and expose the unwanted tall box directly.
const rows = [
  {id:'cv90', scale:.9, knee:2.14, floor:.24, nose:3.28, chin:1},
  {id:'cv90_mkiv', scale:.9, knee:2.24, floor:.20, nose:3.49, chin:1.07},
];
const ray = new T.Raycaster();
function cast(objects, frame, xyz, direction, far=5) {
  ray.set(frame.localToWorld(new T.Vector3(...xyz)),new T.Vector3(...direction).transformDirection(frame.matrixWorld));
  ray.near=0;ray.far=far;
  return ray.intersectObjects(objects,false)[0];
}
function assertHullClearance(tank, mount, label) {
  const hull=tank.root.getObjectByName('hull'),position=mount.geometry.getAttribute('position');
  const seen=new Set();
  for(let i=0;i<position.count;i++) {
    const point=new T.Vector3().fromBufferAttribute(position,i).applyMatrix4(mount.matrixWorld);
    const key=point.toArray().map(v=>v.toFixed(5)).join(',');if(seen.has(key))continue;seen.add(key);
    const hit=new T.Raycaster(new T.Vector3(point.x,10,point.z),new T.Vector3(0,-1,0),0,15).intersectObject(hull,false)[0];
    if(hit)assert.ok(point.y-hit.point.y>.005,`${label}: moving housing clears hull by finite stock gap, got ${point.y-hit.point.y}m at ${point.toArray()}`);
  }
}
for(const quality of ['high','low']) for(const row of rows) {
  const tank=createTank(row.id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,batchStatic:false});
  try {
    tank.root.updateMatrixWorld(true);
    const hull=tank.root.getObjectByName('hull'), frame=tank.root.getObjectByName('rig_hull');
    const bow=objects=>{
      for(const x of [-.6,0,.6]) for(const y of [.36,.60,.85]) {
        const hit=cast(objects,frame,[x*row.scale,y*row.scale,4*row.scale],[0,0,-1]);
        assert.ok(hit,`${row.id}/${quality}: closed lower front stock`);
        const p=frame.worldToLocal(hit.point.clone()).divideScalar(row.scale);
        const expected=row.knee+(y-row.floor)*(row.nose-row.knee)/(row.chin-row.floor);
        assert.ok(Math.abs(p.z-expected)<.002,`${row.id}/${quality}: lower glacis rake at ${x},${y}, got ${p.z}, expected ${expected}`);
        assert.ok(hit.face.normal.y<-.65,`${row.id}/${quality}: outward lower glacis normal`);
      }
    };
    bow([hull]);
    const old=new T.Mesh(new T.BoxGeometry(2.2*row.scale,1.1*row.scale,6.7*row.scale),hull.material);
    old.position.set(0,.75*row.scale,-.10*row.scale);frame.add(old);tank.root.updateMatrixWorld(true);
    assert.throws(()=>bow([hull,old]),assert.AssertionError,'the old square belly must fail the same rays');
    frame.remove(old);old.geometry.dispose();
    if(row.id==='cv90_mkiv') {
      const gun=tank.root.getObjectByName('rig_gun'),mount=tank.root.getObjectByName('gunMount');
      const turret=tank.root.getObjectByName('turret'),state=createTankState(getSpec(row.id),new T.Vector3(),0);
      assert.ok(Math.abs(gun.position.z-getSpec(row.id).armor.gunPivot[2])<1e-8,`${quality}: visual and authored gun pivots agree`);
      for(const degrees of [-getSpec(row.id).gunDepressionDeg,0,getSpec(row.id).gunElevationDeg]) {
        state.gunPitch=T.MathUtils.degToRad(degrees);state.turretYaw=.72;
        tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
        const air=()=>assert.equal(cast([mount],gun,[-.7*.9,.105*.9,.85*.9],[1,0,0],.7*.9),undefined,
          `${quality}: open side bay between actual diagonal members`);
        air();
        assertHullClearance(tank,mount,`${row.id}/${quality}/${degrees}`);
        const rail=cast([mount],gun,[-.7*.9,.171*.9,.65*.9],[1,0,0],.7*.9);
        assert.ok(rail,`${quality}: open bay retains its physical upper rail`);
        if(degrees===0) {
          const buried=cast([turret,mount],gun,[-2*.9,.05*.9,-.30*.9],[1,0,0],2*.9);
          assert.equal(buried?.object,turret,`${quality}: root rear is buried inside turret stock`);
        }
        const oldShroud=new T.Mesh(new T.BoxGeometry(.6*.9,.42*.9,1.4*.9),mount.material);
        oldShroud.position.z=.85*.9;gun.add(oldShroud);tank.root.updateMatrixWorld(true);
        assert.ok(cast([mount,oldShroud],gun,[-.7*.9,.105*.9,.85*.9],[1,0,0],.7*.9),
          `${quality}: old closed shroud demonstrably blocks the open witness`);
        gun.remove(oldShroud);oldShroud.geometry.dispose();
      }
    }
  }finally{tank.dispose();}
}
// The new armor masks have finite returns, a central circular gland, and
// actual pitch-axis bearings. Barrel recoil must leave the mask seated.
for(const quality of ['high','low']) for(const id of ['cv90_x','bmp3m_dragun125_x']) {
  const tank=createTank(id,null,{proceduralOnly:true,quality,camoSeed:4242,geometryReceipt:true,batchStatic:false});
  try {
    const frame=tank.root.getObjectByName('rig_gun'),mount=tank.root.getObjectByName('gunMount');
    const state=createTankState(getSpec(id),new T.Vector3(),0);
    const origin=id==='cv90_x'?[.18,.08,.6]:[.23,.06,.6];
    for(const degrees of [-getSpec(id).gunDepressionDeg,0,getSpec(id).gunElevationDeg]) {
      state.gunPitch=T.MathUtils.degToRad(degrees);state.turretYaw=-.65;
      tank.syncFromState(state,1);tank.root.updateMatrixWorld(true);
      const first=cast([mount],frame,origin,[0,0,-1],1);assert.ok(first,`${id}: actual armor face surrounds gland`);
      const point=frame.worldToLocal(first.point.clone());
      tank.recoilKick(0,.5);tank.syncFromState(state,.08);tank.root.updateMatrixWorld(true);
      const second=cast([mount],frame,origin,[0,0,-1],1);assert.ok(second,`${id}: armor face remains after recoil`);
      assert.ok(frame.worldToLocal(second.point.clone()).distanceTo(point)<1e-6,`${id}: mantlet pitches but does not recoil`);
      assertHullClearance(tank,mount,`${id}/${quality}/${degrees}`);
      const bearing=cast([mount],frame,[-.8,0,0],[1,0,0],.8);
      assert.ok(bearing,`${id}: transverse bearing is real solid stock`);
    }
  }finally{tank.dispose();}
}
console.log('IFV lower glacis, rooted open cradle, shaped rocking mantlets and HIGH/LOW articulation pass');
