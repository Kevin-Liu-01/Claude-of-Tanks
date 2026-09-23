# M1A3 mantlet and fender closure; Ajax Tier X

Owner target: taller M1A3 mantlet front face (explicit clarification), closed
front shoulder/fender openings and rear openings above the tracks, then a
sloping underside to the turret cheeks like the M1A1/M1A2 family and matching
mantlet lower corners. Ajax becomes Tier X. Existing main publication authority
applies; this task does not deploy production.

Starting main: `f152000f61eb40423c96d9edf8ec01a193a23c84`.
Owned worktree: `codex/abrams-upgrades-20260922`. The shared dirty checkout is
untouched. Recent terrain, wheel-finish, roster and performance changes were
integrated before editing.

## Geometry and gameplay

- `m1a3`: front moving cover rises from local turret Y 0.47 m to 0.67 m;
  its central lower edge stays at 0.16 m. Its face is now 0.51 m tall at the
  center, with 100 mm wide / 80 mm high lower corner bevels. It remains on
  the pitching gun mount; only the barrel recoils.
- Both turret cheek tips rise from -0.10 m to 0.06 m at their lower front
  inner corner. The lower rear cheek edge and circular bearing stay seated.
  The existing 50 mm exposed turret ring, gun pivot, barrel and complete
  turret position are unchanged.
- Finite, mirrored hull solids join front shoulder roofs into skirt crowns,
  fold down ahead of the idler sweep, and close the rear sponson roofs and
  short aft returns. The roofs retain clearance above the track return run;
  lower road wheels, track wraps, cooling louvers and cage openings remain.
- The completed covers also join the narrow existing center-sponson/skirt
  seam. Both original light housings move forward 70 mm onto the new apron;
  their lateral position, height, optical road aim and pooled light behavior
  are unchanged. Exterior lens and receiving-stock tests cover both qualities.
- `ajax_x`: the canonical tier table changes IX to X, shared by UI and
  matchmaking. No Ajax geometry, weapons or combat statistics are changed.

All additions merge into existing painted buckets. No new material, draw
bucket, per-frame work or runtime-loading dependency is introduced. HIGH/LOW
before/after geometry and controls are in the local census. M1A1, AbramsX,
SEPv3 and Ajax remain comparison controls, not editing targets.

## Evidence and qualification boundaries

Local evidence: `.qa-dev/abrams-upgrades/m1a3-closure/`.

- `before/`, `final-refined/`, `garage-final/`: native Gallery front/rear/both sides/top
  and articulated poses; real garage cold selection, cached return and gun
  movement. Final snapshots must follow the last mantlet refinement.
- `upgrade-test.log`: HIGH/LOW stock/air rays for all four fenders, sloped
  cheek undersides, matching mantlet corner relief, gun sweep and recoil.
  Generated M1A3 fills are explicitly loaded. Existing bearing/attachment and
  independent AbramsX/SEPv3 checks remain intact.
- `concept-test.log`, `tier-test.log`, `typecheck.log`: authored M1A3 invariants,
  Ajax tier, and strict compilation. Matchmaking and garage order are also
  checked separately.
- `anatomy-update.log` is an interrupted superseded measurement, stopped after
  the owner's follow-up mantlet request. `anatomy-update-final.log` is its
  replacement; incomplete evidence is not counted as a pass.
- The initial extended rear roof left 32 top-down cells between the two aft
  corners. Shortening both returns to the existing center hull's rear plane
  removed those cells; the strict preflight reports zero continuity cells
  and zero band/shoe intersections. No threshold was changed.

M1A3 has no supplied comparison reference, as previously confirmed by the
owner. The legacy composed standard still reports FAIL for its absent oracle
while reporting its measured physical checks independently. This scoped
owner-directed change does not claim a source-fidelity score or waive any
unrelated vehicle's reference requirements. Final release/test/build results
are retained in the local logs; a composed failure is never described as green.

The completed full update measured 202 anatomy/marking records and regenerated
226 vehicles' 678 technical images. Only M1A3/Ajax saved-image rows change;
only M1A3 changes the Abrams anatomy, interior-fill and marking-seat records.
Selected images were regenerated after centering. Native stored geometry
grows by 306 triangles at each quality with unchanged mesh counts (59 HIGH,
56 LOW); the separately regenerated fill uses 109 buried boxes. Source files
and generated records were scope-audited before staging.

## Final integration findings

The complete first-pass suite ran against `fd5ea2156` while the final physical
corrections were isolated in a second owned checkout of that commit. No source
was edited underneath a running suite. The unchanged starting main was first
measured separately at `f152000f6`.

- A final scan detected 14 cells over an existing narrow center-sponson/skirt
  gap. Rays reproduce the gap on starting main; closing the end covers made
  it enclosed. The previous zero-cell scan is superseded. The final narrow
  roof bridges close it physically, with stock/air regression probes and a
  fresh zero-cell scan; neither the scan nor its threshold was changed.
- The expanded front apron covered the old headlight seat. Moving the complete
  fixtures 70 mm forward passes the original exterior-occlusion, nearby
  receiving-stock, 72-face visibility and road-beam tests. Only the intentional
  forward seat coordinate in that test changed; its other checks remain intact.
- Ajax's exact registered oracle was recovered locally from the prior fleet
  worktree, SHA-256 `506a31e984730c4ab6a398a4f1305a2fe6220960699842d8ed62ec0b4a2658f0`.
  Its geometry gate passes at 95.1/92 and whole reference fidelity at 96.4/92.
  The initial missing-file failure is superseded by these fresh comparisons;
  the reference is still a local authoring input and is not staged.
- Ajax's promotion creates the fourth independent member of `modern/10/ifv`,
  activating the existing peer-median balance audit. It flags the unchanged
  BMPT T-90 primary penetration (122 mm versus the 210 mm cohort median,
  ratio 0.581 below the unchanged 0.65 floor). Starting main passes because
  its group has only three members and is below that audit's sample minimum.
  This is an exposed balance concern, not a pre-existing failing test. No
  other tank's weapon stats, cohort labels or audit thresholds were changed
  to make this tier-only request appear green.

The articulated mantlet/hull sweep samples 62,686 vertex/surface relationships
in each quality across eight turret yaws and six gun pitches, with at least
40 mm clearance. The final roof bridge sits below that verified deck envelope.
Control geometry hashes for Ajax, M1A1, AbramsX and SEPv3 are unchanged.
