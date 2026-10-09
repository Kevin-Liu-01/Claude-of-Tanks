// volumeMedia.selftest.mjs — the destruction-fx media layer (2026-10-07): the committed atlases match their ledger and
// the runtime's layout, the bake is deterministic, the pool sorts back to front within its bounds, and the recipes
// draw only from the seeded stream (Studio resetSeed and frozen captures stay exact) and key on munition and surface.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { VOLUME_ATLAS, createVolumeMedia, makeVolumePuff, volumePositionAt } from './volumeMedia.ts';
import { createDebrisChunks, makeChunkPiece, CHUNK_SHAPES } from './debrisChunks.ts';
import { groundBurst, kineticStrike, muzzleBlast, killFireball, columnPuff, dustSurge, isExplosive, blastScale, craterEjecta,
  trackSkirt, exhaustPuff, armorHit, plateBurst, smolderPuff, fragmentStrike } from './blastRecipes.ts';
import { SURFACE_KINDS, SURFACE_LOOKS, classifyTerrain, surfaceForMaterial, linearHex } from './surfaceLooks.ts';
import { mulberry32 } from './particles.ts';
import { structureStageFx, propBreakFx, lookForStruckKind, breachBlowFor, lookFromAnatomy, wallStrike, sectionFallFx } from './structureFx.ts';
import { createCraterMarks, craterSoil, markKindFor } from './craterMarks.ts';
import { craterWobblePhases } from '../sim/terrainDeformation.ts';
import { createStructureMask, COLLAPSE_S, MAX_HOLES, STRUCT_STRIDE, collapseFront, collapseFrontTime } from './structureMask.ts';
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
  // round 7: a burst's light inside the medium: a ring of four slots on the fx clock, shifted with it, cleared on reset
  const gu = media.group.children[0].material.uniforms;
  assert.ok(gu.uGlowP.value.length === 4 && gu.uGlowK.value.length === 4, 'four glow slots');
  for (let i = 0; i < 5; i++) media.glow(i, 1, 2, 6, 0.9, 0.3, 0.05);
  assert.deepEqual(gu.uGlowP.value[0].toArray(), [4, 1, 2, now + 0.05], 'the fifth replaces the oldest, born on the fx clock');
  assert.deepEqual(gu.uGlowK.value[1].toArray(), [6, 0.9, 0.3, 0], 'radius, peak, duration');
  media.shiftTime(2);
  assert.equal(gu.uGlowP.value[0].w, now + 2.05, 'a glow shifts with the clock');
  media.glow(0, 0, 0, 0, 1, 1);
  assert.equal(gu.uGlowP.value[1].x, 1, 'a zero radius lights nothing');
  media.reset();
  assert.ok(gu.uGlowK.value.every((k) => k.y === 0) && gu.uGlowP.value.every((q) => q.w < -1e8), 'reset puts every glow out');
  assert.match(media.group.children[0].material.vertexShader, /uniform vec4 uGlowP\[ 4 \]/, 'the shader reads the slots');
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
      lightPulse: (x, y, z, k, delay, dur) => { log.pulses++; log.pulseK = k; log.pulseDur = dur; },
      glow: (x, y, z, r, peak, dur) => { log.glows = (log.glows || 0) + 1; log.glowR = r; log.glowDur = dur; },
      distBoost: () => 1, tier: 1,
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
  assert.ok(tos.log.media.filter((m) => m.heat > 1.4 && m.cool < 2).length >= 5, 'a thermobaric rocket rolls a long fireball');
  const maxSize = (log) => Math.max(...log.media.map((m) => m.size1));
  assert.ok(maxSize(big) > maxSize(a) * 1.4, 'the gunship howitzer throws a far bigger cloud than tank HE');
  assert.ok(a.flash > 0 && a.fire > 0 && a.pulses > 0, 'an explosive burst flashes, burns and lights the ground');
  // round 7 (wave 276: "the 1.2 kg FPV, the 3.4 kg ATGM and the 125 mm HE look nearly identical", thrown soil "a
  // vertical chain of separate brown balls", debris "flat unlit black squares", "a ring of haystack puffs", "a flat
  // orange glow wash for 800 ms"): each class its own birth, sized by its charge
  const peak = (m) => {
    const kd = Math.max(m.drag, 1e-3);
    let top = -Infinity;
    for (let t = 0; t <= m.life; t += 0.02) {
      top = Math.max(top, m.y + m.rise * t + (m.vy - m.rise) * (1 - Math.exp(-kd * t)) / kd + 0.5 * m.grav * t * t);
    }
    return top;
  };
  const fpvLog = fpv.log, atgmLog = atgm.log;
  const atgmUp = captureContext(6);
  groundBurst(atgmUp.ctx, { x: 0, y: 0, z: 0, munition: 'atgm', chargeKg: 3.4, surface: 'soil' });
  assert.ok((atgmUp.log.jets || 0) > 0 && (fpvLog.jets || 0) > 0, 'a shaped charge always draws its jet (the Studio passes no line)');
  // the fireball: the charge's width (~3.9 kg^0.32 m), smaller for a shaped charge
  const ball = (log) => Math.max(...log.media.filter((m) => m.medium === 'billow' && m.heat > 1).map((m) => m.size1));
  assert.ok(ball(fpvLog) < ball(atgmLog) && ball(atgmLog) < ball(a) && ball(big) > 1.6 * ball(a),
    `fireballs by charge: FPV ${ball(fpvLog).toFixed(1)} < ATGM ${ball(atgmLog).toFixed(1)} < HE ${ball(a).toFixed(1)} << 152 ${ball(big).toFixed(1)}`);
  assert.ok(ball(a) > 5 && ball(a) < 7.5 && ball(big) > 9.5, 'a 125 mm fireball ~6 m across, the 152 mm\'s ~10 m');
  // the flash lands on a 10 fps frame
  // the shaped charge's spike: many small unstretched puffs driven up a tight cone, standing well up; no earth fountain
  const spike = (log) => log.media.filter((m) => m.medium === 'burst' && m.grav < 0 && m.grav > -5);
  const fountain = (log) => log.media.filter((m) => m.medium === 'burst' && m.grav <= -9);
  for (const [name, log, n, top] of [['ATGM', atgmUp.log, 10, 8], ['FPV', fpvLog, 6, 5]]) {
    const sp = spike(log);
    assert.ok(sp.length >= n && sp.every((m) => m.aspect === 1), `${name}: a spike of ${sp.length} round puffs (no stretched cards)`);
    assert.ok(sp.every((m) => Math.hypot(m.vx, m.vz) <= Math.tan(0.1) * m.vy + 1e-6), `${name}: the spike is narrow`);
    assert.ok(Math.max(...sp.map(peak)) > top, `${name}: the spike stands past ${top} m (${Math.max(...sp.map(peak)).toFixed(1)})`);
    assert.equal(fountain(log).length, 0, `${name}: a shaped charge throws no earth fountain`);
  }
  // HE: a dense dark earth fountain in a cone, filled from the ground to its top by many small round puffs that arc
  // over and fall back; the heavy rounds' far taller and fuller
  for (const [name, log, n, top] of [['125 mm', a, 20, 7.5], ['152 mm', big, 30, 16]]) {
    const f = fountain(log);
    assert.ok(f.length >= n && f.every((m) => m.aspect === 1 && m.density >= 0.95), `${name}: a dense fountain of ${f.length} round puffs`);
    assert.ok(f.every((m) => Math.hypot(m.vx, m.vz) <= Math.tan(0.46) * m.vy + 1e-6), `${name}: in a cone`);
    // (round 7b, b8: still separate balls) its core: big puffs in a tight cone that overlap into one jet
    const core = f.filter((m) => Math.hypot(m.vx, m.vz) <= Math.tan(0.18) * m.vy + 1e-6 && m.size1 >= 2.4);
    assert.ok(core.length >= 10, `${name}: a dense core of ${core.length} big puffs in a ~10° cone`);
    const tops = f.map(peak);
    assert.ok(Math.min(...tops) < 0.45 * Math.max(...tops), `${name}: the fountain fills from the ground to its top`);
    assert.ok(Math.max(...tops) > top, `${name}: the fountain stands past ${top} m (${Math.max(...tops).toFixed(1)})`);
    assert.ok(f.every((m) => m.life <= 3), `${name}: its soil falls back into the cloud within ~2-3 s`);
    assert.ok(log.media.some((m) => m.grav === 0 && m.medium === 'burst' && m.aspect === 1 && m.y > 1 && m.life > 4),
      `${name}: fine dust stands in the column`);
  }
  assert.ok(fountain(big).length >= 1.4 * fountain(a).length, 'the 152 mm throws far more earth');
  assert.ok((big.rings || 0) > 0, 'and sends its shock ring over the ground');
  const ac = he(5, 'autocannon_he', 0.05, 'soil');
  assert.ok(Math.max(...fountain(ac).map(peak)) < 4, 'a 30 mm round\'s earth stays low');
  // the clods: many lumps of the ground, lit and in its colour (not coal), most back down within ~2 s, lying ~20 s
  const flight = (k) => 2 * Math.max(0, k.vy) / 9.8;
  for (const [name, log, n] of [['125 mm', a, 100], ['152 mm', big, 160], ['ATGM', atgmLog, 30]]) {
    const cl = log.chunk;
    assert.ok(cl.length >= n, `${name}: ${cl.length} clods`);
    assert.ok(cl.every((k) => k.life >= 14), `${name}: its clods lie where they land`);
    const lumC = cl.reduce((acc, k) => acc + 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b, 0) / cl.length;
    assert.ok(lumC > 0.05, `${name}: clods in the soil's lit colour (mean luminance ${lumC.toFixed(3)}), not coal`);
    const fl = cl.map(flight).sort((p, q) => p - q);
    assert.ok(fl[Math.floor(fl.length / 2)] < 2.2, `${name}: most fall back within ~2 s (median ${fl[Math.floor(fl.length / 2)].toFixed(2)} s)`);
  }
  // the ring: many low wide cards racing out, stalling and thinning within ~2-3 s (no old surge of mounds)
  for (const [name, log, n] of [['125 mm', a, 16], ['ATGM', atgmLog, 10]]) {
    const ring = log.media.filter((m) => m.aspect >= 2.8 && m.grav === 0);
    assert.ok(ring.length >= n, `${name}: a ring of ${ring.length} cards`);
    assert.ok(ring.every((m) => Math.hypot(m.vx, m.vz) >= 7 && m.drag >= 3 && m.density <= 0.5 && m.life <= 3.5),
      `${name}: it races out, stalls, and thins within ~3 s`);
    assert.ok(!log.media.some((m) => m.aspect >= 1.9 && m.aspect < 2.8 && m.life > 4), `${name}: no surge of mounds`);
  }
  // the light: on the ground ~0.2 s, far weaker on snow; inside the medium for a moment
  const snowGlow = he(5, 'he', 3.5, 'snow');
  assert.ok(a.pulseDur <= 0.35 && big.pulseDur <= 0.35 && atgmLog.pulseDur <= 0.35, `the ground light lasts ~0.2 s (${a.pulseDur})`);
  assert.ok(a.pulseK <= 0.7 && snowGlow.pulseK < 0.35 * a.pulseK, `the ground light: soil ${a.pulseK}, snow ${snowGlow.pulseK}`);
  assert.ok(a.glows >= 1 && a.glowDur <= 0.45 && a.glowR > 5, 'the burst glows inside its own medium for a moment');
  // no pale residue puff floating out of a soil burst (wave 276's "translucent blue-grey sphere"): its only cold smoke is
  // the column's own soil standing up the column (round 7c); a hard ground keeps a little pale smoke over it
  const lum0 = (m) => 0.2126 * m.r0 + 0.7152 * m.g0 + 0.0722 * m.b0;
  const coldSmoke = (log) => log.media.filter((m) => m.medium === 'billow' && m.heat === 0 && m.aspect < 1.3);
  assert.ok(coldSmoke(a).length >= 3 && coldSmoke(a).every((m) => m.y > 1.5 && lum0(m) < 0.12),
    "no pale residue over soil: its cold smoke is the column's soil, standing up the column");
  const conc = he(5, 'he', 3.5, 'concrete');
  assert.equal(coldSmoke(conc).length, coldSmoke(a).length + 1, 'concrete keeps a little pale smoke');
  // (round 7c, DVIDS 954922: the smoke climbs out of the fireball for seconds; b8a's stopped as a haystack on the ground)
  // the explosive's smoke: dark at birth, out of the cooling fireball, buoyant, the upper puffs faster, long-lived
  for (const [name, log, n] of [['125 mm', a, 6], ['152 mm', big, 9], ['ATGM', atgmLog, 4]]) {
    const sm = log.media.filter((m) => m.medium === 'billow' && m.heat > 0 && m.heat < 1 && m.rise >= 0.3 && m.life >= 5);
    assert.ok(sm.length >= n, `${name}: ${sm.length} puffs of the explosive's lasting smoke`);
    assert.ok(sm.every((m) => lum0(m) < 0.1 && m.vy > 1.5), `${name}: its smoke is dark and climbs`);
    assert.ok(Math.max(...sm.map((m) => m.rise)) > 1.3 * Math.min(...sm.map((m) => m.rise)), `${name}: its upper puffs climb faster`);
  }
  // (wave 293: "separate brown and blue-grey balls ... one lobed grey-brown cloud growing about eight-fold by +2 s") the
  // HE smoke swells most in its first seconds, and all its smoke ages to one colour
  {
    const sm = a.media.filter((m) => m.medium === 'billow' && m.heat > 0 && m.heat < 1 && m.life >= 5);
    const at = (m, t) => m.size0 + (m.size1 - m.size0) * (1 - Math.pow(1 - Math.min(1, t / m.life), m.growExp));
    assert.ok(sm.every((m) => at(m, 2) - m.size0 > 0.4 * (m.size1 - m.size0)), 'the smoke swells early');
    const aged = new Set([...sm, ...coldSmoke(a)].map((m) => [m.r1, m.g1, m.b1].map((v) => v.toFixed(4)).join()));
    assert.equal(aged.size, 1, 'every smoke puff ages to one grey-brown');
  }
  // (wave 293: "the ATGM column a man's width across that stops growing") its spike keeps swelling past 4 s
  for (const m of spike(atgmUp.log)) {
    const at = (t) => m.size0 + (m.size1 - m.size0) * (1 - Math.pow(1 - Math.min(1, t / m.life), m.growExp));
    assert.ok(m.life >= 5 && at(4.4) > 1.25 * at(1.4), 'the ATGM column keeps growing');
  }
  // the footprint dust is a low wide haze, never a mound: wider than tall, at most ~0.6 dense, not lifting off
  const haze = a.media.filter((m) => m.medium === 'billow' && m.aspect >= 1.3 && m.aspect < 1.9 && m.grav === 0);
  assert.ok(haze.length >= 7 && haze.every((m) => m.density <= 0.45 && m.rise <= 0.15), `a low haze of ${haze.length} wide puffs`);
  // (wave 293: "a tan haystack mound with a crisp rim") the soil's dark, in the soft-edged medium, gone within ~7 s
  assert.ok(haze.every((m) => lum0(m) < 0.12 && m.life <= 7), 'the footprint haze is a thin dark soil-coloured sheet');
  assert.ok(a.media.filter((m) => m.medium === 'burst' && m.aspect >= 1 && m.aspect < 1.5 && m.grav === 0 && m.life > 5)
    .every((m) => m.rise <= 0.25), 'the dust cloud does not lift off');
  assert.ok(atgmLog.media.some((m) => m.medium === 'billow' && m.r0 < 0.06 && m.heat < 1), 'a shaped charge is born in its own dark smoke');
  // the three signatures differ in kind, not only in size
  const sig = (log) => [spike(log).length > 0, fountain(log).length > 0, (log.rings || 0) > 0].join();
  assert.ok(new Set([sig(fpvLog), sig(a), sig(big)]).size === 3, `three signatures: FPV ${sig(fpvLog)}, HE ${sig(a)}, 152 ${sig(big)}`);
  // and its cloud keeps moving: no dust or residue flipbook holds its last frame for the rest of its life
  for (const m of [...a.media, ...big.media]) {
    if (m.heat === 0 && m.life > 3) assert.ok(m.playSeconds >= m.life * 0.8, 'a flipbook plays its whole life');
  }
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
  // (owner 2026-10-08: every effect on the media layer) a kinetic round on armour, past the caller's pop and sparks: a
  // penetration's dark spall jet along the plate's normal that stalls and drifts, the armour-dust ring in the plate's
  // plane, lit steel chips that fall and lie; a non-penetration's pale puff; ERA's dark blast and cassette fragments
  {
    const hit = (kind) => { const c = captureContext(11); armorHit(c.ctx, { x: 0, y: 1.5, z: 0, nx: 1, ny: 0, nz: 0, caliberMm: 120, kind }); return c.log; };
    const lumOf = (m) => 0.2126 * m.r0 + 0.7152 * m.g0 + 0.0722 * m.b0;
    const pen = hit('pen');
    const jet = pen.media.filter((m) => m.vx > 4 && Math.hypot(m.vy - 0.3, m.vz) <= Math.tan(0.25) * m.vx + 1e-6);
    assert.ok(jet.length >= 7 && jet.every((m) => lumOf(m) < 0.06 && m.drag >= 4 && m.life >= 1.5), `a penetration's dark spall jet (${jet.length})`);
    const ring = pen.media.filter((m) => Math.abs(m.vx) < 1.2 && Math.hypot(m.vy, m.vz) > 2);
    assert.equal(ring.length, 6, 'the armour-dust ring in the plate\'s plane');
    assert.ok(pen.chunk.length >= 6 && pen.chunk.every((k) => k.life >= 8 && k.vx > 0), 'lit steel chips thrown off the plate that lie');
    assert.ok(pen.chunk.filter((k) => k.heat > 0.5).length === 2, 'two of them hot');
    const non = hit('nonpen');
    assert.ok(non.media.length === 2 && non.media.every((m) => lumOf(m) > 0.1), 'a non-penetration\'s pale puff');
    assert.ok(hit('ricochet').media.length === 1 && hit('ricochet').chunk.length === 0, 'a ricochet\'s faint scuff');
    const era = hit('era');
    assert.ok(era.media.length === 4 && era.media.every((m) => lumOf(m) < 0.06), 'ERA\'s dark blast');
    assert.ok(era.chunk.length === 6 && era.chunk.some((k) => k.shape === 'brick'), 'and its cassette\'s fragments');
    assert.deepEqual(hit('pen'), hit('pen'), 'seeded: the same hit twice');
  }
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
  // wave 266: a fireball well past the hull's size, burnt out to soot fast; black soot rolling out after it; every
  // body churning for its whole life
  // (round 7b, wave m2: "no debris") the hull's hot fragments fly out of the fire and lie round the wreck
  const frags = kf.log.chunk.filter((k) => k.heat >= 0.85);
  assert.ok(frags.length >= 14 && frags.every((k) => k.life >= 16 && k.vy > 2), `the fire throws ${frags.length} hot fragments`);
  const fire = kf.log.media.filter((m) => m.heat > 1);
  assert.ok(fire.length >= 5 && Math.max(...fire.map((m) => m.size1)) >= 12, 'an ammo rack fireball outgrows the hull');
  assert.ok(fire.every((m) => m.cool >= 0.9), 'its glow is gone within a second or two (a long dull glow read brown)');
  assert.ok(fire.every((m) => m.heat <= 1.4), 'orange-yellow at the heart, never white (b5: heat ~2 saturated the ramp)');
  const soot = kf.log.media.filter((m) => m.heat < 1 && m.birthOffset > 0.15 && m.r0 < 0.1);
  assert.ok(soot.length >= 4, 'black soot rolls out of the fire after it');
  for (const m of kf.log.media.filter((q) => q.medium === 'billow')) {
    assert.ok(m.playSeconds >= m.life * 0.8, 'no kill or column body freezes on its last frame');
  }
  // (round 7b, wave m2: "engine smoke rising as straight chimney columns") an engine's exhaust: the hull's motion and the
  // gas's exit back off the deck, then the wind takes it (it bends), and it swells and tears apart within a few seconds
  {
    const ex = captureContext(31);
    exhaustPuff(ex.ctx, 0, 2, 0, 0, 8, 0, 1, 0.8, true, 0);
    const [e] = ex.log.media;
    assert.ok(e && e.medium === 'billow' && e.vz > 4 && e.vz < 8 && e.windK >= 1 && e.drag >= 1.4, 'it leaves with the hull, the wind takes it');
    assert.ok(e.size1 > e.size0 * 4 && e.life >= 2.4 && e.density <= 0.62, 'it swells and thins');
    const turb = captureContext(31);
    exhaustPuff(turb.ctx, 0, 2, 0, 0, 0, 0, 1, 0.5, false, 0);
    assert.ok(turb.log.media[0].density < 0.25 && turb.log.media[0].vz < 0, "a turbine's thin haze, blown back off the deck at rest");
  }
  // the media's own motion and silhouette: shear with height, eddies with age and size, a warped lookup (no clean round
  // ball), a white-yellow core in a sooty shell
  {
    const softU = { uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) },
      uCameraNear: { value: 0.5 }, uCameraFar: { value: 4000 } };
    const mat = createVolumeMedia({ soft: softU, now: () => 0, capacity: 16 }).group.children[0].material;
    assert.match(mat.vertexShader, /center\.xz \+= uWind\.xz \* \( max\( 0\.0, center\.y - aPB\.y \) \* 0\.030 \* age \* aDY\.z \);/, 'the wind shears a column over as it climbs');
    assert.match(mat.vertexShader, /\* \( 0\.050 \* size \* min\( age, 4\.0 \) \);/, 'eddies push a puff about by its size as it ages');
    assert.match(mat.fragmentShader, /vec2 warp = wn \* tileSize \* uWarpK \* \( 0\.5 \+ 0\.8 \* vT \);/, 'the lookup is warped: no clean round ball');
    assert.match(mat.fragmentShader, /float core = smoothstep\( 0\.3, 0\.85, tb \);/, 'a hot core inside a sooty shell');
    // the CPU twin carries the shear (the sort's depth)
    const rec = new Float32Array(32);
    rec[1] = 2; rec[5] = 4; rec[8] = 1; rec[9] = 1; rec[10] = 1;
    const out = [0, 0, 0];
    volumePositionAt(rec, 0, 2, 0, 5, out);
    assert.ok(out[0] > 2 * 5 * 1.0, `a risen puff drifts farther than the wind alone (${out[0].toFixed(2)})`);
  }
  // (wave 265's weathering critics: no dust behind moving tanks) a moving hull's skirt: low, wide, left behind, heavy on
  // sand, light on grass
  const skirt = (surface, k, intensity) => {
    const c = captureContext(21);
    for (let i = 0; i < 12; i++) trackSkirt(c.ctx, 0, 0, 0, 1, 0, intensity, surface, k, 0);
    return c.log.media;
  };
  const sand = skirt('sand', 1.6, 1), grass = skirt('soil', 0.55, 1), slow = skirt('soil', 0.55, 0.2);
  const mean = (list, f) => list.reduce((acc, m) => acc + f(m), 0) / list.length;
  assert.ok(sand.every((m) => m.aspect >= 1.8 && m.y < 0.7 && m.heat === 0 && m.vx <= 0.4), 'a skirt lies low and wide, left behind');
  assert.ok(mean(sand, (m) => m.density) > 1.8 * mean(grass, (m) => m.density) && mean(sand, (m) => m.size1) > mean(grass, (m) => m.size1),
    'sand throws a far heavier skirt than grass');
  assert.ok(mean(slow, (m) => m.size1) < mean(grass, (m) => m.size1) && mean(slow, (m) => m.life) < mean(grass, (m) => m.life),
    'a crawl raises less than a dash');
  // the column swells and pinches, ends ragged, and bends downwind (low drag: its bodies take the wind slowly)
  const colLog = captureContext(14);
  for (let i = 0; i < 40; i++) columnPuff(colLog.ctx, 0, 0, 0, 1, 1.3, 0);
  const cs = colLog.log.media.map((m) => m.size1), cl = colLog.log.media.map((m) => m.life);
  assert.ok(Math.max(...cs) / Math.min(...cs) > 1.8, 'column bodies of many sizes');
  assert.ok(Math.max(...cl) - Math.min(...cl) > 5, 'column bodies die at many heights');
  assert.ok(colLog.log.media.every((m) => m.drag < 0.45), 'column bodies take the wind slowly');
}

// (7e, wave 312's killcam) the killcam's ammunition cook-off is round 7c's to the last draw: the ground-burst rounds (7d)
// never reach the kill path. Its full record on one seeded stream, in the scene's order (the hull's fireball and its skirt
// of dust, an HE round bursting on the hull beside it, the column taking hold and burning on, the smoulder, the idling
// exhaust, fragments on a plate, a plain kill's fireball), is pinned to 7c's: a change to the kill path is a deliberate
// re-pin, never a ground-burst round's side effect.
{
  const calls = [];
  let draws = 0;
  const stream = mulberry32(5000);
  const rec = (kind) => (...a) => calls.push([kind, JSON.parse(JSON.stringify(a))]);
  const C = { ...captureContext(5000).ctx, rand: () => { draws++; return stream(); }, groundY: () => 3.019,
    media: rec('media'), chunk: rec('chunk'), flash: rec('flash'), fire: rec('fire'), sparks: rec('sparks'), jet: rec('jet'),
    shockRing: rec('ring'), lightPulse: rec('pulse'), glow: rec('glow') };
  const G = 3.019;
  killFireball(C, 190, G + 1.2, 390, true, 0);
  dustSurge(C, 190, G, 390, 0.65 * Math.cbrt(14), 'soil', 0);
  plateBurst(C, { x: 190.3, y: G + 1.2, z: 391.9, nx: 0, ny: 0.2, nz: 1, munition: 'he', chargeKg: 3.4, ground: 'soil', birthOffset: 0 });
  for (let i = 0; i < 3; i++) columnPuff(C, 190, G, 390, 1, 1.3, 0.7 + i * 0.45);
  columnPuff(C, 190, G, 390, 2, 1.3, 0);
  smolderPuff(C, 190, G + 1, 390, 0.7, 0);
  exhaustPuff(C, 187, G + 1.6, 390, 0, 0, 1, 0, 0.15, true, 0);
  fragmentStrike(C, 190, G + 1, 390, 1, 0, 0, 0);
  killFireball(C, 190, G + 1.2, 390, false, 0);
  const digest = createHash('sha256').update(JSON.stringify(calls)).digest('hex').slice(0, 16);
  assert.equal(`${calls.length} ${draws} ${digest}`, '131 1628 ff1a722a5e1070b2',
    "the killcam's recipes are round 7c's to the last draw (re-pin only for a deliberate change to the kill path)");
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
  // round 7 (wave 277: "the building is never seen to come down... the dust rises afterwards instead of coming out of
  // a falling structure", "cream rather than brick-tinged", "round balls and translucent blue-grey cards"): the walls
  // come down along the crumble front (~3.5 s), their pieces leave it as it passes, the dust is born from the fall
  const span = Math.max(base.hw, base.hd), H = base.topY - base.baseY;
  assert.ok(collapsed.media.filter((m) => m.y > base.baseY + 1).every((m) => m.size1 <= 0.6 * span),
    'nothing big above the base hides the falling walls (no ball, no column)');
  assert.ok(!collapsed.media.some((m) => m.life >= 12), 'no pall');
  // the pieces leave the front as it passes their height (a fall's weight: barely pushed, gravity does the rest)
  // (the front comes down from the eaves: 0.8 of the height without the anatomy)
  for (const k of collapsed.chunk) {
    const h = k.y - base.baseY;
    assert.ok(Math.abs(k.birthOffset - collapseFrontTime(h, 0.8 * H)) < 0.35, `a piece at ${h.toFixed(1)} m leaves with the front`);
    assert.ok(Math.hypot(k.vx, k.vz) <= 2 && k.life >= 16, 'falls rather than flies, and lies');
  }
  assert.ok(Math.max(...collapsed.chunk.map((k) => k.birthOffset)) > 2.5, 'the walls come down over seconds');
  assert.ok(Math.max(...collapsed.chunk.map((k) => k.y - base.baseY)) <= 0.8 * H + 1e-6, 'from the eaves down (the roof is the mask\'s)');
  // the base bursts as each band's pieces land: their births follow the front down
  const baseBursts = collapsed.media.filter((m) => m.y <= base.baseY + 0.5 && m.aspect >= 2);
  const births = baseBursts.map((m) => m.birthOffset).sort((p, q) => p - q);
  // (the top band's pieces need a second to fall the height: its burst is at ~2 s; the shed dust and the roof's are
  // earlier)
  assert.ok(births.length >= 8 && births[0] < 2.2 && births[births.length - 1] > 3,
    `the dust bursts out of the base through the fall (${births[0]?.toFixed(2)}..${births[births.length - 1]?.toFixed(2)} s)`);
  assert.ok(collapsed.media.some((m) => m.birthOffset >= 1 && (m.vy > 0.5 || m.rise > 0.3)), 'the pile\'s dust rises off it');
  // in the building's own colour: a brick house's dust leans red-brown, never cream (luminance under a pale stone's)
  const brick = { rubble: [{ material: 'brick', color: [0.26, 0.1, 0.06], share: 0.8 }, { material: 'plaster', color: [0.6, 0.57, 0.5], share: 0.2 }],
    interior: [0.02, 0.02, 0.02] };
  const brickFall = run('collapsed', {}, brick);
  for (const m of brickFall.media) {
    assert.ok(m.r1 > m.b1 * 1.25, 'brick-tinted dust');
    assert.ok(0.2126 * m.r1 + 0.7152 * m.g1 + 0.0722 * m.b1 <= 0.341, 'never cream');
  }
  // after the P2 cascade (sections on) only the settling dust: a low burst round the base and a little off the pile
  const cascade = run('collapsed', { sections: true });
  assert.ok(cascade.media.length > 0 && cascade.media.length < collapsed.media.length / 3 && cascade.chunk.length === 0,
    `the remains settle in their dust (${cascade.media.length} puffs)`);
  assert.ok(cascade.media.every((m) => m.birthOffset < 0.6 && m.y <= base.baseY + 1), 'at once, low');
  // a seamed building's pieces are the stages' own (in its buckets): the fx throws none of its own then
  const seamed = captureContext(11);
  structureStageFx(seamed.ctx, { ...base, stage: 'collapsed' }, null, true);
  assert.equal(seamed.log.chunk.length, 0, 'the stages throw a seamed building\'s pieces');
  // the front itself: from the top at FRONT_T0 down to the base, gravity-eased, and its inverse
  assert.ok(collapseFront(0, 7) === 7 && collapseFront(10, 7) === 0 && collapseFront(2, 7) > collapseFront(3, 7));
  for (const h of [0.5, 3, 6.5]) assert.ok(Math.abs(collapseFront(collapseFrontTime(h, 7), 7) - h) < 1e-9, 'the front time inverts the front');
  assert.ok(breached.media.every((m) => m.life <= 6 && m.density <= 0.5), "a breach's powder thins within seconds");
  // a shell bursting on a wall burns and smokes as a ground burst does; its dust thins within seconds; a kinetic strike
  // only chips
  const strike = (explosive) => {
    const c = captureContext(13);
    wallStrike(c.ctx, 12, 3, 20, -1, 0, 0, explosive, explosive ? 2.71 : 1, null);
    return c.log;
  };
  // P2: a section's fall throws its dust (a panel's sheet and its foot, the roof's up and out, a storey's skirt); a hole
  // or a settled fall throws none
  const fallOf = (extra) => {
    const c = captureContext(17);
    sectionFallFx(c.ctx, { structureId: 3, section: 0, sectionKind: 'wall', y0: 0, y1: 3, hole: 255, x: 12, y: 1.5, z: 20,
      nx: 1, ny: 0, nz: 0, radiusM: 0, munition: 'he', sectionDown: true, ...extra }, null);
    return c.log.media;
  };
  assert.ok(fallOf({}).length > 0 && fallOf({}).every((m) => m.heat === 0), 'a panel falls in its dust');
  assert.ok(fallOf({}).every((m) => m.r1 > m.b1 * 1.2), "in the building's own colour (the fallback's brick), never cream");
  assert.ok(fallOf({ storeyDown: true, cx: 10, cz: 20, hw: 5, hd: 4 }).length > fallOf({}).length, 'a storey brings more down');
  assert.ok(fallOf({ sectionKind: 'roof', y0: 6, y1: 8.4 }).length > 0, 'the roof\'s dust goes up and out');
  assert.equal(fallOf({ sectionDown: false }).length + fallOf({ settled: true }).length, 0, 'a hole or a settled fall throws no dust');
  const shellOnWall = strike(true), shotOnWall = strike(false);
  assert.ok(shellOnWall.media.some((m) => m.heat > 1) && shellOnWall.media.some((m) => m.heat === 0 && m.medium === 'billow'),
    'a shell on a wall throws its fireball and its smoke');
  // (round 7, wave 277: a grey ball hid the house as it came down) the strike's cloud fans along the face and up, in
  // the wall's dust, thinner
  assert.ok(shellOnWall.media.filter((m) => m.medium === 'burst').every((m) => m.density <= 0.6 && m.size1 <= 3.2 * 2.71),
    'the strike\'s dust is thinner and smaller');
  assert.ok(shellOnWall.media.filter((m) => m.medium === 'billow' && m.heat === 0).length === 1, 'one smoke puff, not a ball');
  assert.ok(shellOnWall.media.filter((m) => m.medium === 'burst').every((m) => m.life <= 6), "the wall's dust thins within seconds");
  assert.ok(shotOnWall.media.every((m) => m.heat === 0) && shotOnWall.flash === 0, 'a kinetic strike only chips');
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
  // (wave 273: near-black stamped ovals; a clean dark oval in snow) the surface weathers with age, its blanket is
  // pocked with clods and secondary craters, and snow's blanket is dirty snow sprayed with soil
  const fragSrc = craters.mesh.material.fragmentShader;
  assert.match(fragSrc, /float fresh = 1\.0 - smoothstep\( 20\.0, 300\.0, age \);/, 'soot weathers away and the soil dries with age');
  assert.match(fragSrc, /float pock = apronT \* step\( 0\.8, cellH \)/, 'clods punched into the apron');
  assert.match(fragSrc, /vec3 dirty = vec3\( 0\.46, 0\.47, 0\.49 \);/, 'snow shows dirty snow and soil spray');
  // round 7 (wave 276): no bullseye (every zone's radius warped by noise), an apron of thrown soil to ~2.2 R heavier where
  // the core's rim stands higher (its break formula), torn turf, a scorch halo; a shaped charge's scar, not a bowl
  assert.match(fragSrc, /float qw = q \* \( 1\.0 \+ 0\.3 \* \( fbm\( vDisc \* 3\.3/, 'the zones are no clean circles');
  assert.match(fragSrc, /brk = 1\.0 \+ 0\.45 \* \( 0\.5 \* sin\( 2\.0 \* ang \+ vShape\.y \) \+ 0\.3 \* sin\( 4\.0 \* ang \+ vShape\.z \) \+ 0\.2 \* sin\( 6\.0 \* ang \+ vShape\.x \) \);/,
    "the apron follows the core's rim break");
  assert.match(fragSrc, /float apronQ = min\( 2\.25,/, 'the apron reaches ~2.2 R, inside the disc');
  assert.match(fragSrc, /float turf = step\( 0\.74, th \)/, 'torn turf on a vegetated apron');
  assert.match(fragSrc, /if \( scar \) \{[\s\S]*float star = fbm\( vec2\( ang \* 9\.0, 1\.3 \) \+ so \);/, "a shaped charge's star of soot");
  assert.deepEqual(['atgm', 'heat', 'drone_fpv', 'hesh', 'he', 'howitzer'].map((m) => markKindFor(m, true)),
    ['scar', 'scar', 'scar', 'hesh', 'he', 'he'], 'the mark is the munition\'s');
  assert.equal(markKindFor('kinetic', false), 'gouge');
  assert.equal(craters.mesh.visible, false, 'no crater, no draw');
  for (let i = 0; i < 120; i++) craters.stamp(i, 0, 1.6, 'soil', true, (i % 7) / 7, 0, () => 0);
  assert.equal(craters.count, 96, 'the marks ring keeps the latest 96');
  {
    // the kind and the rim's metres reach every vertex of the slot (the next mark slot: 120 % 96)
    craters.stamp(0, 0, 0.8, 'soil', 'scar', 0.3, 0, () => 0);
    const gI = craters.mesh.geometry.getAttribute('aInfo').array, gS = craters.mesh.geometry.getAttribute('aSize').array;
    const slotV = (160 + (120 % 96)) * (1 + 28 * 6);
    assert.ok(gI[slotV * 4 + 2] === 2 && Math.abs(gS[slotV] - 0.8) < 1e-6, `a scar, 0.8 m (${gI[slotV * 4 + 2]}, ${gS[slotV]})`);
  }
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
  assert.ok(Math.abs(S[3] - 1 / 2.4) < 1e-6, 'the rim at 1/2.4 of the disc (round 7: its apron reaches ~2.2 R)');
  assert.ok(Math.abs(P[1] - (bowl(10, 20) + 0.05)) < 1e-5, 'the centre lies in the bowl');
  // a vertex on the outer ring sits at disc (cos a, sin a) * 2.4 R, unrotated
  const v = 1 + 5 * 28 + 7, a = (7 / 28) * Math.PI * 2;
  assert.ok(Math.abs(P[v * 3] - (10 + Math.cos(a) * 1.7 * 2.4)) < 1e-4 && Math.abs(P[v * 3 + 2] - (20 + Math.sin(a) * 1.7 * 2.4)) < 1e-4
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
  // (round 7, wave 276: its rim ring of dust cards read as "haystack puffs") the burst's own ring is the one ring; the
  // clods lie where they land ~20 s and settle in
  assert.equal(ej.log.media.length, 0, 'no second ring of dust off the rim');
  assert.ok(ej.log.chunk.every((k) => k.life >= 16), 'the clods lie on the apron');
}

// ---- 8. buildings coming down in their own geometry (the mask the world's bucket materials read) ---------------
{
  const mask = createStructureMask(64);
  const data = mask.texture.image.data;
  const T = STRUCT_STRIDE * 4; // eleven texels per structure
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
  assert.ok(new RegExp(`t >= ${COLLAPSE_S.toFixed(2).replace('.', '\\.')}[\\s\\S]*transformed = \\( inverse\\( sw \\) \\* vec4\\( SB\\.xyz, 1\\.0 \\) \\)\\.xyz;`).test(shader.vertexShader),
    'a fallen structure folds onto its pivot (no discard for it)');
  // round 7 (wave 277): the roof drops and rides the crumble front; the desktop cuts the walls above the ragged front
  // (the phone folds them onto it)
  assert.ok(/float front = eave \* \( 1\.0 - pow\( u, 1\.5 \) \);/.test(shader.vertexShader)
    // (dcore 2026-10-09: the wreck settles into the heap as the front reaches the base: a term in u², the front's progress)
    && /p\.y = max\( p\.y - drop, front \+ \( p\.y - eave \) \* 0\.[0-9]+( \* \( 1\.0 - u \* u \))?( - [0-9.]+ \* u \* u)? \);/.test(shader.vertexShader),
    'the roof rides the front down');
  assert.ok(/vStructFront < 1e8 && vStructRoof < 0\.\d+ \)[\s\S]*vStructPos\.y > vStructFront \+ 1\.1 \* col \+ 0\.45 \* cell[\s\S]*discard/.test(shader.fragmentShader),
    'the desktop cuts the wall above the ragged front');
  // the phone tier cuts no holes: its fragment shader is left alone (no discard: its early depth and HSR stay)
  const phoneMask = createStructureMask(16, { holes: false });
  const pm = new THREE.MeshStandardMaterial();
  phoneMask.patch(pm);
  const pshader = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
    fragmentShader: '#include <common>\nvoid main() {\n gl_FragColor = vec4(1.0);\n}' };
  pm.onBeforeCompile(pshader, null);
  assert.ok(!/discard/.test(pshader.fragmentShader) && /inverse\( sw \)/.test(pshader.vertexShader), 'the phone falls, uncut');
  assert.ok(/else if \( p\.y > front \) \{[\s\S]*p\.y = front;/.test(pshader.vertexShader), 'the phone folds its walls onto the front');
  assert.notEqual(pm.customProgramCacheKey(), material.customProgramCacheKey(), 'its own program');
  assert.ok(/vStructHoles > 0\.5[\s\S]*along < -hn\.z \|\| along > outside[\s\S]*discard/.test(shader.fragmentShader)
    && /float thx = dot\( lateral\.xz, vec2\( hn\.y, -hn\.x \) \);[\s\S]*float th = abs\( lateral\.y \) \+ abs\( thx \) > 1e-6 \? atan\( lateral\.y, thx \) : 0\.0;/.test(shader.fragmentShader)
    && /fxCrack = max\( fxCrack,/.test(shader.fragmentShader),
    'a fragment inside a hole\'s cylinder (outside..depth along the face normal) is discarded');
  // the cracks darken the surface's own colour at the end of its program (where three dithers it; a depth program has none)
  {
    const lit = new THREE.MeshStandardMaterial();
    mask.patch(lit);
    const ls = { uniforms: {}, vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main() {\n gl_FragColor = vec4(1.0);\n#include <dithering_fragment>\n}' };
    lit.onBeforeCompile(ls, null);
    assert.ok(/gl_FragColor\.rgb \*= 1\.0 - 0\.8 \* clamp\( fxCrack, 0\.0, 1\.0 \);\n#include <dithering_fragment>/.test(ls.fragmentShader), 'cracks darken the face');
  }
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
  // a whole upload is never cut short by a range written before the renderer gets to it (round 4: a reset, then a
  // breach in the same frame, and the GPU kept the last scene's fallen house)
  mask.addHole(5, 1, 2, 3, 0.5, 1, 0, 0.5);
  assert.equal(mask.texture.updateRanges.length, 0, 'after a reset the next upload is the whole texture');
  mask.texture.onUpdate(mask.texture);
  mask.addHole(5, 1, 2, 3, 0.5, 1, 0, 0.5);
  assert.ok(mask.texture.updateRanges.length > 0, 'once uploaded, events upload their own ranges again');
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

// (2026-10-08, the owner's "black screens" on preview 4) one bad pixel never becomes a black frame: every effect shader
// writes finite colour only, the late composite and the bloom prefilter pass finite values, the media thin as the camera
// enters them (judged from a puff's centre against its size), and three's point falloff floors at 0.25 m
{
  const media = await readFile(new URL('./volumeMedia.ts', import.meta.url), 'utf8');
  assert.match(media, /float near = smoothstep\( uNearFade\.x \+ 0\.25 \* size, uNearFade\.y \+ 0\.6 \* size, distance\( center, cameraPosition \) \);/,
    'a big puff thins as the camera enters it (no flat dark card over the frame)');
  for (const [file, re] of [['./volumeMedia.ts', /col = min\( col, vec3\( 4096\.0 \) \);\n\s*if \( !\( abs\( col\.r \) < 6\.0e4/],
    ['./debrisChunks.ts', /if \( !\( abs\( col\.r \) < 6\.0e4 && abs\( col\.g \) < 6\.0e4 && abs\( col\.b \) < 6\.0e4 \) \) discard;/],
    ['./structureDebris.ts', /if \( !\( abs\( col\.r \) < 6\.0e4 && abs\( col\.g \) < 6\.0e4 && abs\( col\.b \) < 6\.0e4 \) \) discard;/],
    ['./craterMarks.ts', /float ang = r > 1e-5 \? atan\( vDisc\.y, vDisc\.x \) : 0\.0;[\s\S]*if \( !\( abs\( col\.r \) < 6\.0e4/]]) {
    assert.match(await readFile(new URL(file, import.meta.url), 'utf8'), re, `${file}: finite colour only`);
  }
  const post = await readFile(new URL('../engine/post.ts', import.meta.url), 'utf8');
  assert.match(post, /fragmentShader: LATE_FX_FINITE_COPY_FRAGMENT,/, 'the late composite copies finite values only');
  assert.match(post, /vec3 bloomIn = vec3\( abs\( texel\.r \) < 6\.0e4 \? texel\.r : 0\.0,/, 'the bloom prefilter takes finite values only');
  const rend = await readFile(new URL('../engine/renderer.ts', import.meta.url), 'utf8');
  assert.match(rend, /limitPointLightFalloff\(\);\n\s*renderer\.domElement\.addEventListener\('webglcontextlost'/, 'the falloff floor is set when the renderer is made');
  assert.match(rend, /'max\( pow\( lightDistance, decayExponent \), 0\.0625 \)'/, 'at 0.25 m (16x, not 100x)');
  const three = await import('three');
  assert.match(three.ShaderChunk.lights_pars_begin, /max\( pow\( lightDistance, decayExponent \), 0\.01 \)/, "three's own floor is the one replaced");
}
console.log('volumeMedia selftest: atlases, ledger, layout, bake determinism, pool sort and bounds, recipes, surfaces, chunks, structures, craters, structure mask, structure debris — ok');
