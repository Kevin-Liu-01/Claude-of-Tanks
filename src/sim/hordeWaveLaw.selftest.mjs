// Endless Horde's wave law (gameplay-modes-228; owner 2026-10-18: "make it work a lot more properly like youd expect,
// more enemies per round"). The controller, headless: every wave brings its law's TOTAL (6, 9, 13, 18, 24 x 1.4 swarm,
// 30, 37 …) through the twenty-identity pool, at most maxAlive on the field at once, the queue trickling in one
// identity every trickleS (a wreck only once it has lain recycleAfterS); every arrival on the ring 260-380 m round the
// humans, never within 150 m of one nor in a human's terrain sight (the ridge field), else deferred; the lull exactly
// intermissionS; the HUD's state (total, queued, remaining = alive + queued, the special); the same seed replays it.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';
import { hordeMaxAlive, hordeWaveTotal, matchRulesetFor } from './matchRuleset.ts';

const horde = matchRulesetFor('endless_horde');
const RIDGE_R = 200;
/** The humans stand in a bowl: a 40 m ridge ring 190-210 m round (0, -150) hides everything beyond it. */
const bowl = (x, z) => { const r = Math.hypot(x, z + 150); return r > RIDGE_R - 10 && r < RIDGE_R + 10 ? 40 : 0; };
const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } });
function run(seed, terrain = bowl) {
  const humans = [tank('human', 'alpha', 0, -150, false), tank('ally-0', 'alpha', 10, -150), tank('ally-1', 'alpha', -10, -140)];
  const pool = Array.from({ length: 20 }, (_, i) => tank(`z${i}`, 'bravo', i * 6 - 60, 380));
  const events = [];
  const arrivals = [];
  let clock = 0;
  // the wave an arrival belongs to: the opening burst revives before its wave_started, so a cleared wave hands over
  let wave = 1;
  const mode = createMatchModeController({ mode: 'endless_horde', entities: [...humans, ...pool], seed, terrainHeight: terrain,
    emit: (type, payload) => { events.push({ type, payload }); if (type === 'mode_wave_cleared') wave = payload.wave + 1; },
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn, healthScale) {
      Object.assign(target.state.pos, { x: spawn.x, y: terrain(spawn.x, spawn.z), z: spawn.z });
      target.combat = { hp: 0, maxHp: Math.round(1000 * horde.hpScale * healthScale), destroyed: false, ammo: [20], ammoCapacity: [20] };
      target.combat.hp = target.combat.maxHp;
      if (target.team === 'bravo') arrivals.push({ id: target.id, x: spawn.x, z: spawn.z, atS: clock, wave });
    } });
  return { humans, pool, mode, events, arrivals, get clock() { return clock; }, set clock(v) { clock = v; } };
}
const live = (pool) => pool.filter((z) => z.modeActive !== false && !z.combat.destroyed);
/** An independent terrain sight test (the harness's): eye 2.4 m up to hull 1.5 m up, marched every 4 m, no margin. */
const sees = (from, x, z, terrain) => {
  const d = Math.hypot(x - from.state.pos.x, z - from.state.pos.z);
  for (let s = 4; s < d - 2; s += 4) {
    const f = s / d, y = from.state.pos.y + 2.4 + (terrain(x, z) + 1.5 - from.state.pos.y - 2.4) * f;
    if (terrain(from.state.pos.x + (x - from.state.pos.x) * f, from.state.pos.z + (z - from.state.pos.z) * f) > y) return false;
  }
  return true;
};

const a = run(31);
const totals = [];
const lulls = [];
let peak = 0;
for (let wave = 1; wave <= 6; wave++) {
  assert.equal(a.mode.state.horde.wave, wave);
  const total = hordeWaveTotal(horde.horde, wave, 1);
  assert.equal(a.mode.state.horde.total, total, `wave ${wave}: the law's total`);
  totals.push(total);
  assert.equal(a.mode.state.horde.special, wave === 4 ? 'runner' : wave === 5 ? 'swarm' : null, `wave ${wave}: its kind`);
  // fight it: destroy what stands every half second until the lull begins
  let clearedAt = null;
  for (let guard = 0; guard < 2000 && clearedAt == null; guard++) {
    const standing = live(a.pool);
    peak = Math.max(peak, standing.length);
    assert.ok(standing.length <= hordeMaxAlive(horde.horde, 1, 20), `wave ${wave}: never more than maxAlive at once`);
    assert.equal(a.mode.state.horde.remaining, standing.length + a.mode.state.horde.queued, 'remaining = alive + queued');
    for (const z of standing) z.combat.destroyed = true;
    a.clock += 0.5; a.mode.step(1 / 60, a.clock);
    if (a.events.some((e) => e.type === 'mode_wave_cleared' && e.payload.wave === wave)) clearedAt = a.clock;
  }
  assert.ok(clearedAt != null, `wave ${wave} clears`);
  assert.equal(a.arrivals.filter((r) => r.wave === wave).length, total, `wave ${wave}: exactly its total arrived (trickled through the pool)`);
  const startedNext = () => a.events.find((e) => e.type === 'mode_wave_started' && e.payload.wave === wave + 1);
  for (let i = 0; i < 40 && !startedNext(); i++) { a.clock += 0.25; a.mode.step(1 / 60, a.clock); }
  lulls.push(a.clock - clearedAt);
}
assert.deepEqual(totals, [6, 9, 13, 18, Math.round(24 * 1.4), 30], 'the totals rise past the old twenty cap');
assert.ok(lulls.every((s) => s >= 8 - 0.26 && s <= 8 + 0.26), `the lull is the ruleset's 8 s (${lulls.join(', ')})`);
assert.equal(peak, 16, 'the field peaks at maxAlive');
assert.equal(new Set(a.arrivals.map((r) => r.id)).size, 20, 'every arrival is one of the twenty pool identities');
for (const arrival of a.arrivals) {
  for (const human of a.humans) {
    assert.ok(Math.hypot(arrival.x - human.state.pos.x, arrival.z - human.state.pos.z) >= 150, `${arrival.id}: never within 150 m of a human`);
    assert.ok(!sees(human, arrival.x, arrival.z, bowl), `${arrival.id} at (${arrival.x.toFixed(0)}, ${arrival.z.toFixed(0)}): out of ${human.id}'s terrain sight`);
  }
}
// the trickle: a wreck's identity rests recycleAfterS before it returns
{
  const lastDeath = new Map();
  const b = run(32);
  for (let t = 0; t < 60; t++) {
    for (const z of live(b.pool)) { z.combat.destroyed = true; lastDeath.set(z.id, b.clock); }
    b.clock += 0.5; b.mode.step(1 / 60, b.clock);
  }
  for (const arrival of b.arrivals) {
    const died = lastDeath.get(arrival.id);
    if (died != null && arrival.atS > died) assert.ok(arrival.atS - died >= horde.horde.recycleAfterS - 0.51, `${arrival.id}: rested ${(arrival.atS - died).toFixed(1)} s`);
  }
}
// an open, flat field: every ring point is in sight, so the hostiles come from their base, which lies beyond the
// humans' sight range (sightRangeM) here
{
  const flat = run(33, () => 0);
  assert.equal(live(flat.pool).length, 6, 'the opening arrives');
  for (const arrival of flat.arrivals) {
    assert.ok(flat.humans.every((h) => Math.hypot(arrival.x - h.state.pos.x, arrival.z - h.state.pos.z) > horde.horde.sightRangeM), 'from beyond sight range');
  }
}
// a flat field whose hostile base is in sight too: nothing arrives in sight; once the field has stood empty a while the
// wave takes ring points out of reach (in sight) rather than stall forever
{
  const humans = [tank('human', 'alpha', 0, -150, false)];
  const pool = Array.from({ length: 6 }, (_, i) => tank(`n${i}`, 'bravo', i * 6, 100));
  const spots = [];
  let t = 0;
  const mode = createMatchModeController({ mode: 'endless_horde', entities: [...humans, ...pool], seed: 34, terrainHeight: () => 0,
    setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) { Object.assign(target.state.pos, { x: spawn.x, z: spawn.z }); target.combat.destroyed = false; spots.push(spawn); } });
  assert.equal(live(pool).length, 0, 'no arrival in the humans\' sight');
  for (let i = 0; i < 40; i++) { t += 0.5; mode.step(1 / 60, t); }
  assert.ok(live(pool).length > 0, 'a stalled field takes ring points out of reach rather than stall the wave');
  assert.ok(spots.every((p) => Math.hypot(p.x, p.z + 150) >= 150), 'still never within 150 m');
}
// the same seed replays the same arrivals
{
  const c = run(31);
  for (let i = 0; i < 20; i++) { for (const z of live(c.pool)) z.combat.destroyed = true; c.clock += 0.5; c.mode.step(1 / 60, c.clock); }
  assert.deepEqual(c.arrivals.slice(0, 12).map((r) => [r.id, r.x, r.z]), a.arrivals.slice(0, 12).map((r) => [r.id, r.x, r.z]), 'deterministic');
}
console.log(`hordeWaveLaw.selftest: totals ${totals.join(', ')}, peak ${peak} on the field, ${a.arrivals.length} arrivals from 20 identities, `
  + 'all out of reach and sight, an 8 s lull, the trickle and the replay');
