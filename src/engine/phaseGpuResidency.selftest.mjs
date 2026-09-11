import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRetainedPhaseGpuResidency } from './phaseGpuResidency.ts';

const preserved = new THREE.Group();
const sharedGeometry = new THREE.BoxGeometry();
preserved.add(new THREE.Mesh(sharedGeometry, new THREE.MeshBasicMaterial()));

const retained = new THREE.Group();
const ownedGeometry = new THREE.SphereGeometry();
const ownedMaterial = new THREE.MeshBasicMaterial();
retained.add(new THREE.Mesh(sharedGeometry, ownedMaterial));
retained.add(new THREE.Mesh(ownedGeometry, ownedMaterial));

let sharedDisposals = 0;
let ownedDisposals = 0;
sharedGeometry.addEventListener('dispose', () => { sharedDisposals += 1; });
ownedGeometry.addEventListener('dispose', () => { ownedDisposals += 1; });
let renders = 0;
let frames = 0;
const residency = createRetainedPhaseGpuResidency({
  root: retained,
  preserveRoots: [preserved],
  restoreGpu: async () => {
    renders += 1;
    frames += 1;
  },
});

assert.equal(residency.diagnostics().suspended, false);
const release = residency.suspend();
assert.equal(sharedDisposals, 0, 'resources shared with the active phase remain resident');
assert.equal(ownedDisposals, 1, 'phase-exclusive geometry is released once');
assert.equal(release?.geometries, 1);
assert.equal(residency.suspend(), null, 'repeated suspension is idempotent');

assert.equal(await residency.resume(), true,
  'a suspended phase reports that it submitted a restoration frame');
assert.equal(renders, 1, 'one real covered frame restores renewable allocations');
assert.equal(frames, 1);
assert.deepEqual(residency.diagnostics(), {
  suspended: false,
  releases: 1,
  resumes: 1,
  resumeFailures: 0,
  invalidations: 0,
  lastRelease: release,
});
assert.equal(await residency.resume(), false,
  'an already-resident phase reports that no restoration frame was needed');
assert.equal(renders, 1, 'an already-resident phase does not render again');

let restoreAttempts = 0;
const retryable = createRetainedPhaseGpuResidency({
  root: new THREE.Group(),
  preserveRoots: [],
  restoreGpu: async () => {
    restoreAttempts += 1;
    if (restoreAttempts === 1) throw new Error('driver upload interrupted');
  },
});
retryable.suspend();
await assert.rejects(() => retryable.resume(), /driver upload interrupted/);
assert.equal(retryable.diagnostics().suspended, true,
  'failed restoration remains suspended so the next covered return retries');
assert.equal(retryable.diagnostics().resumeFailures, 1);
assert.equal(retryable.diagnostics().resumes, 0);
assert.equal(await retryable.resume(), true);
assert.equal(retryable.diagnostics().suspended, false);
assert.equal(retryable.diagnostics().resumes, 1);

assert.equal(retryable.invalidate(), true,
  'context loss invalidates an otherwise resident phase exactly once');
assert.equal(retryable.invalidate(), false, 'repeated context invalidation is idempotent');
assert.equal(retryable.diagnostics().invalidations, 1);
assert.equal(retryable.diagnostics().suspended, true);
assert.equal(await retryable.resume(), true,
  'context-invalidated resources follow the complete covered renewal path');

console.log('phaseGpuResidency.selftest: exclusive resources release, retry, and restore pass');

{
 const active=new THREE.Group(),stage=new THREE.Group(),dressing=new THREE.Group();
 const borrowed=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 borrowed.setIndex([0,1,2]);active.add(new THREE.Mesh(borrowed));
 const positionAlias=new THREE.BufferGeometry().setAttribute('position',borrowed.attributes.position);
 const indexAlias=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,1,1,0,1,0,1,1],3)).setIndex(borrowed.index);
 const data=new THREE.InterleavedBuffer(new Float32Array([0,0,0,1,0,0,0,1,0]),3);
 const interleavedA=new THREE.BufferGeometry().setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
 const interleavedB=new THREE.BufferGeometry().setAttribute('position',new THREE.InterleavedBufferAttribute(data,3,0));
 active.add(new THREE.Mesh(interleavedA));
 const owned=new THREE.BoxGeometry(),texture=new THREE.Texture(),material=new THREE.MeshBasicMaterial({map:texture});
 for(const geometry of [positionAlias,indexAlias,interleavedB,owned])dressing.add(new THREE.Mesh(geometry,material));
 stage.add(new THREE.Mesh(owned,material));
 let geometryDisposals=0,textureDisposals=0,materialDisposals=0;
 for(const geometry of [positionAlias,indexAlias,interleavedB])geometry.addEventListener('dispose',()=>assert.fail('active native attribute borrower disposed'));
 owned.addEventListener('dispose',()=>geometryDisposals++);texture.addEventListener('dispose',()=>textureDisposals++);material.addEventListener('dispose',()=>materialDisposals++);
 const owner=createRetainedPhaseGpuResidency({root:stage,additionalRoots:[dressing],preserveRoots:[active],restoreGpu:async()=>{}});
 const receipt=owner.suspend({releaseTextures:false});assert.equal(receipt.geometries,1);assert.equal(receipt.textures,0);
 assert.equal(geometryDisposals,1,'one shared detached geometry releases once across both roots');assert.equal(textureDisposals,0);assert.equal(materialDisposals,0);
 assert.equal(stage.children.length,1);assert.equal(dressing.children.length,4,'CPU ownership survives suspension');
 await owner.resume();owner.suspend();assert.equal(textureDisposals,1,'constrained mode releases textures across both roots');assert.equal(materialDisposals,0);
 assert.equal(geometryDisposals,2);await owner.resume();
}
console.log('phaseGpuResidency: both roots, geometry-only release, active attribute/index/interleaved borrowers and texture modes PASS');

{
 const stage=new THREE.Group(),workshop=new THREE.Group();
 const stageGeometry=new THREE.BoxGeometry(),workshopGeometry=new THREE.SphereGeometry();
 const stageTexture=new THREE.Texture(),workshopTexture=new THREE.Texture();
 stage.add(new THREE.Mesh(stageGeometry,new THREE.MeshBasicMaterial({map:stageTexture})));
 workshop.add(new THREE.Mesh(workshopGeometry,new THREE.MeshBasicMaterial({map:workshopTexture})));
 let stageDisposals=0,workshopDisposals=0,workshopTextureDisposals=0;
 stageGeometry.addEventListener('dispose',()=>stageDisposals++);
 workshopGeometry.addEventListener('dispose',()=>workshopDisposals++);
 workshopTexture.addEventListener('dispose',()=>workshopTextureDisposals++);
 const owner=createRetainedPhaseGpuResidency({root:stage,additionalRoots:[workshop],preserveRoots:[],restoreGpu:async()=>{}});
 const mobile=owner.suspend({releaseTextures:true,additionalRoots:[]});
 assert.equal(mobile.geometries,1);assert.equal(mobile.textures,1);
 assert.equal(stageDisposals,1);assert.equal(workshopDisposals,0);assert.equal(workshopTextureDisposals,0);
 await owner.resume();
 const desktop=owner.suspend({releaseTextures:false});
 assert.equal(desktop.geometries,2);assert.equal(desktop.textures,0);
 assert.equal(stageDisposals,2);assert.equal(workshopDisposals,1);assert.equal(workshopTextureDisposals,0);
}
console.log('phaseGpuResidency: explicit empty override preserves stage-only release and does not mutate desktop defaults');
