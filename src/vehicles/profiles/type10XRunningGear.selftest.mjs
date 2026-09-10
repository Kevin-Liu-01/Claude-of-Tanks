import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT} from '../tankFactoryCore.ts';
import {matrix,finiteClearance,rollerSuspensionFixtures} from '../returnRollerPhysicsTest.mjs';
import {auditVisibleReturnRollerContact} from '../returnRollerContactTest.mjs';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';

for(const quality of ['high','low']) {
  const original=KIT.buildRunningGear;let c;
  KIT.buildRunningGear=(port,cfg)=>{const gear=original(port,cfg);c={port,cfg,gear};return gear;};
  let tank;
  try {tank=createTank('type10_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:true,battleDetailLod:true});}
  finally {KIT.buildRunningGear=original;}
  try {
    const hull=c.port.hullG;Object.assign(c,{tank,receipt:hull.userData.runningGearReceipts[0]});
    assert.equal(c.cfg.trackTh,.09,'Owner-approved country-style track thickness');
    assert.deepEqual(c.receipt.trackCarrierWidthStations,[{z:-2.40,widthM:.42},{z:-2.30,widthM:.486738}],
      'Separate sprocket engagement lanes and full return-roller support');
    assert.equal(c.receipt.fitLoadedRun,true,'Finite wheel-rim fitting is active');
    assert.equal(hull.getObjectByName('gearReturnRollerRotors').count,6,'All three return supports on both sides exist');
    const wheels=['gearRoadWheelTires','gearRoadWheelDiscs','gearRoadWheelInsets'].map(name=>hull.getObjectByName(name));
    const roads=wheels[0],r=c.cfg.wheelR,w=c.cfg.wheelW;
    const slabs=[{minX:-w*.74-2e-7,maxX:-.05+2e-7,r:r+2e-7},
      {minX:.05-2e-7,maxX:w*.74+2e-7,r:r+2e-7},
      {minX:-w*.74-2e-7,maxX:w*.74+2e-7,r:r*.32+2e-7}];
    assert.equal(roads.count,10);
    // Every actual native triangle is inside one convex finite cylinder.
    // Their union leaves the real central guide channel open. Therefore a
    // positive cylinder/track lower bound proves actual stock nonpenetration.
    for(const mesh of wheels) {
      assert.equal(mesh.count,10);
      const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
      for(let j=0;j<(ix?.count??p.count);j+=3) {
        const tri=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(p,ix?ix.getX(j+k):j+k));
        assert.ok(slabs.some(b=>tri.every(v=>v.x>=b.minX&&v.x<=b.maxX&&Math.hypot(v.y,v.z)<=b.r)),
          `${mesh.name}: actual triangle ${j/3} must be covered by the independent stock bound`);
      }
    }
    const track=['gearTrackBandL','gearTrackBandR','gearTrackPads','gearTrackPadsSimplified'].map(name=>hull.getObjectByName(name));
    for(const mesh of track)mesh.geometry.computeBoundingBox();
    const audit=()=>{
      const bounds=[];
      for(let i=0;i<roads.count;i++) {
        const m=matrix(roads,i,hull),center=new T.Vector3().setFromMatrixPosition(m);
        assert.ok(Math.abs(m.elements[0]-1)<1e-6&&Math.abs(m.determinant()-1)<1e-6,'Native wheel preserves X axle/radius');
        for(const b of slabs)bounds.push({...b,wheel:i,center,minX:b.minX+center.x,maxX:b.maxX+center.x,
          box:new T.Box3(new T.Vector3(b.minX+center.x,center.y-b.r-.01,center.z-b.r-.01),
            new T.Vector3(b.maxX+center.x,center.y+b.r+.01,center.z+b.r+.01))});
      }
      let minimum=Infinity,worst;
      for(const mesh of track)for(let i=0;i<(mesh.isInstancedMesh?mesh.count:1);i++) {
        const m=matrix(mesh,i,hull),box=mesh.geometry.boundingBox.clone().applyMatrix4(m);
        const near=bounds.filter(b=>b.box.intersectsBox(box));if(!near.length)continue;
        const gap=finiteClearance(mesh,m,near);
        if(gap<minimum){minimum=gap;worst={mesh:mesh.name,instance:i,gap};
          if(gap<0) {const b=near.find(b=>Math.abs(finiteClearance(mesh,m,[b])-gap)<1e-9);
            worst.stock={wheel:b.wheel,center:b.center.toArray(),minX:b.minX,maxX:b.maxX,r:b.r};}
        }
      }
      return{minimum,worst};
    };
    let minimum=Infinity,poses=0,worst;const states=[];
    c.gear.resetPose();tank.root.updateMatrixWorld(true);
    const rest=Array.from({length:roads.count},(_,i)=>new T.Vector3().setFromMatrixPosition(matrix(roads,i,hull)).y);
    for(const {name,targetM,sample} of rollerSuspensionFixtures(c)) {
      c.gear.resetPose();
      for(let tick=0;tick<180;tick++)c.gear.conform({pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0},sample,0,0,1/60);
      for(let phase=0;phase<16;phase++) {
        const scroll=c.receipt.shoePitchM*phase/16;c.gear.update(scroll,-scroll,1/60);tank.root.updateMatrixWorld(true);
        if(phase===0&&targetM!==null)for(let i=0;i<roads.count;i++)
          assert.ok(Math.abs(new T.Vector3().setFromMatrixPosition(matrix(roads,i,hull)).y-rest[i]-targetM)<2e-6,
            `${quality}: actual ${name} wheel ${i} reaches the configured stroke`);
        const row=audit();
        if(row.minimum<minimum){minimum=row.minimum;worst={name,phase,...row.worst};}
        poses++;
      }
      states.push({name,targetM});
    }
    console.log(JSON.stringify({quality,poses,minimum,worst,states}));
    assert.ok(Number.isFinite(minimum)&&minimum>=-2e-6,'Actual moving stock clears all ten road wheels');
    // A physically displaced native carrier must fail this very same check;
    // neither the reported receipt nor the stock bounds can hide an overlap.
    c.gear.resetPose();tank.root.updateMatrixWorld(true);
    const band=track[0],originalY=band.position.y;band.position.y+=.12;tank.root.updateMatrixWorld(true);
    assert.ok(audit().minimum<-.05,'Negative control: lifted carrier intersects real wheel stock');
    band.position.y=originalY;
    c.gear.resetPose();tank.root.updateMatrixWorld(true);
    const visible=auditVisibleReturnRollerContact(tank,c.gear,
      createTankState(getSpec('type10_x'),new T.Vector3(),0),{radiusM:.095});
    for(const row of visible)assert.equal(row.contact,'PASS',JSON.stringify(row));
    console.log(JSON.stringify({quality,rollerMaximumGapM:Math.max(...visible.map(row=>row.maximumVisibleSupportGapM)),
      distances:visible.map(row=>row.distance),negativeCarrierControl:true}));
  }finally{tank.dispose();}
}
