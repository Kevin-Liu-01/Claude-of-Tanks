# Leopard 2A4 (`leo2a4`) — BASE-21 photo-class packet

**Exact variant modeled:** Leopard 2A4, Bundeswehr, mid-production fit —
the pre-wedge mark: boxy welded turret with VERTICAL faces, EMES-15 hood
at the right cheek roof, PERI R17, loader MG3, 2x8 Wegmann smoke
mortars, full-width slatted bustle rack, flat-panel skirts with heavy
sculpted fore blocks, Rh 120 L/44.

## ORACLE STATE (adjudicated 2026-08-06, BASE-21 starter round)
**NO reference oracle.** MODEL_SOURCE is `procedural` (the bergman
CC-BY-NC-SA print is quarantine-DELISTED behind `SHIP_USERDROP2_NEW =
false` in userdrops2.js and never registers), there is NO ledger row and
tmp-tank-critic refuses the id ("no GLB reference registered").
**FALSE-0 LAW: never run the gate on this id.** The bar is the VISUAL
photo class + published dims + the §B battery + 14-view self-reads
(rendered on the critic's exact view set via tools/tmp-leo-photoclass).

## Corroborated dimensions (photo-class targets)

| Measure | Value | Sources (2+ independent) |
|---|---|---|
| Hull length | 7.72 m | Wikipedia Leopard 2, army-guide |
| Overall length (gun fwd) | 9.67 m | Wikipedia Leopard 2 (L/44 marks), KMW heritage data |
| Width | 3.70 m | Wikipedia Leopard 2 (2A4 row), tanks-encyclopedia |
| Height (turret roof) | 2.48 m | Wikipedia Leopard 2, steelbeasts SBWiki |
| Gun | 120 mm Rh L/44, tube 5.28 m | Rheinmetall L/44 data, Wikipedia |
| Running gear | 7 dual road wheels, rear sprocket, raised idler+sprocket | photos, Wikipedia |

SPEC NOTE (residual, needs a modern2.js true-up — outside this file's
ownership): TANK_SPECS.leo2a4.dims.overallLengthM is 9.97 (an L/55-class
carry-over). The real 2A4 with L/44 is 9.67; the BUILD carries the real
configuration (muzzle +5.82 over the −3.86 tail = 9.68).

## r1 REBUILD (2026-08-06) — owner directive: base-game customs are
## "wholly ancient"; leopard-lane starter round

Old build (modern2.js buildLeo2A4): slab-pile hull, parallelogram track
run (§B6 fail), to-the-ground skirt curtain, hand-rolled pintle (census
0), clip 83/436 + shoe 51/14. The new build lives in
src/vehicles/profiles/leopard.js (LEOPARD_PROFILES.leo2a4 — the profile
map overrides MODERN2_BUILDERS because PROFILED_BUILDERS is assigned
last in tankFactory).

### Build inventory (photo class, current rulebook)
- HULL = family V3 rig (`leoHullV3` param delta; same physical hull as
  the a5): deck crease 1.665 -> flat 1.775 engine deck to the −3.78 wall
  (+ lip to −3.86 = published 7.72 with the +3.86 nose); two-slope
  glacis + beak wings (§B1 one raked surface each); §B4 lane opt-ins
  (glacisLaneCut x1.02@3.14, sponsonLaneLift −3.56..−2.82 @1.545 —
  re-derived for THIS deck, the a5 window left 156 shoe vox + 30 band);
  fenders to 2.92; heavy fore skirt blocks at ±1.85 EXACT (width guard
  3.70) + flat rear run at 1.80 + segmented rubber lower lip; fan wells
  (a5 r6 recipe); front mudguard assembly = post + over-track lip (z
  3.91..3.95, PAST the 3.905 idler shoe-orbit far edge) + rubber flap
  (top 0.98); rear mudflaps hung from the fender ends (the kit's
  knee-height plank + floating bracket class deleted); glacis
  spare-track links (FITTINGS, §I dressing); per-tank rubber tone
  0x33352b.
- GEAR: a5-class Leopard 2 geometry — 7 wheels r 0.37 @0.395, idler
  {3.48, 1.11, 0.25}, sprocket {−3.19, 1.09, 0.295}: §B6 trapezoid with
  BOTH ends raised.
- TURRET (pre-wedge boxy welded; §B1.1 both cheeks carry the same
  VERTICAL plan-raked face — vertical IS the real 2A4): mirrored cheek
  slabs (±0.40 slot -> ±1.20 shoulders, winding via the corner-swap
  law), plan-tapering core (±1.20 -> ±1.10 at the bustle), slot bay
  (back wall + brow + chin + dark cheek walls), ring plinth (§B2 slit
  closure, yaws with the mass), EMES-15 hood + lid + RECESSED
  aperture/glass (a proud first cut read as a floating billboard), PERI
  R17 stalk+head (top 2.79 = the spike budget), hatch rings + periscope
  ring, loader MG3 = FITTINGS.pintleMG mag/two-tone (§B3 census),
  crosswind mast, twin whips, 2x4 Wegmann banks per side on mount
  plates, segmented grab rails + lift eyes, full-width slatted bustle
  rack + strapped kit (stowage/jerry/tarp/ammo/spare links), cross
  decals ON the wall planes.
- GUN (§B3.1): trunnion roll + plate mantlet + yoke + collar + coax
  port (`leoMantletGun`), L/44 tube len 4.95 from trunnion world z 0.87
  -> muzzle +5.82 (real 9.67 overall), thermal sleeve segments + clamp
  rings, bore evacuator at 0.56, MRS collar. No prisms on the gun run.

### Close battery (2026-08-06, official rigs)
- track-clip --exact: front 0 / rear 0 band, shoe 0 / 0, blind spots 0
  (better than the frozen a5/a6, which carry standing §B4-queue shoe
  findings).
- tank-standard-check: clip ✓, contig 0 ✓ (a −3.72 deck first cut left
  a 6 cm enclosed slot to the tail lip — fixed by running the deck to
  the wall plane), decor mg1+1d ✓.
- turret-parent: stranded 0 / abutting 0 / dangling 0.
- §B5 yaw-90 pair: shots/leo-a4-r1/after2-yaw90 — the whole turret
  (box, EMES, PERI, MG fitting, whips, mast, smoke banks, rack + kit)
  yaws as one mass.
- npm test: 166 + track-geometry PASS.
- Geometry record hash (NOT a freeze — no graduation without a dual
  gate): 5dd00289 (41 meshes / 83624 verts).

### 14-view SELF-READS (photo class; builder reads, not critic verdicts;
### views = the critic rig exactly, shots/leo-a4-r1/after2)
front 8.6 / frontleft 8.7 / left 8.7 / rearleft 8.6 / rear 8.6 /
rearright 8.6 / right 8.7 / frontright 8.7 / top 8.8 / hero-fl 8.7 /
hero-rr 8.6 / hero-toptilt 8.8 / close-front 8.5 / close-roof 8.8.
Weakest named reads: close-front mantlet/trunnion zone reads slightly
bare vs the photo class (candidate: coax port tell + mantlet lifting
lugs); the slot bezel sits a touch deep-set; fan wells read as drawn
rings at grazing top angles (the known a5 r5 class, already on the
fanWell recipe).

### §H.4 distinctness (six built marks, strip:
### shots/leo-family-h4/six-marks-strip.png)
a4 = BOXY VERTICAL turret + EMES hood + flat skirts + L/44;
a5 = low wedge appliqué + sculpted skirt blocks;
a6 = wedge + LONG L/55 + pale-rim wheels;
a7v = 4.0-wide deep modular skirts + forward wedge + sensor farm +
L/55A1; revolution = faceted AMAP wedge + panel courses + SEOSS/RWS;
kf51 = Panther hull/turret + big RWS + coil dressing. Any pair
separable at a glance.

### Residuals / next-round candidates
- Spec overallLengthM 9.97 -> 9.67 true-up (modern2.js, orchestrator
  lane; icons/garage cards read spec dims).
- close-front mantlet-zone dressing (coax collar tell, lug pair).
- p95 spike census: PERI 2.79 + MG cap ~2.70 + mast 2.74 + whips ~2.76
  + EMES 2.64 — five roof carriers above the 2.48 roof; all real
  fittings on the real vehicle, but if this id ever gains an oracle the
  whip tops may need the fold-down treatment (a6 precedent).
- NO ORACLE: §E re-source lane stays open for a clean-license 2A4 print
  (the bergman NC-SA stays quarantined).

### Law discoveries banked for the BASE-21 no-oracle lane (NEW flow)
1. PHOTO-CLASS FLOW: with no oracle, the working loop is
   tmp-leo-photoclass (proc-only renders on the critic's EXACT 14-view
   rig + yaw pose) + the §B machine battery + published-dims
   self-anchoring. The critic tool itself refuses no-GLB ids — the
   proc-only rig is the missing instrument, now in tools/.
2. LANE-EDGE COPLANARITY: §B4 lane opt-ins (glacisLaneCut/x0/x1/
   rearWallHW) must sit 0.03 INBOARD of the track inner face — exact
   coplanarity voxelizes as clip (378/184 on the a7v first cut; the
   family's 1.02-vs-1.05 values are the same rule).
3. SHOE-ORBIT ARITHMETIC: the player-visible shoe orbit = wheel r +
   trackTh/2 + 0.012 + 0.073 (≈ r + 0.175(idler) / +0.175(sprocket
   with its own r)); every bow/stern cover plate derives its z-plane
   from THIS radius, not the band radius (the a5's certified 0.88 flap
   top decodes as exactly 0.02 under the shoe arc, not the band arc).
4. DECK-TO-LIP CONTIGUITY: the deck polyline must END on the rear-wall
   plane — any gap to the lip overhang is an enclosed §B2 pocket over
   the sprocket bay (16 cells at ±1.25 on the first cut).

## ORACLE REFUSED (2026-08-06 base-21 wave — the §E re-source line stays OPEN)
The wave's dropped `leopard_2a4_otco.glb` ("Leopard 2A4 OTCO" by
Jeyhun1985, embedded CC-BY-4.0) was REFUSED and DELETED (28bf608):
- Live Sketchfab description reads verbatim "Leopard 2A4 OTCO from War
  Thunder." with tag `warthunder`; internal root node
  `Leopard_2_(OTCo).obj...` — a WT extraction (OTCo is the WT variant
  designation).
- ATTRIBUTION.md had ALREADY rejected this exact author+title on
  2026-07-27 ("identical face count to a known WT-extraction upload.
  Ripped game asset — forbidden. Deleted."). The re-drop verified only
  the embedded license — which is exactly what the new §E ORACLE
  PROVENANCE law (BUILD-STANDARD) now forbids trusting alone.
- THE ONE ABSOLUTE RULE refuses rips even as measurement-only oracles
  (the type_89 precedent, same day). No registration was ever written;
  the briefly-recorded false-0 ledger row was dropped.
leo2a4 remains a NO-ORACLE photo-class id; the visual critic stays its
bar. Clean-license candidates for a future drop: 42manako's catalog
(bradley/fv510/puma/t72b3m/challenger_3 all verified) has no 2A4 today;
the leo2a5/leo2_revolution recovered prints remain the nearest family
instruments (family-transfer measurement is NOT sanctioned — influence
only).

## 2026-08-06 FLEET MUZZLE-BORE + §C.1 WINDING SWEEP (fleet-sweep one-liner)
- §B3.1 bore via leoMantletGun (shared with a7v), tube face len-0.02; §C.1 8 reversed re-oriented (leoHullV3 glacis/bow); F-vs-D 131->0; gate no oracle row (render-verified; standard-check contig 0 after the checker law-alignment); hash not frozen; mantlet mass verified per MANTLETS-MANDATORY (db9168c). Mechanism: kit.js muzzleBore shadow-named furniture + orientedSlab guard (3fca39b / 1017339); end-on+quarter crops shots/muzzle-sweep/{before,after}/.
