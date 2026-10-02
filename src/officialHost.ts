/**
 * The deployed site and the Cloudflare Workers it talks to (docs/DEPLOYS.md rows). Build-time `VITE_*` variables
 * override these; they exist because Vercel stores the project's variables as *sensitive*, and a sensitive value
 * reaches the once-per-round CLI build (`vercel pull` + `vercel build`) as the literal `[SENSITIVE]` — deploy 114
 * (2026-09-28) shipped `resolveRoomsUrl({ configured: '[SENSITIVE]' })`. A page served from the official host
 * therefore knows its Workers by name; every other deployment keeps its configured value or its local defaults.
 *
 * The values live in the deployment policy module (`api/_lib/policy.ts`, INFRA-P19), which the API functions read too;
 * this module is the browser's name for them.
 */
export { OFFICIAL_ROOMS_URL, OFFICIAL_SITE_HOST, OFFICIAL_TELEMETRY_URL, isOfficialSiteHost } from '../api/_lib/policy.ts';
