// A host core stopped while its world loads starts no actor (2026-10-13, the MP stream). boot() awaited the world and
// then checked only `disposed`, and stop() kept the links opened during the load (`pendingOpens`): a seat that left its
// battle while its host's world was still loading (session.leaveMatch → host.stop → the core's 'stop') left a core that
// built an actor anyway, replayed the queued loopback link, welcomed the seat and ran for ever — its stop had already
// run, and dispose() → stop() returned early. In a browser the Worker's termination hid it; in Node (receipts, the e2e
// harness, any in-process host) the actor never stopped, and a receipt that hit the race grew to 46 GB before it was
// killed. This receipt drives the core through its port exactly as the browser host does: boot, the loopback link and its
// HELLO while the world loads, stop, the load finishing — and asserts no actor, no frames, and a bounded process.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHostPortPair, HOST_LOOPBACK_PEER } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { planHostBoot } from './hostPlan.ts';
import { createRoom, joinRoom } from '../room/roomPolicy.ts';
import { encodeMessage } from '../wire/codec.ts';
import { CLOSE_REASON, MESSAGE_TYPE, PROTOCOL_VERSION } from '../wire/index.ts';
import { signSeatToken } from '../../../server/match/seatToken.ts';

const watchdog = setTimeout(() => { console.error('hostStopRace.selftest: stuck (a running actor keeps the process alive)'); process.exit(1); }, 30_000);
watchdog.unref();
const memoryGuard = setInterval(() => { if (process.memoryUsage().rss > 1.5e9) { console.error('hostStopRace.selftest: RSS past 1.5 GB: a leak'); process.exit(1); } }, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const room = createRoom({ roomCode: 'STOPRC', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: 'verdant', botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
const matchId = 'm1-0000570p';
const plan = planHostBoot(room, { matchId, round: 1, mapId: 'verdant', mode: 'standard', seed: 7, seat: 0, team: 'alpha', hostId: 'me' }, 'me');
const secret = createHash('sha256').update('host-stop-race').digest('hex');
const token = signSeatToken(secret, { v: 1, roomId: 'STOPRC', seat: 0, playerId: 'me', name: 'Me', team: 'alpha', specId: 'm1a1_abrams_hc', iat: Date.now() - 1000, exp: Date.now() + 3_600_000 });
const hello = encodeMessage({ type: MESSAGE_TYPE.HELLO, protocolVersion: PROTOCOL_VERSION, capabilities: 0, token, clientBuild: 'stop-race' });
const bootConfig = { roomId: 'STOPRC', matchId, generation: 1, mapId: 'verdant', mode: 'standard', seed: 7, seats: plan.seats, bots: plan.bots, countdownS: 1, hostSecret: secret, manifestBase: null, resume: null };

/** A core whose world takes `loadMs` to build; the main side records what the core posts. */
function hostWithSlowWorld(loadMs) {
  const pair = createHostPortPair();
  let loaded = false;
  const core = createMatchHostCore({ port: pair.worker, buildWorld: async () => { await sleep(loadMs); loaded = true; return 'terrain'; }, reportIntervalMs: 500 });
  const posted = [];
  pair.main.onMessage((message) => posted.push(message.type));
  return { pair, core, posted, isLoaded: () => loaded };
}

// ---- stopped mid-load, with the loopback link and its HELLO queued: no actor, no frames, nothing running
{
  const { pair, core, posted, isLoaded } = hostWithSlowWorld(400);
  pair.main.post({ type: 'boot', config: bootConfig });
  pair.main.post({ type: 'link_open', peer: HOST_LOOPBACK_PEER, label: 'loopback' });
  pair.main.post({ type: 'link_frame', peer: HOST_LOOPBACK_PEER, bytes: hello.slice().buffer });
  await sleep(50);
  assert.equal(isLoaded(), false, 'the world is still loading');
  pair.main.post({ type: 'stop', reason: CLOSE_REASON.CLIENT_LEAVE, detail: 'left during the load' });
  await sleep(20);
  assert.equal(core.stopped, true);
  while (!isLoaded()) await sleep(20);
  await sleep(300);
  // assert.ok, not assert.equal(core.actor, null): a failure must not carry the actor (a whole match) into the printed error
  assert.ok(core.actor === null, 'no actor after the stop (before: one built, the loopback seat welcomed, the loop running)');
  assert.equal(core.booted, false);
  assert.equal(posted.filter((type) => type === 'link_send').length, 0, 'no frame for the queued loopback seat');
  assert.equal(posted.includes('ready'), false, 'the core never reports ready');
  assert.equal(posted.includes('report'), false, 'nor a match report');
  core.dispose();
  pair.main.close();
}

// ---- the same host not stopped boots and welcomes the queued seat (the queue itself still works)
{
  const { pair, core, posted, isLoaded } = hostWithSlowWorld(200);
  pair.main.post({ type: 'boot', config: bootConfig });
  pair.main.post({ type: 'link_open', peer: HOST_LOOPBACK_PEER, label: 'loopback' });
  pair.main.post({ type: 'link_frame', peer: HOST_LOOPBACK_PEER, bytes: hello.slice().buffer });
  while (!isLoaded()) await sleep(20);
  const started = Date.now();
  while (!posted.includes('link_send') && Date.now() - started < 3000) await sleep(20);
  assert.ok(core.actor, 'an actor once the world loads');
  assert.ok(posted.includes('link_send'), 'the queued loopback seat is welcomed');
  assert.ok(posted.includes('ready'), 'and the core reports ready (the check above is not vacuous)');
  core.dispose();
  assert.equal(core.actor.stopped, true, 'dispose stops a running actor');
  pair.main.close();
}
assert.ok(process.memoryUsage().rss < 1e9, 'bounded');
console.log('hostStopRace.selftest: a core stopped during its world load starts no actor and sends nothing to the queued loopback seat; an unstopped core still welcomes it');
