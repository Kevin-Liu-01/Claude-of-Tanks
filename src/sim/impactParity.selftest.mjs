// Impact physics (owner 2026-09-25) — parity and determinism: the solo step (game/state.ts) and the network
// authority (sim/authoritativeMatch.ts) price crashes, falls and rams through the same sim/impact.ts functions
// with the same attribution, the mode controller stamps the ruleset block on every entity, and the authority
// replays a crash-heavy battle bit-for-bit from the same seed. Then the authority actually crashes: a hull driven
// into a wall loses hit points with a `tank_impact` event, a hull dropped from height takes a `fall`, and a wreck
// takes nothing. Run: node src/sim/impactParity.selftest.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import { resetTankVerticalState } from './movement.ts';
import { matchRulesetFor } from './matchRuleset.ts';
import { hardImpactDamage, fallDamage } from './impact.ts';

const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
const modes = readFileSync(new URL('./matchModes.ts', import.meta.url), 'utf8');

// ---- structural parity ------------------------------------------------------------------------------------------
for (const name of ['exchangeRamMomentum', 'fallAttitudeFactor', 'hullVelocityAlong', 'ramAggression', 'ramShares', 'resolveHullImpact']) {
  assert.match(solo, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '../sim/impact.ts'`), `the solo step imports ${name} from sim/impact.ts`);
  assert.match(authority, new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from './impact.ts'`), `the authority imports ${name} from sim/impact.ts`);
}
for (const text of [solo, authority]) {
  assert.match(text, /IMPACT_CRASH_WINDOW_S = 0\.3;/, 'the crash window is 0.3 s in both sims');
  assert.match(text, /IMPACT_TICK_MIN_MPS = 0\.5;/, 'a contact tick under 0.5 m/s is a press, not a blow, in both sims');
  assert.match(text, /LANDING_EVENT_MIN_MPS = 3;/, 'landings over 3 m/s are events in both sims');
  assert.match(text, /const faceForward = -\(state\.impactNx \* fx \+ state\.impactNz \* fz\);/, 'the struck face is opposite the push in both sims');
  assert.match(text, /const sideSign = Math\.sign\(-\(state\.impactNx \* fz - state\.impactNz \* fx\)\);/, 'the struck side reads the same in both sims');
  assert.match(text, /state\.impactSource === IMPACT_SOURCE_CLIFF \|\|\s*\(state\.impactSource === IMPACT_SOURCE_COLLIDER && (collider\.)?hardContact\)/, 'a crash needs a hard surface in both sims');
  assert.match(text, /const closing = prior \+ impact;/, 'the crash accumulates its closing speed in both sims');
  assert.match(text, /priorClosingMps: prior/, 'and prices only the new energy in both sims');
  assert.match(text, /kind: 'fall',\s*closingMps: landing, priorClosingMps: 0, faceForward: 0, sideSign: 0, attitudeFactor, rng/, 'a landing is priced on the vertical closing speed and the attitude in both sims');
  assert.match(text, /ramAggression\(contact\.closing, -contact\.vAn\), ramAggression\(contact\.closing, contact\.vBn\)/, 'the ram aggression split is shared');
  assert.match(text, /contact\.vertical \? 0 : -\(contact\.nx \* afx \+ contact\.nz \* afz\)/, 'the rammer\'s struck face is shared');
  assert.match(text, /if \(!contact\.vertical\) \{/, 'roof landings skip the horizontal exchange in both sims');
  assert.match(text, /vAn: -closing, vBn: 0, vertical: true/, 'a roof landing queues the upper hull as the aggressor in both sims');
  assert.match(text, /const vAn = hullVelocityAlong\((self|entity)\.state, (normalX|nx), (normalZ|nz)\);\s*const vBn = hullVelocityAlong\(other\.state, (normalX|nx), (normalZ|nz)\);\s*const closing = vBn - vAn;/,
    'the closing speed is the difference of the normal velocities in both sims');
}
assert.match(solo, /exchangeRamMomentum\(contact\.a\.state, contact\.b\.state, contact\.nx, contact\.nz,\s*contact\.a\.spec\.weightTons, contact\.b\.spec\.weightTons, contact\.vAn, contact\.vBn, game\.ruleset\.physics\.ramRestitution\)/,
  'the solo step exchanges momentum with the ruleset restitution');
assert.match(authority, /exchangeRamMomentum\(contact\.a\.state, contact\.b\.state, contact\.nx, contact\.nz,\s*contact\.a\.spec\.weightTons, contact\.b\.spec\.weightTons, contact\.vAn, contact\.vBn, ruleset\.physics\.ramRestitution\)/,
  'the authority exchanges momentum with the ruleset restitution');
assert.match(modes, /entity\.modePhysics = ruleset\.physics;/, 'the mode controller stamps the physics block on every entity');
assert.match(solo, /announceDestroyed\(bus, entity, null, kind\)/, 'a self-inflicted destruction names its cause (impact / fall) in solo');
assert.match(authority, /emit\('tank_destroyed', \{ id: entity\.id, killerId: null, cause: kind \}\)/, 'and on the wire');

// ---- the authority crashes into a wall: hit points, event, modules ---------------------------------------------
const wall = { min: [-12, 0, -36], max: [12, 6, -34], shape2: { kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 1, yaw: 0 } };
const wallWorld = {
  mapId: 'verdant',
  getObstacles: () => [wall],
  queryObstacles: (_minX, _minZ, _maxX, _maxZ, out) => { out.length = 0; out.push(wall); return out; },
};
function wallMatch(seed = 7) {
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed, countdownS: 0, worldCollision: wallWorld,
    players: [
      { id: 'wall-a', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } },
      { id: 'wall-b', specId: 'm1a2', team: 'bravo', spawn: { x: 60, z: 120, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  return match;
}
const drive = new Map([['wall-a', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
/** The authority's event buffer outlives one snapshot: collect each impact event once, by identity. */
function impactEvents(match, tick, viewerId, seen, out, id = null) {
  for (const event of match.snapshot({ tick, serverTimeMs: tick * 16, viewerId, ackInputSeq: 1 }).events) {
    if (event.type !== 'tank_impact' || seen.has(event) || (id && event.id !== id)) continue;
    seen.add(event);
    out.push(event);
  }
}
{
  const match = wallMatch();
  const hull = match.entityById.get('wall-a');
  const hpBefore = hull.combat.hp;
  const events = [];
  const seen = new Set();
  for (let i = 0; i < 900; i++) {
    match.step({ dt: 1 / 60, inputs: drive });
    impactEvents(match, i, 'wall-a', seen, events);
  }
  assert.ok(hull.state.pos.z < -35 - 3, 'the wall stops the hull on the near side');
  const crash = events.find((event) => event.cause === 'impact' && event.damage > 0);
  assert.ok(crash, `a 100 m run into a wall is an impact event (${events.length} impact events seen)`);
  assert.equal(crash.id, 'wall-a');
  assert.ok(crash.closingMps > 8, `at speed (${crash.closingMps.toFixed(1)} m/s)`);
  const expected = hardImpactDamage(matchRulesetFor('standard').physics, hull.spec.weightTons, crash.closingMps, 1);
  assert.ok(Math.abs(crash.damage - expected) < 1, `priced by the frontal law (${crash.damage.toFixed(1)} vs ${expected.toFixed(1)} hp)`);
  assert.ok(hpBefore - hull.combat.hp >= crash.damage - 1e-6, 'and the hull lost it');
  assert.ok(crash.modulesHit.some((hit) => hit.module === 'trackL') && crash.modulesHit.some((hit) => hit.module === 'trackR'),
    'a head-on crash loads both tracks');
  assert.ok(crash.modulesHit.some((hit) => hit.module === 'engine'), 'and the engine');
  const totalDamage = events.reduce((sum, event) => sum + event.damage, 0);
  assert.ok(totalDamage < expected * 1.5, `holding the drive against the wall afterwards costs nothing more (${totalDamage.toFixed(1)} hp total over 15 s)`);
}

// ---- the authority replays the crash bit-for-bit from the same seed ------------------------------------------------
{
  const digest = (match) => match.entities.map((entity) => [
    entity.id, entity.state.pos.x.toFixed(9), entity.state.pos.y.toFixed(9), entity.state.pos.z.toFixed(9),
    entity.state.speed.toFixed(9), entity.state.yaw.toFixed(9), entity.combat.hp,
    Object.entries(entity.combat.modules).map(([name, module]) => `${name}:${module.hp}`).join(','),
  ].join('|')).join('\n');
  const a = wallMatch(11), b = wallMatch(11);
  for (let i = 0; i < 600; i++) {
    a.step({ dt: 1 / 60, inputs: drive });
    b.step({ dt: 1 / 60, inputs: drive });
  }
  assert.equal(digest(a), digest(b), 'the same seed and inputs replay 600 crash-heavy steps to identical states');
  assert.ok(a.entityById.get('wall-a').combat.hp < a.entityById.get('wall-a').combat.maxHp, 'and the crash happened in both');
}

// ---- a fall: a hull lifted 12 m lands with a `fall` event; a wreck lands free ------------------------------------
{
  const match = wallMatch(5);
  const hull = match.entityById.get('wall-b');
  match.step({ dt: 1 / 60, inputs: new Map() });
  const hpBefore = hull.combat.hp;
  resetTankVerticalState(hull.state, hull.state.pos.y + 12, 0, false);
  const falls = [];
  const seen = new Set();
  for (let i = 0; i < 240; i++) {
    match.step({ dt: 1 / 60, inputs: new Map() });
    impactEvents(match, i, 'wall-b', seen, falls, 'wall-b');
  }
  const fall = falls.find((event) => event.cause === 'fall' && event.damage > 0);
  assert.ok(fall, 'a 12 m drop lands with a fall event');
  assert.ok(fall.closingMps > 13 && fall.closingMps < 16, `at the drop's closing speed (${fall.closingMps.toFixed(1)} m/s)`);
  const floor = fallDamage(matchRulesetFor('standard').physics, hull.spec.weightTons, fall.closingMps, 1);
  assert.ok(fall.damage >= floor - 1e-6, `priced at least by the flat-landing law (${fall.damage.toFixed(1)} vs ${floor.toFixed(1)} hp)`);
  assert.ok(hull.combat.hp <= hpBefore - fall.damage + 1e-6, 'the hull lost it');
  assert.ok(hull.state.grounded, 'and is on the ground again');

  const wreck = match.entityById.get('wall-a');
  wreck.combat.hp = 0;
  wreck.combat.destroyed = true;
  resetTankVerticalState(wreck.state, wreck.state.pos.y + 12, 0, false);
  const wreckEvents = [];
  for (let i = 0; i < 240; i++) {
    match.step({ dt: 1 / 60, inputs: new Map() });
    impactEvents(match, 300 + i, 'wall-b', seen, wreckEvents, 'wall-a');
  }
  assert.ok(wreckEvents.every((event) => event.damage === 0), 'a wreck lands without damage (it only keeps its momentum)');
  assert.ok(wreck.state.grounded, 'and lands');
}

console.log('impactParity.selftest: shared impact functions and attribution in both sims, the mode stamp, an authoritative wall crash and a fall priced by the law, a wreck landing free, and a bit-for-bit 600-step replay pass');
