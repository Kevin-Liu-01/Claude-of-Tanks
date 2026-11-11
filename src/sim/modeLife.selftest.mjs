// modeLife.selftest — one per-tank life state in the mode controller (audit M4, 2026-11-02). A tank is alive, down (its
// wreck on the field, a revive perhaps due), benched (off the field in the pool) or rescued (an AC-130 convoy hull out),
// written by one transition function that keeps modeActive and combat.destroyed consistent with it, counts the lives
// begun, and refuses a move its table does not list. Before: the life was spread over modeActive, combat.destroyed, an
// edge-detector map and the respawn timers, so a migrated host's restore parked hulls as "inactive but not destroyed"
// (spotting saw them at their parked pose), a Horde hostile whose placement kept failing counted as alive and held the
// intermission off for as long as its retry at its own base kept failing, and a rescued hull could be revived.
import assert from 'node:assert/strict';
import { createMatchModeController } from './matchModes.ts';

const tank = (id, team, x, z, bot = true) => ({ id, team, bot, state: { pos: { x, y: 0, z }, yaw: 0, speed: 0 },
  combat: { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] } });
const live = (pool) => pool.filter((z) => z.modeActive !== false && !z.combat.destroyed);
const revive = (target, spawn) => {
  Object.assign(target.state.pos, { x: spawn.x, y: 0, z: spawn.z });
  target.combat = { hp: 1000, maxHp: 1000, destroyed: false, ammo: [20], ammoCapacity: [20] };
};

// ---- a refused Horde arrival retries as an arrival on its 1 s deadline (the ring, its base if clear, or the stall rule)
// and stays owed by the wave (queued, not alive) until it lands; the wave counts only hulls on the field
{
  const BASE_Z = 380;
  let victim = null;
  const nearBase = (point) => Math.abs(point.z - BASE_Z) < 60;
  // the first hostile arrival is refused, and that hostile's own base for good (its old retry target)
  const placement = {
    centers: { alpha: { x: 0, z: -150, yaw: 0 }, bravo: { x: 0, z: BASE_Z, yaw: Math.PI } },
    middle: { x: 0, z: 115 }, zones: [], objectives: null, assaultLines: null,
    deploymentCenter: (team) => (team === 'alpha' ? { x: 0, z: -150 } : { x: 0, z: BASE_Z }),
    respawnNear: (point, key) => (key === victim && nearBase(point) ? null : { x: point.x, z: point.z, yaw: point.yaw }),
    respawn: (point, key) => {
      if (key.startsWith('z') && victim === null) { victim = key; return null; }
      return key === victim && nearBase(point) ? null : { x: point.x, z: point.z, yaw: point.yaw };
    },
    pickup: (point) => point,
  };
  const humans = [tank('human', 'alpha', 0, -150, false)];
  const pool = Array.from({ length: 8 }, (_, i) => tank(`z${i}`, 'bravo', i * 6 - 20, BASE_Z));
  const events = [];
  const arrived = [];
  const mode = createMatchModeController({ mode: 'endless_horde', entities: [...humans, ...pool], seed: 31, placement,
    emit: (type, payload) => events.push({ type, payload }), setActive(target, active) { target.modeActive = active; },
    revive(target, spawn) { revive(target, spawn); arrived.push({ id: target.id, z: spawn.z }); } });
  assert.ok(victim, 'the placement refused an arrival');
  const owed = pool.find((z) => z.id === victim);
  assert.equal(owed.modeActive, false, 'the refused hostile is off the field');
  let clock = 0, cleared = false;
  for (let guard = 0; guard < 1200 && !cleared; guard++) {
    assert.equal(mode.state.horde.alive, live(pool).length, `t=${clock}: alive counts the hulls on the field`);
    assert.equal(mode.state.horde.remaining, live(pool).length + mode.state.horde.queued, 'remaining = alive + queued');
    for (const z of live(pool)) z.combat.destroyed = true;
    clock += 0.5; mode.step(1 / 60, clock);
    cleared = events.some((e) => e.type === 'mode_wave_cleared' && e.payload.wave === 1);
  }
  assert.ok(cleared, 'the wave clears: the refused arrival stayed owed (queued, not alive) and landed on a later retry');
  const again = arrived.filter((r) => r.id === victim);
  assert.ok(again.length >= 1 && again.every((r) => Math.abs(r.z - BASE_Z) >= 60),
    'the refused hostile came back as an arrival on the ring, never by a retry aimed at its refusing base');
  assert.equal(owed.modeLife, 'down', 'and its wreck lies on the field');
}

// ---- a migrated host's restore parks a resting hull as benched: off the field and no live hull
{
  const make = (seed) => {
    const humans = [tank('human', 'alpha', 0, -150, false)];
    const pool = Array.from({ length: 20 }, (_, i) => tank(`z${i}`, 'bravo', i * 6 - 60, 380));
    const mode = createMatchModeController({ mode: 'endless_horde', entities: [...humans, ...pool], seed,
      setActive(target, active) { target.modeActive = active; }, revive });
    return { pool, mode };
  };
  const old = make(31);
  const resting = old.pool.filter((z) => z.modeActive === false).map((z) => z.id);
  const fresh = make(77);
  const parked = fresh.pool.filter((z) => resting.includes(z.id) && z.modeActive !== false);
  assert.ok(parked.length > 0, 'the new host drew some hulls the old one had resting');
  fresh.mode.restoreCheckpoint(old.mode.captureCheckpoint(1));
  for (const z of parked) {
    assert.equal(z.modeActive, false, `${z.id}: resting again`);
    assert.equal(z.combat.destroyed, true, `${z.id}: a resting hull is no live hull to the in-play filters`);
  }
  for (const z of fresh.pool) if (z.modeActive === false) assert.equal(z.modeLife, 'benched', `${z.id}: benched`);
  for (const z of fresh.pool) {
    const was = old.pool.find((o) => o.id === z.id);
    assert.equal(z.modeLife, was.modeLife, `${z.id}: the restore takes the old host's life`);
  }
}

// ---- the life moves: a death, a revive (one event, a new life), a rescued hull that never comes back
{
  const a = tank('a', 'alpha', 0, -100, false), b = tank('b', 'bravo', 0, 100);
  const events = [];
  const ctf = createMatchModeController({ mode: 'capture_the_flag', entities: [a, b],
    emit: (type, payload) => events.push({ type, payload }), revive });
  assert.equal(a.modeLife, 'alive');
  const lives = a.modeLives ?? 0;
  a.combat.destroyed = true;
  ctf.step(1 / 60, 1);
  assert.equal(a.modeLife, 'down', 'a death is the move alive -> down');
  assert.equal(a.modeActive, true, 'its wreck stays on the field');
  ctf.step(1 / 60, 30);
  assert.equal(a.modeLife, 'alive', 'the respawn revives it');
  assert.equal(a.modeLives, lives + 1, 'a revive begins a new life');
  assert.equal(events.filter((e) => e.type === 'mode_respawn' && e.payload.id === 'a').length, 1, 'one revive event');
  ctf.reviveAll();
  assert.equal(a.modeLives, lives + 2, 'a living hull revived (a kick-off, the range reset) begins a new life too');
}
{
  const pilot = tank('pilot', 'alpha', 0, -150, false), convoy = tank('convoy', 'alpha', 0, -150), hostile = tank('hostile', 'bravo', 0, 150);
  const mode = createMatchModeController({ mode: 'ac130', entities: [pilot, convoy, hostile],
    setActive(target, active) { target.modeActive = active; }, revive });
  convoy.state.pos.x = mode.state.escort.x; convoy.state.pos.z = mode.state.escort.z;
  mode.step(1 / 60, 1);
  assert.equal(convoy.modeLife, 'rescued');
  assert.equal(convoy.modeActive, false);
  assert.equal(convoy.combat.destroyed, false, 'extraction does not fake destruction');
  mode.reviveAll();
  assert.equal(convoy.modeLife, 'rescued', 'a rescued hull has left for good: the revive is refused');
  assert.equal(convoy.modeActive, false);
}

// ---- round 2 U9: the second way back to alive. A wreck whose combat state another hand stood live again (a migrated
// host's row: applyResumeState writes combat.destroyed from the old host's newer row) begins a new life as a revive does:
// modeLives counts it (lag compensation's life boundary) and its pending respawn is dropped, so the due revive does not
// throw the living hull back to its spawn. Before, the life moved to alive and nothing else.
{
  const a = tank('a', 'alpha', 0, -100, false), b = tank('b', 'bravo', 0, 100);
  const events = [];
  const ctf = createMatchModeController({ mode: 'capture_the_flag', entities: [a, b],
    emit: (type, payload) => events.push({ type, payload }), revive });
  a.combat.destroyed = true;
  ctf.step(1 / 60, 1);
  assert.equal(a.modeLife, 'down');
  const lives = a.modeLives ?? 0;
  a.combat = { hp: 640, maxHp: 1000, destroyed: false, ammo: [12], ammoCapacity: [20] }; // the row's live hull
  Object.assign(a.state.pos, { x: 33, z: 44 });
  ctf.step(1 / 60, 1.5);
  assert.equal(a.modeLife, 'alive', 'a live row is a live hull');
  assert.equal(a.modeLives, lives + 1, 'and a new life: the life boundary moves with it');
  ctf.step(1 / 60, 40);
  assert.deepEqual([a.state.pos.x, a.state.pos.z], [33, 44], 'the old death\'s respawn does not throw the living hull back to its spawn');
  assert.equal(a.combat.hp, 640, 'nor refit it');
  assert.equal(events.filter((e) => e.type === 'mode_respawn' && e.payload.id === 'a').length, 0,
    'no mode_respawn: the revive was the old host\'s and was announced there');
  a.combat.destroyed = true;
  ctf.step(1 / 60, 41);
  assert.equal(a.modeLife, 'down', 'its next death is a death');
}

console.log('modeLife: one life state per tank; a refused Horde arrival retries as an arrival and stays owed, not alive; a restore benches its resting hulls; a wreck stood live by a migrated row begins a counted life');
