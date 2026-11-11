// spottingLife.selftest — spotting follows the mode's life state, and the linger ends on time (audit M4, 2026-11-02).
// Liveness was `!combat.destroyed` alone, so a hull the mode had taken off the field without destroying it (an AC-130
// convoy hull extracted; a migrated host's parked hull before its rows land) was spotted where it stood, and spotted
// for its side from there. And the 5 s still-spotted window expired only inside a check, so a target that slipped away
// read as spotted for up to one check interval (2 s) longer.
import assert from 'node:assert/strict';
import { SPOT_LINGER_S, createSpottingSystem } from './spotting.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const tank = (id, team, x, z) => ({ id, team, spec: { id: 'fixture_medium', role: 'medium', dims: { heightM: 2.7 } },
  state: { pos: { x, y: 0, z }, speed: 0 }, combat: { destroyed: false } });
const system = (tanks) => createSpottingSystem({ getTanks: () => tanks, raycast: null, concealers: [], rng: mulberry32(42) });

// ---- a hull off the field is neither spotted nor a spotter
{
  const observer = tank('observer', 'player', 0, 0), target = tank('target', 'enemy', 0, 30);
  const sys = system([observer, target]);
  sys.forceCheck(1);
  assert.ok(sys.isSpotted('target', 'player'), 'a hull on the field at 30 m is spotted');
  target.modeActive = false; // taken off the field, not destroyed (extracted, parked)
  sys.update(1 / 60, 1.1);
  assert.equal(sys.isSpotted('target', 'player'), false, 'its contact ends with its time on the field');
  sys.forceCheck(2);
  assert.equal(sys.isSpotted('target', 'player'), false, 'and it is not spotted where it stands');
  target.modeActive = true;
  sys.forceCheck(3);
  assert.ok(sys.isSpotted('target', 'player'), 'back on the field, it is spotted again');
  observer.modeActive = false;
  const other = tank('other', 'enemy', 0, -30);
  const sys2 = system([observer, other]);
  sys2.forceCheck(1);
  assert.equal(sys2.isSpotted('other', 'player'), false, 'a hull off the field spots nothing for its side');
}

// ---- the linger ends SPOT_LINGER_S after the last pass, not at the next check after that
{
  const observer = tank('observer', 'player', 0, 0), target = tank('target', 'enemy', 0, 30);
  const sys = system([observer, target]);
  let t = 0;
  const step = () => { t += 1 / 60; sys.update(1 / 60, t); };
  while (!sys.isSpotted('target', 'player') && t < 3) step();
  assert.ok(sys.isSpotted('target', 'player'), 'spotted up close');
  for (let i = 0; i < 30; i++) step(); // a few near checks (0.5 s apart)
  const movedAt = t;
  target.state.pos.z = 2000; // gone: the next checks fail, 2 s apart at this range
  let lostAt = null;
  while (lostAt == null && t < movedAt + 10) { step(); if (!sys.isSpotted('target', 'player')) lostAt = t; }
  assert.ok(lostAt != null, 'the contact is lost');
  assert.ok(lostAt > movedAt + SPOT_LINGER_S - 0.5 - 1e-9, `the linger holds about ${SPOT_LINGER_S} s (lost ${(lostAt - movedAt).toFixed(3)} s after)`);
  assert.ok(lostAt <= movedAt + SPOT_LINGER_S + 1 / 60 + 1e-9,
    `and ends ${SPOT_LINGER_S} s after the last pass, not at a later check (lost ${(lostAt - movedAt).toFixed(3)} s after it left)`);
}
console.log('spottingLife: a hull off the field is neither spotted nor spotting; the linger ends on time');
