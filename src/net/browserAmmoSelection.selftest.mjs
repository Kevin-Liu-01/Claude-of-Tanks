import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';
import { BrowserInputRuntime } from './browserInputRuntime.ts';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createEnvelope, MESSAGE_TYPES } from './protocol.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';
import { SNAPSHOT_FLAGS } from './snapshot.ts';

async function fixture(interpolationDelayMs = 100) {
  const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null,
    allTanks: [], timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'winter' };
  const bridge = createBrowserBattleBridge({ engineCtx: { scene: { add() {} } }, game,
    bus: { emit() {} }, viewerId: 'driver', prepareVisualTextures: async () => {},
    createTankVisual: () => ({ root: { position: new Vector3() }, setVisible() {},
      syncFromState() {}, dispose() {}, recoilKick() { return 0; } }) });
  await bridge.prepareRoster([{ id: 'driver', specId: 'm1a2', team: 'alpha' }]);
  const own = { id: 'driver', specId: 'm1a2', team: 'alpha', x: 0, y: 1.2, z: 0,
    vx: 0, vz: 0, yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
    hp: 2000, maxHp: 2000, reloadS: 0, shellSlot: 0, ammo0: 8, ammo1: 4, ammo2: 2, flags: 0 };
  const snapshot = { tick: 1, serverTimeMs: 50, ackInputSeq: null,
    entities: [own], shells: [], meta: { phase: 'playing' } };
  bridge.apply(snapshot);
  const wire = [];
  let receive;
  let accepted = true;
  const transport = { readyState: 'open', send: () => true,
    onMessage(listener) { receive = listener; return () => {}; },
    onClose() { return () => {}; }, close() {},
    sendInput(message) {
      if (!accepted) return false;
      wire.push(snapshotWireCodec.decode(snapshotWireCodec.encode(message)).payload);
      return true;
    } };
  const client = new MatchClientRuntime({ transport, playerId: 'driver', clock: () => 0,
    interpolationDelayMs, maxInterpolationDelayMs: interpolationDelayMs });
  receive(createEnvelope(MESSAGE_TYPES.WELCOME, { playerId: 'driver', tick: 0, serverTimeMs: 0 }));
  const browser = new BrowserInputRuntime();
  function upload(slot = game.player.input.shellSlot) {
    game.player.input.shellSlot = slot;
    browser.advance(1 / 60);
    const input = browser.frame(game.player);
    assert.equal(browser.shouldSend(input), true);
    const sent = client.submitInput(input);
    if (sent) bridge.recordInput(input, browser.commit(input), client.lastSubmittedInputSeq);
    return sent;
  }
  function authority(slot, ackInputSeq, overrides = {}) {
    own.shellSlot = slot;
    snapshot.tick++;
    snapshot.ackInputSeq = ackInputSeq;
    Object.assign(snapshot, overrides);
    bridge.apply(snapshot);
  }
  return { game, bridge, client, wire, browser, own, snapshot, upload, authority,
    setAccepted(value) { accepted = value; },
    recover() {
      assert.equal(client.reconnectTransport(transport), true);
      receive(createEnvelope(MESSAGE_TYPES.WELCOME, { playerId: 'driver', tick: 0, serverTimeMs: 0 }));
    },
    close() { client.close(); bridge.dispose(); } };
}

const test = await fixture();
try {
  test.upload(0);
  test.authority(0, 0);
  test.upload(1);
  test.upload(0);
  assert.equal(test.game.player._networkAmmoSelectionPending, true,
    '0→1→0 cancellation remains pending even though latest visible authority is already0');
  test.authority(1, 1);
  assert.equal(test.browser.frame(test.game.player).shellSlot, 0,
    'delayed authority1/ACK1 cannot erase cancellation already transmitted as input2');
  assert.equal(test.game.player.combat.shellSlot, 1, 'weapon state remains authoritative during pending intent');
  assert.deepEqual(test.game.player.combat.ammo, [8, 4, 2]);
  test.upload();
  assert.deepEqual(test.wire.map((input) => input.shellSlot), [0, 1, 0, 0],
    'regression: actual compact wire used to become [0,1,0,1] and fire the cancelled ammunition');
  assert.deepEqual(test.wire.map((input) => input.inputSeq), [0, 1, 2, 3]);
  test.authority(0, 2);
  assert.equal(test.game.player._networkAmmoSelectionPending, false,
    'first accepted cancellation input settles without waiting for its repeated held upload');

  test.upload(1);
  test.game.player.input.shellSlot = 0;
  test.authority(1, 4);
  assert.equal(test.browser.frame(test.game.player).shellSlot, 0,
    'a same-frame unsent cancellation survives the previous switch receipt');
  assert.equal(test.game.player._networkAmmoSelectionPending, true);
  test.setAccepted(false);
  assert.equal(test.upload(), false);
  test.authority(1, 5);
  assert.equal(test.game.player._networkAmmoSelectionPending, true,
    'a failed submission must never fabricate ownership of sequence5');
  test.setAccepted(true);
  test.recover();
  test.upload();
  test.authority(0, 6);
  assert.equal(test.game.player._networkAmmoSelectionPending, false);

  test.upload(1); // sequence7
  const rawAuthority = { ...test.own, shellSlot: 1, reloadS: 3.25, reloadTotalS: 5,
    reloadKind: 'shell', ammo1: 3 };
  test.authority(0, 100, { immediateAuthority: { tick: 50, serverTimeMs: 2500,
    ackInputSeq: 6, entity: rawAuthority, predictionState: null } });
  assert.equal(test.game.player._networkAmmoSelectionPending, true,
    'top-level interpolated ACK100 cannot settle immediate-authority ACK6');
  assert.equal(test.game.player._networkShellSlot, 1);
  assert.equal(test.game.player.combat.shellSlot, 1);
  assert.equal(test.game.player.combat.reload.t, 3.25);
  assert.equal(test.game.player.combat.ammo[1], 3, 'entire own weapon tuple uses the same fresh authority as its ACK');
  test.snapshot.immediateAuthority.ackInputSeq = 7;
  test.bridge.apply(test.snapshot);
  assert.equal(test.game.player._networkAmmoSelectionPending, true, 'same-tick mutation cannot settle newer intent');
  test.snapshot.immediateAuthority.tick++;
  test.bridge.apply(test.snapshot);
  assert.equal(test.game.player._networkAmmoSelectionPending, false);

  test.upload(0);
  rawAuthority.flags = SNAPSHOT_FLAGS.DESTROYED;
  rawAuthority.hp = 0;
  test.snapshot.immediateAuthority.tick++;
  test.snapshot.immediateAuthority.ackInputSeq = null;
  test.bridge.apply(test.snapshot);
  assert.equal(test.game.player._networkAmmoSelectionPending, false);
  assert.equal(test.game.player.input.shellSlot, 1, 'death clears pending selection without fabricating a live weapon');

  delete test.snapshot.immediateAuthority;
  test.snapshot.meta.roomRound = 1;
  test.authority(2, null);
  assert.equal(test.game.player.input.shellSlot, 2, 'new round seeds authority instead of old intent');
  test.upload(0);
  assert.equal(test.game.player._networkAmmoSelectionPending, true);
  const retiredPlayer = test.game.player;
  test.close();
  assert.equal(retiredPlayer._networkAmmoSelectionPending, false, 'disposed presentation cannot retain switching state');
} finally { test.close(); }

const fresh = await fixture();
try {
  assert.equal(fresh.game.player.input.shellSlot, 0);
  assert.equal(fresh.game.player._networkAmmoSelectionPending, false,
    'a new browser session never inherits an old bridge selection lease');
} finally { fresh.close(); }

// Real countdown snapshots acknowledge received input while deliberately
// withholding ammo application, including the first phase=playing snapshot.
const countdown = await fixture(0);
const normal = new Vector3(0, 1, 0);
const heightField = { getHeightAt: () => 0, getHeightAtFast: () => 0,
  getNormalAt: () => normal, getGroundType: () => 'hard' };
const simulation = createAuthoritativeMatch({ mapId: 'winter', seed: 9, countdownS: 0.05,
  worldCollision: { heightField }, players: [
    { id: 'driver', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -100, yaw: 0 } },
    { id: 'opponent', specId: 'm1a2', team: 'bravo', bot: true, spawn: { x: 0, z: 300, yaw: Math.PI } },
  ] });
const link = createLoopbackTransportPair({ direct: true });
const host = new AuthoritativeMatchRuntime({ simulation, snapshotHz: 60 });
try {
  host.attachPeer({ peerId: 'driver', transport: link.host });
  countdown.client.reconnectTransport({ ...link.client,
    sendInput(message) { return link.client.send(snapshotWireCodec.decode(snapshotWireCodec.encode(message))); } });
  countdown.client.readyForMatch();
  const step = () => {
    host.advance(1000 / 60);
    const snapshot = countdown.client.update(host.timeMs);
    assert.ok(snapshot?.immediateAuthority);
    countdown.bridge.apply(snapshot);
    return snapshot;
  };
  assert.equal(step().meta.phase, 'countdown');
  countdown.upload(1);
  const receivedButDeferred = step();
  assert.equal(receivedButDeferred.immediateAuthority.ackInputSeq, 0);
  assert.equal(receivedButDeferred.immediateAuthority.entity.shellSlot, 0);
  assert.equal(countdown.game.player.input.shellSlot, 1);
  assert.equal(countdown.game.player._networkAmmoSelectionPending, true,
    'countdown receipt does not invent a denied selection');
  let firstPlaying;
  for (let index = 0; index < 10; index++) {
    countdown.upload(1);
    const snapshot = step();
    if (snapshot.meta.phase === 'playing') { firstPlaying = snapshot; break; }
  }
  assert.ok(firstPlaying, 'bounded fixture reaches the actual playing transition');
  assert.equal(firstPlaying.immediateAuthority.entity.shellSlot, 0,
    'actual transition tick has not yet applied the received ammo request');
  assert.equal(countdown.game.player.input.shellSlot, 1);
  assert.equal(countdown.game.player._networkAmmoSelectionPending, true);
  countdown.upload(1);
  const applied = step();
  assert.equal(applied.immediateAuthority.entity.shellSlot, 1);
  assert.equal(countdown.game.player.input.shellSlot, 1);
  assert.equal(countdown.game.player._networkAmmoSelectionPending, false,
    'first input sent after observed playing authority settles against a real applied selection');
} finally { countdown.close(); host.close(); }

console.log('browser ammunition selection wire regression passed');
