import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {KIT} from './tankFactoryCore.ts';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {createTankState} from '../sim/movement.ts';
import {efficientReturnRoller} from './efficientReturnRoller.ts';
import {normalizeTankAppearance,tagVehicleMaterial} from './appearanceAudit.ts';
import {auditTankWheelQuality} from './wheelQuality.ts';

const BASE={wheelR:.4,wheelW:.3,wheelZs:[-1,0,1],wheelY:.5,xc:1.3,
 sprocket:{z:-2,y:.7,r:.3},idler:{z:2,y:.7,r:.3},trackW:.5,topY:1,
 rollerR:.095,returnRollerWidthM:.16,returnRollerInsetM:.18,
 rollers:[{z:-.8,y:.86,r:.095},{z:.8,y:.86,r:.095}]};
const bytes=a=>Buffer.from(a.buffer,a.byteOffset,a.byteLength);
function geometryHash(g){
 const h=createHash('sha256');
 for(const name of Object.keys(g.attributes).sort()){h.update(name);h.update(bytes(g.attributes[name].array));}
 if(g.index)h.update(bytes(g.index.array));h.update(JSON.stringify(g.groups));return h.digest('hex');
}
function snapshot(root,accept=()=>true){
 root.updateMatrixWorld(true);const rows=[];
 root.traverse(o=>{if(!o.geometry||!accept(o))return;
  rows.push({name:o.name,parent:o.parent?.name,geometry:geometryHash(o.geometry),matrix:o.matrix.toArray(),
   material:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({name:m.name,role:m.userData.appearanceRole,color:m.color?.getHex()})),
   instances:o.instanceMatrix?createHash('sha256').update(bytes(o.instanceMatrix.array)).digest('hex'):null,count:o.count});
 });return rows;
}
const nonRoller=o=>!o.name.startsWith('gearReturnRoller');
function fixture(quality,options={}){
 const neutral=tagVehicleMaterial(new T.MeshStandardMaterial({color:0x222322}),'tireRubber','tire-rubber');
 const paint=tagVehicleMaterial(new T.MeshStandardMaterial({color:0x516d34}),'wheelPaint','wheel-paint');
 const material=new T.MeshStandardMaterial();
 const mats=Object.fromEntries(['hull','detail','dark','shadow','trackLink','spareTrack','burnt','trackL','trackR'].map(k=>[k,material]));
 Object.assign(mats,{wheels:paint,wheelsRecessed:paint,rubber:neutral,trackTexL:new T.Texture(),trackTexR:new T.Texture()});
 const P={spec:{id:'t90sm'},disposables:[],mats,hullG:new T.Group(),geometryReceipt:true,q:quality==='high',batchStatic:false,add(){}};
 P.hullG.name='rig_hull';
 try{const gear=KIT.buildRunningGear(P,{...BASE,...options});gear.update(0,0);return{P,gear,dispose};}
 catch(error){dispose();throw error;}
 function dispose(){
  P.hullG.traverse(o=>{if(o.isInstancedMesh)o.dispose();});
  for(const resource of new Set([...P.disposables,material,neutral,paint,mats.trackTexL,mats.trackTexR]))resource.dispose();
 }
}
let phases=0,negativeControls=0;
for(const quality of['high','low']){
 const leaf=efficientReturnRoller({quality,radiusM:.095,axialWidthM:.16,spindleRadiusM:.027,spindleLengthM:.212});
 const before=geometryHash(leaf.rotor),base=fixture(quality),undefinedOption=fixture(quality,{returnRollerGeometry:undefined});
 const candidate=fixture(quality,{returnRollerGeometry:leaf.rotor});
 const im=candidate.P.hullG.getObjectByName('gearReturnRollerRotors'),legacy=base.P.hullG.getObjectByName('gearReturnRollerTires');
 let disposed=0,instanceDisposed=0;leaf.rotor.addEventListener('dispose',()=>disposed++);im.addEventListener('dispose',()=>instanceDisposed++);
 try{
  assert.deepEqual(snapshot(base.P.hullG),snapshot(undefinedOption.P.hullG),'Absent and explicit undefined retain the full original recipe');
  assert.equal(im.geometry,leaf.rotor);assert.equal(geometryHash(im.geometry),before,'Already fitted width is not scaled a second time');
  assert.equal(im.count,4);assert.equal(im.parent,candidate.P.hullG);
  assert.equal(candidate.P.hullG.getObjectByName('gearReturnRollerTires'),undefined);
  assert.equal(candidate.P.hullG.getObjectByName('gearReturnRollerDiscs'),undefined);
  assert.deepEqual(im.material,[candidate.P.mats.rubber,candidate.P.mats.wheels]);
  assert.equal(Object.hasOwn(im.userData,'appearanceRole'),false,'No uniform role may repaint both physical finish groups');
  const originalPaint=candidate.P.mats.wheels.color.getHex();
  for(const f of[base,undefinedOption,candidate])normalizeTankAppearance(f.P.hullG);
  assert.equal(candidate.P.mats.wheels.color.getHex(),originalPaint);assert.notEqual(im.material[0].color.getHex(),im.material[1].color.getHex());
  const rollerIssues=()=>auditTankWheelQuality(candidate.P.hullG).issues.filter(issue=>/return-roller/.test(issue.code));
  assert.deepEqual(rollerIssues(),[],'Actual complete rubber/painted groups qualify even without a second decorative mesh');
  const groups=im.geometry.groups.map(group=>({...group})),materials=im.material;
  const reject=mutate=>{
   mutate();assert.ok(rollerIssues().some(issue=>issue.code==='invalid-composite-return-roller-materials'));
   im.geometry.groups=groups.map(group=>({...group}));im.geometry.setDrawRange(0,Infinity);im.material=materials;
   materials[0].visible=true;materials[0].colorWrite=true;materials[0].opacity=1;
   delete im.userData.appearanceRole;im.count=4;negativeControls++;
  };
  reject(()=>im.geometry.clearGroups());
  reject(()=>im.geometry.groups[1].start-=3);
  reject(()=>im.geometry.groups[1].count-=3);
  reject(()=>im.geometry.groups[0].count=0);
  reject(()=>im.geometry.groups[1].materialIndex=0);
  reject(()=>im.material=[materials[0],materials[0]]);
  reject(()=>im.material=materials[0]);
  reject(()=>im.geometry.setDrawRange(0,0));
  reject(()=>im.material[0].visible=false);
  reject(()=>im.material[0].colorWrite=false);
  reject(()=>im.material[0].opacity=0);
  reject(()=>im.userData.appearanceRole='wheelTire');
  reject(()=>im.count=0);
  assert.deepEqual(rollerIssues(),[],'Restoring real groups restores qualification');
  const oldDish=base.P.hullG.getObjectByName('gearReturnRollerDiscs');oldDish.removeFromParent();
  assert.ok(auditTankWheelQuality(base.P.hullG).issues.some(issue=>issue.code==='single-material-return-rollers'),
   'Legacy one-material missing-dish rejection remains in force');base.P.hullG.add(oldDish);negativeControls++;
  assert.equal(candidate.P.disposables.filter(r=>r===leaf.rotor).length,1,'Core owns the adopted buffer exactly once');
  const actualCost=im.geometry.index.count/3+leaf.spindle.index.count/3;
  assert.equal(actualCost,quality==='high'?160:80);assert.equal(actualCost*im.count,quality==='high'?640:320);
  const state={pos:new T.Vector3(),yaw:0,visualPitch:0,visualRoll:0};
  for(let i=0;i<32;i++){
   for(const f of[base,candidate]){
    f.gear.conform(state,(_x,z)=>Math.abs(z)<.5?-.025:.018,0,0,1/60);
    f.gear.update(.095*i*Math.PI/16,-.095*i*Math.PI/12,1/60);
   }
   assert.deepEqual(Array.from(im.instanceMatrix.array),Array.from(legacy.instanceMatrix.array),'Same native entries drive exact left/right rotation');
   assert.deepEqual(snapshot(base.P.hullG,nonRoller),snapshot(candidate.P.hullG,nonRoller),'No road wheel, course, suspension or other stock changes');phases++;
  }
  assert.notDeepEqual(Array.from(im.instanceMatrix.array.slice(0,16)),Array.from(new T.Matrix4().makeTranslation(-1.12,.86,-.8).elements));
 }finally{candidate.dispose();undefinedOption.dispose();base.dispose();leaf.spindle.dispose();}
 assert.equal(disposed,1);assert.equal(instanceDisposed,1);
}
for(const value of[null,{},true]){assert.throws(()=>fixture('high',{returnRollerGeometry:value}),/return-roller geometry/);negativeControls++;}
{
 const leaf=efficientReturnRoller({quality:'low',radiusM:.09,axialWidthM:.16,spindleRadiusM:.026,spindleLengthM:.2});
 assert.throws(()=>fixture('low',{rollers:[],returnRollerGeometry:leaf.rotor}),/explicit roller stations/);negativeControls++;
 leaf.rotor.dispose();leaf.spindle.dispose();
}

// Real factory lifecycle/material/frame integration, not an activated A6M
// profile or a new claim that its inherited roller station/contact fits.
for(const quality of['high','low']){
 const base=createTank('leo2a6m_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
 const build=KIT.buildRunningGear;let captured,rotor,rotorDisposed=0;
 KIT.buildRunningGear=(P,cfg)=>{
  if(P.spec.id!=='leo2a6m_x')return build(P,cfg);
  const leaf=efficientReturnRoller({quality,radiusM:cfg.rollerR??.09,axialWidthM:cfg.returnRollerWidthM,
   spindleRadiusM:.026,spindleLengthM:.2});
  leaf.spindle.dispose();rotor=leaf.rotor;rotor.addEventListener('dispose',()=>rotorDisposed++);captured=P;
  return build(P,{...cfg,returnRollerGeometry:rotor});
 };
 let tank;
 try{tank=createTank('leo2a6m_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});}
 finally{KIT.buildRunningGear=build;}
 try{
  const im=tank.root.getObjectByName('gearReturnRollerRotors');assert.equal(im.geometry,rotor);assert.equal(im.count,8);
  assert.deepEqual(im.material,[captured.mats.rubber,captured.mats.wheels]);assert.equal(im.parent.name,'rig_hull');
  assert.deepEqual(auditTankWheelQuality(tank.root).issues,[],'Real two-finish factory rotor passes the unchanged wider mechanical checks');
  const state=createTankState(getSpec('leo2a6m_x'),new T.Vector3(),.12);
  for(const distance of[15,75,200]){
   state.trackScroll.l=.37;state.trackScroll.r=-.29;
   for(const t of[base,tank])t.syncFromState(state,1/60,distance);
   const camera=new T.PerspectiveCamera(50,1,.01,1000);camera.position.set(0,0,distance);camera.updateMatrixWorld(true);
   tank.root.traverse(o=>{if(o.isLOD)o.update(camera);});
   for(let o=im;o;o=o.parent)assert.equal(o.visible,true,'Physical rotor does not disappear with decorative LOD');
   assert.deepEqual(snapshot(base.root,nonRoller),snapshot(tank.root,nonRoller));phases++;
  }
 }finally{tank.dispose();assert.equal(rotorDisposed,1);base.dispose();}
}
console.log('returnRollerGeometry:',JSON.stringify({qualities:2,phases,negativeControls,defaultsUnchanged:true,playableOptIns:0}));
