import * as THREE from 'three';
import { installArticulatedShadowBatch } from '../src/engine/articulatedShadowBatch.ts';
import { markShadowOnly, routeShadowOnlyLayer, renderShadowOnlyWarm, SHADOW_ONLY_LAYER } from '../src/engine/renderLayers.ts';

const WIDTH = 192, HEIGHT = 160, SHADOW_SIZE = 128;
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
function difference(a, b) {
  requireThat(a.length === b.length, 'matching pixel extents required');
  let channels = 0, maximum = 0;
  for (let index = 0; index < a.length; index++) {
    const delta = Math.abs(a[index] - b[index]);
    if (delta) channels++; maximum = Math.max(maximum, delta);
  }
  return { channels, maximum };
}
function shadowDiagnostic(a, b) {
  requireThat(a.length === b.length && a.length % 4 === 0, 'matching RGBA shadow extents required');
  const coverage = { referencePixels: 0, candidatePixels: 0, differingPixels: 0, missingPixels: 0, extraPixels: 0 };
  const packedDepth = { changedPixels: 0, maximumDifference: 0, maximumBothCoveredDifference: 0 };
  const covered = (bytes, i) => bytes[i] !== 255 || bytes[i + 1] !== 255 || bytes[i + 2] !== 255 || bytes[i + 3] !== 255;
  // Three r185 packing.glsl.js unpackRGBAToDepth, applied to normalized RGBA8.
  // Diagnostic color depth only: PCF consumes the separate native depth texture.
  const depth = (bytes, i) => bytes[i] / 256 + bytes[i + 1] / 65536
    + bytes[i + 2] / 16777216 + bytes[i + 3] / (255 * 16777216);
  for (let i = 0; i < a.length; i += 4) {
    const ca = covered(a, i), cb = covered(b, i), delta = Math.abs(depth(a, i) - depth(b, i));
    coverage.referencePixels += +ca; coverage.candidatePixels += +cb;
    coverage.differingPixels += +(ca !== cb); coverage.missingPixels += +(ca && !cb); coverage.extraPixels += +(!ca && cb);
    packedDepth.changedPixels += +(delta !== 0);
    packedDepth.maximumDifference = Math.max(packedDepth.maximumDifference, delta);
    if (ca && cb) packedDepth.maximumBothCoveredDifference = Math.max(packedDepth.maximumBothCoveredDifference, delta);
  }
  return { coverage, packedDepth };
}
function comparePixels(reference, candidate) {
  requireThat(reference.length === 5 && candidate.length === 5, 'four shadow maps and one composed PCF image required');
  const differences = reference.map((bytes, i) => difference(bytes, candidate[i]));
  const shadowDiagnostics = reference.slice(0, 4).map((bytes, i) => ({ role: `shadow-${i}`, ...shadowDiagnostic(bytes, candidate[i]) }));
  const composedExact = differences[4].channels === 0;
  const coverageExact = shadowDiagnostics.every(value => value.coverage.differingPixels === 0);
  return { differences, shadowDiagnostics, parity: { pass: composedExact && coverageExact, composedExact, coverageExact } };
}
function packed(bytes) {
  let text = '';
  for (let start = 0; start < bytes.length; start += 8192) text += String.fromCharCode(...bytes.subarray(start, start + 8192));
  return btoa(text);
}
function createScene(batched, owned) {
  const scene = new THREE.Scene(); scene.name = batched ? 'candidate' : 'reference';
  scene.background = new THREE.Color(0x13202a);
  scene.add(new THREE.AmbientLight(0xffffff, 0.25));
  const root = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
  root.name = 'moving-root'; turret.name = 'yaw'; gun.name = 'pitch';
  root.add(turret); turret.position.y = 1.1; turret.add(gun); gun.position.set(0, 0.35, 0.4); scene.add(root);
  const material = new THREE.MeshBasicMaterial({ name: 'ProceduralShadowProxy', colorWrite: false, depthWrite: false });
  const depth = new THREE.MeshDepthMaterial({ name: 'ProceduralShadowProxyDepth', depthPacking: THREE.RGBADepthPacking,
    polygonOffset: true, polygonOffsetFactor: 1.25, polygonOffsetUnits: 2 });
  const make = (geometry, parent, name, position) => {
    geometry.clearGroups(); // One authored proxy material, like the factory's convex source.
    const mesh = markShadowOnly(new THREE.Mesh(geometry, material)); mesh.name = name;
    mesh.castShadow = true; mesh.customDepthMaterial = depth; mesh.userData.authoredShadowProxy = true;
    mesh.position.set(...position); parent.add(mesh); return mesh;
  };
  const sources = [make(new THREE.BoxGeometry(2.4, 0.8, 3.2), root, 'hull', [0, 0.7, 0]),
    make(new THREE.BoxGeometry(1.8, 0.65, 1.8), turret, 'turret', [0, 0.15, 0]),
    make(new THREE.BoxGeometry(0.24, 0.24, 2.8), gun, 'gun', [0, 0, 1.4])];
  const geometryOwners = sources.map(mesh => mesh.geometry);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshStandardMaterial({ color: 0xa8a292, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const camera = new THREE.PerspectiveCamera(48, WIDTH / HEIGHT, 0.1, 40);
  camera.position.set(6, 7, 9); camera.lookAt(0, 0.5, 0);
  const lights = [[-5, 9, 4], [7, 10, 5], [-6, 7, -6], [6, 12, -6]].map((position, index) => {
    const light = new THREE.DirectionalLight(0xffffff, 0.65); light.name = `native-shadow-${index}`;
    light.position.set(...position); light.castShadow = true; light.shadow.mapSize.set(SHADOW_SIZE, SHADOW_SIZE);
    const extent = 5 - index * 0.65;
    Object.assign(light.shadow.camera, { left: -extent, right: extent, top: extent, bottom: -extent, near: 0.5, far: 24 });
    light.shadow.camera.updateProjectionMatrix(); light.shadow.bias = -0.0002;
    scene.add(light, light.target); return light;
  });
  const target = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, { depthBuffer: true });
  const owner = { scene, root, turret, gun, sources, material, depth, geometryOwners, ground, camera, lights, batch: null, target };
  owned.push(owner);
  if (batched) {
    owner.batch = installArticulatedShadowBatch(root, sources);
    requireThat(owner.batch?.isBatchedMesh, 'actual helper must admit the three authored proxies');
  }
  return owner;
}
function pose(owner, index, hidden = false, mirrored = false) {
  const poses = [[0, 0, 0, 0], [0.45, 0.13, 0.38, -0.18], [-0.4, -0.16, -0.48, 0.24]];
  const [x, body, yaw, pitch] = poses[index];
  owner.root.position.set(x, 0, index * 0.12); owner.root.rotation.y = body;
  owner.turret.rotation.y = yaw; owner.gun.rotation.x = pitch; owner.gun.visible = !hidden;
  owner.gun.scale.x = mirrored ? -1 : 1;
}
function render(owner, renderer, { shadowOnly = false, expectShadowHooks = 4, witnesses = [] } = {}) {
  const original = renderer.renderBufferDirect, autoReset = renderer.info.autoReset;
  const cameraMask = owner.camera.layers.mask, perCamera = [0, 0, 0, 0], hooks = [];
  let sourceDrawCalls = 0, batchDrawCalls = 0, forwardDrawCalls = 0;
  const witnessDrawCalls = witnesses.map(() => 0);
  const beforeRender = owner.batch?.onBeforeRender;
  const hookDescriptor = owner.batch && Object.getOwnPropertyDescriptor(owner.batch, 'onBeforeRender');
  if (owner.batch) owner.batch.onBeforeRender = function (...args) {
    hooks.push(owner.lights.findIndex(light => light.shadow.camera === args[2]));
    return Reflect.apply(beforeRender, this, args);
  };
  function observed(...args) {
    const before = renderer.info.render.calls;
    try { return Reflect.apply(original, this, args); }
    finally {
      const index = owner.lights.findIndex(light => light.shadow.camera === args[0]);
      if (index >= 0) {
        const calls = renderer.info.render.calls - before; perCamera[index] += calls;
        if (owner.sources.includes(args[4])) sourceDrawCalls += calls;
        if (args[4] === owner.batch) batchDrawCalls += calls;
      } else {
        const calls = renderer.info.render.calls - before;
        forwardDrawCalls += calls;
        const witness = witnesses.indexOf(args[4]);
        if (witness >= 0) witnessDrawCalls[witness] += calls;
      }
    }
  }
  renderer.renderBufferDirect = observed; renderer.info.autoReset = false; renderer.info.reset();
  try {
    renderer.setRenderTarget(owner.target);
    const draw = () => renderer.render(owner.scene, owner.camera);
    if (shadowOnly) renderShadowOnlyWarm(renderer, owner.camera, draw);
    else draw();
  }
  finally {
    // Always release unrelated owned state, including when native rendering
    // throws. A replacement belongs to its caller and must not be overwritten.
    if (renderer.renderBufferDirect === observed) renderer.renderBufferDirect = original;
    renderer.info.autoReset = autoReset;
    if (owner.batch) {
      if (hookDescriptor) Object.defineProperty(owner.batch, 'onBeforeRender', hookDescriptor);
      else delete owner.batch.onBeforeRender;
    }
  }
  requireThat(renderer.renderBufferDirect === original, 'draw observer ownership changed');
  const calls = renderer.info.render.calls;
  requireThat(owner.camera.layers.mask === cameraMask, 'shadow layer routing must restore the presentation camera');
  requireThat(new Set(owner.lights.map(light => light.shadow.camera.id)).size === 4, 'four actual shadow camera owners required');
  requireThat(new Set(owner.lights.map(light => light.shadow.camera.matrixWorld.elements.join(','))).size === 4,
    'the four native shadow camera transforms must differ');
  if (owner.batch) requireThat(hooks.length === expectShadowHooks && hooks.every((value, index) => value === index),
    'the pinned BatchedMesh base hook must see every actual shadow camera');
  const pixels = owner.lights.map(light => {
    requireThat(light.shadow.map?.depthTexture?.isDepthTexture, 'native PCF depth texture required');
    const bytes = new Uint8Array(SHADOW_SIZE ** 2 * 4);
    renderer.readRenderTargetPixels(light.shadow.map, 0, 0, SHADOW_SIZE, SHADOW_SIZE, bytes); return bytes;
  });
  const color = new Uint8Array(WIDTH * HEIGHT * 4);
  renderer.readRenderTargetPixels(owner.target, 0, 0, WIDTH, HEIGHT, color); pixels.push(color);
  requireThat(renderer.getContext().getError() === renderer.getContext().NO_ERROR, 'native GL error');
  return { calls, perCamera, hooks, sourceDrawCalls, batchDrawCalls, forwardDrawCalls, witnessDrawCalls, pixels };
}
function retained(result) {
  return { calls: result.calls, perCamera: result.perCamera, baseHookCameras: result.hooks,
    sourceDrawCalls: result.sourceDrawCalls, batchDrawCalls: result.batchDrawCalls,
    forwardDrawCalls: result.forwardDrawCalls, witnessDrawCalls: result.witnessDrawCalls,
    pixels: result.pixels.map((bytes, index) => ({ role: index < 4 ? `shadow-${index}` : 'composed',
      width: index < 4 ? SHADOW_SIZE : WIDTH, height: index < 4 ? SHADOW_SIZE : HEIGHT, rgbaBase64: packed(bytes) })) };
}

function verifyShadowOnlyWarm(owner, renderer, report) {
  // Unculled objects prove that moving a camera far away is not equivalent to
  // a shadow-only pass. A transmissive object also exercises Three's separate
  // transmission route. These witnesses are added after the original cases.
  const geometry = new THREE.BoxGeometry(0.4, 0.4, 0.4);
  const materials = [new THREE.MeshBasicMaterial({ color: 0x735027 }),
    new THREE.MeshPhysicalMaterial({ transmission: 0.7, roughness: 0.1, side: THREE.DoubleSide })];
  const witnesses = materials.map((material, index) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(1000 + index, 1000, 1000); mesh.frustumCulled = false;
    owner.scene.add(mesh); return mesh;
  });
  try {
    for (const [name, index, hidden, mirrored] of [['initial', 0, false, false],
      ['yaw-pitch', 1, false, false], ['hidden-gun', 2, true, false], ['mirrored-gun', 1, false, true]]) {
      pose(owner, index, hidden, mirrored);
      const baseline = render(owner, renderer, { witnesses });
      const warm = render(owner, renderer, { shadowOnly: true, witnesses });
      const saved = owner.lights.map(light => ({ autoUpdate: light.shadow.autoUpdate, needsUpdate: light.shadow.needsUpdate }));
      let revealed;
      try {
        // The visible image must sample the maps just produced by the scoped
        // warm, not repair them by rendering another shadow pass first.
        for (const light of owner.lights) { light.shadow.autoUpdate = false; light.shadow.needsUpdate = false; }
        revealed = render(owner, renderer, { expectShadowHooks: 0, witnesses });
      } finally {
        owner.lights.forEach((light, i) => Object.assign(light.shadow, saved[i]));
      }
      const shadowDifferences = baseline.pixels.slice(0, 4).map((bytes, i) => difference(bytes, warm.pixels[i]));
      const revealedDifference = difference(baseline.pixels[4], revealed.pixels[4]);
      const pass = warm.forwardDrawCalls === 0 && baseline.forwardDrawCalls >= 3
        && baseline.witnessDrawCalls.every(calls => calls > 0)
        && warm.witnessDrawCalls.every(calls => calls === 0)
        && warm.perCamera.every((calls, i) => calls === baseline.perCamera[i])
        && revealed.perCamera.every(calls => calls === 0)
        && shadowDifferences.every(value => value.channels === 0) && revealedDifference.channels === 0;
      report.warmPasses.push({ owner: owner.scene.name, name, pass, shadowDifferences, revealedDifference,
        baseline: retained(baseline), warm: retained(warm), revealed: retained(revealed) });
      if (!pass) report.errors.push(`${owner.scene.name}/${name}: warm-only native draws, exact shadow bytes or unrepaired reveal differ`);
    }
  } finally {
    for (const mesh of witnesses) mesh.removeFromParent();
    geometry.dispose(); materials.forEach(material => material.dispose());
  }
}

export function installArticulatedShadowBatchFixture() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(WIDTH, HEIGHT); renderer.setPixelRatio(1);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; routeShadowOnlyLayer(renderer);
  document.body.append(renderer.domElement);
  const owned = [], report = { ok: false, disposed: false, hardware: null, cases: [], negatives: [], warmPasses: [], errors: [] };
  let ran = false;
  return { report,
    run() {
      requireThat(!ran, 'fixture runs once'); ran = true;
      try {
        const gl = renderer.getContext(), debug = gl.getExtension('WEBGL_debug_renderer_info');
        const backend = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
        requireThat(THREE.REVISION === '185' && typeof backend === 'string' && /ANGLE/i.test(backend)
          && !/swiftshader|llvmpipe|software|lavapipe|swrast/i.test(backend), 'native ANGLE and pinned Three r185 required');
        const multiDraw = !!gl.getExtension('WEBGL_multi_draw');
        report.hardware = { backend, threeRevision: THREE.REVISION, multiDraw, shadowType: 'PCFShadowMap' };
        const reference = createScene(false, owned), candidate = createScene(true, owned);
        let initialPixels;
        for (const [name, index, hidden, mirrored] of [['initial', 0, false, false], ['yaw-pitch', 1, false, false],
          ['moved', 2, false, false], ['hidden-gun', 2, true, false], ['mirrored-gun', 1, false, true], ['reset', 0, false, false]]) {
          pose(reference, index, hidden, mirrored); pose(candidate, index, hidden, mirrored);
          const a = render(reference, renderer), b = render(candidate, renderer);
          const row = { name, reference: retained(a), candidate: retained(b), ...comparePixels(a.pixels, b.pixels) };
          report.cases.push(row);
          if (name === 'initial') {
            initialPixels = { reference: a.pixels, candidate: b.pixels };
            requireThat(a.perCamera.every(value => value > 0)
              && a.pixels.slice(0, 4).every(bytes => bytes.some(value => value !== 255)), 'every shadow camera must contain actual caster pixels');
          }
          if (name === 'reset') {
            row.reset = { reference: comparePixels(initialPixels.reference, a.pixels), candidate: comparePixels(initialPixels.candidate, b.pixels) };
            for (const arm of ['reference', 'candidate']) {
              if (!row.reset[arm].parity.pass) report.errors.push(`${arm}: reset failed exact initial-pose PCF pixels or shadow coverage restoration`);
              if (row.reset[arm].differences.some(value => value.channels)) {
                report.errors.push(`${arm}: reset failed exact initial-pose raw RGBA restoration`);
              }
            }
          }
          if (!row.parity.pass) report.errors.push(`${name}: exact composed PCF pixels or shadow coverage parity failed`);
          const sourceCalls = a.perCamera.reduce((sum, value) => sum + value, 0), batchCalls = b.perCamera.reduce((sum, value) => sum + value, 0);
          if (!(multiDraw ? batchCalls < sourceCalls && b.calls < a.calls : batchCalls === sourceCalls && b.calls === a.calls)) {
            report.errors.push(`${name}: native draw reduction/fallback accounting failed`);
          }
          if (mirrored ? b.sourceDrawCalls <= 0 : b.sourceDrawCalls !== 0) report.errors.push(`${name}: unexpected direct-source fallback coverage`);
          requireThat(candidate.sources.every((mesh, i) => mesh.geometry === candidate.geometryOwners[i]
            && mesh.material === candidate.material && mesh.customDepthMaterial === candidate.depth
            && mesh.layers.mask === 2 ** SHADOW_ONLY_LAYER && mesh.castShadow === false), 'source ownership or shadow routing changed');
        }
        pose(reference, 1); pose(candidate, 1); const expected = render(reference, renderer);
        pose(reference, 1, true); const missing = render(reference, renderer);
        pose(candidate, 0); render(candidate, renderer); pose(candidate, 1);
        const hook = candidate.batch.onBeforeShadow;
        let stale;
        try { candidate.batch.onBeforeShadow = THREE.BatchedMesh.prototype.onBeforeShadow; stale = render(candidate, renderer); }
        finally { candidate.batch.onBeforeShadow = hook; }
        for (const [name, value] of [['missing-gun', missing], ['stale-articulation', stale]]) {
          const comparison = comparePixels(expected.pixels, value.pixels);
          report.negatives.push({ name, ...comparison, render: retained(value) });
          if (comparison.parity.composedExact || comparison.parity.coverageExact) {
            report.errors.push(`${name}: negative control failed to change composed PCF pixels and shadow coverage`);
          }
        }
        verifyShadowOnlyWarm(reference, renderer, report);
        verifyShadowOnlyWarm(candidate, renderer, report);
        // Reset on the same owner, then publish the real candidate ground-shadow canvas.
        pose(candidate, 0); renderer.setRenderTarget(null); renderer.render(candidate.scene, candidate.camera);
        report.ok = report.errors.length === 0;
      } catch (error) { report.errors.push(String(error)); }
      return report;
    },
    dispose() {
      if (report.disposed) return;
      for (const owner of owned) {
        owner.batch?.dispose();
        requireThat(owner.sources.every(mesh => mesh.castShadow), 'batch disposal must restore original source shadow flags');
        for (const geometry of owner.geometryOwners) geometry.dispose();
        owner.material.dispose(); owner.depth.dispose(); owner.ground.geometry.dispose(); owner.ground.material.dispose();
        for (const light of owner.lights) { light.shadow.map?.depthTexture?.dispose(); light.shadow.map?.dispose(); }
        owner.target.dispose();
      }
      renderer.dispose(); renderer.domElement.remove(); report.disposed = true;
    },
  };
}
