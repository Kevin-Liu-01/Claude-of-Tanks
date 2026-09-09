# Merkava Mk4 X — finite upper end-fender returns

Status: **corrected physical/native checks passed; composed release pending**,
2026-09-08. This is a separate
checkpoint from the Mk3D front return. No existing roof, wheel/axle, track,
rubber flap, rear cover, turret or gun geometry changes are intended.

## Source-backed diagnosis

The existing [source packet](../references/tanks/merkava4_x.md) documents the
owner's comparison-only model and its canonical unposed frame. The exact local
GLB used for this study has SHA-256
`df149523e3cb85d6383d2a9bc78845faa653334fb4e2d88f57754b7da9eaa41b`.
No source buffers or topology are imported into the playable model.

The current native HIGH-winter front-left/left/rear-left views visibly expose
the end wheels. The archived source-clay board shows greater front bodywork
coverage; neither that older score nor the historical description of exposed
running gear proves the present opening is intentional.

A bounded independent study casts 224 transverse rays at both sides and ends,
then measures actual HIGH/LOW native body parts and complete neutral gear.
Its deliberately untracked receipt is
`cot-merkava3d-front-return-20260908/.qa-dev/merkava4-end-fender-study.json`.
The source is fused, so these are finite physical surface samples, not invented
disjoint source component masks.

| Region | Source stock | Native before |
|---|---|---|
| Front Z 3.05 / 3.15 / 3.25, Y .95 | Tapered side X ±1.86385 / 1.83369 / 1.80364 | Ray reaches inner hull near X ±.98 |
| Front Z 3.35–3.65, Y .95–1.05 | Thin outer/inner sides X ±1.77939 / 1.77032 | No outer skin |
| Rear Z −3.55 to −3.05, Y 1.25–1.45 | Broad high side near X ±1.77032 | Narrow/sloping core near X ±.98–1.63 |
| Right rear Z −3.46 to −3.376 | Real recessed side plane X 1.74205 | Recess must not become a symmetric outer box |
| Rear below Y 1.15 | No broad outer side skin | Preserve this lower air |

The front source's lower edge rises from approximately .641 at Z 3.018 to
.836 near Z 3.39; it is not a level full-height skirt. The native front roof
is already locally about 80 mm higher than the source face. That inherited
roof difference is retained and explicitly not disguised as identical source
geometry. The rear source lower edge is approximately Y 1.1803.

Actual neutral native front end-drum |X| reaches 1.74886, hardware 1.74376;
the bands reach 1.718 and both near/far shoes 1.70978. Rear end-drum |X|
reaches 1.69952. These are actual finite neutral bounds, not an all-pose
clearance certificate or permission to ignore the rotating stock.

## Bounded candidate

`merkava4XEndReturns.ts` constructs six first-party finite parts:

- Two 12 mm front side skins, tapered from X ±1.8734 to ±1.784, with a
  narrow flange embedded 2 mm into the unchanged guard roof.
- Two 72 mm-wide outer front corners with exactly the existing rubber flap's
  rake. They lap that flap without spanning the track mouth.
- Two high rear side returns with a fixed Y 1.180 lower edge, retaining all
  source air below 1.15 m. The real right-side recess is retained; a short
  forward taper meets the existing wider last skirt.

The fitted front hem rises .680→.840 and ends at .820, retaining the lower
wheel aperture. The constant forward side is about 5 mm outboard of the
source; the high rear skin/recess is about 10 mm outboard. The native roof
and last-skirt widths control the small receiving flanges. This is an explicit
fit to current moving primitives, not an assertion of identical source skin.

All new parts use camouflaged `hullTrackGuardL/R`, hull ownership and nonArmor
classification. The original rubber flaps remain distinct. In particular,
this checkpoint does not hide the rear wheel by extending a broad panel down
to the rear flap; its inherited attachment is not newly certified here.

## Qualification and retained limitations

The focused test authenticates the complete prechange profile after removing
only the new helper import/call, and compares every retained authored part
and actual native gear buffer. It checks closed positive folds, finite roof
and skirt overlaps, source-open lower regions, the right rear recess, whole
vehicle bounds, near/far and merged gear, and conservative reverse-containment
rejection in actual sampled motion. It is not a complete-terrain or continuous
time certificate.

The first test attempt caught a receiving-ray coordinate 0.3 mm outside the
new flange at Z 3.02. That failed witness remains in the session output; the
probe was moved to the interior of that same finite flange without changing
runtime geometry or its required 1–4 mm embedding interval.

The next attempt exposed a second fixture assumption: the retained last
skirts are rounded primitives, not full rectangular solids at their nominal
corners. Contact now selects each exact pre-existing receiving skirt and
requires a positive overlap of its actual finite entry/exit interval with the
new skin at multiple stations. It no longer equates the nominal box boundary
with occupied material; no receiver geometry or contact clearance is changed.

A third attempt confirmed that the nominal rounded corners at front Z 3.000
and rear Z −2.979, Y 1.240 really contain no old stock. These failed rays are
now explicit negative witnesses, not deleted failures. Contact uses three
lower levels (1.190, 1.205, 1.220) and requires more than .5 mm overlap of
actual old/new entry–exit intervals. All three fixture corrections retain
the identical runtime helper SHA-256
`77fbe7b4aa75508540f03f2489066393582a6327200a7f26a00469e40c624772`.

The focused HIGH/LOW run passed: six closed finite parts per build, 276
receiving contacts, 24 original gap witnesses, two inboard-stock negative
controls, and 520 actual sampled poses. These included 237,896 merged or
instanced stock evaluations across both near/far shoes, both deforming bands,
road tires/discs/insets, suspension links/bosses and end-wheel body/hardware.
The conservative broad phase rejected 236,660 disjoint bounds, 1,220
reverse-containment cases were excluded by actual occupied-fold bounds, and
24 remaining finite triangle checks passed. Four terrain requests include
compression and droop, with 65 track phases each at both details. This is
sampled actual finite-stock evidence, not an all-terrain/continuous-time proof.
Every retained authored part, actual running-gear buffer and whole-vehicle
envelope remains unchanged; lower air, right recess, camo/nonArmor ownership
and spent/reset ERA persistence are checked on the actual candidate.

### Preserved precursor native evidence — superseded for current geometry

The exact four maintained, QA-adapted `fixed-paint-native` driver files from
the parent bodywork review rendered 16 before and 16 after images: 15 m,
HIGH/LOW geometry, HIGH texture, factory/winter, front-left/rear-left/left/right,
1200×800, seed 4242. Both receipts have unchanged input fingerprints and
eight finish pairs PASS. They are actual procedural WebGL frames, not clay,
geometry-receipt renders, Gallery click-flow timing or a fabricated score.

- Before: clean `4831d43d05d700da3336f93a58fcf8eb31ad2f4d` control tree,
  `.qa-dev/mk4-end-before-native/tank-assets.json`, input
  `a4d86d4d727218942381d71344f426059126fa6a8e988898380a4ba571da8b53`.
- After: candidate tree `.qa-dev/mk4-end-after-native/tank-assets.json`, input
  `0a762b1dcc1bbc190f79d71a1bba95facf8fe856f272d4859ece9ca20f2529f9`.

The author personally inspected all eight after HIGH-winter/LOW-factory
views plus matched before HIGH-winter front-left/rear-left/left. Upper front
and rear corner openings are visibly covered by fitted painted stock; lower
end/road wheels remain visible. The front rubber flap and brown kit remain
distinct. No new visible float or z-fighting was observed at these views;
the complete gun and antenna tips fit inside the frame. Inherited flat-looking
wheel faces, track style and the retained lower rear opening remain separate
work, not claims of completion from this bodywork slice.

Subsequent exact-plane review found that the short corner's original
.235×.045 m height/depth duplicated the receiving rubber flap's top/bottom
and front/back planes over a 13 mm-wide inner lap. No z-fighting was visibly
resolved by those distant screenshots: their observation is not evidence of
absent coplanarity. The original receipts above remain available and are
**superseded** for current runtime geometry.

The correction expands only the new 72 mm-wide corner to .239×.049 m at the
same centre and rake: a finite 2 mm cap on each local Y/Z plane. The old
rubber flap is untouched. The strengthened test recovers all six planes from
actual emitted triangles, requires every parallel cap/receiver plane to be
more than 1 mm apart and requires more than 40 mm actual finite entry/exit
overlap. Both the original cap and a depth-only correction must fail this
test; the latter demonstrates why merely separating front/back is insufficient.
Complete lower-air and moving-stock assertions remain in force.
Corrected helper SHA-256:
`28c6b33721161a0c601b1e561a58c635e6d0c242b4be45a7fce6a67ba66da39d`.

Actual native submissions rise HIGH 80,582→80,950 and LOW 75,526→75,894
triangles: **+368 triangles and +2 calls (42→44)** per tank. This is an
explicit finite bodywork addition, not a performance improvement.

The precursor passed the existing shoulder returns, rear folded hull,
Western X geometry, Western X ERA binding and fleet mudguard registration
tests, typecheck and public build (174 procedural playables, zero GLB-sourced).
Current corrected results are recorded below when complete.
Full anatomy update/check and targeted composed release
belong to the parent's final combined tree and remain pending; no inherited
budget failure or previous unrelated receipt is a waiver.

### Corrected current evidence

The new HIGH/LOW physical run passed all 276 contacts and 24 old gap
witnesses, with 48 actual parallel-plane pair separations and ten negatives.
All 520 poses passed complete finite-stock checks (237,896 native instance
evaluations, 24 finite triangle tests and 1,268 conservative reverse-containment
exclusions). The slight growth does not change old stock, whole bounds or
the protected lower wheel-mouth air.

The corrected receipt is
`.qa-dev/mk4-end-cap-corrected-native/tank-assets.json`, input
`990001a7cf24eb81128cfa8e9711591510901567a9156ccff6ba42d773781615`
unchanged through capture. All 16 fresh native images and eight finish pairs
PASS. All eight HIGH-winter/LOW-factory front-left/rear-left/left/right images
were personally reviewed: fitted upper coverage, open lower wheels, camo,
rubber/kit separation and complete framing remain. The actual finite-plane
tests, not these 15 m pixels, establish the 2 mm cap separation. Submission
counts remain HIGH 80,950 / LOW 75,894 triangles and 44 calls.

Fresh corrected `npm run typecheck` and `npm run build:public` both PASS,
including the 174-procedural/zero-GLB public registry probe. The existing
large-chunk warning remains. Composed anatomy/release is still pending.
