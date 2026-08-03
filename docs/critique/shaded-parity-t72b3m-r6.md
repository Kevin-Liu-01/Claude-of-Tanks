# t72b3m shaded-parity r6 — independent critic verdict (2026-08-02)

Rig: shots/critic-t72b3m/ (37cf6c8 state); ITU-601 on-element; enclosed-
air flood-fill (scipy). Floor UP 5.0 → 5.5 (ties best); avg ~6.3.

## Verdict: FAIL — min 5.5 (hero-rearright); top 8.0 is the ceiling
front 6.5 · fl 6 · left 6 · rl 6 · rear 6 · rr 6 · right 6 · fr 6 ·
top 8 · hero-fl 6 · hero-rr 5.5 · toptilt 7 · close-front 6.5 ·
close-roof 6.5. FILL PASS (over-solid: enclosed air 405 vs ref 3812 —
the ref HAS daylight gaps we now lack). CIRCULARITY PARTIAL.

## Verified this round (banked wins)
Dark budget FIXED (worst 1.76x, was 6-12x). Wheel-band tone FIXED
(61.8/65.3/72.3 vs 61.7/67.6/72.1). Hem p90 69.1 ≤72 FIXED. Glacis med
61.1 = ref 61.0 FIXED. Gantry air FIXED (0-2px, was 13-27). Pentagons
gone. Cream 0.0000. Locked tube side-trace holds.

## Failed / mutated
DOME: exists (top/toptilt circle, curvature shading) but front roofline
still ONE row for ~240/270 cols (ref staircases 175→203; x465-535 ref
193-203 vs proc 179 = 2-3 mask rows proud) and NO hero rim rise — a
giant dark camo patch sits exactly on the cap's camera face in BOTH
heroes (caps never cover tone — move the patch class). 1/3 heroes read
volume. NSVT: ZERO of 14 (dead-rear bare rod; rr fused into crate wall;
hero-rr cupola EMPTY — the r17 labeled-crop verification was done on
custom renders, not the critic pairs: VERIFICATION LAW below). NEW ALIEN
GEOMETRY: tilted mega-ramp (ski-jump), full-length invented tooth strip,
half-size eyebrow wheels w/ zero inter-wheel daylight, two chalk bow
rings (one breaks hem silhouette), center "finger" on cap rear slope,
saturated-green wireframe decal + bars on rear plate, drooping stepped
gun cone w/ blank muzzle dead-front.

## VERIFICATION LAW (r6 origin, fleet-binding): done-gates are verified
on the RE-RENDERED CRITIC PAIRS (the exact 14 files the critic reads) —
custom crops/renders do not count. A "labeled crop" from a scratch
render passed r17's NSVT; the critic pairs show no gun in any view.

## R7 work order (russia r18)
1. TURRET OFF-AXIS GRAMMAR: cap breaks the rim below ~20° elevation;
   radial wedge PRISMS with varying foreshortened widths (not parallel
   planks); crate towers merged/dropped below crown−4px; DELETE the ramp.
2. NSVT AS SHAPE: receiver+can ON the pintle with 2px sky gap on three
   sides at rearright AND hero-rearright; 3px barrel + brake nub; ≥6px
   clearance from any crate. Verified on the critic pairs.
3. FRONT GUN: level tube in orthos (droop read), bore disc on muzzle
   face, steps ≤1px.
4. RUNNING GEAR: ref wheel radius (~29px ortho), wheels drop ~25px below
   hem with DARK DAYLIGHT GAPS (ref enclosed air 3812px), teeth only at
   the sprocket, arc both track wraps (plank staircases now).
5. CROWN STAIRCASE + CAP FACE: wedge courses lift x465-535 to ref
   193-203; move the dark patch OFF the cap faces (both heroes).
6. REAR PLATE: kill green wireframe + corner bars; tail-light clusters.
7. WEDGE RING: extend into NW/NE (ref wraps 270-300°); shards flush,
   yaw ≤8° from radial.
8. BOW: delete chalk rings, cut the V-dip, merge prow planks.
9. SNORKEL: delete the finger; ONE two-tier ribbed drum at the ref's
   RENDERED rear station (~13px off-center, not 68).
10. close-roof darks 1.76x → lift patch cores/ring interior to 50-58.
