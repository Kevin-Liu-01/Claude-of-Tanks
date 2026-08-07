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
