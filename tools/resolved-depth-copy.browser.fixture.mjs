import * as THREE from 'three';
import { copyResolvedDepth } from '../src/engine/resolvedDepthCopy.ts';

const VERTEX = 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const SOURCE = `varying vec2 vUv;
void main(){gl_FragColor=vec4(.8,.1,.2,1.);
gl_FragDepth=vUv.x<.333333? .2:(vUv.x<.666667? .6:.85);}`;
const DESTINATION = `varying vec2 vUv;
void main(){gl_FragColor=vec4(.2+.2*vUv.x,.3+.2*vUv.y,.7,1.);gl_FragDepth=.05;}`;
const OVERLAY = `uniform sampler2D depthSource; varying vec2 vUv;
void main(){gl_FragColor=vec4(texture2D(depthSource,vUv).r,.9,.1,1.);gl_FragDepth=.5;}`;
const COLOR = `uniform sampler2D colorSource; varying vec2 vUv;
void main(){gl_FragColor=texture2D(colorSource,vUv);}`;

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function differentPixels(a, b) {
  requireThat(a.length === b.length, 'pixel extents must match');
  let count = 0;
  for (let offset = 0; offset < a.length; offset += 4) {
    if (a[offset] !== b[offset] || a[offset + 1] !== b[offset + 1]
      || a[offset + 2] !== b[offset + 2] || a[offset + 3] !== b[offset + 3]) count++;
  }
  return count;
}

function target(width, height, samples = 0) {
  return new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(width, height, THREE.UnsignedIntType),
    depthBuffer: true, stencilBuffer: false, samples,
  });
}

function material(fragmentShader, uniforms = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VERTEX, fragmentShader, uniforms,
    blending: THREE.NoBlending, toneMapped: false });
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

function createFixture(renderer, samples) {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const source = target(48, 30, samples);
  const destinations = Object.fromEntries(['native', 'candidate', 'no-copy', 'wrong-sampler']
    .map(name => [name, target(48, 30)]));
  const wrongDepth = target(48, 30);
  const readTarget = new THREE.WebGLRenderTarget(48, 30, { depthBuffer: false, stencilBuffer: false });
  const materials = { source: material(SOURCE), destination: material(DESTINATION),
    overlay: material(OVERLAY, { depthSource: { value: source.depthTexture } }),
    color: material(COLOR, { colorSource: { value: null } }) };
  materials.overlay.depthWrite = false;
  materials.color.depthTest = materials.color.depthWrite = false;
  const mesh = new THREE.Mesh(geometry, materials.source);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(mesh);
  const camera = new THREE.Camera();
  return { renderer, samples, geometry, source, destinations, wrongDepth, readTarget,
    materials, mesh, scene, camera, targets: [source, ...Object.values(destinations), wrongDepth, readTarget] };
}

function draw(fixture, destination, drawMaterial, clear = true) {
  const { renderer, mesh, scene, camera } = fixture;
  renderer.setRenderTarget(destination);
  if (clear) renderer.clear(true, true, false);
  mesh.material = drawMaterial;
  renderer.render(scene, camera);
}

function readColor(fixture, destination) {
  const { renderer, readTarget, materials } = fixture;
  materials.color.uniforms.colorSource.value = destination.texture;
  draw(fixture, readTarget, materials.color);
  const pixels = new Uint8Array(readTarget.width * readTarget.height * 4);
  renderer.readRenderTargetPixels(readTarget, 0, 0, readTarget.width, readTarget.height, pixels);
  return pixels;
}

function copyWithReceipt(renderer, source, destination) {
  const gl = renderer.getContext();
  const originalQuery = gl.getParameter, originalBlit = gl.blitFramebuffer;
  const originalFallback = renderer.copyTextureToTexture;
  const receipt = { queries: 0, blits: 0, fallbacks: 0, depthOnly: true };
  gl.getParameter = function (...args) { receipt.queries++; return originalQuery.apply(this, args); };
  gl.blitFramebuffer = function (...args) {
    receipt.blits++;
    receipt.depthOnly &&= args[8] === gl.DEPTH_BUFFER_BIT && args[9] === gl.NEAREST;
    return originalBlit.apply(this, args);
  };
  renderer.copyTextureToTexture = function (...args) {
    receipt.fallbacks++; return originalFallback.apply(this, args);
  };
  try { copyResolvedDepth(renderer, source, destination); }
  finally {
    gl.getParameter = originalQuery; gl.blitFramebuffer = originalBlit;
    renderer.copyTextureToTexture = originalFallback;
  }
  requireThat(receipt.queries === 0 && receipt.blits === 1 && receipt.fallbacks === 0 && receipt.depthOnly,
    'candidate must use exactly one query-free DEPTH-only native blit, never fallback');
  return receipt;
}

function runVariant(fixture, variant) {
  const { renderer, source, destinations, materials, wrongDepth } = fixture;
  const destination = destinations[variant];
  requireThat(source !== destination && source.depthTexture !== destination.depthTexture,
    'source and destination must never alias');
  draw(fixture, destination, materials.destination);
  const before = readColor(fixture, destination);
  renderer.setRenderTarget(destination);
  let copy = null;
  if (variant === 'candidate') copy = copyWithReceipt(renderer, source, destination);
  else if (variant !== 'no-copy') renderer.copyTextureToTexture(source.depthTexture, destination.depthTexture);
  const afterCopy = readColor(fixture, destination);
  requireThat(differentPixels(before, afterCopy) === 0, 'depth copy must preserve distinct destination color bytes');
  const sampled = variant === 'wrong-sampler' ? wrongDepth.depthTexture : source.depthTexture;
  requireThat(sampled !== destination.depthTexture, 'the overlay must not sample its attached depth');
  materials.overlay.uniforms.depthSource.value = sampled;
  draw(fixture, destination, materials.overlay, false);
  return { before, pixels: readColor(fixture, destination), copy };
}

function prepareSource(fixture, clear) {
  const { renderer, source, materials } = fixture;
  draw(fixture, fixture.wrongDepth, materials.destination);
  renderer.setRenderTarget(source);
  renderer.clear(true, true, false);
  if (!clear) draw(fixture, source, materials.source, false);
  else {
    // Resolves the cleared MSAA depth too; an empty render has no draw objects.
    const visible = fixture.mesh.visible;
    fixture.mesh.visible = false;
    try { renderer.render(fixture.scene, fixture.camera); }
    finally { fixture.mesh.visible = visible; }
  }
  const observedSamples = renderer.getContext().getParameter(renderer.getContext().SAMPLES);
  requireThat(observedSamples === fixture.samples, 'actual bound source sample count must equal the requested case');
  return observedSamples;
}

function runCase(fixture, label, clear = false) {
  const samples = prepareSource(fixture, clear);
  const native = runVariant(fixture, 'native');
  const candidate = runVariant(fixture, 'candidate');
  const noCopy = runVariant(fixture, 'no-copy');
  const wrongSampler = runVariant(fixture, 'wrong-sampler');
  const pixels = fixture.source.width * fixture.source.height;
  const changed = differentPixels(native.before, native.pixels);
  requireThat(differentPixels(native.pixels, candidate.pixels) === 0, 'candidate must match native copy byte for byte');
  requireThat(changed > 0 && (clear || changed < pixels), 'the overlay must demonstrate actual hardware depth occlusion');
  const noCopyDifference = differentPixels(native.pixels, noCopy.pixels);
  const wrongSamplerDifference = differentPixels(native.pixels, wrongSampler.pixels);
  requireThat(noCopyDifference > 0, 'no-copy negative control must fail pixel parity');
  requireThat(wrongSamplerDifference > 0, 'wrong source-depth sampling must independently fail pixel parity');
  const gl = fixture.renderer.getContext();
  requireThat(gl.getError() === gl.NO_ERROR, 'native depth-copy case must leave no GL error');
  return { label, samples, width: fixture.source.width, height: fixture.source.height,
    byteParity: true, colorPreserved: true, changedPixels: changed,
    noCopyDifference, wrongSamplerDifference, ...candidate.copy };
}

function resize(fixture, width, height) {
  for (const resource of fixture.targets) resource.setSize(width, height);
}

function runInitialCases(fixture, cases) {
  cases.push(runCase(fixture, 'initial'));
  cases.push(runCase(fixture, 'empty-clear', true));
  resize(fixture, 66, 42);
  cases.push(runCase(fixture, 'equal-resize'));
  fixture.renderer.resetState();
  cases.push(runCase(fixture, 'renderer-reset-state'));
  for (const resource of fixture.targets) resource.dispose();
  cases.push(runCase(fixture, 'dispose-reinitialize'));
}

export function installDepthCopyFixture() {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(96, 64); renderer.autoClear = false;
  document.body.append(renderer.domElement);
  const report = { hardware: null, cases: [], lost: false, restored: false, disposed: false };
  let fixtures = [];
  const priorInfo = renderer.info;
  const lost = event => { event.preventDefault(); report.lost = true; };
  const restored = () => { report.restored = true; };
  renderer.domElement.addEventListener('webglcontextlost', lost);
  renderer.domElement.addEventListener('webglcontextrestored', restored);
  let extension;
  return {
    report,
    initial() {
      report.hardware = hardwareReceipt(renderer);
      extension = renderer.getContext().getExtension('WEBGL_lose_context');
      requireThat(extension, 'real context loss/restoration is mandatory');
      fixtures = [0, 4].map(samples => createFixture(renderer, samples));
      for (const fixture of fixtures) runInitialCases(fixture, report.cases);
    },
    lose() { setTimeout(() => extension.loseContext(), 0); },
    restore() { setTimeout(() => extension.restoreContext(), 0); },
    afterRestore() {
      requireThat(report.lost && report.restored && !renderer.getContext().isContextLost(), 'context events must complete');
      requireThat(renderer.info !== priorInfo, 'Three must renew its renderer lifetime');
      report.restoredHardware = hardwareReceipt(renderer);
      for (const fixture of fixtures) report.cases.push(runCase(fixture, 'context-restored'));
    },
    dispose() {
      for (const fixture of fixtures) {
        for (const resource of fixture.targets) resource.dispose();
        for (const owned of Object.values(fixture.materials)) owned.dispose();
        fixture.geometry.dispose();
      }
      renderer.domElement.removeEventListener('webglcontextlost', lost);
      renderer.domElement.removeEventListener('webglcontextrestored', restored);
      renderer.dispose(); renderer.domElement.remove(); report.disposed = true;
    },
  };
}
