// Round 2 of the 2026-11-02 audit, U27 (world-destructibles R2, reset leftovers): a late joiner's settled destroyed list
// laid every prop as a ram toward +Z (battlePresentation.ts applyDestroyed called crushObstacle(obstacle, 0, 1, 0, 'ram')),
// because the snapshot's list carried indices only. Wire 11 carries each listed index's fall (src/sim/obstacleFall.ts: the
// cause and the heading in a byte), withheld as the live world_prop_destroyed event's cause and direction are. Here:
//   1. the fall byte: causes and headings round-trip, `none` is the withheld event's lay, no other byte is a code;
//   2. the authority records each fall as it felled the prop and gives it to the viewers that may read it: the source's
//      own team and a spectator read a hidden rammer's fall, the other team reads none; a restored list has none;
//   3. the match actor sorts the list and carries each viewer's falls with it, in the same order, onto the wire;
//   4. the wire: a keyframe carries every fall, a delta its additions', a frame applied onto its baseline keeps both,
//      the direct encoder writes the packet path's bytes, and a malformed falls section is refused;
//   5. the presentation lays each settled prop with its fall; a frame without falls lays it on its own axis, never +Z.
// Run with: node src/mp/presentation/settledFalls.selftest.mjs
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { OBSTACLE_FALL_NONE, decodeObstacleFall, encodeObstacleFall, isObstacleFallCode } from '../../sim/obstacleFall.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { createLoopbackLink } from '../../../server/match/link.ts';
import {
  MESSAGE_TYPE, PHASE, PROTOCOL_VERSION, VERDICT, WIRE_VERSION, applySnapshotPacket, buildSnapshotPacket, decodeMessage,
  encodeMessage, zeroEntityRow,
} from '../wire/index.ts';
import { encodeSnapshotFrame } from '../wire/codec.ts';
import { createBattlePresentation } from './index.ts';

await ensureAuthorityFleet();
const fall = { cause: 'ram', dx: 0, dz: 0 };
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;

// ---- 1. the fall byte ---------------------------------------------------------------------------------------------
{
  assert.ok(WIRE_VERSION >= 11 && PROTOCOL_VERSION >= 12, 'the falls are a layout change (wire 11, protocol 12)');
  for (const [cause, expected] of [['ram', 'ram'], ['shell', 'shell'], ['blast', 'shell']]) {
    for (let step = 0; step < 64; step++) {
      const heading = (step / 64) * 2 * Math.PI;
      const code = encodeObstacleFall(cause, Math.sin(heading) * 3, Math.cos(heading) * 3);
      assert.ok(isObstacleFallCode(code) && code !== OBSTACLE_FALL_NONE, `${cause} at step ${step} is a code`);
      decodeObstacleFall(code, fall);
      assert.equal(fall.cause, expected, `${cause} reads as ${expected}`);
      assert.ok(near(fall.dx, Math.sin(heading), 1e-6) && near(fall.dz, Math.cos(heading), 1e-6), `${cause} at step ${step}: its heading`);
    }
  }
  // any direction lands within half a step (2.8 degrees)
  for (let n = 0; n < 200; n++) {
    const angle = n * 0.0731;
    decodeObstacleFall(encodeObstacleFall('ram', Math.sin(angle), Math.cos(angle)), fall);
    const error = Math.abs(Math.atan2(Math.sin(angle - Math.atan2(fall.dx, fall.dz)), Math.cos(angle - Math.atan2(fall.dx, fall.dz))));
    assert.ok(error <= Math.PI / 64 + 1e-9, `heading error ${error}`);
  }
  decodeObstacleFall(OBSTACLE_FALL_NONE, fall);
  assert.deepEqual(fall, { cause: 'ram', dx: 0, dz: 0 }, 'none lays the prop as the withheld live event does: its own axis, as a ram');
  assert.equal(encodeObstacleFall('ram', NaN, 1), OBSTACLE_FALL_NONE, 'a direction that is no number records none');
  for (const bad of [0xc0, 0xff, 0x05, -1, 256, 1.5]) assert.equal(isObstacleFallCode(bad), false, `${bad} is no fall code`);
}

// ---- 2. the authority: each fall as it happened, withheld as its live event is -------------------------------------
{
  const fence = { min: [-12, -100, -35.5], max: [12, 100, -34.5], shape2: { kind: 'obb', cx: 0, cz: -35, hw: 12, hl: 0.5, yaw: 0 }, crushable: true, kind: 'fence' };
  const world = {
    mapId: 'verdant', getObstacles: () => [fence],
    queryObstacles: (_a, _b, _c, _d, out) => { out.length = 0; out.push(fence); return out; },
    raycast: () => null,
    crushObstacle(obstacle) { obstacle.crushed = true; return true; },
  };
  // the rammer drives south (-Z) through the fence; bravo is far out of sight; a teammate is far too
  const match = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: world, players: [
    { id: 'rammer', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -20, yaw: Math.PI } },
    { id: 'mate', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 400, z: 400, yaw: 0 } },
    { id: 'far', specId: 'm1a1_abrams_hc', team: 'bravo', spawn: { x: 0, z: 600, yaw: Math.PI } },
  ] });
  match.onMatchReady();
  const drive = new Map([['rammer', { throttle: 1, steer: 0, brake: false, fire: false, aimYaw: Math.PI, aimPitch: 0, shellSlot: 0 }]]);
  for (let i = 0; i < 360 && !fence.crushed; i++) match.step({ dt: 1 / 60, inputs: drive });
  assert.equal(fence.crushed, true, 'the rammer felled the fence');
  assert.ok(!match.snapshot({ tick: 1, serverTimeMs: 0, viewerId: 'far', ackInputSeq: 1 }).entities.some((entity) => entity.id === 'rammer'),
    'the rammer is hidden from bravo');
  const fallsOf = (viewerId) => match.snapshotMeta(viewerId).destroyedObstacleFalls;
  assert.deepEqual(match.snapshotMeta('rammer').destroyedObstacleIndices, [0]);
  decodeObstacleFall(fallsOf('rammer')[0], fall);
  assert.equal(fall.cause, 'ram');
  assert.ok(fall.dz < -0.99, `the rammer's team reads the fall it dealt: south (${fall.dx.toFixed(3)}, ${fall.dz.toFixed(3)})`);
  assert.deepEqual(fallsOf('mate'), fallsOf('rammer'), 'its whole team does');
  assert.deepEqual(fallsOf('spectator:watcher'), fallsOf('rammer'), 'a spectator does (as it reads the live event whole)');
  assert.deepEqual(fallsOf('far'), [OBSTACLE_FALL_NONE], 'the other team reads none: the heading would place the hidden rammer');
  const live = match.eventsForViewer('far').find((event) => event.type === 'world_prop_destroyed');
  assert.ok(live && !('directionZ' in live), 'as its live event withheld it');
  assert.equal(fallsOf('far'), fallsOf('far'), 'one array while the list stands (a frame never sees it move)');
  // a list restored from a keyframe names indices only: none
  const resumed = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, worldCollision: { ...world, getObstacles: () => [{ ...fence, crushed: false }] },
    players: [{ id: 'rammer', specId: 'm1a1_abrams_hc', team: 'alpha', spawn: { x: 0, z: -20, yaw: Math.PI } }] });
  resumed.restoreDestroyedObstacles([0], 1);
  assert.deepEqual(resumed.snapshotMeta('rammer').destroyedObstacleFalls, [OBSTACLE_FALL_NONE], 'a restored entry has no fall');
}

// ---- 3. the match actor: the sorted list and each viewer's falls in its order, on the wire ---------------------------
{
  let nowMs = 10_000;
  const actor = createMatchActor({
    roomId: 'falls', mapId: 'verdant', seed: 7, countdownS: 0, world: 'terrain', now: () => nowMs, schedule: () => () => {},
    seats: [
      { seat: 0, playerId: 'a1', name: 'A', team: 'alpha', specId: 'm1a1_abrams_hc' },
      { seat: 1, playerId: 'b1', name: 'B', team: 'bravo', specId: 't90am' },
    ],
  });
  // the authority's list in felling order with each viewer's falls (as authoritativeMatch.snapshotMeta gives them)
  const truth = [(1 << 6) | 10, (2 << 6) | 33, (1 << 6) | 60];
  const forAlpha = truth;
  const forBravo = [truth[0], OBSTACLE_FALL_NONE, truth[2]];
  const snapshotMeta = actor.authority.snapshotMeta.bind(actor.authority);
  actor.authority.snapshotMeta = (viewerId) => ({
    ...snapshotMeta(viewerId), destructibleRevision: 3, destroyedObstacleIndices: [9, 2, 5],
    destroyedObstacleFalls: viewerId === 'b1' ? forBravo : forAlpha,
  });
  const frames = { a1: [], b1: [] };
  for (const [seat, playerId, team] of [[0, 'a1', 'alpha'], [1, 'b1', 'bravo']]) {
    const link = createLoopbackLink(playerId);
    const history = new Map();
    link.client.onMessage((bytes) => {
      const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
      assert.ok(decoded.ok, `${playerId} decodes`);
      if (decoded.message.type !== MESSAGE_TYPE.SNAPSHOT) return;
      const frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : history.get(decoded.message.baseTick) ?? null);
      history.set(frame.tick, frame);
      frames[playerId].push(frame);
    });
    actor.attach(link.server, { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 't', clientBuild: 'selftest' },
      { v: 1, roomId: 'falls', seat, playerId, name: playerId, team, specId: seat ? 't90am' : 'm1a1_abrams_hc', iat: 0, exp: 1 });
  }
  for (let n = 0; n < 12; n++) { nowMs += 1000 / 60; actor.advance(nowMs); await new Promise((resolve) => setImmediate(resolve)); }
  const lastA = frames.a1.at(-1), lastB = frames.b1.at(-1);
  assert.ok(lastA && lastB, 'both seats hold frames');
  assert.deepEqual(lastA.destroyed, [2, 5, 9], 'the list sorted');
  assert.deepEqual(lastA.destroyedFalls, [truth[1], truth[2], truth[0]], 'each fall moved with its index');
  assert.deepEqual(lastB.destroyedFalls, [OBSTACLE_FALL_NONE, truth[2], truth[0]], 'the other team\'s frames carry its own view');
  actor.stop();
}

// ---- 4. the wire --------------------------------------------------------------------------------------------------
{
  const frameOf = (tick, destroyed, destroyedFalls) => ({
    tick, serverTimeMs: tick * 16, ackedInputTick: tick, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 16, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: destroyed.length },
    destroyed, ...(destroyedFalls ? { destroyedFalls } : {}), entities: [{ ...zeroEntityRow(1), tick, hp: 100, maxHp: 100 }], shells: [], viewer: null, modeStateJson: null,
  });
  const roundTrip = (frame, baseline) => {
    const direct = encodeSnapshotFrame(frame, baseline);
    const packet = encodeMessage(buildSnapshotPacket(frame, baseline), baseline);
    assert.deepEqual([...direct], [...packet], 'the direct encoder writes the packet path\'s bytes');
    const decoded = decodeMessage(direct, { resolveBaseline: () => baseline });
    assert.ok(decoded.ok, `decodes (${decoded.ok ? '' : decoded.error.code})`);
    return { frame: applySnapshotPacket(decoded.message, baseline), bytes: direct.byteLength, packet: decoded.message };
  };
  const key = frameOf(10, [3, 40, 41], [(1 << 6) | 5, OBSTACLE_FALL_NONE, (2 << 6) | 63]);
  const k = roundTrip(key, null);
  assert.deepEqual(k.frame.destroyed, key.destroyed);
  assert.deepEqual(k.frame.destroyedFalls, key.destroyedFalls, 'a keyframe carries every fall');
  const bare = roundTrip(frameOf(10, [3, 40, 41]), null);
  assert.equal(bare.frame.destroyedFalls, undefined, 'a list without falls decodes without them (none)');
  assert.equal(k.bytes - bare.bytes, 3, 'a byte a listed index');
  const allNone = roundTrip(frameOf(10, [3, 40, 41], [0, 0, 0]), null);
  assert.equal(allNone.bytes, bare.bytes, 'falls that are all none cost the form byte only');
  // a delta: its additions' falls, applied onto the baseline's
  const next = frameOf(12, [3, 7, 40, 41, 90], [(1 << 6) | 5, (1 << 6) | 20, OBSTACLE_FALL_NONE, (2 << 6) | 63, (2 << 6) | 1]);
  const d = roundTrip(next, key);
  assert.deepEqual(d.packet.destroyed, [7, 90], 'the delta names its additions');
  assert.deepEqual(d.packet.destroyedFalls, [(1 << 6) | 20, (2 << 6) | 1], 'and their falls');
  assert.deepEqual(d.frame.destroyed, next.destroyed);
  assert.deepEqual(d.frame.destroyedFalls, next.destroyedFalls, 'the applied delta holds every fall in order');
  // a delta adding nothing keeps the baseline's arrays; a frame without falls over one with them keeps the baseline's
  const same = roundTrip(frameOf(14, next.destroyed, next.destroyedFalls), d.frame);
  assert.equal(same.frame.destroyedFalls, d.frame.destroyedFalls);
  const plainOverFalls = roundTrip(frameOf(16, [3, 7, 8, 40, 41, 90]), d.frame);
  assert.deepEqual(plainOverFalls.frame.destroyedFalls, [(1 << 6) | 5, (1 << 6) | 20, 0, 0, (2 << 6) | 63, (2 << 6) | 1],
    'an addition without a fall is none; the baseline\'s stand');
  // a frame whose falls do not line up with its list carries none (never a shifted fall)
  assert.equal(roundTrip(frameOf(10, [3, 40, 41], [(1 << 6) | 5]), null).frame.destroyedFalls, undefined);
  // malformed: a cause 3 code, a none with a heading, an unknown form
  const bytes = encodeSnapshotFrame(key, null);
  const setAt = (() => { // the falls section follows the set: form 0, count 3, gaps 3, 36, 0
    for (let at = 0; at < bytes.length - 6; at++) {
      if (bytes[at] === 0 && bytes[at + 1] === 3 && bytes[at + 2] === 3 && bytes[at + 3] === 36 && bytes[at + 4] === 0 && bytes[at + 5] === 1) return at + 5;
    }
    return -1;
  })();
  assert.ok(setAt > 0, 'the falls section is found after the set');
  for (const [offset, value, why] of [[0, 7, 'an unknown form'], [1, 0xc5, 'a cause 3 code'], [2, 0x03, 'a none with a heading']]) {
    const bad = Uint8Array.from(bytes);
    bad[setAt + offset] = value;
    const decoded = decodeMessage(bad, { resolveBaseline: () => null });
    assert.ok(!decoded.ok && decoded.error.code === 'range', `${why} is refused (${decoded.ok ? 'decoded' : decoded.error.code})`);
  }
}

// ---- 5. the presentation lays each settled prop with its fall --------------------------------------------------------
{
  const obstacles = Array.from({ length: 4 }, (_, index) => ({ min: [index * 4, 0, 40], max: [index * 4 + 1, 2, 41], crushed: false, crushable: true, crushMin: 0, shape2: null }));
  const calls = [];
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' };
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus: { emit() {} },
    worldCollision: {
      heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' }, getObstacles: () => obstacles,
      crushObstacle(obstacle, dx, dz, speed, cause, options) { calls.push([obstacles.indexOf(obstacle), dx, dz, cause, options?.settled === true]); },
    },
    createTankVisual: () => ({ root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, dispose() {} }),
    prepareVisualTextures: async () => {}, clock: () => 0,
  });
  await presentation.applyRoster([{ entityId: 1, seat: 0, team: 0, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' }],
    { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
  const frame = (destroyed, destroyedFalls, revision) => ({
    tick: 100, renderTimeMs: 0, entities: [], shells: [], unseenShells: [],
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 1000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: revision },
    modeStateJson: null, destroyed, destroyedFalls, destructibleRevision: revision, destroyedPending: () => false,
    viewer: { entityId: 1, playerId: 'me', state: null, row: null, viewer: null, authorityTick: 0, authorityReceivedAtMs: 0, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  });
  presentation.applyFrame(frame([0, 2], [encodeObstacleFall('ram', -1, 0), encodeObstacleFall('shell', 0.6, -0.8)], 2));
  assert.equal(calls.length, 2);
  assert.ok(calls[0][0] === 0 && near(calls[0][1], -1, 1e-6) && near(calls[0][2], 0, 1e-6) && calls[0][3] === 'ram' && calls[0][4],
    `a ram's settled prop lies toward its ram (${calls[0]})`);
  assert.ok(calls[1][0] === 2 && near(Math.atan2(calls[1][1], calls[1][2]), Math.atan2(0.6, -0.8), Math.PI / 64) && calls[1][3] === 'shell',
    `a shell's lies along its shot (${calls[1]})`);
  presentation.applyFrame(frame([0, 2, 3], [], 3));
  assert.deepEqual(calls.at(-1), [3, 0, 0, 'ram', true], 'without falls: its own axis, as a ram (never +Z)');
  presentation.dispose();
}

console.log('settledFalls.selftest: the fall byte, the authority\'s falls withheld as their live events are, the actor\'s sorted falls, the wire\'s keyframe/delta/apply/malformed cases and the presentation\'s settled lays pass');
