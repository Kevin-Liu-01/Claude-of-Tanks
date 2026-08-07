# SHADED-PARITY RE-CERT — ABRAMS VISIBILITY ROUND (rear + bore + CROWS escalation)

Independent critic, 2026-08-06. Scope: the seven-abrams visibility round landed at
79775df (owner orders: "fix m1 butts" + §B3.1 MUZZLE BORE + the visibility
escalation "i still dont see the extra decorations or CROWS or machines").
Five graduate candidates + two gate-in-loop non-graduates, ALL 14 views scored
per tank (the round moved every proc bbox y-max — the §J changed-view list
degenerated to all 14, per the packet's diff-derived contract).

MEASUREMENT FRAME (§F LIVE-TREE FROZEN-SIB defense): the live tree carried
foreign mid-flight WIP in shared modules during this session (kit.js observed
modified and then externally reverted between two consecutive reads; modern2.js
t14 ladder WIP live) — all official runs therefore executed in a CLEAN-ROOM
WORKTREE at HEAD e502222 (vehicle path byte-identical to the landing 79775df:
the two later commits touch src/ui/garage.js + docs only). The cot-shots FIFO
lock lives in /tmp and serializes machine-wide across worktrees — official
tools self-ticketed honestly against live lanes. One-ticket batch driver
(tools/tmp-abrams-rear-r1-batch.mjs) used for the render campaign per §F.1.

## VERDICT TABLE

| tank        | candidate hash (meshes/verts) | gate x2 (min \| h/w/t/st/d/f)          | view floor | VERDICT |
|-------------|-------------------------------|----------------------------------------|-----------|---------|
| m1a1        | ba45613c (43/158060)          | 79.0 \| 91.7/79/85.7/92.5/100/100 EXACT | 9.1       | RE-CERT PASS (re-freeze ba45613c) |
| m1a1ha      | ff97bc44 (44/158264)          | 79.0 \| identical row, EXACT x2         | 9.1       | RE-CERT PASS (re-freeze ff97bc44) |
| m1a2        | 4778c7a8 (42/115404)          | 64.9 \| 93.3/64.9/84.1/83.6/100/100     | 9.1       | RE-CERT PASS (re-freeze 4778c7a8) |
| m1a2_tejas  | 4891abb6 (45/158720)          | 61.5 \| 92/61.5/83.4/92.3/100/100       | 9.2       | RE-CERT PASS (re-freeze 4891abb6) |
| m1a2_sepv2  | 83277374 (42/116220)          | 60.3 \| 93.2/60.3/80.6/83.6/100/100     | 9.1       | RE-CERT PASS (re-freeze 83277374) |
| m1a2_tusk   | fc4018b8 (55/199736)          | 0 \| 14.9/0/42.3/39.2/100/100 (chimera cap held) | 9.0 | SCORED — non-graduate, no freeze (gate-in-loop) |
| abramsx     | 92aed610 (45/73728)           | 6.2 \| 6.2/10.3/75.3/69.6/100/100 (oracle cap held) | 8.9 | SCORED — non-graduate, no freeze; 2 orders below |

The capped gate rows are ADJUDICATED (owner-authorized §B7-class caps, quotes +
per-column decodes in the packets); this verdict is the visual bar. Cap decode
SPOT-VERIFIED on my own gate run: m1a1 front_whole worst = exactly the mast
columns (at −0.10/−0.14/−0.68/−0.72/−0.60, procTop 1.32–1.35 vs refTop
1.09–1.14, err 0.114–0.122 — the CWS M2 over the W1b-flattened band) and the
side +4.12 err 0.261 = the PRE-EXISTING only-ref muzzle-zone class, untouched.

## STANDING CHECKS (all run by this critic, clean-room worktree)

1. GATE x2 — both runs byte-identical and EXACTLY the landed capped lines on
   all seven (table above). dims 100 / floaters 100 everywhere; hull rows at
   their held values (91.7 / 91.7 / 93.3 / 92.0 / 93.2 / 14.9 / 6.2).
2. HASH BRACKETING — tmp-hashgeo at campaign OPEN and CLOSE x2 back-to-back:
   all seven hashes stable and equal to the packet candidates (table). Every
   render/audit in this report sits inside the bracket.
3. TRACK-CLIP --exact — band 0/0 + shoe 0/0 on six; abramsx band rear 8
   (the packet's documented pre-existing ≤60-bar class), shoe 0/0; blind
   spots (shoe>0, band=0) = 0 fleet-wide in this set.
4. §J YAW PAIRS — re-rendered at the verdict hashes (critic's own pairs;
   builder's yaw sets verified BYTE-IDENTICAL to mine, diffpx(t>4)=0 on
   spot views). Turret + mast + bustle rotate as one at yaw90; stern
   plate/grille/guards/shackles static. Winding mode-2 machine check
   agrees: yaw-candidates 0 on m1a1/ha/m1a2/tejas.
5. WINDING-AUDIT — mode-1 rev 0 / deficit 0 on all five graduates; sepv2
   mode-2 candidatePx 5519 = EXACTLY the certified oracle-registration-pinned
   works field (top mesh 2666px, rig_hull, the bc225318-class split) — no
   move. Non-graduates: tusk 425px candidates (deck-gear/works classes,
   below HARD); abramsx rev 1 + 12px top deficit + mode-2 HARD 1368px —
   ORDERS below (abramsx absent from the 2026-08-06 fleet baseline; these
   are new findings, not regressions of a banked clean).
6. §B2 STERN-BAND FLOOD (mask-method maxch≤13 + blue-signature B−R≥+8,
   label band excluded, component attribution) — VOID-POCKET CLASS 0 on
   every stern band, all seven view-rear: m1a2/sepv2/abramsx flood 0px
   whole-frame; m1a1/ha 299/295px and tejas/tusk 138/126px are ALL
   roof-zone mast-mount + rack-to-deck air (bboxes y≤260 in the 640-frame,
   above the stern band) — REF-ENDORSED: the reference half itself floods
   107px of the same classes (m1a1 view-rear ref control). Quarters carry
   only the documented pre-existing wheel-bay/slat-window classes; my counts
   reproduce the packet's banked afters to the pixel where zones match
   (tusk rearleft 63 / rearright 141; abramsx rearleft 132 / rearright 305
   = the decoded under-barrel bow air, not a stern void).

Also run: tank-standard-check (clip ✓ contig 0 ✓ censuses mg1+1d/2d/1d/2d/1d/7d/3d ✓
on the seven) and visual-evaluator on all seven (§D standing order): no RIG
MISMATCH, no flip, yawProxy ≤1.7°, principal-axis deltas ≤2.5°; the CROWS marks
read dHPct +6.6..+9.4 vs their warp-flattened prints = the adjudicated §B7 mast
class surfacing in the area terms, nothing else moved. Builder final evidence
VERIFIED AT THE VERDICT HASHES: my independent re-renders are pixel-identical
(diffpx(t>4)=0) to shots/abrams-rear-r1/final-<id>/ on all spot views — the
live-repo evidence set is canonical.

## SUBJECT FINDINGS (the owner's escalation)

(a) CROWS/CWS UNMISSABLE + FIVE DISTINCT MASSES (§H.4) — CONFIRMED.
   Before/after is night-and-day: the r3/r4 flat skeletal M2 (a tone sliver
   fused into the roof plateau) and the m1a2's bin-capped flat CROWS are
   RETIRED; every mark now carries a standing mast proud of the roofline in
   front/quarter/rear views at 1x. The five masses read distinctly:
   - m1a1: BARE M2HB on the powered ring — pintle post, receiver + top-cover
     lick, spade grips, jacketed barrel, hung can + chute; open air under
     the receiver (skeletal-correct).
   - m1a1ha: the SAME station SHIELDED — camo-painted plate at the
     receiver's own line, barrel through the notch; reads as a solid
     shielded box vs m1a1's open gun from every front quarter.
   - m1a2_tejas: CROWS II — riser post, slew plate + drum, sensor cluster
     (day/thermal windows + LRF), elevated M2 + ammo box + cable drop.
   - m1a2: CROWS-LP WIDE-FLAT head (the SEPv3 tell) — lower, wider, flat
     sensor head + elevated M2 + loader gun shield with barrel notch.
   - m1a2_sepv2: CROWS II TALL + gun raised +0.075 (top 2.95) — the
     family's tallest mast — plus the loader shield on the twin-fifty.
   No floating reads: every riser plants on its cupola/roof plate (gussets
   on the m1a2/sepv2 risers); no mast mass detaches at yaw (mode-2 clean).

(b) M1 REARS (m1a1/m1a1ha/m1a2_tejas/m1a2_tusk, shared TEJAS_HULL lines) —
   the owner's screenshot defects are DEAD:
   - BLACK VOID POCKET beside the exhaust bay: GONE (full-height mid-step
     welds to the corridor; flood void-pocket class 0; the before set still
     shows the black rectangle for contrast).
   - STUCK-ON GRILLE BOX: gone — the lattice is retoned darker than plate
     (0x757d5f) and recessed INTO a full-width plate read; one plate, camo
     continuous, remaining tone splits are the bay's own recess shadows.
   - RAILS ENDING IN AIR: terminated — fender wall band extended and
     end-capped into the corner tongue plates.
   - CORNER GRAMMAR: taillight clusters IN guards (lamp box + split lenses
     + guard ribs) both corners; TOW SHACKLE stations (clevis pair + bow +
     pin) flanking the pintle; framed louver panels on the visible step
     face; TIP bin at its real right-rear station with lid/latch tells.
   - TUSK: guard plates seat between hull and the −4.0 slat cage; the cage
     reads as REAL standoff bars with honest air windows (12px-class flood
     components), not a solid box.
   m1a2/m1a2_sepv2 (already full-width-plate class) gained the same corner
   grammar (guards + shackles ±0.52, faces ≥ −3.958 inside the bbox tab).

(c) BORES AS TRUE DARK HOLES AT 2x — CONFIRMED, MEASURED (§D): at 3x crops
   every muzzle face reads counterbore rim + recessed near-black disc;
   darkest disc pixel rgb=(11,11,12) luma 11.1 on ALL SEVEN (m1a1 @
   (1088,318), ha (1088,318), tejas (1088,331), m1a2 (1091,349), sepv2
   (1091,353), tusk (1089,331), abramsx XM360 (1091,389) in the close-front
   proc frames) — the ref-hole class exactly; the boreDark light-immune
   device (parented to recoilG) killed the L~22 olive lit-face read the
   builder documented on the first cut. Rim tori are radially interior to
   the tube silhouette (m1a1 outer r 0.076 < tube r 0.095): mask-neutral
   by construction, no gun-AABB growth (dims 100 held; hashes bracket) —
   the leclerc MUZZLE-BORE MECHANISM's failure mode (bucket rims re-framing
   turret cameras) is structurally avoided here; mechanism variance
   (interior-disc vs shadow-named furniture) documented, outcome-equivalent
   and gate-proven, no order.

(d) AMERICAN GRAMMAR (§H.4) — STANDS. M2HB class on every US station:
   receiver mass + top-cover lick + spade grips + jacketed barrel + hung
   can/chute at 4.5x; no NSVT/Kord silhouette anywhere in the family; the
   ha shield is camo-painted plate (correct), the m1a2 loader shield
   carries the TUSK LAGS grammar (notch + strut); CROWS heads carry the
   sensor-cluster tells (day + thermal windows + LRF). MG tips are
   pinhole-class dark (no drilled geometry at MG scale).

(e) ABRAMSX FIRST-EVER REAR PLATE — CONFIRMED. The old buried kit (one
   blank camo wall) is replaced ON the visible plate: full-width
   hybrid-drive VENT FIELD (9 louver rows + frames + sills over a dark
   bay — the mark's dominant rear feature), taillight clusters in guards,
   tow shackles ±0.45, center pintle; the two pre-existing 18-cell §B2
   deck-slot sky holes are CLOSED (contig 36 -> 0 held; my top-down scan
   contig 0). view-rear floods 0px enclosed.

## PER-TANK 14-VIEW SCORES (graduation severity; §B7 regions scored against
## the real-vehicle photo class per the adjudicated caps)

view order: front / frontleft / frontright / left / right / rear / rearleft /
rearright / top / hero-frontleft / hero-rearright / hero-toptilt /
close-front / close-roof

- m1a1   9.3 9.3 9.2 9.2 9.2 9.4 9.3 9.3 9.2 9.3 9.5 9.2 9.4 9.1 -> floor 9.1
  (worst close-roof: the CWS M2 foreshortens from the high-front camera;
  correct mass from every other angle)
- m1a1ha 9.3 9.3 9.2 9.2 9.2 9.4 9.3 9.3 9.2 9.3 9.5 9.2 9.4 9.1 -> floor 9.1
  (shield tell reads at both front quarters; camo distinct from m1a1)
- m1a2   9.2 9.2 9.1 9.1 9.1 9.4 9.3 9.3 9.1 9.2 9.3 9.1 9.2 9.2 -> floor 9.1
  (works-field density = the certified oracle-registration-pinned split;
  CROWS-LP mast excellent from rear/quarters)
- m1a2_tejas 9.3 9.3 9.2 9.2 9.2 9.3 9.3 9.2 9.2 9.3 9.4 9.2 9.3 9.2 -> floor 9.2
  (view-rear carries the 130px rack-to-deck air window — ref-endorsed real
  air, visible dead-rear only)
- m1a2_sepv2 9.2 9.2 9.1 9.1 9.2 9.4 9.2 9.2 9.1 9.2 9.3 9.1 9.1 9.2 -> floor 9.1
  (tallest mast reads UNMISSABLY; twin-fifty shield tell present)
- m1a2_tusk 9.1 9.1 9.0 9.1 9.1 9.4 9.2 9.2 9.1 9.1 9.2 9.1 9.1 9.0 -> floor 9.0
  (ARAT tile rows read as ERA with pitch + rails; slat cage real; CROWS II;
  the gate cap is the chimera mask, not a visual defect)
- abramsx 9.0 9.0 9.0 9.0 9.0 9.3 9.1 9.1 9.0 9.0 9.2 9.0 9.1 8.9 -> floor 8.9
  (stern transformed; XM914 station reads small-but-correct for the mark;
  floor held down by the close-roof read + the two orders below)

## OWNER-QUESTION ANSWER — "will the owner SEE the upgrades in the garage now?"

- m1a1: YES — a standing bare M2 on the ring where a flat sliver used to
  hide; taillight-guarded stern with integral grille.
- m1a1ha: YES — the same station visibly SHIELDED (camo plate over the gun)
  plus its red-brown scheme; tells apart from m1a1 at a glance.
- m1a2_tejas: YES — a full CROWS II mast on a riser; nothing like it was
  visible before this round.
- m1a2: YES — the CROWS-LP wide-flat head + loader shield; the old bin-cap
  is gone.
- m1a2_sepv2: YES — the family's TALLEST mast (CROWS II raised head, top
  2.95) + twin-fifty shield; unmissable dead-rear and in every quarter.
- m1a2_tusk: YES — slat-caged stern + ARAT skirts + CROWS II (unchanged
  verdict subject, scored for the record).
- abramsx: YES for the rear (the vent-field stern is the biggest single
  before/after delta in the round); its XM914 RWS is correct-but-compact —
  the mark's real proportion, not a visibility failure.

## HUNT RESULTS + ORDERS (non-blocking for the five freezes)

- Mast/CROWS floating reads: NONE (risers planted, gussets present,
  yaw-coupled).
- Shield attachment: ha shield contiguous with cradle; m1a2 loader shield
  strut present. No floating plates.
- Stern camo continuity: one-plate reads on all seven; only recess shadows
  split tone (ref-endorsed).
- ORDER (abramsx lane, next round): §B5/§C.1 — the dual whips read as
  turret-bustle furniture but live in rig_hull and STAY PUT under yaw
  (mode-2 HARD, 1368 candidate px, top rig_hull/mesh#26 687px; my yaw pair
  shows the turret rotating under static whips). Adjudicate against the
  real AbramsX bustle-corner antenna stations and re-parent with world pose
  preserved (or document the audit-artifact negative if the real config is
  hull-side).
- ORDER (abramsx lane, next round): §C.1 — 1 latent REVERSED piece (12px
  top-view deficit, 0.01%). Bind AX_HULL mirrored slabs through a winding
  guard (orientedSlab/sslab class). abramsx is not in the 2026-08-06 fleet
  winding baseline; both findings are new, not regressions.
- m1a2_tusk mode-2 425px candidates = deck-gear/works classes below the
  HARD bar; carry to its next gate-in-loop round for adjudication, no move
  ordered.

## LAWS FOR THE BANK

1. REF-HALF FLOOD CONTROL (§B2/§J): flood the REFERENCE half of the pair
   PNG with the identical mask+blue-signature method — one command settles
   "is this enclosed air ref-endorsed?" (m1a1 view-rear: ref 107px of the
   same roof-air classes vs proc 299px; same class, real air, no order).
2. FLOOD-COUNT METHOD VARIANCE (§D addendum extension): whole-half
   component floods vs zone-split floods read the same class differently
   (my tejas view-rear 130px vs the packet's banked 86px window) — bank
   CONNECTIVITY (4- vs 8-), zone bounds, and label-band exclusion beside
   every px count, exactly as pixel-diff thresholds are already banked.
3. CLEAN-ROOM WORKTREE + /tmp FIFO (§F mechanism proof): the live tree
   mutated under this session twice (kit.js modified->reverted between
   consecutive reads); a scratchpad worktree at HEAD reproduced all seven
   hashes and every gate row EXACTLY while the machine-wide /tmp cot-shots
   lock kept official runs serialized with live lanes — the honest frame
   for freeze proofs costs nothing and the FIFO survives it.
4. EVIDENCE-CHAIN SHORTCUT (§J corollary): when the builder's final set was
   rendered at the candidate hash, one pixdiff(t>4)=0 spot-verification per
   tank promotes the ALREADY-COMMITTED evidence to verdict evidence — the
   critic re-render then only has to exist, not be re-archived.
5. MAST-VS-CLOSE-ROOF FORESHORTENING (§J scoring note): the high-front
   close-roof camera is the WORST view for standing-mast reads (masts
   foreshorten toward the roof plane); score mast presence from
   front/quarter/rear compass views and use close-roof only for roof-plate
   grammar — prevents a false "mast invisible" order on any future mast
   round.

## EVIDENCE

- Canonical (live repo, verified at the verdict hashes by pixel-identity
  with my clean-room re-renders): shots/abrams-rear-r1/{before,after,final}-<id>/
  (14-view pairs) + shots/abrams-rear-r1/yaw{0,90}-<id>/ (14 shots each).
- Critic-side instrument outputs (clean-room worktree, transient): gate x2
  logs + per-id gate JSONs, winding-audit ranked tables, track-clip --exact
  table, standard-check table, visual-eval-<id>/report.json x7, flood
  component tables with bboxes (quoted above), bore-luma samples with
  coordinates (quoted above), mast/stern/bore crop strips.
- FIFO discipline: one-ticket batch render (tmp-abrams-rear-r1-batch.mjs,
  --phase=critic) + self-ticketing official audits; no external lock holds.

## FREEZE-FRAME ADDENDUM (mid-session landings)

HEAD advanced e502222 -> 4f12420 while this re-cert ran (fleet
bore+winding+mantlet sweep f186893 + registry/roster commits). The only
abrams-closure file touched is kit.js — an OPT-IN `parent` param on
muzzleBore() with a byte-identical default (the §F.2-compliant class;
abrams.js does not call it). Verified, fresh clean-room worktree at
4f12420, tmp-hashgeo x2: ALL SEVEN hashes identical to the verdict
bracket (ba45613c / ff97bc44 / 4778c7a8 / 4891abb6 / 83277374 / fc4018b8 /
92aed610). The re-freeze hashes are valid at the current tree. Note
4f12420 also orders the abramsx build-up "combined into the next abrams
round with the CROWS rework" — the two abramsx orders above fold into
that round's brief.

VERDICT SUMMARY: RE-CERT PASS — re-freeze m1a1 ba45613c, m1a1ha ff97bc44,
m1a2 4778c7a8, m1a2_tejas 4891abb6, m1a2_sepv2 83277374 (hashes proven at
both e502222 and 4f12420). m1a2_tusk and abramsx scored (9.0 / 8.9
floors), no freeze, two abramsx orders banked into the ordered combined
round.
