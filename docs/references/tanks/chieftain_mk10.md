# Chieftain Mk 10 (`chieftain_mk10`) — BASE-21 photo-class packet

**Exact variant modeled:** FV4201 Chieftain Mk 10, BAOR late-1980s fit —
the Stillbrew-armoured Chieftain: Mk 5-family hull and L11A5 120 mm with
the Stillbrew Crew Protection Package on the turret front/cheeks (the
defining "hump"), TOGS thermal sight barbette on the RIGHT of the turret
(per the owner brief; the barbette is the late-fleet fit and replaces the
Mk 5's big left-cheek IR searchlight box), No.15 cupola with the L37
7.62 mm GPMG, side skirts, the classic reclined-driver low hull and the
big raised front idler.

## ORACLE STATE (2026-08-07, base-21 scaffold round)
**NO reference oracle.** MODEL_SOURCE has no glb row, there is no
docs/geometry-gate/chieftain_mk10.json and no ledger row.
**FALSE-0 LAW: never run the geometry gate against this id** — a broken
registration would write a false-0 ledger row and tax every fleet run.
The bar is the VISUAL photo class + published dims + the §B battery +
the §B8.1 proportion gates + 14-view self-shots on the critic rig
(tools/tmp-ww2-photoclass), pending an independent §B8 critic.
Family grammar donor: the `chieftain5` DUAL-GATE GRADUATE (uk.ts, hash
d4f2a9a6) — its ukHull family rig and casting grammar are reused as
SHARED HELPERS ONLY; the graduate's own geometry is untouched and its
hash must hold through this round.

## Identity brief — what makes a Mk 10 not a Mk 5
1. **STILLBREW** (the acid tell): large appliqué armour masses bolted
   over the turret front and cheeks and around the forward ring — the
   clean reclined needle-nose of the Mk 5 becomes a stepped, humped brow
   with near-vertical block faces above the chin; the casting reads
   heavier and taller at the front third.
2. **TOGS barbette** on the RIGHT of the turret: an armoured
   drum/housing with a hooded aperture standing on the right cheek
   (brief-ordered; historically the Mk 11 carried TOGS — the program's
   Mk 10 wears the late-BAOR combined fit, and the Mk 5 graduate's left
   IR searchlight box is DELETED on this build in exchange).
3. **L11A5 with full thermal sleeve** + fume extractor at ~60% + MRS at
   the muzzle + open bore (§B3.1) — no muzzle brake, ever, on an L11.
4. **No.15 cupola LEFT of centre** with the L37 GPMG on the ring
   (§B3 census fitting).
5. Same low reclined hull, 6 paired Horstmann wheels, HIGH rear drive
   sprocket, big raised front idler, 3 return rollers, shallow track
   guards with long fender stowage bins, side skirt band.

## Corroborated dimensions (photo-class targets; spec row = modern3.ts)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.52 m | Wikipedia Chieftain, historyofwar.org Chieftain |
| Overall length (gun fwd) | 10.79 m | Wikipedia Chieftain (10.77–10.79), steelbeasts SBWiki Chieftain |
| Width | 3.66 m (over tracks/skirts; 3.50 hull) | Wikipedia Chieftain, tanks-encyclopedia Chieftain |
| Height | 2.90 m (cupola) | Wikipedia Chieftain, historyofwar.org |
| Gun | L11A5 120 mm rifled, thermal sleeve, fume extractor, MRS, no brake | Royal Armouries L11 data, Wikipedia L11 |
| Running gear | 6 paired road wheels (Horstmann), 3 return rollers, rear drive HIGH, big front idler | photos, chieftain5 packet |
| Combat weight | 55 t | Wikipedia Chieftain (Mk 5 55t; Stillbrew ~+0.5–1 t) |

Spec dims row (modern3.ts TANK_SPECS.chieftain_mk10):
`{ hullLengthM: 7.52, overallLengthM: 10.79, widthM: 3.66, heightM: 2.90 }` —
these are the sovereign four-box anchors. NOTE the widthM difference vs
the chieftain5 spec (3.50): the Mk 10 row carries the over-tracks/skirts
3.66, so THIS build's width anchor is the SKIRT PLANE at ±1.83 EXACT
(§D width-guard: nothing may stand wider).

## §B8.1 PROPORTION GATES — target numbers (checked before detail)
1. **WHEEL EXPOSURE:** skirt hem at 0.79 (wheel-top line — the
   chieftain5 graduate's certified hem parity); wheel band 0.05..0.71
   (r 0.33 @ y 0.38) → all six paired wheels FULLY visible below the
   hem plus raised idler and high sprocket. Left-view render must count
   6 wheels + both end wheels at a glance.
2. **GLACIS PLANE:** ONE reclined plane (the Chieftain identity line):
   beak y 1.205 @ z +3.47 rising to the 1.49 crest @ z +2.16 —
   run ~1.31 m @ ~12°, continuing 1.49 → 1.56 to the mid deck. Bow
   FACE is the thin wing band only (0.75..1.045 tip band, ≤0.3 m tall)
   — no bow cliff. Under-nose noseRake 0.56@2.55 → 0.75@3.47.
3. **TURRET SHAPE LINE:** long LOW cast saucer (crown 2.385–2.56 world,
   falling aft) with the Mk 10 delta: Stillbrew brow blocks raise the
   front-third read to ~2.5 with near-vertical stepped faces over the
   reclined chin; TOGS drum right at ~2.55–2.62; cupola cap 2.90 = the
   heightM p95 anchor. Face height over the 1.56 deck ≈ 0.95.
   Falsifiable line: "saucer + Stillbrew hump + right TOGS drum" — a
   clean Mk 5 needle-nose front is a FAIL for this id.
4. **STRUCTURE-MERGE:** turretMass z-span target ≤ 4.15 m = 55% of
   7.52. Fender bins live in rig_hull on THIS build (no print fusion
   here — the chieftain5 turret-fused fender bins are that oracle's
   certified quirk, not the real configuration).
5. **GEAR PATTERN:** 6 road wheels at 0.88 m pitch (Horstmann pairs
   read near-even on the real vehicle), 3 return rollers at y 0.82,
   front idler RAISED (y 0.62, r 0.30 — the big Chieftain idler at the
   family-proven radius; an r 0.32 cut lifted the return run into the
   belt bottom, §B4), HIGH rear sprocket (y 0.875) → \\________/
   trapezoid both ends (§B6; the family law banked in the chieftain5
   §B6 round).
6. Four-box: overall ≈ 10.79 × 3.66 × 2.90; hull l 7.52 (z ±3.76);
   gun bore y ≈ 1.88; muzzle world +7.03.

## Build plan (uk.ts — builder `chieftainMk10Build`, registry
## UK_PROFILES.chieftain_mk10; overrides modern3 buildChieftain via
## PROFILED_BUILDERS, the same binding chieftain5 uses)
- HULL: family ukHull rig with a Mk 10 param table (MK10_HULL — its own
  object, CHIEFTAIN_HULL untouched): symmetric fenders (the chieftain5
  left-fender asymmetry is print-certified, not real), full glacis
  polyline at the family line, hull z ±3.76 (7.52 published), skirt
  band 6 panels at ±1.83 EXACT with hem 0.79, tracks 0.61 m at
  xc 1.42, big idler y 0.62 r 0.32 / sprocket y 0.875 (§B6), 3 rollers,
  §B4 rakeHalfW inboard of the track channel.
- TURRET: saucer casting (family lathe grammar) + reclined face +
  chin; STILLBREW cheek blocks (raked, §B1 — one raked face each, no
  staircase quantization) + brow block over the collar + ring collar
  armour; TOGS barbette right (drum + hood + dark aperture + glass
  slit + lid); No.15 cupola LEFT with L37 pintleMG (FITTINGS, mag
  class); NBC pack + bustle rack rear; flank bins ON THE CASTING
  (short) — fender bins in hull; 2×6 smoke dischargers low on the
  cheeks; twin antennas kneed at ~2.90; masts/whips inside the p95
  budget.
- GUN: L11A5 — cast collar stack at the mantletless chin (§B3.1
  MANTLET = the Chieftain's collar casting emerging from the chin,
  grammar per the graduate), thermal sleeve segments + clamp rings
  (buildGun sleeve), fume extractor drum ~60%, MRS collar, muzzleBore
  (§B3.1 shadow-named). muzzle +7.03 → overall 10.79 EXACT.
- DENSITY (§B3.2): tow cables ×2 (glacis + rear deck), fender bins
  loaded, jerry cans, spare track links, headlights + guards, lifting
  eyes, stowage + tarp rolls in the bustle rack, side-number decals on
  real planes.
- Tones: ukToneKit (family recipe — chieftain5 does NOT call it; its
  own frozen tones live in CHIEFTAIN_HULL) + russia-lineage gear tones
  via ukHull padHex/chainHex/gearFloor params.

## r1 SCAFFOLD BUILD (2026-08-07) — first real build of the id, DELIVERED-PENDING-CRITIC

Builder: `chieftainMk10Build` + `MK10_HULL` (src/vehicles/profiles/uk.ts),
registered `UK_PROFILES.chieftain_mk10` — overrides the modern3 generic
via PROFILED_BUILDERS. Geometry hash **59551064** (42 meshes / 73473
verts), stable ×2. Graduate hold: **chieftain5 d4f2a9a6 (41/94065)
byte-identical before AND after the round, ×2 runs** — only new code
paths were added (zero shared-helper edits; ukHull/segBoxZ/towCableUK/
ukToneKit consumed with per-call params only).

### Four-box (OFFICIAL tmp-b8-batch probe, shots/base21-scaffold/b8/measures.json)
- overall **10.770 × 3.662 × 2.916** (y-top **2.900 EXACT** = the cupola
  cap anchor; the h field carries the fleet-standard ~1.6 cm
  below-ground shoe dip) vs spec 10.79/3.66/2.90 → −0.2% / +0.05% / ✓
- hull l **7.520 EXACT** (z ±3.76 — wing tips fwd, exhaust faces aft)
- turretMass l **4.113 = 54.7% of hull** (under the §B8.1-4 ~55% alarm;
  the long low casting is the Chieftain identity — fender bins were
  parented to rig_hull, the REAL configuration, unlike the chieftain5
  print's certified turret-fused bins)
- muzzle world **+7.03** (overall-by-muzzle 10.79 EXACT), bore y
  **1.88**; gun box w 0.414 (collar stack)
- WIDTH ANCHOR: widest faces = skirt lift-handle plates + number decals
  at **±1.8305** (panel plane 1.8155) = the published 3.66 (§D law:
  nothing stands wider than the anchor).

### §B8.1 self-probe vs targets
1. wheel exposure — skirt hem 0.79 over the 0.05..0.71 wheel band: six
   paired wheels + raised idler + high sprocket all read in view-left ✓
2. glacis — one reclined plane 1.205@3.47 → 1.49@2.16 (~12.5°), bow
   face = the thin W3 tip band ✓ no cliff
3. turret line — saucer crown 2.385 + Stillbrew brow to 2.50 +
   TOGS drum right to ~2.62 + cupola 2.90 ✓
4. structure-merge 54.7% ✓  5. gear pattern §B6 trapezoid ✓ (idler
   y 0.62 / sprocket y 0.875, audit-proven)

### Battery (official rigs, final bytes)
- track-clip --exact: **0/0 band + 0/0 shoe** (first cut carried 14
  front vox: the r 0.32 idler lifted the return run into the 1.02 belt
  bottom + the bay backdrops kissed the band inner face — both fixed,
  idler r → 0.30, backdrops → x 1.08 / z ±2.40)
- winding-audit: m1 **rev 0 / mix 0 / deficit 0 px**; m2 **0 candidate
  px** (first cut flagged 339 px: the fender tarp/jerry sat at 1.90+
  under the turret flank-bin yaw sweep — a REAL §B5-class clash, kit
  re-seated to the 1.86 lid line, jerry deleted)
- turret-parent: **stranded 0 / abutting 0 / dangling 0**
- standard-check: NO gate row (FALSE-0 law — id must never gate),
  clip ✓, **contig 0** ✓, decor **mg1+1d** ✓ (L37 pintleMG fitting +
  glacis spareTrackLinks)
- §B5 yaw-90 pair: shots/base21-scaffold/mk10-final{,-yaw90}/ — the
  whole casting (saucer + Stillbrew + TOGS + flank bins + bustle +
  whips + gun) yaws as ONE mass; fender bins/deck kit static
- npm test: 166 + track-geometry PASS

### 14-view SELF-READS (builder reads, NOT an acceptance bar — §B8;
### views = the critic rig, shots/base21-scaffold/mk10-final/)
front 8.3 / frontleft 8.4 / left 8.5 / rearleft 8.2 / rear 8.1 /
rearright 8.2 / right 8.5 / frontright 8.4 / top 8.4 / hero-fl 8.4 /
hero-rr 8.2 / hero-toptilt 8.3 / close-front 8.4 / close-roof 8.3.
Weakest named reads: view-rear turret rear (NBC pack + rack wall reads
plain — candidate: chain-link curtain / camo-net roll); the bow wing
shelf line reads slightly proud at hero angles (real Chieftain fender
wings do stand proud — verify against photos at critic range); the
Stillbrew-to-saucer join could carry a bolt-strip course (§B3 detail
candidate).

### Residuals / next-round candidates
- Overall box l 10.77 vs 10.79: the tube FACE ends at +7.01 (buildGun
  len−0.02) while rig_muzzle carries the 7.03 anchor — 2 cm class,
  document-only.
- TOGS barbette is brief-ordered (historically the Mk 11 fit); if the
  owner ever orders strict-Mk 10, delete TOGS + restore the left IR
  searchlight box (the chieftain5 grammar carries it).
- Independent §B8 photo-parity critic verdict PENDING (builder
  self-reads are not the bar).
