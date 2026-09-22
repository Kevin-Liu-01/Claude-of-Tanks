import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {SECOND_WAVE_X_DONORS} from './sourceXSecondWaveSpecs.ts';
import {applySourceXSovietAuxArmor,SOVIET_AUX_IDS} from './sourceXSovietAuxArmor.ts';
import {traceTank} from '../sim/armor.ts';
import {createShell} from '../sim/ballistics.ts';
import {createCombatState,resolveShellHit} from '../sim/damage.ts';
import {withHistoricalBurlakSideFinish} from './burlakFixedSidePaint.test-support.mjs';
import {historicalT90FittingsBuilder} from './t90FittingsHistory.test-support.mjs';
import {withHistoricalClosedWheelFaces,hasRepairedWheelFaces} from './sourceXWheelFaceHistory.test-support.mjs';
import {FIXED_SOURCE_SKIRTS,withHistoricalFixedSkirtFinish} from './fixedSourceSkirtPaint.test-support.mjs';

// Round 32 (2026-09-21): goldens re-based — each side's end wraps now pivot about its own outer road wheels on staggered rigs (t90ms_x, tos1a_tagil, cv90105_tml_x, cv90_mkiv_x, ztz100_x) and the Jagdpanzer E100 X reuses the dished wheel primitive.
// Captured before auxiliary metadata authoring/wiring, with complete frozen
// post-optics native models. No position/index/normal/UV/instance or scene-node
// transform is excluded. These immutable pre-change hashes are not refreshed.
// 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS! then we can delete any wheels we
// dont use anymore"): every hull below draws the Russia T-90 / T-90M nation construction (T-90M X source-pressed face over
// the fleet pressed disc, nationWheelSets.ts) and the fleet arm seated against it; the annular-tire inverse no longer
// applies to them, so the goldens are repinned from the current build after only the declared finish inverses.
const BEFORE={
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
  t62mv1_x:['47d845aa2a0c77fec4ec5330170e6893bea4a2c12527085922cca80b9db2e528','238b729108e4eae4614778226048e15af72600e5a252c3ff5cf7b2d6898c606a'],
  t72b_1987_x:['ed4a8cf86a78a3f0ce28a45670a2bcd1512a2d7f18995a2074f52aff7bcf04ee','38f936fbaca987bc3918769f50e2469b10f431702c204b1ba7cdfc1982f5ae9f'],
  t80u_x:['87ae1d4c7acc3d44e0ff2ebd86b225ed6cfe1a16c4a89efc33a10e7076a4b42d','38a4263f9a079e0aeec3f8cba434c1cac5035d4d8c387bf3fdd83a3b16b7a8bf'],
  t72b3_x:['8a54a51bb674b77ccfb6d5fd871e81fcaa8b1d23001dc6be936b13b6815b8592','731b086faafc78be4d9f22b4ed27bce810ec858dcbd03db8f0cffa7b56dc8bdc'],
  t72b3m_x:['5ac0d58ebe41e13801ddf2164a05a066ba768eaf68ea60d054afa460472daa4b','534f0211f3222515ec77fbfb35342f636739189728976451c2ac4a3829b66d95'],
  t72bu_x:['305b0a502518e2faae64e7333adc656fca841b9d3ae1d47d843bf143e10281eb','88d89942ca7f3d54cb1d7b1d10f51ea209090008069c0c4d18f89dadab8d81d0'],
  t90_x:['ed620d3bdee13d8b32cca9ef604a6af10ad35d0d4191046811c97d155c03b437','f3d7bc237dac070ade76721dadfc112b1e55f8979a47b6b122494f6ed79cdb54'],
  t90a_burlak_x:['dfdabaa3ed0cc155045885056979f4d1ed8d5a95ea638e349862de8c9c409342','d5a1b36b0bea4cffd50b3b33a05526d67f7fec2558c5b0254d6a0cc452300abb'],
  t90ms_x:['78c13fb6705b07e4d121d647fbef9aceb0009640ab915b91120f334817270a9b','853c5ac6e5045222751832a6006a86fbc62d72af8cb2e4ee62e1020124a72fb0'],
};
const EXPECTED_STATS={t62mv1_x:[8,9,9],t72b_1987_x:[8,8,8],t80u_x:[8,8,8],
  t72b3_x:[8,8,8],t72b3m_x:[8,8,8],t72bu_x:[8,6,6],t90_x:[8,7,7],
  t90a_burlak_x:[8,6,6],t90ms_x:[8,6,6]};
const EMPTY={pos:new THREE.Vector3(),yaw:0,pitch:0,roll:0,turretYaw:0,gunPitch:0};
const vector=p=>new THREE.Vector3(...p);
const owned=p=>p.kind==='spaced'&&!p.era&&(/^skirt(?:_rubber)?_[LR]$/.test(p.name)||p.name==='slat_cage');
const fields=s=>s.armor.hullPlates.filter(owned);
const stats=p=>[p.physicalMm,p.keMm,p.ceMm];

function geometryHash(root){
  const h=createHash('sha256');root.updateMatrixWorld(true);
  root.traverse(m=>{
    h.update(m.name).update(JSON.stringify(m.matrix.elements));if(!m.geometry)return;
    for(const k of Object.keys(m.geometry.attributes).sort()){
      const attribute=m.geometry.attributes[k],a=attribute.array;
      // This new semantic lighting channel is not shape. Keep all 18 literal
      // legacy fingerprints intact and validate the complete channel separately.
      if(k==='nightEmissionMask'){
        assert.ok(a instanceof Uint8Array,'night mask keeps its byte-sized semantic representation');
        assert.equal(attribute.itemSize,1);assert.equal(attribute.normalized,false);
        assert.equal(attribute.count,m.geometry.getAttribute('position').count,'one mask value per original vertex');
        assert.ok(a.every(value=>value===0||value===1||value===2),'only unlit/warm/red aperture values');
        continue;
      }
      h.update(k).update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
    }
    for(const a of [m.geometry.index?.array,m.instanceMatrix?.array])if(a)
      h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));
  });return h.digest('hex');
}

// A malformed semantic channel must fail, not disappear from the shape audit.
{
  const g=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const m=new THREE.Mesh(g),root=new THREE.Group();root.add(m);
  const legacy=geometryHash(root);
  g.setAttribute('nightEmissionMask',new THREE.Uint8BufferAttribute([0,1,2],1));
  assert.equal(geometryHash(root),legacy,'valid metadata leaves every legacy byte unchanged');
  for(const invalid of [new THREE.Float32BufferAttribute([0,1,2],1),
    new THREE.Uint8BufferAttribute([0,1,2],3),new THREE.Uint8BufferAttribute([0,1],1),
    new THREE.Uint8BufferAttribute([0,1,2],1,true),new THREE.Uint8BufferAttribute([0,1,3],1)]){
    g.setAttribute('nightEmissionMask',invalid);assert.throws(()=>geometryHash(root));
  }
  g.setAttribute('nightEmissionMask',new THREE.Uint8BufferAttribute([0,1,2],1));
  g.setAttribute('unrecognizedSemanticChannel',new THREE.Uint8BufferAttribute([0,1,2],1));
  assert.notEqual(geometryHash(root),legacy,'no other attribute is silently excluded');
  g.deleteAttribute('unrecognizedSemanticChannel');g.getAttribute('position').setX(0,.001);
  assert.notEqual(geometryHash(root),legacy,'physical position bytes remain guarded');
  g.dispose();m.material.dispose();
}

function isolated(spec,plates=fields(spec)){
  return {...spec.armor,hullPlates:plates,turretPlates:[],collisionShells:{hull:[],turret:[]},
    modules:[],crew:[],trackShapes:[],gunBarrel:null};
}
function finiteRay(plate){
  const points=plate.verts.map(vector),center=points.reduce((s,p)=>s.add(p),new THREE.Vector3()).multiplyScalar(1/points.length);
  const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
  return {center,normal,points,from:center.clone().addScaledVector(normal,.004),to:center.clone().addScaledVector(normal,-.004)};
}

function assertOutline(p){
  assert.ok(p.convexPolygon&&p.surfaceGroup&&!p.gunFollow&&!p.era);
  assert.ok(p.verts.length>=3&&p.verts.length<=4);assert.ok(p.verts.flat().every(Number.isFinite));
  const {center,normal,points}=finiteRay(p);assert.ok(normal.lengthSq()>.999);
  for(const point of points)assert.ok(Math.abs(point.clone().sub(center).dot(normal))<1e-8,'real planar facet');
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];
    assert.ok(b.clone().sub(a).cross(c.clone().sub(b)).dot(normal)>1e-12,'convex ordered corners, no repeated triangle end');
  }
}

function metadataInvariant(spec){
  const before=structuredClone(spec),keep=spec.armor.hullPlates.filter(p=>!owned(p));
  const turret=spec.armor.turretPlates,era=JSON.stringify(spec.armor.hullPlates.filter(p=>p.era));
  applySourceXSovietAuxArmor(spec,spec.id);
  assert.deepEqual(spec.armor.hullPlates.filter(p=>!owned(p)),keep,'all main/external/ERA rows retained');
  for(let i=0;i<keep.length;i++)assert.equal(spec.armor.hullPlates.filter(p=>!owned(p))[i],keep[i]);
  assert.equal(spec.armor.turretPlates,turret,'turret plate owner untouched');
  assert.equal(JSON.stringify(spec.armor.hullPlates.filter(p=>p.era)),era,'every ERA face untouched');
  before.armor.hullPlates=spec.armor.hullPlates;assert.deepEqual(spec,before,'only selected auxiliary fields change');
  for(const p of fields(spec)){
    assertOutline(p);assert.deepEqual(stats(p),p.name==='slat_cage'?[10,8,8]:EXPECTED_STATS[spec.id]);
  }
  if(spec.id!=='t90ms_x')assert.ok(!fields(spec).some(p=>p.name==='slat_cage'),'no invented rear cage on absent source screen');
  const once=JSON.stringify(fields(spec));applySourceXSovietAuxArmor(spec,spec.id);
  assert.equal(JSON.stringify(fields(spec)),once,'sync is idempotent, not cumulative protection');
}

function nativeFacets(t,spec){
  const meshes=['hullRubber','hullDetail','hullFixedPaintedBodywork',...(spec.id==='t90a_burlak_x'?['hullTrackGuardL','hullTrackGuardR']:[])].map(n=>t.root.getObjectByName(n)).filter(Boolean);
  let count=0;
  for(const p of fields(spec)){
    const r=finiteRay(p);
    for(const point of [r.center,...r.points.map(v=>v.clone().lerp(r.center,.04))]){
      const hit=new THREE.Raycaster(point.clone().addScaledVector(r.normal,.004),r.normal.clone().negate(),0,.008)
        .intersectObjects(meshes,false).find(h=>h.point.distanceTo(point)<.000002);
      assert.ok(hit,`${spec.id}/${p.surfaceGroup}: every facet corner/center is existing native stock ${point.toArray()}`);
    }
    assert.ok(traceTank(r.from,r.to,EMPTY,isolated(spec)).some(h=>h.plate?.surfaceGroup===p.surfaceGroup),
      `${spec.id}/${p.surfaceGroup}: actual finite skin ray receives intended protection`);count++;
  }
  return count;
}

function bilateralGrid(t,spec){
  const meshes=['hullRubber','hullDetail','hullFixedPaintedBodywork',...(spec.id==='t90a_burlak_x'?['hullTrackGuardL','hullTrackGuardR']:[])].map(n=>t.root.getObjectByName(n)).filter(Boolean);
  let positive=0,negative=0;
  for(const side of [-1,1])for(const z of [-2.75,-2.2,-1.5,-.7,0,.6,1.3,2,2.7])for(const y of [.58,.72,.86,1,1.13,1.30]){
    const from=vector([side*2.3,y,z]),to=vector([side*1.5,y,z]);
    const hits=traceTank(from,to,EMPTY,isolated(spec));
    for(const hit of hits){
      const physical=new THREE.Raycaster(hit.point.clone().add(vector([side*.003,0,0])),vector([-side,0,0]),0,.006)
        .intersectObjects(meshes,false).find(h=>h.point.distanceTo(hit.point)<.000002);
      assert.ok(physical,`${spec.id}/${side}/${z}/${y}: no grid field in native air`);positive++;
    }
    if(!hits.length)negative++;
  }
  assert.ok(positive>0&&negative>0,`${spec.id}: bilateral grid exercises stock and air`);
  return{positive,negative};
}

const GAP={t62mv1_x:[.9,-1.24192,1.53],t72b_1987_x:[.68,-2,1.70],t80u_x:[.70,0,1.66],
  t72b3_x:[1.185,0,1.64],t72b3m_x:[1.1,-2.38,1.90],t72bu_x:[1,-1.895,1.70],
  t90_x:[1,.16675,1.65],t90a_burlak_x:[1,-1.0835,1.70],t90ms_x:[1.36,-2.5,1.80]};
function gaps(spec){
  const[y,z,inner]=GAP[spec.id];
  for(const side of [-1,1])assert.equal(traceTank(vector([side*2.3,y,z]),vector([side*inner,y,z]),EMPTY,
    isolated(spec)).length,0,`${spec.id}: real hem/inter-panel/rail gap remains unprotected`);
  if(['t72bu_x','t90_x','t90a_burlak_x','t90ms_x'].includes(spec.id)){
    const ray=[vector([0,.88,-3.40]),vector([0,.88,-3.28])];
    assert.equal(traceTank(...ray,EMPTY,isolated(spec)).length,0,'old rear slat rectangle is not retained in open space');
  }
}

function facetSeam(spec){
  if(spec.id!=='t90_x')return;
  const tris=fields(spec).filter(p=>p.verts.length===3);
  for(let i=1;i<tris.length;i++){
    const a=tris[i-1],b=tris[i];if(a.surfaceGroup!==b.surfaceGroup)continue;
    const shared=a.verts.filter(p=>b.verts.some(q=>JSON.stringify(p)===JSON.stringify(q)));
    if(shared.length!==2)continue;
    const center=vector(shared[0]).add(vector(shared[1])).multiplyScalar(.5),side=Math.sign(center.x);
    const from=center.clone().add(vector([side*.02,0,0])),to=center.clone().add(vector([-side*.02,0,0]));
    assert.equal(traceTank(from,to,EMPTY,isolated(spec,[a,b])).length,1,'one physical warped-sheet diagonal charges once');
    const shifted={...b,verts:b.verts.map(p=>[p[0]-side*.005,p[1],p[2]])};
    assert.equal(traceTank(from,to,EMPTY,isolated(spec,[a,shifted])).length,2,'same group at distinct 5mm depth stays two actual layers');
    return;
  }
  assert.fail('actual warped AW facet seam must be exercised');
}

function liveProtection(spec){
  const projectile={name:'Exact sheet witness',type:'APFSDS',caliberMm:1,pen100Mm:.5,
    pen1000Mm:.5,pen2000Mm:.5,dmg:1,velocityMps:1000,moduleDmg:0,tracer:'APFSDS'};
  for(const side of [-1,1]){
    const p=fields(spec).find(p=>Math.sign(finiteRay(p).center.x)===side);
    const r=finiteRay(p),hits=traceTank(r.from,r.to,EMPTY,spec.armor);
    assert.ok(hits.some(h=>h.plate?.surfaceGroup===p.surfaceGroup),'full actual armor trace reaches the real thin sheet');
    const target={id:'aux-witness',spec,state:{...EMPTY,visualPitch:0,visualRoll:0},combat:createCombatState(spec)};
    const shell=createShell(projectile,'aux-audit',false,r.from,r.normal.clone().negate(),1);
    const event=resolveShellHit(shell,target,hits,()=>.5);
    assert.ok(shell.dead,'insufficient penetration is stopped by actual stock');
    assert.equal(event.physicalMm,p.physicalMm,'event retains exact donor sheet thickness');
    assert.equal(event.zone,p.name,'actual sheet, not a guessed donor ghost, resolves the shot');
    assert.equal(event.damage,0);assert.equal(target.combat.hp,spec.hp);
  }
}

const arg=process.argv.find(a=>a.startsWith('--ids='));
const ids=arg?arg.slice(6).split(','):SOVIET_AUX_IDS;
let facets=0;
for(const id of ids){
  assert.ok(SOVIET_AUX_IDS.includes(id));
  const donor=getSpec(SECOND_WAVE_X_DONORS[id]),original=JSON.stringify(donor);
  const noOp=structuredClone(donor),noOpBefore=JSON.stringify(noOp);applySourceXSovietAuxArmor(noOp,donor.id);
  assert.equal(JSON.stringify(noOp),noOpBefore,'original donor API is exact no-op');
  for(const quality of ['high','low']){
    const spec=structuredClone(getSpec(id));metadataInvariant(spec);
    assert.deepEqual(fields(getSpec(id)),fields(spec),'actual registered API matches exact auxiliary recipes');
    const t=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    try{
      // 2026-09-22: the finish inverses stay declared per hull; the annular-tire inverse only where an opening is still declared.
      const finished=Object.hasOwn(FIXED_SOURCE_SKIRTS,id)||id==='t90a_burlak_x';
      if(hasRepairedWheelFaces(id)||finished){
        const build=()=>createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
        const finish=()=>Object.hasOwn(FIXED_SOURCE_SKIRTS,id)?withHistoricalFixedSkirtFinish(id,build,
          id==='t90_x'?historicalT90FittingsBuilder:undefined):build();
        const inner=()=>id==='t90a_burlak_x'?withHistoricalBurlakSideFinish(build):finish();
        const original=hasRepairedWheelFaces(id)?withHistoricalClosedWheelFaces(id,inner):inner();
        try{assert.equal(geometryHash(original.root),BEFORE[id][quality==='high'?0:1],`${id}/${quality}: complete original hash after only declared tire-opening/finish inverses`);}
        finally{original.dispose();}
      }else assert.equal(geometryHash(t.root),BEFORE[id][quality==='high'?0:1],`${id}/${quality}: every frozen native buffer/transform unchanged`);
      facets+=nativeFacets(t,spec);const grid=bilateralGrid(t,spec);gaps(spec);facetSeam(spec);liveProtection(spec);
      console.log(`sourceXSovietAuxArmor ${id}/${quality}: ${fields(spec).length} real facets, grid ${grid.positive} stock/${grid.negative} air PASS`);
    }finally{t.dispose();}
  }
  assert.equal(JSON.stringify(donor),original,'original donor armor never mutated');
}
console.log(`sourceXSovietAuxArmor: ${ids.length} native models high/low, ${facets} physical facets, exact geometry/ERA preservation PASS`);
