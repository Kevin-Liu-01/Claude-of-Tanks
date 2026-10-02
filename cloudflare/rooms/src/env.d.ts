/**
 * Bindings Wrangler cannot generate: the secret (`wrangler secret put`).
 * `worker-configuration.d.ts` (generated) declares the rest; both merge into the
 * global `Env`.
 *
 * The relay secrets (2026-10-02, docs/MULTIPLAYER-V2.md §13.14) are optional and read by name only
 * (`pickRelayEnv` in server/relayCredentials.ts), so they are deliberately not declared here — `wrangler types`
 * types a secret a local `.dev.vars` holds as a required string, and an optional declaration of the same name would
 * not merge with it: `COT_CLOUDFLARE_TURN_KEY_ID`, `COT_CLOUDFLARE_TURN_API_TOKEN` (production, Cloudflare Realtime
 * TURN), `COT_TURN_SHARED_SECRET` with the var `COT_TURN_URLS` (self-hosted coturn), `COT_TURN_ICE_SERVERS_JSON`
 * (fixed servers); the vars `COT_TURN_TTL_SECONDS` and `COT_TURN_USERNAME` are optional, `COT_STUN_URLS` is in
 * wrangler.jsonc.
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
