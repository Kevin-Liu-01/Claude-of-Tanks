# Challenger 3 X rear closure

Kevin identified a caved-in rear turret section on September 10 and supplied
Gallery surface markup generated at `2026-09-11T04:38:14.011Z`. The selected
turret-local triangle was `[0,.10,-2.55], [0,.15,-3.27], [-1.05,.52,-3.34]`;
the selected anchor was `[-.17098,.19884,-3.11715]`. The requested repair
preserves the standard Challenger 3.

The two existing shell halves rise from the centerline floor toward the
inset roof edges, leaving a central V under the 35 mm roof. Winding was
correct: the selected face was the actual inward boundary. A closed
eight-triangle solid fills the terminal section on Challenger 3 X only.
It meets the existing roof underside and retains the outer roof, shoulder,
keel and rear extents. Existing side armor and open rack framing remain.

## Focused evidence

- Actual high and low runtime geometry: FrontSide rear rays hit the exterior
  at yaw 0, 90 and 180 degrees. Every closure edge pairs with opposite
  winding, all faces have area, and signed local volume is 0.37352 m³.
- The owner's selected point lies inside the repaired solid.
- TypeScript and the unused-code check pass.
- Owner camera `[7.64466,3.5443,-10.66203]`, target `[0,2.76812,0]`, FOV 34°,
  camo seed 4242: independent review finds the cavity closed. Only 698 RGB
  pixels change inside `(344,209)..(434,232)` at 640×360; alpha is unchanged.
- Standard Challenger 3 before/after PNGs are byte-identical:
  SHA-256 `3733e26574a81442d1628cdea5cd40504755964aa0262f15342ad085bf31af4a`.
- Independent review of 10 m and 15 m low-detail rear views found no new
  opening or protrusion. This is scoped repair evidence, not source-fidelity
  certification; Challenger 3 X still has no registered comparison oracle.

Receipts are under `.qa-dev/launch/owner-rear-before`,
`owner-rear-after-r2`, `rear-before`, `rear-after-r2`, and
`rear-focused-r2.log`. The first unpublished candidate omitted UV attributes
and correctly failed native merging; r2 supplies the required UV attribute.
Full-fleet anatomy update/check passed: 181 tanks and 543 technical cards,
zero module failures. All ten Challenger 3 X asset views were regenerated.
The forced unified source-comparison gate failed because this first-party model
has no registered comparison oracle. That failure is retained in
`.qa-dev/launch/challenger3x-release.log`; it is not a qualification pass.
All remaining release checks, the complete test suite (307 pre, 630 core,
41 post), type checking, and public/private builds passed in
`.qa-dev/launch/challenger3x-release-remainder.log`. The existing 100 ms Garage
timing check runs under its own CPU lease to keep concurrent fleet construction
from contaminating its measurement; its limit is unchanged.
This checkpoint fixes only the owner's marked cavity in the existing playable
model. It makes no source-fidelity or complete-fleet launch certification claim.
