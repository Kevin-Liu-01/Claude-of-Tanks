# Entry resilience and telemetry (Multiplayer v2, phase 0)

Phase 0 of the multiplayer redesign fixes first-time entry on the shipped v1
product and makes it observable. Every change here is on the critical path
of a first visit, so each one is small, receipt-pinned, and proven in
production Chrome against the built artifact (`vite preview` + puppeteer,
CDP network throttling). The audit that ranked the causes is §6.1 of the
multiplayer v2 charter; this page is what landed, how it reports, and how to
read it.

## What each fix does

| Cause (audit rank) | Fix | Where |
|---|---|---|
| 9. No production error signal | An anonymous beacon: one `session` record per page load (the whole boot as a timings map, the capability summary, the outcome, a folded battle entry), `error` records only as errors happen, one small `entry` follow-up — three requests per session at most, one for a clean boot. `navigator.sendBeacon` (fetch keepalive fallback) to a Cloudflare Worker that writes one Workers Analytics Engine data point per record; a Vercel fallback that only logs; a report tool over the SQL API. | `cloudflare/telemetry/`, `server/telemetryRecord.ts`, `src/entry/telemetry.ts`, `api/telemetry.ts`, `tools/telemetry-report.mjs` |
| 1. No WebGL2 gate | A throwaway WebGL2 context before `createRenderer` reads texture units, texture size, vertex texture units, `EXT_color_buffer_float`, the renderer family, storage and worker availability. Each hard failure is one sentence and one action on the inline boot screen; the boot halts on purpose instead of spending the recovery reloads. Software rasterisers, blocked storage and blocked workers proceed with a one-line notice. | `src/engine/capabilityGate.ts`, `index.html` (`halt()`, `#cot-boot-notice`) |
| 7. Texture-unit ceiling unverified | Measured, not assumed: the terrain fragment program binds **16** samplers on desktop (10 declared + `envMap` + `dfgLUT` + 4 CSM cascade shadow maps; 15 on the 3-cascade mobile tier), exactly the WebGL2 minimum. A driver reporting fewer stops with "exposes only N texture units; the battlefield needs 16". | `capabilityGate.ts` `TERRAIN_TEXTURE_UNITS_REQUIRED` |
| 2. Watchdogs fire on healthy work | The 30 s / 60 s document watchdogs are re-armed by every Resource Timing arrival and every module stage, so they fire only after a full window with nothing arriving; a silent minute is confirmed by a same-origin probe before the document is replaced (a dead connection waits for `online` instead). The terminal message names the failed file (from Resource Timing `responseStatus`), the refused driver, or the slow connection. While the module has not claimed the stage line, the splash counts the entry graph's files as they land. | `index.html` chunk recovery r4 |
| 3. Asset caching | Deploy 89 served `/assets/(.*)` as `public, max-age=31536000, immutable`; a vercel.json header rule applies to 404s too and the edge cached them for a year, so one transient miss during a promotion poisoned that edge for every player ("A game file failed to download", 2026-09-25). The rule is gone (deploy 93). Since deploy 94 `node tools/vercel-output-immutable.mjs` runs between `vercel build` and `vercel deploy --prebuilt`: it lists the hashed files that exist in `.vercel/output/static/assets` and writes immutable header routes for exactly those (groups of 40, case-sensitive, ahead of the filesystem handle), so a warm cache never revalidates the entry graph while a missing path matches no rule and heals on the next request (`tools/vercel-output-immutable.selftest.mjs`). Documents stay `must-revalidate`; `/maps` and `/minimaps` keep the default. | `vercel.json`, `docs/DEVELOPMENT.md` "Asset caching" |
| 4. The reveal budget throws | `primeReveal` extends once past its budget, then waits for the frame that arrives, reporting `slow_reveal` (`extended`, `stalled`); the visible paint wait extends once and then continues (`extended`, `continued`). The black-frame verdict still fails a truly black scene. | `src/game/battleEntryLifecycle.ts`, `src/engine/frameScheduler.ts` |
| 6. Solo entry fails silently | The recovered Garage shows "The battle could not start — `<reason>`. You are back in the Garage — try again; if it repeats, reload the page." and the failure is beaconed. | `src/game/soloBattleEntryRuntime.ts`, `src/ui/garageReturnFailure.ts` |
| 8. WebRTC blocked degrades silently | A host-fallback room shows "Direct connections only — a friend behind a strict network may not connect", beacons `ice_degraded` with the reason code, and its 60 s WebRTC timeout says the relay was missing instead of blaming the host. | `src/ui/playMenu.ts`, `src/ui/privateRoomFailurePresentation.ts` |

Causes 5 (the all-or-nothing ready barrier) and 10 (invite overhead) are
removed by v2's entry runtime, not patched here.

## The beacon (schema v2, 2026-09-25)

The owner's ruling: telemetry stays on by default with the opt-out, but it
had to become far cheaper and leave Upstash behind. Schema v1 sent twenty
`boot_stage` events, a capability event and `boot_ready` over three
`sendBeacon` flushes per clean boot into a Redis list that exhausted its
monthly quota in a day. Schema v2 sends **one record per page load** and
stores it in Workers Analytics Engine.

Sink: the Cloudflare Worker `cloudflare/telemetry` (`README.md` there has
the deploy steps), reached through `VITE_TELEMETRY_URL` = its origin, baked
into the bundle and into the `cot-telemetry` meta's `data-url` for the
inline watchdog. Unset, both post to the Vercel fallback `POST
/api/telemetry` (same origin; the ICE endpoint's origin allowlist,
`COT_ALLOWED_ORIGINS` extends it), which validates and logs one JSON line
per record and stores nothing. Bodies are JSON as `text/plain` — a simple
cross-origin request, no preflight — capped at 2 KB by both sinks (the
client trims to 1.5 KB). Three routes on the Worker:

| Route | Record | Sent |
|---|---|---|
| `POST /v1/session` | `session` | once per page load: at boot-ready, or on the first error, a capability halt, or `pagehide` when boot never got there |
| `POST /v1/session` | `entry` | one small follow-up when a battle entry resolves after the session record left |
| `POST /v1/error` | `error` | uncaught errors and unhandled rejections (coalesced for a second, deduplicated by message, three per session), and the inline watchdog's terminal verdicts |

Every record carries `v: 2`, `sid` (a random per-load id, minted by the
inline watchdog and reused by the module — `window.__COT_TELEMETRY_SID`),
`build` (the application-version stamp) and `kind`. The rest by kind:

| Field | Values |
|---|---|
| `outcome` | session: `ready`, `halted`, `error`, `left`; entry: `ok`, `failed`, `cancelled`, `timeout`; error (the watchdog): `halted`, `failed`, `notice` |
| `stage` | the last boot stage begun (`renderer`, `sky`, …, `ready`), `download` (inline watchdog); ≤ 32 chars |
| `ms` | session: boot-to-ready, or elapsed when it never got there; entry: the reveal wait; error: elapsed since load |
| `mode` | `solo`, `private`, `lan`, `studio`, `network`, `unknown` |
| `t` | session only: the timings map, stage → integer ms, ≤ 24 entries — the twelve named stages first (`imports`, `renderer`, `sky`, `lighting`, `garage`, `vehicle`, `hud`, `ui`, `audio`, `post`, `studio`, `ready`), then the lifecycle's `gap>stage` entries |
| `cap`, `capOutcome`, `capCode` | session only: the capability summary (`webgl2`, `rendererFamily` — nvidia/amd/intel/apple/arm/qualcomm/imagination/software/unknown, never the raw string — `software`, `maxTextureUnits`, `maxTextureSize`, `vertexTextureUnits`, `colorBufferFloat`, `storage`, `worker`, `memoryClass`, `tier`, `autoTier`, `requiredTextureUnits`), the gate verdict (`ok`, `notice`, `halted`) and its code (`no_webgl2`, `context_refused`, `texture_units`, `software_rendering`, `storage_blocked`, `worker_blocked`) |
| `entry` | session only: `{ outcome, mode, code, ms }` when a battle entry resolved before the session record left |
| `error`, `errors` | `{ message ≤ 200, frames ≤ 3 × ≤ 160, stage, code }`, origin-stripped; a session record folds the first error of the boot, an error record carries the first of a burst plus up to two more in `errors` |
| `code` | ≤ 48 chars of `[A-Za-z0-9_.:-]`: entry codes (`entry_failed`, `entry_failed_<role>`, `slow_<phase>`), error codes (`uncaught`, `unhandled_rejection`, `context_refused`), watchdog classes (`chunk`, `driver`, `script`, `slow`, `offline`, `stalled`, `reload:<class>`; the raw reason rides as `error.code`) |
| `ready` | error only: whether boot had reached ready |
| `notes` | ≤ 6 codes folded from what used to be their own events — `slow_reveal:<phase>`, `room_failure:<code>`, `ice_degraded:<reason>`, `hud_mask:<spec id>:<code>` (the damage panel gave up on a tank's top-down masks, 2026-09-25) — riding on the next record, never costing a request |
| `w` | the clean-session sample weight (`VITE_TELEMETRY_SAMPLE` = 0.25 → `w: 4`); absent when every session sends |

Unknown fields are dropped; enumerations must match; a body naming a
personal field (`ip`, `userAgent`, `name`, `playerName`, `email`, `room`,
`roomCode`, `host`, `hostName`, `cookie`, `token`, …) anywhere is refused
with `400 pii_field:<name>`. All of this is one module,
`server/telemetryRecord.ts`, imported by the Worker, the fallback, the report
and the client receipt, so the halves cannot drift.

**Request budget** (`src/entry/telemetry.ts`): a clean boot is exactly one
request (the session record, ~1 KB); a boot plus a battle is two; a failing
session is at most three — the client stops at three whatever happens
later, and drops the fourth distinct error. Errors wait a second so a burst
(an uncaught error and the rejection it causes) shares one request; the
session record leaves at once on boot-ready or a capability halt, and on
`pagehide` with outcome `left` when boot never got there (a hidden tab only
sends what was already scheduled — the boot may still finish). The client
imports nothing at all and is loaded before the renderer. Sampling: with
`VITE_TELEMETRY_SAMPLE` below 1, a clean session (ready, no error, no failed
entry) is kept with that probability and its record carries the weight;
failures always send.

The Worker stores one Analytics Engine data point per record (the column
layout is in `cloudflare/telemetry/README.md`), rate-limits twenty requests a
minute per address through the `ratelimits` binding — the address reaches
nothing else — and refuses any other origin than the site's (plus localhost
for `wrangler dev`). The fallback keeps a salted in-memory token bucket.

## Opting out

Any of these switches the beacon off for the page (module and inline
watchdog alike): `?telemetry=off` in the URL; the **Diagnostics → Anonymous
load & crash reports** toggle in Settings → Graphics (stored as
`localStorage['cot.telemetry'] = 'off'`); Do Not Track or Global Privacy
Control; automation (`navigator.webdriver`); and a self-hosted build
(`VITE_SELF_HOSTED=1`, the same switch as analytics, which also sets the
`cot-telemetry` meta to `off`). `?telemetry=on` re-enables it for a probe or
headless run; nothing re-enables it on a self-hosted build.

## Reading the report

```
CLOUDFLARE_ACCOUNT_ID=… CLOUDFLARE_API_TOKEN=… node tools/telemetry-report.mjs   # the Analytics Engine SQL API, last 7 days
node tools/telemetry-report.mjs --since=24h            # the window: 90m, 24h, 7d
node tools/telemetry-report.mjs --from-json=result.json  # a saved SQL API result (FORMAT JSON or JSONEachRow)
node tools/telemetry-report.mjs --logs=logs.jsonl      # `vercel logs --json` output / the fallback's log lines (the transition)
node tools/telemetry-report.mjs --sql                  # print the query and exit
node tools/telemetry-report.mjs --json                 # the summary as JSON
```

The token needs *Account Analytics: Read* only; the two names are read from
the environment and never printed. The funnel line counts sessions, sessions
that reached ready (and the rate), sessions that entered a battle (and the
rate), sessions with an error, capability halts and sessions that left
mid-boot — each weighted by the record's sample weight and Analytics
Engine's `_sample_interval`, so the numbers stay estimates of the whole
population when either sampling is on. A session with only an `error`
record (the entry graph never evaluated, so the watchdog's verdict is all
there is) counts as one session that did not reach ready. Boot-to-ready
p50/p90 overall and per build, per-stage p50/p90 (gaps folded into one row),
entry results by outcome and mode, and sessions that never reached ready by
the last stage they began follow — `download` means the inline watchdog
spoke (`chunk` / `driver` / `slow` / `offline` / `stalled`), `(before
renderer)` that nothing did. Then CAPABILITY: renderer family / tier / auto
tier, memory class, the flag string (webgl2 / rasteriser / float buffers /
storage / workers), notices and stops, and the notes (slow reveals, HUD mask failures, room
failures, degraded ICE); BUILDS; and the failure table (kind / stage / code
/ build → count, one sample message). Session ids are aggregated, never
listed.

To try the whole path locally: run a build, serve it (`vite preview`), open
`/?telemetry=on` (automation is otherwise opted out) and watch the network
panel — a clean boot is one `POST` (to `/api/telemetry`, or to
`<VITE_TELEMETRY_URL>/v1/session` when the build was made with it) of about
1 KB, and nothing more until a battle entry (one small `entry` POST) or an
error.

## What the boot screen can say now

- "This browser has no WebGL2 — enable hardware acceleration or open in Chrome, Edge, Firefox or Safari 17+" (Retry)
- "The graphics driver refused to start — close other 3D tabs or reload" (Retry)
- "This graphics driver exposes only N texture units; the battlefield needs 16 — try another browser or device"
- notices: "Software rendering detected — running the low graphics preset", "Storage is blocked in this browser — settings and progress will not be saved", "Background workers are blocked — loading may be slower"
- "A game file failed to download (chunk-name.js)" — with "you appear to be offline; it retries when the connection returns" when offline
- "Loading is taking longer than expected on this connection — keep waiting or reload"
- "Nothing has downloaded for a while — check your connection and reload"
- "Loading stalled — nothing arrived for a minute; reload"

The gate sentences are localized (en-US, zh-CN); the inline watchdog's are
English, like the r3 copy they replace, because they run before the catalog.

## Receipts

`server/telemetryRecord.selftest.mjs` (the v2 schema and the Analytics Engine
layout), `server/telemetry.selftest.mjs` (the fallback), `src/entry/telemetry.selftest.mjs`
(the client, every body through the shared validator), `src/ui/damagePanelMaskRetry.selftest.mjs`
(the HUD mask note through the v2 client and the shared validator), `tools/telemetry-report.selftest.mjs`,
`cloudflare/telemetry/test/telemetry.test.ts` (the Worker, Workers runtime —
`npm run test:telemetry:cloudflare`), `src/engine/capabilityGate.selftest.mjs`,
`src/ui/chunkRecovery.selftest.mjs` (r3 cases plus the clocked network
harness), `src/gallery/chunkRecovery.selftest.mjs` (no cacheable-404 header rule),
`src/game/battleEntryLifecycle.selftest.mjs`, `src/engine/frameScheduler.selftest.mjs`,
`src/game/soloBattleEntryRuntime.selftest.mjs`, `src/ui/garageReturnFailure.selftest.mjs`,
`src/ui/privateRoomFailurePresentation.selftest.mjs`, `src/ui/playMenu.selftest.mjs`,
`src/engine/bootLifecycle.selftest.mjs`; all registered in `tools/selftest-suites.mjs`.
