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
