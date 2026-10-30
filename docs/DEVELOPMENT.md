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
   (`npm test`, the default tier; a lane runs `npm run test:lane` and the integrator the whole default tier), on
   every push, however small the change (owner 2026-09-23, after a push that turned `balanceMatchups` red on shared
   main for a night; since 266 balance is the manual `balance` suite, which `npm run test:recommend` names for the owner).
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
   Since 2026-10-14 (shard codec v3) the capture writes the newest exact encoding (server/collisionManifestCodec.ts);
   `node tools/transcode-collision-manifests.mjs [--check]` re-encodes the committed shards without building a world, each
   decoded back bit for bit before the index is rewritten.
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

### Merging a tank id rename (2026-10-13)

When main carries a tank id rename (a commit whose message has the trailer
`Tank-Id-Schema: N`; schema 3 is the bulk rename of SSOT 2.19), do not
hand-merge id conflicts. Commit your work, `git merge main`, then run
`NODE_OPTIONS=--max-old-space-size=4096 node tools/tank-id-codemod.mjs --apply --schema=N`.
During the merge it re-merges each conflicted text file from the converted base
and your converted side against main's side: a conflict that was only the
rename resolves and is staged, and a real one keeps its markers for you. It
then converts every line that `git blame` gives to your own commits from
before the rename; lines from main or from the rename, and uncommitted lines,
are never touched. The map has swaps (one vehicle's new id is the id another
vehicle gave up), so this provenance rule is what makes the tool idempotent:
run it again during or after the merge and it changes nothing. On a
branch without the rename it refuses and changes nothing. It never edits
generated files, icons, media or dated records: it lists the generated files
to regenerate with their own tools. Review the diff before committing. The
rename branch itself uses `--initial` on a clean tree, once.

### The versioned gate: `tools/gate.mjs` (2026-10-01)

Codex, Claude and CI run the same gate from the checkout under test. It replaces the gate half of
the generated landing chain (`.qa-dev/landing/gen-chain.py` writing `release-then-deploy-*.sh` into
a session scratchpad), which was not versioned and was lost once with a scratchpad.

    node tools/gate.mjs                                # typecheck, build, i18n, budget, workers, receipts, fills, preflight
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
- The fleet-wide fill exposure (`tools/interior-fill-exposure.mjs --all --check --jobs=4`, 2026-10-29: no committed
  interior fill of any tank stands outside its current body, the owner's "voxel blocks") builds and voxelises the whole
  fleet, about 20 s a tank: since 265 it is a command of the manual `fleet` suite (`npm run test:heavy -- fleet`), not a
  gate step; `tank:release:check` runs the scoped `--lane` form (below).
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
    node tools/release.mjs deploy <sha> --title="deploy N: <title>"   # vercel deploy --prebuilt --prod --archive=tgz, verify, record the release
    node tools/release.mjs record <sha> [--dir=<build worktree>]   # after a deploy run straight with the Vercel CLI: verify, then record
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
  `~/.cache/cot-release`): every DEPLOYED release records its own hashed `/assets` files there, and a build
  copies the files of the last `--carry=<N>` releases (default 3; `--carry=0` turns it off) that it does not emit itself
  into `.vercel/output/static/assets`, newest release first and at most `--carry-max-mb=<MB>` (default
  200), before `tools/vercel-output-immutable.mjs` writes the immutable routes — so the carried files are
  immutable too. Hashed names never collide, so nothing the build emits is replaced; a release records only
  its own files, so a carried file leaves with the release that emitted it; the cache keeps the newest
  four releases and prunes everything else; a redeploy of the same commit replaces its entry. **A build
  never writes the cache (release 255):** it lists its own files in `.vercel/cot-release.json` beside the
  output (never uploaded), and `deploy` records them after the served stamp names the commit; a deploy
  run straight with the Vercel CLI is followed by `node tools/release.mjs record <sha>`. Before 255 every
  build recorded itself, so release 254's five measuring builds pushed the live release out of the carry
  and its chunks would have 404'd for open tabs. The output directory is removed before `vercel build`, so a reused
  worktree cannot list an earlier run's carried files as its own. A missing cache only means nothing is
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
| /docs | The Field Manual's index; `/docs/<chapter>` its fifteen prerendered chapters |
| /studio | Scene Studio entry |
| /gallery | Tank Gallery, diagnostics, and surface markup |

The home and docs routes are separate Vite entries. They must remain able to
load without preloading the game module graph. Each route has a `/cn` twin built
from the same entry (`src/presentation/localizedHtml.ts`); the retired manual
chapters (vehicles, worlds, interface, performance) answer 308 to their successors.

### Generated parts of the public pages

Four generators own parts of the public HTML. Each checks by default (exit 1
naming what is stale) and rewrites with `--write`; commit what they write.

| Generator | Writes |
| --- | --- |
| `node tools/docs-prerender.mjs` | each chapter's `<main id="topicRoot">` (`site/docs-*.html`), the Chinese chapters (`src/docs/topicPrerender.zh-CN.json`), the search indexes (`src/docs/searchIndex.*.json`), the index's chapter map (`site/docs.html`) |
| `node tools/home-premiere.mjs` | the landing's `<!--home:NAME-->` blocks and `src/presentation/fleetWall.json` |
| `node tools/public-shell.mjs` | the bar, footer and inline symbol block of every public entry (run it after the landing's generator) |
| `node tools/gen-tokens.mjs` | `src/ui/tokens/tokens.css`, `tokens.ts`, `tokenSelection.ts` and the per-surface token sheets from `tokens.json` |

Run the prerender after any change to a chapter, its copy or a game table a
chapter reads (the data-built chapters quote the code; `src/docs/SKILL.md`).

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

### Owned capture holds (2026-10-21)

On 2026-10-21 three GPU captures overlapped. Hold A's lock directory was removed while A still ran, B took the free path,
and A's failing `release()` then removed B's directory, so C got in while B ran. All three results were voided. Each
hold now writes `owner.json` (pid, nonce, ticket and stamp, the directory's dev:inode, and the start time) into the
directory it creates. `refresh()` and `release()` act only on their own hold. They return `true` when they acted. If the
lock at the path is not theirs, they log the refusal, touch nothing and return `false`. Stale recovery removes a lock
only when its owner pid is dead, or when the lock has gone `lockStaleMs` without a refresh and that pid now names
another process. A late refresh from a live owner never frees the lock. A lock directory without a token (from an
older copy) is reaped only when it is empty and four times `lockStaleMs` old. Releasing or reaping renames the
directory away and then clears it, together with its `*.holder` files. Any waiter may clear a dead owner's lock, but
only the queue head claims. A caller that must not keep results from a hold it lost can check that `refresh()` still
returns `true` before saving them. `tools/visual-census-lock.mjs` uses the same owned holds, and so does capture lane
2's copy (`~/cot-launch-state/tools/capture-lock-lane2.mjs`).

### Warm capture holds (2026-10-22)

On 2026-10-22 the queue served about one hold per 45 minutes, with 30-plus tickets waiting. The holds were spent
loading pages. At load 200-600 a Studio map took 1-9 minutes to come up inside the hold, and each shot took 2-5 s.
In one world-polish hold, three maps' page loads took 1,070 s of 1,142 s before the cap. Hero-card holds spent
70-143 s of 103-212 s starting Vite, Chrome and the page. An mbt70 Garage before/after hold waited 219 minutes,
then reached the cap with both sides failing and no shots. Per-process GPU time (`ioreg` AGXDeviceUserClient
`accumulatedGPUTime`) showed holders using 0-15 % of the GPU. The largest GPU user was outside every Claude of Tanks
lock: another project's iOS Simulator (SimMetal, about 44 %), plus Playwright browsers. A hold should serve shots
only:

- **`tools/capture-hold.mjs` `runWarmHold({ warm, shoot })`.** `warm` starts the servers and the browser and loads
  every page to ready while the ticket waits. Its pages are then frozen (Chrome's page lifecycle: no timers and no
  frames, so nothing draws during other holds). At the hold they are thawed, `shoot` runs, and they are frozen again
  before the release. `holdMinutes` (default 18) aborts `shoot`'s signal; past `graceSeconds` the browser is closed
  before the release. A signal releases the lock, closes the browser and exits.
- **Helpers in the same module.** `startViteChild` runs Vite in a child process that exits with its parent: `preview`
  serves a built `dist` with no transforms, and `dev` serves the sources. `warmPage` waits, within bounds, for a ready
  expression, eager images and fonts. Studio, Garage and the public pages all serve from a dist (`vite build --outDir
  <dir>` outside the lock; one dist per side of a before/after pair).
- **Warming starts just in time.** `acquire(ms, { prepare })` starts `prepare` once at most `warmAhead` live tickets
  are ahead (`COT_SHOTS_WARM_AHEAD`, default 2), so a long queue never holds one warm browser per lane. Until
  `prepare` resolves, the ticket keeps its place and the queue serves the tickets behind it. Tickets record their
  phase: queued, warming or ready.
- **Dead waiters.** A ticket now carries its owner's process start time and heartbeat. A pid reused by another
  process, a zombie, or a heartbeat silent for 10 minutes is removed at once, and the removal is logged. Before, a
  killed waiter whose pid came back could stall the head for an hour.
- **Places.** `acquire(ms, { place: '<lane>-<item>' })` (genHeroCards `--place=`) puts a run killed while it waited
  back at its first run's stamp, for up to 12 hours. Size wall-clock alarms for the hold, never the wait.
- **The meter.** Every hold, release and reap appends a line to `/tmp/cot-shots.log`. `node tools/capture-lock.mjs
  --status [--hours=N]` prints the holder, the queue (ready, warming, dead) and holds per hour. Holds taken through
  an older copy of the lock are not logged.
- **Frozen pages that reload (2026-10-23).** A page on a Vite dev server keeps the Vite client's HMR socket. When that
  socket closed (another lane's server on the same port, or a re-bundle broadcast during a ~50-minute freeze), the
  client reloaded the page at the thaw ("Execution context was destroyed") and world-polish's hold shot nothing.
  `warmPage` (and `stubViteSocket` for pages a tool loads itself) replaces a socket opened with Vite's protocols with
  one that never opens or closes, and `startViteChild` dev servers run with `ws: false`. A tool that passes its own
  dev config gives it `server: { hmr: false, ws: false }`. Every page is checked after the thaw: does its context
  answer, does it still carry the token its warm-up left (a reload drops it), and does its `ready` hold? A page that
  fails is loaded again from its warm record (`warmPage`, or `rememberWarm` for a page a tool loads itself) before
  `shoot` sees it. A page frozen longer than `maxFrozenMinutes` (default 20) gets the same check while still queued,
  so the re-warm costs no hold time. Measured on a Vite dev server, a full-reload broadcast during the freeze reloaded
  an unstubbed page at the thaw; the check caught it and the re-warm restored it. A stubbed page did not reload.
- **Cinema leases.** `tools/media-production/cinema.mjs` holds every lease to the 18-minute cap unless `--lease-min`
  asks for less: 0, and longer values such as site50-finals' 45, become the cap. A take still running two minutes past
  the cap stops at its next frame and exits 75, so a resumed batch renders it again. One cinema hold had run 44
  minutes.
- **Adopted.** `genHeroCards` warms its Vite child, Chrome, the page and `__HERO_WARM` while queued, and the hold only
  renders. `withIsolatedCaptureBrowser(..., { capture: { lock, waitMs, warm } })` opens the cache, server and browser
  while queued and releases once the browser closes. `tank-standard-check` and `track-clip-audit` use it, and the
  standard check's contiguity stage, which is CPU-only, now runs after the release.

A second concurrent capture lane for stills (parked 2026-10-15) is not the lever. Holds were long because of
CPU-bound page loads, which now happen before the hold, and the GPU is already 65-80 % busy with other projects'
work. Timing jobs still need the GPU alone, and that holds only while nothing outside the lock draws: on 2026-10-22
the iOS Simulator did.

### The rooms Worker's TypeScript program (2026-09-28)

`cloudflare/rooms/tsconfig.json` compiles the Worker with `lib: ["ES2022"]` and no DOM, and a **type-only** import still joins a
file to the program. `npm run typecheck:rooms` was red on main for days (445 DOM errors in `src/engine/deviceDiag.ts`) because
`src/mp/room/roomPolicy.ts` imported `resolveMapId` from `src/world/maps/catalog.ts`, whose `import type` chain runs
contracts → terrain → maps/horizon → engine/sky → engine/deviceDiag — and the release chains run only the app typecheck. The
identity slice (ids, names, the random rotation, the resolvers) now lives in `src/world/maps/mapIds.ts`; `catalog.ts` re-exports
it for the browser. `src/mp/room/roomWorkerProgram.selftest.mjs` walks the Worker's import graph (value and type imports) and
fails on any renderer-facing module, then runs `npm run typecheck:rooms` when `cloudflare/rooms/node_modules` is installed
(`npm ci --prefix cloudflare/rooms` — do it in the gate worktree; without it the receipt says so and only the graph check runs).
A network module that needs something from the world takes a DOM-free slice like `mapIds.ts`, never the catalog. The same holds
for the rulesets the Worker reaches through `protocol.ts`: their equipment rules are `src/sim/equipmentRules.ts` (which
`src/game/equipment.ts` re-exports) and the era gate is `src/sim/vehicleEras.ts` (which `src/vehicles/taxonomy.ts` re-exports).

### Self-leasing browser receipts (2026-09-26)

`tools/run-selftests.mjs` holds the capture lease around every browser receipt and refreshes it every 30 s. A receipt that
takes the lock ITSELF (`createCaptureLock().acquire()` in the receipt — the Garage switch probe's part 2, the `*.browser.selftest`
files that own their lease) must be listed in `SELFTEST_OWNED_LEASE_FILES`, or the runner keeps the lease while the child queues
on the same lock: a deadlock that only ends at the 3 h chain timeout (chains 96 and 106 lost 76 and 80 minutes to it — the tell
is a receipt at 0 % CPU with one ticket in `/tmp/cot-shots.queue` and the lock directory's mtime ticking every 30 s). The list is
pinned in `tools/run-selftests.selftest.mjs` (the `actual-registry` count and the barrier loop). A load gate read before a lock
wait is stale by the time the lock arrives — re-read it after `acquire()` and skip the same way, releasing the lock.

### Asset caching (2026-09-25)

**Asset caching (2026-09-25).** Vite emits content-hashed files under `/assets/`. Do NOT add a header rule for `/assets/(.*)` in `vercel.json`: a `headers` rule applies to every response on the path including a 404, and Vercel's edge then caches that 404 for the rule's lifetime — under deploy 89's immutable rule one transient miss during a promotion became a permanent "A game file failed to download" for every player on that edge node (`tools/vercel-config.selftest.mjs` and `src/gallery/chunkRecovery.selftest.mjs` refuse the rule). The year-long header comes from the deploy step instead: `node tools/vercel-output-immutable.mjs` runs between `vercel build` and `vercel deploy --prebuilt` and writes immutable, case-sensitive header routes for exactly the hashed files that exist in `.vercel/output/static/assets` (groups of 40 names per route, ahead of the filesystem handle; `--check` verifies coverage; `tools/vercel-output-immutable.selftest.mjs`). A path that is not in the build matches no rule, keeps Vercel's default `public, max-age=0, must-revalidate` answer and heals on the next request; documents keep that default too. Since 2026-10-01 the same per-file routes make the content-addressed collision manifests (`/mp-collision/<map>.<sha12>.json`; the index stays default) immutable and give the existing images, audio and fonts under `/textures`, `/icons`, `/fonts`, `/audio`, `/maps` and `/minimaps` `public, max-age=3600, stale-while-revalidate=86400` (they keep their URL across deploys, so an hour fresh and a day served stale while revalidating); `--check` covers all three families (deploy 163's output: 949 + 33 + 2,480 files, 90 routes, config.json 39 → 119 KB). Since 2026-10-22 (nav-perf-240) the public pages' images and videos under `/media`, `/brand` and `/field-guide` take the same hour and day, and the JSON manifests the pages and the Garage fetch at run time (`/media/**.json`, `/icons/**.json`, `/field-guide/**.json`) take `public, max-age=60, stale-while-revalidate=3600`: a warm visit to `/home`, `/docs` or `/gallery` no longer revalidates every still, poster and manifest (the 058ccfa24 build: 1,517 media files and 228 manifests, 241 routes, config.json about 334 KB). `node tools/vercel-static-preview.mjs --dist=dist` serves a local build with these headers, vercel.json's routes, 304s and brotli, for recordings such as `tools/nav-timeline.mjs`. Deploy 94 also re-encoded every chunk hash as base36 (`build.rollupOptions.output.hashCharacters`), so every `/assets` URL changed once and an edge node that had cached 404s for deploy-93 chunks (a browser's boot-retry loop during the promotion, answered by the old config) never serves them again. Every deploy's verify step then sweeps the served index's chunks (all must answer 200), checks that a missing `/assets` path is not cacheable and boots the alias headless before the DEPLOYS.md row is written.

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

Run strict TypeScript validation (TypeScript 7, with Oxlint beside it) and,
on its own, the linter:

    npm run typecheck
    npm run lint

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
world owners, in the same compile ("Fast checks" below). Procedural fleet
builders and declarative map callbacks remain a separate cleanup lane because
their intentionally uniform factory signatures must be changed family-by-family
with geometry receipts, not mechanically.

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
owner. After new map art is published (map thumbs or media cards), run
`node tools/map-lqip.mjs`: it writes the battle loading screen's blurred
per-map placeholders (`src/ui/mapLqip.ts`, a lazy chunk) and the art's band
colours (`src/ui/mapArtTones.ts`, the gradient under the art), checked by
`src/ui/mapLqip.selftest.mjs`.

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

### Fast checks

`npm test` runs the default tier of the pre, core and post receipt groups in one invocation. A receipt whose observable
inputs are byte-identical to its last PASS prints a SKIP line (`COT_SELFTEST_CACHE=0 npm test` runs
everything). Every failure in a group is reported in one run; `COT_SELFTEST_FAIL_FAST=1` stops at the first. Result reuse is specified in
"Test gate and result reuse" below.

**Receipt tiers (266; owner 2026-10-30: "make super strenuous suites like balance and other testing to be not for every
deploy annd manually recommended annd triggered by ME").** `tools/selftest-tiers.mjs` splits the registry; the audit of
every receipt (decision, reason, where its coverage lives) is `docs/TEST-AUDIT.md`.

| Tier | What runs it | Size (266 audit) |
|---|---|---|
| Default | `npm test`, the release gate (`tools/gate.mjs`), tank:release:check's embedded suite; lane mode runs the part a diff reaches | 1,454 receipts, ~114 CPU-min, ~17 min wall on an idle machine (before: 2,122 receipts, ~1,227 CPU-min, ~207 min) |
| Manual | only `npm run test:heavy -- <suite...>`, triggered by the owner | 667 receipts in 10 suites, ~1,114 CPU-min |

- **Manual suites**: `balance` (round-robin duels and `balance-matchups --check`), `pacing` (the battlePacing shards and
  judge, placement, deployment), `bots`, `sims` (drone, missile, escort and counter-drone runs), `perf` (host-time
  budgets), `fleet` (the fleet passes and every other build-the-whole-fleet sweep, then `tank:anatomy:check`'s other
  steps), `tanks` (per-tank and per-family pins, id-scoped), `world` (every map built: scenery, structure collision,
  buildings, the wreck bake, the collision shards, civic areas, horizons), `ui` and `browser` (the strenuous real-battle
  GPU receipts). `npm run test:heavy` alone lists them with their size; `all` names every suite. A new receipt lands
  in the default tier; one that builds the fleet or every map joins a suite (the tiers selftest fails on a default
  receipt the snapshot times at a minute or more unless it is a must-keep invariant).
- **Who runs them**: neither `npm test`, the release gate, a hook nor CI runs a manual suite, and `test:heavy` refuses a
  CI environment (`tools/selftest-tiers.selftest.mjs` holds every caller). `npm run test:recommend [-- --base=<ref>]`
  prints which suites a diff warrants, one line each with its idle wall time, and the command under it, for example
  `balance (~1 min): 2 tanks changed armour/HP/gun in tiers VIII-IX (leo2a4, m1a2)`. A suite is warranted when one of its
  receipts reads a changed path through the result cache's closure, when one of its stale-output guards fires
  (`STALE_GUARDS`: `collisionManifestDrift` and `wreckBakePlanDrift` on any map's files, the world core, the fleet core
  or a moved wreck donor, from the changed-only world partition; the fleet passes and the anatomy check on any moved
  tank), or, for balance, when an id's spec armour, gun, HP, mobility, size or role moved (the base's and the head's
  registries). When closure reads alone warrant a suite and reach at most a quarter of it, the command names just those
  receipts (`--only=`) with their own time. An entry page (a root `*.html` Vite builds from) counts only for a receipt
  whose own source names it, and never as a world-step trigger (the locale route table names the pages; the Node
  captures never read one): the og:video head (12 paths) went from six suites to two narrowed lines. Main relays that
  report; the owner triggers the run.
- **Must-keep** (`MUST_KEEP`, never manual): sim determinism and driver parity, the authority and spotting receipts,
  an armour, ballistics and damage sample on real builds, the vehicle-core build paths, the cheap generated-output guards
  (the collision shard census and codec, the gun-junction, sealed, spare-track and watertight ledgers, the rounds census),
  and the i18n, attribution, hygiene and changed-only/cache guards.
- **Lane mode**: `npm run test:lane [-- --base=<ref>]` (default `origin/main`; `--dry-run` prints the selection) runs
  the default-tier receipts whose closure (the result cache's own, `selftestReadOf`, a broad-fallback match excluded)
  holds a changed path, plus the `tanks` pins that name a changed tank id or read a changed file outside the shared
  fleet core. Changed ids come from the changed-only fleet partition (`tools/test-diff.mjs changedTankIds`: a group's
  files, a table's moved rows, a path naming the id). A fleet-core edit (tankFactoryCore, decorations, kits) moves every
  pin's inputs: lane mode then runs none of them and reports them, and test:recommend names the whole `tanks` suite.
  Nor does it run a lane's pins when they come to more than a quarter of the suite's CPU (a whole-fleet regeneration
  names nearly every id: the fingerprints bootstrap moved 218 tanks); test:recommend then names `tanks` for the owner.
  Every selected receipt prints its reason. A negative control runs every time: a receipt reading a file is selected
  when that file changes, and every changed receipt file is selected, or the run exits 2 before anything runs. The
  uncommitted and untracked files count as changed. A branch carrying an integration tree beyond the base
  (an origin/integ/* commit not on origin/main) gets the suggested base printed first; `--base=integ` takes it.
  Speed (266 follow-up): each receipt's reads are computed once per diff from the cache's closure and listings
  (`createReadIndex`, held equal to `selftestReadOf` by the tiers receipt) and the changed tables' rows come from one git
  call; integ/265's 3,035-path diff selects in about 78 s of CPU, where it ran past ten minutes. test:lane and
  test:recommend stop their children and exit on SIGTERM, SIGINT, SIGHUP or SIGALRM, or when their parent dies
  (`tools/test-commands-exit.selftest.mjs`, with an unguarded control that orphans).
- `node tools/run-selftests.mjs all --heavy=<suite>[,<suite>]` selects manual receipts (`test:heavy` passes it);
  `--only` matching only another tier's receipts names that tier; `--only-from=<file>` reads one glob per line;
  `--write-durations` still times every tier.

**Typecheck, lint and the build's post-build steps (2026-10-22).** Timings are before → after, A/B-interleaved on
one tree at load 160-410 (medians of three runs; CPU is user+sys, the load-free cost):

- `npm run typecheck` (`tools/typecheck.mjs`, 308 → 147 s, CPU 73 → 40 s) is one TypeScript 7 compile with
  `--noUnusedLocals --noUnusedParameters`. Any other diagnostic fails, as a plain `tsc --noEmit` would. Unused
  symbols fail only in the core owners. A killed compiler, or output that is not a diagnostic list, fails too. It
  used to be two full compiles. Oxlint runs beside the compiler and adds no wall time. A `node_modules` cloned
  before Oxlint was added skips it with a notice until `npm ci`.
- `npm run lint` (about 2 s) is Oxlint 1.87.0's correctness category (`.oxlintrc.json`), with no style rules and
  no formatter. Fix a finding at its source. When a rule flags a deliberate idiom, turn it off in `.oxlintrc.json`
  with a one-line reason (an `overrides` entry for one file). Never edit a hash-pinned source, or change
  simulation behaviour, to satisfy a rule without proving the bug. dist, public/, generated tables and the
  hash-pinned sources are ignored.
- `tools/asset-provenance.mjs` (363 → 39 s, CPU 10.9 → 4.2 s) hashes the ~10,900 files (1.2 GB) of its scope 16 at
  a time.
- `tools/strip-nc-assets.mjs` (30 → 1-3 s; 37 s on a cold probe) reuses its registry probe's result while every
  file the probe loaded, the probe, the lockfile and Node are byte-identical (`node_modules/.cache/cot-strip-nc`;
  `COT_STRIP_NC_PROBE_CACHE=0` probes anyway). A probe that runs (about 3 s of CPU, 60-90 s at load 200+) gets 10
  minutes (`COT_STRIP_NC_PROBE_TIMEOUT_MS`), where 120 s used to trip at load ~100.
- `npm run check:bundle` (155 → 14 s, CPU 9.4 → 1.3 s; 111 s cold) reuses each file's compressed sizes by content
  digest (`node_modules/.cache/cot-bundle-budget`) and compresses the rest on the thread pool.
- `tools/generate-localized-pages.mjs` takes about 2 s and is unchanged.

The build output is byte-identical: each run diffs the old and new steps' `dist/` from the same Vite output. The
integrator's pre-deploy light pass is `npm run typecheck` (with lint), `npm run build` and `npm run check:bundle`.
Lanes get lint through typecheck, or run `npm run lint` on its own.

`npm run tank:release:check -- --ids=<ids> [--gate]` runs two stages (`tools/tank-release-plan.mjs`):
the load-sensitive browser scoring (standard, sealed, source fidelity) one step at a time, then the
other probes four at a time. It has two modes (2026-10-16, test-speed R8e):

| Mode | Command | Runs | Who runs it |
|---|---|---|---|
| Integrator (the default) | `tank:release:check -- --ids=<ids> --gate` | Every step: the per-id probes, the per-id combat-anatomy freshness check (`gen-combat-anatomy --check --ids`), the id-scoped `tanks` receipts of the ids (`test-heavy tanks --ids`), `npm test` (the default tier) and `npm run build:private` | The integrator; anyone certifying a tree on their own |
| Lane | `tank:release:check -- --ids=<ids> --gate --lane` | The same steps, flags and id scopes, without the embedded `npm test` and `npm run build:private` | A tank lane before READY |

- **What lane mode saves:** the embedded `npm test` and `npm run build:private`. The PLAN estimates
  13-41+ min per tank lane landing for the two together; in 223/224 the embedded `npm test` alone
  was 1.7-5.5 receipt-h. Two logged release checks show the scale: `npm test` took 999 s in one
  (2026-09-26, 8 ids) and `build:private` 278 s in another (2026-09-24).
- **Why the anatomy check is scoped since 266:** `gen-combat-anatomy --check --ids=<ids>` re-measures only
  those tanks and compares every other row with itself. A shared builder can stale rows of tanks the
  lane did not select (in 226 the shared Ukrainian cage staled the spare-track rows of bmp2,
  m46_patton, bmp3_rok and t72b3m_hetman_ii). The whole-fleet form is now the manual `fleet` suite's
  command, with the rest of `tank:anatomy:check`: a shared-builder edit shows in `npm run test:recommend` as
  "the shared fleet core changed", Main relays it, and the owner triggers `npm run test:heavy -- fleet`. From
  release 265 the committed fingerprints (`release/fingerprints.tsv`, `tools/changed-only/fresh.selftest.mjs` in
  the default tier) catch a row whose inputs moved without its regeneration.
- **The fill exposure is scoped in both modes** (2026-10-29): `interior-fill-exposure --ids=<ids> --lane`
  measures the selected tanks plus every tank whose body moved against the merge-base with `origin/main`: its
  hull, turret or gun digest at the geometry ledger's HIGH build differs from the base's ledger row, or its fill
  record line differs from the base's. A shared builder's edit reaches exactly the tanks it moved this way; the
  import-graph partition would not narrow it (on 2026-10-29, 39 of 51 live branches touched a shared core file such
  as `decorations.ts` or `camoPolicy.ts`). When the checker's own inputs moved, every tank runs. The whole-fleet form
  (`interior-fill-exposure --all --check`) is the manual `fleet` suite's command beside `gen-combat-anatomy --check`.
- **Where the dropped work still runs:** the integrator mode runs both. The release gate
  (`tools/gate.mjs`) runs the default receipt tier (`run-selftests.mjs all`, the same run as `npm test`) and
  `npm run build`. `npm run build` runs build:private's commands (`vite build` and the localized
  pages) with the same `prebuild`, then the public asset strip and the provenance file. The two
  builds differ only by `VITE_PUBLIC_BUILD=1`. On 2026-10-16 no source read that key; the only
  whole-object `import.meta.env` read (`src/vehicles/rosterPolicy.ts`) carries it into the bundle
  and reads only `DEV` and the dev-fleet key. So the gate's build compiles the same modules that
  build:private does. The Release checklist (step 6) also lists build:private itself;
  `tools/gate.mjs` does not run it.
- **What a lane PASS means:** it reads `PASS (lane mode)` and, before the run and after the PASS,
  states that `npm test` and `npm run build:private` were NOT RUN. Never report it as a suite or
  build pass.
- **When lane mode is not enough:** a change outside the selected tanks' own files (a shared
  builder, material, generator or table) can move tanks the lane did not select. The fleet-wide
  anatomy check still sees their anatomy rows; select the other ids for the per-id probes too, or run
  the integrator mode.
- **Regeneration is separate:** id-scoped regeneration (PLAN R8e's "`tank:anatomy:update` becomes
  id-scoped") is `npm run tank:regen:changed` from the changed-only pipeline (R8a/R8b); lane mode
  only changes what the release check runs. `npm run tank:anatomy:update` stays the whole-fleet form.
- **Exit status:** 0 for a PASS or `--dry-run`, 1 for usage, otherwise the earliest failed step's
  status (2 when it has none). An unknown or repeated id prints `[tank-release] FAIL (<mode> mode)
  <ids>: <reason>` and exits 2, with no stack trace.
- `--dry-run` prints either plan and runs nothing. `tools/tank-release-plan.selftest.mjs` pins the
  lane plan as the integrator plan minus exactly the two npm steps, the per-id anatomy check in
  both modes, and the claims above (gate steps, `npm test`, the two builds). It drives the whole
  run (`runTankRelease`) with fake children: output order, stage order and concurrency, every
  failure reported in plan order, and the exit status. Since 266 it pins every step per id and the one manual-tier step,
  `test-heavy tanks --ids`. `tools/tank-release-check.mjs` is pinned to
  the statements that call it.

### Test gate and result reuse (2026-09-28)

`npm test` considers every default-tier check in one invocation (266: the manual suites only through `npm run test:heavy`). `npm run test:all`
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

Each invocation gives its receipts a fresh run directory, `COT_SELFTEST_RUN_DIR`,
and removes it afterwards. A caller can export its own directory instead, and the
runner keeps it. A judge receipt (`SELFTEST_LAST_FILES` in
`tools/run-selftests.mjs`) merges records that other receipts of the same run
wrote there. The pool admits a judge after everything else. The judge plays any
share that nobody else plays in the run. The result cache does not key on the
directory's path, which changes every run (`selftestCacheEnv`). The battlePacing
shards are the first users; see "The pacing tail".

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

**Listing receipts (2026-10-20, after 228p).** A receipt that lists a tree (readdir, opendir, glob, `git ls-files` or
`grep`, a name-only diff) reads every file in it, not only what it imports. Release 228p ran the 125 receipts whose
closures named a changed file and shipped a red: `src/presentation/mediaLibrary.ts` gained a static CSS import, which
`src/ui/runtimeStyles.selftest.mjs` forbids outside main.ts. runtimeStyles lists all of src, so its only match for the
file was the fallback every listing gets (`SELFTEST_BROAD_DIRS` in `tools/selftest-cache.mjs`: src, tools, server,
public, docs, scripts, cloudflare). That fallback keys the proof, so the cache was not the hole, but a selection cannot
tell it from a real read, so the selection dropped it. `tools/selftest-scans.mjs` declares what each listing module a
registered receipt runs (its imports, and the repository tools a child-process user names) lists:

- `lists` patterns (the `--only` glob syntax) put every matching file into the receipt's closure. The key changes when a
  match appears, changes or goes, including roots outside the fallback such as the root `*.html` pages
  `src/ui/i18n.selftest.mjs` lists. Any reader of closures sees the read as direct.
- `tracked` patterns (git's index) select a receipt that git state already keeps live.
- `caller` libraries (the cache itself, the changed-only graph) move the declaration to every module that runs them.
- `outside`, `identity`, `cli` and `none` give the reason a listing selects nothing: tmp fixtures and queues, provenance
  digests, a command-line-only path, or a constant imported from a `caller` module.

`npm run test:plan -- --changed=<paths>` rows carry `scanBy` (the changed paths a listing covers, deleted paths
included) and `broadOnly` (matched only through the fallback). A targeted selection runs every row with a non-empty
`affectedBy` that is not `broadOnly`, and never drops a `scanBy` row. `tools/selftest-scans.selftest.mjs` replays 228p
through the runner on a fixture: a static CSS import in a non-main module selects runtimeStyles and fails it, and a
cached PASS never hides it. It fails on an undeclared listing module, a `caller` library run by an undeclared module, a
stale entry, a missing directory, a root-recursive `lists` pattern and a keyed receipt with tracked listings. Census on
2026-10-20: 111 modules (45 lists, 12 tracked, 8 caller, 19 outside, 11 identity, 11 cli, 5 none). Listings key and
select 54 receipts; tracked listings select 12.

Liveness (browser, Git, computed imports) and the environment a key records come from the modules a receipt's imports
execute, never from a file it only names, lists or spawns. They used to count once any other receipt's walk had parsed
the file, so liveness depended on lookup order. In registry order six receipts were live only through a file they name:
four reach `tools/source-x-oracle.mjs` through a research receipt JSON, and two read tool sources as text. They are now
keyed. No receipt became live. A spawned tool's git or browser use still does not make its spawner live:
`src/world/wreckBakePlanDrift.selftest.mjs` (about 500 s) spawns a tool that stamps a git revision.

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
  extra build. A stale fill record fails by name with its regeneration command. Named carries (2026-10-16,
  `tools/watertight-carry.mjs`): `docs/geometry-gate/watertight-carry.json` lists each inherited leaking hull with its
  leak volume in litres, an owner, a date and a cause. A listed hull passes at exactly its litres (0.01 L); the gate fails on
  any unlisted leak, any listed hull that leaks more or less (lower its row: a ratchet), and any listed hull that now holds water (delete its row in the
  commit that seals it). Lower or delete rows; never raise one to turn a red green.

The builds stay separate where the checks read different models: camo seeds move seeded stowage, the generated seats
and calibrations are solved on the default seed, the ledger pins seed 4242, and `fleetFloorClearance` needs the static
preview. `fleetLazy` keeps its own sweep through the demand-loaded facade in a child process. Every audit keeps all of
its assertions and negative controls and reads the build as its receipt did: synchronous checks run back to back
before the build's microtasks (kf51_evo, kf51_u and the PT-91M rewrite UVs or vertex colours in one), async checks after
one microtask turn. An audit that poses the model restores it or is declared last; after every other audit the pass
compares each node's parent, visibility and transform and every mesh's bytes, instances and materials with what the
audit received, and fails the audit that left a difference. A failing audit stops receiving tanks while the others go
on, its build is discarded, and the pass names every failed audit and tank. Main's integration (2026-10-02)
strengthened the guard to material colors, physical parameters, shader hooks, texture bindings/transforms and
semantic metadata on every node and geometry, with cyclic-reference handling and negative controls. Measured on the
217-tank roster (CPU-seconds, load about 25): the ten receipts 1,961 s, the five that replace them 1,025 s (the three
passes 602 s); a whole cold suite 91 CPU-min instead of 106.

Receipts share `tools/receipt-kit.test-support.mjs` (`near`, `nearStrict`, `geometryHash`, `graphLabels`) instead of
defining their own copies.

**No equality asserts on three.js objects (2026-10-16, test-speed R10).** A failing `assert.equal`/`deepEqual` makes
node inspect both operands at depth 1000 with every typed-array element and diff the two dumps line by line; a
supplied message does not stop it and `util.inspect.defaultOptions` is ignored. In the 226 gate the T-72 X receipts
compared two scene graphs after VH.14 moved the AA gun under a pitch node and were killed at 28-40 GB sixteen times.
Measured on node 24.13 under a 4 GB heap cap: two differing small meshes 6.1 GB and 11 s, two 200-mesh scenes 27.5 GB
and 15 s; the pre-fix `t72b3XGeometry` receipt on today's tanks passed 12 GB in 65 s and was stopped there, and the same
file after `--fix` fails in 21 s at 620 MB with a one-line message.

`tools/object3d-assert-lint.selftest.mjs` fails on any node:assert equality call whose operand is an Object3D (or a
list of them), a geometry, an attribute, a material or a texture: assert a boolean
(`assert.ok(group.parent === turret, ...)`) or compare `graphLabels(...)` (identity labels such as `Mesh "hull" #12`),
uuids or names. `node tools/object3d-assert-lint.mjs --fix` rewrites identity asserts as booleans and deep ones through
`graphLabels`; `--types` runs the TypeScript checker over the whole import graph as the slower audit (about 50 s and
4 GB, run it when touching many receipts); `// object3d-assert-ok: <reason>` on the call's line or the line above
accepts a false positive. The lint caches each file's result by its bytes, so an unchanged tree lints in under a second;
`COT_SELFTEST_CACHE=0` re-lints every file. A memory kill (137) or a timeout is a GO-blocking red until the receipt
passes under the standard cap; never retry it at 24-40 GB.

Source-shape guards, functional simulation tests and real visual checks still make different claims:
a source regex does not prove a rendered result. The full gate inventory is not a
substitute for the map/contact, shadow-motion and real Garage/battle review.

**Scheduling, selection and cache identity (2026-10-01).** Only the order and the batching of the
work changed; every selected receipt still runs every assertion in a fresh process.

- (229) CPU receipts take no capture lease: they run at nice 10 and each waits for
  `headroom can-start --gb 6` (`COT_SELFTEST_MEMORY_GB`, 0 turns it off; a yes is reused 5 s, a no is
  asked again every 15 s; no CLI or an error turns the gate off with a log line, and after 30 minutes of
  noes it opens for the rest of the run), and the capture lock is for the GPU. The exclusive CPU receipts still run alone and first within this suite (at the runner's
  priority); the self-leasing browser receipts run alone and last, queueing for the lock themselves,
  so no CPU receipt waits behind the GPU queue (on 2026-10-19 it held 45 tickets and two cold suites
  timed out at 30 min without starting). The trade-off: nothing holds other sessions' suites or GPU
  captures off this suite's CPU any more, so a timing receipt (here or in a capture) can see their
  load. `COT_SELFTEST_CPU_LEASE=1` restores the shared lease and the two bullets below for a gate
  that wants captures and CPU receipts never to overlap; tools/gate.mjs's red-receipt pairs keep it.
- With the lease, a batch older than 45 s yields (drains, releases, re-queues) only while another acquisition
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

The runner retains bounded CPU workers, fresh child processes, a memory gate per CPU child
(`headroom can-start`; fair capture-queue batches instead under `COT_SELFTEST_CPU_LEASE=1`)
and exclusive browser/timing checks. It reports every ordinary failure in
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
- `docs/geometry-gate/sim-floors.json` (2026-10-17, after the 226 T-90M blade) — each tank's belly pan
  (`trackContact.panYM`), track bottom, combat hull box and combat turret floor (`turret.min[1]`, schema 2, 2026-10-19),
  the authority inputs a visual accessory can move unnoticed.
  `tools/gen-combat-anatomy.mjs` holds every tank it measures to its row in both modes: a move over 5 cm fails and
  names the parts responsible with their builder call sites (the write mode writes its outputs, then exits 3, so a
  regen chain stops there). `npm test` runs `tools/anatomy-floor-drift.selftest.mjs` on the committed calibration
  (data only, ~0.3 s). Fix the geometry, or record an intended move with a reason:
  `node tools/anatomy-floor-drift.mjs --accept=<ids>:<what moved and why>` after the regen, or
  `--accept-floor=<ids>:<reason>` on gen-combat-anatomy (`COT_ACCEPT_FLOOR_DRIFT` through an npm chain). The row keeps
  the old values, the reason, who and when. A new tank's row is seeded by its first regen (only an id the committed
  calibration has never measured: a calibrated tank whose row went missing fails and is compared with its committed
  calibration, never re-seeded as a first measurement); `--prune` drops retired ids.
- `docs/geometry-gate/sealed.json` see-through columns (guards 227/229) — `tools/tank-sealed-check.mjs --ledger --gate`
  (in `tank:release:check`) holds each row's `seeThroughPx` (glass, markings, undeclared alpha-cut parts) to max(12 px,
  10 %) and its `netSeeThroughPx` (sky between declared netting) to max(12 px, 2 %) either way; every playable id has a
  row (`tank-sealed-check.selftest` holds the ledger's ids to the fleet manifest), measured in the census frame recorded
  on it (`frame: [x, y, z, radius]`), so an unrelated extremity edit never moves the pixel grid under unchanged parts.
  The frame is fixed: the frame a build needs (its own bounding sphere, as a new row records it) may differ from the
  row's by min(0.5 m, 15 % of the radius) in radius and in centre (together a part reaches about 1 m past the frame)
  and the build is judged in the row's frame, geometry past it clipped laterally and drawn wherever it projects into
  the window. Past that the gate fails `OUT OF FRAME` (usually a part thrown metres out: fix the build; a 1.5 m longer
  gun needs 5.6 -> 6.3 m and is re-framed) or `FRAME STALE` (the build lies well inside a frame too large for it). `--update-ledger` never changes an existing row (it records
  new vehicles' rows; `=see-through` refuses new rows); `--tighten-ledger=<ids>` lowers openings and see-through to the
  measurement by name; a see-through or netting raise, or a sealed new vehicle's row with a see-through cluster, needs
  `--accept-see-through=<id>[,<id>]:<reason>`; no flag accepts an opening. `--reframe=<id>:<reason>` serves only
  OUT OF FRAME (never past half again the row's first recorded frame, however many re-frames) and FRAME STALE: the
  build's census in the row's frame may not exceed the row in any column, with no slack (a refusal lists the views
  holding the excess pixels; a rise the plain gate tolerates is printed as drift with its views when it lands), before
  every column is re-measured in its own frame; with
  `--accept-see-through` for the same id its see-through and netting are free there (both entries recorded), openings
  never. Each accept or re-frame appends {kind, reason, by, date, from} to the row's `accepts` history. The six open
  rows list their hole views (`openViewNames`): a hole in any other view fails; within a listed view the row keeps
  only a pixel count. Rows are pixel counts at the ledger's `res` and `minArea` (256, 6): an update or a `--gate` at
  another `--res`/`--min-area` is refused (exit 2); a look there without `--gate` uses the rows' frames and gives no
  verdict. The framed re-base that
  introduced the frames (guards 229) wrote its own entries, kind `rebaseline`: leo2a4's 1 cm turret-roof slit is the
  one opening it recorded, and the 256 px aliasing it found on type90, leclerc_sxxi and leo2a6_ua is noted on their
  rows.
- `docs/geometry-gate/contig-hidden.json` (guards 229) — the §B2 fleet hidden-gap audit: per tank, the plan gaps the
  hull-anchored lattice reads and the pre-227 raster missed, as exact vehicle-frame pixel boxes
  (`tools/contig-hidden-gaps.mjs`, from `tools/contig-phase-audit.mjs` rows). `tank-standard-check` passes those as
  known work orders and fails any other gap; `--prune` a closed gap, fix a new one.

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

**The core run in shards (test-speed R9a, 2026-10-16).** The core run used to play on four worker threads inside one
receipt, which every pool counted as one slot. Eight receipts now play it,
`server/battlePacingShard1.selftest.mjs` to `server/battlePacingShard8.selftest.mjs`. Each one plays the maps at its
index modulo 8 on one thread, with every per-match assertion, and writes the records into the run's directory,
`COT_SELFTEST_RUN_DIR`. `server/battlePacing.selftest.mjs` then merges those records. Every map's samples must appear
exactly once, at their seeds, played on this tree. It judges the 132 by the same gate and prints the same lines in
`MAP_IDS` order.

- **Who makes the directory.** `tools/run-selftests.mjs` makes a fresh directory for each invocation. A gate that runs
  the receipts with its own pool must export one fresh directory for each pool invocation, for example
  `export COT_SELFTEST_RUN_DIR=$(mktemp -d $G/selftest-run.XXXX)` before `pool.mjs`. Such a pool must also launch its
  children with `selftestChildEnv()` from `tools/run-selftests.mjs` (or add its `SELFTEST_GRAPH_GUARD` to
  `NODE_OPTIONS`), so a failing assert on a three.js object fails with labels instead of dumping both scene graphs. A directory reused by a later
  invocation would hand it the records an earlier invocation played, on whatever the tree held then (records name
  their tree's path, not its contents). The pool should also admit the judges
  (`SELFTEST_LAST_FILES` in `tools/run-selftests.mjs`) after the rest. Without a directory the judge cannot see the
  shards' records and plays all 132 again on four threads; it says so in its log. Separate `--shard=i/n` invocations
  are separate runs too: they share records only through one exported directory.
- **Records do not outlive their run.** No run reuses another run's records. Each tree writes into its own
  subdirectory.
- **Each share is played once.** A share is played by whichever process claims it first. A claim is created
  atomically and names its pid. A shard whose share already has records from this run, or whose claim the live judge
  holds, has nothing to play and passes; the judge plays and judges those matches. A shard whose match fails its
  assertion releases its claim before it fails, so the judge plays that share at once (and fails on it too) without
  trusting the dead shard's pid, which the system may hand to another process. The claim of a holder killed outright
  (a memory cap or a timeout) is taken over once its pid is dead.
- **Ordering.** The runner admits the judge after every other receipt, so in `npm test` it only merges. A pool that
  orders receipts some other way still plays each share once. The judge waits while a live process holds a share's
  claim, however long it plays; a pool's timeout bounds a hung one, whose claim then dies. It gives an unclaimed share
  10 s in case a shard is starting, and then claims and plays what is left, `COT_PACING_JOBS` shares at once on
  worker threads (by default a quarter of the cores, 1 to 4). In an ordinary pool run every shard has claimed its own
  share by then, so the judge plays nothing; the threads matter when the shards did not run (`--only` on the judge, or
  their PASSes reused while the judge's was not).
- **Missing shares.** The judge always judges all 132. Without a run directory, as in
  `node server/battlePacing.selftest.mjs`, it plays them all itself, on `COT_PACING_JOBS` worker threads (by default
  a quarter of the cores, at most four).
- **The protocol's receipt.** `server/battlePacingRun.selftest.mjs` covers the partition, the report check, the merge,
  the claims and the hand-over, on fixtures.
- **Cost (measured 2026-10-16 and 2026-10-17, beside each other on a loaded host).** The eight shards and the old
  receipt played byte-identical records: the same 132 matches, per-map lines and median (212.2 s). CPU time is
  unchanged: 1,032-1,053 s for the shards against 973-1,016 s for the old receipt. Each shard runs one thread at
  0.47-0.88 GB; the old receipt ran four threads in one process at 2.45 GB. A one-thread receipt's wall on a quiet
  core is its CPU time: shard 2 takes the longest, 196 CPU-s, because Blackglass's matches run to the 900 s cap, and
  shard 8 the shortest, 89 CPU-s. The old receipt's best was 318 s on four threads. The judge merges in 0.9 s
  (78 MB).

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

The browser-era `npm run tank:freeze:check` ledger (`docs/FLEET-FREEZE-CURRENT.json`) is no longer maintained. It is
not a release step: a nightly or explicit refresh may scope it with `--ids=<ids>` (other rows kept as recorded).

### Changed-only regeneration (2026-10-16)

The owner's rule (226): "no regenerating for tanks or anything else that didn't change". After a tank change run

    npm run tank:regen:changed                 # changed ids only, then the final resolve must be empty
    npm run tank:regen:changed -- --verify     # then each step's check on exactly the ids it ran
    npm run tank:regen:changed -- --ids=<ids>  # every step on exactly a lane's own tanks (the world steps on their donor maps)
    npm run tank:changed -- --explain=<id>     # which steps would re-run an id, and why (no tank is built)

**Refusals and `--ids` (266).** With no `release/fingerprints.tsv` (main before 265's bootstrap), or one recorded on
another toolchain (`changed-ids` prints this run's toolchain parts next to the table's hash), every id resolves as
changed, so a plain run, `--dry-run` or `--verify` refuses with exit 2 before anything runs: "no fingerprints table:
pass --ids=<ids> for a lane-scoped regen, or --all to bootstrap" (on a toolchain mismatch, "or --all to re-record").
`--ids=<a,b>` runs every step on exactly those ids and the world steps on the maps that cast them as wreck donors; with a
table it keeps the fixpoint among the ids and records their rows (the next plain run finds the rest; the chain receipt
holds that `--ids` then a plain run equals a whole-fleet regen byte for byte), without one it runs each step once and
records nothing. An unknown or repeated id is refused. `--help` prints the usage. A receipt that a fleet record only
names (`docs/references/concepts/*.json` list their receipts) is no build input: five sat in the core key until 266, so
an edit to one marked every id; `fleet-partition.selftest` now fails on any test-only tooling in a build's or step's key.
The public pages are no step input either: `src/ui/localeRouting.ts` only names them as route strings (declared
`namesOnly: ['*.html']` in `tools/changed-only/steps.mjs`). Before that a document-head edit marked centering and icons
on every id and the wreck plan, collision and trench steps on every map; now it marks none, and `fleet-partition.selftest`
fails if a page enters a step key (a step that really reads one is listed in its PAGE_READERS).

The chain (`tools/tank-regen-changed.mjs`) regenerates the paint catalog and legacy specs, then runs controls, fills,
seats, spare-track, anatomy and marking to a fixpoint (seats read the fills and roof guns; the dock seats feed the
spare-track keep-out), then the geometry ledger, the manual reference, centering and icons (capture lock, holds of at
most 20 minutes; centering re-runs the CPU steps for any id whose anchors moved). Every CPU child runs
`nice -n 10 node --max-old-space-size=4096` after `headroom can-start`; fills run with the release preset
(`gen-interior-fills --release`, = `--rounds=8 --min-fine=1`; the bare defaults warn) as `--jobs` parallel parts merged
by the tool itself (`gen-interior-fills --merge-from`). Options: `--dry-run`, `--steps=a,b`, `--no-gpu`, `--jobs=N`,
`--all` (every step on the whole fleet first: bootstrap or explicit full) and `--check --all` (nightly: every step's
whole-fleet `--check`, writes nothing, exits 1 on a stale step). Fills have no check mode of their own:
`tools/changed-only/fills-check.mjs` measures the ids into scratch with the generator's code and flags and compares
each record and its moving-clearance cells (`--ids=<ids>` or `--all`, `--jobs=N`).

How an id is chosen (`tools/changed-ids.mjs`, `tools/changed-only/`): each (step, id) has an input key and an output
key in `release/fingerprints.tsv`, written as soon as the step finishes. The input key covers the step's tool (its
static import closure, canonical flags from `tools/changed-only/steps.mjs`, declared dynamic reads, the environment
variables it reads), the toolchain (Node, platform, both lockfiles, NODE_OPTIONS minus heap flags), the shared fleet
core (every file the fleet entries reach outside a group's builder registration: specs, factory, kits, materials,
generated spec data, index/loader maps), the builder groups on the id's spec chain (visualBase, variantOf, donors) and
the rows of every per-id table the fleet reads for those ids. The output key is the id's rows in the tables the step
writes. An id re-runs when its row is missing or either key moved; a hand edit to one output row marks that id.

It fails closed: an undeclared directory read, child process, computed import or whole-environment read in a step's
closure runs that step on every id; a roster change, a missing manifest, an unreadable table or an output file edited
outside its rows runs the step whole-fleet. Dynamic reads are declared in `steps.mjs` (`DECLARED_DYNAMIC`) and pinned
to their exact call sites: editing such a call turns `tools/changed-only/fleet-partition.selftest.mjs` red and the
step runs on every id until the declaration is reviewed and re-pinned. A change to the shared core (for example
`tankFactoryCore.ts` or `profiles/kit.ts`) marks every id: changed-only then means one ordered pass, not a skip.

Proofs: `tools/changed-only/resolver.selftest.mjs` (fixture: skips, shared kits, tool/flag/toolchain/roster edits,
undeclared reads, hand-edited rows), `fleet-partition.selftest.mjs` (the real fleet decomposes, pins hold, the demand
loaders match the eager factory, the Ukrainian donor kit marks all of national modernization, seats after fills and
controls) and `chain.selftest.mjs` (the real chain on a fixture fleet: changed-only outputs and manifest byte-identical
to a whole-fleet regen). `node tools/changed-only/closure-trace.mjs` (about 40 child-minutes) loads each builder group
alone and fails on any module outside its keyed closure; `node tools/changed-only/parity.mjs --changed=<C> --full=<F>
--base=<B>` compares a changed-only tree with a whole-fleet regen of the same commit and proves the resolver's sets
covered every row that moved. `fresh.selftest.mjs` is the gate's generator-freshness receipt (one fingerprint state, about 55-75 s warm, no
builds). Since 265 committed `release/fingerprints.tsv` (the bootstrap: `npm run tank:regen:changed -- --all`, outputs
and manifest committed together), any builder, kit, spec, generator or flag edit landed without its regeneration turns
it red with the ids and the reasons, and a missing or unreadable manifest fails too (Main, 2026-10-29: a guard that
passes vacuously is no guard). Its negative controls, run on the same state, show that an edited generator, a moved
input and a hand-edited output row are each caught. A toolchain difference is reported, not failed (the nightly covers
it).

Refreshing the fingerprints in a lane. `release/fingerprints.tsv` is a generated output like the tables: never edit it
by hand, and never take one side of it whole as the merge result.
- A lane that changes a builder, kit, spec, generator or per-id table runs `npm run tank:regen:changed` (`--dry-run`
  or `npm run tank:changed -- --explain=<id>` first shows what it will run). The chain rewrites the marked ids'
  outputs, their keys and the manifest's component lines; commit the manifest in the same commit as those outputs.
- A tools-only edit inside a generator's closure (its imports, flags or declared reads) moves that step's tool key, so
  the chain runs that step on every id. When the outputs come back byte-identical, only the manifest's keys move, and
  the manifest alone is the commit.
- After merging main or another lane into a branch that touched generated outputs, resolve the output tables first
  (keep the rows from both sides). Then take either side's `release/fingerprints.tsv` and run
  `npm run tank:regen:changed` on the merged tree: it re-runs only the ids whose keys moved and rewrites the manifest.
  A passing `fresh.selftest.mjs` is the proof.
- A lane that cannot run a step (centering and icons need the capture lock) leaves that step stale and names it in its
  handoff. `fresh.selftest.mjs` stays red until the integrator's round runs the step, before the gate.
- The keys read only what every checkout holds. A file under the gitignored `public/models/` is keyed by its path, not
  its bytes or presence; a tool that reads one checks it against a sha256 pinned in a tracked file. A route in the
  app's own source (`/docs/${topic}`) names no directory (`tools/changed-only/graph.mjs` header). When
  `fresh.selftest.mjs` passes in one checkout and fails in another at the same commit, an untracked file is reaching
  the tool key of the step it names ("tool … or its flags"): compare that step's `toolFiles` from `computeState` in
  the two checkouts.

The independent tripwires keep full keys: `fleetPassHigh`, `fleetPassLow` (ledger rows), `fleetPassDefault`,
`fleetLazy`, `fleetFloorClearance` and the nightly `--check --all` never use the resolver, so a resolver miss still
turns the gate red.

World steps (2026-10-17). After the tank steps the chain runs the wreck bake plan (`tools/wreck-bake-plan.mjs --write`),
the collision shards (`tools/capture-world-collision-manifests.mjs --node`) and the assault-trench shards
(`--variant=assault-trenches`) per map, on the maps whose keys moved (`--no-world` skips them;
`--steps=wreckPlan,collision,trenches` runs them alone; `npm run tank:changed -- --maps` reports them). A map's key
(`tools/changed-only/world.mjs`) holds the step's world core (the tool's closure stopped at the fleet entry modules, with
the map registry's config imports dropped: about 500 files, so a world-core edit marks every map), the map's own config
closure (one to five files; a config another config imports marks both), the fleet core and roster (every map reads
spec data), and per wreck donor (the wreck plan's rows, plus any roster id the config names) its builder key and
build-read rows. A tank edit therefore recaptures only the maps that bake that tank (a t90am builder edit: coastal).
World files that reach the fleet are pinned in `FLEET_API_USERS`; the world outputs are never inputs. A frame edit of
the index or the plan file, a map roster change or a missing record runs the step on every map.

Runtime proofs (scratch trees, niced): `node tools/changed-only/trace-check.mjs --root=<tree> --ids=<ids>` runs each CPU
step under the read trace (`trace-reads.mjs`) and fails on any repository read outside the step's key (module loads of
other groups' builders, which the eager factory registers without running, are reported apart; spare-track's profile
lint is declared verdict-only). `node tools/changed-only/world-trace.mjs --steps=collision` builds every map through
the step's own `--check` (writes nothing) and fails when a map loads a builder group outside its donors' chains or reads
a file its key does not hold. `world.selftest.mjs` covers the world keys on a fixture world, and `chain.selftest.mjs` runs
a world step end to end (a kit edit rebuilds only the map whose donor is built on it).

Run a targeted release check:

    npm run tank:release:check -- --ids=<tank-id>

The target check covers generated assets, muzzle bore, geometry standards,
the fleet geometry ledger and mission-seat receipts for the selected ids,
tests, and private build. A tank lane adds `--lane`: the same steps without
the embedded suite and private build, which the integrator mode and the release
gate (the default receipt tier and `npm run build`) run ("Fast checks" above). See
TANK-ASSET-PIPELINE.md and BUILD-STANDARD.md for
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

The public pages take their media through one wiring step: the picks
(`tools/media-r5/site-media/picks.json`) build `public/media/site50-r14`
(`site-media.mjs`), and `node tools/media-r5/site-media-wire.mjs --root=<tree>`
rewrites every block that shows them (the manual's hero loops, reels and figures,
the game's featured stills, the catalog copy in both locales), each rewrite matching
its block exactly once or writing nothing. The Field Manual's own screens are
`public/media/docs-r1` (its `manifest.json`). Every referenced collection must be a
current round in `tools/media-freshness.selftest.mjs` (a retiring one passes only
until its replacement lands), and `tools/media-r5/site-video-budget.selftest.mjs`
holds the loops' rungs and pre-scroll bytes.

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
2. The Field Manual (`src/docs`: `topics.ts`, the data-built chapters in
   `src/docs/chapters`, prerendered by `tools/docs-prerender.mjs`) and
   FEATURES.md: the public manual and feature evidence.
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

### UI icons (brand-ui BUI-F4)

Every UI glyph lives once, as a `<symbol>` in `src/ui/icons/sprite.svg`: 24-unit masters
(`i-<id>`) plus 16-unit optical masters (`i-<id>-s`) for the glyphs drawn at 18 px and
below. `icon(id, options)` in `src/ui/icons/icon.ts` returns the host `<svg>` that carries
the viewBox, the one stroke per optical size (1.5 / 1.25), square caps, mitre joins and
`currentColor`; the boot slice mounts synchronously and the full sprite from its own lazy
chunk. `uiIconSVG` (`src/ui/uiIcons.ts`) is the compatibility call for surfaces not yet
rebuilt. After editing the sprite run `node tools/gen-icon-sprite.mjs` (ids, small and
active sets, boot slice, the Studio tab mark and the README pictograms) and
`node tools/icon-stroke-census.mjs`; `node tools/icon-sheet.mjs` renders a CPU-only
review sheet at 64, 24 and 16 px.

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
`rockCollision.selftest.mjs`): the movement record is the stone's tiers (round 2), nested columns
from the record's floor, the first the hull of the stone standing 0.2 m or more over its ground (a
formation's block 0.3 m: the toe under it is a track's to roll over, and the audit read the ground
outline's toe as air over main's footprint) to 0.7 m over the highest ground it leaves, the next the stone above it
0.6 m higher; above that contact band (1.3 m over the highest ground) each next one 0.4 m higher with twelve corners
(round 3: a dome's tiers narrow with it), the last stopping 3 m over the stone's highest foot (a hull's roof: a hoodoo's
stem above it is the shells'), so its floor
on the stone steps as the stone does (a column within a hull's step-up is stood on and is a floor by
the same rule); the shell and sight colliders are ranged slabs of the stone's sections ('w' parts,
no format change) with a toe ring where the stone flares at its foot. A stone rising less than 0.45
m is driven over: under 0.25 m it has no collider; from 0.25 m (round 3) it is a crushable small rock
whose records are the stone's own, so shells and sight stop on it until a hull crushes it and no hull,
route, seat or clearing reads it. The crushable small rocks stop shells like the other dense crushable
cover, and a crushed one reads as crushed (`src/world/crushedStones.ts`, receipt
`crushedStones.selftest.mjs`): its middle presses into its ground, two flakes split off it either side
tipped outward into the ground, three chips land round it, and its scuff darkens the contact layer
under it. All of it is hashed from the stone's place, lies until a rematch, and draws nothing until a
stone is crushed: the flakes and chips come from one instanced pool per rock form, and the scuff disc
is folded to a point. `props.ts` keeps the legacy records through every placement pass and refits
them once all have run, so no prop moves.

The props' leaning solids take shell slabs the same way (`src/world/slabCollision.ts`): a sandbag
stack's shell record is its own geometry's slabs (it published none, so shells passed 70-96 % of the
stacks), a tank wreck's the convex hull of its hull and turret vertices cut in 0.5 m slabs (the
movement record stays the solids' prisms, a hull's floor), each hedgehog beam its own slabs, and a
pylon leg its footing and the strut's slabs to the leg's end (the lattice's 4-6 cm braces carry
none). A formation's standing blocks keep their own outlines and their own tiers. Its loose pieces
that rise past the drive-over line (round 3: the fallen blocks and leaning slabs at a stack's foot)
carry a fallen mass of their own, laid from the desktop's pieces on every tier: a phone draws those
pieces where the desktop does, so every tier lays the same colliders. A rubble pile's records come
from the chunks it draws (`src/world/rubbleCollision.ts`: each chunk past 0.2 m in 0.5 m shell slabs,
its outline a crush trigger), and the heavy trucks' shells from their own slabs. `--families=formations`
holds them to the legacy hull by the map's union of formation stone (the `scenery-union` row: empty
ground plus uncovered stone). A stone a hull drives over has no collider and a shell aimed at it
meets the ground behind it, and a shell aimed at a low one meets the stone (`rockDriveOver.selftest.mjs`);
a crushed stone stops no shell from the tick it is crushed (`crushableClutter.selftest.mjs`). Where the stones' own colliders left a sector
under the layout brief's cover band or a map's fights off balance, the map authors cover as scenery
formations of its own stone (`scenery.rocks`): Reservoir's slate crags, and fields of fractured
blocks (`form: 'blocks'`: size-graded, a third to over half sunk, a skirt of chips) of the Moon's
and Mars's breccia (dust banked at the foot, no lichen) and of the other maps' own rock. They are
placed after every prop and skip nothing a prop stands on (the scenery receipt names an overlap), so
a site is chosen clear.

Every convex part is convex in fact: `collision.ts convexOutlineInPlace` drops the repeated corners
and those that turn against the outline's winding when a shape is set and when a shard is decoded
(the shell clip, the point test and the movement SAT read every edge as a half-plane, so one reflex
corner cut away the part behind its line). `server/convexOutlines.selftest.mjs` holds every convex
part of every shard to at least 99 % of its outline in the game's own point test, with level shells
through its middle stopping on it.

To see the colliders in the game, `window.__DEBUG.colliderOverlay({ x, z, radius })` draws every
record round a point (orange movement, cyan shells and sight; a stretch a mesh hides faint and
dashed; a stone's tiers stacked; a legend in the corner says the movement record stands to a hull's
roof, so an overhang above it is shells' only; `null` removes it), and `tools/visual-census.mjs
capture --overlay=colliders[:<radius>]` shoots each view a second time with it
(`<view>-colliders.png`); `--pose=<map>/<name>:...` binds an authored pose to one map.

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
