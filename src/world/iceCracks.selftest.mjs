// iceCracks.selftest.mjs — the ice atlas's cracks moved out of terrain.ts into iceCracks.ts (the looks lane's own file,
// 2026-10-15, extract-then-own): the atlas the painter draws through the moved function is the one terrain.ts drew
// before the move, to the byte, on the production seed and two more (genuine native Canvas2D, as iceSurfaceDetail).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const native = await import(pathToFileURL(createRequire(import.meta.url).resolve('@napi-rs/canvas')).href);
const terrain = await import(process.env.ICE_CRACKS_TERRAIN ? pathToFileURL(process.env.ICE_CRACKS_TERRAIN).href : './terrain.ts');
const created = [];
const saved = new Map(['document', 'ImageData'].map((key) => [key, globalThis[key]]));
globalThis.ImageData = native.ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); const c = native.createCanvas(1, 1); created.push(c); return c; } };
const digests = {};
try {
  for (const seed of [3003, 7, 1337]) {
    const before = created.length;
    const layer = terrain.makeIceLayer(seed, 4);
    const painter = created[before];
    const px = painter.getContext('2d').getImageData(0, 0, painter.width, painter.height).data;
    digests[seed] = createHash('sha256').update(px).digest('hex').slice(0, 24);
    layer.albedo.dispose(); layer.normal.dispose();
  }
} finally {
  for (const [key, value] of saved) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; }
}
if (process.env.ICE_CRACKS_PRINT) { console.log(JSON.stringify(digests)); process.exit(0); }
// the painter's pixels before the move (terrain.ts at 76b70d0a6, its crack() inline)
const BEFORE = { 7: '68fb6e6d9915d8dfcffcf2da', 1337: '6db53d9820499b44042cc342', 3003: 'f1a8d0a66f0466f9ae350cac' };
assert.deepEqual(digests, BEFORE, 'the ice atlas drawn through iceCracks.ts is the one terrain.ts drew');
console.log('iceCracks.selftest: the ice atlas through the moved crack painter is byte-identical on seeds 3003, 7, 1337 PASS');
