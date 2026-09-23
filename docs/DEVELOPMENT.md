# Development and verification guide

This guide explains how to run, test, inspect, and release Claude of Tanks. It
is the operational companion to SYSTEMS.md.

## Publishing to shared main

Codex and Claude share `origin/main`. Start an isolated worktree from freshly
fetched main and record its commit as the **starting base** before editing.
Keep that base in the task's local evidence. Never reset, clean or stage another
agent's checkout. Scope commits to owned files; generated fleet receipts need
the same ownership review as source.

Before publishing:

1. Fetch origin and integrate its current main into the owned worktree. Compare
   `git diff <starting-base> origin/main` with the proposed changes. For every
   overlapping file, preserve the incoming behavior explicitly; do not resolve
   a conflict by taking an entire old file. A conflict-free merge can still
   undo a feature through a later whole-file replacement.
2. Inspect `git diff origin/main HEAD` as the final proposed change, including
   removals, registry entries, feature flags, generated inputs and performance
   policies. Check older branch work by patch/tree equivalence before copying
   it: a squash or rebase changes IDs without losing the work.
3. Commit the integrated result and run the checks appropriate to that exact
   commit — at minimum `npm run typecheck` and the core receipt suite
   (`npm test`), on every push, however small the change (owner 2026-09-23,
   after a push that turned `balanceMatchups` red on shared main for a night).
   Record the validated commit. An earlier branch's green result does
   not certify conflict resolution or later source edits. For geometry, use
   the complete anatomy and targeted release procedure in `AGENTS.md`.
4. Run `node tools/shared-main-preflight.mjs --base=<starting-base> --validated-head=<tested-commit>`.
   This reads the actual remote main, rejects a dirty or stale candidate and
   reports overlapping paths. After reviewing those paths and running their
   checks, acknowledge that exact remote revision with
   `--reviewed-main=<reviewed-remote-commit>`. This is the publisher's explicit
   acknowledgment, not an automated claim of semantic correctness.
5. Push normally with `git push origin HEAD:main`. Never force-push shared main.
   If another publisher wins the race, fetch, integrate, review and revalidate;
   never bypass the rejection. Retain the preflight JSON with local evidence.

The check does not install hooks, change branch protection, merge, stage, push
or deploy. Both agents must invoke it; it cannot establish that a test was run
or that an overlap was reviewed honestly. Its regression test uses two local
clones to exercise stale remote data, stale validation and an accidental
whole-file rollback that Git would otherwise allow.

Publication and deployment are separate. Agree on one deployment owner for a
round, follow [DEPLOYS.md](DEPLOYS.md), and record the actual served build version.
Do not deploy an older candidate over a newer live release. Verify a visual
fix in the real Garage/battle path after deployment, including cached vehicle
return where applicable. A pushed commit alone is not delivery evidence.

The [2026-09-22 sync audit](history/sync-audit-2026-09-22.md) records the last-week
reconciliation and the distinction between published work, superseded drafts,
active work and the served release.

## Requirements

- A current Node.js runtime
- npm
- A browser with WebGL 2 and WebRTC support
- Chromium available to Puppeteer for browser rigs

Install dependencies:

    npm install

Start the Vite development server:

    npx vite

The default local URL is usually http://localhost:5173.

## Public routes

| Route | Purpose |
| --- | --- |
| / | Game boot and garage |
| /home | Public visual showcase |
| /docs | Public technical field manual |
| /studio | Scene Studio entry |
| /gallery | Tank Gallery, diagnostics, and surface markup |

The home and docs routes are separate Vite entries. They must remain able to
load without preloading the game module graph.

## Development services

Start local signaling:

    npm run server:signal

The default endpoint is ws://127.0.0.1:7777/signal.

Private and LAN matches run in the room host's browser. They do not need Redis,
Supabase, a dedicated game server, or a ratings database. Keep the host tab open
and foregrounded. See [the multiplayer hosting runbook](MULTIPLAYER-HOSTING.md)
for LAN access and Internet room-code signaling/TURN setup.

The retained developer-only dedicated match and ranked HTTP service can still
be exercised independently (Ranked is not a player-facing mode):

    npm run server:match

The default service uses port 8790. Production requires secure WebSocket and
HTTP endpoints, explicit origin configuration, persistent rating storage, and
deployment-specific signaling/TURN configuration.

### Complete self-hosted stack

For a Redis-free backend while retaining the existing Vercel website and TURN
credential endpoint, use [the multiplayer hosting runbook](MULTIPLAYER-HOSTING.md)
and the Cloudflare Worker under `cloudflare/signaling`. The optional
`compose.multiplayer.yaml` alternative contains only the TLS gateway and
in-memory signaling; neither moves the frontend or requires a separate database.

The repository also retains an optional legacy all-services deployment that serves the static game,
same-origin signaling and ICE credentials, authoritative ranked service,
persistent local rating file, and coturn relay without Cloudflare, Vercel,
hosted Redis, or another application service. The self-host image disables the
optional Vercel Analytics client used by the hosted public site. Copy `.env.example`
to `.env`, then set at minimum:

    COT_PUBLIC_ORIGIN=https://tanks.example.com
    COT_SITE_ADDRESS=tanks.example.com
    COT_TURN_HOSTNAME=turn.example.com
    COT_TURN_EXTERNAL_IP=203.0.113.10
    COT_TURN_URLS=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp
    COT_TURN_SHARED_SECRET=replace-with-a-long-random-secret

Start every service:

    docker compose --env-file .env -f compose.selfhost.yaml up --build -d

Open TCP 80/443, TCP/UDP 3478, and UDP 49160–49200. Caddy terminates web TLS
and routes `/api/signal`, `/api/ice`, `/ranked/*`, and `/match` to the bundled
services. coturn uses the same REST shared secret as the signaling service, so
the browser receives only expiring credentials. The single-process signaling
store requires no Redis; Redis remains an optional horizontal-scaling adapter.
The local default is `http://localhost:8080`; internet relay verification still
requires a public TURN address rather than `localhost`.

Production private rooms automatically request short-lived credentials from
`/api/ice`. For a fully self-hosted deployment, configure coturn with
`use-auth-secret` and supply the same shared secret to the application:

    COT_TURN_URLS=turn:turn.example.test:3478,turns:turn.example.test:5349
    COT_TURN_SHARED_SECRET=replace-with-coturn-static-auth-secret
    COT_TURN_USERNAME=cot

The endpoint generates expiring HMAC credentials locally and makes no hosted
provider request. As an optional managed alternative, configure Cloudflare
Realtime TURN:

    COT_CLOUDFLARE_TURN_KEY_ID
    COT_CLOUDFLARE_TURN_API_TOKEN

For fixed credentials or another provider, use a JSON array of ICE servers:

    COT_TURN_ICE_SERVERS_JSON

`COT_TURN_TTL_SECONDS` controls the self-hosted or Cloudflare credential
lifetime (clamped to one hour through one day; default eight hours).
`VITE_ICE_CONFIG_URL` is only needed when credentials are served from
a different endpoint. Long-lived provider secrets must never use the `VITE_`
prefix or enter the browser bundle.

Before certifying private rooms in production, check both service surfaces:

    curl -fsS https://cot.kevinliu.studio/api/signal
    curl -fsS https://cot.kevinliu.studio/api/ice

Or run the release gate, which validates both responses, then gathers a real
relay candidate in a pristine browser using relay-only ICE policy:

    npm run net:prod:check

The signaling response must report a ready command store. The ICE response
must be HTTP 200 and include at least one `turn:` or `turns:` URL, and the
browser must obtain a relay candidate from those credentials. A 503, direct-only
fallback, or unusable TURN credential cannot reliably connect friends behind
restrictive NATs. Use `--dependency-only` solely to diagnose endpoints; it is
not release evidence.

## Fast validation

Run the complete Node self-test suite:

    npm test

Run strict TypeScript validation for migrated modules:

    npm run typecheck

The application, Vercel middleware, Vite configuration, and browser tooling
are strict TypeScript. `allowJs` is disabled, so a JavaScript application module
cannot silently re-enter the checked graph. The migration remains
ownership-based: extract one coherent owner, define its public contract, add a
focused self-test, and preserve behavior before widening the boundary. Do not
rename a large file and suppress checking. The durable migration policy and
terminal checked boundary are recorded in `docs/DECISIONS.md`; completed
per-file migration receipts remain available in Git history instead of the
public documentation tree.

The same command also rejects unused symbols in the composition root and the
application, network, simulation, interface, engine, FX, audio, and top-level
world owners. Procedural fleet builders and declarative map callbacks remain a
separate cleanup lane because their intentionally uniform factory signatures
must be changed family-by-family with geometry receipts, not mechanically.

Node CLI, generator, and self-test entrypoints intentionally retain `.mjs`
where they are executable harnesses rather than shipped application modules.
They import the checked TypeScript owners directly and are covered by the
ordered test inventory.
Root-level standalone tools must be invoked by a package command, cited by the
development manuals or another tool, or included in the small maintained-rig
set enforced by `public-repo-hygiene.selftest.mjs`. One-off visual experiments
and superseded probes remain available through Git history instead of shipping
in every public checkout.
Generators must preserve typed output: `tools/map-thumbs.mjs`, for example,
writes `src/ui/mapThumbs.ts` so regeneration cannot restore a deleted `.js`
owner.

This covers performance instrumentation, renderer recovery helpers, audio,
protocol validation, browser bridge behavior, reliable presentation events,
room invites and reconnect, local prediction, adverse delivery, ranked
clients/services, signaling, world collision, match pacing, movement, combat,
spotting, bots, game state, equipment, consumables, mobile aim, vehicle
contracts, world destruction, interface contracts, and track geometry.
The ordered inventory lives in `tools/selftest-suites.mjs`; package scripts
invoke the small `tools/run-selftests.mjs` runner instead of embedding hundreds
of shell commands.

### Fast checks (2026-09-15)

A full run of the 1,024 receipts costs about 100 minutes of child CPU (the fleet
sweeps each rebuild all 181 tanks), and the release check used to stop at the
first failing receipt, so one broken pin cost a 40-minute re-run. Three things
changed, none of which relaxes an assertion:

- **Result cache.** `tools/selftest-cache.mjs` derives every input a receipt can
  observe — its import graph (static, re-exports, `import('…')`, template dynamic
  imports pull in their directory), the files it names (`new URL(…,
  import.meta.url)`, `join(here, '..', 'x')`, repo-rooted and dev-server paths,
  paths listed inside JSON contracts it reads), the directories it lists, and,
  for receipts that spawn children, list directories or drive the app in a
  browser, the whole `src/ tools/ server/ public/ docs/` trees — plus node's
  version, `package-lock.json` and the runner itself. When every input is
  byte-identical to the receipt's last PASS the runner prints `SKIP <file>: N
  inputs unchanged since PASS at <time>` instead of running it. The record lives
  under `node_modules/.cache/cot-selftests/` (per worktree, never committed).
  `COT_SELFTEST_CACHE=0 npm test` runs everything (`--all` does the same for a
  single `node tools/run-selftests.mjs <group> --all`; npm hands extra arguments
  only to the `test` script, not to `pretest`/`posttest`); delete the directory to
  forget every pass.
- **Every failure in one run.** A failing receipt no longer stops its group; the
  runner keeps going, names each failed file, and exits with the earliest one's
  status. `COT_SELFTEST_FAIL_FAST=1` restores stop-at-first-failure. A child that
  dies to a signal still ends the suite.
- **Staged release check.** `tank:release:check` runs the load-sensitive scoring
  (standard → sealed → fidelity) serially, then the fleet probes, the receipt
  suite and the production build concurrently (four at a time; GPU children still
  serialise through the capture queue).

Build the public artifact:

    npm run build

The public build runs Vite with public mode and then strips quarantined
comparison assets.

Build the private artifact:

    npm run build:private

The private build retains local authoring and comparison resources required by
internal workflows.

### Re-basing frozen digests after an intended fleet-wide change (2026-09-22)

Many receipts freeze whole-model or material-inclusive digests of hulls (`tankFactoryStaging`, `sourceXFleet`,
`sourceX*AuxArmor`, `equipmentDamage`, `wrecks`, the preservation ledgers…). They are change detectors: after an
intended fleet-wide geometry change (a wheel standard, a muzzle rebuild, a camo density) dozens move at once, and
the new values can only come from the receipt's own measurement of the current build.

- `node tools/receipt-repin.mjs <receipt>` runs one receipt, reads node's assert diff, rewrites exactly the literal
  the diff names (quoted digests, the numbers of a `[digest, count]` tuple on the digest's own line, or a flat
  numeric array compared with `deepStrictEqual`), and re-runs until the receipt passes or fails for a non-literal
  reason, which it reports and leaves alone. `--dry` shows the plan; `--from-log=<run-selftests log>` processes
  every receipt the log reports as FAIL. Review the diff — the tool never invents a value, but the author decides
  that the move was intended — and commit the re-pins with a dated note naming the change.
- Digests that live in a `*.test-support.mjs` or a `docs/references/**/*.json` ledger are re-pinned there, not in
  the failing receipt (the ledgers have their own `COT_UPDATE_LEDGER=1` update mode).
- Rehearse a combined round in a detached worktree at the target `origin/main` with every branch cherry-picked,
  run the receipt groups there (`node tools/run-selftests.mjs pre|core|post`), and re-pin on that tree. Goldens
  that seat on regenerated artifacts (`tankFactoryStaging` reads the rendered presentation anchors) only move
  after the regeneration chain, so run `node tools/presentation-centering.mjs --update` in the rehearsal tree
  before the suite whenever running gear or hull silhouettes changed, and drop that churn before committing.
- Parallel agents must not each re-pin the same shared digest receipts: two branches that re-pin the same file
  conflict on every landing and the combined tree needs a third re-pin anyway. One owner re-pins them once on the
  combined tree; feature branches re-pin only receipts specific to their change.
- A probe ray that lies exactly on a mesh's radial seam (angle 0 of a ring or fan) can miss both coplanar
  triangles after a world transform through floating-point error, and a since-removed duplicate surface may have
  been catching it. Sample receipt rays off the seam (as `physicalMuzzleBore.ts` does with angle .173).

## Verification matrix

| Change area | Minimum checks |
| --- | --- |
| Documentation only | Link/path audit, npm run build |
| Movement or tracks | npm test, track geometry self-test, relevant browser probe |
| Ballistics, armor, damage, spotting | npm test |
| Vehicle specification or geometry | targeted assets, release check, native check |
| Network protocol or room lifecycle | npm test, npm run test:net:browser |
| Network presentation/performance | npm test, test:net:browser, test:net:render |
| Renderer, quality, transitions | npm test, public build, cold/performance probe |
| Landing page or public docs | public build, desktop and mobile browser inspection |
| Scene Studio | Studio self-test and affected capture pipeline |
| Signaling/ranked service | npm test plus service-specific integration test |

Risk can require more than the minimum. A build passing does not replace a
behavioral test, and a screenshot does not replace a simulation invariant.

## Multiplayer browser verification

Run:

    npm run test:net:browser

The rig starts signaling, Vite, and two Chromium peers. It exercises room code
creation/join, host policy, team and spectator switching, same-vehicle identity
separation, WebRTC handoff, authoritative movement, adverse delivery, and clean
departure.

Entry-link verification:

    npm run test:net:entry

Private/LAN room failures and recovery:

    npm run test:net:errors
    npm run test:net:host-loss
    npm run test:net:host-stall

The error fixture checks real menu/native signaling on desktop and mobile,
explicit retries, terminal membership errors and stale acquisition cleanup.
The full-application entry rig reloads a real guest, then tests host departure
or a frozen authority with the RTC channel still open. It requires bounded
Garage restoration, visible error controls, cleared invites, no fabricated
progression and zero browser errors. The default entry case interrupts a cold
reload. These local rigs clean up only their own browsers/servers; they do not
certify a production endpoint or restricted-network relay connectivity.

Network render and destruction-burst performance:

    npm run test:net:render

Use deterministic network impairment during manual QA:

    ?netSim=1&netLatency=120&netJitter=40&netLoss=10&netdiag=1

The latency value is one-way. Replaceable snapshots can be dropped without
making the ordered control channel unreliable.

## Vehicle verification

Audit runtime provenance:

    npm run tank:native:check

Regenerate presentation assets:

    npm run tank:assets

Verify generated assets and live fingerprints:

    npm run tank:assets:check

Verify fleet ordering:

    npm run tank:family:check

Verify the recorded geometry freeze:

    npm run tank:freeze:check

Run a targeted release check:

    npm run tank:release:check -- --ids=<tank-id>

The target check covers generated assets, muzzle bore, geometry standards,
tests, and private build. See TANK-ASSET-PIPELINE.md and BUILD-STANDARD.md for
the complete vehicle-authoring contract.

## Performance verification

Cold-load probe:

    npm run perf:cold
    npm run perf:resources
    npm run perf:resources:gate

Repeat the cache-disabled first visit across four weak-device sessions while
retaining the failed-download and failed-evaluation recovery gates:

    npm run perf:cold -- --sessions 4 --cpu 8 --down-kbps 800 --up-kbps 300 --latency 250 --summary 1

Each session uses a new browser context with the HTTP cache disabled. Do not
substitute repeated navigations in one context; those measure a warm cache.

Garage/battle transition responsiveness:

    npm run perf:transitions

The transition gate fails independently on total load duration and the worst
main-thread frame gap, and refuses certification under detected host/GPU
contention. Run the exhaustive route matrix with `npm run perf:loading`.

Rendered shadow and temporal-stability release audit:

    npm run build
    npx vite preview --host 127.0.0.1 --port 5173 --strictPort
    agent-browser --session cot-shadow-audit open \
      'http://127.0.0.1:5173/?nosplash=1&tier=desktop&diagforce=1'
    node tools/render-stability-audit.mjs cot-shadow-audit
    node tools/map-shadow-audit.mjs cot-shadow-audit
    agent-browser --session cot-shadow-audit close

The first probe drives a live tank and camera through every quality preset and
checks snapped cascade alignment plus the post-composed temporal-occlusion
frame. The second visits every battlefield and rejects stale shadow depth,
tree-fade/contact regressions, compile frames, and unstable frame tails. Audit
receipts are transient `.qa-dev` evidence and must not be committed.

Development flight recorder:

    npm run perf:dev

The flight recorder supports normal, constrained, and software-renderer
profiles. See DEV-PERF-TRACE.md for output schema and probe procedure.

Press F3 in the game for live render and network diagnostics. Add diag=1 to the
query string for boot render health.

Do not compare frames per second without recording viewport, device pixel
ratio, quality tier, render scale, browser, scene, and whether diagnostics were
open.

## Scene Studio and public images

Open Studio:

    /studio

or press F8 in the garage.

Run the Studio self-test:

    node tools/studio-selftest.mjs

Regenerate the modern landing-page scene definitions:

    node tools/marketing-shots/gen-modern-showcase.mjs

Capture them through the live Studio renderer:

    node tools/marketing-shots/shoot.mjs \
      --scenes tools/marketing-shots/scenes-modern \
      --out shots/marketing-modern/raw \
      --width 1600

Encode the deployable set and manifest:

    node tools/marketing-shots/encode-modern-showcase.mjs

The checked-in scene JSON is the source. Deployable WebP images are output, not
hand-edited inputs.

Generate and validate the 60-frame 4K battle campaign:

    npm run shots:battle:generate
    node tools/marketing-shots/battle-campaign.selftest.mjs
    npm run shots:battle:grade

The 30 close action scenes and 30 foreground-led scenes use separate checked-in
directories and require contact-sheet review before the 4K image gate. See
[MARKETING-BATTLE-CAMPAIGN.md](MARKETING-BATTLE-CAMPAIGN.md) for capture commands
and acceptance criteria.

## Tank Gallery markup

Start:

    npm run tank:gallery

Open the Markup layer, use repeatable camera views, and export JSON plus a
matching PNG. The JSON records selected geometry and articulation ownership.
See GALLERY.md.

## Public and private build boundary

The public artifact must:

- contain all playable first-party vehicles;
- exclude quarantined non-commercial comparison assets;
- preserve the game, home, docs, and Studio routes intended for deployment;
- keep non-game routes from preloading the game graph;
- contain no development trace instrumentation.

The private artifact may retain authoring/comparison inputs used by local
verification.

## Documentation changes

Current documentation has three layers:

1. README.md: public technical overview.
2. docs.html and FEATURES.md: public field manual and feature evidence.
3. SYSTEMS.md plus subsystem guides: internal architecture and operations.

Update the nearest authoritative document when behavior changes. Do not add
new behavior only to a historical ledger or critique. If a source-level module
comment describes ownership or invariants changed by the edit, update it in
the same change.

Run a path and link audit:

    node - <<'NODE'
    const fs = require('fs');
    for (const file of ['README.md', ...fs.readdirSync('docs')
      .filter(name => name.endsWith('.md')).map(name => 'docs/' + name)]) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
        const target = match[1];
        if (/^(https?:|mailto:|\/)/.test(target)) continue;
        const path = require('path').resolve(require('path').dirname(file), target);
        if (!fs.existsSync(path)) console.error(file + ': missing ' + target);
      }
    }
    NODE

## Release checklist

Before a production release:

1. Confirm the worktree contains only intended changes.
2. Run npm test.
3. Run the targeted subsystem checks from the matrix.
4. Run npm run tank:native:check when fleet or build boundaries changed.
5. Run npm run test:net:browser when networking or room behavior changed.
6. Run npm run build and npm run build:private.
7. Inspect the game, home, and docs routes at desktop and mobile widths.
8. Verify no browser console errors or missing public assets.
9. Confirm production service endpoints and environment variables.
10. Record any new operational limitation in the authoritative subsystem doc.

## Where to continue

- FEATURES.md: visible product capabilities
- SYSTEMS.md: internal runtime ownership
- MULTIPLAYER-ARCHITECTURE.md: protocol, rooms, services, and trust
- PERFORMANCE.md: render/load/per-frame performance design
- STUDIO.md: Scene Studio API and determinism
- TANK-ASSET-PIPELINE.md: generated vehicle asset contract
- INDEX.md: complete documentation map
