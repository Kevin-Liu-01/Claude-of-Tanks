// (HE look v2, the coordinator's combat review of integ/224: "the HE bursts, barrage and cook-off alike, still read as
// clusters of round orange balls ... still orange 1-2 s later") the fire is a burst's first ~0.1-0.2 s; after it earth and
// soot; spiked silhouettes and a low dust ring; pooled (salvo) clouds take the dust look; snow powder low and settling;
// the pooled puffs' rims torn by noise.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heBurst, fireball, cookOffs, cineRng } from './cinematicRecipes.ts';
import { groundBurst } from './blastRecipes.ts';
import { makeVolumePuff } from './volumeMedia.ts';
import { makeChunkPiece } from './debrisChunks.ts';
import { mulberry32 } from './particles.ts';

const cine = (snow = false) => {
  const log = [];
  const tone = (x, z, out) => { out.light = snow ? [0.82, 0.86, 0.9] : [0.42, 0.36, 0.28]; out.dark = snow ? [0.5, 0.52, 0.55] : [0.2, 0.16, 0.12]; out.snow = snow; out.wet = false; return out; };
  const ctx = {
    sink: { puff: (pool, o) => log.push({ pool, ...structuredClone(o) }), streak: () => {}, chunk: () => {}, jet: (o) => log.push({ pool: 'jet', ...structuredClone(o) }) },
    world: { groundY: () => 0, tone, water: () => 0 }, env: { night: 0 }, rng: cineRng(4242), shift: 0,
    pulse: () => {}, addEmitter: () => {}, scorch: () => {}, shockRing: () => {},
  };
  return { ctx, log };
};
const fireEnd = (log) => Math.max(...log.filter((p) => p.pool === 'fire').map((p) => p.birthOffset + p.life));
{
  const { ctx, log } = cine();
  heBurst(ctx, 0, 0, 1.35, 0, 1);
  assert.ok(fireEnd(log) <= 0.3, `an HE burst's fire is gone by ${fireEnd(log).toFixed(2)} s`);
  const spikes = log.filter((p) => p.pool === 'smoke' && p.grav <= -8 && Math.hypot(p.vel[0], p.vel[1], p.vel[2]) > 6);
  assert.ok(spikes.length >= 25, `debris spikes: ${spikes.length} soil puffs flung up the jets`);
  const heart = log.filter((p) => p.pool === 'smoke' && p.vel[1] > 3.5 && p.grav > 0);
  assert.ok(heart.length >= 5 && heart.every((p) => Math.max(...p.col0) < 0.3), 'a dark sooty heart rises out of the crater');
  assert.ok(log.filter((p) => p.pool === 'fire').every((p) => p.size1 <= 2.6 * 1.35), 'no big fire balls (2.6 m x the burst at most)');
}
{
  const { ctx, log } = cine();
  fireball(ctx, 0, 1, 0, { scale: 1.15, smoke: 1.15, rise: 1.2 });
  assert.ok(fireEnd(log) <= 0.4, `a kill's fireball core is gone by ${fireEnd(log).toFixed(2)} s`);
  const glowing = log.filter((p) => p.pool === 'smoke' && p.alpha < 0);
  assert.ok(glowing.length <= 3 && glowing.every((p) => p.life <= 1.0), 'the fire-lit smoke is only a few short puffs at the base');
  const body = log.filter((p) => p.pool === 'billow');
  assert.ok(body.length >= 20 && body.every((p) => p.size1 <= 8.5), `${body.length} smaller soot lobes`);
}
{
  const { ctx, log } = cine();
  cookOffs(ctx, 0, 1, 0, 6, 7, 0.9);
  const fire = log.filter((p) => p.pool === 'fire');
  assert.ok(fire.every((p) => p.life <= 0.3), 'each cook-off pop spits fire for a fifth of a second');
}
{
  const { ctx, log } = cine(true);
  heBurst(ctx, 0, 0, 1.0, 0, 0.5);
  const powder = log.filter((p) => p.pool === 'dust' || (p.pool === 'smoke' && p.pos[1] < 0.5 && p.grav < 0 && p.grav > -3));
  assert.ok(powder.length >= 10 && powder.every((p) => p.life <= 4.2 && p.size1 <= 6.5), 'snow powder: short, small');
  assert.ok(log.filter((p) => p.pool === 'dust').every((p) => p.grav < 0), 'and settling');
}
// the battle's pooled bursts (the salvo governor) take the ground's dust look
{
  const burst = (crowd) => {
    const media = [];
    const ctx = { rand: mulberry32(9), groundY: () => 0, media: (p) => media.push({ ...p }), chunk: () => {}, flash: () => {}, fire: () => {},
      sparks: () => {}, jet: () => {}, shockRing: () => {}, lightPulse: () => {}, glow: () => {}, distBoost: () => 1, tier: 1,
      m: makeVolumePuff(), k: makeChunkPiece(), crowd: () => crowd,
      lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
      ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
      lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 } };
    groundBurst(ctx, { x: 0, y: 0, z: 0, munition: 'rocket', chargeKg: 9, surface: 'soil' });
    return media.filter((p) => p.heat > 0.2 && p.heat < 0.5);
  };
  const lone = burst(0)[0], pooled = burst(1)[0];
  const warm = (p) => p.r0 - p.b0;
  assert.ok(warm(pooled) > warm(lone) + 0.01 && pooled.r0 > lone.r0, `a pooled cloud is the ground's earth (${pooled.r0.toFixed(3)} vs ${lone.r0.toFixed(3)})`);
  const all = burst(0).concat(burst(1));
  assert.ok(all.length > 0);
}
const parts = await readFile(new URL('./particles.ts', import.meta.url), 'utf8');
assert.match(parts, /a \*= mix\( 1\.0, smoothstep\( 0\.28 \+ 0\.12 \* vT, 0\.62 \+ 0\.12 \* vT, en \), rim \);/, 'the pooled puffs\' rims torn by noise');
assert.match(parts, /vSeed = fract\( aPB\.w \* 1\.6180339 \+ aPB\.x \* 0\.0713 \+ aPB\.z \* 0\.1131 \);/, 'each puff its own seed');
console.log('heLookV2: fire gone by ~0.3 s, spikes and a sooty heart, short cook-off pops, snow powder settling, pooled clouds earthen, rims torn — ok');
