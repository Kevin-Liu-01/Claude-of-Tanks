import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildHorizonRing, sampleHorizonGeometry } from './maps/horizon.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import {
  disposeObject3DResources,
  releaseObject3DGpuResources,
} from '../engine/resourceLifetime.ts';

const columns = 288;

function radiusAt(position, index) {
  return Math.hypot(position.getX(index), position.getZ(index));
}

function assertMonotoneRadii(position, label) {
  for (let row = 1; row < position.count / columns; row++) {
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column;
      assert.ok(radiusAt(position, index) - radiusAt(position, index - columns) > 1,
        `${label}: radial rows progress outward without folded or near-zero-width faces`);
    }
  }
}

function assertBoundedSubdivisionRelief(position, style, label) {
  // Alpine spends two existing outer-shoulder subdivisions on the near
  // foothill transition. Authored ridges still anchor all inserted relief.
  const anchors = style === 'alpine' ? [1, 4, 9, 14, 19, 24, 29, 32]
    : label === 'skybridge' ? [2, 4, 5, 7, 8, 9] : [2, 5, 7, 9];
  let reliefSamples = 0;
  for (let span = 1; span < anchors.length; span++) {
    for (let column = 0; column < columns - 1; column++) {
      const first = anchors[span - 1] * columns + column;
      const last = anchors[span] * columns + column;
      const firstRadius = radiusAt(position, first);
      const radialSpan = radiusAt(position, last) - firstRadius;
      const rise = position.getY(last) - position.getY(first);
      const authoredSlope = Math.abs(rise) / radialSpan;
      for (let row = anchors[span - 1] + 1; row <= anchors[span]; row++) {
        const index = row * columns + column;
        const previous = index - columns;
        const radius = radiusAt(position, index);
        const gap = radius - radiusAt(position, previous);
        const slope = Math.abs(position.getY(index) - position.getY(previous)) / gap;
        assert.ok(slope <= Math.max(Math.sqrt(3), authoredSlope * (style === 'alpine' ? 2 : 1) + 0.3),
          `${label}: subdivision does not introduce near-vertical cliffs between authored ridges`);
        if (row < anchors[span]) {
          const linearHeight = position.getY(first) + rise * (radius - firstRadius) / radialSpan;
          const relief = Math.abs(position.getY(index) - linearHeight);
          const outsideAnchors = Math.max(0,
            position.getY(index) - Math.max(position.getY(first), position.getY(last)),
            Math.min(position.getY(first), position.getY(last)) - position.getY(index));
          assert.ok((style === 'alpine' ? outsideAnchors : relief) <= radialSpan * 0.06 + 0.001,
            `${label}: rounded slopes stay inside anchor heights plus bounded crag relief`);
          if (relief > 0.01) reliefSamples++;
        }
      }
    }
  }
  assert.ok(reliefSamples > columns,
    `${label}: coherent shoulders retain real relief instead of flattening the mountain faces`);
}

function assertLayeredMountainBounds(position, style, label) {
  let maxRadius = 0;
  let foothillPeak = -Infinity;
  let nearBackslopes = 0;
  let middleBackslopes = 0;
  for (let column = 0; column < columns - 1; column++) {
    assert.ok(Math.max(Math.abs(position.getX(column)), Math.abs(position.getZ(column))) < 512,
      `${label}: the buried inner row stays inside the true square terrain rim`);
    assert.ok(position.getY(column) < 0, `${label}: the seam anchor stays underground`);
    foothillPeak = Math.max(foothillPeak, position.getY((style === 'alpine' ? 4 : 2) * columns + column));
    if (style === 'alpine') {
      if (position.getY(9 * columns + column) > position.getY(14 * columns + column) + 5) nearBackslopes++;
      if (position.getY(19 * columns + column) > position.getY(24 * columns + column) + 5) middleBackslopes++;
    }
  }
  for (let index = 0; index < position.count; index++) maxRadius = Math.max(maxRadius, radiusAt(position, index));
  assert.ok(maxRadius < 2400, `${label}: inland geometry stays comfortably inside the existing far clip`);
  if (style === 'alpine') {
    assert.ok(maxRadius > 2100, `${label}: distant summits recede beyond the near foothills`);
    assert.ok(foothillPeak < 100, `${label}: near foothills cannot return to the towering rim wall`);
    assert.ok(nearBackslopes > columns * 0.6 && middleBackslopes > columns * 0.6,
      `${label}: intervening saddles break the continuous uphill curtain into separate ranges`);
  }
}

function assertFullAngleAlpineLandform(ring, config, label) {
  const n = 287, p = ring.positions;
  const y = (row, column) => p[(row * n + column) * 3 + 1];
  const radius = (row, column) => Math.hypot(p[(row * n + column) * 3], p[(row * n + column) * 3 + 2]);
  const crests = [9, 19, 29], visible = [0, 0, 0];
  for (let column = 0; column < n; column++) {
    const gap = radius(1, column) - radius(0, column);
    assert.ok((y(1, column) - y(0, column)) / gap < 0.5,
      `${label}: the seam skirt is a low bank, not Fjord's old 70 m curtain`);
    assert.ok(y(1, column) <= 12 * config.horizon.amp + 0.001,
      `${label}: positive skirt height stays below the foothills`);
    assert.ok(Math.max(Math.abs(p[(n + column) * 3]), Math.abs(p[(n + column) * 3 + 2])) > 565,
      `${label}: above-ground skirt is set back from every square-map side and corner`);
    let best = -Infinity, winner = 0;
    for (let rank = 0; rank < crests.length; rank++) {
      const rise = (y(crests[rank], column) - 24) / radius(crests[rank], column);
      if (rise > best) { best = rise; winner = rank; }
    }
    visible[winner]++;
    assert.ok((y(29, column) - y(24, column)) / (radius(29, column) - radius(24, column)) < 0.68,
      `${label}: far-crest meander cannot compress a tall rise into the old outer curtain`);
    for (let row = 25; row <= 29; row++) {
      assert.ok((y(row, column) - y(row - 1, column))
        / (radius(row, column) - radius(row - 1, column)) < 1.25,
      `${label}: the actual outer shoulder segments remain slopes, not vertical cliff sheets`);
    }
  }
  for (const row of crests) {
    let low = Infinity, high = -Infinity, minR = Infinity, maxR = -Infinity;
    for (let column = 0; column < n; column++) {
      low = Math.min(low, y(row, column)); high = Math.max(high, y(row, column));
      minR = Math.min(minR, radius(row, column)); maxR = Math.max(maxR, radius(row, column));
    }
    assert.ok(low < high * 0.4, `${label}: each range tapers into real low passes, including its base`);
    assert.ok(maxR - minR > 100, `${label}: crests meander in depth instead of tracing parallel circles`);
  }
  assert.ok(visible.every(count => count >= 8),
    `${label}: each separate range reaches the skyline in a sustained angular sector`);
}

function assertFullAngleMesaLandform(ring, config, label) {
  const n = 287, p = ring.positions, amp = config.horizon.amp;
  const y = (row, column) => p[(row * n + column) * 3 + 1];
  const radius = (row, column) => Math.hypot(p[(row * n + column) * 3], p[(row * n + column) * 3 + 2]);
  let backslopes = 0;
  for (let column = 0; column < n; column++) {
    assert.ok(y(1, column) < 11 * amp + 0.001,
      `${label}: mesa skirt is a low bank, not the former 53–79 m Skybridge wall`);
    assert.ok(Math.max(Math.abs(p[(n + column) * 3]), Math.abs(p[(n + column) * 3 + 2])) > 565,
      `${label}: the positive bank is set back from every playable side and corner`);
    assert.ok(y(2, column) < 47 * amp,
      `${label}: low attached foothills separate the battlefield from the first table`);
    assert.ok(radius(5, column) > 1035,
      `${label}: substantial mesa cliffs begin beyond a kilometre, not at the terrain rim`);
    for (let row = 1; row < ring.rows.length; row++) {
      assert.ok((y(row, column) - y(row - 1, column))
        / (radius(row, column) - radius(row - 1, column)) < 1.4,
      `${label}: uploaded radial slopes cannot become near-vertical pink sheets`);
    }
    if (y(5, column) > y(7, column) + 20 * amp) backslopes++;
  }
  assert.ok(backslopes > n * 0.6,
    `${label}: a real intervening basin separates the two setback table ranges`);
  for (const row of [5, 9]) {
    const values = Array.from({ length: n }, (_, column) => y(row, column));
    const minimum = Math.min(...values), maximum = Math.max(...values);
    assert.ok(maximum - minimum > 70 * amp,
      `${label}: erosion leaves distinct raised tables and low passes, not a flat enclosing lid`);
    assert.ok(values.filter(value => value > minimum + (maximum - minimum) * 0.65).length >= 40,
      `${label}: high ground has substantial angular extent instead of isolated narrow spires`);
    for (let column = 0; column < n; column++) {
      const before = values[(column + n - 1) % n], after = values[(column + 1) % n];
      assert.ok(Math.abs(values[column] - before) < 14 * amp,
        `${label}: adjacent cap samples cannot create a one-column terrace spike`);
      if (values[column] > before && values[column] > after) {
        const shoulder = values[column] - 20 * amp;
        let left = 0, right = 0;
        while (left < n && values[(column - left + n) % n] > shoulder) left++;
        while (right < n && values[(column + right) % n] > shoulder) right++;
        assert.ok(left + right - 1 >= 3,
          `${label}: prominent buttes retain attached shoulders at least three columns wide`);
      }
    }
  }
}

function assertSkybridgeTableCaps(ring, label) {
  const n = 287, p = ring.positions;
  const y = (row, c) => p[(row * n + c) * 3 + 1];
  const radius = (row, c) => Math.hypot(p[(row * n + c) * 3], p[(row * n + c) * 3 + 2]);
  // A wide shoulder measured far below its summit still permits a pyramid.
  // Require real two-dimensional, nearly level quads on BOTH crest ranges.
  for (const [top, minimumDepth] of [[5, 80], [9, 90]]) {
    let area = 0, capQuads = 0, run = 0, longestRun = 0;
    for (let column = 0; column < n * 2; column++) {
      const c = column % n, next = (c + 1) % n;
      const heights = [y(top - 1, c), y(top, c), y(top - 1, next), y(top, next)];
      const depth = Math.min(radius(top, c) - radius(top - 1, c),
        radius(top, next) - radius(top - 1, next));
      const isCap = Math.max(...heights) - Math.min(...heights) < 2
        && depth >= minimumDepth - 0.001;
      if (!isCap) { run = 0; continue; }
      longestRun = Math.max(longestRun, ++run);
      if (column >= n) continue;
      capQuads++;
      // Shoelace area in the actual XZ footprint, not just a count of
      // high vertices or a radial profile's one-dimensional plateau.
      const vertices = [(top - 1) * n + c, top * n + c,
        top * n + next, (top - 1) * n + next];
      let twiceArea = 0;
      for (let edge = 0; edge < 4; edge++) {
        const a = vertices[edge] * 3, b = vertices[(edge + 1) % 4] * 3;
        twiceArea += p[a] * p[b + 2] - p[b] * p[a + 2];
      }
      assert.ok(Math.abs(twiceArea) > 2000, `${label}: cap quads have substantial finite width`);
      area += Math.abs(twiceArea) * 0.5;
    }
    assert.ok(capQuads >= 35 && longestRun >= 8 && area > 150000,
      `${label}: range ${top} has broad attached table tops, not single-column apexes`);
    const values = Array.from({ length: n }, (_, c) => y(top, c));
    assert.ok(values.filter(value => value < Math.max(...values) - 100).length >= 30,
      `${label}: truncation preserves low passes instead of creating a flat enclosing lid`);
    const edgeRadii = Array.from({ length: n }, (_, c) => radius(top - 1, c));
    assert.ok(Math.max(...edgeRadii) - Math.min(...edgeRadii) > 100,
      `${label}: cap fronts keep irregular meandering setbacks, not rectangular blocks`);
  }
  for (let c = 0; c < n; c++) {
    for (const [before, after] of [[2, 3], [3, 4], [4, 5], [7, 8], [8, 9]]) {
      assert.ok((y(after, c) - y(before, c)) / (radius(after, c) - radius(before, c)) <= 1.251,
        `${label}: supporting slopes remain bounded at every angle`);
    }
  }
}

function assertAlpineBiomeTexture(texture, label) {
  const { width, height, pixels } = texture.image;
  assert.equal(pixels.length, width * height * 4, `${label}: inspect the actual baked atlas`);
  const tones = new Set();
  let largestAdjacentStep = 0;
  for (let row = 0; row < height; row++) {
    const first = row * width * 4;
    tones.add(pixels.slice(first, first + 3).join(','));
    for (let column = 0; column < width; column++) {
      const offset = first + column * 4;
      for (let channel = 0; channel < 3; channel++) {
        assert.equal(pixels[offset + channel], pixels[first + channel],
          `${label}: angle/altitude lookup contains biome tone, never radially stretched detail`);
        if (row > 0) largestAdjacentStep = Math.max(largestAdjacentStep,
          Math.abs(pixels[first + channel] - pixels[first - width * 4 + channel]));
      }
      assert.equal(pixels[offset + 3], 255, `${label}: all existing skirt coverage stays opaque`);
    }
  }
  assert.ok(tones.size > 24, `${label}: forest/rock/snow altitude variation is preserved`);
  assert.ok(largestAdjacentStep < 12, `${label}: biome changes cannot form abrupt atlas ledges`);
}

function assertAlpineSurfaceShader(shader, normals, label) {
  const fragment = shader.fragmentShader;
  assert.doesNotMatch(fragment, /terrainUv|fixW|mapSmooth|bedR|sin\(vHPos\.y/,
    `${label}: no oblique duplicate, slope-limited atlas repair, or altitude stripes remain`);
  assert.equal((fragment.match(/#include <map_fragment>/g) ?? []).length, 1,
    `${label}: one biome lookup remains`);
  assert.equal((fragment.match(/texture2D\(/g) ?? []).length, 3,
    `${label}: the world projection macro has exactly three plane fetches`);
  assert.equal((fragment.match(/= HTRIP\(/g) ?? []).length, 3,
    `${label}: three existing scales make nine surface fetches, not additional textures`);
  assert.match(fragment, /diffuseColor\.rgb \*= 1\.0 \+ \(nB \* 0\.22 \+ nC \* 0\.40 \+ nD \* 0\.32\)/,
    `${label}: the same world fields supply surface detail on every slope`);
  assert.match(fragment, /rockCol \*= 1\.0 \+ nC \* 0\.16 \+ nD \* 0\.20/,
    `${label}: rock breakup reuses the surface samples instead of adding fetches`);
  assert.doesNotMatch(fragment, /if\s*\(/,
    `${label}: gentle foothills and flat saddles cannot bypass the surface projection`);
  // At every actual normal, a pair of tangent vectors must remain independent
  // under the weighted XY/XZ/YZ projections. Old angle/height UVs have zero
  // radial derivative at flat shores and crests; this metric cannot collapse.
  for (let index = 0; index < normals.count; index++) {
    const nx = normals.getX(index), ny = normals.getY(index), nz = normals.getZ(index);
    const total = Math.abs(nx) + Math.abs(ny) + Math.abs(nz);
    const wx = Math.abs(nx) / total, wy = Math.abs(ny) / total, wz = Math.abs(nz) / total;
    const length = Math.hypot(ny, nx);
    const tangent = [ny / length, -nx / length, 0];
    const bitangent = [-nz * tangent[1], nz * tangent[0], nx * tangent[1] - ny * tangent[0]];
    const metric = (a, b) => wx * (a[1] * b[1] + a[2] * b[2])
      + wy * (a[0] * b[0] + a[2] * b[2]) + wz * (a[0] * b[0] + a[1] * b[1]);
    const cross = metric(tangent, bitangent);
    assert.ok(metric(tangent, tangent) * metric(bitangent, bitangent) - cross * cross > 0.2,
      `${label}: world-space surface detail stays two-dimensional at every slope and angle`);
  }
}

// Actual full-circle geometry, all maps and three seeds, without repeating
// expensive texture bakes. Numeric bounds complement, never replace, matched
// establishing/water/foliage renders from several map-edge viewpoints.
// Captured before the Skybridge-only finite-cap correction. Hash the actual
// buffers and row metadata so a fix for one map cannot quietly reshape 29.
const unchangedGeometry = new Map([1337, 2049, 7719].map(seed => [seed, createHash('sha256')]));
const unchangedReceipts = [
  '3a048245aeb0feece0a6d8aad926686a5aec70dc27c1a7ca04967c03a06a9678',
  '10f8fb06c8ef4fcccfcb4c2c3cbb572147e94d8e368d3c1deee249dbadee5a78',
  '57fa5fd45023f8c580661c141a0461e1857d93c716279785d05d8ba92a90af22',
];
for (const mapId of MAP_IDS) for (const seed of [1337, 2049, 7719]) {
  const config = getMapConfig(mapId), ring = sampleHorizonGeometry(config, seed);
  const p = ring.positions, n = 287, label = `${mapId}/${seed}`;
  assert.equal(ring.rows.length, config.horizon.style === 'alpine' ? 33 : 10);
  for (let column = 0; column < n; column++) {
    assert.ok(Math.max(Math.abs(p[column * 3]), Math.abs(p[column * 3 + 2])) < 512,
      `${label}: the buried anchor keeps every rim edge closed`);
    for (let row = 1; row < ring.rows.length; row++) {
      const i = (row * n + column) * 3, before = i - n * 3;
      assert.ok(Number.isFinite(p[i + 1]));
      assert.ok(Math.hypot(p[i], p[i + 2]) - Math.hypot(p[before], p[before + 2]) > 1,
        `${label}: no angle folds a radial face`);
    }
  }
  if (config.horizon.style === 'alpine') assertFullAngleAlpineLandform(ring, config, label);
  if (config.horizon.style === 'mesa') assertFullAngleMesaLandform(ring, config, label);
  if (mapId === 'skybridge') assertSkybridgeTableCaps(ring, label);
  else {
    const hash = unchangedGeometry.get(seed);
    hash.update(mapId);
    hash.update(new Uint8Array(ring.positions.buffer));
    hash.update(new Uint8Array(ring.heights.buffer));
    hash.update(JSON.stringify(ring.rows));
    hash.update(String(ring.maxHeight));
  }
}
assert.deepEqual(Array.from(unchangedGeometry.values(), hash => hash.digest('hex')), unchangedReceipts,
  'the other 29 maps remain byte-identical across all three audited seeds');

const originalNoise = SimplexNoise.prototype.noise;
let geometryNoiseCalls = 0;
try {
  SimplexNoise.prototype.noise = function (...coordinates) {
    geometryNoiseCalls++;
    return originalNoise.apply(this, coordinates);
  };
  sampleHorizonGeometry(getMapConfig('fjord'), 1337);
} finally {
  SimplexNoise.prototype.noise = originalNoise;
}
// The previous mesh spent 287 * (9 radial + 2 skirt + 7*5 profile
// + 24*3 subdivision) queries. Setbacks and rounded slopes reuse that budget.
assert.equal(geometryNoiseCalls, 33866, 'the landform correction adds no geometry noise calls');
try {
  geometryNoiseCalls = 0;
  SimplexNoise.prototype.noise = function (...coordinates) {
    geometryNoiseCalls++;
    return originalNoise.apply(this, coordinates);
  };
  sampleHorizonGeometry(getMapConfig('skybridge'), 1337);
} finally {
  SimplexNoise.prototype.noise = originalNoise;
}
assert.equal(geometryNoiseCalls, 12628,
  'mesa setbacks and attached buttes reuse the same 287 * (6 radial + 2 skirt + 4*6 profile + 4*3 subdivision) queries');

// Rasterization is deliberately outside this headless lifetime test. The
// backdrop's real pixel bake still executes against a minimal canvas surface.
const previousDocument = globalThis.document;
globalThis.document = {
  createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = {
      width: 0,
      height: 0,
      getContext() {
        return {
          createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          getImageData: (_x, _y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
          putImageData(image) { canvas.pixels = image.data; },
          clearRect() {}, save() {}, restore() {}, beginPath() {}, closePath() {},
          rect() {}, clip() {}, moveTo() {}, lineTo() {}, fill() {},
          createLinearGradient: () => ({ addColorStop() {} }),
        };
      },
    };
    return canvas;
  },
};

try {
  // Cover every topology plus the exact map seeds that exposed folded alpine
  // rows in the matched winter/fjord/alpine visual captures.
  for (const mapId of ['verdant', 'desert', 'skybridge', 'titan_gorge', 'urban', 'winter', 'fjord', 'alpine']) {
    const config = getMapConfig(mapId);
    const style = config.horizon.style;
    const mesh = buildHorizonRing(null, {
      ...config,
      horizon: { ...config.horizon, treeline: 0 },
    }, 1337);
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\n#include <begin_vertex>',
      fragmentShader: '#include <map_fragment>\n#include <color_fragment>',
    };
    mesh.material.onBeforeCompile(shader, null);
    const detail = shader.uniforms.uDetail2.value;
    assert.equal(detail.isTexture, true, `${style}: the shader uses its baked detail texture`);
    assert.equal(detail.image.width, 256, `${style}: detail texture keeps its existing size`);
    assert.equal(mesh.material.map.image.width, 512, `${style}: base texture keeps its existing width`);
    assert.equal(mesh.material.map.image.height, 192, `${style}: base texture keeps its existing height`);
    assert.ok(mesh.geometry.attributes.position.count <= (style === 'alpine' ? 10920 : 3120),
      `${style}: the backdrop preserves the existing vertex budget`);
    assert.ok(mesh.geometry.index.count <= (style === 'alpine' ? 62400 : 15600),
      `${style}: the backdrop preserves the existing index budget`);
    assert.equal(mesh.geometry.attributes.position.count, style === 'alpine' ? 9504 : 2880,
      `${mapId}: topology correction does not add vertices`);
    assert.equal(mesh.geometry.index.count, style === 'alpine' ? 55104 : 15498,
      `${mapId}: topology correction does not add triangles`);
    const { position, color, normal, uv } = mesh.geometry.attributes;
    if (mapId === 'skybridge') {
      const sampled = sampleHorizonGeometry(config, 1337);
      for (let row = 0; row < sampled.rows.length; row++) {
        for (let column = 0; column < 287; column++) {
          for (let axis = 0; axis < 3; axis++) {
            assert.equal(position.array[(row * columns + column) * 3 + axis],
              sampled.positions[(row * 287 + column) * 3 + axis],
              'Skybridge uploads the exact finite-cap geometry inspected by the pure area tests');
          }
        }
      }
    }
    if (style === 'alpine') {
      assertAlpineBiomeTexture(mesh.material.map, mapId);
      assertAlpineSurfaceShader(shader, normal, mapId);
    }
    assert.deepEqual(Object.keys(mesh.geometry.attributes).sort(), ['color', 'normal', 'position', 'uv'],
      `${style}: marine coverage adds no vertex attribute or GPU buffer`);
    const geometryBytes = Object.values(mesh.geometry.attributes)
      .reduce((bytes, attribute) => bytes + attribute.array.byteLength, mesh.geometry.index.array.byteLength);
    assert.equal(geometryBytes, style === 'alpine' ? 528384 : 157716,
      `${mapId}: all uploaded geometry buffers keep their exact fixed byte budget`);
    assertMonotoneRadii(position, mapId);
    assertBoundedSubdivisionRelief(position, style, mapId);
    assertLayeredMountainBounds(position, style, mapId);
    for (let i = 0; i < normal.count; i++) {
      const length = Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i));
      assert.ok(Number.isFinite(length) && Math.abs(length - 1) < 0.00001,
        `${style}: smooth terrain normals remain finite and normalized`);
      assert.ok(normal.getY(i) > 0,
        `${style}: every height-field normal points out of the upper surface`);
    }
    for (let row = 0; row < position.count / columns; row++) {
      const first = row * columns;
      const last = first + columns - 1;
      for (const attribute of [position, color, normal]) {
        for (let component = 0; component < 3; component++) {
          assert.equal(attribute.array[first * 3 + component], attribute.array[last * 3 + component],
            `${style}: the closed seam preserves positions, colors, and smooth normals`);
        }
      }
      assert.equal(uv.getX(first), 0, `${style}: each row starts at texture repeat zero`);
      assert.equal(uv.getX(last), 10, `${style}: seam has its own final-repeat UV`);
    }
    for (let index = 0; index < mesh.geometry.index.count; index += 3) {
      const a = uv.getX(mesh.geometry.index.getX(index));
      const b = uv.getX(mesh.geometry.index.getX(index + 1));
      const c = uv.getX(mesh.geometry.index.getX(index + 2));
      assert.ok(Math.max(a, b, c) - Math.min(a, b, c) < 0.036,
        `${style}: no triangle stretches the entire ten-repeat atlas across the seam`);
    }
    let releases = 0;
    detail.addEventListener('dispose', () => { releases++; });

    const suspended = releaseObject3DGpuResources(mesh, { releaseMaterials: false });
    assert.equal(suspended.textures, 2,
      `${style}: suspension finds both the map and hidden shader texture`);
    assert.equal(suspended.materials, 0,
      `${style}: GPU suspension preserves compiled materials for a covered return`);
    assert.equal(releases, 1, `${style}: the shader-only detail texture releases its GPU backing`);
    assert.equal(mesh.material.map.isTexture, true,
      `${style}: renewable suspension preserves the same texture object`);
    assert.equal(shader.uniforms.uDetail2.value, detail,
      `${style}: suspension does not replace the shader's texture reference`);

    const disposed = disposeObject3DResources(mesh);
    assert.equal(disposed.textures, 2, `${style}: eviction owns both baked textures`);
    assert.equal(disposed.materials, 1, `${style}: eviction owns one material`);
    assert.equal(releases, 2, `${style}: final eviction reaches the shader-only texture`);
    assert.equal(mesh.children.length, 0, `${style}: bare backdrops add no draw calls`);
  }

  const coastal = buildHorizonRing(null, {
    id: 'coastal-aperture-test',
    horizon: {
      style: 'rolling', treeline: 0,
      seaOpening: { azimuthDeg: 90, widthDeg: 118, level: -4 },
    },
  }, 1337);
  const positions = coastal.geometry.attributes.position;
  const coastalUv = coastal.geometry.attributes.uv;
  const coastalColors = coastal.geometry.attributes.color;
  assertMonotoneRadii(positions, 'coastal sea aperture');
  let seaSamples = 0;
  let landSamples = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (x > 0 && Math.abs(z / x) < 0.1) {
      assert.ok(Math.abs(y + 4.04) < 0.00001,
        'eastward sea aperture replaces the enclosing wall with an opaque sea-level apron');
      assert.equal(coastalUv.getY(i), -1,
        'the planar sea explicitly bypasses the one-dimensional forest texture row');
      const channels = [coastalColors.getX(i), coastalColors.getY(i), coastalColors.getZ(i)];
      assert.ok(Math.max(...channels) / Math.min(...channels) < 1.35,
        'low-sky reflection remains restrained rather than saturated cyan');
      seaSamples++;
    }
    if (x < -800 && y > 20) landSamples++;
  }
  assert.ok(seaSamples > 30 && landSamples > 30,
    'opening the bay preserves the inland uplands and existing surface coverage');
  const coastalShader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <map_fragment>\n#include <color_fragment>',
  };
  coastal.material.onBeforeCompile(coastalShader, null);
  assert.match(coastalShader.fragmentShader, /diffuse \* vColor\.rgb \* \(1\.0 \+ horizonWaterVariation\)/,
    'sea shading uses the reflected-sky vertex colors after the land color multiplication');
  assert.match(coastalShader.fragmentShader, /horizonWaterVariation = dA \* 0\.008 \+ dB \* 0\.015/,
    'sea wave variation reuses the existing detail samples at sub-percent contrast');
  disposeObject3DResources(coastal);

  for (const mapId of ['verdant', 'fjord', 'longleaf']) {
    // Unlike the lifetime cases above, build the real nonzero treeline. Its
    // skyline changes authored rows as separate mountain ranges overlap.
    const config = getMapConfig(mapId);
    const mesh = buildHorizonRing(null, config, 1337);
    if (config.horizon.style === 'alpine') {
      assertAlpineBiomeTexture(mesh.material.map, `${mapId} forest`);
      const { width, height, pixels } = mesh.material.map.image;
      const bottom = (height - 1) * width * 4;
      assert.ok(pixels[bottom + 1] > pixels[bottom] * 1.2,
        `${mapId}: the mean palette preserves the forest green below the treeline`);
      assert.ok(pixels[2] > pixels[bottom + 2],
        `${mapId}: high-altitude snow retains its brighter cool tone above the forest`);
    }
    const treeline = mesh.getObjectByName('horizon-treeline');
    assert.ok(treeline, `${mapId}: forested ridge clusters remain present`);
    assert.equal(mesh.children.length, 1, `${mapId}: all treeline ranks retain one draw call`);
    const layers = config.horizon.treelineLayers ?? 1;
    const position = treeline.geometry.attributes.position;
    const indices = treeline.geometry.index;
    assert.equal(position.count, columns * 2 * layers, `${mapId}: treeline vertex budget is unchanged`);
    assert.equal(indices.count, (columns - 1) * 6 * layers, `${mapId}: treeline index budget is unchanged`);
    assert.equal(treeline.material.map.image.width, 768, `${mapId}: treeline atlas width is unchanged`);
    assert.equal(treeline.material.map.image.height, 128, `${mapId}: treeline atlas height is unchanged`);
    let severed = 0, connected = 0, run = 0, longestRun = 0;
    for (let face = 0; face < indices.count; face += 6) {
      const first = indices.getX(face), second = indices.getX(face + 1);
      if (first === second) {
        severed++;
        run = 0;
        continue;
      }
      connected++;
      longestRun = Math.max(longestRun, ++run);
      assert.ok(Math.abs(radiusAt(position, first) - radiusAt(position, second)) < 80,
        `${mapId}: no canopy quad bridges different radial mountain ranges`);
      assert.ok(Math.hypot(position.getX(first) - position.getX(second),
        position.getY(first) - position.getY(second), position.getZ(first) - position.getZ(second)) < 80,
      `${mapId}: connected crowns follow one continuous local ridge`);
    }
    assert.ok(severed > 0, `${mapId}: real skyline row changes split the treeline topology`);
    assert.ok(connected > (columns - 1) * layers * 0.75 && longestRun >= 12,
      `${mapId}: same-ridge crowns remain continuous forest clusters, not isolated trees`);
    const disposed = disposeObject3DResources(mesh);
    assert.equal(disposed.textures, 3, `${mapId}: both mountain textures and the one treeline atlas dispose`);
    assert.equal(disposed.materials, 2, `${mapId}: mountain and treeline materials dispose together`);
  }
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

console.log('horizonResources.selftest: hidden detail textures follow suspension and eviction');
