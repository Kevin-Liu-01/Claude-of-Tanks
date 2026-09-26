import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {applySourceXOtherAuxArmor} from './sourceXOtherAuxArmor.ts';
import {assertConvexArmorOutline} from '../sim/armorOutline.test-support.mjs';
import {tankPoseFromState,traceTank} from '../sim/armor.ts';
import {createShell} from '../sim/ballistics.ts';
import {createCombatState,resolveShellHit} from '../sim/damage.ts';
import {withHistoricalFixedGuardPaint} from './historicalFixedGuardPaint.test-support.mjs';
import {withHistoricalClosedWheelFaces} from './sourceXWheelFaceHistory.test-support.mjs';
import {historicalLeclercShoe,withHistoricalLeclercGear} from './leclercGearHistory.test-support.mjs';
import {KIT} from './tankFactoryCore.ts';
import {withHistoricalType10Supports} from './type10SkirtHistory.test-support.mjs';
const DONORS={k1a1_x:'k1a1',amx30_x:'amx30',leclerc_x:'leclerc',leclerc_classic_x:'leclerc',type10_x:'type10',type90_x:'type90',amx40_x:'amx40'};
// 2026-09-12 fleet visual standard: k1a1_x's rubber tire runs in to .2700
// (was the source opening .2971) so the dish's rolled rim no longer shows as
// a pale groove; its complete native fingerprints are repinned from that build.
const BEFORE={
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
// 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS"): amx30_x draws the France AMX-40
// pressed face and leclerc_classic_x the Leclerc XLR stepped plate (nationWheelConstructions.ts); repinned from the
// current build (amx30_x now compares the plain model under the tint inverse, leclerc_classic_x after its gear inverse).
 // 2026-09-22 re-base (owner: "the point of adding holes instead of carving them into the barrel is that we save on triangles"): the fleet fallback mouth is a flat ring + disc (terminal-surface-fit-r3; the separate Annulus mesh is gone and the Rim geometry changed) and the second-wave/Abrams/Leclerc/Strv tubes are closed at their source tips, so the frozen digests below moved. Superseded: 30aa82a9…, eca09834…, ce25b11c…, 5cf7c632…, e7726256…, a0fb4201…, 27509e55…, 97ce7d68…, 69197b36…, 495de4a8…, 3a9f7bca…, 9388e4c4…, 015d5a86…, 45a022cf….
 // 2026-09-25 round 96 (FSP-03 + FSP-05 combined tree on the FSP-06 base): the k1a1_x fingerprints read 56d10896… / 09c4cf22…
 // on the base tree 3db7849c1 itself (FSP-06 c6f306294 made the K1A1 X antenna base insulator dark and e69803182 its folded
 // whip rods, without re-pinning this receipt) — re-pinned once from the current build; neither fleet lane touches k1a1_x.
 'k1a1_x/high':'56d1089692dbf53c20a99f90d9425246ecfc285f8f57282ce796a7ef824d722c',
 'k1a1_x/low':'09c4cf226e7cf9e306eaa3ff33f20969f72a7bc95ae794a4dd4a057d057ff269',
 // round 40 (2026-09-22): re-pinned on the combined tree — the muzzle-recess closures (r40-bores: 15 hulls' lofts end on a cap) and the
 // retired dev hulls / Panther G manifest entry (r40-cleanup) moved the frozen digests below; captured from the current build
 'amx30_x/high':'f8e4252eebac1df91cbbbbfd057cddf4ff8530c886b5d071818a1eecda9c7d1e',
 'amx30_x/low':'501cba67637c0bb7af907146a8f91112ed6d49fa789ef38e2819087303ff8673',
 'leclerc_x/high':'c106a60485a54871b935564f0bdbc6f44b93a0774c5ad21d8c9ffee066b560e9' /* round 35 (2026-09-22): camo UV density is the fleet constant 0.5 rep/m and the first bake reads the pattern stream (camoWorldScale.ts) — uv attributes and material bakes move; positions unchanged */,
 'leclerc_x/low':'31e260ab2fbd2826507803f76872a8fb50b5bc98af17487ba8c33a983bfc6d52',
 'leclerc_classic_x/high':'2fcfa0d688f1ef903e0bc0b19ce5753999058d013a3feb456799fc84b28917e4',
 'leclerc_classic_x/low':'4334c748e0a3cb8363ed6d6e8eeb5c0736c467cbb37440e92139e67ca44766fa',
 'type10_x/high':'4bce8096d5f075a1c3c2b730e37fed588eb12d8d46a6f337b30c977967910bdb',
 'type10_x/low':'27bce6ac7d0a8488ee5a7151a68c1f175e757f81dda5b9b67010ee85bf732bf9',
 'type90_x/high':'49d70dd6a258dc01f799136010b64fc356ed0e2679077b06ca94ebe9ff1f0bd4',
 'type90_x/low':'14cb55951f5f5d3bf6917dc1e946412c8afe7ada12d513dcfa101cb04f30411d',
 // 2026-09-12 (evening): AMX-40 X .024 band + botY .050 contact fix; native fingerprints repinned.
 'amx40_x/high':'aeacabece1cf8cc9ab96c90e923e37b23950de9fc7d9ff5dd52810fff9265b11',
 'amx40_x/low':'863ca7c722b7f9f52bbbdf4d890633cdb1f5de712709c90f3a79e043f8229110',
};
const pose=tankPoseFromState({pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0});
const near=(a,b,t,label)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=t,`${label}: ${a} vs ${b} ±${t}`);
const vec=p=>new THREE.Vector3(...p);
function shapeHash(root){
  const h=crypto.createHash('sha256');root.traverse(m=>{if(!m.isMesh)return;
    h.update(m.name).update(m.parent?.name??'').update(JSON.stringify(m.matrixWorld.elements));
    for(const key of Object.keys(m.geometry.attributes).sort()){
      const a=m.geometry.attributes[key];
      // Lighting adds a semantic channel, not shape. Keep every original
      // fingerprint unchanged while validating this one new channel separately.
      if(key==='nightEmissionMask'){
        assert.ok(a.array instanceof Uint8Array,'night mask keeps its byte-sized semantic representation');
        assert.equal(a.itemSize,1);assert.equal(a.normalized,false);
        assert.equal(a.count,m.geometry.getAttribute('position').count,'one mask value per original vertex');
        assert.ok(a.array.every(value=>value===0||value===1||value===2),'only unlit/warm/red aperture values');
        continue;
      }
      h.update(key).update(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength));
    }
    if(m.geometry.index){const a=m.geometry.index.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
    if(m.isInstancedMesh){const a=m.instanceMatrix.array;h.update(Buffer.from(a.buffer,a.byteOffset,a.byteLength));}
    h.update(JSON.stringify((Array.isArray(m.material)?m.material:[m.material]).map(a=>[a.name,a.color?.getHex(),a.side])));
  });return h.digest('hex');
}
// Only a valid new lighting channel is decomposed out of the legacy hash.
{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
  const mesh=new THREE.Mesh(geometry),legacy=shapeHash(mesh);
  geometry.setAttribute('nightEmissionMask',new THREE.Uint8BufferAttribute([0,1,2],1));
  assert.equal(shapeHash(mesh),legacy);
  for(const invalid of [new THREE.Float32BufferAttribute([0,1,2],1),
    new THREE.Uint8BufferAttribute([0,1,2],3),new THREE.Uint8BufferAttribute([0,1],1),
    new THREE.Uint8BufferAttribute([0,1,2],1,true),new THREE.Uint8BufferAttribute([0,1,3],1)]){
    geometry.setAttribute('nightEmissionMask',invalid);assert.throws(()=>shapeHash(mesh));
  }
  geometry.setAttribute('nightEmissionMask',new THREE.Uint8BufferAttribute([0,1,2],1));
  geometry.setAttribute('unrecognizedSemanticChannel',new THREE.Uint8BufferAttribute([0,1,2],1));
  assert.notEqual(shapeHash(mesh),legacy,'unknown attributes are never silently ignored');
  geometry.deleteAttribute('unrecognizedSemanticChannel');geometry.getAttribute('position').setX(0,.001);
  assert.notEqual(shapeHash(mesh),legacy,'physical vertex bytes remain guarded');
  geometry.dispose();mesh.material.dispose();
}
// The shoe-shader repair removes the old second dark multiplier. All fourteen
// historical builds below recover their existing complete digest by restoring
// only this one material tint; geometry, ownership and instance bytes remain
// covered. Actual surface/ballistics tests always use the restored white base.
const TRACK_TINT_IDS=new Set(['k1a1_x','amx30_x','leclerc_x','leclerc_classic_x',
  'type10_x','type90_x','amx40_x']);
const SHOE_NAMES=['gearTrackPads','gearTrackPadsSimplified'];
function trackPaletteMaterial(id,root){
  assert.ok(TRACK_TINT_IDS.has(id),'historical track tint requires an independently verified tank');
  const shoes=[];
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if(SHOE_NAMES.includes(mesh.name))shoes.push(mesh);
    for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
      if(material.userData.appearanceColorSource==='instance-palette')
        assert.ok(SHOE_NAMES.includes(mesh.name),'only canonical shoes may use the instance-palette material');
    }
  });
  assert.deepEqual(shoes.map(mesh=>mesh.name).sort(),[...SHOE_NAMES].sort(),
    'both canonical shoe meshes appear exactly once');
  const material=shoes[0].material;
  assert.ok(!Array.isArray(material),'canonical shoes use one material');
  assert.equal(material.name,'cot:track-pad');
  assert.equal(material.userData.appearanceRole,'trackPad');
  assert.equal(material.userData.appearanceColorSource,'instance-palette');
  assert.deepEqual(material.color.toArray(),[1,1,1],'actual shoe base must remain exactly white');
  assert.equal(material.vertexColors,false,'missing vertex colors must not blacken instance-colored shoes');
  for(const mesh of shoes){
    assert.equal(mesh.material,material,'near and far shoes share their actual material');
    assert.equal(mesh.isInstancedMesh,true);
    assert.ok(mesh.count>0&&mesh.instanceColor?.count>=mesh.count,'every shoe has an instance palette entry');
    assert.equal(mesh.geometry.getAttribute('color'),undefined,'shoe stock has no vertex-color multiplier');
  }
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if((Array.isArray(mesh.material)?mesh.material:[mesh.material]).includes(material))
      assert.ok(shoes.includes(mesh),'only canonical shoes may share the historical tint material');
  });
  return material;
}
function withHistoricalTrackTint(id,root,compare){
  const material=trackPaletteMaterial(id,root),actual=shapeHash(root),color=material.color.clone();
  try{
    material.color.setHex(0x30312f);
    return compare(shapeHash(root));
  }finally{
    material.color.copy(color);
    assert.equal(shapeHash(root),actual,'historical comparison restores the complete actual candidate fingerprint');
  }
}
function plateHits(armor,point,side,reach=.05){
  const from=point.clone().add(new THREE.Vector3(side*reach,0,0));
  const to=point.clone().add(new THREE.Vector3(-side*.01,0,0));
  return traceTank(from,to,pose,armor).filter(h=>h.kind==='plate'&&h.plate.kind==='spaced');
}
function preservation(id,donor){
  const original=getSpec(donor),bytes=JSON.stringify(original),copy=structuredClone(original);
  const keep=copy.armor.hullPlates.filter(p=>p.kind!=='spaced'||!/^skirt_[RL]$/.test(p.name));
  const turret=copy.armor.turretPlates,originalPlateArray=original.armor.hullPlates;
  applySourceXOtherAuxArmor(copy,id);
  for(const p of keep)assert.ok(copy.armor.hullPlates.includes(p),'non-target hull plate identity');
  assert.equal(copy.armor.turretPlates,turret,'turret/ERA/weapon metadata untouched');
  const once=JSON.stringify(copy),onceArray=copy.armor.hullPlates;
  applySourceXOtherAuxArmor(copy,id);
  assert.equal(copy.armor.hullPlates,onceArray,'repeat application preserves the actual plate array');
  assert.equal(JSON.stringify(copy),once,'repeat application neither duplicates nor drops replacement faces');
  const registered=structuredClone(getSpec(id)),registeredBytes=JSON.stringify(registered);
  applySourceXOtherAuxArmor(registered,id);
  assert.equal(JSON.stringify(registered),registeredBytes,'registered startup already has the final one-call replacement');
  applySourceXOtherAuxArmor(original,donor);
  assert.equal(original.armor.hullPlates,originalPlateArray,'original production helper no-op');
  assert.equal(JSON.stringify(original),bytes,'original complete spec immutable');
}
function facets(id,spec,meshes){
  const plates=spec.armor.hullPlates.filter(p=>p.name.includes('_source_'));
  if(['k1a1_x','amx30_x'].includes(id)){assert.equal(plates.length,0);return;}
  assert.ok(plates.length>0,'actual factory spec is wired');
  let maximumError=0;
  for(const p of plates){
    try{assertConvexArmorOutline(p.verts,`${id}/${p.name}`,p.openEdges);}
    catch(error){console.log(JSON.stringify({id,name:p.name,verts:p.verts,openEdges:p.openEdges}));throw error;}
    const point=p.verts.map(vec).reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/p.verts.length),side=Math.sign(point.x);
    const from=point.clone().add(new THREE.Vector3(side*.20,0,0));
    const nativeHits=new THREE.Raycaster(from,new THREE.Vector3(-side,0,0),0,.23).intersectObjects(meshes,false);
    // Fascia sits behind separate unarmored U straps. Verify the outward
    // physical sheet at its own depth, not an unrelated protruding fastener.
    const native=id==='type10_x'?nativeHits.find(h=>Math.abs(h.point.x-point.x)<=.003
      &&h.face.normal.clone().transformDirection(h.object.matrixWorld).x*side>.5):nativeHits[0];
    assert.ok(native,`${id}/${p.name} faces real installed armor`);
    const error=Math.abs(native.point.x-point.x);maximumError=Math.max(maximumError,error);
    near(native.point.x,point.x,id==='type10_x'?.003:.00015,`${id}/${p.name} actual physical outer face`);
    const hits=plateHits(spec.armor,point,side);
    assert.equal(hits.length,1,`${id}/${p.name} one physical protection layer at facet center`);
    const template=getSpec(DONORS[id]).armor.hullPlates.find(t=>t.name===`skirt_${side<0?'L':'R'}`);
    assert.deepEqual([p.physicalMm,p.keMm,p.ceMm],[template.physicalMm,template.keMm,template.ceMm],'unchanged donor protection family');
  }
  console.log(`${id}: ${plates.length} actual auxiliary faces, maximum transverse surface error ${maximumError}`);
}
function seams(id,spec){
  const edges=new Map();let count=0;
  for(const p of spec.armor.hullPlates.filter(p=>p.surfaceGroup))for(let i=0;i<p.verts.length;i++){
    const a=p.verts[i],b=p.verts[(i+1)%p.verts.length];
    const key=`${p.surfaceGroup}:`+[a,b].map(v=>v.map(n=>n.toFixed(8)).join(',')).sort().join('|');
    if(edges.has(key)){
      const pt=vec(a).add(vec(b)).multiplyScalar(.5),hits=plateHits(spec.armor,pt,Math.sign(pt.x));
      assert.equal(hits.filter(h=>h.plate.surfaceGroup===p.surfaceGroup).length,1,`${id} exact shared-edge contact charges once`);count++;
    }else edges.set(key,p);
  }
  return count;
}
function openBoundaries(id,spec){
  let count=0;
  for(const p of spec.armor.hullPlates)for(const i of p.openEdges??[]){
    assert.ok(Number.isInteger(i)&&i>=0&&i<p.verts.length,'actual open edge is a valid final boundary index');
    const point=vec(p.verts[i]).add(vec(p.verts[(i+1)%p.verts.length])).multiplyScalar(.5);
    const hits=plateHits(spec.armor,point,Math.sign(point.x),.18);
    assert.equal(hits.length,1,`${id}: covered exact edge is owned once by actual outward stock`);
    assert.notEqual(hits[0].plate,p,'strictly covered backing boundary cannot ghost-hit');count++;
  }
  return count;
}
function actualProtection(spec){
  const projectile={name:'Actual source skirt',type:'APFSDS',caliberMm:1,pen100Mm:.5,
    pen1000Mm:.5,pen2000Mm:.5,dmg:1,velocityMps:1000,moduleDmg:0,tracer:'APFSDS'};
  for(const side of[-1,1]){
    const plate=spec.armor.hullPlates.find(p=>p.name.includes('_source_')&&Math.sign(p.verts[0][0])===side);
    if(!plate)continue;
    const point=plate.verts.map(vec).reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/plate.verts.length);
    const direction=new THREE.Vector3(-side,0,0),from=point.clone().addScaledVector(direction,-.05);
    const hits=traceTank(from,point.clone().addScaledVector(direction,.01),pose,spec.armor);
    const target={id:'source-skirt-witness',spec,state:{...pose,visualPitch:0,visualRoll:0},combat:createCombatState(spec)};
    const shell=createShell(projectile,'source-skirt-audit',false,from,direction,1);
    const event=resolveShellHit(shell,target,hits,()=>.5);
    assert.ok(shell.dead,'actual source skirt stops insufficient penetration');
    assert.equal(event.zone,plate.name,'actual replacement, not inherited donor ghost, receives the hit');
    assert.equal(event.physicalMm,plate.physicalMm,'actual damage event keeps donor protection');
    assert.equal(event.damage,0);assert.equal(target.combat.hp,spec.hp);
  }
}
const GHOSTS={k1a1_x:[1.746005,.7272969,0],amx30_x:[1.570467,.706122,-.078675],
  leclerc_x:[1.82,.794545,-.089129],leclerc_classic_x:[1.82,.828757,-.092991],
  type10_x:[1.713668,.664817,0],type90_x:[1.829209,.738238,0],amx40_x:[1.67925,.98,-2.7]};
function air(id,spec){
  for(const side of[-1,1]){
    const p=[...GHOSTS[id]];p[0]*=side;
    assert.equal(plateHits(spec.armor,vec(p),side,.01).length,0,`${id}: former donor ghost point has no spaced protection`);
  }
  if(id==='type90_x')for(const side of[-1,1])for(const z of[-1.60,-.56,.49,1.55,2.57])
    assert.equal(plateHits(spec.armor,new THREE.Vector3(side*1.786824,.90,z),side).length,0,'real 14mm inter-panel slit stays open');
  if(id==='leclerc_x'||id==='leclerc_classic_x')for(const side of[-1,1]){
    const z=id==='leclerc_x'?1.936:2.02;
    assert.equal(plateHits(spec.armor,new THREE.Vector3(side*1.8,1.20,z),side).length,0,'true separated front-block gap stays open');
  }
}
function type10HeldOut(spec,meshes){
  const spans=[[-2.4732,-1.4735],[-1.4782,-.2190],[-.2167,1.0250],
    [1.0285,2.2909648],[2.2940,3.1363]];
  let maximum=0,count=0,worst;
  for(const side of[-1,1])for(const[p,[a,b]]of spans.entries())for(let i=0;i<29;i++){
    const z=a+(b-a)*(i+.371)/29,base=.390227+.0100435*z;
    const floor=p===0?Math.max(base,-.5886852-.438727*z):p===4?Math.max(base,.4254067+.554724*(z-2.9)):base;
    const top=.783621+.0100435*z;
    for(const t of[.09,.21,.36,.49,.62,.77,.91,.975]){
      const y=floor+(top-floor)*t,point=new THREE.Vector3(side*1.75,y,z);
      const physical=new THREE.Raycaster(point,new THREE.Vector3(-side,0,0),0,.22).intersectObjects(meshes,false)[0];
      assert.ok(physical,'independent panel station is installed source-shaped stock');
      const hits=plateHits(spec.armor,new THREE.Vector3(side*1.57,y,z),side,.18);
      assert.equal(hits.length,1,'independent panel station is covered once, including overlapping lower sheets/fascia');
      const hit=hits[0],x=hit.point?.x??hit.pos?.x;
      assert.ok(Number.isFinite(x),'trace result has actual physical contact position');
      const error=Math.abs(physical.point.x-x);
      if(error>maximum){maximum=error;worst={side,p,z,y,t,native:physical.point.x,metadata:x};}count++;
    }
  }
  console.log(`Type10 independent worst witness ${JSON.stringify({maximum,worst})}`);
  near(maximum,0,.003,`independent non-vertex Type10 native transverse surface: ${JSON.stringify(worst)}`);
  for(const side of[-1,1]){
    for(const z of[-2.4,-1.475,-1.2,-.28,0,.9,1.1,2.2,2.6,3.0])for(const y of[.7593,.765,.78,.8,.94,1.11]){
      const hits=plateHits(spec.armor,new THREE.Vector3(side*1.57,y,z),side,.18);
      assert.equal(hits.length,1,`fascia/nested skirt overlap ${JSON.stringify({side,z,y,hits:hits.map(h=>[h.point.x,h.plate.name])})}`);
    }
    for(const[z,y]of[[-.21785,.5],[1.02675,.5],[2.2925,.6],[-1.0,.35],[1.0,1.23]])
      assert.equal(plateHits(spec.armor,new THREE.Vector3(side*1.57,y,z),side,.18).length,0,'true lower-panel gaps/floor/top air has no replacement hit');
  }
  console.log(`Type10 independent held-outs: ${count} actual native rays, maximum error ${maximum}m; fascia/depth single billing and source air PASS`);
}
const selected=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',');
{
  const parameters={trackW:.636079,pitch:.15,pinCapOuter:.3180395,radialScale:1,widthScale:1,
    pattern:{surface:'rubber-block',padHeight:.027,grouserHeight:.013,padCoverage:.8,
      shoulderHeight:.01,webHeight:.026,webDepth:.8,hornHeight:.081,
      pinStyle:'end-caps',pinRadius:.0222443,pinCentreY:-.0051314},
    section:{padWidthM:.5253277,pinCapLengthM:.0404054,pinHalfSpacingM:.0388075,
      connectorInnerM:.2577995,connectorOuterM:.3099674,connectorHeightM:.035629,
      connectorDepthM:.0985811,connectorCentreYDeltaM:-.0005601}};
  const dispose=THREE.BufferGeometry.prototype.dispose,farShoe=KIT.simplifiedTrackShoeGeometry;
  const events=new Map();
  THREE.BufferGeometry.prototype.dispose=function(){events.set(this,(events.get(this)??0)+1);return dispose.call(this);};
  try{
    for(const far of[false,true]){
      const restored=historicalLeclercShoe({...parameters,far});
      assert.equal(events.has(restored),false,'returned geometry stays caller-owned');restored.dispose();
    }
    KIT.simplifiedTrackShoeGeometry=(...args)=>{
      const geometry=farShoe(...args),position=geometry.getAttribute('position');
      position.setX(position.count-1,position.getX(position.count-1)+.001);return geometry;
    };
    assert.throws(()=>historicalLeclercShoe({...parameters,far:true}),/exact four eight-sided pin buffers/,
      'unrelated pin changes cannot be silently replaced with historical stock');
    assert.ok(events.size>20,'success and rejected native streams exercise real ownership');
    for(const count of events.values())assert.equal(count,1,'one disposal event per owned intermediate');
  }finally{THREE.BufferGeometry.prototype.dispose=dispose;KIT.simplifiedTrackShoeGeometry=farShoe;}
}
// Fail closed on an undeclared caller, opt-in, custom primitive or missing
// native call. Throwing comparisons must restore the shared factory hook.
{
  const original=KIT.buildRunningGear;
  assert.throws(()=>withHistoricalClosedWheelFaces('not-a-repaired-tank',()=>{}));
  assert.throws(()=>withHistoricalLeclercGear('amx30_x',()=>{}));
  // 2026-09-22: the T-90SM X is the only hull still declaring an annular opening (nation wheel standard).
  assert.throws(()=>withHistoricalClosedWheelFaces('t90sm_x',()=>KIT.buildRunningGear(
    {spec:{id:'t90sm_x'}},{wheelTireInnerRadiusM:.343})),/exact declared annular repair/);
  assert.throws(()=>withHistoricalLeclercGear('leclerc_x',()=>KIT.buildRunningGear(
    {spec:{id:'amx30_x'}},{})),/cannot affect another tank/);
  assert.throws(()=>withHistoricalLeclercGear('leclerc_x',()=>KIT.buildRunningGear(
    {spec:{id:'leclerc_x'}},{trackShoeBuilder:()=>{}})),/custom shoe/);
  let disposed=0;
  assert.throws(()=>withHistoricalLeclercGear('leclerc_x',()=>({dispose(){disposed++;}})));
  assert.equal(disposed,1,'failed native-call ownership witness disposes its returned tank');
  assert.equal(KIT.buildRunningGear,original,'every negative case restores the native factory');
}
for(const[id,donor]of Object.entries(DONORS).filter(([id])=>!selected||selected.includes(id))){
  preservation(id,donor);
  for(const quality of['high','low']){
    const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
    try{
      tank.root.updateMatrixWorld(true);
      const shoeMaterial=trackPaletteMaterial(id,tank.root);
      if(id==='k1a1_x'&&quality==='high'){
        const actual=shapeHash(tank.root),color=shoeMaterial.color.clone();
        try{
          shoeMaterial.color.setHex(0x30312f);
          assert.throws(()=>withHistoricalTrackTint(id,tank.root,()=>assert.fail('must reject before comparison')),
            /actual shoe base must remain exactly white/,'an unexpected tint cannot be waived by the historical inverse');
        }finally{shoeMaterial.color.copy(color);}
        const unrelated=new THREE.Mesh(tank.root.getObjectByName('gearTrackPads').geometry,shoeMaterial);
        unrelated.name='unrelated-shared-material';tank.root.add(unrelated);
        try{
          assert.throws(()=>withHistoricalTrackTint(id,tank.root,()=>assert.fail('must reject unrelated material users')),
            /only canonical shoes/);
        }finally{tank.root.remove(unrelated);}
        const failure=new Error('comparison rejected');
        assert.throws(()=>withHistoricalTrackTint(id,tank.root,()=>{throw failure;}),error=>error===failure);
        assert.equal(shapeHash(tank.root),actual,'negative and throwing comparisons leave the actual tank unchanged');
      }
      const paintedId=['leclerc_x','amx40_x','type10_x'].includes(id);
      // 2026-09-22 nation wheel standard: amx30_x draws the France AMX-40 pressed face (no annular inverse any more).
      const repairedGear=['leclerc_x','leclerc_classic_x'].includes(id);
      if(paintedId||repairedGear){
        const native=()=>createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242});
        const finish=()=>paintedId?withHistoricalFixedGuardPaint(id,native):native();
        const original=id.startsWith('leclerc')?withHistoricalLeclercGear(id,finish)
          :id==='type10_x'?withHistoricalType10Supports(finish):finish();
        try{
          original.root.updateMatrixWorld(true);
          withHistoricalTrackTint(id,original.root,hash=>assert.equal(hash,BEFORE[`${id}/${quality}`],
            `${id}/${quality}: original full native fingerprint after only exact declared finish/primitive/tint inverses`));
        }finally{original.dispose();}
        withHistoricalTrackTint(id,tank.root,hash=>assert.notEqual(hash,BEFORE[`${id}/${quality}`],
          'real repaired geometry must still differ after only the historical tint is restored'));
        if(paintedId){
        const painted=tank.root.getObjectByName('hullPaintedDetail');
        // This legacy fingerprint uses geometry-only receipt materials. The
        // rendered texture/name/UV contract is checked by registeredGuardPaint.
        assert.equal(painted?.material,tank.root.getObjectByName('hull').material);
        assert.equal(painted?.userData.combatHitboxRole,'nonArmor');
        assert.equal(painted?.userData.materialOnlyPaintSourceBucket,'hullDetail');
        }
      }else withHistoricalTrackTint(id,tank.root,hash=>assert.equal(hash,BEFORE[`${id}/${quality}`],
        'complete native geometry/material/instance/owner fingerprint unchanged except verified track base tint'));
      // All surface, air, seam and projectile checks below still use the
      // actual painted model, never the historical comparison construction.
      const meshes=[];tank.root.traverse(m=>{if(m.isMesh&&!m.userData.shadowOnly&&!m.userData.vehicleMarking)meshes.push(m);});
      const spec=getSpec(id);facets(id,spec,meshes);air(id,spec);const count=seams(id,spec);
      const halfOpen=openBoundaries(id,spec);
      if(id==='type10_x')type10HeldOut(spec,meshes);
      actualProtection(spec);
      console.log(`sourceXOtherAuxArmor: ${id}/${quality} physical panels, air, donor values, ${count} seams/${halfOpen} owned edges and authenticated native mesh PASS`);
    }finally{tank.dispose();}
  }
}
