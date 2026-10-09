# Battle modes

Claude of Tanks composes multiple battle rules over the same fixed-step tank,
gunnery, armor, damage, spotting, bot, terrain, and network authority. A mode
shares the armor, damage, projectile and authority pipeline. Aerial modes add flight controls; the AC-130 replaces ground movement with an orbit.

Since 2026-09-14 every mode is described by a **ruleset** (`src/sim/matchRuleset.ts`):
one pure, frozen record per mode of how the simulation bends — gravity, speed, hull
hit points, damage taken, reload, the ammunition and equipment a crew may carry,
consumables, respawns, the clock and how it resolves, the solo roster split and the
Frontline Assault escalation. The browser sim, the network authority, the HUD and
the play-menu rule cards all read that one table, so a card can never promise a
rule the battle does not keep.

## Mode rules

| Mode | Objective | Ruleset (deviations from Standard) | Respawn | End condition |
| --- | --- | --- | --- | --- |
| Standard Battle | Destroy the opposing force | — | No | Elimination, or the 15:00 clock (draw) |
| Capture the Flag | Carry the enemy flag to a home flag that has not been stolen | flag carrier drives at 85 % | 6 s | First team to 3 captures, or the clock (score) |
| Zone Control | Capture and hold three battlefield sectors | — | 6 s | First team to 750 points, or the clock (score) |
| Turbo Ball | Drive or shoot the physical ball into the opposing goal | 0.6 g (hulls, shells and the ball), +85 % speed, +50 % hull, −50 % damage, +43 % reload rate, unlimited rounds, no equipment, no consumables, no module, crew or fire damage, F jumps 9 m/s, ×12 recoil launch, ×2.5 impact knock | 3 s | First team to 5 goals, or the 10:00 clock (score) |
| Endless Horde | Survive waves that grow without a cap and never repeat their line-up | +25 % hull, two allied bots (co-op humans join alpha), a fourteen-strong hostile pool drawn afresh every wave (five on wave one), 30 % repair for every survivor when a wave is cleared, no clock; the player arranges both sides | No | The final human-controlled tank is destroyed |
| Frontline Assault | Take three trench sectors in turn, then hold the last one | three allied bots, a ten-strong same-nation formation (the operation's, or the arranged nation), 12:00 clock that loses the sortie when it expires; defenders escalate per sector and per campaign operation | No | The last sector held for 20 s, the human attacker destroyed, or the clock |
| Mars Mode | Hold the three station sectors of Olympus Basin | 0.38 g, +25 % speed, +20 % hull, −10 % damage, +11 % reload rate, rocket jump 9.5 m/s (F, boosts again in the air), ×3 recoil launch, ×0.9 impact knock; boost caches every 22 s | 6 s | First team to 750 points, or the 12:00 clock (score) |
| Juggernaut | Defeat the boss, or survive as the boss | Choose the boss or hunter role; boss has 8× hull, half reload time and 90% speed | Hunters: 6 s; boss: none | Boss destroyed, or boss survives 10:00 |
| Infected | Survive the outbreak, or convert every survivor | Four initial infected; destroyed survivors join them with 125% HP, 40% more speed and 30% faster reload | 3 s | No survivors remain, or survivors reach 7:00 |
| Realistic | Destroy the opposing force through critical damage | Normal spotting; no hull HP attrition, automatic module repair or consumables | No | Crew eliminated or ammunition destruction eliminates a team; 15:00 draw |
| Gun Game | Complete a five-weapon ladder | Two confirmed kills per stage; unlimited ammunition | 4 s | First player to complete the ladder; 15:00 score decision |
| Drone | Destroy opponents with tanks and directly piloted drones | Launch a physical FPV quadcopter; its shaped charge interacts with cages, ERA and spaced armor at the impact point | 6 s | First team to 20 kills (configurable), or 10:00 score decision |
| AC-130 | Protect ground allies until at least half reach extraction | Fragile escorts, a marked exit, overhead scope, three independent weapon channels and unlimited ammunition | No | Half extracted; defeat if too few survive or 8:00 expires |

## Aerial sensor views

In Drone and AC-130, press **I** (rebindable in Settings), or tap the view button beside the aircraft icon, to cycle
**Infrared → Thermal → Night vision → Daylight**. The button shows the active view
and remembers your choice between flights. It stays disabled until the drone camera
has entered first-person flight, so takeoff stays in normal color.

- **Infrared:** white-hot vehicles, a cooler monochrome landscape, and soft sensor glow.
- **Thermal:** hot vehicles appear orange through pale yellow against cool blue terrain.
- **Night vision:** green light amplification reveals ambient detail without adding vehicle heat.
- **Daylight:** the normal scene colors and lighting.

These are camera treatments. Terrain, buildings, smoke, and multiplayer spotting
still determine which enemies are visible; changing views does not reveal hidden tanks.

## Flying a drone

Select **Drone**, enter a battle in your tank, then press **V** or the drone control.
The quadcopter starts visibly docked on a reusable mission rail. Large turrets carry the rail; compact turrets and turretless tank destroyers use supported hull positions.
The rail and its four feet are fitted to each vehicle’s own turret or casemate surfaces; the same
attachment frame follows turret rotation, and the drone launches from that same moving seat. It can carry future mode equipment. A 2.4-second rotor spool-up and
smooth lift clear the carrier before the camera eases into first-person
flight with the selected sensor view (white-hot infrared by default). The launch and camera handoff stay in normal color; the sensor begins only when the view is inside the drone. You directly fly it: **W/S**
move forward or backward, **A/D** strafe, **Space** climbs, and mouse look steers.
Pitch down and fly forward to descend or dive into a target. Releasing movement
brakes smoothly into a hover. Light air disturbances, body banking, rotor
spool-up and continuous stabilization corrections keep the drone visibly airborne;
the FPV camera filters that motion down to a small stabilized sway. Touch look and the movement controls use the same
flight inputs, with a dedicated **Climb** button. The flight console shows battery
time, carrier-link distance, speed, and **Return to tank**. Tank ammunition and
vehicle controls are hidden while flying.

The drone has a 40-second battery and an 850 m operating radius. Its payload is a
single shaped charge: terrain, structures and vehicle armor matter. It does
not award a kill merely for reaching an enemy. **V** returns to the tank, ending
that flight. Impact, cancellation or battery/range exhaustion starts a 25-second
cooldown. The parked tank remains vulnerable; destroying it ends its drone flight.
Other players see the quadcopter, camera, underslung warhead, and spinning rotors.
Bots can fly drones too. An airborne drone also supplies its carrier’s team with
reconnaissance out to 350 m, reduced by target camouflage. Buildings, terrain and
smoke still block its line of sight, including at close range; the infrared
picture is not permission to see through cover. Destroying the carrier removes
the drone observer, and contacts use the normal spotting linger and radio sharing.

### Armor against drones

Protection applies where the drone hits. Purpose-built roof cages and mesh screens
on both Ukrainian Abrams variants can intercept the airframe before the charge
reaches the armor. Their coverage follows the actual roof, side and rear panels
as the turret turns; open gun corridors and uncovered surfaces remain vulnerable.
M1A3's authored slat screens also have interception behavior. Other existing
spaced-armor screens retain their normal reduction of shaped-charge penetration.
These are gameplay probabilities, not guaranteed protection or real-world ratings.

If a screen fails to intercept, the shaped-charge jet continues across the air gap
and resolves against the armor behind it. Side skirts and spaced armor reduce its
remaining penetration; ERA uses the same chemical-energy protection as other
shaped-charge hits and consumes the struck tile. A spent tile cannot protect that
location again. Thin skirts alone may be insufficient, and hitting an exposed
area bypasses protection elsewhere. Drone-contact mesh envelopes do not become
solid plates against bullets or ordinary shells.

This layered approach follows the general role of screens and added armor described
by [RUSI](https://www.rusi.org/explore-our-research/publications/rusi-defence-systems/nato-should-not-replace-traditional-firepower-drones);
the game's penetration values and interception chances are fictional balance settings.

## AC-130 controls and weapons

The gunship automatically circles at 240 m above its starting ground height on a
90 m orbit. It starts airborne before the first gameplay frame. Aim with mouse
or touch look: the gimbal keeps looking at your chosen ground point as the aircraft
circles. Use the wheel, pinch gesture, or touch scope control to zoom.
Fire with the normal fire control and select weapons with **1–3** or the ammunition
buttons in the dedicated flight console: a rapid 30 mm cannon, a 152 mm explosive howitzer, and guided missiles.
The weapon channels reload independently. Missiles follow the sight; cannon and
howitzer rounds travel through the normal ballistic and armor simulation.

The autocannon uses short, bright streaks; the howitzer leaves a broader, longer wake; guided missiles retain a curved exhaust trail. Each round has a small hot head that remains visible when viewed directly from behind. Tracer size follows scope zoom and distance, with a limit to prevent oversized glows. These effects follow the actual projectiles and disappear on impact.

Four allied ground vehicles accompany the gunship by default. They have 90% of their normal hull strength, slower reloads and reduced speed, and use normal navigation to reach the green **E** extraction area. Enemies pursue the convoy. Save at least half; killing enemies alone does not complete the mission. The objective shows allies still on the field, the number extracted, the rescue requirement and route progress. Casualties do not respawn. An eight-minute timeout or losing too many escorts fails the operation. Multiplayer pilots all provide air support, with separate friendly bots reserved for the escort. Extraction and casualty state survive host migration.

## Asymmetric teams and progression

**Juggernaut** offers a role setting. As boss, you face the hunting team; as a
hunter, you join allies against one bot boss. In hosted rooms the boss role belongs
to the first participating human when that role is selected; other humans hunt it.
The boss is 12% larger, including its armor and module hit geometry, and carries a subtle blue surface highlight that follows the hull, turret, barrel, and running gear with traveling energy bands. Shell contacts, including ricochets, create short, undulating blue-white ripples at the actual impact location; turret and gun contacts follow those moving parts. There is no enclosing bubble, and the glow does not reveal the tank through cover. Battle impact ripples and enlargement are cleared on Garage return. If Juggernaut remains selected, the Garage applies a fresh animated energy preview to the selected tank; switching modes removes it. It never respawns. Its survival clock and health are shown in the objective.

**Infected** begins with four infected opponents (at least three in a custom setup). Survivors have 30% of their normal HP; infected have 125%, 40% more speed and 30% faster reloads. A survivor's destruction changes
that player's team before their next spawn, including their allied/enemy roster
and bot targeting. Bots discard a cached enemy as soon as either tank changes sides;
the converted player’s spotting readout follows their new team. The remaining survivors win by lasting seven minutes; infected
win when nobody remains unconverted.

**Gun Game** keeps the selected chassis, armor and crew, but replaces its main
weapon. The ladder is 30 mm AP, 105 mm APFSDS, 120 mm APFSDS, 152 mm HE, then a
152 mm guided HEAT missile. Each stage takes two kills credited to that player.
Respawning preserves progress. Completing the final stage wins for that player's
team. The shared vehicle catalog is never modified by a player's progression.

**Realistic** removes hull HP attrition and keeps normal spotting: hidden enemies do not receive markers. Penetrations reliably injure crew and apply 2.5× module damage. A cone of fragments follows the shell through the authored compartments; nonpenetrating hits cannot create internal fragments. Fires damage modules four times faster. Ammunition detonation, fewer than two surviving crew, or simultaneous engine and gun destruction ends the vehicle. Destroyed modules remain damaged; automatic module repair and consumables are disabled.

## Shared implementation and checks

The canonical rules remain in `src/sim/matchRuleset.ts`; `matchModes.ts` owns
victory, conversion, progression and respawn. `aerialCombat.ts` advances flight at
the fixed simulation rate in both solo and hosted authority. Clients send controls,
not hit decisions. `modeLoadout.ts` isolates per-vehicle weapon changes. Protocol 6
adds the two supply-drop actions alongside the drone action and presentation type; older clients must reload to join.
Encrypted host checkpoints retain the new modes’ scores, infection teams, weapon
progression, respawn timers and drone/orbit state across a host change.

`src/sim/sixModes.selftest.mjs` and `sixModesAuthority.selftest.mjs` cover rules,
rosters, progression, shared flight and authority. `tools/six-modes.browser.mjs`
exercises garage entry, real flight input, the orbit and narrow-screen HUDs.
`tools/drone-hud.browser.mjs` drives the actual compact flight HUD and touch
controls with deterministic drone telemetry (no WebGL): every sensor view, the
infrared and thermal switches and a single return. Four native regressions run
under the shared GPU queue beside it:
`tools/aerial-tracers.browser.mjs` fires the AC-130's real weapons, holds a
mid-flight frame of each tracer (one head, a bounded ribbon) and checks the
cleanup when live flight resumes; `tools/drone-details.browser.mjs` renders the
drone's dock and flight airframe kit (merged materials, full detail);
`tools/garage-mode-preview.browser.mjs` selects modes in the Garage, swaps
tanks, runs the idle animation and returns cleanly from battle; and
`tools/vehicle-special-action.browser.mjs` checks that the HUD's special
controls follow a mode loadout change on the same vehicle.

Horde (owner 2026-09-15: "the horde is not endless, there's only 3 tanks every time and
they're the same tanks each round") fields `waveSize + (wave − 1) × waveStep +
⌊(wave − 1) / surgeEvery⌋` hostiles — 5, 6, 7, 9, 10, 11, 13 … by default — drawn afresh
every wave from a pool of fourteen hostile identities (`ruleset.enemies`): a seeded shuffle
that puts the vehicles rested last wave first, so consecutive waves share as few tanks as
the pool allows, and the whole pool is on the field once the law overtakes it. The wave
law and the pool are `HordeRules` / `TeamArrangement` in `sim/matchRuleset.ts`
(`TEAM_ARRANGEMENT_LIMITS`: allies 0–6, pool 6–20, first wave 2–12). Enemy hit points increase by 16% per wave and
mobility increases by 4.5% per wave, capped at 55%. Clearing a wave repairs every
surviving attacker by 30 % of maximum hull, starts a six-second intermission and
places one deterministic floating cache. Repair cache probability begins at 62%,
falls by 5.5 percentage points per wave, and never falls below 8%; the remaining
caches replenish 20% of every non-full authored ammunition channel (with a minimum
of one round per channel). Horde uses the vehicle's normal per-shell loadout from
the first wave onward. At most 12 uncollected caches remain active.

Frontline Assault's opening wave is the same fresh draw; every captured sector then REINFORCES
the line (owner 2026-09-17: "capturing bases … shouldnt reset tanks"): defenders still alive keep
their identity, position and damage, and only the shortfall to `3 + extraDefenders + sector`
defenders arrives as fresh identities (rested first, that sector's wrecks last) with
`1 + 0.16 × sector + difficultyHp` hull; a campaign operation of difficulty *d* adds
`floor((d − 1) / 2)` defenders and `(d − 1) × 6 %` hull. A level score when the clock
expires is a draw under Standard rules and a defeat for the attackers in Frontline
Assault (`timeout: 'defeat'`).

## Mars mode (2026-09-18)

Owner: "add mars map mode (called mars mode), make it have space bases and make it look like a
proper galaxy map, give it a bunch of boosts and settings". Mars mode (`mars` in `GAME_MODE_IDS`)
always fights over Olympus Basin (`src/world/maps/mars.ts`: rust regolith on Redrock's sand
palette, red mesas, a research station of domes, modules, comms masts, solar arrays, fuel spheres
and a landing pad from `structureKit.ts`, and a `sky` preset that forces the night dome's starfield
with a wide galactic band, magenta nebula clouds and a 3.4° planet). The map is reachable by
choice and through the mode but never by the random draw (`RANDOM_BATTLE_MAP_IDS`). The ruleset
is Olympus Basin's own physics — 0.38 g, a 9.5 m/s rocket jump on F, +25 % speed, +20 % hull, −10 %
damage, faster reloads, a ×3 recoil launch and a ×0.9 impact knock — on the Zone Control
objective (the controller maps `mars` onto the zone code paths: `placeZones`, zone markers, the
750-point target, 6 s respawns) with a twelve-minute clock. Boost caches: from 12 s a repair or
ammunition cache drops every 22 s (`MARS_CACHE_FIRST_S` / `MARS_CACHE_INTERVAL_S`) and any human on
either side may take it. The sides switch applies (Mars is a symmetric mode); rooms play it like
any wire mode with the map forced to `mars` (`resolvePrivateMatchMap`).

**Settings (2026-09-19).** The Garage battle menu shows a *Mars settings* row while Mars is the
selected rule (the play menu's arrangement panel carries the same two selects): the **gravity
world** — Mars 0.38 g / 9.5 m/s jump / ×3 recoil launch, Moon 0.17 g / 12.5 m/s / ×4.5, Earth
1 g / 4 m/s / ×1.5 (`MARS_GRAVITY_OPTIONS`) — and the **boost caches** — off, every 22 s from 12 s
(standard) or every 11 s from 8 s (`MARS_CACHE_OPTIONS`). Both ride the mars entry of the team
arrangement store (`game/teamArrangement.ts` `readMarsSettings` / `writeMarsSettings`, keys
`marsGravity` / `marsCaches`), so a hosted room carries them over the lobby arrangement wire and
the authority resolves the same `matchRulesetFor('mars', …)`; `normalizeTeamArrangement` keeps
them for the mars mode only and drops unknown ids. The ruleset's `mars` record
(`gravity`, `caches`, `cacheFirstS`, `cacheIntervalS`) drives the controller's cache drops and
the rule-card lines (`rules.line.marsCaches` / `marsCachesOff`).

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
  pull by them. The prediction state (`src/sim/predictionAuthorityState.ts`,
  `src/mp/match/prediction.ts`) mirrors both to the client.
- **Physics** (2026-09-25) — the controller stamps `modePhysics` (the ruleset's
  `physics` block) beside the gravity scale; `src/sim/movement.ts` reads its
  restitution and rebound floor at every landing, and the integrations
  (`resolveTankImpacts` in `src/game/state.ts`, `resolveEntityImpacts` in
  `src/sim/authoritativeMatch.ts`) price crashes, falls and rams through
  `src/sim/impact.ts` with its thresholds, rates and ram restitution. The mp
  prediction world derives the same block from the room's mode
  (`createPredictionWorld({ mode })`).
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
  14, Frontline Assault 3 / 10; the co-op modes size their own field from
  `ruleset.allies + ruleset.enemies`, `state.battleRosterPlan`); a campaign
  operation's formation (`campaignEnemyNations`) or the arranged enemy nation
  (`game/teamArrangement.ts` `ENEMY_NATION_OPTIONS`, every fleet nation) leads the
  curated pool (`rosterState.preferNations`: the player's era first, then its
  contemporaries, never WW2 against modern) and fills the enemy side first. The wave
  modes keep that nation pure across every era before another nation fills a seat, and
  with no arranged or campaign nation they still field ONE nation per battle — rotated by
  battle ordinal through the nations that can field the whole lead
  (`rosterState.defaultWaveNations`, owner 2026-09-17: same-nation waves). The allied bots are
  never drawn from that formation: the picker leads the field with the enemy pool and the solo
  team split (`state.chooseBattleAllies`) takes exactly those seats for the enemy side
  (2026-09-18 — the tier-balanced split used to hand formation vehicles to the allies and field the
  fillers as hostiles); a co-op room without a named nation defends with one nation bloc as well
  (`privateMatchHandoff.defaultRoomWaveNations`, rotated by the match seed). Ordinary
  matchmaking rotates too: the bots of the last two battles rank behind every fresh vehicle of
  the player's era AND of its contemporary eras (`matchmaking.ERA_NEIGHBOURS`; the eighteen other
  next-generation hulls alone cannot fill thirteen seats twice), so a vehicle only repeats once
  both catalogs are used up and WW2 still never meets modern (`game.recentBotSpecIds` /
  `previousBotSpecIds`, `rosterState.rememberBattleBots`, `matchmaking.rankMatchCandidates`),
  and the seeded roster shuffle's battle ordinal starts
  from the profile's lifetime match count (`profile.battleOrdinalBase`), so a fresh page load
  never re-draws the same first battle and consecutive rosters differ whenever the catalog allows.
- **Team arrangement (2026-09-15)** — the play menu's arrangement panel (allied bots,
  enemy pool, first Horde wave, enemy nation) is saved per mode
  (`cot.game.teams.v1`, `readTeamArrangement`) and folds into the ruleset
  (`matchRulesetFor(mode, campaign, arrangement)`); a campaign operation's nation is
  never overridden. In a room the host's arrangement and the chosen campaign
  operation ride the lobby (`set_arrangement`, `set_campaign_operation`), the
  handoff fills Alpha with the allied bots and Bravo with the same-nation pool
  (`privateMatchHandoff.privateMatchRuleset`, the operation's own map) and passes
  the ruleset into the authority.
- **Sides (2026-09-18)** — owner: "in our battle dropdown have a switch that's default set to 7v7
  but then switching it does 14v14 and you can also enter custom numbers of allies and enemies so
  you can do stuff like 1 v 20". The Garage battle menu (`ui/garage.ts`, `garage.battle.sides*`) and
  the play menu's arrangement panel carry the switch for the symmetric modes (Standard, Capture the
  Flag, Zone Control, Turbo Ball): `7 v 7` (the default — six allied bots against seven), `14 v 14`
  (thirteen against fourteen) or custom allied-bot and enemy counts. One setting serves all four
  modes (`game/teamArrangement.ts` `SIDES_MODES`, `writeSides`; each mode keeps its own enemy
  nation) and folds into the ruleset like every arrangement (`allies` / `enemies`; the rule card and
  the pre-battle chips read `rules.line.sides`, the player counted on the allied side).
  `BATTLE_FIELD_LIMIT` in `sim/matchRuleset.ts` caps the field, the player included: the enemy count
  typed is kept and the allied bots yield. The limit was set from the desktop-tier field probe on
  2026-09-18 (`docs/PERFORMANCE.md` "Field size"). The wave modes keep their own panel (allied bots
  0–6, pool, first wave, nation) and rooms keep `teamSize`. Seating (symmetric deployments, modes
  lane 2026-10-08): both sides deploy in one formation, each bravo slot the 180° rotation of its
  alpha slot about the anchors' midpoint (`sim/deployment.ts`, resolved on the world by
  `sim/matchPlacement.ts` `deploymentSlot`, the one call the solo sim and the authority make). A map
  whose enemy pads spread past 60 m deploys both sides as that arc; compact pads deploy both as a
  4 + 3 block at the player pad; slots past the base stand a spacing (15 m) behind it. A slot that
  meets water, a cliff, soft ground or a solid moves with its partner by the rotated displacement, so
  the pair stays a rotation; the world keeps its spawn clearings round both sides' first fourteen
  slots (`deploymentClearings`), and the minimap's spawn marker is the side's slot centroid. Receipts:
  `sim/deployment.selftest.mjs` (33 maps), `game/deploymentParity.selftest.mjs` (solo = host). The HUD ears pack
  their rows past ten vehicles a side, and the loading screen's reveal budget grows with the field
  (`game/battleEntryLifecycle.ts` `revealTimeoutForField`: 1.5 s for 7 v 7, +120 ms per further
  vehicle — a 14 v 14 first frame outran the fixed budget and bounced the entry back to the Garage).
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
mode on the wire like every registered mode (`GAME_MODE_IDS` is the room protocol's
envelope check), every human deploys on Alpha as the attacking side (`isCoopGameMode`
in `src/mp/room/roomPolicy.ts` covers Endless Horde and Frontline Assault: no team select, seven
seats), the authority bakes the `assault-trenches` terrain variant as its own shared
terrain entry and seats the sectors on the carved lines, the battle presentation
loads the same variant in the browser, and the mode controller draws Bravo's
defenders from the formation while every human deploys on Alpha (the room's
campaign operation names the map, the nation and the difficulty). Campaign progress stays a solo record: a network `battle:ended`
(`network: true`) never records an operation.

Respawning modes (Capture the Flag, Zone Control, Turbo Ball, Endless Horde and the
Frontline Assault attackers) revive the player through `mode:respawn`; the killcam
cancels its spectate and any pending ghost replay on the local player's revive so the
camera returns to the tank instead of holding the wreck view (batch 27). Since
2026-09-15 the death hand-off to the ally chase and its garage bar never starts while the
ruleset revives the player; the HUD counts the revive down ("BACK IN n", from the death
event or the frame-observed destroyed state) until the revive lands.

Turbo Ball's unlimited rounds (2026-09-21, owner: "fix this completely") keep the vehicle's
loadout shape — the three keys still pick APFSDS, HEAT or HE — but every shot refills its channel
and the shell selector, its accessibility labels and the sniper-view readout print ∞ instead of
a count that never moves; no slot ever reads as empty.

In a reviving mode the battle report treats a death as a stat, not a terminal state (owner
2026-09-21): the survived / destroyed mark and the "n / m survived" team counts read whether a
vehicle is alive when the battle ends (`mode:respawn` clears the ledger's `dead` flag and the
ended payload's roster `alive` is authoritative), while every destruction counts into a
"deaths" stat shown on the player's card and the roster rows. The end-of-battle death replay
plays only when the player is dead at the verdict, and then it is the last death — the
killcam drops the previous life's lethal chain on the player's revive; a revived player alive
at the end gets the ordinary victory / defeat cinematic.

Turbo Ball has no consumables, so its ruleset switches critical damage off
(`criticalDamage: false` → `combat.modeCriticalDamage`): `rollModuleDamage` and
`rollCrewHit` consume their chance draw and return, so no module breaks, no crew member is
knocked out and no fire starts, while hull hit points and replay RNG order are unchanged.

## Impact physics (owner 2026-09-16)

Every mode: a shell that hits a hull shoves it along its flight direction (`shellKnockMps` in
`sim/movement.ts`: calibre squared × shell speed × 45 t / victim mass, bounded at 9 m/s, then × the
ruleset's `shellKnockScale` — 0.3 in every standard mode since 2026-09-17, so a 105 mm round at
900 m/s nudges a 45 t hull 0.4 m/s; the owner wanted the big shove only in Turbo Ball). The shove is a
decaying translation impulse (about 0.3 m of displacement per m/s), the hull rocks, and heavy shoves lift
the ride; the drivetrain speed is untouched, so a hit never becomes a lasting drive input. The balance
range model excludes shoves (it measures gunnery and armour).
Ram damage keeps its kinetic law (closing speed squared × reduced mass) multiplied by a speed gain
`(closing / 8 m/s)^1.5` (`ramSpeedGain` in `sim/damage.ts`), capped at 4 000 hp: 8 m/s ≈ 290 total,
12 m/s ≈ 1 200, 16 m/s ≈ 3 300, 20 m/s and up the cap (owner 2026-09-17: "the speed system for ram
damage needs to scale a lot more").

Turbo Ball adds three ruleset knobs (`jumpMps`, `recoilLaunchScale`, `shellKnockScale`) stamped on
every entity by the mode controller: **F** launches an upright hull 13 m/s upward — a rocket that boosts
again after 0.35 s of flight (round 30, owner 2026-09-20) — (the key
still self-rights an overturned hull), the firing recoil becomes a real launch opposite the muzzle
(×12 — aim behind you and fire for a speed boost, aim down to hop), and impact knocks are ×2.5 —
eight times the ×0.3 baseline. The
HUD shows a rocket · JUMP · F keycap only in rulesets with a jump; the touch layer shows a rocket button there,
which also flips an overturned hull.

### Speed-based damage, falls and rebounds (owner 2026-09-25)

"Add more speed based damage — running into something hard super fast like a rock or building or other tank,
fall damage — make bouncing properly work in the lower gravity modes, and make the physics more proper on
regular modes." Every law is energy based (`sim/impact.ts`): the hull's kinetic energy above a threshold speed,
½ · m · (v − v_min)² in kilojoules, becomes hit points through the mode's hp-per-kJ rate, so a heavier hull takes
more from the same speed and the onset is smooth. The face that struck matters — a glacis takes 70 % of a
broadside, a stern 85 % — and modules follow the shape of the crash: tracks and suspension first, the engine on a
frontal crash or a hard landing, crew shock above 16 m/s (a crash) / 14 m/s (a landing). Tank-on-tank rams keep
the kinetic pool above, now split by mass, by how much of the closing speed each hull brought (the rammer's
discount) and by the face each took it on, and every contact exchanges momentum — the pushed hull moves, the
rammer keeps its share, they part at the mode's ram restitution. Landings rebound: the closing speed comes back
at the mode's restitution, a rebound slower than the floor settles onto the suspension.

Each ruleset carries a `physics` block:

| Mode | restitution | bounce floor | fall from | fall hp/kJ | crash from | crash hp/kJ |
|---|---|---|---|---|---|---|
| Standard (and every mode not below) | 15 % | 1.2 m/s | 6 m/s (a 1.8 m drop) | 0.25 | 4 m/s | 0.16 |
| Turbo Ball | 45 % | 1.5 m/s | 15 m/s (a single 13 m/s jump lands free) | 0.12 | 9 m/s | 0.05 |
| Mars | 50 % | 1.2 m/s | 10.5 m/s (a single 9.5 m/s rocket jump lands free) | 0.16 | 5 m/s | 0.12 |

The table for a 60 t hull under Standard: a wall at 22 km/h costs 19 hp, at 36 km/h 173 hp (121 on the glacis,
the near track yellow), at 60 km/h 774 hp; a 5 m drop 120 hp, an 11.5 m drop 607 hp, a 20 m drop 1470 hp, a
nose-first landing 60 % more. A 12 m/s landing at 1 g hops 16 cm once; on Mars a rocket jump lands at 9.4 m/s,
rebounds 4.7 m/s (a 2.9 m hop), then 2.3 m/s, then settles. The mode cards say `landings rebound 45 %` and
`fall damage above 15 m/s` where a mode differs from Standard. A crash or a fatal fall names its cause on the kill
feed (CRASHED / FELL), in the report's final-blow line and on the wire (`tank_impact`, `tank_destroyed`
cause `impact` / `fall`); the whole thing rides one function in both the solo step and the authority.

Regular-mode physics tightened with it (`sim/movement.ts`): a face steeper than the tracks hold slides under
gravity against sliding friction instead of hovering on a zeroed drive; the yaw rate at speed is bounded by
lateral grip (a ~46 m circle at 60 km/h, wider on soft ground and under low gravity); a parked hull holds its
grade without the old few-cm/s creep; the landing contact is swept inside the step so nothing tunnels at 40 m/s.

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

Tactical map (2026-09-15, `docs/history/research/tactical-map-20260915.md`): the minimap and
the world share one objective language — `src/ui/minimapObjectives.ts` derives the
markers (sides from the viewer's team, zone letters, sector statuses, flag statuses,
spawns from the new `spawns` field of the presentation state) and
`src/ui/objectiveGlyphs.ts` draws them; the HUD paints them on the minimap and the
world presentation rasterises them into floating sprite icons with light columns.
Do not draw a mode-specific marker anywhere else.

## Verification

    node src/sim/matchRuleset.selftest.mjs
    node src/sim/matchModes.selftest.mjs
    node src/game/campaignOperations.selftest.mjs
    node src/ui/minimapObjectives.selftest.mjs
    node src/game/matchModeWorldPresentation.selftest.mjs
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

### Infrared and flight motion

Drone FPV and the AC-130 sight show cool, dark terrain and bright vehicle heat, with a soft sensor glow around hot surfaces. Hostile tanks read brighter than friendly vehicles; team markers remain available. Heat follows visible vehicle geometry, respects depth and alpha cutouts, and does not reveal unspotted or network-hidden enemies through cover. Exiting the aerial camera restores normal materials and color.

The drone reacts to bounded gusts, banks under acceleration and makes visible stabilization corrections. Its camera follows a smaller share of the wobble so the pilot can still aim. Horizontal mouse and touch movement follow screen direction in both flight modes; vertical behavior is unchanged.

## Aerial support, sensors and recon

The AC-130 cannot be spotted, targeted or shot down by enemies. The mission's risk is the ground convoy, which has **90% of normal health**. The 152 mm HE round has a 22 m blast radius, and guided explosive missiles have an 18 m radius, including on a direct penetration.

Aim near the convoy and press **J** for ammunition or **K** for medical supplies, or tap their icons. Supply crates parachute onto a safe ground location over six seconds. The nearest ally that needs that supply diverts to collect it; the remaining escorts continue their route. Ammunition refills the collector's finite reserve; medical crates restore 35% of maximum health. Drop cooldowns are 22 and 30 seconds respectively; uncollected crates expire after 70 seconds. Cooldowns and in-flight crates survive host migration.

**I**, or the sensor button, cycles infrared (white-hot), thermal (blue through red/yellow), green night vision and daylight. Tank scopes offer the same choices, with a separate preference that defaults to daylight. Heat views show visible tanks and bright explosions with a soft sensor halo; neither mode grants spotting through terrain or smoke. Sensor coloring starts only after entering the drone POV. A short static signal-loss transition returns to the carrier after impact, battery exhaustion or manual return; reduced-motion settings suppress the moving grain.

Drones have fictional national service variants with different frames and colors: exposed X/H arms, folding-arm hardware or protective rotor ducts. Their camera gimbal, motor bells, landing feet, wiring, battery straps and payload are modeled on both the launch rail and in flight. Large turrets carry the rail; compact turret footprints and turretless vehicles use supported hull positions. The launch origin follows the chosen parent, including turret rotation and hull attitude.

The drone minimap shows its actual flight position, view wedge, carrier and link tether. The gunship uses an aircraft marker, orbit path and ground aiming marker. Extraction and supply markers remain visible.

### Garage mode previews

The Garage previews the selected battle mode on the currently selected vehicle. Juggernaut adds its animated energy skin; Drone displays the national drone on the same turret or hull mount used in battle; Capture the Flag displays a waving team banner on that supported payload rail, with marching chevron energy on the armor. The carrier aura follows the carried flag’s ally/enemy color and disappears as soon as the flag is dropped or captured. Infected tanks have green, uneven vein pulses; survivors do not. The Infected Garage preview demonstrates that green effect. Changing tanks transfers the preview to the new vehicle. Changing modes removes the previous preview immediately. Returning from battle clears transient damage and impact ripples, then recreates the clean preview if its mode is still selected. The ordinary Garage remains still; only the energy and cloth previews request continuous animation.
