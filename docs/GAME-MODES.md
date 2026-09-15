# Battle modes

Claude of Tanks composes multiple battle rules over the same fixed-step tank,
gunnery, armor, damage, spotting, bot, terrain, and network authority. A mode
does not replace combat: every objective keeps the complete vehicle simulation.

Since 2026-09-14 every mode is described by a **ruleset** (`src/sim/matchRuleset.ts`):
one pure, frozen record per mode of how the simulation bends — gravity, speed, hull
hit points, damage taken, reload, the ammunition and equipment a crew may carry,
consumables, respawns, the clock and how it resolves, the solo roster split and the
Frontline Assault escalation. The browser sim, the network authority, the HUD and
the play-menu rule cards all read that one table, so a card can never promise a
rule the battle does not keep.

## Shipped rules

| Mode | Objective | Ruleset (deviations from Standard) | Respawn | End condition |
| --- | --- | --- | --- | --- |
| Standard Battle | Destroy the opposing force | — | No | Elimination, or the 15:00 clock (draw) |
| Capture the Flag | Carry the enemy flag to a home flag that has not been stolen | flag carrier drives at 85 % | 6 s | First team to 3 captures, or the clock (score) |
| Zone Control | Capture and hold three battlefield sectors | — | 6 s | First team to 750 points, or the clock (score) |
| Turbo Ball | Drive or shoot the physical ball into the opposing goal | 0.6 g (hulls, shells and the ball), +85 % speed, +50 % hull, −50 % damage, +43 % reload rate, unlimited rounds, no equipment, no consumables | 3 s | First team to 5 goals, or the 10:00 clock (score) |
| Endless Horde | Survive increasingly numerous, durable and mobile bot waves | +25 % hull, two allied bots (co-op humans join alpha), 30 % repair for every survivor when a wave is cleared, no clock | No | The final human-controlled tank is destroyed |
| Frontline Assault | Take three trench sectors in turn, then hold the last one | three allied bots, 12:00 clock that loses the sortie when it expires; defenders escalate per sector and per campaign operation | No | The last sector held for 20 s, the human attacker destroyed, or the clock |

Horde begins with three active enemies and adds one every second wave until it
reaches the room's enemy roster. Enemy hit points increase by 16% per wave and
mobility increases by 4.5% per wave, capped at 55%. Clearing a wave repairs every
surviving attacker by 30 % of maximum hull, starts a six-second intermission and
places one deterministic floating cache. Repair cache probability begins at 62%,
falls by 5.5 percentage points per wave, and never falls below 8%; the remaining
caches replenish 20% of every non-full authored ammunition channel (with a minimum
of one round per channel). Horde uses the vehicle's normal per-shell loadout from
the first wave onward. At most 12 uncollected caches remain active.

Frontline Assault fields `3 + extraDefenders + sector` defenders per wave with
`1 + 0.16 × sector + difficultyHp` hull; a campaign operation of difficulty *d* adds
`floor((d − 1) / 2)` defenders and `(d − 1) × 6 %` hull. A level score when the clock
expires is a draw under Standard rules and a defeat for the attackers in Frontline
Assault (`timeout: 'defeat'`).

## Where the ruleset is applied

- **Spawn and revive** — `applyRulesetToCombat` stamps hull (× the wave health scale
  the controller hands to a revive), the damage-taken scale, the reload multiplier
  (folded into `combat.equipMults.reload`) and the ammunition channels;
  `rulesetLoadout` trims the equipment ids to the honoured slots. Solo:
  `initializeBattleEntity` and the revive hook in `src/game/state.ts`; network:
  `createPlayerEntity` and `reviveForMode` in `src/sim/authoritativeMatch.ts`.
- **Movement** — the controller stamps `modeSpeedMultiplier` and `modeGravityScale`
  on every entity at start, at every revive and when a flag changes hands;
  `src/sim/movement.ts` scales top/reverse speed, the airborne hull and the slope
  pull by them. The prediction state (`src/net/predictionAuthorityState.ts`,
  `localTankPrediction.ts`) mirrors both to the client.
- **Ballistics** — a fired shell's `gravityMps2` is multiplied by the shooter's
  gravity scale (solo fire site and authority fire site); under unlimited rounds
  the fired channel refills immediately (`refillUnlimitedAmmunition`).
- **Damage** — `hullDamageTaken` (`src/sim/damage.ts`) scales every hull loss —
  penetrations, HE bursts, splash and ramming — by `combat.modeDamageTakenScale`.
  Module and crew rolls stay unscaled: the ruleset changes how long a hull lasts,
  not how the vehicle breaks.
- **Clock and result** — `timeLimitS` / `timeout` drive `applyTimedModeResult`,
  `applyEliminationResult` (solo) and `determineModeResult` /
  `determineEliminationResult` (authority); the HUD counts the same clock down
  (`frame.timeLimitS`, counting up when a mode has none).
- **Roster** — `rulesetAllyCap` sets the solo split (Standard 6 / 7, Horde 2 /
  11, Frontline Assault 3 / 10); a campaign operation's formation
  (`campaignEnemyNations`) leads the curated pool (`rosterState.preferNations`:
  the player's era first, then its contemporaries, never WW2 against modern) and
  fills the enemy side first.
- **Player affordances** — equipment slots at spawn, `ui:consumable` denied with
  reason `RULESET` when the mode has no consumables, rule chips under the
  pre-battle countdown (`hud.setPreBattleRules`), and the rule lines on every
  play-menu card (`rulesetLines`, keys `rules.line.*`).

## Campaign (Frontline Assault ladder)

`src/game/campaignOperations.ts` holds six operations on fixed maps. Each carries a
1-based `difficulty` (1–6) that folds into the Frontline Assault ruleset, its own
`timeLimitS` (13:00 tightening to 11:00), and the `enemy` formation whose spec
nations fill the enemy roster first. Clearing an operation (holding its last
sector) opens the next; `campaignProgress` (`cot.campaign.v1`, record version 2)
stores attempts, best push, lines held, **stars** (held / held inside par — 55 %
of the clock — / no ally lost, best of every sortie) and the fastest hold.
`battle:ended` carries `campaignOperationId`, `durationS`, `timeLimitS` and
`alliesLost` for it; `campaignDebrief` turns the same payload into the end screen's
campaign block (sectors, stars, what opens next) and the NEXT / RETRY OPERATION
button, which re-enters through the Battle Again transaction with the ladder
sortie as its trigger (`ui:campaignNext`).

Frontline Assault also plays in rooms (batch 27, 2026-09-15): the room carries the
mode on the wire like every registered mode (`GAME_MODE_IDS` is the coordinator's
envelope check), every human deploys on Alpha as the attacking side (`isCoopGameMode`
in `net/lobby.ts` covers Endless Horde and Frontline Assault: no team select, seven
seats), the authority bakes the `assault-trenches` terrain variant as its own shared
terrain entry and seats the sectors on the carved lines, the presentation runtime
loads the same variant in the browser, and the private-match handoff fills Bravo with
defender bots. Campaign progress stays a solo record: a network `battle:ended`
(`network: true`) never records an operation.

Respawning modes (Capture the Flag, Zone Control, Turbo Ball, Endless Horde and the
Frontline Assault attackers) revive the player through `mode:respawn`; the killcam
cancels its spectate and any pending ghost replay on the local player's revive so the
camera returns to the tank instead of holding the wreck view (batch 27).

## State machine

`game.phase` is `garage` → `battle` → (`ended` / `shot`) → `garage`. Battle entry:
the play surface starts a solo battle with `{ specId, mapId, gameMode,
campaignOperationId }`; an explicit request always beats a retained Garage start.
The Garage BATTLE button is a free sortie in the remembered rules (`cot.game.mode.v1`
is shared with the play menu and read at boot); a Frontline Assault pick carves the
trench variant like a ladder launch. `setupBattle` → `resetBattleSession` derives
`game.ruleset` and `game.campaignOperationId` from the request. The return to the
Garage (`phase:change` → `garage`) clears the mode controller, its presentation
state, pending events, the operation and the ruleset (`clearMatchSession`) and hides
the mission brief, so nothing of a finished match leaks into the next one.

## Authority and determinism

`src/sim/matchModes.ts` is the renderer-free rules owner. It receives live
entities, a seed, terrain height, the ruleset and explicit hooks for revival,
visibility, and events. It advances only from the caller's fixed 1/60-second step
and does not import the DOM, Three.js, transport code, wall clock, or
`Math.random()`. Solo composes the controller in `src/game/state.ts`; private and
LAN authority compose the same controller through `src/sim/authoritativeMatch.ts`,
deriving the same ruleset from the room's `gameMode` (no wire change).

## Presentation and performance

`src/game/matchModeWorldPresentation.ts` turns presentation state into retained,
shadow-free battlefield markers. The HUD presents one compact objective line
beneath the score plate; reliable mode events drive capture, goal, wave (with the
repair), sector, respawn, flag and cache feedback.

## Verification

    node src/sim/matchRuleset.selftest.mjs
    node src/sim/matchModes.selftest.mjs
    node src/game/campaignOperations.selftest.mjs
    node src/game/campaignProgress.selftest.mjs
    node src/game/campaignDebrief.selftest.mjs
    node src/game/playSurfaceRuntime.selftest.mjs
    node src/sim/authoritativeMatch.selftest.mjs
    npm run typecheck
    npm test

The browser probe `.qa-dev/mode-loop.mjs` plays every mode against the dev server:
it asserts the ruleset stamps on the player (hull, gravity, equipment), the HUD
objective line and clock, a single result, the end screen (with the campaign block
after a ladder sortie) and a clean Garage return, then starts the next mode.
