import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { MeshStandardMaterial, Texture, Group, Mesh, PlaneGeometry, BufferGeometry, BufferAttribute } from 'three';
import { bindAutumnHorizonGround } from './horizonAutumnGround.ts';
import { HORIZON_SEGMENTS, buildHorizonRing, buildHorizonRingSteps, sampleHorizonGeometry } from './maps/horizon.ts';
import { Material } from 'three';
import { continueHorizonFold, refineHorizonGroundSeam } from './horizonSeam.ts';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { registerRetainedObject3DResources, releaseObject3DGpuResources, disposeObject3DResources } from '../engine/resourceLifetime.ts';
const previousDocument=globalThis.document;
{
 const g=new BufferGeometry();
 g.setAttribute('position',new BufferAttribute(new Float32Array([511.5,0,0,512,0,0,512.5,0,0,552,0,0,592,0,0]),3));
 continueHorizonFold(g,()=>.8);
 const f=g.getAttribute('fold');
 assert.ok(f.normalized&&f.array instanceof Int8Array);
 assert.ok(Math.abs(f.getX(0)-.8)<1/127,'exterior moisture matches the playable boundary');
 assert.equal(f.getX(0),f.getX(2),'no moisture or ambient-light step across the map edge');
 assert.ok(f.getX(3)>0&&f.getX(3)<f.getX(0),'the continued field fades gradually');
 assert.equal(f.getX(4),0,'no clamped edge-curvature stripes in the distant ground');
 g.dispose();
}
// Delta's southwestern shoulder exposed the interior of a coarse chord as a
// raised grass lip. Measure its actual drawn edge, not just seated vertices.
// The map-borders lane (2026-10-03): the border landform lowered Delta's rim, which took the lip down to 0.11 m; the
// control replays the shoulder on the classic border (terrain.border.classic), where the coarse chord still stands proud.
{
 const deltaConfig=getMapConfig('delta'),classicDelta={...deltaConfig,terrain:{...deltaConfig.terrain,border:{classic:true}}};
 const ground=createHeightField(5000,classicDelta);
 const ring=sampleHorizonGeometry(classicDelta,1337,ground),n=HORIZON_SEGMENTS,stride=n+1;
 const g=new BufferGeometry(),p=new Float32Array(ring.rows.length*stride*3),normals=new Float32Array(p.length),indices=[];
 for(let row=0;row<ring.rows.length;row++)for(let col=0;col<=n;col++) {
  const source=(row*n+col%n)*3,target=(row*stride+col)*3;
  p.set(ring.positions.subarray(source,source+3),target);normals[target+1]=1;
  if(row<ring.rows.length-1&&col<n){const a=row*stride+col;indices.push(a,a+stride,a+1,a+1,a+stride,a+stride+1);}
 }
 g.setAttribute('position',new BufferAttribute(p,3));g.setAttribute('normal',new BufferAttribute(normals,3));g.setIndex(indices);
 const error=()=>{let worst=0,count=0;const pos=g.attributes.position,ix=g.index;
  for(let i=0;i<ix.count;i+=3)for(let j=0;j<3;j++){
   const a=ix.getX(i+j),b=ix.getX(i+(j+1)%3);
   if(pos.getZ(a)!==-511.5||pos.getZ(b)!==-511.5)continue;
   const x=(pos.getX(a)+pos.getX(b))/2;if(x<-510||x>-480)continue;
   worst=Math.max(worst,Math.abs((pos.getY(a)+pos.getY(b))/2-ground.getHeightAt(x,-511.5)));count++;
  }assert.ok(count>0);return worst;
 };
 const before=error(),oldCount=p.length/3;
 assert.ok(before>.3,`negative control retains the visible raised lip: ${before}`);
 refineHorizonGroundSeam(g,n,ground);
 assert.ok(error()<.08,`subdivided seam follows the dip within eight centimetres: ${error()}`);
 assert.ok(g.attributes.position.count-oldCount<40000,'detail is confined to a narrow boundary strip');
 for(const value of g.attributes.position.array)assert.ok(Number.isFinite(value));
 for(let i=0;i<g.index.count;i++)assert.ok(g.index.getX(i)<g.attributes.position.count);
 g.dispose();
}
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return createCanvas(1,1);}};
try {
 const horizon=buildHorizonRing(null,getMapConfig('autumn'),1337),g=horizon.geometry,old=g.index.array.slice(),oldPositions=g.attributes.position.array.slice(),oldNormals=g.attributes.normal.array.slice(),far=horizon.material;
 const grass=new Texture(),normal=new Texture(),terrainMaterial=new MeshStandardMaterial();
 // Vista pass (2026-09-19): every map binds its rim bands up to the first ridge; the ring's own row ladder says how many
 const bands=horizon.userData.horizonRing.ridgeRow,near=bands*HORIZON_SEGMENTS*6;
 assert.ok(bands>=3,'the seated skirt span carries several interpolated rows');
 bindAutumnHorizonGround(horizon,terrainMaterial,[grass,normal],{columns:HORIZON_SEGMENTS,bands});
 assert.equal(horizon.geometry,g);assert.deepEqual(g.attributes.position.array,oldPositions);assert.deepEqual(g.attributes.normal.array,oldNormals);
 assert.equal(horizon.material[0],far);assert.equal(horizon.material[1],terrainMaterial);
 assert.deepEqual(g.groups,[{start:0,count:near,materialIndex:1},{start:near,count:old.length-near,materialIndex:0}]);
 assert.deepEqual(g.index.array.slice(near),old.slice(near),'outer indices exact');
 for(let i=0;i<near;i+=3){assert.deepEqual([g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],[old[i],old[i+2],old[i+1]],'same geometric triangle, explicit upward winding');const [a,b,c]=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],p=g.attributes.position;assert.ok((p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))>0);}
 assert.throws(()=>bindAutumnHorizonGround(horizon,terrainMaterial,[grass],{columns:HORIZON_SEGMENTS,bands}),/unbound/);
 const terrain=new Mesh(new PlaneGeometry(),terrainMaterial),world=new Group();world.add(horizon,terrain);registerRetainedObject3DResources(terrain,{textures:[grass,normal]});
 const counts=new Map([[grass,0],[normal,0],[terrainMaterial,0]]);for(const object of counts.keys())object.addEventListener('dispose',()=>counts.set(object,counts.get(object)+1));
 releaseObject3DGpuResources(horizon,{preserveRoots:[terrain],releaseMaterials:true});for(const count of counts.values())assert.equal(count,0,'live terrain preserves shared material and shader textures');
 disposeObject3DResources(world);for(const count of counts.values())assert.equal(count,1,'whole-world shared owner disposal exactly once');
 // Round 40 (2026-09-22, AAA program check 13): every face inside Coastal's sea aperture (ring UV V < 0) renders with the
 // terrain material, near band or far range, so the sea keeps one shader past the edge; land faces beyond the bands stay vista.
 {const coastal=buildHorizonRing(null,getMapConfig('coastal'),1337),cg=coastal.geometry,cold=cg.index.array.slice();
  const cBands=coastal.userData.horizonRing.ridgeRow,cNear=cBands*HORIZON_SEGMENTS*6,cuv=cg.attributes.uv;
  const marine=(i)=>Math.min(cuv.getY(cold[i]),cuv.getY(cold[i+1]),cuv.getY(cold[i+2]))<-0.001;
  let farMarine=0;for(let i=cNear;i<cold.length;i+=3)if(marine(i))farMarine++;
  assert.ok(farMarine>0,'the aperture reaches past the near bands');
  bindAutumnHorizonGround(coastal,new MeshStandardMaterial(),[new Texture(),new Texture()],{columns:HORIZON_SEGMENTS,bands:cBands});
  assert.deepEqual(cg.groups.map(gr=>gr.materialIndex),[1,0]);
  assert.equal(cg.groups[0].count,cNear+farMarine*3,'terrain group = the near bands plus every far marine face');
  assert.equal(cg.groups[0].count+cg.groups[1].count,cold.length);
  for(let i=0;i<cg.groups[0].count;i+=3){
    const p=cg.attributes.position,a=cg.index.getX(i),b=cg.index.getX(i+1),c=cg.index.getX(i+2);
    assert.ok((p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))>0,'marine ground faces receive light from above');
  }
  const vistaStart=cg.groups[1].start;
  for(let i=vistaStart;i<cold.length;i+=3)assert.ok(Math.min(cuv.getY(cg.index.getX(i)),cuv.getY(cg.index.getX(i+1)),cuv.getY(cg.index.getX(i+2)))>=-0.001,'no marine face is left to the vista material');
  disposeObject3DResources(coastal);}
 {const coast=buildHorizonRing(null,getMapConfig('coastal'),1337),g=coast.geometry;
  bindAutumnHorizonGround(coast,new MeshStandardMaterial(),[],{columns:HORIZON_SEGMENTS,bands:coast.userData.horizonRing.ridgeRow,continuousGround:true});
  assert.equal(g.groups[0].count,g.index.count,'the whole continued coast shares the ground shader');
  // 2026-10-02 (the frame-budget lane): no group at all for the ring's own material once no face is left to it — three
  // pushed the empty group into the render list and linked and bound the vista program every frame for nothing
  assert.equal(g.groups.length,1,'no vista-material strip can cross the beach, and no empty vista group remains');
  const distant=coast.getObjectByName('horizon-far-range');
  assert.ok(distant,'the production coast includes the distant apron');
  assert.equal(distant.material[1],coast.material[1],'distant ground shares the live terrain material');
  assert.equal(distant.geometry.getAttribute('normal'),distant.geometry.getAttribute('aFarNormal'),
    'the terrain shader receives real upward normals, preventing a black unlit far range');
  assert.deepEqual(distant.geometry.groups,[{start:0,count:distant.geometry.index.count,materialIndex:1}]);
  assert.equal(distant.geometry.getAttribute('shore').count,distant.geometry.getAttribute('position').count);
  for(let i=0;i<g.index.count;i+=3){const p=g.attributes.position,a=g.index.getX(i),b=g.index.getX(i+1),c=g.index.getX(i+2);
   assert.ok((p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))>0,'every continued coast face winds upward');}
  disposeObject3DResources(coast);}
 const steppe=buildHorizonRing(null,getMapConfig('steppe'),1337);assert.equal(steppe.geometry.groups.length,0);assert.ok(!Array.isArray(steppe.material));disposeObject3DResources(steppe);
 // 2026-10-02 (the frame-budget lane): terrain.ts builds the ring terrain-bound — every face draws with the terrain
 // material, so the ring's own material carries data only: no vista program, the relief atlas (its window, gradient
 // and amplitude unchanged), the canopy tile and its mean for the ring forest, the haze; nothing else.
 {const build=(opts)=>{const steps=buildHorizonRingSteps(null,getMapConfig('autumn'),1337,undefined,opts);let s=steps.next();while(!s.done)s=steps.next();return s.value;};
  const vista=build({}),bound=build({terrainBound:true});
  const vu=vista.material.userData.horizonVista.uniforms,bu=bound.material.userData.horizonVista.uniforms;
  assert.notEqual(vista.material.onBeforeCompile,Material.prototype.onBeforeCompile,'the vista ring still compiles its program (receipts, authoring)');
  assert.equal(bound.material.onBeforeCompile,Material.prototype.onBeforeCompile,'the terrain-bound ring builds no vista program');
  assert.equal(bound.material.userData.horizonTerrainBound,true);
  assert.deepEqual(Object.keys(bu).sort(),['uVCanopy','uVHaze','uVRelief','uVReliefAmp','uVReliefGrad','uVReliefR'],'it carries the relief, the canopy and the haze only');
  for(const k of ['uVReliefAmp','uVReliefGrad','uVHaze'])assert.equal(bu[k].value,vu[k].value,`${k} carried unchanged`);
  assert.ok(bu.uVReliefR.value.equals(vu.uVReliefR.value),'the relief window carried unchanged');
  assert.ok(bu.uVRelief.value&&vu.uVRelief.value&&bu.uVRelief.value.image.width===vu.uVRelief.value.image.width,'the same baked atlas');
  assert.ok(bound.material.userData.horizonVista.canopyMean.equals(vista.material.userData.horizonVista.canopyMean),'the ring forest\'s crown mottle mean');
  const forestOf=(ring)=>{let n=0;ring.getObjectByName('horizon-forest')?.traverse((o)=>{if(o.isInstancedMesh)n+=o.count;});return n;};
  assert.ok(forestOf(bound)>0);assert.equal(forestOf(bound),forestOf(vista),'the ring forest stands where it stood');
  const textures=(ring)=>{const t=new Set();ring.traverse((o)=>{for(const m of [].concat(o.material||[]))for(const v of Object.values(m))if(v&&v.isTexture)t.add(v);});for(const u of Object.values(ring.material.userData.horizonVista.uniforms))if(u.value?.isTexture)t.add(u.value);return t.size;};
  assert.ok(textures(bound)<textures(vista),'fewer textures: the five vista-only tiles are never made');
  bindAutumnHorizonGround(bound,new MeshStandardMaterial(),[new Texture(),new Texture()],{columns:HORIZON_SEGMENTS,bands:bound.userData.horizonRing.ridgeRow,continuousGround:true});
  assert.deepEqual(bound.geometry.groups.map((gr)=>gr.materialIndex),[1],'bound: the terrain group alone');
  disposeObject3DResources(vista);disposeObject3DResources(bound);}
}finally{globalThis.document=previousDocument;}
console.log('Autumn actual terrain material: exact geometric triangles/outer indices, upward winding, source identity, lifetime and other-map isolation PASS');
