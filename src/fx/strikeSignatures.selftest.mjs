// strikeSignatures.selftest.mjs — (FX lane, 2026-10-15; the owner's FX-05: "more variety of explosions ... esp from like
// the ac 130 and drones and missiles") the gunship's howitzer, a drone's warhead and a tandem ATGM each read apart from a
// tank's HE and from each other in what the eye takes first: the flash's shape, what the burst throws, its smoke and the
// mark it leaves. Seeded: the same seed draws the same burst; no Math.random in the recipes.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groundBurst, plateBurst, TANDEM_DELAY_S } from './blastRecipes.ts';
import { markKindFor } from './craterMarks.ts';
import { makeVolumePuff } from './volumeMedia.ts';
import { makeChunkPiece } from './debrisChunks.ts';
import { mulberry32 } from './particles.ts';

function capture(seed) {
  const log = { media: [], chunk: [], flash: [], fire: [], sparks: [], jets: 0, rings: 0 };
  const ctx = {
    rand: mulberry32(seed), groundY: () => 0,
    media: (p) => log.media.push({ ...p }),
    chunk: (k) => log.chunk.push({ ...k }),
    flash: (o) => log.flash.push(structuredClone(o)), fire: (o) => log.fire.push(structuredClone(o)),
    sparks: (o) => log.sparks.push(structuredClone(o)),
    jet: () => { log.jets++; }, shockRing: () => { log.rings++; },
    lightPulse: () => {}, glow: () => {}, distBoost: () => 1, tier: 1,
    m: makeVolumePuff(), k: makeChunkPiece(),
    lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
    ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
    lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 },
  };
  return { ctx, log };
}
const burst = (munition, chargeKg, extra = {}, seed = 11) => {
  const c = capture(seed);
  groundBurst(c.ctx, { x: 0, y: 0, z: 0, munition, chargeKg, surface: 'soil', ...extra });
  return c.log;
};
const plate = (munition, chargeKg, seed = 11) => {
  const c = capture(seed);
  plateBurst(c.ctx, { x: 0, y: 1.5, z: 0, nx: 1, ny: 0, nz: 0, munition, chargeKg, ground: null });
  return c.log;
};
const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const isCol = (c, ref) => Math.abs(c[0] - ref[0]) + Math.abs(c[1] - ref[1]) + Math.abs(c[2] - ref[2]) < 1e-6;
const MOLTEN = [1, 0.6, 0.28], LITHIUM = [1, 0.93, 0.78], FRAG_HOT = [1, 0.72, 0.42];

const he = burst('he', 3.5);
const gun = burst('howitzer', 20, { dx: 0.2, dy: -0.97, dz: 0.1 });
const fpv = burst('drone_fpv', 1.2);
const atgm = burst('atgm', 3.4, { dx: 1, dy: -0.3, dz: 0 });
const heat = burst('heat', 3.4, { dx: 1, dy: -0.3, dz: 0 });

// ---- determinism ----------------------------------------------------------------------------------------------------
assert.deepEqual(burst('howitzer', 20, { dx: 0.2, dy: -0.97, dz: 0.1 }), gun, 'same seed, same gunship burst');
assert.deepEqual(burst('drone_fpv', 1.2), fpv, 'same seed, same drone burst');
assert.deepEqual(burst('atgm', 3.4, { dx: 1, dy: -0.3, dz: 0 }), atgm, 'same seed, same ATGM burst');
const src = await readFile(new URL('./blastRecipes.ts', import.meta.url), 'utf8');
assert.doesNotMatch(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /Math\.random/, 'the recipes draw only the seeded stream');

// ---- the flash's shape ------------------------------------------------------------------------------------------------
// the gunship: a starburst racing out flat along the ground (a ring of fast, low flash puffs); HE has none
const ring = (log) => log.flash.filter((f) => Math.hypot(f.vel[0], f.vel[2]) > 20 && Math.abs(f.vel[1]) < 1 && f.pos[1] < 4);
assert.ok(ring(gun).length >= 8, `the gunship's starburst: ${ring(gun).length} flash puffs racing out along the ground`);
const ringAngles = ring(gun).map((f) => Math.atan2(f.vel[2], f.vel[0])).sort((a, b) => a - b);
assert.ok(Math.max(...ringAngles.map((a, i) => (i ? a - ringAngles[i - 1] : a + 2 * Math.PI - ringAngles.at(-1)))) < 1.4,
  'all round the strike');
for (const [name, log] of [['HE', he], ['drone', fpv], ['ATGM', atgm]]) assert.equal(ring(log).length, 0, `${name}: no ground starburst`);
// the tandem ATGM: two flashes a beat apart, the precursor smaller
const flashTimes = (log) => [...new Set(log.flash.map((f) => +f.birthOffset.toFixed(3)))].sort((a, b) => a - b);
assert.deepEqual(flashTimes(atgm), [0, TANDEM_DELAY_S], `the tandem's two flashes, ${TANDEM_DELAY_S * 1000} ms apart`);
assert.ok(atgm.flash[0].size1 < atgm.flash[1].size1, 'the precursor smaller than the main charge');
for (const [name, log] of [['HE', he], ['HEAT', heat], ['drone', fpv]]) assert.equal(flashTimes(log).length, 1, `${name}: one flash`);
assert.ok(TANDEM_DELAY_S >= 1 / 30 && TANDEM_DELAY_S <= 0.1, 'two frames or more apart at 60 Hz, one beat to the eye');
// the drone: a small pop (its flash the smallest)
const flashSize = (log) => Math.max(...log.flash.map((f) => f.size1));
assert.ok(flashSize(fpv) < flashSize(atgm) && flashSize(fpv) < flashSize(he), 'the drone\'s pop is the smallest flash');

// ---- what it throws ---------------------------------------------------------------------------------------------------
// the gunship: the casing's fragments streak out near the horizontal, hot; soil thrown out in low rays
const frags = gun.sparks.filter((sp) => isCol(sp.col, FRAG_HOT));
assert.ok(frags.length >= 40, `the gunship shell's ${frags.length} casing fragments`);
const flat = frags.filter((sp) => Math.abs(sp.vel[1]) < 0.5 * Math.hypot(sp.vel[0], sp.vel[2])).length / frags.length;
assert.ok(flat > 0.6, `most fly out near the horizontal (${(flat * 100).toFixed(0)} %)`);
const rays = (log) => log.media.filter((m) => m.medium === 'burst' && m.grav <= -9 && m.vy < 0.5 * Math.hypot(m.vx, m.vz) + 2.5
  && Math.hypot(m.vx, m.vz) > 10);
assert.ok(rays(gun).length >= 24, `the gunship's low radial rays of soil (${rays(gun).length} puffs)`);
assert.ok(rays(he).length < rays(gun).length / 3, 'HE throws its earth up a cone, not out in rays');
// the drone: its frame's carbon pieces (two motors glowing), its battery crackling white for most of a second
const carbon = fpv.chunk.filter((k) => k.r < 0.05 && k.g < 0.05 && k.b < 0.05 && (k.shape === 'sheet' || k.shape === 'splinter'));
assert.ok(carbon.length >= 8, `the drone's frame: ${carbon.length} carbon pieces`);
assert.ok(carbon.filter((k) => k.heat > 0.5).length >= 2, 'two motors thrown glowing');
const crackle = fpv.fire.filter((f) => isCol(f.col0, LITHIUM));
assert.ok(crackle.length >= 8 && Math.max(...crackle.map((f) => f.birthOffset)) > 0.5 && crackle.every((f) => f.size1 < 0.8),
  'the battery\'s cells burn in a crackle of small white fires past half a second');
assert.ok(fpv.sparks.filter((sp) => isCol(sp.col, LITHIUM)).length >= 15, 'and white sparks');
for (const [name, log] of [['HE', he], ['ATGM', atgm], ['gunship', gun]]) {
  assert.equal(log.fire.filter((f) => isCol(f.col0, LITHIUM)).length, 0, `${name}: no battery fire`);
}
// the tandem ATGM: the molten liner splashing back out of its hole, its airframe's fins and motor tube thrown back
const liner = atgm.sparks.filter((sp) => isCol(sp.col, MOLTEN));
assert.ok(liner.length >= 26, `the ATGM's molten liner (${liner.length} sparks)`);
assert.ok(atgm.chunk.filter((k) => k.shape === 'sheet' && k.g / k.r > 1.02 && k.g < 0.1).length >= 4, 'its fins thrown');
assert.ok(atgm.chunk.some((k) => k.shape === 'stone' && k.heat > 0.4), 'its motor tube, hot');
// the liner splashes back up the line it came in on (the round arrived along +x: back is -x)
assert.ok(liner.filter((sp) => sp.vel[0] < 0).length / liner.length > 0.75, 'back up its line');
assert.equal(heat.sparks.filter((sp) => isCol(sp.col, MOLTEN)).length, 0, 'a gun\'s HEAT round is no missile: no airframe, no tandem');

// ---- its smoke ----------------------------------------------------------------------------------------------------
// the gunship: a cap rolling out at the column's top, late; HE none
const cap = (log) => log.media.filter((m) => m.medium === 'billow' && m.y > 12 && m.birthOffset >= 0.75);
assert.ok(cap(gun).length >= 4 && cap(gun).every((m) => Math.hypot(m.vx, m.vz) > 2 * m.vy), `the gunship's cap rolls out (${cap(gun).length})`);
assert.equal(cap(he).length, 0, 'HE has no cap');
// the drone's puff and the ATGM's column are paler than a gun's shaped charge's (HEAT) and HE's dark smoke
const smokeLum = (log) => {
  const s = log.media.filter((m) => m.medium === 'burst' && m.grav < 0 && m.grav > -5);
  return s.reduce((a, m) => a + lum([m.r0, m.g0, m.b0]), 0) / Math.max(1, s.length);
};
assert.ok(smokeLum(fpv) > smokeLum(heat) * 1.25, `the drone's puff paler than HEAT's (${smokeLum(fpv).toFixed(3)} vs ${smokeLum(heat).toFixed(3)})`);
assert.ok(smokeLum(atgm) > smokeLum(heat) * 1.25, `the ATGM's column cleaner than HEAT's (${smokeLum(atgm).toFixed(3)} vs ${smokeLum(heat).toFixed(3)})`);
// the drone's cells' pale low smoke
assert.ok(fpv.media.filter((m) => m.medium === 'billow' && Math.abs(m.r0 - 0.5) < 1e-6 && m.density <= 0.4).length === 3,
  'the battery\'s pale smoke');

// ---- on a hull ---------------------------------------------------------------------------------------------------------
{
  const pAtgm = plate('atgm', 1.7), pFpv = plate('drone_fpv', 0.6), pGun = plate('howitzer', 20), pHe = plate('he', 3.5);
  assert.deepEqual(flashTimes(pAtgm), [0, TANDEM_DELAY_S], 'a tandem on armour flashes twice');
  assert.ok(pAtgm.sparks.filter((sp) => isCol(sp.col, MOLTEN)).length >= 26 && pAtgm.chunk.length >= 5, 'its liner and airframe');
  assert.ok(pFpv.fire.filter((f) => isCol(f.col0, LITHIUM)).length >= 8 && pFpv.chunk.length >= 10, "a drone on a hull: its battery burns, its frame thrown");
  assert.ok(pGun.sparks.filter((sp) => isCol(sp.col, FRAG_HOT)).length >= 30, 'the heavy shell\'s fragments off a hull');
  assert.equal(flashTimes(pHe).length, 1, 'HE on armour: one flash');
  assert.equal(pHe.sparks.filter((sp) => !isCol(sp.col, [1, 0.78, 0.45])).length, 0, 'HE on armour: its sparks only');
}

// ---- the mark ---------------------------------------------------------------------------------------------------------
assert.deepEqual(['he', 'howitzer', 'missile', 'drone_fpv', 'atgm', 'heat', 'hesh'].map((m) => markKindFor(m, true)),
  ['he', 'rayed', 'rayed', 'drone', 'scar', 'scar', 'hesh'], "each weapon's own mark");
{
  const marks = await readFile(new URL('./craterMarks.ts', import.meta.url), 'utf8');
  assert.match(marks, /bool rayed = kind > 3\.5 && kind < 4\.5;/);
  assert.match(marks, /bool drone = kind > 4\.5;/);
  assert.match(marks, /if \( rayed \) \{[\s\S]*float band = smoothstep\( 0\.64, 0\.76, fbm\( vec2\( ang \* 11\.0, 0\.7 \) \+ so \) \);/, 'a heavy shell\'s rays');
  assert.match(marks, /if \( drone \) \{[\s\S]*float melt = /, "a drone's melted battery patch");
  assert.match(marks, /float pockD = pockF/, 'and its fragment pocks');
}
console.log(`strikeSignatures: the gunship's starburst, ${frags.length} fragments, ${rays(gun).length} soil rays, a cap and a rayed crater; the drone's pop, burning battery, carbon frame and pocked scorch; the tandem's two flashes, molten liner and airframe; tank HE unchanged`);
