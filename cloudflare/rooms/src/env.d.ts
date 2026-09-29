/**
 * Bindings Wrangler cannot generate: the secret (`wrangler secret put`).
 * `worker-configuration.d.ts` (generated) declares the rest; both merge into the
 * global `Env`.
 */
export {};

declare global {
  /** The secret, shared by the global `Env` (the Worker's classes) and `Cloudflare.Env` (the `env` export of
   * `cloudflare:workers`, which the tests read — 2026-09-28: the test typecheck had no MATCH_SEAT_SECRET there). */
  interface RoomsSecretBindings {
    /** HMAC secret for seat tokens. A match signs with a per-match secret derived from it (never handed to a client as is). */
    MATCH_SEAT_SECRET: string;
  }
  interface Env extends RoomsSecretBindings {}
  namespace Cloudflare {
    interface Env extends RoomsSecretBindings {}
  }
}
