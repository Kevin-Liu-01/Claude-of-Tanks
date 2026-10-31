---
name: tools-skill
description: Maintain deterministic performance, screenshot, fleet, geometry, asset, and release verification tools.
---

# claude-of-tanks / tools

## Purpose
<!-- agent-docs:fill:purpose -->
Provide reproducible evidence for game performance, rendering, tank fidelity,
asset provenance, and public builds.
`attribution-audit.mjs` enforces the repository-wide Kevin B. Liu notice,
named authorship for every playable model, and exact records for tracked
external model files.

## Mental model & key files
<!-- agent-docs:fill:model -->
Receipt tiers (266): `selftest-tiers.mjs` splits `selftest-suites.mjs` into the default tier (`npm test`, the
release gate) and named manual suites (balance, pacing, bots, sims, perf, fleet, tanks, world, ui, browser) that only
`npm run test:heavy -- <suite>` runs, when the owner triggers it. `test-recommend.mjs` says which suites a diff
warrants, one plain line each for Main to relay; `test-lane.mjs` runs a lane's share of the default tier plus its
tanks' pins, each with its reason and a negative control; `test-diff.mjs` holds what both read (the diff, the
changed-only fleet and world partitions in reverse, the balance inputs per id); `test-audit.mjs --write` regenerates
`docs/TEST-AUDIT.md`. `selftest-tiers.selftest.mjs` holds the callers: nothing but test:heavy (and tank:release:check's
`tanks --ids` step) runs a manual suite.
`deploy-overlap.browser.mjs` (Puppeteer, an existing dev server: `--url=`) is the Deploy screen's overlap pass. It runs
every battle mode's plate, at rest and with the further options open, at the gauntlet's eight sizes. It fails in three
cases:
- two of the plate's rows or worded elements intersect as their columns show them;
- anything is cut by its column at rest on a window the layout calls neither compact nor short;
- the datum census finds a duplicate.
A new plate row needs no list entry: every element holding words is measured.
`battle-hud-overlap.browser.mjs` (Puppeteer, an existing dev server: `--url=`) is the battle HUD's cheap overlap pass.
It stages every state the layout fixture knows (the corners, hints, notices, reports, the scope, spectate, Watch
ride and drone, the AC-130 gunship and the drone flight, the modes) at the UI gauntlet's eight sizes (2560x1440,
1920x1080, 1440x900, 1280x720, 1024x600, 900x700, 390x844 and 844x390 touch). It fails on any two visible instruments that intersect, unless the pair is in its ALLOWED list with a
reason. A new HUD instrument joins its INSTRUMENTS list and a new HUD state the fixture's `state()`. The full
Playwright regression (`battle-hud-layout.browser.mjs`) covers more windows and locales.
`water-palette-probe.mjs` compares a proposed water color, opacity and roughness
against the live material from fixed supplied poses. Its required `--url`,
`--map`, `--poses`, `--out`, `--color`, `--opacity` and `--roughness` arguments
produce native before/after/restore images and resource receipts. It owns the
capture lease; do not wrap it in another lease or treat images as timing proof.

`visual-census.mjs` is the visual-redesign baseline: the same seven views of
every registered map (authored time of day, desktop High, 1600x900) through
`__SHOTS.set` and the capture readiness gates, per-frame metrics in one
census.json, contact sheets, an index and an A/B `compare`; `capture` resumes
in bounded batches and takes the cot-shots lease itself (probe mutex = caller).

Build transforms: `viteGlslMinify.ts` (shader literals) and `viteCssInTsMinify.ts`
(the CSS kept in TS literals: comments and layout whitespace out, strings and
interpolation edges untouched, the CSS token stream checked at build time; its
selftest proves each literal is the same stylesheet under Lightning CSS).
`style-literal-census.mjs` is the style-literal ratchet (colour, font-size,
letter-spacing, z-index, shadow, duration, `!important` outside the token
package; `style-literal-baseline.json` may only fall, `--write` lowers it).
`motion-lint.mjs` is the static motion lint (UI-LOCKDOWN part D): per file it
counts transitions, `@keyframes` and `animate()` on layout or paint properties,
time literals instead of `--dur-*`, moving or looping motion without a
reduced-motion path, rAF loops that write styles and raster UI chrome;
`motion-lint-baseline.json` may only fall, `motion-allowlist.json` holds the
measured exceptions and `--report` lists every finding by file and line.
`public-first-paint.browser.mjs` opens each public page with JavaScript off and
on and fails when the first-paint layout differs (`--compare` diffs two runs).

Performance probes drive the browser and record JSON; fleet/geometry tools audit
authored tanks; screenshot/visual tools stage canonical views; strip/release
tools enforce public asset boundaries. `local-import-integrity.selftest.mjs`
rejects stale static source/server/tool import paths after file migrations.
`code-quality-metrics.ts` provides the repository-owned cyclomatic, cognitive,
Halstead-difficulty, and explicit-type inventory. Its `<22`, `<22`, and `<80`
limits are strict (`22`/`80` already fail); use explicit file arguments plus
`--gate` for changed modules while the remaining legacy inventory is retired.
The analyzer uses the pinned `typescript-compiler-api` AST package; typecheck
commands invoke the native TypeScript 7 compiler explicitly so npm bin-link
ordering cannot silently substitute the analysis parser for the project compiler.

## Patterns to follow / invariants
<!-- agent-docs:fill:patterns -->
Pin URL, flags, roster, timings, and output path. Make gates fail visibly and
avoid editing generated evidence manually. Combat-anatomy generation always
uses `ALL_TANK_IDS`; donor/retired spec rows are not part of the playable gate.
Receipts import `near`, `nearStrict` and `geometryHash` from
`receipt-kit.test-support.mjs` instead of defining their own copies.
Never `assert.equal`/`deepEqual` three.js objects (Object3D, geometry,
attribute, material, texture): a failure dumps and diffs both graphs whole
(the 226 T-72 receipts reached 40 GB). Assert a boolean (`assert.ok(a === b)`)
or compare `graphLabels(...)`, uuids or names; `object3d-assert-lint.mjs`
fails the suite otherwise (`--fix` rewrites, `--types` audits with the checker,
`// object3d-assert-ok: <reason>` accepts a false positive).

Fleet tool defaults (2026-10-16, test-speed R4c/R4d): every `--ids` reader
passes its list through `uniqueIds` (`id-list.mjs`), so a repeated id fails by
name before any server, browser or capture hold (`id-list.selftest` scans
`tools/*.mjs`). Browser tools take their Vite `server` from `toolServerOptions`
(127.0.0.1, strictPort false), build URLs with `boundOrigin(server)` (never
`localhost`), and load their first page with `loadReadyPage` (180 s navigation,
one retry of a timeout; `COT_NAV_TIMEOUT_MS`, `COT_READY_TIMEOUT_MS`,
`COT_NAV_RETRIES`) from `tool-page-load.mjs`. `gen-interior-fills.mjs`
generates at the shipped records' flags by default (`--rounds=8 --min-fine=1`,
also spelled `--release`); exploration passes its own rounds explicitly.

A receipt that pools many independent runs (`destruction-slab-kinds`, 2026-10-30, item 265) queues its
smallest unit (a run, not the map that holds it) so no container is the long pole, keys every result on its
inputs (a clean or judged run on its fingerprint, a map's listing on the tool's import closure) so unchanged
work is never redone, stops a unit past its CPU on the worker thread's clock (`worker.cpuUsage()`: at load
300 the wall runs 10-15x the CPU), budgets the whole receipt in CPU minutes, and plants a defect the verdict
must catch.

Every browser goes through `browser-launch.mjs` (2026-10-26, item 244; the
10-23 crashes came from a 14.1 GB capture renderer): `launchGuardedBrowser(
puppeteer, options, { label })`, or `launchGuardedBrowser(chromium, options)`
for playwright (`method: 'launchServer'` / `'launchPersistentContext'`), never
`puppeteer.launch` or `chromium.launch` (`browser-launch-census.selftest`
fails on a direct call). It adds `--js-flags=--max-old-space-size=3072` and
`--renderer-process-limit=4`, and samples the browser's process group every
2 s (physical footprint every ~10 s for large renderers). A renderer past
6 GB, or the tree past 10 GB, is killed by its exact pids; a
`[browser-guard]` line names the label, the `runWarmHold` hold, the pages and
the peaks (also `/tmp/cot-browser-guard.log`); every capture lock the process
holds is released (`releaseAllCaptureHolds`); the process exits 86. Still
close the browser in `finally`: the guard also reaps the tree on disconnect,
process exit and SIGALRM (a perl alarm). Caps come from the guard options or
`COT_BROWSER_HEAP_MB`, `COT_BROWSER_RENDERER_CAP_MB`, `COT_BROWSER_TREE_CAP_MB`,
`COT_BROWSER_GUARD_INTERVAL_MS`, `COT_BROWSER_RENDERER_LIMIT`; `exit: false`
reports and kills without ending the process (`browserGuardOf(browser)`). A
fixture's fake launcher gets its fake browser back unwatched; a fixture that
strips imports and runs a tool's source passes a `launchGuardedBrowser` port.

The capture lock has two classes (2026-10-27, item 262). `render` holds
(genIcons, genHeroCards, genDrawings, anatomy render sets, gauntlet captures,
sheets) share it, two at once, as one lock directory with a `slot-<k>.holder`
per member; `timing` holds (perf, census, timing, sortie tools, and any
command not known to render) stay exclusive and wait for running renders.
FIFO holds between classes: a render never passes a ready timing ticket (or
an older copy's unclassed one, which stays exclusive). The class comes from
`--lock-class=render|timing`, else acquire's `lockClass`, else
`COT_SHOTS_LOCK_CLASS`, else the command's script names (`classifyCommand`);
`--status` shows it. Holds are capped at 20 min: call `lock.checkpoint()` (or
shoot's `checkpoint` in `runWarmHold`, which freezes and thaws the pages)
between batches, and past the cap with anyone waiting it gives the lock up and
re-queues at the back. Raise the cap per ticket only: `holdCapMinutes` with a
`holdCapReason`.

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read the tool's CLI/help and its current evidence doc, run a baseline, then
compare the same scenario after changes. `tools/audio/` (the ElevenLabs sound
and crew-voice pipeline) has its own procedure: the
[audio-generation skill](../docs/audio-generation/SKILL.md). The multiplayer release checks are the
peer-to-peer ones (docs/MULTIPLAYER-V2.md §13.8, cutover §13.10): `npm run
test:net:v2:p2p` (`tools/mp-p2p-e2e.mjs`) is the three-browser proof — a room on
the in-process room host, one seat hosting the match in its browser, two peers
over WebRTC, moving and firing, the host leaving and the match migrating to the
next seat — with a JSON report (`--json --out=<dir>`) and `--site` for the
deployed site; `npm run test:net:v2:browser` (`tools/mp-browser-e2e.mjs`) is the
two-browser exit-flow rig; `npm run test:net:v2:p2p:soak` (`tools/mp-p2p-soak.mjs`)
seats N tabs of the dev-only peer harness `tools/mp-p2p-peer/` in one headless
Chrome on a `wrangler dev` room service (`--rooms=ws://127.0.0.1:<port>` with the
dev origin allowed), the migration measured on every seat, a JSON report and a
Markdown table per size; `npm run test:net:v2:p2p:headless` (`tools/mp-p2p-headless.mjs`)
and `npm run test:net:v2:soak` run the client and host without a browser; `npm run
test:net:v2:rooms` runs the Worker under the Workers runtime. Run every Chrome
under the probe mutex at nice 19, one at a time. Production health is the Worker's
`/healthz` plus `npm run test:net:v2:p2p -- --site` (docs/DEVELOPMENT.md).
Battle entry is a per-deploy check of its own: `node tools/battle-entry-sweep.mjs
<url>|--dist=<dir> --tier=mobile|desktop --times=sunset,day,night --force-black` loads
into every battlefield through the player's covered solo entry with
`navigator.webdriver` reported false (the scene watchdog runs only outside
automation, so an ordinary smoke never sees a refusal) and reports entered / refused
/ stuck / black / rescued per run, plus the negative control
(`?diagforce=blackout` must be refused); a protected preview reads
`COT_PROTECTION_BYPASS` from the environment.
A black world inside a revealed battle (black-screen-228: the sky and world exactly
0 under a live HUD) is hunted with `node tools/black-world-repro.mjs --target=dev
--scenario=cold|esc|regarage|session` (`--real-esc`, `--real-focus`, `--plan=` with
`inject:<fault>` heal proofs for the battle's guard, `engine/blackWorldGuard.ts`);
each part takes its own capture-lock ticket, and `node
tools/black-world-repro-summary.mjs <part dirs>` tables the rate, the guard's
incidents and the heal latencies (an unwatched window counts as a harness error),
the `sunscan:<s>` rows (a day sun circled in frame must open nothing) and the
`guardtiming` rows (the guard's own CPU and probe GPU ms). No hold outlives
`--hold-max-min` (20): a watchdog closes the run's own browser and releases the lock.
Cold-start claims require `npm run perf:cold`; use `--sessions` for repeated
cache-disabled contexts and record `--cpu`, `--down-kbps`, `--up-kbps`, and
`--latency` so a warm navigation cannot masquerade as first-visit reliability.
The standard 4× CPU, 150 ms, 1.6 Mbps gate enforces an 8-second navigation-to-
ready ceiling and a 2.5-second post-transfer application-work ceiling for every
pristine session; slower custom conditions must declare intentional
`--max-wall-ms` and `--max-app-ms` budgets rather than silently weakening the
default evidence.
Garage-entry claims additionally require `npm run perf:garage-entry`. The
standard 4×-CPU five-second sample starts from an empty browser cache and fails
on post-ready environment texture warming, eager fleet/map artwork, frame-gap
spikes, long-task bursts, or console errors. Environment-transition claims use
`tools/garage-variants-probe.mjs`; exercise all ten destinations, rapid stale
selection, cache eviction, persisted reload, iPad, and phone layouts.
Gallery anatomy before/after packets (the Armor, Modules and Crew layers; 2026-10-21) come from
`tools/anatomy-render-set.mjs`: both sides served from their own checkouts, one capture hold, the same
cameras on both (`--plan=before:desk,after:desk,... --before-root --after-root --ids --out`).
Pinch-zoom claims (a trackpad pinch only magnifies; 2026-10-16) use the manual
`npm run qa:pinch -- --base=<served origin> --out=<report.json>`
(`tools/pinch-zoom-probe.mjs`): a real CDP trackpad pinch to 2x, a pan and a
pinch-out on home, docs, gallery, a dossier, 404, the HUD editor preview, the
splash, garage, a live battle HUD and Studio (splash, garage and battle share one
boot), each compared with two control snapshots (layout vars, bands, canvases,
key and per-element layout boxes, scroll positions, cot:layoutchange,
layout-shift entries), then a real resize that must relayout. Where a guard
cancels the pinch (the game page, the HUD preview) the probe records that and
lets a zoom through anyway (page scale on the game page, a touch pinch
elsewhere). It runs on SwiftShader (no GPU lock): serve the checkout yourself
and kill that PID, and on a loaded machine allow long waits (`--ready-timeout`,
`--battle-timeout`; a game boot took up to 30 minutes at load 250, and a live
battle can stall there, so leave `battle` out of `--surfaces` then). Run it
against origin/main too: a build before the fix exits 1 (the negative control).
Its pure rules are `pinch-zoom-probe.selftest.mjs` in npm test; the browser run
is not.
Static-screen and transition claims require `npm run perf:resources:gate`; it
records task/script CPU, forced-GC heap, scene and renderer residency, cache
ownership, actual paint cadence, and complete-frame draw/primitive totals
across Garage, battle, and returned Garage. The gate enforces broad CPU, heap,
shader-program, geometry, texture, draw-call, primitive, cadence, and
cache-residency ceilings; its frame history also attributes exact native-shadow
submissions by cascade mask and reports conservative scene-owner,
texture-source, and program-use distributions. Do not reduce it to an FPS-only
check. Static Garage presentation is one watchdog paint per second; the
workshop must publish its proxy-safe shadow-pruning receipt before the gate's
settled sample.
Tank work must run `npm run tank:anatomy:update` before asset/release checks;
the update refreshes the receipt map and only the three fleet technical views,
preserving unrelated garage/top/side/markings assets.
Garage quality substitutions must retain the live production engine context,
including shadow-material setup and release ownership. A null-context factory
build can leave lights and shadow maps enabled while omitting cascaded-shadow
shader registration. Record actual material registration as well as camera,
quality, fill and light state; distinguish this substitution from normal
settings selection.
For a Griffin Viper cable/garage change, run
`griffin-viper-garage-probe.mjs --url=<built-game-url> --revision=<gated-sha> --out=<fresh-directory>`.
It exercises normal carousel selection, live engine materials, static batching
and cache return. Repeat against production after a manual deployment and inspect
its screenshots. A pushed commit, gallery render or null-context factory build
does not prove that the player's Garage is running the correction; retain the
served version with the result. See `docs/DEPLOYS.md` for deployment ownership.
Reference-backed new tanks and ground-up rebuilds must register the exemplar
quality bar in `procedural-fidelity.html`: every whole silhouette view and the
aggregate score must reach 92, not merely the legacy 90 fleet floor. Keep that
floor quality-bar-aware through geometry packets and `tank-standard-check`;
never replace it with a favorable average or waive it because component masks
are unavailable on a fused source mesh.
The §B2 contiguity scan reads `contig-grid.mjs`: a 6 cm lattice fixed in the
vehicle frame and re-binned at all nine sub-cell phases, so an add-on that only
moves the AABB cannot hide or reveal a gap. Never frame a scan from the AABB;
census hidden gaps with `contig-phase-audit.mjs --ids=<ids>`. The gaps the old
raster missed are listed in `docs/geometry-gate/contig-hidden.json`
(`contig-hidden-gaps.mjs --report`): the gate passes those and fails any other.

`gen-interior-fills.mjs` applies the explicit body-boundary recipes in
`interior-fill-body-policy.mjs` before voxelization. A separately mounted cage,
light or roof fitting must not bridge exterior air into a body span. The BMP
and modern Trophy/Barak/Namer recipes use their primary hull/turret shells
and retain every gun/bore input; other vehicles keep their existing inputs. This affects
generation only, not source, continuity, seating or watertight checks. Native
shell seams still require repair: regenerate the scoped fill record and verify
filled closure, stock, real openings, weapon bores and strict band/shoe seating.
A regression test must allow a repaired seam to disappear. Never hand-edit a
generated fill record.
A source-real rear bay that spans two body skins needs a finite source-air
recipe, not a broad fill exclusion. Barak's recipe authenticates the source
hash and registration and verifies eighteen actual native door/wall/floor/roof
first hits before preserving its measured room. The owner's 2026-09-20 closed
door target supersedes the older open entrance: exterior rays must hit the
finite leaf, while interior rays retain the bay walls. Retain raw residuals, test
missing/moved stock and wrong-source negatives, and keep all geometry in the
source and physical audits.

Tank hero cards (Garage roster, end-screen tile, Gallery list): one policy in
`src/ui/heroCardPolicy.ts` (policy v5, owner 2026-10-20: the whole tank faces left, the
turret turned modestly toward the lens with the gun forward and level; turretless mounts
keep the gun on the hull axis).
`node tools/hero-cards-plan.mjs` names the stale ids (geometry hash and angle-render
sha from the tank's `public/icons/tank-assets/tanks/<id>.json` row, flag SVG, policy keys); render only those with
`node tools/genHeroCards.mjs --ids=<stale>` (capture lock, NORMAL band; a policy
change needs an explicit `--all --part=i/n`), then
`node tools/hero-cards-compose.mjs ship --layers <dir> --ids=<stale>` and
`npm run hero-cards:check` (bow and gun sides by projection, budgets, files). Never
hand-edit `public/icons/hero/hero-cards.json`.
The Garage running-gear band (2026-10-17, the wheel-band lane): `tools/garage-wheel-band.browser.mjs` stages Garages
and tanks as the Garage does (the dormant energy skin on), poses beside the run and reports the vehicle-tag share of
the tank's pixels in the scene target's alpha and the ground occlusion's step across the belly line (the same frame
with `__LIGHT_TUNE.VEHICLE_GROUND_AO = 0` as reference); `--battle` adds a daylight player view, plain and with the
live Juggernaut skin, `--root` serves another checkout for a before/after pair, `--gate` fails on a step of 4 levels or
a tag share under 0.8. It takes the capture lock. Round 3 (2026-10-18): `--battle-thermal` adds the sensor view (the
tank in its hostile heat stand-ins under the white-hot grade), `--views=front` frames the near run's front end (the
KF51's flaps), and the report counts untagged unlit pixels under the line.
`tools/vehicle-material-registration.mjs [--ids=a,b|all] [--quality=low,high]` (node, no GPU; round 2, the same day)
builds each tank through a recording cascade context and fails on any drawn opaque lit material without its own
vehicle registration (unregistered, a replaced cascade hook, no vehicle-tag write), any other opaque one without the
unlit vehicle tag (round 3), or one left registered after dispose:
the material invariant behind the band. `tank:release:check` runs it on the released ids; `--ids=all` (220 tanks, two
qualities) takes about 25 minutes in one process, so split it across processes for a fleet sweep.

Standalone probes run by hand (each is its owning lane's reusable rig; none is in `npm test`):
- `node tools/civic-census.mjs [--out=<file.jsonl>] [mapId…]` — read-only, from each map's collision shard and config:
  its town pads, the legacy kerb pass replayed, and whether the map needs the civic-area or pathway kit (maps lane).
- `node tools/click-timeline.mjs --base=<label>=<url> --out=<dir> [--paths=all|<id>,…] [--profile=desktop|phone]`, then
  `--report=<dir>` — click to next paint for every in-game click path, A/B across builds served by
  `tools/vercel-static-preview.mjs` (the click-perf rig beside `tools/nav-timeline.mjs`).
- `node tools/gallery-shots.mjs --port=<n> --out=<dir> 'id@px,py,pz@tx,ty,tz;…'` — Tank Gallery stills at exact cameras
  (a markup export's camera.position and camera.target), headless on SwiftShader against a served checkout.
- `node tools/gunship-lens-strip.browser.mjs --runs=<tag>:<dist>:desktop+phone:daylight+thermal [--stamp=<ms>]` — frame
  strips of the AC-130's guns firing through each lens on a manual clock, over built dists under the capture lock.
- `node tools/icon-alpha-floor.mjs --ids=<id,…>|--all` — re-encodes published tank icons rendered before
  `tools/icons-page.html` floored transparent pixels (the grey squares at antenna tips), rewriting their bytes and sha256.
- `node tools/marking-flicker-probe.mjs --ids=<id,…> --out=<dir> [--views=hero,left,rear] [--roots=base,lane]` — the
  Gallery's marking and prop flicker meter (blip, nudge) over scripted orbits, on the GPU under the capture lock.

## Gotchas
<!-- agent-docs:fill:gotchas -->
Collision-fixture codec changes use the maintained, headless
`node tools/collision-manifest-codec-bench.mjs <raw-shard-directory> <encoded-shard-directory> 6`
comparison. Preserve the raw captured per-map corpus and its checksum index
before recoding; both directories must represent the same geometry and seeds,
not a stale legacy monolith versus a newly captured world. The release procedure
runs twelve fresh Node processes in alternating before/after order, loads the
complete 30-map corpus through the two-map idle cache, and compares elapsed
decode time plus forced-GC retained heap/array-buffer deltas. Its JSON includes
each run and median/min/max receipts. Module caches are cold; the operating-system
file cache is unspecified, and these are not browser/frame-time measurements.

Many `tmp-*` tools and `.qa-dev/` outputs are transient and must not be staged.
Own and stop every dev server/browser process you start.

`node src/world/iceSurfaceDetail.selftest.mjs` requires the pinned native
`@napi-rs/canvas` devDependency installed by `npm ci`. It exercises real Canvas2D
paths/gradients, packed RGB/roughness, independent relief and desktop/mobile
texture budgets; no pixel-upload stub or skip is supported. A bundled native
installation may be selected explicitly with
`--canvas-module=/absolute/node_modules/@napi-rs/canvas/index.js`. Missing or
wrong-package rasterizers fail closed. Optional `--out-dir=/absolute/new-output`
writes fresh PNGs and a receipt identifying the actual module/version; these
are CPU raster evidence, not GPU or final-shader acceptance.

`node tools/environment-motion-probe.mjs --root=/absolute/release --out=/absolute/fresh-output --expected-build-index-hash=<approved-sha256> --case=desktop/winter`
is a committed Playwright visual regression. It owns one video-recording context
per case, with viewport/DPR and normal persisted quality choices applied before
boot. If Playwright is supplied by a bundled runtime rather than this repo,
pass `--playwright-module=/absolute/node_modules/playwright/index.mjs`; no package
installation or runtime rebuild is required. First run the CPU-only
`node tools/environment-motion-probe.selftest.mjs`, then the single desktop/Winter
case. Only a passing same-build, same-acquisition receipt unlocks
`--matrix --one-case-report=/absolute/passing/receipts.json` for all nine cases.
Raw WebMs include boot/staging at explicit CSS-resolution video dimensions.
Start/mid/end PNGs read the actual output canvas immediately after a production
render, preserving native backing dimensions and the actual eight-second pan
midpoint without remote screenshot latency. Use same-callback `toBlob` snapshots
with asynchronous encoding; retain receipt/order and timeout/cancel ownership
until every PNG completes, without synchronous PNG encoding in the render loop.
Three bounded readbacks are visual
evidence, never a timing or memory benchmark. The real battle clock and positive
render dt must advance; scope x8 uses the separate authored helper and is not
live cadence evidence. Desktop DPR 1→2→1 and mobile orientation round trips use
browser emulation only, never renderer/CSS forcing or rescue suppression. Keep
requested/effective quality, console/errors, viewport owners, projection and
canonical output-policy receipts, including all failures. These are emulated
Chromium checks, not physical iPad/iPhone Safari certification. Earlier rejected
native CLI recordings remain historical failures; never overwrite their output.
New headless Chromium/ANGLE is requested, but only observed unmasked hardware
renderer evidence is accepted; missing/software/SwiftShader/llvmpipe backends fail.
Every submitted pan frame records effective preset, trim, AA and internal/output
ratios. Ordinary source-owned base-to-ceiling adaptation is allowed (mobile-high
starts at 1.5/1.7 dynamic scale), but below-base relief or trim fails parity; it
is never disabled. The matrix gate recomputes the raw live/scope/DPR-round-trip
checks and verifies saved PNG/video hashes plus complete process/lock cleanup.

## Fixed camera residency acquisition

`world-residency-probe.mjs` requires `--camera-manifest=/absolute/cameras.json`.
Use the same tool and manifest for baseline and candidate. A camera derived
from each build's terrain height is not a matched pose. Old reports without
the manifest and actual camera/render/roster receipts are not v3 baselines.

Create the manifest once from a preserved complete pinned source report.
The example below preserves its exact, unrounded position/quaternion values
and source hash; `wx` refuses to overwrite existing evidence. Projection
values come from `src/main.ts` (`near=0.5`, `far=4000`) and both battlefield
recipe paths (`fov=55`). The new run verifies live values, native canvas,
postprocessing settings, and settled terrain before/after actual frames.

```sh
node --input-type=module - /absolute/source-report.json /absolute/cameras.json <<'NODE'
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const [reportPath, outputPath] = process.argv.slice(2);
const raw = fs.readFileSync(reportPath), report = JSON.parse(raw);
if (report.errors.length || report.samples.length !== report.scenario.maps.length * report.scenario.sweeps) {
  throw new Error('Require a complete source report without browser errors');
}
for (const mapId of report.scenario.maps) {
  const rows = report.samples.filter(row => row.mapId === mapId);
  if (rows.length !== report.scenario.sweeps || new Set(rows.map(row =>
    JSON.stringify(row.terrainWarm.topology.camera))).size !== 1) throw new Error(`Unstable camera: ${mapId}`);
}
const content = { schemaVersion: 1, protocol: 'absolute-map-camera-v1', source: {
  reportPath, reportSha256: createHash('sha256').update(raw).digest('hex'),
  revision: report.metadata.revision, sourceHash: report.metadata.sourceHash,
  buildIndexHash: report.metadata.buildIndexHash, acquisitionHash: report.metadata.acquisitionHash,
  projectionSource: 'src/main.ts PerspectiveCamera near=0.5 far=4000; src/dev/shotViews.ts battlefield and shotRuntime.ts mapEstablishingShot fov=55. Declared from source; v3 must verify actual cameraState receipts.',
}, maps: report.samples.filter(row => row.sweep === 0).map(row => ({
  mapId: row.mapId, position: row.terrainWarm.topology.camera.slice(0, 3),
  quaternion: row.terrainWarm.topology.camera.slice(3), fov: 55, near: 0.5, far: 4000,
})) };
fs.writeFileSync(outputPath, `${JSON.stringify(content, null, 2)}\n`, { flag: 'wx' });
NODE
node tools/world-residency-probe.mjs --root=/absolute/baseline --production --camera-manifest=/absolute/cameras.json --maps=verdant,coastal,winter --sweeps=3 --out=/absolute/baseline-v3.json
node tools/world-residency-probe.mjs --root=/absolute/candidate --production --camera-manifest=/absolute/cameras.json --maps=verdant,coastal,winter --sweeps=3 --baseline=/absolute/baseline-v3.json --out=/absolute/candidate-v3.json
```

Keep the chosen map list/order, viewport, tier, settle time, and three-sweep
protocol identical. Do not add undeclared warmup cycles, drop failed samples,
or reinterpret a leaking baseline as passing its own boundedness gate.

## Map probes and metrics (AAA map program acceptance)

The QA probes that verified rounds 41–47 are committed tools over one runtime,
`map-probe-runtime.mjs` (owner approval 2026-09-23; docs/MAP-BEAUTIFICATION.md
"Probes and metrics as tools"). Every flag is `--name=value`; `--help` and a
bad flag return before a server exists; every run writes
`<tool>-<tag>.receipt.json` next to its PNGs and exits 1 when a map failed.

| Tool | Proves | Typical run |
|---|---|---|
| `map-view-probe.mjs` | fixed-camera A/B captures from the 31-pose table `map-view-probe-views.mjs` (rounds 35–47) | `--root=<checkout> --out=<dir> --maps=badlands --views=sw-corner-close,sky-w --tag=a` |
| `terrain-layer-flag-probe.mjs` | which splat layer paints a surface (G yellow, D cyan, R magenta, M blue; rounds 45, 47) | `--maps=monsoon --views=canyon-in` |
| `terrain-uniform-iso-probe.mjs` | which terrain uniform carries an artefact; `--flat-normals` (round 47) | `--maps=desert --views=sw-corner-close --iso-uniforms=uRipple --flat-normals` |
| `world-layer-isolation-probe.mjs` | which world layer draws a step at the water edge (round 40) | `--maps=coastal --views=bird-e-edge,over-e-560` |
| `salvo-indicator-probe.mjs` | the salvo rack drives the HUD magazine indicator through real input (round 41) | default `--ids=ztz100_prototype:salvo,leclerc_xlr:autoloader,t72b3m_2022:single` |
| `water-drive-probe.mjs` | the wake and churn trail of a fording hull (round 46) | `--maps=reservoir --speed=7` |
| `suspension-strip-probe.mjs` | frame strips of the player hull for the visual gauntlet (physics lane, 2026-10-03): rough ground at speed, a hard stop, a landing in each gravity world, level drops onto flat ground (a case may name its hull), a rest on a slope and across one, a field trench and an assault sector line crossed at a held speed (round 7, watched from inside the trench); each frame stamped (root height, rendered pitch and roll, wheels in contact, each road wheel's travel) and checked against the sim state it was synced from, a landing's window anchored on its touchdown step | `--root=<checkout> --dist=<built dist> --out=<dir> --tag=after --ids=land-mars,hardstop` |
| `map-metrics.mjs` | Node ports of the PIL metrics: `skyline` (check 5), `stripe` (check 8), `boxes` (checks 3, 4, 11); PIL-identical on the round-43/47 frames | `skyline <dir> a desert`, `stripe <png> 900,480,1500,700`, `boxes <dir> boxes.json titan_gorge a b` |

The probe mutex is the caller's: hold `$SP/probe.lock` around the whole run and
use `nice -n 19`. The tools take neither it nor the `/tmp/cot-shots` FIFO, so
never run one beside `npm test` or the release gate; never edit tracked source
while one is capturing (vite serves the tree live); the server binds
127.0.0.1:5300–5399, never 5197–5199. The dev server's dependency scan must resolve every import the game makes:
a `virtual:` module without its plugin in `mapProbeServerOptions` fails the whole scan, vite then re-bundles three
mid-session, and the probe page (hmr off) never reloads, so it holds two copies of three (2026-10-20, modes-228 r2d:
"world/vegetation: expected three directional shadow sites, found 1"). The scan also drops a dynamic import in code it
proves dead (sky.ts's RGBELoader), so every dynamic `import('three/...')` sits in its `optimizeDeps.include`. The receipt
checks that list and every `virtual:` import;
`[map-probe] vite re-bundled its dependencies mid-session` on stderr names the event. `--dist=<dir>` (where a tool accepts it) serves a built dist through vite
preview instead (`withDistProbeSession`): a before/after pair from two builds shares no module graph or optimizer
cache, and nothing reads the live tree. Receipts:
`map-probe-runtime.selftest.mjs` (arguments, the pinned view table, pose math,
the mirrored-frame note, `--help` without a network) and
`map-metrics.selftest.mjs` (synthetic frames of known luma / wavelength /
heading). A changed view is a dated re-pin of the table digest, never a
capture-session side effect.
