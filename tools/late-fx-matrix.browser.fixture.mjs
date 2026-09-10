import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js';
import { SceneAAPass, SceneAerialPass } from '../src/engine/sceneSourcePass.ts';
import { LateFxPass } from '../src/engine/post.ts';
import { LATE_FX_LAYER } from '../src/fx/layers.ts';

const WIDTH = 192;
const HEIGHT = 128;
const FRAMES = 3;
const VERTEX = `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
// A transparent soft-edged card samples the actual resolved world depth.
// Keep positive alpha behind geometry: the copied hardware depth, not a
// shader discard, must hide that portion of the card in the depth control.
const FRAGMENT = `uniform sampler2D uSceneDepth; uniform vec2 uSoftViewport;
varying vec2 vUv;
void main(){
  float radial=1.-smoothstep(.2,.5,length(vUv-.5));
  float depth=texture2D(uSceneDepth,gl_FragCoord.xy/uSoftViewport).r;
  float contact=.55+.45*clamp(abs(depth-gl_FragCoord.z)*80.,0.,1.);
  gl_FragColor=vec4(.1,.92,.25,.72*radial*contact);
}`;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function differentPixels(a, b) {
  requireThat(a.length === b.length, 'pixel extents must match');
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1]
      || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) changed++;
  }
  return changed;
}

function hardwareReceipt(renderer) {
  const gl = renderer.getContext();
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  requireThat(extension, 'unmasked hardware evidence is mandatory');
  const backend = gl.getParameter(extension.UNMASKED_RENDERER_WEBGL);
  requireThat(typeof backend === 'string' && /ANGLE/i.test(backend)
    && !/swiftshader|llvmpipe|softpipe|software|basic render|lavapipe|swrast/i.test(backend),
  'native hardware ANGLE is required');
  requireThat(THREE.REVISION === '185', 'the regression must use pinned Three r185');
  requireThat(renderer.capabilities.maxSamples >= 4, 'four-sample hardware MSAA is mandatory');
  return { backend, threeRevision: THREE.REVISION, maxSamples: renderer.capabilities.maxSamples };
}

function depthTarget(samples = 0) {
  return new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType,
    depthTexture: new THREE.DepthTexture(WIDTH, HEIGHT, THREE.UnsignedIntType),
    depthBuffer: true, stencilBuffer: false, samples,
  });
}

function copyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms),
    vertexShader: CopyShader.vertexShader, fragmentShader: CopyShader.fragmentShader,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
  });
}

function createFixture(renderer, samples, aoEnabled) {
  const scene = new THREE.Scene();
  scene.matrixAutoUpdate = false; // Same permanent identity root as main.ts.
  scene.background = new THREE.Color(0x081018);
  const camera = new THREE.PerspectiveCamera(48, WIDTH / HEIGHT, 0.1, 30);
  camera.layers.enable(LATE_FX_LAYER);
  const parent = new THREE.Group();
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(8, 5),
    new THREE.MeshBasicMaterial({ color: 0x25364b }));
  backdrop.position.z = -1.5;
  const occluder = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.65, 0.45),
    new THREE.MeshBasicMaterial({ color: 0x9455c6 }));
  occluder.position.set(-0.12, 0, 0.7);
  const softState = {
    uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(WIDTH, HEIGHT) },
    uCameraNear: { value: camera.near }, uCameraFar: { value: camera.far },
    isActive: () => true,
  };
  const fx = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.85),
    new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader: FRAGMENT,
      uniforms: { uSceneDepth: softState.uSceneDepth, uSoftViewport: softState.uSoftViewport },
      transparent: true, depthTest: true, depthWrite: false, toneMapped: false }));
  fx.layers.set(LATE_FX_LAYER);
  parent.add(occluder, fx);
  scene.add(backdrop, parent);
  const source = depthTarget(samples);
  const late = depthTarget();
  const composerTarget = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
    type: THREE.HalfFloatType, depthBuffer: false, stencilBuffer: false,
  });
  const composer = new EffectComposer(renderer, composerTarget);
  composer.renderToScreen = false;
  const sceneAA = new SceneAAPass(scene, camera, source);
  const aerial = new SceneAerialPass(CopyShader, source);
  // Identity fullscreen AO stand-in tests both production handoff shapes.
  // This fixture does not claim coverage of the GTAO shader itself.
  const ao = new ShaderPass(CopyShader);
  ao.enabled = aoEnabled;
  const lateFx = new LateFxPass(scene, camera, source, late, softState);
  sceneAA.directColorConsumer = aerial;
  lateFx.directColorSource = aerial;
  for (const pass of [sceneAA, aerial, ao, lateFx]) composer.addPass(pass);
  const readTarget = new THREE.WebGLRenderTarget(WIDTH, HEIGHT, {
    depthBuffer: false, stencilBuffer: false,
  });
  const readMaterial = copyMaterial();
  const readQuad = new FullScreenQuad(readMaterial);
  const trace = { traversals: [], sourceOrigin: null, fxOrigin: null, sourceSamples: null };
  const update = scene.updateMatrixWorld;
  scene.updateMatrixWorld = function (...args) {
    const target = renderer.getRenderTarget();
    trace.traversals.push(target === source ? 'source' : target === late ? 'late' : 'other');
    return update.apply(this, args);
  };
  occluder.onBeforeRender = () => {
    trace.sourceOrigin = occluder.matrixWorld.elements.slice(12, 15);
    const gl = renderer.getContext();
    trace.sourceSamples = gl.getParameter(gl.SAMPLES);
  };
  fx.onBeforeRender = () => { trace.fxOrigin = fx.matrixWorld.elements.slice(12, 15); };
  return { renderer, scene, camera, parent, backdrop, occluder, fx, source, late,
    composer, sceneAA, aerial, ao, lateFx, readTarget, readMaterial, readQuad, trace };
}

function setPose(fixture, frame, cameraFrame = frame) {
  fixture.parent.position.set(-0.75 + frame * 0.55, -0.12 + frame * 0.12, 0);
  fixture.occluder.rotation.y = frame * 0.15;
  fixture.fx.position.set(-0.18 + frame * 0.24, 0.1 + frame * 0.1, 0);
  fixture.fx.rotation.z = frame * 0.12;
  fixture.camera.position.set(cameraFrame * 0.35, cameraFrame * 0.12, 6.4);
  fixture.camera.lookAt(cameraFrame * 0.1, 0, 0);
}

function renderFixture(fixture, frame, options = {}) {
  const { renderer, scene, sceneAA, aerial, lateFx, trace } = fixture;
  const oldFlag = scene.matrixWorldAutoUpdate;
  if (options.staleGeometry) {
    setPose(fixture, frame - 1);
    scene.updateMatrixWorld(true);
  }
  setPose(fixture, frame, options.staleCamera ? frame - 1 : frame);
  if (options.staleGeometry) scene.matrixWorldAutoUpdate = false;
  fixture.fx.visible = !options.hiddenFx;
  fixture.fx.material.depthTest = !options.noDepthTest;
  trace.traversals.length = 0;
  trace.sourceOrigin = trace.fxOrigin = trace.sourceSamples = null;
  lateFx.sceneMatrixSource = options.reuse ? sceneAA : null;
  if (options.reuse) sceneAA.beginMatrixFrame(renderer);
  else sceneAA.endMatrixFrame();
  aerial.beginDirectColorFrame(fixture.ao.enabled ? null : fixture.late);
  try {
    fixture.composer.render(1 / 60);
    requireThat(scene.matrixWorldAutoUpdate === !options.staleGeometry,
      'LateFX must restore its incoming matrix-update flag');
  } finally {
    sceneAA.endMatrixFrame();
    aerial.endDirectColorFrame();
    scene.matrixWorldAutoUpdate = oldFlag;
  }
  requireThat(!sceneAA.consumeMatrixFrame(renderer, scene, fixture.camera), 'frame permission must be closed');
  fixture.readMaterial.uniforms.tDiffuse.value = fixture.composer.readBuffer.texture;
  renderer.setRenderTarget(fixture.readTarget);
  renderer.clear(true, true, false);
  fixture.readQuad.render(renderer);
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  renderer.readRenderTargetPixels(fixture.readTarget, 0, 0, WIDTH, HEIGHT, pixels);
  requireThat(renderer.getContext().getError() === renderer.getContext().NO_ERROR, 'no native GL errors');
  return { pixels, traversals: [...trace.traversals], sourceOrigin: trace.sourceOrigin,
    fxOrigin: trace.fxOrigin, sourceSamples: trace.sourceSamples };
}

function assertOrigin(actual, expected, label) {
  requireThat(actual && actual.every((value, index) => Math.abs(value - expected[index]) < 1e-9),
    `${label}: transform must already be current inside the actual draw`);
}

function checkPair(pair, frame, samples, aoEnabled, previous) {
  const reference = renderFixture(pair.reference, frame);
  const candidate = renderFixture(pair.candidate, frame, { reuse: true });
  requireThat(reference.traversals.join(',') === 'source,late', 'reference must perform both root walks');
  requireThat(candidate.traversals.join(',') === 'source', 'candidate must update at source, never late');
  requireThat(reference.sourceSamples === samples && candidate.sourceSamples === samples,
    'actual source MSAA must match the requested case');
  const parentX = -0.75 + frame * 0.55;
  const parentY = -0.12 + frame * 0.12;
  for (const result of [reference, candidate]) {
    assertOrigin(result.sourceOrigin, [parentX - 0.12, parentY, 0.7], 'source');
    assertOrigin(result.fxOrigin, [parentX - 0.18 + frame * 0.24, parentY + 0.1 + frame * 0.1, 0], 'FX');
  }
  const parityDifference = differentPixels(reference.pixels, candidate.pixels);
  requireThat(parityDifference === 0, 'scoped reuse must match reference pixels byte for byte');
  const negatives = {};
  for (const control of ['hiddenFx', 'noDepthTest', 'staleGeometry', 'staleCamera']) {
    const negative = renderFixture(pair.negative, frame, { reuse: true, [control]: true });
    negatives[control] = differentPixels(reference.pixels, negative.pixels);
    requireThat(negatives[control] > 20, `${control}: negative control must visibly fail parity`);
  }
  const movingPixels = previous ? differentPixels(previous, reference.pixels) : null;
  requireThat(movingPixels === null || movingPixels > 20, 'successive frames must show visible movement');
  return { pixels: reference.pixels, receipt: { samples, aoEnabled, frame,
    width: WIDTH, height: HEIGHT, parityDifference, referenceTraversals: reference.traversals,
    candidateTraversals: candidate.traversals, sourceOrigin: candidate.sourceOrigin,
    fxOrigin: candidate.fxOrigin, movingPixels, negativeDifferences: negatives } };
}

function disposeFixture(fixture) {
  fixture.sceneAA.endMatrixFrame();
  fixture.aerial.endDirectColorFrame();
  for (const mesh of [fixture.backdrop, fixture.occluder, fixture.fx]) {
    mesh.geometry.dispose(); mesh.material.dispose();
  }
  for (const pass of [fixture.sceneAA, fixture.lateFx]) {
    pass.copyMaterial.dispose(); pass.copyQuad.dispose();
  }
  fixture.aerial.dispose(); fixture.ao.dispose(); fixture.composer.dispose();
  fixture.source.dispose(); fixture.late.dispose(); fixture.readTarget.dispose();
  fixture.readMaterial.dispose(); fixture.readQuad.dispose();
}

export function installLateFxMatrixFixture() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(WIDTH, HEIGHT); renderer.autoClear = false;
  renderer.domElement.dataset.lateFxMatrix = '1';
  document.body.append(renderer.domElement);
  const report = { hardware: null, cases: [], ok: false, disposed: false };
  const owned = [];
  let ran = false;
  return {
    report,
    run() {
      requireThat(!ran, 'the fixture runs once');
      ran = true;
      report.hardware = hardwareReceipt(renderer);
      let finalFixture;
      for (const samples of [0, 4]) for (const aoEnabled of [false, true]) {
        const pair = {};
        for (const name of ['reference', 'candidate', 'negative']) {
          pair[name] = createFixture(renderer, samples, aoEnabled);
          owned.push(pair[name]);
        }
        let previous = null;
        for (let frame = 0; frame < FRAMES; frame++) {
          const result = checkPair(pair, frame, samples, aoEnabled, previous);
          previous = result.pixels;
          report.cases.push(result.receipt);
        }
        finalFixture = pair.candidate;
      }
      // Keep an actual final candidate image on the visible canvas for the
      // runner's optional PNG. This is inspection evidence, not a benchmark.
      finalFixture.readMaterial.uniforms.tDiffuse.value = finalFixture.composer.readBuffer.texture;
      renderer.setRenderTarget(null); renderer.clear(true, true, false);
      finalFixture.readQuad.render(renderer);
      requireThat(report.cases.length === 12, 'all twelve native cases must complete');
      report.ok = true;
      return report;
    },
    dispose() {
      if (report.disposed) return;
      for (const fixture of owned) disposeFixture(fixture);
      renderer.dispose(); renderer.domElement.remove(); report.disposed = true;
    },
  };
}
