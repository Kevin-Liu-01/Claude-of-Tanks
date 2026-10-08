# Publication checkpoint — 2026-10-07

The owner requested commit, push to origin/main and deployment after the remaining
cap-lint failures and pending full checks were disclosed. This continues the
explicit publish-first instruction; it does not mark any failed check as passed.

## Included work

- Fleet base-shell audit and bounded repairs, including Abrams cheeks and KF51 U.
- Leopard prototype, CV90 family, Dragun and Kurganets gun/bow corrections.
- Compact drones, physical receivers, supported seats and weapon/launch clearance.
- Chinese fuel drums and national equipment; Russian chevron ERA.
- PT-91M rebuilt on the actual T-72BU core with Pendekar equipment.
- Four Ukrainian and four Polish concepts with additional backed ERA, open cages,
  foliage/scrim and equipment; measured clearances preserve their primary stock.
- Closed circular-cap overlap lint in both shared fleet passes and a focused CLI.

## Results and limitations

Focused physical/geometry/protection/drone checks, regression controls, TypeScript
and the earlier production build passed as recorded in the adjacent QA packets.
The new whole-fleet cap audit ran all 220 models at HIGH and LOW: **157 models
failed, with 361 overlap groups per quality**, mostly shared wheel/end-hub caps.
These remain real failures; there is no baseline exemption. The repaired Chinese
fuel drums are clear. The T-90M reference also has shared wheel-cap findings.

Full integrated npm tests, final native visual acceptance, final rendered
technical diagrams/icons, the composed anatomy/release gate, and post-deploy
Garage validation remain incomplete. The earlier source-specific screenshots
and scoped numerical checks do not certify the final fleet or a production view.
The queued generator was stopped before publication to avoid concurrent file
mutations. Final checks must run against the integrated published source.

The test-registry assertion was also stale on the starting main revision: asset
provenance had already been inserted before the four fleet scans. Its assertion
now explicitly preserves that fifth entry and the original scan order; no test
was removed or suppressed.

## Published result

Runtime commit `c6b60311c280914c68375762424aa8b74e4a4348` was rebased onto
`c86165ba3` and pushed normally to origin/main. The only overlapping test-list
file retained every incoming UI test. Production deployment 202 is Ready and
serves `v1.0.0+gc6b60311c` / `main-8cmqavln.js`. All 818 selected entry, vehicle
family and changed icon/diagram assets match the local production bytes; ten
routes return 200 and a missing hashed asset returns non-immutable 404.

The exact integrated commit passed TypeScript/core-unused checks, test-registry
validation (1,313 registered checks), cap regression controls, generic overlap
controls, and the public production build. Both full-fleet CPU data freshness
checks passed: 220 anatomy receipts and 220 marking-seat receipts in 82 groups.
This does not certify the rendered diagrams or full composed anatomy gate.

The immediate npm-test queue-admission attempt used a 1-second wait and timed out
before checks ran. It is **incomplete**, not a failing functional test result.
The targeted 83-ID release invocation remains in standard scoring at this
checkpoint. Native visual review, rendered regeneration and the full 1,313-check
run remain incomplete. None of the 157 circular-cap failures were waived or
relabelled. See [production-verification.json](production-verification.json).
