# Sturmtiger (`sturmtiger`)

**Exact variant modeled:** 38 cm RW61 auf Sturmmörser Tiger, late-1944
conversion on the Tiger I Ausf. E chassis, WITH the roof loading crane
stowed/erected at the casemate rear (the oracle carries it erected).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length (= overall, mortar barely projects) | 6.28 m | en.wikipedia.org/wiki/Sturmtiger; tanks-encyclopedia.com/ww2/nazi_germany/sturmtiger.php |
| Width | 3.57 m | Wikipedia; tanks-encyclopedia |
| Height (casemate roof) | 2.85 m | Wikipedia; warhistory.org/article/38cm-sturmmorser-tiger |
| Gun | 38 cm RW 61 L/5.4 rocket mortar (~2.05 m tube), ring of gas-vent holes around the muzzle, ball mount | Wikipedia; tanks-encyclopedia |
| Running gear | Tiger I: 8 interleaved 0.80 m stations/side (late steel-rim), FRONT drive, rear idler, 0.725 m tracks | Wikipedia (Tiger E chassis) |

## Identity cues

- Casemate: boxy, tall; front plate slopes back ~47°, sides ~20°, flat roof.
  Front plate carries the huge BALL MOUNT (sphere segment in a large round
  aperture ring) with the stubby 38 cm tube; muzzle face has the signature
  RING OF VENT HOLES; bow MG ball right of the mortar, sight port left.
- Roof: loading CRANE at the casemate rear-right (post + angled jib + hook),
  rectangular loading hatch, commander periscope hump, vents.
- Hull: Tiger I lower hull — vertical sides, three-plate stepped bow with
  driver plate, fender line, twin shrouded exhausts on the rear plate.
- Running gear: interleaved dished/steel wheels, front sprocket, dead-track
  sag between stations.
- Zimmerit on hull/casemate on most survivors (paint-level hint only).

## Reference links

1. https://en.wikipedia.org/wiki/Sturmtiger — dims, RW61, crane
2. https://tanks-encyclopedia.com/ww2/nazi_germany/sturmtiger.php — casemate
   angles, vent-ring detail, crane use
3. https://warhistory.org/article/38cm-sturmmorser-tiger — walkaround photos

## Local GLB oracle notes

Path: `public/models/tanks/community/sturmtiger-tomrs.glb` (fixedMount,
yawOffset −90°). Width-normalized to 3.57 m: 6.16 m long × 4.15 m tall — the
4.15 m height is the ERECTED loading crane above the 2.85 m roof; the mortar
muzzle sits nearly flush with the bow. Fused mesh: component masks N/A.

## Mismatch log (before → after per fidelity iteration)

| Date | total | minView | whole | tracks | change |
|---|---|---|---|---|---|
| 2026-07-30 | 85.7 | 76.6 | 84.8 | 89.6 | baseline (parametric CASEMATE box, no crane) |
| 2026-07-30 | 90.0 | 87.9 | 89.5 | 91.9 | bespoke rebuild: Tiger I three-plate bow, 47° casemate (roof 2.82), sealed ball mount + vent-hole muzzle ring, MG ball + driver visor, erected loading crane (rear-left, oracle pose), Tiger grilles/fans/shrouded exhausts, 8 interleaved dished wheels, frame compressed to the oracle's ±3.08 |

Remaining gap: front 87.9 — the oracle's crane/jib pose and bow flap shapes
differ in detail; the tomrs print carries zimmerit (paint-level, visual
flag not owned here).


## Geometry gate v9 (2026-07-31, from-scratch agent)

Rebuilt: 47deg face crest 2.33, saddle, roof plate 2.59 + hatch hump 2.76,
crane re-read as the print's NARROW folded arm at x -0.85..-1.15 (beam
2.90..3.20 carrying published heightM p95, post spike to 4.14 = the oracle's
rough-height anchor), raised rear idler, deep side skirts. v9: min 47.5
(hull=whole 47.5, stations 73.6, dims 85.5, floaters 100) — family best.
Remaining: face-region widths (front rows +-1.3-1.6 still ~0.2 off), dims
heightM measured 3.14 vs authored 3.19-3.20 plateau (p95 discount - widen
the arm run by ~2 columns).


## Geometry gate v10 round-2 (2026-07-31)
Round-2 row: hull 47.7 whole 47.7 turret 100 (fixedMount) stations 74.4
dims 100 floaters 100 (ledger: 47.5/47.5/100/73.6/85.5/100).
Dims closed: body span grown to published 6.28 (bow +3.17 / tail -3.16,
pixel span 6.33 within grace) and the crane beam raised to 2.93..3.23 so
published heightM 3.2 rides the p95 line on the beam's ~12 columns.
front_hull (47.7) remains the floor — casemate face/wall width iteration is
live work against the print's 47-deg face.

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 NO bore added - the RW61 already carries its dark 38cm bore face + 9-hole vent ring (compliant); §C.1 0 reversed; F-vs-D 0; gate HELD x2 EXACT 47.7; hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.

## §5.247 casemate-wave round (2026-08-17, casemate family agent)

SOURCES (ordered first step): registration BROKEN — MODEL_SOURCE.sturmtiger
is `source:'procedural'` + candidateGlb only (§5.31b flip left the maps
bare, the m1a2_tusk bug class) and the print bytes were deleted at the
owner's GLB-runtime retirement (952561ea). Print bytes RESTORED local-only
from git `952561ea^` to `public/models/tanks/community/sturmtiger-tomrs.glb`
(md5 65cee2a2d4c64b6a41546072a3422dc3, 52-mesh print, loads clean). Gate
baseline ×1 errored `no local GLB reference` (row now a 0-row in the
ledger — the ordered broken-registration receipt). EXACT ROW FIX for the
orchestrator (LOCAL_REFERENCE_OVERRIDES, mirrors candidateGlb):
`sturmtiger: { source:'glb', glb:{ path:'/models/tanks/community/sturmtiger-tomrs.glb', fixedMount:true, yawOffset:-Math.PI/2 } },`

WORK (all inside the certified silhouette envelopes; published-dims anchors
held by probe — tools/tmp-cw-traceprobe.mjs, own-frame: hullLength body span
6.3272 / overall 6.331 / width 3.631 / height-p95 3.2333 before≈after):
- RW61 MOUTH (identity headline): sleeve 0.205/0.235 -> 0.24/0.27, rim
  collar 0.26 + step ring, bore face 0.185 + seam torus, 9-hole vent ring
  at r 0.208. Muzzle z EXACT 3.01 (overall == hull contract).
- CRANE rebuilt from the plank-on-posts (owner mystery-box class) into the
  real loading crane INSIDE the same certified envelope: twin-chord lattice
  jib (crown 3.23 EXACT — heightM p95 carrier), web posts, cap/heel plates,
  pivot column w/ base flange + gussets to 4.14 EXACT, head sheave, cable
  falls, pulley block + hook, A-frame legs + foot pads.
- ROOF LOADING HATCH: r 0.40 ring + domed two-leaf lid (crown 2.745, the
  certified hatch-hump class) + seam ring + hinges + latch handles.
- STAGED 38cm ROUND in cradle beside the crane (base plate, chocks, body
  r 0.185, ogive + fuze cap, driving band, base ring, cinch straps) — top
  2.955-2.97 under the print's own 2.93+ crane-bin side window.
- §B3 MANDATE: MG34 pintle at the loader station (hull buckets — fixedMount
  casemate keeps rig_turret empty): column, cradle, receiver, jacket +
  flash cone, 50-rd drum, grips, sight block.
- FOUR CASEMATE LIFT TRUNNIONS (the Sturmtiger tell): boss + weld collar +
  face recess on both leaned flanks at the measured wall line.
- Tiger-E exhaust shrouds + rain hoods behind the muffler drums; engine
  hatch seam ring; jack block + jack + extinguisher + convoy light.
- Bow: spare links -> segmented spareTrackStrip pairs; tow shackle rings +
  pins; periscope/vent collars; pilze socket bores.
GUARDS: hash 09bb3d80 -> 616c7652 (31 meshes / 55664 -> 71192 verts,
intentional); siblings strv103 4c8f1330 / jagdtiger bdc68d10 EXACT; npm
test green; track-clip --exact --strict 0/0 front+rear, sweep 0/0.
EVIDENCE: shots/casemate-wave/{before,after}/sturmtiger (14 views + 6
garage angles each).
RESIDUALS (honest): zimmerit stays paint-level-unowned (needs the gridQuad
tier hoisted onto Tiger plates — a follow-up round); the crane x rides the
certified -0.85 station (the print's bin reads at +1.1 in its own frame —
priced by the v10 cert); live gate rows pending the registration fix.

## §5.247 FIX ROUND (2026-08-17, casemate lane) — critic-ordered repairs (§5.255 verdict 8.4)

ORDERED FIXES (critic defect list, shots/critic-td-trio/sturmtiger):
1. RW61 MOUTH DOMINATES DEAD-FRONT: cast collar ring (fat elliptical torus,
   frontal 1.60 x 0.92, tube 0.075) mounted NEAR-VERTICAL hugging the front
   wall + skimming the 47° plate, dark recessed field inside it, rectangular
   elevation-slot well at the crown; projecting pot r 0.43/0.45 (OD 0.86-0.90)
   seated LOW in the surround (center y 1.93 — the print seats its pot low
   with the bore riding high, and the certified 2.00 axis is high in our
   shorter face: a concentric 0.95 pot rode +0.15 over every crest row);
   vent ring rebuilt as 20 DEEP dark wells (r 0.026 bores, ring r 0.325
   concentric with the bore, tight around the muzzle rim like the real
   counter-recoil ring); bore face DEEP-SET 0.07 behind the rim front inside
   dark well walls; rim/bore seam torus; top/bottom guide lugs + side
   trunnion pins. Muzzle z 3.01 EXACT (overall == hull contract); collar
   max z 3.087 < 3.17 bow tip.
2. BOW FACE: FULL-WIDTH spare-link band — 15 link columns + horn ribs +
   two-row seam + retainer rails seated into the z-3.17 tip cap, capped at
   3.170 EXACT (registration law: no new extreme column; the old ±0.60
   strips lay flat and vanished head-on — kept as the upper-ledge row).
   REAL jaw shackles both hooks (twin jaw plates, fat cross pin + head,
   forward bow ring; max z 3.106). MG ball moved to the print's LEFT wall
   station (-0.76, 1.70) as a custom short-stub build (the mgBall helper's
   0.30 barrel would break the 3.17 length anchor from the z-2.92 wall);
   armored driver visor + slit + rain lip at the RIGHT station (0.74, 1.78);
   sloped-plate vision port well + hood lip at (0.60, 2.12). The old
   fittings were mirrored vs the print and buried at the plate root.
3. REAR: the deck-lying muffler drums + low backplates + rain hoods are
   RETIRED for a shrouded exhaust-stack cluster at the stern (close pair at
   x ±0.42): sooted hullDark jackets emerging over the raked tail, cheeks,
   armored rain caps to 1.878, pipe tips 1.88 EXACT and a transverse shroud
   trunk between the stacks (1.878 — zero new side-column tops). MEASURED
   RESIDUAL: the stern rakes 40° to the -3.16 extreme, so full-height
   standing columns proud of the tail face are geometrically impossible
   inside the certified envelope — two leaned-slab variants measured 88.7
   (x2) vs the 88.8 hold; the print's own stack window tops at the same
   1.85-1.88 class (oracle facts). Round rear-wall port + seam + diagonal
   handle on the leaning casemate wall (0.35, 2.20, wall-lean rx). Rear
   stowage: 20t jack (body + foot plate + head saddle) beside the wood
   block, crowbar, sledge, extinguisher, convoy light.
4. ENGINE-DECK FANS: wells get real depth — sunk dark well walls, 4-blade
   hint, hub; rim disc + torus heights EXACT.

GATE: 88.8 x2 BIT-IDENTICAL (= landed §5.247 baseline EXACT hold-or-improve
floor), dims 100 (heightM 0.77% / hullLength 0.65% / overall ~0.9% / width
0.14%), floaters 100. Geometry hash 616c7652 -> a7fc1ce2 (31 meshes,
71192 -> 80348 verts, intentional). Guards isu122s 90f3a6a0 / isu152
6a78ffa2 / jpz_e100 fb3fc84c BYTE-IDENTICAL. npm test green (live tree).

LESSONS BANKED (also in build comments):
- KIT.torus pre-rotates rings FLAT (x-z plane): a "plate-plane" collar mount
  with a small rx left a horizontal washer sweeping to z 3.56 — measured as
  overallLengthM 6.60 (+5.1%, dims 67-71) across two runs before the vertex
  census (tools/tmp-fix2-aabb.mjs) attributed it. Rings that must face +z
  need rx = PI/2 (+ lean); ellipses must be authored in the flat x-z frame.
- The 47° plate plane extended below the y-1.95 wall break floats 0.3 m off
  the vertical wall — collar/pot furniture must follow the WALL below the
  break, not the extrapolated plate.
EVIDENCE: shots/casemate-fix2/sturmtiger/{before,after}-* (27 sheets each,
REF|PROC pairs at the critic views + 6 garage angles; befores captured at
the pre-edit tree per §5.254).
