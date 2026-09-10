import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {KIT} from './kit.ts';
import {addT90AWAAReceiver} from './t90AwXAAReceiver.ts';
import {addT90AWOpticalHeads} from './t90AwXOpticalHeads.ts';
import {T90_AW_X_SOURCE_DATUMS} from '../t90AwXArmor.ts';
const packet=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90_x.remaining-roof-heldouts.json',import.meta.url),'utf8'));
const pivot=new THREE.Vector3(...T90_AW_X_SOURCE_DATUMS.turretPivot);
function hit(ms,p,d,far=2){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function inside(mesh,p){
  const direction=new THREE.Vector3(.319,.731,.604).normalize();
  const hits=new THREE.Raycaster(new THREE.Vector3(...p),direction,0,10).intersectObject(mesh,false);
  const unique=hits.filter((h,i)=>!i||Math.abs(h.distance-hits[i-1].distance)>.000002);
  return unique.length%2===1;
}
function closed(g){
  const a=g.getAttribute('position'),index=g.index,edges=new Map();let volume=0;
  const key=i=>[a.getX(i),a.getY(i),a.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
  for(let k=0;k<(index?.count??a.count);k+=3){
    const ids=[0,1,2].map(i=>index?index.getX(k+i):k+i),p=ids.map(i=>new THREE.Vector3().fromBufferAttribute(a,i));
    assert.ok(p.every(p=>p.toArray().every(Number.isFinite)));
    // Three's lathe duplicates the radius-zero pole in each angular sector;
    // those zero-area seam triangles do not contribute a physical edge.
    if(p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).lengthSq()<1e-18)continue;
    volume+=p[0].dot(p[1].clone().cross(p[2]))/6;
    for(let j=0;j<3;j++){const edge=[key(ids[j]),key(ids[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)??0)+1);}
  }
  assert.ok(volume>1e-10,'every new solid has positive outward volume');
  assert.ok([...edges.values()].every(n=>n===2),'every new stock/glazing primitive is closed');
}
function helper(){
  const meshes=[],mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const p={addEquipment(slot,g,x=0,y=0,z=0){assert.ok(['turretDetail','turretDark'].includes(slot));closed(g);
    g.translate(x+pivot.x,y+pivot.y,z+pivot.z);const m=new THREE.Mesh(g,mat);m.updateMatrixWorld();meshes.push(m);}};
  addT90AWAAReceiver(p);addT90AWOpticalHeads(p);return{meshes,mat};
}
function sourceRays(ms,rows,label){
  for(const r of rows){const h=hit(ms,r.origin,r.direction,r.far);
    if(!r.point){assert.equal(h,undefined,`${label} genuine source air: ${r.label}`);continue;}
    assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<.006,`${label} ${r.label}: ${h?.point.toArray()} vs ${r.point}`);
  }
}
assert.equal(packet.receiver.length,118);assert.equal(packet.optics.length,57);
const own=helper();
try{
  // A channel is not an AA weapon: its axis stays open and no fixture is
  // permitted to masquerade as a complete recognized machine gun.
  assert.equal(hit(own.meshes,[-.58615,2.66803,.8],[0,0,-1],.7),undefined);
  assert.equal(hit(own.meshes,[-.42,2.72,.40],[0,-1,0],.10),undefined,'guard and chute open mouth');
  const fork=new THREE.Mesh(KIT.box(.0155,.2163,.263).translate(-.50105,2.59843,.10137),own.mat);fork.updateMatrixWorld();
  const shared=[-.49335,2.65,.137];assert.ok(inside(fork,shared)&&own.meshes.some(m=>inside(m,shared)),'actual receiver positively seats to retained source fork');fork.geometry.dispose();
  for(const p of [[-.66315,2.67533,.20082],[-.5090,2.67533,.20082]])assert.ok(own.meshes.some(m=>inside(m,p)),'transverse pin reaches the actual fork interface');
  for(const p of [[-.45,2.706,.258],[-.45,2.65,.263]])assert.ok(own.meshes.filter(m=>inside(m,p)).length>=2,`actual guard/chute/receiver contact: ${p}`);
  for(const quality of['high','low']){
    const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
    try{
      t.root.updateMatrixWorld(true);const ms=[],weapons=[];
      t.root.traverseVisible(m=>{
        if(m.userData.fitting==='pintleMG'&&m.userData.fittingRoot)weapons.push(m);
        // Source stock/air is unchanged; the newly fitted complete weapon
        // intentionally occupies some former air and has its own seat test.
        let owner=m;while(owner&&owner.name!=='t90XMountedNsvt')owner=owner.parent;
        if(m.isMesh&&!m.userData.shadowOnly&&!owner)ms.push(m);
      });
      assert.equal(weapons.length,1,'one actual complete weapon, not a falsely tagged empty stock');
      assert.equal(weapons[0].name,'t90XMountedNsvt');
      sourceRays(ms,packet.receiver,quality);sourceRays(ms,packet.optics,quality);
      const cast=ms.find(m=>m.name==='turret'),proxy=new THREE.Mesh(cast.geometry,own.mat);proxy.matrixAutoUpdate=false;proxy.matrixWorld.copy(cast.matrixWorld);
      for(const p of [[1.15675,2.02,.41277],[-1.15,2.05,-.098]])assert.ok(inside(proxy,p)&&own.meshes.some(m=>inside(m,p)),`${quality} optical foot seats to actual permanent casting: ${p}`);
      const turret=t.root.getObjectByName('rig_turret');turret.rotation.y=.41;t.root.updateMatrixWorld(true);
      for(const r of[packet.receiver[0],packet.receiver[75],packet.optics[4],packet.optics[40]]){
        const origin=new THREE.Vector3(...r.origin).sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),.41).add(pivot),direction=new THREE.Vector3(...r.direction).applyAxisAngle(new THREE.Vector3(0,1,0),.41),expected=new THREE.Vector3(...r.point).sub(pivot).applyAxisAngle(new THREE.Vector3(0,1,0),.41).add(pivot),h=hit(ms,origin.toArray(),direction.toArray(),r.far);
        assert.ok(h&&h.point.distanceTo(expected)<.006,'actual source equipment follows turret yaw, not hull or main-gun pitch');
      }
    }finally{t.dispose();}
  }
}finally{for(const m of own.meshes)m.geometry.dispose();own.mat.dispose();}
console.log('t90AwXRemainingRoof:175 historical source-stock high/low rays, retained air, closed stock/glazing, fork/casting seats, yaw and separate complete-weapon census pass');
