# Fixed bodywork paint — qualified subset candidate, 2026-09-08

Status: **unpublished; fresh composed release verification required**.

This checkpoint changes sixteen fixed metal sheets/covers on four models:

| Model | Fixed bodywork made camouflage-painted |
|---|---|
| Leopard 2A5 X | Two hull service covers |
| Leopard 2A6 X | Two bow guards and six upper side sheets |
| Leclerc X | Two folded bow guards |
| AMX-40 X | Four side aprons |

The original geometry, rig owner, detail LOD and non-armor classification stay
unchanged. Armor camouflage uses the actual hull texture and spatial UVs;
rubber, separate optics, hoists, canvas and other kit retain their own finish.
The new painted-detail bucket is explicit, not a material-name wildcard.
Merged provenance is retained only when every input has the same declaration.
Leclerc X, Leopard 2A6 X and AMX-40 X each gain one explicit painted-detail
mesh/LOD for that material split. Their triangle count is unchanged; this
finish correction is not presented as a draw-call or performance reduction.

Focused tests reconstruct the entire pre-change source from immutable hashes
at `2933d5645`, reversing only declared material/UV edits. They compare raw
buffers, all other geometry and material assignments, three articulated poses,
spent ERA, receiving-surface rays and both geometry/camouflage settings. The
separate native capture is necessary: the Node canvas fixture does not draw.

## Narrowing and retained failures

The original eight-model paint candidate remains preserved locally as
`6b0e362a46b11d7c864573bbfdba7eb16457791a`, not published by this checkpoint.
T-90 X, Ariete C1 X, Chieftain Mk5 X and Chieftain Mk10 X are excluded here.
Their documented standard failures (roof-gun census and/or source-real
openings) need resolution without filling intentional negative space or
silently invoking the earlier batch's as-is publication waiver.

The attempted eleven-model combined run on `93e8dc689` also failed the
unchanged T-90 X physical-buffer assertion in `sourceXSovietAuxArmor.selftest`.
Its receipt is retained at the sibling verified-checkpoints worktree's
`.qa-dev/combined-visible-release-Ouuch6/receipt.json`. No expected buffer hash
was refreshed. This subset leaves that T-90 runtime and its original test
untouched and does not include the T-90-only decoration-probe predicate.

The fresh combined gate covers these four models, the independent Burlak
paint correction and both Merkava X shoulder-return corrections. That is
seven targets, not completion of the 59-target running-gear/style program.
Track thickness, efficient road wheels and older Challenger budgets remain
separate pending work; paint-only changes do not certify those requirements.

## Combined native checkpoint, still release-pending

On authored tree `ca475a6bf`, the combined seven-ID run
`.qa-dev/combined-visible-release-hb7Qgt/` passed eleven focused tests,
typecheck, 84 native images, full anatomy/marking updates, and all 603 fleet
technical diagrams. Only six targets' technical image triplets changed;
Burlak's triplet was already current. The only anatomy changes are the two
Merkava hull/upper-collision receipts; their outer bounds and all turret,
module, ERA and track data remain unchanged.

The root reviewed actual HIGH/LOW, factory/winter and front/side/rear images
across all seven IDs. The 11 m Leopard 2A6 X front-left framing clips its
muzzle and is finish-only evidence. Supplemental 15 m captures in
`.qa-dev/a6-unclipped-finish-native/` contain four HIGH/LOW factory/winter
front-left images with the complete gun in frame; HIGH winter and LOW
factory were separately inspected. These images do not certify unchanged
running gear as having passed the new style or performance requirements.

The anatomy check process also completed with 174 current receipts across
56 groups. The owner then stopped only the child-free driver to integrate a
test-only exact historical inverse for the Leclerc/AMX-40 bucket snapshots.
The run remains **interrupted / not a full release pass**. Native snapshots
and partial phases are not combined into a green composed receipt. A fresh
complete composed release on the final integrated inputs is still required.
