# Ariete retained rear-coupler opening verification — 2026-09-21

This is a local qualification rule for the inherited rear towing assembly on
`ariete_c1_x` and `ariete_c2_x`. It does not authorize missing hull panels,
change the zero-unexpected-opening requirement, or qualify the C2 against a
source GLB. C2 remains an owner-authored concept with two roof weapons; the C1
source corroborates only the rear stock that C2 retains. Roof census authority
is unchanged and separate from the opening receipt.

The prescribed 1.12-scale canonical C1 source is
`public/models/community-candidates/ariete_c1_x_source.glb`, SHA-256
`1112ea55fab10920e78063a4aec4a6b5e5695751f176bfabc3b72a605bbf0c68`.
The original source SHA-256 is
`02043219575d2ac02c9846666efca20c8087727808e4c51245a28588242e26b4`.
The checker also authenticates the exact enlarged registration recipe and its
certificate, including the unchanged axes, prescribed scale and translation.
No comparison transform is fitted to the candidate.

The actual filled browser scans report **two raw rear cells at each quality
for both IDs**. HIGH uses z1=5.75146521464917; LOW uses
z1=5.752065214749414, so its exact cell centers are measured independently.
Both grids are 72×164, with cells (34,159) and (35,160). Every center and all
nine actual subpixel positions per cell pass complete-source/native air rays.
Raw scans, coordinates, clusters and counts remain in the standard report.
The rule does not subtract a number or grant a rectangular region.

The mandatory manifest has 24 fixed rear stock/air probes plus 18 subpixel air
probes for each ID/quality. It covers the C-shaped head, its underside, split
ears, middle shank, hinge/root/receiver, transverse pin, lower hook, locking jaw
and their real throats. Stock depth tolerance remains 2 mm. Three independently
measured middle-neck stations differ by 1.458, 1.570 and 1.723 mm; these are the
largest retained boundary residuals. Each guard requires explicit source and
native measurement results, and a stock hit must lie on its finite ray.

The original exploratory measurements remain available with their limitations:

- A distant receiver ray first hit a separate source fitting. The corrected
  receiver ray starts outside the actual rear hull face, adjacent to the root.
- An inside-origin pin ray had no source FrontSide hit. The replacement uses
  the pin's exterior aft surface (about 0.182 mm source/native difference).
- The collar contour differs by 4.49–8.41 mm. This is not an opening boundary
  for these downward cells and is not claimed exact by this rule. The existing
  rear fixture still checks native collar/pin contact.
- The original forward shank-top station differs by 2.332 mm. It remains a
  documented approximation; its tolerance was not widened. Three middle-neck
  stations protect against a missing shank.
- C1 deck-cap probes are outside this rear-opening boundary and cannot apply
  to C2's intentionally redesigned engine deck. C1's rear fixture retains
  those separate checks.

Independent source/stock adjudication is pinned in the private
`c1-opening-proof.json` (`6ffcb052b3e8bd7ba571a155c0dcb7c44d356311d0d507c28b35aed49dbc6f98`),
`c1-station-proof.json` (`cf16df8ac0bd0eebafda2998694a998b6095e88a4800136aa2bb39a613a1ae40`),
and `c1-opening-adjudication.json`
(`c6c87cada1c9ab7288093f6a495eeebd64014dbba407c576c9d328bc36831ca5`)
under `.qa-dev/ariete-reference-review/`. The four actual browser rasters and
supplementary source rays are in
`.qa-dev/ariete-integration/openings/acquisition-r1.json`
(`9a167af0cdee3d5e747b00efaee5710c56776a2f174ce61d7f889dbf3227ecbb`).
That exploratory native process imported its factory before the queue wait;
final native qualification therefore uses a fresh child after the lease is
acquired. No readiness claim is based on an import-cache assumption.

`tools/ariete-source-openings.selftest.mjs` uses actual finite synthetic stock
and raycasts to reject missing stock and filled air for every manifest entry.
It also rejects changed canonical/raw-source/recipe pins, changed scale,
duplicate raster cells, unclassified cells, malformed measurements and absent
quality evidence. Existing AFT/Warrior/Barak rules and tests remain intact.
Final qualification still requires the actual HIGH and LOW browser rasters and
fresh loaded native measurements through `tank-standard-check.mjs`.

The fresh leased checker child passed on both IDs and both qualities:
raw2/intentional2/unexpected0, 42 paired guards each, no input drift. The
current receipt is `.qa-dev/ariete-integration/openings/validation-r2.json`,
SHA-256 `05bd9dbe009de911f8741bab500665111b82c62b02fe82d64d0dbf40311cf90e`.
Actual checker negatives reject a missing LOW report and an extra LOW cell.
The earlier `validation-r1.log` remains preserved: it stopped before native
construction on a temporary missing gun-clearance export during parallel
integration, not on an opening assertion. The independent critic's tooling
review found no blocking defect. This is the opening subsystem result, not
an independent visual score or a complete vehicle release result.

## Additional owner enlargement

The subsequent 10% enlargement uses the complete original source under the
`tier10-20260921` recipe and receipt. The retained coupler witnesses move by
exactly 1.10, retaining the 2 mm source-stock tolerance. At the unchanged 60 mm
raster step the enlarged silhouette contains five rear opening cells in each
quality (rather than two at the former size). Both complete source and actual
loaded HIGH/LOW geometry independently pass all 24 retained stock/air witnesses
and all 45 subpixel rays. This authority remains limited to the rear coupler;
it does not authorize new openings or qualify the C2 as a source reconstruction.
Local evidence: `.qa-dev/reports/ariete_c1_x-openings-r2.json` and
`.qa-dev/reports/ariete_c2_x-openings-r2.json`.
