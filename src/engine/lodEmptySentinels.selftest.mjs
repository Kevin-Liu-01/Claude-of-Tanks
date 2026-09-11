import assert from 'node:assert/strict';
import * as THREE from 'three';
import { detachEmptyLodSentinels } from './lodEmptySentinels.ts';

const reference=new THREE.Group(), candidate=new THREE.Group();
function fill(root) {
  const lod=new THREE.LOD(), near=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
  lod.addLevel(near,0);lod.addLevel(new THREE.Object3D(),150,.1);root.add(lod);root.updateMatrixWorld();return lod;
}
const a=fill(reference),b=fill(candidate),sentinel=b.levels[1].object;
assert.equal(detachEmptyLodSentinels(candidate),1);
assert.equal(b.levels[1].object,sentinel);assert.equal(sentinel.parent,null);
assert.equal(detachEmptyLodSentinels(candidate),0,'idempotent finalization');
const camera=new THREE.PerspectiveCamera();
for(const distance of [0,149,150,151,149,136,135,134,1000,0]) {
  camera.position.z=distance;camera.updateMatrixWorld();a.update(camera);b.update(camera);
  assert.deepEqual(b.levels.map(l=>l.object.visible),a.levels.map(l=>l.object.visible),`native visibility/hysteresis at ${distance}`);
  assert.equal(b.getCurrentLevel(),a.getCurrentLevel());
}
const clone=b.clone(true);
assert.equal(clone.levels.length,2);assert.equal(clone.children.length,2,'native LOD.copy restores serializable children');
const protectedLod=new THREE.LOD(),empty=new THREE.Object3D();empty.name='gameplay-owner';
protectedLod.addLevel(new THREE.Object3D(),0);protectedLod.addLevel(empty,10);candidate.add(protectedLod);
assert.equal(detachEmptyLodSentinels(candidate),0,'named/query owners are not generic empty sentinels');
for(const root of [reference,candidate,clone])root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log('lodEmptySentinels: native threshold/hysteresis, level identity, clone, owner protection and idempotence PASS');
