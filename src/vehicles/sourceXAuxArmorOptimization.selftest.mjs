import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Vector3,Matrix4,Euler,Quaternion} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {applySourceXOtherAuxArmor} from './sourceXOtherAuxArmor.ts';
import {traceTank,tankPoseFromState} from '../sim/armor.ts';
import {assertArmorTraceBounds} from '../sim/armorOutline.test-support.mjs';
const ids=['k1a1_x','amx30_x','leclerc_x','leclerc_classic_x','type10_x','type90_x','amx40_x'];
const serialize=v=>JSON.stringify(v,(key,value)=>key==='traceBounds'?undefined:value);
const hash=v=>crypto.createHash('sha256').update(serialize(v)).digest('hex');
assert.equal(hash(ids.map(id=>({id,armor:getSpec(id).armor}))),
  'f78d1ab99291e9963524addc676fb087da802a82de3e345b692852202e95f59e',
  'all seven complete pre-optimization armor objects remain byte-identical except optional acceleration data');

for(const[id,donor]of[['type10_x','type10'],['leclerc_x','leclerc']]){
  const original=structuredClone(getSpec(donor)),first=structuredClone(original),second=structuredClone(original);
  applySourceXOtherAuxArmor(first,id);const before=serialize(first);
  for(const p of second.armor.hullPlates.filter(p=>/^skirt_[LR]$/.test(p.name))){p.physicalMm+=7;p.keMm+=11;p.ceMm+=13;}
  applySourceXOtherAuxArmor(second,id);
  for(const p of second.armor.hullPlates.filter(p=>p.surfaceGroup)){
    const same=first.armor.hullPlates.find(q=>q.name===p.name);
    assert.deepEqual(p.verts,same.verts);assert.notEqual(p.verts,same.verts);
    assert.deepEqual([p.physicalMm,p.keMm,p.ceMm],[same.physicalMm+7,same.keMm+11,same.ceMm+13]);
    p.verts[0][0]+=20;if(p.openEdges)p.openEdges.push(0);
    if(p.traceBounds)p.traceBounds.min[0]-=20;
  }
  assert.equal(serialize(first),before,'one instance cannot mutate another instance or its donor fields');
  const third=structuredClone(original);applySourceXOtherAuxArmor(third,id);
  assert.deepEqual(third,first,'returned mutable arrays and bound tuples cannot poison cached canonical contours');
}

let total=0,bounds=0,fallback=0;
for(const id of ids){
  const tank=createTank(id,null,{quality:'high',proceduralOnly:true,geometryReceipt:true,camoSeed:4242});tank.dispose();
  const armor=getSpec(id).armor,exact=JSON.parse(serialize(armor));
  const points=[];
  for(const plate of armor.hullPlates.filter(p=>p.surfaceGroup)){
    assertArmorTraceBounds(plate.verts,plate.traceBounds,`${id}/${plate.name}`);
    if(plate.traceBounds)bounds++;else fallback++;
    points.push(plate.verts.reduce((a,b)=>a.map((v,k)=>v+b[k]/plate.verts.length),[0,0,0]));
    for(let i=0;i<plate.verts.length;i++){
      const a=plate.verts[i],b=plate.verts[(i+1)%plate.verts.length];points.push(a,a.map((v,k)=>(v+b[k])/2));
    }
  }
  for(let i=0;i<points.length;i++){
    const point=points[i],side=Math.sign(point[0])||1;
    const pose=tankPoseFromState({pos:new Vector3(2,-1,3),yaw:[0,.13,-.17][i%3],visualPitch:.07,
      visualRoll:-.03,turretYaw:.13,gunPitch:-.03});
    const frame=new Matrix4().compose(pose.pos,new Quaternion().setFromEuler(new Euler(-pose.pitch,pose.yaw,pose.roll,'YXZ')),new Vector3(1,1,1));
    const from=new Vector3(...point).add(new Vector3(side*.3,0,0)).applyMatrix4(frame);
    const to=new Vector3(...point).add(new Vector3(-side*.2,0,0)).applyMatrix4(frame);
    assert.equal(serialize(traceTank(from,to,pose,armor)),serialize(traceTank(from,to,pose,exact)),
      `${id}/${i}: full ordered hit results retain all geometric fields, layers, normals, owners and exact seam behavior`);total++;
  }
}
console.log(`sourceXAuxArmorOptimization: PASS — ${total} actual full-result controls; ${bounds} conservative bounds, ${fallback} exact fallbacks; unchanged seven-ID contour/donor hashes and isolated cache instances`);
