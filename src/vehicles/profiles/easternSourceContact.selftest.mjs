import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { ensureInteriorFills, hasInteriorFills } from '../interiorFills.ts';
import { createTankState } from '../../sim/movement.ts';

function hullFrameRays(tank) {
  const hull=tank.root.getObjectByName('rig_hull'), surfaces=[];
  tank.root.traverseVisible(mesh=>{if(mesh.isMesh)surfaces.push(mesh)});
  const scale=hull.getWorldScale(new THREE.Vector3()).x;
  return (position,direction,far)=>new THREE.Raycaster(
    hull.localToWorld(new THREE.Vector3(...position)),
    new THREE.Vector3(...direction).transformDirection(hull.matrixWorld),0,far*scale,
  ).intersectObjects(surfaces,false).map(hit=>({
    mesh:hit.object,point:hull.worldToLocal(hit.point.clone()),
  }));
}

function checkType96Hatch(tank) {
  const ray=hullFrameRays(tank);
  // Independent Object_12 witnesses: circular raised center Y2.32196,
  // oval outer lip Y2.31134; the two diagonal corners have no hatch stock.
  for(const[x,z,y]of[[.587,-.213,2.32196],[.24,-.213,2.31134]]) {
    const hit=ray([x,2.6,z],[0,-1,0],.4)[0];
    assert.ok(hit&&hit.mesh.name==='turretDetail'&&Math.abs(hit.point.y-y)<.002,
      'rounded secondary hatch must expose its measured stepped lid');
  }
  for(const[x,z]of[[.30,-.40],[.92,-.35]]) {
    const hit=ray([x,2.6,z],[0,-1,0],.4)[0];
    assert.equal(hit?.mesh.name,'turret','oval hatch must not fill its rectangular AABB corners');
  }
  assert.equal(ray([.37545,2.320,-.218],[0,0,1],.051).length,0,
    'secondary hatch grab handle must retain finite air beneath its rail');
  const underside=ray([.37545,2.317,-.1916],[0,1,0],.020)[0];
  assert.ok(underside&&Math.abs(underside.point.y-2.325)<.001,
    'open handle needs an actual visible rail underside');
}

function checkAftBridgeAndMast(tank) {
  const ray=hullFrameRays(tank), turret=tank.root.getObjectByName('rig_turret');
  // Object_18 source first hits: upper/lower bridge Y1.975/1.9663. These
  // slots perforate the thin bridge; they do not remove the recessed hull.
  for(const x of[-.465,-.153,.156,.468])for(const z of[-3.555,-3.437,-3.319,-3.201])
    assert.equal(ray([x,2.04,z],[0,-1,0],.080).length,0,'all sixteen stern slots must be real openings');
  // Independent canonical-source edge witnesses. The former 190×52mm
  // openings erased real web strips and shifted two column centers.
  for(const [x,width]of[[-.46435,.18450],[-.14815,.18490],[.15475,.18490],[.47110,.18480]])
    for(const [z,length]of[[-3.55565,.04490],[-3.43750,.04300],[-3.31935,.04490],[-3.20215,.04490]])
      for(const [dx,dz]of[[width/2,0],[-width/2,0],[0,length/2],[0,-length/2]]) {
        const axis=dx?0:1,sign=Math.sign(dx||dz);
        const inward=[x+dx,z+dz],outward=[...inward];
        inward[axis]-=sign*.001;outward[axis]+=sign*.001;
        assert.equal(ray([inward[0],2.04,inward[1]],[0,-1,0],.080).length,0,
          'all sixteen source slot edges retain real air 1mm inside');
        const web=ray([outward[0],2.04,outward[1]],[0,-1,0],.080)[0];
        assert.ok(web&&Math.abs(web.point.y-1.975)<.0001,
          'all sixteen source slot edges retain the plate 1mm outside');
      }
  const top=ray([0,2.04,-3.555],[0,-1,0],.1)[0];
  const bottom=ray([0,1.92,-3.555],[0,1,0],.1)[0];
  assert.ok(top&&bottom&&Math.abs(top.point.y-1.975)<.0005&&Math.abs(bottom.point.y-1.9663)<.0005,
    'stern bridge must retain source thickness and both outward faces');
  assert.equal(ray([0,1.85,-3.60],[0,0,1],.35).length,0,'thin bridge must not fill the recessed stern');
  // Independent source horizontal sections distinguish the broad receiver
  // from its offset narrow neck. Generic blue boxes cannot pass these rays.
  for(const[y,x]of[[1.83,-1.166],[2.1,-1.19558],[2.2,-1.19558]]) {
    const hit=ray([-.7,y,2.782],[-1,0,0],1)[0];
    assert.ok(hit&&hit.mesh.name==='hullDetail'&&Math.abs(hit.point.x-x)<.002,
      'bow mast must show its source-positioned stepped receiver and raised neck');
  }
  turret.rotation.y=.6;tank.root.updateMatrixWorld(true);
  const fixedBridge=ray([0,2.04,-3.555],[0,-1,0],.1)[0];
  const fixedMast=ray([-.7,2.1,2.782],[-1,0,0],1)[0];
  assert.ok(fixedBridge&&fixedMast&&Math.abs(fixedBridge.point.y-1.975)<.0005&&Math.abs(fixedMast.point.x+1.19558)<.002,
    'stern bridge and bow mast must stay on their hull receivers during turret yaw');
}

function checkAftInstalledWheels(tank) {
  const ray=hullFrameRays(tank), hull=tank.root.getObjectByName('rig_hull');
  const receipt=hull.userData.runningGearReceipts[0];
  assert.equal(receipt.wheelY,.3676,'loaded axle height remains the pre-correction receipt datum');
  assert.equal(receipt.xcLeft,1.4035);assert.equal(receipt.xcRight,1.4035);
  const stations=[-2.2951,-1.4028,-.4539,.4847,1.2860,2.1781];
  assert.deepEqual(receipt.wheelZs,stations,'source wheel stations must not move to improve the face');
  const angle=.55;
  for(const side of[-1,1])for(const z of stations) {
    const name=side<0?'aftSourceWheelNegative':'aftSourceWheelPositive';
    for(const[r,expected]of[[.02,.1204],[.06,.0910],[.09,.0509],[.12,.0545],[.18,.0619],[.22,.0668],[.26,.13235]]) {
      const first=ray([side*1.90,receipt.wheelY+Math.sin(angle)*r,z+Math.cos(angle)*r],[-side,0,0],.65)[0];
      assert.ok(first&&first.mesh.name===name,'full-scene ray must hit the measured visible face before any fallback disc/inset');
      assert.ok(Math.abs(side*first.point.x-1.4035-expected)<.0015,'installed FrontSide wheel face must retain source axial stock');
    }
  }
  const tire=tank.root.getObjectByName('gearRoadWheelTires');
  for(const side of[-1,1]) {
    const layer=tank.root.getObjectByName(side<0?'aftSourceWheelNegative':'aftSourceWheelPositive');
    const shoulder=tank.root.getObjectByName(side<0?'aftSourceWheelTireShoulderNegative':'aftSourceWheelTireShoulderPositive');
    assert.equal(layer.count,6,'one measured face belongs to each native road wheel');
    assert.equal(shoulder.count,6,'extra tire width belongs only to the source outboard half');
    const solids=[tire,layer,shoulder], angle=.55, radius=.281;
    const fromGap=outward=>new THREE.Raycaster(
      hull.localToWorld(new THREE.Vector3(side*1.4035,.3676+Math.sin(angle)*radius,-.4539+Math.cos(angle)*radius)),
      new THREE.Vector3(side*(outward?1:-1),0,0).transformDirection(hull.matrixWorld),0,.3,
    ).intersectObjects(solids)[0];
    for(const[outward,expected]of[[true,.02025],[false,-.03515]]) {
      const hit=fromGap(outward);assert.ok(hit,'both source tire inner walls must face the real gap');
      const point=hull.worldToLocal(hit.point.clone());
      assert.ok(Math.abs(side*point.x-1.4035-expected)<.0005,'asymmetric tire bands must mirror with vehicle side');
    }
    for(let i=0;i<layer.count;i++) {
      const matrix=new THREE.Matrix4();layer.getMatrixAt(i,matrix);
      const shoulderMatrix=new THREE.Matrix4();shoulder.getMatrixAt(i,shoulderMatrix);
      assert.ok(matrix.equals(shoulderMatrix),'measured tire shoulder shares its steel face suspension matrix');
      const found=Array.from({length:tire.count},(_,j)=>{
        const other=new THREE.Matrix4();tire.getMatrixAt(j,other);return matrix.equals(other);
      }).some(Boolean);
      assert.ok(found,'measured face and tire must share their native suspension instance matrix');
    }
  }
  const layers=[];
  tank.root.traverse(object=>{if(object.name.startsWith('aftSourceWheel'))layers.push(object)});
  const before=layers.map(layer=>Array.from(layer.instanceMatrix.array));
  const state=createTankState(getSpec('aft10_x'),new THREE.Vector3(),0);
  tank.setGroundSampler((_x,z)=>Math.abs(z)<.6?-.12:0);
  state.trackScroll.l=.27;state.trackScroll.r=.16;
  for(let step=0;step<12;step++)tank.syncFromState(state,1/30,20);
  for(const[index,layer]of layers.entries()) {
    assert.notDeepEqual(Array.from(layer.instanceMatrix.array),before[index],
      'source steel and asymmetric tire stock must follow native wheel rotation and suspension');
    for(let i=0;i<layer.count;i++) {
      const matrix=new THREE.Matrix4();layer.getMatrixAt(i,matrix);
      assert.ok(Array.from({length:tire.count},(_,j)=>{
        const other=new THREE.Matrix4();tire.getMatrixAt(j,other);return matrix.equals(other);
      }).some(Boolean),'moving measured wheel layers cannot acquire independent stations or rotations');
    }
  }
}

for(const quality of['high','low'])for(const id of['bmp3m_dragun125_x','k21_x','type96b_x']) {
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  try {
    const bore=tank.root.userData.physicalMuzzleBoreVerification;
    assert.ok(bore&&bore.minimumDepthM>=.10,`${id} ${quality} must verify actual recessed muzzle stock`);
    if(id!=='type96b_x')continue;
    tank.root.updateMatrixWorld(true);
    checkType96Hatch(tank);
    const hull=tank.root.getObjectByName('rig_hull');
    const surfaces=[];hull.traverseVisible(m=>{if(m.isMesh)surfaces.push(m)});
    const direction=new THREE.Vector3(0,0,1).transformDirection(hull.matrixWorld);
    const firstRearZ=(x,y)=>{
      const ray=new THREE.Raycaster(hull.localToWorld(new THREE.Vector3(x,y,-5)),direction);
      const hit=ray.intersectObjects(surfaces,false)[0];assert.ok(hit,'rear surface must exist');
      return hull.worldToLocal(hit.point.clone()).z;
    };
    assert.ok(Math.abs(firstRearZ(0,1.30)+3.3848)<.001,'rear hull cap must use its own source datum, not the towing AABB');
    // Canonical Object_22 scalar blade centers plus 14 mm: these witness
    // the raised rear lips of all nine 29–35 mm-pitch source louvers. The old
    // three Y samples were tied to seven fabricated 57 mm-pitch horizontal bars.
    const lipYs=[1.2057,1.2345,1.2687,1.3029,1.33755,1.36585,1.40005,1.4342,1.4689];
    for(const side of[-1,1])for(const x of[.20,.473,.74])for(const y of lipYs) {
      const z=firstRearZ(side*x,y);
      assert.ok(z< -3.405&&z> -3.440,`rearward ray must see exposed louver stock before the hull (${x},${y}: ${z})`);
    }
  } finally {tank.dispose()}
}
await ensureInteriorFills(['aft10_x']);
assert.ok(hasInteriorFills('aft10_x'),'AFT slot/stock witnesses include the loaded generated fill record');
for(const quality of['high','low']) {
  const tank=createTank('aft10_x',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242});
  const frontSide=new THREE.MeshBasicMaterial({side:THREE.FrontSide});
  try {
    tank.root.traverse(mesh=>{if(mesh.isMesh)mesh.material=frontSide;});
    tank.root.updateMatrixWorld(true);checkAftInstalledWheels(tank);checkAftBridgeAndMast(tank);
  } finally {tank.dispose();frontSide.dispose();}
}
console.log('easternSourceContact: HIGH/LOW cannon bores, Type96 louvers/hatch, AFT bridge/mast and actual installed source wheel faces pass stock and air witnesses');
