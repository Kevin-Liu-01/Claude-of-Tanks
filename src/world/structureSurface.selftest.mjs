import assert from 'node:assert/strict';
import { SRGBColorSpace, NoColorSpace } from 'three';
import { SimplexNoise } from '../engine/simplexFast.ts';
import { makeStructureDetail, mulberry32 } from './props.ts';
import { DESTRUCTIBLE_BUILDING_TYPES } from './maps/structureKit.ts';

// Capture the generated texture pixels directly. No renderer or browser is
// needed to bound the actual uploaded tangent-space normals.
const previousDocument = globalThis.document;
const previousImageData = globalThis.ImageData;
globalThis.ImageData = class { constructor(data) { this.data = data; } };
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0, pixels: null };
    canvas.getContext = () => ({ putImageData(image) { canvas.pixels = image.data.slice(); } });
    return canvas;
  },
};

try {
  for (const seed of [1337, 2001, 2002]) {
    for (const kind of ['wood', 'steel', 'canvas']) {
      const detail = makeStructureDetail(new SimplexNoise({ random: mulberry32(seed) }), 4, kind);
      const size = kind === 'steel' ? 256 : 128;
      assert.deepEqual(Object.keys(detail).sort(), ['albedo', 'normal', 'surface']);
      for (const texture of Object.values(detail)) {
        // round 75 (2026-09-26): the sheet-steel tile is 256 px (a trapezoid corrugation, seams, rivets, a rust
        // mask in the ORM blue channel); wood and canvas keep their 128 px tiles
        assert.equal(texture.image.width, size);
        assert.equal(texture.image.height, size);
        assert.equal(texture.image.pixels.byteLength, size * size * 4);
      }
      assert.equal(detail.albedo.colorSpace, SRGBColorSpace);
      assert.equal(detail.normal.colorSpace, NoColorSpace);
      assert.equal(detail.surface.colorSpace, NoColorSpace);
      const normals = detail.normal.image.pixels;
      let minZ = 1, sumZ = 0, maxTilt = 0;
      for (let i = 0; i < normals.length; i += 4) {
        const x = normals[i] / 127.5 - 1;
        const y = normals[i + 1] / 127.5 - 1;
        const z = normals[i + 2] / 127.5 - 1;
        assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 0.012, 'encoded normals stay unit length');
        minZ = Math.min(minZ, z);
        sumZ += z;
        maxTilt = Math.max(maxTilt, Math.hypot(x, y));
      }
      assert.ok(minZ > 0.85, `${kind}: grain must not bend the surface into a side-facing cliff`);
      assert.ok(sumZ / (size * size) > 0.97, `${kind}: average diffuse response stays close to its wall plane`);
      assert.ok(maxTilt > 0.08, `${kind}: readable surface detail remains, not a flat replacement`);
      for (const texture of Object.values(detail)) texture.dispose();
    }
  }
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
  if (previousImageData === undefined) delete globalThis.ImageData;
  else globalThis.ImageData = previousImageData;
}
for (const kind of ['fieldhut', 'huntingblind', 'longhouse']) {
  const geometry = DESTRUCTIBLE_BUILDING_TYPES[kind].build(mulberry32(1337));
  const colors = geometry.attributes.color;
  const luminances = [];
  for (let i = 0; i < colors.count; i++) {
    luminances.push(colors.getX(i) * 0.2126 + colors.getY(i) * 0.7152 + colors.getZ(i) * 0.0722);
  }
  luminances.sort((a, b) => a - b);
  assert.ok(luminances[Math.floor(luminances.length / 2)] > 0.075,
    `${kind}: intact weathered timber remains readable before lighting, rather than charred black`);
  geometry.dispose();
}
console.log('structureSurface self-test: restrained relief, correct color spaces and fixed texture budget passed');
