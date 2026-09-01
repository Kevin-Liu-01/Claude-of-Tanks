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
  lastRelease: release,
});
assert.equal(await residency.resume(), false,
  'an already-resident phase reports that no restoration frame was needed');
assert.equal(renders, 1, 'an already-resident phase does not render again');

console.log('phaseGpuResidency.selftest: exclusive resources release and restore exactly once');
