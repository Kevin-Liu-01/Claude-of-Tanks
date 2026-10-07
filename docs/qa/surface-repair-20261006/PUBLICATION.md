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
