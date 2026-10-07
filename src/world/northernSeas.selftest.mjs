// northernSeas.selftest — the skies lane (2026-10-07; the gauntlet's waves 189 and 243 on Nordhavn, 247 on Saltmere, 248 on
// Tidegate Polders): the northern seas' own water, the still silty water's dull edge, and the shelf width graded over the
// water. Pins: Saltmere's and Nordhavn's palettes (no shelf turquoise, little of the shader's deep blue, opaque shallows,
// a slate body darker than the shallows and never turquoise in hue); the warm seas keep the shared defaults; the Polders
// oxbow's bank rises out of its own silt (no pale-green halo, no foam); the shader reads every one of those through its
// existing uniforms (no shader text change); and the shelf width on a cliff-to-beach coast grades instead of jumping
// along the medial line (the wedge). No GPU or art claim.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waterContactProfile } from './waterContact.ts';
import { SEA_SHELF_SMOOTH_M, shoreDistanceTexture } from './shallowWater.ts';

const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => v / 255);
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); // linear luminance
const hueDeg = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 0 ? (mx - mn) / mx : 0; };

// 1. the northern seas: Saltmere (coastal) and Nordhavn (fjord)
for (const id of ['coastal', 'fjord']) {
  const p = waterContactProfile(id);
  assert.equal(p.kind, 'coast', `${id}: a coast`);
  assert.equal(p.seaTurquoise, 0, `${id}: no shelf turquoise`);
  assert.ok(p.seaDeepBlue !== undefined && p.seaDeepBlue <= 0.2, `${id}: little of the shader's deep blue (${p.seaDeepBlue})`);
  assert.ok(p.seaShallowAlpha !== undefined && p.seaShallowAlpha >= 0.7, `${id}: opaque shallows (${p.seaShallowAlpha})`);
  const body = rgb(p.color), shallow = rgb(p.shallowColor);
  assert.ok(lum(body) < lum(shallow) && lum(body) < 0.06, `${id}: a dark slate body under its shallows (${lum(body).toFixed(3)})`);
  // (chroma, max − min of the display values: a pool's turquoise 0x40e0d0 holds 0.63, these slate greys about 0.1)
  for (const [what, c] of [['body', body], ['shallows', shallow]]) {
    const chroma = Math.max(...c) - Math.min(...c);
    assert.ok(chroma < 0.15, `${id}: the ${what} a slate grey (chroma ${chroma.toFixed(2)}), not a pool's turquoise`);
  }
}
// the warm and inland waters keep their own (Mangrove and Monsoon stay green-brown; Saltwind's Adriatic keeps the shared shelf)
for (const id of ['saltwind', 'mangrove', 'monsoon']) {
  const p = waterContactProfile(id);
  assert.equal(p.seaDeepBlue, undefined, `${id}: the shared deep blue`);
  assert.equal(p.seaShallowAlpha, undefined, `${id}: the shared clarity`);
}

// 2. Tidegate Polders' oxbow: still silty water, its bank out of its own silt (no glowing pale-green line), no foam
{
  const p = waterContactProfile('polders');
  const body = rgb(p.color), shallow = rgb(p.shallowColor), shore = rgb(p.shoreColor);
  assert.equal(p.foam, 0, 'no foam on still water');
  // (linear luminance: the old pale-green bank 0x5f8a6e stood ×4.8 over its teal body; a step of silt stays under ×1.6)
  assert.ok(lum(shallow) / lum(body) < 1.6, `the bank a step lighter than the body, not a halo (×${(lum(shallow) / lum(body)).toFixed(2)})`);
  assert.ok(Math.abs(lum(shore) - lum(body)) < 0.03, 'the bank tint wet mud, the body\'s own level');
  assert.ok(!(shallow[1] > shallow[0] * 1.25 && shallow[1] > shallow[2] * 1.25), 'the shallows not green');
  const h = hueDeg(body);
  assert.ok(h > 40 && h < 140 && sat(body) < 0.3, `a grey-brown-green body (hue ${h.toFixed(0)}, saturation ${sat(body).toFixed(2)})`);
}

// 3. the shader reads them through its existing uniforms
{
  const src = readFileSync(new URL('./shallowWater.ts', import.meta.url), 'utf8');
  for (const needle of [
    'const seaShallowAlpha = profile.seaShallowAlpha ?? SEA_SHELF.shallowAlpha, seaDeepBlue = profile.seaDeepBlue ?? SEA_TINT.deepBlue;',
    'const seaShelf = { value: new THREE.Vector4(shoreDist ? 1 : 0, SEA_SHELF.colourM, SEA_SHELF.alphaM, seaShallowAlpha) };',
    'const seaTint = { value: new THREE.Vector4(seaTurquoise, seaDeepBlue, seaDeepDarken, 0) };',
    "lightTune('SEA_SHALLOW_ALPHA', seaShallowAlpha)",
    "lightTune('SEA_DEEP_BLUE', seaDeepBlue)",
  ]) assert.ok(src.includes(needle), `the water reads its profile: ${needle}`);
}

// 4. the shelf width graded over the water: a straight north-south coast, the bay to the east, a cliff (8 m shelf) on its
// northern half and a beach (60 m) on its southern; the nearest shore cell switches at z = 0
{
  const S = 256, data = new Uint8Array(S * S * 4);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) data[(j * S + i) * 4 + 2] = i > 128 ? 255 : 0;
  const mask = { image: { data, width: S, height: S } };
  const rise = (x, z) => (z < 0 ? 1.25 / 8 : 1.25 / 60);
  const tex = shoreDistanceTexture(mask, 512, 0.5, rise);
  const N = tex.image.width, g = (i, j) => tex.image.data[(j * N + i) * 2 + 1];
  for (const xm of [10, 40]) {
    const i = Math.round((256 + xm) / 512 * N);
    let maxJump = 0;
    for (let j = 1; j < N; j++) maxJump = Math.max(maxJump, Math.abs(g(i, j) - g(i, j - 1)));
    assert.ok(maxJump <= 6, `${xm} m out: the width grades (the widest step ${maxJump} m between 2 m cells; it jumped 52)`);
    assert.equal(g(i, Math.floor(N / 4)), 8, 'the cliff keeps its 8 m away from the junction');
    assert.equal(g(i, Math.floor(3 * N / 4)), 60, 'the beach keeps its 60 m');
  }
  assert.equal(g(10, 10), 0, 'the land carries no width');
  assert.ok(SEA_SHELF_SMOOTH_M >= 20 && SEA_SHELF_SMOOTH_M <= 80, 'graded over tens of metres');
}

console.log('northernSeas.selftest: Saltmere and Nordhavn slate and opaque (no turquoise, deep blue ≤ 0.2), the warm seas unchanged, the Polders oxbow dull with its bank out of its own silt (no halo, no foam), read through the existing uniforms, and the shelf width graded across a cliff-to-beach junction PASS; no GPU/art claim');
