# FLEET BORE+WINDING SWEEP — batch re-cert, independent critic verdict
# (2026-08-06, fourteen graduate candidates in ONE run, landed f186893)

Scope: graduate-change re-cert for the fleet muzzle-bore + §C.1 winding
+ mantlet sweep (commit f186893, "38 tanks, 6 files"). Fourteen
candidates adjudicated + isu152 freeze-verify. Never-gates m60a1/m60a3
taken hash+render only; leo2_revolution taken hash+render with its gate
PENDING-ORACLE per the orchestrator brief (owner's b08d1a2 GLB revert
broke the batch-43 baseline — adjudicated in the orchestrator lane, NOT
here).

Frame: CLEAN-ROOM WORKTREE at **f186893** (LIVE-TREE FROZEN-SIB law —
the live tree carries an active foreign WIP: t14/t90m measured-ladder
edits in modern2.js/russia.js + regenerated gate JSONs incl. four of my
candidates; none of my candidates' profile files are touched by it, but
the worktree is the honest frame). Tracked tools identical by
construction; untracked puppeteer drivers (tmp-hashgeo.mjs,
tmp-muzzle-crops.mjs) copied in verbatim — the render pages they drive
are tracked at f186893. Worktree: scratchpad/wt-f186893 (git status
clean apart from the node_modules symlink).

Byte-discipline: `tmp-hashgeo.mjs` on all 16 ids at campaign OPEN and
CLOSE — **run1 == run2 byte-identical** (diff clean), every hash EXACT
at its briefed value, **isu152 8e2f75c0 byte-frozen confirmed**.
Evidence: my own end+quarter crops re-rendered at the verdict state
(`tmp-muzzle-crops.mjs --out=scratchpad/recert-crops`, one-ticket batch
per §F.1) — **all 32 crops pixel-identical (0px > t4) to the builder's
shots/muzzle-sweep/after/ index**, so the builder's after-evidence is
hash-stamp VALID and either set is citable. Changed-view lists
diff-derived per §J from before/after crop diffs (threshold t>4
recorded; casemates have no before-crops — their changed views derived
from the winding piece AABBs instead).

## HEADLINE: 12 of 14 RE-CERT PASS (re-freeze at the new hashes),
## 1 RE-CERT FAIL — **centurion3, floor 7.5** (end-on bore reads as a
## dark camo CAP, not the ordered void; oblique reads true; surgical
## one-view fix), 1 PENDING-ORACLE — **leo2_revolution bb2bb60c**
## (hash+render clean on my watch; gate adjudication is the
## orchestrator's). Round takes ONE claims-law discipline flag: the
## commit headline "winding census REVERSED -> 0 across all six files"
## is FALSIFIED by the official mode-1 census on leo2a5 (2), leo2a6 (3),
## merkava1b (2) — all seven survivors baseline-identical deficit-0
## latents (proof below); the tanks themselves pass.

## VERDICT TABLE

| tank | verdict | hash (re-freeze) | changed-view floor | notes |
|---|---|---|---|---|
| m26_pershing | RE-CERT PASS (re-freeze 65c564c0) | 2f579de8 -> 65c564c0 | 9.3 | end 9.4 / quarter 9.3; brake-collar bore + baffle window |
| m46_patton | RE-CERT PASS (re-freeze 108806c8) | 90ebf864 -> 108806c8 | 9.3 | end 9.3 / quarter 9.3; LEFT fender run repaired, reads fuller (26 strips) |
| m47_patton | RE-CERT PASS (re-freeze 2fc99c50) | 53b6123a -> 2fc99c50 | 9.3 | end 9.3 / quarter 9.3; deflector exit + window slot |
| m60a1 | RE-CERT PASS (re-freeze 912de524) | fbf9f4cc -> 912de524 | 9.4 | NEVER-GATE honored; hash+render only; old 1mm-inside counterbore replaced, void true |
| m60a3 | RE-CERT PASS (re-freeze 097c35a2) | 051c454c -> 097c35a2 | 9.4 | NEVER-GATE honored; hash+render only |
| leo2a5 | RE-CERT PASS (re-freeze e215a738) | d34a0a58 -> e215a738 | 9.2 | end 9.3 / quarter 9.2; 2 latent census pieces remain (orders banked); committed gate row stale vs packet (below) |
| leo2a6 | RE-CERT PASS (re-freeze 09912270) | cff6f478 -> 09912270 | 9.1 | end 9.3 / quarter 9.1; recess over kept face ring reads true (36-flat); 3 latent pieces remain |
| kf51 | RE-CERT PASS (re-freeze 9ac547ac) | fcc60d6c -> 9ac547ac | 9.2 | winding-only; repaired hull band reads whole; graduated collapse-class void 11-flat (rim-grammar watch, pre-existing) |
| leo2_revolution | **PENDING-ORACLE** (hash noted bb2bb60c) | fa1a47fc -> bb2bb60c | 9.2 (render-only) | end 9.3 / quarter 9.2; census 0, deficits at-baseline, m2 cand 5 = baseline; NOT ratified/failed on gate grounds |
| merkava1b | RE-CERT PASS (re-freeze 2cc7a76c) | 470f3665 -> 2cc7a76c | 9.3 | end 9.3 / quarter 9.3; census 5 -> 2 (big hull-rear + turret cores repaired; 2 small latents remain, orders banked) |
| merkava3c | RE-CERT PASS (re-freeze 8b7ed9bc) | b7318b10 -> 8b7ed9bc | 9.3 | end 9.4 / quarter 9.3; LEFT wedge serrated holes -> whole (best visual proof in the set), census 6 -> 0 |
| merkava3d | RE-CERT PASS (re-freeze 39de83c8) | 6b97616c -> 39de83c8 | 9.3 | end 9.3 / quarter 9.3; census 4 -> 0 |
| chieftain5 | RE-CERT PASS (re-freeze d4f2a9a6) | 94c09bb0 -> d4f2a9a6 | 9.2 | end 9.2 / quarter 9.3; gun-tip collar sliver repaired (census 1 -> 0) |
| centurion3 | **RE-CERT FAIL floor 7.5** | (holds fea56ecc; 46b03895 NOT ratified) | 7.5 | END-ON bore = rim + CAMO-TEXTURED CAP (luma 44/45/47 mottled vs 36-flat family void; its uk.js sibling chieftain5 reads 36-flat) — ordered void read absent at the mandated 2x end-on; QUARTER reads TRUE black void 9.3; census 6 -> 0, deficits 0, clip/contig clean. Orders below — surgical, one view. |
| isu122s | RE-CERT PASS (re-freeze 8f420d18) | 60b08d10 -> 8f420d18 | 9.1 | winding-only; ±1.135 side strips repaired (census 2 -> 0), flanks whole; muzzle untouched by sweep — lit dark-cap grammar (62-flat) flagged as CASEMATE-LANE order, not a sweep defect |
| isu152 | FROZEN VERIFIED | 8e2f75c0 (byte-identical) | n/a | guard byte-neutrality proven at both bracket ends; crops identical to builder's; proud dark core reads dark (39-flat) |

Graduation severity, >=9.0 per changed view: **met on every scored view
of every tank except centurion3 end (7.5)**.

## STANDING CHECK 1 — GATE x2 (12 gated candidates)

`geometry-gate.mjs --ids=<12>` run TWICE in the worktree:
**12/12 PASS both runs, and the two runs are line-for-line identical**
(gate-run1.log == gate-run2.log). Vs the landed lines:

- 10/12 rows EXACT at the committed docs/geometry-gate/<id>.json rows
  (m26 90.5-family: 93.1/90.5/94.2/90.6/100/100 — exact; m46 91.2; m47
  91; leo2a6 90.9 incl. its dims-91 razor row; kf51 90.4; merkava1b 90;
  merkava3c 90.5; merkava3d 90.4; chieftain5 91.2; centurion3 91.1).
- **leo2a5**: measured turret **91.5 x2** vs committed JSON 91.6. The
  sweep packet (docs/references/tanks/leo2a5.md) DECLARES
  "turret 91.6->91.5 (-0.1, investigated: non-planar quad
  re-triangulation of REPAIRED left-cheek slabs; min 90.8 PASS
  unchanged)" — my measurement CONFIRMS the declared post-sweep row;
  the committed JSON/ledger row is one teeter band STALE (pre-final-edit
  artifact). Min 90.8 PASS unchanged. BOOKKEEPING ORDER, not drift.
- **isu122s**: measured whole **90.3 x2** (min 90.3) vs committed 90.1.
  Packet DECLARES "gate HELD x2 EXACT 90.3 PASS" — again my x2 matches
  the declaration; committed row stale in the favorable direction.
- Never-gates m60a1/m60a3/kv2 skipped (honored); revolution not gated
  (PENDING-ORACLE; its landed ledger row 62.8 gatePassed:false is the
  broken-oracle state the orchestrator owns).

Geometry cannot have moved between the committed rows and my runs — the
hash bracket is byte-stable — so both deltas are measurement-frame
teeter (AA-TEETER family) frozen differently into stale JSON, and both
match the builder's own declared numbers.

## STANDING CHECK 2 — HASHGEO x2 BRACKETING

Open + close runs identical; all 14 candidate hashes EXACT at the
briefed old->new values (table above); isu152 **8e2f75c0** byte-frozen
at both ends (the sweep's guard-neutrality proof holds on my watch).
Tool prints leading-zero-stripped hex (97c35a2 = 097c35a2, 9912270 =
09912270).

## STANDING CHECK 3 — WINDING AUDIT (official tools/winding-audit.mjs,
## same tool as the banked baseline — the sweep commit did NOT touch it)

Mode-1 census (mesh-level, AUTHORITATIVE per §C.1):

| id | baseline rev | mine | id | baseline rev | mine |
|---|---|---|---|---|---|
| m26 | 0 | 0 | merkava1b | 5 | **2** |
| m46 | 0 | 0 | merkava3c | 6 | **0** |
| m47 | 0 | 0 | merkava3d | 4 | **0** |
| m60a1 | 0 | 0 | chieftain5 | 1 | **0** |
| m60a3 | 0 | 0 | centurion3 | 6 | **0** |
| leo2a5 | 2 | **2** | isu122s | 2 | **0** |
| leo2a6 | 3 | **3** | isu152 | 0 | 0 |
| kf51 | 0 | 0 | revolution | 0 | 0 |

22 of 29 baseline-reversed pieces on the candidates repaired; **the
commit headline "REVERSED -> 0 across all six files" is FALSE for
leo2a5/leo2a6/merkava1b**. Piece-identity proof: all seven survivors
carry the SAME node/tris/AABB/signed-volume as the banked 20260806
baseline —
- leo2a5 rig_turret x2: [1.03,2.20,1.068]-[1.27,2.358,1.894] (12t) and
  [-0.94,2.542,1.133]-[-0.21,2.600,1.264] (12t)
- leo2a6 rig_turret x3: [-1.50,1.91,1.10]-[-1.44,1.98,1.40],
  [-1.38,1.91,1.305]-[-1.32,1.98,1.605] (12t each),
  [0.43,2.55,-0.39]-[0.81,2.57,-0.01] (80t)
- merkava1b rig_turret x2: [-0.14,2.17,1.11]-[0.14,2.215,1.41] (12t),
  [0.03,2.63,-1.011]-[0.05,2.635,-0.989] (sliver)

i.e. NOT regressions — unrepaired pre-existing latents of the §C.1
LATENT REVERSED-CORE class (deficit-0, occluded; PROGRAM-STATE 4.95
banks this exact class as "sweep when lanes free"). The builder's
"F-vs-D ray proof" (bespoke tmp-sweep-windprobe.html, added in the
sweep commit) structurally cannot see them — rays only prove
render-visible surfaces. Claims-law: census claims cite the OFFICIAL
mode-1 census only. **Round discipline flag; per-tank non-blocking**
(adjudication: zero render deficit in all 9 official views, occluded by
proof, byte-identical to the previously RATIFIED frozen states, no view
below 9.0). Orders banked below. Orchestrator may overrule to FAIL
cheaply — the fix is seven slab re-orients at the AABBs above.

Mode-1b render deficits: **byte-identical to the fleet baseline on
every view of every candidate** (m26 rearleft/rearright 156/156, m47
47/48, isu122s rear 52, isu152 right 111/left 107/frontleft 75/
frontright 79, merkava3c left 10/right 9, kf51 rear 3, m46 front 1 —
all pre-existing, all below flag thresholds; everything else 0). No new
holes anywhere ("deficits at-or-below baseline" met with equality).

Mode-2 yaw: casemates isu122s 10137 / isu152 8390 HARD with
**coincidencePx 0 = the §C.1 CASEMATE BY-DESIGN signature**
(adjudicated at baseline, unchanged). chieftain5 600 / m46 252 /
revolution 5 candidates — all baseline-identical (§J static-pixel
false-flag class, banked). Clean elsewhere.

## STANDING CHECK 4 — SPOT BATTERIES (5-tank spread)

`tank-standard-check.mjs --ids=m46_patton,leo2a6,merkava3c,centurion3,isu122s`:
track-clip **0/0 x5**, contiguity **0 holes x5** (this also proves the
sweep's standard-check law-alignment fix works: shadow-named bores
present with zero phantom holes), gate rows consistent with my runs.
Decor census: m46 mg1+2d, centurion3 mg1+0d PASS; leo2a6/merkava3c/
isu122s mg0+0d = the KNOWN pre-fittings hand-authored class (predates
the sweep, not sweep-attributable; standing migrate-or-justify lane
debt).

## CHANGED-VIEW SCORING (diff-derived per §J; my verdict-hash crops)

Changed-view fractions (t>4) before->after: end views 0.5-40% changed
(bore + re-oriented-slab shading truth-ups), quarters 1-13%. kf51
smallest (0.5% — winding-only, bore pre-existing). Casemates: no
before-crops in the index; isu122s scored on its repaired-flank regions
(side strips read whole; census+deficit proof) + muzzle verified
unchanged-by-sweep.

Bore end-on machine check (bore-center luma rect ~(298,320)-(342,365),
ITU-601 p10/p50/p90): m26/m46/m47/m60a1/m60a3/leo2a5/revolution/
merkava1b/3c/3d/chieftain5 = **36/36/36 flat** (family shadow-mat void
class); leo2a6 tight-rect **36-flat** (recess over its kept face ring);
kf51 **11-flat** (geometric collapse void); isu152 39-flat (proud dark
core, frozen). Deviants: **centurion3 44/45/47 mottled** (the FAIL),
**isu122s 62-flat lit cap** (pre-existing grammar, casemate-lane
order). Oblique: every rim conforms to its tube face — **no floating
rims** anywhere; brakes/deflectors carry their side windows (m26/m47).
Mantlets: real mass present at every scored gun root (§B3.1-mandatory
check PASS fleet-wide; no bare-tube-through-flat-face reads).

Flank repairs read WHOLE: merkava3c left wedge before = serrated
bright/hole sawtooth (reversed courses culling), after = continuous
shaded wedge; m46 left fender run fuller with repaired strips lit;
leo2a6 glacis/nose panels now render lit; leo2a5 left-cheek re-tri
declared and priced (-0.1 turret); no vanished panels on any view.

## FINDINGS + ORDERS

1. **centurion3 (FAIL, surgical)**: the sweep's bore landed
   half-visible — QUARTER shows rim + true black recess; END-ON the
   aperture fills with a dark camo-TEXTURED surface (44-47 mottled;
   compare same-file chieftain5 36-flat). Mechanism candidates: disc
   seated behind the 20-pdr tube's own end-cap plane (packet seats the
   face at gunLen-0.02 — the m60a1 invisible-counterbore class with
   polarity flipped), or the disc bound a camo material slot instead of
   the shadow/void slot. ORDERS: (a) verify muzzleBore disc parent/seat
   vs the tube end-cap plane and its material binding at
   uk.js/buildCenturion3; (b) machine gate: end-on bore-center luma
   flat <=38; (c) re-crop end view + single-view re-cert, then
   re-freeze 46b03895 (everything else on this tank is clean: census
   6->0, deficits 0, clip 0/0, contig 0, gate 91.1 x2 EXACT).
2. **Latent-core orders (leo2a5 2, leo2a6 3, merkava1b 2)**: re-orient
   the seven pieces at the AABBs listed in check 3 (orientedSlab
   binding or corner re-order at their call sites), next
   latent-core/lane-free round; census-0 then closes honestly.
   ROUND DISCIPLINE FLAG: headline census claim not measured on the
   official tool; packets omit the surviving census pieces
   (honest-residuals law).
3. **Bookkeeping true-ups (orchestrator, at landing)**: regenerate
   docs/geometry-gate/leo2a5.json (turret 91.5) and isu122s.json
   (whole 90.3, geoMin 90.3) + ledger rows to match the declared+
   measured values; isu152 packet one-liner says "gate 91.2" vs ledger
   90.2 (typo class, isu152 not in my gate set).
4. **Casemate-lane order (isu122s, non-blocking here)**: A-19S muzzle
   reads as a LIT dark-grey cap (62-flat) at 2x end-on and visibly
   plane-lit at oblique — weaker than the sweep's rim+void standard;
   §B3.1 addendum is fleet-mandatory, so its own round owes the
   hullG-parent muzzleBore (mechanism already exists in casemate.js for
   strv103/jagdtiger/jpz_e100/t95). Same class watch on isu152's
   polygonal core outline (byte-frozen today).
5. **kf51 watch (pre-existing, certified)**: collapse-class void is
   deep/black (11-flat) but carries no rim ring and its opening reads
   faceted at 2x (ROUNDED-RECT SEG floor: sagitta >1px) — rim-grammar
   refinement is a kf51-lane order-candidate, NOT this re-cert's.
6. **leo2a5/revolution sleeve-edge watch**: L44/L55 thermal-sleeve top
   edge reads hard-creased at quarter — certified envelope-swap class
   (§B3.1 corollary: judged by shading gradient + ring grammar, and
   clamp rings are present); no order, logged for the leopard lane's
   next visual round.
7. **leo2_revolution PENDING-ORACLE**: hash bb2bb60c noted; my
   hash+render checks all clean (bores true, census 0, deficits
   at-baseline, crops == builder's). Its gate/oracle adjudication and
   any ratification remain the orchestrator's (URGENT item 4.995).

## LAWS FOR THE BANK

- **RAY-PROOF != CENSUS (§C.1/§D claims addendum)**: FrontSide-vs-
  DoubleSide RAY probes prove only render-visible surfaces — deficit-0
  latent reversed-cores are structurally invisible to them. A census
  claim ("REVERSED -> 0") cites the official winding-audit mode-1 mesh
  census or it is not evidence. Bespoke probes remain diagnosis-only.
- **BORE-SEAT END-ON PROOF (§B3.1 addendum corollary)**: a muzzleBore
  landing is proven by the END-ON crop's bore-center luma reading FLAT
  at the family void tone (<=38 here; kf51-class geometric voids read
  lower), never by boreNodes presence — a disc seated behind the tube's
  own end cap reproduces the m60a1 invisible-counterbore class with
  polarity flipped: rim visible, void true at OBLIQUE, cap at END-ON
  (centurion3). Cheap machine check; add to bore-round evidence.
- **FAMILY VOID-TONE TABLE**: hemi-lit shadow-mat discs read 36-flat
  fleet-wide in the muzzle-crop rig; kf51 geometric void 11-flat;
  camo-class dark green ~40-50 WITH texture spread/mottle. A bore
  center off its family tone = seat/material investigation before any
  scoring.
- **STALE-ROW-VS-DECLARATION**: when a committed gate JSON disagrees
  with the packet's declared post-round row by one AA-teeter band and
  the hash bracket is stable, the DECLARATION + fresh x2 is the truth
  and the JSON is the artifact — order the regen, don't order geometry
  (leo2a5 91.5, isu122s 90.3).
- Clean-room confirmation: worktree x2 gate pairs reproduce
  line-identically (both logs byte-equal) — razor rows that teeter
  across environments are STABLE within one honest frame; single-frame
  x2 pairs are the right stability instrument (§D AA-teeter).

## EVIDENCE

- Worktree @ f186893: scratchpad/wt-f186893 (hashgeo-run{1,2}.log,
  gate-run{1,2}.log, winding-run.log + shots/winding-audit.json,
  standard-check.log, muzzle-rerender.log in scratchpad root)
- My verdict-hash crops: scratchpad/recert-crops/ (32 PNGs) — proven
  pixel-identical to shots/muzzle-sweep/after/ (crosscheck-after-vs-
  mine.json, all 0px at t>4); before/after diffs:
  crop-diff-builder.json (threshold t>4 recorded per §D)
- Fleet winding baseline: shots/winding-audit-fleet-20260806.json
  (comparisons above are same-tool, tool untouched by the sweep commit)
- Luma rects + zoom crop: cent3-bore-zoom.png (2x aperture extract)

## CURRENCY ADDENDUM (campaign close)

Main HEAD advanced f186893 -> 4f12420 during my campaign (live-tree
hazard, observed live — six commits: registry/roster/icon operations,
m1a2_tejas rename, k2/leo2a7/t72b3/type99a roster ops). File-list
verified: NONE touch the candidates' profile files (patton/leopard/
merkava/uk/casemate/kit) — the verdict hashes remain current at
4f12420. Standard practice still applies: orchestrator re-verifies
hashgeo at the landing commit.

— independent critic, fleet bore+winding re-cert, 2026-08-06

---

# centurion3 RESIT — single-view re-cert of the surgical bore re-seat
# (a125d0d, one-line muzzleBore re-seat; independent critic, 2026-08-06)

Scope: exactly the failed contract from the campaign above — hashgeo x2
bracket (centurion3 + frozen-sib chieftain5), gate x2 at the 91.1 line,
END-ON bore view scored fresh at 2x with my own luma measurement
(ITU-601 center patch, this doc's method + family void-tone table),
quarter spot-check. Floor >=9.0. Fresh renders only.

Frame: CLEAN-ROOM WORKTREE at **a125d0d** (== live HEAD at my open AND
close; live tree carries foreign WIP — modern3/ww2/world/main + three
render pages — none on my render path, but the worktree is the honest
frame; uk.js verified CLEAN vs HEAD in the live tree). Tracked tools
identical by construction; untracked drivers (tmp-hashgeo.mjs,
tmp-muzzle-crops.mjs) copied in verbatim; worktree status clean apart
from the node_modules symlink. Combat-selftest red in the live tree is
the known foreign sim-lane WIP — not run, not adjudicated here (npm
test not part of this contract).

## VERDICT: **RE-CERT PASS (re-freeze 50273080)** — end 9.2 / quarter
## 9.3, floor 9.2. The ordered void read is DELIVERED at the mandated
## 2x end-on: bore-center **35.7/35.7/35.7-FLAT** on my own
## measurement, byte-EXACT the tone of the ratified chieftain5 control
## measured in the same run. One claims-law flag (below): the commit's
## "one changed view (end-on)" is falsified by the §J diff — the
## QUARTER also changed (4.13% t>4, muzzle mouth only); scored anyway,
## it IMPROVED. Non-blocking.

## STANDING CHECK 1 — HASHGEO x2 BRACKET

Open + close runs line-identical (hashgeo-run1.log == run2.log):
- centurion3 **50273080** (45 meshes, 67725 verts) — EXACT at the
  briefed candidate, stable both ends
- chieftain5 **d4f2a9a6** (41 meshes, 94065 verts) — byte-identical at
  its ratified re-freeze, both ends

## STANDING CHECK 2 — GATE x2 (worktree, fresh)

`geometry-gate.mjs --ids=centurion3` TWICE — both runs EXACT at the
landed line, logs line-identical:

    min 91.1 | hull 92.8 whole 91.2 turret 91.1 stations 95.2 dims 100
    floaters 100 PASS

Row json BYTE-identical across the two runs AND byte-identical to the
committed docs/geometry-gate/centurion3.json (three-way cmp clean) —
the builder's "row json byte-identical" claim REPRODUCED.

## LUMA TABLE (my measurement: ITU-601, rect (298,320)-(342,365),
## p10/p50/p90 + spread + sd; 2.0 spread = flat threshold)

| crop (state) | p10/p50/p90 | spread | sd | read |
|---|---|---|---|---|
| centurion3 end, FRESH @50273080 | **35.7/35.7/35.7** | 0.0 | 0.06 | **FLAT — family void, <=38 MET** |
| chieftain5 end, FRESH @d4f2a9a6 (control) | 35.7/35.7/35.7 | 0.0 | 0.06 | FLAT — ratified family tone, identical |
| centurion3 end @46b03895 (failed state, builder after/) | 43.9/45.4/46.5 | 2.6 | 1.06 | mottled camo cap — the FAIL, reproduced by my rig |
| centurion3 end @fea56ecc (pre-sweep before/) | 43.9/45.4/46.5 | 2.6 | 1.06 | IDENTICAL to failed state — occlusion proof: the sweep's disc never reached the end-on pixels |

The before==after identity on the failed views is the mechanism's own
signature: the sweep's disc sat 8mm behind the 20-pdr tip collar's cap
(collar spans to exactly gunLen=5.15; the {len} seat derived 5.13),
so the end view was pixel-unchanged by the sweep — the m60a1
invisible-counterbore class, polarity flipped, exactly as the campaign
diagnosed. The fix (uk.js: `muzzleBore(P, { z: gunLen, r: 0.145 })`)
is the in-file L7A1 precedent recipe verbatim (z at the collar cap
plane, r at the collar face) — mechanism verified read-only at
src/vehicles/profiles/uk.js:3004 vs the precedent at :4224.

## VIEW SCORES (fresh renders @50273080, my crops)

- **END-ON 9.2** (was 7.5): at 2x the aperture is a deep uniform void
  (35.7-flat wall to wall), thick lit collar rim around it, dark rim
  band at the lip, no floating rim, no texture inside. The camo
  mottle + cap-edge polygon of the failed state are GONE. Void-
  perimeter faceting = the family 14-seg class (chieftain5 control
  shows the same at 2x; scored 9.2 when ratified) — family-conformant,
  not a defect of this fix. Reads the sibling's grammar at the
  sibling's tone.
- **QUARTER 9.3** (held from 9.3): rim + true void conforming to the
  tube face, evacuator + camo tube character untouched. The re-seat
  actually CLEANED this view — the failed state's camo annulus
  standing past the ring and the texture-tinged recess are both gone;
  mouth now reads lit collar -> dark rim -> flat void.

Changed-view containment (my crops vs builder's after/ index, t>4):
end 24.41% changed, ONE region = aperture + collar annulus (diffmap
black everywhere else — turret face/fittings untouched); quarter
4.13%, ONE region = muzzle mouth. chieftain5 end AND quarter
**byte-identical to the builder's after/ crops** (cmp) — frozen sib
pixel-proven 0-diff on my watch, and the builder's evidence set is
render-rig honest.

## FLAGS + ORDERS (non-blocking)

1. **Claims-law flag (§J changed-view list)**: commit a125d0d claims
   "one changed view (end-on)"; the official diff method finds TWO —
   the quarter moved 4.13% (t>4, muzzle mouth). Deterministic-rig
   proof (chieftain5 byte-identity) rules out noise. The change is
   grammar-improving and scored 9.3, so the flag costs nothing here —
   but changed-view lists cite the diff, not the intent.
2. **Packet round section MISSING**: docs/references/tanks/
   centurion3.md still ends at the sweep one-liner — the re-seat round
   has no packet section (landing law: orchestrator writes the landing
   note at ratification, discipline flag to the round).
3. Bookkeeping at ratification: PROGRAM-STATE row currently reads
   "50273080 CANDIDATE ... re-cert in flight" — flip to RATIFIED +
   re-freeze on landing; campaign VERDICT TABLE row above (line
   "centurion3 | RE-CERT FAIL floor 7.5") stands as the historical
   fleet-run record, this RESIT section is the governing verdict.

## EVIDENCE

- Worktree @ a125d0d: scratchpad/wt-a125d0d; logs in scratchpad root:
  hashgeo-run{1,2}.log, gate-run{1,2}.log (+ gate-row-{committed,run1,
  run2}.json three-way cmp), muzzle-render.log
- My verdict-hash crops: scratchpad/recert-crops/centurion3_{end,
  quarter}.png + chieftain5 controls (19:20 stamps, this resit)
- Zooms + diffmaps: cent3-bore-zoom-{FIX,FAILEDSTATE}.png,
  chieft5-bore-zoom-CONTROL.png, cent3-quarter-zoom-{FIX,
  FAILEDSTATE}.png, cent3-{end,quarter}-diffmap.png
- Measurement scripts (mine): critic-luma.py, critic-diff.py,
  critic-zoom.py (scratchpad)

## CURRENCY ADDENDUM (resit close)

Main HEAD advanced a125d0d -> bcf6166 during my campaign (live-tree
hazard, observed again — one commit: t90m perfection round). File-list
verified: touches russia.js + t90m docs ONLY; zero diff a125d0d ->
bcf6166 on uk.js, kit.js, tankFactory.js, both render pages, the gate
tool, and docs/geometry-gate/centurion3.json — the verdict hashes
remain current at bcf6166. Standard practice: orchestrator re-verifies
hashgeo at the landing commit.

— independent critic, centurion3 RESIT, 2026-08-06
