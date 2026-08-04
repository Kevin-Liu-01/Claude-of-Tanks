# ABRAMS FAMILY §B1 TURRET-SLOPE — INDEPENDENT RE-CERT (graduate-change)

Date 2026-08-04. Independent re-cert critic for the §B1 turret-front-slope
graduate-change on m1a2 / m1a1 / m1a1ha / m1a2_tejas (owner photo directive,
BUILD-STANDARD §B1: "all abrams have sloped fronts of turrets" — a
vertical/slab turret front on any Abrams is a failing read). Fix under
review: in-tree uncommitted abrams.js (m1a2 chin-split cheek layers
L 38.2° / R 40.4°; trio faceRake 0.02 -> 0.32 = 34.8° via the shared
buildTejasFamily/TEJAS_TURRET shell; sepv2/tusk/abramsx moves ride along,
non-graduate). All renders/measurements below are my own runs on the
official rigs (§D), fresh this session.

## VERDICT — RE-CERT PASS, all four tanks

| tank        | §B1 read (before -> after)            | gate x2       | new hash  |
|-------------|----------------------------------------|---------------|-----------|
| m1a2        | 0.0° slab -> chin-split rake 38/40°   | 91.0 = 91.0   | f3c34424  |
| m1a1        | 2.5° slab -> 34.8° family rake        | 89.4 = 89.4   | 97c10194  |
| m1a1ha      | 2.5° slab -> 34.8° family rake        | 89.4 = 89.4   | 5c765fc4  |
| m1a2_tejas  | 2.5° slab -> 34.8° family rake        | 89.4 = 89.4   | 3fcae440  |

Orchestrator may land abrams.js + packets + the FOUR re-freezes in one
commit.

## 1. The §B1 read (the point of the round)

Method: I rendered the official 14-view critic pairs fresh
(tools/tmp-tank-critic.mjs) for all four, AND built a true current-harness
BEFORE set by rendering the same rig from a HEAD worktree (pre-B1 bytes,
same tool bytes, same reference GLBs). Zoom strips
[BEFORE | AFTER | REF-print] per changed view, all four tanks
(scratchpad b1z-*.png, session-local diagnosis crops; verdicts below are
official-rig reads).

- The slab/vertical read is GONE on every variant in every changed view.
  Side views: the leading edge above the mantlet now falls forward to the
  chin as a raked diagonal (before: a dead-vertical line). 3/4 and
  close-front: the cheek reads as the print's two-band structure — chin
  band holding the certified plan front, raked band pulling back to the
  roof knee; the owner's photo class.
- hero-toptilt is the biggest identity win: the raked cheek planes now
  READ AS PLANES from above, carrying camo, exactly as the ref print's
  toptilt does. Before, the vertical faces were invisible from tilt and
  the turret front read as a bare crest line.
- m1a2 reads STEEPER than the trio (per the angle table: 38-40° vs
  34.8°) — visible in the side-view diagonals; family identity shared,
  per-print angles distinct. m1a2's pure-side rake sliver is short (the
  D1/D2 sight-band masses own the columns between, matching the ref's own
  sight cluster) — the honest residual the packet declares; the rake
  carries strongest in 3/4, close-front, and toptilt, as claimed.
- The pitched slot plate (trio + inherited shells) reads SEATED — a
  coherent embrasure recess behind the raked face; no floating dark slab
  in the air (the failure the pitch was added to prevent).
- Roof furniture (M2 cradles, CWS/CROWS, sight boxes, smoke banks, hatch
  rings) sits planted at the new crest lines in close-roof/toptilt on all
  four — nothing floating, nothing sunken.

## 2. Angle measurements (§D: numbers, official probe frame)

tools/tmp-b1-facerake-probe.mjs re-run by me on the changed tree
(turret-only side profile, gun subtree excluded, registered pair frame;
JSONs in session scratchpad):

- m1a2 PRINT: cheek chin at y 1.66 (z 2.372); L slope -0.784 = 38.1°,
  R -0.851 = 40.4° from vertical (my least-squares over y 1.66..1.94, max
  residual 6 mm both sides — matches the packet's table). PROC after: chin
  band flat at the plan front z 2.405 through y 1.66 then falling — the
  chin lands ON the print's chin line; the visible rake begins there. The
  deeper side columns are masked in the max-z collapse by the certified
  interior center-fill wall (|x|<=0.315, z<=2.36, a plan carrier) — the
  declared residual; construction angles atan(0.24/0.305)=38.2° /
  atan(0.26/0.305)=40.4° confirmed in the diff coordinates.
- trio PRINT (tejas GLB, the registered ref): cheek plane 34.7° (my fit
  1.80..2.12, slope -0.6922, res 5 mm). PROC before: 2.5° (L) / 0.0° (R)
  — the slab. PROC after: R-column carrier 35.6° (fit 1.70..2.10
  excluding the gun-cover band 1.75..2.01 that the probe's max-z collapse
  picks up at z 2.752 — cover lives in turretG, not rig_gun), res 29 mm
  incl. the chin knuckle. Builder claimed 35.5 — confirmed within bin
  noise. m1a1 probe re-run: identical carrier numbers (shared shell,
  per-variant verified). Note the L column reads 17.1° in this collapse —
  left-side fittings (smoke cluster shelf) own bins above the cheek;
  measurement-frame artifact, both cheeks visually raked in
  frontleft/frontright views.
- visual-evaluator (official, run by me on all four): RIG PARITY OK every
  view (max yawProxy 1.7°, trio close-roof; m1a2 max 1.0°). m1a2
  view-left turret-front upper edge: dAngle +3.31° on the 0.556 m edge at
  midWorld (0.04, 1.99, 1.97) — exactly the builder's after-number
  (before-digest 6.07°); the improvement claim verified byte-for-byte.
  Trio hero-frontleft worst front-zone read Δ-12.1° = the PRE-EXISTING
  banked far-cheek/smoke-cluster perspective overlap (family lane), same
  value as the builder's digest, not §B1-introduced.

## 3. Change locality (current-harness A/B, my renders both sides)

Pixel-diff worktree-BEFORE vs fresh-AFTER pairs, split by pair half
(threshold >2/255):

- REF half: 0 differing pixels, ALL 14 views x ALL 4 tanks — no framing
  drift, no reference pollution (the stale-ref-half caveat in the m1a1
  before-archive is real but my worktree A/B bypasses it entirely).
- PROC half: every diff localized to the turret front — view-left 689 px
  (m1a2) / 454 / 475 / 501 px (trio); view-front 12.6-14.4k px = shading
  of the re-angled planes on an UNCHANGED front silhouette (mask
  z-invariance confirmed); rear views 8-92 px crest slivers; zero pixels
  moved anywhere else (running gear, hull, bustle, fittings untouched).
- My fresh AFTER renders are 0-diff against the builder's
  shots/abrams-b1/after-* archives — deterministic pipeline, builder
  evidence = shipping truth.

## 4. Standing spot-checks

- geometry-gate x2 (by me): m1a2 91.0 PASS both runs, components
  93/92.8/91/93.4/100/100 bit-identical across runs; trio 89.4 both runs,
  components 91.7/89.4/89.8/93.9/100/100 bit-identical. HEAD-worktree
  control run (pre-B1 bytes, same harness): m1a2 IDENTICAL
  93/92.8/91/93.4 min 91.0 — the committed 91.5 JSON is stale-harness
  drift from the r6 landing, NOT a §B1 cost: the m1a2 change is
  gate-neutral by construction. Trio control: turret 89.6 / stations 93.5
  -> 89.8 / 93.9 after — the §B1 change IMPROVES both changed components;
  hull/whole/dims/floaters untouched. The 89.4 wholeCurves baseline is
  the banked pre-existing override-path-drift read (2026-08-03, certified
  CROWS caps) — unchanged by this round and not §B1's to fix.
- Hashes x2 through renders (tmp-hashgeo before + after all browser
  work): m1a2 f3c34424 (46/112796), m1a1 97c10194 (46/158932), m1a1ha
  5c765fc4 (46/158212), m1a2_tejas 3fcae440 (47/158248) — stable, and
  exactly the packet's re-freeze targets.
- §B2 flood (blue-signature per §D: bg maxch<=13 AND B-R>=+8, border
  flood, enclosed-pixel clusters): m1a2 view-front/hero-toptilt CLEAN
  (0 real enclosed px; the 92 px "PROCEDURAL" label-text counters are a
  harness artifact, all views). Remaining micro-clusters (m1a2 view-top
  14 px stern/track crevices; trio view-top 16 px, hero-toptilt 81 px,
  view-front 470 px running-gear/track apertures) ALL sit OUTSIDE the
  §B1 diff bboxes — byte-identical to the certified graduate state,
  pre-existing, zero §B1-introduced holes. Official
  tank-standard-check (by me): contig/holes 0, clip 0/0, census mg1+1d —
  all four PASS.
- §H.4 four-up distinctness (my fresh hero-frontleft composite): four
  distinct reads sharing the raked-front family identity — m1a2 the SEP
  architecture (cheek sight bands, works field, drum, paneled skirts,
  steeper rake); m1a1 mono-green + CWS + stowed M2 + wall cable; m1a1ha
  two-tone + shielded stowed M2 + spare links; tejas CROWS + whips +
  fuller rack. No 'same tank re-badged' pair.

## 5. Scores — changed views, graduation standard (>=9.0 bar)

| view          | m1a2 | m1a1 | m1a1ha | m1a2_tejas |
|---------------|------|------|--------|------------|
| front         | 9.4  | 9.3  | 9.3    | 9.3        |
| frontleft     | 9.3  | 9.2  | 9.2    | 9.2        |
| frontright    | 9.3  | 9.2  | 9.2    | 9.2        |
| left          | 9.2  | 9.2  | 9.2    | 9.2        |
| right         | 9.2  | 9.2  | 9.2    | 9.2        |
| hero-frontleft| 9.3  | 9.3  | 9.3    | 9.3        |
| close-front   | 9.3  | 9.3  | 9.3    | 9.3        |
| hero-toptilt  | 9.4  | 9.3  | 9.3    | 9.3        |
| close-roof    | 9.3  | 9.2  | 9.2    | 9.2        |

Every changed view >= 9.0 on every tank. Unchanged views carry their
graduation verdicts (rear/rearleft/rearright/top diffs 8-92 px crest
slivers, no re-score needed).

Honest residuals carried (not §B1 failures, documented): m1a2 pure-side
rake sliver short behind the sight-band mass (print's own structure);
trio hero-frontleft far-cheek Δ-12.1° banked family-lane perspective
overlap (pre-existing); trio 89.4 wholeCurves banked baseline; probe
L-column 17.1° collapse artifact (fittings-owned bins).

## RE-CERT PASS x4 — release to orchestrator for the single landing
commit: abrams.js + packet §B1 sections + re-freeze m1a2 f3c34424,
m1a1 97c10194, m1a1ha 5c765fc4, m1a2_tejas 3fcae440.
