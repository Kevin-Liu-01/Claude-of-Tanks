import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { SOURCE_X_DONORS } from './sourceXFleetSpecs.ts';
import { stripActivatedEra } from '../game/eraActivation.ts';
import { createShell } from '../sim/ballistics.ts';
import { tankPoseFromState, traceTank } from '../sim/armor.ts';
import { createCombatState, resolveShellHit } from '../sim/damage.ts';

const DEFAULT_IDS=['leo2a7v_x','leo2a6m_x','merkava3d_x','kf51_x',
  't90a_x','t90a_vladimir_x','t90m_x','t90sm_x','t14_x'];
const arg=process.argv.find(a=>a.startsWith('--ids='));
const ids=arg?arg.slice(6).split(','):DEFAULT_IDS;
const auditShell={name:'X ERA exact-face audit',type:'APFSDS',caliberMm:120,
  pen100Mm:5000,pen1000Mm:5000,pen2000Mm:5000,dmg:1,velocityMps:1700,moduleDmg:0,tracer:'APFSDS'};
const state=()=>({pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0});
const pose=tankPoseFromState(state());
const eraRows=spec=>['hull','turret'].flatMap(owner=>spec.armor[`${owner}Plates`]
  .filter(p=>p.kind==='era').map(plate=>({owner,plate})));
const stats=p=>JSON.stringify({physicalMm:p.physicalMm,keMm:p.keMm,ceMm:p.ceMm,era:p.era});

function bufferHash(root,permanentOnly=false){
  const hash=createHash('sha256');
  root.traverse(o=>{if(!o.geometry||permanentOnly&&o.userData.combatHitboxRole==='externalArmor')return;
    hash.update(o.name);for(const key of Object.keys(o.geometry.attributes).sort()){
      const a=o.geometry.attributes[key].array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
  });return hash.digest('hex');
}

function fittedSpec(original,receipt){
  const armor={...original.armor};
  for(const owner of ['hull','turret']){
    const done=new Set();
    armor[`${owner}Plates`]=original.armor[`${owner}Plates`].flatMap(p=>{
      if(p.kind!=='era')return[p];
      if(done.has(p.name))return[];done.add(p.name);
      const row=receipt.plates.find(r=>r.owner===owner&&r.name===p.name);
      return row.fittedSurfaces.map(verts=>({...p,verts}));
    });
  }
  // Same exact measured receipt expansion used by anatomy generation. This
  // local clone does not mutate runtime specs or substitute for the full
  // unchanged fleet registration test after root regenerates final receipts.
  return {...original,armor};
}

function faceRay(spec,owner,plate){
  const p=plate.verts.map(v=>new THREE.Vector3(...v));
  const center=p.reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/p.length);
  const normal=p[1].clone().sub(p[0]).cross(p[3].clone().sub(p[0])).normalize();
  if(owner==='turret')center.add(new THREE.Vector3(...spec.armor.turretPivot));
  return {center,normal,from:center.clone().addScaledVector(normal,.75),to:center.clone().addScaledVector(normal,-.75)};
}

function actualFaceWitnesses(visual,spec,owner,plate,label){
  const mesh=visual.root.getObjectByName(`${owner}ExternalArmor`);
  const {center,normal}=faceRay(spec,owner,plate);
  for(const vertex of [...plate.verts,null]){
    const point=vertex?new THREE.Vector3(...vertex):center.clone();
    if(vertex&&owner==='turret')point.add(new THREE.Vector3(...spec.armor.turretPivot));
    if(vertex)point.lerp(center,.0001); // deterministic inward edge tolerance, not a fitted offset
    const hits=new THREE.Raycaster(point.clone().addScaledVector(normal,.02),normal.clone().negate(),0,.04)
      .intersectObject(mesh,false);
    assert.ok(hits.some(h=>h.point.distanceTo(point)<.00002),`${label}: fitted corner/center lies on actual cassette skin`);
  }
}

let zones=0,faces=0;
for(const id of ids)for(const quality of ['high','low']){
  const original=getSpec(id),donor=getSpec(SOURCE_X_DONORS[id]);
  const donorStats=new Map(eraRows(donor).map(({plate})=>[plate.name,stats(plate)]));
  for(const {plate} of eraRows(original))assert.equal(stats(plate),donorStats.get(plate.name),`${id}: donor ERA values retained`);
  const visual=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242,batchStatic:false});
  try{
    visual.root.updateMatrixWorld(true);
    const receipt=visual.root.userData.eraVisualBindingReceipt;
    assert.equal(receipt.revision,'canonical-gameplay-era-binding-r1');
    const names=[...new Set(eraRows(original).map(({plate})=>plate.name))];
    for(const name of names){const row=receipt.plates.find(p=>p.name===name);
      assert.ok(row.registered&&row.ownerMatches&&row.partCount>0&&row.fittedSurfaces.length>0,`${id}/${name}: actual registered cover`);
    }
    const spec=fittedSpec(original,receipt);
    for(const name of names){
      const matching=eraRows(spec).filter(({plate})=>plate.name===name);
      const before=bufferHash(visual.root),backing=bufferHash(visual.root,true);
      let activation=null;
      for(const {owner,plate} of matching){
        actualFaceWitnesses(visual,spec,owner,plate,`${id}/${quality}/${name}`);
        const ray=faceRay(spec,owner,plate),hits=traceTank(ray.from,ray.to,pose,spec.armor);
        assert.ok(hits.some(h=>h.kind==='plate'&&h.plate===plate),`${id}/${name}: actual fitted face is hittable`);
        const target={id:`${id}_audit`,spec,state:state(),combat:createCombatState(spec)};
        const shell=createShell(auditShell,'era_audit',false,ray.from,ray.to.clone().sub(ray.from).normalize(),1);
        const event=resolveShellHit(shell,target,hits,()=>.5);
        if(event.eraActivations.some(a=>a.plate===name))activation??={event,target,ray};
        faces++;
      }
      assert.ok(activation,`${id}/${name}: actual face produces a one-shot combat event`);
      assert.ok(activation.target.combat.eraSpent.has(name));
      assert.equal(stripActivatedEra(activation.event,visual),true,`${id}/${name}: event strips visible geometry`);
      assert.notEqual(bufferHash(visual.root),before,`${id}/${name}: real vertices are removed`);
      assert.equal(bufferHash(visual.root,true),backing,`${id}/${name}: permanent backing/equipment never changes`);
      const hits=traceTank(activation.ray.from,activation.ray.to,pose,spec.armor,activation.target.combat.eraSpent);
      assert.ok(!hits.some(h=>h.kind==='plate'&&h.plate.name===name),`${id}/${name}: spent zone leaves collision`);
      const shell=createShell(auditShell,'era_audit',false,activation.ray.from,
        activation.ray.to.clone().sub(activation.ray.from).normalize(),2);
      const event=resolveShellHit(shell,activation.target,hits,()=>.5);
      assert.ok(!event.eraActivations.some(a=>a.plate===name),`${id}/${name}: no second activation`);
      assert.equal(visual.resetEra(),true);
      assert.equal(bufferHash(visual.root),before,`${id}/${name}: reset restores exact original geometry`);
      zones++;
    }
  }finally{visual.dispose();}
}
console.log(`sourceXEra: ${ids.length} X builds, ${zones} high/low zone flows, ${faces} actual face/corner witnesses pass`);
