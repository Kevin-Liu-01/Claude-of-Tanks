// The far earth's deck greying is the dome's (the mountains lane, 2026-10-05; horizonPanorama.ts DOME_DECK_GREY_GLSL).
// The far earth converges onto the screen's own horizon, which under a deck is the dome greyed by sky.ts's deck greying.
// sky.ts keeps that greying inline in the dome's fragment, not as a chunk the shell could import, so the shell carries a
// copy. A copy can drift silently, and a drift is the seam this convergence removes, so this receipt fails the build on
// any difference:
//   - it reads the dome's greying out of sky.ts's source and the shell's out of the fragment the shell compiles, parses
//     both with the same GLSL-subset evaluator and runs them on the same skies, directions, overcasts and knobs; the
//     results must be equal, and every branch of each must have run;
//   - it runs sky.ts's own uniform setup (the deck's tint and weight by the light model's overcast, its mode and the
//     SKY_DECK_HORIZON knob; the closed deck) and checks that the shell's onBeforeRender hands its greying the dome's
//     uniforms;
//   - it checks that nothing else in the dome changes the sky between its lookup and its greying, or between the greying
//     and the sun's terms.
//   node src/world/horizonPanoramaDeck.selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { createHorizonPanorama } from './horizonPanorama.ts';
import { closingBrace, parseGlsl, runGlsl, stripComments } from './glslSubset.test-support.mjs';

// the evaluator against GLSL's own definitions (a wrong built-in would show in both chunks alike and pass, so it is held
// here instead)
{
  const run = (src, vars = {}) => runGlsl(parseGlsl(src), { r: 0, v: [0, 0, 0], ...vars }, {}, new Set());
  assert.equal(run('r = smoothstep( 0.0, 0.12, 0.06 );').r, 0.5, 'smoothstep: t * t * (3 - 2t) on the clamped ramp');
  assert.equal(run('r = smoothstep( 0.0, 0.12, -1.0 ) + smoothstep( 0.0, 0.12, 5.0 );').r, 1, 'smoothstep clamps');
  assert.deepEqual(run('v = mix( vec3( 1.0, 2.0, 4.0 ), vec3( 3.0 ), 0.25 );').v, [1.5, 2.25, 3.75], 'mix: x(1 - a) + y a');
  assert.deepEqual(run('v = max( vec3( 0.1, -2.0, 7.0 ), 0.5 ) * 2.0;').v, [1, 1, 14], 'componentwise with a scalar');
  assert.equal(run('r = dot( vec3( 1.0, 2.0, 3.0 ), vec3( 4.0, 5.0, 6.0 ) ) - length( vec2( 3.0, 4.0 ) );').r, 27, 'dot and length');
  assert.deepEqual(run('v = vec3( normalize( vec3( 0.0, 3.0, 4.0 ) ).yz, 1.0 ); v.x = 2.0; v.yz *= 2.0;').v, [2, 1.6, 2], 'swizzles read and written');
  assert.equal(run('r = 1.0 > 2.0 ? 3.0 : 4.0 + 1.0;').r, 5, '?: under the arithmetic');
  assert.equal(run('if ( r > 0.0 ) r = 9.0; else { float t = 2.0; r = t * 3.0; }').r, 6, 'if, else, a scoped declaration');
  for (const bad of ['r = 1;', 'r = foo( 1.0 );', 'for ( float k = 0.0; k < 2.0; k += 1.0 ) {}', 'r = q;', 'r = vec3( 1.0 );', 'v = vec3( 1.0, 2.0 );']) {
    assert.throws(() => run(bad), /glsl:/, `outside the subset or the types: ${bad}`);
  }
}

// ------------------------------------------------------------------------------------------- the two chunks


/** A greying chunk: the weight's declaration and the if after it, braces matched past comments. */
function deckChunk(text, label) {
  const hits = [...text.matchAll(/float deckW = max\(/g)];
  assert.equal(hits.length, 1, `${label}: one deck greying (float deckW = max(...)), found ${hits.length}`);
  const start = hits[0].index;
  let k = text.indexOf(';', start) + 1;
  const skip = () => {
    for (;;) {
      while (/\s/.test(text[k])) k++;
      if (text.startsWith('//', k)) k = text.indexOf('\n', k);
      else if (text.startsWith('/*', k)) k = text.indexOf('*/', k) + 2;
      else return;
    }
  };
  skip();
  assert.ok(/^if\s*\(/.test(text.slice(k, k + 8)), `${label}: the greying's if follows its weight`);
  const close = closingBrace(text, k);
  assert.ok(close > k, `${label}: the greying's block closes`);
  const end = close + 1;
  k = end; skip();
  assert.ok(!/^else\b/.test(text.slice(k, k + 5)), `${label}: the greying has no else (extend this receipt if it grows one)`);
  return { source: text.slice(start, end), start, end, after: k };
}

const sky = readFileSync(new URL('../engine/sky.ts', import.meta.url), 'utf8');
const dome = deckChunk(sky, 'sky.ts');
// the dome's sky between its lookup and its sun terms: the lookup on the ray (the horizon's for a ray under it), the
// environment bake's early return, the greying, and nothing else
{
  const lookup = 'vec3 skyDir = normalize( vec3( direction.x, max( direction.y, 0.0 ), direction.z ) );\n\tvec3 skyCol = atmoSky( skyDir );';
  assert.equal(sky.split(lookup).length, 2, 'the dome looks its sky up on the ray, held at the horizon');
  const from = sky.indexOf(lookup) + lookup.length;
  const bakeAt = sky.indexOf('if ( uEnvBake > 0.5 ) {', from);
  assert.ok(bakeAt > from && bakeAt < dome.start, 'the environment bake\'s return comes before the greying');
  const bakeEnd = closingBrace(sky, bakeAt);
  assert.ok(bakeEnd > bakeAt && bakeEnd < dome.start, 'the bake\'s block closes before the greying');
  const between = stripComments(sky.slice(from, bakeAt) + sky.slice(bakeEnd + 1, dome.start)).trim();
  assert.equal(between, '', 'nothing changes the sky between the lookup and the greying but the bake\'s early return');
  assert.ok(sky.slice(dome.after).startsWith('float cosSun = dot( direction, uSunDirection );'),
    'the sun\'s terms follow the greying: nothing else changes the sky after it');
}

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
const shell = deckChunk(frag, 'the shell\'s fragment');
{
  // the shell's copy is a function's whole body: the chunk, then the sky it leaves
  const head = frag.slice(0, shell.start).trimEnd();
  assert.ok(head.endsWith('vec3 panoDeckGrey( vec3 skyCol, vec3 direction ) {'), 'the shell\'s copy opens panoDeckGrey');
  assert.ok(/^return skyCol;\s*\}/.test(frag.slice(shell.after)), 'and returns the sky the chunk leaves');
  assert.ok(frag.includes('vec3 hdir = normalize(vec3(rd.x, 0.004, rd.z));') && frag.includes('vec3 domeSky = atmoKnee(panoDeckGrey(atmoSky(hdir), hdir)) * uAtmoIntensity;'),
    'the far earth greys the dome\'s own lookup just over the horizon on its bearing');
  assert.ok(/uniform vec4 uDeckHorizon;\s*uniform float uDeckClosed;/.test(frag), 'the shell declares the dome\'s deck uniforms');
  assert.ok(shader.uniforms.uDeckHorizon === handle.mesh.userData.panoAir.uDeckHorizon && shader.uniforms.uDeckClosed === handle.mesh.userData.panoAir.uDeckClosed,
    'and binds them from its air');
}
const domeChunk = parseGlsl(dome.source), shellChunk = parseGlsl(shell.source);

// --------------------------------------------------------------------------------- the dome's uniforms
// sky.ts's own setup, read out of its source and run: the tint, the deck's weight by the light model's overcast (its
// grounded mode only) and the knob, the closed deck over the last tenth
const setupFrom = sky.indexOf('const tint = atmosphereState.fogTint, deckOvercast');
const closedAt = sky.indexOf('u.uDeckClosed.value =', setupFrom);
assert.ok(setupFrom > 0 && closedAt > setupFrom && closedAt - setupFrom < 1200, 'sky.ts sets the deck\'s uniforms in one short run');
const setupSource = stripTypeScriptTypes(sky.slice(setupFrom, sky.indexOf(';', closedAt) + 1));
const domeSetup = new Function('atmosphereState', 'model', 'lightTune', 'u', setupSource);
assert.ok(/const atmosphereDome = new THREE\.Mesh\(new THREE\.BoxGeometry\(1, 1, 1\), atmosphereMaterial\);\s*atmosphereDome\.name = 'atmosphere-dome';/.test(sky)
  && /uDeckHorizon: \{ value: new THREE\.Vector4\(/.test(sky) && sky.includes('const u = atmosphereMaterial.uniforms;'),
  'the dome is the \'atmosphere-dome\' mesh, and its material holds the deck\'s uniforms the shell reads');

const air = handle.mesh.userData.panoAir;
air.uPanoHaze.value.w = 1; // (the bake's hand-over: the law is on)
const camera = { position: new THREE.Vector3(0, 300, 0) };
const atmosphere = (tint) => ({ active: true, skyView: new THREE.Texture(), viewHeightKm: 0.05, sunDir: new THREE.Vector3(0.3, 0.5, 0.2).normalize(),
  knee: new THREE.Vector3(0.5, 2, 1), skyIntensity: 1, fogTint: new THREE.Color(...tint), fogMix: 0.5, fogDensity: 0.0003 });

// a live sky without a dome greys nothing
{
  const bare = new THREE.Scene();
  bare.userData.atmosphere = atmosphere([0.8, 0.85, 0.9]);
  bare.userData.lightModel = { mode: 'physical', overcast: 1 };
  handle.mesh.onBeforeRender(null, bare, camera);
  assert.equal(air.uPanoSkyOn.value, 1, 'the far earth reads the live sky');
  assert.ok(air.uDeckHorizon.value.w === 0 && air.uDeckClosed.value === 0, 'no dome in the scene: no greying');
}

// a sky that brightens toward the horizon and warms toward one side, as a lookup does (the closed deck's level reads
// the horizon's, so the two must differ)
const atmoSky = ([x, y, z]) => {
  const up = Math.max(y, 0);
  return [0.30 + 0.08 * x + 0.35 * (1 - up) ** 3, 0.42 + 0.05 * z + 0.30 * (1 - up) ** 3, 0.75 - 0.10 * up + 0.12 * (1 - up) ** 3];
};
const directions = [[0, 1, 0]];
for (const az of [0, 75, 160, 250]) {
  for (const y of [0.004, 0.06, 0.3, 0.9]) {
    const a = az * Math.PI / 180, h = Math.sqrt(1 - y * y);
    directions.push([Math.cos(a) * h, y, Math.sin(a) * h]);
  }
}
const OVERCASTS = [0, 0.35, 0.7, 0.85, 0.9, 0.93, 0.97, 1];
const TINTS = [[0.82, 0.86, 0.92], [0.93, 0.88, 0.78], [1, 1, 1]];
const scene = new THREE.Scene();
const domeU = { uDeckHorizon: { value: new THREE.Vector4(1, 1, 1, 0) }, uDeckClosed: { value: 0 } };
const domeMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.ShaderMaterial({ uniforms: domeU }));
domeMesh.name = 'atmosphere-dome';
scene.add(domeMesh);
const takenDome = new Set(), takenShell = new Set();
let runs = 0, greyed = 0, closedRuns = 0, worst = 0;
for (const mode of ['physical', 'legacy']) {
  for (const knob of [1, 0.5]) {
    for (const overcast of OVERCASTS) {
      for (const tint of TINTS) {
        scene.userData.atmosphere = atmosphere(tint);
        scene.userData.lightModel = { mode, overcast };
        domeSetup(scene.userData.atmosphere, { mode, overcast }, (name, fallback) => (name === 'SKY_DECK_HORIZON' ? knob : fallback), domeU);
        handle.mesh.onBeforeRender(null, scene, camera);
        assert.deepEqual(air.uDeckHorizon.value.toArray(), domeU.uDeckHorizon.value.toArray(), `${mode}, knob ${knob}, overcast ${overcast}: the dome's deck tint and weight`);
        assert.equal(air.uDeckClosed.value, domeU.uDeckClosed.value, `${mode}, knob ${knob}, overcast ${overcast}: the dome's closed deck`);
        if (domeU.uDeckClosed.value > 0) closedRuns++;
        for (const direction of directions) {
          const skyCol = atmoSky(direction);
          const domeOut = runGlsl(domeChunk, { skyCol, direction, uDeckHorizon: domeU.uDeckHorizon.value.toArray(), uDeckClosed: domeU.uDeckClosed.value },
            { atmoSky }, takenDome).skyCol;
          const shellOut = runGlsl(shellChunk, { skyCol, direction, uDeckHorizon: air.uDeckHorizon.value.toArray(), uDeckClosed: air.uDeckClosed.value },
            { atmoSky }, takenShell).skyCol;
          const d = Math.max(...domeOut.map((v, c) => Math.abs(v - shellOut[c])));
          worst = Math.max(worst, d);
          assert.equal(d, 0, `${mode}, knob ${knob}, overcast ${overcast}, tint ${tint}, direction ${direction.map((v) => v.toFixed(3))}: the shell greys as the dome does (${domeOut} vs ${shellOut})`);
          if (domeOut.some((v, c) => v !== skyCol[c])) greyed++;
          else assert.ok(mode === 'legacy' || overcast === 0 || direction[1] >= 0.12, 'the deck greys every horizon under it');
          runs++;
        }
      }
    }
  }
}
// every branch of both chunks ran (a branch never taken would be a copy never compared)
for (const [label, chunk, taken] of [['the dome\'s', domeChunk, takenDome], ['the shell\'s', shellChunk, takenShell]]) {
  for (let b = 0; b < chunk.branches; b++) {
    assert.ok(taken.has(`${b}:true`) && taken.has(`${b}:false`), `${label} greying: branch ${b} ran both ways`);
  }
}
assert.ok(greyed > runs / 4 && closedRuns > 0, `the greying did grey (${greyed} of ${runs}), the closed deck included (${closedRuns} setups)`);
console.log(`horizonPanoramaDeck.selftest: the far earth greys its horizon as the dome does: ${runs} skies, every branch of both chunks, overcasts ${OVERCASTS.join(', ')}, two knobs, both modes (${greyed} greyed, worst |Δ| ${worst}) PASS`);
