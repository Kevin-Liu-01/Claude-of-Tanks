import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { createBrowserBattleBridge } from './browserBattleBridge.ts';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.ts';
import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { createNetworkFramePump } from './networkFramePump.ts';
import { createNetworkRecoveryOwner } from './connectionRecovery.ts';
import { BrowserInputRuntime } from './browserInputRuntime.ts';
import { snapshotWireCodec } from './snapshotWireCodec.ts';
import { createEnvelope, MESSAGE_TYPES, nextSequence } from './protocol.ts';
import { selectShell } from '../sim/damage.ts';
import '../vehicles/modern3Specs.ts';

// Exercise exactly the binary INPUT/SNAPSHOT conversion used by RTC/WS,
// plus JSON reliable events. Object-only loopback misses optional wire fields.
function encodedTransport(endpoint, packets = []) {
  return { kind: 'encoded-loopback', get readyState() { return endpoint.readyState; },
    onMessage: endpoint.onMessage, onClose: endpoint.onClose, close: endpoint.close,
    send(envelope) {
      if (envelope.type === 'input' || envelope.type === 'snapshot') {
        const bytes = snapshotWireCodec.encode(envelope);
        packets.push(JSON.parse(new TextDecoder().decode(bytes)));
        return endpoint.send(snapshotWireCodec.decode(bytes));
      }
      return endpoint.send(JSON.parse(JSON.stringify(envelope)));
    },
  };
}

const simulation = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0,
  players: [
    { id: 'own', specId: 'm1a2', team: 'alpha', spawn: { x: 0, z: -350, yaw: Math.PI / 2 } },
    { id: 'enemy', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 350, yaw: 0 } },
  ] });
const host = new AuthoritativeMatchRuntime({ simulation });
let now = 0;
const links = ['own', 'enemy'].map((id) => {
  const link = createLoopbackTransportPair({ direct: true });
  host.attachPeer({ peerId: id, transport: encodedTransport(link.host) });
  const client = new MatchClientRuntime({ playerId: id, transport: encodedTransport(link.client), clock: () => now });
  client.connect();
  client.readyForMatch();
  return { link, client };
});
const client = links[0].client;
const enemyEvents = [];
links[1].client.onEvent((event) => enemyEvents.push(event));
const game = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null,
  timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'verdant' };
const feedback = [];
let recoilCount = 0;
const bridge = createBrowserBattleBridge({ game, viewerId: 'own',
  engineCtx: { scene: { add() {}, remove() {} } },
  bus: { emit(type, payload) { feedback.push({ type, payload, at: now }); } },
  createTankVisual() { return { root: { position: new Vector3() },
    setVisible() {}, syncFromState() {}, dispose() {},
    recoilKick() { recoilCount++; return 0; },
    gunMuzzleWorld(out) { return out.set(2, 3, -350); },
    gunDirWorld(out) { return out.set(1, 0, 0); },
  }; },
});
let active = true;
let localMatch = { role: 'client', client,
  update: (time) => client.update(time), submitInput: (input) => client.submitInput(input) };
const pump = createNetworkFramePump({ getMatch: () => localMatch, getBridge: () => bridge,
  getStatus: () => null, getPlayer: () => game.player, isBattleActive: () => active,
  recovery: createNetworkRecoveryOwner(), nextFrame: async () => {}, now: () => now });
pump.ensureInputRuntime(() => new BrowserInputRuntime());
const neutral = { throttle: 0, steer: 0, brake: true, fire: false,
  aimYaw: Math.PI / 2, aimPitch: 0, aimDistance: 800, shellSlot: 0, actionBits: 0 };
client.submitInput(neutral);
now = 50;
host.advance(50);
pump.pump(1 / 60, now);
assert.ok(game.player);
const shooter = simulation.entityById.get('own');
const ammoBefore = shooter.combat.ammo[0];
const snapshotCount = client.snapshotPacketsReceived;
game.player.input.fire = true;
now += 1000 / 60;
pump.pump(1 / 60, now);
const predicted = feedback.filter((event) => event.type === 'weapon:predicted');
assert.equal(predicted.length, 1, 'the accepted trigger intent presents in its first display frame');
assert.equal(predicted[0].at, now);
assert.equal('shellId' in predicted[0].payload, false, 'prediction has no ballistic shell identity');
assert.equal(shooter.combat.ammo[0], ammoBefore, 'first-frame feedback does not run gameplay');
assert.equal(game.shells.length, 0);
host.advance(1000 / 60);
assert.equal(client.snapshotPacketsReceived, snapshotCount,
  'accepted shots flush at the 60Hz tick without capturing another 20Hz snapshot');
assert.equal(shooter.combat.ammo[0], ammoBefore - 1, 'only authority consumes the ammunition');
now += 1000 / 60;
pump.pump(1 / 60, now);
const fired = feedback.filter((event) => event.type === 'shell:fired');
assert.equal(fired.length, 1);
assert.equal(fired[0].at, now, 'confirmed feedback is emitted in the first displayed frame after authority receipt');
assert.equal(recoilCount, 1);
assert.equal(fired[0].payload.feedbackPredicted, true, 'exact intent confirmation suppresses duplicate feedback');
assert.equal(fired[0].payload.fireIntentSeq, predicted[0].payload.fireIntentSeq);
assert.equal(game.player.combat.ammo[0], ammoBefore,
  'feedback never alters browser combat/HUD authority before the next snapshot');
assert.equal(game.shells.length, 0, 'feedback never creates predicted ballistic shells');
assert.equal(enemyEvents.some((event) => event.type === 'shell_fired' && event.shooterId === 'own'), false,
  'the faster event lane preserves the same unspotted enemy filter as snapshots');
for (let index = 0; index < 20; index++) {
  now += 1000 / 60;
  host.advance(1000 / 60);
  pump.pump(1 / 60, now);
}
assert.equal(feedback.filter((event) => event.type === 'shell:fired').length, 1,
  'snapshot publication and delayed remote chronology never duplicate the confirmed report');

// Reload, empty ammunition and destroyed gun authority deny both fast and
// ordinary muzzle feedback. The presenter cannot manufacture a shot.
for (const denial of ['reload', 'empty', 'gun']) {
  shooter.combat.reload.t = denial === 'reload' ? 10 : 0;
  shooter.combat.ammo.fill(denial === 'empty' ? 0 : 10);
  shooter.combat.modules.gun.state = denial === 'gun' ? 'red' : 'ok';
  client.submitInput({ ...neutral, fire: true });
  now += 1000 / 60;
  host.advance(1000 / 60);
  pump.pump(1 / 60, now);
}
assert.equal(recoilCount, 1, 'denied authority never reaches presentation');
shooter.combat.modules.gun.state = 'ok';
shooter.combat.reload.t = 0;
client.submitInput({ ...neutral, fire: true });
now += 1000 / 60;
host.advance(1000 / 60);
pump.pumpBackground(now);
assert.equal(recoilCount, 1, 'a shot accepted just before blur emits no hidden effects');
now += 1000 / 60;
host.advance(1000 / 60);
pump.pump(1 / 60, now);
assert.equal(recoilCount, 1, 'hidden confirmation cannot replay on focus');
active = false;
shooter.combat.reload.t = 0;
client.submitInput({ ...neutral, fire: true });
now += 1000 / 60;
host.advance(1000 / 60);
pump.pump(1 / 60, now);
assert.equal(recoilCount, 1, 'inactive result/entry presentation cannot play a local shot');
const ammoAfter = shooter.combat.ammo[0];
bridge.playLocalConfirmedShots([{ type: 'shell_fired', shellId: 999, shooterId: 'enemy' }]);
assert.equal(recoilCount, 1, 'the bridge fast port is receiver-owned, not arbitrary remote firing');
assert.equal(shooter.combat.ammo[0], ammoAfter);
// A reliable batch may arrive only after its tick has already been rendered.
// Its shot registration must still precede an immediate terrain/prop expiry;
// otherwise FX creates a stranded shell tail after processing its deletion.
active = true;
game.player.input.fire = false;
for (let index = 0; index < 20; index++) {
  now += 1000 / 60;
  host.advance(1000 / 60);
  pump.pump(1 / 60, now);
}
const immediateShell = 998;
links[0].link.host.send(createEnvelope(MESSAGE_TYPES.EVENT, { tick: 0, events: [
  { type: 'shell_fired', shellId: immediateShell, shooterId: 'own', shellType: 'APFSDS',
    shellName: shooter.spec.gun.shells[0].name, caliberMm: 120, x: 2, y: 3, z: -350,
    dx: 1, dy: 0, dz: 0, fireIntentSeq: null, shellSlot: 0 },
  { type: 'shell_impact', shellId: immediateShell, shooterId: 'own', kind: 'terrain',
    x: 2, y: 3, z: -350, nx: 0, ny: 1, nz: 0 },
] }, { seq: nextSequence(client.lastRecvSeq), tick: client.clientTick }));
now += 1000 / 60;
pump.pump(1 / 60, now);
assert.deepEqual(feedback.filter((event) => event.payload.shellId === immediateShell)
  .map((event) => event.type), ['shell:fired', 'shell:expired'],
  'late same-tick shot and impact preserve authoritative shell lifetime ordering');
pump.dispose();
localMatch = null;
bridge.dispose();
for (const entry of links) entry.client.close();
host.close();

function checkWeapon({ specId = 'm1a2', slot = 0, role = 'client', legacy = false, heldFrames = 1, denial = null }) {
  const sim = createAuthoritativeMatch({ mapId: 'verdant', countdownS: 0, players: [
    { id: 'own', specId, team: 'alpha', spawn: { x: 0, z: -350, yaw: Math.PI / 2 } },
    { id: 'enemy', specId: 'm1a2', team: 'bravo', spawn: { x: 0, z: 350, yaw: 0 } },
  ] });
  if (legacy) Object.defineProperty(sim, 'shotFeedbackVersion', { value: 0 });
  const owner = sim.entityById.get('own');
  selectShell(owner.combat, slot);
  for (const channel of owner.combat.reloadChannels) channel.t = 0;
  if (denial === 'reload') owner.combat.reload.t = 10;
  if (denial === 'empty') owner.combat.ammo.fill(0);
  if (denial === 'gun') owner.combat.modules.gun.state = 'red';
  const server = new AuthoritativeMatchRuntime({ simulation: sim });
  const pair = createLoopbackTransportPair({ direct: true });
  const packets = [];
  let clock = 0;
  server.attachPeer({ peerId: 'own', transport: encodedTransport(pair.host) });
  const peer = new MatchClientRuntime({ playerId: 'own', transport: encodedTransport(pair.client, packets), clock: () => clock });
  peer.connect(); peer.readyForMatch();
  const otherPair = createLoopbackTransportPair({ direct: true });
  server.attachPeer({ peerId: 'enemy', transport: encodedTransport(otherPair.host) });
  const other = new MatchClientRuntime({ playerId: 'enemy', transport: encodedTransport(otherPair.client), clock: () => clock });
  other.connect(); other.readyForMatch();
  const state = { tanks: [], tankById: new Map(), player: null, shells: [], spotting: null,
    timeS: 0, preBattleS: 0, result: null, resultReason: null, mapId: 'verdant' };
  const reports = [];
  let recoil = 0;
  const presenter = createBrowserBattleBridge({ game: state, viewerId: 'own',
    engineCtx: { scene: { add() {}, remove() {} } },
    bus: { emit(type, payload) { reports.push({ type, payload }); } },
    createTankVisual() { return { root: { position: new Vector3() },
      setVisible() {}, syncFromState() {}, dispose() {},
      recoilKick() { recoil++; return 0; },
      gunMuzzleWorld(out) { return out.set(2, 3, -350); }, gunDirWorld(out) { return out.set(1, 0, 0); },
    }; },
  });
  const match = role === 'host' ? { role, client: peer, advance(ms, input) {
    if (input) peer.submitInput(input);
    server.advance(ms);
    return peer.update(clock);
  } } : { role, client: peer, submitInput: (input) => peer.submitInput(input), update: (time) => peer.update(time) };
  const frame = createNetworkFramePump({ getMatch: () => match, getBridge: () => presenter,
    getStatus: () => null, getPlayer: () => state.player, isBattleActive: () => true,
    recovery: createNetworkRecoveryOwner(), nextFrame: async () => {}, now: () => clock });
  frame.ensureInputRuntime(() => new BrowserInputRuntime());
  peer.submitInput({ ...neutral, shellSlot: slot });
  clock = 50; server.advance(50); frame.pump(1 / 60, clock);
  assert.ok(state.player);
  state.player.input.shellSlot = slot;
  state.player.input.fire = true;
  const ammo = owner.combat.ammo[slot];
  for (let index = 0; index < heldFrames + 1; index++) {
    clock += 1000 / 60;
    frame.pump(1 / 60, clock);
    if (role === 'client') server.advance(1000 / 60);
  }
  const accepted = reports.filter((event) => event.type === 'shell:fired');
  const predictions = reports.filter((event) => event.type === 'weapon:predicted');
  if (denial) {
    assert.equal(accepted.length, 0, `${denial}: authority denies the new trigger`);
    assert.equal(predictions.length, 0, `${denial}: fresh encoded readiness denies speculation`);
    assert.equal(recoil, 0);
    assert.equal(owner.combat.ammo[slot], ammo);
    frame.dispose(); presenter.dispose(); peer.close(); other.close(); server.close();
    return;
  }
  assert.ok(accepted.length >= 1, `${specId}/${slot}/${role}: authority accepted a real shot`);
  assert.equal(predictions.length, legacy ? 0 : 1, 'one first-frame prediction per held intent, capability required');
  assert.equal(recoil, accepted.length, 'confirmed first shot and every held follow-up have exactly one recoil');
  assert.equal(accepted[0].payload.feedbackPredicted, !legacy);
  for (const later of accepted.slice(1)) assert.equal(later.payload.feedbackPredicted, false);
  if (heldFrames > 60) assert.ok(accepted.length >= 3, 'real held autocannon preserves sustained confirmed reports');
  assert.equal(owner.combat.ammo[slot], ammo - accepted.length);
  if (!legacy) {
    assert.equal(accepted[0].payload.fireIntentSeq, predictions[0].payload.fireIntentSeq);
    assert.ok(packets.some((packet) => packet[0] === 3 && packet.length === 19));
  } else {
    assert.ok(packets.every((packet) => packet[0] !== 3 || packet.length === 18), 'legacy host receives exact old compact shape');
    assert.equal(accepted[0].payload.fireIntentSeq, null);
  }
  if (role === 'host') assert.equal(accepted.length, 1, 'synchronous authority acceptance before prediction deduplicates in the same frame');
  frame.dispose(); presenter.dispose(); peer.close(); other.close(); server.close();
}
checkWeapon({ role: 'host' });
checkWeapon({ legacy: true });
checkWeapon({ specId: 'm2a2_bradley', heldFrames: 90 });
checkWeapon({ specId: 'm2a2_bradley', slot: 1 });
checkWeapon({ specId: 'm2a2_bradley', slot: 2 });
for (const denial of ['reload', 'empty', 'gun']) checkWeapon({ denial });
console.log('localShotFeedback.selftest: encoded authority→60Hz event→first-frame feedback, cannon/ATGM/autocannon, host, legacy, privacy and cancellation passed');
