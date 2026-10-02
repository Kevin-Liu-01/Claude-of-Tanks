/**
 * The deployment policy (INFRA-P19, 2026-10-01): the canonical site, the production aliases that redirect to it, the
 * origins the hosted API admits and the Cloudflare Workers the site talks to — one module where eight hand-kept copies
 * with three different contents used to live.
 *
 * - `api/*` import it. Vercel builds no function from a `_`-prefixed path, so `api/_lib/` is shared code, never a route.
 * - The browser reads it through `src/officialHost.ts`, and the site metadata through `src/presentation/siteMetadata.ts`;
 *   it therefore imports nothing and stays DOM-free (the rooms Worker's program reaches it through the session endpoint).
 * - Copies that cannot import it are pinned to it by `tools/deployment-policy.selftest.mjs`: the Workers'
 *   `ALLOWED_ORIGINS` (`cloudflare/rooms/wrangler*.jsonc`, `cloudflare/telemetry/wrangler.jsonc`) and the dependency-free
 *   entry telemetry module (`src/entry/telemetry.ts`); the inline boot watchdog's two literals in `index.html` by
 *   `src/entry/inlineWatchdogSink.selftest.mjs`; vercel.json's alias-host redirects by `tools/vercel-routes.selftest.mjs`.
 *
 * A Worker's `ALLOWED_ORIGINS` reaches production only with that Worker's next deploy (`wrangler deploy`).
 */

/** The deployed site's host. */
export const OFFICIAL_SITE_HOST = 'cot.kevinliu.studio';
/** The canonical origin: canonical links, Open Graph URLs, the only origin the rooms Worker admits. */
export const CANONICAL_ORIGIN = `https://${OFFICIAL_SITE_HOST}`;
/** Production domains that serve the same deployment under another name; vercel.json answers them 308 to the canonical
 * origin (INFRA-P5). */
export const ALIAS_HOSTS: readonly string[] = Object.freeze([
  'claudeoftanks.kevinliu.studio',
  'claude-of-tanks.vercel.app',
]);
/** The production branch domain; Vercel Deployment Protection (SSO) keeps it to the team. */
export const PROTECTED_PRODUCTION_HOST = 'claude-of-tanks-kl01s-projects.vercel.app';
/** Origins the API functions and the telemetry Worker admit: the canonical site, its aliases and the protected domain. */
export const ALLOWED_ORIGINS: readonly string[] = Object.freeze([
  CANONICAL_ORIGIN,
  ...ALIAS_HOSTS.map((host) => `https://${host}`),
  `https://${PROTECTED_PRODUCTION_HOST}`,
]);
/** The rooms Worker admits the canonical origin alone: multiplayer runs on the official site (src/mp/session/endpoint.ts). */
export const ROOMS_ALLOWED_ORIGINS: readonly string[] = Object.freeze([CANONICAL_ORIGIN]);
/** The telemetry Worker admits the API's origins (its code adds any localhost page for `wrangler dev`). */
export const TELEMETRY_ALLOWED_ORIGINS: readonly string[] = ALLOWED_ORIGINS;
/** The rooms Worker (Multiplayer v2, `cloudflare/rooms`, Free plan). */
export const OFFICIAL_ROOMS_URL = 'wss://cot-rooms.kk23907751.workers.dev';
/** The telemetry sink (`cloudflare/telemetry`); the Vercel route `/api/telemetry` stays the fallback elsewhere. */
export const OFFICIAL_TELEMETRY_URL = 'https://cot-telemetry.kk23907751.workers.dev';

/** True for the deployed site's own host (case-insensitive, no port). */
export function isOfficialSiteHost(hostname: unknown): boolean {
  return String(hostname ?? '').trim().toLowerCase() === OFFICIAL_SITE_HOST;
}

/** The API allow-list: the deployment's origins plus `COT_ALLOWED_ORIGINS` (comma-separated, for a self-hosted frontend). */
export function allowedApiOrigins(env: Readonly<Record<string, string | undefined>>): Set<string> {
  const extra = String(env.COT_ALLOWED_ORIGINS || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  return new Set([...ALLOWED_ORIGINS, ...extra]);
}
