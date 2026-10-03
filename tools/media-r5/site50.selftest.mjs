import assert from 'node:assert/strict';
import { MAP_IDS } from '../../src/world/maps/mapIds.ts';
import { CAST } from './cast.mjs';
import { DUR, KINDS, LOOP_MS, SHOTS, XFADE_MS, siteScene } from './site50.mjs';

// Owner 2026-10-02: fifty new shots of tanks, battles and battlefields for the site, each one continuous take that
// site-loops.mjs turns into a seamless loop. Round 2 sets the bar by the owner's own Open Graph key art and Steinburg
// street duel: a battle in full swing in daylight on the battlefields that look best. These receipts hold the plan:
// fifty unique shots of every kind, plain titles, takes long enough for the loop and its crossfade, every one-shot
// event inside the loop body (where the tail-into-head dissolve cannot ghost it), daylight, deep focus, and a fight in
// every frame — something burning and something firing, hitting or exploding. Daylight carries most of the fifty; the
// owner then asked for sunset and night as well, so both get at least six shots and every night fight is lit by a flare.
assert.equal(SHOTS.length, 50, 'fifty shots');
assert.deepEqual(SHOTS.map(s => s[0]), Array.from({ length: 50 }, (_, i) => i + 1), 'numbered 1..50 in order');
const ids = SHOTS.map(s => s[1]);
assert.equal(new Set(ids).size, 50, 'unique ids');
const byKind = Object.fromEntries(KINDS.map(k => [k, SHOTS.filter(s => s[2] === k).length]));
for (const k of KINDS) assert.ok(byKind[k] >= 9, `at least nine ${k} shots (${byKind[k]})`);
assert.equal(XFADE_MS < LOOP_MS / 4 && DUR === LOOP_MS + XFADE_MS, true, 'the take is the loop plus its crossfade');

const BATTLEFIELDS = new Set(['urban', 'verdant', 'alpine', 'oasis', 'fjord', 'monsoon', 'railyard', 'foundry', 'frontier', 'delta', 'winter', 'orchard', 'reservoir']);
const HOURS = new Set(['morning', 'day', 'golden', 'sunset', 'night']);
const cast = new Set(Object.values(CAST));
const ONE_SHOT = new Set(['fire', 'tank_kill', 'impact', 'explosion', 'barrage', 'debris', 'shockwave', 'mg_burst']);
const COMBAT = new Set(['fire', 'tank_kill', 'impact', 'explosion', 'barrage', 'mg_burst']);
const BURNING = new Set(['burning', 'engine_smoke', 'fire_field']);
const maps = new Set(), times = new Set();
for (const shot of SHOTS) {
  const [n, id, kind, title] = shot;
  assert.ok(KINDS.includes(kind), `${id}: kind`);
  assert.ok(/^[A-Z]/.test(title) && title.length >= 12 && !/[.]$/.test(title), `${id}: a plain sentence-case title`);
  assert.ok(!/\bX\b|X[ -]?(fleet|tank)/i.test(title), `${id}: no fleet-tier naming`);
  const scene = siteScene(shot);
  maps.add(scene.map); times.add(scene.meta.time);
  assert.ok(MAP_IDS.includes(scene.map), `${id}: ${scene.map} is a battlefield`);
  assert.ok(BATTLEFIELDS.has(scene.map), `${id}: ${scene.map} is one of the chosen battlefields`);
  assert.ok(HOURS.has(scene.meta.time), `${id}: a planned hour (${scene.meta.time})`);
  if (scene.meta.time === 'night') assert.ok(scene.effects.some(e => e.type === 'flare'), `${id}: a night fight is lit by a flare`);
  assert.ok((scene.picture?.dof?.fStop ?? 0) >= 5.6, `${id}: deep focus keeps the surroundings sharp (f/${scene.picture?.dof?.fStop})`);
  assert.equal(scene.meta.id, `s${String(n).padStart(2, '0')}-${id}`);
  const dur = scene.storyboard.durationMs, ramp = Array.isArray(scene.film?.speed) && scene.film.speed.length > 0;
  assert.ok(ramp || dur === DUR, `${id}: one ${DUR} ms take (a speed ramp may stretch a shorter timeline)`);
  assert.equal(scene.film.fps, 30);
  assert.ok(scene.storyboard.shots.length >= 2, `${id}: a moving lens`);
  assert.ok(scene.meta.still.tMs > 0 && scene.meta.still.tMs < dur, `${id}: the still moment lies inside the take`);
  for (const a of scene.actors.filter(a => !a.name.startsWith('foe'))) assert.ok(cast.has(a.id), `${id}: ${a.name} is a cast tank (${a.id})`);
  const types = new Set(scene.effects.map(e => e.type));
  const burningFoe = scene.actors.some(a => a.name.startsWith('foe') && /burn/.test(a.state ?? ''));
  assert.ok([...types].some(t => COMBAT.has(t)), `${id}: something fires, hits or explodes`);
  assert.ok(burningFoe || [...types].some(t => BURNING.has(t)), `${id}: something burns`);
  if (!ramp) for (const fx of scene.effects.filter(e => ONE_SHOT.has(e.type))) {
    assert.ok(fx.tMs >= XFADE_MS && fx.tMs <= dur - XFADE_MS, `${id}: ${fx.type} at ${fx.tMs} ms sits in the loop body`);
  }
}
assert.ok(maps.size >= 10, `many battlefields (${maps.size})`);
assert.ok(times.size >= 4, `day, sunset and night (${[...times].join(', ')})`);
for (const hour of ['sunset', 'night']) {
  const n = SHOTS.map(siteScene).filter(sc => sc.meta.time === hour).length;
  assert.ok(n >= 6, `at least six ${hour} shots (${n})`);
}
console.log(`site50.selftest: ${SHOTS.length} shots (${KINDS.map(k => `${byKind[k]} ${k}`).join(', ')}) on ${maps.size} battlefields at ${[...times].join(', ')}`);
