import assert from 'node:assert/strict';
import * as T from 'three';
import {createTank} from './tankFactory.ts';
import {registerProfiledBuilders} from './tankFactoryCore.ts';
import {buildAbramsX,ABRAMS_SOURCE_X_FRAME as FRAME} from './profiles/abramsSourceX.ts';
import {ABRAMS_SOURCE_X_IDS} from './abramsSourceXSpecs.ts';
import {KIT} from './profiles/kit.ts';

// Independent full143-owner OBJ rays, source SHA85c33cee…, unchanged frame.
// .qa-dev/reports/abrams-user-surface-r5-CN8qH3/source.json retains all hits.
// Left body/cover differs by3.5mm from the retained shared roof datum;
// positive-X raised service covers remain their own separate equipment.
const SOURCE_LEFT=[[-3.3,1.7008664095973516],[-2.988,1.7006656160587232],[-2.5,1.7003515543700995]];
const material=new T.MeshBasicMaterial({side:T.FrontSide});
const ray=(targets,p,d,far)=>new T.Raycaster(new T.Vector3(...p),new T.Vector3(...d),0,far).intersectObjects(targets,false);
const near=(a,b,epsilon,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<epsilon,`${label}: ${a} vs ${b}`);
let builds=0,poses=0,contacts=0,air=0;
for(const quality of['high','low'])for(const id of ABRAMS_SOURCE_X_IDS){
 const hull=[],turret=[],brackets=[];
 registerProfiledBuilders({[id]:P=>buildAbramsX(new Proxy(P,{get(target,key){
  if(key!=='add'&&key!=='addEquipment')return Reflect.get(target,key);
  return(bucket,g,...args)=>{
   const tag=g.userData.abramsAratBracketRoot;
   if((key==='add'&&['hull','turret'].includes(bucket))||tag){
    const geometry=KIT.xform(g.clone(),...args);
    if(bucket==='turret')geometry.translate(...FRAME.turret);
    const m=new T.Mesh(geometry,material);m.name=g.name;m.updateMatrixWorld(true);
    if(tag){assert.equal(key,'addEquipment');assert.equal(bucket,'turret');brackets.push({mesh:m,...tag});}
    else(bucket==='hull'?hull:turret).push(m);
   }
   return target[key](bucket,g,...args);
  };
 }}))});
 let tank;
 try{
  tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242,batchStatic:false});
  const urban=id==='m1a2_tusk_x'||id==='m1a2_sepv2_x';
  assert.equal(brackets.length,urban?42:0,'all rear/fore bilateral bracket roots, no additions to other variants');
  for(const side of[-1,1])for(const x of[1.12,1.35,1.55])for(const[z,leftY]of SOURCE_LEFT){
   const h=ray(hull,[side*x,1.73,z],[0,-1,0],.08)[0];assert.ok(h,'actual rear shoulder is closed');
   near(h.point.y,1.697365,.000002,'same flat structural roof across full shoulder');
   if(side<0)near(h.point.y,leftY,.005,'independent original source left surface');
   assert.ok(h.face.normal.y>.999,'no diagonal inward trough');
  }
  for(const side of[-1,1]){
   assert.equal(ray(hull,[side*1.35,1.25,-2.99],[side,0,0],.25).length,0,'under-shoulder space remains empty');
   air++;
  }
  assert.equal(ray(hull,[0,1.4,-2.99],[0,1,0],.20).length,0,'no hull-wide engine-well filler');
  for(const b of brackets){
   const side=b.side,outer=b.centerX+side*b.width/2;
   // Five independent finite contact witnesses cover the whole thin root,
   // including its different upper/lower intersection on the raked armor.
   for(const[dy,dz]of[[0,0],[-.011,-.024],[-.011,.024],[.011,-.024],[.011,.024]]){
    const y=b.y+dy,z=b.z+dz;
    const armor=ray(turret,[side*2.4,y,z],[-side,0,0],1.5)[0];assert.ok(armor,'receiving real turret side');
    const inner=ray([b.mesh],[0,y,z],[side,0,0],2.4)[0];assert.ok(inner,'finite inboard bracket stock');
    near(side*(armor.point.x-inner.point.x),.003,.00002,'3mm actual lap with existing turret');
    const tip=ray([b.mesh],[side*2.4,y,z],[-side,0,0],1.5)[0];
    near(tip?.point.x,outer,.000002,'visible original bracket tip retained');contacts++;
   }
   // Tall spaces between the two mounting tabs are not an opaque slab.
   assert.equal(ray([b.mesh],[side*2.2,b.y+.035,b.z],[-side,0,0],.7).length,0,'above bracket remains air');
  }
  tank.root.updateMatrixWorld(true);
  const turretRig=tank.root.getObjectByName('rig_turret'),hullRig=tank.root.getObjectByName('rig_hull');
  assert.ok(turretRig&&hullRig);const physical=[];
  tank.root.traverse(o=>{if(o.isMesh&&!o.userData.shadowOnly&&!/marking|shadow/i.test(o.name))physical.push(o);});
  for(const yaw of[0,.73,-1.2]){
   turretRig.rotation.y=yaw;tank.root.updateMatrixWorld(true);
   for(const b of brackets){
    const p=new T.Vector3(b.centerX,b.y+.05,b.z).sub(new T.Vector3(...FRAME.turret)).applyMatrix4(turretRig.matrixWorld);
    const d=new T.Vector3(0,-1,0).transformDirection(turretRig.matrixWorld);
    const h=new T.Raycaster(p,d,0,.10).intersectObjects(physical,false)[0];assert.ok(h,'bracket remains actual stock at rotated turret');
    let owner=h.object;while(owner&&owner!==turretRig)owner=owner.parent;
    assert.equal(owner,turretRig,'support moves rigidly with turret, never hull-owned');
   }
   poses++;
  }
  builds++;
 }finally{
  tank?.dispose();for(const m of[...hull,...turret,...brackets.map(b=>b.mesh)])m.geometry.dispose();
  registerProfiledBuilders({[id]:buildAbramsX});
 }
}
material.dispose();assert.equal(builds,14);assert.equal(poses,42);assert.equal(contacts,840);
console.log(JSON.stringify({pass:true,builds,poses,contacts,underShoulderAir:air,scope:'aft shoulder roofs and42 urban turret ERA bracket roots'}));
