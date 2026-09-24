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
`water-palette-probe.mjs` compares a proposed water color, opacity and roughness
against the live material from fixed supplied poses. Its required `--url`,
`--map`, `--poses`, `--out`, `--color`, `--opacity` and `--roughness` arguments
produce native before/after/restore images and resource receipts. It owns the
capture lease; do not wrap it in another lease or treat images as timing proof.

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

## Common tasks → first action
<!-- agent-docs:fill:tasks -->
Read the tool's CLI/help and its current evidence doc, run a baseline, then
compare the same scenario after changes. Multiplayer release checks include the
two-player persistent-room soak, human 2v2 (`npm run test:net:four`), and full
human 7v7 capacity (`npm run test:net:seven`) browser paths. Visual combat
certification is the separate `npm run test:net:seven:live` gate: two real 7v7
matches render the host and an impaired remote client while all fourteen tanks
move, fire, deal damage, and report transport/prediction/frame/shadow health.
`npm run test:net:seven:full` continues both pristine-context battles through a
natural authority result and proves that every participant retains the same
waiting room with readiness reset. It uses the existing 60-second simulation
limit only inside the certification authority; production keeps its 900-second
safety cap. Use `--only=host` or `--only=client` for targeted diagnosis.
`npm run net:prod:check` probes distributed signaling and TURN independently,
then uses a pristine browser context with relay-only ICE policy to require a
real relay candidate. URL presence is not allocation proof. Use
`--dependency-only` only to diagnose endpoint health; failure output must
retain both dependency results so one outage cannot mask the other.
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
| `salvo-indicator-probe.mjs` | the salvo rack drives the HUD magazine indicator through real input (round 41) | default `--ids=ztz100_prototype:salvo,leclerc_x:autoloader,t72b3m:single` |
| `water-drive-probe.mjs` | the wake and churn trail of a fording hull (round 46) | `--maps=reservoir --speed=7` |
| `map-metrics.mjs` | Node ports of the PIL metrics: `skyline` (check 5), `stripe` (check 8), `boxes` (checks 3, 4, 11); PIL-identical on the round-43/47 frames | `skyline <dir> a desert`, `stripe <png> 900,480,1500,700`, `boxes <dir> boxes.json titan_gorge a b` |

The probe mutex is the caller's: hold `$SP/probe.lock` around the whole run and
use `nice -n 19`. The tools take neither it nor the `/tmp/cot-shots` FIFO, so
never run one beside `npm test` or the release gate; never edit tracked source
while one is capturing (vite serves the tree live); the server binds
127.0.0.1:5300–5399, never 5197–5199. Receipts:
`map-probe-runtime.selftest.mjs` (arguments, the pinned view table, pose math,
the mirrored-frame note, `--help` without a network) and
`map-metrics.selftest.mjs` (synthetic frames of known luma / wavelength /
heading). A changed view is a dated re-pin of the table digest, never a
capture-session side effect.
