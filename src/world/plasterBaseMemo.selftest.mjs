// Receipt for the plaster base memo (props.ts makePlaster, the time-to-battle lane, 2026-10-08): the three render
// families (plaster, plaster2, plaster3) paint one untoned base from the props build's noise and differ only in tone,
// so a build paints the base once and copies it. Held against the painter run from a fresh noise of the same seed (no
// memo hit): every texel of the albedo, normal and surface the same for every tone, and the copies made without one
// noise sample. The production painter is evaluated from props.ts's own source (the plaster section, as
// plasterSurfaceSharing.selftest reads it).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { normalTextureFromHeight, textureFromRgbaPixels } from './proceduralTexture.ts';

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
function section(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, `production source section: ${start}`);
  return text.slice(a, b);
}
const math = section(source, 'function clamp(', '// ---------------------------------------------------------------------------');
const painter = section(source, 'function surfaceFromHeight(', 'function makeRoofTiles(');
assert.match(painter, /const plasterBases = new WeakMap/, 'the memo lives with the painter');
const tone = section(terrain, 'const _toneCol =', '// ---------------------------------------------------------------------------');
const rng = section(source, 'export function mulberry32', '\nfunction clamp(');
const makePlaster = new Function('THREE', 'toTexture', 'normalFromHeight', 'paintLimewash',
  `${stripTypeScriptTypes(rng + math + tone + painter).replace(/^export /gm, '')}\nreturn { makePlaster, mulberry32 };`)(
  THREE, textureFromRgbaPixels, normalTextureFromHeight, () => { throw new Error('no limewash in this receipt'); });

// canvases that keep what is put into them (textureFromRgbaPixels: putImageData of the painted texels)
const saved = { document: globalThis.document, ImageData: globalThis.ImageData };
globalThis.ImageData = class { constructor(data, width, height) { Object.assign(this, { data, width, height }); } };
globalThis.document = { createElement() {
  const canvas = { width: 0, height: 0, texels: null };
  canvas.getContext = () => ({ putImageData: (image) => { canvas.texels = new Uint8ClampedArray(image.data); } });
  return canvas;
} };
try {
  const counted = (seed) => {
    const noise = new SimplexNoise({ random: makePlaster.mulberry32(seed) });
    const wrapped = Object.create(noise);
    wrapped.calls = 0;
    wrapped.noise = function (x, y) { this.calls++; return noise.noise(x, y); };
    return wrapped;
  };
  const texels = (family) => ['albedo', 'normal', 'surface'].map((k) => family[k].image.texels);
  const tones = [null, (h, s, l) => [h + 0.02, s * 1.1, l * 0.9], (h, s, l) => [h - 0.035, s * 0.72, l * 0.84]];
  const shared = counted(2009);
  let painted = 0;
  tones.forEach((t, i) => {
    const before = shared.calls;
    const family = makePlaster.makePlaster(shared, 4, t);
    if (i === 0) { painted = shared.calls - before; assert.ok(painted > 0, 'the first family paints the base'); }
    else assert.equal(shared.calls - before, 0, `family ${i + 1} copies the base: no noise sample`);
    const fresh = counted(2009);
    const control = makePlaster.makePlaster(fresh, 4, t);
    assert.equal(fresh.calls, painted, 'a fresh noise paints the whole base');
    const a = texels(family), b = texels(control);
    ['albedo', 'normal', 'surface'].forEach((k, j) => assert.deepEqual(a[j], b[j], `family ${i + 1} ${k}: every texel as a fresh paint`));
  });
  // a toned copy never reaches the base: the first family again, after two tones, still paints the untoned base
  const again = makePlaster.makePlaster(shared, 4, null);
  assert.deepEqual(texels(again)[0], texels(makePlaster.makePlaster(counted(2009), 4, null))[0], 'the base is not toned in place');
  console.log(`plasterBaseMemo: three tones from one base, every texel as a fresh paint, ${painted} noise samples saved per family PASS`);
} finally {
  globalThis.document = saved.document; globalThis.ImageData = saved.ImageData;
}
