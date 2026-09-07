import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {tankPoseFromState,traceTank} from '../../sim/armor.ts';
import {createCombatState,resolveShellHit} from '../../sim/damage.ts';
import {createShell} from '../../sim/ballistics.ts';
import {stripActivatedEra} from '../../game/eraActivation.ts';
const packet=JSON.parse(fs.readFileSync(new URL('../../../docs/references/tanks/t90_x.cheek-heldouts.json',import.meta.url),'utf8'));
function ray(ms,p,d,far=2){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function fittedSpec(t){
  const spec=getSpec('t90_x'),done=new Set(),rows=t.root.userData.eraVisualBindingReceipt.plates;
  const turretPlates=spec.armor.turretPlates.flatMap(p=>{if(p.kind!=='era')return[p];if(done.has(p.name))return[];done.add(p.name);
    return rows.find(r=>r.owner==='turret'&&r.name===p.name).fittedSurfaces.map(verts=>({...p,verts}));});
  return {...spec,armor:{...spec.armor,turretPlates}};
}
function gameplay(t){
  const spec=fittedSpec(t),state={pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0},pose=tankPoseFromState(state);
  const shell={name:'AW measured reactive leaf',type:'APFSDS',caliberMm:120,pen100Mm:5000,pen1000Mm:5000,pen2000Mm:5000,dmg:1,velocityMps:1700,moduleDmg:0,tracer:'APFSDS'};
  for(const side of [-1,1]){
    const name=`turret_era_${side<0?'L':'R'}`,row=packet.rays.find(r=>r.origin[0]===side*1.65&&r.origin[2]===.65);
    assert.ok(row,'independent outward physical leaf witness exists');
    const p=new THREE.Vector3(...row.point),n=new THREE.Vector3(...row.normal),from=p.clone().addScaledVector(n,.35),to=p.clone().addScaledVector(n,-.2);
    const target={id:'aw_leaf_audit',spec,state,combat:createCombatState(spec)},hits=traceTank(from,to,pose,spec.armor);
    assert.ok(hits.some(h=>h.kind==='plate'&&h.plate.name===name),'actual exact source-facing triangles protect the actual leaf, not fitted air');
    const event=resolveShellHit(createShell(shell,'audit',false,from,to.clone().sub(from).normalize(),1),target,hits,()=>.5);
    assert.equal(event.eraActivations.filter(a=>a.plate===name).length,1);assert.equal(stripActivatedEra(event,t),true);
    const spent=traceTank(from,to,pose,spec.armor,target.combat.eraSpent);assert.equal(spent.some(h=>h.kind==='plate'&&h.plate.name===name),false);
    const second=resolveShellHit(createShell(shell,'audit',false,from,to.clone().sub(from).normalize(),2),target,spent,()=>.5);
    assert.equal(second.eraActivations.some(a=>a.plate===name),false);assert.equal(t.resetEra(),true);
  }
}
function stripAndAir(t,ms){
  const armor=t.root.getObjectByName('turretExternalArmor'),initial=armor.geometry.attributes.position.array.slice();
  const fixed=['turret','turretDetail','turretDark'].map(name=>[name,t.root.getObjectByName(name).geometry.attributes.position.array.slice()]);
  for(const side of [-1,1])for(const z of [.45,.55,.65,.85,1.05])
    assert.equal(Boolean(ray([armor],[side*1.78,2.3,z],[0,-1,0],.9)),false,'source outer leaf ends before the old false outboard ledge');
  assert.equal(Boolean(ray(ms,[1.15,1.925,1.4],[0,-1,0],.03)),false,'actual third upper cassette exposed-back cavity stays open');
  for(const side of ['L','R']){
    assert.equal(t.stripEra(`turret_era_${side}`),true);
    for(const[name,data]of fixed)assert.deepEqual(t.root.getObjectByName(name).geometry.attributes.position.array,data,'permanent turret and supports survive leaf depletion');
    assert.equal(t.resetEra(),true);assert.deepEqual(armor.geometry.attributes.position.array,initial,'reset exactly restores every visible leaf and narrow rim');
  }
}
assert.equal(packet.rays.length,87);
for(const quality of ['high','low']){
  const t=createTank('t90_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const ms=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)ms.push(m);});
    for(const r of packet.rays){const h=ray(ms,r.origin,r.direction);assert.ok(h&&h.point.distanceTo(new THREE.Vector3(...r.point))<=.006,`whole-scene source leaf ${r.origin}: ${h?.point.toArray()} vs ${r.point}`);}
    stripAndAir(t,ms);gameplay(t);
  }finally{t.dispose();}
}
console.log('t90AwXCheekLeaves: actual high/low 87 complete-source rays, open back case, outward exact ERA hit/strip/spent/reset and permanent backing pass');
