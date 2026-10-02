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
   `node tools/gate.mjs --baseline=<starting-base>` runs all of it in one
   versioned command (below).
   Record the validated commit. An earlier branch's green result does
   not certify conflict resolution or later source edits. For geometry, use
   the complete anatomy and targeted release procedure in `AGENTS.md`.
   A combined tree that changes a map's structures, kits, roads or terrain
   must recapture that map's dedicated collision shard ON THAT TREE
   (`tools/capture-world-collision-manifests.mjs`, or the headless
   `.qa-dev/collision-capture.mjs` variant) and re-pin the census and storage
   receipts: `dedicatedWorldCollision.selftest` pins record counts only, so a
   lane's stale shard passes silently (round 48, 2026-09-24: Amberford's
   round-1 village haunted the dedicated bots on the new terrain and
   `server/battlePacing.selftest` went red).
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

### The versioned gate: `tools/gate.mjs` (2026-10-01)

Codex, Claude and CI run the same gate from the checkout under test. It replaces the gate half of
the generated landing chain (`.qa-dev/landing/gen-chain.py` writing `release-then-deploy-*.sh` into
a session scratchpad), which was not versioned and was lost once with a scratchpad.

    node tools/gate.mjs                                # typecheck, build, i18n, budget, workers, receipts, preflight
    node tools/gate.mjs --baseline=<starting-base>     # stop the line (below)
    node tools/gate.mjs --steps=typecheck,build,workers   # a subset, in the canonical order; --skip=<steps> removes some
    node tools/gate.mjs --only='src/vehicles/**'       # receipt selection passes through: --shard=i/n, --all, --order=registry
    node tools/gate.mjs --dry-run                      # print the plan, run nothing

- **build** is `npm run build`; its prebuild runs `npm run i18n:validate`, so **i18n** adds only
  `tools/i18n-scan.mjs --check`, the other half of `npm run i18n:check`.
- **budget** runs `tools/bundle-budget.mjs` once that file exists and is skipped until then.
- **workers** runs the `typecheck` and `test` scripts of every `cloudflare/*/package.json` (rooms and
  telemetry). They were in no gate before: the rooms typecheck was red on main for days unseen.
  A missing Worker install fails with the `npm ci --prefix cloudflare/<name>` to run; `--install`
  runs it.
- **receipts** is `tools/run-selftests.mjs all` with one log per receipt (`--logs`).
- **preflight** runs `tools/shared-main-preflight.mjs` for the validated HEAD with `--base`
  (default: the merge-base with `origin/main`) and `--reviewed-main` passed through; in place when
  the checkout is clean, otherwise in a reusable detached worktree of HEAD. HEAD moving or a tracked
  change during the gate fails it. The gate never fetches: fetch and integrate first (step 1).

The gate stops at the first red step (`--keep-going` runs the rest) and writes `gate.json` and
`gate.md` to `--out` (default `<tmp>/cot-gate/<time>-<sha>`). It never pushes, deploys, fetches or
changes a setting; publishing and deploying stay separate steps.

**Stop the line (`--baseline=<ref>`, gate audit P2).** Every receipt red here runs again alone, on this
tree and on a temporary worktree of `<ref>` at the same time (holding the capture lease like any
receipt run). It counts as **inherited** only when both fail with the same first error: the process's
own uncaught error after Node's source caret, its message lines and the asserted `actual`/`expected`,
with checkout paths, temporary directories and millisecond timings normalised. A differing pair runs
once more to tell an **unstable** baseline message from a **changed** one. A receipt that passes on
`<ref>` (or does not exist there) is a **regression**; regression and changed stop the gate and
`gate.md` shows both messages. A receipt that passes alone here is **flaky** under the suite's load.
Flaky and unstable are reported and block only with `--strict`. This replaces the exit-status
comparison of 2026-09-30 (below), which let a new defect inside an old red pass.

`.github/workflows/ci.yml` runs the static steps (`typecheck`, `build`, `i18n`, `budget`, `workers`)
through this gate on every pull request and push to main, on a blobless sparse checkout without
`public/media`, `public/icons`, `public/maps` and `docs/references` (the build reads none of them). It
has no secrets and no deploy; a receipts job follows once main is green.

### Releasing: `tools/release.mjs` (2026-10-01)

The deployment owner releases a gated commit with the versioned tool instead of the scratchpad
`deploy-prod-main.sh`; [DEPLOYS.md](DEPLOYS.md) keeps the policy and the ledger.

    node tools/release.mjs build <sha>       # worktree of <sha>; npm ci; vercel pull; vercel build --prod; immutable routes
    node tools/release.mjs deploy <sha> --title="deploy N: <title>"   # vercel deploy --prebuilt --prod, then verify
    node tools/release.mjs verify <sha> --sweep   # served stamp names <sha>; every chunk 200; a missing chunk uncacheable
    node tools/release.mjs rollback [--to=<deployment>]   # promote the deployment before the live one
    node tools/release.mjs workers <sha> [--only=rooms]   # npm ci, typecheck, test, wrangler deploy --tag/--message <sha>
    node tools/release.mjs <command> ... --dry-run   # print every command; run nothing (no Vercel, wrangler or network)

- `build` deletes the pulled `.vercel/.env*.local` files in a `finally` block, whatever happens. The
  only edit to them is dropping the redacted `VITE_*="[SENSITIVE]"` lines (see "Redacted public
  settings" below); secrets are never printed or changed.
- The build's own install rewrites `package-lock.json`; the tool restores it and refuses a tree with
  other tracked changes, so the stamp is never `.dirty`.
- `deploy` attaches the branch-link metadata (`githubCommitSha`, `githubCommitRef=main`, the subject
  or `--title`, the repository ids) and then waits for the served `application-version` to name the
  commit. Append the DEPLOYS.md row by hand: number, time, sha, title, served bundle, deployment id.
- `rollback` uses `vercel promote`, which also turns production-domain auto-assignment back on; a
  plain `vercel rollback` leaves it off, so the next prebuilt deploy would not go live.
- Scope: `--scope` or `COT_VERCEL_SCOPE` (default `kl01s-projects`). The `vercel` on PATH (or
  `COT_VERCEL_BIN`) must be the pinned major version (`VERCEL_CLI_MAJOR`).
- Worker rollbacks are `npx wrangler rollback` in the Worker's directory; never across a Durable
  Object migration tag.

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

### Capture-lock wait (2026-09-25)

The selftest runners wait for the shared capture lock (`/tmp/cot-shots.lock`, FIFO tickets in `/tmp/cot-shots.queue`) before their browser receipts; `COT_SHOTS_LOCK_TIMEOUT_MS` sets that wait (default 45 min — chain 94 died at 1/413 behind another session's browser audit, so landing chains export three hours).

### The rooms Worker's TypeScript program (2026-09-28)

`cloudflare/rooms/tsconfig.json` compiles the Worker with `lib: ["ES2022"]` and no DOM, and a **type-only** import still joins a
file to the program. `npm run typecheck:rooms` was red on main for days (445 DOM errors in `src/engine/deviceDiag.ts`) because
`src/mp/room/roomPolicy.ts` imported `resolveMapId` from `src/world/maps/catalog.ts`, whose `import type` chain runs
contracts → terrain → maps/horizon → engine/sky → engine/deviceDiag — and the release chains run only the app typecheck. The
identity slice (ids, names, the random rotation, the resolvers) now lives in `src/world/maps/mapIds.ts`; `catalog.ts` re-exports
it for the browser. `src/mp/room/roomWorkerProgram.selftest.mjs` walks the Worker's import graph (value and type imports) and
fails on any renderer-facing module, then runs `npm run typecheck:rooms` when `cloudflare/rooms/node_modules` is installed
(`npm ci --prefix cloudflare/rooms` — do it in the gate worktree; without it the receipt says so and only the graph check runs).
A network module that needs something from the world takes a DOM-free slice like `mapIds.ts`, never the catalog.

### Self-leasing browser receipts (2026-09-26)

`tools/run-selftests.mjs` holds the capture lease around every browser receipt and refreshes it every 30 s. A receipt that
takes the lock ITSELF (`createCaptureLock().acquire()` in the receipt — the Garage switch probe's part 2, the `*.browser.selftest`
files that own their lease) must be listed in `SELFTEST_OWNED_LEASE_FILES`, or the runner keeps the lease while the child queues
on the same lock: a deadlock that only ends at the 3 h chain timeout (chains 96 and 106 lost 76 and 80 minutes to it — the tell
is a receipt at 0 % CPU with one ticket in `/tmp/cot-shots.queue` and the lock directory's mtime ticking every 30 s). The list is
pinned in `tools/run-selftests.selftest.mjs` (the `actual-registry` count and the barrier loop). A load gate read before a lock
wait is stale by the time the lock arrives — re-read it after `acquire()` and skip the same way, releasing the lock.

### Asset caching (2026-09-25)

**Asset caching (2026-09-25).** Vite emits content-hashed files under `/assets/`. Do NOT add a header rule for `/assets/(.*)` in `vercel.json`: a `headers` rule applies to every response on the path including a 404, and Vercel's edge then caches that 404 for the rule's lifetime — under deploy 89's immutable rule one transient miss during a promotion became a permanent "A game file failed to download" for every player on that edge node (`tools/vercel-config.selftest.mjs` and `src/gallery/chunkRecovery.selftest.mjs` refuse the rule). The year-long header comes from the deploy step instead: `node tools/vercel-output-immutable.mjs` runs between `vercel build` and `vercel deploy --prebuilt` and writes immutable, case-sensitive header routes for exactly the hashed files that exist in `.vercel/output/static/assets` (groups of 40 names per route, ahead of the filesystem handle; `--check` verifies coverage; `tools/vercel-output-immutable.selftest.mjs`). A path that is not in the build matches no rule, keeps Vercel's default `public, max-age=0, must-revalidate` answer and heals on the next request; documents, `/maps` and `/minimaps` keep that default too. Deploy 94 also re-encoded every chunk hash as base36 (`build.rollupOptions.output.hashCharacters`), so every `/assets` URL changed once and an edge node that had cached 404s for deploy-93 chunks (a browser's boot-retry loop during the promotion, answered by the old config) never serves them again. Every deploy's verify step then sweeps the served index's chunks (all must answer 200), checks that a missing `/assets` path is not cacheable and boots the alias headless before the DEPLOYS.md row is written.

## Development services

Private and LAN matches run in the host commander's browser over WebRTC; the room (seats, readiness, signaling relay,
host election and migration) is a Room Durable Object in production (`cloudflare/rooms`) and, on a LAN or offline, the
local helper:

    npm run server:mp

`server/rooms/main.ts` serves rooms on port 8792 and runs the match in-process by default
(`COT_ROOMS_MATCH_TRANSPORT=p2p` hosts it in the admin's browser like production). Browsers on the network open the
game, choose LAN in the Play menu, and `src/mp/session/endpoint.ts` resolves the room host to that port. Nothing
needs Redis, a dedicated game server or a ratings database; the first multiplayer's signaling function and dedicated
services left the tree with the cutover of 2026-09-29 (`docs/MULTIPLAYER-V2.md` §13.10).

The Jev commander (the Play menu's "Opponent brain: Jev", `docs/JEV-COMMANDER.md`)
needs the `/api/jev` function, which the dev server does not run. Start the local
proxy in a shell that holds the TypeSafe key (`set -a; source …/typesafe.env; set +a`
— never a file in the repository, never a `VITE_` variable):

    npm run jev:dev

It listens on http://127.0.0.1:8794/api/jev and the dev server forwards the same-origin
route to it (`COT_JEV_DEV_URL` to point elsewhere, `VITE_JEV_URL` to bypass the
route). With the proxy down a battle simply plays on the classic brain.

### Hosting

Internet rooms use the rooms Worker (`cloudflare/rooms/README.md` deploys it on the Free plan; `VITE_ROOMS_URL` names it
on a build, the official site resolves it from `src/officialHost.ts`). There is no self-hosted compose stack any more:
a self-host needs the static site, the rooms Worker (or the LAN helper on a reachable host) and a TURN relay.

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

Before certifying private rooms in production, check the room Worker and the ICE endpoint:

    curl -fsS https://cot-rooms.kk23907751.workers.dev/healthz
    curl -fsS https://cot.kevinliu.studio/api/ice

Then run the three-browser proof against the deployed site, the only origin the Worker admits:

    node tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio

The health must answer `{ ok, backend: durable-object, matchHost: p2p }`. The ICE response
must be HTTP 200 and include at least one `turn:` or `turns:` URL, and the
browser must obtain a relay candidate from those credentials.  
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
the wire codecs, the room protocol, the match client and its presentation,
reliable events, room invites and reconnect, local prediction, adverse
delivery, the browser host and host migration, world collision, match pacing,
movement, combat,
spotting, bots, game state, equipment, consumables, mobile aim, vehicle
contracts, world destruction, interface contracts, and track geometry.
The ordered inventory lives in `tools/selftest-suites.mjs`; package scripts
invoke the small `tools/run-selftests.mjs` runner instead of embedding hundreds
of shell commands.

### Test gate and result reuse (2026-09-28)

`npm test` considers every registered check in one invocation. `npm run test:all`
(or `npm test -- --all`) bypasses result reuse for **every** group. The former
pretest/test/posttest lifecycle applied extra npm arguments only to the middle
group. Individual groups remain available as `node tools/run-selftests.mjs pre`
(or `core` / `post`).

`npm run test:plan` lists which checks must run, which can reuse a PASS, and why.
Use `npm run test:plan -- --changed=src/engine/quality.ts,docs/DEPLOYS.md` to inspect
input impact; this is an explanation, never permission to omit an unproven check.
Every completed invocation writes counts, individual execution times, queue wait,
failures and reused results to `node_modules/.cache/cot-selftests/latest-run.json`.
`--report=/absolute/path.json` chooses another output. Queue time is reported
separately from test execution time so resource contention is not mistaken for
slow game code.

Result reuse is based on source syntax and file contents:

- Runtime imports, exports and dynamic import directories are followed,
  including dependencies outside those directories. Query suffixes resolve to
  the real file. Type-only imports remain the typecheck's responsibility.
- Source text read for an assertion is a data input; its imports are not
  executed. JSON-listed files, static paths and templated asset directories are
  tracked. Opaque process/listing operations retain conservative directory inputs.
- Files and directory members are content hashed. Timestamp-only checkout changes
  preserve a proof; different bytes with the same size and timestamp invalidate it.
  A missing named input becoming present also invalidates the proof.
- Observed environment variables, Node version, platform, dependency lock and
  dependency-parser implementation participate in the key. Unresolved computed
  imports/environment, browser state, Git state, and the registered timing/heap
  checks require fresh execution. A source-only cached result cannot certify GPU
  output or current timing.
- Content-addressed PASS records are shared between this repository's worktrees
  and clean release clones on the same machine, in the user's temporary cache.
  `COT_SELFTEST_CACHE_DIR` can isolate them. `COT_SELFTEST_CACHE=0` disables reuse.
  Version-1 records are not trusted after the dependency bugs found in this audit.
  Suite registration/order is not a global reason to rebuild unrelated vehicles.

The 2026-09-28 audit found a comment mentioning Puppeteer that falsely expanded
input handling's dependency scope to the whole repository, missing query-suffixed
imports (including the graphics-quality contract), timestamp-based directory keys,
and missed imports outside dynamically loaded directories. Negative fixtures now
exercise each case. The impact plan reduces deployment-note invalidation from
roughly 500 checks to 161 on this revision; fresh environmental checks are additional.
This is a dependency count, not a claim about elapsed time on a busy host.

The wheel-quality, machine-gun attachment and track end-wrap inspections share one
unbatched HIGH tank build per roster member: 594 constructions become 198 on this
fleet. Their 41 original assertions remain, with a detached-mount negative control
and the end-wrap audit's original broken-station controls and 3/5 mm limits. Both
rosters are retained; the mount inspection keeps its authored camo seed, which
does not move the running gear. The ERA depletion test
keeps its independent LOW build because it mutates geometry. Source-shape guards,
functional simulation tests and real visual checks still make different claims:
a source regex does not prove a rendered result. The full gate inventory is not a
substitute for the map/contact, shadow-motion and real Garage/battle review.

**Scheduling, selection and cache identity (2026-10-01).** Only the order and the batching of the
work changed; every selected receipt still runs every assertion in a fresh process.

- A lease batch older than 45 s yields (drains, releases, re-queues) only while another acquisition
  waits in the capture queue; with nobody queued the batch window restarts and the lease is
  refreshed, never released (gate P5). The pool logs how often it renewed and yielded.
- The pool admits the barrier receipts (exclusive CPU and self-leasing browser checks) first, then the
  rest longest-first by the last observed run time (gate P7). Receipts with no observation take the
  90th percentile; `--order=registry` restores registry admission. The registry order stays the
  reporting order: the earliest registry failure supplies the exit status. Run times live in
  `runtimes.json` beside the proofs (built once from the newest PASS record per receipt, then updated
  by every ordinary PASS or FAIL). A replay of the real pool on the audit's medians: cold 24.2 min ->
  18.1 (P5) -> 15.4 (P5+P7).
- `--only=<glob>[,<glob>]` selects registry entries (`**`, `*`, `?`, `{a,b}`, a trailing `/` for a tree;
  matching nothing exits 2). `--shard=i/n` runs one of n deterministic shards balanced by the
  committed snapshot `tools/selftest-durations.json`, so separate CI jobs derive the same partition
  (the report records its fingerprint). Regenerate the snapshot with
  `node tools/run-selftests.mjs --write-durations` after a full run; a stale entry only unbalances.
- `--logs=<dir>` writes each receipt's output to `<dir>/<receipt>.log` (a file descriptor, never a
  pipe); `tools/gate.mjs` uses it to quote each red receipt's first error.
- The proof store is keyed on the repository's root commit instead of the origin URL, so a renamed
  remote no longer cold-starts every proof. The first run links the new directory to the URL-keyed
  one, so existing proofs keep counting (`tools/selftest-cache-dir.mjs`; a shallow clone keeps the URL
  key). These live outside `tools/selftest-cache.mjs` on purpose: that file salts every proof key.

The runner retains bounded CPU workers, fresh child processes, fair capture-queue
batches and exclusive browser/timing checks. It reports every ordinary failure in
one run; `COT_SELFTEST_FAIL_FAST=1` opts into stopping early. No assertion threshold
was loosened to gain speed. A first run after changing the proof format is cold;
later runs reuse only matching successful evidence.

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
| Network protocol or room lifecycle | npm test, npm run test:net:v2:rooms, npm run test:net:v2:p2p |
| Network presentation/performance | npm test, test:net:v2:p2p, test:net:v2:p2p:soak |
| Renderer, quality, transitions | npm test, public build, cold/performance probe |
| Landing page or public docs | public build, desktop and mobile browser inspection |
| Scene Studio | Studio self-test and affected capture pipeline |
| The rooms Worker | npm test plus `npm run test:net:v2:rooms` |

Risk can require more than the minimum. A build passing does not replace a
behavioral test, and a screenshot does not replace a simulation invariant.

## Multiplayer browser verification

Run:

    npm run test:net:v2:p2p

The rig starts one Vite dev server, the room signaling double and three pristine headless Chromes with real WebRTC: A
creates a LAN room, B and C join through the invite link, everyone readies, A starts and hosts the match in a Worker,
B and C play over data channels, A closes its tab, the room elects B after the host grace, C follows, A returns as a
peer (`tools/mp-p2p-e2e.mjs`; `--site=https://cot.kevinliu.studio` runs it against production). `npm run
test:net:v2:browser` is the two-browser exit-flow rig on the in-process room host; `npm run test:net:v2:p2p:soak` the
28-seat soak on `wrangler dev`; `npm run test:net:v2:rooms` the Worker under the Workers runtime.

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
2. Run `node tools/gate.mjs --baseline=<starting-base>` (typecheck, build, Workers, receipts, preflight).
3. Run the targeted subsystem checks from the matrix.
4. Run npm run tank:native:check when fleet or build boundaries changed.
5. Run npm run test:net:v2:p2p when networking or room behavior changed.
6. Run npm run build and npm run build:private.
7. Inspect the game, home, and docs routes at desktop and mobile widths.
8. Verify no browser console errors or missing public assets.
9. Confirm production service endpoints and environment variables.
10. Record any new operational limitation in the authoritative subsystem doc.

## Where to continue

- FEATURES.md: visible product capabilities
- SYSTEMS.md: internal runtime ownership
- MULTIPLAYER-V2.md: the rooms Worker, the wire, the host, the client, and trust
- ENTRY-RESILIENCE.md: first-visit telemetry beacon, capability gate, download-aware boot watchdogs, entry failure surfaces
- PERFORMANCE.md: render/load/per-frame performance design
- STUDIO.md: Scene Studio API and determinism
- TANK-ASSET-PIPELINE.md: generated vehicle asset contract
- INDEX.md: complete documentation map

### Build-time constants and Vercel's sensitive variables (2026-09-28)

Vercel stores this project's environment variables as *sensitive*: `vercel pull` writes them as the literal
`[SENSITIVE]`, so the once-per-round CLI build inlines that placeholder wherever `import.meta.env.VITE_*` is read
(deploy 114 shipped `resolveRoomsUrl({ configured: '[SENSITIVE]' })`; telemetry had silently fallen back to
`/api/telemetry` for the same reason). Public deployment facts therefore live in `src/officialHost.ts`: a page
served from `cot.kevinliu.studio` resolves its rooms Worker and telemetry sink by name; a configured `VITE_ROOMS_URL`
/ `VITE_TELEMETRY_URL` still overrides them, an unusable value counts as unset, and other hosts keep their local
defaults (`src/mp/session/endpoint.selftest.mjs`, `src/entry/telemetry.selftest.mjs`). Secrets never take this route.

### Redacted public settings and the CLI deploy (2026-09-29)

`tools/publicBuildEnv.ts` (1043e50f4) makes `vite build` refuse a `VITE_*` value equal to Vercel's redaction marker
`[SENSITIVE]`, which is what `vercel pull` writes for this project's sensitive variables. The once-per-round CLI deploy
therefore drops those lines from the pulled `.vercel/.env.production.local` (and `.env.local`) before `vercel build`:
an unset variable means the served page resolves its Workers from `src/officialHost.ts` — the same behaviour a hosted
build with the real values would show for the official site. Secrets are never
touched by this step; only redacted browser-visible `VITE_*` lines are removed.

### Landing over another session's red (2026-09-30)

The landing chain gates on the pre → core → post receipt groups. When a receipt fails, the chain re-runs exactly that receipt on
the landing's base commit (origin/main at launch): a receipt that fails identically there is the shared main's red, not the
landing's, and the chain continues with the receipt named in the deploy row ("landed over inherited red receipts"). A receipt
that passes on the base and fails on the landing stops the chain as before. The rule exists because a session that deploys
without gating on the suite can leave main red for a day; it never lets a landing make main worse, and the named receipts stay
the repair debt of whoever broke them.
2026-10-01: an identical exit status is not an identical failure (a census drifting from 456 to 470 inside an already-red
receipt would have passed). The versioned rule compares the first error message and is `node tools/gate.mjs --baseline=<base>` (above).
