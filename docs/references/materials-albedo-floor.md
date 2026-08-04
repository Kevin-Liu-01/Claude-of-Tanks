# materials albedo-floor round (fleet camo B3 class) — 2026-08-04

Lane: materials (src/vehicles/materials.js ONLY). Baseline: HEAD 1925e9dd,
materials.js blob 9d0bde8e (verified clean — no pre-existing working-tree
diff; the coordinator's collision warning did not materialize). Escalation
inputs: docs/critique/shaded-parity-m47_patton-r6.md (B3: top census 2334 vs
ref 1160), t84 packet r32 2b (pale>=95 1/0 vs targets 60/150, "family camo
canvas + bakeDirt dust gradient cap pale reach"), leo2a5 r8 1c (gear sub45
2358 vs retired <=1500 gate; law 5 "deep-shade floor is albedo-keyed").

## HEADLINE

The dark-class albedo floor was built, proven end-to-end, and SHIPPED
DISABLED (byte-identical default, §F.2 opt-in contract): a 41/50/80 floor
ladder on the official critic pairs shows the three cited windows are NOT
held by the authored patch hex. Recovered references paint their hulls from
the SAME shared procedural canvas (modelLoader paintUntextured →
getSharedCamoTexture), so the class's own albedo cancels out of every
proc-vs-ref census; the real holders are tankFactory/modelLoader-lane
pipeline asymmetries (named below with numbers). Held windows stayed EXACT
under every tested floor — the knob is safe, it is just not the lever the
cited windows hang on. No graduate render changed in the shipped state
(bit-level spot-check table below).

## 1. The class (located + measured)

Camo generator: `paintCamo` (materials.js) — scheme painters consume
`visual.patches`; the darkest member is the blotch/black class (nato painter:
`black = patches[0]`, core alpha 0.95). Proc albedo pipeline: paintCamo →
`exposureTrim` ×0.86 (materials.js) → at render ×bakeDirt vertex dust
(tankFactory.js:3330 — NOT in the materials lane: deck up-face AO ×0.84, hem
channels ×(0.728, 0.660, 0.541) at d=0.85) → vehicleAmbientFloorHook deep-shade
rolloff (materials.js: `vehFloorL *= mix(0.30, 1, smoothstep(0.025, 0.09,
vehLuma))` — near-black texels keep 30% of the readability floor; leo2a5 r8
law 5 confirmed).

Authored sub-41 patch tones fleet-wide (probe: tools/tmp-albedofloor-probe.mjs):

| tone | ITU-601 L | carriers |
|---|---|---|
| #1d1f1c | 30.1 | challenger2, leclerc, chieftain_mk10, **chieftain5 (graduate)** — stripes bands |
| #1f2420 | 34.0 | abramsx |
| #23261e | 36.2 | type99a |
| #23261f | 36.3 | leo1a5-family nato black: m60a1/m60a3 (graduates), m46/m47/m48/m60a2 pattons, leo2a6 (graduate), leo2a5, kf51 (graduate), m1a2_tejas (graduate) |
| #262a20 | 39.7 | 'digital' USSR picker pattern |
| #26292b/#26292c/#272b22 | 40.2-40.9 | m90 / midnight / tigerstripe picker patterns |

NOT sub-41 (verified by runtime probe, both at L42-43.5): t84's '#272d22'
L42.0 and the m1a2/m1a1/m1a2_tusk FACTORY_OVERRIDE black '#282f23' L43.5 —
the flagship abrams factory cohort does NOT move at the recommended floor
(only m1a2_tejas, which has no override and inherits '#23261f'). The three
spot-check-family graduates merkava3d / isu152 / (kv2) are scheme 'solid',
patches=[] — the class does not exist on them (structural no-op).

On-canvas dark class (probe, m47_patton factory, 2048², post-trim): sub-45
4.41% / sub-38 2.91% of texels; class center ≈ L33 (authored 36.3 × 0.95
core alpha over base 77.9, ×0.86 trim). t84: sub-45 4.39%, class ≈ L37.

## 2. The mechanism shipped (opt-in, disabled)

`CAMO_DARK_CLASS_FLOOR_L = 0` + `liftDarkClassTone` (pure luma scale — hue
and r/g ratios of lifted tones preserved exactly) applied to the paintCamo
patch ingestion under `visual.fleetAlbedoFloor`, which only the procedural
bake paths set (`bakeSharedCanvases`, `repaintEntry`). `glbPatternTile` (GLB
composite tiles) keeps authored tones; `wheelToneOf`/`paintKitCanvas` read
`visual.patches` directly — wheel tints and kit paint are untouched by
construction. At 0 the map is the identity: canvases byte-identical to the
authored palettes (verified — see spot-check table).

Plumbing proof (floor=80 experiment): m47 canvas sub-45 4.41% → 0.12%; proc
B3 top-window census sub50 2189 → 496. The knob works end-to-end.

## 3. Why the cited windows do not move (the exact couplings)

All numbers from MY fresh official pairs at HEAD (tools/tmp-tank-critic.mjs,
camoSeed 4242, zero console errors; measure script
scratchpad measure-albedo-floor.py, mask-method §D, ITU-601).

### m47_patton B3 top window [260..380]×[330..490] (order: census toward ref 1160)

| state | REF sub45 / sub50 / p5 | PROC sub45 / sub50 / p5 | gap (proc−ref sub50) |
|---|---|---|---|
| baseline | 548 / 1160 / 46.9 | 861 / 2189 / 44.1 | 1029 |
| floor 41 | 460 / 1145 / 47.1 | 963 / 2294 / 43.5 | 1149 |
| floor 50 | 170 / 1025 / 48.4 | 980 / 2343 / 43.4 | **1318 — WIDENED** |
| floor 80 | 67 / 71 / 58.0 | 178 / 496 / 51.4 | 425 |

(The critic renderer is deterministic — the shipped-state diff below is 0 px
over 70 views — so the small floor-41/50 census movements are real
threshold-straddling responses, not noise. Both halves respond; the REF
responds faster at every step and the gap moves the wrong way until the
class stops being dark at all.)

Coupling: the m47 reference is a recovered GLB whose hull paints from the
SAME shared proc canvas (paintUntextured → getSharedCamoTexture) — the class
albedo cancels out of the delta. The residual gap decomposes into:
(a) **deck vertex-bake asymmetry**: tankFactory `bakeDirt` bakes an up-facing
multiplier ×0.84 on decks (tank_models r4 anti-blowout law); the ref-side
`refineCommunityGeometry` bake (modelLoader.js) has NO up-face term (ao =
1 − max(0,−ny)·0.26) — every proc deck texel renders ~16% darker than the
ref's identical texel. (b) **proc-only sub-50 content** ≈ 425-500 px in this
window (the floor-80 residual: proc 496 vs ref 71 — spareTrack/fittings/
panel-line classes). Lifting the class lifts BOTH halves and the ref responds
FASTER (no deck penalty) — the palette knob cannot close this window; at
floor 50 it measurably widens. Render response is also heavily compressed
(Δcanvas +35.7 → Δrendered p5 +7.3 ≈ 0.2 gain): no class-preserving floor
(≤ the brown class at L60.3) reaches ref parity.

### leo2a5 1c gear window [100..540]×[352..400] (order: sub45 toward ≤1500)

| state | PROC sub45 | REF sub45 |
|---|---|---|
| baseline | 2358 (r8-packet EXACT) | 59 |
| floor 41 | 2358 | 59 |
| floor 50 (class +13.7 canvas-L) | **2354 (−4 px)** | 59 |

Coupling: the dark-class share of this census is ≈ 0. The population is
(a) leopard-lane gear hexes (pads 0x474734 / chain 0x393524 — the r8
corner-ladder-capped system, profiles/leopard.js) and (b) BASE-class camo
texels under bakeDirt's hem dust (G ×0.66 at ground; base 77.9 → canvas 67 →
hem-effective ~44). Both out of the patch palette's reach; (b) is
tankFactory-lane, (a) is leopard-lane.

### t84 2b lower band, view-left/right y346..386 (order: pale≥95 toward 60/150)

Baseline: PROC pale95 1 (L) / 0 (R) vs REF 93 / 246; PROC p95 88.9 / 77.0 vs
REF 91.8 / 87.7. Coupling: the nato proc canvas has NO ≥95 class — the
lightest patch tone ('#71684a' L103) lands at 88.7 on-canvas after the 0.86
exposureTrim, and hem texels then take bakeDirt ×0.66 G (vs the ref bake's
×0.696) — the proc tail tops out 3-5L under the ref's identical-canvas tail
and the 95 threshold sits above it. Opening this from materials.js would mean
lifting the light class or the exposure trim — both banned (19 graduates'
med/hue windows are scored against them; the trim is the roster-cohesion
calibration). The pale reach lever is bakeDirt-lane (tankFactory.js hem
constants) and/or the lit-response side. Note t84 GRADUATED 2026-08-04 (19th)
with this residual banked — the window is frozen evidence now.

Dark-side note: t84's dark class (L42.0) sits above the recommended floor and
its lower-band sub-45s are already cleaner than ref (33 vs 69 L-band) — the
t84 was never a dark-class casualty.

## 4. Held windows (every tested floor, my pairs)

| window | gate | baseline | floor 41 | floor 50 |
|---|---|---|---|---|
| m47 A1 view-left med / p75 | 66.6 / 70.5 (packet-exact) ±1.5L | 66.6 / 70.5 | 66.6 / 70.5 | 66.6 / 70.5 |
| m47 A1 sub-30 | 0 | 0 | 0 | 0 |
| m47 N1 hero-rr gear r/g | ≤1.01 | 1.005 | 1.005 | 1.005 |
| t84 letterbox med / g−r | 67.8 / ≥+5 | 67.8 / +7.6 | 67.8 / +7.6 | not re-run (palette unchanged at 41: renders bit-identical) |
| leo2a5 hull-side med | 71.4 (ref 73.0 ±2) | 71.4 | 71.4 | 71.4 |

The floor never moved a held window even at 50 — the knob is SAFE; it is
orthogonal to the scored medians/hues (it lifts a sub-population that never
carries the median rank, and the lift is ratio-preserving).

## 5. Shipped state + spot-checks (floor 0 = byte-identical default)

Working-tree diff: 3 hunks in materials.js only — (1) constant + helper +
paintCamo patch-ingestion guard (the CAMO PATTERN comment block carries
this round's record), (2) `fleetAlbedoFloor: true` in bakeSharedCanvases,
(3) same in repaintEntry. No other SOURCE file touched; new files are this
packet + the probe rig (tools/tmp-albedofloor-probe.{html,mjs}, untracked).
NEVER committed (lane law). shots/critic-* for the six rendered tanks are
re-stamped at shipped state (= committed-state pixels, bit-proven);
shots/critic-leo2a5 restored to my baseline pairs after the floor-50
experiment stamp (the experiment state is not a shippable configuration).

SPOT-CHECK TABLE (official pairs at shipped state vs pre-change baseline,
bit-level diff over all 14 views each):

| tank | family | scheme / dark class | result (14 views, bit-level) |
|---|---|---|---|
| m47_patton (cited) | patton | nato #23261f | **14/14 bit-identical, 0 px** |
| t84 (cited, 19th graduate) | t-series | nato #272d22 | **14/14 bit-identical, 0 px** |
| merkava3d (graduate) | merkava | solid, no patches | **14/14 bit-identical, 0 px** |
| isu152 (graduate) | casemate/USSR | solid, no patches | **14/14 bit-identical, 0 px** |
| m1a1 (graduate) | abrams | nato #282f23 L43.5 | **14/14 bit-identical, 0 px** |
| leo2a5 (cited) | leopard | nato #23261f | final render BLOCKED by a concurrent lane (below); floor-41/50 experiment pairs measured window-exact (§3/§4) |

70/70 rendered views bit-identical to the pre-change baseline — the shipped
state is a proven render no-op, and med shifts are 0.0L everywhere (stronger
than the ±1.5L bar).

kv2 substitution note: the brief named kv2 as a spot-check graduate, but
kv2's reference is unrecoverable by design (procedural-fidelity note; its
critic pairs cannot render — verified twice, __CRITIC_READY timeout). kv2 is
scheme 'solid' patches=[] — the floor code path is structurally unreachable
for it. Substituted m1a1 as the third family (abrams): a live nato-scheme
graduate exercising the guarded ingestion path end-to-end.

CONCURRENT-LANE NOTE (the m47-r6 §F.2 hazard class, live again): at 16:05:35
the leopard lane landed uncommitted working-tree edits on
src/vehicles/profiles/leopard.js (75+/29−, stern-relief round) carrying a
transient `litCrownGeos` TDZ error that breaks buildLeo2A5 — my final
leo2a5 render/hash/standard-check runs at 16:0x failed on THEIR tree state,
not on this change. Everything leo2a5 in §3/§4 was rendered and measured
BEFORE their edit (baseline pairs 15:53:53, floor-41/50 pairs pre-16:05,
hash 50c34724 verified at baseline 15:58) — internally consistent bytes.
materials.js provably cannot move leo2a5 geometry (gate ×2 bit-identical,
canvas-only diff); the leo2a5 bit-identity re-proof is one 31 s render once
their lane stabilizes.

## 6. Gate / hash / test proofs

- geometry-gate ×2 at shipped state, m47_patton + t84: run1 == run2
  BIT-IDENTICAL and line-exact vs the pre-change baseline run —
  `m47_patton min 90.5 | 90.5/91/91.4/93.6/100/100 PASS`,
  `t84 min 90.2 | 92/92.3/90.2/95.3/99.1/100 PASS` (packet-exact lines).
- tmp-hashgeo: m47_patton **f02ef936** (96/100818) and t84 **531fe4f0**
  (47/84292) exact before AND after; leo2a5 **50c34724** (122/136672)
  verified at baseline, after-run blocked by the concurrent leopard-lane
  edit (§5 note) — albedo cannot move geometry hashes by construction.
- tank-standard-check (shipped state): m47_patton clip 0/0 ✓ contig 0 ✓
  decor mg1+1d ✓; t84 clip 4/0 ✓ contig 0 ✓ decor mg1+6d ✓; leo2a5 ERR =
  the foreign leopard.js TDZ error above, not this lane.
- npm test: all selftests pass (movement / combat / spotting / equipment
  166 checks / track-geometry).
- masks: the change is albedo-only (a palette map guarded behind a vis flag);
  gate masks are geometry-driven and the gate ran bit-identical ×2 — proven,
  not just argued.

## 7. Recommendation (orchestrator)

1. The B3-class levers are OUT of the materials lane: (a) equalize the deck
   response between tankFactory `bakeDirt` (up-face ×0.84) and modelLoader
   `refineCommunityGeometry` (no up-face term) — one constant on either side;
   (b) the hem dust floor (bakeDirt d=0.85, G ×0.66) for the t84-class pale
   reach. Both are shared-vertex-bake calibrations with their own critique
   history (tank_models r4; r8 community cohesion) — schedule as a
   coordinated round with re-cert scope, not a drive-by.
2. If/when the dark-class floor is wanted for the true sub-30 albedo bakers
   (the '#1d1f1c' cohort: challenger2 / leclerc / chieftain_mk10 /
   chieftain5), flip `CAMO_DARK_CLASS_FLOOR_L` to 41 (just under the
   calibrated '#2e2e2e'/L46 summer-black family). Measured blast radius at
   41: the #23261f cohort (graduates m60a1/m60a3/leo2a6/kf51/m1a2_tejas)
   moves ≤3ch with censuses/held windows exact (§3/§4 tables); chieftain5
   (+10.9L authored on its stripes band class) is the one graduate expected
   to move visibly — budget its re-cert. The m1a2/m1a1/m1a2_tusk factory
   black (L43.5) and t84 (L42.0) do NOT move at 41. The scoping (proc-only,
   ref tiles frozen, wheel tints untouched) is already proven.
3. tools/tmp-albedofloor-probe.{html,mjs} is the canvas-census rig for this
   knob (per-spec resolved visual + albedo histograms); kept for the flip
   round, delete after.
