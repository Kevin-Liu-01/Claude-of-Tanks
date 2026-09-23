# Missile roles and definitive Ariete upgrade — 2026-09-21

Implementation and qualification: complete. Publication target: `origin/main`.

Owner target: retain TOS-1A continuous-fire identity, distinguish the Chinese
ZTZ-100 Prototype and Object 695 missile mechanics, add a modern American
missile tank capable of a missile every second, enlarge both definitive
Arietes another 10%, promote C1 to Tier X, and give C2 a larger/longer main gun,
smaller decorative K2-style roof weapon and extra upper-glacis/turret ERA. Work is linear,
without delegated agents. Earlier prototype Arietes and production ZTZ-100
remain distinct and retain their existing designs.

| Vehicle | Authored firing behavior | Tradeoff |
| --- | --- | --- |
| ZTZ-100 Prototype | Two guided missiles, 0.35 s apart, then 12 s rack cycle | Heavy paired strike; 500 damage each and limited inventory |
| Object 695 | Four guided missiles, 0.65 s apart, then 14 s rack cycle | Mobile ripple attack; 320 damage each, independent 30 mm backup |
| Griffin Viper | Guided missile every 1 s, 64 total, 16 alternating physical cells | Sustained pressure, 140 damage each, exposed launcher and IFV hull |
| TOS-1A Tagil | Existing 24 rockets at 0.25 s, then 48 s reload | Unchanged unguided blast battery |

Times are stock undamaged values; equipment and damaged feed systems apply
normal shared modifiers. Holding fire issues individual shots at those times;
releasing fire stops immediately. No queued shots continue without input.
Changing missile type starts a full rack cycle and preserves salvo progress;
firing the independent cannon cannot reset the rack. Ammunition remains finite.
Griffin Viper is explicitly a first-party game concept based on the existing
modern Griffin chassis, not a claim about a fielded American vehicle.

C1/C2 uniform scale changes from 1.12 to 1.232 of the original authored frame.
The retained C1 bore remains 120 mm. C2 adds a further 22% main-barrel length
and 18% external diameter; the physical bore remains 120 mm. C2 retains its APFSDS, HEAT and HE main-cannon rounds. Its roof weapon reuses
the K2 Black Panther X two-tone fitting at 70% installed size. Per the final
owner correction, this is decorative only: no ammunition channel, playable
muzzle or independent firing/aiming behavior. Twenty finite removable reactive cassettes provide
15% KE reduction / 320 mm CE reduction as explicit game tuning.

Qualification requires actual fixed-step authority and solo firing, ammo and
switching negatives, matching native/network missile muzzle positions, exact donor
hull/gear preservation, physical open launch tubes, C2 optic/support/bore and
legal pitch clearance, ERA appearance/combat binding, complete generated
anatomy and diagrams, native HIGH/LOW review, typecheck, full release and build.
No earlier receipt certifies the changed geometry. Source comparison for the
new Griffin and upgraded C2 is NOT APPLICABLE (owner-authored concepts).
C1 retains the complete supplied source at its owner-prescribed uniform scale.

## Qualification findings

The paired/ripple/continuous clocks match at 60 Hz in both real solo and
authoritative combat; the Viper fired 18 consecutive missiles 60 ticks apart.
Each missile consumes finite ammunition; warhead/cannon switches cannot reset
a salvo. C2 roof fitting is deliberately non-firing, with all main-gun ammunition retained.
The C2's enlarged main tube uses a measured yaw-dependent depression limit
to clear its added ERA and front shoulders across 820 checked poses.

An inherited reversed contour made Ariete road-wheel dishes face inward.
Reversing its closed lathe contour preserves every wheel coordinate and axle
while correcting outward winding. With the original sealed gate unchanged,
C1/C2 open-pixel totals improve to 14/30 from 263/177 before this repair,
with zero open views. No hole allowance was raised. The 20 C2 reactive
cassettes each have an explicit physical surface and removable visual stock.

All non-target icon images and manifest rows are retained from main. Source
models remain ignored local comparison inputs and do not enter the shipped
runtime. The American concept and Griffin 50 mm share their revised hull and running
gear exactly, covered by HIGH/LOW preservation tests. The final owner
correction lengthens both hulls 10% and reduces both turrets 10%; wheel
radii and weapon calibers remain unchanged. See the
[proportion correction](griffin-proportions-20260921.md).

The final roof correction retains the K2 Black Panther X fitting's exact receiver,
barrel, cradle and ammunition housing, uniformly scaled to 70%. It is entirely
decorative. The completed C2 remains below the unchanged 100,000-triangle
limit with all interior fills present: 99,302 HIGH / 73,118 LOW, 45/43 draws.
Its internal wheel drums use fewer radial segments; visible wheel faces,
tires, axle positions and loaded-track geometry retain their authored stock.
The LOW bore fixture now recognizes the same decorative muzzle-shading group
after batching, preserving the original authored-stock selection and all
real obstruction negatives. Both quality levels pass all 820 clearance poses.

## Final verification

- All six target vehicles pass the standard release gate: strict loaded-track
  clearance, continuity and documented equipment configuration. C1 source
  comparison is 97.1/92 and Griffin 50 mm is 95.0/92. The four owner-authored
  concepts pass their native physical checks without a fabricated source score.
- The sealed ledger holds without changing any allowance. Griffin 50 mm and
  Viper have zero open views; C1/C2 have zero open views at 14/30 raw pixels.
  Object 695 retains its existing ledger allowance.
- Procedural source fidelity passes at 97.7 for C1 and 97.0 for Griffin 50 mm.
- Targeted centering, module surfaces/hits, assets, duplicate-track checks,
  muzzle bores and barrel circularity pass. All 202 anatomy and marking records
  and 606 technical diagrams pass the complete anatomy check.
- Type checking and both public/private production builds pass. The public
  strip audit contains 202 playable registrations and zero GLB-sourced models.
- The pretest lifecycle passes all 402 entries. Core completes all 680 entries;
  its sole stale catalog assertion passes a focused rerun through the same test
  runner after explicitly accounting for Viper's one new paint. Both historical
  catalog hashes remain unchanged. The earlier Griffin shadow fixture likewise
  passes after its fixed caliper transform, including the complete pretest rerun.
- Final 42-entry posttest lifecycle: PASS, including the real browser rendering
  checks. All 1,124 pre/core/post entries are verified across the completed run
  and focused correction reruns, with no remaining failures.

The full release command's physical, source, asset and build stages completed;
its test stage was resumed after the two fixture corrections above. No runtime
or geometry changes followed those successful physical stages. Regression
verification uses the repository's existing byte-identical-input pass cache;
these counts are suite entries, not a claim that every cached entry spawned a
new process on the final retry. Native HIGH/LOW views were inspected directly.
No independent-review score or multiplayer win-rate claim is made.
