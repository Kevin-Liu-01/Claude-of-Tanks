# M1A1HA Abrams — reference packet

Variant: M1A1 Heavy Armor (first-gen DU armor package). Externally near
identical to M1A1: no CITV, no CROWS, M256 L/44.

## Real-vehicle dimensions
- Same envelope as M1A1: hull ~7.92 m, overall 9.77 m, width 3.66 m,
  height 2.44 m, M256 L/44. 7 road wheels.
  Sources: GlobalSecurity (https://www.globalsecurity.org/military/systems/ground/m1-specs.htm),
  Wikipedia M1 Abrams (https://en.wikipedia.org/wiki/M1_Abrams).

## Local GLB oracle
MODEL_SOURCE.m1a1ha points at `/models/tanks/m1a2_tejas.glb` (userdrops5) —
same oracle as m1a2_tejas / m1a1. A recovered `m1a1ha.glb` exists under
community/recovered/ but is not wired as the model source, so the lab scores
this id against the Tejas M1A2. Scoring-frame targets: see
docs/references/tanks/m1a2_tejas.md (identical).

## Notes / mismatches
- Same oracle-vs-history conflict as m1a1 (CROWS mass present on the oracle).

## Outcome (final lab state)
Shares the tejas oracle/geometry: 75.4 -> ~87 (H92 T78 G87 R88). See
m1a2_tejas.md for the LOD-bucket and camera-tilt notes.

## Round 2 (shaded-parity, 2026-07-30)
Identical build to m1a1 (correct per packet); see m1a1.md round-2 note.
Score 87.1 -> 86.6.


## Round 5 — gate v6/v7 iteration (2026-07-31)
TILT-COMPENSATION REVERT: every v5 'published-0.20' constant is gone. The
shell roofs are physically true again (cheek tips 2.15, shoulders 2.30,
main/bustle roof 2.36 world; v5 had dropped the family roof to 2.24), the
glacis hump/splash board are flush (the v5 deck was authored to the tilted
silhouette), and the bustle rack top rides at the published 2.44.
WIDTH GUARD: the v5 skirt bolts/handles/joint plates poked 1.5-2.5 cm past
the skirt face and the rear soot decals (render meshes!) poked 0.17 above
the deck and 0.05 past the tail — all seated flush; the widest mesh is now
exactly the committed +-1.83 (procScale 1.000).
DIMS DISCIPLINE (v6 heightM = p95 of side body-column tops): the rack rails,
rear-roof block and hatches form a deliberate 2.44 plateau; only the compact
CWS/CROWS head (z-local 0.11..0.32, ~2 columns, top 3.27 = the oracle's
cluster peak) rises above it. Whips stay stowed as base pots.
CERTIFIED CAP (v6 numbers): the oracle carries its CROWS/M240/doghouse
cluster as a 1.6 m-long solid at 3.21-3.29 world (z 0..1.6) plus twin whips
at 4.09 — matching more than ~2 columns of that under the published 2.44
p95 breaks dims by construction. wholeCurves/turretCurves/stations are
capped ~50/52/61 by exactly those columns (each carries ~0.83-1.65 m of
unmatchable top error); hullCurves 90.1, dims 98.1, floaters 100 are the
achievable components and are green.
Final: hull 90.1 / whole 51.8 / turret 52.5 / stations 60.9 / dims 98.1 /
floaters 100.


## Gate v10 note (2026-07-31)
Shares the m1a1 build and caps (tejas-family CROWS-cluster height cap
STANDS). hull 90.1 passes v10; dims 98.1, floaters 100.

## 2026-08-01 re-verification (fleet dual-gate program)
Cap re-derived from the CURRENT tejas GLB via a fresh gate run + full-curve
probe: the oracle still carries the CROWS/M240/doghouse cluster as a
1.65 m-long solid at 3.20-3.28 world (z -0.7..0.95) plus whips to ~4.08 —
the v6/v10 height-cluster cert STANDS unchanged (matching more than the
~3-column p95 budget breaks published heightM 2.44 by construction).
Shared-machinery fixes from this session's abrams.js work (rear-face
fittings tucked inside the tail plane, soot decals on the rear plate, lift
eyes seated on the deck) lifted the family without touching its certified
posture: stations 60.7 -> 68.9, dims 98.1 -> 98.8, turret 48.1 -> 49.2,
whole 52 -> 52.1; hullCurves HELD at 90.1 (passing). Boards regenerated
(&board=1) for the independent critic; IoU floor 87.6 (committed 86.6 — no
regression).

## 2026-08-02 vertex round
Shares buildTejasFamily ('cws' station) — full round notes, the TRUE
stylization verdict (+34.8% height, length/width true) and the oracle WARP
WORK ORDER live in m1a1.md. Row moved with the family:
hull 90.1 -> 92.9, whole 52.1 -> 55.0, turret 49.2 -> 49.5 (certified
cluster cap binding; plan_turret 63 -> 90.7), stations 68.9 -> 68.8,
dims 98.8 -> 100, floaters 100.

## 2026-08-02 post-warp re-tune (shared tejas build)
Shared-build round banked in m1a1.md ("POST-WARP RE-TUNE ROUND"): trio now
hull 92.4 / whole 88.9 / turret 85.9 / stations 90.3 / dims 100 / floaters
100. The knee-band + whip residual law (heightM sovereign vs the warped
ref's 2.556 band) and the W1b orchestrator flag live there.

## FAMILY VARIETY + §B4 CONTAINMENT (graduate-change round, 2026-08-03)
NEW FREEZE HASH: b14be581 (was 88a4a978; 46 meshes / 158212 verts).
Shares the m1a1 round's §B4 set (TEJAS_HULL laneCarve, gear_wrapPads
per-side migration, rear-door narrowing — see m1a1.md): audit front 0 /
rear 0 exact. VARIETY loadout (distinct from m1a1): rackDufMul [1,0,0] +
stowed pintleMG 'm2' WITH SHIELD (top 2.27 < the 2.31 class) + a
FITTINGS.spareTrackLinks strip flat on the freed floor (links along x,
tops 2.00 — under the stowed barrel line). Census mg1+1d ✓. Gate: the
identical 89.4 as m1a1 (bisect-proven neutral — pristine HEAD reads the
same 89.4 today; pre-existing override-path drift, orchestrator lane).
Critic pairs: shots/critic-m1a1ha/. Re-freeze at landing.

## §B1 TURRET FRONT SLOPE (graduate-change round, 2026-08-04)
Shares buildTejasFamily/TEJAS_TURRET — full round notes + angle table in
m1a1.md. Print (m1a2_tejas.glb, the registered ref) cheek rake 34.8° from
vertical; authored before 2.5° (faceRake 0.02, the slab read); after
faceRake 0.32 = 34.8° cheek edge exact. Gate x2: 89.4 held both runs
(turret 89.6->89.8, stations 93.5->93.9, dims/floaters 100). §B5 audit
0/0/0; standard-check PASS; pairs shots/abrams-b1/{before,after}-m1a1ha/
(proc-half diff localized to the turret front, 295 px view-left; ref half
0-diff). NEW HASH b14be581 -> 5c765fc4 (46/158212) for re-cert+re-freeze.

## §B1-6/§B4 SHOE-SWEEP + §B2-READ REAR (graduate-change round, 2026-08-05)
OWNER REPORT (screenshot, m1a1ha rear 3/4): "tracks are glitching through
and theres gaps between stuff in the model. fix!"
DIAGNOSIS (measured, tankFactory shoe math — the --exact clip audit tests
the BAND only, audit-blind to shoes):
- SHOE ENVELOPE = end-wheel r + bandOuterR(0.045+th/2) + link rOut
  (th/2+0.012) + pad faces(0.073) = r + 0.220. Sprocket (r 0.32 @ y 1.10,
  z -3.28) sweeps to z -3.820 across y 1.02..1.18; the rear flap
  (z faces -3.769..-3.741, y 0.965..1.205) sat FULLY inside the sweep —
  interpenetration at every track phase. Idler (r 0.34 @ 0.88, 3.02)
  sweeps to z 3.580; front flap faces 3.556..3.584 — clipped.
- "GAPS": (a) the hullDark TIP box + grille frame straps + pintle base bar
  fired pitch-black under the dark-bucket outgoing scale (the r4
  door-backing class) — void reads, not geometry; (b) the §B4 stern lane
  carve (x 1.08) leaves the rear corners open shelf-ring-to-skirt — a
  stepped see-through channel at rear quarters.
FIX (all m1a1ha-gated; m1a1/m1a2_tejas/m1a2_tusk byte-identical — hashes
97c10194 / 3fcae440 / f7ecade4 verified unchanged, m1a2 f3c34424,
m1a2_sepv2 untouched by this lane):
- REAR FLAP DELETED (g.noRearFlap opt-in): refcurves 2026-08-05 prove the
  ref's own -3.778 band at plan cols 61-63 / side col 90 is its PARKED
  SHOES — our parked pads carry the same columns, so the flap was
  mask-redundant AND unreachable without clipping. Front flap re-hung
  (g.frontFlapZ 3.620; extremes 3.596..3.644): >=1.6 cm sweep clearance,
  same side trace col 23 [3.550..3.660], behind the fenders' plan reach.
- CORNER TONGUES (fender-back plates, both sides): x 1.06..1.692 (welded
  2 cm into the shelf-ring wall), y 1.55..1.695 (sweep clearance >=1.9 cm,
  under the 1.713 deck), z -3.598..-3.618 (side col 89 interior,
  plan-interior to the -3.641 skirt read) + bolted edge lip (§B3 tell).
- REAR-KIT softDark (tejasRearKit opt-in): TIP box -> detail tone + lid
  seam/latch/cable-port (§B3 phone-box tells; x 0.90..1.06 is outside the
  shoe lane — never swept); grille straps + pintle base -> hullShadow
  (the ref's ~49/255 mid-shadow floor).
GATE HOLD x2 IDENTICAL, ZERO delta: min 89.4 | hull 91.7 whole 89.4
turret 89.8 stations 93.9 dims 100 floaters 100 (= pre-fix baseline both
runs; the parked-shoe analysis priced the flap deletion at exactly 0).
CHANGED VIEWS: view-rear, view-rearleft, view-rearright, hero-rearright
(corner tongues + TIP/strap tones + flap deletion), view-left/right +
view-front + close-front (front-flap 4 cm re-hang), hero-toptilt
(marginal). Before: shots/abrams-b3/m1a1ha-before/; after:
shots/critic-m1a1ha/ (fresh full 14-view set, zero console errors).
NEW HASH 5c765fc4 -> f5c556dc (46 meshes / 158608 verts) — graduate-change
re-freeze on landing after critic re-cert of the changed views.
RESIDUAL (honest): below the tongues the open sprocket bay shows the
honest wrap exactly like the ref's own corner; m1a1 + m1a2_tejas +
m1a2_tusk carry the SAME flap-in-sweep defect classes (same TEJAS_HULL
numbers) — REPORTED for their own graduate/band rounds, not forced here.

### Round-close audit lines (official rigs, 2026-08-05)
- standard-check: gateMin 89.4 (91.7/89.4/89.8/93.9/100/100 — the
  pre-existing sub-90 drift row, held EXACTLY), clip 0/0 ✓, contig 0 ✓,
  decor mg1+1d ✓.
- track-clip --exact: front 0 / rear 0 (tongues + re-hung/deleted flaps
  clear of the band by construction and by audit).
- turret-parent: stranded 0 / abutting 0 / dangling 0.
- visual-evaluator (fresh, post-fix): RIG PARITY OK all views (yawProxy
  0.2-1.6°); report at shots/visual-eval-m1a1ha/ (17:07 run).
- npm test: full suite green.

### LANDED PENDING RE-CERT (2026-08-05, orchestrator — owner takeover order)
The §B4/§B3 rear fix (owner report: "tracks are glitching through and theres
gaps") landed with the family round. Gate HOLD x2 zero-delta at the frozen
row (89.4 | 91.7/89.4/89.8/93.9/100/100). RE-FREEZE CANDIDATE f5c556dc
(46 meshes / 158608 verts, orchestrator-verified; was 5c765fc4) — the
graduate-change re-cert critic (changed rear views, >=9.0 bar) is IN FLIGHT
at landing; its verdict ratifies the re-freeze or files orders.

### RE-CERT RATIFIED (2026-08-05): floor 9.0, mean 9.09 over nine changed
views — owner defect classes dead (no shoe-through, no corner channel,
TIP reads a bin). RE-FREEZE f5c556dc CONFIRMED (was 5c765fc4);
docs/critique/shaded-parity-m1a1ha-rearfix-recert.md.

## §B1.1 LEFT CHEEK + §B3.1 GUN RUN (2026-08-06, abrams builder — family
## batch; shared tejasRoofKit/buildTejasFamily lines, full mechanics +
## law bank in m1a1.md this round)
Inherits the left-cheek raked-bulge rebuild (stair prisms + vertical
chord plate -> chord-toe + 34.8° wedges, left M250 onto the bulge face)
and the M256 elliptical thermal-jacket swap (dust-cover prisms ->
segmented jacket at the exact envelopes). PROOF: m1a1 A/B curve run
byte-identical on all 18 rows; THIS id gate x2 IDENTICAL at the FROZEN
ROW: min 89.4 | 91.7/89.4/89.8/93.9/100/100 both runs. standard-check
clip 0/0, contig 0, mg1+1d; §B5 audit 0/0/0. Before/after:
shots/abrams-cheek-r1/{before,after}-m1a1ha/.
CHANGED VIEWS for re-cert: view-frontleft, view-frontright, close-front,
hero-frontleft, view-left, view-right.
CANDIDATE HASH for re-cert + re-freeze: m1a1ha 96d4dfc4 -> cd209f68 (42/151120).
