import * as THREE from 'three';
import { CLOUD_SLOT_ORDER, VolumetricCloudLayer } from '../src/engine/volumetricClouds.ts';

function runUniformCase(layer, renderer, seed, mode) {
  const material = layer.resolveMaterial, u = material.uniforms;
  const count = layer.history[0].width * layer.history[0].height * 4;
  const before = new Uint16Array(count), after = new Uint16Array(count);
  for (const target of [...layer.history, layer.trace]) layer.renderQuad(seed, target);
  renderer.readRenderTargetPixels(layer.history[0], 0, 0, 385, 193, before);
  const expected = [1.73828125, .67236328125, .42578125, .35595703125].map(THREE.DataUtils.toHalfFloat);
  if (expected.some((value, channel) => before[channel] !== value || before[count - 4 + channel] !== value)) {
    throw new Error('Half-float render/readback did not preserve the seeded cloud');
  }
  u.uPrevRight.value.copy(layer.cam.right);
  u.uPrevFwd.value.copy(layer.cam.fwd);
  if (mode === 'moving') {
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .001);
    u.uPrevRight.value.applyQuaternion(turn);
    u.uPrevFwd.value.applyQuaternion(turn);
  }
  u.uPrevTan.value.copy(layer.cam.tan);
  if (mode === 'zooming') u.uPrevTan.value.multiplyScalar(1.1);
  let index = 0;
  for (let frame = 0; frame < 512; frame++) {
    u.uHistoryValid.value = mode === 'cut' && frame === 0 ? 0 : 1;
    u.uRebuildK.value = mode === 'cut' && frame < 16 ? frame : -1;
    u.uSlot.value.set(...CLOUD_SLOT_ORDER[frame % 16]);
    u.tTrace.value = layer.trace.texture;
    u.tHistory.value = layer.history[index].texture;
    layer.renderQuad(material, layer.history[1 - index]);
    index = 1 - index;
  }
  renderer.readRenderTargetPixels(layer.history[index], 0, 0, 385, 193, after);
  let changed = 0, maxError = 0;
  for (let i = 0; i < count; i++) {
    if (after[i] !== before[i]) changed++;
    maxError = Math.max(maxError, Math.abs(THREE.DataUtils.fromHalfFloat(after[i]) - THREE.DataUtils.fromHalfFloat(before[i])));
  }
  if (changed !== 0) throw new Error(`${mode}: uniform cloud drifted in ${changed} channels (max ${maxError})`);
  return { mode, frames: 512, changed, maxError };
}

// Exercise the production resolve on actual half-float targets. A uniform
// cloud must not acquire the sixteen-slot refresh grid after repeated reuse.
export function checkCloudHistory() {
  const renderer = new THREE.WebGLRenderer();
  const gl = renderer.getContext();
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const backend = debug && gl.getParameter(debug.UNMASKED_RENDERER_WEBGL);
  if (!backend || /swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(backend)) {
    renderer.dispose();
    throw new Error(`Native GPU required: ${backend}`);
  }
  const layer = new VolumetricCloudLayer(renderer, new THREE.Scene(), {}, new THREE.Vector3(1, 1, 1));
  const seed = new THREE.ShaderMaterial({
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'void main(){gl_FragColor=vec4(1.73828125,.67236328125,.42578125,.35595703125);}',
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
  const cases = [];
  try {
    // Odd dimensions expose the non-exact divide/multiply in reprojection.
    layer.resize(770, 386);
    const camera = new THREE.PerspectiveCamera(55, 770 / 386, .1, 4000);
    camera.position.set(150, 13.760158292602927, 0);
    camera.lookAt(-300, 17.76015829260293, 0);
    camera.updateMatrixWorld(true);
    layer.captureCamera(camera);
    const material = layer.resolveMaterial, u = material.uniforms;
    layer.setCameraUniforms(material, layer.cam);
    u.uPrevCamPos.value.copy(layer.cam.pos);
    u.uPrevUp.value.copy(layer.cam.up);
    u.uPrevTan.value.copy(layer.cam.tan);
    u.uMinAlpha.value = .12;
    for (const mode of ['stationary', 'moving', 'zooming', 'cut']) cases.push(runUniformCase(layer, renderer, seed, mode));
    return { backend, cases };
  } finally {
    seed.dispose(); layer.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
