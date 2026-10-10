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
   Since 2026-10-07 (destruction, `docs/DESTRUCTION.md` §3.1) every structure record also packs its structure
   group (`g`, and `gr` for a landmark set piece): a shard captured by a tree without that packer carries no groups,
   and the host then plays every building on that map as indestructible. After merging lanes that touched maps,
   regenerate every shard on the merged tree in Node — `nice -n 15 node tools/capture-world-collision-manifests.mjs
   --node` (all maps, about an hour on a loaded machine; `--maps a,b` for some) — and confirm with `--check`; record
   order and counts do not change, only bytes and the index digests.
   Since 2026-10-08 Frontline Assault's authority plays the map's trench variant from its own shard
   (`server/world-collision-manifests/<map>@assault-trenches.json`, listed under the index's `variants`): anything
   that moves a map's records moves its variant's too, so regenerate both — `--node --variant=assault-trenches`
   (about as long again) and `--check --variant=assault-trenches`. A base recapture keeps the index's variants.
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

- **build** is `npm run build`; its prebuild runs `npm run i18n:validate` and its page catalog plugin
  runs the `tools/i18n-page-catalogs.mjs` scan, so **i18n** adds only `tools/i18n-scan.mjs --check`, the
  rest of `npm run i18n:check`.
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
`gate.md` to `--out` (default `<tmp>/cot-gate/<time>-<sha>`). Like the landing chains, it waits up to
three hours for the capture lock unless `COT_SHOTS_LOCK_TIMEOUT_MS` is set. It never pushes, deploys,
fetches or changes a setting; publishing and deploying stay separate steps.

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

    node tools/release.mjs build <sha>       # worktree of <sha>; npm ci; vercel pull; vercel build --prod; carry-forward; immutable routes
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
- **Old tabs keep their chunks (2026-10-02).** A tab opened before a deploy keeps importing the hashed
  chunks its page named; a deploy used to delete every one the new build did not emit (deploy 163: one
  tab requested a removed chunk 33,875 times in a day, 6 % of the week's requests). `build` therefore
  keeps a release cache outside git (`--asset-cache=<dir>`, `COT_RELEASE_ASSET_CACHE`, default
  `~/.cache/cot-release`): every build records its own hashed `/assets` files there, and copies the files
  of the last `--carry=<N>` releases (default 3; `--carry=0` turns it off) that it does not emit itself
  into `.vercel/output/static/assets`, newest release first and at most `--carry-max-mb=<MB>` (default
  200), before `tools/vercel-output-immutable.mjs` writes the immutable routes — so the carried files are
  immutable too. Hashed names never collide, so nothing the build emits is replaced; a release records only
  its own files, so a carried file leaves with the release that emitted it; the cache keeps the newest
  N + 1 releases and prunes everything else; a rebuild of the same commit replaces its entry (a build that is
  never deployed still occupies one slot). The output directory is removed before `vercel build`, so a reused
  worktree cannot record an earlier run's carried files as its own. A missing cache only means nothing is
  carried that time. `tools/release.selftest.mjs` drives the carry, the cap, the pruning and the lock on
  temporary directories. Collision manifests (`/mp-collision/`) are not carried: the host reads their index
  before each fetch.
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

`vercel.json` publishes them with pattern rewrites (`/docs/:topic(...)` →
`/docs-:topic.html` and the `/cn` twins; the topic list matches
`PUBLIC_ROUTE_RECORDS`). A trailing-slash form of a slashless page answers 308
to the canonical path; `/cn/` keeps its slash because it is the zh-CN game's
canonical URL, which is why there is no global `trailingSlash` setting.
`tools/vercel-routes.selftest.mjs` resolves every route through the conversion
`vercel build` runs (`@vercel/routing-utils`) against the frozen deploy-163 table.

The alias domains `claudeoftanks.kevinliu.studio` and `claude-of-tanks.vercel.app`
answer 308 to `https://cot.kevinliu.studio` with path and query (host-equality
redirects, the hosts from `api/_lib/policy.ts`); deployment URLs and the protected
production domain are untouched, so the release step still verifies a deployment
on its own URL.

Every response also carries `X-Content-Type-Options: nosniff`,
`Referrer-Policy: strict-origin-when-cross-origin`, a `Permissions-Policy` that
denies camera, microphone, geolocation, payment, USB, serial, HID and Bluetooth,
`X-Frame-Options: SAMEORIGIN` and `Cross-Origin-Opener-Policy: same-origin`
(one `/:path(.*)` header rule; 2026-10-01). The site opens no popup it talks to
(external links are `noopener`) and nothing embeds it from another origin; a
future portal or app embed needs `frame-ancestors`/XFO revisited first. There is
no enforced CSP yet: the inline scripts would need build-time hashes.

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

**Asset caching (2026-09-25).** Vite emits content-hashed files under `/assets/`. Do NOT add a header rule for `/assets/(.*)` in `vercel.json`: a `headers` rule applies to every response on the path including a 404, and Vercel's edge then caches that 404 for the rule's lifetime — under deploy 89's immutable rule one transient miss during a promotion became a permanent "A game file failed to download" for every player on that edge node (`tools/vercel-config.selftest.mjs` and `src/gallery/chunkRecovery.selftest.mjs` refuse the rule). The year-long header comes from the deploy step instead: `node tools/vercel-output-immutable.mjs` runs between `vercel build` and `vercel deploy --prebuilt` and writes immutable, case-sensitive header routes for exactly the hashed files that exist in `.vercel/output/static/assets` (groups of 40 names per route, ahead of the filesystem handle; `--check` verifies coverage; `tools/vercel-output-immutable.selftest.mjs`). A path that is not in the build matches no rule, keeps Vercel's default `public, max-age=0, must-revalidate` answer and heals on the next request; documents keep that default too. Since 2026-10-01 the same per-file routes make the content-addressed collision manifests (`/mp-collision/<map>.<sha12>.json`; the index stays default) immutable and give the existing images, audio and fonts under `/textures`, `/icons`, `/fonts`, `/audio`, `/maps` and `/minimaps` `public, max-age=3600, stale-while-revalidate=86400` (they keep their URL across deploys, so an hour fresh and a day served stale while revalidating); `--check` covers all three families (deploy 163's output: 949 + 33 + 2,480 files, 90 routes, config.json 39 → 119 KB). Deploy 94 also re-encoded every chunk hash as base36 (`build.rollupOptions.output.hashCharacters`), so every `/assets` URL changed once and an edge node that had cached 404s for deploy-93 chunks (a browser's boot-retry loop during the promotion, answered by the old config) never serves them again. Every deploy's verify step then sweeps the served index's chunks (all must answer 200), checks that a missing `/assets` path is not cacheable and boots the alias headless before the DEPLOYS.md row is written.

**Versioned runtime audio (2026-10-02, withdrawn the same day).** A build-only plugin served the old engine's 111 sound files from content-hashed `/assets/audio` copies so returning visitors skipped their revalidations. The SFX engine redesign (main 0924ef281) replaced that engine and its files with 2,868 `.webm` assets fetched by `src/audio/assetLibrary.ts`, so the plugin and `src/runtimeFiles.ts` were removed rather than left copying nothing. Versioned URLs for the new engine's assets are a follow-up for its owner (the removed plugin is in PR #9's history).

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

Relay (TURN) credentials come from the room a player is seated in (2026-10-02, `docs/MULTIPLAYER-V2.md` §13.14): a
seat of a running peer-to-peer match asks its room (`room_relay`) once per peer connection, and the room mints one
grant per request — never cached, never logged, at most six a minute per seat and 96 per room. The production rooms
Worker mints Cloudflare Realtime TURN credentials from two secrets (names only; `wrangler secret put` in
`cloudflare/rooms`):

    COT_CLOUDFLARE_TURN_KEY_ID
    COT_CLOUDFLARE_TURN_API_TOKEN

Without them a seat receives the Worker's STUN servers alone (`COT_STUN_URLS` in `cloudflare/rooms/wrangler.jsonc`,
the policy's `OFFICIAL_STUN_URLS`): joining works, a strict NAT cannot relay. A self-host runs the same Worker with its
own secrets, or the LAN helper on a reachable host with the same names in its environment — there also coturn
(`use-auth-secret`, credentials made in-process, no provider call):

    COT_TURN_URLS=turn:turn.example.test:3478,turns:turn.example.test:5349
    COT_TURN_SHARED_SECRET=replace-with-coturn-static-auth-secret
    COT_TURN_USERNAME=cot

or a fixed JSON array of ICE servers (another provider): `COT_TURN_ICE_SERVERS_JSON`. Credentials last one hour
(2026-10-01; eight hours before): a connection lives one match. `COT_TURN_TTL_SECONDS` may shorten the lease to twenty
minutes and can no longer lengthen it. `COT_STUN_URLS` names the STUN servers a grant carries when no relay can be
minted (unset on the LAN helper: a LAN needs host candidates only). Long-lived provider secrets must never use the
`VITE_` prefix or enter the browser bundle. `/api/ice` mints nothing any more: for one release it answers the official
STUN servers to tabs loaded before the move, then it goes.

Before certifying private rooms in production, check the room Worker:

    curl -fsS https://cot-rooms.kk23907751.workers.dev/healthz

Then run the three-browser proof against the deployed site, the only origin the Worker admits:

    node tools/mp-p2p-e2e.mjs --site=https://cot.kevinliu.studio

The health must answer `{ ok, backend: durable-object, matchHost: p2p }`. A seat's relay grant (the
`ice:resolved` facts of `tools/mp-p2p-soak.mjs --ice=all`, or a seated room client's `room_relay`) must include at
least one `turn:` or `turns:` URL, and the browser must obtain a relay candidate from those credentials.

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

**One fleet pass per build (2026-10-02).** Ten receipts used to rebuild the whole fleet each (219 playable tanks
since main's Hetman II and Zubr II), and the build is nearly all of their cost (the audits themselves take under 5 s
per fleet). Three fleet passes now build each tank once
per build and run every audit that reads that build on it (`src/vehicles/fleetPass.test-support.mjs`; the audits are
the former receipts' checks, with their assertions unchanged, in `*Audit.test-support.mjs` modules beside them):

- `fleetPassHigh` — the unbatched seed-4242 HIGH build: the geometry ledger's HIGH rows, every drawn geometry's
  attributes object still in V8's fast mode (2026-10-07, `src/world/geometryStreams.test-support.mjs`: no
  `deleteAttribute` on what the renderer draws; the maps' walk rides on `collisionManifestDrift`'s Node world build
  and `drawnGeometryShape` holds the control and the garages), machine-gun mounts (with the
  detached-mount negative control), track end wraps (with the broken-station controls and 3/5 mm limits), wheel
  quality and the Gallery surface markup (formerly `wheelQuality` and `surfaceMarkupFleet`).
- `fleetPassLow` — the same build at LOW: the ledger's LOW rows, ERA registration and gun articulation (formerly
  `gunArticulation` and `eraGameplayRegistration`).
- `fleetPassDefault` — the factory default (seed 4000), the build the marking-seat and combat-anatomy generators
  measure: combat anatomy, mudguard seating, vehicle markings and tank assets (formerly four receipts), and the
  fleet watertight gate (2026-10-02, `watertightAudit.test-support.mjs`): every hull holds water with its shipped
  fills, measured exactly as `tools/tank-watertight-check.mjs` does (the body each tank's fills bound, track-lane,
  retained and declared-bore air reported apart). A profile's verified physical muzzle bore is open air by contract
  (2026-10-03, `tools/physical-bore-air.mjs`): the fill generator never fills it, so no generated box can cap the
  recess the build verifies, and water in a bore column is never counted as a leak. Moving-part clearance air
  (2026-10-06, `tools/moving-clearance-air.mjs`) is reported apart too: the pockets the generator leaves under the gun,
  mount and mantlet (outside the turret's and the gun group's own column spans) and the cells a declared finite gun
  clearance cut from the fills, which the generator records in `docs/geometry-gate/moving-clearance-air.json`; a record
  whose lattice no longer matches the build fails the gate by name. The pass builds without the fill
  registry, so the audit attaches each tank's fills
  through `applyInteriorFills` and removes them again; it costs about 1 s of CPU a hull (209 s for the fleet) and no
  extra build. A stale fill record fails by name with its regeneration command.

The builds stay separate where the checks read different models: camo seeds move seeded stowage, the generated seats
and calibrations are solved on the default seed, the ledger pins seed 4242, and `fleetFloorClearance` needs the static
preview. `fleetLazy` keeps its own sweep through the demand-loaded facade in a child process. Every audit keeps all of
its assertions and negative controls and reads the build as its receipt did: synchronous checks run back to back
before the build's microtasks (kf51, kf51b and the PT-91M rewrite UVs or vertex colours in one), async checks after
one microtask turn. An audit that poses the model restores it or is declared last; after every other audit the pass
compares each node's parent, visibility and transform and every mesh's bytes, instances and materials with what the
audit received, and fails the audit that left a difference. A failing audit stops receiving tanks while the others go
on, its build is discarded, and the pass names every failed audit and tank. Main's integration (2026-10-02)
strengthened the guard to material colors, physical parameters, shader hooks, texture bindings/transforms and
semantic metadata on every node and geometry, with cyclic-reference handling and negative controls. Measured on the
217-tank roster (CPU-seconds, load about 25): the ten receipts 1,961 s, the five that replace them 1,025 s (the three
passes 602 s); a whole cold suite 91 CPU-min instead of 106.

Receipts share `tools/receipt-kit.test-support.mjs` (`near`, `nearStrict`, `geometryHash`) instead of defining their
own copies. Source-shape guards, functional simulation tests and real visual checks still make different claims:
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

### Frozen pins retired; generated ledgers (2026-10-01)

The owner retired frozen-history receipts: a receipt no longer asserts that a past state stays byte-identical
("original … remains", "the other N maps unchanged", a pinned digest of an old version) or replays historical source
to reproduce one. Each such receipt was converted to the invariants it protected (contact, seating, closure, budgets,
registration, determinism checked by a same-run rebuild, A/B against a live opt-out) or retired; the history-replay
support went with it. Visual change detection lives in generated ledgers that one command re-pins:

- `npm run tank:geometry:check` / `npm run tank:geometry:update` — `docs/references/fleet-geometry-ledger.json`, every
  playable tank at HIGH and LOW (camo seed 4242, unbatched), digested per rig group (hull, turret, gun, running gear,
  other). `npm test` verifies every row without a second fleet build: `fleetPassHigh.selftest` (HIGH) and
  `fleetPassLow.selftest` (LOW) digest the models they already build for their other fleet audits, and
  `fleetGeometryLedger.selftest` guards the roster, the wiring and the negative controls (digest and comparison live in
  `tools/fleet-geometry-digest.mjs`).
  After an intended geometry or material change, re-pin the moved rows
  (`npm run tank:geometry:update -- --ids=<ids>`, or the whole fleet without `--ids`), review which tanks and groups
  moved, and commit the ledger with the change.
- `npm run fx:textures:bake` rewrites the committed particle atlases and `src/fx/particleAtlases.ledger.json`
  (`COT_UPDATE_LEDGER=1 node src/fx/particleTextureAssets.selftest.mjs` rewrites the ledger from the committed PNGs).
- `npm run tank:anatomy:update` and `tank:anatomy:check` keep the combat anatomy ledger as before.

A new receipt asserts properties of the current build. When a change needs a reviewed before/after record, capture it
(screenshots or a ledger diff) in the change itself rather than pinning bytes in a receipt.

### Re-basing frozen digests after an intended fleet-wide change (2026-09-22)

2026-10-01: the whole-model digests this section was written for are retired (see "Frozen pins retired; generated
ledgers" above); whole-tank change detection is the fleet geometry ledger's, re-pinned with
`npm run tank:geometry:update`. The procedure below still applies to the literal pins that remain (committed asset
checksums, pixel digests such as `src/world/leafDetail.selftest.mjs`).

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

### The pacing tail (2026-10-05)

`server/battlePacing.selftest` plays deterministic default lobbies with an idle host on every map and judges the
distribution of their lengths (the gate is `server/battlePacing.test-support.mjs`): a 3–8 minute median, p10 at least
120 s, at most 5 % of the matches inside 120 s, at most 12.5 % at the 900 s cap. Its floor was "none inside 90 s"
(owner, 2026-10-03). Each match is chaotic in every input, so a change anywhere in movement or the bots moves most
outcomes (the physics lane's round-8 set moved 91 of the 132 by more than 10 %), and the one match inside 90 s moved
from seed to seed with every change while the distribution held. The owner ruled on 2026-10-05, "floor as a tail
rate": at most 0.5 % of the matches inside 90 s, judged on 264 matches, and no more than the PR head's share on the
same matches.

| Run | What it plays | The 90 s floor |
| --- | --- | --- |
| `npm test` (core) | the 132 matches: samples 0–3 on every map | at most one match |
| `npm run test:pacing:tail` | the 264 matches: the 132 plus samples 4–7 | at most 0.5 % (one of 264) |
| `node tools/pacing-tail.mjs --merge=… --baseline=…` | the tail played in shards, on the candidate and the PR head | 0.5 %, and no more than the head's share |

The tail takes a few hours in one process, so play it in shards. Every seed is keyed to its map's index in `MAP_IDS`,
so a shard plays exactly the full run's matches (`COT_PACING_MAPS` used to key seeds to the filtered list and played
other matches):

    node tools/pacing-tail.mjs --shards=3          # three COT_PACING_MAPS lists
    COT_PACING_TAIL=1 COT_PACING_MAPS=<list> COT_PACING_REPORT=.qa-dev/pacing-tail/cand-1.json \
      node server/battlePacing.selftest.mjs        # once per list, side by side
    node tools/pacing-tail.mjs --merge=.qa-dev/pacing-tail/cand-1.json,cand-2.json,cand-3.json \
      --baseline=.qa-dev/pacing-tail/head-1.json,head-2.json,head-3.json

A run over a subset of the maps writes its records and prints its numbers without the gate. The head comparison is
like for like: play the same three shard commands on a checkout of the PR head (a scratch tree from
`git archive <head> src server tools package.json tsconfig.json`, with `node_modules` and `public` linked, is enough),
and merge both. A receipt cannot run the head, so this half is the procedure. Name every match inside 90 s with its
cause from a trace, or record "no behaviour cause" when the trace shows only ordinary doctrine; a named behaviour
defect is fixed, not ruled.

## Verification matrix

| Change area | Minimum checks |
| --- | --- |
| Documentation only | Link/path audit, npm run build |
| Movement or tracks | npm test, track geometry self-test, relevant browser probe |
| Movement, bots or match pacing | npm test (the core battlePacing), `npm run test:pacing:tail` or its shards with the PR-head comparison (The pacing tail) |
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

Verify the fleet geometry ledger (Node; `npm test` verifies the same rows inside the wheel-quality and
gun-articulation sweeps):

    npm run tank:geometry:check

Re-pin it after an intended geometry change and review the diff:

    npm run tank:geometry:update -- --ids=<ids>

The browser-era `npm run tank:freeze:check` ledger (`docs/FLEET-FREEZE-CURRENT.json`) is no longer maintained.

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

## Product facts and colored icons

`src/productStats.ts` holds the boot-safe vehicle, battlefield, and mode totals plus
the public repository summary. `npm run test:stats` checks those totals against the
registered fleet, maps, and game modes. After changing the totals, run
`node tools/sync-product-summary.mjs` to refresh the README summary. Use its explicit
`--github` option when publishing that summary to the repository About field.

The 16 colored navigation and feature marks share native SVG artwork generated by
`node tools/generate-product-icons.mjs`. Their existing URLs serve the game, public
pages, and README. `node tools/product-icon-sheet.mjs` renders a CPU-only review
sheet at large, 32 px, and 24 px sizes; the UI icon selftest rejects stale exports.

### Tank and wreck collision clearance

Live tanks use the finalized hull-shell bounds through `tankContactRect`, without
added horizontal padding. `src/sim/tankContactShape.selftest.mjs` checks every
playable vehicle at four headings: a 1 mm gap must stay clear, while a 1 mm overlap
must contact, both against another tank and against a world obstacle.

Static map wrecks bake separate posed hull/track and turret collision envelopes.
The gun, antennas and scattered dressing do not inflate those envelopes. Placement
applies the same yaw, terrain tilt and vertical seating as the visible wreck;
worker transfers retain the collision points. Wreck collision is built once, with
no new frame-time geometry work. `src/world/wreckCollision.selftest.mjs` covers
side/end clearance, the gap to a fallen turret, rotated/sloped placement and real
fleet wrecks.

After changing wreck collision, run
`node tools/refresh-wreck-collision-manifests.mjs`, then repeat with `--check`.
This CPU-only tool runs the production map producers at the canonical seeds and
updates only identified wreck records in the server shards. It retains unrelated
obstacles, shell colliders and concealment records. Its inert canvas is sufficient
for collision generation; it is not evidence of native rendering quality.

### World collider audit and the stones' colliders

Every world collider is held to the geometry it stands for by `tools/world-collider-audit.mjs`
(the measures in `tools/worldColliderAudit.mjs`, pinned by its selftest). It builds a map in Node
with the shard builders' seeds and measures each collider against the solid meshes round it: the
movement footprint against the mesh's horizontal section between 0.2 and 1.4 m over the local ground
(phantom area: collider with no stone under it; leak area: stone with no collider), and horizontal
rays from hull to turret height (stopped clear of the stone, or passing through it, by more than
10 cm). `--families=rocks` measures every stone with and without a collider and the scenery's rock
formations (on a tree whose stones carry their own colliders, each stone's legacy record survives as
the ground cover's cosmetic twin and is measured beside it); `--families=records` the other records
(`--per-kind=<n>` samples); `--write-shards` also writes the map's collision shard from the same
build, its index entry printed as an `ENTRY` line.

A stone's colliders come from its own mesh (`src/world/rockCollision.ts`, receipt
`rockCollision.selftest.mjs`): the movement footprint is the stone between 0.2 and 3 m over its
ground, to its real top; the shell and sight colliders are ranged slabs of the stone's sections
('w' parts, no format change); a stone rising less than 0.45 m is driven over and has none, and the
crushable small rocks stop shells like the other dense crushable cover. `props.ts` keeps the legacy
records through every placement pass and refits them once all have run, so no prop moves.

The props' leaning solids take shell slabs the same way (`src/world/slabCollision.ts`): a sandbag
stack's shell record is its own geometry's slabs (it published none, so shells passed 70-96 % of the
stacks), a tank wreck's the convex hull of its hull and turret vertices cut in 0.5 m slabs (the
movement record stays the solids' prisms, a hull's floor), each hedgehog beam its own slabs, and a
pylon leg its footing and the strut's slabs to the leg's end (the lattice's 4-6 cm braces carry
none). A formation's standing blocks keep their own outlines, its movement footprint the stone from
0.35 m (its pieces flare at their feet; its loose pieces, fewer on phones, carry none, so every tier
lays the same colliders), and `--families=formations` holds them to the legacy hull by the map's
union of formation stone (the `scenery-union` row: empty ground plus uncovered stone). A stone a
hull drives over has no collider and a shell aimed at it meets the ground behind it
(`rockDriveOver.selftest.mjs`); a crushed stone stops no shell from the tick it is crushed
(`crushableClutter.selftest.mjs`). Where the stones' own colliders left a sector under the layout
brief's cover band, `props.coverOutcrops` places authored crescents of the map's own boulders (hard
cover, on their own seeded draws so no other stone moves).

Every convex part is convex in fact: `collision.ts convexOutlineInPlace` drops the repeated corners
and those that turn against the outline's winding when a shape is set and when a shard is decoded
(the shell clip, the point test and the movement SAT read every edge as a half-plane, so one reflex
corner cut away the part behind its line). `server/convexOutlines.selftest.mjs` holds every convex
part of every shard to at least 99 % of its outline in the game's own point test, with level shells
through its middle stopping on it.

To see the colliders in the game, `window.__DEBUG.colliderOverlay({ x, z, radius })` draws every
record round a point (orange movement, cyan shells and sight; a stretch a mesh hides faint and
dashed; `null` removes it), and `tools/visual-census.mjs capture --overlay=colliders[:<radius>]`
shoots each view a second time with it (`<view>-colliders.png`); `--pose=<map>/<name>:...` binds an
authored pose to one map.

The garage allied-nation selector has a DOM regression fixture in
`tools/allied-nation.browser.mjs`. The spectator controls have desktop, portrait
and short-landscape fixtures in `tools/spectator-switcher.browser.mjs`. These
verify layout and interactions with WebGL disabled; neither measures GPU performance.

### First-use Garage aura preparation

The pedestal's `prepareVisual` hook installs a dormant energy skin before the
vehicle's ordinary shader warm, including the initial hero, new carousel picks
and an adopted battle vehicle. It does not compile a second copy of plain paint.
Juggernaut and Infected selections then change uniforms on those same materials;
they must not trigger first-use material replacement or another shader warm.

Parked carousel vehicles retain their inactive skin. Explicit battle handoff
restores source materials, and disposing the factory materials releases retained
skins on cache eviction. Camouflage texture canvases and fitting-color objects
stay shared with the source paint, so the dormant effect cannot freeze a repaint.
The Garage preview and pedestal selftests cover this lifecycle. Native first-click
frame times still require the shared capture lease; Node tests prove preparation
ordering and material identity, not browser timing.
