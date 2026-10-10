import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {applySourceXOtherAuxArmor} from './sourceXOtherAuxArmor.ts';
import {AMX56_KIT_SURFACE_GROUP} from './leclercClassicXKitArmor.ts';
import {assertConvexArmorOutline} from '../sim/armorOutline.test-support.mjs';
import {tankPoseFromState,traceTank} from '../sim/armor.ts';
import {createShell} from '../sim/ballistics.ts';
import {createCombatState,resolveShellHit} from '../sim/damage.ts';
import { near } from '../../tools/receipt-kit.test-support.mjs';
import { fieldKitCensus, fieldKitFilter } from './fieldKitSurface.test-support.mjs';
const DONORS={k1a1_x:'k1a1',amx30_x:'amx30',leclerc_x:'leclerc',leclerc_classic_x:'leclerc',type10_x:'type10',type90_x:'type90',amx40_x:'amx40'};
// 2026-10-01 (owner: retire frozen pins): the fourteen pinned whole-model digests, the historical
// finish/gear/tint inverses that reached them and their oracle-only negative controls are gone; the
// fleet geometry ledger owns whole-tank change detection. Every check below runs on the actual model.
const pose=tankPoseFromState({pos:new THREE.Vector3(),yaw:0,visualPitch:0,visualRoll:0,turretYaw:0,gunPitch:0});
const vec=p=>new THREE.Vector3(...p);
// Lighting adds a semantic byte channel; a malformed mask must still fail.
function assertNightMasks(root){
  root.traverse(m=>{if(!m.isMesh)return;const a=m.geometry.getAttribute('nightEmissionMask');if(!a)return;
    assert.ok(a.array instanceof Uint8Array,'night mask keeps its byte-sized semantic representation');
    assert.equal(a.itemSize,1);assert.equal(a.normalized,false);
    assert.equal(a.count,m.geometry.getAttribute('position').count,'one mask value per original vertex');
    assert.ok(a.array.every(value=>value===0||value===1||value===2),'only unlit/warm/red aperture values');
  });
}
// Canonical shoes take their colour from the instance palette over an exactly
// white base, times their own worn-steel vertex colours; a second dark multiplier
// or a stream without the colours would blacken them. Actual surface/ballistics
// tests always use this white base.
const SHOE_NAMES=['gearTrackPads','gearTrackPadsSimplified'];
function trackShoeMaterial(root){
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
  // Fleet lane round 1 (2026-10-07): the shoes read worn-steel vertex colours under the palette (bakeTrackShoeWear);
  // both streams must carry them or the palette would multiply by black.
  assert.equal(material.vertexColors,true,'canonical shoes read their worn-steel vertex colours');
  for(const mesh of shoes)assert.ok(mesh.geometry.getAttribute('color')?.count===mesh.geometry.getAttribute('position').count,
    `${mesh.name} carries its worn-steel vertex colours`);
  for(const mesh of shoes){
    assert.equal(mesh.material,material,'near and far shoes share their actual material');
    assert.equal(mesh.isInstancedMesh,true);
    assert.ok(mesh.count>0&&mesh.instanceColor?.count>=mesh.count,'every shoe has an instance palette entry');
    assert.equal(mesh.geometry.getAttribute('color')?.count,mesh.geometry.getAttribute('position').count,
      'shoe stock carries exactly one worn-steel colour per vertex');
  }
  root.traverse(mesh=>{
    if(!mesh.isMesh)return;
    if((Array.isArray(mesh.material)?mesh.material:[mesh.material]).includes(material))
      assert.ok(shoes.includes(mesh),'only canonical shoes may share the track-pad material');
  });
  return material;
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
// Field kit (main 5f8eefaa4: Leclerc X screens, pads and ghillie) hangs outside the source skirts; the physical
// outer face is the first source surface behind it (fieldKitSurface.test-support.mjs).
let kit;
function facets(id,spec,meshes){
  const plates=spec.armor.hullPlates.filter(p=>p.name.includes('_source_'));
  if(['k1a1_x','amx30_x'].includes(id)){assert.equal(plates.length,0);return;}
  assert.ok(plates.length>0,'actual factory spec is wired');
  let maximumError=0;const kitCovered={[-1]:0,[1]:0};
  for(const p of plates){
    try{assertConvexArmorOutline(p.verts,`${id}/${p.name}`,p.openEdges);}
    catch(error){console.log(JSON.stringify({id,name:p.name,verts:p.verts,openEdges:p.openEdges}));throw error;}
    const point=p.verts.map(vec).reduce((a,b)=>a.add(b),new THREE.Vector3()).multiplyScalar(1/p.verts.length),side=Math.sign(point.x);
    const from=point.clone().add(new THREE.Vector3(side*.20,0,0));
    const nativeHits=kit.hits(new THREE.Raycaster(from,new THREE.Vector3(-side,0,0),0,.23),meshes);
    // Fascia sits behind separate unarmored U straps. Verify the outward
    // physical sheet at its own depth, not an unrelated protruding fastener.
    let native=id==='type10_x'?nativeHits.find(h=>Math.abs(h.point.x-point.x)<=.003
      &&h.face.normal.clone().transformDirection(h.object.matrixWorld).x*side>.5):nativeHits[0];
    // 2026-10-02: the owner's AMX 56 field kit (6e8c2fbd3) mounts thick folded side modules outside the
    // retained source skirt. Where one covers a source face, the outermost stock is that module and must carry
    // its own spaced kit plate (leclercClassicXKitArmor.ts); the source face is then witnessed at its own depth.
    if(id==='leclerc_classic_x'&&native&&Math.abs(native.point.x-point.x)>.00015){
      assert.equal(native.object.name,'hullExternalArmor',`${id}/${p.name}: the covering stock is the installed field-kit module`);
      const kit=traceTank(native.point.clone().add(new THREE.Vector3(side*.01,0,0)),
        native.point.clone().add(new THREE.Vector3(-side*.01,0,0)),pose,spec.armor)
        .filter(h=>h.kind==='plate'&&h.plate.surfaceGroup===`${AMX56_KIT_SURFACE_GROUP}:${side}`);
      assert.equal(kit.length,1,`${id}/${p.name}: the covering module carries one spaced kit plate`);
      near(kit[0].point?.x??kit[0].pos?.x,native.point.x,.00015,`${id}/${p.name}: the kit plate lies on the module's outer face`);
      kitCovered[side]++;
      native=nativeHits.find(h=>Math.abs(h.point.x-point.x)<=.00015);
    }
    assert.ok(native,`${id}/${p.name} faces real installed armor`);
    const error=Math.abs(native.point.x-point.x);maximumError=Math.max(maximumError,error);
    near(native.point.x,point.x,id==='type10_x'?.003:.00015,`${id}/${p.name} actual physical outer face`);
    const hits=plateHits(spec.armor,point,side);
    assert.equal(hits.length,1,`${id}/${p.name} one physical protection layer at facet center`);
    const template=getSpec(DONORS[id]).armor.hullPlates.find(t=>t.name===`skirt_${side<0?'L':'R'}`);
    assert.deepEqual([p.physicalMm,p.keMm,p.ceMm],[template.physicalMm,template.keMm,template.ceMm],'unchanged donor protection family');
  }
  if(id==='leclerc_classic_x')assert.ok(kitCovered[-1]>0&&kitCovered[1]>0,
    `${id}: both field-kit modules cover source faces with their own plates (${JSON.stringify(kitCovered)})`);
  console.log(`${id}: ${plates.length} actual auxiliary faces, maximum transverse surface error ${maximumError}${id==='leclerc_classic_x'?`, ${kitCovered[-1]}+${kitCovered[1]} under the field kit`:''}`);
}
function seams(id,spec){
  const edges=new Map();let count=0;
  // The AMX 56 field-kit plates are not source faces; profiles/leclercClassicX.selftest.mjs owns their seams.
  for(const p of spec.armor.hullPlates.filter(p=>p.surfaceGroup&&!p.surfaceGroup.startsWith(`${AMX56_KIT_SURFACE_GROUP}:`)))for(let i=0;i<p.verts.length;i++){
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
for(const[id,donor]of Object.entries(DONORS).filter(([id])=>!selected||selected.includes(id))){
  preservation(id,donor);
  for(const quality of['high','low']){
    const census=fieldKitCensus();
    const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,batchStatic:false,camoSeed:4242,partCensus:census.partCensus});
    kit=fieldKitFilter(tank.root,census);
    try{
      tank.root.updateMatrixWorld(true);
      const shoeMaterial=trackShoeMaterial(tank.root);
      assertNightMasks(tank.root);
      if(id==='k1a1_x'&&quality==='high'){
        // Negative controls: the shoe-material gate rejects a dark base and an unrelated material user.
        const color=shoeMaterial.color.clone();
        try{
          shoeMaterial.color.setHex(0x30312f);
          assert.throws(()=>trackShoeMaterial(tank.root),/actual shoe base must remain exactly white/,
            'a tinted shoe base fails the white-base contract');
        }finally{shoeMaterial.color.copy(color);}
        const unrelated=new THREE.Mesh(tank.root.getObjectByName('gearTrackPads').geometry,shoeMaterial);
        unrelated.name='unrelated-shared-material';tank.root.add(unrelated);
        try{assert.throws(()=>trackShoeMaterial(tank.root),/only canonical shoes/);}
        finally{tank.root.remove(unrelated);}
        assert.equal(trackShoeMaterial(tank.root),shoeMaterial,'negative controls leave the actual shoe material intact');
      }
      if(['leclerc_x','amx40_x','type10_x'].includes(id)){
        const painted=tank.root.getObjectByName('hullPaintedDetail');
        // The rendered texture/name/UV contract is checked by registeredGuardPaint.
        assert.equal(painted?.material,tank.root.getObjectByName('hull').material);
        assert.equal(painted?.userData.combatHitboxRole,'nonArmor');
        assert.equal(painted?.userData.materialOnlyPaintSourceBucket,'hullDetail');
      }
      const meshes=[];tank.root.traverse(m=>{if(m.isMesh&&!m.userData.shadowOnly&&!m.userData.vehicleMarking)meshes.push(m);});
      const spec=getSpec(id);facets(id,spec,meshes);air(id,spec);const count=seams(id,spec);
      const halfOpen=openBoundaries(id,spec);
      if(id==='type10_x')type10HeldOut(spec,meshes);
      actualProtection(spec);
      console.log(`sourceXOtherAuxArmor: ${id}/${quality} physical panels, air, donor values, ${count} seams/${halfOpen} owned edges, shoe material and night masks PASS`);
    }finally{tank.dispose();kit.dispose();}
  }
}
