# cot-telemetry — the entry-telemetry sink

The Cloudflare Worker behind `VITE_TELEMETRY_URL`. It takes the anonymous
boot / error beacons of `src/entry/telemetry.ts` (`docs/ENTRY-RESILIENCE.md`)
and writes each accepted record as one **Workers Analytics Engine** data
point. No database, no quota to exhaust, nothing to provision: the dataset
`cot_telemetry` is created on the first write and kept for three months.
`tools/telemetry-report.mjs` reads it back through the Analytics Engine SQL
API. This replaced the Vercel function's Upstash/Redis list (deploys 89–90),
which ran out of monthly requests within a day.

## Routes

| Route | Record kinds | When |
|---|---|---|
| `POST /v1/session` | `session`, `entry` | once per page load (at boot-ready, or on the first error / halt / pagehide), plus one small `entry` follow-up when a battle entry resolves after the session record left |
| `POST /v1/error` | `error` | uncaught errors and unhandled rejections (coalesced over a second, deduplicated by message, three per session) and the inline watchdog's terminal verdicts |
| `GET /healthz` | — | `{ "ok": true, "service": "cot-telemetry", "sink": "analytics-engine" }` |

Bodies are JSON sent as `text/plain` and capped at **2 KB**, so
`navigator.sendBeacon` stays a simple cross-origin request (no preflight;
`OPTIONS` is still answered). The wire schema, every refusal and the column
layout live in one module shared with the client receipt, the Vercel
fallback and the report: `server/telemetryRecord.ts`.

In front of the write: the `Origin` allowlist (`ALLOWED_ORIGINS` var; any
`http://localhost[:port]` / `http://127.0.0.1[:port]` origin is also
accepted so `wrangler dev` works with a local Vite page), a per-address rate
limit (`TELEMETRY_LIMITER`, 20 requests a minute — three per session is the
client's own ceiling), the body cap, JSON parsing, and the schema: a body
naming a personal field (`ip`, `userAgent`, `name`, `playerName`, `email`,
`room`, `roomCode`, `host`, `hostName`, `cookie`, `token`, …) anywhere is
refused with `400 pii_field:<name>`. The address only ever reaches the
rate-limit binding; no address, agent or name is stored or logged. A record
posted to the wrong route is `400 invalid_record:route`.

## Storage: Analytics Engine, one data point per record

| Column | Content |
|---|---|
| `index1` | the build stamp (sampling key: a runaway build is sampled before the others) |
| `blob1…blob19` | `kind`, `build`, `outcome`, `stage`, `code`, `mode`, `rendererFamily`, `tier`, `autoTier`, `memoryClass`, `capClass` (`gl2/hw/cbf/st/wk` flags), `capVerdict` (`ok`, `notice:<code>`, `halted:<code>`), `timings` (`stage=ms;…`, every entry of the map), `message`, `frames`, `notes`, `sid`, `entry` (`mode:outcome:code`), `schema` |
| `double1…double20` | `ms`, `weight` (clean-session sample weight), `ready`, `maxTextureUnits`, `maxTextureSize`, `vertexTextureUnits`, `requiredTextureUnits`, the twelve named stage slots (`imports` … `ready`), `gaps` |

The order is `TELEMETRY_BLOBS` / `TELEMETRY_DOUBLES` in
`server/telemetryRecord.ts`; the report names columns from the same arrays.
Against the documented limits (twenty blobs, twenty doubles, one index per
point; blobs ≤ 16 KB per point; index ≤ 96 bytes; 250 points per
invocation) a record uses 19 blobs under 2 KB, 20 doubles, one 64-byte
index and one point per request. Every field the client sends fits, so D1
was not needed: the timings map travels whole in its blob even when a boot
has more stages than the twelve doubled slots, and an error burst's second
and third messages stay in the Worker's own request (the Vercel fallback
logs them in full). If a future field needs more than a blob, the fallback
plan is a D1 table with a 30-day cleanup cron — not this Worker today.

## Deploy

1. `cd cloudflare/telemetry && npm ci` (the committed lockfile; never
   `npm install` at the repository root for this).
2. `npm test` (Workers-runtime vitest: validation, origin, rate limit, body
   cap, personal-field refusal, routing, the writer stubbed and the real
   bindings) and `npm run typecheck`.
3. `npx wrangler login` once on the machine, then `npx wrangler deploy`
   (from the repository root: `npm run deploy:telemetry:cloudflare`). The
   deploy creates the Worker `cot-telemetry`, its rate-limit namespace
   (`2609055512`; the signaling Worker owns `2609055511`) and the Analytics
   Engine binding `COT_TELEMETRY` → dataset `cot_telemetry`. The dataset
   itself appears on the first accepted record. After a change to
   `wrangler.jsonc`, run `npm run types` and commit the regenerated
   `worker-configuration.d.ts` (it carries Cloudflare's Apache-2.0 notice;
   `docs/ATTRIBUTION.md` lists it).
4. Verify: `curl -s https://cot-telemetry.<subdomain>.workers.dev/healthz`
   answers `{"ok":true,…}`, and
   `curl -si -X POST -H 'Origin: https://cot.kevinliu.studio' -H 'content-type: text/plain' --data '{"v":2,"sid":"probe0000000000","build":"probe","kind":"session","outcome":"ready"}' https://cot-telemetry.<subdomain>.workers.dev/v1/session`
   answers `204` (a wrong origin `403`, a v1 body `400 invalid_record:v`).
5. Point the site at it: Vercel → `claude-of-tanks` → Settings →
   Environment Variables → `VITE_TELEMETRY_URL` =
   `https://cot-telemetry.<subdomain>.workers.dev` (the Worker origin, no
   path; the account's subdomain is the one the signaling Worker already uses,
   `kk23907751`), production environment. Optional
   `VITE_TELEMETRY_SAMPLE` = a share in `(0, 1]` of clean sessions to keep
   (default `1`; failures always send). Then the next prebuilt production
   deploy (`docs/DEPLOYS.md`) bakes both into the bundle and the document
   meta (`cot-telemetry` `data-url`), so the module client and the inline
   watchdog post to the Worker. Unset, both post to the Vercel fallback
   `/api/telemetry`, which only logs.
6. A read token for the report: Cloudflare dashboard → My Profile → API
   Tokens → Create Custom Token → Permissions *Account · Account Analytics ·
   Read*. Run
   `CLOUDFLARE_ACCOUNT_ID=68c9576ef72404494de8d86348404fad CLOUDFLARE_API_TOKEN=… node tools/telemetry-report.mjs --since=24h`
   (names only here; the values live in the shell, never in the repo).
   `--sql` prints the query; a saved result (`curl … --data "$(node tools/telemetry-report.mjs --sql)" > result.json`)
   reads back with `--from-json=result.json`.

`npm run dev` serves the Worker on `http://localhost:8787`; a local page
built with `VITE_TELEMETRY_URL=http://localhost:8787` posts there. Analytics
Engine writes are no-ops in the local runtime (there is no local store), so
prove the wire with the Worker's `204`s and the test suite, and the storage
with the SQL API after a real deploy.

## Cost

Analytics Engine pricing (developers.cloudflare.com/analytics/analytics-engine/pricing,
2026-04): on **Workers Paid** — the plan the signaling Worker already runs
on — 10 million data points written and 1 million SQL read queries a month
are included (then $0.25 and $1.00 per extra million); Cloudflare states it
is not yet billing for Analytics Engine at all. The Worker's own requests
count against the plan's included Workers requests. The traffic is small by
construction: the client sends at most three requests per session and the
Worker writes one data point per request, so even 100 000 sessions a month
are under 300 000 requests and data points, and a daily report is thirty
read queries. Nothing here has a monthly command quota to run out, which is
what took the Redis sink down.
