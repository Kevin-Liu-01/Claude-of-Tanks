import { createLoopbackTransportPair } from './loopbackTransport.ts';
import { AuthoritativeMatchRuntime, MatchClientRuntime } from './matchRuntime.js';

/**
 * Compose the real host/client modules over an in-process transport.
 * Campaign and bot matches use this adapter instead of calling simulation
 * internals directly, keeping networking from becoming a second game mode.
 */
export function createLocalMatchSession({
  playerId = 'local-player',
  simulation,
  tickHz,
  snapshotHz,
  interpolationDelayMs = 0,
  maxExtrapolationMs = 0,
} = {}) {
  const transports = createLoopbackTransportPair();
  const host = new AuthoritativeMatchRuntime({ simulation, tickHz, snapshotHz });
  let wallTimeMs = 0;
  const client = new MatchClientRuntime({
    transport: transports.client,
    playerId,
    interpolationDelayMs,
    maxExtrapolationMs,
    clock: () => wallTimeMs,
  });
  host.attachPeer({ peerId: playerId, transport: transports.host });
  client.connect({ mode: 'loopback' });

  return {
    kind: 'loopback',
    role: 'host',
    playerId,
    simulation,
    host,
    client,
    ready() { return client.readyForMatch(); },
    async advance(elapsedMs, input = null) {
      if (input) client.submitInput(input, host.tick);
      // Respect the same asynchronous delivery ordering as network adapters.
      await Promise.resolve();
      host.advance(elapsedMs);
      await Promise.resolve();
      wallTimeMs += elapsedMs;
      return client.update(wallTimeMs);
    },
    close(reason = 'local_session_closed') {
      client.close(reason);
      host.close(reason);
    },
  };
}
