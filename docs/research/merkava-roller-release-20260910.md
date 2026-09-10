# Merkava X fitted-roller release candidate — 2026-09-10

Status: preparing, not published. The complete Centurion/Merkava recovery
remains preserved at `82fb32fa0` in the five-roller worktree. This isolated
candidate excludes Centurion runtime/tests and its dual-drum audit extension;
those source-gate failures do not belong in this two-vehicle checkpoint.

Scope: `merkava3d_x`, `merkava4_x`. Retains the reviewed efficient closed
roller stock, attached finite spindles, existing wheel/axle datums, fitted
upper track course and Mk4 local inner-band lining. Complete roller cost
remains 160 HIGH / 80 LOW triangles including spindle. Four concealed support
stations per side are a documented mechanical inference; the supplier
establishes eligibility, not a variant-specific station count.

The identical Merkava runtime on the five-vehicle candidate passed native
configured-stroke fit and immutable-history tests. On its current-main merge,
the early source comparison passed both 92-point exemplar floors: Mk3D 95.0,
Mk4 94.3. The initial missing-oracle attempt remains failed; the successful
retry uses unchanged recovered comparison files, never runtime imports.
Source hashes agree in both preserved original and integration worktrees:

- Mk3D: `68aab556c5202455881862e5beae79fbe6b6dec4cf690ab3f1c73716e3bb3a5c`
- Mk4: `df149523e3cb85d6383d2a9bc78845faa653334fb4e2d88f57754b7da9eaa41b`

On this isolated composition, all four focused entries pass: native configured
stroke/contact/cost, immutable end-return history, shared physical fixtures
and catalog discovery. Receipt: `.qa-dev/merkava-fit-8OnqFA/receipt.json`.
Independent static review found no composition, ownership or oracle blocker.
The fresh Mk3D/Mk4 neutral comparison boards were inspected: asymmetric armor,
bow coverage, open rear baskets and lower-wheel exposure remain coherent;
small source fittings are still simplified and the rollers are concealed.
Those boards do not establish the historical station count.

Typecheck/core-unused pass. The new runtime helper passes strict metrics
(four functions, zero complexity violations or explicit any/unknown).
Scoped Doctor exits zero: no errors and eleven retained warnings in the
offline physical selftest, not runtime findings. The complete focused driver
receipt is PASS; it is not a full npm or official release receipt.

After integrating the published fourteen-tank checkpoint (`e4ca00b6c`), eight
additional compatibility entries passed on frozen `aa5896438`: current upper
return stock, source-X ERA, west-X ERA binding, Mk3D front return, Mk4 end
returns/rear hull, west-X geometry and both shoulder returns. Receipt:
`.qa-dev/merkava-compatibility-dcqeFm/receipt.json`. This is focused compatibility
coverage, not a replacement for the uninterrupted complete release suite.

Fresh strict scores are Mk3D 93.3 and Mk4 92.9 against their unchanged 92-point
floors, with zero reported front/rear/swept intersections and continuity holes.
Fresh native source comparisons remain 95.0 and 94.3. Both neutral boards were
reviewed. Full anatomy regeneration changed only the two track envelopes and
their source hashes; the other 206 asset-manifest rows are unchanged. Generated
icons are staged by exact vehicle, not by a fleet-wide directory addition.

Preparation completed PASS on unchanged `aa5896438`:
`.qa-dev/merkava-preparation-6oXEzS/receipt.json`. The full anatomy update and
check covered 181 vehicles/57 groups, 1,552 modules and 362 track sides, with
zero failed/outside-envelope probes and 83 retained dimension-drift warnings.
All 543 technical diagrams are current; only sixteen changed Merkava images
and their two manifest rows are included. Muzzle/bore checks are not supplied
by that diagram-only freshness command and remain in the official release.

Before publication, the complete official release remains required.
This checkpoint does not certify country-wide track-gauge matching or finish
the fleet performance backlog. Failed Centurion/prototype drafts stay preserved
outside this checkpoint.
