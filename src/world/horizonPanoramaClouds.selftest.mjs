// The far earth's cloud composite is the cloud dome's (the mountains lane, 2026-10-05; horizonPanorama.ts
// CLOUD_COMPOSITE_GLSL). The far earth converges onto the screen's own horizon, which is the dome under the cloud layer
// (under a deck, the deck's far rows). volumetricClouds.ts keeps the composite in its dome's fragment, not as a chunk the
// shell could import, so the shell carries a copy, and this receipt fails the build on any difference:
//   - it reads the dome's filter (cloudsCatmullRom), knee (cloudKnee) and composite statements out of
//     volumetricClouds.ts's source and the shell's out of the fragment the shell compiles, runs both through one
//     GLSL-subset evaluator on the same histories, uvs, directions, knees, intensities, flashes and skies, and holds the
//     shell's result to the dome's under the dome's blend (one, one minus the source alpha); every branch runs both ways;
//   - it holds the read's place and timing: the dome samples the history at the fragment's own place on the screen, the
//     history resolves (traceSlot) inside beforeSceneRender, which post.ts calls before the scene draws and before TAA's
//     jitter, so the shell's read of this frame's history at this frame's view-projection is the dome's own;
//   - it checks that the shell's onBeforeRender hands its composite the cloud dome's uniforms, only while the dome draws,
//     and that the read eases to the proxy at the frame's top and bottom without a jump.
//   node src/world/horizonPanoramaClouds.selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createHorizonPanorama } from './horizonPanorama.ts';
import { closingBrace, parseGlsl, runGlsl, runGlslFunction, stripComments } from './glslSubset.test-support.mjs';

const squash = (s) => stripComments(s).replace(/\s+/g, ' ').trim();

/** The body of the function opened by `signature` in `text` (braces matched past comments). */
function functionBody(text, signature, label) {
  const at = text.indexOf(signature);
  assert.ok(at >= 0 && text.indexOf(signature, at + 1) < 0, `${label}: one ${signature}`);
  const open = text.indexOf('{', at + signature.length - 1);
  const close = closingBrace(text, open);
  assert.ok(close > open, `${label}: ${signature} closes`);
  return text.slice(open + 1, close);
}

// ------------------------------------------------------------------------------------------------- the two copies
const clouds = readFileSync(new URL('../engine/volumetricClouds.ts', import.meta.url), 'utf8');
const domeFrom = clouds.indexOf('const DOME_FRAGMENT = /* glsl */`');
assert.ok(domeFrom > 0, 'volumetricClouds.ts: the cloud dome\'s fragment');
const domeFrag = clouds.slice(domeFrom, clouds.indexOf('`;', domeFrom));
assert.ok(!domeFrag.slice(1).includes('${'), 'the dome\'s fragment interpolates nothing (its text is the shader)');
const domeMain = functionBody(domeFrag, 'void main() {', 'the cloud dome');
// the dome's sample: at the fragment's own place on the screen, on its view ray
const lead = 'vec3 dir = normalize( vWorldPosition - cameraPosition ); vec2 uv = gl_FragCoord.xy / uTargetSize;';
assert.ok(squash(domeMain).startsWith(lead), 'the dome samples the history at the fragment\'s place on the screen (gl_FragCoord / the target), on its view ray');
const uvAt = domeMain.indexOf('vec2 uv = gl_FragCoord.xy / uTargetSize;');
const domeComposite = domeMain.slice(domeMain.indexOf(';', uvAt) + 1);
assert.ok(squash(domeComposite).endsWith('gl_FragColor = vec4( rgb, alpha );'), 'the dome writes its cloud and its alpha last');

const handle = createHorizonPanorama({ ringEdge: (() => {
  const n = 431, rows = 3, positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
  for (let row = 0; row < rows; row++) for (let c = 0; c < n; c++) {
    const a = (c / n) * Math.PI * 2, r = 1000 + row * 160, i = row * n + c;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 2] = Math.sin(a) * r;
    heights[i] = positions[i * 3 + 1] = 40 + row * 10;
  }
  return { columns: n, positions, heights };
})(), sun: [0.3, 0.6, 0.2], gains: { ambient: 0.8, sunGain: 1.4 }, fogDensity: 0.0003 });
const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader };
handle.mesh.material.onBeforeCompile(shader);
const frag = shader.fragmentShader;
const shellOver = functionBody(frag, 'vec3 panoCloudOver( vec3 sky, vec2 uv, vec3 dir ) {', 'the shell');
assert.ok(squash(shellOver).endsWith('return rgb + sky * ( 1.0 - alpha );'), 'the shell lays its cloud over the sky by the dome\'s blend');

const parsed = {
  dome: {
    catmull: parseGlsl(functionBody(domeFrag, 'vec4 cloudsCatmullRom( vec2 uv, vec2 size ) {', 'the cloud dome')),
    knee: parseGlsl(functionBody(domeFrag, 'vec3 cloudKnee( vec3 c ) {', 'the cloud dome')),
    composite: parseGlsl(domeComposite),
  },
  shell: {
    catmull: parseGlsl(functionBody(frag, 'vec4 cloudsCatmullRom( vec2 uv, vec2 size ) {', 'the shell')),
    knee: parseGlsl(functionBody(frag, 'vec3 cloudKnee( vec3 c ) {', 'the shell')),
    composite: parseGlsl(shellOver),
  },
};

// the dome's blend and its uniforms, and the read's place in the frame
const domeMaterialAt = clouds.indexOf('this.domeMaterial = new THREE.ShaderMaterial({');
const domeMaterial = clouds.slice(domeMaterialAt, clouds.indexOf('});', domeMaterialAt));
assert.ok(domeMaterial.includes('blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,'),
  'the cloud dome blends one over one minus its alpha (its cloud added to the sky it covers)');
for (const name of ['tClouds', 'uHistorySize', 'uKnee', 'uSkyIntensity', 'uFlash', 'uFlashTint', 'uInside', 'uSunDir']) {
  assert.ok(new RegExp(`\\b${name}: \\{ value:`).test(domeMaterial), `the cloud dome's material holds ${name}, which the shell copies`);
}
assert.ok(/readonly dome: THREE\.Mesh</.test(clouds) && clouds.includes('this.dome = new THREE.Mesh(geometry, this.domeMaterial);'),
  'the cloud dome is the layer\'s public mesh on its own material');
const traceSlot = functionBody(clouds, '  private traceSlot(slot: number): void {', 'volumetricClouds.ts');
assert.ok(traceSlot.includes('this.domeMaterial.uniforms.tClouds.value = next.texture;'), 'each trace resolves the history the dome composites');
const beforeScene = functionBody(clouds, '  beforeSceneRender(', 'volumetricClouds.ts');
assert.ok(beforeScene.includes('this.traceSlot(') && beforeScene.includes('this.dome.visible = true;'), 'the frame\'s traces resolve before the scene, and the dome draws');
const post = readFileSync(new URL('../engine/post.ts', import.meta.url), 'utf8');
// (the call itself, a statement of the frame: not a closure or a comment that names it)
const hookAt = post.search(/^ {4}scene\.userData\.volumetricClouds\?\.beforeSceneRender\(renderer, camera,/m);
const jitterAt = post.indexOf('applyProjectionJitter(camera.projectionMatrix', hookAt);
const renderAt = post.indexOf('composer.render(dt);', hookAt);
assert.ok(hookAt > 0 && jitterAt > hookAt && renderAt > jitterAt && renderAt - hookAt < 2500,
  'post.ts resolves the clouds, then jitters the projection, then draws the scene: the shell reads this frame\'s history, and its view-projection is the one the dome\'s fragments land on');

// ---------------------------------------------------------------------------------------- both copies, run alike
// a history with light past the knee and past the dome's clamp, and a transmittance under 0 and over 1 (the sample's max
// and min); a filter's taps read it by uv
const SAMPLER = { history: true };
const texture2D = (sampler, [u, v]) => {
  assert.equal(sampler, SAMPLER, 'the copies sample the cloud history');
  return [4 + 4 * Math.sin(7 * u + 3 * v), 0.6 + 0.5 * Math.sin(5 * u - 2 * v), 2 + 1.5 * Math.cos(3 * u + 4 * v), 0.6 + 0.7 * Math.sin(4 * u + 6 * v)];
};
// (each chunk's branches by its own ids)
const taken = Object.fromEntries(['dome', 'shell'].map((side) => [side, { catmull: new Set(), knee: new Set(), composite: new Set() }]));
const functionsOf = (side, uniforms) => ({
  cloudsCatmullRom: (uv, size) => runGlslFunction(parsed[side].catmull, { uv, size, tClouds: SAMPLER }, { texture2D }, taken[side].catmull),
  cloudKnee: (c) => runGlslFunction(parsed[side].knee, { c, uKnee: uniforms.uKnee }, {}, taken[side].knee),
});
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const sunDir = norm([0.6, 0.004, 0.8]);
const UVS = [[0.5, 0.5], [0.02, 0.97], [0.98, 0.03], [0.31, 0.62], [0.77, 0.12]];
const DIRS = [sunDir, norm([-0.3, -0.03, 0.95]), norm([0.1, -0.08, -0.99]), norm([0, 0.5, 0.86]), norm([0.62, 0.02, 0.79])];
const SKIES = [[0.4, 0.5, 0.7], [1.2, 1.1, 0.9]];
let runs = 0, worst = 0;
for (const inside of [0, 1]) for (const flash of [[0, 0, 0, 0], [...norm([0.6, 0.05, 0.8]), 0.9]]) {
  for (const knee of [[0.8, 0.6, 1.5], [1e6, 0, 1]]) for (const intensity of [1, 0.35]) {
    const uniforms = { uHistorySize: [960, 540], uKnee: knee, uSkyIntensity: intensity, uFlash: flash, uFlashTint: [0.78, 0.84, 1.0], uSunDir: sunDir, uInside: inside };
    for (const uv of UVS) for (const dir of DIRS) {
      const out = runGlsl(parsed.dome.composite, { ...uniforms, dir, uv, gl_FragColor: [0, 0, 0, 0] }, functionsOf('dome', uniforms), taken.dome.composite).gl_FragColor;
      for (const sky of SKIES) {
        const blended = [0, 1, 2].map((c) => out[c] + sky[c] * (1 - out[3]));
        const shell = runGlslFunction(parsed.shell.composite, { ...uniforms, sky, uv, dir }, functionsOf('shell', uniforms), taken.shell.composite);
        const d = Math.max(...shell.map((v, c) => Math.abs(v - blended[c])));
        worst = Math.max(worst, d);
        assert.equal(d, 0, `inside ${inside}, flash ${flash[3]}, knee ${knee[0]}, intensity ${intensity}, uv ${uv}, dir ${dir.map((v) => v.toFixed(3))}: the shell composites as the dome does (${shell} vs ${blended})`);
        runs++;
      }
    }
  }
}
// every branch of every chunk ran both ways (the flash, the knee): a branch never taken is a copy never compared
for (const side of ['dome', 'shell']) for (const part of ['catmull', 'knee', 'composite']) {
  for (let b = 0; b < parsed[side][part].branches; b++) {
    assert.ok(taken[side][part].has(`${b}:true`) && taken[side][part].has(`${b}:false`), `${side}'s ${part}: branch ${b} ran both ways`);
  }
}
assert.ok(parsed.dome.knee.branches === 1 && parsed.dome.composite.branches === 1, 'the dome\'s knee and its flash are its branches');

// ------------------------------------------------------------------------------------ the shell's read of the layer
assert.ok(frag.includes('vec4 hc = uPanoViewProj * vec4(hdir, 0.0);') && frag.includes('vec2 cuv = hc.xy / hc.w * 0.5 + 0.5;')
  && frag.includes('if (inFrame > 0.0) screen = mix(screen, panoCloudOver(domeSky, vec2(clamp(cuv.x, 0.0, 1.0), cuv.y), hdir), inFrame);'),
  'the shell reads the history at the horizon point\'s place on this frame\'s screen, over the dome as it draws there');
assert.ok(/uniform sampler2D tClouds;/.test(frag) && /uniform mat4 uPanoViewProj;/.test(frag), 'the shell declares the history and the view-projection');
// the read eases to the proxy toward the frame's top and bottom: no jump as the horizon point leaves the frame
{
  const line = frag.split('\n').find((l) => l.includes('float inFrame = '));
  const weight = parseGlsl(line.trim().replace(/^float inFrame = /, 'inFrame = '));
  let prev = null, step = 0;
  for (let y = -0.02; y <= 1.02 + 1e-9; y += 0.0005) {
    const w = runGlsl(weight, { cuv: [0.5, y], inFrame: 0 }, {}, new Set()).inFrame;
    if (y < 0 || y > 1) assert.equal(w, 0, `off the frame (${y.toFixed(4)}): the proxy`);
    if (prev !== null) step = Math.max(step, Math.abs(w - prev));
    prev = w;
  }
  assert.ok(step < 0.02, `the read's weight moves by at most ${step.toFixed(4)} per 0.05 % of the frame (no jump)`);
  assert.equal(runGlsl(weight, { cuv: [0.5, 0.5], inFrame: 0 }, {}, new Set()).inFrame, 1, 'over the frame: the layer\'s composite');
}
const air = handle.mesh.userData.panoAir;
air.uPanoHaze.value.w = 1; // (the bake's hand-over: the law is on)
const scene = new THREE.Scene();
scene.userData.atmosphere = { active: true, skyView: new THREE.Texture(), viewHeightKm: 0.05, sunDir: new THREE.Vector3(0.3, 0.5, 0.2).normalize(),
  knee: new THREE.Vector3(0.5, 2, 1), skyIntensity: 1, fogTint: new THREE.Color(0.8, 0.85, 0.9), fogMix: 0.5, fogDensity: 0.0003 };
scene.userData.lightModel = { mode: 'physical', overcast: 1 };
const history = new THREE.Texture();
const cloudUniforms = {
  tClouds: { value: history }, uTargetSize: { value: new THREE.Vector2(1920, 1080) }, uHistorySize: { value: new THREE.Vector2(960, 540) },
  uKnee: { value: new THREE.Vector3(0.7, 0.9, 1.3) }, uSkyIntensity: { value: 0.83 }, uFlash: { value: new THREE.Vector4(0.1, 0.2, 0.97, 0.4) },
  uFlashTint: { value: new THREE.Vector3(0.78, 0.84, 1.0) }, uInside: { value: 0 }, uSunDir: { value: new THREE.Vector3(0.6, 0.2, 0.77) },
};
const cloudDome = new THREE.Mesh(new THREE.SphereGeometry(1, 4, 2), new THREE.ShaderMaterial({ uniforms: cloudUniforms }));
scene.userData.volumetricClouds = { dome: cloudDome };
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 60000);
camera.position.set(-420, 304, -420);
camera.lookAt(60, 0, 60);
camera.updateMatrixWorld(true);
camera.projectionMatrix.elements[8] += 0.0004; // (a TAA jitter, as post.ts applies it before the scene draws)
cloudDome.visible = true;
handle.mesh.onBeforeRender(null, scene, camera);
assert.equal(air.uPanoCloudOn.value, 1, 'the layer draws: the shell reads it');
assert.equal(air.tClouds.value, history, 'the history the dome composites this frame');
for (const name of ['uHistorySize', 'uKnee', 'uFlash', 'uFlashTint', 'uSunDir']) {
  assert.deepEqual(air[name].value.toArray(), cloudUniforms[name].value.toArray(), `the dome's ${name}`);
}
assert.ok(air.uSkyIntensity.value === 0.83 && air.uInside.value === 0, 'the dome\'s intensity and its inside flag');
const vp = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
assert.deepEqual(air.uPanoViewProj.value.toArray(), vp.toArray(), 'this frame\'s view-projection, its jitter included');
{
  // the horizon point's place by that view-projection is where the frame draws it (three's own projection)
  const d = new THREE.Vector3(0.62, 0.004, 0.78).normalize();
  const clip = new THREE.Vector4(d.x, d.y, d.z, 0).applyMatrix4(vp);
  const ndc = new THREE.Vector3().copy(camera.position).addScaledVector(d, 50000).applyMatrix4(vp);
  assert.ok(clip.w > 0 && Math.abs(clip.x / clip.w - ndc.x) < 1e-3 && Math.abs(clip.y / clip.w - ndc.y) < 1e-3, 'a direction lands where the frame draws it');
}
cloudDome.visible = false;
handle.mesh.onBeforeRender(null, scene, camera);
assert.ok(air.uPanoCloudOn.value === 0 && air.tClouds.value === null, 'the layer hidden (the baked decks, the mobile tier): the proxy, no history held');
scene.userData.volumetricClouds = null;
handle.mesh.onBeforeRender(null, scene, camera);
assert.equal(air.uPanoCloudOn.value, 0, 'no layer: the proxy');
cloudDome.visible = true;
scene.userData.volumetricClouds = { dome: cloudDome };
handle.mesh.onBeforeRender(null, { userData: {} }, camera);
assert.ok(air.uPanoCloudOn.value === 0 && air.tClouds.value === null, 'no live sky: nothing read, no history held');

// ------------------------------------------------------------------------------------ the aerial pass's cloud shade
// (2026-10-05: Titan Gorge's far earth took patches up to a third darker under its dense overcast, whose clouds cast no
// shadows of their own) post.ts multiplies every geometry pixel by its world-anchored cloud shade after the haze; the far
// earth divides its screen horizon by the same factor first. post.ts's noise and shade statements against the shell's
// AERIAL_CLOUD_SHADE_GLSL, run alike on positions across the noise lattice and four shade depths.
let shadeRuns = 0, shaded = 0;
{
  const hazeAt = post.indexOf('texel.rgb = texel.rgb * trans + hazeCol * ( 1.0 - trans );');
  const blockAt = post.indexOf('        if ( uCloudShade > 0.003 ) {', hazeAt);
  assert.ok(hazeAt > 0 && blockAt > hazeAt && blockAt - hazeAt < 4000, 'post.ts shades geometry by its cloud shade after the haze');
  const postBlock = parseGlsl(post.slice(blockAt, closingBrace(post, post.indexOf('{', blockAt)) + 1));
  const postHash = parseGlsl(functionBody(post, '    float vhash( vec2 p ) {', 'post.ts'));
  const postNoise = parseGlsl(functionBody(post, '    float vnoise( vec2 p ) {', 'post.ts'));
  const shellHash = parseGlsl(functionBody(frag, 'float vhash( vec2 p ) {', 'the shell'));
  const shellNoise = parseGlsl(functionBody(frag, 'float vnoise( vec2 p ) {', 'the shell'));
  const shellShade = parseGlsl(functionBody(frag, 'float panoCloudShade( vec2 cp ) {', 'the shell'));
  const taken = { post: new Set(), shell: new Set() };
  const noiseOf = (hash, noise, set) => {
    const vhash = (p) => runGlslFunction(hash, { p }, {}, set);
    return { vnoise: (p) => runGlslFunction(noise, { p }, { vhash }, set) };
  };
  for (const uCloudShade of [0, 0.002, 0.22, 0.3]) {
    for (let x = -2700; x <= 2700; x += 337) for (let z = -2650; z <= 2650; z += 419) {
      const texel = runGlsl(postBlock, { uCloudShade, uCamPos: [x, 300, z], ray: [0, 0, 0], rayT: 0, texel: [1, 1, 1, 1] }, noiseOf(postHash, postNoise, taken.post), taken.post).texel;
      const shell = runGlslFunction(shellShade, { cp: [x, z], uCloudShade }, noiseOf(shellHash, shellNoise, taken.shell), taken.shell);
      assert.ok(texel[0] === texel[1] && texel[1] === texel[2], 'post.ts shades the three channels alike');
      assert.equal(shell, texel[0], `shade ${uCloudShade} at (${x}, ${z}): the shell's shade is the aerial pass's (${shell} vs ${texel[0]})`);
      if (shell < 0.99) shaded++;
      shadeRuns++;
    }
  }
  assert.ok(taken.post.has('0:true') && taken.post.has('0:false') && taken.shell.has('0:true') && taken.shell.has('0:false'), 'the shade ran on and off');
  assert.ok(shaded > shadeRuns / 10, `the noise shaded some of the positions (${shaded} of ${shadeRuns})`);
  assert.ok(post.includes('aerial.uniforms.uCloudShade.value = scene.userData.cloudShadeAmp ?? CLOUD_SHADE_DEFAULT;') && post.includes('const CLOUD_SHADE_DEFAULT = 0.22;')
    && readFileSync(new URL('./horizonPanorama.ts', import.meta.url), 'utf8').includes("air.uCloudShade.value = typeof shade === 'number' && Number.isFinite(shade) ? shade : 0.22;"),
    'the shell reads the shade the aerial pass reads (the published depth, else its 0.22)');
  assert.ok(frag.includes('screen /= max(panoCloudShade(vPanoWorld.xz), 0.05);')
    && frag.indexOf('screen /= max(panoCloudShade(vPanoWorld.xz), 0.05);') < frag.indexOf('inScatter = max((screen - aerialT * (1.0 - Tp)) / max(Tp, vec3(0.05)), vec3(0.0));'),
    'the far earth takes the shade out of its screen horizon, at its own place, before the aerial pass\'s compensation');
}
console.log(`horizonPanoramaClouds.selftest: the far earth composites the clouds at its horizon as the cloud dome does: ${runs} composites (filter, knee, flash, inside, two skies), worst |Δ| ${worst}; read at this frame's view-projection after the history resolves; eased to the proxy at the frame's edges; the aerial pass's cloud shade taken out (${shadeRuns} positions) PASS`);
