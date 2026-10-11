import * as THREE from 'three';
import { CLOUD_SLOT_ORDER, VolumetricCloudLayer } from '../src/engine/volumetricClouds.ts';

// Clouds 2.0 (2026-10-10, the clouds landing lane): the trace writes two attachments — the radiance and, in the second, the
// distance (km) to the nearest cloud along the ray — and the resolve reprojects each history pixel by its neighbourhood's
// nearest distance (tTraceDepth). Production binds both every trace (traceSlot); a fixture that seeds only the radiance
// leaves the distance unbound, and the resolve then reads its neighbourhood as empty and clips the history to nothing.
// The trace is seeded here with both attachments, the distance a constant two kilometres.
const TRACE_DEPTH_KM = 2;
function traceSeed(color) {
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `layout(location=0) out highp vec4 radiance; layout(location=1) out highp vec4 nearest;
      void main(){ radiance=${color}; nearest=vec4(${TRACE_DEPTH_KM.toFixed(1)},0.,0.,1.); }`,
    depthTest: false, depthWrite: false, blending: THREE.NoBlending,
  });
}
function bindTrace(layer, u) {
  u.tTrace.value = layer.trace.textures[0];
  u.tTraceDepth.value = layer.trace.textures[1];
}

function runUniformCase(layer, renderer, seed, mode) {
  const material = layer.resolveMaterial, u = material.uniforms;
  const count = layer.history[0].width * layer.history[0].height * 4;
  const before = new Uint16Array(count), after = new Uint16Array(count);
  for (const target of layer.history) layer.renderQuad(seed, target);
  const trace = traceSeed('vec4(1.73828125,.67236328125,.42578125,.35595703125)');
  try { layer.renderQuad(trace, layer.trace); } finally { trace.dispose(); }
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
    bindTrace(layer, u);
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

// A changing light field can put last frame's radiance outside this frame's
// bounds. Those bounds must vary with the pixel, not jump at 4×4 trace blocks.
function runSmoothEdgeCase(layer, renderer, seed, baseline = false) {
  const u = layer.resolveMaterial.uniforms;
  for (const target of layer.history) layer.renderQuad(seed, target);
  const gradient = traceSeed(`vec4(vec3(.15+.5*gl_FragCoord.x/${layer.trace.width}.),.85-.5*gl_FragCoord.x/${layer.trace.width}.)`);
  const oldFragment=layer.resolveMaterial.fragmentShader;
  try {
    if(baseline) {
      // (Clouds 2.0: the neighbourhood's moments for the variance clip come from bilinear taps of the trace at this
      // pixel's own position; the control fetches whole trace texels, so every 4 x 4 block shares one neighbourhood)
      layer.resolveMaterial.fragmentShader=oldFragment.replace(
        'vec4 s = texture( tTrace, traceUv + o );',
        'vec4 s = texelFetch( tTrace, clamp( ivec2( tp ) + ivec2( x, y ), ivec2( 0 ), ivec2( uTraceSize ) - 1 ), 0 );');
      if(layer.resolveMaterial.fragmentShader===oldFragment) throw new Error('Cloud negative control did not change its sampler');
      layer.resolveMaterial.needsUpdate=true;
    }
    layer.renderQuad(gradient, layer.trace);
    u.uPrevRight.value.copy(layer.cam.right); u.uPrevFwd.value.copy(layer.cam.fwd);
    u.uPrevTan.value.copy(layer.cam.tan);
    u.uHistoryValid.value=1; u.uRebuildK.value=-1; u.uSlot.value.set(0,0);
    bindTrace(layer, u); u.tHistory.value=layer.history[0].texture;
    layer.renderQuad(layer.resolveMaterial,layer.history[1]);
    const pixels=new Uint16Array(385*193*4);
    renderer.readRenderTargetPixels(layer.history[1],0,0,385,193,pixels);
    const row=98; // Not refreshed by slot (0,0): isolates neighborhood clamping.
    let flatSteps=0, steps=0, maxStep=0;
    for(let x=16;x<368;x++) {
      const before=THREE.DataUtils.fromHalfFloat(pixels[(row*385+x)*4]);
      const after=THREE.DataUtils.fromHalfFloat(pixels[(row*385+x+1)*4]);
      const delta=after-before;
      if(delta===0) flatSteps++;
      maxStep=Math.max(maxStep,Math.abs(delta)); steps++;
    }
    const result={flatSteps,steps,maxStep};
    if(baseline) {
      if(flatSteps/steps<.7 || maxStep<.004) throw new Error(`Cloud regression did not detect the original block clamp: ${JSON.stringify(result)}`);
    } else if(flatSteps/steps>.05 || maxStep>.003) throw new Error(`Cloud clamp prints trace blocks: ${JSON.stringify(result)}`);
    return result;
  } finally {
    layer.resolveMaterial.fragmentShader=oldFragment; layer.resolveMaterial.needsUpdate=true;
    gradient.dispose();
  }
}

// The deck integral must not change with an unrelated interleaved refresh phase. Clouds 2.0 (2026-10-10): a deck's
// vertical depth over a point is the closed-form column of its own cell up to the cell's top (cloudShaders.ts, the trace's
// deep diffusion) — no quadrature, so nothing for a phase to move. Evaluate the production lines at constant inputs across
// a row of phases (two cells, two rows), check the closed form's value, and prove the check with a phase-scaled control.
const COLUMN = Object.freeze({
  wgt: [.4, .3, .2, .1], density: [.01, .008, .006, .004], core: [1, 1, .8, 1], cells: [1, 0, 1, .5], lumps: [.5, 0, .25, 0],
  base: [700, 1200, 2500, 6000], top: [1100, 1600, 2900, 6400], h: 800, cellA: [.6, .4], cellB: [.3, .9],
});
function columnExpected(cell) {
  const C = COLUMN, share = .7;
  let tau = 0;
  for (let i = 0; i < 4; i++) {
    const kc = 1 + (cell[0] * (1 + (.55 + .45 * cell[1] - 1) * C.lumps[i]) - 1) * C.cells[i];
    const topC = C.base[i] + (C.top[i] - C.base[i]) * (.1 + .9 * kc);
    tau += C.wgt[i] * C.density[i] * C.core[i] * Math.max(topC - C.h, 0);
  }
  return tau * share;
}
function runColumnPhaseCase(layer, renderer, baseline = false) {
  const source = layer.traceMaterial.fragmentShader;
  const start = source.indexOf('vec4 kc = mix( vec4( 1.0 ), vec4( cell.x )');
  const tauAt = source.indexOf('float tauUp = ', start);
  const end = source.indexOf(';', tauAt) + 1;
  if (start < 0 || tauAt < 0 || end <= tauAt) throw new Error('Production cloud column missing');
  let column = source.slice(start, end);
  if (/jitter|uFrameNoise|uSlot|uSubPixel/.test(column)) throw new Error('Cloud column reads the refresh phase');
  if (baseline) {
    const stable = column;
    column = column.replace(/float tauUp = ([^;]+);/, 'float tauUp = ( $1 ) * ( .75 + .5 * phase );');
    if (column === stable) throw new Error('Column phase negative control did not change the shader');
  }
  const v4 = (a) => `vec4(${a.map((x) => x.toFixed(4)).join(',')})`, C = COLUMN;
  const target = new THREE.WebGLRenderTarget(64, 8, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
  const material = new THREE.ShaderMaterial({
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
      const vec4 wgt=${v4(C.wgt)}, uLayerDensity=${v4(C.density)}, uLayerCore=${v4(C.core)};
      const vec4 uLayerCells=${v4(C.cells)}, uLayerLumps=${v4(C.lumps)}, uLayerBase=${v4(C.base)}, uLayerTop=${v4(C.top)};
      void main(){
        float phase=gl_FragCoord.x/${target.width.toFixed(1)};
        vec2 cell=gl_FragCoord.y<${(target.height / 2).toFixed(1)}?vec2(${C.cellA.map((x) => x.toFixed(4)).join(',')}):vec2(${C.cellB.map((x) => x.toFixed(4)).join(',')});
        float h=${C.h.toFixed(1)};
        ${column}
        gl_FragColor=vec4(tauUp,0.,0.,1.);
      }`,
    depthTest:false, depthWrite:false, blending:THREE.NoBlending,
  });
  try {
    layer.renderQuad(material, target);
    const pixels=new Uint16Array(target.width*target.height*4);
    renderer.readRenderTargetPixels(target,0,0,target.width,target.height,pixels);
    const ranges=[0,target.height-1].map(y=>{
      let low=Infinity,high=-Infinity;
      for(let x=0;x<target.width;x++){
        const value=THREE.DataUtils.fromHalfFloat(pixels[(y*target.width+x)*4]);
        low=Math.min(low,value);high=Math.max(high,value);
      }
      return {low,high,span:high-low};
    });
    const expected=[columnExpected(C.cellA),columnExpected(C.cellB)];
    if(baseline) {
      if(ranges.some(r=>r.span<.2*r.high)) throw new Error(`Cloud column phase regression not detected: ${JSON.stringify(ranges)}`);
    } else {
      if(ranges.some(r=>r.span!==0)) throw new Error(`Cloud column phase regression: ${JSON.stringify(ranges)}`);
      if(ranges.some((r,k)=>Math.abs(r.low-expected[k])>2e-3*Math.max(1,expected[k]))) throw new Error(`Cloud column changed its closed form: ${JSON.stringify({ranges,expected})}`);
    }
    return {baseline,ranges,expected};
  } finally {material.dispose(); target.dispose();}
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
    const edgeBefore=runSmoothEdgeCase(layer,renderer,seed,true);
    const edge=runSmoothEdgeCase(layer,renderer,seed);
    const columnBefore=runColumnPhaseCase(layer,renderer,true);
    const column=runColumnPhaseCase(layer,renderer);
    return { backend, cases, edgeBefore, edge, columnBefore, column };
  } finally {
    seed.dispose(); layer.dispose(); renderer.dispose(); renderer.forceContextLoss();
  }
}
