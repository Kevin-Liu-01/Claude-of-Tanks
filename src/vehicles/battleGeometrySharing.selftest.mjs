import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {shareBattleGeometry,battleGeometrySharingStats} from './battleGeometrySharing.ts';
import {createTank} from './tankFactory.ts';
import {createTankState} from '../sim/movement.ts';
import {getSpec} from './specs.ts';
const rootWith=(geometry,name='fitting_fixture_detail')=>{const root=new T.Group(),mesh=new T.Mesh(geometry);mesh.name=name;root.add(mesh);return {root,mesh};};
const a=rootWith(new T.BoxGeometry()),b=rootWith(a.mesh.geometry.clone());
const sourceA=a.mesh.geometry,sourceB=b.mesh.geometry;
const releaseA=shareBattleGeometry(a.root),releaseB=shareBattleGeometry(b.root);
assert.equal(a.mesh.geometry,b.mesh.geometry,'identical live immutable stocks share one geometry');
assert.notEqual(a.mesh.geometry.attributes.position.array,sourceA.attributes.position.array,'independent disposal/backing from original owner');
const shared=a.mesh.geometry;let releases=0;shared.addEventListener('dispose',()=>releases++);
releaseA();assert.equal(releases,0);assert.equal(a.mesh.geometry,sourceA);assert.equal(b.mesh.geometry,shared);
releaseA();assert.equal(releases,0,'repeat release is inert');releaseB();assert.equal(releases,1);assert.equal(b.mesh.geometry,sourceB);
const changed=rootWith(sourceA.clone());new Uint8Array(changed.mesh.geometry.attributes.position.array.buffer)[1]^=1;
const ra=shareBattleGeometry(a.root),rc=shareBattleGeometry(changed.root);assert.notEqual(a.mesh.geometry,changed.mesh.geometry,'different bytes are never shared');ra();rc();
for(const mode of ['animated','morph','metadata','draw-range','unsafe-name']){
 const c=rootWith(sourceA.clone());const original=c.mesh.geometry;
 if(mode==='animated')original.attributes.position.setUsage(T.DynamicDrawUsage);
 if(mode==='morph')original.morphAttributes.position=[original.attributes.position.clone()];
 if(mode==='metadata')original.userData.owner='local';
 if(mode==='draw-range')original.setDrawRange(3,12);
 if(mode==='unsafe-name')c.mesh.name='gearTrackBandL';
 const release=shareBattleGeometry(c.root);assert.equal(c.mesh.geometry,original,mode);release();original.dispose();c.mesh.material.dispose();
}
for(const row of [a,b,changed]){row.mesh.geometry.dispose();row.mesh.material.dispose();}
function digest(g){const h=createHash('sha256');for(const [name,at] of Object.entries(g.attributes).sort()){h.update(name);h.update(Buffer.from(at.array.buffer,at.array.byteOffset,at.array.byteLength));}if(g.index)h.update(Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength));return h.digest('hex');}
const options={quality:'high',proceduralOnly:true,geometryReceipt:true,camoSeed:4242,batchStatic:true,battleDetailLod:true};
const preview=createTank('type90',null,{...options,staticPreview:true});
assert.deepEqual(battleGeometrySharingStats(),{geometries:0,leases:0,attributeBytes:0},'Garage previews retain their existing construction/ownership');
preview.dispose();
const one=createTank('type90',null,options),two=createTank('type90a',null,options);
const originals=new Map();for(const visual of [one,two])visual.root.traverse(o=>{if(o.isMesh&&!o.isBatchedMesh)originals.set(o,{geometry:o.geometry,digest:digest(o.geometry)});});
const oneGeo=new Set();one.root.traverse(o=>{if(o.isMesh)oneGeo.add(o.geometry);});const common=new Set();two.root.traverse(o=>{if(o.isMesh&&oneGeo.has(o.geometry))common.add(o.geometry);});
assert.ok(common.size>=20,'real variant builds share repeated rigid stocks');
let disposed=0;for(const g of common)g.addEventListener('dispose',()=>disposed++);
for(const visual of [one,two]){
 const state=createTankState(getSpec(visual===one?'type90':'type90a'),new T.Vector3(12,.7,-9),.83);
 for(let i=0;i<60;i++){state.turretYaw=i*.03;state.gunPitch=Math.sin(i*.1)*.15;state.visualPitch=Math.sin(i*.11)*.13;state.visualRoll=Math.cos(i*.12)*.09;visual.syncFromState(state,.016,i%2?150:12);}
 visual.setDestroyed({pop:true,ageS:.42});visual.syncFromState(state,.12,150);visual.resetForGaragePresentation();
}
for(const [mesh,row]of originals)if(common.has(row.geometry)){assert.equal(mesh.geometry,row.geometry);assert.equal(digest(mesh.geometry),row.digest,'actual suspension/recoil/damage/reset keeps shared stock immutable');}
one.dispose();assert.equal(disposed,0,'disposing first actual vehicle does not dispose its live sibling stocks');
for(const [mesh,row]of originals)if(common.has(row.geometry)&&two.root.getObjectById(mesh.id)){assert.equal(mesh.geometry,row.geometry);assert.equal(digest(mesh.geometry),row.digest);}
two.dispose();assert.equal(disposed,common.size,'last actual owner releases each shared stock exactly once');
assert.deepEqual(battleGeometrySharingStats(),{geometries:0,leases:0,attributeBytes:0},'no owner or backing retained after final disposal');
console.log(JSON.stringify({test:'battleGeometrySharing',common:common.size,scope:'exact immutable buffers, per-visual original disposal, actual articulation/wreck/reset; native resource/frame acceptance separate'}));
