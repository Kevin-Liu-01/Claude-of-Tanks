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
