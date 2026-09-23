# Second source-study X fleet — work contract

Status: **Mk5-derived Mk10 implementation and scoped armor integration complete; strict qualification rejected; not release-ready**.
Baseline: `c26b3194200f52bebdee6a2ea339cd18d5e82d89`.

## Owner-authorized as-is publication — 2026-09-07

The owner approved publishing this entire 23-model batch in one commit to
`origin/main`, with the seven documented release-gate failures retained.
This is publication authorization, not a strict geometry or release pass.
Source models, temporary QA files, and the separate new Abrams X family are
excluded. Integration preserves the newer upstream changes; the previous
quote's ten-commit divergence had grown to twelve at publication preparation.
The qualification failures and historical evidence below remain unchanged.

Post-rebase publication validation passed 24 focused regression tests, anatomy
freshness for all 174 playable receipts across 56 demand groups, scoped asset
freshness for all 23 models / 230 files (bore check not repeated), type checking,
the public build, and attribution. The upstream MBT-70 gun/launcher repair,
equipment-damage support, and all upstream test entries are preserved. Its
535 existing ammunition channels plus this batch's 69 are all exercised.
All 178 upstream asset records are unchanged, including the newer MBT-70
metadata. These are compatibility checks, not a new full `npm test` run or
a waiver of the seven strict qualification failures.

## Latest owner revision — Mk5-derived Chieftain Mk10 X

The owner now explicitly asks for the existing `chieftain_mk10_x` to be based
on the completed `chieftain5_x`. This supersedes the Mk10 visual freeze below,
but does not authorize changing Mk5 X, either original production Chieftain,
or adding another registry ID. Reuse the first-party Mk5 closed-chassis and
rounded-casting construction through explicit parameterized recipes; adapt
those recipes to the supplied Mk10 measurements. Do not overlay a complete
Mk5 model with a duplicate Mk10 assembly or globally stretch an assembled tank.
Keep the distinct Mk10 Stillbrew, gun/carriage, cupola/roof weapon, sights,
stowage and true negative spaces. Its supplied file still has SHA-256
`f8c1888e345742a5f9f65e877e51b55028d708e5cb42ab4392b5fbc21d1db2de`.
Its existing comparison oracle stays unchanged; all earlier Mk10 shape and
asset passes become historical checkpoints until the rebuild is recaptured.

The owner requested independent, separately selectable X models from 23 local
reference inputs. Originals and the preceding 13 X models must remain intact.
Combat metadata may be cloned; playable geometry may not be delegated to an
existing tank builder or loaded from these source files.

The owner explicitly requested two separately named Leclerc versions after
reviewing the shared-author relationship. `char_leclerc.glb` is **Char Leclerc X**
(`leclerc_x`); `leclerc_tank.glb` is the independently studied **Leclerc X**
(`leclerc_classic_x`). These are source-study names, not invented historical
variants. The two exports have materially different geometry/hierarchy and
are not interchangeable coordinate sources. This gives 23 separately registered
authoring additions. Registration is not a release or visual-quality approval.

| Registered ID | Name | Comparison source / current qualification |
|---|---|---|
| ariete_c1_x | C1 Ariete X | Source rear-closures proof raw97.8594/geometry97.3 passes, strict band/shoe0; standard retains 3 source-matching real openings and absent roof weapon |
| challenger1_x | Challenger 1 X | Supplied-file replacement wired; complete-source fixed-frame comparison rejected, orphan-part choice unresolved |
| leclerc_x | Char Leclerc X | Char Leclerc revision primary |
| leclerc_classic_x | Leclerc X | Older file independently built; final aft-fold proof passes raw98.5/geometry93.8, strict band/shoe0, continuity0, actual MG1; release pending |
| chieftain5_x | Chieftain Mk.5 X | Supplied-file source-closure proof passes raw96.9866/geometry94.1810, dimensions100, strict0/continuity0; absent roof weapon remains standard blocker |
| chieftain_mk10_x | Chieftain Mk.10 X | Final Mk5-foundation release comparison raw97.134546/geometry93.153760 passes; Mk5 preservation,174/174 exact-stock contacts, real air,41 focused tests,12 generated integration phases and actual gallery inspection pass; one source-real opening still rejects strict release (ymwZhS), without waiver |
| leo2a6_x | Leopard 2A6 X | Supplied GLB; independent A6 geometry, not A6M X reskin |
| k1a1_x | K1A1 X | Photo-led roof gun conflicts with unarmed source: turret views90.2686/90.7945 and geometry78.0374 historically fail; owner retains armed/photo target Sep11, qualification pending |
| strv122_x | Stridsvagn 122 X | Frozen supplied-cupola proof raw97.19449129124958/min-view95.96447231684961 and raw geometry minimum95.96447231684961 pass; strict0/continuity0/MG1; wheel-bowl/suspension clearance repaired and tested at both LODs; final integration pending |
| t62mv1_x | T-62MV-1 X | Supplied ERA-equipped MV source, not the later owner-modified obr.1975 donor |
| t72b_1987_x | T-72B obr.1987 X | Supplied folder |
| t72b3_x | T-72B3 X | Supplied nested archive |
| t72b3m_x | T-72B3M obr.2022 X | Source side-mount proof raw95.2039/geometry92.6710 passes; strict track0; continuity268 remains rejected (251 complete-source openings on the same grid) |
| t72bu_x | T-72BU X | Supplied folder |
| t80u_x | T-80U X | Supplied fused FBX; not the unrelated source used for the original |
| type10_x | Type 10 X | Supplied fused GLB; frozen source-only uniform registration, supplied proportion differences documented; scoped shape/track/continuity/MG checks pass |
| type90_x | Type 90 X | Supplied +X-forward GLB; frozen source-only uniform registration, supplied proportion differences documented; scoped shape/track/continuity/MG checks pass |
| jpz_e100_x | Jagdpanzer E 100 X | Fixed casemate source; exact file found in the Models directory |
| amx30_x | AMX-30 B X | Source aft-return proof raw96.1908/geometry92.9403 passes; both-LOD strict track0 and CPU continuity0; source contains two copies, first semantic vehicle selected |
| amx40_x | AMX-40 X | Supplied GLB |
| t90_x | T-90 X | Source underside/optic proof raw96.2047/geometry93.8417 passes; strict0/continuity0; absent source roof gun remains standard blocker |
| t90a_burlak_x | T-90A Burlak X | Source carrier proof raw96.5612/geometry94.9 passes; strict0/continuity0/MG1; original turret/gun/gear bytes preserved |
| t90ms_x | T-90MS Tagil X | Supplied folder |

## Non-negotiable acceptance

The fresh 2026-09-07 04:14 UTC shape checkpoint has **21/23** models passing both their
registered raw92 fidelity views and geometry floors. Challenger1 and K1A1
remain explicit failures. The complete machine-standard checkpoint passes
**16/23**, with the seven rejected IDs recorded below. This is not a fleet
release pass: absent roof weapons, unresolved open-channel census results and
correct gameplay armor are separate requirements. No source geometry, frame, camera or
acceptance threshold was altered to hide a failure.

| Rejected model | Retained failure |
|---|---|
| Challenger 1 X | Full-source silhouette and geometry; four orphan source panels below the true track ground; no roof gun |
| K1A1 X | Photo-referenced roof gun differs from its unarmed supplied model; two turret views and geometry fail |
| C1 Ariete X | Three real source openings conflict with continuity-zero requirement; no roof gun |
| Chieftain Mk.5 X | No roof gun in the supplied model |
| Chieftain Mk.10 X | One real source opening conflicts with continuity-zero requirement |
| T-72B3M X | 268 sampled openings; source-air comparison recorded, not a continuity waiver |
| T-90 X | No roof gun in the supplied model |

The final warning audit additionally found inherited JPz turret plates outside
the actual fixed casemate, plus donor auxiliary skirts/cheeks outside several
new native hulls. These are real shot-collision bugs despite successful visual
and calibrated-module checks. Main-shell calibration does not replace non-main
auxiliary armor. The existing passing integration run is retained as a
checkpoint, not used to approve those defects. Scoped auxiliary replacements
and post-fix validation are in progress. These auxiliary repairs preserve
visible geometry, the 2,694 source-bound ERA faces and all original fleet
records. The separate, newer Mk10 foundation request above changes only that
variant's authored geometry and therefore needs its own fresh receipts.

The JPz correction removes the phantom donor turret compartment and assigns
the real 48-edge mantlet cap to its actual pitching gun frame. Adjacent facets
on a declared continuous sheet share only coincident contacts; separate-depth
layers and different owners remain independent. Convex outlines are validated
for finite coordinates, planarity and convexity. A regression first reproduced
a 10-micrometre edge incorrectly accepting a shot 50 mm outside the face; the
new opt-in tracer now uses a physical 0.1-micrometre boundary tolerance instead
of a fixed cross-product area. The legacy quad intersection remains unchanged.

The seven-ID auxiliary subset is frozen at its 2026-09-07 05:21 UTC focused
checkpoint: all 14 high/low native scene fingerprints remain identical.
The warped Type10 skirt has 4,640 independent held-out ray checks with a
maximum 1.142 mm seating error against the strict 3 mm limit. Exact cut-edge
ownership gives the closed boundary to the outer cover and leaves only the
covered backing boundary half-open; no mesh edge is moved or inset. Free
panel edges, real inter-panel air and distinct-depth protection remain intact.
Twenty live stopping-hit events retain donor protection and damage values.
These focused results are not substitutes for post-freeze anatomy, complete
source comparisons, performance review or composed release qualification.

The subsequent exact-construction cache and conservative endpoint-bound
rejection are frozen with unchanged native geometry, contours, donor values
and 40,187 complete hit-result comparisons. A same-process, matched-layout
timing control measured Type10 at 196.222→99.373 microseconds per trace and
Char Leclerc at 38.261→20.297; all 756 timing-control hit results matched.
The two controls share the same original immutable data and differ only in
the optional conservative bounds. These are paired local measurements under
known host contention, not a full-game frame-rate or global performance pass.
An earlier structured-clone timing comparison is explicitly invalidated as
a performance comparison because its object/array layouts differed.

Permanent lesson for subsequent source-X work: inspect actual finite shot
segments against every retained donor auxiliary family, in addition to main
collision-cell and module checks. Removing every spaced plate is not a valid
shortcut: external skirts may not belong to the calibrated main cells. Replace
unsupported donor fields with the real exposed native sheet, preserve its true
gaps, retain its intended protection ratings, and do not charge nested backing
and an outer cover twice as one inherited protection layer.

The close-up/integration audit's Strv122 corrections are now frozen: its missing
non-weapon optical cupola is independently authored, and the concealed
suspension correction moves only inferred arms and joint bosses inward.
Source-measured wheel centers, wheel faces, end axles and track courses remain
unchanged. The 2026-09-07 02:05 UTC scoped proof passes raw fidelity
**97.19449129124958**, minimum registered view **95.96447231684961**, geometry,
strict track clearance, continuity and the actual-weapon census. The complete
23-model wheel/suspension/narrow-phase clearance audit also passes **46/46**
high/low builds. These checks do not resolve Challenger1's rejected
complete-source comparison or its detached-source-panel policy.

All 23 additions now have explicit marking anchors. The actual-ID
`src/vehicles/sourceXSecondWaveMarkings.selftest.mjs` passes both LODs: two
readable permanent footprints, all nine support/flatness and neutral visibility
rays, live/spent/reset ERA states, and correct hull/turret ownership under yaw
and pitch. External occlusion by another moving owner is not confused with
attachment; arbitrary-pose support and owner transforms remain mandatory.
T72B3M deliberately places its 240 mm insignia on the right and designation on
the left, on the two real permanent-tub gaps at X=+/-1.1509999809265137,
Y=0.9587388834357262, Z=-1.5853100113868712. The exact pair is pinned by the test;
the other 22 retain their explicit same-side policies. No armor, seat solver or
readability threshold was changed. All 151 pre-existing anchor records are
unchanged. Final anatomy, centering, paint-receipt and asset integration now
passes from this frozen state. The complete strict release remains a separate
requirement; those integration passes do not approve rejected source geometry.

The independent integration audit confirms 23 distinct native lazy owners,
including the four current supplied-file replacements, with no source/private
loader or historical photo draft in their runtime closures and no eager X
builder in the boot closure. A pinned-code comparison against the baseline
commit preserves all 178 pre-existing records, including the prior 13 X models,
in **356/356** exact high/low geometry-buffer and transform snapshots. No
regression baseline was updated. All 23 canonical hashes match their source-world
certificates; this certifies the comparison inputs, not current native
dependency, render or generated-asset freshness. The separate final public
artifact audit passes: all 23 private-source hashes are excluded, with zero
geometry/archive assets or forbidden paths across 3,060 built files. The
mandatory strict release sequence remains a separate requirement.

After the optical-module regeneration, a separate read-only comparison against
the same baseline also preserves all **151 pre-existing complete anatomy
receipts and 151 marking-seat receipts** exactly. Every nested value and array
order is retained; only object-key ordering is normalized for comparison.
Each dataset adds exactly the declared 23 IDs, with no removed or changed old
row. This protects legacy gameplay metadata as well as its unchanged visuals.

**Owner scope update implemented:** Ariete, Challenger 1, Chieftain Mk.5 and
Strv 122 now use independently authored supplied-file replacements, despite
the documented AI tags and geometric defects. Ariete, Mk.5 and Strv 122 pass
their scoped shape checks; Challenger 1 retains its complete-source rejection.
Their previous photo/manual-led drafts and checks are
historical evidence, not approval of these new rebuilds. Preserve the supplied
proportions in a single frozen uniform frame, explicitly report discrepancies,
and distinguish **supplied-file fidelity** from real-vehicle accuracy. Source
files remain private comparison inputs; first-party runtime geometry remains
independently authored. No numeric floor, pose/contact check, or source
ownership rule is relaxed by this explicit visual-target decision.

Earlier checkpoint: the initial 22 drafts were integrated. Fifteen had passed
their scoped raw92 silhouette and geometric gates: Leopard2A6 X, K1A1 X,
AMX-30 B X, T-62MV-1 X, T-72B obr.1987 X, T-80U X, T-72B3 X, T-72B3M X, T-72BU X,
Type90 X, Type10 X, Jagdpanzer E100 X, T-90MS Tagil X, T-90A Burlak X and AMX-40 X.
These passes are not final release certification. All other drafts retain
their failing/unqualified status at that earlier checkpoint. The current
rows above supersede historical failures below, not the release requirements.
Burlak's complete-source whole-model gates
pass. K1A1's source-measured wheel-dish correction passed fresh shape gates,
but its subsequent photo-referenced roof gun fails comparison against the
unarmed file: turret right90.26863/left90.79450 and geometry78.03745. That
difference was pending owner choice at that checkpoint. The Sep11 armed/photo target decision below resolves that choice; it does not waive silhouettes.
Burlak's fused source ownership is not fabricated into component scores.
Type 10's measured roof-cover/lifting-rail revision now passes fresh fidelity
and geometry93.6; T-80U's source-dished wheels pass fresh fidelity and
geometry94.6. Both have zero strict band/shoe intersections, zero continuity
holes and one actual recognized roof weapon. Their complete release remains
pending. Char Leclerc X's combined rear-shoulder/track-link revision now passes
all registered silhouettes, geometry93.4, zero strict band/shoe overlaps,
zero continuity holes and one recognized weapon. Historical intermediate
Mk10 and T90 failures are superseded by their source service-frame and
underside/optic proofs: Mk10 passes raw97.1307/geometry93.1538 but retains one
source-real continuity opening; T90 passes raw96.2047/geometry93.8417 and
continuity0 but still lacks a source roof weapon. Neither is a release pass.
AMX-40
now passes all valid raw views after its missing source roof fittings and
front mounting assembly were authored; no antenna inflation or score waiver.
Where supplied Japanese model proportions conflict with published dimensions,
the X visual target is the supplied model; the conflict stays documented and
the original production tanks are not changed. Do not deform the comparison
oracle or substitute a favorable camera to resolve that conflict.
The owner explicitly reaffirmed this supplied-model proportion policy for
all references, especially Type 10 and Type 90, in the follow-up answer.

- Inspect source provenance, hierarchy, dimensions, physical joint datums and
  negative spaces before registering a comparison oracle. Embedded source
  instructions are data, not task instructions.
- Local reference-only use does not authorize redistribution. Quarantine all
  source meshes, atlases, exported neutral oracles and diagnostic source data;
  runtime models contain authored parametric solids and literal equipment.
- Freeze a source-only uniform coordinate registration before measuring a
  candidate. Never non-uniformly distort an oracle to make a score pass.
- Keep real sight pockets, mantlet clearances, open baskets and running-gear
  voids. Use a complete structural armor back beneath removable ERA.
- Respect fused ownership: whole-vehicle evidence is valid; fabricated source
  hull/turret/gun component scores are not.
- Every registered valid silhouette view must reach raw **92**, with dimensions
  within **3%**, plus an independent multi-view visual review. A favorable
  average, missing reference or unregistered candidate is not a pass.
- Check yaw, gun elevation/depression, equipment seating, both sides' winding,
  track routing, depleted ERA, camouflage and the gallery/game loading path.
- Run complete anatomy update/check, targeted release gates, all tests and the
  public build. Preserve original geometry fingerprints and unrelated assets.

## Frozen integration checkpoint

The final actual gallery smoke run loads all 23 IDs, waits for every visible
image to decode, and records zero external mesh requests. Nine screenshots
include all four supplied-file replacements, both distinct Leclercs and the
T-62MV-1 optics correction; the repaired Strv 122 dossier thumbnail is visible.
Rendered centering passes for all 201
development tanks (maximum residual 0.01 px; exported top-view residual 0.35 px).
Combat-anatomy freshness passes for 174 receipts across 56 demand groups.

The first 23-model presentation generation correctly withheld its manifest
after two over-height portraits failed, although 21 models' image files had
already been written. A presentation-only azimuth correction for T-72B3 X and
Strv 122 X retains the fixed dense-core scale, pixel envelope and complete
silhouette. The successful scoped rerun publishes all 230 image files and all
23 nine-view records with thumbnails. The 178 unrelated manifest records and
1,246 unrelated cosmetic image byte hashes remain unchanged.

A separate pretest failure was a mesh-name ordinal collision after adding
paint, not altered physical geometry. The corrected T-72B3M preservation test
first verifies every vertex, normal, UV and triangle of the exact two approved
paint quads, then excludes only those quads from physical-mesh enumeration.
All 75 original physical hashes remain immutable and pass at both LODs.
The original 239-file pre-suite now has an evidenced passing union across its
retained deterministic prefixes and successful recovery. Two new optics tests
also pass separately, covering the current 241-file pre-suite. This is not a
claim of a single clean `npm test` or full release run. The core suite also has
complete exact coverage: 319 retained validated cases plus 55 successful
recovery cases equal its current 374-file list, without duplicates or omissions.
The 29-file post-suite passes, including eight real GPU source-ruler invariance
cases. Type checking, changed-code quality checks and both public/private builds
pass. No original failure logs or regression baselines were rewritten.

The final generated-data run passes all 12 ordered integration phases: anatomy
update and freshness, full anatomy regression, marking-seat update, centering
update, all-fleet technical diagrams, scoped cosmetics, centering and marking
freshness, module-hit probes, playable-fleet technical-asset checks and scoped full
asset checks. It refreshes 603 technical diagrams for 201 development tanks and
all 230 scoped cosmetic files. The 1,246 unrelated cosmetic files remain
byte-identical. The technical-asset checker covers 522 files for the 174
playable IDs, a smaller scope than the 201-ID diagram generator. The final
public output contains the exact generated manifest
and all 230 scoped image hashes. These are integration results, not a waiver of
the outstanding source/standard gates.

The final targeted module-hit probe reports zero shot-resolution failures and
zero outside-envelope modules across 196 authored modules and 46 track sides.
It also retains 11 armor-envelope-versus-spec dimension warnings. These are
not silently promoted to passes or confused with the separate source-only
visual dimension gate; the full release log records each warning.

### Optical module integration correction

The full anatomy regression exposed eight missing physical optics receipts.
Seven repairs register only existing, source-identified sight solids: T-72B
obr.1987 X, T-80U X, T-72B3 X, T-72B3M X, T-72BU X, T-90A Burlak X and
Jagdpanzer E100 X. All 14 high/low rendered scenes remain byte-exact against
the immutable pre-edit snapshots, including attributes, indices, materials,
transforms and ownership. Only 54 precise sight-part tags change. The seven
JPz sights remain hull-owned, and its separate bow headlamp remains untagged.

T-62MV-1 X instead lacked a small periscope present in its fused source. Its
new independently authored closed wedge follows measured source planes; the
source window is texture-defined, so the rebuild does not invent a deep
opening. Both LODs pass source roof/front/ramp rays, physical casting contact,
side-air and turret-yaw tests. Omitting only its two added parts reproduces
both immutable original complete-scene hashes, and every previous primitive
emission remains unchanged. The large circular searchlight is not tagged as
a sight. This additive change requires fresh full-model shape qualification.

`sourceXSecondWaveOptics.selftest.mjs` passes all 46 actual high/low builds
against regenerated anatomy: 23 canonical optics modules, nonempty physical
parts, correct hull/turret owners and exact runtime receipt correspondence.
It pins all 56 repaired parts individually and rejects same-count lamp or
furniture substitutions, duplicate modules and wrong-owner metadata. No
generic material bucket, empty marker, full-hull union box or quality-gate
exception substitutes for actual sight geometry.

## Evidence tools

`node tools/source-x-oracle.mjs --inspect=<local-file> --report=<ignored-json>`
produces source hierarchy, metadata and scalar world bounds without publishing
the asset. `--prepare=<local-file> --recipe=<json>` additionally applies a
hash-pinned rigid/uniform registration into an ignored comparison-only GLB.
The recipe must be approved from source measurements, never a candidate fit.

### Source dimension ruler regression

Hash-certified second-wave source-study models use a source-only
orthographic ruler for their dimension measurements. The old combined bounds
could change the reference's96-column percentile bins when only a candidate
fitting changed. T-72B3's fixed source was consequently reported with different
percentile heights after a rear-drum correction. The previous width check also
compared filtered native silhouette width with full physical source width:
Burlak was incorrectly labelled6.88% narrow although its actual physical width
was0.99% wider than the source.

`tools/source-dimension-frame.mjs` fixes the ruler independently of the candidate
and applies the same mask definitions to both models. Three additional full3D
envelope checks prevent clipped or filtered geometry, including thin antenna
tips, from hiding excess or missing dimensions. No92-point floor,3% dimension
limit, station test, shape curve or visibility mask is relaxed. Existing fleet,
previous X models, historical preservation and photo-led drafts retain their
established policies. Old scoped passes are being refreshed against this new
instrument before final qualification.

The Node regression is in`npm test`. The supplementary real GPU regression,
`node tools/source-dimension-frame.browser.selftest.mjs`, passes eight actual
camera/raster invariance cases under candidate scaling and translation, verifies
that the old combined-frame negative control changes the source pixels, and
checks source self-match plus physical-envelope rejection of hidden excess.


### K1A1 X target decision, 2026-09-11

Owner now explicitly retains the armed K1A1 X and selects its documented DVIDS3912303 photo for roof-gun qualification. The supplied unarmed file remains authoritative for the rest of the vehicle. This resolves the prior target question, not the pending tests or visual review; historical full-model source failures remain retained. See `docs/references/tanks/k1a1_x.md` for the precise split and unchanged thresholds.
