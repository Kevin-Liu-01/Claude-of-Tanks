# Shaded-parity critique — round 2 (human gate, HANDOFF-FABLE §7)

**Reviewer:** harsh visual critic pass, 2026-07-30 (round 2; round 1 = shaded-parity-r1.md).
**Evidence:** freshly regenerated boards for all 45 ids,
`node tools/procedural-fidelity.mjs --ids=... --board`
(shots/procedural-fidelity/boards/<id>.png), judged on the SHADED pair
(reference LEFT / procedural RIGHT), the articulation strip (floaters/voids),
and the 24-frame turntable. Same question as r1: does the procedural read as the
same vehicle at the same asset-quality tier from a garage camera? Gate: ALL seven
scores >= 9, lower-when-uncertain, masks not accepted as proof of likeness.

**Result: 0/45 pass — but the fleet genuinely moved.** r1's median overall was 3
(range 1–3); r2's median is 4 (range 3–5). The materials/wheels/floater passes
landed: dark rubber tires + hub caps exist family-wide, glass periscopes and
khaki stowage read as second materials, skirts/prows/fender kit transformed the
UK family, m1a1_aim has a turret again, and nearly every r1 floater is attached
or gone. What did NOT move: **turret construction**. Repairing the reference
GLBs exposed that four pattons share one naked rear-set egg-dome (turret masks
49–60), the whole merkava family shares a slab-wedge with a giant square
gun-mount box (turret masks 26–66), and chieftain5/fv510/sepv2 still carry
wrong-shaped turrets. Surfaces are one detail-density tier below every intact
reference; guns still lack their signature muzzle devices on the Soviet heavies.

## Reference-state notes (r2)

- **Repair VERIFIED (proud, seated turrets):** m26_pershing, m45_patton,
  m46_patton, m47_patton, is3_bergman (dome + DShK + stow tube all present).
- **Still broken:** m1a1_aim — hull only, NO turret, stub tube at deck level
  (turret mask 20.3 is meaningless; flagged in the run brief, confirmed).
- **Still broken beyond the brief:** challenger_cruiser — turret is an exploded
  splat floating over an open ring (turret mask 34.4 meaningless);
  charioteer / comet / centurion3 — turret sits AFT of an open turret-ring pit
  (displaced, not seated; turret masks 38–50 polluted); centurion5 — same pit
  PLUS its L7 barrel lies DETACHED diagonally across the glacis (gun 15.2).
  The known muzzle-stub defect on charioteer/comet/centurion3 was not counted
  against the procedurals.

## Summary table

Scores 0-10: SD surface_detail, MA materials, WT wheels_tracks,
TC turret_character, HC hull_character, SP silhouette_parity, OV overall.
Verdict PASS needs all >= 9. r1 = round-1 overall; Δ = OV − r1.

| tank | SD | MA | WT | TC | HC | SP | OV | r1 | Δ | verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| m26_pershing | 3 | 4 | 4 | 2 | 3 | 5 | 3 | 2 | +1 | FAIL |
| m45_patton | 3 | 4 | 5 | 2 | 3 | 5 | 3 | 2 | +1 | FAIL |
| m46_patton | 3 | 4 | 5 | 2 | 3 | 5 | 3 | 2 | +1 | FAIL |
| m47_patton | 3 | 4 | 5 | 2 | 3 | 4 | 3 | 3 | 0 | FAIL |
| m60a1 | 3 | 4 | 5 | 4 | 4 | 7 | 4 | 3 | +1 | FAIL |
| m60a3 | 3 | 4 | 5 | 4 | 4 | 7 | 4 | 3 | +1 | FAIL |
| chieftain5 | 4 | 4 | 4 | 3 | 5 | 4 | 4 | 2 | +2 | FAIL |
| charioteer | 4 | 3 | 5 | 3 | 4 | 4 | 4 | 3 | +1 | FAIL |
| comet | 4 | 4 | 5 | 4 | 5 | 5 | 4 | 3 | +1 | FAIL |
| centurion3 | 4 | 4 | 4 | 3 | 5 | 4 | 4 | 3 | +1 | FAIL |
| centurion5 | 5 | 4 | 4 | 4 | 5 | 4 | 4 | 3 | +1 | FAIL |
| challenger1 | 4 | 4 | 4 | 5 | 4 | 6 | 4 | 3 | +1 | FAIL |
| challenger_cruiser | 5 | 4 | 6 | 4 | 5 | 4 | 4 | 3 | +1 | FAIL |
| fv510 | 5 | 4 | 4 | 4 | 4 | 4 | 4 | 3 | +1 | FAIL |
| m1a2 | 4 | 4 | 4 | 3 | 4 | 5 | 4 | 3 | +1 | FAIL |
| m1a1 | 4 | 4 | 4 | 5 | 4 | 6 | 4 | 3 | +1 | FAIL |
| m1a1ha | 4 | 4 | 4 | 5 | 4 | 6 | 4 | 3 | +1 | FAIL |
| m1a1_aim | 4 | 4 | 4 | 5 | 4 | 4 | 4 | 1 | +3 | FAIL |
| m1a2_sepv2 | 4 | 4 | 4 | 3 | 4 | 4 | 4 | 2 | +2 | FAIL |
| m1a2_tusk | 5 | 4 | 5 | 4 | 5 | 6 | 5 | 3 | +2 | FAIL |
| m1a2_tejas | 4 | 4 | 4 | 5 | 4 | 6 | 4 | 3 | +1 | FAIL |
| abramsx | 4 | 4 | 5 | 4 | 5 | 5 | 4 | 3 | +1 | FAIL |
| t90a | 3 | 3 | 3 | 3 | 4 | 5 | 3 | 3 | 0 | FAIL |
| t62mv1 | 4 | 4 | 4 | 4 | 4 | 5 | 4 | 3 | +1 | FAIL |
| t90a_vladimir | 4 | 4 | 3 | 3 | 4 | 5 | 4 | 3 | +1 | FAIL |
| t64bv1 | 4 | 4 | 3 | 4 | 4 | 5 | 4 | 3 | +1 | FAIL |
| pt91m | 4 | 4 | 3 | 4 | 4 | 5 | 4 | 3 | +1 | FAIL |
| t72b_1987 | 4 | 4 | 3 | 3 | 4 | 5 | 3 | 3 | 0 | FAIL |
| t72b3m | 4 | 4 | 4 | 4 | 4 | 5 | 4 | 3 | +1 | FAIL |
| t72bu | 4 | 4 | 3 | 3 | 4 | 4 | 3 | 2 | +1 | FAIL |
| t90sm | 4 | 4 | 3 | 5 | 4 | 5 | 4 | 3 | +1 | FAIL |
| is7 | 3 | 4 | 5 | 4 | 4 | 7 | 4 | 3 | +1 | FAIL |
| is3 | 4 | 4 | 4 | 4 | 4 | 7 | 4 | 3 | +1 | FAIL |
| object279 | 4 | 4 | 4 | 4 | 5 | 7 | 4 | 3 | +1 | FAIL |
| is3_bergman | 4 | 4 | 4 | 3 | 4 | 5 | 4 | 2 | +2 | FAIL |
| kv2 | 6 | 5 | 7 | 6 | 5 | 7 | 5 | 3 | +2 | FAIL |
| is6b | 4 | 4 | 4 | 4 | 4 | 7 | 4 | 2 | +2 | FAIL |
| merkava4 | 5 | 4 | 5 | 3 | 5 | 4 | 4 | n/a | n/a | FAIL |
| merkava4b | 4 | 4 | 5 | 3 | 5 | 5 | 4 | n/a | n/a | FAIL |
| merkava1b | 4 | 4 | 6 | 4 | 5 | 5 | 4 | n/a | n/a | FAIL |
| merkava2b | 4 | 4 | 4 | 2 | 4 | 4 | 3 | n/a | n/a | FAIL |
| merkava2d | 4 | 4 | 4 | 3 | 4 | 5 | 4 | n/a | n/a | FAIL |
| merkava3b | 4 | 4 | 5 | 3 | 5 | 5 | 4 | n/a | n/a | FAIL |
| merkava3c | 4 | 4 | 5 | 4 | 5 | 5 | 4 | n/a | n/a | FAIL |
| merkava3d | 4 | 4 | 5 | 3 | 5 | 5 | 4 | n/a | n/a | FAIL |

## Cross-family systemic state (r1 list, re-audited)

1. **Wheels (r1 #1) — HALF CLOSED.** Dark rubber tire ring + hub cap + body-color
   face now ships fleet-wide; kv2 has real spoked wheels, challenger_cruiser /
   comet / merkava1b show lightening holes, m45/m46 show return rollers and the
   m46 tension idler. Still open: faces are FLAT (no bolt rings/holes) on
   patton/abrams/russia/merkava; russia + merkava wheels sit in a black shadow
   void behind deep hull sides; zero track sag anywhere.
2. **One-clay materials (r1 #2) — PARTIALLY CLOSED.** Glass periscope inserts,
   black tires, khaki stowage, grey fittings, dark grilles, dark skirt panels all
   exist now. Still open: hull+turret+ERA remain one albedo (russia bricks are
   hull-colored), patton track band is a wrong sand/tan tone, t90a still leaks
   the rust track stripe above the skirt line and t90a_vladimir's sprocket ring
   pops orange, chieftain/UK khaki bins ignore the camo palette.
3. **Gun furniture (r1 #3) — MIXED.** Thermal sleeve steps on NATO tubes,
   centurion5 extractor, charioteer 20-pdr extractor, m45 short howitzer, fv510
   RARDEN all landed. Still open: NO Soviet-heavy muzzle brake exists (is3,
   is3_bergman, is6b, object279 all bare tubes — the r1 identity bullet
   verbatim), no 2A46 mid-tube bore evacuator anywhere in russia (root sleeves
   only), m26's double-baffle brake is a plain stepped collar, m47's M36 blast
   deflector unreadable.
4. **Mantlet saddles (r1 #4) — CLOSED for soviet-heavy** (is3/is7/is6b saddles
   stay seated at -depression, kv2 has its bolted disc), still boxy on abrams
   (square blocks) and grotesquely oversized on merkava (see family section).
5. **Russia ERA (r1 #5) — MOVED, NOT FINISHED.** Midline necklaces are gone;
   bricks/cassettes now sit on cheek fronts + partial glacis rafts (t62mv1,
   t72b3m 2-course cassettes best). Still open: rafts are 1 row instead of 2–3
   courses (t72b_1987), tiles sparse instead of fields (pt91m), Shtora "eyes"
   still absent/unreadable (t90a, t90a_vladimir, t72bu), K-5 clamshell volume
   still missing on t90a.
6. **Glacis kit (r1 #6) — HALF CLOSED.** Pattons have periscope hoods with glass
   + bow MG balls with barrel stubs; UK glacis carries splash rails + draped tow
   cables; abrams has toe lights/tow eyes. Headlight pods with brush guards still
   missing fleet-wide; russia splash V-boards still absent.
7. **Deck/fender furniture (r1 #7) — PARTIAL.** Louvered decks (chieftain,
   challenger_cruiser, abramsx rear, is7 rear slope), merkava side grilles, UK
   fender bins landed. Patton decks still near-empty (m45 has an open black
   grille pit), fenders bare on pattons/soviet-heavy, T-72/T-90 rear fuel drums
   still absent family-wide.
8. **Roof furniture (r1 #8) — PARTIAL.** m1a1-family commander M2 stations +
   bustle racks with stowage, DShK/NSVT pintle MGs (is3, t62mv1, t72*), KPVT on
   is7, fv510 discharger tube clusters are real geometry now. Still placeholder:
   m60 cupola is an open-top drum without vision blocks, m1a2 dischargers remain
   painted dots, merkava dischargers are "combs" glued to the roof crest.
9. **Floating/detached geometry (r1 #9) — LARGELY CLOSED.** Verified attached or
   gone: chieftain5 + abramsx corner plates, charioteer/comet/centurion deck
   cables (now draped WITH cleats), t62mv1 roof drum (stowed on deck),
   m1a2_sepv2 mantlet box, m1a1_aim turret EXISTS. New/remaining: m45 muffler
   hovers over an open deck void, t90a_vladimir has a red streak artifact
   hanging from the turret cheek, merkava bustle rail bars skim the deck.
10. **Cast/weld character (r1 #10) — BARELY STARTED.** Faint rivet/seam dot rows
    on patton domes and kv2/object279/comet plates (kv2 excellent). IS pikes
    still have no weld beads; cast domes are still lathe-perfect; no casting
    texture anywhere.
11. **Broken references (r1 #11) — 9 of 11 repaired.** See reference-state notes:
    m1a1_aim, challenger_cruiser, and the four UK prints (displaced turrets /
    detached barrel) still poison turret+gun masks.

---

## patton family

### m26_pershing — 3/4/4/2/3/5/3 — FAIL (r1 2, +1)
Reference repaired (proud turret, cupola, pintle M2 verified on board).
Masks: overall 89.8, hull 92.7, **turret 60.1**, gun 86.3, tracks 87.1.
- VERIFIED CLOSED: glacis periscope hoods with glass inserts; bow MG dome with
  barrel stub; recessed rear-plate exhaust grilles; wheels wear tire ring + hub
  cap; track has links/segmentation; deck has a framed grille inset.
- OPEN from r1: turret is still a naked rear-set egg — no cupola drum, no loader
  hatch, no pintle M2, no ventilator; the repaired reference now exposes the
  shape as wrong (turret mask 60.1). Muzzle device reads as a plain stepped
  collar, not the double-baffle brake. Fenders carry no stowage; deck has no
  louver banks; no headlight pods/brush guards; no tow shackles.
- NEW: (1) Replace the shared egg dome with the M26 casting: ring at hull
  mid (not −1.7), distinct bustle overhang, cupola right / loader hatch left —
  this is now the family's single biggest visual bug. (2) The track band is
  sand/tan; repaint gunmetal with dark rubber pads (both sides, full run).
  (3) Move the turret decal off the bare dome onto the bustle side where the
  reference wears it. (4) The muzzle needs actual side-baffle lobes (two
  stacked rings read as a sleeve). (5) Return rollers exist but hide in shadow —
  lift them to touch the upper run so the run doesn't float over the sponson.

### m45_patton — 3/4/5/2/3/5/3 — FAIL (r1 2, +1)
Reference repaired. Masks: 86.9 / 90.8 / **51.5** / 100 / 83.4.
- VERIFIED CLOSED: SHORT fat 105 mm howitzer with shield collar (r1's #1 bullet);
  bow MG ball with stub; periscope hoods with glass; 2–3 return rollers; faint
  rivet-dot seams on the dome; turret ring collar sits proud of the deck.
- OPEN from r1: turret kit (cupola + loader hatch + pintle M2 + ventilator)
  still absent — the dome carries one flat disc; egg shape wrong vs the repaired
  reference (turret mask 51.5, worst patton but m47).
- NEW: (1) The engine-deck rear is an OPEN BLACK VOID spanning the deck width
  with a muffler cylinder floating across it — close the pit with a louvered
  grille surface and seat the muffler on legs. (2) The pintle-MG stick on the
  roof front-left still crosses the turret cheek unsupported at some yaw angles
  — give it a real pintle base or delete. (3) Exhaust deflector plate hangs at
  the deck lip without brackets. (4) Track tan tone as m26. (5) Wheel faces
  need the bolted-hub ring — currently smooth discs with a cap.

### m46_patton — 3/4/5/2/3/5/3 — FAIL (r1 2, +1)
Reference repaired; both sides camo. Masks: 88.2 / 91.8 / **53.1** / 83.7 / 86.1.
- VERIFIED CLOSED: track-tension idler wheel ahead of the sprocket (r1 cue);
  bow MG ball; periscope hoods; front mudguard plates; camo blotch tones
  plausibly match the reference print.
- OPEN from r1: the fender MUFFLERS read as two flat grey slabs lying on the
  deck rear corners, not cylinders with pipe runs — the M46's loudest cue is
  still not readable. Turret remains the naked shared egg (no cupola/hatches/
  ventilator, mask 53.1). Bore evacuator + single-baffle brake still missing
  (plain stepped muzzle).
- NEW: (1) Rebuild turret as m26 (shared fix). (2) Make the mufflers cylinders
  with end caps + exhaust elbows connecting to the hull rear. (3) The camo
  paints over the wheel faces — mask wheels to rubber/steel. (4) Deck louvers
  still absent between the muffler slabs. (5) Fender stowage boxes absent.

### m47_patton — 3/4/5/2/3/4/3 — FAIL (r1 3, 0)
Reference repaired. Masks: 88.8 / 92.0 / **49.5** / 78.7 / 84.5. Worst turret
mask of the family — and the only tank that did not move overall this round.
- VERIFIED CLOSED: rangefinder blister bumps survive on the dome sides; bow MG
  ball; periscope hoods; family wheel/track upgrades; return rollers.
- OPEN from r1: the M47's needle-nose turret + long bustle simply is not there —
  the shared egg reads as a different tank next to the repaired reference
  (mask 49.5). M36 blast deflector still unreadable (slightly wider tip only).
  Roof kit (cupola, loader hatch, ventilator, bustle rack) absent.
- NEW: (1) The M47 cannot share the egg dome at all — needle nose + bustle is
  the whole identity; rebuild or accept permanent failure. (2) Shape the
  blisters into boxed housings with end caps (r1 bullet, still soft bumps).
  (3) Blast deflector: model the fat cylinder with two side slots. (4) Turret
  decal floats on the naked dome; move to the bustle. (5) Fender line bare —
  add the stowage row the reference carries.

### m60a1 — 3/4/5/4/4/7/4 — FAIL (r1 3, +1)
Intact detailed reference. Masks: 91.8 / 92.9 / 86.6 / 90.1 / 85.5.
- VERIFIED CLOSED: turret is now a credible large dome with cupola drum +
  cheek grab rail; mantlet exists as a shaped wedge with the gun in a proper
  collar; glacis periscope hoods + splash strip line; front mudguards; wheels
  have tires + hubs.
- OPEN from r1: AN/VSS-1 searchlight still missing above the mantlet (r1 keeps
  it — LEFT carries the box); M19 cupola has NO vision-block band and NO M85
  stub; bustle rack + rear stowage absent; headlight pods with guards absent;
  fender boxes + tow cable absent; wheel faces flat (no bolt ring/holes);
  track texture flat between links.
- NEW: (1) The cupola drum is OPEN-TOPPED — from front-left the cylinder shows
  a black interior; cap it with the hatch dome. (2) The mantlet wedge is ~40%
  too wide and reads Leopard-like; narrow to the M140 slot + canvas cover.
  (3) Camo/olive paints the wheel faces (rubber should stay black).
  (4) Engine deck: raised louver panels still missing (flat with seams).
  (5) The dome's rivet-dot arcs read as beads; soften into cast seam lines.

### m60a3 — 3/4/5/4/4/7/4 — FAIL (r1 3, +1)
Masks: 91.5 / 92.9 / 86.1 / 90.4 / 85.5.
- VERIFIED CLOSED: faceted "welded" front from r1 is gone — the turret is a
  smooth casting now; crosswind mast stub at turret rear; TTS-ish sight box on
  the roof; searchlight correctly absent; same hull/wheel upgrades as m60a1.
- OPEN from r1: **thermal sleeve still missing** — the A3's identity cue; tube
  is bare with a muzzle step. M19 vision blocks + M85 stub absent. Bustle rack
  absent. Headlight pods absent.
- NEW: (1) Same open-top cupola bug as m60a1. (2) Same oversized mantlet wedge.
  (3) The crosswind mast is a bare rod — needs the sensor cross head.
  (4) Differentiation from m60a1 currently rests on two roof boxes; the sleeve
  would do the work. (5) Wheel bolt rings as m60a1.

## uk family

### chieftain5 — 4/4/4/3/5/4/4 — FAIL (r1 2, +2)
Intact reference. Masks: 88.3 / 80.6 / **41.9** / 88.4 / 88.4 (r1 silhouette
was 56.7 — biggest silhouette recovery in the fleet).
- VERIFIED CLOSED: reclined-driver low prow with glacis crease; full-length
  skirts with panel cuts; sponson bin row; NBC/bustle boxes; left-cheek
  searchlight box; thermal sleeve steps + muzzle collar on the L11 (gun mask
  88.4 vs r1's 0); corner mud plates now attach to the fender line; louvered
  engine deck; cupola with ring detail.
- OPEN from r1: the turret is still not the rounded Mk.5 casting — flat roof
  plane + slab cheeks + a boxy silhouette (mask 41.9); no real commander sight
  ring; stowage bins are bare khaki slabs.
- NEW: (1) The row of dark square studs across the turret face under the gun
  reads as a monster mouth / drilled teeth — replace with the smooth cast chin;
  this is the tank's worst close-up artifact. (2) Khaki bin set ignores the
  green/black camo — tint or strap them. (3) The upper track run disappears
  behind the skirt but the front idler shows a daylight gap under the skirt
  lip at some turntable angles. (4) Cheek smoke dischargers still absent (r1
  bullet). (5) Hull front tow eyes absent.

### charioteer — 4/3/5/3/4/4/4 — FAIL (r1 3, +1)
Reference STILL displaced (turret aft of an open ring pit; muzzle stub known
defect — barrel mismatch not penalized). Masks: 82.0 / 87.5 / 50.3* / 0* / 84.3
(*polluted by reference defect).
- VERIFIED CLOSED: 20-pdr re-seated at turret face CENTER in a narrow internal
  mantlet (r1's #1 — the base-seam exit is gone); Type B fume extractor
  mid-tube; floating deck cable deleted; Christie wheels with tires + hub +
  spoke recesses; boxed pannier steps + deck bins; driver visor plate.
- OPEN from r1: turret faces still bare (no pistol port discs, no corner
  lifting lugs, no smoke boxes); rear bustle bin small; muzzle counterweight
  absent; rivet rows from r1 are gone from the hull sides (regression — r1
  praised them); twin fishtail exhaust cowls still not readable.
- NEW: (1) Restore the rivet seam rows the r1 build had — the hull reads
  smoother than round 1. (2) Bow MG position is a flat dark disc again; model
  the ball. (3) Headlight stalks absent from the mudguard tips. (4) The rear
  deck's raised louver plates read as flat decals from 3/4 rear. (5) Reference
  repair: re-center the print's turret over its ring (report to pipeline).

### comet — 4/4/5/4/5/5/4 — FAIL (r1 3, +1)
Reference still displaced (ring pit + aft turret + stub gun, as charioteer).
Masks: 85.2 / 91.0 / 49.9* / 0* / 81.4.
- VERIFIED CLOSED: 77 mm HV exits mid-face from a bolted internal mantlet;
  floating cable gone; rivet dot rows on turret roof edge + hull; rear bustle
  bin attached; track guards with mud flaps; fender bins; wheels with
  lightening holes; camo palette matches the reference print's sand/green/red.
- OPEN from r1: smoke discharger cluster on the right cheek still paint/absent;
  cupola vision ring + loader hatch minimal (flat discs); Besa bow ball still a
  small circle without the armored ball housing; engine deck louvers read flat;
  four return rollers unverifiable (guards cover) — sag absent on the exposed
  lower run.
- NEW: (1) The fishtail exhaust cowls: one ambiguous transverse cylinder at the
  tail — split into the twin cowls with flattened fishtail tips. (2) Turret
  cheek decal sits where the discharger cluster belongs; swap. (3) Headlights
  missing from mudguard tips. (4) The hull-side rivet rows stop at the pannier
  step — continue along the full side seam. (5) Reference repair as charioteer.

### centurion3 — 4/4/4/3/5/4/4 — FAIL (r1 3, +1)
Reference still displaced (ring pit; muzzle stub known). Masks: 84.5 / 91.4 /
38.2* / 0* / 81.9.
- VERIFIED CLOSED: RWS-like roof box replaced by low cupola + hatch discs
  (r1's #1); antennas moved to bustle-corner bases; skirts cut into panels
  with gaps; tow cable draped ACROSS the glacis with end cleats (was a
  floater); rear bustle bin; splash rail.
- OPEN from r1: 20-pdr tube is bare (no B-barrel extractor — acceptable only if
  the intent is the Type A barrel, but then the canvas mantlet wedge r1 asked
  for is still missing); cheek dots remain low-relief; exposed wheels below the
  skirt line are plain discs; engine-deck louver field + rear track-link rack
  still missing; lower-run sag absent.
- NEW: (1) The bead-row of bumps across the turret face bottom reads as a
  necklace, same artifact family as chieftain's teeth — integrate into a cast
  mantlet lip or delete. (2) Skirt panels need lifting handles (bare cuts now).
  (3) Headlight pods with guards still absent (small nubs only). (4) Turret
  side stowage bins (LEFT is ringed) still absent. (5) Reference repair as
  charioteer.

### centurion5 — 5/4/4/4/5/4/4 — FAIL (r1 3, +1)
Reference broken WORSE than r1 noted: open ring pit AND the full L7 barrel
lies detached diagonally across the glacis (gun mask 15.2 meaningless).
Masks: 86.6 / 91.8 / 56.8* / 15.2* / 82.7.
- VERIFIED CLOSED: L7 carries its fat mid-tube fume extractor (r1's #1);
  cheek smoke dischargers exist as a real multi-tube block; centurion3 vs 5 are
  now visually distinct (extractor + dischargers vs plain 20-pdr) — r1 bullet
  closed; skirts/cable/bins as centurion3.
- OPEN from r1: same bead-row artifact and naked-cheek issues as centurion3;
  cupola drum bare; wheels below skirts plain.
- NEW: (1) The discharger block is a solid slab with surface tubes — separate
  the 2x6 tubes so they read at distance. (2) Bustle bin is a single khaki box;
  the Mk.5 wears a wide rectangular bin + rolled tarp. (3) Same skirt-handle,
  headlight, and sag gaps as centurion3. (4) URGENT reference fix: reattach the
  print's barrel to its mantlet — every gun metric for this id is currently
  fiction. (5) Materials: the khaki bin + grey extractor both ignore the green
  camo.

### challenger1 — 4/4/4/5/4/6/4 — FAIL (r1 3, +1)
Intact reference. Masks: 81.8 / 82.0 / 77.8 / 92.0 / 72.9.
- VERIFIED CLOSED: TOGS-style barbette housing exists above the mantlet with
  lens dots; smoke discharger tube row on the cheek; thermal sleeve + muzzle
  collar; skirt panel cuts; splash board strip; roof MG is now a small pintle
  mount, not the oversized RWS block; rear rack ribs on the tail.
- OPEN from r1: turret sides/rear still lack the tubular stowage baskets full
  of kit (bare cheeks with one khaki box); gun trunnion still sits low in the
  wedge; loader cupola + gunner sight cowl minimal; headlight clusters in
  guards absent; wheels plain under the skirt; track mask 72.9 — procedural
  track band visibly shallower than reference.
- NEW: (1) TOGS barbette is CENTERED on the gun axis — shift it to the right of
  the gun and give it the vertical split face. (2) The 2x5 discharger row is a
  strip of nubs — needs tube depth. (3) Track: deepen the band + add end
  connectors; 72.9 is the worst UK track score. (4) Rear fuel drum/bin still
  missing (tail reads bare on the turntable). (5) Skirt bolts + lifting slots
  absent (plain cuts).

### challenger_cruiser — 5/4/6/4/5/4/4 — FAIL (r1 3, +1)
Reference STILL broken (exploded turret splat over an open ring — repair did
not land for this id). Judged on procedural quality vs packet.
Masks: 81.8 / 90.9 / 34.4* / 100 / 89.8.
- VERIFIED CLOSED: floating bent cable gone (bow tow lugs at the toes now);
  cupola ring with vision blocks; corner lifting lugs on the turret roof;
  17-pdr in a narrow internal mantlet slot with collar; raised deck louver
  plates; pannier bins; Christie wheels with open lightening holes (best UK
  wheels); top run tucks under the pannier line; hooded driver periscopes.
- OPEN from r1: pistol port is a flat dot; loader split hatch minimal; no rear
  bustle bin; exhaust cowls + idler tension arms + spare links still missing
  from the rear plate; sleeve step + recoil housing collar on the 17-pdr thin.
- NEW: (1) Turret faces are still large empty slabs between the fittings — the
  A30's bolted plate seams + rivet rows would carry them. (2) The deck bins
  read as untextured boxes; add lids/latches. (3) Mud flaps at the guard ends
  absent. (4) Reference: quarantine or re-run the seating repair — the splat
  makes every turret metric for this id meaningless. (5) Track guards stop
  short of the idler; extend to cover the front curve as the packet's photos do.

### fv510 — 5/4/4/4/4/4/4 — FAIL (r1 3, +1)
Intact reference. Masks: 76.6 / 78.2 / 45.1 / 100 / 80.2 — lowest overall mask
in the UK family; the procedural is visibly bulkier than the print.
- VERIFIED CLOSED: long thin RARDEN with stepped sleeve + flash hider (r1's #1);
  turret face vision slits (glass); smoke dischargers as two real tube clusters;
  gunner sight hood; roof rails on the troop compartment; front-left corner
  boxes now sit aligned on the fender.
- OPEN from r1: the horizontal-rib appliqué bank across the bow — the Warrior's
  loudest cue — is still absent (smooth camo nose); the big left-side exhaust
  cowl is a small box; rear troop-door frame not readable; layered skirt +
  steps absent (flat side).
- NEW: (1) Turret is ~15% too tall/wide (mask 45.1) — drop the roof line and
  pull the cheeks in; the reference turret is a compact box. (2) Antenna rods
  still rise bare from the deck rear (one base only). (3) The bow needs its
  slat/rib bank as GEOMETRY, not decal — nothing on the nose catches light.
  (4) Add the hull-side stowage bin row (reference carries full-length bins).
  (5) Wheels are plain dark discs — hub caps only; add rubber ring tone split.

## abrams family

### m1a2 — 4/4/4/3/4/5/4 — FAIL (r1 3, +1)
Intact reference (SEPv3 print). Masks: 86.0 / 88.6 / 59.4 / 67.4 / 86.0.
- VERIFIED CLOSED: CITV periscope box with blue glass on the roof; forward
  sight box with glass; three toe lights + tow eyes on the lower glacis;
  louvered IR-suppressed exhaust grille on the rear plate; driver periscope
  trapezoid on the glacis.
- OPEN from r1: CROWS-LP still not a station (no M2/cradle on the roof);
  smoke dischargers remain a painted 3-dot strip (r1 bullet verbatim);
  skirt panel cuts + bolts still missing (flat side slab); bustle rack is a
  solid slab box, not rails + stowage; mantlet remains a rounded blob collar
  without coax port or MRS collar.
- NEW: (1) Turret proportions: the bustle box rides too tall and flat-sided —
  the mask (59.4) and shaded pair both show a brick where the reference sweeps
  low. (2) The AO under the mantlet collar draws a dark "smile" crescent on the
  turret face — rework the intersection. (3) The tall rear antenna mast carries
  a floating plate head — replace with the proper sensor tee or delete.
  (4) Wheels/sprocket still invisible under the skirt shadow — cut the skirt
  bottom line higher at the sprocket. (5) Two-tone panel read from the
  reference (darker skirt vs hull) absent — one camo everywhere.

### m1a1 — 4/4/4/5/4/6/4 — FAIL (r1 3, +1)
Intact reference (tejas-skin print). Masks: 89.3 / 91.0 / 79.7 / 78.5 / 90.3.
- VERIFIED CLOSED: commander's station now has an M2 with cradle + mount
  (r1's #1); bustle rack rails hold khaki stowage volumes; 2x3 smoke discharger
  studs per cheek are geometry; mantlet is a shaped wedge with a coax-side
  plate; splash strip + glacis vents; track shows end connectors.
- OPEN from r1: loader's skate-rail MG still absent (left hatch bare); MRS
  muzzle collar faint; blow-off panel etch lines absent; skirt panel cuts
  still missing (one seam); rear infantry phone box absent; headlight pods
  absent.
- NEW: (1) Discharger studs are half-buried — raise the tubes so they read at
  10 m. (2) The M2 station's shield plates are paper-thin from the side; give
  the cradle mass. (3) Bustle rack corners open at the rear right (rail stops
  short of the turret corner). (4) Hatch rings lack periscope fences.
  (5) Skirt lead panel should cut diagonally (reference does) — currently
  square.

### m1a1ha — 4/4/4/5/4/6/4 — FAIL (r1 3, +1)
Same build as m1a1 (externally identical per packet — same reference print,
identical masks 89.3/91.0/79.7/78.5/90.3). Every m1a1 bullet applies verbatim.
No differentiation needed; it inherits every m1a1 gap too.

### m1a1_aim — 4/4/4/5/4/4/4 — FAIL (r1 1, +3)
**The r1 catastrophic no-turret regression is FIXED** — the procedural now
renders the full m1a1 build (station, rack, mantlet, gun) and articulates.
The floating mid-hull plate is gone. Reference remains TURRETLESS (turret mask
20.3, overall 74.8 — meaningless; flagged in the brief, confirmed on board).
- Judged on its own quality = m1a1's list verbatim (same build).
- SP held at 4: nothing can be verified against a turretless print beyond hull
  masks (hull 83.x band on board).
- NEW: (1) Quarantine or repair the m1a1_aim reference GLB — round 3 cannot
  gate this id otherwise. (2..5) as m1a1.

### m1a2_sepv2 — 4/4/4/3/4/4/4 — FAIL (r1 2, +2)
Intact, busy reference. Masks: 76.5 / 83.5 / 54.9 / 72.6 / 79.0.
- VERIFIED CLOSED: the grey box floating beside the mantlet is GONE (hero +
  articulation clean); CROWS II is now a pedestal + housing + barrel instead of
  a cube-on-a-pole; discharger studs; toe tow eyes.
- OPEN from r1: the core proportion bullet — roof still ~15% too tall with
  slab-vertical front face (mask 54.9); mantlet block bare (no coax/canvas);
  skirt cuts absent; bustle rails empty vs reference's packed racks; rear
  exhaust + taillight detail thin.
- NEW: (1) A small L-bracket/rod cluster hovers just right of the gun root at
  some angles — verify attachment to the mantlet top or delete. (2) The CROWS
  mast is still 2x too tall and skeletal vs the reference's compact station.
  (3) Antenna farm absent (reference carries 3+ masts with bases). (4) Front
  slope decal placement drifts onto the driver's periscope hump. (5) Wheel row
  fully hidden — same skirt-bottom cut fix as m1a2.

### m1a2_tusk — 5/4/5/4/5/6/5 — FAIL (r1 3, +2)
Intact reference. Masks: 87.4 / 87.1 / 73.4 / 84.7 / 85.6. Best abrams this
round — the only r1 "variant kit attempt" and it kept its lead.
- VERIFIED CLOSED: ARAT skirt array re-scaled from six giant bricks to a
  two-course row of many small tiles (upper course angled); bustle rack corners
  closed with stowage inside; loader's station has a shielded box mount (LAGS
  attempt); CROWS improved to a housing + barrel head; rear-quarter rail
  framing suggests the slat cage.
- OPEN from r1: TUSK belly-armor lip under the toe absent; tank-infantry phone
  box absent; mantlet still a square block (no coax/MRS); ARAT tiles share the
  hull camo (reference tiles read as separate steel tone); glacis headlight
  pods absent.
- NEW: (1) ARAT upper course tiles float 2–3 cm off the lower course at the
  panel joints — close the seam line. (2) LAGS shield is a slab with a window;
  needs the wing plates + M240 barrel. (3) The rear slat cage reads as two thin
  rails — needs the visible slat comb over the exhaust quarter. (4) Sprocket
  ring/hub discs still invisible under the skirt cut. (5) Tile field should
  stop at the sponson step — it currently runs under the fender line.

### m1a2_tejas — 4/4/4/5/4/6/4 — FAIL (r1 3, +1)
Intact reference (this id's own tejas print). Masks: 89.1 / 91.0 / 79.8 /
78.5 / 90.3.
- VERIFIED CLOSED: r1's differentiation bullet — tejas now mounts a CROWS-style
  sensor/RWS head (box + lens + barrel) where m1a1/ha carry the open M2
  station; camo tone set differs; the three ids no longer read as one tank
  from the roof.
- OPEN from r1: everything inherited from the m1a1 base list (dischargers
  shallow, skirt cuts, loader MG, headlights, MRS).
- NEW: (1) The CROWS head sits directly on the hatch ring — needs its pedestal
  riser. (2..5) as m1a1.

### abramsx — 4/4/5/4/5/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 88.8 / 80.9 / 61.2 / 70.6 / 92.5.
- VERIFIED CLOSED: XM914 RWS is now a gun mount (receiver + barrel with brake +
  sensor sub-box) instead of stacked slabs; nose splitter undercut present as a
  dark wedge; hybrid-drive louver panels on the rear deck + full-width rear
  grille; skirt carries a dark upper stripe (two-tone); corner plates attach.
- OPEN from r1: cheek corner sensor pods absent (plain bevels); XM360 muzzle is
  a notched step, not the angular shroud + pepperpot; antennas still bare rods
  (one base); driver periscope hump faint.
- NEW: (1) Turret reads ~20% too small/low vs the print's chunky sensor-cheeked
  wedge (mask 61.2) — widen the cheeks with the faceted pods. (2) RWS barrel
  clips through its own sensor box at some yaw angles — offset the cradle.
  (3) The skirt's angular front cutout from the reference is missing (straight
  edge). (4) Rear grille louvres are flat-shaded — needs slat depth. (5) The
  bustle rail frame skims the deck at 3/4 rear — raise clearance or brace it.

## russia family

### t90a — 3/3/3/3/4/5/3 — FAIL (r1 3, 0)
Intact reference. Masks: 85.9 / 85.7 / 71.8 / 88.7 / 81.7. Did not move: the
r1 identity bullets are still open.
- VERIFIED CLOSED: bore-evacuator/sleeve swell exists mid-tube; unditching log
  at the hull rear; dark glacis applique patches; snorkel stowed at turret rear.
- OPEN from r1: **Shtora dazzler "eyes" still absent** (one faint pad, no lens
  faces) — THE T-90A cue, named in r1 and the packet; K-5 clamshell still has
  no volume (flat pads lying on the dome vs the reference's two-course wedge
  boxes); NSVT still a stub; ESSA housing absent; wheels still black shadow
  discs (no ribs/hubs readable); **the rust track stripe still leaks above the
  skirt line** (orange band on the skirt bottom through turntable rows 5–8).
- NEW: (1) Build the K-5 wedges as boxes with end plates — everything else
  waits on this. (2) Shtora eyes with red-brown lens material flanking the
  mantlet. (3) Clamp the track material above the fender line (r1 bullet,
  still visible). (4) Lift wheels out of shadow: lighten hull-side AO or thin
  the sponson drop — the reference shows six ribbed wheels, the procedural
  shows none. (5) Glacis splash V-board + tow hooks still missing.

### t62mv1 — 4/4/4/4/4/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 86.2 / 84.8 / 56.3 / 80.8 / 85.4.
- VERIFIED CLOSED: ERA moved off the dome midline to front-cheek brick arcs
  (2 courses) + partial glacis pads (r1's #1); the tilted roof drum is gone —
  snorkel stowed flat at the deck rear; KTD-2 rangefinder box above the
  mantlet; DShK pintle MG on the cupola; cheek paint dots replaced by geometry.
- OPEN from r1: U-5TS bore evacuator still not at its 2/3-to-muzzle position
  (root sleeve only); starfish wheels unreadable (dark discs, spacing gap after
  wheel 1 unverifiable); skirts are flat plates, not ribbed rubber; fender
  stowage rows + rear fuel drum rack + unditching log still missing.
- NEW: (1) Dome is too tall/hemispherical — the T-62 pan is flatter with a
  wider ring (mask 56.3). (2) Brick pads share the hull tone — darken to steel.
  (3) Loader's DShK needs its ammo drum + cradle (bare gun now). (4) Glacis
  raft: the pads are paper-flat; give the bricks height. (5) Rear plate: OPVT
  brackets for the stowed snorkel (it lies loose).

### t90a_vladimir — 4/4/3/3/4/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 82.3 / 83.4 / **51.0** / 84.5 / 79.4.
- VERIFIED CLOSED: commander's roof cluster exists (panoramic drum + met mast +
  boxes + rear bin — r1's #1, partially); dark K-5 raft panel on the glacis;
  dark forward skirt panels; deck rear bins.
- OPEN from r1: Shtora eyes still unreadable (small flat pads); K-5 cheek
  plates are single thin fins, not two-course cassettes with end caps; bore
  evacuator absent (root sleeve only); wheels shadow-hidden.
- NEW: (1) **The red streak artifact survives** — a thin red thread hangs from
  the right cheek to the deck (r1 flagged it under the gun root; it moved, it
  didn't die). Find the leaking texture edge. (2) The sprocket ring renders
  bright rust-orange and pops against the olive hull — clamp the track-tone
  mask at the sprocket. (3) Roof cluster is ~50% of the reference's density —
  add the sight's armored doors + cable runs. (4) Turret mask 51 comes from the
  bustle: reference carries a full-width stowage wall, procedural a shallow
  box. (5) Fin-plates on the left cheek cast paper-thin shadows — thicken.

### t64bv1 — 4/4/3/4/4/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 83.4 / 80.3 / 68.2 / 74.6 / 84.9.
- VERIFIED CLOSED: K-1 bricks on the front cheeks + glacis corner rafts (dark
  tone!); NSVT-ish MG at the cupola; snorkel drum racked at the turret rear;
  toe plate details.
- OPEN from r1: the T-64 running-gear identity (6 SMALL dual wheels + 4 visible
  return rollers) still unreadable — generic dark wheels in shadow; 2A46-2
  evacuator absent, root collar still over-thick; hull-rear log brackets
  missing; rear-deck louvers + left exhaust port missing; turret rear basket
  minimal.
- NEW: (1) A single-file line of ERA bricks marches diagonally up OVER the dome
  crest — no K-1 layout does this; pull the strip back to the cheek arc.
  (2) Brick pads need steel tone (hull-colored now). (3) The glacis rafts stop
  short of the bow center — close the vee. (4) Small wheels: even if masked in
  shadow, the sprocket/idler diameter ratio reads T-72; shrink wheel radius +
  show the roller row. (5) Gun mask 74.6: the root collar's diameter exceeds
  the mantlet housing — taper it.

### pt91m — 4/4/3/4/4/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 83.0 / 84.9 / 58.5 / 91.5 / 78.5.
- VERIFIED CLOSED: met mast now rises to a credible height with a head fitting
  (r1 cue); ERAWA tile pads on the cheeks + glacis strip; rear bustle box has
  depth; raised powerpack hump on the deck; NSVT at the cupola.
- OPEN from r1: tile FIELD still sparse (a few pads, not the regular coverage);
  chevron wedge stacks at cheek corners absent; twin rear fuel drums absent;
  skirts flat (no segmented rubber + tile front course); commander sight
  minimal; wheels shadow-hidden.
- NEW: (1) The basket is a closed slab box — the reference's wrap-around mesh
  basket with jerrycans is the Malaysian fit's look; at minimum etch the mesh.
  (2) Tiles need their own darker material + gap seams. (3) Met mast needs its
  sensor cross (bare rod + knob now). (4) Deck hump lacks the louver rows the
  packet calls out. (5) Tracks 78.5: bottom run floats above the ground line at
  the idler — settle the sag.

### t72b_1987 — 4/4/3/3/4/5/3 — FAIL (r1 3, 0)
Intact reference. Masks: 82.5 / 85.5 / 68.6 / 91.3 / 81.4. Moved least in the
family — the Super Dolly identity bullets are still open.
- VERIFIED CLOSED: brick pads sit on the front cheeks (off the midline); NSVT
  pintle gun at the cupola; snorkel stowed at deck rear; glacis corner strips.
- OPEN from r1: the bulged cheeks carry ONE brick row, not the 3-course K-1
  RAFTS that give the variant its name; 902 smoke launcher bank absent from
  the left cheek (reference shows the full cluster); Luna IR spotlight absent;
  2A46M evacuator absent; ribbed wheels unreadable; splash V-board absent;
  fender boxes + rear fuel drums absent; skirt joints faint.
- NEW: (1) Stack the cheek bricks 3 courses deep with visible gap seams — the
  single row reads as trim. (2) The log now sits at the deck rear-right but
  without brackets (r1 wanted hull-rear brackets — half done). (3) Bricks are
  hull-toned; darken. (4) The dome still reads tall vs the reference's low
  pan (mask 68.6). (5) 902 bank: six tubes on a frame, left cheek — single
  highest-value add for this id.

### t72b3m — 4/4/4/4/4/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 82.8 / 89.3 / **51.2** / 76.7 / 84.0.
- VERIFIED CLOSED: two-course standing cassette wedges wrap both cheeks (the
  family's best ERA read, kept + closed up from r1); sprocket teeth visible at
  the front idler; NSVT with mount; deck strips; dark skirt fronts.
- OPEN from r1: Sosna-U housing still wrong — a small box ON the roof crest
  instead of the tall armored housing RIGHT of the gun with split doors (r1
  sized it 2x); soft-bag skirt rows absent (flat plates); rear slat screens
  over the engine quarter absent; evacuator absent; bustle basket empty frame.
- NEW: (1) Sosna-U: move to the gun's right shoulder and double its size — the
  B3M's whole face reads wrong without it (turret mask 51.2). (2) Cassette end
  caps: the wedge rows end open at the cheek corners. (3) Skirt bags: even two
  sagging rows would set the variant apart from t72b_1987 — currently the two
  ids differ only in cheek kit. (4) Wheels: ribs/hubs still unreadable in
  shadow. (5) Rear deck: louvers + exhaust stub missing.

### t72bu — 4/4/3/3/4/4/3 — FAIL (r1 2, +1)
Intact reference (T-90 pattern print). Masks: 84.9 / 80.6 / **31.7** / 100 /
83.8. Worst turret mask in the family.
- VERIFIED CLOSED: the r1 "radial turbine fin" K-5 skirt is gone — replaced by
  two-course angled plates on the cheek fronts; small pads flank the mantlet
  (Shtora attempt); NSVT + roof boxes + met mast; snorkel + tan bin at rear.
- OPEN from r1: the mantlet-flanking pads don't read as Shtora dazzlers (no
  boxes, no lens tone) — the packet's headline cue; glacis K-5 chevron raft
  still missing (thin strips); wheels shadow-hidden; rear fuel drums absent.
- NEW: (1) Turret mask 31.7: the procedural dome + wedge kit is smaller and
  set further back than the print's K-5-clad dome — re-fit the ERA arc to the
  dome's front 60° and widen the silhouette. (2) Same cassette-kit-as-K-5
  approximation as t72b3m — this id needs the clamshell look (two big wedge
  faces meeting at the gun). (3) Shtora: give the eyes their boxes. (4) The
  glacis is the barest in the family — raft + splash board. (5) Skirt front
  flaps (rubber, drooping) absent.

### t90sm — 4/4/3/5/4/5/4 — FAIL (r1 3, +1)
Intact reference. Masks: 84.8 / 83.5 / 74.2 / 82.6 / 80.8.
- VERIFIED CLOSED: **the cast dome is gone — the turret is now a faceted welded
  box with flat cheek panels + a full-width squared bustle** (r1's fundamental
  construction bullet, the family's biggest single fix); UDP RWS kept its brown
  tone break and now carries a gun; Relikt-style flat cassettes on the cheeks;
  roof boxes + masts.
- OPEN from r1: panoramic commander sight tower (tall, forward-right) still
  missing; bustle rear face lacks its slat/grille texture; top stowage boxes
  sparse; evacuator absent; skirt hard-panel fronts + bag rears not
  differentiated; wheels shadow-hidden.
- NEW: (1) The bustle joins the turret with an open horizontal gap at some yaw
  angles — close the seam. (2) Cheek cassettes need seam lines (single flat
  plates now). (3) The RWS brown tone break should extend to the bustle mesh +
  skirts (r1 asked; still only the RWS). (4) Panoramic tower: the print's
  tallest roof landmark — absent. (5) Track sag + ribbed wheels as the rest of
  the family.

## soviet-heavy family

### is7 — 3/4/5/4/4/7/4 — FAIL (r1 3, +1)
Intact reference. Masks: 89.7 / 89.9 / 80.8 / 95.9 / 92.7.
- VERIFIED CLOSED: mantlet is a cast saddle that stays seated through the
  depression range (r1's dark-slot bug gone); twin-KPVT AA mount with cradle on
  the rear roof; lifting boss rings on the dome; rear-deck louver bank; track
  top run has real links + end connectors (tracks 92.7).
- OPEN from r1: dome fittings besides the KPVT still missing (no twin hatch
  rings with lids, no periscope pods); MG ports flanking the mantlet absent;
  pike weld seams absent; fender bins absent (bare strips); headlights still
  dots; wheels' faces still swallowed by shadow (rims only); twin round rear
  exhaust ports not readable (dark insets only).
- NEW: (1) The saddle lacks the reference's bolt-bump ring — its most visible
  turret feature at garage distance. (2) A raised chevron plaque sits on the
  pike center — no IS-7 carries it; delete or flatten to a weld seam. (3) A
  thin rod lies diagonally on the right pike face without ends — attach as a
  tow-cable run with shackles or remove. (4) Hatch rings: two discs would
  transform the naked dome. (5) Track sag on the side runs (r1, still absent).

### is3 — 4/4/4/4/4/7/4 — FAIL (r1 3, +1)
Intact reference. Masks: 90.8 / 92.9 / 78.9 / 88.2 / 85.9.
- VERIFIED CLOSED: cast saddle mantlet hugging the dome (collar gap gone);
  DShK AA on a pintle at the dome rear with cradle; lifting eye; pike periscope
  hood; track links + connectors.
- OPEN from r1: **D-25T double-baffle muzzle brake still absent** — the tube
  ends in a faint step; r1 called this alone identity-breaking and it still is.
  Commander cupola ring + twin oval hatches absent; 4 external fuel tanks on
  the rear sponsons absent; smoke canisters absent; V-hump louvered engine
  deck still a flat wedge; fender boxes absent; wheels in shadow.
- NEW: (1) The muzzle brake: two flat baffle discs + center bore, 20 minutes of
  geometry, closes the tank's #1 cue. (2) The DShK floats high on a thin post —
  drop it onto a cupola ring base. (3) Pike weld seams (r1) still absent.
  (4) Grab rails on the dome sides (reference shows them clearly). (5) The
  deck rear carries two generic boxes where the fuel tank quartet belongs.

### object279 — 4/4/4/4/5/7/4 — FAIL (r1 3, +1)
Intact reference. Masks: 92.9 / 92.5 / 85.2 / 90.8 / 93.2 — best masks in the
fleet.
- VERIFIED CLOSED: elliptical shield hull with rivet seam rows kept + extended;
  saddle cheeks at the gun root; lifting eyes; hatch stub.
- OPEN from r1: **the four-track gimmick is still unreadable from the front**
  (reads as a normal 2-track stance — r1's core bullet); M-65 multi-slot
  muzzle brake absent (bare tube); IR spotlight by the mantlet absent;
  handrails absent; bow driver hatch/periscope minimal; rear shield exhaust
  ports still decal-dark.
- NEW: (1) Separate the twin track beams with a visible daylight gap + inner
  track pair per side — even a dark channel with a divider rib would sell it.
  (2) Muzzle: the slim multi-slot brake. (3) The dome needs its twin hatch
  rings + periscope pods (bare casting now). (4) Track outer runs: add link
  facets on the curve (smooth band over the idlers). (5) Shield plate joints:
  extend rivet rows to the lower shield seam.

### is3_bergman — 4/4/4/3/4/5/4 — FAIL (r1 2, +2)
**Reference repair VERIFIED** — the print now shows a seated IS-3 (dome, DShK,
stow tube). Gun mask 54.5 suggests the print's barrel is still short/stubby;
turret 69.5 semi-meaningful. Masks: 88.2 / 93.1 / 69.5 / 54.5 / 87.1.
- VERIFIED CLOSED: turret sits proud on a visible ring collar (was flush-lid);
  the two half-pipe snorkel cylinders are seated on the deck (were floating);
  pike rivet seams; periscope hoods.
- OPEN from r1: the dome is still a flat truncated pan, not the squat
  semi-hemisphere (r1's #1 — the ring landed, the dome didn't); D-25T brake
  absent; cupola ring + twin hatches + DShK ring mount absent; 4 external fuel
  tanks absent; fender boxes absent; wheels in the sponson shadow void.
- NEW: (1) Raise the dome crest ~15% and pull the profile spherical — next to
  the repaired reference the pan shape is the read-killer. (2) Muzzle brake as
  is3. (3) The deck cylinders need their mounting brackets (they sit loose on
  the plate). (4) Bow tow hooks still absent from the pike toes. (5) Gun mask
  54.5: confirm the reference barrel state before trusting any gun number.

### kv2 — 6/5/7/6/5/7/5 — FAIL (r1 3, +2) — best in fleet
Intact, outstanding reference. Masks: 92.3 / 92.5 / 85.3 / 89.3 / 87.8.
- VERIFIED CLOSED: the boxed mantlet recess is GONE — round bolted mantlet DISC
  with concentric rings + bolt ring, howitzer seated in an inner sleeve (r1's
  #1, executed well); rivet rows along every turret plate seam; roof hatch +
  ventilator stubs; spoked road wheels with hub detail + sprocket ring + track
  guide horns (fleet-best running gear); fender planks; two-tone track.
- OPEN from r1: side vision slits + rear turret MG ball absent (faces carry
  rivets + "2" but no fittings); tow cables over the glacis absent (reference's
  signature clutter); fender gussets faint (thin strip, not 3 triangular
  supports); headlight + horn absent; engine-deck mesh intake squares absent;
  twin rear exhaust pipes unverified from the pair (rear deck plain in
  turntable).
- NEW: (1) The turret roof reads empty next to the reference's two full hatch
  rings — add the rings + periscope pods. (2) The hull side rivet rows stop at
  the fender line; continue along the pannier seam. (3) The gun's recoil sleeve
  should step twice (single cylinder now). (4) Track gunmetal could darken 15%
  — currently dusty tan dominates. (5) Bow driver visor + hull MG ball still
  missing (two small fittings would finish the face).

### is6b — 4/4/4/4/4/7/4 — FAIL (r1 2, +2)
Intact reference. Masks: 92.0 / 92.5 / 87.8 / 85.2 / 92.0.
- VERIFIED CLOSED: the egg dome now stands on its visible cylindrical ring
  collar (r1 cue); hatch disc + lifting eye + faint seam dots; driver periscope
  hoods on the bow crest; chunky front mudguard aprons; an external stowage/
  fuel cylinder on the rear sponson; saddle mantlet stays seated at
  depression.
- OPEN from r1: D-30 compact muzzle brake still absent (plain tube tip);
  commander cupola + DShK ring + periscope pods absent (dome otherwise bare);
  fender stowage boxes absent; rear-deck louver rows faint; wheels in shadow;
  headlights still painted dots.
- NEW: (1) Muzzle brake as is3 — same 20-minute fix, same identity payoff.
  (2) One sponson cylinder exists; the packet wants the paired external tanks —
  add the second + straps. (3) The dome's seam dots trace no plausible casting
  parting line — re-route as a single equatorial seam. (4) Bow tow hooks
  absent. (5) Rear plate: idler adjusters + smoke canister rack absent.

## merkava family (NEW this round — no r1 baseline)

Family pattern (all eight): hulls are the strength — long-nose glacis creases,
side louver grilles, deep skirts, front drive sprockets with teeth, khaki roof
stowage, draped side cables (3-series), ball-and-chain curtain attempts. The
shared failure is the TURRET: every variant mounts a slab-sided wedge with a
huge square gun-mount box swallowing the gun root, smoke dischargers modeled as
a "comb" strip sitting ON the roof crest instead of the cheek, and a bustle
"basket" built from khaki boxes + a brown drawer-cabinet slab stack that reads
as office furniture. Turret masks run 26–66 against intact references.

### merkava4 — 5/4/5/3/5/4/4 — FAIL
Masks: 82.1 (board headline 77.9) / hull 80.0 / **turret 50.8** / gun 100 /
tracks 87.6. Reference intact (arlassar print; packet notes its yaw defect —
quarter-view IoU losses not counted against the procedural).
- GOOD: ball-and-chain curtain exists behind the bustle (grid + hanging balls,
  visible at 180° articulation); front engine intake hump with louver grille on
  the glacis right; smoke discharger tube row on the cheek (correct side!);
  skirt panel seams + bolt row; front sprocket teeth.
- OPEN/NEW: (1) The turret is a tall rectangular pillbox — the Mk.4's low
  diving wedge with the angled gun-mount cheek is absent; the giant square
  mantlet box around the gun root is the single worst shape in the family
  (mask 50.8). (2) Trophy APS slabs: the cheek sides are plain angled plates —
  no slab outline, no launcher wedge. (3) Roof: no commander panoramic sight;
  the RWS-ish MG mount is generic. (4) Bustle: replace the drawer-cabinet
  stack with the rail basket + tarp roll the print carries. (5) No loader's
  hatch is CORRECT for Mk.4 — keep that; but the roof needs its sight bumps
  (packet: 2.27–2.38 bumps) which are currently boxes floating proud.

### merkava4b — 4/4/5/3/5/5/4 — FAIL
Masks: 87.7 / 82.1 / **51.2** / 86.3 / 85.7. Reference intact.
- GOOD: pintle MG at the cupola; RWS box + sight boxes with dark lenses; deep
  skirts; sprocket teeth; hull cable.
- OPEN/NEW: (1) Same pillbox turret + giant mount box as merkava4 (mask 51.2).
  (2) **The discharger comb sits ON the roof crest, teeth-up** — move to the
  left cheek slope, tubes angled out. (3) Trophy slabs absent (this variant's
  defining kit). (4) Bustle furniture as merkava4. (5) The rear rail bar skims
  the deck surface at 3/4 rear — raise or bracket it.

### merkava1b — 4/4/6/4/5/5/4 — FAIL
Masks: 89.7 / 91.9 / 59.4 / 88.0 / 89.4. Reference intact.
- GOOD: best merkava running gear — 6 wheels WITH lightening holes + front
  sprocket teeth + return rollers visible (no skirts on the rear half matches
  the Mk.1's exposed gear); low wedge turret is the closest in the family to
  its reference's proportions; side louver grille.
- OPEN/NEW: (1) Bustle drawer-cabinet + box stack again — the Mk.1B wants the
  simple pipe-frame basket + chain curtain (chains faint here). (2) Discharger
  comb on the roof again. (3) Antennas rise from the HULL deck rear — Merkava
  masts sit on the turret bustle corners. (4) The turret cheeks are clean
  slabs — the Mk.1's cast texture + lifting lugs absent. (5) Bow needs its
  headlight pair in guards (dark port only now).

### merkava2b — 4/4/4/2/4/4/3 — FAIL — worst merkava
Masks: 90.0 / 80.6 / **26.1** / 89.2 / 91.7. Reference intact.
- GOOD: hull nose creases; louver grille; full-depth skirts (Mk.2B improved
  skirts per packet); sprocket teeth.
- OPEN/NEW: (1) Turret mask 26.1 — the worst turret parity in the entire fleet:
  the procedural wedge sits visibly aft + taller than the print's small compact
  turret (packet: sculpt centered +0.45 forward — the procedural did not take
  the shift). Re-seat the ring forward and drop the roof. (2) Giant mount box +
  roof comb as the family. (3) The print shows wheels through skirt scallops;
  procedural skirts are straight-bottom slabs hiding everything — cut the
  scallops. (4) Bustle furniture. (5) The bow port hole (dark circle, inner
  ring) reads as a cannon bore — replace with the driver periscope strip.

### merkava2d — 4/4/4/3/4/5/4 — FAIL
Masks: 89.5 / 90.3 / **52.9** / 90.7 / 89.6. Reference intact.
- GOOD: extra roof sight boxes with lenses differentiate the 2D fit; hull as
  2b; chain curtain visible at 180°.
- OPEN/NEW: (1) Same aft/tall turret as 2b (mask 52.9). (2) A thin standing
  plate pokes up beside the gun-mount box on the roof right — attach it to the
  mount or delete (reads as a loose shim at ±90°). (3) Roof mortar position
  (2D cue) not represented. (4) Skirt scallops as 2b. (5) Drawer-cabinet
  bustle as the family.

### merkava3b — 4/4/5/3/5/5/4 — FAIL
Masks: 88.7 / 88.8 / 56.9 / 86.8 / 87.3. Reference intact.
- GOOD: tow cable draped along the hull side with cleats; two sponson louver
  grilles; deep skirts; wedge cheeks angle better than the 4-series.
- OPEN/NEW: (1) The Mk.3's busy roof (commander cupola, panoramic, twin MG
  pintles) is two boxes + a comb — the print's roof is the tank's identity at
  garage range (mask 56.9). (2) Giant mount box as family. (3) Comb ON the
  roof again. (4) Bustle furniture. (5) Skirt bottoms dead straight — the
  print's skirts scallop over the return rollers.

### merkava3c — 4/4/5/4/5/5/4 — FAIL
Masks: 89.0 / 86.7 / 65.7 / 86.1 / 88.4. Reference intact. Best merkava turret
mask.
- GOOD: lower, cleaner wedge with cheek louver vents; smaller mount box than
  the family norm; cable + grilles + skirts as 3b.
- OPEN/NEW: (1) Roof comb again (move to cheek). (2) Roof kit still two boxes
  short of the print (cupola + panoramic). (3) Bustle furniture. (4) Skirt
  scallops. (5) The cheek vent louvers are a nice instinct — but they belong on
  the hull sponson, not the turret cheek; verify against the print before
  round 3 copies it family-wide.

### merkava3d — 4/4/5/3/5/5/4 — FAIL
Masks: 89.4 / 88.3 / 58.2 / 89.3 / 88.8. Reference intact.
- GOOD: as 3b (cable, grilles, skirts, sprocket).
- OPEN/NEW: (1) The 3D's chin-wedge turret (Dor Dalet cast cheeks) reads as the
  same slab wedge as 3b — no variant differentiation on the turret at all.
  (2) Comb on roof. (3) Mount box. (4) Bustle furniture. (5) Straight skirts
  vs the print's scalloped line.

---

## Where to start for round 3 (highest visual leverage, in order)

1. **Turret rebuilds where the mask says "different tank":** the patton shared
   egg (m26/m45/m46/m47, masks 49–60 — one new casting with cupola/loader/
   bustle fixes four tanks), the merkava slab-pillbox + giant gun-mount box
   (eight tanks, masks 26–66), merkava2b/2d ring placement, chieftain5 cast
   Mk.5 dome (41.9), fv510 turret volume (45.1), sepv2 roof drop, t72bu ERA
   arc re-fit (31.7).
2. **Kill the new artifact class before it spreads:** chieftain teeth-mouth,
   centurion bead necklace, merkava roof combs + drawer cabinets, m45 deck
   void + hovering muffler, vladimir red streak, is7 pike chevron plaque.
3. **Soviet muzzle devices + 2A46 evacuators:** is3/is3_bergman/is6b/object279
   brakes and the russia family's mid-tube evacuator swell — small geometry,
   headline identity, called since r1.
4. **Get wheels out of the shadow void** (russia + merkava + soviet-heavy):
   lighten the sponson AO / raise skirt bottoms / cut scallops, then add the
   bolt-ring + rib detail pass (kv2 and challenger_cruiser prove the pipeline
   can).
5. **Finish the ERA language:** 3-course rafts (t72b_1987), tile fields
   (pt91m), K-5 clamshell volume + Shtora eye boxes (t90a, t72bu,
   t90a_vladimir), steel tone for every brick/cassette/tile.
6. **Materials round 2:** patton tan track → gunmetal + rubber pads; russia
   rust-stripe clamp above the fender line (t90a) + sprocket tone (vladimir);
   camo must stop painting wheel faces (m46/m60a1); tint UK khaki bins toward
   the camo.
7. **Reference repairs:** m1a1_aim (turretless), challenger_cruiser (exploded),
   charioteer/comet/centurion3 (turret aft of ring pit), centurion5 (detached
   barrel on the glacis). Until then their turret/gun masks stay quarantined.
