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
| 9. No production error signal | An anonymous same-origin beacon: boot stages with timings, boot-ready, the first uncaught errors of a session, capability probe, entry outcomes, slow reveals, room failure codes, ICE degradation. Batched `navigator.sendBeacon` (fetch keepalive fallback), one structured log line per event on the function, a bounded Redis list when KV/Upstash is configured, a report tool. | `api/telemetry.ts`, `src/entry/telemetry.ts`, `tools/telemetry-report.mjs` |
| 1. No WebGL2 gate | A throwaway WebGL2 context before `createRenderer` reads texture units, texture size, vertex texture units, `EXT_color_buffer_float`, the renderer family, storage and worker availability. Each hard failure is one sentence and one action on the inline boot screen; the boot halts on purpose instead of spending the recovery reloads. Software rasterisers, blocked storage and blocked workers proceed with a one-line notice. | `src/engine/capabilityGate.ts`, `index.html` (`halt()`, `#cot-boot-notice`) |
| 7. Texture-unit ceiling unverified | Measured, not assumed: the terrain fragment program binds **16** samplers on desktop (10 declared + `envMap` + `dfgLUT` + 4 CSM cascade shadow maps; 15 on the 3-cascade mobile tier), exactly the WebGL2 minimum. A driver reporting fewer stops with "exposes only N texture units; the battlefield needs 16". | `capabilityGate.ts` `TERRAIN_TEXTURE_UNITS_REQUIRED` |
| 2. Watchdogs fire on healthy work | The 30 s / 60 s document watchdogs are re-armed by every Resource Timing arrival and every module stage, so they fire only after a full window with nothing arriving; a silent minute is confirmed by a same-origin probe before the document is replaced (a dead connection waits for `online` instead). The terminal message names the failed file (from Resource Timing `responseStatus`), the refused driver, or the slow connection. While the module has not claimed the stage line, the splash counts the entry graph's files as they land. | `index.html` chunk recovery r4 |
| 3. Assets not immutable | `/assets/(.*)` is served `public, max-age=31536000, immutable` (every file there is content-hashed). Documents stay `must-revalidate`; `/maps` and `/minimaps` keep the default. | `vercel.json`, `docs/DEVELOPMENT.md` "Asset caching" |
| 4. The reveal budget throws | `primeReveal` extends once past its budget, then waits for the frame that arrives, reporting `slow_reveal` (`extended`, `stalled`); the visible paint wait extends once and then continues (`extended`, `continued`). The black-frame verdict still fails a truly black scene. | `src/game/battleEntryLifecycle.ts`, `src/engine/frameScheduler.ts` |
| 6. Solo entry fails silently | The recovered Garage shows "The battle could not start — `<reason>`. You are back in the Garage — try again; if it repeats, reload the page." and the failure is beaconed. | `src/game/soloBattleEntryRuntime.ts`, `src/ui/garageReturnFailure.ts` |
| 8. WebRTC blocked degrades silently | A host-fallback room shows "Direct connections only — a friend behind a strict network may not connect", beacons `ice_degraded` with the reason code, and its 60 s WebRTC timeout says the relay was missing instead of blaming the host. | `src/ui/playMenu.ts`, `src/ui/privateRoomFailurePresentation.ts` |

Causes 5 (the all-or-nothing ready barrier) and 10 (invite overhead) are
removed by v2's entry runtime, not patched here.

## The beacon

Endpoint: `POST /api/telemetry` (same origin; the ICE endpoint's origin
allowlist, `COT_ALLOWED_ORIGINS` extends it). Body: JSON up to 4 KB, one of

```
{ "v": 1, "sid": "<session id>", "build": "<application-version>", "events": [ <event>, … ] }   (≤ 25 events)
{ "v": 1, "sid": "<session id>", "build": "<application-version>", "kind": …, … }              (one event)
```

An event carries `kind` plus optional bounded fields; everything else is
dropped, and a body naming a personal field (`ip`, `userAgent`, `name`,
`playerName`, `email`, `room`, `roomCode`, `host`, `hostName`, `cookie`,
`token`, …) is refused with `400 pii_field:<name>`.

| Field | Values |
|---|---|
| `kind` | `boot_stage`, `boot_ready`, `boot_error`, `entry_result`, `capability`, `slow_reveal`, `room_failure`, `ice_degraded` |
| `stage` | boot stage name (`renderer`, `sky`, …, `ready`), `download` (inline watchdog), `primeReveal`, `paint`; ≤ 32 chars |
| `phase` | `begin`, `end` (boot stages) |
| `ms` | integer milliseconds (stage duration, boot-to-ready, wait) |
| `outcome` | `ok`, `failed`, `cancelled`, `timeout`, `halted`, `notice` |
| `code`, `reason` | ≤ 48 chars of `[A-Za-z0-9_.:-]` — gate codes (`no_webgl2`, `context_refused`, `texture_units`, `software_rendering`, `storage_blocked`, `worker_blocked`), watchdog classes (`chunk`, `driver`, `script`, `slow`, `offline`, `stalled`, `reload:<class>`), room failure codes, ICE reasons, slow-reveal phases |
| `mode` | `solo`, `private`, `lan`, `studio`, `network`, `unknown` |
| `error` | `{ message ≤ 200, frames: ≤ 3 × ≤ 160 }`, origin-stripped |
| `capability` | `webgl2`, `rendererFamily` (nvidia/amd/intel/apple/arm/qualcomm/imagination/software/unknown — never the raw string), `software`, `maxTextureUnits`, `maxTextureSize`, `vertexTextureUnits`, `colorBufferFloat`, `storage`, `worker`, `memoryClass` (low ≤ 2 GB, mid ≤ 4, high), `tier`, `autoTier`, `requiredTextureUnits` |
| `timings` | ≤ 16 numeric keys (boot stage durations, `budgetMs`) |

The server stamps `at` and answers `204`. Every accepted event is one
`console.log` line, `{"tag":"cot-telemetry", …}`, in the function's logs.
When any of `COT_TELEMETRY_REDIS_REST_URL/_TOKEN`,
`COT_SIGNAL_REDIS_KV_REST_API_URL/_TOKEN`, `UPSTASH_REDIS_REST_URL/_TOKEN` or
`KV_REST_API_URL/_TOKEN` is set, each event is also `LPUSH`ed to
`cot:telemetry:v1:events`, trimmed to 5000 rows, with a 30-day expiry (the
signaling function no longer uses that Redis, so the quota is free). A store
failure never fails the beacon. Per-client rate limit: a token bucket of 30
flushes refilling one every four seconds, keyed by a salted hash that lives
only in process memory — no address is stored or logged.

Client rules (`src/entry/telemetry.ts`): one random session id per page load,
minted by the inline watchdog and reused by the module (`window.__COT_TELEMETRY_SID`);
events batch into one flush every 400 ms, immediately for errors and
outcomes, and on `pagehide` / hidden; at most 80 events and 5 error reports
per session; bodies split to stay under 3.8 KB. The client imports nothing
from the game.

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
node tools/telemetry-report.mjs                 # the Redis list, using the KV/Upstash env above
node tools/telemetry-report.mjs --since=24h     # only the last day (90m, 7d)
node tools/telemetry-report.mjs --file=x.jsonl  # a saved Vercel log export or JSON-lines dump
node tools/telemetry-report.mjs --json          # the summary as JSON
```

The funnel line counts sessions, sessions that reached `boot_ready` (and the
rate), sessions with a `boot_error`, and sessions that reached an
`entry_result`; boot-to-ready p50/p90 and per-stage p50/p90 follow. Sessions
that never reached ready are grouped by the last stage they began —
`(before renderer)` means the entry graph never evaluated: look at the
inline watchdog's `boot_error` rows (`stage: download`, code `chunk` /
`driver` / `slow` / `offline` / `stalled`). Then capability stops, slow
reveals, room failures and ICE degradation by code, sessions/ready/errored
per build, and the failure table (kind / stage / code / build → count, one
sample message). Session ids are aggregated, never listed.

To try the whole path locally without Redis: run a build, serve it, open
`/?telemetry=on` (automation is otherwise opted out) and watch the
`/api/telemetry` POSTs in the network panel — a clean boot sends about three
flushes: twenty `boot_stage` rows, one `capability`, one `boot_ready`.

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

`server/telemetry.selftest.mjs`, `src/entry/telemetry.selftest.mjs`,
`tools/telemetry-report.selftest.mjs`, `src/engine/capabilityGate.selftest.mjs`,
`src/ui/chunkRecovery.selftest.mjs` (r3 cases plus the clocked network
harness), `src/gallery/chunkRecovery.selftest.mjs` (the immutable rule),
`src/game/battleEntryLifecycle.selftest.mjs`, `src/engine/frameScheduler.selftest.mjs`,
`src/game/soloBattleEntryRuntime.selftest.mjs`, `src/ui/garageReturnFailure.selftest.mjs`,
`src/ui/privateRoomFailurePresentation.selftest.mjs`, `src/ui/playMenu.selftest.mjs`,
`src/engine/bootLifecycle.selftest.mjs`; all registered in `tools/selftest-suites.mjs`.
