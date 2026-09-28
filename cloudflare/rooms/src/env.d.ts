/**
 * Bindings Wrangler cannot generate: the secrets (`wrangler secret put`) and
 * the optional local shim. `worker-configuration.d.ts` (generated) declares
 * the rest; both merge into the global `Env`.
 */
export {};

declare global {
  /** The secrets and the local shim, shared by the global `Env` (the Worker's classes) and `Cloudflare.Env` (the `env`
   * export of `cloudflare:workers`, which the tests read — 2026-09-28: the test typecheck had no MATCH_SEAT_SECRET there). */
  interface RoomsSecretBindings {
    /** HMAC secret for seat tokens; the same value the match container receives as COT_MATCH_SEAT_SECRET. */
    MATCH_SEAT_SECRET: string;
    /** Bearer secret of the match service's control routes (defaults to the seat secret). */
    MATCH_CONTROL_SECRET?: string;
    /** Local runs only (`wrangler dev --var MATCH_BATTLE_LIMIT_S:20`): the container's COT_MATCH_BATTLE_LIMIT_S. Never set in production. */
    MATCH_BATTLE_LIMIT_S?: string;
  }
  interface Env extends RoomsSecretBindings {}
  namespace Cloudflare {
    interface Env extends RoomsSecretBindings {}
  }
}
