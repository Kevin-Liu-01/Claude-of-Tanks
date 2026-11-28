# Architecture map

The current shape of the codebase as measured on origin/main b6c100411f (release 278, 2026-11-27), the target shape it
converges on, and where the two differ. [ARCHITECTURE.md](../ARCHITECTURE.md) §1 stays the binding convention set and
[SYSTEMS.md](../SYSTEMS.md) the subsystem guide; this page is the dependency view the governance lane works from.
[BACKLOG.md](BACKLOG.md) holds the work that closes each gap, [PROGRESS.md](PROGRESS.md) the rounds, and [adr/](adr/) the
decisions. Re-measure with `node tools/module-boundaries.mjs --json`.

## Product and constraints

A browser tank game: a fixed 60 Hz deterministic simulation (`src/sim`, seeded, Node-runnable) drawn by three.js; a
procedural first-party fleet (`src/vehicles`, ~1,900 files) and 33 procedural battlefields (`src/world`, ~1,150 files);
a local driver (solo, campaign, Watch, replays) and an online driver (peer-to-peer rooms through the `cot-rooms`
Worker, the browser host running the authority); a public site in seven locales. Production constraints that shape
every change: generated tank and world output is hash-pinned and must stay byte-identical across refactors; the wire
(`PROTOCOL_VERSION`, `ROOM_PROTOCOL_VERSION`), saves and replays are external contracts; the free tiers of Vercel and
Cloudflare; many agents land in parallel through one integrator.

## Layers (target)

Lower layers never import higher ones. `tools/module-boundaries.mjs` enforces the coarse rules below on every runtime
edge (static, lazy, Worker); `tools/driver-boundaries.mjs` enforces the finer core and driver rules of ARCHITECTURE §1.6.

| Layer | Areas | May import | Owner of |
| --- | --- | --- | --- |
| 0 Contracts and leaves | `src/*.ts` root leaves (`workerCalls`, `workerClientHealth`, `authorship`, `runtimeTypes`), `src/mp/wire`, `src/mp/room`, `api/_lib` | nothing above | wire formats, deployment policy, shared primitives |
| 1 Core | `src/sim`, the bots (`src/game/ai.ts`, `botAbilities.ts`, `botConstruction.ts`), world collision and kernels, vehicle specs and inventories | layer 0 | every game rule (`matchRuleset.ts`), the step, armour, ballistics, spotting |
| 2 Content and render foundation | `src/world` builders, `src/vehicles` builders, `src/engine` | 0-1 | maps, tanks, renderer, camera, lighting |
| 3 Presentation services | `src/fx`, `src/audio` | 0-2 | effects and sound, reacting to the bus |
| 4 Drivers | local: `src/game` (`state.ts`, `solo*`, Watch, replays); online: `src/mp`, `server/match`, `server/rooms`, `cloudflare/rooms` | 0-3 (the online driver never the local one, §1.6) | running the core for a battle or a room |
| 5 Page shell | `src/ui`, `src/presentation`, `src/docs`, `src/gallery`, `src/techTree`, `src/pad`, `src/dev` | 0-4 | screens, HUD, site pages |
| 6 Composition | `src/main.ts`, `src/app`, `src/entry` | everything | boot, wiring, lazy owner access |

Services (`server/`, `cloudflare/`, `api/`) run headless: they reach layers 0, 1 and the online driver, never the page.
The phone-pad pairing room is the exception by design: its protocol and actor live in `src/pad` (`padProtocol.ts`,
`padActor.ts`) and the rooms Worker and the LAN helper run them, so the services rule does not list `src/pad`.
Nothing shipped imports `tools/`. The Field Manual's chapters and search index (`src/docs/chapters/`,
`src/docs/searchIndex.ts`) are build-time generators that `tools/docs-prerender.mjs` runs in Node: they may use
`tools/`, and nothing shipped imports them.

## Dependency graph (measured)

3,077 runtime modules (receipts, fixtures, oracles, the Workers' test suites and declarations aside) and 10,132
resolved runtime edges (9,285 static, 829 lazy, 18 Worker; type-only edges aside). Area-level edges form one strongly
connected component of 20 areas: every area can reach every other, so no area can be understood or changed alone. The
component is not caused by deep entanglement. It is caused by 60 edges from lower areas up to a handful of misplaced
leaves (the pin in `tools/module-boundaries.pin.mjs` tags each with its task):

| Upward edges | Count | Cause | Task |
| --- | --- | --- | --- |
| vehicles, world, engine, fx, audio (18) and mp (1) → `src/app/lazyChunk.ts`, `lazyRuntimeOwner.ts` | 19 | the lazy-chunk policy (imports only `lazyImportRetry.ts`) lives in the composition layer | T-lazy-1 |
| fx, audio, engine → `src/game` (`eraActivation`, `shotCadence`, `weaponHitKind`, `killcamScreen`, `playerVisibility`, `gunshipVisual`, `missionAttachmentVisual`, `strikeViewState`, `battleScope`) | 13 | presentation definitions filed under the local driver | T-shared-1, T-shared-2 |
| engine, fx, audio, vehicles, world → `src/ui`, `src/techTree`, `src/dev` (`i18n`, `accessibilityPreferences`, `flagCodes`, `glacisText`, `minimapAsset*`, `modalLayer`, `tiers`, `debugIntent`) | 17 | preferences, locale and data filed under the page shell | T-ui-leaf-1 |
| engine, world → `src/entry/telemetry.ts`; engine → `server/telemetryRecord.ts` | 4 | the beacon client is filed as composition; the record schema lives with the services | T-telemetry-1 |
| mp → `src/game` (`campaignOperations`, `preBattleCountdown`, `appLifecycle`, `couchSeats`, `gunshipVisual`) | 6 | the online host reaches local-driver modules; `campaignOperations` reaches `localStorage` | T-mp-1, T-shared-2 |
| api → `src/game/jevProtocol.ts` | 1 | a contract filed under the local driver | T-mp-1 |

File-level static cycles: 6, each two or three files (`sim/auxiliarySystems` ↔ `sim/damage`; two vehicle profile
families; `world/sceneryRocks` ↔ `world/maps/stoneLandmarks`; the Arctic regional kit). All are load-safe today only
because of hoisted function declarations or lazy closures (T-cycles).

## State ownership

- Simulation state lives in the battle's `GameState` (`src/game/stateCore.ts`) and the authority's match record
  (`src/sim/authoritativeMatch.ts`); presentation never writes it (`driver-boundaries` check (d)).
- Module-level `let` bindings: 498 across 170 files. In `src/sim` (73, in 7 files) they are scratch vectors in
  `movement.ts` and `armor.ts`, or caches with one writer. Two-writer singletons found: `src/game/strikeViewState.ts`
  (written by `ui/airSupportHud.ts` and `game/playerBattleActions.ts`, read by `engine/cameraRig.ts`) (T-state-1).
- Browser storage: 49 modules call `localStorage` directly for about 89 `cot.*` keys, through 9 separate safe accessors;
  `cot.settings.v1` is parsed by four modules with three copies of its defaults (T-storage-1, T-storage-2).
- On-screen data: one owner per datum (`src/ui/surfaceRegistry.ts`, enforced).

## Duplicate implementations (one meaning, several bodies)

| Meaning | Copies | Canonical | Task |
| --- | --- | --- | --- |
| Import-specifier resolution and edge reading in tools and receipts | 7 resolvers, 5 edge walkers | `tools/static-import-closure.mjs` | arch-1 (done: 3 resolvers and 4 walkers retired), T-graph-2 |
| The two simulation loops (`state.ts simStep`, `authoritativeMatch.ts step`) | 2 | one core step with host callbacks | T-loop-1 (§1.6 named follow-up) |
| Rule constants copied into both loops (`FIRE_TICK_S`, ram cooldown, impact thresholds, smoke cap 84 and life 18) | 2-4 each | `sim/impact.ts`, `sim/smokeScreen.ts`, `matchRuleset.ts` | T-rules-1 |
| `mulberry32` | 46 definitions, 24 spellings, one sequence | one `sim/rng.ts` (needs §1.4 change) | T-rng-1 (pending confirmation) |
| `clamp`/`lerp`/`smoothstep`/`wrapAngle` | 72/32/34/7, several rounding variants | `sim/scalar.ts`, `sim/detAngle.ts` by variant | T-scalar-1 |
| HTML escaping | 32, four behaviours (one attribute-injection gap) | `src/ui/components/escape.ts` | T-ui-1 |
| m:ss clock formatting | 12, disagreeing on rounding | `formatClock` beside `formatNumber` | T-ui-2 (player-visible) |
| Reduced-motion checks | canonical + 6 copies, 3 ignoring the in-game setting | an import-free motion-choice leaf | T-ui-3 (player-visible) |
| Element builders, tab roving, dialogs | 8, 7, 3 ways | `dom.ts`, `wireRoving`, `createModal` | T-ui-4 |
| Worker clients | 3 on `workerCalls`, 4 health-only, 8 hand-rolled; two identical pools | `src/workerCalls.ts` | T-worker-1 |
| Bounded caches | 21 hand-rolled insertion-order evictions | one bounded-map leaf | T-cache-1 |
| Rooms address resolver | 2 (`mp/session/endpoint.ts`, `pad/padEndpoint.ts`), port 8792 in 4 places | one deployment leaf | T-config-1 |
| Collision-shard loader | 2 (the tested one is unused in production) | `src/mp/host/worldCollision.ts` | T-mp-2 |
| Seat-token signer, secret minimum length | 2 signers, length in 4 places | `server/match/seatClaims.ts` | T-auth-1 |
| Pad reconnect backoff | 2 copies beside `reconnectDelayMs` | `reconnectDelayMs` | T-mp-3 |
| Tool CLI parsing, free ports, Vite servers | 229 local parsers, 5 port finders, ~110 Vite servers off `toolServerOptions` | `bindFirstFree`, `toolServerOptions` | T-tools-2 |

## Technical solutions in use

Rendering: three.js 0.185 WebGL (one renderer). Simulation: TypeScript, with Rust/WASM kernels (`crates/cot-sim`) on by
default and the TypeScript path kept behind `?simKernels=ts` (two implementations by design, pinned byte-equal by
receipts). Build: Vite 8 on Rolldown; esbuild only in a benchmark tool. Types: TypeScript 7 native compiler for
checking; tools parse with two AST stacks, Rolldown's `parseAst` (oxc, 18 tools) and the TypeScript compiler API (10
tools; the changed-only fingerprint and the selftest cache) (T-graph-2). Lint: Oxlint correctness rules. Tests: the
repository's own receipt runner (`tools/run-selftests.mjs`, tiers in `selftest-tiers.mjs`), puppeteer for browser
receipts, vitest only inside the Cloudflare Workers. Network: WebRTC peer-to-peer with a Durable Object rooms Worker;
Vercel functions for telemetry, Jev and GitHub counts. i18n: the `gt` CLI writing local catalogs. Telemetry: Workers
Analytics Engine plus Google Analytics.

## Standards and their checks

| Standard | Check |
| --- | --- |
| One core, two drivers | `tools/driver-boundaries.selftest.mjs`, `src/sim/driverStepParity.selftest.mjs` |
| Layer direction and no import cycles | `tools/module-boundaries.selftest.mjs` (shrink-only pin) |
| One import reader in tools | `tools/module-boundaries.selftest.mjs` (resolver pin) |
| One datum, one owner | `src/ui/surfaceRegistry.selftest.mjs`, `tools/datum-census.mjs` |
| Every mode rule in `matchRuleset.ts` | review only (T-rules-1 adds a check) |
| Export only what is imported | `tools/unused-exports.mjs` (counts receipts as users; T-ui-5) |
| Style literals, motion, i18n literals, image fit | `style-literal-census`, `motion-lint`, `i18n-literal-lint`, `image-fit-lint` |
