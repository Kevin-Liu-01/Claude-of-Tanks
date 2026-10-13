// battleWorldProgramWarm.selftest.mjs — option E (2026-10-13, the perf stream): the battle world's terrain programs link,
// and their GPU pipelines compile, while the world builds, only under the light signature the battle draws with.
// 1. lightSignature counts what three.js keys a lit program by (visible lights the camera sees, their shadows).
// 2. The warm's state machine: ignored while disarmed or for another map; waits for the battle's lights; submits once per
//    root per armed entry; polls links; draws only under the signature it compiled with; abandons on a disarm, a lost
//    context, a compile error or a deadline, never touching the renderer afterwards.
// 3. The renderer ports: the compile targets the scene pass's target; the pipeline draw renders one proxy per distinct
//    material into an 8 x 8 target of the scene target's formats, every other renderable hidden, the shadow pass not run,
//    the background off — and every flag, target and router restored in the same task.
// 4. The wiring: the world build offers its terrain the moment it stands; the solo entry makes the signature final under
//    the painted cover before the world is acquired; the Garage return disarms; the module stays out of the boot graph.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createBattleWorldProgramWarm, createRendererWorldProgramWarm, lightSignature } from './battleWorldProgramWarm.ts';

// ---- 1. the light signature
{
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  const fill = new THREE.DirectionalLight();
  const spot = new THREE.SpotLight(); spot.map = new THREE.Texture();
  const hidden = new THREE.PointLight(); hidden.visible = false;
  const elsewhere = new THREE.PointLight(); elsewhere.layers.set(5);
  const group = new THREE.Group(); group.visible = false; group.add(new THREE.PointLight());
  scene.add(sun, fill, spot, new THREE.PointLight(), new THREE.HemisphereLight(), new THREE.AmbientLight(), hidden, elsewhere, group);
  assert.equal(lightSignature(scene, camera), 'dir 2/1 spot 1/0/1 point 1/0 hemi 1 rect 0 probe 0',
    'visible lights the camera sees, by kind, with their shadows and maps; ambient light keys no program');
  const before = lightSignature(scene, camera);
  scene.add(new THREE.PointLight(0xffffff, 0));
  assert.notEqual(lightSignature(scene, camera), before, 'a dark light still changes the signature (three counts it)');
}

// ---- 2. the state machine
function harness({ final = true, linkAfter = 2, compileError = null, fenceAfter = 3 } = {}) {
  const state = {
    final, clock: 0, compiles: [], draws: [], published: [], alive: true, signature: 'battle',
    links: new Map(), linkAfter, compileError, fenceAfter, fences: 0, drainedAt: null,
  };
  const material = (name) => ({ name });
  const ports = {
    isSignatureFinal: () => state.final,
    signature: () => state.signature,
    compile: (root) => {
      if (state.compileError) throw state.compileError;
      state.compiles.push(root);
      const materials = root.materials;
      for (const m of materials) state.links.set(m, state.linkAfter);
      return materials;
    },
    isLinked: (m) => {
      const left = state.links.get(m) ?? 0;
      state.links.set(m, left - 1);
      return left <= 0;
    },
    lifetime: () => () => state.alive,
    fence: () => { state.fences++; let polls = state.fenceAfter; return () => { if (--polls >= 0) return false; state.drainedAt ??= state.clock; return true; }; },
    drawPipelines: (root) => { assert.notEqual(state.drainedAt, null, 'the draw waits for the GPU queue to drain'); state.draws.push(root); return root.materials.length; },
    wait: async (ms) => { state.clock += ms; await new Promise((resolve) => setImmediate(resolve)); },
    now: () => state.clock,
    publish: (receipt) => state.published.push(receipt.status),
  };
  const warm = createBattleWorldProgramWarm(ports);
  const root = (n = 2) => ({ materials: Array.from({ length: n }, (_, i) => material(`m${i}`)) });
  return { state, warm, root };
}

{
  const { state, warm, root } = harness();
  const terrain = root(3);
  warm.offer(terrain, 'verdant');
  assert.equal(await warm.settled(), null, 'disarmed (the Garage, the Studio, a background build): no warm');
  warm.arm('railyard');
  warm.offer(terrain, 'verdant');
  assert.equal(state.compiles.length, 0, 'another map\'s world is ignored');
  warm.offer(terrain, 'railyard');
  warm.offer(terrain, 'railyard');
  const receipt = await warm.settled();
  assert.equal(state.compiles.length, 1, 'one submission per root per armed entry');
  assert.equal(receipt.status, 'drawn');
  assert.equal(receipt.materials, 3);
  assert.equal(receipt.pending, 0);
  assert.equal(receipt.drawn, 3);
  assert.equal(receipt.signature, 'battle');
  assert.equal(receipt.drawSignature, 'battle');
  assert.ok(receipt.linkedMs >= 32, 'the links are polled, never waited on synchronously');
  assert.deepEqual(state.draws, [terrain], 'the pipelines draw once the links land');
  assert.equal(state.fences, 1, 'one fence per warm');
  assert.ok(receipt.fenceMs >= 48, `the fence is polled across tasks (${receipt.fenceMs} ms), never waited on`);
  assert.deepEqual(state.published, ['waiting-for-lights', 'linking', 'drawn']);
  warm.arm('railyard');
  warm.offer(terrain, 'railyard');
  await warm.settled();
  assert.equal(state.compiles.length, 2, 'a retried entry on the cached world warms it again');
}

{
  const { state, warm, root } = harness({ final: false });
  warm.arm('urban');
  const terrain = root();
  warm.offer(terrain, 'urban');
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.compiles.length, 0, 'nothing is submitted while the FX and kill-cam pools are still loading');
  assert.equal(warm.receipt.status, 'waiting-for-lights');
  state.final = true;
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'drawn', 'the submission follows the battle lights');
  assert.equal(state.compiles.length, 1);
}

{
  const { state, warm, root } = harness({ final: false });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'abandoned', 'lights that never settle leave the programs to the deployment warm');
  assert.match(receipt.error, /never settled/);
  assert.equal(state.compiles.length, 0);
}

{
  const { state, warm, root } = harness({ linkAfter: 50 });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  await new Promise((resolve) => setImmediate(resolve));
  warm.disarm(); // a failed entry returned to the Garage
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'abandoned');
  assert.equal(receipt.pending, 2, 'the receipt names what had not linked');
  assert.equal(state.draws.length, 0, 'an abandoned warm never draws');
  warm.offer(root(), 'urban');
  assert.equal(state.compiles.length, 1, 'disarmed again: later offers are ignored');
}

{
  const { state, warm, root } = harness({ linkAfter: 50 });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  await new Promise((resolve) => setImmediate(resolve));
  state.alive = false; // the context was lost mid-build
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'abandoned');
  assert.match(receipt.error, /context lost/);
  assert.equal(state.draws.length, 0);
}

{
  const { state, warm, root } = harness();
  state.alive = false;
  warm.arm('urban');
  warm.offer(root(), 'urban');
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'abandoned', 'a context already lost submits nothing');
  assert.equal(state.compiles.length, 0);
}

{
  const { state, warm, root } = harness({ fenceAfter: 1e9 });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  for (let i = 0; i < 8; i++) await new Promise((resolve) => setImmediate(resolve));
  warm.disarm(); // the Garage came back while the GPU queue was still busy
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'abandoned', 'a disarm during the fence wait abandons');
  assert.equal(state.draws.length, 0);
}

{
  const { state, warm, root } = harness({ fenceAfter: 1e9 });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'link-timeout', 'a GPU queue that never drains leaves the draw to the deployment warm');
  assert.match(receipt.error, /never drained/);
  assert.equal(state.draws.length, 0);
}

{
  const { state, warm, root } = harness({ linkAfter: 3 });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  await new Promise((resolve) => setImmediate(resolve));
  state.signature = 'garage'; // something re-lit the scene between the submission and the draw
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'signature-moved', 'a draw under another signature would link synchronously: skipped');
  assert.equal(state.draws.length, 0);
}

{
  const { state, warm, root } = harness({ linkAfter: 1e9 });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'link-timeout', 'a driver that never finishes leaves the strict warm in charge');
  assert.equal(state.draws.length, 0);
}

{
  const { state, warm, root } = harness({ compileError: new Error('reflection failed') });
  warm.arm('urban');
  warm.offer(root(), 'urban');
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'compile-error');
  assert.match(receipt.error, /reflection failed/);
  assert.equal(state.draws.length, 0);
}

// ---- 3. the renderer ports
{
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  scene.background = new THREE.Color(0x334455);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(), new THREE.MeshBasicMaterial());
  const hiddenAlready = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()); hiddenAlready.visible = false;
  const sun = new THREE.DirectionalLight(); sun.castShadow = true;
  scene.add(sky, hiddenAlready, sun);
  const sceneTarget = new THREE.WebGLRenderTarget(64, 64, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(64, 64), stencilBuffer: false, samples: 4,
  });
  // the terrain under construction: not in the scene; two chunks share a material, a skirt has its own, a dressing
  // instanced mesh is left to the warm; the splat carries a per-draw hook (lighting.ts's receiver-only shadow guard)
  const terrain = new THREE.Group(); terrain.name = 'terrain';
  const splat = new THREE.MeshStandardMaterial(), skirt = new THREE.MeshStandardMaterial(), hooked = new THREE.MeshStandardMaterial();
  const hookSaw = [];
  splat.onBeforeRender = function (_renderer, _scene, _camera, _geometry, object) { hookSaw.push([object.castShadow, object.userData.chunk]); };
  const chunkA = new THREE.Mesh(new THREE.PlaneGeometry(), splat), chunkB = new THREE.Mesh(new THREE.PlaneGeometry(), splat);
  chunkA.userData.chunk = 'a'; chunkA.castShadow = true;
  chunkB.visible = false; // a coarse level not shown yet still keys the same program
  const skirtMesh = new THREE.Mesh(new THREE.PlaneGeometry(), skirt);
  const pebbles = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial(), 4);
  terrain.add(chunkA, chunkB, skirtMesh, pebbles, new THREE.Mesh(new THREE.PlaneGeometry(), hooked));
  // WebGL2's fence: busy for two polls, then signalled
  const gl = { lost: false, isContextLost() { return this.lost; },
    SYNC_GPU_COMMANDS_COMPLETE: 0x9117, TIMEOUT_EXPIRED: 0x911b, ALREADY_SIGNALED: 0x911a, fences: [], deleted: 0,
    fenceSync() { const sync = { polls: 0 }; this.fences.push(sync); return sync; }, flush() {},
    clientWaitSync(sync, flags, timeout) { assert.equal(timeout, 0, 'never a blocking wait'); return ++sync.polls > 2 ? this.ALREADY_SIGNALED : this.TIMEOUT_EXPIRED; },
    deleteSync() { this.deleted++; } };
  const resident = new Map(), programUniforms = new Map();
  const texture = (name) => { const t = new THREE.Texture(); t.name = name; t.needsUpdate = true; return t; };
  const grass = texture('grass'), rock = texture('rock'), uploaded = texture('uploaded'), empty = new THREE.Texture();
  resident.set(uploaded, { __webglTexture: {}, __version: uploaded.version });
  const depth = new THREE.DepthTexture(4, 4); depth.isRenderTargetTexture = true; depth.version = 3;
  programUniforms.set(splat, { uGrass: { value: grass }, uLayers: { value: [rock, grass] }, uDone: { value: uploaded },
    uEmpty: { value: empty }, uDepth: { value: depth }, uScalar: { value: 2 } });
  const programs = new Map();
  const log = [];
  const shadowRender = function routedShadowRender() {};
  let target = null;
  const renderer = {
    info: {}, shadowMap: { render: shadowRender },
    getContext: () => gl,
    getRenderTarget: () => target,
    getActiveCubeFace: () => 0,
    getActiveMipmapLevel: () => 0,
    setRenderTarget: (next) => { target = next; },
    // a program's uniforms (onBeforeCompile's included) as three keeps them; textures resident once uploaded
    properties: { get: (item) => (item.isTexture ? (resident.get(item) ?? {}) : { currentProgram: programs.get(item), uniforms: programUniforms.get(item) }) },
    initTexture(texture) { log.push(['upload', texture.name]); resident.set(texture, { __webglTexture: {}, __version: texture.version }); },
    compile(root, cam, targetScene) {
      log.push(['compile', target, targetScene]);
      const materials = new Set();
      root.traverse((object) => { if (object.isMesh && !programs.has(object.material)) { materials.add(object.material); programs.set(object.material, { id: 100 + programs.size, polls: 0, isReady() { return ++this.polls > 1; } }); } });
      return materials;
    },
    render(renderScene, cam) {
      const visible = [];
      renderScene.traverseVisible((object) => { if (object.isMesh) visible.push(object); });
      for (const mesh of visible) mesh.material.onBeforeRender(renderer, renderScene, cam, mesh.geometry, mesh, null);
      log.push(['render', target, visible, renderer.shadowMap.render !== shadowRender, renderScene.background]);
    },
  };
  const receipts = [];
  let final = true;
  const warm = createRendererWorldProgramWarm({
    renderer, scene, camera, getSceneTarget: () => sceneTarget, isSignatureFinal: () => final,
    publish: (receipt) => receipts.push(receipt),
  });
  warm.arm('railyard');
  warm.offer(terrain, 'railyard');
  const receipt = await warm.settled();
  assert.equal(receipt.status, 'drawn', JSON.stringify(receipt));
  assert.equal(receipt.materials, 4, 'every terrain material is submitted (the link needs no draw)');
  assert.equal(receipt.drawn, 3, 'one pipeline draw per distinct material, the instanced dressing left to the warm');
  assert.deepEqual(receipt.programIds, [100, 101, 102, 103], 'the receipt names the programs the battle should draw with');
  assert.deepEqual(log.filter((entry) => entry[0] === 'upload').map((entry) => entry[1]), ['grass', 'rock'],
    'the textures the draw binds that are not resident upload first, each once (resident, empty and render targets aside)');
  assert.equal(receipt.textures, 2);
  assert.equal(gl.fences.length, 1); assert.equal(gl.fences[0].polls, 3); assert.equal(gl.deleted, 1, 'the fence is polled until signalled, then deleted');
  assert.equal(log.findIndex((entry) => entry[0] === 'render'), 3, 'and only then the draw');
  const [compile, , , render] = log;
  assert.equal(compile[0], 'compile');
  assert.strictEqual(compile[1], sceneTarget, 'the programs are keyed by the scene pass\'s target');
  assert.strictEqual(compile[2], scene, 'with the scene\'s lights, fog and environment');
  assert.equal(render[0], 'render');
  assert.notStrictEqual(render[1], sceneTarget);
  assert.equal(render[1].width, 8); assert.equal(render[1].height, 8);
  assert.equal(render[1].samples, 4); assert.equal(render[1].texture.type, THREE.HalfFloatType);
  assert.equal(render[1].depthTexture.type, sceneTarget.depthTexture.type, 'the scene target\'s formats');
  assert.equal(render[2].length, 3, 'only the proxies draw');
  assert.ok(render[2].every((mesh) => mesh.name === 'world-program-warm-proxy' && mesh.frustumCulled === false));
  assert.deepEqual(render[2].map((mesh) => mesh.material), [splat, skirt, hooked]);
  assert.deepEqual(hookSaw, [[false, 'a']], 'the per-draw hook sees a proxy that casts nothing and shares the chunk\'s userData');
  assert.ok(render[2][0].geometry === chunkA.geometry, 'the chunk\'s own vertex layout');
  assert.equal(render[3], true, 'the shadow pass does not run during the draw');
  assert.equal(render[4], null, 'no background pass');
  assert.equal(target, null, 'the prior target is restored');
  assert.strictEqual(renderer.shadowMap.render, shadowRender, 'the shadow router is restored by identity');
  assert.ok(scene.background.isColor, 'the background is restored');
  assert.equal(sky.visible, true, 'every hidden renderable is visible again');
  assert.equal(hiddenAlready.visible, false, 'an object hidden before stays hidden');
  assert.equal(scene.getObjectByName('world-program-warm'), undefined, 'the proxy holder left the scene');
  assert.strictEqual(chunkA.parent, terrain, 'the terrain is never reparented');
  assert.equal(receipts.at(-1).status, 'drawn');
  // a context lost before the next entry's submission: nothing runs
  log.length = 0; gl.lost = true;
  warm.arm('railyard'); warm.offer(terrain, 'railyard');
  assert.equal((await warm.settled()).status, 'abandoned');
  assert.equal(log.length, 0, 'a lost context is never touched');
  void final;
}

// ---- 4. the wiring
const map = readFileSync(new URL('../world/map.ts', import.meta.url), 'utf8');
const terrainAt = map.indexOf('const terrain = requireTerrainRoot(await buildTerrainMeshesAsync(');
const offerAt = map.indexOf('engineCtx.prepareTerrainPrograms?.(terrain, mapId);');
const vegetationAt = map.indexOf("await step('Planting vegetation', 0.58);");
assert.ok(terrainAt > 0 && terrainAt < offerAt && offerAt < vegetationAt, 'the build offers its terrain the moment it stands, before the vegetation and the props');
const loading = readFileSync(new URL('../game/soloBattleLoadingRuntime.ts', import.meta.url), 'utf8');
const paintAt = loading.indexOf('await audio.startLoadingAfterPaint();');
const signatureAt = loading.indexOf('await prepareLightSignature(resolved);');
const acquireAt = loading.indexOf('await acquisition.acquireSolo([');
assert.ok(paintAt > 0 && paintAt < signatureAt && signatureAt < acquireAt, 'the signature is final under the painted cover, before the world is acquired');
const main = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
const prepare = main.slice(main.indexOf('async function prepareBattleLightSignature('), main.indexOf('function offerWorldPrograms('));
const garageOut = prepare.indexOf('setGarageSpots(false);'), pool = prepare.indexOf('await nightLighting.attachPool();');
const arm = prepare.indexOf('warm.arm(mapId);');
assert.ok(garageOut > 0 && garageOut < pool && pool < arm, 'the Garage presentation leaves and the night pool joins before the warm is armed');
assert.match(prepare, /if \(garageLightsActive\) return;\n  warm\.arm\(mapId\);/, 'a Garage return that overtook the cover is never armed over');
assert.match(prepare, /fxRuntimeAccess\.current\?\.group\.parent === scene && killcamAccess\.current !== null/, 'the FX and kill-cam pools complete the signature');
assert.match(main, /if \(active\) \{\n    battleWorldPrograms\?\.disarm\(\);/, 'the Garage return disarms the warm');
assert.match(main, /prepareTerrainPrograms: \(terrain: THREE\.Object3D, mapId: string\): void => \{ battleWorldPrograms\?\.offer\(terrain, mapId\); \}/);
assert.match(main, /prepareLightSignature: prepareBattleLightSignature,/);
assert.ok(main.indexOf('let battleWorldPrograms') < main.indexOf('const engineCtx = {'), 'declared before any world build can reach the hook');
const { staticImportClosure } = await import('../../tools/static-import-closure.mjs');
const boot = staticImportClosure('src/main.ts', { root: new URL('../..', import.meta.url).pathname });
assert.ok(!boot.has('src/engine/battleWorldProgramWarm.ts'), 'the warm loads with the first battle entry, never at boot');

console.log('battleWorldProgramWarm.selftest: the signature, the warm\'s state machine, the covered pipeline draw and the entry wiring PASS');
