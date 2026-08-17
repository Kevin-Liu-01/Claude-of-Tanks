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
