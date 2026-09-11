import assert from 'node:assert/strict';
import { createCanvas } from '@napi-rs/canvas';
import { MeshStandardMaterial, Texture, Group, Mesh, PlaneGeometry } from 'three';
import { bindAutumnHorizonGround } from './horizonAutumnGround.ts';
import { buildHorizonRing } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';
import { registerRetainedObject3DResources, releaseObject3DGpuResources, disposeObject3DResources } from '../engine/resourceLifetime.ts';
const previousDocument=globalThis.document;
globalThis.document={createElement(tag){assert.equal(tag,'canvas');return createCanvas(1,1);}};
try {
 const horizon=buildHorizonRing(null,getMapConfig('autumn'),1337),g=horizon.geometry,old=g.index.array.slice(),oldPositions=g.attributes.position.array.slice(),oldNormals=g.attributes.normal.array.slice(),far=horizon.material;
 const grass=new Texture(),normal=new Texture(),terrainMaterial=new MeshStandardMaterial();
 bindAutumnHorizonGround(horizon,terrainMaterial,[grass,normal]);
 assert.equal(horizon.geometry,g);assert.deepEqual(g.attributes.position.array,oldPositions);assert.deepEqual(g.attributes.normal.array,oldNormals);
 assert.equal(horizon.material[0],far);assert.equal(horizon.material[1],terrainMaterial);
 assert.deepEqual(g.groups,[{start:0,count:3444,materialIndex:1},{start:3444,count:old.length-3444,materialIndex:0}]);
 assert.deepEqual(g.index.array.slice(3444),old.slice(3444),'outer indices exact');
 for(let i=0;i<3444;i+=3){assert.deepEqual([g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],[old[i],old[i+2],old[i+1]],'same geometric triangle, explicit upward winding');const [a,b,c]=[g.index.getX(i),g.index.getX(i+1),g.index.getX(i+2)],p=g.attributes.position;assert.ok((p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))>0);}
 assert.throws(()=>bindAutumnHorizonGround(horizon,terrainMaterial,[grass]),/unbound/);
 const terrain=new Mesh(new PlaneGeometry(),terrainMaterial),world=new Group();world.add(horizon,terrain);registerRetainedObject3DResources(terrain,{textures:[grass,normal]});
 const counts=new Map([[grass,0],[normal,0],[terrainMaterial,0]]);for(const object of counts.keys())object.addEventListener('dispose',()=>counts.set(object,counts.get(object)+1));
 releaseObject3DGpuResources(horizon,{preserveRoots:[terrain],releaseMaterials:true});for(const count of counts.values())assert.equal(count,0,'live terrain preserves shared material and shader textures');
 disposeObject3DResources(world);for(const count of counts.values())assert.equal(count,1,'whole-world shared owner disposal exactly once');
 const steppe=buildHorizonRing(null,getMapConfig('steppe'),1337);assert.equal(steppe.geometry.groups.length,0);assert.ok(!Array.isArray(steppe.material));disposeObject3DResources(steppe);
}finally{globalThis.document=previousDocument;}
console.log('Autumn actual terrain material: exact geometric triangles/outer indices, upward winding, source identity, lifetime and other-map isolation PASS');
