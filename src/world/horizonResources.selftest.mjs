import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildHorizonRing, sampleHorizonGeometry, selectHorizonFaceBeltRows,
  HORIZON_SEGMENTS, HORIZON_TREELINE_MAX_BELTS, HORIZON_TREELINE_MAX_LAYERS,
} from './maps/horizon.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { SimplexNoise } from '../engine/simplexFast.ts';
import {
  disposeObject3DResources,
  releaseObject3DGpuResources,
} from '../engine/resourceLifetime.ts';

// Vista pass (2026-09-19, owner: "consider this a triple AAA pass"): the ring is 431 columns (432 with the seam) and
// 18 / 36 rows with ridged relief, the first ridge stands 700-720 m out, the skirt seats on the terrain, every style
// compiles one layered world-anchored vista program on the desktop tier and the near faces carry an instanced forest.
// The receipts below are re-established at this commit; the 1049e4e byte identity they guarded is superseded.
// Round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): the mesa style authors a nine-row stack
// (bench, tables, valley, escarpment, saddle, summits, shoulder — 30 uploaded rows, outer row 1380 m); Redrock keeps
// the classic six-row ladder for its analytic canyon (redrockCanyonHorizon.selftest).
const columns = HORIZON_SEGMENTS + 1;
const uploadedRows = (config, mapId) => config.horizon.style === 'alpine' ? 36
  : config.horizon.style === 'mesa' && mapId !== 'badlands' ? 30 : 18;
const VISTA_TILES = 6; // round 29: meadow, sand, canopy, rock, scree, snow

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
  // round 47: the mesa stack's seven authored rows (5, 9, 13, 17, 21, 25, 29) and, on the cap maps, its two cap fronts
  const anchors = style === 'alpine' ? [1, 5, 10, 15, 20, 25, 30, 35]
    : ['skybridge', 'copper_mesa', 'titan_gorge'].includes(label) ? [1, 5, 8, 9, 13, 16, 17, 21, 25, 29]
      : style === 'mesa' ? [1, 5, 9, 13, 17, 21, 25, 29] : [1, 5, 9, 13, 17];
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
        assert.ok(slope <= Math.max(style === 'alpine' ? 3.0 : 1.9, authoredSlope * (style === 'alpine' ? 2 : 1) + 0.3),
          `${label}: subdivision does not introduce near-vertical cliffs between authored ridges`);
        if (row < anchors[span]) {
          const linearHeight = position.getY(first) + rise * (radius - firstRadius) / radialSpan;
          const relief = Math.abs(position.getY(index) - linearHeight);
          const outsideAnchors = Math.max(0,
            position.getY(index) - Math.max(position.getY(first), position.getY(last)),
            Math.min(position.getY(first), position.getY(last)) - position.getY(index));
          assert.ok((style === 'alpine' ? outsideAnchors : relief) <= radialSpan * 0.12 + 0.001,
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
  const n = HORIZON_SEGMENTS, p = ring.positions;
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
  // round 47: the mesa stack authors seven ranges too (bench, tables, valley, escarpment, saddle, summits, shoulder)
  assert.equal(stats.authored.length, style === 'alpine' || style === 'mesa' ? 7 : 4,
    `${label}: the ${style} table authors ${style === 'alpine' || style === 'mesa' ? 'seven' : 'four'} ranges beyond the two skirt rows`);
  // 1049e4e skirt: base 22-26 m, amplitude 12-14 m, before the map amplitude.
  assert.ok(stats.skirtMax <= 40 * amp + 0.1,
    `${label}: the positive skirt stays a low bank (${stats.skirtMax.toFixed(1)} m for amp ${amp})`);
  assert.ok(stats.skirtSetback > 508,
    `${label}: the above-ground skirt sits outside the 470 m ring beyond every square-map side`);
  // round 47: the mesa stack's outer shoulder stands at 1380 m (was the classic 1240)
  const expectedOuter = style === 'rolling' || style === 'escarpment' ? 1330 : style === 'mesa' ? 1380 : 1240;
  assert.equal(stats.crests[stats.crests.length - 1].meanRadius, expectedOuter,
    `${label}: the outermost authored range keeps its authored ${expectedOuter} m radius`);
  assert.equal(stats.crests[0].meanRadius, style === 'alpine' || style === 'mesa' ? 700 : 720,
    `${label}: the first range begins about 190 m past the rim (vista pass), not at the old 585 / 600 m wall`);
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
  const n = HORIZON_SEGMENTS, p = ring.positions;
  const y = (row, c) => p[(row * n + c) * 3 + 1];
  const radius = (row, c) => Math.hypot(p[(row * n + c) * 3], p[(row * n + c) * 3 + 2]);
  // A wide shoulder measured far below its summit still permits a pyramid.
  // Require real two-dimensional, nearly level quads on BOTH crest ranges.
  for (const [top, minimumDepth] of [[9, 80], [17, 90]]) {
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
      assert.ok(Math.abs(twiceArea) > 1500, `${label}: cap quads have substantial finite width`); // 431 columns: 12.5 m x 80 m quads
      area += Math.abs(twiceArea) * 0.5;
    }
    // The restored 1049e4e tables sit at 760/1240 m instead of 1140/1810 m, so
    // the same cap coverage subtends proportionally less plan area.
    assert.ok(capQuads >= 35 && longestRun >= 8 && area > (top === 9 ? 40000 : 120000),
      `${label}: range ${top} has broad attached table tops, not single-column apexes (${capQuads} quads, ${Math.round(area)} m2)`);
    const values = Array.from({ length: n }, (_, c) => y(top, c));
    assert.ok(values.filter(value => value < Math.max(...values) - 100).length >= 30,
      `${label}: truncation preserves low passes instead of creating a flat enclosing lid`);
    const edgeRadii = Array.from({ length: n }, (_, c) => radius(top - 1, c));
    assert.ok(Math.max(...edgeRadii) - Math.min(...edgeRadii) > 100,
      `${label}: cap fronts keep irregular meandering setbacks, not rectangular blocks`);
  }
  // round 47: the near tables keep the 1.25:1 supported approach; the far escarpment now stands over a real valley
  // floor and its cliff-and-talus front is bounded at 1.8:1 (about 61°)
  for (let c = 0; c < n; c++) {
    for (const [before, after, limit] of [[5, 6, 1.251], [6, 7, 1.251], [7, 8, 1.251], [8, 9, 1.251],
      [13, 14, 1.801], [14, 15, 1.801], [15, 16, 1.801], [16, 17, 1.801]]) {
      assert.ok((y(after, c) - y(before, c)) / (radius(after, c) - radius(before, c)) <= limit,
        `${label}: supporting slopes remain bounded at every angle (rows ${before}-${after} within ${limit})`);
    }
  }
}

function assertAlpineBiomeTexture(texture, label, floor = 24) {
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
  assert.ok(tones.size > floor, `${label}: forest/rock/snow altitude variation is preserved (${tones.size} tones)`);
  assert.ok(largestAdjacentStep < 12, `${label}: biome changes cannot form abrupt atlas ledges`);
}

function assertVistaSurfaceShader(shader, normals, label) {
  const fragment = shader.fragmentShader;
  assert.doesNotMatch(fragment, /terrainUv|fixW|mapSmooth|bedR|HTRIP\(/,
    `${label}: the legacy oblique overlay, wall repair and altitude stripes are gone from the vista program`);
  assert.equal((fragment.match(/#include <map_fragment>/g) ?? []).length, 1,
    `${label}: one biome lookup remains`);
  // round 72 (2026-09-25): the baked surface atlas (horizonRelief.ts) and the volumetric layer's two cloud-shade
  // fields (horizonCloudShade.ts, inside a branch the layer opens) are the fetches outside the projection macro
  assert.equal((fragment.match(/texture2D\(/g) ?? []).length, 6,
    `${label}: the world projection macro's three plane fetches, the relief atlas fetch and the two cloud-shade fetches are the only fetch sites`);
  assert.match(fragment, /if \(uVCShade > 0\.001\) \{/, `${label}: the cloud-shade fetches are skipped while the layer is off (round 72)`);
  assert.match(fragment, /texture2D\(uVRelief, vec2\(vMapUv\.x \* 0\.1, \(radius - uVReliefR\.x\) \* uVReliefR\.y\)\)/,
    `${label}: the relief atlas is read by the ring's own angle u and the fragment's radius (round 72)`);
  // round 72b: the occlusion is read deeper (pow(relief.z, 1.4)), the snow edge is a five-degree slope threshold, the crests scour
  for (const term of ['vec3 nR = normalize', 'float ao = 1.0 - (1.0 - pow(relief.z, 1.4))', 'float sunVis = 1.0 - (1.0 - relief.w)', 'vec3 skyLight = mix(vec3(1.0), uVSkyTint', 'float glint =',
    'float snowSlopeEdge = smoothstep(0.17, 0.23, slope + nE * 0.02);', 'float scour = smoothstep(0.78, 0.96, hT + nC * 0.06)', 'float shadeSide = max(turned, 1.0 - sunVis);']) {
    assert.ok(fragment.includes(term), `${label}: round 72 surface carries ${term}`);
  }
  assert.equal((fragment.match(/VTRI\(/g) ?? []).length, 13,
    `${label}: four noise scales and five material tiles share the one macro (twenty-seven fetches per fragment), plus the round-29 near fields and near ground fetch inside the 380 m branch`);
  assert.match(fragment, /float wall = smoothstep\(0\.30, 0\.62, slope \+ nD \* 0\.06\);/, `${label}: staining, varnish and gullies are gated to genuinely steep faces (round 29)`);
  // round 35 (owner 2026-09-21, "the sides of mountains … look so so bare"): beds and their relief also run across moderate
  // ROCK slopes at half weight; a gentle sand or grass slope (rockW 0) still carries no stripe
  assert.match(fragment, /float bedW = uVBanding \* max\(wall, 0\.5 \* ledgeSlope \* rockW\);/, `${label}: bed stripes reach ledge slopes on rock only`);
  for (const term of ['float talusW', 'float lamina', 'float varnish', 'float cavity', 'float hLedge', 'float macroFade']) {
    assert.ok(fragment.includes(term), `${label}: round 35 wall structure carries ${term}`);
  }
  assert.match(fragment, /if \(nearW > 0\.002\) \{/, `${label}: the near fields are skipped past 380 m`);
  for (const uniform of ['uVMeadow', 'uVCanopy', 'uVRock', 'uVScree', 'uVSnow', 'uVMeadowTint', 'uVRockTint', 'uVScreeTint',
    'uVRockSlope', 'uVBanding', 'uVHaze', 'uVFogTint', 'uVAmbient', 'uVSunGain',
    'uVRelief', 'uVReliefR', 'uVReliefGrad', 'uVReliefAmp', 'uVAoStrength', 'uVShadow', 'uVSkyTint', 'uVSparkle']) { // round 72
    assert.match(fragment, new RegExp(`uniform [a-zA-Z0-9]+ ${uniform};`), `${label}: ${uniform} is declared`);
  }
  assert.match(fragment, /dFdx\(hb\)/, `${label}: relief shading takes a screen-derivative bump from the fine fields`);
  assert.match(fragment, /uVFogTint \* horizonDim, vistaHaze\)/, `${label}: aerial perspective is applied per fragment toward the fog tint, carrying the night dim (round 32)`);
  assert.match(fragment, /float horizonDim = 1\.0;/, `${label}: the live-dim ratio is shared with the haze pass`);
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
// Round 72 (2026-09-25, the mountain relief round): the coarse relief field (horizonRelief.ts) displaces every authored
// and interpolated ring row on every map but Redrock, so the digests below were re-pinned once against the relieved geometry.
const currentPoldersReceipts = new Map([
  [1337, 'bfaf5a27c68473aa3e7facfe4cc5af9801dbbdefee52f519782419775d1d0bd0' /* 2026-09-19 vista pass */],
  [2049, '4b5f08a5d3d46925dd3b1fd0c2b69209e2939b3e4da40f50ab4801316e8def63'],
  [7719, 'd33f34ab64e3554562c63fc5862f35f9307923140249e6bfb7d66c721d9c9bbd'],
]);
function assertCurrentPolders(ring, config, seed) {
  assert.equal(config.horizon.amp, 0.18, 'Polders retains its authored low-profile amplitude');
  assert.equal(ring.positions.length, HORIZON_SEGMENTS * 18 * 3);
  assert.equal(ring.heights.length, HORIZON_SEGMENTS * 18);
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
// 2026-09-19 vista pass: 431 columns, the denser row ladder (18 / 36 rows), the seated skirt and the ridged
// relief re-based every ring, so the three aggregates were repinned once against the vista geometry.
// (round 72: re-pinned with the relieved geometry, see above)
const unchangedReceipts = [
  'aa0da016c567b0bc1e6cf2b63a783726f5d7496f0fb1dbe74cb2e474d6b0723f',
  'de6f733184d9cac6199632b83ba09686ba38cd617d46c678a2e28f336b15fec9',
  'a635a6e778b4b42563518de498c3cb91fd1f0f8fbb23605d6156fb65503b8dae',
];
for (const mapId of MAP_IDS) for (const seed of [1337, 2049, 7719]) {
  const config = getMapConfig(mapId), ring = sampleHorizonGeometry(config, seed);
  const p = ring.positions, n = HORIZON_SEGMENTS, label = `${mapId}/${seed}`;
  assert.equal(ring.rows.length, uploadedRows(config, mapId));
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
  else if (mapId === 'mars') { /* Mars mode (2026-09-18): the galaxy basin postdates the restoration aggregate; the shared gates above apply */ }
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
// Round 72 (2026-09-25): the coarse relief field (horizonRelief.ts: two warp samples and three ridged octaves) is
// read once per authored non-skirt vertex and once per interpolated vertex, where it replaces the 260 m ridged term
// — 66,374 -> 139,527 on the alpine ladder, plus the field's 48 x 48 centring grid and the fine band's 64 x 64
// normalisation grid at construction (20,480 more); the ring is still built in about 20 ms.
// round 72b: the coarse field is a sum of ranges (per range four samples: the ridge, the sub-peak ridge and its
// along-axis jitter, over the isotropic base's five) read at every authored and interpolated vertex; fjord's four
// ranges: 160,007 -> 216,431
assert.equal(geometryNoiseCalls, 216431, 'the ranged relief field spends exactly its authored, interpolated and normalisation queries (round 72b)');
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
// round 47: 431 * (2 skirt * 2 + 7 authored * (1 radial + 6 profile)) + 21 interpolated rows * 431 * 4 = 59047 (was 34480)
// round 72: + 431 * (7 authored + 21 interpolated) * 5 relief-field queries + the 20,480 normalisation queries = 142,336
assert.equal(geometryNoiseCalls, 142336,
  'the mesa stack spends exactly its nine authored rows and 21 subdivision rows of noise queries (round 72: with the relief field)');

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
      // treeline 0 keeps the ring forest out; outlandRocks 0 keeps the round-32 rockfield out — this loop audits the
      // bare backdrop's own resources (horizonRockfield.selftest covers the boulders)
      horizon: { ...config.horizon, treeline: 0, outlandRocks: 0 },
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
    const rows = uploadedRows(config, mapId);
    assert.equal(mesh.geometry.attributes.position.count, columns * rows,
      `${mapId}: the vista ladder uploads ${rows} rows of ${columns} columns`);
    assert.equal(mesh.geometry.index.count, (rows - 1) * HORIZON_SEGMENTS * 6,
      `${mapId}: one continuous annular topology`);
    const { position, color, normal, uv } = mesh.geometry.attributes;
    if (mapId === 'skybridge' || mapId === 'copper_mesa' || mapId === 'titan_gorge') {
      const sampled = sampleHorizonGeometry(config, 1337);
      for (let row = 0; row < sampled.rows.length; row++) {
        for (let column = 0; column < HORIZON_SEGMENTS; column++) {
          for (let axis = 0; axis < 3; axis++) {
            assert.equal(position.array[(row * columns + column) * 3 + axis],
              sampled.positions[(row * HORIZON_SEGMENTS + column) * 3 + axis],
              `${mapId} uploads the exact finite-cap geometry inspected by the pure area tests`);
          }
        }
      }
    }
    // every style bakes a tone-only base atlas and compiles the vista program (desktop tier in Node). This loop
    // bakes without a treeline, so only the snow maps carry biome altitude variation; a bare ring has only rock
    // tone to vary, and the sixteen-sample angular average leaves 19-24 distinct rows there (measured 2026-09-19;
    // the forest maps below keep the two-dozen floor).
    const biomeFloor = (config.horizon.snowline ?? 2) <= 1 ? 24 : 8;
    assertAlpineBiomeTexture(mesh.material.map, mapId, biomeFloor);
    assertVistaSurfaceShader(shader, normal, mapId);
    assert.deepEqual(Object.keys(mesh.geometry.attributes).sort(), ['color', 'normal', 'position', 'uv'],
      `${style}: marine coverage adds no vertex attribute or GPU buffer`);
    const geometryBytes = Object.values(mesh.geometry.attributes)
      .reduce((bytes, attribute) => bytes + attribute.array.byteLength, mesh.geometry.index.array.byteLength);
    assert.equal(geometryBytes, columns * rows * 11 * 4 + (rows - 1) * HORIZON_SEGMENTS * 6 * 2,
      `${mapId}: eleven floats per vertex plus a 16-bit index — no extra vertex attribute or buffer`);
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
    // round 72: the baked relief atlas (horizonRelief.ts) is the ring's ninth retained texture
    assert.equal(suspended.textures, 3 + VISTA_TILES,
      `${style}: suspension finds the map, the hidden detail texture, the six vista tiles (round 29 adds the sand tile) and the relief atlas (round 72)`);
    assert.equal(suspended.materials, 0,
      `${style}: GPU suspension preserves compiled materials for a covered return`);
    assert.equal(releases, 1, `${style}: the shader-only detail texture releases its GPU backing`);
    assert.equal(mesh.material.map.isTexture, true,
      `${style}: renewable suspension preserves the same texture object`);
    assert.equal(shader.uniforms.uDetail2.value, detail,
      `${style}: suspension does not replace the shader's texture reference`);

    const disposed = disposeObject3DResources(mesh);
    assert.equal(disposed.textures, 3 + VISTA_TILES, `${style}: eviction owns the baked textures, the vista tiles and the relief atlas (round 72)`);
    assert.equal(disposed.materials, 2, `${style}: eviction owns the ring's material and the far range's (round 72)`);
    assert.equal(releases, 2, `${style}: final eviction reaches the shader-only texture`);
    // round 72: the far range (horizonFarRange.ts) is the one child of a bare backdrop — one unlit draw
    assert.equal(mesh.children.length, 1, `${style}: a bare backdrop carries only its far range`);
    assert.equal(mesh.children[0].name, 'horizon-far-range', `${style}: the child is the far range`);
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
  // Round 40 (2026-09-22, AAA program check 13 "water at the edge: same level and shader beyond"): the apron is this
  // map's own deep water at the seam (the shallow-water sheet continues over it with the same colour) and only takes
  // on the low sky with distance; the former constant reflection made it the fog's grey one metre past the edge.
  let nearest = null, farthest = null;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (x > 0 && Math.abs(z / x) < 0.1) {
      assert.ok(Math.abs(y + 4.04) < 0.00001,
        'eastward sea aperture replaces the enclosing wall with an opaque sea-level apron');
      assert.equal(coastalUv.getY(i), -1,
        'the planar sea explicitly bypasses the one-dimensional forest texture row');
      const sample = { radius: Math.hypot(x, z), channels: [coastalColors.getX(i), coastalColors.getY(i), coastalColors.getZ(i)] };
      if (!nearest || sample.radius < nearest.radius) nearest = sample;
      if (!farthest || sample.radius > farthest.radius) farthest = sample;
      seaSamples++;
    }
    if (x < -800 && y > 20) landSamples++;
  }
  const ratio = (sample) => Math.max(...sample.channels) / Math.min(...sample.channels);
  // this synthetic map id has no water profile of its own, so the seam takes the default (teal) profile colour
  assert.ok(nearest.channels[2] > nearest.channels[0] * 1.3 && nearest.channels[1] > nearest.channels[0] * 1.3,
    `at the seam the apron is water-coloured (blue and green over red): ${nearest.channels.map((c) => c.toFixed(3))}`);
  assert.ok(ratio(farthest) < 1.35,
    `at the horizon the low-sky reflection remains restrained rather than saturated cyan: ${farthest.channels.map((c) => c.toFixed(3))}`);
  assert.ok(ratio(farthest) < ratio(nearest), 'the apron takes on the sky with distance, never the reverse');
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
  assert.match(coastalShader.fragmentShader, /horizonWaterVariation = nC \* 0\.008 \+ nB \* 0\.015/,
    'sea wave variation reuses the vista noise fields at sub-percent contrast');
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
    const forest = mesh.getObjectByName('horizon-forest');
    assert.ok(forest, `${mapId}: the vista pass stands real trees on the near faces`);
    assert.ok(forest.userData.horizonForest.instances > 400 && forest.userData.horizonForest.instances <= 8000,
      `${mapId}: the ring forest is bounded (${forest.userData.horizonForest.instances} instances)`);
    // two species x (two rich near variants + the band class + the range class): the near meshes cast shadows
    assert.ok(forest.children.length >= 2 && forest.children.length <= 8, `${mapId}: one instanced mesh per species and detail class (${forest.children.length})`);
    assert.ok(forest.userData.horizonForest.band > forest.userData.horizonForest.range,
      `${mapId}: the rim band carries most of the ring forest (${forest.userData.horizonForest.band} band / ${forest.userData.horizonForest.range} range)`);
    assert.ok(forest.userData.horizonForest.near > 100, `${mapId}: the rim band carries the rich near species (${forest.userData.horizonForest.near})`);
    assert.ok(forest.children.some((child) => child.castShadow) && forest.children.every((child) => !child.receiveShadow),
      `${mapId}: near band casts, no crown receives`);
    assert.equal(mesh.children.length, 3, `${mapId}: the far range, the treeline ranks and the ring forest are the only children (round 72)`);
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
    assert.equal(disposed.textures, 4 + VISTA_TILES, `${mapId}: the mountain textures, the vista tiles, the relief atlas and the one treeline atlas dispose`);
    assert.equal(disposed.materials, 4, `${mapId}: mountain, far-range, treeline and ring-forest materials dispose together (round 72)`);
  }

  // Round 29 (owner 2026-09-20, Redrock Divide: "see where the texture just stops"): the first exposed row is seated
  // on the playable edge and row 0 is the buried closing anchor (up to 110 m under Redrock's plateau). Its radial
  // gradient used to be the two-sided difference across that anchor, which tilted the seam normals (~36° on flat
  // ground) and made the terrain material paint a band of streaked rock on the first strip past every edge. The seam
  // row now takes a one-sided gradient, so it is never steeper than the strip behind it.
  for (const [mapId, ceiling] of [['badlands', 0.7], ['copper_mesa', 0.9], ['alpine', 0.9], ['verdant', 0.4], ['urban', 0.35]]) {
    const config = getMapConfig(mapId);
    const mesh = buildHorizonRing(null, { ...config, horizon: { ...config.horizon, treeline: 0 } }, 1337);
    const normal = mesh.geometry.attributes.normal;
    const maxRadial = (row) => {
      let worst = 0;
      for (let column = 0; column < HORIZON_SEGMENTS; column++) {
        const i = row * columns + column;
        const theta = (column / HORIZON_SEGMENTS) * Math.PI * 2;
        const radial = -(normal.getX(i) * Math.cos(theta) + normal.getZ(i) * Math.sin(theta)) / normal.getY(i);
        worst = Math.max(worst, Math.abs(radial));
      }
      return worst;
    };
    const seam = maxRadial(1), behind = maxRadial(2);
    assert.ok(seam <= behind * 1.25 + 0.05,
      `${mapId}: the seam row's steepest radial gradient (${seam.toFixed(3)}) stays within the strip behind it (${behind.toFixed(3)})`);
    assert.ok(seam < ceiling, `${mapId}: seam radial gradient ${seam.toFixed(3)} under ${ceiling} (two-sided across the anchor it was ${
      mapId === 'badlands' ? '1.40' : mapId === 'copper_mesa' ? '1.30' : mapId === 'alpine' ? '1.34' : mapId === 'verdant' ? '0.82' : '0.59'})`);
    mesh.geometry.dispose?.();
  }
} finally {
  if (previousDocument === undefined) delete globalThis.document;
  else globalThis.document = previousDocument;
}

console.log('horizonResources.selftest: hidden detail textures follow suspension and eviction');
