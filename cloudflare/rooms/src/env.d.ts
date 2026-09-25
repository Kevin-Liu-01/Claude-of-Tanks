/**
 * Bindings Wrangler cannot generate: the secrets (`wrangler secret put`) and
 * the optional local shim. `worker-configuration.d.ts` (generated) declares
 * the rest; both merge into the global `Env`.
 */
export {};

declare global {
  interface Env {
    /** HMAC secret for seat tokens; the same value the match container receives as COT_MATCH_SEAT_SECRET. */
    MATCH_SEAT_SECRET: string;
    /** Bearer secret of the match service's control routes (defaults to the seat secret). */
    MATCH_CONTROL_SECRET?: string;
    /** Local runs only (`wrangler dev --var MATCH_BATTLE_LIMIT_S:20`): the container's COT_MATCH_BATTLE_LIMIT_S. Never set in production. */
    MATCH_BATTLE_LIMIT_S?: string;
  }
}
