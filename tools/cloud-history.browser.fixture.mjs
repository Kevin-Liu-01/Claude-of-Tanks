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

// A changing light field can put last frame's radiance outside this frame's
// bounds. Those bounds must vary with the pixel, not jump at 4×4 trace blocks.
function runSmoothEdgeCase(layer, renderer, seed, baseline = false) {
  const u = layer.resolveMaterial.uniforms;
  for (const target of layer.history) layer.renderQuad(seed, target);
  const gradient = new THREE.ShaderMaterial({
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `void main(){ float c=.15+.5*gl_FragCoord.x/${layer.trace.width}.;
      gl_FragColor=vec4(c,c,c,1.-c); }`,
    depthTest:false, depthWrite:false, blending:THREE.NoBlending,
  });
  const oldFragment=layer.resolveMaterial.fragmentShader;
  try {
    if(baseline) {
      layer.resolveMaterial.fragmentShader=oldFragment.replace(
        'texture2D( tTrace, traceUv + vec2( x, y ) / uTraceSize )',
        'texelFetch( tTrace, clamp( ivec2( tp ) + ivec2( x, y ), ivec2( 0 ), ivec2( uTraceSize ) - 1 ), 0 )');
      if(layer.resolveMaterial.fragmentShader===oldFragment) throw new Error('Cloud negative control did not change its sampler');
      layer.resolveMaterial.needsUpdate=true;
    }
    layer.renderQuad(gradient, layer.trace);
    u.uPrevRight.value.copy(layer.cam.right); u.uPrevFwd.value.copy(layer.cam.fwd);
    u.uPrevTan.value.copy(layer.cam.tan);
    u.uHistoryValid.value=1; u.uRebuildK.value=-1; u.uSlot.value.set(0,0);
    u.tTrace.value=layer.trace.texture; u.tHistory.value=layer.history[0].texture;
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

// The deck integral must not change with an unrelated interleaved refresh phase.
// Evaluate the production GLSL against constant and sloped density columns so
// temporal noise is isolated from view-ray sampling and reprojection.
function runColumnPhaseCase(layer, renderer, baseline = false) {
  const source = layer.traceMaterial.fragmentShader;
  const start = source.indexOf('float cloudColumnDepthAbove(');
  const end = source.indexOf('// optical depth of the cloud above p toward the zenith', start);
  if (start < 0 || end < 0) throw new Error('Production cloud column integral missing');
  let column = source.slice(start, end);
  if ((column.match(/cloudDensityK\(/g) || []).length !== 2) throw new Error('Cloud column sampling budget changed');
  if (baseline) {
    const stable = column;
    column = column.replace('Weather w, float cellK', 'Weather w, float scale, float cellK')
      .replace('rem * 0.22', 'rem * 0.22 * scale').replace('rem * 0.66', 'rem * 0.66 * scale');
    if (column === stable) throw new Error('Column jitter negative control did not change the shader');
  }
  const target = layer.trace;
  const material = new THREE.ShaderMaterial({
    vertexShader: 'void main(){gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: `
      const float uBase=0., uThick=100., uDensity=1.;
      struct Weather {float top;};
      float cloudDensityK(vec3 p,Weather w,bool detail,float foot,float cellK){
        return gl_FragCoord.y < ${(target.height / 2).toFixed(4)} ? .6 : clamp(1.-p.y/uThick,0.,1.);
      }
      ${column}
      void main(){
        Weather w;w.top=1.;
        float phase=gl_FragCoord.x/${target.width.toFixed(4)};
        float tau=cloudColumnDepthAbove(vec3(0.),w,${baseline ? '.75+.5*phase,' : ''}1.);
        gl_FragColor=vec4(tau/uThick,0.,0.,1.);
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
    if(Math.abs(ranges[0].low-.6)>.001 || ranges[0].span!==0) throw new Error('Constant-density optical depth changed');
    if(baseline ? ranges[1].span<.2 : ranges[1].span!==0) throw new Error(`Cloud column phase regression: ${JSON.stringify(ranges)}`);
    if(!baseline && Math.abs(ranges[1].low-.538)>.001) throw new Error('Stable column changed the existing quadrature weights');
    return {baseline,ranges};
  } finally {material.dispose();}
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
