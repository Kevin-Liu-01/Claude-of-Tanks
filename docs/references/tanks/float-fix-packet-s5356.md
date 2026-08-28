# floating-turret regression packet (§5.356 owner order) — UNCOMMITTED-UNSTAGED delivery

OWNER ORDER (verbatim): "wait a bunch of turrets are floating now when they
were right before. the pl01, pl-upior infantry fighting bvvehicle, twardy,
jaguar, all afvs/ifvs - the adv set pushed all turrets up and theyre no longer
propelry sitting on their hulls. fix" + "the challenger turrets are also
floating" + "k1a1 is affected too" + "most tanks are fine thhough" + "we can
just visually confirm btw".

## Root cause — application site, NOT stale data

`node tools/gen-combat-anatomy.mjs --check` PASSED at the regression HEAD:
all 115 receipts current. The bug was in how 3635217c ("calibrate fleet
combat anatomy") APPLIED fresh calibration: `finalizeCombatAnatomy`
(src/vehicles/combatAnatomy.js) passed `armor.turretPivot` / `armor.gunPivot`
through the plate→receipt remap (`reconcileFrame` points list +
`reconcileChildFrame` pivot splice). Those arrays are RIG anchors:
tankFactory.ts:4795/4798 seats the visual rig_turret/rig_gun at exactly them,
and every receipt is measured INSIDE those rig frames (localEnvelope relative
to rig_hull/rig_turret). The remap authored-plate-bounds → measured-envelope
is only ~identity where authored hull plates match the visual envelope; on
divergent builds the pivot scaled up and the whole visual+hit turret lifted
off its ring.

Measured push-ups (authored → remapped pivot y): pl01 2.07→2.699 (+0.63 m,
turret bottom 0.56 m ABOVE the hull's highest point), pt91_twardy 1.38→1.662,
t72m1_jaguar 1.40→1.507, k1a1 1.50→1.765, challenger2 1.55→1.80,
challenger_3 1.55→1.70, marder1a3 1.895→2.057 (+x 0→0.187), upior_ifv
1.66→1.769. pl01 gunPivot z also dragged 1.55→0.91. "Fine" tanks were fine
because their remap was sub-2 cm (gate-certified plates ≈ envelope) or their
turret lofts are world-line-anchored (leclerc/t64bv1: turret world minima
byte-equal before/after).

## Fix (zero profile edits, zero data regeneration)

src/vehicles/combatAnatomy.js only:
- `reconcileFrame` lost its `points` parameter — plates and boxes calibrate,
  pivots never ride the map (both call sites updated).
- `reconcileChildFrame` (casemate branch) now composes/decomposes turret-local
  points about the SAME authored pivot — world placements still scale through
  the hull receipt as one rigid anatomy, but the pivot array is never
  mutated and `gunPivot` is untouched.
- Rig-anchor law documented in the module comment.

Coherence: receipts are rig-frame envelopes, so the sim turret frame
(hull·T(turretPivot), src/sim/armor.ts) anchored at the authored pivot puts
calibrated turret plates exactly on the visual turret; ERA seating
(tankFactory seatEraBricks) subtracts the pivot the rig re-adds —
world-invariant either way.

## Receipts

- Renders (§5.254 pairs): shots/float-fix/before/ vs shots/float-fix/after/
  — pl01, pt91_twardy, t72m1_jaguar, upior_ifv, marder1a3, m2a2_bradley,
  challenger2, challenger_3, k1a1 seated in pixels; controls leclerc/t64bv1
  visually unchanged. Seat metrics JSON per phase alongside.
- `gen-combat-anatomy.mjs --check` PASS post-fix (115/115, byte-identical
  calibration file): geometry buffers and rig-relative matrices untouched —
  the fix moves rig transforms only, and no build content read the remapped
  pivots (kit.js buildHull default-roofY path unused by the playable fleet).
- `npm test` EXIT=0 including combatAnatomy.selftest (115 tanks) and
  type99Armor.selftest (its "calibrated turret seat remains inside the
  measured hull" interval asserts hold with authored pivots).

Probe kit (tmp, delete after round): tools/tmp-float-fix-shots.html + .mjs.
