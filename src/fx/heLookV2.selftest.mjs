// (HE look v2, the coordinator's combat review of integ/224: "the HE bursts, barrage and cook-off alike, still read as
// clusters of round orange balls ... still orange 1-2 s later") the fire is a burst's first ~0.1-0.2 s; after it earth and
// soot; spiked silhouettes and a low dust ring; pooled (salvo) clouds take the dust look; snow powder low and settling;
// the pooled puffs' rims torn by noise.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { heBurst, fireball, cookOffs, debrisBurst, cineRng } from './cinematicRecipes.ts';
import { groundBurst } from './blastRecipes.ts';
import { makeVolumePuff } from './volumeMedia.ts';
import { makeChunkPiece } from './debrisChunks.ts';
import { mulberry32 } from './particles.ts';

const cine = (snow = false) => {
  const log = [];
  const tone = (x, z, out) => { out.light = snow ? [0.82, 0.86, 0.9] : [0.42, 0.36, 0.28]; out.dark = snow ? [0.5, 0.52, 0.55] : [0.2, 0.16, 0.12]; out.snow = snow; out.wet = false; return out; };
  const ctx = {
    sink: { puff: (pool, o) => log.push({ pool, ...structuredClone(o) }), streak: () => {}, chunk: (o) => log.push({ pool: 'chunk', ...structuredClone(o) }), jet: (o) => log.push({ pool: 'jet', ...structuredClone(o) }) },
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
  // (follow-up 2026-10-14) a shell's clods are thrown earth: the debris pool draws them dark soil (hot -1), never lit
  // charred-metal cards
  const clods = log.filter((p) => p.pool === 'chunk');
  assert.ok(clods.length >= 12 && clods.every((p) => p.hot === -1), `a burst's ${clods.length} clods flagged earth`);
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
{
  // (follow-up 2026-10-14) a burning piece trails flame only near the fire (its first 0.45 s), then smoke alone
  const { ctx, log } = cine();
  debrisBurst(ctx, 0, 1, 0, 24, 14, 1, 1);
  const fire = log.filter((p) => p.pool === 'fire');
  assert.ok(fire.length > 0 && fire.every((p) => p.birthOffset <= 0.45), `flame trails end near the core (${fire.length} puffs)`);
  assert.ok(log.filter((p) => p.pool === 'smoke').some((p) => p.birthOffset > 0.6), 'the smoke trail goes on');
}
const parts = await readFile(new URL('./particles.ts', import.meta.url), 'utf8');
assert.match(parts, /a \*= mix\( 1\.0, smoothstep\( 0\.28 \+ 0\.12 \* vT, 0\.62 \+ 0\.12 \* vT, en \), rim \);/, 'the pooled puffs\' rims torn by noise');
assert.match(parts, /vSeed = fract\( aPB\.w \* 1\.6180339 \+ aPB\.x \* 0\.0713 \+ aPB\.z \* 0\.1131 \);/, 'each puff its own seed');
assert.match(parts, /vEmit = selfLit \* aC0\.rgb \* exp\( -3\.2 \* age \);/, 'a fire-lit puff\'s glow is gone in a third of a second, whatever its life');
// the billow pool's blackbody interior (the cinematic fireball's lobes, the phone tier's kill) burns out by age
assert.match(parts, /float h2 = heat \* \( 1\.0 - vT \* 0\.95 \) \* exp\( -7\.0 \* vAge \);/, 'a fireball lobe\'s orange heart is gone by ~0.3 s, whatever its life');
assert.match(parts, /vAge = age;/);
// (follow-up 2026-10-14, the coordinator: the flying chunks "read as flat cardboard shards with bright faces") the debris
// pool's pieces darken to soot by their distance from the core and lose their ember glow out there; a small chip smears
// by the 1/45 s shutter against its own size; no piece is flatter than 0.62 of its width; the torn plate has body
assert.match(parts, /float dCore = length\( center - aPB\.xyz \);\n  float outK = smoothstep\( 1\.5, 7\.0, dCore \);/, 'debris soot by distance from the core');
assert.match(parts, /vTint = mix\( base, base \* vec3\( 0\.40, 0\.38, 0\.36 \) \+ vec3\( 0\.010, 0\.009, 0\.008 \), outK \);/);
assert.match(parts, /vec3 base = aSG\.z < -0\.5\n    \? mix\( vec3\( 0\.046, 0\.037, 0\.028 \)/, 'thrown earth is dark soil');
assert.match(parts, /vHot = max\( aSG\.z, 0\.0 \) \* exp\([^;]*\* \( 1\.0 - 0\.9 \* smoothstep\( 2\.0, 6\.5, dCore \) \);/, 'embers stay near the fire');
assert.match(parts, /float smear = mix\( min\( spd \* 0\.022 \/ max\( aSG\.x, 0\.02 \), 3\.0 \), clamp\( spd \* 0\.045, 0\.0, 0\.85 \),\n      smoothstep\( 0\.14, 0\.30, aSG\.x \) \);/, 'small chips smear');
assert.match(parts, /vec3 lp = position \* vec3\( 0\.70 \+ h1 \* 0\.60, 0\.62 \+ h2 \* 0\.60, 0\.70 \+ h3 \* 0\.60 \);/, 'no flat chunk');
assert.match(parts, /pos\.setXYZ\(i, x \* m \* 1\.15, y \* m \* 0\.30, z \* m \* 0\.90\);/, 'the plate has body');
// the smoke-screen wall: a soft near-lens fade (the compiled screen shader carries it; past ~8 m the approved card)
{
  const THREE = await import('three');
  const { createParticleSystem } = await import('./particles.ts');
  const tex = () => new THREE.Texture();
  const sys = createParticleSystem({}, { seed: 5000, poolSizes: { smoke: 4, fire: 4, billow: 4, psmoke: 4, screen: 4, dust: 4, sparks: 4, debris: 4, flash: 4, jet: 4 },
    share: { uTime: { value: 0 }, uSceneDepth: { value: null }, uSoftViewport: { value: new THREE.Vector2(1, 1) }, uCameraNear: { value: 0.5 },
      uCameraFar: { value: 4000 }, uLightTint: { value: new THREE.Color(1, 1, 1) },
      textures: { smoke: tex(), fire: tex(), prop: tex(), dust: tex(), flash: tex(), jet: tex() } } });
  const fs = sys.pools.screen.mesh.material.fragmentShader;
  assert.match(fs, /float lensK = smoothstep\( 1\.5, 8\.0, vParticleDepth \);/, 'the screen card knows the lens');
  assert.match(fs, /\* screenContact\( 2\.5 \* \( 1\.0 - lensK \) \) \* \( 0\.35 \+ 0\.65 \* lensK \);/, 'a soft contact and a thinner medium near the lens');
  assert.doesNotMatch(fs, /softDepthFade\(\);/, 'the screen\'s alpha line was replaced');
  assert.match(sys.pools.psmoke.mesh.material.fragmentShader, /float er = vT \* 0\.36;\n  float a = smoothstep\( er, er \+ 0\.44 \+ 0\.50 \* vT, tex \) \* vColor\.a \* softDepthFade\(\);/, 'the propellant smoke is untouched');
  const lens = (d) => { const t = Math.min(1, Math.max(0, (d - 1.5) / 6.5)); const k = t * t * (3 - 2 * t); return 0.35 + 0.65 * k; };
  assert.ok(lens(8) === 1 && lens(4) < 0.7 && lens(1.5) === 0.35, 'thin at the lens, the approved card from 8 m');
}
{ const h = (age) => Math.exp(-7 * age); assert.ok(h(0.2) < 0.25 && h(0.35) < 0.09, 'the heat at 0.2 s and 0.35 s'); }
// the battle's kill dust on snow: low, short, small, faint, settling
{
  const { killDust } = await import('./blastRecipes.ts');
  const dust = (surface) => {
    const media = [];
    const ctx = { rand: mulberry32(5), groundY: () => 0, media: (p) => media.push({ ...p }), chunk: () => {}, flash: () => {}, fire: () => {},
      sparks: () => {}, jet: () => {}, shockRing: () => {}, lightPulse: () => {}, glow: () => {}, distBoost: () => 1, tier: 1,
      m: makeVolumePuff(), k: makeChunkPiece(), lp: {}, ls: {}, lj: {} };
    killDust(ctx, 0, 0, 0, 1.6, surface, 0);
    return media;
  };
  const soil = dust('soil'), snowy = dust('snow');
  const avg = (xs, f) => xs.reduce((s, p) => s + f(p), 0) / xs.length;
  assert.ok(avg(snowy, (p) => p.life) < 0.6 * avg(soil, (p) => p.life), 'snow powder short-lived');
  assert.ok(avg(snowy, (p) => p.vy) < 0.5 * avg(soil, (p) => p.vy) && snowy.every((p) => p.grav < 0), 'low and settling');
  assert.ok(avg(snowy, (p) => p.size1) < 0.75 * avg(soil, (p) => p.size1), 'smaller');
}
console.log('heLookV2: fire gone by ~0.3 s, spikes and a sooty heart, short cook-off pops, snow powder settling, pooled clouds earthen, rims torn, chunks soot and soil, screen soft at the lens — ok');
