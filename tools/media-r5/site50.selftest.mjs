import assert from 'node:assert/strict';
import { MAP_IDS } from '../../src/world/maps/mapIds.ts';
import { CAST } from './cast.mjs';
import { DUR, KINDS, LOOP_MS, SHOTS, XFADE_MS, siteScene } from './site50.mjs';

// Owner 2026-10-02: fifty new shots of tanks, battles and battlefields for the site, each one continuous take that
// site-loops.mjs turns into a seamless loop. These receipts hold the plan: fifty unique shots, every kind and many
// battlefields, plain titles, takes long enough for the loop and its crossfade, and every one-shot event (a round,
// a kill, an explosion) inside the loop body, where the tail-into-head dissolve cannot ghost it.
assert.equal(SHOTS.length, 50, 'fifty shots');
assert.deepEqual(SHOTS.map(s => s[0]), Array.from({ length: 50 }, (_, i) => i + 1), 'numbered 1..50 in order');
const ids = SHOTS.map(s => s[1]);
assert.equal(new Set(ids).size, 50, 'unique ids');
const byKind = Object.fromEntries(KINDS.map(k => [k, SHOTS.filter(s => s[2] === k).length]));
for (const k of KINDS) assert.ok(byKind[k] >= 9, `at least nine ${k} shots (${byKind[k]})`);
assert.equal(XFADE_MS < LOOP_MS / 4 && DUR === LOOP_MS + XFADE_MS, true, 'the take is the loop plus its crossfade');

const cast = new Set(Object.values(CAST));
const ONE_SHOT = new Set(['fire', 'tank_kill', 'impact', 'explosion', 'barrage', 'debris', 'shockwave', 'mg_burst']);
const maps = new Set(), times = new Set();
for (const shot of SHOTS) {
  const [n, id, kind, title] = shot;
  assert.ok(KINDS.includes(kind), `${id}: kind`);
  assert.ok(/^[A-Z]/.test(title) && title.length >= 12 && !/[.]$/.test(title), `${id}: a plain sentence-case title`);
  assert.ok(!/\bX\b|X[ -]?(fleet|tank)/i.test(title), `${id}: no fleet-tier naming`);
  const scene = siteScene(shot);
  maps.add(scene.map); times.add(scene.meta.time);
  assert.ok(MAP_IDS.includes(scene.map), `${id}: ${scene.map} is a battlefield`);
  assert.equal(scene.meta.id, `s${String(n).padStart(2, '0')}-${id}`);
  const dur = scene.storyboard.durationMs, ramp = Array.isArray(scene.film?.speed) && scene.film.speed.length > 0;
  assert.ok(ramp || dur === DUR, `${id}: one ${DUR} ms take (a speed ramp may stretch a shorter timeline)`);
  assert.equal(scene.film.fps, 30);
  assert.ok(scene.storyboard.shots.length >= 2, `${id}: a moving lens`);
  assert.ok(scene.meta.still.tMs > 0 && scene.meta.still.tMs < dur, `${id}: the still moment lies inside the take`);
  for (const a of scene.actors.filter(a => !a.name.startsWith('foe'))) assert.ok(cast.has(a.id), `${id}: ${a.name} is a cast tank (${a.id})`);
  if (!ramp) for (const fx of scene.effects.filter(e => ONE_SHOT.has(e.type))) {
    assert.ok(fx.tMs >= XFADE_MS && fx.tMs <= dur - XFADE_MS, `${id}: ${fx.type} at ${fx.tMs} ms sits in the loop body`);
  }
}
assert.ok(maps.size >= 25, `many battlefields (${maps.size})`);
assert.ok(times.size >= 6, `many times of day (${[...times].join(', ')})`);
console.log(`site50.selftest: ${SHOTS.length} shots (${KINDS.map(k => `${byKind[k]} ${k}`).join(', ')}) on ${maps.size} battlefields at ${times.size} times of day`);
