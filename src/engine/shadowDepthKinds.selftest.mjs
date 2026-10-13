// shadowDepthKinds.ts (2026-10-12, the perf stream): every shadow caster settles on a depth material of its own kind
// (plain, instanced, batched, skinned), so three's shared depth material and the tanks' shadow-proxy material stop
// switching program variants between consecutive draws; three's per-material clone rule and app shader hooks are kept.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { casterKind, kindDepthDefault, needsDepthVariant, settleShadowDepthKind } from './shadowDepthKinds.ts';

const geometry = new THREE.BoxGeometry();
const plainMaterial = new THREE.MeshStandardMaterial();
const shared = new THREE.MeshDepthMaterial(); // stands for three's internal _depthMaterial
const mesh = new THREE.Mesh(geometry, plainMaterial);
const inst = new THREE.InstancedMesh(geometry, plainMaterial, 4);
const batch = new THREE.BatchedMesh(4, 64, 64, plainMaterial);
assert.deepEqual([casterKind(mesh), casterKind(inst), casterKind(batch)], [0, 10, 20]);
// three's other per-object program switches count as kinds too: an instance colour, an instance morph, a batch colour
const coloured = new THREE.InstancedMesh(geometry, plainMaterial, 4);
coloured.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12), 3);
assert.equal(casterKind(coloured), 11);
settleShadowDepthKind(coloured, shared, false);
assert.equal(coloured.customDepthMaterial, kindDepthDefault(11));
assert.notEqual(kindDepthDefault(11), kindDepthDefault(10), 'a coloured instanced caster never shares the plain instanced program');

// three's shared material: a plain mesh keeps it, an instanced or batched caster takes its kind's default
settleShadowDepthKind(mesh, shared, false);
assert.equal(mesh.customDepthMaterial, undefined, 'a plain mesh stays on three\'s shared depth material');
settleShadowDepthKind(inst, shared, false);
settleShadowDepthKind(batch, shared, false);
assert.equal(inst.customDepthMaterial, kindDepthDefault(10));
assert.equal(batch.customDepthMaterial, kindDepthDefault(20));
assert.notEqual(kindDepthDefault(10), kindDepthDefault(20));
for (const kind of [10, 11, 20, 30]) {
  const d = kindDepthDefault(kind);
  assert.ok(d instanceof THREE.MeshDepthMaterial && d.depthPacking === THREE.RGBADepthPacking,
    'a default is three\'s own depth material at the packing the shadow hook gives every depth material');
  assert.equal(d.onBeforeCompile, THREE.Material.prototype.onBeforeCompile);
}
// once settled, the default is selected and kept
settleShadowDepthKind(inst, inst.customDepthMaterial, false);
assert.equal(inst.customDepthMaterial, kindDepthDefault(10));

// three's per-material clone rule is three's: an alpha-tested map, an alpha map, displacement, clipping, A2C
const leaf = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: 0.5 });
const leaves = new THREE.InstancedMesh(geometry, leaf, 4);
settleShadowDepthKind(leaves, new THREE.MeshDepthMaterial(), false);
assert.equal(leaves.customDepthMaterial, undefined, 'an alpha-tested caster keeps three\'s per-material clone');
assert.equal(needsDepthVariant(new THREE.MeshStandardMaterial({ alphaToCoverage: true }), false), true);
assert.equal(needsDepthVariant(Object.assign(new THREE.MeshStandardMaterial(), { clipShadows: true, clippingPlanes: [new THREE.Plane()] }), true), true);
assert.equal(needsDepthVariant(Object.assign(new THREE.MeshStandardMaterial(), { clipShadows: true, clippingPlanes: [new THREE.Plane()] }), false), false,
  'clipping counts only with the renderer\'s local clipping on, as in three');
assert.equal(needsDepthVariant(new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), false), false, 'a map without alpha test is shared');
const multi = new THREE.InstancedMesh(geometry, [plainMaterial, leaf], 4);
settleShadowDepthKind(multi, shared, false);
assert.equal(multi.customDepthMaterial, undefined, 'a group of materials with one alpha-tested keeps three\'s path');
// a default leaves the caster as soon as its material would take three's clone
const fading = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ map: new THREE.Texture() }), 4);
settleShadowDepthKind(fading, shared, false);
assert.equal(fading.customDepthMaterial, kindDepthDefault(10));
fading.material.alphaTest = 0.4;
settleShadowDepthKind(fading, fading.customDepthMaterial, false);
assert.equal(fading.customDepthMaterial, undefined);

// a custom depth material shared across kinds: its first kind keeps it, another kind takes an exact clone
const proxyDepth = new THREE.MeshDepthMaterial({ name: 'ProceduralShadowProxyDepth', depthPacking: THREE.RGBADepthPacking,
  polygonOffset: true, polygonOffsetFactor: 1.25, polygonOffsetUnits: 2 });
const proxyA = new THREE.Mesh(geometry, plainMaterial), proxyB = new THREE.Mesh(geometry, plainMaterial);
const proxyBatch = new THREE.BatchedMesh(4, 64, 64, plainMaterial);
for (const o of [proxyA, proxyB, proxyBatch]) o.customDepthMaterial = proxyDepth;
settleShadowDepthKind(proxyA, proxyDepth, false);
settleShadowDepthKind(proxyBatch, proxyDepth, false);
settleShadowDepthKind(proxyB, proxyDepth, false);
assert.equal(proxyA.customDepthMaterial, proxyDepth);
assert.equal(proxyB.customDepthMaterial, proxyDepth);
const batchDepth = proxyBatch.customDepthMaterial;
assert.ok(batchDepth !== proxyDepth && batchDepth instanceof THREE.MeshDepthMaterial, 'the batch takes its own copy');
for (const key of ['name', 'depthPacking', 'polygonOffset', 'polygonOffsetFactor', 'polygonOffsetUnits', 'side', 'blending',
  'depthTest', 'depthWrite', 'colorWrite', 'alphaTest', 'visible']) {
  assert.equal(batchDepth[key], proxyDepth[key], `the copy keeps ${key}`);
}
settleShadowDepthKind(proxyBatch, batchDepth, false);
assert.equal(proxyBatch.customDepthMaterial, batchDepth, 'the copy is stable');
const otherBatch = new THREE.BatchedMesh(4, 64, 64, plainMaterial);
otherBatch.customDepthMaterial = proxyDepth;
settleShadowDepthKind(otherBatch, proxyDepth, false);
assert.equal(otherBatch.customDepthMaterial, batchDepth, 'one copy per kind, shared by that kind');
// app shader hooks are not copied by three's clone: such a material is left as it is
const hooked = new THREE.MeshDepthMaterial();
hooked.onBeforeCompile = () => {};
const hookedPlain = new THREE.Mesh(geometry, plainMaterial), hookedInst = new THREE.InstancedMesh(geometry, plainMaterial, 2);
hookedPlain.customDepthMaterial = hooked; hookedInst.customDepthMaterial = hooked;
settleShadowDepthKind(hookedPlain, hooked, false);
settleShadowDepthKind(hookedInst, hooked, false);
assert.equal(hookedInst.customDepthMaterial, hooked);
// a pass that selected another material (a distance material) is not judged
const distance = new THREE.MeshDistanceMaterial();
const withDistance = new THREE.InstancedMesh(geometry, plainMaterial, 2);
withDistance.customDepthMaterial = proxyDepth;
settleShadowDepthKind(withDistance, distance, false);
assert.equal(withDistance.customDepthMaterial, proxyDepth);

// the shadow hook settles every caster with the material three selected, before its draw
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /settleShadowDepthKind\(object, depthMaterial, renderer\.localClippingEnabled\);/);
assert.match(lighting, /THREE\.Mesh\.prototype\.onBeforeShadow = hook;/);
assert.match(lighting, /THREE\.BatchedMesh\.prototype\.onBeforeShadow = function[\s\S]{0,200}batchedBefore\.call\(this[\s\S]{0,120}settleShadowDepthKind\(object, depthMaterial, renderer\.localClippingEnabled\);/,
  'the batched casters settle too (three\'s BatchedMesh keeps its own onBeforeShadow)');

console.log('shadowDepthKinds.selftest: shared and custom depth materials settle per caster kind; three\'s clone rule and shader hooks kept');
