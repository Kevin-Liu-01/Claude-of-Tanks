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
