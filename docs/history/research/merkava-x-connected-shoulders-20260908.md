# Merkava X connected upper shoulders — 2026-09-08

Status: **candidate; not release-qualified or published**. Scope is only
`merkava3d_x` and `merkava4_x`. This does not complete the 59-vehicle fleet
pass, thicker tracks, replacement wheel primitives, or switch performance.

## Physical change

Two closed, folded L-section sheets per vehicle connect the existing upper
deck edge to the skirt tops. The sheet follows each existing longitudinal
slope: 16 mm top skin, 14 mm outer return, and 12 mm vertical overlap into the
skirt. It is actual camouflage-bearing hull geometry, not a black mask,
double-sided open face, second track course, or full-height wheel-bay box.
The lower road-wheel faces, original wheel stations and moving gear remain.

The new shared section primitive emits **160 triangles total for Mk3D X**
and **184 for Mk4 X**, identical in HIGH and LOW. The source-profile change
is one import and two explicit calls; no broad integrated factory changes
are imported. This is an intentional owner-requested bodywork addition, not
a claim that the added material existed in the supplied source model.

## Evidence and limits

The first focused pass built both actual vehicles at both detail levels:
eight old-gap counterexamples, 80 receiver contacts, 260 longitudinal
deck-lap samples, 48 unequal left/right gear phases, closed outward stock,
and retained permanent closure after ERA depletion. Lower-wheel air remains
open. The gear test samples actual emitted vertices; it is not a complete
terrain-suspension or arbitrary triangle-intersection certificate.

Native first-party renders in `.qa-dev/merkava-shoulder-native-v1/` contain
32/32 images and 16 factory/winter pairs: HIGH/LOW, front-left, rear-left,
left and right. Root reviewed the actual images, including both native LOW
and winter views. The later current-main release must rerender after the
integration; these initial images are not a substituted release receipt.

Retained failure `.qa-dev/merkava-shoulder-release-L4aIlz/` correctly found
the old Mk4 first-hit source witness covered by the new return: 1.33980 m
versus the old source plane at 1.30775 m. The source plane and its original
12 mm tolerance are retained and now checked among actual ray intersections
below the new sheet. A separate 1 mm bound checks the new upper surface.
No source dimensions, fidelity thresholds or historical geometry hashes
were rewritten to make this addition appear source-exact.

Current-main run `.qa-dev/merkava-shoulder-release-uSUhSk/` passed shoulder
contact, western source geometry, rear-fold preservation and ERA ownership on
unchanged inputs. Its owner stopped the queued solid-primitive phase before
it started, to combine
this candidate with the fixed-side-paint checkpoint and run one complete
release on the final combined tree. This interrupted run is not a full pass.
Fresh combined native views, assets, anatomy update/check and the complete
targeted composed release remain required before publication.
Preserved local comparison files are ignored symlinks, never playable assets:

- Mk3D: SHA-256 `68aab556c5202455881862e5beae79fbe6b6dec4cf690ab3f1c73716e3bb3a5c`.
- Mk4: SHA-256 `df149523e3cb85d6383d2a9bc78845faa653334fb4e2d88f57754b7da9eaa41b`.

Publish only after the actual composed release is complete; do not aggregate
partial or failed runs into a fabricated full pass.
