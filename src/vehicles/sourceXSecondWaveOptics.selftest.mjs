import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {SECOND_WAVE_X_IDS} from './sourceXSecondWaveSpecs.ts';
import {COMBAT_ANATOMY_CALIBRATIONS} from './combatAnatomyCalibrations.ts';

// Source equipment scopes, not guesses from a generic dark/glass material.
// These scalar bounds pin seven metadata-only repairs against the original
// physical geometry, plus T62's newly measured low periscope. They are not
// supplied vertex arrays. Count: 54 preserved parts plus 2 new T62 parts.
const EXACT_SCOPES = {
  t62mv1_x: [
    ['turretDetail',[.22312516,2.05292368,.41564566],[.41870609,2.15799975,.53319901]],
    ['turretDark',[.24541563,2.093,.53241901],[.39641563,2.141,.53321901]],
  ],
  t72b_1987_x: [
    ['turretDetail',[.3125,1.923176,.324152],[.5755,2.148824,.789848]],
    ['turretDark',[.3405,2.016,.78],[.5475,2.102,.8]],
  ],
  t80u_x: [
    ['turretDetail',[.638,2.072,.156],[.828,2.206,.373]],
    ['turretDetail',[-.919,2.036030,.327407],[-.594,2.175970,.740593]],
    ['turretDark',[.660,2.117,.372],[.806,2.179,.386]],
    ['turretDark',[-.8805,2.074,.731],[-.6325,2.148,.749]],
  ],
  t72b3_x: [
    ['turretDetail',[-.751,2.469,-.02155],[-.4773,2.7283,.16535]],
    ['turretDetail',[.6354,2.0951,-.12585],[.9458,2.4014,.20535]],
    ['turretDark',[-.71925,2.49615,.165],[-.50905,2.70115,.17885]],
    ['turretDark',[.6943,2.1118,.150],[.8829,2.3848,.162]],
  ],
  t72b3m_x: [
    ['turretDetail',[.5784,2.190,-.098],[.9924,2.522,.258]],
    ['turretDark',[.6714,2.3265,.257],[.8994,2.4515,.265]],
  ],
  t72bu_x: [
    ['turretDetail',[.4029,1.850,.837],[.6021,2.140,1.257]],
    ['turretDark',[.4145,1.9405,1.2555],[.5905,2.0255,1.2645]],
  ],
  t90a_burlak_x: [
    ['turretDetail',[-.74465,2.20068,-.95418],[-.25535,2.32968,-.46488]],
    ['turretDetail',[-.71725,2.32328,-.92668],[-.28295,2.60308,-.49238]],
    ['turretDetail',[-.64885,2.60498,-.81353],[-.35105,2.69388,-.53323]],
    ['turretDetail',[-.66595,2.60208,-.61673],[-.33425,2.61378,-.55333]],
    ['turretDark',[-.59425,2.37408,-.5658],[-.40695,2.57968,-.5538]],
  ],
};

function boxScope(bucket, size, center) {
  return [bucket,center.map((x,i)=>x-size[i]/2),center.map((x,i)=>x+size[i]/2)];
}

function jpzSightScopes() {
  const out=[];
  const box=(bucket,size,center)=>out.push(boxScope(bucket,size,center));
  // Three separate hatch/casemate periscopes, each with four frame pieces.
  for(const [x,y,z,w] of [[-.708,3.184,-1.844,.210],[.908,1.809,1.520,.212],[-.908,1.809,1.520,.212]]) {
    for(const side of [-1,1])box('hullDetail',[.026,.105,.11],[x+side*(w-.026)/2,y+.052,z]);
    box('hullDetail',[w,.021,.11],[x,y+.109,z]);
    box('hullDetail',[w,.10,.018],[x,y+.050,z-.055]);
    box('hullGlass',[w-.052,.058,.004],[x,y+.058,z+.004]);
  }
  // Two independent low glacis windows retain their 20 mm front reveal.
  for(const x of [.511765,-.462957]) {
    for(const side of [-1,1])box('hullDetail',[.07412,.09926,.10431],[x+side*.10853,1.81881,2.837784]);
    box('hullDetail',[.143,.02204,.10431],[x,1.857423,2.837784]);
    box('hullDetail',[.143,.016,.10431],[x,1.77718,2.837784]);
    box('hullDetail',[.29118,.09926,.014],[x,1.81881,2.792628]);
    box('hullGlass',[.14294,.056,.004],[x,1.818,2.867583]);
  }
  for(const x of [-.8012,.8007]) {
    for(const side of [-1,1])box('hullDetail',[.023,.054,.075],[x+side*.118,3.213,-3.92]);
    box('hullDetail',[.26,.015,.075],[x,3.242,-3.92]);
    box('hullGlass',[.212,.030,.004],[x,3.216,-3.937]);
  }
  assert.equal(out.length,35,'seven JPz sight assemblies, not one hull-wide box');
  return out;
}
EXACT_SCOPES.jpz_e100_x=jpzSightScopes();
assert.equal(Object.values(EXACT_SCOPES).reduce((sum,parts)=>sum+parts.length,0),56,
  '54 existing optical primitives plus the two source-backed T62 additions');

const NON_OPTIC_CENTERS = {
  t62mv1_x:[-.432,2.283,1.439], // Large IR searchlight, not island8180's sight.
  t72b_1987_x:[.947,2.200,-.14],
  t80u_x:[.5355,1.756,1.439],
  t72b3_x:[-.61355,2.411,-.363], // Commander lid, not its optical head.
  t72b3m_x:[-.62689,2.30722,-.24424],
  t72bu_x:[-.58057,2.227,-.03332],
  t90a_burlak_x:[.9805,2.26858,.31017],
};

const IDS = ['leo2a6_x','k1a1_x','amx30_x','t62mv1_x','t72b_1987_x','t80u_x',
  'leclerc_x','leclerc_classic_x','chieftain_mk10_x','t72b3_x','jpz_e100_x',
  'type10_x','type90_x','amx40_x','ariete_c1_x','strv122_x','t72b3m_x',
  'challenger1_x','t72bu_x','chieftain5_x','t90_x','t90a_burlak_x','t90ms_x'];
assert.deepEqual([...SECOND_WAVE_X_IDS].sort(),[...IDS].sort(),'exact independent second-wave 23-ID coverage');
assert.equal(new Set(SECOND_WAVE_X_IDS).size,23,'no duplicated ID can hide a missing source vehicle');
const EPS=0.000002;

function positiveBounds(part,label) {
  assert.equal(part.min?.length,3,label);
  assert.equal(part.max?.length,3,label);
  for(let axis=0;axis<3;axis++)assert.ok(Number.isFinite(part.min[axis])&&Number.isFinite(part.max[axis])
    &&part.max[axis]>=part.min[axis],`${label}: finite, non-inverted physical bounds`);
  // A genuine flat glazing surface is valid. A point/line metadata placeholder
  // is not; this test does not invent a new minimum stock-thickness policy.
  assert.ok(part.min.filter((x,i)=>part.max[i]>x).length>=2,`${label}: nonempty physical surface`);
}

function worldPart(root,part) {
  const mesh=root.getObjectByName(part.bucket);
  assert.ok(mesh?.isMesh,`${part.bucket}: tagged primitive has an actual rendered mesh`);
  let owner=mesh;
  while(owner&&!['rig_turret','rig_hull'].includes(owner.name))owner=owner.parent;
  assert.equal(owner?.name,part.parent==='hullG'?'rig_hull':'rig_turret',
    `${part.bucket}: receipt owner is the actual mesh articulation frame`);
  const box=new THREE.Box3(new THREE.Vector3(...part.min),new THREE.Vector3(...part.max));
  const local=box.clone().expandByScalar(EPS),point=new THREE.Vector3();
  const position=mesh.geometry.getAttribute('position');
  let actualVertex=false;
  for(let index=0;index<position.count;index++) {
    if(local.containsPoint(point.fromBufferAttribute(position,index))){actualVertex=true;break;}
  }
  assert.ok(actualVertex,`${part.bucket}: receipt contains a real authored surface vertex, not an empty metadata box`);
  box.applyMatrix4(mesh.matrixWorld);
  return {...part,min:box.min.toArray(),max:box.max.toArray()};
}

function exactScope(id,parts) {
  const expected=EXACT_SCOPES[id];
  assert.equal(parts.length,expected.length,`${id}: exact source sight primitive count`);
  const unmatched=parts.slice();
  for(const [bucket,min,max] of expected) {
    const index=unmatched.findIndex(p=>p.bucket===bucket&&min.every((x,i)=>Math.abs(x-p.min[i])<EPS)
      &&max.every((x,i)=>Math.abs(x-p.max[i])<EPS));
    assert.ok(index>=0,`${id}: actual ${bucket} optical part at ${min}..${max}`);
    unmatched.splice(index,1);
  }
  assert.equal(unmatched.length,0,`${id}: no generic roof/furniture bucket accepted`);
}

function canonicalModule(id,modules) {
  const optical=modules.filter(m=>m.module==='optics');
  assert.equal(optical.length,1,`${id}: exactly one canonical optics damage state`);
  assert.equal(!!optical[0].turretLocal,id!=='jpz_e100_x',`${id}: physical canonical optics owner`);
  return optical[0];
}

function calibratedParts(id,module,calibration) {
  const receipts=calibration.moduleShapes.filter(p=>p.module==='optics');
  assert.equal(receipts.length,1,`${id}: exactly one generated canonical optical receipt`);
  assert.equal(!!receipts[0].turretLocal,id!=='jpz_e100_x',`${id}: generated physical optics owner`);
  assert.ok(receipts[0].parts.length>0,`${id}: generated receipt cannot omit physical sights`);
  assert.ok(Array.isArray(module.parts)&&module.parts.length>0,`${id}: runtime optics cannot fall back to the old affine donor box`);
  assert.deepEqual(module.parts,receipts[0].parts,`${id}: runtime owns the current segmented sight volumes`);
  for(const p of module.parts)positiveBounds(p,`${id}: runtime optical part`);
}

function negativeControls(id,root,raw,world) {
  if(!EXACT_SCOPES[id])return;
  const ordinary=raw.filter(p=>p.module!=='optics'&&p.parent===(id==='jpz_e100_x'?'hullG':'turretG')
    &&/^(?:hull|turret)(?:Dark|Detail|Glass)$/.test(p.bucket));
  assert.ok(ordinary.length>0,`${id}: ordinary furniture is not blanket-registered`);
  const furniture=worldPart(root,ordinary[0]);
  assert.throws(()=>exactScope(id,[{...furniture,module:'optics'},...world.slice(1)]),
    {name:'AssertionError'},`${id}: same-count generic furniture replacement is rejected`);
  const excludedCenter=NON_OPTIC_CENTERS[id];
  if(excludedCenter) {
    const detail=root.getObjectByName('turretDetail'),center=new THREE.Vector3();
    const receipt=raw.find(p=>{
      if(p.bucket!=='turretDetail')return false;
      center.set(...p.min.map((x,i)=>(x+p.max[i])/2)).applyMatrix4(detail.matrixWorld);
      return excludedCenter.every((x,i)=>Math.abs(x-center.getComponent(i))<EPS);
    });
    assert.ok(receipt,`${id}: independently identified non-optical fixture still exists`);
    const excluded=worldPart(root,receipt);
    assert.equal(excluded.module,null,`${id}: real projector/lid/furniture is not relabeled as a sight`);
    assert.throws(()=>exactScope(id,[{...excluded,module:'optics'},...world.slice(1)]),
      {name:'AssertionError'},`${id}: same-count projector/lid substitution is rejected`);
  }
  if(id==='jpz_e100_x') {
    const panes=raw.filter(p=>p.bucket==='hullGlass');
    assert.equal(panes.length,8,'seven actual sight panes plus one headlamp');
    assert.equal(panes.filter(p=>p.module==='optics').length,7,'only sight panes are optical modules');
    const lamp=panes.find(p=>(p.min[2]+p.max[2])/2>3.5);
    assert.ok(lamp,'actual bow lamp remains present');
    assert.equal(lamp.module,null,'headlight glazing is not a damageable sight');
    assert.throws(()=>exactScope(id,[worldPart(root,{...lamp,module:'optics'}),...world.slice(1)]),
      {name:'AssertionError'},'same-count headlamp substitution is rejected');
  }
}

const failures=[];
for(const id of IDS)for(const quality of ['high','low']) {
  let tank;
  try {
    tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    tank.root.updateMatrixWorld(true);
    const modules=getSpec(id).armor.modules,module=canonicalModule(id,modules);
    const raw=tank.root.userData.combatGeometryParts;
    assert.ok(Array.isArray(raw),`${id}: actual unmerged physical receipts required`);
    const parent=id==='jpz_e100_x'?'hullG':'turretG';
    const optical=raw.filter(p=>p.module==='optics'&&p.parent===parent);
    assert.ok(optical.length>0,`${id}: source sight is explicitly registered in its canonical owner`);
    for(const part of optical)positiveBounds(part,`${id}: actual optical primitive`);
    const world=optical.map(p=>worldPart(tank.root,p));
    if(EXACT_SCOPES[id]) {
      assert.equal(raw.filter(p=>p.module==='optics').length,optical.length,`${id}: repaired scopes have no opposite-owner leaks`);
      exactScope(id,world);
      negativeControls(id,tank.root,raw,world);
    }
    assert.throws(()=>canonicalModule(id,[...modules,{...module}]),{name:'AssertionError'},'duplicate optics state rejected');
    assert.throws(()=>canonicalModule(id,modules.map(m=>m===module?{...m,turretLocal:!m.turretLocal}:m)),
      {name:'AssertionError'},'wrong-owner optical state rejected');
    console.log(`sourceXSecondWaveOptics ${id}/${quality}: ${optical.length} physical sight parts and semantic negative controls PASS`);
    calibratedParts(id,module,COMBAT_ANATOMY_CALIBRATIONS[id]);
    const owner=tank.root.getObjectByName(parent==='hullG'?'rig_hull':'rig_turret');
    const neutral=owner.matrixWorld.toArray();
    tank.root.getObjectByName('rig_turret').rotation.y=.31;
    tank.root.getObjectByName('rig_gun').rotation.x=-.12;
    tank.root.updateMatrixWorld(true);
    if(parent==='hullG')assert.deepEqual(owner.matrixWorld.toArray(),neutral,'JPz sights stay with fixed casemate');
    else assert.notDeepEqual(owner.matrixWorld.toArray(),neutral,`${id}: sights follow actual turret yaw`);
    console.log(`sourceXSecondWaveOptics ${id}/${quality}: ${optical.length} physical parts, one canonical module PASS`);
  } catch(error) {
    failures.push(new Error(`${id}/${quality}: ${error.message}`,{cause:error}));
  } finally {tank?.dispose();}
}
if(failures.length)throw new AggregateError(failures,'Second-wave source optics registration is incomplete');
console.log('sourceXSecondWaveOptics: all23 actual high/low optical scopes, canonical modules and negative controls PASS');
