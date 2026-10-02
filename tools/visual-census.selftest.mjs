// Receipt of the visual census tools (2026-10-01): the census camera set is pinned (names, order, poses, the two
// round-35 skyline views shared with the map view probe), the Node-side site selection of the chase / terrain / tree
// views is deterministic and honours its clearance rules, the frame metrics recover known numbers from synthetic
// frames that go through a real PNG round trip, census.json merges only captures of the same game, the sheets / index /
// compare outputs are produced from a synthetic census, and the CLI fails closed without starting a server or browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { loadRgba } from './map-metrics.mjs';
import { MAP_VIEW_PROBE_VIEWS } from './map-view-probe-views.mjs';
import { selectStandView } from './environment-shot-camera.mjs';
import {
  CENSUS_FOV, CENSUS_HALF, CENSUS_PROTOCOL, CENSUS_VIEWPORT, CENSUS_VIEWS, horizonRow, pitchOf, selectCensusViews,
  selectChasePose, selectSkySite, selectTerrainSite, selectTreePose, skyPose, skySamplePoints, skySiteCandidates,
  terrainPose, terrainSamplePoints, terrainSiteCandidates,
} from './visual-census-views.mjs';
import { CENSUS_HEADLINE_METRICS, detectSkyline, frameMetrics, highPass, histogramQuantile } from './visual-census-metrics.mjs';
import {
  buildSheets, compareCensus, horizonOfState, loadCensus, measureCensus, openCensus, pixelDiff, renderIndex, saveCensus, writeIndex,
} from './visual-census-report.mjs';
import { CENSUS_HELP, parseCensusArgs, pickCaptureMaps } from './visual-census.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const dir = mkdtempSync(path.join(tmpdir(), 'cot-visual-census-selftest-'));
const near = (a, b, tol, label) => assert.ok(Math.abs(a - b) <= tol, `${label}: ${a} vs ${b} (tol ${tol})`);

/** Paint a frame from a per-pixel rgb callback, write it as a real PNG and decode it back. */
async function frame(file, width, height, rgbAt) {
  const canvas = createCanvas(width, height), ctx = canvas.getContext('2d'), image = ctx.createImageData(width, height);
  for (let y = 0, p = 0; y < height; y++) for (let x = 0; x < width; x++, p += 4) {
    const [r, g, b] = rgbAt(x, y);
    image.data[p] = r; image.data[p + 1] = g; image.data[p + 2] = b; image.data[p + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const target = path.join(dir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, canvas.toBuffer('image/png'));
  return { file: target, image: await loadRgba(target) };
}

try {
  // ------------------------------------------------------------------ the camera set (pinned)
  assert.equal(CENSUS_PROTOCOL, 'visual-census-v1');
  assert.deepEqual(CENSUS_VIEWPORT, { width: 1600, height: 900 });
  assert.equal(CENSUS_FOV, 55); assert.equal(CENSUS_HALF, 511);
  assert.deepEqual(CENSUS_VIEWS.map((v) => v.name), ['establishing', 'chase', 'bird', 'sky-w', 'sky-s', 'terrain', 'tree']);
  assert.deepEqual(CENSUS_VIEWS.map((v) => v.kind), ['shot', 'hull', 'table', 'sky', 'sky', 'terrain', 'tree']);
  for (const name of ['sky-w', 'sky-s']) {
    const probe = MAP_VIEW_PROBE_VIEWS.find((v) => v.name === name), census = CENSUS_VIEWS.find((v) => v.name === name);
    const centre = skyPose({ candidate: skySiteCandidates(census)[0], pass: 1, rule: 'clear' }, census);
    assert.deepEqual([centre.cam, centre.at, centre.fov], [[...probe.cam], [...probe.at], 55], `${name} at a clear centre is the map view probe's round-35 pose`);
  }
  assert.equal(createHash('sha256').update(JSON.stringify(CENSUS_VIEWS)).digest('hex'),
    'b3c2321d4db4d1e4b2fa2cbeabc1eb5e6c85927af336cabe45366b4021b92d6a',
    'the census camera set is pinned: a moved or added view is a deliberate, dated re-pin (old censuses stop comparing)');
  assert.ok(Object.isFrozen(CENSUS_VIEWS) && CENSUS_VIEWS.every((v) => Object.isFrozen(v)));
  assert.deepEqual(selectCensusViews().map((v) => v.name), CENSUS_VIEWS.map((v) => v.name));
  assert.deepEqual(selectCensusViews(['tree', 'chase']).map((v) => v.name), ['chase', 'tree'], 'subsets keep table order');
  assert.throws(() => selectCensusViews(['chase', 'nope']), /Unknown census view\(s\): nope/);

  // ------------------------------------------------------------------ chase
  const north = { x: 100, z: 50, yaw: 0 };
  const chase = selectChasePose(north);
  assert.deepEqual(chase.cam, [100, 3.4, 38]); assert.deepEqual(chase.at, [100, 1.2, 90]); assert.equal(chase.fov, 55);
  assert.deepEqual(chase.selection, { back: 12, clear: true, tried: [12] });
  const blocked = selectChasePose(north, { buildings: [{ x: 100, z: 37, w: 4, d: 4 }] });
  assert.equal(blocked.selection.back, 7, 'a footprint behind the hull moves the camera to the first clear back distance');
  assert.deepEqual(blocked.selection.tried, [12, 9, 15, 7]);
  const crowned = selectChasePose(north, { concealers: [{ x: 100, z: 38, r: 1.6 }] });
  assert.equal(crowned.selection.back, 9, 'a crown over the 12 m spot (1.6/0.8 m + 1 m) moves the camera to 9 m');
  const sightline = selectChasePose(north, { concealers: [{ x: 100, z: 45, r: 0.8 }] });
  assert.equal(sightline.selection.back, 15, 'a crown between the 12 m camera and the hull (its midpoint) moves the camera');
  const walled = selectChasePose(north, { buildings: [{ x: 100, z: 40, w: 40, d: 40 }] });
  assert.equal(walled.selection.clear, false); assert.equal(walled.selection.back, 12, 'no clear spot: the first distance, flagged');
  const east = selectChasePose({ x: 0, z: 0, yaw: Math.PI / 2 });
  near(east.cam[0], -12, 1e-9, 'yaw 90° faces +X'); near(east.cam[2], 0, 1e-9, 'yaw 90° z');
  assert.throws(() => selectChasePose(null), /staged player hull/);

  // ------------------------------------------------------------------ terrain
  const candidates = terrainSiteCandidates(north);
  assert.equal(candidates.length, 7 * 16);
  assert.deepEqual(candidates[0].p, [100, 86]); assert.deepEqual(candidates[0].t, [100, 92]); assert.deepEqual(candidates[0].m, [100, 104]);
  assert.deepEqual(candidates.slice(0, 3).map((c) => c.azimuthStep), [0, 1, -1], 'ahead first, then alternating sides');
  assert.equal(terrainSamplePoints(candidates).length, 5 * candidates.length);
  assert.deepEqual(terrainSiteCandidates(north), candidates, 'deterministic from the hull alone');
  const flat = () => 10;
  const open = selectTerrainSite(candidates, { heightAt: flat });
  assert.equal(open.candidate.index, 0); assert.equal(open.pass, 1); assert.equal(open.rule, 'open');
  const pose = terrainPose(open);
  assert.deepEqual(pose.cam, [100, 1.8, 86]); assert.deepEqual(pose.at, [100, 0, 92]); assert.equal(pose.fov, 55);
  const hut = selectTerrainSite(candidates, { heightAt: flat, buildings: [{ x: 100, z: 90, w: 10, d: 10 }] });
  assert.ok(hut.candidate.index > 0 && hut.pass === 1, 'a footprint at the first site moves the camera');
  assert.ok(Math.hypot(hut.candidate.p[0] - 100, hut.candidate.p[1] - 90) - Math.hypot(10, 10) / 2 >= 12);
  const wet = selectTerrainSite(candidates, { heightAt: flat, water: [{ x: 100, z: 92, r: 30 }] });
  assert.ok(wet.candidate.index > 0 && [wet.candidate.p, wet.candidate.t, wet.candidate.m].every(([x, z]) => Math.hypot(x - 100, z - 92) - 30 >= 6));
  const shore = selectTerrainSite(candidates, { heightAt: flat, waterDepthAt: (x, z) => (z > 80 && z < 120 ? 0.4 : 0) });
  assert.ok(shore.candidate.index > 0 && [shore.candidate.p, shore.candidate.t, shore.candidate.m].every(([, z]) => !(z > 80 && z < 120)), 'wet ground is not terrain');
  const road = selectTerrainSite(candidates, { heightAt: flat, roads: [[[100, -500], [100, 500]]] });
  assert.ok(road.candidate.index > 0 && road.pass === 1 && Math.abs(road.candidate.p[0] - 100) >= 8, 'off the road centreline');
  const steep = selectTerrainSite(candidates, { heightAt: (x) => x * 0.5 });
  assert.equal(steep.pass, 3, 'relief everywhere: the relief rule relaxes after the road rule');
  assert.equal(steep.candidate.index, 0);
  assert.throws(() => selectTerrainSite(terrainSiteCandidates({ x: 3000, z: 3000, yaw: 0 }), { heightAt: flat }), /No terrain close-up site/);
  assert.throws(() => selectTerrainSite(candidates, {}), /heightAt/);

  // ------------------------------------------------------------------ sky
  const skyW = CENSUS_VIEWS.find((v) => v.name === 'sky-w'), skyS = CENSUS_VIEWS.find((v) => v.name === 'sky-s');
  const skyCandidates = skySiteCandidates(skyW);
  assert.equal(skyCandidates.length, 1 + 5 * 12); assert.deepEqual(skyCandidates[0].p, [0, 0]);
  assert.deepEqual(skyCandidates[0].corridor, [[-15, 0], [-30, 0], [-45, 0], [-60, 0]]);
  near(skyCandidates[1].p[1], 25, 1e-12, 'the first ring starts north'); near(skyCandidates[4].p[0], 25, 1e-12, 'clockwise: the fourth spot is east');
  assert.equal(skySamplePoints(skyCandidates).length, 5 * skyCandidates.length);
  assert.deepEqual(skySiteCandidates(skyS)[0].corridor[3], [0, -60], 'the south view keeps its corridor south');
  const clearSky = selectSkySite(skyCandidates, { heightAt: flat }, skyW);
  assert.deepEqual([clearSky.candidate.index, clearSky.pass], [0, 1], 'a clear centre keeps the round-35 pose');
  const roofed = selectSkySite(skyCandidates, { heightAt: flat, buildings: [{ x: 2, z: -4, w: 14, d: 10 }] }, skyW);
  assert.ok(roofed.candidate.index > 0 && roofed.pass === 1, 'a roof at the centre moves the camera to the nearest clear spot');
  assert.ok(Math.hypot(roofed.candidate.p[0] - 2, roofed.candidate.p[1] + 4) - Math.hypot(14, 10) / 2 >= 12);
  assert.ok(roofed.candidate.corridor.every(([x, z]) => Math.hypot(x - 2, z + 4) - Math.hypot(14, 10) / 2 >= 4), 'and its corridor clear');
  const roofedPose = skyPose(roofed, skyW);
  assert.deepEqual(roofedPose.at, [roofed.candidate.p[0] - 900, 260, roofed.candidate.p[1]], 'the look keeps the round-35 heading and lift');
  const bowl = selectSkySite(skyCandidates, { heightAt: (x) => -x * 0.5 }, skyW);
  assert.equal(bowl.pass, 2, 'a slope climbing west into every corridor relaxes the rise rule');
  const forest = selectSkySite(skyCandidates, { heightAt: flat, concealers: Array.from({ length: 41 }, (_, i) => ({ x: -200 + i * 10, z: 0, r: 4 }))
    .concat(Array.from({ length: 41 }, (_, i) => ({ x: -200 + i * 10, z: -200 + i * 10, r: 4 }))) }, skyW);
  assert.ok(forest.pass <= 3);
  const city = selectSkySite(skyCandidates, { heightAt: flat, buildings: [{ x: 0, z: 0, w: 600, d: 600 }] }, skyW);
  assert.deepEqual([city.candidate.index, city.pass, city.rule], [0, 4, 'centre'], 'nowhere clear: the round-35 centre, flagged');
  assert.ok(selectSkySite(skyCandidates, { heightAt: flat, waterDepthAt: (x, z) => (Math.hypot(x, z) < 10 ? 2 : 0) }, skyW).candidate.index > 0, 'not over water');
  assert.throws(() => selectSkySite(skyCandidates, {}, skyW), /heightAt/);

  // ------------------------------------------------------------------ tree
  assert.deepEqual(selectTreePose({ clusters: [] }), { skipped: 'no tree clusters' });
  const grove = { clusters: [{ x: 0, z: 0, r: 20 }, { x: 200, z: 0, r: 8 }], concealers: [{ x: 0, z: 0, r: 16 }], buildings: [] };
  const tree = selectTreePose(grove), stand = selectStandView(grove);
  assert.deepEqual(tree.cam, [stand.x, 4.2, stand.z]); assert.deepEqual(tree.at, [0, 3.6, 0]); assert.equal(tree.fov, 50);
  assert.equal(selectTreePose({ clusters: [{ x: 0, z: 0, r: 5 }], concealers: [], buildings: [] }, { camAbove: 4.2, atAbove: 3.6, fov: 50 }).fov, 50);
  assert.match(selectTreePose({ clusters: [{ x: 0, z: 0, r: 5 }], concealers: [{ x: 0, z: 0, r: 4000 }], buildings: [] }).skipped, /unobstructed/);

  // ------------------------------------------------------------------ framing
  near(horizonRow(0, 55, 900), 450, 1e-9, 'level camera: horizon on the centre row');
  near(horizonRow((27.5 * Math.PI) / 180, 55, 900), 900, 1e-9, 'pitched up half the fov: horizon on the bottom edge');
  near(horizonRow((-27.5 * Math.PI) / 180, 55, 900), 0, 1e-9, 'pitched down half the fov: horizon on the top edge');
  near(pitchOf([0, 0, 0], [10, 10, 0]), Math.PI / 4, 1e-12, 'pitchOf');
  near(horizonOfState({ camera: { forward: [0, 0, -1], fov: 55 } }), 450, 1e-9, 'recorded state: level');
  near(horizonOfState({ camera: { forward: [0, Math.sin(0.2), -Math.cos(0.2)], fov: 55 } }), horizonRow(0.2, 55, 900), 1e-9, 'recorded state: pitched');
  assert.equal(horizonOfState({}), null);

  // ------------------------------------------------------------------ metrics
  assert.equal(histogramQuantile(Float64Array.of(0, 2, 2, 0), 4, 0.5, 1), 1.5);
  assert.equal(histogramQuantile(Float64Array.of(0, 0), 0, 0.5, 1), null);
  const SKY = [120, 160, 220], GROUND = [90, 80, 60];
  const luma = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;
  const split = await frame('split.png', 640, 360, (x, y) => (y < 150 ? SKY : GROUND));
  const m = frameMetrics(split.image, { horizon: 180 });
  near(m.skyMean, luma(SKY), 0.01, 'sky mean'); near(m.groundMean, luma(GROUND), 0.01, 'ground mean');
  near(m.skyGroundContrast, (luma(SKY) - luma(GROUND)) / (luma(SKY) + luma(GROUND)), 1e-3, 'sky/ground contrast');
  assert.equal(m.ringHeightPx, 30, 'skyline 30 rows above the flat horizon');
  assert.equal(m.skylineReliefPx, 0); near(m.skylineStep, luma(SKY) - luma(GROUND), 0.01, 'ridge step');
  near(m.skyShare, 147 / 360, 1e-4, 'sky rows above the 3-row gap'); assert.equal(m.skyDetail, 0); assert.equal(m.groundDetail, 0);
  near(m.skylineRatioCheck5, luma(GROUND) / luma(SKY), 1e-3, 'check 5 = map-metrics skylineRatio');
  near(m.satMean, (150 * (100 / 220) + 210 * (30 / 90)) / 360, 1e-3, 'mean HSV saturation');
  near(m.lumaMean, (150 * luma(SKY) + 210 * luma(GROUND)) / 360, 0.01, 'luma mean');
  near(m.lumaP25, luma(GROUND), 0.25, 'p25 sits on the ground'); near(m.lumaP95, luma(SKY), 0.25, 'p95 sits on the sky');
  assert.deepEqual(m.sky.rgb, SKY); assert.deepEqual(m.ground.rgb, GROUND); near(m.sky.hueDeg, 216, 0.5, 'sky hue');
  assert.equal(m.skyZenithRatio, 1); assert.equal(m.groundFarNearRatio, 1); assert.equal(m.clipHigh, 0); assert.equal(m.clipLow, 0);
  for (const [key] of CENSUS_HEADLINE_METRICS) assert.ok(key in m, `headline metric ${key} is computed`);
  const ridge = await frame('ridge.png', 640, 360, (x, y) => (y < 150 + (x % 32 < 16 ? -20 : 0) ? SKY : GROUND));
  const r = frameMetrics(ridge.image, { horizon: 180 });
  assert.ok(r.skylineReliefPx > 5 && r.ringHeightPx >= 30, 'a serrated ridge raises relief');
  const grey = await frame('grey.png', 320, 180, () => [128, 128, 128]);
  const g = frameMetrics(grey.image, { horizon: -40 });
  assert.equal(g.colorfulness, 0); assert.equal(g.satMean, 0); assert.equal(g.skyShare, 0); assert.equal(g.skyMean, null);
  assert.equal(g.groundMean, 128); assert.equal(g.ringHeightPx, null); assert.equal(g.sharpness, 0); assert.equal(g.detail, 0);
  const checker = await frame('checker.png', 320, 180, (x, y) => ((x >> 1) + (y >> 1)) % 2 ? [200, 200, 200] : [40, 40, 40]);
  const c = frameMetrics(checker.image, { horizon: null });
  assert.ok(c.detail > 30 && c.sharpness > 20 && c.groundDetail === c.detail, 'fine texture carries high-pass energy');
  assert.equal(detectSkyline(new Float32Array(100), new Float32Array(100), 10, 10, 5), null, 'a window under 24 rows has no skyline');
  const hp = highPass(Float32Array.of(0, 0, 0, 0, 9, 0, 0, 0, 0), 3, 3, 1);
  near(hp[4], 8, 1e-6, 'high pass: the centre minus its 3 x 3 mean');

  // ------------------------------------------------------------------ census store
  const header = { protocol: CENSUS_PROTOCOL, viewport: CENSUS_VIEWPORT, serve: 'dist', revision: 'a'.repeat(40), revisionShort: 'aaaaaaaaa',
    branch: 'visual/baseline-census', sourceTree: { src: 's1', public: 'p1', index: 'i1', viteConfig: 'v1' }, dirtyGamePaths: [], root: ROOT,
    pinnedScene: { protocol: 'm1a2-fixed-roster-v1' }, viewsDigest: 'd1' };
  const fresh = openCensus(null, header);
  assert.deepEqual([fresh.maps, fresh.sessions], [{}, []]);
  const toolCommit = openCensus(fresh, { ...header, revision: 'b'.repeat(40), revisionShort: 'bbbbbbbbb' });
  assert.equal(toolCommit.revision, 'b'.repeat(40), 'a tool-only commit between batches continues the census');
  assert.throws(() => openCensus(fresh, { ...header, sourceTree: { ...header.sourceTree, src: 's2' } }), /source tree/);
  assert.throws(() => openCensus(fresh, { ...header, protocol: 'visual-census-v0' }), /protocol/);
  assert.throws(() => openCensus(fresh, { ...header, dirtyGamePaths: [' M src/main.ts'] }), /uncommitted game paths/);
  assert.throws(() => openCensus(fresh, { ...header, serve: 'dev' }), /serve/);
  assert.throws(() => openCensus(fresh, { ...header, viewsDigest: 'd2' }), /camera set/);

  // a two-map census with real frames: verdant fully shot, desert with a failed and a skipped view
  const outA = path.join(dir, 'census-a');
  const census = openCensus(null, header);
  const shotState = (pitch) => ({ camera: { forward: [0, Math.sin(pitch), -Math.cos(pitch)], fov: 55 } });
  census.maps.verdant = { name: 'Verdant Fields', status: 'ok', views: {} };
  census.maps.desert = { name: 'Sirocco Wadi', status: 'partial', views: {} };
  for (const view of CENSUS_VIEWS) {
    const f = await frame(`census-a/frames/verdant/${view.name}.png`, 320, 180, (x, y) => (y < 70 ? SKY : GROUND));
    census.maps.verdant.views[view.name] = { status: 'ok', attempts: 1, file: path.relative(outA, f.file), state: shotState(0.12) };
  }
  census.maps.desert.views.chase = { status: 'failed', attempts: 2, error: 'grass work never drained' };
  census.maps.desert.views.tree = { status: 'skipped', reason: 'no tree clusters' };
  census.sessions.push({ index: 0, startedAt: '2026-10-01T20:00:00.000Z', endedAt: '2026-10-01T20:30:00.000Z', maps: ['verdant', 'desert'],
    argv: ['capture', `--out=${outA}`, '--maps=verdant,desert'], browserVersion: 'Chrome/151', gpu: 'ANGLE (test)' });
  saveCensus(outA, census);
  assert.equal(loadCensus(outA).maps.verdant.name, 'Verdant Fields', 'atomic save / load round trip');
  assert.equal(loadCensus(path.join(dir, 'nowhere')), null);
  assert.equal(await measureCensus(outA, census), CENSUS_VIEWS.length, 'every ok frame measured once');
  assert.equal(await measureCensus(outA, census), 0, 'measured frames are kept unless forced');
  assert.equal(await measureCensus(outA, census, { force: true }), CENSUS_VIEWS.length);
  near(census.maps.verdant.views.chase.metrics.skyMean, luma(SKY), 0.01, 'metrics read the frame through census.json');
  saveCensus(outA, census);

  const sheets = await buildSheets(outA, census, { mapIds: ['verdant', 'desert'] });
  assert.equal(sheets.views.length, CENSUS_VIEWS.length); assert.equal(sheets.maps.length, 2);
  const viewSheet = await loadRgba(path.join(outA, sheets.views[1]));
  assert.equal(viewSheet.width, 6 + 6 * 406, 'six 400 px columns'); assert.equal(viewSheet.height, 46 + 1 * (225 + 40 + 6) + 6);
  const mapSheet = await loadRgba(path.join(outA, sheets.maps[0]));
  assert.deepEqual([mapSheet.width, mapSheet.height], [6 + 4 * 646, 46 + 2 * (360 + 26 + 6) + 6]);

  const reproduce = ['npm run build', `node tools/visual-census.mjs report --out=${outA}`];
  const index = renderIndex(census, { mapIds: ['verdant', 'desert'], sheets, reproduce });
  assert.match(index, /^# Visual census — aaaaaaaaa \(2026-10-01\)/);
  assert.match(index, /\*\*Commit:\*\* `a{40}`/);
  assert.ok(index.includes('```sh\nnpm run build\n'), 'the reproduce block is printed verbatim');
  assert.match(index, /\| verdant \(Verdant Fields\) \| ok \| ok \| ok \| ok \| ok \| ok \| ok \|/);
  assert.match(index, /\| desert \(Sirocco Wadi\) \| · \| FAIL \| · \| · \| · \| · \| skip \|/);
  assert.match(index, /Failed: desert\/chase: grass work never drained/);
  assert.match(index, /<!-- visual-read:start -->\n## Visual read\n\n\(not written yet\)\n<!-- visual-read:end -->/);
  const written = writeIndex(outA, census, { mapIds: ['verdant', 'desert'], sheets, reproduce });
  const edited = readFileSync(written, 'utf8').replace('(not written yet)', 'Verdant: flat light.');
  writeFileSync(written, edited);
  writeIndex(outA, census, { mapIds: ['verdant', 'desert'], sheets, reproduce });
  assert.ok(readFileSync(written, 'utf8').includes('Verdant: flat light.'), 'regenerating keeps the hand-written read');

  // ------------------------------------------------------------------ compare
  const a = await frame('d/a.png', 64, 32, () => [10, 20, 30]);
  assert.deepEqual(pixelDiff(a.image, a.image), { meanAbsDiff: 0, shareOver16: 0 });
  const b = await frame('d/b.png', 64, 32, (x) => (x < 16 ? [40, 20, 30] : [10, 20, 30]));
  assert.deepEqual(pixelDiff(a.image, b.image), { meanAbsDiff: 2.5, shareOver16: 0.25 });
  assert.throws(() => pixelDiff(a.image, grey.image), /size/);
  const outB = path.join(dir, 'census-b');
  const censusB = JSON.parse(JSON.stringify(census));
  censusB.revisionShort = 'bbbbbbbbb';
  for (const view of CENSUS_VIEWS) {
    const f = await frame(`census-b/frames/verdant/${view.name}.png`, 320, 180, (x, y) => (y < 60 ? SKY : GROUND));
    censusB.maps.verdant.views[view.name].file = path.relative(outB, f.file);
  }
  saveCensus(outB, censusB);
  await measureCensus(outB, censusB, { force: true });
  saveCensus(outB, censusB);
  const cmp = await compareCensus(outA, outB, path.join(dir, 'cmp'));
  assert.equal(cmp.rows.length, CENSUS_VIEWS.length, 'one row per frame pair (the failed desert view has no pair)');
  near(cmp.rows[0].shareOver16, 10 / 180, 1e-4, 'the ten moved skyline rows differ');
  assert.equal(cmp.rows[0].deltas.ringHeightPx, 10, 'B\'s skyline sits ten rows higher');
  assert.ok(existsSync(path.join(dir, 'cmp', 'compare', 'map-verdant.jpg')) && existsSync(path.join(dir, 'cmp', 'compare.json')));

  // ------------------------------------------------------------------ CLI (no server, no browser)
  assert.deepEqual(parseCensusArgs([]), { help: true }); assert.deepEqual(parseCensusArgs(['capture', '-h']), { help: true });
  const cap = parseCensusArgs(['capture', '--out=rel/out', '--maps=desert, verdant', '--views=sky-w', '--batch=5', '--budget-min=16']).options;
  assert.equal(cap.out, path.resolve('rel/out')); assert.equal(cap.root, process.cwd()); assert.equal(cap.serve, 'dist');
  assert.equal(cap.port, 5421); assert.equal(cap.settleMs, 1200); assert.equal(cap.lockTimeoutMin, 30);
  assert.deepEqual(cap.maps, ['desert', 'verdant']); assert.deepEqual(cap.views.map((v) => v.name), ['sky-w']);
  assert.equal(cap.batch, 5); assert.equal(cap.budgetMin, 16);
  assert.equal(parseCensusArgs(['capture', '--out=o']).options.views.length, CENSUS_VIEWS.length);
  for (const [argv, message] of [
    [['bogus'], /Unknown command/], [['capture'], /--out=<dir> is required/], [['capture', '--out=o', '--nope=1'], /Unknown argument --nope/],
    [['capture', '--out=o', 'positional'], /Unknown argument "positional"/], [['capture', '--out=o', '--out=p'], /Duplicate --out/],
    [['capture', '--out=o', '--serve=prod'], /--serve must be dist or dev/], [['capture', '--out=o', '--port=5190'], /avoid 5197/],
    [['capture', '--out=o', '--port=0'], /positive number/], [['capture', '--out=o', '--views=up'], /Unknown census view/],
    [['metrics', '--out=o', '--force=1'], /takes no value/], [['compare', '--a=x', '--out=o'], /--b=<dir> is required/],
    [['sheets', '--maps=a', '--out=o'], /Unknown argument --maps for sheets/],
  ]) assert.throws(() => parseCensusArgs(argv), message, argv.join(' '));
  assert.deepEqual(parseCensusArgs(['compare', '--a=x', '--b=y', '--out=o']).options, { command: 'compare', out: path.resolve('o'), force: false, a: path.resolve('x'), b: path.resolve('y') });
  const ids = ['verdant', 'desert', 'winter', 'urban'];
  assert.deepEqual(pickCaptureMaps(ids, null), ids);
  assert.deepEqual(pickCaptureMaps(ids, null, { maps: ['urban', 'verdant'] }), ['verdant', 'urban'], 'registry order');
  assert.throws(() => pickCaptureMaps(ids, null, { maps: ['atlantis'] }), /Unknown map id\(s\): atlantis/);
  const progress = { maps: { verdant: { status: 'ok' }, desert: { status: 'failed', failures: 2 }, winter: { status: 'partial', failures: 1 } } };
  assert.deepEqual(pickCaptureMaps(ids, progress, { batch: 5 }), ['winter', 'urban'], 'batches skip done maps and maps failed twice');
  assert.deepEqual(pickCaptureMaps(ids, progress, { batch: 1 }), ['winter']);
  for (const argv of [['--help'], ['capture', '--out=/nonexistent', '--bogus=1']]) {
    const run = spawnSync(process.execPath, [path.join(ROOT, 'tools/visual-census.mjs'), ...argv], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, argv[0] === '--help' ? 0 : 1, `${argv.join(' ')} exits without a server`);
    assert.ok((run.stdout + run.stderr).includes('node tools/visual-census.mjs <command>'));
  }
  assert.ok(CENSUS_HELP.includes('establishing, chase, bird, sky-w, sky-s, terrain, tree'));
  console.log('visual-census.selftest: camera set pinned, site selection, metrics, store, sheets, index, compare and CLI verified');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
