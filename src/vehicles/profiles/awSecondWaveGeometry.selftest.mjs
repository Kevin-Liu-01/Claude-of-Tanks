import assert from 'node:assert/strict';import * as THREE from 'three';
import {readFileSync} from 'node:fs';import {runInNewContext} from 'node:vm';
import {createTank} from '../tankFactory.ts';import {getSpec} from '../specs.ts';
import {measureTurretBarrelCircularity} from '../turretBarrelCircularity.ts';
import {createTankState} from '../../sim/movement.ts';
// Independent source scalar witnesses; never import builder datums as targets.
const SOURCES={
  t90_x:{yaw:[-.00094997882843,1.408079981803894,.115670447585103],gun:[-.0007899813354,1.726339995861054,1.271363670175725],
    tip:6.370519876480101,floor:5.964219808578489,roof:2.27397990227,wheelY:.44845,
    axles:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996],era:6},
  t90a_burlak_x:{yaw:[-.001247544176495,1.544579982757568,.114670021536425],gun:[.001410018652678,1.784449994564055,1.283482024669646],
    tip:6.260299921035765,floor:5.853999853134153,roof:2.26367998123,wheelY:.44845,
    axles:[-1.742,-.9013,-.0495,.8015,1.6534,2.4996],era:6},
  t90ms_x:{yaw:[-.00094997882843,1.4433900117874146,.1200934632560673],gun:[-.0016399808228014,1.8143100142478943,1.3700721232514588],
    tip:6.294960021972652,floor:4.99215984344482,roof:2.1855900287628174,wheelY:.4485,
    axles:[-1.7806,-.9404,-.08855,.76255,1.6144,2.46025],
    left:[-1.81590002775,-.97714999318,-.12659997866,.72445000755,1.57635003328,2.42254996300],
    right:[-1.74285000563,-.90240001678,-.05049999041,.80055001006,1.65250003338,2.49795007706],era:8},
};
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: actual ${a}, source ${b} ±${t}`);
// Exercise the actual standard census and its unchanged MG rejection policy
// without starting a renderer. Passing this source-construction test must not
// turn the genuinely unarmed historical T90 carrier into a production pass.
// The owner's added complete NSVT is tested separately from that source stock.
const standardPage=readFileSync(new URL('../../../tools/standard-check-page.html',import.meta.url),'utf8');
const censusSource=standardPage.match(/function censusFittings\(root\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(censusSource,'actual standard fitting census remains available');
const censusFittings=runInNewContext(`(${censusSource})`);
const standardTool=readFileSync(new URL('../../../tools/tank-standard-check.mjs',import.meta.url),'utf8');
const decorRules=[...standardTool.matchAll(/^\s+decorOk = (st\.[^;\n]+);/gm)].map(m=>m[1]);
assert.equal(decorRules.length,2,'both standard scan paths enforce the MG minimum');
assert.ok(decorRules.every(rule=>rule==='st.census.mg >= 1'),'no source-unarmed standard waiver');
const standardWeaponPass=runInNewContext(`(st)=>(${decorRules[0]})`);
function visible(root){const out=[];root.traverseVisible(o=>{if(o.isMesh&&!o.userData.shadowOnly&&(Array.isArray(o.material)?o.material:[o.material]).some(m=>m.visible&&m.colorWrite!==false&&!m.transparent))out.push(o);});return out;}
function frame(t,id,s){
  for(const[name,p]of [['rig_turret',s.yaw],['rig_gun',s.gun]]){
    const v=t.root.getObjectByName(name).getWorldPosition(new THREE.Vector3());p.forEach((a,i)=>near(v.getComponent(i),a,.000002,`${id} source design joint ${name}`));
  }
  near(getSpec(id).dims.heightM,s.roof,.000002,'structural source roof remains independent of mast height');
  assert.ok(t.root.getObjectByName('gunMount')?.isMesh,'real pitching mount');
  const yaw=t.root.getObjectByName('rig_turret'),pitch=t.root.getObjectByName('rig_gun');
  for(const a of [0,-1.03,.83])for(const b of [0,-.075,.19]){
    yaw.rotation.y=a;pitch.rotation.x=b;t.root.updateMatrixWorld(true);
    const p=new THREE.Vector3(0,0,s.tip-s.gun[2]).applyAxisAngle(new THREE.Vector3(1,0,0),b)
      .add(new THREE.Vector3(...s.gun).sub(new THREE.Vector3(...s.yaw))).applyAxisAngle(new THREE.Vector3(0,1,0),a).add(new THREE.Vector3(...s.yaw));
    near(t.gunMuzzleWorld(new THREE.Vector3()).distanceTo(p),0,.000002,'actual muzzle follows independent physical joints');
  }yaw.rotation.y=0;pitch.rotation.x=0;t.root.updateMatrixWorld(true);
}
function bore(t,s){
  const m=t.root.getObjectByName('gun'),all=visible(t.root);near(new THREE.Box3().setFromObject(m).max.z,s.tip,.000003,'physical source muzzle terminal');
  for(const[x,y]of [[0,0],[.03,0],[-.03,0],[0,.03],[0,-.03]]){
    const ray=new THREE.Raycaster(new THREE.Vector3(s.gun[0]+x,s.gun[1]+y,s.tip+.2),new THREE.Vector3(0,0,-1),0,2);
    near(ray.intersectObject(m,false)[0]?.point.z,s.floor,.00002,'source true opaque-metal bore recess');
    const h=ray.intersectObjects(all,false)[0];assert.equal(h?.object.name,'muzzleBoreShadowFallbackDisc');
    near(h?.point.z,s.floor+.0012,.00002,'complete source-sized bore contains only its seated lining');
  }
  assert.ok(measureTurretBarrelCircularity(t,{requireMeasurement:true}).pass,'physical125mm circular bore and stock');
}
function gear(t,s){
  const im=t.root.getObjectByName('gearRoadWheelTires'),m=new THREE.Matrix4(),p=new THREE.Vector3();assert.equal(im.count,12);
  for(let i=0;i<im.count;i++){
    im.getMatrixAt(i,m);p.setFromMatrixPosition(m).applyMatrix4(im.matrixWorld);near(p.y,s.wheelY,.000002,'independent source wheel rest height');
    assert.ok((p.x<0?s.left??s.axles:s.right??s.axles).some(z=>Math.abs(z-p.z)<.000002),'actual source longitudinal wheel station on its physical side');
  }
  assert.equal(t.root.getObjectByName('rig_hull').userData.runningGearReceipts.length,1,'single animated native running gear');
}
function wheelMatrices(t,s){
  const im=t.root.getObjectByName('gearRoadWheelTires'),m=new THREE.Matrix4(),out=[];
  for(let i=0;i<im.count;i++){
    im.getMatrixAt(i,m);const p=new THREE.Vector3().setFromMatrixPosition(m),stations=p.x<0?s.left:s.right;
    assert.ok(stations.some(z=>Math.abs(z-p.z)<.000002),'measured stagger persists during native wheel motion');
    out.push({side:Math.sign(p.x),basis:[0,1,2,4,5,6,8,9,10].map(j=>m.elements[j])});
  }return out;
}
function staggerMotion(t,id,s){
  if(id!=='t90ms_x')return;
  const state=createTankState(getSpec(id),new THREE.Vector3(),0);t.setGroundSampler(()=>0);
  t.syncFromState(state,1/60,20);const before=wheelMatrices(t,s);
  const im=t.root.getObjectByName('gearRoadWheelTires'),version=im.instanceMatrix.version;
  state.trackScroll.l=.42;state.trackScroll.r=-.37;t.syncFromState(state,1/60,20);
  const moving=wheelMatrices(t,s);assert.ok(im.instanceMatrix.version>version,'spinning wheel transforms uploaded');
  for(let i=0;i<moving.length;i++)assert.notDeepEqual(moving[i].basis,before[i].basis,'each measured axle retains a spinning native tire');
  state.trackScroll.l+=.11;t.syncFromState(state,1/60,20);const leftOnly=wheelMatrices(t,s);
  for(let i=0;i<moving.length;i++){
    if(moving[i].side<0)assert.notDeepEqual(leftOnly[i].basis,moving[i].basis,'left phase advances independently');
    else assert.deepEqual(leftOnly[i].basis,moving[i].basis,'right phase stays unchanged');
  }
  t.resetForGaragePresentation();wheelMatrices(t,s);
  const receipt=t.root.getObjectByName('rig_hull').userData.runningGearReceipts[0];
  assert.deepEqual(receipt.wheelZsLeftM,s.left);assert.deepEqual(receipt.wheelZsRightM,s.right);
}
function reactive(t,s){
  const rows=t.root.userData.eraVisualBindingReceipt.plates;assert.equal(rows.length,s.era);
  const fixed=['hull','turret'].map(n=>[n,t.root.getObjectByName(n).geometry.attributes.position.array.slice()]);
  for(const r of rows){
    assert.ok(r.registered&&r.ownerMatches&&r.fittedSurfaces.length);
    assert.ok(r.fittedSurfaces.every(f=>f[2].every((v,i)=>v===f[3][i])),'exact authored cover faces, no fitted rectangles spanning source air');
    assert.equal(t.stripEra(r.name),true);const p=t.root.getObjectByName(`${r.owner}ExternalArmor`).geometry.attributes.position,spent=p.array.slice(),version=p.version;
    t.stripEra(r.name);assert.deepEqual(p.array,spent);assert.equal(p.version,version);
    for(const[n,bytes]of fixed)assert.deepEqual(t.root.getObjectByName(n).geometry.attributes.position.array,bytes,'permanent backing retained');
    assert.equal(t.resetEra(),true);
  }
}
function roofWeapon(t,id){
  const mg=t.root.getObjectByName('sourceMachineGun_turretDark'),census=censusFittings(t.root);
  if(id==='t90_x'){
    assert.equal(mg,undefined,'source-empty T90 channel is not a fabricated named weapon');
    const added=t.root.getObjectByName('t90XMountedNsvt');
    const body=added?.getObjectByName('browningDerivedMachineGunBody');
    assert.ok(body?.isMesh&&body.geometry.attributes.position.count>0,
      'added T90 weapon requires a physical complete NSVT body, not a census marker');
    assert.equal(added.parent,t.root.getObjectByName('rig_turret'));
    assert.equal(added.userData.weaponClass,'nsvt');
    assert.equal(census.mg,1,'complete owner-added T90 weapon earns exactly one census entry');
    assert.equal(standardWeaponPass({census}),true,'real NSVT satisfies unchanged standard MG rule');
    return added;
  }
  assert.ok(mg?.isMesh,`${id}: complete source weapon remains a real mesh`);
  assert.equal(mg.parent.parent,t.root.getObjectByName('rig_turret'));
  assert.equal(census.mg,1,`${id}: actual complete source weapon earns one census entry`);
  assert.equal(standardWeaponPass({census}),true,`${id}: true weapon satisfies unchanged standard MG rule`);
  return mg;
}
function emptyT90Mount(t){
  const added=t.root.getObjectByName('t90XMountedNsvt'),parent=added.parent,index=parent.children.indexOf(added);
  parent.remove(added);
  try{historicalEmptyT90Mount(t);}
  finally{
    parent.add(added);
    parent.children.splice(parent.children.indexOf(added),1);
    parent.children.splice(index,0,added);
  }
}
function historicalEmptyT90Mount(t){
  // Complete-source held-outs from t90_x.remaining-roof-heldouts.json:
  // retain the interrupted lower web, flanking rim and real axial opening.
  // Only the named owner-added NSVT is detached; every source mesh remains.
  const census=censusFittings(t.root);
  assert.equal(census.mg,0,'retained unarmed source mount has no false recognized MG');
  assert.equal(standardWeaponPass({census}),false,'actual full-standard MG0 rejection remains required');
  const meshes=visible(t.root);
  const hit=(p,d,far)=>new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(meshes,false)[0];
  near(hit([-.6,2.65,.11],[0,-1,0],.025)?.point.y,2.636280059814453,.00001,'actual source channel lower web remains present');
  near(hit([-.624,2.75,.29],[0,-1,0],.13)?.point.y,2.659679889678955,.00001,'actual source channel rim remains present');
  assert.equal(hit([-.6,2.65,.42],[0,-1,0],.025),undefined,'source lower-web slot stays genuinely open');
  assert.equal(hit([-.58615,2.66803,.8],[0,0,-1],.7),undefined,'empty source weapon axis contains no fictitious barrel');
  assert.equal(hit([-.42,2.72,.40],[0,-1,0],.10),undefined,'source guard and chute retain their open mouth');
  assert.throws(()=>roofWeapon(t,'t90a_burlak_x'),/complete source weapon remains a real mesh/,
    'negative control: absence cannot satisfy the armed-family requirement');
  const fake=new THREE.Group();fake.name='t90XMountedNsvt';fake.userData={fittingRoot:true,fitting:'pintleMG',weaponClass:'nsvt'};t.root.add(fake);
  try{assert.throws(()=>roofWeapon(t,'t90_x'),/physical complete NSVT body/,
    'negative control: a marker-only weapon cannot certify this empty source mount');}
  finally{t.root.remove(fake);}
}
function equipment(t,id){
  const mg=roofWeapon(t,id);
  if(id==='t90_x')emptyT90Mount(t);
  if(id==='t90_x'||id==='t90a_burlak_x'){
    const details=t.root.getObjectByName('hullDetail');
    for(const x of [-.6,.6]){
      const air=new THREE.Raycaster(new THREE.Vector3(x,1.77,-3.53),new THREE.Vector3(0,-1,0),0,.35).intersectObject(details,false);
      assert.equal(air.length,0,'source genuinely empty rear drum cradles');
    }
  }
  if(id==='t90a_burlak_x'){
    const hit=new THREE.Raycaster(new THREE.Vector3(0,3,-2),new THREE.Vector3(0,-1,0)).intersectObject(t.root.getObjectByName('turret'),false)[0];
    near(hit.point.y,2.26367998123,.000002,'source welded bustle roof, independent of fittings');
    near(new THREE.Box3().setFromObject(mg).max.z,.56843,.000002,'actual complete forward-facing Object17 gun terminal');
  }
  if(id==='t90ms_x'){
    const detail=t.root.getObjectByName('turretDetail');
    for(const y of [1.87,1.98,2.035,2.095]){
      const hit=new THREE.Raycaster(new THREE.Vector3(.12,y,-3.1),new THREE.Vector3(0,0,1),0,.35).intersectObject(detail,false);
      assert.equal(hit.length,0,'source open rear basket inter-rail air, not a full panel');
    }
    for(const y of [1.84159,1.95339,2.12064]){
      const hit=new THREE.Raycaster(new THREE.Vector3(.12,y,-3.1),new THREE.Vector3(0,0,1)).intersectObject(detail,false)[0];
      near(hit.point.z,-2.93071,.000002,'actual source thin transverse rear rail');
    }
  }
}
function antennas(t,id){
  const poles={t90_x:[[-.27255,2.18015,-.89241],[1.05213,1.99952,.52246]],t90a_burlak_x:[[-.1912,2.33669,-.8695]],t90ms_x:[[.55525,2.45610,-1.42175]]};
  for(const[x,y,z]of poles[id])for(const[dy,r]of [[.4,.0115+(.4-.1385)*.0005/.4604],[1.2,.0082-(1.2-1.0165)*.0004/.2124]]){
    const hit=new THREE.Raycaster(new THREE.Vector3(x+.08,y+dy,z+.00001),new THREE.Vector3(-1,0,0),0,.14).intersectObject(t.root.getObjectByName('turretDetail'),false)[0];
    near(hit?.point.x,x+r-.00001/Math.sqrt(3),.000003,'source stepped/tapered hexagonal whip, not uniform needle or pole');
  }
}
const selected=process.env.AW_SOURCE_IDS?.split(',');
for(const[id,s]of Object.entries(SOURCES))for(const quality of ['high','low']){
  if(selected&&!selected.includes(id))continue;
  const t=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
  try{t.root.updateMatrixWorld(true);frame(t,id,s);bore(t,s);gear(t,s);reactive(t,s);equipment(t,id);antennas(t,id);staggerMotion(t,id,s);}finally{t.dispose();}
}
console.log('awSecondWaveGeometry: actual high/low source joints, metal bore depth, native axles, reactive backing and fitting ownership pass; added T90 NSVT and retained unarmed carrier/MG0 negative controls pass; visual/release gates separate');
