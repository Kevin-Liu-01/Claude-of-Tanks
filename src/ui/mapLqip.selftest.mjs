// mapLqip.selftest.mjs — the battle loading screen's frame-0 art (2026-10-13, the perf stream; owner: "loading into
// some maps still shows a black screen at first"). tools/map-lqip.mjs generates, for every battlefield, a blurred 48x27
// WebP placeholder (src/ui/mapLqip.ts, a lazy chunk) and its art's band colours (src/ui/mapArtTones.ts, the gradient
// under the art). This receipt keeps both complete, small, decodable and off the boot graph, and the gradient off
// near-black.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { MAP_HEROES } from './mapThumbs.ts';
import { MAP_LQIP } from './mapLqip.ts';
import { MAP_ART_TONES, MAP_ART_TONE_DEFAULT } from './mapArtTones.ts';

const ids = Object.keys(MAP_HEROES).sort();
assert.deepEqual(Object.keys(MAP_LQIP).sort(), ids, 'every battlefield has a placeholder (node tools/map-lqip.mjs)');
assert.deepEqual(Object.keys(MAP_ART_TONES).sort(), ids, 'every battlefield has its art tones (node tools/map-lqip.mjs)');

// each placeholder: a lossy WebP data URL of a 48x27 frame, at most 1 kB of base64; the chunk stays small
let total = 0;
for (const id of ids) {
  const url = MAP_LQIP[id];
  const m = url.match(/^data:image\/webp;base64,([A-Za-z0-9+/]+=*)$/);
  assert.ok(m, `${id}: a base64 WebP data URL`);
  assert.ok(url.length <= 1024, `${id}: ${url.length} chars of placeholder (at most 1 kB)`);
  total += url.length;
  const bytes = Buffer.from(m[1], 'base64');
  assert.equal(bytes.toString('latin1', 0, 4), 'RIFF');
  assert.equal(bytes.toString('latin1', 8, 12), 'WEBP');
  assert.equal(bytes.toString('latin1', 12, 16), 'VP8 ', `${id}: a simple lossy WebP`);
  // VP8 key frame: start code 9d 01 2a, then 14-bit width and height
  assert.deepEqual([...bytes.subarray(23, 26)], [0x9d, 0x01, 0x2a], `${id}: a VP8 key frame`);
  assert.deepEqual([bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff], [48, 27], `${id}: 48x27`);
}
assert.ok(total <= 24 * 1024, `placeholders total ${total} chars`);

// the gradient: the art's own mid-tones, never the near-black the screen used to open on (old #1e2a1c -> #0b1017)
const luma = (hex) => {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const meanLuma = (tones) => tones.reduce((s, t) => s + luma(t), 0) / tones.length;
for (const id of ids) {
  const tones = MAP_ART_TONES[id];
  assert.equal(tones.length, 3);
  for (const t of tones) assert.match(t, /^#[0-9a-f]{6}$/);
  assert.ok(meanLuma(tones) >= 0.15, `${id}: tones ${tones.join(' ')} are not near-black`);
}
assert.ok(meanLuma(MAP_ART_TONE_DEFAULT) >= 0.3, 'the default gradient is every map\'s mean, a mid-tone');
assert.ok(meanLuma(['#1e2a1c', '#0b1017']) < 0.15, 'the floor rejects the old near-black gradient');

// off the boot graph: the placeholders are only ever imported dynamically, by the loading screen
const src = new URL('..', import.meta.url).pathname;
const files = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|mts|js|mjs)$/.test(name) && !name.endsWith('.selftest.mjs')) files.push(path);
  }
};
walk(src);
const importers = files.filter((file) => /mapLqip(\.ts)?['"]/.test(readFileSync(file, 'utf8')));
assert.deepEqual(importers.map((file) => relative(src, file)), ['ui/battleLoad.ts'], 'only the loading screen names the chunk');
const battleLoad = readFileSync(join(src, 'ui/battleLoad.ts'), 'utf8');
assert.doesNotMatch(battleLoad, /^\s*import\s[^(]*mapLqip/m, 'no static import of the placeholder chunk');
assert.match(battleLoad, /import\('\.\/mapLqip\.ts'\)/, 'the loading screen imports the chunk lazily');
const main = readFileSync(join(src, 'main.ts'), 'utf8');
assert.match(main, /window\.__GAME_READY = true;[\s\S]{0,600}primeMapLqipWhenIdle\(\);/, 'the Garage loads the chunk in idle time once ready');

console.log(`mapLqip.selftest: ${ids.length} battlefields, placeholders ${(total / 1024).toFixed(1)} kB (lazy), tones off near-black`);
