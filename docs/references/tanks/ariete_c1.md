# C1 Ariete (`ariete_c1`) — §5.248 ground-up rebuild (italy wave)

**Exact variant modeled:** production C1 Ariete (Esercito Italiano series) —
distinct from the resident `ariete` (Preserie, misc.js, UNTOUCHED donor,
byte-held 43e126e8 through this round). OTO Melara welded arrow turret,
TURMS sight arrangement, 120 mm/44 with the Italian thermal-sleeve profile,
seven roadwheels, the C1 skirt/fender line.

## Sources
- `public/models/community-candidates/ariete_c1_arrafi.glb` — "C1 Ariete
  Main Battle Tank" by M. M. Arrafi (CC-BY-4.0; account is an adjudicated
  rip-poster — measurement/influence instrument only, LOCAL-ONLY quarantine).
  Semantic materials: Hull/Turret/Cannon/SideSkirts/Applique/Glass/Gear.
  Registered: turret `Object_5`, gun `Object_7`, followers `Object_2|6`.
- Published dims (spec row TRUED-UP this round from the donor-clone flavor
  9.80/3.62/2.68): hull 7.59 (weaponsystems.net/837, army-technology),
  overall 9.67 (family datum; army-technology 9.669), width 3.60 (family
  skirt datum; Wikipedia 3.61 over skirts), height 2.45 (Wikipedia roof).

## Measure-lane split (the REG order)
The Applique/Glass/Gear objects span hull+turret. AABB attribution receipts
(shots/italy-wave/printraw/ariete_c1-nodes.json + the gate's own curves):
- `Object_8` Applique = the ±1.80 heavy FRONT skirt package (z -0.46..+3.09
  world) + amidships furniture — there is NO wide rear skirt (stations read
  3.04-3.07 aft of -0.41).
- `Object_9` Glass = episcopes, lights, the amidships cage/bin meshwork and
  the gun's MRS window (z to +5.29 — it rides the HULL mask in the gate).
- `Object_6` Gear (turret follower) = the full-run turret side racks
  (±1.54, z +1.0..-3.0 world) + rear baskets; `Object_2` = the single right
  whip (x +0.87, base 2.29, tip 3.55).
- The raw vertex-extract's follower regex MISSED Object_2/6 — its hull rows
  carry turret gear. The gate's own traced curves (tools/tmp-italy-curves.mjs
  export) are the split authority; the extract is cited only where they agree.

## FRAME LAW — the print is uniformly z-compressed
At the gate's width anchor (3.60) the print reads hull 6.976 / overall 8.494
/ height 2.468: height/width ratios match the published vehicle, the length
axis alone is short by 8.8% (hull 6.98 vs 7.59). Both independent C1 prints
(arrafi + the donor's dustymojito) read ~7.0 at 3.60 — game-style length
compression. Per the owner scale law (§D true-up) and the anti-gaming anchor,
the build is authored at PUBLISHED z-scale: every measured line carries
z ×1.08803 (y/x at print scale). The gate measures the UNWARPED print, so
length-coupled curve rows carry a structural residual (translation-only
registration cannot absorb an axis scale; measured pairing offset ~0.74).

**§E WARP ASK (banked for the orchestrator lane):** uniform z ×1.08803 about
the hull-mask center on ariete_c1_arrafi.glb (warp law v2, append-only
recipe, pristine .bak, byte-idempotent — the sanctioned "rescale a stylized
print axis-wise to published dims" class). This build IS the post-warp-correct
geometry; after the warp lands, re-laddering recovers the curve rows without
re-authoring. Also short-tube class: the print's muzzle ends +5.46 (norm)
vs the published +5.875 — caps wholeCurves only per GEOMETRY-GATE.md.

## Gate result — CERTIFIED structural state, ×2 bit-identical
`hull 46.0 / whole 39.6 / turret 62.5 / stations 85.2 / dims 100 /
floaters 100` (×2 identical; honest baseline at round start was min 0 with
dims 25). dims/floaters are fully closed at published scale; stations sit at
the compression ceiling (slice positions are span-fractional, feature
mismatches are compression-displaced); every curve row's worst columns are
compression/short-tube class (receipts in
shots/italy-wave/ariete_c1-gate-certified-39.6.json). Release compliance:
track-clip band+shoe+strict-sweep 0/0/0, contiguity 0, machine-tagged bore,
decor census mg1+4d.

## Adopted print truths (gate-curve receipts, world frame)
Deck 1.50 (-2.44..-1.08) -> dip band 1.34-1.45 -> amidships equipment: LEFT
group (x -0.85..-0.28, top 2.16; stack column to 2.32 at x -0.855..-0.775),
RIGHT comb posts (+0.30/+0.51/+0.77, tops 2.09-2.11) over the 1.49 valley,
sponson bins ±(1.04..1.46), fore fairing sloping 2.10 -> 1.36 (+0.42..+1.80);
two-segment glacis 1.375@1.66 -> 1.315@2.60 -> 1.21@3.685, nose to +3.79;
stern rake 0.72@-3.30 -> 0.90@-3.66, exhaust pods ±(0.885..1.165) to -3.76,
center tail block to -3.79 (the 12%-band tail anchor); heavy applique skirts
±1.78 (z -0.41..+3.09, WIDTH GUARD strip outer face exactly ±1.80), thin
base skirt ±1.525 ending +2.90; seven wheels on contact [-2.44,+2.52],
idler (3.10, 0.70, r 0.30), sprocket (-3.00, 0.60, r 0.35). Turret: arrow
shell (walls ±1.24..1.28, cheeks sweeping to the ±0.42 mantlet cavity),
raked lower-cheek undersides, ring-skirt chin 1.21-1.26 @ +0.30..+0.72,
roof 2.00 front -> 2.16 mid, TURMS box right-front (top 2.46), pano left
(2.47), bustle roof 2.16 to -1.69 with baskets (tops 2.00, floors 1.45) and
full-run low side rails at ±1.50 / y 1.44-1.51, GALIX banks on their ±1.31
platforms, single right whip (rod vertical at x 0.87, z -0.885 registered
pairing of the print's -0.93) + stowed left base, folded crosswind mast,
loader's MG42/59 stowed low; 120/44 with hand-authored sleeve segments and
MRS head at +5.33 (all gun rings r <= 0.115 so nothing pokes the ±0.117
plan column).

## Owner c425f495 absorption
Absorbed: welded roof panel cadence + fastener strips; crew-station lids;
six-periscope arcs; gunner's block with backed/recessed face; aft stores
bottles (strapped, carried INSIDE the measured basket bays); loader's MG
(low-stowed). Superseded with receipts: the turretG.scale.y*0.82 squash —
the measured roof (2.16 line vs the donor's 2.32+kit) IS the lower
fighting compartment the owner approximated; the twin rigged whips — the
print carries ONE rod (right) + the left base only (the C2 rigs the second).

## Residual log
The compression-classed rows above; the ±1.42 rail-end column (ref rails
run to zW -3.0, mine end -2.80 to stay out of my st1 slab under the shifted
station frame); front sponson-bin/cage micro-combs within ±0.05.

## §5.299 lane D — sloped turret front + sloped upper glacis (owner order, 2026-08-17)
Owner: "c1 and c2 ariete should have sloped turret fronts and upper glacis."
Delivered uncommitted on the ratified 49ce4878 base; new hash **49c15299**
(49 meshes / 64151 verts, reconciled ×2). All edits in profiles/italy.js only;
carro45t byte-held 9fa68918, donor `ariete` byte-held 43e126e8.

**Root cause of the flat reads (measured):** (1) the hull side-wall slab
(±1.535, top 1.51) ran to z +2.87 — one metre PAST the driver line — painting
a flat 1.51 shelf over the entire glacis in profile (the print's own side
silhouette rakes 1.51@~1.6 -> 1.17@~3.7); (2) the certified "two measured
segments" were authored as HORIZONTAL frustum plates (tops flat 1.375 / 1.32)
stepping down, not sloping through the measured points; (3) the turret cheek
slabs rose near-vertically (top edge z 1.98 over bottom edge z 2.06 — ~8°
from vertical) where the print's front is a rising wedge.

**Re-loft (same measured lines, real slopes):**
- side walls end at the driver line +1.67 (rear extreme -3.57 byte-held);
- glacis A 1.375@1.66 -> 1.315@2.60 and B 1.315@2.60 -> 1.205@3.685 as true
  sloped orientedSlabs (undersides meet the tub at 1.30 / bury into the chin);
  nose band 1.21@3.62 -> 1.115@3.785; chin, nose bumps, headlights, ±1.525
  plan extent and the +3.79 bow anchor all byte-held (dims cannot move);
- bow shoulder closures tucked under the raked B plane (tops 1.26/1.15);
- V splash rail re-seated riding the plane (crest ~1.36 = the print's
  furniture line); tow cable drape re-seated on the slope (both were fully
  BURIED under the old flat plates);
- fairing re-lofted to the print's stepped band: crest 2.02@0.42 ->
  1.95@1.05 (gate side band "2.02..1.95 @ +0.3..+1.0") then ramp to
  1.475@1.66 (the old single 2.10->1.36 plane read 0.12-0.20 LOW vs the
  K-frame ramp 1.96@0.98 -> 1.51@1.62);
- turret cheek FACES raked: ridge top pulled +1.98 -> +1.62 and dropped to
  1.94 (~40° from vertical; print K-frame wedge 1.82@+1.74 -> 1.96@+1.61,
  ridge value at the low edge of the ±0.029 trace quantum), mid top +1.62 ->
  +1.42; the cheek top face now RISES 1.94@1.62 -> 2.02@1.16 like the print's
  roof-front plane (2.02@+1.12); mantlet wedge tops follow (33°); cheek
  BOTTOM edges, plan-front extreme (+2.06), mantlet block and cavity closures
  byte-held.

**Gate receipts (live, ×2 bit-identical):** hull 46.6 / whole 39.6 / turret
62.5 / stations 85.2 / dims 100 / floaters 100 — every component
hold-or-improve vs the certified 39.6 row (side_whole 39.6008 -> 39.6060,
side_hull 45.9962 -> 47.8733, plan_whole 41.55 -> 41.81, turret_side 62.481 ->
62.515; dims rows byte-identical 2.46/7.62/9.64/3.61). Pre-fix honest
baseline reproduced live at exactly the certified numbers before editing.
Release checks: track-clip band+shoe+strict 0/0/0 ×both ids, §B2 contiguity 0,
decor mg1+4d, §B5 candidates identical to the HEAD baseline (rear-deck
overhang class, pre-adjudicated — zero delta). npm test green.

**Notes for the §E warp lane:** the re-loft is authored in the K-frame
(published z-scale) like the rest of the build; the whip antenna was probed
at the registered pairing (-0.995) during the round and REVERTED — the
certified -0.885 position pairs fractionally better under the live trace and
the rod (base 2.28, tip 3.55) already matches the print's rod exactly; the
residual whip-column errors are partial-column trace class, present in both
states. Before/after pairs (14 views ×2 ids ×2 trees, all byte-distinct):
shots/ariete-slopes/{before,after}-{c1,c2}/.
