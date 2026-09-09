# Abrams source X — bounded stern R3

Date: 2026-09-07. This is a source-measured structural correction and focused physical proof, not a new visual score or whole-vehicle qualification. Anatomy generation remains paused for the parent's combined R3 freeze/review.

## Scope and source

The selected loose OBJ remains authoritative: SHA-256 `85c33cee1ec041cbc3b5453841a6a006c8f1f866365a7a16c078bad3d630bd29`, unchanged metre frame `[-rawX, rawY + 0.203945, 0.357965 - rawZ]`. All 143 original owners were retained for complete-scene ray queries; owner4 and its connected stocks were also studied separately to distinguish the hull skin from fittings. FrontSide results were compared with DoubleSide diagnostics; dark shading was not treated as proof of air.

Only structural hull emission0 and the two old generic rear towing toruses were replaced. The original forward tub recipe, bow, five other common structural emissions, the urban variants' separate belly add-on, all running gear, axles, pivots, ERA and three-bay grilles remain unchanged. The new first-party helper is `src/vehicles/profiles/abramsSourceXStern.ts`; its sole integration is in `abramsSourceXHull.ts`. No source topology, source loader or source arrays enter runtime.

## Independently measured defect

The rejected pre-edit full-scene checkpoint is `.qa-dev/reports/abrams-stern-r3-uGPb3x/rays.json`, generated **2026-09-07T11:02:53.723Z**. Earlier diagnostic checkpoints remain alongside it; none was overwritten.

| Finite ray / true source stock | Source first surface | Rejected native result |
| --- | --- | --- |
| Rear-facing, X ±0.6, Y 0.67 | Owner4 Z −3.461515231 | Z −3.976944923: 515.430 mm too far aft. |
| Upward, X 0.6, Z −3.75 | Owner4 Y 0.941058041 | Y 0.648043990: false floor 293.014 mm below the actual stock. |
| Rear-facing, X ±0.6, Y 0.75 | Inclined skin Z about −3.521447 | No native hit in the fixed 1.2 m segment. |
| Rear-facing, X ±0.6, Y 0.85 | Inclined skin Z about −3.596825 | No native hit in the same segment. |
| Rear-facing, X ±0.6, Y 0.60 | Approach face Z −3.399902539 | Already exact; retained. |

This was both an unwanted deep floor/end cap and missing inclined skin, not a reason to fill the rear with a broad block. Source4's true central lower skin terminates near Y 1.009394. The engine opening above it remains open; the upper side shoulders and narrow grille receiving rails are separate stocks.

The replacement retains the independently measured lower approach plane, the reversed 22.249 mm end fold from `[Y 0.648044, Z −3.472775]` to `[0.670293, −3.461365]`, and the inclined lower closure. The old first station's hidden inner return now ends on that same fold. Every original triangle wholly forward of the approach station Z −3.156965 keeps exact position and normal bytes. The approach face and shared lower-fold boundary have independent fixed source-ray assertions; the changed rear span is not hidden inside a broad preservation exemption.

## Actual receiving and towing stock

Sixteen separately closed, permanently hull-owned equipment solids replace the generic rear eyes:

- Source4 islands6287/6804: two upright ears and a lower heel per side, centered at X +0.980560/−0.983865. Their middle is open above the lower heel; an unbroken torus would invent an upper bar.
- Islands6401/6800 and the transverse source pins: separate receiving lugs and 42.2 mm diameter, 110.13 mm long pins at Y 0.777434, Z −3.631040. Actual pin/ear/lug contact is checked, not inferred from bounding boxes.
- Island146: the thin folded lower grille receiver, not a floor spanning the entire stern. Its complete-source first surface at X ±0.6, Y 0.95 is near Z −3.761664.
- Island4230: two narrow, beveled central gussets and their receiving wall. The measured inner bevel reaches the inclined hull skin; merely extruding the wider outer contour would leave a roughly 9 mm attachment gap.
- Islands132/32: separate central hook and latch, with the actual open throat and shared latch seat Y 0.769734.

The source skin has no independently modeled inner wall. A concealed approximately 22 mm closed return was authored for native physical stock; that thickness is not a measured armor rating. Source hook/receiver extremities leave a 0.12 mm seam. Only the concealed existing mating flat extends 0.24 mm, yielding about 0.12 mm native overlap; the visible hook throat remains open. These are explicit first-party closure choices, not changes to the oracle.

Cast ear, heel, lug and pintle fillets are sparse analytic approximations. Independent ear first-surface witnesses use a 4 mm bound; the main skin/fold and exposed receiving rail use a 0.2 mm bound. Neither bound means that every cast contour or narrow upper rail was reproduced to that precision. Small casting details, fasteners and fine edge rounding remain simplified.

## Preservation and focused proof

`src/vehicles/abramsSourceXStern.selftest.mjs` passes actual construction of all seven X IDs in both high and low quality, with neutral plus two turret/gun poses: **14 builds and 42 poses**. It checks nondegenerate outward, closed stock for all 16 fittings; source lower skin/fold/ear surfaces; real engine-mouth, clevis, under-stern and pintle-throat air; and positive hull/lug, pin/ear/lug, gusset/receiver, hook/receiver and hook/latch contacts. Hull attachments remain hull-owned during turret yaw and gun pitch.

The original tub is reconstructed from its already-authored scalar recipe solely for immutable authentication against pre-stern hash `14d1831ddaaf46504cfd452df781c65aebe7f00b81e3bfa147bbbebae955a5aa`. Original provenance is `.qa-dev/reports/abrams-hull-deck-study-ECSHdr/source-and-before.json` and `.qa-dev/reports/abrams-stern-before-j8lG6P/native.json`. No replacement hash is blessed as an old baseline.

The test exports `assertAbramsSourceXSternStock(geometry)` behind a direct-run guard. The separately owned HullDeck regression uses this same authenticated forward-stock/source-ray contract for emission0, while retaining exact original hashes for the other six SEP v2 stocks and every running-gear buffer/instance/world matrix. Importing that contract does not trigger the fourteen actual tank builds.

The initial heel-closure failure was a real self-intersection and was corrected in the authored heel. A later pin-closure failure was a test traversal error on indexed geometry; the assertion was corrected to traverse the actual index without changing the pin. The initial rejected evidence remains retained; no source or threshold was changed.

Initial scoped CPU/source packet: `.qa-dev/reports/abrams-stern-final-J6jheN/`. Its source-native, focused test and scoped quality stages were independently serialized through the shared FIFO and all **PASS**, completed **2026-09-07T11:26:36.106Z**. `summary.json` retains exact commands and individual logs; `closure.json` verifies their actual contents, checkpoint file hashes and unchanged runtime during that proof. This did not test the narrow receiving-arm eyes; the later combined failure and correction below supersede its arm freeze, not its measured central-skin results. The initial test snapshot predates one test-only strengthening of the exact six-common/seven-urban emission count; that assertion was saved before the focused child started.

The fresh full-source receipt is `.qa-dev/reports/abrams-stern-r3-6rA5pE/rays.json`, generated **2026-09-07T11:26:33.675Z**. The ten exposed central approach/fold/skin/receiver witnesses in the table's X ±0.6 lanes now have maximum absolute error **0.011085 mm**. The upward X 0.6/Z −3.75 witness now differs by **0.0000554 mm**, instead of the old 293.014 mm false-floor error. These are bounded measured samples, not an all-surface accuracy claim. Scoped code quality covers the helper and hull integration: **30 functions, zero violations, zero explicit any/unknown**.

## Rendering distinction and remaining qualification

### Receiving-arm recovery, 12:06 UTC

Combined regression correctly exposed an invalid attachment premise: the old outward ray at X −1.027/+1.032, Y 1.24, Z −3.97 misses both complete source and current native. It lies behind the actual grille sidewall. Restoring the rejected tub there would create false stock. Independent complete-source receipt `.qa-dev/reports/abrams-grille-seat-vU4zjw/rays.json` records this air, plus real overfill of the first two rectangular receiving rails at Y 1.5/Z −3.95 and Y 1.6/Z −3.9.

Only those two newly authored rails were replaced by separate source4 curled arms: a holed body, tapered fore-web and cropped octagonal finger cap per side. Each of the six component stocks is independently nondegenerate, outward and closed; this is an assembly of contacting/overlapping closed stocks, not a claim of Boolean-unioned manifold topology. The actual source mouth radius is **67.74 mm** (135.48 mm diameter), narrowing through two axial chamfers to **57.23 mm left / 58.18 mm right**. A straight cylindrical hole was rejected by independent first surfaces about 9–10 mm ahead of that approximation. The final throat rays match source within 0.041 mm. The clipped finger ends match the bounded complete-source outer-face witnesses within 0.253 mm; outer curled crowns within 0.203 mm. Sparse analytic curves retain a 0.3 mm bound only at those stated witnesses, not globally.

The left/right arm outer side planes are X −1.067800/+1.123880. Their front webs have actual **47 mm** overlap with the unchanged engine-deck sheet, independently verified using opposing rays from outside both solids at X −1.05/+1.097, Z −3.77. The measured source upper crowns there are Y 1.694256673/1.694122010; native differs by at most 0.128 mm. The cropped cap and lower arm meet at the same finite mating plane Z −3.930335/−3.930095, without an invented overlap extension. The eye centers and lower air lanes remain empty in the complete actual scene under neutral and two turret/gun poses.

Preservation evidence was captured **before** the arm edit in `.qa-dev/reports/abrams-stern-arms-before-1njCz4/emissions.json` at **11:44:28.810Z**. An independent reconstruction authenticates exactly the two old rectangular stocks as its final 120 vertices. Every preceding 1,584 position/UV/normal vertex and all 16 prior fittings remain identical to their recorded Float32 values, indices and emission arguments. The immutable prefix hash is `c4cd1dffcf706a4d118d248f639104e391443813e7cb97eb9f5fed232f011aeb`. The capture used JSON arrays and therefore did not preserve signed-zero bits: the comparison canonicalizes only −0 to +0, while pinning all nonzero Float32 bytes. It must not be described as an original full raw-binary baseline. `.qa-dev/reports/abrams-stern-prefix-diff-ohh0W5/diff.json` independently reports zero differing numeric values for all three attributes. Original forward/bow and other-six-stock checks remain separately exact under the prior authenticated contracts.

Final arm packet `.qa-dev/reports/abrams-stern-arms-final-Xse0LF/summary.json` completed **2026-09-07T12:06:55.120Z**. Its five serialized stages pass: new `abramsSourceXSternArms.selftest.mjs` (**14 actual builds / 42 poses / six closed arm stocks**), existing stern regression, separately owned grille regression, fresh complete-source/native study, and scoped quality (**16 functions, zero violations or explicit any/unknown**). The new arm log contains `pass:true`; helper and test hashes are identical before/after. Source/native rays are retained in `.qa-dev/reports/abrams-stern-grille-seat-0g7Lco/rays.json`, timestamp **12:06:54.809Z**. The quality-only extraction preserved both arm geometry hashes exactly: left `2e82d71f49cf389dcaec19e78c07c82eb23ebd2452805b6021349e2981410be4`, right `ea19a54212b85751981be666f330e745227dda93fc59c109cebdfa3fa80b0fc3`.

Rawls separately corrected only eight source2/3 asymmetric hinge leaves. His `.qa-dev/reports/abrams-stern-test-reconcile-qOZ5II/` passes FrontDeck, HullFittings, RearGrilles and HullDeck, retaining 127 non-leaf emissions. Fresh grille tests still pass after the final arm chamfer/cap correction. The old air ray was never relabeled as support; actual receiving-wall laps and posed first-hit source leaf surfaces replace that obsolete premise. Small cast fillets and fore-web curvature remain analytic approximations. No gear, source, ERA, oracle or threshold changed in this recovery.

Complete-source rear-facing first hits at X ±1.425 and Y 0.4/0.6/1.0 identify owner119 `track_1`, not separate wide mudflaps. The rear track-course difference is the separately documented source tooth/band interference correction and is untouched here. The front lower glacis's black/source versus gold/native appearance is also not an aperture: the independent twenty-ray receipt `.qa-dev/reports/abrams-front-lower-1r5hKL/rays.json` confirms matching real stock.

No GPU capture, anatomical regeneration or whole-vehicle pass is claimed by this stern packet. The R2 visual/component failures remain historical failed checkpoints until the parent's fresh combined R3 comparison and required integration are completed.

