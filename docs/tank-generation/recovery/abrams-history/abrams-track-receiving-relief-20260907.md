# Abrams X — receiving stock for thicker tracks

Status: receiving-stock checkpoint PASS; thicker outsole rollout, complete
moving clearance and native source/style review remain pending.

The owner's requested original-style outsole needs room outside the retained
source track course. This is an explicit mechanical/style deviation, not a
change to source axle coordinates or an assertion of exact source geometry.

The original concealed rear wing ceiling atY1.332 already intersected the old
moving shoes. Three hidden ceiling stations now rise to1.414/1.414/1.350m.
The inner rear fender follows that relief while its outer rail stays on its
originalY1.405m plane. A finite6mm web connects those sheets outside the track
lane. Aft roof heights, engine aperture, lower wheel air and all axle positions
remain unchanged.

The old forward wing also tapered through the front track lane beneath the
separate mudguard. Its singleZ2.898445m section now terminates at the existing
central bow half-width1.10m. No new hole is cut through the full-width guard:
the guard planes and finite inner glacis return are unchanged. The old buried
diagonal wedge is removed from the lane rather than moving the wheel or
shrinking the requested tread.

`abramsSourceXTrackRelief.selftest.mjs` passed14 HIGH/LOW builds,84 rear stock
contacts, front-lane rays and rejected both the original rear low ceiling and
the original bow wedge as physical counterexamples. All six fender stocks are
closed and positive-volume. The pre-stern original byte oracle is retained:
an explicit test-only inverse restores only the three ceiling coordinates and
the single narrowed wing section. It does not replace the runtime mesh,
rewrite source measurements or bypass tests by using a receipt-only geometry.

The unchanged original `abramsSourceXFrontDeck.selftest.mjs` also passes:
30 source boundary/air witnesses, unchanged top plane, five original other
hull hashes and authenticated end-wheel interfaces. The stable24-image
Abrams/Leclerc native pilot documented in
[the wheel packet](leclerc-low-wheel-20260907.md#native-pilot) shows the reviewed
SEPv2 front shoulder continuous and the rear receiving rail attached; it does
not yet contain the full thicker-outsole rollout.

The whole-course outsole envelope is a separate study:7,806 bounded intervals
per detail level, with an observed conservative neutral minimumY of
-0.054281092m before a common presentation-floor translation. That bound does
not prove arbitrary suspension poses or absence of contact with every nearby
component. Do not mark all track clearance complete from this stock test.

