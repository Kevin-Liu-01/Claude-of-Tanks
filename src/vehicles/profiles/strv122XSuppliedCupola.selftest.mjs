import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {createTank} from '../tankFactory.ts';
import {addStrv122XSuppliedCupola} from './strv122XSuppliedCupola.ts';
import {addStrv122XSuppliedEquipment} from './strv122XSuppliedEquipment.ts';
import {STRV122_SUPPLIED_DATUMS as D} from './strv122XSuppliedFrame.ts';
import {withHistoricalStrv122Wheels} from '../strv122WheelHistory.test-support.mjs';

const near=(a,b,e,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=e,
  `${label}: ${a} versus complete-source ${b} ±${e}`);
const hit=(a,p,d,far=10)=>new T.Raycaster(new T.Vector3(...p),
  new T.Vector3(...d),0,far).intersectObjects(a,false)[0];
const material=new T.MeshBasicMaterial({side:T.DoubleSide});
function contains(m,p){
  let sum=0,last=-1,lastSign=0;
  for(const h of new T.Raycaster(new T.Vector3(...p),new T.Vector3(1,0,0),0,10)
    .intersectObject(m,false)){
    const nx=h.face.normal.clone().transformDirection(m.matrixWorld).x;
    if(Math.abs(nx)<1e-7)continue;const sign=Math.sign(nx);
    if(Math.abs(h.distance-last)<1e-7&&sign===lastSign)continue;
    sum+=sign;last=h.distance;lastSign=sign;
  }
  return sum>0;
}
function capturedParts(){
  const out=[];
  addStrv122XSuppliedCupola({addEquipment(bucket,g,x,y,z,rx=0,ry=0,rz=0){
    const m=new T.Mesh(g,material);m.name=g.userData.strvSuppliedCupolaPiece;
    m.userData.bucket=bucket;m.position.set(x+D.turretPivot[0],y+D.turretPivot[1],z+D.turretPivot[2]);
    m.rotation.set(rx,ry,rz);m.updateMatrixWorld(true);out.push(m);
  }});
  return out;
}
function sourceSurfaces(all){
  // Held-out complete-source rays; softly fused source edges are approximated
  // by original rounded/ruled solids, not imported mesh contours.
  for(const[x,z,y,e]of [[.86,0,2.768437,.0002],[.86,-.12,2.673577,.001],
    [.75,0,2.609984,.003],[.97,0,2.608420,.003],
    [.3,-.4,2.588851,.005],[1,-.2,2.583327,.004],
    [1.04,-.45,2.581445,.004],[.65,-.78,2.595195,.004],
    [.4,-.7,2.593375,.004],[.4,-.4,2.571236,.003],
    [.5,-.55,2.561741,.005],[.673,-.421,2.544439,.006],
    [.673,-.2,2.492639,.001],[-.8,.3,2.602762,.001],[-.7,.3,2.599229,.004]])
    near(hit(all,[x,4,z],[0,-1,0])?.point.y,y,e,'actual source crown/floor');
  for(const[x,y,z,e]of [[.861,2.74,.096954,.001],[.861,2.69,.084354,.001],
    [.861,2.65,.036311,.001],[.861,2.60,.015578,.004],
    [.75,2.64,.036940,.001],[1,2.64,.038138,.001],
    [-.8,2.55,.339802,.002],[-.75,2.55,.339337,.002],[-.7,2.55,.346184,.002]])
    near(hit(all,[x,y,.6],[0,0,-1])?.point.z,z,e,'source receiver setback/glass/jamb');
  near(hit(all,[.5,2.74,0],[1,0,0])?.point.x,.761456,.001,'source cap left flank');
  near(hit(all,[1.2,2.74,0],[-1,0,0])?.point.x,.961647,.001,'source cap right flank');
  near(hit(all,[1.2,2.52,-.4],[-1,0,0])?.point.x,1.091073,.003,'actual radial-foot outer stock');
}
function sourceAir(all){
  for(const[p,d,far]of [
    [[.3,2.50,-.4],[0,1,0],.050],[[1.04,2.50,-.45],[0,1,0],.050],
    [[.673,2.505,-.2],[0,1,0],.048],[[.86,2.72,.11],[0,0,1],.05],
    [[.861,2.60,.060],[0,0,-1],.035],[[.75,2.64,0],[0,0,-1],.09],
    [[1,2.64,0],[0,0,-1],.09],[[-.8,2.55,.365],[0,0,-1],.022],
    [[-.75,2.55,.365],[0,0,-1],.022]])
    assert.equal(Boolean(hit(all,p,d,far)),false,`real complete-source air survives: ${p}`);
  assert.ok(Boolean(hit(all,[-.84,2.55,.40],[0,0,-1],.04)),
    'small sight retains positive jamb stock alongside its real recess');
}
function contacts(parts,armor){
  const named=name=>parts.filter(m=>m.name===name);
  const occupied=(name,p)=>named(name).some(m=>contains(m,p));
  const both=(a,b,p)=>assert.ok(occupied(a,p)&&occupied(b,p),`${a}/${b} positive contact at ${p}`);
  for(const[p,name]of [[[.65,2.483,-.4],'CupolaBase'],[[.86,2.459,0],'HeadStem'],
    [[.738,2.467,-.105],'ReceiverFoot'],[[-.76,2.445,.30],'FrontSightBase']])
    assert.ok(contains(armor,p)&&occupied(name,p),`actual permanent roof/${name} shares stock: ${p}`);
  assert.equal(named('BandFoot').length,9,'source section census has nine discrete radial feet');
  for(const foot of named('BandFoot')){
    const bb=new T.Box3().setFromObject(foot),p=bb.getCenter(new T.Vector3());
    p.y=2.485;assert.ok(contains(foot,p.toArray())&&occupied('CupolaBase',p.toArray()),
      `each radial foot seats on the physical base, not a floating ring: ${p.toArray()}`);
    p.y=2.573;assert.ok(contains(foot,p.toArray())&&occupied('OuterBand',p.toArray()),
      `each radial foot engages the broad band: ${p.toArray()}`);
  }
  both('CupolaBase','HatchReceiver',[.34,2.485,-.4]);
  both('CupolaBase','HatchFloor',[.65,2.485,-.4]);
  both('HatchFloor','HatchRim',[.466,2.5385,-.41]);
  both('HatchFloor','HatchBridgeFoot',[.496,2.53,-.392]);
  both('HatchBridge','HatchBridgeFoot',[.496,2.575,-.392]);
  both('HeadStem','ReceiverWing',[.765,2.58,-.084]);
  both('HeadStem','ReceiverWing',[.96,2.58,-.084]);
  both('HeadStem','ReceiverRearTie',[.861,2.58,-.17]);
  both('ReceiverWing','ReceiverEar',[.738,2.6095,.022]);
  both('ReceiverWing','ReceiverFoot',[.738,2.558,-.105]);
  both('FrontSightBase','FrontSightBack',[-.76,2.5055,.30]);
  both('FrontSightBack','FrontSightRoof',[-.80,2.59,.30]);
  both('FrontSightBack','FrontSightGlass',[-.76,2.55,.339]);
  both('FrontSightBack','FrontSightJamb',[-.83,2.55,.30]);
}
const key=p=>p.toArray().map(v=>Math.round(v*10000)).join(',');
function hasNearby(map,p){
  const cell=p.toArray().map(v=>Math.round(v*10000));
  for(const x of [-1,0,1])for(const y of [-1,0,1])for(const z of [-1,0,1])
    if(map.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))
      ?.some(q=>q.distanceToSquared(p)<1e-10))return true;
  return false;
}
function actualWiring(parts,all){
  const positions=new Map();
  for(const name of ['turretDetail','turretGlass']){
    const set=new Map();for(const m of all.filter(m=>m.name===name)){
      const p=m.geometry.attributes.position;
      for(let i=0;i<p.count;i++){
        const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld),k=key(v);
        if(!set.has(k))set.set(k,[]);set.get(k).push(v);
      }
    }positions.set(name,set);
  }
  for(const m of parts){
    const p=m.geometry.attributes.position,set=positions.get(m.userData.bucket);
    for(let i=0;i<p.count;i++)assert.ok(hasNearby(set,new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld)),
      `actual factory contains ${m.name} vertex ${i}, not merely an isolated helper`);
  }
}
function preservedMeshHash(m){
  const g=m.geometry,mask=g.getAttribute('nightEmissionMask');
  // Keep the immutable pre-cupola geometry hash, separating only the validated
  // later-added lighting channel. No physical attribute or owner is omitted.
  if(mask){
    assert.ok(mask.array instanceof Uint8Array,'night mask is byte-sized');
    assert.equal(mask.itemSize,1);assert.equal(mask.normalized,false);
    assert.equal(mask.count,g.getAttribute('position').count,'one mask value per original vertex');
    assert.ok(mask.array.every(v=>v===0||v===1||v===2),'only supported semantic lens values');
  }
  const h=createHash('sha256');for(const[k,a]of Object.entries(g.attributes)){
    if(k==='nightEmissionMask')continue;
    h.update(k);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
  const ix=g.index;if(ix)h.update(Buffer.from(ix.array.buffer,ix.array.byteOffset,ix.array.byteLength));
  h.update(JSON.stringify(m.matrixWorld.elements));
  if(m.isInstancedMesh)h.update(Buffer.from(m.instanceMatrix.array.buffer));
  return h.digest('hex');
}
{
  const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  g.setAttribute('normal',new T.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
  g.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,1],2));g.setIndex([0,1,2]);
  const m=new T.InstancedMesh(g,new T.MeshBasicMaterial(),1),measure=()=>preservedMeshHash(m),legacy=measure();
  g.setAttribute('nightEmissionMask',new T.Uint8BufferAttribute([0,1,2],1));assert.equal(measure(),legacy);
  for(const invalid of [new T.Float32BufferAttribute([0,1,2],1),new T.Uint8BufferAttribute([0,1,2],3),
    new T.Uint8BufferAttribute([0,1],1),new T.Uint8BufferAttribute([0,1,2],1,true),new T.Uint8BufferAttribute([0,1,3],1)]){
    g.setAttribute('nightEmissionMask',invalid);assert.throws(measure);
  }
  g.setAttribute('nightEmissionMask',new T.Uint8BufferAttribute([0,1,2],1));
  g.setAttribute('unrecognizedSemanticChannel',new T.Uint8BufferAttribute([0,1,2],1));
  assert.notEqual(measure(),legacy,'unknown channels remain hashed');g.deleteAttribute('unrecognizedSemanticChannel');
  for(const a of [g.attributes.position,g.attributes.normal,g.attributes.uv,g.index,m.instanceMatrix]){
    const old=a.array[0];a.array[0]=old+1;assert.notEqual(measure(),legacy,'all original geometry/index/instance bytes remain guarded');a.array[0]=old;
  }
  m.matrixWorld.elements[12]=1;assert.notEqual(measure(),legacy,'ownership frame remains guarded');m.matrixWorld.elements[12]=0;
  assert.equal(measure(),legacy);g.dispose();m.material.dispose();
}
function nonTarget(t,quality){
  // Immutable pre-edit capture .qa-dev/reports/strv-cupola-before-GuXMa5.
  // Root concurrently corrected ONLY the named inferred suspension outputs;
  // their separate focused test owns that change. Every axle/face/course stays
  // in this exact before/after multiset. No post-change baseline is accepted.
  const omitted=new Set(['turretDetail#0','turretGlass#0',
    'gearSuspensionLinks#0','gearSuspensionJointBosses#0']);
  const seen={},rows=[];
  t.root.traverse(m=>{if(!m.isMesh||m.userData.vehicleMarking===true)return;
    const n=seen[m.name]??0;seen[m.name]=n+1;
    const name=`${m.name}#${n}`;if(omitted.has(name))return;
    rows.push([name,preservedMeshHash(m)]);
  });
  rows.sort(([a],[b])=>a.localeCompare(b));
  const expected=quality==='high'?'480848c64d41234c0062f44125c92084ac4aafbcd57515b4501f4a6349c04e45'
    :'513defe6c8dc5a57737b5617b2d08068f15f3c9049447a4f870d4b7041426d0f';
  assert.equal(rows.length,quality==='high'?37:36);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),expected,
    'immutable non-target runtime geometry, world matrices, MG, antenna-independent armor and all wheels/course');
}
function unchangedEquipmentEmissions(){
  // The immutable pre-edit module was evaluated with ONLY the old non-weapon
  // cupola call removed. All173 other emissions (including antenna feet and
  // old optical bodies) must remain byte-identical, even inside changed buckets.
  const rows=[],disposables=[],group=new T.Group();
  addStrv122XSuppliedEquipment({addEquipment(bucket,g,...args){
    if(!g.userData.strvSuppliedCupolaPiece){
      const h=createHash('sha256');h.update(bucket);h.update(JSON.stringify(args));
      for(const[k,a]of Object.entries(g.attributes)){
        h.update(k);h.update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));}
      if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));
      rows.push(h.digest('hex'));
    }g.dispose();
  },mats:{dark:material,detail:material},turretG:group,disposables});
  for(const g of disposables)g.dispose();
  assert.equal(rows.length,173);
  assert.equal(createHash('sha256').update(JSON.stringify(rows)).digest('hex'),
    'b35c236b13219fb34ff487a63f7731b0f4ac28349b3084d739c3dfe24cd8c785',
    'every non-target equipment emission inside shared detail/glass buckets is unchanged');
}
const parts=capturedParts();
try{unchangedEquipmentEmissions();for(const quality of ['high','low']){
  const t=createTank('strv122_x',null,{quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false,camoSeed:4242});
  try{
    t.root.updateMatrixWorld(true);const all=[],probes=[];
    t.root.traverse(m=>{if(!m.isMesh||m.userData.shadowOnly||m.userData.vehicleMarking||/Proxy|procShadow/.test(m.name))return;
      const p=new T.Mesh(m.geometry,material);p.name=m.name;p.matrixWorld.copy(m.matrixWorld);all.push(p);probes.push(p);});
    sourceSurfaces(all);sourceAir(all);contacts(parts,all.find(m=>m.name==='turret'));
    actualWiring(parts,all);
    // Keep every immutable pre-cupola byte, inverting only the independently
    // authenticated later wheel tessellation/link substitution. Physical
    // checks above use the actual current t, not the historical reconstruction.
    const historical=withHistoricalStrv122Wheels(()=>createTank('strv122_x',null,
      {quality,geometryReceipt:true,proceduralOnly:true,batchStatic:false,camoSeed:4242}));
    try{historical.root.updateMatrixWorld(true);nonTarget(historical,quality);}
    finally{historical.dispose();}
  }finally{t.dispose();}
}}finally{for(const m of parts)m.geometry.dispose();material.dispose();}
console.log('strv122XSuppliedCupola: actual high/low source heads, nine radial feet, open band/hatch/sight, positive support and immutable non-target geometry PASS');
