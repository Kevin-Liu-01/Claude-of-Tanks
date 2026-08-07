# SHADED-PARITY RE-CERT — ABRAMS CROWS AIM-FRAME ROUND (§4.999a rework x7)

Independent critic, 2026-08-06. Scope: the CROWS-rework + abramsx Order-B round
landed at 2d8918a (owner order: "the crows need to be redone to point in the
right direction (not pointing forward) and some should have armor surrounding
them, ammo boxes, lights, so on, and the shapes need to be connected").
Five graduate candidates re-certified on their diff-derived changed-view lists
(m1a1 9 / m1a1ha 7 / m1a2 12 / m1a2_tejas 12 / m1a2_sepv2 12); the two
non-graduates (m1a2_tusk, abramsx) scored on all 14, no freeze.

MEASUREMENT FRAME (§F LIVE-TREE FROZEN-SIB defense): the live tree carried a
russia-lane agent's WIP (russia.js + ledger/gate jsons + tmp tools modified)
throughout this session — all official runs executed in a CLEAN-ROOM WORKTREE
at HEAD 2d8918a (the landing commit itself; tree byte-clean, node_modules
symlinked). Measurement pages (tmp-hashgeo.html / tmp-tank-critic.html /
tmp-b5-shots.html) are tracked at 2d8918a; only the thin untracked puppeteer
drivers (tmp-hashgeo.mjs, tmp-abrams-crows-r1-batch.mjs — lock+vite+save only,
no measurement arithmetic; HASH-IMPL PINNING satisfied by the tracked page)
were copied in, checksum-verified against the live copies. One-ticket batch
driver per §F.1 for the render campaign (98 pair renders + 196 yaw shots,
zero console errors x7).

## VERDICT TABLE

| tank        | candidate hash (meshes/verts) | gate x2 (min \| h/w/t/st/d/f)                    | view floor | VERDICT |
|-------------|-------------------------------|--------------------------------------------------|-----------|---------|
| m1a1        | a04c8c74 (43/158132)          | 79.0 \| 91.7/79/85.7/92.5/100/100 EXACT           | 9.2       | RE-CERT PASS (re-freeze a04c8c74) |
| m1a1ha      | f1aaf80 (44/158336)           | 79.0 \| identical row EXACT                       | 9.2       | RE-CERT PASS (re-freeze f1aaf80) |
| m1a2        | bbae99a4 (42/116076)          | 64.9 \| 93.3/64.9/84.1/83.6/100/100 EXACT         | 9.1       | RE-CERT PASS (re-freeze bbae99a4) |
| m1a2_tejas  | 89c9f260 (45/159272)          | 61.5 \| 92/61.5/83.4/92.3/100/100 EXACT           | 9.2       | RE-CERT PASS (re-freeze 89c9f260) |
| m1a2_sepv2  | dda7bcf4 (42/116964)          | 60.3 \| 93.2/60.3/80.6/83.6/100/100 EXACT         | 9.1       | RE-CERT PASS (re-freeze dda7bcf4) |
| m1a2_tusk   | c8a1bc0 (55/200672)           | 0 \| 14.9/0/42.3/39.2/100/100 (capped rows absorbed the flip EXACTLY) | 9.1 | SCORED — non-graduate, no freeze; NO new orders |
| abramsx     | 9c059ce0 (44/68208)           | 49.4 \| 56/49.4/68.6/76.4/100/100 EXACT (vs 6.2 ledger row) | 9.0 | SCORED — non-graduate, no freeze; follow-ons endorsed below |

## THE OWNER-READ ANSWER ("do the stations point right and connect")

| mark    | points the right direction? | shapes connected? |
|---------|------------------------------|-------------------|
| m1a1    | YES — bare CWS M2 left-transverse (+90 exact; window-pinned), muzzle just short of the roof centerline; verified in plan (receiver x −0.73..−0.41, barrel to −0.13 = the source seats to the pixel), front and rear | YES — post 2.5mm-buried in the base, cradle on post, receiver on cradle, spade grips at aim-rear, jacket collar + barrel + dark tip; can hangs GUN-LEFT (stern side) on its bracket, feed chute to the receiver rail; flush ring conduit on the base plane. 8x dead-rear crop: zero float gaps |
| m1a1ha  | YES — same +90, and the 0.30 frontal shield pins it (swings out of the certified window at any other yaw) | YES — same chain, shield byte-identical on its certified seat; the shield's presence independently corroborated by the changed-view list shape (frontright/hero-frontleft went static on ha only — the plate occludes the station change from the front-right quadrant) |
| m1a2    | YES — CROWS-LP +90, head window-pinned [0.533,0.724]; apertures stay on the +z face = the packet's documented WINDOW-PIN residual, not a defect; loader M240 keeps its certified −8 slew (a shield station faces frontal fire by design) | YES — riser through the rack deck, drum, CRADLE YOKE drum-top→receiver-bottom (the elevated M2 no longer floats), head/drum contact collar, can GUN-LEFT + bracket + chute, IR pod, flush R1 slew conduit riding the band |
| tejas   | YES — CROWS II +90 (0.200 head in the 0.206 usable window), and the day/thermal/LRF are RE-FACED to the AIM face: the pod now looks where the gun points; the old +z-staring glass face reads plain from the front | YES — the marquee fix reads perfectly at 7x dead-rear: yoke bridges drum→receiver, contact collar under the head, can+bracket+chute GUN-LEFT, IR pod on the cradle rail |
| sepv2   | YES — CROWS II tall +90; apertures +z window-pinned (documented) | YES — taller yoke spans the +sepTall gap; PARTIAL ARMOR reads as FITTED kit: armored crown plate under the lick line + head brow plate follow the head envelope (no mystery boxes); twin-fifty loader station untouched and correctly forward |
| tusk    | YES — the family's real pointing delta: the whole station FLIPS OUTBOARD (−90), M2 overhanging the right cheek like the real CROWS photo pose; verified rear (barrel toward vehicle right) + close-roof (gun pointing away over the far cheek) + front (muzzle stub past the right cheek line) | YES — FULL ARMOR WRAP reads as fitted armor: flank plates both sides with window margins, rear plate with clean rim facing dead-rear, armored crown lid; yoke/collar/can(mirrored gun-left = bow side)/chute/IR pod as tejas; second urban spotlight on the yoke |
| abramsx | YES — XM914 at +34 toward the left bow quarter (the only station with true yaw freedom; drum notch + hero-rearright barrel line agree), old dead-forward stub retired | YES — drum→deck, receiver→drum under the 2.435 cap lick, exposed barrel run + muzzle block + dark bore tip, EO box, can→chute→receiver, conduit lick toward the mast head; the station is a hero/close-range read by construction (see honest notes) |

§H.4 SEVEN DISTINCT STATIONS AT A GLANCE — PASS. The tells: m1a1 bare elevated
M2 / ha the same gun SHIELDED / m1a2 low LP head under the gun plane + slewed
loader M240 / tejas full-height II head with aim-face glass + twin whips /
sepv2 the TALL yoke + armored crown + twin-fifty loader / tusk the armored box
pointing the OTHER way over ARAT skirts + loader shields / abramsx a 30mm RWS
on an unmanned bridge deck. National grammar holds — every US station reads
M2/M240/CROWS class (jacket collars, spade grips, hung cans, sensor clusters);
no cross-national silhouettes.

## STANDING CHECKS (all run by this critic, clean-room worktree at 2d8918a)

1. GATE x2 — both runs byte-identical and EXACTLY the landed capped lines on
   all seven (table above). dims 100 / floaters 100 everywhere.
2. HASH BRACKETING — tmp-hashgeo x2 at campaign OPEN and x2 at CLOSE
   (back-to-back): all seven stable and equal to the packet candidates.
   Every render/audit in this report sits inside the bracket.
3. TRACK-CLIP --exact — band 0/0 + shoe 0/0 on six; abramsx band rear 8
   (pre-existing ≤60-bar class, packet-documented), shoe 0/0; blind spots 0.
4. WINDING mode-1 — rev 0 / mix 0 x7; deficits 0 except tusk 1px @rearleft
   (trivial) and abramsx 12px @top = the packet's documented stern-lip
   hairline (no reversed piece). Mode-2 (yaw-stranded): m1a1/ha/m1a2/tejas
   = 0 candidates — THE AIM-FRAME PROOF (every station rides rig_turret);
   sepv2 5519px = the certified oracle-registration-pinned works field EXACT
   (top rig_hull/mesh#24 2666px, unchanged); tusk 425px pre-existing
   deck-gear class; abramsx 8949px (top rig_hull/mesh#25 5609 = masts +
   band-B deck) = ADJUDICATED BY-DESIGN pending the coupled turretFollowers
   landing (the print's own hull mask carries the identical static band).
5. §J YAW PAIRS — re-rendered at the verdict hashes (my own b5 pairs, all
   seven, yaw 0/90). Visual composite check: the entire station assembly,
   hatch rings, launchers, conduit and bustle furniture rotate as one at
   yaw90; hull fender gear stays put. Agrees with mode-2's machine zeros.
6. STANDARD-CHECK — contig 0 x7; censuses mg1+1d/2d/1d/2d/1d/7d/3d exactly
   as the packet close proofs.
7. VISUAL-EVALUATOR (§D standing order) — RIG PARITY OK x7, no flip, no
   mismatch; max yawProxy 2.6°/2.8° on tejas/tusk fronts = the station
   silhouette-change class surfacing in the proxy (the CROWS masts), rest
   ≤1.9°.
8. BUILDER EVIDENCE VERIFIED AT THE VERDICT HASHES — my independent
   clean-room renders are pixel-identical (diffpx t>4 = 0, both halves,
   all 14 views) to shots/abrams-crows-r1/after-<id>/ on the six and to
   final-abramsx/ on abramsx.
9. CHANGED-VIEW LISTS RE-DERIVED (§J diff-derived law) — my recert PROC
   halves vs shots/abrams-rear-r1/final-<id> at t>4, >50px bar reproduce
   the packet lists EXACTLY per view and per pixel count (m1a1 front 167,
   rear 237 … tusk front 3039, rear 2992; abramsx all-14 whole-vehicle).
   One transcription nit: sepv2's 287px view is close-FRONT in the
   derivation; close-roof reads 280 (the packet line says "close-roof 287")
   — same 12-view set, not verdict-affecting.

## PER-TANK SCORES (graduation severity, changed views only)

- m1a1 (9): front 9.3, frontright 9.2, right 9.2, rear 9.4, rearright 9.2,
  hero-frontleft 9.2, hero-rearright 9.3, close-front 9.2, close-roof 9.3.
  §B3.1 gun run clean (cylindrical tube, evacuator, muzzle bore reads
  dead-front); §B1.1 both cheeks raked.
- m1a1ha (7): front 9.3, right 9.2, rear 9.4, rearright 9.2,
  hero-rearright 9.2, close-front 9.2, close-roof 9.3.
- m1a2 (12): front 9.3, frontleft 9.1, rearleft 9.2, rear 9.4,
  rearright 9.2, right 9.2, frontright 9.2, hero-frontleft 9.2,
  hero-rearright 9.3, hero-toptilt 9.2, close-front 9.2, close-roof 9.3.
- m1a2_tejas (12): front 9.4, frontleft 9.2, rearleft 9.2, rear 9.4,
  rearright 9.2, right 9.2, frontright 9.2, hero-frontleft 9.2,
  hero-rearright 9.3, hero-toptilt 9.2, close-front 9.3, close-roof 9.3.
- m1a2_sepv2 (12): front 9.3, frontleft 9.1, rearleft 9.1, rear 9.4,
  rearright 9.2, right 9.1, frontright 9.2, hero-frontleft 9.2,
  hero-rearright 9.2, hero-toptilt 9.2, close-front 9.2, close-roof 9.3.
- m1a2_tusk (14): front 9.3, frontleft 9.2, left 9.1, rearleft 9.1,
  rear 9.3, rearright 9.2, right 9.2, frontright 9.2, top 9.1,
  hero-frontleft 9.2, hero-rearright 9.2, hero-toptilt 9.1,
  close-front 9.2, close-roof 9.3. TUSK kit reads TUSK: ARAT courses at
  real tile pitch, loader shield array forward, rear slat, urban lights.
- abramsx (14): front 9.2, frontleft 9.1, left 9.0, rearleft 9.1,
  rear 9.3, rearright 9.1, right 9.0, frontright 9.1, top 9.1,
  hero-frontleft 9.1, hero-rearright 9.3, hero-toptilt 9.1,
  close-front 9.3, close-roof 9.1. Identity reads: low-profile unmanned
  hex shell, slim XM360 with §B3.1 bore, kneed skirts with COUNTABLE
  exposed wheels (§B8.1 at native tone), raised rear sensor deck with
  louvers + twin masts, corner pod wings.

## HONEST NOTES / DECODES (no orders attached)

- abramsx right/left 9.0 floors decode to two documented classes, not
  defects: (1) the proc shell reads a hair taller/fuller than the ref's
  batch-20 warp-COMPRESSED shell (plateau cap, ~8-10 turret columns —
  the print is wrong, published heightM 2.44 is sovereign; orchestrator
  normalize plan already queued); (2) the under-skirt run is a deep-shade
  zone (DEEP-SHADE ALBEDO CLAMP — shadow physics, tint cannot move it),
  wheels remain countable.
- The XM914's broadside faintness (a 30mm run against the dark deck under
  the 2.435 mask-free cap) MATCHES the print's own warp-flattened RWS band
  (2.44-2.451) — parity, not a visibility defect. See conditional
  follow-on below.
- tusk left/top carry the smallest station reads (armor box distant) —
  9.1s on silhouette + ARAT/shield grammar, no incoherence anywhere.

## NON-GRADUATE FOLLOW-ONS (endorsed / banked, orchestrator lane)

1. abramsx COUPLED WHIP LANDING (already queued, 4.9999): turretFollowers
   extension on the MODEL_SOURCE registration + AX_WHIPS_TURRET branch in
   one landing — clears the 8949px mode-2 by-design field honestly.
2. abramsx PLATEAU DECOMPRESSION (already queued): batch-20 re-run with
   turret-node knee 2.44 (or turret-only decompression) releases the
   ~8-10-column cap; turret_side ceiling 68-72 → ~75+ honestly.
3. NEW, conditional on (2): XM914 RE-SEAT PROUD OF THE DECK — once the
   plateau cap releases, the station gains honest headroom; the real
   XM914 sits fully above its bridge. Re-seat receiver+drum proud, keep
   the +34 aim frame. (Do not attempt under the current cap — the
   mask-free envelope is what pins it low.)
4. tusk: NO orders. Both §4.999a asks (outboard flip + full wrap) landed
   and read correctly; capped rows absorbed the flip exactly.

## LAWS BANKED THIS CRITIQUE

- PLAN-FRAME CALIBRATION PROTOCOL (§J): before any pointing adjudication,
  calibrate the view frame with two invariants (smoke launchers/gun tube
  pin the bow; one source-seated part pins the x sign) — view NAMES are
  page labels, never side evidence; a mis-assumed axis inverts every
  azimuth verdict. Cost of skipping: two false starts on the m1a1 plan.
- DIFF-SHADOW SHIELD PROOF (§J corollary): between station-identical
  siblings, the changed-view LIST SHAPE is itself evidence — ha's missing
  front-right-quadrant views (vs m1a1's list) are the frontal shield
  occluding the station change; adjudicate list deltas before suspecting
  under-derivation.
- AIM-FRAME YAW-COMPOSITE (§B5/§J): a yaw0|yaw90 plan composite of the
  turret zone is the 30-second visual companion to winding mode-2 — the
  station field visibly rides the yaw while hull gear holds; use it in
  every station re-cert.
- DARK-DECK STATION CLASS (§B3.2 corollary, abramsx): a sub-cap RWS on a
  dark deck is a hero/close-range read BY CONSTRUCTION; when the oracle's
  own band is equally flat, broadside faintness is parity — score the
  class, order changes only where the ref reads louder than the proc.
- WINDOW-PIN THEOREM applied at re-cert severity: +z-facing apertures on
  m1a2/sepv2 are certified residuals (heads fill their windows to 0.5mm)
  — a critic penalizing them would be ordering a cap re-adjudication,
  not a build change; tejas/tusk (0.206 windows) carry the aim-face law.

## EVIDENCE

My renders (clean-room, verdict hashes; copied from the worktree into
the live shots area): shots/abrams-crows-r1/recert-<id>/ (14-view pairs
x7, pixel-identical to the builder's landed evidence) +
recert-yaw{0,90}-<id>/ (14 shots each x7);
region crops reviewed at 2.6x-8x on every station (rear dead-on, front
roofline, plan, close-roof, heroes). Machine outputs: gate x2, hashgeo
x2+x2, track-clip --exact, winding-audit modes 1+2, standard-check,
visual-evaluator x7 — all inside the hash bracket. Builder evidence
verified byte-equivalent at the verdict hashes (diffpx 0).

RE-FREEZE ORDER (per §10 graduate-change): m1a1 a04c8c74, m1a1ha f1aaf80,
m1a2 bbae99a4, m1a2_tejas 89c9f260, m1a2_sepv2 dda7bcf4. Floors 9.1-9.2,
owner-question YES on every mark. tusk c8a1bc0 and abramsx 9c059ce0
scored, no freeze (gate-in-loop non-graduates).

POST-VERDICT HEAD NOTE: main advanced 2d8918a -> 7e8a694 during this
session (t90m r8, russia lane: russia.js + t90m gate/packet + t90m
ledger rows ONLY — no abrams profile, no shared vehicle module, no
abrams gate rows). The verdict hashes and gate lines above therefore
bind unchanged at 7e8a694; the §10 flow re-verifies at freeze time as
always.
