import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { box, mergeAll, xform } from './factoryGeometry.ts';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createFx } from '../fx/effects.ts';
import { registerFxClock, registerPopTrail } from '../fx/clock.ts';
import { setBreakFxProvider } from '../world/destructibles.ts';
import {
  EquipmentDamage, EQUIPMENT_DAMAGE_LIMITS as LIMITS, markEquipmentLid,
  equipmentDamageStats, resetEquipmentDamage,
} from './equipmentDamage.ts';

const hit = (position = [1, 2, 3], overrides = {}) => ({
  kind: 'pen', caliberMm: 120, impactFrame: 'turret',
  impactLocalPos: position, impactLocalNormal: [0, 1, 0], ...overrides,
});

function fixture({ count = 1, yaw = 0, frame = 'turret', role = 'nonArmor', marked = true } = {}) {
  const damage = new EquipmentDamage();
  const parts = [xform(box(0.4, 0.5, 0.6), -4, 0, 0)];
  const prefix = parts[0].index?.count ?? parts[0].getAttribute('position').count;
  for (let index = 0; index < count; index++) {
    const lid = box(0.155, 0.028, 0.315);
    if (marked) markEquipmentLid(lid);
    parts.push(xform(lid, 1 + index * 0.7, 2, 3, 0, yaw, 0));
  }
  const geometry = mergeAll(parts);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  const originalPosition = position.array.slice();
  const originalNormal = normal.array.slice();
  const originalBox = geometry.boundingBox;
  const originalSphere = geometry.boundingSphere;
  damage.bindMerged(parts, geometry, frame, role);
  function restored() {
    assert.deepEqual(position.array, originalPosition, 'every position restored byte-exactly');
    assert.deepEqual(normal.array, originalNormal, 'every normal restored byte-exactly');
    assert.equal(geometry.boundingBox, originalBox, 'original box ownership restored');
    assert.equal(geometry.boundingSphere, originalSphere, 'original sphere ownership restored');
  }
  function dispose() {
    damage.dispose();
    geometry.dispose();
    for (const part of parts) part.dispose();
  }
  return { damage, parts, geometry, position, normal, originalPosition, originalNormal,
    originalBox, originalSphere, prefix, restored, dispose };
}

// Opt-in binding itself may never change intact geometry or bounds.
{
  const f = fixture({ yaw: 0.43 });
  f.restored();
  const event = hit();
  Object.freeze(event.impactLocalPos);
  Object.freeze(event.impactLocalNormal);
  Object.freeze(event);
  const geometryId = f.geometry.id;
  const uv = f.geometry.getAttribute('uv');
  const originalUv = uv.array.slice();
  assert.equal(f.damage.apply(event), true);
  assert.equal(f.geometry.id, geometryId, 'existing merged draw geometry retained');
  assert.equal(f.geometry.getAttribute('position'), f.position, 'no buffer replacement at impact');
  assert.equal(f.geometry.getAttribute('normal'), f.normal);
  assert.deepEqual(uv.array, originalUv, 'texture coordinates do not move');
  assert.equal(f.geometry.index, null, 'unchanged nonindexed topology');
  let changed = 0;
  for (let vertex = 0; vertex < f.position.count; vertex++) {
    const first = vertex * 3;
    const delta = Math.hypot(
      f.position.array[first] - f.originalPosition[first],
      f.position.array[first + 1] - f.originalPosition[first + 1],
      f.position.array[first + 2] - f.originalPosition[first + 2],
    );
    if (delta > 0) changed++;
    if (vertex < f.prefix) assert.equal(delta, 0, 'unmarked body cannot deform');
    assert.ok(delta <= LIMITS.maxDisplacementM, 'fixed 4 cm conservative displacement bound');
    assert.ok(Math.abs(Math.hypot(f.normal.getX(vertex), f.normal.getY(vertex), f.normal.getZ(vertex)) - 1) < 1e-6);
  }
  assert.equal(changed, 36, 'exactly one 12-triangle lid changes');
  assert.notDeepEqual(f.normal.array, f.originalNormal, 'lighting normals rotate with the lid');
  assert.ok(f.geometry.boundingBox.containsBox(f.originalBox));
  assert.equal(f.geometry.boundingSphere.radius, f.originalSphere.radius + 0.04);
  const damaged = f.position.array.slice();
  assert.equal(f.damage.apply(event), false, 'duplicate contact is inert');
  assert.deepEqual(f.position.array, damaged);
  f.damage.reset();
  f.restored();
  // No renderer flush: pending update ranges must stay bounded through reuse.
  for (let index = 0; index < 100; index++) {
    assert.equal(f.damage.apply(event), true);
    f.damage.reset();
  }
  f.restored();
  assert.equal(f.position.updateRanges.length, 1);
  assert.equal(f.normal.updateRanges.length, 1);
  f.dispose();
}

// True oriented-box contact distance, not an inflated yawed AABB or tank distance.
for (const yaw of [0, Math.PI / 4, -1.1]) {
  const f = fixture({ yaw });
  const local = new THREE.Vector3(0.0775 + 0.3001, 0, 0);
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  local.add(new THREE.Vector3(1, 2, 3));
  assert.equal(f.damage.apply(hit(local.toArray())), false, 'outside 30 cm is rejected');
  local.set(0.0775 + 0.2999, 0, 0);
  local.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  local.add(new THREE.Vector3(1, 2, 3));
  assert.equal(f.damage.apply(hit(local.toArray())), true, 'inside 30 cm accepted at any yaw');
  f.dispose();
}

// Authority/ownership gates never infer a dent on armor, gun, ERA or an unknown part.
for (const options of [
  { role: 'armor' }, { role: 'externalArmor' }, { role: 'runningGear' },
  { frame: 'gun' }, { frame: 'barrel' }, { marked: false },
]) {
  const f = fixture(options);
  assert.equal(f.damage.apply(hit()), false);
  f.restored();
  f.dispose();
}
for (const invalidBuffer of ['indexed', 'float64', 'missingNormal']) {
  const part = markEquipmentLid(box(0.155, 0.028, 0.315));
  const merged = invalidBuffer === 'indexed' ? part.clone() : part.toNonIndexed();
  if (invalidBuffer === 'float64') {
    merged.setAttribute('position', new THREE.BufferAttribute(new Float64Array(merged.attributes.position.array), 3));
  }
  if (invalidBuffer === 'missingNormal') merged.deleteAttribute('normal');
  const damage = new EquipmentDamage();
  damage.bindMerged([part], merged, 'turret', 'equipment');
  assert.equal(damage.apply(hit([0, 0, 0])), false, `${invalidBuffer}: unsafe buffer ownership rejected`);
  damage.dispose();
  merged.dispose();
  part.dispose();
}
{
  const f = fixture();
  for (const invalid of [
    { impactFrame: 'hull' }, { impactFrame: 'gun' }, { impactLocalPos: [1, 2] },
    { impactLocalPos: [NaN, 2, 3] }, { impactLocalPos: [1, 2, Infinity] },
    { impactLocalNormal: [0, 0, 0] }, { impactLocalNormal: null },
    { caliberMm: NaN }, { caliberMm: 19 }, { kind: 'era' }, { kind: 'miss' },
  ]) assert.equal(f.damage.apply(hit(undefined, invalid)), false);
  assert.equal(f.damage.apply(hit([0, 0, 0])), false, 'ordinary hull/remote hits cannot reach a lid');
  f.restored();
  f.dispose();
}
for (const kind of ['pen', 'he_pen', 'nonpen', 'ricochet', 'spaced_absorb', 'he_splash']) {
  const f = fixture({ frame: 'hull', role: 'equipment' });
  assert.equal(f.damage.apply(hit(undefined, { kind, impactFrame: 'hull', caliberMm: 1000 })), true);
  for (let i = 0; i < f.position.count; i++) {
    const offset = i * 3;
    assert.ok(Math.hypot(...f.position.array.subarray(offset, offset + 3).map(
      (value, axis) => value - f.originalPosition[offset + axis],
    )) <= LIMITS.maxDisplacementM);
  }
  f.dispose();
}
{
  const f = fixture({ count: 2 });
  assert.equal(f.damage.apply(hit([1.3, 2, 3])), true);
  assert.equal(f.damage.apply(hit([1.3, 2, 3])), false, 'duplicate cannot walk to a nearby unused part');
  assert.equal(f.damage.damagedParts, 1);
  assert.equal(f.damage.apply(hit([1.7, 2, 3])), true, 'a distinct nearest part still works');
  f.dispose();
}

// Only eight vehicles × eight parts: no whole-fleet rest copies or eviction popping.
{
  const fleet = [];
  for (let vehicle = 0; vehicle < 9; vehicle++) fleet.push(fixture({ count: 10 }));
  for (let vehicle = 0; vehicle < fleet.length; vehicle++) {
    const f = fleet[vehicle];
    for (let part = 0; part < 10; part++) {
      assert.equal(f.damage.apply(hit([1 + part * 0.7, 2, 3])), vehicle < 8 && part < 8);
    }
  }
  assert.deepEqual(equipmentDamageStats(), { activeVehicles: 8, parts: 64, savedBytes: 55296 });
  fleet[0].damage.reset();
  fleet[0].restored();
  assert.equal(fleet[8].damage.apply(hit()), true, 'reset releases the vehicle slot');
  resetEquipmentDamage();
  assert.deepEqual(equipmentDamageStats(), { activeVehicles: 0, parts: 0, savedBytes: 0 });
  for (const f of fleet) {
    f.restored();
    f.dispose();
    assert.equal(f.damage.apply(hit()), false, 'disposed owners never accept work');
  }
}
{
  const f = fixture();
  f.geometry.boundingBox = f.geometry.boundingSphere = null;
  assert.equal(f.damage.apply(hit()), true);
  f.geometry.computeBoundingBox();
  f.geometry.computeBoundingSphere();
  f.damage.reset();
  assert.equal(f.geometry.boundingBox, null, 'lazy bound ownership restored');
  assert.equal(f.geometry.boundingSphere, null);
  assert.equal(f.damage.apply(hit()), true);
  let disposed = 0;
  f.geometry.addEventListener('dispose', () => { disposed++; });
  f.damage.dispose();
  assert.deepEqual(f.position.array, f.originalPosition);
  assert.deepEqual(f.normal.array, f.originalNormal);
  assert.equal(disposed, 0, 'helper never disposes factory-owned geometry');
  f.dispose();
  assert.equal(disposed, 1);
}

function legacyAttributeNames(geometry) {
  // Night-lens metadata was added after these immutable rest captures. Validate
  // that single channel separately; retain every original shape/instance byte.
  const a = geometry.getAttribute('nightEmissionMask');
  if (a) {
    assert.ok(a.array instanceof Uint8Array, 'night mask is byte-sized');
    assert.equal(a.itemSize, 1); assert.equal(a.normalized, false);
    assert.equal(a.count, geometry.getAttribute('position').count, 'one mask value per original vertex');
    assert.ok(a.array.every(v => v === 0 || v === 1 || v === 2), 'only supported semantic lens values');
  }
  return Object.keys(geometry.attributes).filter(k => k !== 'nightEmissionMask');
}

function restHash(visual) {
  const hash = createHash('sha256');
  visual.root.traverse((object) => {
    hash.update(JSON.stringify([object.name, object.position.toArray(), object.quaternion.toArray(),
      object.scale.toArray(), object.visible]));
    const geometry = object.geometry;
    if (geometry) {
      const names = legacyAttributeNames(geometry);
      names.sort();
      for (const name of names) {
        const array = geometry.attributes[name].array;
        hash.update(name);
        hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      }
      if (geometry.index) {
        const array = geometry.index.array;
        hash.update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));
      }
    }
    if (object.instanceMatrix) hash.update(new Uint8Array(object.instanceMatrix.array.buffer));
  });
  return hash.digest('hex');
}

{
  const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0,0,1,0,0,1], 2)); geometry.setIndex([0,1,2]);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), 1), root = new THREE.Group(); root.add(mesh);
  const measure = () => restHash({ root }), legacy = measure();
  geometry.setAttribute('nightEmissionMask', new THREE.Uint8BufferAttribute([0,1,2], 1));
  assert.equal(measure(), legacy, 'valid lighting metadata preserves original rest bytes');
  for (const invalid of [new THREE.Float32BufferAttribute([0,1,2], 1), new THREE.Uint8BufferAttribute([0,1,2], 3),
    new THREE.Uint8BufferAttribute([0,1], 1), new THREE.Uint8BufferAttribute([0,1,2], 1, true), new THREE.Uint8BufferAttribute([0,1,3], 1)]) {
    geometry.setAttribute('nightEmissionMask', invalid); assert.throws(measure);
  }
  geometry.setAttribute('nightEmissionMask', new THREE.Uint8BufferAttribute([0,1,2], 1));
  geometry.setAttribute('unrecognizedSemanticChannel', new THREE.Uint8BufferAttribute([0,1,2], 1));
  assert.notEqual(measure(), legacy, 'no unknown channel is excluded'); geometry.deleteAttribute('unrecognizedSemanticChannel');
  for (const a of [geometry.attributes.position, geometry.attributes.normal, geometry.attributes.uv, geometry.index, mesh.instanceMatrix]) {
    const old = a.array[0]; a.array[0] = old + 1;
    assert.notEqual(measure(), legacy, 'every original shape/index/instance buffer remains guarded'); a.array[0] = old;
  }
  mesh.position.x = 1; assert.notEqual(measure(), legacy, 'rest pose remains guarded'); mesh.position.x = 0;
  root.name = 'changed'; assert.notEqual(measure(), legacy, 'owner node identity remains guarded'); root.name = '';
  mesh.visible = false; assert.notEqual(measure(), legacy, 'visibility remains guarded'); mesh.visible = true;
  assert.equal(measure(), legacy); geometry.dispose(); mesh.material.dispose();
}

// 37de0b6aa deliberately turned and seated four existing T-90M lamp discs.
// Exact pre-source/current decomposition: all 109 nodes / 63 meshes agree;
// only hullGlass position/normal vertices [108,588) changed (four x 120).
// All UV/color/index/instance bytes, owners and daytime material properties
// remain exact. Keep the historical fixture, but hash the COMPLETE current
// model for damage/reset: never omit the corrected lamps from preservation.
const T90M_REST_REVISIONS = Object.freeze({
  beforeForwardLampSeat: 'b5948e28d385c5b49fbb18bfe2057ba8f6903b9957a9c5311856526133bc7530',
  forwardLampSeat: '34700d6e4d20698b353483f641c1835549ff0bfb0b4a829f27c6ec1d1c93acb9',
});

// Recorded before the equipment-damage opt-in/hook; only the independently
// verified intentional lamp-seat revision above versions a physical rest row.
for (const [id, rest, armor] of [
  ['leo2a6', 'd99c4911867c659fb8ec7b8d5036890fd83136c33c1512d4196fe302d71ea95c',
    'f029abdac12ed1a9891ac7f48e7d6ada06190ffe8b0615a7d12e00aa7d8c1566'],
  ['t90m', T90M_REST_REVISIONS.forwardLampSeat,
    '050d079304b3b60b62cea6f714d2fadbdcf7cfe79fa7e8796826f121dc382e65'],
  ['m1a2', 'd1bd1f77a5fcd9f87b0897414f7e57579a6cf6356c364bffcf2b16b2a74fcd8b',
    '47159a9590d264887e9883ab2e4fa8dc31634a4ed184e176be7fcb05a8909036'],
]) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  assert.equal(restHash(visual), rest, `${id}: exact approved intact draw content`);
  if (id === 't90m') assert.notEqual(restHash(visual), T90M_REST_REVISIONS.beforeForwardLampSeat,
    'the intentionally corrected forward lamp geometry must not revert to upward discs');
  const armorHash = createHash('sha256');
  armorHash.update(JSON.stringify(getSpec(id).armor));
  assert.equal(armorHash.digest('hex'), armor, `${id}: unchanged authoritative armor`);
  const contact = hit([0.26, 0.405, -2.485]);
  assert.equal(visual.applyEquipmentDamage(contact), id === 'leo2a6');
  if (id === 'leo2a6') {
    assert.notEqual(restHash(visual), rest, 'real supported vehicle visibly changes vertex content');
    visual.resetDestroyed();
    assert.equal(restHash(visual), rest, 'survivor rematch restores exact rest');
    assert.equal(visual.applyEquipmentDamage(contact), true);
    visual.resetForGaragePresentation();
    assert.equal(restHash(visual), rest, 'garage reuse restores exact rest');
    assert.equal(visual.applyEquipmentDamage(contact), true);
    visual.setDestroyed();
    assert.equal(visual.applyEquipmentDamage(contact), false, 'wrecks reject new equipment damage');
    visual.resetDestroyed();
    assert.equal(restHash(visual), rest, 'wreck reset restores normals, pose and geometry');
  } else {
    assert.equal(restHash(visual), rest, 'unsupported equipment hit cannot alter the approved rest');
    visual.setDestroyed(); visual.resetDestroyed();
    assert.equal(restHash(visual), rest, 'wreck repair retains the complete approved model, including lamp seats');
    visual.resetForGaragePresentation();
    assert.equal(restHash(visual), rest, 'garage reset retains the complete approved model');
  }
  visual.dispose();
}
assert.equal(equipmentDamageStats().activeVehicles, 0);

// Execute the NORMAL FX import and bus callback. The CPU-only canvas supplies
// storage and named drawing operations, not pixels: this proves event/reset
// ownership only, never native appearance or GPU performance.
{
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const gradient = () => ({ addColorStop() {} });
  function canvas() {
    const context = {
      createRadialGradient: gradient, createLinearGradient: gradient,
      getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
      createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4) }; },
    };
    for (const method of ['beginPath', 'clearRect', 'ellipse', 'fill', 'fillRect', 'putImageData',
      'restore', 'rotate', 'save', 'translate', 'arc', 'clip', 'rect', 'scale', 'stroke']) {
      context[method] = () => {};
    }
    return { width: 0, height: 0, getContext: () => context };
  }
  Object.defineProperty(globalThis, 'document', { configurable: true,
    value: { createElement(name) { assert.equal(name, 'canvas'); return canvas(); } } });
  const f = fixture();
  const root = new THREE.Group();
  const turret = new THREE.Group();
  turret.name = 'rig_turret';
  root.add(turret);
  let calls = 0;
  const entity = { visual: { root, setDestroyed() {}, applyEquipmentDamage(event) {
    calls++;
    return f.damage.apply(event);
  } }, state: { pos: new THREE.Vector3(), yaw: 0 } };
  let fx;
  try {
    fx = createFx({ camera: new THREE.PerspectiveCamera(), scene: new THREE.Scene() },
      { getHeightAt: () => 0 }, { resolveEntity: (id) => id === 'player-37' ? entity : null });
    const listeners = new Map();
    fx.bindBus({ on(name, callback) {
      const handlers = listeners.get(name) ?? [];
      handlers.push(callback);
      listeners.set(name, handlers);
      return () => {};
    } });
    const handlers = listeners.get('shell:hit');
    assert.equal(handlers.length, 1, 'one canonical shell-hit FX event owner');
    const event = { ...hit(), targetId: 'player-37', shellId: 's-31', pos: [1, 2, 3], normal: [0, 1, 0] };
    handlers[0](event);
    assert.equal(calls, 1, 'entity ID routes directly without spec-ID confusion');
    assert.equal(f.damage.damagedParts, 1, 'actual bus listener applies equipment damage');
    handlers[0](event);
    assert.equal(calls, 2);
    assert.equal(f.damage.damagedParts, 1, 'replayed authoritative event remains idempotent');
    fx.resetAll();
    f.restored();
    assert.equal(equipmentDamageStats().activeVehicles, 0, 'actual FX reset releases all equipment damage');
    handlers[0]({ ...event, targetId: 'unknown-player' });
    assert.equal(calls, 2, 'unknown entity cannot redirect damage to another tank');
  } finally {
    fx?.resetAll();
    f.dispose();
    registerFxClock(null);
    registerPopTrail(null);
    setBreakFxProvider(null);
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
    else delete globalThis.document;
  }
}
console.log('equipmentDamage.selftest: ownership, locality, duplicate, bounded pool, restoration and exact fleet rest passed');
