// Round 2 of the 2026-11-02 audit, U31 first bullet (fx-wreck F10: "absence from one frame means ended"): the authority
// hides a round with its shooter, so a round gone from a viewer's shell list had either ended or left its view, and the
// client could not tell. The effects' 0.12 s grace covered a dropped row; a spotting loss longer than that still read as
// an end (a missile's wire parted and its trail ended, a tracer gave up its belt place, a drone flew home). Wire 11 names
// the rounds that left a view in flight (SnapshotFrame.unseenShells), the presentation reports them as `shell:unseen`, and
// the effects hold them out of view instead of ending them. Here:
//   1. the match actor names a round its viewer was shown and no longer sees while the authority flies it, for
//      UNSEEN_SHELL_MARK_TICKS whatever becomes of it, never a round that ended, and drops a round seen again;
//   2. the wire: the list round-trips through both encoders and the apply, and a malformed list is refused;
//   3. the presentation: an unseen exit goes to the effects as `shell:unseen`, an ended one does not;
//   4. the effects: a guided round reported unseen keeps its trail and wire through a long absence (the control, absent
//      with no report, ends past the grace); a held tracer keeps its record; a held drone starts no flight home;
//   5. the client half of both wire-11 fields: a real MatchClient over the actor's link presents a round that left its
//      view as unseen on the first sample without it (RemoteInterpolator.sample, then MatchClient.update), and its
//      MatchFrame's destroyed falls line up with its destroyed list (none for a list whose falls do not), a delta's
//      addition with its own fall, a keyframe's whole list with every fall (MatchClient.receiveSnapshot, then update).
// Run with: node src/mp/presentation/unseenRounds.selftest.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as THREE from 'three';
import { ensureAuthorityFleet } from '../../vehicles/authorityFleet.ts';
import { createMatchActor } from '../../../server/match/matchActor.ts';
import { createLoopbackLink } from '../../../server/match/link.ts';
import {
  MESSAGE_TYPE, PHASE, PROTOCOL_VERSION, SNAPSHOT_FLAGS, UNSEEN_SHELL_MARK_TICKS, VERDICT, applySnapshotPacket,
  buildSnapshotPacket, decodeMessage, encodeMessage, zeroEntityRow,
} from '../wire/index.ts';
import { encodeSnapshotFrame } from '../wire/codec.ts';
import { createBattlePresentation } from './index.ts';
import { MatchClient } from '../match/index.ts';
import { createLoopbackPair } from '../transport/loopbackTransport.ts';
import { TRACER_ABSENCE_GRACE_S, createProjectileTracers } from '../../fx/projectileTracers.ts';
import { createDronePresentation } from '../../fx/dronePresentation.ts';
import { createFx } from '../../fx/effects.ts';

await ensureAuthorityFleet();

// ---- 1. the match actor names the rounds that left a view in flight ------------------------------------------------
{
  let nowMs = 10_000;
  const actor = createMatchActor({
    roomId: 'unseen', mapId: 'verdant', seed: 11, countdownS: 0, world: 'terrain', now: () => nowMs, schedule: () => () => {},
    snapshotHz: 60,
    seats: [
      { seat: 0, playerId: 'a1', name: 'A', team: 'alpha', specId: 'm1a1_abrams_hc' },
      { seat: 1, playerId: 'b1', name: 'B', team: 'bravo', specId: 't90am' },
    ],
  });
  // the authority's rounds, scripted per tick: which a1 sees (b1's own are always b1's)
  const round = (id) => ({ id, shooterId: 'b1', dead: false, pos: new THREE.Vector3(0, 3, id), vel: new THREE.Vector3(0, 0, 300), spec: { type: 'AP', tracer: 'AP', guided: false } });
  const rounds = new Map([[7, round(7)], [8, round(8)], [9, round(9)]]);
  let visibleToA = [7, 8, 9];
  const observe = actor.authority.observeForViewer.bind(actor.authority);
  actor.authority.observeForViewer = (viewerId, entitiesOut, shellsOut) => {
    observe(viewerId, entitiesOut, shellsOut);
    shellsOut.length = 0;
    const ids = viewerId === 'a1' ? visibleToA : [...rounds.keys()];
    for (const id of ids) if (rounds.has(id) && !rounds.get(id).dead) shellsOut.push(rounds.get(id));
  };
  const frames = [];
  const link = createLoopbackLink('a1');
  const history = new Map();
  link.client.onMessage((bytes) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: (tick) => history.get(tick) ?? null });
    assert.ok(decoded.ok, 'a1 decodes every frame');
    if (decoded.message.type !== MESSAGE_TYPE.SNAPSHOT) return;
    const frame = applySnapshotPacket(decoded.message, decoded.message.keyframe ? null : history.get(decoded.message.baseTick) ?? null);
    history.set(frame.tick, frame);
    frames.push(frame);
    // acknowledged at once, so every tick's frame is a delta and none waits on the forced-keyframe bucket
    link.client.send(encodeMessage({ type: MESSAGE_TYPE.SNAPSHOT_ACK, tick: frame.tick }));
  });
  actor.attach(link.server, { type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 1, token: 't', clientBuild: 'selftest' },
    { v: 1, roomId: 'unseen', seat: 0, playerId: 'a1', name: 'a1', team: 'alpha', specId: 'm1a1_abrams_hc', iat: 0, exp: 1 });
  const advance = async (ticks) => {
    for (let n = 0; n < ticks; n++) { nowMs += 1000 / 60; actor.advance(nowMs); await new Promise((resolve) => setImmediate(resolve)); }
    const newest = frames.at(-1);
    assert.equal(newest.tick, actor.tick, 'the newest frame is this tick\'s');
    return newest;
  };
  let last = await advance(6);
  assert.deepEqual(last.shells.map((shell) => shell.id), [7, 8, 9], 'a1 sees three rounds');
  assert.equal(last.unseenShells, undefined, 'none left its view');
  // round 7's shooter is hidden from a1 (it flies on); round 8 strikes (dead, gone from the authority)
  visibleToA = [9];
  rounds.get(8).dead = true;
  last = await advance(1);
  assert.deepEqual(last.shells.map((shell) => shell.id), [9]);
  assert.deepEqual(last.unseenShells, [7], 'the hidden round is named unseen; the round that ended is not');
  const leftTick = last.tick;
  // named on every frame for the mark's window, whatever becomes of it (it ends meanwhile: its end stays the authority's)
  last = await advance(10);
  rounds.get(7).dead = true;
  for (let n = 0; n < 60; n++) {
    last = await advance(1);
    if (last.tick - leftTick < UNSEEN_SHELL_MARK_TICKS) assert.deepEqual(last.unseenShells, [7], `still named ${last.tick - leftTick} ticks on`);
    else assert.equal(last.unseenShells, undefined, `no longer named ${last.tick - leftTick} ticks on`);
  }
  // a round that leaves and comes back is no longer named
  rounds.set(10, round(10));
  visibleToA = [9, 10];
  await advance(2);
  visibleToA = [9];
  assert.deepEqual((await advance(1)).unseenShells, [10]);
  visibleToA = [9, 10];
  last = await advance(1);
  assert.deepEqual(last.shells.map((shell) => shell.id), [9, 10]);
  assert.equal(last.unseenShells, undefined, 'seen again, it is not unseen');
  actor.stop();
}

// ---- 2. the wire --------------------------------------------------------------------------------------------------
{
  const frameOf = (tick, unseenShells) => ({
    tick, serverTimeMs: tick * 16, ackedInputTick: tick, ackedFireSeq: 0, ackedActionSeq: 0, inputMarginTicks: 0,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 16, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    destroyed: [], entities: [{ ...zeroEntityRow(1), tick, hp: 100, maxHp: 100 }], shells: [], viewer: null, modeStateJson: null,
    ...(unseenShells ? { unseenShells } : {}),
  });
  const encode = (frame, baseline) => {
    const direct = encodeSnapshotFrame(frame, baseline);
    assert.deepEqual([...direct], [...encodeMessage(buildSnapshotPacket(frame, baseline), baseline)], 'the direct encoder writes the packet path\'s bytes');
    return direct;
  };
  const decode = (bytes, baseline) => {
    const decoded = decodeMessage(bytes, { resolveBaseline: () => baseline });
    assert.ok(decoded.ok, `decodes (${decoded.ok ? '' : decoded.error.code})`);
    return applySnapshotPacket(decoded.message, baseline);
  };
  const key = frameOf(10, [3, 70, 65535]);
  const keyBytes = encode(key, null);
  assert.deepEqual(decode(keyBytes, null).unseenShells, [3, 70, 65535], 'a keyframe carries the list');
  const plainBytes = encode(frameOf(10), null);
  assert.equal(keyBytes.byteLength - plainBytes.byteLength, 1 + 3 * 2, 'a count and a u16 a round');
  assert.equal(decode(plainBytes, null).unseenShells, undefined, 'none: no list, no byte (a header flag)');
  const keyFrame = decode(keyBytes, null);
  assert.deepEqual(decode(encode(frameOf(12, [70]), keyFrame), keyFrame).unseenShells, [70], 'a delta carries its own list, not its baseline\'s');
  assert.equal(decode(encode(frameOf(12), keyFrame), keyFrame).unseenShells, undefined);
  assert.throws(() => encode(frameOf(10, [70, 3]), null), (error) => error.code === 'range', 'the list is strictly ascending');
  // malformed: the flag with an empty list, a list out of order
  const flagAt = 1 + 4 + 4; // after the message header (type, version) and tick, serverTimeMs: the flags byte
  const findFlags = (bytes) => { for (let at = 0; at < 16; at++) if (bytes[at] === (SNAPSHOT_FLAGS.KEYFRAME | SNAPSHOT_FLAGS.HAS_UNSEEN_SHELLS)) return at; return -1; };
  const at = findFlags(keyBytes);
  assert.ok(at >= 0 && at <= flagAt + 2, 'the header flag is set');
  const listAt = keyBytes.byteLength - (1 + 3 * 2);
  const empty = Uint8Array.from(keyBytes); empty[listAt] = 0;
  const decodedEmpty = decodeMessage(empty, { resolveBaseline: () => null });
  assert.ok(!decodedEmpty.ok, 'the flag with an empty list is refused');
  const swapped = Uint8Array.from(keyBytes);
  swapped[listAt + 1] = 0; swapped[listAt + 2] = 70; swapped[listAt + 3] = 0; swapped[listAt + 4] = 3;
  const decodedSwapped = decodeMessage(swapped, { resolveBaseline: () => null });
  assert.ok(!decodedSwapped.ok && decodedSwapped.error.code === 'invalid_message', 'a list out of order is refused');
}

// ---- 3. the presentation reports an unseen exit, not an ended one --------------------------------------------------
{
  const events = [];
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null, allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' };
  const presentation = createBattlePresentation({
    engineCtx: { scene: { add() {} }, anisotropy: 1 }, game, bus: { emit(type, payload) { events.push({ type, payload }); } },
    worldCollision: { heightField: { getHeightAt: () => 0, getHeightAtFast: () => 0, getGroundType: () => 'hard' }, getObstacles: () => [] },
    createTankVisual: () => ({ root: { position: new THREE.Vector3(), userData: {} }, setVisible() {}, syncFromState() {}, dispose() {} }),
    prepareVisualTextures: async () => {}, clock: () => 0,
  });
  await presentation.applyRoster([
    { entityId: 1, seat: 0, team: 0, bot: false, connected: true, playerId: 'me', name: 'Me', specId: 'm1a1_abrams_hc' },
    { entityId: 2, seat: 1, team: 1, bot: false, connected: true, playerId: 'foe', name: 'Foe', specId: 'm1a1_abrams_hc' },
  ], { ownEntityId: 1, ownPlayerId: 'me', roomId: 'r', mapId: 'winter', mode: 'standard', rulesetJson: '{}' });
  const shell = (id) => ({ id, shooterEntityId: 2, x: 0, y: 2, z: id, vx: 0, vy: 0, vz: 300, shellType: 'AP', guided: false });
  const frame = (tick, shells, unseenShells) => ({
    tick, renderTimeMs: tick * 16, entities: [], shells, unseenShells,
    meta: { phase: PHASE.PLAYING, countdownMs: 0, battleTimeMs: tick * 16, verdict: VERDICT.NONE, verdictReason: '', destructibleRevision: 0 },
    modeStateJson: null, destroyed: [], destroyedFalls: [], destructibleRevision: 0, destroyedPending: () => false,
    viewer: { entityId: 1, playerId: 'me', state: null, row: null, viewer: null, authorityTick: 0, authorityReceivedAtMs: 0, predictedShot: null },
    events: [], ownShots: [], extrapolatedMs: 0, phase: 'live',
  });
  presentation.applyFrame(frame(1, [shell(7), shell(8)], []));
  assert.deepEqual(game.shells.map((s) => s.id), [7, 8]);
  presentation.applyFrame(frame(2, [], [7]));
  assert.deepEqual(game.shells, [], 'both rounds leave the live list');
  const unseen = events.filter((event) => event.type === 'shell:unseen');
  assert.deepEqual(unseen.map((event) => event.payload.shellId), [7], 'the unseen one is reported out of view; the ended one is not');
  assert.equal(unseen[0].payload.shooterId, 'foe');
  presentation.applyFrame(frame(3, [], [7]));
  assert.equal(events.filter((event) => event.type === 'shell:unseen').length, 1, 'once: the mark repeats on the wire, not on the bus');
  presentation.dispose();
}

// ---- 4. the effects hold an unseen round instead of ending it -----------------------------------------------------
{
  // the effects' canvases (after the presentation, whose paint scheduler would take this stub for a page)
  const require = createRequire(import.meta.url);
  const { createCanvas } = require('@napi-rs/canvas');
  globalThis.document ??= { createElement: () => createCanvas(1, 1) };
  // a guided round: the full runtime, its bus, a long absence
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.5, 5000);
  camera.position.set(-20, 5, 0); camera.lookAt(0, 3, 60); camera.updateMatrixWorld(true);
  const fx = createFx({ scene, camera, renderer: null, anisotropy: 1, setupShadowMaterial: () => {}, releaseShadowMaterial: () => {} },
    { getHeightAt: () => 0, getNormalAt: () => new THREE.Vector3(0, 1, 0) }, { seed: 5 });
  scene.add(fx.group);
  const handlers = new Map();
  const bus = { on(type, listener) { (handlers.get(type) ?? handlers.set(type, []).get(type)).push(listener); return () => {}; },
    emit(type, payload) { for (const listener of handlers.get(type) ?? []) listener(payload); } };
  fx.bindBus(bus);
  const missile = (id) => ({ id, pos: new THREE.Vector3(id, 3, 0), prevPos: new THREE.Vector3(id, 3, 0), vel: new THREE.Vector3(0, 0, 250),
    spec: { guided: true, tracer: 'ATGM', name: '9M133 Kornet' }, shooterId: 'g', ageS: 0.5, distM: 125 });
  const held = missile(900), lost = missile(901);
  const step = (shells) => {
    for (const sh of shells) { sh.prevPos.copy(sh.pos); sh.pos.z += 250 / 60; sh.ageS += 1 / 60; sh.distM += 250 / 60; }
    fx.update(1 / 60, shells, camera, () => null);
    return fx.getGuidedRecordDebug();
  };
  for (let f = 0; f < 10; f++) step([held, lost]);
  bus.emit('shell:unseen', { shellId: 900, shooterId: 'g' });
  let debug = null;
  for (let f = 0; f < 15; f++) debug = step([]); // a quarter second out of view: past the 0.12 s grace
  assert.equal(debug.records, 2);
  assert.equal(debug.endedTrails, 1, 'the round lost with no report has ended past the grace; the unseen one has not');
  for (let f = 0; f < 45; f++) debug = step([]); // a second in all
  assert.equal(debug.records, 1, 'the lost round\'s record is gone after its linger; the unseen one\'s is held');
  assert.equal(debug.endedTrails, 0, 'and its trail has not ended');
  for (let f = 0; f < 6; f++) debug = step([held]);
  assert.equal(debug.endedTrails, 0, 'seen again, its trail draws on');
  for (let f = 0; f < 240; f++) debug = step([]); // past the hold, never seen again
  assert.equal(debug.records, 0, 'past the hold it ends as an absent round does, and its record goes');
  fx.resetAll();

  // a tracer held out of view keeps its record past the grace
  let now = 10;
  const heldIds = new Set();
  const tracers = createProjectileTracers({ shooter: () => ({ id: 'm1a1_abrams_hc', nation: 'USA' }), scene: new THREE.Scene(), now: () => now, capacity: 64,
    held: (id) => heldIds.has(id) });
  const tracer = (id) => ({ id, shooterId: 'a', pos: new THREE.Vector3(id, 2, 50), vel: new THREE.Vector3(0, 0, 850), ageS: 0.2, distM: 170, spec: { type: 'AP', caliberMm: 12.7 } });
  const burst = [tracer(1), tracer(2)];
  const frame = (shells) => { now += 1 / 60; tracers.begin(); for (const s of shells) tracers.write(s); tracers.end(); };
  frame(burst);
  heldIds.add(1);
  for (let f = 0; f < Math.ceil(TRACER_ABSENCE_GRACE_S * 60) + 30; f++) frame([]);
  assert.equal(tracers.stats().tracked, 1, 'the held round keeps its record (its belt place); the other is released past the grace');
  heldIds.clear();
  frame([]);
  assert.equal(tracers.stats().tracked, 0, 'the hold over, it is released');

  // a drone held out of view starts no flight home
  const returns = [];
  const drones = createDronePresentation(new THREE.Group(), {
    onReturnEvent: (id, event) => returns.push(`${id}:${event}`),
    resolveCarrier: () => ({ frame: new THREE.Object3D(), destroyed: false, flying: false }),
    held: (id) => id === 'held',
  });
  const droneFrame = (t, ids) => {
    drones.begin(t, new THREE.Vector3(0, 40, -50));
    for (const id of ids) drones.write(new THREE.Vector3(id === 'held' ? 0 : 6, 40, 0), new THREE.Vector3(0, 0, 12), id, 0, 30, 'USA', undefined, 'p1');
    drones.end();
  };
  droneFrame(1 / 60, ['held', 'lost']);
  for (let f = 2; f < 40; f++) droneFrame(f / 60, []);
  assert.ok(returns.some((entry) => entry.startsWith('lost:')), `the drone lost with no report ends its flight (${returns})`);
  assert.ok(!returns.some((entry) => entry.startsWith('held:')), 'the held one starts no flight home');
}

// ---- 5. the client half: a real MatchClient over the actor's link carries both wire-11 fields to its MatchFrame ------
{
  let nowMs = 30_000;
  const actor = createMatchActor({
    roomId: 'client', mapId: 'verdant', seed: 13, countdownS: 0, world: 'terrain', now: () => nowMs, schedule: () => () => {},
    seats: [
      { seat: 0, playerId: 'a1', name: 'A', team: 'alpha', specId: 'm1a1_abrams_hc' },
      { seat: 1, playerId: 'b1', name: 'B', team: 'bravo', specId: 't90am' },
    ],
  });
  // the authority's rounds as in section 1 (b1's, a1 sees them until one leaves its view)
  const round = (id) => ({ id, shooterId: 'b1', dead: false, pos: new THREE.Vector3(0, 3, id), vel: new THREE.Vector3(0, 0, 300), spec: { type: 'AP', tracer: 'AP', guided: false } });
  const rounds = new Map([[7, round(7)], [8, round(8)], [9, round(9)]]);
  let visibleToA = [7, 8, 9];
  const observe = actor.authority.observeForViewer.bind(actor.authority);
  actor.authority.observeForViewer = (viewerId, entitiesOut, shellsOut) => {
    observe(viewerId, entitiesOut, shellsOut);
    shellsOut.length = 0;
    const ids = viewerId === 'a1' ? visibleToA : [...rounds.keys()];
    for (const id of ids) if (rounds.has(id) && !rounds.get(id).dead) shellsOut.push(rounds.get(id));
  };
  // the destroyed list and its falls as authoritativeMatch.snapshotMeta gives them, in felling order; first a list whose
  // falls do not line up with it (one short)
  const RAM = 1 << 6, SHELL = 2 << 6;
  let listed = { revision: 3, indices: [9, 2, 5], falls: [RAM | 10, SHELL | 33] };
  const snapshotMeta = actor.authority.snapshotMeta.bind(actor.authority);
  actor.authority.snapshotMeta = (viewerId) => ({ ...snapshotMeta(viewerId), destructibleRevision: listed.revision,
    destroyedObstacleIndices: listed.indices, destroyedObstacleFalls: listed.falls });
  // the seat's client over the loopback pair, its server end the actor's link (predictionStructureYield.selftest's bridge)
  const pair = createLoopbackPair({ clock: () => nowMs, connectDelayMs: 0 });
  pair.server.open();
  let messageListener = null, closeListener = null, attached = false;
  const link = {
    label: 'a1',
    get bufferedAmount() { return pair.server.bufferedBytes; },
    get closed() { return pair.server.state === 'closed'; },
    send(bytes) { if (!pair.server.send(bytes)) throw new Error('loopback refused'); pair.pump(nowMs); },
    close(_reason, detail = '') { pair.server.close('server', detail); },
    onMessage(listener) { messageListener = listener; },
    onClose(listener) { closeListener = listener; },
  };
  pair.server.onFrame((bytes) => {
    if (attached) { messageListener?.(bytes); return; }
    const decoded = decodeMessage(bytes);
    assert.ok(decoded.ok && decoded.message.type === MESSAGE_TYPE.HELLO, 'the seat says hello first');
    attached = actor.attach(link, decoded.message, { v: 1, roomId: 'client', seat: 0, playerId: 'a1', name: 'a1', team: 'alpha',
      specId: 'm1a1_abrams_hc', iat: 0, exp: 1 });
  });
  pair.server.onState((change) => { if (change.state === 'closed') closeListener?.(); });
  const controls = () => ({ throttle: 0, steer: 0, brake: true, fire: false, aimLocked: true, aimYaw: 0, aimPitch: 0, aimDistance: 200,
    shellSlot: 0, actionPresses: 0 });
  const client = new MatchClient({ transport: pair.client, token: 'issued-elsewhere', clock: () => nowMs,
    clientBuild: 'unseenRounds.selftest', controls, prediction: null });
  client.connect();
  const step = async () => {
    nowMs += 1000 / 60;
    actor.advance(nowMs);
    pair.pump(nowMs);
    const frame = client.update(nowMs, 1 / 60);
    pair.pump(nowMs);
    await new Promise((resolve) => setImmediate(resolve));
    return frame;
  };
  const ids = (frame) => frame.shells.map((shell) => shell.id);
  let frame = null;
  for (let guard = 0; guard < 600 && !(frame && ids(frame).length === 3); guard++) frame = await step();
  assert.ok(attached && client.welcome && frame, 'the seat is welcomed and its client samples frames');
  assert.deepEqual(ids(frame), [7, 8, 9], 'the client presents the three rounds');
  assert.deepEqual([...frame.unseenShells], [], 'none is out of view');
  assert.deepEqual([...frame.destroyed], [2, 5, 9], 'the destroyed list, sorted');
  assert.deepEqual([...frame.destroyedFalls], [], 'a list whose falls do not line up reaches the MatchFrame with none (never a shifted fall)');
  // round 7's shooter is hidden from a1 (it flies on); round 8 strikes (dead): the first sample without them
  visibleToA = [9];
  rounds.get(8).dead = true;
  let left = null;
  for (let guard = 0; guard < 120 && !left; guard++) {
    const next = await step();
    if (!ids(next).includes(7)) left = next;
  }
  assert.ok(left, 'the round leaves the client\'s view');
  assert.deepEqual(ids(left), [9], 'both rounds are gone from the same sample');
  assert.deepEqual([...left.unseenShells], [7], 'on the first sample without it, the MatchFrame names the hidden round out of view, not the ended one');
  for (let n = 0; n < 90; n++) frame = await step();
  assert.deepEqual([...frame.unseenShells], [], 'past the mark window it is named no longer');
  // the falls line up: an addition's fall rides its delta; the client's older indices take theirs from the next keyframe
  listed = { revision: 4, indices: [9, 2, 5, 4], falls: [RAM | 10, SHELL | 33, RAM | 60, SHELL | 1] };
  const keyframesBefore = client.stats().keyframes;
  for (let guard = 0; guard < 30 && frame.destroyed.length !== 4; guard++) frame = await step();
  assert.deepEqual([...frame.destroyed], [2, 4, 5, 9], 'the addition reaches the client');
  assert.equal(client.stats().keyframes, keyframesBefore, 'through a delta');
  assert.deepEqual([...frame.destroyedFalls], [0, SHELL | 1, 0, 0],
    'the MatchFrame\'s falls line up with its list: the delta\'s addition with its own fall, the indices it held none yet');
  const truth = [SHELL | 33, SHELL | 1, RAM | 60, RAM | 10];
  // (a keyframe every KEYFRAME_INTERVAL_TICKS, six seconds: server/match/publisher.ts)
  for (let guard = 0; guard < 8 * 60 && frame.destroyedFalls.join() !== truth.join(); guard++) frame = await step();
  assert.deepEqual([...frame.destroyedFalls], truth, 'the next keyframe brings every fall, each with its index');
  assert.ok(client.stats().keyframes > keyframesBefore, 'through a keyframe');
  client.dispose();
  actor.stop();
}

console.log('unseenRounds.selftest: the actor names a round that left its view in flight for its mark window (never an ended one), the wire carries and refuses the list, the presentation reports unseen exits, and the effects hold them (trail and wire, tracer record, drone airframe) where an unreported absence ends, and a real MatchClient carries the unseen rounds and the destroyed falls to its MatchFrame');
