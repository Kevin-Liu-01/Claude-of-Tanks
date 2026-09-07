import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { abandonmentOptions, verifyProductionAbandonment } from './production-room-abandonment.mjs';
import { createSignalingServer } from '../server/signalingServer.ts';
import { SignalingRoomStore } from '../server/roomStore.ts';

const safe = { url: 'wss://signal.example.test/rooms', origin: 'https://game.example.test' };
assert.deepEqual(abandonmentOptions(safe), { ...safe, timeoutMs: 225_000 });
for (const change of [
  { url: 'ws://signal.example.test/rooms' }, { url: 'wss://USER:SECRET@signal.example.test' },
  { url: 'https://signal.example.test' }, { url: 'wss://signal.example.test?SECRET=TOKEN' },
  { url: 'wss://signal.example.test/signal' }, { url: 'wss://signal.example.test/rooms/ABCDEF' },
  { url: 'wss://signal.example.test#SECRET' }, { origin: 'https://USER:SECRET@game.example.test' },
  { origin: 'https://game.example.test/path' }, { origin: 'https://game.example.test#SECRET' },
  { timeoutMs: 0 }, { timeoutMs: NaN }, { timeoutMs: 300_001 }, { timeoutMs: 10_000.5 },
]) assert.throws(() => abandonmentOptions({ ...safe, ...change }), TypeError);
const child = spawnSync(process.execPath, ['tools/production-room-abandonment.mjs',
  '--url=wss://USER:SECRET@signal.example.test', '--origin=https://game.example.test'],
{ encoding: 'utf8', timeout: 5000 });
assert.equal(child.status, 1);
assert.doesNotMatch(child.stdout + child.stderr, /USER|SECRET|signal\.example/);
assert.equal(JSON.parse(child.stderr).code, 'abandonment_configuration_failed');

async function nativeFixture({ uncertainCreate = false, lostCleanupReply = false } = {}) {
  // Real native WebSockets and shared membership implementation, with a
  // accelerated injected server/probe clock. Not a real-wall-clock Worker claim.
  const started = performance.now();
  const now = () => 1000 + (performance.now() - started) * 200;
  const codes = ['ABCDAB', 'ABCDAC'];
  const cleanupJoins = new Map();
  class RoutedStore extends SignalingRoomStore {
    create(connection, options) {
      this.roomCodeFactory = () => options.roomCode;
      const result = super.create(connection, options);
      if (uncertainCreate) throw Object.assign(new Error('PRIVATE_POST_COMMIT_ERROR'), { code: 'signaling_store_unavailable' });
      return result;
    }
    join(connection, options) {
      const result = super.join(connection, options);
      if (options.player.id === 'cleanup_host') {
        const previous = cleanupJoins.get(options.roomCode) || [];
        previous.push({ resumeToken: options.resumeToken, nextResumeToken: options.nextResumeToken,
          sessionId: options.sessionId });
        cleanupJoins.set(options.roomCode, previous);
      }
      return result;
    }
  }
  const store = new RoutedStore({ now });
  const service = createSignalingServer({ host: '127.0.0.1', port: 0, now, store,
    allowedOrigins: ['http://127.0.0.1'], webSocketPaths: codes.map((code) => `/rooms/${code}`),
    cleanupIntervalMs: 10, unauthenticatedTimeoutMs: 1_000_000 });
  const dropped = new Set();
  if (lostCleanupReply) service.webSocketServer.on('connection', (socket) => {
    const send = socket.send.bind(socket);
    socket.send = (data, ...args) => {
      const message = JSON.parse(String(data));
      if (message.type === 'room_joined' && !dropped.has(message.payload.roomCode)) {
        dropped.add(message.payload.roomCode);
        setTimeout(() => socket.terminate(), 1);
        return;
      }
      return send(data, ...args);
    };
  });
  let sequence = 0;
  try {
    const address = await service.listen();
    const run = verifyProductionAbandonment({ url: `ws://127.0.0.1:${address.port}/rooms`,
      origin: 'http://127.0.0.1', timeoutMs: 10000 }, { now, heartbeatMs: 20,
      requestTimeoutMs: 200, notificationTimeoutMs: 3000, codeFactory: () => codes[sequence++] });
    if (uncertainCreate) {
      await assert.rejects(run, (error) => {
        assert.equal(error.code, 'production_abandonment_failed');
        assert.deepEqual(error.cleanup, { ownedRoomsRemoved: true, socketsTerminated: true });
        assert.doesNotMatch(JSON.stringify(error), /PRIVATE|ABCDAB|ABCDAC/);
        return true;
      });
      assert.equal(cleanupJoins.size, 2, 'post-commit errors must not skip exact-capability room cleanup');
    } else {
      const result = await run;
      assert.equal(result.ok, true);
      assert.equal(result.abruptHost.guestTrafficDidNotRenewHost, true);
      assert.equal(result.silentOpenHost.roomNotFound, true);
      assert.deepEqual(result.cleanup, { ownedRoomsRemoved: true, socketsTerminated: true });
      assert.doesNotMatch(JSON.stringify(result), /cleanup_host|ABCDAB|ABCDAC/);
    }
    if (lostCleanupReply) {
      assert.equal(dropped.size, 2);
      for (const requests of cleanupJoins.values()) {
        assert.equal(requests.length, 2, 'lost admission receipt receives only one bounded retry');
        assert.deepEqual(requests[0], requests[1], 'retry must prove the exact already-installed successor');
      }
    }
    assert.equal(store.rooms.size, 0, 'no owned room remains, including failed creation paths');
    assert.equal(store.membership.size, 0, 'no expired or replacement membership remains');
  } finally {
    await service.close();
    assert.equal(service.webSocketServer.clients.size, 0, 'every owned native socket is closed');
  }
}

await nativeFixture();
await nativeFixture({ uncertainCreate: true });
await nativeFixture({ uncertainCreate: true, lostCleanupReply: true });
console.log('Production abandonment probe checks passed (native local accelerated lifecycle, uncertain writes, lost reply cleanup, privacy; not a live Worker receipt)');
