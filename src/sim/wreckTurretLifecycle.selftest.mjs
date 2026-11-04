// A wreck's turret body over its hull's life (2026-11-02 audit 11-sim-2 #9). The turret body was a Map's membership
// plus the rigid sleep flag, and the step decided its fate only for hulls on the field and not in the air, so:
//  - a hull alive again but off the field (modeActive false) kept its old body, and a wreck benched off the field kept
//    its turret in the world, invisible and unshootable, for other turrets to land on;
//  - a drone carrier, parked on the ground while its drone flew, stood as no hull at all: turrets fell through it;
//  - a world full of turrets in flight refused the next kill's (it never flew), and a full world of settled turrets
//    launched it differently from an empty one (the retry dropped the hull's yaw rate and the cook-off's grace);
//  - reset kept every hull it had numbered, so a world reused match after match kept growing.
// Now one owner: phase(id) is the declared state (seated | flown | settled), keepsTurretBody is the one rule for when a
// body must go, the world holds a body for every hull a match fields, and reset leaves a fresh world.
import assert from 'node:assert/strict';
import { getSpec } from '../vehicles/specs.ts';
import * as wreck from './wreckTurrets.ts';

const { createWreckEnvironment, createWreckTurrets, wreckTurretProfile } = wreck;
const m1 = getSpec('m1a1_abrams_hc');
const flat = createWreckEnvironment(() => 0, [], []);
const pose = new Float64Array(7);
const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok   ${name}`); } catch (error) { failures.push(name); console.log(`  FAIL ${name}: ${error.message}`); }
}

function hull(id, x, z, { destroyed = true, yaw = 0, yawRate = 0, ...extra } = {}) {
  return {
    id, spec: m1, combat: { destroyed },
    state: { pos: { x, y: 0, z }, yaw, visualPitch: 0, visualRoll: 0, turretYaw: 0, speed: 0, verticalSpeed: 0, yawRate },
    ...extra,
  };
}
// the declared phase where the owner offers it; on an older tree the same reading of its storage
const phase = (turrets, id) => (typeof turrets.phase === 'function' ? turrets.phase(id)
  : !turrets.has(id) ? 'seated' : turrets.settled(id) ? 'settled' : 'flown');
function settle(turrets, tanks, max = 1500) {
  for (let n = 0; n < max; n++) {
    turrets.step(tanks);
    if (turrets.ids().every((id) => turrets.settled(id))) return n + 1;
  }
  return -1;
}
/** A turret lying level on its base on the flat ground, its frame at (x, z). */
const lying = (x, z) => ({ x, y: 0, z, qx: 0, qy: 0, qz: 0, qw: 1, asleep: true });
const profile = wreckTurretProfile(m1);
const turretTop = profile.turretCenter[1] + profile.turretHalf[1];

console.log('wreckTurretLifecycle.selftest');

// --- the phases: seated → flown (the kill) → settled (rigid sleep) → seated (the hull lives again); a restore puts a
// body back settled or flying; reset seats every turret
check('phases: a kill flies, sleeps, and a hull alive again takes its turret back', () => {
  const turrets = createWreckTurrets({ seed: 2 });
  turrets.bind(flat);
  const h = hull('p', 0, 0);
  assert.equal(phase(turrets, 'p'), 'seated');
  assert.equal(turrets.launch(h, 'shot', 30), true);
  assert.equal(phase(turrets, 'p'), 'flown');
  assert.ok(settle(turrets, [h]) > 0);
  assert.equal(phase(turrets, 'p'), 'settled');
  h.combat.destroyed = false;
  turrets.step([h]);
  assert.equal(phase(turrets, 'p'), 'seated');
  assert.equal(turrets.restore(hull('q', 30, 0), { ...lying(30, 0), asleep: false }), true);
  assert.equal(phase(turrets, 'q'), 'flown');
  turrets.reset();
  assert.equal(phase(turrets, 'q'), 'seated');
});

// --- the one rule: a hull keeps a turret body only while it lies on the field as a wreck
check('keepsTurretBody: a wreck on the field keeps it; alive again, or off the field, gives it up', () => {
  assert.equal(typeof wreck.keepsTurretBody, 'function', 'the lifecycle rule is declared (wreckTurrets.ts keepsTurretBody)');
  const rule = wreck.keepsTurretBody;
  assert.equal(rule(hull('a', 0, 0)), true, 'a wreck on the field');
  assert.equal(rule(hull('a', 0, 0, { modeActive: true })), true);
  assert.equal(rule(hull('a', 0, 0, { destroyed: false })), false, 'alive again');
  assert.equal(rule(hull('a', 0, 0, { destroyed: false, modeActive: false })), false, 'alive again, off the field');
  assert.equal(rule(hull('a', 0, 0, { modeActive: false })), false, 'a wreck benched off the field');
  assert.equal(rule(hull('a', 0, 0, { aerial: { kind: 'drone', active: true } })), true, "a drone carrier's wreck");
});

// --- a hull alive again keeps no body whatever its mode flag says (the escort's rescued hull is hidden alive; a
// migrated host's wave restore rests a pool hull without a death)
check('a hull alive again but off the field gives its old turret body up', () => {
  const turrets = createWreckTurrets({ seed: 4 });
  turrets.bind(flat);
  const h = hull('r', 0, 0);
  turrets.launch(h, 'shot', 10);
  settle(turrets, [h]);
  h.combat.destroyed = false;
  h.modeActive = false;
  turrets.step([h]);
  assert.equal(phase(turrets, 'r'), 'seated', `kept its old turret body (${phase(turrets, 'r')})`);
});

// --- a wreck benched off the field (the Horde's next wave, a Frontline sector) takes its turret with it: nothing is
// left in the world that no one sees or can shoot, for the next turret to land on
check('a benched wreck leaves no turret body for others to land on', () => {
  const turrets = createWreckTurrets({ seed: 6 });
  turrets.bind(flat);
  // the benched hull's turret lies on the ground 20 m off its hull, as a cook-off left it
  const benched = hull('b', 20, 0);
  assert.equal(turrets.restore(benched, lying(0, 0)), true);
  // another wreck's turret comes down level over it from 0.4 m above its roof
  const other = hull('o', -20, 0);
  assert.equal(turrets.restore(other, { ...lying(0, 0), y: turretTop + 0.4, asleep: false }), true);
  benched.modeActive = false;
  settle(turrets, [benched, other]);
  turrets.framePose('o', pose);
  assert.ok(pose[1] < 0.3, `the falling turret lies on the ground, not on an invisible one (frame y ${pose[1].toFixed(2)} m)`);
  assert.equal(phase(turrets, 'b'), 'seated', 'the benched turret left the world');
});

// --- a drone carrier parks its hull on the ground while its drone flies: the turrets meet it as any hull; a gunship
// flies its orbit and is no hull in the world
check("a drone carrier's parked hull stops a falling turret", () => {
  const turrets = createWreckTurrets({ seed: 8 });
  turrets.bind(flat);
  const carrier = hull('carrier', 0, 0, { destroyed: false, modeActive: true, aerial: { kind: 'drone', active: true } });
  const other = hull('o', 40, 0);
  // over the carrier's engine deck, behind its turret
  const deckZ = profile.hullCenter[2] - profile.hullHalf[2] * 0.6;
  assert.equal(turrets.restore(other, { ...lying(0, deckZ), y: profile.pivot[1] + 1, asleep: false }), true);
  settle(turrets, [carrier, other]);
  turrets.framePose('o', pose);
  assert.ok(pose[1] > profile.pivot[1] - 0.5, `it rests on the parked hull (frame y ${pose[1].toFixed(2)} m, deck ${profile.pivot[1].toFixed(2)} m)`);
});
check("a gunship's orbit stands as no hull: a turret under it falls on", () => {
  const turrets = createWreckTurrets({ seed: 9 });
  turrets.bind(flat);
  const gunship = hull('gunship', 0, 0, { destroyed: false, modeActive: true, aerial: { kind: 'gunship', active: true } });
  gunship.state.pos.y = 300;
  const other = hull('o', 40, 0);
  assert.equal(turrets.restore(other, { ...lying(0, 0), y: 300 + profile.pivot[1] + 0.3, asleep: false }), true);
  for (let n = 0; n < 60; n++) turrets.step([gunship, other]);
  turrets.framePose('o', pose);
  assert.ok(pose[1] < 300 - 2, `it fell past the orbit (frame y ${pose[1].toFixed(1)} m)`);
});

// --- capacity: the world holds a body for every hull a match fields (64, the wire's MAX_ENTITIES: the authority's
// world), so every kill's turret flies, a whole roster's in one moment included
check('a world holds every hull of a full match in flight at once', () => {
  const turrets = createWreckTurrets({ seed: 12 });
  turrets.bind(flat);
  const tanks = [];
  for (let n = 0; n < 64; n++) tanks.push(hull(`k${n}`, (n % 8) * 14, Math.floor(n / 8) * 14));
  const refused = tanks.filter((tank) => !turrets.launch(tank, 'ammorack', 100)).map((tank) => tank.id);
  assert.deepEqual(refused, [], `refused ${refused.length} of 64 kills (${refused.slice(0, 3).join(', ')}…)`);
  turrets.step(tanks);
  assert.equal(turrets.ids().length, 64);
});
// a world sized below its roster: the oldest settled body gives way, else the oldest flying one; the kill always flies
check('an undersized world full of turrets in flight still throws the next kill', () => {
  const turrets = createWreckTurrets({ seed: 13, capacity: 2 });
  turrets.bind(flat);
  const a = hull('a', 0, 0), b = hull('b', 20, 0), c = hull('c', 40, 0);
  assert.equal(turrets.launch(a, 'ammorack', 50), true);
  assert.equal(turrets.launch(b, 'ammorack', 50), true);
  turrets.step([a, b]);
  assert.equal(turrets.launch(c, 'ammorack', 51), true, 'the third kill flies');
  assert.deepEqual([phase(turrets, 'a'), phase(turrets, 'b'), phase(turrets, 'c')], ['seated', 'flown', 'flown'],
    'the oldest gave way');
});
// the kill launches the same whether or not the world had to make room for it
check('a kill into a full world launches as into an empty one', () => {
  const trajectory = (full) => {
    const turrets = createWreckTurrets({ seed: 14, capacity: 1 });
    turrets.bind(flat);
    const old = hull('old', 60, 60);
    if (full) assert.equal(turrets.restore(old, lying(60, 40)), true);
    const fresh = hull('new', 0, 0, { yaw: 0.4, yawRate: 0.8 });
    assert.equal(turrets.launch(fresh, 'ammorack', 77), true);
    const out = [];
    for (let n = 0; n < 40; n++) { turrets.step([old, fresh]); turrets.framePose('new', pose); out.push(...pose); }
    return out.map((value) => Math.round(value * 1e9));
  };
  assert.deepEqual(trajectory(true), trajectory(false), 'the same flight');
});

// --- reset leaves a fresh world: every hull it numbered forgotten, a match after it numbered as on a new world
check('reset forgets every hull the last match numbered', () => {
  const reused = createWreckTurrets({ seed: 15 });
  reused.bind(flat);
  assert.equal(typeof reused.owner, 'function', "the hulls' numbering is readable (wreckTurrets.ts owner)");
  const first = [hull('x1', 0, 0), hull('x2', 20, 0, { destroyed: false })];
  reused.launch(first[0], 'shot', 5);
  for (let n = 0; n < 10; n++) reused.step(first);
  assert.ok(reused.owner('x1') > 0 && reused.owner('x2') > 0);
  reused.reset();
  assert.equal(reused.owner('x1'), 0, 'the last match forgotten');
  const fresh = createWreckTurrets({ seed: 15 });
  fresh.bind(flat);
  const match = (turrets) => {
    const tanks = [hull('y1', 0, 0), hull('y2', 0, 25, { destroyed: false })];
    turrets.launch(tanks[0], 'ammorack', 9);
    settle(turrets, tanks);
    return { owners: tanks.map((tank) => turrets.owner(tank.id)), digest: turrets.digest() };
  };
  assert.deepEqual(match(reused), match(fresh), 'numbered and landed as on a new world');
});

if (failures.length) {
  console.log(`wreckTurretLifecycle.selftest: ${failures.length} FAILED: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('wreckTurretLifecycle.selftest: phases, the keep rule, revived and benched hulls, parked drone carriers and gunships, a full match in flight, an undersized world, the same launch into a full world, reset');
