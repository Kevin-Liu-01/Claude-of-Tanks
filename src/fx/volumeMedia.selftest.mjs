// volumeMedia.selftest.mjs — the destruction-fx media layer (2026-10-07): the committed atlases match their ledger and
// the runtime's layout, the bake is deterministic, the pool sorts back to front within its bounds, and the recipes
// draw only from the seeded stream (Studio resetSeed and frozen captures stay exact) and key on munition and surface.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { VOLUME_ATLAS, createVolumeMedia, makeVolumePuff, volumePositionAt } from './volumeMedia.ts';
import { createDebrisChunks, makeChunkPiece, CHUNK_SHAPES } from './debrisChunks.ts';
import { groundBurst, kineticStrike, muzzleBlast, killFireball, columnPuff, dustSurge, isExplosive, blastScale, craterEjecta } from './blastRecipes.ts';
import { SURFACE_KINDS, SURFACE_LOOKS, classifyTerrain, surfaceForMaterial, linearHex } from './surfaceLooks.ts';
import { mulberry32 } from './particles.ts';
import { structureStageFx, propBreakFx, lookForStruckKind, breachBlowFor, lookFromAnatomy } from './structureFx.ts';
import { createCraterMarks, craterSoil } from './craterMarks.ts';
import { craterWobblePhases } from '../sim/terrainDeformation.ts';
import { createStructureMask, COLLAPSE_S, MAX_HOLES } from './structureMask.ts';
import { createStructureDebris, paletteGeometry, DEBRIS_SHAPES } from './structureDebris.ts';
import { MUNITION_CLASSES } from '../sim/destructionEvents.ts';
import { bakeBand, VOLUME_MEDIA, MEDIA_ORDER, ATLAS_COLUMNS, FLOW_SCALE } from '../../tools/fx-volume-bake.mjs';

// ---- 1. the committed atlases, the ledger and the runtime layout agree ------------------------------------------
const ledger = JSON.parse(await readFile(new URL('./volumeAtlases.ledger.json', import.meta.url), 'utf8'));
for (const [sheet, url] of [['a', VOLUME_ATLAS.urlA], ['b', VOLUME_ATLAS.urlB]]) {
  // sheet b is baked at half resolution
  const png = await readFile(new URL(`../../public${url}`, import.meta.url));
  const [w, h, sha] = ledger[sheet];
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `sheet ${sheet} is a PNG`);
  assert.equal(png.readUInt32BE(16), w, `sheet ${sheet}: width`);
  assert.equal(png.readUInt32BE(20), h, `sheet ${sheet}: height`);
  assert.equal(createHash('sha256').update(png).digest('hex'), sha,
    `sheet ${sheet}: the committed atlas matches its ledger row (re-bake: node tools/fx-volume-bake.mjs --ledger)`);
}
assert.equal(ledger.columns, VOLUME_ATLAS.columns, 'columns');
assert.equal(ledger.tile, VOLUME_ATLAS.tile, 'tile');
assert.equal(ledger.flowScale, VOLUME_ATLAS.flowScale, 'motion-vector scale');
assert.equal(ledger.width, VOLUME_ATLAS.columns * VOLUME_ATLAS.tile, 'atlas width');
assert.equal(ledger.height, VOLUME_ATLAS.bands * VOLUME_ATLAS.rowsPerBand * VOLUME_ATLAS.tile, 'atlas height = bands of 8 x 8');
let bands = 0;
for (const id of MEDIA_ORDER) {
  const L = ledger.media[id], R = VOLUME_ATLAS.media[id];
  assert.ok(L && R, `${id}: in both the ledger and the runtime`);
  assert.equal(L.firstBand, R.firstBand, `${id}: first band`);
  assert.equal(L.variants, R.variants, `${id}: variants`);
  assert.equal(L.gamma, R.gamma, `${id}: frame-time warp`);
  assert.equal(L.frames, VOLUME_ATLAS.frames, `${id}: frames`);
  bands += L.variants;
}
assert.equal(bands, VOLUME_ATLAS.bands, 'every band is a medium variant');
assert.equal(ATLAS_COLUMNS, VOLUME_ATLAS.columns);
assert.equal(FLOW_SCALE, VOLUME_ATLAS.flowScale);
// texture budget (desktop): sheet A at full resolution, sheet B halved at load, both mipmapped (x 4/3)
assert.deepEqual(ledger.b.slice(0, 2), [ledger.width >> 1, ledger.height >> 1], 'sheet b is half resolution');
const bytesA = ledger.width * ledger.height * 4, bytesB = ledger.b[0] * ledger.b[1] * 4;
const gpuMB = (bytesA + bytesB) * 4 / 3 / (1024 * 1024);
assert.ok(gpuMB <= 16, `the media atlases stay within the 16 MB desktop budget (${gpuMB.toFixed(1)} MB)`);

// ---- 2. the bake is deterministic ---------------------------------------------------------------------------------
{
  const spec = VOLUME_MEDIA.burst;
  const a = bakeBand(spec, 0, { res: 14, frames: 4, tile: 16 });
  const b = bakeBand(spec, 0, { res: 14, frames: 4, tile: 16 });
  const c = bakeBand(spec, 1, { res: 14, frames: 4, tile: 16 });
  assert.equal(Buffer.compare(Buffer.from(a.a), Buffer.from(b.a)), 0, 'same seed, same sheet a');
  assert.equal(Buffer.compare(Buffer.from(a.b), Buffer.from(b.b)), 0, 'same seed, same sheet b');
  assert.notEqual(Buffer.compare(Buffer.from(a.a), Buffer.from(c.a)), 0, 'another variant is another cloud');
  let covered = 0;
  for (let o = 3; o < a.a.length; o += 4) if (a.a[o] > 128) covered++;
  assert.ok(covered > 16, 'the cloud covers its tiles');
}

// ---- 3. the pool: bounded, sorted back to front, idle when empty --------------------------------------------------
{
  let now = 10;
  const soft = { uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) },
    uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 } };
  const media = createVolumeMedia({ soft, now: () => now, capacity: 64 });
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 4000);
  camera.position.set(0, 2, 0);
  camera.lookAt(0, 2, -10);
  camera.updateMatrixWorld(true);
  media.update(camera);
  assert.equal(media.stats().drawn, 0, 'nothing drawn while empty');
  assert.equal(media.group.children[0].visible, false, 'an idle pool is out of the render list');
  assert.equal(media.isActive(), false);
  const p = makeVolumePuff();
  const R = mulberry32(7);
  for (let i = 0; i < 100; i++) {
    p.x = (R() - 0.5) * 40; p.y = 2; p.z = -5 - R() * 80; p.vx = 0; p.vy = 0; p.vz = 0; p.life = 5; p.drag = 1;
    p.rise = 0; p.windK = 0; p.grav = 0; p.birthOffset = -R();
    media.emit(p);
  }
  media.update(camera);
  const st = media.stats();
  assert.equal(st.live, 64, 'the ring holds its capacity (the oldest are overwritten)');
  assert.equal(st.drawn, 64, 'every live puff is drawn');
  assert.equal(media.group.children[0].visible, true, 'a live pool draws');
  // read the sorted instance origins back: depth along the view must not increase
  const mesh = media.group.children[0];
  const pb = mesh.geometry.getAttribute('aPB').array;
  let prev = Infinity;
  for (let q = 0; q < st.drawn; q++) {
    const depth = -(pb[q * 4 + 2] - camera.position.z); // the camera looks down -z; farther is more negative z
    assert.ok(depth <= prev + 1e-4, `sorted back to front at ${q}`);
    prev = depth;
  }
  // the motion law the sort uses is the shader's
  const rec = new Float32Array(32);
  rec[0] = 1; rec[1] = 2; rec[2] = 3; rec[4] = 4; rec[5] = 5; rec[6] = 0; rec[8] = 2; rec[9] = 1; rec[10] = 1; rec[11] = -9.8;
  const out = [0, 0, 0];
  volumePositionAt(rec, 0, 2, 0, 0, out);
  assert.deepEqual(out, [1, 2, 3], 'age 0 sits at the origin');
  volumePositionAt(rec, 0, 2, 0, 50, out);
  assert.ok(Math.abs((out[0] - 1) / 50 - 2) < 0.1, 'late motion follows the wind x coupling');
  // time passes: all expire, the pool idles
  now += 100;
  media.update(camera);
  assert.equal(media.stats().drawn, 0, 'expired puffs leave the draw');
  // the per-frame sort writes into preallocated arrays only
  const arraysBefore = ['aPB', 'aVL', 'aDY', 'aSZ', 'aCA', 'aCB', 'aFB', 'aHT'].map((n) => mesh.geometry.getAttribute(n).array);
  for (let i = 0; i < 20; i++) { p.birthOffset = 0; media.emit(p); }
  media.update(camera);
  const arraysAfter = ['aPB', 'aVL', 'aDY', 'aSZ', 'aCA', 'aCB', 'aFB', 'aHT'].map((n) => mesh.geometry.getAttribute(n).array);
  arraysBefore.forEach((a, k) => assert.equal(a, arraysAfter[k], 'instance arrays are reused'));
  media.reset();
  media.update(camera);
  assert.equal(media.stats().drawn, 0, 'reset empties the pool');
}

// ---- 4. recipes: seeded, keyed on munition and surface ------------------------------------------------------------
function captureContext(seed) {
  const rand = mulberry32(seed);
  const log = { media: [], chunk: [], flash: 0, fire: 0, sparks: 0, pulses: 0 };
  return {
    log,
    ctx: {
      rand, groundY: () => 0,
      media: (p) => log.media.push({ ...p }),
      chunk: (k) => log.chunk.push({ ...k }),
      flash: () => { log.flash++; }, fire: () => { log.fire++; }, sparks: () => { log.sparks++; },
      jet: () => { log.jets = (log.jets || 0) + 1; }, shockRing: () => { log.rings = (log.rings || 0) + 1; },
      lightPulse: () => { log.pulses++; }, distBoost: () => 1, tier: 1,
      m: makeVolumePuff(), k: makeChunkPiece(),
      lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
      ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
      lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 },
    },
  };
}
{
  const he = (seed, munition, chargeKg, surface) => {
    const c = captureContext(seed);
    groundBurst(c.ctx, { x: 0, y: 0, z: 0, munition, chargeKg, surface });
    return c.log;
  };
  const a = he(5, 'he', 3.5, 'soil'), b = he(5, 'he', 3.5, 'soil');
  assert.deepEqual(a, b, 'same seed, same burst (Studio resetSeed and frozen captures stay exact)');
  const big = he(5, 'howitzer', 20, 'soil');
  assert.ok((big.rings || 0) > 0, 'the gunship howitzer sends a pressure ring over the ground');
  const atgm = captureContext(6);
  groundBurst(atgm.ctx, { x: 0, y: 0, z: 0, munition: 'atgm', chargeKg: 3.4, surface: 'soil', dx: 1, dy: -0.3, dz: 0 });
  assert.ok((atgm.log.jets || 0) > 0, "an ATGM's jet flashes back along its line");
  const fpv = captureContext(6);
  groundBurst(fpv.ctx, { x: 0, y: 0, z: 0, munition: 'drone_fpv', chargeKg: 1.2, surface: 'soil' });
  assert.ok(fpv.log.sparks > 15, "a drone's warhead throws fragments");
  const tos = captureContext(6);
  groundBurst(tos.ctx, { x: 0, y: 0, z: 0, munition: 'rocket', chargeKg: 8, surface: 'soil' });
  assert.ok(tos.log.media.filter((m) => m.heat > 1.5).length >= 5, 'a thermobaric rocket rolls a long fireball');
  const maxSize = (log) => Math.max(...log.media.map((m) => m.size1));
  assert.ok(maxSize(big) > maxSize(a) * 1.4, 'the gunship howitzer throws a far bigger cloud than tank HE');
  assert.ok(a.flash > 0 && a.fire > 0 && a.pulses > 0, 'an explosive burst flashes, burns and lights the ground');
  const snow = he(5, 'he', 3.5, 'snow');
  const lum = (log) => log.media.reduce((s, m) => s + m.r1 + m.g1 + m.b1, 0) / log.media.length;
  assert.ok(lum(snow) > lum(a) * 1.5, 'snow throws white powder, soil tan dust');
  for (const m of a.media) {
    assert.ok(Math.abs(m.spin) <= 0.07, 'media puffs barely turn (spinning stickers were FX round 6)');
    assert.ok(m.size1 >= m.size0, 'puffs grow');
  }
  const k = captureContext(9);
  kineticStrike(k.ctx, { x: 0, y: 0, z: 0, dx: 1, dy: -0.1, dz: 0, caliberMm: 120, munition: 'kinetic', surface: 'soil' });
  assert.equal(k.log.flash + k.log.fire, 0, 'a kinetic strike neither flashes nor burns');
  assert.ok(k.log.media.length > 0 && k.log.chunk.length > 0, 'it throws soil and clods');
  const mg = captureContext(9);
  kineticStrike(mg.ctx, { x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0, caliberMm: 12.7, munition: 'small_arms', surface: 'soil' });
  assert.ok(mg.log.media.length <= 3 && Math.max(...mg.log.media.map((m) => m.size1)) < 1, 'a bullet kicks a fist of dust');
  const rock = captureContext(9);
  kineticStrike(rock.ctx, { x: 0, y: 0, z: 0, dx: 1, dy: 0, dz: 0, caliberMm: 30, munition: 'autocannon_ap', surface: 'rock' });
  assert.ok(rock.log.sparks > 0, 'rock sparks');
  for (const munition of MUNITION_CLASSES) {
    const c = captureContext(3);
    if (isExplosive(munition)) groundBurst(c.ctx, { x: 0, y: 0, z: 0, munition, chargeKg: Math.max(0.05, blastScale(1)), surface: 'soil' });
    else kineticStrike(c.ctx, { x: 0, y: 0, z: 0, dx: 0, dy: -1, dz: 0, caliberMm: 30, munition, surface: 'soil' });
    assert.ok(c.log.media.length > 0, `${munition}: draws something`);
  }
  assert.equal(isExplosive('small_arms'), false);
  assert.equal(isExplosive('kinetic'), false);
  assert.equal(isExplosive('drone_fpv'), true);
  const mz = captureContext(2);
  muzzleBlast(mz.ctx, { x: 0, y: 2.2, z: 0, dx: 1, dy: 0, dz: 0, caliberMm: 120, surface: 'sand' });
  assert.ok(mz.log.media.some((m) => m.medium === 'burst'), 'a low muzzle lifts the ground dust');
  const mzHigh = captureContext(2);
  muzzleBlast(mzHigh.ctx, { x: 0, y: 9, z: 0, dx: 1, dy: 0, dz: 0, caliberMm: 120, surface: 'sand' });
  assert.ok(!mzHigh.log.media.some((m) => m.medium === 'burst'), 'a high muzzle lifts none');
  const kf = captureContext(4);
  killFireball(kf.ctx, 0, 1, 0, true, 0);
  columnPuff(kf.ctx, 0, 0, 0, 1, 1.3, 0);
  dustSurge(kf.ctx, 0, 0, 0, 2, 'soil', 0);
  assert.ok(kf.log.media.some((m) => m.heat > 1), 'the fireball burns inside its media');
}

// ---- 5. surfaces --------------------------------------------------------------------------------------------------
{
  for (const s of SURFACE_KINDS) assert.ok(SURFACE_LOOKS[s], `${s}: a look`);
  const field = { getWaterMaskAt: (x) => (x > 100 ? 1 : 0), getGroundType: (x) => (x < -100 ? 'soft' : 'medium'),
    getTrackSurfaceAt: (x, z) => (z > 100 ? 3 : 0), getNormalAt: () => ({ y: 1 }) };
  assert.equal(classifyTerrain(field, 200, 0), 'water');
  assert.equal(classifyTerrain(field, -200, 0), 'mud');
  assert.equal(classifyTerrain(field, 0, 200), 'snow');
  assert.equal(classifyTerrain(field, 0, 0), 'soil');
  assert.equal(classifyTerrain(null, 0, 0), 'soil');
  assert.equal(surfaceForMaterial('brick'), 'concrete');
  assert.equal(surfaceForMaterial('adobe'), 'sand');
  assert.equal(surfaceForMaterial('timber'), 'wood');
  const w = linearHex(0xffffff);
  assert.ok(Math.abs(w[0] - 1) < 1e-9, 'white stays white');
}

// ---- 6. thrown material ---------------------------------------------------------------------------------------------
{
  let now = 0;
  const chunks = createDebrisChunks({ seed: 3, now: () => now });
  const k = makeChunkPiece();
  for (const shape of CHUNK_SHAPES) { k.shape = shape; k.life = 2; chunks.emit(k); }
  chunks.update();
  for (const shape of CHUNK_SHAPES) assert.equal(chunks.stats()[shape], 1, `${shape}: one piece`);
  assert.ok(chunks.group.children.every((m) => m.visible), 'live shapes draw');
  now = 10;
  chunks.update();
  chunks.reset();
  assert.ok(chunks.group.children.every((m) => !m.visible), 'reset hides every shape');
}

// ---- 7. structures and craters -------------------------------------------------------------------------------
{
  const base = { structureId: 3, massClass: 'house', cx: 10, cz: 20, hw: 5, hd: 4, yaw: 0.3, baseY: 0, topY: 7,
    previous: 'intact', cause: 'blast', munition: 'he', x: 12, y: 3, z: 20, dirX: 1, dirZ: 0, points: 12, integrity: 0.6 };
  const run = (stage, extra = {}, look = null) => {
    const c = captureContext(11);
    structureStageFx(c.ctx, { ...base, stage, ...extra }, look);
    return c.log;
  };
  const damaged = run('damaged'), breached = run('breached'), collapsed = run('collapsed');
  assert.ok(damaged.media.length > 0 && damaged.chunk.length > 0, 'a damaged face throws dust and chips');
  assert.ok(breached.chunk.length > damaged.chunk.length, 'a breach throws more than a crack');
  assert.ok(collapsed.chunk.length > breached.chunk.length && collapsed.media.length > breached.media.length,
    'a collapse brings the walls down in dust');
  assert.equal(run('collapsed', { settled: true }).media.length, 0, 'a settled stage draws nothing (laid down silently)');
  assert.deepEqual(run('collapsed'), collapsed, 'seeded: the same collapse twice is the same collapse');
  const adobe = { rubble: [{ material: 'adobe', color: [0.45, 0.33, 0.22], share: 1 }], interior: [0.02, 0.02, 0.02] };
  const mud = run('collapsed', {}, adobe);
  assert.ok(mud.chunk.every((k) => k.shape === 'brick' && k.r > k.b), 'an adobe house falls as its own mud bricks');
  assert.ok(collapsed.flash === 0 && collapsed.fire === 0, 'a collapse is not an explosion');
  const fence = captureContext(12);
  propBreakFx(fence.ctx, 'wood', 'fenceplank', 0, 0, 0, 1, 0, 1.2);
  assert.ok(fence.log.chunk.length > 0 && fence.log.chunk.every((k) => k.shape === 'splinter'), 'a fence splinters');
  const adobeWall = captureContext(12);
  propBreakFx(adobeWall.ctx, 'masonry', 'walladobe', 0, 0, 0, 1, 0, 1.2);
  assert.ok(adobeWall.log.chunk.some((k) => k.shape === 'brick') && adobeWall.log.chunk.every((k) => k.r > k.b),
    'a mud wall falls as tan mud bricks');
  const shed = captureContext(12);
  propBreakFx(shed.ctx, 'metalbuilding', 'quonsethut', 0, 0, 0, 1, 0, 3);
  assert.ok(shed.log.chunk.some((k) => k.shape === 'sheet'), 'a steel shed folds into sheet');
  assert.equal(lookForStruckKind('structure'), null, 'a building keeps the masonry fallback until its anatomy');
  // the P1 breach stage's blow: a point and radius for the seam's holeAt, off the ground, sized by the blow
  const he = breachBlowFor({ ...base, stage: 'breached', x: 15, y: 0.3, z: 20 });
  assert.equal(he.radiusM, 1.3, 'an HE shell: 1.3 m');
  assert.ok(he.y >= base.baseY + he.radiusM * 0.85 - 1e-9, 'a burst at the foot of a wall still holes the wall above it');
  assert.ok(he.x === 15 && he.z === 20, 'the face is the seam\'s to choose (the point is the blow\'s)');
  const big = breachBlowFor({ ...base, stage: 'breached', munition: 'howitzer' });
  const ram = breachBlowFor({ ...base, stage: 'breached', cause: 'ram', munition: null, y: 0.2 });
  const shot = breachBlowFor({ ...base, stage: 'breached', munition: 'kinetic' });
  assert.ok(big.radiusM > he.radiusM && he.radiusM > shot.radiusM, 'as big as the blow');
  assert.ok(Math.abs(ram.y - 1.2 - base.baseY) < 0.5, 'a rammed wall opens at the hull');
  const hut = breachBlowFor({ ...base, stage: 'breached', munition: 'howitzer', hw: 1.2, hd: 1.0, topY: 2.4 });
  assert.ok(hut.radiusM <= 0.45 * 2.4 + 1e-9 && hut.y + hut.radiusM * 0.6 <= 2.4 + 1e-9, 'never wider than the building holds');
  // a look from the anatomy: its own tints where vertex-coloured, the material's colour where textured (white tint)
  const look = lookFromAnatomy({
    rubble: [{ material: 'plaster', bucket: 'plaster', tint: [0.6, 0.5, 0.3], share: 0.4 },
      { material: 'brick', bucket: 'brick', tint: [1, 1, 1], share: 0.6 }, { material: 'tile', bucket: 'roof', tint: [1, 1, 1], share: 0 }],
    interior: { color: [0.02, 0.02, 0.018] },
  });
  assert.equal(look.rubble.length, 2, 'a zero share is no rubble');
  assert.deepEqual(look.rubble[0].color, [0.6, 0.5, 0.3], 'a vertex-coloured bucket keeps its building\'s own tint');
  assert.ok(look.rubble[1].color[0] > look.rubble[1].color[2] && look.rubble[1].color[0] < 0.5, 'a textured brick bucket reads brick');
  assert.deepEqual(look.interior, [0.02, 0.02, 0.018]);
  assert.equal(lookFromAnatomy(null), null);
}
{
  const craters = createCraterMarks();
  assert.equal(craters.count, 0);
  assert.equal(craters.mesh.visible, false, 'no crater, no draw');
  for (let i = 0; i < 120; i++) craters.stamp(i, 0, 1.6, 'soil', true, (i % 7) / 7, 0, () => 0);
  assert.equal(craters.count, 96, 'the marks ring keeps the latest 96');
  assert.ok(craters.mesh.geometry.drawRange.count > 0, 'marks draw');
  // a deforming crater (crater-render-spec §D): kept apart from the marks, world-aligned (the shader's angle is the
  // simulation's atan2(dz, dx)), the simulation's wobble phases, draped on the deformed ground, the place's soil
  const [p1, p2, p3] = craterWobblePhases(51234);
  const bowl = (x, z) => -0.6 * Math.max(0, 1 - ((x - 10) ** 2 + (z - 20) ** 2) / (1.7 * 1.7));
  craters.crater({ x: 10, z: 20, radiusM: 1.7, p1, p2, p3, surface: 'snow', climate: 'snow', explosive: true, seed: 0.78, birth: 0 }, bowl);
  assert.equal(craters.craters, 1);
  assert.equal(craters.count, 97, 'a crater never evicts a mark (nor a mark a crater)');
  const g = craters.mesh.geometry;
  const P = g.getAttribute('position').array, S = g.getAttribute('aShape').array, D = g.getAttribute('aDisc').array, O = g.getAttribute('aSoil').array;
  assert.deepEqual([S[0], S[1], S[2]].map((v) => +v.toFixed(5)), [p1, p2, p3].map((v) => +v.toFixed(5)), 'the wobble the bowl was dug with');
  assert.ok(Math.abs(S[3] - 1 / 1.6) < 1e-6, 'the rim at 1/1.6 of the disc (the disc reaches 1.6 R)');
  assert.ok(Math.abs(P[1] - (bowl(10, 20) + 0.05)) < 1e-5, 'the centre lies in the bowl');
  // a vertex on the outer ring sits at disc (cos a, sin a) * 1.6 R, unrotated
  const v = 1 + 5 * 28 + 7, a = (7 / 28) * Math.PI * 2;
  assert.ok(Math.abs(P[v * 3] - (10 + Math.cos(a) * 1.7 * 1.6)) < 1e-4 && Math.abs(P[v * 3 + 2] - (20 + Math.sin(a) * 1.7 * 1.6)) < 1e-4
    && Math.abs(D[v * 2] - Math.cos(a)) < 1e-6, "world-aligned: the decal's angle is the simulation's");
  assert.ok(O[0] < 0.1 && O[1] < 0.1, 'dark soil through snow');
  // climates: an arid map's loam is lighter, an ash field black-grey
  assert.ok(craterSoil('soil', 'arid', [0, 0, 0, 0])[0] > craterSoil('soil', 'vegetated', [0, 0, 0, 0])[0]);
  assert.ok(craterSoil('soil', 'ash', [0, 0, 0, 0])[0] < 0.04 && craterSoil('sand', 'ash', [0, 0, 0, 0])[0] > 0.2, 'ash on soil, not on a sand road');
  for (let i = 0; i < 200; i++) craters.crater({ x: i, z: 0, radiusM: 2, p1, p2, p3, surface: 'soil', climate: 'vegetated', explosive: true, seed: 0.1, birth: 0 }, () => 0);
  assert.equal(craters.craters, 160, "the simulation's cap: 160 craters a match");
  craters.reset();
  assert.equal(craters.count, 0);
  assert.equal(craters.mesh.geometry.drawRange.count, 0, 'reset clears the marks');
  // a live crater's clods land on its rim and blanket (between R and 1.6 R), at rest on the deformed ground
  const ej = captureContext(9);
  const dug = (x, z) => 1 + bowl(x + 10, z + 20);
  craterEjecta(ej.ctx, 0, 0, 1.7, 'soil', dug, 0);
  assert.ok(ej.log.chunk.length >= 15, 'clods');
  for (const k of ej.log.chunk) {
    const s = (1 - Math.exp(-k.drag * 0.55)) / k.drag; // the shortest flight
    const T = (() => { // solve the flight time back from the aimed landing (y(T) = groundY)
      let lo = 0.3, hi = 3;
      for (let i = 0; i < 60; i++) { const t = (lo + hi) / 2; const ss = (1 - Math.exp(-k.drag * t)) / k.drag; if (k.y + k.vy * ss - 4.9 * t * t > k.groundY) lo = t; else hi = t; }
      return lo;
    })();
    const ss = (1 - Math.exp(-k.drag * T)) / k.drag;
    const lx = k.x + k.vx * ss, lz = k.z + k.vz * ss;
    const d = Math.hypot(lx, lz);
    assert.ok(d > 1.7 * 0.98 && d < 1.7 * 1.6 * 1.02, `a clod lands on the rim or the blanket (${d.toFixed(2)} m)`);
    assert.ok(Math.abs(k.groundY - dug(lx, lz)) < 1e-6, 'and rests on the ground where it lands');
    void s;
  }
  assert.ok(ej.log.media.length >= 8 && ej.log.media.every((m) => m.aspect > 1.5), 'a thin ring of dust rolls off the rim');
}

// ---- 8. buildings coming down in their own geometry (the mask the world's bucket materials read) ---------------
{
  const mask = createStructureMask(64);
  const data = mask.texture.image.data;
  const T = 10 * 4; // ten texels per structure
  mask.setClock(10);
  mask.collapse(5, 10.5, 7, 3, 4, 100, 2, -50);
  const o = 5 * T;
  assert.equal(data[o], 10.5, 'the collapse starts on the fx clock');
  assert.equal(data[o + 1], 7, 'the height it sinks');
  assert.ok(Math.abs(data[o + 2] - 0.6) < 1e-6 && Math.abs(data[o + 3] - 0.8) < 1e-6, 'the blow direction, unit');
  assert.deepEqual([data[o + 4], data[o + 5], data[o + 6]], [100, 2, -50], 'the base pivot');
  mask.collapse(6, 10, 7, 0, 0, 0, 0, 0, true);
  assert.ok(data[6 * T] > 0 && 10 - data[6 * T] > COLLAPSE_S, 'a settled collapse is over already');
  mask.collapse(9999, 10, 7, 1, 0, 0, 0, 0);
  // holes: a ring of MAX_HOLES per structure, the count in B.w
  assert.equal(mask.addHole(5, 101, 3, -49, 1.25, 0, 2, 0.5), 0);
  assert.equal(mask.addHole(5, 99, 4, -51, 0.75, 1, 0, 0.4, 0.2), 1);
  assert.deepEqual([data[o + 8], data[o + 9], data[o + 10], data[o + 11]], [101, 3, -49, 1.25], 'hole 0: centre and radius');
  assert.deepEqual([data[o + 12], data[o + 13], data[o + 14], data[o + 15]], [0, 1, 0.5, 0.30000001192092896],
    'hole 0: the outward normal (unit), the depth into the wall, 0.3 m outside by default');
  assert.deepEqual([data[o + 16], data[o + 19], data[o + 22], data[o + 23]], [99, 0.75, 0.4000000059604645, 0.20000000298023224]);
  assert.equal(data[o + 7], 2, 'two holes counted');
  for (let i = 2; i < MAX_HOLES; i++) mask.addHole(5, 0, 0, 0, 0.7, 1, 0, 0.5);
  assert.equal(data[o + 7], MAX_HOLES, 'the count stops at the ring');
  assert.equal(mask.addHole(5, 1, 2, 3, 0.5, 1, 0, 0.5), 0, 'a fifth hole replaces the first (the ring)');
  assert.deepEqual([data[o + 8], data[o + 9], data[o + 10], data[o + 11]], [1, 2, 3, 0.5]);
  assert.equal(data[o + 7], MAX_HOLES);
  assert.equal(mask.addHole(7, 0, 0, 0, 0, 1, 0, 0.5), -1, 'a zero-radius hole is no hole');
  assert.equal(data[7 * T + 7], 0);
  mask.shiftTime(100);
  assert.equal(data[o], 110.5, 'the clock rebase moves the start');
  assert.equal(data[7 * T], 0, 'a standing structure stays 0 through a rebase');
  assert.equal(data[o + 8], 1, 'holes keep their world place through a rebase');
  // the patch chains the material's own hook and injects the read of aDamage (= structure index + 1)
  const material = new THREE.MeshStandardMaterial();
  let priorRan = false;
  material.onBeforeCompile = () => { priorRan = true; };
  mask.patch(material);
  mask.patch(material);
  const shader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <batching_vertex>\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n gl_FragColor = vec4(1.0);\n}' };
  material.onBeforeCompile(shader, null);
  assert.ok(priorRan, 'the world\'s own onBeforeCompile still runs');
  assert.ok(shader.uniforms.uStructMask && shader.uniforms.uStructClock, 'the mask uniforms join the program');
  assert.ok(/attribute float aDamage;/.test(shader.vertexShader) && /float tag = floor\( aDamage \+ 0\.5 \)/.test(shader.vertexShader)
    && /int sid = int\( stageRun \? tag - 32768\.0 : tag \) - 1;/.test(shader.vertexShader),
    'the vertex reads aDamage as structure index + 1 (0 untouched; +32768 a stage builder\'s own run)');
  assert.ok(/vStructHoles = stageRun \? 0\.0 : SB\.w;/.test(shader.vertexShader), 'no hole cuts a stage builder\'s own run');
  assert.equal(shader.vertexShader.match(/float tag = floor\( aDamage/g).length, 1, 'patched once');
  assert.ok(/USE_BATCHING[\s\S]*batchingMatrix[\s\S]*inverse\( mat3\( sw \) \)/.test(shader.vertexShader),
    'world space through the batching matrix, the displacement carried back');
  assert.ok(shader.vertexShader.indexOf('#include <batching_vertex>') < shader.vertexShader.indexOf('float tag = floor'),
    'the patch reads batchingMatrix after three defines it');
  assert.ok(/t >= 2\.40[\s\S]*transformed = \( inverse\( sw \) \* vec4\( SB\.xyz, 1\.0 \) \)\.xyz;/.test(shader.vertexShader),
    'a fallen structure folds onto its pivot (no discard for it)');
  // the phone tier cuts no holes: its fragment shader is left alone (no discard: its early depth and HSR stay)
  const phoneMask = createStructureMask(16, { holes: false });
  const pm = new THREE.MeshStandardMaterial();
  phoneMask.patch(pm);
  const pshader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n gl_FragColor = vec4(1.0);\n}' };
  pm.onBeforeCompile(pshader, null);
  assert.ok(!/discard/.test(pshader.fragmentShader) && /inverse\( sw \)/.test(pshader.vertexShader), 'the phone falls, uncut');
  assert.notEqual(pm.customProgramCacheKey(), material.customProgramCacheKey(), 'its own program');
  assert.ok(/vStructHoles > 0\.5[\s\S]*along < -hn\.z \|\| along > hn\.w[\s\S]*discard/.test(shader.fragmentShader),
    'a fragment inside a hole\'s cylinder (outside..depth along the face normal) is discarded');
  assert.ok(/flat varying float vStructSid;/.test(shader.vertexShader) && /flat varying float vStructSid;/.test(shader.fragmentShader),
    'the structure index reaches the fragment unblended');
  assert.ok(/fx-structure-mask/.test(material.customProgramCacheKey()), 'its own program cache key');
  // the world hands its shadow depth materials over as their own entries: they compile the same patch
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  mask.patch(depth);
  const dshader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <batching_vertex>\n#include <begin_vertex>\n#include <project_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n gl_FragColor = packDepthToRGBA( 0.5 );\n}' };
  depth.onBeforeCompile(dshader, null);
  assert.ok(/float tag = floor/.test(dshader.vertexShader) && /discard/.test(dshader.fragmentShader), 'the depth pass sinks and opens too');
  mask.reset();
  assert.equal(data[o], 0, 'reset stands every structure up');
}

// ---- 9. what a building's stage builders write, drawn in its own materials -----------------------------------
{
  for (const shape of DEBRIS_SHAPES) {
    const g = paletteGeometry(shape, 2);
    g.computeBoundingBox();
    const size = new THREE.Vector3();
    g.boundingBox.getSize(size);
    assert.ok(Math.max(size.x, size.y, size.z) > 0.3 && Math.max(size.x, size.y, size.z) < 1.6, `${shape}: about a metre`);
    assert.ok(g.getAttribute('normal'), `${shape}: lit`);
  }
  const a = paletteGeometry('brick', 1).getAttribute('position').array;
  const b = paletteGeometry('brick', 1).getAttribute('position').array;
  assert.deepEqual(Array.from(a), Array.from(b), 'the palette is seeded');
  let now = 0;
  const debris = createStructureDebris({ now: () => now, groundY: () => 0 });
  const brick = new THREE.MeshStandardMaterial({ name: 'bucket-brick' });
  const write = (settled) => {
    const out = debris.begin({ x: 100, y: 2, z: 50, yaw: Math.PI / 2 }, (bucket) => (bucket === 'stone' ? brick : null), 0.7, settled);
    assert.ok(out.mesh.begin('stone', 'rubble'));
    const v0 = out.mesh.vertex(1, 0, 0, 1, 0, 0, 0, 0, 0.5, 0.4, 0.3);
    const v1 = out.mesh.vertex(0, 1, 0, 0, 1, 0, 1, 0, 0.5, 0.4, 0.3);
    const v2 = out.mesh.vertex(0, 0, 1, 0, 0, 1, 0, 1, 0.5, 0.4, 0.3);
    out.mesh.triangle(v0, v1, v2);
    out.mesh.end();
    for (let i = 0; i < 5; i++) out.pieces.push('stone', 'brick', i, 0, 3, 0, 0, 0, 0, 1, 0.24, 0.07, 0.11, 0.6, 0.3, 0.2, 2, 4, 0);
    debris.commit();
    return out;
  };
  const out = write(false);
  assert.equal(out.pieces.count, 5, 'pieces are written');
  const st = debris.stats();
  assert.equal(st.meshes, 1, 'one run, one mesh');
  const mesh = debris.group.children.find((c) => c.isMesh && c.material === brick);
  assert.ok(mesh, "the run draws with the bucket's own material");
  assert.equal(mesh.visible, false, 'a collapse pile waits under the dust');
  const p = mesh.geometry.getAttribute('position');
  // body (1, 0, 0) at yaw 90 degrees: x' = x cos + z sin = 0, z' = -x sin + z cos = -1 -> world (100, 2, 49)
  assert.ok(Math.abs(p.getX(0) - 100) < 1e-5 && Math.abs(p.getY(0) - 2) < 1e-5 && Math.abs(p.getZ(0) - 49) < 1e-5,
    'body frame to world: rotateY(yaw) then the placement');
  now = 1;
  debris.update();
  assert.equal(mesh.visible, true, 'the pile shows once the fall has begun');
  assert.ok(debris.group.children.some((c) => c.name.startsWith('fx-structure-pieces') && c.visible), 'falling pieces draw');
  const settled = write(true);
  assert.equal(settled.pieces.count, 0, 'a settled stage drops no pieces');
  debris.reset();
  assert.equal(debris.stats().meshes, 0, 'reset removes the runs');
  // a standing building's stage runs carry its tag (they fall with it) and cast through its bucket's depth material
  const depthMat = new THREE.MeshDepthMaterial();
  const tagged = debris.begin({ x: 0, y: 0, z: 0, yaw: 0 }, () => brick, 0, false, { tag: 32768 + 6, depthFor: () => depthMat });
  tagged.mesh.begin('stone', 'rim');
  const t0 = tagged.mesh.vertex(0, 0, 0, 0, 0, 1, 0, 0, 1, 1, 1), t1 = tagged.mesh.vertex(1, 0, 0, 0, 0, 1, 1, 0, 1, 1, 1);
  const t2 = tagged.mesh.vertex(0, 1, 0, 0, 0, 1, 0, 1, 1, 1, 1);
  tagged.mesh.triangle(t0, t1, t2);
  tagged.mesh.end();
  debris.commit();
  const rim = debris.group.children.find((c) => c.isMesh && c.name === 'fx-structure-rim-stone');
  assert.ok(rim && rim.geometry.getAttribute('aDamage').array.every((v) => v === 32774), 'the rim carries its building\'s run tag');
  assert.equal(rim.customDepthMaterial, depthMat, 'its shadow falls with the building');
  debris.reset();
  // the phone tier throws fewer pieces (its static runs are the same world state)
  const phone = createStructureDebris({ now: () => now, groundY: () => 0, poolCapacity: 24, pieceCap: 3 });
  const po = phone.begin({ x: 0, y: 0, z: 0, yaw: 0 }, () => brick, 0, false);
  let thrown = 0;
  for (let i = 0; i < 6; i++) if (po.pieces.push('stone', 'brick', i, 0, 3, 0, 0, 0, 0, 1, 0.24, 0.07, 0.11, 0.6, 0.3, 0.2, 2, 4, 0)) thrown++;
  assert.equal(thrown, 3, 'the piece cap holds per stage');
  assert.equal(po.pieces.capacity, 3);
}

console.log('volumeMedia selftest: atlases, ledger, layout, bake determinism, pool sort and bounds, recipes, surfaces, chunks, structures, craters, structure mask, structure debris — ok');
