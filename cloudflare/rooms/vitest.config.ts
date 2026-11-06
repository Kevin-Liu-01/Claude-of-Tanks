import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Two Workers-runtime projects over the real Worker and Room object (the deployed shape since the cutover of
 * 2026-09-29, docs/MULTIPLAYER-V2.md §13.10):
 *   rooms  — wrangler.test.jsonc (no relay secret): the room lifecycle (test/rooms.test.ts) and the peer-to-peer match
 *            host: election, signaling, reports and migration (test/p2p.test.ts) — and a seat's relay request answered
 *            with STUN alone while the secrets are unset; the phone controller's pairing (test/pad.test.ts).
 *   relay  — wrangler.relay.test.jsonc (a fake Cloudflare TURN key, an eight-hour lease asked for): the relay
 *            credentials minted inside the room for seated players only (test/relay.test.ts, 2026-10-02, §13.14).
 * A test's timeout is a hang guard, not a speed bound (round 3 B14, 2026-11-06): the four files run at once, and on a
 * machine at load 250-420 the keepalive case (an eviction, five object round trips, some 270 frames) passed 20 s in
 * full runs while taking about a second idle; the 28-seat and admin-migration cases took 13-14 s.
 */
const TEST_TIMEOUT_MS = 90_000;
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' } })],
        test: { name: 'rooms', include: ['test/rooms.test.ts', 'test/p2p.test.ts', 'test/pad.test.ts'], testTimeout: TEST_TIMEOUT_MS },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.relay.test.jsonc' } })],
        test: { name: 'relay', include: ['test/relay.test.ts'], testTimeout: TEST_TIMEOUT_MS },
      },
    ],
  },
});
