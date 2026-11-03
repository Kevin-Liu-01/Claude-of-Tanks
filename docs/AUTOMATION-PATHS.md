# Automation paths

Which path the game runs for a browser tool, and which tools take which one (2026-11-02 audit S3). The lists below
are checked against the tools by `src/app/automationPath.selftest.mjs`: a tool that changes path, adds a battle
entry or starts writing the game's state must be listed here in the same change.

## How a page picks its path

The game reads its automation path in one place, `src/app/automationPath.ts`:

| request | path | what the game does |
|---|---|---|
| none, `navigator.webdriver` true (every puppeteer page) | harness | QA surfaces on (`window.__DEBUG`, the drive test); the entry gate auto-skips; transitions run their work synchronously with no veil; the battle and Garage scene black watchdogs and the device-diag rescue stay off |
| `window.__COT_AUTOMATION = 'harness'` or `?automation=harness` | harness | the same, without a driver |
| `window.__COT_AUTOMATION = 'player'` or `?automation=player` | player | everything as for a player: the entry gate waits for a key (`?nosplash` / `?nogate` still skip it), every veil and fade runs, the watchdogs run; no QA surfaces unless a dev server or `?debug=1` asks for them, as for any player |
| none, no driver | player | a player's page |

A tool asks before navigating: `requestAutomationPath(page, 'player')` from `tools/game-readiness.mjs` (or
`window.__COT_AUTOMATION = 'player'` inside its own init script). Never hide `navigator.webdriver`: that also turned
off the QA surfaces in a production build and let a robot count as a player in analytics and telemetry, which keep
their own `navigator.webdriver` exclusion. The page publishes the path it resolved as `window.__AUTOMATION_PATH`
(read-only), next to the app lifecycle (`window.__APP_LIFECYCLE`).

So every receipt not listed under the player's path certifies the harness path: no entry gate, no veils, no scene
watchdogs. A regression in one of those machines is visible only to the player-path tools.

## Tools on the player's path

<!-- census:player -->
- `tools/battle-entry-sweep.mjs`: the covered solo entry, its scene watchdog included, on every battlefield
- `tools/black-world-repro.mjs`: the black-world hunt through the real Garage controls
- `tools/click-timeline.mjs`: boots driven (harness) for `__DEBUG`, then takes the player's veils once the Garage is up
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
- `tools/daynight-atmosphere-probe.mjs`
- `tools/dev-perf-probe.mjs`
- `tools/environment-motion-probe.mjs`
- `tools/gunship-lens-strip.browser.mjs`
- `tools/map-probe-runtime.mjs`
- `tools/marketing-shots/mode-battle-shots.mjs`
- `tools/mobilelap.mjs`
- `tools/phase-resource-probe.mjs`
- `tools/render-stability-audit.mjs`
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
