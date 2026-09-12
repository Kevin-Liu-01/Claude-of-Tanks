import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildHorizonRing, sampleHorizonGeometry, selectHorizonFaceBeltRows,
  HORIZON_TREELINE_MAX_BELTS, HORIZON_TREELINE_MAX_LAYERS,
} from './maps/horizon.ts';
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
    : ['skybridge', 'copper_mesa', 'titan_gorge'].includes(label) ? [2, 4, 5, 7, 8, 9] : [2, 5, 7, 9];
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
  for (let column = 0; column < columns - 1; column++) {
    assert.ok(Math.max(Math.abs(position.getX(column)), Math.abs(position.getZ(column))) < 512,
      `${label}: the buried inner row stays inside the true square terrain rim`);
    assert.ok(position.getY(column) < 0, `${label}: the seam anchor stays underground`);
  }
  for (let index = 0; index < position.count; index++) maxRadius = Math.max(maxRadius, radiusAt(position, index));
  // The restored 1049e4e composition keeps every inland range inside 1.6 km:
  // the outermost authored crest sits at 1240-1330 m and the near foothills
  // begin 585-600 m out, so the ring reads as layered hills and ranges rather
  // than a distant curtain. Only a sea aperture apron may extend farther.
  assert.ok(maxRadius < 1600, `${label}: the classic layered ranges stay inside 1.6 km (${maxRadius.toFixed(0)} m)`);
  assert.ok(maxRadius > 1200, `${label}: the outer range is retained (${maxRadius.toFixed(0)} m)`);
}

// Restored 1049e4e composition. Every style shares a buried anchor row and a
// low set-back skirt, then authored ranges rise in successive layers. This
// contract is deliberately about safety plus the accepted art direction:
// low banks, ranges that meander in depth, real passes, and several ranges
// sharing the skyline. It is not a byte oracle; those digests live below.
function classicRangeStats(ring) {
  const n = 287, p = ring.positions;
  const y = (row, column) => p[(row * n + column) * 3 + 1];
  const radius = (row, column) => Math.hypot(p[(row * n + column) * 3], p[(row * n + column) * 3 + 2]);
  const authored = [];
  ring.rows.forEach((row, index) => { if (!row.skirt && !row.interpolated) authored.push(index); });
  const skyline = new Array(authored.length).fill(0);
  let skirtMax = -Infinity, skirtSetback = Infinity, folds = 0;
  for (let column = 0; column < n; column++) {
    skirtMax = Math.max(skirtMax, y(1, column));
    skirtSetback = Math.min(skirtSetback, Math.max(Math.abs(p[(n + column) * 3]), Math.abs(p[(n + column) * 3 + 2])));
    for (let row = 1; row < ring.rows.length; row++) {
      if (radius(row, column) - radius(row - 1, column) <= 1) folds++;
    }
    let best = -Infinity, winner = 0;
    authored.forEach((row, rank) => {
      const rise = (y(row, column) - 24) / radius(row, column);
      if (rise > best) { best = rise; winner = rank; }
    });
    skyline[winner]++;
  }
  const crests = authored.map(row => {
    let low = Infinity, high = -Infinity, minR = Infinity, maxR = -Infinity;
    for (let column = 0; column < n; column++) {
      low = Math.min(low, y(row, column)); high = Math.max(high, y(row, column));
      minR = Math.min(minR, radius(row, column)); maxR = Math.max(maxR, radius(row, column));
    }
    return { row, low, high, meander: maxR - minR, meanRadius: ring.rows[row].r };
  });
  return { authored, skyline, skirtMax, skirtSetback, folds, crests };
}

function assertClassicLayeredRanges(ring, config, label) {
  const style = config.horizon.style ?? 'rolling';
  const amp = config.horizon.amp ?? 1;
  const stats = classicRangeStats(ring);
  assert.equal(stats.folds, 0, `${label}: no angle folds a radial face`);
  assert.equal(stats.authored.length, style === 'alpine' ? 7 : 4,
    `${label}: the restored ${style} table authors ${style === 'alpine' ? 'seven' : 'four'} ranges beyond the two skirt rows`);
  // 1049e4e skirt: base 22-26 m, amplitude 12-14 m, before the map amplitude.
  assert.ok(stats.skirtMax <= 40 * amp + 0.1,
    `${label}: the positive skirt stays a low bank (${stats.skirtMax.toFixed(1)} m for amp ${amp})`);
  assert.ok(stats.skirtSetback > 508,
    `${label}: the above-ground skirt sits outside the 470 m ring beyond every square-map side`);
  const expectedOuter = style === 'rolling' || style === 'escarpment' ? 1330 : 1240;
  assert.equal(stats.crests[stats.crests.length - 1].meanRadius, expectedOuter,
    `${label}: the outermost authored range keeps its classic ${expectedOuter} m radius`);
  assert.equal(stats.crests[0].meanRadius, style === 'alpine' || style === 'mesa' ? 585 : 600,
    `${label}: the first range begins where the 1049e4e foothills began`);
  for (const crest of stats.crests) {
    assert.ok(crest.meander > 100,
      `${label}: range ${crest.row} meanders in depth (${crest.meander.toFixed(0)} m) instead of tracing a circle`);
    assert.ok(crest.low < crest.high * 0.72,
      `${label}: range ${crest.row} tapers into real low passes (${crest.low.toFixed(1)} / ${crest.high.toFixed(1)} m)`);
  }
  const sharing = stats.skyline.filter(count => count >= 8).length;
  assert.ok(sharing >= (style === 'alpine' ? 3 : 2),
    `${label}: at least ${style === 'alpine' ? 'three' : 'two'} separate ranges each hold a sustained skyline sector (${stats.skyline.join(',')})`);
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
    // The restored 1049e4e tables sit at 760/1240 m instead of 1140/1810 m, so
    // the same cap coverage subtends proportionally less plan area.
    assert.ok(capQuads >= 35 && longestRun >= 8 && area > 70000,
      `${label}: range ${top} has broad attached table tops, not single-column apexes (${capQuads} quads, ${Math.round(area)} m2)`);
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
function appendHorizonReceipt(hash, mapId, ring) {
  hash.update(mapId);
  hash.update(new Uint8Array(ring.positions.buffer));
  hash.update(new Uint8Array(ring.heights.buffer));
  hash.update(JSON.stringify(ring.rows));
  hash.update(String(ring.maxHeight));
  return hash;
}

// 56924f7bf deliberately lowered Polders from .50 to .18 after the finite-cap
// fixtures in31e5b130b. Exact before/current decomposition recovers all three
// ORIGINAL other28 digests by changing only that historical input. Keep the
// historical hashes, and independently freeze every current Polders byte.
// Titan's subsequent finite-cap restoration has an explicit false authoring
// override; titanGorgeHorizon.selftest guards its current shape and every byte.
const currentPoldersReceipts = new Map([
  [1337, '6b53931225d4ffda70b8593d98fbb03b920eafdf8ca95b0f2fa6b517815d4a5c'],
  [2049, '5fe5af61f4e7ee72a73474838fa7c10e17d9ab821883a4817c20ff417de99d97'],
  [7719, '806e0773fbb3594a5be0598ae27e04bb0ce52f7226d5e991be3d69d90730e0cb'],
]);
function assertCurrentPolders(ring, config, seed) {
  assert.equal(config.horizon.amp, 0.18, 'Polders retains its authored low-profile amplitude');
  assert.equal(ring.positions.length, 8610);
  assert.equal(ring.heights.length, 2870);
  // Restored 1049e4e rolling rows at amp 0.18 crest between 27 and 33 m
  // across the three seeds; the rejected wall stood well above 40 m.
  assert.ok(Math.max(...ring.heights) > 24 && Math.max(...ring.heights) < 40,
    'Polders stays a low distant ridge rather than returning to a mountain wall');
  assert.equal(appendHorizonReceipt(createHash('sha256'), 'polders', ring).digest('hex'),
    currentPoldersReceipts.get(seed), 'Current Polders position/heights/rows/maxHeight remain exact');
}

// Restored 1049e4e ring tables and silhouette profiles on top of the current
// subdivision, seam, sea-opening and finite-cap code (the owner's accepted
// visual direction, 2026-09-11). Verdant now shares the classic rolling path.
// Historical Polders/Titan/Badlands inputs remain declared for this aggregate.
const unchangedGeometry = new Map([1337, 2049, 7719].map(seed => [seed, createHash('sha256')]));
const unrelatedMutation = createHash('sha256');
const unchangedReceipts = [
  '87bcb8e1122745695b8c2181d0fc3af7d8d07253a7c2f98adca4d031a0b2d41c',
  'c927b3889b97d2cf5634ba390e17af24a4a500cd3b2a0450e24bbc36d0fc91a8',
  'ecb37f3e3e526e8e2e2d982e1e2d691be4d4b7412a40e85e5d5f568959e22ffe',
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
  // Redrock is a directional canyon; redrockCanyonHorizon.selftest owns its
  // shared-floor/seam/wall gates, so only the shared safety terms apply here.
  if (mapId !== 'badlands') assertClassicLayeredRanges(ring, config, label);
  if (mapId === 'skybridge') assertSkybridgeTableCaps(ring, label);
  else if (mapId === 'copper_mesa') { /* independently covered by copperQuarrySurface.selftest */ }
  else {
    const historicalRing = mapId === 'polders' ? sampleHorizonGeometry({ ...config,
      horizon: { ...config.horizon, amp: 0.50 } }, seed)
      : mapId === 'titan_gorge' ? sampleHorizonGeometry({ ...config,
        horizon: { ...config.horizon, finiteTableCaps: false } }, seed)
      : mapId === 'badlands' ? sampleHorizonGeometry({ ...config,
        horizon: { ...config.horizon, redrockCanyon: false } }, seed) : ring;
    appendHorizonReceipt(unchangedGeometry.get(seed), mapId, historicalRing);
    if (seed === 1337) {
      const mutated = mapId === 'desert'
        ? { ...historicalRing, positions: historicalRing.positions.slice() } : historicalRing;
      if (mapId === 'desert') mutated.positions[0] += 1;
      appendHorizonReceipt(unrelatedMutation, mapId, mutated);
    }
    if (mapId === 'polders') {
      assertCurrentPolders(ring, config, seed);
      if (seed === 1337) {
        const raised = { ...ring, positions: ring.positions.slice(), heights: ring.heights.slice() };
        raised.positions[1] += 0.1; raised.heights[0] += 0.1;
        assert.throws(() => assertCurrentPolders(raised, config, seed), { code: 'ERR_ASSERTION' },
          'Current Polders guard detects even sub-metre height creep below its broad shape ceiling');
        assert.throws(() => assertCurrentPolders(ring, { ...config,
          horizon: { ...config.horizon, amp: 0.19 } }, seed), { code: 'ERR_ASSERTION' },
        'Current Polders authored amplitude cannot silently creep upward');
      }
    }
  }
}
assert.deepEqual(Array.from(unchangedGeometry.values(), hash => hash.digest('hex')), unchangedReceipts,
  'restored classic receipts remain exact with only declared historical Polders/Titan/Badlands inputs');
assert.throws(() => assert.equal(unrelatedMutation.digest('hex'), unchangedReceipts[0]),
  { code: 'ERR_ASSERTION' }, 'Historical-input attribution does not hide unrelated map geometry changes');

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
  for (const mapId of ['desert', 'skybridge', 'copper_mesa', 'titan_gorge', 'urban', 'winter', 'fjord', 'alpine']) {
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
    if (mapId === 'skybridge' || mapId === 'copper_mesa' || mapId === 'titan_gorge') {
      const sampled = sampleHorizonGeometry(config, 1337);
      for (let row = 0; row < sampled.rows.length; row++) {
        for (let column = 0; column < 287; column++) {
          for (let axis = 0; axis < 3; axis++) {
            assert.equal(position.array[(row * columns + column) * 3 + axis],
              sampled.positions[(row * 287 + column) * 3 + axis],
              `${mapId} uploads the exact finite-cap geometry inspected by the pure area tests`);
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

  for (const mapId of ['fjord', 'longleaf']) {
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
    const receipt = treeline.userData.horizonTreeline;
    assert.equal(receipt.layers, layers, `${mapId}: the receipt records the authored skyline ranks`);
    // 2026-09-12: face belts are opt-in (config.horizon.faceBelts); without
    // the opt-in a map uploads no belt ribbon at all and keeps only its ranks.
    const faceBeltsAuthored = config.horizon.faceBelts === true;
    assert.ok((faceBeltsAuthored ? receipt.faceBelts >= 1 : receipt.faceBelts === 0)
      && receipt.faceBelts <= receipt.faceBeltRows && receipt.faceBeltRows <= HORIZON_TREELINE_MAX_BELTS,
    `${mapId}: face belts are bounded by the deterministic row selection (${receipt.faceBelts}/${receipt.faceBeltRows})`);
    assert.equal(faceBeltsAuthored ? selectHorizonFaceBeltRows(sampleHorizonGeometry(config, 1337).rows).length : 0,
      receipt.faceBeltRows, `${mapId}: belt rows derive from the same ring rows the mesh uploads`);
    const ribbons = layers + receipt.faceBelts;
    assert.equal(position.count, columns * 2 * ribbons, `${mapId}: treeline vertex budget is exactly one strip per rank and belt`);
    assert.equal(indices.count, (columns - 1) * 6 * ribbons, `${mapId}: treeline index budget is exactly one quad row per rank and belt`);
    assert.ok(position.count <= columns * 2 * (HORIZON_TREELINE_MAX_LAYERS + HORIZON_TREELINE_MAX_BELTS),
      `${mapId}: the merged treeline stays inside its fixed ceiling`);
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
      assert.ok(Math.abs(radiusAt(position, first) - radiusAt(position, second)) < 120,
        `${mapId}: no canopy quad bridges different radial mountain ranges`);
      assert.ok(Math.hypot(position.getX(first) - position.getX(second),
        position.getY(first) - position.getY(second), position.getZ(first) - position.getZ(second)) < 120,
      `${mapId}: connected crowns follow one continuous local ridge or face`);
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
