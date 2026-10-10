// Receipt for the static shadow-caster cache (engine/shadowStaticCache.ts, P20): the invalidation rules (snapped
// pose, static content, forced frames, arming once per frame, the debug switch, map reallocation, a failed copy),
// the two-pass render (the static layer with every dynamic caster hidden, the dynamic layer on the copied depth with
// the static subtrees hidden and the clear suppressed), the promotion of world casters that move on consecutive
// frames and their return once still, the settle rule (a cascade whose pose is still moving renders the ordinary way),
// and the router's use of the cache (renderLayers.ts).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  STATIC_SHADOW_DEMOTE_FRAMES, STATIC_SHADOW_PROMOTE_FRAMES, STATIC_SHADOW_SETTLE_FRAMES, casterSignature, createShadowStaticCache,
  isStaticShadowRoot,
  planCascade, samePose, stepCasterMotion, writeCascadePose,
} from './shadowStaticCache.ts';
import {
  registerShadowCascadeCamera, routeShadowOnlyLayer, setShadowCascadeCache, setShadowCasterDynamicMask,
} from './renderLayers.ts';

// ---------------------------------------------------------------------------------------------- pure rules

{
  const base = { armed: true, hasTarget: true, settled: true, slotValid: true, poseSame: true, contentSame: true, forced: false };
  assert.equal(planCascade(base), 'reuse', 'a still pose over still content reuses the static copy');
  assert.equal(planCascade({ ...base, poseSame: false }), 'rebuild', 'a cascade snap (or a sun move) re-renders the static layer');
  assert.equal(planCascade({ ...base, contentSame: false }), 'rebuild', 'a static content change re-renders');
  assert.equal(planCascade({ ...base, forced: true }), 'rebuild', 'a forced frame re-renders');
  assert.equal(planCascade({ ...base, slotValid: false }), 'rebuild', 'no copy yet');
  assert.equal(planCascade({ ...base, armed: false }), 'full', 'an unarmed render is the ordinary render');
  assert.equal(planCascade({ ...base, hasTarget: false }), 'full');
  assert.equal(planCascade({ ...base, settled: false }), 'full', 'a cascade still moving renders the ordinary way');
  assert.equal(planCascade({ ...base, settled: false, poseSame: false }), 'full', 'no re-render while it moves');
}
{
  const light = new THREE.DirectionalLight();
  light.position.set(1, 2, 3); light.target.position.set(1.5, 1, 3.2);
  Object.assign(light.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 2000 });
  light.shadow.mapSize.set(2048, 2048);
  const a = writeCascadePose(light, new Float64Array(13));
  const b = writeCascadePose(light, new Float64Array(13));
  assert.ok(samePose(a, b));
  light.position.x += 0.09; // one texel of a 2048 map over a 190 m box
  assert.ok(!samePose(a, writeCascadePose(light, new Float64Array(13))), 'a snapped texel step is a new pose');
  light.position.x -= 0.09;
  light.shadow.camera.right = 51;
  assert.ok(!samePose(a, writeCascadePose(light, new Float64Array(13))), 'a regridded box is a new pose');
  light.shadow.camera.right = 50;
  light.shadow.mapSize.set(1024, 1024);
  assert.ok(!samePose(a, writeCascadePose(light, new Float64Array(13))), 'a resized map is a new pose');
}
{
  const r = { sig: 1, changedRun: 0, stillRun: 0, dynamic: false };
  assert.equal(stepCasterMotion(r, 1), 'none');
  assert.equal(stepCasterMotion(r, 2), 'changed', 'one change: re-render the static layer, stay static');
  assert.equal(STATIC_SHADOW_PROMOTE_FRAMES, 2);
  assert.equal(stepCasterMotion(r, 3), 'promote', 'a second consecutive change: the caster is moving, draw it every frame');
  assert.equal(stepCasterMotion(r, 4), 'none', 'a dynamic caster changing again costs no re-render');
  for (let i = 1; i < STATIC_SHADOW_DEMOTE_FRAMES; i++) assert.equal(stepCasterMotion(r, 4), 'none');
  assert.equal(stepCasterMotion(r, 4), 'demote', `still for ${STATIC_SHADOW_DEMOTE_FRAMES} frames: back to the static layer`);
  assert.equal(r.dynamic, false);
}
{
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 4);
  mesh.castShadow = true;
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(4), 1);
  mesh.geometry.setAttribute('aLodF', fade);
  const s0 = casterSignature(mesh);
  assert.equal(casterSignature(mesh), s0, 'the signature is a pure function of the caster');
  mesh.instanceMatrix.needsUpdate = true;
  const s1 = casterSignature(mesh);
  assert.notEqual(s1, s0, 'an instance write (a destruction, a topple step) changes the signature');
  fade.needsUpdate = true;
  const s2 = casterSignature(mesh);
  assert.notEqual(s2, s1, 'an instanced fade stream changes it');
  mesh.count = 3;
  const s3 = casterSignature(mesh);
  assert.notEqual(s3, s2, 'a count change does');
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12), 3);
  mesh.instanceColor.needsUpdate = true;
  assert.equal(casterSignature(mesh), s3, 'colour streams never reach the depth pass');
  mesh.matrixWorld.elements[13] += 0.02;
  const s4 = casterSignature(mesh);
  assert.notEqual(s4, s3, 'a moved world matrix does (a moored hull)');
  setShadowCasterDynamicMask(mesh, 0b0011);
  const s5 = casterSignature(mesh);
  assert.notEqual(s5, s4, 'the router\'s dynamic cascade mask is part of what the cascade draws');
  setShadowCasterDynamicMask(mesh, null);
  mesh.material.needsUpdate = true;
  assert.notEqual(casterSignature(mesh), s4, 'a material version change does');
  mesh.castShadow = false;
  assert.notEqual(casterSignature(mesh), casterSignature(Object.assign(mesh, { castShadow: true })));
  // destruction (2026-10-07): a shape only the GPU changes (the structure mask on a props bucket) reaches the hash
  // through the owner's epoch, bumped on every frame it changes (world structureDamage(id).touchShadows())
  const s6 = casterSignature(mesh);
  mesh.userData.cotShadowEpoch = 1;
  const s7 = casterSignature(mesh);
  assert.notEqual(s7, s6, 'a shadow epoch bump does');
  assert.equal(casterSignature(mesh), s7, 'and holds until the next bump');
  mesh.userData.cotShadowEpoch = 2;
  assert.notEqual(casterSignature(mesh), s7);
}

// ---------------------------------------------------------------------------------------------- the two passes

function fixture() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  world.name = 'world-test';
  world.userData.matrixTraversalFrozen = true;
  const terrain = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshStandardMaterial());
  terrain.castShadow = true; terrain.name = 'terrain';
  const trees = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 8);
  trees.castShadow = true; trees.name = 'trees';
  const props = new THREE.Group(); props.name = 'props';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  hull.castShadow = true; hull.name = 'moored-hull';
  const crate = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  crate.castShadow = true; crate.name = 'crate';
  props.add(hull, crate);
  world.add(terrain, trees, props);
  const tank = new THREE.Group(); tank.name = 'tank_1';
  const tankProxy = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  tankProxy.castShadow = true; tankProxy.name = 'tank-proxy';
  tank.add(tankProxy);
  const light = new THREE.DirectionalLight();
  light.castShadow = true;
  Object.assign(light.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 2000 });
  light.shadow.mapSize.set(256, 256);
  light.shadow.autoUpdate = false;
  scene.add(world, tank, light, light.target);
  const live = new THREE.WebGLRenderTarget(256, 256, { depthTexture: new THREE.DepthTexture(256, 256) });
  light.shadow.map = live;
  const log = [];
  let copyFails = false;
  const renderer = {
    info: { render: { calls: 0 } },
    clear() { log.push({ kind: 'clear' }); },
    copyTextureToTexture(src, dst) {
      if (copyFails) throw new Error('blit refused');
      log.push({ kind: 'copy', from: src === live.depthTexture ? 'live' : 'cache', to: dst === live.depthTexture ? 'live' : 'cache' });
    },
    initRenderTarget(target) { log.push({ kind: 'init', width: target.width }); },
  };
  const realClear = renderer.clear;
  /** three's per-light render: a clear, then every visible caster drawn (one call each). */
  const render = () => {
    renderer.clear();
    const drawn = [];
    scene.traverseVisible((o) => { if (o.isMesh && o.castShadow) { drawn.push(o.name); renderer.info.render.calls++; } });
    log.push({ kind: 'render', drawn, cleared: renderer.clear === realClear, needsUpdate: light.shadow.needsUpdate });
    light.shadow.needsUpdate = false;
  };
  return { scene, world, terrain, trees, props, hull, crate, tank, tankProxy, light, live, log, renderer, render,
    failCopies() { copyFails = true; } };
}

function frame(f, cache, { forced = false, enabled = true, mutate = null } = {}) {
  mutate?.();
  cache.beginFrame({ scene: f.scene, lights: [f.light], forced, enabled });
  f.light.shadow.needsUpdate = true;
  f.log.length = 0;
  const handled = cache.renderCascade(f.renderer, f.render, [f.light], f.light, 0, f.scene, f.camera ?? new THREE.Camera());
  if (!handled) f.render();
  return { handled, log: f.log.slice() };
}

/** The frames a new pose must hold before the cache takes the cascade (ordinary renders). */
function settle(f, cache) {
  for (let i = 0; i < STATIC_SHADOW_SETTLE_FRAMES; i++) assert.equal(frame(f, cache).handled, false, 'settling: the ordinary render');
}

const renders = (log) => log.filter((e) => e.kind === 'render');
const copies = (log) => log.filter((e) => e.kind === 'copy').map((e) => `${e.from}>${e.to}`);

{
  const f = fixture();
  assert.ok(isStaticShadowRoot(f.world) && !isStaticShadowRoot(f.tank));
  const cache = createShadowStaticCache();
  assert.equal(STATIC_SHADOW_SETTLE_FRAMES, 2);
  settle(f, cache);
  let r = frame(f, cache);
  assert.equal(r.handled, true);
  let [staticPass, dynamicPass] = renders(r.log);
  assert.deepEqual(staticPass.drawn, ['terrain', 'trees', 'moored-hull', 'crate'], 'the static layer: the frozen world alone');
  assert.equal(staticPass.cleared, true, 'the static layer starts from a cleared map');
  assert.deepEqual(copies(r.log), ['live>cache'], 'the static depth is copied out once');
  assert.deepEqual(dynamicPass.drawn, ['tank-proxy'], 'the dynamic layer: every caster outside the frozen world');
  assert.equal(dynamicPass.cleared, false, 'the dynamic layer draws on the static depth: no clear');
  assert.equal(dynamicPass.needsUpdate, true, 'the dynamic pass re-arms the light three just rendered');
  for (const o of [f.world, f.tank, f.terrain, f.trees, f.props, f.hull, f.crate, f.tankProxy]) assert.equal(o.visible, true, `${o.name} restored`);
  assert.equal(f.renderer.clear.name, 'clear', 'the clear is restored');

  r = frame(f, cache);
  assert.deepEqual(renders(r.log).map((e) => e.drawn), [['tank-proxy']], 'a still frame draws only the dynamic casters');
  assert.deepEqual(copies(r.log), ['cache>live'], 'after the copy of the static depth back into the live map');
  assert.equal(cache.telemetry().reuses[0], 1);

  // a snapped pose change: the ordinary render while it moves, then one re-render once it holds
  r = frame(f, cache, { mutate: () => { f.light.position.x += 0.4; } });
  assert.equal(r.handled, false, 'the frame of the snap renders the ordinary way');
  assert.deepEqual(renders(r.log)[0].drawn, ['terrain', 'trees', 'moored-hull', 'crate', 'tank-proxy']);
  for (let i = 1; i < STATIC_SHADOW_SETTLE_FRAMES; i++) assert.equal(frame(f, cache).handled, false, 'and while it settles');
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 2, 'held: the static layer is re-rendered at the new pose');
  assert.equal(cache.telemetry().lastRebuildReason, 'pose');
  // a camera on the move (a new snap every frame) never pays the two passes and the copy
  const before = cache.telemetry();
  for (let i = 0; i < 6; i++) {
    r = frame(f, cache, { mutate: () => { f.light.position.x += 0.4; } });
    assert.equal(r.handled, false, 'moving: the ordinary render');
    assert.deepEqual(copies(r.log), [], 'no copy while moving');
  }
  const after = cache.telemetry();
  assert.equal(after.unsettled - before.unsettled, 6);
  assert.equal(after.rebuilds[0], before.rebuilds[0], 'no re-render while moving');
  f.light.position.x -= 2.4;
  settle(f, cache);
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 2, 'back at a held pose: one re-render');

  r = frame(f, cache, { mutate: () => { f.trees.instanceMatrix.needsUpdate = true; } });
  assert.equal(renders(r.log).length, 2, 'a destroyed instance re-renders the static layer');
  assert.equal(cache.telemetry().lastRebuildReason, 'content');
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 1, 'one change is one re-render');

  // a forced frame redraws every cascade the ordinary way (2026-10-08: a shot-mode page forces every frame, and the cache's
  // two passes and copy for a layer the next forced frame discards cost 4.4 ms of GPU a frame), then one re-render
  r = frame(f, cache, { forced: true });
  assert.equal(r.handled, false, 'a forced frame renders the ordinary way');
  assert.deepEqual(renders(r.log).map((e) => e.drawn), [['terrain', 'trees', 'moored-hull', 'crate', 'tank-proxy']]);
  assert.deepEqual(copies(r.log), [], 'no copy on a forced frame');
  r = frame(f, cache, { forced: true });
  assert.equal(r.handled, false, 'nor on the forced frames after it');
  assert.equal(cache.telemetry().forcedFrames, 2);
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 2, 'the first unforced frame re-renders the static layer, once');
  assert.equal(cache.telemetry().lastRebuildReason, 'forced');
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 1, 'and the next reuses it');

  // the moored hull bobs every frame: first one re-render, then it leaves the static layer for good
  const bob = () => { f.hull.position.y += 0.01; f.hull.updateMatrixWorld(); };
  r = frame(f, cache, { mutate: bob });
  assert.equal(renders(r.log).length, 2);
  r = frame(f, cache, { mutate: bob });
  [staticPass, dynamicPass] = renders(r.log);
  assert.deepEqual(staticPass.drawn, ['terrain', 'trees', 'crate'], 'the promoted hull is no longer part of the static layer');
  assert.deepEqual(dynamicPass.drawn, ['moored-hull', 'tank-proxy'], 'it is drawn every frame on top, with the hulls');
  for (let i = 0; i < 5; i++) {
    r = frame(f, cache, { mutate: bob });
    assert.deepEqual(renders(r.log).map((e) => e.drawn), [['moored-hull', 'tank-proxy']], 'a dynamic world caster moving costs no re-render');
  }
  assert.equal(cache.telemetry().promoted, 1);
  assert.equal(f.props.visible && f.terrain.visible && f.crate.visible, true, 'the static cover is restored after the dynamic pass');
  for (let i = 0; i < STATIC_SHADOW_DEMOTE_FRAMES - 1; i++) frame(f, cache);
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 2, 'once still, the hull rejoins the static layer (one re-render)');
  assert.deepEqual(renders(r.log)[0].drawn, ['terrain', 'trees', 'moored-hull', 'crate']);
  assert.equal(cache.telemetry().demotions, 1);

  // a reuse always copies the static layer back (the live map may hold a render the cache did not make: the
  // deployment warm, the covered prime, a second render in a frame)
  f.tank.visible = false;
  frame(f, cache);
  r = frame(f, cache);
  assert.deepEqual(copies(r.log), ['cache>live'], 'even after a dynamic pass that drew nothing');
  f.tank.visible = true;

  // arming: one render per cascade per lighting update
  f.light.shadow.needsUpdate = true;
  assert.equal(cache.renderCascade(f.renderer, f.render, [f.light], f.light, 0, f.scene, new THREE.Camera()), false,
    'a second render in the same frame is the ordinary render');
  cache.disarm();
  r = frame(f, cache, { enabled: false });
  assert.equal(r.handled, false, '__SHADOW_DEBUG.noStaticCache: the ordinary render');
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 2, 're-enabled: the static layer is rebuilt before it is trusted (the pose held throughout)');

  // a reallocated map (preset change): a new copy target of the new size
  const resized = new THREE.WebGLRenderTarget(128, 128, { depthTexture: new THREE.DepthTexture(128, 128) });
  f.light.shadow.map = resized;
  f.light.shadow.mapSize.set(128, 128);
  r = frame(f, cache); // the map size is part of the pose: this frame and the next settle
  assert.equal(r.handled, false);
  assert.ok(r.log.some((e) => e.kind === 'init' && e.width === 128), 'the copy target follows the live map size');
  for (let i = 1; i < STATIC_SHADOW_SETTLE_FRAMES; i++) assert.equal(frame(f, cache).handled, false);
  r = frame(f, cache);
  assert.equal(renders(r.log).length, 2);
  f.light.shadow.map = null;
  r = frame(f, cache);
  assert.equal(r.handled, false, 'a light without its map renders the ordinary way (three allocates it)');

  // a refused blit fails open for the session
  f.light.shadow.map = f.live;
  f.light.shadow.mapSize.set(256, 256);
  settle(f, cache);
  f.failCopies();
  r = frame(f, cache);
  assert.equal(r.handled, true);
  const last = renders(r.log).at(-1);
  assert.deepEqual(last.drawn, ['terrain', 'trees', 'moored-hull', 'crate', 'tank-proxy'], 'the failed frame renders every caster');
  assert.ok(cache.telemetry().failed);
  r = frame(f, cache);
  assert.equal(r.handled, false, 'and the cache stays off');
  cache.dispose();
}

{
  // no frozen world root (the Garage, a sandbox): never armed
  const f = fixture();
  f.world.userData.matrixTraversalFrozen = false;
  const cache = createShadowStaticCache();
  assert.equal(frame(f, cache).handled, false);
}

// ---------------------------------------------------------------------------------------------- the router

{
  const camera = new THREE.PerspectiveCamera();
  const scene = new THREE.Scene();
  const lights = [new THREE.DirectionalLight(), new THREE.DirectionalLight()];
  lights.forEach((l, i) => registerShadowCascadeCamera(l.shadow.camera, i));
  const seen = [];
  const renderer = { shadowMap: { render(ls) { seen.push(['three', ls.length]); } } };
  routeShadowOnlyLayer(renderer);
  const calls = [];
  setShadowCascadeCache({ renderCascade(r, render, single, light, index) {
    calls.push([r === renderer, index]);
    if (index === 0) { render(single, scene, camera); return true; }
    return false;
  } });
  renderer.shadowMap.render(lights, scene, camera);
  setShadowCascadeCache(null);
  assert.deepEqual(calls, [[true, 0], [true, 1]], 'the router offers every cascade to the cache with its renderer');
  assert.deepEqual(seen, [['three', 1], ['three', 1]], 'a declined cascade still renders the ordinary way, one light at a time');
  seen.length = 0;
  renderer.shadowMap.render([lights[0]], scene, camera);
  assert.deepEqual(seen, [['three', 1]], 'a single-light render (the deployment warm) never consults the cache');
}

// lighting.ts arms the cache last in its update, after the caster masks it hashes, and disarms on a dormant frame
{
  const lighting = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
  assert.match(lighting, /evaluateCasterProfiles\(false\);\s*if \(!staticShadowCacheRequested && scene\.children\.some\(isFrozenWorldRoot\)\) requestStaticShadowCache\(\);\s*\/\/ last:[^\n]*\n\s*staticShadowCache\?\.beginFrame\(/,
    'the cache hashes the static content after this frame\'s caster profiles');
  assert.match(lighting, /consumeDormantOrPrimedFrame\(force\)\) \{ staticShadowCache\?\.disarm\(\); return; \}/);
  // the module loads with the first battle world, outside the boot entry (tools/bundle-budget.mjs); phones never ask
  assert.match(lighting, /let staticShadowCacheRequested = mobileTier;/, 'phones keep the plain render');
  assert.match(lighting, /import\('\.\/shadowStaticCache\.ts'\)\.then\(\(module\) => \{\s*staticShadowCache = module\.createShadowStaticCache\(\);\s*setShadowCascadeCache\(staticShadowCache\);/);
  assert.doesNotMatch(lighting, /^import \{[^}]*\} from '\.\/shadowStaticCache\.ts';/m, 'no static import pulls the cache into the entry');
  assert.match(lighting, /const isFrozenWorldRoot = \(object: THREE\.Object3D\): boolean => object\.userData\.matrixTraversalFrozen === true;/,
    'the trigger is the same frozen world root the cache partitions on');
  assert.equal(isStaticShadowRoot({ userData: { matrixTraversalFrozen: true } }), true);
  assert.match(lighting, /function forceAllCascades\(\): void \{[\s\S]{0,80}staticShadowCache\?\.invalidate\('force'\)/);
  assert.match(lighting, /invalidateShadowMaps\(\): void \{[\s\S]{0,140}staticShadowCache\?\.dispose\(\)/);
}

console.log('shadow static cache: pose/content invalidation, forced frames the ordinary way, two-pass render, promotion and demotion, the settle rule, arming, fail-open, router PASS');
