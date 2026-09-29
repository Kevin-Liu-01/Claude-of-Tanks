import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * One Workers-runtime project (the deployed shape since the cutover of 2026-09-29, docs/MULTIPLAYER-V2.md §13.10):
 * the real Worker and Room object under wrangler.test.jsonc — the room lifecycle (test/rooms.test.ts) and the
 * peer-to-peer match host: election, signaling, reports and migration (test/p2p.test.ts).
 */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' } })],
  test: {
    include: ['test/rooms.test.ts', 'test/p2p.test.ts'],
    testTimeout: 20_000,
  },
});
