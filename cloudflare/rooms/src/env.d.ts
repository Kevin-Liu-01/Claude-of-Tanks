/**
 * Bindings Wrangler cannot generate: the secrets (`wrangler secret put`), the
 * optional local shim, and the parked container binding. `worker-configuration.d.ts`
 * (generated) declares the rest; both merge into the global `Env`.
 */
import type { MatchContainer } from './matchContainer.ts';

export {};

declare global {
  /** The secrets and the local shim, shared by the global `Env` (the Worker's classes) and `Cloudflare.Env` (the `env`
   * export of `cloudflare:workers`, which the tests read — 2026-09-28: the test typecheck had no MATCH_SEAT_SECRET there). */
  interface RoomsSecretBindings {
    /** HMAC secret for seat tokens. A p2p match signs with a per-match secret derived from it (never handed to a client
     * as is); the parked match container receives the same value as COT_MATCH_SEAT_SECRET. */
    MATCH_SEAT_SECRET: string;
    /** Bearer secret of the match service's control routes (defaults to the seat secret). */
    MATCH_CONTROL_SECRET?: string;
    /** Local runs only (`wrangler dev --var MATCH_BATTLE_LIMIT_S:20`): the container's COT_MATCH_BATTLE_LIMIT_S. Never set in production. */
    MATCH_BATTLE_LIMIT_S?: string;
    /**
     * The parked dedicated-service backend (docs/MULTIPLAYER-V2.md §13): absent on the Free plan, where the p2p host
     * runs every match. A paid account binds it (and restores the `containers` block) to select the container backend.
     */
    MATCH?: DurableObjectNamespace<MatchContainer>;
  }
  interface Env extends RoomsSecretBindings {}
  namespace Cloudflare {
    interface Env extends RoomsSecretBindings {}
  }
}
