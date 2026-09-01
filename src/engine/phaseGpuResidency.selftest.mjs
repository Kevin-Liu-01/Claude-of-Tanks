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
