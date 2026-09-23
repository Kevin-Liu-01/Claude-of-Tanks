import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { MeshStandardMaterial, Texture, Group, Mesh, PlaneGeometry } from 'three';
import { bindAutumnHorizonGround } from './horizonAutumnGround.ts';
import { HORIZON_SEGMENTS, buildHorizonRing } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';
import { registerRetainedObject3DResources, releaseObject3DGpuResources, disposeObject3DResources } from '../engine/resourceLifetime.ts';
const previousDocument=globalThis.document;
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
  const marine=(i)=>Math.min(cuv.getY(cold[i]),cuv.getY(cold[i+1]),cuv.getY(cold[i+2]))<-0.5;
  let farMarine=0;for(let i=cNear;i<cold.length;i+=3)if(marine(i))farMarine++;
  assert.ok(farMarine>0,'the aperture reaches past the near bands');
  bindAutumnHorizonGround(coastal,new MeshStandardMaterial(),[new Texture(),new Texture()],{columns:HORIZON_SEGMENTS,bands:cBands});
  assert.deepEqual(cg.groups.map(gr=>gr.materialIndex),[1,0]);
  assert.equal(cg.groups[0].count,cNear+farMarine*3,'terrain group = the near bands plus every far marine face');
  assert.equal(cg.groups[0].count+cg.groups[1].count,cold.length);
  const vistaStart=cg.groups[1].start;
  for(let i=vistaStart;i<cold.length;i+=3)assert.ok(Math.min(cuv.getY(cg.index.getX(i)),cuv.getY(cg.index.getX(i+1)),cuv.getY(cg.index.getX(i+2)))>=-0.5,'no marine face is left to the vista material');
  disposeObject3DResources(coastal);}
 const steppe=buildHorizonRing(null,getMapConfig('steppe'),1337);assert.equal(steppe.geometry.groups.length,0);assert.ok(!Array.isArray(steppe.material));disposeObject3DResources(steppe);
}finally{globalThis.document=previousDocument;}
console.log('Autumn actual terrain material: exact geometric triangles/outer indices, upward winding, source identity, lifetime and other-map isolation PASS');
