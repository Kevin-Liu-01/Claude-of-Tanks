// The deferred assembly (2026-10-16, PERF: the garage's default m1a3 wears a suit and its build ran as one long task
// at boot and in the countdown stream). A suit or field net (TankBuilderPort.afterAssemble) is built in its own slices
// after the core checkpoint, before the decorations, and the visual it returns must be exactly the build that made it
// inside the core (TankFactoryOptions.assemblyInCore): every object, its order, pose, geometry, materials and userData
// (tools/deferred-assembly-receipt.mjs). tools/deferred-assembly-parity.mjs --all runs the same proof over every
// suited id and caller build. A step cancelled mid-suit releases the core and puts the tree back.
// Headless: this proves output identity and lifetime, not native frame times.
import '../../tools/tank-surface-collect.mjs';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { DEFERRED_ASSEMBLY_BUILDS, deferredAssemblyDifference, deferredAssemblyReceipt, drainTimedSteps } from '../../tools/deferred-assembly-receipt.mjs';

const coreUrl = pathToFileURL(fileURLToPath(new URL('./tankFactoryCore.ts', import.meta.url))).href;
const CAPTURE = '    // No earlier yield: all core resources now belong to visual.dispose().';
let capture;
const hook = registerHooks({
  load(href, context, next) {
    const result = next(href, context);
    if (href !== coreUrl) return result;
    const source = String(result.source);
    assert.ok(source.includes(CAPTURE), 'the core checkpoint marker is still in tankFactoryCore.ts');
    return { ...result, source: source.replace(CAPTURE, `    globalThis.__deferredAssemblyCapture?.({ visual, disposables, mats });\n${CAPTURE}`) };
  },
});
globalThis.__deferredAssemblyCapture = (value) => { capture = value; };
await import('./tankFactory.ts');
const { createTank, createTankSteps } = await import(coreUrl);

let checks = 0;
function same(id, name, inCore, deferred) {
  const a = deferredAssemblyReceipt(inCore), b = deferredAssemblyReceipt(deferred);
  const difference = a.digest === b.digest ? null : deferredAssemblyDifference(a, b);
  assert.equal(difference, null, `${id} ${name}: the deferred suit builds exactly what the core built: ${JSON.stringify(difference)}`);
  checks++;
}

// the garage default (a field suit on hull and turret) under the battle and Garage builds, and the fleet's slowest
// slice (a Ukrainian field net with its working clearances) under the battle build
for (const [id, names] of [['m1a3', ['battleHigh', 'garage']], ['ua_challenger2', ['battleHigh']]]) {
  for (const name of names) {
    const options = DEFERRED_ASSEMBLY_BUILDS[name];
    const inCore = drainTimedSteps(createTankSteps(id, null, { ...options, assemblyInCore: true }));
    const deferred = drainTimedSteps(createTankSteps(id, null, options));
    try {
      same(id, name, inCore.visual, deferred.visual);
      // the suit is really sliced: its owners, carriers, drapes and garnish surfaces each end a slice of their own
      assert.ok(deferred.slices.length >= inCore.slices.length + 8,
        `${id} ${name}: the suit builds in slices (${inCore.slices.length} -> ${deferred.slices.length} checkpoints)`);
      checks++;
      if (id === 'm1a3' && name === 'garage') {
        // a synchronous caller (the covered boot) drains the same order
        const sync = createTank(id, null, options);
        try { same(id, `${name} synchronous`, inCore.visual, sync); } finally { sync.dispose(); }
      }
    } finally { inCore.visual.dispose(); deferred.visual.dispose(); }
  }
}

// cancelled inside the suit: every completed core resource is released, nothing reaches the CSM registry for good, and
// each child the step lifted out is back under its parent
const disposed = new Map();
const observe = (original) => function () { disposed.set(this, (disposed.get(this) ?? 0) + 1); return original.call(this); };
const originals = [THREE.BufferGeometry.prototype.dispose, THREE.Material.prototype.dispose, THREE.Texture.prototype.dispose];
THREE.BufferGeometry.prototype.dispose = observe(originals[0]);
THREE.Material.prototype.dispose = observe(originals[1]);
THREE.Texture.prototype.dispose = observe(originals[2]);
try {
  for (const depth of [1, 4, 12]) {
    disposed.clear(); capture = undefined;
    const registered = new Set();
    const context = {
      setupShadowMaterial(material) { registered.add(material); return material; },
      releaseShadowMaterial(material) { return registered.delete(material); },
    };
    const steps = createTankSteps('m1a3', context, DEFERRED_ASSEMBLY_BUILDS.garage);
    assert.equal(steps.next().done, false, 'the core checkpoint is reached');
    const { visual, disposables, mats } = capture;
    const atCore = [];
    visual.root.traverse((object) => atCore.push([object, object.parent]));
    for (let k = 0; k < depth; k++) assert.equal(steps.next().done, false, `suit slice ${k + 1} of the cancelled build`);
    const owned = new Set([...disposables, ...Object.values(mats).filter((value) => value?.isMaterial || value?.isTexture)]);
    steps.return(undefined);
    for (const resource of owned) assert.ok((disposed.get(resource) ?? 0) >= 1, `cancelled at slice ${depth}: a core resource is released`);
    for (const [object, parent] of atCore) {
      assert.ok(object.parent === parent, `cancelled at slice ${depth}: ${object.name || object.type} keeps its parent`);
      if (parent) assert.ok(parent.children.includes(object), `cancelled at slice ${depth}: ${object.name || object.type} is back under its parent`);
    }
    assert.equal(registered.size, 0, `cancelled at slice ${depth}: no material stays in the shadow registry`);
    assert.ok(visual.root.parent === null, 'a cancelled visual was never published');
    assert.equal(steps.next().done, true, 'a cancelled build cannot resume');
    checks += 4;
  }
} finally {
  [THREE.BufferGeometry.prototype.dispose, THREE.Material.prototype.dispose, THREE.Texture.prototype.dispose] = originals;
  hook.deregister();
}
console.log(`tankFactoryDeferredAssembly.selftest: ${checks} checks; the deferred suit is the in-core build, sliced, and a cancelled one releases everything`);
