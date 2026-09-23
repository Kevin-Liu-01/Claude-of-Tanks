import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {ensureInteriorFills} from '../interiorFills.ts';
import {ARIETE_C2_X_DATUMS as D, ARIETE_X_FAMILY_SCALE as S} from './arieteXFamilyFrame.ts';
import {minimumMechanicalGunPitch} from '../../sim/gunPitchLimits.ts';
import {getSpec} from '../specs.ts';
import {createTankState} from '../../sim/movement.ts';
import {enlargeArieteXFamily} from './arieteXFamilyScale.ts';
import {capturePrimaryHull,assertC2PrimaryHullDelta,assertC2ReceivingClearance} from './arieteC2Receiving.test-support.mjs';

const near=(a,b,e,label)=>assert(Number.isFinite(a)&&Math.abs(a-b)<=e,`${label}: ${a} != ${b} ±${e}`);
const hash=a=>createHash('sha256').update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)).digest('hex');
function stock(root){
  const list=[];
  root.traverse(o=>{
    if(!o.isMesh||o.userData.shadowOnly||o.userData.authoredShadowProxy||o.userData.vehicleMarking)return;
    // LOW merges the same decorative muzzle shading meshes under a new name.
    // Keep the existing authored-stock probe invariant across both qualities.
    for(let owner=o;owner;owner=owner.parent)
      if(owner.name.startsWith('muzzleBoreShadowFallback'))return;
    if(o.userData.mobileStaticBatch&&o.userData.coplanarDepthLayer===28)return;
    list.push(o);
  });
  return list;
}

function ray(t,from,dir,owner='hull',targets=stock(t.root),far=10){
  const frame=t.root.getObjectByName(owner==='turret'?'rig_turret':'rig_hull');
  const origin=new T.Vector3(...from).multiplyScalar(S);
  if(owner==='turret')origin.sub(new T.Vector3(...D.turretPivot));
  origin.applyMatrix4(frame.matrixWorld);
  const hit=new T.Raycaster(origin,new T.Vector3(...dir).transformDirection(frame.matrixWorld),0,far*S).intersectObjects(targets,false)[0];
  if(hit){hit.point.applyMatrix4(frame.matrixWorld.clone().invert());if(owner==='turret')hit.point.add(new T.Vector3(...D.turretPivot));hit.point.divideScalar(S);}
  return hit;
}
function footprintAdapter(){
  const hullG=new T.Group(),turretG=new T.Group(),gunG=new T.Group(),recoilG=new T.Group();
  let updateArgs,surfaceArgs,conformFrame,sampled;
  const gear={update:(...a)=>{updateArgs=a;},updateSurface:(...a)=>{surfaceArgs=a;},
    conform:(frame,sampler,pitch,roll,dt)=>{conformFrame={pos:{...frame.pos},yaw:frame.yaw,pitch,roll,dt};sampled=sampler(frame.pos.x+1.18,frame.pos.z+2.02);return true;}};
  const P={hullG,turretG,gunG,recoilG,gear,muzzleZ:5,topY:2,scaleAllBuckets(){},scaleDecals(){}};
  enlargeArieteXFamily(P);
  const state={pos:{x:10*S,y:2*S,z:20*S},yaw:.3,visualPitch:.1,visualRoll:.2},before=structuredClone(state);let sampledAt;
  assert(gear.conform(state,(x,z)=>{sampledAt=[x,z];return 3*S;},.15,.25,1/60));
  assert.deepEqual(state,before,'adapter does not mutate authoritative tank state');
  for(const [key,value] of Object.entries({x:10,y:2,z:20}))near(conformFrame.pos[key],value,1e-12,'source state '+key);
  assert.deepEqual({...conformFrame,pos:null},{pos:null,yaw:.3,pitch:.15,roll:.25,dt:1/60});
  near(sampledAt[0],(10+1.18)*S,1e-12,'expanded physical footprint X');
  near(sampledAt[1],(20+2.02)*S,1e-12,'expanded physical footprint Z');near(sampled,3,1e-12,'terrain height source conversion');
  gear.update(2*S,3*S,.02);gear.updateSurface(2*S,3*S);
  near(updateArgs[0],2,1e-12,'source wheel scroll');near(updateArgs[1],3,1e-12,'source right scroll');
  near(surfaceArgs[0],2,1e-12,'source surface left');near(surfaceArgs[1],3,1e-12,'source surface right');
}
function samePrimary(c1,c2){
  for(const name of ['turret','gunMount']){
    const a=c1.root.getObjectByName(name),b=c2.root.getObjectByName(name);
    assert(a&&b,`retained ${name}`);
    for(const key of ['position','normal'])assert.equal(hash(a.geometry.attributes[key]),hash(b.geometry.attributes[key]),`${name} ${key} retained`);
    assert.equal(a.geometry.index?hash(a.geometry.index):null,b.geometry.index?hash(b.geometry.index):null,`${name} topology retained`);
    assert.deepEqual(a.matrixWorld.toArray(),b.matrixWorld.toArray(),`${name} placement retained`);
  }
}
function outwardWheels(t) {
  for(const side of [-1,1]) {
    const geometry=t.root.getObjectByName(`arieteSuppliedRecessedWheelFace${side}`).geometry;
    const p=geometry.attributes.position,index=geometry.index;
    const v=i=>new T.Vector3().fromBufferAttribute(p,index?index.getX(i):i);
    let volume=0;
    for(let i=0;i<(index?.count??p.count);i+=3)volume+=v(i).dot(v(i+1).cross(v(i+2)))/6;
    assert(volume>0,'closed recessed wheel stock has outward winding');
  }
}
function reactiveCassettes(t) {
  const rows=t.root.userData.eraVisualBindingReceipt.plates.filter(p=>p.name.startsWith('c2_'));
  assert.equal(rows.length,20);
  assert(rows.every(p=>p.registered&&p.ownerMatches&&p.partCount>0&&p.fittedSurfaces.length>0));
  const digest=()=>stock(t.root).map(m=>hash(m.geometry.attributes.position)).join(':');
  const before=digest();
  for(const row of rows)assert.equal(t.stripEra(row.name),true,'each actual cassette can be removed');
  assert.notEqual(digest(),before,'spent ERA removes real geometry');
  const spent=digest();for(const row of rows)t.stripEra(row.name);
  assert.equal(digest(),spent,'spending is idempotent');
  t.resetEra();assert.equal(digest(),before,'reset restores the exact original ERA stock');
}
function gear(t){
  const road=t.root.getObjectByName('gearRoadWheelDiscs'),rollers=t.root.getObjectByName('gearReturnRollerTires'),m=new T.Matrix4(),p=new T.Vector3();
  assert.equal(road.count,14);assert.equal(rollers.count,8);
  const stations=[-2.055227,-1.376039,-.696431,-.016822,.662787,1.342395,2.021583];
  for(let i=0;i<road.count;i++){
    road.getMatrixAt(i,m);p.setFromMatrixPosition(m).applyMatrix4(road.matrixWorld);
    near(Math.min(...stations.map(z=>Math.abs(z*S-p.z))),0,2e-6,'retained seven axle stations');
    near(p.y,D.wheelY,2e-6,'true loaded wheel height');near(Math.abs(p.x),D.wheelX,2e-6,'retained gauge');
  }
  const receipt=t.root.getObjectByName('rig_hull').userData.runningGearReceipts.at(-1);
  near(receipt.trackW*S,D.trackWidthM,1e-9,'wider actual track stock');
  assert.equal(receipt.trackPatternId,'franco-italian-modular');
}
function opticsAndSeats(t,all=stock(t.root)){
  const detail=all.filter(o=>o.name==='turretDetail'),primary=all.filter(o=>o.name==='turret');
  for(const [x,y,z,face]of[[-.807,2.019,1,.608],[-.541,2.019,1,.608],[.790,2.367,1,.6085]]){
    const hit=ray(t,[x,y,z],[0,0,-1],'turret',all);
    assert.equal(hit?.object.name,'turretGlass','actual exposed sight first hit');near(hit.point.z,face,2e-5,'finite optical surface');
  }
  for(const [x,z,bottom]of[[.790,.430,2.023],[-.81,.720,1.877]]){
    const roof=ray(t,[x,2.2,z],[0,-1,0],'turret',primary)?.point.y;
    const lower=ray(t,[x,1.8,z],[0,1,0],'turret',detail)?.point.y;
    near(lower,bottom,2e-5,'actual fitting underside');assert(roof>=lower&&roof-lower<.04,'foot embeds in actual roof');
  }
  const mg=t.root.getObjectByName('arieteC2CommanderK2');assert(mg&&mg.parent.name==='rig_turret');
  assert(mg.position.distanceTo(new T.Vector3(.830*S,2.092*S-D.turretPivot[1],-.340*S-D.turretPivot[2]))<1e-10,'compact K2 roof fitting exact seated foot');
  assert(!t.root.getObjectByName('rig_auxiliaryMuzzle'),'decorative fitting has no playable muzzle');
  assert.equal(t.root.userData.combatGeometryParts.filter(p=>p.module==='optics').length,19,'three modern surfaces plus16 retained hatch prisms');
  const panel=ray(t,[1.9,1.1,-1.70],[-1,0,0],'hull',all);assert.equal(panel?.object.name,'hullExternalArmor');near(panel.point.x,1.805,1e-5,'finite PSO face');
  assert(!ray(t,[1.9,1.1,-1.88],[-1,0,0],'hull',all.filter(o=>o.name==='hullExternalArmor'),.09),'real panel gap remains air');
  const belly=ray(t,[0,0,-1],[0,1,0],'hull',all);near(belly?.point.y,.366,1e-5,'finite mine plate');
  const cooling=ray(t,[.02,1.49,-2.430],[0,1,0],'hull',all.filter(o=>o.name==='hullDetail'));near(cooling?.point.y,1.496,2e-5,'new fan plate meets source deck');
}
function bore(t,complete=false){
  // Until 2026-09-22 this witness walked the physical 120 mm bore: radial rays .01/.10/.70 m behind
  // the muzzle met the inner wall at .060*cos(pi/48)/cos(.025-pi/48) and the axial ray met the
  // gunDark stock at the original long blind floor, .01+D.muzzleZ-D.boreFloorZ from its start. Owner
  // 2026-09-22 ("the point of adding holes instead of carving them into the barrel is that we save
  // on triangles"): the tube is closed at the source tip because the fleet lining hid that recess
  // entirely, so the witness now proves the closed painted tip on every pose, across the former
  // aperture; the bore measurement stays recorded here. The hidden-MRS-intrusion negative that
  // relied on the inner-wall rays retired with them: an intrusion inside closed metal is invisible.
  const gun=t.root.getObjectByName('rig_gun'),targets=complete?stock(t.root):stock(gun);
  const pose=`yaw${t.root.getObjectByName('rig_turret').rotation.y} pitch${gun.rotation.x} recoil${t.root.getObjectByName('rig_recoil').position.z}`;
  for(const [x,y] of [[.0015,0],[.05,0],[-.05,0],[0,.05],[0,-.05]]){
    const start=gun.localToWorld(new T.Vector3(x,y,D.muzzleZ-D.trunnion[2]+.01));
    const hit=new T.Raycaster(start,new T.Vector3(0,0,-1).transformDirection(gun.matrixWorld),0,3).intersectObjects(targets,false)[0];
    assert.equal(hit?.object.name,'gun',`closed painted tip at ${x}/${y}, ${pose}, hit${hit?.point.toArray()}`);
    near(hit.distance,.01,2e-5,`metal tube closed at the source tip across the former 120 mm aperture (recorded blind floor D.boreFloorZ ${D.boreFloorZ})`);
  }
}
function census(t){let triangles=0,draws=0;const resources=new Set();t.root.traverse(o=>{if(!o.isMesh)return;resources.add(o.geometry.uuid);let visible=true;for(let p=o;p;p=p.parent)visible&&=p.visible;
  if(visible&&!o.userData.shadowOnly&&!o.userData.authoredShadowProxy&&!o.name.startsWith('procShadow_')){const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.some(m=>m.colorWrite)){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);draws++;}}});return{triangles,draws,resources:[...resources].sort()};}

function visibleStock(root){return stock(root).filter(o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;});}
function visibleFamilySeats(t,id){
  const all=visibleStock(t.root),detail=all.filter(o=>o.name==='turretDetail');
  for(const [from,dir,owner,name]of[
    [[1.9,.83,1.5],[-1,0,0],'hull','hullExternalArmor'],
    [[1.7,1.6,.35],[-1,0,0],'turret','turretExternalArmor'],
    [[-.247,2.4,-.133],[0,-1,0],'turret','turretDetail'],
    [[.88736,2.9,-.7],[0,0,-1],'turret','turretDark'],
  ])assert.equal(ray(t,from,dir,owner,all)?.object.name,name,`visible physical ${name} first hit`);
  const gun=stock(t.root.getObjectByName('arieteLoaderGpmg')).filter(o=>all.includes(o));
  const from=[-.70,2.3395,-.038];
  assert(ray(t,from,[-1,0,0],'turret',gun,.2),'visible loader MG spindle at bearing bridge height');
  const foot=ray(t,from,[-1,0,0],'turret',detail,.2);
  near(foot?.point.x,-.802,2e-5,'visible load-bearing bridge meets loader gun spindle');
  if(id==='ariete_c2_x')opticsAndSeats(t,all);
}
function lodPresentation(t,id,quality){
  const camera=new T.OrthographicCamera(-5,5,5,-5,.1,1000),state=createTankState(getSpec(id),new T.Vector3(),0);
  const saved=[];t.root.traverse(o=>saved.push([o,o.visible]));const before=census(t),rows=[];
  try{
    for(const distance of [5,60,100,200]){
      t.syncFromState(state,0,distance);t.root.updateMatrixWorld(true);
      camera.position.set(0,3,distance);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
      t.root.traverse(o=>{if(o.isLOD)o.update(camera);});
      const all=new Set(visibleStock(t.root));
      for(const name of ['hullDetail','hullExternalArmor','hullDark','hullGlass','turretDetail','turretExternalArmor','turretDark','turretGlass']){
        const mesh=t.root.getObjectByName(name);assert(all.has(mesh),`${id} ${quality} ${distance}m actual visible permanent ${name}`);
        assert(!mesh.parent.isLOD,`${name} must not remain attached to an empty distance level`);
      }
      visibleFamilySeats(t,id);
      const c=census(t);assert(c.triangles<=before.triangles,'far presentation stays within frozen near budget');
      rows.push({id,quality,distance,triangles:c.triangles,draws:c.draws});
    }
    const detail=t.root.getObjectByName('turretDetail');detail.visible=false;
    assert.throws(()=>visibleFamilySeats(t,id),undefined,'hidden hatch/support must fail real visible-ray proof');detail.visible=true;
    const armor=t.root.getObjectByName('hullExternalArmor');armor.visible=false;
    assert.throws(()=>visibleFamilySeats(t,id),undefined,'hidden permanent skirt must fail real visible-ray proof');armor.visible=true;
  }finally{
    t.syncFromState(state,0,0);t.root.updateMatrixWorld(true);
    for(const[o,visible]of saved)o.visible=visible;
  }
  assert.deepEqual(census(t),before,'distance updates create no resources or change restored near budget');return rows;
}


function commanderFittingCrossings(t){
  const group=t.root.getObjectByName('arieteC2CommanderK2'),parts=stock(group),bounds=new T.Box3().setFromObject(group);
  const targets=stock(t.root).filter(o=>!parts.includes(o)&&new T.Box3().setFromObject(o).intersectsBox(bounds));
  const rays=[];
  for(const mesh of parts){
    const a=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let i=0;i<(index?.count??a.count);i+=3){
      const points=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(a,index?index.getX(i+j):i+j));
      // Exclude only the low mating foot: its intended stock overlap is
      // covered by opticsAndSeats. Keep complete receiver, shields and tube.
      if(!points.every(p=>group.worldToLocal(mesh.localToWorld(p.clone())).y>.028))continue;
      for(let j=0;j<3;j++){
        const from=mesh.localToWorld(points[j].clone()),to=mesh.localToWorld(points[(j+1)%3].clone()),delta=to.sub(from),length=delta.length();
        if(length>2e-7)rays.push(new T.Raycaster(from,delta.normalize(),1e-7,length-1e-7));
      }
    }
  }
  assert(rays.length>150,'actual whole commander fitting edge census');
  for(const ray of rays){const hit=ray.intersectObjects(targets,false)[0];if(hit)return{owner:hit.object.name,point:hit.point.toArray()};}
  return null;
}
function commanderClearance(t){
  const gun=t.root.getObjectByName('arieteC2CommanderK2'),turret=t.root.getObjectByName('rig_turret');
  const before=gun.position.clone(),rest=gun.rotation.clone();
  for(const yaw of [0,.7,Math.PI]){
    turret.rotation.y=yaw;t.root.updateMatrixWorld(true);
    assert.equal(commanderFittingCrossings(t),null,'decorative receiver and barrel clear nearby actual stock');
    assert(gun.rotation.equals(rest),'decorative fitting has no independent aiming');
  }
  turret.rotation.y=0;gun.position.z=.430*S-D.turretPivot[2];t.root.updateMatrixWorld(true);
  assert(commanderFittingCrossings(t),'moving roof fitting into panoramic sight must detect collision');
  gun.position.copy(before);t.root.updateMatrixWorld(true);
}

function commanderDonor(t,options){
  const donor=createTank('k2_x',null,options);
  try{
    const actual=t.root.getObjectByName('arieteC2CommanderK2');
    const original=donor.root.getObjectByName('fitting_browningDerived_m2');
    assert(actual&&original,'both actual K2-style fittings exist');
    near(actual.scale.x,.70,1e-12,'installed roof fitting is 70% donor size');
    for(const mesh of stock(original)){
      const counterpart=actual.getObjectByName(mesh.name);
      assert(counterpart,`same K2 fitting component ${mesh.name}`);
      assert.equal(hash(counterpart.geometry.attributes.position),hash(mesh.geometry.attributes.position),
        'exact K2 receiver, connected barrel, mount and ammunition housing');
    }
    assert(getSpec('ariete_c2_x').gun.shells.every(s=>s.caliberMm===120),
      'decorative roof fitting cannot be selected as a playable weapon');
  }finally{donor.dispose();}
}

function poses(t){
  const yaw=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun'),recoil=t.root.getObjectByName('rig_recoil'),before=census(t);
  for(const angle of [0,Math.PI/2,Math.PI])for(const pitch of [-9,0,20]){
    yaw.rotation.y=angle;gun.rotation.x=-Math.max(pitch*Math.PI/180,minimumMechanicalGunPitch(getSpec('ariete_c2_x'),angle));t.root.updateMatrixWorld(true);opticsAndSeats(t);bore(t,true);
    const muzzle=t.gunMuzzleWorld(new T.Vector3());recoil.position.z=-.12;t.root.updateMatrixWorld(true);
    near(t.gunMuzzleWorld(new T.Vector3()).distanceTo(muzzle),.12,2e-6,'cannon recoils as complete stock');recoil.position.z=0;
  }
  yaw.rotation.y=0;gun.rotation.x=0;t.root.updateMatrixWorld(true);assert.deepEqual(census(t),before,'poses create no new geometry/resources');
}
function negatives(t){
  const glass=t.root.getObjectByName('turretGlass'),detail=t.root.getObjectByName('turretDetail'),mg=t.root.getObjectByName('arieteC2CommanderK2');
  for(const object of [glass,detail,mg]){object.position.x+=.70;t.root.updateMatrixWorld(true);assert.throws(()=>opticsAndSeats(t),undefined,`moved ${object.name} must fail actual stock proof`);object.position.x-=.70;t.root.updateMatrixWorld(true);}
}
const BARREL_STATIONS=[[1.95976235,.12248],[2.53507449,.12248],[2.71507,.09590],
  [3.23571,.09590],[3.23571,.11650],[3.73028,.11650],[3.73028,.09590],
  [3.84046,.08520],[4.16597,.08466],[4.17774,.09590],[4.23998,.09590],
  [4.28288,.07910],[4.87754,.06980],[5.028094113,.06980]];
function physicalBarrelRadius(z,factor=1){
  for(let i=1;i<BARREL_STATIONS.length;i++){
    const [a,ra]=BARREL_STATIONS[i-1],[b,rb]=BARREL_STATIONS[i];
    if(b>a&&z>=a&&z<=b)return(ra+(rb-ra)*(z-a)/(b-a))*S*factor*Math.cos(Math.PI/48);
  }
  return 0;
}
function barrelHullHits(t,targets){
  const gun=t.root.getObjectByName('rig_gun'),modern=!!t.root.getObjectByName('arieteC2CommanderK2'),stretch=modern?1.22:1,radial=modern?1.18:1,mouth=getSpec(modern?'ariete_c2_x':'ariete_c1_x').armor.gunBarrel.lengthM,length=(5.028094113-1.95976235)*S*stretch;
  const direction=new T.Vector3(0,0,-1).transformDirection(gun.matrixWorld);
  for(const radius of [.061,.071,.091,.111,.131])for(let i=0;i<12;i++){
    const angle=(i+.2)*Math.PI/6,origin=gun.localToWorld(new T.Vector3(Math.cos(angle)*radius,Math.sin(angle)*radius,mouth-.001));
    const hits=new T.Raycaster(origin,direction,0,length-.002).intersectObjects(targets,false);
    const hit=hits.find(h=>radius<=physicalBarrelRadius(5.028094113-(h.distance+.001)/(S*stretch),radial));
    if(hit)return{mesh:hit.object.name,radius,distanceBehindMuzzle:hit.distance+.001,world:hit.point.toArray()};
  }
  return null;
}
function mechanicalClearance(t,id){
  const yaw=t.root.getObjectByName('rig_turret'),gun=t.root.getObjectByName('rig_gun'),targets=stock(t.root.getObjectByName('rig_hull'));
  let poses=0;
  for(let degrees=-180;degrees<=180;degrees+=5){
    yaw.rotation.y=degrees*Math.PI/180;
    const low=minimumMechanicalGunPitch(getSpec(id),yaw.rotation.y);
    for(const pitch of new Set([low,Math.max(low,0),20*Math.PI/180])){
      gun.rotation.x=-pitch;t.root.updateMatrixWorld(true);const hit=barrelHullHits(t,targets);
      assert.equal(hit,null,`${id} actual finite barrel/hull overlap at yaw${degrees},pitch${pitch*180/Math.PI}: ${JSON.stringify(hit)}`);poses++;
    }
  }
  // Disabling the declaration/reusing the old rear depression must fail on
  // actual retained hull stock within the real barrel interval.
  yaw.rotation.y=Math.PI;gun.rotation.x=9*Math.PI/180;t.root.updateMatrixWorld(true);
  assert(barrelHullHits(t,targets),'old rear depression must detect real tube/hull intersection');
  yaw.rotation.y=0;gun.rotation.x=0;t.root.updateMatrixWorld(true);return poses;
}

footprintAdapter();
if(process.argv.includes('--filled'))await ensureInteriorFills(['ariete_c1_x','ariete_c2_x']);
const costs=[],lodCosts=[];let clearancePoses=0;
for(const quality of ['high','low']){
  const opts={quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false,camoSeed:4242};
  const first=capturePrimaryHull(createTank,'ariete_c1_x',opts),second=capturePrimaryHull(createTank,'ariete_c2_x',opts),c1=first.tank,c2=second.tank;
  commanderDonor(c2,opts);
  try{c1.root.updateMatrixWorld(true);c2.root.updateMatrixWorld(true);samePrimary(c1,c2);outwardWheels(c1);outwardWheels(c2);reactiveCassettes(c2);assertC2PrimaryHullDelta(first.stocks,second.stocks);assertC2ReceivingClearance(c2,first.stocks,second.stocks);clearancePoses+=mechanicalClearance(c1,'ariete_c1_x');clearancePoses+=mechanicalClearance(c2,'ariete_c2_x');gear(c2);bore(c2,true);poses(c2);negatives(c2);commanderClearance(c2);lodCosts.push(...lodPresentation(c1,'ariete_c1_x',quality),...lodPresentation(c2,'ariete_c2_x',quality));
    const c=census(c2);assert(c.triangles<=100000,'C2 frozen whole-model HIGH ceiling');assert(c.draws<=65,'merged MBT batches');costs.push({quality,triangles:c.triangles,draws:c.draws});
  }finally{c1.dispose();c2.dispose();first.stocks.forEach(g=>g.dispose());second.stocks.forEach(g=>g.dispose());}
}
assert(costs[1].triangles<=costs[0].triangles*.75,'C2 LOW <=75% HIGH');
console.log(JSON.stringify({filled:process.argv.includes('--filled'),costs,poses:18,clearancePoses,lodCosts,negativeControls:26}));
console.log('arieteC2X: 9of12 retained C1 hull pieces plus closed receiving relief, closed 120 mm tip over the recorded long bore, modern equipment seats/air, widened gear, all legal poses, negatives and budgets pass');
