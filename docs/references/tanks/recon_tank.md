# Recon Tank (Mophs) (`recon_tank`) — reference packet

Community-original light tank ("Recon Tank" by Mophs). The game spec is the
authored balance/dimension source; there are no published real-vehicle dims.

## Spec dims (authoritative for the geometry gate)

`specs.ts`: hullLengthM 6.2, overallLengthM 7.2, widthM 3.0, heightM 2.5.

## Local GLB oracle notes

`/models/tanks/community/recon_tank_mophs.glb`. Width-normalized to 3.0 m
the print reads: body length 5.43 m (**−12.4 % vs the spec's 6.2**), overall
7.13 (−0.9 %), p95 roof 2.76 (+10.3 %) with a mast to 4.45.

## GATE-V9 CERTIFIED SPEC/ORACLE CONFLICT — curve components (2026-07-31)

The spec dims (game-authored fiction, sovereign per the contract) disagree
with the print's own proportions by −12 % hull length / +10 % roof. The
build (profiles/misc.js parametric) carries the SPEC envelope: hull 6.2,
overall 7.2, height 2.5, width 3.0. Curve rows against the shorter, taller
print therefore carry a structural ~0.4 m body-span mismatch:
hullCurves/wholeCurves/turretCurves/stations are capped at their measured
residuals until either the spec dims or the oracle is re-authored (owner
call — outside this family's file scope). dims + floaters sovereign.

### V10 re-verification (2026-07-31, round 2)

Fresh extraction confirms the certified spec/print conflict: width-
normalized to the spec 3.0 m the print reads body ~5.4 vs the spec 6.2
hull, roof band tall with the mast to 4.45. Spec dims remain sovereign
(game-authored); the conflict is an owner call outside this family's
scope. Cap STANDS (curve components 0); dims + floaters pass (100/100).

## Round-3 cap re-verification (2026-07-31, post kit track fix 146d25c)
Re-measured on gate v10 after the kit contact-span/ground-clamp fix and
the family-wide raisedEnds-workaround removal: the certified oracle/print
defect cap STANDS (curve/station rows unchanged at their capped levels)
and dims HOLDS >= 90. No compensation was re-introduced; end wheels are
plain kit-native fits.

## Zero-row triage (2026-08-03, misc agent) — NEEDS OWNER/ORCHESTRATOR RULING

Reference renders (honest rows, no false-0), but this is a FICTIONAL
community vehicle whose spec dims are authored numbers that structurally
disagree with its own print: bodyLen 5.43 (-12.5% vs the invented 6.2),
hullMask = the FULL 7.13 span (+15% — the ^Barrel$ node exists but
carries NO mesh, so the gun cannot be excluded from the hull mask), deck
plateau 2.30 vs the parametric profile's 1.62 roofY, an antenna mast to
4.45, and the gate turret rows read the empty-mask signature (mean 100 /
cover 100). Extract REG appended. NO normalize plan authored — "published
dims" sovereignty is undefined for an invented vehicle; the cheap paths
are (a) re-spec dims to the print and rebuild the parametric profile to
its actual proportions, or (b) accept the GLB as the permanent model (it
ships as MODEL_SOURCE) and delist the procedural fallback from the gate.
Ruling needed before any build effort is meaningful.
