# chieftain5 §B6 re-cert — independent critic (graduate-change flow, 2026-08-04)

Scope: §B6 TRACK-RUN SILHOUETTE fix on the GRADUATED 18th tank (graduation
hash e8919e36, r6 critic 9.0 all-14). Change under review: uk.js
CHIEFTAIN_HULL idler y 0.42 → 0.62 (z 2.58 / r 0.30 kept) + §B6 comment,
working tree, UNCOMMITTED (re-cert precedes the landing commit per §10 /
BUILD-STANDARD H.3). This is a RE-CERT against the graduation standard
(every changed view ≥9.0), not a fresh adjudication.

Bytes and stability (my runs):
- `tmp-hashgeo`: chieftain5 **5117b9a8** (43 meshes / 101168 verts) BEFORE
  my renders and AGAIN AFTER all rig runs — stable. Sibling spot-check
  challenger1 **7ed08078** both times (builder's byte-identical-siblings
  claim spot-verified).
- Working-tree src delta relevant to chieftain5 = uk.js only. The shared
  tankFactory.js edit in the tree (hullTrackTrimL/R bucket defs, russia
  agent) has no uk.js caller — opt-in, byte-identical default (F.2).
- My fresh `tmp-tank-critic` 14 pairs are **byte-identical to the
  builder's post-fix set** (cmp on all 14) — deterministic renders, no
  cross-agent drift between builder time and re-cert time.

Machine gates re-run by me on these bytes:
- `geometry-gate --ids=chieftain5` **×2: min 91.2 PASS both, full-precision
  JSON bit-identical** (diff of run1/run2 chieftain5.json = empty).
  Components 91.2 / 91.3 / 92.8 / 92.7 / 100 / 100. Headline equals the
  graduation record 91.2. turret 94.1→92.8 / stations 92.9→92.7 are the
  disclosed registration side-effects (whole-mask centroid moved with the
  raised band; reg dAlong 0.000 / dy −0.004), stable ×2, both ≥90.
- `track-clip-audit --exact`: **front 0 / rear 0** (target 0 held).
- `tank-standard-check`: FULL — clip 0/0 ✓, contig/holes 0 ✓, mg1+0d ✓.
- `turret-parent-audit`: **stranded 0 / dangling 0** / abutting 1 (§B5
  below).
- `visual-evaluator` on final bytes: **RIG PARITY OK — worst yawProxy 2.6°
  (rear), all other views ≤0.7°; no RIG MISMATCH — scoring valid.**
- Official rig evidence: shots/critic-chieftain5/ (my 14 pairs),
  shots/visual-eval-chieftain5/ (report + overlays, my run),
  shots/critic-chieftain5/crops-b6recert/ (zoom crops OF those renders,
  tools/tmp-b6recert-crop.py). Stale crops/ and crops-r6critic/ under the
  shots dir were not used. Before-state = shots/uk-b6/before-critic/ +
  before-visual-eval/ (builder archive of the r6 graduation state).

## HEADLINE: **RE-CERT PASS** — all 14 changed views hold ≥9.0 (floor 9.0, right 9.5); the §B6 trapezoid reads at rest and yaw-90; no new artifact. Commit fix + re-freeze 5117b9a8 in one commit.

## 1. The §B6 read (the point of the change)

Measured on the official side pairs with a bottom-line column trace
(tools/tmp-b6recert-trace.py; §D mask method, bg 0x151b20 maxch≤13):

- BEFORE (archived r6 pairs): view-right proc band GROUNDED at x≈897 with
  only a ~45 px terminal curl above it (x853 y356 → x898 y396) — the band
  ran at ground level past the front road wheel to the low idler: the
  owner-flagged parallelogram /_____/. view-left mirrored (grounds x≈1022).
- AFTER (my fresh pairs): front ground contact RETREATS ~13 px ≈ 0.25 m
  (right: x897→x910; left: x1022→x1007) — the flat run now ends at the
  road-wheel contact patch (z 2.465, default contact, byte-identical) —
  and the same columns sit 8–13 px HIGHER, a steady straight climb into
  the raised idler wrap (wrap bottom 0.275; authored ramp (2.465,0.055)→
  (2.81,0.36) ≈ 42°, partially occluded by the corner flap in true side
  view). REAR departure unchanged: rise 58 px, image slope 38.2°→38.0°
  (AA only). Ground run is now the SHORT trapezoid base: **\________/ at
  both ends — the parallelogram is GONE.**
- YAW-90: builder turntable sets traced (proc-yaw0/ + proc-yaw90/):
  identical track bottom lines at yaw 0 and 90 (ground run x326..633,
  front climb 50 px, rear 44 px) — the ramp is hull geometry, unaffected
  by casting yaw; my own fresh close-roof/close-front perspectives show
  the same raised-wrap read.
- Zoom crops (crops-b6recert/): right-bow / left-bow show the raised
  toothed idler behind the corner flap with the band descending to the
  patch; the top run flows level into the wrap (the authored 0.965 wrap
  top meeting the 0.955 roller line) — the real Chieftain proportion.

## 2. Oracle residual (owner law outranks oracle matching — verified)

The ref print itself carries the low-idler defect (its bow bottoms ground
at z 2.51). In MY gate JSON the raised-ramp residual lands exactly where
the packet certifies it — four side columns, BOTTOM-only, tops untouched:
side_hull at −1.03/−1.15/−1.28/−1.40 (workorder z 2.65/2.77/2.90/3.02)
errM 0.029/0.034/0.063/0.059 (side_whole 0.023/0.034/0.063/0.051), proc
bottoms HIGHER than ref. Evaluator profile confirms the same signature:
side Δtop p95 EXACTLY r6 (left 0.114 m / right 0.151 m) while Δbot p95
carries the certified delta (left 0.053→0.095 / right 0.046→0.083).
side_hull 91.75→91.17 (mean 0.57→0.63, p95 2.33→2.14) — packet-exact.
This is the certified §B6 owner-law class: **do not fix back.**

## 3. Per-changed-view scores (bar ≥9.0; all 14 changed at pixel level)

Method: every above-noise evaluator finding in MY run was matched against
the archived r6 report (before-visual-eval/report.json) by midWorld+len;
classes cited below. "±4" = the §D sub-0.25 m corner-bias floor.

| view | /10 | §B6 read + what changed vs the r6 pass |
|------|-----|----------------------------------------|
| front | 9.0 | Masks unchanged (all 16 r6 angle flags reprint within tenths; 2 new sub-noise ±4 no-findings). Raised wrap arcs read above the corner flaps; pad footprint identical. |
| frontleft | 9.0 | Ramp reads behind the flap. W1 wing-shelf PROTECTED prints EXACT (+12.6 len 0.47 = r6). Bow-wrap/glacis-blend IMPROVED −8.5→−3.2. New +1.6°/1.24 m wing-shelf print is sub-visible (reads straight at 1x). |
| left | 9.0 | Trapezoid reads. Sag coin binds unchanged (−9.3 ±0.8 len 1.05 = r6 −8.7 family, certified). Lower-front 0.78 m line −3.9→+5.6 ±0.5 = the certified §B6 bow-bottom class printing in the angle channel. All other flags r6-identical. |
| rearleft | 9.0 | Far raised wrap now visible through the channel (real-vehicle read). Worst +10.6 ±4 len 0.30 = the r6 rear-corner short family (+5.2 in r6) wobbling with the disclosed registration shift; crown ±4-class wobbles; nothing new above noise outside those families. |
| rear | 9.0 | ALL 18 flags r6-identical within tenths (bin-run +8.8 = r6's +8.5 named polish). Channel slits under the far raised band read as ground clearance (32/29/24 px slivers), not floaters. |
| rearright | 9.0 | 12 flags vs r6's 15 (3 dropped). Certified tier-end/shoulder family holds; new +4.3 ±0.5 crown centerline is the r6 facet-crease family. |
| right | 9.5 | Cleanest view holds its 9.5: every r6 flag reprints within tenths (bow-wing +4.9→+5.0), Δtop p95 0.151 EXACT. Trapezoid reads; sleeve→tube step still matches both ref broken lines. |
| frontright | 9.0 | 14 flags, ALL r6-identical (3 r6 flags dropped — improvement). Far-side wing-shelf cluster unchanged; ramp reads behind the flap. |
| top | 9.0 | Plan footprint INVARIANT: all 7 flags identical (rack corner −9.9 priced item exact); 28 px AA total change. |
| hero-frontleft | 9.0 | Raised idler mass fills the under-wing pocket exactly as the real vehicle (bg −1932 px there). The r6 DECLARED WATCH ITEM (upper-rear −12) is GONE from flags; ground-front line improved −5.0→−1.9. Bow-zone −2.9→−6.7 ±4 = certified-zone projection wobble, len 0.55, shadow region at 1x. |
| hero-rearright | 9.0 | Departure ramp unchanged; stern-low priced family (+12.1 ±0.8 len 0.37 = r6's +12.9 item; new −10.1 ±4 = its far-side pair, same zone). §B5 bin cluster seated (below). Track-region voids 0.007/0.003 m² = r6's exact classes. |
| hero-toptilt | 9.0 | Decks filled at 55°; stern-low +12.8 = r6's +13.0. The r6 NAMED RESIDUAL flank lip Δ+8.5 len 1.17 is RESOLVED (−2.1, below flag). |
| close-front | 9.0 | Raised wrap + flap containment verified at zoom (flap at 3.08 clear of wrap face ~3.02; air gap reads). Prow-underside −8.9 ±0.7 len 0.61 = r6's exact named polish item. The +1.6→+8.7 ±0.5 len 0.71 sleeve/hood print was adjudicated on pixels: the sleeve/hood crop is PIXEL-IDENTICAL before/after — fitter re-segmentation caused by the changed bow edge chain below (close-crop back-projection class, r6-documented; Δtop p95 0.396 unchanged). REF-RENDER OUTRANKS ROW ANALYSIS: no visual defect. |
| close-roof | 9.0 | W3 nose-roll zone print IMPROVED −21.1→−12.2 (same 0.61 m segment; the protected mask-priced column binds in the gate, tops identical). New −13.4 ±0.6 len 0.65 @ y0.10 z2.79 and +11.0 shift @ z2.23 = THE CERTIFIED §B6 RAMP printing in this view's low frame corner. Facet creases (−8.6 len 0.49) and all other flags r6-exact. MG/ring/tray content unchanged. Band top rides 10 mm under the belt loft — no clipping at zoom (audit 0/0 is the mm-scale verifier). |

**Floor 9.0 (thirteen views), 9.5 (right). The graduation profile holds.**

## 4. Standing checks

- **§B2 flood/holes: PASS.** standard-check contig/holes 0; evaluator
  enclosed-void set = r6 classes exactly (close-roof 1.614 m² tube-air vs
  r6 1.609; 0.006 m² under-sleeve; hero-rr 0.007/0.003 m² track shadows).
  Pixel-level bg growth vs before (my flood diff, tmp-b6recert-flood.py)
  is UNDER-RAMP OPEN CLEARANCE + rear channel slits — largest connected
  component 176 px (view-left, x1007..1032 y373..397, under the ramp),
  open to outside bg, not enclosed pockets. No new sky through hull or
  turret in any view.
- **§B4 containment: PASS.** Audit 0/0 --exact (my run). Authored numbers
  re-derived from uk.js: band top face 1.01 = 10 mm under beltTop 1.02
  (the probed 0.635 clipped 24 vox; 0.62 audits clean); wrap face ~3.02
  clear of corner flaps 3.08..3.16 — zoom crops show the air gap; no
  wrap-air (band hugs the idler in all crops).
- **§B5 parenting: PASS (by-design 1 abutting).** stranded 0 / dangling 0.
  The 1 abutting = the right engine-bay bin outer chamfer + width-nub
  cluster (x≈1.66 y 1.84..2.18 z −0.79..−0.45) — the packet-adjudicated
  HULL fender furniture (the print fuses it into its hull mask, r2 cert).
  Yaw-90 render: casting swings away, bin run stays seated on the fender —
  deck gear, correctly in rig_hull. The audit will keep counting 1.
- **§D discipline:** both official rigs fresh on final bytes, my runs;
  parity clean; every angle claim above cites evaluator numbers with
  noise bands; sub-0.25 m prints treated as ±4-floor no-findings per
  calibration; per-view finding sets archive-diffed against the r6 report
  (not eyeball recall); zoom verifications are crops OF official renders.
  No new tone claims (change is geometry-only; camo/materials untouched —
  14/14 pairs byte-match the builder's set).
- **§H.4:** unaffected — the idler height changes no distinguishing tell;
  the r6 tells (collar, L11 sleeve step, NBC pack + basket, skirted
  terraced-bin flank, cupola cluster) all reprint in my pairs.

## 5. Re-freeze instruction for the orchestrator

RE-CERT PASS: land the uk.js §B6 fix and **re-freeze 5117b9a8 (43 meshes /
101168 verts)** in the same commit (e8919e36 → 5117b9a8), graduation-
critic verdict superseded by this re-cert for the changed views. The §B6
side-column residual (z 2.65..3.02, errM 0.023..0.063, bottoms-only) is
CERTIFIED owner-law class — carried in the packet §B6 section,
do-not-fix-back. All eight uk siblings byte-identical per builder claim;
challenger1 spot-verified 7ed08078 twice by me.

Evidence: shots/critic-chieftain5/ (14 pairs, byte-stable across builder
and critic runs), shots/critic-chieftain5/crops-b6recert/,
shots/visual-eval-chieftain5/, shots/uk-b6/ (before archives + yaw sets),
docs/geometry-gate/chieftain5.json (×2 bit-identical), tools/tmp-b6recert-
trace.py / -crop.py / -flood.py (this round's tmp evidence tools).
