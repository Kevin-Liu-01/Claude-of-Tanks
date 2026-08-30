# Development and verification guide

This guide explains how to run, test, inspect, and release Claude of Tanks. It
is the operational companion to SYSTEMS.md.

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

Start the dedicated match and ranked HTTP service:

    npm run server:match

The default service uses port 8790. Production requires secure WebSocket and
HTTP endpoints, explicit origin configuration, persistent rating storage, and
deployment-specific signaling/TURN configuration.

Production private rooms automatically request short-lived credentials from
`/api/ice`. Configure either a Cloudflare Realtime TURN key:

    COT_CLOUDFLARE_TURN_KEY_ID
    COT_CLOUDFLARE_TURN_API_TOKEN

or a provider-neutral JSON array of ICE servers:

    COT_TURN_ICE_SERVERS_JSON

`COT_TURN_TTL_SECONDS` optionally controls the short-lived Cloudflare
credential lifetime (clamped to one hour through one day; default eight
hours). `VITE_ICE_CONFIG_URL` is only needed when credentials are served from
a different endpoint. Long-lived provider secrets must never use the `VITE_`
prefix or enter the browser bundle.

Before certifying private rooms in production, check both service surfaces:

    curl -fsS https://cot.kevinliu.studio/api/signal
    curl -fsS https://cot.kevinliu.studio/api/ice

Or run the release gate, which validates both responses and requires TURN:

    npm run net:prod:check

The signaling response must report a ready command store. The ICE response
must be HTTP 200 and include at least one `turn:` or `turns:` URL. A 503 or a
STUN-only list cannot reliably connect friends behind restrictive NATs.

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

Node CLI, generator, and self-test entrypoints intentionally retain `.mjs`
where they are executable harnesses rather than shipped application modules.
They import the checked TypeScript owners directly and are covered by the
ordered test inventory.
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

Build the public artifact:

    npm run build

The public build runs Vite with public mode and then strips quarantined
comparison assets.

Build the private artifact:

    npm run build:private

The private build retains local authoring and comparison resources required by
internal workflows.

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
