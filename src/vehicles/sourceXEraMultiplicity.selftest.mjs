import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createShell } from '../sim/ballistics.ts';
import { queryAimArmor, tankPoseFromState, traceTank } from '../sim/armor.ts';
import { createCombatState, estimatePenRatio, resolveShellHit } from '../sim/damage.ts';

const state=()=>({pos:new Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0});
const pose=tankPoseFromState(state());
const HE={name:'exact ERA seam HE',type:'HE',caliberMm:155,pen100Mm:1,
  pen1000Mm:1,pen2000Mm:1,dmg:3000,velocityMps:1000,moduleDmg:0,tracer:'HE'};
const KE={...HE,name:'exact ERA seam KE',type:'APFSDS',pen100Mm:5000,
  pen1000Mm:5000,pen2000Mm:5000,tracer:'APFSDS'};
const CE={...KE,name:'exact ERA seam CE',type:'HEAT',tracer:'HEAT'};

function near(actual,expected,label) {
  assert.ok(Math.abs(actual-expected)<1e-8,`${label}: ${actual} versus ${expected}`);
}

function fittedSpec(original,receipt) {
  const armor={...original.armor};
  for(const owner of ['hull','turret']) {
    const seen=new Set();
    armor[`${owner}Plates`]=original.armor[`${owner}Plates`].flatMap(plate=>{
      if(plate.kind!=='era')return [plate];
      if(seen.has(plate.name))return [];
      seen.add(plate.name);
      return receipt.plates.find(row=>row.owner===owner&&row.name===plate.name)
        .fittedSurfaces.map(verts=>({...plate,verts}));
    });
  }
  return {...original,armor};
}

function oneCoincidentSurface(hits) {
  return hits.filter((hit,index)=>hit.kind!=='plate'||hit.plate.kind!=='era'
    ||!hits.slice(0,index).some(prior=>prior.kind==='plate'&&prior.plate.name===hit.plate.name
      &&prior.point.distanceToSquared(hit.point)<=1e-12));
}

function eventFor(spec,from,to,shellSpec,hits) {
  const target={id:'target',spec,state:state(),combat:createCombatState(spec)};
  const shell=createShell(shellSpec,'source',false,from,to.clone().sub(from).normalize(),1);
  return resolveShellHit(shell,target,hits,()=>.5);
}

function actualSmSeam(quality) {
  const original=getSpec('t90sm_x');
  const visual=createTank('t90sm_x',null,{quality,proceduralOnly:true,geometryReceipt:true});
  try {
    const spec=fittedSpec(original,visual.root.userData.eraVisualBindingReceipt);
    // Fixed measured seam through two adjacent actual right-cheek triangles.
    // Before the fix it absorbed 30mm instead of15mm: HE752 vs768.5;
    // the KE aim ratio was2.8402342563 instead of4.0574775089.
    const from=new Vector3(1.5864263689475069,3.8057410864446064,2.23414566515428);
    const to=new Vector3(.24957362389993576,.2312589631464581,1.0358542614127977);
    const hits=traceTank(from,to,pose,spec.armor),single=oneCoincidentSurface(hits);
    assert.equal(hits.length-single.length,1,`${quality}: real trace has one duplicate shared-edge facet`);
    assert.equal(hits[0].plate.name,'turret_era_R');
    assert.equal(hits[1].plate.name,'turret_era_R');
    assert.ok(hits[0].point.distanceTo(hits[1].point)<1e-9,`${quality}: physical same seam`);
    const event=eventFor(spec,from,to,HE,hits);
    near(event.damage,eventFor(spec,from,to,HE,single).damage,`${quality}: one physical HE thickness`);
    assert.deepEqual(event.eraActivations.map(row=>row.plate),['turret_era_R']);
    const info=queryAimArmor(from,to.clone().sub(from).normalize(),4,pose,spec.armor);
    const singleInfo={...info,layers:oneCoincidentSurface(info.layers)};
    for(const shell of [KE,CE]) {
      near(estimatePenRatio(shell,0,info),estimatePenRatio(shell,0,singleInfo),`${quality}/${shell.type}: one reactive reduction`);
      assert.deepEqual(eventFor(spec,from,to,shell,hits).eraActivations.map(row=>row.plate),['turret_era_R']);
    }
  } finally {visual.dispose();}
}

function plate(name,z,kind='era') {
  return {name,verts:[[-1,0,z],[1,0,z],[1,2,z],[-1,2,z]],kind,
    physicalMm:kind==='era'?15:100,keMm:100,ceMm:100,moduleLink:null,gunFollow:false,
    era:kind==='era'?{keReduction:.3,ceFlatMm:600}:null};
}

function fixture(plates) {
  const original=getSpec('t90sm_x');
  return {...original,armor:{...original.armor,hullPlates:[...plates,plate('main',0,'main')],
    turretPlates:[],turretPivot:[0,0,0],gunPivot:[0,0,0],gunBarrel:null,
    collisionShells:null,trackShapes:null,modules:[],crew:[]}};
}

function fixtureOutcome(plates) {
  const spec=fixture(plates),from=new Vector3(0,1,3),to=new Vector3(0,1,-1);
  const hits=traceTank(from,to,pose,spec.armor);
  const info=queryAimArmor(from,new Vector3(0,0,-1),4,pose,spec.armor);
  return {he:eventFor(spec,from,to,HE,hits),ke:estimatePenRatio(KE,0,info),ce:estimatePenRatio(CE,0,info)};
}

for(const quality of ['high','low'])actualSmSeam(quality);
const surface=plate('bank_R',1),v=surface.verts;
const one=fixtureOutcome([surface]);
const split=fixtureOutcome([{...surface,verts:[v[0],v[1],v[2],v[2]]},
  {...surface,verts:[v[0],v[2],v[3],v[3]]}]);
near(split.he.damage,one.he.damage,'one quad versus two exact triangles has same HE absorption');
near(split.ke,one.ke,'one quad versus split KE estimate');
near(split.ce,one.ce,'one quad versus split CE estimate');

// A real 0.1mm separation remains two material layers, not a seam epsilon.
const spaced=fixtureOutcome([surface,plate('bank_R',.9999)]);
near(one.he.damage-spaced.he.damage,16.5,'distinct same-bank layers retain both15mm steel thicknesses');
near(spaced.ke,one.ke,'same depleted bank only activates once even at distinct depths');
near(spaced.ce,one.ce,'same depleted bank chemical reduction only once');
const separate=fixtureOutcome([surface,plate('other_bank',.9)]);
near(one.he.damage-separate.he.damage,16.5,'separate ERA banks retain both physical layers');
near(separate.ke,one.ke*.7,'different banks retain two KE activations');
near(one.ce-separate.ce,6,'different banks retain two600mm chemical reductions');
assert.equal(separate.he.eraActivations.length,2,'separate banks both activate');
const coincidentBanks=fixtureOutcome([surface,plate('other_bank',1)]);
near(coincidentBanks.he.damage,separate.he.damage,'different bank names never collapse together');
console.log('sourceXEraMultiplicity: actual SM shared-edge HE/KE/CE, single activation and distinct material/bank controls pass');
