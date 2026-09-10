import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import * as candidate from './decorations.ts';
import './tankFactory.ts';
import { getSpec } from './specs.ts';

const require = createRequire(import.meta.url);
const { createCanvas, Path2D } = require('@napi-rs/canvas');
globalThis.Path2D = Path2D;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas'); return createCanvas(1, 1);
} };

let checks = 0;
const check = (value, message) => { assert.ok(value, message); checks++; };
const equal = (a, b, message) => { assert.deepEqual(a, b, message); checks++; };
function attribute(value) {
  const array = value.isInterleavedBufferAttribute ? value.data.array : value.array;
  return { type: array.constructor.name, itemSize: value.itemSize, normalized: value.normalized,
    bytes: createHash('sha256').update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex') };
}
function receipt(root) {
  const rows = [];
  root.traverse(object => {
    if (!object.name.startsWith('rig_decor_') && !object.userData.__decor) return;
    const row = { name: object.name, type: object.type, userData: object.userData,
      children: object.children.map(child => ({ type: child.type, name: child.name })),
      matrix: object.matrix.elements.slice(), castShadow: object.castShadow, receiveShadow: object.receiveShadow };
    if (object.geometry) {
      row.geometry = { index: object.geometry.index && attribute(object.geometry.index),
        attributes: Object.entries(object.geometry.attributes).map(([key, value]) => [key, attribute(value)]),
        groups: object.geometry.groups, drawRange: object.geometry.drawRange };
      const material = object.material;
      row.material = { name: material.name, type: material.type, color: material.color?.toArray(),
        roughness: material.roughness, metalness: material.metalness, vertexColors: material.vertexColors,
        opacity: material.opacity, side: material.side, alphaTest: material.alphaTest,
        envMapIntensity: material.envMapIntensity, shaderKey: material.customProgramCacheKey() };
    }
    rows.push(row);
  });
  return { rows, summary: root.userData.__decorSummary };
}
function fixture(specId) {
  const root = new THREE.Group(), hullG = new THREE.Group(), turretG = new THREE.Group();
  hullG.name = 'rig_hull'; turretG.name = 'rig_turret';
  const material = new THREE.MeshStandardMaterial();
  const hull = new THREE.BoxGeometry(3, 1, 6, 8, 3, 12);
  const turret = new THREE.BoxGeometry(2.1, 0.7, 2.5, 8, 3, 10);
  hullG.add(new THREE.Mesh(hull, material)); turretG.add(new THREE.Mesh(turret, material));
  turretG.position.y = 1.25; root.add(hullG, turretG);
  const disposables = [], borrowed = new Set([hull, turret]);
  return { root, borrowed,
    args: { root, hullG, turretG, spec: getSpec(specId), engineCtx: null, disposables, opts: { decor: true } },
    dispose() { for (const object of disposables) object.dispose();
      hull.dispose(); turret.dispose(); material.dispose(); },
  };
}
function drain(steps, visit = () => {}) {
  let result = steps.next();
  while (!result.done) { visit(result.value); result = steps.next(); }
  return result.value;
}
function observeResources(module) {
  const parts = new Set(), disposed = new Map(), cloned = new Set();
  const before = new Map(Object.entries(module.DECOR_KITS));
  for (const [key, build] of before) module.DECOR_KITS[key] = args => {
    const result = build(args); for (const part of result) parts.add(part.geo); return result;
  };
  const dispose = THREE.BufferGeometry.prototype.dispose;
  const clone = THREE.BufferGeometry.prototype.clone;
  THREE.BufferGeometry.prototype.dispose = function () {
    disposed.set(this, (disposed.get(this) || 0) + 1); return dispose.call(this);
  };
  THREE.BufferGeometry.prototype.clone = function () { const result = clone.call(this); cloned.add(result); return result; };
  return { parts, cloned, disposed, close() {
    for (const [key, build] of before) module.DECOR_KITS[key] = build;
    THREE.BufferGeometry.prototype.dispose = dispose; THREE.BufferGeometry.prototype.clone = clone;
  } };
}

function observeRng(module) {
  const trace = [], before = new Map(Object.entries(module.DECOR_KITS));
  for (const [kit, build] of before) module.DECOR_KITS[kit] = args => {
    const row = { kit, variant: args.v, draws: [] }; trace.push(row);
    return build({ ...args, rng() { const value = args.rng(); row.draws.push(value); return value; } });
  };
  return { trace, close() { for (const [kit, build] of before) module.DECOR_KITS[kit] = build; } };
}

// These are sync/stepped consistency and lifecycle tests, not an independent
// original-output oracle. The pre-change artifact comparison passed 25,148
// assertions; tankFactoryStaging separately retains original decorated-core goldens.
for (const id of ['m1a1', 'strv103', 'leo2_revolution_proto']) {
  const reference = fixture(id), staged = fixture(id);
  const referenceRng = observeRng(candidate);
  let stagedRng;
  try {
    candidate.attachTankDecorations(reference.args);
    referenceRng.close();
    stagedRng = observeRng(candidate);
    const stages = new Set(); let now = 0;
    const result = drain(candidate.attachTankDecorationsSteps(staged.args, { now: () => now += 3 }), slice => {
      stages.add(slice.stage);
      equal(receipt(staged.root).rows, [], `${id}: no draft group published at ${slice.stage}`);
      equal(staged.args.disposables, [], `${id}: no pending ownership transferred at ${slice.stage}`);
      if (slice.stage === 'surface-index') check(slice.completed <= slice.total, 'index progress bounded');
    });
    equal(result, reference.root.userData.__decorSummary, `${id}: consistent summary/placement/guards`);
    equal(receipt(staged.root), receipt(reference.root), `${id}: consistent attributes/materials/order`);
    equal(stagedRng.trace, referenceRng.trace, `${id}: exact RNG order/value across checkpointing`);
    check(stages.has('surface-ready') && stages.has('manifest-row') && stages.has('publish'), `${id}: cooperative stages reached`);
    const once = receipt(staged.root);
    equal(drain(candidate.attachTankDecorationsSteps(staged.args)), null, `${id}: second attach is a no-op`);
    equal(receipt(staged.root), once, `${id}: no duplicate publication`);
  } finally { stagedRng?.close(); referenceRng.close(); reference.dispose(); staged.dispose(); }
}
for (const stage of ['surface-index', 'surface-ready', 'manifest-row', 'material-bucket', 'publish']) {
  for (const method of ['return', 'throw']) {
    const f = fixture('m1a1'), resources = observeResources(candidate);
    const steps = candidate.attachTankDecorationsSteps(f.args, { now: () => 0 });
    let reached = false;
    const warn = console.warn; console.warn = () => {};
    try {
      let result;
      do { result = steps.next(); reached = result.value?.stage === stage; } while (!result.done && !reached);
      check(reached, `${method}: reached ${stage}`);
      if (method === 'throw') assert.throws(() => steps.throw(new Error('injected cancellation')), /injected cancellation/);
      else steps.return(null);
      equal(receipt(f.root).rows, [], `${stage}: no partial publish after ${method}`);
      equal(f.args.disposables, [], `${stage}: no partial ownership transfer after ${method}`);
      equal(f.root.userData.__decorApplied, undefined, `${stage}: canceled claim cleared`);
      for (const geometry of f.borrowed) equal(resources.disposed.get(geometry) || 0, 0, 'borrowed core geometry untouched');
      for (const geometry of resources.parts) equal(resources.disposed.get(geometry), 1, `${stage}: owned kit geometry disposed once`);
      for (const geometry of resources.cloned) equal(resources.disposed.get(geometry), 1, `${stage}: placement clones disposed once`);
      equal(steps.next().done, true, `${stage}: canceled iterator cannot resume`);
    } finally { console.warn = warn; resources.close(); f.dispose(); }
  }
}

// Failure after one converted part must release that temporary as well as the
// still-indexed owned originals; borrowed core geometry remains independent.
for (const fault of ['conversion', 'material']) {
  const f = fixture('m1a1'), resources = observeResources(candidate), converted = [];
  const nativeConvert = THREE.BufferGeometry.prototype.toNonIndexed;
  let armed = false, conversions = 0, failedMaterial = null, materialDisposals = 0;
  if (fault === 'conversion') THREE.BufferGeometry.prototype.toNonIndexed = function () {
    if (armed && ++conversions === 2) throw new Error('injected conversion failure');
    const value = nativeConvert.call(this); if (armed) converted.push(value); return value;
  };
  else f.args.engineCtx = { setupShadowMaterial(material) {
    // First invocation is the established harmless real-CSM probe.
    if (!armed) { material.defines = { USE_CSM: true }; return material; }
    failedMaterial = material;
    material.addEventListener('dispose', () => materialDisposals++);
    throw new Error('injected material failure');
  } };
  const steps = candidate.attachTankDecorationsSteps(f.args, { now: () => 0 });
  try {
    let result;
    do {
      result = steps.next();
      if (result.value?.stage === 'manifest-row' && result.value.completed === result.value.total) armed = true;
    } while (!result.done && !armed);
    check(armed, `${fault}: reached first merge boundary`);
    assert.throws(() => drain(steps), new RegExp(`injected ${fault} failure`)); checks++;
    equal(receipt(f.root).rows, [], `${fault}: failure remains private`);
    equal(f.args.disposables, [], `${fault}: failure does not transfer ownership`);
    for (const geometry of f.borrowed) equal(resources.disposed.get(geometry) || 0, 0, `${fault}: borrowed geometry untouched`);
    for (const geometry of resources.parts) equal(resources.disposed.get(geometry), 1, `${fault}: kit released once`);
    for (const geometry of converted) equal(resources.disposed.get(geometry), 1, `${fault}: converted temporary released once`);
    if (fault === 'material') { check(failedMaterial, 'setup received the new owned material'); equal(materialDisposals, 1, 'throwing material setup released once'); }
  } finally { THREE.BufferGeometry.prototype.toNonIndexed = nativeConvert; resources.close(); f.dispose(); }
}

// Existing synchronous API still contains decoration errors only.
// The CSM shader registry is independent from GPU material disposal. Pending
// materials and the real-context probe must leave it on every failed path.
for (const outcome of ['return', 'throw', 'setup-throw', 'probe-throw', 'publish']) {
  const f = fixture('m1a1');
  const foreign = new THREE.MeshStandardMaterial(), shaders = new Map([[foreign, { live: true }]]);
  const releases = new Map(), disposed = new Map();
  let setups = 0;
  f.args.engineCtx = {
    setupShadowMaterial(material) {
      setups++; shaders.set(material, { registered: true });
      material.addEventListener('dispose', () => disposed.set(material, (disposed.get(material) || 0) + 1));
      if ((outcome === 'probe-throw' && setups === 1) || (outcome === 'setup-throw' && setups === 2)) {
        throw new Error('shadow registry setup failure');
      }
      material.defines = { USE_CSM: true }; return material;
    },
    releaseShadowMaterial(material) {
      releases.set(material, (releases.get(material) || 0) + 1);
      return shaders.delete(material);
    },
  };
  const steps = candidate.attachTankDecorationsSteps(f.args, { now: () => 0 });
  try {
    if (outcome === 'setup-throw') assert.throws(() => drain(steps), /shadow registry setup failure/);
    else if (outcome === 'return' || outcome === 'throw') {
      let result;
      do { result = steps.next(); } while (!result.done && result.value.stage !== 'publish');
      check(!result.done, `${outcome}: reached private material ownership boundary`);
      if (outcome === 'return') steps.return(null);
      else assert.throws(() => steps.throw(new Error('registry cancel')), /registry cancel/);
    } else drain(steps);
    check(shaders.has(foreign), `${outcome}: foreign live shader registration retained`);
    equal(releases.get(foreign), undefined, `${outcome}: foreign material never released`);
    for (const [material, count] of releases) {
      equal(count, 1, `${outcome}: owned shadow registration released once`);
      equal(disposed.get(material), 1, `${outcome}: released material disposed once`);
    }
    if (outcome === 'publish') {
      const materials = f.args.disposables.filter(resource => resource.isMaterial);
      check(materials.length > 0, 'successful decoration transfers materials to visual owner');
      equal(shaders.size, materials.length + 1, 'only published materials and foreign material stay registered');
      for (const material of materials) {
        check(shaders.has(material), 'published material registration is not prematurely released');
        equal(releases.get(material), undefined, 'publication transfers release ownership');
        f.args.engineCtx.releaseShadowMaterial(material);
      }
    } else equal(shaders.size, 1, `${outcome}: no canceled/probe registration remains`);
  } finally { f.dispose(); foreign.dispose(); }
}

// Existing synchronous API still contains decoration errors only.
const syncFailure = fixture('m1a1');
const warnings = [], nativeWarn = console.warn;
console.warn = (...args) => warnings.push(args);
try {
  let calls = 0;
  syncFailure.args.engineCtx = { setupShadowMaterial(material) {
    if (++calls === 1) { material.defines = { USE_CSM: true }; return material; }
    throw new Error('sync decorator fixture');
  } };
  equal(candidate.attachTankDecorations(syncFailure.args), null, 'sync wrapper preserves historical null fallback');
  check(warnings.some(args => args.join(' ').includes('sync decorator fixture')), 'sync wrapper still reports failure');
  equal(receipt(syncFailure.root).rows, [], 'sync fallback has no failed partial decoration');
} finally { console.warn = nativeWarn; syncFailure.dispose(); }

// A clock that never advances must still have deterministic work caps.
const bounded = fixture('m1a1');
try {
  const previous = new Map();
  drain(candidate.attachTankDecorationsSteps(bounded.args, { now: () => NaN }), slice => {
    if (slice.stage === 'surface-ready') previous.clear();
    if (slice.stage !== 'surface-index') return;
    const last = previous.get(slice.total) || 0;
    check(slice.completed - last <= candidate.DECORATION_INDEX_BATCH_LIMIT, 'nonadvancing clock has a hard triangle cap');
    previous.set(slice.total, slice.completed);
  });
} finally { bounded.dispose(); }
console.log(`decor-staging: PASS ${checks} assertions; sync/stepped consistency, atomic publish, exact RNG, cancellation and bounded index work`);
