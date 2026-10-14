// (EF.03 cost, the coordinator 10-13) the salvo governor: a 24-rocket salvo's burst clouds cost +1.4 ms presented at its
// peak; a burst landing in a 25 m cell that already took two in the same second pools its cloud (fewer, larger, shorter-
// lived bodies), decided by burst count per cell per second (never frame time); a lone burst and a pair are unchanged.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { groundBurst } from './blastRecipes.ts';
import { makeVolumePuff } from './volumeMedia.ts';
import { makeChunkPiece } from './debrisChunks.ts';
import { mulberry32 } from './particles.ts';

const capture = (seed, crowd) => {
  const media = [];
  const ctx = {
    rand: mulberry32(seed), groundY: () => 0, media: (p) => media.push({ ...p }), chunk: () => {}, flash: () => {}, fire: () => {},
    sparks: () => {}, jet: () => {}, shockRing: () => {}, lightPulse: () => {}, glow: () => {}, distBoost: () => 1, tier: 1,
    m: makeVolumePuff(), k: makeChunkPiece(),
    lp: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, size0: 1, size1: 1, rot: 0, rotVel: 0, col0: [1, 1, 1], col1: [1, 1, 1], alpha: 1, grav: 0, birthOffset: 0 },
    ls: { pos: [0, 0, 0], vel: [0, 0, 0], life: 1, width: 0.03, stretch: 0.03, grav: -18, col: [1, 1, 1], alpha: 1, seed: 0, birthOffset: 0 },
    lj: { pos: [0, 0, 0], axis: [0, 1, 0], life: 0.1, width: 0.5, len0: 0.5, len1: 3, seed: 0, col: [1, 1, 1], alpha: 1, birthOffset: 0 },
  };
  if (crowd !== undefined) ctx.crowd = () => crowd;
  groundBurst(ctx, { x: 0, y: 0, z: 0, munition: 'rocket', chargeKg: 9, surface: 'soil' });
  return media.filter((p) => p.heat > 0 && p.heat < 0.5); // the burst's smoke cloud (heat 0.3)
};
const lone = capture(9), none = capture(9, 0), full = capture(9, 1), half = capture(9, 0.5);
assert.deepEqual(lone, none, 'no governor (captures, receipts) and an uncrowded cell are the same burst');
assert.ok(full.length <= 0.32 * lone.length && full.length >= 3, `a fully pooled burst draws ${full.length} cloud bodies (alone ${lone.length})`);
assert.ok(half.length < lone.length && half.length > full.length, 'half crowded, in between');
const meanSize = (xs) => xs.reduce((s, p) => s + p.size1, 0) / xs.length;
assert.ok(meanSize(full) > 1.2 * meanSize(lone) && meanSize(full) < 1.6 * meanSize(lone), `each pooled body larger (${(meanSize(full) / meanSize(lone)).toFixed(2)}x)`);
const area = (xs) => xs.reduce((s, p) => s + p.size1 * p.size1 * p.life, 0);
assert.ok(area(full) < 0.6 * area(lone), `the pooled cloud's card area x life ${(area(full) / area(lone)).toFixed(2)} of a lone burst's`);
// the count per cell per second (effects.ts burstCrowd), mirrored: 25 m cells, the last second, from the third burst on
const fx = await readFile(new URL('./effects.ts', import.meta.url), 'utf8');
assert.match(fx, /const CROWD_SLOTS = 48, CROWD_S = 1\.0, CROWD_CELL_M = 25;/);
assert.match(fx, /if \(age >= 0 && age <= CROWD_S && crowdCell\[i\] === cell\) n\+\+;/, 'a count of the cell\'s bursts in the last second');
assert.match(fx, /return Math\.min\(1, Math\.max\(0, \(n - 1\) \/ 6\)\);/, 'from the third burst on, fully pooled by the eighth');
assert.doesNotMatch(fx.slice(fx.indexOf('function burstCrowd'), fx.indexOf('function burstCrowd') + 900), /performance\.now|frameMs|fps|dt\b/, 'never by frame time');
assert.match(fx, /crowd: \(x: number, z: number\) => burstCrowd\(x, z\),/, 'the battle\'s blast context carries it');
const crowdOf = (n) => Math.min(1, Math.max(0, (n - 1) / 6));
assert.deepEqual([0, 1, 2, 7, 23].map(crowdOf), [0, 0, 1 / 6, 1, 1], 'a pair untouched; a 24-rocket salvo fully pooled');
console.log(`salvoGovernor: a lone burst ${lone.length} cloud bodies, a pooled one ${full.length} (area x life ${(area(full) / area(lone)).toFixed(2)}); count per 25 m cell per second — ok`);
