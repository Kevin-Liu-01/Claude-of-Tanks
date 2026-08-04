# merkava3b + merkava3c §B5 coupled flip — INDEPENDENT RE-CERT verdict (2026-08-04)

Graduate-change re-cert (BUILD-STANDARD §B5 + §D + GEOMETRY-GATE §10) for the
coupled bustle-pack re-parent + §B5-r2 re-anchor on BOTH marks. The
owner-reported chimney (tail-top duffel pile + tarp wings static under yaw)
was ORACLE-REGISTRATION-PINNED; the fix moves both sides of the instrument:
the three override maps' merkava turretFollowers extensions + merkava.js
`bustlePackTurret: true` + the full §B5-r2 re-anchor (tailNotch, tr.fall,
plan-taper corners, liftBot re-band, cornerCurtain v3, sleeveR 0.112,
podDeep, nub re-span). Camo buckets rebake bakeDirt in the merged bucket's
LOCAL frame on a pivotZ≠0 rig, so per the §B5 RE-CERT BAR this is a FULL
critic re-cert on both tanks, not a pixel-diff cert.

## HEADLINE: **RE-CERT PASS BOTH** — 3B floor 9.0 / mean 9.06, 3C floor 9.0
## / mean 9.05, all fourteen views per tank at or above the graduation bar
## as the same Merkava 3B / 3C. The §B5 point is delivered: at yaw 90 the
## ENTIRE pile + tarp-wing assembly rotates with the bustle and the tail
## reads low and clean (the chimney is gone); at rest the tail still reads
## the merkava soft-stowage stern. Gate ×2 bit-identical (3b 90.1 / 3c 90.5
## PASS, matching the builder's runs byte-for-byte); §B5 audit 0/0/0 both;
## clip 0/0 --exact both; floaters 100 (floaterFails 0). Orchestrator may
## land merkava.js + the three maps' merkava hunks and RE-FREEZE
## **3b a9d987f0** (41/148218) + **3c d3358744** (41/148584) in ONE commit.

## Provenance (§D discipline)

- Pairs re-rendered FRESH by me: `node tools/tmp-tank-critic.mjs
  --id=merkava3b` then `--id=merkava3c` (own vite 74xx, cot-shots FIFO
  honored), 14/14 saved each, zero console errors both. Scored ONLY
  `shots/critic-merkava3b/*.png` + `shots/critic-merkava3c/*.png`.
- Independent yaw re-shoots: `tools/tmp-merkava-b5-yawpair.mjs
  --tag=b5recert` → shots/merkava-b5/yawpair-b5recert-*.png — both
  BYTE-IDENTICAL to the builder's yawpair-b5r2-*.png evidence
  (deterministic pipeline; the builder's boards are exactly reproducible).
  Plus my own full 14-view yaw-90 sets:
  shots/merkava-b5/yaw90-recert-merkava3{b,c}/.
- Change record verified in source: the three maps carry the documented
  extensions (procedural-fidelity.html LOCAL_REFERENCE_OVERRIDES;
  tmp-tank-critic.html + visual-evaluator-page.html
  CRITIC_REFERENCE_OVERRIDES). Regex delta machine-checked against the GLB
  node census (tools/tmp-b5recert-merkava-nodecheck.mjs): 3b gains EXACTLY
  ex_decor_10/11/12/17/18 (deck boards 14/15/16 stay hull), 3c gains
  EXACTLY ex_decor_10/11/15/16/17 (boards 12/14 stay hull), nothing lost —
  the packet plan, precisely.
- merkava.js re-parent + re-anchor verified against the §B5/§B5-r2 packet
  sections (bpOn offsets = world − [0, deckY+0.02, pivotZ]; bpB bucket map
  hull→turret; identity when the flag is unset — all six siblings
  byte-frozen, hashgeo ×2 this session: 1b 106b0074, 2b 9bfe0895,
  2d 62456460, 3d 954a9650, 4 e1d164dc, 4b d44a3624).
- Hashes **a9d987f0** / **d3358744** stable ×2 (before and after the full
  render campaign — 41 meshes / 148218 & 148584 verts, matching the
  packet's re-freeze line).
- `node tools/visual-evaluator.mjs` both ids: **RIG PARITY OK** on all 14
  views — max yawProxy 1.07° (3b front) / 1.22° (3c rear), no flips, no
  RIG MISMATCH. Scoring valid. Evidence shots/visual-eval-merkava3{b,c}/.
- GATE ×2 mine (runs 3+4 counting the builder's ×2): 3b min **90.1** —
  91.1/90.1/90.4/93.6/100/100; 3c min **90.5** — 91.9/90.5/90.8/92.3/100/
  100; my two runs' JSONs bit-identical to each other AND to the builder's
  in-tree docs/geometry-gate/*.json. dims: hullLengthM 7.59 (0.12%) — the
  podDeep BODY-COLUMN tripwire is held off; overallLengthM 9.11 (0.72%,
  certified gun-tip class).

## The §B5 read (the point of the round)

Yaw-90 before (r1 archives) vs after (builder's b5r2 pair + my re-shoot):

- BEFORE (the owner's chimney): yaw90-before top views show the rotated
  turret with a BARE rear while the full pile/wings stack stands
  world-aligned at the hull tail; the artic strips show the stack standing
  like a chimney through -90/+90/180.
- AFTER (both my re-shoot sets): the ENTIRE assembly — 8-strip pile with
  taper slabs, parting rail, crown tarp rolls, straps/wrinkles, billow
  set, side straps + end discs, tarp-wing plates/lobes/fold curtains/hem
  tabs and their posts — rotates WITH the bustle on every view. The tail
  at yaw 90 reads LOW AND CLEAN: the falling rack band, corner frames,
  recessed clamshell door — and the new tailNotch prongs read print-true
  from top-down (center rear at the -3.63/-3.64 door plane between
  full-depth outboard corners).
- SEATED, NOTHING MID-AIR: the swung assembly reads as one attached mass
  on the bustle — crown rolls tuck under the vane band (the -14 mm duck),
  billows hang from the lifted pile band (1.95..2.27), curtain hems reach
  the basket-underside line (liftBot 1.90/1.93 = the print pile's own
  1.86..1.97 band), every plate/lobe overlaps its neighbors — no daylight
  slits inside the assembly at 3x zoom. Machine proof: floaters 100 with
  floaterFails 0 at all 5 poses, ×2 runs, both tanks.
- REST READS HOLD: at yaw 0 the world pose is preserved — the tail still
  reads the merkava soft-stowage stern (pile over falling rack with
  contact shadow, not floating, not clipped; 4x stern crops both marks).
  The pack now sits 0.55 m up in the side masks' TURRET rows where the
  print keeps its own pile (turret_side healed 73.9→90.4 / 75.7→90.8).

## Changed-band localization (mottle class, measured)

Per-view pixel-diff of my fresh sets vs the graduation-era critic archives
(Aug 3 renders, archived before overwrite; tools/tmp-merkava-b5-pairdiff.py):

- All changed pixels sit in the documented bands: tail pack/wings region
  (re-band + mottle reseed), falling rack line, tailNotch center + door,
  cornerCurtain tiers, gun-tube edge (sleeveR 0.118→0.112), pod-tip
  specks (podDeep), left wing-nub tick (0.31..0.08 re-span). Totals 155k
  px (3b) / 149k px (3c) across 14 views; heatmaps confirm nothing
  outside the bands — glacis, skyline, wheel rows, tracks, skirts, roof
  plateau all black.
- REF panes: 1-3 px per view at maxD ≤7 = FP re-attach jitter on AA edge
  pixels from the followers re-parent (pose preserved sub-pixel). Not a
  registration break.
- Camo re-phase legality: same scheme, same palette, same patch scale on
  every moved face (pack-band luma σ 11.2→12.5, p5/p95 span 77-110 →
  76-112 — amplitude preserved); no seam-torn blobs, no wrong-scale
  patches at 3-4x zoom (rear/left/top/hero crops both marks).

## §B2 flood (§D law: maxch ≤13 AND blue-signature B−R ≥ +8)

Fresh census (tools/tmp-b5recert-flood-merkava.py) vs the same tool on the
graduation archives:

- 3b proc TRUE enclosed: front 2 (=grad), rear 18 (=), top 16 (=),
  toptilt 2 (grad 0), heroes 83/20 (both =grad byte-flat), close-front
  183 (grad 184 — the certified sagging-cable pocket at the SAME station
  px 796-826), close-roof 10 (11). Sides IMPROVE: left 65 (was 186),
  right 89 (was 222) — the old pack/rack side pockets are gone. Rear
  quarters +11/+18 px of 7-23 px under-rail slits over the soft pile
  (ref's own panes carry 218-408 px of the same class).
- 3c: same shape — left 35 (was 176), right 173 (was 320), heroes 91/70
  byte-flat, close-roof 99 byte-flat (its rail-slit class unchanged),
  rear quarters +17/+23 px small clusters, all adjudicated under-rail /
  under-crown air with the ref carrying 4-10x more of it.
- NO new enclosed-air class on either tank; no see-through voids; §B2
  machine scan (standard-check) 0 holes both.

## Machine checks (all official rigs, this session, my own runs)

- GATE ×2: above — bit-identical, PASS both, at/above the pre-flip record
  (3b side_hull 91.1 vs 90.7 record; 3c side_hull 91.9 vs 91.5).
- TURRET-PARENT AUDIT: **stranded 0 / abutting 0 / dangling 0 BOTH** —
  cleaner than the pre-flip baseline (which carried 2 adjudicated
  envelope-smear rows each); the genuine 4-strand class is healed.
- track-clip-audit --exact: **front 0 / rear 0 both** (the cornerCurtain
  tier-1 top 0.290 keeps the r12 0/0 record).
- tank-standard-check: gate held, contiguity 0 ✓, clip ✓; decor `mg0+0d ✗`
  is the CARRIED §I packet justification (3B/3C roof guns are
  hand-authored ref-parity graduation anatomy, same owner call as 3D and
  the r12 recerts) — not a new failure.
- npm test: green (full suite, this tree).

## Per-view scores — merkava3b (graduation standard, ≥9.0 bar)

| view | score | read |
|---|---|---|
| view-front | **9.1** | Glacis/turret-face/skirt parity held; pack shoulders now duck under the crest band (wrinkle crowns −14 mm); sleeve tube edge out of the ±0.167 plan bins the ref keeps empty; 2 px enc. front_whole 90.1 = the certified ±1.07 skirt-hem class (0.096/0.095), unchanged. |
| view-frontleft | **9.1** | Wheel/skirt/bow language certified-state; pack band at bustle height; 19 px enc (certified classes). |
| view-left | **9.1** | The falling rack-band line reads print-true (1.615@−3.74 → 1.46 at the face; side_hull 91.1 ABOVE the 90.7 graduation row); §B6 trapezoid run byte-held both raised ends; enc 65 vs 186 — improved. |
| view-rearleft | **9.1** | Corner stack + fold curtains attached; tiers in-bin on the falling bottom line; 48 px enc = under-rail slits (ref's own 408). |
| view-rear | **9.1** | Re-banded pile + billows compressed into the print band; tailNotch door plate reads print-true; curtains on the ref's falling bottom line; mottle same-scheme/same-scale; 18 px enc byte-flat with graduation. |
| view-rearright | **9.0** | Mirror clean; 30 px enc (certified + under-rail classes); wing[1]/[2] tops on the ref rows (1.47/1.445). |
| view-right | **9.1** | Falling line + both wrap arcs clean at 4x; enc 89 vs 222 — improved; roof-rail slit clusters are the certified rod-float class. |
| view-frontright | **9.0** | Sun-quarter carry (certified polish class); 5 px enc. |
| view-top | **9.1** | Plan-taper pile corners match the print's rounds; notch prongs print-true; plan dy healed −0.073→−0.025; nub on the ref's own 0.30..0.07 span; 16 px enc byte-flat. |
| hero-frontleft | **9.1** | enc byte-flat 83; pack crown under the vane band; bow/wheel rows certified-state. |
| hero-rearright | **9.0** | Corner grammar + posts attached at perspective; 20 px enc byte-flat; pulled outer plate reads as the print's stepped corner round. |
| hero-toptilt | **9.0** | Deck FILLED (§B2); notch prongs + taper read; gun-tube edge the only other band; 2 px enc. |
| close-front | **9.1** | Pods/sprocket-wrap/glacis certified-state; podDeep tips sub-visible (dims 100 held); the 183 px pocket is the SAME certified cable-run air at the same station. |
| close-roof | **9.0** | Sleeve root thinner, ref-ward; roof grammar certified; 10 px enc. |

Floor 9.0, mean 9.06.

## Per-view scores — merkava3c (graduation standard, ≥9.0 bar)

| view | score | read |
|---|---|---|
| view-front | **9.0** | Parity held; front_whole 90.5 floor = carried skirt-hem class; 2 px enc. |
| view-frontleft | **9.1** | Certified-state quarter; 15 px enc. |
| view-left | **9.1** | Falling line breaks one bin earlier per the 3C ref (fall [−3.88/−3.99/−4.31]); side_hull 91.9 ABOVE the 91.5 record; the −3.74 one-bin 0.026 residual is sub-visible at 1x (documented, priced). |
| view-rearleft | **9.1** | Stack + curtains attached; no-lobeL per-mark delta correct; 25 px enc. |
| view-rear | **9.1** | Re-band + notch + curtains print-true; mottle same-scheme; 18 px enc byte-flat. |
| view-rearright | **9.0** | Mirror clean; 63 px enc small under-rail clusters (ref's own 234). |
| view-right | **9.1** | enc 173 vs 320 — improved; roofline rail-slit clusters certified class. |
| view-frontright | **9.0** | Certified carry; 63 px enc (ref 85). |
| view-top | **9.1** | Taper + notch + Kasag hump parity; plan dy −0.027; 13 px enc byte-flat. |
| hero-frontleft | **9.1** | enc byte-flat 91; certified-state. |
| hero-rearright | **9.0** | Corner grammar attached; enc byte-flat 70. |
| hero-toptilt | **9.0** | Deck filled; notch + pack band read; 1 px enc. |
| close-front | **9.0** | Bow certified-state; same cable-pocket class (174 vs 175). |
| close-roof | **9.0** | Kasag/pano/sleeve grammar; enc byte-flat 99. |

Floor 9.0, mean 9.05.

## Standing checks

- §B1 FRONT-SLOPE: PASS both (glacis + turret cheek rakes byte-held).
- §B2 CONTIGUITY: PASS both (census above; blue-signature law applied;
  machine scan 0 holes).
- §B3 DECOR: carried §I packet justification (hand-authored ref-parity
  roof guns, mg0+0d census) — unchanged from the r12 recerts.
- §B4 CONTAINMENT: PASS both (0/0 --exact ×my run; curtain tiers verified
  outside the wrap shell).
- §B5 PARENTING: **PASS both — the round's point.** Audit 0/0/0 outright;
  yaw-90 pair + floaters 100 ×2 delivered; my re-shoots byte-match the
  builder's evidence.
- §B6 TRACK RUN: PASS both (byte-held trapezoid, raised idler AND
  sprocket, ramps from contact tangents; no red in the wheel/track rows
  of any diff heatmap).
- §H.4 VARIETY: PASS — fresh four-up (1b/3b/3c/3d rear-left quarter):
  1b exposed six-wheel run + old-mark turret; 3b pack+posts stern, short
  whips, lobeL corner; 3c tall 3.90/3.93 whips, Kasag hump, warmer flap
  tone, no lobeL; 3d X-braced open rack + pintle MG posture. No re-badge
  read anywhere.

## Honest residuals (all declared, priced, none §B5-round regressions)

3b: front_whole 90.1 skirt-hem bottoms (±1.07, ±1.78 — certified
pre-flip class); turret_side 90.4 sleeve/mantlet-band columns (≤0.096);
turret_plan −0.87-bin vane crown-fold strips at −4.44 (0.144) + ±0.15
sleeve bins (0.13) + the +0.87 sleeve-to-4.30 front reach (0.236,
graduation-certified gun trade); side_hull cover 0.66 = the ref's z 3.13
pod sliver (dims-tripwire adjudicated ONLY-REF residual). 3c: same
classes plus the 3.34-row 0.159 and the −3.74 one-bin 0.026 fall
residual. Rear-quarter under-rail slit pixels (+11..+23 px/view) are
print-class air the ref carries 4-10x over. All stand under the
graduation cert + this re-cert.

## Verdict

**RE-CERT PASS BOTH.** Land in ONE commit: src/vehicles/profiles/
merkava.js + tools/procedural-fidelity.html + tools/
visual-evaluator-page.html merkava hunks (tmp-tank-critic.html is local
tmp; docs/geometry-gate/merkava3{b,c}.json + ledger rows are tool-written
this-tree state) + the packet §B5/§B5-r2 sections, and RE-FREEZE
**merkava3b a9d987f0** (41/148218, supersedes a4ed2c82) + **merkava3c
d3358744** (41/148584, supersedes 1d9b026c). Siblings stay frozen at
their verified hashes. The owner's chimney report is closed on both
marks.
