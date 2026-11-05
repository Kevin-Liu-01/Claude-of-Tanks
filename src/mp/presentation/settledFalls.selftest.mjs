// Round 2 of the 2026-11-02 audit, U27 (world-destructibles R2, reset leftovers): a late joiner's settled destroyed list
// laid every prop as a ram toward +Z (battlePresentation.ts applyDestroyed called crushObstacle(obstacle, 0, 1, 0, 'ram')),
// because the snapshot's list carried indices only. Wire 11 carries each listed index's fall (src/sim/obstacleFall.ts: the
// cause and the heading in a byte), withheld as the live world_prop_destroyed event's cause and direction are. Here:
//   1. the fall byte: causes and headings round-trip, `none` is the prop's withheld lay (a ram along its own heading, a
//      hash of its index: never the +Z lay a zero direction is to the world's hinge), no other byte is a code;
//   2. the authority records each fall as it felled the prop and gives it to the viewers that may read it: the source's
//      own team and a spectator read a hidden rammer's fall, the other team reads none; a restored list has none;
//   3. the match actor sorts the list and carries each viewer's falls with it, in the same order, onto the wire;
//   4. the wire: a keyframe carries every fall, a delta its additions', a frame applied onto its baseline keeps both,
//      the direct encoder writes the packet path's bytes, a frame without readable falls costs nothing, and a malformed
//      falls section is refused (the bound that keeps falls from stopping a keyframe: destroyedSet.selftest);
//   5. the presentation lays each settled prop with its fall; a none, or a frame without falls, lays each prop along its
//      own heading, as a seat that watched the withheld live event lays it. Judged by the lay itself (world/topple.ts: the
//      hinge axis and the settled angle on a slope), not by the crush's arguments: until the round 2 review a none was
//      direction (0, 0), which the hinge lays exactly as the old ram toward +Z.
// Run with: node src/mp/presentation/settledFalls.selftest.mjs
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { OBSTACLE_FALL_NONE, decodeObstacleFall, encodeObstacleFall, isObstacleFallCode, withheldObstacleFall } from '../../sim/obstacleFall.ts';
import { setToppleAxis, settledToppleAngle } from '../../world/topple.ts';
import { createAuthoritativeMatch } from '../../sim/authoritativeMatch.ts';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { createLoopbackLink } from '../../../server/match/link.ts';
import {
  MESSAGE_TYPE, PHASE, PROTOCOL_VERSION, SNAPSHOT_FLAGS, VERDICT, WIRE_VERSION, applySnapshotPacket, buildSnapshotPacket,
  decodeMessage, encodeMessage, zeroEntityRow,
} from '../wire/index.ts';
import { encodeSnapshotFrame } from '../wire/codec.ts';
import { createBattlePresentation } from './index.ts';

await ensureAuthorityFleet();
const fall = { cause: 'ram', dx: 0, dz: 0 };
const near = (a, b, tolerance = 1e-9) => Math.abs(a - b) <= tolerance;
// A prop's lay as the world's hinge makes it (world/topple.ts, what felledTrees.fell and props.ts animateBrokenRecord run):
// the hinge axis and the settled angle of a 6 m trunk on a slope (rising to +Z and to +X), so the angle tells headings apart too
const slope = { getHeightAt: (x, z) => 0.35 * z + 0.12 * x };
const lay = (dx, dz) => {
  const axis = setToppleAxis(new Vector3(), dx, dz);
  return [axis.x, axis.y, axis.z, settledToppleAngle(slope, 0, 0, 0, dx, dz, 6, 0.2)].map((v) => Math.round(v * 1e6) / 1e6 + 0); // (+ 0: no -0)
};
const PLUS_Z_LAY = lay(0, 1);
assert.deepEqual(lay(0, 0), PLUS_Z_LAY, 'the hinge lays a zero direction as a fall toward +Z (why a none is never (0, 0))');
const withheldLay = (index) => { const own = withheldObstacleFall(index, { cause: 'ram', dx: 0, dz: 0 }); return lay(own.dx, own.dz); };
// the withheld live event `far` received in section 2, and its falls: section 5 lays them on a watching and a joining seat
let farLive = null;
let farFalls = null;

// ---- 1. the fall byte ---------------------------------------------------------------------------------------------
{
  assert.ok(WIRE_VERSION >= 11 && PROTOCOL_VERSION >= 12, 'the falls are a layout change (wire 11, protocol 12)');
  for (const [cause, expected] of [['ram', 'ram'], ['shell', 'shell'], ['blast', 'shell']]) {
    for (let step = 0; step < 64; step++) {
      const heading = (step / 64) * 2 * Math.PI;
      const code = encodeObstacleFall(cause, Math.sin(heading) * 3, Math.cos(heading) * 3);
      assert.ok(isObstacleFallCode(code) && code !== OBSTACLE_FALL_NONE, `${cause} at step ${step} is a code`);
      decodeObstacleFall(code, step, fall);
      assert.equal(fall.cause, expected, `${cause} reads as ${expected}`);
      assert.ok(near(fall.dx, Math.sin(heading), 1e-6) && near(fall.dz, Math.cos(heading), 1e-6), `${cause} at step ${step}: its heading`);
    }
  }
  // any direction lands within half a step (2.8 degrees)
  for (let n = 0; n < 200; n++) {
    const angle = n * 0.0731;
    decodeObstacleFall(encodeObstacleFall('ram', Math.sin(angle), Math.cos(angle)), n, fall);
    const error = Math.abs(Math.atan2(Math.sin(angle - Math.atan2(fall.dx, fall.dz)), Math.cos(angle - Math.atan2(fall.dx, fall.dz))));
    assert.ok(error <= Math.PI / 64 + 1e-9, `heading error ${error}`);
  }
  // none: a ram along the prop's own heading, the same for an index on every call (every seat), and spread over the props
  const headings = new Set();
  let plusZ = 0;
  for (let index = 0; index < 4096; index++) {
    decodeObstacleFall(OBSTACLE_FALL_NONE, index, fall);
    assert.equal(fall.cause, 'ram', `none at ${index} lays a ram`);
    assert.ok(near(Math.hypot(fall.dx, fall.dz), 1, 1e-12), `none at ${index} has a direction (never 0, 0)`);
    assert.deepEqual(withheldObstacleFall(index, { cause: 'shell', dx: 9, dz: 9 }), { ...fall }, `none at ${index} is that prop's withheld lay`);
    const step = Math.round(((Math.atan2(fall.dx, fall.dz) / (2 * Math.PI)) * 64 + 64)) % 64;
    headings.add(step);
    if (step === 0) plusZ++;
  }
  assert.equal(headings.size, 64, 'withheld props lie on every heading');
  assert.ok(plusZ <= 4096 / 64, `about one prop in 64 lies toward +Z, as any heading (${plusZ})`);
  assert.deepEqual(decodeObstacleFall(0xff, 7, fall), { ...withheldObstacleFall(7, { cause: 'ram', dx: 0, dz: 0 }) }, 'no fall code lays as none');
  const firstLays = Array.from({ length: 16 }, (_, index) => withheldLay(index));
  assert.ok(firstLays.every((one) => JSON.stringify(one) !== JSON.stringify(PLUS_Z_LAY)), 'the first sixteen props: none lies as the old +Z ram');
  assert.equal(new Set(firstLays.map((one) => JSON.stringify(one))).size, 16, 'neighbouring props lie on headings of their own');
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
  decodeObstacleFall(fallsOf('rammer')[0], 0, fall);
  assert.equal(fall.cause, 'ram');
  assert.ok(fall.dz < -0.99, `the rammer's team reads the fall it dealt: south (${fall.dx.toFixed(3)}, ${fall.dz.toFixed(3)})`);
  assert.deepEqual(fallsOf('mate'), fallsOf('rammer'), 'its whole team does');
  assert.deepEqual(fallsOf('spectator:watcher'), fallsOf('rammer'), 'a spectator does (as it reads the live event whole)');
  assert.deepEqual(fallsOf('far'), [OBSTACLE_FALL_NONE], 'the other team reads none: the heading would place the hidden rammer');
  const live = match.eventsForViewer('far').find((event) => event.type === 'world_prop_destroyed');
  assert.ok(live && !('directionZ' in live), 'as its live event withheld it');
  farLive = live;
  farFalls = fallsOf('far');
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
  assert.equal(allNone.bytes, bare.bytes, 'falls that are all none cost nothing');
  assert.equal(allNone.frame.destroyedFalls, undefined, 'and decode as none');
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
  // malformed: a cause 3 code, a none with a heading, the flag over an empty set, a truncated section
  const bytes = encodeSnapshotFrame(key, null);
  const flagsAt = 2 + 4 + 4; // after the header (version, type), tick and serverTimeMs
  assert.equal(bytes[flagsAt] & SNAPSHOT_FLAGS.HAS_DESTROYED_FALLS, SNAPSHOT_FLAGS.HAS_DESTROYED_FALLS, 'the header flag marks the falls');
  assert.deepEqual([...bytes.subarray(bytes.length - 3)], key.destroyedFalls, 'the falls are the frame\'s last field');
  const refused = (bad, code, why) => {
    const decoded = decodeMessage(bad, { resolveBaseline: () => null });
    assert.ok(!decoded.ok && decoded.error.code === code, `${why} is refused as ${code} (${decoded.ok ? 'decoded' : decoded.error.code})`);
  };
  for (const [offset, value, why] of [[3, 0xc5, 'a cause 3 code'], [2, 0x03, 'a none with a heading']]) {
    const bad = Uint8Array.from(bytes);
    bad[bytes.length - offset] = value;
    refused(bad, 'range', why);
  }
  refused(bytes.subarray(0, bytes.length - 1), 'truncated', 'a falls section one byte short');
  const emptySet = Uint8Array.from(encodeSnapshotFrame(frameOf(10, []), null));
  emptySet[flagsAt] |= SNAPSHOT_FLAGS.HAS_DESTROYED_FALLS;
  refused(emptySet, 'invalid_message', 'the flag over a set that names nothing');
}

// ---- 5. the presentation lays each settled prop with its fall --------------------------------------------------------
{
  const newGame = () => ({ tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' });
  // a seat's presentation over a world of `obstacles`: each crush with the lay the world's hinge makes of it, and its crunch
  const seat = async (obstacles) => {
    const calls = [];
    const crunches = [];
    const presentation = createBattlePresentation({
      engineCtx: { scene: { add() {} }, anisotropy: 1 }, game: newGame(),
      bus: { emit(type, payload) { if (type === 'prop:crushed') crunches.push(payload); } },
      worldCollision: {
        heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' }, getObstacles: () => obstacles,
        crushObstacle(obstacle, dx, dz, speed, cause, options) {
          calls.push({ index: obstacles.indexOf(obstacle), dx, dz, lay: lay(dx, dz), cause, settled: options?.settled === true });
        },
      },
      createTankVisual: () => ({ root: { position: new Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, dispose() {} }),
      prepareVisualTextures: async () => {}, clock: () => 0,
    });
    await presentation.applyRoster([{ entityId: 1, seat: 0, team: 0, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' }],
      { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
    return { presentation, calls, crunches };
  };
  const frame = (destroyed, destroyedFalls, revision) => ({
    tick: 100, renderTimeMs: 0, entities: [], shells: [], unseenShells: [],
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: 1000, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: revision },
    modeStateJson: null, destroyed, destroyedFalls, destructibleRevision: revision, destroyedPending: () => false,
    viewer: { entityId: 1, playerId: 'me', state: null, row: null, viewer: null, authorityTick: 0, authorityReceivedAtMs: 0, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  });
  const field = () => Array.from({ length: 12 }, (_, index) => ({ min: [index * 4, 0, 40], max: [index * 4 + 1, 2, 41], crushed: false, crushable: true, crushMin: 0, shape2: null }));
  const joiner = await seat(field());
  const { calls } = joiner;
  joiner.presentation.applyFrame(frame([0, 2], [encodeObstacleFall('ram', -1, 0), encodeObstacleFall('shell', 0.6, -0.8)], 2));
  assert.equal(calls.length, 2);
  assert.ok(calls[0].index === 0 && near(calls[0].dx, -1, 1e-6) && near(calls[0].dz, 0, 1e-6) && calls[0].cause === 'ram' && calls[0].settled,
    `a ram's settled prop lies toward its ram (${JSON.stringify(calls[0])})`);
  assert.deepEqual(calls[0].lay, lay(-1, 0));
  assert.ok(calls[1].index === 2 && near(Math.atan2(calls[1].dx, calls[1].dz), Math.atan2(0.6, -0.8), Math.PI / 64) && calls[1].cause === 'shell',
    `a shell's lies along its shot (${JSON.stringify(calls[1])})`);
  // without falls (a list whose falls did not fit the message, an older frame): each prop along its own heading
  joiner.presentation.applyFrame(frame([0, 2, 3], [], 3));
  assert.equal(calls.at(-1).index, 3);
  assert.deepEqual(calls.at(-1).lay, withheldLay(3), 'without falls: prop 3 lies along its own heading, as a ram');
  assert.equal(calls.at(-1).cause, 'ram');
  // a list whose falls are none but one (the other team's felling, a migration's restored entries): prop by prop, its own lay
  const all = Array.from({ length: 12 }, (_, index) => index);
  joiner.presentation.applyFrame(frame(all, all.map((index) => (index === 5 ? encodeObstacleFall('ram', 1, 0) : OBSTACLE_FALL_NONE)), 4));
  const settledNone = [calls[2], ...calls.slice(3).filter((call) => call.index !== 5)];
  assert.deepEqual(calls.slice(3).map((call) => call.index), [1, 4, 5, 6, 7, 8, 9, 10, 11], 'every prop not yet down is laid once');
  assert.deepEqual(calls.find((call) => call.index === 5).lay, lay(1, 0), 'the one readable fall lies toward +X');
  for (const call of settledNone) {
    assert.deepEqual(call.lay, withheldLay(call.index), `none: prop ${call.index} lies along its own heading`);
    assert.notDeepEqual(call.lay, PLUS_Z_LAY, `none: prop ${call.index} does not lie as the old ram toward +Z`);
    assert.ok(call.settled && call.cause === 'ram', `none: prop ${call.index} settles as a ram`);
  }
  assert.equal(new Set(settledNone.map((call) => JSON.stringify(call.lay))).size, 9, 'the none props lie on nine headings, not one shared axis');
  // the same list on another seat lays every prop the same way (the heading is the index's, not the seat's)
  const other = await seat(field());
  other.presentation.applyFrame(frame(all, all.map((index) => (index === 5 ? encodeObstacleFall('ram', 1, 0) : OBSTACLE_FALL_NONE)), 4));
  for (const call of other.calls) {
    if (call.index === 0 || call.index === 2 || call.index === 3) continue;
    assert.deepEqual(call.lay, calls.find((mine) => mine.index === call.index).lay, `prop ${call.index} lies alike on both seats`);
  }
  joiner.presentation.dispose();
  other.presentation.dispose();

  // a seat that watched the withheld fall (section 2's real event to the other team: no cause, direction or speed) and a
  // seat of that team that joined after it (its none) lay the fence alike, along the fence's own heading, never toward +Z
  assert.ok(farLive && farFalls, 'section 2 left the withheld event and its falls');
  const fence = () => [{ min: [-12, -100, -35.5], max: [12, 100, -34.5], kind: 'fence', crushed: false, crushable: true, crushMin: 0, shape2: null }];
  const watched = await seat(fence());
  watched.presentation.applyEvent({ kind: String(farLive.type), payload: farLive }, { own: false, feedbackPredicted: false });
  const joined = await seat(fence());
  joined.presentation.applyFrame(frame([0], farFalls, 1));
  assert.equal(watched.calls.length, 1, 'the watching seat felled the fence live');
  assert.equal(joined.calls.length, 1, 'the joining seat laid it settled');
  assert.ok(!watched.calls[0].settled && joined.calls[0].settled);
  assert.deepEqual(watched.calls[0].lay, joined.calls[0].lay, 'a seat that watched the withheld fall and a seat that joined after it lay the fence alike');
  assert.deepEqual(joined.calls[0].lay, withheldLay(0), 'along the fence\'s own heading');
  assert.notDeepEqual(watched.calls[0].lay, PLUS_Z_LAY, 'not as the old ram toward +Z');
  assert.equal(watched.calls[0].cause, 'ram', 'the withheld event names no cause: a ram');
  assert.ok(near(watched.crunches[0].dir[0], watched.calls[0].dx) && near(watched.crunches[0].dir[2], watched.calls[0].dz),
    'its splinters fly along the heading it lies on');
  watched.presentation.dispose();
  joined.presentation.dispose();
}

console.log('settledFalls.selftest: the fall byte, the authority\'s falls withheld as their live events are, the actor\'s sorted falls, the wire\'s keyframe/delta/apply/malformed cases and the presentation\'s settled lays pass');
