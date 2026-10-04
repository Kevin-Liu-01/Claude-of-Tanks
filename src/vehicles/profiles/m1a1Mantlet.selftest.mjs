import assert from 'node:assert/strict';
import {DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
import {createTank} from '../tankFactory.ts';
import {ALL_TANK_IDS,getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {near} from '../../../tools/receipt-kit.test-support.mjs';

const ids=['m1a1','m1a1ha','m1a2','m1a2_tusk','m1a2_sepv2','m1a2_sepv3','ua_m1a1'];
assert.deepEqual(ALL_TANK_IDS.filter(id=>/^M1A1\b/.test(getSpec(id).name)).sort(),[...ids].sort(),
  'Every playable M1A1 configuration participates in the fit checks');
const mat=new MeshBasicMaterial({side:DoubleSide});
const ray=new Raycaster(), point=new Vector3();
function front(mesh,x,y){
  ray.set(new Vector3(x,y,4),new Vector3(0,0,-1));ray.far=8;
  const hit=ray.intersectObject(mesh)[0];
  assert.ok(hit,`stock at ${x},${y}`);return hit.point.z;
}
// Clip triangle edges at both sleeve ends: a long root triangle can cross
// the cradle even when none of its original vertices lie inside it.
function radiusInSlab(mesh,toFrame,lo,hi){
  const p=mesh.geometry.attributes.position,ix=mesh.geometry.index;
  const v=[new Vector3(),new Vector3(),new Vector3()],crossing=new Vector3();
  let radius=0;
  const include=a=>{if(a.z>=lo-1e-7&&a.z<=hi+1e-7)radius=Math.max(radius,Math.hypot(a.x,a.y));};
  for(let j=0;j<(ix?.count??p.count);j+=3){
    for(let k=0;k<3;k++){v[k].fromBufferAttribute(p,ix?ix.getX(j+k):j+k).applyMatrix4(toFrame);include(v[k]);}
    for(let k=0;k<3;k++)for(const z of [lo,hi]){
      const a=v[k],b=v[(k+1)%3];
      if((a.z-z)*(b.z-z)<0)include(crossing.copy(a).lerp(b,(z-a.z)/(b.z-a.z)));
    }
  }
  return radius;
}
function visible(object){
  if(object.userData.shadowOnly||object.userData.authoredShadowProxy)return false;
  for(let p=object;p;p=p.parent)if(!p.visible)return false;
  return true;
}
for(const quality of ['high','low'])for(const id of ids){
  const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
  try{
    const spec=getSpec(id),state=createTankState(spec,new Vector3(),0);
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const recoil=tank.root.getObjectByName('rig_recoil'),mount=tank.root.getObjectByName('gunMount');
    assert.equal(mount.parent,gun,`${id}: shield pitches without recoiling`);
    const fixed=new Mesh(tank.root.getObjectByName('turret').geometry,mat);
    const moving=new Mesh(mount.geometry,mat);
    fixed.updateMatrixWorld(true);moving.updateMatrixWorld(true);
    // A real cutout through fixed armor, not a dark square painted on a block.
    for(const x of [-.30,.25])for(const y of [.23,.38,.48]){
      assert.ok(front(fixed,x,y)<=gun.position.z-.039,`${id}: central pitch bay is open`);
    }
    // The owner's front photograph shows one broad raked armor face. The
    // previous cheek-following cover skewed 235 mm across this region.
    for (const y of [.08,.19]) {
      const left=front(moving,-.27,y),right=front(moving,.37,y);
      near(left,right,.002,`${id}: face is straight across the barrel`);
    }
    assert.ok(front(moving,.36,-.12)>front(moving,.36,.19)+.12,
      `${id}: front plate has a real rake rather than a vertical cube`);
    assert.ok(front(moving,-.24,-.33)<front(moving,-.24,-.245)-.10,
      `${id}: lower chin steps back under the main shield`);
    // Coax aperture has finite depth on the actual rendered armor, with a
    // receiver behind it. A painted circle on the face fails this ray pair.
    const dark=new Mesh(tank.root.getObjectByName('gunMountDark').geometry,mat);
    dark.updateMatrixWorld(true);
    ray.set(new Vector3(-.265,-.095,1),new Vector3(0,0,-1));ray.far=1.1;
    assert.equal(ray.intersectObjects([moving,dark])[0]?.object,dark,
      `${id}: recessed receiver is visible through the coax aperture`);
    ray.set(new Vector3(-.264,-.094,1),new Vector3(0,0,-1));ray.far=1.2;
    const supportFront=ray.intersectObject(moving)[0].point.z;
    assert.ok(ray.intersectObject(dark).some(h=>h.point.z<supportFront-.02&&h.point.z>-.16),
      `${id}: recessed coax receiver overlaps its trunnion support`);
    const coaxWall=front(moving,-.265,-.04),coaxRear=front(dark,-.265,-.095);
    assert.ok(coaxWall-coaxRear>.08,`${id}: recessed coax aperture`);
    // Round fixed sleeve leaves clearance around the recoiling thermal tube.
    for(const z of [.54,.65,.71])for(let k=0;k<16;k++){
      const a=(k+.5)*Math.PI/8,dx=Math.cos(a),dy=Math.sin(a);
      ray.set(new Vector3(dx*.24,dy*.24,z),new Vector3(-dx,-dy,0));ray.far=.13;
      const h=ray.intersectObject(moving)[0];
      assert.ok(h,`${id}: continuous round cradle ${z}/${k}`);
      const r=Math.hypot(h.point.x,h.point.y);
      assert.ok(r>.153&&r<.157,`${id}: circular cradle radius ${r}`);
    }
    const shell=mount.geometry.attributes.position;
    const meshes=[];tank.root.traverse(o=>{if(o.isMesh&&visible(o))meshes.push(o);});
    let minClearance=Infinity;
    for(const yaw of [0,Math.PI/2,Math.PI])for(const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]){
      state.turretYaw=yaw;state.gunPitch=pitch*Math.PI/180;
      tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
      for(const x of [-.25,.35]){
        // Check the actual surface's immediate clearance, including every
        // visible mesh. A distant camera ray can legitimately meet the UA
        // stand-off cage before reaching the otherwise exposed shield.
        const maskZ=front(moving,x,.22);
        ray.set(gun.localToWorld(new Vector3(x,.22,maskZ+.015)),
          new Vector3(0,0,-1).transformDirection(gun.matrixWorld));ray.far=.03;
        const hit=ray.intersectObjects(meshes,false)[0];
        assert.ok(hit&&hit.object===mount,`${id}: actual visible mask follows yaw ${yaw}, pitch ${pitch}: ${hit?.object.name}`);
      }
      if(yaw===0)for(let i=0;i<shell.count;i++){
        point.fromBufferAttribute(shell,i).applyMatrix4(mount.matrixWorld);
        minClearance=Math.min(minClearance,point.y-1.52);
        assert.ok(point.y>1.52,`${id}: mantlet clears front hull at ${pitch}`);
      }
      assert.ok(tank.gunMuzzleWorld(new Vector3()).toArray().every(Number.isFinite));
    }
    state.turretYaw=0;state.gunPitch=0;tank.syncFromState(state,0);
    const maskPosition=mount.position.clone();
    tank.recoilKick(0,1);tank.syncFromState(state,.12);
    assert.ok(recoil.position.z<-.05,`${id}: barrel recoils inside cradle`);
    assert.deepEqual(mount.position,maskPosition,`${id}: mask remains seated on pitch joint`);
    tank.syncFromState(state,1);near(recoil.position.z,0,1e-8,`${id}: recoil returns`);
    const tube=tank.root.getObjectByName('gun'),toGun=new Matrix4();
    for(let i=0;i<=32;i++){
      tank.recoilKick(.12*i/32,1);tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
      toGun.copy(gun.matrixWorld).invert().multiply(tube.matrixWorld);
      const clearance=.132-radiusInSlab(tube,toGun,-.14,.73);
      assert.ok(clearance>.005,`${id}: root clears sleeve throughout recoil (${clearance} m)`);
    }
    if(id==='m1a1ha'||id==='ua_m1a1'){
      // Across the former air gap, the lamp now has finite painted support.
      for(const x of [-.41,-.48]){
        ray.set(new Vector3(x,.04,.50),new Vector3(0,0,-1));ray.far=.42;
        const hits=ray.intersectObject(moving);
        assert.ok(hits.some(h=>h.point.z<.40&&h.point.z>.09),`${id}: lamp has a solid support back to shield`);
      }
    }
    console.log(`${id}/${quality}: broad raked face, stepped chin, recessed coax, open receiver, round cradle, pitch/recoil PASS; hull clearance >= ${(minClearance*1000).toFixed(1)} mm`);
  }finally{tank.dispose();}
}
mat.dispose();
