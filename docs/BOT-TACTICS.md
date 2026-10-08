# Bot tactics and vehicle systems

Classic and Jev share the same driving, aiming, ammunition, support controls and
terrain safety in `src/game/ai.ts`. Jev adds short-lived team orders; it does not
replace the local physics or give bots hidden contacts. Both solo and the
headless authority consume the same control bits.

## Mission jobs

`src/sim/matchModes.ts` assigns live destinations with a mission label. Mission
movement continues through contact; the turret can fight while the hull works
on the objective. Critical non-carriers may briefly fall back. Route cursors
survive repeated unchanged assignments, and single destinations go through the
terrain-aware navigation grid.

The mission never parks a hull that cannot fight. A zone holder (zone control,
frontline) that has not been able to fight its target for four seconds, because
it has no sight of it or no loaded round opens the gate, shifts inside the zone:
to a point on the 0.6 or 0.8 × radius ring in sight of the target and as far
round its side as the zone allows. It holds that point while it can fight from
it. A zone is held from ground a hull can stand on: the centre when the ground
there and over a hull's length round it is as level as a relocation spot
(normal.y 0.90) and dry, else the first such point on the 4-20 m rings (inside
0.7 × radius) from the hull's own side of the zone. Redrock Divide's last
frontline sector has its centre on a 55-63 degree face; holders drove onto it,
pivoted there and slid off (24 seeds: 45 damaging falls and 10100 hp before, 9
and 812 hp after).
The shift's points obey the same rule, reached by a straight leg sampled every
3 m no steeper than a comfortable climb (normal.y 0.86).
A mission bot whose route is used up short of its objective (the planner's
best ends in another connected component, or a search leg took the waypoints)
hands the hull to the classic drivers for 20 seconds before the mission takes
it back. When the grid has no way to the destination at all for the widest hull
(two wrecks plug the approach, the zone's centre stands against a wall), the
destination itself stays the waypoint and the local router approaches it.

A target on another level is a verdict, not a fight to keep. One more than 8 m
above or below whose bearing lies outside the gun's elevation or depression arc
from where the hull stands (a deck over a gorge floor, a cliff top over its
foot) for six seconds makes a free hull change level: the navigation grid plans
a route to the target's own level (the goal cell on that level, the route empty
when it cannot arrive there) and the hull drives it, the gun firing whenever it
bears, until it stands on that level with the target in sight. With no such
route within 900 m, a mission objective holding the hull, or the route spent
(its time, four stuck strikes, its end) short of the level, the target is left
alone for 75 seconds: another spotted enemy takes the slot, or the mission and
the no-contact search take the hull, and the search looks for the other enemies
first.

| Mode | Coordination |
| --- | --- |
| Capture the Flag | Runner brings the flag home. Up to two nearest responders recover the home flag. Two escorts cover opposite sides of a carrier. Larger teams retain home defense; extra raiders approach separate lanes. |
| Turbo Ball | One striker retains the role for four seconds unless a teammate becomes substantially closer. It circles behind the ball, aligns centrally and drives through contact toward the opposing goal. Other bots screen separate lanes and cover their own goal. |
| Zone Control / Gravity | Once-per-second team allocation balances distance, existing assignments, ownership and contested zones. Jev can redirect a bounded reinforcement group. |
| Frontline | Attackers and defenders work on the current sector; defenders do not navigate to hidden enemy coordinates. When the attack takes the second-to-last sector, its bots hold that sector until every living bot has come up (at most 60 s, or until a human of the side stands within 250 m of the last sector), then attack the last one together: the bots revived at the spawn no longer arrive 40-80 s behind the attack and die alone (24 seeds each: Redrock Divide 9 to 12 and Desert 4 to 8 alpha wins). |
| Regular / combat | A mobile teammate is elected to flank a shared visible contact while an anchor keeps it engaged. Election uses mobility, health and stable IDs; existing flanks prevent duplicate commitments. |
| Horde | Existing wave pursuit, repair, reload and survival rules continue, with the new shared abilities and terrain safety. |

## Target selection and return fire

Human and bot opponents have the same target priority. Bots rank spotted,
locally visible contacts by mission relevance, distance bands, health and
teammates already covering that opponent. They keep a viable current fight
instead of abandoning it because a distant human fired. Gunshots from either
team provide idle bots with contact hints; they do not create forced locks,
extra player distance bonuses or an engagement deadline aimed at the human.

A direct hit can provoke retaliation against a nearby visible attacker. A
teammate's damage report does not overwrite that direct attacker or steal an
existing local engagement. Bots reconsider a substantially closer visible
threat within 120 m instead of tunneling indefinitely; a contested objective
retains priority except for immediate close defense. Reports reach nearby allies within 200 m; audible
main-gun shots reach opposing bots within 500 m in both solo and multiplayer.
Hidden shooters provide last-shot position hints, never permission to fire at
unspotted live coordinates. If only one opponent remains, multiple bots can
still attack it. This is target selection, not an artificial immunity cap.

Movement under fire wins over a stop in the open. The settled-shot halt (a
starved trigger with a clear ray halts the hull for a clean shot) waits for 8 s
of contact with the target without a shot: the silence no longer runs from the
bot's last shot, so a fresh contact is no starved trigger. The stalemate press
halts only once the gun may fire on the contact. Neither halt holds a hull hit
inside the under-fire window by a gun that still sees its body: it keeps the
movement its state chose (the scout's kite, the fallback, the flank, cover).
Behind a crest the gun sees only its turret over, it still halts to shoot. A
scout struck from the side keeps moving instead of turning armour it does not
have onto the shot; the other roles still angle. Tidegate Polders pacing seed
41002: a BMP-3 braked to a stop 100 m from a Bradley on contact, sat facing it
under fire through its own fallback and flank, and died 5 s later.

Jev's target instructions explicitly give human and bot opponents equal
priority, preserve useful local fights and distribute uncovered threats. Its
explicit tactical orders still precede ordinary local ranking. The proxy tests
verify those instructions; they do not certify live model decision quality.

The deterministic targeting regression covers 3v3, 7v7, 15v15 and 21v21 on Normal
and Hard. In its local-fight fixture, two distant player shots previously
redirected every enemy at every size; they now redirect none. Re-labeling the
same opponent as a bot produces the same choices. Separate checks retain direct
retaliation, hidden-contact safety and engagement of a sole survivor.

## Shared controls

- Smoke is defensive: recent incoming fire plus low hull or a reloading retreat,
  with an authored launcher facing the threat. Charges and cooldown are real;
  ballistic canisters and their spotting obstruction are the player system.
- A roof gun toggles on for a clear spotted nearby contact, holds through a brief
  contact loss, then switches off. Its fire still obeys range, aim and obstruction
  checks. Roof-gun bounces do not contaminate cannon penetration feedback.
- Jump-capable modes permit a defensive jump while moving and reloading under
  fire, only with a clear, affordable landing corridor. No repeated airborne
  boosting; the local planner enforces ten seconds between requests.
- Lights switch off. Existing consumable, self-right, magazine and suspension
  decisions continue. Independent missile channels can be selected while the
  cannon reloads, including authored ammunition slots beyond the first three.
- A casemate (any turretless hull or authored gun arc of 30 degrees or less: the
  Strv 103 family, UDES 03, Jagdpanzer E100) lays its gun with the hull, so an
  engaged one keeps the bow on its target. It scoots along the line of fire,
  25 m back off its spot and then up to it again, backs into cover crests, jinks
  with the bow on its target, falls back in reverse and stops at a blocked
  corridor instead of turning away. Aegis Crossing pacing seed 53002: the Strv
  103 used to scoot to a spot 94-152 degrees off the bearing and jink toward a
  flanker, standing 19-24 degrees off its target for seconds at a time.

## Traffic and keeping the battle moving

Both teams give human drivers right-of-way, predict the actual direction of a
moving hull while it brakes, and share deterministic bot-to-bot yielding.
Reverse escapes persist across route updates and check teammates, solid cover,
water and dangerous drops every tick. A parked tank triggers a committed
passing path instead of alternating steering back toward the blocked route.
No-contact bots begin seeking a new approach after 25 seconds, independently
of the opening long-range fire restriction. Combat destinations crossing a
bridge use the same navigation grid and abutments as mission destinations.
When nothing plans from where the hull stands (a pocket the grid cannot leave),
the local router drives on toward the destination and the wedge watchdogs judge
it. A hold there carries no drive intent, so nothing ever re-planned it: on the
physics lane's plane attitude, a Type 96 that slid into a gorge pocket on Aegis
Crossing (pacing seed 53001) sat at rest for 798 s.

Right-of-way waits for traffic, not for a hull that never moves:

- The passing path round a stopped ally starts after 1.25 s of yielding, or
  after half a second stopped in the gap behind it when there is room to turn.
  Its legs lie on the line from the bot to the ally. While it runs, it owns the
  steering (no evasive nudge) and no reverse escape interrupts it, but the speed
  cap and the emergency stop still apply. Its pivot is not drive intent, so the
  low-speed watchdog does not read it as a wedge.
- The yield is bounded. Eight seconds held behind a parked ally give way: first
  a passing path on a wider lane, then the shared stuck escalation (a reverse
  burst, a detour side flip, a waypoint skip and, on repeats, the pocket
  escape). A moving lead is traffic and never triggers it.
- The nose-to-nose gap stop applies to a hull in this bot's lane. A hull that
  will pass beside it keeps the radial guard and the speed cap, so two oncoming
  bots pass side by side instead of stopping on every predicted crossing.

A hull that has reached its destination holds it. The arrival is not drive
intent, so the low-speed watchdog does not read the hold as a wedge and reverse
the hull off its hold point; a hull pressing into a wall short of it still backs
off.

A collider stop backs the hull off at once, whatever its mode. A contact with a
solid primitive that takes 2 m/s and three quarters of the hull's speed within
0.3 s, against a world obstacle rather than another hull, reverses the hull for
1.4 s with its bow swinging along the face toward its goal's side. It counts as
a stuck strike, and as with the low-speed watchdog's only a repeat before the
hull drives free escalates (the detour, the waypoint skip, the pocket escape):
the pacing battles stop most bots once or twice, which is not yet a pocket. A
scrape that keeps its speed is no stop, and a crawl into a face stays the
low-speed watchdog's. Polders 41002: an
M1A1 turning a route corner ran into a farm building's wall at 6 m/s and fought
from the wall for 7.6 s, from the enemy it saw half a second after the stop
until it was hit.

A route corner round cover is not taken back at the next recheck. A recheck
that would return to the corner the hull gave up less than 2 s ago keeps the
current corner instead, while its lane stays clear and the destination stays
put, for 6 s; a reached corner, a stuck strike or a new destination still
chooses afresh. A T-90M pressed against a Coastal boulder chose between the
boulder's two corners at every 0.6 s recheck: its pivot swung it 0.36 m off the
rock, which reopened the lane the other corner needed, and it jinked in place.

A rack that cannot hurt its target stops pressing it. After 60 seconds in sight
of the target from inside 90 m, with zones visible but no loaded round opening
the gate and no burst worth a round, the rack counts as spent against that
target for 90 seconds. The bot rams when the ram law allows it and otherwise
retires past 240 m, and any other spotted enemy outranks the target.

A passive target is finished, not plinked. When a target has held its hull
still and its gun silent for 15 seconds and this bot's rounds have not
penetrated it for 15 seconds, the bot presses to a side aspect from which its
gun reaches the hull, not only the turret top. Standing on the target's flank at
point-blank range spares the press only when the gun reaches the hull from
there as well (a crest can mask it while the eye still sees the turret). Three
main-gun rounds in a row from one spot (within 10 m) that do not reach the
target, judged 1.5 seconds after the last one, give that spot up: the press
starts from it, or the press point is given up for another, as a masked probe
gives one up. A press point the hull has not reached within its distance at
4 m/s plus 20 seconds (kept across the restarts a flickering sight line makes)
is given up the same way. A rack that is empty finishes a passive hull by ramming when the
ram law says the rammer survives. The run that finishes it is judged and driven
no faster than the slowest closing speed whose share deals 1.8 times the
target's remaining health (6 m/s at least). Inside 60 m a clear line drives
straight at the hull. Its own contact does not count as the target moving, and
the empty rack's probe does not scoot the run away. Runs that cannot finish the
target alone keep the full-speed judgement.

The retirement leaves the finish to the team, so it holds only while a teammate
with rounds aboard lives. With no teammate left that can fire (wrecks and empty
racks do not count), an empty or spent rack whose ram the law refuses takes the
last run at a passive target anyway, at full speed: the target will never come
to it, and the run ends the match one way or the other. On the scenery lane's
stone-free Polders, pacing tail seed 41000, the last bravo bot (an AFT-10 at 8 %
of its hull, its eight HJ-10s spent) retired 248 m from the idle host and faced
it from 330 s to the 900 s cap; it now runs at the host after its last missile
and the match ends at 231 s. A target that moves or fires keeps the retirement.

A press point given up (masked, missed out, pinned or unreached) stays out of
the picks for 120 seconds, with three more held beside it. One veto slot let two
unreachable points take turns: on the track-contact parity tree, Reservoir
pacing seed 50001 alternated between two of them every 30 seconds for 580
seconds.

A gun pinned at its elevation or depression stop for three seconds with a round
ready is a reposition the hull drives. A hull on a planar face meets its target
at the same elevation off the face whatever its heading, because its up is the
face's normal, so a turn on the spot cannot bring the target into the arc. The
bot leaves the face for a cell where the gun lays: a cell that gives both a
sight line and the gun's arc ranks first. That leg owns the hull ahead of the
press and the press's back-up for the gun.

A back-up or a relocation leg that goes nowhere counts. A back-up is judged at
its end and a relocation leg 4 seconds in; one that moved less than 0.3 m and
turned less than 0.35 rad is a stuck strike. For 20 seconds after it, no
back-up and no relocation cell lies within 60 degrees of the travel it tried,
and a dead relocation leg ends so the next pick goes another way. In Reservoir
seed 50001 the last bravo T-64BV stood rolled 17.5 degrees on a bank's flank,
its stern against a building and its gun on the depression stop, 54 m from the
idle host, for the last 610 s of the 900 s cap. Its back-up drove into the
building every 1.5 s and the press owned the hull, so the arc limit's leg never
ran.

The traffic regressions run actual movement for both teams: parked hulls,
oncoming pairs, and a three-bot queue. Prolonged idle deployment is not a
tactic. The owner accepted the faster battles this produces (2026-10-03): the
default bot match median sits in a 3–8 minute band (209 s measured), and the
fast tail is held as a share. At most 5 % of matches end inside two minutes
and none inside 90 s (5 of 132 run 98–119 s). The original target was 4–8
minutes with none under two; searching only after the old 120–165 s
deployment windows gave a 5.7-minute median.

## Terrain and bridges

`src/sim/botTerrainSafety.ts` samples the stopping corridor across the hull and
uses the real mode fall-damage law, gravity, mass and remaining health. Continuous
gentle slopes remain drivable. Dangerous descents brake on the ground, choose a
safe escape bearing, then move clear. The guard does not engage the handbrake in
the air. Jumps also check liquid, obstacles and landing heights.

Bridge decks are drivable surfaces, not river beds or broad-phase walls. The
global grid rejects edges through a bridge's side; ingress goes through the
abutments. Two-way slope checks prevent one-way downhill shortcuts. Physical
collision remains authoritative, including parapets and piers.

On maps that avoid liquid (`src/sim/navigationLiquidSafety.ts`), the liquid
guard refuses a stopping corridor that would take a dry hull into the water. A
hull that already touches liquid may still move, as long as it takes on no
more: the summed mask under its footprint, sampled every 2 m along the move,
never grows. It can always drive out, never deeper in. A dry route starts from
the hull's own cell unless the grid refuses that cell (its sample is liquid) or
the leg to its centre is not drivable; then it starts from the nearest open
cell within two rings whose leg is drivable. A hull pushed into the lake always
has a route out. The pocket escape only takes lanes the liquid guard allows.

The grid's edges are cleared for the widest hull in the fleet (the Jagdpanzer
E100 X, 2.24 m half-width; `NAV_HULL_HALF_WIDTH_M` is 2.25 and the receipt
measures the fleet against it). An edge is open when its straight line keeps
2.75 m from every solid footprint; otherwise it may bend once round the cover
or shift its whole lane up to 4.5 m sideways, inside the two cells' squares, and
the route carries that way's points; otherwise it is closed. A part high over
the route (a deck above the gorge) is no wall, and on and beside a deck the
parts a hull rides onto or over (the slab, the piers under it) follow the same
rule as the hull's collision. Each edge's steepest stretch (three terrain
samples between the cells) is held to the same two-way slope rule as the
cell-to-cell grade, so a cliff between two cell centres is no climb. Each of
those samples also reads the side slope across the edge, 2 m either side of
its line, and the edge holds it to the same rule: an edge that climbs a face
at a slant, gentle along its own line, while the ground falls away beside the
hull at 60 degrees, is no lane (Redrock Divide's plateau face routed frontline
defenders across it; with the rule its falls near the last sector went from 18
to 1 in 24 seeds). The terrain is read, not a deck: the deck's sides keep their
own rules, and under a deck the gorge floor's own slope counts. Legs off
the grid are cleared too: a route starts at the nearest cell on the hull's own
level that it reaches straight (or round a detour point), on the goal's side of
the closed edges first, and it reaches the exact goal only by a clear leg, a
detour point round the goal, or not at all. A goal beyond the reachable cells
ends the route at the cell nearest it. Wrecks narrow streets after the grid is
built: a few times a second both authorities re-test the edges round the
battle's wrecks, closing the ones they plug and laning the ones they narrow.
Objective placement floods the same edges (`src/sim/matchPlacementAccess.ts`):
an edge closed for the hull or over a cliff between two cell centres closes the
objective flood too, so no flag, zone, goal or pickup is placed where the route
search cannot drive a hull.

## Verification

- `src/game/ai.targeting.selftest.mjs`: target identity parity and local-fight
  continuity across four team sizes, plus retaliation and survivor cases.
- `tools/bot-targeting.browser.mjs`: live map observation with both teams
  moving and fighting, player gunfire, per-bot targets and screenshot receipts
  in `.qa-dev/bot-targeting/`. Fixed-step time is accelerated; this is behavior
  evidence, not a rendering-performance benchmark.

- `src/game/ai.stalls.selftest.mjs`: the stalls the 2026-10-02 pilot-map battles
  found, each in a deterministic fixture that fails without its fix: a parked
  human across the route, the bounded yield in a walled lane (with a moving-lead
  control), oncoming pairs, a smoke-only rack against an idle M1A2 (ram, retire,
  and an APFSDS control), a zone holder that cannot fight from the zone's centre
  (shut gate, no sight line), a mission route that ends short of its
  objective, and a holder that has arrived (with a wedged-hull control).
- `src/game/ai.passiveTarget.selftest.mjs`: an idle M1A2 behind a crest that
  masks its hull from a flank spot (the press goes round to a point the gun
  reaches the hull from, with an open-flank control), three rounds in a row
  that miss from the flank spot (the spot is given up, with a control whose
  rounds land), an empty rack against a 320 hp idle host (a capped finishing
  ram, with full-health and moving-host controls), and a press point inside a
  closed pen, given up unreached. It also covers the Reservoir seed 50001 stall:
  a T-64BV on a 12-degree bank with its gun on the stop and a building 0.12 m
  behind its stern. Its back-up counts as a strike and is not repeated (7.1 s
  of reverse into the building before). Press points in pens round both side
  aspects do not take turns (they alternated before). The arc limit's leg
  starts with the press running and leaves the bank in under 2 s with no
  back-up.
- `src/game/ai.lastRun.selftest.mjs`: the Polders seed 41000 standoff, an
  empty AFT-10 at 163 hp 248 m from the idle M1A2 with a wrecked teammate,
  runs at the host (it held its distance for the whole run before). A teammate
  with an empty rack is no one to leave the finish to; an armed teammate, a
  moving host and a firing host keep the retirement.
- `src/game/ai.underFire.selftest.mjs`: a BMP-3 that has never fired keeps
  moving when it sights an enemy (no settled-shot halt); a settle holds no scout
  hit in the open but still halts one behind a berm (with an unhit control); a
  scout struck from the side keeps moving while a T-90M angles.
- `src/game/ai.colliderStop.selftest.mjs`: an M1A1 that runs into a wall at
  6 m/s reverses within a second of the stop with its bow toward its goal's
  side, still does when it sights an enemy just after the stop, keeps its
  patrol's waypoint after a lone stop, and a scrape or a stop with no world
  obstacle on that side is no stop.
- `src/game/ai.levels.selftest.mjs`: a synthetic deck over a floor, with and
  without a ramp: the deck bot leaves the floor target for one on its own level,
  the floor bot drives the ramp to the deck, gives the deck target up when no
  route reaches it, and keeps a target in its arc (control).
- `src/sim/navigationLiquidStart.selftest.mjs`: a synthetic shore with one way
  out: the guard drives a wet hull out and refuses it deeper in, the dry grid
  plans from a start cell it refuses, and a bot starting there, facing the lake,
  reaches dry ground and searches on.
- `src/sim/botRouteClearance.selftest.mjs`: the grid's hull bound against the
  fleet, a diagonal through a 0.6 m gap, a boulder bent round, a channel left by
  its open end, Steinburg's two pockets and a sweep of the town with no leg
  through cover, and a deck crossing that stays on the deck.
- `src/game/ai.selftest.mjs`: ability requests, fourth-slot independent launcher,
  ground/air edge behavior, continuing missions under contact, route reuse and
  a mobile flanker with an anchor, alongside existing aiming/survival tests.
- `src/game/botAbilities.selftest.mjs`: both teams, real inventory/cooldowns,
  canister launch, clear/hidden/blocked roof-gun contacts and grounded jump rules.
- `src/sim/botTerrainSafety.selftest.mjs` and `botRoutePlanner.selftest.mjs`:
  cliffs, downhill roads, reverse driving, deck support, parapet ingress and
  different mode landing costs.
- `server/botModes.selftest.mjs`: 24 combinations of Verdant Fields, Aegis
  Crossing, Earthrise Basin and Glacier Pass with all six non-regular modes, each
  simulated for 90 seconds. Checks movement, finite poses, assignments and
  catastrophic falls; records actual jump requests before they are consumed.
- `server/botObjectives.selftest.mjs`: real flag captures and physical ball goals
  on Verdant Fields and Aegis Crossing. Cannon ammunition is removed to isolate
  mission execution; the ball scenarios start on the final approach to goal.
- `server/authoritativeBots.selftest.mjs`: every map, teammate-ram avoidance,
  movement/stall checks and moving-battle cannon accuracy. Roof-gun rounds are
  excluded from the cannon accuracy denominator and numerator.
- `server/match/tickCost.selftest.mjs`: 28-bot timing with and without viewers.
- Jev controller/proxy tests cover fair 41-bot batches, legacy wire compatibility,
  bounded requests, current equipment/mode context, stale orders, hung transports
  and late replies. These tests use a deterministic transport, not a model-quality
  benchmark; actual network latency and tactical quality can vary.

These are regression scenarios, not a guarantee that every map, roster and
combat state has an optimal route or that a team always wins its objective.


## Targeting observation — 2026-10-01

Two browser observation passes each ran five ordinary solo map battles for
90 accelerated simulation seconds, with a short player advance followed by
repeated real gunfire. They retained target timelines, opposing visible-contact
distances, hit/shot events and three overhead screenshots per battle. Rosters
were the game's random selections, so these are observations, not matched-seed
before/after performance measurements. The deterministic regression above
isolates the old forced-lock defect.

Final-pass receipts: `.qa-dev/bot-targeting-r2/report.json`.

| Battle | Player shots | Enemy / allied-bot shots | Peak simultaneous attackers targeting player |
| --- | ---: | ---: | ---: |
| 3v3 Verdant | 12 | 27 / 22 | 1 |
| 7v7 Tarkhan Steppe | 12 | 20 / 26 | 0 |
| 15v15 Verdant | 2 | 111 / 113 | 7 |
| 15v15 Frosthollow | 12 | 65 / 89 | 1 |
| 21v21 Aegis Crossing | 13 | 51 / 15 | 0 |

The seven-attacker Verdant moment followed the player's advance into the enemy
line: all seven had the player closer than their next visible alternative
(42–93 m to the player). This remains valid exposure, not a capped attacker count.
The first Frosthollow pass exposed target stickiness after a much nearer hull
appeared; the local-threat reconsideration rule and regression address that.
The final pass records no player-target samples with another visible opponent
less than half as far away. There were no browser errors. This does not promise
optimal choices in every battle, and it does not evaluate the live Jev model.

Type checking, the public build, shared AI/aim/spotting guards, authoritative
match integration, all-map bot movement/aim tests, and Jev controller/proxy
regressions pass. Source complexity comparison finds no newly violating
functions; pre-existing violations remain. These changes are local.
