# Automation paths

Which path the game runs for a browser tool, and which tools take which one (2026-11-02 audit S3). The lists below
are checked against the tools by `src/app/automationPath.selftest.mjs` and `tools/game-readiness.selftest.mjs`: a tool
that changes path, adds a battle entry, starts writing the game's state or reads it to wait must be listed here in the
same change.

## How a page picks its path

The game reads its automation path in one place, `src/app/automationPath.ts`, and only from an explicit request; it
never sniffs the driver (`navigator.webdriver`):

| request | path | what the game does |
|---|---|---|
| `window.__COT_AUTOMATION = 'harness'` or `?automation=harness` | harness | QA surfaces on (`window.__DEBUG`, the drive test); the entry gate auto-skips; transitions run their work synchronously with no veil; the battle and Garage scene black watchdogs and the device-diag rescue stay off |
| `window.__COT_AUTOMATION = 'player'` or `?automation=player` | player | everything as for a player: the entry gate waits for a key (`?nosplash` / `?nogate` still skip it), every veil and fade runs, the watchdogs run; no QA surfaces unless a dev server or `?debug=1` asks for them, as for any player |
| none (a player, or any driver that asks for nothing) | player | a player's page |

Every browser a tool launches asks for the harness path: `tools/browser-launch.mjs` `launchGuardedBrowser` (the one
launcher, `tools/browser-launch-census.selftest.mjs`) hands the browser to `prepareToolBrowser` in
`tools/game-readiness.mjs`, which registers the request (`HARNESS_DEFAULT_SCRIPT`) on every page before the tool sees
it: puppeteer's open pages, `Browser.newPage`, `BrowserContext.newPage` (`createBrowserContext`, the default context),
and playwright's `newContext`, `Browser.newPage` and a persistent context. A browser a tool connects to instead
(playwright's `launchServer` + `connect`) goes through `prepareToolBrowser` itself. The request is the page's first
init script, so a tool that wants the player's path asks after it and wins: `requestAutomationPath(page, 'player')`
(or `window.__COT_AUTOMATION = 'player'` inside its own init script), before navigating; a `?automation=` in the URL is
left to the URL. An agent-browser session tool (`tools/map-shadow-audit.mjs`, `tools/render-stability-audit.mjs`,
`tools/capture-world-collision-manifests.mjs`) is opened by its operator: its usage opens the session with
`&automation=harness`, and it checks the path the session's page took (`sessionPathProblem`). A person or an agent
browsing the game with no request gets the player's path; add `?automation=harness` for the shortcuts.

Never spoof `navigator.webdriver` in a page to pick its path: a request is how a page picks it. The one exception is
`tools/click-timeline.mjs`, whose battle document must boot driven on an older build too (below): its probe mirrors
its one choice (`window.__cotAutomation`) onto the request and onto `navigator.webdriver`, which the owner never reads.
Analytics and telemetry keep their own `navigator.webdriver` exclusion, so a tool that hides the driver at launch for
an older build (below) counts as a player there on a production host, as every player-path tool did before
2026-11-03. The page publishes the path it resolved as `window.__AUTOMATION_PATH` (read-only), next to the app
lifecycle (`window.__APP_LIFECYCLE`).

So every receipt not listed under the player's path certifies the harness path: no entry gate, no veils, no scene
watchdogs. A regression in one of those machines is visible only to the player-path tools.

## Tools on the player's path

Each one checks after the boot that its page took the player's path (`assertAutomationPath(page, 'player')`), and
fails by name otherwise. A build before 2026-11-03 ignores the request and decides by `navigator.webdriver` alone, so
the tools that may load such a build (an A/B base, a deployment) also launch with
`--disable-blink-features=AutomationControlled`, which gives that build the player's path too: battle-entry-sweep,
black-world-repro, click-timeline, cold-load-probe, garage-battle-actions-probe, gate-audio-probe and nav-timeline.
Hiding the driver also hides that build's QA surfaces (`window.__DEBUG`, installed there only under
`navigator.webdriver` or `?debug=1`). click-timeline's battle document needs them, so on such a build it boots with
`navigator.webdriver` reading true (the exception above) and hands over to the player's path once the Garage is up,
as it does through the request on a newer build; its game document is the player's throughout.
loading-budget-probe and solo-cold-import-cover-probe serve the checkout they run in.

<!-- census:player -->
- `tools/battle-entry-sweep.mjs`: the covered solo entry, its scene watchdog included, on every battlefield
- `tools/black-world-repro.mjs`: the black-world hunt through the real Garage controls
- `tools/click-timeline.mjs`: the battle document boots driven (harness; `navigator.webdriver` on an older build) for `__DEBUG`, then takes the player's veils once the Garage is up
- `tools/cold-load-probe.mjs`: a new player's cold load, with no QA runtime in its timings
- `tools/garage-battle-actions-probe.mjs`: the Garage's BATTLE, Battle Again and return with real input
- `tools/gate-audio-probe.mjs`: the entry gate and the audio it unlocks
- `tools/loading-budget-probe.mjs`: with `--transitions`, the player-facing fades
- `tools/nav-timeline.mjs`: the navigation timings with every veil and fade
- `tools/solo-cold-import-cover-probe.mjs`: the cold solo entry's cover
<!-- /census -->

## How the tools enter a battle

`__DEBUG.startBattle` is synchronous from the tool's view and skips the countdown arm and the player's entry (the
loading cover, the reveal): its battle is live at once. `__DEBUG.beginSoloBattle` runs the solo entry with its cover
and countdown. `__DEBUG.beginBattleEntry` is the BATTLE button's own handler, the player's entry.

Through `__DEBUG.startBattle` (no countdown, no cover):

<!-- census:startBattle -->
- `tools/aim-parity-probe.mjs`
- `tools/aimflow-probe.mjs`
- `tools/atgm-guidance-probe.mjs`
- `tools/audio-mix-balance.mjs`
- `tools/audio-spatial-killcam-probe.mjs`
- `tools/bot-combat-probe.mjs`
- `tools/dev-perf-probe.mjs`
- `tools/gunnery_gate.mjs`
- `tools/ifv-recoil-probe.mjs`
- `tools/isometric-camera.browser.mjs`
- `tools/map-shadow-audit.mjs`
- `tools/mobile-dynamic-aim-probe.mjs`
- `tools/mobilelap.mjs`
- `tools/pad-e2e.browser.mjs`
- `tools/pause-probe.mjs`
- `tools/perfprobe.mjs`
- `tools/reticle-shot-parity-probe.mjs`
- `tools/reviveprobe.mjs`
- `tools/salvo-indicator-probe.mjs`
- `tools/sfx-smoke.mjs`
- `tools/smoke-launchers.browser.mjs`
- `tools/solo-kernels-probe.mjs`
- `tools/spotting-check.mjs`
- `tools/voice-smoke.mjs`
<!-- /census -->

Through `__DEBUG.beginSoloBattle` (the solo entry, its cover and countdown):

<!-- census:beginSoloBattle -->
- `tools/audio-mix-balance.mjs`
- `tools/battle-entry-sweep.mjs`
- `tools/battle-memory-probe.mjs`
- `tools/battle-spike-census.mjs`
- `tools/black-world.browser.selftest.mjs`
- `tools/couch-panes.browser.mjs`
- `tools/daynight-atmosphere-probe.mjs`
- `tools/destruction-first-use.browser.selftest.mjs`
- `tools/dev-perf-probe.mjs`
- `tools/environment-motion-probe.mjs`
- `tools/gunship-lens-strip.browser.mjs`
- `tools/map-probe-runtime.mjs`
- `tools/marketing-shots/mode-battle-shots.mjs`
- `tools/mobilelap.mjs`
- `tools/phase-resource-probe.mjs`
- `tools/render-stability-audit.mjs`
- `tools/second-solo-battle.browser.selftest.mjs`
- `tools/shadow-render-truth.mjs`
- `tools/suspension-strip-probe.mjs`
- `tools/track-system-audit.mjs`
- `tools/water-palette-probe.mjs`
<!-- /census -->

Through `__DEBUG.beginBattleEntry` (the BATTLE button's handler):

<!-- census:beginBattleEntry -->
- `tools/audio-probe.mjs`
- `tools/battle-spike-census.mjs`
- `tools/loading-budget-probe.mjs`
- `tools/perfprobe.mjs`
- `tools/pinch-zoom-probe.mjs`
- `tools/time-to-battle-probe.mjs`
<!-- /census -->

Other tools press the real Garage controls (the BATTLE button, the Play menu) or join a room.

## Tools that write the game's state outside its transitions

These states are ones the game's own owners never produce that way; a receipt from them certifies the tool's state.

The countdown (`game.preBattleS`, whose one game writer is `transitionBattleCountdown` in
`src/game/preBattleCountdown.ts`): `0` releases the controls at once, `999` holds them, `Infinity` freezes the frame
loop's battle stepping (the lifecycle then reads 'loading').

<!-- census:preBattleS -->
- `tools/audio-mix-balance.mjs`
- `tools/audio-probe.mjs`
- `tools/audio-spatial-killcam-probe.mjs`
- `tools/ifv-recoil-probe.mjs`
- `tools/mobile-dynamic-aim-probe.mjs`
- `tools/reticle-shot-parity-probe.mjs`
- `tools/sfx-smoke.mjs`
- `tools/suspension-strip-probe.mjs`
- `tools/track-system-audit.mjs`
<!-- /census -->

The battle ordinal (`game.battleCount`, which seeds the roster, the time of day and the weather):

<!-- census:battleCount -->
- `tools/daynight-atmosphere-probe.mjs`
- `tools/water-palette-probe.mjs`
<!-- /census -->

The battle loading cover's classes (`.cot-bl` `on`, toggled by hand to stage the loading screen):

<!-- census:loaderClasses -->
- `tools/six-modes.browser.mjs`
<!-- /census -->

The reveal latch (`window.__BATTLE_REVEAL`, reset to see the next reveal):

<!-- census:reveal -->
- `tools/battle-entry-sweep.mjs`
- `tools/click-timeline.mjs`
<!-- /census -->

## Waiting on the game's state

Wait through `tools/game-readiness.mjs`, never on a hand-built predicate. The audit counted eight definitions of
"the battle is playable" (the phase, `preBattleS`, the loader's classes read four ways, the HUD's display,
`__BATTLE_REVEAL`, `result`, `timeS`) and three of "the Garage is ready"; `__GAME_READY && phase === 'garage'` was
true under a return's veil and behind the battle report, and `phase === 'battle' && preBattleS <= 0` under a network
join's cover. The module reads the game's published lifecycle (`window.__APP_LIFECYCLE`, src/game/appLifecycle.ts):

| readiness | lifecycle states | use it for | on a build with no lifecycle | ... and no `__DEBUG` |
|---|---|---|---|---|
| `garage` | garage | a settled Garage screen: the boot splash gone, no return under its veil, not behind the report | booted and `phase === 'garage'` | booted, `.cot-garage` shown, no live `#cot-boot`, `.cot-trans.on`, `.cot-bl.on` / `.leaving` or `.cot-es.show` |
| `battleRevealed` | countdown, live, verdict, report | the battle is on screen (its cover is gone) | `phase === 'battle'`, no `.cot-bl.on` / `.leaving` | `.cot-hud` shown, no `.cot-bl.on` / `.leaving` |
| `controlsReleased` | live, verdict, report | the countdown is over (what `phase === 'battle' && preBattleS <= 0` meant) | `phase === 'battle' && preBattleS <= 0` | cannot be read (null) |
| `battleLive` | live | controls released and no verdict | the same, and no `result` | cannot be read (null) |
| `battleEnded` | verdict, report | the verdict landed | `phase === 'battle'` and a `result` | `.cot-es.show` (the report) |
| `studio` | studio | the Studio owns the scene | `phase === 'studio'` | `.cot-studio` shown, no `.cot-trans.on` |

`readinessExpression(name, { since })` is the in-page expression (add a tool's own conditions with `&&`);
`waitForReady(page, name, options)` waits and returns the facts; `since` takes a lifecycle `transitions` count so a
wait means the next battle, not the one on screen. A build that publishes no lifecycle (before 2026-11-03: a
deployment, an A/B baseline) never passes a readiness on its boot alone: each readiness falls back to the predicate
that build's own harnesses waited on (the fourth column), its facts say `lifecycle: false`, and `since` has no count
there. Such a build opened on the player's path without `?debug=1` has no `__DEBUG` either (black-world-repro
`--plain` against prod): each readiness then reads what the page shows (the last column; facts `legacy.source`
'dom'), and the two that need the countdown cannot be read there, so `waitForReady` fails naming that instead of a
bare timeout (open such a build with `?debug=1` for them). A build whose screen has none of the elements that
fallback reads (`legacy.landmarks` false: an A/B baseline old enough to differ) fails by that name too. Which
definition decided is never silent: on a build with no lifecycle the page logs a `[cot-readiness]` line once a document
for each definition, and every page a launched browser hands out forwards it to the tool's stderr (`prepareToolPage`),
so a receipt's log says the legacy predicate decided. `scenePhaseExpression(phase)` is a timing edge, not a readiness:
who owns the scene (a Garage return writes the Garage's scene under its veil, before the screen settles), for a check
that times how soon a hand-over began (pause-probe's Leave), followed by a READY wait before the screen is read. `BOOT_LOADED_EXPRESSION` / `waitForBootLoaded` is the boot latch's harness mirror (`window.__GAME_READY`,
written by src/app/bootReadiness.ts): the boot finished loading, while the entry gate may still wait on the player
(the lifecycle's 'boot' state until it is dismissed).

`tools/game-readiness.selftest.mjs` reads every tool, and every selftest that drives a page, as code (comments
blanked by TypeScript's parser, so a glob string such as `'**/*'` is not a comment) for the facts behind those
definitions: the boot mirror, a comparison of the app phase or of the countdown, the loader's `on` / `leaving` classes
or the loader element itself, the HUD's computed display, and a read of the reveal latch. Each tool that reads one
itself is listed below with its reason.

Waits and polls built by hand:

<!-- census:handBuiltWaits -->
- `tools/air-support-shots.mjs`: release 270's file: its page helper's `ready` predicate is the boot mirror itself (`window.__GAME_READY === true`); move it onto `BOOT_LOADED_EXPRESSION` in a later round
- `tools/battle-entry-sweep.mjs`: the covered entry is its subject: each run samples the reveal latch and the loader to judge that entry
- `tools/battle-memory-probe.mjs`: its entry time is measured to the phase edge itself
- `tools/battle-spike-census.mjs`: its trace starts at the phase edge itself (the covered load is the recorder's, the countdown and the fight are the trace's)
- `tools/black-world-repro.mjs`: the black-world hunt: it watches the cover lift and the HUD show (the visual edge it hunts at) and samples the loader in its monitor
- `tools/building-style-shots.mjs`: release 270's file: one hand-built wait for the boot mirror and the shot hooks (`__SHOTS`, `__DEBUG`) together; move it onto `waitForBootLoaded` and a hook wait in a later round
- `tools/built-env-shots.mjs`: release 270's file: one hand-built wait for the boot mirror and the shot hooks (`__SHOTS`, `__DEBUG`) together; move it onto `waitForBootLoaded` and a hook wait in a later round
- `tools/click-timeline.mjs`: measures the Garage's paint, the entry gate and the reveal latch (visual edges), not readiness
- `tools/controls-probe.mjs`: times the loading cover's show from the click (a mutation observer on the loader)
- `tools/garage-action-timing.mjs`: times the Garage's and the battle's visual edges (painted, the loader's classes), its subject
- `tools/ground-surface-shots.mjs`: release 270's file: one hand-built wait for the boot mirror and the shot hooks (`__SHOTS`, `__DEBUG`) together; move it onto `waitForBootLoaded` and a hook wait in a later round
- `tools/interaction-steps.mjs`: click-timeline's steps: the cover's show and the reveal latch are what it times
- `tools/loading-budget-probe.mjs`: measures the loading screens and the exit, polling the phase inside the timed page function
- `tools/marketing-shots/mode-battle-shots.mjs`: another lane's file (tools-chains); migrate after it lands
- `tools/media-production/cinema.mjs`: another lane's file (tools-chains); migrate after it lands
- `tools/media-production/produce.mjs`: another lane's file (tools-chains); migrate after it lands
- `tools/media-r5/lab.mjs`: another lane's file (tools-chains); migrate after it lands
- `tools/media-r5/studio-ui.mjs`: another lane's file (tools-chains); migrate after it lands
- `tools/mobile-dynamic-aim-probe.mjs`: after `__DEBUG.startBattle` (no cover, no countdown) the phase confirms the battle, with the tool's own tank and touch conditions
- `tools/mp-room-census.mjs`: another lane's file (tools-chains); migrate after it lands
- `tools/nav-timeline.mjs`: measures the cover's and the HUD's visual edges, its subject
- `tools/pinch-zoom-probe.mjs`: measures box positions, so past the controls' release it waits for the loading veil out of layout (its leaving fade moves boxes)
- `tools/render-stability-audit.mjs`: an agent-browser session: it waits on its own entry promise, and the phase confirms the battle
- `tools/solo-cold-import-cover-probe.mjs`: the cold entry's cover is its subject: it judges the battle from its own cover observer's samples
- `tools/solo-kernels-probe.mjs`: after `__DEBUG.startBattle` (no cover, no countdown) the phase alone confirms the battle
- `tools/track-system-audit.mjs`: a page function closed over the tank id with its own conditions; the tool sets the countdown itself
<!-- /census -->

Checks and receipt fields that are not waits (a precondition, a loop guard, a branch, a recorded value). No
`waitForFunction` of a tool listed here reads one of these facts: the readiness selftest refuses one (such a tool is a
hand-built wait, listed above). An `evaluate` that a loop polls until a fact holds is a hand-built wait as well; the
census cannot tell it from a loop guard, so the row's reason says what each loop's read is for:

<!-- census:stateReads -->
- `tools/bot-combat-probe.mjs`: a loop guard: it stops stepping when the battle ends
- `tools/bot-targeting.browser.mjs`: a loop guard: the sample ends with the battle
- `tools/cold-load-probe.mjs`: records the boot mirror as a receipt field (`ready`)
- `tools/couch-panes.browser.mjs`: a receipt check: the page's battle HUD stands down (hidden) while the split screen's panes show their own
- `tools/daynight-atmosphere-probe.mjs`: receipt fields (the first battle render's loader, the reveal latch) and guards around its own entries
- `tools/environment-motion-probe.mjs`: a precondition and a receipt check that the battle is the requested one
- `tools/garage-audio-intent.mjs`: a receipt check: both samples in the Garage
- `tools/garage-camera-probe.mjs`: a receipt check: the boot lands in the Garage
- `tools/garage-draw-range-probe.mjs`: a precondition: the Garage's draw range needs the Garage
- `tools/garage-switch-probe.mjs`: a sampler guard: it samples only in the Garage
- `tools/gunnery_gate.mjs`: loop guards: they stop when the battle ends
- `tools/map-environment-acquisition.mjs`: a precondition: the Garage build stayed in the Garage
- `tools/marketing-shots/capture-multiplayer-dual-screen.mjs`: a timeout's diagnostics (the loader) and a check that both views stayed in the live battle
- `tools/marketing-shots/mode-battle-director.mjs`: a branch: the battle hooks run only in a battle
- `tools/mp-browser-e2e.mjs`: a timeout's diagnostics (the loader), a receipt field (the reveal latch) and checks that the battle stayed live
- `tools/mp-p2p-e2e.mjs`: a timeout's diagnostics and receipt fields (the loader) and a check that C's battle survived the migration
- `tools/pause-probe.mjs`: receipt checks: Esc in the Garage
- `tools/perfprobe-camera-input.mjs`: a precondition: the controls released before camera input
- `tools/perfprobe-roster.mjs`: receipt checks: each snapshot in a battle with released controls
- `tools/perfprobe.mjs`: a precondition in its early window (the controls released) and a receipt label
- `tools/reviveprobe.mjs`: records the HUD's display as a receipt field
- `tools/second-solo-battle.browser.selftest.mjs`: receipt fields: each sample's loading card (shown, its stage and percentage), a hang's diagnostics, the Leave's outcome (its `[garage return]` log lines: the debug Leave resolves on every outcome), and the next announcement and scene take (`ui:battleStart` and `phase:change` listeners: the second battle is announced, before its cover, and takes the scene after the Leave's return settled); it times a second solo start against a running Garage restore and waits through the probe
- `tools/six-modes.browser.mjs`: stages the loading screen by hand (listed under loaderClasses) to read its rows
- `tools/solo-cold-import-cover.mjs`: the cold-cover observer and its receipt checks (the cover is its subject)
- `tools/sourced-texture-readiness.mjs`: an observer's sample: the first uncovered battle frame
- `tools/studio-selftest.mjs`: receipt checks: the Studio phase, and the Garage after it
- `tools/water-palette-probe.mjs`: a precondition: the battle entered
<!-- /census -->

A Garage return is awaited before the page does anything else: `await page.evaluate(() => window.__DEBUG.enterGarage())`
(or the leave), then `readinessExpression('garage')`. A page function that fires the return as a bare statement and
starts a battle in the same breath measures a race a player cannot make (`tools/mobilelap.mjs`'s map cycle did, until
2026-11-03); the readiness selftest refuses it outside the exit-timing probe that polls for the Garage itself.

## Multiplayer state words

The multiplayer harnesses take the protocol's state words from `tools/mp-states.mjs`, which serves each owner's own
runtime list (`SESSION_PHASES` and `SESSION_ROLES` in src/mp/session/matchSession.ts, `ROOM_PHASES` and
`ROOM_MATCH_STATUSES` in src/mp/room/protocol.ts, `ROOM_CLIENT_PHASES`, `CONNECTION_PHASES` in src/mp/match/recovery.ts,
`MATCH_HOST_STATES`, `TRANSPORT_STATES`): `ROOM_PHASE.playing`, never `'playing'`, and a word the owner does not have
throws by name. A page function gets the word as an argument. `tools/mp-states.selftest.mjs` pins each list to its
union and refuses a literal comparison in a harness; its named exceptions are other vocabularies (the authority's own
MatchPhase, the headless peer harness's match phases).
