import assert from 'node:assert/strict';
import {DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3} from 'three';
import {createTank} from '../tankFactory.ts';
import {ALL_TANK_IDS,getSpec} from '../specs.ts';
import {createTankState,updateTank,SIM_DT} from '../../sim/movement.ts';
import {minimumMechanicalGunPitch} from '../../sim/gunPitchLimits.ts';
import {M1A1_GUN_PITCH_BY_YAW} from '../m1a1GunLimits.ts';
import {near} from '../../../tools/receipt-kit.test-support.mjs';
import {measureGunHullClearance} from './bradleyGunClearance.test-support.mjs';

const ids=['m1a1','m1a1ha','m1a1_abrams_hc','m1a1_abrams_sa','m1a1_abrams_aim','m1a1_abrams_fep','ua_m1a1'];
assert.deepEqual(ALL_TANK_IDS.filter(id=>/^M1A1\b/.test(getSpec(id).name)).sort(),[...ids].sort(),
  'Every playable M1A1 configuration participates in the fit checks');
assert.deepEqual(Object.keys(M1A1_GUN_PITCH_BY_YAW).sort(),[...ids].sort());
// 2026-10-22 (release 240): these frames may publish their own measured curves (the M1A2 X family since the gun-hull
// lane's batch 3, the MBT-70 since its rebuild); what must hold is that none carries one of the M1A1 donor's curves.
const donorCurves=Object.values(M1A1_GUN_PITCH_BY_YAW).map(curve=>JSON.stringify(curve));
for(const id of ['m1a2_abrams','m1a2_abrams_tusk','m1a2_abrams_sepv2','m1a2_abrams_sepv3','ua_m1a2_abrams','abramsx','m1a3','mbt70'])
  assert.ok(!donorCurves.includes(JSON.stringify(getSpec(id).gunPitchByYawDeg)),`${id}: legacy donor stops do not leak to unrelated frames`);
const flatField={getHeightAt:()=>-20,getGroundType:()=>'dirt',getNormalAt:()=>new Vector3(0,1,0)};
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
    near(minimumMechanicalGunPitch(spec,0),-10*Math.PI/180,1e-12,`${id}: full forward depression retained`);
    for(const yaw of [0,30,75,125,163,180,245,285]){
      const held=createTankState(spec,new Vector3(),0);held.turretYaw=yaw*Math.PI/180;held.gunPitch=-10*Math.PI/180;
      updateTank({spec,state:held,input:{throttle:0,steer:0,brake:false,aimPoint:null,aimLocked:true},combat:null},flatField,SIM_DT);
      near(held.gunPitch,minimumMechanicalGunPitch(spec,held.turretYaw),1e-12,
        `${id}: actual held simulation pose obeys the mechanical stop at yaw ${yaw}`);
    }
    const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
    const recoil=tank.root.getObjectByName('rig_recoil'),mount=tank.root.getObjectByName('gunMount');
    assert.ok(mount.parent === gun,`${id}: shield pitches without recoiling`);
    const fixed=new Mesh(tank.root.getObjectByName('turret').geometry,mat);
    const moving=new Mesh(mount.geometry,mat);
    fixed.updateMatrixWorld(true);moving.updateMatrixWorld(true);
    // A real cutout through fixed armor, not a dark square painted on a block.
    for(const x of [-.30,.25])for(const y of [.23,.38,.48]){
      assert.ok(front(fixed,x,y)<=gun.position.z-.039,`${id}: central pitch bay is open`);
    }
    // 2026-11-03 (release 268 builder E, owner: "the mantlet and cannon ... match the model"): the gun shield is the measured
    // narrow recessed shield (profiles/m1a1GunMount.ts): it fills the 0.319 slot between the cheeks with a 12 mm
    // running gap a side, its face bulges forward at the gun axis, its top lies on the turret roof's forward course at
    // rest, its rear is a rotor arc nested in the fixed elevation recess, and the round collar and coax tube stand out of
    // it. The earlier broad raked plate, its journals and recessed coax receiver are gone; these checks replace theirs.
    const sideHit=(side)=>{ray.set(new Vector3(side*.6,0,.10),new Vector3(-side,0,0));ray.far=.6;return ray.intersectObject(moving)[0];};
    for(const side of [-1,1]){
      near(Math.abs(sideHit(side).point.x),.307,.0005,`${id}: shield fills the slot`);
      ray.set(new Vector3(0,gun.position.y,gun.position.z+.10),new Vector3(side,0,0));ray.far=.6;
      const cheek=ray.intersectObject(fixed)[0];
      const gap=Math.abs(cheek.point.x)-.307;
      assert.ok(gap>.008&&gap<.020,`${id}: 12 mm running gap to the cheek's slot wall (${gap} m)`);
    }
    const faceAxis=front(moving,.20,0),faceLow=front(moving,.20,-.25),faceHigh=front(moving,.20,.225);
    assert.ok(faceAxis>faceLow+.08&&faceAxis>faceHigh+.10,`${id}: the model's face bulges forward at the gun axis`);
    for(const y of [.20,-.20])near(front(moving,-.25,y),front(moving,.25,y),.002,`${id}: face is straight across the barrel`);
    ray.set(new Vector3(.20,1,0),new Vector3(0,-1,0));ray.far=2;
    const top=ray.intersectObject(moving)[0].point.y;
    const roofCourse=.7671-.1418*gun.position.z-gun.position.y;
    near(top,roofCourse,.003,`${id}: shield top lies on the roof's forward course at rest`);
    ray.set(new Vector3(.20,-1,.10),new Vector3(0,1,0));ray.far=2;
    near(ray.intersectObject(moving)[0].point.y,-.265,.001,`${id}: shield sill`);
    const throatFront=[];
    for(const dy of [0,.10,.20]){
      const fixedZ=front(fixed,-.25,gun.position.y+dy)-gun.position.z;
      ray.set(new Vector3(-.20,dy,-1),new Vector3(0,0,1));ray.far=1;
      const rotorRear=ray.intersectObject(moving)[0].point.z;
      const gap=rotorRear-fixedZ;
      assert.ok(gap>.010&&gap<.030,
        `${id}: fixed recess closely clears the shield's rotor arc (${gap} m)`);
      throatFront.push(fixedZ);
    }
    assert.ok(throatFront[0]<throatFront[2]-.04,
      `${id}: the turret throat wraps the rotor instead of ending in a flat block`);
    // The model's coax tube, with a dark bore at its end, beside the collar's upper right (vehicle right).
    const dark=new Mesh(tank.root.getObjectByName('gunMountDark').geometry,mat);
    dark.updateMatrixWorld(true);
    ray.set(new Vector3(-.225,.145,2),new Vector3(0,0,-1));ray.far=2.2;
    assert.ok(ray.intersectObjects([moving,dark])[0]?.object === dark,`${id}: dark coax bore at the tube's mouth`);
    assert.ok(front(moving,-.225,.145)>front(moving,-.225,.30)+.30,`${id}: coax tube stands out of the shield`);
    // Round fixed collar round the recoiling tube. Re-pinned 2026-11-03 (release 268 builder E, the blind A/B fix round):
    // sliced at 2.5 cm, the sleeve runs straight out of the shield face at r 0.146 to its 0.165
    // lip ring (the 0.172 drum was the face boss's radius); the fixed sleeve is 0.150 over the 0.146 thermal sleeve.
    for(const z of [.50,.60,.70])for(let k=0;k<16;k++){
      const a=(k+.5)*Math.PI/8,dx=Math.cos(a),dy=Math.sin(a);
      ray.set(new Vector3(dx*.20,dy*.20,z),new Vector3(-dx,-dy,0));ray.far=.08; // from inside the coax tube's nearest edge (0.23)
      const h=ray.intersectObject(moving)[0];
      assert.ok(h,`${id}: continuous round collar ${z}/${k}`);
      const r=Math.hypot(h.point.x,h.point.y);
      assert.ok(r>.148&&r<.1525,`${id}: circular collar radius ${r}`);
    }
    const shell=mount.geometry.attributes.position;
    const meshes=[];tank.root.traverse(o=>{if(o.isMesh&&visible(o))meshes.push(o);});
    let minClearance=Infinity;
    for(const yaw of [0,Math.PI/2,Math.PI])for(const pitch of [-spec.gunDepressionDeg,0,spec.gunElevationDeg]){
      state.turretYaw=yaw;state.gunPitch=pitch*Math.PI/180;
      tank.syncFromState(state,0);tank.root.updateMatrixWorld(true);
      for(const x of [-.20,.25]){
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
      // (builder E: the shield's square recoil passage, 0.121 m half-width, is the narrowest bore the root runs in)
      const clearance=.121-radiusInSlab(tube,toGun,-.14,.62);
      assert.ok(clearance>.005,`${id}: root clears sleeve throughout recoil (${clearance} m)`);
    }
    // Test the complete rear casting, not just the nominal sleeve radius:
    // a shallow transverse rotor return formerly entered this real passage
    // even though the separate collar still had a correctly sized bore.
    for(let z=-.14;z<=.001;z+=.01)for(let angle=0;angle<Math.PI*2;angle+=Math.PI/8){
      ray.set(new Vector3(0,0,z),new Vector3(Math.cos(angle),Math.sin(angle),0));ray.far=.25;
      const wall=ray.intersectObject(moving)[0];
      assert.ok(!wall||wall.distance>=.120,`${id}: entire rotor casting leaves the axial recoil passage open at z=${z}, angle=${angle}`);
    }
    // 2026-11-02 (release 268, abrams-bradley-268 builder A): the gun-rig searchlight is the Desert Storm HA's alone; the
    // Ukrainian M1A1 SA borrows the HA shell without it (research/ua_m1a1/photos), so only the HA keeps this support.
    if(id==='m1a1ha'){
      // Across the former air gap, the lamp now has finite painted support.
      for(const x of [-.41,-.48]){
        ray.set(new Vector3(x,.04,.70),new Vector3(0,0,-1));ray.far=.42;
        const hits=ray.intersectObject(moving);
        assert.ok(hits.some(h=>h.point.z<.58&&h.point.z>.48),`${id}: lamp has a solid support back to shield`);
      }
    }
    // The aft deck rises beneath the turret: checking only the front deck
    // plane missed the previous lower-face/chin and forward-sleeve crossings.
    // Clip rendered mount triangles against the finite structural deck and
    // armor through the complete yaw range. Netting and raised stowage are
    // not solid down to the hull: their contacts need 3D intersection checks,
    // rather than projecting their top faces into an infinite vertical solid.
    // The actual runtime yaw-dependent stop also protects the recoiling
    // barrel over the rear deck. Separate finite 3D equipment sweeps retain
    // the known, byte-identical SEPv2 forward barrel/fitting failure.
    const hullOptions={
      minimumHullY:1.3,
      fixedFilter:t=>/^hull(?:InteriorFill|ExternalArmor)?$/.test(t.name),
      yawDegrees:[...Array.from({length:72},(_,i)=>i*5),163.55,196.45],
      pitchDegrees:yaw=>{const low=minimumMechanicalGunPitch(spec,yaw*Math.PI/180)*180/Math.PI;
        return [low,low+.5,...[0,5,10,15,spec.gunElevationDeg,spec.gunElevationDeg+.014*180/Math.PI].filter(p=>p>low+.5)];},
      recoilDistances:[0,.065,.13],
    };
    const hullClearance=measureGunHullClearance(tank,hullOptions);
    assert.ok(hullClearance.minimum>.005,`${id}: whole gun assembly retains5mm clearance from finite structural deck/armor at runtime-legal poses: ${JSON.stringify(hullClearance)}`);
    if(id==='m1a1'){
      const pivot=gun.position.clone();pivot.y-=.06;
      const invalid=measureGunHullClearance(tank,{...hullOptions,
        yawDegrees:[170,180],pitchDegrees:[-spec.gunDepressionDeg],
        recoilDistances:[0],pivotOverride:pivot.toArray(),
      });
      assert.ok(invalid.minimum<-.02,`${id}: lowered mount must fail the finite aft-deck check`);
    }
    console.log(`${id}/${quality}: slot-filling bulged shield, roof-course top, rotor recess, coax tube, round collar, pitch/recoil PASS; hull clearance >= ${(minClearance*1000).toFixed(1)} mm`);
    console.log(`${id}/${quality}: whole gun/structural hull clearance ${(hullClearance.minimum*1000).toFixed(2)} mm across ${hullClearance.poses} poses`);
  }finally{tank.dispose();}
}
mat.dispose();
