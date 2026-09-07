# Challenger 1 X — owner-selected supplied-file reconstruction

## Current supplied-file draft — 2026-09-06

The owner explicitly superseded the earlier handbook/photo target with
`challenger_1_main_battle_tank.glb` likeness. This is a visual-reference choice,
not a claim that its proportions or export errors are historically accurate.
The complete original source remains offline and comparison-only. Runtime
geometry is independently authored from scalar measurements; no supplied
vertices, indices, textures or loaders enter the playable model.

The fixed source frame and provenance are recorded in
[`challenger1_x.json`](../../research/second-wave-registrations/challenger1_x.json)
and the detailed
[`registration proposal`](../../research/second-wave-registrations/challenger1_x.proposal.json).
All twelve original owners remain in the canonical oracle. Their material
batches mix unrelated fittings, so this reference is honestly whole-only;
partial named material groups are not presented as complete component scores.

The new `challenger1XSupplied*` helpers independently build the asymmetric
turret, open right carrier, separate left case, folded front guards, actual
installed side courses, native six-road/three-return-roller gear and source
barrel. The 16-sided entrance transitions into the measured octagonal deep
throat; the earlier 100.4 mm “diameter” was the octagon's cardinal across-flats,
not a circular caliber. Nominal 120 mm combat caliber remains separate.
Inferred mechanical joints, rather than exporter node origins, drive the
actual turret, pitch and recoil rigs.

The supplied lower flared bow return intersects its own track: at raw
X45/Z86.8, hull material spans Y42.0522–43.9366 while track material spans
Y41.8833–45.5062. The approved concealed-only correction ends the outboard
return at raw Z84.8 instead of87.2047, a 54.75 mm shortening under the unchanged
guard and tread. Central tub, visible roofs, road/end/return axes and track
course remain unchanged. This is a documented mechanical departure, not an
exact-source claim or a relaxed collision sampler.

The full native-wheel audit subsequently found only15.411mm clearance at the
left concealed suspension web, below its unchanged25.832mm minimum. The web
and anchor boss now sit12mm farther inward; its receiving spindle is24mm
wider and6mm farther inward, retaining positive attachment rather than trading
the overlap for a gap. Actual high/low narrow-phase wheel audits and closed-
stock rays through every arm, spindle, wheel core and anchor joint pass.
All source road/end/return axes, exposed wheel faces and track courses remain
unchanged. These hidden joints are explicitly inferred mechanics, not measured
source surfaces. The regression retains the original source axle assertions.

Two owner decisions remain unresolved: four loose centerline export panels
extend 642.7 mm below the true track ground, and the cupola has an empty
weapon mount without a complete MG. All four panels remain in the oracle;
their native handling is pending. The new draft does not falsely count the
empty mount as a weapon or claim the official MG minimum passes.

Focused `challenger1XSupplied.selftest.mjs` passes actual-ID high/low source
joints and muzzle, polygon throat, native road/roller stations, selected
complete-source first surfaces, open carrier air and concealed clearance.
The unchanged committed strict CPU sampler reports front/rear/full-sweep
band and shoe overlaps 0. These are first-draft checks, not final fidelity or
release qualification. Fresh multi-view source comparison, camouflage review,
refinement and the complete anatomy/release sequence remain required.

The first supplied-file comparison was rejected (raw outline 87.1820;
registered side views below 92), not promoted as acceptance. It also exposed
an uncertified legacy width-fit path and mismatched physical versus filtered
dimension rulers. That immutable receipt is retained locally; the subsequent
comparison uses the verified canonical hash and fixed source frame. No source
or candidate geometry was rescaled to compensate for the instrument issue.

Independent complete-source rays confirmed a separate physical defect in that
first draft: side applique fields reached 223 mm too low and the installed
sheet lacked the end-wheel upsweeps. The current courses use the actual seven
narrow fields, separate aft field, raised borders and rising forward course.
Source field/border/sheet first-face witnesses now agree within 0.5 mm;
actual road-wheel exposure agrees within 3 mm. Both ends retain open air and
all native road, return, sprocket and idler axes are unchanged. The revealed
generic idler face remains 31.87 mm inboard at one held-out source ray; that
is an explicit remaining form limitation, not an exact-source pass. The
native shoe envelope also reaches 3 mm below track-ground in its neutral
phase. Neither discrepancy is hidden by changing the source frame or tests.

The later fixed-source side-course checkpoint is also **rejected**: raw
composite88.98285, side views83.03/82.64 and track-profile76.07368 do not
meet92. Geometry82.6 includes a failing dimension score. The complete-source
P95 height3.208538 m differs from the grounded native2.575138 m by0.6334 m;
the physical envelope differs by0.63966 m. The four loose source panels
remain below its track-ground in the unchanged oracle. These measurements
are recorded in the ignored `challenger1_x-supplied-fixed-source-side-courses`
fidelity/geometry packet. Omitting those exporter pieces requires the owner's
decision; moving or filtering them silently would not establish accuracy.

## Positive-X hood correction — 2026-09-07

Complete-source rays resolved the dark cheek band as genuine air below a
missing thin overhanging sheet, not an already filled cavity. The new permanent
turret equipment restores the measured sheet planes, narrow edging, folded
outer return and receiving rails. The lower cheek, gun/turret rigs and every
pre-existing authored primitive remain unchanged. A concealed 3 mm root
continuation supplies attachment without filling the open interior.

The [scalar packet](challenger1_x.positive-hood-source.json) records independent
top/bottom surfaces, real air, cap and outer-return witnesses. The central
sheet matches its measured planes at floating-point tolerance; the original
lofted return remains an approximation within 5.2 mm at held-out points, and
the octagonal edging differs by up to 1.9 mm. High/low source/air tests and an
actual surface-crossing attachment graph pass, as do the existing supplied
model tests and typecheck.

The fresh 2026-09-07 02:06:34 UTC `source-positive-hood` checkpoint remains
**rejected**: raw fidelity 88.8968995979384, minimum registered whole view
82.78994635935747, and geometry minimum 0 (whole 82.78994635935747, dimensions
0, floaters 100). The fixed source registration passes at zero offset. Official
front/rear/full-sweep band and shoe overlap counts are all zero, as is
continuity; the real weapon census remains zero. The full exact receipts are
retained in the scalar packet's archive paths. No source orphan panels or
missing weapon are silently removed, relabeled or waived.

Independent review of that original-resolution neutral board closes the
bounded missing overhead-sheet finding: the hood/outer return is visible,
the black under-hood slit remains open, and no new floater or filled air is
visible there. The cap edge is still more angular than the soft source form.
Geometry is frozen; this bounded physical/visual acceptance does not qualify
the rejected full model.

## Superseded historical photo draft

Everything below records the earlier handbook/photo build. Its implementation
is retained only as `challenger1XPhotoDraft.ts` for isolated historical unit
regressions; it is not imported by the runtime Challenger loader. These older
tests, images, dimensional claims and passes do not qualify the current
supplied-file model.

Status, 2026-09-06: independent first draft passes focused actual-ID high/low
construction and strict CPU track checks. Shaded comparison, refinement and
the complete anatomy/release procedure remain pending. No metric score is
claimed against the supplied AI mesh.

## Reference scope

The supplied `challenger_1_main_battle_tank.glb`, SHA-256
`27b81eab3162ec03a0b96311462586dab02332d6ed45121aa59b9ed1223b9ab7`,
is an unreliable AI reference, previously rejected as a dimensional instrument.
It contributes no runtime vertex arrays, topology, texture, dimensions or
playable loading path.

The primary construction reference is the original MoD
[AESP 2350-P-100-201, Challenger Automotive System, 1983 with amendments](https://www.military-references.com/wp-content/uploads/books/tanks/britain/challenger/Challenger_Tank_Automotive_System_230-P-100-201_1983.pdf).
The publicly available scanned copy has SHA-256
`bc5d7120cf862dacdcc9bb76a5e922c7f661e25c2cf35139b59e623f5e1851be`.
It is retained only in ignored local research storage. Its historical markings
are not a claim of redistribution permission or declassification. Only external
appearance and dimensional data were used; no operating instructions were
executed.

Printed page xiii (physical PDF page 12, October 1988 amendment) gives 11.560 m
gun-forward length, 3.510 m width, 2.950 m commander's sight-hood height,
0.500 m clearance, 4.790 m grounded track length, 0.650 m track width and
92 links per track. Its 9.800 m **gun-in-crutch** length is not hull length.
Printed xii supplies the six road wheels/four return rollers per side.
Exterior drawings on physical pages 31, 55, 60 and 61 inform the driver's
lower channel, rear engine covers/rails, rear equipment, five-piece skirts,
bow lamps/guards and five-mouth smoke banks.

## Original construction and explicit inference

`challenger1X.ts` authors its own closed hull, separate raised glacis shoulders,
cast under-turret/angular cheeks, engine cover banks, skirt outriggers, crew
roof fittings, TOGS housing and L11 barrel. It calls no existing Challenger
or other vehicle builder. Generic native gear and closed-section primitives
are first-party construction tools.

The 8.390 m hull length, 2.500 m structural roof, yaw `[0, 1.70, 0.54]`,
trunnion `[0, 2.10, 1.69]`, wheel/end stations, concealed optic depth and small
fixture dimensions are drawing-led construction estimates. Decimal precision
keeps assembly deterministic; it does not imply millimetric source measurements.
The 2.950 m handbook datum is specifically the sight hood, not the armor roof.
The rounded track transition's actual flat-contact span still needs independent
review against the handbook's grounded length; matching a course input alone
is not evidence of that final physical span.

The offset roof MG includes a short inferred radial foot seated into the hatch
ring. Actual rays found that its upright alone would otherwise float above
the sloping shoulder; the added foot has positive permanent-surface overlap.

The driver, TOGS and commander optics have literal approach air and recessed
glass, not black-painted solid faces. The main gun has a 120 mm open bore and
roughly 308 mm depth to the visible lining. All ten smoke launchers have open
mouths and recessed stocks. Their mounting stations were raised/advanced
locally after actual-scene rays caught cheek armor intruding into the stocks;
the supported arrangement remains an explicit drawing-led estimate.

## First-draft verification

- `src/vehicles/profiles/challenger1X.selftest.mjs` passes actual-ID high/low
  handbook envelope, clearance, 92-link census, three optic cavities, ten smoke
  cavities, actual muzzle/pitch/recoil ownership and unchanged mesh census.
- All 48 opposing-scroll phases keep physical loaded-shoe contact within
  0.1 mm without moving any road/end axle. The final half-millimeter course
  correction eliminated a real below-ground rigid-shoe corner.
- The unchanged committed strict track sampler, executed CPU-only through
  the ignored adapter, reports band/shoe front, rear and full-sweep overlap 0,
  with no anomaly. This does not replace the final composed browser release.

This is a mechanically tested draft, not a visually qualified final model.
Primary photographic cross-checks, independent shaded review, gameplay
bindings and the final generated receipts remain required.

## Rear equipment visibility correction — 2026-09-06

Independent review of the draft and handbook Fig.20 found a real assembly
error: the central equipment face at Z−4.090 and towing beam at Z−4.112 were
behind the actual permanent rear armor at Z−4.130. Merely emitting those
parts did not make them visible. Portions of the paired side cases were
similarly buried where the rear armor widens above its shoulder.

`challenger1XRearEquipment.ts` now constructs a separate open A-frame,
exposed transverse beam, rounded swivel stock and rear-visible eyes. The
beam's front penetrates the unchanged armor by 17 mm, while its rear face is
visible at Z−4.193. The swivel and side cases have their own positive roots;
the A-frame legs join the swivel and supported beam. The eye centers and
triangular spaces expose the actual rear armor through genuine shallow air
gaps, not black plates or a filled triangle. All are permanent hull equipment.

This is a drawing-led construction correction. The precise fitting sizes
are explicitly inferred, not millimetric measurements from the illustration
or the rejected AI file. The existing Z−4.195 rear envelope, 11.560 m
gun-forward length, armor, gun and running-gear stations are unchanged.
Actual-ID high/low regression checks the exposed faces against the unchanged
wall, stock overlap, eye rims/holes and A-frame air before and after turret
articulation. The earlier handbook, optics, smoke, 92-link and 48-phase ground
assertions remain intact. A fresh shaded review is still required; this
bounded fix does not qualify the complete draft.

## Engine covers, lamp guards and pressed wheels — 2026-09-06

Handbook exterior Figs.1,17,20,21 and The Tank Museum's
[Flying Fox photograph on its Tankfest article](https://tankmuseum.org/article/tankfest-stars-2026)
were inspected directly. The latter shows the recessed wheel bowls and the
supported broad front assembly, but smoke obscures much of the rear and roof;
it is not treated as hidden-surface metrology.

The engine covers now have folded receiving rims, actual open handles,
overlapping hinges, catches seated on their outer frames and small cover
fasteners. A supported driver-hatch handle and four small visible marker
lights sit on the bow-lamp assemblies, with raised protective crossbars.
These details use drawing-led dimensions, not coordinates sampled from the
rejected AI reference.

The new original turned steel wheel core has two recessed pressed faces,
small connected hubs and ten local fasteners per face. Only the hidden solid
rubber centers open around the bowl rims. All tire outer radii, axial shoulders,
road/end axle stations, existing track path and rotating ownership are retained.
The steel profile depths and local bolt sizes are explicit photo-led estimates.
Tests inspect real wheel-bay air inside the intact upper skirts, not pretend
that an exterior camera can see through those skirts.

High/low deck-fitting and complete wheel-solid regression tests pass, including
eight radial bowl witnesses, motion, non-wheel buffer preservation, material
ownership and disposal. The original handbook dimensions, optical cavities,
92-link census and 48-phase contact checks pass, as does the unchanged strict
band/shoe front/rear/sweep sampler with zero overlaps. Fresh shaded and
camouflage review and the final composed release remain required.

## Independent front/deck review and bounded repair — 2026-09-06

The fresh neutral/camouflage review against handbook Figs17/21 and the Museum
photograph found three specific remaining forms: the deep square-looking front
guard ends, eight overly uniform engine grilles, and barely visible bow hooks.
The last was a genuine assembly error: at X.77/Y1.10 the fixed toe armor's
Z4.130 surface preceded the old hook at Z4.0058. Most of each old fitting was
hidden inside armor, not merely simplified at a small scale.

`challenger1XFrontFittings.ts` replaces only those front caps/flaps and paired
hook assemblies. The cap has a closed bent longitudinal sheet and rounded
outboard crossfall; the lower rubber has rounded corners and positive contact
with that sheet. The open U-shaped forgings expose their limbs at Z4.193 while
their roots overlap the unchanged Z4.130 toe plate by 18 mm. Their throats show
the original armor through actual air. The exact 4.195 front envelope is
unchanged. Fine drop-pin/casting details remain simplified; these are original
drawing-led primitives, not metrically measured shapes from the illustration.

The deck retains four rear hinged access covers but distinguishes two broader
forward outer covers (680 mm) from two narrow fixed central fields (315 mm).
Only the six access covers carry grasp handles and hinges. Separate receiving
frames expose the retained canted deck through their real gaps. These widths,
the cap crossfall and small forging sizes are explicitly perspective-photo /
drawing estimates; they are not facts inferred from the rejected AI mesh.

Actual-ID high/low front/deck tests pass closed-sheet seating, rubber contact,
exposed rooted hook limbs and throat air, six open handles, fixed-field layout,
permanent hull ownership and disposal. The pre-change hull, turret, gun,
mantlet and both populated shoe geometries/world frames are byte-identical in
both LODs. The original handbook/optics/92-link/48-phase contact test, unchanged
strict band/shoe front/rear/sweep sampler (all zero), full TypeScript check and
39-function scoped quality audit pass. Geometry is frozen pending fresh shaded
inspection and the composed standard/release; no raw-92 AI comparison is claimed.
