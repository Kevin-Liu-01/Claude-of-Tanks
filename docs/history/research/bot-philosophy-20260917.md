# Bot philosophy (2026-09-17)

Owner: "smarter bots: target hierarchy (mission objectives → closest → weakest), reversing, weak-side awareness,
reactions when hit (cover / hull-down / sidescrape / wiggle), retaliate only if spotted; think through the whole
enemy bot philosophy."

## The philosophy

1. **Soldiers with a mission, not turrets.** The mode decides where the fight is. Every bot already drives on the
   mode's objective (`matchModes.botTarget` → waypoints); now the same objective ranks its *targets*: an enemy
   standing on the sector / zone / flag / ball outranks a closer one in the open.
2. **Closest, then weakest.** Threat distance (the player reads closer, a lane a teammate already covers reads
   farther — the fire-team allocation of r7 survives) is bucketed into 60 m bands. Inside a band the weakest hull
   leads, so a bot finishes what the team started instead of spreading damage.
3. **Information before retaliation.** A shell leaves the gun only at a *spotted* enemy with a clear personal ray.
   A muzzle flash or a hit from a gun the team has not spotted makes the shooter a **suspect**: the hull turns onto
   the shot, breaks the line (cover) or spoils the lead (jink), and hunts with the team's spotting. No blind fire,
   no "hard claim" of an unseen repeat shooter.
4. **A hit is an event to answer.** The struck hull (not its teammates) picks one reaction per five seconds:
   - unseen shooter → **cover** behind a crest on the far side from the shot, else **jink**;
   - seen shooter, penetration on a hull under 42 % (or a 12 % burst) → **back off**: reverse to cover (or 32 m
     straight back) with the bow on the shooter — never show a flank to it;
   - seen shooter more than ~43° off the bow → **angle**: turn the hull onto it ~24° off (sidescrape-style;
     casemates face square);
   - seen frontal shooter while reloading in the open → **jink** (short back-and-forth, bow onto the shot).
5. **Reversing is a first-class move.** Retreats inside gun range go backwards (`reverseFacing`, steering flip
   compensated) so the strongest armour stays on the threat; hull-down crests are the preferred stop.
6. **Weak-side awareness, both ways.** Offensive: the aim-zone probe already chooses the weakest plate and shell
   and two non-penetrations start a flank. Defensive: stationary hulls hold an angle (r7 `angleRad`), flank shots
   re-angle (rule 4), and a hull never turns its side to a known shooter while retreating.

## Where it lives

`src/game/ai.ts` (bot philosophy r1): `targetPriority` (objective → band → health → distance), `onObjective`,
`noteSuspect`, `reactToHit`, `driveReaction` (owns the hull before the mode drive), `findCrestAlong` (crest search
along a bearing), `blindFireActive`/`blindLockActive` → always false; `notifyUnderFire(shooter, info)` with
`{selfHit, damaging, kind}`; `tryAggressor` / `tryLockedPlayer` / the muzzle-intel claims require a spotted
shooter. Deps gained `getObjective()`; `matchModes.botObjective(entity)` supplies the point + reach (zones 30 m,
flag 20 m, ball 15 m, horde contact 25 m). Both sims pass the self-hit flag (`state.ts notifyTeamUnderFire`,
`authoritativeMatch.ts recordShotDamage`), and the authoritative sim now reports bounces to the team as well.
Debug surface: `reaction`, `reactions`, `suspectId`.

Receipts: `src/game/ai.selftest.mjs` [10]–[13]; `src/sim/ai.aim.selftest.mjs` re-pinned from the old hard claim to
the suspect rule.

## Follow-ups

- Mission-aware movement grammar per mode (defenders hold hull-down on the sector rim, attackers approach from the
  cover side) — the drive layer still uses the r7 engage envelope.
- Sidescrape proper (wall-hugging with the hull at 60°+) needs a wall query; the angle reaction is the open-field
  approximation.
- Reaction telemetry in the headless battle probe (`.qa-dev/mode-loop.mjs`) to tune durations against real fights.

## Addenda (2026-10-07, bots lane)

### The last run

A bot never idles for minutes. The empty-rack retirement (round 62: ram when the ram law lets the rammer survive,
otherwise keep 240 m from every enemy) leaves the finish to the team. On Tidegate Polders pacing tail seed 41000 (the
scenery lane's stone-free tree) the last bravo bot, an AFT-10 at 8 % of its hull with its eight HJ-10s spent, retired
248 m from the idle host and faced it, the host in sight and its gun silent, from 330 s to the 900 s cap. This decides
the open 2026-10-03 question of what ends that standoff: with no teammate left that can fire (wrecks and empty racks
do not count) and a passive target (still hull, silent gun), the run the ram law refuses is taken anyway, at full
speed (`lastRunDue` in `src/game/ai.ts`; receipt `src/game/ai.lastRun.selftest.mjs`; docs/BOT-TACTICS.md). An armed
teammate, or a target that moves or fires, keeps the retirement.

### Known gap: rounds into terrain on a clear sight lane (parked)

Measured on 12 base-tree pacing matches (sample 0 of Polders, Verdant, Urban, Steppe, Fjord, Monsoon, Foundry, Titan
Gorge, Airfield, Orchard, Saltwind and Cliffbridge on integ/push3-stage 43e91f222): of 461 bot rounds, 315 (68.3 %)
reached a hull, 79 (17.1 %) landed within 10 m of the target's range, 9 (2.0 %) left no event, and **58 (12.6 %)
struck terrain (44) or a prop (14) more than 10 m short of the target while the bot's sight ray and its gun lane
were both clear**. For **38 of them (8.2 % of all rounds) the straight line from the real muzzle to the lay point
was already blocked when the round left** (10 of the 38 within 40 m of the muzzle, the median block at 98 m). All but
one were barrel rounds. The other was the Polders AFT-10's first HJ-10: it struck a dyke crest 36 m out, past a lane
that cleared the crest by 0.04 m from the gun pivot while the launcher tip sat 0.19 m lower.

Why the gates pass: `src/sim/botGunLane.ts` traces the nominal lane from the barrel muzzle to the visible
**turret top** (0.85 of the target's height), deliberately not to the lay point ("intentional misses retain their
ordinary cost"). The lay point (the probed zone plus the tier's sampled error) can sit lower. The probe's zone
visibility (`probeCandidateVisible`) casts from the gun pivot above the hull centre, not from the muzzle or a launcher
tip. A crest between them that the turret-top lane clears takes the round laid lower. Closing the gap would change
the fire decision in most matches, and with it the pacing set and the moving-battle hit rate (authoritativeBots,
ceiling 0.76), so it is parked for its own lane rather than fixed with the last run.
