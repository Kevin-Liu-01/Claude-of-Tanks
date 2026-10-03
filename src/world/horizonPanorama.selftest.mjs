// The far horizon panorama (the mountains lane, 2026-10-03; horizonPanorama.ts): the shell's geometry and its atlas
// mapping, the bake's contract with the renderer (three passes, the renderer's state restored, the fallback far range
// handed over and taken back on a GPU suspension, no bake without a capable renderer), the shaders' uniforms, and the
// horizon's wiring (one of the two far meshes visible at a time, lookups by name still find the round-72 range).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  HORIZON_PANORAMA, HORIZON_PANORAMA_CHARACTERS, HORIZON_PANORAMA_SHADERS, buildHorizonPanoramaShellGeometry,
  createHorizonPanorama, horizonPanoramaUv, horizonRingSkylineTan, resolveHorizonPanoramaCharacter,
} from './horizonPanorama.ts';
import { HORIZON_RELIEF_CHARACTERS } from './horizonRelief.ts';

const P = HORIZON_PANORAMA;
const n = 431;
const ringEdge = (() => {
  const rows = 3, positions = new Float32Array(n * rows * 3), heights = new Float32Array(n * rows);
  for (let row = 0; row < rows; row++) for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, r = 1000 + row * 160, i = row * n + k;
    positions[i * 3] = Math.cos(a) * r; positions[i * 3 + 2] = Math.sin(a) * r;
    heights[i] = positions[i * 3 + 1] = 40 + 30 * Math.sin(a * 3) + row * 10;
  }
  return { columns: n, positions, heights };
})();

// --- the shell: row 0 on the ring's outer edge, the apron, the wall at the shell radius; u continuous round the seam --
{
  const geometry = buildHorizonPanoramaShellGeometry(ringEdge);
  const pos = geometry.getAttribute('position'), uv = geometry.getAttribute('uv');
  const rows = 1 + P.apronM.length + P.wallElevDeg.length, stride = n + 1;
  assert.equal(pos.count, rows * stride, 'the shell: (columns + the seam column) x rows vertices');
  assert.equal(geometry.index.count / 3, (rows - 1) * n * 2, `the shell's triangles (${(rows - 1) * n * 2})`);
  assert.ok((rows - 1) * n * 2 < 7000, 'the shell stays a few thousand triangles: one cheap draw');
  const start = ringEdge.heights.length - n;
  for (let k = 0; k <= n; k++) {
    const c = k % n;
    assert.ok(Math.abs(pos.getX(k) - ringEdge.positions[(start + c) * 3]) < 1e-3 && Math.abs(pos.getZ(k) - ringEdge.positions[(start + c) * 3 + 2]) < 1e-3,
      'row 0 stands on the ring\'s outer edge');
    assert.ok(Math.abs(pos.getY(k) - (ringEdge.heights[start + c] - 0.05)) < 1e-3, 'row 0 takes the ring\'s outer heights');
    assert.ok(Math.abs(uv.getX(k) - k / n) < 1e-6, 'u is the azimuth fraction, continuous across the seam (column n at u = 1)');
    let previousR = Math.hypot(pos.getX(k), pos.getZ(k)), previousE = -Math.PI;
    for (let row = 1; row < rows; row++) {
      const i = row * stride + k, r = Math.hypot(pos.getX(i), pos.getZ(i));
      assert.ok(r >= previousR - 1e-3, 'the shell never folds back toward the square');
      previousR = r;
      if (row > P.apronM.length) {
        assert.ok(r >= P.shellM - 1e-3, 'the wall stands at the shell radius');
        const e = Math.atan2(pos.getY(i) - P.eyeY, r);
        assert.ok(e >= previousE - 1e-6, 'the wall rises row by row');
        previousE = e;
      }
    }
    // the atlas mapping: a wall vertex's own u and its elevation's v are its direction from the bake eye
    const top = (rows - 1) * stride + k;
    const [u, v] = horizonPanoramaUv(pos.getX(top), pos.getY(top), pos.getZ(top));
    const uWrapped = k === n ? 1 : k / n;
    assert.ok(Math.abs(u - uWrapped) < 1e-4 || Math.abs(u + 1 - uWrapped) < 1e-4 || (k === 0 && Math.abs(u - 1) < 1e-4) || (k === n && Math.abs(u) < 1e-4),
      `a wall vertex's azimuth is its u (${u.toFixed(5)} vs ${uWrapped.toFixed(5)})`);
    assert.ok(Math.abs(v - 1) < 1e-6, 'the wall\'s top row is the strip\'s top');
  }
  geometry.dispose();
}

// --- the characters: every relief character has its far vocabulary; overrides merge -----------------------------------
for (const character of HORIZON_RELIEF_CHARACTERS) {
  const c = HORIZON_PANORAMA_CHARACTERS[character];
  assert.ok(c && c.ampM > 0 && c.macroL > c.midL && c.midL > c.gullyL, `${character}: a far vocabulary from the ranges down to the gullies`);
}
assert.equal(resolveHorizonPanoramaCharacter('alpine', { ampM: 1 }).ampM, 1, 'a map overrides its character\'s knobs');
assert.equal(resolveHorizonPanoramaCharacter('alpine', { ampM: 1 }).macroL, HORIZON_PANORAMA_CHARACTERS.alpine.macroL, 'the others stay');

// --- the layers behind the ring: the far country answers the ring's own skyline from the bake eye ----------------------
// (the panorama lab, SwiftShader: on Verdant, Frontier Basin and Saltmere the far country stood above the ring's skyline
// on 14-35 % of the bearings, by about a degree and a half; with the layers on 55-63 %, by about two)
{
  const sky = horizonRingSkylineTan(ringEdge, P.eyeY);
  assert.equal(sky.length, n, 'one skyline value per ring column');
  // the raw skyline of the fixture ring: its highest row seen from the eye
  let rawMax = -1, rawMin = 1;
  for (let k = 0; k < n; k++) {
    let t = -1;
    for (let row = 0; row < 3; row++) { const i = row * n + k, r = Math.hypot(ringEdge.positions[i * 3], ringEdge.positions[i * 3 + 2]); if (r >= 520) t = Math.max(t, (ringEdge.heights[i] - P.eyeY) / r); }
    rawMax = Math.max(rawMax, t); rawMin = Math.min(rawMin, t);
  }
  const lo = Math.min(...sky), hi = Math.max(...sky);
  assert.ok(lo >= rawMin - 1e-6 && hi <= rawMax + 1e-6, 'the envelope stays within the ring\'s own skyline');
  let jump = 0;
  for (let k = 0; k < n; k++) jump = Math.max(jump, Math.abs(sky[k] - sky[(k + 1) % n]));
  assert.ok(jump < (rawMax - rawMin) * 0.12, `the envelope is smooth round the compass (largest column step ${jump.toFixed(4)})`);
}
for (const [character, c] of Object.entries(HORIZON_PANORAMA_CHARACTERS)) {
  assert.ok(c.layers >= 0 && c.layers <= 1, `${character}: the layers' strength is a share`);
  assert.equal(c.plinth, character === 'rolling' || character === 'coastal', `${character}: the hill countries layer as ridgelines, the mountain countries scale their ranges`);
}
assert.ok(HORIZON_PANORAMA_SHADERS.height.includes('edge.a') && HORIZON_PANORAMA_SHADERS.height.includes('gPlinth'), 'the height pass reads the ring\'s skyline and writes the plinth');
assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes('texture2D(uHeight, g).g'), 'the strip zones its forest and snow over the plinth');

// --- the shaders: the passes read the uniforms the baker binds -------------------------------------------------------
for (const [name, source] of Object.entries(HORIZON_PANORAMA_SHADERS)) {
  if (name === 'vertex') continue;
  assert.ok(/void main\(\)/.test(source), `${name}: a fragment program`);
}
for (const u of ['uChar0', 'uChar1', 'uChar2', 'uFrame', 'uEdge', 'uOff0']) assert.ok(HORIZON_PANORAMA_SHADERS.height.includes(u), `the height pass reads ${u}`);
for (const u of ['uHeight', 'uSun', 'uGrid']) assert.ok(HORIZON_PANORAMA_SHADERS.light.includes(u), `the light pass reads ${u}`);
for (const u of ['uHeight', 'uLight', 'uElev', 'uFog', 'uRock', 'uSnow', 'uForest']) assert.ok(HORIZON_PANORAMA_SHADERS.strip.includes(u), `the strip pass reads ${u}`);

// --- the baker's contract with the renderer ----------------------------------------------------------------------------
function recordingRenderer({ webgl2 = true, maxTextureSize = 16384, floatTargets = true } = {}) {
  const calls = [];
  let target = null, autoClear = true, clearAlpha = 1;
  const clearColor = new THREE.Color(0.2, 0.3, 0.4);
  return {
    calls,
    capabilities: { isWebGL2: webgl2, maxTextureSize },
    extensions: { has: (name) => floatTargets && (name === 'EXT_color_buffer_float' || name === 'EXT_color_buffer_half_float') },
    getRenderTarget: () => target,
    setRenderTarget: (t) => { target = t; calls.push(['target', t ? `${t.width}x${t.height}` : null]); },
    render: (scene, camera) => { calls.push(['render', target ? `${target.width}x${target.height}` : null, scene.children[0]?.material?.type]); },
    get autoClear() { return autoClear; }, set autoClear(v) { autoClear = v; },
    getClearColor: (out) => out.copy(clearColor),
    getClearAlpha: () => clearAlpha,
    setClearColor: (c, a) => { clearColor.copy(c); clearAlpha = a; },
    clear: () => calls.push(['clear']),
    state: () => ({ target, autoClear, clearAlpha, clearColor: clearColor.getHex() }),
  };
}
const palette = { base: new THREE.Color(0x5b6c4c), rock: new THREE.Color(0x66625e), snow: new THREE.Color(0xeef2f7), forest: new THREE.Color(0x435f3a), fog: new THREE.Color(0x8fa3bd) };
const options = { seed: 1337, character: 'alpine', palette, sun: [0.5, 0.6, 0.6], gains: { ambient: 0.5, sunGain: 1.3 }, deckBaseM: 1900, seaOpenings: [], ringEdge };
{
  const fallback = new THREE.Object3D();
  const handle = createHorizonPanorama(options, fallback);
  assert.equal(handle.mesh.visible, false, 'the shell waits for its atlas');
  assert.equal(handle.ensureBaked(null), false, 'no renderer, no bake (the receipts, the headless audits)');
  assert.equal(fallback.visible, true, 'the round-72 far range stays on meanwhile');
  for (const [stub, why] of [[recordingRenderer({ webgl2: false }), 'webgl1'], [recordingRenderer({ maxTextureSize: 4096 }), 'max texture size'], [recordingRenderer({ floatTargets: false }), 'no float render targets']]) {
    assert.equal(handle.ensureBaked(stub), false, `${why}: no bake`);
    assert.equal(handle.stats.unsupported, why, `${why}: recorded for the probes`);
    assert.equal(stub.calls.length, 0, `${why}: the renderer untouched`);
    assert.equal(fallback.visible, true, `${why}: the fallback stays`);
  }
  const renderer = recordingRenderer();
  const before = renderer.state();
  assert.equal(handle.ensureBaked(renderer), true, 'a capable renderer bakes');
  const renders = renderer.calls.filter((c) => c[0] === 'render');
  assert.deepEqual(renders.map((c) => c[1]), [`${P.gridA}x${P.gridR}`, `${P.gridA}x${P.gridR}`, `${P.width}x${P.height}`], 'three passes: the heights, their light, the strip');
  assert.deepEqual(renderer.state(), before, 'the renderer\'s target, clear colour and alpha and auto-clear are restored');
  assert.equal(handle.mesh.visible, true, 'the shell shows once baked');
  assert.equal(fallback.visible, false, 'and takes the round-72 far range\'s place: one far draw');
  assert.ok(handle.mesh.material.map?.isTexture, 'the atlas is the shell\'s map (resource tracking sees it)');
  assert.equal(handle.ensureBaked(renderer), true, 'baked: a no-op');
  assert.equal(renderer.calls.filter((c) => c[0] === 'render').length, 3, 'no second bake while the atlas lives');
  // a GPU suspension disposes the atlas texture: the fallback comes back and the next request bakes again
  handle.mesh.material.map.dispose();
  assert.equal(handle.baked, false, 'a disposed atlas is not baked');
  assert.equal(handle.mesh.visible, false, 'the shell hides with its atlas gone');
  assert.equal(fallback.visible, true, 'the round-72 far range is back');
  assert.equal(handle.ensureBaked(renderer), true, 'and the next request bakes again');
  assert.equal(handle.stats.bakes, 2, 'twice in all');
  handle.dispose();
}

console.log('horizonPanorama.selftest: the shell, its atlas mapping, the far vocabulary, the passes and the bake contract PASS');
