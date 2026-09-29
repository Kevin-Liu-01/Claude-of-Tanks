/**
 * The deployed site and the Cloudflare Workers it talks to (docs/DEPLOYS.md rows). Build-time `VITE_*` variables
 * override these; they exist because Vercel stores the project's variables as *sensitive*, and a sensitive value
 * reaches the once-per-round CLI build (`vercel pull` + `vercel build`) as the literal `[SENSITIVE]` — deploy 114
 * (2026-09-28) shipped `resolveRoomsUrl({ configured: '[SENSITIVE]' })`. A page served from the official host
 * therefore knows its Workers by name; every other deployment keeps its configured value or its local defaults.
 */
export const OFFICIAL_SITE_HOST = 'cot.kevinliu.studio';
/** The rooms Worker (Multiplayer v2, `cloudflare/rooms`, Free plan). */
export const OFFICIAL_ROOMS_URL = 'wss://cot-rooms.kk23907751.workers.dev';
/** The telemetry sink (`cloudflare/telemetry`); the Vercel route `/api/telemetry` stays the fallback elsewhere. */
export const OFFICIAL_TELEMETRY_URL = 'https://cot-telemetry.kk23907751.workers.dev';

/** True for the deployed site's own host (case-insensitive, no port). */
export function isOfficialSiteHost(hostname: unknown): boolean {
  return String(hostname ?? '').trim().toLowerCase() === OFFICIAL_SITE_HOST;
}
