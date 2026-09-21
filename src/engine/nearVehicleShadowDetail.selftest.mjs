import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  NEAR_SHADOW_DETAIL_MAX_MESHES, NEAR_SHADOW_DETAIL_NAMES, NEAR_VEHICLE_SHADOW_EXTENT_M, NEAR_VEHICLE_SHADOW_MAX,
  NEAR_VEHICLE_SHADOW_RANGE_M, VEHICLE_SHADOW_DETAIL_KEY, cascadeMaskForDepth, cascadeRangesFromBreaks,
  createNearVehicleShadowPolicy, markVehicleShadowDetail, vehicleShadowDetailOf,
} from './nearVehicleShadowDetail.ts';
import {
  getShadowCascadePolicy, registerShadowCascadeCamera, routeShadowOnlyLayer, setShadowCascadePolicy,
  shadowCascadeIndexOf, SHADOW_ONLY_LAYER,
} from './renderLayers.ts';

// Round 28 (2026-09-20, owner: "shadows look weird on tanks, verify this yourself from a shadow on a tank"):
// the nearest hulls cast their real armour into the cascade that covers them; every other hull, and every
// farther cascade, keeps the three convex proxies.

// --- cascade ranges: CSM breaks are fractions of min(camera.far, maxFar)
const ranges = cascadeRangesFromBreaks([0.1, 0.3, 0.6, 1.0], 0.5, 700);
assert.deepEqual(ranges.map((r) => [+r.near.toFixed(1), +r.far.toFixed(1)]), [[0.5, 70], [70, 210], [210, 420], [420, 700]]);
assert.equal(cascadeMaskForDepth(20, 6, ranges), 0b0001, 'a hull well inside cascade 0 casts only there');
assert.equal(cascadeMaskForDepth(68, 6, ranges), 0b0011, 'a hull straddling a split casts into both cascades');
assert.equal(cascadeMaskForDepth(300, 6, ranges), 0b0100);
assert.equal(cascadeMaskForDepth(900, 6, ranges), 0, 'beyond the last cascade nothing is selected');

// --- a scene with hulls at several depths
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.5, 2000);
camera.position.set(0, 5, 0); camera.lookAt(0, 0, -100); camera.updateMatrixWorld();
function hull(name, z, detailCount = 3) {
  const root = new THREE.Group(); root.name = name; root.position.set(0, 0, z);
  const detail = []; for (let i = 0; i < detailCount; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()); m.castShadow = false; m.name = `armour${i}`; root.add(m); detail.push(m); }
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial({ colorWrite: false })); proxy.castShadow = true; proxy.name = 'procShadow_hull'; root.add(proxy);
  markVehicleShadowDetail(root, { detail, proxies: [proxy] });
  scene.add(root); root.updateMatrixWorld(true);
  return { root, detail, proxy };
}
const near = hull('tank_near', -12), mid = hull('tank_mid', -40), split = hull('tank_split', -68), far = hull('tank_far', -150), behind = hull('tank_behind', 30);
const fifth = hull('tank_fifth', -50); const sixth = hull('tank_sixth', -60);
const unmarked = new THREE.Group(); unmarked.name = 'tank_unmarked'; unmarked.position.set(0, 0, -5); scene.add(unmarked);
assert.equal(vehicleShadowDetailOf(unmarked), null);
assert.ok(vehicleShadowDetailOf(near.root));
assert.equal(near.root.userData[VEHICLE_SHADOW_DETAIL_KEY].detail.length, 3);

let enabled = true;
const policy = createNearVehicleShadowPolicy({ camera, scene, cascadeRanges: () => ranges, enabled: () => enabled });
policy.update();
assert.deepEqual(policy.selected.map((s) => s.root.name), ['tank_near', 'tank_mid', 'tank_fifth', 'tank_sixth'],
  `the ${NEAR_VEHICLE_SHADOW_MAX} nearest hulls in front of the camera within ${NEAR_VEHICLE_SHADOW_RANGE_M} m, nearest first (the straddling hull at 68 m loses the cap)`);
assert.equal(NEAR_VEHICLE_SHADOW_MAX, 4); assert.equal(NEAR_VEHICLE_SHADOW_RANGE_M, 70); assert.equal(NEAR_VEHICLE_SHADOW_EXTENT_M, 6);
assert.ok(!policy.selected.some((s) => s.root === far.root || s.root === behind.root), 'far and behind-the-camera hulls keep their proxies');
assert.equal(policy.selected[0].cascadeMask, 0b0001);
{
  fifth.root.visible = false; sixth.root.visible = false; policy.update();
  assert.deepEqual(policy.selected.map((s) => s.root.name), ['tank_near', 'tank_mid', 'tank_split'], 'hidden hulls are skipped');
  assert.equal(policy.selected[2].cascadeMask, 0b0011, 'the hull straddling 70 m casts into cascades 0 and 1');
}

// --- flags flip only around the cascade that covers the hull, and are restored exactly
const light0 = new THREE.DirectionalLight(), light1 = new THREE.DirectionalLight(), light2 = new THREE.DirectionalLight();
registerShadowCascadeCamera(light0.shadow.camera, 0); registerShadowCascadeCamera(light1.shadow.camera, 1); registerShadowCascadeCamera(light2.shadow.camera, 2);
assert.equal(shadowCascadeIndexOf(light1), 1); assert.equal(shadowCascadeIndexOf(new THREE.DirectionalLight()), -1);
policy.beforeLight(light0, 0);
assert.ok(near.detail.every((m) => m.castShadow) && !near.proxy.visible, 'cascade 0: the near hull casts its armour, its proxy is hidden');
assert.ok(mid.detail.every((m) => m.castShadow) && split.detail.every((m) => m.castShadow));
assert.ok(far.detail.every((m) => !m.castShadow) && far.proxy.visible, 'the far hull is untouched');
policy.afterLight(light0, 0);
assert.ok(near.detail.every((m) => !m.castShadow) && near.proxy.visible, 'restored after the cascade');
policy.beforeLight(light1, 1);
assert.ok(near.detail.every((m) => !m.castShadow) && near.proxy.visible, 'cascade 1 does not cover the 12 m hull: proxies as before');
assert.ok(split.detail.every((m) => m.castShadow) && !split.proxy.visible, 'the straddling hull casts armour into cascade 1 as well');
policy.afterLight(light1, 1);
policy.beforeLight(light2, 2);
assert.ok(split.detail.every((m) => !m.castShadow) && split.proxy.visible);
policy.afterLight(light2, 2);
policy.beforeLight(new THREE.DirectionalLight(), -1);
assert.ok(near.detail.every((m) => !m.castShadow), 'an unregistered light flips nothing');
policy.afterLight(new THREE.DirectionalLight(), -1);
enabled = false; policy.update(); assert.equal(policy.selected.length, 0, 'disabled: every hull on proxies (mobile tier, low presets, debug)');
enabled = true; policy.update();

// --- the shadow router renders lights one at a time only while a policy is installed
{
  const calls = [];
  const renderer = { shadowMap: { render(lights, _scene, cam) { calls.push({ n: lights.length, mask: cam.layers.mask, name: lights[0]?.name }); } } };
  routeShadowOnlyLayer(renderer);
  const cam = new THREE.PerspectiveCamera(); const mask = cam.layers.mask;
  light0.name = 'c0'; light1.name = 'c1'; light2.name = 'c2';
  setShadowCascadePolicy(null);
  renderer.shadowMap.render([light0, light1, light2], scene, cam);
  assert.deepEqual(calls.map((c) => c.n), [3], 'no policy: the single three call');
  const order = [];
  setShadowCascadePolicy({ beforeLight(l, i) { order.push(`before:${l.name}:${i}`); }, afterLight(l, i) { order.push(`after:${l.name}:${i}`); } });
  assert.ok(getShadowCascadePolicy());
  calls.length = 0;
  renderer.shadowMap.render([light0, light1, light2], scene, cam);
  assert.deepEqual(calls.map((c) => [c.n, c.name]), [[1, 'c0'], [1, 'c1'], [1, 'c2']], 'with a policy: one render per light, in order');
  assert.ok(calls.every((c) => c.mask & (1 << SHADOW_ONLY_LAYER)), 'the proxy layer stays exposed for every cascade');
  assert.deepEqual(order, ['before:c0:0', 'after:c0:0', 'before:c1:1', 'after:c1:1', 'before:c2:2', 'after:c2:2']);
  assert.equal(cam.layers.mask, mask, 'the presentation mask is restored');
  calls.length = 0;
  renderer.shadowMap.render([light0], scene, cam);
  assert.deepEqual(calls.map((c) => c.n), [1], 'a single light (the deployment warm) is one plain call');
  const failing = { beforeLight() {}, afterLight() { order.push('after-throw'); } };
  setShadowCascadePolicy(failing);
  const throwing = { shadowMap: { render() { throw new Error('gl lost'); } } };
  routeShadowOnlyLayer(throwing);
  assert.throws(() => throwing.shadowMap.render([light0, light1], scene, cam));
  assert.equal(order[order.length - 1], 'after-throw', 'afterLight runs even when a cascade render throws');
  assert.equal(cam.layers.mask, mask);
  setShadowCascadePolicy(null);
}

// --- the detail vocabulary: silhouette armour, gun, track bands and instanced running gear; never greeble or pads
for (const name of ['hull', 'turret', 'gun', 'gunMount', 'hullDark', 'turretDetail', 'hullExternalArmor', 'gearTrackBandL', 'gearTrackBandR', 'gearRoadWheelDiscs', 'gearTrackPadsSimplified']) assert.ok(NEAR_SHADOW_DETAIL_NAMES.has(name), name);
for (const name of ['gearTrackPads', 'hullInteriorFill', 'decor_hull_steel', 'fx_impactDecals', 'gearSuspensionLinks', 'procShadow_hull']) assert.ok(!NEAR_SHADOW_DETAIL_NAMES.has(name), `${name} stays on the proxies`);
assert.equal(NEAR_SHADOW_DETAIL_MAX_MESHES, 28);

// --- wiring: the lighting module installs the policy and updates it per frame; the factory marks every hull
const lighting = readFileSync(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lighting, /registerShadowCascadeCamera\(csm\.lights\[i\]\.shadow\.camera, i\)/, 'every CSM cascade camera is registered with the router');
assert.match(lighting, /setShadowCascadePolicy\(nearVehiclePolicy\)/);
assert.match(lighting, /updateCasterProxies\(csm\.lights, scene, false\);\n\s*nearVehiclePolicy\.update\(\);/, 'the selection refreshes with the caster proxies every lighting update');
assert.match(lighting, /getDeviceTier\(\) !== 'mobile' && preset\.shadowMapSizes\[0\] >= 2048/, 'desktop tiers with a 2K+ near cascade only');
assert.match(lighting, /__SHADOW_DEBUG\?\.noVehicleDetail/, 'A/B probes can keep every hull on proxies');
const factory = readFileSync(new URL('../vehicles/tankFactoryCore.ts', import.meta.url), 'utf8');
assert.match(factory, /markVehicleShadowDetail\(root, \{\n\s*detail: collectNearShadowDetail\(\[hullG, turretG, gunG, recoilG\]\),\n\s*proxies: proceduralShadowSources,/, 'each built hull publishes its detail set and proxies');
assert.match(factory, /'hullFixedPaintedBodywork', \.\.\.\(additionalSources\?\.hull \?\? \[\]\)\]\), PROC_SHADOW_BODY_INSET_M\)/,
  'the convex proxies keep their armour-only support points (suppliedShadowCoverage pins them byte-exact); the running gear shadows through the detail set');
console.log('nearVehicleShadowDetail: cascade ranges, nearest-hull selection and cap, per-cascade flag flips with exact restore, per-light router split, detail vocabulary, lighting/factory wiring');
