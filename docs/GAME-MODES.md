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
| Capture the Flag | Carry the enemy flag to your own flag base, while your flag is home; the bases stand 320 m apart on the axis, in front of the spawns | flag carrier keeps full speed | 6 s | First team to 3 captures, or the clock (score) |
| Zone Control | Capture and hold three battlefield sectors | — | 6 s | First team to 750 points, or the clock (score) |
| Turbo Ball | Drive or shoot the physical ball into the opposing goal | 0.6 g (hulls, shells and the ball), +85 % speed, +50 % hull, −50 % damage, +43 % reload rate, unlimited rounds, no equipment, no consumables, no module, crew or fire damage, F jumps 9 m/s, ×12 recoil launch, ×2.5 impact knock | 3 s | First team to 5 goals, or the 10:00 clock (score) |
| Endless Horde | Survive rounds that grow every time, without a cap | +100 % hull for the humans, hostiles at 15 % of their own hull (+2 % a round to round 10, +6 % after) on bots one difficulty tier down that rush, unlimited rounds, four allied bots (co-op humans join alpha); round *w* fields round(6 + 3(*w* − 1) + 0.35(*w* − 1)²) hostiles — 6, 9, 13, 18, 24, 30, 37 …, more every round (every 5th a swarm, the law's total at 10 % hull trickling in twice as fast; every 4th a runner round, +25 % speed) — at most 16 alive at once (+1 a further human, cap 20) from a twenty-strong pool that trickles in every 1.5 s on a ring 320–440 m round the humans, never inside 150 m of one nor in a human's terrain sight; 8 s between rounds, 30 % repair for every survivor when a round is cleared, repair caches, no clock; the player arranges both sides | No | The final human-controlled tank is destroyed |
| Frontline Assault | Take three trench sectors in turn, then hold the last one | +35 % hull for the attack (the defenders field their own), unlimited rounds, three allied bots (back 30 s after a death), a twelve-strong one-country formation (the operation's, the arranged country, or AUTO's), 3 / 4 / 5 defenders dug in on each sector's line from the start (out of the attack's reach and terrain sight) whose guns reload 1.35× slower, a two-tank counter-attack on a sector just taken, one more defender from the rear every 45 s while a sector is contested and its line short, 12:00 clock that loses the sortie when it expires; defenders escalate per sector and per campaign operation | No | The last sector held for 20 s, the human attacker destroyed, or the clock |
| Mars Mode | Hold the three station sectors of Olympus Basin | 0.38 g, +25 % speed, +20 % hull, −10 % damage, +11 % reload rate, rocket jump 9.5 m/s (F, boosts again in the air), ×3 recoil launch, ×0.9 impact knock, unlimited rounds; repair caches every 22 s | 6 s | First team to 750 points, or the 12:00 clock (score) |
| Juggernaut | Defeat the boss, or survive as the boss | Choose the boss or hunter role; boss has 8× hull, half reload time and 90% speed; unlimited rounds | Hunters: 6 s; boss: none | Boss destroyed, or boss survives 10:00 |
| Infected | Survive the outbreak, or convert every survivor | Survivors at 130 % hull; five initial infected at 25 % hull and 30 % more speed rise round the survivors (70–120 m out, out of sight where the ground allows) and rush them as a pack, gathering and firing on one survivor at a time; destroyed survivors join them; unlimited rounds | 5 s | No survivors remain, or survivors reach 7:00 |
| Realistic | Destroy the opposing force through critical damage | Normal spotting; no hull HP attrition, automatic module repair or consumables | No | Crew eliminated or ammunition destruction eliminates a team; 15:00 draw |
| Gun Game | Complete a five-weapon ladder | Two confirmed kills per stage; unlimited ammunition | 4 s | First player to complete the ladder; 15:00 score decision |
| Drone | Destroy opponents with tanks and directly piloted drones | Launch a physical FPV quadcopter; its shaped charge interacts with cages, ERA and spaced armor at the impact point; unlimited rounds | 6 s | First team to 20 kills (configurable), or 10:00 score decision |
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

The gunship's rounds use the same effects as every other round (lane ac130-fx-228, 2026-10-19): the 30 mm autocannon
fires a NATO red tracer belt (every second round lit), the 152 mm howitzer a heavy traced shell wider and brighter than a
tank round's, and the guided missile is a Hellfire-class rail missile with its own airframe, motor flare and dense white
smoke trail. Impacts use the munition recipes (the howitzer's and missile's plunging starburst and rayed crater).

From the pilot's own lens the guns sit beside and behind the camera (lane ac130-barrels-230, 2026-10-21; the owner: the
guns "behind" the camera, "barrels are visible so we can see them fire and recoil"): the 30 mm low on the left, the
missile rail above it and the howitzer on the right, each laid on the aim point with its breech out of the frame, clear
of the HUD on a desktop and a phone. They hold their places and sizes on the screen at every zoom (the lens guns' group is
the camera's frame scaled across the view by the zoom). A shot recoils its gun (the 30 mm's short kick, the howitzer's
slam and run-out, the missile leaving its rail and the next sliding on once the launcher is ready), flashes at its
muzzle and sweeps its gas out of the frame past the gun; in the infrared and thermal lenses each shot flashes its barrel
past the heat threshold, and a barrel fired hard stays hot and cools. Each round is drawn from its gun's muzzle on a
straight line to where it is aimed, joining its simulated flight line by 90 % of its slant range, and its first 48 m
also draw as an even line from the muzzle (from beside the gun its nearest metres fill most of its length on the
screen). The missile eases off its rail over its first 60 m at its rail round's size, its smoke laid through a narrow
look of its own (no wedge seen down its length) that fades only within 8 m of the glass. All of it is presentation:
the simulation still fires every gunship round
from the orbit centre. Every other view (the killcam, the ending's replay, any camera that is not the pilot's lens) sees
a small gun-port flash on the airframe, and the missile drawn leaving its rail under the port wing, joining its guided
line within 120 m; its smoke spreads less than the family's and thins out within 70 m of an aloft camera. Every
missile's motor core is a soft glow that
never grows past ~0.23 degrees from the camera, and a heavy charge (the howitzer's shell, the missile's warhead) bursting
on a hull draws the full detonation the ground burst does (a white-hot dome of fireball medium cooling inside its own
smoke), not a plate flash. A heat-imaging lens (the gimbal's infrared and thermal views, a thermal sight) sees the
rounds' burning compound at its night radiance whatever the daylight, and the 30 mm's day colour carries the
strontium's orange so the dash reads against a bright sky.

The airframe is a procedural C-130-proportioned model (`src/game/gunshipAirframe.ts`: lofted fuselage, high wing with
dihedral, four turboprops, the port-side 30 mm and howitzer, the sensor ball) on one lit material in the shadow cascades.
It is its own chunk: an AC-130 battle loads it, and the covered deployment builds it and compiles its programs before
the reveal. The camera rig hides the pilot's own vehicle on every frame its gimbal lens is the camera and shows it for an
external pose, so the airframe draws in the killcam, the ending's replay and orbit, and never inside the lens; the
gimbal's sight and fire solution leave the HUD with the lens.

A kill made with the gunship is credited to the pilot (kills, score and medals) and shown as the **AC-130**'s: the kill
feed, the killcam, the battle report, the final blow, the end rosters, the service record and the crew radio all name the
aircraft and show its icon, never the tank chosen in the garage. The authority stamps the source on the hit and the
destruction (`sim/aerialCombat.ts` `killSourceOf`); a drone's kill reads as the FPV drone's the same way.

Four allied ground vehicles accompany the gunship by default. They have 90% of their normal hull strength, slower reloads and reduced speed, and use normal navigation to reach the green **E** extraction area. Enemies pursue the convoy. Save at least half; killing enemies alone does not complete the mission. The objective shows allies still on the field, the number extracted, the rescue requirement and route progress. Casualties do not respawn. An eight-minute timeout or losing too many escorts fails the operation. Multiplayer pilots all provide air support, with separate friendly bots reserved for the escort. Extraction and casualty state survive host migration.

## Asymmetric teams and progression

**Juggernaut** offers a role setting. As boss, you face the hunting team; as a
hunter, you join allies against one bot boss. In hosted rooms the boss role belongs
to the first participating human when that role is selected; other humans hunt it.
The boss is 12% larger, including its armor and module hit geometry, and carries a subtle blue surface highlight that follows the hull, turret, barrel, and running gear with traveling energy bands. Shell contacts, including ricochets, create short, undulating blue-white ripples at the actual impact location; turret and gun contacts follow those moving parts. There is no enclosing bubble, and the glow does not reveal the tank through cover. Battle impact ripples and enlargement are cleared on Garage return. If Juggernaut remains selected, the Garage applies a fresh animated energy preview to the selected tank; switching modes removes it. It never respawns. Its survival clock and health are shown in the objective.

**Infected** begins with five infected opponents (at least three in a custom setup). Survivors have 130% of their normal HP (150% until gameplay-modes-233); infected have 25% (30% until gameplay-modes-228), 30% more speed and their own reload (80% longer in round 2 only), and their bots rush the survivors their side spots (`infection.hunt`, the honest hunt) as a pack (`infectionBots.packPullM`, the doctrine's `packFire`). Every respawn takes five seconds. Rounds are unlimited. A survivor's destruction changes
that player's team before their next spawn, including their allied/enemy roster
and bot targeting. Bots discard a cached enemy as soon as either tank changes sides;
the converted player’s spotting readout follows their new team. The remaining survivors win by lasting five minutes (seven until round 2 of gameplay-modes-228); infected
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
`tools/gunship-fx.browser.mjs` fires the AC-130's real weapons, holds a
mid-flight frame of each round and checks it draws through the October effects
(the 30 mm and the 152 mm in the projectile tracers, the missile as the hellfire
airframe and trail), that a networked snapshot round draws the same, and the
cleanup on reset; `tools/drone-details.browser.mjs` renders the
drone's dock and flight airframe kit (merged materials, full detail);
`tools/garage-mode-preview.browser.mjs` selects modes in the Garage, swaps
tanks, runs the idle animation and returns cleanly from battle; and
`tools/vehicle-special-action.browser.mjs` checks that the HUD's special
controls follow a mode loadout change on the same vehicle.

Horde (owner 2026-09-15: "the horde is not endless, there's only 3 tanks every time and
they're the same tanks each round"; 2026-10-18: "make it work a lot more properly like youd expect, more enemies per
round") fields `hordeWaveTotal` hostiles a round: round(`waveSize` + `waveStep`(w − 1) + `waveCurve`(w − 1)²) ×
(1 + `perHumanTotal` per further human) — 6, 9, 13, 18, 24, 30, 37, 44, 52, 61 … by default, rising every round (a swarm
round keeps the law's total and trickles in `swarmTrickleScale` (0.5) × as often apart, at its `swarmHull`; round 2: a ×1.4
swarm total let round 5 outnumber round 6) — with no cap. At most `hordeMaxAlive` (16, +1 a further human, cap 20) are on the field at once; the rest
queue and trickle in every `trickleS` (1.5 s) as the field thins, each a pool identity that has rested at least
`recycleAfterS` (6 s), drawn from a pool of twenty (`ruleset.enemies`), so the entity count stays bounded while a round
grows past the pool. A hostile arrives on a ring (`spawnRingM`, 320–440 m, so first contact falls 8–25 s into a round;
260–380 m in round 1) round the living humans' centroid, in the next
of three 60° sectors facing the hostile base, never inside `spawnMinHumanM` (150 m) of a human nor where a human within
450 m sees it over the terrain (a height-field march; buildings only hide more); with no clear ring point it arrives at
the hostile base if that is clear too, else it stays queued (a field left empty for `stallTrickles` (four) trickles takes a
ring point out of reach but in sight). A round's fallen allies stand up before its arrivals are placed, so no arrival lands
in reach or sight of an ally revived at its base (round 2: the critic's 11 / 19 arrivals within 150 m / in sight). `state.horde` carries `queued`, `remaining` (alive + queued) and `special` ('runner' / 'swarm');
the HUD reads "WAVE 7" and "23 / 37". The zombies rush (`ruleset.bots`, "Bot aggression per mode" below). The wave
law and the pool are `HordeRules` / `TeamArrangement` in `sim/matchRuleset.ts`
(`TEAM_ARRANGEMENT_LIMITS`: allies 0–6, pool 6–20, first wave 2–12). The zombies (owner 2026-10-17, "Zombie
balance" below): the ruleset's `hpScale` (2) is the humans' hull; a hostile arrives at `hostileHpScale` (15 %) of its
own vehicle's hull, `hpPerWave` (2 %) more each wave (`hordeHostileHull`; the controller hands the revive
`hordeWaveHealthScale`, which the ruleset stamp multiplies back by `hpScale`), and its bot plays
`hostileDifficultyStep` (one) difficulty tier below the battle's (`rulesetBotDifficulty`). Mobility increases by
`speedPerWave` (4.5 %) per wave, capped at `speedPerWaveMax` (55 %). Clearing a wave repairs every
surviving attacker by `waveRepair` (30 %) of maximum hull, starts an `intermissionS` (8 s) intermission and
places one deterministic floating cache. Under the Horde's unlimited rounds every cache is a repair
(`cacheHealChance`; the kind draw is kept, so the seeded stream and the cache positions are unchanged). Under spec
rounds the repair probability begins at 62%, falls by 5.5 percentage points per wave, and never falls below 8%; the
remaining caches replenish 20% of every non-full authored ammunition channel (with a minimum of one round per
channel). At most 12 uncollected caches remain active.

Frontline Assault's opening wave is the same fresh draw; every captured sector then REINFORCES
the line (owner 2026-09-17: "capturing bases … shouldnt reset tanks"): defenders still alive keep
their identity, position and damage, and only the shortfall to `initialActive (3) + extraDefenders + sector`
defenders arrives as fresh identities (rested first, that sector's wrecks last), on the sector's line
(`defendersStartOnLine`: 70–110 m behind its centre, clear of the zone, facing the attack, stepped back along the axis while
an attacker stands within 200 m of the slot or sees it over the terrain — at most four 20 m steps, `lineGuard`; the opening
wave too) with
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
750-point target, 6 s respawns) with a twelve-minute clock. Boost caches: from 12 s a repair cache (a repair or
ammunition cache under spec rounds; the mode plays unlimited rounds since 2026-10-17) drops every 22 s (`MARS_CACHE_FIRST_S` / `MARS_CACHE_INTERVAL_S`) and any human on
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
- **Roster** — `rulesetAllyCap` sets the solo split (Standard 6 / 7, Horde 4 /
  20, Frontline Assault 3 / 12; the co-op modes size their own field from
  `ruleset.allies + ruleset.enemies`, `state.battleRosterPlan`). TEAM NATIONS ("Team nations" below) decides the
  sides first: under MONO-NATION (the default) `sim/teamNations.ts` seats each side from one country and the pool
  described next is RANDOM's (and a forced debug roster's). Under RANDOM a campaign
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
  fillers as hostiles); rooms seat their bots through `mp/room/roomBots.ts` (below). Ordinary
  matchmaking rotates too: the bots of the last two battles rank behind every fresh vehicle of
  the player's era AND of its contemporary eras (`matchmaking.ERA_NEIGHBOURS`; the eighteen other
  next-generation hulls alone cannot fill thirteen seats twice), so a vehicle only repeats once
  both catalogs are used up and WW2 still never meets modern (`game.recentBotSpecIds` /
  `previousBotSpecIds`, `rosterState.rememberBattleBots`, `matchmaking.rankMatchCandidates`),
  and the seeded roster shuffle's battle ordinal starts
  from the profile's lifetime match count (`profile.battleOrdinalBase`), so a fresh page load
  never re-draws the same first battle and consecutive rosters differ whenever the catalog allows.
- **Team arrangement (2026-09-15)** — the play menu's arrangement panel (allied bots,
  enemy pool, first Horde wave, enemy country) is saved per mode
  (`cot.game.teams.v1`, `readTeamArrangement`) and folds into the ruleset
  (`matchRulesetFor(mode, campaign, arrangement)`); a campaign operation's nation is
  never overridden. TEAM NATIONS is one setting a player keeps for every mode (`cot.game.teamNations.v1`,
  `readTeamNations` / `writeTeamNations`, folded into every mode's arrangement). In a room the host's arrangement
  (TEAM NATIONS included) and the chosen campaign operation ride the lobby (`set_arrangement`,
  `set_campaign_operation`; a guest's `set_arrangement` is refused, and the setting survives `set_game_mode` and a host
  migration), `roomBots.planRoomBots` seats the bots (the room's start plan and the p2p host's `planFromRoom` call it
  with the match seed and name the same bots) and the ruleset passes into the authority.
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
campaign operation names the map, the nation and the difficulty). The room seats its hostiles always — Frontline's twelve
defenders, the Horde's twenty-strong pool — and the allied bots up to the mode's sortie (three, four) when it fills with
bots (`roomBots.planRoomBots`, gameplay-modes-228; v2 seated none, so a room's waves came up empty forever, and the
authority now refuses to start a wave on an empty pool). Campaign progress stays a solo record: a network `battle:ended`
(`network: true`) never records an operation.

Respawning modes (Capture the Flag, Zone Control, Turbo Ball, Mars, Gun Game, Drone, Infected and the Juggernaut
hunters) revive the player through `mode:respawn`; Endless Horde and Frontline Assault never revive a human (their
allied bots come back when a round is cleared or a sector falls, and in Frontline 30 s after a death too (`allyReviveS`,
behind the last sector taken)). The killcam
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

## Bot aggression per mode (gameplay-modes-228, 2026-10-18)

The owner, 2026-10-18: "for frontline assault, im thinking up its aggression of tanks more / and for endless horde, make
it work a lot more properly like youd expect, more enemies per round, and then increase aggression in that game mode too
because of what it implies / for flag and turbo ball, increase aggression of bots trying to capturing flag or pursuing
ball / make the allied/enemy tank country enforcement work properly", then "infected should be super aggressie as well".

**Doctrine.** How a side's bots fight is a rule: `BotDoctrine` in `sim/matchRuleset.ts`, one per side
(`ruleset.bots.alpha` / `.bravo`, read through `rulesetBotDoctrine(ruleset, side)`, memoised and frozen). Both bot
builders hand the controller a live getter (`doctrine: () => rulesetBotDoctrine(ruleset, entity.team)`), so an Infected
convert fights as an infected from its next tick. `CLASSIC_BOT_DOCTRINE` is the controller as it stood: every knob site in
`game/ai.ts` multiplies by 1 or keeps its branch under it and the seeded draws keep their order, so Standard, Realistic,
Zone Control, Gun Game, Drone, the AC-130 and Juggernaut play exactly as before (`server/battlePacing` byte-identical; the
harness's Standard and Juggernaut rows reproduce the baseline field for field).

| Mode, side | Doctrine |
| --- | --- |
| Endless Horde zombies (RUSH) | no opening read, no hold band, no cover, never falls back, no kite, scoot or settle, no spearhead guard, rounds never conserved, the stalemate push after 4 s, missions at full speed and never broken off, hard turns driven round (`rollingTurns`, round 3); the hunt's drive: a spotted target inside 70 m is run in on, aimed 24 m beside it on the side it will circle (round 3: aimed at its hull the run-in met the no-ram brake and stood), then orbited at 16–28 m with the turret laid, each friendly hunter already nearer it putting this one 10 m further out, at most 3 rings (`RUSH_DRIVE`); it steers off a ram: a seen enemy hull in the lane ahead (the two half-widths plus 3 m, its place 1 s on; round 3b, was 2 m and 0.6 s) slows it to a swerve inside 12 m and stops it only inside its stopping distance plus 3 m, backing off inside 1.5 m; a target is claimed inside 60 m (`claimRangeM`) and let go past 90 m; hits ignored; they arrive 320-440 m round the humans (pulled in to 26 s of the hull's own pace, `spawnReachS`), their first 60 m of approach out of sight too at the wave's pace (`sightLeadM`), reload at their own rate and aim at the battle's tier (`hostileDifficultyStep` 0, round 3b: a tier down a human fell once every 18-21 zombie kills); a straggler that gains no ground on the humans for 40 s is benched and re-arrives on a 160-230 m ring (`strandedRingM`), and a slot benched more than twice in one wave is retired from it (`strandedRetireAfter`, round 3b: on Verdant one zombie re-arrived twenty times and wave 1 never cleared) |
| Infected (RUSH, second only to the zombies) | the RUSH table, a target claimed at any range, the hull angled to a hit (driven round at the rolling steer, round 3b); they rise on a ring 70–120 m round the survivors (`infectionBots.arrival`: out of their sight where the ground allows, never inside 60 m) and, where that ring has no clear point, on a 120–200 m ring before their base (`fallbackRingM`, round 3b: with ten survivors spread to their rally reach three of five rose 400-740 m off, a minute from the fight); a quarter of their own hull, +30 % speed, their own reload and the plan's seven-minute round (round 3: round 2's ×1.8 reload and five minutes made it a shooting gallery); the pack hunt (gameplay-modes-233: each infected already on a survivor pulls the next hunter 60 m nearer it, `infectionBots.packPullM`, where the shared hunt rules spread them one a survivor, and each friend already laid on a hull makes it read 1.5 times nearer, the doctrine's `packFire` 0.5) against survivors at 130 % hull |
| Endless Horde allies | no opening read, rounds never conserved, the spotted search; they hunt spotted zombies only within 120 m of the humans (`hordeBots.allyLeashM`) and otherwise rejoin them; with none in reach they screen the humans 40 m toward the threat, 22 m apart (`allyScreenM`, round 3); the rushers' no-ram lane (round 3b: the humans' side drove into fodder hulls — 0.31 -> 1.0 bot ram deaths a run) |
| Infected survivors ("fight back hard") | no opening read, rounds never conserved, half the fallback, angled hits, the push after 6 s of silence, spearhead guard and scout kite kept, the full hold band (range is their weapon), the spotted search, the no-ram lane (round 3b); unengaged survivors rally on their own living centroid (`infectionBots.survivorRallyM`, 90 m) |
| Frontline attackers | no opening read, rounds never conserved, missions at full speed and never broken off, half cover, a quarter fallback and no shoot-and-scoot (round 2), angled hits, the push after 6 s, a 0.6 hold band, the spotted search; `assaultBots`: odd ranks approach on lanes 60 m off the axis and converge in the last 80 m, and at the zone's edge a push waits for 2 friends within 80 m, or 15 s |
| Frontline defenders | dug in on the line (`defendersStartOnLine`, guarded from the attack's reach and sight: `lineGuard`), no opening read, rounds never conserved, 0.75 cover, a quarter fallback and no shoot-and-scoot (round 2), angled hits, the push after 6 s, one hold slot each on a 14 m ring round the sector (`holdSpreadM`), guns 1.35× slower (`hostileReloadScale`; 1.5× in round 1, eased to hold the band once neither side scoots); a spotted attacker within 80 m of the zone's edge draws a sortie that stops 35 m short (`zoneSortieM`, `SORTIE_DRIVE`) and returns; two fresh defenders counter-attack a sector just taken 8 s after it falls, for 40 s (`counterAttack`); one more arrives from the rear every 45 s while the sector is contested and the line is short of its count (`reinforceTrickleS`, `reinforceExtra` 0); the attack regroups for at most 25 s (`regroupMaxS`, was 60) |
| Capture the Flag | the flag bases stand 320 m apart on the axis, in front of the spawns, and a capture is made at the own base (`flagPitch.baseAxisM`; round 2: on the deployment centres a flag was taken among the enemy's 6 s respawns and run 800 m home — 19 pickups and 0.75 captures a match; 400 m until gameplay-modes-233, which also lets the carrier keep full speed, `flagPitch.carrierSpeedScale`: 0.88 → 1.38 captures a match over seeds 401-408); roles dealt once a second and at once when a flag changes hands (`flagBots`): while a home flag is away half the team (at least 2, the nearest first) recover it, since a capture needs your own flag home, and the rest raid back; a carrier takes 3 escorts 24 m ahead of it at ±22 m and, with its own flag home, 1 guard stays home and every other bot escorts too (the rest as a rearguard 24 m behind); with nothing carried, from 6 a side a 15 % squad defends and the rest raid; pursuers lead a carrier by 2.5 s. Doctrine: no opening read, missions at full speed and never broken off, a route ending within 60 m of its objective finished on the local router (`missionLocalReachM`), half cover, a quarter fallback, no shoot-and-scoot (round 2), angled hits |
| Turbo Ball | roles (`ballBots`): 3 strikers on the ball's drag-law intercept (2 until gameplay-modes-233: 4 of 8 matches goalless, 1 after) (τ 2.08 s, two iterations, at most 3 s ahead), a keeper 30 m off its goal, 2 screens, the rest wings; at most 3 a team within 30 m of the ball; any bot of any role with a clear line to the ball and the opponent goal behind it, 12–100 m off (160 m until gameplay-modes-233), shoots it, before a tank target farther than the ball (`shootBall.everyRole`, `overTanks`), a striker jumps at a ball 4–25 m ahead (`STRIKER_JUMP`); a seen enemy hull in the lane ahead brakes and turns a bot unless it contests the ball (`noRamLane`); rounds never conserved; the goals 480 m apart on the axis (`ball.goalAxisM`); an idle ball resets after 30 s |
| Mars and the other classic modes | no table: each builder's own route push (`rulesetRoutePush`: the solo battle 4 s / 18 m, the authority 3 s / 12 m and its fast modes 1.25 s), so they route exactly as on integ/228 in both (round 2, the critic's E9: one 3 s / 12 m figure had changed the solo battle's) |

**The honest hunt** (Horde and Infected; replaces the hunt that routed every hunter at the nearest human's live
position). The mode controller reads the side's spotting through a hook both builders pass (`options.spotting`): every
0.5 s it refreshes the sightings, once a second it assigns each hunter in id order to the nearest opponent its side spots,
else the freshest sighting within 45 s, else a seeded sweep of the opponents' half, at a cost of distance plus 60 m for
each hunter beyond the fair share; ranks take lanes 15–45 m to the side until 90 m out, 40 % on ±50° flank arcs, so the
pack arrives from several bearings, not in a line (`HUNT_RULES`). The hunt is a labelled `hunt` mission, so no other
driver takes the waypoints back (a mission owns its route: no search while it drives). A revived bot's last pushed
destination is cleared, so its first route push lands at once. No bot reads an unspotted opponent's position, and
multiplayer hosts send none.

**Measured** with `tools/mode-aggression-harness.mjs` (seeded headless battles through the real solo code path, the player
seat a bot, normal tier; the gate `tools/mode-aggression-targets.json` via `compare`). Round 2 (2026-10-19) measures on
the round-1 critic's 16 seeds and maps: 101-108 on Winter, Autumn, Steppe, Coastal, Verdant, Redrock, Steinburg and
Desert, then Frontier, Railyard, Alpine and Delta two seeds each; the Horde's team survival and Frontline's park and
shield seats on 101-112; the shared authority on 101-104 for parity. Before is integ/228 (93559dfe8, the round-1
critic's runs; Frontline's fight seat re-run at ac0a12960 with round 2's harness, whose fight seat plays the objective).
The runs, scripts and compare output live in `cot-launch-state/streams/gameplay-modes-228/metrics/round2/final3`:

| Mode | Measure | Before | After | Target |
| --- | --- | --- | --- | --- |
| all changed | hunt routed on an unspotted opponent (Horde / Infected) | 20.6 % / 17.1 % | 0.2 % / 0.3 % | ≤ 2 % |
| classic | Standard and Juggernaut runs under RANDOM (seeds 101-104) | — | every run identical to its integ/228 run, field for field | identical |
| Horde | arrivals per round (median); every cleared round on the law; peak hostiles alive | 6, 8, 10, 13, 15, 17, 20 (capped); 20 | 6, 9, 13, 18, 24, 30, 37, 44 …; 85 of 85 on the law; 16 | the law, rising every round; ≤ 16 |
| Horde | arrivals inside 150 m / in a human's sight (fight seat) | 448 / 622 | 0 / 0 | 0 / 0 |
| Horde | waves with first contact outside 8-25 s | 63 | 6 (miss) | 0 |
| Horde | zombie engaged-standing-still; engagement distance; advance | 31.6 % / 137 / 53.4 % | 8.4 % / 39 / 80.9 % (miss) | ≤ 5 %; ≤ 50 m; ≥ 80 % |
| Horde | rounds reached, fight seat / team survival (median); team runs ended by round 15 | 5 / 7.5 / 11 | 6 / 7 / 9 (miss) | ≥ 4 / 7-11; 12 of 12 |
| Horde | zombie kills per human-side death; hunter rams (16 runs) | 15.39 / 14 | 31.23 / 41 (miss) | 6-12; 0 |
| Infected | first infection; infections a minute | 163.3 / 1.58 | 72.3 / 1.9 (miss) | ≤ 60 s; ≥ 3.5 |
| Infected | infected within 150 m of a survivor; distance | 50.3 % / 181 | 78.8 % / 134 (miss) | ≥ 80 %; ≤ 90 m |
| Infected | engaged-still; advance; fall back; scoot | 20.3 % / 55.9 % / 12.7 % / 32.2 % | 6.2 % / 72.7 % / 0 % / 0 % (miss) | ≤ 6 %; ≥ 75 %; ≤ 2 %; ≤ 5 % |
| Infected | shots a bot-minute, infected / survivors; survivor wins (16) | 7.2 / 4.86 / 1 | 8.17 / 7.22 / 7 | ≥ 8 / ≥ 5.5; 2-8 |
| Frontline | sector-1 fight (16); first sector taken; defenders' distance to the live zone | 0 / 22.8 / 200 | 13 / 52.7 / 78 (miss) | ≥ 14; ≥ 45 s; ≤ 80 m |
| Frontline | attacker wins, fight seat (16 seeds); match length (median) | 0 % / 160 | 56.3 % / 249 (miss) | 40-55 %; ≥ 150 s |
| Frontline | park-seat progress; shield-seat end (median) | 50 % / 245 | 75 % / 283 | ≥ 67 %; ≤ 300 s |
| Frontline | falling back, attackers / defenders; kills a minute | 9.8 % / 12.2 % / 0.9 / 1.11 | 4.6 % / 5.7 % / 1.88 / 1.05 (miss) | ≤ 7 %; ≥ 2 |
| Frontline | engaged-still, attackers / defenders | 17.6 % / 23 % | 28.2 % / 31.2 % (miss) | ≤ 12 % / ≤ 15 % |
| CTF | captures a match; matches with a capture; decided by captures; draws (16) | 0.38 / 4 / 0 / 12 | 1.75 / 13 / 5 / 4 | ≥ 1.5; ≥ 12; ≥ 4; ≤ 8 |
| CTF | first pickup; carried share; escort within 80 m; pursuers within 120 m | 93 / 15.5 % / 8.2 % / 29.8 % | 56.9 / 46.6 % / 25.6 % / 42.1 % (miss) | ≤ 70 s; ≥ 25 %; ≥ 35 %; ≥ 55 % |
| CTF | bot-on-bot ram deaths a match | 22 | 19.31 | ≤ base + 10 % |
| Turbo Ball | goals a match; goalless matches (16); touches a minute; possession changes | 0.13 / 14 / 10.14 / 39.1 | 1.63 / 3 / 32.04 / 128.9 | ≥ 1.5; ≤ 4; ≥ 18; ≥ 60 |
| Turbo Ball | ball still; end third; Redrock / Steinburg touches | 61.8 % / 23 % / 62 / 13 | 23.2 % / 39.4 % / 223 / 48 (miss) | ≤ 25 %; ≥ 35 %; ≥ 100 each |
| Turbo Ball | nearest bot (alpha / bravo); crowd cap held | 52 / 49 / 99.1 % | 59 / 60 / 98.2 % (miss) | ≤ 30 m; ≥ 98 % |

Of the gate's 249 rows 218 pass (all 120 TEAM NATIONS rows; every stuck, bunching, ammunition and classic-identity guard;
`server/battlePacing` plays its matches identically to integ/228's on a map subset and passes in full). What round 2
changed, in the order the critic's blockers and majors came: Frontline's line stands out of the attack's reach and
sight (`lineGuard`), neither side scoots, a quarter fallback, the defenders' guns ×1.35 (the A/B: ×1.5 gave the attack
12 of 16, ×1.25 1 of 6, ×1.35 7 of 14 and here 9 of 16, one match over the band's top); Capture the Flag's bases stand
400 m apart in front of the spawns (`flagPitch`) and its bots neither scoot nor fall back far; the Turbo Ball's every role
shoots the ball and its goals stand 480 m apart; the Horde's arrivals keep their first 60 m of approach out of sight and
its zombies reload ×2.2; the Infected rise on a 90-150 m ring with guns ×1.8 and a five-minute round; the rusher's no-ram
lane runs last of the drivers. Still open, each a tension the targets carry or a lever outside the plan's list:
the zombie kill ratio (a human side that reaches round 4 has killed 28 zombies, so 6-12 a loss cannot hold beside
"rounds ≥ 4"), hunter rams (most are allied hulls reversing or crossing into a braking rusher; the rule counts the
rusher's own closing speed over 1 m/s), Infected infections a minute (survivors winning 7 of 16 five-minute rounds caps
it near 2) and its approach distances (the ring, out of sight, is the infected's 90-150 m), Frontline's engaged-still
shares (a defender holds its line by design), the Turbo Ball's bot distance to the ball (on Steinburg the ball lies still
64 % of a match in the town centre with the nearest bot 54-72 m off and resets nine times: the town's streets, which the
steinburg-center lane is rebuilding) and CTF's escort and pursuit shares (the carrier now runs 400 m, not 800 m).

## Team nations (gameplay-modes-228, 2026-10-18)

The owner, 2026-10-18: "make the allied/enemy tank country enforcement work properly" and "be able to select wehtehr we
want team enemies to be mononation or just random". **TEAMS** is one switch — MONO-NATION (the default; the player's flag
against the enemy's, AUTO's globe until a country is chosen) or RANDOM (the globe) — in the Garage battle menu, the solo
play menu and the lobby (the host edits it, guests see it locked); a player's choice is kept for every mode
(`cot.game.teamNations.v1`). The values live in `sim/matchRuleset.ts` (`TEAM_NATIONS_IDS`, `TEAM_NATIONS_RULES`,
`TEAM_NATIONS_MODE_SCOPE`); the planner is `sim/teamNations.ts` (`pickNationalSides`), shared by the solo battle
(`rosterState.pickNationalBattle`) and rooms (`mp/room/roomBots.ts`).

MONO-NATION seats:

1. The player's pick is always kept, and the allied side is the player's country (in a room, the majority country of
   that side's humans).
2. The enemy side is one country that is not the allies': the campaign operation's, else the arranged country (the enemy
   select, where the player's own country is disabled), else AUTO, a seeded draw among the countries that field
   contemporaries of the player's era, a rival bloc weighted three to one.
3. A side that runs short fills from its country's closest allies in a fixed order (`COUNTRY_ALLIES`), then repeats its
   own contemporaries (or its humans' vehicles); a far era comes last. Every fill, repeat and clash is a note on the plan
   (`notes`), which the receipts and the census read.
4. No country sits on both sides. When a room's two sides' humans share a country, bravo's bots take another and the plan
   notes it. AUTO never draws a country any allied human drives, the majority's or not (round 3, the critic's E-R2-5: a
   room of two American humans and one Russian drew an all-Russian enemy in 74 of 400 seeds); an arranged enemy that is
   an allied human's minority country is kept, and noted (`reason: 'humans'`).
5. A room seats at most six distinct bot vehicles a side (`mpDistinctBotSpecsPerSide`: each is a profile every seat
   loads). Bot ids stay `bot-<team>-<n>` / `mode-<team>-<n>`, never a vehicle id; duplicate picks are valid.
6. A vehicle fights for its operator (`countryOfVehicle`, `sim/countries.ts`): the Leopard 2A4M CAN, whose spec names its
   German design, is Canada's — a fourteenth country, west bloc, its allies the US and the UK first — so it no longer sits
   in German teams or in Italy's German fill (round 2). The allied side's country and its humans' count as the allied
   side's even with no allied bot seat, so Juggernaut's hunters never fill from the player's own country (round 2: 3 of
   32 census seeds did with an arranged enemy).

The country table and the operator overrides are data only (`sim/countries.ts`, with the campaign's formation countries
and the era bands); the planner (`sim/teamNations.ts`) rides with it in one chunk. The garage's mode settings and TEAMS
switch load with the battle menu's first open, so the game's entry chunk is smaller than integ/228's (round 2, the
critic's E3: 811,302 → 809,488 bytes; `npm run check:bundle` passes).

RANDOM seats any contemporary vehicle on either side, the mixed pool of before. The switch itself shows MONO / RANDOM with
the flags and the globe; a rule card adds one short chip only where a mode's fiction bends MONO-NATION
(`rules.teams.scope.*`; round 2 dropped RANDOM's chip and the prose that repeated the switch): the Horde's pool is one country; Frontline's defending formation is one
country (the operation's in the campaign); in Infected the opening survivors are the player's country and the opening
infected one enemy country, and a convert keeps its hull, so the sides mix as the outbreak spreads; in Juggernaut the
hunters are one country (boss role) or the player's country faces one enemy juggernaut (hunter role); the AC-130's escorts
are the player's country and the ground force one enemy country. Rooms read countries from `sim/nationIndex.generated.ts`
(the rooms Worker cannot import `src/vehicles`; `tools/nation-index.mjs --check` keeps it equal to the fleet).

Census (`mode-aggression-harness.mjs roster`, 7 modes × 32 seeds, no simulation):

| Row (32 seeds, before → after) | Allied nations | Enemy nations | On both sides | Enemy = player's country | Far-era seats | Bots outside the plan |
| --- | --- | --- | --- | --- | --- | --- |
| Standard / CTF / Turbo Ball, default (MONO) | 4.69 → 1 | 5.25 → 1 | 2.41 → 0 | 16 → 0 | 0 → 0 | 0 |
| Frontline Assault, default | 2.78 → 1 | 1 → 1 | 0.09 → 0 | 3 → 0 | 12 → 0 | 0 |
| Endless Horde, default | 3.38 → 1 | 1 → 1 | 0.19 → 0 | 6 → 0 | 5 → 0 | 0 |
| Endless Horde, arranged enemy + sides ('both') | 1 → 1 | 5.19 → 1.78 (fills printed in 24 runs) | 0.06 → 0 | 2 → 0 | 20 → 0 | 0 |
| Infected, default | 6.19 → 1.06 (fills printed in 2) | 4.03 → 1 | 2.28 → 0 | 14 → 0 | 0 → 0 | 0 |
| Juggernaut, default (boss role) | — | 7.38 → 1 | 0.72 → 0 | 23 → 0 | 0 → 0 | 0 |
| RANDOM, Standard / CTF / Turbo Ball | 4.69 | 5.25 | 2.41 | 16 | 0 | — (the old pool, field for field) |
| RANDOM, Frontline / Horde enemies | — | 7.38 / 9.47 | 2.28 / 3.56 | 23 / 29 | 0 | — |

The player's pick is kept in every row (32/32). Rooms: with one human (`mp1`) the bots no longer clone the host (32/32 runs
before, 0 after), each side seats six distinct vehicles (1 before) and the enemy never holds the host's country (32 → 0);
the co-op rooms seat 4 allies + the 20-strong pool (Horde) and 3 + 12 (Frontline), 0 + 0 before; `planStart` and
`planFromRoom` name the same bots in every row (32/32). All 120 TEAM NATIONS rows of the gate pass
(`tools/mode-aggression-targets.json`, `nations.*`).

## Zombie balance and endless rounds (2026-10-17)

The owner, 2026-10-17: "if you are out of ammo, the reload indicators should have a special edge case … for special
modes like juggernaut, ammo should be endless. also the way that endless horde is supposed to work is that all the
zombies actually have low hp. rn its humans with low hp and a bunch of overpowered glowing zombies that can steam roll
them, which needs to be fixed to make this more fun!"

**Endless rounds.** `ruleset.ammo` classes every mode. Standard Battle, Capture the Flag, Zone Control and Realistic
keep the vehicle's own loadout (`spec`); every special and arcade mode plays `unlimited` rounds: Turbo Ball, Gun Game
and the AC-130's gunship as before, and now Juggernaut (both roles), Infected, Endless Horde, Gravity Mode (`mars`),
Drone and Frontline Assault. The AC-130's ground escorts still carry spec rounds: the gunship's ammunition airdrop is
for them. Under unlimited rounds every cache the Horde or Gravity Mode drops is a repair (`cacheHealChance` returns 1;
the kind draw is kept, so the seeded stream and the cache positions are those of a spec-rounds match), and the Horde's
status line drops its ammunition count (`hud.modeStatus.hordeWave`). `src/sim/specialModeAmmo.selftest.mjs` pins the
classes, the rule cards, the caches and the authority's refill after a shot.

**The zombies.** Both zombie modes had it backwards — fragile humans against tanky, fast, quick-firing zombies — and
both lost every bot round within minutes. Now the zombies are fodder and the humans are the sturdy side; the pressure is
numbers:

| | Infected before | Infected now | Endless Horde before | Endless Horde now |
| --- | --- | --- | --- | --- |
| Human hull | 30 % | 150 % | 125 % | 200 % |
| Zombie hull | 125 % | 25 % (30 % until gameplay-modes-228) | 125 % + 16 % a wave | 15 % + 2 % a round (+6 % from round 11; a swarm round 10 %) |
| Zombie speed | +40 % | +30 % | +4.5 % a wave (cap +55 %) | unchanged |
| Zombie reload | ×0.7 | ×1.8 reload time (`infectedReloadScale`, gameplay-modes-228 round 2; ×1 on 10-17) | ×1 | ×2.2 reload time (`hostileReloadScale`, gameplay-modes-228 round 2; ×1.8 in round 1) |
| Zombie numbers | 4 to start, 3 s respawn, every dead survivor converts | 5 to start, 5 s respawn on a ring 90–150 m round the survivors (120–200 m until round 2), every dead survivor converts; a five-minute round (seven until round 2) | waves 5 / +1, pool 14 | rounds of round(6 + 3(w − 1) + 0.35(w − 1)²), at most 16 alive, pool 20 (gameplay-modes-228; 10-17: waves 6 / +2, surge every 3rd, capped at the pool) |
| Zombie bots | roam | rush the survivors they spot (the RUSH doctrine, hits angled; gameplay-modes-228) | hunt the nearest human | rush the humans they spot (the RUSH doctrine), one difficulty tier below the battle's (`hostileDifficultyStep`) |
| Allies / rounds | 9 survivors, spec | 9 survivors, unlimited | 2 allies, spec | 4 allies, unlimited |

The infected keep their green energy skin: it is how a player tells a zombie, not why it was strong.

The Horde's field peaked at 25 live vehicles from wave 7 on the 10-17 table (17 before). At that peak the mobile tier
rendered about a quarter fewer frames than at the old peak (54 to 40 fps on the M5 Max, p99 33 to 50 ms), still below the
14 v 14 preset's 28 vehicles. Since gameplay-modes-228 the live cap (`maxAlive`, 16 hostiles, +1 a further human, cap 20)
bounds it at 21 (16 hostiles and five humans) however large a round grows; the arrangement panel's pool and allied bots
shrink it further (`docs/PERFORMANCE.md` "Endless Horde field on the mobile tier").

The rule cards (play menu, arrangement panel, pre-battle chips) show both hulls in the one hull chip, the humans' first
and the zombies' after a slash (`rulesetLines`: Infected "+50 % / -75 % hull", the Horde "+100 % / -85 % hull"), so the
zombie modes add no line of their own. The zombies' bots playing a tier down is wired into both bot builders, the
authority's `initializeBot` (each seat's own difficulty) and the solo `createBattleBot` (the stored setting);
`src/game/zombieBotTier.selftest.mjs` reads the tier each controller was built with (`aiCtl.difficulty`) in both.

Measured headlessly with `tools/mode-balance-probe.mjs` (the shared authority on Verdant, every seat a normal-difficulty
bot, a seeded draw of production ground vehicles; in the Horde the `h1` seat reads as the human while the mode controller
steps). "Before" is the 16aeab482 table run through today's code (`--before`, bit-identical to the investigation's runs
on 16aeab482). "Now" covers 72 Infected seeds (1-64, 101-108) and 32 Horde seeds (1-24, 101-108); the hold-out is every
seed no rule was tuned on (the Infected starter count was chosen on seeds 1-16, the Horde on 1-8). Every row the earlier
rounds recorded (Infected 1-16 and 101-108, Horde 1-8 and 101-108, the before rows) reproduced bit for bit at this tree:

| Mode | Humans win | Round ends (mean) | Human seat survives (mean / median) | Human kills / min | Zombie kills / min | Kill ratio | Waves (mean, best) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Infected before (8 seeds) | 0 / 8 | 136 s | 115 s / 117 s | 0.76 | 4.50 | 0.17 | — |
| Infected now (72 seeds) | 24 / 72 | 377 s | 306 s / 338 s | 6.10 | 1.40 | 4.36 | — |
| Infected now, hold-out (56) | 18 / 56 | 378 s | 298 s / 316 s | 6.19 | 1.38 | 4.49 | — |
| Endless Horde before (8 seeds) | 0 / 8 | 114 s | 114 s / 94 s | 0.36 | 1.09 | 0.33 | 1.1 (2) |
| Endless Horde now (32 seeds) | 0 / 32 (no clock: the numbers overrun every run) | 346 s | 346 s / 346 s | 6.46 | 0.63 | 10.18 | 4.66 (8) |
| Endless Horde now, hold-out (24) | 0 / 24 | 341 s | 341 s / 346 s | 6.45 | 0.62 | 10.33 | 4.63 (7) |
| Infected, gameplay-modes-228 (72 seeds; rush, 25 % hull, the ring) | 2 / 72 | 248 s | 175 s / 173 s | 11.82 | 2.57 | 4.60 | — |
| Infected, gameplay-modes-228, hold-out (64) | 2 / 64 | 247 s | 176 s / 175 s | 11.79 | 2.58 | 4.56 | — |
| Endless Horde, gameplay-modes-228 (32 seeds; the wave law, rush) | 0 / 32 | 348 s | 348 s / 318 s | 10.11 | 0.60 | 16.82 | 4.81 (7) |
| Endless Horde, gameplay-modes-228, hold-out (24) | 0 / 24 | 353 s | 353 s / 323 s | 10.06 | 0.63 | 16.03 | 4.83 (7) |
| Infected, round 2 (48 seeds; the 90-150 m ring, reload ×1.8, a 5:00 round) | 30 / 48 | 278 s | 225 s / 242 s | 12.49 | 1.50 | 8.31 | — |
| Infected, round 2, hold-out (32) | 22 / 32 | 276 s | 224 s / 240 s | 13.14 | 1.54 | 8.52 | — |
| Endless Horde, round 2 (31 seeds; the 320-440 m ring, the trickle) | 0 / 31 | 415 s | 415 s / 427 s | 9.44 | 0.61 | 15.37 | 5.19 (8) |
| Endless Horde, round 2, hold-out (16) | 0 / 16 | 435 s | 435 s / 450 s | 9.65 | 0.58 | 16.71 | 5.5 (7) |
| Endless Horde, round 2 final (32 seeds; the approach out of sight, reload ×2.2) | 0 / 32 | 465 s | 465 s / 483 s | 9.27 | 0.58 | 15.88 | 5.31 (8) |
| Endless Horde, round 2 final, hold-out (16) | 0 / 16 | 496 s | 496 s / 530 s | 9.22 | 0.53 | 17.50 | 5.5 (8) |

The humans now cut through the zombies — four to ten zombies for every human lost — and the numbers still decide:
the outbreak takes two rounds in three (the survivors won 6 of the 16 tuning seeds, 16 of 48 on seeds 17-64 and 2 of 8
on 101-108; with four starting infected they won 12 in 16, with six 1 in 8), and the Horde overruns the human seat in
every run, at 1:11-9:14 and waves 1-8, after the human side's 4-95 kills. The probe's human is a bot; a player who uses
cover lasts longer. `src/sim/zombieBalance.selftest.mjs` pins the rules, their invariants (a survivor outlasts four
infected, a human outlasts eight Horde hostiles through wave 10, no fire-rate buff), the controller's hunt and fodder
revive, and the measured band in `src/sim/zombieBalance.measured.json` (recorded with `--record`; it fails when the
balance rules change until the band is measured again). The band holds on all seeds and on the hold-out alone, with at
least 48 Infected and 24 Horde seeds of which 32 and 16 are hold-out: Infected survivors win 20-70 % at a kill ratio of
3 or more; the Horde's human seat lasts 4:00 and three waves or more at a kill ratio of 5 or more, and is still overrun in
most runs. The first band (35-70 % on 16 seeds) was fitted to the seeds the starter count was chosen on and failed on
seeds 101-108 (2 of 8); the survivors' rate over 72 seeds is a third (33 %, hold-out 32 %), and 20 % sits about 2.4
standard errors under it.

gameplay-modes-228 re-recorded the band (the "now" rows above are the 10-17 record): the rushing infected take nearly
every bot round, so the Infected band asserts that the survivors still win some rounds and never most, that the outbreak
completes in 150-330 s (median) and that the survivors kill three or more infected per loss; the Horde band is unchanged
and holds (348 s, 4.8 rounds, 16.8 zombies a loss). The before rows are the record's own (`--tags=<mode>:keep:…`).

Round 2 (2026-10-19, the critic's E4: that loosened band was the receipt weakened to fit) restores the 20-70 % band: the
infected rise on a closer ring (90-150 m, never inside 80 m), reload ×1.8 and the round is five minutes, so the outbreak
still sweeps a round in about four minutes when it wins (median end 4:15 on the harness, first conversion at 1:11 against
2:43 before) and the survivors hold out 30 of 48 probe rounds (22 of the 32 hold-out seeds 17-48; the rules were chosen
on seeds 1-16 and the harness's 101-116), at 8.3 infected a survivor lost. The Horde row is re-measured on the round-2
wave law and ring (31 seeds: seed 107 hit the probe's 40-minute wall cap under a load of 220 and is re-run; tuned seeds
1-8 and 101-108, hold-out 9-24): 6:55 and 5.2 rounds a run, 15.4 zombies a loss, every run overrun. Seed 1 of the Horde
re-run on the final tree matched the earlier tree's row field for field, so the r5 rows 1-12 stand beside the final
tree's 13-24 and 101-108 (`metrics/round2/zombie-balance`).

The round's final Horde table (an arrival's first 60 m of approach out of sight, the zombies' guns at ×2.2) is measured
again on all 32 seeds through the authority at d35378e038 (the later commits touch only Frontline's table and the solo
controller; `metrics/round2/final/zombie-balance`; six seeds hit the probe's
40-minute wall cap under a load of 250-500 and were re-run with a two-hour cap): 7:45 and 5.3 rounds a run, 15.9
zombies a loss, every run overrun (hold-out 8:16, 5.5 rounds). The Infected record stands on its rules, which did not
move; the controller change since (the no-ram lane after the terrain escape) kept the harness's Infected results seed
for seed (survivors 7 of the critic's 16 both before and after it, the mean round 256 s, the first conversion 114 -> 105 s).

Re-measure (about 1.5-4 minutes of wall time per seed under load; gate on `headroom can-start`):

    node tools/mode-balance-probe.mjs --mode=infected --seeds=1-48 --jobs=6 --out=DIR --tag=infAfter
    node tools/mode-balance-probe.mjs --mode=endless_horde --seeds=1-24,101-108 --jobs=6 --out=DIR --tag=hordeAfter
    node tools/mode-balance-probe.mjs --mode=infected --before --seeds=1-8 --jobs=4 --out=DIR --tag=infBefore
    node tools/mode-balance-probe.mjs --mode=endless_horde --before --seeds=1-8 --jobs=4 --out=DIR --tag=hordeBefore
    node tools/mode-balance-probe.mjs --table DIR infBefore infAfter hordeBefore hordeAfter
    node tools/mode-balance-probe.mjs --record=src/sim/zombieBalance.measured.json --dir=DIR \
      --tags=infected:keep:infAfter:1-16,endless_horde:keep:hordeAfter:1-8+101-108

## Verification

    node src/sim/matchRuleset.selftest.mjs
    node src/sim/matchModes.selftest.mjs
    node src/sim/zombieBalance.selftest.mjs
    node src/game/zombieBotTier.selftest.mjs
    node src/sim/specialModeAmmo.selftest.mjs
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
