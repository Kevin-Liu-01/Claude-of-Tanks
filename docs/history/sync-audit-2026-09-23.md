# Sync audit 2026-09-23 — shared main red on `balanceMatchups` since 64303600d (M1A3 mantlet articulation)

**Observed (Claude, 01:50–02:10, pristine checkouts of shared main).** `node src/vehicles/balanceMatchups.selftest.mjs`
passes on cc3c10d30 ("18 deterministic matchup scenarios passed") and fails on 64303600d and 14b634438:
`nextgen-abrams-peer: next-generation US peer ceiling score 0 stays in reviewed band 0.2-0.8` — the M1A3 loses all
twelve seeded range duels to the AbramsX (it won six of twelve before).

**Mechanism (authority range duel, same seed, both revisions).**
- The M1A3's own fire is unchanged: alone against a silent AbramsX it kills it in 86.5 s on both revisions (3,053 dmg);
  every first shell leaves the same muzzle at (0, 2.09, −53.72) and meets the same point on the AbramsX.
- The M1A3's protection halved: a silent M1A3 survives the AbramsX for 49.7 s on cc3c10d30 and 24.9 s on 64303600d.
  The AbramsX's shells strike the same turret-front points (y 1.85–2.10 m, 1.9 m ahead of centre) on both revisions;
  before they met a plate with ~876 mm base KE at 24° (effective 959 mm, five of eleven non-penetrations); after they
  meet a plate with ~448 mm base KE at 36° (effective 554 mm, six of six penetrate). Those two thicknesses are the
  M1A3's `integrated_cheek` (1010 authored → 889 calibrated) and its `gun_cradle` gun-follow plate (520 → 458).
- Cause: `articulate the complete M1A3 mantlet` moved the fixed throat slab into the pitching gun frame
  (`P.addGunExtra(throat)`, plus the rotor `cylX(.39,.73)` on the mount) and recessed the turret centre behind the
  trunnion. The combat-anatomy calibration therefore no longer finds turret stock behind the cheek plates at the
  shield's position, so the trace reaches the 458 mm cradle plate first. The visible shield gained mass; its armour did
  not follow it.

**What restores the band.** The shield's armour must move with the shield: either author the M1A3 mantlet as a gun-follow
plate with the protection the fixed throat carried (the integrated cheeks' 1010/1380 class over the shield's extent), or
keep fixed cheek stock behind the impact zone. Numbers are the Abrams lane's call; the receipt `balanceMatchups`
(`nextgen-abrams-peer`, band 0.2–0.8) is the acceptance test and runs in `npm test` (core group).

**Process.** Three pushes to shared main during one landing (23:47, 00:37, 01:49) each re-pinned shared fleet digest
receipts (`tankFactoryStaging`, `wrecks`, …) — every rebase of a concurrent round conflicts on those files and needs a
third re-pin on the combined tree (`tools/receipt-repin.mjs`). The `balanceMatchups` failure is in the core suite:
please run `npm test` (or at least `node src/vehicles/balanceMatchups.selftest.mjs`) before pushing Abrams geometry that
changes the turret front.
