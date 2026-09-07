import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from '../tankFactory.ts';
import {getSpec} from '../specs.ts';
import {addT90BurlakRearFurniture} from './t90BurlakXRear.ts';
import {tankPoseFromState,traceTank} from '../../sim/armor.ts';
import {createCombatState,resolveShellHit} from '../../sim/damage.ts';
import {createShell} from '../../sim/ballistics.ts';
import {stripActivatedEra} from '../../game/eraActivation.ts';
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs source ${b} ±${t}`);
function hit(ms,p,d,far=1){return new THREE.Raycaster(new THREE.Vector3(...p),new THREE.Vector3(...d),0,far).intersectObjects(ms,false)[0];}
function visible(t){const a=[];t.root.traverseVisible(m=>{if(m.isMesh&&!m.userData.shadowOnly)a.push(m);});return a;}
function cradles(m){
  for(const x of [.35,.365,.38,.8])for(const[z,y]of [[-3.75,1.2561910561861],[-3.65,1.2173564802429],
    [-3.55,1.2141703952786],[-3.45,1.2411110358537],[-3.35,1.3147844502637]])
    near(hit(m,[x,1.7,z],[0,-1,0])?.point.y,y,.0001,'Burlak source 50.8 mm cradle flange');
  for(const x of [-.6,0,.6])assert.equal(Boolean(hit(m,[x,1.5,-3.55],[0,-1,0],.5)),false,'open space between empty drum cradles');
}
function cables(m){
  for(const[x,y,z]of [[0,1.41091,-3.256848255096052],[0,1.33939,-3.23695045532408],[.8,1.43431,-3.250046703466184],
    [-1.107,1.007,-3.34761211302389],[1.001,1.008,-3.379813319416113],[-1.04,.78856,-3.2862703118527183],
    [.88,.74947,-3.2373769101839738],[-.96,1.27390,-3.3054278064649516]])
    near(hit(m,[x,y,-4],[0,0,1],1.1)?.point.z,z,.004,'complete source tow loop and transom course');
  for(const x of [-1,0,1])for(const y of [.78,.90,1.05,1.18])
    assert.equal(Boolean(hit(m,[x,y,-3.7],[0,0,1],.25)),false,'actual rear air remains empty around hanging cables');
}
function eyes(m){
  for(const[x,y,z]of [[.5885,.83445,-3.153684028912189],[.7885,.73445,-3.2076684894989547],
    [.7885,.75445,-3.2092327293770913],[.8185,.75445,-3.206365904368676],[-.83845,.7547,-3.178393313934658],
    [-.80845,.7347,-3.1703611617100482],[-.80845,.7547,-3.177454100060352],
    [-.60845,.8347,-3.1412250570001787],[-.57845,.8347,-3.1423415744141905]])
    near(hit(m,[x,y,-4],[0,0,1],1.1)?.point.z,z,.0045,'source thin eye head and separate thick neck');
  for(const[x,y,z]of [[.6885,.83445,-2.944421597780532],[-.70845,.8347,-2.944830213600551]]){
    assert.equal(Boolean(hit(m,[x,y,-3.4],[0,0,1],.4)),false,'real terminal eye hole reaches the transom');
    near(hit(m,[x,y,-3.4],[0,0,1],.6)?.point.z,z,.001,'unchanged hull behind actual eye aperture');
  }
  for(const x of [.64065,-.6528])for(const[y,z]of [[.8136,-3.087944280203317],[.8336,-3.1030809820165275]])
    near(hit(m,[x,y,-3.4],[0,0,1],.6)?.point.z,z,.001,'source lower bent hook carrier plane');
}
function skirts(t,m){
  const armor=t.root.getObjectByName('hullExternalArmor'),backups=['hull','hullDetail'].map(n=>t.root.getObjectByName(n).geometry.attributes.position.array.slice());
  for(const side of [-1,1]){
    for(const[z,lo,hi,outer]of [[1.28,.927709997,1.430109978,1.906990051],[1.96,.880949974,1.383350015,1.905740023],[2.64,.827459991,1.329859972,1.904800057]])
      for(const y of [lo+.04,hi-.04])near(hit(m,[side*2.1,y,z],[-side,0,0],.3)?.point.x,side*(outer+(side<0?.0019:0)),.000001,'exact three-course cassette outward face');
    const shift=side<0?.0019:0;
    near(hit([armor],[side*1.80,1.12,1.28],[side,0,0],.2)?.point.x,side*(1.831590056+shift),.000001,'actual smaller raised cassette rear boss');
    near(hit([armor],[side*1.84,.94,1.28],[side,0,0],.1)?.point.x,side*(1.868190050+shift),.000001,'surrounding inset rear step retains air');
    const row=t.root.userData.eraVisualBindingReceipt.plates.find(p=>p.name===`skirt_era_${side<0?'L':'R'}`);
    assert.ok(row.registered&&row.ownerMatches);assert.equal(row.fittedSurfaces.length,6,'two actual outward triangles per each of three cassettes, hardware adds no hit surfaces');
    assert.equal(t.stripEra(row.name),true);
    assert.equal(Boolean(hit([armor],[side*2.1,1.12,1.28],[-side,0,0],.3)),false,'spent cassette physically removed');
    const spent=armor.geometry.attributes.position.array.slice(),version=armor.geometry.attributes.position.version;
    t.stripEra(row.name);assert.deepEqual(armor.geometry.attributes.position.array,spent);assert.equal(armor.geometry.attributes.position.version,version);
    for(const[n,i]of [['hull',0],['hullDetail',1]])assert.deepEqual(t.root.getObjectByName(n).geometry.attributes.position.array,backups[i],'fixed structural backing and mounting lugs survive');
    assert.equal(t.resetEra(),true);
  }
}
function interior(mesh,p,axis,reach=.3){
  const old=mesh.material.side;mesh.material.side=THREE.DoubleSide;
  const a=hit([mesh],p,axis,reach),b=hit([mesh],p,axis.map(n=>-n),reach);mesh.material.side=old;return Boolean(a&&b&&a.distance>0&&b.distance>0);
}
function fittedSpec(t){
  const original=getSpec('t90a_burlak_x'),done=new Set();
  const hullPlates=original.armor.hullPlates.flatMap(p=>{
    if(p.kind!=='era')return[p];if(done.has(p.name))return[];done.add(p.name);
    return t.root.userData.eraVisualBindingReceipt.plates.find(r=>r.owner==='hull'&&r.name===p.name).fittedSurfaces.map(verts=>({...p,verts}));
  });
  // The exact same generated-receipt expansion, local only until the parent
  // refreshes the complete fleet anatomy. Never mutate donor/runtime specs.
  return {...original,armor:{...original.armor,hullPlates}};
}
function gameplay(t){
  const spec=fittedSpec(t),state={pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0};
  const pose=tankPoseFromState(state),shellSpec={name:'Burlak cassette audit',type:'APFSDS',caliberMm:120,
    pen100Mm:5000,pen1000Mm:5000,pen2000Mm:5000,dmg:1,velocityMps:1700,moduleDmg:0,tracer:'APFSDS'};
  for(const side of [-1,1]){
    const name=`skirt_era_${side<0?'L':'R'}`,from=new THREE.Vector3(side*2.05,1.12,1.28),to=new THREE.Vector3(side*1.5,1.12,1.28);
    const target={id:'burlak_era_audit',spec,state,combat:createCombatState(spec)},direction=to.clone().sub(from).normalize();
    const hits=traceTank(from,to,pose,spec.armor);assert.ok(hits.some(h=>h.kind==='plate'&&h.plate.name===name),'actual ray hits measured cassette skin');
    const event=resolveShellHit(createShell(shellSpec,'audit',false,from,direction,1),target,hits,()=>.5);
    assert.equal(event.eraActivations.filter(a=>a.plate===name).length,1,'one physical cassette zone activates once');
    assert.ok(target.combat.eraSpent.has(name));assert.equal(stripActivatedEra(event,t),true);
    const secondHits=traceTank(from,to,pose,spec.armor,target.combat.eraSpent);
    assert.equal(secondHits.some(h=>h.kind==='plate'&&h.plate.name===name),false,'spent zone no longer protects empty space');
    const second=resolveShellHit(createShell(shellSpec,'audit',false,from,direction,2),target,secondHits,()=>.5);
    assert.equal(second.eraActivations.some(a=>a.plate===name),false,'second physical hit does not reactivate spent zone');
    assert.equal(t.resetEra(),true);
  }
}
function physicalSeats(t){
  const hull=t.root.getObjectByName('hull'),detail=t.root.getObjectByName('hullDetail'),armor=t.root.getObjectByName('hullExternalArmor');
  for(const x of [-.7988,-.3735,.36355,.80275])for(const mesh of [hull,detail])
    assert.ok(interior(mesh,[x,1.17+(x<-.7?.0029:0),-3.15+(x<-.7?.0078:0)],[0,1,0]),'all four actual cradle roots overlap the hull carrier');
  for(const side of [-1,1])for(const[z,y,x]of [[1.073430047,1.382109978,1.831590056],[1.752080069,1.335350015,1.831740022],[2.427560077,1.281859972,1.829400063]]){
    const shift=side<0?.0019:0;
    for(const mesh of [detail,armor])assert.ok(interior(mesh,[side*(x+shift+.0005),y,z],[1,0,0]),`narrow lug engages actual cassette boss ${side}/${z}/${mesh.name}`);
    for(const mesh of [hull,detail])assert.ok(interior(mesh,[side*1.7825,y,z],[0,1,0]),`narrow lug engages permanent native fender ${side}/${z}/${mesh.name}`);
  }
}
function helperClosure(){
  const parts=[],material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const p={addEquipment(_b,g,x=0,y=0,z=0){g.translate(x,y,z);const m=new THREE.Mesh(g,material);m.updateMatrixWorld();parts.push(m);}};
  addT90BurlakRearFurniture(p);
  // Every cable terminal is inside both a real curved stock and an eye neck
  // or narrowly documented upper retainer, not merely inside a mesh AABB.
  for(const point of [[-.820,.727,-3.138],[.779,.742,-3.163],[1.33,1.448,-3.198],[-1.293,1.448,-3.143]])
    assert.ok(parts.filter(m=>interior(m,point,[0,0,1],.12)).length>=2,`actual cable terminal ${point.join(',')} has positive physical engagement`);
  for(const point of [[.62265,.943,-3.132],[-.65233,.9315,-3.1105],[-.65233,.929,-3.121]])
    assert.ok(parts.filter(m=>interior(m,point,[0,0,1],.12)).length>=2,`eye/carrier physical bearing ${point.join(',')} is attached`);
  for(const m of parts)m.geometry.dispose();material.dispose();
}
helperClosure();
for(const quality of ['high','low']){
  const t=createTank('t90a_burlak_x',null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false});
  try{t.root.updateMatrixWorld(true);const m=visible(t);cradles(m);cables(m);eyes(m);skirts(t,m);gameplay(t);physicalSeats(t);
    const b=new THREE.Box3().setFromObject(t.root);near(b.min.x,-2.05973503,.000002,'unchanged full model left extremum');near(b.max.x,2.05073503,.000002,'unchanged full model right extremum');
  }finally{t.dispose();}
}
console.log('t90BurlakXRear: high/low source cassette planes and reactive strip/reset, cradle flanges, curved tow loops, true eye air and actual narrow attachment contacts pass');
