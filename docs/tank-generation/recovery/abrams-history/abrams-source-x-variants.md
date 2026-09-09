# Abrams source-X: variant evidence and independent review contract

Status: authoring/validation checkpoint, 2026-09-07. No new vehicle is visually or
structurally qualified by this note. Original playable vehicles remain separate.

The supplied **M1A2 SEPv2 DC OBJ** is the detailed shape authority for the new
base, not evidence that every Abrams variant carries its equipment. The source
inventory/normalization packet owns the exact input hash, coordinate transform,
component census and measured datums. Do not substitute the same-named archived
OBJ or a previous recovered/warped Abrams GLB without an explicit source change.

## Variant distinctions supported by primary sources

| Intended family member | Supported distinction | Modeling boundary |
| --- | --- | --- |
| M1A1 | M1A2 introduced the commander's independent thermal viewer (CITV); M1A1 commander weapon/sight arrangements need their own reference. | Re-author the commander station and associated roof, not simply hide the SEP v2 CITV and leave its pedestal. Do not assume all later A1 upgrades share the same sight. |
| M1A1HA | The 1988 Army announcement identifies steel-encased depleted-uranium armor. | Internal armor designation does not establish an externally thicker cheek or bolt-on wedge. Use dated exterior imagery for any visible difference. |
| M1A2 | CITV and the different commander/roof arrangement distinguish the A2 family from A1. | An early A2 does not automatically receive the supplied SEP v2's remote station, add-on armor or stowage. |
| M1A2 SEPv2 | A firsthand National Guard fielding account explicitly identifies CROWS II on its SEP v2 tanks. | The actual supplied file establishes its particular station/loadout; retain any difference from the reference configuration honestly. |
| M1A2 TUSK | TUSK is an add-on kit. ARAT includes rectangular M19 and curved M32 tiles, installed using skirt rails/hangers. | Declare the chosen TUSK configuration. ARAT-only and full TUSK are not synonyms, nor does every SEP v2 require the full kit. Preserve real rail/tile/support gaps. |
| M1A2 SEPv3 | Primary accounts identify increased power capability, under-armor APU, armor changes and ammunition datalink; Army discussion identifies low-profile CROWS among v3 improvements. | Use the actual LP station form and dated vehicle photographs. ADL capability does not establish arbitrary visible roof boxes. Exact optics dimensions, Trophy installation and armor arrangement require configuration-specific evidence. |
| Ukrainian M1A1 | DoD's March 2023 announcement changed the planned supply from M1A2 to M1A1. | Keep A1 roof architecture; use dated Ukrainian equipment/markings evidence. The announcement alone does not establish later cages, ERA, stowage or their dimensions. |

Primary references (capability statements are not dimensional drawings):

- [Army: Tankers go digital with Abrams upgrade, 2011](https://www.army.mil/article-amp/54409)
  identifies the A2 CITV addition and SEP v2 remote weapon station.
- [Army ATP 3-20.15, chapter 3](https://rdl.train.army.mil/catalog-ws/view/100.ATSC/2F4F8430-78F6-459A-A9A5-DFC8E73007E0-1356018579249/atp3_20x15.pdf)
  distinguishes the Marine A1 remote thermal sight/AIDATS from the A2 CITV.
- [Army ARMOR, May–June 1988, printed page 51](https://www.benning.army.mil/armor/eARMOR/content/issues/1988/MAY_JUN/ArmorMayJune1988web.pdf)
  describes the new A1 armor, not an exposed external armor kit.
- [Kansas National Guard: SEP v2 fielding account, 2014](https://www.dvidshub.net/news/153045/guardsmen-anxious-try-out-new-model-abrams-tanks)
  identifies CROWS II and provides dated vehicle photography.
- [Army: Tank crew learns ARAT install, 2017](https://www.army.mil/article/183780)
  identifies M19/M32, hangers and rails, and explicitly contrasts ARAT-only use
  with full TUSK on SEP v2 tanks.
- [Army ARMOR: Improving Abrams Lethality, 2014](https://www.benning.army.mil/armor/eARMOR/content/issues/2014/JAN_FEB/Brown.html)
  describes LP-CROWS among the planned v3 changes and TUSK protection elements.
- [Kongsberg: CROWS Low-Profile product and gallery](https://www.kongsberg.com/what-we-do/defence-and-security/remote-weapon-systems/crows-low-profile/)
  is a direct manufacturer reference for the station's reduced-height form.
  [Its 2017 delivery announcement](https://www.kongsberg.com/news/news-archive/2017/kongsberg-signs-orders-to-the-crows-program-valued-at-330-mnok/)
  calls it an M1A2 installation generally: LP-CROWS alone is not a unique v3 ID.
- [Army: initial SEPv3 production delivery, 2017](https://www.army.mil/article/194952/army_rolls_out_latest_version_of_iconic_abrams_main_battle_tank)
  supports the APU/power/armor/ADL distinction and supplies dated photographs.
- [DoD: March 21, 2023 briefing](https://www.defense.gov/News/Transcripts/Transcript/Article/3336849/pentagon-press-secretary-air-force-brig-gen-pat-ryder-holds-an-on-camera-press/)
  confirms the Ukrainian M1A1 decision.

### Concepts are a separate scope/claim

If included by the owner, AbramsX and the existing first-party M1A3 concept need
their own explicit evidence categories. [General Dynamics' AUSA 2022 announcement](https://www.gd.com/Articles/2022/10/04/general-dynamics-business-units-to-participate-in-ausa-2022)
identifies AbramsX as a technology demonstrator with a hybrid power pack and
reduced crew. It is not a SEP v2 variant certified by this OBJ. The [Army's 2023
M1E3 announcement](https://www.army.mil/article/269706/army_announces_plans_for_m1e3_abrams_tank_modernization)
explicitly distinguishes development nomenclature from a type-classified A
designation. Do not relabel the game's speculative M1A3 as a confirmed M1E3 or
claim its geometry follows this supplied source.

## Reusable verification routes and traps

- `tools/leopard-source-study.py` and the Revolution wrapper provide offline
  scalar/section studies and matched orthographic views. Reuse the measurement
  machinery, **not** Revolution's historical nonuniform/piecewise source fit.
- `tools/reference-glb-loader.ts` supports complete node/follower ownership and
  explicit source-world `pivot`/`gunPivot`. Its optional `sourceWorldSha256`
  registration now verifies the canonical GLB bytes before loading and bypasses
  pathological centering and width normalization for that verified metre frame.
  The unpinned legacy path still normalizes; a page-only certificate is not a
  substitute for this loader-side hash check.
- `tools/source-world-registration.mjs` provides hash/identity-root/pivot checks;
  `tools/reference-gun-pivot.selftest.mjs` demonstrates unchanged neutral source
  vertices while correcting a zero-origin gun node's pitch axis.
- `tools/section-slab-bounds.mjs` supplies actual triangle/slab intersections;
  `tools/source-slab-study.mjs` is an existing CPU diagnostic usage example.
- `tools/procedural-fidelity.mjs`/`.html` and `tools/geometry-gate.mjs` provide
  matched whole/component views and curve diagnostics. Enable semantic component
  checks only where the complete source owners are defensible. Do not carve
  selected triangles out of a fused turret/mantlet to manufacture a gun score.
- `tools/tank-standard-check.mjs`, track-clip, winding, turret-parent and bore
  tools complement shape scores; they do not prove source likeness alone.

The old `profiles/abrams.ts` is valuable as a preservation target, not new shape
truth. Its shared Tejas-based family, old height/P95 fitting history, 12 mm
turret lift, TTS-derived station options and historically mirrored source
ownership are not transferable measurements. Existing roof-seating tests mostly
verify authored receipts in high LOD; the new source tests must independently
intersect real geometry in both LODs. Old `m1a2_sepv3.md` statements about ADL roof
boxes and a universal 1.16 optics scale are authoring choices, not primary-source
dimensional evidence. Preserve originals without silently inheriting them.

## Independent structure test plan

Implemented test: `src/vehicles/abramsSourceXStructure.selftest.mjs`. The source
hold-out author owns this test separately from the profile authors. It now
executes actual seven-ID high/low stock, bearing, running-gear, bore, posed-ray
and applicable ERA-depletion/reset checks. Interpret its dated run receipts
separately from the broader acceptance plan below; passing those focused
assertions is not complete visual or release qualification.

1. **Fixed frame and ownership:** actual high/low instances, unit root, source
   ground/hull-center frame, measured bearing and gun axis, explicitly inferred
   longitudinal pitch pivot, and native muzzle anchor.
   Compare source neutral world vertices before/after semantic reparenting.
   Every original nondegenerate source surface remains represented exactly once.
2. **True openings:** source-measured rays through gun-mouth/embrasure corners,
   sight mouths/hood undercuts, bustle corner/under-floor gaps, wheel-bay and
   skirt-return gaps. Pair every no-hit witness with nearby stock and rear-wall
   hits. Intersect all actual visible geometry, not a convenient owner subset;
   ignore only documented nonphysical proxies/paint for the relevant test.
3. **Actual mount contact:** independently ray/sample the CITV, CROWS bearing and
   yoke, loader pintle, smoke carriers and bustle feet at source stations. AABB
   overlap or a self-reported contact receipt alone is insufficient. Preserve
   the open receiver/yoke rather than support it with a broad invented slab.
4. **Pose:** yaw 0/90/180 degrees and legal gun elevation extrema with unchanged
   buffers. Turret equipment follows yaw; barrel/recoil and fixed gun mount
   follow the proper nested owners; hull stock does not move. Verify actual
   muzzle-axis motion and no newly filled aperture during pitch.
5. **Determinism/preservation:** repeat same-seed high/low builds and hash actual
   buffers, indices, instances and transforms. Pin old conventional Abrams
   fingerprints separately before integration. No old original is a new source
   oracle. Explicitly account for additive paint rather than dropping old names.
6. **Gameplay attachment:** after anatomy generation, test physical main/auxiliary
   armor and optics/ERA against actual stock. Donor spaced/ERA planes must not
   remain ghost-hittable in air; stripping a real ERA module must preserve
   permanent backing and cannot leave painted numbers suspended over empty air.

Keep source hold-outs separate from authoring constants. The source agent owns
the full census; this test should pin a small discriminating set of independent
scalars/rays, not repeat the extraction or import source triangles into runtime.

## Bounded shaded review after the first native build

Request matched source/native **front, both sides, rear, top, front quarters and
rear quarters** in one fixed frame, plus four close-up pairs: roof stations,
mantlet/muzzle, one wheel/skirt return, and rear bustle. Inspect neutral clay
first, then camouflage and one yaw/elevation pair. Preserve separate verdicts
for large form, medium fittings, fine simplification and source defects.

Priority failure signatures are a wrong turret cheek/throat cross-section,
filled gun/sight openings, solid-backed bustle that should be open, floating
station feet, false wheel-bay walls, and generic A1/A2/TUSK/LP silhouettes.
Passing an outline average does not close any of these.

### Historical failed checkpoint, 2026-09-07 09:43:55 UTC

The source-fixed SEP v2 comparison at this historical checkpoint had a raw composite of
95.1708016076, but the gate remains **FAIL**: tracks 88.7622932988, turret-right
87.8880979428 and turret-left 90.4947887298 are below the unchanged 92 floor.
The turret aggregate 92.0342759346 does not override these view failures.
Evidence is `.qa-dev/reports/procedural-fidelity.json` and the corresponding
`shots/procedural-fidelity/boards/m1a2_sepv2_x-neutral.png`; these working outputs
have been superseded by later captures and are not immutable final receipts.

The equipment iteration added source59's short radio mast and measured
receiving foot, source84's bent framed shield and source85's inboard shield.
Source106 supplies real thick glazing inside the metal apertures: upper
windows must **not** be described as full-scene empty air. Focused CPU checks
cover the metal openings separately from positive recessed-glass hits, both
detail levels, and the measured bore/weapon configuration. Two explicitly
inferred concealed construction joins remain: the source201 foot's inner edge
seats approximately 10 mm into the existing cupola rim; the source85 hinge has
a 2 mm hidden seating extension across the source's 1.89 mm gap. Neither moves
the visible shield/glass coordinates or authorizes changes to the source.

At that checkpoint the seven variants were configurations of an independently authored
source-led foundation; only the selected SEP v2 loadout has this supplied
file's geometric authority. Other roofs, LP-CROWS and nonurban equipment
differences remain primary-photo-led approximations, not seven source-certified
vehicles. Complete-scene cross-owner attachment/articulation review and fresh
whole-view qualification remain separate outstanding work at this checkpoint.

### Historical R2 complete-scene equipment mount checkpoint, 2026-09-07

The later equipment correction is frozen for a fresh shaded comparison. The
new `src/vehicles/abramsSourceXEquipment.selftest.mjs` passed all seven actual
IDs in both detail levels at three turret/gun poses (14 instances, 42 poses).
It intersects the complete visible scene, including actual glazing, rather
than isolating convenient equipment owners. It verifies source106's lower
commander panes, the source84 forward-right receiving foot and its source59
mounting shoulder, and the source79 mast case/socket/flange/floor chain.

The CROWS side cabinet now has its source87 U-shaped underside and the actual
lower channel, paired narrow links and tapered crosshead flange. Their mounting
path bends: the flange meets the crosshead and the cabinet links at different
heights. The 37.9 mm cabinet-to-upper-yoke gap, centre-left cover gap, forward
return slot and crosshead well remain real tested air. No filler was added to
make an invalid straight contact ray pass. The forward receiving foot's hidden
24 mm closure and the sight flange's closure against the unchanged cheek plane
are first-party construction decisions; the complete source oracle is unchanged.

This CPU checkpoint does not qualify the full appearance. The upper station's
rounded receiver, small scallops and some saddle/cover detail remain simplified,
and fresh matched shaded views, raw shape gates, anatomy and release checks
remain separate obligations. Only the selected SEP v2 loadout is the directly
supplied-file comparison target; the other six configurations, especially
LP-CROWS dimensions, remain disclosed primary-photo-led approximations.

### R3 upper CROWS CPU freeze, 2026-09-07

The refreshed R2 shaded views still showed a medium-form failure: generic
rectangular optical heads and a low rectangular receiver support. The R3
`abramsSourceXCrows.ts` helper replaces those with the measured large round
head and flat rear crown, stepped smaller round optic, asymmetric double-lobed
head, paired scalloped carrier, transverse-raked inner arms and open gun cradle.
The source90 receiver's 93.24 mm width belongs to its top cover; its narrower
58.42 mm fore body now preserves the real gaps to the cradle. Source87's broad
outer yoke sheets were already correct and are unchanged.

Complete-source rays establish actual owner92 optical glass, not owner107 and
not full-depth air. Four first optical surfaces, rounded corner air, the
double-lobed lower relief, under-receiver space and stepped-link central opening
are tested on the complete actual tank in both detail levels and three poses.
All fourteen instances/42 poses and twelve pre-edit equipment fingerprints
passed. The fingerprint comparison excludes only the named R3 upper-station
targets and root's separately recorded basket changes; lower mounts, glazing,
main gun and unrelated weapons remain unchanged. The full retained six-phase
CPU receipt is `.qa-dev/reports/abrams-crows-r3-frozen-oYci5w/receipt.json`;
typecheck and both equipment/helper complexity checks also passed.

At that historical checkpoint R3 was frozen for a new matched shaded comparison,
**not visually accepted**.
The parametric scallops, small bearing/turning-stock detail and thin closed
optical panes simplify the supplied mesh. SEP v3's LP support placement is
still an explicit configuration inference, not source-certified geometry.
Fresh renders, valid-view shape floors and the full anatomy/release pipeline
remain separate obligations; no prior failed checkpoint is waived.

### Current frozen R4 disposition

The [R4 review](abrams-source-x-visual-review-r4.md) supersedes the historical
visual status above: 8.5–8.9/10, with 0/14 views reaching 9. Raw fidelity is
96.5325 composite, but tracks fail at 88.8431; geometry dimensions fail at
62.2105. Only SEP v2 is a direct supplied-file comparison. The other six remain
configuration approximations, not separately source-qualified variants.
Anatomy and release integration are tracked in the main research receipt.

