import assert from 'node:assert/strict';
import {DoubleSide, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
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
    // Independently sample the visible face next to BOTH asymmetric cheeks.
    // A box or symmetrical mask leaves one side proud or deeply recessed.
    const faces=[];
    for(const s of [-1,1]){
      // This upper face remains exposed above the HA/UA searchlight.
      const cheek=front(fixed,s*.63,.535);
      const cover=front(moving,s*.59-gun.position.x,.535-gun.position.y)+gun.position.z;
      const setback=cheek-cover;
      assert.ok(setback>.005&&setback<.10,`${id}/${quality}: close cheek fit ${s}: ${setback}`);
      faces.push(cover);
    }
    assert.ok(faces[0]-faces[1]>.18,`${id}: shield follows the staggered cheek noses`);
    // The visible forged cover narrows into the round cradle instead of
    // retaining a vertical-sided cube at the barrel root.
    for(const z of [.46,.59,.74])for(let k=0;k<16;k++){
      const a=(k+.5)*Math.PI/8,dx=Math.cos(a),dy=Math.sin(a);
      ray.set(new Vector3(dx*.24,dy*.24,z),new Vector3(-dx,-dy,0));ray.far=.13;
      const h=ray.intersectObject(moving)[0];
      assert.ok(h,`${id}: continuous round cradle ${z}/${k}`);
      const r=Math.hypot(h.point.x,h.point.y);
      assert.ok(r>.142&&r<.150,`${id}: circular cradle radius ${r}`);
    }
    const shell=mount.geometry.attributes.position;
    const meshes=[];tank.root.traverse(o=>{if(o.isMesh&&visible(o))meshes.push(o);});
    let minClearance=Infinity;
    for(const yaw of [0,Math.PI/2,Math.PI])for(const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]){
      state.turretYaw=yaw;state.gunPitch=pitch*Math.PI/180;
      tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
      for(const x of [-.44,.44]){
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
    if(id==='m1a1ha'||id==='ua_m1a1'){
      // Across the former air gap, the lamp now has finite painted support.
      for(const x of [-.41,-.48]){
        ray.set(new Vector3(x,.04,.50),new Vector3(0,0,-1));ray.far=.42;
        const hits=ray.intersectObject(moving);
        assert.ok(hits.some(h=>h.point.z<.40&&h.point.z>.09),`${id}: lamp has a solid support back to shield`);
      }
    }
    console.log(`${id}/${quality}: fitted asymmetric shield, open receiver, round cradle, pitch/recoil PASS; hull clearance >= ${(minClearance*1000).toFixed(1)} mm`);
  }finally{tank.dispose();}
}
mat.dispose();
