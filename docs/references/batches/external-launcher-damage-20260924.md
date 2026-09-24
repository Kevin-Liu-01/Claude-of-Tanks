# Exterior launcher collision and module damage

Owner direction: the TOS-1A Tagil battery and other external missile/rocket
assemblies must receive hits and module damage. This replaces the earlier
practice of treating offensive launchers as cosmetic equipment.

The 25 playable vehicles with external launch tubes register their native
canisters, housings and firing supports during offline anatomy measurement.
Their indexed surfaces remain separate: gaps between pods and open tube
mouths are not filled by a broad convex box. Runtime collision uses a cheap
bound per part before testing its surfaces. No presentation triangles or
materials are added. The same collision data serves every graphics setting.

Launcher stock links to `missileRack`; TOS and Object 695 cradle mechanisms
link to `gun`. Existing TOS shell/cradle armor keeps its authored protection
instead of receiving a second overlapping layer. Smoke dischargers, antennas
and cosmetic TOS lifting eyes remain outside the offensive-weapon registration.
The previous unused Viper pod-box armor is replaced by its actual surfaces.

A projectile rolls each linked weapon module once, even when it crosses
multiple tubes, skins or ready-round volumes. Failed damage rolls are not
retried at every surface.
The projectile retains these rolls across simulation steps, keyed by target
entity so another vehicle of the same model remains independently damageable.
Recycling a shell starts a fresh ledger with its next penetration roll.
Existing repair, damage-state and reload rules
consume those module states; an external kinetic hit does not by itself imply
a hull penetration. Explosive impacts and nearby blast sweeps can also reach
the exposed stock. Armor aiming feedback and Gallery armor/module inspection
use the same surfaces.

Native pose tests exposed stale donor pivots on Warrior MILAN, Terminator 2
and M3A3 Bradley; their combat pivots now match their existing visual stations.
Warrior's presentation-only turret compression is baked into the new measured
stock, rather than discarded or applied twice. The old reload-time threshold
also omitted missile-rack state from BMP-2, Type 89, Warrior MILAN and Marder;
explicit launch tubes now establish that state independently of reload speed.

Regression coverage is in `src/sim/weaponHousing.selftest.mjs` and
`src/vehicles/externalWeapons.selftest.mjs`. It covers independent world-pose
rays, open gaps, damage and failed-roll deduplication, explosive hits, and
native HIGH/LOW stock on all 25 vehicles. LOW allows 20 mm between its coarse
tube chords and the canonical collision surface; HIGH allows 6 mm. The
Gallery suite checks that each external weapon part is inspectable without
duplicating internal module models. Local command evidence and captures are
retained under `.qa-dev/weapons/`.

Validation on 2026-09-24:

- Fleet regression: 6,488 native surface/pose checks, including maximum
  depression/elevation and both battle broadphases; 790 actual damage checks.
  Conventional vehicles retain their prior metadata without empty launcher
  fields or inherited weapon stock.
- Full anatomy and marking receipt checks pass. The module-hit probe now
  recognizes an explicitly linked weapon-housing plate as a valid module
  trace, while still requiring the real resolver to apply damage. All 192
  tanks pass: 1,669 authored modules, 384 track sides, zero trace/resolution
  failures or out-of-envelope modules; 87 existing dimension warnings remain.
- All 576 technical images and their metadata pass the asset checker. The
  Warrior's presentation anchor was remeasured; its full image set and those
  of M3A3 Bradley, Terminator 2 and TOS were regenerated. Exactly the 25
  registered launcher vehicles have changed asset records.
- Native browser selection and raised/yawed Gallery captures for TOS,
  Viper, AFT-10 and Warrior pass with zero browser errors. The final captures
  are in `.qa-dev/weapons/gallery-final/`.
- All 410 pretests pass across the initial 406 successes and four corrected
  targeted reruns. The complete 695-file core and 41-file post suites pass.
  Type checking, the public production build and the focused complexity
  checks pass. The original failed runs remain in the local evidence logs.
- The required 25-vehicle release attempt passes the sealed-surface ledger,
  but comparison scoring cannot complete: eleven registered geometry oracles
  and twenty fidelity references are unavailable/invalid locally. The failed
  attempt is preserved under `.qa-dev/weapons/`; historical ledger records
  remain unchanged. This batch does not claim a passing release gate.

The full pretest run also exposed the previous owner-requested Leopard
Improved hull-width change against its old complete-model snapshot. Its
explicit owner-rebuild fingerprint now accompanies the existing independent
width, turret, suspension and donor-isolation regression; other fleet
fingerprints retain their original values.

Rebased onto `origin/main` at `5a0c2e679`, retaining the intervening map,
bridge, performance and bot-ammunition changes. After integration, missile
roles, rocket batteries, weapon-housing damage, all 541 combat assertions,
authoritative simulation, bridge navigation, bot behavior/aim, type checking
and the public production build pass again. That initial verification was
local and did not indicate a push or deployment.

Publication integration (2026-09-24): the owner explicitly requested that this
batch, the M1A3/Leopard Improved geometry edits, and the legacy camouflage art
pass all land on `origin/main`, including the quoted comparison-reference
limitation. All three patches were rebased unchanged onto `b60223ea9`, retaining
the eight intervening map and terrain commits and their regression registrations.
The combined tree passes eight focused geometry, launcher, camouflage, railway
cutting and arched-bridge checks, the full type-check command, and the public
production build. Evidence is in `.qa-dev/camo/main-integration.log`.
This authorization does not turn unavailable reference comparisons into a
passing qualification or indicate a production deployment.
