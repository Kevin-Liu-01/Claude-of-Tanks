# Shaded-parity critique — m60a1, round 3 (independent critic, dual-gate half 2)

**Reviewer:** independent shaded-parity critic, 2026-07-31. Single subject: m60a1,
the fleet's best tank and second full geometric-gate pass (min 90.9: hull 91.9 /
whole 90.9 / turret 91.4 / stations 93.4 / dims 100, commit 2196293).
**Evidence:** fresh board render of `tools/procedural-fidelity.html?id=m60a1&board=1`
on an own vite server (:7317), captured at native canvas resolution, PLUS shaded
ref|proc pairs re-rendered from all nine proof-view directions and four
perspective closeups through the page's own scene/lights (`__FIDELITY_DEBUG`
hooks; no source edits). All captures in `shots/critique-m60a1-r3/`
(board-fullpage, shaded-hero-pair, articulation-strip, turntable-24x15,
shaded-{front,frontLeft,left,rearLeft,rear,rearRight,right,frontRight,top},
shaded-hero-{rear-left,left}, shaded-closeup-{turret-front-right,
turret-rear-left,bow,running-gear,garage}, crops/, fidelity-report.json).
Mask context this run: overall 96.0 / hull 96.8 / turret 91.9 / gun 96.2 /
tracks 95.3, min view 94.4 (rearRight). Same question as r1/r2: does the
procedural read as the same vehicle at the same asset-quality tier from a
garage camera? Gate: **every view >= 9/10**, lower-when-uncertain, masks not
accepted as proof of likeness.

## VERDICT: **FAIL** (min view 3/10)

The silhouette war is won — every one of the nine masks is >= 94, the outline
is the M60A1 from every direction, the proportions, stations and dims are
real. The shaded read then loses it in one place: **the turret casting is
rendered as a stack of unwelded contour slices.** `m60Loft` (patton.js:559)
emits each of ~27 x 9 loft quads as an independent closed slab brick with flat
normals and an inward-offset inner shell; every section boundary renders as a
lit riser, every profile edge as a hard facet, and the exposed brick ends on
the bustle taper form a literal sawtooth jaw. From any oblique angle the dome
reads as corrugated cardboard / venetian blinds — the camo blotches and the
"123" decal are shredded across the bands. The reference beside it is a single
smooth casting. This is exactly the "clay with paint" class of failure the
owner rejected 90+ IoU tanks for, inverted: geometry that satisfies the gate
and cannot survive being LIT.

Everything below the turret ring is, for the first time, close to tier: the
running gear is the best in the fleet (bolted hubs, rubber tire ring, linked
track with guide horns and end connectors), the bow carries its splash board,
periscope hoods, guard hoops and mud flaps, the rear corner package is
measured and real. The hull would pass 8/10 on its own. The turret drags every
view down with it.

## Per-view scores (9 = same 3D model at game distance; 10 = garage closeup)

| view | score | verdict driver |
|---|---:|---|
| front | 6 | outline + cupola + searchlight mass all read; vertical zebra banding on both cheeks; headlights are dark sockets, not lights; mantlet+searchlight = plain box stack |
| front-3/4 (hero) | 4 | corrugation owns the dome and front cheek; black void fender box front-left; muzzle is a flat cap; searchlight reads as two camo boxes |
| side | 6 | hull side genuinely good (fender line, seam dots, track, wheels); cheek banding faint but present, scalloped roofline behind cupola; bustle side slices at the taper; no fender tow cable/stowage; evac drum over-long and root-biased |
| rear-3/4 | 3 | worst composite: full-blast contour slicing on cheek+bustle, serrated sawtooth along the bustle lower rim, bustle rear a black hollow inset box, engine deck without louvers, rear plate without grilles — reference shows rack, louvers, grille |
| rear | 5 | banding mostly hidden; but rear plate is an empty camo wall vs the reference's grille texture; bustle rear reads as an open dark frame; no bustle rack silhouette |
| top | 7 | slicing invisible from plan; excellent plan silhouette (mask 98.7); cupola/loader ring/tarp/can/antenna pots present; grab rails hairline; deck reads bare without louver relief |
| articulation strip | 9 | all six poses correct; searchlight correctly pitches with the gun; mantlet boot keeps the throat sealed at -dep/+elev; no floaters, no voids at any yaw |
| turntable (24x15°) | 8 | fully coherent, zero floaters/pops; but the contour bands flash venetian-blind patterns at back-lit yaws (frames 9-12), an artifact a rotating garage display will exhibit constantly |

Gate "every view >= 9": **FAIL** (front 6, hero 4, side 6, rear-3/4 3, rear 5, top 7).

r2-continuity line (SD/MA/WT/TC/HC/SP/OV): **4 / 5 / 8 / 3 / 7 / 9 / 4** —
silhouette 8→9 (locked), wheels/tracks 5→8, hull 4→7, materials 4→5, but
turret character 4→3: r2's "credible large dome" was a smooth egg; the
measured loft that replaced it matches the curves and destroyed the surface.

## Per-component notes

- **Turret casting (KILL ITEM):** needle nose, steep forehead shelf, asymmetric
  crest, long bustle — all present in outline (turret mask 91.9, turretCurves
  91.4). Surface: ~27-section front loft + 8-section bustle loft emitted as
  per-quad slab bricks; flat shading per brick; alternating lit risers/treads
  wrap the whole casting; exposed brick end-faces at the bustle taper create a
  serrated zigzag rim (worst at rearLeft/rear-3/4); the inward-jutting end cap
  at z -2.035 recesses the bustle rear face behind its rim so the whole bustle
  tail reads as an open-backed black box. The camo texture and side decals are
  visually shredded by the bands.
- **M19 cupola:** ring + band + domed cap + 7 vision blocks + M85 box with
  barrel stub + the documented dims-carrier spine blade — all exist (r2's
  open-top drum and missing blocks/stub are CLOSED). At garage range the
  blocks are near-black sub-pixel chips and the blade reads as an unexplained
  fin; acceptable at game distance once the dome beneath it stops striping.
- **AN/VSS-1 searchlight:** exists and pitches with the gun (r2 headline miss
  CLOSED). But it reads as two stacked camo boxes: the lens ring is a 2.5 cm
  dark disc on the front face only, there is no yoke read, and an instrument
  painted in hull camo with no glass does not read as a searchlight.
- **Mantlet/M140:** rotor + canvas boot + dark under-plate, kept inside the
  measured 0.32 half-width — r2's "40% too wide Leopard wedge" is CLOSED. The
  boot region is credible; the gun root collar is slightly chunky.
- **Gun (M68):** axis/length/muzzle position measured-correct, no brake
  (correct). Bore evacuator drum is ~0.50 m long starting near the root third
  — the reference carries a compact ~0.16-0.3 m collar further out; the proc
  tube reads bottom-heavy. Muzzle ends in a flat body-color cap — no bore.
- **Hull front:** splash board chevron, periscope/IR hoods, headlight
  brush-guard hoops, tow shackles, front mud-flap wedges all present. The
  headlights themselves read as two dark SOCKETS — the reference shows twin
  pale lenses per pod inside prominent guards. Lower bow is one flat facet
  with seam dots (masks say fine; shading says plain).
- **Hull side:** fender band with seam-dot rows, "123" decals, front-left
  fender box (reads as an untextured BLACK slab — the darkest thing on the
  vehicle), rear corner lip strips + kinked rubber flaps. Missing: the
  reference's draped tow cable with cleats and any further fender stowage.
- **Hull rear/deck:** cambered engine crown reads well shaded; transmission
  access ring + towing pintle present. Missing entirely: raised louver banks
  on the rear deck and the rear-plate grille texture — the reference's rear
  half is visibly machinery, the procedural's is smooth camo.
- **Running gear/track (fleet-best):** 6 wheels with bolted hub rings + rubber
  sidewall tone, 3 return rollers (faint, in shadow), compensating idler and
  sprocket with carrier rings, linked track with guide-horn comb and end
  connectors, correct wrap and ramps. Track tone runs slightly warm/tan vs
  the reference grey-brown. Wheels sit in heavy sponson shadow (family issue,
  documented) but survive it here.
- **Materials:** camo palette and blotch scale match the print family. No
  glass anywhere (periscopes, lenses, vision blocks are matte near-black).
  `turretDark`/`hullDark` fittings render as unlit voids rather than dark
  steel (fender box, bustle recess, headlight sockets, basket underside).
  Track/rubber/hub separation is real and good.
- **Stowage/roof:** sunk tarp roll + ammo can on the bustle roof, antenna pot
  + whip base, right-roof shelf + loader hatch ring — present. The
  reference's wrap-around bustle RACK with stowage is absent; its silhouette
  is part of the M60A1's rear identity.

## Three worst tells

1. **Contour-slice corrugation across the entire turret casting** — every
   oblique view (worst: rear-3/4 hero, front-3/4 hero, hero-left cliff face);
   `m60Loft` slab-brick shell with unwelded flat normals. The single reason
   this tank fails.
2. **Bustle tail: serrated slab-end sawtooth rim + recessed end cap reading
   as an open black box, with no bustle rack** — rearLeft ortho and rear-3/4
   at the turret rear; the rear identity of the vehicle collapses.
3. **Dead-black fittings + missing rear-half machinery reads** — front-left
   fender box (black void), headlight sockets without lenses, bare engine
   deck + rear plate where the reference shows louver banks and grilles;
   front, rear and 3/4 views.

## Prioritized fix list (geometry is gate-locked — silhouette-neutral first)

1. **Weld the m60Loft surface (silhouette-identical, gate-safe by
   construction).** Emit each loft (front + bustle) as ONE BufferGeometry
   grid over sections x profile with shared vertices and averaged normals
   along the section direction; keep hard creases only at true profile
   knuckles (left cliff knee, ridge, right roof break, wall-to-underside).
   The outer vertex coordinates are already shared between adjacent slabs —
   identical silhouette, every mask pixel unchanged. This one change removes
   the striping in every view and is 80% of the pass.
2. **Kill the exposed slab ends (same change, called out separately):** stop
   emitting per-quad closed bricks; the inner-shell offset must be a second
   welded skin joined at the rim, so no brick end-faces surface at section
   boundaries (the bustle sawtooth). Make the bustle END CAP flush with the
   rim (the current 0.025 inward jut creates the open-box read) — flush cap
   is inside the current footprint, gate-safe.
3. **Material pass on fittings (no geometry):** raise `turretDark`/`hullDark`
   albedo from near-black to dark gunmetal with mild specular response;
   pale glass lens discs inside both headlight sockets; glass tone on cupola
   vision blocks and periscope hood faces; dark counterbore disc on the
   muzzle face; searchlight body to dark steel + real lens disc so the
   instrument stops being a camo box.
4. **Searchlight yoke + lens face (cm-scale, inside the measured envelope):**
   two short yoke arms and a recessed round lens on the existing 0.40-wide
   box; plan half-width stays < 0.22 — negligible mask effect, but flag for a
   confirm re-gate run.
5. **Evacuator re-proportion (small silhouette change — FLAG for re-gate):**
   shorten the drum toward the reference's compact collar (~0.2-0.3 m) at the
   measured z band; gun mask has ~6 points of headroom (96.2).
6. **Rear-half machinery reads:** louver strips on the rear deck crown and a
   grille inset on the rear plate. Prefer dark inset strips/texture first
   (material-level, gate-neutral); raised louvers move station tops
   millimetres — FLAG if done as geometry.
7. **Bustle rack (real silhouette change — FLAG, needs full re-gate):** the
   reference carries the wrap rack; the masks already show red slivers at the
   bustle top rear, so a measured rack should IMPROVE turret parity. Do it
   only with the gate in the loop.
8. **Fender tow cable with cleats (left run) + lighten the front-left box
   two stops** — the cable is the reference's most visible hull-side
   furniture; cable is cm-scale (FLAG, quick re-gate).
9. **Readability thickening (sub-cm, flag+confirm):** grab rails 0.022 →
   ~0.035, vision blocks a touch taller/lighter, M85 stub slightly longer.
10. **After the weld: re-check camo/decal flow across the smooth dome** (the
    blotches and "123" currently break on band edges; on a welded surface
    the existing triplanar/decal application should just work).

Items 1-3 alone would retake this critique: with a smooth casting, working
lights, and metal-reading fittings, front/side/top land 8-9 and the 3/4 views
follow. Nothing in items 1-3 moves a silhouette pixel.

## r2 ledger (what this round actually moved)

CLOSED from r2: searchlight exists + articulates; cupola capped (open-top bug
gone) with vision blocks + M85; mantlet wedge replaced by a correct-width
M140 rotor+boot; wheel faces carry bolt rings and camo no longer paints them;
track has real links/pads/horns; splash board, periscope hoods, guard hoops,
mud flaps, rear pintle package all present; dome rivet-bead arcs gone.
STILL OPEN from r2: bustle rack + rear stowage; headlight PODS with readable
lenses (hoops exist, lights don't); fender tow cable; engine-deck louvers;
glass/optics materials. NEW REGRESSION vs r2: the turret surface itself —
r2's smooth-but-vague egg became a measured-but-corrugated loft; r2 scored
the egg TC 4, this loft is TC 3 shaded even though its curves gate at 91.4.

The dual gate is doing its job: the geometry half is genuinely won, and the
shaded half now names a single, mechanical, silhouette-neutral fix. Weld the
loft, light the lamps, un-void the darks — then re-run this critique.
