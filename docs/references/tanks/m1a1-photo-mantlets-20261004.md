# M1A1 mantlet photograph correction — 2026-10-04

## Target and scope

The owner rejected the previously published mantlets and supplied front,
low-quarter and isolated assembly references. These photographs supersede the
2026-10-03 cheek-following, tapered-cover interpretation. This is a regional
appearance and mechanical-fit repair, not a new whole-vehicle replica claim.

Owned IDs: `m1a1`, `m1a1ha`, `m1a2`, `m1a2_tusk`, `m1a2_sepv2`,
`m1a2_sepv3`, `ua_m1a1`. The legacy `m1a2*` names here represent M1A1 HC,
SA, AIM and FEP in the current roster. Independent `_x` studies, AbramsX,
M1A3 and MBT-70 are outside the repair. Hulls, suspension, turret seats,
weapons and gun lengths are preserved.

Worktree: `/Users/kevinliu/.codex/worktrees/m6-linebacker/claude-of-tanks`.
Integrated starting commit: `066277ae80b159ec91f4c60481190874b9e4d466`.
Local evidence root: `.qa-dev/m1a1-photo-repair/`.

## Reference provenance and limits

Owner-provided files are reference-only; no redistribution license is inferred.
They are preserved unchanged in the ignored `references/` folder. No source
mesh or external image is added to the playable assets. The author of the
procedural geometry remains Kevin B. Liu.

| File | SHA-256 |
| --- | --- |
| `reference-1.png` — front photo | `77fc1d1c33f67abe857245e812b07a89d702c0643a68a7aed725795a955eac60` |
| `reference-2.png` — low-quarter photo | `de557a70d99fb4d874eaa048e9a3448198b130fba2f02235750934104c32c835` |
| `reference-3.png` — isolated assembly | `ab8bf655d8a2d10ca8066195f8d1e820c60fce394a70dd8db32b1eb12707b587` |

The front photo establishes a compact, almost square armored face around the
barrel, rather than a thin, wide panel or a pyramidal cover. The other views
show its deep side plates, rounded rear shoulders, raked front, lower stepped
chin and fasteners along the side seam. Photo perspective permits proportion
judgments, not millimetric measurements or a numerical 3D-fidelity score.
These seven IDs have no registered whole-vehicle 3D comparison target; that
comparison remains N/A, never a pass.

## Construction and iteration

The fixed cheeks now bound a 0.780 m pitching bay. The primary shield is
0.744 m wide, with finite raked armor and true circular gun/coax apertures.
Its lower face reaches 0.255 m below the gun axis; the recessed, chamfered chin
continues to -0.350 m. Rounded side plates carry a diagonal seam/bolt row.
Separate trunnion stubs connect it to the receiver without a solid cross-shaft
plugging the openings. A hollow circular cradle carries the recoiling barrel. Its hidden tapered root
now stays at least 5.5 mm inside the sleeve, including peak recoil; the coax
receiver extends 49.2 mm into its trunnion support.
The photo's coaxial opening is on the left when viewed head-on. Upper lifting
brackets are seated on the shield; the HA/UA searchlight retains its gun frame
and receives a finite bracket back to the narrower shield.

The first draft (`gallery/`) is retained as a rejected experiment: too wide and
shallow, a thin lower lip, and a painted rotor obstructing the coax receiver.
The independent critic identified these defects before acceptance. The second
round is recorded separately under `gallery-r2/`. These are native Gallery
renders; the temporary local camera helper changes only viewpoint. Close-ups
are diagnostic and are not claimed as registered numerical comparison views.

## Validation status

Asset generation, the final visual review and the garage checks are complete.
The composed release remains in progress; earlier batch passes do not certify it.

- Baseline HIGH/LOW geometry and complete protected controls: `baseline.json`.
- Candidate geometry/cost: `candidate.json`; inspect the current source hash
  when attributing a capture to a revision.
- Focused geometry/pose/recoil checks: `focused-final.log`, PASS for all seven
  IDs at HIGH and LOW, including 33 recoil positions per build. The minimum
  conservative front-hull clearance is 38.4 mm.
- Independent shaded R2 review: all seven front/left/right close views, plus
  base top and pitch views accepted against the owner photographs. No visible
  shoulder trough, detached side plate, or receiver gap was found. The final
  hidden-root/support fixes were additionally measured in runtime geometry.
- Fresh HIGH/LOW native captures: `gallery-final-high/` and `gallery-final-low/`,
  1520 × 1236 canvas pixels. Their manifests pin source hashes and generated
  inputs, which predate capture and were verified unchanged afterward. The
  harness adds camera access and selects the normal factory detail option;
  it changes no mesh/material code. The critic accepted 26 final views spanning
  all seven fronts, base quarters and base/HA pitch extremes at both qualities.
- PASS: scoped fill generation, full-fleet anatomy update/check, scoped centering
  and assets, geometry ledger update/check, sealed ledger, typecheck, attribution
  and public build (`generation-results.json`). The full anatomy check covered
  220 vehicles / 660 diagrams; module probes had zero failures and 110 existing
  dimension-drift warnings. Fill generation's residual-voxel values are retained
  in `fills.log`; successful generation is not a claim that those values are zero.
- The full regeneration also refreshed M6 Linebacker's already stale armor
  diagram/metadata: four inherited M3A3 placeholder ERA plates were absent from
  current runtime metadata. No M6 authored geometry or stats changed here.
- The first garage profile rendered all seven vehicles and completed every
  switch, but failed its minimum-four-cached-revisits requirement (one observed).
  Raw cold first-painted times were 157–197 ms and the single cached revisit was
  9.1 ms. This is an insufficient measurement sequence, not a passing warm gate;
  the corrected paired-revisit run is recorded separately.
- PASS: corrected garage timing run (`switch-final.json`, `switch-final.md`),
  seven cold loads and twelve cached revisits. First-painted cold times were
  170–198 ms; cached times were 11–57 ms on this contended host.
- PASS: production-preview rapid switching (`rapid-ui.log`), fourteen requests
  at 90 ms intervals, zero empty-stage samples, final selection/pedestal/UI
  agreement. Longest observed frame interval was 55.3 ms. All seven garage
  screenshots are under `garage-final/`; no browser errors were reported.
- PASS: focused HIGH/LOW geometry and recoil checks after regeneration
  (`focused-after-generation.log`).
- Composed release remains pending. No complete release pass or publication
  is claimed here.

The targeted regression checks sample real triangles for the broad raked face,
stepped chin, empty coax aperture plus recessed receiver, circular cradle,
fixed receiver opening, yaw/elevation/depression, non-recoiling shield, and HA
lamp contact in HIGH and LOW. They replace the former assertion that required
an incorrect 235 mm skew across the shield. They do not replace visual review.

## Preservation and geometry cost

Final inventory: `snapshot-final.json` and `preservation-final.json`. Authored
hull/running-gear meshes are unchanged for all seven IDs. M1A2 X, AbramsX,
M1A3 and MBT-70 are byte-identical across their complete HIGH/LOW inventories
(8/8 protected comparisons). HA designation/insignia seats were regenerated;
the LOW static batch containing those markings changes with them. Turret
cheek-dependent armor/details adapt to the narrower bay, while the hidden
barrel root is the only changed section of the recoiling tube.

Counts include instanced rendered triangles under the same inventory method:

| ID | HIGH before → after | LOW before → after |
| --- | ---: | ---: |
| `m1a1` | 103,400 → 104,200 | 82,508 → 82,850 |
| `m1a1ha` | 114,532 → 115,416 | 93,642 → 94,066 |
| `m1a2` | 114,840 → 115,640 | 93,948 → 94,290 |
| `m1a2_tusk` | 123,654 → 124,452 | 102,762 → 103,102 |
| `m1a2_sepv2` | 117,716 → 118,516 | 96,824 → 97,166 |
| `m1a2_sepv3` | 130,550 → 131,350 | 109,658 → 110,000 |
| `ua_m1a1` | 141,650 → 142,534 | 120,760 → 121,184 |
