import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {SECOND_WAVE_X_IDS,SECOND_WAVE_X_DONORS} from './sourceXSecondWaveSpecs.ts';
import {stripActivatedEra} from '../game/eraActivation.ts';
import {createShell} from '../sim/ballistics.ts';
import {tankPoseFromState,traceTank} from '../sim/armor.ts';
import {createCombatState,resolveShellHit} from '../sim/damage.ts';

// Independent named-module census, not the generated triangle count. Passive
// western armor/cages and the thirteen non-reactive variants are not ERA.
const ERA_IDS=['t62mv1_x','t72b_1987_x','t80u_x','t72b3_x','t72b3m_x',
  't72bu_x','t90_x','t90a_burlak_x','t90ms_x'];
const shellSpec={name:'Second-wave live ERA audit',type:'APFSDS',caliberMm:120,
  pen100Mm:5000,pen1000Mm:5000,pen2000Mm:5000,dmg:1,velocityMps:1700,moduleDmg:0,tracer:'APFSDS'};
const vector=a=>new THREE.Vector3(...a);
const rows=spec=>['hull','turret'].flatMap(owner=>spec.armor[`${owner}Plates`]
  .filter(plate=>plate.kind==='era').map(plate=>({owner,plate})));
const keys=spec=>[...new Set(rows(spec).map(({owner,plate})=>`${owner}/${plate.name}`))].sort();
const stats=p=>[p.physicalMm,p.keMm,p.ceMm,p.era.keReduction,p.era.ceFlatMm];
const arg=process.argv.find(a=>a.startsWith('--ids='));
const ids=arg?arg.slice(6).split(','):SECOND_WAVE_X_IDS;
assert.equal(SECOND_WAVE_X_IDS.length,23,'complete requested fleet census');
for(const id of ids)assert.ok(SECOND_WAVE_X_IDS.includes(id),`known second-wave ID ${id}`);

function expectedZones(id){
  if(!ERA_IDS.includes(id))return[];
  const names=['hull/glacis_era_L','hull/glacis_era_R','turret/turret_era_L','turret/turret_era_R'];
  if(!['t62mv1_x','t80u_x'].includes(id))names.push('hull/skirt_era_L','hull/skirt_era_R');
  if(id==='t90ms_x')names.push('turret/side_era_L','turret/side_era_R');
  return names.sort();
}
function expectedStats(id,name){
  if(id==='t62mv1_x')return[15,15,15,.05,280];
  if(name.startsWith('skirt_'))return[12,12,12,.05,280];
  return[15,15,15,.2,id==='t80u_x'?400:450];
}
function assertCensus(id,spec,binding,finish){
  const expected=expectedZones(id);
  assert.deepEqual(keys(spec),expected,`${id}: exact reactive names/owners, no invented passive ERA`);
  for(const {plate} of rows(spec))assert.deepEqual(stats(plate),expectedStats(id,plate.name),`${id}: declared gameplay values retained`);
  const actual=[...new Set((binding?.plates||[]).map(r=>`${r.owner}/${r.name}`))].sort();
  assert.deepEqual(actual,expected,`${id}: exact live binding census`);
  const covered=new Set((binding?.plates||[]).flatMap(r=>[r.name,...r.visualSectors]));
  for(const sector of finish?.sectors||[])if(!/cage|slat|screen|net/i.test(sector))
    assert.ok(covered.has(sector),`${id}/${sector}: visible reactive field has real gameplay`);
  if(!expected.length)return;
  assert.equal(binding.revision,'canonical-gameplay-era-binding-r1');
  for(const row of binding.plates){
    assert.ok(row.registered&&row.ownerMatches&&row.partCount>0,`${id}/${row.name}: live removable cover`);
    assert.equal(row.registeredOwner,row.owner,`${id}/${row.name}: one articulation owner`);
    assert.ok(row.fittedSurfaces.length>0,`${id}/${row.name}: physical protection facets`);
  }
}
function fittedSpec(original,binding){
  const armor={...original.armor};
  for(const owner of ['hull','turret']){
    const seen=new Set();
    armor[`${owner}Plates`]=original.armor[`${owner}Plates`].flatMap(p=>{
      if(p.kind!=='era')return[p];
      if(seen.has(p.name))return[];seen.add(p.name);
      const matching=binding.plates.filter(r=>r.owner===owner&&r.name===p.name);
      return matching.flatMap(row=>row.fittedSurfaces.map(verts=>({...p,verts})));
    });
  }
  // Same local fresh-receipt expansion as sourceXEra.selftest, without writing
  // specs. The mandatory generated anatomy/eraGameplayRegistration gate still
  // separately rejects stale shipped receipts after final regeneration.
  return{...original,armor};
}
function bufferHash(root,permanent=false){
  const hash=createHash('sha256');
  root.traverse(o=>{
    if(!o.geometry||permanent&&o.userData.combatHitboxRole==='externalArmor')return;
    hash.update(o.name);
    for(const key of Object.keys(o.geometry.attributes).sort()){
      const a=o.geometry.attributes[key].array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
    if(o.geometry.index){const a=o.geometry.index.array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
    if(o.isInstancedMesh){const a=o.instanceMatrix.array;hash.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
  });return hash.digest('hex');
}
function uploadVersions(root){
  const versions=[];root.traverse(o=>{if(o.geometry)versions.push(o.geometry.attributes.position.version);if(o.isInstancedMesh)versions.push(o.instanceMatrix.version);});return versions;
}
function state(posed=false){return{pos:vector(posed?[2.3,.4,-1.7]:[0,0,0]),yaw:posed?.41:0,
  visualPitch:posed?.07:0,visualRoll:posed?-.04:0,turretYaw:posed?-.63:0,gunPitch:posed?.11:0};}
function setPose(t,s){
  t.root.position.copy(s.pos);t.root.rotation.set(-s.visualPitch,s.yaw,s.visualRoll,'YXZ');
  t.root.getObjectByName('rig_turret').rotation.y=s.turretYaw;
  t.root.getObjectByName('rig_gun').rotation.x=-s.gunPitch;t.root.updateMatrixWorld(true);
}
function ownerFrame(spec,owner,s){
  const matrix=new THREE.Matrix4().compose(s.pos,new THREE.Quaternion().setFromEuler(
    new THREE.Euler(-s.visualPitch,s.yaw,s.visualRoll,'YXZ')),vector([1,1,1]));
  if(owner==='turret')matrix.multiply(new THREE.Matrix4().makeTranslation(...spec.armor.turretPivot))
    .multiply(new THREE.Matrix4().makeRotationY(s.turretYaw));
  return matrix;
}
function faceRay(spec,owner,plate,s){
  assert.equal(plate.verts.length,4);assert.ok(plate.verts.flat().every(Number.isFinite));
  const points=plate.verts.map(vector),center=points.reduce((sum,p)=>sum.add(p),new THREE.Vector3()).multiplyScalar(.25);
  const normal=points[1].clone().sub(points[0]).cross(points[3].clone().sub(points[0]));
  assert.ok(normal.lengthSq()>1e-16,'real finite nondegenerate skin');normal.normalize();
  const matrix=ownerFrame(spec,owner,s);center.applyMatrix4(matrix);normal.transformDirection(matrix);
  return{center,normal,points:points.map(p=>p.applyMatrix4(matrix)),
    from:center.clone().addScaledVector(normal,.35),to:center.clone().addScaledVector(normal,-.35)};
}
function physicalWitness(t,ray,owner,label){
  const mesh=t.root.getObjectByName(`${owner}ExternalArmor`);assert.ok(mesh?.geometry,`${label}: actual cover mesh`);
  for(const p of [...ray.points,ray.center]){
    const point=p.clone().lerp(ray.center,.0001);
    const hits=new THREE.Raycaster(point.clone().addScaledVector(ray.normal,.02),ray.normal.clone().negate(),0,.04).intersectObject(mesh,false);
    assert.ok(hits.some(h=>h.point.distanceTo(point)<.00002),`${label}: exact corner/center hits real outward skin, not fitted air`);
  }
}
function sampledFaces(matching){
  // Bounded deterministic coverage of every named module at both LODs and
  // poses. All facets get finite/normal checks; these distributed skins get
  // full corner+center visible-ray checks (the legacy fleet gate is separate).
  return [...new Set([0,Math.floor(matching.length/4),Math.floor(matching.length/2),
    Math.floor(matching.length*3/4),matching.length-1])].map(i=>matching[i]);
}
function hitEvent(spec,s,ray,target=null){
  target??={id:`${spec.id}_era_audit`,spec,state:s,combat:createCombatState(spec)};
  const hits=traceTank(ray.from,ray.to,tankPoseFromState(s),spec.armor,target.combat.eraSpent);
  const shell=createShell(shellSpec,'era_audit',false,ray.from,ray.to.clone().sub(ray.from).normalize(),1);
  return{hits,target,event:resolveShellHit(shell,target,hits,()=>.5),ray};
}
function assertUniqueActivation(event,label){
  const names=event.eraActivations.map(a=>a.plate);
  assert.equal(new Set(names).size,names.length,`${label}: coincident facets never activate one named module twice`);
}
let zoneFlows=0,skinSamples=0,liveFaces=0;
function exerciseZone(t,spec,owner,name,quality){
  const label=`${spec.id}/${quality}/${owner}/${name}`,matching=rows(spec).filter(r=>r.owner===owner&&r.plate.name===name);
  assert.ok(matching.length);liveFaces+=matching.length;
  for(const r of matching)faceRay(spec,owner,r.plate,state());
  const before=bufferHash(t.root),backing=bufferHash(t.root,true);
  for(const posed of [false,true]){
    const s=state(posed);setPose(t,s);let activation=null;
    for(const {plate} of sampledFaces(matching)){
      const ray=faceRay(spec,owner,plate,s);physicalWitness(t,ray,owner,label);skinSamples++;
      const hit=hitEvent(spec,s,ray);assert.ok(hit.hits.some(h=>h.kind==='plate'&&h.plate===plate),`${label}: render-aligned exact trace`);
      assertUniqueActivation(hit.event,label);
      if(hit.event.eraActivations.some(a=>a.plate===name))activation??=hit;
    }
    // Some valid faces are shielded by adjacent physical plates. Search the
    // remaining real faces, never move a ray away from its measured skin.
    for(const {plate} of matching){
      if(activation)break;const hit=hitEvent(spec,s,faceRay(spec,owner,plate,s));
      assertUniqueActivation(hit.event,label);
      if(hit.event.eraActivations.some(a=>a.plate===name))activation=hit;
    }
    assert.ok(activation,`${label}: exposed live cassette actually activates`);
    assert.ok(activation.target.combat.eraSpent.has(name));
    assert.equal(stripActivatedEra(activation.event,t),true,`${label}: actual event routes to visual strip`);
    const stripped=bufferHash(t.root),versions=uploadVersions(t.root);
    assert.notEqual(stripped,before,`${label}: real buffer removed`);
    assert.equal(bufferHash(t.root,true),backing,`${label}: permanent armor/supports/gear never depleted`);
    const cover=t.root.getObjectByName(`${owner}ExternalArmor`),r=activation.ray;
    const remnants=new THREE.Raycaster(r.center.clone().addScaledVector(r.normal,.02),r.normal.clone().negate(),0,.04).intersectObject(cover,false);
    assert.ok(!remnants.some(h=>h.point.distanceTo(r.center)<.00002),`${label}: the hit skin itself disappears, not another module`);
    stripActivatedEra(activation.event,t);
    assert.equal(bufferHash(t.root),stripped,`${label}: repeated visual event is idempotent`);
    assert.deepEqual(uploadVersions(t.root),versions,`${label}: repeat does not upload unchanged stock`);
    const second=hitEvent(spec,s,activation.ray,activation.target);
    assert.ok(!second.hits.some(h=>h.kind==='plate'&&h.plate.name===name),`${label}: spent module leaves collision`);
    assert.ok(!second.event.eraActivations.some(a=>a.plate===name),`${label}: second shell cannot reactivate`);
    assert.equal(t.resetEra(),true);assert.equal(bufferHash(t.root),before,`${label}: reset restores exact geometry`);
    const fresh=hitEvent(spec,s,activation.ray);assert.ok(fresh.event.eraActivations.some(a=>a.plate===name),`${label}: new-round state reactivates restored module`);
    zoneFlows++;
  }
  setPose(t,state());
}
for(const id of ids){
  const original=getSpec(id),donor=getSpec(SECOND_WAVE_X_DONORS[id]);
  const donorSnapshot=JSON.stringify(donor.armor);
  const qualities=ERA_IDS.includes(id)?['high','low']:['low'];
  for(const quality of qualities){
    const t=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    // Native factory startup installs its real trackShapes in the spec. Take
    // the immutability witness afterward; combat must not rewrite that data.
    const sourceSnapshot=JSON.stringify(original.armor);
    try{
      t.root.updateMatrixWorld(true);const binding=t.root.userData.eraVisualBindingReceipt;
      assertCensus(id,original,binding,t.root.userData.eraFinishReceipt);
      if(!ERA_IDS.includes(id)){assert.equal(t.resetEra(),false,`${id}: no invented reactive clusters`);continue;}
      const spec=fittedSpec(original,binding);
      for(const key of expectedZones(id)){const [owner,name]=key.split('/');exerciseZone(t,spec,owner,name,quality);}
    }finally{t.dispose();}
    assert.equal(JSON.stringify(original.armor),sourceSnapshot,`${id}: combat audit never rewrites actual metadata`);
  }
  assert.equal(JSON.stringify(donor.armor),donorSnapshot,`${id}: original donor protection untouched`);
  console.log(`sourceXSecondWaveEra: ${id} ${expectedZones(id).length} named zones pass`);
}
if(!arg){assert.equal(ERA_IDS.length,9);assert.equal(zoneFlows,208,'52 modules × high/low × neutral/posed');}
console.log(`sourceXSecondWaveEra: ${ids.length} IDs, ${zoneFlows} live/strip/spent/reset flows, ${skinSamples} corner/center skin samples, ${liveFaces} finite high/low facets pass`);
