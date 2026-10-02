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

| Mode | Coordination |
| --- | --- |
| Capture the Flag | Runner brings the flag home. Up to two nearest responders recover the home flag. Two escorts cover opposite sides of a carrier. Larger teams retain home defense; extra raiders approach separate lanes. |
| Turbo Ball | One striker retains the role for four seconds unless a teammate becomes substantially closer. It circles behind the ball, aligns centrally and drives through contact toward the opposing goal. Other bots screen separate lanes and cover their own goal. |
| Zone Control / Gravity | Once-per-second team allocation balances distance, existing assignments, ownership and contested zones. Jev can redirect a bounded reinforcement group. |
| Frontline | Attackers and defenders work on the current sector; defenders do not navigate to hidden enemy coordinates. |
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

## Traffic and keeping the battle moving

Both teams give human drivers right-of-way, predict the actual direction of a
moving hull while it brakes, and share deterministic bot-to-bot yielding.
Reverse escapes persist across route updates and check teammates, solid cover,
water and dangerous drops every tick. A parked tank triggers a committed
passing path instead of alternating steering back toward the blocked route.
No-contact bots begin seeking a new approach after 25 seconds, independently
of the opening long-range fire restriction. Combat destinations crossing a
bridge use the same navigation grid and abutments as mission destinations.

The traffic regressions run actual movement for both teams: parked hulls,
oncoming pairs, and a three-bot queue. The pacing target is 4–8 minutes with
no default match under two minutes; prolonged idle deployment is not a tactic.

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

## Verification

- `src/game/ai.targeting.selftest.mjs`: target identity parity and local-fight
  continuity across four team sizes, plus retaliation and survivor cases.
- `tools/bot-targeting.browser.mjs`: live map observation with both teams
  moving and fighting, player gunfire, per-bot targets and screenshot receipts
  in `.qa-dev/bot-targeting/`. Fixed-step time is accelerated; this is behavior
  evidence, not a rendering-performance benchmark.

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
