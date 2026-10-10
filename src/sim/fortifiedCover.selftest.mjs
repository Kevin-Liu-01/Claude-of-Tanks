// The pillbox, fortified cover (sim/fortifiedCover.ts; the coordinator's ruling of 2026-10-09): it stops every round and
// every hull, and only accumulated heavy blows bring it down — a few large-calibre HE hits or a heavy ram, never small
// calibre or a kinetic rod. The law over real rounds; the solo step and the authority call the ledger at the same moments;
// the authority, run for real: a round stops on the pillbox and the tank behind takes no hit, the third 125 mm HE round
// brings it down, APFSDS never does, a heavy hull's ram brings it down, a press at the wall never does.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { createAuthoritativeMatch } from './authoritativeMatch.ts';
import {
  FORTIFIED_HIT_FLOOR_SP, FORTIFIED_HP_SP, createFortifiedCoverLedger, fortifiedRamPoints, fortifiedShellPoints,
  isFortifiedCoverRecord,
} from './fortifiedCover.ts';
import { createObstacleGrid, hullYieldingRecord, isFortifiedCoverKind, setObbShape, shellPassesThroughCollisionRecord } from '../world/collision.ts';
import { getSpec } from '../vehicles/specs.ts';

// ---- the kinds -------------------------------------------------------------------------------------------------------
assert.equal(isFortifiedCoverKind('bunker'), true, 'the pillbox is fortified cover');
for (const kind of ['crate', 'fieldhut', 'wallstone', 'sandbagwall', 'tree', undefined]) assert.equal(isFortifiedCoverKind(kind), false, `${kind} is not`);
const pillboxRecord = { min: [-3, 0, -2.7], max: [3, 2.45, 2.7], crushable: true, kind: 'bunker', propIdx: 4 };
assert.equal(shellPassesThroughCollisionRecord(pillboxRecord), false, 'every round stops on a pillbox');
assert.equal(hullYieldingRecord(pillboxRecord), false, 'a hull never drives through one (the bots go round)');
assert.equal(hullYieldingRecord({ crushable: true, kind: 'crate' }), true, 'a crate is still driven through');
assert.equal(isFortifiedCoverRecord(pillboxRecord), true);
assert.equal(isFortifiedCoverRecord({ ...pillboxRecord, crushable: false }), false, 'a non-crushable record is the world, not a pillbox');

// ---- the law over real rounds ----------------------------------------------------------------------------------------
const t90 = getSpec('t90m'), m1 = getSpec('m1a2');
const round = (spec, type) => spec.gun.shells.find((shell) => shell.type === type);
const hitsToBreak = (spec, limit = 60) => {
  const ledger = createFortifiedCoverLedger();
  const record = { propIdx: 1 };
  for (let hit = 1; hit <= limit; hit++) if (ledger.shellHit(record, spec)) return hit;
  return Infinity;
};
assert.ok(Math.abs(FORTIFIED_HP_SP - 30.625) < 1e-9, 'two and a half contact bursts of the nominal 3.5 kg tank HE round');
assert.equal(hitsToBreak(round(t90, 'HE')), 3, '125 mm HE: the third hit');
assert.equal(hitsToBreak(round(m1, 'HE')), 3, '120 mm HE: the third hit');
assert.equal(hitsToBreak(round(m1, 'HEAT')), 4, '120 mm HEAT: the fourth');
assert.equal(hitsToBreak({ type: 'HE', caliberMm: 152, name: 'OF-540' }), 2, '152 mm howitzer HE: the second');
assert.equal(hitsToBreak({ type: 'HE', caliberMm: 120, name: 'L31 HESH' }), 2, '120 mm HESH: the second');
assert.equal(hitsToBreak({ type: 'HE', caliberMm: 105 }), 5, '105 mm HE: the fifth');
for (const [label, spec] of [['M829A4 APFSDS', round(m1, 'APFSDS')], ['3BM60 APFSDS', round(t90, 'APFSDS')],
  ['30 mm AP', { type: 'AP', caliberMm: 30 }], ['30 mm HEI', { type: 'HE', caliberMm: 30, name: 'HEI-T' }],
  ['12.7 mm', { type: 'AP', caliberMm: 12.7 }], ['76 mm HE', { type: 'HE', caliberMm: 76 }]]) {
  assert.equal(fortifiedShellPoints(spec), 0, `${label} leaves no mark`);
  assert.equal(hitsToBreak(spec, 500), Infinity, `${label} never brings it down`);
}
assert.ok(fortifiedShellPoints({ type: 'HE', caliberMm: 90 }) >= FORTIFIED_HIT_FLOOR_SP, '90 mm HE is the smallest tank HE round that counts');
// the ram: energy above reinforced concrete's scuff (1.1 MJ), 40 kJ a point
assert.equal(fortifiedRamPoints(60, 6), 0, 'a 60 t hull at 6 m/s (1.08 MJ) only scuffs it');
assert.ok(fortifiedRamPoints(60, 9) >= FORTIFIED_HP_SP, 'a 60 t hull at 9 m/s brings it down in one ram');
assert.ok(fortifiedRamPoints(40, 10) < FORTIFIED_HP_SP && 2 * fortifiedRamPoints(40, 10) >= FORTIFIED_HP_SP, 'a 40 t hull at 10 m/s in two');
assert.ok(fortifiedRamPoints(20, 12) < FORTIFIED_HP_SP / 3, 'a 20 t hull at 12 m/s barely marks it');
{
  // one contact counts its peak once, however many steps it presses; a second contact adds again
  const ledger = createFortifiedCoverLedger();
  const contact = { propIdx: 9 };
  const per = fortifiedRamPoints(40, 10);
  let broke = false;
  for (let step = 0; step < 120; step++) broke ||= ledger.ram(contact, 40, step < 3 ? 10 : 0.5, step / 60);
  assert.equal(broke, false, 'two seconds pressing after one 10 m/s ram: still one ram');
  assert.ok(Math.abs(ledger.pointsOf(contact) - per) < 1e-9, 'booked once at its peak');
  assert.equal(ledger.ram(contact, 40, 10, 2.1), false, 'a ram straight after, in the same contact, adds nothing');
  assert.equal(ledger.ram(contact, 40, 10, 3.0), true, 'a second ram (a fresh contact) brings it down');
  assert.equal(ledger.ram(contact, 40, 10, 5.0), false, 'a pillbox comes down once');
  // the shells' collider and the hull's contact record are one prop: their blows add up
  const shared = createFortifiedCoverLedger();
  assert.equal(shared.shellHit({ propIdx: 3, kind: 'bunker' }, round(t90, 'HE')), false);
  assert.equal(shared.shellHit({ propIdx: 3, kind: 'bunker' }, round(t90, 'HE')), false);
  assert.equal(shared.ram({ propIdx: 3 }, 40, 9, 1), true, 'two HE hits and a 40 t ram at 9 m/s: down');
}

// ---- the solo step and the authority call it at the same moments ----------------------------------------------------
const solo = readFileSync(new URL('../game/state.ts', import.meta.url), 'utf8');
const authority = readFileSync(new URL('./authoritativeMatch.ts', import.meta.url), 'utf8');
assert.match(solo, /game\._fortified = createFortifiedCoverLedger\(\);/, 'solo: one ledger a battle');
assert.match(authority, /const fortified = createFortifiedCoverLedger\(\);/, 'authority: one ledger a match');
assert.match(solo, /if \(isFortifiedCoverRecord\(record\) && !fortified\?\.shellHit\(record, shell\.spec\)\) return;/, 'solo: a round that stops on it');
assert.match(solo, /crushWorldPropFromShell\(world, bus, shell, hit, game\._fortified\);/, 'solo: at the world impact');
assert.match(authority, /if \(isFortifiedCoverRecord\(obstacle\) && !fortified\.shellHit\(obstacle, shell\.spec\)\) return;/, 'authority: a round that stops on it');
for (const [name, text, call] of [['solo', solo, /return game\._fortified\?\.ram\(obstacle, self\.spec\.weightTons, closing, game\.timeS\) \?\? false;/],
  ['authority', authority, /return fortified\.ram\(obstacle, entity\.spec\.weightTons, closing, timeS\);/]]) {
  assert.match(text, /const closing = Math\.max\(0, -state\.speed \* \(Math\.sin\(state\.yaw\) \* pushX \+ Math\.cos\(state\.yaw\) \* pushZ\) \/ length\);\s*return (game\._fortified\?|fortified)\.ram\(/,
    `${name}: a ram on the closing speed along the contact`);
  assert.match(text, call, `${name}: the ram books on the ledger`);
  assert.match(text, /obstacle\.min\[1\] > y \+ radius \|\| isFortifiedCoverRecord\(obstacle\)\) continue;/, `${name}: no fall to a burst beside it`);
}
const ai = readFileSync(new URL('../game/ai.ts', import.meta.url), 'utf8');
assert.match(ai, /if \(hullYieldingRecord\(o\)\) \{\s*if \(input\.throttle > 0\.05\)/, 'the bots drive through crushables, round a pillbox');

// ---- the authority, run for real -------------------------------------------------------------------------------------
// A pillbox 6 × 5.4 m across the line between two hulls on verdant (the authoritativeMatch receipt's tree line), its
// contact record from the ground line up 2.45 m, as the build seats one.
const probe = createAuthoritativeMatch({ mapId: 'verdant', seed: 1, countdownS: 0,
  players: [{ id: 'probe', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -140, yaw: 0 } }] });
let base = Infinity;
for (let x = -3; x <= 3; x += 1) for (let z = -38; z <= -32; z += 1) base = Math.min(base, probe.heightField.getHeightAt(x, z));
function pillboxWorld() {
  const record = setObbShape({ min: [0, base - 0.08, 0], max: [0, base + 2.37, 0], crushable: true, crushed: false,
    propIdx: 0, kind: 'bunker', crushMin: 999, crushKeep: 0 }, 0, -35, 3.0, 2.7, 0);
  const obstacles = [record];
  const crushes = [];
  return {
    record, crushes,
    world: {
      mapId: 'verdant',
      getObstacles: () => obstacles,
      queryObstacles: createObstacleGrid(obstacles),
      raycast(origin, dir, maxDist) {
        if (record.crushed || Math.abs(dir.z) < 1e-9) return null;
        const distance = (-37.7 - origin.z) / dir.z;
        if (distance < 0 || distance > maxDist) return null;
        const x = origin.x + dir.x * distance, y = origin.y + dir.y * distance;
        if (Math.abs(x) > 3 || y > base + 2.37) return null;
        return { dist: distance, kind: 'prop', record, normal: new Vector3(0, 0, -1) };
      },
      crushObstacle(obstacle, directionX, directionZ, speedMps, cause) {
        crushes.push({ obstacle, directionZ, speedMps, cause });
        obstacle.crushed = true;
        return true;
      },
    },
  };
}
function duel(shooterSpec, slot, steps) {
  const { record, crushes, world } = pillboxWorld();
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed: 3, countdownS: 0, worldCollision: world,
    players: [
      { id: 'gun', specId: shooterSpec, team: 'alpha', spawn: { x: 0, z: -50, yaw: 0 } },
      { id: 'behind', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 50, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  const fire = new Map([['gun', { throttle: 0, steer: 0, brake: false, fire: true, aimYaw: 0, aimPitch: 0, shellSlot: slot }]]);
  const impacts = [], hitsBehind = [], destroyed = [];
  let brokeAt = -1;
  const seen = new Set();
  for (let i = 0; i < steps; i++) {
    match.step({ dt: 1 / 60, inputs: fire });
    for (const event of match.snapshot({ tick: i, serverTimeMs: i * 16, viewerId: 'gun', ackInputSeq: 1 }).events) {
      if (seen.has(event)) continue;
      seen.add(event);
      if (event.type === 'shell_impact' && event.surfaceKind === 'bunker' && event.caliberMm >= 100) impacts.push(event);
      // the main gun's rounds (the roof machine gun's 12.7 mm, fired level from 2.9 m, clears a 2.45 m pillbox at 15 m)
      if (event.type === 'shell_hit' && event.targetId === 'behind' && event.caliberMm >= 100 && brokeAt < 0) hitsBehind.push(event);
      if (event.type === 'world_prop_destroyed') destroyed.push(event);
    }
    if (brokeAt < 0 && record.crushed) brokeAt = impacts.length;
  }
  return { record, crushes, impacts, hitsBehind, brokeAt, destroyed };
}
{
  const he = duel('t90m', 2, 60 * 40);
  assert.ok(he.impacts.length >= 3, `rounds stop on the pillbox (${he.impacts.length} impacts)`);
  assert.equal(he.hitsBehind.length, 0, 'the tank behind takes no hit while the pillbox stands');
  assert.equal(he.record.crushed, true, 'the 125 mm HE rounds bring it down');
  const heBefore = he.impacts.slice(0, he.brokeAt).filter((event) => event.shellType === 'HE').length;
  assert.equal(heBefore, 3, `on the third HE hit (${he.impacts.slice(0, he.brokeAt).map((e) => e.shellType)})`);
  assert.equal(he.crushes.length, 1, 'broken once');
  assert.deepEqual(he.destroyed.map((event) => [event.kind, event.cause]), [['bunker', 'shell']], 'replicated as a shell kill of the pillbox');
  assert.ok(he.crushes[0].directionZ > 0, 'along the round');
}
{
  const ap = duel('m1a2', 0, 60 * 40);
  assert.ok(ap.impacts.length >= 5, `APFSDS rounds stop on the pillbox (${ap.impacts.length})`);
  assert.ok(ap.impacts.every((event) => event.shellType === 'APFSDS'));
  assert.equal(ap.record.crushed, false, 'and never bring it down');
  assert.equal(ap.hitsBehind.length, 0, 'the tank behind takes none of them');
}
// the hull: a heavy ram brings it down; a press at the wall never does (the crushable's held press)
function ram(specId, startZ, steps) {
  const { record, crushes, world } = pillboxWorld();
  const match = createAuthoritativeMatch({
    mapId: 'verdant', seed: 5, countdownS: 0, worldCollision: world,
    players: [
      { id: 'hull', specId, team: 'alpha', spawn: { x: 0, z: startZ, yaw: 0 } },
      { id: 'far', specId: 'm1a2', team: 'bravo', spawn: { x: 60, z: 120, yaw: Math.PI } },
    ],
  });
  match.onMatchReady();
  const drive = new Map([['hull', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: 0, aimPitch: 0, shellSlot: 0 }]]);
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    match.step({ dt: 1 / 60, inputs: drive });
    if (!record.crushed) peak = Math.max(peak, Math.abs(match.entityById.get('hull').state.speed));
  }
  return { record, crushes, hull: match.entityById.get('hull'), peak };
}
{
  const heavy = ram('m1a2', -140, 60 * 20);
  assert.equal(heavy.record.crushed, true, `a 66.8 t hull at ${heavy.peak.toFixed(1)} m/s brings it down`);
  assert.ok(fortifiedRamPoints(66.8, heavy.peak) >= FORTIFIED_HP_SP, 'as the ram law prices it');
  const press = ram('m1a2', -44, 60 * 12);
  assert.ok(press.peak < 6.4, `the press run meets the wall slowly (${press.peak.toFixed(2)} m/s)`);
  assert.equal(press.record.crushed, false, 'twelve seconds of full throttle against the wall: it holds');
  assert.ok(press.hull.state.pos.z < -37.7 - 2, 'and the hull stays outside it');
}
console.log('fortifiedCover selftest: ok');
