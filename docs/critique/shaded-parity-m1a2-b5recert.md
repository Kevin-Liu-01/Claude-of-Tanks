# m1a2 §B5 re-parent — INDEPENDENT RE-CERT verdict (2026-08-04)

Graduate-change re-cert (BUILD-STANDARD §B5 + §10) for the coordinated
works-field/sponson-stowage re-parent. The owner-reported defect (works
field + sponson stowage static under yaw) was ORACLE-REGISTRATION-PINNED;
the fix moves BOTH sides of the instrument: the three override maps'
m1a2 turretFollowers extended to the ten mis-split ref nodes + abrams.js
buildM1a2 re-parents the proc mirror to turret buckets. Camo buckets
re-derive boxUV/bakeDirt in ring frame (the documented mottle class), so
per the §B5 RE-CERT BAR this is a FULL re-cert on the changed views, not
a pixel-diff cert.

## HEADLINE: **RE-CERT PASS** — floor 9.0, mean 9.08, all fourteen views
## at or above the graduation bar as the same M1A2 SEPv2. The §B5 point is
## delivered: at yaw 90 the ENTIRE works field + sponson stowage rotates
## with the ring (before: static on the deck while the turret swings),
## nothing sweeps mid-air, nothing drags the deck crest. Gate min 91.0
## PASS ×2 bit-identical; audit strands 0; siblings byte-exact. Orchestrator
## may land abrams.js + packet and RE-FREEZE **22210e84** (46 meshes /
## 112112 verts) in ONE commit — and should do so PROMPTLY: the registration
## half already landed at HEAD (83988da rider), so HEAD alone is mid-state
## for m1a2 (gate 0 against the flipped ref masks) until abrams.js lands.

## Provenance (§D discipline)

- Pairs re-rendered FRESH: `node tools/tmp-tank-critic.mjs --id=m1a2`
  (vite :7471, FIFO lock honored), 14/14 saved, zero console errors.
  Scored ONLY `shots/critic-m1a2/*.png`.
- Independent yaw re-shoots: `tools/tmp-b5-shots.mjs` yaw=0 and yaw=90 →
  shots/critic-m1a2-b5recert/{rest,yaw90}. Both sets 14/14 BYTE-IDENTICAL
  to the builder's after-rest/after-yaw90 evidence — deterministic
  pipeline, no drift; the builder's evidence is exactly reproducible.
- Builder's before-sets verified byte-identical to the §B5 r1 certified
  archives (28/28, shots/abrams-b5/ vs shots/abrams-b5-r2/) before use.
- Change record verified in source: the three maps carry the IDENTICAL
  extended regex (procedural-fidelity.html:152, tmp-tank-critic.html:47,
  visual-evaluator-page.html:79); match set machine-checked — all 15
  legacy followers + the 10 new nodes match, ex_armor_body / glsaa_5 /
  glsaa_9 stay excluded. abrams.js re-parent verified: tb()/RL()/ta() =
  world − M1A2_RING (pose-preserving), seatings B 1.58 / crates C 1.71 /
  walls 1.615 (re-authored z-footprint −0.83/−0.81..0.41/0.42) / rails
  1.566, A/A2 keep 1.36 core-embedded; deck knots + 1.468 rear shoulder +
  wind-post −0.225 + rail-step 1.415 all present as documented.
- Shared-file dirt audited: tankFactory.js diff = opt-in per-side track
  buckets (russia lane, no m1a2 caller, byte-identical render path);
  rig-page diffs beyond m1a2 = merkava3b/3c lane. Not m1a2-affecting.
- Hash **22210e84** (46/112112) stable ×3 (before, mid, after all
  renders). Siblings EXACT: m1a1 e500174c / m1a1ha b14be581 / m1a2_tejas
  526341c0.
- `node tools/visual-evaluator.mjs --id=m1a2` (camoSeed 4242): **RIG
  PARITY OK** — max yawProxy 1.352° @front, max |dCentroid| 0.066 m, no
  flips. Scoring valid.
- Pane registration: 12/14 bboxes within ±6 px; hero-toptilt dH+16 and
  close-roof dH+8 = the known per-model-bbox framing class, FOURTH
  consecutive round (noted, not scored).

## The §B5 read (the point of the round)

Yaw-90 before/after (certified r1 archive vs my re-shoot, all 14 views):

- BEFORE (the defect, owner's report pinpointed): top-down shows the
  works crate cluster sitting world-aligned on the deck ABOVE the rotated
  turret; hero-rearright shows the orphaned works field + sponson boxes
  crowding the rear deck while the turret swings away; view-left shows
  the static stack still standing at its rest station.
- AFTER: the ENTIRE works field (blocks A/A2/B, tarp bed + saddle trio,
  crates C with lids/straps), the sponson wall panels, and the rail
  boxes/steps rotate WITH the ring on every view; the vacated deck reads
  clean engine grilles; the rotated furniture reads attached to the
  casting (dense stowage riding the turret, contact-true).
- NOTHING MID-AIR / NO DECK COLLISION: crate bottoms 1.71 sit over the
  connector's 1.60/1.652/1.708 ref-mirror bins (the ref's own ex_armor_04
  floats its 1.748 floor the same way — in the certified 1.575..1.748
  band); walls 1.615 / rails 1.566 at their census seats; works-B 1.58
  clears the 1.572 deck crest across the sweep arc. Machine proof:
  floaters 100 ×2 with floaterFails 0 at all 5 poses; render proof: the
  yaw-90 overhang reads racked stowage, no daylight slits under bottoms.
- The genuine hull kit correctly STAYS: wind-sensor post (glsaa_5 class),
  deck-edge grab handles, grille dressing, skirts/hem.

## Machine checks (all official rigs, this session)

- GATE ×2: min **91.0 PASS** both runs, components identical both runs —
  hull 93.0 / whole 92.8 / turret 91.0 / stations 93.4 / dims 100 /
  floaters 100. vs graduation 93.1/92.5/91.5/93.5/100/100: side_hull
  94.5 (was 93.4) and side_whole 92.8 (was 92.5) IMPROVE; ledger dy back
  to 0.007/−0.006 (the regonly mid-state's −0.146/−0.208 registration
  break is healed — both instrument halves moved together). turret_side
  91.0 worst rows = the SAME certified glsaa_8/CDR carry (0.112 ×3 at
  −0.82/−0.71/−0.60) + one 0.036 CROWS column — the class that capped the
  91.5 baseline, not works-field rows. turret_plan 97.5 with the old
  ±1.499/1.581 wall-bin errors (0.59/0.55) CLEARED (worst plan row now
  0.057).
- TURRET-PARENT AUDIT: m1a2 stranded 0 / abutting 0 / dangling 0 — the
  four real strands cleared, and the builder's documented stranded-1 AABB
  false-flag (wind-post class) no longer even flags under the current
  (post-c603e73) tool. Siblings m1a1/m1a1ha/m1a2_tejas 0/0/0.
- track-clip-audit --exact: front 0 / rear 0. standard-check: contig 0,
  decor mg1+1d, PASS. npm test: full suite green (equipment 166,
  track-geometry ok).

## Changed-view localization (mottle-class evidence)

Per-view byte-diff, certified rest set vs my fresh rest set (same rig):
all 14 views changed, every changed pixel inside the documented bands —
works/sponson band (camo re-phase on moved faces; moved faces now tone
as turret furniture, the 0.5-dirt class), the walls' new forward
footprint, the 1.468 rear shoulder, the wind-post edge, rail-step edge.
Counts 1.3k-8.9k px/view. Everything else — glacis anchor, skyline,
wheel rows, slit stations, tail plate, CROWS/M240, duffel trio, roof
plateau, skirts, tracks — BYTE-IDENTICAL to the graduation-certified
pixels, so the graduation reads carry unchanged there.

- Camo re-phase legality: same scheme, same palette, same mottle scale
  on every moved face; no seam-torn blobs, no wrong-scale patches
  (checked at zoom on left/rear/top/tilt/hero crops). Same-vehicle read
  everywhere.
- Works field reads DENSE STOWAGE at rest and at yaw: flush-packed
  crates/tarp/duffels with slat+strap dressing, no floating boxes, no
  under-bottom daylight.
- Wall footprint ref-true: instrument-verified (turret_plan 97.5, old
  err bins gone); the flank band now runs alongside the turret to
  z 0.41/0.42 like the ref's outer sponson band.
- Rear shoulder 1.468: the deck edge steps at the ref's own |x|~1.47
  station; evaluator rear Δtop rows sit at the SAME certified
  crate-band/vertical-edge stations and values as graduation
  (+0.546/+0.501 @x 1.49/1.51).

## §B2 flood (current §D law: maxch ≤13 AND blue-signature B−R ≥ +8)

Fresh pairs (tools/tmp-b5recert-flood.py): proc TRUE holes — front 0,
rear 0, top 14, toptilt 0, close-front 0, close-roof 0; quarters 1-6 px;
heroes 19/18 px = the certified rack-gap class (ref's own 253-277);
sides 315/405 px at the certified slit + lane-pocket stations only.
Same-frame certified-vs-fresh census: left 498→510 (+12), right 638→652
(+14) — re-phase noise at the certified stations; top/rear/heroes/close
UNCHANGED (0 delta). NO new enclosed-air class.

## Per-view scores (graduation → re-cert)

| view | score | changed-band read |
|---|---|---|
| view-front | 9.0 → **9.0** | Glacis anchor + front skyline byte-held; walls' fwd footprint adds flank presence behind the turret matching the ref cheek band; 0 true holes. Certified front-skyline residual carries (named since r4, priced). |
| view-frontleft | 9.1 → **9.1** | Wheel-row + quarter massing byte-held; works band re-phase clean; 6 px enc. |
| view-left | 9.2 → **9.2** | Wheel language, slit + lane pocket at certified floors (510 vs 498); works band reads dense turret-tone stowage; §B6 trapezoid run byte-held (raised idler + raised toothed sprocket). |
| view-rearleft | 9.1 → **9.1** | Open bay + sprocket byte-held; works/wall re-phase clean; corner-carrier evaluator rows at certified stations (−0.649 @z −2.17). |
| view-rear | 9.1 → **9.1** | Rack band + walls read the ref's dressed flank shoulders; 1.468 shoulder at the ref station; wood channel + louvers byte-held; 0 true holes. |
| view-rearright | 9.1 → **9.1** | Mirror of rearleft; 1 px enc; wall band + shoulder clean. |
| view-right | 9.2 → **9.2** | As left mirrored; certified stations hold (652 vs 638). |
| view-frontright | 9.0 → **9.0** | Sun-quarter disc-pop residual unchanged (certified polish class); works band clean; 2 px enc. |
| view-top | 9.1 → **9.1** | Plan instrument IMPROVED (turret_plan 97.5, wall bins cleared); works lids/trio hold the ordered col-profile class; certified ±1.83 rails untouched; 14 px enc (was-certified class). |
| hero-frontleft | 9.1 → **9.1** | Wheel row + hem byte-held; works walls re-phase same-scheme; 19 px true = certified rack-gap class. |
| hero-rearright | 9.1 → **9.1** | Open tail bay + gear byte-held; wall band + shoulder read attached and ref-true; 18 px true (certified class; evaluator's 0.943 m² void = the tool's barrel/deck-gap false-positive class, census-proven, fifth round). |
| hero-toptilt | 9.0 → **9.0** | Works field reads dense packed stowage at tilt (tarp + trio + slatted crates vs the ref's soft rounds — the certified roundness residual carries); roof stations byte-held; 0 true holes. |
| close-front | 9.0 → **9.0** | Bow effectively byte-untouched (1278 px total: wall sliver at frame edge + the census-corrected wind-post edge); containment read clean. |
| close-roof | 9.0 → **9.0** | CROWS/loader stations byte-held; certified cupola-relief gap binds; wall/works re-phase at frame rear clean; 0 true holes. |

Floor 9.0, mean 9.08 — the graduation profile reproduced on the changed
build. Every view reads same-vehicle/same-tier; no view lost a certified
earn; the vehicle additionally now yaws correctly (§B5).

## Standing checks

- §B1 FRONT-SLOPE: PASS (glacis byte-held; evaluator glacis band clean).
- §B2 CONTIGUITY: PASS (census above; no new class, blue-signature law
  applied).
- §B3 DECOR: PASS (mg1+1d; works dressing rode its blocks into turret
  buckets with same mat slots).
- §B4 CONTAINMENT: PASS (0/0 exact; bands byte-held).
- §B5: PASS — the audit target (stranded/dangling 0) now holds OUTRIGHT
  on m1a2 and all three siblings; yaw-90 pair + floaters ×2 delivered.
- §B6 TRACK RUN: PASS (byte-held trapezoid, both raised ends).
- §H.4 VARIETY: PASS — four-up strip re-verified with fresh m1a2 pixels:
  m1a1 bare-roof M2/clean green/open wheels; m1a1ha red-brown two-tone;
  tejas long low turret/brick streaks; m1a2 CROWS + loader ring +
  duffel-loaded works field + dressed sponson walls + skirt-tab hem +
  twin whips. No re-badge read.

## Honest residuals (all carried, none §B5-round regressions)

turret_side 91.0 = certified glsaa_8/CDR triple + CROWS column
(pre-existing carry that capped the 91.5 baseline); stations 93.4 (−0.1,
the ref-true rear shoulder trade, instrument-priced); front_hull/whole
−0.1 (same trade class); frontright sun-quarter disc pop; duffel plan
roundness; front dead-ahead skyline band — all graduation-certified
polish classes, unchanged. The builder's stranded-1 false-flag residual
is RESOLVED (current tool reads 0) — the packet line can note the audit
now reads clean rather than carrying the false-flag adjudication.

## Verdict

**RE-CERT PASS.** Land in ONE commit: src/vehicles/profiles/abrams.js +
the m1a2.md packet section (registration hunks already at HEAD via
83988da; tmp-tank-critic.html is local tmp) and RE-FREEZE m1a2 at
**22210e84** (46 meshes / 112112 verts), superseding bc225318. Landing
urgency: HEAD currently carries the flipped registration WITHOUT the
proc re-parent — the m1a2 gate is broken at HEAD until abrams.js lands
(mid-state proof: shots/abrams-b5-r2/gate-midstate-regonly.json, min 0).
