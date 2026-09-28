import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

/**
 * Two Workers-runtime projects (2026-09-28, the peer-to-peer re-scope):
 *   p2p      — the deployed shape (wrangler.p2p.test.jsonc: no MATCH binding, no shim): the Room object elects,
 *              signals and migrates the host commander's browser; test/p2p.test.ts.
 *   service  — the parked dedicated-service backend (wrangler.test.jsonc binds test/matchContainerStub.ts as
 *              MATCH): the container start, proxy, polls and verdict stay proven; test/rooms.test.ts.
 */
export default defineConfig({
  test: {
    projects: [
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.p2p.test.jsonc' } })],
        test: { name: 'p2p', include: ['test/p2p.test.ts'], testTimeout: 20_000 },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.test.jsonc' } })],
        test: { name: 'service', include: ['test/rooms.test.ts'], testTimeout: 20_000 },
      },
    ],
  },
});
