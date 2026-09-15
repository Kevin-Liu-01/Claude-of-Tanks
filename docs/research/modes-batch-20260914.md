# Modes, states and campaign batch (batch 19, 2026-09-14 evening)

Owner: "make the other game modes much better and fully fleshed out, especially campaign. Make the
game states actually work (many are buggy and broken) and make the mechanics actually apply and
change what the player has available, or change physics or gravity or more."

## What was true before

- The only mechanic a mode changed was `entity.modeSpeedMultiplier` (Turbo Ball 1.85×). Every other
  "rule" on the cards was copy: same gravity, hull, damage, reload, ammunition, equipment,
  consumables, clock (a 900 s literal in `state.ts`, another in `hud.ts`, a third in the authority).
- Garage BATTLE with Frontline Assault selected reached the field without trenches
  (`beginBattleEntry` never set the terrain variant); the ladder's Launch could be swallowed by a
  stale retained Garage start (`playSurfaceRuntime.onSolo` preferred `pendingSoloStart`); the Garage
  forgot the remembered mode on boot (always Standard); TURBO/BALL and 1000 labels disagreed; the
  match controller, presentation state and events survived the Garage return; `battle:ended`
  carried `map`/`timeS` while the profile read `mapId`/`durationS`; eight `mode:*` events had no
  listener.
- Campaign operations were map + copy only: no difficulty, no clock, no roster preference, no
  stars, no debrief, no way to continue from the end screen.

## What landed

**Rulesets** (`src/sim/matchRuleset.ts`, receipt `matchRuleset.selftest.mjs`): one frozen record per
mode — gravityScale, speedMultiplier, hpScale, damageScale, reloadScale, ammo (spec / he_only /
unlimited), equipmentSlots, consumables, respawnS, timeLimitS + timeout (draw / defeat), solo
allies / enemies, assault escalation — plus `RULESET_SCORE_TARGETS`, `FLAG_CARRIER_SPEED_SCALE`
(0.85), `HORDE_WAVE_REPAIR` (0.3), `matchRulesetFor(mode, { difficulty, timeLimitS })` for campaign
operations, `rulesetLines` for the cards, and the spawn helpers `applyRulesetToCombat`,
`rulesetLoadout`, `refillUnlimitedAmmunition`, `rulesetAllyCap`.

| mode | rules |
| --- | --- |
| Turbo Ball | 0.6 g (hull, shells, ball), +85 % speed, +50 % hull, −50 % damage, +43 % reload rate, unlimited rounds, no equipment, no consumables, 3 s respawn, 10:00 |
| Endless Horde | +25 % hull, 2 allies / 11 enemies, 30 % repair per cleared wave, no clock |
| Frontline Assault | 3 allies, 12:00 lost on expiry, defenders 3 + extra + sector, hull 1 + 0.16 sector + difficulty |
| CTF / Zones | 6 s respawn, carrier at 85 %, zone target 750 (was 1,000, rarely reached in the clock) |

Applied in: the mode controller (`ruleset` option; respawn, stamps, targets, ball gravity, carrier
speed, wave repair, assault rules), `state.ts` (spawn + revive stamps, roster split, nation
preference, shell gravity at the muzzle, unlimited refill, ram scale, timed / elimination results
from the ruleset clock), `damage.ts` (`hullDamageTaken` at the five hull sites), `movement.ts`
(`drive.gravityScale` in the airborne ride and the slope pull), `authoritativeMatch.ts` (same stamps,
`clockLimitS`, timeout → defeat), prediction state (gravity mirrored), `playerBattleActions`
(consumables denied with reason `RULESET`), HUD (ruleset clock, translated objective labels, rule
chips under the countdown, alerts for line_advanced / wave_cleared / respawn / flag_taken /
flag_dropped / flag_returned / pickup_spawned), play menu (rule lines generated from the table,
campaign-is-solo note, rooms map Frontline → Standard).

**State machine**: `clearMatchSession` (stateCore) on the Garage `phase:change`; `beginBattleEntry`
carves trenches for a Frontline pick and clears the operation; explicit play-menu requests beat a
retained Garage start (receipt case added); the Garage reads `cot.game.mode.v1` at boot; labels
unified (TURBO, 750); `battle:ended` adds `mapId`, `durationS`, `campaignOperationId`,
`timeLimitS`, `alliesLost` (old fields kept).

**Campaign**: operations carry `difficulty` 1–6, `timeLimitS` 780 → 660 and the enemy formation's
spec nations (`CAMPAIGN_ENEMY_NATIONS`); `campaignRulesetInput` folds them into the ruleset;
`campaignEnemyNations` fills the enemy roster first — `rosterState.preferNations` moves the
formation's vehicles to the front of the curated pool (the player's era, then its contemporaries:
the next-generation fleet has two Russian vehicles, the modern one twenty-two; WW2 never mixes with
modern), the loading plan follows the same list, and `beginSoloBattle` always fights an operation on
its own map. Record version 2 (`campaignProgress`): stars
(held / inside 55 % of the clock / no ally lost) and the fastest hold, version-1 records migrate.
`campaignDebrief` (pure) feeds the end screen's campaign block — sectors, stars, next operation —
and the NEXT / RETRY OPERATION button (`ui:campaignNext` → the Battle Again transaction with the
ladder sortie as trigger). Ladder cards show stars and the operation clock / difficulty.

## Verification

- Receipts updated / added: matchRuleset, matchModes (+5 ruleset cases), stateCore
  (+clearMatchSession), campaignOperations, campaignProgress (v2, stars), campaignDebrief (new),
  playSurfaceRuntime (+precedence), mapCaptureReadiness (+default clock); registered in
  `tools/selftest-suites.mjs` core.
- `.qa-dev/mode-loop.mjs` plays every mode plus two ladder operations against the dev server and
  asserts stamps, HUD, result, end screen, campaign block and the Garage return.
- Typecheck clean; the receipt sweep over every registered receipt touching the changed modules
  and the full gate ran before the push (see the batch's gate log in DEPLOYS.md).

## Left open

- Frontline Assault stays solo-only on the wire (the coordinator rejects it; the play menu says so).
- `game.phase` still lacks `'studio'` in its union (studio.ts casts).
- RECORD modal campaign section and a HUD button to reopen the mission brief were not built.

## Landed

Gate 28 on the batch (pre 315 / core 665 / post 42 receipts green, all-map smoke 30/30, private
build) in the self-contained batch checkout; typecheck clean; the mode-loop probe 140/140 on the
landed tree (every mode, two ladder operations: stamps, HUD, clocks, results, end screen, campaign
block, Garage return, formation roster 10/10 Russian on Tarkhan Steppe). Pushed as 8388bda3f;
deploy 19 (main-wgQRTYGc.js, claude-of-tanks-9salxlpk1): production map smoke reached battle on verdant
and steppe with no errors, and the same mode-loop probe passed 140/140 against the live site.

## Follow-up the same evening (batch 20: mobile toolbar and the service record)

The production touch loop after deploy 18 left two findings. Reproduced against the dev server:
the touch toolbar's quick buttons (sound, graphics, settings) opened on `click`, and their
`touch-action: manipulation` let the browser read a second finger as a possible pinch — with a
steering thumb down, a tap on SETTINGS never reached the button (no lift, no click). The toolbar
now declares `touch-action: none` like the joystick and fire buttons, and each quick button fires on
its own captured pointer lift (`tapButton` in `touchControls.ts`), keeping the slide-off cancel when
the pointer reported a position and swallowing the click that follows a lone tap. The landscape
"drag beyond the ring reads speed 0" finding was the probe's: a blocked or destroyed hull cannot
move, so the drive criterion is now the throttle reaching the sim, and the probe makes its player
invulnerable at battle start. CDP `Input.dispatchTouchEvent` semantics recorded in the probe: the
`touchEnd` list names the points being *released* (an empty list releases every remaining one), and
synthesised secondary touches carry no coordinates. Touch loop 29/29 in both orientations
afterwards. The Garage's service record gained the campaign standing (operations cleared, stars,
best push, lines held, the next operation).

## Batch 21: the brief comes back on demand

The campaign brief faded after the countdown with no way back. The objective plate now carries a
BRIEF button in Frontline Assault sorties (hidden in every other mode); it fires on the pointer lift
so a steering thumb cannot suppress it, and main toggles the mission brief (`ui:missionBrief`).
`isShowing()` now flips the moment the card starts fading — a tap during the 450 ms fade re-opens
instead of cancelling (the first probe run toggled it off by exactly that window). `game.phase`
finally lists `'studio'`. Receipt `src/ui/missionBrief.selftest.mjs`; probe
`.qa-dev/brief-button-probe.mjs` (shown / fades / re-opens / dismisses / hidden in Zone Control).

## Batches 22–24: cleanup slices

Owner ruling: clean up the codebase and docs. `tools/unused-exports.mjs` (promoted from a scratch
scan) lists every exported declaration no other file mentions — 978 at the start of the evening.
Slice A un-exported 513 `interface` / `type` declarations used only inside their own file (228
files across sim, game, net, engine, ui, app, fx, audio, dev); slice B did the same for 30
functions, constants and classes (24 files), each re-verified against the current tree. Vehicle
profiles and world sources stayed untouched — their hash receipts pin the text — and so did the
four hash-pinned files elsewhere (sky, impact decals, the authority, match placement). 441 entries
remain, nearly all in those protected areas. Docs: the 32 environment-pass checkpoint / candidate /
review / golden / proof records moved from the docs root to `docs/history/environment-2026-09/`
(the index reserves the root for current references), the beautification summary and three
receipts follow them, and five long-dead relative links in the Abrams recovery history are
repaired; a repository-wide relative-link check passes.

## Landed (batches 20–24)

Gate 29 on d65618ea5 (smoke 30/30, core 800, post 45, build; the pre group's 582 receipts rerun
after a stray process kill interrupted the first pass) and gate 30 on 21885cec8 in the
self-contained scratch checkout (smoke 30/30, pre 315, core 666, post 42, build). Pushed through
35656f236; deploy 20 (main-D2byEoBu.js, claude-of-tanks-awxosmmku). Production: touch loop 29/29 in
portrait and landscape, BRIEF button shown / fades / re-opens / dismisses / hidden elsewhere,
service record shows the campaign standing, mode loop 38/38 on Turbo Ball and the first operation.
