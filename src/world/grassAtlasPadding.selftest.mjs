import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { makeGrassCardTexture } from './vegetation.ts';
import { mulberry32 } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';

// Use the real Canvas rasterizer. In particular, a pixel-upload-only mock
// would miss the premultiply/unpremultiply loss this test must reproduce.
const originalDocument = globalThis.document;
const canvases = [];
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  const canvas = createCanvas(1, 1);
  canvases.push(canvas);
  return canvas;
} };

function assertStraightSource(texture) {
  assert.ok(texture.image instanceof ImageData, 'upload the existing straight-alpha pixel buffer');
  assert.equal(texture.image.data.byteLength, 128 * 128 * 4);
  assert.equal(texture.source.data, texture.image, 'one source buffer, no canvas copy retained');
  assert.equal(texture.colorSpace, SRGBColorSpace);
  assert.equal(texture.anisotropy, 8);
  assert.equal(texture.version, 1, 'source is ready for first upload');
}

function legacyRoundTrip(pixels) {
  // Frozen previous finalization: the padded/tinted ImageData was written
  // back to Canvas and that canvas became the texture source.
  const canvas = createCanvas(pixels.width, pixels.height);
  const context = canvas.getContext('2d');
  context.putImageData(pixels, 0, 0);
  return { canvas, pixels: context.getImageData(0, 0, pixels.width, pixels.height) };
}

function inspectPixels(pixels, painted, old) {
  let padded = 0, opaque = 0, covered = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    assert.equal(pixels[i + 3], painted[i + 3], 'blade coverage is unchanged');
    assert.equal(pixels[i + 3], old[i + 3], 'no alpha expansion or extra covered fragments');
    if (pixels[i + 3] / 255 >= .44) covered++;
    if (pixels[i + 3] === 0) {
      padded++;
      assert.ok(pixels[i] + pixels[i + 1] + pixels[i + 2] > 0, 'transparent padding retains pigment');
      assert.deepEqual([...old.subarray(i, i + 3)], [0, 0, 0], 'the previous Canvas upload loses that padding');
    }
    if (pixels[i + 3] === 255) {
      opaque++;
      assert.deepEqual([...pixels.subarray(i, i + 3)], [...old.subarray(i, i + 3)],
        'fully covered pigment is not brightened');
    }
  }
  // Fine blades include antialiased edges: require substantial coverage at
  // the real material cutoff, not a thick-blade-specific count of alpha=255.
  // Fully opaque texels still exercise the exact pigment assertions above.
  assert.ok(padded > 1000 && covered > 1000 && opaque > 0,
    'exercise substantial empty space, visible blades and opaque pigment');
}

function inspectMipEdges(current, old) {
  let keptEdges = 0, brighterEdges = 0;
  for (let y = 0; y < 128; y += 2) for (let x = 0; x < 128; x += 2) {
    const offsets = [0, 4, 128 * 4, 128 * 4 + 4].map(offset => (y * 128 + x) * 4 + offset);
    const alpha = offsets.reduce((sum, i) => sum + current[i + 3], 0) / (4 * 255);
    // First mip, same existing alpha-coverage boost and threshold. This CPU
    // model establishes the dark-edge mechanism, not native GPU/FPS evidence.
    if (alpha * 1.25 < .44 || !offsets.some(i => current[i + 3] === 0)) continue;
    keptEdges++;
    const sum = data => offsets.reduce((total, i) => total + data[i] + data[i + 1] + data[i + 2], 0);
    if (sum(current) > sum(old)) brighterEdges++;
  }
  assert.ok(keptEdges > 10 && brighterEdges === keptEdges,
    'same surviving edge coverage samples colored padding instead of black');
  return keptEdges;
}

try {
  let cases = 0, mipEdges = 0;
  for (const mapId of ['verdant', 'coastal', 'winter', 'desert']) {
    const tone = getMapConfig(mapId).vegetation.grassTexTone ?? null;
    for (const seed of [2042, 2053, 9347]) for (const variant of [0, 1]) {
      const rng = mulberry32(seed);
      const texture = makeGrassCardTexture(rng, variant, tone);
      const tail = rng();
      const painted = canvases.at(-1).getContext('2d').getImageData(0, 0, 128, 128).data;
      assertStraightSource(texture);
      const old = legacyRoundTrip(texture.image);
      inspectPixels(texture.image.data, painted, old.pixels.data);
      mipEdges += inspectMipEdges(texture.image.data, old.pixels.data);
      const legacyTexture = new CanvasTexture(old.canvas);
      for (const field of ['wrapS', 'wrapT', 'minFilter', 'magFilter', 'generateMipmaps', 'flipY', 'premultiplyAlpha', 'format', 'type']) {
        assert.equal(texture[field], legacyTexture[field], `unchanged upload/sampling policy: ${field}`);
      }
      assert.throws(() => assertStraightSource(legacyTexture), 'restoring Canvas upload must fail');
      const repeatRng = mulberry32(seed);
      const repeated = makeGrassCardTexture(repeatRng, variant, tone);
      assert.deepEqual(repeated.image.data, texture.image.data);
      assert.equal(repeatRng(), tail, 'painting and padding are deterministic');
      let disposed = 0;
      texture.addEventListener('dispose', () => disposed++);
      texture.dispose(); repeated.dispose(); legacyTexture.dispose();
      assert.equal(disposed, 1, 'normal Texture ownership/disposal remains available');
      canvases.length = 0;
      cases++;
    }
  }
  const source = readFileSync(new URL('./vegetation.ts', import.meta.url), 'utf8');
  assert.match(source, /const pixels = finishAlphaPixels\(c, ctx, 74, 88, 42, false, tone\);/);
  assert.match(source, /const texture = new THREE\.Texture\(pixels\);/);
  console.log(`grassAtlasPadding: ${cases} native Canvas cases, ${mipEdges} surviving mip edges, exact alpha/opaque pigment and unchanged upload policies PASS`);
} finally {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
}
