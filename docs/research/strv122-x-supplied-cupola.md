# Supplied Strv122 X: non-weapon cupola closure

This is a bounded supplied-file geometry correction, not a historical Strv122
equipment certification or an exact-appearance claim. The complete original
oracle remains unchanged; its fused material owners are not split into invented
component masks. No source vertex/index buffers or connectivity ship.

## Evidence and scope

The identical-camera source/native roof review reopened the earlier
`supplied-antenna-seats` checkpoint. At world X0.86/Z0 the source round head
reaches Y2.768437, while the pre-correction native roof reached only Y2.462939:
an actual 305.5mm omission. The adjacent receiver, broad non-weapon cupola band,
partly open inner hatch and separate small front sight were also missing or
represented by the wrong generic rim.

The immutable pre-edit snapshot is
`.qa-dev/reports/strv-cupola-before-GuXMa5/`, captured
2026-09-07T01:33:51.679Z. It retains the exact Equipment, RoofWeapon, Turret,
Hull and Gear source files and high/low actual mesh fingerprints.

Only the non-weapon `cupola(P,.673,-.421,.378)` call was replaced, by the new
first-party `strv122XSuppliedCupola.ts`. The existing weapon, antenna feet,
main armor, hull, running gear and all other equipment emissions were preserved.

## Independent source scalars

| Witness | Complete-source result |
| --- | --- |
| Round cap, X0.861/Y2.74, front/back | Z0.096954 / −0.103525 |
| Round cap, Y2.74/Z0, left/right | X0.761456 / 0.961647 |
| Neck front at Y2.69 / 2.65 / 2.60 | Z0.084354 / 0.036311 / 0.015578 |
| Rear neck crown at X0.86/Z−0.12 | Y2.673577 |
| Separate ear fronts at Y2.64, X0.75 / 1.00 | Z0.036940 / 0.038138 |
| Broad band at X0.30/Z−0.40, top/underside | Y2.588851 / 2.557984 |
| Broad band at X1.04/Z−0.45, top/underside | Y2.581445 / 2.559580 |
| Band aft crown at X0.65/Z−0.78 | Y2.595195 |
| Inner forward break floor, X0.673/Z−0.20 | Y2.492639; air above it |
| Small front sight, X−0.80/Z0.30 | Y2.602762 |
| Small sight central face, X−0.80/−0.75 at Y2.55 | Z0.339802 / 0.339337 |
| Small sight beveled jamb, X−0.70/Y2.55 | Z0.346184 |

Y2.50/2.52/2.54 source sections locate nine distinct radial band feet, rather
than a regular eight-post guess. Representative Y2.52 supports include the
right side X1.013592..1.091328/Z−0.406357..−0.377298; aft right
X0.755935..0.785836/Z−0.809763..−0.736987; and left side
X0.218375..0.294935/Z−0.381931..−0.349145. Their intervening air is preserved.
Section component bounds only guide original closed radial bars; no source
section contour is copied. Source-like elliptic annuli, turned sections,
folded jambs and separate ears replace the absent masses.

The softly fused source roots require bounded concealed seating on the retained
planar runtime roof: the narrow receiver feet extend approximately11mm inward,
and the cupola floor/foot roots overlap the existing armor. This is explicit
inferred internal construction, not a raised new pedestal or changed roof.

## Verification and preservation

`strv122XSuppliedCupola.selftest.mjs` passes on the actual high and low builders.
It checks complete-source held-out surfaces, cap/neck axes, nine support feet,
true under-band air, the inner forward break, ear-side air, and the small sight's
approach recess and positive jamb. Actual helper vertices must occur in the
factory's merged meshes, and positive closed-stock witnesses connect the roof,
base, feet, band, hatch, head, receiver and sight.

The exact immutable non-target mesh digests retain 37 high/36 low outputs,
including all wheel/axle/track buffers and matrices, main armor and weapon.
Two explicit concurrent root-owned exceptions are the inferred
`gearSuspensionLinks` and `gearSuspensionJointBosses` correction; these are not
silently rebaselined. New paint meshes are allowed only when actual
`userData.vehicleMarking === true`; their separate physical-seat test owns them.
Within the changed detail/glass buckets, all173 non-target equipment emissions
remain byte-identical to the pre-edit module with only its old non-weapon
cupola call removed: SHA256
`b35c236b13219fb34ff487a63f7731b0f4ac28349b3084d739c3dfe24cd8c785`.

Existing supplied-equipment and whole supplied-ID high/low tests also pass.
Full typecheck passes; the two affected runtime files have37 functions,
zero complexity violations, zero `any` and zero `unknown`.

Frozen helper SHA256:
`4906fffe9ac88dae939d79aa93c29ff1f4a19014dc9db1d7d36331924be01e5c`.
Frozen Equipment SHA256:
`804e56a074d16abc7773bd7c90605b15af681c9e792a50de9cc5695fa729f7db`.
Unchanged canonical oracle SHA256:
`d1ac97d98dd477d52850aaed8ae98184f9a3fd9b7ef20c5aadcf6c34d8e6d582`.

## Bounded visual result and remaining limitations

The four fresh local captures are
`.qa-dev/reports/strv-cupola-final-{source,native}-{roof,cupola}.png`, captured
2026-09-07T02:03:16.526Z–02:03:18.155Z. Each pair uses identical absolute camera,
target and1400×1000 viewport; the roof pair reuses the earlier review camera.
The restored head, receiver, broad band and small sight now read as distinct
supported forms, with the source's important intervening gaps retained. Root's
independent review accepts this bounded omission closure.

The roof is still **not visually exact**. In particular the opposite weapon
cupola retains a thin round pipe where the source has a broad flattened band,
and its receiver remains visibly simplified: these are medium-form limitations,
not merely omitted microfasteners. The new assembly also simplifies the source's
soft irregular folds, small latches and edge rounds. No additional runtime
changes are part of this frozen checkpoint.

Fresh full proof finished successfully at2026-09-07T02:05:32.569Z in the unique
`.qa-dev/reports/strv-supplied-cupola-proof-PDZq7Q/` checkpoint. The complete
fidelity row is dated02:05:21.641Z: raw composite97.19449129124958,
minimum valid whole view95.96447231684961, tracks97.58136426135725. Every
available scored view passes92; fused hull/turret/gun splits remain unavailable.
Geometry raw minimum is95.96447231684961, fixed-source dimensions
96.54166666666671, floaters100. Official standard passed with all front/rear/
full-sweep band and shoe intersections0, continuity0 and measured roof weapon1.

All three stages exited0; all pinned runtime, canonical source and marking-code
hashes are identical before/after. New markings did not introduce a failure in
this standard or fidelity checkpoint. Full raw reports, neutral board, per-stage
logs/statuses and historical first-source/antenna-seat rows are retained without
overwrite. This machine-checkable result does not erase the medium-form visual
limitations above, nor replace mandatory final anatomy/presentation/release work.
