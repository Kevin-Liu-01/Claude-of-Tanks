# Namer IFV supplied-source detail repair

The independently reviewed source remains unchanged. This correction addresses the four concrete HOLD findings from the 14-view review: the paired round bodies beneath their raised cover, the open rear access lane, the continuous glacis and local driver fittings, and the differentiated turret roof equipment. It does not change the gameplay weapon configuration or infer a named missile from export node labels.

Source: `public/models/community-candidates/namer_ifv_x_source.glb`, SHA256 `72afdec001c1013a7a847a176adf12f0d00d1863f29874797448fdb66d174870`. Canonical axes, scale, translation and source-only cameras are retained. The runtime is authored from sparse scalar planes, sections and primitive dimensions; it does not decode or load the source mesh.

## Measured reconstruction

- The main bow follows the source's 13.3-degree upper glacis and 25.7-degree terminal fold. Held-out complete-source rays at `(X,Z)=(.33,1.47),(.61,2.19),(1.24,2.61),(.46,3.28)` reach Y `1.840349,1.670527,1.577135,1.383642` metres.
- Two closed rear shoulder wings extend to Z `−3.660`, around an approximately `.815` metre wide exterior access lane. Its actual closed door is near Z `−2.19345`; placing a sheet across the outside stern would incorrectly fill the lane.
- The rear turret roof has a recessed central channel with inner walls near X `±.307172`. A separate base and central web support the elevated cover and paired cylindrical stock. The cover is `17.8` mm thick and rises toward the front at `5.331` degrees. The cylindrical bodies have radius `.08376` metre and separate `.11193` metre rear collars. The source labels identify geometry only.
- Thin bent side blades, separate small pedestal hardware, four angled radar faces and two distinct optical cases replace the earlier broad generic roof assemblies. Source sections distinguish the port rolled crown from the asymmetric starboard receivers.
- Bow towing stock is an upright forged U shape, about `80×205×251` mm. The initial generic torus was incorrectly horizontal because the shared torus primitive already has a base rotation. Its two uncovered raster cells were **not** real source openings: complete-source rays hit metal at Y `.869126`. Sparse closed bent-stock sections replace those two pieces while retaining the upper throat; there is no continuity waiver.

## Body boundary and track adaptation

Fittings beneath the raised cover do not bound the turret body. The former broad fill boundary generated 82 boxes/984 triangles and projected one fill surface 24.5 mm into the source roof channel. The retained old generated record is replayed explicitly in private evidence; the initial full ray JSON was overwritten by a later diagnostic, so that replay is not represented as the original acquisition. A Namer-only fill boundary selects the complete primary `hull` and `turret` shells while keeping the complete gun and physical muzzle stock. All exterior equipment remains present in full-scene source, seating and continuity checks. Missing primary-shell tests continue to fail.

The source's static track is lower than the retained articulated native shoes. Their actual envelope reaches Y `1.254` metre. A narrowly scoped internal wheel-bay relief clears this native mechanism: over X `±1.065..±1.650`, its ceiling is Y `1.280` from Z `−2.040..3.154`, tapering toward Y `1.218` near the forward end; the aft wing transitions from the source underside near Z `−3.275` to the same ceiling at Z `−2.700`. The maximum main-bay lift is approximately 157 mm. The exterior glacis, roof, shoulders and side planes and central keel remain on their measured source datums. This underside is explicitly a clearance adaptation, not a claim of exact source underside reproduction. No running-gear matrices, shoe templates, wheel buffers or placement parameters are changed.

## Verification status

The independent critic actually inspected six immutable diagnostic comparisons and found all four prior visible blockers resolved at the existing 9/10 scoped bar. Those images preceded the internal wheel-bay relief and final tow correction. They are not final 14-view or Garage qualification. The parent integration task owns the final generated assets and independent review.

Private source calipers, original failed fills/tracks, immutable pilot images and native comparison records are retained under `.qa-dev/namer-final-detail/` in the isolated repair worktree. Final mechanical, source-fit, cost and preservation results are appended below after the candidate freezes.

## Frozen isolated verification

- Actual source geometry gate: **95.4/92 minimum**, dimensions100, floaters100; source-only registration unchanged. Fidelity aggregate97.0 and minimum valid view95.41.
- Loaded HIGH/LOW strict front, rear and full sweep: **zero band intersections and zero moving-shoe intersections**. The earlier dilated LOW diagnostic35 cells is retained separately; the unchanged exact strict path is the release check.
- Actual continuity scan: **zero enclosed unexpected cells**. The two false native tow openings disappeared through real source-shaped metal, with no classification exemption.
- Source assembly fixture: cold/loaded HIGH/LOW,15 finite joints per build; rear-lane closure, roof-fill intrusion, cover thickening and missing-base negatives all fail as intended.
- Filled selected geometry at matched10m: HIGH **70,008 triangles/39 objects**; LOW **42,028 triangles/38 objects (60.03%)**. Existing80,000/85/75% limits are unchanged.
- Authenticated before/after native snapshots: all19 actual running-gear meshes per quality retain exact buffers, indices, material/texture descriptors, instance data and transforms. Gun stock is exact:6 HIGH and5 LOW meshes. Two fixed `hullTrackGuard` fenders were intentionally replaced with source-shaped body/flaps and are not claimed as preserved gear.
- Scoped fill:4 boxes/48 triangles; every other generated Merkava-family row is byte-exact. The explicit former-record replay reproduces the24.5mm intruder while the current source wall remains exposed.
- Typecheck and body-policy regression tests pass. Six changed runtime/policy modules contain39 functions, zero strict complexity violations and no explicit `any`/`unknown`.

Final integrated anatomy, marking seats, presentation assets,14 canonical originals and actual Garage review remain the parent integration task’s responsibility. These isolated checks are not a full release or final visual acceptance claim.
