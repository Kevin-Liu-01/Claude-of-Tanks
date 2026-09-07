import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {registerProfiledBuilders} from '../tankFactoryCore.ts';
import {buildT62MV1X} from './t62mv1X.ts';
import {addT62MV1Sight} from './t62mv1XSight.ts';

const PIVOT=new THREE.Vector3(0,1.446436,.3041853764);
// Captured before this additive correction, independently by the integration
// owner. Complete scene attributes/indices/instances/materials/owner/matrices.
const BEFORE={high:'46684fd38ea137178bbebf99c6c7462d961a736c03d97e125d8db1c387c6dfaa',
  low:'132b40af4b37ded9c371bff3fb7f9bae5566032a68610d743bf6c3607daae6c4'};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} versus source ${b} ±${t}`);
const bufferHash=a=>createHash('sha256').update(Buffer.from(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const ray=(meshes,p,d,far=5)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(meshes,false)[0];
function physical(root){const meshes=[];root.traverse(m=>{if(m.isMesh&&!m.userData.shadowOnly&&!m.userData.vehicleMarking)meshes.push(m);});return meshes;}

function geometryBytes(hash,g){
  for(const k of Object.keys(g.attributes).sort())hash.update(k).update(bufferHash(g.attributes[k].array));
  if(g.index)hash.update(bufferHash(g.index.array));
}
function sceneHash(root){
  const meshes=[],nodes=[];
  root.traverse(o=>{
    nodes.push({name:o.name,parent:o.parent?.name??null,type:o.type,visible:o.visible,matrix:o.matrixWorld.toArray()});
    if(!o.isMesh)return;
    meshes.push({name:o.name,parent:o.parent?.name??null,matrix:o.matrixWorld.toArray(),
      materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.name),
      attributes:Object.fromEntries(Object.entries(o.geometry.attributes).map(([name,a])=>[name,{count:a.count,itemSize:a.itemSize,hash:bufferHash(a.array)}])),
      index:o.geometry.index?bufferHash(o.geometry.index.array):null,
      instances:o.isInstancedMesh?bufferHash(o.instanceMatrix.array):null});
  });
  return createHash('sha256').update(JSON.stringify({meshes,nodes})).digest('hex');
}
function build(quality,omit){
  const hash=createHash('sha256');let count=0;
  const hooks=['add','addEquipment','addExternalArmor','addCupola','addMudguard','addModuleVisual'];
  registerProfiledBuilders({t62mv1_x:p=>buildT62MV1X(new Proxy(p,{get(target,key){
    if(!hooks.includes(key))return Reflect.get(target,key);
    return(...args)=>{
      const g=args.find(a=>a?.isBufferGeometry),marker=g?.userData.t62mv1Sight;
      if(marker){
        assert.equal(key,'addModuleVisual');assert.equal(args[0],'optics');
        assert.ok(['housing','windowFace'].includes(marker));count++;
        if(omit){g.dispose();return;}
      }else{
        hash.update(String(key)).update(JSON.stringify(args.map(a=>a===g?'geometry':a)));
        if(g)geometryBytes(hash,g);
      }
      return target[key](...args);
    };
  }}))});
  try{
    const tank=createTank('t62mv1_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    tank.root.updateMatrixWorld(true);return{tank,count,emissionHash:hash.digest('hex')};
  }finally{registerProfiledBuilders({t62mv1_x:buildT62MV1X});}
}
function fixture(){
  const parts=[],material=new THREE.MeshBasicMaterial();
  addT62MV1Sight({addModuleVisual(module,bucket,g,x,y,z){
    assert.equal(module,'optics');const m=new THREE.Mesh(g,material);
    m.position.set(x,y,z).add(PIVOT);m.name=g.userData.t62mv1Sight;m.updateMatrixWorld(true);parts.push(m);
  }});
  return{parts,dispose(){for(const m of parts)m.geometry.dispose();material.dispose();}};
}
function sourceSurfaces(meshes){
  for(const x of [.25,.32,.40])for(const z of [.50,.52]){
    const h=ray(meshes,[x,2.3,z],[0,-1,0]);near(h?.point.y,2.15799975,.000002,'actual source flat sight roof');
  }
  for(const x of [.25,.32,.40]){
    near(ray(meshes,[x,2.148,.65],[0,0,-1])?.point.z,.53319901,.000002,'source full forward housing plane');
  }
  near(ray(meshes,[.32,2.117,.65],[0,0,-1])?.point.z,.53321901,.000002,'source texture-face only 20 micrometres proud');
  // Independently measured source ramp planes, not candidate extrema.
  for(const[x,z,expected]of [[.40,.45,2.102472246],[.40,.47,2.131317840],[.25,.47,2.131576086]]){
    near(ray(meshes,[x,2.3,z],[0,-1,0])?.point.y,expected,.001,'source inclined rear sight approach');
  }
}
function attachment(tank,own){
  const point=[.32,2.0705,.515],body=own.parts.filter(m=>m.name==='housing');
  const cast=tank.root.getObjectByName('turret');assert.ok(cast?.isMesh);
  for(const meshes of [[cast],body]){
    assert.ok(ray(meshes,[point[0],2.3,point[2]],[0,-1,0])?.point.y>point[1],'positive top around common interior contact');
    // Start below each closed solid: Y1.9 is already inside the cast turret
    // and a front-sided ray there cannot witness its lower entry surface.
    const bounds=meshes.reduce((b,m)=>b.union(new THREE.Box3().setFromObject(m)),new THREE.Box3());
    assert.ok(bounds.min.y>1,'the upward origin is outside and below the actual solid');
    assert.ok(ray(meshes,[point[0],1,point[2]],[0,1,0])?.point.y<point[1],'positive bottom around common interior contact');
  }
  const all=physical(tank.root);
  for(const x of [.21,.43])assert.ok(ray(all,[x,2.3,.515],[0,-1,0])?.point.y<2.10,'no widened stock outside source sides');
}
function semantics(tank){
  const parts=tank.root.userData.combatGeometryParts,optics=parts.filter(p=>p.module==='optics');
  assert.equal(optics.length,2);assert.ok(optics.every(p=>p.parent==='turretG'));
  assert.deepEqual(optics.map(p=>p.bucket).sort(),['turretDark','turretDetail']);
  const lamps=parts.filter(p=>p.parent==='turretG'&&p.min[2]+PIVOT.z>1.05&&p.min[0]<-.2&&p.max[1]+PIVOT.y>2.20);
  assert.ok(lamps.length>0,'existing round searchlight witness is present');
  assert.ok(lamps.every(p=>p.module===null),'neither searchlight nor its support is reclassified as optics');
}
function ownership(tank){
  const turret=tank.root.getObjectByName('rig_turret'),gun=tank.root.getObjectByName('rig_gun');
  const all=physical(tank.root),source=new THREE.Vector3(.32,2.148,.53319901);
  for(const[yaw,pitch]of [[.7,.19],[-1.1,-.08]]){
    turret.rotation.y=yaw;gun.rotation.x=pitch;tank.root.updateMatrixWorld(true);
    const at=source.clone().sub(PIVOT).applyMatrix4(turret.matrixWorld);
    const outward=new THREE.Vector3(0,0,1).transformDirection(turret.matrixWorld);
    const h=ray(all,at.clone().addScaledVector(outward,.03).toArray(),outward.clone().negate().toArray(),.08);
    near(h?.point.distanceTo(at),0,.000002,'sight follows turret yaw, never gun pitch');
  }
}
const own=fixture();
try{
  sourceSurfaces(own.parts);
  for(const quality of ['high','low']){
    const before=build(quality,true),after=build(quality,false);
    try{
      assert.equal(before.count,2);assert.equal(after.count,2);
      assert.equal(sceneHash(before.tank.root),BEFORE[quality],'entire original rendered scene matches immutable pre-addition capture');
      assert.equal(after.emissionHash,before.emissionHash,'every old primitive and exact emit call remains unchanged');
      sourceSurfaces(physical(after.tank.root));attachment(after.tank,own);semantics(after.tank);ownership(after.tank);
      console.log(`t62mv1XSight: ${quality} source planes/contact/air/yaw, two optics parts and complete original additive preservation PASS`);
    }finally{before.tank.dispose();after.tank.dispose();}
  }
}finally{own.dispose();}
