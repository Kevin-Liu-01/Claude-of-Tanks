import * as T from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { packAmbientOcclusionShader, AMBIENT_OCCLUSION_DENOISE_SHADER } from '../src/engine/ambientOcclusionFilter.ts';

export function checkAmbientOcclusion() {
  const renderer = new T.WebGLRenderer();
  const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
  const backend = ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
  if (!backend || /swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(backend)) throw new Error(`Native GPU required: ${backend}`);
  const width = 65, height = 33;
  const camera = new T.PerspectiveCamera(55, width / height, .1, 2000);
  const packed = new T.WebGLRenderTarget(width, height, { type: T.HalfFloatType });
  const filtered = packed.clone();
  const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const seed = new T.ShaderMaterial({ vertexShader, uniforms: { mode: { value: 0 } },
    fragmentShader: packAmbientOcclusionShader(`
      varying vec2 vUv; uniform int mode;
      void main() {
        vec3 viewNormal=vec3(0.,0.,1.); vec3 viewPos=vec3(0.,0.,-10.); float ao=.5;
        bool right = gl_FragCoord.x >= 32.;
        if(mode==1) ao=.55 + .3 * (fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453)>.5?1.:-1.);
        if(mode==2 || mode==3 || mode==4){ao=right?.9:.2;}
        if(mode==2 && right) viewNormal=vec3(1.,0.,0.);
        if(mode==3 && right) viewPos.z=-100.;
        if((mode==4 && right)||mode==5){discard;return;}
        if(mode==6)viewNormal=normalize(vec3(.3,-.7,-.5));
        gl_FragColor = FRAGMENT_OUTPUT;
      }`), depthTest: false, depthWrite: false, blending: T.NoBlending });
  const denoise = new T.ShaderMaterial({ vertexShader,
    fragmentShader: AMBIENT_OCCLUSION_DENOISE_SHADER,
    uniforms: { tDiffuse: { value: packed.texture }, cameraProjectionMatrixInverse: { value: camera.projectionMatrixInverse },
      depthPhi: { value: 6 }, normalPhi: { value: 3 }, lumaPhi: { value: 10 } },
    depthTest: false, depthWrite: false, blending: T.NoBlending });
  const quad = new FullScreenQuad(seed), raw = new Uint16Array(width*height*4), output = raw.slice();
  const cases = [];
  const get = (data,x,y,c=0) => T.DataUtils.fromHalfFloat(data[(y*width+x)*4+c]);
  try {
    for(const [mode,name] of ['constant','grain','normal-edge','depth-edge','sky-edge','sky','folded-normal'].entries()) {
      seed.uniforms.mode.value=mode;quad.material=seed;renderer.setRenderTarget(packed);quad.render(renderer);
      quad.material=denoise;renderer.setRenderTarget(filtered);quad.render(renderer);
      renderer.readRenderTargetPixels(packed,0,0,width,height,raw);
      renderer.readRenderTargetPixels(filtered,0,0,width,height,output);
      let maxError=0, beforeVariance=0, afterVariance=0, count=0;
      for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
        const actual=get(output,x,y); if(!Number.isFinite(actual))throw new Error(`${name}: non-finite output`);
        const expected=mode===4 ? (x>=32?1:.2) : mode===5?1:(mode===2||mode===3)?(x>=32?.9:.2):.5;
        if(mode!==1)maxError=Math.max(maxError,Math.abs(actual-expected));
        else if(x>2&&x<width-3&&y>2&&y<height-3){beforeVariance+=(get(raw,x,y)-.55)**2;afterVariance+=(actual-.55)**2;count++;}
      }
      if(maxError>.001)throw new Error(`${name}: edge/constant changed by ${maxError}`);
      const varianceRatio=mode===1?afterVariance/beforeVariance:null;
      if(mode===1&&varianceRatio>.2)throw new Error(`grain: variance ratio ${varianceRatio} must be below .2`);
      if(mode===6){
        const e=new T.Vector2(get(raw,20,15,1),get(raw,20,15,2));
        const n=new T.Vector3(e.x,e.y,1-Math.abs(e.x)-Math.abs(e.y));
        const t=Math.max(0,Math.min(1,-n.z));n.x+=n.x>=0?-t:t;n.y+=n.y>=0?-t:t;n.normalize();
        if(n.dot(new T.Vector3(.3,-.7,-.5).normalize())<.99999)throw new Error('folded octahedral normal did not survive RGBA16F');
      }
      cases.push({name,maxError,varianceRatio,samples:count});
    }
    return {backend,cases};
  } finally {quad.dispose();seed.dispose();denoise.dispose();packed.dispose();filtered.dispose();renderer.dispose();renderer.forceContextLoss();}
}
