import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';

await ensureInteriorFills('m551a1_tts');

const vector=(attribute,i)=>new THREE.Vector3().fromBufferAttribute(attribute,i);
function centroid(geometry){
  geometry.computeBoundingBox();return geometry.boundingBox.getCenter(new THREE.Vector3());
}
function ray(mesh,origin,direction){
  return new THREE.Raycaster(origin,direction).intersectObject(mesh)[0];
}
function backFace(geometry,normal){
  const p=geometry.attributes.position,n=geometry.attributes.normal,points=[];
  for(let i=0;i<p.count;i++)if(vector(n,i).dot(normal)<-.9999)points.push(vector(p,i));
  assert(points.length>=4,'finite flat rear face exists');
  return points;
}
function checkEmbed(shell,part,normal,label){
  const corners=backFace(part,normal),center=corners.reduce((a,p)=>a.add(p),new THREE.Vector3()).divideScalar(corners.length);
  for(const point of [center,...corners]){
    const hit=ray(shell,point.clone().addScaledVector(normal,.20),normal.clone().negate());
    assert(hit && hit.distance<.199,`${label}: entire mounting back must penetrate the casting, distance=${hit?.distance}`);
  }
}
function hasVertex(mesh,point){
  const p=mesh.geometry.attributes.position;
  for(let i=0;i<p.count;i++)if(vector(p,i).distanceToSquared(point)<1e-10)return true;
  return false;
}

for(const quality of ['high','low']){
  let casting;const feet=[],layers=[],lugs=[];
  const tank=createTank('m551a1_tts',null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:4242,
    partCensus(bucket,g){
      if(bucket==='turret'&&!casting)casting=g.clone();
      const center=centroid(g),stack=new Error().stack;
      if(stack.includes('addTtsLowerCheekEra')){
        if(bucket==='turretEquipment')feet.push(g.clone());
        if(bucket==='turretExternalArmor')layers.push(g.clone());
      }
      if(bucket==='turret'&&Math.abs(center.x)>.65&&Math.abs(center.x)<.85&&center.y>.25&&center.y<.45&&center.z>1.1&&center.z<1.3)lugs.push(g.clone());
    }});
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),shell=new THREE.Mesh(casting,material);
  shell.updateMatrixWorld(true);
  try{
    assert.equal(feet.length,8,'eight independent lower ERA seats');
    assert.equal(layers.length,16,'all eight ERA bodies and caps are retained');
    assert.equal(lugs.length,6,'both marked three-layer lugs are retained on the cheeks');
    for(let i=0;i<feet.length;i++){
      const side=i<4?-1:1,z=[.5,.7,.9,1.1][i%4];
      const stock=ray(shell,new THREE.Vector3(side*2,.30,z),new THREE.Vector3(-side,0,0));
      assert(stock,`${quality}: independent casting witness`);
      const normal=stock.face.normal.clone();
      checkEmbed(shell,feet[i],normal,`${quality} ERA seat ${i}`);
      // Read the body back and carrier front in the measured normal frame.
      const bodyBack=Math.min(...backFace(layers[i*2],normal).map(p=>p.dot(normal)));
      const carrierFront=Math.max(...Array.from({length:feet[i].attributes.position.count},(_,k)=>vector(feet[i].attributes.position,k).dot(normal)));
      assert(carrierFront-bodyBack>.009,`${quality}: cassette has real overlap with its own mounting foot`);
    }
    for(const side of [-1,1]){
      const stock=ray(shell,new THREE.Vector3(side*.78,.36,2),new THREE.Vector3(0,0,-1));
      const normal=stock.face.normal.clone(),parts=lugs.filter(g=>Math.sign(centroid(g).x)===side);
      checkEmbed(shell,parts[0],normal,`${quality} lug ${side}`);
      const intervals=parts.map(g=>{
        const values=Array.from({length:g.attributes.position.count},(_,i)=>vector(g.attributes.position,i).dot(normal));
        return [Math.min(...values),Math.max(...values)];
      }).sort((a,b)=>a[0]-b[0]);
      for(let i=1;i<intervals.length;i++)assert(intervals[i][0]<=intervals[i-1][1]+.0001,'lug layers cannot separate');
    }
    // Independent owner packets: the old lug caps and ERA faces stood in air.
    for(const [x,y,z] of [[1.06295,.04747,1.72907],[-1.19291,.04747,1.72907],[1.06243,.17,1.03562],[-1.06243,.17,1.03562]]){
      assert(!ray(shell,new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,-1)), 'old selected point is not an actual mounting surface');
    }
    const turret=tank.root.getObjectByName('rig_turret'),hull=tank.root.getObjectByName('rig_hull');
    const samples=[...lugs.map(g=>({mesh:turret.getObjectByName('turret'),point:vector(g.attributes.position,0)})),
      ...feet.map(g=>({mesh:turret.getObjectByName('turretEquipment'),point:vector(g.attributes.position,0)})),
      ...layers.map(g=>({mesh:turret.getObjectByName('turretExternalArmor'),point:vector(g.attributes.position,0)}))];
    for(const sample of samples)assert(hasVertex(sample.mesh,sample.point),'audited stock actually survives the production merge');
    tank.root.updateMatrixWorld(true);const deck=hull.getWorldPosition(new THREE.Vector3());
    for(const degrees of [-180,-84,0,84,180]){
      turret.rotation.y=THREE.MathUtils.degToRad(degrees);tank.root.updateMatrixWorld(true);
      for(const {mesh,point} of samples)assert(mesh.localToWorld(point.clone()).distanceTo(turret.localToWorld(point.clone()))<1e-6,'all seats and fittings follow the turret');
      assert(hull.getWorldPosition(new THREE.Vector3()).distanceTo(deck)<1e-6,'hull stays fixed');
    }
    const era=turret.getObjectByName('turretExternalArmor'),original=era.geometry.attributes.position.array.slice();
    for(const name of ['sheridan_turret_era_L','sheridan_turret_era_R'])assert.equal(tank.stripEra(name),true);
    assert.notDeepEqual(era.geometry.attributes.position.array,original,'both lower banks remain damageable');
    assert.equal(tank.resetEra(),true);assert.deepEqual(era.geometry.attributes.position.array,original,'reset restores the fitted ERA stock');
  }finally{
    tank.dispose();for(const g of [casting,...feet,...layers,...lugs])g.dispose();material.dispose();
  }
}
console.log('sheridanTtsAttachmentSeats: actual lug/ERA contact, retained stock, HIGH/LOW traverse, damage and reset pass');
