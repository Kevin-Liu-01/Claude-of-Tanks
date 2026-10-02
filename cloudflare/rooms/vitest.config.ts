import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Two Workers-runtime projects over the real Worker and Room object (the deployed shape since the cutover of
 * 2026-09-29, docs/MULTIPLAYER-V2.md §13.10):
 *   rooms  — wrangler.test.jsonc (no relay secret): the room lifecycle (test/rooms.test.ts) and the peer-to-peer match
 *            host: election, signaling, reports and migration (test/p2p.test.ts) — and a seat's relay request answered
 *            with STUN alone while the secrets are unset.
 *   relay  — wrangler.relay.test.jsonc (a fake Cloudflare TURN key, an eight-hour lease asked for): the relay
 *            credentials minted inside the room for seated players only (test/relay.test.ts, 2026-10-02, §13.14).
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' } })],
        test: { name: 'rooms', include: ['test/rooms.test.ts', 'test/p2p.test.ts'], testTimeout: 20_000 },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.relay.test.jsonc' } })],
        test: { name: 'relay', include: ['test/relay.test.ts'], testTimeout: 20_000 },
      },
    ],
  },
});
