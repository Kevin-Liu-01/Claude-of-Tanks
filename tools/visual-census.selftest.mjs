// Receipt of the visual census tools (2026-10-01): the census camera set is pinned (names, order, poses, the two
// round-35 skyline views shared with the map view probe), the Node-side site selection of the chase / terrain / tree
// views is deterministic and honours its clearance rules, the frame metrics recover known numbers from synthetic
// frames that go through a real PNG round trip, census.json merges only captures of the same game, the sheets / index /
// compare outputs are produced from a synthetic census, and the CLI fails closed without starting a server or browser.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { loadRgba } from './map-metrics.mjs';
import { MAP_VIEW_PROBE_VIEWS } from './map-view-probe-views.mjs';
import { selectStandView } from './environment-shot-camera.mjs';
import {
  BORDER2_PROTOCOL, BORDER2_VIEWS, BORDER_EDGE, BORDER_EYE, BORDER_FRAME_CLEAR_M, BORDER_PROTOCOL, BORDER_VIEWS, CENSUS_FOV, CENSUS_HALF, CENSUS_PROTOCOL, CENSUS_VIEWPORT,
  CENSUS_VIEWS, borderPose, borderSamplePoints, borderSiteCandidates, censusViewSet, horizonRow, obliquePose,
  obliqueSamplePoints, pitchOf, selectBorderSite, selectCensusViews, selectChasePose, selectSkySite, selectTerrainSite,
  selectTreePose, skyPose, skySamplePoints, skySiteCandidates, terrainPose, terrainSamplePoints, terrainSiteCandidates,
} from './visual-census-views.mjs';
import { CENSUS_HEADLINE_METRICS, detectSkyline, frameMetrics, highPass, histogramQuantile } from './visual-census-metrics.mjs';
import {
  buildSheets, censusViewsOf, compareCensus, horizonOfState, loadCensus, measureCensus, openCensus, pixelDiff, renderIndex, saveCensus, writeIndex,
} from './visual-census-report.mjs';
import {
  CENSUS_HELP, CLOUDSCAPE_WAIT_MS, censusShotView, censusWarmupMap, cloudscapeVerdict, parseCensusArgs, pickCaptureMaps,
  viewsForMap,
} from './visual-census.mjs';
import { CENSUS_MAP_POSES } from './visual-census-map-poses.mjs';
import { MAP_IDS, getMapConfig } from '../src/world/maps/index.ts';
import { CLOUDSCAPE_REGIMES } from '../src/engine/cloudscapes.ts';
import { createPoliteCaptureLock, stepBehindStamp, ticketName } from './visual-census-lock.mjs';
import { near } from './receipt-kit.test-support.mjs';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const dir = mkdtempSync(path.join(tmpdir(), 'cot-visual-census-selftest-'));

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

  // ------------------------------------------------------------------ the border set (2026-10-02, map-borders lane)
  assert.equal(BORDER_PROTOCOL, 'visual-census-border-v1'); assert.equal(BORDER_EDGE, 512); assert.equal(BORDER_EYE, 2.5);
  assert.deepEqual(BORDER_VIEWS.map((v) => v.name), [
    'edge-n', 'edge-e', 'edge-s', 'edge-w', 'corner-ne', 'corner-se', 'corner-sw', 'corner-nw',
    'edge-n-up', 'edge-e-up', 'edge-s-up', 'edge-w-up', 'corner-ne-up', 'corner-se-up', 'corner-sw-up', 'corner-nw-up', 'oblique-ne',
  ]);
  assert.ok(BORDER_VIEWS.slice(0, 8).every((v) => v.kind === 'border' && v.camAbove === 2.5 && v.pitchDeg === 0), 'eye height, level');
  assert.ok(BORDER_VIEWS.slice(8, 16).every((v) => v.kind === 'border' && v.camAbove === 60 && v.pitchDeg === -15), '60 m up, 15° down');
  assert.equal(createHash('sha256').update(JSON.stringify(BORDER_VIEWS)).digest('hex'),
    '1bce6d5c96cc297a27dad0e1c738549683c6d2084a6e43b950dfd3da4f48a3df',
    'the border camera set is pinned: a moved or added view is a deliberate, dated re-pin (old border censuses stop comparing)');
  assert.ok(Object.isFrozen(BORDER_VIEWS) && BORDER_VIEWS.every((v) => Object.isFrozen(v)));
  assert.equal(censusViewSet('core').views, CENSUS_VIEWS, 'the core set is the seven views, unchanged');
  assert.equal(censusViewSet('core').protocol, CENSUS_PROTOCOL);
  assert.equal(censusViewSet('border').protocol, BORDER_PROTOCOL, 'the border set has its own protocol: it never merges with a core census');
  assert.throws(() => censusViewSet('rim'), /Unknown census view set "rim"/);
  assert.deepEqual(selectCensusViews(['oblique-ne', 'edge-n'], 'border').map((v) => v.name), ['edge-n', 'oblique-ne']);
  assert.throws(() => selectCensusViews(['edge-n']), /Unknown census view\(s\): edge-n/, 'border views are not core views');
  const edgeN = BORDER_VIEWS.find((v) => v.name === 'edge-n'), cornerNe = BORDER_VIEWS.find((v) => v.name === 'corner-ne');
  const nCandidates = borderSiteCandidates(edgeN);
  assert.equal(nCandidates.length, 11 * 5);
  assert.deepEqual([nCandidates[0].p, nCandidates[0].dir, nCandidates[0].inset, nCandidates[0].offset], [[0, 432], [0, 1], 80, 0], 'the side centre, 80 m inside');
  assert.deepEqual(nCandidates.slice(0, 5).map((c) => c.inset), [80, 70, 90, 60, 100], 'insets 60–100 m, 80 first');
  assert.deepEqual(nCandidates[5].p, [-40, 432], 'then offsets along the edge');
  assert.deepEqual(nCandidates[0].corridor, [[0, 440], [0, 448], [0, 456]]);
  assert.ok(nCandidates.every((c) => BORDER_EDGE - Math.max(Math.abs(c.p[0]), Math.abs(c.p[1])) >= 60 - 1e-9
    && BORDER_EDGE - Math.max(Math.abs(c.p[0]), Math.abs(c.p[1])) <= 100 + 1e-9), 'every spot 60–100 m inside the edge');
  const neCandidates = borderSiteCandidates(cornerNe);
  assert.equal(neCandidates.length, 5 * 5);
  assert.deepEqual(neCandidates[0].p, [432, 432], 'a corner spot is 80 m inside both edges');
  assert.deepEqual(neCandidates.slice(0, 6).map((c) => [c.insetX, c.insetZ]), [[80, 80], [70, 70], [90, 90], [60, 60], [100, 100], [80, 70]],
    'equal insets first, then the skewed pairs');
  near(neCandidates[0].dir[0], Math.SQRT1_2, 1e-12, 'corners look along the diagonal');
  assert.ok(neCandidates.every((c) => [c.p[0], c.p[1]].every((v) => BORDER_EDGE - Math.abs(v) >= 60 && BORDER_EDGE - Math.abs(v) <= 100)),
    'every corner spot 60–100 m inside both edges');
  assert.deepEqual(borderSiteCandidates(BORDER_VIEWS.find((v) => v.name === 'corner-sw'))[0].p, [-432, -432]);
  assert.equal(borderSamplePoints(nCandidates).length, 4 * nCandidates.length);
  assert.deepEqual(borderSiteCandidates(edgeN), nCandidates, 'deterministic from the table alone');
  const level = () => 10;
  const nSite = selectBorderSite(nCandidates, { heightAt: level });
  assert.deepEqual([nSite.candidate.index, nSite.pass, nSite.rule], [0, 1, 'clear']);
  const nEye = borderPose(nSite, edgeN, 10, 0);
  assert.deepEqual(nEye.cam, [0, 12.5, 432]); assert.ok(nEye.absolute);
  near(nEye.at[1], 12.5, 1e-9, 'the eye view is level'); assert.ok(nEye.at[2] > 800 && nEye.at[0] === 0, 'looking north, out of the square');
  const nUp = borderPose(nSite, BORDER_VIEWS.find((v) => v.name === 'edge-n-up'), 10, 0);
  near(pitchOf(nUp.cam, nUp.at), (-15 * Math.PI) / 180, 1e-9, 'the 60 m view pitches 15° down'); assert.equal(nUp.cam[1], 70);
  const wetSpot = borderPose(nSite, edgeN, -4, 1.5);
  assert.equal(wetSpot.cam[1], -4 + 1.5 + 2.5, 'over water the eye stands on the surface');
  const shed = selectBorderSite(nCandidates, { heightAt: level, buildings: [{ x: 0, z: 432, w: 12, d: 12 }] });
  assert.ok(shed.candidate.index > 0 && shed.pass === 1, 'a footprint on the spot moves it');
  assert.ok(Math.hypot(shed.candidate.p[0], shed.candidate.p[1] - 432) - Math.hypot(12, 12) / 2 >= 10);
  const bank = selectBorderSite(nCandidates, { heightAt: (x, z) => (z > 436 && Math.abs(x) < 50 ? 14 : 10) });
  assert.ok(Math.abs(bank.candidate.p[0]) >= 50 || bank.candidate.inset < 80, 'a bank rising above the eye in front moves the spot');
  const wall = selectBorderSite(nCandidates, { heightAt: (x, z) => z * 0.2 });
  assert.equal(wall.pass, 2, 'ground climbing everywhere relaxes the rise rule');
  const sea = selectBorderSite(nCandidates, { heightAt: level, waterDepthAt: () => 2 });
  assert.deepEqual([sea.candidate.index, sea.pass, sea.rule], [0, 4, 'wet-allowed'], 'all water: the centre spot over the water');
  const fenced = selectBorderSite(nCandidates, { heightAt: level, buildings: [{ x: 0, z: 400, w: 1200, d: 400 }] });
  assert.deepEqual([fenced.candidate.index, fenced.pass, fenced.rule], [0, 5, 'anchor'], 'nowhere clear: the anchor, flagged');
  assert.throws(() => selectBorderSite(nCandidates, {}), /heightAt/);
  // the border set's second protocol (2026-10-03, gauntlet wave 1: a tree's leaf cards filled the Verdant north eye
  // view's corner): the same views, whose spots keep the frame's near field clear of crowns
  assert.equal(BORDER2_PROTOCOL, 'visual-census-border-v2'); assert.equal(BORDER_FRAME_CLEAR_M, 14);
  assert.equal(censusViewSet('border2').protocol, BORDER2_PROTOCOL, 'v2 never merges with a v1 census');
  assert.deepEqual(BORDER2_VIEWS.map((v) => v.name), BORDER_VIEWS.map((v) => v.name), 'the same seventeen views');
  assert.ok(BORDER2_VIEWS.every((v, i) => v.kind !== 'border' ? JSON.stringify(v) === JSON.stringify(BORDER_VIEWS[i])
    : v.frameClearM === BORDER_FRAME_CLEAR_M && JSON.stringify({ ...v, frameClearM: undefined }) === JSON.stringify(BORDER_VIEWS[i])),
  'v2 adds the frame-clear rule to the sixteen rim views and nothing else');
  assert.equal(createHash('sha256').update(JSON.stringify(BORDER2_VIEWS)).digest('hex'),
    '8c893c68441109cf70411548d2b46a109c0da103b4e2bf50899632afbe010c54', 'the v2 camera set is pinned');
  assert.ok(Object.isFrozen(BORDER2_VIEWS) && BORDER2_VIEWS.every((v) => Object.isFrozen(v)));
  const n2Candidates = borderSiteCandidates(BORDER2_VIEWS.find((v) => v.name === 'edge-n'));
  assert.ok(n2Candidates.every((c) => c.frameClearM === BORDER_FRAME_CLEAR_M) && nCandidates.every((c) => c.frameClearM === undefined));
  // a crown 8 m left of the eye and 8 m ahead: clear of the v1 spot rules (3 m round the spot, 1.5 m round the corridor
  // straight ahead) but inside the frame — v1 keeps the spot, v2 moves it
  const sideCrown = [{ x: -8, z: 440, r: 4 }];
  assert.equal(selectBorderSite(nCandidates, { heightAt: level, concealers: sideCrown }).candidate.index, 0, 'v1: the near side crown is allowed');
  const v2Site = selectBorderSite(n2Candidates, { heightAt: level, concealers: sideCrown });
  assert.ok(v2Site.candidate.index > 0 && v2Site.pass === 1, 'v2: a crown in the near frame moves the spot');
  // behind the eye, or past the near field, a crown stays allowed
  assert.equal(selectBorderSite(n2Candidates, { heightAt: level, concealers: [{ x: 0, z: 410, r: 4 }] }).candidate.index, 0, 'behind the eye');
  assert.equal(selectBorderSite(n2Candidates, { heightAt: level, concealers: [{ x: -30, z: 462, r: 4 }] }).candidate.index, 0, 'past the near field');
  assert.throws(() => borderPose(nSite, edgeN, undefined), /no ground height/);
  const oblique = BORDER_VIEWS.at(-1);
  assert.deepEqual(obliqueSamplePoints(oblique), [[230, 230]]);
  const op = obliquePose(oblique, 5);
  assert.deepEqual(op.cam, [230, 285, 230]); near(pitchOf(op.cam, op.at), (-22 * Math.PI) / 180, 1e-9, 'the oblique pitches 22° down');
  assert.ok(op.at[0] > 230 && Math.abs(op.at[0] - op.at[2]) < 1e-9, 'across the north-east corner');

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

  // a border census: its sheets, index and compare follow the census's own camera set
  const outBorder = path.join(dir, 'census-border');
  const borderCensus = openCensus(null, { ...header, protocol: BORDER_PROTOCOL, viewSet: 'border', viewsDigest: 'b1' });
  assert.equal(censusViewsOf(borderCensus), BORDER_VIEWS); assert.equal(censusViewsOf(census), CENSUS_VIEWS);
  // authored --pose views (maps lane, 2026-10-03) follow the set's fixed views in a census that recorded them
  assert.deepEqual(censusViewsOf({ authoredViews: [{ name: 'cone-nw', kind: 'table' }] }).map((v) => v.name),
    [...CENSUS_VIEWS.map((v) => v.name), 'cone-nw']);
  borderCensus.maps.verdant = { name: 'Verdant Fields', status: 'ok', views: {} };
  for (const view of BORDER_VIEWS) {
    const f = await frame(`census-border/frames/verdant/${view.name}.png`, 320, 180, (x, y) => (y < 80 ? SKY : GROUND));
    borderCensus.maps.verdant.views[view.name] = { status: 'ok', attempts: 1, file: path.relative(outBorder, f.file), state: shotState(0) };
  }
  saveCensus(outBorder, borderCensus);
  assert.equal(await measureCensus(outBorder, borderCensus), BORDER_VIEWS.length);
  const borderSheets = await buildSheets(outBorder, borderCensus, { mapIds: ['verdant'] });
  assert.equal(borderSheets.views.length, BORDER_VIEWS.length, 'one sheet per border view');
  const borderMap = await loadRgba(path.join(outBorder, borderSheets.maps[0]));
  assert.deepEqual([borderMap.width, borderMap.height], [6 + 4 * 646, 46 + 5 * (360 + 26 + 6) + 6], 'four columns: edges, corners, edges up, corners up, oblique');
  const borderIndex = renderIndex(borderCensus, { mapIds: ['verdant'], sheets: borderSheets });
  assert.match(borderIndex, /^# Visual census \(border set\)/);
  assert.match(borderIndex, /\| map \| edge-n \| edge-e \|/);
  await assert.rejects(compareCensus(outA, outBorder, path.join(dir, 'cmp-mixed')), /one camera set/, 'a core and a border census never compare');

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
  assert.equal(parseCensusArgs(['capture', '--out=o']).options.set, 'core');
  const posed = parseCensusArgs(['capture', '--out=o', '--views=none', '--pose=cone-nw:-120,30,180:-185,10,266+cone-se:120,25,-200:205,8,-300']).options;
  assert.deepEqual(posed.views.map((v) => [v.name, v.kind, v.cam, v.at, v.authored]),
    [['cone-nw', 'table', [-120, 30, 180], [-185, 10, 266], true], ['cone-se', 'table', [120, 25, -200], [205, 8, -300], true]]);
  assert.equal(parseCensusArgs(['capture', '--out=o', '--pose=a:1,2,3:4,5,6']).options.views.length, CENSUS_VIEWS.length + 1);
  // --pose=maps (maps lane, 2026-10-03): each map's own views from tools/visual-census-map-poses.mjs, shot on that map
  // only; every entry names a registered map and parses; an explicit --pose view still rides on every map
  const mapPosed = parseCensusArgs(['capture', '--out=o', '--views=none', '--pose=maps']).options.views;
  assert.ok(Object.keys(CENSUS_MAP_POSES).every((id) => MAP_IDS.includes(id)), 'every map-pose entry is a registered map');
  assert.ok(mapPosed.length >= Object.keys(CENSUS_MAP_POSES).length && mapPosed.every((v) => v.authored && v.map));
  assert.deepEqual(viewsForMap(mapPosed, 'badlands').map((v) => v.name), ['redrock-jebel-close', 'redrock-jebel-60']);
  assert.deepEqual(viewsForMap(mapPosed, 'verdant'), [], 'a map without an entry shoots none of them');
  assert.deepEqual(viewsForMap(posed.views, 'verdant').map((v) => v.name), ['cone-nw', 'cone-se'], 'explicit poses ride on every map');
  // wave 35: the old Blackglass town camera stood against a tower's wall at (-187, -171); the census keeps it off there
  assert.notDeepEqual(viewsForMap(mapPosed, 'blackglass')[0].cam, [-187, 30, -171]);
  for (const [argv, message] of [[['capture', '--out=o', '--views=none'], /needs at least one --pose/],
    [['capture', '--out=o', '--pose=bad'], /--pose needs/], [['capture', '--out=o', '--pose=chase:1,2,3:4,5,6'], /Duplicate census view name/]]) {
    assert.throws(() => parseCensusArgs(argv), message, argv.join(' '));
  }
  const borderRun = parseCensusArgs(['capture', '--out=o', '--set=border', '--views=corner-sw,edge-n']).options;
  assert.deepEqual([borderRun.set, borderRun.views.map((v) => v.name)], ['border', ['edge-n', 'corner-sw']]);
  assert.equal(parseCensusArgs(['capture', '--out=o', '--set=border']).options.views.length, BORDER_VIEWS.length);
  for (const [argv, message] of [
    [['bogus'], /Unknown command/], [['capture'], /--out=<dir> is required/], [['capture', '--out=o', '--nope=1'], /Unknown argument --nope/],
    [['capture', '--out=o', 'positional'], /Unknown argument "positional"/], [['capture', '--out=o', '--out=p'], /Duplicate --out/],
    [['capture', '--out=o', '--serve=prod'], /--serve must be dist or dev/], [['capture', '--out=o', '--port=5190'], /avoid 5197/],
    [['capture', '--out=o', '--port=0'], /positive number/], [['capture', '--out=o', '--views=up'], /Unknown census view/],
    [['capture', '--out=o', '--set=rim'], /Unknown census view set/], [['capture', '--out=o', '--set=border', '--views=chase'], /Unknown census view/],
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
  assert.equal(parseCensusArgs(['capture', '--out=o', '--probe-lock=rel/probe.lock']).options.probeLock, path.resolve('rel/probe.lock'));
  // (the hitbox lane, 2026-10-07) map-bound poses and the collider overlay frame
  const bound = parseCensusArgs(['capture', '--out=o', '--views=none', '--pose=badlands/rock-a:1,3,2:4,1,5+titan_gorge/rock-a:0,2,0:1,1,1', '--overlay=colliders:24']).options;
  assert.deepEqual(bound.views.map((v) => [v.map, v.name]), [['badlands', 'rock-a'], ['titan_gorge', 'rock-a']], 'a pose binds to its map');
  assert.deepEqual(viewsForMap(bound.views, 'badlands').map((v) => v.name), ['rock-a'], 'each map shoots its own poses');
  assert.deepEqual(bound.overlay, { kind: 'colliders', radius: 24 }, 'the overlay radius');
  assert.equal(parseCensusArgs(['capture', '--out=o', '--overlay=colliders']).options.overlay.radius, 30, 'the default overlay radius');
  assert.throws(() => parseCensusArgs(['capture', '--out=o', '--overlay=walls']), /--overlay needs colliders/);
  assert.throws(() => parseCensusArgs(['capture', '--out=o', '--views=none', '--pose=a/x:1,1,1:2,2,2+a/x:1,1,1:2,2,2']), /Duplicate census view name/);
  assert.equal(parseCensusArgs(['capture', '--out=o']).options.probeLock, null);

  // ------------------------------------------------------------------ the cloudscape gate (2026-10-03, the skies lane's race)
  // The first map staged after boot could keep the deck derivation its sky took before the lazy cloudscape module
  // loaded (staging the map the world already shows applies no sky): fp8's Verdant rendered the legacy 'scattered'
  // layer on both roots. Every map passes the gate before any view: its layer's regime is the authored one, or a
  // throwaway warm-up map is staged and then the map again; a map that still fails is not captured.
  assert.equal(cloudscapeVerdict({ layer: false, authored: 'sea-streets', regime: null }), 'none', 'no volumetric layer');
  assert.equal(cloudscapeVerdict({ layer: true, authored: null, regime: 'scattered' }), 'none', 'no authored cloudscape');
  assert.equal(cloudscapeVerdict({ layer: true, authored: 'sea-streets', regime: null }), 'decks', 'the baked decks show');
  assert.equal(cloudscapeVerdict({ layer: true, authored: 'sea-streets', regime: 'sea-streets' }), 'ready');
  assert.equal(cloudscapeVerdict({ layer: true, authored: 'fair-weather-cumulus', regime: 'scattered' }), 'legacy', 'the race');
  assert.equal(cloudscapeVerdict(null), 'none');
  assert.equal(censusShotView('verdant'), 'battlefield');
  assert.equal(censusShotView('caldera'), 'battlefield_caldera');
  assert.equal(censusWarmupMap(['garage', 'battlefield', 'battlefield_desert'], 'verdant'), 'desert', 'the boot map warms up elsewhere');
  assert.equal(censusWarmupMap(['garage', 'battlefield', 'battlefield_desert'], 'caldera'), 'verdant');
  assert.throws(() => censusWarmupMap(['garage', 'battlefield'], 'verdant'), /no warm-up map/);
  assert.ok(CLOUDSCAPE_WAIT_MS >= 5000 && CLOUDSCAPE_WAIT_MS <= 60000);
  // the gate can tell the race apart on every map: an authored cloudscape names a regime of its own, never one of the
  // deck derivation's four (cloudPresets.ts deriveLegacy), and the resolver keeps it (cloudscapeLayer.ts)
  const legacyRegimes = ['scattered', 'broken', 'overcast', 'storm'];
  let authoredScapes = 0;
  for (const id of MAP_IDS) {
    const config = getMapConfig(id), scape = config.clouds ?? config.sky?.cloudscape ?? null;
    if (!scape) continue;
    assert.ok(Object.hasOwn(CLOUDSCAPE_REGIMES, scape.regime), `${id} names a cloudscape regime (${scape.regime})`);
    assert.ok(!legacyRegimes.includes(scape.regime), `${id}'s regime is not a deck derivation's`);
    authoredScapes++;
  }
  assert.ok(authoredScapes >= 30, `the gate covers the maps' authored cloudscapes (${authoredScapes})`);
  const layerSource = readFileSync(path.join(ROOT, 'src/engine/cloudscapeLayer.ts'), 'utf8');
  assert.match(layerSource, /regime: scape\.regime \?\? legacy\.regime/, 'the resolver keeps the authored regime');
  assert.match(readFileSync(path.join(ROOT, 'src/engine/volumetricClouds.ts'), 'utf8'), /get currentPreset\(\)/,
    'the layer publishes the preset it draws');
  // and stageMap runs it before the map's texture settle (so before every view), with the warm-up fallback
  const toolSource = readFileSync(path.join(ROOT, 'tools/visual-census.mjs'), 'utf8');
  const stageSource = toolSource.slice(toolSource.indexOf('async function stageMap('), toolSource.indexOf('/** Node-side poses of every view'));
  const gateAt = stageSource.indexOf('let cloudscape = await awaitCloudscape(page);');
  assert.ok(gateAt > 0 && gateAt < stageSource.indexOf('settleMapTextures'), 'the gate precedes the texture settle');
  assert.match(stageSource, /await setShot\(warmup\);\s*await setShot\(mapId\);/, 'the fallback stages the warm-up, then the map');
  assert.match(stageSource, /cloudscape, \.\.\.state \}/, 'the stage record carries the gate\'s evidence');

  // ------------------------------------------------------------------ polite lock (FIFO first, session mutex at the head)
  const t = (stamp, pid) => `${String(stamp).padStart(15, '0')}-000000000000-${pid}.t`;
  const alive = new Set([t(200, 2), t(300, 3)]);
  assert.equal(stepBehindStamp([t(300, 3), t(100, 1), t(200, 2)], t(100, 1), (n) => alive.has(n)), 201, 'one live waiter passes');
  assert.equal(stepBehindStamp([t(100, 1), t(150, 9)], t(100, 1), (n) => alive.has(n)), null, 'a dead waiter does not count');
  // equal stamps after step-behind rotations: the earlier ARRIVAL sorts first (a per-round counter starved long waiters)
  const early = ticketName(500, 1791035000000, 77777), late = ticketName(500, 1791035999999, 11);
  assert.ok(early < late && [late, early].sort()[0] === early, 'among equal stamps the longest waiter goes first');
  assert.match(early, /^\d{15}-\d{12}-\d+\.t$/, 'the shared ticket format capture-lock.mjs checks');
  assert.ok(ticketName(500, 1791035000000, 77777, 1) > early && ticketName(500, 1791035000000, 77777, 1) < late, 'a clash bump stays in arrival order');
  const lockRoot = mkdtempSync(path.join(tmpdir(), 'cot-census-lock-'));
  const dirs = { queueDir: path.join(lockRoot, 'queue'), lockDir: path.join(lockRoot, 'lock'), probeDir: path.join(lockRoot, 'probe.lock') };
  const fast = { requeuePauseMs: 20, headPollMs: 20, maxHolderWaitMs: 80 };
  const polite = createPoliteCaptureLock({ ...dirs, ...fast });
  await polite.acquire(2000);
  assert.ok(existsSync(dirs.lockDir) && existsSync(path.join(dirs.probeDir, 'pid')), 'both locks held at the head');
  polite.refresh(); polite.release();
  assert.ok(!existsSync(dirs.lockDir) && !existsSync(dirs.probeDir), 'release frees both');
  mkdirSync(dirs.probeDir);
  await assert.rejects(createPoliteCaptureLock({ ...dirs, ...fast }).acquire(150), /cot-shots lock timeout/, 'a busy session mutex never blocks the FIFO lock');
  assert.ok(!existsSync(dirs.lockDir), 'the FIFO lock was never taken while the session mutex was busy');
  rmSync(dirs.probeDir, { recursive: true });
  // 2026-10-03: a dead holder's session mutex (its pid gone, past the grace age) is reaped and taken; a live holder's
  // mutex never is, nor one younger than the grace age (the busy case above: a fresh mutex with no pid yet).
  mkdirSync(dirs.probeDir);
  const deadHolder = spawn(process.execPath, ['-e', ''], { stdio: 'ignore' });
  await new Promise((resolve) => deadHolder.once('exit', resolve));
  writeFileSync(path.join(dirs.probeDir, 'pid'), String(deadHolder.pid));
  const reaper = createPoliteCaptureLock({ ...dirs, ...fast, probeDeadGraceMs: 0 });
  await reaper.acquire(2000);
  assert.ok(existsSync(dirs.lockDir) && readFileSync(path.join(dirs.probeDir, 'pid'), 'utf8') === String(process.pid),
    "a dead holder's session mutex is reaped and taken");
  reaper.release();
  mkdirSync(dirs.probeDir);
  writeFileSync(path.join(dirs.probeDir, 'pid'), String(process.pid));
  await assert.rejects(createPoliteCaptureLock({ ...dirs, ...fast, probeDeadGraceMs: 0 }).acquire(150), /cot-shots lock timeout/,
    "a live holder's session mutex is never reaped");
  assert.ok(existsSync(dirs.probeDir) && !existsSync(dirs.lockDir), "the live holder keeps its mutex and nobody takes the FIFO lock");
  rmSync(dirs.probeDir, { recursive: true });
  mkdirSync(dirs.lockDir);
  await assert.rejects(createPoliteCaptureLock({ ...dirs, ...fast }).acquire(300), /cot-shots lock timeout/);
  assert.ok(!existsSync(dirs.probeDir), 'a FIFO holder outlasting the wait gets the session mutex handed back');
  // 2026-10-03: a waiter older than the stale age keeps its place. It renews its ticket while it waits and restores it
  // when another waiter reaps it; before, it was deleted at 60 min and waited outside the queue behind every later arrival.
  rmSync(dirs.lockDir, { recursive: true, force: true });
  const front = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], { stdio: 'ignore' });
  const frontTicket = path.join(dirs.queueDir, t(1, front.pid));
  writeFileSync(frontTicket, String(front.pid));
  const frontAlive = setInterval(() => { const now = new Date(); try { utimesSync(frontTicket, now, now); } catch { /* gone */ } }, 30);
  const ownTickets = () => readdirSync(dirs.queueDir).filter((n) => n.endsWith(`-${process.pid}.t`));
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const patient = createPoliteCaptureLock({ ...dirs, ...fast, ticketStaleMs: 150, ticketRefreshMs: 40 });
  const waiting = patient.acquire(5000);
  await pause(450);
  assert.equal(ownTickets().length, 1, 'a waiter past the stale age still holds its ticket');
  assert.ok(Date.now() - statSync(path.join(dirs.queueDir, ownTickets()[0])).mtimeMs < 150, 'and keeps renewing it, so no peer reaps it');
  for (const name of ownTickets()) rmSync(path.join(dirs.queueDir, name));
  await pause(160);
  assert.equal(ownTickets().length, 1, 'a reaped ticket is restored in place');
  assert.ok(!existsSync(dirs.lockDir), 'it still waits behind the live waiter ahead of it');
  clearInterval(frontAlive); front.kill();
  await waiting;
  assert.ok(existsSync(dirs.lockDir), 'and takes the lock when that waiter goes');
  patient.release();
  rmSync(lockRoot, { recursive: true, force: true });
  console.log(`visual-census.selftest: camera sets pinned (core and border), site selection, metrics, store, sheets, index, compare, CLI and the cloudscape gate (${authoredScapes} authored cloudscapes) verified`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
