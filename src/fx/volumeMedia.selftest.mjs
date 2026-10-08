// volumeMedia.selftest.mjs — the destruction-fx media layer (2026-10-07): the committed atlases match their ledger and
// the runtime's layout, the bake is deterministic, the pool sorts back to front within its bounds, and the recipes
// draw only from the seeded stream (Studio resetSeed and frozen captures stay exact) and key on munition and surface.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { VOLUME_ATLAS, createVolumeMedia, makeVolumePuff, volumePositionAt } from './volumeMedia.ts';
import { createDebrisChunks, makeChunkPiece, CHUNK_SHAPES } from './debrisChunks.ts';
import { groundBurst, kineticStrike, muzzleBlast, killFireball, columnPuff, dustSurge, isExplosive, blastScale } from './blastRecipes.ts';
import { SURFACE_KINDS, SURFACE_LOOKS, classifyTerrain, surfaceForMaterial, linearHex } from './surfaceLooks.ts';
import { mulberry32 } from './particles.ts';
import { structureStageFx } from './structureFx.ts';
import { createCraterMarks } from './craterMarks.ts';
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
}
{
  const craters = createCraterMarks();
  assert.equal(craters.count, 0);
  assert.equal(craters.mesh.visible, false, 'no crater, no draw');
  for (let i = 0; i < 120; i++) craters.stamp(i, 0, 1.6, 'soil', true, (i % 7) / 7, 0, () => 0);
  assert.equal(craters.count, 96, 'the crater ring keeps the latest 96');
  assert.ok(craters.mesh.geometry.drawRange.count > 0, 'craters draw');
  craters.reset();
  assert.equal(craters.count, 0);
  assert.equal(craters.mesh.geometry.drawRange.count, 0, 'reset clears the marks');
}

console.log('volumeMedia selftest: atlases, ledger, layout, bake determinism, pool sort and bounds, recipes, surfaces, chunks, structures, craters — ok');
