# §B8 PHOTO-PARITY ACCEPTANCE — independent critic verdicts (2026-08-06)

**Law basis:** BUILD-STANDARD §B8 (owner directive 2026-08-06, banked 95ccfb0):
builder self-reads are NOT an acceptance bar; PROPORTIONS COME FIRST and gate the
round; the acid question on every view is the owner's — "does it read as the real
tank." All 2026-08-06 photo-class landings were DELIVERED-PENDING-CRITIC until this
adjudication. This document is that adjudication. Independent critic, adversarial,
no src edits, no commits.

**Method:** per tank — (1) the OFFICIAL photoclass rig 16-view set
(tools/tmp-ww2-photoclass.html, untouched, proc-only, LOD-0) captured via
tools/tmp-b8-batch.mjs in one cot-shots FIFO hold; (2) numeric proportion probe
(tools/tmp-b8-measure.html — overall / hull-minus-turret / turret-minus-gun / gun
boxes in game meters, rig_muzzle world, scene-graph truth) diffed against published
dims (docs/references/tanks/*.md corroborated tables — dims sovereign) and spec
`dims` rows; (3) where an oracle exists (spz_puma, challenger2, t14, leo2a7v,
fv510), REF|PROC pairs at matched views via tools/tmp-tank-critic.html — the oracle
IS the proportion truth there (fv510 print exception noted in its section).
Evidence: `shots/photo-acceptance-20260806/<id>/` (+ `<id>/oracle/` pairs,
`measures.json`, leo2a7v `yaw90/`).

**Live-tree timestamps (captures 2026-08-07T00:58:49–00:59:27Z = 17:58–17:59 -0700):**
at capture, git status showed profiles/{abrams,kit,leopard,merkava,patton,russia}.js
DIRTY (live agents) — the **leo2a7v verdict binds to the live leopard.js WIP**
(mtime 17:48, ten minutes before capture). modern1/2/3.js, profiles/ww2.js,
profiles/uk.js, userdrops5.js were clean vs HEAD (t14 = committed 797c878 state
despite the modern2 live lane; challenger_3 NOT scored — mid-build per brief).

---

## VERDICT TABLE

| tank | proportions | detail /10 | acid ("reads as the real vehicle at a glance?") | worst 3 orders |
|---|---|---|---|---|
| spz_puma | **FAIL** | 6 | No — reads as an armored cargo container on tracks | skirt band lift; bow sweep rebuild; turret mass cut |
| type89 | **FAIL** | 5 | No — barge hull, turret reads recessed sliver | wheel exposure; glacis run; turret presence |
| k2 | **FAIL (marginal)** | 7 | Almost — modern wedge MBT yes, K2 stance no (no visible gear) | wheel exposure; turret face height; bow wall soften |
| type99a | **FAIL** | 6 | No — cold-war drum-turret tank wearing ERA, not the 99A wedge | turret rebuild to wedge; wheel exposure; ERA two-band split |
| m4a3e8 | **FAIL** | 6 | No — tall shoebox with a Sherman-ish turret | glacis plane; HVSS bogie pairing; sponson line |
| tiger1 | **FAIL (marginal)** | 7 | Half — turret/gun yes, running gear instantly not-Tiger | interleaved gear; fender shelf; stern overhang trim |
| t34_85 | **FAIL** | 5 | No — steep-nosed slab with a faceted box turret | glacis 30° re-lay; cast-turret reshape; sloped side band |
| leo2a4 | **FAIL (marginal)** | 6 | Almost — leo2 grammar there, stance/balance off | wheel exposure; bow cliff; turret slab presence |
| challenger2 | **FAIL** | 6 | No — cliff bow + gunwale ledge kill it (oracle diff decisive) | wheel exposure; bow rebuild; delete sponson ledge |
| t14 | **FAIL** | 5 | No — reads as a landship/KV-5, not Armata (oracle diff decisive) | turret castle cut; wheel exposure; arrow-nose plan taper |
| leo2a7v | **FAIL (structural)** | 5 | No — reads as a casemate SPG; turret IS a hull-length slab | re-parent/cut the 6.0 m turret band; wheel exposure; bow |
| fv510 | **FAIL (marginal)** | 7 | Half — Warrior-ish, bow + deck clutter break it | bow sweep; deck clutter cut; freeboard band slim |

**Fleet result: 0/12 pass the §B8 bar today.** Three (k2, tiger1, fv510 — and
leo2a4 close behind) are one-focused-round fixes. The owner's rejection of
puma/type89 generalizes: the same failure classes run the whole 2026-08-06 slate.

**The two fleet-wide classes (see CALIBRATION):** (1) BURIED-WHEELS — skirt/side
curtain dropped to track-bottom on 9/12 builds, wheels <20% exposed where the real
vehicles show 40–70%; (2) BOW CLIFF — tall flat front wall where the real vehicle
has one long glacis sweep (8/12).

---

## spz_puma — PROPORTION FAIL (one of the two owner-rejected; oracle registered)

Measured (probe, meters): overall 7.615 L × 3.890 W × 3.649 H vs pub 7.6/3.9/3.6
— **envelope numerically perfect (+0.2%/-0.3%/+1.4%)**, which is exactly why the
self-read passed and the owner still rejected it: the mass distribution inside the
envelope is wrong. Turret box 1.84 w × 1.65 h × 2.06 l seated y1.99, pivot z −1.37
(matches the oracle print's −1.319 ✓); muzzle y 2.55 (bore-line ✓ vs deck ~2.55);
hull box tops 3.209.

Oracle diff (pairs, left/front/frontleft/top): the print shows the real read —
big exposed 6-wheel band under a HIGH skirt edge, one long glacis sweep, compact
low RCT30 cleaver, plan-tapered bow. The proc:

- **Side curtain:** the armor band runs from near wheel-hub height to the deck in
  one unbroken vertical wall — ~60% of total height. Print: armor band ~0.9–1.0 m
  tall with wheels ~55–60% exposed below. The proc exposes ~15%.
- **Bow:** chopped multi-facet nose unit; at frontleft the vehicle reads as a slab
  box with a separate parked bow. Print: ONE sloped bow plane, the vehicle's
  defining feature, with intake louvers riding the right deck slope.
- **Turret:** a tall manned-looking box (face ~0.9–1.0 m above deck, near-vertical
  sides). RCT30 is an unmanned low cleaver, face ~0.6–0.7 m, sides raked.
- **Front view:** flat wall with vertical panel seams; print reads trapezoid
  (skirts flare, upper hull tucks). **Rear view:** two-story flat wall, ramp panel
  reads ~55% width; print ramp is full-width with bevels.
- **Plan:** straight rectangle; print tapers the bow third (boat nose).

Acid per view: front NO / frontleft NO / left NO / rearleft NO / rear NO /
rearright NO / right NO / frontright NO / top PARTIAL / heroes NO.

**ORDER LIST (gross form first):**
1. SIDE BAND SPLIT — raise the skirt/armor lower edge from ~0.45 to ~0.95–1.05;
   put the armor band top step at ~1.95–2.05; wheels (r 0.36 — size is right)
   must read 55–60% exposed. This single order fixes left/right/rear reads most.
2. BOW SWEEP — one-piece sloped bow from bumper (y≈1.05, z≈+3.8) to deck
   (y≈2.55, z≈+1.9); kill the chopped nose unit; driver strip + louvers on it.
3. TURRET MASS CUT — block roof ~2.80 (from ~2.95-3.0 visual), rake side faces in
   8–12°, keep the PERI mast to 3.6; the cleaver read, not a crew box.
4. PLAN TAPER — bow-third taper both sides; deck rails inboard.
5. REAR — full-width ramp panel + light clusters; pull stern furniture inside
   z ±3.8 (hull z max currently 3.816).
6. FRONT STANCE — skirt flare / upper-hull tuck so the front reads trapezoid.

Detail 6/10 (ROSY, MUSS, rails, Y-514, whips present and scaled sanely).

---

## type89 — PROPORTION FAIL (the second owner-rejected; photo class, no oracle)

Measured: overall 7.358 × 3.200 × 3.268(whip) vs pub 7.3/3.2/2.5-roof — length,
width, muzzle overhang (+0.48 m over bow vs ~0.5 real) all ✓. Hull 6.875 vs 6.8 ✓.
Turret x-center +0.25 (offset RIGHT ✓ per doc), z ≈ mid ✓. Bore y 2.10 ✓ vs KDE
trunnion ~2.0–2.1. The envelope is again spec-true; the read fails:

- **Barge side:** hull wall swallows ~70% of the 6 roadwheels. Real Type 89: thin
  upper skirt strip only, wheels nearly fully visible, strong fender line.
- **Glacis:** real ~30°-from-horizontal raked plate running ~1.7–1.9 m of z;
  proc bow reads ~1.0 m chopped run + nose step — profile reads rectangle.
- **Turret presence:** real two-man turret stands ~0.75 m proud with the thick
  KDE mantlet block and BIG Jyu-MAT boxes flanking; proc turret reads a recessed
  angular sliver, missile boxes not readable in profile (turret w 2.14 measured —
  the mass exists but sits low/flush).
- **Roof MG:** the hero shows an M2-silhouette pintle gun atop the turret. The
  real Type 89 carries NO roof HMG (35 mm + coax + Jyu-MAT only). Verify and
  remove if fictional — §B7 ref-wrong class.

Acid: front NO / left NO / rear NO / top PARTIAL / heroes NO.

**ORDER LIST:**
1. WHEEL EXPOSURE — expose 60–70% of the 6 wheels; skirt = thin fender strip;
   fender line step at ~1.85.
2. GLACIS RUN — raked bow plane from nose y≈0.9 to deck y≈1.9 over ~1.7–1.9 m z.
3. TURRET PRESENCE — raise the turret read to ~0.75 proud, near-vertical walls,
   KDE mantlet block, Jyu-MAT boxes readable in side profile (the vehicle's tell).
4. Remove the roof HMG unless referenced (owner photos show none).
5. Rear door/firing-ports face read (currently generic slab).

Detail 5/10.

---

## k2 — PROPORTION FAIL (marginal — single dominant order)

Measured: 10.809 × 3.620 × 3.069(K6/pano) vs pub 10.8/3.6/2.4-roof ✓✓; hull 7.505
vs 7.5 ✓; turret roof plane at the doc's EXACT 2.40 line ✓; turret l 3.46 = 46% of
hull ✓; bore y 1.96 ✓; muzzle z 7.05 → visible run 6.0 (spec true-up to 6.6 already
filed in the packet — not re-ordered here). The wedge grammar, KAPS cheek plates,
slot bay, roof cluster all read in front view. This is the closest build.

- **The kill:** skirt curtain to track-bottom — 6 ISU wheels ~10% exposed. The
  K2's visible lower-half wheels are part of its stance; left view reads hovercraft.
- Minor: hull deck 1.776 (real ~1.6–1.65) squeezes the turret face to 0.62 vs the
  real ~0.75–0.8 — turret reads a touch squat; front lower hull a mild flat wall.
- Front view otherwise reads K2 (cheek sweep, KAPS, slot, '325' scheme grammar).

Acid: front YES-at-a-squint / left NO (gear) / rear PARTIAL / top YES / heroes
PARTIAL.

**ORDER LIST:**
1. WHEEL EXPOSURE — skirt bottom to hub line (~0.55–0.6); 6 dished wheels' lower
   halves visible; keep the stepped-sawtooth lower edge (present, keep).
2. TURRET FACE — take the deck to ~1.65–1.70 or the roof stays 2.40 and the face
   gains ~0.1: target face ~0.72–0.78. (Roof line itself is law-exact — keep.)
3. BOW — soften the lower front wall (short glacis break + fender horns).

Detail 7/10 (KAPS/KGPS/KCPS/K6 all present and placed per doc).

---

## type99a — PROPORTION FAIL

Measured: 11.019 × 3.500 × 2.819(cluster) vs pub 11.0/3.5/2.35-crest ✓ envelope;
hull 7.605/7.6 ✓; low deck 1.641 (t72 lineage ✓); bore y 1.76 ✓ vs ~1.75. But:

- **The turret is the wrong SHAPE CLASS:** reads as a tall rounded drum/cast
  turret with a cylinder mid-section and a big cupola drum — a T-55/centurion
  read. The 99A's identity is the LOW WELDED WEDGE: flat cheek planes meeting the
  arrow seam, face ≤0.7 m, flat roof at the 2.35 crest, angular plan. Turret-mass
  probe: y up to 2.819 with the visual roof ~2.5+ — the wedge is simply not there.
- **Buried wheels:** 6 big dished wheels ~10% exposed behind a full-drop skirt.
- **ERA wallpaper:** tile bumps run bow-to-stern including the sponson band. Real:
  ERA on glacis + skirt FRONT HALF + cheeks; rear half rubber flaps/bar — the side
  needs the two-band split to read 99A.
- Turret-group mass reaches y 0.106 (basket/underhang into the hull shadow) —
  check it isn't visible below the ring at yaw (§B5-adjacent).

Acid: front PARTIAL (glacis ERA field reads) / left NO / rear PARTIAL / top NO
(round turret plan) / heroes NO.

**ORDER LIST:**
1. TURRET REBUILD to the wedge — flat raked cheeks meeting the arrow front seam,
   face ≤0.7 above deck, FLAT roof at 2.35, trapezoid plan, squared bustle; flush
   hatches + low pano (kill the drum cupola read).
2. WHEEL EXPOSURE — skirt to hub line, 6 dished wheels' lower halves visible.
3. SIDE TWO-BAND SPLIT — ERA tiles front half of skirt only; clean band above;
   flaps/bar rear half.
4. Front fender flare — pull to the t72-flat read between fenders.

Detail 6/10 (roof cluster, log + drums present).

---

## m4a3e8 — PROPORTION FAIL

Measured: 7.607 × 3.066 × 3.100 vs pub 7.52/3.0/2.97 (+1.2/+2.2/+4.4%) — inside
photo tolerance; hull 6.347/6.27; widest element measures ±1.533 vs the doc's "track outer faces
±1.50 EXACT" §D guard — either legal kit overhang or track drift; builder to
verify which; bore y 2.53 ✓.

- **Shoebox side:** hull side is one tall flat rectangle to the track top — no
  sponson-bottom line, no lower-hull tuck; reads M113. Real Sherman: upper hull
  slab, sponson shadow line ~1.05–1.15, narrower lower hull behind the gear.
- **Glacis:** the front reads mostly vertical — the rounded transmission nose
  occupies ~55–60% of front height and the sloped plane is short and broken by
  hatch pods. Real 47° single-piece glacis = one long clean plane, hatches ON it,
  nose housing ≤40% of front height.
- **HVSS pairing missing:** 6 wheels EVENLY spaced. The E8 signature is 3 bogies
  — pairs (intra-pair gap ~0.08–0.12 m) separated by ~0.35–0.45 m, plus bogie
  frames and 5 return rollers (rollers not readable in profile).
- Rear deck: no step-down behind the turret; stern slab overhangs the idler.

Acid: front NO / left NO / rear NO / top PARTIAL / heroes NO (turret alone reads
Sherman — cupola, oval hatch, 76 mm brake all present).

**ORDER LIST:**
1. GLACIS — one clean 47° plane full-width between fenders, crest meeting the
   deck at z≈+1.2–1.5; transmission nose ≤40% of front height.
2. HVSS — regroup to 3 paired bogies + frames + return rollers; keep 6 wheels.
3. SPONSON LINE — side split at ~1.05–1.15 with the lower hull tucked in.
4. REAR DECK STEP — drop aft deck ~0.10–0.15 with grills; stern flush over idler.
5. Verify the ±1.533 widest element vs the §D ±1.50 track-face guard (kit or drift).

Detail 6/10.

---

## tiger1 — PROPORTION FAIL (marginal — the gear is the whole story)

Measured: 8.701 × 3.728 × 3.088 vs pub 8.45/3.71/3.0; muzzle z 5.297 = doc's
+5.295 ✓; **tail at −3.405 vs the ratified −3.16 hull line (+0.245 overhang —
stern furniture outside the plane)**; superstructure roof ≈ turret seat 1.96 ✓
(real ~2.0); width ±1.864 vs §D ±1.855 (+0.5% ok); bore y 2.36 ✓; turret + drum
cupola + flat-drum KwK36 brake + shrouded stacks all read RIGHT.

- **The interleave is missing:** profile shows FIVE evenly-spaced big discs with
  track visible between them — the T-34 pattern. Real Schachtellaufwerk: 8 outer
  axles at ~0.56–0.6 m pitch on ~0.8 m wheels — a continuous overlapping scallop
  with inner-row wheels dark in the gaps, NO track visible between wheel tops.
  Anyone who knows the Tiger reads the gear first; it fails instantly.
- Fender shelf line over the wheels is weak/absent.

Acid: front PARTIAL / left NO (gear) / rear PARTIAL / top YES / heroes PARTIAL.

**ORDER LIST:**
1. INTERLEAVED GEAR — 8 outer axles, pitch ~0.56–0.6, dia ~0.78–0.8, overlapping;
   inner row peeking dark between; no track run visible between wheels.
2. FENDER SHELF — thin continuous shelf at ~1.0 directly over the wheel band.
3. STERN — pull the rear slabs/bin inside the −3.16 plane (currently −3.405);
   stacks stay.
4. Turret horseshoe — round the front third a touch (secondary).

Detail 7/10 (stacks, Feifel hints, crosses, '212', S-mine pots).

---

## t34_85 — PROPORTION FAIL

Measured: 8.125 × 3.057 × 3.021 vs pub 8.1/3.0/2.72-crest ✓ envelope; hull 6.119 ✓,
5 wheels ✓ count, rear sprocket/front idler ✓; bore y 2.05 ✓; muzzle +5.04 ✓.

- **Glacis angle:** profile bow reads ~45° from horizontal with the nose tip high
  (~0.8). Real: 60°-from-VERTICAL = ~30° from horizontal, nose beak at y≈0.55–0.6,
  horizontal run ~1.8–1.9 m — the single most identifying line on the vehicle.
- **Turret shape class:** reads as a faceted slab-sided wedge box (hard cheek
  seam, flat side walls, slab top-rear) — IS/Panther-adjacent. Real: composite
  CAST dome — rounded everywhere, cheek facets subtle, narrow front collar at the
  ZiS root. Footprint (2.37 l × 2.33 w) is right; the shape isn't.
- **Vertical hull sides:** the upper side band should lean IN (~40°-class upper
  band above the wheels); proc sides read vertical, fenders weak.
- Wheels: 5 big Christie discs present but visually suppressed behind the heavy
  track side run; drums not readable (doc claims ×3 round drums).

Acid: front NO / left NO / rear PARTIAL / top PARTIAL / heroes NO.

**ORDER LIST:**
1. GLACIS RE-LAY — 30°-from-horizontal plane, beak at y≈0.55–0.6 (z≈+3.0), crest
   at the roof front edge; kill the blunt under-nose band (beam reads as a stem).
2. TURRET RESHAPE — cast-dome read: rounded cheeks blending to a domed roof,
   curved plan, collar at the gun root; keep footprint.
3. SIDE BAND — upper hull side leans in; fenders directly atop wheels.
4. WHEEL PROMINENCE — thin the track side run so the 0.83-dia perforated discs
   dominate the band.
5. Drums ×3 on the rear side slopes (identity kit).

Detail 5/10.

---

## leo2a4 — PROPORTION FAIL (marginal)

Measured: 9.660 × 3.703 × 2.790(PERI/MG) vs pub 9.67/3.70/2.48-roof ✓✓; hull 7.810
vs 7.72 (+1.2%); turret l 3.256 = 42% of hull ✓, box turret ✓ vertical faces ✓;
bore y 2.00 ✓; 7 wheel bottoms countable under the skirt ✓ count.

- **Buried wheels (the read-killer):** ~15% exposure turns the correct leo2 hull
  into a barge and makes the correct-size turret read small — the hull/turret
  BALANCE is what the eye flags. Real 2A4: skirts to mid-wheel, 7 wheels obvious.
- Bow: mild cliff — lower front wall reads tall; the leo2 nose is mostly track
  horns + shallow glacis.
- Skirt fore-blocks are present but weak (real 2A4 fore blocks are heavy/sculpted).
- Wegmann banks / bustle rack read weak in profile (detail order).

Acid: front PARTIAL / left NO (stance) / rear PARTIAL / top YES / heroes PARTIAL.

**ORDER LIST:**
1. WHEEL EXPOSURE — skirt bottom at hub line; 7 wheels' lower halves visible;
   heavy fore-block emphasis at the skirt front.
2. BOW — shorten the vertical lower front; track horns + shallow glacis read.
3. TURRET PRESENCE — with the stance fixed, verify the face reads ~0.95–1.0 over
   the deck; strengthen bustle rack + smoke banks in profile.

Detail 6/10.

---

## challenger2 — PROPORTION FAIL (oracle diff decisive)

Measured: 11.505 × 3.533 × 3.228(GPS/pano) vs pub 11.5/3.52/2.49-roof ✓✓; hull
8.343/8.33 ✓; oracle (challenger_ii.glb extract): bodyLen 8.036, W 3.519, overall
11.01 — proc within +3.8%/+0.4% (print carries −4%-class stylization; pub dims
sovereign). Turret 4.225 l × 3.06 w seated 1.55 ✓ footprint. Bore y 1.90 ✓.

Oracle pairs (left, frontleft):
- **Wheels:** print shows 6 big Hydrogas wheels ~60% exposed under a scalloped
  skirt; proc buries them completely — track links only.
- **Bow:** print = low swept nose, track horns proud, skirt front step; proc = a
  TALL VERTICAL CLIFF with a horizontal upper band — fortress wall, worst-in-class
  bow miss alongside puma/t14.
- **Gunwale ledge:** proc carries a full-length protruding horizontal shelf above
  the skirt line that exists nowhere on the vehicle — delete class.
- **Turret:** proc face reads squat pillbox + roof boxes; print face is taller
  with the Dorchester slope carrying up to the roof line.

Acid: front NO / left NO / rear PARTIAL / top PARTIAL / heroes NO.

**ORDER LIST:**
1. WHEEL EXPOSURE — 6 wheels, skirt bottom ~hub line (y≈0.55–0.6), scalloped
   lower edge per print.
2. BOW REBUILD — glacis from deck y≈1.78 down to nose y≈0.95–1.05 at the print's
   shallow angle; track horns proud; kill the cliff + its horizontal band.
3. DELETE the sponson LEDGE (full-length shelf above the skirts).
4. TURRET FACE — rake the cheek/face planes up to the roof line (print read:
   ~30–35° elevation rake), face reads TALLER; keep roof furniture.

Detail 6/10 (smoke banks, bins, panels present).

---

## t14 — PROPORTION FAIL (worst-in-class with puma; oracle diff decisive)

Measured: 10.785 × 3.900 × 3.320(mast) vs pub 10.8/3.9/2.7-roof+3.3-mast ✓✓; hull
8.688/8.7 ✓; oracle extract: bodyLen 8.619 ✓ W 3.901 ✓. Envelope perfect — read
catastrophic:

- **Castle turret:** turret mass 1.82 m tall (y 1.5→3.32) shaped as a narrow-top
  pyramid — reads battleship superstructure/KV-5. Real (print): LOW WIDE faceted
  shroud, flat-topped, face ~0.9 m, slim mast cluster rear-right; roof plane
  ~2.55–2.7.
- **Buried wheels:** print shows SEVEN fully-readable wheels under the two-band
  side (ERA panels front half, bar screen rear half, AIR under the bar band);
  proc drops one continuous grated curtain to the ground.
- **No arrow nose:** top view shows a pure rectangle plan with a flat front edge;
  the T-14 bow tapers ~1.5 m into the blunt arrow tip with the raised driver
  strip. Front view = tall cliff.
- Rear: tall slab vs the print's low ramp + exhaust boxes.

Acid: every view NO except top-PARTIAL (deck furniture ok).

**ORDER LIST:**
1. TURRET — cut to the low wide shroud: face ~0.9–1.0 above seat (target turret
   mass h ≈ 1.0–1.1, roof plane 2.55–2.7), FLAT top, faceted knuckle planes,
   arrow front; slim mast cluster; kill the pyramid.
2. WHEEL EXPOSURE — 7 wheels 50–60% visible; ERA front half / bar screen rear
   half WITH the air gap under the bar band.
3. ARROW NOSE — plan-taper the front ~1.5 m to the blunt tip + driver strip;
   shallow glacis; kill the cliff.
4. REAR — low ramp read + exhausts; trim the tall slab.
5. Deck — flat and low around the shroud (no ramp-up to the turret base).

Detail 5/10 (APS tubes/EO corners exist but are lost in the mass errors).

---

## leo2a7v — PROPORTION FAIL (STRUCTURAL; binds to live leopard.js WIP @17:48)

Measured: 10.950 × 4.003 × 2.700 vs pub 10.97/4.0/2.64 ✓ envelope. **But the
turret-mass box spans z −2.775 → +3.25 = 6.03 m long — 77% of the 7.79 m hull.**
The probe is scene-graph truth (meshes under rig_turret, rig_gun excluded), and
the yaw=90 render (shots/photo-acceptance-20260806/leo2a7v/yaw90/view-top.png)
CONFIRMS: the entire hull-length superstructure swings with the turret and
overhangs both hull sides. Two consequences:

1. **Proportion:** rest-pose reads as a casemate SPG / Archer-class — turret and
   hull merge into one continuous long body with its front edge near the bow.
   Not a Leopard at any distance.
2. **Function (§B5-adjacent, inverse case):** rotating the turret in game swings
   a hull-sized slab — a hull-board riding the turret. The §C.1 yaw-stranded
   audit's mirror image (mass that SHOULD stay still, rotating).

Real A7V: turret front (wedge tip incl mantlet) reaches ~z +1.9 max on this
frame; turret length ≤ ~4.3 incl bustle.

Acid: every view NO (left/frontleft read casemate; top-at-yaw is conclusive).

**ORDER LIST:**
1. RE-PARENT or CUT the forward band: everything turret-parented forward of
   z ≈ +1.9 either belongs to the hull (re-parent; then §C.1 yaw audit both
   modes) or must go; target turret z-span ≤ ~4.3 (−2.4..+1.9), currently 6.03.
2. WHEEL EXPOSURE — 7 wheels, family order (same numbers as leo2a4).
3. BOW — leo2 shallow glacis + nose dip; kill the cliff.
4. TURRET FACE — after the cut, restore the A7 wedge read (face taller than the
   current low glasshouse; roof 2.64 with sights ~3.0).

Detail 5/10. NOTE: leopard.js was dirty (live agent mid-round) at capture — this
verdict timestamps that WIP; re-render before rework briefing.

---

## fv510 — PROPORTION FAIL (marginal; closest to pass with k2/tiger1)

Measured: 6.390 × 3.033 × 3.665(masts) vs pub 6.34/3.03/2.8-roof ✓ (+0.8% L);
RARDEN muzzle z 3.12 vs bow 3.219 — does not clear the nose ✓ (the Warrior tell);
turret offset LEFT (pivot x −0.2, muzzle x −0.3) ✓ correct; turret footprint
2.37 × 2.045 vs the repaired-oracle envelope ✓. Oracle print itself reads −11%
undersized vs pub (extract overall 5.646 vs 6.34) — **pub dims stay sovereign;
use the print for SHAPE only.**

- Wheels: ~40% exposed — best in the slate, near-pass; thin the heavy track-edge
  trim slightly.
- **Bow:** the Warrior's long ~20° glacis sweep from nose to flat deck is replaced
  by a steep short bow + TALL flat face — cliff class again.
- **Deck clutter line:** full-length roof rail band + stacked boxes/jerry cans
  raise the visual freeboard; hull side above tracks reads ~1.2–1.3 + rails vs
  the real ~0.9–1.0 clean wall; hull-group meshes reach y 3.319 (whips aside,
  verify nothing solid rides that high).
- Turret read close (RARDEN thin tube ✓, small mantlet ✓, masts ok).

Acid: front PARTIAL / left PARTIAL / rear PARTIAL / top YES / heroes PARTIAL —
"half a Warrior."

**ORDER LIST:**
1. BOW SWEEP — one glacis plane nose→deck (~20°, run ~1.6–1.8 m); kill the tall
   flat face.
2. DECK CLUTTER — drop the continuous rail band + roof stacks to sit below the
   turret shoulder; hull side band target ~0.9–1.0 above tracks.
3. TRACK EDGE — thin the dark edging so the 6 wheels read at ~50%.

Detail 7/10.

---

## CALIBRATION NOTES — what the builder self-reads missed (for spawn-builder)

Named classes, in fleet priority order. Every one passed dims + §B batteries and
died at the glance test — encode them as explicit brief checks:

1. **BURIED-WHEELS (9/12: puma, type89, k2, type99a, leo2a4, challenger2, t14,
   leo2a7v, +t34_85's suppressed discs).** Builders drop skirts/side walls to
   track-bottom; no measure in any battery reads wheel EXPOSURE. Encode: "wheel
   exposure fraction" per family — skirted MBTs 40–60% of wheel visible below the
   skirt edge (skirt bottom ≈ hub line), IFVs per photos, WW2 unskirted = full
   gear readable. A left-view render where you cannot count the wheels is an
   automatic proportion FAIL.
2. **BOW CLIFF (8/12).** The front face reads as a tall flat wall; spec length
   anchors nose z but nothing constrains the GLACIS PLANE. Encode per tank: the
   glacis horizontal run + nose height as target numbers in the brief (e.g. t34
   run ~1.85 m, beak y 0.55; puma bumper→deck sweep 1.9 m).
3. **TURRET-SILHOUETTE CLASS (type99a drum, t14 castle/pyramid, t34_85 slab-facet,
   puma manned-box, challenger2 squat-face).** Footprint ratios pass while the
   shape grammar is from the wrong family. Encode: turret face height above deck,
   roof-plane height, and a one-line shape grammar ("low flat-top faceted shroud",
   "cast dome", "welded wedge ≤0.7 face") the critic can falsify per view.
4. **STRUCTURE-MERGE (leo2a7v).** Turret-parented mass spanning toward the bow —
   turret z-span 77% of hull length. The tmp-b8-measure probe catches it in one
   number: **flag any turretMass length > ~55% of hull length**; confirm with a
   yaw=90 top render. Candidate standing check at round close.
5. **GEAR-ARRANGEMENT (m4a3e8 HVSS pairing, tiger1 interleave).** Count passes,
   PATTERN fails. Encode arrangement, not count: pitch pattern (pairs/interleave),
   raised-end geometry, return-roller presence.
6. **DETAIL CANNOT RESCUE FORM.** Every build carries a competent greeble kit;
   self-reads scored decoration + dims and never re-asked the owner's question.
   §B8's point, now demonstrated across 12 builds: order gross-form corrections
   FIRST, freeze detail work until the proportion gate passes.

## LAW / TOOLING DISCOVERIES

- **tmp-b8-measure.html / tmp-b8-batch.mjs (this round's scratch):** the four-box
  probe (overall / hull-minus-turret / turret-minus-gun / gun + rig_muzzle world)
  put numbers on every order above and caught the leo2a7v merge blind. Worth
  promoting to an official round-close check beside winding-audit (the
  turret-fraction + envelope-vs-pub rows in particular). Currently tmp-* per
  constraints; measures banked at shots/photo-acceptance-20260806/measures.json.
- **Envelope-parity is a false comfort:** 12/12 builds match published dims within
  ~±4% and 12/12 fail the glance test — dims-sovereignty verifies the BOX, §B8
  verifies the MASS INSIDE THE BOX. The two are independent gates.
- **tmp-tank-critic pair framing:** each pane normalizes to its own bbox, so
  proc-vs-ref SCALE differs when gun/stern furniture differs (challenger2 pairs).
  Fine for shape reads; do not eyeball absolute sizes off pairs. A matched-scale
  pair mode (frame both to the REF box) would make proportion diffs one-glance.
- **fv510 oracle undersize:** print measures −11% vs pub overall (5.646 vs 6.34)
  — shape-only oracle, pub dims sovereign (already the program's law; confirmed
  live here).
- **t14 oracle is local-only** (gitignored community-candidates/) — pairs render
  fine locally; a re-run on a fresh clone will silently lose the t14 REF pane.
- **leo2a7v §B5-inverse case:** the yaw-stranded audit (§C.1 mode 2) flags mass
  that fails to rotate; the a7v defect is the MIRROR — hull-scale mass that DOES
  rotate. The same rest/yaw-90 diff detects it if the checker also flags
  turret-footprint mass OUTSIDE the ring radius envelope.

## RESPAWN PRIORITY (hardest first, per the round brief)

t14 + leo2a7v (structural) → spz_puma + challenger2 (bow+band+turret) → type99a +
t34_85 (turret identity) → type89 + m4a3e8 (band/glacis/gear) → leo2a4 + k2 +
fv510 + tiger1 (single-dominant-order marginals).

*Critic: independent photo-parity acceptance lane, §B8. Evidence tree:
shots/photo-acceptance-20260806/ (16 views/tank, oracle pairs ×5, measures.json,
leo2a7v yaw90). No src edits, no commits, rigs untouched (official pages used
as-is; scratch: tools/tmp-b8-measure.html, tools/tmp-b8-batch.mjs).*

---
---

# RESIT — §B8 ACCEPTANCE RE-ADJUDICATION of the two owner rejections
# (independent critic #2, 2026-08-07T02:42Z captures)

**Scope:** spz_puma + type89 only — the two owner-rejected builds, reworked and
landed at **c64aac8** ("IFV §B8 rework LANDED"). Scoring contract: the per-tank
ORDER LISTS above, CLOSED or not. Same method as the original slate: official
photoclass 16-view set + tmp-b8-measure four-box probe + puma REF|PROC oracle
pairs (tools untouched, tracked pages byte-clean vs HEAD; tmp-b8-batch.mjs one
FIFO hold). Evidence: `shots/b8-resit-20260806/{spz_puma,type89}/`
(+ `spz_puma/oracle/` ×14, `measures.json`).

**Tree state (live-tree law):** captures bound to src/vehicles/modern3.js blob
`1002f15e` = HEAD state at c64aac8; one unrelated landing (9e44130, leopard
lane) occurred mid-resit and touches neither modern3.js nor these packets —
hash bracket #2 post-dates it and is byte-identical, so every verdict below
binds to the current tree too.

## RESIT VERDICT TABLE

| tank | proportions | detail /10 | acid ("reads as the real vehicle at a glance?") | orders |
|---|---|---|---|---|
| spz_puma | **PASS** | 7 | Yes — high one-piece bow, heavy 1.0 m module band over six countable wheels, low raked RCT30 cleaver + PERI mast | none (2 notes) |
| type89 | **PASS** | 7 | Yes — long 27° glacis wedge, proud winged two-man turret, thick 35 mm w/ flash hider overhanging the bow | none (1 note) |

**Both rejections are resolved. 2/2 pass the §B8 bar.** The claimed root cause
(FLAT-SLAB GLACIS BUG — both frustum rings spanning the full bow z) is verified
in code at both sites: the rework authors bottom-ring-at-nose / top-ring-at-crest
(puma modern3.js `frustum(1.26,3.72,3.58, 1.42,1.77,1.63, 1.40,1.92)`; type89
`frustum(1.42,3.36,3.20, 1.30,1.60,1.44, 0.90,1.86)`) — the front face IS the
plane in both, and the profile renders confirm the rectangle/parked-bow reads
are gone.

## FOUR-BOX VERIFICATION (landed claim vs independent resit — official probe)

| measure | landed claim | resit | verdict |
|---|---|---|---|
| puma overall l | 7.590 (z −3.790..+3.800) | 7.590 (z −3.790..+3.800) | ✓ exact |
| puma overall w × h | 3.890 × 3.649 (mast raw 3.64) | 3.890 × 3.649 | ✓ exact |
| puma turretMass x | [−0.830, +1.010] center **+0.09** | [−0.830, +1.010] center +0.09 | ✓ exact (was +0.375) |
| puma turret pivot | [0.15, 2.03, −1.374] | [0.15, 2.03, −1.374] | ✓ exact |
| puma muzzle world | [0.085, 2.55, 2.466] | [0.085, 2.55, 2.466] | ✓ exact (print x held) |
| puma turret/hull l | — | 2.06/7.59 = 27% | ✓ §B8.1-4 clear |
| type89 muzzle z | 3.90 (overall 7.3 held) | 3.900 → overall 7.358 (+0.8% pub) | ✓ exact |
| type89 hull l | 6.865 (pub 6.8) | 6.865 | ✓ exact |
| type89 glacis | 27° over 1.86 m, nose 0.90 | endpoints (0.90,3.36)→(1.86,1.60) = 28.6° over 1.76 m; incl. bow-face lip = 27.3° over 1.86 m | ✓ ordered window (~30°, 1.7–1.9 m) — datum note below |
| type89 turret proud | 0.72 incl cluster (walls 0.56) | roof/chamfer 2.42, sight 2.49, cupola lid 2.52 vs deck 1.78 → 0.64 solid / 0.71–0.74 cluster | ✓ ordered ~0.75 within read noise |
| type89 turretMass | w 2.20 (wings), z −1.215..+0.750 | w 2.20, z [−1.215, +0.750]; center x +0.25 RIGHT | ✓ exact; l 29% §B8.1-4 clear |

## spz_puma — PROPORTION PASS (original orders 1–6 CLOSED)

Oracle pairs at 14 matched views (the print is the proportion truth):

1. SIDE BAND SPLIT — **CLOSED.** Band 0.62..2.13 → 1.00..2.00 in two courses
   (upper tucked 1.66..1.80, lower flared 1.70..1.86). Left/right views count
   6 wheels + HIGH sprocket + raised idler at a glance (wheel top 0.79 sits
   fully below the 1.00 band edge, tub wall behind) — §B8.1 gate 1 PASS; the
   pair matches the print's band-over-wheels read.
2. BOW SWEEP — **CLOSED.** ONE plane (1.40, 3.72)→(1.92, 1.77) + break wedge
   to the 2.085 deck = the print's own extract line ((1.40,3.72)→(1.92,1.63),
   crest within 0.14 z); shelf + chamfer deleted; louvers ON the plane
   (rx +0.261); the frontleft/hero pairs no longer show a "parked bow". Note:
   the original order's "deck y≈2.55" was a misread (2.55 is the bore line;
   the deck is 2.085) — the rework correctly followed the print.
3. TURRET MASS CUT — **CLOSED.** Crown 2.785 (~2.80 ordered), walls raked
   11–13°, face reads 0.70 above deck (ordered 0.6–0.7 cleaver), mast stepped
   to 3.60 EXACT (heightM datum). Reads unmanned cleaver, not a crew box.
4. PLAN TAPER — **CLOSED.** ±1.42→±1.26 over the bow plane + shoulder facets;
   top pair shows the taper (subtler than the print's boat nose — acceptable,
   print-mapped).
5. REAR — **CLOSED.** Ramp face ±1.44 full-width + hinge line + posts +
   taillights; stern furniture inside z ±3.8 (probe z max +3.800, overall
   7.590 vs the original 7.615 overhang).
6. FRONT STANCE — **CLOSED.** Two-course flare/tuck reads trapezoid in the
   front pair.

Owner's direct orders: turret re-centered +0.375→+0.09 with the gun tube held
at the print's world x 0.085 ✓; track shape already the bradley raised-end
trapezoid class (print-true gear unchanged) ✓.

Acid per view: front YES / frontleft YES / left YES / rearleft YES / rear YES
(tall flat face matches the print's own rear; full-width ramp now frames it) /
rearright YES / right YES / frontright YES / top YES-at-a-squint (taper subtle,
unmanned-turret plan correctly faint) / heroes YES.

Detail 7/10 (ROSY, MUSS, Spike pod, rails, tow-cable re-route on the band step,
Y-514 all read). NOTES (not orders): (a) muzzle-endon bore disc reads mid-grey
rather than near-black under photoclass light — one-tone touch if a later
round is open anyway; (b) bow-corner mirror pods read chunky at close range —
certified width carriers (packet residual 4), leave unless the owner asks.

## type89 — PROPORTION PASS (original orders 1–5 CLOSED)

1. WHEEL EXPOSURE — **CLOSED.** 6-panel skirt bank DELETED → thin strip
   0.92..1.12 over the track top only; 6 wheels + both raised end wheels read
   near-fully in profile; strong fender line (planks 1.27..1.32 + shadow strip
   1.26). §B8.1 gate 1 PASS. Note: the original order's "fender step at ~1.85"
   was internally inconsistent with its own 60–70% exposure demand over 0.64 m
   wheels (a 1.85 line would rebuild the barge wall); the landed 1.26–1.32
   fender-over-wheel-tops line is the photo-true resolution.
2. GLACIS RUN — **CLOSED.** One raked plate, nose 0.90 EXACT, crest 1.86,
   ~27–29° over 1.76–1.86 m (ordered ~30° over 1.7–1.9). Profile reads the
   long-glacis wedge — the Type 89 identity line. Prow side walls close the
   profile under the plane edge (no see-through at the sprocket bay).
3. TURRET PRESENCE — **CLOSED.** Near-vertical (~4°) walls 0.56 proud, 0.64
   solid / ~0.72 incl the 2.5-anchor cluster (ordered ~0.75 — within read
   noise); KDE MANTLET BLOCK at the face (§B3.1) reads in every front-arc
   view; Jyu-MAT boxes raised to wall-top (world 1.96..2.32 + tilt) — the
   wings now read in PLAIN SIDE PROFILE, the vehicle's tell.
4. ROOF M2 — **CLOSED.** Deleted (real config carries no roof HMG); no pintle
   silhouette in any view; census mg1 held by the recessed coax mag.
5. REAR FACE — **CLOSED.** Door leaf outline + handle + hinge stacks + corner
   bins + latches + taillights + tow eyes; firing ports 3/side read along the
   flanks.

Owner's direct orders: sloped front ✓ (the round's headline); bradley track
shape ✓ (sprocket 0.60 r 0.26 / idler 0.70 r 0.27, open return run,
coveredTop dropped).

Acid per view: front YES / frontleft YES / left YES / rearleft YES / rear YES
(the real rear is plain; the door face reads) / rearright YES / right YES /
frontright YES / top YES / heroes YES.

Detail 7/10 (mantlet block, tapered-bore flash hider, ports, splash rail,
mirrors, water cans, rack, '1071'). NOTE (not an order): packet residuals 2–3
(mid-flank stencils, Jyu-MAT face conduit) remain open candidates — detail
class, no proportion bearing.

## STANDING CHECKS (all reproduce the landing)

- **Hash bracket ×2** (before captures / after all measure runs): spz_puma
  **31dca571** (64/68500), type89 **b19aca94** (62/51448) — both runs, exactly
  the landed hashes. Residents ariete 324c3f12 / type90 187df488 / type74
  82f98438 / t80u a6782440 / bmp2 ba2f514e / m2a2_bradley 8d36a6cd /
  chieftain_mk10 6cf7c684 / type10 8ea3e8a8 — byte-identical across the resit.
- **puma gate ×1:** `min 0 | hull 39.9 whole 18.1 turret 0 stations 20.3
  dims 100 floaters 100` — reproduces the landed line to the decimal.
  Ordered-departure class (owner-ordered seat 0.285 m off the print autoPivot
  + ordered band top 2.00 vs print 2.14–2.16), adjudicated in the packet, NOT
  a fail basis. dims 100 = every published anchor holds at the new seat.
- **type89 NOT gated** (FALSE-0 law holds — no oracle).
- **track-clip --exact:** 0/0 band + 0/0 shoe BOTH ✓.
- **winding-audit:** m1 clean both (puma 7 px @right AA-noise — the packet's
  exact figure; type89 0 px); m2 puma 2670 candidates = the SAME count as the
  landing (r1-adjudicated rear-deck kit class, adjudication transfers), type89
  m2 CLEAN 0.
- npm test skipped per resit brief (landing ran it green).

## RESIT LAW NOTES for the bank

1. **ORDER-NUMBER vs ORDER-SUBSTANCE:** two original orders carried misread
   absolute numbers (puma "deck y≈2.55" — that is the bore line, deck 2.085;
   type89 "fender step ~1.85" — literal compliance contradicts the same
   order's exposure demand). Photo-acceptance orders bind on their falsifiable
   INTENT (exposure fraction, plane run/angle, proud height, countability);
   their absolute y/z guesses are advisory until probe-corroborated. Builders
   who resolve to the print/photos should say so in the packet (this rework
   did) — critics score the intent.
2. **FOUR-BOX AS REGRESSION HARNESS:** builder-run and critic-resit probe
   numbers match to the mm across every row — the probe is deterministic and
   diff-able, and a claims-vs-resit table takes minutes. Promotion candidate
   confirmed (beside winding-audit at round close).
3. **m2 CANDIDATE-COUNT AS DRIFT DETECTOR:** an exact yaw-candidate count
   match (2670 = 2670) carries a prior adjudication forward without
   re-derivation; any count drift re-opens it.
4. **STATE-A-DATUM for plane claims:** quote glacis run/angle WITH its datum —
   type89's 1.76 m @ 28.6° (frustum endpoints) and 1.86 m @ 27.3° (incl. the
   bow-face lip) are the same plane; unstated datums read as discrepancies.

*Resit critic: independent §B8 acceptance lane #2. NEVER committed; no src
edits; official rigs + tracked tool pages byte-clean vs HEAD; captures one
cot-shots FIFO hold (self-ticketing tools never wrapped). Evidence:
shots/b8-resit-20260806/ (16 views ×2, 14 oracle pairs, measures.json;
gate/track-clip/winding artifacts under shots/ + docs/geometry-gate/ as
tool-written).*

---
---

# RESIT — §B8 LEOPARD TRIPLE (independent acceptance critic,
# 2026-08-07T02:51Z captures)

**Scope:** the 9e44130 landing ("leopard triple LANDED") — (1) leo2_revolution
GRAY-RECTANGLES owner-priority order, candidate **bbae2c80**; (2) leo2a4 §B8
rework resit (original verdict above: marginal FAIL — wheels/bow/turret),
**551cb30e**; (3) leopard2_proto FIRST §B8 acceptance (new proc build),
**f1af7ba8**. Method: official photoclass 16-view set at REST **and ?yaw=90**
per id + tmp-b8-measure four-box, one cot-shots FIFO hold (scratch driver
tools/tmp-b8-resit-batch.mjs, tmp-b8-batch clone + yaw pass; official pages
untouched). Evidence: `shots/photo-acceptance-resit-20260806/<id>/`
(+ `<id>/yaw90/`, `measures.json`). NO oracle pairs: revolution's oracle is
BROKEN at HEAD (batch-37 revert, turret 0.2 pre-exists — gate NOT run on it,
by order), leo2a4 has no oracle (FALSE-0 law), proto's is the melted tub
(cap adjudicated).

**Tree state (live-tree law):** render path clean vs HEAD 9e44130 the whole
session — leopard.js c0acc34b / kit.js 38e27414 / modelLoader.js 7755ffae
sha-held start→end; only foreign-lane files were dirty (abrams.js etc., not
on this path). Hash bracket ×2 (below) byte-identical.

## RESIT VERDICT TABLE

| tank | proportions | detail /10 | acid ("reads as the real vehicle at a glance?") | orders |
|---|---|---|---|---|
| leo2_revolution | **PASS** (§B7-adjudicated) | 8 | Yes — closed faceted AMAP mass over camo module courses, no dead bands anywhere | none (2 notes) |
| leo2a4 | **PASS** | 7 | Yes — leo2 stance restored: countable gear under hub-line skirts, nose band not cliff, turret proud | none (2 notes) |
| leopard2_proto | **PASS** | 7 | Yes — early PT: low plain slab turret, cheek blisters, bare 105, plain full skirts | none (2 notes) |

**3/3 pass. The leo2a4 marginal FAIL is resolved (orders 1–3 CLOSED with
numbers); the owner's revolution priority order is CLOSED — the gray/black
rectangles are measurably dead in every view family; the proto's first
independent acceptance PASSES.** With critic #2's puma/type89 above, the
resit ledger stands 5/5.

## leo2_revolution — GRAY-RECTANGLES DEAD: YES in every view family

Detector: connected flat regions (5×5 range ≤3) at mean lum ≤35, ≥1200 px —
calibrated on the banked BEFORE set (shots/leo-rev-gray/before), where it
reads the defect exactly: view-left 3075 px @ mean **5** (p10/50/90 = 5/5/6,
the pure (5,7,5) band), rear 8610 px @ 6 + 2569 px @ 6, rearleft 2672 px @ 5,
right 3063 px @ 26, frontleft 2064 px @ 5, frontright 2079 px @ 28, front
2×~3500 px @ 24, hero-frontleft 2405 px @ 5, hero-rearright 4194 px @ 28,
close-roof 11250 px @ 27.

At bbae2c80 (my captures):

- **8 compass: DEAD — YES** (0 defect-class regions ×8).
- **3 heroes: DEAD — YES** (0 ×3; before carried mean-5 and mean-28 blocks).
- **2 closes: DEAD — YES** (0 ×2; before close-roof carried 11250 px @ 27).
- **yaw-90, all 16 views: DEAD — YES** (0 across the set).
- Non-acid note: muzzle-endon (30× bore-evidence crop) shows one 768×11 px
  fender-line sliver @ mean 34 — an 11 px zoom artifact, not a view family.

**Apron reads as real armor (§B7):** the module lower course carries camo
continuous with the turret mass, vertical seam joints at module pitch, raked
front extensions following the wedge plane, and the ring-belt V-stairs hang
INTO the slit as structure (6× zoom check) — metal where the real MBT
Revolution has metal; no curtain read from any angle.

**Slit is honest shadow (SHADOW-TONE law):** view-left row probe — dark band
6–7 px ≈ **11 cm** at 68.2 px/m; graded top-dark→deck-lit (row means 52.0 →
**49.0 minimum under the apron edge** → 53.9 → 58.2 → 64 at the module tops);
floor 48 ≫ the raw-black 5 — no ambient-floor pixel anywhere in the band, and
variance along x (min 48 / max 60–66) breaks any rectangle read.

**Yaw-90 unity (§B5):** rest/yaw90 top pair — shroud + apron + RWS + basket +
gun rotate as ONE mass, hull furniture static; winding m2: 5 candidate px,
coincidence-dominated (6829/6834) = clean.

**Proportions (context; gate barred this round):** four-box overall 9.87 ×
4.002 × 2.716 (RWS spike) vs pub 9.97/4.0 ✓; hull 7.735 ✓. turretMass l
5.315 = **68.7% of hull — over the generic §B8.1-4 ~55% alarm**; adjudicated
TRUE-TO-VEHICLE under §B7: the demonstrator's turret genuinely runs long
(A4 box + closed AMAP forward wedge + bustle basket + slat course), and the
yaw-90 top confirms the rotating mass reads as a TURRET (pointed plan, gun,
distinct bustle), not the a7v hull-board class. Documented, not ordered.

Detail 8. Notes (no orders): (1) the under-nose plane renders one uniform
mid-gray at head-on — fleet-endemic class, see law note 3; (2) alarm-line
turret fraction above, re-check only if the oracle adjudication (4.995)
re-prices the §B7 cap.

## leo2a4 — PROPORTION PASS (original orders 1–3 CLOSED)

Four-box (probe, exact): overall 9.660 × 3.703 × 2.806 (PERI spike; roof
2.48) vs pub 9.67/3.70/2.48 ✓✓; hull 7.81 box (the documented +1.2% mudguard
lip) with **h 1.771 — the deck true-up landed** (was 1.836 in the original
read); turretMass 3.256 l = **41.7% of hull** ✓ w 2.713; bore y **2.00** ✓;
muzzle +5.82 → 9.68 real-config overall (spec-row 9.97 carry-over stays a
modern2.js true-up item, packet-documented).

1. **WHEEL EXPOSURE — CLOSED.** Skirt bottoms measured from pixels: aft run
   ≈0.41–0.44 m (claim 0.44 — AA edge), fore blocks hang deeper (step reads
   in the 4× band crop) → **~52–56% aft / 48% fore of the 0.79 wheel** —
   §B8.1 gate-1 window (40–70%). Under-skirt band renders ALIVE: row means
   45–54 vs the original build's **6.8 ambient-black row** (the actual
   read-killer — see law note 1); 7 hub discs/side at measured pitch 57 px =
   0.84 m ✓ — 6 read clean + 1 shaded under the fore block; countable.
   Residual (note, not an order): native photoclass hub contrast is faint
   (~5–6 lum units, peaks 57 vs gaps 52) — one hub-tone step is the lever if
   the owner still reads the left view dark; geometry + tone hooks delivered.
2. **BOW — CLOSED.** Head-on profile through the nose: glacis 52 / **lit
   nose band 69–71 over 23 px lit (+ seam-shaded lower edge) ≈ 0.13–0.19 m**
   (ordered 0.19, 1.05..1.24) / beak-underside shadow 47–50 / under-nose
   receding plane **57 = glacis-class tone** (the packet's fix: it rendered
   69–82, BRIGHTER than the glacis, pre-overlay). The full-height lit cliff
   is dead; track horns read proud; view-left bow profile = beak + recede,
   no wall.
3. **TURRET PRESENCE — CLOSED.** Walls at the family lines (vertical faces,
   the 2A4 rising bottom line with the bustle slab kept at 1.74), face
   2.48−1.695 = **0.785** wall / band-to-EMES-lid **0.943** ≈ the ordered
   0.95; deck true-up measured (hull box top 1.755); profile presence reads —
   PERI, MG3, EMES hood right-cheek, crosses; bustle rack mid-rail + closed
   end frames and the heavier Wegmann banks read in profile and rear.

§B8.1: gate-1 ✓ (above); gate-2 ✓ (glacis targets carried, cliff dead);
gate-3 ✓ (boxy VERTICAL family line + EMES hood — falsifiable and correct);
gate-4 ✓ 41.7%; gate-5 ✓ (7 duals @0.84 m measured + §B6 raised idler 3.48 /
sprocket −3.19 trapezoid). Acid per family: front YES / left YES / rear YES /
top YES / heroes YES. Yaw-90 set defect-clean; §B1.1 both cheeks raked-true
in both front quarters; §B3.1 gun run prism-free (mantlet collar, tube,
evacuator, bore).

Detail 7. Notes: hub tone (above); under-nose 296×70 px uniform-57 panel —
inside the fleet class (law note 3), candidate for a one-step texture break
in a detail round.

## leopard2_proto — PROPORTION PASS (first §B8 acceptance)

Four-box: overall 9.95 box (muzzle +6.11 → **spec 9.97** ✓) × 3.702 ×
2.655 spike (roof plane 2.37 walls); hull 7.81 box = the family line ✓;
turretMass 3.13 l = **40.1% of hull** ✓ w 2.581 (blisters) h **0.984** — the
LOW PT slab (face 2.37−1.695 = 0.675); bore y **1.98** ✓. Hull box h 1.826
vs the a4's 1.771 (early-nose deck kit; inside the packet's dims grace —
gate dims 100 corroborates).

**Prototype identity — DELIVERED** (scored against the packet's
panzerplace/PT photo class): low slab welded turret with NO wedge; rounded-
in-plan cheek fronts (two co-planar facets each side, weld seam on the
knuckle, §B1.1 symmetric — front view); stereoscopic rangefinder BLISTERS
bulging from BOTH cheeks (dome + collar + dark optic cap, straddling the
roof edge); base ring bulge WIDER than the walls; early ring cupola; IR
searchlight box (hood + recessed lens); anemometer; folded whips; 2×4 early
Wegmann clusters LOW on the rear walls; bustle box + strapped kit; loader
MG3 (mount 0.54, the banked FITTING-CAP dims lesson); Y-014 + cross decals.
**Gun (§B3.1): rounded CAST mantlet** — trunnion roll + ellipsoid dome +
tapered boot, coax port, NO prism anywhere on the run; **BARE slim 105**
(no thermal sleeve), mid-tube evacuator, real recessed bore at +6.11.
**Skirts: prototype-plain** one flat full-length line at ±1.85, no fore
blocks, bottom 0.45–0.46 measured = **58–59% exposure** ✓; 7 ringed hubs
countable (same native-faintness note as the a4). §B6 trapezoid ✓.

**Gate line ×1 (my run):** `min 0 | hull 45.6 whole 0 turret 0 stations 0
dims 100 floaters 100` — reproduces the landed line EXACTLY; dims 100 +
floaters 100 HOLD; whole/turret/stations stay capped BY CERTIFICATE (melted
print — turret melted to deck, gun printed as a deck-height bar), scored on
visuals per the adjudication.

**Variant distinctiveness (§H.4):** proto vs a4 tells read at a glance —
blisters / bare tube / plain skirts / low 0.675 face / IR box vs EMES hood /
sleeved L/44 / sculpted fore blocks / 0.785 face. Not a re-badge.

Acid per family: front YES / left YES / rear YES / top YES / heroes YES.
Yaw-90: turret+blisters+cupola+bustle rotate as one, defect-clean ×16.

Detail 7. Notes: plain cheek faces are the REAL PT read (builder's own
weakest-view list concurs) — casting/weld texture is a candidate, not an
order; MODEL_SOURCE still ships the melted tub as the playable — the
FLEET-FLIP to procedural is orchestrator-lane and is now UNBLOCKED by this
independent PASS.

## STANDING CHECKS (all reproduce the landing)

- **Hash bracket ×2** (before captures / after all runs): leo2_revolution
  **bbae2c80** (80/107954), leo2a4 **551cb30e** (58/88109), leopard2_proto
  **f1af7ba8** (56/80693) — both runs, exactly the landed candidates.
  Frozen sibs byte-held both runs: leo2a5 **e215a738** / leo2a6 **09912270**
  / kf51 **9ac547ac** (both shared-helper opt-ins byte-identical-default,
  confirmed live).
- **geometry-gate:** proto ×1 exact (above); revolution NOT RUN by order
  (broken oracle = orchestrator item 4.995; its ledger row untouched at the
  pre-existing 0.2-turret HEAD state); leo2a4 NOT gated (FALSE-0 law).
- **track-clip --exact:** 0/0 band + 0/0 shoe — all THREE ✓.
- **winding-audit:** m1 rev 0 / mix 0 / deficit 0 px ×3; m2 clean ×3
  (revolution 5 px coincidence-dominated; a4 + proto 0).
- **standard-check:** contig **0** ×3 ✓; decor census mg1+4d / mg1+1d /
  mg1+1d ✓.
- npm test skipped per brief (landing ran 166 + track-geometry green).

## RESIT LAW NOTES for the bank

1. **EQUALIZATION-RESCUE FALSE-READ (§B8.1 gate-1 metrology):** an
   autocontrast/equalized crop rescues tonally-dead geometry — the OLD a4
   band looks BETTER equalized (near-fully-exposed wheels) than the fixed
   build, because its wheels were geometrically present inside an
   ambient-black void (row mean 6.8). This is how "~15% exposure" and
   "7 wheel bottoms countable" coexisted in the original verdict. LAW: score
   exposure/countability at NATIVE tone; equalize only to count geometry
   already visible natively.
2. **CAMO-PATCH FALSE-POSITIVE (flat-region detectors):** black-green camo
   patches measure mean <30 at near-zero spread INSIDE lit panels (a 2 k px
   hit on the a4 right cheek decoded to paint). Separators: organic fill
   (<0.4 of bbox) + paint-edge context. Detector spec that calibrates
   cleanly on the banked before-set: flat = 5×5 range ≤3, defect = mean ≤35
   AND area ≥1200 px in an acid view.
3. **MID-GRAY FLAT CLASS IS PIPELINE-ENDEMIC:** uniform 50–58 plate reads
   appear on every build in the dark photoclass scenes (control: k2's
   praised front view carries a 51 k px mean-54 flat — 5× anything on this
   triple). It is NOT the owner's rectangle class (that class is ≤35 at
   zero variance) — do not order mottle on it without the DEEP-SHADE
   percentile-spread check (existing §J law, re-confirmed here).
4. **BORE-CROP EXCLUSION:** muzzle-endon/oblique are 30× evidence crops —
   under-hull shade at grazing angles reads 30–35 flat there on every tank;
   they are not acid view families and never carry a rectangle verdict.

*Resit critic: independent §B8 acceptance lane (leopard triple). NEVER
committed; no src edits; official rigs byte-clean vs HEAD; captures +
measures one cot-shots FIFO hold (self-ticketing tools never wrapped;
scratch: tools/tmp-b8-resit-batch.mjs + scratchpad flatscan). Evidence:
shots/photo-acceptance-resit-20260806/ (16 views ×2 poses ×3 ids,
measures.json; gate/track-clip/winding artifacts under shots/ +
docs/geometry-gate/leopard2_proto.json as tool-written).*
