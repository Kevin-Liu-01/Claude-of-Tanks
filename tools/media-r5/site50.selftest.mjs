import assert from 'node:assert/strict';
import { MAP_IDS } from '../../src/world/maps/mapIds.ts';
import { CAST } from './cast.mjs';
import { isBuiltInCamoId } from '../../src/vehicles/camoPolicy.ts';
import { DUR, KINDS, LOOP_MS, PAINT, SHOTS, XFADE_MS, siteScene } from './site50.mjs';
import { blockedFraction, heroInFrameFraction } from './camera-clearance.mjs';

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
  // review 2026-10-02: lenses that sat ahead of the hero (it fell behind them) or inside a building wasted a GPU pass
  assert.ok(heroInFrameFraction(scene) >= 0.9, `${id}: the hero stays in frame (${heroInFrameFraction(scene).toFixed(2)})`);
  assert.ok(blockedFraction(scene) <= 0.1, `${id}: the lens clears the buildings (${blockedFraction(scene).toFixed(2)} blocked)`);
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

// Paint (owner 2026-10-02: "all of our tanks have too similar camos"): every unit wears its own catalog scheme, no two
// shots alike; no stock coat, single-tone national coat, insignia, brand or novelty paint; snow schemes only on snow;
// the enemy in another scheme; and since the Studio paints per vehicle model, one model never carries two schemes.
const NOT_FIELD_PAINT = new Set(['auto', 'factory', 'signature', 'urban', 'normandy44', 'berlin45', 'mono', 'carbon', 'prism',
  'claude', 'spark', 'openai', 'xai', 'gemini', 'ducky', 'suits', 'flames', 'leopardprint', 'bolt', 'stars', 'daisy', 'circuit', 'racing', 'paintball']);
const SNOW = new Set(['winter', 'washworn', 'winterbands', 'merdcwinter', 'ardennes44']), SNOW_MAPS = new Set(['alpine', 'winter']);
const fieldPaint = p => isBuiltInCamoId(p) && !NOT_FIELD_PAINT.has(p) && !p.startsWith('national_');
const units = new Set();
for (const shot of SHOTS) {
  const [n, id] = shot, scene = siteScene(shot), [unit, enemy] = PAINT[n] ?? [];
  assert.ok(fieldPaint(unit), `${id}: the unit wears field paint from the catalog (${unit})`);
  assert.ok(!units.has(unit), `${id}: ${unit} already dresses another shot`); units.add(unit);
  assert.ok(!SNOW.has(unit) || SNOW_MAPS.has(scene.map), `${id}: a snow scheme off the snow (${unit} on ${scene.map})`);
  const foes = scene.actors.filter(a => a.name.startsWith('foe'));
  for (const a of scene.actors) assert.equal(a.camo, a.name.startsWith('foe') ? enemy : unit, `${id}: ${a.name} wears the plan's paint`);
  if (foes.length) {
    assert.ok(fieldPaint(enemy) && enemy !== unit, `${id}: the enemy wears other field paint (${enemy})`);
    assert.ok(!SNOW.has(enemy) || SNOW_MAPS.has(scene.map), `${id}: an enemy snow scheme off the snow (${enemy})`);
  } else assert.equal(enemy, null, `${id}: no enemy, no enemy paint`);
  const bySpec = new Map();
  for (const a of scene.actors) {
    const seen = bySpec.get(a.id);
    assert.ok(seen == null || seen === a.camo, `${id}: ${a.id} carries two schemes (${seen}, ${a.camo})`);
    bySpec.set(a.id, a.camo);
  }
  assert.deepEqual(scene.meta.paint, { unit, enemy: foes.length ? enemy : null }, `${id}: the scene records its paint`);
}
assert.equal(units.size, SHOTS.length, 'fifty schemes for fifty shots');
console.log(`site50.selftest: ${SHOTS.length} shots (${KINDS.map(k => `${byKind[k]} ${k}`).join(', ')}) on ${maps.size} battlefields at ${[...times].join(', ')}`);
