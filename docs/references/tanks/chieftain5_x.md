# Chieftain Mk5 X — owner-directed supplied-source rebuild

Status, 2026-09-06 23:44 UTC: the source-closures checkpoint passes every
registered source-fidelity view (raw composite **96.98655114842332**, minimum
whole view **94.18100126873912**) and geometry (**94.18100126873912**, dimensions
**100**, floaters **100**). Official band/shoe front, rear and full-sweep counts
are zero, and continuity is zero. The complete standard still **fails its
mandatory MG census**: the supplied model has no complete roof MG, and its
projector has not been falsely relabeled. Final anatomy/assets/release and
independent full-model visual acceptance remain pending.

This checkpoint corrects the source's oblique tapered cloth bag, actual rear
case with a concealed receiving overlap, and inclined inner-fender return.
The continuous native carrier now uses the measured 432.924 mm running web,
while retaining broad shoe solids, track lanes, course and all axle positions.
Source-fixed high/low air, surface, contact and articulation regressions pass,
as do unchanged strict CPU track checks in both LODs and full typecheck.
The fresh neutral board shows these bounded repairs seated; cloth/scalloped
casting relief, latch fields and source-warped fixtures remain simplified.
This is likeness to the owner-selected supplied file, not historical accuracy.
Exact local receipts are retained as
`.qa-dev/reports/chieftain5_x-source-closures-{fidelity,geometry}.json`;
the [scalar packet](chieftain5_x.supplied-build-scalars.json) records the
source measurements, original failure and remaining limits.

Historical status, 2026-09-06 23:19 UTC: the first independent supplied-file runtime draft
is wired and passes actual-ID high/low construction, focused source scalar,
optical/launcher air, wheel dish and articulation checks. It is **not qualified**:
the strict band sampler retains an inner-wall overlap rejection, and complete
source fidelity, geometry and shaded review had not yet run. The new
[scalar packet](chieftain5_x.supplied-build-scalars.json) records the approved
uniform frame, retained eleven source owners, measured datums and explicit
construction inferences. Old photo scores and acceptance are not inherited.
The historical profile survives only as `chieftain5XPhotoDraft.ts`, registered
process-locally by its unchanged historical tests, never by a playable loader.

Historical target decision, 2026-09-06 21:35 UTC: the owner explicitly selected the supplied Mk5
model as the reconstruction target too. The primary-photo draft below is a
historical checkpoint, not the current target or a source-qualified result.
The bounded [source-frame proposal](chieftain5_x.source-frame-plan.md) records
the original hash, material-batch ownership limits and a provisional single
uniform ruler. At that proposal checkpoint no canonical oracle, runtime
geometry or registration had yet been created. Numerical likeness to this AI-labelled file
must not be described as historical vehicle accuracy.

Historical status, 2026-09-06 20:09 UTC: independent primary-reference reconstruction,
mechanically tested but not visually qualified. Earlier shaded reviews exposed
coarse casting, auxiliary equipment and wheel/optic forms. The latest wheel
and optic corrections await fresh shaded review; final anatomy and composed
release remain pending. No raw-92 score is claimed against AI media.

## Historical primary-photo reference scope

The supplied `chieftain_mk-5_main_battle_tank.glb`, SHA-256
`a7cb7c9ab877635d204f96f359e84f2da8b59298bf09f2eeaeeecd4205725169`,
is an unreliable AI model. In the primary-photo phase it was supplementary
material, not a metric oracle. The later owner decision changes the chosen
likeness target, not that provenance finding or its local-only restriction.
It contributes no runtime geometry, topology, sampled contours, textures or
playable loading path.

[U.S. Army Worldwide Equipment Guide, September 2001, printed 4-7](https://upload.wikimedia.org/wikipedia/commons/5/53/OPFOR_Worldwide_Equipment_Guide.pdf#page=136)
explicitly labels its table Chieftain Mk5 and gives 7.48 m chassis length,
3.51 m width and 2.90 m reported overall height. The last value is not treated
as armor-roof height. The table also confirms two six-cup smoke banks and an
infrared searchlight. Its upgrade discussion mixes later sight configurations;
this reconstruction does not infer Mk10 Stillbrew or TOGS from those entries.

[Alan Wilson's original August 24, 2017 Kubinka photograph](https://www.flickr.com/photos/ajw1970/37900660042)
was inspected directly. It identifies a Mk5/5P export vehicle: useful evidence
for the bare cast turret, paired lamp boxes, curved front guards, fender storage,
six-cup carrier and older searchlight case, but not proof that every export
fitting was standard on a British Mk5. The Duxford “Badger” photograph was
not substituted because the photographer's variant identification is ambiguous.

The original MoD
[Chieftain Armament, Pamphlet 33, 1980](https://www.military-references.com/wp-content/uploads/books/tanks/britain/chieftain/Chieftain_Tank_Armament_Pamphlet_No_33_1980.pdf)
independently describes the No.9 Mk1 smoke discharger as one casting containing
six cups (printed page 215, physical PDF page 173). Its scanned public copy has
SHA-256 `03d4956285f00d19f7154d65fdfc8db8f81dddad73cdf094c0d80296736f82f5`.
It remains in ignored research storage; historical document markings are not
a claim of redistribution permission or declassification. Only external
equipment description was used, not operational instructions.

## Historical photo geometry and limits

The historical `chieftain5XPhotoDraft.ts` independently constructs its own closed hull, bare turret
casting, rounded/segmented front guards, five skirts per side, fender cases,
engine louvers, driver hatch, lamp guards, crew fittings, native paired-bogie
gear and L11 barrel. It does not call the existing Chieftain, Mk10, Challenger
or another vehicle builder. Shared native gear and generic closed-section
primitives are first-party construction tools.

The 2.45 m structural roof, 10.80 m complete gun-forward length, 0.508 m
clearance, yaw `[0, 1.61, 0.53]`, trunnion `[0, 2.035, 1.69]`, muzzle Z 7.06 m,
wheel/end/return-support stations and small equipment dimensions are explicit
photo-led construction estimates. Their decimal precision is deterministic
assembly, not millimetric measurement of the photograph. The bare casting and
plain searchlight fit still require independent multi-view visual refinement.

The gunner sight, driver optic and searchlight have real approach air and
separate recessed glass. The main gun has an actual 120 mm open bore; its
roughly 319 mm visible depth is an inferred construction dimension. Each of
the twelve smoke cups is open with a recessed back and a shared cast carrier.
The roof MG has a short inferred radial foot physically overlapping the hatch,
rather than an upright floating above the sloped cupola edge.

An initial coarse forward hull shoulder intersected the native end course.
The draft now tapers the lower central bow inside the track lanes while
preserving the independent broad upper guards; no axle was moved and no
structural part was excluded from the strict check. The same rounded native
course drives both belts and rigid shoes, avoiding a below-ground sharp knee.

## Historical photo-draft physical checks

- `src/vehicles/profiles/chieftain5X.selftest.mjs` passes actual-ID high/low
  envelope, three true apertures, all twelve smoke stocks/approach-air rays,
  main bore, supported MG foot and legal yaw/pitch/recoil ownership.
- All 48 opposing-scroll phases retain loaded-shoe ground contact within
  0.1 mm, with unchanged six-wheel paired axle stations and geometry census.
- The unchanged committed strict track sampler, executed CPU-only through
  the ignored adapter, reports band/shoe front/rear/full-sweep overlap 0 and
  no anomaly. Actual-ID verification is recorded separately from the initial
  in-memory pre-registration construction probe.
- The focused source-quality scan reports 28 functions and no complexity or
  explicit-type violations.

These are construction checks, not source-mesh qualification. Primary-photo
shaded review, remaining shape/equipment corrections, gameplay bindings,
generated anatomy and final release receipts are still required.

## Bare-casting revision — historical authoring checkpoint

The independent primary-photo review found a genuinely flattened forward
casting and a ruled rectangular cradle in the first clay draft. The original
replacement now uses rounded transverse cast sections with monotone curved
longitudinal stations and a rounded, permanently supported pitch-owned
cradle/canvas envelope. It retains the 2.45 m roof maximum, bearing, gun axis,
muzzle, rear station endpoints and all chassis/track geometry. The forward
cheek section depths are photo-led construction estimates, not a scale
measurement from the angled Mk5/5P photograph. A held-out lower-cheek ray and
an actual greater-than-7 mm driver/periscope clearance are tested at both LODs.

The fuller cheek initially intruded 7 mm into the inner smoke stocks; radial
checks exposed up to 36 mm of interference near the lowest stock edge. Each
complete six-cup bank is now seated 40 mm along its existing axis, with its
permanent support extended and its carrier moved forward to overlap the tube
roots. Actual front annuli close the cup wall edges. All 96 radial bore rays
reach the unchanged recessed stock depth without hitting the cheek. Existing
driver, gunner and searchlight air, chassis envelopes, all-phase ground and
gun articulation checks remain intact. No shallow painted cavity, gate
waiver, AI measurement or Stillbrew/Mk10 geometry is used. Coaxial/ranging-gun
exterior details and fine cast texture remain simplified; this remains an
unqualified primary-reference reconstruction pending fresh visual acceptance.

## Auxiliary exterior forms — 2026-09-06 authoring checkpoint

The public MoD Armament Pamphlet No.33 (1980), printed p40, establishes the
left-of-main-armament ranging gun on the gun cradle. Printed pp69–70 place
the coax mounting above that cradle with an external flexible sleeve. The
new `chieftain5XAuxiliaryMounts.ts` authors only those visible forms: a supported
left receiver boot and projecting narrow tube, plus the short tapered upper
sleeve and coax tube. Both retain real annular muzzle mouths and recessed
backing. They pitch/yaw with `gunMount`, but do not incorrectly recoil with
the independent main barrel. No additional firing mechanics or combat values
were introduced.

The receiver/sleeve dimensions and exact stations are photo-led construction
estimates. Only their documented assembly relationships and visible form are
claimed. The original main cast shape, roof, trunnion, muzzle, tracks and all
other models are unchanged. Actual high/low tests verify eight radial rays
per small bore, their metal rims, real cradle support and main-recoil
independence across legal pitch/yaw poses. The original Mk5 geometry test,
strict front/rear/sweep track clearance, typecheck and focused complexity pass.
Fresh clay views show both positive, attached forms, closing their prior
complete omission. Detailed canvas folds, fasteners, wheel faces and subtle
casting curvature remain simplified; this is not overall visual qualification.

## Pressed wheels and real optic frames — 2026-09-06 20:09 UTC

The retained Kubinka photograph supports a recessed pressed steel wheel face,
not the prior broad proud radial ribs. `chieftain5XWheels.ts` independently
authors a continuous closed two-sided bowl with a localized bearing hub. Its
depths remain construction estimates: the available angled photograph cannot
establish a millimetric radial section. No Mk10 wheel profile or AI surface is
reused. The established 0.395 m tire radius, 0.40 m tire width, rubber shoulder,
0.3555 m steel-rim radius, all twelve axle centers and the entire moving
track/end-wheel/return-roller course are retained. The hidden filled rubber
center is replaced by an annulus positively overlapping the steel lip. The
native suspension links automatically seat behind the new real wheel surface;
their strict clearance is independently checked, not waived.

The public MoD pamphlet, printed pp124–127 and Figure 44, directly depicts the
No.37 Mk3/4 commander's sight with its forward-inclined object reflector and
retaining frame. `chieftain5XOptics.ts` replaces only the earlier plain upper
box with supported side cheeks, an inclined transparent backing and a real
front recess, inside the existing optic envelope. The original nine cupola
window stations now have physical four-sided frames, dark inner backing and
recessed glass instead of opaque black cuboids. The lower sight seat, upper
cap, cupola, hatch, supporting MG foot and roof-height datums are unchanged.
Only the head above the roof is represented; the manual's internal operating
mechanism was not implemented. Frame dimensions and hidden depths are
explicit estimates, not measured from the illustration.

Dedicated `chieftain5XWheels.selftest.mjs` and
`chieftain5XOptics.selftest.mjs` pass actual-ID high/low geometry, whole-scene
air, positive steel/rubber seating, wheel spin, disposal and turret ownership.
The wheel test compares every non-wheel physical geometry buffer and moving
matrix with the old native face recipe; track paths and axle datums are exact
matches. Existing Mk5 apertures, twelve smoke stocks, legal gun poses and all
48 opposing-scroll ground phases remain passing. The CPU strict sampler
still reports front/rear/full-sweep band and shoe overlap zero. Focused quality
metrics cover 38 functions with zero violations. Fresh neutral details and
actual camouflaged gallery hero/right/rear views were inspected on
2026-09-06 at 20:40 UTC. The pressed bowls, inset cupola glazing and inclined
reflector remain visibly distinct in normal appearance rendering; no new
floating support or filled aperture was observed in those additions. Broad
stowage and roof-fixture fields still read simply, and photo-derived bowl
depth is not independently measurable. This is a bounded detail review,
not overall visual acceptance. The final composed release remains pending;
fine casting texture, local latch relief and unobserved rear equipment remain
acknowledged simplifications.
