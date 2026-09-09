import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Vector3 } from 'three';
import { buildGrassTuftGeometry } from './vegetation.ts';

// Counts and positions are unchanged: only the existing normal buffer varies.
for (const [width, height] of [[0.92, 0.74], [1.14, 0.58]]) {
  for (const planeCount of [1, 2]) {
    const widthScale = planeCount === 1 ? 1.5 : 1.12;
    const geometry = buildGrassTuftGeometry(width, height, planeCount, widthScale);
    assert.equal(geometry.getAttribute('position').count, planeCount * 4);
    assert.equal(geometry.index.count, planeCount * 6);
    assert.deepEqual(Object.keys(geometry.attributes).sort(), ['normal', 'position', 'uv']);
    assert.equal(Object.values(geometry.attributes).reduce((bytes, item) => bytes + item.array.byteLength, 0),
      planeCount * 4 * 8 * 4, 'the original position/normal/UV byte budget is unchanged');
    geometry.computeBoundingBox();
    assert.ok(Math.abs(geometry.boundingBox.min.y + 0.03) < 1e-6);
    assert.ok(Math.abs(geometry.boundingBox.max.y - (height - 0.03)) < 1e-6);
    const normals = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    for (let vertex = 0; vertex < normals.count; vertex++) {
      const normal = new Vector3().fromBufferAttribute(normals, vertex);
      assert.ok(Math.abs(normal.length() - 1) < 1e-6, 'authored normals are unit length');
      assert.ok(normal.y >= 0.96, 'every unscaled blade still primarily receives the sky');
      const lean = Math.hypot(normal.x, normal.z);
      assert.ok(uv.getY(vertex) === 1 ? lean > 0.27 : lean < 0.11,
        'tips spread outward while root normals stay close to the terrain');
      // The tallest soft-ground reeds use sy=1.4*1.5, sxz=0.74. Three's
      // inverse-scale normal transform must not turn those into dark walls.
      normal.set(normal.x / 0.74, normal.y / 2.1, normal.z / 0.74).normalize();
      assert.ok(normal.y >= 0.77, 'even the tallest narrow reeds retain a strong sky component');
    }

    for (const elevation of [35, 38, 60]) {
      const sun = new Vector3(Math.cos(elevation * Math.PI / 180), Math.sin(elevation * Math.PI / 180), 0);
      let total = 0, count = 0, min = Infinity, max = 0;
      for (let yawStep = 0; yawStep < 24; yawStep++) {
        const yaw = yawStep * Math.PI / 12;
        for (let vertex = 0; vertex < normals.count; vertex++) {
          const normal = new Vector3().fromBufferAttribute(normals, vertex);
          normal.applyAxisAngle(new Vector3(0, 1, 0), yaw);
          const incidence = Math.max(0, normal.dot(sun));
          min = Math.min(min, incidence); max = Math.max(max, incidence);
          total += incidence; count++;
        }
      }
      assert.ok(max - min > 0.25, 'a lit sward has directional form, not one upward cosine');
      assert.ok(Math.abs(total / count / sun.y - 1) < 0.03,
        'the normal fan redistributes light without globally dimming the biome');
    }
    const repeated = buildGrassTuftGeometry(width, height, planeCount, widthScale);
    for (const name of ['position', 'normal', 'uv']) {
      assert.deepEqual(repeated.getAttribute(name).array, geometry.getAttribute(name).array,
        'grass normal variation is deterministic and does not consume placement RNG');
    }
    geometry.dispose(); repeated.dispose();
  }
}

const source = await readFile(new URL('./vegetation.ts', import.meta.url), 'utf8');
assert.match(source, /new THREE\.MeshLambertMaterial\(/, 'grass keeps the existing non-specular shader');
assert.match(source, /const s = 128;[\s\S]*?const dryChance = variant === 0 \? 0\.08 : 0\.26;/,
  'both grass atlases retain their size and biome-sensitive living/dry mix');
assert.match(source, /if \(veg\.tuftTone\) \[th, ts, tl\] = veg\.tuftTone\(th, ts, tl\);/,
  'authored instance biome palettes are retained');
assert.match(source, /finishAlphaPixels\(c, ctx, 74, 88, 42, false, tone\)/,
  'authored atlas biome palettes and alpha coverage remain intact');
console.log('grassLighting.selftest: fixed buffers, soft form normals, reed scales and biome contracts passed');
