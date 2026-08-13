# Native fleet restoration ledger

This is the persistent execution order for the first-party vehicle rebuild.
It exists so a successful native model cannot be silently replaced by a
converted comparison mesh or by a weaker experimental wrapper.

## Non-negotiable rules

1. Every battle-playable vehicle is geometry authored in this repository.
2. External GLB files are isolated measurement and visual-review oracles only.
   No source vertex, converted payload, generated mesh array, or source-backed
   runtime wrapper may enter a playable.
3. A restored model is not complete until it passes the quantitative 90+
   silhouette gate, the 14-view visual review, and yaw ownership/load-path
   inspection with its native running gear intact.
4. Improve a proven native basis in place. Do not replace the whole vehicle to
   solve one detail and do not discard an earlier stronger first-party build.
5. This ledger covers the whole playable fleet, not only the current vehicle.
   Leopard 2 Revolution/2A4/2A5/2A6/2A7V, Challenger, Ariete, AMX-40,
   Type 10, Type 74, Type 90/99, and every T-72/T-80/T-90 variant must each
   retain an independently authored primary hull, turret, gun and native
   running-gear construction. A sibling may provide measurements and family
   conventions, never copied primary geometry.

The executable provenance check is `npm run tank:native:check`. The family
ordering check is `npm run tank:family:check`.

## Ordered work

The rows below are deliberately model-specific. A family headline is not a
completion receipt for every member, and an aggregate score is not a pass when
one required view remains below 90.

| Order | Family / vehicle | Native status | Current next action |
|---:|---|---|---|
| 1 | Type 10 | Detailed first-party builder restored; imported wrapper removed; continuous clipped weldment, fixed bow-shoulder bridges and native five-wheel course completed | Preserve freeze `7ac6d434`, its 91.41 / every-view 90.02+ authored basis and exact 0/0 course; continue visual refinement in place without reintroducing the retired source bake |
| 2 | Leopard 2A4 | Detailed first-party builder restored; imported wrapper removed; recovered single-box turret replaced by our connected three-ring welded shell, lowered seated roof suite and fuller seven-wheel presentation | Preserve the 92.55 aggregate / every-view 90.55+ authored basis, gun 92.36, exact 0/0 course and clean yaw/winding; refine only in place |
| 3 | Leopard 2A7V | Detailed first-party builder restored; crude post-assembly scaling and imported wrapper removed; connected crown, correctly sided EMES seat, fixed APU trunks and supported rear slat returns completed | Preserve the 91.17 / every-view 90.05+ native basis, passing geometry gate and exact zero band/zero shoe clearance; refine only in place |
| 4 | Leopard 2 Revolution | Detailed first-party builder restored; imported wrapper removed; compact native SEOSS/electronics/RWS suite restored; false black ring-gap proxy removed | Preserve the 92.32 / every-view 92.11+ native basis, exact 0/0 terminal clearance and clean outward winding; refine only with connected authored armor and equipment |
| 5 | Leopard 2A6 | First-party builder preserved; front and rear terminal armor re-routed around the native course | Preserve the 95.37 every-view, exact 0/0 terminal-clearance basis and use its measurements as a family reference, never its geometry as a donor |
| 6 | Challenger 1 | The earlier stronger first-party `challenger1Build` is restored and active; its shallow segmented skirt and separate six-station Hydrogas dish/hub faces are restored; the later weaker `challenger1Native2026` experiment remains inactive | Preserve the 93.41 / every-view 93.13+ authored basis, exact 0/0 course and clean yaw/winding; never replace it with source mesh geometry or silently reactivate the weaker experiment |
| 7 | C1 Ariete | The earlier, stronger first-party `buildAriete` is restored and active; its shallow skirt and seven separate dish/rim/hub faces are restored; the later `buildArieteNative2026` experiment remains available only for comparison | Preserve the 94.11 / every-view 92.90+ authored basis, exact 0/0 course and clean yaw/winding; never replace it with source mesh geometry or silently reactivate the weaker experiment |
| 8 | AMX-40 | First-party connected-loft builder active; imported wrapper removed; lower bow/rear sponson clear the terminal shoes and the six existing road wheels again carry distinct authored dish/rim/hub faces | Preserve the 94.23 / every-view 94.44+ authored basis and exact 0/0 course; audit every refinement against it |
| 9 | Type 99A / Type 99 family | The supplied/downloaded GLB is quarantined as a measurement and render oracle; the stronger earlier repository-authored print-measured builder is restored and redesigned in place | Preserve the new authored hull, welded turret and exact six-wheel course; continue any later micro-detail refinement on this native basis and never introduce source vertices or meshes |
| 10 | T-90M Proryv | The owner-rejected slabby mask-shaped build is retired; `buildT90MProryvNative2026` is the active first-party low V-bow hull, welded fighting compartment, supported bustle and native six-wheel course | Preserve freeze `a21894b8`, its 90.96 / every-view 90.02+ native evidence and exact 0/0 course; refine only this distinct welded Proryv in place and never chase the incompatible legacy component mask |
| 11 | T-72 family | Runtime playables native; lineage order explicit and self-tested; delisted base T-72B3 removed from the active progression; T-72BU restored as a hybrid of its stronger authored hull/gun/course and the lower first-party BU turret package | Preserve the 90.03 / every-view 90.05+ T-72BU basis, then standardize the remaining shared mechanical datums without flattening distinct turret/protection grammar |
| 12 | T-80 family | Four-member authored lineage re-certified; T-80U imported wrapper removed and low cast/K-5/rear-service geometry repaired and freshly re-certified in place | Preserve T-80U freeze `77f9ae78` and the distinct T-80 / T-80B / T-80BV bases, their current every-view 90+ scores and exact 0/0 native courses; retain T-80U's direct-turret surface score as refinement debt rather than replacing the vehicle |
| 13 | T-90 family | Runtime playables native; lineage order explicit and self-tested; base T-90, Burlak, T-90MS and the restored high-detail Proryv remain distinct first-party builds | Preserve the validated base T-90, Burlak, T-90MS and Proryv, then re-run the whole family after shared changes without cross-copying primary shells |
| 14 | Type 74, T-14, FV510 and remaining erased native work | Imported wrappers removed; first-party builders active; FV510, T-14 and T-80U now have fresh authored 90+ quantitative and 42-frame re-certifications | Preserve FV510 `61023726`, T-14 `a94a2480` and T-80U `77f9ae78`, then execute the ordered fleet-failure queue with repository-authored primitives only |
| 15 | AbramsX | Fully authored `buildAbramsX` retained; eight latent inward-wound lower-bow/tunnel/sight wedges corrected locally without changing its accepted source-measured envelope | Preserve freeze `976a1370`, its 94.29 / every-view 93.99+ fidelity and 0 reversed / 0 mixed winding receipt; refine only in place and keep both Mortavex files oracle-only |

## Current receipts

- Native provenance: 108 battle playables, 0 GLB-backed, 26 isolated
  comparison candidates.
- Family ordering: four explicit lineages; T-72, T-80 and T-90 variants are
  contiguous and retain native six-wheel receipts.
- Fresh ordered T-family regression set: **16/16 active measurable** T-72,
  T-80/T-84 and T-90 playables pass 90+ overall **and 90+ in every required
  view**. The delisted base T-72B3 is intentionally absent from the active
  progression and has no local comparison oracle. Restored Leopard,
  Challenger, Ariete, AMX-40, Type 10 and Type 99 receipts remain recorded
  individually below rather than hidden behind this aggregate. FV510 is
  re-frozen at **`61023726`** and passes at **90.84 aggregate / 90.12 minimum
  view** on the authored `fv510PhotoBuild`; its exact-source playables and
  earlier 87.3 regression are retired. Its 42-frame packet, exact track and
  winding receipts are recorded in §5.129. T-14 is re-frozen at
  **`a94a2480`**, passes at **90.53 aggregate / 91.52 minimum view** on the
  fully authored `buildT14`, and has a fresh 42-frame genuine-yaw packet;
  source-baked `a88afa6c` is retired. T-80U is re-frozen at **`77f9ae78`**,
  passes at **91.51 aggregate / 90.20 minimum view**, exact 0/0 band and
  shoes, and has a fresh 42-frame genuine-yaw packet. The provenance
  re-certification queue is therefore clear. The previously audited priority
  vehicles report **0/0
  smooth-band and 0/0 individual-shoe intersections** at both terminals in
  the undilated exact audit. `npm test`, native provenance and family-order
  self-tests are green. This line must be updated from fresh audit output;
  historical certification text is never allowed to conceal a current fail.

## Fleet-wide open fidelity queue

The 2026-08-12 full compatible-reference run is the authoritative current
quality ledger: **56/70 pass** the simultaneous 90+ aggregate and 90+ every-view
law. The remaining 14 are real open work and may not be hidden behind family
or historical graduation claims. They are ordered to maximize shared authored
repairs while protecting already passing siblings:

1. AMX-30 authored base: `amx30` 85.20 / 80.16 and `amx30b2` 85.40 / 81.67.
2. Abrams derivatives: `m1a2_tusk` 85.33 / 84.36, `m1a2_sepv2` 88.88 /
   88.15 and `m1a2_tejas` 91.09 / 89.67.
3. Merkava 2 authored base: `merkava2b` 88.34 / 87.88 and `merkava2d`
   87.30 / 89.83.
4. Individual closures: `spz_puma` 83.93 / 81.23, `k1a1` 87.64 / 88.66,
   `m48` 87.15 / 91.14, `t44` 89.01 / 88.85, `t64bv1` 88.87 / 88.91,
   `type74` 90.16 / 87.39 and `t62mv1` 91.92 / 87.64.

`m60a1` and `m60a3` are deliberately excluded from that denominator. Their
recovered reference hierarchy carries the turret/gun at a 90-degree internal
rest pose relative to the hull, so the automated registration compares
different poses and reports false 39--44 scores. The authored M60 build is
preserved unchanged (its compatible historical sitting was 90.7); it may not
be distorted to satisfy a broken oracle. This is an explicit reference-rig
repair debt, not a vehicle pass and not hidden work.

Every repair must preserve native provenance, use the existing stronger
first-party basis, pass every registered silhouette at 90+, and then receive
fresh yaw/load-path, exact-track and winding evidence before the fleet can be
declared complete.
- Render-truth winding: the same 26 have **0 reversed / 0 mixed** connected
  exterior pieces. Machine mode-2 remains intentionally conservative: the
  manually adjudicated Leopard 2A7V and AMX-40 regions are their fixed
  engine/sponson service decks; T-72B3M is its fixed upper hull/engine field;
  Vladimir is its open fixed fender/service frame; T-90MS is its rear deck
  service cover; Proryv is its rear drum/log field; and Type 99 is its fixed
  powerpack/transom. Fresh yaw frames show every complete turret leaving
  those supported hull structures behind without a duplicate shell or
  stranded turret fitting.
- T-family mechanical standardization: all 16 active T-72/T-80/T-84/
  T-90 lineage members now report **0/0 smooth-band and 0/0 individual-shoe
  intersections at both terminals**. T-90A rear hardpoints, Vladimir's fixed
  bow/fender hardware and T-90SM side carriers were moved out of the animated
  shoe corridor without cross-copying a sibling hull. The T-84 authored
  turret fitting that actually had reversed winding is rebuilt with the
  oriented solid helper; its audit is now 0 reversed / 0 mixed with zero
  render deficit and its every-view score remains 95.1.
- Type 99A: the new repository-authored `buildType99AFullNativeRebuild2026` is
  active. It replaces the rejected long/tall hull, undersized course and
  rectangular turret with a measured but independently constructed pressure
  hull, six-wheel running gear and one continuous low welded turret. No source
  vertex, mesh, material or baked payload enters the runtime. Fresh
  source-relative evidence is **92.09 aggregate**, **90.74 minimum view**,
  **91.77 whole silhouette**, and **93.49 native track**. The comparison GLB is
  used only for independent dimensions: 3.70 m width, 7.76 m physical hull
  envelope, 7.08 m substantial body, 11.66 m overall and 3.16 m broad
  combat-station height. The authored result measures 3.71 / 7.75 / 7.079 /
  11.64 / 3.18 m under the same rules. Its hull has a two-plane folded prow,
  narrow pressure tub, supported shoulders, low engine deck and backed
  asymmetric transom. The rotating package is a connected clipped-arrow shell
  with buried cheeks, falling side protection, a shallow bustle, supported
  open rack and source-stationed roof equipment. Six native r0.405 road wheels
  use the measured 0.901 m cadence inside one 0.63 m linked-shoe course; exact
  containment is **0/0 band and 0/0 individual shoes** at both terminals. The
  available-data geometry gate passes at **90.8**: because the reference has
  fused mixed-owner meshes, it honestly gates registered whole views, real
  dimensions and floaters instead of inventing hull/turret component masks.
  Forty-two distinct fresh frames at
  `/tmp/critic-type99-native-rebuild-final-r1` prove genuine yaw and show the
  complete gun/shell/bustle/rack/roof package rotating over a fixed hull,
  engine deck, transom and running gear. Winding is 0 reversed / 0 mixed; the
  conservative mode-2 candidates are legitimate fixed powerpack and transom
  surfaces. The supplied GLB remains a quarantined visual/measurement oracle
  only.
- T-90M Proryv: **90.96 aggregate**, every standard view at least **90.02**,
  whole silhouette **92.73**, hull **91.67**, direct turret **86.86**, and
  native running-gear profile **91.25**. The runtime calls the fully authored
  `buildT90MProryvNative2026`; the older mask-shaped slab hull/turret is
  retired. The active hull is a compact low V-bow pressure body with a six-
  wheel native course. The rotating package is one distinct welded Proryv
  shell with planted Relikt, mantlet/gun, low roof stations, a supported
  tapered bustle/rack and a strapped transverse rear cylinder. Exact
  containment is **0/0** for the smooth band and **0/0** for every individual
  shoe at both terminals. Winding is **0 reversed / 0 mixed**; its four-pixel
  deficit produces no visible wound. Forty-two distinct frames at
  `/tmp/critic-t90m-proryv-native-final-r4/t90m` prove genuine yaw, seated
  equipment and a clean fixed/rotating split. Parent audit and muzzle probe
  pass. The conservative mode-2 candidate is the visibly seated hull-fixed
  rear drum/service assembly revealed when the turret departs. The generated
  legacy contour gate remains an honest 27.1 fail because it is calibrated to
  the retired source-shaped implementation; it is disclosed rather than
  chased. Freeze **`a21894b8`** reproduces at 55 meshes / 114,746 vertices.
  The comparison GLB remains an isolated render/measurement oracle only.
- T-90A Burlak: 90.50 aggregate, every standard silhouette at least 90.20,
  and exact 0/0 smooth-band plus 0/0 individual-shoe containment at both
  terminals. The frozen first-party build `8d2f5d44` has 63 meshes / 103,357
  vertices. Forty-two distinct frames at
  `/tmp/critic-t90a-burlak-native-r1` prove genuine yaw: the complete clipped
  shell, planted protection, gun, long shallow autoloader bustle, panoramic
  sight, MG/shield, smoke and antennas rotate together while the compact hull,
  transom and native six-wheel course remain fixed. Parenting and winding are
  clean. The legacy strict geometry oracle remains registration-incompatible
  and its zero component floor is recorded as unresolved rather than falsely
  certified.
- T-90MS: 90.08 aggregate with every standard silhouette at least 90.34;
  whole 91.83, hull 93.78, turret 84.00, gun 85.05 and tracks 93.61 under the
  corrected directional cannon-overhang audit. The
  frozen first-party build `59de23ce` has 53 meshes / 107,956 vertices and
  exact 0/0 smooth-band plus 0/0 individual-shoe containment at both
  terminals. Forty-two distinct current frames at
  `/tmp/critic-t90ms-family-final-r4` prove a genuine quarter-turn and show
  the connected clipped-diamond shell, planted Relikt, corrected gun,
  panoramic/Kord station, optics, smoke, tapered bustle and supported rear
  cage rotating together while deck stowage, engine-service covers, transom
  and the six-wheel course remain fixed. Winding is 0 reversed / 0 mixed
  with zero render-deficit pixels. The conservative mode-2 candidate is the
  supported fixed engine/deck cover, not stranded turret equipment. No comparison geometry is
  present in the playable.
- Base T-90: 90.63 aggregate with every standard silhouette at least 90.53;
  whole 91.77, hull 92.02, turret 83.96, gun 92.50 and tracks 95.21 under the
  corrected directional cannon-overhang audit. The spherical core is retired:
  eight explicit asymmetric cast sections now author the mantlet valley,
  lower cheeks, swollen shoulders, narrow crown and sharp rear falloff. The
  frozen first-party build `1966d2e8` has 68 meshes / 114,144 vertices and
  exact 0/0 smooth-band plus 0/0 individual-shoe containment at both
  terminals. Forty-five distinct current frames at
  `/tmp/critic-t90-final-r14.TFQaOj/t90` prove a genuine quarter-turn and show the
  complete cast shell, gun, planted protection, Shtora, commander/NSVT suite,
  smoke, antennae and rear turret rack rotating together while the corrected
  pressure tub, glacis, deck, backed service field and six-wheel course remain
  fixed. The track order is asserted as front idler, six suspension-backed
  road wheels, three support rollers and rear final-drive sprocket. The rear
  service overhang now has a continuous hull-owned backing (0 contiguity
  holes). Winding is 0 reversed / 0 mixed with one visually null rear-left
  deficit pixel. The fixed
  `fitting_spareTrackLinks` nominee is legitimate deck stowage; no comparison
  geometry is present in the playable.
- T-72B3M: 92.03 aggregate, every standard view at least 91.43, with exact
  0/0 band and individual-shoe containment. The duplicate second roof combat
  station is removed from runtime while its earlier recipe remains available
  for archaeological comparison.
- T-72BU: 90.03 aggregate with every standard view at least 90.05. The
  stronger measured hull, calibrated 2A46M-4 and six-wheel native course are
  preserved; only the complete rotating package is replaced by the lower
  repository-authored BU casting, planted irregular protection, asymmetric
  sight/NSVT suite and supported rear packs. Exact containment is 0/0 for the
  smooth band and every individual shoe at both terminals. Turret parenting
  is 0 stranded / 0 abutting / 0 dangling. Winding is 0 reversed / 0 mixed
  with a three-pixel (0.01%) non-structural render deficit. Forty-two distinct
  frames at `/tmp/critic-t72bu-family-final-r2` prove genuine yaw and a fixed
  authored hull/service deck. The external GLB remains an isolated visual and
  measurement oracle only.
- C1 Ariete: the earlier repository-authored `buildAriete` is restored as the
  active build, a substantial recovery over the later 2026 replacement. The
  deep wall-like skirt is lifted while retaining its original crown, and all
  seven existing native stations now carry shallow olive dishes, dark hubs
  and recessed rim rings inside the original wheel width. No centers, tire
  radii, terminals or track topology changed. Fresh evidence is **94.11
  aggregate / 92.90 minimum view**, with hull 95.12, direct turret 90.36 and
  native track 96.13. Forty-two distinct paired/yaw frames at
  `/tmp/critic-ariete-wheel-restore-r4`, exact 0/0 band/shoe clearance, 0
  reversed / 0 mixed winding and zero yaw-stranded candidates complete the
  restoration receipt.
- Challenger 1: the earlier repository-authored `challenger1Build` remains
  active. Its visually regressed wall-like skirt is raised back to a shallow
  segmented course and every existing Hydrogas station now carries a shallow
  authored olive dish and dark hub inside the original wheel width. These are
  fixed faces on the six native wheels, not a donor or duplicate course. Fresh
  evidence is **93.41 aggregate / 93.13 minimum view**, hull 97.06, gun 90.39
  and native track 94.61. The comparison asset's component split incorrectly
  keeps part of its roof furniture in its hull node, so its 88.14 direct-turret
  component score is recorded as ownership-registration debt rather than a
  reason to strand our rotating equipment. The weaker
  `challenger1Native2026` experiment is not active. Forty-two distinct
  paired/yaw frames at `/tmp/critic-challenger1-wheel-restore-r5`, exact 0/0
  course clearance, 0 reversed / 0 mixed winding and a clean mode-2 ownership
  verdict complete the restored-basis certification.
- Leopard 2 Revolution: **92.32 aggregate**, every registered view at least
  **92.11**, with whole silhouette 93.34, hull 96.11, gun 96.43 and native
  track 97.59. The oversized two-storey roof tub is gone: the restored
  repository-authored suite uses a compact SEOSS head on a buried bracket, a
  closed louvred electronics module, detailed commander/loader hatches and a
  small collar-seated RWS with a real procedural M2. The render-only black
  ring-gap blocks are deleted; the closed primary loft and ring apron now show
  their actual camouflaged load-bearing underside and a narrow mechanical
  clearance. All authored wedges use the family outward-winding constructor,
  bringing the census from 19 reversed pieces to **0 reversed / 0 mixed**.
  Exact containment remains **0/0 smooth band and 0/0 individual shoes** at
  both terminals. Forty-two distinct frames at
  `/tmp/critic-leo2rev-native-restored-r8` prove genuine yaw and show the gun,
  connected shell, cheek armor, SEOSS, hatches, RWS, bustle equipment and
  basket moving together over the fixed native hull/course. This is a preserve
  basis, not permission to copy geometry into another Leopard variant.
- Leopard 2A6: 95.37 aggregate, every view at least 95.30, hull 96.53 and
  turret 93.02. Exact containment is 0/0 for both the smooth band and actual
  shoes at both terminals. Forty-two distinct frames at
  `/tmp/critic-leo2a6-native-final-r4` passed yaw, ownership, seating and
  winding review. The three formerly inverted authored fittings are repaired;
  winding is now 0 reversed / 0 mixed with zero render deficit. Preserve this
  authored model.
- AMX-40: **94.23 aggregate / 94.44 minimum view**. Its authored lower bow
  and rear sponson clear both terminal wraps exactly: 0/0 smooth-band and 0/0
  individual-shoe hits. Six shallow olive dishes, dark hubs and rim rings are
  concentric with the existing native stations and stay inside the original
  track/skirt width; the connected turret loft, gun and terminals are
  unchanged. Forty-two unique frames at
  `/tmp/critic-amx40-wheel-restore-r2` pass genuine yaw and visibly keep every
  wheel face, sponson, engine deck and rear service field hull-fixed. Winding
  is 0 reversed / 0 mixed with zero render deficit. The conservative mode-2
  candidates remain the previously adjudicated fixed engine/sponson service
  decks, not stranded turret geometry.
- T-80 family: the current authored lineage passes as four distinct vehicles:
  T-80 **93.75 / floor 94.07**, T-80B **93.46 / floor 93.01**, T-80BV
  **90.97 / floor 91.84**, and T-80U **91.51 / floor 90.20**. All four have
  exact **0/0** smooth-band and **0/0** individual-shoe intersections at both
  terminals, 0 reversed / 0 mixed connected pieces, and zero yaw-stranded
  candidate pixels. T-80U retains its stronger first-party hull, gun and
  six-wheel course; its monolithic port K-5 rail is replaced by a shorter
  planted course, its low cast shoulders and shallow bustle remain connected,
  and its turbine-deck/transom package stays hull-owned. Forty-two clean,
  distinct current paired/yaw frames at `/tmp/critic-t80u-native-final-r3/t80u` prove a
  genuine quarter-turn and coherent fixed deck. T-80U direct-turret score
  **83.21** remains recorded refinement debt; improve that authored casting
  and station detail in place rather than importing or flattening a sibling.
- Leopard 2A4: **92.55 aggregate**, every standard view at least **90.55**,
  gun **92.36** and track profile **96.53**. The recovered generic one-piece
  box is gone: one authored three-ring welded shell now carries the blunt
  front, clipped cheeks, shoulder break and inset roof; its lower apron,
  EMES, cupolas, PERI, MG/FLW, smoke banks, antennas and bustle rack all retain
  visible seats. Seven fuller native road wheels remain inside one linked
  course. Exact containment is **0/0 band and 0/0 individual shoes** at both
  terminals; winding is 0 reversed / 0 mixed and the yaw-stranded candidate
  count is zero. Forty-two distinct frames at
  `/tmp/critic-leo2a4-native-restored-final-r6` prove the genuine quarter-turn
  and coherent fixed hull.
- Leopard 2A7V: **91.17 aggregate**, every standard silhouette at least
  **90.05**, whole silhouette 90.94, gun 90.30 and native track 93.52. The
  available-data geometry gate now passes at 90.0 with 97.0 dimensions and
  100.0 floater containment. Its broad-body validation datum is explicitly
  separated from the published 2.87 m narrow-equipment envelope; this avoids
  disguising an antenna spike as primary roof volume. The connected native
  crown, compact roof plateau, correctly sided EMES pedestal, APU cooling
  trunks and bustle-slat returns are all repository-authored and visibly
  seated. Exact track containment is **0/0 band and 0/0 individual shoes** at
  both terminals. Forty-two distinct frames at
  `/tmp/critic-leo2a7v-native-final-r11` prove genuine yaw and show the full
  gun/shell/bustle/station package rotating over a coherent fixed hull. The
  conservative winding mode-2 candidates are the supported fixed engine deck,
  APU trunks and fender/service surfaces exposed when the turret departs—not
  stranded turret geometry. Winding is 0 reversed / 0 mixed; the 39-pixel
  front-left deficit is 0.06% and has no visible wound.
- Type 10: **91.41 aggregate** with every standard silhouette at least
  **90.02**, whole 92.29, hull 92.41 and gun 90.09. The repository-authored primary rebuild
  replaces the former cabinet-like section with one clipped, narrowed welded
  shell, a deeper connected cheek undercut, a more aggressively tapered
  bustle, narrower asymmetric side modules and a folded trapezoidal lower
  bow. Two thin faceted shoulder bridges close the former inboard bow pockets
  while remaining above both terminal courses. The shallow straight skirt now masks the road-wheel crowns without
  losing the exact five-station identity. The five authored stations are
  rendered by the native linked-track system only; exact containment is 0/0
  for the smooth band and all individual shoes at both terminals. Winding is
  0 reversed / 0 mixed (7-pixel rear-left FrontSide deficit, 0.01%, visually
  clean) and yaw mode-2 is clean with zero candidates. Forty-two distinct
  current paired/yaw frames at `/tmp/critic-type10-native-final-r10/type10` confirm
  the continuous turret/bustle/roof package rotates together while the folded
  bow, deck, five-wheel course and transom remain fixed. The older component
  geometry oracle remains a disclosed measurement-debt item for Type 10: its
  source masks are incompatibly registered and return nonsensical ~45-50
  curve/dimension values despite the independently normalized 90+ paired
  silhouettes; it is not represented as a passing gate. Freeze `7ac6d434`
  reproduces at 62 meshes / 56,562 vertices.
- Leopard 2A5: 94.9 aggregate with every standard view above 90 and exact 0/0
  smooth-band and 0/0 individual-shoe containment at both terminals.
  Forty-two distinct current frames at
  `/tmp/critic-leo2a5-native-final-r2` passed yaw, load-path and winding
  review. Two inverted native surface-course solids were corrected without
  changing the silhouette; winding is now 0 reversed / 0 mixed.

Temporary evidence paths are reproduced during a final certification run and
are not runtime dependencies.
