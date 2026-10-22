// nanGuards.selftest.mjs — the finite guards on the temporal and lighting paths that could carry a NaN from frame to
// frame (2026-10-19, black-screen-228 RC6). Not the owner's frame (Apple Metal did not persist an injected NaN), but each
// was one max/clamp away from an opaque black sky or a poisoned lit fragment:
//  - the Clouds 2.0 resolve (cloudShaders.ts) and the dome's history read (volumetricClouds.ts): a non-finite texel is
//    clear sky (no light, full transmittance), never alpha 1 over rgb 0;
//  - the temporal AO EMA (post.ts): finite input, history and output, and a reset frame seeds from the current AO alone
//    (mix(NaN, now, 1) is NaN, which no seed used to escape);
//  - the combat flash light (effects.ts): a pulse at a non-finite place never moves the light, its peak and intensity
//    stay finite (Math.max(1, NaN) is NaN).
// Each guard is pinned in its shipped source and its select is evaluated under both NaN semantics GLSL allows.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CLOUD2_RESOLVE_FRAGMENT } from './cloudShaders.ts';
import { parseGlsl, runGlsl, stripComments } from '../world/glslSubset.test-support.mjs';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const [clouds, post, effects] = await Promise.all([read('./volumetricClouds.ts'), read('./post.ts'), read('../fx/effects.ts')]);

// the select every guard uses (all(lessThan(abs(x), vec4(6e4))), component by component: a max over the components would let
// a maxNum GPU drop the NaN): comparisons with NaN are false (also under fast math), so a NaN or Inf takes the default
const finite = (v) => Math.abs(v) < 6.0e4;
const SEMANTICS = {
  propagate: { max: (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.max(a, b)), min: (a, b) => (Number.isNaN(a) || Number.isNaN(b) ? NaN : Math.min(a, b)) },
  maxnum: { max: (a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b)), min: (a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b)) },
};

{
  // the resolve's output (the history the next frame reprojects)
  assert.match(CLOUD2_RESOLVE_FRAGMENT,
    /gl_FragColor = all\( lessThan\( abs\( outv \), vec4\( 6e4 \) \) \) \? vec4\( max\( outv\.rgb, vec3\( 0 \) \), clamp\( outv\.a, 0\., 1\. \) \) : vec4\( 0, 0, 0, 1 \);\s*\}$/,
    'the resolve writes finite values only');
  for (const [name, s] of Object.entries(SEMANTICS)) {
    const resolve = (o) => (o.every(finite) ? [s.max(o[0], 0), s.max(o[1], 0), s.max(o[2], 0), s.min(s.max(o[3], 0), 1)] : [0, 0, 0, 1]);
    assert.deepEqual(resolve([NaN, 0.2, 0.3, 0.4]), [0, 0, 0, 1], `${name}: a NaN texel resolves to clear sky`);
    assert.deepEqual(resolve([0.1, 0.2, 0.3, Infinity]), [0, 0, 0, 1], `${name}: an Inf texel resolves to clear sky`);
    assert.deepEqual(resolve([0.1, -0.2, 0.3, 1.4]), [0.1, 0, 0.3, 1], `${name}: finite texels keep the old max/clamp`);
  }
}

{
  // the dome's history read: a non-finite read is clear sky, never an opaque black dome
  assert.match(clouds, /vec4 c = cloudsCatmullRom\( uv, uHistorySize \);\s*\/\/[^\n]*\n\s*c = all\( lessThan\( abs\( c \), vec4\( 6e4 \) \) \) \? max\( c, vec4\( 0\. \) \) : vec4\( 0\., 0\., 0\., 1\. \);/);
  // (round 2, eng D5) the shipped dome read itself, from its history fetch to the line before the horizon mask, run by
  // the GLSL subset (a read without the guard, as before round 1, keeps the NaN: max(NaN, 0) under propagate semantics)
  const readAt = clouds.indexOf('vec4 c = cloudsCatmullRom( uv, uHistorySize );');
  const readEnd = clouds.indexOf('float above', readAt);
  assert.ok(readAt > 0 && readEnd > readAt, 'the dome read and the horizon mask after it');
  // (the declaration becomes an assignment to a variable the runner hands back)
  const readChunk = parseGlsl(stripComments(clouds.slice(readAt, readEnd)).replace(/^vec4 c =/, 'c ='));
  const taken = new Set();
  for (const history of [[NaN, 0.2, 0.3, 0.4], [Infinity, 0, 0, 1], [NaN, NaN, NaN, NaN]]) {
    const { c } = runGlsl(readChunk, { uv: [0.5, 0.5], uHistorySize: [480, 270], c: [0, 0, 0, 0] }, { cloudsCatmullRom: () => history }, taken);
    assert.deepEqual(c, [0, 0, 0, 1], `the shipped dome read turns a non-finite history ${JSON.stringify(history.map(String))} into clear sky`);
  }
  assert.deepEqual(runGlsl(readChunk, { uv: [0.5, 0.5], uHistorySize: [480, 270], c: [0, 0, 0, 0] }, { cloudsCatmullRom: () => [0.1, -0.2, 0.3, 0.6] }, taken).c,
    [0.1, 0, 0.3, 0.6], 'a finite history keeps the old max');
  assert.equal(taken.size, 2, 'both branches of the guard ran');
  const dome = (c) => (c.every(finite) ? c.map((v) => Math.max(v, 0)) : [0, 0, 0, 1]);
  const alpha = (c) => 1 - Math.min(dome(c)[3], 1); // float alpha = ( 1.0 - min( c.a, 1.0 ) ) * above;
  assert.equal(alpha([NaN, NaN, NaN, NaN]), 0, 'a NaN history draws nothing over the sky');
  assert.equal(alpha([0, 0, 0, 0]), 1, 'a zero (unresolved) history is opaque: the dome waits for a resolved one');
  // (the dome shows only over a resolved history)
  assert.match(clouds, /this\.dome\.visible = this\.historyValid \|\| \(this\.frozen && this\.historyHeld\);/);
  assert.doesNotMatch(clouds, /this\.framesShown\+\+;\s*this\.dome\.visible = true;/);
}

{
  // the temporal AO EMA
  const ema = post.slice(post.indexOf('uniform sampler2D tNow, tPrev, tDepth;'), post.indexOf('depthTest: false', post.indexOf('uniform sampler2D tNow, tPrev, tDepth;')));
  assert.match(ema, /bool fin\(vec4 c\) \{ return all\(lessThan\(abs\(c\), vec4\(6e4\)\)\); \}/, 'component-wise: a NaN fails its own compare');
  assert.match(ema, /vec4 now = texture2D\(tNow, vUv\);\s*if \(!fin\(now\)\) now = vec4\(1\.0\);/, 'a non-finite AO texel is no occlusion');
  assert.match(ema, /vec3 ao = k >= 1\.0 \|\| !fin\(historySample\) \? now\.rgb : mix\(hist, now\.rgb, k\);/, 'a reset frame seeds from now alone');
  assert.match(ema, /gl_FragColor = fin\(vec4\(ao, depth\)\) \? vec4\(ao, depth\) : vec4\(1, 1, 1, depth\);/);
  const mix = (x, y, a) => x * (1 - a) + y * a;
  for (const [name, s] of Object.entries(SEMANTICS)) {
    const resolve = (nowAo, historyAo, k) => {
      const now = finite(nowAo) ? nowAo : 1;
      const hist = s.max(s.min(historyAo, now + 0.1), now - 0.2); // the rectification clamps (NaN under propagate)
      const ao = k >= 1 || !finite(historyAo) ? now : mix(hist, now, k);
      return finite(ao) ? ao : 1;
    };
    assert.equal(resolve(0.6, NaN, 1), 0.6, `${name}: a seed frame over a NaN history is the current AO (mix(NaN, now, 1) was NaN)`);
    assert.equal(resolve(0.6, NaN, 0.1), 0.6, `${name}: a NaN history is never blended`);
    assert.equal(resolve(NaN, 0.5, 0.1), resolve(1, 0.5, 0.1), `${name}: a NaN input is no occlusion`);
    assert.ok(Math.abs(resolve(0.6, 0.5, 0.25) - mix(0.5, 0.6, 0.25)) < 1e-9, `${name}: finite frames blend as before`);
  }
}

{
  // the combat flash light
  const flash = effects.slice(effects.indexOf('  function flashLight('), effects.indexOf('  // --- tracer instanced mesh'));
  assert.match(flash, /if \(!\(Number\.isFinite\(pos\.x\) && Number\.isFinite\(pos\.y\) && Number\.isFinite\(pos\.z\)\)\) return;\s*state\.light\.position\.copy\(pos\);/,
    'a pulse at a non-finite place never moves the light');
  assert.match(flash, /const ground = groundY\(pos\.x, pos\.z\);\s*const h = Number\.isFinite\(ground\) \? Math\.max\(1, pos\.y - ground\) : 1;/,
    'a non-finite ground height never reaches the peak cap');
  assert.match(flash, /state\.peak = Number\.isFinite\(peak\) \? peak : 0;/);
  const apply = effects.slice(effects.indexOf('  function applyLight('), effects.indexOf('  function flashLight('));
  assert.match(apply, /state\.light\.intensity = Number\.isFinite\(v\) \? v : 0;/, 'the light intensity stays finite');
  assert.ok(Number.isNaN(Math.max(1, NaN)), 'the trap the guard closes: Math.max(1, NaN) is NaN');
}

console.log('nanGuards.selftest: the cloud resolve and dome read, the AO EMA (input, history, seed, output) and the flash light carry finite values only');
