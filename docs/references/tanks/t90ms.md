# T-90MS Tagil (`t90ms`)

> **CURRENT STATUS (2026-08-11): GRADUATED / RE-FROZEN.** The native-procedural,
> reference-guided rebuild and fresh final-byte §B8 receipt below supersede the 2026-08-08
> ladder freeze and its presentation compromises. The old rows remain as
> historical diagnosis only.

**Exact variant modeled:** T-90MS "Tagil" export demonstrator (UVZ 2011+) —
the modern WELDED turret with the big squared removable bustle + rear slat
cage, UDP T05BV-1 RWS and pano sight riding the bustle roof, Relikt-era
plates, TALL hard-skirt ERA panels, full-perimeter hull bar-armor cage,
V-92S2F 1130 hp. Desert-sand factory paint (spec visual) — the garage tell
vs the green `t90sm` (which models the same family from a different print;
this build is measured against its own §5.38 print and carries the hull
cage + bustle-side module rows + taller skirt ERA the t90sm build lacks).

## Corroborated dimensions

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 6.86 m | en.wikipedia.org/wiki/T-90; armyrecognition T-90MS |
| Overall length (gun fwd) | 9.53 m | en.wikipedia.org/wiki/T-90 |
| Width | 3.78 m over skirts | en.wikipedia.org/wiki/T-90 |
| Height | 2.23 m turret roof (towers higher) | en.wikipedia.org/wiki/T-90; armyrecognition |
| Engine | V-92S2F, 1130 hp | armyrecognition T-90MS; en.wikipedia.org/wiki/T-90 |
| Weight | 48 t | armyrecognition T-90MS |
| Gun | 2A46M-5 125 mm | en.wikipedia.org/wiki/2A46_125_mm_gun |

## Identity cues

- WELDED prism turret; Relikt cheek wedges forming the §5.29 V (inner pair
  meets at the gun, outer cassettes continue the line to the shoulders).
- The BIG squared removable bustle across the rear with the slat cage
  standing off its tail; stowage module rows down both bustle sides.
- UDP T05BV-1 RWS (shrouded Kord class, low-profile here — see caps) +
  pano mushroom head on the bustle roof; Sosna-U housing right of the gun;
  autoloader ejection-port plate on the crown.
- Hull: TALL hard-skirt ERA (3 big panels/side), full-perimeter bar-armor
  cage on the rear flanks + transom, Relikt glacis rows.

## Reference links (links only)

1. https://www.armyrecognition.com/military-products/army/main-battle-tanks/main-battle-tanks/t-90ms-mbt-main-battle-tank-technical-data-sheet — MS kit identity
2. https://en.wikipedia.org/wiki/T-90 — dims (CC BY-SA)
3. https://thesovietarmourblog.blogspot.com/2016/07/t-90ms.html — turret furniture

## Local reference print (LOCAL-ONLY quarantine — measurement/influence only)

Path: `public/models/community-candidates/t90ms_kojf.glb` (KojfDiscord AW
series, §5.38; semantic OBJ re-bake; ATTRIBUTION series entry; registered
at 7b45f13). Probe: `tools/tmp-t90fam-probe.mjs`. Key reads (raw ≈1:1 m;
authored = +0.09 z; hull family byte-shared with the t90 print — same
tread/suspension nodes):

- turret prism body world -1.6..+1.05 (halfW 1.48..1.61, roof 2.23..2.29);
  bustle world -1.6..-2.79 (halfW ~1.0..1.24, roof 2.14..2.19, underside
  1.62..1.72); rear slat cage to -3.27 (cage01_turret x ±1.0..1.09);
  bustle-side modules (detachparts) x ±1.33, y 1.68..2.12, z -3.05..-0.88;
  RWS/pano towers 2.93..3.03 ON the bustle roof; ejection port x ±0.19,
  z -1.41..-0.93; smokecaps x ±1.48, z -0.84..-0.38; whip (0.56, -1.77).
- cheek Relikt semantic sets: era06/07 inner chevron pair (|x| 0.29..0.99,
  z to 1.46w), era04/05/08/09 outer sets to |x| 1.84, era01-03 flank
  panels; era10 roof plate x ±0.44.
- hull: era01-06_hull TALL skirt ERA (face ±1.79, y 0.76..1.43, three per
  side over z -1.25..+2.73 authored); cage01_hull perimeter bar armor to
  ±1.89 (the width line) wrapping rear flanks + transom (print rear reach
  -4.05 → authored -3.60 sliver-class); glacis rows era07-10 (upper
  y 1.08..1.43 z 1.78..2.46, lower y 0.85..1.23 z 2.44..2.94 authored).
- gun axis 1.82, muzzle 6.05 (authored 6.10; overall 9.53 sovereign).

## Certified caps (print-vs-datum, dims sovereign)

0. **Official receipt** (coordinator, 2026-08-08): orientation
   agree:true — CLEAN to score; heightPct +34 = the bustle/RWS tower
   band vs the published 2.23 roof (the cap class below). **AW
   sunk-turret interpen flag** (all three §5.38 prints, vladimir
   batch-50 class): sub-deck turret verts are print stylization (§B7
   cap), never a build target.
0a. **PRESENTATION — CLEAN (§5.60, ff5b005; §5.50/§5.53 RETRACTED)**:
   the print was NEVER turret-reversed (accessor-bound receipts;
   refRootYaw=0 at HEAD; the vertex REG over-strip repaired —
   gunNode/autoPivot restored). The r1/r2 "reversal" reads measured the
   orchestrator's live-uncommitted scene-yawOffset rows (§5.60 phantom
   chain). The delivered gate rows are the HONEST reads — ordinary
   shape deltas: next-round map = the plan-turret 11.7 bustle-cage
   footprint (§5.60 instrument-round receipt).

1. **RWS/pano towers** — print 2.93..3.03 vs pub roof 2.23 (p95 grace
   ≈2.2523): authored low-profile RWS (receiver ≈2.25, pintle sunk — the
   t90a Kord recipe) + pano head as the lone 2-col spike (2.36). The
   certified t90sm tower-cap class.
2. **Bustle roof** — print 2.14..2.19 → authored 2.10 so the RWS keeps a
   visible dims-legal head above it.
3. **Crown band** — print 2.29 center columns → authored 2.245 plate line;
   hatch rings recessed-flush (raised drums are dims-blocked at this roof).
4. **Perimeter cage rear reach** — print -4.05 → authored -3.60
   (hullLengthM body anchor -3.43; bars are sub-filter slivers).

## Mismatch log

| Date | min | hull | whole | turret | stations | dims | floaters | change |
|---|---|---|---|---|---|---|---|---|
| 2026-08-08 r1 | 16.8 | 71 | 50.8 | 16.8 | 38.5 | 65.4 | 100 | HONEST BASELINE (load-10 window). heightM 2.25 ✓ (the RWS/pano cap discipline held); widthM 3.77 ✓ (the perimeter cage carries it); hullLengthM 7.16 = the −3.60 transom cage owning the body span (column rough spans bar gaps). (The r1 "reversal" caveat was RETRACTED by §5.60 — the artifact was the orchestrator's live-uncommitted scene-yawOffset rows; these are ordinary build-vs-print reads.) |
| 2026-08-08 r2 ×2 | 11.7 | 71.5 | 50.8 | 11.7 | 45.8 | 95.4 | 100 | BIT-IDENTICAL PAIR (A==B, 3d204b8) — RATIFIED honest by the §5.60 acceptance ×2. dims 65.4→95.4 (hullLengthM 7.16→6.93: transom cage to face −3.47; heightM 2.25 held; width 3.77). NEXT-ROUND MAP (§5.60 receipt): plan-turret 11.7 = the bustle-cage plan footprint — ordinary shape work vs the print masks. Board (IoU lane): 83.5 — hull 93.4, tracks 94.4, gun 81.5, turret 61.6 (pre/post-§5.60 board scores identical — the board pipeline never carried the scene-yaw). |
| 2026-08-08 FIX ×2 | 20.7 | 72.7 | 51.3 | 20.7 | 41 | 95.4 | 100 | CRITIC FIX ROUND (defects 1-6 shared, 10-13), gate ×2 BIT-IDENTICAL, min +9.0 IMPROVE (turret 11.7→20.7), dims HELD (stations 45.8→41 inside the §5.60 cap — the widened bustle trades station slabs for the ordered plan presence). Executed: buried tip + under-roots DELETED → Relikt WEDGE BANKS (inner+outer per side, proud, seamed, capped) whose edges are the plan silhouette + vertex gap plate; slat cage STAND-OFF lattice (backdrop plate deleted — open air behind bars, grille-inset false-friend law honored); perimeter cage = 5-bar field + dense verticals + transom weave (was one rail); bustle widened to ±1.08/roof 2.14w with SEAMED+LATCHED module rows both flanks; barrel neck → smooth cylindrical step-down; §B4 loft architecture (fender deck + sponson rake + glacis slab + lane tapers) → track-clip 16/0 band 14/0 shoe (≤60 bar, residual = a named fitting); §B2 cells 8→0 (rack-gap fillers + corner brackets, backdrop removal); rubber cooled. Hash a8aceea0. |
| 2026-08-08 LADDER ×2 | 52.5 | 74.1 | 52.5 | 55.3 | 74.7 | 95.4 | 100 | §5.33 TURRET SHAPE-LADDER (§5.60 plan-turret receipts), gate ×2 BIT-IDENTICAL, min +31.8, EVERY component hold-or-improve (dims 95.4 byte-exact). THE HEADLINE MOVE: the print's whole turret cluster sits ~0.35 FORWARD of the r2 seat in the gate frame (ref prism front +1.45 / cage rear −2.87 vs our +1.05/−3.22 — the ref's hull-box recentre, not a print fact) — turretG re-seated +0.35 (−0.19→+0.16) with the tube −0.35 (muzzle world 6.10 + overallLengthM byte-held); every ratified turret-internal read moved together (bank proudness, module-row grammar, STAND-OFF cage with its ~0.3 m air gap — verified in pixels). Also: whip mast to the print seat (antenna01_24 x 0.55 z −1.30w tip 4.73 — st4 49.5%→0); pano head sunk to the 2.24w crown line (spike budget → the mast); module rows re-stepped as the print's 3-module TAPER (outer faces 1.35→1.275→1.135, seam/latch grammar kept); commander backup-sight stalk at the print's own 2.90w tip (turret_6_2, one column each view — front_whole +2.2, stations +10); forward flank run of the perimeter cage at the print's ±1.80 line (full-perimeter identity cue; st5 wPct) + transom weave widened ±1.70; wedge outer caps held at the ratified line; print-true bow dust flaps (t90 recipe). Plan self-check vs s2: prism+cage grammar, stand-off gap, tapered rows all read (shots/t90fam-ladder/t90ms). Hash 034e1bac. Guards x14 byte-held. |
| 2026-08-11 NATIVE FINAL | 0 | 75.3 | 58.9 | 51.2 | 72.5 | 0 | 100 | Honest incompatible-oracle row for the complete native-procedural rebuild. The only zero is dimensions: the tool compares the reference-visible 2.85 m panoramic/RWS combat station against the published 2.23 m turret-roof datum even though this packet explicitly distinguishes those heights. Hull 6.93/6.86 m, overall 9.52/9.53 m and width 3.77/3.78 m remain on datum. Fresh paired/yaw pixels govern this graduation; the row is disclosed, not gamed. Freeze `5076891c`. |

## Native-procedural graduation (2026-08-11)

The former long rectangular cabinet turret and small buried wheels are
retired. `rebuildT90MSTurretExact` constructs one joined low clipped-diamond
welded shell from measured longitudinal stations, then seats two joined Relikt
rows per cheek—upper and lower arms forming the side-view chevron—with two
modules along each row and sixteen framed ERA squares mounted directly on
those four mirrored surfaces beside the optic pair. All 54 remaining flank,
lower-cheek, shoulder, and roof ERA parts are projected from that same measured
station loft: their backs share the carrier facet and their thickness follows
its local outward normal. The frontal optic pair, crown plates and tapered
removable bustle remain seated in that carrier. The panoramic/RWS head, Kord, smoke banks,
antenna and rear cage use visible plinths, collars, brackets or continuous
returns. The hull now presents six large independently readable rubber-tired
road wheels, a raised short side cover, one native linked-shoe course, unequal
backed transom bays and a supported round service/recovery field. Thin bow
shoulder plates join the center glacis to both fender tips and close the final
6 cm plan pocket without entering the terminal shoe run.

The final geometry reproduces twice at **`5076891c`** (53 rendered meshes /
102,052 rendered vertices). Exact track containment is band **0/0** and shoes
**0/0**; plan contiguity is **0**; muzzle-bore proof is tagged-first-hit PASS
with 14.2/130.6 luminance and 116.4 contrast. The turret-parent tool reports
only `fitting_spareTrackLinks`, independently adjudicated as legitimate fixed
forward-deck stowage. Winding's conservative 15-pixel / 0.02% rear-quarter
deficit and fixed-hull rear-service mode-2 nominees produce no visible open
sheet, disappearing face or stranded mass in the complete yaw packet.

Fresh independent §B8 inspected 42 distinct final-byte PNGs: fourteen paired
1280x640 views plus fourteen yaw-0 and fourteen genuine yaw-90 frames at
768x768. Its fixed vector is
`[9.2,9.2,9.1,9.0,9.0,9.1,9.1,9.2,9.3,9.3,9.2,9.3,9.2,9.3]`, floor
**9.0**, mean **9.18**. It confirms source fidelity, real quarter-turn,
complete turret ownership, seated load paths, fixed hull kit, clean native
track continuity and the bow-bridge repair. No fused/stranded mass,
empty-air decoration, donor course, collision, open sheet, sky hole or
visible backface wound remains. All eight presentation assets and their
manifest binding are current; the full test suite and private production
build pass. **GRADUATED; KEEP `5076891c`; every earlier T-90MS sitting is
retired.**
