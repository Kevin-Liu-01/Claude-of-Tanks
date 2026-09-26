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
// 2026-09-12 fleet track/wheel standard: Russian X bands .030 (pads .036, webs .018),
// the fleet .024 band on AMX-30 X / AMX-40 X / Chieftain 5 X (course datums re-seated),
// and the scheme-painted pressed dish (plate 0.82 r) move every affected digest;
// values below are repinned from the current build.
// 2026-09-17 track law (28 mm X-standard band, ground datum, seated wheels): every rest/armor digest below moves again.
// 2026-09-22 round 35 (camoWorldScale.ts): camo UVs at the fleet constant 0.5 rep/m and the first bake on the pattern stream move
// the intact/damaged draw-content digests below again; draw order and geometry positions are unchanged.
// 2026-09-22 nation wheel standard (owner: "standardize our wheels across NATIONS! then we can delete any wheels we dont use anymore"): the T-90M draws the Russia construction (T-90M X pressed face,
// nationWheelSets.ts / nationWheelConstructions.ts) instead of its rim/hub/bolt dressing; the forward-lamp-seat rest
// digest is repinned from the current build (beforeForwardLampSeat stays the historical value it must never equal).
  beforeForwardLampSeat: 'b5948e28d385c5b49fbb18bfe2057ba8f6903b9957a9c5311856526133bc7530',
  // 2026-09-22 (owner: holes are added, not carved, to save triangles): the fleet fallback mouth is a
  // flat ring + disc (terminal-surface-fit-r3), which moves the intact draw content once more; the
  // forwardLampSeat row below stays as the superseded revision, never as an active claim. On the combined
  // round-38 tree (nation wheels, then the flat-ring mouth) that superseded revision is the nation-wheel
  // repin 004121cb…; c711ef48… was the pre-round-38 value.
  // FSP-03 (2026-09-25, round 96 combined tree; owner: rollers wherever the real vehicle has them): the
  // T-90M carries three fitted return rollers per side again, so the intact rest digest moved once
  // (bec57df3… → f09dc473…) and the roller-carried run lifts the calibrated track band 1.3 mm
  // (combat anatomy tracks.max.y 1.1986 → 1.1999), which moves the t90m armor digest below once
  // (052be10e… → 1e0c31fe…); getSpec('t90m').armor before calibration is byte-identical on the base tree.
  flatRingMouth: 'f09dc473d73c3b77cf48560fe8836c7507bb5aff67ed195270a29c2f519c7d33',
  forwardLampSeat: '004121cb269d4d160c8715176b1473a9a40ceadcbd7c1a69b3fce797013888e0',
});

// Recorded before the equipment-damage opt-in/hook; only the independently
// verified intentional lamp-seat revision above versions a physical rest row.
// 2026-09-22 (owner: "the point of adding holes instead of carving them into the barrel is that we
// save on triangles"): the fleet fallback mouth became a flat ring + disc (terminal-surface-fit-r3;
// the separate Annulus mesh is gone and the Rim geometry changed), so every intact rest digest moved.
// Superseded: leo2a6 b90250a4…, m1a2 82ade7b7…, t90m c711ef48… (the t90m row is versioned in
// T90M_REST_REVISIONS.flatRingMouth). Armor digests are unchanged.
for (const [id, rest, armor] of [
  // 2026-09-22 nation wheel standard: leo2a6 draws the Germany construction (Leopard 2A6 X paired dish); rest repinned.
  ['leo2a6', 'a52d1cd60dc6b84c093cb70779e182d08aafcd2713c711ceb8a91f16ecd29499',
    '6d541732a941a35f75175fedb623632b2f73ebf3cc5484dcd76c3bd049367854'],
  ['t90m', T90M_REST_REVISIONS.flatRingMouth,
    '1e0c31fe3b1ab45ff0f313593cb9e6264b0133ef913fec7f270e702f66702256'],
  // 2026-09-13 wheel review + interior fills: m1a2 draws the hollow paired road wheel, lost the
  // inter-wheel void blocks and carries generated interior fills; intact digest repinned.
  // 2026-09-23 owner-directed 50 mm M1A1 HC turret lift and circular bearing:
  // keep the complete new rest geometry and regenerated combat anatomy
  // guarded through damage and reuse.
  ['m1a2', '20b911a2c1f54fae009db15ba4059ac395f6f8a85179325f142e3e89cdc5ad9f',
    'b272b30073c4e1bd2e849e94cfdd20453d96e03e216719f5b5d15ea660c3ddc6'],
]) {
  const visual = createTank(id, null, { proceduralOnly: true, geometryReceipt: true });
  assert.equal(restHash(visual), rest, `${id}: exact approved intact draw content`);
  if (id === 't90m') assert.notEqual(restHash(visual), T90M_REST_REVISIONS.beforeForwardLampSeat,
    'the intentionally corrected forward lamp geometry must not revert to upward discs');
  const armorHash = createHash('sha256');
  armorHash.update(JSON.stringify(getSpec(id).armor));
  assert.equal(armorHash.digest('hex'), armor, `${id}: approved authoritative armor`);
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
