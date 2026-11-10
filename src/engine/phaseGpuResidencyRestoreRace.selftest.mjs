// 2026-11-02 audit R5 (Garage GPU suspend/resume): the residency's restore is an explicit state, not the gap between
// a resume's start and its await. A battle that starts while a restore is in flight still gets its release, a context
// loss during a restore leaves the phase renewable, and two overlapping restores share one upload.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createRetainedPhaseGpuResidency } from './phaseGpuResidency.ts';
import { createGaragePhasePresentationRuntime } from '../game/garagePhasePresentationRuntime.ts';

const held = () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  return { gate, release: () => release() };
};

const stagedRoot = () => {
  const root = new THREE.Group();
  const geometry = new THREE.BoxGeometry();
  root.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()));
  let disposals = 0;
  geometry.addEventListener('dispose', () => { disposals += 1; });
  return { root, disposals: () => disposals };
};

// (a) suspend during an in-flight restore: the release the battle asked for happens once the restore settles.
{
  const { root, disposals } = stagedRoot();
  let pending = null;
  let restores = 0;
  const residency = createRetainedPhaseGpuResidency({
    root,
    preserveRoots: [],
    restoreGpu: async () => { restores += 1; pending = held(); await pending.gate; },
  });
  residency.suspend();
  assert.equal(disposals(), 1);
  const resuming = residency.resume();
  assert.equal(residency.diagnostics().phase, 'restoring', 'a resume in flight is its own state');
  assert.equal(residency.suspend(), null, 'a suspend during the restore is queued, not applied mid-upload');
  pending.release();
  assert.equal(await resuming, true, 'the restore still reports the frame it submitted');
  assert.equal(residency.diagnostics().suspended, true,
    'a battle that started during the restore leaves the Garage released, not resident while detached');
  assert.equal(residency.diagnostics().phase, 'suspended');
  assert.equal(disposals(), 2, 'the queued release ran after the restore settled');
  assert.equal(residency.diagnostics().releases, 2);
  assert.equal(restores, 1);
}

// A later resume cancels a queued suspend (latest intent wins): Garage → battle → Garage during one restore.
{
  const { root, disposals } = stagedRoot();
  let pending = null;
  const residency = createRetainedPhaseGpuResidency({
    root, preserveRoots: [], restoreGpu: async () => { pending = held(); await pending.gate; },
  });
  residency.suspend();
  const first = residency.resume();
  residency.suspend();
  const second = residency.resume();
  pending.release();
  assert.equal(await first, true);
  assert.equal(await second, true);
  assert.equal(residency.diagnostics().phase, 'resident', 'the newest request (resident) wins');
  assert.equal(disposals(), 1, 'the cancelled suspend released nothing');
}

// (b) a context loss during an in-flight restore: the restore's uploads went to the dead context.
{
  const { root } = stagedRoot();
  let pending = null;
  let restores = 0;
  const residency = createRetainedPhaseGpuResidency({
    root, preserveRoots: [], restoreGpu: async () => { restores += 1; pending = held(); await pending.gate; },
  });
  residency.suspend();
  const resuming = residency.resume();
  assert.equal(residency.invalidate(), true, 'a context loss during a restore is recorded, not dropped');
  assert.equal(residency.diagnostics().invalidations, 1);
  pending.release();
  await resuming;
  assert.equal(residency.diagnostics().suspended, true,
    'uploads made to a lost context never mark the phase resident');
  const renewal = residency.resume();
  pending.release();
  assert.equal(await renewal, true, 'the next covered return renews it in full');
  assert.equal(residency.diagnostics().phase, 'resident');
  assert.equal(restores, 2);
}

// A resume that arrives while an invalidated restore is still in flight runs a fresh restore after it.
{
  const { root } = stagedRoot();
  const gates = [];
  const residency = createRetainedPhaseGpuResidency({
    root, preserveRoots: [], restoreGpu: async () => { const gate = held(); gates.push(gate); await gate.gate; },
  });
  residency.suspend();
  const stale = residency.resume();
  residency.invalidate();
  const fresh = residency.resume();
  gates[0].release();
  await stale;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(gates.length, 2, 'the restore after the context loss uploads again');
  gates[1].release();
  assert.equal(await fresh, true);
  assert.equal(residency.diagnostics().phase, 'resident');
}

// (c) two overlapping resumes share one restore.
{
  const { root } = stagedRoot();
  let pending = null;
  let restores = 0;
  const residency = createRetainedPhaseGpuResidency({
    root, preserveRoots: [], restoreGpu: async () => { restores += 1; pending = held(); await pending.gate; },
  });
  residency.suspend();
  const a = residency.resume();
  const b = residency.resume();
  pending.release();
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(restores, 1, 'one upload for two callers');
  assert.equal(residency.diagnostics().resumes, 1);
}

// The runtime: two overlapping restoreGpu callers run one presentation restore, and the first caller's abandonment
// check is not replaced by the second's.
{
  const scene = new THREE.Scene();
  const { root: stageRoot } = stagedRoot();
  const dressingRoot = new THREE.Group();
  scene.add(stageRoot, dressingRoot);
  const seenChecks = [];
  let pending = null;
  let presentations = 0;
  const runtime = createGaragePhasePresentationRuntime({
    scene,
    stageRoot,
    dressingRoot,
    garagePosition: new THREE.Vector3(),
    lighting: { setFarCascadeDormant() {}, setSun() {} },
    sunDirection: new THREE.Vector3(0, 1, 0),
    getGarageSkyConfig: () => ({ sunIntensity: 4 }),
    getBattleSkyConfig: () => ({ sunIntensity: 4 }),
    getGroundHeight: () => 0,
    getPhase: () => 'garage',
    shouldReleaseGpuOnBattle: () => true,
    posePedestal() {},
    poseCamera() {},
    restorePresentationGpu: async ({ resourcesReleased, isCurrent }) => {
      presentations += 1;
      seenChecks.push(isCurrent);
      pending = held();
      await pending.gate;
      return { totalMs: 1, resourcesReleased };
    },
  });
  runtime.setActive(false);
  runtime.setActive(true);
  const firstCheck = () => true;
  const secondCheck = () => true;
  const first = runtime.restoreGpu(firstCheck);
  const second = runtime.restoreGpu(secondCheck);
  pending.release();
  const [receiptA, receiptB] = await Promise.all([first, second]);
  assert.equal(presentations, 1, 'overlapping callers share one covered restore');
  assert.equal(receiptA, receiptB);
  assert.deepEqual(seenChecks, [firstCheck]);
  assert.equal(runtime.restoringGpu, false);

  // a battle starting during the restore: the Garage ends released.
  runtime.setActive(false);
  runtime.setActive(true);
  const returning = runtime.restoreGpu();
  runtime.setActive(false);
  pending.release();
  await returning;
  assert.equal(runtime.diagnostics().gpu.suspended, true,
    'the battle that began during the restore keeps the Garage released');
}

console.log('phaseGpuResidencyRestoreRace.selftest: queued suspend, context loss mid-restore, shared restores PASS');
