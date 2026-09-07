# K1A1 X — independent source-measured rebuild

2026-09-06. **Photo-led roof-weapon addition rejects unarmed-file shape gates; owner choice pending. Final release pending.** Existing `k1a1` is
unchanged. Runtime authoring is in `src/vehicles/profiles/k1a1X.ts` and
`k1a1XRoof.ts`; it does not call an old family builder. The source is a
local-only comparison oracle, not playable geometry or a redistributable asset.

## Immutable source and coordinate contract

- Owner-supplied `k1a1-armored-warfare.zip`: SHA-256
  `d2e8eeb7d828b2cff23ee78d54657ebf97935f430151741f4dab8a23cbb6a96d`.
- Nested OBJ: SHA-256
  `7c55e7f54f0f7d59247e1559b92fc1db82952191566ef5504fd78dcde9df6d93`.
- Root-authored ignored canonical GLB: SHA-256
  `16280a971fc1364dfda606e236d4d5cce214ab73112121c02845123c8bc03a46`;
  receipt `.qa-dev/reports/k1a1-x-canonical.json`.
- Transform is unit scale and translation `[0,.0159,.0205]`, preserving
  original +Y up/+Z forward and the structural-hull longitudinal center.
- Standing owner ruling allows local-only measurement of this
  provenance-inconclusive AW-series input. No source vertices, indices,
  textures, material buffers, rigs or source topology ship in the runtime.

| Source datum | Canonical metres |
| --- | --- |
| Structural hull length | 7.627 |
| Full length, including forward fitting | 9.72264 |
| Width, including small forward hinge tips | 3.6758 |
| Main turret structural roof | 2.20756 |
| Highest actual whip fitting | 4.07025 |
| Chosen yaw axis in measured ring | `[0,1.49566,.42564]` |
| Gun pitch datum | `[.0352,1.81797,1.57716]` |
| Bore terminal | `Z5.9052399` |
| Separate forward MRS fitting | `Z5.9091399` |

The OBJ has no rig nodes. The yaw axis uses the measured ring plan center and
midplane. Bore X/Y are directly measured circular-axis datums; pitch Z is an
explicit inference at the rear boot, not a falsely recovered trunnion.

## Independently supported running gear

Exactly one native course uses six measured axle stations
`[-2.157,-1.2769,-.4408,.5487,1.6046,2.5251]`, wheel radius`.3313` and
Y`.3978`. Front idler is`[Z3.2984,Y.8305,R.3313]`; rear sprocket is
`[Z-2.8851,Y.81225,R.39725]`. They were not shifted to clear armor.

The native links now use the measured source tread-body and inward-guide
depths rather than the generic thick default. Three real return rollers per
side sit at `[Z-1.9636,Y1.0256]`, `[-.1046,1.0259]`, `[1.6717,1.0141]`,
radius `.1245`, width `.2853`. The source's return skin floats roughly80–90 mm
above those rollers; that input defect is retained in the immutable oracle,
not replicated with invented higher supports. Native upper shoes are
mechanically seated on these measured rollers. Wheel/end-station datums do
not move.

Only the hidden shoulder underside receives a local rear wrap allowance;
source outer shoulders/deck remain measured. The native course uses a nominal
lower tangent `.0554`: actual full shoe vertices bottom at roughly2.4 mm,
inside the source flat skin's independently measured0–5.4 mm ground ripple.
There is no physical penetration; the simplified course stays within3 mm.
Rotated shoe AABB corners are more conservative than the actual triangles
and are not reported as a physical ground witness.

CPU execution of the unchanged committed strict track audit closures on the
actual `k1a1_x` factory gives front/rear/full-sweep band=0 and shoe=0, with360
native shoe instances. This is a CPU precursor, not a substitute for the final
official browser release gate.

## Geometry and negative space

The narrow closed lower tub, separate center beak, six changing skirt panels,
folded side mudguards, asymmetric turret cheeks, rear boxes, open bent cage
and eight independently folded stowage bags use original parametric solids.
The center hull really ends before the longer paired mudguards: the forward
center air is retained instead of flooding the complete guard envelope.

The two roof weapon yokes are empty in this particular supplied source. The
initial source-matched stage retained supported bare yokes and actual open
tray slots. The later photo-led addition below is a deliberate difference,
not a claim that the weapon existed in the file. Source smoke launchers explicitly have caps;
they must not be presented as source-open bores.

The commander sight's opaque island alone gives a misleading deep hollow.
The full source includes two glazing groups. At`X-.811/Y2.44`, the first
source glazing plane is`Z.465072`, with the inner pane near`.453658` and the
housing lips ahead. The draft's false deep opening was replaced with a tapered
round housing and the true shallow glazing recess. Tests use the full source
first-surface witness, not the opaque island in isolation.

The main cannon has an eccentric evacuator, not a concentric long taper.
Independent scalar sections preserve its axis and crown while locating the
actual stepped collars, short swell ramps, fore-jacket end and MRS fittings.
The boot retains its measured downward/upward folds and full transverse width
to the thin forward return. Cannon parts remain recoil-owned; the physical
pitch bearing/boot and offset coax seat remain gun-mount-owned.

Round-three source-section work corrected the actual asymmetric forward
cheeks, diagonal right pouch, rear mudguard folds, permanent annular hull
collar and bent cage. The cheek crown is bounded by independently measured
roof, outer-bevel and nose planes; the old coarse wedge was68–102 mm wrong at
held-out crown rays despite a close plan mask. New actual high/low rays are
within8 mm at ten held-out points. The right cloth pouch follows its diagonal
fold instead of filling an axis-aligned box roughly200 mm too far aft.

The complete source cage contains two sagging tie cables in
`vehicle#k1a1_cage_turret_12_1`, plus narrow upturned attachment clips. The
former frame-only oracle incorrectly declared `[X.11,Y1.86]` and
`[X.38,Y1.83]` empty. They are now positive cable checks at rear first surfaces
`Z-2.470823` and `-2.471500`; genuinely empty neighbors remain tested. Cables
and clips remain visible, attached, turret-owned semantic open lattice, not
excluded from source silhouettes or physical track audits.

## Current evidence, deliberately retaining failures

First source-world fidelity capture,2026-09-06T12:43:49.595Z, reports composite
94.02 but **FAIL**: turret91.8919129383 and gun86.0590429818;
turret right88.6024109467 and left89.9993761579. Whole96.19, hull96.15 and
tracks95.10 do not waive those failures. The initial neutral board also shows
missing bare yokes and an incorrectly rectangular sight. Source-measured roof
and gun corrections followed. Round-two fidelity passed at composite97.02
with all registered valid floors at least92; geometry still failed.

Round-three geometry, before the final cheek/pouch/cable correction, reports
hull95.7323742099, whole92.0149866093, turret90.8431331721,
stations99.1300408034 and dimensions88.8910944602. The turret failure remains
recorded, not averaged away. The dimension discrepancy is a separate metric
target issue: physical source width3.6758 includes small hinge tips, while the
gate's fixed column filter measures source3.599614 and candidate3.589359.
Root owns the reference-only filtered-width datum declaration; no candidate
rescaling or physical-width reduction is authorized to hide this distinction.

The final physical correction is the source's six-sided stepped whip. Its
lower collar ends near Y2.884 and the narrow upper stalk tapers to the unchanged
Y4.07025 tip. Five independently measured transverse sections remain within
0.08 mm, and a held-out off-axis X0.41 column now ends near source Y3.653053
instead of incorrectly carrying a thick rod to full tip height. No mast anchor
or overall height was moved to change a score.

Historical pre-wheel-refinement and pre-photo-weapon checkpoint: the then-current
scoped geometry report passed at raw minimum92.75661199523556: hull95.73237420985006,
turret96.31984175274297, whole92.75661199523556,
stations99.13004080339716, dimensions100 and floaters100. Ordinary fidelity
also passed at that checkpoint. These are not the results of the current
`docs/geometry-gate/k1a1_x.json`; earlier development results remain preserved.

Current photo-weapon revision: `docs/geometry-gate/k1a1_x.json` fails at raw
minimum78.03745318352055 (hull96.0256288109756, turret80.4228811782873,
whole85.10929572248108, stations93.48154552617346,
dimensions78.03745318352055, floaters100). Its fixed-ruler height is
2.840454164994881m versus source2.737910693334416m (+3.7453183520599307%).
The immutable `.qa-dev/reports/k1a1-photo-weapon-fidelity.json`, generated
2026-09-06T20:56:50.399Z, also fails: turret.right90.26863207711244 and
turret.left90.79449883607457 are below92 despite aggregate96.56142136310707.
The photo-led roof weapon conflicts with the unchanged, unarmed supplied
source. That owner decision remains unresolved; no current source-shape or
complete release pass is claimed.

Pre-wheel-refinement frozen profile SHA-256 was
`0f1724ae7b8b1a67a6c47b356af502a341a283f5ca07791a9e0ca82475cb271d`;
roof helper is `44b584db608114ff384698477697f83f82ccdaaca6682142429fb45fc6159127`.

Focused high/low actual-ID tests are in
`src/vehicles/profiles/k1a1X.selftest.mjs`. They cover source hull/fender rays,
center prow air, real cage slots and rails, full-scene sight glazing, actual
gear datums/contact, forward cheek planes, pouch folds, and pitch/recoil ownership.
Typecheck and the authored complexity gate (90 functions, zero violations)
pass. Full immutable view receipts, independent shaded review,
anatomy regeneration and official release evidence remain required before
final acceptance.

## Actual wheel-dish correction after shaded review — 2026-09-06

The passing silhouette did not expose a substantial interior-surface error:
generic star-pattern faces projected about98mm too far outward at the hub,
and over140mm at a held-out dish ray. The complete hash-pinned source's third
axle nodes `vehicle#k1a1--k1a1_3_20` and `_3_21` give mirrored first surfaces
at |X|1.39538119 for radial100mm,1.39702179 for150mm,
1.40598663 for250mm,1.49047161 for275mm and1.50920727 for290mm.
The actual small hub tip is |X|1.51320004. This is not a tire-size error.

`k1a1XWheels.ts` supplies independent turned metal solids with a recessed dish,
rolled rim, twelve-sided short hub and inboard support cap. The retained native
tire radius,width,all road/end axle stations and complete moving track course
are unchanged. The source tire center differs from the pre-established native
axle by about4mm; the original native rubber envelope is deliberately preserved.
Only its hidden filled center opens around the steel rim. The1.1mm concealed
steel/rubber overlap is an assembly allowance, not a source-exact measurement.

The high/low `k1a1XWheels.selftest.mjs` checks20 independent whole-source
hub/dish/rim first-surface witnesses within0.6mm, true approach air, all12
moving native faces, exact tire-frame ownership, strict arm clearance, disposal
and byte-identical non-wheel geometry before and during opposed track scroll.
The original K1A1 geometry/aperture/pitch tests still pass. The previous scoped
source scores above are historical evidence; fresh source/neutral/full-standard
proof is queued for this corrected revision and is not presumed to pass.

## Operating roof weapon, distinct from the unarmed comparison file

The fresh wheel revision passes raw source fidelity97.5 and geometry minimum93,
with dimension/attachment components100 and strict track/continuity zero. The
official standard still failed because the supplied OBJ has two bare gun
cradles, not a fitted roof machine gun. No empty cradle has been relabeled as
a weapon, and the absent-MG rule has not been waived.

The independent operating addition in `k1a1XMachineGun.ts` is informed by
[DVIDS3912303](https://www.dvidshub.net/image/3912303/1-5cav-and-roka-combined-training-exercise),
VIRIN171012-A-KM000-001, photographed by Pfc.Seong Joon Kim on12October2017.
It shows the tank's supported heavy roof gun, perforated jacket, feed box and
existing canted arm. This photograph establishes arrangement, not survey-grade
dimensions: the new weapon's scalar sizes are explicitly authored estimates.
The immutable comparison GLB remains unchanged and still has empty cradles.

The original measured left yoke is retained. A cross-pin engages both its
bearing cheeks and a receiver bridge; the ammunition tray physically joins
the receiver. Thirty-two actual jacket apertures expose a separate straight
inner barrel, and the12.7mm bore has227mm of open depth before its closed back.
The right source cradle remains bare. The entire fitting follows turret yaw,
not the main gun's independent pitch/recoil. Existing source armor, optics,
wheel and track datums stay unchanged.

Actual high/low source-body tests and the focused roof-weapon test pass, including
real yoke engagement, adjacent tray air, open jacket holes, straight stock/bore
and yaw ownership. The former empty central cross-pin witness is intentionally
occupied by the new physical pin; the retained tray still has air beneath it.
Fresh full-source silhouette/geometry/standard evidence is queued, not assumed.
