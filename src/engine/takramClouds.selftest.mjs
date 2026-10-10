// TRIAL (trial/takram-clouds, 2026-10-09): the `?clouds=takram` switch, pinned without a GPU. sky.ts reaches Takram's
// march only through one lazy import behind the switch, and no other source file names the takram packages or
// postprocessing (the boot graph and the bundle budget stay as they were); the adapter never names a default asset URL
// (the runtime stays self-contained: docs/ATTRIBUTION.md); the preset → layer mapping, the world → ECEF frame on WGS84,
// the quality and scale switches, and the golden-ratio noise volume over the first-party blue-noise tile.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TAKRAM_SETTLE_FRAMES, takramLayersFor, takramNoiseVolume, takramQualityFor, takramResolutionScale, takramWorldToECEF,
} from './takramClouds.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const src = join(here, '..');
const sky = readFileSync(join(here, 'sky.ts'), 'utf8');
assert.equal((sky.match(/import\('\.\/takramClouds\.ts'\)/g) ?? []).length, 1, 'sky.ts loads the trial once, through import()');
assert.doesNotMatch(sky, /^import [^\n]*takram/m, 'sky.ts has no static import of the trial');
assert.match(sky, /get\('clouds'\) === 'takram'/, 'the switch is `?clouds=takram`');

const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.ts$/.test(name)) files.push(p);
  }
};
walk(src);
for (const file of files) {
  if (file.endsWith('takramClouds.ts')) continue;
  const text = readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /from '(?:@takram\/|postprocessing)/, `${file}: only the lazy adapter imports the takram packages`);
}

const adapter = readFileSync(join(here, 'takramClouds.ts'), 'utf8');
assert.doesNotMatch(adapter, /DEFAULT_[A-Z_]*URL|githubusercontent|PrecomputedTexturesLoader|STBNLoader|TextureLoader/,
  'the adapter never loads a default asset (procedural textures, GPU tables, the first-party noise tile)');
assert.match(adapter, /new URL\('\.\/takramBlue128\.bin', import\.meta\.url\)/, 'the noise tile ships beside the lazy chunk');
const tile = readFileSync(join(here, 'takramBlue128.bin'));
assert.equal(tile.length, 128 * 128, 'the blue-noise tile is 128² R8');
const histogram = new Array(256).fill(0);
for (const v of tile) histogram[v]++;
assert.ok(Math.max(...histogram) <= 128 && Math.min(...histogram) >= 32, 'the tile is a rank map: every level about equally often');

// the mapping: a cumulus sky takes Takram's pairing of two low layers, a deck one layer filling its slab, cirrus on demand
const cumulus = takramLayersFor({ baseM: 1200, thicknessM: 820, stratiform: 0.08, coverage: 0.36, cirrus: 0.12, cirrusAltM: 9500 });
assert.equal(cumulus.layers.length, 4);
assert.equal(cumulus.layers[0].altitude, 1200);
assert.ok(cumulus.layers[0].height > 0 && cumulus.layers[0].height < 820);
assert.ok(cumulus.layers[1].altitude > 1200 && cumulus.layers[1].height === 820);
assert.equal(cumulus.layers[2].altitude, 9500);
assert.ok(cumulus.layers[2].densityScale > 0 && !cumulus.layers[2].shadow, 'the cirrus casts no shadow');
assert.equal(cumulus.layers[3].height, 0, 'the fourth channel stays empty');
const deck = takramLayersFor({ baseM: 700, thicknessM: 420, stratiform: 0.55, coverage: 0.86, cirrus: 0, cirrusAltM: 9000 });
assert.equal(deck.layers[0].height, 420);
assert.equal(deck.layers[1].height, 0, 'a deck is one layer');
assert.equal(deck.layers[2].densityScale, 0, 'no cirrus without the preset asking');
assert.ok(deck.coverage > cumulus.coverage && deck.coverage < 1 && cumulus.coverage > 0);
const humilis = takramLayersFor({ baseM: 1700, thicknessM: 380, stratiform: 0.05, coverage: 0.16, cirrus: 0.45, cirrusAltM: 10500 });
assert.ok(humilis.coverage < cumulus.coverage);

// the frame: the origin on WGS84 at the site, an orthonormal right-handed basis, world +Y the ellipsoid's up
const m = takramWorldToECEF();
const e = m.elements;
const origin = [e[12], e[13], e[14]];
const r = Math.hypot(...origin);
assert.ok(r > 6.36e6 && r < 6.38e6, `the origin lies on the ellipsoid (${r.toFixed(0)} m)`);
const col = (i) => [e[i * 4], e[i * 4 + 1], e[i * 4 + 2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const [x, y, z] = [col(0), col(1), col(2)];
for (const [a, b] of [[x, y], [y, z], [x, z]]) assert.ok(Math.abs(dot(a, b)) < 1e-9, 'orthogonal');
for (const a of [x, y, z]) assert.ok(Math.abs(dot(a, a) - 1) < 1e-9, 'unit');
assert.ok(m.determinant() > 0.999, 'right-handed');
assert.ok(Math.abs(x[2]) < 1e-9, 'world +X is east (horizontal in ECEF)');
const radial = origin.map((v) => v / r);
assert.ok(dot(y, radial) > Math.cos((0.25 * Math.PI) / 180), 'world +Y is the ellipsoid up (within the geodetic-geocentric angle)');
assert.ok(z[2] < 0, 'world +Z points south (north has +z in the northern hemisphere)');

// the switches
assert.equal(takramQualityFor('ultra'), 'high');
assert.equal(takramQualityFor('high'), 'high');
assert.equal(takramQualityFor('medium'), 'medium');
assert.equal(takramQualityFor('low'), 'low');
assert.equal(takramResolutionScale(''), 1);
assert.equal(takramResolutionScale('?clouds=takram&takramScale=0.5'), 0.5);
assert.equal(takramResolutionScale('?takramScale=7'), 1);
assert.ok(TAKRAM_SETTLE_FRAMES >= 32, 'a still settles at least two Bayer cycles');

// the noise volume: slice 0 the tile, each slice the tile shifted by the golden ratio (mod 1)
const small = new Uint8Array(128 * 128);
for (let i = 0; i < small.length; i++) small[i] = (i * 37) & 255;
const volume = takramNoiseVolume(small);
assert.equal(volume.length, 128 * 128 * 64);
for (let i = 0; i < 64; i++) assert.equal(volume[i], small[i]);
const g = 0.6180339887498949;
for (const zi of [1, 5, 63]) {
  for (const i of [0, 77, 16383]) {
    const want = Math.min(255, Math.round((((small[i] / 255) + ((zi * g) % 1)) % 1) * 255));
    assert.equal(volume[zi * 128 * 128 + i], want, `slice ${zi} texel ${i}`);
  }
}
assert.throws(() => takramNoiseVolume(new Uint8Array(10)));

console.log('takramClouds.selftest: ok');
